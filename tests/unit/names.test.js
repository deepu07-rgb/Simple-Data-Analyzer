const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./load');

const ctx = sandbox(['web/js/reports/40-name-match.js']);
const N = ctx.STL.names;
const plain = x => JSON.parse(JSON.stringify(x));
const sc = (a, b) => N.score(a, b);

test('Devanagari becomes a sound form that matches the Roman spelling', () => {
  const pairs = [['Rahul', 'राहुल'], ['Sharma', 'शर्मा'], ['Sunita', 'सुनीता'], ['Chaudhary', 'चौधरी'], ['Srivastava', 'श्रीवास्तव'],
                 ['Lakshmi', 'लक्ष्मी'], ['Gyan', 'ज्ञान'], ['Kshatriya', 'क्षत्रिय'], ['Dwarka', 'द्वारका'], ['Prakash', 'प्रकाश'], ['Pooja', 'पूजा'], ['Vikram', 'विक्रम']];
  for (const [en, hi] of pairs) assert.ok(sc(en, hi) >= 0.85, `${en} ~ ${hi} = ${sc(en, hi).toFixed(2)} (${N.sound(en)} / ${N.sound(hi)})`);
});

test('the same person written in different scripts and spellings scores high', () => {
  const same = [['Rahul Sharma', 'राहुल शर्मा'], ['Rahul Sharma', 'Rahul Sarma'], ['Sunita Devi', 'सुनीता देवी'], ['Suneeta Devi', 'Sunita Devi'],
    ['Mohammad Rafiq', 'मोहम्मद रफीक'], ['Md. Rafique', 'Mohammed Rafeeq'], ['Gyan Prakash', 'ज्ञान प्रकाश'], ['Dwarka Prasad', 'द्वारका प्रसाद'],
    ['Vikram Singh Rathore', 'विक्रम सिंह राठौड़'], ['Pooja Sharma', 'Puja Sharma'], ['Shri Ramesh Kumar', 'रमेश कुमार'], ['Smt. Geeta Devi', 'गीता देवी'],
    ['Ramesh Chandra Gupta', 'रमेश चंद्र गुप्ता'], ['Anil Kumar', 'अनिल कुमार'], ['Chaudhary Mahendra', 'चौधरी महेन्द्र']];
  for (const [a, b] of same) assert.ok(sc(a, b) >= 0.85, `${a} ~ ${b} = ${sc(a, b).toFixed(2)} (${N.sound(a)} | ${N.sound(b)})`);
});

test('different people stay clearly below the auto-match level', () => {
  const diff = [['Rahul Sharma', 'Rohit Verma'], ['Suresh Kumar', 'Ramesh Kumar'], ['Anil Gupta', 'Sunil Gupta'], ['Sita Devi', 'Gita Devi'],
    ['Mahesh Singh', 'Mukesh Singh'], ['Rahul Sharma', 'Rahul Verma'], ['Priya Singh', 'Pooja Singh'], ['Deepak Joshi', 'Dinesh Joshi']];
  for (const [a, b] of diff) assert.ok(sc(a, b) < 0.8, `${a} vs ${b} = ${sc(a, b).toFixed(2)}`);
});

test('a name with extra words or an initial is a weaker, reviewable match', () => {
  assert.ok(sc('Rahul Sharma', 'Rahul') < 0.85);
  assert.ok(sc('Rahul Sharma', 'Rahul') > 0.5);
  assert.ok(sc('R. K. Sharma', 'Rajesh Kumar Sharma') >= 0.6);
  assert.ok(sc('Rahul Sharma', 'Sharma Rahul') >= 0.85);                 // order swapped
});

test('blank names never match', () => {
  assert.equal(sc('', 'राहुल'), 0);
  assert.equal(sc('   ', 'x'), 0);
  assert.equal(sc('Shri', 'श्री'), 0);                                    // only honorifics
});

const ROWS = [
  ['क्र', 'नाम', 'पिता का नाम', 'गाँव', 'आयु', 'मोबाइल'],
  ['1', 'राहुल शर्मा', 'रमेश शर्मा', 'जयपुर', '30', '9876543210'],
  ['2', 'Rahul Sharma', 'Ramesh Sharma', 'Jaipur', '30', ''],
  ['3', 'Rahul Sharma', 'Suresh Verma', 'Kota', '45', ''],
  ['4', 'सुनीता देवी', 'मोहन लाल', 'अलवर', '28', '9111111111'],
  ['5', 'Sunita Devi', '', '', '', '09111111111'],
  ['6', 'अमित कुमार', 'राम प्रसाद', 'सीकर', '35', ''],
].slice(1);
const COLS = { name: 1, father: 2, village: 3, age: 4, mobile: 5 };

test('duplicates in one list: father, place, age and mobile decide', () => {
  const r = plain(N.findDuplicates(ROWS, COLS, { threshold: 0.75 }));
  const has = (a, b) => r.pairs.some(p => p.a === a && p.b === b);
  assert.ok(has(0, 1), 'same person, same father/place/age');
  assert.ok(!has(0, 2) || r.pairs.find(p => p.a === 0 && p.b === 2).score < r.pairs.find(p => p.a === 0 && p.b === 1).score, 'same name but different father/place/age is weaker');
  assert.ok(has(3, 4), 'same mobile number links Sunita rows');
  assert.ok(!r.pairs.some(p => p.a === 5 || p.b === 5), 'unrelated person is not listed');
  const p01 = r.pairs.find(p => p.a === 0 && p.b === 1);
  assert.ok(p01.reasons.includes("father's name matches") && p01.reasons.includes('same place'));
});

test('duplicate groups join chains of matches', () => {
  const g = plain(N.groupPairs([{ a: 0, b: 1, score: 0.9 }, { a: 1, b: 2, score: 0.9 }, { a: 5, b: 6, score: 0.9 }, { a: 7, b: 8, score: 0.5 }], 10, 0.8));
  assert.deepEqual(g, [[0, 1, 2], [5, 6]]);
});

test('matching two lists picks the best row and flags ambiguity', () => {
  const A = [['राहुल शर्मा', 'जयपुर'], ['नरेश यादव', 'कोटा'], ['सुनीता देवी', 'अलवर']];
  const B = [['Rahul Sarma', 'Jaipur'], ['Rahul Sharma', 'Jaipur'], ['Naresh Yadav', 'Kota'], ['Anita Gupta', 'Sikar']];
  const r = plain(N.matchLists(A, B, { name: 0, village: 1 }, { threshold: 0.8 }));
  assert.equal(r.pairs.length, 2);
  const byA = Object.fromEntries(r.pairs.map(p => [p.a, p]));
  assert.equal(byA[1].b, 2);
  assert.ok(byA[0].ambiguous, 'two equally good rows for Rahul must be flagged');
  assert.ok(!byA[2], 'Sunita has no counterpart');
});

test('performance: 20,000 records searched for duplicates in a few seconds', () => {
  const first = ['राहुल', 'सुनीता', 'अमित', 'प्रिया', 'विक्रम', 'मीना', 'सुरेश', 'कविता', 'नरेंद्र', 'पूनम', 'रमेश', 'आशा', 'महेश', 'दीपा', 'संजय', 'गीता'];
  const last = ['शर्मा', 'सिंह', 'कुमार', 'गुप्ता', 'यादव', 'वर्मा', 'जोशी', 'मेहता', 'राठौड़', 'चौधरी'];
  const rows = [];
  for (let i = 0; i < 20000; i++) rows.push([first[i % 16] + ' ' + first[(i * 7) % 16] + ' ' + last[i % 10] + (i % 997 ? '' : ' ' + i), '']);
  const t = Date.now(); const r = N.findDuplicates(rows, { name: 0 }, { threshold: 0.9, limit: 5000 }); const ms = Date.now() - t;
  assert.ok(ms < 15000, 'took ' + ms);
  console.log('      20,000 records: ' + r.pairs.length + ' pairs in ' + ms + ' ms');
});
