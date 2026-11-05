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

const SI = JSON.parse(fs.readFileSync(__dirname + '/fixtures/standin_fixture.json', 'utf8'));
const SH = ['Waste', 'Group', 'Calories', 'Temperature', 'Farm', 'Tier'], SIDX = SI.rows.map((_, i) => i);
test('a column that only stands in for a stronger one is told apart (checked against statsmodels)', () => {
  const R = D.rank(SI.rows, SIDX, SH, 0, { candidates: [{ col: 1, name: 'Group', kind: 'cat' }, { col: 2, name: 'Calories', kind: 'num' }, { col: 3, name: 'Temperature', kind: 'num' }] });
  const by = Object.fromEntries(R.map(r => [r.name, r]));
  assert.equal(R[0].name, 'Group');
  assert.ok(by.Calories.omega2 > 0.2, 'calories look strong overall (' + by.Calories.omega2 + ')');
  assert.ok(by.Calories.standIn && by.Calories.standIn.name === 'Group', 'calories stand in for the group');
  assert.ok(Math.abs(by.Calories.inside.omega2 - SI.exp.kcal_in_g) < 0.002, 'inside share ≈ statsmodels ' + by.Calories.inside.omega2);
  assert.ok(!by.Temperature.standIn && Math.abs(by.Temperature.inside.omega2 - SI.exp.temp_in_g) < 0.004, 'temperature keeps its own effect ' + by.Temperature.inside.omega2 + ' vs ' + SI.exp.temp_in_g);
  const lines = D.summary(R, 'Waste', false);
  assert.ok(lines.some(l => /“Calories” mostly stands in for “Group”: it explains [\d.]+% overall but only 0(\.\d)?% inside each “Group” group/.test(l)), lines.join('\n'));
  assert.ok(lines.some(l => /^Next: Temperature/.test(l)), 'the stand-in is not listed as the next factor');
  assert.match(D.summary(R, 'Waste', true).join(' '), /मुख्यतः “Group” का प्रतिबिंब है/);
});
test('D.within equals the textbook formula on hand-made cells', () => {
  // z1: x makes no difference; z2: x makes a difference of 2
  const cells = [{ z: 'a', x: 'p', n: 2, sy: 2, syy: 2 }, { z: 'a', x: 'q', n: 2, sy: 2, syy: 2 }, { z: 'b', x: 'p', n: 2, sy: 4, syy: 8 }, { z: 'b', x: 'q', n: 2, sy: 8, syy: 32 }];
  // values a: 1,1,1,1  b-p: 2,2  b-q: 4,4 -> sst = 14 (mean 2.25 ... computed below), ssx = 4, sse = 0
  const w = D.within(cells), all = [1, 1, 1, 1, 2, 2, 4, 4], m = all.reduce((a, b) => a + b) / 8, sst = all.reduce((a, v) => a + (v - m) ** 2, 0);
  assert.ok(Math.abs(w.omega2 - 4 / sst) < 1e-12);
});
test('cuts are made at the roundest number between two values', () => {
  [[9.9, 10, 10], [47.9, 48, 48], [13900, 14000, 14000], [72, 78, 75], [0.137, 0.14, 0.14], [3, 3.4, 3.2], [59.9, 60, 60], [-5, 3, 0]].forEach(([a, b, c]) => assert.equal(D.niceCut(a, b), c, a + '…' + b));
});
test('the rule finder writes a SHORT ordered list (as accurate as scikit-learn, no gaps between rules)', () => {
  const feats = [{ col: 0, name: 'Waste' }, { col: 2, name: 'Calories' }, { col: 3, name: 'Temperature' }, { col: 4, name: 'Farm' }];
  const q = D.findRule(SI.rows, SIDX, 5, feats, { depth: 5, minLeaf: 10 });
  assert.ok(q.accuracy >= SI.exp.tree_acc - 0.003, 'accuracy ' + q.accuracy + ' vs sklearn ' + SI.exp.tree_acc);
  assert.equal(q.n, 3000, 'every row is given a label: rules + "otherwise" cover all rows');
  assert.equal(q.list.reduce((a, r) => a + r.n, 0) + q.otherwise.n, 3000);
  const lines = D.ruleLines(q), text = lines.map(l => (l.label + ': ' + D.lineText(l, false)));
  assert.ok(lines.length <= 4, 'at most 4 lines + otherwise: ' + text.join(' | '));
  assert.equal(q.otherwise.label, 'Standard');
  assert.ok(text.includes('NC: Temperature < 48'), text.join(' | '));
  assert.ok(text.some(t => /^Marginal: /.test(t) && /Waste ≥ 20/.test(t) && /Temperature < 55/.test(t)), text.join(' | '));
  assert.ok(text.some(t => /^Gold: Waste < 10 and .*Farm ≥ 75/.test(t)), text.join(' | '));
  assert.ok(!q.used.includes('Calories'), q.used.join());
  assert.equal(D.findRule(SI.rows.map(r => r.slice(0, 5).concat(['x'])), SIDX, 5, feats), null, 'one class: no rule');
});
test('a big input is learned from a sample that keeps every label, then checked on all rows', () => {
  const feats = [{ col: 0, name: 'Waste' }, { col: 3, name: 'Temperature' }, { col: 4, name: 'Farm' }];
  const q = D.findRule(SI.rows, SIDX, 5, feats, { maxRows: 600, minLeaf: 8 });
  assert.ok(q.sampled && q.learnedOn <= 600 && q.n === 3000, 'learned on ' + q.learnedOn + ', checked on ' + q.n);
  assert.ok(q.list.some(r => r.label === 'Gold'), 'the rare label (4%) is still found');
  assert.ok(q.accuracy > 0.95, 'accuracy on all rows ' + q.accuracy);
  // the engine's check on all rows is copied in as it comes
  D.applyCheck(q, { rules: q.list.map(() => ({ n: 10, right: 9 })), otherwise: { n: 5, right: 5 }, n: 10 * q.list.length + 5, right: 9 * q.list.length + 5 });
  assert.equal(q.n, 10 * q.list.length + 5); assert.equal(q.list[0].right, 9);
});
test('a label found to be a rule is explained in the summary', () => {
  const R = D.rank(SI.rows, SIDX, SH, 0, { candidates: [{ col: 1, name: 'Group', kind: 'cat' }, { col: 5, name: 'Tier', kind: 'cat' }] });
  const t = R.find(r => r.name === 'Tier'); assert.ok(t.walls, 'tier flagged');
  t.rule = D.findRule(SI.rows, SIDX, 5, [{ col: 0, name: 'Waste' }, { col: 3, name: 'Temperature' }, { col: 4, name: 'Farm' }]);
  assert.ok(D.summary(R, 'Waste', false).some(l => /A rule on .*Waste.* reproduces it for 9\d(\.\d)?% of rows/.test(l)));
});
test('stand-in only when almost nothing is left; a real overlap is called "partly through"', () => {
  const mk = (col, w) => ({ col, name: 'c' + col, omega2: w });
  const z = mk(1, 0.39), price = mk(2, 0.175), booking = mk(3, 0.012), cur = mk(4, 0.19), country = mk(5, 0.194);
  const ranked = [z, country, cur, price, booking];
  D.markStandIns(ranked, [{ x: price, z, within: 0.034 }, { x: booking, z, within: 0.003 }, { x: cur, z: country, within: 0 }, { x: country, z, within: 0.18 }]);
  assert.ok(!price.standIn && price.partly && price.partly.omega2 === 0.034, 'price keeps 3.4% of its own: partly, not a stand-in');
  assert.ok(booking.standIn && cur.standIn && !country.standIn && !country.partly);
  // a column that is itself a stand-in never explains another one
  const a = mk(1, 0.4), b = mk(2, 0.38), c = mk(3, 0.05);
  D.markStandIns([a, b, c], [{ x: b, z: a, within: 0.001 }, { x: c, z: b, within: 0 }, { x: c, z: a, within: 0.04 }]);
  assert.ok(b.standIn && !c.standIn && c.inside.name === 'c1');
});
test('an accuracy just under 100% is never shown as 100%', () => {
  assert.equal(D.accText(12994 / 13000), '99.95%'); assert.equal(D.accText(1), '100%'); assert.equal(D.accText(0.9776), '97.8%'); assert.equal(D.accText(0.99999), '99.99%');
});
test('a rule may use a text column ("region is North or East")', () => {
  const R = [], regs = ['North', 'South', 'East', 'West', 'Centre'];
  for (let i = 0; i < 2000; i++) { const reg = regs[i % 5], sc = (i * 7919) % 100; R.push([String(sc), reg, (sc >= 50 && (reg === 'North' || reg === 'East')) ? 'Gold' : 'Plain']); }
  const q = D.findRule(R, R.map((_, i) => i), 2, [{ col: 0, name: 'Score' }, { col: 1, name: 'Region', kind: 'cat' }]);
  assert.equal(q.accuracy, 1, 'exact');
  const t = D.ruleLines(q).map(l => l.label + ': ' + D.lineText(l, false));
  assert.ok(t.length === 1 && /Score ≥ 50/.test(t[0]) && /Region is “(North|East)” or “(North|East)”/.test(t[0]) && q.otherwise.label === 'Plain', t.join(' | '));
  assert.match(D.lineText(D.ruleLines(q)[0], true), /Region = “(North|East)” या/);
});
test('a small group the tree cannot reach is added as an exception ("waste ≥ 30")', () => {
  const R = [];
  for (let i = 0; i < 6000; i++) { const w = (i * 37) % 300 / 10, t = 30 + (i * 53) % 420 / 10; R.push([String(w), String(t), (t < 48 || w >= 29.5) ? 'Bad' : w >= 20 ? 'Fair' : 'Good']); }
  const q = D.findRule(R, R.map((_, i) => i), 2, [{ col: 0, name: 'Waste' }, { col: 1, name: 'Temp' }], { depth: 2 });
  assert.equal(q.accuracy, 1, 'every row right: ' + D.ruleLines(q).map(l => l.label + ': ' + D.lineText(l)).join(' | '));
  assert.ok(D.ruleLines(q).some(l => l.label === 'Bad' && /Waste ≥ 29\.5/.test(D.lineText(l))));
});
test('a text column made of two others is called a summary of them, even when it is the strongest', () => {
  const R = [];
  for (let i = 0; i < 4000; i++) { const a = i % 2, b = Math.floor(i / 2) % 2, u = k => ((i * k) % 1000) / 1000, noise = 2.2 * (u(7919) + u(104729) + u(1299709) - 1.5); R.push([String(1.5 * a + 1.2 * b + noise), a ? 'A1' : 'A0', b ? 'B1' : 'B0', ['none', 'one', 'one', 'both'][a + 2 * b]]); }
  const I = R.map((_, i) => i), r = D.rank(R, I, ['Y', 'A', 'B', 'AB'], 0, { candidates: [{ col: 1, name: 'A', kind: 'cat' }, { col: 2, name: 'B', kind: 'cat' }, { col: 3, name: 'AB', kind: 'cat' }] });
  const ab = r.find(x => x.name === 'AB');
  assert.ok(ab.omega2 > 0.3, 'strong overall ' + ab.omega2);
  assert.ok(ab.standIn && ab.standIn.made && ab.standIn.cols.length === 2 && ab.standIn.omega2 < 0.005, JSON.stringify(ab.standIn));
  assert.ok(!r.find(x => x.name === 'A').standIn && !r.find(x => x.name === 'B').standIn, 'the parts are not called stand-ins for the summary');
  const L = D.summary(r, 'Y', false);
  assert.ok(L.some(l => /“AB” is made of “[AB]” and “[AB]” \(every combination of them has one value of it\)/.test(l)), L.join('\n'));
  assert.match(L[0], /go most with “A”/, 'the headline is a real column, not the summary');
});
