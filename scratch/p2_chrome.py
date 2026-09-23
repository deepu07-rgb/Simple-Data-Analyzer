"""
PRD Batch P2 — Premium Chrome Redesign
Applies surgical changes to collapse 4 chrome bars to ≤2 rows at rest.

Changes:
  1. <html> tag  — add data-stel-view="sheet" (initial state)
  2. switchDDView — set document.documentElement.dataset.stelView = view
  3. updateFormulaBarVisibility — also toggle #fmt-toolbar with data
  4. commandbar HTML — remove 3 duplicate nav buttons; add overflow ⋮ menu
  5. #fmt-toolbar HTML — remove class="visible" (JS-controlled from now on)
  6. CSS P2 block injected after @keyframes float
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB  = ROOT / "public"  / "Simple-Data-Analyser.html"
DL   = ROOT / "download" / "Simple-Data-Analyser.html"

# ---------------------------------------------------------------------------
raw = PUB.read_bytes()
s   = raw.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")
# ---------------------------------------------------------------------------

# ── 1. <html> tag: add data-stel-view="sheet" ────────────────────────────
s = s.replace(
    '<html lang="en" data-theme="dark">',
    '<html lang="en" data-theme="dark" data-stel-view="sheet">'
, 1)

# ── 2. switchDDView: inject data-stel-view setter ────────────────────────
SWITCH_OLD = 'function switchDDView(view) {\n  window.DD = window.DD || {};'
SWITCH_NEW = ('function switchDDView(view) {\n'
              '  document.documentElement.dataset.stelView = view;\n'
              '  window.DD = window.DD || {};')
s = s.replace(SWITCH_OLD, SWITCH_NEW, 1)

# ── 3. updateFormulaBarVisibility: also toggle fmt-toolbar ───────────────
OLD_FBV = (
    'function updateFormulaBarVisibility() {\n'
    '  const fb = document.getElementById(\'formula-bar\');\n'
    '  fb.classList.toggle(\'visible\', rawData.length > 0);\n'
    '}'
)
NEW_FBV = (
    'function updateFormulaBarVisibility() {\n'
    '  const fb  = document.getElementById(\'formula-bar\');\n'
    '  const fmt = document.getElementById(\'fmt-toolbar\');\n'
    '  const hasData = rawData.length > 0;\n'
    '  fb.classList.toggle(\'visible\', hasData);\n'
    '  if (fmt) fmt.classList.toggle(\'visible\', hasData);\n'
    '}'
)
s = s.replace(OLD_FBV, NEW_FBV, 1)

# ── 4. Remove class="visible" from #fmt-toolbar opening tag ──────────────
s = s.replace(
    '<div id="fmt-toolbar" class="visible">',
    '<div id="fmt-toolbar">',
    1
)

# ── 5. Replace commandbar contents ───────────────────────────────────────
OLD_CMDBAR = '''    <div id="commandbar">
      <button class="tb-btn" onclick="document.getElementById('fileInput').click()" title="Import File (Ctrl+O)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg><span data-i18n="import">Import</span></button>
      <button class="tb-btn" onclick="pasteFromClipboard()" title="Paste from Clipboard"><span data-i18n="paste">Paste</span></button>
      <div class="tb-sep"></div>
      <button class="tb-btn" onclick="switchTool('analysis')"><span data-i18n="analyze">Analyze</span></button>
      <button class="tb-btn" onclick="switchTool('formulas')"><span data-i18n="functions">Functions</span></button>
      <button class="tb-btn" onclick="switchTool('chart')"><span data-i18n="chart">Chart</span></button>
      <button class="tb-btn" onclick="switchTool('pivot')"><span data-i18n="pivotTable">Pivot Table</span></button>
      <button class="tb-btn" onclick="switchTool('filter')"><span data-i18n="filter">Filter</span></button>
      <button class="tb-btn" onclick="switchTool('validation')"><span data-i18n="validate">Validate</span></button>
      <button class="tb-btn success" onclick="openCleanupWizard()" title="Guided data cleaning — चरण-दर-चरण डेटा सफाई"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg><span data-i18n="smartClean">Smart Clean</span></button>
      <button class="tb-btn" onclick="switchDDView('xray')" title="Data X-Ray — detect structure &amp; relationships / डेटा एक्स-रे — संरचना पहचानें"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg><span data-i18n="viewXray">X-Ray</span></button>
      <button class="tb-btn" onclick="switchDDView('whatif')" title="What-If Simulation — project outcomes from drivers / क्या-अगर सिमुलेशन — चालकों से परिणाम अनुमानित करें"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg><span data-i18n="viewWhatif">What-If</span></button>
      <button class="tb-btn" onclick="switchDDView('audit')" title="Audit Trail — tamper-evident provenance log / ऑडिट रिकॉर्ड — छेड़छाड़-प्रमाण उद्गम लॉग"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><span data-i18n="viewAudit">Audit</span></button>
      <div class="tb-sep"></div>
      <button class="tb-btn" onclick="autoFormatWorksheet()" title="Trim, align, wrap and fit the worksheet"><span data-i18n="autoFormat">Auto Format</span></button>
      <button class="tb-btn active" id="inspectorToggleBtn" onclick="toggleLiveInspector()" title="Show or hide Live Cell Intelligence"><span data-i18n="inspector">Inspector</span></button>
      <button class="tb-btn" onclick="showPrintPreview()" title="Print or save as PDF"><span data-i18n="printLayout">Print Layout</span></button>
      <button class="tb-btn" onclick="showExportExcelDialog()" title="Export to Excel"><span data-i18n="excel">Excel</span></button>
      <button class="tb-btn" onclick="showExportPDFDialog()" title="Export to PDF"><span data-i18n="pdf">PDF</span></button>
      <button class="tb-btn danger" onclick="deleteSelectedRows()" title="Delete Selected Rows" id="btnDeleteRows" style="display:none"><span data-i18n="deleteRows">Delete Rows</span></button>
      <div class="tb-sep"></div>
      <div class="tb-sep"></div>
      <button class="tb-btn" onclick="switchTool('settings')" title="Settings / सेटिंग्स"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg></button>
      <button class="api-status-btn" id="ollama-status-badge" onclick="checkOllamaStatus()" title="Local AI status — click to refresh">&#129504; Checking AI...</button>
      <button class="api-status-btn sql-js" id="sql-engine-badge" onclick="_dbInit()" title="SQL engine — click to activate / SQL इंजन — सक्रिय करने के लिए क्लिक करें">&#128190; SQL: JS</button>
    </div>'''

NEW_CMDBAR = '''    <div id="commandbar">
      <!-- Primary actions -->
      <button class="tb-btn" onclick="document.getElementById('fileInput').click()" title="Import File (Ctrl+O)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg><span data-i18n="import">Import</span></button>
      <button class="tb-btn" onclick="pasteFromClipboard()" title="Paste from Clipboard"><span data-i18n="paste">Paste</span></button>
      <div class="tb-sep"></div>
      <button class="tb-btn" onclick="switchTool('analysis')"><span data-i18n="analyze">Analyze</span></button>
      <button class="tb-btn" onclick="switchTool('chart')"><span data-i18n="chart">Chart</span></button>
      <button class="tb-btn" onclick="switchTool('filter')"><span data-i18n="filter">Filter</span></button>
      <button class="tb-btn success" onclick="openCleanupWizard()" title="Guided data cleaning — चरण-दर-चरण डेटा सफाई"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg><span data-i18n="smartClean">Clean</span></button>
      <div class="tb-sep"></div>
      <button class="tb-btn" onclick="showExportExcelDialog()" title="Export to Excel"><span data-i18n="excel">Excel</span></button>
      <button class="tb-btn" onclick="showExportPDFDialog()" title="Export to PDF"><span data-i18n="pdf">PDF</span></button>
      <button class="tb-btn danger" onclick="deleteSelectedRows()" title="Delete Selected Rows / चयनित पंक्तियाँ हटाएं" id="btnDeleteRows" style="display:none"><span data-i18n="deleteRows">Delete Rows</span></button>
      <div class="tb-sep"></div>
      <!-- AI + SQL status pills -->
      <button class="api-status-btn" id="ollama-status-badge" onclick="checkOllamaStatus()" title="Local AI status — click to refresh">&#129504; Checking AI...</button>
      <button class="api-status-btn sql-js" id="sql-engine-badge" onclick="_dbInit()" title="SQL engine / SQL इंजन">&#128190; SQL</button>
      <!-- Spacer pushes overflow menu to far right -->
      <div class="tb-spacer"></div>
      <!-- Overflow ⋮ menu -->
      <div class="p2-overflow-wrap" id="p2OverflowWrap">
        <button class="tb-btn p2-overflow-trigger" onclick="_p2ToggleOverflow()" title="More actions / अधिक विकल्प" aria-haspopup="true" aria-expanded="false" id="p2OverflowBtn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/></svg>
          <span>More</span>
        </button>
        <div class="p2-overflow-menu" id="p2OverflowMenu" role="menu">
          <button class="p2-ovf-item" onclick="switchTool('formulas');_p2CloseOverflow()" role="menuitem"><span data-i18n="functions">Functions</span></button>
          <button class="p2-ovf-item" onclick="switchTool('pivot');_p2CloseOverflow()" role="menuitem"><span data-i18n="pivotTable">Pivot Table</span></button>
          <button class="p2-ovf-item" onclick="switchTool('validation');_p2CloseOverflow()" role="menuitem"><span data-i18n="validate">Validate</span></button>
          <div class="p2-ovf-sep"></div>
          <button class="p2-ovf-item" onclick="autoFormatWorksheet();_p2CloseOverflow()" role="menuitem"><span data-i18n="autoFormat">Auto Format</span></button>
          <button class="p2-ovf-item" id="inspectorToggleBtn" onclick="toggleLiveInspector();_p2CloseOverflow()" role="menuitem"><span data-i18n="inspector">Inspector</span></button>
          <button class="p2-ovf-item" onclick="showPrintPreview();_p2CloseOverflow()" role="menuitem"><span data-i18n="printLayout">Print Layout</span></button>
          <div class="p2-ovf-sep"></div>
          <button class="p2-ovf-item" onclick="switchTool('settings');_p2CloseOverflow()" role="menuitem">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
            Settings / सेटिंग्स
          </button>
        </div>
      </div>
    </div>'''

assert OLD_CMDBAR in s, "ERROR: old commandbar not found verbatim — check for CRLF or invisible diffs"
s = s.replace(OLD_CMDBAR, NEW_CMDBAR, 1)

# ── 6. Inject P2 CSS after @keyframes float ───────────────────────────────
P2_CSS = """
/* ===== P2 — Premium Chrome Redesign ===================================== */

/* --- Layout tokens (slim bars) --- */
:root{--p2-toolbar-h:48px;--p2-cmd-h:36px}
@media(min-width:1200px){
  :root{--toolbar-h:var(--p2-toolbar-h)}
  #commandbar{height:var(--p2-cmd-h)!important}
}

/* --- Toolbar: slim, glass, cosmic border-glow --- */
#toolbar{
  height:var(--p2-toolbar-h);
  background:var(--glass-bg)!important;
  backdrop-filter:blur(32px) saturate(160%)!important;
  -webkit-backdrop-filter:blur(32px) saturate(160%)!important;
  border-bottom:1px solid rgba(221,184,255,.18)!important;
  box-shadow:0 1px 0 0 rgba(76,215,246,.10),0 4px 24px rgba(0,0,0,.18);
  padding:0 16px;gap:6px;overflow:visible;flex-shrink:0
}
[data-theme="light"] #toolbar{
  border-bottom:1px solid rgba(126,34,206,.16)!important;
  box-shadow:0 1px 0 0 rgba(126,34,206,.10)
}

/* Product brand tweaks */
.product-name{font:750 17px/1.1 'Sora','Manrope','Inter',sans-serif;letter-spacing:-.3px}
.product-subtitle{font-size:9.5px;letter-spacing:.04em;opacity:.7}
.product-mark{width:30px;height:30px;border-radius:7px;background:linear-gradient(135deg,#1c1430,#2a1852)}

/* --- View switch: premium pill style --- */
.dd-view-switch{
  background:rgba(255,255,255,.06);
  border:1px solid rgba(221,184,255,.14);
  border-radius:999px;
  padding:3px;
  gap:2px
}
.dd-view-btn{
  height:26px;padding:0 12px;border-radius:999px;
  font:600 11.5px/1 'Inter',sans-serif;
  color:var(--on-surface-muted,#b6a9c4);
  background:transparent;border:none;
  transition:background .18s,color .18s,box-shadow .18s;
  cursor:pointer;white-space:nowrap
}
.dd-view-btn:hover{color:var(--dd-primary,#ddb8ff);background:rgba(221,184,255,.10)}
.dd-view-btn.active{
  background:linear-gradient(120deg,rgba(221,184,255,.22),rgba(76,215,246,.15));
  color:var(--dd-primary,#ddb8ff);
  box-shadow:0 0 0 1px rgba(221,184,255,.3),0 2px 8px rgba(0,0,0,.2)
}
.dd-view-btn:focus-visible{
  outline:2px solid var(--dd-primary,#ddb8ff);
  outline-offset:2px
}
[data-theme="light"] .dd-view-switch{background:rgba(0,0,0,.05);border-color:rgba(126,34,206,.14)}
[data-theme="light"] .dd-view-btn.active{background:rgba(126,34,206,.12);color:#6a1cb0}
[data-theme="light"] .dd-view-btn:hover{color:#7e22ce;background:rgba(126,34,206,.07)}

/* --- Toolbar buttons: refined hover/focus --- */
.tb-btn{
  height:28px;padding:0 10px;border-radius:8px;
  font:600 11.5px/1 'Inter',sans-serif;
  border:1px solid transparent;
  background:transparent;color:var(--on-surface,#eadfed);
  display:inline-flex;align-items:center;gap:5px;
  cursor:pointer;flex-shrink:0;white-space:nowrap;
  transition:background .15s,border-color .15s,box-shadow .15s,color .15s,transform .12s
}
.tb-btn:hover{
  background:rgba(221,184,255,.10);
  border-color:rgba(221,184,255,.20);
  color:var(--dd-primary,#ddb8ff)
}
.tb-btn:active{transform:scale(.96)}
.tb-btn:focus-visible{
  outline:2px solid var(--dd-primary,#ddb8ff);
  outline-offset:2px
}
.tb-btn.success{color:#34d399;border-color:rgba(52,211,153,.18)}
.tb-btn.success:hover{background:rgba(52,211,153,.10);border-color:rgba(52,211,153,.35)}
.tb-btn.danger{color:#f472b6;border-color:rgba(244,114,182,.18)}
.tb-btn.danger:hover{background:rgba(244,114,182,.10);border-color:rgba(244,114,182,.35)}
[data-theme="light"] .tb-btn{color:#102033}
[data-theme="light"] .tb-btn:hover{background:rgba(126,34,206,.07);border-color:rgba(126,34,206,.18);color:#7e22ce}

/* --- Commandbar: slim, glass, sheet-view only --- */
#commandbar{
  height:var(--p2-cmd-h);
  padding:0 16px;gap:2px;
  background:var(--glass-bg)!important;
  backdrop-filter:blur(24px) saturate(140%)!important;
  -webkit-backdrop-filter:blur(24px) saturate(140%)!important;
  border-bottom:1px solid rgba(221,184,255,.10)!important;
  flex-shrink:0;overflow:visible
}
#commandbar .tb-btn{height:26px;padding:0 9px;font-size:11px;border-radius:7px}

/* Hide commandbar in non-sheet views */
[data-stel-view="agents"] #commandbar,
[data-stel-view="reports"] #commandbar,
[data-stel-view="xray"] #commandbar,
[data-stel-view="whatif"] #commandbar,
[data-stel-view="audit"] #commandbar{display:none!important}

/* Also hide fmt-toolbar and formula-bar in non-sheet views */
[data-stel-view="agents"] #fmt-toolbar,
[data-stel-view="agents"] #formula-bar,
[data-stel-view="reports"] #fmt-toolbar,
[data-stel-view="reports"] #formula-bar,
[data-stel-view="xray"] #fmt-toolbar,
[data-stel-view="xray"] #formula-bar,
[data-stel-view="whatif"] #fmt-toolbar,
[data-stel-view="whatif"] #formula-bar,
[data-stel-view="audit"] #fmt-toolbar,
[data-stel-view="audit"] #formula-bar{display:none!important}

/* --- API status pills: compact --- */
.api-status-btn{
  height:24px;padding:0 9px;border-radius:999px;
  font:600 10px/1 'Inter',sans-serif;
  border:1px solid rgba(221,184,255,.16);
  background:rgba(221,184,255,.06);color:var(--on-surface-muted,#b6a9c4);
  cursor:pointer;white-space:nowrap;flex-shrink:0;
  transition:background .15s,border-color .15s
}
.api-status-btn:hover{background:rgba(221,184,255,.13);border-color:rgba(221,184,255,.3)}
.api-status-btn:focus-visible{outline:2px solid var(--dd-primary,#ddb8ff);outline-offset:2px}

/* --- Overflow ⋮ menu --- */
.p2-overflow-wrap{position:relative;flex-shrink:0}
.p2-overflow-trigger{border:1px solid rgba(221,184,255,.15)!important}
.p2-overflow-trigger:hover{background:rgba(221,184,255,.12)!important;border-color:rgba(221,184,255,.3)!important}
.p2-overflow-menu{
  display:none;position:absolute;top:calc(100% + 6px);right:0;min-width:190px;z-index:900;
  background:var(--glass-bg,rgba(22,17,27,.92));
  backdrop-filter:blur(32px) saturate(160%);
  -webkit-backdrop-filter:blur(32px) saturate(160%);
  border:1px solid rgba(221,184,255,.20);
  border-radius:12px;
  box-shadow:0 16px 40px rgba(0,0,0,.45),0 0 0 1px rgba(221,184,255,.08);
  padding:6px;overflow:hidden
}
.p2-overflow-menu.open{display:block;animation:p2FadeIn .14s cubic-bezier(.34,1.56,.64,1)}
@keyframes p2FadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
.p2-ovf-item{
  display:flex;align-items:center;gap:8px;width:100%;padding:7px 12px;
  border:none;background:transparent;border-radius:8px;
  font:500 12px/1.3 'Inter',sans-serif;color:var(--on-surface,#eadfed);
  cursor:pointer;text-align:left;
  transition:background .13s,color .13s
}
.p2-ovf-item:hover{background:rgba(221,184,255,.12);color:var(--dd-primary,#ddb8ff)}
.p2-ovf-item:focus-visible{outline:2px solid var(--dd-primary,#ddb8ff);outline-offset:-2px;border-radius:8px}
.p2-ovf-sep{height:1px;background:rgba(221,184,255,.10);margin:4px 6px}
[data-theme="light"] .p2-overflow-menu{background:rgba(255,255,255,.95);border-color:rgba(126,34,206,.18)}
[data-theme="light"] .p2-ovf-item{color:#102033}
[data-theme="light"] .p2-ovf-item:hover{background:rgba(126,34,206,.07);color:#7e22ce}

/* --- Fmt-toolbar and formula-bar: glass, slimmer --- */
#fmt-toolbar{
  height:36px;padding:0 16px;gap:2px;
  background:var(--glass-bg)!important;
  backdrop-filter:blur(24px)!important;
  -webkit-backdrop-filter:blur(24px)!important;
  border-bottom:1px solid rgba(221,184,255,.08)!important
}
#formula-bar{
  height:38px;padding:0 16px;gap:8px;
  background:transparent!important;
  border-bottom:1px solid rgba(221,184,255,.08)!important
}

/* --- Universal focus ring (on-brand) --- */
:focus-visible{
  outline:2px solid var(--dd-primary,#ddb8ff);
  outline-offset:2px;
  border-radius:4px
}

/* ===== end P2 ============================================================ */
"""

ANCHOR = "@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}"
assert ANCHOR in s, "ERROR: @keyframes float anchor not found"
s = s.replace(ANCHOR, ANCHOR + P2_CSS, 1)

# ── 7. Inject overflow JS helpers before </body> ──────────────────────────
P2_JS = """
<script>
/* P2 — overflow ⋮ menu helpers */
function _p2ToggleOverflow(){
  var m=document.getElementById('p2OverflowMenu');
  var b=document.getElementById('p2OverflowBtn');
  if(!m)return;
  var open=m.classList.toggle('open');
  if(b)b.setAttribute('aria-expanded',open);
  if(open){
    setTimeout(function(){document.addEventListener('click',_p2Outside,{once:true,capture:true})},0);
  }
}
function _p2CloseOverflow(){
  var m=document.getElementById('p2OverflowMenu');
  var b=document.getElementById('p2OverflowBtn');
  if(m)m.classList.remove('open');
  if(b)b.setAttribute('aria-expanded','false');
}
function _p2Outside(e){
  var w=document.getElementById('p2OverflowWrap');
  if(w&&!w.contains(e.target))_p2CloseOverflow();
}
</script>
</body>"""

s = s.replace("</body>", P2_JS, 1)

# ---------------------------------------------------------------------------
out = s.encode("utf-8")
PUB.write_bytes(out)
DL.write_bytes(out)

import hashlib
sha = hashlib.sha256(out).hexdigest()
print(f"P2 done. {len(out):,} bytes | SHA-256: {sha}")

# Quick sanity checks
assert 'data-stel-view="sheet"' in s
assert 'dataset.stelView = view' in s
assert 'p2-overflow-menu' in s
assert 'p2FadeIn' in s
assert '_p2ToggleOverflow' in s
assert '<div id="fmt-toolbar">' in s      # no class="visible"
assert 'class="visible"' not in s.split('<div id="fmt-toolbar">')[1][:5]
print("All sanity checks passed.")
