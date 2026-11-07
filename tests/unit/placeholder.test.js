// Found with a credit-application file: DAYS_EMPLOYED holds 365243 (≈1,000 years) for 17% of the rows (pensioners). That is a code for
// "not applicable", not a ceiling that hides real values; a genuine cap (45) is still a cap; a month index is never an amount.
const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./load');
const ctx = sandbox(['web/js/tasks/29-csv-parse.js', 'web/js/tasks/30-messy-file-fixer.js', 'web/js/tasks/31-merge-anything.js', 'web/js/reports/41-pendency-radar.js', 'web/js/charts/60-chart-engine.js', 'web/js/charts/65-fair-compare.js', 'web/js/charts/66-drivers.js', 'web/js/charts/67-column-checks.js']);
const CH = ctx.STL.charts, CC = ctx.STL.colChecks;
let seed = 3; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const H = ['ID', 'DAYS_EMPLOYED', 'MARGIN', 'MONTHS_BALANCE', 'AMT_INCOME_TOTAL'];
const rows = Array.from({ length: 6000 }, (_, i) => [String(5000000 + i), i % 6 === 0 ? '365243' : String(-Math.floor(rnd() * 12000) - 1), i % 50 === 0 ? '45' : String(20 + Math.floor(rnd() * 2400) / 100), String(-Math.floor(rnd() * 60)), String(30000 + Math.floor(rnd() * 400) * 1000)]);
const idx = rows.map((_, i) => i), prof = CH.profile(H, rows, idx), caps = CC.caps(rows, idx, H, prof);
test('365243 days employed is a placeholder, not a cap', () => {
  const c = caps.filter(x => x.name === 'DAYS_EMPLOYED'); assert.equal(c.length, 1, JSON.stringify(caps));
  assert.equal(c[0].value, 365243); assert.equal(c[0].placeholder, true);
  assert.match(CC.capText(c[0], false), /code for “not applicable”/); assert.doesNotMatch(CC.capText(c[0], false), /stops at/);
});
test('a real ceiling inside the range stays a cap', () => { const c = caps.filter(x => x.name === 'MARGIN'); assert.equal(c.length, 1); assert.equal(c[0].value, 45); assert.ok(!c[0].placeholder, JSON.stringify(c)); assert.match(CC.capText(c[0], false), /stops at 45/); });
test('a month index (MONTHS_BALANCE 0, -1, -2 …) is not a measure to add up or explain', () => {
  assert.ok(prof[3].tidx, 'recognised as a position in time'); assert.ok(!CH.isMeasure(prof[3])); assert.equal(CH.fnFor(prof[3]), 'avg');
});
test('an income per person is averaged by group, not added up', () => { assert.equal(CH.fnFor(prof[4]), 'avg'); });
test('days since birth / employed are real attributes (candidates to explain something) but are averaged, never added up', () => {
  const p = CH.profile(['DAYS_BIRTH', 'DAYS_EMPLOYED'], rows.map((r, i) => [String(-9000 - (i * 7919) % 12000), r[1]]), idx);
  assert.ok(!p[0].tidx && CH.isMeasure(p[0])); assert.equal(CH.fnFor(p[0]), 'avg');
});
