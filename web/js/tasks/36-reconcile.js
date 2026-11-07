// =====================================================================
//  CHECK A SUMMARY AGAINST THE DETAIL  /  सारांश का विवरण से मिलान
//  The figure sent upward ("Received 14,764, Disposed 11,200 …") is typed by a clerk from the register. This finds how each number of the
//  summary can be made from the detail rows (a count, a count of one status, a sum), checks every cell, and lists the ones that differ.
//    STL.recon.check({headers, rows}, {headers, rows}) -> { dims, measures, cells, wrong, totals, unmatched }
//  Nothing is assumed about the layout: the first columns that match values (or years, financial years, months) of a detail column are the
//  groups; every number column is matched to the way of counting that reproduces most of its cells.
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL = root.STL || {}, R = STL.recon = {};
  function s(v) { return v == null ? '' : String(v); }
  function num(v) { var t = s(v).trim().replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '').replace(/\/-$/, ''); if (t === '' || t === '-') return null; t = t.replace(/[०-९]/g, function (c) { return String(c.charCodeAt(0) - 0x0966); }); var x = Number(t); return isFinite(x) ? x : null; }
  function key(v) { var V = STL.values; var k = V && V.key ? V.key(v) : s(v).trim().toLowerCase(); return k || s(v).trim().toLowerCase(); }
  function ckey(v) { var L = STL.lex; var k = key(v); return L ? L.concept(k) : k; }
  var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  var TOTAL_RE = /^\s*(grand\s+)?(total|sub\s*total|kul|कुल|योग|जोड़|कुल योग)\b/i;
  R.isTotal = function (v) { return TOTAL_RE.test(s(v)); };

  // ------------------------------------------------------------ dates and periods
  function toDate(v) {
    var t = s(v).trim().replace(/[०-९]/g, function (c) { return String(c.charCodeAt(0) - 0x0966); }), m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t))) return { y: +m[1], m: +m[2], d: +m[3] };
    if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/.exec(t))) return { y: +m[3] < 100 ? 2000 + +m[3] : +m[3], m: +m[2], d: +m[1] };
    if ((m = /^(\d{1,2})[ \-]([A-Za-z]{3,9})[ \-,]+(\d{2,4})/.exec(t))) { var mo = MON[m[2].toLowerCase().slice(0, 4)] || MON[m[2].toLowerCase().slice(0, 3)]; if (mo) return { y: +m[3] < 100 ? 2000 + +m[3] : +m[3], m: mo, d: +m[1] }; }
    return null;
  }
  // a label of the summary -> { grain, key }   ("2024-25" "FY 2025-26 (up to Jan)" "2024" "Apr-2024" "April 2024" "2024-04" "Q1 2024-25")
  R.periodOf = function (label) {
    var t = s(label).trim(), m;
    if ((m = /^(?:fy\s*|f\.y\.\s*)?(\d{4})\s*[-–\/]\s*(\d{2,4})\b/i.exec(t)) && (+m[2] % 100) === ((+m[1] + 1) % 100)) return { grain: 'fy', key: String(+m[1]) };
    if ((m = /^(\d{4})$/.exec(t))) return { grain: 'year', key: m[1] };
    if ((m = /^([A-Za-z]{3,9})[\s\-\/.,]*(\d{2,4})$/.exec(t)) && (MON[m[1].toLowerCase().slice(0, 4)] || MON[m[1].toLowerCase().slice(0, 3)])) { var y = +m[2] < 100 ? 2000 + +m[2] : +m[2]; return { grain: 'month', key: y + '-' + ('0' + (MON[m[1].toLowerCase().slice(0, 4)] || MON[m[1].toLowerCase().slice(0, 3)])).slice(-2) }; }
    if ((m = /^(\d{4})-(\d{2})$/.exec(t)) && +m[2] >= 1 && +m[2] <= 12) return { grain: 'month', key: m[1] + '-' + m[2] };
    if ((m = /^(\d{1,2})[\/.](\d{4})$/.exec(t)) && +m[1] >= 1 && +m[1] <= 12) return { grain: 'month', key: m[2] + '-' + ('0' + m[1]).slice(-2) };
    if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t))) return { grain: 'month', key: m[1] + '-' + m[2] };            // a month written as a date (1 Apr)
    return null;
  };
  function periodKey(d, grain) { return grain === 'fy' ? String(d.m >= 4 ? d.y : d.y - 1) : grain === 'year' ? String(d.y) : d.y + '-' + ('0' + d.m).slice(-2); }

  // ------------------------------------------------------------ the check
  // summary / detail: { headers, rows } (cleaned: the header row found, title rows gone; total rows may be kept in the summary)
  R.check = function (sum, det) {
    var sh = sum.headers, sr = sum.rows.filter(function (r) { return r.some(function (c) { return s(c).trim() !== ''; }); }), dh = det.headers, dr = det.rows, out = { dims: [], measures: [], cells: [], wrong: [], totals: null, unmatched: [], rows: sr.length };
    if (!sr.length || !dr.length) return out;
    var isTotalRow = sr.map(function (r) { return r.some(function (c, i) { return i < 3 && R.isTotal(c) && num(c) === null; }); });
    var body = sr.map(function (r, i) { return i; }).filter(function (i) { return !isTotalRow[i]; });
    // ---- measures: number columns of the summary
    var meas = [], dimCand = [];
    sh.forEach(function (h, c) { var vals = body.map(function (i) { return s(sr[i][c]).trim(); }).filter(Boolean), nn = vals.filter(function (v) { return num(v) !== null; }).length; if (vals.length >= 1 && nn / vals.length >= 0.8) meas.push(c); else if (vals.length >= 1) dimCand.push(c); });
    if (!meas.length) return out;
    // ---- groups: summary label column(s) <-> detail column
    var dcols = dh.map(function (h, c) {
      var cnt = {}, d = 0, n = 0, dates = 0; for (var i = 0; i < dr.length && n < 4000; i += Math.max(1, Math.floor(dr.length / 4000))) { var v = s(dr[i][c]).trim(); if (!v) continue; n++; if (!cnt[v]) { cnt[v] = 1; d++; } if (toDate(v)) dates++; }
      return { c: c, name: dh[c], distinct: d, n: n, date: n >= 5 && dates / n >= 0.8, cat: n >= 5 && d <= 80 && dates / n < 0.8 };
    });
    var picks = [];                                                                                     // { sCol, kind:'cat'|'period', dCol, grain, score }
    dimCand.forEach(function (sc) {
      var labels = body.map(function (i) { return s(sr[i][sc]).trim(); }).filter(Boolean), best = null;
      var per = labels.map(R.periodOf), pg = per.filter(Boolean);
      if (pg.length >= 0.7 * labels.length && labels.length) {
        var grain = pg[0].grain;
        dcols.filter(function (d) { return d.date; }).forEach(function (d) { var sc2 = { sCol: sc, kind: 'period', dCol: d.c, grain: grain, score: 0.9, pl: per }; if (!best) best = sc2; });
        if (best) { picks.push(best); return; }
      }
      dcols.filter(function (d) { return d.cat; }).forEach(function (d) {
        var set = {}; for (var i = 0; i < dr.length; i += Math.max(1, Math.floor(dr.length / 6000))) { var v = s(dr[i][d.c]).trim(); if (v) set[ckey(v)] = 1; }
        var hit = labels.filter(function (l) { return set[ckey(l)]; }).length / labels.length;
        if (hit >= 0.7 && (!best || hit > best.score)) best = { sCol: sc, kind: 'cat', dCol: d.c, score: hit };
      });
      if (best) picks.push(best);
    });
    if (!picks.length) { out.unmatched = sh.map(function (h, c) { return meas.indexOf(c) >= 0 ? h : null; }).filter(Boolean); out.reason = 'no-groups'; return out; }
    picks = picks.slice(0, 2); out.dims = picks.map(function (p) { return { sName: sh[p.sCol], dName: dh[p.dCol], kind: p.kind, grain: p.grain || null }; });
    // ---- the group of every summary row, and of every detail row
    function sKey(i) { return picks.map(function (p) { var v = s(sr[i][p.sCol]).trim(); if (p.kind === 'period') { var pp = R.periodOf(v); return pp ? pp.key : '?'; } return ckey(v); }).join('|'); }
    var sKeys = {}; body.forEach(function (i) { var k = sKey(i); sKeys[k] = (sKeys[k] || []).concat([i]); });
    var wanted = {}; Object.keys(sKeys).forEach(function (k) { wanted[k] = 1; });
    var catCols = dcols.filter(function (d) { return d.cat && picks.every(function (p) { return p.dCol !== d.c; }); }), numCols = dh.map(function (h, c) { return c; }).filter(function (c) {
      var n = 0, k = 0; for (var i = 0; i < dr.length && n < 300; i += Math.max(1, Math.floor(dr.length / 300))) { var v = s(dr[i][c]).trim(); if (!v) continue; n++; if (num(v) !== null && !toDate(v)) k++; } return n >= 10 && k / n >= 0.9 && picks.every(function (p) { return p.dCol !== c; });
    }).slice(0, 12);
    var agg = {}, all = { n: 0, cat: {}, sum: {} }, none = { n: 0, cat: {}, sum: {} }; out.unassigned = 0; out.explained = [];
    function bucket(k) { return agg[k] || (agg[k] = { n: 0, cat: {}, sum: {} }); }
    dr.forEach(function (r) {
      var k = picks.map(function (p) { var v = s(r[p.dCol]).trim(); if (p.kind === 'period') { var d = toDate(v); return d ? periodKey(d, p.grain) : '?'; } return ckey(v); }).join('|');
      var tg = [all]; if (wanted[k]) tg.push(bucket(k));
      if (k.split('|').some(function (x) { return x === '' || x === '?'; })) { out.unassigned++; tg.push(none); }
      tg.forEach(function (b) {
        b.n++;
        catCols.forEach(function (d) { var v = s(r[d.c]).trim(); if (!v) return; var cc = b.cat[d.c] || (b.cat[d.c] = {}), kk = ckey(v); cc[kk] = (cc[kk] || 0) + 1; });
        numCols.forEach(function (c) { var x = num(r[c]); if (x !== null) b.sum[c] = (b.sum[c] || 0) + x; });
      });
    });
    // ---- candidate ways of counting
    var catVals = {}; catCols.forEach(function (d) { var set = {}; [all].concat(Object.keys(agg).map(function (k) { return agg[k]; })).forEach(function (b) { Object.keys(b.cat[d.c] || {}).forEach(function (v) { set[v] = 1; }); }); catVals[d.c] = Object.keys(set); });
    function defsFor(header) {
      var defs = [{ t: 'count', label: { en: 'number of rows', hi: 'पंक्तियों की संख्या' }, f: function (b) { return b.n; }, pri: 1 }];
      catCols.forEach(function (d) { catVals[d.c].forEach(function (v) { defs.push({ t: 'is', col: d.c, v: v, label: { en: 'rows where ' + dh[d.c] + ' = ' + v, hi: 'वे पंक्तियाँ जहाँ ' + dh[d.c] + ' = ' + v }, f: function (b) { return (b.cat[d.c] || {})[v] || 0; }, pri: 2 }); }); });
      var parts = s(header).split(/\s*(?:\/|,|&|\+|\band\b|\bor\b|और|एवं)\s*/i).map(ckey).filter(Boolean);
      if (parts.length > 1) catCols.forEach(function (d) { var vs = parts.filter(function (p) { return catVals[d.c].indexOf(p) >= 0; }); if (vs.length === parts.length) defs.push({ t: 'in', col: d.c, vs: vs, label: { en: 'rows where ' + dh[d.c] + ' is ' + vs.join(' or '), hi: 'वे पंक्तियाँ जहाँ ' + dh[d.c] + ' है ' + vs.join(' या ') }, f: function (b) { return vs.reduce(function (a, v) { return a + ((b.cat[d.c] || {})[v] || 0); }, 0); }, pri: 3 }); });
      numCols.forEach(function (c) { defs.push({ t: 'sum', col: c, label: { en: 'sum of ' + dh[c], hi: dh[c] + ' का योग' }, f: function (b) { return b.sum[c] || 0; }, pri: 2 }); });
      return defs;
    }
    meas.forEach(function (mc) {
      var cells = []; body.forEach(function (i) { var x = num(sr[i][mc]); if (x === null) return; (sKeys[sKey(i)] || []).length && cells.push({ i: i, k: sKey(i), v: x }); });
      if (!cells.length) return;
      var best = null;
      defsFor(sh[mc]).forEach(function (df) {
        var exact = 0, near = 0, groupsSeen = {};
        cells.forEach(function (c) { var b = agg[c.k]; if (!b) return; var dv = df.f(b); if (dv === c.v) exact++; else if (Math.abs(dv - c.v) <= 0.02 * Math.max(Math.abs(c.v), 1) && c.v !== 0) near++; });
        var sc = exact * 2 + near + (df.t === 'in' ? 0.5 : 0) - df.pri * 0.01;
        if (!best || sc > best.sc) best = { df: df, exact: exact, near: near, sc: sc };
      });
      var ok = best && cells.length && (best.exact + best.near) / cells.length >= 0.6 && (best.exact >= 1 || (best.near >= 2 && best.near >= 0.8 * cells.length)) && (best.exact >= 2 || cells.length <= 2 || best.exact + best.near >= 3);
      if (!ok) { out.unmatched.push(sh[mc]); return; }
      var m = { col: mc, name: sh[mc], label: best.df.label, exact: best.exact, near: best.near, cells: cells.length }; out.measures.push(m);
      var mine = [];
      cells.forEach(function (c) {
        var b = agg[c.k], dv = best.df.f(b), diff = c.v - dv, rel = c.v ? diff / Math.abs(c.v) : (dv ? 1 : 0);
        var rec = { row: c.i, group: picks.map(function (p) { return s(sr[c.i][p.sCol]).trim(); }).join(' · '), measure: sh[mc], summary: c.v, detail: dv, diff: diff, rel: rel, status: diff === 0 ? 'same' : 'different', small: Math.abs(rel) <= 0.01 };
        out.cells.push(rec); if (diff !== 0) mine.push(rec);
      });
      // rows without a usable date/category belong to no line: they can explain a summary that is HIGHER than the lines of the detail
      var pool = best.df.f(none), up = mine.filter(function (r) { return r.diff > 0; }), upSum = up.reduce(function (a, r) { return a + r.diff; }, 0);
      mine.forEach(function (r) { if (up.indexOf(r) >= 0 && upSum <= pool) { r.status = 'explained'; out.explained.push(r); } else out.wrong.push(r); });
      // the Total line of the summary against the whole detail, and against the sum of the lines above it
      sr.forEach(function (r, i) { if (!isTotalRow[i]) return; var x = num(r[mc]); if (x === null) return; var dv = best.df.f(all), up = cells.reduce(function (a, c) { return a + c.v; }, 0); (out.totals = out.totals || []).push({ measure: sh[mc], summary: x, detail: dv, ofLines: up, diff: x - dv, same: x === dv, linesAdd: x === up }); });
    });
    out.wrong.sort(function (a, b) { return Math.abs(b.rel) - Math.abs(a.rel); });
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);

// =====================================================================
//  The screen
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL, R = STL.recon;
  if (!root.document || !STL.ui) return;
  var U = STL.ui, T = U.T, TT = U.TT, esc = U.esc, fmt = U.fmt;
  function $(id) { return document.getElementById(id); }
  var S = null;

  STL.openReconcile = function () {
    if (root.BIG && BIG.active) { toast(T('This works on the editor. Use "Work on a copy" first.', 'यह संपादक में चलता है। पहले "प्रति पर काम करें" दबाएँ।'), 'info'); return; }
    if (!U.hasData()) { toast(T('Open the detail (the register) first, then check a summary against it.', 'पहले विवरण (रजिस्टर) खोलें, फिर सारांश का मिलान करें।'), 'info'); return; }
    S = { file: null, res: null, sheet: null, sheets: [], err: '' }; render();
  };
  function load(file, sheet) {
    U.busy(T('Reading the summary…', 'सारांश पढ़ा जा रहा है…'));
    return U.readGrid(file, sheet).then(function (r) {
      var e = { name: file.name }; U.cleanFile(e, r.grid, ['sectionTitles', 'headerRow', 'twoRowHeader', 'blanks', 'repeatedHeaders', 'footerRows', 'whitespace']);       // total lines are kept: they are checked too
      S.file = file; S.sheets = r.sheets; S.sheet = r.sheet; S.name = file.name;
      var det = { headers: headers.slice(), rows: rawData }, sum = { headers: e.headers, rows: e.rows };
      S.sumHeaders = e.headers; S.res = R.check(sum, det); S.err = '';
    }).catch(function (e) { S.err = e.message; }).then(function () { U.busy(null); render(); });
  }
  function render() {
    var res = S.res, html = '<div class="prj-h"><b>🧾 ' + T('Check a summary against the detail', 'सारांश का विवरण से मिलान') + '</b><button id="rcX" aria-label="close">×</button></div>' +
      '<div class="big-note">' + T('Open the summary (the figure sent upward) as an Excel or CSV file. The app finds how each number can be made from the ' + fmt(rawData.length) + ' rows of the data now open, and lists every number that does not agree.', 'सारांश (ऊपर भेजा गया आँकड़ा) एक्सेल या CSV के रूप में खोलें। ऐप ढूँढता है कि हर संख्या अभी खुली ' + fmt(rawData.length) + ' पंक्तियों से कैसे बनती है, और जो संख्या मेल न खाए उसे सूचीबद्ध करता है।') + '</div>' +
      '<div class="stl-drop" id="rcDrop"><button class="tb-btn primary" id="rcAdd">' + T('Choose the summary file…', 'सारांश फ़ाइल चुनें…') + '</button><span>' + (S.name ? esc(S.name) : T('or drop it here', 'या यहाँ छोड़ें')) + '</span>' +
      (S.sheets.length > 1 ? ' <select id="rcSheet" class="big-select">' + S.sheets.map(function (x) { return '<option' + (x === S.sheet ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select>' : '') + '</div>';
    if (S.err) html += '<div class="big-note" style="border-color:#c0392b">' + esc(S.err) + '</div>';
    if (res) {
      if (!res.measures.length) html += '<div class="fr-verdict" style="border-color:#e8913a"><b>' + (res.reason === 'no-groups' ? T('No column of this sheet has values (or years, financial years, months) that also exist in the detail, so there is nothing to compare line by line.', 'इस शीट के किसी कॉलम के मान (या वर्ष, वित्तीय वर्ष, माह) विवरण में नहीं मिलते, इसलिए पंक्ति-दर-पंक्ति तुलना संभव नहीं।') : T('The numbers of this sheet could not be made from the detail by counting rows, counting one value, or adding a column.', 'इस शीट की संख्याएँ विवरण से पंक्तियाँ गिनकर, एक मान गिनकर या कॉलम जोड़कर नहीं बन सकीं।')) + '</b></div>';
      else {
        var bad = res.wrong.length, expl = res.explained.length, smallN = res.wrong.filter(function (w) { return w.small; }).length;
        html += '<div class="fr-verdict" style="border-color:' + (bad ? '#c0392b' : '#14a38b') + '"><b>' + (bad ? fmt(bad) + T(' of ', ' / ') + fmt(res.cells.length) + T(' numbers in the summary differ from the detail', ' संख्याएँ सारांश में विवरण से अलग हैं') + (smallN ? T(' (' + smallN + ' by less than 1%)', ' (' + smallN + ' में 1% से कम अंतर)') : '') : (expl ? T('No number differs except where rows without a date can explain it (' + expl + ').', 'कोई संख्या अलग नहीं, सिवाय वहाँ जहाँ बिना तारीख की पंक्तियाँ कारण हो सकती हैं (' + expl + ')।') : T('All ' + fmt(res.cells.length) + ' numbers in the summary agree with the detail.', 'सारांश की सभी ' + fmt(res.cells.length) + ' संख्याएँ विवरण से मेल खाती हैं।'))) + '</b></div>' +
          (bad && expl ? '<div class="big-note">' + fmt(expl) + T(' more numbers are higher in the summary by amounts that the rows without a date can explain (shown below, dimmed).', ' और संख्याएँ सारांश में अधिक हैं, जिन्हें बिना तारीख की पंक्तियाँ समझा सकती हैं (नीचे धुंधली)।') + '</div>' : '') +
          (res.unassigned ? '<div class="big-note">' + fmt(res.unassigned) + T(' rows of the detail have no usable value in the column that makes the lines (a blank or unreadable date), so they belong to no line. This alone can make the lines add up to less than the Total.', ' पंक्तियों में उस कॉलम का उपयोगी मान नहीं है जिससे सारांश की पंक्तियाँ बनती हैं (खाली या न पढ़ी जाने वाली तारीख), इसलिए वे किसी पंक्ति में नहीं आतीं। अकेले इससे पंक्तियों का योग कुल से कम हो सकता है।') + '</div>' : '') +
          '<div class="prj-sub">' + T('Lines of the summary are the groups of: ', 'सारांश की पंक्तियाँ इनके समूह हैं: ') + res.dims.map(function (d) { return esc(d.sName) + ' ↔ ' + esc(d.dName) + (d.grain ? ' (' + { fy: T('financial year', 'वित्तीय वर्ष'), year: T('year', 'वर्ष'), month: T('month', 'माह') }[d.grain] + ')' : ''); }).join(', ') + '</div>' +
          '<table class="big-tbl"><tr><th>' + T('Column of the summary', 'सारांश का कॉलम') + '</th><th>' + T('Made from the detail as', 'विवरण से ऐसे बनता है') + '</th><th>' + T('Agree', 'मेल') + '</th></tr>' + res.measures.map(function (m) { return '<tr><td>' + esc(m.name) + '</td><td>' + esc(TT(m.label)) + '</td><td class="num">' + m.exact + (m.near ? ' (+' + m.near + ' ≈)' : '') + ' / ' + m.cells + '</td></tr>'; }).join('') + '</table>';
        if (bad || expl) html += '<div class="prj-sub">' + T('Numbers that differ', 'जो संख्याएँ अलग हैं') + '</div><table class="big-tbl"><tr><th>' + T('Line', 'पंक्ति') + '</th><th>' + T('Column', 'कॉलम') + '</th><th>' + T('Summary says', 'सारांश में') + '</th><th>' + T('Detail gives', 'विवरण से') + '</th><th>' + T('Difference', 'अंतर') + '</th></tr>' +
          res.wrong.slice(0, 30).concat(res.explained.slice(0, 12)).map(function (w) { var tw = /^(\d)(\d)$/.test(String(Math.abs(w.summary)).slice(-2)) ? '' : ''; return '<tr' + (w.status === 'explained' ? ' style="opacity:.55"' : '') + '><td>' + esc(w.group) + '</td><td>' + esc(w.measure) + '</td><td class="num">' + fmt(w.summary) + '</td><td class="num">' + fmt(w.detail) + '</td><td class="num"><b>' + (w.diff > 0 ? '+' : '') + fmt(w.diff) + '</b> (' + (Math.abs(w.rel) * 100).toFixed(1) + '%)' + (swapped(w) ? ' · ' + T('two digits swapped?', 'दो अंक उलटे?') : '') + '</td></tr>'; }).join('') + '</table>';
        if (res.totals && res.totals.length) {
          var tb = res.totals.filter(function (x) { return !x.same || !x.linesAdd; });
          html += '<div class="prj-sub">' + T('The Total line', 'कुल पंक्ति') + '</div>' + (tb.length ? '<table class="big-tbl"><tr><th>' + T('Column', 'कॉलम') + '</th><th>' + T('Total says', 'कुल में') + '</th><th>' + T('Detail gives', 'विवरण से') + '</th><th>' + T('Lines above add up to', 'ऊपर की पंक्तियों का योग') + '</th></tr>' + tb.map(function (x) { return '<tr><td>' + esc(x.measure) + '</td><td class="num">' + fmt(x.summary) + '</td><td class="num">' + fmt(x.detail) + '</td><td class="num">' + fmt(x.ofLines) + '</td></tr>'; }).join('') + '</table>' : '<div class="big-note">' + T('The Total line agrees with the detail and with the lines above it.', 'कुल पंक्ति विवरण और ऊपर की पंक्तियों से मेल खाती है।') + '</div>');
        }
        if (res.unmatched.length) html += '<div class="big-note">' + T('Not checked (they cannot be made from the detail by counting or adding): ', 'जाँचे नहीं गए (विवरण से गिनकर या जोड़कर नहीं बनते): ') + res.unmatched.map(esc).join(', ') + '</div>';
        html += '<div class="big-note">' + T('Differences can also come from the detail itself (repeated rows not removed, rows missing). Clean the detail and find repeated cases first.', 'अंतर विवरण से भी आ सकता है (दोहराई पंक्तियाँ न हटी हों, पंक्तियाँ छूटी हों)। पहले विवरण साफ़ करें और दोहराए प्रकरण हटाएँ।') + '</div>';
      }
    }
    html += '<div class="prj-row" style="justify-content:flex-end;margin-top:12px"><button class="tb-btn" id="rcClose">' + T('Close', 'बंद करें') + '</button></div>';
    var o = U.overlay('reconDialog', html, true); o.querySelector('.stl-box').classList.add('fr-box');
    var inp = $('reconFileInput'); if (!inp) { inp = document.createElement('input'); inp.type = 'file'; inp.id = 'reconFileInput'; inp.accept = '.csv,.tsv,.txt,.xlsx,.xls'; inp.style.display = 'none'; document.body.appendChild(inp); }
    inp.onchange = function () { if (inp.files[0]) { var f = inp.files[0]; inp.value = ''; load(f); } };
    $('rcAdd').onclick = function () { inp.click(); };
    var drop = $('rcDrop'); drop.ondragover = function (e) { e.preventDefault(); }; drop.ondrop = function (e) { e.preventDefault(); if (e.dataTransfer.files[0]) load(e.dataTransfer.files[0]); };
    if ($('rcSheet')) $('rcSheet').onchange = function () { load(S.file, this.value); };
    $('rcX').onclick = $('rcClose').onclick = function () { o.remove(); };
  }
  function swapped(w) { var a = String(Math.abs(w.summary)), b = String(Math.abs(w.detail)); if (a.length !== b.length || a.length < 2 || a === b) return false; var d = 0, i; for (i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d === 2 && a.split('').sort().join('') === b.split('').sort().join(''); }
  (STL.actions || []).push({ en: 'Check a summary against the detail (reconcile)', hi: 'सारांश का विवरण से मिलान', kw: 'summary detail reconcile check compare figures sent total mismatch monthly report return mpr verify numbers wrong typo', run: function () { STL.openReconcile(); }, group: 'Check' });
})(typeof window !== 'undefined' ? window : globalThis);
