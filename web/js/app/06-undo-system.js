// =====================================================================
//  UNDO SYSTEM
// =====================================================================
function captureWorkbookState() {
  return {
    headers: JSON.parse(JSON.stringify(headers)),
    rawData: JSON.parse(JSON.stringify(rawData)),
    colTypes: [...colTypes],
    cfRules: JSON.parse(JSON.stringify(cfRules)),
    activeFilters: JSON.parse(JSON.stringify(activeFilters)),
    validationRules: JSON.parse(JSON.stringify(validationRules)),
    cellFonts: JSON.parse(JSON.stringify(cellFonts)),
    cellBold: JSON.parse(JSON.stringify(cellBold)),
    cellItalic: JSON.parse(JSON.stringify(cellItalic)),
    cellUnderline: JSON.parse(JSON.stringify(cellUnderline)),
    cellFontSize: JSON.parse(JSON.stringify(cellFontSize)),
    cellFontColor: JSON.parse(JSON.stringify(cellFontColor)),
    cellBgColor: JSON.parse(JSON.stringify(cellBgColor)),
    cellAlignments: JSON.parse(JSON.stringify(cellAlignments)),
    cellWraps: JSON.parse(JSON.stringify(cellWraps)),
    cellNumFormats: JSON.parse(JSON.stringify(cellNumFormats)),
    cellComments: JSON.parse(JSON.stringify(cellComments)),
    mergedCells: JSON.parse(JSON.stringify(mergedCells)),
    cellFormulaMeta: JSON.parse(JSON.stringify(cellFormulaMeta))
  };
}

function restoreWorkbookState(state) {
  headers = state.headers || [];
  rawData = state.rawData || [];
  colTypes = state.colTypes || [];
  cfRules = state.cfRules || [];
  activeFilters = state.activeFilters || [];
  validationRules = state.validationRules || [];
  cellFonts = state.cellFonts || {};
  cellBold = state.cellBold || {};
  cellItalic = state.cellItalic || {};
  cellUnderline = state.cellUnderline || {};
  cellFontSize = state.cellFontSize || {};
  cellFontColor = state.cellFontColor || {};
  cellBgColor = state.cellBgColor || {};
  cellAlignments = state.cellAlignments || {};
  cellWraps = state.cellWraps || {};
  cellNumFormats = state.cellNumFormats || {};
  cellComments = state.cellComments || {};
  mergedCells = state.mergedCells || [];
  cellFormulaMeta = state.cellFormulaMeta || {};
  filteredData = null;
  selectedRows.clear();
  populatePanelSelects();
  showTable();
  autoSave();
}

function pushUndo() {
  if (undoStack.length >= MAX_UNDO) undoStack.shift();
  undoStack.push(captureWorkbookState());
  redoStack = [];
}

function undoAction() {
  if (undoStack.length === 0) { toast('Nothing to undo', 'info'); return; }
  if (redoStack.length >= MAX_UNDO) redoStack.shift();
  redoStack.push(captureWorkbookState());
  const state = undoStack.pop();
  restoreWorkbookState(state);
  toast('Undo successful', 'success');
}

function redoAction() {
  if (redoStack.length === 0) { toast('Nothing to redo', 'info'); return; }
  if (undoStack.length >= MAX_UNDO) undoStack.shift();
  undoStack.push(captureWorkbookState());
  const state = redoStack.pop();
  restoreWorkbookState(state);
  toast('Redo successful', 'success');
}

// =====================================================================
//  SAVE / LOAD STATE
// =====================================================================
function saveState() {
  try {
    const state = {
      headers, rawData, colTypes, cfRules, activeFilters, validationRules, cellFonts, cellFormulaMeta,
      documentName: document.getElementById('documentName')?.textContent || 'Untitled Analysis',
      ddView:  (window.DD && DD.workspace) ? DD.workspace.view  : 'sheet',
      ddNodes: (window.DD && DD.workspace) ? DD.workspace.nodes : [],
      ddProvenance: (window.DD && DD.provenance) ? DD.provenance : []
    };
    localStorage.setItem('sda_state_v2', JSON.stringify(state));
    const saveText = document.getElementById('saveStateText');
    if (saveText) saveText.textContent = 'Saved just now';
    toast('State saved to browser storage', 'success');
  } catch(e) {
    toast('Error saving: ' + e.message, 'error');
  }
}

function loadState() {
  try {
    const saved = localStorage.getItem('sda_state_v2');
    if (!saved) { toast('No saved state found', 'info'); return; }
    const s = JSON.parse(saved);
    headers = s.headers;
    rawData = s.rawData;
    colTypes = s.colTypes || [];
    cfRules = s.cfRules || [];
    activeFilters = s.activeFilters || [];
    validationRules = s.validationRules || [];
    cellFonts = s.cellFonts || {};
    cellFormulaMeta = s.cellFormulaMeta || {};
    if (s.documentName) document.getElementById('documentName').textContent = s.documentName;
    filteredData = null;
    showTable();
    toast('State loaded successfully', 'success');
  } catch(e) {
    toast('Error loading: ' + e.message, 'error');
  }
}

// =====================================================================
//  DATA IMPORT
// =====================================================================
function handleDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function handleDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
}
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) processFile(file);
  e.target.value = '';
}

function processFile(file) {
  const documentName = document.getElementById('documentName');
  if (documentName) documentName.textContent = file.name.replace(/\.[^.]+$/, '');
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'xlsx') {
    importXlsxViaServer(file);
  } else if (ext === 'xls') {
    readWorkbookInBrowser(file);
  } else {
    // UTF-8 (with or without a BOM), UTF-16 (Excel "Unicode text") or, when the bytes are not valid UTF-8, the Windows-1252 of older Excel files:
    // reading everything as UTF-8 turned é, ñ, ’ into ��� (the Spotify file)
    const reader = new FileReader();
    reader.onload = (e) => parseCSVTSV(decodeTextFile(e.target.result));
    reader.readAsArrayBuffer(file);
  }
}
function decodeTextFile(buf) {
  const u = new Uint8Array(buf);
  try {
    if (u[0] === 0xFF && u[1] === 0xFE) return new TextDecoder('utf-16le').decode(u.subarray(2));
    if (u[0] === 0xFE && u[1] === 0xFF) return new TextDecoder('utf-16be').decode(u.subarray(2));
    return new TextDecoder('utf-8', { fatal: true }).decode(u).replace(/^\uFEFF/, '');
  } catch (e) {
    // a file that already holds the replacement character (EF BF BD) was UTF-8 once and has been damaged on the way: keep it as UTF-8;
    // otherwise it is an older Windows file
    let damaged = false; for (let i = 0; i + 2 < u.length; i++) { if (u[i] === 0xEF && u[i + 1] === 0xBF && u[i + 2] === 0xBD) { damaged = true; break; } }
    try { return new TextDecoder(damaged ? 'utf-8' : 'windows-1252').decode(u).replace(/^\uFEFF/, ''); } catch (e2) { return new TextDecoder('utf-8').decode(u); }
  }
}

// Browser-side reader (used for legacy .xls, and if the local server is unreachable)
function readWorkbookInBrowser(file) {
  if (!window.XLSX) { toast('Excel reader is missing from static/js — please reinstall Stellura.', 'error'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      if (wb.SheetNames.length > 1) {
        showSheetSelector(wb);
      } else {
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        importData(json);
      }
    } catch(err) { toast('Error reading Excel: ' + err.message, 'error'); }
  };
  reader.readAsArrayBuffer(file);
}

// .xlsx files are parsed by the local Python server (openpyxl): safer and faster than
// parsing untrusted workbooks inside the page.
let pendingServerFile = null;

function _importServerResult(res) {
  const rows = (res.data || []).map(r => r.map(c => (c == null ? '' : c)));
  importData([res.headers || []].concat(rows));
}

function importXlsxViaServer(file, sheetName) {
  const fd = new FormData();
  fd.append('file', file);
  if (sheetName) fd.append('sheet', sheetName);
  fetch('/api/upload', { method: 'POST', body: fd })
    .then(r => r.json().then(j => ({ ok: r.ok, j })))
    .then(({ ok, j }) => {
      if (!ok) throw new Error(j.message || j.error || 'Upload failed');
      if (!sheetName && (j.sheets || []).length > 1) showServerSheetSelector(file, j);
      else _importServerResult(j);
    })
    .catch(err => {
      if (window.XLSX) readWorkbookInBrowser(file);
      else toast('Error reading Excel: ' + err.message, 'error');
    });
}

function showServerSheetSelector(file, res) {
  pendingServerFile = file;
  pendingWorkbook = null;
  pendingSheets = res.sheets;
  selectedSheetIdx = 0;
  const info = res.sheetInfo || [];
  let html = '';
  res.sheets.forEach((name, i) => {
    const meta = info[i] || {};
    html += `<div class="sheet-item ${i===0?'selected':''}" onclick="selectSheet(${i})" data-idx="${i}">
      <div>
        <div class="sheet-name">📄 ${escHtml(name)}</div>
        <div class="sheet-info">${meta.rows || 0} rows × ${meta.cols || 0} columns</div>
      </div>
    </div>`;
  });
  document.getElementById('sheetList').innerHTML = html;
  showModal('sheetModal');
}

// Multi-sheet Excel import
function showSheetSelector(wb) {
  pendingWorkbook = wb;
  pendingSheets = wb.SheetNames;
  selectedSheetIdx = 0;

  const listEl = document.getElementById('sheetList');
  let html = '';
  wb.SheetNames.forEach((name, i) => {
    const ws = wb.Sheets[name];
    const preview = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const rowCount = Math.max(0, preview.length - 1);
    const colCount = preview.length > 0 ? preview[0].length : 0;
    html += `<div class="sheet-item ${i===0?'selected':''}" onclick="selectSheet(${i})" data-idx="${i}">
      <div>
        <div class="sheet-name">📄 ${escHtml(name)}</div>
        <div class="sheet-info">${rowCount} rows × ${colCount} columns</div>
      </div>
    </div>`;
  });
  listEl.innerHTML = html;
  showModal('sheetModal');
}

function selectSheet(idx) {
  selectedSheetIdx = idx;
  document.querySelectorAll('.sheet-item').forEach((el, i) => {
    el.classList.toggle('selected', i === idx);
  });
}

function importSelectedSheet() {
  if (pendingServerFile) {
    const file = pendingServerFile;
    const name = pendingSheets[selectedSheetIdx];
    pendingServerFile = null;
    closeModal('sheetModal');
    importXlsxViaServer(file, name);
    return;
  }
  if (!pendingWorkbook) return;
  const ws = pendingWorkbook.Sheets[pendingSheets[selectedSheetIdx]];
  const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  importData(json);
  closeModal('sheetModal');
  pendingWorkbook = null;
}

// Paste from clipboard with HTML table support
async function pasteFromClipboard() {
  try {
    if (navigator.clipboard && navigator.clipboard.read) {
      try {
        const clipItems = await navigator.clipboard.read();
        for (const item of clipItems) {
          if (item.types.includes('text/html')) {
            const blob = await item.getType('text/html');
            const html = await blob.text();
            const parsed = parseHTMLTable(html);
            if (parsed && parsed.length > 1) {
              importData(parsed);
              return;
            }
          }
        }
      } catch(e) { /* fall through to text */ }
    }
    const text = await navigator.clipboard.readText();
    if (text && text.trim()) {
      parseCSVTSV(text);
    } else {
      toast('Clipboard is empty', 'error');
    }
  } catch(e) {
    toast('Cannot access clipboard. Use the paste area or Ctrl+V.', 'error');
  }
}

function parseHTMLTable(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return null;
  const rows = [];
  table.querySelectorAll('tr').forEach(tr => {
    const row = [];
    tr.querySelectorAll('td,th').forEach(cell => row.push(cell.textContent.trim()));
    if (row.length > 0) rows.push(row);
  });
  return rows.length > 1 ? rows : null;
}

function handlePasteArea(event) {
  setTimeout(() => {
    const html = event.clipboardData && event.clipboardData.getData('text/html');
    if (html) {
      const parsed = parseHTMLTable(html);
      if (parsed && parsed.length > 1) {
        importData(parsed);
        return;
      }
    }
  }, 100);
}

function importPastedText() {
  const textarea = document.getElementById('pasteTextarea');
  const text = textarea.value.trim();
  if (!text) { toast('Please paste data first', 'error'); return; }
  parseCSVTSV(text);
}

function setupGlobalPaste() {
  document.addEventListener('paste', (e) => {
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
    if (rawData.length > 0) return;
    const html = e.clipboardData.getData('text/html');
    if (html) {
      const parsed = parseHTMLTable(html);
      if (parsed && parsed.length > 1) {
        e.preventDefault();
        importData(parsed);
        return;
      }
    }
    const text = e.clipboardData.getData('text/plain');
    if (text && text.trim()) {
      e.preventDefault();
      parseCSVTSV(text);
    }
  });
}

function parseCSVTSV(text) {
  let sep = ',';
  const firstLine = text.replace(/^\uFEFF/, '').split(/\r?\n/)[0];
  const tabs = (firstLine.match(/\t/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  const semis = (firstLine.match(/;/g) || []).length;
  if (tabs > commas && tabs > semis) sep = '\t';
  else if (semis > commas) sep = ';';

  const data = STL.parseCsv(text, sep);          // one stream: quoted cells may contain line breaks
  importData(data);
}

function importData(data) {
  if (!Array.isArray(data) || data.length < 2 || !Array.isArray(data[0])) { 
    toast('Invalid or empty data format. Need at least header + 1 row.', 'error'); 
    return; 
  }
  pushUndo();
  headers = data[0].map((h, i) => (h != null && String(h).trim() !== '') ? String(h).trim() : ('Column ' + (i + 1)));
  rawData = data.slice(1).filter(r => Array.isArray(r) && r.some(c => c !== '' && c != null));
  const maxCols = headers.length;
  rawData = rawData.map(r => {
    const nr = Array.isArray(r) ? r.slice(0, maxCols) : [];
    while (nr.length < maxCols) nr.push('');
    return nr.map(c => c != null ? String(c) : '');
  });
  detectTypes();
  filteredData = null;
  activeFilters = [];
  sortCol = -1;
  selectedRows.clear();
  selectionStart = { ri: null, ci: null };
  selectionEnd = { ri: null, ci: null };
  activeCell = { ri: null, ci: null };
  additionalSelections = [];
  selectionMode = 'cell';
  cellFormulaMeta = {};
  colWidths = {};
  if (typeof hiddenCols !== 'undefined') hiddenCols.clear();
  populatePanelSelects();
  showTable();
  updateFormulaBarVisibility();
  updateLiveInspector();
  autoSave();
  
  if (rawData.length > 10000) {
    toast(`Large dataset mode active (${rawData.length.toLocaleString()} rows). Rendering optimized for speed.`, 'info');
  } else {
    toast(`Imported ${rawData.length} rows × ${headers.length} columns`, 'success');
  }
  checkHindiEncodingInData();
  try {
    const damaged = STL.countDamaged(rawData);
    if (damaged) toast((uiLanguage === 'hi' ? damaged.toLocaleString('en-IN') + ' खानों में क्षतिग्रस्त अक्षर (�) हैं — किसी पुराने सेव में बिगड़े। मूल अक्षर लौटाए नहीं जा सकते; स्रोत से नई फ़ाइल मँगाएँ।' : damaged.toLocaleString('en-IN') + ' cells contain damaged letters (�) from an earlier save. The original letters cannot be recovered — ask for a fresh export from the source.'), 'warning');
  } catch (e) {}
}

function detectTypes() {
  colTypes = headers.map((_, ci) => {
    let numCount = 0, dateCount = 0, total = 0;
    const sampleSize = Math.min(rawData.length, 400);
    for (let ri = 0; ri < sampleSize; ri++) {
      const v = String(rawData[ri][ci] == null ? '' : rawData[ri][ci]).trim();
      if (v === '') continue;
      total++;
      const _nf = ((window.STL && STL.charts && STL.charts.num) ? STL.charts.num : (v => { const n = parseFloat(String(v).replace(/,/g, '')); return isNaN(n) ? null : n; })); if (!isNaN(Number(v)) || _nf(v) !== null) numCount++;
      else if (!isNaN(Date.parse(v)) && v.length > 4) dateCount++;
    }
    if (total === 0) return 'text';
    if (numCount / total > 0.7) return 'number';
    if (dateCount / total > 0.7) return 'date';
    return 'text';
  });
}

function loadSampleData() {
  const documentName = document.getElementById('documentName');
  if (documentName) documentName.textContent = 'Workforce Analytics Sample';
  const sampleHeaders = ['Name', 'Department', 'City', 'Salary', 'Experience', 'Rating', 'Status'];
  const depts = ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations'];
  const cities = ['Jaipur', 'Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Pune', 'Lucknow', 'Ahmedabad'];
  const statuses = ['Active', 'Inactive', 'On Leave'];
  const names = ['Rahul Sharma','Priya Singh','Amit Kumar','Neha Gupta','Rajesh Verma','Sunita Devi','Vikash Patel','Rina Joshi',
    'Suresh Yadav','Meena Kumari','Arun Tiwari','Kavita Rao','Deepak Chauhan','Pooja Mishra','Sanjay Dubey',
    'Anjali Bhatt','Manoj Soni','Rita Agarwal','Vinod Saxena','Geeta Rathore'];

  const data = [sampleHeaders];
  for (let i = 0; i < 200; i++) {
    data.push([
      names[i % names.length] + (i >= names.length ? ' ' + (Math.floor(i/names.length)+1) : ''),
      depts[Math.floor(Math.random() * depts.length)],
      cities[Math.floor(Math.random() * cities.length)],
      String(Math.floor(25000 + Math.random() * 75000)),
      String(Math.floor(1 + Math.random() * 20)),
      (2 + Math.random() * 3).toFixed(1),
      statuses[Math.floor(Math.random() * statuses.length)]
    ]);
  }
  importData(data);
}

// ── Batch 22: Large inline sample datasets (offline, no Flask) ──

function loadSampleEnglish() {
  var names = ['Rajesh Kumar','Priya Sharma','Amit Singh','Sunita Devi','Vikram Yadav',
    'Meena Gupta','Suresh Patel','Kavita Joshi','Narendra Tiwari','Pooja Verma',
    'Ramesh Chauhan','Asha Mehta','Deepak Mishra','Geeta Agarwal','Vinod Saxena',
    'Anita Rathore','Mahesh Soni','Rita Dubey','Sanjay Bhatt','Anjali Singh',
    'Dinesh Rao','Parvati Kumari','Ajay Sharma','Usha Choudhary','Rajendra Gupta',
    'Shobha Mishra','Harish Verma','Manorama Devi','Laxmi Joshi','Bhupesh Tiwari'];
  var ranks   = ['Constable','Constable','Constable','Head Constable','Head Constable','ASI','SI','Inspector','Deputy SP'];
  var salBase = [26000,27500,28000,33000,35000,42000,52000,65000,80000];
  var dists   = ['Jaipur','Jodhpur','Udaipur','Ajmer','Kota','Bharatpur','Sikar','Alwar'];
  var stns    = ['Kotwali','Sindhi Camp','Malviya Nagar','Mansarovar','Sanganer','Vidyadhar Nagar',
    'Civil Lines','Bani Park','Shastri Nagar','Pratap Nagar','Barmer Road','Jodhpur City',
    'Udaipur City','Ajmer City','Kota City','Bharatpur City','Sikar City','Alwar City',
    'Lal Kothi','Vaishali Nagar'];
  var qtrs    = ['Q1-2024','Q2-2024','Q3-2024','Q4-2024','Q5-2024'];
  var stats   = ['Active','Active','Active','Active','On Leave','Active','Active','Retired','Suspended'];

  var headers = ['Sr_No','Officer_Name','Rank','District','Station','Cases_Filed','Cases_Solved',
    'Salary','Experience_Yrs','Rating','Status','Quarter'];
  var data = [headers];
  for (var i = 0; i < 250; i++) {
    var ri   = i % ranks.length;
    var sal  = salBase[ri] + (i % 7) * 500;
    if (i === 42) sal = 195000;                        // outlier row
    var qIdx = Math.floor(i / 50);
    var cf   = 5 + (i % 5) * 8 + Math.floor(i * 0.3) + qIdx * 4;
    var cs   = Math.min(Math.floor(cf * (0.5 + (i % 10) * 0.05)) + Math.floor(qIdx * 3), cf);
    var rating = (i % 31 === 17) ? null : parseFloat((3.0 + (i % 20) * 0.1).toFixed(1));
    data.push([i + 1, names[i % names.length], ranks[ri], dists[i % dists.length],
      stns[i % stns.length], cf, cs, sal, 1 + (i % 35), rating, stats[i % stats.length], qtrs[qIdx]]);
  }
  importData(data);
  var dn = document.getElementById('documentName');
  if (dn) dn.textContent = 'Police District Register 2024-25';
  if (typeof showOnboardingTip === 'function') showOnboardingTip('loaded');
}

function loadSampleHindi() {
  var names = ['राजेश कुमार','प्रिया शर्मा','अमित सिंह','सुनीता देवी','विक्रम यादव',
    'मीना गुप्ता','सुरेश पटेल','कविता जोशी','नरेंद्र तिवारी','पूजा वर्मा',
    'रमेश चौहान','आशा मेहता','दीपक मिश्रा','गीता अग्रवाल','विनोद सक्सेना',
    'अनीता राठौर','महेश सोनी','रीता दुबे','संजय भट्ट','अंजलि सिंह',
    'दिनेश राव','पार्वती कुमारी','अजय शर्मा','उषा चौधरी','राजेंद्र गुप्ता',
    'शोभा मिश्रा','हरिश वर्मा','मनोरमा देवी','लक्ष्मी जोशी','भूपेश तिवारी'];
  var pads    = ['सिपाही','सिपाही','सिपाही','हेड कांस्टेबल','हेड कांस्टेबल','एएसआई','एसआई','निरीक्षक','उप अधीक्षक'];
  var salBase = [26000,27500,28000,33000,35000,42000,52000,65000,80000];
  var dists   = ['जयपुर','जोधपुर','उदयपुर','अजमेर','कोटा','भरतपुर','सीकर','अलवर'];
  var stns    = ['कोतवाली','सिंधी कैंप','मालवीय नगर','मानसरोवर','सांगानेर','विद्याधर नगर',
    'सिविल लाइन्स','बनी पार्क','शास्त्री नगर','प्रताप नगर','बाड़मेर रोड','जोधपुर सिटी',
    'उदयपुर सिटी','अजमेर सिटी','कोटा सिटी','भरतपुर सिटी','सीकर सिटी','अलवर सिटी',
    'लाल कोठी','वैशाली नगर'];
  var qtrs    = ['Q1-2024','Q2-2024','Q3-2024','Q4-2024','Q5-2024'];
  var stats   = ['सक्रिय','सक्रिय','सक्रिय','सक्रिय','अवकाश पर','सक्रिय','सक्रिय','सेवानिवृत्त','निलंबित'];

  var headers = ['क्र_सं','नाम','पद','जिला','थाना','प्रकरण_दर्ज','हल_प्रकरण',
    'वेतन','अनुभव_वर्ष','मूल्यांकन','स्थिति','तिमाही'];
  var data = [headers];
  for (var i = 0; i < 250; i++) {
    var ri   = i % pads.length;
    var sal  = salBase[ri] + (i % 7) * 500;
    if (i === 42) sal = 195000;
    var qIdx = Math.floor(i / 50);
    var cf   = 5 + (i % 5) * 8 + Math.floor(i * 0.3) + qIdx * 4;
    var cs   = Math.min(Math.floor(cf * (0.5 + (i % 10) * 0.05)) + Math.floor(qIdx * 3), cf);
    var rating = (i % 31 === 17) ? null : parseFloat((3.0 + (i % 20) * 0.1).toFixed(1));
    data.push([i + 1, names[i % names.length], pads[ri], dists[i % dists.length],
      stns[i % stns.length], cf, cs, sal, 1 + (i % 35), rating, stats[i % stats.length], qtrs[qIdx]]);
  }
  importData(data);
  var dn = document.getElementById('documentName');
  if (dn) dn.textContent = 'पुलिस विभाग कर्मचारी पंजी 2024-25';
  if (typeof showOnboardingTip === 'function') showOnboardingTip('loaded');
}

// ── Patch 7: Government Sample Datasets ──
async function loadSampleDataset(name) {
  try {
    showToast('Loading sample data… / नमूना डेटा लोड हो रहा है…', 'info');
    const res = await fetch('/api/sample-data/' + name);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const { headers, data, title } = await res.json();
    importData([headers, ...data]);
    const dn = document.getElementById('documentName');
    if (dn) dn.textContent = title;
    showToast('Loaded: ' + title, 'success');
    showOnboardingTip('loaded');
  } catch (e) {
    showToast('Could not load sample data. Is Flask running? / Flask चल रहा है?', 'error');
  }
}

let _onboardingShownThisSession = false;
const _onboardingTips = {
  loaded: [
    '📊 Click any column header to sort • कॉलम हेडर पर क्लिक करके सॉर्ट करें',
    '🔍 Use the Search box (top-right) to filter rows • पंक्तियाँ खोजने के लिए सर्च बॉक्स उपयोग करें',
    '🧠 Open the Intelligence panel to ask AI questions • AI से प्रश्न पूछने के लिए Intelligence पैनल खोलें'
  ]
};

function showOnboardingTip(tipKey) {
  if (_onboardingShownThisSession) return;
  _onboardingShownThisSession = true;
  const tips = (_onboardingTips[tipKey] || []);
  if (!tips.length) return;
  const old = document.getElementById('onboarding-tip');
  if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'onboarding-tip';
  div.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
      '<span style="font-size:12px;font-weight:700;color:var(--accent)">&#128640; Getting Started / शुरुआत करें</span>' +
      '<button onclick="document.getElementById(\'onboarding-tip\').remove()" style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--text-muted);line-height:1;padding:0">&times;</button>' +
    '</div>' +
    '<ol style="margin:0;padding-left:18px">' +
      tips.map(function(t){ return '<li style="font-size:11.5px;color:var(--text-primary);margin-bottom:5px;line-height:1.45">' + t + '</li>'; }).join('') +
    '</ol>' +
    '<div style="margin-top:9px;height:3px;background:var(--border);border-radius:2px;overflow:hidden">' +
      '<div id="onboarding-progress" style="height:100%;background:var(--accent);width:100%;border-radius:2px;transition:width 12s linear"></div>' +
    '</div>';
  document.body.appendChild(div);
  requestAnimationFrame(function() {
    var bar = document.getElementById('onboarding-progress');
    if (bar) bar.style.width = '0%';
  });
  setTimeout(function() {
    var el = document.getElementById('onboarding-tip');
    if (el) el.remove();
  }, 12000);
}


