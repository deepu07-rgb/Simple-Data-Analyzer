// =====================================================================
//  PANEL SELECTS POPULATION
// =====================================================================
function populatePanelSelects() {
  const selects = [
    'analysisCol','filterCol','cfCol','hindiCol','colOpsCol','mergeWithCol','findCol','validCol',
    'forecastDataCol', 'regrXCol', 'regrYCol', 'anomalyCol', 'groupbyCol', 'groupbyAggCol', 'compareCol1', 'compareCol2',
    'compareColA', 'compareColB', 'formulasTargetCol', 'guidedColumn'
  ];
  selects.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prevVal = sel.value;
    sel.innerHTML = '';
    if (id === 'hindiCol' || id === 'findCol') {
      sel.innerHTML = '<option value="all">All Columns</option>';
    }
    headers.forEach((h, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = h;
      sel.appendChild(opt);
    });
    if (prevVal && sel.querySelector(`option[value="${prevVal}"]`)) sel.value = prevVal;
  });
}

// =====================================================================
//  ANALYSIS PANEL (Advanced Statistics)
// =====================================================================
function runAnalysis() {
  const ci = parseInt(document.getElementById('analysisCol').value);
  if (isNaN(ci)) return;
  const container = document.getElementById('analysisResults');
  const values = rawData.map(r => r[ci]);
  const nonEmpty = values.filter(v => v !== '' && v != null);
  const total = nonEmpty.length;
  const empty = rawData.length - total;
  const unique = new Set(nonEmpty).size;

  let html = `<div class="stat-grid" style="margin-top:12px">
    <div class="stat-card"><div class="stat-val">${rawData.length}</div><div class="stat-label">Total Rows</div></div>
    <div class="stat-card"><div class="stat-val">${empty}</div><div class="stat-label">Empty Cells</div></div>
    <div class="stat-card"><div class="stat-val">${unique}</div><div class="stat-label">Unique Values</div></div>
    <div class="stat-card"><div class="stat-val">${total}</div><div class="stat-label">Non-Empty</div></div>`;

  if (colTypes[ci] === 'number') {
    const _nf = ((window.STL && STL.charts && STL.charts.num) ? STL.charts.num : (v => { const n = parseFloat(String(v).replace(/,/g, '')); return isNaN(n) ? null : n; }));
    const nums = nonEmpty.map(v => _nf(v)).filter(n => n !== null && !isNaN(n));
    const _bad = nonEmpty.length - nums.length;
    if (_bad > 0) html += `<div class="stat-card" style="grid-column:1/-1"><div class="stat-label">${_bad} cell${_bad > 1 ? 's are' : ' is'} not a number and left out of the figures below</div></div>`;
    if (nums.length > 0) {
      nums.sort((a, b) => a - b);
      const sum = nums.reduce((a, b) => a + b, 0);
      const avg = sum / nums.length;
      const min = nums[0];
      const max = nums[nums.length - 1];
      const median = getMedian(nums);
      const stdDev = getStdDev(nums, avg);
      const variance = stdDev * stdDev;
      const p25 = getPercentile(nums, 25);
      const p50 = getPercentile(nums, 50);
      const p75 = getPercentile(nums, 75);

      html += `
        <div class="stat-card"><div class="stat-val">${formatNum(sum)}</div><div class="stat-label">Sum</div></div>
        <div class="stat-card"><div class="stat-val">${formatNum(avg)}</div><div class="stat-label">Average</div></div>
        <div class="stat-card"><div class="stat-val">${formatNum(median)}</div><div class="stat-label">Median</div></div>
        <div class="stat-card"><div class="stat-val">${formatNum(min)}</div><div class="stat-label">Min</div></div>
        <div class="stat-card"><div class="stat-val">${formatNum(max)}</div><div class="stat-label">Max</div></div>
        <div class="stat-card"><div class="stat-val">${formatNum(stdDev)}</div><div class="stat-label">Std Dev</div></div>
        <div class="stat-card"><div class="stat-val">${formatNum(variance)}</div><div class="stat-label">Variance</div></div>
        <div class="stat-card"><div class="stat-val">${formatNum(p25)}</div><div class="stat-label">25th Pctl</div></div>
        <div class="stat-card"><div class="stat-val">${formatNum(p50)}</div><div class="stat-label">50th Pctl</div></div>
        <div class="stat-card"><div class="stat-val">${formatNum(p75)}</div><div class="stat-label">75th Pctl</div></div>`;
      html += '</div>';

      // Top & Bottom 5
      html += '<div style="margin-top:16px"><div class="panel-section-title">Top 5 Values</div><table class="freq-table"><tr><th>Value</th></tr>';
      nums.slice(-5).reverse().forEach(v => html += `<tr><td>${formatNum(v)}</td></tr>`);
      html += '</table></div>';
      html += '<div style="margin-top:12px"><div class="panel-section-title">Bottom 5 Values</div><table class="freq-table"><tr><th>Value</th></tr>';
      nums.slice(0, 5).forEach(v => html += `<tr><td>${formatNum(v)}</td></tr>`);
      html += '</table></div>';
    } else {
      html += '</div>';
    }
  } else {
    html += '</div>';
  }

  // Frequency distribution (top 10)
  const freq = {};
  nonEmpty.forEach(v => { const key = String(v); freq[key] = (freq[key] || 0) + 1; });
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (sorted.length > 0) {
    html += '<div style="margin-top:16px"><div class="panel-section-title">Top 10 Values (Frequency)</div>';
    html += '<table class="freq-table"><tr><th>Value</th><th>Count</th><th>%</th></tr>';
    sorted.forEach(([val, count]) => {
      html += `<tr><td>${escHtml(val)}</td><td>${count}</td><td>${(count/total*100).toFixed(1)}%</td></tr>`;
    });
    html += '</table></div>';
  }

  container.innerHTML = html;
}

function getMedian(sorted) {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function getStdDev(nums, avg) {
  if (nums.length < 2) return 0;
  const sqDiffs = nums.map(n => (n - avg) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / (nums.length - 1));
}

function getPercentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

// =====================================================================
//  FILTER PANEL
// =====================================================================
function onFilterTypeChange() {
  const t = document.getElementById('filterType').value;
  document.getElementById('filterValuesWrap').style.display = t === 'values' ? 'block' : 'none';
  document.getElementById('filterTextWrap').style.display = t === 'text' ? 'block' : 'none';
  document.getElementById('filterNumWrap').style.display = (t === 'gt' || t === 'lt' || t === 'eq') ? 'block' : 'none';
  document.getElementById('filterBetweenWrap').style.display = t === 'between' ? 'block' : 'none';
}

function loadFilterValues() {
  const ci = parseInt(document.getElementById('filterCol').value);
  if (isNaN(ci)) return;
  const values = [...new Set(rawData.map(r => String(r[ci] == null ? '' : r[ci])))].sort();
  const container = document.getElementById('filterValuesList');
  container.innerHTML = values.slice(0, 100).map(v =>
    `<div class="filter-value-item"><input type="checkbox" checked data-val="${escAttr(v)}"><span>${escHtml(v || '(empty)')}</span></div>`
  ).join('');
}

function applyFilter() {
  const ci = parseInt(document.getElementById('filterCol').value);
  const type = document.getElementById('filterType').value;
  if (isNaN(ci)) return;

  let filter = { col: ci, type };
  if (type === 'values') {
    const checked = [...document.querySelectorAll('#filterValuesList input:checked')].map(cb => cb.dataset.val);
    filter.values = checked;
  } else if (type === 'text') {
    filter.text = document.getElementById('filterTextVal').value;
  } else if (type === 'between') {
    filter.from = parseFloat(document.getElementById('filterBetweenFrom').value);
    filter.to = parseFloat(document.getElementById('filterBetweenTo').value);
  } else {
    filter.numVal = document.getElementById('filterNumVal').value;
  }

  activeFilters = activeFilters.filter(f => f.col !== ci);
  activeFilters.push(filter);
  applyAllFilters();
  renderActiveFilters();
  toast('Filter applied', 'success');
}

function applyAllFilters() {
  if (activeFilters.length === 0) {
    filteredData = null;
  } else {
    let indices = rawData.map((_, i) => i);
    for (const f of activeFilters) {
      indices = indices.filter(ri => {
        const val = String(rawData[ri][f.col] == null ? '' : rawData[ri][f.col]);
        const numVal = parseFloat(val);
        switch(f.type) {
          case 'values': return f.values.includes(val);
          case 'text': return val.toLowerCase().includes((f.text || '').toLowerCase());
          case 'gt': return !isNaN(numVal) && numVal > parseFloat(f.numVal);
          case 'lt': return !isNaN(numVal) && numVal < parseFloat(f.numVal);
          case 'eq': return val === f.numVal || (!isNaN(numVal) && numVal === parseFloat(f.numVal));
          case 'between': return !isNaN(numVal) && numVal >= f.from && numVal <= f.to;
          default: return true;
        }
      });
    }
    filteredData = indices;
  }
  renderTableHeader();
  renderTable();
  updateStatus();
}

function clearAllFilters() {
  activeFilters = [];
  filteredData = null;
  renderTableHeader();
  renderTable();
  renderActiveFilters();
  updateStatus();
  toast('All filters cleared', 'success');
}

function removeFilter(idx) {
  activeFilters.splice(idx, 1);
  applyAllFilters();
  renderActiveFilters();
}

function renderActiveFilters() {
  const container = document.getElementById('activeFilters');
  if (activeFilters.length === 0) { container.innerHTML = ''; return; }
  container.innerHTML = '<label style="margin-bottom:6px">Active Filters</label>' + activeFilters.map((f, i) =>
    `<div class="filter-chip">${escHtml(headers[f.col])}: ${f.type} <span class="remove" onclick="removeFilter(${i})">×</span></div>`
  ).join('');
}

// =====================================================================
//  CONDITIONAL FORMATTING
// =====================================================================
function selectCFColor(el) {
  document.querySelectorAll('.color-preset').forEach(p => p.classList.remove('selected'));
  el.classList.add('selected');
  selectedCFColor = el.dataset.color;
  document.getElementById('cfCustomColor').value = selectedCFColor;
}

function addCFRule() {
  const col = parseInt(document.getElementById('cfCol').value);
  const cond = document.getElementById('cfCond').value;
  const value = document.getElementById('cfValue').value;
  const value2 = document.getElementById('cfValue2').value;
  const color = document.getElementById('cfCustomColor').value || selectedCFColor;
  if (isNaN(col)) return;
  cfRules.push({ col, cond, value, value2, color });
  renderCFRules();
  renderTable();
  updateStatus();
  toast('Formatting rule added', 'success');
}

function clearCFRules() {
  cfRules = [];
  renderCFRules();
  renderTable();
  updateStatus();
}

function removeCFRule(idx) {
  cfRules.splice(idx, 1);
  renderCFRules();
  renderTable();
}

function renderCFRules() {
  const container = document.getElementById('cfRulesList');
  if (cfRules.length === 0) { container.innerHTML = '<div style="font-size:12px;color:var(--text-muted)">No rules defined</div>'; return; }
  container.innerHTML = cfRules.map((r, i) =>
    `<div class="cf-rule"><div class="cf-color" style="background:${r.color}"></div><div class="cf-text">${escHtml(headers[r.col])} ${r.cond} ${escHtml(r.value)}${r.cond==='between'?' - '+escHtml(r.value2):''}</div><span class="cf-del" onclick="removeCFRule(${i})">×</span></div>`
  ).join('');
}

