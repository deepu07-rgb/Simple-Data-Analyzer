"""
Regression tests: Hindi (Devanagari) must be shaped correctly in every PDF that
app.py builds with ReportLab.

How the checks work
-------------------
Looking at *extracted text* cannot tell a shaped PDF from an unshaped one: both
map glyphs back to the same code points.  What differs is the glyph stream that
was actually drawn, which PyMuPDF exposes through ``Page.get_texttrace()``
(one entry per drawn glyph, in drawing order, with its position):

* unshaped: ``व ि भ ा ग``  -> the i-matra is drawn *after* व, conjuncts are
  ``क ् ष`` (three glyphs, with a visible halant)
* shaped:   ``ि व भ ा ग``  -> the i-matra is drawn first, ``क्ष`` is one
  ligature glyph.  ReportLab maps substituted glyphs to Private Use Area code
  points, so they show up as U+E000..U+F8FF.

The reference for "correct" is HarfBuzz itself, driven directly through
``uharfbuzz`` in this file (not through ReportLab), plus a few hand-written
known-good glyph patterns.

Run with:  pip install -r requirements-dev.txt && pytest
"""
import io
import re
from pathlib import Path

import pymupdf
import pytest
import uharfbuzz as hb
from reportlab.pdfgen import canvas as rl_canvas

import app as stellura
import pdf_shaping

FONT_PATH = Path(stellura.STATIC_FONTS_DIR) / "NotoSansDevanagari-Regular.ttf"

PUA = "P"  # wildcard in glyph patterns: any Private Use Area glyph (a substituted glyph)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session", autouse=True)
def hindi_font():
    assert stellura._register_hindi_font(), f"Hindi font could not be registered ({FONT_PATH})"


@pytest.fixture()
def client():
    return stellura.app.test_client()


def _is_pua(code):
    return 0xE000 <= code <= 0xF8FF


def page_glyphs(page):
    """[(code, gid, (x, y)), ...] of every glyph drawn on *page*, in drawing order."""
    spans = sorted(page.get_texttrace(), key=lambda s: s["seqno"])
    return [(ch[0], ch[1], ch[2]) for span in spans for ch in span["chars"]]


def page_codes(page):
    return [g[0] for g in page_glyphs(page)]


def count_pattern(codes, pattern):
    """How often *pattern* occurs contiguously in *codes*; PUA matches any substituted glyph."""
    n = len(pattern)
    return sum(
        all((_is_pua(c) if p == PUA else c == p) for c, p in zip(codes[i:i + n], pattern))
        for i in range(len(codes) - n + 1)
    )


def find_pattern(codes, pattern):
    return count_pattern(codes, pattern) > 0


def as_pattern(codes):
    """Glyph codes -> pattern (substituted glyphs become the PUA wildcard)."""
    return [PUA if _is_pua(c) else c for c in codes]


CONSONANTS = set(range(0x0915, 0x093A)) | set(range(0x0958, 0x0960))
VIRAMA = 0x094D


def unshaped_conjuncts(codes):
    """Consonant + halant + consonant drawn as three glyphs: what unshaped text looks like.

    Noto Sans Devanagari turns every such sequence into a ligature, half form or
    reph/rakar mark glyph when shaped, so this pattern must never be drawn.
    """
    return [
        i for i in range(len(codes) - 2)
        if codes[i] in CONSONANTS and codes[i + 1] == VIRAMA and codes[i + 2] in CONSONANTS
    ]


def pdf_pages(data):
    doc = pymupdf.open(stream=data, filetype="pdf")
    return [doc[i] for i in range(len(doc))]


# Known-good glyph patterns (visual order) for the words from the bug report, as
# produced by HarfBuzz for Noto Sans Devanagari.  PUA = a substituted glyph.
#   विभाग     the i-matra is drawn first, before व
#   पुलिस     the i-matra is drawn before ल (the consonant it belongs to)
#   क्षत्रिय   8 code points -> 4 glyphs: क्ष, ि, त्र, य
#   ज्ञान      ज्ञ is one glyph
#   श्रीमती    श्र is one glyph
#   द्वारा     द्व is one glyph
#   क्रांति    क्र is one glyph; ि moves before त
#   स्त्री     स् + त्र + ी
KNOWN_GOOD = {
    "विभाग": [PUA, 0x935, 0x92D, 0x93E, 0x917],
    "पुलिस": [0x92A, 0x941, PUA, 0x932, 0x938],
    "क्षत्रिय": [PUA, PUA, PUA, 0x92F],
    "ज्ञान": [PUA, 0x93E, 0x928],
    "श्रीमती": [PUA, 0x940, 0x92E, 0x924, 0x940],
    "द्वारा": [PUA, 0x93E, 0x930, 0x93E],
    "क्रांति": [PUA, 0x93E, 0x902, PUA, 0x924],
    "स्त्री": [PUA, PUA, 0x940],
}


def hb_reference(text, size):
    """Glyph origins/names for *text* straight from HarfBuzz, independent of ReportLab.

    Text is itemised into Devanagari and non-Devanagari runs, each shaped on its
    own with its own script, as a real text engine would.
    """
    face = hb.Face(hb.Blob.from_file_path(str(FONT_PATH)))
    font = hb.Font(face)
    scale = size / face.upem
    pen, glyphs = 0.0, []
    for run in re.findall("[\u0900-\u097f\u200c\u200d]+|[^\u0900-\u097f\u200c\u200d]+", text):
        buf = hb.Buffer()
        buf.add_str(run)
        buf.guess_segment_properties()
        hb.shape(font, buf, {"kern": True, "liga": True})
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            glyphs.append({
                "x": pen + pos.x_offset * scale,
                "y": pos.y_offset * scale,
                "name": font.glyph_to_string(info.codepoint),
            })
            pen += pos.x_advance * scale
    return glyphs, pen


# ---------------------------------------------------------------------------
# environment
# ---------------------------------------------------------------------------

def test_shaping_dependencies_are_installed():
    assert pdf_shaping.SHAPING_AVAILABLE, (
        "Hindi PDF shaping is unavailable: `pip install -r requirements.txt` "
        "(needs reportlab>=5.0.1 and uharfbuzz)"
    )
    assert pdf_shaping.PARA_SHAPING == {"shaping": 1}


# ---------------------------------------------------------------------------
# primitive: pdf_shaping.draw_text / text_width vs. HarfBuzz
# ---------------------------------------------------------------------------

WORDS = list(KNOWN_GOOD) + [
    "कर्मचारी", "मुख्यमंत्री", "प्रशासन,",
    # Latin first, Devanagari later: must still be shaped
    "Generated by Stellura (स्टेल्यूरा)  \u2022  Developed by", "HQ-विभाग", "Jaipur(क्षत्रिय)",
]


@pytest.mark.parametrize("align", ["left", "center", "right"])
def test_draw_text_places_every_glyph_where_harfbuzz_does(align):
    size, anchor, pitch = 20, 300, 40
    height = pitch * len(WORDS) + 40
    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=(600, height))
    c.setFont("HindiFont", size)
    for i, word in enumerate(WORDS):
        pdf_shaping.draw_text(c, anchor, 20 + pitch * i, word, align)
    c.save()

    page = pdf_pages(buf.getvalue())[0]
    lines = {}
    for _code, _gid, (x, y) in page_glyphs(page):
        lines.setdefault(round((height - 20 - y) / pitch), []).append((x, y))

    for i, word in enumerate(WORDS):
        ref, width = hb_reference(word, size)
        assert pdf_shaping.text_width(word, "HindiFont", size) == pytest.approx(width, abs=0.01), word
        left = {"left": anchor, "center": anchor - width / 2, "right": anchor - width}[align]
        drawn = lines[i]
        assert len(drawn) == len(ref), f"{word!r}: {len(drawn)} glyphs drawn, HarfBuzz makes {len(ref)}"
        baseline = height - (20 + pitch * i)
        for (x, y), expected in zip(drawn, ref):
            assert x == pytest.approx(left + expected["x"], abs=0.02), word
            assert y == pytest.approx(baseline - expected["y"], abs=0.02), word


def test_draw_text_without_shaping_support_still_draws(monkeypatch):
    monkeypatch.setattr(pdf_shaping, "SHAPING_AVAILABLE", False)
    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=(300, 100))
    c.setFont("Helvetica", 12)
    pdf_shaping.draw_text(c, 150, 50, "Plain Latin", "center")
    c.save()
    assert "Plain Latin" in pdf_pages(buf.getvalue())[0].get_text()


# ---------------------------------------------------------------------------
# cluster handling / long-word wrapping
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("word, expected", [
    ("स्त्री", ["स्त्री"]),
    ("क्षत्रिय", ["क्ष", "त्रि", "य"]),
    ("विभाग", ["वि", "भा", "ग"]),
    ("क्रांति", ["क्रां", "ति"]),
    ("पुलिस", ["पु", "लि", "स"]),
    ("abc", ["a", "b", "c"]),
])
def test_clusters_keep_aksharas_whole(word, expected):
    assert list(pdf_shaping.clusters(word)) == expected


def test_fit_markup_escapes_and_leaves_latin_alone():
    assert pdf_shaping.fit_markup("A & B <c>", "HindiFont", 7, 40) == "A &amp; B &lt;c&gt;"
    assert pdf_shaping.fit_markup(None, "HindiFont", 7, 40) == ""
    assert pdf_shaping.fit_markup("विभाग & पुलिस", "HindiFont", 7, 200) == "विभाग &amp; पुलिस"


def test_fit_markup_breaks_overlong_words_only_between_aksharas():
    word = "प्रशासनिकसुधारआयोगकीसिफारिशोंकेक्रियान्वयन"
    size, room = 9, 60
    assert pdf_shaping.text_width(word, "HindiFont", size) > room
    pieces = pdf_shaping.fit_markup(word, "HindiFont", size, room).split("<br/>")
    assert len(pieces) > 1
    assert "".join(pieces) == word
    for piece in pieces:
        assert pdf_shaping.text_width(piece, "HindiFont", size) <= room + 0.01
    # no break fell inside a cluster
    assert sum(len(list(pdf_shaping.clusters(p))) for p in pieces) == len(list(pdf_shaping.clusters(word)))


def test_truncate_never_cuts_a_matra_off_its_base():
    assert pdf_shaping.truncate("विभाग", 2) == "विभा"
    assert pdf_shaping.truncate("abcdef", 3) == "abc"


# ---------------------------------------------------------------------------
# /api/export/pdf  (_build_pdf)
# ---------------------------------------------------------------------------

def export_payload(**over):
    payload = {
        "headers": ["नाम", "पद", "विभाग"],
        "data": [
            ["श्रीवास्तव क्षत्रिय", "ज्ञान प्रकाश", "प्रशासन, मुख्यमंत्री"],
            ["क्रांति किशोर", "स्त्री कर्मचारी", "पुलिस महानिदेशक"],
            ["द्वारा श्रीमती", "Latin text 123", "कर्मचारी"],
        ],
        "title": "हिंदी परीक्षण — श्रीमती",
    }
    payload.update(over)
    return payload


def test_export_pdf_shapes_the_words_from_the_bug_report(client):
    resp = client.post("/api/export/pdf", json=export_payload())
    assert resp.status_code == 200 and resp.data.startswith(b"%PDF")
    pages = pdf_pages(resp.data)
    codes = [c for p in pages for c in page_codes(p)]

    # the column header "विभाग", the cell "पुलिस महानिदेशक", and the words inside other cells
    for word in ("विभाग", "पुलिस", "क्षत्रिय", "ज्ञान", "क्रांति", "स्त्री", "द्वारा", "श्रीमती"):
        assert find_pattern(codes, KNOWN_GOOD[word]), f"{word!r} is not shaped"
    assert unshaped_conjuncts(codes) == []


def test_export_pdf_title_and_footer_are_shaped_too(client):
    # title + the fixed footer ("स्टेल्यूरा") are Paragraphs outside the table
    resp = client.post("/api/export/pdf", json=export_payload(data=[["x", "y", "z"]], title="श्रीमती क्रांति"))
    codes = page_codes(pdf_pages(resp.data)[0])
    assert find_pattern(codes, KNOWN_GOOD["श्रीमती"])
    assert find_pattern(codes, KNOWN_GOOD["क्रांति"])
    assert unshaped_conjuncts(codes) == []


def test_export_pdf_watermark_is_shaped(client):
    # Latin headers/title: the watermark is the only place "विभाग" is drawn
    resp = client.post("/api/export/pdf", json=export_payload(
        headers=["a", "b", "c"], data=[["x", "y", "z"]], title="t", watermark="विभाग"))
    codes = page_codes(pdf_pages(resp.data)[0])
    assert count_pattern(codes, KNOWN_GOOD["विभाग"]) == 1
    assert not find_pattern(codes, [0x935, 0x93F, 0x92D])  # unshaped order


def test_export_pdf_long_hindi_word_wraps_without_missing_glyphs(client):
    word = "प्रशासनिकसुधारआयोगकीसिफारिशोंकेक्रियान्वयन"
    cols = 14  # narrow columns force the over-wide word to wrap
    resp = client.post("/api/export/pdf", json=export_payload(
        headers=[f"c{i}" for i in range(cols)], data=[[word] * cols], title="t", orientation="portrait"))
    assert resp.status_code == 200
    glyphs = [g for p in pdf_pages(resp.data) for g in page_glyphs(p)]
    assert glyphs
    assert [g for g in glyphs if g[1] == 0] == [], "missing-glyph boxes (.notdef) were drawn"
    assert unshaped_conjuncts([g[0] for g in glyphs]) == []


MIXED_CELLS = ["HQ-विभाग", "Jaipur(विभाग)", "ABCविभाग", "विभागABC", "<b>x</b> विभाग & Co"]


def test_export_pdf_shapes_hindi_glued_to_latin(client):
    """ReportLab picks one script per word: "HQ-विभाग" was shaped as Latin."""
    resp = client.post("/api/export/pdf", json=export_payload(
        headers=["a", "b", "c", "d", "e"], data=[MIXED_CELLS], title="t"))
    assert resp.status_code == 200
    codes = [c for p in pdf_pages(resp.data) for c in page_codes(p)]
    assert count_pattern(codes, KNOWN_GOOD["विभाग"]) == len(MIXED_CELLS)
    assert unshaped_conjuncts(codes) == []
    # markup characters in cell data are shown literally, not interpreted
    assert "<b>x</b>" in "".join(p.get_text() for p in pdf_pages(resp.data))


def test_export_pdf_latin_cells_are_untouched(client):
    rows = [["Rajasthan Police HQ", "A & B <x>", "12345"]]
    resp = client.post("/api/export/pdf", json={"headers": ["a", "b", "c"], "data": rows, "title": "Latin"})
    assert resp.status_code == 200
    text = pdf_pages(resp.data)[0].get_text()
    assert "Rajasthan Police HQ" in text and "A & B <x>" in text and "12345" in text


def test_export_pdf_logo_badge_holds_its_whole_text(client):
    """The badge used to be a fixed 80pt pill: the white text overflowed it and vanished."""
    resp = client.post("/api/export/pdf", json=export_payload())
    page = pdf_pages(resp.data)[0]

    accent = (0x63 / 255, 0x66 / 255, 0xF1 / 255)  # #6366F1
    badges = [
        d["rect"] for d in page.get_drawings()
        if d.get("fill") and all(abs(a - b) < 0.01 for a, b in zip(d["fill"], accent))
        and d["rect"].y0 < 60 and d["rect"].height < 40   # top-left pill, not the table header
    ]
    assert len(badges) == 1, "logo badge not found"
    badge = badges[0]

    badge_spans = [
        s for s in page.get_texttrace()
        if s["bbox"][0] >= badge.x0 - 1 and s["bbox"][1] < badge.y1 and s["bbox"][3] > badge.y0
    ]
    chars = [ch for s in badge_spans for ch in s["chars"]]
    text = "".join(chr(ch[0]) for ch in chars if not _is_pua(ch[0]))
    assert text.replace(" ", "") == "Stellura—DataVisionStudio"

    left = min(ch[3][0] for ch in chars)
    right = max(ch[3][2] for ch in chars)
    assert left >= badge.x0 + 2 and right <= badge.x1 - 2, (left, right, tuple(badge))
    # comfortable, roughly symmetric padding left/right
    assert abs((left - badge.x0) - (badge.x1 - right)) < 2.5

    # vertically centred: cap-height gap above == gap below the baseline
    size = badge_spans[0]["size"]
    baseline = chars[0][2][1]
    top_gap = (baseline - 0.714 * size) - badge.y0
    bottom_gap = badge.y1 - baseline
    assert top_gap > 3 and bottom_gap > 3
    assert abs(top_gap - bottom_gap) < 1.5


@pytest.mark.parametrize("orientation, page_size", [("landscape", "a4"), ("portrait", "letter")])
def test_export_pdf_badge_fits_in_every_layout(client, orientation, page_size):
    resp = client.post("/api/export/pdf", json=export_payload(orientation=orientation, pageSize=page_size))
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# /api/generate-report  (_build_report_pdf)
# ---------------------------------------------------------------------------

def report_payload(**over):
    rows = [["क्षत्रिय ज्ञान", "विभाग पुलिस", 100 + i * 7, "जयपुर" if i % 2 else ""] for i in range(25)]
    payload = {
        "headers": ["नाम", "विभाग", "वेतन", "ज़िला"],
        "data": rows,
        "language": "hi",
        "companyName": "विभाग पुलिस",
        "reportTitle": "क्षत्रिय ज्ञान श्रीमती",
        "preparedFor": "द्वारा क्रांति स्त्री",
        "description": "क्रांति स्त्री",
    }
    payload.update(over)
    return payload


def test_report_pdf_shapes_hindi_on_the_cover_and_every_page(client):
    resp = client.post("/api/generate-report", json=report_payload())
    assert resp.status_code == 200 and resp.data.startswith(b"%PDF")
    pages = pdf_pages(resp.data)
    assert len(pages) >= 5

    cover = page_codes(pages[0])  # drawn on the canvas (draw_text), centred
    for word in ("विभाग", "पुलिस", "क्षत्रिय", "ज्ञान", "श्रीमती", "द्वारा", "क्रांति", "स्त्री"):
        assert find_pattern(cover, KNOWN_GOOD[word]), f"cover: {word!r} is not shaped"

    for number, page in enumerate(pages, start=1):
        assert unshaped_conjuncts(page_codes(page)) == [], f"page {number} has unshaped conjuncts"

    # page header (canvas, right-aligned) repeats the title on pages 2+
    assert find_pattern(page_codes(pages[1]), KNOWN_GOOD["श्रीमती"])


def test_report_pdf_table_cells_are_shaped(client):
    resp = client.post("/api/generate-report", json=report_payload())
    pages = pdf_pages(resp.data)
    codes = [c for p in pages[1:] for c in page_codes(p)]
    # "Top 10 records" table: "क्षत्रिय ज्ञान" / "विभाग पुलिस" cells
    assert find_pattern(codes, KNOWN_GOOD["क्षत्रिय"])
    assert find_pattern(codes, KNOWN_GOOD["विभाग"])


def test_report_pdf_english_report_still_builds(client):
    resp = client.post("/api/generate-report", json=report_payload(
        language="en", companyName="Rajasthan Police", reportTitle="Annual Report",
        preparedFor="DGP", description="English description"))
    assert resp.status_code == 200
    first = pdf_pages(resp.data)[0].get_text()
    assert "Annual Report" in first and "Rajasthan Police" in first


# ---------------------------------------------------------------------------
# graceful degradation + proof the detector can see unshaped output
# ---------------------------------------------------------------------------

def test_without_shaping_pdfs_still_build_but_the_detector_flags_them(client, monkeypatch):
    monkeypatch.setattr(pdf_shaping, "SHAPING_AVAILABLE", False)
    monkeypatch.setattr(pdf_shaping, "PARA_SHAPING", {})
    resp = client.post("/api/export/pdf", json=export_payload())
    assert resp.status_code == 200 and resp.data.startswith(b"%PDF")
    codes = [c for p in pdf_pages(resp.data) for c in page_codes(p)]
    assert unshaped_conjuncts(codes), "detector failed to recognise unshaped Devanagari"
    assert not find_pattern(codes, KNOWN_GOOD["विभाग"])
    # extracted text is still the plain Unicode (that is why text extraction cannot be the test)
    assert "विभाग" in "".join(p.get_text() for p in pdf_pages(resp.data))
