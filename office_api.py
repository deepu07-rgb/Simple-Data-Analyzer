"""
Office documents for Phase 3: reading and filling Excel proformas (Report Autopilot) and laying out
Word letters (Letters from Data). The browser decides WHAT goes into each cell / letter; this file
only reads the template and writes the file, keeping the office's own formatting.

Word and Excel shape Hindi correctly, so these are produced as .docx / .xlsx (a PDF can be made with the
browser's Print > Save as PDF). ReportLab does not shape Devanagari, so it is deliberately not used here.
"""
import datetime
import io
import json
import re
import zipfile

import openpyxl
from flask import Blueprint, jsonify, request, send_file
from openpyxl.cell.cell import MergedCell
from openpyxl.styles import Alignment, Font, PatternFill

bp = Blueprint("office", __name__)

MAX_ROWS, MAX_COLS, MAX_SHEETS = 3000, 80, 12
MAX_LETTERS, MAX_ANNEX_ROWS = 2000, 5000
XML_BAD = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def _err(msg, code=400):
    return jsonify({"error": msg}), code


def clean(v):
    """Remove characters that are illegal in Office XML."""
    return XML_BAD.sub("", v) if isinstance(v, str) else v


def _json_value(v):
    if isinstance(v, bool):
        return str(v)
    if isinstance(v, (int, float)):
        return v
    if isinstance(v, datetime.datetime):
        return v.date().isoformat() if (v.hour, v.minute, v.second) == (0, 0, 0) else v.isoformat(sep=" ")
    if isinstance(v, (datetime.date, datetime.time)):
        return v.isoformat()
    return None if v is None else str(v)


# ---------------------------------------------------------------- Report Autopilot: read the proforma
@bp.route("/api/autopilot/read", methods=["POST"])
def autopilot_read():
    f = request.files.get("file")
    if f is None or not (f.filename or "").lower().endswith((".xlsx", ".xlsm")):
        return _err("Choose the filled proforma as an .xlsx file.")
    data = f.read()
    try:
        wb_v = openpyxl.load_workbook(io.BytesIO(data), data_only=True)
        wb_f = openpyxl.load_workbook(io.BytesIO(data), data_only=False)
    except Exception as exc:
        return _err(f"Could not read this Excel file: {exc}")
    try:
        names = zipfile.ZipFile(io.BytesIO(data)).namelist()
    except zipfile.BadZipFile:
        names = []
    sheets = []
    for ws in wb_v.worksheets[:MAX_SHEETS]:
        rows = []
        for row in ws.iter_rows(min_row=1, max_row=min(ws.max_row, MAX_ROWS), max_col=min(ws.max_column, MAX_COLS), values_only=True):
            rows.append([_json_value(v) for v in row])
        formulas = []
        wf = wb_f[ws.title]
        for row in wf.iter_rows(min_row=1, max_row=min(wf.max_row, MAX_ROWS), max_col=min(wf.max_column, MAX_COLS)):
            for c in row:
                if c.data_type == "f" or (isinstance(c.value, str) and c.value.startswith("=")):
                    formulas.append([c.row - 1, c.column - 1])
        sheets.append({"name": ws.title, "rows": rows, "formulas": formulas,
                       "merged": [str(m) for m in ws.merged_cells.ranges][:500],
                       "truncated": ws.max_row > MAX_ROWS or ws.max_column > MAX_COLS})
    return jsonify({
        "sheets": sheets, "active": wb_v.active.title,
        "hasChartsOrPictures": any(n.startswith(("xl/charts/", "xl/drawings/", "xl/media/")) for n in names),
    })


# ---------------------------------------------------------------- Report Autopilot: fill it
@bp.route("/api/autopilot/fill", methods=["POST"])
def autopilot_fill():
    f = request.files.get("file")
    if f is None:
        return _err("The proforma file is missing.")
    try:
        payload = json.loads(request.form.get("payload", "{}"))
        wb = openpyxl.load_workbook(io.BytesIO(f.read()))
    except Exception as exc:
        return _err(f"Could not read the proforma: {exc}")
    sheet = payload.get("sheet")
    ws = wb[sheet] if sheet in wb.sheetnames else wb.active
    written, skipped = 0, []
    for u in payload.get("updates", [])[:200000]:
        try:
            r, c = int(u["r"]) + 1, int(u["c"]) + 1
        except (KeyError, TypeError, ValueError):
            continue
        cell = ws.cell(row=r, column=c)
        if isinstance(cell, MergedCell) or cell.data_type == "f":
            skipped.append(cell.coordinate)                # formulas recalculate themselves; merged cells cannot be written
            continue
        v = u.get("value")
        cell.value = None if v == "" else clean(v)
        written += 1

    lang = payload.get("language", "both")
    head_fill = PatternFill("solid", start_color="E2E8F0", end_color="E2E8F0")
    cmp_ = payload.get("comparison") or {}
    if cmp_.get("rows"):
        cs = wb.create_sheet("तुलना - Comparison"[:31])
        cs.append([clean(h) for h in cmp_.get("headers", [])])
        for row in cmp_["rows"][:50000]:
            cs.append([clean(x) for x in row])
        for c in cs[1]:
            c.font = Font(bold=True)
            c.fill = head_fill
        for col in cs.columns:
            cs.column_dimensions[col[0].column_letter].width = min(max(len(str(col[0].value or "")) + 4, 12), 40)
        cs.freeze_panes = "A2"
    summ = payload.get("summary") or {}
    lines = []
    if lang in ("en", "both"):
        lines += summ.get("en", [])
    if lang in ("hi", "both"):
        lines += summ.get("hi", [])
    if lines:
        ss = wb.create_sheet("सारांश - Summary"[:31])
        for i, line in enumerate(lines, 1):
            c = ss.cell(row=i, column=1, value=clean(line))
            c.alignment = Alignment(wrap_text=True, vertical="top")
        ss.column_dimensions["A"].width = 120
    out = io.BytesIO()
    wb.save(out)
    out.seek(0)
    name = re.sub(r"[^\w\s.-]", "", payload.get("filename") or "proforma", flags=re.UNICODE).strip() or "proforma"
    resp = send_file(out, as_attachment=True, download_name=f"{name}_filled.xlsx",
                     mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    resp.headers["X-Cells-Written"] = str(written)
    resp.headers["X-Cells-Skipped"] = ",".join(skipped[:200])
    return resp


# ---------------------------------------------------------------- Letters from Data (Word)
def _font(run, name="Mangal", size=12, bold=None):
    from docx.oxml.ns import qn
    run.font.name = name
    run.font.size = __import__("docx").shared.Pt(size)
    if bold is not None:
        run.bold = bold
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = rpr.makeelement(qn("w:rFonts"), {})
        rpr.append(rfonts)
    for attr in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        rfonts.set(qn(attr), name)                         # w:cs is what Word uses for Devanagari
    szcs = rpr.find(qn("w:szCs"))
    if szcs is None:
        szcs = rpr.makeelement(qn("w:szCs"), {})
        rpr.append(szcs)
    szcs.set(qn("w:val"), str(int(size * 2)))


def _para(doc, text="", align=None, bold=False, size=12, space_after=6, font="Mangal", underline=False):
    p = doc.add_paragraph()
    if align:
        p.alignment = align
    p.paragraph_format.space_after = __import__("docx").shared.Pt(space_after)
    p.paragraph_format.space_before = __import__("docx").shared.Pt(0)
    lines = str(text).split("\n")
    for i, line in enumerate(lines):
        run = p.add_run(clean(line))
        _font(run, font, size, bold)
        run.underline = underline
        if i < len(lines) - 1:
            run.add_break()
    return p


@bp.route("/api/letters/docx", methods=["POST"])
def letters_docx():
    """JSON {letters:[{office,fileNo,date,to,subject,body,closing,signName,signDesig,signOffice}],
             annexure:{title,headers,rows}|null, font}"""
    from docx import Document
    from docx.enum.table import WD_TABLE_ALIGNMENT
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Cm, Pt

    b = request.get_json(silent=True) or {}
    letters = b.get("letters") or []
    if not letters:
        return _err("There are no letters to write.")
    if len(letters) > MAX_LETTERS:
        return _err(f"At most {MAX_LETTERS} letters at a time. Filter the data and try again.")
    font = b.get("font") or "Mangal"
    doc = Document()
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21), Cm(29.7)
    sec.left_margin = sec.right_margin = Cm(2.2)
    sec.top_margin = sec.bottom_margin = Cm(2)
    normal = doc.styles["Normal"]
    normal.font.name = font
    normal.font.size = Pt(12)

    for n, L in enumerate(letters):
        if n:
            doc.add_page_break()
        if L.get("office"):
            _para(doc, L["office"], WD_ALIGN_PARAGRAPH.CENTER, bold=True, size=15, space_after=2, font=font)
        if L.get("officeSub"):
            _para(doc, L["officeSub"], WD_ALIGN_PARAGRAPH.CENTER, size=11, space_after=10, font=font)
        t = doc.add_table(rows=1, cols=2)
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        left, right = t.rows[0].cells
        left.paragraphs[0].add_run(clean(L.get("fileNo", "")))
        right.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
        right.paragraphs[0].add_run(clean(L.get("date", "")))
        for cell in (left, right):
            for run in cell.paragraphs[0].runs:
                _font(run, font, 12)
        _para(doc, "", space_after=4, font=font)
        if L.get("to"):
            _para(doc, L["to"], size=12, space_after=8, font=font)
        if L.get("subject"):
            _para(doc, L["subject"], bold=True, size=12, space_after=8, font=font)
        for chunk in re.split(r"\n\s*\n", str(L.get("body", "")).strip()):
            if chunk.strip():
                _para(doc, chunk.strip(), WD_ALIGN_PARAGRAPH.JUSTIFY, size=12, space_after=8, font=font)
        sign = "\n".join(x for x in (L.get("closing"), "", L.get("signName"), L.get("signDesig"), L.get("signOffice")) if x is not None)
        if sign.strip():
            _para(doc, "", space_after=14, font=font)
            _para(doc, sign, WD_ALIGN_PARAGRAPH.RIGHT, size=12, space_after=4, font=font)
        if L.get("copyTo"):
            _para(doc, L["copyTo"], size=11, space_after=2, font=font)

    ann = b.get("annexure")
    if ann and ann.get("headers") and ann.get("rows"):
        doc.add_page_break()
        _para(doc, ann.get("title") or "Annexure / संलग्नक", WD_ALIGN_PARAGRAPH.CENTER, bold=True, size=13, space_after=8, font=font)
        rows = ann["rows"][:MAX_ANNEX_ROWS]
        tbl = doc.add_table(rows=1, cols=len(ann["headers"]))
        tbl.style = "Table Grid"
        for i, h in enumerate(ann["headers"]):
            tbl.rows[0].cells[i].paragraphs[0].add_run(clean(str(h)))
            for run in tbl.rows[0].cells[i].paragraphs[0].runs:
                _font(run, font, 10.5, True)
        for row in rows:
            cells = tbl.add_row().cells
            for i in range(len(ann["headers"])):
                cells[i].paragraphs[0].add_run(clean(str(row[i]) if i < len(row) and row[i] is not None else ""))
                for run in cells[i].paragraphs[0].runs:
                    _font(run, font, 10.5)
    out = io.BytesIO()
    doc.save(out)
    out.seek(0)
    name = re.sub(r"[^\w\s.-]", "", b.get("filename") or "letters", flags=re.UNICODE).strip() or "letters"
    return send_file(out, as_attachment=True, download_name=f"{name}.docx",
                     mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
