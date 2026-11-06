// =====================================================================
//  CELL EDITING
// =====================================================================
function editCell(ri, ci, el) {
  const cur = rawData[ri][ci];
  activeCell = { ri, ci };
  selectionStart = { ri, ci };
  selectionEnd = { ri, ci };
  additionalSelections = [];
  selectionMode = 'cell';
  if (resultFocusKey !== `${ri}:${ci}`) resultFocusKey = null;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = cur;
  input.style.cssText = 'width:100%;height:100%;border:2px solid var(--accent);padding:2px 6px;font-size:12px;outline:none;border-radius:3px;background:var(--card-bg);color:var(--text-primary)';
  el.textContent = '';
  el.appendChild(input);
  input.focus();
  input.select();
  let committed = false;
  const finish = () => {
    if (committed) return;
    committed = true;
    if (input.value !== cur) {
      pushUndo();
      rawData[ri][ci] = input.value;
      delete cellFormulaMeta[`${ri}:${ci}`];
      if (typeof _pvLog === 'function') _pvLog({actor:'user',action:'EDIT',method:'direct_edit',target:'cell:R'+ri+':C'+ci,inputs:['cell:R'+ri+':C'+ci],output:'col:'+(headers[ci]||'col'+ci),label:'Edited ['+String(headers[ci]||'col'+ci)+', row '+(ri+1)+'] → "'+String(input.value).slice(0,80)+'"',labelHi:'['+String(headers[ci]||'col'+ci)+', पंक्ति '+(ri+1)+'] संपादित → "'+String(input.value).slice(0,40)+'"'});
    }
    renderTable();
    renderSelection();
    autoSave();
  };
  input.addEventListener('blur', finish);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(); }
    if (e.key === 'Escape') { input.value = cur; finish(); }
    if (e.key === 'Tab') {
      e.preventDefault();
      resultFocusKey = null;
      finish();

      let nextRi = ri;
      let nextCi = ci + (e.shiftKey ? -1 : 1);
      if (nextCi >= headers.length) {
        nextCi = 0;
        nextRi += 1;
      } else if (nextCi < 0) {
        nextCi = headers.length - 1;
        nextRi -= 1;
      }

      if (nextRi >= 0 && nextRi < rawData.length) {
        moveActiveSelection(nextRi, nextCi);
        setTimeout(() => {
          const nextTd = document.querySelector(`#vtbody td[data-ri="${nextRi}"][data-ci="${nextCi}"]`);
          if (nextTd) editCell(nextRi, nextCi, nextTd);
        }, 50);
      }
    }
  });
}

// =====================================================================
//  SORTING
// =====================================================================
function handleSort(ci) {
  if (sortCol === ci) {
    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    sortCol = ci;
    sortDir = 'asc';
  }
  if (rawData.length > 0) {
    selectionStart = { ri: 0, ci: ci };
    selectionEnd = { ri: rawData.length - 1, ci: ci };
    activeCell = { ri: 0, ci };
    additionalSelections = [];
    selectionMode = 'column';
  }
  renderTableHeader();
  renderTable();
  renderSelection();
}

// =====================================================================
//  SEARCH
// =====================================================================
function applySearch() {
  searchTerm = document.getElementById('searchInput').value.trim();
  searchMatches = [];
  searchMatchIdx = -1;

  if (searchTerm) {
    const indices = getDisplayData();
    const s = searchTerm.toLowerCase();
    indices.forEach(ri => {
      rawData[ri].forEach((c, ci) => {
        if (String(c).toLowerCase().includes(s)) {
          searchMatches.push({ ri, ci });
        }
      });
    });
    document.getElementById('searchNav').style.display = 'flex';
    document.getElementById('searchCount').textContent = `${searchMatches.length} found`;
    if (searchMatches.length > 0) searchMatchIdx = 0;
  } else {
    document.getElementById('searchNav').style.display = 'none';
  }
  renderTable();
  updateStatus();
}

function searchNext() {
  if (searchMatches.length === 0) return;
  searchMatchIdx = (searchMatchIdx + 1) % searchMatches.length;
  scrollToMatch();
}

function searchPrev() {
  if (searchMatches.length === 0) return;
  searchMatchIdx = (searchMatchIdx - 1 + searchMatches.length) % searchMatches.length;
  scrollToMatch();
}

function scrollToMatch() {
  const match = searchMatches[searchMatchIdx];
  if (!match) return;
  const indices = getDisplayData();
  const visIdx = indices.indexOf(match.ri);
  if (visIdx >= 0) {
    const container = document.getElementById('virtual-table-container');
    container.scrollTop = visIdx * ROW_HEIGHT - container.clientHeight / 2;
    renderTable();
  }
  document.getElementById('searchCount').textContent = `${searchMatchIdx+1}/${searchMatches.length}`;
}

// =====================================================================
//  ROW OPERATIONS
// =====================================================================
function toggleSelectAll(checked) {
  const indices = getDisplayData();
  if (checked) {
    indices.forEach(ri => selectedRows.add(ri));
  } else {
    selectedRows.clear();
  }
  renderTable();
  updateSelectionStatus();
}

function toggleRowSelect(ri, checked) {
  if (checked) selectedRows.add(ri);
  else selectedRows.delete(ri);
  updateSelectionStatus();
}

function updateSelectionStatus() {
  const btn = document.getElementById('btnDeleteRows');
  if (selectedRows.size > 0) {
    btn.style.display = 'flex';
    document.getElementById('statusSelection').textContent = `${selectedRows.size} rows selected`;
    // Calculate selection stats
    const selIndices = [...selectedRows];
    let nums = [];
    headers.forEach((_, ci) => {
      if (colTypes[ci] === 'number') {
        selIndices.forEach(ri => {
          const v = parseFloat(rawData[ri][ci]);
          if (!isNaN(v)) nums.push(v);
        });
      }
    });
    if (nums.length > 0) {
      const sum = nums.reduce((a,b)=>a+b,0);
      const avg = sum / nums.length;
      document.getElementById('statusSelection').textContent += ` | Sum: ${formatNum(sum)} | Avg: ${formatNum(avg)}`;
    }
  } else {
    btn.style.display = 'none';
    document.getElementById('statusSelection').textContent = '';
  }
}

function addNewRow() {
  if (headers.length === 0) return;
  pushUndo();
  rawData.push(new Array(headers.length).fill(''));
  renderTable();
  updateStatus();
  toast('New row added', 'success');
  const container = document.getElementById('virtual-table-container');
  container.scrollTop = container.scrollHeight;
}

function deleteSelectedRows() {
  if (selectedRows.size === 0) return;
  pushUndo();
  const toDelete = new Set(selectedRows);
  rawData = rawData.filter((_, i) => !toDelete.has(i));
  selectedRows.clear();
  filteredData = null;
  activeFilters = [];
  showTable();
  toast(`Deleted ${toDelete.size} rows`, 'success');
}

// =====================================================================
//  COLUMN RESIZE
// =====================================================================
function startResize(e, ci) {
  e.stopPropagation();
  e.preventDefault();
  resizingCol = ci;
  resizeStartX = e.pageX;
  const th = e.target.parentElement;
  const startWidth = th.offsetWidth;

  function onMove(ev) {
    const diff = ev.pageX - resizeStartX;
    colWidths[ci] = Math.max(50, startWidth + diff);
    renderTableHeader();
    renderTable();
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    resizingCol = -1;
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// =====================================================================
//  CONTEXT MENU
// =====================================================================

function setupContextMenu() {
  document.addEventListener('click', () => {
    document.getElementById('context-menu').style.display = 'none';
    const colMenu = document.getElementById('col-context-menu');
    if (colMenu) colMenu.style.display = 'none';
  });
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('#virtual-table') && !e.target.closest('th')) {
      document.getElementById('context-menu').style.display = 'none';
      const colMenu = document.getElementById('col-context-menu');
      if (colMenu) colMenu.style.display = 'none';
    }
  });
}

function showColumnHeaderMenu(e, ci) {
  e.preventDefault();
  e.stopPropagation();
  ctxHeaderColIdx = ci;
  
  document.getElementById('context-menu').style.display = 'none';
  
  const menu = document.getElementById('col-context-menu');
  if (menu) {
    menu.style.display = 'block';
    menu.style.left = Math.min(e.pageX, window.innerWidth - 180) + 'px';
    menu.style.top = Math.min(e.pageY, window.innerHeight - 200) + 'px';
  }
}

function ctxColSortAsc() {
  if (ctxHeaderColIdx >= 0) {
    sortCol = ctxHeaderColIdx;
    sortDir = 'asc';
    renderTableHeader();
    renderTable();
    toast(`Sorted by ${headers[ctxHeaderColIdx]} Ascending`, 'success');
  }
}

function ctxColSortDesc() {
  if (ctxHeaderColIdx >= 0) {
    sortCol = ctxHeaderColIdx;
    sortDir = 'desc';
    renderTableHeader();
    renderTable();
    toast(`Sorted by ${headers[ctxHeaderColIdx]} Descending`, 'success');
  }
}

function ctxColRename() {
  if (ctxHeaderColIdx >= 0) {
    const oldName = headers[ctxHeaderColIdx];
    const newName = prompt(`Rename column "${oldName}" to:`, oldName);
    if (newName && newName.trim() !== '') {
      pushUndo();
      headers[ctxHeaderColIdx] = newName.trim();
      renderTableHeader();
      if (typeof initChartPanel !== 'undefined') initChartPanel();
      toast('Column renamed', 'success');
    }
  }
}

function ctxColHide() {
  if (ctxHeaderColIdx >= 0) {
    hiddenCols.add(ctxHeaderColIdx);
    renderTableHeader();
    renderTable();
    toast(`Column "${headers[ctxHeaderColIdx]}" hidden.`, 'info');
  }
}

function ctxColFilter() {
  if (ctxHeaderColIdx >= 0) {
    switchTool('filter');
    const filterSelect = document.getElementById('filterCol');
    if (filterSelect) {
      filterSelect.value = ctxHeaderColIdx;
      filterSelect.dispatchEvent(new Event('change'));
    }
  }
}

function unhideAllColumns() {
  if (hiddenCols.size > 0) {
    pushUndo();
    hiddenCols.clear();
    renderTableHeader();
    renderTable();
    toast('All columns unhidden', 'success');
  }
}

function showColStatsTooltip(e, ci) {
  const tooltip = document.getElementById('col-stats-tooltip');
  if (!tooltip) return;

  const colName = headers[ci];
  const type = colTypes[ci] || 'text';
  
  let nullCount = 0;
  let uniqueValues = new Set();
  let numValues = [];
  const textFreq = {};
  
  rawData.forEach(row => {
    const val = row[ci];
    if (val === null || val === undefined || String(val).trim() === '') {
      nullCount++;
    } else {
      uniqueValues.add(val);
      if (type === 'number') {
        const n = parseFloat(val);
        if (!isNaN(n)) numValues.push(n);
      }
      textFreq[val] = (textFreq[val] || 0) + 1;
    }
  });

  let statsHtml = `<div style="font-weight:700;margin-bottom:4px;color:#818cf8">${escHtml(colName)} Stats</div>`;
  statsHtml += `<div>Type: <span style="font-weight:600;color:#f43f5e">${type.toUpperCase()}</span></div>`;
  statsHtml += `<div>Missing: <span style="font-weight:600">${nullCount}</span></div>`;
  statsHtml += `<div>Unique: <span style="font-weight:600">${uniqueValues.size}</span></div>`;

  if (type === 'number' && numValues.length > 0) {
    const sum = numValues.reduce((a, b) => a + b, 0);
    const avg = sum / numValues.length;
    statsHtml += `<div>Sum: <span style="font-weight:600;color:#34d399">${sum.toLocaleString(undefined, {maximumFractionDigits:2})}</span></div>`;
    statsHtml += `<div>Avg: <span style="font-weight:600;color:#38bdf8">${avg.toLocaleString(undefined, {maximumFractionDigits:2})}</span></div>`;
  } else {
    let mostCommon = 'N/A';
    let maxFreq = 0;
    Object.entries(textFreq).forEach(([k, v]) => {
      if (v > maxFreq) {
        maxFreq = v;
        mostCommon = k;
      }
    });
    if (mostCommon !== 'N/A') {
      statsHtml += `<div>Mode: <span style="font-weight:600;color:#fb7185">${escHtml(mostCommon.length > 15 ? mostCommon.substring(0, 15) + '...' : mostCommon)} (${maxFreq}x)</span></div>`;
    }
  }

  tooltip.innerHTML = statsHtml;
  tooltip.style.display = 'block';
  
  const thRect = e.currentTarget.getBoundingClientRect();
  tooltip.style.left = (thRect.left + window.scrollX + thRect.width/2 - 60) + 'px';
  tooltip.style.top = (thRect.bottom + window.scrollY + 6) + 'px';
}

function hideColStatsTooltip() {
  const tooltip = document.getElementById('col-stats-tooltip');
  if (tooltip) tooltip.style.display = 'none';
}

function showContextMenu(e, ri) {
  e.preventDefault();
  const td = e.target.closest('td');
  ctxRowIdx = ri;
  ctxColIdx = td ? parseInt(td.dataset.ci) : -1;

  const menu = document.getElementById('context-menu');
  menu.style.display = 'block';
  menu.style.left = Math.min(e.pageX, window.innerWidth - 220) + 'px';
  menu.style.top = Math.min(e.pageY, window.innerHeight - 300) + 'px';
}

function ctxCopyCell() {
  if (ctxRowIdx >= 0 && ctxColIdx >= 0) {
    navigator.clipboard.writeText(String(rawData[ctxRowIdx][ctxColIdx] == null ? '' : rawData[ctxRowIdx][ctxColIdx])).then(() => toast('Copied!', 'success'));
  }
}

function ctxPasteCell() {
  if (ctxRowIdx >= 0 && ctxColIdx >= 0) {
    navigator.clipboard.readText().then(text => {
      pushUndo();
      rawData[ctxRowIdx][ctxColIdx] = text.trim();
      if (typeof _pvLog === 'function') _pvLog({actor:'user',action:'EDIT',method:'paste',target:'cell:R'+ctxRowIdx+':C'+ctxColIdx,inputs:[],output:'col:'+(headers[ctxColIdx]||'col'+ctxColIdx),label:'Pasted into ['+String(headers[ctxColIdx]||'col'+ctxColIdx)+', row '+(ctxRowIdx+1)+']',labelHi:'['+String(headers[ctxColIdx]||'col'+ctxColIdx)+', पंक्ति '+(ctxRowIdx+1)+'] में पेस्ट'});
      renderTable();
    });
  }
}

function ctxInsertRowAbove() {
  if (ctxRowIdx >= 0) {
    pushUndo();
    rawData.splice(ctxRowIdx, 0, new Array(headers.length).fill(''));
    filteredData = null;
    showTable();
    toast('Row inserted above', 'success');
  }
}

function ctxInsertRowBelow() {
  if (ctxRowIdx >= 0) {
    pushUndo();
    rawData.splice(ctxRowIdx + 1, 0, new Array(headers.length).fill(''));
    filteredData = null;
    showTable();
    toast('Row inserted below', 'success');
  }
}

function ctxDeleteRow() {
  if (ctxRowIdx >= 0) {
    pushUndo();
    rawData.splice(ctxRowIdx, 1);
    filteredData = null;
    showTable();
    toast('Row deleted', 'success');
  }
}

function ctxSortAsc() {
  if (ctxColIdx >= 0) { sortCol = ctxColIdx; sortDir = 'asc'; renderTableHeader(); renderTable(); }
}

function ctxSortDesc() {
  if (ctxColIdx >= 0) { sortCol = ctxColIdx; sortDir = 'desc'; renderTableHeader(); renderTable(); }
}

function ctxFilterValue() {
  if (ctxRowIdx >= 0 && ctxColIdx >= 0) {
    const val = String(rawData[ctxRowIdx][ctxColIdx] == null ? '' : rawData[ctxRowIdx][ctxColIdx]);
    activeFilters = activeFilters.filter(f => f.col !== ctxColIdx);
    activeFilters.push({ col: ctxColIdx, type: 'eq', values: [val], text: '', numVal: val });
    applyAllFilters();
    toast(`Filtered: ${headers[ctxColIdx]} = "${val}"`, 'info');
  }
}

