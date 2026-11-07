// =====================================================================
//  EXCEL-STYLE EDITING
//  Ctrl+C / Ctrl+X / Ctrl+V on a block of cells (tab-separated, so it also pastes to and from Excel), Delete clears the selected cells, typing on a
//  selected cell starts editing it (Enter / F2 too), and the formula bar understands cell arithmetic: =B2*C2, =(A1+A2)/2, =SUM(A1:A5)+SUM(B1:B5),
//  =ROUND(B2/C2,2), =[Salary]*0.1 inside SUM(...). Results are values (as in the existing =SUM(...)), written to the active cell.
// =====================================================================
(function () {
  function typing() { const a = document.activeElement; return !!(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable)); }
  function haveSel() { return rawData.length > 0 && typeof getSelectionBounds === 'function' && getSelectionBounds() !== null && activeCell && activeCell.ri !== null; }
  function tsvOfSelection() {
    const b = getSelectionBounds(), lines = [];
    for (let ri = b.minRi; ri <= b.maxRi; ri++) { const cells = []; for (let ci = b.minCi; ci <= b.maxCi; ci++) { const v = rawData[ri] && rawData[ri][ci]; cells.push(String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' ')); } lines.push(cells.join('\t')); }
    return lines.join('\n');
  }
  function clearSelection() { const b = getSelectionBounds(); pushUndo(); for (let ri = b.minRi; ri <= b.maxRi; ri++) for (let ci = b.minCi; ci <= b.maxCi; ci++) { rawData[ri][ci] = ''; if (typeof cellFormulaMeta !== 'undefined') delete cellFormulaMeta[ri + ':' + ci]; } renderTable(); if (typeof autoSave === 'function') autoSave(); }
  document.addEventListener('copy', function (e) {
    if (typing() || !haveSel() || (window.getSelection && String(window.getSelection()).length > 0 && !document.getElementById('table-wrap').contains(window.getSelection().anchorNode))) return;
    e.clipboardData.setData('text/plain', tsvOfSelection()); e.preventDefault(); if (typeof toast === 'function') toast('Copied', 'success');
  });
  document.addEventListener('cut', function (e) {
    if (typing() || !haveSel()) return; e.clipboardData.setData('text/plain', tsvOfSelection()); e.preventDefault(); clearSelection(); if (typeof toast === 'function') toast('Cut', 'success');
  });
  document.addEventListener('paste', function (e) {
    if (typing() || !haveSel()) return;                                   // with no data open, the existing paste-a-table import runs
    const text = e.clipboardData && e.clipboardData.getData('text/plain'); if (text == null || text === '') return;
    e.preventDefault();
    const grid = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map(function (l) { return l.split('\t'); });
    const b = getSelectionBounds(); pushUndo();
    if (grid.length === 1 && grid[0].length === 1) {                      // one value pasted over a block fills the block (as Excel)
      for (let ri = b.minRi; ri <= b.maxRi; ri++) for (let ci = b.minCi; ci <= b.maxCi; ci++) rawData[ri][ci] = grid[0][0].trim();
    } else {
      grid.forEach(function (line, k) {
        const ri = b.minRi + k; while (ri >= rawData.length) rawData.push(new Array(headers.length).fill(''));
        line.forEach(function (v, j) { const ci = b.minCi + j; if (ci < headers.length) rawData[ri][ci] = v; });
      });
    }
    filteredData = null; showTable(); if (typeof autoSave === 'function') autoSave(); if (typeof toast === 'function') toast('Pasted', 'success');
  });
  document.addEventListener('keydown', function (e) {
    if (typing() || !haveSel() || e.ctrlKey || e.metaKey || e.altKey) return;
    const a = document.activeElement; if (a && a !== document.body && a.tagName !== 'TD' && !(document.getElementById('table-wrap') && document.getElementById('table-wrap').contains(a))) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && !(typeof selectedRows !== 'undefined' && selectedRows.size > 0)) { e.preventDefault(); clearSelection(); return; }
    const isChar = e.key.length === 1 && !e.ctrlKey, isEdit = e.key === 'F2' || e.key === 'Enter';
    if (!isChar && !isEdit) return;
    const td = document.querySelector('#vtbody td[data-ri="' + activeCell.ri + '"][data-ci="' + activeCell.ci + '"]'); if (!td) return;
    e.preventDefault(); editCell(activeCell.ri, activeCell.ci, td);
    const inp = td.querySelector('input'); if (inp && isChar) { inp.value = e.key; try { inp.setSelectionRange(1, 1); } catch (x) { /* fine */ } }
  });
})();

// ---- formula bar: arithmetic on cells ------------------------------------------------------------------------------------------------------------
function evalCellExpression(expr) {
  const toks = []; let m;
  const re = /\s*(?:(\d+\.?\d*|\.\d+)|(\$?[A-Za-z]{1,3}\$?\d+)(?::(\$?[A-Za-z]{1,3}\$?\d+))?|\[([^\]]+)\]|([A-Za-z]+)\s*\(|([+\-*\/^(),%]))/y; let pos = 0; const s = String(expr);
  while (pos < s.length) {
    re.lastIndex = pos; m = re.exec(s); if (!m) { if (/^\s*$/.test(s.slice(pos))) break; throw new Error('Cannot read “' + s.slice(pos, pos + 12) + '”'); }
    pos = re.lastIndex;
    if (m[1] !== undefined) toks.push({ t: 'n', v: parseFloat(m[1]) });
    else if (m[2] !== undefined) toks.push(m[3] !== undefined ? { t: 'r', a: m[2].replace(/\$/g, ''), b: m[3].replace(/\$/g, '') } : { t: 'c', a: m[2].replace(/\$/g, '') });
    else if (m[4] !== undefined) toks.push({ t: 'col', v: m[4] });
    else if (m[5] !== undefined) toks.push({ t: 'f', v: m[5].toUpperCase() });
    else toks.push({ t: 'o', v: m[6] });
  }
  let i = 0; const peek = () => toks[i], eatO = v => { if (toks[i] && toks[i].t === 'o' && toks[i].v === v) { i++; return true; } return false; };
  const cellVal = ref => {
    const p = parseCellReference(ref); if (!p || p.ri < 0 || p.ri >= rawData.length || p.ci < 0 || p.ci >= headers.length) throw new Error(ref + ' is outside the data');
    const raw = rawData[p.ri][p.ci]; if (raw === '' || raw == null) return 0; const n = parseFlexibleNumber(raw); if (n === null) throw new Error(ref + ' is not a number (“' + String(raw).slice(0, 20) + '”)'); return n;
  };
  const listOf = tk => {
    if (tk.t === 'r') { return parseGuidedRanges(tk.a + ':' + tk.b).map(it => parseFlexibleNumber(it.value)).filter(v => v !== null); }
    if (tk.t === 'col') { const ci = headers.findIndex(h => h.toLowerCase() === tk.v.trim().toLowerCase()); if (ci < 0) throw new Error('Column not found: ' + tk.v); return rawData.map(r => parseFlexibleNumber(r[ci])).filter(v => v !== null); }
    return null;
  };
  function expr1() { let v = term(); for (;;) { if (eatO('+')) v += term(); else if (eatO('-')) v -= term(); else return v; } }
  function term() { let v = pow(); for (;;) { if (eatO('*')) v *= pow(); else if (eatO('/')) { const d = pow(); if (d === 0) throw new Error('Division by zero'); v /= d; } else return v; } }
  function pow() { let v = unary(); if (eatO('^')) v = Math.pow(v, pow()); return v; }
  function unary() { if (eatO('-')) return -unary(); if (eatO('+')) return unary(); let v = primary(); while (eatO('%')) v /= 100; return v; }
  function primary() {
    const t = toks[i++]; if (!t) throw new Error('The formula ends too early');
    if (t.t === 'n') return t.v; if (t.t === 'c') return cellVal(t.a);
    if (t.t === 'o' && t.v === '(') { const v = expr1(); if (!eatO(')')) throw new Error('Missing )'); return v; }
    if (t.t === 'f') {
      const args = []; if (!eatO(')')) { for (;;) { const nx = peek(); if (nx && (nx.t === 'r' || nx.t === 'col') && toks[i + 1] && toks[i + 1].t === 'o' && (toks[i + 1].v === ',' || toks[i + 1].v === ')')) { args.push(listOf(nx)); i++; } else args.push([expr1()]); if (eatO(')')) break; if (!eatO(',')) throw new Error('Missing , or )'); } }
      const flat = [].concat.apply([], args);
      switch (t.v) {
        case 'SUM': return flat.reduce((a, b) => a + b, 0); case 'AVERAGE': case 'AVG': if (!flat.length) throw new Error('No numbers to average'); return flat.reduce((a, b) => a + b, 0) / flat.length;
        case 'MIN': if (!flat.length) throw new Error('No numbers'); return Math.min.apply(null, flat); case 'MAX': if (!flat.length) throw new Error('No numbers'); return Math.max.apply(null, flat);
        case 'COUNT': return flat.length; case 'ABS': return Math.abs(flat[0]); case 'SQRT': return Math.sqrt(flat[0]);
        case 'ROUND': { const d = flat.length > 1 ? flat[1] : 0, k = Math.pow(10, d); return Math.round((flat[0] + Number.EPSILON * Math.sign(flat[0])) * k) / k; }
        default: throw new Error('Unknown function ' + t.v);
      }
    }
    if (t.t === 'r' || t.t === 'col') { const l = listOf(t); if (l.length === 1) return l[0]; throw new Error('Use a range inside SUM( ), AVERAGE( ) …'); }
    throw new Error('Unexpected “' + (t.v || t.a) + '”');
  }
  const v = expr1(); if (i < toks.length) throw new Error('Unexpected “' + (toks[i].v || toks[i].a) + '”'); if (!isFinite(v)) throw new Error('Not a number');
  return parseFloat(v.toPrecision(12));
}
