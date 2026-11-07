// the same grievance entered twice by two operators: never identical in every cell
const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./load');
const ctx = sandbox(['web/js/tasks/28-lexicon.js', 'web/js/tasks/33-value-groups.js', 'web/js/tasks/34-duplicates.js']); const D = ctx.STL.dups;
const plain = x => JSON.parse(JSON.stringify(x));
const H = ['Sr. No.', 'Registration No.', 'Date of Registration', 'Name of Applicant', "Father's / Husband's Name", 'Village', 'Department', 'Status'];
const rows = [
  ['1', 'GRV/2025/000101', '2025-04-01', 'Kamla Lodha', 'Mamta Lodha', 'Hatundi', 'Revenue (Land)', 'Pending'],
  ['2', 'GRV/2025/000102', '2025-04-01', 'Sohan Prajapat', 'Basanti Prajapat', 'Madanganj', 'Water Supply', 'Disposed'],
  ['3', 'GRV/2025/000101', '2025-04-01', 'KAMLA  LODHA ', 'Mamta Lodha', 'Hatundi', 'Revenue (Land)', ''],                 // same number, other capitals, less complete
  ['4', 'GRV/2025/000103', '2025-04-03', 'Shri Sohan Prajapat', 'Basanti Prajapat', 'Madanganj', 'Water Supply', 'Pending'], // one digit typed differently, same person, two days later
  ['5', 'GRV/2025/000101', '2025-04-01', 'Ramesh Gurjar', 'Heera Gurjar', 'Silora', 'Health', 'Pending'],                  // the same number for a DIFFERENT person
  ['6', 'GRV/2025/000290', '2025-09-20', 'Sohan Prajapat', 'Basanti Prajapat', 'Madanganj', 'Water Supply', 'Pending'],     // the same person, five months later: a new grievance
];
for (let i = 0; i < 20; i++) rows.push([String(7 + i), `GRV/2025/0003${i}`, '2025-05-01', `Person ${i}`, `Father ${i}`, 'V', 'Health', 'Pending']);
test('suggestions come from the column names', () => {
  const s = D.suggest(H, rows); assert.deepEqual(plain(s.map(x => x.id)), ['id', 'person']);
  assert.deepEqual(plain(s[0].cols), [1, 3]); assert.deepEqual(plain(s[1].cols), [3, 4, 5, 6]); assert.equal(s[1].dateCol, 2); assert.equal(s[1].days, 3);
});
test('same number AND same applicant (capitals, spaces and titles ignored); the same number for another person is not a repeat', () => {
  const g = D.find(rows, [1, 3]); assert.deepEqual(plain(g), [[0, 2]]);
  assert.equal(D.keeper(rows, g[0]), 0, 'the more complete row is kept');
});
test('same person, place and department within 3 days is one case; five months later it is not', () => {
  const g = D.find(rows, [3, 4, 5, 6], { dateCol: 2, days: 3 }); assert.deepEqual(plain(g), [[0, 2], [1, 3]]);
  assert.deepEqual(plain(D.find(rows, [3, 4, 5, 6], { dateCol: 2, days: 1 })), [[0, 2]], 'a 2-day gap is too far for a 1-day window');
  assert.deepEqual(plain(D.find(rows, [3, 4, 5, 6], { guard: false })), [[0, 2], [1, 3, 5]], 'without a date window and without the number check all of the person\'s cases are one group');
  assert.deepEqual(plain(D.find(rows, [3, 4, 5, 6])), [[0, 2], [1, 3]], 'a registration number far from the others (000290 against 000102) is a different case');
});
test('the more complete copy is kept, the first on a tie', () => {
  assert.equal(D.keeper(rows, [1, 3]), 1); assert.equal(D.keeper([['a', 'b'], ['a', 'b']], [0, 1]), 0);
});
test('a key that is empty everywhere is never a duplicate', () => {
  assert.deepEqual(plain(D.find([['', 'x'], ['', 'y'], ['', 'z']], [0])), []);
});

test('the same case with the name in Hindi once and in English once, initials, middle names, other word order', () => {
  const R = [];
  const add = (reg, name, v, d) => R.push([String(R.length + 1), reg, d || '2025-06-01', name, 'Father', v, 'Health', 'Pending']);
  add('GRV/1/00001', 'Kamla Lodha', 'Hatundi'); add('GRV/1/00001', 'कमला लोढ़ा', 'हतुंडी');
  add('GRV/1/00002', 'R.K. Chaudhary', 'Silora'); add('GRV/1/00002', 'Ramesh Kumar Chaudhary', 'Silora');
  add('GRV/1/00003', 'Lodha Kamla', 'Hatundi', '2025-06-02'); add('GRV/1/00004', 'Ramesh Gurjar', 'Silora'); add('GRV/1/00005', 'Suresh Gurjar', 'Silora');
  for (let i = 0; i < 25; i++) { const A = 'abcdefghijklmnopqrstuvwxyz'; add(`GRV/1/01${i}0`, `Pers${A[i]}${A[(i * 5) % 26]} Nam${A[(i * 3) % 26]}${A[i]}${A[(i * 11) % 26]}`, 'V' + A[i]); }
  const g = D.find(R, [1, 3]); assert.deepEqual(plain(g), [[0, 1], [2, 3]], 'same number + same name in either script / with initials');
  assert.deepEqual(plain(D.find(R, [1, 3], { fuzzy: false })), [], 'switched off: only the exact name counts');
  const p = D.find(R, [3, 5, 6], { dateCol: 2, days: 3 }); assert.ok(p.some(x => x.join() === '0,1,4'), 'person + place (Hindi or English) + department, 1 day apart: ' + JSON.stringify(p));
});
test('two different people with one name, place and department a day apart are not merged when their numbers clearly differ; one wrong digit still is', () => {
  const R = []; for (let i = 0; i < 30; i++) R.push([`GRV/2/${String(1000 + i * 7)}`, '2025-07-01', `Zed${i} Q${i}`, 'Hatundi', 'Health']);
  R.push(['GRV/2/9100', '2025-07-01', 'Mohan Meena', 'Hatundi', 'Health'], ['GRV/2/4400', '2025-07-02', 'Mohan Meena', 'Hatundi', 'Health']);   // two people, one name
  R.push(['GRV/2/7700', '2025-07-01', 'Sita Devi', 'Hatundi', 'Health'], ['GRV/2/7707', '2025-07-02', 'SITA DEVI', 'Hatundi', 'Health']);       // one digit different: a typo
  const g = D.find(R, [2, 3, 4], { dateCol: 1, days: 3 }); assert.deepEqual(plain(g), [[32, 33]]);
  assert.deepEqual(plain(D.find(R, [2, 3, 4], { dateCol: 1, days: 3, guard: false })), [[30, 31], [32, 33]]);
});
