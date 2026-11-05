"""
Browser-side PDFs (jsPDF): Hindi must be drawn by the browser, not garbled by jsPDF.

The dashboard, chart, audit-trail and client-fallback PDFs are built in the page by
jsPDF, whose built-in fonts cannot draw Devanagari (it came out as symbols such as
"9? &@ *0@").  static/js/pdf-text.js has the browser draw those strings and places them
in the PDF as images.  These tests load the real page in headless Chromium, call the real
export functions, and inspect the PDFs that come out.

What is checked, and against what:

* widths of the placed Hindi images match HarfBuzz's advance for the same string and size
  (``uharfbuzz`` driven directly), which a missing font or an unshaped fallback would not;
* the images sit inside the table columns / at the alignment the code asked for, on every
  page of a multi-page table, with the header repeated;
* Latin-only exports are untouched (no images, text still real text);
* the exports still work if the helper script fails to load.

Needs Playwright and a Chromium:  pip install playwright && playwright install chromium
(set STELLURA_CHROMIUM to a browser executable to use one you already have).  Skipped if
either is missing.  The jsPDF libraries the page loads from a CDN are served from
tests/vendor/ so the tests run offline.
"""
import contextlib
import glob
import os
import re
import threading
from pathlib import Path

import pymupdf
import pytest
from werkzeug.serving import make_server

sync_api = pytest.importorskip(
    "playwright.sync_api", reason="pip install playwright && playwright install chromium"
)

import app as stellura  # noqa: E402
from helpers import hb_reference  # noqa: E402

VENDOR = Path(__file__).parent / "vendor"
PAD_FACTOR = 0.3  # the helper pads each side of a raster by 0.15 em


# ---------------------------------------------------------------------------
# fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def base_url():
    server = make_server("127.0.0.1", 0, stellura.app, threaded=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_port}"
    server.shutdown()


@pytest.fixture(scope="module")
def browser():
    with sync_api.sync_playwright() as pw:
        candidates = [os.environ.get("STELLURA_CHROMIUM"), None]
        candidates += sorted(glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome"))
        for path in candidates:
            try:
                browser = pw.chromium.launch(**({"executable_path": path} if path else {}))
            except Exception:
                continue
            yield browser
            browser.close()
            return
        pytest.skip("no Chromium available (playwright install chromium, or set STELLURA_CHROMIUM)")


@contextlib.contextmanager
def open_page(browser, base_url, block_helper=False):
    context = browser.new_context(accept_downloads=True)
    page = context.new_page()
    page.js_errors = []
    page.on("pageerror", lambda e: page.js_errors.append(str(e)))

    def route(r):
        url = r.request.url
        if url.startswith(base_url):
            return r.abort() if block_helper and url.endswith("/static/js/pdf-text.js") else r.continue_()
        if "jspdf.umd.min.js" in url:
            return r.fulfill(content_type="text/javascript", body=(VENDOR / "jspdf.umd.min.js").read_bytes())
        if "jspdf.plugin.autotable" in url:
            return r.fulfill(content_type="text/javascript",
                             body=(VENDOR / "jspdf.plugin.autotable.min.js").read_bytes())
        return r.fulfill(content_type="text/javascript", body="")  # every other CDN script: offline

    page.route("**/*", route)
    page.goto(base_url + "/")
    page.wait_for_function("window.jspdf && window.jspdf.jsPDF && typeof generateClientPDF === 'function'")
    try:
        yield page
    finally:
        context.close()


def download(page, script):
    """Run *script* in the page and return the bytes of the PDF it downloads."""
    with page.expect_download(timeout=30000) as info:
        page.evaluate(script)
    return Path(info.value.path()).read_bytes()


# ---------------------------------------------------------------------------
# scenarios (the real export functions, fed minimal state)
# ---------------------------------------------------------------------------

AUDIT_TITLE = "Stellura Audit Trail / ऑडिट रिकॉर्ड"
AUDIT_DESCRIPTIONS = [
    "Imported file: कर्मचारी_सूची.xlsx (5,000 rows)",
    "विभाग के अनुसार वेतन का विश्लेषण — क्षत्रिय ज्ञान",
    "Chart created: वेतन by विभाग",
]
AUDIT_JS = """() => {
  const now = Date.now(); const mk = (i, actor, action, label) => ({ id: 'e' + i, ts: now - (10 - i) * 60000, actor, action, label, hash: 'abcd123' + i });
  DD.provenance = [mk(1, 'user', 'import', %r), mk(2, 'ai', 'insight', %r), mk(3, 'module', 'chart', %r), mk(4, 'user', 'export', 'Exported PDF report')];
  _pvSelectedId = null; window.uiLanguage = 'hi'; _pvExportPDF();
}""" % tuple(AUDIT_DESCRIPTIONS)

CLIENT_HEADERS = ["नाम", "पद", "Salary", "विभाग"]
CLIENT_ROWS = [
    ["श्रीवास्तव क्षत्रिय", "ज्ञान प्रकाश", "1200", "प्रशासन, मुख्यमंत्री"],
    ["क्रांति किशोर", "स्त्री कर्मचारी", "900", "पुलिस महानिदेशक"],
    ["Latin Name", "Clerk", "500", "HQ-जयपुर"],
    ["द्वारकाप्रसाद", "प्रशासनिकसुधारआयोगकीसिफारिशोंकेक्रियान्वयन", "77", "Jaipur(क्षत्रिय)"],
]
CLIENT_TITLE = "हिंदी परीक्षण — श्रीमती"


def client_js(title, headers, rows, orientation="landscape", fmt=False, extra=""):
    return """() => {
  headers = %r; const rows = %r; rawData = rows; %s
  generateClientPDF(%r, 'a4', %r, rows.map((_, i) => i), rows, %s);
}""" % (headers, rows, extra, title, orientation, "true" if fmt else "false")


CHART_DESC = "यह चार्ट क्षत्रिय एवं ज्ञान संबंधी आँकड़ों को दर्शाता है।"
CHART_JS = """() => {
  const cv = document.getElementById('chartCanvas'); cv.width = 800; cv.height = 400;
  const g = cv.getContext('2d'); g.fillStyle = '#eef'; g.fillRect(0, 0, 800, 400);
  chartInstance = {};
  document.getElementById('chartTitleInput').value = 'विभागवार वेतन — श्रीमती';
  document.getElementById('chartDescInput').value = %r;
  downloadChartPDF();
}""" % CHART_DESC

DASHBOARD_TITLE = "विभाग रिपोर्ट — पुलिस"
DASHBOARD_FOOTER = "नीरज पुरोहित  |  वरिष्ठ सहायक  |  राजस्थान पुलिस"
DASHBOARD_JS = """() => {
  document.getElementById('dashboard-view').classList.add('visible');
  window.html2canvas = () => { const c = document.createElement('canvas'); c.width = 1200; c.height = 700;
    const g = c.getContext('2d'); g.fillStyle = '#0d0a1a'; g.fillRect(0, 0, 1200, 700); return Promise.resolve(c); };
  document.getElementById('documentName').textContent = %r;
  localStorage.setItem('userProfile', JSON.stringify({ name: 'नीरज पुरोहित', desig: 'वरिष्ठ सहायक', org: 'राजस्थान पुलिस' }));
  exportDashboardPDF();
}""" % DASHBOARD_TITLE


# ---------------------------------------------------------------------------
# helpers on the resulting PDFs
# ---------------------------------------------------------------------------

def open_pdf(data):
    return pymupdf.open(stream=data, filetype="pdf")


def images(page):
    """Placed images as Rects, in reading order."""
    rects = [pymupdf.Rect(i["bbox"]) for i in page.get_image_info()]
    return sorted(rects, key=lambda r: (round(r.y0 * 2), r.x0))


def advance(rect, size):
    """The text advance an image of this placed size stands for (it carries 0.15 em padding a side)."""
    return rect.width - PAD_FACTOR * size


def assert_hb_width(rect, text, size):
    expected = hb_reference(text, size)[1]
    assert advance(rect, size) == pytest.approx(expected, abs=max(1.0, 0.015 * expected)), text


def ink_bottom(pdf, page, rect):
    """y of the lowest inked pixel of the image placed at *rect* (page coordinates)."""
    for img in page.get_images(full=True):
        placed = [pymupdf.Rect(i["bbox"]) for i in page.get_image_info(xrefs=True) if i["xref"] == img[0]]
        if any(abs(r.x0 - rect.x0) < 0.01 and abs(r.y0 - rect.y0) < 0.01 for r in placed):
            mask = pymupdf.Pixmap(pdf, img[1])                   # the soft mask carries the alpha
            rows = [y for y in range(mask.height)
                    if max(mask.samples[y * mask.stride:y * mask.stride + mask.width]) > 100]
            return rect.y0 + (rows[-1] + 1) * rect.height / mask.height
    raise AssertionError("image not found")


def word_box(page, word):
    hits = [w for w in page.get_text("words") if w[4] == word]
    assert hits, f"{word!r} is not in the text layer"
    return pymupdf.Rect(hits[0][:4])


# ---------------------------------------------------------------------------
# audit trail (_pvExportPDF)
# ---------------------------------------------------------------------------

def test_audit_pdf_draws_hindi_with_harfbuzz_widths(browser, base_url):
    with open_page(browser, base_url) as page:
        data = download(page, AUDIT_JS)
        assert page.js_errors == []
    pdf = open_pdf(data)
    pg = pdf[0]
    imgs = images(pg)
    # title, three Hindi descriptions, then the hash-chain status line (check/cross mark)
    assert len(imgs) == 5, imgs
    assert_hb_width(imgs[0], AUDIT_TITLE, 16)
    for rect, text in zip(imgs[1:4], AUDIT_DESCRIPTIONS):
        assert_hb_width(rect, text, 7)

    # the Hindi cells are images, not (garbled) text; the Latin cells are still text
    for rect in imgs[1:4]:
        assert pg.get_textbox(rect + (-1, -1, 1, 1)).strip() == ""
    text = pg.get_text()
    for word in ("Time", "Actor", "Description", "user", "import", "insight", "module", "chart", "export"):
        assert word in text

    # descriptions sit in the Description column, one per row, inside the table
    description_x0 = word_box(pg, "Description").x0
    assert all(abs(r.x0 + 0.15 * 7 - description_x0) < 6 for r in imgs[1:4])
    assert imgs[1].y0 < imgs[2].y0 < imgs[3].y0 < imgs[4].y0


# ---------------------------------------------------------------------------
# client fallback (generateClientPDF)
# ---------------------------------------------------------------------------

def hindi_cells(rows):
    return [[(c, ci) for ci, c in enumerate(row) if any("\u0900" <= ch <= "\u097f" for ch in c)] for row in rows]


def test_client_pdf_table_cells_are_drawn_in_their_columns(browser, base_url):
    with open_page(browser, base_url) as page:
        data = download(page, client_js(CLIENT_TITLE, CLIENT_HEADERS, CLIENT_ROWS))
        assert page.js_errors == []
    pg = open_pdf(data)[0]
    margin, ncols = 8 * 72 / 25.4, len(CLIENT_HEADERS)
    col_w = (pg.rect.width - 2 * margin) / ncols

    head = word_box(pg, "Salary")                       # the only Latin header cell
    body = [r for r in images(pg) if r.y0 > head.y1]
    expected = [(text, col) for row in hindi_cells(CLIENT_ROWS) for text, col in row]
    assert len(body) == len(expected), (len(body), len(expected))

    for rect, (text, col) in zip(body, expected):
        assert_hb_width(rect, text, 7.5)
        lo, hi = margin + col * col_w, margin + (col + 1) * col_w
        assert lo <= rect.x0 and rect.x1 <= hi, f"{text!r} spills out of column {col}"
        assert pg.get_textbox(rect + (-1, -1, 1, 1)).strip() == ""

    # Latin cells in the same rows are still text
    text = pg.get_text()
    for word in ("Latin", "Name", "Clerk", "500", "1200", "Salary"):
        assert word in text


def test_client_pdf_multipage_table_wraps_inside_columns_and_repeats_header(browser, base_url):
    headers = ["क्रम", "नाम व पद", "विभाग / कार्यालय", "टिप्पणी", "Amount"]
    sentence = "प्रशासनिक सुधार आयोग की सिफारिशों के क्रियान्वयन हेतु मुख्यमंत्री कार्यालय द्वारा जारी निर्देश"
    rows = [[str(i + 1), "श्रीवास्तव क्षत्रिय" if i % 3 else f"Latin {i}", "पुलिस महानिदेशक कार्यालय, जयपुर",
             sentence if i % 4 else "ok", str(1000 + i)] for i in range(70)]
    # conditional formatting recolours cells; Hindi text must follow
    extra = ("cfRules = [{ col: 0, cond: 'gt', value: '60', color: '#b91c1c' },"
             " { col: 1, cond: 'contains', value: 'क्षत्रिय', color: '#065f46' }];")
    with open_page(browser, base_url) as page:
        data = download(page, client_js("बड़ी तालिका", headers, rows, "portrait", fmt=True, extra=extra))
        assert page.js_errors == []
    pdf = open_pdf(data)
    assert len(pdf) >= 3

    margin = 8 * 72 / 25.4
    body_images = 0
    for number, pg in enumerate(pdf, start=1):
        col_w = (pg.rect.width - 2 * margin) / len(headers)
        amount = word_box(pg, "Amount")
        header_images = [r for r in images(pg) if amount.y0 - 3 <= r.y0 <= amount.y1 + 3 and r.x1 < amount.x0]
        assert len(header_images) == 4, f"page {number}: Hindi header not repeated"
        body = [r for r in images(pg) if r.y0 > amount.y1 + 3]
        assert body, f"page {number} has no Hindi body cells"
        body_images += len(body)
        for rect in body:
            col = int((rect.x0 + 2 - margin) // col_w)
            assert margin + col * col_w - 0.5 <= rect.x0 and rect.x1 <= margin + (col + 1) * col_w + 0.5, \
                f"page {number}: cell image spills out of its column"
            assert rect.y1 <= pg.rect.height - margin, f"page {number}: image runs off the page"
        # consecutive lines of one wrapped cell are a Devanagari-friendly 1.4 em apart
        pitches = [b.y0 - a.y0 for a in body for b in body if abs(a.x0 - b.x0) < 0.01 and 0 < b.y0 - a.y0 < 14]
        assert pitches and all(p == pytest.approx(1.4 * 7.5, abs=0.3) for p in pitches), pitches

    # nothing was lost: one line for the name and the office cell, three for the long remark
    expected = sum((1 if i % 3 else 0) + 1 + (3 if i % 4 else 0) for i in range(len(rows)))
    assert body_images == expected, "Hindi cell lines are missing or duplicated across the page breaks"

    # ... and every remark cell shows its three lines, in order, whole (a row split across a
    # page break would show a different part of the cell, or the same lines twice)
    remark_lines = ["प्रशासनिक सुधार आयोग की", "सिफारिशों के क्रियान्वयन हेतु", "मुख्यमंत्री कार्यालय द्वारा जारी निर्देश"]
    remarks = 0
    for pg in pdf:
        col3_x = margin + 3 * (pg.rect.width - 2 * margin) / len(headers)
        col = sorted((r for r in images(pg) if abs(r.x0 + 1.2 - (col3_x + 2.2 * 72 / 25.4)) < 1.5), key=lambda r: r.y0)
        cells, current = [], []
        for r in col:
            if current and r.y0 - current[-1].y0 > 14:
                cells.append(current)
                current = []
            current.append(r)
        cells.append(current)
        for cell in cells:
            if cell[0].y0 < word_box(pg, "Amount").y1:
                continue                                    # the repeated header cell
            assert len(cell) == 3, [round(r.y0, 1) for r in cell]
            for rect, line in zip(cell, remark_lines):
                assert_hb_width(rect, line, 7.5)
            remarks += 1
    assert remarks == sum(1 for i in range(len(rows)) if i % 4)


def test_client_pdf_hindi_shares_a_baseline_with_latin_text_in_the_same_row(browser, base_url):
    """Latin text is drawn by jsPDF, Hindi by the helper: they must line up (0.85 em baseline)."""
    with open_page(browser, base_url) as page:
        data = download(page, client_js("t", ["a", "b"], [["Hxx HHH", "विभाग"], ["HHH", "विभाग विभाग"]]))
    pdf = open_pdf(data)
    pg = pdf[0]
    latin = sorted((sp["chars"][0][2][1], sp["size"]) for sp in pg.get_texttrace()
                   if sp["chars"] and chr(sp["chars"][0][0]) == "H" and sp["size"] == 7.5)  # body cells only
    hindi = [r for r in images(pg) if r.y0 > word_box(pg, "b").y1]
    assert len(latin) == 2 and len(hindi) == 2
    for (latin_baseline, size), rect in zip(latin, hindi):
        assert size == 7.5
        assert ink_bottom(pdf, pg, rect) == pytest.approx(latin_baseline, abs=0.8)


def test_client_pdf_with_only_latin_text_is_untouched(browser, base_url):
    with open_page(browser, base_url) as page:
        data = download(page, client_js("Latin only", ["Name", "Role", "Amount"],
                                        [["Asha Verma", "Clerk", "1200"], ["Ravi Kumar", "Inspector", "900"]]))
    pg = open_pdf(data)[0]
    assert images(pg) == []
    text = pg.get_text()
    for word in ("Asha", "Verma", "Inspector", "Latin", "only", "Stellura"):
        assert word in text


# ---------------------------------------------------------------------------
# chart (downloadChartPDF) and dashboard (exportDashboardPDF)
# ---------------------------------------------------------------------------

def test_chart_pdf_title_and_description_are_drawn(browser, base_url):
    with open_page(browser, base_url) as page:
        data = download(page, CHART_JS)
        desc_size = int(page.evaluate("parseInt(document.getElementById('chartTextSize')?.value || '10', 10)"))
        assert page.js_errors == []
    pg = open_pdf(data)[0]
    imgs = images(pg)
    assert len(imgs) == 3, imgs                      # title, the chart itself, description
    title, chart, description = imgs
    assert chart.width > 500 and chart.y0 > title.y1  # the chart image is placed below the title
    assert abs(title.x0 + 1.2 - 15 * 72 / 25.4) < 3   # title starts at the 15 mm left margin
    assert_hb_width(description, CHART_DESC, desc_size)
    assert description.y0 > chart.y1


def test_dashboard_pdf_header_and_footer_are_drawn_and_aligned(browser, base_url):
    with open_page(browser, base_url) as page:
        data = download(page, DASHBOARD_JS)
        assert page.js_errors == []
    pg = open_pdf(data)[0]
    imgs = images(pg)
    assert len(imgs) == 4, imgs                      # brand chip, document title, dashboard image, footer
    top = [r for r in imgs if r.y1 < 50]
    assert len(top) == 2
    chip, title = sorted(top, key=lambda r: r.x0)
    margin = 10 * 72 / 25.4
    assert abs(title.x1 - 1.0 - (pg.rect.width - margin)) < 2.5          # right-aligned at the margin
    assert chip.x0 > (10 + 77 - 1) * 72 / 25.4 - 3                       # inside the second badge
    footer = max(imgs, key=lambda r: r.y0)
    assert abs((footer.x0 + footer.x1) / 2 - pg.rect.width / 2) < 1.5    # centred
    assert "Developed" in pg.get_text() and "DISCLAIMER" in pg.get_text()


# ---------------------------------------------------------------------------
# the helper itself, in the browser
# ---------------------------------------------------------------------------

def test_helper_measures_like_harfbuzz_and_knows_what_jspdf_cannot_draw(browser, base_url):
    text = "क्षत्रिय ज्ञान श्रीमती द्वारा क्रांति स्त्री"
    with open_page(browser, base_url) as page:
        r = page.evaluate("""async (text) => {
          await StelluraPdfText.ready();
          const T = StelluraPdfText, doc = new jspdf.jsPDF();
          const wrapped = T.wrapLines('प्रशासनिकसुधारआयोगकीसिफारिशोंकेक्रियान्वयन स्त्री क्षत्रिय', 20, 10, '', doc.internal.scaleFactor);
          return {
            widthPt: T.width(doc, text, 10, '') * doc.internal.scaleFactor,
            raster: ['Plain Latin', '12/34 - (x) | 5,000', 'em dash — bullet •'].map(s => T.needsRaster(doc, s)),
            rasterYes: ['विभाग', 'HQ-विभाग', '₹ 500', '✓ ok', 'café ×'].map(s => T.needsRaster(doc, s)),
            clusters: T.clusters('स्त्री क्षत्रिय'),
            wrapped,
            wrappedWidths: wrapped.map(l => T.width(doc, l, 10, '')),
          };
        }""", text)
    shaped = hb_reference(text, 10)[1]
    unshaped = sum(hb_reference(ch, 10)[1] for ch in text)
    assert abs(unshaped - shaped) > 0.03 * shaped, "test text must distinguish shaped from unshaped widths"
    assert r["widthPt"] == pytest.approx(shaped, rel=0.01)

    assert r["raster"] == [False, False, False]
    assert r["rasterYes"] == [True] * 5
    assert r["clusters"] == ["स्त्री", " ", "क्ष", "त्रि", "य"]
    # an over-long word wraps between aksharas and every line fits
    assert len(r["wrapped"]) > 2
    assert "".join(r["wrapped"]).replace(" ", "") == "प्रशासनिकसुधारआयोगकीसिफारिशोंकेक्रियान्वयनस्त्रीक्षत्रिय"
    assert all(w <= 20 + 0.01 for w in r["wrappedWidths"])
    for line in r["wrapped"]:
        assert line == "" or not re.match("[\u093e-\u094d\u0900-\u0903]", line), \
            "a line starts with a dependent vowel sign"


# ---------------------------------------------------------------------------
# degradation
# ---------------------------------------------------------------------------

def test_exports_still_work_if_the_helper_script_is_missing(browser, base_url):
    with open_page(browser, base_url, block_helper=True) as page:
        assert page.evaluate("typeof window.StelluraPdfText") == "undefined"
        latin = download(page, client_js("Latin only", ["Name", "Role"], [["Asha Verma", "Clerk"]]))
        hindi = download(page, client_js(CLIENT_TITLE, CLIENT_HEADERS, CLIENT_ROWS))
        audit = download(page, AUDIT_JS)
        assert page.js_errors == []
    assert "Asha" in open_pdf(latin)[0].get_text()
    assert images(open_pdf(hindi)[0]) == []          # plain jsPDF: no helper, no images (and no crash)
    assert len(open_pdf(audit)) == 1
