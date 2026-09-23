# DataDrishti v3 — "Orbit / Glass-Box AI" Redesign

## Implementation Batches for Claude Sonnet 4.6 (medium thinking)

Author's note: Each batch below is a self-contained prompt. Send them to a fresh Sonnet 4.6 instance ONE AT A TIME, in order. Always paste **PART 0 (Context Preamble + State Contract)** at the top of every batch so the model has the rules. Do not skip ahead — each batch assumes the previous one landed cleanly. If a batch reports something different from what a later batch expects, stop and re-sync before continuing.

---

## HONEST ASSESSMENT (read once, keep in mind)

- This is NOT the world's first visual data tool (KNIME, Orange, Alteryx, ComfyUI exist). Do not market "world first."
- A node canvas alone is not the lowest learning curve for true beginners. **Conversation is.** That is why "Ask Mode" (Batch 8) is core, not optional.
- The local model (gemma3:4b) is weak at free prose. Use it as a **planner + slot-filler over templates**, never as an essay writer.
- The real, defensible product = **offline + private + bilingual + a visible, editable record of what the AI did** ("glass-box AI"). Build that.
- Commercial moat = privacy, vernacular, vertical focus (police/courts/health/CA firms/SMEs), price, distribution — NOT raw model power.
- Legal: verify the LLM's commercial license before selling (Gemma has use restrictions; prefer a clean Apache-2.0 model for paid tiers).

---

## PART 0 — CONTEXT PREAMBLE + STATE CONTRACT (paste at the top of EVERY batch)

```text
You are upgrading DataDrishti (डेटा दृष्टि / "Worksheet Intelligence Studio"): a free, fully-OFFLINE,
bilingual (Hindi/English) data-analysis web app for Indian government offices, built by Neeraj Purohit.

CODEBASE
- Frontend is ONE self-contained HTML file (no build step, no npm) at
  download/Simple-Data-Analyser.html (~11,500 lines). An IDENTICAL copy lives at
  public/Simple-Data-Analyser.html. APPLY EVERY CHANGE TO BOTH FILES IDENTICALLY
  (edit one, then copy it over the other; never let them diverge).
- Backend: Flask app.py (serves the SPA + endpoints: upload, Excel/PDF export, Ollama AI proxy,
  report generation). Embedded Python at runtime/python/python.exe. Ollama at runtime/ollama/.
  Launch with start.bat -> http://localhost:5000.

HARD RULES (never break these)
1. OFFLINE FIRST. Never add a runtime CDN (no Tailwind CDN, no Google Fonts <link>, no remote JS).
   Fonts are embedded locally as base64 woff2. Icons are inline SVG. Any network feature must
   degrade gracefully when offline.
2. BILINGUAL. Every user-facing string MUST be added in BOTH English and Hindi and wired to the
   existing language toggle. Grep to find the toggle + string mechanism before adding text.
3. DISCOVER BEFORE WIRING. Exact existing variable names are NOT given to you. Grep the file to find:
   (a) the grid data model (headers + rows), (b) the language-toggle function and string table,
   (c) the autosave/persistence mechanism. Integrate with these; never invent parallel state.
4. KEEP THE STATE CONTRACT (below) intact and additive. Do not rename its keys.
5. AFTER implementing: sync both HTML files, then run the app and VERIFY in a browser:
   the new feature works, the EN/HI toggle translates all new text, and nothing that worked before
   is broken. Report exactly what you verified.

STATE CONTRACT (the single global object all batches share)
  window.DD = window.DD || {};
  DD.lang        // 'en' | 'hi'  (mirror the app's existing language state)
  DD.data        // { headers:[...], rows:[[...]] }  (reference the REAL existing grid model)
  DD.modules     // { moduleId: ModuleDefinition }   (registry; Batch 3)
  DD.workspace   // { view:'sheet'|'agents'|'focus', nodes:[Node], edges:[Edge] }  (Batch 2+)
  DD.agents      // [SavedAgent]  (Batch 12)
  DD.ui          // { reduceMotion:false, ... }  (Batch 1+)

  Node  = { id, moduleId, x, y, bindings:{}, config:{}, status:'idle'|'running'|'done'|'error', result }
  Edge  = { id, from:nodeId, to:nodeId }
  ModuleDefinition = {
     id, category, icon, color,
     name:{en,hi}, desc:{en,hi},
     accepts:'column'|'series'|'value'|'any',
     produces:'value'|'series'|'table'|'chart'|'report',
     config:[ {key, type:'column'|'number'|'text'|'select', label:{en,hi}, options?:[...] } ],
     run: async ({data, node, upstream, helpers}) => ResultObject
  }
  ResultObject = { type:'value'|'series'|'table'|'chart', value, label:{en,hi}, display:htmlString, raw }

DESIGN TOKENS (Aetheris cosmic — defined fully in Batch 1)
  primary #ddb8ff  secondary #4cd7f6  primary-container #7e22ce  background #050816
  surface #16111b  on-surface #eadfed  on-surface-variant #cfc2d6  error #ffb4ab
  glass = bg rgba(22,17,27,.4) + backdrop-blur(32px) + 1px border rgba(255,255,255,.08)
  fonts: Sora (headings) + Inter (body/labels)

PRODUCT PRINCIPLES (let these guide judgement calls)
  - Glass-box AI: the AI proposes; the user always SEES and can EDIT what it did (the bubble pipeline).
  - Plain language over jargon: bubble names read like sentences ("Find the average", "औसत निकालें").
  - Cinematic but calm: rich motion by default, with a reduce-motion switch and auto-calm on weak PCs.
  - Privacy: nothing leaves the machine. Never phone home.
```

---

## PART A — FOUNDATION & SKIN

## BATCH 1 — Design System & Visual Foundation (reskin only)

**Goal:** Re-skin the whole app to the Aetheris cosmic-glassmorphism look WITHOUT changing any behavior. CSS and styling markup only — no JS logic, no renamed functions/ids.

**Why:** Everything later sits on these tokens and component classes. Getting them right once prevents rework.

**Prerequisite:** none (this is first).

**Files:** both copies of Simple-Data-Analyser.html. (Optionally a new folder `static/fonts/` if you choose file-based fonts — but base64-embed is preferred.)

**DO (in order):**
1. EMBED FONTS LOCALLY. Add `@font-face` rules for **Inter** (weights 400/500/600) and **Sora** (400/600/700) using base64 woff2 **data: URIs** placed inside the HTML `<style>`. Use latin-subset woff2 to keep size reasonable. Provide a fallback stack: `'Inter', system-ui, 'Segoe UI', Arial, sans-serif` and `'Sora', system-ui, 'Segoe UI', Arial, sans-serif`. DO NOT link Google Fonts. DO NOT add the Material Symbols icon font — icons stay inline SVG.
2. REPLACE the `:root` CSS custom properties with the Aetheris token set, defining BOTH a **dark (default)** theme and a **light** theme under the app's EXISTING theme-toggle mechanism (grep for it). Map the app's current variables (e.g. `--accent`, `--border`, `--radius-*`, `--bg-*`, `--text-*`) onto the new palette so existing rules inherit the new look automatically.
3. DUAL-SURFACE RULE (important): chrome (top bar, sidebars, panels, canvas) uses cosmic dark glass; the **DATA GRID** uses a high-contrast, readable elevated surface. Never render dense tabular data directly on `#050816`. In dark theme the grid surface is a lifted near-black (`#1f1a23`) with near-white text; in light theme it is white cells with dark text.
4. ADD fixed background layers behind everything (`z-index:0; pointer-events:none`): two blurred nebula glow blobs (primary + secondary, `filter: blur(120px); opacity:.15`) plus a subtle CSS starfield via layered `radial-gradient`. Pure CSS only this batch (no JS canvas yet).
5. ADD reusable component classes for later batches:
   - `.glass-panel` (the glass formula above, radius 16px)
   - `.stellar-card` (glass + hover lift `translateY(-6px)` + cyan glow)
   - `.bubble` (round glass node, 96px, gentle "breathe" keyframe pulse)
   - `.pill` (small rounded status chip)
   - `.brand-gradient` (text gradient primary→secondary via `background-clip:text`)
   - a `@keyframes breathe` and a `@keyframes float`
6. RESTYLE existing top bar, left icon rail, side panels, buttons, inputs, and the grid using the new tokens + classes so the app matches the Aetheris screenshots — change ONLY styling, never structure/handlers.
7. ADD `DD.ui = DD.ui || { reduceMotion:false }` and a CSS hook: when `document.documentElement.classList.contains('reduce-motion')` OR the OS `prefers-reduced-motion` is set, disable the breathe/float/glow animations. (The toggle UI comes in Batch 13; just wire the CSS + class now.)

**DON'T:**
- Don't rename or move any JS function, event handler, id, or data variable.
- Don't add Tailwind, Google Fonts, or any external/CDN resource.
- Don't remove existing features or panels.

**Acceptance criteria:**
- App visually matches the Aetheris cosmic glass aesthetic (lavender+cyan, nebula bg, Sora/Inter, glass panels).
- Theme toggle flips cosmic-dark <-> cosmic-light; the grid stays readable in both.
- Every pre-existing button/tool still works exactly as before.
- With the network DISCONNECTED, reloading http://localhost:5000 still renders fonts and visuals correctly.
- download/ and public/ HTML files are identical.

**Verify:** Load the app, toggle theme, click through every existing tool, disconnect Wi-Fi and reload. Report results.

---

## BATCH 2 — Layout Shell & View Switching (Sheet / Agents / Reports)

**Goal:** Introduce the new three-zone layout and a top-bar view switch between the existing spreadsheet ("Sheet"), a new empty "Agents" canvas, and the existing report area ("Reports"). Shell + switching only — no module logic yet.

**Prerequisite:** Batch 1.

**DO:**
1. TOP APP BAR: brand (flare SVG + "DataDrishti" with `.brand-gradient`), a center **segmented control** with three views — `Sheet / शीट`, `Agents / एजेंट`, `Reports / रिपोर्ट` — plus the existing language toggle, theme toggle, Save, and profile controls (reuse existing handlers; relocate/restyle only).
2. LEFT MODULE DRAWER: a fixed glass drawer titled `Modules / मॉड्यूल` with subtitle `Drag to Workspace / वर्कस्पेस में खींचें` and a search box. For THIS batch, fill it with 3–4 static placeholder `.bubble`s (real registry is Batch 3). Search can be a non-functional stub.
3. CENTER WORKSPACE with views controlled by `DD.workspace.view`:
   - `sheet`  -> the existing grid/import UI, untouched and fully functional.
   - `agents` -> a new full-area canvas `#dd-agents-canvas` with a centered empty state: title `Agents`, line `Drag a module here to begin / शुरू करने के लिए मॉड्यूल खींचें`, and a faint orbital-ring motif (pure CSS). Empty for now.
   - `reports` -> route to the existing report/PDF panel.
   Switching the segmented control swaps views with a 200ms fade. Default `sheet`.
4. RIGHT INSPECTOR: keep the existing Cell Intelligence panel, restyled as a collapsible `.glass-panel`.
5. STATE + PERSIST: ensure `DD.workspace = DD.workspace || { view:'sheet', nodes:[], edges:[] }`. Persist the last-used view through the app's EXISTING autosave (grep for it; do not add a new storage layer).

**DON'T:** break grid behavior in Sheet view; build drag/drop or execution yet.

**Acceptance criteria:**
- Segmented control switches cleanly: Sheet (working grid) / Agents (titled empty canvas) / Reports (existing panel).
- Drawer renders title, subtitle, search stub, placeholder bubbles.
- Reload preserves the last view (autosave confirmed).
- EN/HI translates every new label; both HTML files identical.

---

## PART B — THE MODULE / AGENT ENGINE

## BATCH 3 — Module Registry & Bubble Drawer (features become bubbles)

**Goal:** Define the module data model and a real registry, then fill the left drawer with categorized, searchable, bilingual bubbles that map to the app's existing capabilities. No execution yet — this is the catalog.

**Prerequisite:** Batch 2.

**DO:**
1. Create `DD.modules = {}` and a helper `DD.registerModule(def)` that validates and stores a ModuleDefinition (shape in the State Contract). Add `DD.getModulesByCategory()` returning modules grouped by `category`.
2. Register the full catalog from **APPENDIX A — Module Catalog** (at the end of this document). For THIS batch, each module's `run` may be a stub `async () => ({type:'value', value:null, label, display:'Coming soon'})`; real compute arrives in Batches 5–6. But `id, category, icon, color, name, desc, accepts, produces, config` MUST be fully and correctly filled now.
3. Render the drawer from the registry: one collapsible section per category (`Summarize / सारांश`, `Quality / गुणवत्ता`, `Transform / रूपांतरण`, `Predict / पूर्वानुमान`, `Visualize / चित्रण`, `Report / रिपोर्ट`, `AI / एआई`). Each bubble shows its inline-SVG icon + bilingual name; hover shows `desc` as a tooltip.
4. Make the search box filter bubbles live by name/desc in BOTH languages.
5. Add a small category-color system using the token palette (each category gets a tint).

**DON'T:** implement drag yet; implement compute yet.

**Acceptance criteria:**
- Drawer shows every module from Appendix A, grouped and color-tinted, with correct bilingual names + tooltips.
- Search filters correctly in English and Hindi.
- `Object.keys(DD.modules).length` equals the Appendix A count. Both files identical.

---

## BATCH 4 — Drag & Drop onto the Agents Canvas

**Goal:** Drag a bubble from the drawer and drop it onto the Agents canvas, where it becomes a freely repositionable node. Persist node positions.

**Prerequisite:** Batch 3.

**DO:**
1. Build a tiny reusable POINTER-EVENT drag helper (do NOT use HTML5 native drag; do NOT add libraries). On `pointerdown` of a drawer bubble, start a drag with a floating ghost following the cursor; on `pointerup` over `#dd-agents-canvas`, create a Node.
2. Creating a node: push `{id:'n_'+rand, moduleId, x, y, bindings:{}, config:{}, status:'idle', result:null}` to `DD.workspace.nodes`, and render it as a `.bubble` positioned absolutely at (x,y) inside the canvas. The drop auto-switches the view to `agents` if not already there.
3. Nodes are repositionable: `pointerdown` on a placed node drags it; update its `x,y` in state on move. Keep nodes within canvas bounds. Add a subtle "snap to soft grid" (e.g. 8px).
4. Each node shows: icon, bilingual name, a status dot (`.pill` colored by `status`), and a small "x" to delete (removes node + any connected edges).
5. Cinematic motion (default ON, respects reduce-motion): placed nodes gently `float`; on drop they do a quick scale-in.
6. PERSIST `DD.workspace.nodes` through the existing autosave; on reload, re-render all nodes at saved positions.

**DON'T:** build connections/edges yet (Batch 6); build config/run yet (Batch 5).

**Acceptance criteria:**
- Drag any bubble to the canvas; it appears and stays where dropped.
- Move nodes around; delete a node; reload — surviving nodes reappear at saved positions.
- Reduce-motion class disables float/scale. Both files identical.

---

## BATCH 5 — Node Configuration & Single-Module Execution

**Goal:** Let a user configure a node in plain language ("Which column?") and run it alone to produce a Result Card. Implement real compute for the core SUMMARIZE + QUALITY modules.

**Prerequisite:** Batch 4.

**DO:**
1. CONFIG POPOVER: clicking a node opens a `.glass-panel` popover built from the module's `config` array. For a `type:'column'` field, render a dropdown of `DD.data.headers` (show the human header text; store the column index/key in `node.bindings`/`node.config`). For `number/text/select`, render the matching control. All labels bilingual. Include a primary `Run / चलाएँ` button.
2. HELPERS: implement `helpers` passed to `run`, including:
   - `helpers.col(node)` -> returns the bound column as an array of raw cell values.
   - `helpers.nums(values)` -> parses numeric values: strip commas/spaces, `parseFloat`, drop non-numeric/empty; returns `number[]`.
   - `helpers.t(obj)` -> returns `obj[DD.lang]` for bilingual strings.
3. IMPLEMENT real `run` for these modules (pure JS):
   - **Summarize:** average, sum, count (non-empty), min, max, median, mode, stddev (population), range(max-min).
   - **Quality:** missing (count + list of row indices where empty/null), duplicates (count of repeated values + which), unique (distinct count + sample), outliers_iqr (Q1, Q3, IQR, lower=Q1-1.5*IQR, upper=Q3+1.5*IQR, list of outlier rows), dtype_check (guess number/date/text per column + % conforming), trim_clean (preview of trimmed/normalized values; does not yet write back).
4. RESULT CARD: after `Run`, set `node.status='done'`, store `node.result`, and render a `.stellar-card` near the node showing the result's `display` (a clean bilingual mini-readout, with the key number large). Errors set `status='error'` and show a friendly bilingual message.
5. Persist node config + last result through autosave.

**DON'T:** chain nodes yet; write results back into the grid yet.

**Acceptance criteria:**
- Drop "Average", click it, pick a column, press Run -> correct average shown in a result card.
- Each implemented module returns correct values on a known test dataset (verify average/min/max/missing by hand).
- Bad input (text column into Average) yields a friendly error, not a crash. Both files identical.

---

## BATCH 6 — Workflow Chaining & Sequential "Glow" Execution

**Goal:** Connect nodes into a pipeline, pass outputs along the chain, and run the whole chain step-by-step with each node lighting up in turn. Add the Predict modules (regression projection) so the flagship scenario works.

**Prerequisite:** Batch 5.

**DO:**
1. EDGES: give each node an output anchor (right) and input anchor (left). Pointer-drag from one node's output to another's input to create `Edge{id, from, to}` in `DD.workspace.edges`. Draw edges as **SVG bezier curves** on an overlay layer above the canvas; recompute paths whenever a node moves. Edges glow in the primary->secondary gradient. Prevent cycles (reject an edge that would create a loop).
2. INPUT PASSING: extend `run` context with `upstream` = array of the immediate upstream nodes' `result` objects (in edge order). A module that `accepts:'series'|'value'` consumes `upstream[0]`; a source module (`accepts:'column'`) reads its bound column. Define clearly: if a node has upstream results, prefer them; else use its own column binding.
3. PREDICT modules (pure JS least-squares — implement EXACTLY):
   - **linreg_project(series, k):** let `y = helpers.nums(series)`, `n = y.length`, `x = [0..n-1]`.
     `sumX=Σx, sumY=Σy, sumXY=Σ(x*y), sumXX=Σ(x*x)`.
     `m = (n*sumXY - sumX*sumY) / (n*sumXX - sumX*sumX)`;
     `b = (sumY - m*sumX) / n`.
     Projected next k values: for `i = n .. n+k-1`, `yhat_i = m*i + b`. Also compute R^2.
     Output `type:'series'` with `{historical:y, projected:[...], slope:m, intercept:b, r2}` and a display showing the projected values prominently.
   - **moving_avg(series, window):** trailing average over `window`.
   - **growth_rate(series):** period-over-period % change + average growth.
   - **trend(series):** returns 'rising/falling/flat' from the regression slope sign + a confidence from R^2.
4. SEQUENTIAL GLOW RUN: add a `Run Agent / एजेंट चलाएँ` button on the canvas. On click: topologically sort nodes by edges; then for each node IN ORDER — set `status='running'` (node pulses bright), `await` its `run`, render/update its result card, set `status='done'`, then move to the next. ~400ms minimum visible dwell per node so users see it "think" (skip the artificial dwell if reduce-motion is on). On error, stop the chain and highlight the failed node.
5. The result cards from all nodes remain on the canvas, positioned near their nodes. Persist edges + results.

**DON'T:** insert results into the grid yet (Batch 7).

**Acceptance criteria (the flagship test):**
- Build: a SOURCE bound to a numeric column (e.g. column 9) -> Average -> Min/Max -> Missing -> Regression(project next 3). Press Run Agent.
- Each bubble lights up in sequence; result cards appear; the regression card shows 3 projected values computed by the least-squares formula above (verify by hand on a small series).
- Moving a node redraws its edges live. Cycles are rejected. Both files identical.

---

## BATCH 7 — Results into the Sheet (drag a result back in)

**Goal:** Make result cards draggable so a user can drop a computed value or series into a grid cell or as a new column.

**Prerequisite:** Batch 6.

**DO:**
1. Make each result card a drag source (pointer-drag, with a value ghost).
2. Define drop targets in Sheet view:
   - Drop a `value` result onto a single cell -> write that value into the cell (respect existing edit/undo).
   - Drop a `series` result (e.g. projected values) onto a column header or empty column -> append/insert the series as a new column titled with the module's bilingual name (e.g. `Projected / अनुमानित`). For projections, append the k projected rows beneath existing data, clearly flagged (e.g. tinted cells).
3. Use the app's EXISTING grid-write + undo/redo pathway (grep; do not bypass it) so insertions are undoable and autosaved.
4. Provide a small confirm toast: bilingual `Inserted into sheet / शीट में जोड़ा गया`.

**Acceptance criteria:**
- Drag an Average result onto a cell -> value appears, undoable.
- Drag a projection series onto an empty column -> new titled column with the projected values, flagged.
- Both files identical.

---

## PART C — AI & INTELLIGENCE (the differentiator)

## BATCH 8 — "Ask Mode": conversational entry that BUILDS the pipeline (glass-box AI)

**Goal:** A plain-language box (type or pick a suggestion) where the user states a goal in Hindi/English; the local LLM PLANS a bubble pipeline; the app builds those nodes+edges on the canvas and runs them with the sequential glow. The user sees and can edit exactly what the AI did.

**Prerequisite:** Batches 6–7. Requires the existing Ollama AI proxy in app.py (grep for the existing AI endpoint; reuse it).

**DO:**
1. ADD an "Ask" bar (top of the Agents canvas and as the AI bubble): input + mic-disabled-stub + a few example chips, bilingual, e.g. `"Average of Salary and predict next 3 months" / "वेतन का औसत और अगले 3 महीने का अनुमान"`.
2. PLANNER PROMPT: build a strict prompt to the local model that includes: the dataset's column headers + inferred types, the available module ids + what each does (from the registry), and the user's request. Instruct the model to return ONLY JSON of the form:
   `{ "nodes":[{"moduleId":"avg","column":"<header>","config":{}}...], "edges":[[0,1],[1,2]...] }`
   Where edges reference node array indices. Provide 2 few-shot examples in the prompt.
3. ROBUST PARSING: extract the first valid JSON object from the model output; validate every `moduleId` exists and every `column` matches a real header; if invalid, repair what you can and drop the rest. If the plan is empty/unusable, show a friendly bilingual fallback ("I could not plan that — try picking bubbles yourself / ...") — NEVER crash.
4. BUILD + REVEAL: translate the JSON into real Nodes (auto-laid-out left-to-right) and Edges on the canvas, then run the sequential-glow execution from Batch 6. The user watches it build and compute.
5. EDIT-AFTER: because these are normal nodes, the user can delete/add/reconnect and re-run. This is the glass-box promise — make it obvious with a one-line hint: `AI built this. You can change it. / एआई ने यह बनाया। आप बदल सकते हैं।`
6. OFFLINE/abence handling: if Ollama isn't running, disable Ask Mode with a calm bilingual note and keep manual building fully available.

**DON'T:** let the model free-write analysis prose here; it only emits the JSON plan.

**Acceptance criteria:**
- Typing "average of <numeric column> and predict next 3" builds Source->Average and Source->Regression(3) (or a sensible chain) and runs it, with the glow.
- Invalid/garbled model output never crashes; a fallback message appears.
- With Ollama off, Ask Mode degrades gracefully; manual canvas still works. Both files identical.

---

## BATCH 9 — AI Report Writer (templates + slot-filling, bilingual PDF)

**Goal:** Generate a clean, trustworthy, bilingual report from the current data and/or an Agent's results — using the local LLM only to fill structured slots inside fixed templates, then rendering via the existing Patch 10 PDF engine.

**Prerequisite:** Batch 8 + the existing report/PDF generation in app.py (grep `generate-report` / `_build_report_pdf`).

**DO:**
1. Define 2–3 fixed report TEMPLATES (e.g. "Executive Summary", "Department Monthly", "Data Quality Audit") as structured sections with fixed headings (bilingual). The DATA fills facts (counts, averages, outliers, projections from the engine); the LLM only writes short connective sentences per section, constrained to <= N words, grounded in the provided facts.
2. GROUNDING: pass the model a compact JSON of computed facts (from modules/agents) and instruct it to write ONLY from those facts, in the chosen language, with no invented numbers. Post-validate: if the model emits a number not present in the facts, drop/flag that sentence.
3. Wire a `Generate Report / रिपोर्ट बनाएँ` action from the Reports view and from an Agent result; send the assembled structure to the existing PDF endpoint; download the bilingual PDF (reuse the Patch 10 cover/header/footer flow).
4. Always offer a "facts-only" mode (no LLM prose) for users who want zero AI text — important for trust and for offline-without-model situations.

**Acceptance criteria:**
- Produces a clean bilingual PDF whose numbers exactly match the computed facts.
- "Facts-only" mode works with the model off.
- No hallucinated numbers survive validation. Both files identical.

---

## BATCH 10 — Smart Dashboard (auto-KPIs + charts on a dashboard canvas)

**Goal:** One click turns a dataset (or an Agent's outputs) into a dashboard: auto-chosen KPI cards + charts, arrangeable, exportable.

**Prerequisite:** Batches 6–7; the existing chart code (grep for the charts feature).

**DO:**
1. AUTO-PROFILE the data: detect numeric vs categorical vs date columns; pick sensible defaults (KPI cards for key numerics: sum/avg/min/max; a bar for top categories; a line for any date+numeric; a pie for a low-cardinality category).
2. Render a `Dashboard` sub-view (reachable from Reports or a dashboard bubble) as a draggable/resizable bento grid of `.stellar-card`s using the EXISTING chart renderer (reuse; don't add a chart library).
3. Let users add a chart by dropping a Visualize bubble's result onto the dashboard; let them rearrange cards; persist layout in `DD.workspace`.
4. Export the dashboard to the existing PDF/Excel path.

**Acceptance criteria:**
- One click yields a coherent auto-dashboard for a sample dataset.
- Cards rearrange and persist; export works. Both files identical.

---

## PART D — POWER & POLISH

## BATCH 11 — Focus / 360 Mode (distraction-free)

**Goal:** A fullscreen, distraction-free mode where the active bubbles dock to the top of the screen; clicking a bubble opens its function UI in isolation for focused use.

**Prerequisite:** Batches 5–6.

**DO:**
1. Add a `Focus / फोकस` control. Entering sets `DD.workspace.view='focus'` and hides all chrome except a top dock of the current Agent's bubbles + an Exit control. Use the Fullscreen API where available; otherwise an immersive overlay.
2. Clicking a docked bubble opens ONLY that module's config + result in a centered `.glass-panel`, against the nebula backdrop — nothing else visible. Run it there.
3. Keyboard: Esc exits; left/right arrows move between docked bubbles. Respect reduce-motion.
4. State round-trips: exiting Focus restores the previous view and node positions.

**Acceptance criteria:**
- Enter Focus -> only docked bubbles + backdrop; click one -> isolated function UI; run works; Esc exits cleanly. Both files identical.

---

## BATCH 12 — Saved Agents (reusable workflows / recipes)

**Goal:** Save a node+edge pipeline as a named, reusable Agent that can be re-run on the current or a new dataset.

**Prerequisite:** Batch 6.

**DO:**
1. `Save as Agent / एजेंट सेव करें`: capture the current `nodes`(moduleId, relative positions, config minus dataset-specific bindings) + `edges` into `DD.agents` with a bilingual name + icon. Bindings to columns save as **column-by-name with a re-map step** (since a new dataset may differ).
2. An "Agents" library list (in the drawer or a tab): each saved Agent shows name + a "Run" action. Running it rebuilds the nodes/edges on the canvas; if a saved column name is missing in the current data, prompt the user to map it (bilingual).
3. Allow rename/delete/duplicate. Persist `DD.agents` via autosave.
4. Ship 2–3 built-in example Agents (e.g. "Monthly Summary", "Data Quality Check", "Projection") so new users have instant value.

**Acceptance criteria:**
- Save a pipeline, reload, run it on the same data -> same results.
- Run it on a different dataset -> column-mapping prompt -> correct results. Both files identical.

---

## BATCH 13 — Onboarding, Plain-Language, Reduce-Motion, Full Hindi, Accessibility

**Goal:** Make a complete beginner succeed on the first try, and make the app calm on weak hardware.

**Prerequisite:** Batches 1–12.

**DO:**
1. FIRST-RUN guided tour (3–5 steps, skippable, bilingual): "This is your data → drag a bubble → connect → run → see results."
2. EMPTY STATES everywhere with a friendly bilingual hint + one-click "Try an example".
3. REDUCE-MOTION toggle in Settings (writes `DD.ui.reduceMotion`, toggles the `reduce-motion` class), plus AUTO-CALM: on load, measure a quick FPS sample or `navigator.hardwareConcurrency`/`deviceMemory`; if low, enable reduce-motion automatically and tell the user calmly.
4. PLAIN-LANGUAGE PASS: audit every bubble name/description and message so they read like sentences a non-technical clerk understands, in both languages. No raw jargon ("stddev" -> "spread / फैलाव", with the technical term in the tooltip).
5. ACCESSIBILITY: keyboard focus rings, `aria-label`s on icon buttons, sufficient contrast in both themes, min 14px body text.
6. Verify Hindi completeness: no English leaks when `DD.lang==='hi'`.

**Acceptance criteria:**
- A first-time user can complete the flagship flow guided, in Hindi.
- Reduce-motion fully stills animations; auto-calm triggers on a low-end profile.
- No untranslated strings in Hindi mode. Both files identical.

---

## BATCH 14 — Cleanup, Retire the Old Rail, Performance, Hardening

**Goal:** Remove the legacy duplication, make large grids fast, and lock in the single-source-of-truth discipline.

**Prerequisite:** Batches 1–13.

**DO:**
1. RETIRE the legacy left icon rail now that every tool is a bubble; remove its dead code/handlers (verify nothing else references them first).
2. DEAD CODE sweep: remove unused panels/styles/functions left over from the migration; keep a short CHANGELOG comment block at the top of the file noting what was removed.
3. PERFORMANCE: virtualize or paginate the grid for large datasets; debounce edge re-draws on node drag; cap result-card DOM; lazy-render off-screen nodes. Target smooth interaction at 50k cells.
4. HARDENING: add a tiny build-time check or comment-protocol reminder that download/ and public/ copies must stay identical; verify they are byte-identical at the end.
5. Full regression pass over Batches 1–13 acceptance tests.

**Acceptance criteria:**
- No legacy rail; no obvious dead code; large dataset stays responsive; both files byte-identical; all prior acceptance tests still pass.

---

## PART E — THE MOAT ENGINE (Living Data Model + Audit)

Strategic note: Parts A–D make a beautiful, usable product. PART E is what makes it HARD TO COPY. The defensible core is (1) a self-assembling "Living Data Model" that discovers structure and lets users perturb it, and (2) total provenance/audit. Build these conservatively — a wrong "insight" destroys trust faster than a missing feature. Everything here ships with confidence labels and is fully OFFLINE on modest hardware. Do NOT claim causation anywhere; say "driver / associated with", never "causes".

## BATCH 15 — Living Data Model v1: Structure Discovery ("Data X-Ray")

**Goal:** When data loads, automatically discover its hidden structure — keys, relationships across sheets/columns, simple dependencies, and semantic types — and present it as an explorable graph the user can confirm or dismiss. v1 ships ONLY what is provably correct. No causal claims.

**Why (the moat):** Auto-relationship discovery for non-technical users, across messy real-world tables, fully offline, is genuinely hard CS that big cloud BI tools don't bother to make work locally. This is the spectacle that opens the door to Batch 16's simulation.

**Prerequisite:** Batches 1–7 (data model + canvas exist).

**DO:**
1. PROFILE every column into `DD.model.columns[]`: inferred type (number / date / boolean / categorical / text), row count, distinct count, null rate, min/max (if numeric/date), cardinality ratio = distinct/total, and a small value sample. Run chunked / in an idle callback so the UI never freezes; sample large columns (cap ~20k rows) for speed.
2. SEMANTIC TYPES via regex + stats: id, currency, percent, phone, email, date, code. Store in `column.semantic`. These guide later steps and units.
3. KEY DETECTION: mark a column as a candidate key when `cardinalityRatio >= 0.98` AND `nullRate <= 0.02`. Store in `DD.model.keys[]` with the ratio as confidence.
4. RELATIONSHIP DISCOVERY (approximate inclusion dependency, conservative): for candidate column pairs (A, B) — prioritise pairs where names are similar OR semantic types match (e.g. both look like IDs) to avoid combinatorial blow-up — compute the containment ratio = (distinct non-null values of A that also appear in B) / (distinct non-null values of A), using JS Sets (and sampling for large columns). If containment `>= 0.90`, record a candidate foreign-key link `A -> B` in `DD.model.relationships[]` with `{from, to, type:'fk', confidence: containment}`. Cap the number of pairs tested and the per-pair cost so the whole pass stays well under a couple of seconds offline.
5. FUNCTIONAL DEPENDENCY (single-column, approximate): for pairs (A -> B) where A has low/medium cardinality, group rows by A and check how often B is (almost) constant within each group. `confidence = weighted fraction of A-groups whose dominant B-value covers >= 95% of the group`. Record those with `confidence >= 0.95` in `DD.model.dependencies[]`. This is what lets Batch 16 simulate. Cap candidate pairs (skip high-cardinality A).
6. LIGHT ENTITY-RESOLUTION FLAG (optional, never auto-merge): within a categorical column, flag pairs of near-identical values (normalize case/space, then trigram-Jaccard or capped Levenshtein on a limited candidate set) as "possible same entity". Show as a suggestion only.
7. EXPLORABLE GRAPH VIEW: add a "Data X-Ray / डेटा एक्स-रे" view (and a matching bubble). Render columns (grouped by sheet) as nodes and relationships/dependencies as edges, using a tiny built-in force layout (naive repulsion + spring is fine; cap node count, no library). Click a node -> highlight its links + a plain-language explanation ("Employee ID links to the Salary sheet — 98% match"). Confidence shown numerically; low-confidence edges dashed.
8. HUMAN-IN-THE-LOOP + COMPOUNDING ASSET: every discovered relationship has Confirm / Dismiss. Store the user's decisions in `DD.model.confirmed[]` and persist via autosave. (These confirmed patterns are a compounding asset and feed Batch 16 and the future community library.)
9. SAFETY COPY: label the whole panel "Detected automatically — please verify / स्वतः पहचाना गया — कृपया जाँचें". Never present a discovery as fact.

**Data contract:**
```text
DD.model = {
  columns:[{key, sheet, type, semantic, distinct, nullRate, cardinalityRatio, min, max, sample}],
  keys:[{column, confidence}],
  relationships:[{id, from, to, type:'fk', confidence}],
  dependencies:[{id, from, to, confidence}],
  confirmed:[{id, decision:'confirm'|'dismiss'}]
}
```

**DON'T:** don't claim causation; don't auto-merge entities; don't block the UI; don't add a graph/ML library.

**Acceptance criteria:**
- On a 2-sheet sample where both share an ID column, the X-Ray shows the foreign-key link with a confidence near its true containment.
- A real dependency (e.g. Department -> Region) is detected and listed; a spurious one is NOT (verify thresholds).
- Keys flagged correctly; user can Confirm/Dismiss and the choice survives reload.
- Full pass on a ~20k-row file completes in a couple of seconds with no UI freeze. Both files identical.

## BATCH 16 — Living Data Model v2: Live What-If Simulation

**Goal:** Turn the discovered (and user-confirmed) numeric relationships into a reactive model: the user picks a metric, sees its drivers as sliders, drags one, and watches dependent values ripple live — "if attendance +10%, projected overtime ≈ X (±band)". Interpretable models only. Conservative, labeled, never causal.

**Why (the moat):** This is the genuinely novel reframe of "get into your data" — not a 3D world, but a self-assembling what-if simulator. Hard to build, delightful, and defensible.

**Prerequisite:** Batch 15.

**DO:**
1. BUILD a reactive dependency graph from: (a) `DD.model.dependencies` / confirmed relationships that are numeric, plus (b) any explicit formulas already present in the sheet. Topologically order it (reuse Batch 6's sort).
2. FIT an interpretable model per dependent value, preferring the simplest that fits:
   - If an exact arithmetic relation is detected within tolerance (e.g. `C ≈ A*B` or `C ≈ A+B` for >= 99% of rows), USE that exact formula.
   - Else fit a simple linear regression of the dependent on its driver(s); compute R². Keep it linear/multiplicative — NEVER a black box.
3. WHAT-IF UI: a "What-If / क्या-अगर" view (and bubble). User selects a target metric; show its drivers as sliders (range from data min..max, default = current mean). Dragging a slider recomputes the target live via the fitted relation, displaying the new value and a confidence band derived from the model's residual spread / R².
4. RIPPLE: if a changed field feeds multiple dependents, update all of them in topological order, visibly.
5. SAFETY GATES (critical, per the safe-first decision):
   - If a relationship's fit is weak (e.g. R² below ~0.5), DO NOT simulate it; show a plain bilingual message ("Not a reliable pattern to project / भरोसेमंद पैटर्न नहीं").
   - Label every output "Estimate based on past patterns, not a guarantee / पिछले पैटर्न पर आधारित अनुमान".
   - Always show R²/confidence next to the result.
6. OPTIONAL — "Associated drivers" (conservative, labeled): for a chosen metric, rank candidate drivers by standardized regression coefficient or absolute correlation, displayed as "associated with / से संबंधित", with an explicit note: "association, not proof of cause / संबंध, कारण का प्रमाण नहीं". Keep simple; defer true causal discovery to a later version.
7. PERSIST confirmed relationships, fitted models, and saved what-if scenarios via autosave.

**DON'T:** no causal language; no black-box models; don't simulate poorly-fit relations.

**Acceptance criteria:**
- On data where `Overtime = Attendance * Rate`, the exact relation is detected; dragging the Attendance slider updates Overtime exactly.
- On a noisy linear pair, simulation shows a value + confidence band + R²; on a near-random pair, it refuses with a clear message.
- All outputs carry the "estimate / association, not cause" labels. Both files identical.

## BATCH 17 — Provenance & Audit Time-Machine (the compounding moat)

**Goal:** Make every number traceable. Every derived value, module run, AI action, and sheet edit writes to an append-only provenance log; any result can show its full lineage in plain language; the session can be replayed; a result's audit trail can be exported as a PDF.

**Why (the moat):** For regulated buyers worldwide (finance, health, legal, defence, government), auditability is gold and nearly impossible to retrofit. It compounds: the longer someone uses the app, the more irreplaceable their audit history. Cloud tools that move data around cannot match a local, tamper-evident trail.

**Prerequisite:** Batches 5–9 (modules, AI, reports produce events to log).

**DO:**
1. PROVENANCE LOG: an append-only array `DD.provenance[]` of immutable events:
   ```text
   { id, ts, actor:'user'|'ai'|'module', action, method, inputs:[refs], output:ref, dataVersion, prevHash, hash }
   ```
   `inputs/output` are REFERENCES (cell/column/node ids), not data copies, to stay compact. Every module run (Batch 5/6), AI plan/action (Batch 8/9), and grid edit (Batch 7) appends an event.
2. TAMPER-EVIDENCE (cheap, powerful): hash-chain the log — each event stores `prevHash` and its own `hash = H(event fields + prevHash)` (use a small built-in hash, e.g. a SHA-256 in JS). This makes the audit trail verifiable; expose a "Verify integrity" check.
3. LINEAGE PANEL: clicking any computed cell or result card opens a lineage tree — "this value came from these rows via this method, produced by [user/AI] on [date]" — expandable, with a plain-language summary and a technical-detail toggle. Bilingual.
4. REPLAY / TIME-MACHINE: a history slider to step through the session or a specific Agent run and watch how a number came to be. Reconstruct state at any logged point (from references + the data versions).
5. AUDIT EXPORT: "Export audit trail / ऑडिट रिकॉर्ड निर्यात करें" produces a PDF (reuse the Patch 10 PDF engine) documenting a chosen result's full lineage — a killer feature for procurement/compliance demos.
6. STORAGE DISCIPLINE: persist the log via existing autosave; keep it compact; for very long sessions, roll older events into a summarised checkpoint while preserving the hash chain.

**DON'T:** don't store duplicate copies of the data in the log; don't let logging block the UI (append asynchronously); don't break the hash chain on checkpoint.

**Acceptance criteria:**
- Run an Agent, then click a result -> see its complete lineage back to source rows.
- "Verify integrity" passes on an untampered log and fails if an event is altered.
- Export a result's audit trail to a clean bilingual PDF. Replay reconstructs an earlier value. Both files identical.

---

## PART F — ENGINE & COGNITION (small LLM, expert output)

Strategic note: PART F answers two questions. (1) Don't fork a heavyweight open-source BI app (Metabase/Superset/Redash are server/cloud/multi-user and fight the offline moat; Metabase is AGPL). Instead stand on an offline-first engine — DuckDB-WASM (Batch 18). (2) A small local model is weak at deep reasoning; you do NOT make it smarter — you wrap it in a deterministic controller (Batches 19–21) that does the math, decomposes the problem, grounds every claim, verifies, abstains when unsure, and humanizes the tone. This works because the domain is bounded (analysing the user's own data), not open-ended. Never let the model invent numbers.

## BATCH 18 — Local Analytical Engine: DuckDB-WASM (OPTIONAL, recommended)

**Goal:** Add an embedded, fully-offline SQL analytics engine (DuckDB-WASM, MIT licence) bundled locally, to power large-data performance and the Living Data Model. Keep a JS fallback so the app still works if the engine is unavailable.

**Why (the moat):** A real analytical engine running offline on millions of rows is something cloud-bound BI tools structurally don't do on-device. It upgrades the app from JS loops to a genuine analytics tool and makes Batches 14/15/16 fast.

**Prerequisite:** Batches 1–7. (This is OPTIONAL — skip if JS performance is adequate; if you implement it, do so additively.)

**DO:**
1. BUNDLE duckdb-wasm assets (the .wasm + worker .js) LOCALLY under `static/` and load them lazily on first use. NO CDN. If load fails, set a flag and fall back to the existing JS compute everywhere — never hard-crash.
2. On import, load the table(s) into DuckDB as virtual tables; keep `DD.data` (the grid view) in sync. DuckDB is the COMPUTE; the grid is the VIEW.
3. Provide `DD.sql(query) -> rows` (async). Route heavy work through SQL where beneficial: aggregations (sum/avg/min/max/median/group-by), outliers, joins, and Batch 15 discovery — key detection (`COUNT(DISTINCT)`), foreign-key/inclusion checks (anti-join: values of A not present in B), functional dependencies (`GROUP BY A` + check B uniqueness). Keep the JS implementations as the fallback path.
4. PERFORMANCE: this is the engine behind Batch 14's virtualized grid and smooth handling of 100k+ rows.

**DON'T:** no CDN; don't make DuckDB a hard dependency (must degrade to JS offline); don't desync the grid view from the engine.

**Acceptance criteria:**
- Load a 100k+ row CSV; a group-by aggregation returns in well under a second.
- Batch 15 discovery uses SQL when the engine is present, JS when it is not — same results.
- Disable the wasm (simulate failure): the app still works on the JS path. Both files identical.

## BATCH 19 — The Cognition Engine: grounded reasoning orchestrator

**Goal:** A deterministic JS controller that wraps the local LLM so its output is expert-level and grounded. It understands the request, DECOMPOSES it into small steps, GROUNDS each step in computed facts + retrieved rows, runs any needed TOOLS itself, and only then asks the model to narrate each small grounded step. The model never computes numbers and never works from a blank prompt.

**Why:** A 4B model fails at one big question but succeeds at small grounded steps. Decomposition + grounding + tool-use is what lifts a weak model to expert quality within the bounded domain of the user's data.

**Prerequisite:** Batches 5–9 (modules + AI proxy + report), ideally Batch 15. Reuse the existing Ollama proxy in app.py for each LLM call.

**DO:**
1. Create controller `DD.cognition.run(task, context)` (pure JS orchestration; one or more small LLM calls).
2. DECOMPOSE: first LLM call returns a PLAN as JSON — an ordered list of small sub-questions/steps. Validate and cap the number of steps (e.g. <= 6). If planning fails, fall back to a single grounded step.
3. GROUND each step: gather exactly the facts it needs from the deterministic engine (modules / `DD.model` / `DD.sql`) and RETRIEVE the most relevant columns/rows/definitions via simple local retrieval (keyword match over headers + a small domain glossary; embeddings optional). Build a compact `evidence` object per step.
4. TOOL USE: when a step needs a computation, the CONTROLLER runs the module/SQL and puts the numeric result into `evidence` — the model is never asked to do arithmetic.
5. DRAFT per step: prompt the model with ONLY that step + its evidence and the instruction: "Answer using ONLY this evidence. If the evidence is insufficient, reply exactly 'INSUFFICIENT'." Small, grounded prompts beat one big prompt.
6. SYNTHESIZE: assemble the step answers into a structured draft, then hand off to Batch 20 (verify) and Batch 21 (tone). Log every step + evidence to Provenance (Batch 17).

**Data contract:**
```text
DD.cognition.run(task, ctx) -> {
  plan:[step...],
  steps:[{ q, evidence, answer, supported:boolean }],
  draft, confidence
}
```

**DON'T:** the model never computes numbers; no step runs without evidence; never exceed the step cap; never proceed past a failed plan without the single-step fallback.

**Acceptance criteria:**
- A complex ask ("which department's overtime is rising fastest?") decomposes into grounded steps, each traceable to computed facts, yielding a correct answer.
- Remove a fact a step needs -> that step returns INSUFFICIENT (which the engine surfaces honestly) instead of inventing. Both files identical.

## BATCH 20 — Verification, Hallucination Guard, Confidence & Abstention

**Goal:** A verifier that checks every number and claim in a draft against the evidence, removes/flags the unsupported, scores a confidence, and ABSTAINS or asks the user when confidence is low — rather than guessing.

**Why:** This is the anti-hallucination machine and the core trust feature. An honest "I'm not sure, here's what's missing" beats a confident wrong answer every time.

**Prerequisite:** Batch 19.

**DO:**
1. NUMBER CHECK: extract every number from the draft; each MUST match a value in the step evidence/computed facts (within rounding). Unmatched numbers are removed or shown as "unverified" — NEVER presented as fact.
2. CLAIM CHECK: for non-numeric claims, run a short "critic" LLM pass — "Is this claim supported by this evidence? Answer yes/no and cite the fact" — and drop unsupported claims.
3. SELF-CONSISTENCY (high-stakes steps only, since it costs compute): sample the step ~3x; if answers materially disagree, mark low-confidence / abstain.
4. CONFIDENCE: compute 0–1 from (fraction of claims supported) x (evidence coverage) x (self-consistency agreement). Surface it visibly.
5. ABSTENTION GATE: below a threshold, output "I'm not confident enough to answer. Here is what I can verify, and what is missing: ..." and invite the user to add data/clarify. Bilingual.
6. PROVENANCE: log which facts supported which sentence (feeds Batch 17 lineage).

**DON'T:** never show an unverified number as fact; never fabricate to fill a gap; never hide low confidence.

**Acceptance criteria:**
- Inject a plausible but unsupported claim/number into a draft -> the verifier catches and removes/flags it.
- A thin-evidence question yields honest abstention with confidence shown.
- Each surviving sentence links to its supporting fact in provenance. Both files identical.

## BATCH 21 — Humanized Expert Tone Layer (fact-frozen)

**Goal:** A final style pass that rewrites the verified content in a warm, clear, expert HUMAN voice — bilingual, with tone presets — WITHOUT introducing any new fact or number.

**Why:** Small models default to a generic robotic tone. A constrained style pass over already-verified text gives expert, human prose with no new hallucination surface.

**Prerequisite:** Batch 20.

**DO:**
1. TONE RUBRIC + PERSONA: "a seasoned analyst explaining to a respected colleague — warm, plain, confident, concise; no fluff, no robotic hedging, no jargon without a plain gloss." Include 3–4 before/after few-shot examples PER LANGUAGE.
2. HARD CONSTRAINT: the style pass receives the verified text + the allowed fact list, with the instruction "Rewrite for tone ONLY. Do not add or change any fact or number." After styling, RE-RUN the Batch 20 number check; if a new/changed number appears, reject and retry.
3. NATURAL HINDI: use Hindi few-shot examples written in natural register (not literal translation), so Hindi output reads like a person, not a translation.
4. PRESETS: user-selectable voice — Official/Formal, Friendly/Simple, Executive-brief — changing VOICE only, never facts.

**Acceptance criteria:**
- Same facts, but output reads human and expert; the post-style number check passes (zero new facts).
- Hindi output reads natural; switching presets changes the voice but not a single number. Both files identical.

---

## APPENDIX A — Module Catalog (register all of these in Batch 3)

Format: id | category | EN name / HI name | accepts -> produces | compute. Icons are inline SVG of your choice matching the meaning; colors follow the category tint.

**Summarize / सारांश**
- average | Average / औसत | column -> value | JS
- sum | Sum / योग | column -> value | JS
- count | Count / गिनती | column -> value | JS
- min | Minimum / न्यूनतम | column -> value | JS
- max | Maximum / अधिकतम | column -> value | JS
- median | Median / माध्यिका | column -> value | JS
- mode | Mode / बहुलक | column -> value | JS
- stddev | Spread (Std Dev) / फैलाव | column -> value | JS
- range | Range / परास | column -> value | JS

**Quality / गुणवत्ता**
- missing | Missing Entries / रिक्त प्रविष्टियाँ | column -> table | JS
- duplicates | Duplicates / दोहराव | column -> table | JS
- unique | Unique Values / अद्वितीय मान | column -> value | JS
- outliers_iqr | Outliers / असामान्य मान | column -> table | JS
- dtype_check | Type Check / प्रकार जाँच | column -> table | JS
- trim_clean | Clean Text / पाठ सफ़ाई | column -> series | JS

**Transform / रूपांतरण**
- filter | Filter Rows / पंक्तियाँ छाँटें | column -> table | JS
- sort | Sort / क्रमबद्ध करें | column -> table | JS
- groupby | Group & Total / समूह व योग | column -> table | JS
- normalize | Normalize / सामान्यीकरण | series -> series | JS
- convert_krutidev | Krutidev <-> Unicode / कृतिदेव बदलें | column -> series | JS (reuse existing converter)

**Predict / पूर्वानुमान**
- linreg_project | Project Next / आगे का अनुमान | series -> series | JS (least-squares; config: how many=k)
- moving_avg | Moving Average / चलित औसत | series -> series | JS (config: window)
- growth_rate | Growth Rate / वृद्धि दर | series -> value | JS
- trend | Trend / प्रवृत्ति | series -> value | JS

**Visualize / चित्रण** (reuse existing chart renderer)
- bar | Bar Chart / बार चार्ट | table -> chart
- line | Line Chart / लाइन चार्ट | table -> chart
- pie | Pie Chart / पाई चार्ट | column -> chart
- scatter | Scatter / स्कैटर | table -> chart
- kpi | KPI Card / केपीआई कार्ड | value -> chart

**Report / रिपोर्ट**
- ai_report | AI Report / एआई रिपोर्ट | any -> report | Batch 9
- excel_export | Excel Export / एक्सेल निर्यात | table -> report | existing endpoint
- pdf_export | PDF Export / पीडीएफ निर्यात | any -> report | existing endpoint

**AI / एआई**
- ask | Ask (build a pipeline) / पूछें | any -> any | Batch 8 planner

(Count target for Batch 3 acceptance: 30 modules.)

---

## APPENDIX B — Commercial & Licensing Notes (for the owner, not the model)

- Channel: sell to DEPARTMENTS/firms (B2B), not individual govt employees. In India: GeM portal, departmental procurement, CA/legal/clinic/SME direct.
- Tiers: Free (manual bubbles + small model) / Pro (Ask Mode, dashboards, batch reports, bigger model) / Office (multi-user, admin). Keep Pro cheap for volume.
- Offline licensing: ship signed license keys verified locally (no phone-home), with a grace period; never break the user's offline promise.
- MODEL LICENSE (critical): Gemma uses Google's Gemma Terms (use restrictions) — verify before bundling in a paid product. For commercial safety prefer a clean Apache-2.0 model of similar size. Always document the bundled model's license.
- Data-privacy positioning is your strongest sales line: "Your data never leaves your computer." Get this in writing in marketing and make it literally true (no telemetry).

---

## APPENDIX C — Risk Register (be honest with buyers)

- Small local LLM = limited prose/reasoning. Mitigation: templates + grounding + facts-only mode; optional Pro "bring-your-own cloud key" for users who accept cloud.
- Node UI can intimidate novices. Mitigation: Ask Mode is the front door; examples + tour.
- Maintenance burden (bundled runtime + model updates, security). Plan an update channel.
- Big-player commoditization. Mitigation: stay vertical, private, vernacular, affordable.

---

## APPENDIX D — Universal per-batch checklist (the model must report these)

1. Both download/ and public/ Simple-Data-Analyser.html are identical.
2. The new feature works in a real browser at http://localhost:5000.
3. EN/HI toggle translates ALL new strings; no leaks in Hindi mode.
4. Nothing previously working broke (spot-check the main flows).
5. Offline check where relevant (disconnect network; fonts + non-AI features still work).
6. State Contract keys unchanged; new state is additive and autosaved.

---

## APPENDIX E — Moat & Positioning (for the owner; global, not one sector)

**The category sentence (use this everywhere):** "Load any messy table and it assembles itself into a living, explorable, perturbable model you can question and simulate — fully offline, fully auditable."

**Honest hierarchy of what defends the business:**
- Features (Power BI parity) = table stakes. Do NOT try to out-feature Microsoft/Salesforce. Win where they are structurally weak: offline/on-prem, zero-skill, multilingual, affordable.
- UI/UX (the cosmic look) = attraction + short-term edge. Copyable in weeks. It sells; it does not defend.
- The real moat stack (build the moat budget here):
  1. Privacy/compliance by construction — "data never leaves the machine." Cloud BI structurally cannot match this. A regulatory tailwind worldwide (India DPDP, EU GDPR data-minimisation, sector rules in finance/health/defence/legal).
  2. The Living Data Model engine (Batches 15–16) — auto structure discovery + live what-if simulation, offline, research-grade and hard to copy.
  3. Provenance/Audit time-machine (Batch 17) — total, tamper-evident lineage. Gold for regulated buyers; compounds with use; near-impossible to retrofit.
  4. Messy-real-world-data ingestion that "just works" (legacy fonts, merged cells, multilingual headers, inconsistent formats) — domain grit competitors won't replicate.
  5. Compounding assets: switching costs (saved Agents/history) and a privacy-preserving community library of Agents + relationship patterns (network effect — share recipes, never data).

**Global framing:** the target is any privacy-sensitive organisation on earth — government, finance, healthcare, legal, defence, SMEs. Bilingual (Hindi/English) is just the first localisation; the architecture is multilingual. Lead globally with privacy + auditability + zero-skill AI, not with sector.

**Do not aim for "monopoly via UI."** Aim for defensible category leadership: the trusted, offline, auditable, self-assembling data brain. Novelty (the engine) buys the head start; the compounding assets (audit history, community library, switching costs) keep the lead.

**Hard commercial flags:** verify the bundled model's commercial licence before any paid tier (prefer Apache-2.0); never add telemetry (the privacy promise must be literally true); price low for volume with a genuinely useful free tier and Pro gating (Ask Mode, simulation, dashboards, batch audit reports).

---

## APPENDIX F — Build vs Fork, and Making a Small LLM Punch Above Its Weight (owner)

**Build vs fork (the engine question):**
- Do NOT fork a heavyweight open-source BI app. Metabase (AGPL — toxic for a closed commercial product), Superset, Redash and Orange are all server/cloud/multi-user, database-connected tools. They are architecturally OPPOSITE to your offline, single-machine, data-never-leaves moat, and you would replace their UI anyway — so the "head start" is an illusion that buys you a giant unfamiliar codebase and licence risk.
- DO stand on offline-first open-source ENGINES/LIBRARIES. The key one: DuckDB-WASM (MIT) — a real analytical SQL engine in the browser, offline, millions of rows (Batch 18). Reuse libraries, not whole apps.

**Making the small local model expert-level (the cognition question):**
- You do not make a 4B model smarter; you WRAP it. The deterministic engine does all math; the Cognition Engine (Batch 19) decomposes the problem and grounds every step; the Verifier (Batch 20) checks claims, scores confidence, and abstains when unsure; the Tone layer (Batch 21) humanizes without adding facts.
- Why it works: the domain is BOUNDED (analysing the user's own data), so the hard reasoning is mostly math you compute deterministically, and the model only narrates verified facts. This is proven agentic engineering, not a wish.
- Honest ceiling: this will NOT equal frontier models (Claude/GPT-4) on open-ended novel reasoning. It WILL reach expert-level, low-hallucination quality on grounded analysis of the user's data — the right, achievable target.
- Model options (RAM-aware, you already auto-select in start.bat): a small instruct model for the default; a stronger Apache-2.0 model (e.g. a ~7B Qwen2.5-Instruct) when RAM allows; a small reasoning-distilled model for hard decomposition steps. ALWAYS verify each model's commercial licence before bundling in a paid tier.
- Optional Pro feature: "bring your own cloud key" for users who accept cloud for frontier reasoning — opt-in only, never default, and it must never weaken the offline/privacy promise for everyone else.
- Anti-hallucination is a SYSTEM property here, not a prompt: deterministic math + grounding + verification + abstention + fact-frozen tone. That stack, not the model, is the product.
