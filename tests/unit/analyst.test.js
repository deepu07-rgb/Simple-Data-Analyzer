const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./load');
const ctx = sandbox(['web/js/tasks/30-messy-file-fixer.js', 'web/js/tasks/31-merge-anything.js', 'web/js/reports/41-pendency-radar.js', 'web/js/charts/60-chart-engine.js']);
const CH = ctx.STL.charts, plain = x => JSON.parse(JSON.stringify(x));

// a restaurant-style register: an ID, codes, coordinates, a 1-4 price range, a rating where 0 means "not rated", the rating in words, and a LIST column
function rng(seed) { let x = seed; return () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296; }
const r = rng(3), CITY = ['New Delhi', 'Gurgaon', 'Noida', 'Pune', 'Goa', 'Kolkata'], CUIS = ['North Indian', 'Chinese', 'Italian', 'Cafe', 'Desserts', 'Fast Food', 'Seafood'];
const HEAD = ['Restaurant ID', 'Name', 'Country Code', 'City', 'Longitude', 'Latitude', 'Cuisines', 'Average Cost for two', 'Price range', 'Aggregate rating', 'Rating text', 'Votes'];
const rows = [];
for (let i = 0; i < 600; i++) {
  const city = CITY[Math.floor(r() * 6)], pr = 1 + Math.floor(r() * 4), cu = [...new Set([CUIS[Math.floor(r() * 7)], CUIS[Math.floor(r() * 7)]])].join(', ');
  const unrated = r() < 0.22, rating = unrated ? 0 : Math.round((2.2 + pr * 0.35 + r() * 1.3) * 10) / 10, text = rating === 0 ? 'Not rated' : rating >= 4.5 ? 'Excellent' : rating >= 4 ? 'Very Good' : rating >= 3.5 ? 'Good' : rating >= 2.5 ? 'Average' : 'Poor';
  rows.push([String(6300000 + i * 7 + Math.floor(r() * 5)), 'Place ' + i, String(1 + (i % 3 === 0 ? 215 : 0)), city, String(77 + r()), String(28 + r()), cu, String(pr * 300 + Math.floor(r() * 200)), String(pr), String(rating), text, String(unrated ? 0 : Math.floor(r() * r() * 900))]);
}
const IDX = rows.map((_, i) => i);

test('profile: IDs, codes, coordinates, short whole-number lists and list columns are recognised', () => {
  const p = CH.profile(HEAD, rows, IDX), by = n => p.filter(x => x.name === n)[0];
  assert.ok(by('Restaurant ID').unique || by('Restaurant ID').idLike, 'an ID column is not a measure');
  assert.ok(by('Longitude').coord && by('Latitude').coord);
  assert.ok(by('Price range').lowInt, 'price range 1-4 is a label');
  assert.ok(by('Country Code').lowInt && by('Country Code').code);
  assert.ok(by('Cuisines').list, 'comma-separated tags are a list');
  assert.ok(by('Aggregate rating').score && by('Aggregate rating').zeroPct > 0.15, 'a rating column with many zeros is flagged');
  assert.ok(!by('Name').list && !by('Cuisines').numeric);
});

test('suggestions: average rating (not a sum), no IDs or coordinates, derived text columns skipped', () => {
  const rec = CH.recommend(HEAD, rows, IDX, 12), names = o => JSON.stringify(o.spec);
  const first = rec[0]; assert.equal(first.type, 'column'); assert.notEqual(HEAD[first.spec.x], 'Country Code', 'a city beats a bare code number as the first grouping'); assert.equal(first.spec.ys[0].fn, 'avg', 'ratings are averaged, never summed');
  assert.equal(HEAD[first.spec.ys[0].col], 'Aggregate rating'); assert.equal(first.spec.noZero, true, '0 means not rated');
  assert.equal(HEAD[first.spec.x], 'City');
  rec.forEach(x => { const cols = [x.spec.x, x.spec.g, x.spec.xnum, x.spec.ynum].concat((x.spec.ys || []).map(y => y.col)).filter(c => c >= 0); cols.forEach(c => assert.ok(!['Restaurant ID', 'Longitude', 'Latitude', 'Name'].includes(HEAD[c]), 'suggestion uses ' + HEAD[c])); });
  assert.ok(!rec.some(x => HEAD[x.spec.x] === 'Rating text' || HEAD[x.spec.g] === 'Rating text'), 'the rating in words is not a separate finding');
  assert.ok(rec.some(x => x.spec.multi && HEAD[x.spec.x] === 'Cuisines'), 'the list column gets its own charts');
  assert.ok(rec.some(x => x.type === 'histogram' && HEAD[x.spec.xnum] === 'Aggregate rating'));
});

test('0 as "not rated": averages ignore zeros, counts do not, and the chart says how many were left out', () => {
  const zeros = rows.filter(x => x[9] === '0').length, rated = rows.filter(x => +x[9] > 0);
  const naive = CH.build('column', { x: 3, ys: [{ col: 9, fn: 'avg' }], sort: 'label' }, HEAD, rows, IDX, {});
  const fixed = CH.build('column', { x: 3, ys: [{ col: 9, fn: 'avg' }], sort: 'label', noZero: true }, HEAD, rows, IDX, {});
  const want = c => { const v = rated.filter(x => x[3] === c).map(x => +x[9]); return v.reduce((a, b) => a + b, 0) / v.length; };
  fixed.data.cats.forEach(c => assert.ok(Math.abs(c.values[0] - want(c.label)) < 1e-9, c.label));
  assert.ok(naive.data.cats.every((c, i) => c.values[0] < fixed.data.cats[i].values[0]), 'zeros drag every average down');
  assert.equal(fixed.data.zeroSkipped, zeros); assert.ok(fixed.caption.some(t => t.includes(String(zeros)) && /not rated/.test(t)));
  const cnt = CH.build('column', { x: 3, ys: [{ col: -1, fn: 'count' }], sort: 'label', noZero: true }, HEAD, rows, IDX, {});
  assert.equal(cnt.data.cats.reduce((a, c) => a + c.values[0], 0), 600, 'counting still counts every row');
  const h = CH.build('histogram', { xnum: 9, noZero: true }, HEAD, rows, IDX, {}); assert.equal(h.ctx.hist.n, rated.length); assert.equal(h.data.zeroSkipped, zeros);
  const sc = CH.build('scatter', { xnum: 9, ynum: 11, noZero: true }, HEAD, rows, IDX, {}); assert.ok(sc.ctx.points.every(p => p.value[0] > 0 && p.value[1] > 0));
});

test('list columns: each item is counted separately and a click can find the rows', () => {
  const o = CH.build('bar', { x: 6, multi: true, ys: [{ col: -1, fn: 'count' }], sort: 'label' }, HEAD, rows, IDX, {});
  CUIS.forEach(c => { const want = rows.filter(x => x[6].split(',').map(s => s.trim()).includes(c)).length, got = o.data.cats.filter(k => k.label === c)[0]; assert.equal(got.values[0], want, c); assert.equal(got.rows.length, want); got.rows.forEach(ri => assert.ok(rows[ri][6].includes(c))); });
  assert.ok(o.data.multi && o.caption.some(t => /counted under every item/.test(t)));
  assert.ok(o.data.cats.reduce((a, c) => a + c.values[0], 0) > 600, 'bars add up to more than the rows');
  const noSplit = CH.build('bar', { x: 6, ys: [{ col: -1, fn: 'count' }] }, HEAD, rows, IDX, {}); assert.ok(noSplit.data.cats.length > 7, 'without splitting, every combination is its own bar');
});

test('small groups: averages of a handful of rows are hidden and the caption says so', () => {
  const all = CH.build('bar', { x: 6, multi: true, ys: [{ col: 9, fn: 'avg' }], sort: 'desc', noZero: true }, HEAD, rows, IDX, {});
  const sizes = all.data.cats.map(c => c.rows.filter(ri => +rows[ri][9] > 0).length).sort((a, b) => a - b), cut = sizes[3];     // keep the bigger half
  const o = CH.build('bar', { x: 6, multi: true, ys: [{ col: 9, fn: 'avg' }], sort: 'desc', noZero: true, minRows: cut }, HEAD, rows, IDX, {});
  const ratedIn = c => c.rows.filter(ri => +rows[ri][9] > 0).length;
  assert.ok(o.data.cats.every(c => ratedIn(c) >= cut), 'size means rows that carry a rating'); assert.ok(o.data.hiddenSmall > 0 && o.data.cats.length < all.data.cats.length);
  const tiny = CH.build('column', { x: 3, ys: [{ col: 9, fn: 'avg' }], minRows: 100000 }, HEAD, rows, IDX, {}); assert.equal(tiny.data.cats.length, 6, 'if nothing would be left, nothing is hidden');
  const rated = c => rows.filter(x => x[3] === c && +x[9] > 0).length, mid = ['New Delhi', 'Gurgaon', 'Noida', 'Pune', 'Goa', 'Kolkata'].map(rated).sort((a, b) => a - b)[2];
  const some = CH.build('column', { x: 3, ys: [{ col: 9, fn: 'avg' }], minRows: mid, noZero: true }, HEAD, rows, IDX, {});
  assert.ok(some.data.cats.every(c => rated(c.label) >= mid) && some.data.cats.length < 6 && some.data.hiddenSmall > 0);
});

test('list-column captions give the share of ROWS that have the item, not of item mentions; histogram labels do not collide', () => {
  const o = CH.build('bar', { x: 6, multi: true, ys: [{ col: -1, fn: 'count' }], sort: 'desc' }, HEAD, rows, IDX, {});
  const top = o.data.cats[0], pct = Math.round(top.rows.length / 600 * 100);
  assert.ok(o.caption[0].includes('appears in ' + top.rows.length + ' of 600 rows (' + pct + '%)'), o.caption[0]);
  const h = CH.build('histogram', { xnum: 9, noZero: true }, HEAD, rows, IDX, {}), md = h.option.series[0].markLine.data;
  assert.equal(md.length, 2); assert.notDeepEqual(plain(md[0].label.offset), plain(md[1].label.offset), 'mean and median labels sit at different heights');
});

test('captions never add averages together; histogram lines and bar labels show real values', () => {
  const o = CH.build('column', { x: 8, g: 6, ys: [{ col: 9, fn: 'avg' }], noZero: true, sort: 'natural', maxGroups: 3 }, HEAD, rows, IDX, {});
  const cap = o.caption[0];
  assert.match(cap, /^Highest average: .+ in .+ \(\d\.\d+\)/, cap);
  const best = Math.max.apply(null, o.data.cats.map(c => Math.max.apply(null, c.values.filter(v => v !== null))));
  assert.ok(Math.abs(parseFloat(/\((\d[\d.]*)\)/.exec(cap)[1]) - Math.round(best * 100) / 100) < 1e-9, 'it names the single highest bar, not a sum');
  const h = CH.build('histogram', { xnum: 9, noZero: true }, HEAD, rows, IDX, {}), md = h.option.series[0].markLine.data;
  assert.equal(md[0].label.formatter(), 'mean ' + String(Math.round(h.ctx.hist.mean * 100) / 100)); assert.equal(md[1].label.formatter(), 'median ' + String(Math.round(h.ctx.hist.median * 100) / 100));
  const lab = CH.build('column', { x: 8, ys: [{ col: 9, fn: 'avg' }], noZero: true, labels: true, sort: 'natural' }, HEAD, rows, IDX, {}).option.series[0].label.formatter;
  assert.equal(lab({ value: 3.239 }), '3.24'); assert.equal(lab({ value: 250000 }), '2.5 L'); assert.equal(lab({ value: 42 }), '42');
});

test('number bands on the category axis and "% of rows where…" measures', () => {
  const o = CH.build('column', { x: 11, bands: 5, ys: [{ col: 9, fn: 'avg' }], noZero: true }, HEAD, rows, IDX, {});
  const b = o.data.bands; assert.ok(b && b.n >= 4 && b.n <= 7, 'about 5 round bands');
  assert.deepEqual(plain(o.data.cats.map(c => c.label)), plain(b.labels.filter(l => o.data.cats.some(c => c.label === l))), 'bands in their natural order');
  o.data.cats.forEach(c => c.rows.forEach(ri => { const v = +rows[ri][11], i = b.labels.indexOf(c.label); assert.ok(v >= b.edges[i] && (v < b.edges[i + 1] || i === b.n - 1)); }));
  assert.equal(o.data.cats.reduce((a, c) => a + c.rows.length, 0), 600);
  const p = CH.build('column', { x: 3, ys: [{ col: 9, fn: 'pct', op: '>=', value: 4 }], sort: 'label' }, HEAD, rows, IDX, {});
  p.data.cats.forEach(c => { const v = rows.filter(r => r[3] === c.label).map(r => +r[9]); assert.ok(Math.abs(c.values[0] - v.filter(x => x >= 4).length / v.length * 100) < 1e-9, c.label); });
  assert.equal(p.data.series[0].name, '% Aggregate rating ≥ 4'); assert.equal(p.option.yAxis.name, '% Aggregate rating ≥ 4');
  const t = CH.build('column', { x: 3, ys: [{ col: 10, fn: 'pct', op: '=', value: 'not rated' }], sort: 'label' }, HEAD, rows, IDX, {});
  t.data.cats.forEach(c => { const v = rows.filter(r => r[3] === c.label); assert.ok(Math.abs(c.values[0] - v.filter(r => r[10] === 'Not rated').length / v.length * 100) < 1e-9); });
  assert.deepEqual(plain(CH.makeBands(30.2, 71.9, 6).edges), [30, 40, 50, 60, 70, 80]);
});
