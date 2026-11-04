// =====================================================================
//  STATE MANAGEMENT
// =====================================================================
let rawData = [];
let headers = [];
let colTypes = [];
let filteredData = null;
let searchTerm = '';
let searchMatches = [];
let searchMatchIdx = -1;
let sortCol = -1;
let sortDir = 'asc';
let cfRules = [];
let activeFilters = [];
let validationRules = [];
let chartInstance = null;
let chartXCol = -1;
let chartYCol = -1;
let undoStack = [];
let redoStack = [];
let operationHistory = [];
let guidedLastResult = null;
let uiLanguage = localStorage.getItem('sda_ui_language') || 'en';
let selectedCFColor = '#ef4444';
let selectedRows = new Set();
let ctxRowIdx = -1;
let ctxColIdx = -1;
let pivotConfig = { rows: [], cols: [], vals: [] };
let dashCharts = [];
let pendingWorkbook = null;
let pendingSheets = [];
let selectedSheetIdx = 0;
let resizingCol = -1;
let resizeStartX = 0;
let colWidths = {};
let cellFonts = {};
let cellBold = {};
let cellItalic = {};
let cellUnderline = {};
let cellFontSize = {};
let cellFontColor = {};
let cellBgColor = {};
let cellAlignments = {};
let cellWraps = {};
let cellNumFormats = {};
let cellComments = {};
let mergedCells = [];
let userProfile = { name: '', desig: '', org: '', dateFmt: 'DD/MM/YYYY', include: true, autofill: true };
let recycleBin = [];
let selectionStart = { ri: null, ci: null };
let selectionEnd = { ri: null, ci: null };
let activeCell = { ri: null, ci: null };
let additionalSelections = [];
let selectionMode = 'cell';
let isSelecting = false;
let resultFocusKey = null;
let cellFormulaMeta = {};
let guidedSourceSelection = null;
let cursorFormulaHoverKey = null;
let cursorIntelligenceEnabled = (localStorage.getItem('worksheet_intelligence_cursor') ?? localStorage.getItem('pragya_cursor_intelligence')) !== 'false';
let liveInspectorEnabled = (localStorage.getItem('worksheet_intelligence_inspector') ?? localStorage.getItem('pragya_live_inspector')) !== 'false';
let worksheetZoom = parseInt(localStorage.getItem('worksheet_intelligence_zoom') || localStorage.getItem('pragya_zoom') || '100', 10);
const hiddenCols = new Set();
let ctxHeaderColIdx = -1;

const ROW_HEIGHT = 30;
const VISIBLE_BUFFER = 20;
const MAX_UNDO = 30;

// =====================================================================
//  INITIALIZATION
// =====================================================================
document.addEventListener('DOMContentLoaded', () => {
  initAetherisUi();
  loadThemePreference();
  renderModuleDrawer(); // Batch 3: fill drawer from registry
  tryAutoLoad();
  setUiLanguage(uiLanguage, false);
  setupScrollListener();
  setupKeyboardShortcuts();
  setupContextMenu();
  setupGlobalPaste();
  updateFormulaBarVisibility();
  setupCellSelection();
  applyWorkspacePreferences();
  updateLiveInspector();
  checkOllamaStatus();
});

function loadThemePreference() {
  // Aetheris is dark-first: cosmic dark by default, light only if the user explicitly chose it.
  const saved = localStorage.getItem('sda_theme');
  const theme = saved === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcon();
}

// Batch 1 + 2: state-contract UI init + calm-mode (reduce-motion) detection.
function initAetherisUi() {
  window.DD = window.DD || {};
  DD.ui = DD.ui || { reduceMotion: false };
  DD.workspace = DD.workspace || { view: 'sheet', nodes: [], edges: [] };
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      DD.ui.reduceMotion = true;
      document.documentElement.classList.add('reduce-motion');
    }
  } catch (e) { /* matchMedia unsupported */ }
}

// =====================================================================
//  BATCH 2 — View switching  (sheet | agents | reports)
// =====================================================================
function switchDDView(view) {
  document.documentElement.dataset.stelView = view;
  window.DD = window.DD || {};
  DD.workspace = DD.workspace || { view: 'sheet', nodes: [], edges: [] };
  DD.workspace.view = view;

  // Update segmented control active state
  document.querySelectorAll('.dd-view-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  var content = document.getElementById('content');
  var drawer = document.getElementById('dd-module-drawer');
  var canvas = document.getElementById('dd-agents-canvas');
  var welcome = document.getElementById('welcome');
  var tableWrap = document.getElementById('table-wrap');
  var dashView = document.getElementById('dashboard-view');

  // Brief fade out, then swap
  if (content) content.style.opacity = '0';
  setTimeout(function() {
    // Close any open tool panels first
    document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('visible'); });
    if (dashView) dashView.classList.remove('visible');
    var xrayView = document.getElementById('dd-xray-view'); if (xrayView) xrayView.style.display = 'none';
    var whatifView = document.getElementById('dd-whatif-view'); if (whatifView) whatifView.style.display = 'none';
    var auditView = document.getElementById('dd-audit-view'); if (auditView) auditView.style.display = 'none';

    if (view === 'sheet') {
      // Hide agents canvas + drawer, restore normal sheet state
      if (canvas) canvas.style.display = 'none';
      if (drawer) drawer.style.display = 'none';
      if (typeof rawData !== 'undefined' && rawData.length > 0) {
        if (welcome) welcome.style.display = 'none';
        if (tableWrap) tableWrap.classList.add('visible');
      } else {
        if (welcome) welcome.style.display = 'flex';
        if (tableWrap) tableWrap.classList.remove('visible');
      }
    } else if (view === 'agents') {
      // Show module drawer + agents canvas, hide grid
      if (drawer) drawer.style.display = 'flex';
      if (canvas) canvas.style.display = 'flex';
      if (welcome) welcome.style.display = 'none';
      if (tableWrap) tableWrap.classList.remove('visible');
    } else if (view === 'reports') {
      // Hide agents canvas + drawer, show report panel (if data loaded)
      if (canvas) canvas.style.display = 'none';
      if (drawer) drawer.style.display = 'none';
      if (typeof rawData !== 'undefined' && rawData.length > 0) {
        if (welcome) welcome.style.display = 'none';
        if (tableWrap) tableWrap.classList.add('visible');
        var reportPanel = document.getElementById('report-panel');
        if (reportPanel) {
          reportPanel.classList.add('visible');
          if (typeof initReportPanel === 'function') initReportPanel();
        }
      } else {
        if (welcome) welcome.style.display = 'flex';
        toast((typeof uiLanguage !== 'undefined' && uiLanguage === 'hi')
          ? 'रिपोर्ट के लिए पहले डेटा आयात करें' : 'Import data first to use Reports', 'info');
      }
    } else if (view === 'xray') {
      // Batch 15: Data X-Ray view
      if (canvas) canvas.style.display = 'none';
      if (drawer) drawer.style.display = 'none';
      if (welcome) welcome.style.display = 'none';
      if (tableWrap) tableWrap.classList.remove('visible');
      if (xrayView) {
        xrayView.style.display = 'flex';
        if (typeof _ddXraySchedule === 'function') _ddXraySchedule();
        if (window.DD && DD.model && DD.model.columns && DD.model.columns.length > 0) {
          requestAnimationFrame(function() { if (typeof _ddXrayRender === 'function') _ddXrayRender(); });
        }
      }
    } else if (view === 'audit') {
      // Batch 17: Audit / Provenance Time-Machine
      if (canvas) canvas.style.display = 'none';
      if (drawer) drawer.style.display = 'none';
      if (welcome) welcome.style.display = 'none';
      if (tableWrap) tableWrap.classList.remove('visible');
      if (auditView) {
        auditView.style.display = 'flex';
        requestAnimationFrame(function() { if (typeof _pvRender === 'function') _pvRender(); });
      }
    } else if (view === 'whatif') {
      // Batch 16: What-If Simulation view
      if (canvas) canvas.style.display = 'none';
      if (drawer) drawer.style.display = 'none';
      if (welcome) welcome.style.display = 'none';
      if (tableWrap) tableWrap.classList.remove('visible');
      if (whatifView) {
        whatifView.style.display = 'flex';
        if (typeof _ddXraySchedule === 'function') _ddXraySchedule();
        requestAnimationFrame(function() {
          if (typeof _wiInit === 'function') _wiInit();
          if (typeof _wiTarget !== 'undefined' && _wiTarget && window.DD && DD.sim && DD.sim.fitted[_wiTarget]) {
            if (typeof _wiSimRun === 'function') _wiSimRun();
          }
        });
      }
    }

    // Fade in + trigger re-render if needed
    if (content) {
      content.style.opacity = '1';
      content.classList.add('dd-view-fadein');
      setTimeout(function() { content.classList.remove('dd-view-fadein'); }, 220);
    }

    // Persist view in existing autosave slot
    try {
      var saved = localStorage.getItem('sda_state_v2');
      var s = saved ? JSON.parse(saved) : {};
      s.ddView = view;
      localStorage.setItem('sda_state_v2', JSON.stringify(s));
    } catch (e) { /* quota or parse error */ }

    // Update i18n on new elements
    if (typeof setUiLanguage === 'function' && typeof uiLanguage !== 'undefined') {
      setUiLanguage(uiLanguage, false);
    }
  }, 160);
}

// =====================================================================
//  BATCH 3 — Module Registry, Catalog, Drawer Renderer
// =====================================================================
window.DD = window.DD || {};
DD.modules = {};

DD.registerModule = function(def) {
  if (!def || !def.id || !def.category || !def.name || !def.run) {
    console.warn('[DD] registerModule: invalid definition', def && def.id);
    return;
  }
  DD.modules[def.id] = def;
};

DD.getModulesByCategory = function() {
  var groups = {};
  Object.values(DD.modules).forEach(function(mod) {
    if (!groups[mod.category]) groups[mod.category] = [];
    groups[mod.category].push(mod);
  });
  return groups;
};

// Category metadata (label + tint colour)
DD._catMeta = {
  summarize: { label:{en:'Summarize',hi:'सारांश'},      color:'#ddb8ff', glow:'rgba(221,184,255,.25)' },
  quality:   { label:{en:'Quality',  hi:'गुणवत्ता'},    color:'#4cd7f6', glow:'rgba(76,215,246,.25)'  },
  transform: { label:{en:'Transform',hi:'रूपांतरण'},    color:'#a78bfa', glow:'rgba(167,139,250,.25)' },
  predict:   { label:{en:'Predict',  hi:'पूर्वानुमान'}, color:'#34d399', glow:'rgba(52,211,153,.25)'  },
  visualize: { label:{en:'Visualize',hi:'चित्रण'},      color:'#f472b6', glow:'rgba(244,114,182,.25)' },
  report:    { label:{en:'Report',   hi:'रिपोर्ट'},      color:'#fb923c', glow:'rgba(251,146,60,.25)'  },
  ai:        { label:{en:'AI',       hi:'एआई'},          color:'#fbbf24', glow:'rgba(251,191,36,.25)'  }
};

// Inline-SVG icon paths (24×24, fill="none" stroke="currentColor")
var _ic = {
  average:        '<line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="17" x2="13" y2="17"/>',
  sum:            '<path d="M16 3H6l5 9-5 9h10"/><line x1="5" y1="12" x2="19" y2="12"/>',
  count:          '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  min:            '<polyline points="4 15 8 9 12 13 16 7 20 11"/><line x1="4" y1="19" x2="20" y2="19"/>',
  max:            '<polyline points="4 9 8 15 12 11 16 17 20 13"/><line x1="4" y1="5" x2="20" y2="5"/>',
  median:         '<line x1="4" y1="12" x2="20" y2="12"/><circle cx="12" cy="12" r="3"/><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="18" x2="20" y2="18"/>',
  mode:           '<rect x="2" y="10" width="4" height="10" rx="1"/><rect x="10" y="5" width="4" height="15" rx="1"/><rect x="18" y="2" width="4" height="18" rx="1"/>',
  stddev:         '<path d="M3 18 Q6 18 9 10 Q11 4 12 4 Q13 4 15 10 Q18 18 21 18"/>',
  range:          '<line x1="4" y1="12" x2="20" y2="12"/><polyline points="8 8 4 12 8 16"/><polyline points="16 8 20 12 16 16"/>',
  missing:        '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
  duplicates:     '<rect x="3" y="3" width="13" height="13" rx="2"/><rect x="8" y="8" width="13" height="13" rx="2"/>',
  unique:         '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  outliers_iqr:   '<circle cx="12" cy="12" r="3"/><path d="M3 12h5M16 12h5"/><circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2" fill="currentColor"/>',
  dtype_check:    '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>',
  trim_clean:     '<path d="M4 7h16M4 12h10M4 17h6"/><circle cx="17" cy="17" r="5"/><line x1="15" y1="15" x2="19" y2="19"/>',
  filter:         '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  sort:           '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><polyline points="3 8 5 6 7 8"/><polyline points="3 16 5 18 7 16"/>',
  groupby:        '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>',
  normalize:      '<path d="M3 12 Q7 3 12 12 Q17 21 21 12"/><line x1="3" y1="12" x2="21" y2="12" stroke-dasharray="3 3"/>',
  convert_krutidev:'<path d="M5 8l6-6 6 6M5 16l6 6 6-6"/><line x1="12" y1="2" x2="12" y2="22"/>',
  linreg_project: '<polyline points="3 18 9 12 13 16 21 7"/><polyline points="18 7 21 7 21 10"/>',
  moving_avg:     '<path d="M3 12 Q7 6 12 12 Q17 18 21 12"/><line x1="3" y1="18" x2="21" y2="18" stroke-dasharray="2 3"/>',
  growth_rate:    '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  trend:          '<line x1="3" y1="20" x2="21" y2="4"/><circle cx="3" cy="20" r="2"/><circle cx="21" cy="4" r="2"/>',
  bar:            '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>',
  line:           '<polyline points="3 18 9 12 13 16 21 7"/><line x1="2" y1="20" x2="22" y2="20"/>',
  pie:            '<path d="M21.21 15.89A10 10 0 118 2.83"/><path d="M22 12A10 10 0 0012 2v10z"/>',
  scatter:        '<circle cx="7" cy="17" r="2"/><circle cx="16" cy="7" r="2"/><circle cx="19" cy="16" r="2"/><circle cx="4" cy="9" r="2"/>',
  kpi:            '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>',
  ai_report:      '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="13" y1="17" x2="8" y2="17"/><circle cx="18" cy="19" r="3"/>',
  excel_export:   '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="8 13 10 16 12 13"/><line x1="10" y1="11" x2="10" y2="19"/>',
  pdf_export:     '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="9" y2="18"/><path d="M7 13h4a2 2 0 010 4H7v-4z"/>',
  ask:            '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><path d="M12 7v2M12 13h.01"/>'
};

// Stub run function
function _makeStub(nameObj) {
  return async function() {
    return { type:'value', value:null, label:nameObj, display:'<span style="color:var(--text-muted);font-size:10.5px">Coming soon — Batch 5</span>', raw:null };
  };
}

// --- Full module catalog (33 modules, Appendix A) ---
[
  // SUMMARIZE (9)
  {id:'average',category:'summarize',icon:_ic.average,color:'#ddb8ff',name:{en:'Average',hi:'औसत'},desc:{en:'Calculate the mean of a column',hi:'कॉलम का औसत मान निकालें'},accepts:'column',produces:'value',config:[{key:'col',type:'column',label:{en:'Column',hi:'कॉलम'}}]},
  {id:'sum',category:'summarize',icon:_ic.sum,color:'#ddb8ff',name:{en:'Sum',hi:'योग'},desc:{en:'Add up all values in a column',hi:'कॉलम के सभी मान जोड़ें'},accepts:'column',produces:'value',config:[{key:'col',type:'column',label:{en:'Column',hi:'कॉलम'}}]},
  {id:'count',category:'summarize',icon:_ic.count,color:'#ddb8ff',name:{en:'Count',hi:'गिनती'},desc:{en:'Count non-empty entries in a column',hi:'कॉलम की भरी हुई प्रविष्टियाँ गिनें'},accepts:'column',produces:'value',config:[{key:'col',type:'column',label:{en:'Column',hi:'कॉलम'}}]},
  {id:'min',category:'summarize',icon:_ic.min,color:'#ddb8ff',name:{en:'Minimum',hi:'न्यूनतम'},desc:{en:'Find the smallest value in a column',hi:'कॉलम का सबसे छोटा मान खोजें'},accepts:'column',produces:'value',config:[{key:'col',type:'column',label:{en:'Column',hi:'कॉलम'}}]},
  {id:'max',category:'summarize',icon:_ic.max,color:'#ddb8ff',name:{en:'Maximum',hi:'अधिकतम'},desc:{en:'Find the largest value in a column',hi:'कॉलम का सबसे बड़ा मान खोजें'},accepts:'column',produces:'value',config:[{key:'col',type:'column',label:{en:'Column',hi:'कॉलम'}}]},
  {id:'median',category:'summarize',icon:_ic.median,color:'#ddb8ff',name:{en:'Median',hi:'माध्यिका'},desc:{en:'Find the middle value of a column',hi:'कॉलम का बीच का मान खोजें'},accepts:'column',produces:'value',config:[{key:'col',type:'column',label:{en:'Column',hi:'कॉलम'}}]},
  {id:'mode',category:'summarize',icon:_ic.mode,color:'#ddb8ff',name:{en:'Mode',hi:'बहुलक'},desc:{en:'Find the most frequent value',hi:'सबसे अधिक बार आने वाला मान खोजें'},accepts:'column',produces:'value',config:[{key:'col',type:'column',label:{en:'Column',hi:'कॉलम'}}]},
  {id:'stddev',category:'summarize',icon:_ic.stddev,color:'#ddb8ff',name:{en:'Spread (Std Dev)',hi:'फैलाव'},desc:{en:'Measure how spread out the values are',hi:'मानों का फैलाव मापें'},accepts:'column',produces:'value',config:[{key:'col',type:'column',label:{en:'Column',hi:'कॉलम'}}]},
  {id:'range',category:'summarize',icon:_ic.range,color:'#ddb8ff',name:{en:'Range',hi:'परास'},desc:{en:'Difference between the largest and smallest value',hi:'अधिकतम और न्यूनतम मान का अंतर'},accepts:'column',produces:'value',config:[{key:'col',type:'column',label:{en:'Column',hi:'कॉलम'}}]},
  // QUALITY (6)
  {id:'missing',category:'quality',icon:_ic.missing,color:'#4cd7f6',name:{en:'Missing Entries',hi:'रिक्त प्रविष्टियाँ'},desc:{en:'Find rows with empty or blank cells',hi:'खाली सेल वाली पंक्तियाँ खोजें'},accepts:'column',produces:'table',config:[{key:'col',type:'column',label:{en:'Column',hi:'कॉलम'}}]},
  {id:'duplicates',category:'quality',icon:_ic.duplicates,color:'#4cd7f6',name:{en:'Duplicates',hi:'दोहराव'},desc:{en:'Find repeated values in a column',hi:'कॉलम में दोहराई गई प्रविष्टियाँ खोजें'},accepts:'column',produces:'table',config:[{key:'col',type:'column',label:{en:'Column',hi:'कॉलम'}}]},
  {id:'unique',category:'quality',icon:_ic.unique,color:'#4cd7f6',name:{en:'Unique Values',hi:'अद्वितीय मान'},desc:{en:'Count distinct values in a column',hi:'कॉलम के अद्वितीय मान गिनें'},accepts:'column',produces:'value',config:[{key:'col',type:'column',label:{en:'Column',hi:'कॉलम'}}]},
  {id:'outliers_iqr',category:'quality',icon:_ic.outliers_iqr,color:'#4cd7f6',name:{en:'Outliers',hi:'असामान्य मान'},desc:{en:'Detect unusual values using the IQR method',hi:'IQR विधि से असामान्य मान पहचानें'},accepts:'column',produces:'table',config:[{key:'col',type:'column',label:{en:'Column',hi:'कॉलम'}}]},
  {id:'dtype_check',category:'quality',icon:_ic.dtype_check,color:'#4cd7f6',name:{en:'Type Check',hi:'प्रकार जाँच'},desc:{en:'Verify expected data types in a column',hi:'कॉलम के डेटा प्रकार जाँचें'},accepts:'column',produces:'table',config:[{key:'col',type:'column',label:{en:'Column',hi:'कॉलम'}}]},
  {id:'trim_clean',category:'quality',icon:_ic.trim_clean,color:'#4cd7f6',name:{en:'Clean Text',hi:'पाठ सफ़ाई'},desc:{en:'Remove extra spaces and fix text formatting',hi:'अतिरिक्त रिक्त स्थान हटाएँ और पाठ ठीक करें'},accepts:'column',produces:'series',config:[{key:'col',type:'column',label:{en:'Column',hi:'कॉलम'}}]},
  // TRANSFORM (5)
  {id:'filter',category:'transform',icon:_ic.filter,color:'#a78bfa',name:{en:'Filter Rows',hi:'पंक्तियाँ छाँटें'},desc:{en:'Keep only rows matching a condition',hi:'केवल शर्त से मेल खाने वाली पंक्तियाँ रखें'},accepts:'column',produces:'table',config:[{key:'col',type:'column',label:{en:'Column',hi:'कॉलम'}},{key:'op',type:'select',label:{en:'Condition',hi:'शर्त'},options:['=','≠','>','<','contains','is empty']},{key:'val',type:'text',label:{en:'Value',hi:'मान'}}]},
  {id:'sort',category:'transform',icon:_ic.sort,color:'#a78bfa',name:{en:'Sort',hi:'क्रमबद्ध करें'},desc:{en:'Sort rows by a column in ascending or descending order',hi:'कॉलम के अनुसार पंक्तियाँ क्रमबद्ध करें'},accepts:'column',produces:'table',config:[{key:'col',type:'column',label:{en:'Column',hi:'कॉलम'}},{key:'dir',type:'select',label:{en:'Direction',hi:'दिशा'},options:['Ascending / आरोही','Descending / अवरोही']}]},
  {id:'groupby',category:'transform',icon:_ic.groupby,color:'#a78bfa',name:{en:'Group & Total',hi:'समूह व योग'},desc:{en:'Group rows by a category and aggregate values',hi:'श्रेणी के अनुसार पंक्तियाँ समूह करें और मान जोड़ें'},accepts:'column',produces:'table',config:[{key:'groupCol',type:'column',label:{en:'Group By',hi:'समूह द्वारा'}},{key:'aggCol',type:'column',label:{en:'Aggregate',hi:'समग्र'}},{key:'fn',type:'select',label:{en:'Function',hi:'फ़ंक्शन'},options:['Sum','Count','Average','Min','Max']}]},
  {id:'normalize',category:'transform',icon:_ic.normalize,color:'#a78bfa',name:{en:'Normalize',hi:'सामान्यीकरण'},desc:{en:'Scale all values to a 0–1 range',hi:'सभी मानों को 0–1 पैमाने पर लाएँ'},accepts:'series',produces:'series',config:[{key:'col',type:'column',label:{en:'Column',hi:'कॉलम'}}]},
  {id:'convert_krutidev',category:'transform',icon:_ic.convert_krutidev,color:'#a78bfa',name:{en:'Krutidev ↔ Unicode',hi:'कृतिदेव बदलें'},desc:{en:'Convert Krutidev-encoded Hindi text to Unicode and back',hi:'कृतिदेव से यूनिकोड और वापस रूपांतरित करें'},accepts:'column',produces:'series',config:[{key:'col',type:'column',label:{en:'Column',hi:'कॉलम'}},{key:'dir',type:'select',label:{en:'Direction',hi:'दिशा'},options:['Krutidev → Unicode','Unicode → Krutidev']}]},
  // PREDICT (4)
  {id:'linreg_project',category:'predict',icon:_ic.linreg_project,color:'#34d399',name:{en:'Project Next',hi:'आगे का अनुमान'},desc:{en:'Forecast future values using linear regression',hi:'रैखिक रिग्रेशन से भावी मान अनुमानित करें'},accepts:'series',produces:'series',config:[{key:'col',type:'column',label:{en:'Column',hi:'कॉलम'}},{key:'k',type:'number',label:{en:'Periods ahead',hi:'आगे की अवधि'}}]},
  {id:'moving_avg',category:'predict',icon:_ic.moving_avg,color:'#34d399',name:{en:'Moving Average',hi:'चलित औसत'},desc:{en:'Smooth a series using a rolling window average',hi:'चलती खिड़की औसत से श्रृंखला सुचारु करें'},accepts:'series',produces:'series',config:[{key:'col',type:'column',label:{en:'Column',hi:'कॉलम'}},{key:'window',type:'number',label:{en:'Window size',hi:'विंडो आकार'}}]},
  {id:'growth_rate',category:'predict',icon:_ic.growth_rate,color:'#34d399',name:{en:'Growth Rate',hi:'वृद्धि दर'},desc:{en:'Calculate the compound growth rate of a series',hi:'श्रृंखला की चक्रवृद्धि दर निकालें'},accepts:'series',produces:'value',config:[{key:'col',type:'column',label:{en:'Column',hi:'कॉलम'}}]},
  {id:'trend',category:'predict',icon:_ic.trend,color:'#34d399',name:{en:'Trend',hi:'प्रवृत्ति'},desc:{en:'Detect if values are rising, falling, or flat',hi:'मान बढ़ रहे हैं, घट रहे हैं, या स्थिर हैं पहचानें'},accepts:'series',produces:'value',config:[{key:'col',type:'column',label:{en:'Column',hi:'कॉलम'}}]},
  // VISUALIZE (5)
  {id:'bar',category:'visualize',icon:_ic.bar,color:'#f472b6',name:{en:'Bar Chart',hi:'बार चार्ट'},desc:{en:'Compare values across categories',hi:'श्रेणियों में मानों की तुलना करें'},accepts:'table',produces:'chart',config:[{key:'xCol',type:'column',label:{en:'X Axis',hi:'X अक्ष'}},{key:'yCol',type:'column',label:{en:'Y Axis',hi:'Y अक्ष'}}]},
  {id:'line',category:'visualize',icon:_ic.line,color:'#f472b6',name:{en:'Line Chart',hi:'लाइन चार्ट'},desc:{en:'Show trends over time or a sequence',hi:'समय के साथ प्रवृत्ति दिखाएँ'},accepts:'table',produces:'chart',config:[{key:'xCol',type:'column',label:{en:'X Axis',hi:'X अक्ष'}},{key:'yCol',type:'column',label:{en:'Y Axis',hi:'Y अक्ष'}}]},
  {id:'pie',category:'visualize',icon:_ic.pie,color:'#f472b6',name:{en:'Pie Chart',hi:'पाई चार्ट'},desc:{en:'Show how a column breaks into proportions',hi:'कॉलम को अनुपात के रूप में दिखाएँ'},accepts:'column',produces:'chart',config:[{key:'col',type:'column',label:{en:'Column',hi:'कॉलम'}}]},
  {id:'scatter',category:'visualize',icon:_ic.scatter,color:'#f472b6',name:{en:'Scatter',hi:'स्कैटर'},desc:{en:'Plot two numeric columns against each other',hi:'दो संख्यात्मक कॉलम एक-दूसरे के विरुद्ध आलेखित करें'},accepts:'table',produces:'chart',config:[{key:'xCol',type:'column',label:{en:'X Axis',hi:'X अक्ष'}},{key:'yCol',type:'column',label:{en:'Y Axis',hi:'Y अक्ष'}}]},
  {id:'kpi',category:'visualize',icon:_ic.kpi,color:'#f472b6',name:{en:'KPI Card',hi:'केपीआई कार्ड'},desc:{en:'Display a single key metric prominently',hi:'एक प्रमुख मेट्रिक को प्रमुखता से दिखाएँ'},accepts:'value',produces:'chart',config:[{key:'label',type:'text',label:{en:'Label',hi:'लेबल'}}]},
  // REPORT (3)
  {id:'ai_report',category:'report',icon:_ic.ai_report,color:'#fb923c',name:{en:'AI Report',hi:'एआई रिपोर्ट'},desc:{en:'Generate a bilingual narrative report using AI',hi:'AI का उपयोग करके द्विभाषी रिपोर्ट बनाएँ'},accepts:'any',produces:'report',config:[]},
  {id:'excel_export',category:'report',icon:_ic.excel_export,color:'#fb923c',name:{en:'Excel Export',hi:'एक्सेल निर्यात'},desc:{en:'Export the current table to an Excel file',hi:'वर्तमान तालिका को एक्सेल फ़ाइल में निर्यात करें'},accepts:'table',produces:'report',config:[]},
  {id:'pdf_export',category:'report',icon:_ic.pdf_export,color:'#fb923c',name:{en:'PDF Export',hi:'पीडीएफ निर्यात'},desc:{en:'Export the current view as a PDF document',hi:'वर्तमान दृश्य को PDF दस्तावेज़ के रूप में निर्यात करें'},accepts:'any',produces:'report',config:[]},
  // AI (1)
  {id:'ask',category:'ai',icon:_ic.ask,color:'#fbbf24',name:{en:'Ask',hi:'पूछें'},desc:{en:'Describe what you need — AI builds the pipeline for you',hi:'बताएँ क्या चाहिए — AI आपकी पाइपलाइन बनाएगा'},accepts:'any',produces:'any',config:[]}
].forEach(function(def) {
  def.run = _makeStub(def.name);
  DD.registerModule(def);
});

