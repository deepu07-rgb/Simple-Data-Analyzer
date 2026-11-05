"""The user guide (English + Hindi): it is built from tools/guide_content.py, works offline, and names real buttons."""
import os
import re
import subprocess
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import guide_content as G  # noqa: E402


@pytest.fixture(scope="module")
def built():
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build_guide.py")], check=True, capture_output=True)
    return open(os.path.join(ROOT, "static", "guide", "guide.html"), encoding="utf-8").read()


def test_every_section_and_block_has_both_languages():
    assert len(G.SECTIONS) >= 15
    for s in G.SECTIONS:
        assert s["en"].strip() and s["hi"].strip()
        for b in s["blocks"]:
            pairs = {"p": [b[1:3]], "tip": [b[1:3]], "warn": [b[1:3]], "steps": b[1] if b[0] == "steps" else [], "list": b[1] if b[0] == "list" else [],
                     "keys": [x[1:] for x in b[1]] if b[0] == "keys" else []}[b[0]]
            for en, hi in pairs:
                assert en.strip() and hi.strip(), (s["id"], en[:40])
                assert re.search(r"[ऀ-ॿ]", hi), "the Hindi text must contain Devanagari: " + hi[:40]


def test_html_is_offline_and_complete(built):
    assert not re.search(r"(src|href)=[\"']https?://", built), "the guide must not load anything from the internet"
    assert "url(http" not in built
    for s in G.SECTIONS:
        assert 'id="%s"' % s["id"] in built
    assert "purohitneeraj87@gmail.com" in built and "Senior Assistant" not in built
    assert 'data-l="en"' in built and 'data-l="hi"' in built and 'data-l="bi"' in built and "sda_ui_language" in built


def test_guide_names_buttons_that_really_exist():
    """The guide must not invent labels: tiles and buttons it tells people to click are in the built app."""
    from tools import build  # noqa: F401  (ensures the build module imports)
    page = open(os.path.join(ROOT, "dist", "Stellura.html"), encoding="utf-8").read() if os.path.exists(os.path.join(ROOT, "dist", "Stellura.html")) else ""
    if not page:
        subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build.py")], check=True, capture_output=True)
        page = open(os.path.join(ROOT, "dist", "Stellura.html"), encoding="utf-8").read()
    for label in ["Open a file", "Clean a messy file", "Combine files", "Ask a question", "Open a large file", "Open a project", "Make this month", "What changed since last month?",
                  "Pending cases by age", "Write letters from data", "Find the same person", "Charts for my data", "Pin to board", "Auto charts", "Work on a copy",
                  "Group &amp; chart", "Save these cleaning steps as a recipe", "Fill the report", "Download the filled report (Excel)", "Show all rows",
                  "Save this week", "Mark them in a new column", "Add suggested charts", "Print / Save as PDF"]:
        assert label in page or label.replace("&amp;", "&") in page, "the guide mentions “%s” but the app has no such label" % label
    for hi in ["फ़ाइल खोलें", "बिगड़ी फ़ाइल साफ़ करें", "फ़ाइलें जोड़ें", "प्रश्न पूछें", "बड़ी फ़ाइल खोलें", "प्रोजेक्ट खोलें", "पिछले माह से क्या बदला?", "आयु के अनुसार लंबित प्रकरण",
               "डेटा से पत्र बनाएँ", "एक ही व्यक्ति खोजें", "सभी पंक्तियाँ दिखाएँ", "बोर्ड पर लगाएँ", "सुझाए चार्ट जोड़ें"]:
        assert hi in page, "Hindi label missing in the app: " + hi


def test_word_file_has_hindi_with_a_devanagari_font(built):
    from docx import Document
    d = Document(os.path.join(ROOT, "docs", "Stellura-User-Guide.docx"))
    text = "\n".join(p.text for p in d.paragraphs)
    assert "Stellura — How to use" in text and "उपयोग कैसे करें" in text and "Neeraj Purohit" in text
    xml = d.element.xml
    assert 'w:cs="Mangal"' in xml and "hi-IN" in xml
    assert len(d.paragraphs) > 200


def test_guide_is_served_by_the_app():
    import app as app_mod
    c = app_mod.app.test_client()
    r = c.get("/static/guide/guide.html")
    assert r.status_code == 200 and b"Stellura" in r.data
    r2 = c.get("/static/fonts/NotoSansDevanagari-Regular.ttf")
    assert r2.status_code == 200
