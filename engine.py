"""
Stellura analytics engine (DuckDB)
==================================
Holds big tables on this PC (in a temp database file, not in browser memory) and answers
paged / sorted / filtered row requests, column profiles, group-bys and read-only SQL.

Design rules
- Everything is stored as text (VARCHAR), exactly as in the file, so Hindi text, leading zeros
  and phone numbers are never altered. Numeric work uses TRY_CAST on the fly.
- DuckDB itself is not allowed to touch the file system or network (enable_external_access
  is false); files are read in Python (pyarrow / openpyxl) and handed over as Arrow tables.
- The SQL endpoint accepts a single SELECT statement only.
"""
import csv
import io
import codecs
import math
import os
import shutil
import tempfile
import threading
import uuid
from collections import OrderedDict
from datetime import date, datetime

import duckdb
import pyarrow as pa
import pyarrow.csv as pacsv
import pyarrow.parquet as pq

MAX_DATASETS = int(os.environ.get("STELLURA_MAX_DATASETS", 6))
MAX_QUERY_ROWS = 10_000
MAX_PAGE = 2_000
NUM = "TRY_CAST(replace(replace({c}, ',', ''), ' ', '') AS DOUBLE)"


class EngineError(ValueError):
    """A problem with the request that the user can understand."""


def _col(i):
    return f"c{int(i)}"


def _num(i):
    return NUM.format(c=_col(i))


def _clean(v):
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.date().isoformat() if (v.hour, v.minute, v.second) == (0, 0, 0) else v.isoformat(sep=" ")
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, float) and v == int(v) and abs(v) < 1e15:
        return str(int(v))
    return str(v)


def json_safe(o):
    """Replace NaN / Infinity (not valid JSON) with None, recursively."""
    if isinstance(o, float):
        return o if math.isfinite(o) else None
    if isinstance(o, dict):
        return {k: json_safe(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [json_safe(v) for v in o]
    return o


def unique_headers(raw):
    """Same rules as the app: blank -> 'Column N', duplicates get a numeric suffix."""
    out, seen = [], {}
    for i, h in enumerate(raw):
        h = "" if h is None else str(h).strip()
        h = h or f"Column {i + 1}"
        if h in seen:
            seen[h] += 1
            h = f"{h}_{seen[h]}"
        else:
            seen[h] = 0
        out.append(h)
    return out


class Engine:
    def __init__(self, memory_limit=None):
        self.dir = tempfile.mkdtemp(prefix="stellura_engine_")
        self.lock = threading.RLock()
        self.db = duckdb.connect(
            os.path.join(self.dir, "engine.duckdb"),
            config={
                "enable_external_access": False,
                "memory_limit": memory_limit or os.environ.get("STELLURA_ENGINE_MEMORY", "1500MB"),
                "temp_directory": os.path.join(self.dir, "spill"),
            },
        )
        self.datasets = OrderedDict()   # id -> {"table", "headers", "name", "rows"}

    # ------------------------------------------------------------------ loading
    def _register(self, arrow_table, headers, name):
        """Store an Arrow table of strings as dataset; returns its description."""
        n = len(headers)
        arrow_table = arrow_table.rename_columns([_col(i) for i in range(n)])
        ds_id = uuid.uuid4().hex[:12]
        table = f"d_{ds_id}"
        with self.lock:
            cur = self.db.cursor()
            cur.register("incoming", arrow_table)
            cur.execute(
                f"CREATE TABLE {table} AS SELECT (row_number() OVER ()) - 1 AS __rid, * FROM incoming"
            )
            cur.unregister("incoming")
            rows = cur.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
            self.datasets[ds_id] = {"table": table, "headers": headers, "name": name, "rows": rows}
            while len(self.datasets) > MAX_DATASETS:
                _, old = self.datasets.popitem(last=False)
                cur.execute(f"DROP TABLE IF EXISTS {old['table']}")
        return self.describe(ds_id)

    def describe(self, ds_id):
        d = self._ds(ds_id)
        return {"id": ds_id, "name": d["name"], "headers": d["headers"], "rows": d["rows"]}

    def _ds(self, ds_id):
        with self.lock:
            d = self.datasets.get(ds_id)
            if d is None:
                raise EngineError("This dataset is no longer loaded. Open the file again.")
            self.datasets.move_to_end(ds_id)
            return d

    def load_rows(self, headers, rows, name="data"):
        """From a list of rows (e.g. data already in the browser)."""
        headers = unique_headers(headers)
        n = len(headers)
        cols = [[] for _ in range(n)]
        for r in rows:
            for i in range(n):
                cols[i].append(_clean(r[i]) if i < len(r) else "")
        arrow = pa.table({f"x{i}": pa.array(c, type=pa.string()) for i, c in enumerate(cols)})
        return self._register(arrow, headers, name)

    def load_csv(self, path, name="data"):
        with open(path, "rb") as f:
            head = f.read(65536)
        # a 64 KB read can cut a multi-byte character in half, so decode incrementally
        try:
            codecs.getincrementaldecoder("utf-8-sig")().decode(head, final=False)
            enc, pa_enc = "utf-8-sig", "utf8"
        except UnicodeDecodeError:
            enc, pa_enc = "cp1252", "latin1"
        sample = head.decode(enc, errors="replace")
        try:
            delim = csv.Sniffer().sniff(sample.split("\n", 5)[0] + "\n", delimiters=",\t;|").delimiter
        except csv.Error:
            delim = ","
        first = next(csv.reader(io.StringIO(sample), delimiter=delim), [])
        if not first:
            raise EngineError("The file is empty.")
        raw_names = [f"x{i}" for i in range(len(first))]
        headers = unique_headers(first)
        # the file's own header row becomes data? no: skip it and use our names
        table = pacsv.read_csv(
            path,
            read_options=pacsv.ReadOptions(column_names=raw_names, skip_rows=1, encoding=pa_enc, block_size=1 << 24),
            parse_options=pacsv.ParseOptions(delimiter=delim, invalid_row_handler=lambda row: "skip"),
            convert_options=pacsv.ConvertOptions(
                column_types={n: pa.string() for n in raw_names}, strings_can_be_null=False
            ),
        )
        return self._register(table, headers, name)

    def load_xlsx(self, path, sheet=None, name="data"):
        import openpyxl

        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        try:
            names = wb.sheetnames
            ws = wb[sheet] if sheet and sheet in names else wb[names[0]]
            it = ws.iter_rows(values_only=True)
            first = next(it, None)
            if first is None:
                raise EngineError("The sheet is empty.")
            headers = unique_headers(first)
            n = len(headers)
            batches, buf = [], [[] for _ in range(n)]

            def flush():
                if buf[0] or any(buf):
                    batches.append(pa.record_batch([pa.array(c, type=pa.string()) for c in buf],
                                                   names=[f"x{i}" for i in range(n)]))
                    for c in buf:
                        c.clear()

            for r in it:
                if r is None or all(v is None or v == "" for v in r):
                    continue
                for i in range(n):
                    buf[i].append(_clean(r[i]) if i < len(r) else "")
                if len(buf[0]) >= 100_000:
                    flush()
            flush()
            table = pa.Table.from_batches(batches) if batches else pa.table(
                {f"x{i}": pa.array([], type=pa.string()) for i in range(n)})
            result = self._register(table, headers, name)
            result["sheets"] = names
            return result
        finally:
            wb.close()

    def load_parquet(self, path, name="data"):
        t = pq.read_table(path)
        headers = unique_headers(t.column_names)
        t = pa.table({f"x{i}": t.column(i).cast(pa.string()) for i in range(t.num_columns)})
        return self._register(t, headers, name)

    def drop(self, ds_id):
        with self.lock:
            d = self.datasets.pop(ds_id, None)
            if d:
                self.db.cursor().execute(f"DROP TABLE IF EXISTS {d['table']}")
        return d is not None

    # ------------------------------------------------------------------ queries
    def _check_col(self, d, i):
        try:
            i = int(i)
        except (TypeError, ValueError):
            raise EngineError("Invalid column.")
        if not 0 <= i < len(d["headers"]):
            raise EngineError("Column does not exist.")
        return i

    def _where(self, d, search=None, filters=None):
        parts, params = [], []
        n = len(d["headers"])
        if search:
            ors = []
            for i in range(n):
                ors.append(f"contains(lower({_col(i)}), lower(?))")
                params.append(search)
            parts.append("(" + " OR ".join(ors) + ")")
        for f in filters or []:
            i = self._check_col(d, f.get("col"))
            op, v, v2 = f.get("op"), f.get("value"), f.get("value2")
            c = _col(i)
            if op == "eq":
                parts.append(f"{c} = ?"); params.append(str(v))
            elif op == "neq":
                parts.append(f"{c} <> ?"); params.append(str(v))
            elif op == "contains":
                parts.append(f"contains(lower({c}), lower(?))"); params.append(str(v))
            elif op == "in":
                vals = [str(x) for x in (v or [])][:5000]
                if not vals:
                    parts.append("FALSE")
                else:
                    parts.append(f"{c} IN ({','.join('?' * len(vals))})"); params += vals
            elif op in ("gt", "gte", "lt", "lte"):
                sym = {"gt": ">", "gte": ">=", "lt": "<", "lte": "<="}[op]
                parts.append(f"{_num(i)} {sym} ?"); params.append(float(v))
            elif op == "between":
                parts.append(f"{_num(i)} BETWEEN ? AND ?"); params += [float(v), float(v2)]
            elif op == "empty":
                parts.append(f"({c} IS NULL OR trim({c}) = '')")
            elif op == "notempty":
                parts.append(f"({c} IS NOT NULL AND trim({c}) <> '')")
            else:
                raise EngineError(f"Unknown filter '{op}'.")
        return (" WHERE " + " AND ".join(parts)) if parts else "", params

    def rows(self, ds_id, offset=0, limit=100, sort=None, desc=False, numeric=False,
             search=None, filters=None, count=False):
        d = self._ds(ds_id)
        limit = max(1, min(int(limit), MAX_PAGE))
        offset = max(0, int(offset))
        where, params = self._where(d, search, filters)
        order = "__rid"
        if sort is not None and sort != "":
            i = self._check_col(d, sort)
            key = _num(i) if numeric else _col(i)
            order = f"{key} {'DESC' if desc else 'ASC'} NULLS LAST, __rid"
        cols = ", ".join(_col(i) for i in range(len(d["headers"])))
        cur = self.db.cursor()
        data = cur.execute(
            f"SELECT __rid, {cols} FROM {d['table']}{where} ORDER BY {order} LIMIT {limit} OFFSET {offset}",
            params).fetchall()
        out = {"rows": [list(r[1:]) for r in data], "ids": [r[0] for r in data], "offset": offset}
        if count:
            out["matched"] = cur.execute(f"SELECT count(*) FROM {d['table']}{where}", params).fetchone()[0]
        out["total"] = d["rows"]
        return out

    def profile(self, ds_id, max_cols=80):
        d = self._ds(ds_id)
        n = min(len(d["headers"]), max_cols)
        sel = []
        for i in range(n):
            c = _col(i)
            sel += [
                f"count(*) FILTER (WHERE {c} IS NULL OR trim({c}) = '')",
                f"approx_count_distinct({c})",
                f"count({_num(i)})",
                f"min({_num(i)})", f"max({_num(i)})", f"avg({_num(i)})", f"sum({_num(i)})",
                # codes such as phone numbers or file numbers keep leading zeros: they are text, not quantities
                f"count(*) FILTER (WHERE regexp_matches({c}, '^0[0-9]+$'))",
            ]
        cur = self.db.cursor()
        r = cur.execute(f"SELECT {', '.join(sel)} FROM {d['table']}").fetchone()
        total = d["rows"]
        cols = []
        for i in range(n):
            empty, distinct, numcount, mn, mx, avg, sm, lead0 = r[i * 8:(i + 1) * 8]
            filled = total - empty
            is_num = filled > 0 and numcount / filled >= 0.9 and lead0 / filled < 0.5
            cols.append({
                "index": i, "name": d["headers"][i],
                "type": "number" if is_num else ("categorical" if distinct <= max(20, total * 0.05) else "text"),
                "empty": empty, "filled": filled, "distinct": distinct,
                "min": mn if is_num else None, "max": mx if is_num else None,
                "avg": avg if is_num else None, "sum": sm if is_num else None,
            })
        return {"rows": total, "columns": cols}

    def top_values(self, ds_id, col, limit=10):
        d = self._ds(ds_id)
        c = _col(self._check_col(d, col))
        data = self.db.cursor().execute(
            f"SELECT {c}, count(*) n FROM {d['table']} WHERE {c} IS NOT NULL AND trim({c}) <> '' "
            f"GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT {max(1, min(int(limit), 200))}").fetchall()
        return [{"value": v, "count": n} for v, n in data]

    AGG = {
        "sum": "sum({n})", "avg": "avg({n})", "min": "min({n})", "max": "max({n})",
        "median": "median({n})", "count": "count(*)", "count_distinct": "count(DISTINCT {c})",
    }

    def aggregate(self, ds_id, group_by, aggs, order_desc=True, limit=500, search=None, filters=None):
        d = self._ds(ds_id)
        gcols = [self._check_col(d, g) for g in (group_by or [])][:2]
        if not aggs:
            aggs = [{"fn": "count"}]
        exprs, names = [], []
        for k, a in enumerate(aggs[:8]):
            fn = a.get("fn")
            if fn not in self.AGG:
                raise EngineError(f"Unknown function '{fn}'.")
            if fn == "count":
                exprs.append("count(*)"); names.append("Count")
            else:
                i = self._check_col(d, a.get("col"))
                exprs.append(self.AGG[fn].format(n=_num(i), c=_col(i)))
                names.append(f"{fn} of {d['headers'][i]}")
        where, params = self._where(d, search, filters)
        sel = [_col(g) for g in gcols] + [f"{e} AS a{k}" for k, e in enumerate(exprs)]
        grp = f" GROUP BY {', '.join(str(j + 1) for j in range(len(gcols)))}" if gcols else ""
        order = f" ORDER BY a0 {'DESC' if order_desc else 'ASC'} NULLS LAST" if gcols else ""
        limit = max(1, min(int(limit), 5000))
        data = self.db.cursor().execute(
            f"SELECT {', '.join(sel)} FROM {d['table']}{where}{grp}{order} LIMIT {limit}", params).fetchall()
        return {"headers": [d["headers"][g] for g in gcols] + names,
                "rows": [[("" if v is None else v) for v in r] for r in data]}

    def query(self, ds_id, sql):
        """Read-only SQL over a view called `data` whose columns carry the real header names."""
        d = self._ds(ds_id)
        cur = self.db.cursor()
        try:
            stmts = cur.extract_statements(sql)
        except Exception as exc:
            raise EngineError(f"SQL error: {exc}")
        if len(stmts) != 1 or stmts[0].type != duckdb.StatementType.SELECT:
            raise EngineError("Only a single SELECT statement is allowed.")
        sel = ", ".join(f'{_col(i)} AS "{h.replace(chr(34), chr(34) * 2)}"' for i, h in enumerate(d["headers"]))
        cur.execute(f"CREATE OR REPLACE TEMP VIEW data AS SELECT {sel} FROM {d['table']}")
        try:
            res = cur.execute(f"SELECT * FROM ({sql.rstrip().rstrip(';')}) LIMIT {MAX_QUERY_ROWS + 1}")
            names = [c[0] for c in res.description]
            data = res.fetchall()
        except Exception as exc:
            raise EngineError(f"SQL error: {exc}")
        return {"headers": names, "rows": [["" if v is None else v for v in r] for r in data[:MAX_QUERY_ROWS]],
                "truncated": len(data) > MAX_QUERY_ROWS}

    # ------------------------------------------------------------------ export
    def to_arrow(self, ds_id, search=None, filters=None, sort=None, desc=False, numeric=False, limit=None):
        d = self._ds(ds_id)
        where, params = self._where(d, search, filters)
        order = "__rid"
        if sort not in (None, ""):
            i = self._check_col(d, sort)
            order = f"{_num(i) if numeric else _col(i)} {'DESC' if desc else 'ASC'} NULLS LAST, __rid"
        cols = ", ".join(f'{_col(i)}' for i in range(len(d["headers"])))
        lim = f" LIMIT {int(limit)}" if limit else ""
        sql = f"SELECT {cols} FROM {d['table']}{where} ORDER BY {order}{lim}"
        cur = self.db.cursor()
        rel = cur.sql(sql, params=params)
        # duckdb 1.4+ calls it to_arrow_table; older releases fetch_arrow_table
        t = rel.to_arrow_table() if hasattr(rel, "to_arrow_table") else rel.fetch_arrow_table()
        return t.rename_columns(d["headers"])

    def close(self):
        try:
            self.db.close()
        finally:
            shutil.rmtree(self.dir, ignore_errors=True)


_engine = None
_engine_lock = threading.Lock()


def get_engine():
    global _engine
    with _engine_lock:
        if _engine is None:
            _engine = Engine()
        return _engine
