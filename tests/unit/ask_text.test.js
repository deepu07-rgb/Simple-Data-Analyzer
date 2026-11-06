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
// Hindi sales sheet: inflected words (जिले = जिला), “X का Y पर असर”, “कितने … खाली”
const HH = ['बिल संख्या', 'बिल दिनांक', 'जिला', 'ग्राहक प्रकार', 'सामान', 'मात्रा (किलो)', 'दर (₹ प्रति किलो)', 'छूट (₹)', 'बिल राशि (₹)'];
const HD = ['अजमेर', 'जयपुर', 'पाली', 'नागौर', 'बीकानेर'], HT = ['थोक', 'खुदरा', 'होटल'], HI = ['चीनी', 'मसाले', 'नमक', 'चाय पत्ती'];
const hrows = Array.from({ length: 900 }, (_, i) => ['RJ-' + (100000 + i), '2024-0' + (1 + i % 9) + '-10', HD[i % 5], HT[i % 3], HI[i % 4], (5 + (i * 7) % 190) + '.5', i % 23 === 0 ? '' : String(20 + (i * 13) % 300), String((i % 4) * 50), String(1000 + (i * 997) % 60000)]);
const hcat = A.catalog(HH, hrows), hask = q => A.parse(q, HH, hrows, hcat);
test('जिले के अनुसार कुल बिल राशि groups by the district (जिले = जिला)', () => { const r = hask('जिले के अनुसार कुल बिल राशि'); assert.equal(r.intent, 'agg_by'); assert.equal(r.x, 2); assert.equal(r.y, 8); assert.equal(r.fn, 'sum'); });
test('छूट का बिल राशि पर क्या असर है: the discount is the group, the bill amount the measure', () => { const r = hask('छूट का बिल राशि पर क्या असर है'); assert.equal(r.intent, 'fair'); assert.equal(r.y, 8); assert.equal(r.f, 7); });
test('कितने बिल में दर खाली है counts the empty rates, not the empty bill numbers', () => { const r = hask('कितने बिल में दर खाली है'); assert.equal(r.intent, 'count'); assert.deepEqual(conds(r), [{ col: 6, op: 'empty', value: '' }]); });
test('कितने बिल थोक के हैं counts the wholesale bills', () => { const r = hask('कितने बिल थोक के हैं'); assert.equal(r.intent, 'count'); assert.deepEqual(conds(r), [{ col: 3, value: 'थोक' }]); });
// mandi sheet (Hindi crop, English district / market, three price columns that share the word “भाव”)
const MH = ['तारीख', 'राज्य', 'जिला (मूल नाम)', 'मंडी (मूल नाम)', 'फसल / वस्तु', 'न्यूनतम भाव (₹/क्विंटल)', 'अधिकतम भाव (₹/क्विंटल)', 'प्रमुख भाव (₹/क्विंटल)'];
const mrows = Array.from({ length: 800 }, (_, i) => { const mn = 1000 + (i * 37) % 9000, mx = i % 5 === 0 ? mn : mn + 500; return ['2026-07-05', 'तमिलनाडु', 'D' + (i % 14), 'M' + (i % 25) + '(Sandhai )', 'फसल' + (i % 40), String(mn), String(mx), String(mn + (i % 5 === 0 ? 0 : 200))]; });
const mcat = A.catalog(MH, mrows), mask = q => A.parse(q, MH, mrows, mcat);
test('कितने जिले हैं counts the different districts', () => { const r = mask('कितने जिले हैं'); assert.equal(r.intent, 'distinct'); assert.equal(r.y, 2); });
test('सबसे अधिक प्रमुख भाव किस फसल का है uses the modal price, not the maximum (“अधिक” is not “अधिकतम”)', () => { const r = mask('सबसे अधिक प्रमुख भाव किस फसल का है'); assert.equal(r.intent, 'top'); assert.equal(r.y, 7); assert.equal(r.x, 4); });
test('फसल का प्रमुख भाव पर क्या असर है: the column with most words in common is the measure', () => { const r = mask('फसल का प्रमुख भाव पर क्या असर है'); assert.equal(r.intent, 'fair'); assert.equal(r.y, 7); assert.equal(r.f, 4); });
test('rows where the maximum price equals the minimum price', () => { const r = mask('कितनी पंक्तियों में अधिकतम भाव और न्यूनतम भाव बराबर हैं'); assert.equal(r.intent, 'count'); assert.equal(r.conds[0].op, 'eqcol'); assert.deepEqual([r.conds[0].col, r.conds[0].col2].sort(), [5, 6]); });
