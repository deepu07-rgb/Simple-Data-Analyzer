// =====================================================================
//  UTILITY FUNCTIONS
// =====================================================================
function escHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatNum(n) {
  if (n == null || isNaN(n)) return '0';
  if (Number.isInteger(n)) return n.toLocaleString();
  return parseFloat(n.toFixed(2)).toLocaleString();
}

function updateStatus() {
  const total = rawData.length;
  const displayed = getDisplayData().length;
  document.getElementById('statusRows').textContent = `${displayed}${displayed !== total ? '/' + total : ''} ${uiLabel('rowCount')}`;
  document.getElementById('statusCols').textContent = `${headers.length} ${uiLabel('colCount')}`;
  document.getElementById('statusFilter').textContent = activeFilters.length > 0 ? `${activeFilters.length} ${uiLabel('filterActive')}` : '';
  document.getElementById('statusFormat').textContent = cfRules.length > 0 ? `${cfRules.length} format rule(s)` : '';
}

function autoSave() {
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
    if (saveText) saveText.textContent = 'Auto-saved';
  } catch(e) {
    // Browser storage is full (about 5 MB). Say so instead of pretending the work is saved.
    const saveText = document.getElementById('saveStateText');
    if (saveText) saveText.textContent = (typeof uiLanguage !== 'undefined' && uiLanguage === 'hi')
      ? 'ऑटो-सेव नहीं हुआ (डेटा बड़ा है) — प्रोजेक्ट सहेजें'
      : 'Not auto-saved (data too big) — Save project';
  }
}

// =====================================================================
//  QUICK FILTER (from header click)
// =====================================================================
function quickFilter(ci) {
  populatePanelSelects();
  document.getElementById('filterCol').value = ci;
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('visible'));
  document.getElementById('filter-panel').classList.add('visible');
  loadFilterValues();
}

// =====================================================================
//  NEW BATCH FUNCTIONS (Batches 3 to 8)
// =====================================================================

// Settings & Appearance
let showRowNums = true;
let autoSaveTimer = null;

function toggleZebra(el) {
  const on = el.classList.toggle('on');
  if (on) {
    document.body.classList.add('zebra');
  } else {
    document.body.classList.remove('zebra');
  }
  autoSave();
  renderTable();
}

function toggleRowNumbers(el) {
  showRowNums = el.classList.toggle('on');
  showTable();
}

function setAutoSaveInterval(ms) {
  if (autoSaveTimer) clearInterval(autoSaveTimer);
  const val = parseInt(ms);
  if (val > 0) {
    autoSaveTimer = setInterval(autoSave, val);
  }
}

// User Profile
function updateProfile() {
  userProfile.name = document.getElementById('profileName').value;
  userProfile.desig = document.getElementById('profileDesig').value;
  userProfile.org = document.getElementById('profileOrg').value;
  userProfile.dateFmt = document.getElementById('profileDateFmt').value;
  
  const initialsEl = document.getElementById('profileInitials');
  if (initialsEl) {
    if (userProfile.name) {
      const parts = userProfile.name.split(' ');
      const init = parts.map(p => p[0]).join('').substring(0, 2).toUpperCase();
      initialsEl.textContent = init;
      initialsEl.style.display = 'flex';
    } else {
      initialsEl.style.display = 'none';
    }
  }
}

function saveProfile() {
  updateProfile();
  userProfile.include = document.getElementById('profileExportToggle').classList.contains('on');
  userProfile.autofill = document.getElementById('profileDateToggle').classList.contains('on');
  autoSave();
  toast('Profile saved successfully', 'success');
}

// Recycle Bin
function showRecycleBin() {
  let modal = document.getElementById('recycleBinModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'recycleBinModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <h3>♻ Recycle Bin</h3>
        <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">Restore recently cleared datasets (max 3 kept):</p>
        <div id="recycleBinList" style="max-height: 200px; overflow-y: auto; margin-bottom: 12px"></div>
        <div class="modal-actions">
          <button class="tb-btn" onclick="closeModal('recycleBinModal')">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const listEl = document.getElementById('recycleBinList');
  listEl.innerHTML = '';
  if (recycleBin.length === 0) {
    listEl.innerHTML = '<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:12px">Recycle Bin is empty</div>';
  } else {
    recycleBin.forEach((item, idx) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid var(--border);font-size:12px';
      row.innerHTML = `
        <div style="flex:1">
          <strong>${escHtml(item.name || 'Dataset')}</strong><br>
          <span style="font-size:10px;color:var(--text-muted)">${item.rows} rows × ${item.cols} cols (${item.timestamp})</span>
        </div>
        <button class="tb-btn primary" onclick="restoreRecycleBin(${idx})" style="padding:2px 8px;font-size:11px">Restore</button>
      `;
      listEl.appendChild(row);
    });
  }
  showModal('recycleBinModal');
}

function restoreRecycleBin(idx) {
  const item = recycleBin[idx];
  if (!item) return;
  pushUndo();
  headers = item.headers;
  rawData = item.rawData;
  colTypes = item.colTypes || [];
  cellFonts = item.cellFonts || {};
  cellBold = item.cellBold || {};
  cellItalic = item.cellItalic || {};
  cellUnderline = item.cellUnderline || {};
  cellFontSize = item.cellFontSize || {};
  cellFontColor = item.cellFontColor || {};
  cellBgColor = item.cellBgColor || {};
  cellAlignments = item.cellAlignments || {};
  cellWraps = item.cellWraps || {};
  cellNumFormats = item.cellNumFormats || {};
  cellComments = item.cellComments || {};
  mergedCells = item.mergedCells || [];
  cellFormulaMeta = item.cellFormulaMeta || {};
  
  recycleBin.splice(idx, 1);
  closeModal('recycleBinModal');
  showTable();
  autoSave();
  toast('Dataset restored from Recycle Bin', 'success');
}

function addToRecycleBin(name) {
  if (rawData.length === 0) return;
  if (recycleBin.length >= 3) recycleBin.shift();
  recycleBin.push({
    name: name || 'Dataset',
    timestamp: new Date().toLocaleTimeString(),
    rows: rawData.length,
    cols: headers.length,
    headers: JSON.parse(JSON.stringify(headers)),
    rawData: JSON.parse(JSON.stringify(rawData)),
    colTypes: [...colTypes],
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
  });
}

function clearAllData() {
  if (rawData.length === 0) return;
  if (confirm('Are you sure you want to clear all data? You can restore it from the Recycle Bin.')) {
    addToRecycleBin('Cleared Sheet');
    pushUndo();
    headers = [];
    rawData = [];
    colTypes = [];
    cellFonts = {};
    cellBold = {};
    cellItalic = {};
    cellUnderline = {};
    cellFontSize = {};
    cellFontColor = {};
    cellBgColor = {};
    cellAlignments = {};
    cellWraps = {};
    cellNumFormats = {};
    cellComments = {};
    mergedCells = [];
    cellFormulaMeta = {};
    filteredData = null;
    showTable();
    autoSave();
    toast('Data cleared. Restorable from Recycle Bin.', 'warning');
  }
}

// Cell Comments / Notes
function ctxAddComment() {
  if (ctxRowIdx >= 0 && ctxColIdx >= 0) {
    const key = `${ctxRowIdx}:${ctxColIdx}`;
    const prevComment = cellComments[key] || '';
    const comment = prompt('Enter note for cell ' + getCellRef(ctxRowIdx, ctxColIdx) + ':', prevComment);
    if (comment !== null) {
      pushUndo();
      if (comment.trim() === '') {
        delete cellComments[key];
      } else {
        cellComments[key] = comment.trim();
      }
      autoSave();
      renderTable();
      toast('Note saved', 'success');
    }
  }
}

function ctxDeleteComment() {
  if (ctxRowIdx >= 0 && ctxColIdx >= 0) {
    const key = `${ctxRowIdx}:${ctxColIdx}`;
    if (cellComments[key]) {
      pushUndo();
      delete cellComments[key];
      autoSave();
      renderTable();
      toast('Note deleted', 'success');
    }
  }
}

// Go To Cell
function goToCell() {
  const cellRef = prompt('Go To Cell (e.g. A25, D500):');
  if (!cellRef) return;
  const match = cellRef.match(/^([A-Za-z]+)(\d+)$/);
  if (!match) {
    toast('Invalid cell reference format. Use e.g. A25', 'error');
    return;
  }
  const colName = match[1].toUpperCase();
  const rowNum = parseInt(match[2]);

  let ci = 0;
  for (let i = 0; i < colName.length; i++) {
    ci = ci * 26 + (colName.charCodeAt(i) - 64);
  }
  ci -= 1;

  const ri = rowNum - 1;

  if (ri < 0 || ri >= rawData.length || ci < 0 || ci >= headers.length) {
    toast('Cell out of bounds', 'error');
    return;
  }

  selectionStart = { ri, ci };
  selectionEnd = { ri, ci };
  activeCell = { ri, ci };
  additionalSelections = [];
  selectionMode = 'cell';
  resultFocusKey = null;
  renderSelection();

  const container = document.getElementById('virtual-table-container');
  if (container) {
    const targetScroll = ri * ROW_HEIGHT - (container.clientHeight / 2);
    container.scrollTop = Math.max(0, targetScroll);
  }
  toast(`Selected cell ${cellRef}`, 'success');
}

// Transpose
function transposeData() {
  if (rawData.length === 0) return;
  if (!confirm('Are you sure you want to transpose the worksheet? Rows will become columns and columns will become rows.')) return;
  pushUndo();

  const newHeaders = ['Column'].concat(rawData.map((_, i) => `Row ${i + 1}`));
  const newRawData = [];

  for (let ci = 0; ci < headers.length; ci++) {
    const newRow = [headers[ci]];
    for (let ri = 0; ri < rawData.length; ri++) {
      newRow.push(rawData[ri][ci]);
    }
    newRawData.push(newRow);
  }

  headers = newHeaders;
  rawData = newRawData;
  colTypes = new Array(headers.length).fill('text');
  
  cellFonts = {};
  cellBold = {};
  cellItalic = {};
  cellUnderline = {};
  cellFontSize = {};
  cellFontColor = {};
  cellBgColor = {};
  cellAlignments = {};
  cellWraps = {};
  cellNumFormats = {};
  cellComments = {};
  mergedCells = [];
  cellFormulaMeta = {};
  filteredData = null;

  showTable();
  autoSave();
  toast('Data transposed successfully', 'success');
}

// Math Engine & Intelligence
const MathEngine = {
  forecast(data, alpha, periods) {
    if (data.length === 0) return [];
    let smoothed = [data[0]];
    for (let i = 1; i < data.length; i++) {
      smoothed.push(alpha * data[i] + (1 - alpha) * smoothed[i - 1]);
    }
    const lastSmoothed = smoothed[smoothed.length - 1];
    const forecast = [];
    for (let i = 0; i < periods; i++) {
      forecast.push(lastSmoothed);
    }
    return { smoothed, forecast };
  },

  linearRegression(x, y) {
    const n = x.length;
    if (n === 0) return null;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
    for (let i = 0; i < n; i++) {
      sumX += x[i];
      sumY += y[i];
      sumXY += x[i] * y[i];
      sumXX += x[i] * x[i];
      sumYY += y[i] * y[i];
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const meanY = sumY / n;
    let ssTot = 0, ssRes = 0;
    for (let i = 0; i < n; i++) {
      const pred = slope * x[i] + intercept;
      ssTot += (y[i] - meanY) * (y[i] - meanY);
      ssRes += (y[i] - pred) * (y[i] - pred);
    }
    const r2 = ssTot === 0 ? 0 : 1 - (ssRes / ssTot);
    return { slope, intercept, r2 };
  },

  logisticRegression(x, y, epochs = 100, lr = 0.1) {
    let w = 0.0, b = 0.0;
    const sigmoid = z => 1 / (1 + Math.exp(-z));
    for (let epoch = 0; epoch < epochs; epoch++) {
      let dw = 0, db = 0;
      for (let i = 0; i < x.length; i++) {
        const pred = sigmoid(w * x[i] + b);
        const err = pred - y[i];
        dw += err * x[i];
        db += err;
      }
      w -= lr * (dw / x.length);
      b -= lr * (db / x.length);
    }
    return { weight: w, bias: b };
  },

  detectAnomalies(data, method, threshold = 3) {
    const n = data.length;
    if (n === 0) return [];
    
    const anomalies = [];
    if (method === 'iqr') {
      const sorted = [...data].sort((a,b)=>a-b);
      const q1 = sorted[Math.floor(n * 0.25)];
      const q3 = sorted[Math.floor(n * 0.75)];
      const iqr = q3 - q1;
      const lower = q1 - 1.5 * iqr;
      const upper = q3 + 1.5 * iqr;
      data.forEach((val, idx) => {
        if (val < lower || val > upper) anomalies.push(idx);
      });
    } else {
      const sum = data.reduce((a,b)=>a+b,0);
      const mean = sum / n;
      const variance = data.reduce((a,b)=>a + (b - mean)**2,0) / n;
      const std = Math.sqrt(variance);
      if (std > 0) {
        data.forEach((val, idx) => {
          const z = Math.abs((val - mean) / std);
          if (z > threshold) anomalies.push(idx);
        });
      }
    }
    return anomalies;
  },

  correlation(x, y) {
    const n = x.length;
    if (n === 0) return 0;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
    for (let i = 0; i < n; i++) {
      sumX += x[i];
      sumY += y[i];
      sumXY += x[i] * y[i];
      sumXX += x[i] * x[i];
      sumYY += y[i] * y[i];
    }
    const num = n * sumXY - sumX * sumY;
    const den = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
    return den === 0 ? 0 : num / den;
  }
};

function switchIntelTab(tab, el) {
  document.querySelectorAll('#intelligence-panel .intel-tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');

  document.querySelectorAll('#intelligence-panel .intel-tab-content').forEach(c => c.style.display = 'none');
  const content = document.getElementById('intel-' + tab);
  if (content) content.style.display = 'block';

  if (tab === 'correlation') runCorrelation();
  else if (tab === 'profiling') runProfiling();
}

function initIntelPanel() {
  populatePanelSelects();
  switchDocsTab('intro', document.querySelector('#docsModal .docs-tab'));
  switchIntelTab('forecast', document.querySelector('#intelligence-panel .intel-tab'));
  buildAISuggestions();
  renderAIHistory();
  checkOllamaStatus();
}

function runForecast() {
  const ci = parseInt(document.getElementById('forecastDataCol').value);
  if (isNaN(ci)) return;
  const alpha = parseFloat(document.getElementById('forecastAlpha').value) || 0.3;
  const periods = parseInt(document.getElementById('forecastPeriods').value) || 5;

  const data = rawData.map(r => parseFloat(r[ci])).filter(v => !isNaN(v));
  if (data.length < 3) {
    toast('Need at least 3 numeric data points for forecasting', 'error');
    return;
  }

  const { smoothed, forecast } = MathEngine.forecast(data, alpha, periods);

  let html = `<div class="intel-result">
    <h4>Forecast Results (Alpha: ${alpha})</h4>
    <div class="intel-metric"><span class="metric-label">Historical Mean</span><span class="metric-val">${formatNum(data.reduce((a,b)=>a+b,0)/data.length)}</span></div>
    <div class="intel-metric"><span class="metric-label">Last Value</span><span class="metric-val">${formatNum(data[data.length-1])}</span></div>
    <div class="intel-metric"><span class="metric-label">Next Value</span><span class="metric-val" style="color:var(--success)">${formatNum(forecast[0])}</span></div>
    <h5 style="margin-top:8px">Forecasted Periods:</h5>
    <ul style="font-size:11px;padding-left:16px;margin-top:4px">
  `;
  forecast.forEach((v, idx) => {
    html += `<li>T + ${idx+1}: <strong>${formatNum(v)}</strong></li>`;
  });
  html += `</ul></div>`;
  document.getElementById('forecastResult').innerHTML = html;

  const ctx = document.getElementById('forecastChart');
  ctx.style.display = 'block';
  if (window.forecastChartInstance) window.forecastChartInstance.destroy();

  const labels = data.map((_, i) => `T - ${data.length - 1 - i}`).concat(forecast.map((_, i) => `T + ${i+1}`));
  const histDataset = data.concat(new Array(periods).fill(null));
  const smoothDataset = smoothed.concat(new Array(periods).fill(null));
  const forecastDataset = new Array(data.length - 1).fill(null).concat([data[data.length-1]]).concat(forecast);

  window.forecastChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        { label: 'Actual', data: histDataset, borderColor: '#6366f1', fill: false },
        { label: 'Smoothed', data: smoothDataset, borderColor: '#10b981', borderDash: [5, 5], fill: false },
        { label: 'Forecast', data: forecastDataset, borderColor: '#ec4899', fill: false }
      ]
    },
    options: { responsive: true, scales: { y: { beginAtZero: false } } }
  });
}

function runRegression() {
  const xi = parseInt(document.getElementById('regrXCol').value);
  const yi = parseInt(document.getElementById('regrYCol').value);
  if (isNaN(xi) || isNaN(yi)) return;
  const type = document.getElementById('regrType').value;

  const pairs = rawData.map(r => [parseFloat(r[xi]), parseFloat(r[yi])]).filter(p => !isNaN(p[0]) && !isNaN(p[1]));
  if (pairs.length < 3) {
    toast('Need at least 3 paired numeric data points', 'error');
    return;
  }

  const xData = pairs.map(p => p[0]);
  const yData = pairs.map(p => p[1]);

  let html = `<div class="intel-result">`;
  if (type === 'linear') {
    const res = MathEngine.linearRegression(xData, yData);
    if (!res) return;
    html += `
      <h4>Linear Regression</h4>
      <div class="intel-metric"><span class="metric-label">Equation</span><span class="metric-val">Y = ${formatNum(res.slope)} * X + ${formatNum(res.intercept)}</span></div>
      <div class="intel-metric"><span class="metric-label">R² Strength</span><span class="metric-val">${formatNum(res.r2)}</span></div>
      <div class="intel-metric"><span class="metric-label">Slope (m)</span><span class="metric-val">${formatNum(res.slope)}</span></div>
      <div class="intel-metric"><span class="metric-label">Intercept (c)</span><span class="metric-val">${formatNum(res.intercept)}</span></div>
    `;
    
    const ctx = document.getElementById('regrChart');
    ctx.style.display = 'block';
    if (window.regrChartInstance) window.regrChartInstance.destroy();

    const minX = Math.min(...xData);
    const maxX = Math.max(...xData);
    const regLine = [{ x: minX, y: res.slope * minX + res.intercept }, { x: maxX, y: res.slope * maxX + res.intercept }];

    window.regrChartInstance = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          { label: 'Data Points', data: pairs.map(p => ({ x: p[0], y: p[1] })), backgroundColor: '#6366f1' },
          { label: 'Fit Line', data: regLine, type: 'line', borderColor: '#ef4444', fill: false, showLine: true, pointRadius: 0 }
        ]
      },
      options: { responsive: true }
    });
  } else {
    const medianY = yData.slice().sort((a,b)=>a-b)[Math.floor(yData.length/2)];
    const binY = yData.map(v => v > medianY ? 1 : 0);
    const res = MathEngine.logisticRegression(xData, binY);
    html += `
      <h4>Logistic Regression</h4>
      <p style="font-size:10px;color:var(--text-muted);margin-bottom:8px">Y split at Median (${formatNum(medianY)})</p>
      <div class="intel-metric"><span class="metric-label">Weight (w)</span><span class="metric-val">${formatNum(res.weight)}</span></div>
      <div class="intel-metric"><span class="metric-label">Bias (b)</span><span class="metric-val">${formatNum(res.bias)}</span></div>
    `;
    document.getElementById('regrChart').style.display = 'none';
  }
  html += `</div>`;
  document.getElementById('regrResult').innerHTML = html;
}

function runAnomaly() {
  const ci = parseInt(document.getElementById('anomalyCol').value);
  if (isNaN(ci)) return;
  const method = document.getElementById('anomalyMethod').value;
  const threshold = parseFloat(document.getElementById('anomalyThresh') ? document.getElementById('anomalyThresh').value : 3) || 3;

  const data = rawData.map(r => parseFloat(r[ci]));
  const cleanData = data.filter(v => !isNaN(v));
  if (cleanData.length < 3) {
    toast('Need at least 3 numeric values', 'error');
    return;
  }

  const indices = MathEngine.detectAnomalies(data, method, threshold);

  const tds = document.querySelectorAll('#vtbody td');
  tds.forEach(td => td.classList.remove('cell-highlight'));

  let html = `<div class="intel-result">
    <h4>Anomaly Summary</h4>
    <div class="intel-metric"><span class="metric-label">Method</span><span class="metric-val">${method.toUpperCase()}</span></div>
    <div class="intel-metric"><span class="metric-label">Total Outliers</span><span class="metric-val" style="color:var(--danger)">${indices.length}</span></div>
  `;

  if (indices.length > 0) {
    html += `<div style="margin-top:8px"><button class="tb-btn danger" onclick="highlightAnomalies([${indices.join(',')}])" style="width:100%;justify-content:center">Highlight Outliers</button></div>`;
  }
  html += `</div>`;
  document.getElementById('anomalyResult').innerHTML = html;
}

function runCorrelation() {
  const numCols = headers.map((_, i) => i).filter(i => colTypes[i] === 'number');
  if (numCols.length < 2) {
    document.getElementById('correlationResult').innerHTML = '<p style="color:var(--danger);padding:8px">Need at least 2 numeric columns for matrix</p>';
    return;
  }

  const matrix = {};
  for (let i = 0; i < numCols.length; i++) {
    const c1 = numCols[i];
    matrix[c1] = {};
    for (let j = 0; j < numCols.length; j++) {
      const c2 = numCols[j];
      if (c1 === c2) {
        matrix[c1][c2] = 1.0;
      } else {
        const px = [], py = [];
        rawData.forEach(r => {
          const vx = parseFloat(r[c1]), vy = parseFloat(r[c2]);
          if (!isNaN(vx) && !isNaN(vy)) {
            px.push(vx);
            py.push(vy);
          }
        });
        matrix[c1][c2] = MathEngine.correlation(px, py);
      }
    }
  }

  let html = `<div style="overflow-x:auto;margin-top:8px"><table class="comparison-table"><tr><th></th>`;
  numCols.forEach(c => { html += `<th>${escHtml(headers[c].substring(0,8))}</th>`; });
  html += `</tr>`;
  numCols.forEach(c1 => {
    html += `<tr><th>${escHtml(headers[c1].substring(0,8))}</th>`;
    numCols.forEach(c2 => {
      const val = matrix[c1][c2];
      const r = Math.round(255 - Math.abs(val) * 100);
      const g = Math.round(255 - Math.abs(val) * 100);
      const b = 255;
      const colStyle = `background-color:rgb(${r},${g},${b});color:${Math.abs(val)>0.5?'#fff':'#000'};text-align:center;font-weight:bold`;
      html += `<td style="${colStyle}" title="${headers[c1]} x ${headers[c2]}">${formatNum(val)}</td>`;
    });
    html += `</tr>`;
  });
  html += `</table></div>`;
  document.getElementById('correlationResult').innerHTML = html;
}

function runProfiling() {
  const container = document.getElementById('profilingResult');
  const totalRows = rawData.length;
  if (totalRows === 0) return;

  let totalCells = totalRows * headers.length;
  let emptyCells = 0;
  let numericCols = 0;
  let textCols = 0;
  let duplicateCount = 0;

  rawData.forEach(r => {
    r.forEach(c => {
      if (c === null || c === undefined || String(c).trim() === '') emptyCells++;
    });
  });

  headers.forEach((_, i) => {
    if (colTypes[i] === 'number') numericCols++;
    else textCols++;
  });

  const rowStrings = rawData.map(r => JSON.stringify(r));
  const uniqueRows = new Set(rowStrings);
  duplicateCount = totalRows - uniqueRows.size;

  const completeness = totalCells > 0 ? ((totalCells - emptyCells) / totalCells) * 100 : 0;
  const uniqueness = totalRows > 0 ? (uniqueRows.size / totalRows) * 100 : 0;
  const qualityScore = Math.round(completeness * 0.6 + uniqueness * 0.4);

  let trendCardHtml = '';
  headers.forEach((h, ci) => {
    if (colTypes[ci] === 'number') {
      const vals = rawData.map(r => parseFloat(r[ci])).filter(v => !isNaN(v));
      if (vals.length >= 10) {
        const half = Math.floor(vals.length / 2);
        const m1 = vals.slice(0, half).reduce((a,b)=>a+b,0) / half;
        const m2 = vals.slice(half).reduce((a,b)=>a+b,0) / (vals.length - half);
        const diff = ((m2 - m1) / (m1 || 1)) * 100;
        if (Math.abs(diff) > 5) {
          const direction = diff > 0 ? 'upward 📈' : 'downward 📉';
          trendCardHtml += `
            <div class="insight-card">
              <span class="insight-icon">💡</span>
              <div>
                <strong>${escHtml(h)}:</strong> shows a ${formatNum(Math.abs(diff))}% ${direction} change (first vs second half avg).
              </div>
            </div>
          `;
        }
      }
    }
  });

  if (!trendCardHtml) {
    trendCardHtml = `<div class="insight-card"><span class="insight-icon">✔</span><div>No strong upward or downward trends detected.</div></div>`;
  }

  let scoreClass = 'dq-high';
  if (qualityScore < 80) scoreClass = 'dq-medium';
  if (qualityScore < 50) scoreClass = 'dq-low';

  const badgeEl = document.getElementById('dqBadge');
  if (badgeEl) {
    badgeEl.textContent = `Quality: ${qualityScore}%`;
    badgeEl.className = `dq-badge ${scoreClass}`;
    badgeEl.style.display = 'inline-flex';
  }

  let html = `
    <div class="intel-result">
      <div class="quality-score">
        <div class="score-ring" style="background:${qualityScore > 80 ? 'var(--success)' : (qualityScore > 50 ? 'var(--warning)' : 'var(--danger)')}">${qualityScore}%</div>
        <strong>Overall Data Quality Score</strong>
      </div>
      <div class="intel-metric"><span class="metric-label">Total Rows</span><span class="metric-val">${totalRows.toLocaleString()}</span></div>
      <div class="intel-metric"><span class="metric-label">Empty Cells</span><span class="metric-val">${emptyCells.toLocaleString()}</span></div>
      <div class="intel-metric"><span class="metric-label">Completeness</span><span class="metric-val">${formatNum(completeness)}%</span></div>
      <div class="intel-metric"><span class="metric-label">Uniqueness</span><span class="metric-val">${formatNum(uniqueness)}%</span></div>
      <h4 style="margin-top:12px;margin-bottom:6px">Insights</h4>
      ${trendCardHtml}
    </div>
  `;
  container.innerHTML = html;
}

// Group By Panel
function initGroupByPanel() {
  populatePanelSelects();
}

function runGroupBy() {
  const gci = parseInt(document.getElementById('groupbyCol').value);
  const aci = parseInt(document.getElementById('groupbyAggCol').value);
  const func = document.getElementById('groupbyFunc').value;

  if (isNaN(gci) || isNaN(aci)) return;

  const groups = {};
  rawData.forEach(row => {
    const gVal = String(row[gci] != null ? row[gci] : '').trim() || '(blank)';
    const aVal = ((window.STL && STL.charts && STL.charts.num) ? STL.charts.num : (v => { const n = parseFloat(String(v).replace(/,/g, '')); return isNaN(n) ? null : n; }))(row[aci]);
    if (!groups[gVal]) groups[gVal] = [];
    if (aVal !== null && !isNaN(aVal)) groups[gVal].push(aVal);
  });

  const results = [];
  for (const g in groups) {
    const vals = groups[g];
    let agg = 0;
    if (vals.length > 0) {
      if (func === 'sum') agg = vals.reduce((a,b)=>a+b,0);
      else if (func === 'avg') agg = vals.reduce((a,b)=>a+b,0) / vals.length;
      else if (func === 'count') agg = vals.length;
      else if (func === 'min') agg = Math.min(...vals);
      else if (func === 'max') agg = Math.max(...vals);
      else if (func === 'median') {
        const sorted = vals.slice().sort((a,b)=>a-b), mid = sorted.length >> 1;
        agg = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      } else if (func === 'stddev') {
        const avg = vals.reduce((a,b)=>a+b,0) / vals.length;
        const variance = vals.length > 1 ? vals.reduce((a,b)=>a + (b - avg)**2, 0) / (vals.length - 1) : 0;      // sample standard deviation, as Excel's STDEV.S
        agg = Math.sqrt(variance);
      }
    } else {
      agg = func === 'count' ? 0 : '';
    }
    results.push({ group: g, val: agg });
  }

  let html = `<table class="comparison-table"><tr><th>${escHtml(headers[gci])}</th><th>${func.toUpperCase()}(${escHtml(headers[aci])})</th></tr>`;
  results.forEach(r => {
    html += `<tr><td>${escHtml(r.group)}</td><td><strong>${typeof r.val === 'number' ? formatNum(r.val) : r.val}</strong></td></tr>`;
  });
  html += `</table>`;
  document.getElementById('groupbyResult').innerHTML = html;
}

// Comparison Panel
function initComparisonPanel() {
  populatePanelSelects();
}

function runComparison() {
  const _e1 = document.getElementById('compareColA') || document.getElementById('compareCol1'), _e2 = document.getElementById('compareColB') || document.getElementById('compareCol2');
  const c1 = parseInt(_e1 && _e1.value);
  const c2 = parseInt(_e2 && _e2.value);
  if (isNaN(c1) || isNaN(c2)) return;

  let html = `<table class="comparison-table"><tr><th>#</th><th>${escHtml(headers[c1])}</th><th>${escHtml(headers[c2])}</th><th>Diff</th><th>% Change</th></tr>`;

  rawData.slice(0, 200).forEach((row, idx) => {
    const _nf = ((window.STL && STL.charts && STL.charts.num) ? STL.charts.num : (v => { const n = parseFloat(String(v).replace(/,/g, '')); return isNaN(n) ? null : n; }));
    const v1 = _nf(row[c1]) === null ? NaN : _nf(row[c1]);
    const v2 = _nf(row[c2]) === null ? NaN : _nf(row[c2]);
    if (!isNaN(v1) && !isNaN(v2)) {
      const diff = v2 - v1;
      const pct = v1 !== 0 ? (diff / v1) * 100 : 0;
      const pctText = pct !== 0 ? formatNum(pct) + '%' : '0%';
      const diffClass = diff > 0 ? 'diff-pos' : (diff < 0 ? 'diff-neg' : '');
      const sign = diff > 0 ? '+' : '';
      
      const maxVal = Math.max(Math.abs(v1), Math.abs(v2), 1);
      const barW = Math.min((Math.abs(diff) / maxVal) * 40, 40);
      const barHtml = `<div class="mini-bar" style="width:${barW}px;background:${diff>0?'var(--success)':'var(--danger)'}"></div>`;

      html += `<tr>
        <td>${idx+1}</td>
        <td>${formatNum(v1)}</td>
        <td>${formatNum(v2)}</td>
        <td class="${diffClass}">${sign}${formatNum(diff)}${barHtml}</td>
        <td class="${diffClass}">${pctText}</td>
      </tr>`;
    }
  });
  html += `</table>`;
  document.getElementById('comparisonResult').innerHTML = html;
}

// Documentation Panel Modal
const docsSections = {
  intro: `
    <h3>Welcome to Stellura — स्टेल्यूरा</h3>
    <p>Stellura is designed to provide powerful yet intuitive data analysis tools right inside your browser, offline-first. All computations and file imports are executed locally on your device for absolute privacy.</p>
    <h4>Key Features:</h4>
    <ul>
      <li>Spreadsheet-like cell editing & range selection.</li>
      <li>Advanced data formatting & conditional coloring.</li>
      <li>Hindi font conversions (Unicode ↔ Krutidev ↔ Devlys).</li>
      <li>High-fidelity PDF and Excel reports generator.</li>
      <li>Interactive charts & real-time dashboard updates.</li>
      <li>Intelligence engine forecasting & regressions.</li>
    </ul>
  `,
  analysis: `
    <h3>Advanced Data Analysis</h3>
    <p>Under the <strong>Column Analysis</strong> sidebar tab, you can view summary statistics of any selected field. Statistics are calculated instantly and reflect any active search terms or filters.</p>
    <h4>Supported Stats:</h4>
    <ul>
      <li><strong>Numeric Fields:</strong> Mean, sum, standard deviation, variance, minimum, maximum, count of values, and null counts.</li>
      <li><strong>Text Fields:</strong> Count, unique count, null counts, duplicate items, and most frequent values.</li>
    </ul>
  `,
  intel: `
    <h3>Intelligence & Forecasting Engine</h3>
    <p>The **Intelligence Engine** leverages locally implemented algorithms to discover trends, anomalies, and relationships within your dataset without requiring external APIs.</p>
    <ul>
      <li><strong>Forecast:</strong> Uses exponential smoothing to project numeric time-series values forward.</li>
      <li><strong>Regression:</strong> OLS Linear & Gradient Descent Logistic modeling to study variable impact.</li>
      <li><strong>Anomaly Detection:</strong> Discovers outliers using Z-Score or Interquartile Range (IQR).</li>
      <li><strong>Correlation:</strong> Generates a blue-scale Pearson correlation coefficient matrix.</li>
    </ul>
  `,
  hindi: `
    <h3>Hindi Font Conversion</h3>
    <p>A critical tool for regional office administration in India (specifically Rajasthan and northern states). Select text columns or individual cells to convert encodings.</p>
    <ul>
      <li><strong>Krutidev ↔ Unicode:</strong> Converts legacy Krutidev 010 text to modern web-standard Unicode Mangal, and vice versa.</li>
      <li><strong>Devlys Support:</strong> Converts Devlys font layouts to readable Unicode.</li>
      <li><strong>Auto Detection:</strong> Automatically discovers legacy or Unicode encoding in cells.</li>
    </ul>
  `,
  export: `
    <h3>Professional Exporting</h3>
    <p>Export formatted spreadsheets to Excel or PDF with executive-level templates.</p>
    <ul>
      <li><strong>PDF Layouts:</strong> Configurable paper sizes (A4, Letter, Legal), margins, and watermarks ("CONFIDENTIAL", "DRAFT").</li>
      <li><strong>Logo Integration:</strong> Option to display a sleek, stylized logo at the top header banner.</li>
      <li><strong>Signatures:</strong> Toggle to attach your custom user profile (name, title, organization) at the bottom footer.</li>
    </ul>
  `,
  shortcuts: `
    <h3>Keyboard Shortcuts Reference</h3>
    <ul>
      <li><kbd>Ctrl</kbd> + <kbd>Z</kbd> : Undo last action</li>
      <li><kbd>Ctrl</kbd> + <kbd>Y</kbd> : Redo last undone action</li>
      <li><kbd>Ctrl</kbd> + <kbd>S</kbd> : Save session state to localStorage</li>
      <li><kbd>Ctrl</kbd> + <kbd>G</kbd> : Go To Cell Reference (e.g., A500)</li>
      <li><kbd>Ctrl</kbd> + <kbd>A</kbd> : Select all data cells in the current sheet</li>
      <li><kbd>Ctrl</kbd> + <kbd>O</kbd> : Open file browser dialog</li>
      <li><kbd>Ctrl</kbd> + <kbd>E</kbd> : Open Excel export panel</li>
      <li><kbd>Ctrl</kbd> + <kbd>P</kbd> : Open PDF export panel</li>
      <li><kbd>Ctrl</kbd> + <kbd>D</kbd> : Toggle Light/Dark appearance theme</li>
    </ul>
  `,
  privacy: `
    <h3>Privacy Policy</h3>
    <p><strong>Your data is yours alone.</strong> Stellura operates entirely inside your local browser instance. No data is stored, tracked, or sent to any analytics server or third-party service. This app is completely free, secure, and private for public administration use.</p>
  `,
  terms: `
    <h3>Terms of Service</h3>
    <p>This software is provided "as-is" without warranty of any kind, express or implied. It is free to use for individual, administrative, commercial, and governmental operations. The authors do not assume responsibility for data lost due to local storage quota restrictions.</p>
  `
};

function showDocsModal(section = 'intro') {
  showModal('docsModal');
  switchDocsTab(section, document.querySelector(`#docsModal .docs-tab`));
}

function switchDocsTab(section, el) {
  document.querySelectorAll('#docsModal .docs-tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  const contentEl = document.getElementById('docsContent');
  if (contentEl && docsSections[section]) {
    contentEl.innerHTML = docsSections[section];
  }
}

// Print & Print Preview
function showPrintPreview() {
  if (rawData.length === 0) { toast('No data to preview', 'error'); return; }
  const preview = document.getElementById('printPreviewContent');
  const paperSize = document.getElementById('printPaperSize')?.value || 'a4';
  const orientation = document.getElementById('printOrientation')?.value || 'landscape';
  const pageDimensions = {
    a4: { portrait:[210,297], landscape:[297,210] },
    legal: { portrait:[216,356], landscape:[356,216] },
    letter: { portrait:[216,279], landscape:[279,216] }
  };
  const [pageWidth,pageHeight] = pageDimensions[paperSize][orientation];
  preview.style.width = `${Math.min(720, pageWidth * 2.2)}px`;
  preview.style.minHeight = `${Math.min(430, pageHeight * 1.35)}px`;
  
  let html = `<h2 style="text-align:center;color:#4338ca;font-family:'Outfit','Noto Sans Devanagari',sans-serif;margin-bottom:4px">Stellura Report</h2><p style="text-align:center;font-size:12px;color:#7c3aed;font-family:'Noto Sans Devanagari',sans-serif;margin-bottom:8px">स्टेल्यूरा</p>`;
  if (userProfile.name) {
    html += `<p style="text-align:center;font-size:8px;color:#64748b;margin-bottom:12px">Author: ${escHtml(userProfile.name)} (${escHtml(userProfile.desig)} - ${escHtml(userProfile.org)})</p>`;
  }
  
  html += `<table style="width:100%;border-collapse:collapse;font-size:7px"><thead><tr style="background:#e2e8f0">`;
  headers.forEach(h => { html += `<th style="border:1px solid #cbd5e1;padding:3px">${escHtml(h)}</th>`; });
  html += `</tr></thead><tbody>`;
  
  rawData.slice(0, 100).forEach(row => {
    html += `<tr>`;
    row.forEach(c => { html += `<td style="border:1px solid #e2e8f0;padding:2px">${escHtml(c)}</td>`; });
    html += `</tr>`;
  });
  html += `</tbody></table>`;
  if (rawData.length > 100) {
    html += `<p style="text-align:center;font-size:7px;color:#94a3b8;margin-top:6px">Previewing first 100 rows (${rawData.length} total)</p>`;
  }
  preview.innerHTML = html;
  showModal('printPreviewModal');
}

function executePrint() {
  closeModal('printPreviewModal');
  const paperSize = document.getElementById('printPaperSize')?.value || 'a4';
  const orientation = document.getElementById('printOrientation')?.value || 'landscape';
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
      <head>
        <title>Stellura Report</title>
        <style>
          @page { size: ${paperSize} ${orientation}; margin: 10mm; }
          body { font-family: sans-serif; padding: 20px; color: #000; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 8px; }
          th, td { border: 1px solid #ccc; padding: 4px; text-align: left; }
          th { background: #f0f0f0; }
          h2 { color:#0f8f83!important; }
        </style>
      </head>
      <body>
        ${document.getElementById('printPreviewContent').innerHTML}
        <script>window.onload = function() { window.print(); window.close(); }<\/script>
      </body>
    </html>
  `);
  printWindow.document.close();
}
/* P4 — Pointer parallax on #dd-cosmos (dark theme, no reduce-motion) */
(function(){
  var cosmos = document.getElementById('dd-cosmos');
  if (!cosmos) return;
  var lastX = 0, lastY = 0;
  document.addEventListener('mousemove', function(e){
    var theme = document.documentElement.dataset.theme;
    if (theme !== 'dark') return;
    if (document.documentElement.classList.contains('reduce-motion')) return;
    var nx = (e.clientX / window.innerWidth  - 0.5) * 20;
    var ny = (e.clientY / window.innerHeight - 0.5) * 14;
    if (Math.abs(nx - lastX) < 0.4 && Math.abs(ny - lastY) < 0.4) return;
    lastX = nx; lastY = ny;
    cosmos.style.transform = 'translate3d('+nx.toFixed(1)+'px,'+ny.toFixed(1)+'px,0)';
  }, {passive:true});
  /* Reset transform when leaving window */
  document.addEventListener('mouseleave', function(){
    cosmos.style.transform = 'translate3d(0,0,0)';
  });
})();
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

function quickFilter(ci) {
  populatePanelSelects();
  document.getElementById('filterCol').value = ci;
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('visible'));
  document.getElementById('filter-panel').classList.add('visible');
  loadFilterValues();
}

