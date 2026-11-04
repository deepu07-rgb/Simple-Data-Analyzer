# Stellura (स्टेल्यूरा)

Free, offline, bilingual (Hindi / English) data analysis for offices. Your data never leaves your computer.

## Run it (development)

```bash
pip install -r requirements.txt
python tools/build.py     # optional: app.py builds on demand
python app.py            # http://127.0.0.1:5000  (this PC only)
```

Windows users run `start.bat` (installs the local AI engine on first run) and `stop.bat`.
The server listens on this PC only. To let other PCs on the office network connect, set `STELLURA_HOST=0.0.0.0` deliberately.

## Everyday tasks

- **Home** opens on tasks (open, combine, clean, ask, large file, project). **Simple** mode (default) hides the formatting and formula bars; **Pro** shows everything. The light *Office* look is the default; the dark *Cosmos* look is one click away.
- **Ctrl+K** searches every action in English, Hindi or Hinglish.
- **Clean a messy file** finds title rows, two-row headers, totals, repeated headers, merged-cell blanks, Hindi digits, "2.5 लाख" / "₹1,00,000/-" numbers, mixed dates and old Krutidev text, and shows before → after before changing anything. Steps can be saved as a **recipe** and repeated on next month's file.
- **Combine files** stacks many Excel/CSV files and matches columns by meaning ("थाना" = "Police Station" = "PS Name"), showing anything uncertain for review.

## Large files and projects

- **Large File mode:** files of 10 MB or more (CSV, TSV, XLSX), or *More → Open large file*, open in the local DuckDB engine instead of the browser. You get a fast scrolling grid, sort, search, filters, column profile, group-by with chart, a read-only SQL box, CSV/Excel export of the filtered view, and *Work on a copy* (up to 100,000 matching rows into the full editor).
- **Projects:** *More → Projects* saves the table plus formatting, filters, steps and the audit trail as one `.stellura` file in `~/Stellura/Projects` (change with `STELLURA_HOME`). The file is a zip (`manifest.json`, `state.json`, `data.parquet`); the previous save is kept as `.bak`.
- Settings (environment variables): `STELLURA_ENGINE_MEMORY` (default `1500MB`), `STELLURA_MAX_UPLOAD_MB` (default 1024), `STELLURA_INLINE_ROWS` (projects above this open in Large File mode, default 100000).
- Benchmark: `python tests/bench_engine.py 1000000`.

## Test it

```bash
pip install pytest
python -m pytest tests -q                       # backend + offline-promise checks
node --test tests/unit/*.test.js                # Messy File Fixer + Merge Anything logic (no browser needed)
BASE=http://127.0.0.1:5000 node tests/e2e/core.e2e.js    # browser checks, all external network blocked
STELLURA_HOME=/tmp/stl-home python app.py                  # throw-away projects folder for the next test
BASE=http://127.0.0.1:5000 node tests/e2e/large.e2e.js   # 250,000-row Large File mode + projects
BASE=http://127.0.0.1:5000 node tests/e2e/tasks.e2e.js   # Home, Simple/Pro, command palette, Clean a messy file, Combine files
```

The browser test needs Node.js and Playwright. It fails if any request leaves the PC.

## Layout

| Path | What |
|---|---|
| `app.py` | Local server: file upload, Excel/PDF/report export, AI proxy |
| `engine.py`, `engine_api.py` | DuckDB analytics engine and its HTTP API |
| `projects.py` | `.stellura` project files |
| `web/` | Source of the web app: CSS, HTML and JavaScript parts listed in `web/manifest.txt`. **Edit these.** |
| `tools/build.py` | Builds `dist/Stellura.html` (one offline file) from `web/`. `app.py` rebuilds automatically when sources change |
| `static/` | Libraries and fonts served locally (no internet needed). Licences in `static/js/THIRD_PARTY_LICENSES.txt` |
| `tests/` | pytest and Playwright checks |
| `docs/` | Design documents and the roadmap |
