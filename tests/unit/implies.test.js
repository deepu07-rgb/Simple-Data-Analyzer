// A yes/no column that fully decides the yes/no outcome in one group (everyone "Yes" in "Ever 60+ days late" is also "Yes" in "Ever 30+ days late")
// is the same outcome in another form: it must not head the list of causes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./load');
const ctx = sandbox(['web/js/tasks/29-csv-parse.js', 'web/js/tasks/30-messy-file-fixer.js', 'web/js/tasks/31-merge-anything.js', 'web/js/reports/41-pendency-radar.js', 'web/js/charts/60-chart-engine.js', 'web/js/charts/65-fair-compare.js', 'web/js/charts/66-drivers.js']);
const D = ctx.STL.drivers, CH = ctx.STL.charts;
let seed = 8; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const H = ['Person', 'Ever 30+ days late', 'Ever 60+ days late', 'Gender', 'Housing'];
const rows = Array.from({ length: 4000 }, (_, i) => { const g = rnd() < 0.5 ? 'F' : 'M', late = rnd() < (g === 'M' ? 0.16 : 0.1), late60 = late && rnd() < 0.15; return ['P' + i, late ? 'Yes' : 'No', late60 ? 'Yes' : 'No', g, rnd() < 0.8 ? 'Own' : 'Rent']; });
const idx = rows.map((_, i) => i);
test('the stricter yes/no column is a result of the outcome, gender is still a candidate cause', () => {
  const prof = CH.profile(H, rows, idx);
  const ranked = D.rank(rows, idx, H, 1, { prof: prof, yFn: c => String(c).trim() === '' ? null : (String(c).trim() === 'Yes' ? 1 : 0) });
  const strict = ranked.find(r => r.name === 'Ever 60+ days late'), gender = ranked.find(r => r.name === 'Gender');
  assert.ok(strict && strict.derived && strict.derived.why === 'implies', JSON.stringify(ranked.map(r => [r.name, r.derived])));
  assert.ok(gender && !gender.derived, 'gender is a candidate');
});
