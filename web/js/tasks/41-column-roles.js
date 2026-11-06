// =====================================================================
//  CHECK YOUR COLUMNS  /  अपने कॉलम जाँचें
//  The app guesses what each column is (a row number, an ID, a category, a code such as label 0-5, an amount to add up, a measurement to average,
//  a date, written text). Almost every wrong answer seen on real files came from a wrong guess, not from a wrong calculation. This screen shows the
//  guesses in plain words, lets a person correct them in one click, flags codes such as 365243 that mean "not applicable", and REMEMBERS the answers
//  for the next file with the same columns. Everything else (charts, What explains this?, Is it real?, the question box) then uses what was confirmed.
//    STL.roles.guess(headers, prof, avgLen)   -> [{ role, doubt, why }]       (pure)
//    STL.roles.apply(headers, prof)           -> applies the confirmed roles to a column profile (called by STL.charts.profile)
//    STL.roles.confirm(headers, roles, guessed) / STL.roles.forget(headers)     remembered per set of column names, on this computer only
//    STL.openColumnCheck()                    the screen
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL = root.STL || {}, R = STL.roles = {};
  R.ROLES = [['rowno', 'Row number (ignored)', 'पंक्ति क्रमांक (छोड़ा जाएगा)'], ['id', 'ID or reference number (ignored)', 'आईडी / संदर्भ संख्या (छोड़ी जाएगी)'], ['category', 'Category (group by it)', 'श्रेणी (इससे समूह बनाएँ)'],
    ['code', 'Code with a few values (label, status, grade)', 'कुछ मानों वाला कोड (लेबल, स्थिति, ग्रेड)'], ['amount', 'Amount (add up)', 'राशि (जोड़ें)'], ['measure', 'Measurement (average)', 'माप (औसत)'], ['date', 'Date', 'दिनांक'],
    ['text', 'Written text (comments, remarks)', 'लिखा हुआ टेक्स्ट (टिप्पणी, शिकायत)'], ['ignore', 'Ignore this column', 'यह कॉलम छोड़ें']];
  var AMOUNTNAME = /amount|amt|cost|price|sales|revenue|salary|income|wage|fee|total|expense|budget|fund|payment|paid|balance|value|rs\b|inr|राशि|वेतन|कीमत|मूल्य|बजट|व्यय|आय|भुगतान|शुल्क|योग/i;
  function s(v) { return v == null ? '' : String(v); }
  function sigOf(headers) { return headers.map(function (h) { return s(h).trim().toLowerCase(); }).join('\u0001'); }
  R.sig = sigOf;
  // ------------------------------------------------------------ the guesses
  R.guess = function (headers, prof, avgLen) {
    var C = root.STL && STL.charts;
    return prof.map(function (p, i) {
      var name = s(headers[i]), blankName = /^Column \d+$/.test(name), avgy = C && C.avgy ? C.avgy(p) : false, L = avgLen && avgLen[i] || 0, out;
      if (p.serial || (blankName && (p.unique || p.numeric === false && p.distinct > 0.9 * Math.max(p.filled, 1)))) out = { role: 'rowno', doubt: false, why: 'its values run 1, 2, 3 … one per row' };
      else if (p.date && !p.numeric) out = { role: 'date', doubt: false };
      else if (p.numeric) {
        if (p.unique || p.idLike) out = { role: 'id', doubt: false, why: 'a different whole number in every row' };
        else if (p.lowInt || p.flag) out = { role: 'code', doubt: !p.flag && p.distinct > 6, why: 'only a few whole numbers: a code, not an amount' };
        else if (p.tidx) out = { role: 'measure', doubt: false, why: 'a position in time (months back, days since)' };
        else if (avgy) out = { role: 'measure', doubt: false };
        else out = { role: 'amount', doubt: !AMOUNTNAME.test(name), why: AMOUNTNAME.test(name) ? '' : 'a number: add it up, or average it?' };
      } else {
        if (p.list) out = { role: 'category', doubt: false, why: 'several values separated by commas' };
        else if (L >= 30 && p.distinct > 20) out = { role: 'text', doubt: false, why: 'long free text' };
        else if (p.unique) out = { role: 'id', doubt: false, why: 'a different value in every row' };
        else if (p.distinct <= 80) out = { role: 'category', doubt: false };
        else if (L >= 15) out = { role: 'text', doubt: true, why: 'many different values: text or a category?' };
        else out = { role: 'category', doubt: true, why: 'many different values' };
      }
      if (blankName && out.role !== 'rowno') out.doubt = true;
      return out;
    });
  };
  // ------------------------------------------------------------ what was confirmed
  var KEY = 'stellura_roles';
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
  function save(m) { try { var k = Object.keys(m); if (k.length > 60) k.slice(0, k.length - 60).forEach(function (x) { delete m[x]; }); localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) { /* private window: only for this session */ } }
  var session = {};                                                                    // the same, kept in memory when storage is not available
  R.stored = function (headers) { var sg = sigOf(headers); return session[sg] || load()[sg] || null; };
  R.confirm = function (headers, roles, guessed) {
    var sg = sigOf(headers), entry = {}; headers.forEach(function (h, i) { entry[s(h).trim().toLowerCase()] = [roles[i], guessed[i]]; });
    session[sg] = entry; var m = load(); m[sg] = entry; delete m['__last']; save(m);
  };
  R.forget = function (headers) { var sg = sigOf(headers); delete session[sg]; var m = load(); delete m[sg]; save(m); };
  // roles for each column: the remembered one, else the guess
  R.rolesFor = function (headers, guess) { var st = R.stored(headers); return guess.map(function (g, i) { var e = st && st[s(headers[i]).trim().toLowerCase()]; return e ? e[0] : g.role; }); };
  // apply to a profile: only where the person chose something other than the guess made at the time
  R.apply = function (headers, prof) {
    var st = R.stored(headers); if (!st) return prof;
    prof.forEach(function (p, i) {
      var e = st[s(headers[i]).trim().toLowerCase()]; if (!e || e[0] === e[1]) return;
      var r = e[0]; p.role = r;
      if (r === 'rowno' || r === 'id') { p.serial = r === 'rowno'; p.unique = true; p.numeric = false; p.idLike = true; }
      else if (r === 'category' || r === 'code') { p.unique = false; p.serial = false; p.idLike = false; if (p.numeric) { p.lowInt = true; } p.tidx = false; }
      else if (r === 'amount' || r === 'measure') { p.unique = false; p.serial = false; p.idLike = false; p.lowInt = false; p.code = false; p.tidx = false; p.score = false; p.unit = false; p.numeric = true; p.roleFn = r === 'amount' ? 'sum' : 'avg'; }
      else if (r === 'date') { p.date = true; p.numeric = false; }
      else if (r === 'text' || r === 'ignore') { p.numeric = false; p.unique = true; p.text = true; p.ignored = r === 'ignore'; }
    });
    return prof;
  };
})(typeof window !== 'undefined' ? window : globalThis);

// =====================================================================
//  The screen
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL, R = STL.roles;
  if (!root.document || !STL.ui) return;
  var U = STL.ui, T = U.T, esc = U.esc;
  function $(id) { return document.getElementById(id); }
  function fmtN(n) { return Number(n).toLocaleString('en-IN'); }
  function big() { return !!(root.BIG && BIG.active && BIG.ds); }
  function HD() { return big() ? BIG.headers : headers; }
  function RD() { return big() ? STL.bigCharts.sample.rows : rawData; }
  function IDX() { var r = RD(); return big() ? STL.bigCharts.sample.idx : r.map(function (_, i) { return i; }); }
  function roleLabel(r) { var o = R.ROLES.filter(function (x) { return x[0] === r; })[0]; return o ? T(o[1], o[2]) : r; }

  // everything the screen needs, from the open file (a large file: its 4,000-row sample plus the engine's counts over every row)
  function inspect() {
    var CH = STL.charts, H = HD(), rows = RD(), idx = IDX(), prof = CH.profile(H, rows, idx, true), avg = H.map(function (_, c) { var n = 0, L = 0; for (var k = 0; k < Math.min(idx.length, 300); k++) { var v = s(rows[idx[k]][c]); if (v) { n++; L += v.length; } } return n ? L / n : 0; });
    var guess = R.guess(H, prof, avg), cur = R.rolesFor(H, guess), caps = [];
    try { if (STL.colChecks) caps = STL.colChecks.caps(rows, idx, H, prof).filter(function (c) { return c.placeholder; }); } catch (e) { /* optional */ }
    var ex = H.map(function (_, c) { var seen = {}, out = []; for (var k = 0; k < idx.length && out.length < 3; k++) { var v = s(rows[idx[k]][c]).trim(); if (v && !seen[v]) { seen[v] = 1; out.push(v.length > 30 ? v.slice(0, 30) + '…' : v); } } return out; });
    return { H: H, prof: prof, guess: guess, cur: cur, caps: caps, ex: ex, remembered: !!R.stored(H) };
  }
  function s(v) { return v == null ? '' : String(v); }
  R.doubts = function () { try { var I = inspect(); return I.guess.filter(function (g, i) { return g.doubt; }).length + I.caps.length; } catch (e) { return 0; } };

  STL.openColumnCheck = function () {
    if (!big() && !U.hasData()) { toast(T('Open a file first', 'पहले फ़ाइल खोलें'), 'info'); return; }
    var go = function () {
      var I = inspect(), st = { I: I, roles: I.cur.slice(), blank: {} }; I.caps.forEach(function (c) { st.blank[c.col] = true; }); draw(st);
    };
    if (big() && STL.bigCharts.sample.ds !== BIG.ds) STL.bigCharts.loadSample().then(go).catch(function (e) { toast(e.message, 'error'); }); else go();
  };
  function draw(st) {
    var I = st.I, H = I.H, capOf = {}; I.caps.forEach(function (c) { capOf[c.col] = c; });
    var order = H.map(function (_, i) { return i; }).sort(function (a, b) { var da = (I.guess[a].doubt || capOf[a] ? 0 : 1), db = (I.guess[b].doubt || capOf[b] ? 0 : 1); return da - db || a - b; });
    var nDoubt = order.filter(function (i) { return I.guess[i].doubt || capOf[i]; }).length;
    var html = '<div class="prj-h"><b>✔ ' + T('Please check your columns', 'कृपया अपने कॉलम जाँचें') + '</b><button id="rcX" aria-label="close">×</button></div>' +
      '<div class="big-note">' + T('The app has guessed what each column is. A wrong guess gives a wrong answer (for example adding up row numbers), so please look: if it is right, press <b>Looks right</b>. ' + (nDoubt ? '<b>' + nDoubt + ' column' + (nDoubt > 1 ? 's need' : ' needs') + ' a look</b> (shown first).' : 'Nothing looks doubtful.') + ' Your choices are remembered for the next file with the same columns.',
        'ऐप ने अंदाज़ा लगाया है कि हर कॉलम क्या है। ग़लत अंदाज़े से ग़लत उत्तर आता है (जैसे पंक्ति क्रमांकों को जोड़ देना), इसलिए देख लें: सही हो तो <b>सही है</b> दबाएँ। ' + (nDoubt ? '<b>' + nDoubt + ' कॉलम देखने लायक हैं</b> (पहले दिखाए गए)।' : 'कुछ भी संदिग्ध नहीं।') + ' आपके चुनाव समान कॉलमों वाली अगली फ़ाइल के लिए याद रखे जाते हैं।') + '</div>' +
      '<div style="max-height:52vh;overflow:auto"><table class="big-tbl rc-tbl"><tr><th>' + T('Column', 'कॉलम') + '</th><th>' + T('Example values', 'उदाहरण मान') + '</th><th>' + T('What it is', 'यह क्या है') + '</th></tr>' +
      order.map(function (i) {
        var g = I.guess[i], c = capOf[i], doubt = g.doubt || c, sel = '<select class="big-select rc-sel" data-i="' + i + '">' + R.ROLES.map(function (r) { return '<option value="' + r[0] + '"' + (st.roles[i] === r[0] ? ' selected' : '') + '>' + esc(T(r[1], r[2])) + '</option>'; }).join('') + '</select>';
        var note = (g.why && (doubt || st.roles[i] !== g.role) ? '<div><small>' + esc(g.why) + '</small></div>' : '') + (c ? '<label class="rp-inline" style="margin-top:4px"><input type="checkbox" class="rc-blank" data-i="' + i + '"' + (st.blank[i] ? ' checked' : '') + '> ' + T('The value <b>' + esc(String(c.value)) + '</b> (' + (Math.round(c.share * 1000) / 10) + '% of rows) is far from every other value: treat it as <b>empty</b> (“not applicable”)', 'मान <b>' + esc(String(c.value)) + '</b> (' + (Math.round(c.share * 1000) / 10) + '% पंक्तियाँ) बाकी सभी मानों से बहुत दूर है: इसे <b>खाली</b> (“लागू नहीं”) मानें') + '</label>' : '');
        return '<tr' + (doubt ? ' style="background:#fff7e6"' : '') + '><td><b>' + esc(H[i]) + '</b></td><td><small>' + esc(I.ex[i].join(' · ')) + '</small></td><td>' + sel + note + '</td></tr>';
      }).join('') + '</table></div>' +
      '<div class="prj-row" style="justify-content:flex-end;margin-top:12px;gap:8px"><button class="tb-btn" id="rcReset">' + T('Forget my choices for these columns', 'इन कॉलमों के मेरे चुनाव भूलें') + '</button><button class="tb-btn" id="rcCancel">' + T('Not now', 'अभी नहीं') + '</button><button class="tb-btn primary" id="rcOk">✔ ' + T('Looks right', 'सही है') + '</button></div>';
    var o = U.overlay('colRolesDialog', html, true); o.querySelector('.stl-box').classList.add('fr-box');
    $('rcX').onclick = $('rcCancel').onclick = function () { o.remove(); };
    o.querySelectorAll('.rc-sel').forEach(function (e) { e.onchange = function () { st.roles[+e.dataset.i] = e.value; }; });
    o.querySelectorAll('.rc-blank').forEach(function (e) { e.onchange = function () { st.blank[+e.dataset.i] = e.checked; }; });
    $('rcReset').onclick = function () { R.forget(I.H); o.remove(); toast(T('Forgotten. The app will guess again.', 'भूल गया। ऐप फिर अंदाज़ा लगाएगा।'), 'info'); };
    $('rcOk').onclick = function () {
      R.confirm(I.H, st.roles, I.guess.map(function (g) { return g.role; })); o.remove();
      var todo = I.caps.filter(function (c) { return st.blank[c.col]; }), changed = st.roles.filter(function (r, i) { return r !== I.guess[i].role; }).length;
      var done = function () { toast(T('Saved. ' + (changed ? changed + ' column' + (changed > 1 ? 's' : '') + ' changed. ' : '') + 'This will be remembered for files with the same columns.', 'सहेजा गया। ' + (changed ? changed + ' कॉलम बदले। ' : '') + 'समान कॉलमों वाली फ़ाइलों के लिए याद रखा जाएगा।'), 'success'); };
      if (!todo.length) { done(); return; }
      var chain = Promise.resolve(); todo.forEach(function (c) { chain = chain.then(function () { return STL.blankValue(c.col, c.value); }); }); chain.then(done);
    };
  }

  // ------------------------------------------------------------ offered after a file opens (not under test automation, unless forced)
  var asked = {};
  function force() { try { return localStorage.getItem('stellura_roles_auto') === '1'; } catch (e) { return false; } }
  function auto() { try { if (localStorage.getItem('stellura_roles_auto') === '0') return false; } catch (e) { /* default */ } return force() || !navigator.webdriver; }
  R.offer = function () {
    try {
      if (!auto() || $('colRolesDialog')) return; var H = HD(); if (!H || H.length < 2 || R.stored(H)) return;
      var sg = R.sig(H); if (asked[sg]) return; if (R.doubts() > 0) { asked[sg] = 1; STL.openColumnCheck(); }
    } catch (e) { /* only a convenience */ }
  };
  var _imp = window.importData;
  window.importData = function () { var r = _imp.apply(this, arguments); if (!STL._quiet) setTimeout(R.offer, 1500); return r; };
  if (root.BIG && BIG.attach) {
    var _att = BIG.attach;
    BIG.attach = function () { var r = _att.apply(this, arguments), ds = BIG.ds, tries = 0; var wait = function () { if (BIG.ds !== ds) return; if (BIG.profile || tries++ > 40) { STL.bigCharts.loadSample().then(function () { if (BIG.ds === ds) R.offer(); }).catch(function () {}); } else setTimeout(wait, 400); }; setTimeout(wait, 400); return r; };
  }
  (STL.actions || []).push({ en: 'Check my columns (row number, category, amount, code …)', hi: 'मेरे कॉलम जाँचें (क्रमांक, श्रेणी, राशि, कोड …)', kw: 'check columns roles type meaning row number id category code amount measure average sum placeholder not applicable kolam jancho', run: function () { STL.openColumnCheck(); }, group: 'Analyse' });
})(typeof window !== 'undefined' ? window : globalThis);
