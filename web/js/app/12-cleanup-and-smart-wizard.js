// =====================================================================
//  DATA CLEANUP
// =====================================================================
function removeDuplicates() {
  pushUndo();
  const seen = new Set();
  const before = rawData.length;
  rawData = rawData.filter(row => {
    const key = JSON.stringify(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  filteredData = null;
  showTable();
  toast(`Removed ${before - rawData.length} duplicate rows`, 'success');
}

function removeEmptyRows() {
  pushUndo();
  const before = rawData.length;
  rawData = rawData.filter(row => row.some(c => String(c).trim() !== ''));
  filteredData = null;
  showTable();
  toast(`Removed ${before - rawData.length} empty rows`, 'success');
}

function trimWhitespace() {
  pushUndo();
  rawData = rawData.map(row => row.map(c => String(c).trim()));
  renderTable();
  toast('Trimmed whitespace from all cells', 'success');
}

// =====================================================================
//  SMART CLEANUP WIZARD  (Patch 5)
// =====================================================================
let _wizardIssues = [];
let _wizardExtraCount = 0;

function openCleanupWizard() {
  if (!headers || headers.length === 0) { toast('Import data first / पहले डेटा आयात करें', 'error'); return; }
  const modal = document.getElementById('cleanup-wizard-modal');
  modal.style.display = 'flex';
  const isHi = uiLanguage === 'hi' || uiLanguage === 'bi';
  document.getElementById('wizard-step-label').textContent = isHi ? 'डेटा स्कैन हो रहा है...' : 'Scanning your data...';
  document.getElementById('wizard-scan-results').innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-secondary)">🔍 ' + (isHi ? 'विश्लेषण हो रहा है...' : 'Analyzing...') + '</div>';
  document.getElementById('wizard-fix-all-btn').style.display = 'none';
  setTimeout(runWizardScan, 100);
}

function closeCleanupWizard() {
  document.getElementById('cleanup-wizard-modal').style.display = 'none';
}

function runWizardScan() {
  const issues = [];

  // 1. Duplicate rows
  const rowStrings = rawData.map(r => JSON.stringify(r));
  const dupCount = rowStrings.length - new Set(rowStrings).size;
  if (dupCount > 0) {
    issues.push({
      id: 'duplicates', icon: '📋', severity: 'warning',
      title: `${dupCount} duplicate row${dupCount > 1 ? 's' : ''} found`,
      titleHi: `${dupCount} डुप्लीकेट पंक्तियाँ मिलीं`,
      desc: 'Identical rows that add no new information.',
      descHi: 'एक जैसी पंक्तियाँ जो नई जानकारी नहीं देतीं।',
      fixLabel: 'Remove Duplicates', fixLabelHi: 'डुप्लीकेट हटाएं',
      fixFn: () => {
        const seen = new Set();
        rawData = rawData.filter(row => {
          const key = JSON.stringify(row);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        filteredData = null;
      }
    });
  }

  // 2. Completely empty rows
  const emptyRowCount = rawData.filter(r => r.every(c => c === null || c === undefined || String(c).trim() === '')).length;
  if (emptyRowCount > 0) {
    issues.push({
      id: 'empty_rows', icon: '⬜', severity: 'warning',
      title: `${emptyRowCount} completely empty row${emptyRowCount > 1 ? 's' : ''}`,
      titleHi: `${emptyRowCount} पूरी तरह खाली पंक्तियाँ`,
      desc: 'Rows with no data in any column.',
      descHi: 'ऐसी पंक्तियाँ जिनमें कोई डेटा नहीं।',
      fixLabel: 'Remove Empty Rows', fixLabelHi: 'खाली पंक्तियाँ हटाएं',
      fixFn: () => {
        rawData = rawData.filter(row => row.some(c => String(c).trim() !== ''));
        filteredData = null;
      }
    });
  }

  // 3. Missing values per column (>= 5% threshold)
  headers.forEach((h, ci) => {
    const missing = rawData.filter(r => r[ci] === null || r[ci] === undefined || String(r[ci]).trim() === '').length;
    if (missing === 0) return;
    const pct = Math.round((missing / Math.max(rawData.length, 1)) * 100);
    if (pct < 5) return;
    issues.push({
      id: `missing_${ci}`, icon: '🔴', severity: pct > 30 ? 'error' : 'warning',
      title: `Column "${h}": ${missing} missing values (${pct}%)`,
      titleHi: `"${h}" कॉलम: ${missing} खाली मान (${pct}%)`,
      desc: (pct > 30 ? 'Critical: ' : '') + 'Consider filling or removing blank cells.',
      descHi: (pct > 30 ? 'गंभीर: ' : '') + 'इन खाली सेल को भरना या हटाना विचारें।',
      fixLabel: 'Highlight in Table', fixLabelHi: 'तालिका में दिखाएं',
      fixFn: () => { highlightMissingInColumn(ci); closeCleanupWizard(); }
    });
  });

  // 4. Leading/trailing whitespace
  let wsCount = 0;
  rawData.forEach(row => row.forEach(cell => {
    if (typeof cell === 'string' && cell.trim() !== '' && cell !== cell.trim()) wsCount++;
  }));
  if (wsCount > 0) {
    issues.push({
      id: 'whitespace', icon: '✂️', severity: 'info',
      title: `${wsCount} cell${wsCount > 1 ? 's' : ''} have extra spaces`,
      titleHi: `${wsCount} सेल में अतिरिक्त रिक्त स्थान`,
      desc: 'Leading or trailing spaces cause filter and match failures.',
      descHi: 'अतिरिक्त रिक्त स्थान फ़िल्टर और मिलान में समस्या करते हैं।',
      fixLabel: 'Trim All Whitespace', fixLabelHi: 'सभी रिक्त स्थान हटाएं',
      fixFn: () => {
        rawData = rawData.map(row => row.map(c => typeof c === 'string' ? c.trim() : c));
      }
    });
  }

  // 5. Inconsistent capitalisation in text columns
  headers.forEach((h, ci) => {
    if (colTypes[ci] !== 'text') return;
    const vals = rawData.map(r => String(r[ci] || '').trim()).filter(v => v.length > 0);
    const uniq = new Set(vals);
    const uniqLower = new Set(vals.map(v => v.toLowerCase()));
    if (uniq.size > uniqLower.size) {
      issues.push({
        id: `case_${ci}`, icon: '🔤', severity: 'info',
        title: `Column "${h}": inconsistent capitalisation`,
        titleHi: `"${h}" कॉलम: असंगत अक्षर आकार`,
        desc: 'Same value written in different cases causes grouping errors.',
        descHi: 'एक ही मान अलग-अलग तरीके से लिखा — समूहीकरण में त्रुटि।',
        fixLabel: 'Standardise to Title Case', fixLabelHi: 'टाइटल केस में बदलें',
        fixFn: () => {
          if (colTypes[ci] !== 'text') return;
          rawData.forEach((row, ri) => {
            if (typeof row[ci] === 'string' && row[ci].trim()) {
              rawData[ri][ci] = row[ci].trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
            }
          });
        }
      });
    }
  });

  // Cap at 8 issues
  const top = issues.slice(0, 8);
  _wizardIssues = top;
  _wizardExtraCount = issues.length - top.length;
  renderWizardResults();
}

function renderWizardResults() {
  const isHi = uiLanguage === 'hi' || uiLanguage === 'bi';
  const container = document.getElementById('wizard-scan-results');
  const label = document.getElementById('wizard-step-label');
  const fixAllBtn = document.getElementById('wizard-fix-all-btn');

  if (_wizardIssues.length === 0) {
    label.textContent = isHi ? 'डेटा बिल्कुल साफ है!' : 'Your data looks clean!';
    container.innerHTML = `<div style="text-align:center;padding:32px">
      <div style="font-size:48px;margin-bottom:12px">✅</div>
      <div style="font-weight:700;font-size:16px;color:var(--success)">${isHi ? 'डेटा साफ है!' : 'Data is Clean!'}</div>
      <div style="font-size:13px;color:var(--text-secondary);margin-top:6px">${isHi ? 'कोई समस्या नहीं मिली।' : 'No issues detected in your dataset.'}</div>
    </div>`;
    fixAllBtn.style.display = 'none';
    return;
  }

  label.textContent = isHi ? `${_wizardIssues.length} समस्याएं मिलीं` : `${_wizardIssues.length} issue${_wizardIssues.length > 1 ? 's' : ''} found`;
  fixAllBtn.style.display = 'inline-flex';

  const sColor = { error: 'var(--danger)', warning: 'var(--warning)', info: 'var(--info)' };
  const rows = _wizardIssues.map(issue => `
    <div style="border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px;border-left:3px solid ${sColor[issue.severity] || 'var(--border)'}">
      <div style="display:flex;align-items:flex-start;gap:10px">
        <div style="font-size:20px;flex-shrink:0">${issue.icon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:13px;color:var(--text-primary)">${escHtml(isHi ? issue.titleHi : issue.title)}</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:3px">${escHtml(isHi ? issue.descHi : issue.desc)}</div>
        </div>
        <button class="tb-btn" style="flex-shrink:0;font-size:11px;padding:4px 10px;margin-left:4px" onclick="applyWizardFix('${issue.id}')">
          ${escHtml(isHi ? issue.fixLabelHi : issue.fixLabel)}
        </button>
      </div>
    </div>`).join('');

  const extra = _wizardExtraCount > 0
    ? `<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:4px 0 8px">${isHi ? `... और ${_wizardExtraCount} समस्याएं हैं` : `...and ${_wizardExtraCount} more issue${_wizardExtraCount > 1 ? 's' : ''}`}</div>`
    : '';

  container.innerHTML = rows + extra;
}

function applyWizardFix(issueId) {
  const issue = _wizardIssues.find(x => x.id === issueId);
  if (!issue) return;
  pushUndo();
  try { issue.fixFn?.(); } catch(e) { console.warn('Wizard fix error:', e); }
  showTable();
  updateStatus();
  const isHi = uiLanguage === 'hi' || uiLanguage === 'bi';
  toast((isHi ? issue.fixLabelHi : issue.fixLabel) + (isHi ? ' — हो गया' : ' done'), 'success');
  setTimeout(runWizardScan, 80);
}

function wizardFixAll() {
  if (_wizardIssues.length === 0) return;
  pushUndo();
  _wizardIssues.forEach(issue => {
    try { issue.fixFn?.(); } catch(e) { console.warn('Wizard fix error:', e); }
  });
  showTable();
  updateStatus();
  const isHi = uiLanguage === 'hi' || uiLanguage === 'bi';
  toast(isHi ? `${_wizardIssues.length} समस्याएं ठीक हुईं` : `Fixed ${_wizardIssues.length} issues`, 'success');
  closeCleanupWizard();
}

function highlightMissingInColumn(ci) {
  cfRules = cfRules.filter(r => r.col !== ci);
  cfRules.push({ col: ci, cond: 'eq', value: '', color: '#f59e0b' });
  renderCFRules();
  renderTable();
  updateStatus();
  const isHi = uiLanguage === 'hi' || uiLanguage === 'bi';
  toast(isHi ? `"${headers[ci]}" में खाली सेल हाइलाइट हुए` : `Missing values in "${headers[ci]}" highlighted`, 'info');
}

// =====================================================================
//  AI INTELLIGENCE ENGINE  (Patch 6)
// =====================================================================
// ══════════════════════════════════════════════════════════════════════
// PATCH 9 — Ollama Local AI Status + Chat
