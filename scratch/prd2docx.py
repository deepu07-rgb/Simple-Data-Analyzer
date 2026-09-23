"""Markdown -> DOCX for the Stellura PRD.
Extends the batches converter with: GitHub tables, [ ] / [x] checklists,
numbered lists, **bold**, `inline code`, headings, fenced code, HR.
Usage: python scratch/prd2docx.py Stellura-Premium-UI-PRD.md Stellura-Premium-UI-PRD.docx
"""
import re
import sys
from docx import Document
from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

SRC = sys.argv[1] if len(sys.argv) > 1 else "Stellura-Premium-UI-PRD.md"
OUT = sys.argv[2] if len(sys.argv) > 2 else "Stellura-Premium-UI-PRD.docx"

PRIMARY = RGBColor(0x6a, 0x2c, 0xb0)   # deep lavender
CYAN = RGBColor(0x0b, 0x7d, 0x9a)
MUTED = RGBColor(0x55, 0x55, 0x55)
HEADERFILL = "7E22CE"                  # purple table header
HEADERTXT = RGBColor(0xFF, 0xFF, 0xFF)
ROWALT = "F3EEFA"                      # light lavender zebra
CODEBG = "EEeaF2"
MONO = "Consolas"

doc = Document()
normal = doc.styles["Normal"]
normal.font.name = "Calibri"
normal.font.size = Pt(11)
for section in doc.sections:
    section.left_margin = Inches(0.8)
    section.right_margin = Inches(0.8)
    section.top_margin = Inches(0.7)
    section.bottom_margin = Inches(0.7)


def shade(paragraph_or_cell, fill):
    el = paragraph_or_cell._tc if hasattr(paragraph_or_cell, "_tc") else paragraph_or_cell._p
    pr = el.get_or_add_tcPr() if hasattr(paragraph_or_cell, "_tc") else el.get_or_add_pPr()
    sh = OxmlElement("w:shd")
    sh.set(qn("w:val"), "clear")
    sh.set(qn("w:color"), "auto")
    sh.set(qn("w:fill"), fill)
    pr.append(sh)


def page_break():
    p = doc.add_paragraph()
    run = p.add_run()
    br = OxmlElement("w:br")
    br.set(qn("w:type"), "page")
    run._r.append(br)


def add_rich_runs(paragraph, text):
    """Handle **bold** and `inline code` within a line."""
    # split on bold first
    for i, part in enumerate(re.split(r"\*\*(.+?)\*\*", text)):
        if part == "":
            continue
        bold = (i % 2 == 1)
        # split each part on inline code
        for j, seg in enumerate(re.split(r"`([^`]+)`", part)):
            if seg == "":
                continue
            run = paragraph.add_run(seg)
            run.bold = bold
            if j % 2 == 1:
                run.font.name = MONO
                rpr = run._element.get_or_add_rPr()
                rf = rpr.get_or_add_rFonts()
                rf.set(qn("w:ascii"), MONO); rf.set(qn("w:hAnsi"), MONO)
                run.font.size = Pt(9.5)


def heading(text, level):
    t = text.strip()
    up = t.upper()
    if level <= 2 and any(up.startswith(k) for k in ("BATCH", "PART", "APPENDIX")):
        page_break()
    p = doc.add_paragraph()
    run = p.add_run(t)
    run.bold = True
    run.font.name = "Sora" if level == 1 else "Calibri"
    if level == 1:
        run.font.size = Pt(22); run.font.color.rgb = PRIMARY
    elif level == 2:
        run.font.size = Pt(15); run.font.color.rgb = PRIMARY
    else:
        run.font.size = Pt(12.5); run.font.color.rgb = CYAN
    p.paragraph_format.space_before = Pt(12); p.paragraph_format.space_after = Pt(4)


def code_line(text):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(0.15)
    p.paragraph_format.space_after = Pt(0); p.paragraph_format.space_before = Pt(0)
    shade(p, CODEBG)
    run = p.add_run(text if text else " ")
    rpr = run._element.get_or_add_rPr()
    rf = rpr.get_or_add_rFonts()
    rf.set(qn("w:ascii"), MONO); rf.set(qn("w:hAnsi"), MONO)
    run.font.size = Pt(8.5)


def bullet(text, checklist=False):
    p = doc.add_paragraph(style="List Bullet")
    if checklist:
        m = re.match(r"\[([ xX])\]\s*(.*)", text)
        if m:
            box = "☑ " if m.group(1).lower() == "x" else "☐ "
            r = p.add_run(box)
            r.font.size = Pt(11)
            text = m.group(2)
    add_rich_runs(p, text)
    p.paragraph_format.space_after = Pt(1)


def numbered(text):
    p = doc.add_paragraph(style="List Number")
    add_rich_runs(p, text)
    p.paragraph_format.space_after = Pt(1)


def para(text):
    p = doc.add_paragraph()
    add_rich_runs(p, text)
    p.paragraph_format.space_after = Pt(5)


def split_row(line):
    line = line.strip().strip("|")
    return [c.strip() for c in line.split("|")]


def add_table(rows):
    header = split_row(rows[0])
    body = [split_row(r) for r in rows[2:]]  # skip separator row
    ncol = len(header)
    table = doc.add_table(rows=1, cols=ncol)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"
    # header
    for j, h in enumerate(header):
        cell = table.rows[0].cells[j]
        cell.paragraphs[0].text = ""
        run = cell.paragraphs[0].add_run(h)
        run.bold = True; run.font.color.rgb = HEADERTXT; run.font.size = Pt(10)
        shade(cell, HEADERFILL)
    # body
    for ri, r in enumerate(body):
        cells = table.add_row().cells
        for j in range(ncol):
            txt = r[j] if j < len(r) else ""
            cell = cells[j]
            cell.paragraphs[0].text = ""
            add_rich_runs(cell.paragraphs[0], txt)
            for run in cell.paragraphs[0].runs:
                run.font.size = Pt(9.5)
            if ri % 2 == 1:
                shade(cell, ROWALT)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


lines = open(SRC, encoding="utf-8").read().split("\n")
in_code = False
i = 0
while i < len(lines):
    line = lines[i].rstrip("\n")
    s = line.strip()

    if s.startswith("```"):
        in_code = not in_code
        i += 1
        continue
    if in_code:
        code_line(line)
        i += 1
        continue

    # table: a | row followed by a |---| separator
    if s.startswith("|") and i + 1 < len(lines) and re.match(r"^\s*\|?[\s:|-]+\|", lines[i + 1]):
        block = [line]
        i += 1
        block.append(lines[i])  # separator
        i += 1
        while i < len(lines) and lines[i].strip().startswith("|"):
            block.append(lines[i]); i += 1
        add_table(block)
        continue

    if s == "":
        i += 1
        continue
    if s == "---":
        p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run("─" * 24); run.font.color.rgb = RGBColor(0xBB, 0xAA, 0xCC)
        i += 1
        continue
    if s.startswith("### "):
        heading(s[4:], 3)
    elif s.startswith("## "):
        heading(s[3:], 2)
    elif s.startswith("# "):
        heading(s[2:], 1)
    elif re.match(r"^- \[[ xX]\]", s):
        bullet(s[2:], checklist=True)
    elif s.startswith("- "):
        bullet(s[2:])
    elif re.match(r"^\d+\.\s", s):
        numbered(re.sub(r"^\d+\.\s", "", s))
    else:
        para(s)
    i += 1

doc.save(OUT)
print("WROTE", OUT)
