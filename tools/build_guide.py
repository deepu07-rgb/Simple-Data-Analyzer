# -*- coding: utf-8 -*-
"""Builds the user guide from tools/guide_content.py:
     static/guide/guide.html           opened from inside the app (offline, English / Hindi / both)
     docs/Stellura-User-Guide.docx     for printing and sharing (English and Hindi together)
Run:  python tools/build_guide.py
"""
import html
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import guide_content as G  # noqa: E402

INLINE = re.compile(r"(\*\*.+?\*\*|`.+?`|\*[^*\s][^*]*?\*)")


def tokens(text):
    """Split 'a **b** `c` *d*' into [('t','a '),('b','b'),('c','c'),('i','d')]."""
    out = []
    for part in INLINE.split(text):
        if not part:
            continue
        if part.startswith("**"):
            out.append(("b", part[2:-2]))
        elif part.startswith("`"):
            out.append(("c", part[1:-1]))
        elif part.startswith("*") and len(part) > 2:
            out.append(("i", part[1:-1]))
        else:
            out.append(("t", part))
    return out


def h(text):
    tag = {"b": "strong", "c": "code", "i": "em"}
    return "".join(html.escape(v) if k == "t" else "<%s>%s</%s>" % (tag[k], html.escape(v), tag[k]) for k, v in tokens(text))


def bi(en, hi):
    return '<span class="en">%s</span><span class="hi" lang="hi">%s</span>' % (h(en), h(hi))


# ---------------------------------------------------------------------------------------------- HTML
CSS = """
@font-face{font-family:'GuideDev';src:url('../fonts/NotoSansDevanagari-Regular.ttf')}
:root{--bg:#f7f6fc;--card:#fff;--ink:#1e1b4b;--sub:#5b6478;--line:#e2e1ef;--acc:#6d5bd0;--tip:#ecfdf5;--tipb:#10b981;--warn:#fff7ed;--warnb:#f59e0b}
@media (prefers-color-scheme:dark){:root{--bg:#14132a;--card:#1d1b38;--ink:#ecebff;--sub:#a5a8c4;--line:#34325a;--tip:#10281f;--warn:#2e2312}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 'Inter','GuideDev','Noto Sans Devanagari','Mangal','Nirmala UI','Segoe UI',system-ui,sans-serif}
.hi{font-family:'GuideDev','Noto Sans Devanagari','Mangal','Nirmala UI',sans-serif}
header{background:linear-gradient(135deg,#4f3fb8,#6d5bd0 55%,#8f7de0);color:#fff;padding:34px 28px 26px}
header h1{margin:0 0 4px;font-size:30px;line-height:1.25}header p{margin:0;opacity:.92}
.bar{position:sticky;top:0;z-index:5;background:var(--card);border-bottom:1px solid var(--line);display:flex;gap:8px;align-items:center;padding:8px 18px;flex-wrap:wrap}
.bar b{margin-right:auto;color:var(--acc)}
.bar button{border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:999px;padding:5px 14px;cursor:pointer;font:inherit;font-size:14px}
.bar button.on{background:var(--acc);border-color:var(--acc);color:#fff}
.wrap{display:flex;gap:26px;max-width:1180px;margin:0 auto;padding:22px 18px 60px}
nav{width:250px;flex:none;position:sticky;top:64px;align-self:flex-start;max-height:calc(100vh - 84px);overflow:auto}
nav a{display:block;padding:6px 10px;border-radius:8px;color:var(--sub);text-decoration:none;font-size:14px;line-height:1.35}
nav a:hover{background:var(--card);color:var(--ink)}
main{flex:1;min-width:0}
section{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px 24px;margin:0 0 18px;scroll-margin-top:70px}
section h2{margin:0 0 10px;font-size:22px}section h2 .ic{margin-right:8px}
p{margin:.55em 0}ol,ul{margin:.5em 0;padding-left:1.4em}li{margin:.4em 0}
code{background:rgba(109,91,208,.12);padding:1px 6px;border-radius:6px;font-size:.92em}
.callout{border-left:4px solid var(--tipb);background:var(--tip);padding:8px 14px;border-radius:0 10px 10px 0;margin:.8em 0}
.callout.warn{border-color:var(--warnb);background:var(--warn)}
.callout b.k{display:block;font-size:12px;letter-spacing:.06em;text-transform:uppercase;opacity:.75}
table{border-collapse:collapse;width:100%}td{padding:8px 10px;border-top:1px solid var(--line);vertical-align:top}
td.k{white-space:nowrap}kbd{background:var(--bg);border:1px solid var(--line);border-bottom-width:2px;border-radius:6px;padding:1px 8px;font:inherit;font-size:.9em}
footer{text-align:center;color:var(--sub);font-size:13px;padding:6px 0 40px}
/* language: en | hi | bi */
body[data-lang=en] .hi{display:none}body[data-lang=hi] .en{display:none}
body[data-lang=bi] .en,body[data-lang=bi] .hi{display:block}
body[data-lang=bi] .hi{color:var(--sub);margin-top:2px}
body[data-lang=bi] li .en,body[data-lang=bi] li .hi,body[data-lang=bi] td .en,body[data-lang=bi] td .hi{display:block}
@media (max-width:860px){nav{display:none}.wrap{padding:14px 10px}}
@media print{.bar,nav{display:none}body{background:#fff;color:#000}section{break-inside:avoid-page;border-color:#bbb}header{background:#4f3fb8;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
"""

JS = """
(function(){var L='en';try{L=localStorage.getItem('sda_ui_language')||'en'}catch(e){}if(!/^(en|hi|bi)$/.test(L))L='en';
function set(l){document.body.setAttribute('data-lang',l);document.documentElement.lang=l==='hi'?'hi':'en';
 document.querySelectorAll('.bar button').forEach(function(b){b.classList.toggle('on',b.dataset.l===l)});}
document.querySelectorAll('.bar button').forEach(function(b){b.onclick=function(){set(b.dataset.l)}});set(L);})();
"""


def render_block(b):
    k = b[0]
    if k == "p":
        return "<p>%s</p>" % bi(b[1], b[2])
    if k == "steps":
        return "<ol>%s</ol>" % "".join("<li>%s</li>" % bi(e, hi) for e, hi in b[1])
    if k == "list":
        return "<ul>%s</ul>" % "".join("<li>%s</li>" % bi(e, hi) for e, hi in b[1])
    if k in ("tip", "warn"):
        label = ("Tip", "सुझाव") if k == "tip" else ("Careful", "सावधानी")
        return '<div class="callout%s"><b class="k">%s</b><p>%s</p></div>' % (" warn" if k == "warn" else "", bi(*label), bi(b[1], b[2]))
    if k == "keys":
        return "<table>%s</table>" % "".join('<tr><td class="k"><kbd>%s</kbd></td><td>%s</td></tr>' % (html.escape(keys), bi(en, hi)) for keys, en, hi in b[1])
    raise ValueError(k)


def build_html():
    nav = "".join('<a href="#%s">%s %s<span class="hi"> · %s</span></a>' % (s["id"], s["icon"], html.escape(s["en"]), html.escape(s["hi"])) for s in G.SECTIONS)
    secs = "".join('<section id="%s"><h2><span class="ic">%s</span>%s</h2>%s</section>' % (s["id"], s["icon"], bi(s["en"], s["hi"]), "".join(render_block(b) for b in s["blocks"])) for s in G.SECTIONS)
    return ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            "<title>%s</title><style>%s</style></head><body data-lang=\"en\">"
            '<header><h1>%s</h1><p>%s</p></header>'
            '<div class="bar"><b>Stellura</b><button data-l="en">English</button><button data-l="hi">हिंदी</button><button data-l="bi">English + हिंदी</button>'
            '<button onclick="window.print()">🖨 Print</button></div>'
            '<div class="wrap"><nav>%s</nav><main>%s</main></div><footer>%s</footer><script>%s</script></body></html>') % (
        html.escape(G.TITLE[0] + " / " + G.TITLE[1]), CSS, bi(*G.TITLE), bi(*G.SUBTITLE), nav, secs, html.escape(G.CREDIT), JS)


# ---------------------------------------------------------------------------------------------- Word
def build_docx(path):
    from docx import Document
    from docx.enum.text import WD_BREAK
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.shared import Pt, RGBColor, Cm

    doc = Document()
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21), Cm(29.7)
    sec.left_margin = sec.right_margin = Cm(2.0)
    sec.top_margin = sec.bottom_margin = Cm(2.0)
    st = doc.styles["Normal"]
    st.font.name = "Calibri"
    st.font.size = Pt(11)
    st.element.rPr.rFonts.set(qn("w:cs"), "Mangal")
    ACC, SUB = RGBColor(0x4F, 0x3F, 0xB8), RGBColor(0x55, 0x5B, 0x70)

    def font(run, hindi, size=None, bold=None, italic=None, color=None, mono=False):
        run.font.name = "Consolas" if mono else "Calibri"
        rpr = run._r.get_or_add_rPr()
        fonts = rpr.find(qn("w:rFonts"))
        if fonts is None:
            fonts = OxmlElement("w:rFonts")
            rpr.append(fonts)
        fonts.set(qn("w:cs"), "Mangal")
        fonts.set(qn("w:ascii"), "Consolas" if mono else "Calibri")
        fonts.set(qn("w:hAnsi"), "Consolas" if mono else "Calibri")
        lang = OxmlElement("w:lang")
        lang.set(qn("w:val"), "en-IN")
        lang.set(qn("w:bidi"), "hi-IN")
        rpr.append(lang)
        if size:
            run.font.size = Pt(size)
            szcs = OxmlElement("w:szCs")
            szcs.set(qn("w:val"), str(int(size * 2)))
            rpr.append(szcs)
        if bold is not None:
            run.font.bold = bold
        if italic is not None:
            run.font.italic = italic
        if color is not None:
            run.font.color.rgb = color

    def add_runs(par, text, hindi, size=11, color=None, base_bold=False):
        for kind, val in tokens(text):
            r = par.add_run(val)
            font(r, hindi, size, bold=(base_bold or kind == "b"), italic=(kind == "i"), color=color, mono=(kind == "c"))

    def para(text, hindi=False, size=11, color=None, left=0.0, space=4, bold=False, prefix=""):
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(space)
        p.paragraph_format.left_indent = Cm(left)
        if prefix:
            font(p.add_run(prefix), hindi, size, color=color)
        add_runs(p, text, hindi, size, color if color is not None else (SUB if hindi else None), bold)
        return p

    def shade(par_or_cell, fill):
        tcPr = par_or_cell._tc.get_or_add_tcPr()
        shd = OxmlElement("w:shd")
        shd.set(qn("w:val"), "clear")
        shd.set(qn("w:color"), "auto")
        shd.set(qn("w:fill"), fill)
        tcPr.append(shd)

    def callout(kind, en, hi):
        t = doc.add_table(rows=1, cols=1)
        c = t.rows[0].cells[0]
        shade(c, "E8F8F0" if kind == "tip" else "FFF3E0")
        label = ("Tip · सुझाव" if kind == "tip" else "Careful · सावधानी")
        c.paragraphs[0].text = ""
        font(c.paragraphs[0].add_run(label), False, 9, bold=True, color=ACC)
        for text, hindi in ((en, False), (hi, True)):
            p = c.add_paragraph()
            p.paragraph_format.space_after = Pt(2)
            add_runs(p, text, hindi, 10.5, SUB if hindi else None)
        doc.add_paragraph().paragraph_format.space_after = Pt(2)

    # cover
    for _ in range(5):
        doc.add_paragraph()
    p = doc.add_paragraph()
    font(p.add_run(G.TITLE[0]), False, 30, bold=True, color=ACC)
    p = doc.add_paragraph()
    font(p.add_run(G.TITLE[1]), True, 26, bold=True, color=ACC)
    para(G.SUBTITLE[0], size=14)
    para(G.SUBTITLE[1], True, size=14)
    for _ in range(3):
        doc.add_paragraph()
    para("Contents · विषय-सूची", size=13, bold=True, color=ACC)
    for n, s in enumerate(G.SECTIONS, 1):
        para("%d.  %s  ·  %s" % (n, s["en"], s["hi"]), size=11, space=2)
    doc.add_paragraph()
    para(G.CREDIT, size=10, color=SUB)
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)

    for n, s in enumerate(G.SECTIONS, 1):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(10)
        p.paragraph_format.keep_with_next = True
        font(p.add_run("%d. %s %s" % (n, s["icon"] if False else "", s["en"])), False, 17, bold=True, color=ACC)
        p = doc.add_paragraph()
        p.paragraph_format.keep_with_next = True
        font(p.add_run(s["hi"]), True, 15, bold=True, color=ACC)
        for b in s["blocks"]:
            k = b[0]
            if k == "p":
                para(b[1])
                para(b[2], True, left=0.0, space=8)
            elif k in ("steps", "list"):
                for i, (en, hi) in enumerate(b[1], 1):
                    mark = ("%d." % i) if k == "steps" else "•"
                    para(en, left=0.6, space=1, prefix=mark + "  ")
                    para(hi, True, left=1.0, space=5)
            elif k in ("tip", "warn"):
                callout(k, b[1], b[2])
            elif k == "keys":
                t = doc.add_table(rows=0, cols=2)
                t.style = "Table Grid"
                for keys, en, hi in b[1]:
                    cells = t.add_row().cells
                    cells[0].width = Cm(4.5)
                    cells[0].paragraphs[0].text = ""
                    font(cells[0].paragraphs[0].add_run(keys), False, 10.5, bold=True)
                    cells[1].paragraphs[0].text = ""
                    font(cells[1].paragraphs[0].add_run(en), False, 10.5)
                    q = cells[1].add_paragraph()
                    font(q.add_run(hi), True, 10.5, color=SUB)
                doc.add_paragraph()
    # footer with the credit
    fp = sec.footer.paragraphs[0]
    font(fp.add_run("Stellura · " + G.CREDIT), False, 8.5, color=SUB)
    doc.core_properties.title = " / ".join(G.TITLE)
    doc.core_properties.author = "Neeraj Purohit"
    doc.save(path)


def main():
    gdir = os.path.join(ROOT, "static", "guide")
    os.makedirs(gdir, exist_ok=True)
    with open(os.path.join(gdir, "guide.html"), "w", encoding="utf-8") as f:
        f.write(build_html())
    build_docx(os.path.join(ROOT, "docs", "Stellura-User-Guide.docx"))
    print("built static/guide/guide.html and docs/Stellura-User-Guide.docx (%d sections)" % len(G.SECTIONS))


if __name__ == "__main__":
    main()
