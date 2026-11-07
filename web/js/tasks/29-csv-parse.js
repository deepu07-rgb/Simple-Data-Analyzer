// =====================================================================
//  CSV / TSV reader  /  CSV पढ़ने वाला
//  Reads the whole text as one stream, so a quoted cell may contain commas, quotes and LINE BREAKS (long
//  addresses, remarks) without tearing the row apart. Quotes open a cell only at its start; a stray quote in the
//  middle of text (5" pipe, आकार 5") is just a character.
//    STL.parseCsv(text, sep) -> array of rows (arrays of trimmed strings); empty lines are skipped.
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL = root.STL || {};
  STL.parseCsv = function (text, sep) {
    text = String(text == null ? '' : text);
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);                       // byte-order mark written by Excel
    sep = sep || ',';
    var rows = [], row = [], cell = '', quoted = false, inQ = false, n = text.length;
    function endCell() { row.push(cell.trim()); cell = ''; quoted = false; }
    function endRow() { endCell(); if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
    for (var i = 0; i < n; i++) {
      var ch = text.charAt(i);
      if (inQ) {
        if (ch === '"') { if (text.charAt(i + 1) === '"') { cell += '"'; i++; } else inQ = false; }
        else cell += ch;
        continue;
      }
      if (ch === '"' && !quoted && cell.trim() === '') { inQ = true; quoted = true; cell = ''; continue; }
      if (ch === sep) { endCell(); continue; }
      if (ch === '\n' || ch === '\r') { if (ch === '\r' && text.charAt(i + 1) === '\n') i++; endRow(); continue; }
      cell += ch;
    }
    if (cell !== '' || row.length) endRow();
    return rows;
  };
  // text that was damaged by an earlier save (every unknown letter became U+FFFD "�"): cannot be repaired, but the user should know
  STL.countDamaged = function (rows) {
    var cells = 0;
    for (var i = 0; i < rows.length; i++) { var r = rows[i]; for (var j = 0; j < r.length; j++) { var c = r[j]; if (typeof c === 'string' && c.indexOf('\uFFFD') >= 0) cells++; } }
    return cells;
  };
})(typeof window !== 'undefined' ? window : globalThis);
