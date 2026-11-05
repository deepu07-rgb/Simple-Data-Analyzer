const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { sandbox } = require('./load');
const ctx = sandbox(['web/js/tasks/30-messy-file-fixer.js', 'web/js/tasks/31-merge-anything.js', 'web/js/reports/41-pendency-radar.js', 'web/js/charts/60-chart-engine.js', 'web/js/charts/65-fair-compare.js']);
const F = ctx.STL.fair, plain = x => JSON.parse(JSON.stringify(x));
const FX = JSON.parse(fs.readFileSync(__dirname + '/fixtures/fair_fixture.json', 'utf8'));          // made with statsmodels (HC3 robust errors)
const rows = FX.rows.map(r => [String(r[0]), r[1], r[2], r[3]]), IDX = rows.map((_, i) => i);
const run = adj => { const c = F.cellsFromRows(rows, IDX, { y: 0, factor: 1, adjusters: adj }); return { c, R: F.analyse(c.cells, ['Delivery', 'Price', 'City'].slice(0, 1 + adj.length)) }; };

test('regression equals statsmodels: coefficient, HC3 robust standard error, p-value and R²', () => {
  const { R } = run([2, 3]), m = R.main;
  assert.equal(m.level, 'Yes'); assert.equal(R.ref, 'No');
  assert.ok(Math.abs(m.adj.diff - FX.full.beta) < 1e-7, m.adj.diff + ' vs ' + FX.full.beta);
  assert.ok(Math.abs(m.adj.se - FX.full.se) < 1e-7, 'HC3 se ' + m.adj.se + ' vs ' + FX.full.se);
  assert.ok(Math.abs(R.r2 - FX.full.r2) < 1e-9);
  assert.ok(m.adj.p < 1e-6 && Math.abs(Math.log10(m.adj.p) - Math.log10(FX.full.p)) < 0.15, 'p ' + m.adj.p);
  const one = run([2]).R.main.adj;
  assert.ok(Math.abs(one.diff - FX.price_only.beta) < 1e-7 && Math.abs(one.se - FX.price_only.se) < 1e-7, 'one adjuster too');
});
test('raw difference equals the plain averages (Welch test)', () => {
  const m = run([2, 3]).R.main.raw;
  assert.ok(Math.abs(m.diff - FX.raw.diff) < 1e-9); assert.ok(m.p < 1e-20);
});
test('the paradox is detected: raw gap negative, adjusted positive, price named as the cause', () => {
  const { R } = run([2, 3]), v = F.verdict(R, false);
  assert.ok(R.main.raw.diff < -0.2 && R.main.adj.diff > 0.05);
  assert.equal(v.kind, 'reversal'); assert.match(v.title, /REVERSES.*mix effect.*Simpson/); assert.match(v.text, /plain gap is −0\.25.*\+0\.10/);
  assert.equal(R.driver.name, 'Price', 'price explains the reversal, not city');
  assert.match(v.text, /Yes rows are \d+% Price = 1 versus \d+% for No/);
  const hi = F.verdict(R, true); assert.match(hi.title, /सिम्पसन/); assert.match(hi.text, /सीधा अंतर −0\.25/);
  assert.ok(R.strata.length === 4 && R.strata.every(s => s.diff > 0), 'inside every price range delivery is higher');
  assert.ok(R.mix.rows[0].shareMain > R.mix.rows[0].shareRef, 'delivery rows are mostly the cheap ones');
});
test('verdicts: explained, partly explained, holds, hidden, no difference, nothing adjusted', () => {
  const mk = (raw, rp, adj, ap, nAdj = 1) => ({ names: ['F', 'Price'], adjusters: ['Price'], nAdjust: nAdj, ref: 'No', main: { level: 'Yes', n: 100, raw: { diff: raw, p: rp }, adj: { diff: adj, lo: adj - 0.1, hi: adj + 0.1, p: ap } }, driver: { name: 'Price' }, mix: null });
  const k = r => F.verdict(r, false).kind;
  assert.equal(k(mk(0.3, 1e-9, 0.02, 0.4)), 'explained'); assert.equal(k(mk(0.3, 1e-9, 0.1, 1e-4)), 'shrinks');
  assert.equal(k(mk(0.3, 1e-9, 0.28, 1e-8)), 'holds'); assert.equal(k(mk(0.01, 0.6, 0.2, 1e-5)), 'masked');
  assert.equal(k(mk(0.02, 0.5, 0.01, 0.7)), 'none');
  assert.equal(k(mk(-0.09, 1e-9, 0.03, 0.018)), 'weak_explained', 'a flipped gap with borderline evidence is not called chance'); assert.equal(k(mk(0.1, 0.02, 0.09, 0.03)), 'weak'); assert.match(F.verdict(mk(-0.09, 1e-9, 0.03, 0.018), false).text, /p = 0\.018/); assert.equal(k(mk(0.3, 1e-9, 0.3, 1e-9, 0)), 'raw');
  assert.equal(k(mk(-0.3, 1e-9, 0.2, 1e-5)), 'reversal');
  assert.equal(F.verdict({ error: 'factor' }, false).kind, 'error');
});
test('with nothing to adjust for the answer is the plain difference; one-level factor is refused', () => {
  const R = run([]).R; assert.equal(F.verdict(R, false).kind, 'raw');
  const c = F.cellsFromRows(rows.map(r => [r[0], 'Yes', r[2], r[3]]), IDX, { y: 0, factor: 1, adjusters: [2] }); assert.equal(F.analyse(c.cells, ['F', 'P']).error, 'factor');
});
test('zeros can be left out (0 = not rated) and a dependent level does not break the fit', () => {
  const z = rows.map((r, i) => [i % 5 === 0 ? '0' : r[0], r[1], r[2], r[3]]);
  const a = F.cellsFromRows(z, IDX, { y: 0, factor: 1, adjusters: [2], noZero: true }); assert.equal(a.zeroSkipped, 600);
  assert.equal(a.cells.reduce((s, c) => s + c.n, 0), 2400);
  // City perfectly determined by Price in this copy -> collinear dummies; must still fit
  const dep = rows.map(r => [r[0], r[1], r[2], 'C' + r[2]]);
  const R = F.analyse(F.cellsFromRows(dep, IDX, { y: 0, factor: 1, adjusters: [2, 3] }).cells, ['F', 'Price', 'City']);
  assert.ok(R.main.adj && Math.abs(R.main.adj.diff - FX.price_only.beta) < 1e-6, 'redundant levels are set aside');
});
test('three or more groups: every group is compared with the reference', () => {
  const r3 = rows.map((r, i) => [r[0], i % 3 === 0 ? 'A' : r[1] === 'Yes' ? 'B' : 'C', r[2], r[3]]);
  const R = F.analyse(F.cellsFromRows(r3, IDX, { y: 0, factor: 1, adjusters: [2] }).cells, ['G', 'Price']);
  assert.equal(R.levels.length, 2); assert.ok(R.levels.every(l => l.adj && isFinite(l.adj.diff) && isFinite(l.raw.diff)));
});
test('fast on a quarter of a million rows', () => {
  const big = []; for (let i = 0; i < 250000; i++) big.push([String(3 + (i % 7) * 0.1), i % 2 ? 'Yes' : 'No', String(i % 5), String(i % 11)]);
  const t0 = Date.now(), R = F.analyse(F.cellsFromRows(big, big.map((_, i) => i), { y: 0, factor: 1, adjusters: [2, 3] }).cells, ['F', 'A', 'B']);
  assert.ok(R.main.adj && Date.now() - t0 < 3000, 'took ' + (Date.now() - t0));
});
