// =====================================================================
//  DATA VALIDATION
// =====================================================================
function addValidationRule() {
  const col = parseInt(document.getElementById('validCol').value);
  const type = document.getElementById('validType').value;
  const value = document.getElementById('validValue').value;
  if (isNaN(col)) return;
  validationRules.push({ col, type, value });
  renderValidationRules();
  renderTable();
  toast('Validation rule added', 'success');
}

function removeValidationRule(idx) {
  validationRules.splice(idx, 1);
  renderValidationRules();
  renderTable();
}

function renderValidationRules() {
  const container = document.getElementById('validRulesList');
  if (validationRules.length === 0) {
    container.innerHTML = '<div style="font-size:12px;color:var(--text-muted)">No rules defined</div>';
    return;
  }
  container.innerHTML = validationRules.map((r, i) =>
    `<div class="validation-rule"><span class="vr-col">${escHtml(headers[r.col])}</span><span class="vr-text">${r.type}${r.value ? ': ' + r.value : ''}</span><span class="vr-del" onclick="removeValidationRule(${i})">×</span></div>`
  ).join('');
}

function runValidation() {
  if (validationRules.length === 0) { toast('Add validation rules first', 'error'); return; }
  let totalInvalid = 0;
  const summary = {};

  validationRules.forEach(rule => {
    let invalid = 0;
    rawData.forEach(row => {
      const val = String(row[rule.col] == null ? '' : row[rule.col]).trim();
      if (!validateCell(val, rule)) invalid++;
    });
    summary[headers[rule.col] + ' (' + rule.type + ')'] = invalid;
    totalInvalid += invalid;
  });

  let html = `<div style="padding:8px;background:${totalInvalid > 0 ? 'var(--danger-light)' : 'var(--success-light)'};border-radius:var(--radius-md);margin-top:8px">`;
  html += `<strong>${totalInvalid > 0 ? '⚠' : '✓'} ${totalInvalid} invalid cell(s) found</strong>`;
  Object.entries(summary).forEach(([key, count]) => {
    html += `<div style="font-size:11px;margin-top:4px">${key}: ${count} invalid</div>`;
  });
  html += '</div>';
  document.getElementById('validSummary').innerHTML = html;
  renderTable();
  toast(`Validation complete: ${totalInvalid} issues`, totalInvalid > 0 ? 'warning' : 'success');
}

// =====================================================================
//  EXPORT: PDF
// =====================================================================
function showExportPDFDialog() {
  if (rawData.length === 0) { toast('No data to export', 'error'); return; }
  showModal('pdfModal');
}

function executePDFExport() {
  closeModal('pdfModal');
  const title = document.getElementById('pdfTitle').value || 'Data Report';
  const paperSize = document.getElementById('pdfPaperSize').value;
  const orientation = document.getElementById('pdfOrientation').value;
  const maxRows = parseInt(document.getElementById('pdfMaxRows').value) || 5000;
  const includeFormat = document.getElementById('pdfIncludeFormat').checked;

  const indices = getDisplayData().slice(0, maxRows);
  const tableData = indices.map(ri => headers.map((_, ci) => String(rawData[ri][ci] != null ? rawData[ri][ci] : '')));

  // Extract conditional formatting colors
  const cfColors = {};
  if (includeFormat) {
    indices.forEach((ri, exportRowIdx) => {
      headers.forEach((_, ci) => {
        for (const rule of cfRules) {
          if (rule.col !== ci) continue;
          const val = String(rawData[ri][ci] == null ? '' : rawData[ri][ci]);
          const numVal = parseFloat(val);
          const ruleNum = parseFloat(rule.value);
          let match = false;
          switch(rule.cond) {
            case 'gt': match = !isNaN(numVal) && numVal > ruleNum; break;
            case 'lt': match = !isNaN(numVal) && numVal < ruleNum; break;
            case 'eq': match = val === rule.value; break;
            case 'contains': match = val.toLowerCase().includes(rule.value.toLowerCase()); break;
          }
          if (match) {
            cfColors[`${exportRowIdx}:${ci}`] = rule.color;
          }
        }
      });
    });
  }

  // Extract cellFonts and convert Krutidev/Devlys on the fly for PDF
  const cellFontsPayload = {};
  const translatedData = JSON.parse(JSON.stringify(tableData));

  indices.forEach((ri, exportRowIdx) => {
    headers.forEach((_, ci) => {
      const key = `${ri}:${ci}`;
      if (cellFonts && cellFonts[key]) {
        const fontName = cellFonts[key];
        cellFontsPayload[`${exportRowIdx}:${ci}`] = fontName;

        // On the fly translation for ReportLab Devanagari rendering
        if (fontName === 'Krutidev 010' || fontName === 'Devlys 010') {
          translatedData[exportRowIdx][ci] = convertKrutidevToUnicode(translatedData[exportRowIdx][ci]);
        }
      }
    });
  });

  if (window.location.protocol === 'file:') {
    generateClientPDF(title, paperSize, orientation, indices, tableData, includeFormat);
    return;
  }

  // Get additional new options
  const marginsSel = document.getElementById('pdfMargins');
  const margins = marginsSel ? marginsSel.value : 'normal';
  const watermarkSel = document.getElementById('pdfWatermark');
  let watermark = watermarkSel ? watermarkSel.value : '';
  if (watermark === 'custom') {
    const customWm = document.getElementById('pdfWatermarkCustom');
    watermark = customWm ? customWm.value.trim() : '';
  }
  const includeLogo = document.getElementById('pdfIncludeLogo') ? document.getElementById('pdfIncludeLogo').checked : true;
  const includeProfile = document.getElementById('pdfIncludeProfile') ? document.getElementById('pdfIncludeProfile').checked : false;

  // Build cell bg color payload for PDF
  const bgPayload = {};
  if (typeof cellBgColor !== 'undefined') {
    indices.forEach((ri, exportRowIdx) => {
      headers.forEach((_, ci) => {
        const srcKey = `${ri}:${ci}`;
        const dstKey = `${exportRowIdx}:${ci}`;
        if (cellBgColor[srcKey]) bgPayload[dstKey] = cellBgColor[srcKey];
      });
    });
  }

  const useAsync = indices.length >= 1000;
  if (useAsync) showExportProgress('Generating PDF…');
  else toast('Generating PDF on server...', 'info');

  const dlName = `${title.replace(/\s+/g, '_')}.pdf`;

  fetch('/api/export/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      headers,
      data: translatedData,
      title,
      pageSize: paperSize,
      orientation,
      margins,
      watermark,
      includeLogo,
      includeProfile,
      conditionalFormatting: cfColors,
      cellFonts: cellFontsPayload,
      cellBgColor: bgPayload,
      userProfile: (includeProfile && typeof userProfile !== 'undefined') ? userProfile : {},
      async: useAsync
    })
  })
  .then(resp => {
    if (!resp.ok) throw new Error('Server PDF generation failed');
    const ct = resp.headers.get('Content-Type') || '';
    if (ct.includes('application/json')) {
      return resp.json().then(d => {
        if (d.job_id) { pollExportJob(d.job_id, dlName); return null; }
        throw new Error(d.error || 'Unknown error');
      });
    }
    return resp.blob();
  })
  .then(blob => {
    if (!blob) return;
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = dlName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast('PDF downloaded successfully', 'success');
  })
  .catch(err => {
    if (useAsync) hideExportProgress();
    console.warn('Backend PDF failed, falling back to client PDF', err);
    generateClientPDF(title, paperSize, orientation, indices, tableData, includeFormat);
  });
}

function generateClientPDF(title, paperSize, orientation, indices, tableData, includeFormat) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation, format: paperSize });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const PURPLE = [124, 58, 237];   // #7c3aed Stellura primary
  const CYAN   = [76, 215, 246];   // #4cd7f6 Stellura secondary
  const DARK   = [13, 10, 26];     // #0d0a1a cosmic dark
  const MUTED  = [160, 140, 180];
  const HDR_H  = 22;
  const MARGIN = 8;

  // ── Draw per-page branded header ─────────────────────────────────────────────
  function _drawHdr(pageNum, total) {
    doc.setFillColor(...DARK);
    doc.rect(0, 0, pageW, HDR_H, 'F');
    // Stellura pill
    doc.setFillColor(...PURPLE);
    doc.roundedRect(MARGIN, 5, 68, 10, 2.5, 2.5, 'F');
    // Living Data Intelligence chip
    doc.setFillColor(...CYAN);
    doc.roundedRect(MARGIN + 70, 5, 40, 10, 2.5, 2.5, 'F');
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text('Stellura — Data Vision Studio', MARGIN + 3, 11.5);
    doc.setFontSize(6.5);
    doc.setTextColor(13, 10, 26);
    doc.text('Living Data Intelligence', MARGIN + 73, 11.5);
    // Page n of N on right
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`${title}  |  Page ${pageNum}`, pageW - MARGIN, 11.5, { align: 'right' });
  }

  // First page title block
  _drawHdr(1, 1);
  doc.setFontSize(14);
  doc.setFont('Helvetica', 'bold');
  doc.setTextColor(...PURPLE);
  doc.text(title, MARGIN, 31);
  doc.setFontSize(7.5);
  doc.setFont('Helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.text(
    `Generated: ${new Date().toLocaleString()}  |  Rows: ${tableData.length}  |  Columns: ${(tableData[0]||[]).length}`,
    MARGIN, 37
  );

  // ── Conditional formatting hook ───────────────────────────────────────────────
  const didParseCell = includeFormat ? function(data) {
    if (data.section !== 'body') return;
    const ri = indices[data.row.index];
    const ci = data.column.index;
    if (ri === undefined) return;
    for (const rule of cfRules) {
      if (rule.col !== ci) continue;
      const val = String(rawData[ri][ci] == null ? '' : rawData[ri][ci]);
      const numVal = parseFloat(val), ruleNum = parseFloat(rule.value);
      let match = false;
      switch (rule.cond) {
        case 'gt':       match = !isNaN(numVal) && numVal > ruleNum; break;
        case 'lt':       match = !isNaN(numVal) && numVal < ruleNum; break;
        case 'eq':       match = val === rule.value; break;
        case 'contains': match = val.toLowerCase().includes(rule.value.toLowerCase()); break;
      }
      if (match) {
        const r = parseInt(rule.color.slice(1,3),16), g = parseInt(rule.color.slice(3,5),16), b = parseInt(rule.color.slice(5,7),16);
        data.cell.styles.fillColor = [r, g, b];
        data.cell.styles.textColor = [255, 255, 255];
      }
    }
  } : undefined;

  // ── Table ─────────────────────────────────────────────────────────────────────
  let pageCount = 1;
  doc.autoTable({
    head: [headers],
    body: tableData,
    startY: 42,
    styles: { fontSize: 7.5, cellPadding: 2.2, lineColor: [220, 210, 240], lineWidth: 0.15 },
    headStyles: { fillColor: PURPLE, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [247, 244, 255] },
    didParseCell,
    margin: { top: HDR_H + 4, left: MARGIN, right: MARGIN },
    didDrawPage: function(data) {
      pageCount = data.pageCount || pageCount + 1;
      // Redraw header on every page (autoTable overwrites it)
      _drawHdr(doc.internal.getCurrentPageInfo().pageNumber, pageCount);
      // Slim footer on every page
      doc.setFont('Helvetica', 'italic');
      doc.setFontSize(5.8);
      doc.setTextColor(...MUTED);
      doc.text('Stellura — Living Data Intelligence', pageW / 2, pageH - 3, { align: 'center' });
    }
  });

  // ── Disclaimer on last page ────────────────────────────────────────────────────
  const finalY = (doc.lastAutoTable && doc.lastAutoTable.finalY) ? doc.lastAutoTable.finalY + 6 : pageH - 32;
  const discY  = Math.min(finalY, pageH - 28);
  doc.setDrawColor(...PURPLE);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, discY, pageW - MARGIN, discY);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...PURPLE);
  doc.text('DISCLAIMER', MARGIN, discY + 5);
  doc.setFont('Helvetica', 'italic');
  doc.setFontSize(6);
  doc.setTextColor(110, 90, 140);
  doc.text('This report is generated by Stellura — Living Data Intelligence. Trends and associations shown are indicative only.', MARGIN, discY + 9);
  doc.text('Human review and domain expertise are essential before making any decision based on this data.', MARGIN, discY + 13);
  doc.text('Generated on: ' + new Date().toLocaleString(), MARGIN, discY + 17);

  doc.save(title.replace(/\s+/g, '_') + '.pdf');
  toast('PDF exported — Stellura branded', 'success');
}

