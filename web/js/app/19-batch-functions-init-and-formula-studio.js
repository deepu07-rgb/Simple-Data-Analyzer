// =====================================================================
//  INITIALIZATION COMPLETE — App is ready
// =====================================================================
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('vthead').addEventListener('dblclick', function(e) {
    const handle = e.target.closest('.resize-handle');
    if (handle) {
      e.stopPropagation();
      const th = handle.closest('th');
      const ci = Array.from(th.parentNode.children).indexOf(th) - 2;
      if (ci >= 0) {
        let maxLen = headers[ci].length;
        rawData.forEach(row => {
          const val = formatCellValue(String(row[ci] != null ? row[ci] : ''), cellNumFormats[`${rawData.indexOf(row)}:${ci}`]);
          if (val.length > maxLen) maxLen = val.length;
        });
        colWidths[ci] = Math.min(Math.max(maxLen * 8 + 20, 80), 300);
        renderTableHeader();
        renderTable();
        toast(`Column '${headers[ci]}' auto-fitted`, 'success');
      }
    }
  });

  // Create tooltip element on start
  let tooltipEl = document.getElementById('comment-tooltip');
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'comment-tooltip';
    tooltipEl.className = 'comment-tooltip';
    document.body.appendChild(tooltipEl);
  }

  // Setup contextual notes tooltip bindings
  const tbody = document.getElementById('vtbody');
  if (tbody) {
    tbody.addEventListener('mouseover', function(e) {
      const td = e.target.closest('td.has-comment');
      if (td) {
        const ri = parseInt(td.getAttribute('data-ri'));
        const ci = parseInt(td.getAttribute('data-ci'));
        const key = `${ri}:${ci}`;
        const note = cellComments[key];
        if (note) {
          tooltipEl.textContent = `Cell ${getCellRef(ri, ci)} Note:\n${note}`;
          tooltipEl.style.display = 'block';
          const rect = td.getBoundingClientRect();
          tooltipEl.style.left = (rect.left + window.scrollX + rect.width + 4) + 'px';
          tooltipEl.style.top = (rect.top + window.scrollY) + 'px';
        }
      }
    });

    tbody.addEventListener('mouseout', function(e) {
      const td = e.target.closest('td.has-comment');
      if (td) {
        tooltipEl.style.display = 'none';
      }
    });
  }

  updateProfile();
  setAutoSaveInterval(30000); // 30s auto-save
});

// =====================================================================
//  FORMULA STUDIO ENGINE
// =====================================================================
let customKpis = [];
let currentFormulaTab = 'guided';
let currentLibraryCategory = 'all';

const GUIDED_OPERATIONS = [
  { id:'sum', en:'Sum', hi:'योग', kind:'number' },
  { id:'average', en:'Average', hi:'औसत', kind:'number' },
  { id:'median', en:'Median', hi:'मध्यिका', kind:'number' },
  { id:'min', en:'Minimum', hi:'न्यूनतम', kind:'number' },
  { id:'max', en:'Maximum', hi:'अधिकतम', kind:'number' },
  { id:'product', en:'Product', hi:'गुणनफल', kind:'number' },
  { id:'range', en:'Range (Max - Min)', hi:'परास', kind:'number' },
  { id:'variance', en:'Variance', hi:'विचरण', kind:'number' },
  { id:'stddev', en:'Standard deviation', hi:'मानक विचलन', kind:'number' },
  { id:'percentile90', en:'90th percentile', hi:'90वां प्रतिशतक', kind:'number' },
  { id:'count_numbers', en:'Count numeric cells', hi:'संख्यात्मक सेल गिनें', kind:'number' },
  { id:'count_nonempty', en:'Count non-empty cells', hi:'भरी हुई सेल गिनें', kind:'any' },
  { id:'count_blank', en:'Count blank cells', hi:'खाली सेल गिनें', kind:'any' },
  { id:'count_unique', en:'Count unique values', hi:'अद्वितीय मान गिनें', kind:'any' },
  { id:'join_text', en:'Join text', hi:'टेक्स्ट जोड़ें', kind:'text' }
];

const GUIDED_SOURCE_OPTIONS = [
  { value:'selection', en:'Current cell selection', hi:'वर्तमान सेल चयन' },
  { value:'column', en:'Complete column', hi:'पूरा कॉलम' },
  { value:'visibleColumn', en:'Visible/filtered rows of a column', hi:'कॉलम की दिखाई देने वाली पंक्तियाँ' },
  { value:'row', en:'Complete row', hi:'पूरी पंक्ति' },
  { value:'range', en:'Cell or ranges', hi:'सेल या रेंज' }
];

const GUIDED_DESTINATION_OPTIONS = [
  { value:'preview', en:'Preview only', hi:'केवल पूर्वावलोकन' },
  { value:'cell', en:'A specific cell', hi:'किसी निश्चित सेल में' },
  { value:'below', en:'Below the source column', hi:'स्रोत कॉलम के अंत में' },
  { value:'right', en:'At the end of the source row', hi:'स्रोत पंक्ति के अंत में' },
  { value:'kpi', en:'Dashboard KPI card', hi:'डैशबोर्ड KPI कार्ड' }
];

function guidedLabel(item) {
  if (uiLanguage === 'hi') return item.hi;
  if (uiLanguage === 'bi') return `${item.en} / ${item.hi}`;
  return item.en;
}

function populateGuidedOptions() {
  const opSelect = document.getElementById('guidedOperation');
  const sourceSelect = document.getElementById('guidedSourceMode');
  const destinationSelect = document.getElementById('guidedDestination');
  const columnSelect = document.getElementById('guidedColumn');
  if (!opSelect || !sourceSelect || !destinationSelect || !columnSelect) return;

  const previousOp = opSelect.value || 'sum';
  const previousSource = sourceSelect.value || 'selection';
  const previousDestination = destinationSelect.value || 'preview';
  const previousColumn = columnSelect.value;

  opSelect.innerHTML = GUIDED_OPERATIONS.map(op =>
    `<option value="${op.id}">${escHtml(guidedLabel(op))}</option>`
  ).join('');
  sourceSelect.innerHTML = GUIDED_SOURCE_OPTIONS.map(item =>
    `<option value="${item.value}">${escHtml(guidedLabel(item))}</option>`
  ).join('');
  destinationSelect.innerHTML = GUIDED_DESTINATION_OPTIONS.map(item =>
    `<option value="${item.value}">${escHtml(guidedLabel(item))}</option>`
  ).join('');
  columnSelect.innerHTML = headers.map((header, index) =>
    `<option value="${index}">${escHtml(header)}</option>`
  ).join('');

  if (GUIDED_OPERATIONS.some(op => op.id === previousOp)) opSelect.value = previousOp;
  if (GUIDED_SOURCE_OPTIONS.some(item => item.value === previousSource)) sourceSelect.value = previousSource;
  if (GUIDED_DESTINATION_OPTIONS.some(item => item.value === previousDestination)) destinationSelect.value = previousDestination;
  if (columnSelect.querySelector(`option[value="${previousColumn}"]`)) columnSelect.value = previousColumn;
  else if (selectionStart.ci !== null && columnSelect.querySelector(`option[value="${selectionStart.ci}"]`)) columnSelect.value = selectionStart.ci;
}

function updateGuidedControls() {
  const source = document.getElementById('guidedSourceMode');
  const destination = document.getElementById('guidedDestination');
  const operation = document.getElementById('guidedOperation');
  if (!source || !destination || !operation) return;
  document.getElementById('guidedColumnWrap').style.display =
    ['column','visibleColumn'].includes(source.value) ? 'block' : 'none';
  document.getElementById('guidedRowWrap').style.display = source.value === 'row' ? 'block' : 'none';
  document.getElementById('guidedRangeWrap').style.display = source.value === 'range' ? 'block' : 'none';
  document.getElementById('guidedDelimiterWrap').style.display = operation.value === 'join_text' ? 'block' : 'none';
  document.getElementById('guidedTargetCellWrap').style.display = destination.value === 'cell' ? 'block' : 'none';
}

function parseCellReference(reference) {
  const match = String(reference || '').trim().match(/^([A-Za-z]+)(\d+)$/);
  if (!match) return null;
  let ci = 0;
  for (const char of match[1].toUpperCase()) ci = (ci * 26) + char.charCodeAt(0) - 64;
  return { ri: parseInt(match[2], 10) - 1, ci: ci - 1 };
}

function getSelectionBounds() {
  if (selectionStart.ri === null || selectionEnd.ri === null) return null;
  return {
    minRi: Math.min(selectionStart.ri, selectionEnd.ri),
    maxRi: Math.max(selectionStart.ri, selectionEnd.ri),
    minCi: Math.min(selectionStart.ci, selectionEnd.ci),
    maxCi: Math.max(selectionStart.ci, selectionEnd.ci)
  };
}

function cellsFromBounds(bounds) {
  const items = [];
  for (let ri = bounds.minRi; ri <= bounds.maxRi; ri++) {
    for (let ci = bounds.minCi; ci <= bounds.maxCi; ci++) {
      items.push({ ri, ci, ref:getCellRef(ri,ci), value:rawData[ri]?.[ci] ?? '' });
    }
  }
  return items;
}

function parseGuidedRanges(input) {
  const unique = new Map();
  const tokens = String(input || '').split(',').map(value => value.trim()).filter(Boolean);
  if (!tokens.length) throw new Error(uiLanguage === 'hi' ? 'कम से कम एक सेल या रेंज लिखें।' : 'Enter at least one cell or range.');
  tokens.forEach(token => {
    const parts = token.split(':').map(part => parseCellReference(part));
    if (!parts[0] || (parts.length > 1 && !parts[1]) || parts.length > 2) {
      throw new Error(`${token}: ${uiLanguage === 'hi' ? 'अमान्य सेल रेंज' : 'invalid cell range'}`);
    }
    const end = parts[1] || parts[0];
    const bounds = {
      minRi:Math.min(parts[0].ri,end.ri), maxRi:Math.max(parts[0].ri,end.ri),
      minCi:Math.min(parts[0].ci,end.ci), maxCi:Math.max(parts[0].ci,end.ci)
    };
    if (bounds.minRi < 0 || bounds.minCi < 0 || bounds.maxRi >= rawData.length || bounds.maxCi >= headers.length) {
      throw new Error(`${token}: ${uiLanguage === 'hi' ? 'रेंज डेटा से बाहर है' : 'range is outside the data'}`);
    }
    cellsFromBounds(bounds).forEach(item => unique.set(`${item.ri}:${item.ci}`,item));
  });
  return Array.from(unique.values());
}

function getGuidedSourceItems() {
  const source = document.getElementById('guidedSourceMode')?.value || 'selection';
  if (source === 'selection') {
    const bounds = getSelectionBounds();
    if (!bounds) throw new Error(uiLanguage === 'hi' ? 'पहले टेबल में सेल चुनें।' : 'Select cells in the table first.');
    return { items:cellsFromBounds(bounds), bounds, source };
  }
  if (source === 'column' || source === 'visibleColumn') {
    const ci = parseInt(document.getElementById('guidedColumn')?.value,10);
    if (isNaN(ci)) throw new Error(uiLanguage === 'hi' ? 'कॉलम चुनें।' : 'Choose a column.');
    const rows = source === 'visibleColumn' ? getDisplayData() : rawData.map((_,ri)=>ri);
    const items = rows.map(ri => ({ ri,ci,ref:getCellRef(ri,ci),value:rawData[ri]?.[ci] ?? '' }));
    return { items, bounds:{minRi:rows.length?Math.min(...rows):0,maxRi:rows.length?Math.max(...rows):0,minCi:ci,maxCi:ci}, source };
  }
  if (source === 'row') {
    const ri = parseInt(document.getElementById('guidedRow')?.value,10) - 1;
    if (isNaN(ri) || ri < 0 || ri >= rawData.length) throw new Error(uiLanguage === 'hi' ? 'मान्य पंक्ति संख्या लिखें।' : 'Enter a valid row number.');
    const bounds = { minRi:ri,maxRi:ri,minCi:0,maxCi:headers.length-1 };
    return { items:cellsFromBounds(bounds), bounds, source };
  }
  const items = parseGuidedRanges(document.getElementById('guidedRange')?.value);
  const rows = items.map(item => item.ri);
  const cols = items.map(item => item.ci);
  return {
    items,
    bounds:{minRi:Math.min(...rows),maxRi:Math.max(...rows),minCi:Math.min(...cols),maxCi:Math.max(...cols)},
    source
  };
}

function parseFlexibleNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let text = String(value ?? '').trim();
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) { negative = true; text = text.slice(1,-1); }
  const isPercent = text.endsWith('%');
  text = text.replace(/[,\s₹$€£]/g,'').replace(/%$/,'');
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text)) return null;
  let number = Number(text);
  if (!Number.isFinite(number)) return null;
  if (negative) number = -Math.abs(number);
  if (isPercent) number /= 100;
  return number;
}

function percentile(values, ratio) {
  const sorted = [...values].sort((a,b)=>a-b);
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * ratio;
  const lower = Math.floor(index);
  const fraction = index - lower;
  return sorted[lower + 1] !== undefined
    ? sorted[lower] + fraction * (sorted[lower + 1] - sorted[lower])
    : sorted[lower];
}

function calculateGuidedResult() {
  const operation = GUIDED_OPERATIONS.find(item => item.id === document.getElementById('guidedOperation')?.value) || GUIDED_OPERATIONS[0];
  const sourceData = getGuidedSourceItems();
  const nonEmpty = sourceData.items.filter(item => String(item.value ?? '').trim() !== '');
  const blanks = sourceData.items.length - nonEmpty.length;
  const numericItems = [];
  const invalidItems = [];
  nonEmpty.forEach(item => {
    const number = parseFlexibleNumber(item.value);
    if (number === null) invalidItems.push(item);
    else numericItems.push({ ...item, number });
  });

  let result;
  if (operation.id === 'count_nonempty') result = nonEmpty.length;
  else if (operation.id === 'count_blank') result = blanks;
  else if (operation.id === 'count_unique') result = new Set(nonEmpty.map(item => String(item.value).trim())).size;
  else if (operation.id === 'join_text') {
    const delimiter = document.getElementById('guidedDelimiter')?.value ?? ', ';
    result = nonEmpty.map(item => String(item.value)).join(delimiter);
  } else {
    const numbers = numericItems.map(item => item.number);
    if (!numbers.length) throw new Error(uiLanguage === 'hi' ? 'चयन में कोई मान्य संख्या नहीं मिली।' : 'No valid numeric values were found in the source.');
    switch (operation.id) {
      case 'sum': result = numbers.reduce((sum,value)=>sum+value,0); break;
      case 'average': result = numbers.reduce((sum,value)=>sum+value,0)/numbers.length; break;
      case 'median': result = percentile(numbers,.5); break;
      case 'min': result = Math.min(...numbers); break;
      case 'max': result = Math.max(...numbers); break;
      case 'product': result = numbers.reduce((product,value)=>product*value,1); break;
      case 'range': result = Math.max(...numbers)-Math.min(...numbers); break;
      case 'variance': {
        const mean = numbers.reduce((sum,value)=>sum+value,0)/numbers.length;
        result = numbers.reduce((sum,value)=>sum+Math.pow(value-mean,2),0)/numbers.length;
        break;
      }
      case 'stddev': {
        const mean = numbers.reduce((sum,value)=>sum+value,0)/numbers.length;
        result = Math.sqrt(numbers.reduce((sum,value)=>sum+Math.pow(value-mean,2),0)/numbers.length);
        break;
      }
      case 'percentile90': result = percentile(numbers,.9); break;
      case 'count_numbers': result = numbers.length; break;
      default: result = numbers.reduce((sum,value)=>sum+value,0);
    }
  }
  return { operation, result, sourceData, nonEmpty, blanks, numericItems, invalidItems };
}

function formatGuidedResult(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString() : parseFloat(value.toFixed(6)).toLocaleString();
  return String(value);
}

function previewGuidedCalculation() {
  const preview = document.getElementById('guidedPreview');
  if (!preview) return null;
  if (!rawData.length) {
    preview.innerHTML = `<div style="color:var(--text-muted);font-size:11.5px">${uiLanguage === 'hi' ? 'गणना शुरू करने के लिए डेटा आयात या पेस्ट करें।' : 'Import or paste data to begin a calculation.'}</div>`;
    guidedLastResult = null;
    return null;
  }
  try {
    const calculation = calculateGuidedResult();
    guidedLastResult = calculation;
    const invalidPreview = calculation.invalidItems.slice(0,6).map(item => `${item.ref}="${escHtml(item.value)}"`).join(', ');
    const usedCount = calculation.operation.kind === 'number' ? calculation.numericItems.length : calculation.nonEmpty.length;
    preview.innerHTML = `
      <div style="font-size:10px;color:var(--text-muted);font-weight:700">${escHtml(guidedLabel(calculation.operation)).toUpperCase()}</div>
      <div class="guided-result">${escHtml(formatGuidedResult(calculation.result))}</div>
      <div style="font-size:10.5px;color:var(--text-secondary)">${calculation.sourceData.items.length} ${uiLanguage === 'hi' ? 'सेल जाँची गईं' : 'cells inspected'}</div>
      <div class="guided-audit">
        <div><strong>${usedCount}</strong>${uiLanguage === 'hi' ? 'उपयोग' : 'used'}</div>
        <div><strong>${calculation.blanks}</strong>${uiLanguage === 'hi' ? 'खाली' : 'blank'}</div>
        <div><strong>${calculation.invalidItems.length}</strong>${uiLanguage === 'hi' ? 'अमान्य टेक्स्ट' : 'invalid text'}</div>
      </div>
      ${calculation.invalidItems.length && calculation.operation.kind === 'number'
        ? `<div class="guided-warning"><strong>${uiLanguage === 'hi' ? 'गणना में शामिल नहीं:' : 'Not included in this numeric calculation:'}</strong><br>${invalidPreview}${calculation.invalidItems.length > 6 ? ' ...' : ''}</div>`
        : ''}
    `;
    return calculation;
  } catch (error) {
    guidedLastResult = null;
    preview.innerHTML = `<div class="guided-warning" style="margin-top:0;border-left-color:var(--danger)">${escHtml(error.message)}</div>`;
    return null;
  }
}

function updateGuidedSelectionSummary() {
  const summary = document.getElementById('guidedSelectionSummary');
  if (!summary) return;
  const bounds = getSelectionBounds();
  if (!bounds) {
    summary.textContent = uiLanguage === 'hi' ? 'कोई वर्कशीट सेल चयनित नहीं है।' : 'No worksheet cells selected.';
    return;
  }
  const start = getCellRef(bounds.minRi,bounds.minCi);
  const end = getCellRef(bounds.maxRi,bounds.maxCi);
  const count = (bounds.maxRi-bounds.minRi+1)*(bounds.maxCi-bounds.minCi+1);
  summary.textContent = `${start}${start === end ? '' : ':'+end} · ${count} ${uiLanguage === 'hi' ? 'सेल' : 'cells'}`;
}

function useCurrentSelectionForGuided() {
  const bounds = getSelectionBounds();
  if (!bounds) { toast(uiLanguage === 'hi' ? 'पहले टेबल में सेल चुनें' : 'Select cells in the table first','warning'); return; }
  document.getElementById('guidedSourceMode').value = 'selection';
  updateGuidedControls();
  previewGuidedCalculation();
}

function ensureWorksheetCell(ri,ci) {
  while (headers.length <= ci) {
    headers.push(`Column ${headers.length + 1}`);
    colTypes.push('text');
    rawData.forEach(row => row.push(''));
  }
  while (rawData.length <= ri) rawData.push(new Array(headers.length).fill(''));
  rawData.forEach(row => { while (row.length < headers.length) row.push(''); });
}

function addGuidedHistory(calculation,target) {
  operationHistory.unshift({
    time:new Date().toLocaleTimeString(),
    operation:guidedLabel(calculation.operation),
    result:formatGuidedResult(calculation.result),
    target
  });
  operationHistory = operationHistory.slice(0,10);
  renderGuidedHistory();
}

function renderGuidedHistory() {
  const container = document.getElementById('guidedHistory');
  if (!container) return;
  if (!operationHistory.length) { container.innerHTML = ''; return; }
  container.innerHTML = `<h4 style="margin:0 0 4px">${uiLanguage === 'hi' ? 'हाल की गणनाएँ' : 'Recent calculations'}</h4>` +
    operationHistory.slice(0,5).map(item =>
      `<div class="guided-history-item"><strong>${escHtml(item.operation)}</strong> = ${escHtml(item.result)}<br><span>${escHtml(item.target)} · ${escHtml(item.time)}</span></div>`
    ).join('');
}

function applyGuidedCalculation() {
  const calculation = previewGuidedCalculation();
  if (!calculation) return;
  const destination = document.getElementById('guidedDestination').value;
  const value = typeof calculation.result === 'number' ? String(parseFloat(calculation.result.toFixed(10))) : String(calculation.result);
  const label = `${calculation.operation.en} Result`;
  let targetDescription = uiLanguage === 'hi' ? 'केवल पूर्वावलोकन' : 'Preview only';

  if (destination === 'preview') {
    addGuidedHistory(calculation,targetDescription);
    toast(uiLanguage === 'hi' ? 'गणना पूर्ण हुई' : 'Calculation completed','success');
    return;
  }
  if (destination === 'kpi') {
    addScalarKpiCard(label,value);
    addGuidedHistory(calculation,uiLanguage === 'hi' ? 'डैशबोर्ड KPI' : 'Dashboard KPI');
    return;
  }

  let target;
  if (destination === 'cell') {
    target = parseCellReference(document.getElementById('guidedTargetCell').value);
    if (!target || target.ri < 0 || target.ci < 0) {
      toast(uiLanguage === 'hi' ? 'मान्य लक्ष्य सेल लिखें, जैसे H2' : 'Enter a valid target cell such as H2','error');
      return;
    }
  } else if (destination === 'below') {
    if (calculation.sourceData.bounds.minCi !== calculation.sourceData.bounds.maxCi) {
      toast(uiLanguage === 'hi' ? 'नीचे परिणाम रखने के लिए एक कॉलम स्रोत चुनें' : 'Choose a single-column source to place the result below it','error');
      return;
    }
    target = { ri:rawData.length,ci:calculation.sourceData.bounds.minCi };
  } else if (destination === 'right') {
    if (calculation.sourceData.bounds.minRi !== calculation.sourceData.bounds.maxRi) {
      toast(uiLanguage === 'hi' ? 'दाईं ओर परिणाम रखने के लिए एक पंक्ति स्रोत चुनें' : 'Choose a single-row source to place the result to its right','error');
      return;
    }
    target = { ri:calculation.sourceData.bounds.minRi,ci:headers.length };
  }

  pushUndo();
  ensureWorksheetCell(target.ri,target.ci);
  if (destination === 'right' && /^Column \d+$/.test(headers[target.ci])) headers[target.ci] = label;
  rawData[target.ri][target.ci] = value;
  const sourceBounds = calculation.sourceData.bounds;
  const sourceStart = getCellRef(sourceBounds.minRi, sourceBounds.minCi);
  const sourceEnd = getCellRef(sourceBounds.maxRi, sourceBounds.maxCi);
  const sourceAddress = sourceStart === sourceEnd ? sourceStart : `${sourceStart}:${sourceEnd}`;
  registerFormulaResult(target.ri, target.ci, {
    formula: `=${calculation.operation.id.toUpperCase()}(${sourceAddress})`,
    source: sourceAddress,
    sourceLabel: `${calculation.sourceData.items.length} source cells`,
    label: calculation.operation.en,
    result: value
  });
  detectTypes();
  filteredData = null;
  populatePanelSelects();
  showTable();
  autoSave();
  targetDescription = getCellRef(target.ri,target.ci);
  addGuidedHistory(calculation,targetDescription);
  toast(`${uiLanguage === 'hi' ? 'परिणाम रखा गया' : 'Result inserted at'} ${targetDescription}`,'success');
  focusResultCell(target.ri, target.ci);
  renderSmartRecommendations();
}

function openGuidedForColumn(operationId,columnIndex,sourceMode='column') {
  switchFormulaTab('guided');
  const operation = document.getElementById('guidedOperation');
  const source = document.getElementById('guidedSourceMode');
  const column = document.getElementById('guidedColumn');
  if (operation) operation.value = operationId;
  if (source) source.value = sourceMode;
  if (column) column.value = columnIndex;
  updateGuidedControls();
  previewGuidedCalculation();
}

function runSmartSuggestion(action,columnIndex) {
  if (action === 'cleanup') { switchTool('cleanup'); return; }
  if (action === 'chart') { switchTool('chart'); return; }
  openGuidedForColumn(action,columnIndex,'column');
}

function renderSmartRecommendations() {
  const container = document.getElementById('guidedSuggestions');
  if (!container) return;
  if (!rawData.length) {
    container.innerHTML = `<div style="color:var(--text-muted);font-size:11px">${uiLanguage === 'hi' ? 'डेटा आयात करने के बाद सुझाव दिखाई देंगे।' : 'Recommendations will appear after data is imported.'}</div>`;
    return;
  }
  const suggestions = [];
  headers.forEach((header,ci) => {
    const values = rawData.map(row => String(row[ci] ?? '').trim());
    const nonEmpty = values.filter(Boolean);
    const missing = values.length - nonEmpty.length;
    const unique = new Set(nonEmpty);
    const duplicates = nonEmpty.length - unique.size;
    if (missing > 0 && suggestions.length < 5) {
      suggestions.push({
        title:uiLanguage === 'hi' ? `${header} में ${missing} खाली सेल` : `${missing} blank cells in ${header}`,
        text:uiLanguage === 'hi' ? 'रिपोर्ट बनाने से पहले खाली मानों की जाँच उपयोगी होगी।' : 'Review missing values before analysis or reporting.',
        action:'cleanup',button:uiLanguage === 'hi' ? 'डेटा साफ करें' : 'Open cleanup',ci
      });
    }
    if (duplicates > 0 && unique.size > 1 && suggestions.length < 5) {
      suggestions.push({
        title:uiLanguage === 'hi' ? `${header} में ${duplicates} दोहराव` : `${duplicates} repeated values in ${header}`,
        text:uiLanguage === 'hi' ? 'पहचान संख्या या मास्टर डेटा में यह महत्वपूर्ण हो सकता है।' : 'This may matter for IDs, registers, or master data.',
        action:'count_unique',button:uiLanguage === 'hi' ? 'अद्वितीय मान गिनें' : 'Count unique',ci
      });
    }
    if (colTypes[ci] === 'number' && suggestions.length < 5) {
      suggestions.push({
        title:uiLanguage === 'hi' ? `${header} का सारांश तैयार है` : `${header} is ready for a numeric summary`,
        text:uiLanguage === 'hi' ? 'योग, औसत, न्यूनतम और अधिकतम तुरंत निकाले जा सकते हैं।' : 'Calculate totals, averages, minimums, and maximums with validation.',
        action:'sum',button:uiLanguage === 'hi' ? 'योग निकालें' : 'Calculate sum',ci
      });
    } else if (unique.size > 1 && unique.size <= Math.min(20,Math.max(3,Math.floor(nonEmpty.length*.25))) && suggestions.length < 5) {
      suggestions.push({
        title:uiLanguage === 'hi' ? `${header} चार्ट के लिए उपयुक्त है` : `${header} is suitable for grouping or charts`,
        text:uiLanguage === 'hi' ? `${unique.size} श्रेणियाँ मिलीं।` : `${unique.size} categories were detected.`,
        action:'chart',button:uiLanguage === 'hi' ? 'चार्ट बनाएँ' : 'Build chart',ci
      });
    }
  });
  if (!suggestions.length) {
    suggestions.push({
      title:uiLanguage === 'hi' ? 'डेटा उपयोग के लिए तैयार है' : 'Dataset looks ready to use',
      text:uiLanguage === 'hi' ? 'किसी कॉलम पर गणना चुनें या लाइब्रेरी खोलें।' : 'Choose a calculation or explore the formula library.',
      action:'count_nonempty',button:uiLanguage === 'hi' ? 'रिकॉर्ड गिनें' : 'Count records',ci:0
    });
  }
  container.innerHTML = suggestions.map(item => `
    <div class="smart-suggestion">
      <strong>${escHtml(item.title)}</strong>
      <p>${escHtml(item.text)}</p>
      <button class="tb-btn" onclick="runSmartSuggestion('${item.action}',${item.ci})">${escHtml(item.button)}</button>
    </div>
  `).join('');
}

const FORMULA_LIBRARY = [
  // STATISTICAL CATEGORY
  {
    id: 'sum',
    name: 'SUM',
    nameHi: 'योग (SUM)',
    category: 'statistical',
    categoryHi: 'सांख्यिकीय',
    desc: 'Calculates the sum of all numeric values in a column.',
    descHi: 'एक कॉलम में सभी संख्यात्मक मानों के योग की गणना करता है।',
    type: 'scalar',
    compatibleTypes: ['number'],
    flow: 'Col [Selected] ──→ [ SUM ] ──→ Total Sum',
    fn: (vals) => vals.map(Number).filter(v => !isNaN(v)).reduce((s, v) => s + v, 0),
    example: { useCase: 'Calculate total salary from salary column', useCaseHi: 'वेतन कॉलम से कुल वेतन की गणना करना', data: '15000, 20000, 25000', result: '60000' }
  },
  {
    id: 'average',
    name: 'AVERAGE',
    nameHi: 'औसत (AVERAGE)',
    category: 'statistical',
    categoryHi: 'सांख्यिकीय',
    desc: 'Calculates the average (mean) of numeric values.',
    descHi: 'संख्यात्मक मानों के औसत (माध्य) की गणना करता है।',
    type: 'scalar',
    compatibleTypes: ['number'],
    flow: 'Col [Selected] ──→ [ AVERAGE ] ──→ Mean Value',
    fn: (vals) => {
      const nums = vals.map(Number).filter(v => !isNaN(v));
      return nums.length ? (nums.reduce((s, v) => s + v, 0) / nums.length) : 0;
    },
    example: { useCase: 'Find average marks of students', useCaseHi: 'छात्रों के औसत अंकों का पता लगाना', data: '70, 80, 90', result: '80' }
  },
  {
    id: 'median',
    name: 'MEDIAN',
    nameHi: 'मध्यमान (MEDIAN)',
    category: 'statistical',
    categoryHi: 'सांख्यिकीय',
    desc: 'Finds the middle value (resistant to extreme outliers).',
    descHi: 'मध्य मान खोजता है (जो असाधारण उतार-चढ़ाव से प्रभावित नहीं होता)।',
    type: 'scalar',
    compatibleTypes: ['number'],
    flow: 'Col [Selected] ──→ [ SORT & MEDIAN ] ──→ Middle Value',
    fn: (vals) => {
      const nums = vals.map(Number).filter(v => !isNaN(v)).sort((a,b)=>a-b);
      if (!nums.length) return 0;
      const mid = Math.floor(nums.length/2);
      return nums.length % 2 !== 0 ? nums[mid] : (nums[mid-1] + nums[mid]) / 2;
    },
    example: { useCase: 'Find median price to ignore outliers', useCaseHi: 'मूल्यों में मध्यमान निकालना', data: '10, 15, 20, 100', result: '17.5' }
  },
  {
    id: 'mode',
    name: 'MODE',
    nameHi: 'बहुलक (MODE)',
    category: 'statistical',
    categoryHi: 'सांख्यिकीय',
    desc: 'Finds the most frequently occurring value.',
    descHi: 'सबसे अधिक बार आने वाले मान को खोजता है।',
    type: 'scalar',
    compatibleTypes: ['number', 'text'],
    flow: 'Col [Selected] ──→ [ FREQUENCY ] ──→ Most Frequent',
    fn: (vals) => {
      const clean = vals.filter(v => v !== '' && v !== null);
      if (!clean.length) return '';
      const counts = {};
      let maxCount = 0, mode = '';
      clean.forEach(v => {
        counts[v] = (counts[v] || 0) + 1;
        if (counts[v] > maxCount) { maxCount = counts[v]; mode = v; }
      });
      return mode;
    },
    example: { useCase: 'Find the most common city of complainants', useCaseHi: 'शिकायतकर्ताओं के सबसे आम शहर का पता लगाना', data: 'Jaipur, Jodhpur, Jaipur', result: 'Jaipur' }
  },
  {
    id: 'min',
    name: 'MIN',
    nameHi: 'न्यूनतम (MIN)',
    category: 'statistical',
    categoryHi: 'सांख्यिकीय',
    desc: 'Finds the smallest value.',
    descHi: 'सबसे छोटा मान खोजता है।',
    type: 'scalar',
    compatibleTypes: ['number'],
    flow: 'Col [Selected] ──→ [ MINIMUM ] ──→ Lowest Value',
    fn: (vals) => {
      const nums = vals.map(Number).filter(v => !isNaN(v));
      return nums.length ? Math.min(...nums) : 0;
    },
    example: { useCase: 'Find lowest temperature recorded', useCaseHi: 'न्यूनतम तापमान का पता लगाना', data: '15, 8, 22', result: '8' }
  },
  {
    id: 'max',
    name: 'MAX',
    nameHi: 'अधिकतम (MAX)',
    category: 'statistical',
    categoryHi: 'सांख्यिकीय',
    desc: 'Finds the largest value.',
    descHi: 'सबसे बड़ा मान खोजता है।',
    type: 'scalar',
    compatibleTypes: ['number'],
    flow: 'Col [Selected] ──→ [ MAXIMUM ] ──→ Highest Value',
    fn: (vals) => {
      const nums = vals.map(Number).filter(v => !isNaN(v));
      return nums.length ? Math.max(...nums) : 0;
    },
    example: { useCase: 'Find maximum marks scored in exam', useCaseHi: 'परीक्षा में प्राप्त अधिकतम अंकों का पता लगाना', data: '85, 99, 92', result: '99' }
  },
  {
    id: 'count',
    name: 'COUNT',
    nameHi: 'गणना (COUNT)',
    category: 'statistical',
    categoryHi: 'सांख्यिकीय',
    desc: 'Counts the number of non-empty rows.',
    descHi: 'भरी हुई पंक्तियों की कुल संख्या गिनता है।',
    type: 'scalar',
    compatibleTypes: ['number', 'text', 'date'],
    flow: 'Col [Selected] ──→ [ COUNT NON-EMPTY ] ──→ Total Count',
    fn: (vals) => vals.filter(v => v !== '' && v !== null).length,
    example: { useCase: 'Count total registered police officers', useCaseHi: 'पंजीकृत पुलिस अधिकारियों की गणना', data: 'Ramesh, Suresh, ""', result: '2' }
  },
  {
    id: 'count_unique',
    name: 'COUNT UNIQUE',
    nameHi: 'अनन्य गणना (COUNT UNIQUE)',
    category: 'statistical',
    categoryHi: 'सांख्यिकीय',
    desc: 'Counts the number of unique/distinct values.',
    descHi: 'विशिष्ट (अद्वितीय) मानों की संख्या गिनता है।',
    type: 'scalar',
    compatibleTypes: ['number', 'text', 'date'],
    flow: 'Col [Selected] ──→ [ DISTINCT SET ] ──→ Count Unique',
    fn: (vals) => new Set(vals.filter(v => v !== '' && v !== null)).size,
    example: { useCase: 'Count unique stations / circles in department', useCaseHi: 'थानों की अद्वितीय संख्या गिनना', data: 'Jaipur, Jaipur, Ajmer', result: '2' }
  },
  {
    id: 'stddev',
    name: 'STD DEV',
    nameHi: 'मानक विचलन (STD DEV)',
    category: 'statistical',
    categoryHi: 'सांख्यिकीय',
    desc: 'Measures the spread of data around average.',
    descHi: 'औसत के आसपास डेटा के फैलाव की माप करता है।',
    type: 'scalar',
    compatibleTypes: ['number'],
    flow: 'Col [Selected] ──→ [ STD DEV FORMULA ] ──→ Deviation Value',
    fn: (vals) => {
      const nums = vals.map(Number).filter(v => !isNaN(v));
      if (nums.length <= 1) return 0;
      const mean = nums.reduce((s,v)=>s+v, 0)/nums.length;
      const variance = nums.reduce((s,v)=>s+Math.pow(v-mean, 2), 0)/(nums.length - 1);
      return Math.sqrt(variance);
    },
    example: { useCase: 'Check inconsistency in response times', useCaseHi: 'प्रतिक्रिया समय में उतार-चढ़ाव की जांच', data: '12, 15, 10, 14', result: '2.22' }
  },
  {
    id: 'range',
    name: 'RANGE',
    nameHi: 'परास (RANGE)',
    category: 'statistical',
    categoryHi: 'सांख्यिकीय',
    desc: 'Difference between highest and lowest value.',
    descHi: 'उच्चतम और न्यूनतम मानों के बीच का अंतर।',
    type: 'scalar',
    compatibleTypes: ['number'],
    flow: 'Col [Selected] ──→ [ MAX - MIN ] ──→ Range Width',
    fn: (vals) => {
      const nums = vals.map(Number).filter(v => !isNaN(v));
      return nums.length ? (Math.max(...nums) - Math.min(...nums)) : 0;
    },
    example: { useCase: 'Find difference between highest & lowest salaries', useCaseHi: 'वेतन में अधिकतम और न्यूनतम का अंतर', data: '10000, 35000, 50000', result: '40000' }
  },

  // MATHEMATICAL CATEGORY
  {
    id: 'round',
    name: 'ROUND',
    nameHi: 'पूर्णांक (ROUND)',
    category: 'mathematical',
    categoryHi: 'गणितीय',
    desc: 'Rounds numbers to a specified number of decimal places.',
    descHi: 'दशमलव संख्या को निर्दिष्ट अंकों तक पूर्णांकित करता है।',
    type: 'element',
    compatibleTypes: ['number'],
    inputs: [{ id: 'decimals', label: 'Decimal Places / दशमलव स्थान', type: 'number', defaultValue: 2 }],
    flow: 'Value [x] ──→ [ ROUND(x, decimals) ] ──→ Rounded Value',
    fn: (vals, params) => {
      const dec = parseInt(params.decimals) || 0;
      return vals.map(v => {
        const num = parseFloat(v);
        return isNaN(num) ? v : num.toFixed(dec);
      });
    },
    example: { useCase: 'Round decimal percentages to 2 decimals', useCaseHi: 'दशमलव प्रतिशत को 2 अंकों तक पूर्णांकित करना', data: '12.3456, 8.9102', result: '12.35, 8.91' }
  },
  {
    id: 'abs',
    name: 'ABS',
    nameHi: 'निरपेक्ष (ABS)',
    category: 'mathematical',
    categoryHi: 'गणितीय',
    desc: 'Converts negative numbers to positive numbers.',
    descHi: 'ऋणात्मक संख्याओं को धनात्मक में बदलता है।',
    type: 'element',
    compatibleTypes: ['number'],
    flow: 'Value [x] ──→ [ ABS(x) ] ──→ Absolute Value',
    fn: (vals) => vals.map(v => {
      const num = parseFloat(v);
      return isNaN(num) ? v : Math.abs(num);
    }),
    example: { useCase: 'Remove minus sign from profit/loss difference', useCaseHi: 'अंतर से ऋणात्मक चिन्ह हटाना', data: '-150, 200, -35', result: '150, 200, 35' }
  },
  {
    id: 'power',
    name: 'POWER',
    nameHi: 'घात (POWER)',
    category: 'mathematical',
    categoryHi: 'गणितीय',
    desc: 'Raises the value to a specified exponent.',
    descHi: 'मान को एक निर्दिष्ट घात (exponent) तक बढ़ाता है।',
    type: 'element',
    compatibleTypes: ['number'],
    inputs: [{ id: 'exponent', label: 'Power (Exponent) / घात संख्या', type: 'number', defaultValue: 2 }],
    flow: 'Value [x] ──→ [ x ^ exponent ] ──→ Powered Value',
    fn: (vals, params) => {
      const exp = parseFloat(params.exponent) || 2;
      return vals.map(v => {
        const num = parseFloat(v);
        return isNaN(num) ? v : Math.pow(num, exp);
      });
    },
    example: { useCase: 'Square all numbers in a column', useCaseHi: 'कॉलम की सभी संख्याओं का वर्ग करना', data: '3, 5, 10', result: '9, 25, 100' }
  },
  {
    id: 'sqrt',
    name: 'SQRT',
    nameHi: 'वर्गमूल (SQRT)',
    category: 'mathematical',
    categoryHi: 'गणितीय',
    desc: 'Calculates the square root of positive numbers.',
    descHi: 'धनात्मक संख्याओं के वर्गमूल की गणना करता है।',
    type: 'element',
    compatibleTypes: ['number'],
    flow: 'Value [x] ──→ [ √x ] ──→ Square Root',
    fn: (vals) => vals.map(v => {
      const num = parseFloat(v);
      return isNaN(num) || num < 0 ? v : Math.sqrt(num);
    }),
    example: { useCase: 'Find square root of variance', useCaseHi: 'संख्याओं का वर्गमूल प्राप्त करना', data: '9, 25, 100', result: '3, 5, 10' }
  },
  {
    id: 'mod',
    name: 'MOD',
    nameHi: 'शेषफल (MOD)',
    category: 'mathematical',
    categoryHi: 'गणितीय',
    desc: 'Returns the remainder after division.',
    descHi: 'भाग देने के बाद बचे हुए शेषफल को प्राप्त करता है।',
    type: 'element',
    compatibleTypes: ['number'],
    inputs: [{ id: 'divisor', label: 'Divisor / भाजक', type: 'number', defaultValue: 2 }],
    flow: 'Value [x] ──→ [ x % divisor ] ──→ Remainder',
    fn: (vals, params) => {
      const div = parseFloat(params.divisor) || 1;
      return vals.map(v => {
        const num = parseFloat(v);
        return isNaN(num) ? v : (num % div);
      });
    },
    example: { useCase: 'Find if row is even (MOD 2 is 0) or odd', useCaseHi: 'यह जानना कि संख्या सम है या विषम', data: '11, 12, 15', result: '1, 0, 1' }
  },

  // DATE & TIME CATEGORY
  {
    id: 'year',
    name: 'YEAR',
    nameHi: 'वर्ष (YEAR)',
    category: 'date',
    categoryHi: 'दिनांक और समय',
    desc: 'Extracts the year (4 digits) from a date.',
    descHi: 'दिनांक से 4 अंकों का वर्ष निकालता है।',
    type: 'element',
    compatibleTypes: ['date', 'text'],
    flow: 'Date [YYYY-MM-DD] ──→ [ EXTRACT YEAR ] ──→ YYYY',
    fn: (vals) => vals.map(v => {
      if (!v) return '';
      const d = new Date(v);
      return isNaN(d.getTime()) ? (String(v).match(/\b(19|20)\d{2}\b/)?.[0] || '') : d.getFullYear();
    }),
    example: { useCase: 'Extract year from posting date', useCaseHi: 'तिथि से वर्ष अलग करना', data: '2024-05-12, 10/11/2022', result: '2024, 2022' }
  },
  {
    id: 'month',
    name: 'MONTH',
    nameHi: 'माह (MONTH)',
    category: 'date',
    categoryHi: 'दिनांक और समय',
    desc: 'Extracts the month number (1 to 12) from a date.',
    descHi: 'दिनांक से माह की संख्या (1 से 12) निकालता है।',
    type: 'element',
    compatibleTypes: ['date', 'text'],
    flow: 'Date [YYYY-MM-DD] ──→ [ MONTH NUMBER ] ──→ MM (1-12)',
    fn: (vals) => vals.map(v => {
      if (!v) return '';
      const d = new Date(v);
      return isNaN(d.getTime()) ? '' : d.getMonth() + 1;
    }),
    example: { useCase: 'Find which month sales occurred in', useCaseHi: 'माह संख्या का पता लगाना', data: '2024-05-12, 10/11/2022', result: '5, 11' }
  },
  {
    id: 'month_name',
    name: 'MONTH NAME',
    nameHi: 'माह नाम (MONTH NAME)',
    category: 'date',
    categoryHi: 'दिनांक और समय',
    desc: 'Converts date to month name in English or Hindi.',
    descHi: 'दिनांक को अंग्रेजी या हिंदी में महीने के नाम में बदलता है।',
    type: 'element',
    compatibleTypes: ['date', 'text'],
    inputs: [
      { id: 'lang', label: 'Language / भाषा', type: 'select', options: [{value:'en', label:'English'}, {value:'hi', label:'Hindi / हिंदी'}], defaultValue: 'hi' }
    ],
    flow: 'Date ──→ [ MONTH NAME ] ──→ Month Word',
    fn: (vals, params) => {
      const monthsEn = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const monthsHi = ['जनवरी','फरवरी','मार्च','अप्रैल','मई','जून','जुलाई','अगस्त','सितंबर','अक्टूबर','नवंबर','दिसंबर'];
      const lang = params.lang || 'hi';
      return vals.map(v => {
        if (!v) return '';
        const d = new Date(v);
        if (isNaN(d.getTime())) return '';
        return lang === 'hi' ? monthsHi[d.getMonth()] : monthsEn[d.getMonth()];
      });
    },
    example: { useCase: 'Convert birth date to month name in Hindi', useCaseHi: 'जन्म तिथि को हिंदी महीने के नाम में बदलना', data: '2024-05-12, 2022-12-01', result: 'मई, दिसंबर' }
  },
  {
    id: 'day',
    name: 'DAY',
    nameHi: 'दिन (DAY)',
    category: 'date',
    categoryHi: 'दिनांक और समय',
    desc: 'Extracts day of the month (1-31).',
    descHi: 'दिनांक से महीने का दिन (1-31) निकालता है।',
    type: 'element',
    compatibleTypes: ['date', 'text'],
    flow: 'Date ──→ [ DAY NUMBER ] ──→ DD (1-31)',
    fn: (vals) => vals.map(v => {
      if (!v) return '';
      const d = new Date(v);
      return isNaN(d.getTime()) ? '' : d.getDate();
    }),
    example: { useCase: 'Extract day number from dates', useCaseHi: 'दिनांकों से दिन संख्या निकालना', data: '2024-05-12', result: '12' }
  },
  {
    id: 'day_name',
    name: 'DAY NAME',
    nameHi: 'दिन नाम (DAY NAME)',
    category: 'date',
    categoryHi: 'दिनांक और समय',
    desc: 'Gets day name (e.g., Sunday/रविवार).',
    descHi: 'सप्ताह के दिन का नाम (जैसे: रविवार) प्राप्त करता है।',
    type: 'element',
    compatibleTypes: ['date', 'text'],
    inputs: [
      { id: 'lang', label: 'Language / भाषा', type: 'select', options: [{value:'en', label:'English'}, {value:'hi', label:'Hindi / हिंदी'}], defaultValue: 'hi' }
    ],
    flow: 'Date ──→ [ DAY NAME ] ──→ Day Word',
    fn: (vals, params) => {
      const daysEn = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const daysHi = ['रविवार','सोमवार','मंगलवार','बुधवार','गुरुवार','शुक्रवार','शनिवार'];
      const lang = params.lang || 'hi';
      return vals.map(v => {
        if (!v) return '';
        const d = new Date(v);
        if (isNaN(d.getTime())) return '';
        return lang === 'hi' ? daysHi[d.getDay()] : daysEn[d.getDay()];
      });
    },
    example: { useCase: 'Find day of week for incident dates', useCaseHi: 'घटना दिनांकों के लिए सप्ताह का दिन ढूंढना', data: '2026-06-10', result: 'बुधवार' }
  },
  {
    id: 'date_diff',
    name: 'DATE DIFF (Days)',
    nameHi: 'दिनों का अंतर (DATE DIFF)',
    category: 'date',
    categoryHi: 'दिनांक और समय',
    desc: 'Calculates the number of days between two dates.',
    descHi: 'दो तिथियों के बीच के दिनों की संख्या की गणना करता है।',
    type: 'element',
    compatibleTypes: ['date', 'text'],
    inputs: [
      { id: 'secondCol', label: 'End Date Column / अंतिम तिथि कॉलम', type: 'column' }
    ],
    flow: 'Start [Date] ──→ [ DIFF with EndDate ] ──→ N Days',
    fn: (vals, params, allData, targetCol) => {
      const secColIdx = parseInt(params.secondCol);
      if (isNaN(secColIdx)) return vals.map(() => '');
      return vals.map((v, i) => {
        if (!v) return '';
        const d1 = new Date(v);
        const d2Val = allData[i] ? allData[i][secColIdx] : '';
        if (!d2Val) return '';
        const d2 = new Date(d2Val);
        if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return '';
        const diffTime = d2.getTime() - d1.getTime();
        return Math.floor(diffTime / (1000 * 60 * 60 * 24));
      });
    },
    example: { useCase: 'Calculate complaint resolution days', useCaseHi: 'शिकायत निवारण में लगे दिनों की गणना', data: '2024-05-10 to 2024-05-15', result: '5' }
  },
  {
    id: 'age_calc',
    name: 'AGE CALCULATOR',
    nameHi: 'आयु गणना (AGE CALCULATOR)',
    category: 'date',
    categoryHi: 'दिनांक और समय',
    desc: 'Calculates current age from birthdate.',
    descHi: 'जन्म तिथि से वर्तमान आयु की गणना करता है।',
    type: 'element',
    compatibleTypes: ['date', 'text'],
    flow: 'Birth Date ──→ [ AGE FORMULA ] ──→ Age (Years)',
    fn: (vals) => {
      const today = new Date();
      return vals.map(v => {
        if (!v) return '';
        const dob = new Date(v);
        if (isNaN(dob.getTime())) return '';
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
        return age;
      });
    },
    example: { useCase: 'Calculate officer age from DOB', useCaseHi: 'अधिकारी की जन्मतिथि से आयु की गणना', data: '1988-08-15', result: '37 (approx)' }
  },
  {
    id: 'financial_year',
    name: 'FINANCIAL YEAR',
    nameHi: 'वित्तीय वर्ष (FINANCIAL YEAR)',
    category: 'date',
    categoryHi: 'दिनांक और समय',
    desc: 'Returns Indian Financial Year (Apr-Mar) for date.',
    descHi: 'तिथि के लिए भारतीय वित्तीय वर्ष (अप्रैल-मार्च) देता है।',
    type: 'element',
    compatibleTypes: ['date', 'text'],
    flow: 'Date ──→ [ FY CALCULATOR ] ──→ "FY 2025-26"',
    fn: (vals) => vals.map(v => {
      if (!v) return '';
      const d = new Date(v);
      if (isNaN(d.getTime())) return '';
      const year = d.getFullYear();
      const month = d.getMonth();
      if (month >= 3) {
        return `FY ${year}-${String(year+1).substring(2)}`;
      } else {
        return `FY ${year-1}-${String(year).substring(2)}`;
      }
    }),
    example: { useCase: 'Group transaction dates by Financial Year', useCaseHi: 'लेनदेन तिथियों को वित्तीय वर्ष अनुसार वर्गीकृत करना', data: '2024-02-15, 2024-05-10', result: 'FY 2023-24, FY 2024-25' }
  },

  // TEXT CATEGORY
  {
    id: 'uppercase',
    name: 'UPPERCASE',
    nameHi: 'बड़े अक्षर (UPPERCASE)',
    category: 'text',
    categoryHi: 'पाठ',
    desc: 'Converts all English text characters to uppercase.',
    descHi: 'सभी अंग्रेजी अक्षरों को बड़े अक्षरों (UPPERCASE) में बदलता है।',
    type: 'element',
    compatibleTypes: ['text'],
    flow: 'Text [abc] ──→ [ UPPERCASE ] ──→ Text [ABC]',
    fn: (vals) => vals.map(v => String(v || '').toUpperCase()),
    example: { useCase: 'Normalize city names to all caps', useCaseHi: 'शहर के नामों को बड़े अक्षरों में बदलना', data: 'jaipur, jodhpur', result: 'JAIPUR, JODHPUR' }
  },
  {
    id: 'lowercase',
    name: 'LOWERCASE',
    nameHi: 'छोटे अक्षर (LOWERCASE)',
    category: 'text',
    categoryHi: 'पाठ',
    desc: 'Converts all English characters to lowercase.',
    descHi: 'सभी अंग्रेजी अक्षरों को छोटे अक्षरों (LOWERCASE) में बदलता है।',
    type: 'element',
    compatibleTypes: ['text'],
    flow: 'Text [ABC] ──→ [ LOWERCASE ] ──→ Text [abc]',
    fn: (vals) => vals.map(v => String(v || '').toLowerCase()),
    example: { useCase: 'Normalize email addresses', useCaseHi: 'ईमेल पतों को छोटे अक्षरों में बदलना', data: 'NEERAJ@Rajasthan.in', result: 'neeraj@rajasthan.in' }
  },
  {
    id: 'titlecase',
    name: 'TITLE CASE',
    nameHi: 'शीर्षक रूप (TITLE CASE)',
    category: 'text',
    categoryHi: 'पाठ',
    desc: 'Capitalizes the first letter of each word.',
    descHi: 'प्रत्येक शब्द के पहले अक्षर को बड़ा (Capitalize) करता है।',
    type: 'element',
    compatibleTypes: ['text'],
    flow: 'Text [neeraj purohit] ──→ [ TITLE CASE ] ──→ [Neeraj Purohit]',
    fn: (vals) => vals.map(v => {
      const s = String(v || '');
      return s.replace(/\b\w/g, c => c.toUpperCase());
    }),
    example: { useCase: 'Format officer names nicely', useCaseHi: 'अधिकारियों के नाम ठीक से स्वरूपित करना', data: 'neeraj purohit', result: 'Neeraj Purohit' }
  },
  {
    id: 'trim',
    name: 'TRIM',
    nameHi: 'छंटाई (TRIM)',
    category: 'text',
    categoryHi: 'पाठ',
    desc: 'Removes spaces from beginning and end of text.',
    descHi: 'पाठ के शुरुआत और अंत से अतिरिक्त खाली स्थानों को हटाता है।',
    type: 'element',
    compatibleTypes: ['text'],
    flow: 'Text [  name  ] ──→ [ TRIM ] ──→ Text [name]',
    fn: (vals) => vals.map(v => String(v || '').trim()),
    example: { useCase: 'Remove accidental spaces before merging names', useCaseHi: 'नामों के आगे और पीछे से खाली स्थान हटाना', data: '  Ajmer  , Jodhpur  ', result: 'Ajmer, Jodhpur' }
  },
  {
    id: 'length',
    name: 'LENGTH',
    nameHi: 'लंबाई (LENGTH)',
    category: 'text',
    categoryHi: 'पाठ',
    desc: 'Counts the number of characters in cell (works in Hindi too).',
    descHi: 'कोशिका में अक्षरों की संख्या गिनता है (हिंदी में भी काम करता है)।',
    type: 'element',
    compatibleTypes: ['text'],
    flow: 'Text [abc] ──→ [ CHAR COUNT ] ──→ 3',
    fn: (vals) => vals.map(v => String(v || '').length),
    example: { useCase: 'Check length of phone numbers or passwords', useCaseHi: 'फोन नंबर या पासवर्ड की लंबाई जांचना', data: '98290XXXXX, जयपुर', result: '10, 5' }
  },
  {
    id: 'left_n',
    name: 'LEFT N CHARS',
    nameHi: 'बायें N अक्षर (LEFT N CHARS)',
    category: 'text',
    categoryHi: 'पाठ',
    desc: 'Extracts the first N characters of text.',
    descHi: 'पाठ के पहले N अक्षरों को निकालता है।',
    type: 'element',
    compatibleTypes: ['text'],
    inputs: [{ id: 'n', label: 'Number of Characters (N) / अक्षरों की संख्या', type: 'number', defaultValue: 3 }],
    flow: 'Text ──→ [ LEFT N ] ──→ First N chars',
    fn: (vals, params) => {
      const n = parseInt(params.n) || 1;
      return vals.map(v => String(v || '').substring(0, n));
    },
    example: { useCase: 'Generate short codes / prefix from names', useCaseHi: 'नामों से संक्षिप्त कोड बनाना', data: 'Rajasthan, Police', result: 'Raj, Pol (for N=3)' }
  },
  {
    id: 'right_n',
    name: 'RIGHT N CHARS',
    nameHi: 'दायें N अक्षर (RIGHT N CHARS)',
    category: 'text',
    categoryHi: 'पाठ',
    desc: 'Extracts the last N characters of text.',
    descHi: 'पाठ के अंतिम N अक्षरों को निकालता है।',
    type: 'element',
    compatibleTypes: ['text'],
    inputs: [{ id: 'n', label: 'Number of Characters (N) / अक्षरों की संख्या', type: 'number', defaultValue: 3 }],
    flow: 'Text ──→ [ RIGHT N ] ──→ Last N chars',
    fn: (vals, params) => {
      const n = parseInt(params.n) || 1;
      return vals.map(v => {
        const s = String(v || '');
        return s.substring(Math.max(0, s.length - n));
      });
    },
    example: { useCase: 'Extract last digits of ID card or phone number', useCaseHi: 'आईडी कार्ड या फोन के अंतिम अंक निकालना', data: '9829012345', result: '345 (for N=3)' }
  },
  {
    id: 'concatenate',
    name: 'CONCATENATE',
    nameHi: 'जोड़ना (CONCATENATE)',
    category: 'text',
    categoryHi: 'पाठ',
    desc: 'Merges two columns together with a separator.',
    descHi: 'दो कॉलमों को आपस में एक विभाजक के साथ जोड़ता है।',
    type: 'element',
    compatibleTypes: ['text', 'number'],
    inputs: [
      { id: 'secondCol', label: 'Second Column / दूसरा कॉलम', type: 'column' },
      { id: 'separator', label: 'Separator / विभाजक', type: 'text', defaultValue: ' ' }
    ],
    flow: 'Col A + Separator + Col B ──→ Combined Text',
    fn: (vals, params, allData) => {
      const secColIdx = parseInt(params.secondCol);
      const sep = params.separator !== undefined ? params.separator : ' ';
      if (isNaN(secColIdx)) return vals.map(v => String(v || ''));
      return vals.map((v, i) => {
        const v2 = allData[i] ? allData[i][secColIdx] : '';
        return String(v || '') + sep + String(v2 || '');
      });
    },
    example: { useCase: 'Merge First Name and Last Name', useCaseHi: 'प्रथम नाम और अंतिम नाम को जोड़ना', data: 'Neeraj + Purohit', result: 'Neeraj Purohit' }
  },
  {
    id: 'contains_check',
    name: 'CONTAINS CHECK',
    nameHi: 'शामिल जांच (CONTAINS CHECK)',
    category: 'text',
    categoryHi: 'पाठ',
    desc: 'Checks if text contains a specific word (Yes/No).',
    descHi: 'जांचता है कि पाठ में विशिष्ट शब्द शामिल है या नहीं (हाँ/नहीं)।',
    type: 'element',
    compatibleTypes: ['text'],
    inputs: [{ id: 'text', label: 'Text to Find / खोजने के लिए शब्द', type: 'text', defaultValue: 'Police' }],
    flow: 'Text ──→ [ CONTAINS search_text? ] ──→ Yes / No',
    fn: (vals, params) => {
      const searchVal = String(params.text || '').toLowerCase();
      return vals.map(v => {
        const s = String(v || '').toLowerCase();
        return s.includes(searchVal) ? 'Yes' : 'No';
      });
    },
    example: { useCase: 'Filter rows containing a keyword', useCaseHi: 'कीवर्ड वाले पंक्तियों को खोजना', data: 'Rajasthan Police, Jaipur Traffic', result: 'Yes, No (for "Police")' }
  },

  // LOGICAL CATEGORY
  {
    id: 'if_gt',
    name: 'IF (Greater Than)',
    nameHi: 'यदि बड़ा हो (IF >)',
    category: 'logical',
    categoryHi: 'तार्किक',
    desc: 'Returns custom labels based on whether values exceed a threshold.',
    descHi: 'यदि संख्या निर्दिष्ट सीमा से अधिक हो तो पहला लेबल अन्यथा दूसरा लेबल देता है।',
    type: 'element',
    compatibleTypes: ['number'],
    inputs: [
      { id: 'threshold', label: 'Threshold Value / सीमा मान', type: 'number', defaultValue: 50000 },
      { id: 'trueVal', label: 'Label if Greater / यदि बड़ा हो तो लेबल', type: 'text', defaultValue: 'High / उच्च' },
      { id: 'falseVal', label: 'Otherwise / अन्यथा लेबल', type: 'text', defaultValue: 'Low / निम्न' }
    ],
    flow: 'Value > Threshold ? TrueLabel : FalseLabel',
    fn: (vals, params) => {
      const th = parseFloat(params.threshold) || 0;
      return vals.map(v => {
        const num = parseFloat(v);
        if (isNaN(num)) return '';
        return num > th ? params.trueVal : params.falseVal;
      });
    },
    example: { useCase: 'Flag high salary employees (> 50k)', useCaseHi: '50 हजार से अधिक वेतन को चिन्हित करना', data: '45000, 60000', result: 'Low, High' }
  },
  {
    id: 'if_lt',
    name: 'IF (Less Than)',
    nameHi: 'यदि छोटा हो (IF <)',
    category: 'logical',
    categoryHi: 'तार्किक',
    desc: 'Returns custom labels based on whether values are less than threshold.',
    descHi: 'यदि संख्या निर्दिष्ट सीमा से कम हो तो पहला लेबल अन्यथा दूसरा लेबल देता है।',
    type: 'element',
    compatibleTypes: ['number'],
    inputs: [
      { id: 'threshold', label: 'Threshold Value / सीमा मान', type: 'number', defaultValue: 33 },
      { id: 'trueVal', label: 'Label if Less / यदि छोटा हो तो लेबल', type: 'text', defaultValue: 'Fail' },
      { id: 'falseVal', label: 'Otherwise / अन्यथा लेबल', type: 'text', defaultValue: 'Pass' }
    ],
    flow: 'Value < Threshold ? TrueLabel : FalseLabel',
    fn: (vals, params) => {
      const th = parseFloat(params.threshold) || 0;
      return vals.map(v => {
        const num = parseFloat(v);
        if (isNaN(num)) return '';
        return num < th ? params.trueVal : params.falseVal;
      });
    },
    example: { useCase: 'Mark students scoring less than 33 as Fail', useCaseHi: '33 से कम अंक वालों को अनुत्तीर्ण दर्शाना', data: '28, 75', result: 'Fail, Pass' }
  },
  {
    id: 'duplicate_flag',
    name: 'DUPLICATE FLAG',
    nameHi: 'दोहराव जांच (DUPLICATE)',
    category: 'logical',
    categoryHi: 'तार्किक',
    desc: 'Identifies if a row value has already appeared above in this column.',
    descHi: 'जांचता है कि क्या मान पहले भी आ चुका है (दोहराव)।',
    type: 'element',
    compatibleTypes: ['number', 'text'],
    flow: 'Value ──→ [ IN PREVIOUS ROWS? ] ──→ Duplicate / Unique',
    fn: (vals) => {
      const seen = new Set();
      return vals.map(v => {
        const s = String(v || '').trim();
        if (s === '') return '';
        if (seen.has(s)) {
          return 'Duplicate';
        } else {
          seen.add(s);
          return 'Unique';
        }
      });
    },
    example: { useCase: 'Identify duplicate mobile numbers or IDs', useCaseHi: 'दोहरे मोबाइल नंबरों की पहचान', data: '98290, 98290, 98291', result: 'Unique, Duplicate, Unique' }
  },
  {
    id: 'null_check',
    name: 'NULL CHECK',
    nameHi: 'रिक्त जांच (NULL CHECK)',
    category: 'logical',
    categoryHi: 'तार्किक',
    desc: 'Flags empty vs filled cells.',
    descHi: 'खाली बनाम भरे हुए खानों की जांच कर चिह्नित करता है।',
    type: 'element',
    compatibleTypes: ['number', 'text', 'date'],
    flow: 'Value ──→ [ IS EMPTY? ] ──→ Blank / Filled',
    fn: (vals) => vals.map(v => (v === '' || v === null || v === undefined) ? 'Blank' : 'Filled'),
    example: { useCase: 'Find missing mobile numbers', useCaseHi: 'लापता मोबाइल नंबरों को खोजना', data: '98290, "", 98291', result: 'Filled, Blank, Filled' }
  },

  // FINANCIAL CATEGORY
  {
    id: 'percentage_of',
    name: 'PERCENTAGE OF',
    nameHi: 'प्रतिशत (PERCENTAGE OF)',
    category: 'financial',
    categoryHi: 'वित्तीय',
    desc: 'Calculates the value as a percentage of another column.',
    descHi: 'एक कॉलम के मान को दूसरे कॉलम के प्रतिशत के रूप में निकालता है।',
    type: 'element',
    compatibleTypes: ['number'],
    inputs: [
      { id: 'secondCol', label: 'Denominator (Total) Column / भाजक कॉलम', type: 'column' }
    ],
    flow: 'A / B * 100 ──→ Percentage %',
    fn: (vals, params, allData) => {
      const secColIdx = parseInt(params.secondCol);
      if (isNaN(secColIdx)) return vals.map(() => '');
      return vals.map((v, i) => {
        const num = parseFloat(v);
        const den = allData[i] ? parseFloat(allData[i][secColIdx]) : NaN;
        if (isNaN(num) || isNaN(den) || den === 0) return '';
        return ((num / den) * 100).toFixed(2) + '%';
      });
    },
    example: { useCase: 'Calculate percentage of marks obtained', useCaseHi: 'प्राप्त अंकों के प्रतिशत की गणना करना', data: '380 out of 500', result: '76.00%' }
  },
  {
    id: 'profit_loss',
    name: 'PROFIT / LOSS',
    nameHi: 'लाभ / हानि (PROFIT / LOSS)',
    category: 'financial',
    categoryHi: 'वित्तीय',
    desc: 'Calculates Profit or Loss (Selling Price - Cost Price).',
    descHi: 'लाभ या हानि की गणना करता है (विक्रय मूल्य - क्रय मूल्य)।',
    type: 'element',
    compatibleTypes: ['number'],
    inputs: [
      { id: 'costCol', label: 'Cost Price Column / क्रय मूल्य कॉलम', type: 'column' }
    ],
    flow: 'SellingPrice - CostPrice ──→ Profit / Loss',
    fn: (vals, params, allData, targetCol) => {
      const costColIdx = parseInt(params.costCol);
      if (isNaN(costColIdx)) return vals.map(() => '');
      return vals.map((v, i) => {
        const sp = parseFloat(v);
        const cp = allData[i] ? parseFloat(allData[i][costColIdx]) : NaN;
        if (isNaN(sp) || isNaN(cp)) return '';
        return (sp - cp).toFixed(2);
      });
    },
    example: { useCase: 'Calculate net profit per item', useCaseHi: 'प्रति वस्तु शुद्ध लाभ की गणना करना', data: 'SP=120, CP=100', result: '20.00' }
  },
  {
    id: 'tax_amount',
    name: 'TAX AMOUNT',
    nameHi: 'कर राशि (TAX AMOUNT)',
    category: 'financial',
    categoryHi: 'वित्तीय',
    desc: 'Calculates tax amount based on percentage.',
    descHi: 'दिए गए प्रतिशत के आधार पर कर राशि की गणना करता है।',
    type: 'element',
    compatibleTypes: ['number'],
    inputs: [
      { id: 'taxPercent', label: 'Tax Rate (%) / कर दर (%)', type: 'number', defaultValue: 18 }
    ],
    flow: 'Value * Tax% ──→ Tax Amount',
    fn: (vals, params) => {
      const rate = parseFloat(params.taxPercent) || 0;
      return vals.map(v => {
        const num = parseFloat(v);
        if (isNaN(num)) return '';
        return (num * (rate / 100)).toFixed(2);
      });
    },
    example: { useCase: 'Calculate GST (18%) on items', useCaseHi: 'वस्तुओं पर जीएसटी (18%) निकालना', data: '1000, 200', result: '180.00, 36.00' }
  },
  {
    id: 'discount',
    name: 'DISCOUNT',
    nameHi: 'छूट (DISCOUNT)',
    category: 'financial',
    categoryHi: 'वित्तीय',
    desc: 'Calculates discounted price.',
    descHi: 'छूट के बाद अंतिम मूल्य की गणना करता है।',
    type: 'element',
    compatibleTypes: ['number'],
    inputs: [
      { id: 'discountPercent', label: 'Discount (%) / छूट (%)', type: 'number', defaultValue: 10 }
    ],
    flow: 'Value * (1 - Discount%) ──→ Discounted Price',
    fn: (vals, params) => {
      const rate = parseFloat(params.discountPercent) || 0;
      return vals.map(v => {
        const num = parseFloat(v);
        if (isNaN(num)) return '';
        return (num * (1 - rate / 100)).toFixed(2);
      });
    },
    example: { useCase: 'Apply festival discount of 10%', useCaseHi: '10% त्यौहार छूट लागू करना', data: '500, 1000', result: '450.00, 900.00' }
  },

  // ANALYTICS CATEGORY
  {
    id: 'pct_of_total',
    name: '% OF TOTAL',
    nameHi: 'कुल का प्रतिशत (% OF TOTAL)',
    category: 'analytics',
    categoryHi: 'विश्लेषण',
    desc: 'Calculates value divided by the sum of the entire column * 100.',
    descHi: 'कॉलम के कुल योग के सापेक्ष मूल्य का प्रतिशत निकालता है।',
    type: 'element',
    compatibleTypes: ['number'],
    flow: 'Cell / ColumnSum * 100 ──→ Share %',
    fn: (vals) => {
      const nums = vals.map(Number).filter(v => !isNaN(v));
      const total = nums.reduce((s, v) => s + v, 0);
      return vals.map(v => {
        const num = parseFloat(v);
        if (isNaN(num) || total === 0) return '';
        return ((num / total) * 100).toFixed(2) + '%';
      });
    },
    example: { useCase: 'Find share of city sales to total sales', useCaseHi: 'कुल बिक्री में शहर की बिक्री का हिस्सा निकालना', data: 'Total=1000; Row=250', result: '25.00%' }
  },
  {
    id: 'cumulative_sum',
    name: 'CUMULATIVE SUM',
    nameHi: 'संचयी योग (CUMULATIVE SUM)',
    category: 'analytics',
    categoryHi: 'विश्लेषण',
    desc: 'Calculates running/cumulative total of a column.',
    descHi: 'कॉलम का चलता हुआ संचयी योग (Running Total) निकालता है।',
    type: 'element',
    compatibleTypes: ['number'],
    flow: 'Cell + CumulativePrevious ──→ Running Total',
    fn: (vals) => {
      let running = 0;
      return vals.map(v => {
        const num = parseFloat(v);
        if (isNaN(num)) return running;
        running += num;
        return running.toFixed(2);
      });
    },
    example: { useCase: 'Track cumulative monthly sales growth', useCaseHi: 'संचयी मासिक बिक्री में वृद्धि को ट्रैक करना', data: '100, 150, 200', result: '100, 250, 450' }
  },
  {
    id: 'deviation_avg',
    name: 'DEVIATION FROM AVG',
    nameHi: 'औसत से विचलन (DEVIATION FROM AVG)',
    category: 'analytics',
    categoryHi: 'विश्लेषण',
    desc: 'Subtracts the average of the column from each value.',
    descHi: 'प्रत्येक मान से कॉलम के औसत (Mean) को घटाता है।',
    type: 'element',
    compatibleTypes: ['number'],
    flow: 'Cell - ColumnAverage ──→ Difference',
    fn: (vals) => {
      const nums = vals.map(Number).filter(v => !isNaN(v));
      const avg = nums.length ? (nums.reduce((s, v) => s + v, 0) / nums.length) : 0;
      return vals.map(v => {
        const num = parseFloat(v);
        if (isNaN(num)) return '';
        return (num - avg).toFixed(2);
      });
    },
    example: { useCase: 'Check how far salaries deviate from mean', useCaseHi: 'वेतन का औसत से अंतर ज्ञात करना', data: 'Avg=40000; Cell=45000, 35000', result: '5000.00, -5000.00' }
  },
  {
    id: 'above_below_avg',
    name: 'ABOVE/BELOW AVG',
    nameHi: 'औसत से ऊपर/नीचे (ABOVE/BELOW)',
    category: 'analytics',
    categoryHi: 'विश्लेषण',
    desc: 'Flags if cell is Above Average or Below Average.',
    descHi: 'कोशिका मान औसत से ऊपर है या औसत से नीचे, यह चिह्नित करता है।',
    type: 'element',
    compatibleTypes: ['number'],
    flow: 'Cell > Average ? Above Average : Below Average',
    fn: (vals) => {
      const nums = vals.map(Number).filter(v => !isNaN(v));
      const avg = nums.length ? (nums.reduce((s, v) => s + v, 0) / nums.length) : 0;
      return vals.map(v => {
        const num = parseFloat(v);
        if (isNaN(num)) return '';
        return num > avg ? 'Above Average' : 'Below Average';
      });
    },
    example: { useCase: 'Flag outlets performing better than average', useCaseHi: 'औसत से अधिक प्रदर्शन वाले केंद्रों की पहचान', data: 'Avg=50; Row=65, 40', result: 'Above Average, Below Average' }
  },
  {
    id: 'normalize',
    name: 'NORMALIZE (0-1)',
    nameHi: 'सामान्यीकरण (NORMALIZE)',
    category: 'analytics',
    categoryHi: 'विश्लेषण',
    desc: 'Scales numbers so they range precisely between 0 and 1.',
    descHi: 'संख्याओं को 0 और 1 के बीच स्केल (सामान्यीकृत) करता है।',
    type: 'element',
    compatibleTypes: ['number'],
    flow: '(Cell - Min) / (Max - Min) ──→ Scaled 0 to 1',
    fn: (vals) => {
      const nums = vals.map(Number).filter(v => !isNaN(v));
      if (!nums.length) return vals.map(() => '');
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      const range = max - min;
      return vals.map(v => {
        const num = parseFloat(v);
        if (isNaN(num)) return '';
        return range === 0 ? '0' : ((num - min) / range).toFixed(4);
      });
    },
    example: { useCase: 'Create a standardized scale for scoring', useCaseHi: 'विभिन्न मापदंडों का मानकीकरण', data: 'Min=10, Max=50; Cell=30', result: '0.5000' }
  },
  {
    id: 'percentile',
    name: 'PERCENTILE',
    nameHi: 'प्रतिशतक',
    category: 'statistical',
    categoryHi: 'सांख्यिकीय',
    desc: 'Finds the value below which a selected percentage of observations falls.',
    descHi: 'वह मान निकालता है जिसके नीचे चुने गए प्रतिशत के रिकॉर्ड आते हैं।',
    type: 'scalar',
    compatibleTypes: ['number'],
    inputs: [{ id:'percent', label:'Percentile (0-100) / प्रतिशतक', type:'number', defaultValue:90 }],
    flow: 'Numeric Column ──→ [ SORT + POSITION ] ──→ Percentile',
    fn: (vals,params) => {
      const nums = vals.map(parseFlexibleNumber).filter(v => v !== null);
      const ratio = Math.min(100,Math.max(0,parseFloat(params.percent)||90))/100;
      return percentile(nums,ratio);
    },
    example: { useCase:'Find the salary level covering 90% of employees', useCaseHi:'90% कर्मचारियों का वेतन स्तर निकालना', data:'20, 30, 40, 50, 100', result:'80' }
  },
  {
    id: 'coefficient_variation',
    name: 'COEFFICIENT OF VARIATION',
    nameHi: 'परिवर्तन गुणांक',
    category: 'statistical',
    categoryHi: 'सांख्यिकीय',
    desc: 'Measures variation relative to the average, expressed as a percentage.',
    descHi: 'औसत की तुलना में डेटा के फैलाव को प्रतिशत में मापता है।',
    type: 'scalar',
    compatibleTypes: ['number'],
    flow: 'Standard Deviation / Average ──→ [ × 100 ] ──→ CV %',
    fn: (vals) => {
      const nums = vals.map(parseFlexibleNumber).filter(v => v !== null);
      if (!nums.length) return 0;
      const mean = nums.reduce((a,b)=>a+b,0)/nums.length;
      if (mean === 0) return 0;
      const sd = Math.sqrt(nums.reduce((sum,value)=>sum+Math.pow(value-mean,2),0)/nums.length);
      return (sd/Math.abs(mean))*100;
    },
    example: { useCase:'Compare consistency across branches', useCaseHi:'शाखाओं की स्थिरता की तुलना', data:'90, 100, 110', result:'8.16%' }
  },
  {
    id: 'running_average',
    name: 'RUNNING AVERAGE',
    nameHi: 'चल औसत',
    category: 'analytics',
    categoryHi: 'विश्लेषण',
    desc: 'Creates a cumulative average for every row.',
    descHi: 'प्रत्येक पंक्ति तक का संचयी औसत बनाता है।',
    type: 'element',
    compatibleTypes: ['number'],
    flow: 'Values to Current Row ──→ [ AVERAGE ] ──→ Running Average',
    fn: (vals) => {
      let total = 0, count = 0;
      return vals.map(value => {
        const number = parseFlexibleNumber(value);
        if (number === null) return '';
        total += number; count++;
        return (total/count).toFixed(2);
      });
    },
    example: { useCase:'Track average monthly disposal rate', useCaseHi:'मासिक निस्तारण का चल औसत', data:'10, 20, 30', result:'10, 15, 20' }
  },
  {
    id: 'rank',
    name: 'RANK',
    nameHi: 'रैंक',
    category: 'analytics',
    categoryHi: 'विश्लेषण',
    desc: 'Ranks numeric values from highest to lowest or lowest to highest.',
    descHi: 'संख्यात्मक मानों को बड़े से छोटे या छोटे से बड़े क्रम में रैंक देता है।',
    type: 'element',
    compatibleTypes: ['number'],
    inputs: [{ id:'order', label:'Order / क्रम', type:'select', options:[{value:'desc',label:'Highest first'},{value:'asc',label:'Lowest first'}], defaultValue:'desc' }],
    flow: 'Numeric Values ──→ [ SORT + POSITION ] ──→ Rank',
    fn: (vals,params) => {
      const parsed = vals.map(parseFlexibleNumber);
      const sorted = parsed.filter(v=>v!==null).sort((a,b)=>params.order==='asc'?a-b:b-a);
      return parsed.map(value => value === null ? '' : sorted.indexOf(value)+1);
    },
    example: { useCase:'Rank districts by performance', useCaseHi:'प्रदर्शन के आधार पर जिलों की रैंक', data:'80, 95, 70', result:'2, 1, 3' }
  },
  {
    id: 'service_years',
    name: 'SERVICE YEARS',
    nameHi: 'सेवा अवधि',
    category: 'date',
    categoryHi: 'दिनांक और समय',
    desc: 'Calculates completed years from joining date to today.',
    descHi: 'कार्यग्रहण तिथि से आज तक पूर्ण सेवा वर्ष निकालता है।',
    type: 'element',
    compatibleTypes: ['date','text'],
    flow: 'Joining Date ──→ [ TODAY - DATE ] ──→ Completed Years',
    fn: (vals) => vals.map(value => {
      const date = new Date(value);
      if (isNaN(date)) return '';
      const today = new Date();
      let years = today.getFullYear()-date.getFullYear();
      if (today < new Date(today.getFullYear(),date.getMonth(),date.getDate())) years--;
      return Math.max(0,years);
    }),
    example: { useCase:'Calculate employee service length', useCaseHi:'कर्मचारी की सेवा अवधि निकालना', data:'2015-06-01', result:'Completed years' }
  },
  {
    id: 'retirement_date',
    name: 'RETIREMENT DATE',
    nameHi: 'सेवानिवृत्ति तिथि',
    category: 'date',
    categoryHi: 'दिनांक और समय',
    desc: 'Calculates retirement date from date of birth and retirement age.',
    descHi: 'जन्म तिथि और सेवानिवृत्ति आयु से सेवानिवृत्ति तिथि निकालता है।',
    type: 'element',
    compatibleTypes: ['date','text'],
    inputs: [{ id:'age', label:'Retirement age / सेवानिवृत्ति आयु', type:'number', defaultValue:60 }],
    flow: 'Date of Birth + Age ──→ [ ADD YEARS ] ──→ Retirement Date',
    fn: (vals,params) => vals.map(value => {
      const date = new Date(value);
      if (isNaN(date)) return '';
      date.setFullYear(date.getFullYear()+(parseInt(params.age)||60));
      return date.toISOString().slice(0,10);
    }),
    example: { useCase:'Prepare retirement due list', useCaseHi:'सेवानिवृत्ति देय सूची बनाना', data:'DOB 1968-08-15, age 60', result:'2028-08-15' }
  },
  {
    id: 'weighted_average',
    name: 'WEIGHTED AVERAGE',
    nameHi: 'भारित औसत',
    category: 'financial',
    categoryHi: 'वित्तीय',
    desc: 'Calculates an average where each value has a separate weight.',
    descHi: 'प्रत्येक मान के अलग भार के आधार पर औसत निकालता है।',
    type: 'scalar',
    compatibleTypes: ['number'],
    inputs: [{ id:'weightCol', label:'Weight column / भार कॉलम', type:'column' }],
    flow: 'Value × Weight ──→ [ SUM / TOTAL WEIGHT ] ──→ Weighted Average',
    fn: (vals,params,allData) => {
      const weightCol = parseInt(params.weightCol);
      let weighted = 0, totalWeight = 0;
      vals.forEach((value,index) => {
        const number = parseFlexibleNumber(value);
        const weight = parseFlexibleNumber(allData[index]?.[weightCol]);
        if (number !== null && weight !== null) { weighted += number*weight; totalWeight += weight; }
      });
      return totalWeight ? weighted/totalWeight : 0;
    },
    example: { useCase:'Calculate weighted performance score', useCaseHi:'भारित प्रदर्शन स्कोर निकालना', data:'Score 80×2, 90×3', result:'86' }
  },
  {
    id: 'emi',
    name: 'EMI',
    nameHi: 'मासिक किस्त',
    category: 'financial',
    categoryHi: 'वित्तीय',
    desc: 'Calculates monthly loan instalment from principal, annual interest rate, and duration.',
    descHi: 'मूलधन, वार्षिक ब्याज दर और अवधि से मासिक किस्त निकालता है।',
    type: 'element',
    compatibleTypes: ['number'],
    inputs: [
      { id:'annualRate', label:'Annual interest % / वार्षिक ब्याज %', type:'number', defaultValue:8.5 },
      { id:'months', label:'Duration in months / अवधि (माह)', type:'number', defaultValue:60 }
    ],
    flow: 'Principal + Rate + Months ──→ [ EMI FORMULA ] ──→ Monthly Instalment',
    fn: (vals,params) => {
      const rate = (parseFloat(params.annualRate)||0)/1200;
      const months = Math.max(1,parseInt(params.months)||1);
      return vals.map(value => {
        const principal = parseFlexibleNumber(value);
        if (principal === null) return '';
        if (rate === 0) return (principal/months).toFixed(2);
        return (principal*rate*Math.pow(1+rate,months)/(Math.pow(1+rate,months)-1)).toFixed(2);
      });
    },
    example: { useCase:'Estimate employee loan instalments', useCaseHi:'ऋण की मासिक किस्त निकालना', data:'₹500000, 8.5%, 60 months', result:'Monthly EMI' }
  },
  {
    id: 'digits_only',
    name: 'EXTRACT DIGITS',
    nameHi: 'केवल अंक निकालें',
    category: 'text',
    categoryHi: 'पाठ',
    desc: 'Removes letters and symbols while preserving digits.',
    descHi: 'अक्षर और चिन्ह हटाकर केवल अंक रखता है।',
    type: 'element',
    compatibleTypes: ['text','number'],
    flow: 'Mixed Text ──→ [ REMOVE NON-DIGITS ] ──→ Digits',
    fn: (vals) => vals.map(value => String(value ?? '').replace(/\D/g,'')),
    example: { useCase:'Standardize phone numbers or file numbers', useCaseHi:'फोन या फाइल नंबर साफ करना', data:'+91-98290 12345', result:'919829012345' }
  }
];

function switchFormulaTab(tabId) {
  currentFormulaTab = tabId;
  document.querySelectorAll('.fs-tab').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.fs-tab-content').forEach(el => el.classList.remove('active'));
  
  const tabs = document.querySelectorAll('.fs-tab');
  if (tabId === 'guided') tabs[0].classList.add('active');
  else if (tabId === 'quick') tabs[1].classList.add('active');
  else if (tabId === 'library') tabs[2].classList.add('active');
  else if (tabId === 'guide') tabs[3].classList.add('active');
  
  document.getElementById('fs-tab-' + tabId).classList.add('active');
  
  if (tabId === 'guided') {
    populateGuidedOptions();
    updateGuidedControls();
    updateGuidedSelectionSummary();
    previewGuidedCalculation();
    renderSmartRecommendations();
    renderGuidedHistory();
  } else if (tabId === 'quick') renderQuickFormulas();
  else if (tabId === 'library') renderFormulaLibrary();
  else if (tabId === 'guide') renderFormulaGuide();
}

function initFormulasPanel() {
  const select = document.getElementById('formulasTargetCol');
  if (select) {
    const activeCol = (selectionStart && selectionStart.ci !== null) ? selectionStart.ci : 0;
    select.value = activeCol;
  }
  onFormulasTargetColChange();
  populateGuidedOptions();
  switchFormulaTab('guided');
}

function onFormulasTargetColChange() {
  const select = document.getElementById('formulasTargetCol');
  if (!select) return;
  const colIdx = parseInt(select.value);
  if (isNaN(colIdx)) return;
  
  const baseType = colTypes[colIdx] || 'text';
  const isHi = isHindiTextColumn(colIdx);
  const badge = document.getElementById('formulasColTypeBadge');
  if (badge) {
    badge.innerHTML = `Detected Type: <span class="dq-badge dq-high" style="font-size:10px;padding:2px 6px;">${baseType.toUpperCase()}${isHi ? ' (HINDI)' : ''}</span>`;
  }
  
  if (currentFormulaTab === 'quick') {
    renderQuickFormulas();
  }
}

function isHindiTextColumn(colIdx) {
  if (rawData.length === 0) return false;
  const sampleSize = Math.min(rawData.length, 50);
  for (let ri = 0; ri < sampleSize; ri++) {
    const val = String(rawData[ri][colIdx] || '');
    if (/[\u0900-\u097F]/.test(val)) return true;
  }
  return false;
}

function renderQuickFormulas() {
  const select = document.getElementById('formulasTargetCol');
  if (!select) return;
  const colIdx = parseInt(select.value);
  if (isNaN(colIdx)) return;
  
  const colType = colTypes[colIdx] || 'text';
  const container = document.getElementById('quickFormulasList');
  container.innerHTML = '';
  
  const compatible = FORMULA_LIBRARY.filter(f => f.compatibleTypes.includes(colType));
  
  if (compatible.length === 0) {
    container.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:20px;font-size:12px;">No formulas recommended for this column type. / इस प्रकार के कॉलम के लिए कोई सूत्र अनुशंसित नहीं हैं।</div>`;
    return;
  }
  
  compatible.forEach(f => {
    container.appendChild(createFormulaCardElement(f, colIdx, 'quick'));
  });
}

function renderFormulaLibrary() {
  const rail = document.getElementById('libraryCategoryRail');
  const list = document.getElementById('libraryFormulasList');
  const searchInput = document.getElementById('formulaSearchInput');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  
  const categories = [
    { id: 'all', name: 'All', nameHi: 'सभी' },
    { id: 'statistical', name: 'Stats', nameHi: 'सांख्यिकी' },
    { id: 'mathematical', name: 'Math', nameHi: 'गणित' },
    { id: 'date', name: 'Date', nameHi: 'दिनांक' },
    { id: 'text', name: 'Text', nameHi: 'पाठ' },
    { id: 'logical', name: 'Logical', nameHi: 'तार्किक' },
    { id: 'financial', name: 'Financial', nameHi: 'वित्तीय' },
    { id: 'analytics', name: 'Analytics', nameHi: 'विश्लेषण' }
  ];
  
  rail.innerHTML = categories.map(c => `
    <button class="fc-cat-btn ${currentLibraryCategory === c.id ? 'active' : ''}" onclick="onCategorySelect('${c.id}')">
      ${c.name}<br><span style="font-size:10px;opacity:0.8">${c.nameHi}</span>
    </button>
  `).join('');
  
  list.innerHTML = '';
  
  const targetColSelect = document.getElementById('formulasTargetCol');
  const colIdx = targetColSelect ? parseInt(targetColSelect.value) : 0;
  
  const filtered = FORMULA_LIBRARY.filter(f => {
    const matchesCat = currentLibraryCategory === 'all' || f.category === currentLibraryCategory;
    const matchesSearch = !query || 
      f.name.toLowerCase().includes(query) || 
      f.nameHi.toLowerCase().includes(query) || 
      f.desc.toLowerCase().includes(query) || 
      f.descHi.toLowerCase().includes(query);
    return matchesCat && matchesSearch;
  });
  
  if (filtered.length === 0) {
    list.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:20px;font-size:12px;">No formulas found. / कोई सूत्र नहीं मिला।</div>`;
    return;
  }
  
  filtered.forEach(f => {
    list.appendChild(createFormulaCardElement(f, colIdx, 'library'));
  });
}

function onCategorySelect(catId) {
  currentLibraryCategory = catId;
  renderFormulaLibrary();
}

function onFormulaSearch() {
  renderFormulaLibrary();
}

function createFormulaCardElement(f, colIdx, tabContext) {
  const card = document.createElement('div');
  card.className = 'formula-card';
  card.id = `fc-${tabContext}-${f.id}`;
  
  let headerHtml = `
    <div class="fc-header">
      <div class="fc-title-wrap">
        <span class="fc-title">${f.name}</span>
        <span class="fc-title-hi">${f.nameHi}</span>
      </div>
      <span class="fc-badge" style="background:var(--accent-light);color:var(--accent)">${f.category.toUpperCase()}</span>
    </div>
    <div class="fc-desc">
      <div>${f.desc}</div>
      <div class="fc-desc-hi">${f.descHi}</div>
    </div>
  `;
  
  let inputsHtml = '';
  if (f.inputs && f.inputs.length > 0) {
    inputsHtml += `<div class="fc-inputs-wrap" style="display:flex;flex-direction:column;gap:8px;margin-top:6px;border-top:1px solid var(--border-light);padding-top:8px;">`;
    f.inputs.forEach(input => {
      inputsHtml += `<div style="display:flex;flex-direction:column;gap:2px;">
        <label style="font-size:10px;font-weight:600;color:var(--text-secondary);">${input.label}</label>`;
      if (input.type === 'column') {
        inputsHtml += `<select class="fc-param select" data-param-id="${input.id}" onchange="updateLivePreview('${f.id}', '${card.id}', ${colIdx})" style="height:28px;padding:0 4px;font-size:11px;border-radius:4px;border:1px solid var(--border);background:var(--card-bg);color:var(--text-primary);width:100%;">`;
        headers.forEach((h, idx) => {
          inputsHtml += `<option value="${idx}" ${idx === colIdx ? 'disabled style="color:var(--text-muted)"' : ''}>${h}</option>`;
        });
        inputsHtml += `</select>`;
      } else if (input.type === 'select') {
        inputsHtml += `<select class="fc-param select" data-param-id="${input.id}" onchange="updateLivePreview('${f.id}', '${card.id}', ${colIdx})" style="height:28px;padding:0 4px;font-size:11px;border-radius:4px;border:1px solid var(--border);background:var(--card-bg);color:var(--text-primary);width:100%;">`;
        input.options.forEach(opt => {
          inputsHtml += `<option value="${opt.value}" ${opt.value === input.defaultValue ? 'selected' : ''}>${opt.label}</option>`;
        });
        inputsHtml += `</select>`;
      } else if (input.type === 'number') {
        inputsHtml += `<input type="number" class="fc-param" data-param-id="${input.id}" value="${input.defaultValue}" oninput="updateLivePreview('${f.id}', '${card.id}', ${colIdx})" style="height:28px;padding:0 8px;font-size:11px;border-radius:4px;border:1px solid var(--border);background:var(--card-bg);color:var(--text-primary);width:100%;">`;
      } else {
        inputsHtml += `<input type="text" class="fc-param" data-param-id="${input.id}" value="${input.defaultValue || ''}" oninput="updateLivePreview('${f.id}', '${card.id}', ${colIdx})" style="height:28px;padding:0 8px;font-size:11px;border-radius:4px;border:1px solid var(--border);background:var(--card-bg);color:var(--text-primary);width:100%;">`;
      }
      inputsHtml += `</div>`;
    });
    inputsHtml += `</div>`;
  }
  
  let flowNodes = '';
  if (f.flow) {
    flowNodes = `<div class="fc-flow" style="margin-top:6px;">`;
    const parts = f.flow.split('──→');
    parts.forEach((part, idx) => {
      if (idx > 0) flowNodes += `<span class="flow-arrow">➔</span>`;
      let nodeClass = 'flow-node';
      if (idx === 0) nodeClass += ' input';
      else if (idx === parts.length - 1) nodeClass += ' output';
      else nodeClass += ' process';
      
      let nodeText = part.trim();
      if (nodeText.includes('[Selected]')) {
        nodeText = nodeText.replace('[Selected]', `[${headers[colIdx] || 'Col'}]`);
      }
      flowNodes += `<span class="${nodeClass}">${nodeText}</span>`;
    });
    flowNodes += `</div>`;
  }
  
  let outputNameHtml = '';
  if (f.type === 'element') {
    const cleanColName = (headers[colIdx] || 'Col').replace(/\s+/g, '_');
    const suggestedName = `${f.name}_of_${cleanColName}`;
    outputNameHtml = `
      <div style="margin-top:8px;display:flex;align-items:center;gap:6px;">
        <span style="font-size:11px;white-space:nowrap;color:var(--text-secondary);">Output Column:</span>
        <input type="text" class="fc-output-name" value="${suggestedName}" style="flex:1;height:26px;padding:0 6px;font-size:11px;border-radius:4px;border:1px solid var(--border);background:var(--card-bg);color:var(--text-primary);">
      </div>
    `;
  }
  
  let previewHtml = `
    <div class="fc-preview-wrap" style="margin-top:6px;">
      <div class="fs-live-preview" id="preview-val-${card.id}" style="width:100%;box-sizing:border-box;">
        <span class="fs-live-preview-label">Preview</span> Calculating...
      </div>
    </div>
  `;
  
  let actionHtml = `
    <div style="margin-top:8px;display:flex;gap:6px;">
      <button class="tb-btn primary" onclick="executeFormula('${f.id}', '${card.id}', ${colIdx})" style="flex:1;justify-content:center;font-size:11.5px;height:30px;">
        ${f.type === 'element' ? '✅ Create New Column / नया कॉलम जोड़ें' : '📊 Apply Formula / परिणाम दिखाएं'}
      </button>
    </div>
  `;
  
  card.innerHTML = headerHtml + flowNodes + inputsHtml + outputNameHtml + previewHtml + actionHtml;
  
  setTimeout(() => {
    updateLivePreview(f.id, card.id, colIdx);
  }, 10);
  
  return card;
}

function updateLivePreview(formulaId, cardId, colIdx) {
  const cardEl = document.getElementById(cardId);
  if (!cardEl) return;
  
  const f = FORMULA_LIBRARY.find(item => item.id === formulaId);
  if (!f) return;
  
  const params = {};
  cardEl.querySelectorAll('.fc-param').forEach(el => {
    params[el.dataset.paramId] = el.value;
  });
  
  const previewSpan = document.getElementById(`preview-val-${cardId}`);
  if (!previewSpan) return;
  
  try {
    const rawVals = rawData.map(r => r[colIdx]);
    if (f.type === 'scalar') {
      const res = f.fn(rawVals, params, rawData, colIdx);
      const formatted = typeof res === 'number' ? formatNum(res) : res;
      previewSpan.innerHTML = `<span class="fs-live-preview-label">Preview / पूर्वावलोकन</span> <strong>Result / परिणाम:</strong> ${formatted}`;
    } else {
      const res = f.fn(rawVals, params, rawData, colIdx);
      const samples = [];
      const limit = Math.min(res.length, 3);
      for (let i = 0; i < limit; i++) {
        samples.push(`"${res[i] !== undefined && res[i] !== null ? res[i] : ''}"`);
      }
      previewSpan.innerHTML = `<span class="fs-live-preview-label">Preview / पूर्वावलोकन</span> [${samples.join(', ')}${res.length > 3 ? ', ...' : ''}]`;
    }
  } catch (err) {
    previewSpan.innerHTML = `<span class="fs-live-preview-label" style="background:var(--danger)">Error</span> Calculation failed.`;
  }
}

function executeFormula(formulaId, cardId, colIdx) {
  const cardEl = document.getElementById(cardId);
  if (!cardEl) return;
  
  const f = FORMULA_LIBRARY.find(item => item.id === formulaId);
  if (!f) return;
  
  const params = {};
  cardEl.querySelectorAll('.fc-param').forEach(el => {
    params[el.dataset.paramId] = el.value;
  });
  
  const rawVals = rawData.map(r => r[colIdx]);
  
  try {
    if (f.type === 'scalar') {
      const res = f.fn(rawVals, params, rawData, colIdx);
      const formatted = typeof res === 'number' ? formatNum(res) : res;
      showScalarResultDialog(f.name, f.nameHi, formatted, colIdx);
    } else {
      const res = f.fn(rawVals, params, rawData, colIdx);
      const outputInput = cardEl.querySelector('.fc-output-name');
      const outputColName = outputInput ? outputInput.value.trim() : `${f.name}_of_${headers[colIdx]}`;
      
      const sourceAddress = `${getCellRef(0, colIdx)}:${getCellRef(Math.max(0, rawData.length - 1), colIdx)}`;
      const formulaName = f.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
      const newColIdx = addNewColumn(outputColName, f.compatibleTypes.includes('number') ? 'number' : 'text', res, {
        formula: `=${formulaName}(${sourceAddress})`,
        source: sourceAddress,
        sourceLabel: headers[colIdx],
        label: f.name
      });
      toast(`Created column "${outputColName}"`, 'success');
      closePanel('formulas');
      focusResultCell(0, newColIdx);
    }
  } catch (err) {
    toast(`Failed to apply formula: ${err.message}`, 'error');
  }
}

function addNewColumn(colName, colType, values, formulaMeta = null) {
  pushUndo();
  headers.push(colName);
  colTypes.push(colType);
  const newColIdx = headers.length - 1;
  rawData.forEach((row, i) => {
    row.push(values[i] !== undefined && values[i] !== null ? String(values[i]) : '');
    if (formulaMeta) {
      registerFormulaResult(i, newColIdx, {
        ...formulaMeta,
        source: getCellRef(i, parseCellReference(formulaMeta.source.split(':')[0]).ci),
        result: row[newColIdx]
      });
    }
  });
  showTable();
  populatePanelSelects();
  autoSave();
  return newColIdx;
}

function showScalarResultDialog(name, nameHi, result, colIdx) {
  const modalId = 'scalarResultModal';
  let modal = document.getElementById(modalId);
  if (!modal) {
    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-backdrop';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(0,0,0,0.4)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '9999';
    document.body.appendChild(modal);
  }
  
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal" style="width: 400px; padding: 24px; border-radius: var(--radius-lg); background: var(--card-bg); border: 1px solid var(--border); box-shadow: 0 10px 30px rgba(0,0,0,0.15); display: flex; flex-direction: column; gap: 16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-light);padding-bottom:10px;">
        <h4 style="margin:0;font-size:16px;font-weight:700;color:var(--text-primary);font-family:'Outfit',sans-serif;">${name} Result / परिणाम</h4>
        <button onclick="document.getElementById('${modalId}').style.display='none'" style="border:none;background:transparent;font-size:20px;cursor:pointer;color:var(--text-secondary);">&times;</button>
      </div>
      <div style="text-align:center;padding:16px 8px;background:var(--bg-primary);border-radius:var(--radius-md);border:1px dashed var(--border);">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">${nameHi} of ${headers[colIdx]}</div>
        <div style="font-size:28px;font-weight:800;color:var(--accent);font-family:'Outfit',sans-serif;">${result}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <button class="tb-btn primary" onclick="copyToClipboard('${result}');toast('Copied to clipboard', 'success');document.getElementById('${modalId}').style.display='none';" style="justify-content:center;height:36px;">📋 Copy Value / मान कॉपी करें</button>
        <button class="tb-btn" onclick="addConstantColumn('${name}_${headers[colIdx]}', '${result}');document.getElementById('${modalId}').style.display='none';" style="justify-content:center;height:36px;">➕ Create Constant Column / स्थिर कॉलम बनाएं</button>
        <button class="tb-btn" onclick="addScalarKpiCard('${name} of ${headers[colIdx]}', '${result}');document.getElementById('${modalId}').style.display='none';" style="justify-content:center;height:36px;">📊 Add to Dashboard / डैशबोर्ड पर जोड़ें</button>
      </div>
    </div>
  `;
}

function copyToClipboard(text) {
  const el = document.createElement('textarea');
  el.value = text;
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
}

function addConstantColumn(colName, value) {
  const size = rawData.length;
  const vals = new Array(size).fill(value);
  addNewColumn(colName, isNaN(Number(value)) ? 'text' : 'number', vals);
}

function addScalarKpiCard(kpiTitle, kpiVal) {
  customKpis.push({ title: kpiTitle, value: kpiVal });
  toast(`Added "${kpiTitle}" KPI card to Dashboard`, 'success');
}

function renderFormulaGuide() {
  const container = document.getElementById('guideAccordion');
  if (!container) return;
  
  const categories = {
    statistical: { name: 'Statistical Formulas / सांख्यिकीय सूत्र', icon: '📊', items: [] },
    mathematical: { name: 'Mathematical Formulas / गणितीय सूत्र', icon: '🔢', items: [] },
    date: { name: 'Date & Time Formulas / दिनांक और समय सूत्र', icon: '📅', items: [] },
    text: { name: 'Text Formulas / पाठ सूत्र', icon: '🔤', items: [] },
    logical: { name: 'Logical / Conditional / तार्किक सूत्र', icon: '💡', items: [] },
    financial: { name: 'Financial & Business / वित्तीय सूत्र', icon: '💰', items: [] },
    analytics: { name: 'Analytics & Insights / विश्लेषण सूत्र', icon: '📈', items: [] }
  };
  
  FORMULA_LIBRARY.forEach(f => {
    if (categories[f.category]) {
      categories[f.category].items.push(f);
    }
  });
  
  let html = '';
  Object.keys(categories).forEach(catId => {
    const cat = categories[catId];
    if (cat.items.length === 0) return;
    
    html += `
      <div class="guide-group" id="gg-${catId}">
        <div class="guide-group-header" onclick="toggleGuideAccordion('gg-${catId}')">
          <span>${cat.icon} ${cat.name}</span>
          <span class="accordion-arrow">▼</span>
        </div>
        <div class="guide-group-body">
    `;
    
    cat.items.forEach(f => {
      let flowNodes = '';
      if (f.flow) {
        flowNodes = `<div class="fc-flow" style="margin: 4px 0 8px;">`;
        const parts = f.flow.split('──→');
        parts.forEach((part, idx) => {
          if (idx > 0) flowNodes += `<span class="flow-arrow">➔</span>`;
          let nodeClass = 'flow-node';
          if (idx === 0) nodeClass += ' input';
          else if (idx === parts.length - 1) nodeClass += ' output';
          else nodeClass += ' process';
          flowNodes += `<span class="${nodeClass}">${part.trim()}</span>`;
        });
        flowNodes += `</div>`;
      }
      
      html += `
        <div class="guide-item" style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border-light)">
          <h5 style="margin:0 0 4px;font-size:12px;font-weight:700;color:var(--text-primary);">${f.name} / ${f.nameHi}</h5>
          <div class="guide-item-desc" style="font-size:11.5px;color:var(--text-secondary);line-height:1.4;margin-bottom:6px;">
            <strong>EN:</strong> ${f.desc}<br>
            <strong>HI:</strong> ${f.descHi}
          </div>
          ${flowNodes}
          <div class="guide-example" style="background:var(--bg-primary);padding:6px 10px;border-radius:var(--radius-sm);font-size:10.5px;color:var(--text-secondary);margin-top:4px;border-left:3px solid var(--accent);">
            <strong>Example / उदाहरण:</strong> ${f.example.useCase} (${f.example.useCaseHi})<br>
            <strong>Data / डेटा:</strong> <code>${f.example.data}</code> ➔ <strong>Result / परिणाम:</strong> <code>${f.example.result}</code>
          </div>
        </div>
      `;
    });
    
    html += `
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

function toggleGuideAccordion(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('open');
  const arrow = el.querySelector('.accordion-arrow');
  if (arrow) {
    arrow.textContent = el.classList.contains('open') ? '▲' : '▼';
  }
}

console.log('Stellura (स्टेल्यूरा) loaded successfully. © Neeraj Purohit, purohitneeraj87@gmail.com');

// =====================================================================
//  ASYNC EXPORT PROGRESS
// =====================================================================
function showExportProgress(title) {
  title = title || 'Preparing export…';
  var m = document.getElementById('export-progress-modal');
  document.getElementById('export-progress-title').textContent = title;
  document.getElementById('export-progress-bar-fill').style.width = '0%';
  document.getElementById('export-progress-pct').textContent = '0%';
  document.getElementById('export-progress-sub').textContent = 'This may take a few seconds…';
  document.getElementById('export-progress-icon').textContent = '⏳';
  m.style.display = 'flex';
}

function updateExportProgress(pct, sub) {
  document.getElementById('export-progress-bar-fill').style.width = pct + '%';
  document.getElementById('export-progress-pct').textContent = pct + '%';
  if (sub) document.getElementById('export-progress-sub').textContent = sub;
}

function hideExportProgress() {
  document.getElementById('export-progress-modal').style.display = 'none';
}

function pollExportJob(jobId, filename) {
  var pct = 10;
  var interval = setInterval(function() {
    fetch('/api/export/status/' + jobId)
      .then(function(r) {
        var ct = r.headers.get('Content-Type') || '';
        if (ct.includes('application/') || ct.includes('text/html')) {
          clearInterval(interval);
          updateExportProgress(100, 'Done!');
          document.getElementById('export-progress-icon').textContent = '✅';
          return r.blob().then(function(blob) {
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.download = filename; a.click();
            setTimeout(function() { URL.revokeObjectURL(url); }, 5000);
            setTimeout(hideExportProgress, 1200);
            toast('Export ready! File downloaded.', 'success');
          });
        }
        return r.json().then(function(data) {
          if (data.status === 'error') {
            clearInterval(interval);
            hideExportProgress();
            toast('Export failed: ' + (data.error || 'Unknown error'), 'error');
          } else if (data.status === 'not_found') {
            clearInterval(interval);
            hideExportProgress();
            toast('Export job expired. Please try again.', 'error');
          } else {
            pct = Math.min(pct + 12, 85);
            updateExportProgress(pct, 'Processing data…');
          }
        });
      })
      .catch(function() {
        clearInterval(interval);
        hideExportProgress();
        toast('Export connection lost. Please try again.', 'error');
      });
  }, 800);
}
