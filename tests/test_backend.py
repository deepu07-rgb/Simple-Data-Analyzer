"""Backend tests for the Stellura Flask server (run: python -m pytest tests -q)."""
import io
import json
import re
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent


def _xlsx_bytes(sheets):
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for name, rows in sheets.items():
        ws = wb.create_sheet(name)
        for r in rows:
            ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.get_json()["status"] == "ok"


def test_index_served(client):
    r = client.get("/")
    assert r.status_code == 200
    assert b"Stellura" in r.data


def test_server_listens_on_this_pc_only_by_default():
    import app as stellura

    assert stellura.HOST == "127.0.0.1"


def test_cors_does_not_trust_foreign_origins(client):
    r = client.get("/api/health", headers={"Origin": "https://evil.example"})
    assert r.headers.get("Access-Control-Allow-Origin") in (None, "")


def test_upload_xlsx_single_sheet_with_hindi_and_dates(client):
    import datetime

    data = _xlsx_bytes({"Sheet1": [
        ["नाम", "वेतन", "तिथि"],
        ["राहुल शर्मा", 45000, datetime.datetime(2025, 6, 1)],
        ["प्रिया सिंह", 32000, datetime.datetime(2025, 6, 2, 9, 30)],
    ]})
    r = client.post("/api/upload", data={"file": (io.BytesIO(data), "t.xlsx")},
                    content_type="multipart/form-data")
    j = r.get_json()
    assert r.status_code == 200
    assert j["headers"] == ["नाम", "वेतन", "तिथि"]
    assert j["data"][0] == ["राहुल शर्मा", 45000, "2025-06-01"]       # date only, no 00:00:00
    assert j["data"][1][2] == "2025-06-02 09:30:00"
    assert j["sheetInfo"] == [{"name": "Sheet1", "rows": 2, "cols": 3}]


def test_upload_xlsx_multi_sheet_selects_requested_sheet(client):
    data = _xlsx_bytes({"जनवरी": [["a", "b"], [1, 2]], "फरवरी": [["c", "d"], [3, 4], [5, 6]]})
    r = client.post("/api/upload", data={"file": (io.BytesIO(data), "t.xlsx")},
                    content_type="multipart/form-data")
    j = r.get_json()
    assert j["sheets"] == ["जनवरी", "फरवरी"]
    assert [s["rows"] for s in j["sheetInfo"]] == [1, 2]
    r2 = client.post("/api/upload",
                     data={"file": (io.BytesIO(data), "t.xlsx"), "sheet": "फरवरी"},
                     content_type="multipart/form-data")
    j2 = r2.get_json()
    assert j2["headers"] == ["c", "d"] and len(j2["data"]) == 2


def test_upload_legacy_xls_is_left_to_the_browser(client):
    r = client.post("/api/upload", data={"file": (io.BytesIO(b"x"), "old.xls")},
                    content_type="multipart/form-data")
    assert r.status_code == 415
    assert r.get_json()["error"] == "legacy_xls"


def test_upload_rejects_unknown_type(client):
    r = client.post("/api/upload", data={"file": (io.BytesIO(b"x"), "a.exe")},
                    content_type="multipart/form-data")
    assert r.status_code == 400


def test_upload_csv(client):
    r = client.post("/api/upload", data={"file": (io.BytesIO("नाम,उम्र\nराम,30\n".encode()), "a.csv")},
                    content_type="multipart/form-data")
    assert r.get_json()["data"] == [["राम", "30"]]


PAYLOAD = {"headers": ["नाम", "वेतन"], "data": [["राहुल", 45000], ["प्रिया", 32000]], "title": "हिंदी टेस्ट"}


def test_export_excel_roundtrip(client):
    r = client.post("/api/export/excel", json=PAYLOAD)
    assert r.status_code == 200
    ws = openpyxl.load_workbook(io.BytesIO(r.data)).active
    values = [[c.value for c in row] for row in ws.iter_rows()]
    assert ["राहुल", 45000] in values


def test_export_pdf_with_hindi(client):
    r = client.post("/api/export/pdf", json=PAYLOAD)
    assert r.status_code == 200 and r.data[:4] == b"%PDF"


def test_sample_datasets(client):
    for name in ("employee_salary", "attendance", "budget"):
        j = client.get(f"/api/sample-data/{name}").get_json()
        assert j["headers"] and j["data"]
    assert client.get("/api/sample-data/nope").status_code == 404


def test_ai_degrades_cleanly_without_ollama(client, monkeypatch):
    import app as stellura

    monkeypatch.setattr(stellura, "OLLAMA_BASE", "http://127.0.0.1:9")  # nothing listens here
    r = client.post("/api/ai/query", json={"query": "hi", "headers": ["a"]})
    assert r.status_code == 503 and r.get_json()["error"] == "ollama_unavailable"
    assert client.get("/api/ollama/status").status_code == 503


def test_vendored_libraries_exist():
    for f in ("xlsx.full.min.js", "jspdf.umd.min.js", "jspdf.plugin.autotable.min.js",
              "html2canvas.min.js", "chart.min.js"):
        assert (ROOT / "static" / "js" / f).stat().st_size > 10_000, f
    assert (ROOT / "static" / "alasql.min.js").exists()


def _built_html():
    import sys
    sys.path.insert(0, str(ROOT))
    from tools import build

    return build.build_text()


def test_frontend_references_no_external_hosts():
    """Offline promise: the page must not load anything from the internet."""
    html = _built_html()
    refs = re.findall(r"""(?:src|href)\s*=\s*["'](https?://[^"']+)["']""", html)
    refs += re.findall(r"""script\.src\s*=\s*['"](https?://[^'"]+)['"]""", html)
    assert refs == [], refs


def test_build_is_deterministic_and_served(client):
    from tools import build

    out = build.build()
    assert out.read_bytes() == build.build_text().encode("utf-8")
    assert client.get("/").data == out.read_bytes()


def test_every_manifest_part_exists_and_none_is_orphaned():
    manifest = (ROOT / "web" / "manifest.txt").read_text(encoding="utf-8")
    listed = {l.split(" ", 1)[1].strip() for l in manifest.splitlines() if l.startswith("@file ")}
    on_disk = {p.relative_to(ROOT / "web").as_posix() for p in (ROOT / "web").rglob("*") if p.is_file()} - {"manifest.txt"}
    assert listed == on_disk
