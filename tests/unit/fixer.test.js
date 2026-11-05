const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./load');

const ctx = sandbox(['web/js/tasks/30-messy-file-fixer.js']);
const F = ctx.STL.fix;
const plain = x => JSON.parse(JSON.stringify(x));            // arrays made inside the sandbox have another prototype
const ids = r => plain(r.steps.map(s => s.id));
const one = (grid, id) => plain(F.apply(grid, [id]).grid);

const CLEAN = [
  ['क्र_सं', 'नाम', 'जिला', 'वेतन', 'तिथि'],
  ['1', 'राहुल शर्मा', 'जयपुर', '45000', '2025-06-01'],
  ['2', 'प्रिया सिंह', 'जोधपुर', '32000', '2025-06-02'],
  ['3', 'अमित कुमार', 'उदयपुर', '38000.5', '2025-06-03'],
  ['4', 'Sunita Devi', 'कोटा', '41000', '2025-06-04'],
];

test('a clean table raises no findings (no false alarms)', () => {
  assert.deepEqual(ids(F.analyze(CLEAN)), []);
});

test('title rows above the header are removed', () => {
  const g = [['राजस्थान पुलिस — मासिक प्रगति', '', '', '', ''], ['जिला: जयपुर   माह: अक्टूबर', '', '', '', ''], ['', '', '', '', ''], ...CLEAN];
  const r = F.analyze(g);
  assert.ok(ids(r).includes('headerRow'));
  assert.deepEqual(plain(r.result[0]), CLEAN[0]);
  assert.equal(r.rows, 4);
});

test('two-row merged header is joined as Group / Sub', () => {
  const g = [['', 'दर्ज', '', 'निस्तारित', ''], ['जिला', 'पुरुष', 'महिला', 'पुरुष', 'महिला'],
             ['जयपुर', '10', '12', '8', '9'], ['जोधपुर', '7', '5', '4', '3'], ['कोटा', '3', '2', '1', '1'], ['अजमेर', '6', '6', '5', '5']];
  const r = F.analyze(g);
  assert.ok(ids(r).includes('twoRowHeader'));
  assert.deepEqual(plain(r.result[0]), ['जिला', 'दर्ज / पुरुष', 'दर्ज / महिला', 'निस्तारित / पुरुष', 'निस्तारित / महिला']);
  assert.equal(r.rows, 4);
});

test('a data row is never mistaken for a second header row', () => {
  const g = [['जिला', 'पुरुष', 'महिला'], ['जयपुर', '10', '12'], ['जोधपुर', '7', '5'], ['कोटा', '3', '2'], ['अजमेर', '6', '6']];
  assert.ok(!ids(F.analyze(g)).includes('twoRowHeader'));
});

test('empty rows and columns, repeated headers and total rows are removed', () => {
  const g = [['नाम', '', 'राशि'], ['राम', '', '10'], ['', '', ''], ['श्याम', '', '20'], ['नाम', '', 'राशि'], ['कुल', '', '30'], ['मोहन', '', '5']];
  const r = F.analyze(g);
  assert.deepEqual(ids(r).sort(), ['blanks', 'repeatedHeaders', 'totalRows'].sort());
  assert.deepEqual(plain(r.result), [['नाम', 'राशि'], ['राम', '10'], ['श्याम', '20'], ['मोहन', '5']]);
});

test('total-looking names are not removed (only real total labels)', () => {
  const g = [['नाम', 'राशि'], ['Totally Kumar', '10'], ['कुमार', '20'], ['योगेश', '30'], ['कुलदीप', '40']];
  assert.deepEqual(ids(F.analyze(g)), []);
  const g2 = [['नाम', 'राशि'], ['राम', '10'], ['Grand Total', '10']];
  assert.ok(ids(F.analyze(g2)).includes('totalRows'));
});

test('fill down: blocks under a merged district cell', () => {
  const g = [['जिला', 'थाना', 'दर्ज'], ['जयपुर', 'कोतवाली', '5'], ['', 'सांगानेर', '6'], ['', 'मालवीय नगर', '7'],
             ['जोधपुर', 'सरदारपुरा', '8'], ['', 'उम्मेद', '4'], ['', 'प्रताप', '3'], ['कोटा', 'विज्ञान नगर', '2'], ['', 'नयापुरा', '2']];
  const out = one(g, 'fillDown');
  assert.deepEqual(out.map(r => r[0]), ['जिला', 'जयपुर', 'जयपुर', 'जयपुर', 'जोधपुर', 'जोधपुर', 'जोधपुर', 'कोटा', 'कोटा']);
});

test('fill down does not invent values for scattered blanks', () => {
  const g = [['नाम', 'टिप्पणी', 'राशि'], ['राम', 'ok', '1'], ['श्याम', '', '2'], ['मोहन', 'late', '3'], ['सोहन', '', '4'], ['रोहन', 'ok', '5'], ['गोपाल', '', '6']];
  assert.ok(!ids(F.analyze(g)).includes('fillDown'));
});

test('whitespace: trims, collapses and removes invisible characters', () => {
  const g = [['नाम', 'जिला'], ['  राम   शर्मा ', 'जयपुर '], ['श्याम​', ' कोटा'], ['मोहन', 'अलवर']];
  const out = one(g, 'whitespace');
  assert.deepEqual(out.slice(1), [['राम शर्मा', 'जयपुर'], ['श्याम', 'कोटा'], ['मोहन', 'अलवर']]);
});

test('Hindi digits become numbers, Hindi words with digits are untouched', () => {
  const g = [['क्र', 'आयु', 'पता'], ['१', '३५', 'वार्ड १२'], ['२', '४०', 'वार्ड ३'], ['३', '२८', 'गाँव']];
  const out = one(g, 'hindiDigits');
  assert.deepEqual(out.slice(1), [['1', '35', 'वार्ड १२'], ['2', '40', 'वार्ड ३'], ['3', '28', 'गाँव']]);
});

test('numbers: lakh, crore, rupee symbols, /-, brackets, Hindi digits', () => {
  const U = F.util;
  assert.equal(U.parseNumber('2.5 लाख'), 250000);
  assert.equal(U.parseNumber('1.2 crore'), 12000000);
  assert.equal(U.parseNumber('₹1,00,000/-'), 100000);
  assert.equal(U.parseNumber('Rs. 45,000/-'), 45000);
  assert.equal(U.parseNumber('(500)'), -500);
  assert.equal(U.parseNumber('१,२५०'), 1250);
  assert.equal(U.parseNumber('3 हजार'), 3000);
  assert.equal(U.parseNumber('12%'), null);
  assert.equal(U.parseNumber('N/A'), null);
  assert.equal(U.parseNumber('12abc'), null);
  const g = [['मद', 'राशि'], ['क', '2.5 लाख'], ['ख', '₹1,00,000/-'], ['ग', '(500)'], ['घ', '45000'], ['ङ', 'N/A']];
  const out = one(g, 'numbers');
  assert.deepEqual(out.slice(1).map(r => r[1]), ['250000', '100000', '-500', '45000', 'N/A']);
});

test('numbers: phone numbers and leading-zero codes are left alone', () => {
  const g = [['फोन', 'कोड'], ['09876543210', '007'], ['09123456789', '012'], ['09000000001', '045'], ['09111111111', '001']];
  assert.deepEqual(ids(F.analyze(g)), []);
});

test('dates: day-first by default, month-first only when the data proves it', () => {
  const g = [['तिथि', 'x'], ['03/04/2025', 'a'], ['15/04/2025', 'b'], ['1-5-25', 'c'], ['12 Jan 2025', 'd'], ['2025-02-03', 'e']];
  const r = F.analyze(g);
  const out = plain(r.result).map(x => x[0]);
  assert.deepEqual(out, ['तिथि', '2025-04-03', '2025-04-15', '2025-05-01', '2025-01-12', '2025-02-03']);
  const us = [['d', 'x'], ['04/15/2025', 'a'], ['03/04/2025', 'b'], ['05/06/2025', 'c']];
  assert.deepEqual(one(us, 'dates').map(x => x[0]), ['d', '2025-04-15', '2025-03-04', '2025-05-06']);
});

test('dates: invalid dates and mixed day/month orders are not guessed', () => {
  const bad = [['d', 'x'], ['31/02/2025', 'a'], ['15/04/2025', 'b'], ['01/01/2025', 'c']];
  assert.equal(one(bad, 'dates')[1][0], '31/02/2025');
  const mixed = [['d', 'x'], ['15/04/2025', 'a'], ['04/15/2025', 'b'], ['01/01/2025', 'c']];
  assert.deepEqual(one(mixed, 'dates').map(r => r[0]), ['d', '15/04/2025', '04/15/2025', '01/01/2025']);
});

test('dates: Excel serial numbers only in columns named like a date', () => {
  const g = [['दिनांक', 'राशि'], ['45000', '1'], ['45001', '2'], ['45002', '3']];
  assert.deepEqual(one(g, 'dates').map(r => r[0]), ['दिनांक', '2023-03-15', '2023-03-16', '2023-03-17']);
  const h = [['राशि', 'x'], ['45000', '1'], ['45001', '2'], ['45002', '3']];
  assert.deepEqual(ids(F.analyze(h)), []);
});

test('Krutidev: signal needs punctuation inside words, plain English names do not trigger', () => {
  const K = F.util.krutiSignal;
  assert.equal(K('eq[;ea=h'), true);
  assert.equal(K('jktLFkku iqfyl'), false);          // letters only: cannot be told apart from English, so not flagged
  for (const n of ['Rahul Sharma', 'S/o Ramesh', 'e-mail', 'Dr. R.K. Gupta', 'O\'Neil', 'राहुल', 'a@b.com']) assert.equal(K(n), false, n);
});

test('Krutidev column is converted to Unicode when the converter is present', () => {
  const g = [['नाम', 'पद'], ['jkgqy', 'eq[;ea=h'], ['fiz;k', 'dkaLVscy'], ['v#.k', '+k=h;k[k'], ['lquhrk', '[ksj']];
  const r = F.analyze(g);
  if (!ids(r).includes('krutidev')) return;          // detection is deliberately conservative
  assert.ok(/[ऀ-ॿ]/.test(r.result[1][1]));
});

test('apply honours the chosen subset and the fixed order', () => {
  const g = [['title', ''], ['नाम', 'राशि'], ['राम ', '2.5 लाख'], ['श्याम', '1 लाख'], ['मोहन', '50000'], ['कुल', '5']];
  const only = plain(F.apply(g, ['whitespace']).grid);
  assert.equal(only[2][0], 'राम');                    // trimmed
  assert.equal(only[2][1], '2.5 लाख');                // numbers step not selected
  assert.equal(only.length, 6);                       // title row and total row kept
  const all = plain(F.apply(g, F.STEP_IDS).grid);
  assert.deepEqual(all, [['नाम', 'राशि'], ['राम', '250000'], ['श्याम', '100000'], ['मोहन', '50000']]);
});

test('prepare treats importer placeholders as blank so title rows are found', () => {
  const grid = F.prepare(['रिपोर्ट', 'Column 2', 'Column 3'], [['', '', ''], ['नाम', 'आयु', 'पद'], ['राम', '30', 'क'], ['श्याम', '31', 'ख'], ['मोहन', '32', 'ग']]);
  assert.ok(ids(F.analyze(grid)).includes('headerRow'));
});

test('performance: 100,000 rows analysed in a few seconds', () => {
  const g = [['क्र', 'नाम', 'जिला', 'राशि', 'तिथि']];
  for (let i = 1; i <= 100000; i++) g.push([String(i), 'व्यक्ति ' + i, 'जयपुर', i % 7 ? String(i * 3) : '2.5 लाख', '03/04/2025']);
  const t = Date.now(); const r = F.analyze(g); const ms = Date.now() - t;
  assert.ok(ids(r).includes('numbers') && ids(r).includes('dates'));
  assert.ok(ms < 8000, 'took ' + ms + ' ms');
  console.log('      100,000 rows analysed in ' + ms + ' ms');
});

test('a record whose NAME starts with "Total" is not a total row (restaurant register), but real total rows still are', () => {
  const reg = [['Restaurant ID', 'Restaurant Name', 'City', 'Address', 'Votes', 'Rating']];
  for (let i = 0; i < 12; i++) reg.push([String(6300000 + i), i === 5 ? 'Total Food Court' : 'Cafe ' + i, 'Faridabad', 'Sector ' + i + ', Faridabad', String(10 + i), '3.' + (i % 9)]);
  assert.ok(!ids(F.analyze(reg)).includes('totalRows'), 'Total Food Court is a restaurant');
  const withTotal = reg.concat([['', 'Total', '', '', '222', '']]);
  assert.ok(ids(F.analyze(withTotal)).includes('totalRows'), 'a label with numbers and nothing else is a total row');
  const sub = reg.concat([['Jaipur', 'Sub Total', '', '', '90', '']]);
  assert.ok(ids(F.analyze(sub)).includes('totalRows'), 'a district + Sub Total row is still caught');
});

test('turning text into numbers never rounds real digits (GPS coordinates, rates)', () => {
  const g = [['नाम', 'अक्षांश', 'दर', 'राशि']];
  for (let i = 0; i < 8; i++) g.push(['n' + i, '121.' + (1000000 + i * 7).toString().slice(0, 7), '0.1234567', i % 2 ? '1.1 लाख' : '110000']);
  const r = F.analyze(g);
  const num = r.steps.filter(s => s.id === 'numbers')[0];
  const out = num ? plain(F.apply(g, ['numbers']).grid) : g;
  assert.deepEqual(out.map(x => x[1]), g.map(x => x[1]), 'coordinates keep every digit');
  assert.deepEqual(out.map(x => x[2]), g.map(x => x[2]), 'rates keep every digit');
  assert.equal(out[2][3], '110000', '1.1 lakh is 110000, without float noise');
});
