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
  // every real factor (1% or more) against EVERY stronger real factor; stand-ins found on the way are not used as
  // the stronger column for others (markStandIns goes strongest first)
  D.standInPairs = function (ranked) {
    var real = ranked.filter(function (r) { return !r.derived && !r.walls && !(r.standIn && r.standIn.made) && r.omega2 >= 0.01; }), pairs = [];
    real.forEach(function (r, i) { for (var k = 0; k < i; k++) if (real[k].omega2 > r.omega2) pairs.push({ x: r, z: real[k] }); });
    return pairs;
  };
  D.markStandIns = function (ranked, results) {
    // strongest first, so a column that is itself a stand-in is never used to explain another one
    ranked.forEach(function (r) {
      if (r.standIn && r.standIn.made) return;
      var q = null; results.forEach(function (p) { if (p.x === r && !p.z.standIn && (!q || p.within < q.within)) q = p; });
      if (q) { r.inside = { col: q.z.col, name: q.z.name, omega2: q.within }; if (q.within < Math.max(0.005, Math.min(0.01, 0.3 * r.omega2))) r.standIn = r.inside; else if (q.within < 0.6 * r.omega2) r.partly = r.inside; }   // stand-in: almost nothing (< 1%) is left inside the stronger column
    });
    return ranked;
  };
  // a text column can be MADE OF two or three others (a label built from age group and region): every combination of
  // them carries one value of it (98% of rows or more) while no single one of them does. It is then a summary of
  // those columns, not a cause of its own - even when it is the strongest column. Found from the rows (on a large
  // file from its sample: this is about how the file is built, not about sizes)
  D.findComposites = function (ranked, rows, idx, y, noZero) {
    var C = CH(), real = ranked.filter(function (r) { return !r.derived && !r.walls && !r.standIn && r.omega2 >= 0.01; });
    var X = real.filter(function (r) { return r.kind === 'cat' && r.k >= 3; }); if (!X.length || real.length < 3) return ranked;
    var keep = [], ys = []; for (var k = 0; k < idx.length; k++) { var v = C.num(rows[idx[k]][y]); if (v === null || (noZero && v === 0)) continue; keep.push(idx[k]); ys.push(v); }
    var codes = {}, sizes = {}; real.forEach(function (c) { var map = {}, m = 0, a = new Int32Array(keep.length); for (var t = 0; t < keep.length; t++) { var key = keyOf(rows[keep[t]], c, C); a[t] = key in map ? map[key] : (map[key] = m++); } codes[c.col] = a; sizes[c.col] = m; });
    function zkey(cols, t) { var z = 0; for (var u = 0; u < cols.length; u++) z = z * sizes[cols[u]] + codes[cols[u]][t]; return z; }
    function purity(xc, cols) {                                         // share of rows whose value is the most common one in their combination
      var by = {}; for (var t = 0; t < keep.length; t++) { var z = zkey(cols, t), o = by[z] || (by[z] = {}); o[codes[xc][t]] = (o[codes[xc][t]] || 0) + 1; }
      var ok = 0; Object.keys(by).forEach(function (z) { var o = by[z], b = 0; Object.keys(o).forEach(function (q) { if (o[q] > b) b = o[q]; }); ok += b; }); return ok / keep.length;
    }
    var done = {};
    X.forEach(function (x) {
      var pool = real.filter(function (z) { return z !== x && !done[z.col]; }).slice(0, 8); if (pool.length < 2) return;
      if (pool.some(function (z) { return purity(x.col, [z.col]) >= 0.9; })) return;      // one column alone fixes it: not a combination
      var sets = []; for (var a = 0; a < pool.length; a++) for (var b = a + 1; b < pool.length; b++) { sets.push([pool[a], pool[b]]); for (var c = b + 1; c < pool.length; c++) sets.push([pool[a], pool[b], pool[c]]); }
      sets.sort(function (p, q) { return p.length - q.length; });
      for (var q = 0; q < sets.length; q++) {
        var cols = sets[q].map(function (z) { return z.col; }); if (purity(x.col, cols) < 0.98) continue;
        var cells = {}; for (var t = 0; t < keep.length; t++) { var key = zkey(cols, t) * sizes[x.col] + codes[x.col][t], o = cells[key] || (cells[key] = { z: zkey(cols, t), x: codes[x.col][t], n: 0, sy: 0, syy: 0 }); o.n++; o.sy += ys[t]; o.syy += ys[t] * ys[t]; }
        var ij = insideAndJoint(Object.keys(cells).map(function (k2) { return cells[k2]; }));
        x.standIn = { col: -1, cols: cols, name: sets[q].map(function (z) { return z.name; }).join(' + '), omega2: ij.within, made: true }; delete x.partly; done[x.col] = 1;
        break;
      }
    });
    return ranked;
  };
  // cells by (z key, x) -> the share x adds inside z, and the share z explains on its own
  function insideAndJoint(cells) {
    var zc = {}; cells.forEach(function (c) { var o = zc[c.z] || (zc[c.z] = { n: 0, sy: 0, syy: 0 }); o.n += c.n; o.sy += c.sy; o.syy += c.syy; });
    return { within: D.within(cells).omega2, joint: D.omega(Object.keys(zc).map(function (k) { return zc[k]; })).omega2 };
  }
  D.insideAndJoint = insideAndJoint;
  D.findStandIns = function (ranked, rows, idx, y, noZero) {
    D.findComposites(ranked, rows, idx, y, noZero);
    var C = CH(), pairs = D.standInPairs(ranked); if (!pairs.length) return ranked;
    // each column's group of every row, as a small whole number, once; then a pair is one pass over typed arrays
    var keep = [], ys = [];
    for (var k = 0; k < idx.length; k++) { var v = C.num(rows[idx[k]][y]); if (v === null || (noZero && v === 0)) continue; keep.push(idx[k]); ys.push(v); }
    var codes = {}, sizes = {};
    var codeCols = []; pairs.forEach(function (p) { codeCols.push(p.x, p.z); }); ranked.forEach(function (r) { if (!r.derived && !r.walls && r.omega2 >= 0.01) codeCols.push(r); });
    codeCols.forEach(function (c) { (function (c) { if (codes[c.col]) return; var map = {}, m = 0, a = new Int32Array(keep.length); for (var t = 0; t < keep.length; t++) { var key = keyOf(rows[keep[t]], c, C); a[t] = key in map ? map[key] : (map[key] = m++); } codes[c.col] = a; sizes[c.col] = m; })(c); });
    function inside(xc, zcols) {
      var ax = codes[xc], kx = sizes[xc], cells = {};
      for (var t = 0; t < keep.length; t++) { var zk = 0; for (var u = 0; u < zcols.length; u++) zk = zk * sizes[zcols[u]] + codes[zcols[u]][t]; var key = zk * kx + ax[t], o = cells[key] || (cells[key] = { z: zk, x: ax[t], n: 0, sy: 0, syy: 0 }); o.n++; o.sy += ys[t]; o.syy += ys[t] * ys[t]; }
      return insideAndJoint(Object.keys(cells).map(function (q) { return cells[q]; }));
    }
    return D.markStandIns(ranked, pairs.map(function (p) { return { x: p.x, z: p.z, within: inside(p.x.col, [p.z.col]).within }; }));
  };

  // ---------------------------------------------------------------- rule finder
  // How is a label made? A small decision tree (Gini, like CART) on the number columns, cut at ROUND numbers
  // ("waste < 10", "waste ≥ 10": no value falls between two rules), then turned into a SHORT ORDERED LIST - the first
  // rule that fits gives the label, the rest is "otherwise" - with every condition that does not help dropped:
  //   1. temperature < 48 → Non-compliant   2. waste < 10 and temperature ≥ 60 and sourcing ≥ 75 → Exemplary
  //   3. waste ≥ 20, or temperature < 55, or cost ≥ 14,000 → Marginal          otherwise → Standard
  // Large inputs are learned from a sample that keeps every label (weighted back) and then checked on every row.
  //   features: [{ col, name }]   opt: { depth: 5, minLeaf, weights: { label: w }, maxRows: 20000 }
  //   -> { list: [{ label, conds: [{ col, name, min?, max? }], n, right }], otherwise: { label, n, right },
  //        accuracy, n, used, usedCols, classes, learnedOn }
  D.niceCut = function (a, b) {                                   // the roundest number c with a < c <= b
    if (!(b > a)) return b;
    for (var k = 9; k >= -9; k--) {
      var steps = [Math.pow(10, k) * 5, Math.pow(10, k) * 2, Math.pow(10, k)];
      for (var t = 0; t < steps.length; t++) {
        var st = steps[t], c = Math.ceil(a / st) * st; c = +c.toPrecision(12); if (c <= a) c = +(c + st).toPrecision(12);
        if (c > a && c <= b) return c;
      }
    }
    return b;
  };
  function fits(conds, X, i) { for (var q = 0; q < conds.length; q++) { var c = conds[q], v = X[c.j][i]; if (c.set) { var inn = c.set[v] === 1; if (c.neg ? inn : !inn) return false; continue; } if (c.min !== undefined && !(v >= c.min)) return false; if (c.max !== undefined && !(v < c.max)) return false; } return true; }
  // how round a number is: fewer decimals, then fewer significant digits (30 is rounder than 30.1, 14,000 than 13,900)
  function roundness(v) { var t = String(+(+v).toPrecision(12)), d = (t.split('.')[1] || '').length, sig = t.replace(/^-|\.|e.*$/g, '').replace(/^0+/, '').replace(/0+$/, '').length; return d * 100 + sig; }
  D.findRule = function (rows, idx, labelCol, features, opt) {
    opt = opt || {}; var C = CH(), maxDepth = opt.depth || 5, W = opt.weights || null;
    // the rows to learn from: all of them, or (over maxRows) an equal share of every label, weighed back
    var byLab = {}, order = [];
    idx.forEach(function (i) { var l = s(rows[i][labelCol]).trim(); if (!l) return; if (!byLab[l]) { byLab[l] = []; order.push(l); } byLab[l].push(i); });
    var all = 0; order.forEach(function (l) { all += byLab[l].length; });
    var maxRows = opt.maxRows || 20000, learn = [], wOf = {};
    if (all > maxRows && !W) {
      var per = Math.max(50, Math.floor(maxRows / Math.max(1, order.length)));
      order.forEach(function (l) { var list = byLab[l], take = Math.min(per, list.length), step = list.length / take; for (var t = 0; t < take; t++) learn.push(list[Math.floor(t * step)]); wOf[l] = list.length / take; });
    } else { order.forEach(function (l) { learn = learn.concat(byLab[l]); wOf[l] = W && W[l] ? W[l] : 1; }); }
    var names = order.slice(), cls = {}; names.forEach(function (l, k) { cls[l] = k; });
    var K = names.length, n = learn.length; if (n < 30 || K < 2) return null;
    var lab = new Int32Array(n), w = new Float64Array(n), X = features.map(function () { return new Float64Array(n); });
    var LV = features.map(function () { return { codes: {}, list: [] }; });         // text columns: each value becomes a small whole number
    learn.forEach(function (ri, k) { var l = s(rows[ri][labelCol]).trim(); lab[k] = cls[l]; w[k] = wOf[l]; features.forEach(function (f, j) {
      if (f.kind === 'cat') { var t = s(rows[ri][f.col]).trim(), L = LV[j]; if (!(t in L.codes)) { L.codes[t] = L.list.length; L.list.push(t); } X[j][k] = L.codes[t]; return; }
      var v = C.num(rows[ri][f.col]); X[j][k] = v === null ? Infinity : v; }); });
    var minLeaf = opt.minLeaf || Math.max(10, Math.round(n * 0.003));
    function counts(ids) { var c = new Float64Array(K); for (var t = 0; t < ids.length; t++) c[lab[ids[t]]] += w[ids[t]]; return c; }
    function sum(c) { var x = 0; for (var t = 0; t < c.length; t++) x += c[t]; return x; }
    function gini(c, m) { if (!(m > 0)) return 0; var g = 1; for (var t = 0; t < c.length; t++) g -= (c[t] / m) * (c[t] / m); return g; }
    function major(c) { var b = 0; for (var t = 1; t < c.length; t++) if (c[t] > c[b]) b = t; return b; }
    function grow(ids, depth) {
      var c = counts(ids), m = sum(c), node = { cls: major(c) };
      if (depth >= maxDepth || c[node.cls] >= m - 1e-9 || ids.length < 2 * minLeaf) return node;
      var g0 = gini(c, m), best = null;
      features.forEach(function (f, j) {
        if (f.kind === 'cat') {                                        // a group of values against the rest: for every label, the values
          var nl = LV[j].list.length; if (nl < 2 || nl > 60) return;   // sorted by how often they carry it, cut after each one (Breiman)
          var pc = []; for (var v = 0; v < nl; v++) pc.push(new Float64Array(K));
          for (var t0 = 0; t0 < ids.length; t0++) pc[X[j][ids[t0]]][lab[ids[t0]]] += w[ids[t0]];
          var tot = pc.map(sum), cnt = new Int32Array(nl); for (var t1 = 0; t1 < ids.length; t1++) cnt[X[j][ids[t1]]]++;
          for (var kk = 0; kk < Math.min(K, 10); kk++) {
            var ordv = []; for (var v2 = 0; v2 < nl; v2++) if (tot[v2] > 0) ordv.push(v2);
            ordv.sort(function (a, b) { return pc[b][kk] / tot[b] - pc[a][kk] / tot[a]; });
            var Lc = new Float64Array(K), lm2 = 0, ln = 0, set = {};
            for (var q = 0; q < ordv.length - 1; q++) {
              var vv = ordv[q]; set[vv] = 1; lm2 += tot[vv]; ln += cnt[vv]; for (var z = 0; z < K; z++) Lc[z] += pc[vv][z];
              if (ln < minLeaf || ids.length - ln < minLeaf) continue;
              var Rc = new Float64Array(K); for (var z2 = 0; z2 < K; z2++) Rc[z2] = c[z2] - Lc[z2];
              var g = g0 - (lm2 * gini(Lc, lm2) + (m - lm2) * gini(Rc, m - lm2)) / m;
              if (!best || g > best.gain + 1e-12) best = { gain: g, j: j, set: JSON.parse(JSON.stringify(set)) };
            }
          }
          return;
        }
        var col = X[j], ord = Array.prototype.slice.call(ids).sort(function (a, b) { return col[a] - col[b]; }), L = new Float64Array(K), R = Float64Array.from(c), lm = 0;
        for (var t = 0; t < ids.length - 1; t++) {
          var i = ord[t]; L[lab[i]] += w[i]; R[lab[i]] -= w[i]; lm += w[i];
          var a = col[i], b = col[ord[t + 1]]; if (a === b || t + 1 < minLeaf || ids.length - t - 1 < minLeaf || b === Infinity) continue;
          var gain = g0 - (lm * gini(L, lm) + (m - lm) * gini(R, m - lm)) / m;
          if (!best || gain > best.gain + 1e-12) best = { gain: gain, j: j, a: a, b: b, cut: t + 1, ord: ord };
        }
      });
      if (!best || best.gain < 1e-4) return node;
      node.f = best.j;
      if (best.set) { node.set = best.set; var li = [], ri2 = []; for (var t2 = 0; t2 < ids.length; t2++) (best.set[X[best.j][ids[t2]]] === 1 ? li : ri2).push(ids[t2]); node.l = grow(li, depth + 1); node.r = grow(ri2, depth + 1); }
      else { node.v = D.niceCut(best.a, best.b); node.l = grow(best.ord.slice(0, best.cut), depth + 1); node.r = grow(best.ord.slice(best.cut), depth + 1); }
      if (node.l.f === undefined && node.r.f === undefined && node.l.cls === node.r.cls) { delete node.f; delete node.l; delete node.r; }
      return node;
    }
    var root = grow(Array.from({ length: n }, function (_, k) { return k; }), 0), leaves = [];
    (function walk(nd, b, tx) {
      if (nd.f === undefined) { var cs = []; Object.keys(b).forEach(function (j) { if (isFinite(b[j].min)) cs.push({ j: +j, min: b[j].min }); if (isFinite(b[j].max)) cs.push({ j: +j, max: b[j].max }); }); leaves.push({ cls: nd.cls, conds: cs.concat(tx) }); return; }   // each end of a range on its own, so either can be dropped
      if (nd.set) { walk(nd.l, b, tx.concat([{ j: nd.f, set: nd.set }])); walk(nd.r, b, tx.concat([{ j: nd.f, set: nd.set, neg: true }])); return; }
      var lb = JSON.parse(JSON.stringify(b)), rb = JSON.parse(JSON.stringify(b));
      (lb[nd.f] = lb[nd.f] || {}).max = Math.min(lb[nd.f].max === undefined ? Infinity : lb[nd.f].max, nd.v);
      var r0 = (rb[nd.f] = rb[nd.f] || {}); r0.min = Math.max(r0.min === undefined ? -Infinity : r0.min, nd.v);
      walk(nd.l, lb, tx); walk(nd.r, rb, tx);
    })(root, {}, []);
    // the ordered list: again and again take the rule that labels most rows (among the nearly most precise ones) on
    // the rows not yet labelled, after dropping every condition that costs (almost) no precision there. Every label is
    // tried as "otherwise"; the simplest list that is (nearly) as accurate as the best one wins.
    var tol = opt.tol || 0.002, ALL = Array.from({ length: n }, function (_, k) { return k; });
    function score(conds, k, ids) { var cov = 0, ok = 0; for (var t = 0; t < ids.length; t++) { var i = ids[t]; if (fits(conds, X, i)) { cov += w[i]; if (lab[i] === k) ok += w[i]; } } return { cov: cov, ok: ok, p: cov > 0 ? ok / cov : 0 }; }
    function simplify(rule, ids) {
      var conds = rule.conds.slice(), cur = score(conds, rule.cls, ids), changed = true;
      while (changed && conds.length) {
        changed = false; var best = null;
        for (var q = 0; q < conds.length; q++) { var tr = conds.slice(0, q).concat(conds.slice(q + 1)), sc = score(tr, rule.cls, ids); if (sc.p >= cur.p - tol && (!best || sc.p > best.sc.p + 1e-12 || (Math.abs(sc.p - best.sc.p) <= 1e-12 && sc.cov > best.sc.cov))) best = { conds: tr, sc: sc }; }
        if (best) { conds = best.conds; cur = best.sc; changed = true; }
      }
      return { cls: rule.cls, conds: conds, sc: cur };
    }
    function acc(L, dflt) { var ok = 0, tot = 0; for (var i = 0; i < n; i++) { var p = dflt; for (var q = 0; q < L.length; q++) if (fits(L[q].conds, X, i)) { p = L[q].cls; break; } tot += w[i]; if (p === lab[i]) ok += w[i]; } return ok / tot; }
    function build(dflt) {
      var left = ALL.slice(), list = [], cand = leaves.filter(function (r) { return r.cls !== dflt; });
      while (left.length && cand.length && list.length < 12) {
        var opts = cand.map(function (r, ci) { var sr = simplify(r, left), dw = score(sr.conds, dflt, left).ok; return { ci: ci, sr: sr, gain: sr.sc.ok - dw }; }).filter(function (o) { return o.gain > 0 && o.sr.sc.cov >= minLeaf * 0.5; });
        if (!opts.length) break;
        var maxP = Math.max.apply(null, opts.map(function (o) { return o.sr.sc.p; }));
        var pick = opts.filter(function (o) { return o.sr.sc.p >= maxP - 0.01; }).sort(function (a, b) { return b.sr.sc.cov - a.sr.sc.cov; })[0];
        list.push({ cls: pick.sr.cls, conds: pick.sr.conds }); cand.splice(pick.ci, 1);
        left = left.filter(function (i) { return !fits(pick.sr.conds, X, i); });
      }
      var a0 = acc(list, dflt);
      for (var q = list.length - 1; q >= 0; q--) { var tr = list.slice(0, q).concat(list.slice(q + 1)), a1 = acc(tr, dflt); if (a1 >= a0 - 0.0005) { list = tr; a0 = a1; } }   // drop rules the rest already gets right
      return { list: list, dflt: dflt, acc: a0, size: list.reduce(function (a, r) { return a + r.conds.length + 1; }, 0) };
    }
    var tries = names.map(function (_, k) { return build(k); }), bestAcc = Math.max.apply(null, tries.map(function (t) { return t.acc; }));
    var chosen = tries.filter(function (t) { return t.acc >= bestAcc - 0.003; }).sort(function (a, b) { return a.size - b.size || b.acc - a.acc; })[0];
    var list = chosen.list, dflt = chosen.dflt;
    // a cut inherited from a split made for other rows may sit a little off: slide every cut to the nearby round
    // values (25 distinct values either side); keep a move that makes the list more accurate, or as accurate and rounder
    var sorted = features.map(function (f, j) { if (f.kind === 'cat') return []; var u = {}; for (var i = 0; i < n; i++) if (isFinite(X[j][i])) u[X[j][i]] = 1; return Object.keys(u).map(Number).sort(function (a, b) { return a - b; }); });
    function slide(L, only) {                                  // only: slide just this line, and on a tie take the rounder cut
      var cur = acc(L, dflt);
      L.forEach(function (r) { if (only && r !== only) return; r.conds.forEach(function (c) {
        ['min', 'max'].forEach(function (side) {
          if (c[side] === undefined) return; var u = sorted[c.j], at = 0; while (at < u.length && u[at] < c[side]) at++;
          var best = c[side];
          for (var d = -25; d <= 25; d++) { var k = at + d; if (k <= 0 || k >= u.length) continue; var v = D.niceCut(u[k - 1], u[k]); if (v === best) continue; var keep = c[side]; c[side] = v; var a = acc(L, dflt); if (a > cur + 1e-12 || (only && a > cur - 1e-12 && roundness(v) < roundness(best))) { cur = Math.max(cur, a); best = v; } c[side] = keep; }
          c[side] = best;
        });
      }); });
    }
    // polish: drop any condition the whole list does not need; move a line up when that lets a condition go, and next
    // to a line with the same label (they then read as one line with "or")
    var floor = acc(list, dflt) - 0.002;
    function dropAll(L) {
      var a = acc(L, dflt), did = false;
      L.forEach(function (r) { for (var q = r.conds.length - 1; q >= 0; q--) { var keep = r.conds.splice(q, 1)[0], b = acc(L, dflt); if (b >= a - 0.0005 && b >= floor) { a = b; did = true; } else r.conds.splice(q, 0, keep); } });
      return did;
    }
    var size = function (L) { return L.reduce(function (a, r) { return a + r.conds.length; }, 0); };
    var groups = function (L) { var g = 0; L.forEach(function (r, k) { if (!k || L[k - 1].cls !== r.cls) g++; }); return g; };
    function polish(L) {
      dropAll(L);
      for (var moved = true, pass = 0; moved && pass < 20; pass++) {
        moved = false; var a0 = acc(L, dflt);
        for (var i = 1; i < L.length && !moved; i++) {
          for (var to = 0; to < i && !moved; to++) {
            var tr = L.slice(); var it = tr.splice(i, 1)[0]; tr.splice(to, 0, it); tr = tr.map(function (r) { return { cls: r.cls, conds: r.conds.slice() }; });
            var a1 = acc(tr, dflt); if (a1 < a0 - 1e-9) continue;
            var before = size(tr); dropAll(tr);
            if (size(tr) < before || groups(tr) < groups(L)) { L = tr; moved = true; }
          }
        }
      }
      return L;
    }
    slide(list); list = polish(list);
    // repair: small groups the tree could not reach (too few rows for a leaf) - one condition taken from a wrongly
    // labelled row, put first, kept when it puts at least 3 rows right at 95% precision ("waste ≥ 30 → Non-compliant")
    function predict(L) { var p = new Int32Array(n); for (var i = 0; i < n; i++) { p[i] = dflt; for (var q = 0; q < L.length; q++) if (fits(L[q].conds, X, i)) { p[i] = L[q].cls; break; } } return p; }
    for (var rep = 0; rep < 4; rep++) {
      var pred = predict(list), wrong = []; for (var i = 0; i < n; i++) if (pred[i] !== lab[i]) wrong.push(i);
      if (wrong.length < 3) break;
      var pickW = wrong.length > 80 ? wrong.filter(function (_, k) { return k % Math.ceil(wrong.length / 80) === 0; }) : wrong, seen = {}, bestR = null;
      pickW.forEach(function (i) {
        features.forEach(function (f, j) {
          var cs = [];
          if (f.kind === 'cat') cs.push({ j: j, set: (function () { var o = {}; o[X[j][i]] = 1; return o; })() });
          else { var v = X[j][i]; if (!isFinite(v)) return; var u = sorted[j], at = 0; while (at < u.length && u[at] < v) at++; if (at > 0) cs.push({ j: j, min: D.niceCut(u[at - 1], v) }); if (at + 1 < u.length) cs.push({ j: j, max: D.niceCut(v, u[at + 1]) }); }
          cs.forEach(function (c) {
            var key = j + '|' + (c.set ? 's' + X[j][i] : c.min !== undefined ? 'n' + c.min : 'x' + c.max) + '|' + lab[i]; if (seen[key]) return; seen[key] = 1;
            var cov = 0, ok = 0, fix = 0, brk = 0;
            for (var t = 0; t < n; t++) if (fits([c], X, t)) { cov += w[t]; if (lab[t] === lab[i]) { ok += w[t]; if (pred[t] !== lab[t]) fix++; } else if (pred[t] === lab[t]) brk++; }
            var gain = fix - brk; if (gain < 3 || ok / cov < 0.95) return;
            if (!bestR || gain > bestR.gain || (gain === bestR.gain && cov > bestR.cov)) bestR = { gain: gain, cov: cov, rule: { cls: lab[i], conds: [c] } };
          });
        });
      });
      if (!bestR) break;
      list = [bestR.rule].concat(list); slide(list, bestR.rule); floor = Math.min(floor, acc(list, dflt) - 0.002);
    }
    slide(list); list = polish(list);
    var used = {}; list.forEach(function (r) { r.conds.forEach(function (c) { used[c.j] = 1; }); });
    var out = {
      list: list.map(function (r) { var by = {}, ord = []; r.conds.forEach(function (c) { var o = by[c.j]; if (!o) { o = by[c.j] = { col: features[c.j].col, name: features[c.j].name }; ord.push(o); }
        if (c.set) { var ok = LV[c.j].list.map(function (_, v) { return v; }).filter(function (v) { var inn = c.set[v] === 1; return c.neg ? !inn : inn; }); o.allow = o.allow ? o.allow.filter(function (v) { return ok.indexOf(v) >= 0; }) : ok; }
        if (c.min !== undefined) o.min = c.min; if (c.max !== undefined) o.max = c.max; });
        ord.forEach(function (o, k) { if (!o.allow) return; var j = features.map(function (f) { return f.col; }).indexOf(o.col), L = LV[j].list, inV = o.allow.map(function (v) { return L[v]; }), outV = L.filter(function (_, v) { return o.allow.indexOf(v) < 0; });
          if (inV.length <= outV.length) o.values = inV; else o.notValues = outV;          // the shorter way to say it; a value never seen counts as "not"
          delete o.allow; });
        return { label: names[r.cls], conds: ord, n: 0, right: 0 }; }),
      otherwise: { label: names[dflt], n: 0, right: 0 }, classes: names,
      used: Object.keys(used).map(function (j) { return features[j].name; }), usedCols: Object.keys(used).map(function (j) { return features[j].col; }),
      learnedOn: n, sampled: n < all
    };
    // how the list does on EVERY row given (not only the ones it learned from)
    D.checkRule(out, rows, idx, labelCol);
    return out;
  };
  D.checkRule = function (q, rows, idx, labelCol) {
    var C = CH(), tot = 0, ok = 0;
    q.list.forEach(function (r) { r.n = 0; r.right = 0; }); q.otherwise.n = 0; q.otherwise.right = 0;
    idx.forEach(function (i) {
      var r = rows[i], l = s(r[labelCol]).trim(); if (!l) return;
      var hit = q.otherwise;
      for (var k = 0; k < q.list.length; k++) { var ru = q.list[k], good = true; for (var c = 0; c < ru.conds.length && good; c++) { var cd = ru.conds[c]; if (cd.values || cd.notValues) { var tv = s(r[cd.col]).trim(); if (cd.values ? cd.values.indexOf(tv) < 0 : cd.notValues.indexOf(tv) >= 0) good = false; continue; } var v = C.num(r[cd.col]); v = v === null ? Infinity : v; if (cd.min !== undefined && !(v >= cd.min)) good = false; if (cd.max !== undefined && !(v < cd.max)) good = false; } if (good) { hit = ru; break; } }
      hit.n++; tot++; if (l === hit.label) { hit.right++; ok++; }
    });
    q.n = tot; q.accuracy = tot ? ok / tot : 0; q.checkedOn = tot;
    return q;
  };
  // the same check on every row of a large file, by the engine
  D.applyCheck = function (q, res) {
    q.list.forEach(function (r, k) { r.n = res.rules[k].n; r.right = res.rules[k].right; });
    q.otherwise.n = res.otherwise.n; q.otherwise.right = res.otherwise.right; q.n = res.n; q.accuracy = res.n ? res.right / res.n : 0; q.checkedOn = res.n;
    return q;
  };
  // consecutive rules with the same label read as one line: "waste ≥ 20, or temperature < 55, or cost ≥ 14,000"
  D.ruleLines = function (q) {
    var out = [];
    q.list.forEach(function (r) { var last = out[out.length - 1]; if (last && last.label === r.label) { last.parts.push(r); last.n += r.n; last.right += r.right; } else out.push({ label: r.label, parts: [r], n: r.n, right: r.right }); });
    return out;
  };
  // 99.954% must not read as 100%
  D.accText = function (a) { var p = a * 100; return (p < 100 && p >= 99.95 ? (Math.floor(p * 100) / 100).toFixed(2) : p >= 99.95 ? '100' : p.toFixed(1)) + '%'; };
  D.condText = function (c, hi) {
    var f = function (v) { return Math.abs(v) >= 1000 ? CH().indian(v) : String(+v.toPrecision(10)); };
    if (c.values || c.notValues) {
      var vs = (c.values || c.notValues).map(function (v) { return '“' + (v === '' ? (hi ? '(खाली)' : '(blank)') : v) + '”'; }), more = vs.length > 6 ? vs.slice(0, 5).concat([(hi ? 'और ' : '') + (vs.length - 5) + (hi ? ' अन्य' : ' more')]) : vs;
      return c.name + (c.values ? (hi ? ' = ' : ' is ') : (hi ? ' ≠ ' : ' is not ')) + more.join(hi ? ' या ' : ' or ');
    }
    if (c.min !== undefined && c.max !== undefined) return f(c.min) + ' ≤ ' + c.name + ' < ' + f(c.max);
    return c.name + (c.max !== undefined ? ' < ' + f(c.max) : ' ≥ ' + f(c.min));
  };
  D.ruleText = function (rule, hi) {
    if (!rule.conds.length) return hi ? 'बाकी सभी पंक्तियाँ' : 'all other rows';
    return rule.conds.map(function (c) { return D.condText(c, hi); }).join(hi ? ' और ' : ' and ');
  };
  D.lineText = function (line, hi) { return line.parts.map(function (r) { return D.ruleText(r, hi); }).join(hi ? ', या ' : ', or '); };

  // for every column flagged as a possible label: the rule that makes it, from the number and the other number columns
  // the columns a label rule may use: the number, the other number columns and the text columns that are real
  // factors (not the label itself, not another label or a result of the number)
  D.ruleFeatures = function (y, yName, cands, ranked, labelCol) {
    var bad = {}; (ranked || []).forEach(function (r) { if (r.derived || r.walls) bad[r.col] = 1; });
    var nums = cands.filter(function (c) { return c.kind === 'num' && c.col !== y && !D.sharesName(c.name, yName).length; }).slice(0, 30).map(function (c) { return { col: c.col, name: c.name }; });
    var cats = cands.filter(function (c) { return c.kind === 'cat' && c.col !== labelCol && !bad[c.col] && !D.sharesName(c.name, yName).length; }).slice(0, 15).map(function (c) { return { col: c.col, name: c.name, kind: 'cat' }; });
    return [{ col: y, name: yName }].concat(nums, cats);
  };
  D.addRules = function (ranked, rows, idx, y, yName, cands) {
    ranked.forEach(function (r) { if (r.walls) { try { r.rule = D.findRule(rows, idx, r.col, D.ruleFeatures(y, yName, cands, ranked, r.col)); } catch (e) { r.rule = null; } } });
    return ranked;
  };

  D.summary = function (ranked, yName, hi) {
    var f = function (x) { return (Math.round(x * 1000) / 10) + '%'; }, n2 = function (v) { return Math.abs(v) >= 1000 ? CH().indian(Math.round(v)) : String(Math.round(v * 100) / 100); };
    var causes = ranked.filter(function (r) { return !r.derived; }), res = ranked.filter(function (r) { return r.derived; }), out = [];
    var lab = causes.filter(function (r) { return r.walls; }); causes = causes.filter(function (r) { return !r.walls; });   // possible labels are told apart, not led with
    var top = causes.filter(function (r) { return !r.standIn; })[0];                // a column made of others is never the headline
    if (top && top.omega2 >= 0.005) {
      out.push(hi ? '“' + yName + '” के अंतर सबसे अधिक “' + top.name + '” से जुड़े हैं (भिन्नता का ' + f(top.omega2) + ' समझाता है)' + (top.high && top.low ? ': ' + n2(top.low.mean) + ' (' + top.low.label + ') से ' + n2(top.high.mean) + ' (' + top.high.label + ') तक।' : '।')
                  : 'The differences in “' + yName + '” go most with “' + top.name + '” (it explains ' + f(top.omega2) + ' of the variation)' + (top.high && top.low ? ': from ' + n2(top.low.mean) + ' (' + top.low.label + ') to ' + n2(top.high.mean) + ' (' + top.high.label + ').' : '.'));
      var next = causes.filter(function (r) { return r !== top && r.omega2 >= 0.005 && !r.standIn; }).slice(0, 3), stand = causes.filter(function (r) { return r.standIn; });
      if (next.length) out.push((hi ? 'इसके बाद: ' : 'Next: ') + next.map(function (r) { return r.name + ' ' + f(r.omega2); }).join(', ') + '.');
      stand.forEach(function (r) { var z = r.standIn;
        if (z.made) { var nm = z.name.split(' + ').map(function (x) { return '“' + x + '”'; });
          out.push(hi ? '“' + r.name + '” ' + nm.join(' और ') + ' से बना है (इनके हर संयोजन में इसका एक ही मान है), इसलिए यह उनका सार है, अलग कारण नहीं: कुल मिलाकर ' + f(r.omega2) + ', पर हर संयोजन के भीतर केवल ' + f(z.omega2) + '।'
                      : '“' + r.name + '” is made of ' + nm.join(' and ') + ' (every combination of them has one value of it), so it sums them up and is not a separate cause: it explains ' + f(r.omega2) + ' overall but only ' + f(z.omega2) + ' inside each combination.'); return; }
        out.push(hi ? '“' + r.name + '” मुख्यतः “' + z.name + '” का प्रतिबिंब है: कुल मिलाकर यह ' + f(r.omega2) + ' समझाता है, पर हर “' + z.name + '” समूह के भीतर केवल ' + f(z.omega2) + '। इसे अलग कारण न मानें।'
                    : '“' + r.name + '” mostly stands in for “' + z.name + '”: it explains ' + f(r.omega2) + ' overall but only ' + f(z.omega2) + ' inside each “' + z.name + '” group. Do not count it as a separate cause.'); });
      var weak = causes.filter(function (r) { return r.omega2 < 0.01; }).map(function (r) { return r.name; });
      if (weak.length) out.push(hi ? 'लगभग कोई संबंध नहीं (1% से कम): ' + weak.slice(0, 6).join(', ') + (weak.length > 6 ? ' …' : '।') : 'Almost no link (under 1% each): ' + weak.slice(0, 6).join(', ') + (weak.length > 6 ? ' …' : '.'));
    } else out.push(hi ? 'किसी भी कॉलम का “' + yName + '” से स्पष्ट संबंध नहीं।' : 'No column goes clearly with “' + yName + '”.');
    var ruleLine = function (r) { var q = r.rule; if (!q || q.accuracy < 0.8) return ''; return hi ? ' एक नियम (' + q.used.join(', ') + ' पर) इसे ' + D.accText(q.accuracy) + ' पंक्तियों में दोहराता है — नीचे देखें।' : ' A rule on ' + q.used.join(', ') + ' reproduces it for ' + D.accText(q.accuracy) + ' of rows — see below.'; };
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
    var done = function (ranked, note) {
      if (seq !== DS.seq || !$('drOut')) return; DS.ranked = ranked; show(ranked, H[y], note);
      if (!STL.colChecks) return;
      // formulas and caps: a column calculated FROM the number is a result; then the section at the bottom
      STL.colChecks.run().then(function (res) {
        if (seq !== DS.seq || !$('drOut')) return;
        var moved = false;
        res.formulas.forEach(function (f) { var r = ranked.filter(function (q) { return q.col === f.t; })[0]; if (!r) return; r.formula = f.text;
          if ((f.a === y || f.b === y) && !r.derived) { r.derived = { why: 'formula', text: f.text }; delete r.standIn; delete r.partly; moved = true; } });
        DS.checks = res; if (moved) show(ranked, H[y], note); else fillChecks();
      }).catch(function () {});
    };
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
      var ranked = D.findComposites(D.markWalls(D.finish(list, H[y]), S.rows, S.idx, y, DS.noZero), S.rows, S.idx, y, DS.noZero), pairs = D.standInPairs(ranked);
      // stand-ins: the engine adds up every (column, stronger column) pair
      // stand-ins: the engine adds up every (column, stronger column) pair, in one request
      var b = {}; ranked.forEach(function (c) { if (c.bands) b[c.col] = c.bands.edges; });
      var pairsReq = pairs.length ? STL.bigCharts.api('/api/engine/' + BIG.ds + '/chart', Object.assign({ kind: 'fair_pairs', y: y, nozero: DS.noZero, bands: b, pairs: pairs.map(function (p) { return { x: p.x.col, z: p.z.col }; }) }, sc)) : Promise.resolve({ pairs: [] });
      return pairsReq.then(function (r) {
        D.markStandIns(ranked, r.pairs.map(function (q, k) { return { x: pairs[k].x, z: pairs[k].z, within: D.within(q.cells.map(function (c) { return { x: c.k[0], z: c.k[1], n: c.n, sy: c.sy, syy: c.syy }; })).omega2 }; }));
            }).then(function () {
        return Promise.all(ranked.filter(function (r) { return r.walls; }).map(function (r) { return bigRule(r, y, H, cands, sc, ranked); }));
      }).then(function () {
        done(ranked, T('Calculated by the engine from all rows of the file', 'इंजन ने फ़ाइल की सभी पंक्तियों से गणना की') + (ranked.some(function (r) { return r.rule; }) ? T('; the label rule was learned from a sample that keeps every label and then checked on all rows.', '; लेबल का नियम हर लेबल वाले नमूने से सीखा गया और फिर सभी पंक्तियों पर जाँचा गया।') : '.'));
      });
    }).catch(fail);
  }
  // large file: learn the rule from a sample that keeps every label (weighed back), then check it on every row
  function bigRule(r, y, H, cands, sc, ranked) {
    var feats = D.ruleFeatures(y, H[y], cands, ranked, r.col), api = function (body) { return STL.bigCharts.api('/api/engine/' + BIG.ds + '/chart', Object.assign(body, sc)); };
    return api({ kind: 'label_sample', label: r.col, cols: feats.map(function (f) { return f.col; }), perClass: 2500, total: 20000 }).then(function (sm) {
      var per = {}; sm.rows.forEach(function (row) { per[row[0]] = (per[row[0]] || 0) + 1; });
      var w = {}; Object.keys(per).forEach(function (l) { w[l] = (sm.counts[l] || per[l]) / per[l]; });
      var local = feats.map(function (f, k) { return { col: k + 1, name: f.name, real: f.col, kind: f.kind }; });
      var q = D.findRule(sm.rows, sm.rows.map(function (_, i) { return i; }), 0, local, { weights: w });
      if (!q) { r.rule = null; return; }
      q.list.forEach(function (u) { u.conds.forEach(function (c) { c.col = local[c.col - 1].real; }); });
      q.usedCols = q.usedCols.map(function (c) { return local[c - 1].real; });
      return api({ kind: 'rule_check', label: r.col, default: q.otherwise.label, rules: q.list.map(function (u) { return { label: u.label, conds: u.conds }; }) }).then(function (res) { r.rule = D.applyCheck(q, res); r.rule.learnedOn = sm.rows.length; });
    }).catch(function () { r.rule = null; });
  }
  function fillChecks() { var el = $('drCols'); if (el && DS.checks) el.innerHTML = STL.colChecks.html(DS.checks); }
  function show(ranked, yName, note) {
    var out = $('drOut'); if (!out) return; dispose();
    var lines = D.summary(ranked, yName, hi()), causes = ranked.filter(function (r) { return !r.derived; }), res = ranked.filter(function (r) { return r.derived; });
    var pct = function (x) { return (Math.round(x * 1000) / 10).toFixed(1) + '%'; }, nv = function (v) { return Math.abs(v) >= 1000 ? CH.indian(Math.round(v)) : (Math.round(v * 100) / 100).toFixed(2); };
    var row = function (r) { return '<tr><td><b>' + esc(r.name) + '</b>' + (r.walls ? ' <span title="' + esc(T('May be a label given by the number', 'शायद संख्या से तय लेबल')) + '">⚠</span>' : '') + (r.kind === 'num' ? ' <em>(' + T('5 bands', '5 समूह') + ')</em>' : '') + (r.formula && !(r.derived && r.derived.why === 'formula') ? '<div class="dr-via">= ' + esc(r.formula.split(' = ').slice(1).join(' = ')) + '</div>' : '') + (r.derived && r.derived.why === 'formula' ? '<div class="dr-via">= ' + esc(r.derived.text.split(' = ').slice(1).join(' = ')) + '</div>' : '') + (r.standIn && r.standIn.made ? '<div class="dr-via">↳ ' + esc(T('made of ', 'इनसे बना: ')) + '<b>' + esc(r.standIn.name.split(' + ').join(T(' and ', ' और '))) + '</b>' + esc(T(': inside their combinations only ', ': इनके संयोजनों के भीतर केवल ')) + pct(r.standIn.omega2) + '</div>' : '') + (r.standIn && !r.standIn.made ? '<div class="dr-via">↳ ' + esc(T('mostly through ', 'मुख्यतः ')) + '<b>' + esc(r.standIn.name) + '</b>' + esc(T(': inside its groups only ', ' के कारण: उसके समूहों के भीतर केवल ')) + pct(r.standIn.omega2) + '</div>' : '') + (r.partly ? '<div class="dr-via">↳ ' + esc(T('partly through ', 'आंशिक रूप से ')) + '<b>' + esc(r.partly.name) + '</b>' + esc(T(': inside its groups ', ' के कारण: उसके समूहों के भीतर ')) + pct(r.partly.omega2) + '</div>' : '') + '</td><td class="num"><b>' + pct(r.omega2) + '</b></td><td>' + (r.low && r.high ? esc(r.low.label) + ' <em>' + nv(r.low.mean) + '</em> → ' + esc(r.high.label) + ' <em>' + nv(r.high.mean) + '</em>' : '–') + '</td><td><button class="cs-link" data-ch="' + r.col + '">📊 ' + T('Chart', 'चार्ट') + '</button>' + (r.kind === 'cat' && !r.derived ? ' · <button class="cs-link" data-fr="' + r.col + '">⚖ ' + T('Fair check', 'निष्पक्ष जाँच') + '</button>' : '') + '</td></tr>'; };
    var head = '<tr><th>' + T('Column', 'कॉलम') + '</th><th>' + T('Explains', 'समझाता है') + '</th><th>' + T('Lowest → highest average', 'न्यूनतम → अधिकतम औसत') + '</th><th></th></tr>';
    var html = '<div class="fr-verdict" style="border-color:#6d5bd0"><b><span class="fr-ic" style="background:#6d5bd0">🔍</span>' + T('What goes with ', 'किससे जुड़ा है: ') + esc(yName) + '</b>' + lines.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') + '</div>' +
      '<div id="drChart" class="fr-chart" style="height:' + Math.max(180, Math.min(causes.length, 12) * 26 + 50) + 'px"></div>' +
      '<table class="big-tbl fr-tbl">' + head + causes.slice(0, 15).map(row).join('') + '</table>' +
      ranked.filter(function (r) { return r.rule && r.rule.accuracy >= 0.8; }).map(function (r) { var q = r.rule, lines = D.ruleLines(q);
        return '<div class="prj-sub dr-rule-h">🧩 ' + esc(T('How “' + r.name + '” is made — a rule found in the data, right for ', '“' + r.name + '” कैसे बनता है — डेटा में मिला नियम, ')) + D.accText(q.accuracy) + esc(T(' of all ' + CH.indian(q.n) + ' rows', ' — सभी ' + CH.indian(q.n) + ' पंक्तियों में सही')) + '</div>' +
          '<div class="big-note">' + esc(T('Read from the top: the first line that fits a row gives its label.', 'ऊपर से पढ़ें: जो पहली पंक्ति मेल खाए, वही लेबल देती है।')) + (q.sampled || q.learnedOn < q.n ? ' ' + esc(T('Learned from ' + CH.indian(q.learnedOn) + ' rows that keep every label, checked on all rows.', CH.indian(q.learnedOn) + ' पंक्तियों (हर लेबल सहित) से सीखा, सभी पंक्तियों पर जाँचा।')) : '') + '</div>' +
          '<table class="big-tbl fr-tbl dr-rule"><tr><th>#</th><th>' + T('If', 'यदि') + '</th><th>' + T('Then', 'तो') + '</th><th>' + T('Rows', 'पंक्तियाँ') + '</th><th>' + T('Right', 'सही') + '</th></tr>' +
          lines.map(function (u, k) { return '<tr><td class="num">' + (k + 1) + '</td><td>' + esc(D.lineText(u, hi())) + '</td><td><b>' + esc(u.label) + '</b></td><td class="num">' + CH.indian(u.n) + '</td><td class="num">' + (u.n ? D.accText(u.right / u.n) : '–') + '</td></tr>'; }).join('') +
          '<tr><td></td><td><em>' + T('otherwise', 'अन्यथा') + '</em></td><td><b>' + esc(q.otherwise.label) + '</b></td><td class="num">' + CH.indian(q.otherwise.n) + '</td><td class="num">' + (q.otherwise.n ? D.accText(q.otherwise.right / q.otherwise.n) : '–') + '</td></tr></table>';
      }).join('') +
      (res.length ? '<div class="prj-sub">' + T('Probably results of ', 'संभवतः परिणाम: ') + esc(yName) + T(' (not causes)', ' (कारण नहीं)') + '</div><table class="big-tbl fr-tbl">' + head + res.map(row).join('') + '</table>' : '') +
      '<div id="drCols"></div>' +
      '<div class="fr-how">' + T('“Explains” is ω² (omega squared): the share of the variation in the number that lies between the groups of a column, corrected for chance. It shows which factors go together with the number, not what causes it. ', '“समझाता है” = ω² (ओमेगा स्क्वेयर्ड): संख्या की भिन्नता का वह भाग जो किसी कॉलम के समूहों के बीच है, संयोग के लिए सुधारा हुआ। यह बताता है कि कौन-से कारक संख्या के साथ चलते हैं, कारण नहीं। ') + (note ? esc(note) : '') + '</div>';
    out.innerHTML = html; fillChecks();
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
