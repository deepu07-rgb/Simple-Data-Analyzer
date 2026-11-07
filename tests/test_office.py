"""Excel proforma and Word letter endpoints."""
import io
import json
import zipfile

import openpyxl
from docx import Document
from openpyxl.styles import Font, PatternFill


def _proforma():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "प्रगति"
    ws["A1"] = "राजस्थान पुलिस — मासिक प्रगति"
    ws.merge_cells("A1:D1")
    for c, h in enumerate(["क्र.सं.", "थाना", "दर्ज", "लंबित"], 1):
        ws.cell(row=3, column=c, value=h).font = Font(bold=True)
    for i, (st, a, b) in enumerate([("कोतवाली", 10, 2), ("सांगानेर", 7, 1)], 1):
        ws.cell(row=3 + i, column=1, value=i)
        ws.cell(row=3 + i, column=2, value=st)
        ws.cell(row=3 + i, column=3, value=a).fill = PatternFill("solid", start_color="FFFF00", end_color="FFFF00")
        ws.cell(row=3 + i, column=4, value=b)
    ws["B6"] = "कुल"
    ws["C6"] = "=SUM(C4:C5)"
    ws["D6"] = 3
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_read_proforma_values_formulas_and_merged(client):
    r = client.post("/api/autopilot/read", data={"file": (io.BytesIO(_proforma()), "p.xlsx")}, content_type="multipart/form-data")
    j = r.get_json()
    assert r.status_code == 200 and j["active"] == "प्रगति"
    sh = j["sheets"][0]
    assert sh["rows"][2][:4] == ["क्र.सं.", "थाना", "दर्ज", "लंबित"]
    assert sh["rows"][3][2] == 10 and isinstance(sh["rows"][3][2], int)        # numbers stay numbers
    assert [5, 2] in sh["formulas"]                                              # C6 is a formula
    assert sh["merged"] == ["A1:D1"]
    assert j["hasChartsOrPictures"] is False


def test_read_rejects_other_files(client):
    r = client.post("/api/autopilot/read", data={"file": (io.BytesIO(b"x"), "p.csv")}, content_type="multipart/form-data")
    assert r.status_code == 400
    r = client.post("/api/autopilot/read", data={"file": (io.BytesIO(b"not a zip"), "p.xlsx")}, content_type="multipart/form-data")
    assert r.status_code == 400 and "Could not read" in r.get_json()["error"]


def test_fill_keeps_formatting_formulas_and_adds_sheets(client):
    payload = {
        "sheet": "प्रगति", "filename": "मासिक रिपोर्ट",
        "updates": [{"r": 3, "c": 2, "value": 12}, {"r": 4, "c": 2, "value": 9}, {"r": 3, "c": 3, "value": 0},
                    {"r": 5, "c": 2, "value": 21},                               # formula cell: must be left alone
                    {"r": 0, "c": 1, "value": 5}],                               # merged (non-anchor) cell: must be skipped
        "comparison": {"headers": ["थाना", "स्तंभ", "पिछला", "नया"], "rows": [["कोतवाली", "दर्ज", 10, 12]]},
        "summary": {"en": ["दर्ज rose by 4."], "hi": ["दर्ज 4 बढ़ा।"]}, "language": "both",
    }
    r = client.post("/api/autopilot/fill", data={"file": (io.BytesIO(_proforma()), "p.xlsx"), "payload": json.dumps(payload)}, content_type="multipart/form-data")
    assert r.status_code == 200
    assert r.headers["X-Cells-Written"] == "3" and set(r.headers["X-Cells-Skipped"].split(",")) == {"C6", "B1"}
    wb = openpyxl.load_workbook(io.BytesIO(r.data))
    ws = wb["प्रगति"]
    assert ws["C4"].value == 12 and ws["C5"].value == 9 and ws["D4"].value == 0
    assert ws["C6"].value == "=SUM(C4:C5)"                                       # formula survived
    assert ws["C4"].fill.start_color.rgb.endswith("FFFF00")                      # office's own formatting kept
    assert ws["A3"].font.bold is True and ws["A1"].value == "राजस्थान पुलिस — मासिक प्रगति"
    assert "A1:D1" in [str(m) for m in ws.merged_cells.ranges]
    assert "तुलना - Comparison" in wb.sheetnames and "सारांश - Summary" in wb.sheetnames
    assert wb["तुलना - Comparison"]["D2"].value == 12
    assert wb["सारांश - Summary"]["A2"].value == "दर्ज 4 बढ़ा।"
    assert "मासिक" in r.headers["Content-Disposition"] or "filled" in r.headers["Content-Disposition"]


def test_fill_survives_illegal_control_characters(client):
    payload = {"sheet": "प्रगति", "updates": [{"r": 3, "c": 1, "value": "बुरा\x00\x07नाम"}], "language": "en"}
    r = client.post("/api/autopilot/fill", data={"file": (io.BytesIO(_proforma()), "p.xlsx"), "payload": json.dumps(payload)}, content_type="multipart/form-data")
    assert r.status_code == 200
    assert openpyxl.load_workbook(io.BytesIO(r.data))["प्रगति"]["B4"].value == "बुरानाम"


def _letters(n=3, annex=True):
    L = [{"office": "पुलिस अधीक्षक कार्यालय, जयपुर", "fileNo": f"क्रमांक: पु.अ./2026/{i}", "date": "04/11/2026",
          "to": f"श्री राहुल शर्मा\nग्राम {i}, जयपुर", "subject": "विषय: स्मरण-पत्र",
          "body": "आपको सूचित किया जाता है कि प्रकरण लंबित है।\n\nकृपया शीघ्र उपस्थित हों।", "closing": "भवदीय", "signName": "नीरज पुरोहित",
          "signDesig": "वरिष्ठ सहायक", "signOffice": "पुलिस अधीक्षक कार्यालय"} for i in range(n)]
    body = {"letters": L, "filename": "स्मरण पत्र"}
    if annex:
        body["annexure"] = {"title": "संलग्नक", "headers": ["क्र.सं.", "नाम"], "rows": [["1", "राहुल शर्मा"], ["2", "प्रिया सिंह"]]}
    return body


def test_letters_docx_layout_and_hindi_fonts(client):
    r = client.post("/api/letters/docx", json=_letters())
    assert r.status_code == 200 and r.data[:2] == b"PK"
    doc = Document(io.BytesIO(r.data))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert text.count("पुलिस अधीक्षक कार्यालय, जयपुर") == 3
    assert "श्री राहुल शर्मा\nग्राम 1, जयपुर" in text.replace("\n\n", "\n") or "श्री राहुल शर्मा" in text
    assert "कृपया शीघ्र उपस्थित हों।" in text and "नीरज पुरोहित" in text
    xml = zipfile.ZipFile(io.BytesIO(r.data)).read("word/document.xml").decode("utf-8")
    assert xml.count('w:type="page"') == 3                    # 2 between letters + 1 before the annexure
    assert 'w:cs="Mangal"' in xml                              # complex-script font, needed for Devanagari in Word
    t = doc.tables[-1]
    assert [c.text for c in t.rows[0].cells] == ["क्र.सं.", "नाम"] and t.rows[2].cells[1].text == "प्रिया सिंह"
    sec = doc.sections[0]
    assert round(sec.page_width.cm, 1) == 21.0                 # A4


def test_letters_docx_limits_and_bad_input(client):
    assert client.post("/api/letters/docx", json={"letters": []}).status_code == 400
    assert client.post("/api/letters/docx", json={}).status_code == 400
    big = _letters(2001, annex=False)
    assert client.post("/api/letters/docx", json=big).status_code == 400
    ok = _letters(1, annex=False)
    ok["letters"][0]["body"] = "x\x00y " * 50
    assert client.post("/api/letters/docx", json=ok).status_code == 200      # control characters are removed, not fatal
