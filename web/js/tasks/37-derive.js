// =====================================================================
//  ADD A COLUMN FROM TWO COLUMNS  /  दो कॉलम से नया कॉलम
//  "After minus before" (Post GPA − Pre GPA), a ratio, a percentage change, a sum. No formula to write: pick two columns and a word.
//  Before / after pairs are recognised from the names (Pre_Semester_GPA / Post_Semester_GPA, Weight_Start / Weight_End, Sales_Before / Sales_After),
//  because "what changed" is nearly always the real question when a file holds both.
//    STL.derive.pairs(headers, prof)               -> [{ before, after, name }]
//    STL.derive.compute(rows, a, op, b)            -> [value, ...]        (op: minus plus times divide change mean)
//    STL.derive.apply(headers, rows, a, op, b, nm) -> { headers, rows }
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL = root.STL || {}, X = STL.derive = {};
  function s(v) { return v == null ? '' : String(v); }
  function num(v) { var t = s(v).trim().replace(/,/g, ''); if (t === '') return null; var x = Number(t); return isFinite(x) ? x : null; }
  var BEFORE = { pre: 1, before: 1, initial: 1, start: 1, starting: 1, baseline: 1, old: 1, opening: 1, previous: 1, prior: 1, beginning: 1, begin: 1, entry: 1 };
  var AFTER = { post: 1, after: 1, final: 1, end: 1, ending: 1, new: 1, closing: 1, current: 1, latest: 1, later: 1, exit: 1 };
  function words(name) { return s(name).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-zऀ-ॿ0-9]+/).filter(Boolean); }
  function title(ws) { return ws.map(function (w) { return /^[a-z]{1,4}$/.test(w) && w.length <= 3 && w !== 'in' && w !== 'of' ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1); }).join(' '); }
  X.words = words;
  X.pairs = function (headers, prof) {
    var out = [], ok = function (i) { return !prof || (prof[i] && prof[i].numeric && !prof[i].unique && !prof[i].serial && !prof[i].code); };
    var info = headers.map(function (h, i) { var w = words(h), b = w.filter(function (x) { return BEFORE[x]; }), a = w.filter(function (x) { return AFTER[x]; }); return { i: i, w: w, b: b.length === 1 && !a.length ? b[0] : null, a: a.length === 1 && !b.length ? a[0] : null }; });
    info.forEach(function (p) {
      if (!p.b || !ok(p.i)) return; var rest = p.w.filter(function (x) { return x !== p.b; }); if (!rest.length) return;
      info.forEach(function (q) {
        if (!q.a || !ok(q.i)) return; var rq = q.w.filter(function (x) { return x !== q.a; });
        if (rq.length === rest.length && rq.every(function (x, k) { return x === rest[k]; })) out.push({ before: p.i, after: q.i, name: 'Change in ' + title(rest) });
      });
    });
    return out;
  };
  var OPS = {
    minus: function (a, b) { return a - b; }, plus: function (a, b) { return a + b; }, times: function (a, b) { return a * b; },
    divide: function (a, b) { return b === 0 ? null : a / b; }, change: function (a, b) { return a === 0 ? null : (b - a) / Math.abs(a) * 100; }, mean: function (a, b) { return (a + b) / 2; }
  };
  X.OPS = Object.keys(OPS);
  X.compute = function (rows, a, op, b) {
    var f = OPS[op] || OPS.minus;
    return rows.map(function (r) { var x = num(r[a]), y = num(r[b]); if (x === null || y === null) return ''; var v = f(x, y); return v === null || !isFinite(v) ? '' : String(Math.round(v * 1e6) / 1e6); });
  };
  X.apply = function (headers, rows, a, op, b, name) {
    var vals = X.compute(rows, a, op, b);
    return { headers: headers.concat([name]), rows: rows.map(function (r, i) { return r.concat([vals[i]]); }) };
  };
  X.uniqueName = function (headers, name) { var n = name, k = 2; while (headers.indexOf(n) >= 0) n = name + ' ' + (k++); return n; };
})(typeof window !== 'undefined' ? window : globalThis);

// =====================================================================
//  The screen
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL, X = STL.derive;
  if (!root.document || !STL.ui) return;
  var U = STL.ui, T = U.T, esc = U.esc, fmt = U.fmt;
  function $(id) { return document.getElementById(id); }
  var OPW = { minus: ['A minus B', 'A − B'], plus: ['A plus B', 'A + B'], times: ['A times B', 'A × B'], divide: ['A divided by B', 'A ÷ B'], change: ['percent change from A to B', 'A से B तक % बदलाव'], mean: ['average of A and B', 'A और B का औसत'] };

  STL.openAddColumn = function (preset) {
    if (root.BIG && BIG.active) { toast(T('This works on the editor. Use "Work on a copy" first.', 'यह संपादक में चलता है। पहले "प्रति पर काम करें" दबाएँ।'), 'info'); return; }
    if (!U.hasData()) { toast(T('Open a file first', 'पहले फ़ाइल खोलें'), 'info'); return; }
    var nums = headers.map(function (h, i) { return i; }).filter(function (i) { var n = 0, k = 0; for (var r = 0; r < Math.min(rawData.length, 400); r++) { var v = String(rawData[r][i] == null ? '' : rawData[r][i]).trim(); if (!v) continue; n++; if (v !== '' && isFinite(Number(v.replace(/,/g, '')))) k++; } return n && k / n >= 0.8; });
    if (nums.length < 2) { toast(T('The file needs two number columns.', 'फ़ाइल में दो संख्या वाले कॉलम चाहिए।'), 'info'); return; }
    var P = X.pairs(headers), st = preset || (P[0] ? { a: P[0].after, op: 'minus', b: P[0].before, name: P[0].name } : { a: nums[0], op: 'minus', b: nums[1], name: '' });
    st.name = st.name || ''; draw(nums, st);
  };
  function draw(nums, st) {
    var name = st.name || (headers[st.a] + ' ' + { minus: 'minus', plus: 'plus', times: 'times', divide: 'per', change: 'change from', mean: 'average with' }[st.op] + ' ' + headers[st.b]);
    var vals = X.compute(rawData.slice(0, 4000), st.a, st.op, st.b), filled = vals.filter(function (v) { return v !== ''; }).length;
    var sel = function (id, cur) { return '<select id="' + id + '" class="big-select">' + nums.map(function (i) { return '<option value="' + i + '"' + (i === cur ? ' selected' : '') + '>' + esc(headers[i]) + '</option>'; }).join('') + '</select>'; };
    var html = '<div class="prj-h"><b>➕ ' + T('Add a column from two columns', 'दो कॉलम से नया कॉलम जोड़ें') + '</b><button id="dcX" aria-label="close">×</button></div>' +
      '<div class="big-note">' + T('Pick two columns and what to do with them. Nothing in the file is changed except one new column at the end. Example: “Post GPA” minus “Pre GPA” gives the change in GPA.', 'दो कॉलम और उनके साथ क्या करना है चुनें। फ़ाइल में केवल अंत में एक नया कॉलम जुड़ता है। उदाहरण: “बाद का GPA” − “पहले का GPA” = GPA में बदलाव।') + '</div>' +
      '<div class="fr-form"><label class="rp-field"><span>A</span>' + sel('dcA', st.a) + '</label>' +
      '<label class="rp-field"><span>' + T('Do this', 'क्या करें') + '</span><select id="dcOp" class="big-select">' + X.OPS.map(function (o) { return '<option value="' + o + '"' + (o === st.op ? ' selected' : '') + '>' + esc(T(OPW[o][0], OPW[o][1])) + '</option>'; }).join('') + '</select></label>' +
      '<label class="rp-field"><span>B</span>' + sel('dcB', st.b) + '</label></div>' +
      '<label class="rp-field"><span>' + T('Name of the new column', 'नए कॉलम का नाम') + '</span><input id="dcName" class="big-input" value="' + esc(name) + '"></label>' +
      '<div class="prj-sub">' + T('First rows', 'पहली पंक्तियाँ') + '</div><table class="big-tbl"><tr><th>' + esc(headers[st.a]) + '</th><th>' + esc(headers[st.b]) + '</th><th>' + esc(name) + '</th></tr>' +
      rawData.slice(0, 4).map(function (r, i) { return '<tr><td>' + esc(r[st.a]) + '</td><td>' + esc(r[st.b]) + '</td><td><b>' + esc(vals[i]) + '</b></td></tr>'; }).join('') + '</table>' +
      (filled < vals.length * 0.5 ? '<div class="big-note" style="border-color:#c0392b">' + T('Most rows would be empty with these choices.', 'इन विकल्पों से अधिकांश पंक्तियाँ खाली रहेंगी।') + '</div>' : '') +
      '<div class="prj-row" style="justify-content:flex-end;margin-top:12px"><button class="tb-btn" id="dcCancel">' + T('Cancel', 'रद्द करें') + '</button><button class="tb-btn primary" id="dcAdd">' + T('Add the column', 'कॉलम जोड़ें') + '</button></div>';
    var o = U.overlay('addColDialog', html, true); o.querySelector('.stl-box').classList.add('fr-box');
    var read = function () { return { a: +$('dcA').value, op: $('dcOp').value, b: +$('dcB').value, name: $('dcName').value.trim() }; };
    ['dcA', 'dcOp', 'dcB'].forEach(function (id) { $(id).onchange = function () { var n = read(); n.name = ''; o.remove(); draw(nums, n); }; });
    $('dcX').onclick = $('dcCancel').onclick = function () { o.remove(); };
    $('dcAdd').onclick = function () { var n = read(); o.remove(); STL.addColumn(n, null); };
  }
  // add the column to the open data; then(newIndex) runs when it is there
  STL.addColumn = function (st, then) {
    U.busy(T('Adding the column…', 'कॉलम जोड़ा जा रहा है…'));
    setTimeout(function () {
      try {
        var nm = X.uniqueName(headers, st.name || (headers[st.a] + ' ' + st.op + ' ' + headers[st.b])), res = X.apply(headers, rawData, st.a, st.op, st.b, nm);
        U.loadGrid([res.headers].concat(res.rows));
        STL.logStep('derive', { en: 'Added a column', hi: 'नया कॉलम जोड़ा' }, { en: nm + ' = ' + headers[st.a] + ' ' + st.op + ' ' + headers[st.b], hi: nm }, { col: nm });
        toast(T('Added the column “' + nm + '”', 'कॉलम “' + nm + '” जोड़ा गया'), 'success');
        U.busy(null); if (then) then(res.headers.length - 1);
      } catch (e) { U.busy(null); toast(e.message, 'error'); }
    }, 30);
  };
  (STL.actions || []).push({ en: 'Add a column from two columns (difference, ratio, % change)', hi: 'दो कॉलम से नया कॉलम (अंतर, अनुपात, % बदलाव)', kw: 'add column new column difference subtract minus change before after pre post ratio percent divide multiply formula calculate gain', run: function () { STL.openAddColumn(); }, group: 'Clean' });
})(typeof window !== 'undefined' ? window : globalThis);
