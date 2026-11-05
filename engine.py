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
                self._drop_tables(cur, old)
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
                self._drop_tables(self.db.cursor(), d)
        return d is not None

    @staticmethod
    def _drop_tables(cur, d):
        for name in list((d.get("date_dims") or {}).values()) + [d["table"]]:
            cur.execute(f"DROP TABLE IF EXISTS {name}")

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
            elif op == "ieq":                 # same text ignoring capitals and spaces around it (what charts group by)
                parts.append(f"lower(trim({c})) = lower(trim(?))"); params.append(str(v))
            elif op == "iin":                 # any of several texts, ignoring capitals (several bars of one chart)
                vals = [str(x).strip().lower() for x in (v or [])][:5000]
                if not vals:
                    parts.append("FALSE")
                else:
                    parts.append(f"lower(trim({c})) IN ({','.join('?' * len(vals))})"); params += vals
            elif op == "bucket":              # a day / month / quarter / financial year / year / weekday of a date column (one or several)
                mode, keys = str(v), (v2 if isinstance(v2, list) else [v2])
                dd = self._date_dim(d, i)
                if mode == "weekday":
                    keys = [str(k) for k in keys][:7]
                    parts.append(f"{c} IN (SELECT v FROM {dd} WHERE strftime(xd, '%a') IN ({','.join('?' * len(keys))}))"); params += keys
                else:
                    spans = [self._bucket_range(mode, str(k)) for k in keys][:400]
                    ors = " OR ".join("(xd >= CAST(? AS DATE) AND xd < CAST(? AS DATE))" for _ in spans) or "FALSE"
                    parts.append(f"{c} IN (SELECT v FROM {dd} WHERE {ors})")
                    for lo, hi in spans:
                        params += [lo, hi]
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


    # ------------------------------------------------------------------ charts
    # Everything below answers a chart from the whole table inside DuckDB and returns only a small result
    # (a few hundred groups, bins, quartiles or a sample of points), so a chart of 5 million rows is as light as one of 500.
    DATE_FORMATS = ["%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d", "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y", "%m-%d-%Y", "%m/%d/%Y", "%m.%d.%Y"]
    TIME_MODES = ("day", "month", "quarter", "fy", "year", "weekday")
    OTHERS = "(others)"

    @classmethod
    def _date_expr(cls, c):
        """Text -> DATE the way the browser reads dates: day first (15-02-2025), then month first only if day first is impossible."""
        txt = f"regexp_extract(translate({c}, '०१२३४५६७८९', '0123456789'), '^[0-9]{{1,4}}[-/.][0-9]{{1,2}}[-/.][0-9]{{1,4}}')"
        return "CAST(coalesce(" + ", ".join(f"try_strptime({txt}, '{f}')" for f in cls.DATE_FORMATS) + ") AS DATE)"

    def _date_dim(self, d, i):
        """A small table of every different text in a date column and the date it means. Dates repeat a lot (a few
        thousand days in millions of rows), so each text is read once, not once per row. Cached for the dataset."""
        with self.lock:
            dims = d.setdefault("date_dims", {})
            if i not in dims:
                name = f"{d['table']}_dd{i}"
                self.db.cursor().execute(
                    f"CREATE TABLE {name} AS SELECT v, {self._date_expr('v')} AS xd "
                    f"FROM (SELECT DISTINCT {_col(i)} AS v FROM {d['table']} WHERE {_col(i)} IS NOT NULL)")
                dims[i] = name
            return dims[i]

    @staticmethod
    def _bucket_label(xd, mode):
        fy = f"(CASE WHEN month({xd}) >= 4 THEN year({xd}) ELSE year({xd}) - 1 END)"
        return {
            "year": f"strftime({xd}, '%Y')",
            "month": f"strftime({xd}, '%Y-%m')",
            "quarter": f"(strftime({xd}, '%Y') || '-Q' || CAST(quarter({xd}) AS VARCHAR))",
            "fy": f"(CAST({fy} AS VARCHAR) || '-' || lpad(CAST(({fy} + 1) % 100 AS VARCHAR), 2, '0'))",
            "weekday": f"strftime({xd}, '%a')",
            "day": f"strftime({xd}, '%Y-%m-%d')",
        }[mode]

    @staticmethod
    def _bucket_range(mode, key):
        """The first day of a period and the first day after it, from its label ('2025-03', '2025-Q2', '2024-25', '2025')."""
        try:
            if mode == "year":
                y = int(key); return date(y, 1, 1).isoformat(), date(y + 1, 1, 1).isoformat()
            if mode == "month":
                y, m = (int(v) for v in key.split("-")); n = date(y + (m == 12), m % 12 + 1, 1)
                return date(y, m, 1).isoformat(), n.isoformat()
            if mode == "quarter":
                y, q = key.split("-Q"); y, q = int(y), int(q); m = 3 * (q - 1) + 1
                n = date(y + (m + 3 > 12), (m + 3 - 1) % 12 + 1, 1)
                return date(y, m, 1).isoformat(), n.isoformat()
            if mode == "fy":
                a = int(key.split("-")[0]); return date(a, 4, 1).isoformat(), date(a + 1, 4, 1).isoformat()
            if mode == "day":
                d0 = date.fromisoformat(key); return d0.isoformat(), date.fromordinal(d0.toordinal() + 1).isoformat()
        except (ValueError, IndexError):
            pass
        raise EngineError("That period is not valid.")

    _FN_SQL = {"sum": "sum({m})", "avg": "avg({m})", "min": "min({m})", "max": "max({m})",
               "median": "median({m})", "count": "count(*)", "distinct": "count(DISTINCT lower({t}))"}

    def _opt_col(self, d, i):
        if i is None or i == "":
            return None
        try:
            if int(i) < 0:
                return None
        except (TypeError, ValueError):
            raise EngineError("Invalid column.")
        return self._check_col(d, i)

    def chart_agg(self, ds_id, x=None, time=None, g=None, g2=None, measures=None, rank="value",
                  max_cats=300, max_groups=9, search=None, filters=None):
        """Group by up to three columns (x, g, g2) with up to six measures. Groups beyond the biggest `max_cats`
        (x) or `max_groups - 1` (g, g2) are folded into '(Others)' and calculated from the real rows, so even an
        average of the leftovers is exact. A date column is cut into day / month / quarter / fy / year / weekday."""
        d = self._ds(ds_id)
        where, params = self._where(d, search, filters)
        xi, gi, g2i = self._opt_col(d, x), self._opt_col(d, g), self._opt_col(d, g2)
        time = time if time in self.TIME_MODES else None
        ms = []
        for m in (measures or [{"col": -1, "fn": "count"}])[:6]:
            fn, ci = m.get("fn", "sum"), self._opt_col(d, m.get("col", -1))
            if fn not in self._FN_SQL:
                raise EngineError(f"Unknown function '{fn}'.")
            ms.append((ci, "count" if ci is None else fn))
        max_cats = max(1, min(int(max_cats), 5000)); max_groups = max(2, min(int(max_groups), 60))

        def text(i):
            c = _col(i)
            return f"CASE WHEN {c} IS NULL OR trim({c}) = '' THEN '(blank)' ELSE trim({c}) END"

        s_cols, k_cols, dims = [], [], []                 # k_cols: key + label of every dimension
        if xi is None:
            s_cols.append("'' AS xl")
        elif time:
            s_cols.append(f"{_col(xi)} AS xraw")
        else:
            s_cols.append(f"{text(xi)} AS xl")
        for n, i in (("g", gi), ("g2", g2i)):
            if i is not None:
                s_cols.append(f"{text(i)} AS {n}l")
        for k, (ci, fn) in enumerate(ms):
            if ci is not None:
                s_cols.append(f"{_num(ci)} AS m{k}")
                if fn == "distinct":
                    s_cols.append(f"trim({_col(ci)}) AS t{k}")
        x_label = self._bucket_label("xd", time) if (xi is not None and time) else "xl"
        k_cols.append(f"{x_label} AS xl")
        k_cols.append("lower(" + x_label + ") AS xk" if not time else f"{x_label} AS xk")
        for n, i in (("g", gi), ("g2", g2i)):
            if i is not None:
                k_cols += [f"{n}l", f"lower({n}l) AS {n}k"]
        for k, (ci, fn) in enumerate(ms):
            if ci is not None:
                k_cols.append(f"m{k}")
                if fn == "distinct":
                    k_cols.append(f"t{k}")
        dd = self._date_dim(d, xi) if (xi is not None and time) else None
        k_from = f"s JOIN {dd} ON s.xraw = {dd}.v WHERE xd IS NOT NULL" if dd else "s"
        agg = [self._FN_SQL[fn].format(m=f"m{k}", t=f"t{k}") for k, (ci, fn) in enumerate(ms)]
        rank_expr = "xk DESC" if rank == "label" else f"abs(coalesce({agg[0]}, 0)) DESC, xk"
        ctes = [f"s AS (SELECT {', '.join(s_cols)} FROM {d['table']}{where})",
                f"k AS (SELECT {', '.join(k_cols)} FROM {k_from})",
                f"tx AS (SELECT xk FROM k GROUP BY xk ORDER BY {rank_expr} LIMIT {max_cats})"]
        fold = [f"CASE WHEN xk IN (SELECT xk FROM tx) THEN xk ELSE '{self.OTHERS}' END AS fx"]
        keys, labels = ["fx"], ["min(xl) AS lx"]
        for n, i in (("g", gi), ("g2", g2i)):
            if i is not None:
                ctes.append(f"t{n} AS (SELECT {n}k FROM k GROUP BY {n}k ORDER BY count(*) DESC, {n}k LIMIT {max_groups - 1})")
                fold.append(f"CASE WHEN {n}k IN (SELECT {n}k FROM t{n}) THEN {n}k ELSE '{self.OTHERS}' END AS f{n}")
                keys.append(f"f{n}"); labels.append(f"min({n}l) AS l{n}")
        sel_agg = ", ".join(f"{a} AS a{k}" for k, a in enumerate(agg))
        extra = ", ".join(c for c in ["xl"] + [f"{n}l" for n, i in (("g", gi), ("g2", g2i)) if i is not None] +
                          [c2 for k, (ci, fn) in enumerate(ms) if ci is not None for c2 in ([f"m{k}"] + ([f"t{k}"] if fn == "distinct" else []))])
        sql = (f"WITH {', '.join(ctes)}, f AS (SELECT {', '.join(fold)}, {extra} FROM k) "
               f"SELECT {', '.join(keys)}, {', '.join(labels)}, {sel_agg} FROM f GROUP BY {', '.join(keys)} LIMIT 20000")
        cur = self.db.cursor()
        try:
            data = cur.execute(sql, params).fetchall()
        except Exception as exc:
            raise EngineError(f"Could not calculate this chart: {exc}")
        nd = len(keys)
        rows = []
        for r in data:
            lab = [self.OTHERS_LABEL if r[j] == self.OTHERS else r[nd + j] for j in range(nd)]
            rows.append(lab + list(r[2 * nd:]))
        matched = cur.execute(f"SELECT count(*) FROM {d['table']}{where}", params).fetchone()[0]
        return {"rows": rows, "matched": matched, "dims": nd, "measures": len(ms), "total": d["rows"]}

    OTHERS_LABEL = "(Others)"

    def chart_hist(self, ds_id, col, bins=0, search=None, filters=None):
        d = self._ds(ds_id)
        i = self._check_col(d, col)
        where, params = self._where(d, search, filters)
        cur = self.db.cursor()
        base = f"SELECT {_num(i)} AS v FROM {d['table']}{where}"
        n, mn, mx, mean, med, sd = cur.execute(
            f"SELECT count(v), min(v), max(v), avg(v), median(v), stddev_pop(v) FROM ({base}) WHERE v IS NOT NULL", params).fetchone()
        out = {"n": n, "min": mn, "max": mx, "mean": mean, "median": med, "sd": sd, "edges": [], "counts": []}
        if not n:
            return out
        k = int(bins) if int(bins or 0) > 1 else max(5, min(40, math.ceil(math.log2(n) + 1)))
        if mn == mx:
            out["edges"], out["counts"] = [mn - 0.5, mx + 0.5], [n]
            return out
        w = (mx - mn) / k
        counts = [0] * k
        for b, c in cur.execute(
                f"SELECT least({k - 1}, CAST(floor((v - ?) / ?) AS INTEGER)) AS b, count(*) FROM ({base}) WHERE v IS NOT NULL GROUP BY 1",
                [mn, w] + params).fetchall():
            counts[int(b)] += c
        out["edges"] = [mn + w * j for j in range(k + 1)]
        out["counts"] = counts
        return out

    def chart_box(self, ds_id, x, col, top=20, search=None, filters=None):
        d = self._ds(ds_id)
        xi, ci = self._check_col(d, x), self._check_col(d, col)
        where, params = self._where(d, search, filters)
        xc = _col(xi)
        top = max(1, min(int(top), 40))
        sql = (f"WITH v AS (SELECT lower(trim({xc})) AS xk, trim({xc}) AS xl, {_num(ci)} AS v FROM {d['table']}{where}), "
               f"v2 AS (SELECT * FROM v WHERE xk <> '' AND v IS NOT NULL), "
               f"tp AS (SELECT xk FROM v2 GROUP BY xk HAVING count(*) >= 3 ORDER BY count(*) DESC, xk LIMIT {top}), "
               f"q AS (SELECT xk, min(xl) AS xl, count(*) AS n, quantile_cont(v, 0.25) AS q1, quantile_cont(v, 0.5) AS q2, quantile_cont(v, 0.75) AS q3 "
               f"      FROM v2 WHERE xk IN (SELECT xk FROM tp) GROUP BY xk) "
               f"SELECT q.xl, q.n, q.q1, q.q2, q.q3, "
               f"  min(v) FILTER (WHERE v >= q.q1 - 1.5 * (q.q3 - q.q1)), max(v) FILTER (WHERE v <= q.q3 + 1.5 * (q.q3 - q.q1)) "
               f"FROM v2 JOIN q USING (xk) GROUP BY q.xk, q.xl, q.n, q.q1, q.q2, q.q3 ORDER BY q.n DESC, q.xk")
        cur = self.db.cursor()
        rows = cur.execute(sql, params).fetchall()
        labels = [r[0] for r in rows]
        stats = [[r[5], r[2], r[3], r[4], r[6]] for r in rows]
        outliers = []
        if rows:
            odd = cur.execute(
                f"WITH v AS (SELECT lower(trim({xc})) AS xk, {_num(ci)} AS v FROM {d['table']}{where}), "
                f"v2 AS (SELECT * FROM v WHERE xk <> '' AND v IS NOT NULL), "
                f"q AS (SELECT xk, quantile_cont(v, 0.25) AS q1, quantile_cont(v, 0.75) AS q3 FROM v2 GROUP BY xk HAVING count(*) >= 3) "
                f"SELECT v2.xk, v FROM v2 JOIN q USING (xk) WHERE v < q1 - 1.5 * (q3 - q1) OR v > q3 + 1.5 * (q3 - q1) "
                f"ORDER BY hash(v2.xk || CAST(v AS VARCHAR)) LIMIT 4000", params).fetchall()
            pos = {lab.strip().lower(): n for n, lab in enumerate(labels)}
            outliers = [[pos[k], v] for k, v in odd if k in pos][:600]
        return {"labels": labels, "stats": stats, "outliers": outliers, "counts": [r[1] for r in rows]}

    def chart_points(self, ds_id, xnum, ynum, size=None, g=None, limit=5000, search=None, filters=None, max_groups=8):
        d = self._ds(ds_id)
        xi, yi = self._check_col(d, xnum), self._check_col(d, ynum)
        zi, gi = self._opt_col(d, size), self._opt_col(d, g)
        where, params = self._where(d, search, filters)
        limit = max(100, min(int(limit), 20000))
        cols = [f"__rid", f"{_num(xi)} AS x", f"{_num(yi)} AS y"]
        if zi is not None:
            cols.append(f"{_num(zi)} AS z")
        if gi is not None:
            cols.append(f"CASE WHEN {_col(gi)} IS NULL OR trim({_col(gi)}) = '' THEN '(blank)' ELSE trim({_col(gi)}) END AS g")
        need = "x IS NOT NULL AND y IS NOT NULL" + (" AND z IS NOT NULL" if zi is not None else "")
        base = f"SELECT {', '.join(cols)} FROM {d['table']}{where}"
        cur = self.db.cursor()
        n, slope, icpt, r, xmin, xmax = cur.execute(
            f"SELECT count(*), regr_slope(y, x), regr_intercept(y, x), corr(y, x), min(x), max(x) FROM ({base}) WHERE {need}", params).fetchone()
        pts = []
        if n:
            gsel = ""
            if gi is not None:
                gsel = (f", CASE WHEN g IN (SELECT g FROM (SELECT g FROM b WHERE {need} GROUP BY g ORDER BY count(*) DESC, g LIMIT {max_groups - 1})) "
                        f"THEN g ELSE '{self.OTHERS_LABEL}' END AS g2")
            order = f"SELECT __rid, x, y{', z' if zi is not None else ''}{gsel} FROM b WHERE {need} ORDER BY hash(__rid) LIMIT {limit}"
            for row in cur.execute(f"WITH b AS ({base}) {order}", params).fetchall():
                pts.append(list(row))
        return {"n": n, "points": pts, "sampled": n > len(pts), "hasSize": zi is not None, "hasGroup": gi is not None,
                "reg": {"slope": slope, "intercept": icpt, "r": r, "n": n, "xmin": xmin, "xmax": xmax} if n >= 3 else None}

    def sample(self, ds_id, n=4000):
        """An evenly random handful of rows (always the same ones) so the browser can tell which columns are
        numbers, dates or categories without loading the file."""
        d = self._ds(ds_id)
        n = max(100, min(int(n), 20000))
        cols = ", ".join(_col(i) for i in range(len(d["headers"])))
        data = self.db.cursor().execute(
            f"SELECT {cols} FROM {d['table']} USING SAMPLE reservoir({n} ROWS) REPEATABLE (42)").fetchall()
        return {"headers": d["headers"], "rows": [["" if v is None else v for v in r] for r in data], "total": d["rows"]}

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
