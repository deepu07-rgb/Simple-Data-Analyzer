// ══════════════════════════════════════════════════════════════
// PATCH 10 — Report Generator / रिपोर्ट जनरेटर
// ══════════════════════════════════════════════════════════════
let _reportLogoB64 = null;

function initReportPanel() {
  // Auto-fill title from document name
  const titleInp = document.getElementById('reportTitle');
  if (titleInp && !titleInp.value) {
    const dn = document.getElementById('documentName');
    if (dn && dn.textContent && dn.textContent !== 'Untitled Analysis') {
      titleInp.value = dn.textContent;
    }
  }
  // AI availability
  const aiChk = document.getElementById('reportIncludeAI');
  const aiStat = document.getElementById('reportAIStatus');
  if (aiChk && aiStat) {
    aiChk.disabled = !_ollamaOnline;
    aiStat.textContent = _ollamaOnline
      ? (_ollamaModel || 'qwen2.5:7b') + ' ready'
      : 'Ollama offline';
    aiStat.style.color = _ollamaOnline ? 'var(--success)' : 'var(--text-muted)';
  }
  updateReportCoverPreview();
}

function reportHandleLogoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('Please select an image file (PNG/JPG)', 'error'); return; }
  if (file.size > 2 * 1024 * 1024) { toast('Logo must be under 2 MB', 'error'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    _reportLogoB64 = ev.target.result;
    const prev = document.getElementById('reportLogoPreview');
    const hint = document.getElementById('reportLogoHint');
    if (prev) { prev.src = _reportLogoB64; prev.style.display = 'block'; }
    if (hint) hint.style.display = 'none';
    const clrBtn = document.getElementById('reportLogoClearBtn');
    if (clrBtn) clrBtn.style.display = 'inline-flex';
    updateReportCoverPreview();
  };
  reader.readAsDataURL(file);
}

function clearReportLogo() {
  _reportLogoB64 = null;
  const prev = document.getElementById('reportLogoPreview');
  const hint = document.getElementById('reportLogoHint');
  if (prev) { prev.src = ''; prev.style.display = 'none'; }
  if (hint) hint.style.display = 'flex';
  const clrBtn = document.getElementById('reportLogoClearBtn');
  if (clrBtn) clrBtn.style.display = 'none';
  const fi = document.getElementById('reportLogoFile');
  if (fi) fi.value = '';
  updateReportCoverPreview();
}

function updateReportCoverPreview() {
  const box = document.getElementById('reportCoverPreview');
  if (!box) return;
  const company = document.getElementById('reportCompany')?.value?.trim() || '';
  const title   = document.getElementById('reportTitle')?.value?.trim() || 'Data Analysis Report';
  const prepFor = document.getElementById('reportPreparedFor')?.value?.trim() || '';
  const desc    = document.getElementById('reportDescription')?.value?.trim() || '';
  const today   = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const rCount  = rawData.length ? rawData.length.toLocaleString('en-IN') + ' records' : 'No data';
  const cCount  = headers.length ? headers.length + ' columns' : '';

  box.innerHTML = `
    <div class="rcp-bar"></div>
    <div class="rcp-inner">
      ${_reportLogoB64
        ? `<img src="${_reportLogoB64}" class="rcp-logo-img">`
        : `<div class="rcp-logo-ph">📊</div>`}
      ${company ? `<div class="rcp-company">${company}</div>` : ''}
      <div class="rcp-title">${title}</div>
      ${prepFor ? `<div class="rcp-prep">Prepared for: ${prepFor}</div>` : ''}
      ${desc    ? `<div class="rcp-desc">${desc.substring(0, 100)}${desc.length > 100 ? '…' : ''}</div>` : ''}
      <div class="rcp-divider"></div>
      <div class="rcp-meta">${today}${rCount ? '  •  ' + rCount : ''}${cCount ? '  •  ' + cCount : ''}</div>
      <div class="rcp-brand">Stellura — स्टेल्यूरा</div>
    </div>
    <div class="rcp-foot"></div>
  `;
}

async function generateReport() {
  if (rawData.length === 0) {
    toast(uiLanguage === 'hi' ? 'पहले डेटा आयात करें' : 'Import data first', 'error');
    return;
  }

  const company = document.getElementById('reportCompany')?.value?.trim() || '';
  const title   = document.getElementById('reportTitle')?.value?.trim() || 'Data Analysis Report';
  const prepFor = document.getElementById('reportPreparedFor')?.value?.trim() || '';
  const desc    = document.getElementById('reportDescription')?.value?.trim() || '';
  const lang    = document.getElementById('reportLanguage')?.value || 'en';
  const inclAI  = !!(document.getElementById('reportIncludeAI')?.checked && _ollamaOnline);

  const btn  = document.getElementById('generateReportBtn');
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = uiLanguage === 'hi' ? '⏳ रिपोर्ट तैयार हो रही है…' : '⏳ Generating Report…';

  // Batch 9: grounded slot-filling (validated — no hallucinated numbers)
  const aiInsights = {};
  if (inclAI) {
    try {
      const aiRes = await fetch('/api/ai/report-slots', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headers,
          data:     rawData.slice(0, 500),
          colTypes,
          language: lang,
        }),
      });
      if (aiRes.ok) {
        const aiData = await aiRes.json();
        const slots  = aiData.slots || {};
        if (slots.summary)         aiInsights.summary         = slots.summary;
        if (slots.findings)        aiInsights.findings        = slots.findings;
        if (slots.recommendations) aiInsights.recommendations = slots.recommendations;
      }
    } catch (_) { /* fall back to computed facts-only text */ }
  }

  const payload = {
    headers,
    data:        rawData.slice(0, 2000),
    logoBase64:  _reportLogoB64 || '',
    companyName: company,
    reportTitle: title,
    preparedFor: prepFor,
    description: desc,
    language:    lang,
    includeAI:   inclAI,
    aiInsights,
  };

  try {
    const res = await fetch('/api/generate-report', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.message || err.error || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')}_Report.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast(uiLanguage === 'hi' ? '✅ रिपोर्ट डाउनलोड हो गई!' : '✅ Report downloaded successfully!', 'success');
  } catch (err) {
    toast((uiLanguage === 'hi' ? 'रिपोर्ट त्रुटि: ' : 'Report failed: ') + err.message, 'error');
  } finally {
    btn.disabled  = false;
    btn.innerHTML = orig;
  }
}
