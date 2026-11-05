// the same grievance entered twice by two operators: never identical in every cell
const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./load');
const ctx = sandbox(['web/js/tasks/33-value-groups.js', 'web/js/tasks/34-duplicates.js']); const D = ctx.STL.dups;
const plain = x => JSON.parse(JSON.stringify(x));
const H = ['Sr. No.', 'Registration No.', 'Date of Registration', 'Name of Applicant', "Father's / Husband's Name", 'Village', 'Department', 'Status'];
const rows = [
  ['1', 'GRV/2025/000101', '2025-04-01', 'Kamla Lodha', 'Mamta Lodha', 'Hatundi', 'Revenue (Land)', 'Pending'],
  ['2', 'GRV/2025/000102', '2025-04-01', 'Sohan Prajapat', 'Basanti Prajapat', 'Madanganj', 'Water Supply', 'Disposed'],
  ['3', 'GRV/2025/000101', '2025-04-01', 'KAMLA  LODHA ', 'Mamta Lodha', 'Hatundi', 'Revenue (Land)', ''],                 // same number, other capitals, less complete
  ['4', 'GRV/2025/000150', '2025-04-03', 'Shri Sohan Prajapat', 'Basanti Prajapat', 'Madanganj', 'Water Supply', 'Pending'], // a new number, same person, two days later
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
  assert.deepEqual(plain(D.find(rows, [3, 4, 5, 6])), [[0, 2], [1, 3, 5]], 'without a date window all of the person\'s cases are one group');
});
test('the more complete copy is kept, the first on a tie', () => {
  assert.equal(D.keeper(rows, [1, 3]), 1); assert.equal(D.keeper([['a', 'b'], ['a', 'b']], [0, 1]), 0);
});
test('a key that is empty everywhere is never a duplicate', () => {
  assert.deepEqual(plain(D.find([['', 'x'], ['', 'y'], ['', 'z']], [0])), []);
});
