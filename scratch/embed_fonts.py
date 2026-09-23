"""
embed_fonts.py  —  ONE-TIME, run while ONLINE.

Downloads Inter (400/500/600) + Sora (400/600/700) latin-subset woff2 from Google
Fonts, base64-encodes them, and injects them into BOTH copies of the SPA between the
FONT-EMBED-START / FONT-EMBED-END markers (replacing the Segoe UI alias fallback).

After running, the app uses the real Aetheris typefaces and STILL works fully offline
(the bytes live inside the HTML). Safe to re-run.

    runtime/python/python.exe scratch/embed_fonts.py
"""
import re, base64, urllib.request, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGETS = [ROOT / "download" / "Simple-Data-Analyser.html",
           ROOT / "public" / "Simple-Data-Analyser.html"]

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")


def get(url):
    return urllib.request.urlopen(
        urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30).read()


def build_font_css():
    css = get("https://fonts.googleapis.com/css2?"
              "family=Inter:wght@400;500;600&"
              "family=Sora:wght@400;600;700&display=swap").decode("utf-8")
    blocks = re.split(r"/\*\s*([\w-]+)\s*\*/", css)
    faces = []
    for i in range(1, len(blocks) - 1, 2):
        if blocks[i].strip() != "latin":
            continue
        body = blocks[i + 1]
        fam = re.search(r"font-family:\s*'([^']+)'", body).group(1)
        wght = re.search(r"font-weight:\s*(\d+)", body).group(1)
        style = re.search(r"font-style:\s*(\w+)", body).group(1)
        url = re.search(r"url\(([^)]+)\)\s*format\('woff2'\)", body).group(1)
        faces.append((fam, wght, style, url))
    if not faces:
        sys.exit("ERROR: no latin faces parsed — Google may have changed the API.")
    out = []
    for fam, wght, style, url in faces:
        b64 = base64.b64encode(get(url)).decode("ascii")
        out.append(f"@font-face{{font-family:'{fam}';font-style:{style};font-weight:{wght};"
                   f"font-display:swap;src:url(data:font/woff2;base64,{b64}) format('woff2')}}")
        print(f"  embedded {fam} {wght}", file=sys.stderr)
    return "\n".join(out)


def main():
    print("Fetching Inter + Sora (latin) ...", file=sys.stderr)
    faces_css = build_font_css()
    block = ("/* FONT-EMBED-START : real Inter+Sora embedded by scratch/embed_fonts.py */\n"
             + faces_css + "\n/* FONT-EMBED-END */")
    pat = re.compile(r"/\* FONT-EMBED-START.*?FONT-EMBED-END \*/", re.DOTALL)
    for path in TARGETS:
        raw = path.read_bytes()
        text = raw.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")
        if not pat.search(text):
            print(f"  SKIP (markers not found): {path}", file=sys.stderr)
            continue
        updated = pat.sub(lambda _: block, text)
        path.write_bytes(updated.encode("utf-8"))
        print(f"  updated {path} (LF, {len(path.read_bytes())} bytes)", file=sys.stderr)
    print("Done. Inter + Sora are now embedded and fully offline.", file=sys.stderr)


if __name__ == "__main__":
    main()
