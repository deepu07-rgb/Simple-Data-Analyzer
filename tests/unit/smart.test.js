// Forecast and clustering: equal to numpy / known truth.
const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./load');
const S = sandbox(['web/js/tasks/43-smart-analysis.js']).STL.smart;
const months = (n, y0 = 2022) => Array.from({ length: n }, (_, i) => (y0 + Math.floor(i / 12)) + '-' + String(i % 12 + 1).padStart(2, '0'));
let seed = 5; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
test('a straight rise is forecast on the line (OLS equals the exact line)', () => {
  const m = months(18), y = m.map((_, i) => 1000 + 50 * i), f = S.forecast(m, y, 3);
  assert.equal(f.model, 'trend'); assert.ok(Math.abs(f.slope - 50) < 1e-9);
  assert.deepEqual(Array.from(f.forecast.map(x => x.month)), ['2023-07', '2023-08', '2023-09']);
  f.forecast.forEach((x, k) => { assert.ok(Math.abs(x.value - (1000 + 50 * (18 + k))) < 1e-6); assert.ok(x.lo <= x.value && x.hi >= x.value); });
});
test('a yearly pattern over 3 years is found: the seasonal model wins and names the peak month', () => {
  const m = months(36), pat = [0, 0, 100, 200, 300, 100, 0, 0, 0, 150, 400, 600], y = m.map((_, i) => 5000 + 20 * i + pat[i % 12] + (rnd() - 0.5) * 20), f = S.forecast(m, y, 6);
  assert.equal(f.model, 'season'); assert.equal(f.peak, 12);
  const next = f.forecast.map(x => x.value); assert.ok(Math.abs(next[0] - (5000 + 20 * 36 + pat[0])) < 120, next[0]);        // January again
  assert.ok(f.backtest.mape < 0.02);
});
test('with fewer than 6 months there is no forecast', () => { assert.equal(S.forecast(months(5), [1, 2, 3, 4, 5]).error, 'few'); });
test('the held-back months pick the model: a level series is forecast flat', () => {
  const m = months(14), y = m.map((_, i) => 1000 + (i % 2 ? 5 : -5)), f = S.forecast(m, y, 2);
  assert.ok(Math.abs(f.forecast[0].value - 1000) < 12, f.forecast[0].value);
});
test('three planted groups are found (k = 3) and every point lands in its own group', () => {
  const C = [[0, 0], [10, 10], [0, 10]], P = [], T = []; C.forEach((c, j) => { for (let i = 0; i < 80; i++) { P.push([c[0] + (rnd() - 0.5) * 2, c[1] + (rnd() - 0.5) * 2]); T.push(j); } });
  const st = S.standardise(P), pick = S.chooseK(st.Z, 1); assert.equal(pick.k, 3); assert.ok(pick.clear && pick.silhouette > 0.7);
  const km = S.kmeans(st.Z, 3, 1), map = {}; km.labels.forEach((l, i) => { (map[T[i]] = map[T[i]] || new Set()).add(l); });
  assert.ok(Object.values(map).every(s => s.size === 1) && new Set(km.labels).size === 3, 'purity');
  const km2 = S.kmeans(st.Z, 3, 1); assert.deepEqual(Array.from(km2.labels), Array.from(km.labels), 'same answer every time');
});
test('no real groups: a single blob is reported as “not clear”', () => { const P = Array.from({ length: 300 }, () => [rnd(), rnd()]); assert.equal(S.chooseK(S.standardise(P).Z, 1).clear, false); });
test('groups are described by where they sit against the whole file', () => {
  const P = [], names = ['price', 'qty']; for (let i = 0; i < 100; i++) P.push([100 + rnd(), 5 + rnd()]); for (let i = 0; i < 100; i++) P.push([10 + rnd(), 50 + rnd()]);
  const st = S.standardise(P), km = S.kmeans(st.Z, 2, 1), d = S.describe(km.labels, 2, P, names, st);
  assert.equal(d.length, 2); const hi = d.find(g => g.features.find(f => f.name === 'price').z > 0); assert.ok(hi.marks.some(m => m.name === 'price' && m.z > 0.5) && hi.marks.some(m => m.name === 'qty' && m.z < -0.5));
});
