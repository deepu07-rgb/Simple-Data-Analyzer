const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./load');

const ctx = sandbox(['web/js/tasks/30-messy-file-fixer.js', 'web/js/tasks/31-merge-anything.js', 'web/js/reports/41-pendency-radar.js', 'web/js/charts/60-chart-engine.js']);
const CH = ctx.STL.charts;
const plain = x => JSON.parse(JSON.stringify(x));

// a small office dataset: district, station, status, amount, age, registered date
const D = ['जयपुर', 'जोधपुर', 'कोटा', 'अजमेर'], ST = ['लंबित', 'निस्तारित', 'जाँच में'];
function rng(seed) { let x = seed; return () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296; }
const r = rng(7), HEAD = ['क्र', 'जिला', 'स्थिति', 'राशि', 'आयु', 'दिनांक', 'प्रकरण'];
const ROWS = Array.from({ length: 240 }, (_, i) => [String(i + 1), D[i % 4], ST[Math.floor(r() * 3)], String(1000 * (1 + Math.floor(r() * 50))), String(20 + Math.floor(r() * 50)), `2025-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`, 'C' + i]);
const IDX = ROWS.map((_, i) => i);
const sumBy = (col, key) => { const m = {}; ROWS.forEach(x => { m[x[key]] = (m[x[key]] || 0) + +x[col]; }); return m; };

test('number formats: Indian grouping and lakh/crore labels', () => {
  assert.equal(CH.indian(1234567), '12,34,567');
  assert.equal(CH.compact(1250000), '12.5 L');
  assert.equal(CH.compact(32000000), '3.2 Cr');
  assert.equal(CH.compact(1250000, true), '12.5 लाख');
  assert.equal(CH.compact(45000), '45K');
  assert.equal(CH.compact(-250000), '-2.5 L');
});

test('aggregation: totals, averages and counts per category are exact', () => {
  const sums = sumBy(3, 1);
  const p = CH.prepare({ x: 1, ys: [{ col: 3, fn: 'sum' }], sort: 'desc' }, HEAD, ROWS, IDX);
  assert.equal(p.cats.length, 4);
  p.cats.forEach(c => assert.equal(c.values[0], sums[c.label]));
  assert.ok(p.cats[0].total >= p.cats[1].total);                               // sorted high to low
  const cnt = CH.prepare({ x: 1, ys: [{ col: -1, fn: 'count' }] }, HEAD, ROWS, IDX);
  assert.equal(cnt.cats.reduce((a, c) => a + c.values[0], 0), 240);
  const avg = CH.prepare({ x: 1, ys: [{ col: 3, fn: 'avg' }], sort: 'label' }, HEAD, ROWS, IDX);
  const j = avg.cats.find(c => c.label === 'जयपुर'), jrows = ROWS.filter(x => x[1] === 'जयपुर');
  assert.ok(Math.abs(j.values[0] - jrows.reduce((a, x) => a + +x[3], 0) / jrows.length) < 1e-9);
});

test('every bar remembers the raw values behind it (so a click can filter the table)', () => {
  const p = CH.prepare({ x: 1, ys: [{ col: 3, fn: 'sum' }] }, HEAD, ROWS, IDX);
  p.cats.forEach(c => { assert.deepEqual(Object.keys(c.raw), [c.label]); assert.equal(c.rows.length, 60); });
});

test('rows behind each (category, series) cell are kept, also after folding and Top N', () => {
  const p = CH.prepare({ x: 1, g: 2, ys: [{ col: -1, fn: 'count' }] }, HEAD, ROWS, IDX);
  p.cats.forEach(c => { p.seriesKeys.forEach((sk, i) => assert.equal(c.rb[sk].length, c.values[i])); assert.equal(Object.values(c.rb).reduce((a, x) => a + x.length, 0), c.rows.length); });
  const t = CH.prepare({ x: 6, g: 2, ys: [{ col: -1, fn: 'count' }], topN: 5 }, HEAD, ROWS, IDX), o = t.cats[t.cats.length - 1];
  assert.ok(o.isOthers); assert.equal(Object.values(o.rb).reduce((a, x) => a + x.length, 0), o.rows.length);
});

test('Top N merges the rest into "Others" without losing a rupee, and averages stay right', () => {
  const sums = sumBy(3, 6);                                                        // 240 distinct cases
  const p = CH.prepare({ x: 6, ys: [{ col: 3, fn: 'sum' }], sort: 'desc', topN: 10 }, HEAD, ROWS, IDX);
  assert.equal(p.cats.length, 11); assert.ok(p.cats[10].isOthers); assert.equal(p.others.count, 230);
  assert.equal(p.cats.reduce((a, c) => a + c.values[0], 0), ROWS.reduce((a, x) => a + +x[3], 0));
  const av = CH.prepare({ x: 6, ys: [{ col: 3, fn: 'avg' }], sort: 'desc', topN: 10 }, HEAD, ROWS, IDX);
  const rest = av.cats[10], restRows = av.cats[10].rows.map(i => +ROWS[i][3]);
  assert.ok(Math.abs(rest.values[0] - restRows.reduce((a, b) => a + b, 0) / restRows.length) < 1e-9, 'average of the merged rows, not an average of averages');
});

test('splitting by a column gives one series per value, extra groups fold into "(other)"', () => {
  const p = CH.prepare({ x: 1, g: 2, ys: [{ col: -1, fn: 'count' }] }, HEAD, ROWS, IDX);
  assert.equal(p.series.length, 3); assert.equal(p.split, true);
  const folded = CH.prepare({ x: 2, g: 6, ys: [{ col: -1, fn: 'count' }], maxGroups: 5 }, HEAD, ROWS, IDX);
  assert.equal(folded.series.length, 5); assert.equal(folded.series[4].name, '(other)');
  assert.equal(folded.cats.reduce((a, c) => a + c.values.reduce((x, y) => x + y, 0), 0), 240);
});

test('dates: monthly and financial-year buckets, in time order', () => {
  const m = CH.prepare({ x: 5, ys: [{ col: -1, fn: 'count' }], time: 'month', sort: 'label' }, HEAD, ROWS, IDX);
  assert.deepEqual(plain(m.cats.map(c => c.label)), Array.from({ length: 12 }, (_, i) => '2025-' + String(i + 1).padStart(2, '0')));
  const fy = CH.prepare({ x: 5, ys: [{ col: -1, fn: 'count' }], time: 'fy', sort: 'label' }, HEAD, ROWS, IDX);
  assert.deepEqual(plain(fy.cats.map(c => c.label)), ['2024-25', '2025-26']);          // Jan-Mar 2025 belong to FY 2024-25
  assert.equal(fy.cats[0].values[0], ROWS.filter(x => +x[5].slice(5, 7) <= 3).length);
  assert.equal(CH.bucketKey(Date.UTC(2025, 3, 1), 'fy'), '2025-26');
});

test('every chart type builds a valid option from the same data', () => {
  const specs = {
    column: { x: 1, ys: [{ col: 3, fn: 'sum' }] }, bar: { x: 1, ys: [{ col: 3, fn: 'sum' }] }, stackedColumn: { x: 1, g: 2, ys: [{ col: -1, fn: 'count' }] },
    percentColumn: { x: 1, g: 2, ys: [{ col: -1, fn: 'count' }] }, combo: { x: 1, ys: [{ col: 3, fn: 'sum' }, { col: 4, fn: 'avg' }] }, pareto: { x: 6, ys: [{ col: 3, fn: 'sum' }], topN: 15 },
    waterfall: { x: 1, ys: [{ col: 3, fn: 'sum' }] }, line: { x: 5, time: 'month', ys: [{ col: 3, fn: 'sum' }] }, area: { x: 5, time: 'month', ys: [{ col: 3, fn: 'sum' }] },
    stackedArea: { x: 5, time: 'month', g: 1, ys: [{ col: -1, fn: 'count' }] }, calendar: { x: 5, ys: [{ col: -1, fn: 'count' }] }, pie: { x: 1, ys: [{ col: 3, fn: 'sum' }] },
    donut: { x: 1, ys: [{ col: 3, fn: 'sum' }] }, rose: { x: 1, ys: [{ col: 3, fn: 'sum' }] }, funnel: { x: 2, ys: [{ col: -1, fn: 'count' }] }, treemap: { x: 1, g: 2, ys: [{ col: 3, fn: 'sum' }] },
    sunburst: { x: 1, g: 2, ys: [{ col: 3, fn: 'sum' }] }, scatter: { xnum: 3, ynum: 4, trend: true }, bubble: { xnum: 3, ynum: 4, size: 0 }, heatmap: { x: 1, g: 2, ys: [{ col: -1, fn: 'count' }] }, sankey: { x: 1, g: 2, ys: [{ col: -1, fn: 'count' }] },
    radar: { x: 1, ys: [{ col: 3, fn: 'avg' }, { col: 4, fn: 'avg' }, { col: 0, fn: 'max' }] }, histogram: { xnum: 3 }, boxplot: { x: 1, ys: [{ col: 3, fn: 'sum' }] }, gauge: { ys: [{ col: 3, fn: 'sum' }] }
  };
  CH.TYPES.forEach(t => {
    assert.ok(specs[t.id], 'a spec for ' + t.id);
    const out = CH.build(t.id, specs[t.id], HEAD, ROWS, IDX, {});
    const json = JSON.stringify(out.option, (k, v) => typeof v === 'function' ? undefined : v);
    assert.ok(out.option && (out.option.series || out.option.calendar), t.id + ' has series');
    assert.ok(!/NaN|Infinity/.test(json), t.id + ' contains NaN/Infinity: ' + json.match(/.{30}(NaN|Infinity).{10}/));
  });
});

test('structure of the main chart types', () => {
  const col = CH.build('column', { x: 1, ys: [{ col: 3, fn: 'sum' }] }, HEAD, ROWS, IDX, {}).option;
  assert.equal(col.series[0].type, 'bar'); assert.equal(col.xAxis.data.length, 4); assert.ok(col.toolbox.feature.saveAsImage && col.toolbox.feature.dataView);
  const pie = CH.build('donut', { x: 1, ys: [{ col: 3, fn: 'sum' }] }, HEAD, ROWS, IDX, {}).option;
  assert.equal(pie.series[0].type, 'pie'); assert.deepEqual(plain(pie.series[0].radius), ['38%', '58%']);
  assert.equal(pie.series[0].data.reduce((a, d) => a + d.value, 0), ROWS.reduce((a, x) => a + +x[3], 0));
  const many = CH.build('column', { x: 6, ys: [{ col: 3, fn: 'sum' }] }, HEAD, ROWS, IDX, {}).option;
  assert.ok(many.dataZoom && many.dataZoom.length === 2, 'long axes get a zoom slider');
});

test('Pareto: cumulative percentage ends at 100 and the 80% line is drawn', () => {
  const o = CH.build('pareto', { x: 6, ys: [{ col: 3, fn: 'sum' }], topN: 0 }, HEAD, ROWS, IDX, {}).option;
  const cum = o.series[1].data; assert.equal(cum[cum.length - 1], 100); assert.ok(cum.every((v, i) => i === 0 || v >= cum[i - 1]));
  assert.equal(o.series[1].markLine.data[0].yAxis, 80);
});

test('waterfall: invisible base + increases/decreases add up to the final total', () => {
  const rows = [['a', '100'], ['b', '-30'], ['c', '50'], ['d', '-80']], idx = [0, 1, 2, 3];
  const out = CH.build('waterfall', { x: 0, ys: [{ col: 1, fn: 'sum' }], sort: 'label' }, ['k', 'v'], rows, idx, {});
  assert.equal(out.option._waterfall.total, 40);
  const [base, up, down] = out.option.series; assert.deepEqual(plain(up.data.slice(0, 4)), [100, 0, 50, 0]); assert.deepEqual(plain(down.data.slice(0, 4)), [0, 30, 0, 80]);
  assert.deepEqual(plain(base.data.slice(0, 4)), [0, 70, 70, 40]);
});

test('histogram: every row is in exactly one bin; mean and median reported', () => {
  const h = CH.histogram(ROWS.map(x => +x[3]), 0);
  assert.equal(h.counts.reduce((a, b) => a + b, 0), 240); assert.equal(h.edges.length, h.counts.length + 1);
  assert.ok(Math.abs(h.mean - ROWS.reduce((a, x) => a + +x[3], 0) / 240) < 1e-9);
  assert.equal(CH.histogram([5, 5, 5], 0).counts[0], 3);                          // all equal: one bin
  assert.equal(CH.histogram([], 0).n, 0);
});

test('box plot: quartiles of a known list, outliers separated', () => {
  const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100].map(v => ['g', String(v)]);
  const o = CH.build('boxplot', { x: 0, ys: [{ col: 1, fn: 'sum' }] }, ['k', 'v'], rows, rows.map((_, i) => i), {});
  const st = o.ctx.box.stats[0];
  assert.equal(st[2], 5.5); assert.equal(st[1], 3.25); assert.equal(st[3], 7.75); assert.equal(st[4], 9);
  assert.deepEqual(plain(o.ctx.box.outliers), [[0, 100]]);
});

test('regression: perfect line and no relationship', () => {
  const line = CH.regression([[1, 3], [2, 5], [3, 7], [4, 9]].map(v => ({ value: v })));
  assert.ok(Math.abs(line.slope - 2) < 1e-9 && Math.abs(line.intercept - 1) < 1e-9 && Math.abs(line.r - 1) < 1e-9);
  assert.equal(CH.regression([{ value: [1, 1] }]), null);
});

test('scatter keeps the row behind every dot and draws a trend line on request', () => {
  const o = CH.build('scatter', { xnum: 3, ynum: 4, trend: true }, HEAD, ROWS, IDX, {});
  assert.equal(o.ctx.points.length, 240); assert.equal(o.ctx.points[5].ri, 5);
  assert.ok(o.option.series.some(s => s.type === 'line'));
  assert.ok(o.caption[0].includes('240 rows') && /not a cause/.test(o.caption[0]));
});

test('captions use computed numbers; Hindi captions are Hindi', () => {
  const en = CH.build('donut', { x: 1, ys: [{ col: 3, fn: 'sum' }] }, HEAD, ROWS, IDX, {});
  const sums = sumBy(3, 1), best = Object.keys(sums).sort((a, b) => sums[b] - sums[a])[0], tot = Object.values(sums).reduce((a, b) => a + b, 0);
  assert.ok(en.caption[0].includes(best + ' is the largest: ' + CH.indian(sums[best])), en.caption[0]);
  assert.ok(en.caption[0].includes(CH.indian(tot)));
  const hi = CH.build('donut', { x: 1, ys: [{ col: 3, fn: 'sum' }] }, HEAD, ROWS, IDX, { hi: true });
  assert.match(hi.caption[0], /सबसे बड़ा है/);
  const line = CH.build('line', { x: 5, time: 'month', ys: [{ col: 3, fn: 'sum' }] }, HEAD, ROWS, IDX, {});
  assert.match(line.caption[0], /went from .* to .*; peak/);
});

test('recommendations suit the data and skip ID-like columns', () => {
  const rec = CH.recommend(HEAD, ROWS, IDX);
  assert.ok(rec.length >= 5 && rec.length <= 8);
  assert.equal(rec[0].type, 'column');
  const cat = HEAD[rec[0].spec.x];
  assert.ok(['जिला', 'स्थिति'].includes(cat), 'a real category, not the case id: ' + cat);
  const types = rec.map(x => x.type);
  ['scatter', 'histogram'].forEach(t => assert.ok(types.includes(t), t));
  assert.ok(types.some(t => t === 'area' || t === 'line'), 'a trend for the date column');
  rec.forEach(x => { assert.ok(x.why.en && x.why.hi); const o = CH.build(x.type, x.spec, HEAD, ROWS, IDX, {}); assert.ok(o.option); });   // every suggestion actually builds
  assert.ok(!rec.some(x => x.spec.x === 6 || x.spec.x === 0), 'never groups by the unique case number / serial');
  assert.deepEqual(plain(CH.recommend(HEAD, [], [])), []);
});

test('radar caption names the leader on each measure', () => {
  const o = CH.build('radar', { x: 1, ys: [{ col: 3, fn: 'avg' }, { col: 4, fn: 'avg' }, { col: 6, fn: 'avg' }] }, HEAD, ROWS, IDX, { hi: false });
  assert.equal(o.caption.length, 1);
  assert.match(o.caption[0], /Each shape is one जिला\. Highest: राशि — /);
  const h = CH.build('radar', { x: 1, ys: [{ col: 3, fn: 'avg' }, { col: 4, fn: 'avg' }, { col: 6, fn: 'avg' }] }, HEAD, ROWS, IDX, { hi: true });
  assert.match(h.caption[0], /हर आकृति एक जिला है/);
});

test('amounts that are all different are measures, whole-number IDs are not', () => {
  // 40 distinct decimal amounts are a measure; 40 sequential-looking case numbers under an "ID" heading are not
  const rows = Array.from({ length: 40 }, (_, i) => [String(20250000 + i * 7), String(1000.5 + i * 13.25), i % 2 ? 'A' : 'B']);
  const prof = CH.profile(['Case ID', 'Amount', 'Kind'], rows, rows.map((_, i) => i));
  assert.equal(prof[1].numeric, true); assert.equal(prof[1].unique, false);
  assert.equal(prof[0].unique, true);
  const names = CH.profile(['Name'], Array.from({ length: 30 }, (_, i) => ['Person ' + i]), Array.from({ length: 30 }, (_, i) => i));
  assert.equal(names[0].unique, true);
});

test('performance: 100,000 rows, 50 categories', () => {
  const rows = Array.from({ length: 100000 }, (_, i) => ['थाना ' + (i % 50), String(i % 97), String(i)]), idx = rows.map((_, i) => i);
  const t = Date.now(); const out = CH.build('column', { x: 0, ys: [{ col: 1, fn: 'sum' }, { col: 2, fn: 'avg' }] }, ['a', 'b', 'c'], rows, idx, {}); const ms = Date.now() - t;
  assert.equal(out.data.cats.length, 50); assert.ok(ms < 3000, 'took ' + ms);
  const t2 = Date.now(); CH.recommend(['a', 'b', 'c'], rows, idx); console.log('      100,000 rows: column in ' + ms + ' ms, recommendations in ' + (Date.now() - t2) + ' ms');
});

test('Sankey: every flow is exact and remembers its rows', () => {
  const o = CH.build('sankey', { x: 1, g: 2, ys: [{ col: -1, fn: 'count' }] }, HEAD, ROWS, IDX, {}), K = o.ctx.sankey;
  assert.equal(K.total, 240); assert.equal(K.links.reduce((a, l) => a + l.value, 0), 240);
  K.links.forEach(l => {
    assert.equal(l.rows.length, l.value);
    l.rows.forEach(ri => { assert.equal(ROWS[ri][1], K.nodes[l.s].label); assert.equal(ROWS[ri][2], K.nodes[l.t].label); });
  });
  K.nodes.filter(n => n.level === 0).forEach(n => assert.equal(n.value, ROWS.filter(x => x[1] === n.label).length));
  assert.equal(o.option.series[0].type, 'sankey'); assert.equal(o.option.series[0].links.length, K.links.length);
  assert.ok(/biggest flow/.test(o.caption[0]));
  assert.ok(o.option.series[0].data.every(n => /^[01]\|/.test(n.name)), 'same value in two columns stays two nodes');
});

test('Sankey: totals of a measure, three steps, Top N and left-out rows', () => {
  const amt = CH.build('sankey', { x: 1, g: 2, ys: [{ col: 3, fn: 'sum' }] }, HEAD, ROWS, IDX, {}).ctx.sankey;
  assert.equal(amt.total, ROWS.reduce((a, x) => a + +x[3], 0));
  const three = CH.build('sankey', { x: 1, g: 2, g2: 6, ys: [{ col: -1, fn: 'count' }], topN: 3 }, HEAD, ROWS, IDX, {}).ctx.sankey;
  assert.equal(three.levels.length, 3); assert.ok(three.nodes.some(n => n.isOthers), 'the long tail becomes Others');
  assert.equal(three.nodes.filter(n => n.level === 2 && !n.isOthers).length, 3);
  const rows2 = ROWS.map(x => x.slice()); rows2[0][1] = ''; rows2[1][3] = '-500'; rows2[2][3] = 'abc';
  const lo = CH.build('sankey', { x: 1, g: 2, ys: [{ col: 3, fn: 'sum' }] }, HEAD, rows2, IDX, {});
  assert.equal(lo.ctx.sankey.skipped, 3); assert.ok(lo.caption.some(c => /3 rows were left out/.test(c)));
  assert.throws(() => CH.build('sankey', { x: 1, g: 1, ys: [{ col: -1, fn: 'count' }] }, HEAD, ROWS, IDX, {}), /two different/);
});

test('Sankey is recommended for two small category columns', () => {
  const rec = CH.recommend(HEAD, ROWS, IDX, 12);
  assert.ok(rec.some(x => x.type === 'sankey'), rec.map(x => x.type).join(','));
});
