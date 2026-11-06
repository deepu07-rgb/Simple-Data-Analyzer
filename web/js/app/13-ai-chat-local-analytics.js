// ══════════════════════════════════════════════════════════════════════

let _ollamaModel = null;
let _ollamaOnline = false;

async function checkOllamaStatus() {
  const badge     = document.getElementById('ollama-status-badge');
  const indicator = document.getElementById('chat-api-indicator');
  try {
    const res  = await fetch('/api/ollama/status');
    const data = await res.json();
    _ollamaOnline = data.status === 'running';
    _ollamaModel  = data.model || 'qwen2.5:7b';
    if (_ollamaOnline) {
      const label = '🤖 ' + _ollamaModel;
      if (badge)     { badge.textContent = label; badge.classList.add('active'); }
      if (indicator) { indicator.textContent = label; indicator.style.borderColor = 'var(--accent)'; indicator.style.color = 'var(--accent)'; }
    } else {
      if (badge)     { badge.textContent = '🤖 AI Offline'; badge.classList.remove('active'); }
      if (indicator) { indicator.textContent = '🤖 Local Mode'; indicator.style.borderColor = ''; indicator.style.color = ''; }
    }
  } catch {
    _ollamaOnline = false;
    if (badge)     { badge.textContent = '🤖 AI Offline'; badge.classList.remove('active'); }
    if (indicator) { indicator.textContent = '🤖 Local Mode'; indicator.style.borderColor = ''; indicator.style.color = ''; }
  }
}

function clearAIChat() {
  document.getElementById('ai-response-area').style.display = 'none';
  document.getElementById('ai-query-input').value = '';
  _aiQueryHistory.length = 0;
  renderAIHistory();
}
function clearAIChat() {
  document.getElementById('ai-response-area').style.display = 'none';
  document.getElementById('ai-query-input').value = '';
  _aiQueryHistory.length = 0;
  renderAIHistory();
}

// ──────────────────────────────────────────────────────────────────────
// LOCAL ANALYTICS ENGINE  (works 100% offline, no API needed)
// ──────────────────────────────────────────────────────────────────────
function _isHindi(text) { return /[ऀ-ॿ]/.test(text); }

function _numCols() { return headers.reduce((a,h,i) => { if(colTypes[i]==='number') a.push(i); return a; }, []); }
function _textCols() { return headers.reduce((a,h,i) => { if(colTypes[i]!=='number') a.push(i); return a; }, []); }
function _colValues(ci) {
  const rows = getDisplayData();
  return rows.map(ri => rawData[ri][ci]).filter(v => v !== '' && v !== null && v !== undefined);
}
function _numValues(ci) { return _colValues(ci).map(Number).filter(v => !isNaN(v)); }

function _mean(arr) { return arr.length ? arr.reduce((s,v)=>s+v,0)/arr.length : 0; }
function _median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a,b)=>a-b);
  const m = Math.floor(s.length/2);
  return s.length%2 ? s[m] : (s[m-1]+s[m])/2;
}
function _stddev(arr) {
  const m = _mean(arr);
  return Math.sqrt(arr.reduce((s,v)=>s+(v-m)**2,0)/arr.length);
}
function _percentile(arr, p) {
  const s = [...arr].sort((a,b)=>a-b);
  const idx = (p/100)*(s.length-1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return s[lo] + (s[hi]-s[lo])*(idx-lo);
}

function guessColIndex(query, preferNumeric) {
  const q = query.toLowerCase();
  // try to find a column name mentioned in query
  let best = -1;
  headers.forEach((h, i) => {
    if (q.includes(h.toLowerCase())) best = i;
  });
  if (best >= 0) return best;
  // fallback: first numeric or first text col
  if (preferNumeric) return _numCols()[0] ?? -1;
  return _textCols()[0] ?? -1;
}

function localSummarize() {
  const rows = getDisplayData();
  const numC = _numCols();
  const txtC = _textCols();
  let html = `<b>Dataset Overview / डेटासेट सारांश</b><br>
    Rows / पंक्तियाँ: <b>${rows.length}</b> &nbsp;|&nbsp; Columns / कॉलम: <b>${headers.length}</b><br><br>`;

  if (numC.length) {
    html += '<b>Numeric Columns / संख्यात्मक कॉलम:</b><table class="local-tbl"><tr><th>Column</th><th>Min</th><th>Max</th><th>Mean / औसत</th><th>Median</th></tr>';
    numC.forEach(ci => {
      const vals = _numValues(ci);
      if (!vals.length) return;
      html += `<tr><td>${escHtml(headers[ci])}</td><td>${Math.min(...vals).toLocaleString('en-IN')}</td><td>${Math.max(...vals).toLocaleString('en-IN')}</td><td>${_mean(vals).toFixed(2)}</td><td>${_median(vals).toFixed(2)}</td></tr>`;
    });
    html += '</table><br>';
  }
  if (txtC.length) {
    html += '<b>Text Columns / पाठ कॉलम:</b><table class="local-tbl"><tr><th>Column</th><th>Unique Values</th><th>Top Value</th></tr>';
    txtC.slice(0,5).forEach(ci => {
      const vals = _colValues(ci).map(String);
      const freq = {};
      vals.forEach(v => freq[v] = (freq[v]||0)+1);
      const top = Object.entries(freq).sort((a,b)=>b[1]-a[1])[0];
      html += `<tr><td>${escHtml(headers[ci])}</td><td>${Object.keys(freq).length}</td><td>${top ? escHtml(top[0]) + ' ('+top[1]+'×)' : '—'}</td></tr>`;
    });
    html += '</table>';
  }
  return { html, label: '📊 Local Analysis', intent: null };
}

function localFindOutliers(colIdx) {
  if (colIdx < 0) colIdx = _numCols()[0] ?? -1;
  if (colIdx < 0) return { html: 'No numeric columns found / कोई संख्यात्मक कॉलम नहीं', label: '📊 Local Analysis', intent: null };
  const vals = _numValues(colIdx);
  if (!vals.length) return { html: 'No numeric data in this column', label: '📊 Local Analysis', intent: null };
  const q1 = _percentile(vals, 25), q3 = _percentile(vals, 75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5*iqr, hi = q3 + 1.5*iqr;
  const rows = getDisplayData();
  const outlierRows = rows.filter(ri => {
    const v = Number(rawData[ri][colIdx]);
    return !isNaN(v) && (v < lo || v > hi);
  });
  if (!outlierRows.length) return { html: `No outliers found in <b>${escHtml(headers[colIdx])}</b> (IQR method) / कोई असामान्य मान नहीं मिला`, label: '📊 Local Analysis', intent: null };
  let html = `<b>Outliers in ${escHtml(headers[colIdx])} / असामान्य मान</b> (IQR: ${iqr.toFixed(1)}, Range: ${lo.toFixed(1)} – ${hi.toFixed(1)})<br>
    Found <b>${outlierRows.length}</b> outlier rows:<br><br>
    <table class="local-tbl"><tr><th>Row</th><th>${escHtml(headers[colIdx])}</th></tr>`;
  outlierRows.slice(0,15).forEach(ri => {
    html += `<tr><td>${ri+1}</td><td>${rawData[ri][colIdx]}</td></tr>`;
  });
  if (outlierRows.length > 15) html += `<tr><td colspan="2">…and ${outlierRows.length-15} more</td></tr>`;
  html += '</table>';
  return { html, label: '📊 Local Analysis', intent: 'highlight',
    action: { column: headers[colIdx], operator: '>', value: hi.toFixed(1), color: '#f59e0b' } };
}

function localCorrelation() {
  const numC = _numCols();
  if (numC.length < 2) return { html: 'Need at least 2 numeric columns for correlation / सहसंबंध के लिए 2 संख्यात्मक कॉलम चाहिए', label: '📊 Local Analysis', intent: null };
  const rows = getDisplayData();
  const pairs = [];
  for (let a = 0; a < numC.length; a++) {
    for (let b = a+1; b < numC.length; b++) {
      const ci = numC[a], cj = numC[b];
      const xs = [], ys = [];
      rows.forEach(ri => {
        const x = Number(rawData[ri][ci]), y = Number(rawData[ri][cj]);
        if (!isNaN(x) && !isNaN(y)) { xs.push(x); ys.push(y); }
      });
      if (xs.length < 3) continue;
      const mx = _mean(xs), my = _mean(ys);
      const num = xs.reduce((s,x,i) => s+(x-mx)*(ys[i]-my), 0);
      const den = Math.sqrt(xs.reduce((s,x)=>s+(x-mx)**2,0) * ys.reduce((s,y)=>s+(y-my)**2,0));
      const r = den ? num/den : 0;
      pairs.push({ a: headers[ci], b: headers[cj], r });
    }
  }
  pairs.sort((a,b) => Math.abs(b.r)-Math.abs(a.r));
  let html = '<b>Correlation Matrix / सहसंबंध</b><br><table class="local-tbl"><tr><th>Column A</th><th>Column B</th><th>r</th><th>Strength</th></tr>';
  pairs.slice(0,8).forEach(p => {
    const abs = Math.abs(p.r);
    const str = abs > .8 ? '🔴 Strong' : abs > .5 ? '🟡 Moderate' : '🟢 Weak';
    html += `<tr><td>${escHtml(p.a)}</td><td>${escHtml(p.b)}</td><td><b>${p.r.toFixed(3)}</b></td><td>${str}</td></tr>`;
  });
  html += '</table>';
  return { html, label: '📊 Local Analysis', intent: null };
}

function localTrend(colIdx) {
  if (colIdx < 0) colIdx = _numCols()[0] ?? -1;
  if (colIdx < 0) return { html: 'No numeric column found', label: '📊 Local Analysis', intent: null };
  const vals = _numValues(colIdx);
  if (vals.length < 3) return { html: 'Need at least 3 data points for trend analysis', label: '📊 Local Analysis', intent: null };
  const n = vals.length;
  const xs = vals.map((_, i) => i);
  const mx = _mean(xs), my = _mean(vals);
  const slope = xs.reduce((s,x,i)=>s+(x-mx)*(vals[i]-my),0) / xs.reduce((s,x)=>s+(x-mx)**2,0);
  const intercept = my - slope*mx;
  const predicted = xs.map(x => slope*x + intercept);
  const ssTot = vals.reduce((s,v)=>s+(v-my)**2,0);
  const ssRes = vals.reduce((s,v,i)=>s+(v-predicted[i])**2,0);
  const r2 = ssTot ? 1-ssRes/ssTot : 0;
  const dir = slope > 0 ? '📈 Increasing / बढ़ रहा है' : slope < 0 ? '📉 Decreasing / घट रहा है' : '➡️ Flat / स्थिर';
  const html = `<b>Trend in ${escHtml(headers[colIdx])} / रुझान</b><br>
    Direction: <b>${dir}</b><br>
    Slope: <b>${slope.toFixed(4)}</b> per row &nbsp;|&nbsp; R²: <b>${r2.toFixed(3)}</b><br>
    First value: <b>${vals[0].toLocaleString('en-IN')}</b> &nbsp;→&nbsp; Last value: <b>${vals[n-1].toLocaleString('en-IN')}</b><br>
    Change: <b>${(vals[n-1]-vals[0] >= 0 ? '+' : '') + (vals[n-1]-vals[0]).toLocaleString('en-IN')}</b>`;
  return { html, label: '📊 Local Analysis', intent: null };
}

function localTopN(query, dir) {
  const m = query.match(/\b(\d+)\b/);
  const n = m ? parseInt(m[1]) : 10;
  const ci = guessColIndex(query, true);
  if (ci < 0) return { html: 'Specify a column name in your query', label: '📊 Local Analysis', intent: null };
  const rows = getDisplayData();
  const sorted = [...rows].sort((a,b) => {
    const va = Number(rawData[a][ci])||0, vb = Number(rawData[b][ci])||0;
    return dir === 'top' ? vb-va : va-vb;
  });
  const top = sorted.slice(0, n);
  const label = dir === 'top' ? `Top ${n}` : `Bottom ${n}`;
  let html = `<b>${label} by ${escHtml(headers[ci])}</b><table class="local-tbl"><tr>`;
  headers.slice(0,5).forEach(h => html += `<th>${escHtml(h)}</th>`);
  html += '</tr>';
  top.forEach(ri => {
    html += '<tr>';
    headers.slice(0,5).forEach((_,i) => html += `<td>${escHtml(String(rawData[ri][i]??''))}</td>`);
    html += '</tr>';
  });
  html += '</table>';
  // Also apply sort action
  return { html, label: '📊 Local Analysis', intent: 'sort',
    action: { column: headers[ci], direction: dir === 'top' ? 'desc' : 'asc' } };
}

function localAggregate(query, func) {
  const ci = guessColIndex(query, true);
  if (ci < 0) return { html: 'Specify a numeric column / संख्यात्मक कॉलम बताएं', label: '📊 Local Analysis', intent: null };
  const vals = _numValues(ci);
  if (!vals.length) return { html: `No numeric values in "${escHtml(headers[ci])}"`, label: '📊 Local Analysis', intent: null };
  const result = func === 'sum' ? vals.reduce((s,v)=>s+v,0) : _mean(vals);
  const label = func === 'sum' ? 'Total / योग' : 'Average / औसत';
  const html = `<b>${label} of ${escHtml(headers[ci])}</b><br>
    <span style="font-size:20px;font-weight:800;color:var(--accent)">${result.toLocaleString('en-IN', {maximumFractionDigits:2})}</span><br>
    (${vals.length} values / मान)`;
  return { html, label: '📊 Local Analysis', intent: null };
}

function localGroupBy(query) {
  const txtC = _textCols();
  const numC = _numCols();
  if (!txtC.length || !numC.length) return { html: 'Need at least one text and one numeric column for group-by', label: '📊 Local Analysis', intent: null };
  const grpCol = guessColIndex(query, false) >= 0 ? guessColIndex(query, false) : txtC[0];
  const valCol = guessColIndex(query, true) >= 0 ? guessColIndex(query, true) : numC[0];
  const rows = getDisplayData();
  const groups = {};
  rows.forEach(ri => {
    const k = String(rawData[ri][grpCol] || '(blank)');
    const v = Number(rawData[ri][valCol]);
    if (!groups[k]) groups[k] = { sum:0, count:0 };
    if (!isNaN(v)) { groups[k].sum += v; groups[k].count++; }
  });
  const entries = Object.entries(groups).sort((a,b) => b[1].sum-a[1].sum);
  let html = `<b>Group by ${escHtml(headers[grpCol])} → ${escHtml(headers[valCol])}</b>
    <table class="local-tbl"><tr><th>${escHtml(headers[grpCol])}</th><th>Count / गिनती</th><th>Sum / योग</th><th>Average / औसत</th></tr>`;
  entries.forEach(([k, v]) => {
    html += `<tr><td>${escHtml(k)}</td><td>${v.count}</td><td>${v.sum.toLocaleString('en-IN',{maximumFractionDigits:1})}</td><td>${v.count?_mean(Array(v.count).fill(0).map((_,i)=>v.sum/v.count)).toFixed(1):'—'}</td></tr>`;
  });
  html += '</table>';
  return { html, label: '📊 Local Analysis', intent: null };
}

function localMissingAnalysis() {
  const rows = getDisplayData();
  let html = '<b>Missing Value Analysis / खाली मान विश्लेषण</b><table class="local-tbl"><tr><th>Column</th><th>Missing / खाली</th><th>% Missing</th><th>Filled / भरे</th></tr>';
  headers.forEach((h, ci) => {
    const miss = rows.filter(ri => rawData[ri][ci]==='' || rawData[ri][ci]===null || rawData[ri][ci]===undefined).length;
    const pct = rows.length ? (miss/rows.length*100).toFixed(1) : 0;
    html += `<tr><td>${escHtml(h)}</td><td>${miss}</td><td>${pct}%</td><td>${rows.length-miss}</td></tr>`;
  });
  html += '</table>';
  return { html, label: '📊 Local Analysis', intent: null };
}

function localDuplicateCheck() {
  const rows = getDisplayData();
  const seen = new Map();
  rows.forEach(ri => {
    const key = rawData[ri].join('|');
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(ri);
  });
  const dups = [...seen.values()].filter(g => g.length > 1);
  if (!dups.length) return { html: '✅ No duplicate rows found / कोई डुप्लीकेट पंक्तियाँ नहीं', label: '📊 Local Analysis', intent: null };
  let html = `<b>Duplicate Rows / डुप्लीकेट पंक्तियाँ</b><br>Found <b>${dups.length}</b> duplicate groups (${dups.reduce((s,g)=>s+g.length,0)} rows total):<br><br>
    <table class="local-tbl"><tr><th>Row Numbers</th><th>Count</th></tr>`;
  dups.slice(0,8).forEach(g => { html += `<tr><td>${g.map(r=>r+1).join(', ')}</td><td>${g.length}</td></tr>`; });
  if (dups.length > 8) html += `<tr><td colspan="2">…and ${dups.length-8} more groups</td></tr>`;
  html += '</table>';
  return { html, label: '📊 Local Analysis', intent: null };
}

function localCount(query) {
  const rows = getDisplayData();
  const ci = guessColIndex(query, false);
  if (ci < 0) {
    return { html: `<b>Total rows / कुल पंक्तियाँ: ${rows.length}</b>`, label: '📊 Local Analysis', intent: null };
  }
  const freq = {};
  rows.forEach(ri => { const v = String(rawData[ri][ci]||''); freq[v] = (freq[v]||0)+1; });
  const entries = Object.entries(freq).sort((a,b)=>b[1]-a[1]);
  let html = `<b>Count by ${escHtml(headers[ci])}</b><table class="local-tbl"><tr><th>${escHtml(headers[ci])}</th><th>Count / गिनती</th></tr>`;
  entries.slice(0,15).forEach(([k,v]) => { html += `<tr><td>${escHtml(k)}</td><td>${v}</td></tr>`; });
  if (entries.length > 15) html += `<tr><td colspan="2">…and ${entries.length-15} more</td></tr>`;
  html += '</table>';
  return { html, label: '📊 Local Analysis', intent: null };
}

function runLocalQuery(query) {
  const q = query.toLowerCase();
  const hi = _isHindi(query);
  // Pattern matching (EN + Hindi)
  if (/सारांश|विवरण|जानकारी|summar|describ|overview|profile|snapshot|बताओ/.test(q))
    return localSummarize();
  if (/असामान्य|अजीब|outlier|anomal|unusual|extreme/.test(q))
    return localFindOutliers(guessColIndex(query, true));
  if (/सहसंबंध|correlat|relation|associat/.test(q))
    return localCorrelation();
  if (/ट्रेंड|रुझान|trend|growing|declining|increase|decreas/.test(q))
    return localTrend(guessColIndex(query, true));
  if (/शीर्ष|सर्वाधिक|top|highest|biggest|most|maximum/.test(q))
    return localTopN(query, 'top');
  if (/सबसे कम|न्यूनतम|bottom|lowest|smallest|least|minimum/.test(q))
    return localTopN(query, 'bottom');
  if (/कुल|योग|total|sum\b/.test(q))
    return localAggregate(query, 'sum');
  if (/औसत|mean|average|avg/.test(q))
    return localAggregate(query, 'mean');
  if (/खाली|रिक्त|लापता|missing|blank|empty|null/.test(q))
    return localMissingAnalysis();
  if (/डुप्लीकेट|दोहराव|duplicat|repeat/.test(q))
    return localDuplicateCheck();
  if (/समूह|विभागवार|group|by department|category/.test(q))
    return localGroupBy(query);
  if (/गिनती|कितने|count|how many|number of/.test(q))
    return localCount(query);
  // Fallback: summarize
  return {
    html: hi
      ? `क्षमा करें, यह क्वेरी समझ नहीं आई। यहाँ डेटासेट का सारांश है:<br><br>` + localSummarize().html
      : `Could not understand the specific query. Here is a dataset summary:<br><br>` + localSummarize().html,
    label: '📊 Local Analysis', intent: null
  };
}

// ── History ──
const _aiQueryHistory = [];

function renderAIHistory() {
  const list = document.getElementById('ai-history-list');
  if (!list) return;
  if (!_aiQueryHistory.length) {
    list.innerHTML = '<div style="font-size:11px;color:var(--text-muted)">No queries yet / अभी तक कोई क्वेरी नहीं</div>';
    return;
  }
  list.innerHTML = _aiQueryHistory.map(h => `
    <div onclick="document.getElementById('ai-query-input').value=${JSON.stringify(h.query)};"
      style="font-size:11px;padding:5px 8px;border-radius:6px;cursor:pointer;color:var(--text-secondary);border:1px solid var(--border);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:.15s"
      onmouseover="this.style.background='var(--bg-primary)'"
      onmouseout="this.style.background=''">
      🕐 ${escHtml(h.query)}
    </div>`).join('');
}

function buildAISuggestions() {
  const chips = document.getElementById('ai-suggestion-chips');
  if (!chips || !headers.length) return;
  const numCols = headers.filter((_, i) => colTypes[i] === 'number');
  const textCols = headers.filter((_, i) => colTypes[i] !== 'number');
  const suggestions = ['Summarize dataset / डेटा का सारांश दो'];
  if (numCols.length) {
    suggestions.push(`Top 10 by ${numCols[0]}`);
    suggestions.push(`${numCols[0]} का औसत`);
    suggestions.push(`Find outliers in ${numCols[0]}`);
  }
  if (textCols.length) suggestions.push(`Group by ${textCols[0]}`);
  suggestions.push('Show missing values / खाली मान दिखाओ');
  suggestions.push('Correlation / सहसंबंध');
  chips.innerHTML = suggestions.slice(0,7).map(s => `
    <span onclick="document.getElementById('ai-query-input').value=${JSON.stringify(s)};runAIQuery();"
      style="font-size:11px;background:var(--accent-light);color:var(--accent);padding:4px 9px;border-radius:99px;cursor:pointer;border:1px solid var(--accent);display:inline-block;transition:.15s"
      onmouseover="this.style.background='var(--accent)';this.style.color='#fff'"
      onmouseout="this.style.background='var(--accent-light)';this.style.color='var(--accent)'">${escHtml(s)}</span>`).join('');
}

// ── Main query function (tries Ollama first, falls back to local engine) ──
async function runAIQuery() {
  const input = document.getElementById('ai-query-input');
  const query = (input?.value || '').trim();
  if (!query) { toast('Enter a question first / पहले प्रश्न लिखें', 'error'); return; }
  if (!headers.length) { toast('Import data first / पहले डेटा आयात करें', 'error'); return; }

  const responseArea  = document.getElementById('ai-response-area');
  const explanationEl = document.getElementById('ai-explanation-text');
  const sourceEl      = document.getElementById('ai-source-label');
  const actionBtns    = document.getElementById('ai-action-buttons');
  const outLang       = document.getElementById('chat-out-lang')?.value || 'auto';

  responseArea.style.display = 'block';
  if (explanationEl) explanationEl.innerHTML = '<span style="color:var(--text-muted)">🤖 Thinking / सोच रहा हूँ…</span>';
  if (actionBtns) actionBtns.innerHTML = '';

  if (_ollamaOnline) {
    // ── Cognition Engine path (Batch 19) ──
    try {
      if (sourceEl) { sourceEl.className = 'response-source api-src'; sourceEl.textContent = '🧠 ' + (_ollamaModel || 'AI') + ' · Cognition'; }
      if (explanationEl) explanationEl.innerHTML = '<span style="color:var(--text-muted)">🧠 Decomposing &amp; grounding… / विश्लेषण हो रहा है…</span>';
      const cogResult = await DD.cognition.run(query);
      if (explanationEl) explanationEl.innerHTML = '<span style="color:var(--text-muted)">🔍 Verifying… / सत्यापन हो रहा है…</span>';
      const verResult = await DD.cognition.verify(cogResult);
      if (explanationEl) explanationEl.innerHTML = '<span style="color:var(--text-muted)">✏ Styling… / रूप दे रहे हैं…</span>';
      const finalResult = await DD.cognition.tone(verResult);
      _aiQueryHistory.unshift({ query, time: new Date().toLocaleTimeString() });
      if (_aiQueryHistory.length > 5) _aiQueryHistory.pop();
      renderAIHistory();
      const isHi = (window.DD && DD.lang === 'hi') || outLang === 'hi';
      if (explanationEl) explanationEl.innerHTML = _cogRenderSteps(finalResult, isHi);
      return;
    } catch (err) {
      _ollamaOnline = false;
      checkOllamaStatus();
      if (sourceEl) { sourceEl.className = 'response-source local'; sourceEl.textContent = '⚠️ AI Unavailable — Local Fallback'; }
      const local = runLocalQuery(query);
      if (explanationEl) explanationEl.innerHTML = `<span style="color:var(--warning);font-size:11px">AI error: ${escHtml(err.message)}</span><br><br>` + local.html;
      _showLocalActions(local, actionBtns);
      return;
    }
  }

  // ── Local engine (Ollama offline) ──
  if (sourceEl) { sourceEl.className = 'response-source local'; sourceEl.textContent = '📊 Local Analysis (Offline)'; }
  const local = runLocalQuery(query);
  if (explanationEl) explanationEl.innerHTML = local.html;
  _showLocalActions(local, actionBtns);
  _aiQueryHistory.unshift({ query, time: new Date().toLocaleTimeString() });
  if (_aiQueryHistory.length > 5) _aiQueryHistory.pop();
  renderAIHistory();
}

function _showLocalActions(local, actionBtns) {
  if (!actionBtns || !local.intent) return;
  const btn = document.createElement('button');
  btn.className = 'tb-btn primary';
  btn.style.cssText = 'width:100%;justify-content:center;height:34px;margin-top:6px';
  btn.textContent = '✅ Apply to Table / तालिका पर लागू करें';
  btn.onclick = () => applyAIAction({ intent: local.intent, action: local.action });
  actionBtns.appendChild(btn);
}

function applyAIAction(result) {
  const { intent, action } = result;
  if (!action) { toast('No action to apply', 'warning'); return; }
  const colName = action.column || action.col || '';
  const colIdx = headers.indexOf(colName);

  switch (intent) {
    case 'filter': {
      if (colIdx < 0) { toast(`Column "${colName}" not found`, 'error'); return; }
      const opMap = { '>': 'gt', '<': 'lt', '=': 'eq', 'contains': 'text', 'between': 'between', 'gt':'gt','lt':'lt','eq':'eq','neq':'neq' };
      const fType = opMap[action.operator] || 'text';
      const f = { col: colIdx, type: fType };
      if (fType === 'text') f.text = String(action.value);
      else if (fType === 'between') { f.from = parseFloat(action.from||action.value); f.to = parseFloat(action.to||action.value2); }
      else f.numVal = String(action.value);
      activeFilters = activeFilters.filter(x => x.col !== colIdx);
      activeFilters.push(f);
      applyAllFilters(); renderActiveFilters();
      toast('Filter applied ✓', 'success'); break;
    }
    case 'sort': {
      const ci = colIdx >= 0 ? colIdx : headers.indexOf(action.column||'');
      if (ci < 0) { toast(`Column "${colName}" not found`, 'error'); return; }
      sortCol = ci; sortDir = action.direction === 'desc' ? 'desc' : 'asc';
      renderTableHeader(); renderTable();
      toast(`Sorted by ${headers[ci]} (${sortDir}) ✓`, 'success'); break;
    }
    case 'stats': {
      if (colIdx < 0) { toast(`Column "${colName}" not found`, 'error'); return; }
      switchTool('analysis');
      setTimeout(() => { const sel = document.getElementById('analysisCol'); if (sel) { sel.value = colIdx; runAnalysis(); } }, 350);
      break;
    }
    case 'highlight': {
      if (colIdx < 0) { toast(`Column "${colName}" not found`, 'error'); return; }
      const condMap = { '>': 'gt', '<': 'lt', '=': 'eq', 'contains': 'contains', 'gt':'gt','lt':'lt','eq':'eq' };
      const cond = condMap[action.operator||action.condition] || 'gt';
      cfRules = cfRules.filter(r => r.col !== colIdx);
      cfRules.push({ col: colIdx, cond, value: String(action.value), color: action.color || '#f59e0b' });
      renderCFRules(); renderTable(); updateStatus();
      toast(`"${headers[colIdx]}" highlighted ✓`, 'success'); break;
    }
    case 'chart': {
      const xIdx = headers.indexOf(action.xColumn || action.xCol || '');
      const yIdx = headers.indexOf(action.yColumn || action.yCol || '');
      if (xIdx < 0 || yIdx < 0) { toast('Chart column not found', 'error'); return; }
      switchTool('chart');
      setTimeout(() => {
        chartXCol = xIdx; chartYCol = yIdx;
        const typeEl = document.getElementById('chartType');
        if (typeEl) typeEl.value = action.chartType || action.type || 'bar';
        const xSlot = document.getElementById('xSlotField');
        const ySlot = document.getElementById('ySlotField');
        if (xSlot) xSlot.innerHTML = `<span class="slot-field">${escHtml(headers[xIdx])}</span>`;
        if (ySlot) ySlot.innerHTML = `<span class="slot-field">${escHtml(headers[yIdx])}</span>`;
        buildChart();
      }, 400);
      toast('Chart created ✓', 'success'); break;
    }
    default: toast('Could not apply action automatically', 'warning');
  }
}

function convertToUpperCase() {
  const ci = parseInt(document.getElementById('colOpsCol')?.value || document.getElementById('analysisCol')?.value);
  if (isNaN(ci)) { toast('Select a column first', 'error'); return; }
  pushUndo();
  rawData.forEach(row => { row[ci] = String(row[ci] == null ? '' : row[ci]).toUpperCase(); });
  renderTable();
  toast(`Converted ${headers[ci]} to uppercase`, 'success');
}

function convertToLowerCase() {
  const ci = parseInt(document.getElementById('colOpsCol')?.value || document.getElementById('analysisCol')?.value);
  if (isNaN(ci)) { toast('Select a column first', 'error'); return; }
  pushUndo();
  rawData.forEach(row => { row[ci] = String(row[ci] == null ? '' : row[ci]).toLowerCase(); });
  renderTable();
  toast(`Converted ${headers[ci]} to lowercase`, 'success');
}

function findReplace() {
  const find = document.getElementById('findVal').value;
  const replace = document.getElementById('replaceVal').value;
  const col = document.getElementById('findCol').value;
  if (!find) { toast('Enter text to find', 'error'); return; }
  pushUndo();
  let count = 0;
  rawData.forEach(row => {
    const cols = col === 'all' ? headers.map((_, i) => i) : [parseInt(col)];
    cols.forEach(ci => {
      const v = String(row[ci] == null ? '' : row[ci]);
      if (v.includes(find)) {
        row[ci] = v.split(find).join(replace);
        count++;
      }
    });
  });
  renderTable();
  toast(`Replaced ${count} occurrence(s)`, 'success');
}

