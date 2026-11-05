const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { sandbox } = require('./load');
const ctx = sandbox(['web/js/tasks/30-messy-file-fixer.js', 'web/js/tasks/31-merge-anything.js', 'web/js/reports/41-pendency-radar.js', 'web/js/charts/60-chart-engine.js', 'web/js/charts/66-drivers.js']);
const D = ctx.STL.drivers, CH = ctx.STL.charts, plain = x => JSON.parse(JSON.stringify(x));
const FX = JSON.parse(fs.readFileSync(__dirname + '/fixtures/fair_fixture.json', 'utf8'));
const rows = FX.rows.map(r => [String(r[0]), r[1], r[2], r[3]]), IDX = rows.map((_, i) => i), HEAD = ['Rating', 'Delivery', 'Price range', 'City'];

test('ω² and η² equal the textbook values computed in Python', () => {
  const R = D.rank(rows, IDX, HEAD, 0, { candidates: [{ col: 1, name: 'Delivery', kind: 'cat' }, { col: 2, name: 'Price range', kind: 'cat' }, { col: 3, name: 'City', kind: 'cat' }] });
  const by = Object.fromEntries(R.map(r => [r.name, r]));
  [['Delivery', 'f'], ['Price range', 'price'], ['City', 'city']].forEach(([n, k]) => { assert.ok(Math.abs(by[n].omega2 - FX.omega[k][0]) < 1e-9, n + ' ω²'); assert.ok(Math.abs(by[n].eta2 - FX.omega[k][1]) < 1e-9, n + ' η²'); });
  assert.equal(R[0].name, 'Price range', 'price range explains the rating most');
  assert.ok(R[0].high.mean > R[0].low.mean && R[0].low.label === '1' && R[0].high.label === '4');
});
test('number columns take part in five equal-count bands', () => {
  const r2 = rows.map((r, i) => r.concat([String((i * 37) % 1000)]));
  const R = D.rank(r2, IDX, HEAD.concat(['Noise']), 0, { candidates: [{ col: 4, name: 'Noise', kind: 'num' }, { col: 2, name: 'Price range', kind: 'cat' }] });
  const n = R.find(r => r.name === 'Noise'); assert.equal(n.k, 5); assert.ok(n.omega2 < 0.005, 'pure noise explains nothing (ω² corrects for chance)');
});
test('columns calculated from the number are set apart as results', () => {
  assert.deepEqual(plain(D.sharesName('waste_adjusted_effective_cost_idr', 'plate_waste_percentage')), ['waste']);
  assert.deepEqual(plain(D.sharesName('primary_food_waste_driver', 'plate_waste_percentage')), ['waste']);
  assert.deepEqual(plain(D.sharesName('beneficiary_category', 'plate_waste_percentage')), []);
  const r2 = rows.map(r => r.concat([String(Math.round(+r[0] * 2) / 2)]));
  const R = D.rank(r2, IDX, HEAD.concat(['Band']), 0, { candidates: [{ col: 4, name: 'Band', kind: 'cat' }, { col: 2, name: 'Price range', kind: 'cat' }] });
  assert.equal(R.find(r => r.name === 'Band').derived.why, 'determines', 'a column that almost fixes the number is a result');
  const lines = D.summary(R, 'Rating', false); assert.ok(lines.some(l => /look calculated from “Rating”.*Band/.test(l)));
  assert.match(lines[0], /go most with “Price range” \(it explains \d+(\.\d)?% of the variation\): from [\d.]+ \(1\) to [\d.]+ \(4\)/);
});
test('Hindi summary and the "nothing explains it" case', () => {
  const R = D.rank(rows, IDX, HEAD, 0, { candidates: [{ col: 2, name: 'Price range', kind: 'cat' }] });
  assert.match(D.summary(R, 'Rating', true)[0], /सबसे अधिक “Price range” से जुड़े हैं/);
  const flat = rows.map((r, i) => ['3', r[1], r[2], r[3]]);
  assert.match(D.summary(D.rank(flat, IDX, HEAD, 0, { candidates: [{ col: 2, name: 'Price range', kind: 'cat' }] }), 'Rating', false)[0], /No column goes clearly/);
});
test('a label given by the number (a tier with hard cut-offs) is warned about, a real group is not', () => {
  const R = [], tierOf = (w, i) => (w < 10 && i % 4 === 1) ? 'Gold' : (w < 20 || i % 5 === 0) ? 'Standard' : 'At risk';   // the tier also needs a second test, so it does not fix the number
  for (let i = 0; i < 3000; i++) { const g = ['A', 'B', 'C'][i % 3], w = Math.max(1, Math.min(37, (g === 'A' ? 16 : 11) + ((i * 7919) % 1000) / 1000 * 16 - 8 + ((i * 104729) % 97) / 97 * 6)); R.push([String(w.toFixed(1)), g, tierOf(w, i)]); }
  const I = R.map((_, i) => i), ranked = D.rank(R, I, ['Waste', 'Group', 'Tier'], 0, { candidates: [{ col: 1, name: 'Group', kind: 'cat' }, { col: 2, name: 'Tier', kind: 'cat' }] });
  const t = ranked.find(r => r.name === 'Tier'), g = ranked.find(r => r.name === 'Group');
  assert.ok(!t.derived && t.walls && t.walls.some(w => w.label === 'Gold' && w.side === 'max' && w.edge <= 10) && t.walls.some(w => w.label === 'At risk' && w.side === 'min' && w.edge >= 20)); assert.ok(!g.walls);
  assert.ok(D.summary(ranked, 'Waste', false).some(l => /“Tier” may be a label given BY “Waste”: every “At risk” row has it ≥ 20, while 9\d% of the other rows lie beyond/.test(l)));
});
