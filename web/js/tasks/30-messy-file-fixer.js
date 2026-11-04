// =====================================================================
//  MESSY FILE FIXER  /  बिगड़ी फ़ाइल सुधार
//  Rule-based (no AI): finds and repairs the problems that office spreadsheets usually have.
//  Pure functions on a grid (array of rows of strings) so they can be tested without a browser.
//
//    STL.fix.analyze(grid)           -> { steps:[{id,title,detail,count,examples,auto,banner}], ... }
//    STL.fix.apply(grid, [ids])      -> new grid (header row first)
//
//  Every step recomputes what it needs from the grid it is given, so any subset can be applied
//  in the fixed order below and the result is still correct.
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL = root.STL || {};
  var F = STL.fix = {};

  // ---------------------------------------------------------------- helpers
  function s(v) { return v == null ? '' : String(v); }
  var ZERO_WIDTH = /[​-‍⁠﻿]/g;
  var ODD_SPACES = /[   -   　\t]/g;
  function isBlank(v) { return s(v).replace(ZERO_WIDTH, '').replace(ODD_SPACES, ' ').trim() === ''; }
  function width(grid) { var w = 0; grid.forEach(function (r) { if (r.length > w) w = r.length; }); return w; }
  function pad(grid) { var w = width(grid); return grid.map(function (r) { var o = r.slice(); while (o.length < w) o.push(''); return o; }); }
  function filled(row) { var n = 0; row.forEach(function (v) { if (!isBlank(v)) n++; }); return n; }
  function median(a) { if (!a.length) return 0; var b = a.slice().sort(function (x, y) { return x - y; }); var m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }
  function copy(grid) { return grid.map(function (r) { return r.slice(); }); }
  function clip(t, n) { t = s(t); return t.length > n ? t.slice(0, n - 1) + '…' : t; }

  // Devanagari digits
  var DEV0 = 0x0966;
  function devToAscii(t) { return s(t).replace(/[०-९]/g, function (c) { return String(c.charCodeAt(0) - DEV0); }); }
  function hasDevDigit(t) { return /[०-९]/.test(t); }

  var NUMBER_LIKE = /^[\s+\-(]*(?:₹|rs\.?|inr)?\s*[\d,.०-९]+/i;
  function looksNumeric(v) {
    var t = devToAscii(v).trim();
    return t !== '' && !isNaN(Number(t.replace(/,/g, '')));
  }

  // ---------------------------------------------------------------- number parsing (Indian style)
  var UNITS = [
    [/(?:\s*(?:crore|crores|cr\.?|करोड़|करोड|करोङ))$/i, 1e7],
    [/(?:\s*(?:lakh|lakhs|lac|lacs|lk|लाख))$/i, 1e5],
    [/(?:\s*(?:thousand|k|हज़ार|हजार))$/i, 1e3],
    [/(?:\s*(?:million|mn|m))$/i, 1e6],
    [/(?:\s*(?:arab|अरब))$/i, 1e9]
  ];
  // "2.5 लाख" -> 250000, "₹1,00,000/-" -> 100000, "(500)" -> -500, "१२३" -> 123. Returns null if not a number.
  function parseNumber(v) {
    var t = devToAscii(v).replace(ZERO_WIDTH, '').replace(ODD_SPACES, ' ').trim();
    if (!t || /%/.test(t)) return null;
    var neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1).trim(); }
    t = t.replace(/^(?:₹|rs\.?|inr|\$)\s*/i, '').replace(/\s*\/-?$/, '').replace(/\s*(?:only)$/i, '').trim();
    if (/^-/.test(t)) { neg = !neg; t = t.slice(1).trim(); } else if (/^\+/.test(t)) t = t.slice(1).trim();
    t = t.replace(/^(?:₹|rs\.?|inr)\s*/i, '');
    var mult = 1;
    for (var i = 0; i < UNITS.length; i++) {
      if (UNITS[i][0].test(t)) { mult = UNITS[i][1]; t = t.replace(UNITS[i][0], '').trim(); break; }
    }
    if (!/^\d[\d,]*(?:\.\d+)?$|^\.\d+$/.test(t)) return null;
    var n = Number(t.replace(/,/g, ''));
    if (!isFinite(n)) return null;
    n = n * mult;
    return neg ? -n : n;
  }
  function fmtNum(n) {
    if (Math.abs(n) >= 1e15) return String(n);
    var r = Math.round(n * 1e6) / 1e6;
    return String(r);
  }

  // ---------------------------------------------------------------- date parsing (day first, Indian style)
  var MONTHS = { jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
    'जनवरी': 1, 'फरवरी': 2, 'फ़रवरी': 2, 'मार्च': 3, 'अप्रैल': 4, 'अप्रेल': 4, 'मई': 5, 'जून': 6, 'जुलाई': 7, 'अगस्त': 8, 'सितंबर': 9, 'सितम्बर': 9, 'अक्टूबर': 10, 'अक्तूबर': 10, 'नवंबर': 11, 'नवम्बर': 11, 'दिसंबर': 12, 'दिसम्बर': 12 };
  function validYMD(y, m, d) {
    if (m < 1 || m > 12 || d < 1 || y < 1900 || y > 2200) return false;
    var dim = [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
    return d <= dim;
  }
  function iso(y, m, d) { return y + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d; }
  function fullYear(y) { return y < 100 ? (y <= 50 ? 2000 + y : 1900 + y) : y; }
  // returns {kind:'iso'|'num'|'text', a,b,y} so a column can decide day-first vs month-first together
  function parseDateParts(v) {
    var t = devToAscii(v).replace(ZERO_WIDTH, '').replace(ODD_SPACES, ' ').trim();
    t = t.replace(/\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?$/i, '');          // drop a trailing time
    var m;
    if ((m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/.exec(t))) return { kind: 'iso', y: +m[1], m: +m[2], d: +m[3] };
    if ((m = /^(\d{1,2})[-\/. ](\d{1,2})[-\/. ](\d{2}|\d{4})$/.exec(t))) return { kind: 'num', a: +m[1], b: +m[2], y: fullYear(+m[3]) };
    if ((m = /^(\d{1,2})[-\/. ]*([A-Za-zऀ-ॿ]+)\.?[-\/. ,]*(\d{2}|\d{4})$/.exec(t))) {
      var mo = MONTHS[m[2].toLowerCase()]; if (mo) return { kind: 'iso', y: fullYear(+m[3]), m: mo, d: +m[1] };
    }
    if ((m = /^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(t))) {
      var mo2 = MONTHS[m[1].toLowerCase()]; if (mo2) return { kind: 'iso', y: +m[3], m: mo2, d: +m[2] };
    }
    return null;
  }
  function serialToISO(n) {                                                       // Excel serial (1900 system)
    if (!(n >= 20000 && n <= 80000) || n !== Math.floor(n)) return null;
    var dt = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  var DATE_HEADER = /date|dob|doj|दिनांक|तारीख|तिथि|जन्म|dt\b|day/i;

  // ---------------------------------------------------------------- Krutidev detection
  // Krutidev/Devlys text is ASCII letters mixed with punctuation inside words ("eq[;ea=h") or
  // Latin-1 symbols. Ordinary English names do not look like that.
  function krutiSignal(v) {
    var t = s(v).trim();
    if (t.length < 3 || /[ऀ-ॿ]/.test(t)) return false;
    var hi = (t.match(/[\u0080-ÿ]/g) || []).length;
    if (hi / t.length > 0.08) return true;
    var tokens = t.split(/\s+/), hits = 0;
    tokens.forEach(function (w) {
      if (/@.*\./.test(w)) return;                                               // e-mail address
      if (/[A-Za-z][\[\]{};|^~\\`][A-Za-z\[\]{};|^~\\`]|^[\[\]{}|^~\\`][A-Za-z]/.test(w)) hits++;
    });
    return hits > 0 && hits / tokens.length >= 0.5;
  }

  // ---------------------------------------------------------------- the steps
  // Each transform(grid, ctx) -> { grid, count, examples:[{before,after}], note? }
  var STEPS = [];
  function step(id, title, detail, opts, transform) {
    STEPS.push({ id: id, title: title, detail: detail, auto: !!opts.auto, banner: !!opts.banner, transform: transform });
  }

  // 1. title rows above the real header
  function findHeaderRow(grid) {
    var g = grid;
    if (g.length < 3) return 0;
    var sample = g.slice(0, 60).map(filled).filter(function (n) { return n >= 2; });
    var dataW = median(sample);
    if (dataW < 2) return 0;
    var limit = Math.min(g.length - 1, 15);
    for (var i = 0; i <= limit; i++) {
      var n = filled(g[i]);
      if (n >= Math.max(2, Math.ceil(0.6 * dataW))) {
        var textual = 0;
        g[i].forEach(function (v) { if (!isBlank(v) && !looksNumeric(v)) textual++; });
        if (textual / n >= 0.7) return i;
      }
    }
    return 0;
  }
  // A group row (merged cells above a header: a few short text cells, no digits, row below is full) is part of the header.
  function isGroupRow(row, below) {
    var w = row.length, n = filled(row);
    if (n < 2 || n >= w || filled(below) < 0.8 * w) return false;
    var ok = true;
    row.forEach(function (v) { if (!isBlank(v) && (s(v).length > 28 || /[\d\u0966-\u096F:]/.test(s(v)))) ok = false; });
    return ok;
  }
  step('headerRow',
    { en: 'Remove title rows above the table', hi: 'तालिका के ऊपर की शीर्षक पंक्तियाँ हटाएँ' },
    { en: 'The real column names start lower down. Rows above them (report title, office name, date) are not data.', hi: 'असली कॉलम नाम नीचे से शुरू होते हैं। ऊपर की पंक्तियाँ (रिपोर्ट शीर्षक, कार्यालय का नाम) डेटा नहीं हैं।' },
    { auto: true, banner: true },
    function (grid) {
      var h = findHeaderRow(grid);
      if (h > 0 && isGroupRow(pad(grid)[h - 1], pad(grid)[h])) h = h - 1;          // keep the group row for the two-row header step
      if (!h) return { grid: grid, count: 0, examples: [] };
      var ex = grid.slice(0, Math.min(h, 3)).map(function (r) { return { before: clip(r.filter(function (v) { return !isBlank(v); }).join(' | '), 70), after: '' }; });
      return { grid: grid.slice(h), count: h, examples: ex };
    });

  // 2. two-row header (merged group names above sub-names)
  step('twoRowHeader',
    { en: 'Join the two header rows into one', hi: 'दो शीर्षक पंक्तियों को एक करें' },
    { en: 'The header is split over two rows (a group name above each sub-column). They are combined as "Group / Sub-column".', hi: 'शीर्षक दो पंक्तियों में बँटा है। उन्हें "समूह / उप-कॉलम" के रूप में जोड़ा जाता है।' },
    { auto: true, banner: true },
    function (grid) {
      if (grid.length < 4) return { grid: grid, count: 0, examples: [] };
      var g = pad(grid), w = g[0].length, top = g[0], sub = g[1];
      var topFilled = filled(top), subFilled = filled(sub);
      if (topFilled === w || topFilled < 1 || subFilled < 0.8 * w) return { grid: grid, count: 0, examples: [] };
      var subNum = 0; sub.forEach(function (v) { if (looksNumeric(v)) subNum++; });
      if (subNum / Math.max(subFilled, 1) > 0.34) return { grid: grid, count: 0, examples: [] };   // second row is data
      // rows below must look like data (some numbers or at least full rows)
      var below = g.slice(2, 8).map(filled);
      if (!below.length || median(below) < 0.6 * w) return { grid: grid, count: 0, examples: [] };
      var last = '', head = [], ex = [];
      for (var c = 0; c < w; c++) {
        if (!isBlank(top[c])) last = s(top[c]).trim();
        var sc = s(sub[c]).trim(), name;
        if (last && sc && last.toLowerCase() !== sc.toLowerCase() && c >= firstTopCol(top)) name = last + ' / ' + sc;
        else name = sc || last;
        head.push(name);
        if (ex.length < 3 && last && sc && name.indexOf(' / ') > 0) ex.push({ before: clip(last, 20) + ' ▸ ' + clip(sc, 20), after: clip(name, 44) });
      }
      return { grid: [head].concat(g.slice(2)), count: w, examples: ex };
    });
  function firstTopCol(top) { for (var i = 0; i < top.length; i++) if (!isBlank(top[i])) return i; return 0; }

  // 3. blank rows and columns
  step('blanks',
    { en: 'Remove empty rows and columns', hi: 'खाली पंक्तियाँ और कॉलम हटाएँ' },
    { en: 'Completely empty rows and columns (spacers) are removed.', hi: 'पूरी तरह खाली पंक्तियाँ और कॉलम (अंतराल) हटाए जाते हैं।' },
    { auto: true, banner: false },
    function (grid) {
      var g = pad(grid), w = g.length ? g[0].length : 0, removed = 0;
      var rows = g.filter(function (r, i) { if (i === 0) return true; var keep = filled(r) > 0; if (!keep) removed++; return keep; });
      var keepCols = [];
      for (var c = 0; c < w; c++) { var any = false; for (var r = 0; r < rows.length; r++) if (!isBlank(rows[r][c])) { any = true; break; } if (any) keepCols.push(c); else removed++; }
      if (!removed) return { grid: grid, count: 0, examples: [] };
      return { grid: rows.map(function (r) { return keepCols.map(function (c) { return r[c]; }); }), count: removed, examples: [] };
    });

  // 4. header repeated on every printed page
  function rowSimilar(a, b) {
    var w = Math.max(a.length, b.length), same = 0, tot = 0;
    for (var i = 0; i < w; i++) { if (isBlank(a[i]) && isBlank(b[i])) continue; tot++; if (s(a[i]).trim().toLowerCase() === s(b[i]).trim().toLowerCase()) same++; }
    return tot > 0 && same / tot >= 0.8;
  }
  step('repeatedHeaders',
    { en: 'Remove repeated header rows', hi: 'दोहराई गई शीर्षक पंक्तियाँ हटाएँ' },
    { en: 'The column names are repeated further down (usually at every printed page). They would be counted as data.', hi: 'कॉलम नाम नीचे फिर दोहराए गए हैं (अक्सर हर छपे पन्ने पर)। इन्हें डेटा गिना जाएगा।' },
    { auto: true, banner: true },
    function (grid) {
      if (grid.length < 3) return { grid: grid, count: 0, examples: [] };
      var head = grid[0], n = 0;
      var out = grid.filter(function (r, i) { if (i === 0) return true; if (filled(r) >= 2 && rowSimilar(head, r)) { n++; return false; } return true; });
      return n ? { grid: out, count: n, examples: [] } : { grid: grid, count: 0, examples: [] };
    });

  // 5. total / sub-total rows
  var TOTAL_RE = /^(?:grand\s*|sub\s*|g\.?\s*)?total\b|^(?:कुल|योग|जोड़|महायोग|उप\s*योग|उपयोग)(?:\s|$|:)/i;
  step('totalRows',
    { en: 'Remove total / sub-total rows', hi: 'कुल / उप-योग वाली पंक्तियाँ हटाएँ' },
    { en: 'Rows that are totals would be counted twice in every sum and average.', hi: 'योग वाली पंक्तियाँ हर जोड़ और औसत में दो बार गिनी जाएँगी।' },
    { auto: true, banner: true },
    function (grid) {
      var ex = [], n = 0;
      var out = grid.filter(function (r, i) {
        if (i === 0) return true;
        var firsts = r.filter(function (v) { return !isBlank(v); }).slice(0, 2);
        var hit = firsts.some(function (v) { return TOTAL_RE.test(s(v).trim()); });
        if (hit) { n++; if (ex.length < 3) ex.push({ before: clip(r.filter(function (v) { return !isBlank(v); }).slice(0, 4).join(' | '), 70), after: '' }); }
        return !hit;
      });
      return n ? { grid: out, count: n, examples: ex } : { grid: grid, count: 0, examples: [] };
    });

  // 6. values written once for a merged block (fill down)
  step('fillDown',
    { en: 'Fill in blanks under merged cells', hi: 'मर्ज सेल के नीचे के खाली स्थान भरें' },
    { en: 'A value such as a district is written only once for a block of rows (a merged cell). Each row gets its own value so it can be filtered and counted.', hi: 'जिला जैसा मान पंक्तियों के समूह के लिए एक बार लिखा गया है (मर्ज सेल)। हर पंक्ति को अपना मान मिलता है ताकि फ़िल्टर और गिनती हो सके।' },
    { auto: false, banner: false },
    function (grid) {
      var g = pad(grid), w = g.length ? g[0].length : 0, n = g.length - 1, ex = [], count = 0;
      if (n < 4) return { grid: grid, count: 0, examples: [] };
      var out = copy(g);
      var cols = Math.min(w, 3);
      for (var c = 0; c < cols; c++) {
        var blanks = 0, dataRows = 0, runs = 0, runLen = 0, textual = 0, filledCt = 0, structural = 0;
        for (var r = 1; r <= n; r++) {
          var rowFilled = filled(g[r]) - (isBlank(g[r][c]) ? 0 : 1);
          if (rowFilled < Math.max(2, 0.5 * (w - 1))) continue;                       // not a data row
          dataRows++;
          if (isBlank(g[r][c])) { blanks++; structural++; runLen++; }
          else { filledCt++; if (!looksNumeric(g[r][c])) textual++; if (runLen) { runs++; runLen = 0; } }
        }
        if (runLen) runs++;
        if (dataRows < 4 || filledCt < 2 || isBlank(g[1][c])) continue;
        var frac = blanks / dataRows;
        if (frac < 0.2 || frac > 0.92 || textual / filledCt < 0.7) continue;
        // must look like blocks: blanks come in runs (avg run >= 1.5), not scattered single gaps
        if (runs === 0 || blanks / runs < 1.5) continue;
        var last = '', changed = 0;
        for (var r2 = 1; r2 <= n; r2++) {
          if (!isBlank(g[r2][c])) { last = g[r2][c]; continue; }
          if (filled(g[r2]) >= Math.max(2, 0.5 * (w - 1)) && last) { out[r2][c] = last; changed++; if (ex.length < 3 && changed === 1) ex.push({ before: g[0][c] + ': (empty)', after: g[0][c] + ': ' + clip(last, 20) }); }
        }
        count += changed;
      }
      return count ? { grid: out, count: count, examples: ex } : { grid: grid, count: 0, examples: [] };
    });

  // 7. whitespace
  step('whitespace',
    { en: 'Tidy spaces in text', hi: 'पाठ के अतिरिक्त स्थान ठीक करें' },
    { en: 'Removes spaces at the start and end, double spaces, and invisible characters that stop matching and sorting from working.', hi: 'शुरू-अंत के स्थान, दोहरे स्थान और अदृश्य अक्षर हटाए जाते हैं जो मिलान और क्रम बिगाड़ते हैं।' },
    { auto: true, banner: false },
    function (grid) {
      var n = 0, ex = [];
      var out = grid.map(function (r) {
        return r.map(function (v) {
          var t = s(v); if (t === '') return t;
          var u = t.replace(ZERO_WIDTH, '').replace(ODD_SPACES, ' ').replace(/ {2,}/g, ' ').trim();
          if (u !== t) { n++; if (ex.length < 3) ex.push({ before: '"' + clip(t, 30) + '"', after: '"' + clip(u, 30) + '"' }); }
          return u;
        });
      });
      return n ? { grid: out, count: n, examples: ex } : { grid: grid, count: 0, examples: [] };
    });

  // 8. Krutidev / Devlys -> Unicode
  function krutiColumns(grid) {
    var g = grid, w = width(g), cols = [];
    for (var c = 0; c < w; c++) {
      var nonEmpty = 0, sig = 0;
      for (var r = 1; r < Math.min(g.length, 400); r++) { var v = s(g[r][c]); if (isBlank(v)) continue; nonEmpty++; if (krutiSignal(v)) sig++; }
      if (nonEmpty >= 3 && sig / nonEmpty >= 0.25) cols.push(c);
    }
    return cols;
  }
  step('krutidev',
    { en: 'Convert old Hindi font text (Krutidev / Devlys) to Unicode', hi: 'पुराने हिंदी फ़ॉन्ट (कृतिदेव / देवलिस) को यूनिकोड में बदलें' },
    { en: 'These columns look like Krutidev text (unreadable letters on other computers). They become normal Hindi that sorts and searches correctly. Please check the example.', hi: 'ये कॉलम कृतिदेव पाठ जैसे दिखते हैं (दूसरे कंप्यूटर पर अपठनीय)। ये सामान्य हिंदी बन जाएँगे। कृपया उदाहरण जाँचें।' },
    { auto: false, banner: true },
    function (grid) {
      var conv = root.convertKrutidevToUnicode;
      if (typeof conv !== 'function') return { grid: grid, count: 0, examples: [] };
      var cols = krutiColumns(grid);
      if (!cols.length) return { grid: grid, count: 0, examples: [] };
      var n = 0, ex = [], out = copy(grid);
      for (var r = 1; r < out.length; r++) cols.forEach(function (c) {
        var v = s(out[r][c]); if (isBlank(v) || looksNumeric(v) || /[ऀ-ॿ]/.test(v)) return;
        var u = conv(v); if (u !== v) { out[r][c] = u; n++; if (ex.length < 3) ex.push({ before: clip(v, 24), after: clip(u, 24) }); }
      });
      var hdr = cols.map(function (c) { return s(grid[0][c]); });
      var res = { grid: out, count: n, examples: ex };
      res.note = hdr.join(', ');
      return n ? res : { grid: grid, count: 0, examples: [] };
    });

  // 9. Hindi digits
  step('hindiDigits',
    { en: 'Turn Hindi digits (०१२३) into numbers', hi: 'हिंदी अंकों (०१२३) को संख्या में बदलें' },
    { en: 'Cells written with Devanagari digits cannot be added, sorted or charted. They become normal numbers.', hi: 'देवनागरी अंकों वाली सेल जोड़ी, क्रमबद्ध या चार्ट नहीं की जा सकतीं। वे सामान्य संख्या बन जाएँगी।' },
    { auto: true, banner: true },
    function (grid) {
      var n = 0, ex = [];
      var out = grid.map(function (r, i) {
        if (i === 0) return r;
        return r.map(function (v) {
          var t = s(v);
          if (!hasDevDigit(t) || /[ऀ-॥॰-ॿ]/.test(t) || /[A-Za-z]/.test(t)) return v;       // pure digits only (no Hindi words)
          var u = devToAscii(t); n++; if (ex.length < 3) ex.push({ before: clip(t, 20), after: clip(u, 20) }); return u;
        });
      });
      return n ? { grid: out, count: n, examples: ex } : { grid: grid, count: 0, examples: [] };
    });

  // 10. numbers written as text ("2.5 लाख", "₹1,00,000/-", "(500)")
  step('numbers',
    { en: 'Turn numbers written as text into real numbers', hi: 'पाठ में लिखी संख्याओं को असली संख्या बनाएँ' },
    { en: 'Values like "2.5 लाख", "₹1,00,000/-" or "(500)" are converted to plain numbers so they can be added and charted. Phone numbers and codes with leading zeros are left alone.', hi: '"2.5 लाख", "₹1,00,000/-" या "(500)" जैसे मान सादी संख्या में बदले जाते हैं। फ़ोन नंबर और शून्य से शुरू होने वाले कोड नहीं छुए जाते।' },
    { auto: true, banner: true },
    function (grid) {
      var w = width(grid), n = 0, ex = [], out = copy(grid), skippedCols = 0;
      for (var c = 0; c < w; c++) {
        var cells = [], parsed = 0, plain = 0, codeLike = 0;
        for (var r = 1; r < out.length; r++) {
          var v = s(out[r][c]); if (isBlank(v)) continue;
          cells.push(r);
          var t = v.trim();
          if (/^0\d+$/.test(t) || /^\d{10,}$/.test(t)) codeLike++;
          var p = parseNumber(v); if (p !== null) { parsed++; if (fmtNum(p) === t) plain++; }
        }
        if (cells.length < 2 || parsed / cells.length < 0.6 || codeLike / cells.length > 0.3 || plain === parsed) continue;
        cells.forEach(function (r) {
          var v = s(out[r][c]), t = v.trim(), p = parseNumber(v);
          if (p === null || /^0\d+$/.test(t)) return;
          var u = fmtNum(p); if (u !== t) { out[r][c] = u; n++; if (ex.length < 4) ex.push({ before: clip(v, 22), after: u }); }
        });
      }
      return n ? { grid: out, count: n, examples: ex } : { grid: grid, count: 0, examples: [] };
    });

  // 11. dates (Indian day-first) to one clear format
  step('dates',
    { en: 'Write dates in one clear format (YYYY-MM-DD)', hi: 'तारीखें एक स्पष्ट रूप (YYYY-MM-DD) में लिखें' },
    { en: 'Dates are read day-first (Indian style: 03/04/2025 is 3 April). Mixed styles and Excel date numbers become YYYY-MM-DD so they sort correctly.', hi: 'तारीखें दिन-पहले (भारतीय शैली: 03/04/2025 = 3 अप्रैल) पढ़ी जाती हैं। अलग-अलग रूप और एक्सेल तारीख संख्याएँ YYYY-MM-DD बनती हैं।' },
    { auto: true, banner: false },
    function (grid) {
      var w = width(grid), n = 0, ex = [], out = copy(grid), assumed = [];
      for (var c = 0; c < w; c++) {
        var cells = [], ok = 0, dayFirst = 0, monthFirst = 0, serials = 0, serialOK = DATE_HEADER.test(s(grid[0][c]));
        for (var r = 1; r < out.length; r++) {
          var v = s(out[r][c]); if (isBlank(v)) continue;
          var p = parseDateParts(v);
          cells.push({ r: r, v: v, p: p });
          if (p) { ok++; if (p.kind === 'num') { if (p.a > 12) dayFirst++; else if (p.b > 12) monthFirst++; } }
          else if (serialOK && /^\d{5}$/.test(v.trim()) && serialToISO(+v.trim())) { serials++; }
        }
        if (cells.length < 2 || (ok + serials) / cells.length < 0.7) continue;
        var mdy = monthFirst > 0 && dayFirst === 0;
        if (monthFirst > 0 && dayFirst > 0) continue;                                // mixed order: too risky, leave it
        var ambiguous = false;
        cells.forEach(function (cell) {
          var u = null, p = cell.p;
          if (p) {
            if (p.kind === 'iso') u = validYMD(p.y, p.m, p.d) ? iso(p.y, p.m, p.d) : null;
            else {
              var d = mdy ? p.b : p.a, m = mdy ? p.a : p.b;
              if (validYMD(p.y, m, d)) { u = iso(p.y, m, d); if (p.a <= 12 && p.b <= 12 && p.a !== p.b) ambiguous = true; }
            }
          } else if (serialOK && /^\d{5}$/.test(cell.v.trim())) u = serialToISO(+cell.v.trim());
          if (u && u !== cell.v.trim()) { out[cell.r][c] = u; n++; if (ex.length < 4) ex.push({ before: clip(cell.v, 20), after: u }); }
        });
        if (ambiguous && !mdy) assumed.push(s(grid[0][c]));
      }
      if (!n) return { grid: grid, count: 0, examples: [] };
      var res = { grid: out, count: n, examples: ex };
      if (assumed.length) res.note = assumed.join(', ');                              // columns where day-first was assumed
      return res;
    });

  // ---------------------------------------------------------------- public API
  F.STEP_IDS = STEPS.map(function (x) { return x.id; });

  // Prepare a grid for analysis: strings only, "Column N" placeholders (made by the importer) are blank again.
  F.prepare = function (headers, rows) {
    var h = (headers || []).map(function (x) { return /^Column \d+$/.test(s(x)) ? '' : s(x); });
    var g = [h].concat((rows || []).map(function (r) { return r.map(s); }));
    return pad(g);
  };

  F.analyze = function (grid, opts) {
    opts = opts || {};
    var cur = pad(grid.map(function (r) { return r.map(s); })), steps = [];
    STEPS.forEach(function (st) {
      var res = st.transform(cur);
      if (res.count > 0) {
        steps.push({ id: st.id, title: st.title, detail: st.detail, auto: st.auto, banner: st.banner,
                     count: res.count, examples: res.examples || [], note: res.note || '' });
        cur = res.grid;
      }
    });
    return { steps: steps, rows: cur.length - 1, cols: width(cur), result: cur };
  };

  F.apply = function (grid, ids) {
    var want = {}; (ids || []).forEach(function (i) { want[i] = true; });
    var cur = pad(grid.map(function (r) { return r.map(s); })), report = [];
    STEPS.forEach(function (st) {
      if (!want[st.id]) return;
      var res = st.transform(cur);
      if (res.count > 0) { report.push({ id: st.id, count: res.count }); cur = res.grid; }
    });
    return { grid: cur, applied: report };
  };

  // exposed for the merge module and tests
  F.util = { parseNumber: parseNumber, parseDateParts: parseDateParts, findHeaderRow: findHeaderRow, isBlank: isBlank, filled: filled, krutiSignal: krutiSignal, devToAscii: devToAscii };
})(typeof window !== 'undefined' ? window : globalThis);
