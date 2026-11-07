const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./load');

const ctx = sandbox(['web/js/tasks/30-messy-file-fixer.js', 'web/js/tasks/31-merge-anything.js', 'web/js/reports/42-change-radar.js']);
const C = ctx.STL.change;
const plain = x => JSON.parse(JSON.stringify(x));

test('Indian number grouping', () => {
  assert.equal(C.indian(1234567), '12,34,567');
  assert.equal(C.indian(100000), '1,00,000');
  assert.equal(C.indian(999), '999');
  assert.equal(C.indian(-45000), '-45,000');
  assert.equal(C.indian(12.5, 1), '12.5');
  assert.equal(C.indian(null), '–');
});

// 20 police stations in 4 districts; last month vs this month
const STATIONS = Array.from({ length: 20 }, (_, i) => ({ name: 'थाना ' + (i + 1), district: ['जयपुर', 'जोधपुर', 'कोटा', 'अजमेर'][i % 4] }));
function month(mut) {
  return STATIONS.map((st, i) => {
    const base = { pend: 10 + (i % 5), reg: 20 + i };
    const m = mut ? mut(st, i, base) : base;
    return ['FIR/' + (100 + i), st.name, st.district, String(m.reg), String(m.pend)];
  });
}
const PREV = { headers: ['प्रकरण संख्या', 'थाना', 'जिला', 'दर्ज', 'लंबित'], rows: month() };
const CUR = { headers: ['FIR No', 'Police Station', 'District', 'Registered', 'Pending'], rows: month((st, i, b) => (i < 3 ? { reg: b.reg + 2, pend: b.pend + 30 } : b)) };

test('columns with different names are matched; totals are exact', () => {
  const r = plain(C.compare(PREV, CUR));
  assert.equal(r.matched.length, 5);
  const pend = r.totals.find(t => t.name === 'Pending');
  const prevSum = PREV.rows.reduce((a, x) => a + +x[4], 0), curSum = CUR.rows.reduce((a, x) => a + +x[4], 0);
  assert.equal(pend.prev, prevSum); assert.equal(pend.cur, curSum); assert.equal(pend.delta, 90);
  assert.ok(Math.abs(pend.pct - 90 / prevSum * 100) < 1e-9);
});

test('concentration: finds that three stations carry the rise, with exact numbers', () => {
  const r = plain(C.compare(PREV, CUR));
  const ins = r.insights.find(i => i.column === 'Pending' && i.groupBy === 'Police Station');
  assert.ok(ins, 'insight per police station');
  assert.equal(ins.k, 3); assert.equal(ins.n, 20); assert.equal(ins.share, 1);
  assert.deepEqual(ins.top.map(t => t.delta), [30, 30, 30]);
  assert.match(ins.sentence.en, /Pending rose by 90 \(.*%\) from \d+ to \d+\. 100% of the rise is in 3 of 20 Police Station/);
  assert.match(ins.sentence.hi, /बढ़कर/);
  assert.match(ins.sentence.hi, /100% हिस्सा 20 में से 3/);
});

test('IDs that are different every month are never used as a grouping', () => {
  const mk = (tag, bump) => ({ headers: ['केस', 'थाना', 'राशि'], rows: Array.from({ length: 120 }, (_, i) => [tag + i, STATIONS[i % 8].name, String(10 + (bump && i % 8 < 2 ? 30 : 0))]) });
  const r = plain(C.compare(mk('A', false), mk('B', true)));
  assert.ok(r.insights.length >= 1);
  assert.ok(r.insights.every(i => i.groupBy !== 'केस'), 'grouped by the case id: ' + JSON.stringify(r.insights.map(i => i.groupBy)));
  assert.equal(r.key, null);                                           // nothing carries over, so no record matching either
});

test('a small, broadly spread change produces no concentration sentence', () => {
  const spread = { headers: CUR.headers, rows: month((st, i, b) => ({ reg: b.reg, pend: b.pend + 1 })) };
  const r = plain(C.compare(PREV, spread));
  assert.ok(r.totals.find(t => t.name === 'Pending').delta === 20);
  assert.equal(r.insights.filter(i => i.column === 'Pending').length, 0);
});

test('no movement means no insights', () => {
  const same = { headers: CUR.headers, rows: month() };
  const r = plain(C.compare(PREV, same));
  assert.equal(r.insights.length, 0);
  assert.ok(r.totals.every(t => t.delta === 0));
});

test('the case number is found as the key (row numbers are not)', () => {
  const r = plain(C.compare(PREV, CUR));
  assert.equal(r.key.name, 'FIR No');
});

test('records: new, gone and changed are listed exactly', () => {
  const cur = { headers: CUR.headers, rows: CUR.rows.slice(1).concat([['FIR/999', 'थाना 99', 'जयपुर', '5', '5']]) };
  cur.rows[0][4] = '77';                                              // FIR/101 changes
  const r = plain(C.compare(PREV, cur));
  assert.equal(r.rowDiff.added.length, 1);
  assert.equal(r.rowDiff.removed.length, 1);
  const ch = r.rowDiff.changed.find(c => c.key === 'FIR/101');
  assert.ok(ch);
  assert.deepEqual(ch.diffs, [{ col: 'Registered', old: '21', new: '23' }, { col: 'Pending', old: '11', new: '77' }]);
  assert.equal(r.rowDiff.changed.length, 2);                          // FIR/101 and FIR/102 (both were edited in the fixture)
  const t = C.changesTable(PREV, cur, C.compare(PREV, cur));
  assert.equal(t.rows.filter(x => x[0] === 'New').length, 1);
  assert.equal(t.rows.filter(x => x[0] === 'Gone')[0][1], 'FIR/100');
});

test('text written differently but meaning the same number is not a change', () => {
  const a = { headers: ['प्रकरण संख्या', 'राशि', 'थाना', 'x'], rows: [['A1', '2.5 लाख', 'क', '1'], ['A2', '1,000', 'ख', '1'], ['A3', '५००', 'ग', '1'], ['A4', '7', 'घ', '1']] };
  const b = { headers: ['प्रकरण संख्या', 'राशि', 'थाना', 'x'], rows: [['A1', '250000', 'क', '1'], ['A2', '1000', 'ख', '1'], ['A3', '500', 'ग', '1'], ['A4', '7', 'घ', '1']] };
  const r = plain(C.compare(a, b));
  assert.equal(r.rowDiff.changed.length, 0);
});

test('without a stable key only the group-level comparison is shown', () => {
  // the same station appears on many rows, so no column identifies a record
  const mk = bump => ({ headers: ['थाना', 'दर्ज'], rows: Array.from({ length: 60 }, (_, i) => [STATIONS[i % 20].name, String(5 + (bump && i % 20 < 2 ? 3 : 0))]) });
  const r = plain(C.compare(mk(false), mk(true)));
  assert.equal(r.key, null);
  assert.equal(r.rowDiff, null);
  assert.ok(r.totals.length === 1 && r.totals[0].delta === 18);
});

test('a one-row-per-station summary uses the station as the key', () => {
  const a = { headers: ['थाना', 'दर्ज'], rows: STATIONS.map((s, i) => [s.name, String(10 + i)]) };
  const b = { headers: ['थाना', 'दर्ज'], rows: STATIONS.map((s, i) => [s.name, String(10 + i + (i < 2 ? 20 : 0))]) };
  const r = plain(C.compare(a, b));
  assert.equal(r.key.name, 'थाना');
  assert.equal(r.rowDiff.changed.length, 2);
  assert.equal(r.totals[0].delta, 40);
});

test('performance: two 100,000-row tables compared in a few seconds', () => {
  const mk = bump => ({ headers: ['केस', 'थाना', 'राशि'], rows: Array.from({ length: 100000 }, (_, i) => ['C' + i, 'थाना ' + (i % 50), String(i % 7 + (bump && i % 50 === 3 ? 5 : 0))]) });
  const t = Date.now(); const r = C.compare(mk(false), mk(true)); const ms = Date.now() - t;
  assert.ok(r.insights.length >= 1 && ms < 12000, 'took ' + ms);
  console.log('      2 x 100,000 rows compared in ' + ms + ' ms');
});
