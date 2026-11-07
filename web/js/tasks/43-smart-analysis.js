// =====================================================================
//  SMART ANALYSIS, BUILT IN (no outside AI, nothing to download)  /  स्मार्ट विश्लेषण
//  Four things analysts ask for most, done with plain statistics that run on this computer and say WHY:
//    1. Unusual values   rows far from what is usual for their own group (robust median / MAD rule; every row; the engine)
//    2. Forecast         the next months from the monthly totals: a straight trend, trend + the calendar months' pattern, or the recent level,
//                        whichever predicted the last months best when they were held back, with a range
//    3. Similar groups   k-means on a few standardised numbers; the number of groups chosen by silhouette; each group described in words
//    4. Findings         one page of exact facts about the file (size, empty cells, biggest group, trend, unusual values, repeats)
//  The calculations below are pure (and unit-tested against numpy); the screens follow.
//    STL.smart.forecast(months, values, h)  /  STL.smart.kmeans(points, k, seed)  /  STL.smart.chooseK(points)  /  STL.smart.describe(...)
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL = root.STL || {}, S = STL.smart = {};
  // ------------------------------------------------------------ forecast
  function mIndex(m) { return parseInt(m.slice(0, 4), 10) * 12 + parseInt(m.slice(5, 7), 10) - 1; }
  function mLabel(t) { var y = Math.floor(t / 12), m = t % 12 + 1; return y + '-' + (m < 10 ? '0' : '') + m; }
  function ols(t, y) {
    var n = t.length, mt = 0, my = 0, i; for (i = 0; i < n; i++) { mt += t[i]; my += y[i]; } mt /= n; my /= n;
    var sxx = 0, sxy = 0; for (i = 0; i < n; i++) { sxx += (t[i] - mt) * (t[i] - mt); sxy += (t[i] - mt) * (y[i] - my); }
    var b = sxx > 0 ? sxy / sxx : 0; return { a: my - b * mt, b: b, mt: mt, sxx: sxx, n: n };
  }
  function fitModel(kind, t, y) {
    var f = ols(t, y), m = { kind: kind, f: f, season: null, level: null };
    if (kind === 'level') { var last = y.slice(-3); m.level = last.reduce(function (a, v) { return a + v; }, 0) / last.length; var sd = 0, mean = y.slice(-6).reduce(function (a, v) { return a + v; }, 0) / Math.min(6, y.length); y.slice(-6).forEach(function (v) { sd += (v - mean) * (v - mean); }); m.sd = Math.sqrt(sd / Math.max(1, Math.min(6, y.length) - 1)); return m; }
    if (kind === 'season') {
      var by = {}, cnt = {}; t.forEach(function (tt, i) { var k = tt % 12; by[k] = (by[k] || 0) + (y[i] - (f.a + f.b * tt)); cnt[k] = (cnt[k] || 0) + 1; });
      m.season = {}; for (var k = 0; k < 12; k++) m.season[k] = cnt[k] ? by[k] / cnt[k] : 0;
    }
    var rss = 0; t.forEach(function (tt, i) { var p = f.a + f.b * tt + (m.season ? m.season[tt % 12] : 0); rss += (y[i] - p) * (y[i] - p); });
    m.sd = Math.sqrt(rss / Math.max(1, t.length - (kind === 'season' ? 13 : 2))); return m;
  }
  function predict(m, tt) { if (m.kind === 'level') return m.level; return m.f.a + m.f.b * tt + (m.season ? m.season[tt % 12] : 0); }
  S.forecast = function (months, values, h) {
    h = h || 6; var n = months.length;
    if (n < 6) return { error: 'few', n: n };
    var t = months.map(mIndex), y = values.slice(), hold = Math.min(3, Math.floor(n / 4)), kinds = ['trend', 'level'];
    var span = t[n - 1] - t[0] + 1; if (n >= 24 && span >= 24) kinds.push('season');
    var res = kinds.map(function (kind) {
      var tr = t.slice(0, n - hold), yr = y.slice(0, n - hold), mod = fitModel(kind, tr, yr), mae = 0;
      for (var i = n - hold; i < n; i++) mae += Math.abs(y[i] - predict(mod, t[i])); mae /= hold; return { kind: kind, mae: mae };
    }).sort(function (a, b) { return a.mae - b.mae; });
    var best = res[0].kind, mod = fitModel(best, t, y), mean = y.reduce(function (a, v) { return a + v; }, 0) / n, out = [];
    for (var j = 1; j <= h; j++) {
      var tt = t[n - 1] + j, p = predict(mod, tt), se = mod.kind === 'level' ? mod.sd : mod.sd * Math.sqrt(1 + 1 / mod.f.n + (tt - mod.f.mt) * (tt - mod.f.mt) / Math.max(mod.f.sxx, 1e-9));
      out.push({ month: mLabel(tt), value: p, lo: p - 1.96 * se, hi: p + 1.96 * se });
    }
    var info = { model: best, backtest: { held: hold, mae: res[0].mae, mape: mean ? res[0].mae / Math.abs(mean) : null, all: res }, forecast: out, slope: mod.f.b, mean: mean, n: n, sd: mod.sd };
    if (best === 'season') { var ks = Object.keys(mod.season).map(Number).sort(function (a, b) { return mod.season[b] - mod.season[a]; }); info.peak = ks[0] + 1; info.low = ks[ks.length - 1] + 1; }
    return info;
  };
  S.mLabel = mLabel;
  // ------------------------------------------------------------ k-means
  function rng(seed) { var a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function d2(a, b) { var s = 0; for (var i = 0; i < a.length; i++) { var d = a[i] - b[i]; s += d * d; } return s; }
  S.kmeans = function (P, k, seed) {
    var n = P.length, dim = P[0].length, best = null;
    for (var rs = 0; rs < 5; rs++) {
      var r = rng((seed || 1) * 1000 + rs), C = [P[Math.floor(r() * n)].slice()];
      while (C.length < k) { var D = P.map(function (p) { var m = Infinity; C.forEach(function (c) { var d = d2(p, c); if (d < m) m = d; }); return m; }), tot = D.reduce(function (a, v) { return a + v; }, 0), x = r() * tot, i = 0; while (i < n - 1 && (x -= D[i]) > 0) i++; C.push(P[i].slice()); }
      var lab = new Array(n).fill(-1), it, moved = true;
      for (it = 0; it < 100 && moved; it++) {
        moved = false; P.forEach(function (p, i) { var bj = 0, bd = Infinity; for (var j = 0; j < k; j++) { var d = d2(p, C[j]); if (d < bd) { bd = d; bj = j; } } if (lab[i] !== bj) { lab[i] = bj; moved = true; } });
        var sum = C.map(function () { return new Array(dim).fill(0); }), cnt = new Array(k).fill(0); P.forEach(function (p, i) { cnt[lab[i]]++; for (var q = 0; q < dim; q++) sum[lab[i]][q] += p[q]; });
        for (var j = 0; j < k; j++) if (cnt[j]) C[j] = sum[j].map(function (v) { return v / cnt[j]; });
      }
      var inertia = 0; P.forEach(function (p, i) { inertia += d2(p, C[lab[i]]); });
      if (!best || inertia < best.inertia) best = { centers: C, labels: lab, inertia: inertia };
    }
    return best;
  };
  // the mean silhouette of a clustering (on at most 1,500 points, taken evenly)
  S.silhouette = function (P, lab, k) {
    var n = P.length, step = Math.max(1, Math.floor(n / 1500)), idx = []; for (var i = 0; i < n; i += step) idx.push(i);
    var tot = 0, m = 0;
    idx.forEach(function (i) {
      var sum = new Array(k).fill(0), cnt = new Array(k).fill(0); idx.forEach(function (j) { if (j !== i) { sum[lab[j]] += Math.sqrt(d2(P[i], P[j])); cnt[lab[j]]++; } });
      var own = lab[i]; if (cnt[own] === 0) return; var a = sum[own] / cnt[own], b = Infinity; for (var c = 0; c < k; c++) if (c !== own && cnt[c]) b = Math.min(b, sum[c] / cnt[c]);
      if (!isFinite(b)) return; tot += (b - a) / Math.max(a, b); m++;
    });
    return m ? tot / m : 0;
  };
  S.standardise = function (rows) {
    var dim = rows[0].length, mean = new Array(dim).fill(0), sd = new Array(dim).fill(0);
    rows.forEach(function (r) { for (var q = 0; q < dim; q++) mean[q] += r[q]; }); for (var q = 0; q < dim; q++) mean[q] /= rows.length;
    rows.forEach(function (r) { for (var q = 0; q < dim; q++) sd[q] += (r[q] - mean[q]) * (r[q] - mean[q]); }); for (q = 0; q < dim; q++) sd[q] = Math.sqrt(sd[q] / Math.max(1, rows.length - 1)) || 1;
    return { Z: rows.map(function (r) { return r.map(function (v, q) { return (v - mean[q]) / sd[q]; }); }), mean: mean, sd: sd };
  };
  // the number of groups: the best silhouette for k = 2 … 6; 0.5 and above is a clear structure, 0.25 to 0.5 loose, below that there are no real groups
  S.chooseK = function (Z, seed) {
    var out = [], bestK = 2, bestS = -1; for (var k = 2; k <= Math.min(6, Math.max(2, Math.floor(Z.length / 20))); k++) { var km = S.kmeans(Z, k, seed || 1), s = S.silhouette(Z, km.labels, k); out.push({ k: k, silhouette: s }); if (s > bestS) { bestS = s; bestK = k; } }
    return { k: bestK, silhouette: bestS, tried: out, clear: bestS >= 0.5, strength: bestS >= 0.5 ? 'clear' : (bestS >= 0.25 ? 'weak' : 'none') };
  };
  // each group in words: size, and the numbers where it sits clearly above or below the whole file (in standard deviations)
  S.describe = function (labels, k, raw, names, std) {
    var dim = names.length, out = [];
    for (var j = 0; j < k; j++) {
      var m = new Array(dim).fill(0), c = 0; labels.forEach(function (l, i) { if (l === j) { c++; for (var q = 0; q < dim; q++) m[q] += raw[i][q]; } }); m = m.map(function (v) { return c ? v / c : 0; });
      var feats = names.map(function (nm, q) { return { name: nm, mean: m[q], z: (m[q] - std.mean[q]) / std.sd[q], overall: std.mean[q] }; }).sort(function (a, b) { return Math.abs(b.z) - Math.abs(a.z); });
      out.push({ group: j, rows: c, share: c / labels.length, features: feats, marks: feats.filter(function (f) { return Math.abs(f.z) >= 0.5; }).slice(0, 3) });
    }
    return out.sort(function (a, b) { return b.rows - a.rows; });
  };
})(typeof window !== 'undefined' ? window : globalThis);

// =====================================================================
//  The screens
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL, S = STL.smart;
  if (!root.document || !STL.ui || !STL.engineTable || !STL.charts) return;
  var U = STL.ui, T = U.T, esc = U.esc, ET = STL.engineTable, CH = STL.charts;
  function $(id) { return document.getElementById(id); }
  function big() { return !!(root.BIG && BIG.active && BIG.ds); }
  function HD() { return big() ? BIG.headers : headers; }
  function RD() { return big() ? STL.bigCharts.sample.rows : rawData; }
  function IX() { var r = RD(); return big() ? STL.bigCharts.sample.idx : (typeof getDisplayData === 'function' ? getDisplayData() : r.map(function (_, i) { return i; })); }
  function f(n, d) { return CH.indian(Math.round(n * Math.pow(10, d || 0)) / Math.pow(10, d || 0), d || 0); }
  function scope() { return big() && STL.bigCharts ? STL.bigCharts.scope() : {}; }
  function ready(then) {
    if (!big() && !U.hasData()) { toast(T('Open a file first', 'पहले फ़ाइल खोलें'), 'info'); return; }
    var go = function () { var prof = CH.profile(HD(), RD(), IX()); then(prof); };
    if (big() && STL.bigCharts.sample.ds !== BIG.ds) STL.bigCharts.loadSample().then(go).catch(function (e) { toast(e.message, 'error'); }); else go();
  }
  function opt(list, sel, none) { return (none ? '<option value="-1">' + esc(none) + '</option>' : '') + list.map(function (p) { return '<option value="' + p.index + '"' + (p.index === sel ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join(''); }
  function measures(prof) { return CH.rankMeasures(prof.filter(function (p) { return CH.isMeasure(p) || (p.numeric && !p.unique && !p.serial && !p.idLike); })); }
  // the grouping that goes most with a number (the one whose groups say what is usual): from the same ranking as “What explains this?”
  function bestGroup(prof, y) {
    try { var D = STL.drivers, cands = D.candidates(HD(), prof, y).filter(function (c) { return c.kind === 'cat'; }), R = D.rank(RD(), IX(), HD(), y, { prof: prof, candidates: cands });
      var r = R.filter(function (x) { return !x.derived && !x.walls && x.omega2 >= 0.05 && x.levels && x.levels.length >= 2 && x.levels.length <= 80; })[0]; return r ? r.col : -1; } catch (e) { return -1; }
  }
  function closeDlg(id, cur) { var o = $(id); if (o) o.remove(); if (cur) ET.drop(cur); }

  // ================================================================= 1. unusual values
  STL.openOutliers = function (preset) {
    ready(function (prof) {
      var ms = measures(prof); if (!ms.length) { toast(T('This file has no number column to check.', 'इस फ़ाइल में जाँचने के लिए कोई संख्या कॉलम नहीं है।'), 'info'); return; }
      var y = preset && preset.y >= 0 ? preset.y : ms[0].index, cats = prof.filter(function (p) { return !p.numeric && !p.date && !p.list && !p.unique && p.distinct >= 2 && p.distinct <= 80 && p.fill >= 0.6 || p.lowInt; });
      var St = { prof: prof, y: y, by: preset && preset.by !== undefined ? preset.by : bestGroup(prof, y), k: 3.5, ms: ms, cats: cats, cur: null, res: null, err: '' };
      drawO(St); runO(St);
    });
  };
  function runO(St) {
    var seq = St.seq = (St.seq || 0) + 1; St.res = null; St.err = ''; fillO(St);
    (St.cur ? Promise.resolve(St.cur) : ET.current().then(function (c) { St.cur = c; return c; })).then(function (cur) {
      return ET.api('/api/engine/' + cur.id + '/outliers', Object.assign({ col: St.y, by: St.by, k: St.k, limit: 40 }, scope()));
    }).then(function (r) { if (seq !== St.seq) return; St.res = r; fillO(St); }).catch(function (e) { if (seq !== St.seq) return; St.err = e.message; fillO(St); });
  }
  function drawO(St) {
    var H = HD(), html = '<div class="prj-h"><b>🔎 ' + T('Unusual values', 'असामान्य मान') + '</b><button id="ouX" aria-label="close">×</button></div>' +
      '<div class="big-note">' + T('Finds rows whose number is far from what is usual — compared with the usual for their own group (a bill is judged against the other bills of the same item), using the median and the typical spread, so one extreme value cannot hide itself. Every row is checked.', 'ऐसी पंक्तियाँ खोजता है जिनकी संख्या सामान्य से बहुत दूर है — अपने समूह के सामान्य से तुलना करके (एक बिल की तुलना उसी सामान के अन्य बिलों से)। माध्यिका और सामान्य फैलाव का उपयोग होता है, इसलिए एक चरम मान खुद को छिपा नहीं सकता। हर पंक्ति जाँची जाती है।') + '</div>' +
      '<div class="fr-form"><label class="rp-field"><span>' + T('Number to check', 'जाँचने की संख्या') + '</span><select id="ouY" class="big-select">' + opt(St.ms, St.y) + '</select></label>' +
      '<label class="rp-field"><span>' + T('Compare within each', 'तुलना हर … के भीतर') + '</span><select id="ouB" class="big-select">' + opt(St.cats, St.by, T('— the whole column —', '— पूरा कॉलम —')) + '</select></label>' +
      '<label class="rp-field"><span>' + T('How strict', 'कितनी सख़्ती') + '</span><select id="ouK" class="big-select">' + [[2.5, T('Sensitive (more rows)', 'संवेदनशील (अधिक पंक्तियाँ)')], [3.5, T('Normal', 'सामान्य')], [4.5, T('Strict (only the clearest)', 'कड़ा (केवल सबसे स्पष्ट)')]].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === St.k ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label></div><div id="ouOut"></div>';
    var o = U.overlay('outlierDialog', html, true); o.querySelector('.stl-box').classList.add('fr-box');
    $('ouX').onclick = function () { closeDlg('outlierDialog', St.cur); };
    $('ouY').onchange = function () { St.y = +this.value; St.by = bestGroup(St.prof, St.y); drawO(St); runO(St); };
    $('ouB').onchange = function () { St.by = +this.value; runO(St); };
    $('ouK').onchange = function () { St.k = +this.value; runO(St); };
  }
  function reasonO(St, r) {
    var H = HD(), nm = H[St.y], x = r.value, med = r.median, spread = 1.4826 * r.mad * (St.res.k / 3.5 > 0 ? 1 : 1), lo = med - St.res.k * r.mad / 0.6745, hi = med + St.res.k * r.mad / 0.6745, grp = St.by >= 0 ? T(' for “' + r.group + '”', ' “' + r.group + '” के लिए') : '';
    var times = med ? (Math.abs(x) / Math.abs(med)) : null, tx = times && times >= 1.5 ? T(' (' + (Math.round(times * 10) / 10) + ' times the usual)', ' (सामान्य का ' + (Math.round(times * 10) / 10) + ' गुना)') : (times && times <= 0.67 ? T(' (' + Math.round(times * 100) + '% of the usual)', ' (सामान्य का ' + Math.round(times * 100) + '%)') : '');
    return T(f(x, 2) + ' is ' + (x > med ? 'much higher' : 'much lower') + ' than the usual ' + f(med, 2) + grp + tx + '; the usual range is about ' + f(lo, 2) + ' to ' + f(hi, 2) + '.', f(x, 2) + ', सामान्य ' + f(med, 2) + grp + ' से ' + (x > med ? 'बहुत अधिक' : 'बहुत कम') + ' है' + tx + '; सामान्य सीमा लगभग ' + f(lo, 2) + ' से ' + f(hi, 2) + ' है।');
  }
  function fillO(St) {
    var out = $('ouOut'); if (!out) return; if (St.err) { out.innerHTML = '<div class="big-err">' + esc(St.err) + '</div>'; return; } if (!St.res) { out.innerHTML = '<div class="big-note">' + T('Checking every row…', 'हर पंक्ति जाँची जा रही है…') + '</div>'; return; }
    var r = St.res, H = HD(), nm = H[St.y];
    if (!r.tested) { out.innerHTML = '<div class="big-note">' + T('Nothing could be judged: each group needs at least 8 numbers with some spread.', 'कुछ भी नहीं परखा जा सका: हर समूह में कम से कम 8 संख्याएँ और कुछ फैलाव चाहिए।') + '</div>'; return; }
    var html = '<div class="big-note" style="border-color:' + (r.flagged ? '#d68910' : '#14a38b') + '">' + (r.flagged ? T('<b>' + f(r.flagged) + '</b> of ' + f(r.tested) + ' values of “' + esc(nm) + '” are unusual (' + f(r.high) + ' too high, ' + f(r.low) + ' too low)' + (St.by >= 0 ? ', judged within each “' + esc(H[St.by]) + '” (' + f(r.groups) + ' groups)' : '') + '. The ' + Math.min(40, r.flagged) + ' furthest are listed.', '“' + esc(nm) + '” के ' + f(r.tested) + ' मानों में से <b>' + f(r.flagged) + '</b> असामान्य हैं (' + f(r.high) + ' बहुत ऊँचे, ' + f(r.low) + ' बहुत नीचे)' + (St.by >= 0 ? ', हर “' + esc(H[St.by]) + '” के भीतर परखा (' + f(r.groups) + ' समूह)' : '') + '। सबसे दूर की ' + Math.min(40, r.flagged) + ' दिखाई गई हैं।') : T('No unusual values: all ' + f(r.tested) + ' values are within the usual range for their group.', 'कोई असामान्य मान नहीं: सभी ' + f(r.tested) + ' मान अपने समूह की सामान्य सीमा में हैं।')) + '</div>';
    if (r.rows.length) {
      var show = [0, 1, 2, 3, 4, 5].filter(function (i) { return i < H.length; }).slice(0, 5);
      html += '<div style="max-height:46vh;overflow:auto"><table class="big-tbl"><tr><th>#</th>' + show.map(function (i) { return '<th>' + esc(H[i]) + '</th>'; }).join('') + '<th>' + T('Why it is unusual', 'यह असामान्य क्यों है') + '</th></tr>' +
        r.rows.map(function (x) { return '<tr><td class="num">' + f(x.rid + 1) + '</td>' + show.map(function (i) { return '<td' + (i === St.y ? ' style="font-weight:700;color:#b45309"' : '') + '>' + esc(x.cells[i]) + '</td>'; }).join('') + '<td><small>' + esc(reasonO(St, x)) + '</small></td></tr>'; }).join('') + '</table></div>' +
        '<div class="big-note">' + T('“#” is the row number in the file. A flagged value is not necessarily an error: it is a value to look at.', '“#” फ़ाइल में पंक्ति संख्या है। चिह्नित मान ज़रूरी नहीं कि ग़लत हो: यह देखने लायक मान है।') + '</div>';
    }
    out.innerHTML = html;
  }

  // ================================================================= 2. forecast
  STL.openForecast = function () {
    ready(function (prof) {
      var dates = prof.filter(function (p) { return p.date && !p.numeric; }); if (!dates.length) { toast(T('A forecast needs a column of dates.', 'पूर्वानुमान के लिए तारीख का कॉलम चाहिए।'), 'info'); return; }
      var ms = measures(prof), St = { prof: prof, d: dates[0].index, y: ms.length ? ms[0].index : -1, dates: dates, ms: ms, cur: null, res: null, err: '' }; St.fn = St.y >= 0 && CH.fnFor(prof[St.y]) === 'avg' ? 'avg' : 'sum';
      drawF(St); runF(St);
    });
  };
  function runF(St) {
    var seq = St.seq = (St.seq || 0) + 1; St.res = null; St.err = ''; fillF(St);
    (St.cur ? Promise.resolve(St.cur) : ET.current().then(function (c) { St.cur = c; return c; })).then(function (cur) { return ET.api('/api/engine/' + cur.id + '/series', Object.assign({ date: St.d, y: St.y, fn: St.fn }, scope())); })
      .then(function (r) { if (seq !== St.seq) return; St.res = r; fillF(St); }).catch(function (e) { if (seq !== St.seq) return; St.err = e.message; fillF(St); });
  }
  function drawF(St) {
    var html = '<div class="prj-h"><b>📈 ' + T('Forecast', 'पूर्वानुमान') + '</b><button id="fcX" aria-label="close">×</button></div>' +
      '<div class="big-note">' + T('Looks at the monthly figures and says what the next months are likely to be, with a range. It tries a straight trend, a trend with the calendar months’ pattern, and the recent level, and uses whichever predicted the last months best when they were held back.', 'मासिक आँकड़े देखकर बताता है कि अगले महीने कैसे रह सकते हैं, एक सीमा के साथ। यह सीधा रुझान, कैलेंडर महीनों के पैटर्न वाला रुझान और हाल का स्तर आज़माता है, और उसे चुनता है जिसने रोके गए पिछले महीनों का सबसे अच्छा अनुमान लगाया।') + '</div>' +
      '<div class="fr-form"><label class="rp-field"><span>' + T('Date column', 'तारीख का कॉलम') + '</span><select id="fcD" class="big-select">' + opt(St.dates, St.d) + '</select></label>' +
      '<label class="rp-field"><span>' + T('Number', 'संख्या') + '</span><select id="fcY" class="big-select">' + opt(St.ms, St.y, T('— count of rows —', '— पंक्तियों की संख्या —')) + '</select></label>' +
      '<label class="rp-field"><span>' + T('Monthly figure', 'मासिक आँकड़ा') + '</span><select id="fcF" class="big-select"><option value="sum"' + (St.fn === 'sum' ? ' selected' : '') + '>' + T('Total', 'कुल') + '</option><option value="avg"' + (St.fn === 'avg' ? ' selected' : '') + '>' + T('Average', 'औसत') + '</option></select></label></div><div id="fcOut"></div>';
    var o = U.overlay('forecastDialog', html, true); o.querySelector('.stl-box').classList.add('fr-box');
    $('fcX').onclick = function () { dispose(); closeDlg('forecastDialog', St.cur); };
    $('fcD').onchange = function () { St.d = +this.value; runF(St); }; $('fcY').onchange = function () { St.y = +this.value; runF(St); }; $('fcF').onchange = function () { St.fn = this.value; runF(St); };
  }
  var chart = null; function dispose() { if (chart) { try { chart.dispose(); } catch (e) {} chart = null; } }
  function mname(m) { var N = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], H = ['जन', 'फ़र', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अग', 'सित', 'अक्टू', 'नव', 'दिस']; var i = parseInt(m.slice(5, 7), 10) - 1; return T(N[i], H[i]) + ' ' + m.slice(0, 4); }
  function fillF(St) {
    var out = $('fcOut'); if (!out) return; dispose(); if (St.err) { out.innerHTML = '<div class="big-err">' + esc(St.err) + '</div>'; return; } if (!St.res) { out.innerHTML = '<div class="big-note">' + T('Reading every row…', 'हर पंक्ति पढ़ी जा रही है…') + '</div>'; return; }
    var r = St.res, ser = r.series.slice(), note = '', H = HD();
    // a last month with far fewer rows than usual is probably not finished: leave it out and say so
    if (ser.length >= 8) { var cnt = ser.slice(0, -1).map(function (s) { return s.rows; }).sort(function (a, b) { return a - b; }), med = cnt[Math.floor(cnt.length / 2)]; if (ser[ser.length - 1].rows < 0.5 * med) { note += T('The last month (' + mname(ser[ser.length - 1].month) + ') has only ' + f(ser[ser.length - 1].rows) + ' rows against about ' + f(med) + ' in a usual month, so it looks unfinished and is left out. ', 'अंतिम महीने (' + mname(ser[ser.length - 1].month) + ') में केवल ' + f(ser[ser.length - 1].rows) + ' पंक्तियाँ हैं, जबकि सामान्य महीने में लगभग ' + f(med) + '; इसलिए वह अधूरा लगता है और छोड़ा गया है। '); ser.pop(); } }
    var fc = S.forecast(ser.map(function (s) { return s.month; }), ser.map(function (s) { return s.value; }), 6);
    if (fc.error) { out.innerHTML = '<div class="big-note" style="border-color:#c0392b">' + T('A forecast needs at least 6 months of figures; this file has ' + fc.n + '.', 'पूर्वानुमान के लिए कम से कम 6 महीनों के आँकड़े चाहिए; इस फ़ाइल में ' + fc.n + ' हैं।') + '</div>'; return; }
    var nm = St.y >= 0 ? H[St.y] : T('rows', 'पंक्तियाँ'), what = (St.y >= 0 ? (St.fn === 'avg' ? T('average ', 'औसत ') : T('total ', 'कुल ')) : T('number of ', 'संख्या: ')) + nm;
    var mdl = { trend: T('a straight trend', 'सीधा रुझान'), season: T('a trend with the calendar months’ pattern', 'कैलेंडर महीनों के पैटर्न वाला रुझान'), level: T('the recent level', 'हाल का स्तर') }[fc.model];
    var dir = fc.model === 'level' ? '' : (fc.slope > 0 ? T('rising', 'बढ़ता') : T('falling', 'घटता')) + ' ' + T('by about ', 'लगभग ') + f(Math.abs(fc.slope), 1) + T(' a month', ' प्रति माह') + ' (' + (Math.round(Math.abs(fc.slope) / Math.max(Math.abs(fc.mean), 1e-9) * 1000) / 10) + '%). ';
    var html = '<div class="big-note" style="border-color:#6d5bd0"><b>' + T('The ' + esc(what) + ' for the next 6 months is likely to be around ' + f(fc.forecast[0].value, 0) + ' to ' + f(fc.forecast[5].value, 0) + '.', 'अगले 6 महीनों का ' + esc(what) + ' लगभग ' + f(fc.forecast[0].value, 0) + ' से ' + f(fc.forecast[5].value, 0) + ' के बीच रहने की संभावना है।') + '</b></div>' +
      '<div class="big-note">' + T('Based on ' + fc.n + ' months (' + mname(ser[0].month) + ' to ' + mname(ser[ser.length - 1].month) + '). Method: ' + mdl + '. ' + dir + 'When the last ' + fc.backtest.held + ' months were held back, it predicted them with an average error of ' + (fc.backtest.mape === null ? '–' : (Math.round(fc.backtest.mape * 1000) / 10) + '%') + '.', fc.n + ' महीनों (' + mname(ser[0].month) + ' से ' + mname(ser[ser.length - 1].month) + ') पर आधारित। तरीक़ा: ' + mdl + '। ' + dir + 'जब अंतिम ' + fc.backtest.held + ' महीने रोके गए, तो उसने उनका औसत ' + (fc.backtest.mape === null ? '–' : (Math.round(fc.backtest.mape * 1000) / 10) + '%') + ' त्रुटि से अनुमान लगाया।') + (fc.peak ? ' ' + T('Highest calendar month: ' + mname('2000-' + (fc.peak < 10 ? '0' : '') + fc.peak).split(' ')[0] + ', lowest: ' + mname('2000-' + (fc.low < 10 ? '0' : '') + fc.low).split(' ')[0] + '.', 'सबसे ऊँचा महीना: ' + mname('2000-' + (fc.peak < 10 ? '0' : '') + fc.peak).split(' ')[0] + ', सबसे नीचा: ' + mname('2000-' + (fc.low < 10 ? '0' : '') + fc.low).split(' ')[0] + '।') : '') + '</div>' +
      (r.missing.length ? '<div class="rp-warn"><div>ℹ ' + T(r.missing.length + ' month(s) have no rows at all (' + r.missing.slice(0, 6).join(', ') + (r.missing.length > 6 ? ' …' : '') + '); they are skipped, not treated as zero.', r.missing.length + ' महीनों में कोई पंक्ति नहीं (' + r.missing.slice(0, 6).join(', ') + '); उन्हें छोड़ा गया है, शून्य नहीं माना गया।') + '</div></div>' : '') +
      (note ? '<div class="rp-warn"><div>ℹ ' + esc(note) + '</div></div>' : '') + (r.undated ? '<div class="rp-warn"><div>ℹ ' + T(f(r.undated) + ' rows have no readable date and are not in the monthly figures.', f(r.undated) + ' पंक्तियों में पढ़ने योग्य तारीख नहीं है और वे मासिक आँकड़ों में नहीं हैं।') + '</div></div>' : '') +
      '<div id="fcChart" class="fr-chart" style="height:340px"></div><table class="big-tbl"><tr><th>' + T('Month', 'महीना') + '</th><th>' + T('Likely', 'संभावित') + '</th><th>' + T('Range (95%)', 'सीमा (95%)') + '</th></tr>' + fc.forecast.map(function (x) { return '<tr><td>' + esc(mname(x.month)) + '</td><td class="num"><b>' + f(x.value, 0) + '</b></td><td class="num">' + f(x.lo, 0) + ' … ' + f(x.hi, 0) + '</td></tr>'; }).join('') + '</table>' +
      '<div class="big-note">' + T('A forecast is a careful extension of the past, not a promise: festivals, policy changes and one-off events are not known to it. The range shows how far past months strayed from the pattern.', 'पूर्वानुमान अतीत का सावधान विस्तार है, वादा नहीं: त्योहार, नीति-परिवर्तन और एक-बार की घटनाएँ इसे नहीं पता। सीमा बताती है कि पिछले महीने पैटर्न से कितने दूर गए।') + '</div>';
    out.innerHTML = html; STL.fcLast = { fc: fc, series: ser };
    STL.ensureECharts(function () {
      var el = $('fcChart'); if (!el) return; var env = CH.kit.envOf({ hi: false }), K = CH.kit, o = K.base({ toolbox: false }, env), months = ser.map(function (s) { return s.month; }).concat(fc.forecast.map(function (x) { return x.month; }));
      o.tooltip.trigger = 'axis'; o.grid = { left: 12, right: 18, top: 24, bottom: 36, containLabel: true }; o.xAxis = K.catAxis(env, months.map(mname)); o.yAxis = K.valueAxis(env, nm, null, { scale: true });
      var pad = function (a, n) { return new Array(n).fill(null).concat(a); }, nh = ser.length;
      o.series = [{ name: T('Actual', 'वास्तविक'), type: 'line', data: ser.map(function (s) { return s.value; }).concat(new Array(6).fill(null)), symbol: 'circle', symbolSize: 6, lineStyle: { width: 3, color: '#6d5bd0' }, itemStyle: { color: '#6d5bd0' } },
        { name: T('Forecast', 'पूर्वानुमान'), type: 'line', data: pad(fc.forecast.map(function (x) { return x.value; }), nh), lineStyle: { width: 3, type: 'dashed', color: '#14a38b' }, itemStyle: { color: '#14a38b' }, symbol: 'circle', symbolSize: 6 },
        { name: 'lo', type: 'line', data: pad(fc.forecast.map(function (x) { return x.lo; }), nh), lineStyle: { opacity: 0 }, stack: 'band', symbol: 'none', tooltip: { show: false } },
        { name: T('Range', 'सीमा'), type: 'line', data: pad(fc.forecast.map(function (x) { return x.hi - x.lo; }), nh), lineStyle: { opacity: 0 }, stack: 'band', areaStyle: { color: 'rgba(20,163,139,0.18)' }, symbol: 'none', tooltip: { show: false } }];
      dispose(); chart = echarts.init(el, null, { renderer: 'canvas' }); chart.setOption(o);
    });
  }

  // ================================================================= 3. groups of similar rows
  STL.openClusters = function () {
    ready(function (prof) {
      var ms = measures(prof).filter(function (p) { return !p.tidx; }); if (ms.length < 2) { toast(T('Finding groups needs at least two number columns.', 'समूह खोजने के लिए कम से कम दो संख्या कॉलम चाहिए।'), 'info'); return; }
      var St = { prof: prof, ms: ms, pick: ms.slice(0, 4).map(function (p) { return p.index; }), res: null, err: '' }; drawC(St); runC(St);
    });
  };
  function rowsForClusters(St) {
    var H = HD(), take = function (rows, ix) { var out = [], keep = []; ix.forEach(function (i) { var r = rows[i], v = St.pick.map(function (c) { return CH.num(r[c]); }); if (v.every(function (x) { return x !== null; })) { out.push(v); keep.push(i); } }); return { raw: out, keep: keep }; };
    if (big()) return fetch('/api/engine/' + BIG.ds + '/sample', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ n: 20000 }) }).then(function (r) { return r.json(); }).then(function (j) { var d = take(j.rows, j.rows.map(function (_, i) { return i; })); d.sample = true; d.total = j.total; return d; });
    var ix = IX(), step = Math.max(1, Math.ceil(ix.length / 20000)), sub = []; for (var i = 0; i < ix.length; i += step) sub.push(ix[i]); var d = take(rawData, sub); d.sample = step > 1; d.total = ix.length; return Promise.resolve(d);
  }
  function runC(St) {
    if (St.pick.length < 2) { St.err = T('Choose at least two numbers.', 'कम से कम दो संख्याएँ चुनें।'); fillC(St); return; }
    St.res = null; St.err = ''; fillC(St); var seq = St.seq = (St.seq || 0) + 1;
    rowsForClusters(St).then(function (d) {
      if (seq !== St.seq) return; if (d.raw.length < 40) { St.err = T('Too few rows have all of these numbers (' + d.raw.length + ').', 'इन सभी संख्याओं वाली बहुत कम पंक्तियाँ हैं (' + d.raw.length + ')।'); fillC(St); return; }
      var std = S.standardise(d.raw), pick = S.chooseK(std.Z, 1), km = S.kmeans(std.Z, pick.k, 1), names = St.pick.map(function (c) { return HD()[c]; });
      St.res = { d: d, std: std, pick: pick, km: km, groups: S.describe(km.labels, pick.k, d.raw, names, std), names: names }; fillC(St);
    }).catch(function (e) { St.err = e.message; fillC(St); });
  }
  function drawC(St) {
    var html = '<div class="prj-h"><b>🧩 ' + T('Groups of similar rows', 'मिलती-जुलती पंक्तियों के समूह') + '</b><button id="clX" aria-label="close">×</button></div>' +
      '<div class="big-note">' + T('Finds natural groups among the rows (for example kinds of customers or bills) from a few numbers, and describes each group in words. The number of groups is chosen by how well separated they are.', 'कुछ संख्याओं से पंक्तियों के स्वाभाविक समूह खोजता है (जैसे ग्राहकों या बिलों के प्रकार) और हर समूह को शब्दों में बताता है। समूहों की संख्या इससे चुनी जाती है कि वे कितने अलग-अलग हैं।') + '</div>' +
      '<div class="prj-sub">' + T('Numbers to use (2 to 6)', 'उपयोग की संख्याएँ (2 से 6)') + '</div><div class="rp-checks">' + St.ms.slice(0, 14).map(function (p) { return '<label class="rp-inline"><input type="checkbox" class="clC" data-i="' + p.index + '"' + (St.pick.indexOf(p.index) >= 0 ? ' checked' : '') + '> ' + esc(p.name) + '</label>'; }).join('') + '</div><div id="clOut"></div>';
    var o = U.overlay('clusterDialog', html, true); o.querySelector('.stl-box').classList.add('fr-box');
    $('clX').onclick = function () { dispose(); closeDlg('clusterDialog'); };
    o.querySelectorAll('.clC').forEach(function (c) { c.onchange = function () { var i = +c.dataset.i, k = St.pick.indexOf(i); if (c.checked && k < 0) { if (St.pick.length >= 6) { c.checked = false; return; } St.pick.push(i); } else if (!c.checked && k >= 0) St.pick.splice(k, 1); runC(St); }; });
  }
  function fillC(St) {
    var out = $('clOut'); if (!out) return; dispose(); if (St.err) { out.innerHTML = '<div class="big-err">' + esc(St.err) + '</div>'; return; } if (!St.res) { out.innerHTML = '<div class="big-note">' + T('Looking for groups…', 'समूह खोजे जा रहे हैं…') + '</div>'; return; }
    var r = St.res, p = r.pick, strength = { clear: T('The groups are clearly separate.', 'समूह साफ़ अलग-अलग हैं।'), weak: T('The groups are loose: rows shade into each other, so treat the groups as a rough guide.', 'समूह ढीले हैं: पंक्तियाँ एक-दूसरे में घुलती हैं, इसलिए समूहों को मोटा मार्गदर्शन मानें।'), none: T('No real groups: the rows form one cloud. The split below is not meaningful.', 'कोई वास्तविक समूह नहीं: पंक्तियाँ एक ही बादल बनाती हैं। नीचे का बँटवारा सार्थक नहीं।') }[p.strength];
    var mk = function (g) { return g.marks.length ? g.marks.map(function (m) { var x = m.overall ? m.mean / m.overall : null; return (m.z > 0 ? T('high ', 'ऊँचा ') : T('low ', 'नीचा ')) + esc(m.name) + ' (' + f(m.mean, Math.abs(m.mean) < 100 ? 1 : 0) + (x && x > 0 ? ', ' + T('' + (Math.round(x * 10) / 10) + '× the average', 'औसत का ' + (Math.round(x * 10) / 10) + '×') : '') + ')'; }).join('; ') : T('close to the average in everything', 'हर चीज़ में औसत के पास'); };
    var html = '<div class="big-note" style="border-color:' + (p.clear ? '#14a38b' : (p.strength === 'weak' ? '#d68910' : '#c0392b')) + '"><b>' + T(p.k + ' groups', p.k + ' समूह') + '</b> — ' + strength + ' <small>(' + T('separation score', 'अलगाव स्कोर') + ' ' + (Math.round(p.silhouette * 100) / 100) + ')</small>' + (r.d.sample ? '<br><small>' + T('Found from an even sample of ' + f(r.d.raw.length) + ' of the ' + f(r.d.total) + ' rows.', f(r.d.total) + ' पंक्तियों में से ' + f(r.d.raw.length) + ' के समान नमूने से मिला।') + '</small>' : '') + '</div>' +
      '<table class="big-tbl"><tr><th>' + T('Group', 'समूह') + '</th><th>' + T('Rows', 'पंक्तियाँ') + '</th><th>%</th><th>' + T('What marks it out', 'इसे क्या अलग करता है') + '</th></tr>' + r.groups.map(function (g, i) { return '<tr><td><b>' + T('Group ', 'समूह ') + (i + 1) + '</b></td><td class="num">' + f(r.d.sample ? Math.round(g.share * r.d.total) : g.rows) + '</td><td class="num">' + (Math.round(g.share * 1000) / 10) + '%</td><td>' + mk(g) + '</td></tr>'; }).join('') + '</table>' +
      '<div id="clChart" class="fr-chart" style="height:320px"></div>' + (!big() ? '<div class="prj-row" style="margin-top:8px"><button class="tb-btn primary" id="clAdd">➕ ' + T('Add the group of each row as a column', 'हर पंक्ति का समूह कॉलम के रूप में जोड़ें') + '</button></div>' : '') +
      '<div class="big-note">' + T('The groups come from the numbers only, on a common scale (each number measured in standard deviations). They describe patterns; they do not explain them.', 'समूह केवल संख्याओं से बनते हैं, एक समान पैमाने पर (हर संख्या मानक विचलन में)। वे पैटर्न बताते हैं; कारण नहीं।') + '</div>';
    out.innerHTML = html; STL.clLast = r;
    var order = r.groups.map(function (g) { return g.group; });
    if ($('clAdd')) $('clAdd').onclick = function () { addGroupColumn(St, order); };
    STL.ensureECharts(function () {
      var el = $('clChart'); if (!el) return; var env = CH.kit.envOf({ hi: false }), K = CH.kit, o = K.base({ toolbox: false }, env), cols = CH.PALETTES.aurora, a = 0, b = 1, step = Math.max(1, Math.floor(r.d.raw.length / 1500));
      o.tooltip.trigger = 'item'; o.grid = { left: 12, right: 18, top: 28, bottom: 30, containLabel: true }; o.xAxis = K.valueAxis(env, r.names[a], null, { scale: true }); o.yAxis = K.valueAxis(env, r.names[b], null, { scale: true }); o.legend = { bottom: 0, textStyle: { color: env.text } };
      o.series = order.map(function (gj, rank) { var pts = []; r.km.labels.forEach(function (l, i) { if (l === gj && i % step === 0) pts.push([r.d.raw[i][a], r.d.raw[i][b]]); }); return { name: T('Group ', 'समूह ') + (rank + 1), type: 'scatter', symbolSize: 6, itemStyle: { color: cols[rank % cols.length], opacity: 0.65 }, data: pts }; });
      dispose(); chart = echarts.init(el, null, { renderer: 'canvas' }); chart.setOption(o);
    });
  }
  // each row of the file goes to the nearest group centre (every row, not only the ones the groups were found from)
  function addGroupColumn(St, order) {
    var r = St.res, C = r.km.centers, rank = {}; order.forEach(function (g, i) { rank[g] = i + 1; });
    U.busy(T('Adding the column…', 'कॉलम जोड़ा जा रहा है…'));
    setTimeout(function () {
      try {
        pushUndo(); var nm = T('Group', 'समूह'), name = nm, k = 2; while (headers.indexOf(name) >= 0) name = nm + ' ' + (k++);
        headers.push(name); colTypes.push('text'); var n = 0;
        rawData.forEach(function (row) { var v = St.pick.map(function (c) { return CH.num(row[c]); }); if (v.some(function (x) { return x === null; })) { row.push(''); return; } var bj = 0, bd = Infinity; C.forEach(function (c, j) { var d = 0; v.forEach(function (x, q) { var z = (x - r.std.mean[q]) / r.std.sd[q] - c[q]; d += z * z; }); if (d < bd) { bd = d; bj = j; } }); row.push(T('Group ', 'समूह ') + rank[bj]); n++; });
        if (STL.logStep) STL.logStep('groups', { en: 'Added the group of each row', hi: 'हर पंक्ति का समूह जोड़ा' }, { en: name + ' from ' + r.names.join(', '), hi: name }, { rows: n });
        showTable(); U.busy(null); closeDlg('clusterDialog'); dispose(); toast(T('Added the column “' + name + '” (' + f(n) + ' rows).', 'कॉलम “' + name + '” जोड़ा गया (' + f(n) + ' पंक्तियाँ)।'), 'success');
      } catch (e) { U.busy(null); toast(e.message, 'error'); }
    }, 30);
  }


  // ================================================================= 4. findings in words
  STL.openFindings = function () {
    ready(function (prof) {
      var o = U.overlay('findingsDialog', '<div class="prj-h"><b>📝 ' + T('What this file says', 'यह फ़ाइल क्या कहती है') + '</b><button id="fnX" aria-label="close">×</button></div><div id="fnOut"><div class="big-note">' + T('Reading every row…', 'हर पंक्ति पढ़ी जा रही है…') + '</div></div>', true); o.querySelector('.stl-box').classList.add('fr-box');
      var cur = null; $('fnX').onclick = function () { closeDlg('findingsDialog', cur); };
      var H = HD(), ms = measures(prof), dates = prof.filter(function (p) { return p.date && !p.numeric; }), items = [];
      ET.current().then(function (c) { cur = c; return ET.get('/api/engine/' + c.id + '/profile'); }).then(function (pr) {
        items.push(T('The file has <b>' + f(pr.rows) + '</b> rows and <b>' + f(H.length) + '</b> columns.', 'फ़ाइल में <b>' + f(pr.rows) + '</b> पंक्तियाँ और <b>' + f(H.length) + '</b> कॉलम हैं।'));
        var emp = pr.columns.filter(function (c) { return c.empty > 0 && c.empty / pr.rows >= 0.01; }).sort(function (a, b) { return b.empty - a.empty; });
        items.push(emp.length ? T('Empty cells: ' + emp.slice(0, 5).map(function (c) { return '“' + esc(c.name) + '” ' + f(c.empty) + ' (' + (Math.round(c.empty / pr.rows * 1000) / 10) + '%)'; }).join(', ') + (emp.length > 5 ? ' and ' + (emp.length - 5) + ' more columns' : '') + '.', 'खाली कक्ष: ' + emp.slice(0, 5).map(function (c) { return '“' + esc(c.name) + '” ' + f(c.empty) + ' (' + (Math.round(c.empty / pr.rows * 1000) / 10) + '%)'; }).join(', ') + (emp.length > 5 ? ' और ' + (emp.length - 5) + ' कॉलम' : '') + '।') : T('No column has more than 1% empty cells.', 'किसी कॉलम में 1% से अधिक खाली कक्ष नहीं हैं।'));
        if (!ms.length) return;
        var y = ms[0].index, by = bestGroup(prof, y), jobs = [ET.api('/api/engine/' + cur.id + '/outliers', Object.assign({ col: y, by: by, k: 3.5, limit: 1 }, scope()))];
        if (dates.length) jobs.push(ET.api('/api/engine/' + cur.id + '/series', Object.assign({ date: dates[0].index, y: y, fn: CH.fnFor(ms[0]) === 'avg' ? 'avg' : 'sum' }, scope())));
        var pc = pr.columns[y];
        if (pc && pc.avg !== null && pc.avg !== undefined) items.push(T('“' + esc(H[y]) + '”: total ' + f(pc.sum, 0) + ', average ' + f(pc.avg, 2) + ', from ' + f(pc.min, 2) + ' to ' + f(pc.max, 2) + '.', '“' + esc(H[y]) + '”: कुल ' + f(pc.sum, 0) + ', औसत ' + f(pc.avg, 2) + ', ' + f(pc.min, 2) + ' से ' + f(pc.max, 2) + ' तक।'));
        return Promise.all(jobs).then(function (rs) {
          var ou = rs[0]; if (ou.tested) items.push(ou.flagged ? T('<b>' + f(ou.flagged) + '</b> of ' + f(ou.tested) + ' values of “' + esc(H[y]) + '” look unusual' + (by >= 0 ? ' for their “' + esc(H[by]) + '”' : '') + ' — see Unusual values.', '“' + esc(H[y]) + '” के ' + f(ou.tested) + ' में से <b>' + f(ou.flagged) + '</b> मान असामान्य लगते हैं' + (by >= 0 ? ' (अपने “' + esc(H[by]) + '” के लिए)' : '') + ' — असामान्य मान देखें।') : T('No unusual values in “' + esc(H[y]) + '”.', '“' + esc(H[y]) + '” में कोई असामान्य मान नहीं।'));
          if (rs[1] && rs[1].series.length >= 6) { var sr = rs[1].series, fc = S.forecast(sr.map(function (x) { return x.month; }), sr.map(function (x) { return x.value; }), 3); if (!fc.error) { var a = sr.slice(-12), b = sr.slice(-24, -12); items.push(T('Monthly “' + esc(H[y]) + '” runs from ' + mname(sr[0].month) + ' to ' + mname(sr[sr.length - 1].month) + (b.length === 12 ? '; the last 12 months are ' + (Math.round(Math.abs(a.reduce(function (s, x) { return s + x.value; }, 0) / b.reduce(function (s, x) { return s + x.value; }, 0) - 1) * 1000) / 10) + '% ' + (a.reduce(function (s, x) { return s + x.value; }, 0) >= b.reduce(function (s, x) { return s + x.value; }, 0) ? 'above' : 'below') + ' the 12 before' : '') + '.', 'मासिक “' + esc(H[y]) + '” ' + mname(sr[0].month) + ' से ' + mname(sr[sr.length - 1].month) + ' तक है।')); } }
        });
      }).then(function () { var out = $('fnOut'); if (out) out.innerHTML = '<ul class="fn-list" style="line-height:1.7">' + items.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul><div class="big-note">' + T('Every figure here is counted from all rows, not guessed. For reasons behind a number, use “What explains this?”.', 'यहाँ हर आँकड़ा सभी पंक्तियों से गिना गया है, अनुमान नहीं। किसी संख्या के कारण के लिए “इसे क्या समझाता है?” देखें।') + '</div>'; })
        .catch(function (e) { var out = $('fnOut'); if (out) out.innerHTML = '<div class="big-err">' + esc(e.message) + '</div>'; });
    });
  };
  // ================================================================= 5. tag comments (topics by words, and feeling)
  STL.openTagging = function (preset) {
    var XT = STL.textTools; U.busy(T('Preparing…', 'तैयारी…'));
    ET.current().then(function (cur) {
      return ET.get('/api/engine/' + cur.id + '/profile').then(function (p) {
        U.busy(null); p.columns.rows = p.rows; var tc = preset && preset.text >= 0 ? preset.text : (XT ? XT.pickText(cur.headers, p.columns) : -1);
        if (tc < 0) { var bd = 0; p.columns.forEach(function (c, i) { if (c.type !== 'number' && (c.distinct || 0) > bd) { bd = c.distinct; tc = i; } }); }  // a short column of comments: the one with most different texts
        if (tc < 0) { ET.drop(cur); toast(T('This file has no column of free text.', 'इस फ़ाइल में खुले टेक्स्ट का कोई कॉलम नहीं है।'), 'info'); return; }
        var S = { cur: cur, cols: p.columns, text: tc, tags: [{ name: '', words: '' }], whole: true, feeling: true, pos: '', neg: '', res: null, err: '' };
        drawT(S);
      });
    }).catch(function (e) { U.busy(null); if (e.message) toast(e.message, 'info'); });
  };
  function textCols(S) { return S.cur.headers.map(function (h, i) { return { index: i, name: h }; }).filter(function (x) { return S.cols[x.index] && S.cols[x.index].type !== 'number'; }); }
  function splitWords(s) { return String(s || '').split(/[,\n;،]+/).map(function (w) { return w.trim(); }).filter(Boolean); }
  function dropPreview(S) { if (S.res && S.res.info) ET.api('/api/engine/' + S.res.info.id + '/drop').catch(function () {}); S.res = null; }
  function closeT(S) { dropPreview(S); ET.drop(S.cur); var o = $('tagDialog'); if (o) o.remove(); }
  function drawT(S) {
    var o = $('tagDialog'); if (o) o.remove();
    var html = '<div class="prj-h"><b>🏷 ' + T('Tag comments', 'टिप्पणियों को टैग करें') + '</b><button id="tgX" aria-label="close">×</button></div>' +
      '<div class="big-note">' + T('Adds a column that names the <b>topic</b> of each comment from words you choose (“Delay: late, pending, delay”), and/or a column with its <b>feeling</b> (Positive / Negative / Neutral) from built-in English and Hindi word lists. Every row is read. It follows the words, not the meaning: sarcasm or a word used in another sense is not understood — so check the examples before you keep it.', 'आपके चुने शब्दों से हर टिप्पणी का <b>विषय</b> बताने वाला कॉलम जोड़ता है (“देरी: late, pending, देरी”), और/या उसकी <b>भावना</b> (सकारात्मक / नकारात्मक / तटस्थ) का कॉलम, अंग्रेज़ी और हिंदी की अंतर्निहित शब्द-सूचियों से। हर पंक्ति पढ़ी जाती है। यह शब्दों को देखता है, अर्थ को नहीं: व्यंग्य या दूसरे अर्थ में शब्द समझे नहीं जाते — इसलिए रखने से पहले उदाहरण देखें।') + '</div>' +
      '<label class="rp-field"><span>' + T('Text column', 'टेक्स्ट कॉलम') + '</span><select id="tgCol" class="big-select">' + textCols(S).map(function (x) { return '<option value="' + x.index + '"' + (x.index === S.text ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></label>' +
      '<div class="prj-sub">' + T('Topics (a name, and the words that show it — separate words with commas)', 'विषय (एक नाम, और उसे दर्शाने वाले शब्द — शब्दों को कॉमा से अलग करें)') + '</div><div id="tgRows"></div>' +
      '<div class="prj-row" style="margin:6px 0"><button class="tb-btn" id="tgAdd">➕ ' + T('Another topic', 'एक और विषय') + '</button> <button class="tb-btn" id="tgSug">✨ ' + T('Suggest topics from the commonest words', 'सबसे आम शब्दों से विषय सुझाएँ') + '</button></div>' +
      '<label class="rp-inline"><input type="checkbox" id="tgWhole"' + (S.whole ? ' checked' : '') + '> ' + T('Match whole words only (so “late” does not match “plate”). Switch off for Hindi word endings.', 'केवल पूरे शब्द मिलाएँ (ताकि “late” “plate” से न मिले)। हिंदी के शब्द-अंत के लिए बंद करें।') + '</label><br>' +
      '<label class="rp-inline"><input type="checkbox" id="tgFeel"' + (S.feeling ? ' checked' : '') + '> ' + T('Also add the feeling (Positive / Negative / Neutral)', 'भावना भी जोड़ें (सकारात्मक / नकारात्मक / तटस्थ)') + '</label>' +
      '<div id="tgFeelBox" style="' + (S.feeling ? '' : 'display:none;') + 'margin:4px 0 0 22px"><small>' + T('Words of your own (optional), separated by commas:', 'अपने शब्द (वैकल्पिक), कॉमा से अलग:') + '</small><div class="fr-form"><label class="rp-field"><span>' + T('Count as positive', 'सकारात्मक मानें') + '</span><input id="tgPos" class="big-select" value="' + esc(S.pos) + '"></label><label class="rp-field"><span>' + T('Count as negative', 'नकारात्मक मानें') + '</span><input id="tgNeg" class="big-select" value="' + esc(S.neg) + '"></label></div></div>' +
      '<div class="prj-row" style="margin-top:10px"><button class="tb-btn primary" id="tgGo">' + T('Check it', 'जाँचें') + '</button></div><div id="tgOut"></div>';
    var ov = U.overlay('tagDialog', html, true); ov.querySelector('.stl-box').classList.add('fr-box');
    var rows = function () {
      $('tgRows').innerHTML = S.tags.map(function (t, i) { return '<div class="fr-form" style="align-items:flex-end"><label class="rp-field" style="max-width:190px"><span>' + T('Name', 'नाम') + '</span><input class="big-select tgN" data-i="' + i + '" value="' + esc(t.name) + '"></label><label class="rp-field" style="flex:1"><span>' + T('Words', 'शब्द') + '</span><input class="big-select tgW" data-i="' + i + '" value="' + esc(t.words) + '"></label>' + (S.tags.length > 1 ? '<button class="tb-btn tgD" data-i="' + i + '" aria-label="remove">×</button>' : '') + '</div>'; }).join('');
      ov.querySelectorAll('.tgN').forEach(function (e) { e.oninput = function () { S.tags[+e.dataset.i].name = e.value; }; });
      ov.querySelectorAll('.tgW').forEach(function (e) { e.oninput = function () { S.tags[+e.dataset.i].words = e.value; }; });
      ov.querySelectorAll('.tgD').forEach(function (e) { e.onclick = function () { S.tags.splice(+e.dataset.i, 1); rows(); }; });
    };
    rows();
    $('tgX').onclick = function () { closeT(S); };
    $('tgCol').onchange = function () { S.text = +this.value; };
    $('tgWhole').onchange = function () { S.whole = this.checked; };
    $('tgFeel').onchange = function () { S.feeling = this.checked; $('tgFeelBox').style.display = this.checked ? '' : 'none'; };
    $('tgPos').oninput = function () { S.pos = this.value; }; $('tgNeg').oninput = function () { S.neg = this.value; };
    $('tgAdd').onclick = function () { if (S.tags.length < 40) { S.tags.push({ name: '', words: '' }); rows(); } };
    $('tgSug').onclick = function () {
      U.busy(T('Reading the comments…', 'टिप्पणियाँ पढ़ी जा रही हैं…'));
      ET.api('/api/engine/' + S.cur.id + '/words', { col: S.text, by: -1, top: 8 }).then(function (r) {
        U.busy(null); var sug = r.common.slice(0, 8).map(function (x) { return { name: x.w, words: x.w }; });
        S.tags = S.tags.filter(function (t) { return t.name || t.words; }).concat(sug).slice(0, 40); rows();
        toast(T('Added the commonest words as topics. Rename them and add similar words.', 'सबसे आम शब्द विषय के रूप में जोड़े गए। उनके नाम बदलें और मिलते-जुलते शब्द जोड़ें।'), 'info');
      }).catch(function (e) { U.busy(null); toast(e.message, 'error'); });
    };
    $('tgGo').onclick = function () {
      var tags = S.tags.map(function (t) { return { name: t.name.trim(), words: splitWords(t.words) }; }).filter(function (t) { return t.name && t.words.length; });
      var out = $('tgOut'); dropPreview(S);
      if (!tags.length && !S.feeling) { out.innerHTML = '<div class="big-err">' + T('Add a topic (a name and some words), or tick the feeling.', 'एक विषय (नाम और कुछ शब्द) जोड़ें, या भावना चुनें।') + '</div>'; return; }
      out.innerHTML = '<div class="big-note">' + T('Reading every comment…', 'हर टिप्पणी पढ़ी जा रही है…') + '</div>';
      ET.api('/api/engine/' + S.cur.id + '/tags', { col: S.text, tags: tags, whole: S.whole, sentiment: S.feeling, extraPos: splitWords(S.pos), extraNeg: splitWords(S.neg) }).then(function (r) { S.res = r; showT(S, tags); })
        .catch(function (e) { out.innerHTML = '<div class="big-err">' + esc(e.message) + '</div>'; });
    };
  }
  function showT(S, tags) {
    var r = S.res, n = r.info.rows, out = $('tgOut'), pcs = function (k, tot) { return tot ? (Math.round(k / tot * 1000) / 10) + '%' : '–'; }, html = '';
    if (tags.length) {
      var named = n - (r.other || 0); html += '<div class="prj-sub">' + T('Topics', 'विषय') + '</div><table class="big-tbl"><tr><th>' + T('Topic', 'विषय') + '</th><th>' + T('Comments', 'टिप्पणियाँ') + '</th><th>%</th><th>' + T('Examples', 'उदाहरण') + '</th></tr>' +
        tags.map(function (t) { return '<tr><td><b>' + esc(t.name) + '</b></td><td class="num">' + f(r.counts[t.name] || 0) + '</td><td class="num">' + pcs(r.counts[t.name] || 0, n) + '</td><td><small>' + ((r.tag_examples[t.name] || []).map(function (x) { return '“' + esc(String(x).slice(0, 90)) + '”'; }).join('<br>') || '–') + '</small></td></tr>'; }).join('') +
        '<tr><td><i>' + T('Other (no topic word)', 'अन्य (कोई विषय-शब्द नहीं)') + '</i></td><td class="num">' + f(r.other) + '</td><td class="num">' + pcs(r.other, n) + '</td><td></td></tr></table>' +
        '<div class="big-note">' + T('A comment with words of two topics is counted in both, so the topic counts can add up to more than the rows. If “Other” is large, look at some of its comments and add their words.', 'दो विषयों के शब्द वाली टिप्पणी दोनों में गिनी जाती है, इसलिए विषयों की गिनती पंक्तियों से अधिक हो सकती है। “अन्य” बड़ा हो तो उसकी कुछ टिप्पणियाँ देखकर उनके शब्द जोड़ें।') + '</div>';
    }
    if (S.feeling) {
      var P = r.feeling.Positive || 0, N = r.feeling.Negative || 0, Z = r.feeling.Neutral || 0, tot = P + N + Z;
      html += '<div class="prj-sub">' + T('Feeling', 'भावना') + '</div><table class="big-tbl"><tr><th></th><th>' + T('Comments', 'टिप्पणियाँ') + '</th><th>%</th><th>' + T('Examples', 'उदाहरण') + '</th></tr>' +
        [['Positive', T('Positive', 'सकारात्मक'), P], ['Negative', T('Negative', 'नकारात्मक'), N], ['Neutral', T('Neutral (no feeling words, or they cancel)', 'तटस्थ (भावना-शब्द नहीं, या कट गए)'), Z]].map(function (x) { return '<tr><td><b>' + x[1] + '</b></td><td class="num">' + f(x[2]) + '</td><td class="num">' + pcs(x[2], tot) + '</td><td><small>' + ((r.examples[x[0]] || []).map(function (e) { return '“' + esc(String(e).slice(0, 90)) + '”'; }).join('<br>')) + '</small></td></tr>'; }).join('') + '</table>' +
        '<div class="big-note">' + T('Based on a list of about 230 English and Hindi feeling words; “not good” counts as negative. Comments with none of these words are Neutral — that does not mean the writer felt nothing.', 'लगभग 230 अंग्रेज़ी और हिंदी भावना-शब्दों की सूची पर आधारित; “not good” नकारात्मक गिना जाता है। जिन टिप्पणियों में ये शब्द नहीं, वे तटस्थ हैं — इसका मतलब यह नहीं कि लिखने वाले को कुछ महसूस नहीं हुआ।') + '</div>';
    }
    html += '<div class="prj-row" style="margin-top:8px"><button class="tb-btn primary" id="tgKeep">✔ ' + T('Add the column(s) to my file', 'कॉलम मेरी फ़ाइल में जोड़ें') + '</button></div>';
    out.innerHTML = html;
    $('tgKeep').onclick = function () {
      var info = r.info, cur = S.cur, nm = cur.name, cols = r.columns.join(', '); S.res = null; var o = $('tagDialog'); if (o) o.remove(); U.busy(T('Adding the columns…', 'कॉलम जोड़े जा रहे हैं…'));
      ET.open(info, nm, { en: 'Comments tagged', hi: 'टिप्पणियाँ टैग की गईं' }, { en: cur.headers[S.text] + ': ' + cols, hi: cur.headers[S.text] }, [cur]);
    };
  }

  (STL.actions || []).push({ en: 'Unusual values (rows far from what is usual for their group)', hi: 'असामान्य मान (अपने समूह के सामान्य से बहुत दूर पंक्तियाँ)', kw: 'unusual outlier anomaly abnormal suspicious odd extreme fraud check mistakes values asamanya', run: function () { STL.openOutliers(); }, group: 'Analyse' });
  (STL.actions || []).push({ en: 'Forecast the next months', hi: 'अगले महीनों का पूर्वानुमान', kw: 'forecast predict future next month trend projection purvanumaan', run: function () { STL.openForecast(); }, group: 'Analyse' });
  (STL.actions || []).push({ en: 'Groups of similar rows (clusters, kinds of customers)', hi: 'मिलती-जुलती पंक्तियों के समूह', kw: 'cluster group segment similar kinds types customers kmeans samuh', run: function () { STL.openClusters(); }, group: 'Analyse' });
  (STL.actions || []).push({ en: 'What this file says (summary in words)', hi: 'यह फ़ाइल क्या कहती है (शब्दों में सार)', kw: 'summary findings insights overview describe saransh', run: function () { STL.openFindings(); }, group: 'Analyse' });
  (STL.actions || []).push({ en: 'Tag comments by topic and feeling', hi: 'टिप्पणियों को विषय और भावना से टैग करें', kw: 'tag tagging sentiment feeling positive negative topic category comments feedback complaints text classify label tipanni bhavna', run: function () { STL.openTagging(); }, group: 'Analyse' });
  STL.extraTiles = STL.extraTiles || [];
  [['🔎', 'Unusual values', 'असामान्य मान', 'Rows far from the usual', 'सामान्य से दूर पंक्तियाँ', 'openOutliers'], ['📈', 'Forecast', 'पूर्वानुमान', 'The next months', 'अगले महीने', 'openForecast'], ['📝', 'File summary', 'फ़ाइल का सार', 'Findings in words', 'शब्दों में निष्कर्ष', 'openFindings'], ['🧩', 'Similar groups', 'मिलते-जुलते समूह', 'Kinds of rows, in words', 'पंक्तियों के प्रकार', 'openClusters']].forEach(function (t) { STL.extraTiles.push([t[0], t[1], t[2], t[3], t[4], function () { if (!U.hasData() && !big()) { toast(T('Open a file first', 'पहले फ़ाइल खोलें'), 'info'); return; } STL[t[5]](); }]); });
})(typeof window !== 'undefined' ? window : globalThis);
