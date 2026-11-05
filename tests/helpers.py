"""Shared test helpers."""
import re
from pathlib import Path

import uharfbuzz as hb

ROOT = Path(__file__).resolve().parent.parent
FONT_PATH = ROOT / "static" / "fonts" / "NotoSansDevanagari-Regular.ttf"


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
