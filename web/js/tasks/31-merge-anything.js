// =====================================================================
//  MERGE ANYTHING  /  सभी फ़ाइलें एक करें
//  Stacks many files whose column names differ slightly ("थाना", "Police Station", "PS Name").
//  Matching is rule-based and explainable: exact name, Hindi-English office glossary, then spelling
//  similarity. Every match carries a confidence; weak ones are shown for review, never silently used.
//
//    STL.merge.plan(files)                 -> { headers, maps:[[{src,tgt,score,level,reason}]] }
//    STL.merge.build(files, plan, opts)    -> { headers, rows, report }
//    STL.merge.parseDelimited(text)        -> grid
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL = root.STL || {};
  var M = STL.merge = {};

  function s(v) { return v == null ? '' : String(v); }

  // ---------------------------------------------------------------- names
  function normalize(h) {
    var t = s(h).normalize ? s(h).normalize('NFC') : s(h);
    t = t.replace(/[​-‍﻿]/g, '').toLowerCase();
    t = t.replace(/[०-९]/g, function (c) { return String(c.charCodeAt(0) - 0x0966); });
    t = t.replace(/['\u2019\u2018`\u00B4]/g, '');                       // father's -> fathers
    t = t.replace(/[._\-\/\\()\[\]:;,|*#]+/g, ' ').replace(/\s+/g, ' ').trim();
    return t;
  }

  // Groups of names that mean the same thing in an Indian government office.
  var GLOSSARY = [
    ['sr no', 'serial no', 'serial number', 's no', 'sl no', 'sno', 'क्र सं', 'क्रसं', 'क्रमांक', 'क्रम संख्या', 'क्र', 'सीरियल नंबर'],
    ['district', 'dist', 'जिला', 'जिले का नाम', 'जिला नाम', 'ज़िला', 'district name'],
    ['police station', 'ps', 'p s', 'ps name', 'thana', 'थाना', 'थाने का नाम', 'थाना नाम', 'पुलिस थाना', 'police station name'],
    ['date', 'dt', 'दिनांक', 'तारीख', 'तिथि', 'दिनाँक'],
    ['name', 'नाम', 'नाम का विवरण', 'full name', 'पूरा नाम'],
    ['father name', 'father s name', 'fathers name', 'पिता का नाम', 'पिता नाम', 'पिता', 's o', 'father'],
    ['age', 'आयु', 'उम्र', 'उमर'],
    ['gender', 'sex', 'लिंग'],
    ['amount', 'amt', 'राशि', 'रकम', 'धनराशि', 'रुपये', 'rs', 'rupees'],
    ['total', 'कुल', 'योग', 'जोड़', 'grand total', 'कुल योग'],
    ['case no', 'case number', 'प्रकरण संख्या', 'प्रकरण क्रमांक', 'मुकदमा संख्या', 'fir no', 'fir number', 'एफआईआर संख्या', 'एफआईआर नंबर', 'एफ आई आर संख्या'],
    ['status', 'स्थिति', 'वर्तमान स्थिति', 'current status'],
    ['address', 'पता', 'पते', 'addr'],
    ['mobile', 'mobile no', 'mobile number', 'phone', 'phone no', 'contact', 'contact no', 'मोबाइल', 'मोबाइल नंबर', 'मोबाइल संख्या', 'फोन', 'फ़ोन', 'संपर्क', 'दूरभाष'],
    ['designation', 'post', 'rank', 'पद', 'पदनाम', 'पद नाम'],
    ['department', 'dept', 'विभाग', 'विभाग का नाम'],
    ['salary', 'pay', 'वेतन', 'मासिक वेतन', 'basic pay', 'मूल वेतन'],
    ['village', 'gram', 'ग्राम', 'गाँव', 'गांव'],
    ['tehsil', 'tahsil', 'तहसील'],
    ['block', 'ब्लॉक', 'खंड', 'विकास खंड'],
    ['remarks', 'remark', 'टिप्पणी', 'रिमार्क', 'विशेष', 'अभ्युक्ति', 'नोट', 'note', 'notes'],
    ['year', 'वर्ष', 'साल'],
    ['month', 'माह', 'महीना', 'मास'],
    ['pending', 'लंबित', 'लम्बित', 'पेंडिंग', 'pendency'],
    ['disposed', 'disposed off', 'निस्तारित', 'निस्तारण', 'निपटारा'],
    ['registered', 'दर्ज', 'पंजीकृत', 'registered cases'],
    ['male', 'पुरुष'], ['female', 'महिला'],
    ['category', 'श्रेणी', 'वर्ग', 'cat'],
    ['section', 'धारा', 'sections', 'ipc section'],
    ['complainant', 'परिवादी', 'शिकायतकर्ता', 'प्रार्थी'],
    ['accused', 'आरोपी', 'अभियुक्त'],
    ['beneficiary', 'लाभार्थी', 'हितग्राही'],
    ['scheme', 'योजना', 'yojana'],
    ['email', 'e mail', 'ईमेल', 'mail id'],
    ['employee id', 'emp id', 'emp no', 'employee no', 'कर्मचारी क्रमांक', 'कर्मचारी आईडी', 'पीपीओ संख्या'],
    ['quarter', 'तिमाही', 'qtr'],
    ['budget', 'बजट', 'स्वीकृत राशि', 'sanctioned amount'],
    ['expenditure', 'व्यय', 'खर्च', 'expense', 'व्यय राशि'],
    ['balance', 'शेष', 'शेष राशि'],
    ['aadhaar', 'aadhar', 'आधार', 'आधार संख्या', 'आधार नंबर'],
    ['pan', 'pan no', 'पैन']
  ];
  var ALIAS = {};
  GLOSSARY.forEach(function (g, i) { g.forEach(function (a) { var n = normalize(a); if (n && ALIAS[n] === undefined) ALIAS[n] = i; }); });
  function groupOf(norm) {
    if (ALIAS[norm] !== undefined) return ALIAS[norm];
    return null;
  }

  // ---------------------------------------------------------------- similarity
  function trigrams(t) { var p = ' ' + t + ' ', set = {}, n = 0; for (var i = 0; i < p.length - 2; i++) { var g = p.substr(i, 3); if (!set[g]) { set[g] = 1; n++; } } return { set: set, n: n }; }
  function jaccardTri(a, b) {
    var A = trigrams(a), B = trigrams(b), inter = 0;
    Object.keys(A.set).forEach(function (g) { if (B.set[g]) inter++; });
    var uni = A.n + B.n - inter; return uni ? inter / uni : 0;
  }
  function lev(a, b) {
    if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur[0] = i;
      for (j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      var t = prev; prev = cur; cur = t;
    }
    return prev[b.length];
  }
  function tokenOverlap(a, b) {
    var ta = a.split(' ').filter(Boolean), tb = b.split(' ').filter(Boolean);
    if (!ta.length || !tb.length) return 0;
    var inter = ta.filter(function (x) { return tb.indexOf(x) >= 0; }).length;
    return inter / Math.max(ta.length, tb.length);
  }

  function numericShare(values) {
    var n = 0, num = 0;
    for (var i = 0; i < values.length && n < 200; i++) {
      var v = s(values[i]).trim(); if (!v) continue; n++;
      if (!isNaN(Number(v.replace(/,/g, '')))) num++;
    }
    return n ? num / n : null;
  }

  // score two column names (and optionally their sample values) -> {score, reason}
  function score(nameA, nameB, valsA, valsB) {
    var a = normalize(nameA), b = normalize(nameB);
    if (!a || !b) return { score: 0, reason: 'blank' };
    var out;
    if (a === b) out = { score: 1, reason: 'same' };
    else {
      var ga = groupOf(a), gb = groupOf(b);
      if (ga !== null && ga === gb) out = { score: 0.95, reason: 'glossary' };
      else if (ga !== null && gb !== null && ga !== gb) out = { score: 0, reason: 'different' };     // known, different meanings
      else {
        var sim = Math.max(jaccardTri(a, b), 1 - lev(a, b) / Math.max(a.length, b.length), 0.9 * tokenOverlap(a, b));
        if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) sim = Math.max(sim, 0.72);
        out = { score: Math.min(sim, 0.93), reason: 'similar' };
      }
    }
    // values must be compatible: a number column does not become a name column
    if (valsA && valsB && out.score > 0) {
      var na = numericShare(valsA), nb = numericShare(valsB);
      if (na !== null && nb !== null && Math.abs(na - nb) > 0.7) { out.score *= 0.4; out.reason += '+type'; }
    }
    return out;
  }
  M.normalize = normalize; M.score = score; M.groupOf = groupOf;

  // ---------------------------------------------------------------- planning
  var AUTO = 0.9, REVIEW = 0.7;
  function column(file, i) { var v = []; for (var r = 0; r < Math.min(file.rows.length, 200); r++) v.push(file.rows[r][i]); return v; }

  // files: [{name, headers, rows}] (already cleaned: header row first). Returns the combined header list and,
  // for every file, which of its columns goes where.
  M.plan = function (files) {
    var headers = [], samples = [], maps = [];
    files.forEach(function (f, fi) {
      var pairs = [];
      f.headers.forEach(function (h, i) {
        headers.forEach(function (t, j) {
          var sc = score(h, t, column(f, i), samples[j]);
          if (sc.score >= REVIEW) pairs.push({ src: i, tgt: j, score: sc.score, reason: sc.reason });
        });
      });
      pairs.sort(function (x, y) { return y.score - x.score; });
      var usedSrc = {}, usedTgt = {}, chosen = {};
      pairs.forEach(function (p) {
        if (usedSrc[p.src] || usedTgt[p.tgt]) return;
        usedSrc[p.src] = usedTgt[p.tgt] = true; chosen[p.src] = p;
      });
      var map = [];
      f.headers.forEach(function (h, i) {
        if (isBlankHeader(h) && !hasData(f, i)) return;                         // empty column: skip
        var p = chosen[i];
        if (p) {
          map.push({ src: i, tgt: p.tgt, score: p.score, level: p.score >= AUTO ? 'auto' : 'review', reason: p.reason });
        } else {
          headers.push(isBlankHeader(h) ? 'Column ' + (headers.length + 1) : s(h).trim());
          samples.push(column(f, i));
          map.push({ src: i, tgt: headers.length - 1, score: fi === 0 ? 1 : 0, level: fi === 0 ? 'first' : 'new', reason: fi === 0 ? 'first' : 'new' });
        }
      });
      maps.push(map);
    });
    return { headers: headers, maps: maps };
  };
  function isBlankHeader(h) { return s(h).trim() === '' || /^Column \d+$/.test(s(h)); }
  function hasData(f, i) { for (var r = 0; r < f.rows.length; r++) if (s(f.rows[r][i]).trim() !== '') return true; return false; }

  // ---------------------------------------------------------------- building
  // opts: { sourceColumn: 'Source file', dropDuplicates: bool }
  M.build = function (files, plan, opts) {
    opts = opts || {};
    var headers = plan.headers.slice(), out = [], report = { files: [], duplicates: 0, rows: 0 };
    var seen = {}, srcCol = opts.sourceColumn ? headers.length : -1;
    if (srcCol >= 0) headers.push(opts.sourceColumn);
    files.forEach(function (f, fi) {
      var map = plan.maps[fi], n = 0, dup = 0, unmatched = [];
      f.headers.forEach(function (h, i) { if (!map.some(function (m) { return m.src === i && m.tgt >= 0; }) && !isBlankHeader(h)) unmatched.push(s(h)); });
      f.rows.forEach(function (row) {
        var o = new Array(headers.length);
        for (var k = 0; k < o.length; k++) o[k] = '';
        map.forEach(function (m) { if (m.tgt >= 0) o[m.tgt] = s(row[m.src]); });
        if (opts.dropDuplicates) {
          var key = o.slice(0, plan.headers.length).join('\u0001');
          if (seen[key]) { dup++; report.duplicates++; return; }
          seen[key] = 1;
        }
        if (srcCol >= 0) o[srcCol] = f.name;
        out.push(o); n++;
      });
      report.files.push({ name: f.name, rows: n, duplicatesDropped: dup, unmatched: unmatched,
                          matched: map.filter(function (m) { return m.tgt >= 0; }).length,
                          review: map.filter(function (m) { return m.level === 'review'; }).length });
    });
    report.rows = out.length;
    return { headers: headers, rows: out, report: report };
  };

  // ---------------------------------------------------------------- delimited text
  M.parseDelimited = function (text) {
    text = s(text).replace(/^﻿/, '');
    var first = text.split(/\r?\n/, 1)[0] || '';
    var counts = { ',': 0, '\t': 0, ';': 0, '|': 0 };
    Object.keys(counts).forEach(function (d) { counts[d] = first.split(d).length - 1; });
    var sep = ',', best = counts[','];
    Object.keys(counts).forEach(function (d) { if (counts[d] > best) { best = counts[d]; sep = d; } });
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = ''; rows.push(row); row = [];
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return c.trim() !== ''; }); });
  };
})(typeof window !== 'undefined' ? window : globalThis);
