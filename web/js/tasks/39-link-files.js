// =====================================================================
//  LINK TWO FILES  /  दो फ़ाइलें ID से जोड़ें      and      ONE ROW FOR EACH PERSON  /  हर व्यक्ति की एक पंक्ति
//  Two files about the same people (an application list and a month-by-month payment record) can only answer a question together:
//    1. "One row for each…": a long file (one row per person per month) becomes one row per person: months on record, months late, ever late…
//    2. "Link two files": columns of another file are added by a shared column (an ID), like VLOOKUP, but every row is checked and counted:
//       how many rows found a match, how many IDs are repeated in the other file (those are left empty, never guessed).
//  Both run inside the engine on every row (a file of millions of rows is as light as one of 500) and open the result like a new file.
//    STL.linkfiles.guessKeys(h1, h2)        -> [i, j]  the two columns that hold the same kind of ID
//    STL.linkfiles.sentence(check, a, b, hi) -> plain-language summary of a link check
//    STL.linkfiles.guessKey(headers)         -> index of the column that most looks like an ID
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL = root.STL || {}, L = STL.linkfiles = {};
  function norm(h) { return String(h == null ? '' : h).toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, ''); }
  var IDNAME = /(^|[_ \-])(id|code|no|number|num|ref|reg|registration|case|file|sno|serial)($|[_ \-])|(id|code|no)$|आईडी|क्रमांक|संख्या/i;
  L.guessKey = function (headers) { for (var i = 0; i < headers.length; i++) if (IDNAME.test(String(headers[i]))) return i; return 0; };
  L.guessKeys = function (h1, h2) {
    var best = null;
    h1.forEach(function (a, i) { h2.forEach(function (b, j) { if (norm(a) && norm(a) === norm(b)) { var sc = IDNAME.test(String(a)) ? 2 : 1; if (!best || sc > best.sc) best = { i: i, j: j, sc: sc }; } }); });
    if (best) return [best.i, best.j];
    return [L.guessKey(h1), L.guessKey(h2)];
  };
  function f(n) { return Number(n).toLocaleString('en-IN'); }
  function pct(a, b) { return b ? (a / b < 0.01 && a ? Math.round(a / b * 10000) / 100 : Math.round(a / b * 1000) / 10) : 0; }
  L.sentence = function (c, a, b, hi) {
    var out = [], un = c.left_rows - c.matched_rows;
    if (!c.matched_rows) return { level: 'bad', lines: [hi ? 'एक भी पंक्ति मेल नहीं खाती। शायद ये दोनों कॉलम एक ही तरह की ID नहीं हैं।' : 'No row finds a match. These two columns are probably not the same kind of ID.'] };
    out.push(hi ? f(c.matched_rows) + ' / ' + f(c.left_rows) + ' पंक्तियाँ (' + pct(c.matched_rows, c.left_rows) + '%) “' + b + '” में मिलती हैं (' + f(c.matched_keys) + ' अलग ID)।' : f(c.matched_rows) + ' of ' + f(c.left_rows) + ' rows (' + pct(c.matched_rows, c.left_rows) + '%) of “' + a + '” find a match in “' + b + '” (' + f(c.matched_keys) + ' different IDs).');
    if (un) out.push(hi ? f(un) + ' पंक्तियों का मेल नहीं मिला: उनके नए कॉलम खाली रहेंगे।' : f(un) + ' rows have no match: their new columns stay empty.');
    if (c.other_repeated_keys) out.push(hi ? '“' + b + '” में ' + f(c.other_repeated_keys) + ' ID एक से अधिक बार हैं (' + f(c.other_repeated_rows) + ' पंक्तियाँ)' + (c.ambiguous_rows ? ' और आपकी ' + f(c.ambiguous_rows) + ' पंक्तियाँ उन्हीं का उपयोग करती हैं।' : '।') : 'In “' + b + '”, ' + f(c.other_repeated_keys) + ' IDs appear more than once (' + f(c.other_repeated_rows) + ' rows)' + (c.ambiguous_rows ? ', and ' + f(c.ambiguous_rows) + ' of your rows use them.' : '.'));
    return { level: c.ambiguous_rows ? 'warn' : 'ok', lines: out };
  };
  // the lines suggested for "one row for each …": how many rows, and for every number column its lowest and highest
  L.defaultLines = function (cols, key) {
    var out = [{ fn: 'count', name: 'Rows' }];
    var TIDX = /(month|day|week|year|quarter)s?[_ ]?(balance|ago|since|offset|before|after|on[_ ]?book)/i;
    cols.filter(function (c) { return c.index !== key && c.type === 'number' && c.distinct > 12; }).slice(0, 3).forEach(function (c) {
      if (TIDX.test(String(c.name))) out.push({ fn: 'min', col: c.index, name: 'Lowest ' + c.name });                  // a month index: how far back it goes, never an average
      else out.push({ fn: 'avg', col: c.index, name: 'Average ' + c.name });
    });
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);

// =====================================================================
//  The screens
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL, L = STL.linkfiles;
  if (!root.document || !STL.ui) return;
  var U = STL.ui, T = U.T, esc = U.esc;
  function $(id) { return document.getElementById(id); }
  function api(path, body) {
    return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || j.message || 'Request failed'); return j; }); });
  }
  function getp(path) { return fetch(path).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Request failed'); return j; }); }); }
  function fmtN(n) { return Number(n).toLocaleString('en-IN'); }
  function big() { return !!(root.BIG && BIG.active); }

  // the open file as a table inside the engine (a large file already is; an editor file is sent once)
  function currentTable() {
    if (big()) return Promise.resolve({ id: BIG.ds, name: BIG.name, headers: BIG.headers, rows: BIG.total, own: false });
    if (!U.hasData()) return Promise.reject(new Error(T('Open a file first', 'पहले फ़ाइल खोलें')));
    var nm = (($('documentName') || {}).textContent || 'data').replace(/\s*\((copy|first.*)\)\s*$/, '');
    return api('/api/engine/load', { headers: headers, data: rawData, name: nm }).then(function (i) { return { id: i.id, name: nm, headers: i.headers, rows: i.rows, own: true }; });
  }
  function dropTable(t) { if (t && t.own) api('/api/engine/' + t.id + '/drop').catch(function () {}); }
  function pickAndLoad() {
    return new Promise(function (resolve, reject) {
      var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,.tsv,.txt,.xlsx'; inp.style.display = 'none'; document.body.appendChild(inp);
      inp.onchange = function () {
        var file = inp.files[0]; document.body.removeChild(inp); if (!file) { reject(new Error('')); return; }
        U.busy(T('Reading ' + file.name + '…', file.name + ' पढ़ी जा रही है…')); var fd = new FormData(); fd.append('file', file);
        fetch('/api/engine/load', { method: 'POST', body: fd }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Could not open the file'); return j; }); })
          .then(function (i) { U.busy(null); resolve({ id: i.id, name: i.name, headers: i.headers, rows: i.rows, own: true }); }).catch(function (e) { U.busy(null); reject(e); });
      };
      inp.click();
    });
  }
  // the new table becomes the open file (in the editor when it is small enough, as a large file otherwise)
  function openResult(info, label, stepTitle, stepDetail, others) {
    var done = function () { (others || []).forEach(dropTable); U.busy(null); };
    var title = (label || info.name);
    var after = function () {
      STL.logStep && STL.logStep('table', stepTitle, stepDetail, { rows: info.rows });
      toast(T('Done: ' + fmtN(info.rows) + ' rows. The files on disk are not changed.', 'हो गया: ' + fmtN(info.rows) + ' पंक्तियाँ। डिस्क की फ़ाइलें नहीं बदलीं।'), 'success');
    };
    if (info.rows > 100000) { if (big()) BIG.exit(); BIG.attach(info); done(); after(); return; }
    api('/api/engine/' + info.id + '/copy', { limit: 100000 }).then(function (r) {
      if (big()) BIG.exit();
      importData([r.headers].concat(r.rows)); var dn = $('documentName'); if (dn) dn.textContent = title;
      api('/api/engine/' + info.id + '/drop').catch(function () {}); done(); after();
    }).catch(function (e) { U.busy(null); toast(e.message, 'error'); });
  }

  STL.engineTable = { current: currentTable, drop: dropTable, api: api, get: getp, open: openResult };
  // ================================================================= link two files
  STL.openLink = function (other) {
    U.busy(T('Preparing…', 'तैयारी…'));
    currentTable().then(function (cur) {
      U.busy(null); var S = { cur: cur, other: other || null, key: 0, okey: 0, cols: {}, how: 'left', rep: 'blank', check: null, err: '' };
      draw(S);
    }).catch(function (e) { U.busy(null); if (e.message) toast(e.message, 'info'); });
  };
  function closeLink(S, keepCur) { var o = $('linkDialog'); if (o) o.remove(); if (!keepCur) dropTable(S.cur); dropTable(S.other); }
  function draw(S) {
    var cur = S.cur, ot = S.other, html = '<div class="prj-h"><b>🔗 ' + T('Link two files by a shared column', 'साझा कॉलम से दो फ़ाइलें जोड़ें') + '</b><button id="lkX" aria-label="close">×</button></div>' +
      '<div class="big-note">' + T('Bring columns of another file into “' + esc(cur.name) + '”, matching rows by a shared column such as an ID. Every row is checked and counted; nothing is guessed. The files on disk are not changed.', 'दूसरी फ़ाइल के कॉलम “' + esc(cur.name) + '” में लाएँ, ID जैसे साझा कॉलम से पंक्तियाँ मिलाकर। हर पंक्ति जाँची और गिनी जाती है; कुछ भी अंदाज़े से नहीं। डिस्क की फ़ाइलें नहीं बदलतीं।') + '</div>';
    if (!ot) {
      html += '<div class="prj-row" style="margin:12px 0"><button class="tb-btn primary" id="lkPick">📂 ' + T('Choose the other file', 'दूसरी फ़ाइल चुनें') + '</button></div><div class="big-note">' + T('Example: this file has one row per month; the other file has the details of each person. Choose the details file.', 'उदाहरण: इस फ़ाइल में हर महीने की एक पंक्ति है; दूसरी में हर व्यक्ति का विवरण। विवरण वाली फ़ाइल चुनें।') + '</div>';
    } else {
      var sel = function (id, hs, cur0) { return '<select id="' + id + '" class="big-select">' + hs.map(function (h, i) { return '<option value="' + i + '"' + (i === cur0 ? ' selected' : '') + '>' + esc(h) + '</option>'; }).join('') + '</select>'; };
      html += '<div class="fr-form"><label class="rp-field"><span>' + T('In “' + esc(cur.name) + '” (' + fmtN(cur.rows) + ' rows) the column that names the row', '“' + esc(cur.name) + '” (' + fmtN(cur.rows) + ' पंक्तियाँ) में पहचान वाला कॉलम') + '</span>' + sel('lkK', cur.headers, S.key) + '</label>' +
        '<label class="rp-field"><span>' + T('In “' + esc(ot.name) + '” (' + fmtN(ot.rows) + ' rows) the same column', '“' + esc(ot.name) + '” (' + fmtN(ot.rows) + ' पंक्तियाँ) में वही कॉलम') + '</span>' + sel('lkO', ot.headers, S.okey) + '</label></div>';
      var ck = S.check;
      if (S.err) html += '<div class="big-err">' + esc(S.err) + '</div>';
      else if (!ck) html += '<div class="big-note">' + T('Checking how well they fit…', 'मेल जाँचा जा रहा है…') + '</div>';
      else {
        var sn = L.sentence(ck, cur.name, ot.name, false), sh = L.sentence(ck, cur.name, ot.name, true); sn.lines = sn.lines.map(function (l, i) { return T(l, sh.lines[i]); });
        html += '<div class="big-note" style="border-color:' + (sn.level === 'bad' ? '#c0392b' : (sn.level === 'warn' ? '#d68910' : '#14a38b')) + '">' + sn.lines.map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('') + '</div>';
        if (ck.matched_rows) {
          html += '<div class="prj-sub">' + T('Columns to bring in', 'लाने वाले कॉलम') + ' <button class="tb-btn" id="lkAll" style="padding:2px 8px">' + T('all', 'सभी') + '</button> <button class="tb-btn" id="lkNone" style="padding:2px 8px">' + T('none', 'कोई नहीं') + '</button></div><div class="lk-cols" style="display:flex;flex-wrap:wrap;gap:4px 14px;max-height:150px;overflow:auto">' +
            ot.headers.map(function (h, i) { return i === S.okey ? '' : '<label style="white-space:nowrap"><input type="checkbox" class="lkC" data-i="' + i + '"' + (S.cols[i] ? ' checked' : '') + '> ' + esc(h) + '</label>'; }).join('') + '</div>';
          html += '<div class="fr-form" style="margin-top:10px"><label class="rp-field"><span>' + T('Rows with no match', 'जिन पंक्तियों का मेल नहीं') + '</span><select id="lkHow" class="big-select"><option value="left"' + (S.how === 'left' ? ' selected' : '') + '>' + T('Keep them (new columns stay empty)', 'रखें (नए कॉलम खाली)') + '</option><option value="inner"' + (S.how === 'inner' ? ' selected' : '') + '>' + T('Remove them', 'हटा दें') + '</option></select></label>' +
            (ck.other_repeated_keys ? '<label class="rp-field"><span>' + T('An ID that is in “' + esc(ot.name) + '” more than once', 'जो ID “' + esc(ot.name) + '” में एक से अधिक बार है') + '</span><select id="lkRep" class="big-select"><option value="blank"' + (S.rep === 'blank' ? ' selected' : '') + '>' + T('Leave empty — they may be different people (safest)', 'खाली छोड़ें — अलग व्यक्ति हो सकते हैं (सबसे सुरक्षित)') + '</option><option value="first"' + (S.rep === 'first' ? ' selected' : '') + '>' + T('Use the first one', 'पहली वाली लें') + '</option></select></label>' : '') + '</div>';
        }
      }
    }
    html += '<div class="prj-row" style="justify-content:flex-end;margin-top:12px"><button class="tb-btn" id="lkCancel">' + T('Cancel', 'रद्द करें') + '</button>' + (S.other && S.check && S.check.matched_rows ? '<button class="tb-btn primary" id="lkGo">' + T('Link the files', 'फ़ाइलें जोड़ें') + '</button>' : '') + '</div>';
    var o = U.overlay('linkDialog', html, true); o.querySelector('.stl-box').classList.add('fr-box');
    $('lkX').onclick = $('lkCancel').onclick = function () { closeLink(S); };
    if ($('lkPick')) $('lkPick').onclick = function () { pickAndLoad().then(function (t) { S.other = t; var g = L.guessKeys(S.cur.headers, t.headers); S.key = g[0]; S.okey = g[1]; t.headers.forEach(function (h, i) { S.cols[i] = true; }); S.cols[S.okey] = false; recheck(S); }).catch(function (e) { if (e.message) toast(e.message, 'error'); }); };
    if ($('lkK')) { $('lkK').onchange = function () { S.key = +$('lkK').value; recheck(S); }; $('lkO').onchange = function () { S.okey = +$('lkO').value; S.cols[S.okey] = false; recheck(S); }; }
    if ($('lkAll')) { $('lkAll').onclick = function () { S.other.headers.forEach(function (h, i) { S.cols[i] = i !== S.okey; }); draw(S); }; $('lkNone').onclick = function () { S.cols = {}; draw(S); }; }
    o.querySelectorAll('.lkC').forEach(function (c) { c.onchange = function () { S.cols[+c.dataset.i] = c.checked; }; });
    if ($('lkHow')) $('lkHow').onchange = function () { S.how = $('lkHow').value; };
    if ($('lkRep')) $('lkRep').onchange = function () { S.rep = $('lkRep').value; };
    if ($('lkGo')) $('lkGo').onclick = function () { go(S); };
  }
  function recheck(S) {
    S.check = null; S.err = ''; draw(S);
    var mine = JSON.stringify([S.key, S.okey, S.other.id]);
    api('/api/engine/' + S.cur.id + '/link_check', { other: S.other.id, key: S.key, otherKey: S.okey }).then(function (c) { if (JSON.stringify([S.key, S.okey, S.other.id]) !== mine) return; S.check = c; if (!Object.keys(S.cols).some(function (k) { return S.cols[k]; })) S.other.headers.forEach(function (h, i) { S.cols[i] = i !== S.okey; }); if ($('linkDialog')) draw(S); })
      .catch(function (e) { S.err = e.message; if ($('linkDialog')) draw(S); });
  }
  function go(S) {
    var cols = Object.keys(S.cols).filter(function (k) { return S.cols[k] && +k !== S.okey; }).map(Number);
    if (!cols.length) { toast(T('Choose at least one column to bring in.', 'लाने के लिए कम से कम एक कॉलम चुनें।'), 'info'); return; }
    var o = $('linkDialog'); if (o) o.remove(); U.busy(T('Linking the files…', 'फ़ाइलें जोड़ी जा रही हैं…'));
    var nm = S.cur.name + ' + ' + S.other.name;
    api('/api/engine/' + S.cur.id + '/link', { other: S.other.id, key: S.key, otherKey: S.okey, cols: cols, how: S.how, onRepeat: S.rep, name: nm }).then(function (info) {
      var detail = { en: S.cur.name + ' + ' + cols.length + ' columns of ' + S.other.name + ' by ' + S.cur.headers[S.key] + ' (' + fmtN(S.check.matched_rows) + ' of ' + fmtN(S.check.left_rows) + ' rows matched)', hi: S.cur.name + ' + ' + S.other.name + ' के ' + cols.length + ' कॉलम' };
      openResult(info, nm, { en: 'Linked two files', hi: 'दो फ़ाइलें जोड़ीं' }, detail, [S.cur, S.other]);
    }).catch(function (e) { U.busy(null); toast(e.message, 'error'); draw(S); });
  }

  // ================================================================= one row for each …
  var FNW = { count: ['Number of rows', 'पंक्तियों की संख्या'], sum: ['Total of', 'योग'], avg: ['Average of', 'औसत'], min: ['Lowest', 'न्यूनतम'], max: ['Highest', 'अधिकतम'], first: ['First', 'पहला'], last: ['Last', 'अंतिम'], distinct: ['Number of different values of', 'अलग-अलग मानों की संख्या'],
    countif: ['Rows where … is', 'वे पंक्तियाँ जहाँ … है'], shareif: ['% of rows where … is', '% पंक्तियाँ जहाँ … है'], anyif: ['Whether any row has … equal to', 'क्या किसी पंक्ति में … बराबर है']};
  var NEEDVAL = { countif: 1, shareif: 1, anyif: 1 }, NEEDNUM = { sum: 1, avg: 1, min: 1, max: 1 };
  STL.openSummary = function () {
    U.busy(T('Preparing…', 'तैयारी…'));
    currentTable().then(function (cur) {
      return getp('/api/engine/' + cur.id + '/profile').then(function (p) {
        U.busy(null); var key = L.guessKey(cur.headers);
        var S = { cur: cur, prof: p.columns, key: key, lines: L.defaultLines(p.columns, key), add: { fn: 'countif', col: -1, values: {}, name: '' }, vals: {}, info: null };
        S.lines.forEach(function (l) { l.on = true; }); draw2(S); count(S);
      });
    }).catch(function (e) { U.busy(null); if (e.message) toast(e.message, 'error'); });
  };
  function closeSum(S) { var o = $('sumDialog'); if (o) o.remove(); dropTable(S.cur); }
  function count(S) {
    S.info = null; var k0 = S.key; api('/api/engine/' + S.cur.id + '/chart', { kind: 'scalar', y: S.key, fn: 'distinct' }).then(function (r) { if (S.key === k0) { S.info = r; if ($('sumDialog')) draw2(S); } }).catch(function () {});
  }
  function lineText(S, l) {
    var h = S.cur.headers, w = FNW[l.fn]; if (l.fn === 'count') return T(w[0], w[1]);
    var c = h[l.col]; if (NEEDVAL[l.fn]) return T(w[0].replace('…', '“' + c + '”'), w[1].replace('…', '“' + c + '”')) + ' ' + (l.values || []).join(', ');
    return T(w[0] + ' “' + c + '”', w[1] + ' “' + c + '”');
  }
  function defName(S, l) {
    var h = S.cur.headers, c = h[l.col], v = (l.values || []).join('/');
    return ({ count: 'Rows', sum: 'Total ' + c, avg: 'Average ' + c, min: 'Lowest ' + c, max: 'Highest ' + c, first: 'First ' + c, last: 'Last ' + c, distinct: 'Different ' + c, countif: c + ' = ' + v + ' (rows)', shareif: c + ' = ' + v + ' (% of rows)', anyif: 'Any ' + c + ' = ' + v }[l.fn]) || l.fn;
  }
  function draw2(S) {
    var cur = S.cur, h = cur.headers, A = S.add, opt = function (i, sel0) { return '<option value="' + i + '"' + (i === sel0 ? ' selected' : '') + '>' + esc(h[i]) + '</option>'; };
    var html = '<div class="prj-h"><b>🧮 ' + T('One row for each person, case or ID', 'हर व्यक्ति / केस / ID की एक पंक्ति') + '</b><button id="smX" aria-label="close">×</button></div>' +
      '<div class="big-note">' + T('When the file has many rows for the same ID (one per month, one per visit…), this makes a new table with ONE row for each ID and the figures you choose: how many rows, how many were late, the lowest value… The original file is not changed.', 'जब फ़ाइल में एक ही ID की कई पंक्तियाँ हों (हर महीने / हर बार की एक), तो यह हर ID की एक पंक्ति वाली नई तालिका बनाता है, आपके चुने आँकड़ों के साथ। मूल फ़ाइल नहीं बदलती।') + '</div>' +
      '<label class="rp-field"><span>' + T('One row for each different…', 'हर अलग… की एक पंक्ति') + '</span><select id="smK" class="big-select">' + h.map(function (x, i) { return opt(i, S.key); }).join('') + '</select></label>' +
      '<div class="big-note">' + (S.info ? T('This will make ' + fmtN(S.info.value) + ' rows (from ' + fmtN(cur.rows) + ', about ' + (Math.round(cur.rows / Math.max(1, S.info.value) * 10) / 10) + ' rows for each).', 'इससे ' + fmtN(S.info.value) + ' पंक्तियाँ बनेंगी (' + fmtN(cur.rows) + ' में से, हर एक की औसतन ' + (Math.round(cur.rows / Math.max(1, S.info.value) * 10) / 10) + ' पंक्तियाँ)।') : T('Counting…', 'गिन रहे हैं…')) + '</div>' +
      '<div class="prj-sub">' + T('Work out, for each one', 'हर एक के लिए निकालें') + '</div><div id="smLines">' +
      S.lines.map(function (l, i) { return '<div class="prj-row" style="gap:8px;align-items:center;margin:3px 0"><input type="checkbox" class="smOn" data-i="' + i + '"' + (l.on ? ' checked' : '') + '><span style="flex:1">' + esc(lineText(S, l)) + '</span><input class="big-input smNm" data-i="' + i + '" value="' + esc(l.name || defName(S, l)) + '" style="width:200px" title="' + esc(T('Heading of the new column', 'नए कॉलम का शीर्षक')) + '"><button class="tb-btn smDel" data-i="' + i + '" aria-label="remove">✕</button></div>'; }).join('') + '</div>' +
      '<div class="prj-sub" style="margin-top:10px">' + T('Add a line', 'एक और पंक्ति जोड़ें') + '</div><div class="fr-form"><label class="rp-field"><span>' + T('What', 'क्या') + '</span><select id="smF" class="big-select">' + Object.keys(FNW).filter(function (k) { return k !== 'count'; }).map(function (k) { return '<option value="' + k + '"' + (A.fn === k ? ' selected' : '') + '>' + esc(T(FNW[k][0], FNW[k][1])) + '</option>'; }).join('') + '</select></label>' +
      '<label class="rp-field"><span>' + T('Column', 'कॉलम') + '</span><select id="smC" class="big-select"><option value="-1">—</option>' + h.map(function (x, i) { return i === S.key ? '' : opt(i, A.col); }).join('') + '</select></label></div>';
    if (NEEDVAL[A.fn] && A.col >= 0) {
      var v = S.vals[A.col]; html += '<div class="prj-sub">' + T('Which values count? (tick one or more)', 'कौन-से मान गिनें? (एक या अधिक चुनें)') + '</div>' + (v ? '<div style="display:flex;flex-wrap:wrap;gap:4px 14px;max-height:120px;overflow:auto">' + v.values.map(function (x) { return '<label style="white-space:nowrap"><input type="checkbox" class="smV" data-v="' + esc(x[0]) + '"' + (A.values[x[0]] ? ' checked' : '') + '> ' + esc(x[0]) + ' <small>(' + fmtN(x[1]) + ')</small></label>'; }).join('') + '</div>' + (v.distinct > v.values.length ? '<small>' + T('The commonest ' + v.values.length + ' of ' + fmtN(v.distinct) + ' values are shown.', fmtN(v.distinct) + ' में से सबसे आम ' + v.values.length + ' मान दिखाए गए।') + '</small>' : '') : '<div class="big-note">' + T('Loading the values…', 'मान लोड हो रहे हैं…') + '</div>');
    }
    html += '<div class="prj-row" style="margin-top:6px"><button class="tb-btn" id="smAdd">➕ ' + T('Add this line', 'यह पंक्ति जोड़ें') + '</button></div>' +
      '<div class="prj-row" style="justify-content:flex-end;margin-top:12px"><button class="tb-btn" id="smCancel">' + T('Cancel', 'रद्द करें') + '</button><button class="tb-btn primary" id="smGo">' + T('Make the new table', 'नई तालिका बनाएँ') + '</button></div>';
    var o = U.overlay('sumDialog', html, true); o.querySelector('.stl-box').classList.add('fr-box');
    $('smX').onclick = $('smCancel').onclick = function () { closeSum(S); };
    $('smK').onchange = function () { S.key = +$('smK').value; S.lines.forEach(function (l) { if (l.col === S.key) l.on = false; }); count(S); draw2(S); };
    o.querySelectorAll('.smOn').forEach(function (c) { c.onchange = function () { S.lines[+c.dataset.i].on = c.checked; }; });
    o.querySelectorAll('.smNm').forEach(function (c) { c.onchange = function () { S.lines[+c.dataset.i].name = c.value.trim(); }; });
    o.querySelectorAll('.smDel').forEach(function (c) { c.onclick = function () { S.lines.splice(+c.dataset.i, 1); draw2(S); }; });
    $('smF').onchange = function () { A.fn = $('smF').value; A.values = {}; draw2(S); };
    $('smC').onchange = function () { A.col = +$('smC').value; A.values = {}; if (A.col >= 0 && NEEDVAL[A.fn] && !S.vals[A.col]) loadVals(S, A.col); draw2(S); };
    o.querySelectorAll('.smV').forEach(function (c) { c.onchange = function () { A.values[c.dataset.v] = c.checked; }; });
    if (NEEDVAL[A.fn] && A.col >= 0 && !S.vals[A.col]) loadVals(S, A.col);
    $('smAdd').onclick = function () {
      if (A.col < 0) { toast(T('Choose a column.', 'कॉलम चुनें।'), 'info'); return; }
      var ln = { fn: A.fn, col: A.col, on: true }; if (NEEDVAL[A.fn]) { ln.values = Object.keys(A.values).filter(function (k) { return A.values[k]; }); if (!ln.values.length) { toast(T('Tick at least one value.', 'कम से कम एक मान चुनें।'), 'info'); return; } }
      ln.name = defName(S, ln); S.lines.push(ln); A.values = {}; draw2(S);
    };
    $('smGo').onclick = function () { goSum(S); };
  }
  function loadVals(S, col) { api('/api/engine/' + S.cur.id + '/chart', { kind: 'values', cols: [col] }).then(function (r) { S.vals[col] = r.values[String(col)] || { distinct: 0, values: [] }; if ($('sumDialog') && S.add.col === col) draw2(S); }).catch(function () {}); }
  function goSum(S) {
    var outs = S.lines.filter(function (l) { return l.on; }).map(function (l) { return { fn: l.fn, col: l.col, values: l.values, name: l.name || defName(S, l) }; });
    if (!outs.length) { toast(T('Tick at least one line.', 'कम से कम एक पंक्ति चुनें।'), 'info'); return; }
    var scope = big() && STL.bigCharts ? STL.bigCharts.scope() : {};
    var o = $('sumDialog'); if (o) o.remove(); U.busy(T('Making one row for each…', 'हर एक की पंक्ति बनाई जा रही है…'));
    var nm = S.cur.name + ' — ' + T('one row for each ', 'हर एक की पंक्ति: ') + S.cur.headers[S.key];
    api('/api/engine/' + S.cur.id + '/summarize', Object.assign({ key: S.key, outs: outs, name: nm }, scope)).then(function (info) {
      openResult(info, nm, { en: 'One row for each', hi: 'हर एक की एक पंक्ति' }, { en: S.cur.headers[S.key] + ': ' + fmtN(info.rows) + ' rows from ' + fmtN(S.cur.rows) + '; ' + outs.map(function (x) { return x.name; }).join(', '), hi: S.cur.headers[S.key] + ': ' + fmtN(info.rows) + ' पंक्तियाँ' }, [S.cur]);
    }).catch(function (e) { U.busy(null); toast(e.message, 'error'); draw2(S); });
  }

  // ================================================================= placeholder codes → blank
  // "365243 days employed" is a code for "not employed", not a value: one click turns it into an empty cell (in a copy inside the engine)
  STL.blankValue = function (col, value) {
    if (!big()) {                                                                    // a file in the editor: done right here
      var v = String(value).trim(), n = 0, rows = rawData.map(function (r) { var c = r.slice(); if (String(c[col] == null ? '' : c[col]).trim() === v) { c[col] = ''; n++; } return c; });
      U.loadGrid([headers.slice()].concat(rows)); STL.logStep && STL.logStep('blank', { en: 'Placeholder turned into blank', hi: 'कोड खाली किया' }, { en: headers[col] + ': ' + fmtN(n) + ' cells holding ' + v + ' are now empty', hi: headers[col] + ': ' + fmtN(n) + ' खाली' }, { col: headers[col], value: v });
      toast(T(fmtN(n) + ' cells holding ' + v + ' are now empty.', fmtN(n) + ' कोशिकाएँ खाली कर दी गईं।'), 'success'); return Promise.resolve();
    }
    U.busy(T('Making the code empty…', 'कोड खाली किया जा रहा है…'));
    return currentTable().then(function (cur) {
      return api('/api/engine/' + cur.id + '/replace', { col: col, old: String(value), 'new': '', name: cur.name }).then(function (info) {
        openResult(info, cur.name, { en: 'Placeholder turned into blank', hi: 'कोड खाली किया' }, { en: cur.headers[col] + ': ' + fmtN(info.changed) + ' cells holding ' + value + ' are now empty', hi: cur.headers[col] + ': ' + fmtN(info.changed) + ' खाली' }, cur.own ? [cur] : []);
      });
    }).catch(function (e) { U.busy(null); toast(e.message, 'error'); });
  };

  (STL.actions || []).push({ en: 'Link two files by a shared column (ID)', hi: 'साझा कॉलम (ID) से दो फ़ाइलें जोड़ें', kw: 'link join lookup vlookup merge two files by id key match columns bring columns another file jodo', run: function () { STL.openLink(); }, group: 'File' });
  (STL.actions || []).push({ en: 'One row for each person / ID (summarise a long file)', hi: 'हर व्यक्ति / ID की एक पंक्ति (लंबी फ़ाइल का सार)', kw: 'summarise summarize one row per person id group rows monthly history count late ever per customer aggregate roll up', run: function () { STL.openSummary(); }, group: 'Analyse' });
  STL.extraTiles = STL.extraTiles || [];
  STL.extraTiles.push(['🔗', 'Link two files', 'दो फ़ाइलें जोड़ें', 'Match by ID, bring columns across', 'ID से मिलाएँ, कॉलम लाएँ', function () { STL.openLink(); }]);
  STL.extraTiles.push(['🧮', 'One row per person', 'हर व्यक्ति की एक पंक्ति', 'Many rows for one ID → one row', 'एक ID की कई पंक्तियाँ → एक', function () { if (!U.hasData() && !(root.BIG && BIG.active)) { toast(T('Open a file first', 'पहले फ़ाइल खोलें'), 'info'); return; } STL.openSummary(); }]);
})(typeof window !== 'undefined' ? window : globalThis);
