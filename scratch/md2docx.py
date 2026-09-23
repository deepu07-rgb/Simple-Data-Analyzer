"""Minimal, robust Markdown -> DOCX converter for the DataDrishti batches doc.
Handles: # ## ### headings, fenced ``` code blocks, - bullets, **bold**,
horizontal rule ---, blank-line paragraphs. Page-break before any heading whose
text starts with BATCH / PART / APPENDIX / HONEST.
"""
import re
import sys
from docx import Document
from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

SRC = sys.argv[1] if len(sys.argv) > 1 else "DataDrishti-Redesign-Batches.md"
OUT = sys.argv[2] if len(sys.argv) > 2 else "DataDrishti-Redesign-Batches.docx"

PRIMARY = RGBColor(0x6a, 0x2c, 0xb0)      # deep lavender for headings
CYAN = RGBColor(0x0b, 0x7d, 0x9a)
CODEBG = "EEeaF2"  # light lavender-grey shade for code blocks
MONO = "Consolas"

doc = Document()
# base styles
normal = doc.styles["Normal"]
normal.font.name = "Calibri"
normal.font.size = Pt(11)

def shade(paragraph, fill):
    pPr = paragraph._p.get_or_add_pPr()
    sh = OxmlElement("w:shd")
    sh.set(qn("w:val"), "clear")
    sh.set(qn("w:color"), "auto")
    sh.set(qn("w:fill"), fill)
    pPr.append(sh)

def page_break():
    p = doc.add_paragraph()
    run = p.add_run()
    br = OxmlElement("w:br")
    br.set(qn("w:type"), "page")
    run._r.append(br)

def add_bold_runs(paragraph, text):
    # split on **bold**
    for i, part in enumerate(re.split(r"\*\*(.+?)\*\*", text)):
        if part == "":
            continue
        run = paragraph.add_run(part)
        if i % 2 == 1:
            run.bold = True

def heading(text, level):
    t = text.strip()
    up = t.upper()
    if level <= 2 and any(up.startswith(k) for k in ("BATCH", "PART", "APPENDIX", "HONEST")):
        page_break()
    p = doc.add_paragraph()
    run = p.add_run(t)
    run.bold = True
    run.font.name = "Sora" if level == 1 else "Calibri"
    if level == 1:
        run.font.size = Pt(20); run.font.color.rgb = PRIMARY
    elif level == 2:
        run.font.size = Pt(15); run.font.color.rgb = PRIMARY
    else:
        run.font.size = Pt(12.5); run.font.color.rgb = CYAN
    p.space_before = Pt(10); p.space_after = Pt(4)

def code_line(text):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(0.15)
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.space_before = Pt(0)
    shade(p, CODEBG)
    run = p.add_run(text if text else " ")
    run.font.name = MONO
    r = run._element
    rpr = r.get_or_add_rPr()
    rfonts = rpr.get_or_add_rFonts()
    rfonts.set(qn("w:ascii"), MONO); rfonts.set(qn("w:hAnsi"), MONO)
    run.font.size = Pt(8.5)

def bullet(text):
    p = doc.add_paragraph(style="List Bullet")
    add_bold_runs(p, text)
    p.paragraph_format.space_after = Pt(1)

def para(text):
    p = doc.add_paragraph()
    add_bold_runs(p, text)
    p.paragraph_format.space_after = Pt(4)

lines = open(SRC, encoding="utf-8").read().split("\n")
in_code = False
i = 0
while i < len(lines):
    raw = lines[i]
    line = raw.rstrip("\n")
    if line.strip().startswith("```"):
        in_code = not in_code
        i += 1
        continue
    if in_code:
        code_line(line)
        i += 1
        continue
    s = line.strip()
    if s == "":
        i += 1
        continue
    if s == "---":
        # thematic divider
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run("─" * 24)
        run.font.color.rgb = RGBColor(0xBB, 0xAA, 0xCC)
        i += 1
        continue
    if s.startswith("### "):
        heading(s[4:], 3)
    elif s.startswith("## "):
        heading(s[3:], 2)
    elif s.startswith("# "):
        heading(s[2:], 1)
    elif s.startswith("- "):
        bullet(s[2:])
    else:
        para(s)
    i += 1

doc.save(OUT)
print("WROTE", OUT)
