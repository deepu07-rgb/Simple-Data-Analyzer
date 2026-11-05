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

- **Chart Studio** (*Charts* button): a panel beside the table with **25 chart types** — column, bar, stacked and 100% stacked, column + line, Pareto, waterfall, line, area, stacked area, calendar heat map, pie, donut, rose, funnel, treemap, sunburst, scatter (with trend line), bubble, heat map, **flow (Sankey)**, radar, histogram, box plot and a single-number gauge. Pick columns, a measure (total, average, count, median, ...), split by another column, group dates by day / month / quarter / financial year, Top N with an honest "Others", order, colours (one is colour-blind safe) and a title. Each chart gets a plain-language sentence made only from computed numbers, in English or Hindi, with lakh / crore labels.
- **Charts are alive:** click a bar, slice, cell or dot and the **table shows exactly those rows** (Ctrl+click adds more, click again to undo); drag a box or range on a scatter chart or histogram to select it. Filtering the table redraws the chart. Zoom with Ctrl+scroll, hover for details, view the data behind the chart, save as a picture, copy to Word / PowerPoint, download the chart's numbers as CSV.
- **Auto charts** (*Insights board*): one click suggests the charts that suit the data, each with the reason ("Where *station* and *status* overlap most"). Pin your own charts to the board.
- **Table:** every column heading has an **ⓘ**: facts (filled, blank, different values, total, average, median, unusual values), a spread picture whose bars are clickable filters, the most common values (click one to show only those rows), earliest / latest / rows per month for dates. Right-click a heading for **data bars, colour scale and traffic lights**, or "Chart this column". Active filters and the chart selection appear as removable chips above the table.
- **Charts for million-row files:** in Large File mode the Studio works too (*Charts* button, or the 📊 on a column card). DuckDB groups, bins, sorts into quartiles and samples **every row** on this PC and sends back only a few hundred numbers, so a chart of 3 million rows opens in well under a second (dates are cut into days / months / quarters / financial years / weekdays even when written `15-02-2025`, `2025-02-15` or in Devanagari digits). Click a bar, slice, month, box or histogram bar and the **file view filters to exactly those rows** (purple chip, Ctrl+click adds more, a drag selects a range). Scatter charts draw a random sample of up to 5,000 dots and say so; their trend line and correlation use all rows.
- **Sparklines:** right-click a number column's heading → *Trend line in each row* draws a tiny line inside each row across a block of number columns (Jan … Dec).
- **Fair comparison** (*Studio → ⚖ Fair comparison*, or Ctrl+K): is a difference between groups real, or only a **mix effect** (Simpson's paradox)? It compares an outcome plainly *and* between groups that are alike in other factors (price range, city, …) with a linear regression and robust (HC3) errors — checked against statsmodels — and says in English or Hindi whether the gap holds, shrinks, vanishes, reverses or was hidden, which factor causes it, and shows the gap inside each level of that factor. Works on large files too (the engine sends only cell counts and sums). It reports an association, not a cause.
- **What explains this?** (*Studio / board → 🔍*, or Ctrl+K): ranks every column by ω² — the share of the differences in one number it goes with, corrected for chance — with a plain-language summary (EN/HI). Number columns take part in five bands; columns calculated from the number are set apart, a column that looks like a **label given by** the number (hard cut-offs, e.g. a compliance tier) is flagged, never used by Fair comparison on its own, and its **rule is written out** as a short ordered list with round cut-offs and no gaps (a CART tree turned into a decision list, conditions pruned, cuts refined — at least as accurate as scikit-learn; large files learn from a sample that keeps every label and are checked by the engine on all rows). Rules may use text columns and add small exact exceptions the tree cannot reach. A text column **made of** two or three others (one value per combination) is called a summary of them. **🧮 How are the columns built?** (also Ctrl+K) finds formulas between columns (sums, ratios, percentages, ÷ (1 − b/100), (c − a) ÷ b, rescaled copies) and caps/floors, checked by the engine on every row of large files. Factors are checked **inside the groups of every stronger factor** (partial ω², equal to statsmodels; one engine request for all pairs): one that only follows another (calories → age group) is called a *stand-in*, not a cause. Exact against Python; large files use the engine.
- **Fair comparison, a number as the compared column** (4 equal-count bands, lowest = reference) answers "does more discount sell more cups, inside the same brand?"; a leftover that is significant but under 5% of the plain gap is called a mix effect, with the percentage stated.
- **Formula and cap finder**: also `a × k ÷ b` (rates per thousand) and `a ÷ (b + 1)`; the calculated column is chosen by its name (estimate, revenue, ratio …) and by the product form; words shared by 4+ columns ("customer_…") are ignored; caps under 1% of rows are found when they pile up 5× their neighbours.
- **Headline number**: revenue, profit, cups and margin lead; a rating-like index never gets the amount bonus; `_pct` columns are averaged, never summed.
- **Fair comparison, number adjusters:** 5 bands, a straight line or a curve (row-level regression with HC3 errors, equal to statsmodels; on large files streamed by the engine with numpy), chosen automatically by AIC.
- **Messy office workbooks** (tested on a 47,000-row, six-sheet district register): *Combine files* matches columns through group headings and abbreviations and cleans every sheet (titles, subtotals, month totals, signature lines; **“Block: X” section titles become a Block column**; ₹ / `/-` / NIL amounts; Hindi-digit and text dates); **Same thing, different spelling** (Ctrl+K) groups `Kishangarh / KISHANGARH / Kishangrah`, lets you merge synonyms by hand; **The same case entered twice** (Ctrl+K) finds repeats by chosen key columns (capitals/titles ignored, dates within N days). Sheets are read once and cached, so switching sheets is instant.
- **Fair comparison** says *“cannot be compared — only in …”* for a group nested in an adjuster (an officer alone in a department) instead of printing a meaningless gap.
- **Number bands and “% of rows where…”**: a numeric x axis is grouped into ranges automatically (clickable), and any chart can show the share of rows meeting a condition (*temperature < 60*, *cost = 15000*) per group — also for million-row files.
- **Ignore zeros, list columns, small groups:** a chart can leave out 0 where it means "not rated", count each item of a comma-separated list column ("North Indian, Chinese") separately, and hide groups too small for a reliable average.
- **Dashboard** (*Studio → Dashboard*, or Ctrl+K): the charts you pinned, arranged on one page — editable title, headline numbers, 1–3 columns, a plain-language reading under each chart and your own note. Download as **PowerPoint** (editable text in a Devanagari-capable font, chart pictures, the reading in the speaker notes), as **PDF** (A4 landscape; the browser draws every page so Hindi is exact) or **Print**. The board is saved inside `.stellura` project files.
- The Change Radar, Pendency Radar and the Large File *Group* tab use the same chart system (Indian lakh/crore labels, hover, save as picture). Click a coloured segment of the pendency age chart to open exactly those cases; click a bar in the Group tab to filter the file to that group.
- The chart library is Apache ECharts 5.5.1, shipped in `static/js` (licence in `THIRD_PARTY_LICENSES.txt`); nothing is fetched from the internet.

## User guide (English and Hindi)

- Open it from Home (*How to use Stellura*), from Ctrl+K (*user guide*) or from the Documentation window: `static/guide/guide.html` (works offline; English, हिंदी or both).
- A printable copy is `docs/Stellura-User-Guide.docx`. Both are built from one text file: edit `tools/guide_content.py`, then run `python tools/build_guide.py`. `tests/test_guide.py` fails if the guide names a button the app does not have.

## Large files and projects

- **Large File mode:** files of 10 MB or more (CSV, TSV, XLSX), or *More → Open large file*, open in the local DuckDB engine instead of the browser. You get a fast scrolling grid, sort, search, filters, column profile, group-by with chart, a read-only SQL box, CSV/Excel export of the filtered view, and *Work on a copy* (up to 100,000 matching rows into the full editor).
- **Projects:** *More → Projects* saves the table plus formatting, filters, steps and the audit trail as one `.stellura` file in `~/Stellura/Projects` (change with `STELLURA_HOME`). The file is a zip (`manifest.json`, `state.json`, `data.parquet`); the previous save is kept as `.bak`.
- Settings (environment variables): `STELLURA_ENGINE_MEMORY` (default `1500MB`), `STELLURA_MAX_UPLOAD_MB` (default 1024), `STELLURA_INLINE_ROWS` (projects above this open in Large File mode, default 100000).
- Benchmark: `python tests/bench_engine.py 1000000`.

## Test it

```bash
pip install pytest
python -m pytest tests -q                       # backend + offline-promise checks
node --test tests/unit/*.test.js                # Fixer, Merge, Name Match, Pendency, Change Radar, Autopilot, Chart engine, large-file chart pipeline (no browser needed)
BASE=http://127.0.0.1:5000 node tests/e2e/core.e2e.js    # browser checks, all external network blocked
STELLURA_HOME=/tmp/stl-home python app.py                  # throw-away projects folder for the next test
BASE=http://127.0.0.1:5000 node tests/e2e/large.e2e.js   # 250,000-row Large File mode + projects
BASE=http://127.0.0.1:5000 node tests/e2e/tasks.e2e.js   # Home, Simple/Pro, command palette, Clean a messy file, Combine files
BASE=http://127.0.0.1:5000 PY=python node tests/e2e/reports.e2e.js  # Autopilot, Change Radar, Pendency Radar, Letters, Name Match
BASE=http://127.0.0.1:5000 node tests/e2e/charts.e2e.js  # Chart Studio, all 25 charts, click/drag-to-filter, Insights board, column insight, table visuals, Sankey, sparklines
BASE=http://127.0.0.1:5000 node tests/e2e/bigcharts.e2e.js  # charts on a 300,000-row Large File: exact numbers, click-to-filter, dates, every chart type
BASE=http://127.0.0.1:5000 node tests/e2e/fair.e2e.js  # Fair comparison: Simpson reversal, statsmodels-exact numbers, Hindi, large file
BASE=http://127.0.0.1:5000 node tests/e2e/analyst.e2e.js  # What explains this?, number bands, % of rows, label rules, formulas/caps, straight-line Fair, large file
BASE=http://127.0.0.1:5000 PY=python node tests/e2e/workbook.e2e.js  # a messy multi-sheet workbook: combine, clean, spellings, duplicates, Pendency Radar (exact answers)
BASE=http://127.0.0.1:5000 node tests/e2e/dashboard.e2e.js  # Dashboard: layout, edits, PowerPoint, PDF, print, saved with the project (needs python-pptx and pypdf)
```

Every push also runs all of the above on **Windows and Linux** in GitHub Actions (`.github/workflows/tests.yml`).

The browser test needs Node.js and Playwright. It fails if any request leaves the PC.

## Layout

| Path | What |
|---|---|
| `app.py` | Local server: file upload, Excel/PDF/report export, AI proxy |
| `engine.py`, `engine_api.py` | DuckDB analytics engine and its HTTP API |
| `projects.py` | `.stellura` project files |
| `office_api.py` | Excel proforma filling, Word letters, dashboard PowerPoint / PDF (offline, `python-pptx`, `Pillow`) |
| `web/js/charts/` | Chart engine (60), Studio (61), table visuals (62), Large File charts (63), Dashboard (64) |
| `web/` | Source of the web app: CSS, HTML and JavaScript parts listed in `web/manifest.txt`. **Edit these.** |
| `tools/build.py` | Builds `dist/Stellura.html` (one offline file) from `web/`. `app.py` rebuilds automatically when sources change |
| `static/` | Libraries and fonts served locally (no internet needed). Licences in `static/js/THIRD_PARTY_LICENSES.txt` |
| `tests/` | pytest and Playwright checks |
| `docs/` | Design documents and the roadmap |
