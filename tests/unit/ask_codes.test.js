// The question box must never answer a different question: a code ("STATUS 5"), an ID, a number or a word it did not understand either
// becomes part of the question or stops the answer. Found with a credit-record file (one row per person per month).
const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./load');
const ctx = sandbox(['web/js/tasks/28-lexicon.js', 'web/js/tasks/29-csv-parse.js', 'web/js/tasks/30-messy-file-fixer.js', 'web/js/tasks/31-merge-anything.js', 'web/js/reports/41-pendency-radar.js', 'web/js/charts/60-chart-engine.js', 'web/js/charts/65-fair-compare.js', 'web/js/charts/66-drivers.js', 'web/js/tasks/37-derive.js', 'web/js/tasks/38-ask.js']);
const A = ctx.STL.ask, plain = x => JSON.parse(JSON.stringify(x));
const H = ['ID', 'MONTHS_BALANCE', 'STATUS', 'CODE_GENDER', 'CNT_CHILDREN'];
let seed = 9; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const ST = ['C', '0', 'X', '1', '5', '2', '3', '4'], rows = [];
for (let p = 0; p < 900; p++) { const n = 3 + Math.floor(rnd() * 20), g = rnd() < 0.6 ? 'F' : 'M', k = Math.floor(rnd() * 3); for (let m = 0; m < n; m++) rows.push([String(5001711 + p), String(-m), ST[Math.floor(rnd() * rnd() * 8)], g, String(k)]); }
const cat = A.catalog(H, rows), ask = q => A.parse(q, H, rows, cat);
const conds = r => plain(r.conds || []);
test('“how many rows have STATUS 5” counts the code 5 in STATUS, not all rows', () => { const r = ask('how many rows have STATUS 5'); assert.equal(r.intent, 'count'); assert.deepEqual(conds(r), [{ col: 2, value: '5' }]); });
test('a code written as a letter: “status C”', () => { const r = ask('how many rows have status C'); assert.equal(r.intent, 'count'); assert.deepEqual(conds(r), [{ col: 2, value: 'C' }]); });
test('“what share of rows are STATUS 1” is a count of STATUS = 1', () => { const r = ask('what share of rows are STATUS 1'); assert.equal(r.intent, 'count'); assert.deepEqual(conds(r), [{ col: 2, value: '1' }]); });
test('an ID written after its column name: “rows for ID 5001711”', () => { const r = ask('how many rows for ID 5001711'); assert.equal(r.intent, 'count'); assert.deepEqual(conds(r), [{ col: 0, value: '5001711' }]); });
test('“gender M” and “CNT_CHILDREN 2” give a condition each', () => { const r = ask('how many rows have gender M and children 2'); assert.deepEqual(conds(r).sort((a, b) => a.col - b.col), [{ col: 3, value: 'M' }, { col: 4, value: '2' }]); });
test('“how many different ID” counts different values of ID', () => { const r = ask('how many different ID'); assert.equal(r.intent, 'distinct'); assert.equal(r.y, 0); });
test('“how many unique statuses” too', () => { const r = ask('how many unique status values are there'); assert.equal(r.intent, 'distinct'); assert.equal(r.y, 2); });
test('a number that belongs to no column stops the answer instead of counting every row', () => { const r = ask('how many rows have 7'); assert.equal(r.intent, 'none'); assert.match(r.say, /did not count/); });
test('a number that fits one column offers it', () => { const r = ask('how many rows have 5'); assert.equal(r.intent, 'none'); assert.ok(r.examples.some(e => /STATUS 5/i.test(e)), JSON.stringify(r.examples)); });
test('a word that matches nothing stops the answer', () => { const r = ask('how many people were ever delinquent'); assert.equal(r.intent, 'none'); assert.match(r.say, /did not count/); });
test('plain “how many rows” still counts them all', () => { const r = ask('how many rows are there'); assert.equal(r.intent, 'count'); assert.equal(conds(r).length, 0); });
test('“how many rows have STATUS C and gender F”', () => { const r = ask('how many rows have STATUS C and gender F'); assert.deepEqual(conds(r).sort((a, b) => a.col - b.col), [{ col: 2, value: 'C' }, { col: 3, value: 'F' }]); });
