// =====================================================================
//  CHART BUILDER
// =====================================================================
function initChartPanel() {
  const wrap = document.getElementById('chartColumns');
  wrap.innerHTML = headers.map((h, i) =>
    `<span class="col-draggable" draggable="true" ondragstart="event.dataTransfer.setData('text/plain','${i}')">${escHtml(h)}</span>`
  ).join('');
}

function dropAxis(e, axis) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const ci = parseInt(e.dataTransfer.getData('text/plain'));
  if (isNaN(ci)) return;
  if (axis === 'x') {
    chartXCol = ci;
    document.getElementById('xSlotField').innerHTML = `<span class="slot-field">${escHtml(headers[ci])} <span class="remove-slot" onclick="event.stopPropagation();chartXCol=-1;document.getElementById('xSlotField').textContent='Drop here'">×</span></span>`;
  } else {
    chartYCol = ci;
    document.getElementById('ySlotField').innerHTML = `<span class="slot-field">${escHtml(headers[ci])} <span class="remove-slot" onclick="event.stopPropagation();chartYCol=-1;document.getElementById('ySlotField').textContent='Drop here'">×</span></span>`;
  }
  
  if (chartXCol >= 0) {
    const defaultTitle = `${headers[chartXCol]}${chartYCol >= 0 ? ' vs ' + headers[chartYCol] : ''}`;
    document.getElementById('chartTitleInput').value = defaultTitle;
  }
}

function buildChart() {
  if (chartXCol < 0) { toast('Set X-Axis column', 'error'); return; }
  const type = document.getElementById('chartType').value;
  const indices = getDisplayData();
  const maxPts = Math.min(indices.length, 50);
  const labels = indices.slice(0, maxPts).map(ri => String(rawData[ri][chartXCol] || ''));

  let datasets = [];
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  
  const theme = document.getElementById('chartThemeSelect').value;
  let colors = ['#0b4f7c','#0f8f83','#4f7cac','#db9d47','#6f7f8f','#b44c5d','#61a5a0','#183b56'];
  if (theme === 'pastel') {
    colors = ['#fbcfe8', '#c7d2fe', '#a7f3d0', '#fef3c7', '#fcd34d', '#fda4af', '#e9d5ff'];
  } else if (theme === 'vibrant') {
    colors = ['#ff007f', '#39ff14', '#8b5cf6', '#ff4500', '#00ffff', '#ec4899', '#f59e0b'];
  } else if (theme === 'monochrome') {
    colors = ['#1e293b', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0', '#cccccc'];
  } else if (theme === 'corporate') {
    colors = ['#153e75', '#2563a6', '#4f7cac', '#7796b8', '#0f6270', '#2d8c91', '#8494a7'];
  } else if (theme === 'government') {
    colors = ['#0b4f7c', '#0f8f83', '#4f7cac', '#183b56', '#61a5a0', '#7b8fa3', '#d59b45'];
  } else if (theme === 'rajasthan') {
    colors = ['#0f8f83', '#c7822b', '#8f5b34', '#e0ad62', '#2f6f73', '#c25545', '#6f7f8f'];
  }

  if (type === 'pie' || type === 'doughnut' || type === 'polarArea') {
    if (chartYCol >= 0 && colTypes[chartYCol] === 'number') {
      datasets.push({
        label: headers[chartYCol],
        data: indices.slice(0, maxPts).map(ri => parseFloat(rawData[ri][chartYCol]) || 0),
        backgroundColor: labels.map((_, i) => colors[i % colors.length] + 'cc'),
        borderColor: labels.map((_, i) => colors[i % colors.length]),
        borderWidth: 2
      });
    } else {
      const freq = {};
      indices.forEach(ri => { const v = String(rawData[ri][chartXCol]||''); freq[v] = (freq[v]||0)+1; });
      const entries = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0, 15);
      datasets.push({
        data: entries.map(e => e[1]),
        backgroundColor: entries.map((_, i) => colors[i % colors.length] + 'cc'),
        borderWidth: 2
      });
      labels.length = 0;
      entries.forEach(e => labels.push(e[0]));
    }
  } else if (type === 'scatter') {
    if (chartYCol >= 0) {
      datasets.push({
        label: `${headers[chartXCol]} vs ${headers[chartYCol]}`,
        data: indices.slice(0, maxPts).map(ri => ({ x: parseFloat(rawData[ri][chartXCol]) || 0, y: parseFloat(rawData[ri][chartYCol]) || 0 })),
        backgroundColor: colors[0] + '99',
        borderColor: colors[0],
        pointRadius: 5
      });
    }
  } else {
    if (chartYCol >= 0 && colTypes[chartYCol] === 'number') {
      datasets.push({
        label: headers[chartYCol],
        data: indices.slice(0, maxPts).map(ri => parseFloat(rawData[ri][chartYCol]) || 0),
        backgroundColor: type === 'bar' ? colors[0] + '99' : 'transparent',
        borderColor: colors[0],
        borderWidth: 2,
        fill: type === 'area' || type === 'radar',
        tension: 0.3
      });
      if (type === 'area') datasets[0].fill = true;
    } else {
      const freq = {};
      indices.forEach(ri => { const v = String(rawData[ri][chartXCol]||''); freq[v] = (freq[v]||0)+1; });
      const entries = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0, 20);
      labels.length = 0;
      entries.forEach(e => labels.push(e[0]));
      datasets.push({
        label: 'Count',
        data: entries.map(e => e[1]),
        backgroundColor: colors[0] + '99',
        borderColor: colors[0],
        borderWidth: 2
      });
    }
  }

  const canvas = document.getElementById('chartCanvas');
  if (chartInstance) chartInstance.destroy();

  const chartType = type === 'area' ? 'line' : type;
  const chartFontFamily = document.getElementById('chartFontFamily')?.value || 'Inter';
  const chartTitleSize = parseInt(document.getElementById('chartTitleSize')?.value || '16', 10);
  const chartTextSize = parseInt(document.getElementById('chartTextSize')?.value || '10', 10);
  
  let chartTitle = document.getElementById('chartTitleInput').value.trim();
  if (!chartTitle) {
    chartTitle = `${headers[chartXCol]}${chartYCol >= 0 ? ' vs ' + headers[chartYCol] : ''}`;
    document.getElementById('chartTitleInput').value = chartTitle;
  }
  
  const descDisplay = document.getElementById('chartDescDisplay');
  if (descDisplay) {
    descDisplay.textContent = document.getElementById('chartDescInput').value;
    descDisplay.style.fontFamily = chartFontFamily;
    descDisplay.style.fontSize = `${chartTextSize}px`;
  }

  chartInstance = new Chart(canvas, {
    type: chartType,
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      font: { family: chartFontFamily },
      plugins: {
        legend: { labels: { color: isDark ? '#e2e8f0' : '#334155', font: { family: chartFontFamily, size: chartTextSize } } },
        title: { display: true, text: chartTitle, color: isDark ? '#e2e8f0' : '#334155', font: { family: chartFontFamily, size: chartTitleSize, weight: '700' }, padding: { bottom: 16 } }
      },
      scales: (type === 'pie' || type === 'doughnut' || type === 'polarArea' || type === 'radar') ? {} : {
        x: { ticks: { color: isDark ? '#94a3b8' : '#64748b', maxRotation: 45, font: { family: chartFontFamily, size: chartTextSize } }, grid: { color: isDark ? '#334155' : '#e2e8f0' } },
        y: { ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { family: chartFontFamily, size: chartTextSize } }, grid: { color: isDark ? '#334155' : '#e2e8f0' } }
      }
    }
  });
}

function updateChartTitleDesc() {
  const title = document.getElementById('chartTitleInput').value;
  const desc = document.getElementById('chartDescInput').value;
  if (chartInstance) {
    chartInstance.options.plugins.title.text = title;
    chartInstance.options.plugins.title.font.family = document.getElementById('chartFontFamily')?.value || 'Inter';
    chartInstance.options.plugins.title.font.size = parseInt(document.getElementById('chartTitleSize')?.value || '16', 10);
    chartInstance.options.plugins.legend.labels.font.family = document.getElementById('chartFontFamily')?.value || 'Inter';
    chartInstance.options.plugins.legend.labels.font.size = parseInt(document.getElementById('chartTextSize')?.value || '10', 10);
    chartInstance.update();
  }
  const descDisplay = document.getElementById('chartDescDisplay');
  if (descDisplay) {
    descDisplay.textContent = desc;
    descDisplay.style.fontFamily = document.getElementById('chartFontFamily')?.value || 'Inter';
    descDisplay.style.fontSize = `${parseInt(document.getElementById('chartTextSize')?.value || '10', 10)}px`;
  }
}

function downloadChart() {
  if (!chartInstance) { toast('Create a chart first', 'error'); return; }
  const link = document.createElement('a');
  link.download = 'chart.png';
  link.href = document.getElementById('chartCanvas').toDataURL('image/png');
  link.click();
  toast('Chart downloaded', 'success');
}

function downloadChartPDF() {
  if (!chartInstance) { toast('Create a chart first', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });
  const chartCanvas = document.getElementById('chartCanvas');
  const chartImg = chartCanvas.toDataURL('image/png');
  const title = document.getElementById('chartTitleInput').value.trim() || 'Chart';
  const desc = document.getElementById('chartDescInput').value.trim();

  const requestedFont = document.getElementById('chartFontFamily')?.value || 'Inter';
  const pdfFont = requestedFont === 'Georgia' ? 'Times' : (requestedFont === 'Arial' ? 'Helvetica' : 'Helvetica');
  doc.setFont(pdfFont, 'bold');
  doc.setFontSize(parseInt(document.getElementById('chartTitleSize')?.value || '16', 10));
  doc.setTextColor(15, 143, 131);
  doc.text(title, 15, 20);

  const pdfW = 260;
  const aspect = chartCanvas.height / chartCanvas.width;
  const pdfH = pdfW * aspect;
  doc.addImage(chartImg, 'PNG', 15, 30, pdfW, pdfH);

  if (desc) {
    doc.setFont(pdfFont, 'normal');
    doc.setFontSize(parseInt(document.getElementById('chartTextSize')?.value || '10', 10));
    doc.setTextColor(100, 116, 139);
    const splitDesc = doc.splitTextToSize(desc, pdfW);
    doc.text(splitDesc, 15, 35 + pdfH + 5);
  }

  doc.save(`${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}.pdf`);
  toast('Chart PDF downloaded', 'success');
}

function downloadChartExcel() {
  if (!chartInstance) { toast('Create a chart first', 'error'); return; }
  const title = document.getElementById('chartTitleInput').value.trim() || 'Chart';
  const desc = document.getElementById('chartDescInput').value.trim();
  const labels = chartInstance.data.labels || [];
  const datasets = chartInstance.data.datasets || [];
  const rows = [
    [title],
    [desc],
    [],
    ['Category', ...datasets.map(dataset => dataset.label || 'Series')]
  ];
  labels.forEach((label, index) => {
    rows.push([label, ...datasets.map(dataset => {
      const value = dataset.data[index];
      return typeof value === 'object' && value !== null ? JSON.stringify(value) : value;
    })]);
  });
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [{ wch: 28 }, ...datasets.map(() => ({ wch: 18 }))];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Chart Data');
  XLSX.writeFile(workbook, `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'chart'}.xlsx`);
  toast('Chart title, description and plotted data exported to Excel', 'success');
}

// =====================================================================
//  DASHBOARD EXPORT FUNCTIONS
// =====================================================================

function exportDashboardPNG() {
  const view = document.getElementById('dashboard-view');
  if (!view || !view.classList.contains('visible')) {
    toast('Open Dashboard first', 'error'); return;
  }
  if (typeof html2canvas === 'undefined') {
    toast('html2canvas is missing from static/js — please reinstall Stellura', 'error'); return;
  }
  const exportBar = document.getElementById('dash-export-bar');
  if (exportBar) exportBar.style.visibility = 'hidden';

  html2canvas(view, {
    scale: 2,
    backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim() || '#f8fafc',
    useCORS: true,
    logging: false,
    ignoreElements: el => el.id === 'dash-export-bar'
  }).then(canvas => {
    if (exportBar) exportBar.style.visibility = 'visible';
    const link = document.createElement('a');
    const title = (document.getElementById('documentName')?.textContent || 'Dashboard').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');
    link.download = `${title}_${new Date().toISOString().slice(0,10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('Dashboard exported as PNG image', 'success');
  }).catch(err => {
    if (exportBar) exportBar.style.visibility = 'visible';
    toast('PNG export failed: ' + err.message, 'error');
  });
}

function exportDashboardPDF() {
  const view = document.getElementById('dashboard-view');
  if (!view || !view.classList.contains('visible')) {
    toast('Open Dashboard first', 'error'); return;
  }
  if (typeof html2canvas === 'undefined') {
    toast('html2canvas is missing from static/js — please reinstall Stellura', 'error'); return;
  }
  const exportBar = document.getElementById('dash-export-bar');
  if (exportBar) exportBar.style.visibility = 'hidden';

  html2canvas(view, {
    scale: 2,
    backgroundColor: '#0d0a1a',
    useCORS: true,
    logging: false,
    ignoreElements: el => el.id === 'dash-export-bar'
  }).then(canvas => {
    if (exportBar) exportBar.style.visibility = 'visible';
    const { jsPDF } = window.jspdf;
    const imgData = canvas.toDataURL('image/png');
    const isLandscape = canvas.width > canvas.height;
    const doc = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait', format: 'a4', unit: 'mm' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 10;

    // ---- Header branding ----
    doc.setFillColor(67, 56, 202);
    doc.roundedRect(margin, 6, 72, 9, 2, 2, 'F');
    doc.setFillColor(124, 58, 237);
    doc.roundedRect(margin + 74, 6, 30, 9, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5);
    doc.setFont('Helvetica', 'bold');
    doc.text('Stellura — Data Vision Studio', margin + 3, 11.8);
    doc.setFontSize(6.5);
    doc.text('स्टेल्यूरा', margin + 77, 11.8);

    // Title on right
    const docTitle = document.getElementById('documentName')?.textContent || 'Dashboard';
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10);
    doc.setFont('Helvetica', 'bold');
    doc.text(docTitle, pageW - margin, 11.5, { align: 'right' });

    // ---- Dashboard image ----
    const imageTop = 20;
    const availH = pageH - imageTop - margin - 8;
    const imgW = pageW - margin * 2;
    const imgH = (canvas.height / canvas.width) * imgW;

    if (imgH <= availH) {
      doc.addImage(imgData, 'PNG', margin, imageTop, imgW, imgH);
    } else {
      // Slice across multiple pages
      let yRendered = 0;
      let firstPage = true;
      while (yRendered < imgH) {
        if (!firstPage) doc.addPage();
        const sliceH = Math.min(availH, imgH - yRendered);
        const srcY = Math.round((yRendered / imgH) * canvas.height);
        const srcH = Math.round((sliceH / imgH) * canvas.height);
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = srcH;
        sliceCanvas.getContext('2d').drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
        doc.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', margin, firstPage ? imageTop : margin, imgW, sliceH);
        yRendered += sliceH;
        firstPage = false;
      }
    }

    // ---- Footer ----
    const prof = JSON.parse(localStorage.getItem('userProfile') || '{}');
    const footerParts = [prof.name, prof.desig, prof.org].filter(Boolean);
    const footerText = (footerParts.length ? footerParts.join('  |  ') + '  |  ' : '') +
      new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.setFont('Helvetica', 'italic');
    doc.text(footerText, pageW / 2, pageH - 3, { align: 'center' });
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(67, 56, 202);
    doc.text('Developed by Neeraj Purohit, Senior Assistant, Rajasthan Police', pageW / 2, pageH - 7, { align: 'center' });
    // ---- Disclaimer ----
    doc.setDrawColor(124, 58, 237);
    doc.setLineWidth(0.25);
    doc.line(margin, pageH - 14, pageW - margin, pageH - 14);
    doc.setFont('Helvetica', 'italic');
    doc.setFontSize(5.8);
    doc.setTextColor(124, 58, 237);
    doc.text('DISCLAIMER:', margin, pageH - 11);
    doc.setTextColor(110, 90, 140);
    doc.text('This report is generated by Stellura — Living Data Intelligence. Associations are indicative only.', margin + 18, pageH - 11);
    doc.text('Human review and domain expertise are essential before making any decision based on this data.', margin, pageH - 8);

    const safeTitle = docTitle.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');
    doc.save(`${safeTitle}_dashboard_${new Date().toISOString().slice(0,10)}.pdf`);
    toast('Dashboard PDF downloaded', 'success');
  }).catch(err => {
    if (exportBar) exportBar.style.visibility = 'visible';
    toast('PDF export failed: ' + err.message, 'error');
  });
}

function exportDashboardExcel() {
  if (!headers || headers.length === 0) { toast('No data loaded', 'error'); return; }

  const docTitle = document.getElementById('documentName')?.textContent || 'Dashboard Export';
  const prof = JSON.parse(localStorage.getItem('userProfile') || '{}');

  // Build exported rows from current display (respects filters & search)
  const indices = getDisplayData();
  const exportedRows = indices.map(ri => headers.map((_, ci) => rawData[ri][ci] != null ? rawData[ri][ci] : ''));

  // Build CF colour map using same logic as existing PDF export
  const cfColors = {};
  indices.forEach((ri, exportRowIdx) => {
    headers.forEach((_, ci) => {
      for (const rule of cfRules) {
        if (rule.col !== ci) continue;
        const val = String(rawData[ri][ci] || '');
        const numVal = parseFloat(val);
        const ruleNum = parseFloat(rule.value);
        let match = false;
        switch (rule.cond) {
          case 'gt': match = !isNaN(numVal) && numVal > ruleNum; break;
          case 'lt': match = !isNaN(numVal) && numVal < ruleNum; break;
          case 'eq': match = val === rule.value; break;
          case 'contains': match = val.toLowerCase().includes((rule.value || '').toLowerCase()); break;
          case 'between': match = !isNaN(numVal) && numVal >= ruleNum && numVal <= parseFloat(rule.value2); break;
        }
        if (match) cfColors[`${exportRowIdx}:${ci}`] = rule.color;
      }
    });
  });

  const payload = {
    headers,
    data: exportedRows,
    title: docTitle,
    filename: docTitle,
    conditionalFormatting: cfColors,
    freezeHeader: true,
    includeLogo: true,
    includeProfile: true,
    userProfile: prof
  };

  toast('Preparing Excel export…', 'info');

  fetch('/api/export/excel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(r => { if (!r.ok) throw new Error('Server error ' + r.status); return r.blob(); })
  .then(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${docTitle.replace(/[^\w\s-]/g,'').trim().replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`Excel exported — ${exportedRows.length.toLocaleString()} rows`, 'success');
  })
  .catch(err => toast('Excel export failed: ' + err.message, 'error'));
}

function exportInteractiveHTML() {
  if (!headers || headers.length === 0) { toast('No data loaded', 'error'); return; }

  const docTitle = document.getElementById('documentName')?.textContent?.trim() || 'Analysis Report';
  const indices = getDisplayData();

  // Limit to 5 000 rows — large datasets make huge files
  const MAX_ROWS = 5000;
  if (indices.length > MAX_ROWS) {
    toast(`Large dataset: exporting first ${MAX_ROWS.toLocaleString()} of ${indices.length.toLocaleString()} rows`, 'info');
  }
  const exportIndices = indices.slice(0, MAX_ROWS);

  // Build data rows
  const exportedRows = exportIndices.map(ri =>
    headers.map((_, ci) => (rawData[ri][ci] != null ? rawData[ri][ci] : ''))
  );

  // Build CF colour map inline (same pattern as exportDashboardExcel)
  const cfColors = {};
  exportIndices.forEach((ri, exportRowIdx) => {
    headers.forEach((_, ci) => {
      for (const rule of cfRules) {
        if (rule.col !== ci) continue;
        const val = String(rawData[ri][ci] || '');
        const numVal = parseFloat(val);
        const ruleNum = parseFloat(rule.value);
        let match = false;
        switch (rule.cond) {
          case 'gt': match = !isNaN(numVal) && numVal > ruleNum; break;
          case 'lt': match = !isNaN(numVal) && numVal < ruleNum; break;
          case 'eq': match = val === rule.value; break;
          case 'contains': match = val.toLowerCase().includes((rule.value || '').toLowerCase()); break;
          case 'between': match = !isNaN(numVal) && numVal >= ruleNum && numVal <= parseFloat(rule.value2); break;
        }
        if (match) cfColors[`${exportRowIdx}:${ci}`] = rule.color;
      }
    });
  });

  // Capture chart config from global state (chartXCol / chartYCol are global vars, not DOM selects)
  let chartConfig = {};
  if (chartInstance && chartXCol >= 0) {
    chartConfig = {
      type: document.getElementById('chartType')?.value || 'bar',
      xCol: headers[chartXCol] || '',
      yCol: chartYCol >= 0 ? (headers[chartYCol] || '') : '',
      label: document.getElementById('chartTitleInput')?.value?.trim() || ''
    };
  }

  // Harvest KPI cards from the dashboard view if it is visible
  const kpis = [];
  document.querySelectorAll('#dashboard-view .kpi-card, #dashboard-view [class*="kpi"]').forEach(card => {
    const lbl = card.querySelector('[class*="label"],[class*="title"],[class*="name"]')?.textContent?.trim() || '';
    const val = card.querySelector('[class*="value"],[class*="number"],[class*="count"],[class*="amount"]')?.textContent?.trim() || '';
    if (lbl && val && kpis.length < 8) kpis.push({ label: lbl, value: val });
  });

  const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6366f1';

  toast('Generating interactive HTML file…', 'info');

  fetch('/api/export/dashboard-html', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      headers,
      data: exportedRows,
      title: docTitle,
      chartConfig,
      kpis,
      conditionalFormatting: cfColors,
      userProfile,
      accentColor
    })
  })
  .then(r => {
    if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Server error ' + r.status); });
    return r.blob();
  })
  .then(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${docTitle.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'Dashboard'}_interactive_${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast(`Interactive HTML ready! Share via email or WhatsApp — no app or internet needed.`, 'success');
  })
  .catch(err => toast('HTML export failed: ' + err.message, 'error'));
}

