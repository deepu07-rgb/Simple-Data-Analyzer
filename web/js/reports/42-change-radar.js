// =====================================================================
//  CHANGE RADAR  /  बदलाव रडार
//  "What is different this month?"  Compares two versions of a table (last month, this month):
//   - how each number column moved and where the movement is concentrated
//     ("71% of the rise is in 4 of 38 police stations"),
//   - which records are new, gone, or changed (when a stable key such as case number exists).
//  Every sentence is built from computed numbers only. It says what changed, never why.
//
//    STL.change.compare(prev, cur, opts)   prev/cur = { headers, rows }
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL = root.STL || {};
  var C = STL.change = {};
  function s(v) { return v == null ? '' : String(v); }
  function blank(v) { return s(v).trim() === ''; }
  function gkey(v) { return s(v).normalize('NFC').replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); }

  // 1,23,456.5 (lakh / crore grouping)
  function indian(n, dec) {
    if (n == null || !isFinite(n)) return '–';
    dec = dec == null ? (Math.abs(n) < 1000 && n !== Math.round(n) ? 2 : 0) : dec;
    var neg = n < 0, t = Math.abs(n).toFixed(dec).split('.'), i = t[0], last3 = i.slice(-3), rest = i.slice(0, -3);
    if (rest) last3 = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
    return (neg ? '-' : '') + last3 + (t[1] ? '.' + t[1] : '');
  }
  C.indian = indian;

  function num(v) { var F = STL.fix && STL.fix.util; return F ? F.parseNumber(v) : (isNaN(Number(s(v).replace(/,/g, ''))) || blank(v) ? null : Number(s(v).replace(/,/g, ''))); }
  function colVals(rows, i) { return rows.map(function (r) { return r[i]; }); }
  function nonBlank(vals) { return vals.filter(function (v) { return !blank(v); }); }
  function numericShare(vals) { var nb = nonBlank(vals); if (!nb.length) return 0; var n = 0; nb.forEach(function (v) { if (num(v) !== null) n++; }); return n / nb.length; }
  function codeLike(vals) { var nb = nonBlank(vals); if (!nb.length) return false; var c = 0; nb.forEach(function (v) { var t = s(v).trim(); if (/^0\d+$/.test(t) || /^\d{10,}$/.test(t)) c++; }); return c / nb.length > 0.3; }
  function isSerial(vals) {                                              // 1,2,3,... row numbers
    var nb = nonBlank(vals).map(num); if (nb.length < 3 || nb.some(function (x) { return x === null; })) return false;
    var uniq = {}; nb.forEach(function (x) { uniq[x] = 1; });
    var mn = Math.min.apply(null, nb);
    return mn <= 1 && Object.keys(uniq).length === nb.length && Math.max.apply(null, nb) - mn + 1 === nb.length;   // 0/1, 2, 3 ... = row numbers
  }

  // ------------------------------------------------------------ column matching (reuses Merge Anything's rules)
  function matchColumns(prev, cur) {
    var M = STL.merge, out = [];
    if (M && M.plan) {
      var plan = M.plan([{ name: 'prev', headers: prev.headers, rows: prev.rows }, { name: 'cur', headers: cur.headers, rows: cur.rows }]);
      var byTgt = {};
      plan.maps[0].forEach(function (m) { byTgt[m.tgt] = m.src; });
      plan.maps[1].forEach(function (m) { if (byTgt[m.tgt] !== undefined && m.level !== 'new') out.push({ prev: byTgt[m.tgt], cur: m.src, name: s(cur.headers[m.src]) || s(prev.headers[byTgt[m.tgt]]), level: m.level }); });
    } else {
      cur.headers.forEach(function (h, j) { var i = prev.headers.indexOf(h); if (i >= 0) out.push({ prev: i, cur: j, name: s(h), level: 'auto' }); });
    }
    return out;
  }

  // ------------------------------------------------------------ key detection
  var KEYISH = /case|fir|प्रकरण|एफ ?आई ?आर|emp|कर्मचारी|mobile|मोबाइल|aadhaar|aadhar|आधार|pan\b|ppo|पीपीओ|reg|पंजीयन|\bid\b|आईडी|नंबर|संख्या|number|\bno\b/i;
  function detectKey(prev, cur, matched) {
    var best = null;
    matched.forEach(function (m) {
      var pv = nonBlank(colVals(prev.rows, m.prev)), cv = nonBlank(colVals(cur.rows, m.cur));
      if (pv.length < 3 || cv.length < 3) return;
      if (isSerial(colVals(prev.rows, m.prev)) || isSerial(colVals(cur.rows, m.cur))) return;           // row numbers are not identities
      if (/^(sr|s\.? ?no|क्र)/i.test(s(cur.headers[m.cur]).trim())) return;
      var ps = {}, cs = {}, pu = 0, cu = 0;
      pv.forEach(function (v) { var k = gkey(v); if (!ps[k]) { ps[k] = 1; pu++; } });
      cv.forEach(function (v) { var k = gkey(v); if (!cs[k]) { cs[k] = 1; cu++; } });
      if (pu / pv.length < 0.98 || cu / cv.length < 0.98) return;
      if (pv.length / prev.rows.length < 0.95 || cv.length / cur.rows.length < 0.95) return;
      var inter = 0; Object.keys(cs).forEach(function (k) { if (ps[k]) inter++; });
      var overlap = inter / Math.min(pu, cu);
      if (overlap < 0.3) return;
      var sc = overlap + (KEYISH.test(s(cur.headers[m.cur])) ? 0.3 : 0) - (numericShare(cv) > 0.9 && !KEYISH.test(s(cur.headers[m.cur])) ? 0.2 : 0);
      if (!best || sc > best.score) best = { prev: m.prev, cur: m.cur, name: s(cur.headers[m.cur]), score: sc, overlap: overlap };
    });
    return best;
  }

  // ------------------------------------------------------------ sentences
  function pctText(p) { var a = Math.abs(p); return (a >= 10 ? a.toFixed(0) : a.toFixed(1)).replace(/\.0$/, '') + '%'; }
  function names(list) { return list.join(', '); }
  function totalsSentence(t) {
    var up = t.delta > 0;
    return {
      en: t.name + (up ? ' rose' : ' fell') + ' by ' + indian(Math.abs(t.delta)) + (t.pct == null ? '' : ' (' + pctText(t.pct) + ')') + ' from ' + indian(t.prev) + ' to ' + indian(t.cur) + '.',
      hi: t.name + ' ' + indian(t.prev) + ' से ' + (up ? 'बढ़कर' : 'घटकर') + ' ' + indian(t.cur) + ' हो गया' + (t.pct == null ? '' : ' (' + (up ? '+' : '−') + pctText(t.pct) + ')') + '।'
    };
  }
  function insightSentence(t, ins) {
    var up = t.delta > 0, share = Math.round(ins.share * 100);
    return {
      en: totalsSentence(t).en + ' ' + share + '% of the ' + (up ? 'rise' : 'fall') + ' is in ' + ins.k + ' of ' + ins.n + ' ' + ins.groupBy + ' (mainly ' + names(ins.top.map(function (x) { return x.name + ' ' + (x.delta > 0 ? '+' : '−') + indian(Math.abs(x.delta)); })) + ').',
      hi: totalsSentence(t).hi + ' इस ' + (up ? 'वृद्धि' : 'कमी') + ' का ' + share + '% हिस्सा ' + ins.n + ' में से ' + ins.k + ' ' + ins.groupBy + ' में है (मुख्यतः ' + names(ins.top.map(function (x) { return x.name + ' ' + (x.delta > 0 ? '+' : '−') + indian(Math.abs(x.delta)); })) + ')।'
    };
  }

  // ------------------------------------------------------------ main
  // opts: {keyPrev, keyCur (column indexes, -1 for none), share (default 0.7), minMove (default 0.005)}
  C.compare = function (prev, cur, opts) {
    opts = opts || {};
    var matched = matchColumns(prev, cur);
    var res = { rows: { prev: prev.rows.length, cur: cur.rows.length }, matched: matched, unmatchedPrev: [], unmatchedCur: [], totals: [], insights: [], key: null, rowDiff: null };
    var mp = {}, mc = {}; matched.forEach(function (m) { mp[m.prev] = 1; mc[m.cur] = 1; });
    prev.headers.forEach(function (h, i) { if (!mp[i] && !blank(h)) res.unmatchedPrev.push(s(h)); });
    cur.headers.forEach(function (h, i) { if (!mc[i] && !blank(h)) res.unmatchedCur.push(s(h)); });

    // key
    var key = null;
    if (opts.keyCur === -1) key = null;
    else if (opts.keyCur !== undefined && opts.keyPrev !== undefined) key = { prev: opts.keyPrev, cur: opts.keyCur, name: s(cur.headers[opts.keyCur]), overlap: 1, score: 1 };
    else key = detectKey(prev, cur, matched);
    res.key = key && { prev: key.prev, cur: key.cur, name: key.name, overlap: key.overlap };

    // numeric and group columns
    var numCols = [], grpCols = [];
    matched.forEach(function (m) {
      var pv = colVals(prev.rows, m.prev), cv = colVals(cur.rows, m.cur);
      var isKey = key && key.cur === m.cur;
      if (numericShare(pv) >= 0.8 && numericShare(cv) >= 0.8 && !codeLike(pv) && !codeLike(cv) && !isSerial(pv) && !isSerial(cv) && !isKey) { numCols.push(m); return; }
      if (numericShare(cv) < 0.5) {
        var d1 = {}, d2 = {}, n1 = 0, n2 = 0; nonBlank(pv).forEach(function (v) { var k = gkey(v); if (!d1[k]) { d1[k] = 1; n1++; } }); nonBlank(cv).forEach(function (v) { var k = gkey(v); if (!d2[k]) { d2[k] = 1; n2++; } });
        var lim = 300;                                                     // a summary table can have one row per station: that is still a useful grouping
        var common = 0; Object.keys(d2).forEach(function (k) { if (d1[k]) common++; });
        if (n1 >= 2 && n2 >= 2 && n1 <= lim && n2 <= lim && !isKey && common / Math.min(n1, n2) >= 0.5) grpCols.push(m);    // a grouping must persist across months (IDs do not)
      }
    });

    // totals
    var totalsByCol = {};
    numCols.forEach(function (m) {
      var sp = 0, sc = 0;
      prev.rows.forEach(function (r) { var x = num(r[m.prev]); if (x !== null) sp += x; });
      cur.rows.forEach(function (r) { var x = num(r[m.cur]); if (x !== null) sc += x; });
      var t = { name: m.name, prev: sp, cur: sc, delta: sc - sp, pct: sp !== 0 ? (sc - sp) / Math.abs(sp) * 100 : null };
      totalsByCol[m.name] = t; res.totals.push(t);
    });

    // where is the movement?
    var share = opts.share || 0.7, minMove = opts.minMove == null ? 0.005 : opts.minMove, all = [];
    numCols.forEach(function (nm) {
      var t = totalsByCol[nm.name];
      if (t.delta === 0 || Math.abs(t.delta) / Math.max(Math.abs(t.prev), 1) < minMove) return;
      var sign = t.delta > 0 ? 1 : -1;
      grpCols.forEach(function (gm) {
        var pm = {}, cmap = {}, label = {};
        prev.rows.forEach(function (r) { var k = gkey(r[gm.prev]); if (!k) return; var x = num(r[nm.prev]); pm[k] = (pm[k] || 0) + (x || 0); label[k] = label[k] || s(r[gm.prev]).trim(); });
        cur.rows.forEach(function (r) { var k = gkey(r[gm.cur]); if (!k) return; var x = num(r[nm.cur]); cmap[k] = (cmap[k] || 0) + (x || 0); label[k] = s(r[gm.cur]).trim() || label[k]; });
        var keys = Object.keys(Object.assign({}, pm, cmap)), n = keys.length;
        if (n < 4) return;
        var deltas = keys.map(function (k) { return { name: label[k], delta: (cmap[k] || 0) - (pm[k] || 0) }; });
        var inDir = deltas.filter(function (x) { return x.delta * sign > 0; }).sort(function (a, b) { return b.delta * sign - a.delta * sign; });
        var M = inDir.reduce(function (a, x) { return a + Math.abs(x.delta); }, 0); if (M <= 0) return;
        var cum = 0, k = 0; for (; k < inDir.length; k++) { cum += Math.abs(inDir[k].delta); if (cum / M >= share) { k++; break; } }
        if (k > 0.5 * n) return;                                           // movement is spread out: not worth a sentence
        var movers = deltas.filter(function (x) { return x.delta !== 0; }).sort(function (a, b) { return Math.abs(b.delta) - Math.abs(a.delta); }).slice(0, 12);     // for the chart
        all.push({ column: nm.name, groupBy: gm.name, k: k, n: n, share: cum / M, top: inDir.slice(0, Math.min(3, k)), movers: movers,
                   strength: Math.abs(t.delta) / Math.max(Math.abs(t.prev), 1) * (1 - k / n) });
      });
    });
    all.sort(function (a, b) { return b.strength - a.strength; });
    var perCol = {};
    all.forEach(function (ins) { perCol[ins.column] = (perCol[ins.column] || 0) + 1; if (perCol[ins.column] <= 2 && res.insights.length < 6) { ins.sentence = insightSentence(totalsByCol[ins.column], ins); res.insights.push(ins); } });
    res.totals.forEach(function (t) { t.sentence = totalsSentence(t); });

    // record by record
    if (key) {
      var pm2 = {}, cm2 = {}, dupP = 0, dupC = 0;
      prev.rows.forEach(function (r, i) { var k = gkey(r[key.prev]); if (!k) return; if (pm2[k] !== undefined) dupP++; else pm2[k] = i; });
      cur.rows.forEach(function (r, i) { var k = gkey(r[key.cur]); if (!k) return; if (cm2[k] !== undefined) dupC++; else cm2[k] = i; });
      var added = [], removed = [], changed = [], perColChanged = {};
      Object.keys(cm2).forEach(function (k) {
        if (pm2[k] === undefined) { added.push(cm2[k]); return; }
        var pr = prev.rows[pm2[k]], cr = cur.rows[cm2[k]], diffs = [];
        matched.forEach(function (m) {
          if (m.cur === key.cur) return;
          var a = s(pr[m.prev]).trim(), b = s(cr[m.cur]).trim();
          if (a === b) return;
          var x = num(a), y = num(b);
          if (x !== null && y !== null && Math.abs(x - y) < 1e-9) return;
          diffs.push({ col: m.name, old: a, 'new': b });
          perColChanged[m.name] = (perColChanged[m.name] || 0) + 1;
        });
        if (diffs.length) changed.push({ key: s(cr[key.cur]).trim(), row: cm2[k], diffs: diffs });
      });
      Object.keys(pm2).forEach(function (k) { if (cm2[k] === undefined) removed.push(pm2[k]); });
      res.rowDiff = { added: added, removed: removed, changed: changed, changedByColumn: perColChanged, duplicateKeys: dupP + dupC,
                      unchanged: Object.keys(cm2).length - added.length - changed.length };
    }
    return res;
  };

  // a flat table of the record changes, for putting into the sheet
  C.changesTable = function (prev, cur, res) {
    var H = ['Change', 'Key', 'Column', 'Before', 'After'], rows = [];
    if (!res.rowDiff) return { headers: H, rows: rows };
    var kc = res.key.cur, kp = res.key.prev;
    res.rowDiff.added.forEach(function (i) { rows.push(['New', s(cur.rows[i][kc]), '', '', '']); });
    res.rowDiff.removed.forEach(function (i) { rows.push(['Gone', s(prev.rows[i][kp]), '', '', '']); });
    res.rowDiff.changed.forEach(function (c) { c.diffs.forEach(function (d) { rows.push(['Changed', c.key, d.col, d.old, d['new']]); }); });
    return { headers: H, rows: rows };
  };
})(typeof window !== 'undefined' ? window : globalThis);
