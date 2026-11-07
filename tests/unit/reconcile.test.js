// A summary sent upward, checked against the register it was typed from
const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./load');
const ctx = sandbox(['web/js/tasks/28-lexicon.js', 'web/js/tasks/33-value-groups.js', 'web/js/tasks/36-reconcile.js']); const R = ctx.STL.recon;
const plain = x => JSON.parse(JSON.stringify(x));
const DH = ['Reg No', 'Date of Registration', 'Block', 'Status', 'Amount'];
function register() {
  const rows = []; let n = 0;
  const add = (fy, count, mix) => { for (let i = 0; i < count; i++) { n++; const st = i < mix[0] ? 'Disposed' : i < mix[0] + mix[1] ? 'Rejected' : i < mix[0] + mix[1] + mix[2] ? 'Transferred' : 'Pending'; const m = 4 + (i % 12), y = fy + (m > 12 ? 1 : 0); rows.push([`R${n}`, `${m > 12 ? fy + 1 : fy}-${String(m > 12 ? m - 12 : m).padStart(2, '0')}-10`, ['A', 'B', 'C'][i % 3], st, String(100 + i)]); } };
  add(2023, 120, [80, 10, 6]); add(2024, 150, [100, 12, 8]); add(2025, 90, [55, 9, 5]); return rows;
}
const det = { headers: DH, rows: register() };
const summary = (disp2, pend3) => ({ headers: ['Financial year', 'Received', 'Disposed', 'Rejected/Transferred', 'Pending'], rows: [['2023-24', 120, 80, 16, 24], ['2024-25', 150, disp2, 20, 30], ['2025-26 (up to Jan)', 90, 55, 14, pend3], ['Total', 360, 80 + disp2 + 55, 50, 24 + 30 + pend3]] });
test('every number of a correct summary is found and agrees; the way each is made is named', () => {
  const r = R.check(summary(100, 21), det); assert.equal(r.wrong.length, 0, JSON.stringify(plain(r.wrong)));
  assert.deepEqual(plain(r.dims.map(d => [d.sName, d.dName, d.grain])), [['Financial year', 'Date of Registration', 'fy']]);
  const by = n => r.measures.find(m => m.name === n);
  assert.match(by('Received').label.en, /number of rows/); assert.match(by('Disposed').label.en, /Status = disposed/);
  assert.match(by('Rejected/Transferred').label.en, /rejected or transferred/); assert.match(by('Pending').label.en, /Status = pending/);
});
test('a transposed pair of digits and an under-count are listed, with the real figure', () => {
  const bad = R.check({ headers: summary(0, 0).headers, rows: [['2023-24', 120, 80, 16, 24], ['2024-25', 150, 10, 20, 30], ['2025-26 (up to Jan)', 90, 55, 14, 8], ['Total', 360, 145, 50, 62]] }, det);
  assert.deepEqual(plain(bad.wrong.map(w => [w.group, w.measure, w.summary, w.detail])).sort(), [['2024-25', 'Disposed', 10, 100], ['2025-26 (up to Jan)', 'Pending', 8, 21]].sort());
  assert.ok(bad.totals.some(t => t.measure === 'Pending' && !t.same));
});
test('periods are read as financial years, years and months', () => {
  assert.deepEqual(plain(R.periodOf('FY 2025-26 (up to Jan)')), { grain: 'fy', key: '2025' }); assert.deepEqual(plain(R.periodOf('2024-25')), { grain: 'fy', key: '2024' });
  assert.deepEqual(plain(R.periodOf('2024')), { grain: 'year', key: '2024' }); assert.deepEqual(plain(R.periodOf('Apr-2024')), { grain: 'month', key: '2024-04' }); assert.deepEqual(plain(R.periodOf('April 2024')), { grain: 'month', key: '2024-04' });
  assert.equal(R.periodOf('Beawar'), null);
});
test('a summary by block: groups are values of a detail column; sum of an amount column is found', () => {
  const rows = det.rows, sumA = k => rows.filter(r => r[2] === k).reduce((a, r) => a + Number(r[4]), 0), cnt = k => rows.filter(r => r[2] === k).length, pend = k => rows.filter(r => r[2] === k && r[3] === 'Pending').length;
  const sm = { headers: ['Block', 'Cases', 'Amount involved', 'Pending'], rows: ['A', 'B', 'C'].map(k => [k, cnt(k), sumA(k), pend(k)]) }; sm.rows[1][1] += 3;
  const r = R.check(sm, det); assert.equal(r.dims[0].kind, 'cat'); assert.deepEqual(plain(r.wrong.map(w => [w.group, w.measure, w.diff])), [['B', 'Cases', 3]]);
  assert.match(r.measures.find(m => m.name === 'Amount involved').label.en, /sum of Amount/);
});
test('a sheet that has nothing in common with the detail is said to be not comparable', () => {
  const r = R.check({ headers: ['Scheme', 'Budget'], rows: [['Alpha', 100], ['Beta', 200]] }, det); assert.equal(r.measures.length, 0); assert.equal(r.reason, 'no-groups');
});
test('rows without a date belong to no line: they explain a summary that is higher, never one that is lower', () => {
  const rows = register().map(r => r.slice()); for (let i = 0; i < 2; i++) rows[i][1] = '';                // 2 cases with no registration date (both 2023-24: i < 120)
  const sm = { headers: ['Financial year', 'Received', 'Pending'], rows: [['2023-24', 120, 24], ['2024-25', 150, 30], ['2025-26', 90, 21], ['Total', 360, 75]] };
  const r = R.check(sm, { headers: DH, rows }); assert.equal(r.unassigned, 2);
  assert.deepEqual(plain(r.explained.map(w => [w.group, w.measure, w.diff])), [['2023-24', 'Received', 2]], 'the 2 undated rows explain Received');
  assert.equal(r.wrong.length, 0, JSON.stringify(plain(r.wrong)));
  sm.rows[1][1] = 148; const r2 = R.check(sm, { headers: DH, rows }); assert.deepEqual(plain(r2.wrong.map(w => [w.group, w.measure, w.diff])), [['2024-25', 'Received', -2]], 'lower than the detail: no date can explain it');
});
