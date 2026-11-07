// =====================================================================
//  WORDS IN A TEXT COLUMN  /  टेक्स्ट कॉलम के शब्द        and        REPEATS AND CONFLICTS  /  दोहराव और टकराव
//  A column of free text (complaints, remarks, reviews, messages) is read by every row:
//    1. Words: the commonest words, and (with a column of groups such as a label) the words that stand out for each group:
//       "of the rows labelled Fear, 'anxious' is in 4.3%, against 0.5% of all rows — 8 times as often".
//    2. Repeats: how many texts are entered more than once, and in how many of them another column (the label) is NOT the same.
//  Both run in the engine on a large file and on an open file alike. No word list is sent anywhere.
//    STL.textTools.pickText(headers, profileCols) -> index of the column that most looks like free text
//    STL.textTools.pickGroup(headers, profileCols, textCol) -> index of a column worth comparing words by, or -1
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL = root.STL || {}, X = STL.textTools = {};
  var TEXTNAME = /text|comment|remark|description|feedback|complaint|message|note|review|reason|grievance|query|detail|subject|summary|body|tweet|post|टिप्पणी|शिकायत|विवरण|कारण|संदेश/i;
  var GROUPNAME = /label|class|category|emotion|sentiment|status|type|outcome|result|target|stage|department|block|district|priority|rating|विभाग|श्रेणी|स्थिति|प्रकार/i;
  X.pickText = function (headers, cols) {
    var best = -1, sc = -1;
    cols.forEach(function (c, i) {
      if (c.type === 'number') return; var s = (TEXTNAME.test(String(headers[i])) ? 1000 : 0) + (c.distinct || 0) / Math.max(1, (cols.rows || 1)) * 100 + Math.min(c.distinct || 0, 1e6) / 1e6; if (c.type === 'text') s += 50; if (s > sc && (c.distinct || 0) > 20) { sc = s; best = i; }
    });
    return best;
  };
  X.pickGroup = function (headers, cols, textCol) {
    var best = -1, sc = -1;
    cols.forEach(function (c, i) {
      if (i === textCol || c.distinct < 2 || c.distinct > 30) return; var s = (GROUPNAME.test(String(headers[i])) ? 10 : 0) + (c.type === 'number' ? 0 : 3) - c.distinct / 100; if (s > sc) { sc = s; best = i; }
    });
    return best;
  };
})(typeof window !== 'undefined' ? window : globalThis);

(function (root) {
  'use strict';
  var STL = root.STL, X = STL.textTools;
  if (!root.document || !STL.ui || !STL.engineTable) return;
  var U = STL.ui, T = U.T, esc = U.esc, ET = STL.engineTable;
  function $(id) { return document.getElementById(id); }
  function f(n) { return Number(n).toLocaleString('en-IN'); }
  function pc(x) { return (x < 0.001 ? Math.round(x * 10000) / 100 : Math.round(x * 1000) / 10) + '%'; }
  function big() { return !!(root.BIG && BIG.active); }
  function scope() { return big() && STL.bigCharts ? STL.bigCharts.scope() : {}; }

  // ================================================================= words
  STL.openWords = function (preset) {
    U.busy(T('Preparing…', 'तैयारी…'));
    ET.current().then(function (cur) {
      return ET.get('/api/engine/' + cur.id + '/profile').then(function (p) {
        U.busy(null); p.columns.rows = p.rows; var tc = preset && preset.text >= 0 ? preset.text : X.pickText(cur.headers, p.columns);
        if (tc < 0) { ET.drop(cur); toast(T('This file has no column of free text.', 'इस फ़ाइल में खुले टेक्स्ट का कोई कॉलम नहीं है।'), 'info'); return; }
        var S = { cur: cur, cols: p.columns, text: tc, by: preset && preset.by !== undefined ? preset.by : X.pickGroup(cur.headers, p.columns, tc), ignore: true, res: null, err: '', seq: 0 };
        drawW(S); runW(S);
      });
    }).catch(function (e) { U.busy(null); if (e.message) toast(e.message, 'info'); });
  };
  function runW(S) {
    var seq = ++S.seq; S.res = null; S.err = ''; draw2(S);
    ET.api('/api/engine/' + S.cur.id + '/words', Object.assign({ col: S.text, by: S.by, top: 25, stand: 12, ignoreCommon: S.ignore }, scope())).then(function (r) { if (seq !== S.seq) return; S.res = r; draw2(S); }).catch(function (e) { if (seq !== S.seq) return; S.err = e.message; draw2(S); });
  }
  function closeW(S) { var o = $('wordsDialog'); if (o) o.remove(); ET.drop(S.cur); }
  function drawW(S) {
    var h = S.cur.headers, opt = function (i, sel) { return '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + esc(h[i]) + '</option>'; };
    var html = '<div class="prj-h"><b>📝 ' + T('Words in a text column', 'टेक्स्ट कॉलम के शब्द') + '</b><button id="wdX" aria-label="close">×</button></div>' +
      '<div class="big-note">' + T('Which words the text uses, and which words stand out for each group (for example for each label). Every row is read; a word is counted once per row.', 'टेक्स्ट में कौन-से शब्द हैं, और हर समूह (जैसे हर लेबल) के लिए कौन-से शब्द अलग दिखते हैं। हर पंक्ति पढ़ी जाती है; एक पंक्ति में शब्द एक बार गिना जाता है।') + '</div>' +
      '<div class="fr-form"><label class="rp-field"><span>' + T('Text column', 'टेक्स्ट कॉलम') + '</span><select id="wdT" class="big-select">' + h.map(function (x, i) { return opt(i, S.text); }).join('') + '</select></label>' +
      '<label class="rp-field"><span>' + T('Compare words between groups of', 'शब्दों की तुलना इन समूहों में') + '</span><select id="wdB" class="big-select"><option value="-1"' + (S.by < 0 ? ' selected' : '') + '>' + esc(T('— nothing —', '— कुछ नहीं —')) + '</option>' + h.map(function (x, i) { return i === S.text ? '' : opt(i, S.by); }).join('') + '</select></label></div>' +
      '<label class="rp-inline" style="margin:6px 0"><input type="checkbox" id="wdS"' + (S.ignore ? ' checked' : '') + '> ' + T('Ignore very common words (the, and, is, my …)', 'बहुत आम शब्द छोड़ें (the, and, is, my …)') + '</label><div id="wdOut"></div>';
    var o = U.overlay('wordsDialog', html, true); o.querySelector('.stl-box').classList.add('fr-box');
    $('wdX').onclick = function () { closeW(S); };
    $('wdT').onchange = function () { S.text = +this.value; if (S.by === S.text) S.by = -1; drawW(S); runW(S); };
    $('wdB').onchange = function () { S.by = +this.value; runW(S); };
    $('wdS').onchange = function () { S.ignore = this.checked; runW(S); };
  }
  function draw2(S) {
    var out = $('wdOut'); if (!out) return;
    if (S.err) { out.innerHTML = '<div class="big-err">' + esc(S.err) + '</div>'; return; }
    if (!S.res) { out.innerHTML = '<div class="big-note">' + T('Reading every row…', 'हर पंक्ति पढ़ी जा रही है…') + '</div>'; return; }
    var r = S.res, G = r.groups.map(function (g) { return g.g; }), grouped = S.by >= 0 && G.length > 1, h = S.cur.headers;
    var html = '<div class="big-note">' + T(f(r.n) + ' rows read, ' + f(r.distinct_words) + ' different words.', f(r.n) + ' पंक्तियाँ पढ़ीं, ' + f(r.distinct_words) + ' अलग शब्द।') + '</div>';
    if (grouped) {
      html += '<div class="prj-sub">' + T('Words that stand out for each “' + esc(h[S.by]) + '” (share of that group’s rows, and how many times more often than in all rows)', 'हर “' + esc(h[S.by]) + '” के लिए अलग दिखने वाले शब्द (उस समूह की पंक्तियों का हिस्सा, और सभी पंक्तियों से कितनी गुना अधिक)') + '</div><div style="display:flex;flex-wrap:wrap;gap:10px">' +
        r.groups.map(function (g) {
          var L = r.standout[g.g] || [];
          return '<div style="flex:1 1 260px;min-width:240px"><b>' + esc(g.g) + '</b> <small>(' + f(g.n) + ' ' + T('rows', 'पंक्तियाँ') + ', ' + pc(g.n / r.n) + ')</small><table class="big-tbl">' + (L.length ? L.map(function (x) { return '<tr><td>' + esc(x.w) + '</td><td class="num">' + pc(x.share) + '</td><td class="num">×' + (Math.round(x.lift * 10) / 10) + '</td></tr>'; }).join('') : '<tr><td><em>' + T('no word stands out', 'कोई शब्द अलग नहीं दिखता') + '</em></td></tr>') + '</table></div>';
        }).join('') + '</div>';
    }
    html += '<div class="prj-sub" style="margin-top:10px">' + T('Commonest words (rows that contain the word)', 'सबसे आम शब्द (शब्द वाली पंक्तियाँ)') + '</div><table class="big-tbl"><tr><th>' + T('Word', 'शब्द') + '</th><th>' + T('Rows', 'पंक्तियाँ') + '</th><th>%</th>' + (grouped ? G.map(function (g) { return '<th>' + esc(g) + '</th>'; }).join('') : '') + '</tr>' +
      r.common.map(function (x) { return '<tr><td>' + esc(x.w) + '</td><td class="num">' + f(x.rows) + '</td><td class="num">' + pc(x.rows / r.n) + '</td>' + (grouped ? r.groups.map(function (g) { return '<td class="num">' + pc((x.by[g.g] || 0) / g.n) + '</td>'; }).join('') : '') + '</tr>'; }).join('') + '</table>' +
      '<div class="big-note">' + T('This shows words that go with a group, not that they cause it. A word that appears in 10 rows is not shown as standing out.', 'यह दिखाता है कि कौन-से शब्द किसी समूह के साथ आते हैं, यह नहीं कि वे उसका कारण हैं। 10 पंक्तियों में आने वाला शब्द “अलग दिखने वाला” नहीं माना जाता।') + '</div>';
    html += '<div class="prj-row" style="margin-top:8px"><button class="tb-btn" id="wdLen">➕ ' + T('Add the length and the number of words as columns', 'लंबाई और शब्दों की संख्या कॉलम के रूप में जोड़ें') + '</button></div>';
    out.innerHTML = html;
    $('wdLen').onclick = function () {
      var nm = S.cur.name, col = S.text, cur = S.cur; var o = $('wordsDialog'); if (o) o.remove(); U.busy(T('Adding the columns…', 'कॉलम जोड़े जा रहे हैं…'));
      ET.api('/api/engine/' + cur.id + '/textstats', { col: col, name: nm }).then(function (info) { ET.open(info, nm, { en: 'Text length and words added', hi: 'लंबाई और शब्द जोड़े' }, { en: cur.headers[col] + ': characters and words', hi: cur.headers[col] }, [cur]); }).catch(function (e) { U.busy(null); toast(e.message, 'error'); });
    };
  }

  // ================================================================= repeats and conflicts
  STL.openRepeats = function (preset) {
    U.busy(T('Preparing…', 'तैयारी…'));
    ET.current().then(function (cur) {
      return ET.get('/api/engine/' + cur.id + '/profile').then(function (p) {
        U.busy(null); p.columns.rows = p.rows; var tc = preset && preset.key >= 0 ? preset.key : X.pickText(cur.headers, p.columns); if (tc < 0) tc = 0;
        var S = { cur: cur, cols: p.columns, key: tc, check: preset && preset.check !== undefined ? preset.check : X.pickGroup(cur.headers, p.columns, tc), res: null, err: '', seq: 0 };
        drawR(S); runR(S);
      });
    }).catch(function (e) { U.busy(null); if (e.message) toast(e.message, 'info'); });
  };
  function runR(S) {
    var seq = ++S.seq; S.res = null; S.err = ''; fillR(S);
    ET.api('/api/engine/' + S.cur.id + '/repeats', Object.assign({ key: [S.key], check: S.check, examples: 8 }, scope())).then(function (r) { if (seq !== S.seq) return; S.res = r; fillR(S); }).catch(function (e) { if (seq !== S.seq) return; S.err = e.message; fillR(S); });
  }
  function closeR(S) { var o = $('repDialog'); if (o) o.remove(); ET.drop(S.cur); }
  function drawR(S) {
    var h = S.cur.headers, opt = function (i, sel) { return '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + esc(h[i]) + '</option>'; };
    var html = '<div class="prj-h"><b>♻ ' + T('Repeated values and conflicts', 'दोहराए गए मान और टकराव') + '</b><button id="rpX" aria-label="close">×</button></div>' +
      '<div class="big-note">' + T('How many values of a column are entered more than once — and whether another column (for example the label) says the same thing every time. Capitals and spaces are ignored.', 'किसी कॉलम के कितने मान एक से अधिक बार दर्ज हैं — और क्या दूसरा कॉलम (जैसे लेबल) हर बार वही कहता है। अक्षर-रूप और खाली स्थान नज़रअंदाज़ किए जाते हैं।') + '</div>' +
      '<div class="fr-form"><label class="rp-field"><span>' + T('Look for repeats in', 'दोहराव इसमें खोजें') + '</span><select id="rpK" class="big-select">' + h.map(function (x, i) { return opt(i, S.key); }).join('') + '</select></label>' +
      '<label class="rp-field"><span>' + T('and check that this column agrees', 'और जाँचें कि यह कॉलम एकमत है') + '</span><select id="rpC" class="big-select"><option value="-1"' + (S.check < 0 ? ' selected' : '') + '>' + esc(T('— nothing —', '— कुछ नहीं —')) + '</option>' + h.map(function (x, i) { return i === S.key ? '' : opt(i, S.check); }).join('') + '</select></label></div><div id="rpOut"></div>';
    var o = U.overlay('repDialog', html, true); o.querySelector('.stl-box').classList.add('fr-box');
    $('rpX').onclick = function () { closeR(S); };
    $('rpK').onchange = function () { S.key = +this.value; if (S.check === S.key) S.check = -1; drawR(S); runR(S); };
    $('rpC').onchange = function () { S.check = +this.value; runR(S); };
  }
  function fillR(S) {
    var out = $('rpOut'); if (!out) return;
    if (S.err) { out.innerHTML = '<div class="big-err">' + esc(S.err) + '</div>'; return; }
    if (!S.res) { out.innerHTML = '<div class="big-note">' + T('Checking every row…', 'हर पंक्ति जाँची जा रही है…') + '</div>'; return; }
    var r = S.res, h = S.cur.headers, html = '';
    if (!r.repeated_values) html = '<div class="big-note" style="border-color:#14a38b">' + T('No value of “' + esc(h[S.key]) + '” is entered twice (' + f(r.values) + ' different values in ' + f(r.rows) + ' rows).', '“' + esc(h[S.key]) + '” का कोई मान दो बार दर्ज नहीं है (' + f(r.rows) + ' पंक्तियों में ' + f(r.values) + ' अलग मान)।') + '</div>';
    else {
      html = '<div class="big-note" style="border-color:#d68910"><div><b>' + f(r.repeated_values) + '</b> ' + T('different values of “' + esc(h[S.key]) + '” appear more than once: ' + f(r.rows_in_repeats) + ' rows (' + pc(r.rows_in_repeats / r.rows) + '), so ' + f(r.extra_copies) + ' rows are extra copies.', 'अलग मान “' + esc(h[S.key]) + '” में एक से अधिक बार आते हैं: ' + f(r.rows_in_repeats) + ' पंक्तियाँ (' + pc(r.rows_in_repeats / r.rows) + '), यानी ' + f(r.extra_copies) + ' पंक्तियाँ अतिरिक्त प्रतियाँ हैं।') + '</div>';
      if (S.check >= 0) html += '<div style="margin-top:6px">' + (r.conflicting_values ? '⚠ <b>' + f(r.conflicting_values) + '</b> ' + T('of those repeated values have different “' + esc(h[S.check]) + '” in different rows (' + f(r.rows_in_conflicts) + ' rows). The same text is given different answers.', 'दोहराए गए मानों में “' + esc(h[S.check]) + '” अलग-अलग पंक्तियों में अलग है (' + f(r.rows_in_conflicts) + ' पंक्तियाँ)। एक ही टेक्स्ट को अलग-अलग उत्तर मिले हैं।') : '✔ ' + T('every repeated value has the same “' + esc(h[S.check]) + '” each time.', 'हर दोहराए गए मान में “' + esc(h[S.check]) + '” हर बार वही है।')) + '</div>';
      html += '</div>';
      if (r.examples && r.examples.length) html += '<div class="prj-sub">' + T('Examples of conflicts', 'टकराव के उदाहरण') + '</div><table class="big-tbl"><tr><th>' + esc(h[S.key]) + '</th><th>' + T('Rows', 'पंक्तियाँ') + '</th><th>' + esc(h[S.check]) + '</th></tr>' + r.examples.map(function (e) { return '<tr><td>' + esc(e.key) + '</td><td class="num">' + f(e.rows) + '</td><td>' + esc(e.values.join(', ')) + '</td></tr>'; }).join('') + '</table>';
    }
    out.innerHTML = html;
  }

  (STL.actions || []).push({ en: 'Words in a text column (commonest, and by group)', hi: 'टेक्स्ट कॉलम के शब्द (आम शब्द, समूह अनुसार)', kw: 'words text column word count frequency commonest keywords comments remarks complaints feedback reviews sentiment label shabd', run: function () { STL.openWords(); }, group: 'Analyse' });
  (STL.actions || []).push({ en: 'Repeated values and conflicts (same text, different label)', hi: 'दोहराए गए मान और टकराव (एक ही टेक्स्ट, अलग लेबल)', kw: 'repeat repeated duplicate same text entered twice conflict different label disagree inconsistent', run: function () { STL.openRepeats(); }, group: 'Clean' });
  STL.extraTiles = STL.extraTiles || [];
  STL.extraTiles.push(['📝', 'Words in text', 'टेक्स्ट के शब्द', 'Which words go with which group', 'कौन-से शब्द किस समूह के साथ', function () { if (!U.hasData() && !big()) { toast(T('Open a file first', 'पहले फ़ाइल खोलें'), 'info'); return; } STL.openWords(); }]);
})(typeof window !== 'undefined' ? window : globalThis);
