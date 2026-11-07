// Fair comparison of a yes/no outcome ("how often Late = Yes"): the same regression, with the outcome as 100 / 0, equal to statsmodels (HC3);
// the answer is in percent and a gap in percentage points.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { sandbox } = require('./load');
const ctx = sandbox(['web/js/tasks/30-messy-file-fixer.js', 'web/js/tasks/31-merge-anything.js', 'web/js/reports/41-pendency-radar.js', 'web/js/charts/60-chart-engine.js', 'web/js/charts/65-fair-compare.js']);
const F = ctx.STL.fair;
const FX = JSON.parse(fs.readFileSync(__dirname + '/fixtures/fair_yesno_fixture.json', 'utf8')), rows = FX.rows, IDX = rows.map((_, i) => i);
const yFn = c => { const q = String(c).trim(); return q === '' ? null : (q === 'Yes' ? 100 : 0); };
const run = () => { const c = F.cellsFromRows(rows, IDX, { y: 0, factor: 1, adjusters: [2], yFn }); const R = F.analyse(c.cells, ['own', 'inc']); R.pct = true; R.yLabel = 'late = Yes'; return R; };
test('the gap in percentage points, its HC3 error and R² equal statsmodels', () => {
  const R = run(), m = R.main;
  assert.equal(m.level, 'Yes'); assert.equal(R.ref, 'No');
  assert.ok(Math.abs(m.raw.diff - FX.raw) < 1e-9, m.raw.diff + ' vs ' + FX.raw);
  assert.ok(Math.abs(m.adj.diff - FX.beta) < 1e-7, m.adj.diff + ' vs ' + FX.beta);
  assert.ok(Math.abs(m.adj.se - FX.se) < 1e-7, m.adj.se + ' vs ' + FX.se);
  assert.ok(Math.abs(R.r2 - FX.r2) < 1e-9);
  assert.ok(Math.abs(R.groups.find(g => g.level === 'Yes').mean - FX.rateYes) < 1e-9);
});
test('straight-line fit also takes the yes/no outcome', () => {
  const r2 = rows.map((r, i) => [r[0], r[1], r[2], String(i % 7)]); const lin = F.linearFit(r2, IDX, { y: 0, factor: 1, cats: [2], lins: [3], yFn });
  assert.ok(lin && isFinite(lin.levels['Yes'][0]));
});
test('the sentence is in percent and says what was measured', () => {
  const v = F.verdict(run(), false);
  assert.match(v.text, /Measured as: late = Yes \(a percentage\)/);
  assert.match(v.text, /difference is [−+]\d+\.\d+ points/); assert.doesNotMatch(v.text, /\bis [−+]\d+\.\d+\. /);
  const h = F.verdict(run(), true); assert.match(h.text, /माप: late = Yes/); assert.match(h.text, /अंक/);
});
test('a blank outcome is left out, not counted as “no”', () => {
  const r3 = rows.slice(0, 500).map((r, i) => i % 10 === 0 ? ['', r[1], r[2]] : r), c = F.cellsFromRows(r3, r3.map((_, i) => i), { y: 0, factor: 1, adjusters: [2], yFn });
  assert.equal(c.matched, 450);
});
