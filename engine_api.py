"""HTTP API for the analytics engine and project files (see engine.py / projects.py)."""
import io
import os
import tempfile

import pyarrow as pa
from flask import Blueprint, jsonify, request, send_file

import projects
from engine import EngineError, get_engine, json_safe

bp = Blueprint("engine", __name__)

INLINE_ROWS = int(os.environ.get("STELLURA_INLINE_ROWS", 100_000))   # larger tables open in Large File mode
COPY_MAX = 100_000                                                     # rows "Work on a copy" brings into the editor


def _err(exc, code=400):
    return jsonify({"error": str(exc)}), code


@bp.errorhandler(EngineError)
def _engine_error(exc):
    return _err(exc, 400)


@bp.errorhandler(projects.ProjectError)
def _project_error(exc):
    return _err(exc, 400)


def _body():
    return request.get_json(silent=True) or {}


# ----------------------------------------------------------------- loading
@bp.route("/api/engine/load", methods=["POST"])
def load():
    """multipart: file (.csv/.tsv/.xlsx) [+ sheet]   or   JSON: {headers, data}"""
    eng = get_engine()
    if request.files.get("file") is not None:
        f = request.files["file"]
        fname = f.filename or "data"
        low = fname.lower()
        if not low.endswith((".csv", ".tsv", ".txt", ".xlsx")):
            return _err("Large File mode reads .csv, .tsv and .xlsx files.")
        suffix = os.path.splitext(low)[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=eng.dir) as tmp:
            f.save(tmp)
            path = tmp.name
        try:
            name = os.path.splitext(fname)[0]
            if suffix == ".xlsx":
                info = eng.load_xlsx(path, request.form.get("sheet"), name)
            else:
                info = eng.load_csv(path, name)
        finally:
            os.unlink(path)
        return jsonify(info)
    body = _body()
    if not body.get("headers"):
        return _err("Send a file, or headers and data.")
    return jsonify(eng.load_rows(body["headers"], body.get("data", []), body.get("name", "data")))


@bp.route("/api/engine/<ds>/info")
def info(ds):
    """Used by the page to re-attach to a dataset after a refresh."""
    return jsonify(get_engine().describe(ds))


@bp.route("/api/engine/<ds>/copy", methods=["POST"])
def copy_rows(ds):
    """Up to COPY_MAX rows of the current view, for 'Work on a copy' in the normal editor."""
    b = _body()
    eng = get_engine()
    limit = min(int(b.get("limit") or COPY_MAX), COPY_MAX)
    t = eng.to_arrow(ds, b.get("search") or None, b.get("filters"), b.get("sort"),
                     bool(b.get("desc")), bool(b.get("numeric")), limit + 1)
    truncated = t.num_rows > limit
    t = t.slice(0, limit)
    cols = [c.to_pylist() for c in t.columns]
    return jsonify({"headers": t.column_names, "rows": [list(r) for r in zip(*cols)] if cols else [],
                    "truncated": truncated, "limit": limit})


@bp.route("/api/engine/<ds>/link_check", methods=["POST"])
def link_check(ds):
    b = _body()
    return jsonify(get_engine().link_check(ds, b.get("other"), b.get("key"), b.get("otherKey")))


@bp.route("/api/engine/<ds>/link", methods=["POST"])
def link(ds):
    b = _body()
    return jsonify(get_engine().link(ds, b.get("other"), b.get("key"), b.get("otherKey"), b.get("cols"), b.get("how", "left"),
                                     b.get("onRepeat", "blank"), b.get("name")))


@bp.route("/api/engine/<ds>/summarize", methods=["POST"])
def summarize(ds):
    b = _body()
    return jsonify(get_engine().summarize(ds, b.get("key"), b.get("outs"), b.get("name"), b.get("search") or None, b.get("filters")))


@bp.route("/api/engine/<ds>/replace", methods=["POST"])
def replace_value(ds):
    b = _body()
    return jsonify(get_engine().replace_value(ds, b.get("col"), b.get("old"), b.get("new", ""), b.get("name")))


@bp.route("/api/engine/<ds>/words", methods=["POST"])
def words(ds):
    b = _body()
    return jsonify(json_safe(get_engine().word_counts(ds, b.get("col"), b.get("by"), b.get("top", 25), b.get("stand", 12), b.get("ignoreCommon", True),
                                                       b.get("minRows", 30), b.get("search") or None, b.get("filters"))))


@bp.route("/api/engine/<ds>/textstats", methods=["POST"])
def textstats(ds):
    b = _body()
    return jsonify(get_engine().add_text_stats(ds, b.get("col"), b.get("name")))


@bp.route("/api/engine/<ds>/outliers", methods=["POST"])
def outliers(ds):
    b = _body()
    return jsonify(json_safe(get_engine().outliers(ds, b.get("col"), b.get("by"), b.get("k", 3.5), b.get("limit", 40), b.get("minGroup", 8), b.get("search") or None, b.get("filters"))))


@bp.route("/api/engine/<ds>/series", methods=["POST"])
def monthly_series(ds):
    b = _body()
    return jsonify(json_safe(get_engine().monthly_series(ds, b.get("date"), b.get("y"), b.get("fn", "sum"), b.get("search") or None, b.get("filters"))))


@bp.route("/api/engine/<ds>/repeats", methods=["POST"])
def repeats(ds):
    b = _body()
    return jsonify(json_safe(get_engine().repeats(ds, b.get("key"), b.get("check"), b.get("examples", 8), b.get("search") or None, b.get("filters"))))


@bp.route("/api/engine/<ds>/drop", methods=["POST"])
def drop(ds):
    return jsonify({"dropped": get_engine().drop(ds)})


# ----------------------------------------------------------------- reading
@bp.route("/api/engine/<ds>/rows", methods=["POST"])
def rows(ds):
    b = _body()
    return jsonify(get_engine().rows(
        ds, b.get("offset", 0), b.get("limit", 100), b.get("sort"), bool(b.get("desc")),
        bool(b.get("numeric")), b.get("search") or None, b.get("filters"), bool(b.get("count"))))


@bp.route("/api/engine/<ds>/profile")
def profile(ds):
    return jsonify(json_safe(get_engine().profile(ds)))


@bp.route("/api/engine/<ds>/top/<int:col>")
def top(ds, col):
    return jsonify(get_engine().top_values(ds, col, request.args.get("limit", 10)))


@bp.route("/api/engine/<ds>/aggregate", methods=["POST"])
def aggregate(ds):
    b = _body()
    return jsonify(json_safe(get_engine().aggregate(
        ds, b.get("groupBy"), b.get("aggs"), b.get("desc", True), b.get("limit", 500),
        b.get("search") or None, b.get("filters"))))


@bp.route("/api/engine/<ds>/sample", methods=["POST"])
def sample(ds):
    return jsonify(json_safe(get_engine().sample(ds, _body().get("n", 4000))))


@bp.route("/api/engine/<ds>/chart", methods=["POST"])
def chart(ds):
    """Chart data computed over the whole table. body.kind: agg | hist | box | points (+ search, filters)."""
    b, eng = _body(), get_engine()
    kind, s, f = b.get("kind"), b.get("search") or None, b.get("filters")
    if kind == "agg":
        return jsonify(json_safe(eng.chart_agg(ds, b.get("x"), b.get("time"), b.get("g"), b.get("g2"), b.get("measures"),
                                               b.get("rank", "value"), b.get("maxCats", 300), b.get("maxGroups", 9), s, f,
                                               bool(b.get("multi")), bool(b.get("nozero")), b.get("minRows", 0), b.get("xbands"))))
    if kind == "hist":
        return jsonify(json_safe(eng.chart_hist(ds, b.get("col"), b.get("bins", 0), s, f, bool(b.get("nozero")))))
    if kind == "box":
        return jsonify(json_safe(eng.chart_box(ds, b.get("x"), b.get("col"), b.get("top", 20), s, f, bool(b.get("nozero")))))
    if kind == "points":
        return jsonify(json_safe(eng.chart_points(ds, b.get("xnum"), b.get("ynum"), b.get("size"), b.get("g"),
                                                  b.get("limit", 5000), s, f, b.get("maxGroups", 8), bool(b.get("nozero")))))
    if kind == "fair":
        return jsonify(json_safe(eng.fair_cells(ds, b.get("y"), b.get("factor"), b.get("adjusters"), bool(b.get("nozero")), s, f, bands=b.get("bands"), yspec=b.get("yspec"))))
    if kind == "fair_pairs":
        return jsonify(json_safe(eng.fair_pairs(ds, b.get("y"), b.get("pairs"), bool(b.get("nozero")), s, f, b.get("bands"), b.get("yspec"), b.get("sampleRows"))))
    if kind == "pair_grid":
        return jsonify(json_safe(eng.pair_grid(ds, b.get("y"), b.get("pairs"), bool(b.get("nozero")), s, f, b.get("bands"), b.get("yspec"))))
    if kind == "label_sample":
        return jsonify(json_safe(eng.label_sample(ds, b.get("label"), b.get("cols"), b.get("perClass", 1500), b.get("total", 20000), s, f)))
    if kind == "fair_linear":
        return jsonify(json_safe(eng.fair_linear(ds, b.get("y"), b.get("factor"), b.get("catAdj"), b.get("linAdj"), bool(b.get("nozero")), s, f, b.get("ref"), bool(b.get("curve")), b.get("yspec"))))
    if kind == "band_edges":
        return jsonify(json_safe(eng.band_edges(ds, b.get("cols"), b.get("k", 5), s, f)))
    if kind == "values":
        return jsonify(json_safe(eng.column_values(ds, b.get("cols"), b.get("limit", 41), s, f)))
    if kind == "scalar":
        return jsonify(json_safe(eng.scalar(ds, b.get("y"), b.get("fn", "count"), b.get("conds"), s, f)))
    if kind == "column_checks":
        return jsonify(json_safe(eng.column_checks(ds, b.get("formulas"), b.get("caps"), s, f)))
    if kind == "rule_check":
        return jsonify(json_safe(eng.rule_check(ds, b.get("label"), b.get("rules"), b.get("default", ""), s, f)))
    return _err("Unknown chart kind.")


@bp.route("/api/engine/<ds>/query", methods=["POST"])
def query(ds):
    return jsonify(json_safe(get_engine().query(ds, _body().get("sql", ""))))


@bp.route("/api/engine/<ds>/export", methods=["POST"])
def export(ds):
    """Export the current view (search / filters / sort) as CSV or XLSX."""
    b = _body()
    eng = get_engine()
    limit = b.get("limit")
    table = eng.to_arrow(ds, b.get("search") or None, b.get("filters"), b.get("sort"),
                         bool(b.get("desc")), bool(b.get("numeric")), limit)
    name = eng.describe(ds)["name"] or "data"
    fmt = (b.get("format") or "csv").lower()
    if fmt == "csv":
        import pyarrow.csv as pacsv
        buf = io.BytesIO()
        buf.write(b"\xef\xbb\xbf")                        # BOM so Excel shows Hindi correctly
        pacsv.write_csv(table, buf)
        buf.seek(0)
        return send_file(buf, mimetype="text/csv", as_attachment=True, download_name=f"{name}.csv")
    if fmt == "xlsx":
        if table.num_rows > 1_048_575:
            return _err("Excel can hold at most 1,048,575 rows. Filter the data first, or export CSV.")
        import openpyxl
        wb = openpyxl.Workbook(write_only=True)
        ws = wb.create_sheet("Data")
        ws.append(table.column_names)
        cols = [c.to_pylist() for c in table.columns]
        for r in zip(*cols):
            ws.append(list(r))
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        return send_file(buf, as_attachment=True, download_name=f"{name}.xlsx",
                         mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    return _err("Format must be csv or xlsx.")


# ----------------------------------------------------------------- projects
@bp.route("/api/project/list")
def project_list():
    return jsonify({"projects": projects.list_projects(), "folder": str(projects.projects_dir())})


@bp.route("/api/project/save", methods=["POST"])
def project_save():
    """JSON {name, state, dataset}  (table already in the engine)  or  {name, state, headers, data}."""
    b = _body()
    eng = get_engine()
    if b.get("dataset"):
        table = eng.to_arrow(b["dataset"])
    elif b.get("headers") is not None:
        info = eng.load_rows(b["headers"], b.get("data", []), b.get("name", "data"))
        table = eng.to_arrow(info["id"])
        eng.drop(info["id"])
    else:
        return _err("Nothing to save.")
    return jsonify(projects.save(b.get("name"), b.get("state"), table))


@bp.route("/api/project/open", methods=["POST"])
def project_open():
    b = _body()
    manifest, state, table = projects.open_project(b.get("name"))
    import tempfile as _tf
    eng = get_engine()
    with _tf.NamedTemporaryFile(delete=False, suffix=".parquet", dir=eng.dir) as tmp:
        import pyarrow.parquet as pq
        pq.write_table(table, tmp.name)
    try:
        info = eng.load_parquet(tmp.name, manifest.get("name", "data"))
    finally:
        os.unlink(tmp.name)
    out = {"manifest": manifest, "state": state, "dataset": info}
    if info["rows"] <= INLINE_ROWS:
        out["data"] = eng.rows(info["id"], 0, info["rows"] or 1)["rows"] if info["rows"] else []
    return jsonify(out)


@bp.route("/api/project/delete", methods=["POST"])
def project_delete():
    return jsonify({"deleted": projects.delete(_body().get("name"))})
