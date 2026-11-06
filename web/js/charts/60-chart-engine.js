// =====================================================================
//  CHART ENGINE  /  चार्ट इंजन
//  Pure logic, no DOM and no chart library: turns table columns into chart definitions (Apache ECharts
//  options), recommends the charts that suit the data, and writes plain-language captions from the
//  computed numbers. The Studio (61-*.js) draws the options and wires the interactions.
//
//    STL.charts.TYPES                          chart gallery
//    STL.charts.profile(headers, rows, idx)    -> per-column facts used for suggestions
//    STL.charts.prepare(spec, headers, rows, idx) -> aggregated data (with the raw values behind every bar)
//    STL.charts.build(type, spec, headers, rows, idx, env) -> { option, data, caption }
//    STL.charts.recommend(headers, rows, idx)  -> [{ type, spec, why }]
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL = root.STL || {};
  var CH = STL.charts = {};
  function s(v) { return v == null ? '' : String(v); }
  function blank(v) { return s(v).trim() === ''; }
  function B(en, hi) { return { en: en, hi: hi }; }

  // ------------------------------------------------------------ gallery
  CH.TYPES = [
    { id: 'column',  group: 'compare', name: B('Column', 'स्तंभ'),               needs: 'cat+num' },
    { id: 'bar',     group: 'compare', name: B('Bar (horizontal)', 'पट्टी'),     needs: 'cat+num' },
    { id: 'stackedColumn', group: 'compare', name: B('Stacked column', 'स्टैक स्तंभ'), needs: 'cat+num+split' },
    { id: 'percentColumn', group: 'compare', name: B('100% stacked', '100% स्टैक'),   needs: 'cat+num+split' },
    { id: 'combo',   group: 'compare', name: B('Column + line', 'स्तंभ + रेखा'), needs: 'cat+num2' },
    { id: 'pareto',  group: 'compare', name: B('Pareto (80/20)', 'पैरेटो (80/20)'), needs: 'cat+num' },
    { id: 'waterfall', group: 'compare', name: B('Waterfall', 'वॉटरफ़ॉल'),      needs: 'cat+num' },
    { id: 'line',    group: 'trend',   name: B('Line', 'रेखा'),                  needs: 'cat+num' },
    { id: 'area',    group: 'trend',   name: B('Area', 'क्षेत्र'),               needs: 'cat+num' },
    { id: 'stackedArea', group: 'trend', name: B('Stacked area', 'स्टैक क्षेत्र'), needs: 'cat+num+split' },
    { id: 'calendar', group: 'trend',  name: B('Calendar heat map', 'कैलेंडर हीट मैप'), needs: 'date' },
    { id: 'pie',     group: 'share',   name: B('Pie', 'पाई'),                    needs: 'cat+num' },
    { id: 'donut',   group: 'share',   name: B('Donut', 'डोनट'),                 needs: 'cat+num' },
    { id: 'rose',    group: 'share',   name: B('Rose', 'गुलाब'),                 needs: 'cat+num' },
    { id: 'funnel',  group: 'share',   name: B('Funnel', 'फ़नल'),                needs: 'cat+num' },
    { id: 'treemap', group: 'hier',    name: B('Treemap', 'ट्रीमैप'),            needs: 'cat+num' },
    { id: 'sunburst', group: 'hier',   name: B('Sunburst', 'सनबर्स्ट'),          needs: 'cat+num+split' },
    { id: 'scatter', group: 'relate',  name: B('Scatter', 'बिखराव'),             needs: 'num2' },
    { id: 'bubble',  group: 'relate',  name: B('Bubble', 'बबल'),                 needs: 'num3' },
    { id: 'heatmap', group: 'relate',  name: B('Heat map', 'हीट मैप'),           needs: 'cat2' },
    { id: 'sankey',  group: 'relate',  name: B('Flow (Sankey)', 'प्रवाह (सैंकी)'), needs: 'cat2' },
    { id: 'radar',   group: 'relate',  name: B('Radar', 'रडार'),                 needs: 'cat+num3' },
    { id: 'histogram', group: 'dist',  name: B('Histogram', 'हिस्टोग्राम'),      needs: 'num' },
    { id: 'boxplot', group: 'dist',    name: B('Box plot', 'बॉक्स प्लॉट'),       needs: 'cat+num' },
    { id: 'gauge',   group: 'kpi',     name: B('Gauge (KPI)', 'गेज (केपीआई)'),  needs: 'num' }
  ];
  CH.GROUPS = { compare: B('Compare', 'तुलना'), trend: B('Over time', 'समय के साथ'), share: B('Share of total', 'हिस्सेदारी'), hier: B('Hierarchy', 'पदानुक्रम'), relate: B('Relationships', 'संबंध'), dist: B('Spread', 'फैलाव'), kpi: B('Single number', 'एक संख्या') };
  CH.FUNCS = [['sum', B('Total', 'योग')], ['avg', B('Average', 'औसत')], ['count', B('Count of rows', 'पंक्तियों की गिनती')], ['min', B('Smallest', 'न्यूनतम')], ['max', B('Largest', 'अधिकतम')], ['median', B('Median', 'माध्यिका')], ['distinct', B('Different values', 'अलग मान')], ['pct', B('% of rows where…', '% पंक्तियाँ जहाँ…')]];
  CH.PALETTES = {
    aurora: ['#6d5bd0', '#14a38b', '#e8913a', '#d6456b', '#3b82c4', '#8f9aa8', '#9a6fd0', '#4aa3a2', '#c9a227', '#7a8cff'],
    saffron: ['#e8791a', '#138808', '#1b3a8c', '#c43d2f', '#7a4f9a', '#f2b134', '#3a8f8f', '#8c6a43', '#d65a8a', '#5a6b7b'],
    ocean: ['#0b6e99', '#1aa6b7', '#4fd1c5', '#2b4c7e', '#7fb7d8', '#f4a259', '#bc4b51', '#5b8e7d', '#8cb369', '#3d5a80'],
    safe: ['#0072b2', '#e69f00', '#009e73', '#cc79a7', '#56b4e9', '#d55e00', '#f0e442', '#000000', '#999999', '#8e44ad'],
    mono: ['#2f2a6b', '#4c46a3', '#6d5bd0', '#8f7de0', '#b2a4ee', '#d3caf7', '#5f5a8f', '#7b77a8', '#a09dc4', '#c6c4dc']
  };

  // ------------------------------------------------------------ numbers and text
  var FASTNUM = /^-?\d{1,15}(?:\.\d+)?$/;                                                        // a plain number: no need for the full reader (7x faster on 50,000 rows)
  function num(v) { if (typeof v === 'string' && FASTNUM.test(v)) return +v; var F = STL.fix && STL.fix.util; if (F) return F.parseNumber(v); var t = s(v).replace(/,/g, '').trim(); return t === '' || isNaN(Number(t)) ? null : Number(t); }
  function indian(n, dec) {
    if (n == null || !isFinite(n)) return '–';
    dec = dec == null ? (Math.abs(n) < 1000 && n !== Math.round(n) ? 2 : 0) : dec;
    var neg = n < 0, t = Math.abs(n).toFixed(dec).split('.'), i = t[0], last3 = i.slice(-3), rest = i.slice(0, -3);
    if (rest) last3 = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
    return (neg ? '-' : '') + last3 + (t[1] ? '.' + t[1] : '');
  }
  // 12,50,000 -> "12.5 L" / "12.5 लाख"; 3,20,00,000 -> "3.2 Cr"
  function compact(n, hi) {
    if (n == null || !isFinite(n)) return '';
    var a = Math.abs(n), sg = n < 0 ? '-' : '', r = function (x) { return String(Math.round(x * 10) / 10).replace(/\.0$/, ''); };
    if (a >= 1e7) return sg + r(a / 1e7) + (hi ? ' करोड़' : ' Cr');
    if (a >= 1e5) return sg + r(a / 1e5) + (hi ? ' लाख' : ' L');
    if (a >= 1e4) return sg + r(a / 1e3) + 'K';
    return sg + (a >= 100 ? Math.round(a) : r(a));
  }
  CH.indian = indian; CH.compact = compact;
  function pctText(x) { return (Math.abs(x) >= 10 ? Math.round(x) : Math.round(x * 10) / 10) + '%'; }

  function isDateVal(v) { var P = STL.pend; return P && P.parseDate && P.parseDate(v, false) !== null; }
  function dateMs(v) { var P = STL.pend; return P && P.parseDate ? P.parseDate(v, false) : null; }

  // ------------------------------------------------------------ column facts
  var NAME_ID = /(^|[\s._\-/])(id|uid|guid|sr|sl|no|number|क्रम|क्रमांक|नंबर|आईडी)([\s._\-/]|$)/i, NAME_CODE = /(^|[\s._\-/])(code|pin|pincode|zip|phone|mobile|contact|aadhaar|aadhar|कोड|फोन|मोबाइल)([\s._\-/]|$)/i,
      NAME_COORD = /^(lat|latitude|lon|long|lng|longitude|अक्षांश|देशांतर)$/i, NAME_SCORE = /(^|[^a-z])(rating|ratings|score|scores|grade|marks|percent|percentage|pct|rate|ratio|index|age)([^a-z]|$)|%|आयु|अंक|प्रतिशत/i;
  function colFacts(rows, idx, c, header) {
    var n = 0, nn = 0, np = 0, nd = 0, distinct = {}, nd2 = 0, code = 0, allInt = true, min = Infinity, max = -Infinity, zeros = 0, sample = Math.min(idx.length, 4000), listy = 0, items = {}, itemTotal = 0, itemDistinct = 0, xs = [];
    for (var k = 0; k < sample; k++) {
      var v = rows[idx[k]][c]; n++;
      if (blank(v)) continue; nn++;
      var t = s(v).trim(); if (/^0\d+$/.test(t) || /^\d{10,}$/.test(t)) code++;
      var x = num(v); if (x !== null) { np++; if (x < min) min = x; if (x > max) max = x; if (x % 1 !== 0) allInt = false; if (x === 0) zeros++; xs.push(x); }
      else {
        if (isDateVal(v)) nd++;
        if (t.indexOf(',') > 0) { listy++; t.split(',').forEach(function (it) { it = it.trim().toLowerCase(); if (!it) return; itemTotal++; if (!items[it]) { items[it] = 1; itemDistinct++; } }); }
      }
      var key = t.toLowerCase(); if (!distinct[key]) { distinct[key] = 1; nd2++; }
    }
    var serial = false;
    if (np >= 3 && np === nn && nd2 === nn && max - min + 1 === nn && min <= 1) serial = true;
    // all-different text is an identifier (names, case numbers). All-different NUMBERS are usually amounts, not identifiers:
    // only whole numbers that run in sequence, or that sit under an "ID / No." heading, count as identifiers.
    var numLike = nn > 0 && np / nn >= 0.8, idName = NAME_ID.test(s(header));
    var unique = nn > 12 && nd2 === nn && (!numLike || (allInt && (idName || max - min + 1 <= nn * 1.2)));
    var numeric = nn > 0 && np / nn >= 0.8 && code / nn < 0.3 && !serial;
    var coord = numeric && NAME_COORD.test(s(header).trim()), idLike = numeric && allInt && idName && nd2 > nn * 0.5;
    // a short list of whole numbers (price range 1-4, a country code, a 1-5 grade) is a label, not an amount
    var lowInt = numeric && allInt && nd2 <= 12 && nn >= 20 && !coord;
    // "North Indian, Chinese": a text column whose comma-separated items repeat a lot is a LIST of tags, not one value
    var list = !numeric && nn > 0 && listy / nn >= 0.25 && itemTotal > 0 && itemDistinct / itemTotal < 0.25 && itemDistinct <= 400;
    // a share between 0 and 1 (danceability 0.76): to be averaged, never added up. A number with a few huge values (streams): best looked at on a log scale.
    var unit = numeric && !allInt && min >= 0 && max <= 1 && nd2 > 10, heavy = false, flag = false, flagKeys = null;
    if (numeric && min >= 0 && xs.length > 200 && nd2 > 30) { xs.sort(function (a, b) { return a - b; }); var m50 = xs[xs.length >> 1], m99 = xs[Math.floor(xs.length * 0.99)]; heavy = m50 > 0 && m99 / m50 > 15 && xs[xs.length - 1] / m50 > 50; }
    if (nn >= 20 && nd2 === 2) { flagKeys = Object.keys(distinct); flag = true; }
    return { index: c, name: s(header), filled: nn, unit: unit, heavy: heavy, flag: flag, flagKeys: flagKeys, fill: n ? nn / n : 0, numeric: numeric, date: nn > 0 && nd / nn >= 0.8, distinct: nd2, min: min, max: max, code: code / Math.max(nn, 1) > 0.3 || (numeric && NAME_CODE.test(s(header)) && allInt), serial: serial, unique: unique,
             zeros: zeros, zeroPct: np ? zeros / np : 0, commaPct: nn ? listy / nn : 0, allInt: allInt, coord: coord, idLike: idLike, lowInt: lowInt, list: list, items: itemDistinct, score: NAME_SCORE.test(s(header)), tidx: numeric && NAME_TIMEIDX.test(s(header)) };
  }
  CH.profile = function (headers, rows, idx) {
    var prof = headers.map(function (h, i) { return colFacts(rows, idx, i, h); });
    // how many other columns carry a word of this column's name ("plate_waste_percentage" -> "waste_adjusted_cost",
    // "primary_food_waste_driver"): the number other columns are built from is usually the headline number
    // a word that many columns carry ("customer_review_rating", "customer_brand_loyalty_tier", ...) says nothing about
    // one being made from another: 4 or more columns (and 10%) make it a common word, ignored here and in the drivers
    var df = {}; headers.forEach(function (h) { var seen = {}; CH.nameWords(h, true).forEach(function (w) { if (!seen[w]) { seen[w] = 1; df[w] = (df[w] || 0) + 1; } }); });
    CH.commonWords = {}; Object.keys(df).forEach(function (w) { if (df[w] >= 4 && df[w] >= 0.1 * headers.length) CH.commonWords[w] = 1; });
    var W = prof.map(function (p) { return CH.nameWords(p.name); });
    prof.forEach(function (p, i) { p.namedBy = 0; W.forEach(function (w, j) { if (j !== i && w.some(function (x) { return W[i].indexOf(x) >= 0; })) p.namedBy++; }); });
    return prof;
  };
  var NAME_STOP = { the: 1, and: 1, per: 1, for: 1, rate: 1, score: 1, index: 1, total: 1, count: 1, type: 1, data: 1, value: 1, level: 1, pct: 1, percentage: 1, percent: 1, cost: 1, idr: 1, inr: 1, rupees: 1, amount: 1, estimate: 1, estimated: 1, daily: 1, weekly: 1, monthly: 1, yearly: 1, annual: 1, average: 1, avg: 1, mean: 1, primary: 1, net: 1, gross: 1, ratio: 1, number: 1, name: 1, code: 1, date: 1 };
  CH.commonWords = {};
  CH.nameWords = function (name, keepCommon) { return String(name == null ? '' : name).toLowerCase().split(/[^a-zऀ-ॿ]+/).filter(function (w) { return w.length >= 4 && !NAME_STOP[w] && (keepCommon || !CH.commonWords[w]); }); };

  // ------------------------------------------------------------ aggregation
  function reduce(vals, fn) {
    if (fn === 'count') return vals.length;
    if (fn === 'distinct') { var u = {}; vals.forEach(function (v) { u[s(v).trim().toLowerCase()] = 1; }); return Object.keys(u).length; }
    var nums = []; vals.forEach(function (v) { var x = typeof v === 'number' ? v : num(v); if (x !== null) nums.push(x); });
    if (!nums.length) return null;
    switch (fn) {
      case 'pct': return nums.reduce(function (a, b) { return a + b; }, 0) / nums.length;              // the values are already 100 / 0
      case 'sum': return nums.reduce(function (a, b) { return a + b; }, 0);
      case 'avg': return nums.reduce(function (a, b) { return a + b; }, 0) / nums.length;
      case 'min': return Math.min.apply(null, nums);
      case 'max': return Math.max.apply(null, nums);
      case 'median': { nums.sort(function (a, b) { return a - b; }); var m = nums.length >> 1; return nums.length % 2 ? nums[m] : (nums[m - 1] + nums[m]) / 2; }
    }
    return null;
  }
  function quantile(sorted, q) { if (!sorted.length) return null; var p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo); }
  // ---- conditions ("temperature < 60", "status = Pending") and number bands ("60–65")
  var OPS = { '<': function (a, b) { return a < b; }, '<=': function (a, b) { return a <= b; }, '>': function (a, b) { return a > b; }, '>=': function (a, b) { return a >= b; }, '=': function (a, b) { return a === b; }, '!=': function (a, b) { return a !== b; } };
  CH.OPS = ['<', '<=', '>', '>=', '=', '!='];
  CH.cond = function (v, op, val) {                                               // null when the cell is empty
    if (blank(v)) return null; var f = OPS[op] || OPS['='], a = num(v), b = num(val);
    if (a !== null && b !== null) return f(a, b);
    var x = s(v).trim().toLowerCase(), y = s(val).trim().toLowerCase(); return (op === '=' || op === '!=') ? f(x, y) : f(x, y);
  };
  CH.condText = function (y, headers) { return s(y.name || headers[y.col]) + ' ' + ({ '<=': '≤', '>=': '≥', '!=': '≠' }[y.op] || y.op || '=') + ' ' + s(y.value); };
  function niceStep(span, k) { var raw = span / Math.max(k, 1), p = Math.pow(10, Math.floor(Math.log10(raw || 1))), m = raw / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }
  function fmtEdge(v) { return Math.abs(v) >= 1000 ? indian(v) : String(Math.round(v * 1000) / 1000); }
  // equal-width bands with round edges between min and max (k is the wished number of bands)
  CH.makeBands = function (min, max, k) {
    if (!isFinite(min) || !isFinite(max)) return null; if (min === max) max = min + 1;
    var step = niceStep(max - min, k || 6), start = Math.floor(min / step) * step, edges = [start];
    while (edges[edges.length - 1] <= max - 1e-12 && edges.length < 60) edges.push(Math.round((edges[edges.length - 1] + step) * 1e9) / 1e9);
    return CH.bandsFromEdges(edges);
  };
  // bands with given cut points, e.g. quintiles [lo, c1, c2, c3, c4, hi]
  CH.bandsFromEdges = function (edges) {
    var n = edges.length - 1, labels = []; for (var i = 0; i < n; i++) labels.push(fmtEdge(edges[i]) + '–' + fmtEdge(edges[i + 1]));
    return { edges: edges, n: n, labels: labels };
  };
  CH.bandOf = function (b, v) { if (v === null || v === undefined || !isFinite(v)) return -1; for (var i = 0; i < b.n - 1; i++) if (v < b.edges[i + 1]) return i; return b.n - 1; };
  CH.quantileBands = function (values, k) {
    var v = values.filter(function (x) { return x !== null && isFinite(x); }).sort(function (a, b) { return a - b; }); if (!v.length) return null;
    var e = [v[0]]; for (var i = 1; i < k; i++) { var q = quantile(v, i / k); if (q > e[e.length - 1]) e.push(q); } if (v[v.length - 1] > e[e.length - 1]) e.push(v[v.length - 1]); else if (e.length === 1) e.push(v[0] + 1);
    return CH.bandsFromEdges(e);
  };
  CH.bandsForColumn = function (rows, idx, col, k) { var mn = Infinity, mx = -Infinity; idx.forEach(function (i) { var x = num(rows[i][col]); if (x !== null) { if (x < mn) mn = x; if (x > mx) mx = x; } }); return CH.makeBands(mn, mx, k); };
  function fnLabel(fn, hi) { var f = CH.FUNCS.filter(function (x) { return x[0] === fn; })[0]; return f ? f[1][hi ? 'hi' : 'en'] : fn; }

  // time bucketing for a date column
  function bucketKey(ms, mode) {
    var d = new Date(ms), y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, dd = d.getUTCDate(), p2 = function (x) { return ('0' + x).slice(-2); };
    switch (mode) {
      case 'year': return String(y);
      case 'fy': { var a = m >= 4 ? y : y - 1; return a + '-' + p2((a + 1) % 100); }
      case 'quarter': return y + '-Q' + Math.ceil(m / 3);
      case 'month': return y + '-' + p2(m);
      case 'weekday': return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
      default: return y + '-' + p2(m) + '-' + p2(dd);
    }
  }
  CH.bucketKey = bucketKey;

  // spec: {x, ys:[{col,fn}], g, fn, sort ('desc'|'asc'|'label'|'natural'), topN, others, time ('day'|'month'|'quarter'|'year'|'fy'|'weekday'), maxGroups}
  CH.prepare = function (spec, headers, rows, idx) {
    var x = spec.x, ys = (spec.ys && spec.ys.length ? spec.ys : [{ col: -1, fn: 'count' }]).map(function (y) { return { col: y.col, fn: y.col < 0 ? 'count' : (y.fn || spec.fn || 'sum'), as: y.as, name: y.name, op: y.op, value: y.value }; });
    var g = spec.g >= 0 && spec.g !== undefined ? spec.g : -1, useG = g >= 0 && ys.length === 1;
    var isDate = x >= 0 && spec.time && spec.time !== 'none';
    var bands = (spec.bands && x >= 0 && !isDate) ? (spec._bands || CH.bandsForColumn(rows, idx, x, spec.bands)) : null;
    var cats = {}, order = [], gNames = {}, gOrder = [], blanks = 0, multi = !!spec.multi && x >= 0 && !isDate, noZero = !!spec.noZero;
    var zeroSkipped = 0;
    for (var k = 0; k < idx.length; k++) {
      var row = rows[idx[k]], xv = x >= 0 ? row[x] : '', labels = [];
      if (x >= 0 && blank(xv)) { blanks++; labels.push(['(blank)', '', '']); }
      else if (isDate) { var ms = dateMs(xv); if (ms === null) { blanks++; continue; } var bk = bucketKey(ms, spec.time); labels.push([bk, bk, '']); }
      else if (multi) { var seen = {}; s(xv).split(spec.sep || ',').forEach(function (it) { it = it.trim(); var key = it.toLowerCase(); if (it && !seen[key]) { seen[key] = 1; labels.push([it, key, it]); } }); if (!labels.length) { blanks++; labels.push(['(blank)', '', '']); } }
      else if (bands) { var bv = num(xv), bi = CH.bandOf(bands, bv); if (bi < 0) { blanks++; labels.push(['(blank)', '', '']); } else labels.push([bands.labels[bi], 'b' + ('00' + bi).slice(-3), '']); }
      else { var lb = s(xv).trim(); labels.push([lb, lb.toLowerCase(), s(xv)]); }
      for (var li = 0; li < labels.length; li++) {
        var label = labels[li][0], rawKey = labels[li][1];
        var c = cats[rawKey]; if (!c) { c = cats[rawKey] = { label: label, raw: {}, rows: [], vals: {}, rb: {}, key: rawKey }; order.push(rawKey); }
        if (x >= 0 && !blank(xv) && labels[li][2]) c.raw[labels[li][2]] = 1;
        c.rows.push(idx[k]);
        var sk;
        if (useG) { sk = blank(row[g]) ? '(blank)' : s(row[g]).trim(); if (!gNames[sk]) { gNames[sk] = 0; gOrder.push(sk); } gNames[sk]++; (c.vals[sk] = c.vals[sk] || []).push(valueFor(row, ys[0])); (c.rb[sk] = c.rb[sk] || []).push(idx[k]); }
        else ys.forEach(function (y, yi) { (c.vals['y' + yi] = c.vals['y' + yi] || []).push(valueFor(row, y)); (c.rb['y' + yi] = c.rb['y' + yi] || []).push(idx[k]); });
      }
    }
    var zm = noZero ? ys.filter(function (y) { return y.col >= 0 && y.fn !== 'count' && y.fn !== 'distinct'; })[0] : null, zeroName = zm ? (zm.name || s(headers[zm.col])) : '';
    if (zm) idx.forEach(function (i) { if (num(rows[i][zm.col]) === 0) zeroSkipped++; });
    function valueFor(row, y) { if (y.col < 0) return 1; var v = row[y.col]; if (y.fn === 'pct') { var c = CH.cond(v, y.op, y.value); return c === null ? null : (c ? 100 : 0); } if (noZero && y.fn !== 'count' && y.fn !== 'distinct' && num(v) === 0) return null; return v; }
    // group (series) selection: biggest groups, rest -> Other
    var maxG = spec.maxGroups || 8;
    if (useG && gOrder.length > maxG) {
      gOrder.sort(function (a, b) { return gNames[b] - gNames[a]; });
      var keep = gOrder.slice(0, maxG - 1), other = gOrder.slice(maxG - 1);
      order.forEach(function (key) { var c = cats[key], merged = [], mrows = []; other.forEach(function (o) { if (c.vals[o]) { merged = merged.concat(c.vals[o]); mrows = mrows.concat(c.rb[o]); delete c.vals[o]; delete c.rb[o]; } }); if (merged.length) { c.vals['(other)'] = merged; c.rb['(other)'] = mrows; } });
      gOrder = keep.concat(['(other)']);
    }
    var seriesKeys = useG ? gOrder : ys.map(function (_, i) { return 'y' + i; });
    var seriesDefs = useG ? gOrder.map(function (nm) { return { name: nm, fn: ys[0].fn, shown: ys[0].as || ys[0].fn, col: ys[0].col, mname: ys[0].name }; }) : ys.map(function (y, i) { return { name: y.fn === 'pct' ? '% ' + CH.condText(y, headers) : (y.name || (y.col < 0 ? 'Rows' : s(headers[y.col]))), fn: y.fn, shown: y.as || y.fn, col: y.col, mname: y.fn === 'pct' ? '% ' + CH.condText(y, headers) : y.name }; });
    var list = order.map(function (key) {
      var c = cats[key]; c.values = seriesKeys.map(function (sk) { return c.vals[sk] ? reduce(c.vals[sk], seriesDefs[seriesKeys.indexOf(sk)].fn) : (seriesDefs[seriesKeys.indexOf(sk)].fn === 'count' || seriesDefs[seriesKeys.indexOf(sk)].fn === 'sum' || seriesDefs[seriesKeys.indexOf(sk)].fn === 'distinct' ? 0 : null); });
      c.total = c.values.reduce(function (a, b) { return a + (b || 0); }, 0); return c;
    });
    // order
    var sort = spec.sort || (isDate || bands ? 'label' : 'desc');
    if (bands && (sort === 'label' || sort === 'natural')) sort = 'bandkey';
    if (sort === 'natural') { var numericLabels = list.every(function (c) { return !isNaN(parseFloat(c.label)); }); sort = numericLabels ? 'numlabel' : 'label'; }
    if (sort === 'bandkey') list.sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; });
    else if (sort === 'desc') list.sort(function (a, b) { return b.total - a.total; });
    else if (sort === 'asc') list.sort(function (a, b) { return a.total - b.total; });
    else if (sort === 'numlabel') list.sort(function (a, b) { return parseFloat(a.label) - parseFloat(b.label); });
    else if (sort === 'label' && (spec.time === 'weekday' || spec.labelOrder === 'weekday')) { var WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; list.sort(function (a, b) { return WD.indexOf(a.label) - WD.indexOf(b.label); }); }
    else if (sort === 'label') list.sort(function (a, b) { return a.label < b.label ? -1 : (a.label > b.label ? 1 : 0); });
    // very small groups give unreliable averages: hide them and say so
    var hiddenSmall = 0;
    var sizeOf = function (c) { var n = 0, any = false; Object.keys(c.vals).forEach(function (k2) { any = true; c.vals[k2].forEach(function (v) { if (v !== null && v !== undefined && !(typeof v === 'number' ? false : blank(v))) n++; }); }); return ys[0].col < 0 || ys[0].fn === 'count' ? c.rows.length : (useG ? Math.max.apply(null, [0].concat(Object.keys(c.vals).map(function (k2) { return c.vals[k2].filter(function (v) { return v !== null && !blank(v); }).length; }))) : (c.vals.y0 || []).filter(function (v) { return v !== null && !blank(v); }).length); };
    if (spec.minRows > 0) { var keep = list.filter(function (c) { return sizeOf(c) >= spec.minRows; }); hiddenSmall = list.length - keep.length; if (keep.length >= 2) list = keep; else hiddenSmall = 0; }
    // data prepared by the engine for a large file arrives with its own "(Others)" group: keep it last and mark it
    if (spec.preOthers) { var oi = -1; list.forEach(function (c, i) { if (c.label === '(Others)') oi = i; }); if (oi >= 0) { var og = list.splice(oi, 1)[0]; og.isOthers = true; list.push(og); } }
    // top N + others (the rest are merged by re-reducing their raw values, so averages stay right)
    var topN = spec.topN > 0 ? spec.topN : 0, others = null;
    if (topN && list.length > topN + 1) {
      var rest = list.slice(topN); list = list.slice(0, topN);
      var oc = { label: '(Others)', raw: {}, rows: [], vals: {}, rb: {}, isOthers: true, key: '(others)' };
      rest.forEach(function (c) { oc.rows = oc.rows.concat(c.rows); Object.keys(c.vals).forEach(function (k2) { oc.vals[k2] = (oc.vals[k2] || []).concat(c.vals[k2]); oc.rb[k2] = (oc.rb[k2] || []).concat(c.rb[k2]); }); });
      oc.values = seriesKeys.map(function (sk, i) { return oc.vals[sk] ? reduce(oc.vals[sk], seriesDefs[i].fn) : 0; }); oc.total = oc.values.reduce(function (a, b) { return a + (b || 0); }, 0);
      others = { count: rest.length, rows: oc.rows.length };
      if (spec.others !== false) list.push(oc);
    }
    if (spec.preOthers && list.some(function (c) { return c.isOthers; })) others = others || { count: null };
    return { cats: list, series: seriesDefs, seriesKeys: seriesKeys, rowsUsed: idx.length, blanks: blanks, others: others, split: useG, isDate: !!isDate, multi: multi, zeroSkipped: zeroSkipped, zeroName: zeroName, hiddenSmall: hiddenSmall, minRows: spec.minRows || 0, bands: bands };
  };

  // ------------------------------------------------------------ option helpers
  var DEFAULT_ENV = { hi: false, text: '#334155', sub: '#64748b', grid: 'rgba(148,163,184,.28)', palette: 'aurora', fontFamily: "'Inter','Noto Sans Devanagari','Mangal',sans-serif" };
  function envOf(e) { var o = {}; for (var k in DEFAULT_ENV) o[k] = DEFAULT_ENV[k]; for (var j in (e || {})) o[j] = e[j]; return o; }
  function colors(env) { return CH.PALETTES[env.palette] || CH.PALETTES.aurora; }
  function T(env, en, hi) { return env.hi ? hi : en; }

  function base(spec, env, extra) {
    var o = {
      color: colors(env), backgroundColor: 'transparent', animationDuration: 600, animationDurationUpdate: 350,
      textStyle: { fontFamily: env.fontFamily, color: env.text },
      title: spec.title ? { text: spec.title, subtext: spec.subtitle || '', left: 10, top: 6, textStyle: { fontSize: 14, fontWeight: 600, color: env.text, width: 250, overflow: 'truncate' }, subtextStyle: { color: env.sub, fontSize: 11 } } : undefined,
      tooltip: { confine: true, backgroundColor: 'rgba(255,255,255,.97)', borderColor: '#cbd5e1', textStyle: { color: '#1e293b', fontSize: 12 }, extraCssText: 'box-shadow:0 6px 24px rgba(15,23,42,.2);border-radius:8px' },
      legend: { type: 'scroll', bottom: 4, textStyle: { color: env.text }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 },
      toolbox: spec.toolbox === false ? undefined : { right: 8, top: 4, iconStyle: { borderColor: env.sub }, emphasis: { iconStyle: { borderColor: colors(env)[0] } }, feature: Object.assign({ saveAsImage: { title: T(env, 'Save as picture', 'चित्र सहेजें'), pixelRatio: 2, backgroundColor: '#ffffff' }, restore: { title: T(env, 'Reset', 'रीसेट') }, dataView: { title: T(env, 'Data', 'डेटा'), readOnly: true, lang: [T(env, 'Data', 'डेटा'), T(env, 'Close', 'बंद'), ''] } }, (extra && extra.feature) || {}) }
    };
    if (extra) for (var k in extra) if (k !== 'feature') o[k] = extra[k];
    return o;
  }
  function valueAxis(env, name, fmt, extra) {
    var a = { type: 'value', name: name || '', nameTextStyle: { color: env.sub }, axisLabel: { color: env.sub, formatter: fmt || function (v) { return compact(v, env.hi); } }, splitLine: { lineStyle: { color: env.grid } }, axisLine: { show: false } };
    for (var k in (extra || {})) a[k] = extra[k]; return a;
  }
  function catAxis(env, labels, extra) {
    var a = { type: 'category', data: labels, axisLabel: { color: env.sub, interval: labels.length <= 30 ? 0 : 'auto', hideOverlap: true, formatter: function (v) { return String(v).length > 16 ? String(v).slice(0, 15) + '…' : v; } }, axisLine: { lineStyle: { color: env.grid } }, axisTick: { alignWithLabel: true } };
    for (var k in (extra || {})) a[k] = extra[k]; return a;
  }
  function rot(a, n) { if (n > 5) a.axisLabel.rotate = 32; return a; }
  function zoom(n) { return n > 14 ? [{ type: 'inside', zoomOnMouseWheel: 'ctrl' }, { type: 'slider', height: 16, bottom: 30, borderColor: 'transparent', brushSelect: false }] : undefined; }
  function tipNumber(env) { return function (v) { return typeof v === 'number' ? indian(v, Math.abs(v) < 100 && v !== Math.round(v) ? 2 : 0) : v; }; }
  function yName(spec, headers, data, env) {
    if (data.series.length === 1) { var d = data.series[0]; var sh = d.shown || d.fn; if (sh === 'count') return T(env, 'Rows', 'पंक्तियाँ'); if (sh === 'pct') return d.mname || d.name; return d.col < 0 ? T(env, 'Rows', 'पंक्तियाँ') : fnLabel(sh, env.hi) + ' — ' + (d.mname || d.name); }
    return '';
  }
  function cartesianGrid(spec, env, nCats, horizontal) { return { left: 12, right: horizontal ? 30 : 18, top: spec.title ? 56 : 40, bottom: (nCats > 14 ? 74 : 44) + (spec.noLegend ? 0 : 6), containLabel: true }; }

  // ------------------------------------------------------------ builders
  function seriesFrom(data, kind, spec, extra) {
    return data.series.map(function (sd, i) {
      var o = { name: sd.name, type: kind, data: data.cats.map(function (c) { return c.values[i]; }), emphasis: { focus: 'series' }, universalTransition: true };
      if (kind === 'bar') { o.barMaxWidth = 44; o.itemStyle = { borderRadius: [4, 4, 0, 0] }; }
      if (spec.labels) o.label = { show: true, color: 'inherit', formatter: function (p) { var v = p.value; return v == null ? '' : (Math.abs(v) < 100 && v !== Math.round(v) ? String(Math.round(v * 100) / 100) : compact(v, spec._hi)); }, position: kind === 'bar' ? 'top' : 'top' };
      if (extra) for (var k in extra) o[k] = extra[k];
      return o;
    });
  }
  var BUILD = {};
  BUILD.column = function (spec, headers, data, env) {
    var labels = data.cats.map(function (c) { return c.label; }), stack = spec.stack;
    var o = base(spec, env, { feature: { magicType: { type: ['line', 'bar', 'stack'], title: { line: T(env, 'Line', 'रेखा'), bar: T(env, 'Column', 'स्तंभ'), stack: T(env, 'Stack', 'स्टैक') } }, brush: { type: ['lineX', 'clear'], title: { lineX: T(env, 'Select a range', 'दायरा चुनें'), clear: T(env, 'Clear selection', 'चयन हटाएँ') } } } });
    o.tooltip.trigger = 'axis'; o.tooltip.axisPointer = { type: 'shadow' }; o.tooltip.valueFormatter = tipNumber(env);
    o.grid = cartesianGrid(spec, env, labels.length); o.xAxis = rot(catAxis(env, labels), labels.length); o.yAxis = valueAxis(env, yName(spec, headers, data, env));
    o.series = seriesFrom(data, 'bar', spec, stack ? { stack: 'total' } : null); o.dataZoom = zoom(labels.length);
    if (data.series.length < 2) o.legend = undefined;
    if (data.series.length === 1 && !data.split) o.series[0].colorBy = 'data' === spec.colorBy ? 'data' : 'series';
    o.brush = { xAxisIndex: 0, brushStyle: { borderWidth: 1, color: 'rgba(109,91,208,.15)', borderColor: '#6d5bd0' } };
    return o;
  };
  BUILD.bar = function (spec, headers, data, env) {
    var o = BUILD.column(spec, headers, data, env), n = data.cats.length;
    o.xAxis = valueAxis(env, yName(spec, headers, data, env), null, { nameLocation: 'middle', nameGap: 30 }); o.yAxis = catAxis(env, data.cats.map(function (c) { return c.label; }), { inverse: true });
    o.series.forEach(function (sr) { sr.itemStyle = { borderRadius: [0, 4, 4, 0] }; if (sr.label) sr.label.position = 'right'; });
    o.dataZoom = n > 14 ? [{ type: 'inside', yAxisIndex: 0, zoomOnMouseWheel: 'ctrl' }, { type: 'slider', yAxisIndex: 0, width: 14, right: 4, borderColor: 'transparent', brushSelect: false }] : undefined;
    o.grid = { left: 12, right: n > 14 ? 40 : 30, top: spec.title ? 56 : 40, bottom: 58, containLabel: true };
    o.brush = { yAxisIndex: 0, brushStyle: { borderWidth: 1, color: 'rgba(109,91,208,.15)', borderColor: '#6d5bd0' } };
    o.toolbox && o.toolbox.feature && o.toolbox.feature.brush && (o.toolbox.feature.brush.type = ['lineY', 'clear']);
    return o;
  };
  BUILD.stackedColumn = function (spec, headers, data, env) { var o = BUILD.column(Object.assign({}, spec, { stack: true }), headers, data, env); o.series.forEach(function (sr) { sr.stack = 'total'; }); o.legend = { type: 'scroll', bottom: 4, textStyle: { color: env.text } }; return o; };
  BUILD.percentColumn = function (spec, headers, data, env) {
    var o = BUILD.stackedColumn(spec, headers, data, env);
    data.cats.forEach(function (c, ci) { var t = 0; c.values.forEach(function (v) { t += v || 0; }); o.series.forEach(function (sr, si) { sr.data[ci] = t ? (c.values[si] || 0) / t * 100 : 0; }); });
    o.yAxis = valueAxis(env, T(env, 'Share of each bar (%)', 'हर पट्टी में हिस्सा (%)'), function (v) { return v + '%'; }, { max: 100 });
    o.tooltip.valueFormatter = function (v) { return Math.round(v * 10) / 10 + '%'; };
    return o;
  };
  BUILD.line = function (spec, headers, data, env) {
    var o = BUILD.column(spec, headers, data, env), area = spec._area, smooth = !!spec.smooth;
    o.tooltip.axisPointer = { type: 'cross', label: { backgroundColor: '#6d5bd0' } };
    o.xAxis.boundaryGap = false; o.xAxis.axisPointer = { snap: true };
    o.series = seriesFrom(data, 'line', spec, { smooth: smooth, showSymbol: data.cats.length < 40, symbolSize: 6, lineStyle: { width: 2.5 }, areaStyle: area ? { opacity: spec._stack ? 0.7 : 0.18 } : undefined, stack: spec._stack ? 'total' : undefined });
    if (data.series.length === 1 && data.cats.length > 2) {                                  // mark the high and low
      o.series[0].markPoint = { symbolSize: 46, data: [{ type: 'max', name: T(env, 'Highest', 'सर्वाधिक') }, { type: 'min', name: T(env, 'Lowest', 'न्यूनतम') }], label: { color: '#fff', fontSize: 10, formatter: function (p) { return compact(p.value, env.hi); } } };
      o.series[0].markLine = { silent: true, symbol: 'none', data: [{ type: 'average', name: T(env, 'Average', 'औसत') }], lineStyle: { type: 'dashed', color: env.sub }, label: { position: 'insideEndTop', color: env.sub, formatter: function (p) { return T(env, 'avg ', 'औसत ') + compact(p.value, env.hi); } } };
    }
    return o;
  };
  BUILD.area = function (spec, headers, data, env) { return BUILD.line(Object.assign({}, spec, { _area: true }), headers, data, env); };
  BUILD.stackedArea = function (spec, headers, data, env) { return BUILD.line(Object.assign({}, spec, { _area: true, _stack: true }), headers, data, env); };

  BUILD.combo = function (spec, headers, data, env) {
    var o = BUILD.column(Object.assign({}, spec, { stack: false }), headers, data, env);
    if (data.series.length < 2) return o;
    o.series[0].yAxisIndex = 0; o.series[0].type = 'bar';
    for (var i = 1; i < o.series.length; i++) { o.series[i].type = 'line'; o.series[i].yAxisIndex = 1; o.series[i].smooth = true; o.series[i].symbolSize = 7; o.series[i].itemStyle = undefined; delete o.series[i].barMaxWidth; }
    o.yAxis = [valueAxis(env, data.series[0].name), valueAxis(env, data.series.slice(1).map(function (x) { return x.name; }).join(', '), null, { splitLine: { show: false } })];
    o.legend = { type: 'scroll', bottom: 4, textStyle: { color: env.text } };
    return o;
  };
  BUILD.pareto = function (spec, headers, data, env) {
    var d = Object.assign({}, data, { cats: data.cats.filter(function (c) { return !c.isOthers; }).sort(function (a, b) { return b.total - a.total; }) });
    var total = d.cats.reduce(function (a, c) { return a + c.total; }, 0), cum = 0, cumulative = d.cats.map(function (c) { cum += c.total; return total ? Math.round(cum / total * 1000) / 10 : 0; });
    var o = BUILD.column(Object.assign({}, spec, { stack: false }), headers, Object.assign({}, d, { series: [d.series[0]] }), env);
    o.series[0].data = d.cats.map(function (c) { return c.total; });
    o.series.push({ name: T(env, 'Cumulative %', 'संचयी %'), type: 'line', yAxisIndex: 1, data: cumulative, smooth: true, symbolSize: 6, itemStyle: { color: '#d6456b' }, lineStyle: { width: 2.5 },
      markLine: { silent: true, symbol: 'none', data: [{ yAxis: 80 }], lineStyle: { type: 'dashed', color: '#d6456b' }, label: { formatter: '80%', color: '#d6456b' } } });
    o.yAxis = [valueAxis(env, yName(spec, headers, d, env)), valueAxis(env, '%', function (v) { return v + '%'; }, { max: 100, splitLine: { show: false } })];
    o.xAxis.data = d.cats.map(function (c) { return c.label; }); o.legend = { type: 'scroll', bottom: 4, textStyle: { color: env.text } };
    o._pareto = { cumulative: cumulative }; o._cats = d.cats;
    return o;
  };
  BUILD.waterfall = function (spec, headers, data, env) {
    var cats = data.cats.filter(function (c) { return !c.isOthers; }), labels = cats.map(function (c) { return c.label; }).concat([T(env, 'Total', 'कुल')]);
    var base0 = [], ups = [], downs = [], run = 0, totalLine = [];
    cats.forEach(function (c) { var v = c.values[0] || 0; if (v >= 0) { base0.push(run); ups.push(v); downs.push(0); run += v; } else { base0.push(run + v); ups.push(0); downs.push(-v); run += v; } });
    base0.push(0); ups.push(0); downs.push(0); totalLine = labels.map(function (_, i) { return i === labels.length - 1 ? run : '-'; });
    var o = BUILD.column(Object.assign({}, spec, { stack: true }), headers, Object.assign({}, data, { cats: cats }), env);
    o.xAxis.data = labels; o.legend = undefined;
    o.tooltip.formatter = function (ps) { var p = ps.filter(function (x) { return x.seriesName !== ' '; })[0]; return p ? p.axisValue + '<br/>' + p.marker + indian(p.value) : ''; };
    o.series = [{ name: ' ', type: 'bar', stack: 'wf', itemStyle: { color: 'transparent' }, emphasis: { disabled: true }, data: base0 },
      { name: T(env, 'Increase', 'वृद्धि'), type: 'bar', stack: 'wf', itemStyle: { color: '#14a38b', borderRadius: 3 }, data: ups, barMaxWidth: 44 },
      { name: T(env, 'Decrease', 'कमी'), type: 'bar', stack: 'wf', itemStyle: { color: '#d6456b', borderRadius: 3 }, data: downs, barMaxWidth: 44 },
      { name: T(env, 'Total', 'कुल'), type: 'bar', stack: 'wf', itemStyle: { color: '#6d5bd0', borderRadius: 3 }, data: totalLine.map(function (v) { return v === '-' ? 0 : v; }), barMaxWidth: 44 }];
    o._waterfall = { total: run }; o._cats = cats;
    return o;
  };

  function pieLike(spec, headers, data, env, radius, rose) {
    var o = base(spec, env), total = data.cats.reduce(function (a, c) { return a + Math.max(c.values[0] || 0, 0); }, 0);
    o.tooltip.trigger = 'item'; o.tooltip.formatter = function (p) { return p.marker + ' ' + p.name + '<br/><b>' + indian(p.value) + '</b> (' + pctText(p.percent) + ')'; };
    o.series = [{ type: 'pie', radius: radius, center: ['50%', '50%'], roseType: rose ? 'radius' : undefined, avoidLabelOverlap: true, itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
      label: { color: env.text, formatter: function (p) { return (p.name.length > 14 ? p.name.slice(0, 13) + '…' : p.name) + '\n' + pctText(p.percent); } },
      labelLine: { lineStyle: { color: env.grid } }, emphasis: { scale: true, scaleSize: 8, itemStyle: { shadowBlur: 18, shadowColor: 'rgba(0,0,0,.25)' } },
      data: data.cats.map(function (c, i) { return { name: c.label, value: Math.max(c.values[0] || 0, 0), _cat: i }; }) }];
    if (radius[0] !== '0%') o.graphic = [{ type: 'text', left: 'center', top: 'center', style: { text: (total < 1e5 ? indian(total) : compact(total, env.hi)) + '\n' + T(env, 'total', 'कुल'), fill: env.text, fontSize: 16, fontWeight: 600, textAlign: 'center', lineHeight: 20 } }];
    o.legend = { type: 'scroll', bottom: 4, textStyle: { color: env.text } };
    return o;
  }
  BUILD.pie = function (spec, h, d, e) { return pieLike(spec, h, d, e, ['0%', '58%'], false); };
  BUILD.donut = function (spec, h, d, e) { return pieLike(spec, h, d, e, ['38%', '58%'], false); };
  BUILD.rose = function (spec, h, d, e) { return pieLike(spec, h, d, e, ['12%', '58%'], true); };
  BUILD.funnel = function (spec, headers, data, env) {
    var o = base(spec, env), cats = data.cats.slice().sort(function (a, b) { return (b.values[0] || 0) - (a.values[0] || 0); });
    o.tooltip.trigger = 'item'; o.tooltip.formatter = function (p) { return p.marker + ' ' + p.name + '<br/><b>' + indian(p.value) + '</b>'; };
    o.series = [{ type: 'funnel', left: '10%', right: '10%', top: spec.title ? 56 : 30, bottom: 36, sort: 'descending', gap: 3, label: { color: env.text, formatter: function (p) { return p.name + '  ' + compact(p.value, env.hi); } },
      itemStyle: { borderColor: '#fff', borderWidth: 1 }, data: cats.map(function (c, i) { return { name: c.label, value: Math.max(c.values[0] || 0, 0), _cat: data.cats.indexOf(c) }; }) }];
    o.legend = undefined; return o;
  };

  function hierarchy(data, spec, env) {
    return data.cats.filter(function (c) { return !c.isOthers; }).map(function (c, i) {
      var node = { name: c.label, value: Math.max(c.total, 0), _cat: i };
      if (data.split) node.children = data.series.map(function (sd, si) { return { name: sd.name, value: Math.max(c.values[si] || 0, 0), _cat: i, _ser: si }; }).filter(function (x) { return x.value > 0; });
      return node;
    });
  }
  BUILD.treemap = function (spec, headers, data, env) {
    var o = base(spec, env, { feature: {} }); o.legend = undefined; o.tooltip.trigger = 'item'; o.tooltip.formatter = function (p) { return p.marker + ' ' + p.name + '<br/><b>' + indian(p.value) + '</b>'; };
    o.series = [{ type: 'treemap', top: spec.title ? 50 : 20, bottom: 24, left: 12, right: 12, roam: false, nodeClick: 'zoomToNode', breadcrumb: { show: true, bottom: 0, itemStyle: { color: '#6d5bd0' } },
      label: { show: true, formatter: function (p) { return p.name + '\n' + compact(p.value, env.hi); }, color: '#fff', fontSize: 12 }, upperLabel: { show: data.split, height: 22, color: '#fff' },
      itemStyle: { borderColor: '#fff', borderWidth: 2, gapWidth: 2, borderRadius: 4 }, levels: [{ itemStyle: { borderWidth: 0, gapWidth: 4 } }, { colorSaturation: [0.35, 0.6], itemStyle: { gapWidth: 2 } }], data: hierarchy(data, spec, env) }];
    return o;
  };
  BUILD.sunburst = function (spec, headers, data, env) {
    var o = base(spec, env, { feature: {} }); o.legend = undefined; o.tooltip.trigger = 'item'; o.tooltip.formatter = function (p) { return p.marker + ' ' + p.name + '<br/><b>' + indian(p.value) + '</b>'; };
    o.series = [{ type: 'sunburst', radius: [0, '86%'], center: ['50%', spec.title ? '55%' : '50%'], sort: 'desc', data: hierarchy(data, spec, env), label: { rotate: 'radial', color: '#fff', minAngle: 8 }, itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 }, emphasis: { focus: 'ancestor' }, levels: [{}, { r0: '12%', r: '52%' }, { r0: '54%', r: '86%', label: { align: 'right' } }] }];
    return o;
  };

  // scatter / bubble use the original rows, not aggregated categories
  function pointsFor(spec, headers, rows, idx, meta) {
    var pts = [], sx = spec.xnum, sy = spec.ynum, sz = spec.size >= 0 ? spec.size : -1, g = spec.g >= 0 ? spec.g : -1;
    for (var k = 0; k < idx.length; k++) {
      var r = rows[idx[k]], x = num(r[sx]), y = num(r[sy]); if (x === null || y === null) continue;
      if (spec.noZero && (x === 0 || y === 0)) { if (meta) meta.zs++; continue; }
      var p = { value: [x, y], ri: idx[k] };
      if (sz >= 0) { var z = num(r[sz]); if (z === null) continue; p.value.push(z); }
      p.g = g >= 0 ? (blank(r[g]) ? '(blank)' : s(r[g]).trim()) : null; pts.push(p);
    }
    return pts;
  }
  function regression(pts) {
    var n = pts.length; if (n < 3) return null;
    var sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
    pts.forEach(function (p) { var x = p.value[0], y = p.value[1]; sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y; });
    var den = n * sxx - sx * sx; if (den === 0) return null;
    var slope = (n * sxy - sx * sy) / den, icpt = (sy - slope * sx) / n;
    var rden = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy)), r = rden ? (n * sxy - sx * sy) / rden : 0;
    return { slope: slope, intercept: icpt, r: r, n: n };
  }
  CH.regression = regression;
  BUILD.scatter = function (spec, headers, data, env, ctx) {
    var pts = ctx.points, o = base(spec, env, { feature: { brush: { type: ['rect', 'polygon', 'clear'], title: { rect: T(env, 'Select an area', 'क्षेत्र चुनें'), polygon: T(env, 'Free select', 'मुक्त चयन'), clear: T(env, 'Clear selection', 'चयन हटाएँ') } } } });
    var groups = {}, order = []; pts.forEach(function (p) { var k = p.g == null ? '' : p.g; if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(p); });
    var bubble = spec.size >= 0, zs = bubble ? pts.map(function (p) { return p.value[2]; }) : [], zmax = bubble ? Math.max.apply(null, zs) : 1, zmin = bubble ? Math.min.apply(null, zs) : 0;
    o.tooltip.trigger = 'item'; o.tooltip.formatter = function (p) { var v = p.value; return p.marker + (p.seriesName ? p.seriesName + '<br/>' : '') + s(headers[spec.xnum]) + ': <b>' + indian(v[0]) + '</b><br/>' + s(headers[spec.ynum]) + ': <b>' + indian(v[1]) + '</b>' + (bubble ? '<br/>' + s(headers[spec.size]) + ': <b>' + indian(v[2]) + '</b>' : '') + '<br/><span style="color:#94a3b8">' + T(env, 'row ', 'पंक्ति ') + (p.data.ri + 1) + '</span>'; };
    o.grid = { left: 12, right: 24, top: spec.title ? 56 : 40, bottom: 56, containLabel: true };
    o.xAxis = valueAxis(env, s(headers[spec.xnum]), null, { scale: true, splitLine: { lineStyle: { color: env.grid } } }); o.yAxis = valueAxis(env, s(headers[spec.ynum]), null, { scale: true });
    o.series = order.map(function (k) { return { name: k, type: 'scatter', data: groups[k], symbolSize: bubble ? function (v) { return 8 + (zmax === zmin ? 14 : (v[2] - zmin) / (zmax - zmin) * 42); } : 9, itemStyle: { opacity: bubble ? 0.62 : 0.78 }, emphasis: { focus: 'series', itemStyle: { opacity: 1, borderColor: '#fff', borderWidth: 1.5 } }, large: pts.length > 5000, largeThreshold: 5000 }; });
    var reg = spec.trend && !bubble ? (ctx.reg || regression(pts)) : null;
    if (reg) {
      var xs = pts.map(function (p) { return p.value[0]; }), mn = reg.xmin !== undefined ? reg.xmin : Math.min.apply(null, xs), mx = reg.xmax !== undefined ? reg.xmax : Math.max.apply(null, xs);
      o.series.push({ name: T(env, 'Trend line', 'प्रवृत्ति रेखा'), type: 'line', showSymbol: false, silent: true, lineStyle: { type: 'dashed', width: 2, color: '#d6456b' }, data: [[mn, reg.slope * mn + reg.intercept], [mx, reg.slope * mx + reg.intercept]], tooltip: { show: false } });
    }
    o.legend = order.length > 1 || reg ? { type: 'scroll', bottom: 4, textStyle: { color: env.text } } : undefined;
    o.dataZoom = [{ type: 'inside', xAxisIndex: 0, filterMode: 'none' }, { type: 'inside', yAxisIndex: 0, filterMode: 'none' }];
    o.brush = { xAxisIndex: 0, yAxisIndex: 0, brushStyle: { borderWidth: 1, color: 'rgba(109,91,208,.15)', borderColor: '#6d5bd0' }, throttleType: 'debounce', throttleDelay: 150 };
    o._reg = reg; return o;
  };
  BUILD.bubble = function (spec, headers, data, env, ctx) { return BUILD.scatter(spec, headers, data, env, ctx); };

  BUILD.heatmap = function (spec, headers, data, env, ctx) {
    var m = ctx.matrix, o = base(spec, env, { feature: {} }); o.legend = undefined;
    o.tooltip.trigger = 'item'; o.tooltip.formatter = function (p) { return s(m.xs[p.value[0]]) + ' × ' + s(m.ys[p.value[1]]) + '<br/><b>' + indian(p.value[2]) + '</b>'; };
    o.grid = { left: 12, right: 20, top: spec.title ? 56 : 30, bottom: 70, containLabel: true };
    o.xAxis = rot(catAxis(env, m.xs, { splitArea: { show: true } }), m.xs.length); o.yAxis = catAxis(env, m.ys, { inverse: true, splitArea: { show: true } });
    o.visualMap = { min: m.min, max: m.max || 1, calculable: true, orient: 'horizontal', left: 'center', bottom: 6, textStyle: { color: env.sub }, inRange: { color: ['#eef2ff', '#a99cf0', '#6d5bd0', '#2f2a6b'] } };
    o.series = [{ type: 'heatmap', data: m.cells, label: { show: m.xs.length * m.ys.length <= 120, color: '#111', formatter: function (p) { return compact(p.value[2], env.hi); } }, emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,.35)' } }, itemStyle: { borderColor: '#fff', borderWidth: 1 } }];
    return o;
  };
  BUILD.sankey = function (spec, headers, data, env, ctx) {
    var sk = ctx.sankey, o = base(spec, env, { feature: {} }); o.legend = undefined;
    var lab = function (n) { var t = n.label; return t.length > 22 ? t.slice(0, 21) + '…' : t; };
    o.tooltip.trigger = 'item';
    o.tooltip.formatter = function (p) {
      if (p.dataType === 'edge') { var L = sk.links[p.data._li], a = sk.nodes[L.s], b = sk.nodes[L.t]; return a.label + ' → ' + b.label + '<br/><b>' + indian(L.value) + '</b> (' + pctText(sk.total ? L.value / sk.total * 100 : 0) + T(env, ' of all', ' कुल का') + ')'; }
      var N = sk.nodes[p.data._ni]; return N.label + '<br/><b>' + indian(N.value) + '</b> (' + pctText(sk.total ? N.value / sk.total * 100 : 0) + ')<br/><span style="color:#94a3b8">' + headers[sk.levels[N.level]] + '</span>';
    };
    o.series = [{ type: 'sankey', left: 14, right: 120, top: spec.title ? 56 : 28, bottom: 24, nodeWidth: 16, nodeGap: 10, draggable: true, layoutIterations: 24,
      emphasis: { focus: 'adjacency' }, lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.38 }, itemStyle: { borderWidth: 0, borderRadius: 3 },
      label: { color: env.text, fontSize: 12, formatter: function (p) { return lab(p.data); } },
      data: sk.nodes.map(function (n, i) { return { name: n.name, label: n.label, _ni: i, depth: n.level }; }),
      links: sk.links.map(function (L, i) { return { source: sk.nodes[L.s].name, target: sk.nodes[L.t].name, value: L.value, _li: i }; }) }];
    return o;
  };
  BUILD.radar = function (spec, headers, data, env, ctx) {
    var o = base(spec, env, { feature: {} }), ind = ctx.indicators, cats = data.cats.slice(0, 6);
    o.tooltip.trigger = 'item';
    o.radar = { indicator: ind.map(function (i) { return { name: i.name, max: i.max }; }), radius: '62%', center: ['50%', spec.title ? '55%' : '52%'], axisName: { color: env.text }, splitLine: { lineStyle: { color: env.grid } }, splitArea: { areaStyle: { color: ['transparent'] } } };
    o.series = [{ type: 'radar', symbolSize: 5, areaStyle: { opacity: 0.16 }, lineStyle: { width: 2 }, emphasis: { areaStyle: { opacity: 0.35 } }, data: cats.map(function (c, i) { return { name: c.label, value: ctx.matrix[data.cats.indexOf(c)], _cat: data.cats.indexOf(c) }; }) }];
    o.legend = { type: 'scroll', bottom: 4, textStyle: { color: env.text } }; return o;
  };
  BUILD.histogram = function (spec, headers, data, env, ctx) {
    var h = ctx.hist, o = base(spec, env, { feature: { brush: { type: ['lineX', 'clear'], title: { lineX: T(env, 'Select a range', 'दायरा चुनें'), clear: T(env, 'Clear selection', 'चयन हटाएँ') } } } });
    o.tooltip.trigger = 'axis'; o.tooltip.axisPointer = { type: 'shadow' }; o.tooltip.formatter = function (ps) { var i = ps[0].dataIndex; return indian(h.edges[i]) + ' – ' + indian(h.edges[i + 1]) + '<br/><b>' + ps[0].value + '</b> ' + T(env, 'rows', 'पंक्तियाँ'); };
    o.grid = cartesianGrid(spec, env, h.counts.length); o.legend = undefined;
    o.xAxis = catAxis(env, h.counts.map(function (_, i) { return compact((h.edges[i] + h.edges[i + 1]) / 2, env.hi); }), { name: s(headers[spec.xnum]), nameLocation: 'middle', nameGap: 30, nameTextStyle: { color: env.sub } }); o.yAxis = valueAxis(env, T(env, 'Rows', 'पंक्तियाँ'));
    o.series = [{ type: 'bar', data: h.counts, barCategoryGap: '4%', itemStyle: { borderRadius: [3, 3, 0, 0] }, markLine: { silent: true, symbol: 'none', lineStyle: { type: 'dashed', color: '#d6456b' }, label: { color: '#d6456b', formatter: function (p) { return p.name + ' ' + compact(p.value, env.hi); } }, data: [{ name: T(env, 'mean', 'औसत'), xAxis: h.meanBin }, { name: T(env, 'median', 'माध्यिका'), xAxis: h.medianBin }].filter(function (d) { return d.xAxis != null; }).map(function (d, k) { var isMean = d.name === T(env, 'mean', 'औसत'); return { name: d.name, xAxis: d.xAxis, value: isMean ? h.mean : h.median, label: { position: 'end', offset: [0, k * 16], color: isMean ? '#d6456b' : '#6d5bd0', formatter: function () { var v = isMean ? h.mean : h.median; return d.name + ' ' + (Math.abs(v) < 100 && v !== Math.round(v) ? String(Math.round(v * 100) / 100) : compact(v, env.hi)); } }, lineStyle: { type: 'dashed', color: isMean ? '#d6456b' : '#6d5bd0' } }; }) } }];
    o.brush = { xAxisIndex: 0, brushStyle: { borderWidth: 1, color: 'rgba(109,91,208,.15)', borderColor: '#6d5bd0' } };
    return o;
  };
  BUILD.boxplot = function (spec, headers, data, env, ctx) {
    var bx = ctx.box, o = base(spec, env, { feature: {} }); o.legend = undefined;
    o.tooltip.trigger = 'item'; o.tooltip.formatter = function (p) { if (p.seriesType === 'boxplot') { var v = bx.stats[p.dataIndex]; return p.name + '<br/>' + T(env, 'max', 'अधिकतम') + ': <b>' + indian(v[4]) + '</b><br/>Q3: <b>' + indian(v[3]) + '</b><br/>' + T(env, 'median', 'माध्यिका') + ': <b>' + indian(v[2]) + '</b><br/>Q1: <b>' + indian(v[1]) + '</b><br/>' + T(env, 'min', 'न्यूनतम') + ': <b>' + indian(v[0]) + '</b>'; } return p.marker + indian(p.value[1]); };
    o.grid = cartesianGrid(spec, env, bx.labels.length); o.xAxis = rot(catAxis(env, bx.labels), bx.labels.length); o.yAxis = valueAxis(env, s(headers[spec.ys[0].col]));
    o.series = [{ type: 'boxplot', data: bx.stats, itemStyle: { color: 'rgba(109,91,208,.2)', borderColor: '#6d5bd0', borderWidth: 1.6 }, emphasis: { itemStyle: { borderWidth: 2.4 } } }, { type: 'scatter', data: bx.outliers, symbolSize: 6, itemStyle: { color: '#d6456b', opacity: 0.8 } }];
    o.dataZoom = zoom(bx.labels.length); return o;
  };
  BUILD.calendar = function (spec, headers, data, env, ctx) {
    var cal = ctx.cal, o = base(spec, env, { feature: {} }); o.legend = undefined;
    o.tooltip.trigger = 'item'; o.tooltip.formatter = function (p) { return p.value[0] + '<br/><b>' + indian(p.value[1]) + '</b>'; };
    o.visualMap = { min: 0, max: cal.max || 1, calculable: true, orient: 'horizontal', left: 'center', bottom: 4, textStyle: { color: env.sub }, inRange: { color: ['#eef2ff', '#a99cf0', '#6d5bd0', '#2f2a6b'] } };
    o.calendar = cal.ranges.map(function (r, i) { return { top: (spec.title ? 64 : 40) + i * 150, left: 52, right: 24, cellSize: ['auto', 16], range: r, itemStyle: { borderWidth: 2, borderColor: '#fff' }, splitLine: { lineStyle: { color: env.grid } }, yearLabel: { color: env.sub }, dayLabel: { color: env.sub, firstDay: 1 }, monthLabel: { color: env.sub } }; });
    o.series = cal.ranges.map(function (r, i) { return { type: 'heatmap', coordinateSystem: 'calendar', calendarIndex: i, data: cal.data.filter(function (d) { return d[0] >= r[0] && d[0] <= r[1]; }) }; });
    return o;
  };
  BUILD.gauge = function (spec, headers, data, env, ctx) {
    var k = ctx.kpi, o = base(spec, env, { feature: {} }); o.legend = undefined; o.tooltip.formatter = '{b}: {c}';
    o.series = [{ type: 'gauge', min: 0, max: k.max, radius: '84%', center: ['50%', '62%'], progress: { show: true, width: 18, itemStyle: { color: '#6d5bd0' } }, axisLine: { lineStyle: { width: 18, color: [[1, 'rgba(148,163,184,.25)']] } }, axisTick: { show: false }, splitLine: { length: 10, lineStyle: { color: env.sub } }, axisLabel: { color: env.sub, distance: 26, formatter: function (v) { return compact(v, env.hi); } },
      pointer: { width: 5, length: '58%' }, detail: { valueAnimation: true, formatter: function (v) { return compact(v, env.hi); }, fontSize: 30, fontWeight: 700, color: env.text, offsetCenter: [0, '58%'] }, title: { offsetCenter: [0, '84%'], color: env.sub, fontSize: 13 }, data: [{ value: k.value, name: k.label }] }];
    return o;
  };

  // ------------------------------------------------------------ build()
  var SCATTER = { scatter: 1, bubble: 1 };
  function niceMax(v) { if (v <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }

  // the look shared by every chart in Stellura (used by the radars and the large-file group tab too)
  CH.kit = { base: base, valueAxis: valueAxis, catAxis: catAxis, colors: colors, envOf: envOf, T: T, zoom: zoom };

  // data and side tables a chart type needs (prepared once; the builders only draw)
  CH.compute = function (type, spec, headers, rows, idx, env0) {
    var env = envOf(env0), ctx = {}, data; spec = Object.assign({}, spec); spec._hi = env.hi;
    if (SCATTER[type]) {
      if (spec.xnum === undefined || spec.ynum === undefined) throw new Error('Choose two number columns');
      var pm = { zs: 0 }; ctx.points = pointsFor(spec, headers, rows, idx, pm); data = { cats: [], series: [], rowsUsed: idx.length, zeroSkipped: pm.zs, zeroName: s(headers[spec.xnum]) + ' / ' + s(headers[spec.ynum]) };
    } else if (type === 'histogram') {
      var vals = [], zs = 0; idx.forEach(function (i) { var x = num(rows[i][spec.xnum]); if (x !== null) { if (spec.noZero && x === 0) zs++; else vals.push(x); } });
      ctx.hist = histogram(vals, spec.bins); data = { cats: [], series: [], rowsUsed: idx.length, zeroSkipped: zs, zeroName: s(headers[spec.xnum]) };
    } else if (type === 'heatmap') {
      ctx.matrix = matrix2(spec, headers, rows, idx); data = { cats: [], series: [], rowsUsed: idx.length };
    } else if (type === 'sankey') {
      ctx.sankey = sankeyData(spec, headers, rows, idx); data = { cats: [], series: [], rowsUsed: idx.length };
    } else if (type === 'boxplot') {
      ctx.box = boxData(spec, headers, rows, idx); data = { cats: [], series: [], rowsUsed: idx.length };
    } else if (type === 'calendar') {
      ctx.cal = calData(spec, headers, rows, idx); data = { cats: [], series: [], rowsUsed: idx.length };
    } else if (type === 'gauge') {
      var col = (spec.ys && spec.ys[0] && spec.ys[0].col >= 0) ? spec.ys[0] : { col: -1, fn: 'count' }, vv = idx.map(function (i) { return col.col < 0 ? 1 : rows[i][col.col]; }), val = reduce(spec.noZero && col.fn !== 'count' && col.fn !== 'distinct' ? vv.map(function (q) { return num(q) === 0 ? null : q; }) : vv, col.fn || 'sum');
      var mx = idx.length ? niceMax((val || 0) * 1.25) : 1; ctx.kpi = { value: Math.round((val || 0) * 100) / 100, max: mx, label: (col.name ? (col.as === 'count' ? T(env, 'Rows', 'पंक्तियाँ') : fnLabel(col.as || col.fn || 'sum', env.hi) + ' — ' + col.name) : col.col < 0 ? T(env, 'Rows', 'पंक्तियाँ') : fnLabel(col.fn || 'sum', env.hi) + ' — ' + headers[col.col]) }; data = { cats: [], series: [], rowsUsed: idx.length };
    } else {
      var sp = Object.assign({}, spec);
      if (type === 'combo' && (!sp.ys || sp.ys.length < 2)) { /* needs two measures: falls back to a plain column chart */ }
      if (['line', 'area', 'stackedArea'].indexOf(type) >= 0 && sp.sort === undefined) sp.sort = sp.time && sp.time !== 'none' ? 'label' : 'natural';
      if (type === 'radar') { sp.g = -1; }
      if (type === 'sunburst' || type === 'stackedColumn' || type === 'percentColumn' || type === 'stackedArea') { /* uses the split */ }
      data = CH.prepare(sp, headers, rows, idx);
      if (type === 'radar') { var r = radarData(sp, headers, data); ctx.indicators = r.indicators; ctx.matrix = r.matrix; }
    }
    return { data: data, ctx: ctx };
  };
  CH.build = function (type, spec, headers, rows, idx, env0) {
    var c = CH.compute(type, spec, headers, rows, idx, env0);
    return CH.finish(type, spec, headers, c.data, c.ctx, env0);
  };
  // draws a chart from data that is already prepared: the in-memory path above, or answers the engine computed for a large file
  CH.finish = function (type, spec, headers, data, ctx, env0) {
    var env = envOf(env0); spec = Object.assign({}, spec); spec._hi = env.hi;
    if (!BUILD[type]) throw new Error('Unknown chart type: ' + type);
    var o = BUILD[type](spec, headers, data, env, ctx);
    var cap = caption(type, spec, headers, data, ctx, env);
    if (data.zeroSkipped) cap.push(env.hi ? indian(data.zeroSkipped) + ' पंक्तियों में “' + data.zeroName + '” में 0 है और उन्हें गणना से बाहर रखा गया (0 का अर्थ प्रायः “कोई मान नहीं / अंकित नहीं” होता है)।' : indian(data.zeroSkipped) + ' rows have 0 in “' + data.zeroName + '” and are left out of this calculation (0 usually means “no value / not rated”).');
    if (data.hiddenSmall) cap.push(env.hi ? indian(data.hiddenSmall) + ' समूह छिपाए गए क्योंकि उनमें ' + data.minRows + ' से कम पंक्तियाँ हैं (इतने कम पर औसत भरोसेमंद नहीं)।' : indian(data.hiddenSmall) + ' groups with fewer than ' + data.minRows + ' rows are hidden — an average of so few rows is not reliable.');
    if (data.multi) cap.push(env.hi ? 'हर पंक्ति अपनी सूची की हर वस्तु के अंतर्गत गिनी गई है, इसलिए पट्टियों का योग पंक्तियों की संख्या से अधिक हो सकता है।' : 'Each row is counted under every item in its list, so the bars can add up to more than the number of rows.');
    return { option: o, data: data, ctx: ctx, caption: cap };
  };
  CH.num = num; CH.reduce = reduce;
  // a histogram described by the engine (edges, counts, mean, median ...) in the shape the builder expects
  CH.histFrom = function (h) {
    var out = { counts: h.counts || [], edges: h.edges || [], mean: h.mean, median: h.median, meanBin: null, medianBin: null, n: h.n, min: h.min, max: h.max, sd: h.sd };
    if (!out.n) return out;
    var binOf = function (v) { for (var j = 0; j < out.counts.length; j++) if (v <= out.edges[j + 1] || j === out.counts.length - 1) return j; return 0; };
    out.meanBin = binOf(out.mean); out.medianBin = binOf(out.median); return out;
  };

  // ---- derived data for the special charts
  function histogram(vals, bins) {
    var n = vals.length, out = { counts: [], edges: [], mean: null, median: null, meanBin: null, medianBin: null, n: n };
    if (!n) return out;
    var sorted = vals.slice().sort(function (a, b) { return a - b; }), mn = sorted[0], mx = sorted[n - 1];
    var k = bins > 1 ? bins : Math.max(5, Math.min(40, Math.ceil(Math.log2(n) + 1)));
    if (mn === mx) { out.edges = [mn - 0.5, mx + 0.5]; out.counts = [n]; }
    else { var w = (mx - mn) / k; for (var i = 0; i <= k; i++) out.edges.push(mn + w * i); out.counts = new Array(k).fill(0); vals.forEach(function (v) { var b = Math.min(k - 1, Math.floor((v - mn) / w)); out.counts[b]++; }); }
    out.mean = vals.reduce(function (a, b) { return a + b; }, 0) / n; out.median = quantile(sorted, 0.5);
    var binOf = function (v) { for (var j = 0; j < out.counts.length; j++) if (v <= out.edges[j + 1] || j === out.counts.length - 1) return j; return 0; };
    out.meanBin = binOf(out.mean); out.medianBin = binOf(out.median);
    out.min = mn; out.max = mx; out.sd = Math.sqrt(vals.reduce(function (a, v) { return a + (v - out.mean) * (v - out.mean); }, 0) / n);
    return out;
  }
  CH.histogram = histogram;
  function matrix2(spec, headers, rows, idx) {
    var xs = [], ys = [], xi = {}, yi = {}, cell = {}, fn = spec.fn || (spec.ys && spec.ys[0] && spec.ys[0].col >= 0 ? (spec.ys[0].fn || 'sum') : 'count'), mc = spec.ys && spec.ys[0] ? spec.ys[0].col : -1;
    idx.forEach(function (i) {
      var a = s(rows[i][spec.x]).trim(), b = s(rows[i][spec.g]).trim(); if (!a || !b) return;
      if (xi[a] === undefined) { xi[a] = xs.length; xs.push(a); } if (yi[b] === undefined) { yi[b] = ys.length; ys.push(b); }
      var k = xi[a] + '|' + yi[b]; (cell[k] = cell[k] || []).push(mc < 0 ? 1 : rows[i][mc]);
    });
    var tot = function (arr, f) { return arr.reduce(function (acc, key) { return acc; }, 0); };
    // order by size so the busiest rows/columns are first
    var xsum = xs.map(function () { return 0; }), ysum = ys.map(function () { return 0; });
    var cells = [], mn = Infinity, mx = -Infinity;
    Object.keys(cell).forEach(function (k) { var p = k.split('|'), v = reduce(cell[k], mc < 0 ? 'count' : fn); if (v === null) return; xsum[+p[0]] += Math.abs(v); ysum[+p[1]] += Math.abs(v); });
    var xo = xs.map(function (_, i) { return i; }).sort(function (a, b) { return xsum[b] - xsum[a]; }).slice(0, 25), yo = ys.map(function (_, i) { return i; }).sort(function (a, b) { return ysum[b] - ysum[a]; }).slice(0, 25);
    var xpos = {}, ypos = {}; xo.forEach(function (o, p) { xpos[o] = p; }); yo.forEach(function (o, p) { ypos[o] = p; });
    Object.keys(cell).forEach(function (k) { var p = k.split('|'); if (xpos[p[0]] === undefined || ypos[p[1]] === undefined) return; var v = reduce(cell[k], mc < 0 ? 'count' : fn); if (v === null) return; cells.push([xpos[p[0]], ypos[p[1]], v]); if (v < mn) mn = v; if (v > mx) mx = v; });
    return { xs: xo.map(function (o) { return xs[o]; }), ys: yo.map(function (o) { return ys[o]; }), cells: cells, min: isFinite(mn) ? Math.min(0, mn) : 0, max: isFinite(mx) ? mx : 1 };
  }
  // Flow between two or three category columns (A -> B -> C). Flows must be additive, so the measure is a total
  // (or a row count); negative or blank values cannot flow and are counted as left out.
  function sankeyData(spec, headers, rows, idx) {
    var levels = [spec.x, spec.g, spec.g2].filter(function (c) { return c !== undefined && c !== null && c >= 0; });
    if (levels.length < 2 || levels[0] === levels[1]) throw new Error('Choose two different category columns');
    var mc = spec.ys && spec.ys[0] ? spec.ys[0].col : -1, useVal = mc >= 0, topN = spec.topN > 0 ? spec.topN : 10, paths = [], tot = levels.map(function () { return {}; }), skipped = 0;
    idx.forEach(function (i) {
      var row = rows[i], p = [], v = 1, bad = false;
      for (var l = 0; l < levels.length; l++) { var t = s(row[levels[l]]).trim(); if (!t) { bad = true; break; } p.push(t); }
      if (!bad && useVal) { v = num(row[mc]); if (v === null || v < 0) bad = true; }
      if (bad) { skipped++; return; }
      paths.push({ p: p, v: v, i: i }); p.forEach(function (t, l2) { tot[l2][t] = (tot[l2][t] || 0) + v; });
    });
    var keep = tot.map(function (m) { var ks = Object.keys(m).sort(function (a, b) { return m[b] - m[a] || (a < b ? -1 : 1); }); var o = {}; ks.slice(0, topN).forEach(function (k) { o[k] = 1; }); o.__more = ks.length > topN; return o; });
    var nodes = [], nmap = {}, links = [], lmap = {}, others = false;
    function node(l, label) { var key = l + '|' + label, n = nmap[key]; if (!n) { n = nmap[key] = { name: key, label: label, level: l, value: 0, rows: [], isOthers: label === '(Others)' }; nodes.push(n); } return n; }
    paths.forEach(function (pt) {
      var seq = pt.p.map(function (t, l) { var lb = keep[l][t] ? t : '(Others)'; if (lb === '(Others)') others = true; return node(l, lb); });
      seq.forEach(function (n) { n.value += pt.v; n.rows.push(pt.i); });
      for (var l = 0; l < seq.length - 1; l++) {
        var k = seq[l].name + '>' + seq[l + 1].name, L = lmap[k];
        if (!L) { L = lmap[k] = { s: nodes.indexOf(seq[l]), t: nodes.indexOf(seq[l + 1]), value: 0, rows: [] }; links.push(L); }
        L.value += pt.v; L.rows.push(pt.i);
      }
    });
    var total = nodes.filter(function (n) { return n.level === 0; }).reduce(function (a, n) { return a + n.value; }, 0);
    return { nodes: nodes, links: links, total: total, levels: levels, skipped: skipped, others: others, measure: useVal ? s(headers[mc]) : '', used: paths.length };
  }
  function boxData(spec, headers, rows, idx) {
    var col = spec.ys[0].col, by = {}, order = [];
    idx.forEach(function (i) { var k = s(rows[i][spec.x]).trim(); if (!k) return; var x = num(rows[i][col]); if (x === null || (spec.noZero && x === 0)) return; if (!by[k]) { by[k] = []; order.push(k); } by[k].push(x); });
    order = order.filter(function (k) { return by[k].length >= 3; }).sort(function (a, b) { return by[b].length - by[a].length; }).slice(0, spec.topN > 0 ? spec.topN : 20);
    var stats = [], outliers = [];
    order.forEach(function (k, ci) {
      var v = by[k].slice().sort(function (a, b) { return a - b; }), q1 = quantile(v, 0.25), q2 = quantile(v, 0.5), q3 = quantile(v, 0.75), iqr = q3 - q1, lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
      var inl = v.filter(function (x) { return x >= lo && x <= hi; });
      stats.push([inl[0], q1, q2, q3, inl[inl.length - 1]]);
      v.forEach(function (x) { if (x < lo || x > hi) outliers.push([ci, x]); });
    });
    return { labels: order, stats: stats, outliers: outliers };
  }
  function calData(spec, headers, rows, idx) {
    var by = {}, mc = spec.ys && spec.ys[0] ? spec.ys[0].col : -1, fn = mc < 0 ? 'count' : (spec.ys[0].fn || 'sum'), mn = Infinity, mx = -Infinity;
    idx.forEach(function (i) { var ms = dateMs(rows[i][spec.x]); if (ms === null) return; var k = bucketKey(ms, 'day'); (by[k] = by[k] || []).push(mc < 0 ? 1 : rows[i][mc]); if (ms < mn) mn = ms; if (ms > mx) mx = ms; });
    var data = [], max = 0; Object.keys(by).sort().forEach(function (k) { var v = reduce(by[k], fn); if (v === null) return; data.push([k, v]); if (v > max) max = v; });
    var ranges = [];
    if (isFinite(mn)) { var y0 = new Date(mn).getUTCFullYear(), y1 = new Date(mx).getUTCFullYear(); for (var y = Math.max(y0, y1 - 2); y <= y1; y++) ranges.push([y + '-01-01', y + '-12-31']); if (new Date(mx).getUTCFullYear() - new Date(mn).getUTCFullYear() < 1 && (mx - mn) / 86400000 < 200) { var d0 = new Date(mn), d1 = new Date(mx); ranges = [[bucketKey(mn, 'day'), bucketKey(mx, 'day')]]; } }
    return { data: data, max: max, ranges: ranges, days: data.length };
  }
  function radarData(spec, headers, data) {
    var ind = data.series.map(function (sd, i) { var mx = 0; data.cats.forEach(function (c) { var v = Math.abs(c.values[i] || 0); if (v > mx) mx = v; }); return { name: sd.name, max: niceMax(mx) }; });
    return { indicators: ind, matrix: data.cats.map(function (c) { return c.values.map(function (v) { return v || 0; }); }) };
  }

  // ------------------------------------------------------------ captions (computed numbers only)
  function caption(type, spec, headers, data, ctx, env) {
    var hi = env.hi, out = [];
    function add(en, h) { out.push(hi ? h : en); }
    try {
      if (type === 'scatter' || type === 'bubble') {
        var reg = ctx.reg || (ctx.points.length >= 3 ? regression(ctx.points) : null);
        if (reg) {
          var a = Math.abs(reg.r), strength = a >= 0.8 ? ['strong', 'मज़बूत'] : a >= 0.5 ? ['moderate', 'मध्यम'] : a >= 0.25 ? ['weak', 'कमज़ोर'] : ['almost no', 'लगभग नहीं'];
          var dir = reg.r >= 0 ? ['rise together', 'साथ बढ़ते हैं'] : ['move in opposite directions', 'विपरीत दिशा में चलते हैं'];
          add('Across ' + indian(reg.n) + ' rows there is ' + strength[0] + ' association between ' + headers[spec.xnum] + ' and ' + headers[spec.ynum] + ' (r = ' + (Math.round(reg.r * 100) / 100) + (a >= 0.25 ? '; they tend to ' + dir[0] : '') + '). This shows a pattern, not a cause.',
              indian(reg.n) + ' पंक्तियों में ' + headers[spec.xnum] + ' और ' + headers[spec.ynum] + ' के बीच ' + strength[1] + ' संबंध है (r = ' + (Math.round(reg.r * 100) / 100) + (a >= 0.25 ? '; ' + dir[1] : '') + ')। यह पैटर्न दिखाता है, कारण नहीं।');
        }
        return out;
      }
      if (type === 'histogram') {
        var h = ctx.hist; if (!h.n) return out;
        var skew = h.mean > h.median * 1.05 ? ['a few large values pull the average above the median', 'कुछ बड़े मान औसत को माध्यिका से ऊपर खींचते हैं'] : (h.mean < h.median * 0.95 ? ['a few small values pull the average below the median', 'कुछ छोटे मान औसत को माध्यिका से नीचे खींचते हैं'] : ['the values are fairly balanced', 'मान काफ़ी संतुलित हैं']);
        add(headers[spec.xnum] + ': ' + indian(h.n) + ' values from ' + indian(h.min) + ' to ' + indian(h.max) + '; average ' + indian(Math.round(h.mean * 100) / 100) + ', median ' + indian(Math.round(h.median * 100) / 100) + ' — ' + skew[0] + '.',
            headers[spec.xnum] + ': ' + indian(h.n) + ' मान, ' + indian(h.min) + ' से ' + indian(h.max) + '; औसत ' + indian(Math.round(h.mean * 100) / 100) + ', माध्यिका ' + indian(Math.round(h.median * 100) / 100) + ' — ' + skew[1] + '।');
        return out;
      }
      if (type === 'gauge') { add(ctx.kpi.label + ': ' + indian(ctx.kpi.value) + ' across ' + indian(data.rowsUsed) + ' rows.', ctx.kpi.label + ': ' + indian(ctx.kpi.value) + ', ' + indian(data.rowsUsed) + ' पंक्तियों में।'); return out; }
      if (type === 'heatmap') { var m = ctx.matrix; if (m.cells.length) { var top = m.cells.slice().sort(function (p, q) { return q[2] - p[2]; })[0]; add('The busiest combination is ' + m.xs[top[0]] + ' × ' + m.ys[top[1]] + ' (' + indian(top[2]) + ').', 'सबसे अधिक संयोजन ' + m.xs[top[0]] + ' × ' + m.ys[top[1]] + ' है (' + indian(top[2]) + ')।'); } return out; }
      if (type === 'sankey') {
        var K = ctx.sankey, big = K.links.slice().sort(function (a, b) { return b.value - a.value; })[0];
        if (big && K.total) {
          var a1 = K.nodes[big.s], b1 = K.nodes[big.t];
          add('The biggest flow is ' + a1.label + ' → ' + b1.label + ': ' + indian(big.value) + ' (' + pctText(big.value / K.total * 100) + ' of ' + indian(K.total) + '). The thicker the band, the more rows move along it.',
              'सबसे बड़ा प्रवाह ' + a1.label + ' → ' + b1.label + ' है: ' + indian(big.value) + ' (' + indian(K.total) + ' का ' + pctText(big.value / K.total * 100) + ')। जितनी मोटी पट्टी, उतनी अधिक पंक्तियाँ।');
        }
        if (K.skipped) add(indian(K.skipped) + ' rows were left out (a blank category or a missing/negative amount).', indian(K.skipped) + ' पंक्तियाँ छोड़ी गईं (खाली श्रेणी या अनुपलब्ध/ऋणात्मक राशि)।');
        if (K.others) add('Smaller groups are combined as "Others".', 'छोटे समूह "अन्य" में जोड़े गए।');
        return out;
      }
      if (type === 'calendar') { if (ctx.cal.days) add(indian(ctx.cal.days) + ' days with data; the busiest day has ' + indian(ctx.cal.max) + '.', indian(ctx.cal.days) + ' दिनों का डेटा; सबसे व्यस्त दिन में ' + indian(ctx.cal.max) + ' हैं।'); return out; }
      if (type === 'boxplot') { if (ctx.box.labels.length) add('The box shows the middle half of the values, the line the median, dots are unusual values. ' + ctx.box.labels.length + ' groups with at least 3 rows.', 'डिब्बा मध्य आधे मान दिखाता है, रेखा माध्यिका, बिंदु असामान्य मान। कम से कम 3 पंक्तियों वाले ' + ctx.box.labels.length + ' समूह।'); return out; }
      if (type === 'radar') {
        var lead = data.series.map(function (sd, i) { var b = data.cats.filter(function (c) { return !c.isOthers; }).sort(function (a, c) { return (c.values[i] || 0) - (a.values[i] || 0); })[0]; return b ? { m: sd.name, c: b.label, v: Math.round((b.values[i] || 0) * 100) / 100 } : null; }).filter(Boolean).slice(0, 3);
        if (lead.length) add('Each shape is one ' + headers[spec.x] + '. Highest: ' + lead.map(function (l) { return l.m + ' — ' + l.c + ' (' + indian(l.v) + ')'; }).join('; ') + '.', 'हर आकृति एक ' + headers[spec.x] + ' है। सर्वाधिक: ' + lead.map(function (l) { return l.m + ' — ' + l.c + ' (' + indian(l.v) + ')'; }).join('; ') + '।');
        return out;
      }
      var cats = data.cats.filter(function (c) { return !c.isOthers; }), n = cats.length; if (!n) return out;
      var tot = data.cats.reduce(function (a, c) { return a + (c.total || 0); }, 0), name = data.series[0] ? data.series[0].name : '';
      var shownFn = data.series[0] ? (data.series[0].shown || data.series[0].fn) : '', fl = data.series[0] ? fnLabel(shownFn, hi) : '';
      if (data.multi && shownFn === 'count' && cats.length) {                       // a list column: say how many rows have the item, not a share of the item mentions
        var topm = cats.slice().sort(function (a, b) { return b.total - a.total; })[0], nr = data.rowsUsed;
        add(topm.label + ' appears in ' + indian(topm.rows.length) + ' of ' + indian(nr) + ' rows (' + pctText(topm.rows.length / nr * 100) + ').', topm.label + ' ' + indian(nr) + ' में से ' + indian(topm.rows.length) + ' पंक्तियों में है (' + pctText(topm.rows.length / nr * 100) + ')।');
      } else if (['pie', 'donut', 'rose', 'funnel', 'treemap', 'sunburst', 'pareto', 'column', 'bar', 'stackedColumn', 'percentColumn', 'waterfall', 'combo'].indexOf(type) >= 0 && data.series.length && tot > 0) {
        var best = cats.slice().sort(function (a, b) { return b.total - a.total; })[0], share = best.total / tot * 100;
        if (shownFn === 'sum' || shownFn === 'count' || shownFn === 'distinct') {
          add(best.label + ' is the largest: ' + indian(best.total) + ' (' + pctText(share) + ' of the total ' + indian(tot) + ').', best.label + ' सबसे बड़ा है: ' + indian(best.total) + ' (कुल ' + indian(tot) + ' का ' + pctText(share) + ')।');
          if (type === 'pareto' && ctx !== undefined) { var cum = 0, k = 0; var sorted = cats.slice().sort(function (a, b) { return b.total - a.total; }); for (; k < sorted.length; k++) { cum += sorted[k].total; if (cum / tot >= 0.8) { k++; break; } } add(k + ' of ' + sorted.length + ' (' + pctText(k / sorted.length * 100) + ') account for 80% of the total.', sorted.length + ' में से ' + k + ' (' + pctText(k / sorted.length * 100) + ') कुल का 80% देते हैं।'); }
        } else if (data.series.length > 1) {                                           // several series of averages / medians: the single highest bar (adding averages together means nothing)
          var bc = null, bs = null, bv = -Infinity; cats.forEach(function (c) { c.values.forEach(function (v, si) { if (v !== null && v > bv) { bv = v; bc = c; bs = data.series[si]; } }); });
          if (bc) add('Highest ' + fl.toLowerCase() + ': ' + bs.name + ' in ' + bc.label + ' (' + indian(Math.round(bv * 100) / 100) + ').', 'सर्वाधिक: ' + bc.label + ' में ' + bs.name + ' (' + indian(Math.round(bv * 100) / 100) + ')।');
        } else if (shownFn === 'pct' && data.series[0] && data.series[0].mname && cats.length > 1) {
          var hiC = cats.slice().sort(function (a, b) { return b.total - a.total; }), top2 = hiC[0], low2 = hiC[hiC.length - 1], sn = String(data.series[0].mname).replace(/^%\s*/, '');
          add('Share of rows where ' + sn + ': highest in ' + top2.label + ' (' + pctText(top2.total) + '), lowest in ' + low2.label + ' (' + pctText(low2.total) + ').', sn + ' वाली पंक्तियों का हिस्सा: सबसे अधिक ' + top2.label + ' में (' + pctText(top2.total) + '), सबसे कम ' + low2.label + ' में (' + pctText(low2.total) + ')।');
        } else add('Highest ' + fl.toLowerCase() + ': ' + best.label + ' (' + indian(Math.round(best.total * 100) / 100) + ').', 'सर्वाधिक: ' + best.label + ' (' + indian(Math.round(best.total * 100) / 100) + ')।');
      }
      if (['line', 'area', 'stackedArea'].indexOf(type) >= 0 && n >= 2) {
        var f0 = cats[0], l0 = cats[n - 1], pk = cats.slice().sort(function (a, b) { return b.total - a.total; })[0], dlt = l0.total - f0.total, pc = f0.total ? dlt / Math.abs(f0.total) * 100 : null;
        add(name + ' went from ' + indian(f0.total) + ' (' + f0.label + ') to ' + indian(l0.total) + ' (' + l0.label + ')' + (pc !== null ? ', ' + (dlt >= 0 ? 'up ' : 'down ') + pctText(pc) : '') + '; peak ' + indian(pk.total) + ' in ' + pk.label + '.',
            name + ' ' + indian(f0.total) + ' (' + f0.label + ') से ' + indian(l0.total) + ' (' + l0.label + ') ' + (dlt >= 0 ? 'तक बढ़ा' : 'तक घटा') + (pc !== null ? ' (' + pctText(pc) + ')' : '') + '; शीर्ष ' + indian(pk.total) + ' (' + pk.label + ')।');
      }
      if (data.others) add((data.others.count ? data.others.count + ' smaller groups are' : 'Smaller groups are') + ' combined as "Others".', (data.others.count ? data.others.count + ' छोटे समूह' : 'छोटे समूह') + ' "अन्य" में जोड़े गए।');
      if (data.blanks) add(indian(data.blanks) + ' rows have no value in the category column and are shown as "(blank)" or left out.', indian(data.blanks) + ' पंक्तियों में श्रेणी खाली है।');
    } catch (e) { /* captions are a convenience */ }
    return out;
  }

  // ------------------------------------------------------------ recommendations
  var NAME_GROUP = /city|country|state|district|region|zone|type|categor|status|station|department|designation|gender|segment|class|brand|group|cuisine|ward|block|mode|source|channel|जिला|थाना|श्रेणी|स्थिति|विभाग|पद|शहर|राज्य|प्रकार/i;
  // a position in time (MONTHS_BALANCE 0, -1, -2 …; DAYS_BIRTH; DAYS_EMPLOYED), not an amount: it is never added up and is no measure to explain
  var NAME_TIMEIDX = /(month|day|week|year|quarter)s?[_ ]?(balance|ago|since|offset|before|after|on[_ ]?book)/i;
  var NAME_AMOUNT = /amount|cost|price|sales|revenue|salary|votes|total|qty|quantity|cups|volume|profit|margin|fee|value|income|expense|balance|राशि|कीमत|वेतन|मूल्य|वोट/i;
  // one column is just another way of writing a different one (Rating text / Rating colour from the rating)
  function derivedFrom(a, b, rows, idx) {                                            // does column a (few values) split the numbers of b into separate, non-overlapping ranges?
    var by = {}, n = Math.min(idx.length, 4000);
    for (var k = 0; k < n; k++) { var r = rows[idx[k]], key = s(r[a.index]).trim(), x = num(r[b.index]); if (!key || x === null) continue; var o = by[key] || (by[key] = [Infinity, -Infinity, 0]); if (x < o[0]) o[0] = x; if (x > o[1]) o[1] = x; o[2]++; }
    var g = Object.keys(by).map(function (q) { return by[q]; }).filter(function (o) { return o[2] >= 3; }).sort(function (p, q) { return p[0] - q[0]; });
    if (g.length < 2) return false;
    for (var i2 = 1; i2 < g.length; i2++) if (g[i2 - 1][1] >= g[i2][0]) return false;
    return true;
  }
  function sameInfo(a, b, rows, idx) {                                               // two text columns that map one-to-one
    var pairs = {}, np = 0, n = Math.min(idx.length, 3000);
    for (var k = 0; k < n; k++) { var r = rows[idx[k]], key = s(r[a.index]).trim() + '\u0001' + s(r[b.index]).trim(); if (!pairs[key]) { pairs[key] = 1; np++; } }
    return np <= Math.max(a.distinct, b.distinct) * 1.05;
  }
  // which columns are real measures (not IDs, codes, coordinates or short whole-number labels), best first, and how to combine them
  CH.isMeasure = function (p) { return p.numeric && !p.tidx && !p.serial && !p.code && !p.unique && !p.coord && !p.idLike && !p.lowInt; };
  // engineered figures (a ratio of two columns, an "adjusted" copy of another number) are rarely the headline
  // what a business wants to know (revenue, profit, cups sold) comes before a price or a cost, and a rating-like index never gets the amount bonus
  var NAME_OUTCOME = /revenue|sales|profit|margin|income|cups|volume|turnover|streams|plays|views|downloads|listens|clicks|likes|shares|orders|visits|installs|कमाई|बिक्री|मुनाफ़ा/i;
  function measScore(p) { return (p.score ? 3 : (NAME_OUTCOME.test(p.name) ? 5.5 : (NAME_AMOUNT.test(p.name) ? 3.5 : 0))) + Math.min(p.distinct, 200) / 400 + p.fill + Math.min(p.namedBy || 0, 2) - (/ratio|_to_|\bto\b|(^|[_ ])per[_ ]/i.test(p.name) ? 2 : 0) - (/adjusted|effective|normali[sz]ed|weighted/i.test(p.name) ? 1 : 0); }
  CH.rankMeasures = function (list) { return list.slice().sort(function (a, b) { return measScore(b) - measScore(a); }); };
  CH.avgy = function (p) { return p.score || p.unit || p.tidx || /income|earning|wage|salary per|\bage\b|_age|age_|birth|employed|tenure|seniority/i.test(p.name) || /gpa|cgpa|retention|dependency|anxiety|stress|satisfaction|percentile|average|avg|mean|per\b|price|cost|kcal|calorie|gram|celsius|temperature|\btemp|minute|hour|\bkm\b|_km|distance|weight|height|duration|speed|तापमान|दूरी|वज़न/i.test(p.name); };   // per-row measurements: a total of them means nothing
  CH.fnFor = function (p) { return CH.avgy(p) ? 'avg' : 'sum'; };
  // columns that make sense to group or compare by, best first (no IDs, no columns that only restate a number, no duplicates)
  CH.groupColumns = function (prof, nums, rows, idx) {
    var M = STL.merge;
    var cats = prof.filter(function (p) {
      var named = NAME_GROUP.test(p.name), lim = named ? 300 : 40;
      return ((!p.numeric && !p.date && !p.list) || p.lowInt) && !p.unique && !(p.code && !p.lowInt) && p.distinct >= 2 && p.distinct <= lim && p.fill >= 0.6;
    });
    // derived columns: drop a category that only restates a number, then one of two that mean the same thing
    cats = cats.filter(function (c) { return !(c.distinct <= 12 && nums.some(function (m) { return derivedFrom(c, m, rows, idx); })); });
    cats = cats.filter(function (c, i) { return !cats.some(function (o, j) { return j < i && o.distinct <= 40 && c.distinct <= 40 && !c.numeric && !o.numeric && sameInfo(o, c, rows, idx); }); });
    function catScore(p) { var sc = -Math.abs(Math.min(p.distinct, 25) - 8) * 0.05 + (p.distinct > 40 ? -0.5 : 0); if (NAME_GROUP.test(p.name)) sc += 1.2; if (/city|district|state|region|शहर|जिला|राज्य/i.test(p.name)) sc += 0.4; if (p.lowInt && p.code) sc -= 1.0; if (M && M.score) { ['district', 'police station', 'department', 'category', 'status', 'designation'].forEach(function (g) { if (M.score(p.name, g).score >= 0.9) sc += 1; }); } if (p.lowInt) sc -= 0.3; return sc; }
    cats.sort(function (a, b) { return catScore(b) - catScore(a); });
    return cats;
  };
  CH.recommend = function (headers, rows, idx, max) {
    max = max || 8;
    var prof = CH.profile(headers, rows, idx), M = STL.merge, out = [];
    var isMeasure = CH.isMeasure;
    var nums = prof.filter(isMeasure), dates = prof.filter(function (p) { return p.date && !p.numeric; });
    var cats = CH.groupColumns(prof, nums, rows, idx);
    var lists = prof.filter(function (p) { return p.list && p.fill >= 0.6; });
    nums = CH.rankMeasures(nums);
    var avgy = CH.avgy, fnFor = CH.fnFor;
    var nz = function (p) { return p.score && p.zeroPct >= 0.01; };                   // 0 in a rating column means "not rated"
    var FN = { avg: ['Average ', 'औसत '], sum: ['Total ', 'योग '] };
    // lead with the grouping that really goes with the main number (largest ω²), not just the best-named one
    if (nums[0] && cats.length > 1 && STL.drivers) {
      try {
        var sub = idx.length > 4000 ? idx.slice(0, 4000) : idx, om = {};
        var others = nums.slice(1).filter(function (p) { return !STL.drivers.sharesName(p.name, nums[0].name).length; });
        STL.drivers.rank(rows, sub, headers, nums[0].index, { prof: prof, candidates: cats.map(function (c) { return { col: c.index, name: c.name, kind: 'cat' }; }).concat(others.map(function (p) { return { col: p.index, name: p.name, kind: 'num' }; })), noZero: nz(nums[0]) }).forEach(function (r) { if (!r.derived && !r.walls && !r.standIn) om[r.col] = r.omega2; });
        var pos = {}; cats.forEach(function (c, i) { pos[c.index] = i; }); nums.forEach(function (c, i) { pos[c.index] = i; });
        var w = function (p) { return om[p.index] >= 0.01 ? om[p.index] : 0; }, byOm = function (a, b) { return (w(b) - w(a)) || (pos[a.index] - pos[b.index]); };
        cats = cats.slice().sort(byOm); nums = [nums[0]].concat(nums.slice(1).sort(byOm));   // the second number: the one that goes most with the first
      } catch (e) { /* suggestions still work by name */ }
    }
    var c1 = cats[0], c2 = cats[1], n1 = nums[0], n2 = nums[1], L = lists[0], yesNo = cats.filter(function (p) { return p.distinct === 2 && !p.numeric; }).slice(0, 2);
    var NAME_FLAG = /viral|churn|default|fraud|convert|target|label|\bhit\b|success|surviv|click|purchas|cancel|\blate\b|breach|defect|positive|won\b|passed|dropout|attrition|हिट|सफल/i;
    var POS = /^(1|yes|y|true|t|हाँ|हां)$/i, flagCols = prof.filter(function (p) { return p.flag && p.fill >= 0.8 && !p.date && p.flagKeys.some(function (k) { return POS.test(k); }) && p.flagKeys.every(function (k) { return /^(0|1|yes|no|y|n|true|false|t|f|हाँ|हां|नहीं)$/i.test(k); }); });
    function add(type, spec, whyEn, whyHi, score) { out.push({ type: type, spec: spec, why: B(whyEn, whyHi), score: score }); }
    var pre = function (p) { return /^(average|avg|mean|total)\b/i.test(p.name) ? '' : FN[fnFor(p)][0]; };
    function ttl(p, c) { return pre(p) + p.name + ' — ' + c.name; }
    if (c1 && n1) add('column', { x: c1.index, ys: [{ col: n1.index, fn: fnFor(n1) }], sort: 'desc', topN: 12, noZero: nz(n1), minRows: avgy(n1) ? 20 : 0, title: ttl(n1, c1) },
        'Which ' + c1.name + ' has the highest ' + (avgy(n1) ? 'average ' : 'total ') + n1.name + '?', 'किस ' + c1.name + ' का ' + (avgy(n1) ? 'औसत ' : 'योग ') + n1.name + ' सबसे अधिक है?', 100);
    if (c1) add('bar', { x: c1.index, ys: [{ col: -1, fn: 'count' }], sort: 'desc', topN: 15, title: T({ hi: false }, 'Number of rows by ', '') + c1.name }, 'How many rows for each ' + c1.name, 'हर ' + c1.name + ' में कितनी पंक्तियाँ', 94);
    if (n1) add('histogram', { xnum: n1.index, noZero: nz(n1), title: T({ hi: false }, 'Spread of ', '') + n1.name }, 'How the values of ' + n1.name + ' are spread' + (nz(n1) ? ' (zeros left out)' : ''), n1.name + ' के मान कैसे फैले हैं' + (nz(n1) ? ' (शून्य छोड़कर)' : ''), 92);
    if (L) { var sc = nums.filter(function (p) { return p.score; })[0] || n1;
      add('bar', { x: L.index, multi: true, ys: [{ col: -1, fn: 'count' }], sort: 'desc', topN: 15, title: T({ hi: false }, 'Most common ', '') + L.name }, 'Which ' + L.name + ' are most common (each item counted separately)', 'कौन-से ' + L.name + ' सबसे आम हैं (हर वस्तु अलग गिनी)', 90);
      if (sc) add('bar', { x: L.index, multi: true, ys: [{ col: sc.index, fn: 'avg' }], sort: 'desc', topN: 15, minRows: 30, noZero: nz(sc), title: 'Average ' + sc.name + ' — ' + L.name }, 'Which ' + L.name + ' have the highest average ' + sc.name + ' (small groups hidden)', 'किन ' + L.name + ' का औसत ' + sc.name + ' सबसे अधिक है (छोटे समूह छिपाए)', 88); }
    if (dates[0]) { var dd = dates[0]; add('area', { x: dd.index, ys: n1 ? [{ col: n1.index, fn: fnFor(n1) }] : [{ col: -1, fn: 'count' }], time: 'month', sort: 'label', noZero: n1 ? nz(n1) : false, title: (n1 ? FN[fnFor(n1)][0] + n1.name : T({ hi: false }, 'Rows', '')) + ' — ' + dd.name, smooth: true }, 'Trend over time by month', 'महीने के अनुसार समय के साथ प्रवृत्ति', 89); }
    if (c1 && c1.distinct <= 8) add('donut', { x: c1.index, ys: [{ col: -1, fn: 'count' }], sort: 'desc', title: T({ hi: false }, 'Share of rows by ', '') + c1.name }, 'Share of the rows by ' + c1.name, c1.name + ' के अनुसार पंक्तियों की हिस्सेदारी', 84);
    if (n1 && n2) add('scatter', { xnum: n1.index, ynum: n2.index, trend: true, noZero: nz(n1) || nz(n2), g: c1 && c1.distinct <= 6 ? c1.index : -1, title: n1.name + ' vs ' + n2.name }, 'Do ' + n1.name + ' and ' + n2.name + ' move together?', n1.name + ' और ' + n2.name + ' क्या साथ चलते हैं?', 82);
    yesNo.forEach(function (b2, bi) { var sm = nums.filter(function (p) { return p.score; })[0] || n1; if (!sm) return;
      add('column', { x: b2.index, ys: [{ col: sm.index, fn: 'avg' }], noZero: nz(sm), title: 'Average ' + sm.name + ' — ' + b2.name }, 'Is the average ' + sm.name + ' different for “' + b2.name + '”?', '“' + b2.name + '” के अनुसार औसत ' + sm.name + ' कितना अलग है?', 87 - bi); });
    if (c1 && n2 && n2 !== n1) add('column', { x: c1.index, ys: [{ col: n2.index, fn: fnFor(n2) }], sort: 'desc', topN: 12, noZero: nz(n2), minRows: avgy(n2) ? 20 : 0, title: ttl(n2, c1) }, 'Which ' + c1.name + ' has the highest ' + (avgy(n2) ? 'average ' : 'total ') + n2.name + '?', 'किस ' + c1.name + ' का ' + (avgy(n2) ? 'औसत ' : 'योग ') + n2.name + ' सबसे अधिक है?', 80);
    if (c1 && c2 && c1.distinct <= 25 && c2.distinct <= 25) add('heatmap', { x: c1.index, g: c2.index, ys: [{ col: -1, fn: 'count' }], title: c1.name + ' × ' + c2.name }, 'Where ' + c1.name + ' and ' + c2.name + ' overlap most', c1.name + ' और ' + c2.name + ' कहाँ सबसे अधिक मिलते हैं', 66);
    if (c1 && c2 && c1.distinct <= 14 && c2.distinct <= 14) add('sankey', { x: c1.index, g: c2.index, ys: [{ col: -1, fn: 'count' }], topN: 8, title: c1.name + ' → ' + c2.name }, 'How rows flow from ' + c1.name + ' to ' + c2.name, 'पंक्तियाँ ' + c1.name + ' से ' + c2.name + ' में कैसे बँटती हैं', 63);
    if (c1 && n1 && c1.distinct <= 12) add('boxplot', { x: c1.index, ys: [{ col: n1.index, fn: 'sum' }], noZero: nz(n1), title: n1.name + ' — ' + c1.name }, 'How widely ' + n1.name + ' varies inside each ' + c1.name, 'हर ' + c1.name + ' में ' + n1.name + ' कितना बदलता है', 60);
    if (c1 && n1 && c1.distinct >= 12 && !avgy(n1)) add('treemap', { x: c1.index, ys: [{ col: n1.index, fn: 'sum' }], sort: 'desc', topN: 40, title: n1.name + ' — ' + c1.name }, 'Which ' + c1.name + ' values are biggest', 'कौन-से ' + c1.name + ' सबसे बड़े हैं', 58);
    if (c1 && n1 && !avgy(n1) && c1.distinct >= 5) add('pareto', { x: c1.index, ys: [{ col: n1.index, fn: 'sum' }], sort: 'desc', topN: 15, title: T({ hi: false }, 'Pareto: ', 'पैरेटो: ') + n1.name + ' / ' + c1.name }, 'Do a few ' + c1.name + ' values make most of the total?', 'क्या कुछ ' + c1.name + ' कुल का अधिकांश बनाते हैं?', 56);
    if (c1 && nums.length >= 3 && c1.distinct <= 8) add('radar', { x: c1.index, ys: nums.slice(0, 5).map(function (p) { return { col: p.index, fn: 'avg' }; }), sort: 'desc', title: c1.name }, 'Profile of each ' + c1.name + ' across several measures', 'कई मापों में हर ' + c1.name + ' का स्वरूप', 54);
    if (dates[0] && (function () { var a = Infinity, b = -Infinity; idx.slice(0, 4000).forEach(function (i) { var ms = dateMs(rows[i][dates[0].index]); if (ms !== null) { if (ms < a) a = ms; if (ms > b) b = ms; } }); return (b - a) / 86400000 >= 45; })()) add('calendar', { x: dates[0].index, ys: [{ col: -1, fn: 'count' }], title: T({ hi: false }, 'Rows per day — ', 'प्रतिदिन पंक्तियाँ — ') + dates[0].name }, 'Which days are busiest', 'कौन-से दिन सबसे व्यस्त हैं', 52);
    // a yes/no column the file is about (viral, churned, fraud): its share by the grouping that goes most with it
    flagCols.slice(0, 2).forEach(function (fc, fi) {
      var posKey = fc.flagKeys.filter(function (k) { return POS.test(k); })[0], gcs = cats.filter(function (g) { return g.index !== fc.index && !flagCols.some(function (q) { return q.index === g.index; }); }), best = gcs[0], bestOm = -1;
      if (STL.drivers && gcs.length) { try { var sub2 = idx.length > 4000 ? idx.slice(0, 4000) : idx; STL.drivers.rank(rows, sub2, headers, fc.index, { prof: prof, candidates: gcs.slice(0, 12).map(function (g) { return { col: g.index, name: g.name, kind: 'cat' }; }), standIns: false, walls: false }).forEach(function (r) { if (r.omega2 > bestOm) { bestOm = r.omega2; best = gcs.filter(function (g) { return g.index === r.col; })[0]; } }); } catch (e) { /* by name then */ } }
      if (best) add('column', { x: best.index, ys: [{ col: fc.index, fn: 'pct', op: '=', value: posKey }], sort: 'desc', topN: 14, minRows: 20, title: T({ hi: false }, 'Share of rows where ', '') + fc.name + ' = ' + posKey + ' — ' + best.name },
        'In which ' + best.name + ' is “' + fc.name + '” most common?', 'किस ' + best.name + ' में “' + fc.name + '” सबसे अधिक है?', (NAME_FLAG.test(fc.name) ? 130 : 78) - fi);
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, max);
  };
})(typeof window !== 'undefined' ? window : globalThis);
