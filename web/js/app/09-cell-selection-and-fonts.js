// =====================================================================
//  WORKSHEET CELL SELECTION & LOCAL FONT STYLING
// =====================================================================
function setupCellSelection() {
  const tbody = document.getElementById('vtbody');
  if (!tbody) return;

  tbody.addEventListener('mousedown', function(e) {
    const td = e.target.closest('td[data-ri]');
    if (!td || e.button === 2) return; // ignore right clicks

    const ri = parseInt(td.getAttribute('data-ri'));
    const ci = parseInt(td.getAttribute('data-ci'));
    const key = `${ri}:${ci}`;
    activeCell = { ri, ci };
    if (resultFocusKey && resultFocusKey !== key) resultFocusKey = null;

    if (e.ctrlKey || e.metaKey) {
      isSelecting = false;
      selectionMode = 'multi';
      if (selectionStart.ri === null) {
        selectionStart = { ri, ci };
        selectionEnd = { ri, ci };
      } else if (!(selectionStart.ri === ri && selectionStart.ci === ci && selectionEnd.ri === ri && selectionEnd.ci === ci)) {
        const existing = additionalSelections.findIndex(cell => cell.ri === ri && cell.ci === ci);
        if (existing >= 0) additionalSelections.splice(existing, 1);
        else additionalSelections.push({ ri, ci });
      }
      renderSelection();
      return;
    }

    isSelecting = true;
    additionalSelections = [];
    selectionMode = 'cell';
    if (e.shiftKey && selectionStart.ri !== null) {
      selectionEnd = { ri, ci };
    } else {
      selectionStart = { ri, ci };
      selectionEnd = { ri, ci };
    }
    renderSelection();
  });

  tbody.addEventListener('mouseover', function(e) {
    if (!isSelecting) return;
    const td = e.target.closest('td[data-ri]');
    if (!td) return;

    const ri = parseInt(td.getAttribute('data-ri'));
    const ci = parseInt(td.getAttribute('data-ci'));
    selectionEnd = { ri, ci };
    activeCell = { ri, ci };
    renderSelection();
  });

  tbody.addEventListener('pointerover', handleCursorFormulaHover);
  tbody.addEventListener('pointermove', handleCursorFormulaHover);
  tbody.addEventListener('pointerleave', hideCursorFormulaTooltip);

  window.addEventListener('mouseup', function() {
    isSelecting = false;
  });

  // Touch screen support
  tbody.addEventListener('touchstart', function(e) {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const td = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('td[data-ri]');
    if (!td) return;

    isSelecting = true;
    const ri = parseInt(td.getAttribute('data-ri'));
    const ci = parseInt(td.getAttribute('data-ci'));
    additionalSelections = [];
    selectionMode = 'cell';
    activeCell = { ri, ci };
    selectionStart = { ri, ci };
    selectionEnd = { ri, ci };
    renderSelection();
  }, { passive: true });

  tbody.addEventListener('touchmove', function(e) {
    if (!isSelecting || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const td = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('td[data-ri]');
    if (!td) return;

    const ri = parseInt(td.getAttribute('data-ri'));
    const ci = parseInt(td.getAttribute('data-ci'));

    if (ri !== selectionEnd.ri || ci !== selectionEnd.ci) {
      selectionEnd = { ri, ci };
      renderSelection();
    }
  }, { passive: true });

  tbody.addEventListener('touchend', function() {
    isSelecting = false;
  });
}

function isCellSelected(ri, ci) {
  if (additionalSelections.some(cell => cell.ri === ri && cell.ci === ci)) return true;
  if (selectionStart.ri === null || selectionEnd.ri === null) return false;
  const minRi = Math.min(selectionStart.ri, selectionEnd.ri);
  const maxRi = Math.max(selectionStart.ri, selectionEnd.ri);
  const minCi = Math.min(selectionStart.ci, selectionEnd.ci);
  const maxCi = Math.max(selectionStart.ci, selectionEnd.ci);
  return ri >= minRi && ri <= maxRi && ci >= minCi && ci <= maxCi;
}

function renderSelection() {
  const tds = document.querySelectorAll('#vtbody td[data-ri]');
  tds.forEach(td => {
    const ri = parseInt(td.getAttribute('data-ri'));
    const ci = parseInt(td.getAttribute('data-ci'));
    const isAdditional = additionalSelections.some(cell => cell.ri === ri && cell.ci === ci);
    if (isCellSelected(ri, ci)) {
      td.classList.add('cell-selected');
    } else {
      td.classList.remove('cell-selected');
    }
    td.classList.toggle('cell-multi-selected', isAdditional);
    td.classList.toggle('cell-active', activeCell.ri === ri && activeCell.ci === ci);
    td.classList.toggle('cell-result-focus', resultFocusKey === `${ri}:${ci}`);
  });
  renderTableHeader();
  updateToolbarStates();
  updateSelectedCellsStats();
  updateGuidedSelectionSummary();
  updateGuidedDestinationSummary();
  updateLiveInspector();
  if (typeof positionFillHandle !== 'undefined') positionFillHandle();
}

let isDraggingFill = false;
let dragStartRange = null;

function positionFillHandle() {
  let handle = document.getElementById('fill-handle');
  if (!handle) {
    handle = document.createElement('div');
    handle.id = 'fill-handle';
    handle.style.position = 'absolute';
    handle.style.width = '6px';
    handle.style.height = '6px';
    handle.style.background = 'var(--accent)';
    handle.style.border = '1px solid #ffffff';
    handle.style.cursor = 'crosshair';
    handle.style.zIndex = '100';
    handle.style.display = 'none';
    
    handle.addEventListener('mousedown', startDragFill);
    
    const container = document.getElementById('virtual-table-container');
    if (container) container.appendChild(handle);
  }

  if (selectionStart.ri === null || selectionEnd.ri === null) {
    handle.style.display = 'none';
    return;
  }

  const maxRi = Math.max(selectionStart.ri, selectionEnd.ri);
  const maxCi = Math.max(selectionStart.ci, selectionEnd.ci);

  const targetTd = document.querySelector(`#vtbody td[data-ri="${maxRi}"][data-ci="${maxCi}"]`);
  if (targetTd) {
    handle.style.display = 'block';
    
    const container = document.getElementById('virtual-table-container');
    const containerRect = container.getBoundingClientRect();
    const tdRect = targetTd.getBoundingClientRect();
    
    const left = tdRect.right - containerRect.left + container.scrollLeft - 4;
    const top = tdRect.bottom - containerRect.top + container.scrollTop - 4;
    
    handle.style.left = left + 'px';
    handle.style.top = top + 'px';
  } else {
    handle.style.display = 'none';
  }
}

function startDragFill(e) {
  e.preventDefault();
  e.stopPropagation();
  
  if (selectionStart.ri === null || selectionEnd.ri === null) return;
  
  isDraggingFill = true;
  dragStartRange = {
    minRi: Math.min(selectionStart.ri, selectionEnd.ri),
    maxRi: Math.max(selectionStart.ri, selectionEnd.ri),
    minCi: Math.min(selectionStart.ci, selectionEnd.ci),
    maxCi: Math.max(selectionStart.ci, selectionEnd.ci)
  };
  
  window.addEventListener('mousemove', dragFillMove);
  window.addEventListener('mouseup', dragFillUp);
}

function dragFillMove(e) {
  if (!isDraggingFill) return;
  
  const td = document.elementFromPoint(e.clientX, e.clientY)?.closest('td[data-ri]');
  if (!td) return;
  
  const ri = parseInt(td.getAttribute('data-ri'));
  const ci = parseInt(td.getAttribute('data-ci'));
  
  const dRow = Math.abs(ri - dragStartRange.maxRi);
  const dCol = Math.abs(ci - dragStartRange.maxCi);
  
  if (dRow > dCol) {
    selectionStart = { ri: dragStartRange.minRi, ci: dragStartRange.minCi };
    selectionEnd = { ri: ri, ci: dragStartRange.maxCi };
  } else {
    selectionStart = { ri: dragStartRange.minRi, ci: dragStartRange.minCi };
    selectionEnd = { ri: dragStartRange.maxRi, ci: ci };
  }
  renderSelection();
}

function dragFillUp(e) {
  if (!isDraggingFill) return;
  isDraggingFill = false;
  
  window.removeEventListener('mousemove', dragFillMove);
  window.removeEventListener('mouseup', dragFillUp);
  
  const targetMinRi = Math.min(selectionStart.ri, selectionEnd.ri);
  const targetMaxRi = Math.max(selectionStart.ri, selectionEnd.ri);
  const targetMinCi = Math.min(selectionStart.ci, selectionEnd.ci);
  const targetMaxCi = Math.max(selectionStart.ci, selectionEnd.ci);
  
  pushUndo();
  
  if (targetMaxRi > dragStartRange.maxRi || targetMinRi < dragStartRange.minRi) {
    for (let c = dragStartRange.minCi; c <= dragStartRange.maxCi; c++) {
      if (typeof hiddenCols !== 'undefined' && hiddenCols.has(c)) continue;
      const vals = [];
      for (let r = dragStartRange.minRi; r <= dragStartRange.maxRi; r++) {
        vals.push(rawData[r][c]);
      }
      
      const nums = vals.map(v => parseFloat(v));
      const allNums = vals.every(v => v !== '' && !isNaN(parseFloat(v)));
      
      if (targetMaxRi > dragStartRange.maxRi) {
        if (vals.length === 1) {
          let num = parseFloat(vals[0]);
          for (let r = dragStartRange.maxRi + 1; r <= targetMaxRi; r++) {
            if (!isNaN(num)) {
              num += 1;
              rawData[r][c] = String(num);
            } else {
              rawData[r][c] = vals[0];
            }
          }
        } else if (allNums) {
          const step = (nums[nums.length - 1] - nums[0]) / (nums.length - 1);
          for (let r = dragStartRange.maxRi + 1; r <= targetMaxRi; r++) {
            const val = nums[nums.length - 1] + step * (r - dragStartRange.maxRi);
            rawData[r][c] = String(parseFloat(val.toFixed(6)));
          }
        } else {
          for (let r = dragStartRange.maxRi + 1; r <= targetMaxRi; r++) {
            const offset = (r - dragStartRange.maxRi - 1) % vals.length;
            rawData[r][c] = vals[offset];
          }
        }
      }
      
      if (targetMinRi < dragStartRange.minRi) {
        if (vals.length === 1) {
          let num = parseFloat(vals[0]);
          for (let r = dragStartRange.minRi - 1; r >= targetMinRi; r--) {
            if (!isNaN(num)) {
              num -= 1;
              rawData[r][c] = String(num);
            } else {
              rawData[r][c] = vals[0];
            }
          }
        } else if (allNums) {
          const step = (nums[nums.length - 1] - nums[0]) / (nums.length - 1);
          for (let r = dragStartRange.minRi - 1; r >= targetMinRi; r--) {
            const val = nums[0] - step * (dragStartRange.minRi - r);
            rawData[r][c] = String(parseFloat(val.toFixed(6)));
          }
        } else {
          for (let r = dragStartRange.minRi - 1; r >= targetMinRi; r--) {
            const offset = (dragStartRange.minRi - 1 - r) % vals.length;
            rawData[r][c] = vals[vals.length - 1 - offset];
          }
        }
      }
    }
  } else if (targetMaxCi > dragStartRange.maxCi || targetMinCi < dragStartRange.minCi) {
    for (let r = dragStartRange.minRi; r <= dragStartRange.maxRi; r++) {
      const vals = [];
      for (let c = dragStartRange.minCi; c <= dragStartRange.maxCi; c++) {
        if (typeof hiddenCols !== 'undefined' && hiddenCols.has(c)) continue;
        vals.push(rawData[r][c]);
      }
      
      const nums = vals.map(v => parseFloat(v));
      const allNums = vals.every(v => v !== '' && !isNaN(parseFloat(v)));
      
      if (targetMaxCi > dragStartRange.maxCi) {
        if (vals.length === 1) {
          let num = parseFloat(vals[0]);
          for (let c = dragStartRange.maxCi + 1; c <= targetMaxCi; c++) {
            if (typeof hiddenCols !== 'undefined' && hiddenCols.has(c)) continue;
            if (!isNaN(num)) {
              num += 1;
              rawData[r][c] = String(num);
            } else {
              rawData[r][c] = vals[0];
            }
          }
        } else if (allNums) {
          const step = (nums[nums.length - 1] - nums[0]) / (nums.length - 1);
          for (let c = dragStartRange.maxCi + 1; c <= targetMaxCi; c++) {
            if (typeof hiddenCols !== 'undefined' && hiddenCols.has(c)) continue;
            const val = nums[nums.length - 1] + step * (c - dragStartRange.maxCi);
            rawData[r][c] = String(parseFloat(val.toFixed(6)));
          }
        } else {
          for (let c = dragStartRange.maxCi + 1; c <= targetMaxCi; c++) {
            if (typeof hiddenCols !== 'undefined' && hiddenCols.has(c)) continue;
            const offset = (c - dragStartRange.maxCi - 1) % vals.length;
            rawData[r][c] = vals[offset];
          }
        }
      }
      
      if (targetMinCi < dragStartRange.minCi) {
        if (vals.length === 1) {
          let num = parseFloat(vals[0]);
          for (let c = dragStartRange.minCi - 1; c >= targetMinCi; c--) {
            if (typeof hiddenCols !== 'undefined' && hiddenCols.has(c)) continue;
            if (!isNaN(num)) {
              num -= 1;
              rawData[r][c] = String(num);
            } else {
              rawData[r][c] = vals[0];
            }
          }
        } else if (allNums) {
          const step = (nums[nums.length - 1] - nums[0]) / (nums.length - 1);
          for (let c = dragStartRange.minCi - 1; c >= targetMinCi; c--) {
            if (typeof hiddenCols !== 'undefined' && hiddenCols.has(c)) continue;
            const val = nums[0] - step * (dragStartRange.minCi - c);
            rawData[r][c] = String(parseFloat(val.toFixed(6)));
          }
        } else {
          for (let c = dragStartRange.minCi - 1; c >= targetMinCi; c--) {
            if (typeof hiddenCols !== 'undefined' && hiddenCols.has(c)) continue;
            const offset = (dragStartRange.minCi - 1 - c) % vals.length;
            rawData[r][c] = vals[vals.length - 1 - offset];
          }
        }
      }
    }
  }
  
  renderTable();
  renderSelection();
  toast('Cells filled', 'success');
}

function updateToolbarStates() {
  const select = document.getElementById('fontSelect');
  const sizeSelect = document.getElementById('fontSizeSelect');
  const btnBold = document.getElementById('btn-bold');
  const btnItalic = document.getElementById('btn-italic');
  const btnUnderline = document.getElementById('btn-underline');

  if (selectionStart.ri !== null) {
    const key = `${selectionStart.ri}:${selectionStart.ci}`;
    
    if (select) select.value = cellFonts[key] || 'default';
    if (sizeSelect) sizeSelect.value = cellFontSize[key] || '12';
    
    if (btnBold) {
      if (cellBold[key]) btnBold.classList.add('active');
      else btnBold.classList.remove('active');
    }
    if (btnItalic) {
      if (cellItalic[key]) btnItalic.classList.add('active');
      else btnItalic.classList.remove('active');
    }
    if (btnUnderline) {
      if (cellUnderline[key]) btnUnderline.classList.add('active');
      else btnUnderline.classList.remove('active');
    }
  } else {
    if (select) select.value = '';
    if (sizeSelect) sizeSelect.value = '';
    if (btnBold) btnBold.classList.remove('active');
    if (btnItalic) btnItalic.classList.remove('active');
    if (btnUnderline) btnUnderline.classList.remove('active');
  }
}

function updateSelectedCellsStats() {
  const sumEl = document.getElementById('statSum');
  const avgEl = document.getElementById('statAvg');
  const cntEl = document.getElementById('statCount');
  const minEl = document.getElementById('statMin');
  const maxEl = document.getElementById('statMax');
  if (!sumEl) return;

  const selectedCells = getSelectedCellCoordinates();
  if (!selectedCells.length) {
    sumEl.classList.add('hidden');
    avgEl.classList.add('hidden');
    cntEl.classList.add('hidden');
    minEl.classList.add('hidden');
    maxEl.classList.add('hidden');
    document.getElementById('statusSelection').textContent = '';
    return;
  }

  let sum = 0;
  let numericCount = 0;
  let min = Infinity;
  let max = -Infinity;

  selectedCells.forEach(({ ri, ci }) => {
    const val = rawData[ri] ? rawData[ri][ci] : '';
    if (val !== undefined && val !== null && val !== '') {
      const num = parseFlexibleNumber(val);
      if (num !== null) {
        sum += num;
        numericCount++;
        if (num < min) min = num;
        if (num > max) max = num;
      }
    }
  });

  const selectionAddress = getSelectionAddress();
  document.getElementById('statusSelection').textContent = `Selection: ${selectionAddress} (${selectedCells.length} cell${selectedCells.length === 1 ? '' : 's'})`;

  if (numericCount > 0) {
    const avg = sum / numericCount;
    document.getElementById('statSumVal').textContent = formatNum(sum);
    document.getElementById('statAvgVal').textContent = formatNum(avg);
    document.getElementById('statCountVal').textContent = numericCount;
    document.getElementById('statMinVal').textContent = formatNum(min);
    document.getElementById('statMaxVal').textContent = formatNum(max);

    sumEl.classList.remove('hidden');
    avgEl.classList.remove('hidden');
    cntEl.classList.remove('hidden');
    minEl.classList.remove('hidden');
    maxEl.classList.remove('hidden');
  } else {
    sumEl.classList.add('hidden');
    avgEl.classList.add('hidden');
    cntEl.classList.add('hidden');
    minEl.classList.add('hidden');
    maxEl.classList.add('hidden');
  }
}

function getSelectedCellCoordinates() {
  const cells = new Map();
  if (selectionStart.ri !== null && selectionEnd.ri !== null) {
    const minRi = Math.min(selectionStart.ri, selectionEnd.ri);
    const maxRi = Math.max(selectionStart.ri, selectionEnd.ri);
    const minCi = Math.min(selectionStart.ci, selectionEnd.ci);
    const maxCi = Math.max(selectionStart.ci, selectionEnd.ci);
    for (let ri = minRi; ri <= maxRi; ri++) {
      for (let ci = minCi; ci <= maxCi; ci++) cells.set(`${ri}:${ci}`, { ri, ci });
    }
  }
  additionalSelections.forEach(cell => cells.set(`${cell.ri}:${cell.ci}`, cell));
  return Array.from(cells.values());
}

function getSelectionAddress() {
  if (selectionStart.ri === null || selectionEnd.ri === null) return 'No selection';
  const start = getCellRef(Math.min(selectionStart.ri, selectionEnd.ri), Math.min(selectionStart.ci, selectionEnd.ci));
  const end = getCellRef(Math.max(selectionStart.ri, selectionEnd.ri), Math.max(selectionStart.ci, selectionEnd.ci));
  const primary = start === end ? start : `${start}:${end}`;
  const extras = additionalSelections.map(cell => getCellRef(cell.ri, cell.ci));
  return [primary, ...extras].join(', ');
}

function getColumnLetter(ci) {
  return getCellRef(0, ci).replace(/\d+$/, '');
}

function getCellRef(ri, ci) {
  let colLetter = '';
  let temp = ci;
  while (temp >= 0) {
    colLetter = String.fromCharCode((temp % 26) + 65) + colLetter;
    temp = Math.floor(temp / 26) - 1;
  }
  return `${colLetter}${ri + 1}`;
}

function selectWorksheetColumn(ci, event) {
  if (event) event.stopPropagation();
  if (!rawData.length) return;
  additionalSelections = [];
  selectionMode = 'column';
  selectionStart = { ri: 0, ci };
  selectionEnd = { ri: rawData.length - 1, ci };
  activeCell = { ri: 0, ci };
  resultFocusKey = null;
  renderSelection();
}

function selectWorksheetRow(ri, event) {
  if (event) event.stopPropagation();
  if (!headers.length) return;
  additionalSelections = [];
  selectionMode = 'row';
  selectionStart = { ri, ci: 0 };
  selectionEnd = { ri, ci: headers.length - 1 };
  activeCell = { ri, ci: 0 };
  resultFocusKey = null;
  renderSelection();
}

function getSelectionTypeLabel() {
  const count = getSelectedCellCoordinates().length;
  if (!count) return 'None';
  if (selectionMode === 'column') return `Column · ${headers[selectionStart.ci] || getColumnLetter(selectionStart.ci)}`;
  if (selectionMode === 'row') return `Row ${selectionStart.ri + 1}`;
  if (additionalSelections.length) return `Multi-select · ${count} cells`;
  if (count === 1) return 'Single cell';
  const bounds = getSelectionBounds();
  return `Range · ${count} cells · ${bounds.maxRi - bounds.minRi + 1} rows × ${bounds.maxCi - bounds.minCi + 1} columns`;
}

function updateLiveInspector(metaOverride = null) {
  const selectedCells = getSelectedCellCoordinates();
  const current = activeCell.ri !== null ? activeCell : selectionEnd;
  const activeRef = current && current.ri !== null ? getCellRef(current.ri, current.ci) : '-';
  const activeValue = current && current.ri !== null ? rawData[current.ri]?.[current.ci] ?? '' : '';
  const meta = metaOverride || (current && current.ri !== null ? cellFormulaMeta[`${current.ri}:${current.ci}`] : null);

  const selectionEl = document.getElementById('inspectorSelection');
  const typeEl = document.getElementById('inspectorSelectionType');
  const activeEl = document.getElementById('inspectorActiveCell');
  const formulaEl = document.getElementById('inspectorFormula');
  const sourceEl = document.getElementById('inspectorSource');
  const resultEl = document.getElementById('inspectorResult');
  const nameBox = document.getElementById('activeCellName');
  if (!selectionEl) return;

  selectionEl.textContent = selectedCells.length ? getSelectionAddress() : 'No selection';
  typeEl.textContent = getSelectionTypeLabel();
  activeEl.textContent = activeRef;
  formulaEl.textContent = meta?.formula || 'No formula';
  sourceEl.textContent = meta?.source || '-';
  resultEl.textContent = meta ? formatInspectorValue(meta.result) : (activeValue === '' ? '-' : formatInspectorValue(activeValue));
  if (nameBox) nameBox.textContent = selectedCells.length ? getSelectionAddress() : 'No selection';

  const formulaInput = document.getElementById('formulaInput');
  if (formulaInput && document.activeElement !== formulaInput) formulaInput.value = meta?.formula || '';

  document.getElementById('provenanceSource').textContent = meta?.source || 'Select a calculated cell';
  document.getElementById('provenanceSourceNote').textContent = meta?.sourceLabel || 'The input cells will appear here.';
  document.getElementById('provenanceFormula').textContent = meta?.formula || 'No formula selected';
  document.getElementById('provenanceFormulaNote').textContent = meta?.label || 'Calculation method';
  document.getElementById('provenanceResult').textContent = meta ? formatInspectorValue(meta.result) : '-';
}

function formatInspectorValue(value) {
  const numeric = parseFlexibleNumber(value);
  if (numeric !== null && String(value).trim() !== '') return formatNum(numeric);
  return String(value ?? '-');
}

function registerFormulaResult(ri, ci, meta) {
  cellFormulaMeta[`${ri}:${ci}`] = {
    formula: meta.formula || 'Calculated value',
    source: meta.source || '-',
    sourceLabel: meta.sourceLabel || '',
    label: meta.label || 'Formula result',
    result: meta.result,
    calculatedAt: new Date().toISOString()
  };
}

function registerCalculatedColumnMetadata(ci, formula, sourceColumns, label) {
  rawData.forEach((row, ri) => {
    const sources = sourceColumns.map(sourceCi => getCellRef(ri, sourceCi)).join(', ');
    registerFormulaResult(ri, ci, {
      formula,
      source: sources,
      sourceLabel: sourceColumns.map(sourceCi => headers[sourceCi]).join(', '),
      label,
      result: row[ci]
    });
  });
}

function focusResultCell(ri, ci) {
  selectionStart = { ri, ci };
  selectionEnd = { ri, ci };
  activeCell = { ri, ci };
  additionalSelections = [];
  selectionMode = 'cell';
  resultFocusKey = `${ri}:${ci}`;
  const container = document.getElementById('virtual-table-container');
  if (container) {
    container.scrollTop = Math.max(0, (ri * ROW_HEIGHT * worksheetZoom / 100) - container.clientHeight / 2);
    const targetLeft = Math.max(0, ci * 110 * worksheetZoom / 100 - container.clientWidth / 2);
    container.scrollLeft = targetLeft;
  }
  renderTable();
  renderSelection();
  setTimeout(() => {
    const td = document.querySelector(`#vtbody td[data-ri="${ri}"][data-ci="${ci}"]`);
    if (td) td.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }, 40);
}

function showCursorFormulaTooltip(event, ri, ci, meta) {
  const tooltip = document.getElementById('cursorFormulaTooltip');
  if (!tooltip) return;
  tooltip.innerHTML = `<strong>${getCellRef(ri, ci)} · ${escHtml(meta.label || 'Calculated result')}</strong>${escHtml(meta.formula)}<br>Source: ${escHtml(meta.source)}<br>Result: ${escHtml(formatInspectorValue(meta.result))}`;
  tooltip.style.display = 'block';
  tooltip.style.left = `${Math.min(window.innerWidth - 315, event.clientX + 14)}px`;
  tooltip.style.top = `${Math.min(window.innerHeight - 120, event.clientY + 14)}px`;
  updateLiveInspector(meta);
}

function hideCursorFormulaTooltip() {
  const tooltip = document.getElementById('cursorFormulaTooltip');
  if (tooltip) tooltip.style.display = 'none';
  cursorFormulaHoverKey = null;
  updateLiveInspector();
}

// Handles pointer hover over cells to show formula metadata tooltip
function handleCursorFormulaHover(e) {
  if (!cursorIntelligenceEnabled) return;
  const td = e.target.closest('td[data-ri]');
  if (!td) { hideCursorFormulaTooltip(); return; }
  const ri = parseInt(td.getAttribute('data-ri'));
  const ci = parseInt(td.getAttribute('data-ci'));
  const key = `${ri}:${ci}`;
  if (key === cursorFormulaHoverKey) return; // already showing for this cell
  cursorFormulaHoverKey = key;
  const meta = cellFormulaMeta[key];
  if (meta) {
    showCursorFormulaTooltip(e, ri, ci, meta);
  } else {
    hideCursorFormulaTooltip();
  }
}

// Copies active cell reference into the guided formula target cell input
function useActiveCellAsGuidedTarget() {
  if (activeCell.ri === null) {
    toast(uiLanguage === 'hi' ? 'पहले वर्कशीट में एक सेल चुनें' : 'First click a cell in the worksheet', 'info');
    return;
  }
  const ref = getCellRef(activeCell.ri, activeCell.ci);
  const destSel = document.getElementById('guidedDestination');
  const input = document.getElementById('guidedTargetCell');
  if (destSel) destSel.value = 'cell';
  if (input) input.value = ref;
  updateGuidedControls();
  updateGuidedDestinationSummary();
  toast(`${uiLanguage === 'hi' ? 'लक्ष्य सेल सेट किया:' : 'Target cell set to'} ${ref}`, 'success');
}

// Updates the destination description text in the guided formula panel
function updateGuidedDestinationSummary() {
  const summary = document.getElementById('guidedDestinationSummary');
  if (!summary) return;
  const destination = document.getElementById('guidedDestination')?.value;
  if (destination === 'selected') {
    const bounds = getSelectionBounds();
    const refText = bounds ? ` (${getCellRef(bounds.minRi, bounds.minCi)})` : '';
    summary.textContent = uiLanguage === 'hi'
      ? `परिणाम चयनित सेल${refText} में डाला जाएगा।`
      : `Result will be inserted into the currently selected cell${refText}.`;
  } else if (destination === 'cell') {
    const cellRef = document.getElementById('guidedTargetCell')?.value?.trim().toUpperCase();
    summary.textContent = cellRef
      ? (uiLanguage === 'hi' ? `परिणाम सेल ${cellRef} में डाला जाएगा।` : `Result will be inserted into cell ${cellRef}.`)
      : (uiLanguage === 'hi' ? 'ऊपर लक्ष्य सेल का पता लिखें, जैसे H2।' : 'Enter the target cell address above, e.g. H2.');
  } else if (destination === 'below') {
    summary.textContent = uiLanguage === 'hi' ? 'परिणाम स्रोत कॉलम के अंतिम सेल के नीचे रखा जाएगा।' : 'Result will be placed below the last row of the source column.';
  } else if (destination === 'right') {
    summary.textContent = uiLanguage === 'hi' ? 'परिणाम स्रोत पंक्ति के दाईं ओर एक नए कॉलम में रखा जाएगा।' : 'Result will be placed to the right of the source row in a new column.';
  } else if (destination === 'kpi') {
    summary.textContent = uiLanguage === 'hi' ? 'परिणाम डैशबोर्ड KPI कार्ड के रूप में दिखाई देगा।' : 'Result will appear as a Dashboard KPI card (no cell change).';
  } else if (destination === 'preview') {
    summary.textContent = uiLanguage === 'hi' ? 'परिणाम केवल पूर्वावलोकन में दिखेगा — कोई डेटा परिवर्तन नहीं।' : 'Result will only be shown in the preview — no data change.';
  }
}

function toggleCursorIntelligence() {
  cursorIntelligenceEnabled = !cursorIntelligenceEnabled;
  localStorage.setItem('pragya_cursor_intelligence', String(cursorIntelligenceEnabled));
  const control = document.getElementById('cursorIntelligenceSwitch');
  if (control) {
    control.classList.toggle('on', cursorIntelligenceEnabled);
    control.setAttribute('aria-checked', String(cursorIntelligenceEnabled));
  }
  if (!cursorIntelligenceEnabled) hideCursorFormulaTooltip();
}

function toggleLiveInspector() {
  liveInspectorEnabled = !liveInspectorEnabled;
  localStorage.setItem('pragya_live_inspector', String(liveInspectorEnabled));
  const inspector = document.getElementById('live-inspector');
  const button = document.getElementById('inspectorToggleBtn');
  if (inspector) inspector.classList.toggle('hidden', !liveInspectorEnabled);
  if (button) button.classList.toggle('active', liveInspectorEnabled);
}

function applyWorkspacePreferences() {
  const inspector = document.getElementById('live-inspector');
  const inspectorButton = document.getElementById('inspectorToggleBtn');
  const cursorSwitch = document.getElementById('cursorIntelligenceSwitch');
  if (inspector) inspector.classList.toggle('hidden', !liveInspectorEnabled);
  if (inspectorButton) inspectorButton.classList.toggle('active', liveInspectorEnabled);
  if (cursorSwitch) {
    cursorSwitch.classList.toggle('on', cursorIntelligenceEnabled);
    cursorSwitch.setAttribute('aria-checked', String(cursorIntelligenceEnabled));
  }
  setWorksheetZoom(worksheetZoom);
}

function changeWorksheetZoom(delta) {
  setWorksheetZoom(worksheetZoom + delta);
}

function setWorksheetZoom(value) {
  worksheetZoom = Math.max(60, Math.min(180, Number(value) || 100));
  localStorage.setItem('pragya_zoom', String(worksheetZoom));
  const table = document.getElementById('virtual-table');
  if (table) table.style.zoom = String(worksheetZoom / 100);
  const zoomValue = document.getElementById('zoomValue');
  if (zoomValue) zoomValue.textContent = `${worksheetZoom}%`;
  if (rawData.length) renderTable();
}

function stepSelectionFontSize(delta) {
  const current = parseInt(document.getElementById('fontSizeSelect')?.value || '12', 10);
  const next = Math.max(8, Math.min(48, current + delta));
  const select = document.getElementById('fontSizeSelect');
  if (select && !Array.from(select.options).some(option => parseInt(option.value, 10) === next)) {
    select.add(new Option(String(next), String(next)));
  }
  if (select) select.value = String(next);
  setCellFontSize(String(next));
}

function autoFormatWorksheet() {
  if (!rawData.length) { toast('Import data first', 'warning'); return; }
  pushUndo();
  rawData = rawData.map(row => row.map(value => String(value ?? '').trim()));
  headers = headers.map(header => String(header ?? '').trim() || 'Untitled Column');
  headers.forEach((header, ci) => {
    let maxLen = header.length;
    rawData.forEach((row, ri) => {
      const value = String(row[ci] ?? '');
      maxLen = Math.max(maxLen, value.length);
      const key = `${ri}:${ci}`;
      cellAlignments[key] = parseFlexibleNumber(value) !== null ? 'right' : 'left';
      if (value.length > 28 || /\n/.test(value)) cellWraps[key] = true;
      else delete cellWraps[key];
    });
    colWidths[ci] = Math.min(Math.max(maxLen * 7.4 + 28, 92), 280);
  });
  detectTypes();
  autoSave();
  renderTableHeader();
  renderTable();
  renderSelection();
  toast('Smart formatting applied: spaces trimmed, columns fitted, text wrapped and values aligned', 'success');
}

function toggleCellFormat(type) {
  if (selectionStart.ri === null || selectionEnd.ri === null) {
    toast('Please select cells first', 'warning');
    return;
  }
  pushUndo();
  const minRi = Math.min(selectionStart.ri, selectionEnd.ri);
  const maxRi = Math.max(selectionStart.ri, selectionEnd.ri);
  const minCi = Math.min(selectionStart.ci, selectionEnd.ci);
  const maxCi = Math.max(selectionStart.ci, selectionEnd.ci);

  const startKey = `${minRi}:${minCi}`;
  let targetMap;
  if (type === 'bold') targetMap = cellBold;
  else if (type === 'italic') targetMap = cellItalic;
  else if (type === 'underline') targetMap = cellUnderline;

  const turnOn = !targetMap[startKey];

  for (let ri = minRi; ri <= maxRi; ri++) {
    for (let ci = minCi; ci <= maxCi; ci++) {
      const key = `${ri}:${ci}`;
      if (turnOn) {
        targetMap[key] = true;
      } else {
        delete targetMap[key];
      }
    }
  }

  autoSave();
  renderTable();
  toast(`Cell ${type} toggled`, 'success');
}

function setCellFontSize(size) {
  if (selectionStart.ri === null || selectionEnd.ri === null) return;
  pushUndo();
  const minRi = Math.min(selectionStart.ri, selectionEnd.ri);
  const maxRi = Math.max(selectionStart.ri, selectionEnd.ri);
  const minCi = Math.min(selectionStart.ci, selectionEnd.ci);
  const maxCi = Math.max(selectionStart.ci, selectionEnd.ci);

  for (let ri = minRi; ri <= maxRi; ri++) {
    for (let ci = minCi; ci <= maxCi; ci++) {
      const key = `${ri}:${ci}`;
      if (!size) delete cellFontSize[key];
      else cellFontSize[key] = size;
    }
  }
  autoSave();
  renderTable();
}

function setCellColor(type, color) {
  if (selectionStart.ri === null || selectionEnd.ri === null) return;
  pushUndo();
  const minRi = Math.min(selectionStart.ri, selectionEnd.ri);
  const maxRi = Math.max(selectionStart.ri, selectionEnd.ri);
  const minCi = Math.min(selectionStart.ci, selectionEnd.ci);
  const maxCi = Math.max(selectionStart.ci, selectionEnd.ci);

  const targetMap = type === 'font' ? cellFontColor : cellBgColor;
  const barEl = document.getElementById(type === 'font' ? 'fontColorBar' : 'bgColorBar');
  if (barEl) barEl.style.background = color;

  for (let ri = minRi; ri <= maxRi; ri++) {
    for (let ci = minCi; ci <= maxCi; ci++) {
      const key = `${ri}:${ci}`;
      targetMap[key] = color;
    }
  }
  autoSave();
  renderTable();
}

function alignSelection(align) {
  if (selectionStart.ri === null || selectionEnd.ri === null) return;
  pushUndo();
  const minRi = Math.min(selectionStart.ri, selectionEnd.ri);
  const maxRi = Math.max(selectionStart.ri, selectionEnd.ri);
  const minCi = Math.min(selectionStart.ci, selectionEnd.ci);
  const maxCi = Math.max(selectionStart.ci, selectionEnd.ci);

  for (let ri = minRi; ri <= maxRi; ri++) {
    for (let ci = minCi; ci <= maxCi; ci++) {
      const key = `${ri}:${ci}`;
      cellAlignments[key] = align;
    }
  }
  autoSave();
  renderTable();
}

function toggleWrapSelection() {
  if (selectionStart.ri === null || selectionEnd.ri === null) return;
  pushUndo();
  const minRi = Math.min(selectionStart.ri, selectionEnd.ri);
  const maxRi = Math.max(selectionStart.ri, selectionEnd.ri);
  const minCi = Math.min(selectionStart.ci, selectionEnd.ci);
  const maxCi = Math.max(selectionStart.ci, selectionEnd.ci);

  const startKey = `${minRi}:${minCi}`;
  const turnOn = !cellWraps[startKey];

  for (let ri = minRi; ri <= maxRi; ri++) {
    for (let ci = minCi; ci <= maxCi; ci++) {
      const key = `${ri}:${ci}`;
      if (turnOn) cellWraps[key] = true;
      else delete cellWraps[key];
    }
  }
  autoSave();
  renderTable();
}

function applyNumFormat(fmt) {
  if (selectionStart.ri === null || selectionEnd.ri === null) return;
  pushUndo();
  const minRi = Math.min(selectionStart.ri, selectionEnd.ri);
  const maxRi = Math.max(selectionStart.ri, selectionEnd.ri);
  const minCi = Math.min(selectionStart.ci, selectionEnd.ci);
  const maxCi = Math.max(selectionStart.ci, selectionEnd.ci);

  for (let ri = minRi; ri <= maxRi; ri++) {
    for (let ci = minCi; ci <= maxCi; ci++) {
      const key = `${ri}:${ci}`;
      if (fmt === 'general') delete cellNumFormats[key];
      else cellNumFormats[key] = fmt;
    }
  }
  
  const menu = document.getElementById('numFmtMenu');
  if (menu) menu.classList.remove('open');

  autoSave();
  renderTable();
}

function toggleNumFmtMenu() {
  const menu = document.getElementById('numFmtMenu');
  if (menu) menu.classList.toggle('open');
}

function autoFitColumns() {
  pushUndo();
  headers.forEach((h, ci) => {
    let maxLen = h.length;
    rawData.forEach(row => {
      const val = formatCellValue(String(row[ci] != null ? row[ci] : ''), cellNumFormats[`${rawData.indexOf(row)}:${ci}`]);
      if (val.length > maxLen) maxLen = val.length;
    });
    colWidths[ci] = Math.min(Math.max(maxLen * 8 + 20, 80), 300);
  });
  autoSave();
  renderTable();
  toast('Columns auto-fitted', 'success');
}

function toggleFmtToolbar() {
  const tb = document.getElementById('fmt-toolbar');
  if (tb) tb.classList.toggle('visible');
}

function mergeSelectedCells() {
  if (selectionStart.ri === null || selectionEnd.ri === null) return;
  pushUndo();
  const sri = Math.min(selectionStart.ri, selectionEnd.ri);
  const eri = Math.max(selectionStart.ri, selectionEnd.ri);
  const sci = Math.min(selectionStart.ci, selectionEnd.ci);
  const eci = Math.max(selectionStart.ci, selectionEnd.ci);

  if (sri === eri && sci === eci) {
    toast('Select a range of cells to merge', 'warning');
    return;
  }

  mergedCells = mergedCells.filter(m => {
    const overlap = !(eri < m.sri || sri > m.eri || eci < m.sci || sci > m.eci);
    return !overlap;
  });

  mergedCells.push({ sri, sci, eri, eci });
  autoSave();
  renderTable();
  toast('Cells merged', 'success');
}

function demergeSelectedCells() {
  if (selectionStart.ri === null || selectionEnd.ri === null) return;
  pushUndo();
  const sri = Math.min(selectionStart.ri, selectionEnd.ri);
  const eri = Math.max(selectionStart.ri, selectionEnd.ri);
  const sci = Math.min(selectionStart.ci, selectionEnd.ci);
  const eci = Math.max(selectionStart.ci, selectionEnd.ci);

  mergedCells = mergedCells.filter(m => {
    const intersect = !(eri < m.sri || sri > m.eri || eci < m.sci || sci > m.eci);
    return !intersect;
  });

  autoSave();
  renderTable();
  toast('Cells split', 'success');
}

function applyFontToSelection(fontName) {
  if (selectionStart.ri === null || selectionEnd.ri === null) {
    toast('Please select cells to apply font', 'warning');
    return;
  }

  pushUndo();

  const minRi = Math.min(selectionStart.ri, selectionEnd.ri);
  const maxRi = Math.max(selectionStart.ri, selectionEnd.ri);
  const minCi = Math.min(selectionStart.ci, selectionEnd.ci);
  const maxCi = Math.max(selectionStart.ci, selectionEnd.ci);

  for (let ri = minRi; ri <= maxRi; ri++) {
    for (let ci = minCi; ci <= maxCi; ci++) {
      const key = `${ri}:${ci}`;
      if (fontName === 'default' || !fontName) {
        delete cellFonts[key];
      } else {
        cellFonts[key] = fontName;
      }
    }
  }

  autoSave();
  renderTable();
  toast(`Font '${fontName || 'Default'}' applied to selection`, 'success');
}

function selectAllWorksheetCells() {
  if (rawData.length === 0) return;
  selectionStart = { ri: 0, ci: 0 };
  selectionEnd = { ri: rawData.length - 1, ci: headers.length - 1 };
  activeCell = { ri: 0, ci: 0 };
  additionalSelections = [];
  selectionMode = 'range';
  renderSelection();
  toast('All worksheet cells selected', 'success');
}

