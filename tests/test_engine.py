"""Engine + project file tests (DuckDB side)."""
import io
import json
import zipfile

import openpyxl
import pytest

import engine as eng_mod


@pytest.fixture()
def eng():
    e = eng_mod.Engine(memory_limit="500MB")
    yield e
    e.close()


CSV = "नाम,विभाग,वेतन,फोन\nराहुल शर्मा,वित्त,\"45,000\",0987654321\nप्रिया सिंह,प्रशासन,32000,\nअमित कुमार,वित्त,38000.5,9876500000\n"


def _csv(tmp_path, text=CSV, name="a.csv", enc="utf-8"):
    p = tmp_path / name
    p.write_bytes(text.encode(enc))
    return str(p)


def test_csv_text_is_kept_exactly(eng, tmp_path):
    info = eng.load_csv(_csv(tmp_path))
    assert info["headers"] == ["नाम", "विभाग", "वेतन", "फोन"] and info["rows"] == 3
    r = eng.rows(info["id"], 0, 10)["rows"]
    assert r[0] == ["राहुल शर्मा", "वित्त", "45,000", "0987654321"]      # leading zero and comma untouched
    assert r[1][3] == ""


def test_csv_latin1_and_semicolon(eng, tmp_path):
    info = eng.load_csv(_csv(tmp_path, "name;city\nJosé;Zürich\n", enc="cp1252"))
    assert eng.rows(info["id"], 0, 5)["rows"] == [["José", "Zürich"]]


def test_duplicate_and_blank_headers(eng):
    info = eng.load_rows(["a", "a", "", None], [["1", "2", "3", "4"]])
    assert info["headers"] == ["a", "a_1", "Column 3", "Column 4"]


def test_sort_numeric_vs_text_and_paging(eng, tmp_path):
    ds = eng.load_csv(_csv(tmp_path))["id"]
    byname = eng.rows(ds, 0, 10, sort=2, numeric=True, desc=True)["rows"]
    assert [r[0] for r in byname] == ["राहुल शर्मा", "अमित कुमार", "प्रिया सिंह"] or \
           [r[0] for r in byname][0] == "राहुल शर्मा"                      # 45,000 is read as 45000
    page = eng.rows(ds, 1, 1, count=True)
    assert len(page["rows"]) == 1 and page["matched"] == 3 and page["total"] == 3


def test_search_and_filters(eng, tmp_path):
    ds = eng.load_csv(_csv(tmp_path))["id"]
    assert eng.rows(ds, 0, 10, search="शर्मा", count=True)["matched"] == 1
    assert eng.rows(ds, 0, 10, search="100%", count=True)["matched"] == 0   # % is literal, not a wildcard
    f = [{"col": 1, "op": "eq", "value": "वित्त"}, {"col": 2, "op": "gt", "value": 40000}]
    assert [r[0] for r in eng.rows(ds, 0, 10, filters=f)["rows"]] == ["राहुल शर्मा"]
    assert eng.rows(ds, 0, 10, filters=[{"col": 3, "op": "empty"}], count=True)["matched"] == 1
    with pytest.raises(eng_mod.EngineError):
        eng.rows(ds, 0, 10, filters=[{"col": 99, "op": "eq", "value": "x"}])
    with pytest.raises(eng_mod.EngineError):
        eng.rows(ds, 0, 10, filters=[{"col": 0, "op": "drop table", "value": "x"}])


def test_sql_injection_in_values_is_harmless(eng, tmp_path):
    ds = eng.load_csv(_csv(tmp_path))["id"]
    f = [{"col": 0, "op": "eq", "value": "'; DROP TABLE x; --"}]
    assert eng.rows(ds, 0, 10, filters=f, count=True)["matched"] == 0
    assert eng.rows(ds, 0, 10, search="'); DROP", count=True)["matched"] == 0
    assert eng.rows(ds, 0, 1)["total"] == 3


def test_profile(eng, tmp_path):
    ds = eng.load_csv(_csv(tmp_path))["id"]
    cols = {c["name"]: c for c in eng.profile(ds)["columns"]}
    assert cols["वेतन"]["type"] == "number" and cols["वेतन"]["max"] == 45000
    assert cols["फोन"]["empty"] == 1
    assert eng.top_values(ds, 1)[0] == {"value": "वित्त", "count": 2}


def test_codes_with_leading_zeros_are_text_not_numbers(eng):
    ds = eng.load_rows(["phone", "salary"], [["0912345678", "100"], ["0987654321", "200"], ["0911111111", "300"]])["id"]
    cols = {c["name"]: c["type"] for c in eng.profile(ds)["columns"]}
    assert cols["phone"] != "number"          # kept as text so it is left-aligned and never summed
    assert cols["salary"] == "number"


def test_aggregate(eng, tmp_path):
    ds = eng.load_csv(_csv(tmp_path))["id"]
    r = eng.aggregate(ds, [1], [{"fn": "sum", "col": 2}, {"fn": "count"}])
    assert r["headers"] == ["विभाग", "sum of वेतन", "Count"]
    assert r["rows"][0] == ["वित्त", 83000.5, 2]
    with pytest.raises(eng_mod.EngineError):
        eng.aggregate(ds, [1], [{"fn": "exec", "col": 2}])


def test_sql_is_select_only_and_sandboxed(eng, tmp_path):
    ds = eng.load_csv(_csv(tmp_path))["id"]
    r = eng.query(ds, 'SELECT "विभाग", count(*) AS n FROM data GROUP BY 1 ORDER BY 2 DESC')
    assert r["rows"][0] == ["वित्त", 2]
    for bad in ("DROP TABLE data", "INSERT INTO data VALUES (1)", "SELECT 1; SELECT 2",
                "COPY data TO '/tmp/x.csv'", "SET enable_external_access=true", "ATTACH 'x.db'"):
        with pytest.raises(eng_mod.EngineError):
            eng.query(ds, bad)
    with pytest.raises(eng_mod.EngineError):                                  # cannot read the disk
        eng.query(ds, "SELECT * FROM read_csv('/etc/passwd')")
    with pytest.raises(eng_mod.EngineError):
        eng.query(ds, "SELECT * FROM read_text('/etc/passwd')")


def test_xlsx_load_with_dates_and_blank_rows(eng, tmp_path):
    import datetime
    wb = openpyxl.Workbook(); ws = wb.active
    ws.append(["क्र", "तिथि", "राशि"]); ws.append([1, datetime.datetime(2025, 6, 1), 10.5])
    ws.append([None, None, None]); ws.append([2, datetime.datetime(2025, 6, 2, 9, 30), 20])
    ws2 = wb.create_sheet("दूसरी"); ws2.append(["x"]); ws2.append(["y"])
    p = tmp_path / "t.xlsx"; wb.save(p)
    info = eng.load_xlsx(str(p))
    assert info["rows"] == 2 and info["sheets"] == ["Sheet", "दूसरी"]
    assert eng.rows(info["id"], 0, 5)["rows"] == [["1", "2025-06-01", "10.5"], ["2", "2025-06-02 09:30:00", "20"]]
    assert eng.rows(eng.load_xlsx(str(p), "दूसरी")["id"], 0, 5)["rows"] == [["y"]]


def test_dataset_limit_evicts_oldest(eng, monkeypatch):
    monkeypatch.setattr(eng_mod, "MAX_DATASETS", 2)
    ids = [eng.load_rows(["a"], [["1"]])["id"] for _ in range(3)]
    with pytest.raises(eng_mod.EngineError):
        eng.rows(ids[0], 0, 1)
    assert eng.rows(ids[2], 0, 1)["rows"] == [["1"]]


# ------------------------------------------------------------------ HTTP + projects
@pytest.fixture()
def api(client, tmp_path, monkeypatch):
    monkeypatch.setenv("STELLURA_HOME", str(tmp_path / "home"))
    return client


def test_api_load_rows_aggregate_export(api, tmp_path):
    r = api.post("/api/engine/load", data={"file": (io.BytesIO(CSV.encode()), "वेतन.csv")},
                 content_type="multipart/form-data").get_json()
    ds = r["id"]
    assert r["rows"] == 3
    j = api.post(f"/api/engine/{ds}/rows", json={"offset": 0, "limit": 2, "count": True, "sort": 0}).get_json()
    assert len(j["rows"]) == 2 and j["matched"] == 3
    assert api.post(f"/api/engine/{ds}/query", json={"sql": "DROP TABLE data"}).status_code == 400
    csv_out = api.post(f"/api/engine/{ds}/export", json={"format": "csv", "filters": [{"col": 1, "op": "eq", "value": "वित्त"}]})
    assert csv_out.data.startswith(b"\xef\xbb\xbf") and "राहुल शर्मा".encode() in csv_out.data and "प्रिया".encode() not in csv_out.data
    x = api.post(f"/api/engine/{ds}/export", json={"format": "xlsx"})
    assert openpyxl.load_workbook(io.BytesIO(x.data)).active.max_row == 4
    assert api.post("/api/engine/nope/rows", json={}).status_code == 400


def test_project_roundtrip_and_backup(api):
    state = {"cfRules": [{"col": 2, "color": "#ef4444"}], "documentName": "वेतन पंजी"}
    s = api.post("/api/project/save", json={"name": "मासिक/रिपोर्ट?", "state": state,
                 "headers": ["नाम", "राशि"], "data": [["राम", "0012"], ["श्याम", "7"]]}).get_json()
    assert s["rows"] == 2 and s["path"].endswith("मासिक_रिपोर्ट_.stellura")
    api.post("/api/project/save", json={"name": "मासिक/रिपोर्ट?", "state": state, "headers": ["a"], "data": [["1"]]})
    lst = api.get("/api/project/list").get_json()["projects"]
    assert [p["name"] for p in lst] == ["मासिक_रिपोर्ट_"] and lst[0]["rows"] == 1
    o = api.post("/api/project/open", json={"name": "मासिक/रिपोर्ट?"}).get_json()
    assert o["state"] == state and o["data"] == [["1"]]
    # the .bak holds the previous save (the 2-row version, leading zero preserved)
    import projects
    bak = projects.projects_dir() / "मासिक_रिपोर्ट_.stellura.bak"
    assert bak.exists()
    with zipfile.ZipFile(bak) as z:
        assert json.loads(z.read("manifest.json"))["rows"] == 2


def test_project_from_engine_dataset_and_large_flag(api, monkeypatch):
    import engine_api
    monkeypatch.setattr(engine_api, "INLINE_ROWS", 1)
    ds = api.post("/api/engine/load", json={"headers": ["a", "b"], "data": [["1", "2"], ["3", "4"]]}).get_json()["id"]
    api.post("/api/project/save", json={"name": "big", "state": {}, "dataset": ds})
    o = api.post("/api/project/open", json={"name": "big"}).get_json()
    assert "data" not in o and o["dataset"]["rows"] == 2          # too big to inline -> Large File mode


def test_project_rejects_path_tricks_and_damaged_files(api):
    import projects
    api.post("/api/project/save", json={"name": "../../evil", "state": {}, "headers": ["a"], "data": [["1"]]})
    files = list(projects.projects_dir().iterdir())
    assert len(files) == 1 and files[0].parent == projects.projects_dir()      # stayed inside the folder
    assert "/" not in files[0].name and "\\" not in files[0].name and files[0].name.endswith(".stellura")
    (projects.projects_dir() / "broken.stellura").write_bytes(b"not a zip")
    r = api.post("/api/project/open", json={"name": "broken"})
    assert r.status_code == 400 and "damaged" in r.get_json()["error"]
    assert api.post("/api/project/open", json={"name": "missing"}).status_code == 400
