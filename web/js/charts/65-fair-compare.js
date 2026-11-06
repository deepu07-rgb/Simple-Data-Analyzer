// =====================================================================
//  FAIR COMPARISON  /  निष्पक्ष तुलना
//  "Restaurants with online delivery rate 0.09 LOWER" - but are they compared with like? This tool compares an
//  outcome (a rating, an amount, an age) between groups twice:
//     raw       the plain difference of averages
//     adjusted  the difference between groups that are alike in the other factors (price range, city ...),
//               from a linear regression with heteroskedasticity-robust (HC3) standard errors
//  and then says in plain words whether the raw gap holds, shrinks, vanishes or even REVERSES (Simpson's
//  paradox / a "mix effect"), and which factor causes it.
//
//  The maths works on CELLS (one cell = one combination of group + factor levels with n, sum, sum of squares),
//  so a million-row file is analysed from a few dozen numbers produced by the engine.
//    STL.fair.cellsFromRows(rows, idx, spec) -> { cells, names, matched, zeroSkipped }
//    STL.fair.analyse(cells, names)          -> result      STL.fair.verdict(result, hindi) -> { kind, title, text }
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL = root.STL || {}, F = STL.fair = {};
  function s(v) { return v == null ? '' : String(v); }
  function blank(v) { return s(v).trim() === ''; }
  function num(v) { var C = STL.charts; if (C && C.num) return C.num(v); var t = s(v).replace(/,/g, '').trim(); return t === '' || isNaN(Number(t)) ? null : Number(t); }
  function indian(n, d) { return STL.charts && STL.charts.indian ? STL.charts.indian(n, d) : String(n); }

  // ------------------------------------------------------------ cells from rows
  // spec: { y: column of the outcome, factor: column to compare by, adjusters: [columns], noZero: bool }
  F.cellsFromRows = function (rows, idx, spec) {
    var dims = [spec.factor].concat(spec.adjusters || []), map = {}, cells = [], zeroSkipped = 0, matched = 0, label = function (v) { var t = s(v).trim(); return t === '' ? '(blank)' : t; };
    for (var k = 0; k < idx.length; k++) {
      var r = rows[idx[k]], y = spec.yFn ? spec.yFn(r[spec.y]) : num(r[spec.y]); if (y === null) continue;
      matched++;
      if (!spec.yFn && spec.noZero && y === 0) { zeroSkipped++; continue; }
      var key = [], i; for (i = 0; i < dims.length; i++) { var bd = spec.bands && spec.bands[dims[i]]; if (bd) { var bi = STL.charts.bandOf(bd, num(r[dims[i]])); key.push(bi < 0 ? '(blank)' : bd.labels[bi]); } else key.push(label(r[dims[i]])); }
      var kk = key.join('\u0001'), c = map[kk]; if (!c) { c = map[kk] = { k: key, n: 0, sy: 0, syy: 0 }; cells.push(c); }
      c.n++; c.sy += y; c.syy += y * y;
    }
    return { cells: cells, dims: dims, matched: matched, zeroSkipped: zeroSkipped };
  };

  // ------------------------------------------------------------ small numeric helpers
  function erf(x) { var t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
  function pTwoSided(z) { var a = Math.abs(z); if (a > 38) return 0; return 1 - erf(a / Math.SQRT2); }
  F.pValue = pTwoSided;
  function invert(A) {                                                           // Gauss-Jordan with partial pivoting; returns { inv, bad: index of a dependent column or -1 }
    var n = A.length, M = A.map(function (r, i) { var row = r.slice(); for (var j = 0; j < n; j++) row.push(i === j ? 1 : 0); return row; }), scale = 0, i, j, k;
    for (i = 0; i < n; i++) scale = Math.max(scale, Math.abs(A[i][i]));
    for (i = 0; i < n; i++) {
      var p = i; for (j = i + 1; j < n; j++) if (Math.abs(M[j][i]) > Math.abs(M[p][i])) p = j;
      if (Math.abs(M[p][i]) < 1e-9 * Math.max(scale, 1)) return { inv: null, bad: i };
      var tmp = M[i]; M[i] = M[p]; M[p] = tmp;
      var d = M[i][i]; for (j = 0; j < 2 * n; j++) M[i][j] /= d;
      for (j = 0; j < n; j++) if (j !== i) { var f = M[j][i]; if (f !== 0) for (k = 0; k < 2 * n; k++) M[j][k] -= f * M[i][k]; }
    }
    return { inv: M.map(function (r) { return r.slice(n); }), bad: -1 };
  }

  // ------------------------------------------------------------ weighted least squares on cells, HC3 robust errors
  // cells: [{ k: [factorLevel, adj1Level ...], n, sy, syy }], use: which dims take part (0 = the factor, always)
  function fit(cells, dimLevels, refs, use) {
    var cols = [{ dim: -1 }], colOf = {}, d, l;                                  // column 0 = intercept
    use.forEach(function (di) { dimLevels[di].forEach(function (lv) { if (lv !== refs[di]) { colOf[di + '|' + lv] = cols.length; cols.push({ dim: di, level: lv }); } }); });
    var dropped = {};
    for (var attempt = 0; attempt <= cols.length; attempt++) {
      var keep = []; cols.forEach(function (c, i) { if (!dropped[i]) keep.push(i); });
      var pos = {}; keep.forEach(function (ci, i) { pos[ci] = i; });
      var p = keep.length, XtX = [], Xty = new Array(p).fill(0), i, j;
      for (i = 0; i < p; i++) XtX.push(new Array(p).fill(0));
      var act = cells.map(function (c) { var a = [0]; use.forEach(function (di) { var ci = colOf[di + '|' + c.k[di]]; if (ci !== undefined && pos[ci] !== undefined) a.push(pos[ci]); }); return a; });
      cells.forEach(function (c, ci) { var a = act[ci]; for (var u = 0; u < a.length; u++) { Xty[a[u]] += c.sy; for (var v = 0; v < a.length; v++) XtX[a[u]][a[v]] += c.n; } });
      var iv = invert(XtX);
      if (!iv.inv) { dropped[keep[iv.bad]] = true; continue; }                   // a level that is a copy of other levels: set aside
      var inv = iv.inv, beta = inv.map(function (row) { var t = 0; for (var q = 0; q < p; q++) t += row[q] * Xty[q]; return t; });
      var meat = []; for (i = 0; i < p; i++) meat.push(new Array(p).fill(0));
      var sse = 0, sst = 0, ntot = 0, sytot = 0, syytot = 0;
      cells.forEach(function (c, ci) {
        var a = act[ci], yh = 0, h = 0, u, v; for (u = 0; u < a.length; u++) { yh += beta[a[u]]; for (v = 0; v < a.length; v++) h += inv[a[u]][a[v]]; }
        var sc = c.syy - 2 * yh * c.sy + c.n * yh * yh; if (sc < 0) sc = 0; sse += sc; ntot += c.n; sytot += c.sy; syytot += c.syy;
        var w = sc / Math.pow(Math.max(1 - h, 1e-6), 2);
        for (u = 0; u < a.length; u++) for (v = 0; v < a.length; v++) meat[a[u]][a[v]] += w;
      });
      sst = syytot - sytot * sytot / ntot;
      var V = []; for (i = 0; i < p; i++) { V.push(new Array(p).fill(0)); }
      var tmp = []; for (i = 0; i < p; i++) { tmp.push(new Array(p).fill(0)); for (j = 0; j < p; j++) { var t2 = 0; for (var q2 = 0; q2 < p; q2++) t2 += inv[i][q2] * meat[q2][j]; tmp[i][j] = t2; } }
      for (i = 0; i < p; i++) for (j = 0; j < p; j++) { var t3 = 0; for (var q3 = 0; q3 < p; q3++) t3 += tmp[i][q3] * inv[q3][j]; V[i][j] = t3; }
      var out = { beta: {}, se: {}, r2: sst > 0 ? 1 - sse / sst : 0, n: ntot, p: p };
      cols.forEach(function (c, ci2) { if (dropped[ci2] || c.dim < 0) return; var key = c.dim + '|' + c.level, q4 = pos[ci2]; out.beta[key] = beta[q4]; out.se[key] = Math.sqrt(Math.max(V[q4][q4], 0)); });
      return out;
    }
    return null;
  }

  // ------------------------------------------------------------ number adjusters as straight lines (row by row)
  // An exact row-level regression of y on the group (0/1 columns), text adjusters (0/1 columns) and number adjusters
  // (one slope each), with HC3 errors - the same as the engine computes on large files. Also the fit with each
  // adjuster alone. spec: { y, factor, cats: [cols], lins: [cols], noZero, ref }
  //   -> { levels: { level: [diff, se] }, r2, n, alone: [ { level: [diff, se] } ], ref }
  F.linearFit = function (rows, idx, spec) {
    var label = function (v) { var t = s(v).trim(); return t === '' ? '(blank)' : t; }, dims = [spec.factor].concat(spec.cats || []), lins = spec.lins || [];
    var data = [];
    for (var k = 0; k < idx.length; k++) {
      var r = rows[idx[k]], y = spec.yFn ? spec.yFn(r[spec.y]) : num(r[spec.y]); if (y === null || (!spec.yFn && spec.noZero && y === 0)) continue;
      var z = lins.map(function (c) { return num(r[c]); }); if (z.some(function (v) { return v === null; })) continue;
      data.push({ d: dims.map(function (c) { return label(r[c]); }), z: z, y: y });
    }
    var means = lins.map(function (_, j) { var t = 0; data.forEach(function (o) { t += o.z[j]; }); return data.length ? t / data.length : 0; });
    if (spec.curve) data.forEach(function (o) { o.z = o.z.concat(o.z.map(function (v, j) { return (v - means[j]) * (v - means[j]); })); });   // a bend: the centred square
    var nz = spec.curve ? 2 * lins.length : lins.length;
    var levels = dims.map(function (_, n) { var cnt = {}; data.forEach(function (o) { cnt[o.d[n]] = (cnt[o.d[n]] || 0) + 1; }); return Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a] || (a < b ? -1 : 1); }).slice(0, n === 0 ? 12 : 60); });
    if (levels[0].length < 2) return null;
    var refs = levels.map(function (lv, n) { return n === 0 && lv.indexOf(spec.ref) >= 0 ? spec.ref : lv[0]; });
    var blocks = [], p = 1;
    levels.forEach(function (lv, n) { var keep = lv.filter(function (v) { return v !== refs[n]; }); if (n > 0 || lv.length >= 12) keep.push('(Others)'); var pos = {}; keep.forEach(function (v, j) { pos[v] = p + j; }); blocks.push({ st: p, keep: keep, pos: pos, known: lv }); p += keep.length; });
    var linAt = []; for (var zj = 0; zj < nz; zj++) linAt.push(p + zj); p += nz;
    // each row as its non-zero design columns
    var X = data.map(function (o) { var c = [0], v = [1]; o.d.forEach(function (lv, n) { if (lv === refs[n]) return; var B = blocks[n], j = B.pos[B.known.indexOf(lv) >= 0 ? lv : '(Others)']; if (j !== undefined) { c.push(j); v.push(1); } }); linAt.forEach(function (at, j) { c.push(at); v.push(o.z[j]); }); return { c: c, v: v }; });
    var grp = [0]; for (var g = 0; g < blocks[0].keep.length; g++) grp.push(blocks[0].st + g);
    var subsets = [Array.from({ length: p }, function (_, j) { return j; })];
    for (var n = 1; n < blocks.length; n++) subsets.push(grp.concat(Array.from({ length: blocks[n].keep.length }, function (_, j) { return blocks[n].st + j; })));
    lins.forEach(function (_, j) { subsets.push(grp.concat(spec.curve ? [linAt[j], linAt[lins.length + j]] : [linAt[j]])); });
    var N = data.length, sy = 0, syy = 0; data.forEach(function (o) { sy += o.y; syy += o.y * o.y; }); var sst = syy - sy * sy / N;
    function one(sub) {
      var where = {}; sub.forEach(function (c, j) { where[c] = j; }); var q = sub.length;
      var rowsX = X.map(function (x) { var c = [], v = []; for (var t = 0; t < x.c.length; t++) { var j = where[x.c[t]]; if (j !== undefined) { c.push(j); v.push(x.v[t]); } } return { c: c, v: v }; });
      var A = [], b = new Array(q).fill(0), i, j, t, u;
      for (i = 0; i < q; i++) A.push(new Array(q).fill(0));
      rowsX.forEach(function (x, r) { var yv = data[r].y; for (t = 0; t < x.c.length; t++) { b[x.c[t]] += x.v[t] * yv; for (u = 0; u < x.c.length; u++) A[x.c[t]][x.c[u]] += x.v[t] * x.v[u]; } });
      var dropped = {}, iv, keep;
      for (var tries = 0; tries <= q; tries++) {                              // a column that copies others is set aside (as in the cell fit)
        keep = []; for (i = 0; i < q; i++) if (!dropped[i]) keep.push(i);
        iv = invert(keep.map(function (a) { return keep.map(function (c) { return A[a][c]; }); }));
        if (iv.inv) break; dropped[keep[iv.bad]] = true;
      }
      if (!iv.inv) return null;
      var Ai = iv.inv, kq = keep.length, kp = {}; keep.forEach(function (c, j2) { kp[c] = j2; });
      var beta = Ai.map(function (row) { var s2 = 0; for (var j3 = 0; j3 < kq; j3++) s2 += row[j3] * b[keep[j3]]; return s2; });
      var meat = []; for (i = 0; i < kq; i++) meat.push(new Array(kq).fill(0));
      var sse = 0;
      rowsX.forEach(function (x, r) {
        var c = [], v = []; for (t = 0; t < x.c.length; t++) if (kp[x.c[t]] !== undefined) { c.push(kp[x.c[t]]); v.push(x.v[t]); }
        var yh = 0, h = 0; for (t = 0; t < c.length; t++) { yh += beta[c[t]] * v[t]; for (u = 0; u < c.length; u++) h += v[t] * Ai[c[t]][c[u]] * v[u]; }
        var e = data[r].y - yh; sse += e * e; var w = e * e / Math.pow(Math.max(1 - h, 1e-6), 2);
        for (t = 0; t < c.length; t++) for (u = 0; u < c.length; u++) meat[c[t]][c[u]] += w * v[t] * v[u];
      });
      var tmp = Ai.map(function (row) { return meat[0].map(function (_, j4) { var s3 = 0; for (var q2 = 0; q2 < kq; q2++) s3 += row[q2] * meat[q2][j4]; return s3; }); });
      var out = {};
      keep.forEach(function (ci, j5) { var col = sub[ci]; if (col >= 1 && col < 1 + blocks[0].keep.length) { var vv = 0; for (var q3 = 0; q3 < kq; q3++) vv += tmp[j5][q3] * Ai[q3][j5]; out[blocks[0].keep[col - 1]] = [beta[j5], Math.sqrt(Math.max(vv, 0))]; } });
      return { levels: out, sse: sse, p: kq };
    }
    var full = one(subsets[0]); if (!full) return null;
    return { levels: full.levels, r2: sst > 0 ? 1 - full.sse / sst : 0, n: N, sse: full.sse, p: full.p, aic: N * Math.log(full.sse / N) + 2 * full.p, curve: !!spec.curve, ref: refs[0], alone: subsets.slice(1).map(function (sb) { var f = one(sb); return f ? f.levels : {}; }), adjusters: (spec.cats || []).concat(lins) };
  };
  // put the straight-line results into an analysis made from cells (raw gaps, strata and make-up stay from the cells)
  F.useLinear = function (R, lin, names) {
    if (!R || R.error || !lin) return R;
    R.levels.forEach(function (l) { var r = l.notComparable ? null : lin.levels[l.level]; l.adj = r ? { diff: r[0], se: r[1], lo: r[0] - 1.96 * r[1], hi: r[0] + 1.96 * r[1], p: r[1] > 0 ? pTwoSided(r[0] / r[1]) : 1 } : null; });
    R.drivers.forEach(function (d) { var a = lin.alone[d.dim - 1], r = a && a[R.main.level]; if (r) { d.effect = r[0]; d.move = Math.abs(r[0] - R.main.raw.diff); } });
    R.r2 = lin.r2; R.linear = lin.curve ? 'curve' : 'line'; R.nLinear = lin.n;
    if (names) { R.adjusters = names.slice(1); R.drivers.forEach(function (d) { if (names[d.dim]) d.name = names[d.dim]; }); }
    return R;
  };

  // ------------------------------------------------------------ the analysis
  F.analyse = function (cells, names, opts) {
    opts = opts || {};
    var nd = names.length, tot = [], dimLevels = [], refs = [], d, i;
    for (d = 0; d < nd; d++) { tot.push({}); }
    cells.forEach(function (c) { for (var q = 0; q < nd; q++) tot[q][c.k[q]] = (tot[q][c.k[q]] || 0) + c.n; });
    for (d = 0; d < nd; d++) { dimLevels.push(Object.keys(tot[d]).sort(function (a, b) { return tot[d][b] - tot[d][a] || (a < b ? -1 : 1); })); refs.push(dimLevels[d][0]); }
    // for a Yes/No factor the natural reference is "No"
    var NO = /^(no|n|false|0|none|नहीं|ना)$/i; dimLevels[0].forEach(function (lv) { if (NO.test(lv)) refs[0] = lv; });
    if (opts.ref && dimLevels[0].indexOf(opts.ref) >= 0) refs[0] = opts.ref;                       // a number cut into bands: the lowest band
    var factorLevels = dimLevels[0];
    if (factorLevels.length < 2) return { error: 'factor' };
    // raw: per group mean and variance
    var g = {}; factorLevels.forEach(function (lv) { g[lv] = { n: 0, sy: 0, syy: 0 }; });
    cells.forEach(function (c) { var o = g[c.k[0]]; o.n += c.n; o.sy += c.sy; o.syy += c.syy; });
    factorLevels.forEach(function (lv) { var o = g[lv]; o.mean = o.sy / o.n; o.var = o.n > 1 ? Math.max(o.syy - o.n * o.mean * o.mean, 0) / (o.n - 1) : 0; });
    var ntotal = 0, sy = 0, syy = 0; cells.forEach(function (c) { ntotal += c.n; sy += c.sy; syy += c.syy; });
    var sd = Math.sqrt(Math.max(syy - sy * sy / ntotal, 0) / Math.max(ntotal - 1, 1));
    var all = []; for (i = 0; i < nd; i++) all.push(i);
    var full = fit(cells, dimLevels, refs, all);
    if (!full) return { error: 'fit' };
    // A group can only be compared like-for-like with the reference if they share strata somewhere (an officer who is the
    // only one in a department cannot be told apart from that department). Groups and adjuster levels that appear together
    // are joined; a group outside the reference's connected set has no like-for-like gap.
    var par = {}; function fnd(x) { if (par[x] === undefined) par[x] = x; while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; }
    function uni(a, b) { a = fnd(a); b = fnd(b); if (a !== b) par[a] = b; }
    cells.forEach(function (c) { for (var q = 1; q < nd; q++) uni('0|' + c.k[0], q + '|' + c.k[q]); });
    var refSet = fnd('0|' + refs[0]), touches = {};
    cells.forEach(function (c) { for (var q = 1; q < nd; q++) { var root = fnd('0|' + c.k[0]); if (root !== refSet) { var t = touches[c.k[0]] || (touches[c.k[0]] = {}); t[c.k[q]] = (t[c.k[q]] || 0) + c.n; } } });
    var levels = factorLevels.filter(function (lv) { return lv !== refs[0]; }).map(function (lv) {
      var a = g[lv], b = g[refs[0]], diff = a.mean - b.mean, se = Math.sqrt(a.var / a.n + b.var / b.n), key = '0|' + lv, beta = full.beta[key], seA = full.se[key], comparable = nd < 2 || fnd('0|' + lv) === refSet;
      var only = comparable ? null : Object.keys(touches[lv] || {}).sort(function (x, y) { return touches[lv][y] - touches[lv][x]; }).slice(0, 3);
      return { level: lv, n: a.n, mean: a.mean, raw: { diff: diff, se: se, p: se > 0 ? pTwoSided(diff / se) : 1 }, notComparable: !comparable, only: only,
               adj: (beta === undefined || !comparable) ? null : { diff: beta, se: seA, lo: beta - 1.96 * seA, hi: beta + 1.96 * seA, p: seA > 0 ? pTwoSided(beta / seA) : 1 } };
    });
    if (opts.order) levels.sort(function (a, b) { return opts.order.indexOf(a.level) - opts.order.indexOf(b.level); });          // a number in bands: lowest to highest
    var big = levels.filter(function (l) { return l.n >= 30 && l.adj; }), main = (big.length ? big : levels).slice().sort(function (a, b) { return Math.abs(b.raw.diff) - Math.abs(a.raw.diff); })[0];          // the gap people notice
    // which factor causes the gap to change? adjust for each one alone
    var drivers = [];
    for (d = 1; d < nd; d++) {
      var one = fit(cells, dimLevels, refs, [0, d]), b1 = one && one.beta['0|' + main.level];
      if (b1 !== undefined) drivers.push({ dim: d, name: names[d], effect: b1, move: Math.abs(b1 - main.raw.diff) });
    }
    drivers.sort(function (a, b) { return b.move - a.move; });
    var drv = drivers[0] || null, strata = null, mix = null;
    if (drv) {
      var D = drv.dim, byLevel = {}, mixTot = {};
      cells.forEach(function (c) { var lv = c.k[D], o = byLevel[lv] || (byLevel[lv] = {}); var gk = c.k[0]; var x = o[gk] || (o[gk] = { n: 0, sy: 0 }); x.n += c.n; x.sy += c.sy; });
      strata = dimLevels[D].map(function (lv) { var o = byLevel[lv] || {}, a = o[main.level], b = o[refs[0]]; return a && b && a.n >= 5 && b.n >= 5 ? { level: lv, nMain: a.n, nRef: b.n, meanMain: a.sy / a.n, meanRef: b.sy / b.n, diff: a.sy / a.n - b.sy / b.n } : null; }).filter(Boolean);
      var numericLevels = strata.every(function (x) { return x.level !== '' && !isNaN(Number(x.level)); });
      strata.sort(function (a, b) { return numericLevels ? Number(a.level) - Number(b.level) : (a.level < b.level ? -1 : a.level > b.level ? 1 : 0); });
      strata = strata.slice(0, 12);
      mix = { main: main.level, ref: refs[0], rows: dimLevels[D].slice(0, 8).map(function (lv) { var o = byLevel[lv] || {}; return { level: lv, shareMain: ((o[main.level] || { n: 0 }).n) / main.n, shareRef: ((o[refs[0]] || { n: 0 }).n) / g[refs[0]].n }; }) };
    }
    var sstAll = Math.max(syy - sy * sy / ntotal, 0), sseFull = (1 - full.r2) * sstAll;
    return { aic: ntotal * Math.log(Math.max(sseFull, 1e-300) / ntotal) + 2 * full.p, names: names, ref: refs[0], groups: factorLevels.map(function (lv) { return { level: lv, n: g[lv].n, mean: g[lv].mean }; }), levels: levels, main: main, drivers: drivers, driver: drv, strata: strata, mix: mix,
             r2: full.r2, n: ntotal, sd: sd, nAdjust: nd - 1, adjusters: names.slice(1) };
  };

  // ------------------------------------------------------------ the sentence
  function r2(x) { return (Math.abs(x) >= 100 ? String(Math.round(x)) : x.toFixed(2)); }
  function sgd(x, d) { return (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(d); }
  function sg(x) { return (x > 0 ? '+' : x < 0 ? '−' : '') + r2(Math.abs(x)); }
  F.verdict = function (R, hi) {
    var PT = R && R.pct ? (hi ? ' अंक' : ' points') : '', sgf = function (x) { return sg(x) + PT; };                  // a yes/no outcome is in percent: a gap is in percentage points
    if (!R || R.error) return { kind: 'error', title: hi ? 'तुलना संभव नहीं' : 'Cannot compare', text: hi ? 'तुलना के लिए कम से कम दो समूह और पर्याप्त पंक्तियाँ चाहिए।' : 'A comparison needs at least two groups and enough rows.' };
    var plainName = function (n) { return String(n).replace(/ \((curve|bands|straight line|वक्र|समूह|सीधी रेखा)\)$/, ''); };
    var m = R.main, A = m.adj, raw = m.raw, d = R.driver, drv = d ? plainName(d.name) : '', who = m.level + (hi ? ' बनाम ' : ' vs ') + R.ref, advs = R.adjusters.map(plainName);
    if (!A || !R.nAdjust) return { kind: 'raw', title: hi ? 'केवल सीधा अंतर' : 'Plain difference only', text: (hi ? who + ': अंतर ' : who + ': difference ') + sgf(raw.diff) + (hi ? ' (तुलना को निष्पक्ष बनाने के लिए कुछ नहीं चुना गया)।' : ' (nothing was chosen to make the comparison fair).') };
    var sigRaw = raw.p < 0.01, sigAdj = A.p < 0.01, notAdj = A.p > 0.05, flip = raw.diff * A.diff < 0;
    var tiny = sigRaw && Math.abs(A.diff) < 0.05 * Math.abs(raw.diff);                            // 13,000 rows make even +0.02 "significant": judge the size too
    var pctLeft = Math.max(0.1, Math.round(Math.abs(A.diff) / Math.abs(raw.diff) * 1000) / 10);
    var tinyTxt = tiny ? (hi ? 'जो बचा (' + sgf(A.diff) + ') वह पहले वाले अंतर का केवल ' + pctLeft + '% है। ' : 'What is left (' + sgf(A.diff) + ') is only ' + pctLeft + '% of the first gap. ') : '';
    if (tiny) { sigAdj = false; notAdj = true; flip = false; }
    var narrow = !R.pct && A && Math.abs(A.hi - A.lo) < 0.02 && Math.abs(A.diff) < 1, sa = function (x) { return narrow ? sgd(x, 3) : sgf(x); };
    var ci = hi ? '(संभवतः ' + sa(A.lo) + ' से ' + sa(A.hi) + ' के बीच)' : '(most likely between ' + sa(A.lo) + ' and ' + sa(A.hi) + ')';
    var lead = R.pct && R.yLabel ? (hi ? 'माप: ' + R.yLabel + ' (प्रतिशत)। ' : 'Measured as: ' + R.yLabel + ' (a percentage). ') : '';
    var head = lead + (hi ? 'जैसे हैं वैसे समूहों में अंतर ' + sgf(raw.diff) + ' है। केवल उन पंक्तियों की तुलना करें जो ' + advs.join(', ') + ' में समान हैं, तो अंतर ' + sa(A.diff) + ' है ' + ci + '। ' : 'Comparing the groups as they are, the difference is ' + sgf(raw.diff) + '. Comparing only rows that are alike in ' + advs.join(', ') + ', it is ' + sa(A.diff) + ' ' + ci + '. ');
    var mixTxt = '';
    if (R.mix && d) {
      var top = R.mix.rows.slice().sort(function (a, b) { return Math.abs(b.shareMain - b.shareRef) - Math.abs(a.shareMain - a.shareRef); })[0];
      if (top) mixTxt = hi ? '“' + R.mix.main + '” वालों में ' + drv + ' = ' + top.level + ' का हिस्सा ' + Math.round(top.shareMain * 100) + '% है, “' + R.mix.ref + '” वालों में ' + Math.round(top.shareRef * 100) + '%। ' : (m.level + ' rows are ' + Math.round(top.shareMain * 100) + '% ' + drv + ' = ' + top.level + ' versus ' + Math.round(top.shareRef * 100) + '% for ' + R.ref + '. ');
    }
    // how big is it? 50,000 rows make even a tiny gap "real", so the size matters as much as the certainty
    var zs = R.sd > 0 && A ? Math.abs(A.diff) / R.sd : null, zp = zs === null ? 0 : Math.round(zs * 100), tinyGap = zs !== null && zs < 0.05;
    var sizeTxt = zs === null ? '' : (zs < 0.05 ? (hi ? 'पर अंतर बहुत छोटा है: पंक्तियों के सामान्य फैलाव का लगभग ' + zp + '%, इसलिए व्यवहार में लगभग कोई फ़र्क नहीं। ' : 'But the difference is very small: about ' + zp + '% of the usual spread between rows, so it makes almost no practical difference. ')
      : zs < 0.2 ? (hi ? 'अंतर छोटा है: पंक्तियों के सामान्य फैलाव का लगभग ' + zp + '%। ' : 'The difference is small: about ' + zp + '% of the usual spread between rows. ')
      : zs < 0.5 ? (hi ? 'अंतर मध्यम है: पंक्तियों के सामान्य फैलाव का लगभग ' + zp + '%। ' : 'The difference is moderate: about ' + zp + '% of the usual spread between rows. ')
      : (hi ? 'अंतर बड़ा है: पंक्तियों के सामान्य फैलाव का लगभग ' + zp + '% या उससे अधिक। ' : 'The difference is large: about ' + zp + '% of the usual spread between rows, or more. '));
    var tail = hi ? 'इससे पता चलता है कि दोनों साथ चलते हैं; यह साबित नहीं होता कि एक दूसरे का कारण है।' : 'This shows the two go together; it does not prove that one causes the other.';
    if (flip && sigAdj && (sigRaw || raw.p < 0.1)) return { kind: 'reversal', title: hi ? 'पहली तुलना भ्रामक है — समान पंक्तियों की तुलना करने पर उत्तर उलट जाता है' : 'The first comparison is misleading — the answer flips when similar rows are compared',
      text: head + (hi ? 'दोनों समूहों की बनावट अलग है' + (drv ? ' (' + drv + ')' : '') + ', इसलिए पहला अंतर भ्रामक है। ' : 'The two groups are made up differently' + (drv ? ' (mainly in ' + drv + ')' : '') + ', so the first gap is misleading. ') + mixTxt + tail };
    if (sigRaw && notAdj) return { kind: 'explained', tiny: tiny, title: hi ? 'अंतर असली नहीं है — यह इससे आता है कि हर समूह में कौन है' : 'The gap is not real — it comes from who is in each group',
      text: head + (hi ? 'यानी अंतर इससे आता है कि हर समूह में कौन है (' + (drv || 'अन्य कारक') + '), ' + m.level + ' होने से नहीं। ' : 'So the gap comes from who is in each group (' + (drv || 'the other factors') + '), not from being ' + m.level + '. ') + tinyTxt + mixTxt + tail };
    if (!sigRaw && sigAdj) return { kind: 'masked', title: tinyGap ? (hi ? 'एक अंतर है, पर बहुत छोटा' : 'A difference exists, but it is very small') : (hi ? 'एक असली अंतर छिपा हुआ था' : 'A real difference was hidden'),
      text: head + (hi ? 'पहली तुलना में अंतर नहीं दिखता था, पर समान पंक्तियों की तुलना में स्पष्ट है। ' : 'The first comparison showed no clear gap, but there is a clear one when similar rows are compared. ') + sizeTxt + mixTxt + tail };
    if (sigAdj && Math.abs(A.diff) < 0.6 * Math.abs(raw.diff)) return { kind: 'shrinks', title: hi ? 'अंतर का एक हिस्सा इससे है कि हर समूह में कौन है' : 'Part of the gap comes from who is in each group',
      text: head + (hi ? 'अंतर का बड़ा हिस्सा (लगभग ' + Math.round((1 - Math.abs(A.diff) / Math.abs(raw.diff)) * 100) + '%) ' + (drv || 'अन्य कारकों') + ' से समझाया जाता है, पर कुछ अंतर बचा रहता है। ' : 'Most of the gap (about ' + Math.round((1 - Math.abs(A.diff) / Math.abs(raw.diff)) * 100) + '%) is explained by ' + (drv || 'the other factors') + ', but some difference remains. ') + sizeTxt + mixTxt + tail };
    if (sigAdj) return { kind: 'holds', title: tinyGap ? (hi ? 'अंतर असली है, पर बहुत छोटा' : 'The difference is real, but very small') : (hi ? 'अंतर असली है — समान पंक्तियों की तुलना में भी बना रहता है' : 'The difference is real — it stays when similar rows are compared'),
      text: head + (hi ? 'समान पंक्तियों की तुलना में भी अंतर लगभग वैसा ही है। ' : 'Comparing similar rows barely changes it. ') + sizeTxt + tail };
    if (A.p <= 0.05) {                                                             // 0.01 < p <= 0.05: some evidence, not much
      if (sigRaw && (flip || Math.abs(A.diff) < 0.6 * Math.abs(raw.diff))) return { kind: 'weak_explained', title: hi ? 'अंतर ज़्यादातर इससे है कि हर समूह में कौन है; जो बचा वह छोटा और अनिश्चित है' : 'The gap mostly comes from who is in each group; what is left is small and uncertain',
        text: head + (hi ? 'पहला अंतर ज़्यादातर इससे आता है कि हर समूह में कौन है (' + (drv || 'अन्य कारक') + ')। बचा हुआ अंतर ' + (flip ? 'उलटी दिशा में है और ' : '') + 'छोटा है और पक्का नहीं। ' : 'Most of the first gap comes from who is in each group (' + (drv || 'the other factors') + '). What is left ' + (flip ? 'points the other way and ' : '') + 'is small and not certain. ') + mixTxt + tail };
      return { kind: 'weak', title: hi ? 'छोटा अंतर, पक्का नहीं' : 'A small difference, not very certain',
        text: head + (hi ? 'यह पक्का नहीं है: संयोग से भी ऐसा हो सकता है। ' : 'This is not certain: chance could also produce it. ') + tail };
    }
    return { kind: 'none', title: hi ? 'कोई स्पष्ट अंतर नहीं' : 'No clear difference — it could be chance',
      text: head + (hi ? 'दोनों तरह से अंतर इतना छोटा है कि संयोग से हो सकता है।' : 'Either way the gap is small enough to come from chance.') };
  };
})(typeof window !== 'undefined' ? window : globalThis);

// =====================================================================
//  The Fair comparison screen
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL, F = STL.fair;
  if (!root.document || !STL.ui) return;
  var U = STL.ui, CH = STL.charts, T = U.T, esc = U.esc;
  function $(id) { return document.getElementById(id); }
  function hi() { return typeof uiLanguage !== 'undefined' && uiLanguage === 'hi'; }
  function isBig() { return !!(root.BIG && BIG.active && BIG.ds); }
  function HD() { return isBig() ? BIG.headers : headers; }
  function RD() { return isBig() ? STL.bigCharts.sample.rows : rawData; }
  function viewIdx() { return isBig() ? STL.bigCharts.sample.idx : (typeof getDisplayData === 'function' ? getDisplayData() : rawData.map(function (_, i) { return i; })); }

  var FS = null;                                                                  // state of the open screen
  STL.openFair = function (preset) {
    if (!isBig() && !U.hasData()) { toast(T('Open a file first, or try the sample data.', 'पहले फ़ाइल खोलें, या नमूना डेटा आज़माएँ।'), 'info'); return; }
    var go = function () {
      var prof = CH.profile(HD(), RD(), viewIdx()), nums = CH.rankMeasures(prof.filter(CH.isMeasure));
      var cats = CH.groupColumns(prof, nums, RD(), viewIdx()).filter(function (p) { return p.distinct <= 60; });
      var yesNo = cats.filter(function (p) { return p.distinct === 2 && !p.numeric; });
      FS = { prof: prof, nums: nums, cats: cats, y: -1, f: -1, adj: [], noZero: false, result: null, yCat: null, outs: [] };
      preset = preset || {};
      FS.y = preset.y >= 0 ? preset.y : (nums[0] ? nums[0].index : -1);
      if (preset.yCat && preset.yCat.col >= 0) { FS.y = preset.yCat.col; FS.yCat = { col: preset.yCat.col, value: String(preset.yCat.value) }; }
      FS.f = preset.f >= 0 ? preset.f : (yesNo[0] ? yesNo[0].index : (cats[0] ? cats[0].index : -1));
      outcomeOptions().then(function () { if (FS.yCat && !FS.outs.some(function (o) { return o.col === FS.yCat.col && o.value === FS.yCat.value; })) FS.outs.push({ col: FS.yCat.col, value: FS.yCat.value });
        if (!nums.length && !FS.yCat && FS.outs.length) { FS.yCat = { col: FS.outs[0].col, value: FS.outs[0].value }; FS.y = FS.yCat.col; }
        if (FS.yCat && preset.f === undefined) { var fc = cats.filter(function (p) { return p.index !== FS.y; })[0]; FS.f = fc ? fc.index : -1; }
        suggestAdjust(); if (preset.adj) FS.adj = preset.adj.slice();
        FS.noZero = FS.yCat ? false : (preset.noZero !== undefined ? !!preset.noZero : autoZero());
        render(); compute(); });
    };
    if (isBig() && STL.bigCharts.sample.ds !== BIG.ds) STL.bigCharts.loadSample().then(go).catch(function (e) { toast(e.message, 'error'); }); else go();
  };
  // a yes/no (or few-valued text) column can be the outcome: "how often Late = Yes". On a large file the values come from every row.
  function outcomeOptions() {
    var cols = FS.prof.filter(function (p) { return !p.date && !p.list && !p.unique && p.distinct >= 2 && p.distinct <= 8 && (!p.numeric || p.flag || p.lowInt && p.distinct <= 3); }).map(function (p) { return p.index; });
    var fromRows = function () { var o = {}; cols.forEach(function (c) { var cnt = {}; viewIdx().forEach(function (i) { var v = String(RD()[i][c] == null ? '' : RD()[i][c]).trim(); if (v) cnt[v] = (cnt[v] || 0) + 1; }); o[c] = { distinct: Object.keys(cnt).length, values: Object.keys(cnt).map(function (k) { return [k, cnt[k]]; }).sort(function (a, b) { return b[1] - a[1]; }) }; }); return o; };
    var p = isBig() && STL.bigCharts.values && cols.length ? STL.bigCharts.values(cols).catch(fromRows) : Promise.resolve(fromRows());
    return p.then(function (V) {
      // the value worth asking about: the "bad" one (Yes, High, Late, Default…), else the rarer of two, else the two commonest; outcome-like columns first, 14 at most
      var BADV = /^(yes|y|true|high|severe|bad|fail|failed|churn|churned|default|defaulted|positive|critical|poor|late|dropout|risk|1)$/i, list = [];
      cols.forEach(function (c) { var v = V[c]; if (!v || v.distinct < 2 || v.distinct > 8) return; var vals = v.values.map(function (x) { return String(x[0]); }), bad = vals.filter(function (x) { return BADV.test(x); }), pick = bad.length ? bad.slice(0, 1) : (v.distinct === 2 ? [vals[vals.length - 1]] : vals.slice(0, 2)); list.push({ col: c, vals: pick, rank: bad.length ? 0 : 1 }); });
      list.sort(function (a, b) { return a.rank - b.rank; }); FS.outs = []; list.forEach(function (o) { o.vals.forEach(function (x) { if (FS.outs.length < 14) FS.outs.push({ col: o.col, value: x }); }); });
    });
  }
  function yFn() { return FS.yCat ? function (cell) { var q = String(cell == null ? '' : cell).trim(); return q === '' ? null : (q === FS.yCat.value ? 100 : 0); } : null; }
  function yLabel() { return FS.yCat ? HD()[FS.yCat.col] + ' = ' + FS.yCat.value : HD()[FS.y]; }
  function yspec() { return FS.yCat ? { is: FS.yCat.value, scale: 100 } : undefined; }
  function linCols() { return FS.adj.filter(function (c) { var p = FS.prof[c]; return p && p.numeric && !p.lowInt; }); }
  function autoZero() { var p = FS.prof[FS.y]; return !FS.yCat && !!(p && p.score && p.zeroPct >= 0.01); }
  // the starting level of a before/after pair (Pre GPA for Post GPA, and for “Change in GPA”) is the first thing to hold equal
  function partner() { var P = STL.derive ? STL.derive.pairs(HD(), FS.prof) : [], y = FS.y, r = -1; P.forEach(function (p) { if (p.after === y || HD()[y] === p.name) r = p.before; }); return r; }
  function adjCandidates() { var D = STL.drivers, pt = partner(); return D.candidates(HD(), FS.prof, FS.y).filter(function (c) { return c.col !== FS.f && (c.col === pt || !D.sharesName(c.name, HD()[FS.y]).length); }); }
  function suggestAdjust() {                                                     // adjust for what goes most with the number (not for columns made from it)
    var D = STL.drivers, cands = adjCandidates();
    try { FS.ranked = D.rank(RD(), viewIdx(), HD(), FS.y, { prof: FS.prof, candidates: cands, noZero: autoZero(), partner: partner(), yFn: FS.yCat ? function (cell) { var q = String(cell == null ? '' : cell).trim(); return q === '' ? null : (q === FS.yCat.value ? 1 : 0); } : null }); } catch (e) { FS.ranked = []; }
    FS.adj = FS.ranked.filter(function (r) { return !r.derived && !r.walls && !r.standIn && r.omega2 >= 0.01; }).slice(0, 3).map(function (r) { return r.col; });
    var pt = partner(); if (pt >= 0 && pt !== FS.f && cands.some(function (c) { return c.col === pt; })) FS.adj = [pt].concat(FS.adj.filter(function (c) { return c !== pt; })).slice(0, 3);
  }
  function numFactor() { var p = FS.prof[FS.f]; return !!(p && p.numeric && !p.lowInt); }
  // on a large file the band edges come from EVERY row (the engine), not from the sample
  function exactOr(col, k, sampled) { var b = FS.ex && FS.ex[col + ':' + k]; return b || sampled(); }
  function factorBands() { return numFactor() ? exactOr(FS.f, 4, function () { return CH.quantileBands(viewIdx().map(function (i) { return CH.num(RD()[i][FS.f]); }), 4); }) : null; }
  function allBands(fb) { var b = bandsFor(FS.adj); if (fb) b[FS.f] = fb; return b; }
  function bandsFor(cols) { var b = {}; cols.forEach(function (c) { var p = FS.prof[c]; if (p && p.numeric && !p.lowInt) b[c] = exactOr(c, 5, function () { return CH.quantileBands(viewIdx().map(function (i) { return CH.num(RD()[i][c]); }), 5); }); }); return b; }

  function render() {
    var H = HD(), numCols = FS.prof.filter(function (p) { return p.numeric; }), groupCols = FS.prof.filter(function (p) { return p.index !== FS.y; }).filter(function (p) { return !p.numeric || p.lowInt || (!p.idLike && !p.coord && p.distinct >= 8); }).filter(function (p) { return p.distinct >= 2 && !p.unique && (p.numeric && !p.lowInt ? true : p.distinct <= 200); }).map(function (p) { return p.numeric && !p.lowInt ? Object.assign({}, p, { name: p.name + T('  (a number, in 4 bands)', '  (संख्या, 4 समूहों में)') }) : p; });
    var omega = {}, wall = {}; (FS.ranked || []).forEach(function (r) { omega[r.col] = r.omega2; if (r.walls) wall[r.col] = 1; });
    var cand = adjCandidates().map(function (c) { return { index: c.col, name: c.name + (c.kind === 'num' ? T(' (grouped low to high)', ' (कम से अधिक समूहों में)') : '') + (wall[c.col] ? T(' ⚠ may be set by the number', ' ⚠ शायद संख्या से तय') : ''), w: omega[c.col] || 0 }; }).sort(function (a, b) { return b.w - a.w; }).slice(0, 12);
    FS.adj = FS.adj.filter(function (c) { return c !== FS.f && c !== FS.y; });
    var opt = function (list, val) { return list.map(function (p) { return '<option value="' + p.index + '"' + (p.index === val ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join(''); };
    var html = '<div class="prj-h"><b>⚖ ' + T('Fair comparison', 'निष्पक्ष तुलना') + '</b><button id="frX" aria-label="close">×</button></div>' +
      '<div class="big-note">' + T('Is a difference between two groups real, or does it only come from the groups being made up differently? This compares them plainly and then between groups that are alike.', 'दो समूहों का अंतर असली है, या केवल इसलिए कि समूहों की बनावट अलग है? यह पहले सीधी तुलना करता है, फिर बराबर के समूहों में।') + '</div>' +
      '<div class="fr-form"><label class="rp-field"><span>' + T('Measure to compare', 'तुलना का माप') + '</span><select id="frY" class="big-select"><optgroup label="' + esc(T('A number (its average)', 'एक संख्या (उसका औसत)')) + '">' + opt(numCols.filter(function (p) { return !p.unique && !p.serial && !p.idLike && (p.index === FS.y && !FS.yCat || !FS.outs.some(function (o) { return o.col === p.index; }) || CH.isMeasure(p)); }), FS.yCat ? -1 : FS.y) + '</optgroup>' + (FS.outs.length ? '<optgroup label="' + esc(T('How often … (a yes/no or a few values)', 'कितनी बार … (हाँ/नहीं या कुछ मान)')) + '">' + FS.outs.map(function (o) { return '<option value="c:' + o.col + ':' + esc(o.value) + '"' + (FS.yCat && FS.yCat.col === o.col && FS.yCat.value === o.value ? ' selected' : '') + '>' + esc(T('How often ', 'कितनी बार ') + H[o.col] + ' = ' + o.value) + '</option>'; }).join('') + '</optgroup>' : '') + '</select></label>' +
      '<label class="rp-field"><span>' + T('Compare groups by', 'समूह इसके अनुसार') + '</span><select id="frF" class="big-select">' + opt(groupCols, FS.f) + '</select></label></div>' +
      '<div class="prj-sub">' + T('To make it fair, compare only rows that are alike in:', 'निष्पक्ष बनाने के लिए केवल उन पंक्तियों की तुलना करें जो इनमें समान हैं:') + '</div><div class="rp-checks" id="frAdj">' + (cand.length ? cand.map(function (p) { return '<label class="rp-inline"><input type="checkbox" data-a="' + p.index + '"' + (FS.adj.indexOf(p.index) >= 0 ? ' checked' : '') + '> ' + esc(p.name) + (p.w >= 0.005 ? ' <em>' + (Math.round(p.w * 1000) / 10) + '%</em>' : '') + '</label>'; }).join('') : '<em>' + T('no suitable columns', 'कोई उपयुक्त कॉलम नहीं') + '</em>') + '</div>' +
      (FS.yCat ? '' : '<label class="rp-inline" style="margin:8px 0"><input type="checkbox" id="frZ"' + (FS.noZero ? ' checked' : '') + '> ' + T('Ignore zeros (0 usually means “no value / not rated”)', 'शून्य छोड़ें (0 का अर्थ प्रायः “कोई मान नहीं / अंकित नहीं”)') + '</label>') +
      '<label class="rp-field" id="frLinW" style="max-width:420px' + (linCols().length ? '' : ';display:none') + '"><span>' + T('Number columns to adjust for, as', 'समायोजन के संख्या कॉलम, इस रूप में') + '</span><select id="frLin" class="big-select">' + [['auto', T('Automatic: the shape that fits best', 'स्वचालित: जो आकार सबसे अच्छा बैठे')], ['bands', T('5 bands (any shape, coarse)', '5 समूह (कोई भी आकार, मोटा)')], ['line', T('a straight line (one slope, exact values)', 'सीधी रेखा (एक ढलान, सटीक मान)')], ['curve', T('a curve (a slope and a bend)', 'वक्र (ढलान और मोड़)')]].map(function (o) { return '<option value="' + o[0] + '"' + ((FS.shape || 'auto') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
      '<div id="frOut"><div class="big-note">…</div></div>';
    var o = U.overlay('fairDialog', html, true); o.querySelector('.stl-box').classList.add('fr-box');
    $('frX').onclick = function () { disposeChart(); o.remove(); };
    $('frY').onchange = function () { var v = this.value, m = /^c:(\d+):([\s\S]*)$/.exec(v); if (m) { FS.yCat = { col: +m[1], value: m[2] }; FS.y = +m[1]; } else { FS.yCat = null; FS.y = +v; } if (FS.f === FS.y) { var g = FS.cats.filter(function (p) { return p.index !== FS.y; })[0]; FS.f = g ? g.index : -1; } FS.noZero = autoZero(); suggestAdjust(); render(); compute(); };
    $('frF').onchange = function () { FS.f = +this.value; suggestAdjust(); render(); compute(); };
    if ($('frZ')) $('frZ').onchange = function () { FS.noZero = this.checked; compute(); };
    $('frLin').onchange = function () { FS.shape = this.value; compute(); };
    o.querySelectorAll('[data-a]').forEach(function (b) { b.onchange = function () { var c = +b.dataset.a, i = FS.adj.indexOf(c); if (b.checked && i < 0 && FS.adj.length < 4) FS.adj.push(c); else if (!b.checked && i >= 0) FS.adj.splice(i, 1); else if (b.checked) b.checked = false; compute(); }; });
  }

  var chart = null;
  function disposeChart() { if (chart) { try { chart.dispose(); } catch (e) {} chart = null; } }
  function compute() {
    if (!isBig() || !STL.bigCharts.edges) { compute0(); return; }
    var fe = numFactor() ? [FS.f] : [], le = FS.adj.filter(function (c) { var p = FS.prof[c]; return p && p.numeric && !p.lowInt; }); FS.ex = FS.ex || {}; var seq0 = FS.seq;
    Promise.all([fe.length ? STL.bigCharts.edges(fe, 4) : {}, le.length ? STL.bigCharts.edges(le, 5) : {}]).then(function (r) { fe.forEach(function (c) { if (r[0][c]) FS.ex[c + ':4'] = r[0][c]; }); le.forEach(function (c) { if (r[1][c]) FS.ex[c + ':5'] = r[1][c]; }); compute0(); }).catch(function () { compute0(); });
  }
  function compute0() {
    var out = $('frOut'); if (!out) return;
    if (FS.y < 0 || FS.f < 0 || (FS.yCat && FS.f === FS.y)) { out.innerHTML = '<div class="big-err">' + T('This file needs a measure (a number, or a yes/no column) and a column of groups.', 'इस फ़ाइल में एक संख्या वाला कॉलम और समूहों का कॉलम चाहिए।') + '</div>'; return; }
    var fBands = factorBands(), H = HD(), names = [H[FS.f] + (fBands ? T(' (bands)', ' (समूह)') : '')].concat(FS.adj.map(function (c) { var p = FS.prof[c]; return H[c] + (p && p.numeric && !p.lowInt ? T(' (bands)', ' (समूह)') : ''); })),
        shapeNames = function (shape) { return [names[0]].concat(FS.adj.map(function (c) { var p = FS.prof[c]; return H[c] + (p && p.numeric && !p.lowInt ? (shape === 'curve' ? T(' (curve)', ' (वक्र)') : T(' (straight line)', ' (सीधी रेखा)')) : ''); })); }, seq = ++FS.seq || (FS.seq = 1);
    out.innerHTML = '<div class="big-note">' + T('Calculating…', 'गणना हो रही है…') + '</div>';
    var done = function (cellsRes) {
      if (seq !== FS.seq || !$('frOut')) return;
      var R = F.analyse(cellsRes.cells, names, { ref: fBands ? fBands.labels[0] : undefined, order: fBands ? fBands.labels : undefined }); FS.meta = cellsRes; if (R && !R.error && FS.yCat) { R.pct = true; R.yLabel = yLabel(); }
      var lins = linCols(), wLin = $('frLinW'); if (wLin) wLin.style.display = lins.length && !fBands ? '' : 'none';
      var shape = FS.shape || 'auto';
      if (shape === 'bands' || fBands || !lins.length || !R || R.error) { if (R && !R.error && lins.length) R.shapeNote = null; FS.result = R; show(R); return; }
      // number adjusters as a straight line or a curve: the like-for-like gaps from a row-level regression
      var cats = FS.adj.filter(function (c) { return lins.indexOf(c) < 0; }), order = cats.concat(lins);
      var fitOne = function (curve) {
        var back = function (lin) { if (lin) lin.alone = FS.adj.map(function (c) { return lin.alone[order.indexOf(c)]; }); return lin; };   // back to the order on screen
        if (isBig()) return STL.bigCharts.api('/api/engine/' + BIG.ds + '/chart', Object.assign({ kind: 'fair_linear', y: FS.y, factor: FS.f, catAdj: cats, linAdj: lins, curve: curve, nozero: FS.noZero, ref: R.ref, yspec: yspec() }, STL.bigCharts.scope())).then(back);
        return new Promise(function (ok) { setTimeout(function () { ok(back(F.linearFit(RD(), viewIdx(), { y: FS.y, factor: FS.f, cats: cats, lins: lins, curve: curve, noZero: FS.noZero, ref: R.ref, yFn: yFn() }))); }, 10); });
      };
      var want = shape === 'auto' ? [false, true] : [shape === 'curve'];
      Promise.all(want.map(fitOne)).then(function (fits) {
        if (seq !== FS.seq || !$('frOut')) return;
        // automatic: the lowest AIC (fit against the number of values used) among 5 bands, a straight line and a curve
        var cand = fits.filter(Boolean).map(function (f) { return { kind: f.curve ? 'curve' : 'line', aic: f.aic, fit: f, n: f.n }; });
        if (shape === 'auto' && R.n === (cand[0] || {}).n) cand.push({ kind: 'bands', aic: R.aic, n: R.n });
        cand.sort(function (a, b) { return a.aic - b.aic; });
        var best = cand[0]; if (!best) { FS.result = R; show(R); return; }
        var lbl = { bands: T('5 bands', '5 समूह'), line: T('a straight line', 'सीधी रेखा'), curve: T('a curve', 'वक्र') };
        if (best.kind !== 'bands') F.useLinear(R, best.fit, shapeNames(best.kind));
        R.shapeNote = shape === 'auto' && cand.length > 1 ? T('Number columns adjusted for as ' + lbl[best.kind] + ' — it fits the data best (lowest AIC; others: ', 'संख्या कॉलम ' + lbl[best.kind] + ' के रूप में समायोजित — यह डेटा पर सबसे अच्छा बैठता है (सबसे कम AIC; अन्य: ') + cand.slice(1).map(function (c) { return lbl[c.kind] + ' +' + Math.round(c.aic - best.aic); }).join(', ') + ').' : null;
        FS.result = R; show(R);
      }).catch(function (e) { if ($('frOut')) $('frOut').innerHTML = '<div class="big-err">' + esc(e.message) + '</div>'; });
    };

    if (isBig()) {
      var sc = STL.bigCharts.scope();
      var bb = allBands(fBands), edges = {}; Object.keys(bb).forEach(function (c) { if (bb[c]) edges[c] = bb[c].edges; });
      var dimCols = [FS.f].concat(FS.adj);
      STL.bigCharts.api('/api/engine/' + BIG.ds + '/chart', Object.assign({ kind: 'fair', y: FS.y, factor: FS.f, adjusters: FS.adj, nozero: FS.noZero, bands: edges, yspec: yspec() }, sc)).then(function (r) { r.cells.forEach(function (c) { c.k = c.k.map(function (k, di) { var b = bb[dimCols[di]], m = /^b(\d+)$/.exec(k); return b && m ? b.labels[+m[1]] : k; }); }); done(r); }).catch(function (e) { if ($('frOut')) $('frOut').innerHTML = '<div class="big-err">' + esc(e.message) + '</div>'; });
    } else {
      setTimeout(function () { try { done(F.cellsFromRows(RD(), viewIdx(), { y: FS.y, factor: FS.f, adjusters: FS.adj, noZero: FS.noZero, bands: allBands(fBands), yFn: yFn() })); } catch (e) { if ($('frOut')) $('frOut').innerHTML = '<div class="big-err">' + esc(e.message) + '</div>'; } }, 20);
    }
  }
  var KIND = { reversal: ['#d6456b', '⚠'], explained: ['#e8913a', 'ℹ'], masked: ['#3b82c4', '🔍'], shrinks: ['#e8913a', 'ℹ'], holds: ['#14a38b', '✔'], weak: ['#e8913a', '≈'], weak_explained: ['#e8913a', 'ℹ'], none: ['#8f9aa8', '≈'], raw: ['#8f9aa8', 'ℹ'], error: ['#d6456b', '⚠'] };
  function fpt(x) { return (x > 0 ? '+' : x < 0 ? '−' : '') + (Math.abs(x) < 1 ? Math.abs(x).toFixed(2) : Math.abs(x).toFixed(1)); }
  function f2(x) { return (x > 0 ? '+' : x < 0 ? '−' : '') + (Math.abs(x) >= 100 ? CH.indian(Math.round(Math.abs(x))) : Math.abs(x).toFixed(2)); }
  function pTxt(p) { return p < 0.001 ? T('clearly real', 'स्पष्ट रूप से असली') : (p < 0.01 ? T('real', 'असली') : (p < 0.05 ? T('probably real', 'शायद असली') : T('could be chance', 'संयोग हो सकता है'))); }
  function show(R) {
    F.last = R;                                                                   // kept for the copy button and for checking the numbers from outside
    var out = $('frOut'); if (!out) return; disposeChart();
    var H = HD(), v = F.verdict(R, hi()), k = KIND[v.kind] || KIND.raw, yName = yLabel(), fName = H[FS.f], P = !!(R && R.pct), M = function (x) { return P ? x.toFixed(1) + '%' : f2(x).replace(/^\+/, ''); }, D = function (x) { return P ? fpt(x) : f2(x); };
    var html = '<div class="fr-verdict" style="border-color:' + k[0] + '"><b><span class="fr-ic" style="background:' + k[0] + '">' + k[1] + '</span>' + esc(v.title) + '</b><p>' + esc(v.text) + '</p></div>';
    if (R && !R.error) {
      var meta = FS.meta || {}, z = meta.zeroSkipped;
      html += '<table class="big-tbl fr-tbl"><tr><th>' + esc(fName) + '</th><th>' + T('Rows', 'पंक्तियाँ') + '</th><th>' + (P ? T('How often ', 'कितनी बार ') : T('Average ', 'औसत ')) + esc(yName) + '</th><th>' + T('Difference as they are, against ', 'जैसे हैं वैसे अंतर, इनके मुकाबले ') + esc(R.ref) + (P ? T(' (points)', ' (अंक)') : '') + '</th><th>' + T('Difference among similar rows (most likely range)', 'समान पंक्तियों में अंतर (संभावित सीमा)') + '</th></tr>' +
        '<tr><td><b>' + esc(R.ref) + '</b> <em>(' + T('compared against', 'इसके मुकाबले तुलना') + ')</em></td><td class="num">' + CH.indian(R.groups.filter(function (g) { return g.level === R.ref; })[0].n) + '</td><td class="num">' + M(R.groups.filter(function (g) { return g.level === R.ref; })[0].mean) + '</td><td>–</td><td>–</td></tr>' +
        R.levels.map(function (l) { return '<tr' + (l === R.main ? ' class="fr-main"' : '') + '><td><b>' + esc(l.level) + '</b></td><td class="num">' + CH.indian(l.n) + '</td><td class="num">' + M(l.mean) + '</td><td class="num">' + D(l.raw.diff) + ' <em>(' + pTxt(l.raw.p) + ')</em></td><td class="num">' + (l.adj ? (function () { var tight = (l.adj.hi - l.adj.lo) < 0.02 && Math.abs(l.adj.diff) < 1, ff = P ? fpt : (tight ? function (x) { return (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(3); } : f2); return '<b>' + ff(l.adj.diff) + '</b> <em>(' + ff(l.adj.lo) + ' … ' + ff(l.adj.hi) + ') — ' + pTxt(l.adj.p) + '</em>'; })() : (l.notComparable ? '<em title="' + esc(T('No case of the comparison group is in the same ' + (R.adjusters[0] || 'group') + ' as these cases, so the difference cannot be separated from it.', 'तुलना समूह का कोई प्रकरण इनके जैसे ही समूह में नहीं है, इसलिए अंतर को उससे अलग नहीं किया जा सकता।')) + '">' + T('cannot be compared', 'तुलना संभव नहीं') + (l.only && l.only.length ? ' — ' + T('only in ', 'केवल ') + esc(l.only.join(', ')) : '') + '</em>' : '–')) + '</td></tr>'; }).join('') + '</table>';
      if (z && !P) html += '<div class="rp-warn"><div>ℹ ' + CH.indian(z) + T(' rows have 0 in “' + yName + '” and are left out.', ' पंक्तियों में “' + yName + '” में 0 है और छोड़ी गई हैं।') + '</div></div>';
      if (R.strata && R.strata.length > 1 && R.driver) {
        html += '<div class="prj-sub">' + T('Among similar rows: within each ', 'समान पंक्तियों में: हर ') + esc(R.driver.name) + '</div><div id="frChart" class="fr-chart"></div>';
        html += '<details class="rp-settings"><summary>' + T('Who is in each group', 'हर समूह में कौन है') + '</summary><table class="big-tbl"><tr><th>' + esc(R.driver.name) + '</th><th>' + T('Share of ', 'हिस्सा: ') + esc(R.mix.main) + '</th><th>' + T('Share of ', 'हिस्सा: ') + esc(R.mix.ref) + '</th></tr>' + R.mix.rows.map(function (r) { return '<tr><td>' + esc(r.level) + '</td><td class="num">' + Math.round(r.shareMain * 100) + '%</td><td class="num">' + Math.round(r.shareRef * 100) + '%</td></tr>'; }).join('') + '</table></details>';
      }
      html += '<details class="rp-settings"><summary>' + T('How was this worked out? (for the curious)', 'यह कैसे निकाला गया? (जिज्ञासु के लिए)') + '</summary><div class="fr-how">' + (R.shapeNote ? '<b>' + esc(R.shapeNote) + '</b> ' : '') + (R.linear ? esc(R.linear === 'curve' ? T('Number columns are adjusted for as curves (a slope and a bend each, every row on its exact value); the plain gaps, the chart and the make-up table use 5 bands. ', 'संख्या कॉलम वक्र के रूप में समायोजित (हर एक की ढलान और मोड़, हर पंक्ति अपने सटीक मान पर); सीधे अंतर, चार्ट और बनावट तालिका 5 समूहों से। ') : T('Number columns are adjusted for as straight lines (one slope each, every row on its exact value); the plain gaps, the chart and the make-up table use 5 bands. ', 'संख्या कॉलम सीधी रेखा के रूप में समायोजित (हर एक की एक ढलान, हर पंक्ति अपने सटीक मान पर); सीधे अंतर, चार्ट और बनावट तालिका 5 समूहों से। ')) : '') + T('In plain words: the app first compares the groups as they are, then compares only rows that are alike in the factors above, so that a difference caused by who is in each group is not mistaken for a real one. How it is calculated: a linear regression of ' + (P ? '“' + yName + '” (100 where it is true, 0 where not, so a gap is in percentage points)' : yName) + ' on the group and on each “adjust for” column (every value a 0/1 column), with robust (HC3) standard errors; the 95% range is ± 1.96 standard errors. It shows an association, not a cause. Adjusted for: ' + (R.adjusters.join(', ') || 'nothing') + '. R² = ' + R.r2.toFixed(2) + '.', 'सरल शब्दों में: ऐप पहले समूहों की जैसे हैं वैसे तुलना करता है, फिर केवल उन पंक्तियों की जो ऊपर के कारकों में समान हैं, ताकि इस वजह से आया अंतर कि हर समूह में कौन है, असली अंतर न समझ लिया जाए। गणना कैसे होती है: ' + yName + ' का रैखिक रिग्रेशन — समूह और हर “समायोजन” कॉलम पर (हर मान एक 0/1 कॉलम), मज़बूत (HC3) मानक त्रुटि के साथ; 95% सीमा = ± 1.96 मानक त्रुटि। यह संबंध दिखाता है, कारण नहीं। समायोजन: ' + (R.adjusters.join(', ') || 'कोई नहीं') + '. R² = ' + R.r2.toFixed(2) + '।') + '</div></details>';
      html += '<div class="prj-row" style="margin-top:8px;flex-wrap:wrap"><button class="tb-btn" id="frCopy">' + T('Copy the finding', 'निष्कर्ष कॉपी करें') + '</button><button class="tb-btn" id="frChartBtn">📊 ' + T('Open as a chart', 'चार्ट के रूप में खोलें') + '</button></div>';
    }
    out.innerHTML = html;
    if ($('frCopy')) $('frCopy').onclick = function () { var txt = v.title + '\n' + v.text; (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast(T('Copied', 'कॉपी हुआ'), 'success'); }).catch(function () { toast(T('Could not copy. Select the text and press Ctrl+C.', 'कॉपी नहीं हुआ। पाठ चुनकर Ctrl+C दबाएँ।'), 'warning'); }); };
    if ($('frChartBtn')) $('frChartBtn').onclick = function () { var dr = R.driver ? R.driver.dim : -1, adjCols = FS.adj, yy = FS.yCat ? { col: FS.y, fn: 'pct', op: '=', value: FS.yCat.value } : { col: FS.y, fn: 'avg' }; var spec = dr > 0 ? { x: adjCols[dr - 1], g: FS.f, ys: [yy], sort: 'natural', noZero: FS.noZero } : { x: FS.f, ys: [yy], noZero: FS.noZero }; var d = $('fairDialog'); if (d) d.remove(); STL.openChartStudio({ type: 'column', spec: spec }); };
    if (R && !R.error && R.strata && R.strata.length > 1 && R.driver) drawStrata(R, yName, fName);
  }
  function drawStrata(R, yName, fName) {
    STL.ensureECharts(function () {
      var el = $('frChart'); if (!el) return;
      var env = CH.kit.envOf({ hi: hi() }), K = CH.kit, o = K.base({ toolbox: false }, env), cols = CH.PALETTES.aurora;
      o.tooltip.trigger = 'axis'; o.tooltip.axisPointer = { type: 'shadow' }; o.grid = { left: 12, right: 18, top: 24, bottom: 52, containLabel: true };
      o.xAxis = K.catAxis(env, R.strata.map(function (s) { return s.level; })); o.yAxis = K.valueAxis(env, (R.pct ? T('How often ', 'कितनी बार ') : T('Average ', 'औसत ')) + yName + (R.pct ? ' (%)' : ''), null, { scale: true });
      o.legend = { bottom: 4, textStyle: { color: env.text }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 };
      var lab = { show: true, color: env.sub, formatter: function (p) { return R.pct ? p.value.toFixed(1) + '%' : p.value.toFixed(2); } };
      var mk = function (name, color, key, pos) { return { name: name, type: 'line', symbol: 'circle', symbolSize: 11, lineStyle: { width: 3, color: color }, itemStyle: { color: color }, label: { show: true, position: pos, color: color, fontWeight: 600, formatter: lab.formatter }, data: R.strata.map(function (s) { return s[key]; }) }; };
      o.series = [mk(R.ref, cols[0], 'meanRef', 'bottom'), mk(R.main.level, cols[1], 'meanMain', 'top')];
      disposeChart(); chart = echarts.init(el, null, { renderer: 'canvas' }); chart.setOption(o);
    });
  }

  // ---- doors in
  (STL.actions || []).push({ en: 'Fair comparison: is this difference real? (adjusts for other factors)', hi: 'निष्पक्ष तुलना: क्या यह अंतर असली है? (अन्य कारकों के लिए समायोजन)', kw: 'fair comparison regression adjust simpson paradox mix effect confounder compare groups difference real significant', run: function () { STL.openFair(); }, group: 'Charts' });
})(typeof window !== 'undefined' ? window : globalThis);
