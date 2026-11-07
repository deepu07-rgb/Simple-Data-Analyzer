// =====================================================================
//  SAME THING, DIFFERENT SPELLING  /  एक ही चीज़, अलग वर्तनी
//  "Kishangarh", "KISHANGARH", "Kishan Garh", "Kishangrah " are one block; "Shri R.K. Choudhary" and "R K Chaudhary" are one
//  officer. This finds such groups of values in a column and lets the user pick one spelling for each group.
//  Rule-based and explainable, nothing is merged without a tick:
//    format   - same after ignoring capitals, spaces, dots, titles (Shri, Dr.) and words like "Dept."      (safe, pre-ticked)
//    spelling - one or two letters different, and the odd spelling is much rarer than the common one      (pre-ticked)
//    part     - one value is a part of the other ("Revenue" / "Revenue (Land)"), or the words are re-ordered   (to check)
//    script   - the same word in Hindi and in English ("कमला लोढ़ा" / "Kamla Lodha", "ब्यावर" / "Beawar")       (pre-ticked)
//    meaning  - a different word for the same thing ("Closed" / "Disposed", "लंबित" / "Pending")             (to check; pre-ticked once you taught it)
//    acronym  - "PWD" / "Public Works (Roads)";  initials - "M. Joshi" / "Mahesh Joshi" (never when two people fit) (to check)
//    STL.values.groups(values)            -> [{ canonical, kind, n, variants: [{ v, n }] }]    (groups with 2+ spellings)
//    STL.values.apply(rows, col, mapping) -> number of cells changed (mapping: { oldValue: newValue })
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL = root.STL || {}, V = STL.values = {};
  function s(v) { return v == null ? '' : String(v); }

  var HONOR = /^(shri|sh|smt|mr|mrs|ms|dr|श्री|श्रीमती|डॉ)\b\.?\s*/i, STOP = { dept: 1, department: 1, office: 1, the: 1, of: 1, and: 1, ka: 1, ki: 1, ko: 1 };
  V.key = function (v) {
    var t = s(v); if (t.normalize) t = t.normalize('NFC');
    t = t.replace(/[​-‍﻿]/g, '').toLowerCase().trim().replace(HONOR, '');
    t = t.replace(/&/g, ' and ').replace(/[._,;:()\[\]\/\\\-–—'"`’]+/g, ' ').replace(/\s+/g, ' ').trim();
    return t.split(' ').filter(function (w) { return w && !STOP[w]; }).join(' ');
  };
  function sortedKey(k) { return k.split(' ').sort().join(' '); }
  function lev(a, b, max) {
    if (a === b) return 0; if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = [], cur = [], i, j; for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) { cur[0] = i; var lo = cur[0]; for (j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (cur[j] < lo) lo = cur[j]; } if (lo > max) return max + 1; var t = prev; prev = cur; cur = t; }
    return prev[b.length];
  }
  function toks(k) { return k.split(' ').filter(Boolean); }

  V.WEAK = { part: 1, meaning: 1, acronym: 1, initials: 1 };                                         // kinds that must be checked by a person
  function topOf(g) { var b = g.variants[0]; g.variants.forEach(function (x) { if (x.n > b.n) b = x; }); return b.v; }
  // values: array of cell values -> groups of two or more spellings
  V.groups = function (values, opt) {
    opt = opt || {}; var counts = {}, order = [], total = 0;
    (values || []).forEach(function (v) { var t = s(v); if (t.trim() === '') return; total++; if (!(t in counts)) { counts[t] = 0; order.push(t); } counts[t]++; });
    var byKey = {}, keys = [];
    order.forEach(function (v) { var k = V.key(v); if (!k) k = v.trim().toLowerCase(); if (!byKey[k]) { byKey[k] = { key: k, variants: [], n: 0, kind: 'format' }; keys.push(k); } byKey[k].variants.push({ v: v, n: counts[v] }); byKey[k].n += counts[v]; });
    var G = keys.map(function (k) { return byKey[k]; });
    // merge groups of nearly the same value (only when the column has a manageable number of different values)
    var parent = G.map(function (_, i) { return i; }), why = {};
    function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
    function join(a, b, kind) {
      a = find(a); b = find(b); if (a === b) return; if (G[a].n < G[b].n) { var t = a; a = b; b = t; } parent[b] = a;
      var ka = why[a], kb = why[b], ks = [ka, kb, kind].filter(Boolean), weak = ks.filter(function (k) { return V.WEAK[k]; });
      why[a] = weak.length ? weak[weak.length - 1] : (ks.indexOf('script') >= 0 ? 'script' : ks.indexOf('learned') >= 0 ? 'learned' : (ks.indexOf('spelling') >= 0 ? 'spelling' : kind));
    }
    var cand = [];
    if (G.length <= (opt.maxDistinct || 600)) {
      var sk = G.map(function (g) { return sortedKey(g.key); }), tk = G.map(function (g) { return toks(g.key); }), LX = STL.lex;
      var top = G.map(topOf), dev = G.map(function (g, i) { return LX ? LX.isDev(top[i]) : false; }), cc = G.map(function (g) { return LX ? LX.concept(g.key) : g.key; }),
          lrn = G.map(function (g) { return LX && LX.learned ? LX.learned(g.key) !== undefined : false; }), ini = G.map(function (g, i) { return tk[i].some(function (w) { return w.length === 1; }); }),
          skl = G.map(function (g, i) { return LX && g.key.length >= 3 ? LX.skeleton(top[i]).filter(function (w) { return w.length >= 2; }) : []; });
      for (var i = 0; i < G.length; i++) for (var j = i + 1; j < G.length; j++) {
        var a = G[i], b = G[j], big = Math.max(a.n, b.n), small = Math.min(a.n, b.n), ratio = small / big;
        if (sk[i] === sk[j]) { join(i, j, 'part'); continue; }                                         // the same words in another order
        if (LX) {
          if (dev[i] !== dev[j] && LX.scriptPair(top[i], top[j])) { join(i, j, 'script'); continue; }   // Hindi / English
          if (cc[i] === cc[j] && a.key !== b.key) { join(i, j, lrn[i] || lrn[j] ? 'learned' : 'meaning'); continue; }
          if ((LX.acronymOf(top[i], top[j]) || LX.acronymOf(top[j], top[i])) && G.length <= 200) { cand.push([i, j, 'acronym', LX.acronymOf(top[i], top[j]) ? i : j]); continue; }
          if ((ini[i] || ini[j]) && skl[i].length && skl[j].length && skl[i].some(function (w) { return skl[j].indexOf(w) >= 0; }) && LX.sameName(top[i], top[j])) { cand.push([i, j, 'initials', ini[i] ? i : j]); continue; }
        }
        var la = a.key.length, lb = b.key.length, mn = Math.min(la, lb);
        var maxD = mn >= 10 ? 2 : ((mn >= 6 && ratio <= 0.12) || (mn >= 5 && ratio <= 0.05) ? 2 : 1), dist = mn >= 5 ? lev(a.key, b.key, maxD) : 9;                    // a typo is much rarer than the right spelling
        if (mn >= 5 && ((dist <= maxD && ratio <= 0.15) || (dist === 1 && mn >= 8 && ratio <= 0.35))) { join(i, j, 'spelling'); continue; }      // one letter in a long word is a typo even when it is common
        if (mn >= 5 && ratio <= 0.15 && lev(sk[i], sk[j], maxD) <= maxD) { join(i, j, 'spelling'); continue; }
        var shortK = la <= lb ? a.key : b.key, longK = la <= lb ? b.key : a.key;
        if (shortK.length >= 5 && longK.length - shortK.length <= 3 && longK.indexOf(shortK) === 0 && ratio <= 0.35 && shortK.indexOf(' ') < 0 && longK.indexOf(' ') < 0) { join(i, j, 'spelling'); continue; }   // "Reject" / "Rejected"
        var ta = tk[i], tb = tk[j], sh = ta.length <= tb.length ? ta : tb, lo = ta.length <= tb.length ? tb : ta;                  // one is a part of the other
        if (sh.length < lo.length && sh.length >= 1 && sh.join('').length >= 3 && ratio <= 0.35 && sh.every(function (w) { return lo.indexOf(w) >= 0; })) join(i, j, 'part');
      }
    }
    var asShort = {}; cand.forEach(function (c) { (asShort[c[3]] = asShort[c[3]] || []).push(c); });          // "A. Sharma" fits both Anil and Ashok Sharma: join neither
    Object.keys(asShort).forEach(function (sIdx) {                                                    // the other side must be ONE value after the groups found so far (Anil Sharma + Anil Kumar Sharma = one)
      var list = asShort[sIdx], others = {}; list.forEach(function (c) { others[find(c[0] === +sIdx ? c[1] : c[0])] = 1; });
      if (Object.keys(others).length === 1) list.forEach(function (c) { join(c[0], c[1], c[2]); });
    });
    var merged = {};
    G.forEach(function (g, i) { var r = find(i); if (!merged[r]) merged[r] = { variants: [], n: 0, kind: why[r] || 'format' }; g.variants.forEach(function (x) { merged[r].variants.push(x); }); merged[r].n += g.n; });
    var out = [];
    Object.keys(merged).forEach(function (r) {
      var m = merged[r]; if (m.variants.length < 2) return;
      m.variants.sort(function (x, y) { return y.n - x.n || (/[A-Z]/.test(y.v) && /[a-z]/.test(y.v) ? 1 : 0) - (/[A-Z]/.test(x.v) && /[a-z]/.test(x.v) ? 1 : 0) || x.v.localeCompare(y.v); });
      var distinctKeys = {}; m.variants.forEach(function (x) { distinctKeys[V.key(x.v)] = 1; });
      m.canonical = m.variants[0].v.replace(/\s+/g, ' ').trim();
      if (Object.keys(distinctKeys).length === 1) m.kind = 'format';
      if (m.kind === 'learned') m.kind = 'meaning', m.learned = true;
      out.push(m);
    });
    out.sort(function (x, y) { return y.n - x.n; });
    return out;
  };

  // mapping { old: new } onto one column of rows (in place); returns how many cells changed
  V.apply = function (rows, col, mapping) {
    var n = 0; rows.forEach(function (r) { var v = s(r[col]); if (Object.prototype.hasOwnProperty.call(mapping, v) && mapping[v] !== v) { r[col] = mapping[v]; n++; } });
    return n;
  };
  // a mapping from groups: every variant -> the chosen spelling
  V.mappingOf = function (groups, chosen) {
    var map = {}; groups.forEach(function (g, i) { if (chosen && chosen[i] === false) return; var to = (chosen && chosen[i] && chosen[i] !== true) ? chosen[i] : g.canonical; g.variants.forEach(function (x) { if (x.v !== to) map[x.v] = to; }); });
    return map;
  };
})(typeof window !== 'undefined' ? window : globalThis);

// =====================================================================
//  The screen
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL, V = STL.values;
  if (!root.document || !STL.ui) return;
  var U = STL.ui, T = U.T, esc = U.esc, fmt = U.fmt;
  function $(id) { return document.getElementById(id); }
  var ST = null;

  STL.openValueGroups = function (preCol) {
    if (root.BIG && BIG.active) { toast(T('This works on the editor. Use "Work on a copy" first.', 'यह संपादक में चलता है। पहले "प्रति पर काम करें" दबाएँ।'), 'info'); return; }
    if (!U.hasData()) { toast(T('Open a file first', 'पहले फ़ाइल खोलें'), 'info'); return; }
    U.busy(T('Looking for different spellings…', 'अलग वर्तनी खोजी जा रही है…'));
    setTimeout(function () {
      try {
        var cols = [];
        headers.forEach(function (h, ci) {
          var vals = rawData.map(function (r) { return r[ci]; }), nz = vals.filter(function (v) { return String(v == null ? '' : v).trim() !== ''; });
          if (nz.length < 4) return; var distinct = {}; nz.forEach(function (v) { distinct[String(v)] = 1; }); var d = Object.keys(distinct).length;
          if (d < 2 || d > 600 || d > 0.5 * nz.length) return;                                              // IDs, free text and numbers are not groups of spellings
          if (nz.filter(function (v) { return !isNaN(Number(String(v).replace(/,/g, ''))); }).length > 0.8 * nz.length) return;
          var g = V.groups(vals); cols.push({ col: ci, name: h, groups: g, distinct: d, vals: nz, cells: g.reduce(function (a, x) { return a + x.variants.reduce(function (b, y) { return b + (y.v === x.canonical ? 0 : y.n); }, 0); }, 0) });
        });
        U.busy(null);
        if (!cols.length) { toast(T('No column has a small set of repeated values to group.', 'किसी कॉलम में दोहराए जाने वाले मानों का छोटा समूह नहीं मिला।'), 'info'); return; }
        cols.sort(function (a, b) { return b.cells - a.cells; });
        ST = { cols: cols, cur: Math.max(0, cols.map(function (c) { return c.col; }).indexOf(preCol)), chosen: {} };
        render();
      } catch (e) { U.busy(null); toast(e.message, 'error'); }
    }, 30);
  };

  // values that are in no group yet, most frequent first (for merging by hand: "Closed" = "Disposed")
  function othersOf(c) {
    var used = {}; c.groups.forEach(function (g) { g.variants.forEach(function (x) { used[x.v] = 1; }); });
    var cnt = {}, order = []; c.vals.forEach(function (v) { v = String(v); if (used[v]) return; if (!(v in cnt)) { cnt[v] = 0; order.push(v); } cnt[v]++; });
    var items = order.map(function (v) { return { v: v, n: cnt[v] }; });
    c.groups.forEach(function (g, gi) { items.push({ v: g.canonical, n: g.n, group: gi, spellings: g.variants.length }); });      // a group can be merged with other values as a whole
    return items.sort(function (a, b) { return b.n - a.n; }).slice(0, 80);
  }
  var KIND = { format: ['#14a38b', T('same, written differently', 'वही, अलग लिखा')], manual: ['#3b82c4', T('you merged', 'आपने जोड़ा')], spelling: ['#e8913a', T('spelling', 'वर्तनी')], part: ['#6d5bd0', T('part of / re-ordered', 'का भाग / क्रम बदला')],
    script: ['#0e8fb0', T('Hindi ↔ English', 'हिंदी ↔ अंग्रेज़ी')], meaning: ['#b0589f', T('same meaning? check', 'एक अर्थ? जाँचें')], acronym: ['#6d5bd0', T('short form? check', 'संक्षिप्त रूप? जाँचें')], initials: ['#6d5bd0', T('initials? check', 'आद्याक्षर? जाँचें')] };
  function render() {
    var c = ST.cols[ST.cur], chosen = ST.chosen[c.col] || (ST.chosen[c.col] = c.groups.map(function (g) { return !V.WEAK[g.kind] || !!g.learned; }));
    var html = '<div class="prj-h"><b>🔤 ' + T('Same thing, different spelling', 'एक ही चीज़, अलग वर्तनी') + '</b><button id="vgX" aria-label="close">×</button></div>' +
      '<div class="big-note">' + T('Tick the groups that are really one value and choose how it should be written. Nothing changes until you press Apply, and you can undo it. A group marked “part of” may be two different things: check it.', 'जो समूह असल में एक ही मान हैं उन पर निशान लगाएँ और चुनें कि वह कैसे लिखा जाए। "लागू करें" से पहले कुछ नहीं बदलता, और पूर्ववत किया जा सकता है। “का भाग” वाला समूह दो अलग चीज़ें भी हो सकता है: जाँचें।') + '</div>' +
      '<div class="fr-form"><label class="rp-field"><span>' + T('Column', 'कॉलम') + '</span><select id="vgCol" class="big-select">' + ST.cols.map(function (x, i) { return '<option value="' + i + '"' + (i === ST.cur ? ' selected' : '') + '>' + esc(x.name) + ' — ' + fmt(x.cells) + T(' cells to change', ' सेल बदलेंगे') + '</option>'; }).join('') + '</select></label></div>' +
      '<div class="prj-row" style="gap:10px;margin:4px 0"><button class="cs-link" id="vgAll">' + T('Tick all', 'सब चुनें') + '</button><button class="cs-link" id="vgNone">' + T('Tick none', 'कोई नहीं') + '</button></div>' +
      (c.groups.length ? '' : '<div class="big-note">' + T('No different spellings were found in this column. You can still merge values by hand below.', 'इस कॉलम में अलग वर्तनी नहीं मिली। नीचे से मान हाथ से जोड़ सकते हैं।') + '</div>') +
      '<table class="big-tbl vg-tbl"><tr><th></th><th>' + T('Write it as', 'ऐसे लिखें') + '</th><th>' + T('These spellings', 'ये वर्तनियाँ') + '</th><th>' + T('Cells', 'सेल') + '</th></tr>' +
      c.groups.map(function (g, i) {
        var k = KIND[g.kind] || KIND.format;
        return '<tr><td><input type="checkbox" data-g="' + i + '"' + (chosen[i] !== false ? ' checked' : '') + '></td><td><select class="big-select vg-sel" data-s="' + i + '">' + g.variants.map(function (x) { return '<option' + (x.v.replace(/\s+/g, ' ').trim() === (typeof chosen[i] === 'string' ? chosen[i] : g.canonical) ? ' selected' : '') + '>' + esc(x.v.replace(/\s+/g, ' ').trim()) + '</option>'; }).join('') + '</select></td><td>' +
          '<span class="vg-kind" style="background:' + k[0] + '">' + esc(k[1]) + '</span> ' + g.variants.map(function (x) { return '<span class="vg-chip">' + esc(JSON.stringify(x.v).slice(1, -1)) + ' <em>' + fmt(x.n) + '</em></span>'; }).join(' ') + '</td><td class="num">' + fmt(g.n) + '</td></tr>';
      }).join('') + '</table>' +
      (function () { var oth = othersOf(c); if (!oth.length) return ''; return '<details class="rp-settings" style="margin-top:10px"' + (c.manual || !c.groups.length ? ' open' : '') + '><summary>' + T('Other values: tick the ones that mean the same thing (for example “Closed” and “Disposed”) and merge them', 'अन्य मान: जो एक ही अर्थ के हों (जैसे “Closed” और “Disposed”) उन पर निशान लगाकर जोड़ें') + '</summary><div class="vg-oth">' + oth.map(function (x, i) { return '<label class="vg-chip"><input type="checkbox" data-o="' + i + '"> ' + esc(JSON.stringify(x.v).slice(1, -1)) + (x.spellings ? ' <em>+' + (x.spellings - 1) + T(' spellings', ' वर्तनियाँ') + '</em>' : '') + ' <em>' + fmt(x.n) + '</em></label>'; }).join(' ') + '</div><button class="tb-btn" id="vgMerge" style="margin-top:6px">' + T('Merge the ticked values', 'चुने मान जोड़ें') + '</button></details>'; })() +
      '<div class="prj-row" style="justify-content:flex-end;margin-top:12px"><button class="tb-btn" id="vgCancel">' + T('Cancel', 'रद्द करें') + '</button><button class="tb-btn primary" id="vgApply"></button></div>';
    var o = U.overlay('valueGroupsDialog', html, true); o.querySelector('.stl-box').classList.add('fr-box');
    function sync() { var n = o.querySelectorAll('input[data-g]:checked').length; $('vgApply').textContent = T('Apply ', 'लागू करें ') + '(' + n + ')'; $('vgApply').disabled = !n; }
    o.querySelectorAll('input[data-g]').forEach(function (b) { b.onchange = function () { chosen[+b.dataset.g] = b.checked ? (typeof chosen[+b.dataset.g] === 'string' ? chosen[+b.dataset.g] : true) : false; sync(); }; });
    o.querySelectorAll('select[data-s]').forEach(function (sel) { sel.onchange = function () { var i = +sel.dataset.s; chosen[i] = sel.value; o.querySelector('input[data-g="' + i + '"]').checked = true; sync(); }; });
    $('vgAll').onclick = function () { c.groups.forEach(function (_, i) { chosen[i] = typeof chosen[i] === 'string' ? chosen[i] : true; }); o.remove(); render(); };
    $('vgNone').onclick = function () { c.groups.forEach(function (_, i) { chosen[i] = false; }); o.remove(); render(); };
    if ($('vgMerge')) $('vgMerge').onclick = function () {
      var oth = othersOf(c), pick = Array.prototype.map.call(o.querySelectorAll('input[data-o]:checked'), function (b) { return oth[+b.dataset.o]; });
      if (pick.length < 2) { toast(T('Tick two or more values to merge.', 'जोड़ने के लिए दो या अधिक मान चुनें।'), 'info'); return; }
      pick.sort(function (a, b) { return b.n - a.n; });
      var variants = [], gone = {}; pick.forEach(function (x) { if (x.group !== undefined) { gone[x.group] = true; c.groups[x.group].variants.forEach(function (y) { variants.push(y); }); } else variants.push({ v: x.v, n: x.n }); });
      var keepG = [], keepC = []; c.groups.forEach(function (g, i) { if (!gone[i]) { keepG.push(g); keepC.push(chosen[i]); } });
      c.groups = keepG; chosen.length = 0; keepC.forEach(function (x) { chosen.push(x); }); ST.chosen[c.col] = chosen;
      variants.sort(function (a, b) { return b.n - a.n; });
      c.groups.unshift({ canonical: pick[0].v.replace(/\s+/g, ' ').trim(), kind: 'manual', n: variants.reduce(function (a, x) { return a + x.n; }, 0), variants: variants }); chosen.unshift(true); c.manual = true;
      o.remove(); render();
    };
    $('vgCol').onchange = function () { ST.cur = +this.value; o.remove(); render(); };
    $('vgX').onclick = $('vgCancel').onclick = function () { o.remove(); }; sync();
    $('vgApply').onclick = function () {
      var map = V.mappingOf(c.groups, chosen), name = c.name; o.remove(); U.busy(T('Applying…', 'लागू हो रहा है…'));
      setTimeout(function () {
        try {
          var grid = [headers.slice()].concat(rawData.map(function (r) { return r.slice(); })), body = grid.slice(1), n = V.apply(body, c.col, map);
          if (STL.lex) { var teach = []; c.groups.forEach(function (g, gi) { if (chosen[gi] === false || !(g.kind === 'manual' || g.kind === 'meaning' || g.kind === 'acronym')) return; var to = (typeof chosen[gi] === 'string') ? chosen[gi] : g.canonical; g.variants.forEach(function (x) { if (x.v !== to) teach.push([x.v, to]); }); }); STL.lex.learn(teach); }      // remembered for every later file
          U.loadGrid(grid);
          STL.logStep('values', { en: 'Grouped different spellings', hi: 'अलग वर्तनी को एक किया' }, { en: name + ': ' + fmt(n) + ' cells now use one spelling', hi: name + ': ' + fmt(n) + ' सेल में एक वर्तनी' }, { col: name, cells: n });
          toast(T('Done: ', 'हो गया: ') + fmt(n) + T(' cells in “' + name + '” changed', ' सेल “' + name + '” में बदले'), 'success');
        } catch (e) { toast(e.message, 'error'); }
        U.busy(null);
      }, 30);
    };
  }
  (STL.actions || []).push({ en: 'Same thing, different spelling (group values)', hi: 'एक ही चीज़, अलग वर्तनी (मान एक करें)', kw: 'spelling variants standardise standardize group similar values clean typo kishangarh case merge categories status department officer', run: function () { STL.openValueGroups(); }, group: 'Clean' });
})(typeof window !== 'undefined' ? window : globalThis);
