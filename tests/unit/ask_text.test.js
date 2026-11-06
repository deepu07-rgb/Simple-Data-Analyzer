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
// the column written after “by” is the “by” column, also with many values or a year (Spotify file)
const H2 = ['track_name', 'artist(s)_name', 'artist_count', 'released_year', 'released_month', 'streams', 'mode'];
const AR = ['Taylor Swift', 'The Weeknd', 'Ed Sheeran', 'Bad Bunny', 'Drake', 'Dua Lipa', 'Harry Styles', 'SZA', 'Doja Cat', 'Lizzo', 'Latto', 'Olivia Rodrigo', 'Karol G', 'Feid', 'Arctic Monkeys'];
const rows2 = Array.from({ length: 900 }, (_, i) => ['Song ' + i, AR[i % AR.length] + (i % 40 === 0 ? ' & guest ' + i : ''), String(1 + i % 3), String(1990 + i % 34), String(1 + i % 12), String(1e6 + Math.floor(rnd() * 9e8)), i % 2 ? 'Major' : 'Minor']);
const cat2 = A.catalog(H2, rows2), ask2 = q => A.parse(q, H2, rows2, cat2);
test('total streams by artist(s)_name uses the artist column, not artist_count', () => { const r = ask2('total streams by artist(s)_name'); assert.equal(r.intent, 'agg_by'); assert.equal(r.x, 1); assert.equal(r.fn, 'sum'); });
test('average streams by released_year uses the year, not the month', () => { const r = ask2('average streams by released_year'); assert.equal(r.intent, 'agg_by'); assert.equal(r.x, 3); });
