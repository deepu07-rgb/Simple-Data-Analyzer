// =====================================================================
//  WHAT EXPLAINS THIS?  /  इसे क्या समझाता है?   (key drivers)
//  For one number (plate waste, rating, cost ...) every other column is ranked by how much of the differences in
//  that number it goes with: omega squared (ω²) - the share of the variation explained by the groups of a column,
//  corrected for chance so that a column with many values does not win just by having many values.
//  Number columns take part cut into five equal-count bands. Columns that look CALCULATED FROM the number itself
//  (they share its name, or almost fully determine it) are listed apart: they are results, not causes.
//    STL.drivers.omega(levels)                     levels: [{ n, sy, syy }] -> { omega2, eta2, k, n }
//    STL.drivers.candidates(headers, prof, y)      -> [{ col, name, kind: 'cat' | 'num' }]
//    STL.drivers.rank(rows, idx, headers, y, opt)  -> ranked list (in-memory; large files use the engine's cells)
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL = root.STL || {}, D = STL.drivers = {};
  function CH() { return STL.charts; }
  function s(v) { return v == null ? '' : String(v); }

  D.omega = function (levels) {
    var N = 0, SY = 0, SYY = 0, k = 0, ssb = 0, ssw = 0;
    levels.forEach(function (l) { if (!l.n) return; k++; N += l.n; SY += l.sy; SYY += l.syy; });
    if (k < 2 || N <= k) return { omega2: 0, eta2: 0, k: k, n: N };
    var m = SY / N;
    levels.forEach(function (l) { if (!l.n) return; var mi = l.sy / l.n; ssb += l.n * (mi - m) * (mi - m); ssw += Math.max(l.syy - l.n * mi * mi, 0); });
    var sst = ssb + ssw, msw = ssw / (N - k);
    return { omega2: sst > 0 ? Math.max(0, (ssb - (k - 1) * msw) / (sst + msw)) : 0, eta2: sst > 0 ? ssb / sst : 0, k: k, n: N };
  };

  // words of a column name, to notice "waste_adjusted_cost" being made from "plate_waste_percentage"
  var STOP = { the: 1, and: 1, per: 1, for: 1, rate: 1, score: 1, index: 1, total: 1, count: 1, type: 1, data: 1, value: 1, level: 1, pct: 1, percentage: 1, percent: 1, cost: 1, idr: 1, inr: 1, rupees: 1, amount: 1 };
  function words0(name) { return s(name).toLowerCase().split(/[^a-zऀ-ॿ]+/).filter(function (w) { return w.length >= 4 && !STOP[w]; }); }
  D.sharesName = function (a, b) { var words = CH().nameWords || words0, wb = words(b); return words(a).filter(function (w) { return wb.indexOf(w) >= 0; }); };

  D.candidates = function (headers, prof, y) {
    var C = CH(), nums = prof.filter(function (p) { return C.isMeasure(p) && p.index !== y; });
    var cats = prof.filter(function (p) { return p.index !== y && ((!p.numeric && !p.date && !p.list) || p.lowInt) && !p.unique && !(p.code && !p.lowInt) && p.distinct >= 2 && p.distinct <= 80 && p.fill >= 0.5; });
    return cats.map(function (p) { return { col: p.index, name: p.name, kind: 'cat' }; }).concat(nums.map(function (p) { return { col: p.index, name: p.name, kind: 'num' }; }));
  };

  // "sharp edges": every row of a big group stops at one value of the number while many other rows go past it
  // (all "Exemplary" rows have waste <= 9.9). That is how a label GIVEN BY the number looks - a tier, a grade, a
  // pass/fail - so such a column should not be used to adjust a comparison of that number.
  D.walls = function (rows, idx, y, col, noZero) {
    var C = CH(), by = {}, all = [];
    for (var k = 0; k < idx.length; k++) { var r = rows[idx[k]], v = C.num(r[y]); if (v === null || (noZero && v === 0)) continue; var key = s(r[col]).trim(); if (!key) continue; (by[key] || (by[key] = [])).push(v); all.push(v); }
    all.sort(function (a, b) { return a - b; });
    var N = all.length, below = function (x) { var lo = 0, hi = N; while (lo < hi) { var m = (lo + hi) >> 1; if (all[m] < x) lo = m + 1; else hi = m; } return lo; }, above = function (x) { var lo = 0, hi = N; while (lo < hi) { var m = (lo + hi) >> 1; if (all[m] <= x) lo = m + 1; else hi = m; } return N - lo; };
    var out = [];
    Object.keys(by).forEach(function (key) {
      var v = by[key].sort(function (a, b) { return a - b; }), n = v.length, no = N - n; if (n < 50 || no < 50) return;
      var mn = v[0], mx = v[n - 1], rg = mx - mn; if (!(rg > 0)) return;
      var p95 = v[Math.floor(0.95 * (n - 1))], p05 = v[Math.ceil(0.05 * (n - 1))];
      var up = above(mx) / no, dn = below(mn) / no;                // the group's own rows are never beyond its own edge
      if (p95 >= mx - 0.1 * rg && up >= 0.25) out.push({ label: key, side: 'max', edge: mx, beyond: up });
      if (p05 <= mn + 0.1 * rg && dn >= 0.25) out.push({ label: key, side: 'min', edge: mn, beyond: dn });
    });
    out.sort(function (a, b) { return b.beyond - a.beyond; });
    return out;
  };
  D.markWalls = function (ranked, rows, idx, y, noZero) {
    ranked.forEach(function (r) { if (r.kind === 'cat' && !r.derived) { var w = D.walls(rows, idx, y, r.col, noZero); if (w.length) r.walls = w; } });
    return ranked;
  };

  // in-memory ranking from the rows
  D.rank = function (rows, idx, headers, y, opt) {
    opt = opt || {}; var C = CH(), prof = opt.prof || C.profile(headers, rows, idx), cands = opt.candidates || D.candidates(headers, prof, y);
    var ranked = D.finish(cands.map(function (c) {
      var bands = null, by = {};
      if (c.kind === 'num') bands = C.quantileBands(idx.map(function (i) { return C.num(rows[i][c.col]); }), 5);
      for (var k = 0; k < idx.length; k++) {
        var r = rows[idx[k]], v = C.num(r[y]); if (v === null || (opt.noZero && v === 0)) continue;
        var key; if (bands) { var bi = C.bandOf(bands, C.num(r[c.col])); key = bi < 0 ? '(blank)' : bands.labels[bi]; } else { key = s(r[c.col]).trim() || '(blank)'; }
        var o = by[key] || (by[key] = { label: key, n: 0, sy: 0, syy: 0 }); o.n++; o.sy += v; o.syy += v * v;
      }
      return { col: c.col, name: c.name, kind: c.kind, levels: Object.keys(by).map(function (q) { return by[q]; }), bands: bands };
    }), headers[y]);
    if (opt.walls !== false) D.markWalls(ranked, rows, idx, y, opt.noZero);
    return opt.standIns === false ? ranked : D.findStandIns(ranked, rows, idx, y, opt.noZero);
  };
  // turn per-column level sums into the ranked answer (shared with the large-file path)
  D.finish = function (list, yName) {
    var out = list.map(function (d) {
      var lv = d.levels.filter(function (l) { return l.n > 0; }), om = D.omega(lv), big = lv.filter(function (l) { return l.n >= 20; }).map(function (l) { return { label: l.label, n: l.n, mean: l.sy / l.n }; });
      big.sort(function (a, b) { return b.mean - a.mean; });
      var shared = D.sharesName(d.name, yName);
      return { col: d.col, name: d.name, kind: d.kind, omega2: om.omega2, eta2: om.eta2, k: om.k, n: om.n, high: big[0] || null, low: big[big.length - 1] || null, levels: big, bands: d.bands || null,
               derived: shared.length ? { why: 'name', words: shared } : (om.eta2 >= 0.6 ? { why: 'determines' } : null) };
    });
    out.sort(function (a, b) { return b.omega2 - a.omega2; });
    return out;
  };

  // ---------------------------------------------------------------- stand-ins
  // Does a column still go with the number INSIDE the groups of a stronger column? Calories go with plate waste
  // overall, but only because older pupils get bigger meals; inside each age group the link is gone.
  // cells: [{ z, x, n, sy, syy }]  ->  share of the total variation that x adds beyond z, corrected for chance
  D.within = function (cells) {
    var N = 0, SY = 0, SYY = 0, Z = {}, nc = 0, sbc = 0;
    cells.forEach(function (c) { if (!c.n) return; nc++; N += c.n; SY += c.sy; SYY += c.syy; sbc += c.sy * c.sy / c.n; var z = Z[c.z] || (Z[c.z] = { n: 0, sy: 0 }); z.n += c.n; z.sy += c.sy; });
    var nz = 0, sbz = 0; Object.keys(Z).forEach(function (k) { nz++; sbz += Z[k].sy * Z[k].sy / Z[k].n; });
    if (N <= nc || nz < 1) return { omega2: 0, n: N };
    var sst = SYY - SY * SY / N, ssx = Math.max(sbc - sbz, 0), sse = Math.max(SYY - sbc, 0), mse = sse / (N - nc), dfx = nc - nz;
    return { omega2: sst > 0 ? Math.max(0, (ssx - dfx * mse) / (sst + mse)) : 0, n: N };
  };
  // the key of a row for one ranked column (its text, or its band)
  function keyOf(r, c, C) { if (c.bands) { var bi = C.bandOf(c.bands, C.num(r[c.col])); return bi < 0 ? '(blank)' : c.bands.labels[bi]; } return s(r[c.col]).trim() || '(blank)'; }
  D.pairCells = function (rows, idx, y, xc, zc, noZero) {
    var C = CH(), by = {};
    for (var k = 0; k < idx.length; k++) {
      var r = rows[idx[k]], v = C.num(r[y]); if (v === null || (noZero && v === 0)) continue;
      var x = keyOf(r, xc, C), z = keyOf(r, zc, C), key = z + '\u0001' + x, o = by[key] || (by[key] = { z: z, x: x, n: 0, sy: 0, syy: 0 }); o.n++; o.sy += v; o.syy += v * v;
    }
    return Object.keys(by).map(function (q) { return by[q]; });
  };
  // which columns to test, and against which stronger ones: the 3 strongest real causes
  D.standInPairs = function (ranked) {
    var real = ranked.filter(function (r) { return !r.derived && !r.walls; }), strong = real.slice(0, 3), pairs = [];
    real.slice(1).forEach(function (r) { if (r.omega2 < 0.01) return; strong.forEach(function (z) { if (z !== r && z.omega2 > r.omega2) pairs.push({ x: r, z: z }); }); });
    return pairs;
  };
  // results: [{ x, z, within }] -> marks r.standIn = { col, name, within } when almost nothing is left inside z
  D.markStandIns = function (ranked, results) {
    // strongest first, so a column that is itself a stand-in is never used to explain another one
    ranked.forEach(function (r) {
      var q = null; results.forEach(function (p) { if (p.x === r && !p.z.standIn && (!q || p.within < q.within)) q = p; });
      if (q) { r.inside = { col: q.z.col, name: q.z.name, omega2: q.within }; if (q.within < Math.max(0.005, Math.min(0.01, 0.3 * r.omega2))) r.standIn = r.inside; else if (q.within < 0.6 * r.omega2) r.partly = r.inside; }   // stand-in: almost nothing (< 1%) is left inside the stronger column
    });
    return ranked;
  };
  D.findStandIns = function (ranked, rows, idx, y, noZero) {
    return D.markStandIns(ranked, D.standInPairs(ranked).map(function (p) { return { x: p.x, z: p.z, within: D.within(D.pairCells(rows, idx, y, p.x, p.z, noZero)).omega2 }; }));
  };

  // ---------------------------------------------------------------- rule finder
  // How is a label made? A small decision tree (Gini, like CART) on the number columns, then one readable rule per
  // leaf: "Exemplary: plate waste ≤ 9.9 and arrival temperature ≥ 55 and local sourcing ≥ 75".
  //   features: [{ col, name }]   opt: { depth: 5, minLeaf }   ->  { rules, accuracy, n, used: [names], classes }
  D.findRule = function (rows, idx, labelCol, features, opt) {
    opt = opt || {}; var C = CH(), maxDepth = opt.depth || 5;
    var lab = [], X = features.map(function () { return []; }), cls = {}, names = [];
    idx.forEach(function (i) { var r = rows[i], l = s(r[labelCol]).trim(); if (!l) return; if (!(l in cls)) { cls[l] = names.length; names.push(l); } lab.push(cls[l]); features.forEach(function (f, j) { var v = C.num(r[f.col]); X[j].push(v === null ? Infinity : v); }); });
    var n = lab.length, K = names.length, minLeaf = opt.minLeaf || Math.max(10, Math.round(n * 0.003));
    if (n < 30 || K < 2) return null;
    function counts(ids) { var c = new Array(K).fill(0); ids.forEach(function (i) { c[lab[i]]++; }); return c; }
    function gini(c, m) { if (!m) return 0; var g = 1; c.forEach(function (x) { g -= (x / m) * (x / m); }); return g; }
    function major(c) { var b = 0; c.forEach(function (x, i) { if (x > c[b]) b = i; }); return b; }
    function grow(ids, depth) {
      var c = counts(ids), m = ids.length, node = { n: m, cls: major(c), right: c[major(c)] };
      if (depth >= maxDepth || node.right === m || m < 2 * minLeaf) return node;
      var g0 = gini(c, m), best = null;
      features.forEach(function (f, j) {
        var col = X[j], ord = ids.slice().sort(function (a, b) { return col[a] - col[b]; }), L = new Array(K).fill(0), R = c.slice();
        for (var t = 0; t < m - 1; t++) {
          var i = ord[t]; L[lab[i]]++; R[lab[i]]--;
          var a = col[i], b = col[ord[t + 1]]; if (a === b || t + 1 < minLeaf || m - t - 1 < minLeaf || b === Infinity) continue;
          var gain = g0 - ((t + 1) * gini(L, t + 1) + (m - t - 1) * gini(R, m - t - 1)) / m;
          if (!best || gain > best.gain + 1e-12) best = { gain: gain, j: j, lo: a, hi: b, cut: t + 1, ord: ord };
        }
      });
      if (!best || best.gain < 1e-4) return node;
      node.f = best.j; node.lo = best.lo; node.hi = best.hi;
      node.l = grow(best.ord.slice(0, best.cut), depth + 1); node.r = grow(best.ord.slice(best.cut), depth + 1);
      if (!node.l.f && node.l.f !== 0 && !node.r.f && node.r.f !== 0 && node.l.cls === node.r.cls) { delete node.f; delete node.l; delete node.r; }   // both sides say the same: one leaf
      return node;
    }
    var root = grow(lab.map(function (_, i) { return i; }), 0), leaves = [], used = {};
    (function walk(nd, conds) {
      if (nd.f === undefined) { leaves.push({ cls: nd.cls, n: nd.n, right: nd.right, conds: conds }); return; }
      used[nd.f] = 1;
      walk(nd.l, conds.concat([{ j: nd.f, op: '<=', v: nd.lo }])); walk(nd.r, conds.concat([{ j: nd.f, op: '>=', v: nd.hi }]));
    })(root, []);
    var right = 0; leaves.forEach(function (l) { right += l.right; });
    var rules = leaves.map(function (l) {
      var b = {}; l.conds.forEach(function (c) { var o = b[c.j] || (b[c.j] = {}); if (c.op === '<=') o.max = o.max === undefined ? c.v : Math.min(o.max, c.v); else o.min = o.min === undefined ? c.v : Math.max(o.min, c.v); });
      return { label: names[l.cls], n: l.n, right: l.right, conds: Object.keys(b).map(function (j) { return { col: features[j].col, name: features[j].name, min: b[j].min, max: b[j].max }; }) };
    }).sort(function (a, b) { return a.label < b.label ? -1 : a.label > b.label ? 1 : b.n - a.n; });
    return { rules: rules, accuracy: right / n, n: n, used: Object.keys(used).map(function (j) { return features[j].name; }), usedCols: Object.keys(used).map(function (j) { return features[j].col; }), classes: names };
  };
  // for every column flagged as a possible label: the rule that makes it, from the number and the other number columns
  D.addRules = function (ranked, rows, idx, y, yName, cands) {
    var feats = [{ col: y, name: yName }].concat(cands.filter(function (c) { return c.kind === 'num' && c.col !== y && !D.sharesName(c.name, yName).length; }).map(function (c) { return { col: c.col, name: c.name }; }));
    ranked.forEach(function (r) { if (r.walls) { try { r.rule = D.findRule(rows, idx, r.col, feats); } catch (e) { r.rule = null; } } });
    return ranked;
  };
  D.ruleText = function (rule, hi) {
    var f = function (v) { return Math.abs(v) >= 1000 ? CH().indian(Math.round(v)) : String(Math.round(v * 1000) / 1000); };
    if (!rule.conds.length) return hi ? 'बाकी सभी पंक्तियाँ' : 'all other rows';
    return rule.conds.map(function (c) { return c.min !== undefined && c.max !== undefined ? c.name + ' ' + f(c.min) + '–' + f(c.max) : c.name + (c.max !== undefined ? ' ≤ ' + f(c.max) : ' ≥ ' + f(c.min)); }).join(hi ? ' और ' : ' and ');
  };

  D.summary = function (ranked, yName, hi) {
    var f = function (x) { return (Math.round(x * 1000) / 10) + '%'; }, n2 = function (v) { return Math.abs(v) >= 1000 ? CH().indian(Math.round(v)) : String(Math.round(v * 100) / 100); };
    var causes = ranked.filter(function (r) { return !r.derived; }), res = ranked.filter(function (r) { return r.derived; }), out = [];
    var lab = causes.filter(function (r) { return r.walls; }); causes = causes.filter(function (r) { return !r.walls; });   // possible labels are told apart, not led with
    var top = causes[0];
    if (top && top.omega2 >= 0.005) {
      out.push(hi ? '“' + yName + '” के अंतर सबसे अधिक “' + top.name + '” से जुड़े हैं (भिन्नता का ' + f(top.omega2) + ' समझाता है)' + (top.high && top.low ? ': ' + n2(top.low.mean) + ' (' + top.low.label + ') से ' + n2(top.high.mean) + ' (' + top.high.label + ') तक।' : '।')
                  : 'The differences in “' + yName + '” go most with “' + top.name + '” (it explains ' + f(top.omega2) + ' of the variation)' + (top.high && top.low ? ': from ' + n2(top.low.mean) + ' (' + top.low.label + ') to ' + n2(top.high.mean) + ' (' + top.high.label + ').' : '.'));
      var next = causes.slice(1).filter(function (r) { return r.omega2 >= 0.005 && !r.standIn; }).slice(0, 3), stand = causes.filter(function (r) { return r.standIn; });
      if (next.length) out.push((hi ? 'इसके बाद: ' : 'Next: ') + next.map(function (r) { return r.name + ' ' + f(r.omega2); }).join(', ') + '.');
      stand.forEach(function (r) { var z = r.standIn;
        out.push(hi ? '“' + r.name + '” मुख्यतः “' + z.name + '” का प्रतिबिंब है: कुल मिलाकर यह ' + f(r.omega2) + ' समझाता है, पर हर “' + z.name + '” समूह के भीतर केवल ' + f(z.omega2) + '। इसे अलग कारण न मानें।'
                    : '“' + r.name + '” mostly stands in for “' + z.name + '”: it explains ' + f(r.omega2) + ' overall but only ' + f(z.omega2) + ' inside each “' + z.name + '” group. Do not count it as a separate cause.'); });
      var weak = causes.filter(function (r) { return r.omega2 < 0.01; }).map(function (r) { return r.name; });
      if (weak.length) out.push(hi ? 'लगभग कोई संबंध नहीं (1% से कम): ' + weak.slice(0, 6).join(', ') + (weak.length > 6 ? ' …' : '।') : 'Almost no link (under 1% each): ' + weak.slice(0, 6).join(', ') + (weak.length > 6 ? ' …' : '.'));
    } else out.push(hi ? 'किसी भी कॉलम का “' + yName + '” से स्पष्ट संबंध नहीं।' : 'No column goes clearly with “' + yName + '”.');
    var ruleLine = function (r) { var q = r.rule; if (!q || q.accuracy < 0.8) return ''; return hi ? ' एक नियम (' + q.used.join(', ') + ' पर) इसे ' + f(q.accuracy) + ' पंक्तियों में दोहराता है — नीचे देखें।' : ' A rule on ' + q.used.join(', ') + ' reproduces it for ' + f(q.accuracy) + ' of rows — see below.'; };
    lab.forEach(function (r) { var w = r.walls[0], e = n2(w.edge);
      out.push(hi ? '“' + r.name + '” शायद “' + yName + '” से तय होने वाला लेबल है: हर “' + w.label + '” पंक्ति में यह ' + (w.side === 'max' ? '≤ ' : '≥ ') + e + ' है, जबकि बाकी ' + Math.round(w.beyond * 100) + '% पंक्तियाँ इसके पार हैं। इसे कारण मानने से पहले जाँचें; निष्पक्ष तुलना इसे अपने-आप नहीं चुनती।' + ruleLine(r)
                  : '“' + r.name + '” may be a label given BY “' + yName + '”: every “' + w.label + '” row has it ' + (w.side === 'max' ? '≤ ' : '≥ ') + e + ', while ' + Math.round(w.beyond * 100) + '% of the other rows lie beyond. Check before treating it as a cause; Fair comparison does not pick it by itself.' + ruleLine(r)); });
    if (res.length) out.push(hi ? 'ये कॉलम “' + yName + '” से ही बने लगते हैं — इन्हें कारण न मानें: ' + res.map(function (r) { return r.name; }).join(', ') + '।' : 'These columns look calculated from “' + yName + '” itself — treat them as results, not causes: ' + res.map(function (r) { return r.name; }).join(', ') + '.');
    out.push(hi ? 'कारक एक-दूसरे से जुड़े हो सकते हैं; किसी एक को दूसरों के मुकाबले जाँचने के लिए “निष्पक्ष तुलना” उपयोग करें।' : 'Factors can overlap; use “Fair comparison” to check one against the others.');
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);

// =====================================================================
//  The screen
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL, D = STL.drivers;
  if (!root.document || !STL.ui) return;
  var U = STL.ui, CH = STL.charts, T = U.T, esc = U.esc;
  function $(id) { return document.getElementById(id); }
  function hi() { return typeof uiLanguage !== 'undefined' && uiLanguage === 'hi'; }
  function isBig() { return !!(root.BIG && BIG.active && BIG.ds); }
  function HD() { return isBig() ? BIG.headers : headers; }
  function RD() { return isBig() ? STL.bigCharts.sample.rows : rawData; }
  function viewIdx() { return isBig() ? STL.bigCharts.sample.idx : (typeof getDisplayData === 'function' ? getDisplayData() : rawData.map(function (_, i) { return i; })); }
  var DS = null, chart = null;
  function dispose() { if (chart) { try { chart.dispose(); } catch (e) {} chart = null; } }

  STL.openDrivers = function (preset) {
    if (!isBig() && !U.hasData()) { toast(T('Open a file first, or try the sample data.', 'पहले फ़ाइल खोलें, या नमूना डेटा आज़माएँ।'), 'info'); return; }
    var go = function () {
      var prof = CH.profile(HD(), RD(), viewIdx()), nums = CH.rankMeasures(prof.filter(CH.isMeasure));
      DS = { prof: prof, y: preset && preset.y >= 0 ? preset.y : (nums[0] ? nums[0].index : -1), noZero: false, seq: 0 };
      var p = prof[DS.y]; DS.noZero = preset && preset.noZero !== undefined ? !!preset.noZero : !!(p && p.score && p.zeroPct >= 0.01);
      render(); compute();
    };
    if (isBig() && STL.bigCharts.sample.ds !== BIG.ds) STL.bigCharts.loadSample().then(go).catch(function (e) { toast(e.message, 'error'); }); else go();
  };
  function render() {
    var numCols = DS.prof.filter(function (p) { return p.numeric; });
    var html = '<div class="prj-h"><b>🔍 ' + T('What explains this?', 'इसे क्या समझाता है?') + '</b><button id="drX" aria-label="close">×</button></div>' +
      '<div class="big-note">' + T('Every column is ranked by how much of the differences in the chosen number it goes with. Number columns take part in five equal bands.', 'हर कॉलम को इस आधार पर क्रम दिया जाता है कि चुनी संख्या के अंतर उससे कितने जुड़े हैं। संख्या कॉलम पाँच बराबर समूहों में शामिल होते हैं।') + '</div>' +
      '<div class="fr-form"><label class="rp-field"><span>' + T('The number to explain', 'समझाने वाली संख्या') + '</span><select id="drY" class="big-select">' + numCols.map(function (p) { return '<option value="' + p.index + '"' + (p.index === DS.y ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select></label>' +
      '<label class="rp-inline" style="align-self:end;margin-bottom:8px"><input type="checkbox" id="drZ"' + (DS.noZero ? ' checked' : '') + '> ' + T('Ignore zeros', 'शून्य छोड़ें') + '</label></div><div id="drOut"><div class="big-note">…</div></div>';
    var o = U.overlay('driversDialog', html, true); o.querySelector('.stl-box').classList.add('fr-box');
    $('drX').onclick = function () { dispose(); o.remove(); };
    $('drY').onchange = function () { DS.y = +this.value; var p = DS.prof[DS.y]; DS.noZero = !!(p && p.score && p.zeroPct >= 0.01); $('drZ').checked = DS.noZero; compute(); };
    $('drZ').onchange = function () { DS.noZero = this.checked; compute(); };
  }
  function compute() {
    var out = $('drOut'); if (!out) return; if (DS.y < 0) { out.innerHTML = '<div class="big-err">' + T('This file has no number column.', 'इस फ़ाइल में कोई संख्या वाला कॉलम नहीं।') + '</div>'; return; }
    var seq = ++DS.seq, H = HD(), y = DS.y; out.innerHTML = '<div class="big-note">' + T('Calculating…', 'गणना हो रही है…') + '</div>';
    var done = function (ranked, note) { if (seq !== DS.seq || !$('drOut')) return; DS.ranked = ranked; show(ranked, H[y], note); };
    var fail = function (e) { if ($('drOut')) $('drOut').innerHTML = '<div class="big-err">' + esc(e.message) + '</div>'; };
    var cands = D.candidates(H, DS.prof, y);
    if (!isBig()) { setTimeout(function () { try { var R = D.rank(RD(), viewIdx(), H, y, { prof: DS.prof, candidates: cands, noZero: DS.noZero }); done(D.addRules(R, RD(), viewIdx(), y, H[y], cands)); } catch (e) { fail(e); } }, 20); return; }
    // large file: the engine sums every row, per column (number columns in bands made from the sample's quintiles)
    var sc = STL.bigCharts.scope(), S = STL.bigCharts.sample;
    Promise.all(cands.map(function (c) {
      var b = c.kind === 'num' ? CH.quantileBands(S.idx.map(function (i) { return CH.num(S.rows[i][c.col]); }), 5) : null, body = Object.assign({ kind: 'fair', y: y, factor: c.col, adjusters: [], nozero: DS.noZero }, sc);
      if (b) { body.bands = {}; body.bands[c.col] = b.edges; }
      return STL.bigCharts.api('/api/engine/' + BIG.ds + '/chart', body).then(function (r) {
        return { col: c.col, name: c.name, kind: c.kind, bands: b, levels: r.cells.map(function (cell) { var key = cell.k[0], m = /^b(\d+)$/.exec(key); return { label: b && m ? b.labels[+m[1]] : key, n: cell.n, sy: cell.sy, syy: cell.syy }; }) };
      });
    })).then(function (list) {
      var ranked = D.markWalls(D.finish(list, H[y]), S.rows, S.idx, y, DS.noZero), pairs = D.standInPairs(ranked);
      // stand-ins: the engine adds up every (column, stronger column) pair
      return Promise.all(pairs.map(function (p) {
        var body = Object.assign({ kind: 'fair', y: y, factor: p.x.col, adjusters: [p.z.col], nozero: DS.noZero }, sc), b = {};
        [p.x, p.z].forEach(function (c) { if (c.bands) b[c.col] = c.bands.edges; }); if (Object.keys(b).length) body.bands = b;
        return STL.bigCharts.api('/api/engine/' + BIG.ds + '/chart', body).then(function (r) { return { x: p.x, z: p.z, within: D.within(r.cells.map(function (c) { return { x: c.k[0], z: c.k[1], n: c.n, sy: c.sy, syy: c.syy }; })).omega2 }; });
      })).then(function (res) {
        D.markStandIns(ranked, res); D.addRules(ranked, S.rows, S.idx, y, H[y], cands);
        done(ranked, T('Calculated by the engine from all rows of the file', 'इंजन ने फ़ाइल की सभी पंक्तियों से गणना की') + (ranked.some(function (r) { return r.rule; }) ? T('; the label rule from a sample of ', '; लेबल का नियम ') + CH.indian(S.idx.length) + T(' rows.', ' पंक्तियों के नमूने से।') : '.'));
      });
    }).catch(fail);
  }
  function show(ranked, yName, note) {
    var out = $('drOut'); if (!out) return; dispose();
    var lines = D.summary(ranked, yName, hi()), causes = ranked.filter(function (r) { return !r.derived; }), res = ranked.filter(function (r) { return r.derived; });
    var pct = function (x) { return (Math.round(x * 1000) / 10).toFixed(1) + '%'; }, nv = function (v) { return Math.abs(v) >= 1000 ? CH.indian(Math.round(v)) : (Math.round(v * 100) / 100).toFixed(2); };
    var row = function (r) { return '<tr><td><b>' + esc(r.name) + '</b>' + (r.walls ? ' <span title="' + esc(T('May be a label given by the number', 'शायद संख्या से तय लेबल')) + '">⚠</span>' : '') + (r.kind === 'num' ? ' <em>(' + T('5 bands', '5 समूह') + ')</em>' : '') + (r.standIn ? '<div class="dr-via">↳ ' + esc(T('mostly through ', 'मुख्यतः ')) + '<b>' + esc(r.standIn.name) + '</b>' + esc(T(': inside its groups only ', ' के कारण: उसके समूहों के भीतर केवल ')) + pct(r.standIn.omega2) + '</div>' : '') + (r.partly ? '<div class="dr-via">↳ ' + esc(T('partly through ', 'आंशिक रूप से ')) + '<b>' + esc(r.partly.name) + '</b>' + esc(T(': inside its groups ', ' के कारण: उसके समूहों के भीतर ')) + pct(r.partly.omega2) + '</div>' : '') + '</td><td class="num"><b>' + pct(r.omega2) + '</b></td><td>' + (r.low && r.high ? esc(r.low.label) + ' <em>' + nv(r.low.mean) + '</em> → ' + esc(r.high.label) + ' <em>' + nv(r.high.mean) + '</em>' : '–') + '</td><td><button class="cs-link" data-ch="' + r.col + '">📊 ' + T('Chart', 'चार्ट') + '</button>' + (r.kind === 'cat' && !r.derived ? ' · <button class="cs-link" data-fr="' + r.col + '">⚖ ' + T('Fair check', 'निष्पक्ष जाँच') + '</button>' : '') + '</td></tr>'; };
    var head = '<tr><th>' + T('Column', 'कॉलम') + '</th><th>' + T('Explains', 'समझाता है') + '</th><th>' + T('Lowest → highest average', 'न्यूनतम → अधिकतम औसत') + '</th><th></th></tr>';
    var html = '<div class="fr-verdict" style="border-color:#6d5bd0"><b><span class="fr-ic" style="background:#6d5bd0">🔍</span>' + T('What goes with ', 'किससे जुड़ा है: ') + esc(yName) + '</b>' + lines.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') + '</div>' +
      '<div id="drChart" class="fr-chart" style="height:' + Math.max(180, Math.min(causes.length, 12) * 26 + 50) + 'px"></div>' +
      '<table class="big-tbl fr-tbl">' + head + causes.slice(0, 15).map(row).join('') + '</table>' +
      ranked.filter(function (r) { return r.rule && r.rule.accuracy >= 0.8; }).map(function (r) { var q = r.rule;
        return '<div class="prj-sub dr-rule-h">🧩 ' + esc(T('How “' + r.name + '” is made — a rule found in the data (right for ', '“' + r.name + '” कैसे बनता है — डेटा में मिला नियम (')) + pct(q.accuracy) + esc(T(' of rows)', ' पंक्तियों में सही)')) + '</div>' +
          '<table class="big-tbl fr-tbl dr-rule"><tr><th>' + T('Label', 'लेबल') + '</th><th>' + T('When', 'जब') + '</th><th>' + T('Rows', 'पंक्तियाँ') + '</th><th>' + T('Rule right', 'नियम सही') + '</th></tr>' +
          q.rules.map(function (u) { return '<tr><td><b>' + esc(u.label) + '</b></td><td>' + esc(D.ruleText(u, hi())) + '</td><td class="num">' + CH.indian(u.n) + '</td><td class="num">' + pct(u.right / u.n) + '</td></tr>'; }).join('') + '</table>';
      }).join('') +
      (res.length ? '<div class="prj-sub">' + T('Probably results of ', 'संभवतः परिणाम: ') + esc(yName) + T(' (not causes)', ' (कारण नहीं)') + '</div><table class="big-tbl fr-tbl">' + head + res.map(row).join('') + '</table>' : '') +
      '<div class="fr-how">' + T('“Explains” is ω² (omega squared): the share of the variation in the number that lies between the groups of a column, corrected for chance. It shows which factors go together with the number, not what causes it. ', '“समझाता है” = ω² (ओमेगा स्क्वेयर्ड): संख्या की भिन्नता का वह भाग जो किसी कॉलम के समूहों के बीच है, संयोग के लिए सुधारा हुआ। यह बताता है कि कौन-से कारक संख्या के साथ चलते हैं, कारण नहीं। ') + (note ? esc(note) : '') + '</div>';
    out.innerHTML = html;
    out.querySelectorAll('[data-ch]').forEach(function (b) { b.onclick = function () { var c = +b.dataset.ch, r = ranked.filter(function (q) { return q.col === c; })[0], spec = { x: c, ys: [{ col: DS.y, fn: 'avg' }], noZero: DS.noZero, sort: r && r.kind === 'num' ? 'natural' : 'desc' }; if (r && r.kind === 'num') spec.bands = 6; dispose(); $('driversDialog').remove(); STL.openChartStudio({ type: 'column', spec: spec }); }; });
    out.querySelectorAll('[data-fr]').forEach(function (b) { b.onclick = function () { var c = +b.dataset.fr, others = causes.filter(function (r) { return r.col !== c && !r.walls && !r.standIn && r.omega2 >= 0.005; }).slice(0, 3).map(function (r) { return r.col; }); dispose(); $('driversDialog').remove(); STL.openFair({ y: DS.y, f: c, adj: others, noZero: DS.noZero }); }; });
    STL.ensureECharts(function () {
      var el = $('drChart'); if (!el) return; var top = causes.slice(0, 12).reverse(), names = top.map(function (r) { return r.name + (r.walls ? ' ⚠' : r.standIn ? ' ↳' : ''); }), env = CH.kit.envOf({ hi: hi() }), K = CH.kit, o = K.base({ toolbox: false }, env);
      o.legend = undefined; o.tooltip.trigger = 'axis'; o.tooltip.axisPointer = { type: 'shadow' }; o.tooltip.valueFormatter = function (v) { return v.toFixed(1) + '%'; };
      o.grid = { left: 12, right: 50, top: 10, bottom: 10, containLabel: true }; o.xAxis = K.valueAxis(env, '', function (v) { return v + '%'; }); o.yAxis = K.catAxis(env, names);
      o.series = [{ type: 'bar', barMaxWidth: 18, itemStyle: { color: '#6d5bd0', borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', color: env.sub, formatter: function (p) { return p.value.toFixed(1) + '%'; } }, data: top.map(function (r) { var v = Math.round(r.omega2 * 1000) / 10; return r.walls ? { value: v, itemStyle: { color: '#d9a03b' } } : r.standIn ? { value: v, itemStyle: { color: '#b9b3d6' } } : v; }) }];   // grey: stands in for a stronger column   // amber: may be a label given by the number
      chart = echarts.init(el, null, { renderer: 'canvas' }); chart.setOption(o);
    });
  }
  (STL.actions || []).push({ en: 'What explains this number? (key drivers)', hi: 'इस संख्या को क्या समझाता है? (मुख्य कारक)', kw: 'what explains key drivers factors influence why cause importance variance which column matters', run: function () { STL.openDrivers(); }, group: 'Charts' });
})(typeof window !== 'undefined' ? window : globalThis);
