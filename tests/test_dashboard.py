"""Dashboard export: PowerPoint (editable text + chart pictures) and an image-based, Hindi-safe PDF."""
import base64
import io

import pytest
from PIL import Image, ImageDraw
from pptx import Presentation

import app as app_mod


@pytest.fixture()
def client():
    app_mod.app.config["TESTING"] = True
    return app_mod.app.test_client()


def png(w=1660, h=1060, color=(109, 91, 208), fmt="PNG"):
    im = Image.new("RGB", (w, h), (255, 255, 255))
    if w > 220 and h > 220:
        ImageDraw.Draw(im).rectangle([100, 100, w - 100, h - 100], fill=color)
    buf = io.BytesIO()
    im.save(buf, fmt)
    return f"data:image/{'png' if fmt == 'PNG' else 'jpeg'};base64," + base64.b64encode(buf.getvalue()).decode()


def body(n=3):
    return {"title": "थाना-वार लंबित प्रकरण", "subtitle": "पुलिस आयुक्तालय, जयपुर", "date": "2025-07-31", "source": "register.xlsx", "lang": "hi",
            "kpis": [{"label": "कुल पंक्तियाँ", "value": "12,450"}, {"label": "राशि का योग", "value": "4.2 Cr"}],
            "slides": [{"title": f"चार्ट {i + 1} — राशि", "caption": ["जयपुर सबसे बड़ा है: 18,40,000 (24%)।", "छोटे समूह अन्य में जोड़े गए।"], "note": "जाँच जारी है", "rows": "3,00,000 पंक्तियाँ", "image": png()} for i in range(n)]}


def test_powerpoint_has_a_cover_and_a_slide_per_chart(client):
    r = client.post("/api/dashboard/pptx", json=body(3))
    assert r.status_code == 200 and r.headers["X-Slides"] == "4"
    prs = Presentation(io.BytesIO(r.data))
    assert len(prs.slides) == 4 and prs.slide_width > prs.slide_height
    cover = " ".join(sh.text_frame.text for sh in prs.slides[0].shapes if sh.has_text_frame)
    assert "थाना-वार लंबित प्रकरण" in cover and "पुलिस आयुक्तालय, जयपुर" in cover and "12,450" in cover and "4.2 Cr" in cover
    for n, sl in enumerate(list(prs.slides)[1:], start=1):
        texts = " ".join(sh.text_frame.text for sh in sl.shapes if sh.has_text_frame)
        assert f"चार्ट {n} — राशि" in texts and "जयपुर सबसे बड़ा है" in texts and "जाँच जारी है" in texts and "क्या दिखता है" in texts
        pics = [sh for sh in sl.shapes if sh.shape_type == 13]
        assert len(pics) == 1 and pics[0].width > 0
        assert "जयपुर सबसे बड़ा है" in sl.notes_slide.notes_text_frame.text


def test_powerpoint_text_asks_for_a_devanagari_font(client):
    r = client.post("/api/dashboard/pptx", json=body(1))
    xml = Presentation(io.BytesIO(r.data)).slides[1].shapes[1]._element.xml
    assert 'typeface="Nirmala UI"' in xml and "<a:cs" in xml, "Hindi runs must name a complex-script font"


def test_pptx_english_labels_and_empty_and_bad_input(client):
    b = body(1); b["lang"] = "en"; b["note"] = ""
    prs = Presentation(io.BytesIO(client.post("/api/dashboard/pptx", json=b).data))
    assert "WHAT THIS SHOWS" in " ".join(sh.text_frame.text for sh in prs.slides[1].shapes if sh.has_text_frame)
    assert client.post("/api/dashboard/pptx", json={"slides": []}).status_code == 400
    bad = body(1); bad["slides"][0]["image"] = "data:text/html;base64,PGI+"
    assert client.post("/api/dashboard/pptx", json=bad).status_code == 400
    bad["slides"][0]["image"] = "data:image/png;base64," + base64.b64encode(b"not an image").decode()
    assert client.post("/api/dashboard/pptx", json=bad).status_code == 400
    assert client.post("/api/dashboard/pptx", json=body(41)).status_code == 400
    huge = body(1); huge["slides"][0]["image"] = png(5200, 100)
    assert client.post("/api/dashboard/pptx", json=huge).status_code == 400


def test_pptx_survives_hostile_text(client):
    b = body(1); b["title"] = "a\x00b\x0bc <script>&"; b["slides"][0]["caption"] = ["x\x08y"]
    r = client.post("/api/dashboard/pptx", json=b)
    assert r.status_code == 200
    assert "<script>" in " ".join(sh.text_frame.text for sh in Presentation(io.BytesIO(r.data)).slides[0].shapes if sh.has_text_frame)


def test_pdf_has_one_page_per_picture(client):
    from pypdf import PdfReader
    pages = [png(1754, 1240, c) for c in [(109, 91, 208), (20, 163, 139), (214, 69, 107)]]
    r = client.post("/api/dashboard/pdf", json={"title": "Dashboard", "pages": pages})
    assert r.status_code == 200 and r.data[:5] == b"%PDF-" and r.headers["X-Pages"] == "3"
    rd = PdfReader(io.BytesIO(r.data))
    assert len(rd.pages) == 3
    w, h = float(rd.pages[0].mediabox.width), float(rd.pages[0].mediabox.height)
    assert abs(w - 842) < 3 and abs(h - 595) < 3, "A4 landscape at 150 dpi"
    assert client.post("/api/dashboard/pdf", json={"pages": []}).status_code == 400
    assert client.post("/api/dashboard/pdf", json={"pages": ["nope"]}).status_code == 400
    jpeg = client.post("/api/dashboard/pdf", json={"pages": [png(800, 600, fmt="JPEG")]})
    assert jpeg.status_code == 200


def test_a_picture_that_would_unpack_to_a_huge_image_is_refused_before_decoding(client):
    im = Image.new("1", (4900, 4900), 1)                      # 24 million pixels: under the side limit, over the pixel limit
    buf = io.BytesIO(); im.save(buf, "PNG")
    bomb = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    assert len(buf.getvalue()) < 100_000
    b = body(1); b["slides"][0]["image"] = bomb
    assert client.post("/api/dashboard/pptx", json=b).status_code == 400
    assert client.post("/api/dashboard/pdf", json={"pages": [bomb]}).status_code == 400
