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

## Report tools

- **Report Autopilot:** show it last month's filled Excel proforma and last month's data once. It works out which calculation produced each cell (count of rows per station, how many were pending, totals, averages, percentages, the total row), proves each rule against last month's numbers, then fills the same proforma from this month's data and keeps your formatting. Recipes remember it for next month. Charts or pictures inside the proforma may be lost when filling.
- **Change Radar:** "what is different this month?" compares two files: how each number moved, where the movement is concentrated, and which records are new, gone or changed.
- **Pendency Radar:** ageing of pending cases by station or officer (0-30, 31-90, 91-180, 181-365, over 365 days), deadline alerts and weekly snapshots.
- **Letters from Data:** one letter per row, or one covering letter with the list, as Word (.docx) or through *Print / Save as PDF* (the browser shapes Hindi correctly).
- **Find the same person:** Hindi/English spelling-tolerant name matching with father's name, place, age and mobile as extra evidence; you confirm every match.

## Charts and table interactions

- **Chart Studio** (*Charts* button): a panel beside the table with **24 chart types** — column, bar, stacked and 100% stacked, column + line, Pareto, waterfall, line, area, stacked area, calendar heat map, pie, donut, rose, funnel, treemap, sunburst, scatter (with trend line), bubble, heat map, radar, histogram, box plot and a single-number gauge. Pick columns, a measure (total, average, count, median, ...), split by another column, group dates by day / month / quarter / financial year, Top N with an honest "Others", order, colours (one is colour-blind safe) and a title. Each chart gets a plain-language sentence made only from computed numbers, in English or Hindi, with lakh / crore labels.
- **Charts are alive:** click a bar, slice, cell or dot and the **table shows exactly those rows** (Ctrl+click adds more, click again to undo); drag a box or range on a scatter chart or histogram to select it. Filtering the table redraws the chart. Zoom with Ctrl+scroll, hover for details, view the data behind the chart, save as a picture, copy to Word / PowerPoint, download the chart's numbers as CSV.
- **Auto charts** (*Insights board*): one click suggests the charts that suit the data, each with the reason ("Where *station* and *status* overlap most"). Pin your own charts to the board.
- **Table:** every column heading has an **ⓘ**: facts (filled, blank, different values, total, average, median, unusual values), a spread picture whose bars are clickable filters, the most common values (click one to show only those rows), earliest / latest / rows per month for dates. Right-click a heading for **data bars, colour scale and traffic lights**, or "Chart this column". Active filters and the chart selection appear as removable chips above the table.
- The chart library is Apache ECharts 5.5.1, shipped in `static/js` (licence in `THIRD_PARTY_LICENSES.txt`); nothing is fetched from the internet.

## Large files and projects

- **Large File mode:** files of 10 MB or more (CSV, TSV, XLSX), or *More → Open large file*, open in the local DuckDB engine instead of the browser. You get a fast scrolling grid, sort, search, filters, column profile, group-by with chart, a read-only SQL box, CSV/Excel export of the filtered view, and *Work on a copy* (up to 100,000 matching rows into the full editor).
- **Projects:** *More → Projects* saves the table plus formatting, filters, steps and the audit trail as one `.stellura` file in `~/Stellura/Projects` (change with `STELLURA_HOME`). The file is a zip (`manifest.json`, `state.json`, `data.parquet`); the previous save is kept as `.bak`.
- Settings (environment variables): `STELLURA_ENGINE_MEMORY` (default `1500MB`), `STELLURA_MAX_UPLOAD_MB` (default 1024), `STELLURA_INLINE_ROWS` (projects above this open in Large File mode, default 100000).
- Benchmark: `python tests/bench_engine.py 1000000`.

## Test it

```bash
pip install pytest
python -m pytest tests -q                       # backend + offline-promise checks
node --test tests/unit/*.test.js                # Fixer, Merge, Name Match, Pendency, Change Radar, Autopilot, Chart engine logic (no browser needed)
BASE=http://127.0.0.1:5000 node tests/e2e/core.e2e.js    # browser checks, all external network blocked
STELLURA_HOME=/tmp/stl-home python app.py                  # throw-away projects folder for the next test
BASE=http://127.0.0.1:5000 node tests/e2e/large.e2e.js   # 250,000-row Large File mode + projects
BASE=http://127.0.0.1:5000 node tests/e2e/tasks.e2e.js   # Home, Simple/Pro, command palette, Clean a messy file, Combine files
BASE=http://127.0.0.1:5000 PY=python node tests/e2e/reports.e2e.js  # Autopilot, Change Radar, Pendency Radar, Letters, Name Match
BASE=http://127.0.0.1:5000 node tests/e2e/charts.e2e.js  # Chart Studio, all 24 charts, click/drag-to-filter, Insights board, column insight, table visuals
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
