const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./load');

const ctx = sandbox(['web/js/tasks/30-messy-file-fixer.js', 'web/js/tasks/31-merge-anything.js', 'web/js/reports/42-change-radar.js', 'web/js/reports/43-report-autopilot.js']);
const A = ctx.STL.auto;
const plain = x => JSON.parse(JSON.stringify(x));

// ---------------------------------------------------------------- a small, deterministic office
const rd = (x, d) => { const a = Math.abs(x); return Math.sign(x || 1) * Number(Math.round(Number(String(a) + 'e' + d)) + 'e-' + d); };
const STATIONS = ['कोतवाली', 'सांगानेर', 'मानसरोवर', 'बगरू', 'चौमू', 'शाहपुरा', 'आमेर', 'विराटनगर'];
const STATUS = ['लंबित', 'निस्तारित', 'जाँच में'];
function rng(seed) { let x = seed; return () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296; }
function month(seed, opts = {}) {
  const r = rng(seed), rows = [], stations = opts.stations || STATIONS;
  stations.forEach(st => {
    const n = 3 + Math.floor(r() * 9);
    for (let i = 0; i < n; i++) rows.push([st, STATUS[Math.floor(r() * 3)], String(1000 * (1 + Math.floor(r() * 90))), 'C' + rows.length]);
  });
  return rows;
}
const HEAD = ['थाना', 'स्थिति', 'राशि', 'प्रकरण'];

// the expected proforma, computed here independently of the engine
function proforma(rows, stations = STATIONS) {
  const out = [['राजस्थान पुलिस — मासिक प्रगति प्रतिवेदन', null, null, null, null, null, null, null, null], [null, null, null, null, null, null, null, null, null],
    ['क्र.सं.', 'थाना', 'दर्ज', 'लंबित', 'निस्तारित', 'राशि', 'औसत राशि', 'लंबित %', 'शेष']];
  const agg = st => { const rs = rows.filter(x => x[0] === st); const n = rs.length, p = rs.filter(x => x[1] === 'लंबित').length, d = rs.filter(x => x[1] === 'निस्तारित').length, sum = rs.reduce((a, x) => a + +x[2], 0);
    return { n, p, d, sum, avg: n ? sum / n : 0 }; };
  let tn = 0, tp = 0, td = 0, tsum = 0;
  stations.forEach((st, i) => { const a = agg(st); tn += a.n; tp += a.p; td += a.d; tsum += a.sum;
    out.push([i + 1, st, a.n, a.p, a.d, a.sum, rd(a.avg, 2), rd(a.p / a.n * 100, 1), a.n - a.d]); });
  const all = rows.filter(x => stations.includes(x[0]));
  out.push([null, 'कुल', tn, tp, td, tsum, rd(tsum / all.length, 2), rd(tp / tn * 100, 1), tn - td]);
  return out;
}

const M1 = month(11), M2 = month(22);
const TEMPLATE = { rows: proforma(M1), formulas: [] };
const learned = A.learn(TEMPLATE, { headers: HEAD, rows: M1 });
const byHeader = Object.fromEntries(learned.cols.map(c => [c.header, c]));

test('learns where the labels are and which data column they belong to', () => {
  assert.equal(learned.ok, true);
  assert.equal(learned.group.name, 'थाना');
  assert.equal(learned.labelCol, 1);
  assert.equal(learned.rows.length, 8);
  assert.equal(learned.totalRow, 11);
});

test('learns the calculation behind every column, with descriptions', () => {
  assert.equal(byHeader['दर्ज'].rule.type, 'count');
  assert.equal(byHeader['दर्ज'].rule.filter, undefined);
  assert.deepEqual(plain(byHeader['लंबित'].rule), { type: 'count', filter: { col: 1, colName: 'स्थिति', value: 'लंबित' }, complexity: 3 });
  assert.equal(byHeader['निस्तारित'].rule.filter.value, 'निस्तारित');
  assert.deepEqual([byHeader['राशि'].rule.type, byHeader['राशि'].rule.colName], ['sum', 'राशि']);
  assert.deepEqual([byHeader['औसत राशि'].rule.type, byHeader['औसत राशि'].rule.colName], ['avg', 'राशि']);
  assert.deepEqual([byHeader['लंबित %'].rule.type, byHeader['लंबित %'].rule.op, byHeader['लंबित %'].rule.aName, byHeader['लंबित %'].rule.bName], ['derived', 'pct', 'लंबित', 'दर्ज']);
  assert.deepEqual([byHeader['शेष'].rule.type, byHeader['शेष'].rule.op], ['derived', 'sub']);
  assert.match(byHeader['लंबित'].desc.en, /Number of rows where स्थिति = लंबित, for each थाना/);
  assert.match(byHeader['लंबित'].desc.hi, /पंक्तियों की संख्या जहाँ स्थिति = लंबित/);
});

test('every learned rule reproduces last month\'s cells (proof), serial numbers are ignored quietly', () => {
  learned.cols.filter(c => c.rule).forEach(c => assert.equal(c.matched, c.of, c.header));
  assert.ok(byHeader['क्र.सं.'].serial);
  assert.deepEqual(plain(learned.unmatched), []);
});

test('total row: sums for counts and amounts, overall for the average, derived for the percentage', () => {
  assert.equal(byHeader['दर्ज'].total.type, 'sum');
  assert.equal(byHeader['राशि'].total.type, 'sum');
  assert.equal(byHeader['औसत राशि'].total.type, 'overall');
  assert.equal(byHeader['लंबित %'].total.type, 'derived');
});

test('filling next month: every cell equals an independent calculation, including totals', () => {
  const r = A.apply(learned, { headers: HEAD, rows: M2 }, TEMPLATE);
  assert.equal(r.ok, true);
  const want = proforma(M2);
  r.values.forEach(v => assert.equal(v.value, want[v.r][v.c], `r${v.r} c${v.c} (${v.column} / ${v.group}): got ${v.value} want ${want[v.r][v.c]}`));
  assert.equal(r.values.length, 8 * 7 + 7);                              // 7 learned columns x (8 rows + total)
  const d = r.values.find(v => v.group === 'कोतवाली' && v.column === 'दर्ज');
  assert.equal(d.old, TEMPLATE.rows[3][2]);
  assert.equal(d.delta, d.value - d.old);
});

test('next month\'s file may name its columns differently', () => {
  const rows = M2.map(x => x.slice());
  const r = A.apply(learned, { headers: ['Police Station', 'Status', 'Amount', 'Case No'], rows }, TEMPLATE);
  assert.equal(r.ok, true);
  const want = proforma(M2);
  assert.ok(r.values.every(v => v.value === want[v.r][v.c]));
  assert.equal(r.warnings.filter(w => w.kind === 'rule-skipped').length, 0);
});

test('a column that cannot be found is reported, never guessed', () => {
  const r = A.apply(learned, { headers: ['थाना', 'वर्तमान दशा', 'राशि', 'प्रकरण'], rows: M2 }, TEMPLATE);   // status column renamed beyond recognition
  assert.ok(r.warnings.some(w => w.kind === 'rule-skipped' && w.header === 'लंबित'));
  assert.ok(!r.values.some(v => v.column === 'लंबित' && !v.total && false));
  assert.ok(!r.values.some(v => v.column === 'लंबित'), 'no value written for the column that could not be computed');
  assert.ok(r.values.some(v => v.column === 'दर्ज'), 'other columns are still filled');
});

test('new and missing stations are reported', () => {
  const rows = month(33, { stations: STATIONS.slice(1).concat(['नया थाना']) });
  const r = A.apply(learned, { headers: HEAD, rows }, TEMPLATE);
  const ng = r.warnings.find(w => w.kind === 'new-groups'), mg = r.warnings.find(w => w.kind === 'missing-groups');
  assert.deepEqual(plain(ng.groups.map(g => g.name)), ['नया थाना']);
  assert.deepEqual(plain(mg.groups), ['कोतवाली']);
  const miss = r.values.find(v => v.group === 'कोतवाली' && v.column === 'दर्ज');
  assert.equal(miss.value, 0);                                           // counts and totals are 0, not blank
});

test('amounts written as text ("2.5 लाख", Hindi digits) are added correctly', () => {
  const rows = M2.map(x => x.slice()); rows[0][2] = '2.5 लाख'; rows[1][2] = '१,५००';
  const r = A.apply(learned, { headers: HEAD, rows }, TEMPLATE);
  const st = rows[0][0];
  const expect = rows.filter(x => x[0] === st).reduce((a, x) => a + (x[2] === '2.5 लाख' ? 250000 : x[2] === '१,५००' ? 1500 : +x[2]), 0);
  assert.equal(r.values.find(v => v.group === st && v.column === 'राशि').value, expect);
});

test('formula cells in the proforma are left to Excel', () => {
  const t = { rows: proforma(M1), formulas: [[11, 2], [11, 5]] };
  const l = A.learn(t, { headers: HEAD, rows: M1 });
  const c = Object.fromEntries(l.cols.map(x => [x.header, x]));
  assert.equal(c['दर्ज'].total.type, 'formula');
  const r = A.apply(l, { headers: HEAD, rows: M2 }, t);
  assert.ok(!r.values.some(v => v.total && v.c === 2));
});

test('a column that is not a calculation on this data is listed as not learned', () => {
  const t = { rows: proforma(M1).map((row, i) => i >= 3 && i < 11 ? row.concat([7 * i % 5 + 100]) : (i === 2 ? row.concat(['प्रशासनिक व्यय']) : row.concat([null]))), formulas: [] };
  const l = A.learn(t, { headers: HEAD, rows: M1 });
  assert.deepEqual(plain(l.unmatched), ['प्रशासनिक व्यय']);
  const r = A.apply(l, { headers: HEAD, rows: M2 }, t);
  assert.ok(r.warnings.some(w => w.kind === 'not-learned'));
  assert.ok(!r.values.some(v => v.column === 'प्रशासनिक व्यय'));
});

test('an all-zero column has no calculation behind it: reported, never invented', () => {
  const t = { rows: proforma(M1).map((row, i) => i >= 3 && i < 11 ? row.concat([0]) : (i === 2 ? row.concat(['अपील']) : row.concat([null]))), formulas: [] };
  const l = A.learn(t, { headers: HEAD, rows: M1 });
  assert.deepEqual(plain(l.unmatched), ['अपील']);
  const r = A.apply(l, { headers: HEAD, rows: M2 }, t);
  assert.ok(!r.values.some(v => v.column === 'अपील'));
  assert.ok(r.warnings.some(w => w.kind === 'not-learned' && w.header === 'अपील'));
});

test('grounded summary: every sentence names its largest rise / fall with exact numbers', () => {
  const r = A.apply(learned, { headers: HEAD, rows: M2 }, TEMPLATE);
  assert.ok(r.summary.en.length >= 1 && r.summary.hi.length === r.summary.en.length);
  let checked = 0;
  r.summary.en.forEach(line => {
    const col = ['दर्ज', 'लंबित', 'निस्तारित', 'राशि', 'औसत राशि', 'लंबित %', 'शेष'].filter(c => line.startsWith(c + ' '))
      .sort((a, b) => b.length - a.length)[0];
    assert.ok(col, line);
    const vals = r.values.filter(v => v.column === col && !v.total);
    const up = vals.slice().sort((a, b) => b.delta - a.delta)[0], down = vals.slice().sort((a, b) => a.delta - b.delta)[0];
    const ind = ctx.STL.change.indian;
    if (up.delta > 0) { assert.ok(line.includes('Largest rise: ' + up.group + ' (+' + ind(up.delta) + ')'), line); checked++; }
    if (down.delta < 0) { assert.ok(line.includes('Largest fall: ' + down.group), line); checked++; }
  });
  assert.ok(checked >= 2);
  r.summary.hi.forEach(l => assert.match(l, /[\u0900-\u097F]/));
});

test('no proforma column matches the data: a clear error, nothing is invented', () => {
  const l = A.learn({ rows: [['a', 'b'], ['x', 1], ['y', 2], ['z', 3]], formulas: [] }, { headers: HEAD, rows: M1 });
  assert.equal(l.ok, false); assert.equal(l.error, 'labels');
});

test('performance: 100,000 rows, 50 groups: learn and fill in a few seconds', () => {
  const sts = Array.from({ length: 50 }, (_, i) => 'थाना ' + i), r = rng(5), rows = [];
  for (let i = 0; i < 100000; i++) rows.push([sts[i % 50], STATUS[Math.floor(r() * 3)], String(1000 * (1 + Math.floor(r() * 90))), 'C' + i]);
  const t = { rows: proforma(rows, sts), formulas: [] };
  const t0 = Date.now(); const l = A.learn(t, { headers: HEAD, rows }); const t1 = Date.now();
  const ap = A.apply(l, { headers: HEAD, rows }, t); const t2 = Date.now();
  assert.ok(l.ok && ap.ok);
  assert.ok(ap.values.every(v => v.value === t.rows[v.r][v.c]), JSON.stringify(ap.values.filter(v => v.value !== t.rows[v.r][v.c]).slice(0, 3)));
  assert.ok(t1 - t0 < 15000 && t2 - t1 < 8000, `learn ${t1 - t0} ms, apply ${t2 - t1} ms`);
  console.log(`      100,000 rows x 50 groups: learn ${t1 - t0} ms, fill ${t2 - t1} ms`);
});
