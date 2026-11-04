// =====================================================================
//  TABLE DISPLAY & VIRTUAL SCROLLING
// =====================================================================
function showTable() {
  try {
    document.getElementById('welcome').style.display = 'none';
    const tw = document.getElementById('table-wrap');
    tw.classList.add('visible');
    renderTableHeader();
    renderTable();
    updateStatus();
    updateLiveInspector();
    if (typeof _ddXraySchedule === 'function') _ddXraySchedule(); // Batch 15: background profiling
    if (typeof _pvLogLoad === 'function') _pvLogLoad(); // Batch 17: log data load
    if (typeof _dbOnDataChange === 'function') _dbOnDataChange(); // Batch 18: refresh SQL table
  } catch (err) {
    console.error('Error in showTable:', err);
    toast('Error showing table: ' + err.message, 'error');
  }
}

function getDisplayData() {
  let indices = filteredData ? filteredData.slice() : rawData.map((_, i) => i);

  if (searchTerm) {
    const s = searchTerm.toLowerCase();
    indices = indices.filter(ri => rawData[ri].some(c => String(c).toLowerCase().includes(s)));
  }

  if (sortCol >= 0) {
    indices.sort((a, b) => {
      let va = rawData[a][sortCol], vb = rawData[b][sortCol];
      if (colTypes[sortCol] === 'number') {
        va = parseFloat(va) || 0;
        vb = parseFloat(vb) || 0;
      } else {
        va = String(va).toLowerCase();
        vb = String(vb).toLowerCase();
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }
  return indices;
}

function renderTableHeader() {
  try {
    const thead = document.getElementById('vthead');
    let html = '<tr><th style="width:36px;min-width:36px"><input type="checkbox" class="row-checkbox" onchange="toggleSelectAll(this.checked)" title="Select All"></th><th style="width:42px;min-width:42px">#</th>';
    headers.forEach((h, i) => {
      if (typeof hiddenCols !== 'undefined' && hiddenCols.has(i)) return;
      const sortIcon = sortCol === i ? (sortDir === 'asc' ? ' <span class="sort-icon">▲</span>' : ' <span class="sort-icon">▼</span>') : '';
      const hasFilter = activeFilters.some(f => f.col === i);
      const w = colWidths[i] ? `width:${colWidths[i]}px;max-width:${colWidths[i]}px;` : '';
      const selectedHeader = selectionMode === 'column' && selectionStart.ci === i ? 'column-selected' : '';
      html += `<th class="${hasFilter?'has-filter':''} ${selectedHeader}" onclick="selectWorksheetColumn(${i},event)" ondblclick="event.stopPropagation();handleSort(${i})" oncontextmenu="showColumnHeaderMenu(event,${i})" onmouseenter="showColStatsTooltip(event,${i})" onmouseleave="hideColStatsTooltip()" style="min-width:80px;${w}" title="Click to select column; double-click to sort"><span class="col-letter">${getColumnLetter(i)}${sortIcon}</span><span class="col-name">${escHtml(h)}</span><div class="resize-handle" onmousedown="startResize(event,${i})"></div></th>`;
    });
    html += '</tr>';
    thead.innerHTML = html;
    
    const unhideBtn = document.getElementById('unhideColsBtn');
    if (unhideBtn) {
      unhideBtn.style.display = (typeof hiddenCols !== 'undefined' && hiddenCols.size > 0) ? 'flex' : 'none';
    }
    
    const visibleCount = headers.length - (typeof hiddenCols !== 'undefined' ? hiddenCols.size : 0);
    document.getElementById('colInfo').textContent = visibleCount + ' columns';
  } catch (err) {
    console.error('Error in renderTableHeader:', err);
    toast('Error rendering table header: ' + err.message, 'error');
  }
}

function renderTable() {
  try {
    const indices = getDisplayData();
    const tbody = document.getElementById('vtbody');
    const container = document.getElementById('virtual-table-container');

    const scrollTop = container.scrollTop;
    const viewHeight = container.clientHeight || 600;
    const effectiveRowHeight = ROW_HEIGHT * (worksheetZoom / 100);
    const startIdx = Math.max(0, Math.floor(scrollTop / effectiveRowHeight) - VISIBLE_BUFFER);
    const endIdx = Math.min(indices.length, Math.ceil((scrollTop + viewHeight) / effectiveRowHeight) + VISIBLE_BUFFER);

    const numHidden = typeof hiddenCols !== 'undefined' ? hiddenCols.size : 0;
    const visibleColspan = headers.length - numHidden + 2;

    let html = '';
    if (startIdx > 0) {
      html += `<tr style="height:${startIdx * ROW_HEIGHT}px"><td colspan="${visibleColspan}" style="padding:0;border:0"></td></tr>`;
    }

    const highlightTerm = searchTerm ? searchTerm.toLowerCase() : '';

    for (let vi = startIdx; vi < endIdx; vi++) {
      const ri = indices[vi];
      const row = rawData[ri];
      const isSelected = selectedRows.has(ri);
      html += `<tr style="height:${ROW_HEIGHT}px" data-ridx="${ri}" oncontextmenu="showContextMenu(event,${ri})">`;
      html += `<td style="width:36px;min-width:36px;text-align:center"><input type="checkbox" class="row-checkbox" ${isSelected?'checked':''} onchange="toggleRowSelect(${ri},this.checked)"></td>`;
      const rowSelectedClass = selectionMode === 'row' && selectionStart.ri === ri ? 'row-selected' : '';
      html += `<td class="row-number-cell ${rowSelectedClass}" style="width:42px;min-width:42px;color:var(--text-muted);font-size:10px;text-align:center" onclick="selectWorksheetRow(${ri},event)" title="Select row ${ri + 1}">${ri + 1}</td>`;
      for (let ci = 0; ci < headers.length; ci++) {
        if (typeof hiddenCols !== 'undefined' && hiddenCols.has(ci)) continue;
        // Check merged cell range
        let isMerged = false;
        let isTopLeft = false;
        let mergeInfo = null;
        if (typeof mergedCells !== 'undefined') {
          for (const m of mergedCells) {
            if (ri >= m.sri && ri <= m.eri && ci >= m.sci && ci <= m.eci) {
              isMerged = true;
              if (ri === m.sri && ci === m.sci) {
                isTopLeft = true;
                mergeInfo = m;
              }
              break;
            }
          }
        }

        if (isMerged && !isTopLeft) {
          continue; // Skip rendering
        }

        const rawVal = String(row[ci] != null ? row[ci] : '');
        const fmt = typeof cellNumFormats !== 'undefined' ? cellNumFormats[`${ri}:${ci}`] : undefined;
        const val = formatCellValue(rawVal, fmt);

        const cellStyle = getCellStyle(ri, ci);
        const validClass = getCellValidationClass(ri, ci);
        const isSelectedCell = isCellSelected(ri, ci);
        const selectedClass = isSelectedCell ? 'cell-selected' : '';
        const key = `${ri}:${ci}`;
        const multiSelectedClass = additionalSelections.some(cell => cell.ri === ri && cell.ci === ci) ? 'cell-multi-selected' : '';
        const activeClass = activeCell.ri === ri && activeCell.ci === ci ? 'cell-active' : '';
        const resultFocusClass = resultFocusKey === key ? 'cell-result-focus' : '';
        
        const hasComment = typeof cellComments !== 'undefined' && cellComments[`${ri}:${ci}`];
        const commentClass = hasComment ? 'has-comment' : '';

        let displayVal = escHtml(val);
        if (highlightTerm && val.toLowerCase().includes(highlightTerm)) {
          displayVal = highlightText(val, highlightTerm);
        }

        const colspanAttr = isTopLeft ? ` colspan="${mergeInfo.eci - mergeInfo.sci + 1}"` : '';
        const rowspanAttr = isTopLeft ? ` rowspan="${mergeInfo.eri - mergeInfo.sri + 1}"` : '';

        const w = colWidths[ci] ? `max-width:${colWidths[ci]}px;` : '';
        html += `<td class="${validClass} ${selectedClass} ${multiSelectedClass} ${activeClass} ${resultFocusClass} ${commentClass}" style="${cellStyle}${w}"${colspanAttr}${rowspanAttr} ondblclick="editCell(${ri},${ci},this)" data-ri="${ri}" data-ci="${ci}">${displayVal}</td>`;
      }
      html += '</tr>';
    }

    if (endIdx < indices.length) {
      html += `<tr style="height:${(indices.length - endIdx) * ROW_HEIGHT}px"><td colspan="${visibleColspan}" style="padding:0;border:0"></td></tr>`;
    }

    tbody.innerHTML = html;
    if (typeof positionFillHandle !== 'undefined') positionFillHandle();
  } catch (err) {
    console.error('Error in renderTable:', err);
    toast('Error rendering table: ' + err.message, 'error');
  }
}

function highlightText(text, term) {
  const idx = text.toLowerCase().indexOf(term);
  if (idx === -1) return escHtml(text);
  return escHtml(text.substring(0, idx)) + '<mark style="background:#fef08a;padding:0 1px;border-radius:2px">' + escHtml(text.substring(idx, idx + term.length)) + '</mark>' + escHtml(text.substring(idx + term.length));
}

function formatCellValue(val, fmt) {
  if (val == null || val === '') return '';
  if (!fmt || fmt === 'general') return val;

  const num = Number(val);
  if (!isNaN(num)) {
    switch (fmt) {
      case 'number':
        return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      case 'currency_inr':
        return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      case 'currency_usd':
        return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      case 'percent':
        return (num * 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
      case 'percent0':
        return (num * 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + '%';
      case 'integer':
        return Math.round(num).toLocaleString(undefined, { maximumFractionDigits: 0 });
    }
  }

  const date = new Date(val);
  if (!isNaN(date.getTime())) {
    const pad = (n) => String(n).padStart(2, '0');
    const dd = pad(date.getDate());
    const mm = pad(date.getMonth() + 1);
    const yyyy = date.getFullYear();
    switch (fmt) {
      case 'date_dmy': return `${dd}/${mm}/${yyyy}`;
      case 'date_mdy': return `${mm}/${dd}/${yyyy}`;
      case 'date_ymd': return `${yyyy}-${mm}-${dd}`;
    }
  }

  return val;
}

function getCellStyle(ri, ci) {
  let style = '';
  const key = `${ri}:${ci}`;
  if (cellFonts && cellFonts[key]) {
    const f = cellFonts[key];
    if (f === 'Krutidev 010') {
      style += "font-family: 'Krutidev 010', 'Krutidev-010', 'Krutidev010', 'KritiDev 010', 'Kruti Dev 010', sans-serif !important; ";
    } else if (f === 'Devlys 010') {
      style += "font-family: 'Devlys 010', 'Devlys-010', 'Devlys010', 'DevLys 010', sans-serif !important; ";
    } else if (f === 'Mangal') {
      style += "font-family: 'Mangal', 'Noto Sans Devanagari', 'NotoSansDevanagari', sans-serif !important; ";
    }
  }
  if (typeof cellBold !== 'undefined' && cellBold[key]) {
    style += 'font-weight: bold !important; ';
  }
  if (typeof cellItalic !== 'undefined' && cellItalic[key]) {
    style += 'font-style: italic !important; ';
  }
  if (typeof cellUnderline !== 'undefined' && cellUnderline[key]) {
    style += 'text-decoration: underline !important; ';
  }
  if (typeof cellFontSize !== 'undefined' && cellFontSize[key]) {
    style += `font-size: ${cellFontSize[key]}px !important; `;
  }
  if (typeof cellFontColor !== 'undefined' && cellFontColor[key]) {
    style += `color: ${cellFontColor[key]} !important; `;
  }
  if (typeof cellBgColor !== 'undefined' && cellBgColor[key]) {
    style += `background-color: ${cellBgColor[key]} !important; `;
  }
  if (typeof cellAlignments !== 'undefined' && cellAlignments[key]) {
    style += `text-align: ${cellAlignments[key]} !important; `;
  }
  if (typeof cellWraps !== 'undefined' && cellWraps[key]) {
    style += 'white-space: normal !important; word-wrap: break-word !important; ';
  }
  for (const rule of cfRules) {
    if (rule.col !== ci) continue;
    const val = String(rawData[ri][ci] || '');
    const numVal = parseFloat(val);
    const ruleNum = parseFloat(rule.value);
    let match = false;
    switch(rule.cond) {
      case 'gt': match = colTypes[ci]==='number' && !isNaN(numVal) ? numVal > ruleNum : val > rule.value; break;
      case 'lt': match = colTypes[ci]==='number' && !isNaN(numVal) ? numVal < ruleNum : val < rule.value; break;
      case 'eq': match = val === rule.value || (colTypes[ci]==='number' && numVal === ruleNum); break;
      case 'neq': match = val !== rule.value; break;
      case 'contains': match = val.toLowerCase().includes(rule.value.toLowerCase()); break;
      case 'between': {
        const rn2 = parseFloat(rule.value2);
        match = colTypes[ci]==='number' && !isNaN(numVal) ? (numVal >= ruleNum && numVal <= rn2) : (val >= rule.value && val <= rule.value2);
        break;
      }
    }
    if (match) {
      style += `background-color:${rule.color}30 !important;color:${darkenColor(rule.color)} !important;border-left:3px solid ${rule.color} !important;`;
    }
  }
  return style;
}

function getCellValidationClass(ri, ci) {
  for (const rule of validationRules) {
    if (rule.col !== ci) continue;
    const val = String(rawData[ri][ci] || '').trim();
    if (!validateCell(val, rule)) return 'cell-invalid';
  }
  return '';
}

function validateCell(val, rule) {
  switch (rule.type) {
    case 'required': return val !== '';
    case 'number': return val === '' || !isNaN(Number(val));
    case 'min': return val === '' || (Number(val) >= Number(rule.value));
    case 'max': return val === '' || (Number(val) <= Number(rule.value));
    case 'range': {
      const parts = rule.value.split('-');
      if (parts.length !== 2) return true;
      const n = Number(val);
      return val === '' || (!isNaN(n) && n >= Number(parts[0]) && n <= Number(parts[1]));
    }
    case 'maxlen': return val.length <= Number(rule.value);
    case 'regex': try { return val === '' || new RegExp(rule.value).test(val); } catch(e) { return true; }
    default: return true;
  }
}

function darkenColor(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgb(${Math.max(0,r-80)},${Math.max(0,g-80)},${Math.max(0,b-80)})`;
}

function setupScrollListener() {
  const container = document.getElementById('virtual-table-container');
  let ticking = false;
  container.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => { renderTable(); ticking = false; });
      ticking = true;
    }
  });
}

