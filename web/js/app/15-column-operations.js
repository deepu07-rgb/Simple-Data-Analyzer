// =====================================================================
//  COLUMN OPERATIONS
// =====================================================================
function addColumnLeft() {
  const ci = parseInt(document.getElementById('colOpsCol').value);
  if (isNaN(ci)) return;
  pushUndo();
  const name = prompt('New column name:', 'New Column');
  if (!name) return;
  headers.splice(ci, 0, name);
  colTypes.splice(ci, 0, 'text');
  rawData.forEach(row => row.splice(ci, 0, ''));
  showTable();
  populatePanelSelects();
  toast('Column added', 'success');
}

function addColumnRight() {
  const ci = parseInt(document.getElementById('colOpsCol').value);
  if (isNaN(ci)) return;
  pushUndo();
  const name = prompt('New column name:', 'New Column');
  if (!name) return;
  headers.splice(ci + 1, 0, name);
  colTypes.splice(ci + 1, 0, 'text');
  rawData.forEach(row => row.splice(ci + 1, 0, ''));
  showTable();
  populatePanelSelects();
  toast('Column added', 'success');
}

function deleteColumn() {
  const ci = parseInt(document.getElementById('colOpsCol').value);
  if (isNaN(ci)) return;
  if (headers.length <= 1) { toast('Cannot delete the last column', 'error'); return; }
  if (!confirm(`Delete column "${headers[ci]}"?`)) return;
  pushUndo();
  headers.splice(ci, 1);
  colTypes.splice(ci, 1);
  rawData.forEach(row => row.splice(ci, 1));
  showTable();
  populatePanelSelects();
  toast('Column deleted', 'success');
}

function renameColumn() {
  const ci = parseInt(document.getElementById('colOpsCol').value);
  if (isNaN(ci)) return;
  const name = prompt('New name:', headers[ci]);
  if (!name) return;
  pushUndo();
  headers[ci] = name;
  renderTableHeader();
  populatePanelSelects();
  toast('Column renamed', 'success');
}

function changeColumnType() {
  const ci = parseInt(document.getElementById('colOpsCol').value);
  const newType = document.getElementById('colChangeType').value;
  if (isNaN(ci)) return;
  colTypes[ci] = newType;
  toast(`Column "${headers[ci]}" type set to ${newType}`, 'success');
}

function splitColumn() {
  const ci = parseInt(document.getElementById('colOpsCol').value);
  const delim = document.getElementById('splitDelimiter').value;
  if (isNaN(ci) || !delim) { toast('Select column and enter delimiter', 'error'); return; }
  pushUndo();

  let maxParts = 1;
  rawData.forEach(row => {
    const parts = String(row[ci] || '').split(delim);
    maxParts = Math.max(maxParts, parts.length);
  });

  for (let p = 0; p < maxParts; p++) {
    headers.splice(ci + 1 + p, 0, `${headers[ci]}_${p + 1}`);
    colTypes.splice(ci + 1 + p, 0, 'text');
  }

  rawData.forEach(row => {
    const parts = String(row[ci] || '').split(delim);
    for (let p = 0; p < maxParts; p++) {
      row.splice(ci + 1 + p, 0, (parts[p] || '').trim());
    }
  });

  showTable();
  populatePanelSelects();
  toast(`Column split into ${maxParts} parts`, 'success');
}

function mergeColumns() {
  const ci1 = parseInt(document.getElementById('colOpsCol').value);
  const ci2 = parseInt(document.getElementById('mergeWithCol').value);
  const sep = document.getElementById('mergeSeparator').value;
  if (isNaN(ci1) || isNaN(ci2)) { toast('Select both columns', 'error'); return; }
  if (ci1 === ci2) { toast('Select different columns', 'error'); return; }
  pushUndo();

  const newName = `${headers[ci1]}+${headers[ci2]}`;
  headers.push(newName);
  colTypes.push('text');
  rawData.forEach(row => {
    row.push(String(row[ci1] || '') + sep + String(row[ci2] || ''));
  });

  showTable();
  populatePanelSelects();
  toast('Columns merged', 'success');
}

// =====================================================================
//  PIVOT TABLE
// =====================================================================
function initPivotPanel() {
  const wrap = document.getElementById('pivotColumns');
  wrap.innerHTML = headers.map((h, i) =>
    `<span class="col-draggable" draggable="true" ondragstart="event.dataTransfer.setData('text/plain','${i}')">${escHtml(h)}</span>`
  ).join('');
  renderPivotFields();
}

function pivotDrop(e, zone) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const ci = parseInt(e.dataTransfer.getData('text/plain'));
  if (isNaN(ci)) return;
  if (zone === 'rows' && !pivotConfig.rows.includes(ci)) pivotConfig.rows.push(ci);
  if (zone === 'cols' && !pivotConfig.cols.includes(ci)) pivotConfig.cols.push(ci);
  if (zone === 'vals' && !pivotConfig.vals.includes(ci)) pivotConfig.vals.push(ci);
  renderPivotFields();
}

function removePivotField(zone, ci) {
  pivotConfig[zone] = pivotConfig[zone].filter(c => c !== ci);
  renderPivotFields();
}

function renderPivotFields() {
  ['rows', 'cols', 'vals'].forEach(zone => {
    const container = document.getElementById(`pivot${zone.charAt(0).toUpperCase()+zone.slice(1)}Fields`);
    container.innerHTML = pivotConfig[zone].map(ci =>
      `<span class="pivot-field">${escHtml(headers[ci])} <span class="pf-del" onclick="removePivotField('${zone}',${ci})">×</span></span>`
    ).join('');
  });
}

function buildPivotTable() {
  if (pivotConfig.rows.length === 0) { toast('Add at least one Row Field', 'error'); return; }
  if (pivotConfig.vals.length === 0) { toast('Add at least one Value Field', 'error'); return; }

  const agg = document.getElementById('pivotAgg').value;
  const rowField = pivotConfig.rows[0];
  const colField = pivotConfig.cols.length > 0 ? pivotConfig.cols[0] : null;
  const valField = pivotConfig.vals[0];

  // Group data
  const groups = {};
  const colValues = new Set();
  const indices = getDisplayData();

  indices.forEach(ri => {
    const rowKey = String(rawData[ri][rowField] || '');
    const colKey = colField !== null ? String(rawData[ri][colField] || '') : '_total_';
    const val = parseFloat(rawData[ri][valField]) || 0;

    if (!groups[rowKey]) groups[rowKey] = {};
    if (!groups[rowKey][colKey]) groups[rowKey][colKey] = [];
    groups[rowKey][colKey].push(val);
    colValues.add(colKey);
  });

  const sortedCols = [...colValues].sort();
  const sortedRows = Object.keys(groups).sort();

  function aggregate(arr) {
    if (arr.length === 0) return 0;
    switch(agg) {
      case 'sum': return arr.reduce((a,b) => a+b, 0);
      case 'count': return arr.length;
      case 'avg': return arr.reduce((a,b) => a+b, 0) / arr.length;
      case 'min': return Math.min(...arr);
      case 'max': return Math.max(...arr);
      default: return arr.reduce((a,b) => a+b, 0);
    }
  }

  let html = '<table class="pivot-result-table"><thead><tr><th>' + escHtml(headers[rowField]) + '</th>';
  if (colField !== null) {
    sortedCols.forEach(c => html += `<th>${escHtml(c)}</th>`);
  }
  html += '<th>Total</th></tr></thead><tbody>';

  sortedRows.forEach(rowKey => {
    html += `<tr><td style="font-weight:600">${escHtml(rowKey)}</td>`;
    let rowTotal = [];
    if (colField !== null) {
      sortedCols.forEach(colKey => {
        const arr = groups[rowKey][colKey] || [];
        const v = aggregate(arr);
        rowTotal.push(...arr);
        html += `<td>${formatNum(v)}</td>`;
      });
    } else {
      const arr = groups[rowKey]['_total_'] || [];
      rowTotal = arr;
    }
    html += `<td style="font-weight:700">${formatNum(aggregate(rowTotal))}</td></tr>`;
  });

  html += '</tbody></table>';
  document.getElementById('pivotResult').innerHTML = html;
  toast('Pivot table generated', 'success');
}

function exportPivotExcel() {
  const table = document.querySelector('#pivotResult table');
  if (!table) { toast('Build a pivot table first', 'error'); return; }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.table_to_sheet(table);
  XLSX.utils.book_append_sheet(wb, ws, 'Pivot');
  XLSX.writeFile(wb, 'pivot_table.xlsx');
  toast('Pivot exported to Excel', 'success');
}

// =====================================================================
//  DASHBOARD
// =====================================================================
function buildDashboard() {
  const view = document.getElementById('dashboard-view');
  view.classList.add('visible');

  const totalRows = rawData.length;
  const totalCols = headers.length;
  const numCols = headers.filter((_, i) => colTypes[i] === 'number');

  let html = `<div id="dash-export-bar" style="display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap;background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:10px 14px;box-shadow:var(--card-shadow);">
  <span style="font-size:11px;color:var(--text-secondary);font-weight:700;margin-right:2px;text-transform:uppercase;letter-spacing:.04em;">Export Dashboard:</span>
  <button class="tb-btn" onclick="exportDashboardPNG()" title="Download dashboard as PNG image" style="gap:5px;font-size:11px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>PNG Image</button>
  <button class="tb-btn" onclick="exportDashboardPDF()" title="Download dashboard as PDF" style="font-size:11px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>PDF Report</button>
  <button class="tb-btn" onclick="exportDashboardExcel()" title="Export full data to Excel" style="font-size:11px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Full Data Excel</button>
  <button class="tb-btn primary" onclick="exportInteractiveHTML()" title="Share as self-contained interactive HTML" style="margin-left:auto;font-size:11px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>Share Interactive HTML</button>
</div>
<h2 style="margin-bottom:16px;font-size:20px;font-weight:800;color:var(--text-primary)">📊 Dashboard</h2>`;

  // KPI cards
  html += '<div class="dash-grid">';
  html += `<div class="dash-kpi"><div class="kpi-value">${totalRows.toLocaleString()}</div><div class="kpi-label">Total Rows</div></div>`;
  html += `<div class="dash-kpi"><div class="kpi-value">${totalCols}</div><div class="kpi-label">Total Columns</div></div>`;

  numCols.slice(0, 4).forEach(h => {
    const ci = headers.indexOf(h);
    const nums = rawData.map(r => parseFloat(r[ci])).filter(n => !isNaN(n));
    if (nums.length > 0) {
      const avg = nums.reduce((a,b) => a+b, 0) / nums.length;
      html += `<div class="dash-kpi"><div class="kpi-value">${formatNum(avg)}</div><div class="kpi-label">Avg ${escHtml(h)}</div></div>`;
    }
  });

  // Custom KPIs from Formula Studio
  if (typeof customKpis !== 'undefined') {
    customKpis.forEach(kpi => {
      html += `<div class="dash-kpi" style="border-color:var(--accent)"><div class="kpi-value" style="color:var(--accent)">${escHtml(kpi.value)}</div><div class="kpi-label">${escHtml(kpi.title)}</div></div>`;
    });
  }

  html += '</div>';

  // Charts
  html += '<div class="dash-charts">';

  // Chart 1: First text column frequency
  const textCols = headers.filter((_, i) => colTypes[i] === 'text');
  if (textCols.length > 0) {
    html += `<div class="dash-chart-card"><h4>${escHtml(textCols[0])} Distribution</h4><canvas id="dashChart1"></canvas></div>`;
  }

  // Chart 2: First numeric column
  if (numCols.length > 0) {
    html += `<div class="dash-chart-card"><h4>${escHtml(numCols[0])} Overview</h4><canvas id="dashChart2"></canvas></div>`;
  }

  html += '</div>';

  // Insights
  html += '<div class="dash-insights"><h4>💡 Quick Insights</h4><ul>';
  html += `<li>Dataset contains ${totalRows.toLocaleString()} records across ${totalCols} fields</li>`;

  numCols.slice(0, 3).forEach(h => {
    const ci = headers.indexOf(h);
    const nums = rawData.map(r => parseFloat(r[ci])).filter(n => !isNaN(n));
    if (nums.length > 0) {
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      html += `<li>${escHtml(h)}: ranges from ${formatNum(min)} to ${formatNum(max)}</li>`;
    }
  });

  const emptyCounts = headers.map((h, i) => {
    const empty = rawData.filter(r => String(r[i] || '').trim() === '').length;
    return { col: h, count: empty };
  }).filter(e => e.count > 0).sort((a,b) => b.count - a.count);
  if (emptyCounts.length > 0) {
    html += `<li>Column "${escHtml(emptyCounts[0].col)}" has ${emptyCounts[0].count} empty values</li>`;
  }

  html += '</ul></div>';
  view.innerHTML = html;

  // Render dashboard charts
  setTimeout(() => {
    dashCharts.forEach(c => c.destroy());
    dashCharts = [];

    if (textCols.length > 0) {
      const ci = headers.indexOf(textCols[0]);
      const freq = {};
      rawData.forEach(r => { const v = String(r[ci]||''); freq[v] = (freq[v]||0)+1; });
      const sorted = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0, 8);
      const canvas1 = document.getElementById('dashChart1');
      if (canvas1) {
        const colors = ['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316'];
        dashCharts.push(new Chart(canvas1, {
          type: 'doughnut',
          data: { labels: sorted.map(e => e[0]), datasets: [{ data: sorted.map(e => e[1]), backgroundColor: colors.map(c => c+'cc'), borderWidth: 2 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } }
        }));
      }
    }

    if (numCols.length > 0) {
      const ci = headers.indexOf(numCols[0]);
      const nums = rawData.slice(0, 30).map(r => parseFloat(r[ci])).filter(n => !isNaN(n));
      const canvas2 = document.getElementById('dashChart2');
      if (canvas2) {
        dashCharts.push(new Chart(canvas2, {
          type: 'bar',
          data: { labels: nums.map((_, i) => i+1), datasets: [{ label: numCols[0], data: nums, backgroundColor: '#6366f199', borderColor: '#6366f1', borderWidth: 1 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false } } }
        }));
      }
    }
  }, 100);
}

