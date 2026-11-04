// =====================================================================
//  TOAST NOTIFICATIONS
// =====================================================================
function toast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(100%)'; t.style.transition = 'all .3s'; setTimeout(() => t.remove(), 300); }, 3500);
}

// =====================================================================
//  THEME TOGGLE
// =====================================================================
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('sda_theme', isDark ? 'light' : 'dark');
  updateThemeIcon();
  if (chartInstance) buildChart();
}

function updateThemeIcon() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.getElementById('themeIcon').innerHTML = isDark
    ? '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
    : '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>';
}

const UI_TEXT = {
  en: {
    import:'Import',analysis:'Analysis',filter:'Filter',format:'Format',cleanup:'Cleanup',chart:'Charts',
    hindi:'Hindi',columns:'Columns',pivot:'Pivot',dashboard:'Dashboard',validation:'Validate',
    intelligence:'Intelligence',groupby:'Group By',comparison:'Compare',formulas:'Formulas',
    settings:'Settings',profile:'Profile',
    // Toolbar / commandbar buttons
    paste:'Paste',analyze:'Analyze',functions:'Functions',pivotTable:'Pivot Table',validate:'Validate',
    smartClean:'Smart Clean',autoFormat:'Auto Format',inspector:'Inspector',printLayout:'Print Layout',
    excel:'Excel',pdf:'PDF',save:'Save',undo:'Undo',redo:'Redo',deleteRows:'Delete Rows',
    // Context menu items
    copyCell:'Copy Cell',pasteCell:'Paste',insertRowAbove:'Insert Row Above',insertRowBelow:'Insert Row Below',
    deleteRow:'Delete Row',sortAsc:'Sort Ascending',sortDesc:'Sort Descending',filterValue:'Filter This Value',
    renameCol:'Rename Column',hideCol:'Hide Column',openFilter:'Open Filter Panel',
    // Status bar
    rowCount:'rows',colCount:'columns',filterActive:'filter(s) active',noData:'No data loaded',
    // Search placeholder
    searchPlaceholder:'Search all columns...',
    // Guided formula
    guidedTitle:'Calculate without writing formulas',
    guidedSubtitle:'Choose the operation, select your data, review excluded cells, and decide where the result should go.',
    operationLabel:'What do you want to calculate?',sourceLabel:'Where is the data?',columnLabel:'Column',
    rowLabel:'Row number',rangeLabel:'Cells or ranges',delimiterLabel:'Text separator',
    destinationLabel:'Where should the result go?',targetCellLabel:'Target cell',useSelection:'Use selection',
    previewButton:'Preview',applyButton:'Apply result',previewTitle:'Explainable preview',
    previewSubtitle:'The engine shows exactly what was used and what was excluded.',
    suggestionsTitle:'Smart recommendations',
    suggestionsSubtitle:'Local rules inspect your data and suggest useful next actions. No data leaves this device.',
    // Batch 2 labels
    viewSheet:'Sheet', viewAgents:'Agents', viewReports:'Reports',
    modules:'Modules', dragToWorkspace:'Drag to Workspace',
    agentsTitle:'Agents', dragModuleHere:'Drag a module here to begin',
    modAvg:'Find the average', modChart:'Make a chart',
    modFilter:'Filter rows', modReport:'Write a report',
    viewXray:'X-Ray', viewWhatif:'What-If', viewAudit:'Audit',
    xrayFindings:'Findings', xrayTrustBanner:'Detected automatically — please verify',
    showLineage:'Show lineage'
  },
  hi: {
    import:'आयात',analysis:'विश्लेषण',filter:'फ़िल्टर',format:'फॉर्मेट',cleanup:'सफाई',chart:'चार्ट',
    hindi:'हिंदी',columns:'कॉलम',pivot:'पिवट',dashboard:'डैशबोर्ड',validation:'सत्यापन',
    intelligence:'इंटेलिजेंस',groupby:'समूह',comparison:'तुलना',formulas:'सूत्र',
    settings:'सेटिंग्स',profile:'प्रोफ़ाइल',
    // Toolbar / commandbar buttons
    paste:'चिपकाएं',analyze:'विश्लेषण',functions:'फ़ंक्शन',pivotTable:'पिवट टेबल',validate:'जांचें',
    smartClean:'स्मार्ट क्लीन',autoFormat:'स्वतः प्रारूप',inspector:'निरीक्षक',printLayout:'प्रिंट',
    excel:'एक्सेल',pdf:'पीडीएफ',save:'सहेजें',undo:'पूर्ववत',redo:'फिर करें',deleteRows:'पंक्ति हटाएं',
    // Context menu items
    copyCell:'सेल कॉपी करें',pasteCell:'चिपकाएं',insertRowAbove:'ऊपर पंक्ति जोड़ें',insertRowBelow:'नीचे पंक्ति जोड़ें',
    deleteRow:'पंक्ति हटाएं',sortAsc:'आरोही क्रम',sortDesc:'अवरोही क्रम',filterValue:'इस मान से फ़िल्टर',
    renameCol:'कॉलम नाम बदलें',hideCol:'कॉलम छिपाएं',openFilter:'फ़िल्टर पैनल खोलें',
    // Status bar
    rowCount:'पंक्तियाँ',colCount:'कॉलम',filterActive:'फ़िल्टर सक्रिय',noData:'कोई डेटा नहीं',
    // Search placeholder
    searchPlaceholder:'सभी कॉलम में खोजें...',
    // Guided formula
    guidedTitle:'बिना सूत्र लिखे गणना करें',
    guidedSubtitle:'गणना चुनें, डेटा निर्धारित करें, छोड़ी गई सेल देखें और परिणाम का स्थान तय करें।',
    operationLabel:'आप क्या गणना करना चाहते हैं?',sourceLabel:'डेटा कहाँ है?',columnLabel:'कॉलम',
    rowLabel:'पंक्ति संख्या',rangeLabel:'सेल या रेंज',delimiterLabel:'टेक्स्ट विभाजक',
    destinationLabel:'परिणाम कहाँ रखना है?',targetCellLabel:'लक्ष्य सेल',useSelection:'चयन उपयोग करें',
    previewButton:'पूर्वावलोकन',applyButton:'परिणाम लागू करें',previewTitle:'स्पष्ट पूर्वावलोकन',
    previewSubtitle:'इंजन दिखाता है कि कौन-सा डेटा उपयोग हुआ और कौन-सा छोड़ा गया।',
    suggestionsTitle:'स्मार्ट सुझाव',
    suggestionsSubtitle:'स्थानीय नियम डेटा देखकर उपयोगी अगला कदम सुझाते हैं। डेटा इस डिवाइस से बाहर नहीं जाता।',
    // Batch 2 labels (Hindi)
    viewSheet:'शीट', viewAgents:'एजेंट', viewReports:'रिपोर्ट',
    modules:'मॉड्यूल', dragToWorkspace:'वर्कस्पेस में खींचें',
    agentsTitle:'एजेंट', dragModuleHere:'शुरू करने के लिए मॉड्यूल खींचें',
    modAvg:'औसत निकालें', modChart:'चार्ट बनाएं',
    modFilter:'पंक्तियाँ फ़िल्टर करें', modReport:'रिपोर्ट लिखें',
    viewXray:'एक्स-रे', viewWhatif:'क्या-अगर', viewAudit:'ऑडिट',
    xrayFindings:'खोज', xrayTrustBanner:'स्वतः पहचाना गया — कृपया जाँचें',
    showLineage:'स्रोत देखें'
  }
};

function translatedText(key) {
  if (uiLanguage === 'bi') {
    const en = UI_TEXT.en[key] || key;
    const hi = UI_TEXT.hi[key] || '';
    return hi ? `${en} / ${hi}` : en;
  }
  return (UI_TEXT[uiLanguage] || UI_TEXT.en)[key] || UI_TEXT.en[key] || key;
}

// Short label for UI chrome (buttons, menus) — in bilingual mode shows Hindi only to keep buttons compact
function uiLabel(key) {
  const lang = uiLanguage === 'bi' ? 'hi' : uiLanguage;
  return (UI_TEXT[lang] || UI_TEXT.en)[key] || UI_TEXT.en[key] || key;
}

function setUiLanguage(lang, persist = true) {
  uiLanguage = ['en','hi','bi'].includes(lang) ? lang : 'en';
  document.documentElement.lang = uiLanguage === 'hi' ? 'hi' : 'en';
  const selector = document.getElementById('uiLanguageSelect');
  if (selector) selector.value = uiLanguage;
  if (persist) localStorage.setItem('sda_ui_language', uiLanguage);

  // Sidebar tool labels
  document.querySelectorAll('#sidebar .sb-icon[data-tool]').forEach(item => {
    const label = item.querySelector('.sb-label');
    const key = item.dataset.tool;
    if (label && UI_TEXT.en[key]) label.textContent = translatedText(key);
  });
  // Guided formula panel elements
  document.querySelectorAll('[data-guided-i18n]').forEach(el => {
    el.textContent = translatedText(el.dataset.guidedI18n);
  });
  // All toolbar / commandbar / context-menu spans
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const text = uiLabel(key);
    if (text) el.textContent = text;
  });
  // Search placeholder
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.placeholder = uiLabel('searchPlaceholder');
  // Body font: switch to Devanagari stack for Hindi/bilingual mode
  if (uiLanguage === 'hi' || uiLanguage === 'bi') {
    document.body.style.fontFamily = "'Noto Sans Devanagari','Outfit','Segoe UI',sans-serif";
  } else {
    document.body.style.fontFamily = '';
  }
  populateGuidedOptions();
  updateGuidedControls();
  previewGuidedCalculation();
  renderSmartRecommendations();
  if (typeof updateStatus === 'function') updateStatus();
  // Batch 3: re-render module drawer in new language
  if (typeof renderModuleDrawer === 'function') renderModuleDrawer();
  // Batch 4: update node labels in active language
  if (typeof _ddUpdateNodeLabels === 'function') _ddUpdateNodeLabels();
}

// =====================================================================
//  SIDEBAR
// =====================================================================
function toggleSidebar() { /* Sidebar retired in Batch 14 — no-op */ }

function ensureChartLibrary(callback) {
  const ready = () => {
    if (window.Chart) Chart.defaults.devicePixelRatio = Math.max(window.devicePixelRatio || 1, 3);
    if (callback) callback();
  };
  if (window.Chart) { ready(); return; }
  // Chart.js ships with the app (static/js) - no internet needed.
  const script = document.createElement('script');
  script.src = '/static/js/chart.min.js';
  script.onload = ready;
  script.onerror = () => toast('Charting library is missing from static/js — please reinstall Stellura.', 'error');
  document.head.appendChild(script);
}

function switchTool(tool) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('visible'));
  document.getElementById('dashboard-view').classList.remove('visible');
  if (rawData.length > 0) {
    document.getElementById('table-wrap').classList.add('visible');
  }

  if (tool === 'import') {
    if (rawData.length === 0) {
      document.getElementById('welcome').style.display = 'flex';
    } else {
      document.getElementById('fileInput').click();
    }
    return;
  }

  if (rawData.length === 0 && tool !== 'import') {
    toast('Import data first', 'error');
    return;
  }

  if (tool === 'dashboard') {
    document.getElementById('table-wrap').classList.remove('visible');
    _ddSmartDashboard();   // Batch 10: auto-profiled bento dashboard
    return;
  }

  populatePanelSelects();
  const panelId = tool + '-panel';
  const panel = document.getElementById(panelId);
  if (panel) {
    panel.classList.add('visible');
    if (tool === 'analysis') runAnalysis();
    if (tool === 'filter') loadFilterValues();
    if (tool === 'chart') {
      ensureChartLibrary(() => {
        initChartPanel();
      });
    }
    if (tool === 'format') renderCFRules();
    if (tool === 'pivot') initPivotPanel();
    if (tool === 'validation') renderValidationRules();
    if (tool === 'intelligence') {
      ensureChartLibrary(() => {
        initIntelPanel();
      });
    }
    if (tool === 'formulas') {
      initFormulasPanel();
    }
    if (tool === 'report') {
      initReportPanel();
    }
  }
}

function openPanel(name) {
  if (rawData.length === 0) { toast('Import data first', 'error'); return; }
  populatePanelSelects();
  document.getElementById(name + '-panel').classList.add('visible');
}

function closePanel(name) {
  document.getElementById(name + '-panel').classList.remove('visible');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('visible');
}

function showModal(id) {
  document.getElementById(id).classList.add('visible');
}

