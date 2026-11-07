const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./load');
const L = sandbox(['web/js/tasks/39-link-files.js']).STL.linkfiles;
test('the same ID column is found in both files', () => {
  assert.deepEqual(Array.from(L.guessKeys(['ID', 'MONTHS_BALANCE', 'STATUS'], ['CODE_GENDER', 'ID', 'AMT'])), [0, 1]);
  assert.deepEqual(Array.from(L.guessKeys(['Reg No', 'Name'], ['Name', 'reg_no', 'Place'])), [0, 1]);
});
test('with no common name, the column that looks like an ID is used', () => { assert.deepEqual(Array.from(L.guessKeys(['Case No', 'Amount'], ['Cust_ID', 'City'])), [0, 0]); });
test('a link check is explained in plain words, and a repeated ID is a warning', () => {
  const s = L.sentence({ left_rows: 1000, matched_rows: 800, matched_keys: 700, other_repeated_keys: 3, other_repeated_rows: 6, ambiguous_rows: 5 }, 'credit', 'application', false);
  assert.equal(s.level, 'warn'); assert.match(s.lines[0], /800 of 1,000 rows \(80%\) of “credit” find a match in “application”/); assert.match(s.lines.join(' '), /200 rows have no match/); assert.match(s.lines.join(' '), /3 IDs appear more than once/);
});
test('no match at all is an error', () => { assert.equal(L.sentence({ left_rows: 10, matched_rows: 0, matched_keys: 0, other_repeated_keys: 0, other_repeated_rows: 0, ambiguous_rows: 0 }, 'a', 'b', false).level, 'bad'); });
test('a month index gets “lowest”, not an average', () => {
  const cols = [{ index: 0, name: 'ID', type: 'number', distinct: 50000 }, { index: 1, name: 'MONTHS_BALANCE', type: 'number', distinct: 61 }, { index: 2, name: 'AMT', type: 'number', distinct: 800 }];
  const d = L.defaultLines(cols, 0); assert.equal(d.map(x => x.fn).join(), 'count,min,avg');
});
