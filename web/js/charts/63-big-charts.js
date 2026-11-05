// =====================================================================
//  CHARTS FOR LARGE FILES  /  बड़ी फ़ाइलों के चार्ट
//  A Large File is never loaded into the browser. For a chart, the engine (DuckDB, on this PC) does the
//  grouping, binning, quartiles and sampling over EVERY row and sends back only a few hundred numbers.
//  This file turns a chart spec into those questions, reshapes the answers so the normal chart builders
//  (60-chart-engine.js) can draw them, and turns a click or a drag on the chart into Large-File filters.
//
//    STL.bigCharts.plan(type, spec, headers)      -> the question for the engine (pure, tested in Node)
//    STL.bigCharts.synth(res, plan, headers)      -> small table the builders understand (pure)
//    STL.bigCharts.build(type, spec, env)         -> Promise of { option, data, ctx, caption, big }
//    STL.bigCharts.selection / brush / combine    -> filters for the large grid
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL = root.STL || {}, CH = STL.charts;
  var BC = STL.bigCharts = { sample: { ds: null, rows: [], idx: [] } };
  function T(en, hi) { return (STL.ui && STL.ui.T) ? STL.ui.T(en, hi) : en; }
  function B() { return root.BIG; }
  function isTime(spec) { return spec.x >= 0 && spec.time && spec.time !== 'none'; }

  // ------------------------------------------------------------ talking to the engine
  function api(path, body) {
    return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) {
      return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || j.message || 'The engine could not answer'); return j; });
    });
  }
  BC.api = api;
  function scope() {                                                             // the grid's own search and filters, but not the chart's own selection
    var big = B();
    return { search: big.search || '', filters: big.filters.filter(function (f) { return !f._chart; }).map(function (f) { return { col: f.col, op: f.op, value: f.value, value2: f.value2 }; }) };
  }
  BC.scope = scope;
  BC.loadSample = function () {
    var big = B(), ds = big.ds;
    if (BC.sample.ds === ds) return Promise.resolve(BC.sample);
    return api('/api/engine/' + ds + '/sample', { n: 4000 }).then(function (r) { BC.sample = { ds: ds, rows: r.rows, idx: r.rows.map(function (_, i) { return i; }) }; return BC.sample; });
  };

  // ------------------------------------------------------------ chart types and how the engine answers them
  var AGG = ' column bar stackedColumn percentColumn combo pareto waterfall line area stackedArea calendar pie donut rose funnel treemap sunburst heatmap sankey radar gauge ';
  BC.isAgg = function (type) { return AGG.indexOf(' ' + type + ' ') >= 0; };

  // the question: which columns to group by, what to calculate, how many groups to keep
  BC.plan = function (type, spec, headers) {
    var ys = (spec.ys && spec.ys.length ? spec.ys : [{ col: -1, fn: 'count' }]).map(function (y) { return { col: y.col >= 0 ? y.col : -1, fn: y.col >= 0 ? (y.fn || 'sum') : 'count' }; });
    var multi = ' column bar line area combo radar '.indexOf(' ' + type + ' ') >= 0;
    if (!multi) ys = ys.slice(0, 1);
    var date = isTime(spec) && type !== 'gauge';
    var g = spec.g >= 0 && ys.length === 1 ? spec.g : -1, g2 = type === 'sankey' && spec.g2 >= 0 ? spec.g2 : -1;
    var req = { kind: 'agg', x: spec.x >= 0 ? spec.x : -1, time: date ? spec.time : null, g: g, g2: g2, rank: date ? 'label' : 'value', maxCats: date ? 4000 : 300, maxGroups: (spec.maxGroups || 8) + 1 };
    if (type === 'sankey') { var n = spec.topN > 0 ? spec.topN : 8; ys = [{ col: ys[0].col, fn: ys[0].col >= 0 ? 'sum' : 'count' }]; req.maxCats = n; req.maxGroups = n + 1; }
    else if (type === 'heatmap') { req.maxCats = 25; req.maxGroups = 26; ys = ys.slice(0, 1); }
    else if (type === 'calendar') { req.time = 'day'; req.rank = 'label'; req.maxCats = 4000; req.g = -1; req.g2 = -1; date = true; }
    else if (type === 'gauge') { req.x = -1; req.g = -1; req.g2 = -1; req.time = null; date = false; }
    else if (type === 'radar') { req.g = -1; req.maxCats = 12; }
    else if (spec.topN > 0 && !date) req.maxCats = spec.topN;
    if (type !== 'sankey' && type !== 'heatmap') req.g2 = -1;
    if (type === 'sunburst' || type === 'treemap') req.maxGroups = 9;
    req.measures = ys.map(function (y) { return { col: y.col, fn: y.fn }; });
    return { req: req, ys: ys, date: date, hasG: req.g >= 0, hasG2: req.g2 >= 0, hasX: req.x >= 0 };
  };

  // answer -> a small table [x, g, g2, m0, m1 ...] and the spec that reads it
  BC.synth = function (res, plan, headers, spec) {
    var rows = res.rows.map(function (r) {
      var k = 0, x = r[k++], g = plan.hasG ? r[k++] : '', g2 = plan.hasG2 ? r[k++] : '';
      return [x, g, g2].concat(r.slice(k));
    });
    if (plan.date) rows = rows.filter(function (r) { return r[0] !== '(Others)'; });
    if (plan.hasG) {                                                                // series: the biggest first, "Others" last - the same order on every refresh
      var tot = {}; rows.forEach(function (r) { tot[r[1]] = (tot[r[1]] || 0) + Math.abs(Number(r[3]) || 0); });
      var rank = function (g) { return g === '(Others)' ? Infinity : -tot[g]; };
      rows = rows.map(function (r, i) { return { r: r, i: i }; }).sort(function (a, b) { return (rank(a.r[1]) - rank(b.r[1])) || (a.i - b.i); }).map(function (o) { return o.r; });
    }
    var names = plan.ys.map(function (y) { return y.col < 0 ? 'Rows' : String(headers[y.col]); });
    var head = [plan.hasX ? headers[plan.req.x] : '', plan.hasG ? headers[plan.req.g] : '', plan.hasG2 ? headers[plan.req.g2] : ''].concat(names);
    return { rows: rows, headers: head, idx: rows.map(function (_, i) { return i; }) };
  };
  BC.spec2 = function (type, spec, plan, headers) {
    var s = Object.assign({}, spec, {
      x: plan.hasX ? 0 : -1, g: plan.hasG ? 1 : -1, g2: plan.hasG2 ? 2 : -1, time: 'none', topN: type === 'sankey' ? 1000 : 0, maxGroups: 99, preOthers: true,
      ys: plan.ys.map(function (y, k) { return { col: 3 + k, fn: 'sum', as: y.fn, name: y.col < 0 ? undefined : String(headers[y.col]) }; })
    });
    if (plan.date) { s.sort = type === 'calendar' ? s.sort : (spec.sort || 'label'); if (spec.time === 'weekday') s.labelOrder = 'weekday'; }
    return s;
  };

  // ------------------------------------------------------------ building
  BC.build = function (type, spec, env) {
    var big = B(), H = big.headers, sc = scope();
    function done(out, matched, extra) { out.big = Object.assign({ matched: matched }, extra || {}); return out; }
    if (BC.isAgg(type)) {
      var plan = BC.plan(type, spec, H);
      if (type === 'heatmap' && !plan.hasG) return Promise.reject(new Error(T('Choose a second category column.', 'दूसरा श्रेणी कॉलम चुनें।')));
      if (type === 'sankey' && (!plan.hasG || spec.x === spec.g)) return Promise.reject(new Error(T('Choose two different category columns.', 'दो अलग श्रेणी कॉलम चुनें।')));
      return api('/api/engine/' + big.ds + '/chart', Object.assign({}, plan.req, sc)).then(function (res) {
        var sy = BC.synth(res, plan, H, spec), s2 = BC.spec2(type, spec, plan, H);
        if (type === 'calendar' && !sy.rows.length) throw new Error(T('No dates could be read in this column.', 'इस कॉलम में कोई तारीख नहीं पढ़ी जा सकी।'));
        var c = CH.compute(type, s2, sy.headers, sy.rows, sy.idx, env);
        c.data.rowsUsed = res.matched;
        var out = CH.finish(type, spec2for(type, s2, spec), sy.headers, c.data, c.ctx, env);
        var more = res.rows.some(function (r) { return r[0] === '(Others)' || (plan.hasG && r[1] === '(Others)'); });
        return done(out, res.matched, { plan: plan, more: more });
      });
    }
    if (type === 'histogram') {
      return api('/api/engine/' + big.ds + '/chart', Object.assign({ kind: 'hist', col: spec.xnum, bins: spec.bins || 0 }, sc)).then(function (h) {
        return done(CH.finish('histogram', spec, H, { cats: [], series: [], rowsUsed: h.n }, { hist: CH.histFrom(h) }, env), h.n);
      });
    }
    if (type === 'boxplot') {
      var col = spec.ys && spec.ys[0] ? spec.ys[0].col : -1;
      if (!(col >= 0) || !(spec.x >= 0)) return Promise.reject(new Error(T('Choose a category and a number column.', 'एक श्रेणी और एक संख्या कॉलम चुनें।')));
      return api('/api/engine/' + big.ds + '/chart', Object.assign({ kind: 'box', x: spec.x, col: col, top: spec.topN > 0 ? spec.topN : 20 }, sc)).then(function (b) {
        return done(CH.finish('boxplot', spec, H, { cats: [], series: [], rowsUsed: big.matched }, { box: { labels: b.labels, stats: b.stats, outliers: b.outliers } }, env), big.matched);
      });
    }
    if (type === 'scatter' || type === 'bubble') {
      if (spec.xnum === undefined || spec.ynum === undefined) return Promise.reject(new Error('Choose two number columns'));
      return api('/api/engine/' + big.ds + '/chart', Object.assign({ kind: 'points', xnum: spec.xnum, ynum: spec.ynum, size: type === 'bubble' && spec.size >= 0 ? spec.size : -1, g: spec.g >= 0 ? spec.g : -1, limit: 5000 }, sc)).then(function (r) {
        var pts = r.points.map(function (p) { var o = { value: [p[1], p[2]], ri: p[0], g: null }; var k = 3; if (r.hasSize) o.value.push(p[k++]); if (r.hasGroup) o.g = p[k]; return o; });
        var out = CH.finish(type, spec, H, { cats: [], series: [], rowsUsed: r.n }, { points: pts, reg: r.reg }, env);
        if (r.sampled) out.caption.push(T('The dots are a random sample of ' + pts.length.toLocaleString('en-IN') + ' of ' + r.n.toLocaleString('en-IN') + ' rows; the trend line and the correlation use all rows.', 'बिंदु ' + r.n.toLocaleString('en-IN') + ' में से ' + pts.length.toLocaleString('en-IN') + ' पंक्तियों का यादृच्छिक नमूना हैं; ट्रेंड रेखा और सहसंबंध सभी पंक्तियों से बने हैं।'));
        return done(out, r.n, { sampled: r.sampled });
      });
    }
    return Promise.reject(new Error('Unknown chart type: ' + type));
  };
  function spec2for(type, s2, spec) { var o = Object.assign({}, s2); o.title = spec.title; o.subtitle = spec.subtitle; return o; }

  // ------------------------------------------------------------ chart -> filters for the large grid
  function catFilter(col, spec, label, time) {
    if (time) return { col: col, op: 'bucket', value: spec.time, value2: label, label: '= ' + label };
    if (label === '(blank)') return { col: col, op: 'empty' };
    return { col: col, op: 'ieq', value: label, label: '= ' + label };
  }
  // one bar / slice / cell / band was clicked: which filters show exactly those rows?
  BC.selection = function (type, spec, out, p) {
    var d = out.data, cats = out.option._cats || d.cats, f = [], label = '', xkeys = null, ctx = out.ctx;
    function res(filters, lab, keys) { return { filters: filters, label: lab, xkeys: keys || null }; }
    if (type === 'scatter' || type === 'bubble') {
      if (!p.data || !p.value) return null;
      return res([{ col: spec.xnum, op: 'between', value: p.value[0], value2: p.value[0], label: '= ' + p.value[0] }, { col: spec.ynum, op: 'between', value: p.value[1], value2: p.value[1], label: '= ' + p.value[1] }], p.value[0] + ' / ' + p.value[1]);
    }
    if (type === 'histogram') {
      var h = ctx.hist, i = p.dataIndex, lo = h.edges[i], hi = h.edges[i + 1], last = i === h.counts.length - 1;
      return res([{ col: spec.xnum, op: 'between', value: lo, value2: last ? hi : hi - (hi - lo) * 1e-9, label: CH.compact(lo) + ' – ' + CH.compact(hi) }], CH.compact(lo) + '–' + CH.compact(hi));
    }
    if (type === 'heatmap') { var m = ctx.matrix, xv = m.xs[p.value[0]], yv = m.ys[p.value[1]]; return res([catFilter(spec.x, spec, xv), catFilter(spec.g, spec, yv)], xv + ' × ' + yv); }
    if (type === 'calendar') { var day = p.value[0]; return res([{ col: spec.x, op: 'bucket', value: 'day', value2: day, label: '= ' + day }], day); }
    if (type === 'boxplot') { var bl = ctx.box.labels[p.seriesType === 'boxplot' ? p.dataIndex : (p.value ? p.value[0] : 0)]; return bl ? res([catFilter(spec.x, spec, bl)], bl, [bl]) : null; }
    if (type === 'gauge') return null;
    if (type === 'sankey') {
      var K = ctx.sankey, LV = [spec.x, spec.g, spec.g2], it = p.dataType === 'edge' ? K.links[p.data._li] : K.nodes[p.data._ni];
      if (!it) return null; if (it.isOthers) return { others: true };
      if (p.dataType === 'edge') { var a = K.nodes[it.s], b = K.nodes[it.t]; if (a.isOthers || b.isOthers) return { others: true }; return res([catFilter(LV[a.level], spec, a.label), catFilter(LV[b.level], spec, b.label)], a.label + ' → ' + b.label); }
      return res([catFilter(LV[it.level], spec, it.label)], it.label);
    }
    var ci = (p.data && p.data._cat !== undefined) ? p.data._cat : p.dataIndex, c = cats[ci];
    if (!c) return null; if (c.isOthers) return { others: true };
    f.push(catFilter(spec.x, spec, c.label, isTime(spec))); label = c.label; xkeys = [c.label];
    var si = (p.data && p.data._ser !== undefined) ? p.data._ser : (d.split && p.seriesIndex !== undefined ? p.seriesIndex : -1);
    if (d.split && si >= 0 && d.series[si] && d.series[si].name !== '(Others)') { f.push(catFilter(spec.g, spec, d.series[si].name)); label += ' · ' + d.series[si].name; }
    return res(f, label, xkeys);
  };
  // a drag over several bars, a range of bins, or a rectangle on a scatter chart
  BC.brush = function (type, spec, out, ev) {
    var b = ev.batch && ev.batch[0]; if (!b) return null; var d = out.data;
    if (type === 'scatter' || type === 'bubble') {
      var a = b.areas && b.areas[0], r = a && a.coordRange, xr, yr;
      if (r && a.brushType === 'rect') { xr = r[0]; yr = r[1]; }
      else {                                                                       // free-form area (or no coordinates): the box around the dots that were caught
        var xs = [], ys = [];
        (b.selected || []).forEach(function (s) { (s.dataIndex || []).forEach(function (i) { var pt = out.option.series[s.seriesIndex] && out.option.series[s.seriesIndex].data[i]; if (pt && pt.value) { xs.push(pt.value[0]); ys.push(pt.value[1]); } }); });
        if (!xs.length) return null;
        xr = [Math.min.apply(null, xs), Math.max.apply(null, xs)]; yr = [Math.min.apply(null, ys), Math.max.apply(null, ys)];
      }
      var lo = function (v) { return Math.round(v * 100) / 100; };
      return { filters: [{ col: spec.xnum, op: 'between', value: Math.min(xr[0], xr[1]), value2: Math.max(xr[0], xr[1]), label: lo(Math.min(xr[0], xr[1])) + ' – ' + lo(Math.max(xr[0], xr[1])) }, { col: spec.ynum, op: 'between', value: Math.min(yr[0], yr[1]), value2: Math.max(yr[0], yr[1]), label: lo(Math.min(yr[0], yr[1])) + ' – ' + lo(Math.max(yr[0], yr[1])) }], label: T('selected area', 'चुना हुआ क्षेत्र'), xkeys: null };
    }
    var sel = []; (b.selected || []).forEach(function (s) { (s.dataIndex || []).forEach(function (i) { if (sel.indexOf(i) < 0) sel.push(i); }); });
    if (!sel.length) return null; sel.sort(function (p, q) { return p - q; });
    if (type === 'histogram') { var h = out.ctx.hist, lo2 = h.edges[sel[0]], hi2 = h.edges[sel[sel.length - 1] + 1]; return { filters: [{ col: spec.xnum, op: 'between', value: lo2, value2: hi2, label: CH.compact(lo2) + ' – ' + CH.compact(hi2) }], label: T('selected range', 'चुना हुआ दायरा'), xkeys: null }; }
    var cats = out.option._cats || d.cats, labels = sel.map(function (i) { return cats[i]; }).filter(function (c) { return c && !c.isOthers; }).map(function (c) { return c.label; });
    if (!labels.length) return null;
    return { filters: [BC.listFilter(spec, labels)], label: T('selected range', 'चुना हुआ दायरा'), xkeys: labels };
  };
  // several bars of one chart = one filter that accepts any of them
  BC.listFilter = function (spec, labels) {
    var timeSel = isTime(spec), txt = labels.slice(0, 3).join(', ') + (labels.length > 3 ? ' +' + (labels.length - 3) : '');
    if (timeSel) return { col: spec.x, op: 'bucket', value: spec.time, value2: labels, label: '= ' + txt };
    if (labels.indexOf('(blank)') >= 0 && labels.length === 1) return { col: spec.x, op: 'empty' };
    return { col: spec.x, op: 'iin', value: labels, label: '= ' + txt };
  };
  // Ctrl+click adds a bar to what is already selected (only when it is the same column)
  BC.combine = function (spec, oldSel, nu) {
    if (!oldSel || !oldSel.xkeys || !nu.xkeys || oldSel.filters.length !== 1 || nu.filters.length !== 1) return nu;
    if (oldSel.filters[0].col !== nu.filters[0].col) return nu;
    var keys = oldSel.xkeys.slice(); nu.xkeys.forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); });
    return { filters: [BC.listFilter(spec, keys)], label: keys.slice(0, 3).join(', ') + (keys.length > 3 ? ' +' + (keys.length - 3) : ''), xkeys: keys };
  };
})(typeof window !== 'undefined' ? window : globalThis);
