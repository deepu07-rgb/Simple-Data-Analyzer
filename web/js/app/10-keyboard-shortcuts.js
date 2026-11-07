// =====================================================================
//  KEYBOARD SHORTCUTS
// =====================================================================
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch(e.key.toLowerCase()) {
        case 'z': e.preventDefault(); undoAction(); break;
        case 'y': e.preventDefault(); redoAction(); break;
        case 's': e.preventDefault(); saveState(); break;
        case 'f': e.preventDefault(); document.getElementById('searchInput').focus(); break;
        case 'o': e.preventDefault(); document.getElementById('fileInput').click(); break;
        case 'e': e.preventDefault(); showExportExcelDialog(); break;
        case 'd': e.preventDefault(); toggleTheme(); break;
        case '`': e.preventDefault(); toggleFormulaBar(); break;
        case '/': e.preventDefault(); showShortcuts(); break;
        case 'a': {
          const activeEl = document.activeElement;
          if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
            break;
          }
          e.preventDefault();
          selectAllWorksheetCells();
          break;
        }
      }
    }
    const activeEl = document.activeElement;
    const isEditing = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');
    if (!isEditing && activeCell.ri !== null && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.key)) {
      e.preventDefault();
      let nextRi = activeCell.ri;
      let nextCi = activeCell.ci;
      if (e.key === 'ArrowUp') nextRi--;
      if (e.key === 'ArrowDown') nextRi++;
      if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) nextCi--;
      if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) nextCi++;
      if (e.key === 'Tab' && nextCi >= headers.length) { nextCi = 0; nextRi++; }
      if (e.key === 'Tab' && nextCi < 0) { nextCi = headers.length - 1; nextRi--; }
      moveActiveSelection(nextRi, nextCi);
    }
    if (e.key === 'Escape') {
      document.querySelectorAll('.panel.visible').forEach(p => p.classList.remove('visible'));
      document.querySelectorAll('.modal-overlay.visible').forEach(m => m.classList.remove('visible'));
      document.getElementById('context-menu').style.display = 'none';
    }
    if (e.key === 'Delete' && selectedRows.size > 0) {
      deleteSelectedRows();
    }
  });
}

function moveActiveSelection(ri, ci) {
  if (!rawData.length || !headers.length) return;
  const nextRi = Math.max(0, Math.min(rawData.length - 1, ri));
  const nextCi = Math.max(0, Math.min(headers.length - 1, ci));
  activeCell = { ri: nextRi, ci: nextCi };
  selectionStart = { ...activeCell };
  selectionEnd = { ...activeCell };
  additionalSelections = [];
  selectionMode = 'cell';
  resultFocusKey = null;
  const container = document.getElementById('virtual-table-container');
  if (container) {
    const rowTop = nextRi * ROW_HEIGHT * worksheetZoom / 100;
    if (rowTop < container.scrollTop || rowTop > container.scrollTop + container.clientHeight - 60) {
      container.scrollTop = Math.max(0, rowTop - container.clientHeight / 2);
      renderTable();
    }
  }
  renderSelection();
  const td = document.querySelector(`#vtbody td[data-ri="${nextRi}"][data-ci="${nextCi}"]`);
  if (td) td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function showShortcuts() { showModal('shortcutsModal'); }

// =====================================================================
//  FORMULA BAR
// =====================================================================
function updateFormulaBarVisibility() {
  const fb  = document.getElementById('formula-bar');
  const fmt = document.getElementById('fmt-toolbar');
  const hasData = rawData.length > 0;
  fb.classList.toggle('visible', hasData);
  if (fmt) fmt.classList.toggle('visible', hasData);
}

function toggleFormulaBar() {
  const fb = document.getElementById('formula-bar');
  fb.classList.toggle('visible');
}

function applyFormula() {
  const formula = document.getElementById('formulaInput').value.trim();
  if (!formula) { toast('Enter a formula', 'error'); return; }
  if (rawData.length === 0) { toast('Import data first', 'error'); return; }

  pushUndo();

  try {
    if (formula.startsWith('=')) {
      const expr = formula.substring(1).trim();

      // cell arithmetic (=B2*C2, =(A1+A2)/2, =SUM(A1:A5)+SUM(B1:B5), =ROUND(B2/C2,2)): the result is written to the active cell
      if (!/^(IF|CONCAT|UPPER|LOWER|TRIM|COL)\(/i.test(expr) && !/^(SUM|AVERAGE|AVG|COUNT|MIN|MAX)\([^()]+\)$/i.test(expr) && activeCell.ri !== null) {
        let calc, calcErr = null; try { calc = evalCellExpression(expr); } catch (err) { calcErr = err; }
        if (calcErr === null) {
          rawData[activeCell.ri][activeCell.ci] = String(calc);
          registerFormulaResult(activeCell.ri, activeCell.ci, { formula, source: expr, sourceLabel: 'cells', label: 'cell formula', result: calc });
          autoSave(); focusResultCell(activeCell.ri, activeCell.ci); toast(`${formula} = ${formatNum(calc)} (written to ${getCellRef(activeCell.ri, activeCell.ci)})`, 'success'); return;
        }
        if (/^[\s\d.+\-*\/^()%A-Za-z$:,\[\]]+$/.test(expr) && /[A-Za-z]{1,3}\$?\d/.test(expr)) { toast('Formula: ' + calcErr.message, 'error'); return; }
      }
      // SUM, AVERAGE, COUNT, MIN, MAX - aggregate formulas
      const aggMatch = expr.match(/^(SUM|AVERAGE|AVG|COUNT|MIN|MAX)\((.+)\)$/i);
      if (aggMatch) {
        const func = aggMatch[1].toUpperCase();
        const sourceExpression = aggMatch[2].trim();
        let sourceItems = [];
        let sourceAddress = '';
        let sourceLabel = '';
        const rangePattern = /^[A-Za-z]+\d+(?::[A-Za-z]+\d+)?$/;
        if (rangePattern.test(sourceExpression)) {
          sourceItems = parseGuidedRanges(sourceExpression);
          sourceAddress = sourceExpression.toUpperCase();
          sourceLabel = `${sourceItems.length} selected cells`;
        } else {
          const ci = headers.findIndex(h => h.toLowerCase() === sourceExpression.toLowerCase());
          if (ci === -1) { toast('Column or range not found: ' + sourceExpression, 'error'); return; }
          sourceItems = rawData.map((row, ri) => ({ ri, ci, value: row[ci] }));
          sourceAddress = `${getCellRef(0, ci)}:${getCellRef(Math.max(0, rawData.length - 1), ci)}`;
          sourceLabel = headers[ci];
        }

        const nums = sourceItems.map(item => parseFlexibleNumber(item.value)).filter(n => n !== null);
        let result = 0;
        // Batch 18: try SQL aggregate first (exact, full-dataset for column sources)
        let sqlRes = null;
        if (typeof _dbSqlAggregate === 'function' && sourceLabel && sourceLabel === headers[headers.findIndex(h => h === sourceLabel)]) {
          sqlRes = _dbSqlAggregate(func, sourceLabel);
        }
        if (sqlRes !== null) {
          result = sqlRes;
        } else {
          switch(func) {
            case 'SUM': result = nums.reduce((a,b) => a+b, 0); break;
            case 'AVERAGE': case 'AVG': result = nums.length ? nums.reduce((a,b) => a+b, 0) / nums.length : 0; break;
            case 'COUNT': result = nums.length; break;
            case 'MIN': result = nums.length ? Math.min(...nums) : 0; break;
            case 'MAX': result = nums.length ? Math.max(...nums) : 0; break;
          }
        }
        if (activeCell.ri !== null && activeCell.ci !== null) {
          rawData[activeCell.ri][activeCell.ci] = String(result);
          registerFormulaResult(activeCell.ri, activeCell.ci, {
            formula,
            source: sourceAddress,
            sourceLabel,
            label: `${func} aggregate`,
            result
          });
          if (typeof _pvLog === 'function') _pvLog({actor:'user',action:'FORMULA',method:func.toLowerCase(),target:'cell:R'+activeCell.ri+':C'+activeCell.ci,inputs:['range:'+sourceAddress],output:'cell:R'+activeCell.ri+':C'+activeCell.ci,label:func+'('+sourceLabel+') = '+result+' → '+getCellRef(activeCell.ri,activeCell.ci),labelHi:func+'('+sourceLabel+') = '+result+' → '+getCellRef(activeCell.ri,activeCell.ci)+' में'});
          autoSave();
          focusResultCell(activeCell.ri, activeCell.ci);
          toast(`${func} result inserted at ${getCellRef(activeCell.ri, activeCell.ci)}`, 'success');
        } else {
          toast(`${func}(${sourceExpression}) = ${formatNum(result)}`, 'info');
        }
        return;
      }

      // IF formula: =IF(ColName>100,"High","Low")
      const ifMatch = expr.match(/^IF\((.+?)\s*([><=!]+)\s*(.+?)\s*,\s*"(.+?)"\s*,\s*"(.+?)"\s*\)$/i);
      if (ifMatch) {
        const colName = ifMatch[1].trim();
        const op = ifMatch[2];
        const threshold = ifMatch[3].trim();
        const trueVal = ifMatch[4];
        const falseVal = ifMatch[5];
        const ci = headers.findIndex(h => h.toLowerCase() === colName.toLowerCase());
        if (ci === -1) { toast('Column not found: ' + colName, 'error'); return; }

        const newColName = `IF(${headers[ci]})`;
        headers.push(newColName);
        colTypes.push('text');
        rawData.forEach(row => {
          const v = parseFloat(row[ci]);
          const tv = parseFloat(threshold);
          let result = falseVal;
          if (!isNaN(v) && !isNaN(tv)) {
            switch(op) {
              case '>': result = v > tv ? trueVal : falseVal; break;
              case '<': result = v < tv ? trueVal : falseVal; break;
              case '>=': result = v >= tv ? trueVal : falseVal; break;
              case '<=': result = v <= tv ? trueVal : falseVal; break;
              case '==': case '=': result = v === tv ? trueVal : falseVal; break;
              case '!=': result = v !== tv ? trueVal : falseVal; break;
            }
          } else {
            const sv = String(row[ci]);
            switch(op) {
              case '==': case '=': result = sv === threshold ? trueVal : falseVal; break;
              case '!=': result = sv !== threshold ? trueVal : falseVal; break;
              default: result = falseVal;
            }
          }
          row.push(result);
        });
        const newCi = headers.length - 1;
        registerCalculatedColumnMetadata(newCi, formula, [ci], newColName);
        showTable();
        toast(`Added column: ${newColName}`, 'success');
        focusResultCell(0, newCi);
        return;
      }

      // CONCAT formula: =CONCAT(Col1, " ", Col2)
      const concatMatch = expr.match(/^CONCAT\((.+)\)$/i);
      if (concatMatch) {
        const args = concatMatch[1].split(',').map(a => a.trim());
        const resolvedArgs = args.map(arg => {
          if (arg.startsWith('"') && arg.endsWith('"')) return { type: 'literal', value: arg.slice(1, -1) };
          const ci = headers.findIndex(h => h.toLowerCase() === arg.toLowerCase());
          if (ci >= 0) return { type: 'col', idx: ci };
          return { type: 'literal', value: arg };
        });

        headers.push('Concat');
        colTypes.push('text');
        rawData.forEach(row => {
          const val = resolvedArgs.map(a => a.type === 'col' ? String(row[a.idx] == null ? '' : row[a.idx]) : a.value).join('');
          row.push(val);
        });
        const newCi = headers.length - 1;
        registerCalculatedColumnMetadata(newCi, formula, resolvedArgs.filter(arg => arg.type === 'col').map(arg => arg.idx), 'Concatenation');
        showTable();
        toast('Added Concat column', 'success');
        focusResultCell(0, newCi);
        return;
      }

      // UPPER/LOWER/TRIM
      const strMatch = expr.match(/^(UPPER|LOWER|TRIM)\((.+)\)$/i);
      if (strMatch) {
        const func = strMatch[1].toUpperCase();
        const colName = strMatch[2].trim();
        const ci = headers.findIndex(h => h.toLowerCase() === colName.toLowerCase());
        if (ci === -1) { toast('Column not found: ' + colName, 'error'); return; }

        headers.push(`${func}(${headers[ci]})`);
        colTypes.push('text');
        rawData.forEach(row => {
          const v = String(row[ci] == null ? '' : row[ci]);
          switch(func) {
            case 'UPPER': row.push(v.toUpperCase()); break;
            case 'LOWER': row.push(v.toLowerCase()); break;
            case 'TRIM': row.push(v.trim()); break;
          }
        });
        const newCi = headers.length - 1;
        registerCalculatedColumnMetadata(newCi, formula, [ci], `${func} text transformation`);
        showTable();
        toast(`Added ${func} column`, 'success');
        focusResultCell(0, newCi);
        return;
      }

      // Simple math expression: =COL(Salary) * 0.1
      const mathMatch = expr.match(/^COL\((.+?)\)\s*([+\-*/])\s*(.+)$/i);
      if (mathMatch) {
        const colName = mathMatch[1].trim();
        const op = mathMatch[2];
        const operand = parseFloat(mathMatch[3].trim());
        const ci = headers.findIndex(h => h.toLowerCase() === colName.toLowerCase());
        if (ci === -1) { toast('Column not found: ' + colName, 'error'); return; }

        const newName = `${headers[ci]}${op}${operand}`;
        headers.push(newName);
        colTypes.push('number');
        rawData.forEach(row => {
          const v = parseFlexibleNumber(row[ci]);
          if (v === null) { row.push(''); return; }
          let result = 0;
          switch(op) {
            case '+': result = v + operand; break;
            case '-': result = v - operand; break;
            case '*': result = v * operand; break;
            case '/': result = operand !== 0 ? v / operand : 0; break;
          }
          row.push(result.toFixed(2));
        });
        const newCi = headers.length - 1;
        registerCalculatedColumnMetadata(newCi, formula, [ci], 'Calculated column');
        showTable();
        toast(`Added calculated column: ${newName}`, 'success');
        focusResultCell(0, newCi);
        return;
      }

      toast('Unrecognized formula. Try: =SUM(Col), =IF(Col>100,"High","Low"), =CONCAT(Col1," ",Col2), =UPPER(Col), =COL(Col)*2', 'error');
    } else {
      toast('Formula must start with =', 'error');
    }
  } catch(err) {
    toast('Formula error: ' + err.message, 'error');
  }
}

