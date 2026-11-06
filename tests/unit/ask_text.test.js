// A column of free text: "how many rows contain happy" counts the rows whose text has that whole word, with any other condition ("label 4") too.
const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./load');
const ctx = sandbox(['web/js/tasks/28-lexicon.js', 'web/js/tasks/29-csv-parse.js', 'web/js/tasks/30-messy-file-fixer.js', 'web/js/tasks/31-merge-anything.js', 'web/js/reports/41-pendency-radar.js', 'web/js/charts/60-chart-engine.js', 'web/js/charts/65-fair-compare.js', 'web/js/charts/66-drivers.js', 'web/js/tasks/37-derive.js', 'web/js/tasks/38-ask.js']);
const A = ctx.STL.ask, plain = x => JSON.parse(JSON.stringify(x));
const H = ['Column 1', 'text', 'label'];
const W = ['happy', 'sad', 'angry', 'tired', 'glad', 'scared', 'calm', 'lonely', 'proud', 'upset', 'eager', 'bored'];
let seed = 4; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const rows = Array.from({ length: 1500 }, (_, i) => [String(i), 'i feel ' + W[Math.floor(rnd() * W.length)] + ' about ' + W[Math.floor(rnd() * W.length)] + ' day number ' + i, String(Math.floor(rnd() * 6))]);
const cat = A.catalog(H, rows), ask = q => A.parse(q, H, rows, cat), conds = r => plain(r.conds || []);
test('rows that contain a word', () => { const r = ask('how many rows contain the word happy'); assert.equal(r.intent, 'count'); assert.deepEqual(conds(r), [{ col: 1, value: 'happy', op: 'word' }]); });
test('a word together with a code: “label 4”', () => { const r = ask('how many rows containing sad have label 4'); assert.equal(r.intent, 'count'); assert.deepEqual(conds(r).sort((a, b) => a.col - b.col), [{ col: 1, value: 'sad', op: 'word' }, { col: 2, value: '4' }]); });
test('“commonest words” opens the word tool', () => { const r = ask('what are the most common words'); assert.equal(r.intent, 'tool'); assert.equal(r.tool, 'words'); });
test('“mention” works too', () => { const r = ask('how many mention lonely'); assert.deepEqual(conds(r), [{ col: 1, value: 'lonely', op: 'word' }]); });
test('“label 1” is not read as the column named “Column 1”', () => { const r = ask('how many rows containing happy have label 1'); assert.deepEqual(conds(r).sort((a, b) => a.col - b.col), [{ col: 1, value: 'happy', op: 'word' }, { col: 2, value: '1' }]); });
