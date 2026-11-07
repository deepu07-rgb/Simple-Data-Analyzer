const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./load');

const ctx = sandbox(['web/js/tasks/30-messy-file-fixer.js', 'web/js/tasks/31-merge-anything.js', 'web/js/reports/41-pendency-radar.js', 'web/js/charts/60-chart-engine.js', 'web/js/charts/63-big-charts.js']);
const CH = ctx.STL.charts, BC = ctx.STL.bigCharts;
const plain = x => JSON.parse(JSON.stringify(x));

const D = ['जयपुर', 'जोधपुर', 'कोटा', 'अजमेर', 'बीकानेर'], ST = ['लंबित', 'निस्तारित', 'जाँच में'];
function rng(seed) { let x = seed; return () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296; }
const r = rng(21), HEAD = ['जिला', 'स्थिति', 'राशि', 'आयु', 'दिनांक'];
const ROWS = Array.from({ length: 400 }, (_, i) => [D[Math.floor(r() * 5)], ST[Math.floor(r() * 3)], String(1000 + Math.floor(r() * 90000)), String(18 + Math.floor(r() * 50)), `${String(1 + (i % 27)).padStart(2, '0')}-${String(1 + (i % 12)).padStart(2, '0')}-2025`]);
const IDX = ROWS.map((_, i) => i);

// an independent stand-in for the engine: groups the rows exactly as the SQL does
function fakeEngine(req) {
  const num = v => (v === '' || v == null ? null : Number(String(v).replace(/,/g, '')));
  const keyOf = (row, col, time) => {
    if (col < 0) return '';
    const t = String(row[col]).trim();
    if (time) { const ms = ctx.STL.pend.parseDate(t, false); return ms === null ? null : CH.bucketKey(ms, time); }
    return t === '' ? '(blank)' : t;
  };
  const groups = new Map();
  ROWS.forEach(row => {
    const x = keyOf(row, req.x, req.time); if (x === null) return;
    const g = req.g >= 0 ? keyOf(row, req.g) : null, g2 = req.g2 >= 0 ? keyOf(row, req.g2) : null, k = [x, g, g2].join('\u0001');
    if (!groups.has(k)) groups.set(k, { x, g, g2, rows: [] }); groups.get(k).rows.push(row);
  });
  const rows = [...groups.values()].sort((a, b) => (a.x + a.g + a.g2 < b.x + b.g + b.g2 ? -1 : 1)).map(gr => {
    const out = [gr.x]; if (req.g >= 0) out.push(gr.g); if (req.g2 >= 0) out.push(gr.g2);
    req.measures.forEach(m => {
      const vals = gr.rows.map(rw => num(rw[m.col])).filter(v => v !== null), sum = vals.reduce((a, b) => a + b, 0);
      out.push(m.fn === 'count' ? gr.rows.length : m.fn === 'sum' ? sum : m.fn === 'avg' ? sum / vals.length : m.fn === 'max' ? Math.max(...vals) : Math.min(...vals));
    });
    return out;
  });
  return { rows, matched: ROWS.length, dims: 1 + (req.g >= 0) + (req.g2 >= 0), measures: req.measures.length };
}
function viaEngine(type, spec) {
  const plan = BC.plan(type, spec, HEAD), res = fakeEngine(plan.req), sy = BC.synth(res, plan, HEAD, spec), s2 = BC.spec2(type, spec, plan, HEAD);
  const c = CH.compute(type, s2, sy.headers, sy.rows, sy.idx, {}); c.data.rowsUsed = res.matched;
  return CH.finish(type, Object.assign({}, s2, { title: spec.title }), sy.headers, c.data, c.ctx, {});
}
const strip = o => JSON.stringify(o, (k, v) => typeof v === 'function' ? undefined : v);

test('the engine path draws the same chart as the in-memory path', () => {
  const cases = {
    column: { x: 0, ys: [{ col: 2, fn: 'sum' }], sort: 'label' },
    bar: { x: 0, ys: [{ col: 2, fn: 'avg' }], sort: 'label' },
    combo: { x: 0, ys: [{ col: 2, fn: 'sum' }, { col: 3, fn: 'avg' }], sort: 'label' },
    stackedColumn: { x: 0, g: 1, ys: [{ col: -1, fn: 'count' }], sort: 'label' },
    pie: { x: 1, ys: [{ col: 2, fn: 'sum' }], sort: 'label' },
    treemap: { x: 0, g: 1, ys: [{ col: 2, fn: 'sum' }], sort: 'label' },
    line: { x: 4, time: 'month', ys: [{ col: -1, fn: 'count' }] },
    area: { x: 4, time: 'quarter', ys: [{ col: 2, fn: 'sum' }] },
    heatmap: { x: 0, g: 1, ys: [{ col: -1, fn: 'count' }] },
    sankey: { x: 0, g: 1, ys: [{ col: -1, fn: 'count' }], topN: 10 },
    radar: { x: 0, ys: [{ col: 2, fn: 'avg' }, { col: 3, fn: 'avg' }, { col: 2, fn: 'max' }], sort: 'label' }
  };
  Object.entries(cases).forEach(([type, spec]) => {
    const mem = CH.build(type, spec, HEAD, ROWS, IDX, {}), eng = viaEngine(type, spec);
    const norm = o => o.option.series.map(s => ({ n: s.name || '', d: type === 'treemap' ? s.data.map(n => ({ n: n.name, v: n.value, k: (n.children || []).map(c => c.name + '=' + c.value).sort() })) : ['heatmap', 'sankey'].includes(type) ? (s.data || []).concat(s.links || []).map(x => JSON.stringify(x, (k, v) => (k === '_ni' || k === '_li' || typeof v === 'function') ? undefined : v)).sort() : (s.data || s.links) })).sort((a, b) => (a.n < b.n ? -1 : a.n > b.n ? 1 : 0));
    assert.equal(strip(norm(eng)), strip(norm(mem)), type + ': series data');
    if (mem.option.xAxis && mem.option.xAxis.data) assert.deepEqual(plain(eng.option.xAxis.data), plain(mem.option.xAxis.data), type + ': categories');
    if (mem.option.yAxis && !Array.isArray(mem.option.yAxis) && mem.option.yAxis.name) assert.equal(eng.option.yAxis.name, mem.option.yAxis.name, type + ': axis title says the real function and column');
    assert.deepEqual(plain(eng.caption), plain(mem.caption), type + ': same plain-language caption');
  });
});

test('the engine path labels the calculation correctly (average, not total)', () => {
  const o = viaEngine('column', { x: 0, ys: [{ col: 2, fn: 'avg' }], sort: 'label' });
  assert.match(o.option.yAxis.name, /Average — राशि/);
  const g = viaEngine('gauge', { ys: [{ col: 2, fn: 'avg' }] });
  assert.match(g.ctx.kpi.label, /Average — राशि/);
  const mem = CH.build('gauge', { ys: [{ col: 2, fn: 'avg' }] }, HEAD, ROWS, IDX, {});
  assert.equal(g.ctx.kpi.value, mem.ctx.kpi.value);
  const c = viaEngine('column', { x: 0, ys: [{ col: -1, fn: 'count' }], sort: 'label' });
  assert.equal(c.option.yAxis.name, 'Rows');
  const cal = viaEngine('calendar', { x: 4, ys: [{ col: -1, fn: 'count' }] }), calMem = CH.build('calendar', { x: 4, ys: [{ col: -1, fn: 'count' }] }, HEAD, ROWS, IDX, {});
  assert.equal(strip(cal.option.series.map(s => s.data)), strip(calMem.option.series.map(s => s.data)));
});

test('the question asked of the engine is sized to the chart', () => {
  const p = (type, spec) => BC.plan(type, spec, HEAD).req;
  assert.equal(p('heatmap', { x: 0, g: 1, ys: [{ col: -1, fn: 'count' }] }).maxCats, 25);
  assert.equal(p('column', { x: 0, ys: [{ col: 2, fn: 'sum' }], topN: 8 }).maxCats, 8);
  assert.equal(p('line', { x: 4, time: 'month', ys: [{ col: 2, fn: 'sum' }] }).rank, 'label');
  assert.equal(p('calendar', { x: 4, ys: [{ col: -1, fn: 'count' }] }).time, 'day');
  const g = p('gauge', { x: 0, ys: [{ col: 2, fn: 'sum' }] }); assert.equal(g.x, -1); assert.equal(g.g, -1);
  const s = p('sankey', { x: 0, g: 1, g2: 4, ys: [{ col: 2, fn: 'avg' }], topN: 5 }); assert.equal(s.measures[0].fn, 'sum'); assert.equal(s.g2, 4); assert.equal(s.maxCats, 5);
  assert.equal(p('pie', { x: 0, ys: [{ col: 2, fn: 'sum' }, { col: 3, fn: 'sum' }] }).measures.length, 1, 'one measure for a pie');
  assert.equal(p('column', { x: 0, g: 1, ys: [{ col: 2, fn: 'sum' }, { col: 3, fn: 'avg' }] }).g, -1, 'no split with two measures');
});

test('clicks on the chart become filters for the large file', () => {
  const spec = { x: 0, ys: [{ col: -1, fn: 'count' }], sort: 'label' }, out = viaEngine('column', spec);
  const d = BC.selection('column', spec, out, { dataIndex: 2, seriesIndex: 0 });
  assert.equal(d.filters.length, 1); assert.deepEqual(plain([d.filters[0].col, d.filters[0].op, d.filters[0].value]), [0, 'ieq', out.data.cats[2].label]);
  const two = BC.combine(spec, d, BC.selection('column', spec, out, { dataIndex: 0, seriesIndex: 0 }));
  assert.equal(two.filters[0].op, 'iin'); assert.equal(two.filters[0].value.length, 2); assert.equal(two.xkeys.length, 2);
  const stacked = { x: 0, g: 1, ys: [{ col: -1, fn: 'count' }], sort: 'label' }, so = viaEngine('stackedColumn', stacked);
  const sd = BC.selection('stackedColumn', stacked, so, { dataIndex: 1, seriesIndex: 1 });
  assert.deepEqual(plain(sd.filters.map(f => f.col)), [0, 1], 'a stacked segment filters both columns');
  const mo = { x: 4, time: 'month', ys: [{ col: -1, fn: 'count' }] }, mout = viaEngine('line', mo);
  const md = BC.selection('line', mo, mout, { dataIndex: 3, seriesIndex: 0 });
  assert.deepEqual(plain([md.filters[0].op, md.filters[0].value, md.filters[0].value2]), ['bucket', 'month', mout.data.cats[3].label]);
  const bm = BC.combine(mo, md, BC.selection('line', mo, mout, { dataIndex: 5, seriesIndex: 0 }));
  assert.equal(bm.filters[0].op, 'bucket'); assert.equal(bm.filters[0].value2.length, 2, 'several months become one filter');
  const hist = viaEngine('column', spec); const h = BC.selection('histogram', { xnum: 2 }, { data: {}, option: {}, ctx: { hist: { edges: [0, 10, 20, 30], counts: [1, 2, 3] } } }, { dataIndex: 1 });
  assert.deepEqual(plain([h.filters[0].op, h.filters[0].value]), ['between', 10]); assert.ok(h.filters[0].value2 < 20 && h.filters[0].value2 > 19.99, 'bins do not overlap');
  const last = BC.selection('histogram', { xnum: 2 }, { data: {}, option: {}, ctx: { hist: { edges: [0, 10, 20, 30], counts: [1, 2, 3] } } }, { dataIndex: 2 });
  assert.equal(last.filters[0].value2, 30, 'the last bin includes its upper edge');
  const others = BC.selection('column', spec, { data: { cats: [{ label: '(Others)', isOthers: true }], series: [] }, option: {} }, { dataIndex: 0 });
  assert.ok(others.others, 'the Others bar cannot be turned into a filter');
  const bl = BC.selection('column', spec, { data: { cats: [{ label: '(blank)' }], series: [] }, option: {} }, { dataIndex: 0 });
  assert.equal(bl.filters[0].op, 'empty');
});

test('a drag over several bars becomes one filter', () => {
  const spec = { x: 0, ys: [{ col: -1, fn: 'count' }], sort: 'label' }, out = viaEngine('column', spec);
  const b = BC.brush('column', spec, out, { batch: [{ selected: [{ dataIndex: [1, 2, 3] }] }] });
  assert.equal(b.filters[0].op, 'iin'); assert.equal(b.filters[0].value.length, 3);
  const sc = BC.brush('scatter', { xnum: 3, ynum: 2 }, { option: { series: [] }, data: {} }, { batch: [{ areas: [{ brushType: 'rect', coordRange: [[20, 40], [5000, 60000]] }], selected: [] }] });
  assert.deepEqual(plain(sc.filters.map(f => [f.col, f.op, f.value, f.value2])), [[3, 'between', 20, 40], [2, 'between', 5000, 60000]]);
  assert.equal(BC.brush('column', spec, out, { batch: [{ selected: [] }] }), null);
});

test('series of a split chart come biggest first, with Others last', () => {
  const o = viaEngine('stackedColumn', { x: 0, g: 1, ys: [{ col: -1, fn: 'count' }], sort: 'label' });
  const totals = o.option.series.map(s => s.data.reduce((a, b) => a + b, 0));
  assert.ok(totals.every((v, i) => i === 0 || v <= totals[i - 1]), totals.join(','));
});
