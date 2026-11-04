#!/usr/bin/env python3
"""Build the single-file Stellura web app from its source parts.

    python tools/build.py            # writes dist/Stellura.html
    python tools/build.py --check    # exit 1 if dist/ is older than web/ (used by tests)

web/manifest.txt lists the parts in order:
    @file <path relative to web/>    -> contents copied verbatim
    @text <JSON string>              -> literal text
The output is one self-contained HTML file with no network dependencies.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
OUT = ROOT / "dist" / "Stellura.html"


def build_text():
    parts = []
    for n, raw in enumerate((WEB / "manifest.txt").read_text(encoding="utf-8").splitlines(), 1):
        if not raw.strip() or raw.startswith("#"):
            continue
        kind, _, arg = raw.partition(" ")
        if kind == "@file":
            parts.append((WEB / arg.strip()).read_bytes().decode("utf-8"))
        elif kind == "@text":
            parts.append(json.loads(arg))
        else:
            raise SystemExit(f"manifest.txt line {n}: unknown directive {kind!r}")
    return "".join(parts)


def sources_mtime():
    return max(p.stat().st_mtime for p in WEB.rglob("*") if p.is_file())


def is_stale():
    return not OUT.exists() or OUT.stat().st_mtime < sources_mtime()


def build():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(build_text().encode("utf-8"))
    return OUT


if __name__ == "__main__":
    if "--check" in sys.argv:
        sys.exit(1 if is_stale() else 0)
    out = build()
    print(f"built {out.relative_to(ROOT)} ({out.stat().st_size:,} bytes)")
