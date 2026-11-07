// Found by auditing the 50,000-row student file: AI hours cost grades only for people who use AI for direct answers.
// Ranking one column at a time hides that; "It depends on …" finds it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./load');
const ctx = sandbox(['web/js/tasks/28-lexicon.js', 'web/js/tasks/29-csv-parse.js', 'web/js/tasks/30-messy-file-fixer.js', 'web/js/tasks/31-merge-anything.js', 'web/js/reports/41-pendency-radar.js', 'web/js/charts/60-chart-engine.js', 'web/js/charts/65-fair-compare.js', 'web/js/charts/66-drivers.js']);
const CH = ctx.STL.charts, D = ctx.STL.drivers;
let seed = 21; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }, norm = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const H = ['Use', 'Hours', 'Year', 'Gain'];
const build = interact => Array.from({ length: 6000 }, (_, i) => { const use = ['Debug', 'Draft', 'Direct', 'Idea'][i % 4], h = 40 * rnd() ** 1.5, yr = ['Fresh', 'Soph', 'Junior'][(i * 7) % 3]; const gain = 0.2 + 0.05 * (yr === 'Junior') + (interact && use === 'Direct' && h > 15 ? -0.02 * (h - 15) : 0) + 0.1 * norm(); return [use, h.toFixed(2), yr, gain.toFixed(3)]; });
const run = rows => { const idx = rows.map((_, i) => i), prof = CH.profile(H, rows, idx), R = D.rank(rows, idx, H, 3, { prof }); return { R, I: D.interactions(rows, idx, 3, R) }; };
test('a pair that matters only together is found, with the group that stands out', () => {
  const { I } = run(build(true)); assert.ok(I.length >= 1, 'found'); const it = I[0]; assert.deepEqual([it.nameA, it.nameB].sort(), ['Hours', 'Use']);
  assert.ok(it.extra > 0.1, 'extra ' + it.extra); assert.equal(it.odd.a === 'Direct' || it.odd.b === 'Direct', true); assert.ok(it.odd.mean < it.odd.expected - 0.1);
  assert.match(D.interText(it, 'Gain', false), /matters depends on/); assert.match(D.interText(it, 'Gain', true), /निर्भर/);
});
test('purely additive effects are not reported as a dependence', () => { assert.equal(run(build(false)).I.length, 0); });
test('a narrow group that changes a lot is reported even when the overall share is small', () => {
  const rows = Array.from({ length: 8000 }, (_, i) => { const pol = ['Open', 'Ban'][i % 2], h = 40 * rnd(), band = h > 12 && h < 18; return [pol, h.toFixed(2), 'x', ((band && pol === 'Ban' ? 0.6 : 0.3) + 0.05 * norm()).toFixed(3)]; });
  const idx = rows.map((_, i) => i), prof = CH.profile(H, rows, idx), R = D.rank(rows, idx, H, 3, { prof }), I = D.interactions(rows, idx, 3, R);
  assert.ok(I.length >= 1 && I.some(x => [x.nameA, x.nameB].sort().join() === 'Hours,Use'), JSON.stringify(I.map(x => [x.nameA, x.nameB, x.extra])));
});
