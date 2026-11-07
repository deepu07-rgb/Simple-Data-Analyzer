// Three yearly sheets of the same register, written by three different people (found in a district grievance workbook)
const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./load');
const ctx = sandbox(['web/js/tasks/28-lexicon.js', 'web/js/tasks/31-merge-anything.js']); const M = ctx.STL.merge;
const plain = x => JSON.parse(JSON.stringify(x));
const fy1 = ['Sr. No.', 'Registration No.', 'Date of Registration', 'Name of Applicant', "Father's / Husband's Name", 'Village', 'Department', 'Mode', 'Amount Involved (Rs.)', 'Officer', 'Status', 'Date of Disposal', 'Satisfaction', 'Block'];
const fy2 = ['Case / S.No', 'Case / Reg. No', 'Case / Internal Ref', 'Applicant / Date of Reg', 'Applicant / Applicant Name', "Applicant / Father's Name", 'Applicant / Mobile', 'Location / Department / Block', 'Location / Department / Village', 'Location / Department / Dept', 'Action / Mode', 'Action / Officer Assigned', 'Action / Amt Claimed', 'Outcome / Disposal Dt', 'Outcome / Current Status', 'Outcome / Rating', 'Outcome / Remarks (Hindi)'];
const fy3 = ['Registration No', 'Date', 'Applicant', 'Father/Husband', 'Village', 'Block', 'Department', 'Officer', 'Mode', 'Amount', 'Status', 'Disposal Date', 'Days Taken', 'SLA Days', 'SLA Breached', 'Rating'];
const mk = (name, headers) => ({ name, headers, rows: [headers.map((_, i) => 'v' + i)] });
test('group prefixes, abbreviations and "Father/Husband" no longer split the same column in two', () => {
  const plan = M.plan([mk('a', fy1), mk('b', fy2), mk('c', fy3)]), by = (fi, name) => { const hs = [fy1, fy2, fy3][fi], m = plan.maps[fi].find(x => x.src === hs.indexOf(name)); return { to: plan.headers[m.tgt], level: m.level }; };
  const same = [['Case / S.No', 'Sr. No.'], ['Case / Reg. No', 'Registration No.'], ['Applicant / Date of Reg', 'Date of Registration'], ['Applicant / Applicant Name', 'Name of Applicant'], ["Applicant / Father's Name", "Father's / Husband's Name"],
    ['Location / Department / Block', 'Block'], ['Location / Department / Village', 'Village'], ['Location / Department / Dept', 'Department'], ['Action / Mode', 'Mode'], ['Action / Officer Assigned', 'Officer'], ['Action / Amt Claimed', 'Amount Involved (Rs.)'],
    ['Outcome / Disposal Dt', 'Date of Disposal'], ['Outcome / Current Status', 'Status'], ['Outcome / Rating', 'Satisfaction']];
  same.forEach(([src, to]) => { const r = by(1, src); assert.equal(r.to, to, src + ' → ' + r.to); assert.equal(r.level, 'auto', src); });
  [['Registration No', 'Registration No.'], ['Applicant', 'Name of Applicant'], ['Father/Husband', "Father's / Husband's Name"], ['Block', 'Block'], ['Department', 'Department'], ['Officer', 'Officer'], ['Amount', 'Amount Involved (Rs.)'], ['Disposal Date', 'Date of Disposal'], ['Rating', 'Satisfaction']].forEach(([src, to]) => { const r = by(2, src); assert.equal(r.to, to, src + ' → ' + r.to); assert.equal(r.level, 'auto'); });
  assert.equal(by(2, 'Date').to, 'Date of Registration'); assert.equal(by(2, 'Date').level, 'review', 'a bare "Date" is a question for the person, not a silent guess');
  assert.deepEqual(plain(plan.headers.slice(fy1.length)), ['Internal Ref', 'Mobile', 'Remarks (Hindi)', 'Days Taken', 'SLA Days', 'SLA Breached'], 'only columns that exist in one sheet only are new, with clean names');
});
test('"Block" is never mistaken for "Department" because "Department" is in its group name', () => {
  const plan = M.plan([mk('a', ['Department', 'Village']), mk('b', ['Location / Department / Block', 'Location / Department / Village'])]);
  assert.equal(plan.headers[plan.maps[1][0].tgt], 'Block'); assert.equal(plan.maps[1][0].level, 'new');
});
test('a header with "/" inside it is not treated as a group when only that header has it', () => {
  const plan = M.plan([mk('a', ["Father's / Husband's Name", 'Village', 'Block']), mk('b', ['Father Name', 'Village', 'Block'])]);
  assert.equal(plan.headers.length, 3); assert.ok(plan.maps[1].every(m => m.level === 'auto'));
});

// ---- names that share no word: the content of the column decides (never silently: shown as "please check")
const dateOf = i => `2025-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`;
const big = (n, f) => Array.from({ length: n }, (_, i) => f(i));
test('columns whose names have nothing in common are matched by what is inside them', () => {
  const A = { name: 'a', headers: ['Reg No', 'Lodged', 'State', 'Region', 'Claim'], rows: big(60, i => [`GRV/2025/${String(10000 + i)}`, dateOf(i), ['Pending', 'Disposed', 'Rejected'][i % 3], ['North', 'South', 'East'][i % 3], String(1000 + i * 37)]) };
  const B = { name: 'b', headers: ['Ref Code', 'Entered On', 'Phase', 'Zone', 'Rs Demanded'], rows: big(60, i => [`GRV/2026/${String(20000 + i)}`, dateOf(i + 5), ['Disposed', 'Pending', 'Rejected'][i % 3], ['South', 'North', 'West'][i % 3], String(1100 + i * 33)]) };
  const plan = M.plan([A, B]), m = k => { const x = plan.maps[1].find(y => y.src === B.headers.indexOf(k)); return { to: plan.headers[x.tgt], level: x.level, reason: x.reason }; };
  assert.deepEqual(plain(m('Ref Code')), { to: 'Reg No', level: 'review', reason: 'values:code' });
  assert.equal(m('Phase').to, 'State'); assert.equal(m('Phase').reason, 'values:set'); assert.equal(m('Zone').to, 'Region');
  assert.equal(m('Entered On').to, 'Lodged'); assert.equal(m('Rs Demanded').to, 'Claim');
  ['Ref Code', 'Phase', 'Zone', 'Entered On', 'Rs Demanded'].forEach(k => assert.equal(m(k).level, 'review', k + ' must be checked by a person, not applied silently'));
});
test('a name and a number column are never matched by content; what the person once matched is remembered', () => {
  const A = { name: 'a', headers: ['Applicant Name', 'Claim'], rows: big(40, i => [`Person${'abcdefghij'[i % 10]} Name${'klmnopqrst'[i % 10]}`, String(1000 + i)]) };
  const B = { name: 'b', headers: ['Fund Source', 'Phase Lot'], rows: big(40, i => [['Central', 'State'][i % 2], String(1020 + i)]) };
  let plan = M.plan([A, B]); assert.ok(plan.maps[1].every(x => x.level === 'new' || x.reason !== 'values:set'));
  ctx.STL.lex._reset(); ctx.STL.lex.forget(); ctx.STL.lex.learnColumn('Fund Source', 'Applicant Name');
  plan = M.plan([A, B]); const x = plan.maps[1].find(y => y.src === 0); assert.equal(x.level, 'auto'); assert.equal(x.reason, 'learned'); ctx.STL.lex.forget();
});
test('the glossary knows applicant = complainant = petitioner and action taken = remarks', () => {
  const plan = M.plan([{ name: 'a', headers: ['Complainant', 'Remarks'], rows: [['x', 'y']] }, { name: 'b', headers: ['Name of Applicant', 'Action Taken'], rows: [['x', 'y']] }]);
  assert.deepEqual(plain(plan.headers), ['Complainant', 'Remarks']);
});
