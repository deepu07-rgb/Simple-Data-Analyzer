// =====================================================================
//  THE SAME CASE ENTERED TWICE  /  एक ही प्रकरण दो बार दर्ज
//  Two operators enter the same grievance; the rows are never identical in every cell ("Kamla Lodha" / "KAMLA LODHA",
//  a date a day apart). The person chooses which columns identify a case; capitals, spaces and titles are ignored and,
//  if wanted, dates may differ by a few days. The most complete row of every group is kept.
//    STL.dups.find(rows, cols, { dateCol, days })   -> [[rowIndex, ...], ...]   (groups of 2+ rows, original order)
//    STL.dups.keeper(rows, group)                   -> the row index to keep (most cells filled, then the first)
//    STL.dups.suggest(headers, rows)                -> [{ id, title, cols, dateCol, days }]
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL = root.STL || {}, D = STL.dups = {};
  function s(v) { return v == null ? '' : String(v); }
  function key(v) { var V = STL.values; var k = V && V.key ? V.key(v) : s(v).trim().toLowerCase(); return k || s(v).trim().toLowerCase(); }
  function day(v) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s(v).trim()); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : null; }

  D.find = function (rows, cols, opt) {
    opt = opt || {}; var map = {}, order = [];
    rows.forEach(function (r, i) {
      var parts = cols.map(function (c) { return key(r[c]); }); if (parts.every(function (p) { return p === ''; })) return;
      var k = parts.join('\u0001'); if (!map[k]) { map[k] = []; order.push(k); } map[k].push(i);
    });
    var out = [];
    order.forEach(function (k) {
      var g = map[k]; if (g.length < 2) return;
      if (opt.dateCol >= 0 && opt.dateCol != null && opt.days >= 0) {                                     // the same key, but only dates close together are the same case
        var dated = g.map(function (i) { return { i: i, d: day(rows[i][opt.dateCol]) }; }), plain = dated.filter(function (x) { return x.d === null; }).map(function (x) { return x.i; });
        var ds = dated.filter(function (x) { return x.d !== null; }).sort(function (a, b) { return a.d - b.d || a.i - b.i; }), chain = [];
        ds.forEach(function (x, n) { if (n && x.d - ds[n - 1].d > opt.days) { if (chain.length > 1) out.push(chain.map(function (y) { return y.i; }).sort(function (a, b) { return a - b; })); chain = []; } chain.push(x); });
        if (chain.length > 1) out.push(chain.map(function (y) { return y.i; }).sort(function (a, b) { return a - b; }));
        if (plain.length > 1) out.push(plain);
      } else out.push(g);
    });
    return out.sort(function (a, b) { return a[0] - b[0]; });
  };
  D.keeper = function (rows, group) {
    var best = group[0], bestN = -1;
    group.forEach(function (i) { var n = rows[i].filter(function (v) { return s(v).trim() !== ''; }).length; if (n > bestN) { best = i; bestN = n; } });
    return best;
  };
  // sensible starting points from the column names
  D.suggest = function (headers, rows) {
    var find = function (re) { for (var i = 0; i < headers.length; i++) if (re.test(s(headers[i]))) return i; return -1; }, out = [];
    var id = -1; headers.forEach(function (h, i) { if (id >= 0 || !/(reg(istration)?|case|complaint|application|reference|ref|file|fir|diary|token)\b.*(no|number|id|क्र|संख्या)|^(reg|case)\.?\s*no|पंजीयन|प्रकरण संख्या/i.test(s(h))) return; var seen = {}, n = 0, t = 0; for (var r = 0; r < Math.min(rows.length, 3000); r++) { var v = s(rows[r][i]).trim(); if (!v) continue; t++; if (!seen[v]) { seen[v] = 1; n++; } } if (t > 20 && n / t >= 0.8) id = i; });
    var name = find(/applicant|complainant|^name|आवेदक|परिवादी|प्रार्थी/i), father = find(/father|husband|पिता|पति/i), place = find(/village|ward|gram|ग्राम|गाँव|locality/i), dept = find(/department|dept|subject|विभाग|विषय/i), dateC = find(/date of (reg|filing)|registration date|^date$|दिनांक|तारीख/i);
    if (id >= 0 && name >= 0) out.push({ id: 'id', title: { en: 'Same registration number and same applicant', hi: 'वही पंजीयन संख्या और वही आवेदक' }, cols: [id, name], dateCol: -1, days: -1 });
    else if (id >= 0) out.push({ id: 'id', title: { en: 'Same registration number', hi: 'वही पंजीयन संख्या' }, cols: [id], dateCol: -1, days: -1 });
    var pc = [name, father, place, dept].filter(function (x) { return x >= 0; });
    if (name >= 0 && pc.length >= 3) out.push({ id: 'person', title: { en: 'Same person, place and department, dates within 3 days', hi: 'वही व्यक्ति, स्थान और विभाग, तारीखें 3 दिन के भीतर' }, cols: pc, dateCol: dateC, days: dateC >= 0 ? 3 : -1 });
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);

// =====================================================================
//  The screen
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL, D = STL.dups;
  if (!root.document || !STL.ui) return;
  var U = STL.ui, T = U.T, TT = U.TT, esc = U.esc, fmt = U.fmt;
  function $(id) { return document.getElementById(id); }
  var S = null;

  STL.openDuplicates = function () {
    if (root.BIG && BIG.active) { toast(T('This works on the editor. Use "Work on a copy" first.', 'यह संपादक में चलता है। पहले "प्रति पर काम करें" दबाएँ।'), 'info'); return; }
    if (!U.hasData()) { toast(T('Open a file first', 'पहले फ़ाइल खोलें'), 'info'); return; }
    var sug = D.suggest(headers, rawData);
    S = { sug: sug, pick: sug.length ? 0 : -1, cols: sug.length ? sug[0].cols.slice() : [], dateCol: sug.length ? sug[0].dateCol : -1, days: sug.length && sug[0].days >= 0 ? sug[0].days : 0 };
    render();
  };
  function current() { return D.find(rawData, S.cols, { dateCol: S.dateCol, days: S.dateCol >= 0 ? S.days : -1 }); }
  function render() {
    var groups = S.cols.length ? current() : [], extra = groups.reduce(function (a, g) { return a + g.length - 1; }, 0);
    var html = '<div class="prj-h"><b>👥 ' + T('The same case entered twice', 'एक ही प्रकरण दो बार दर्ज') + '</b><button id="dpX" aria-label="close">×</button></div>' +
      '<div class="big-note">' + T('Choose which columns identify one case. Capitals, spaces and titles (Shri, Smt.) are ignored. The most complete row of each group is kept.', 'चुनें कि कौन-से कॉलम एक प्रकरण को पहचानते हैं। बड़े-छोटे अक्षर, खाली स्थान और उपाधि (श्री, श्रीमती) अनदेखे किए जाते हैं। हर समूह की सबसे पूरी पंक्ति रखी जाती है।') + '</div>' +
      (S.sug.length ? '<div class="prj-row" style="gap:8px;flex-wrap:wrap">' + S.sug.map(function (x, i) { return '<button class="tb-btn' + (S.pick === i ? ' primary' : '') + '" data-p="' + i + '">' + esc(TT(x.title)) + '</button>'; }).join('') + '</div>' : '') +
      '<div class="prj-sub">' + T('Columns that must match', 'जो कॉलम मिलने चाहिए') + '</div><div class="rp-checks">' + headers.map(function (h, i) { return '<label class="rp-inline"><input type="checkbox" data-c="' + i + '"' + (S.cols.indexOf(i) >= 0 ? ' checked' : '') + '> ' + esc(h) + '</label>'; }).join('') + '</div>' +
      '<div class="prj-row" style="gap:10px;align-items:center;margin-top:8px"><label class="rp-field"><span>' + T('Date column (optional)', 'तारीख कॉलम (वैकल्पिक)') + '</span><select id="dpDate" class="big-select"><option value="-1">—</option>' + headers.map(function (h, i) { return '<option value="' + i + '"' + (S.dateCol === i ? ' selected' : '') + '>' + esc(h) + '</option>'; }).join('') + '</select></label>' +
      '<label class="rp-field"><span>' + T('Dates may differ by (days)', 'तारीखों में अंतर (दिन)') + '</span><input id="dpDays" class="big-input" type="number" min="0" max="60" value="' + S.days + '" style="width:80px"' + (S.dateCol < 0 ? ' disabled' : '') + '></label></div>' +
      '<div class="fr-verdict" style="border-color:' + (extra ? '#e8913a' : '#14a38b') + '"><b>' + (S.cols.length ? (extra ? fmt(groups.length) + T(' groups, ', ' समूह, ') + fmt(extra) + T(' extra rows', ' अतिरिक्त पंक्तियाँ') : T('No repeated cases found with these columns.', 'इन कॉलमों से कोई दोहराया प्रकरण नहीं मिला।')) : T('Tick at least one column.', 'कम से कम एक कॉलम चुनें।')) + '</b></div>' +
      (groups.length ? '<table class="big-tbl"><tr><th>' + T('Row', 'पंक्ति') + '</th>' + S.cols.map(function (c) { return '<th>' + esc(headers[c]) + '</th>'; }).join('') + (S.dateCol >= 0 && S.cols.indexOf(S.dateCol) < 0 ? '<th>' + esc(headers[S.dateCol]) + '</th>' : '') + '<th></th></tr>' +
        groups.slice(0, 6).map(function (g) { var keep = D.keeper(rawData, g); return g.slice(0, 4).map(function (i, k) { return '<tr' + (k === 0 ? ' style="border-top:2px solid #bbb"' : '') + '><td class="num">' + (i + 1) + '</td>' + S.cols.map(function (c) { return '<td>' + esc(rawData[i][c]) + '</td>'; }).join('') + (S.dateCol >= 0 && S.cols.indexOf(S.dateCol) < 0 ? '<td>' + esc(rawData[i][S.dateCol]) + '</td>' : '') + '<td>' + (i === keep ? '<b>' + T('keep', 'रखें') + '</b>' : '<em>' + T('repeat', 'दोहराव') + '</em>') + '</td></tr>'; }).join(''); }).join('') + '</table>' : '') +
      '<div class="prj-row" style="justify-content:flex-end;margin-top:12px;gap:8px"><button class="tb-btn" id="dpCancel">' + T('Cancel', 'रद्द करें') + '</button><button class="tb-btn" id="dpMark"' + (extra ? '' : ' disabled') + '>' + T('Mark them, keep all rows', 'चिह्नित करें, सभी पंक्तियाँ रखें') + '</button><button class="tb-btn primary" id="dpRemove"' + (extra ? '' : ' disabled') + '>' + T('Remove the ', 'हटाएँ: ') + fmt(extra) + T(' repeats', ' दोहराव') + '</button></div>';
    var o = U.overlay('dupDialog', html, true); o.querySelector('.stl-box').classList.add('fr-box');
    $('dpX').onclick = $('dpCancel').onclick = function () { o.remove(); };
    o.querySelectorAll('[data-p]').forEach(function (b) { b.onclick = function () { var x = S.sug[+b.dataset.p]; S.pick = +b.dataset.p; S.cols = x.cols.slice(); S.dateCol = x.dateCol; S.days = x.days >= 0 ? x.days : 0; o.remove(); render(); }; });
    o.querySelectorAll('input[data-c]').forEach(function (b) { b.onchange = function () { var c = +b.dataset.c, i = S.cols.indexOf(c); if (b.checked && i < 0) S.cols.push(c); else if (!b.checked && i >= 0) S.cols.splice(i, 1); o.remove(); render(); }; });
    $('dpDate').onchange = function () { S.dateCol = +this.value; o.remove(); render(); };
    $('dpDays').onchange = function () { S.days = Math.max(0, Math.min(60, +this.value || 0)); o.remove(); render(); };
    function act(remove) {
      o.remove(); U.busy(T('Working…', 'काम हो रहा है…'));
      setTimeout(function () {
        try {
          var grid = [headers.slice()].concat(rawData.map(function (r) { return r.slice(); })), body = grid.slice(1), drop = {}, mark = {};
          groups.forEach(function (g) { var keep = D.keeper(body, g); g.forEach(function (i) { if (i !== keep) { drop[i] = true; mark[i] = keep + 1; } }); });
          var n = Object.keys(drop).length, out;
          if (remove) out = [grid[0]].concat(body.filter(function (_, i) { return !drop[i]; }));
          else { out = [grid[0].concat([T('Repeat of row', 'किस पंक्ति का दोहराव')])].concat(body.map(function (r, i) { return r.concat([mark[i] ? String(mark[i]) : '']); })); }
          U.loadGrid(out);
          STL.logStep('dups', { en: remove ? 'Removed repeated cases' : 'Marked repeated cases', hi: remove ? 'दोहराए प्रकरण हटाए' : 'दोहराए प्रकरण चिह्नित किए' }, { en: S.cols.map(function (c) { return headers[c]; }).join(', ') + ': ' + fmt(n) + ' rows', hi: fmt(n) + ' पंक्तियाँ' }, { cols: S.cols.length, rows: n });
          toast(remove ? T('Removed ', 'हटाई गईं ') + fmt(n) + T(' repeated rows', ' दोहराई पंक्तियाँ') : T('Marked ', 'चिह्नित ') + fmt(n) + T(' rows', ' पंक्तियाँ'), 'success');
        } catch (e) { toast(e.message, 'error'); }
        U.busy(null);
      }, 30);
    }
    $('dpRemove').onclick = function () { act(true); }; $('dpMark').onclick = function () { act(false); };
  }
  (STL.actions || []).push({ en: 'Find the same case entered twice (duplicate records)', hi: 'एक ही प्रकरण दो बार दर्ज (दोहराई प्रविष्टियाँ)', kw: 'duplicate duplicates repeat twice same case record dedupe remove registration number double entry dohrav', run: function () { STL.openDuplicates(); }, group: 'Clean' });
})(typeof window !== 'undefined' ? window : globalThis);
