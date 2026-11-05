// Spelling variants found in a district workbook: blocks, departments, officers, statuses
const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./load');
const ctx = sandbox(['web/js/tasks/33-value-groups.js']); const V = ctx.STL.values;
const plain = x => JSON.parse(JSON.stringify(x));
const bag = spec => Object.entries(spec).flatMap(([v, n]) => Array(n).fill(v));
const groupOf = (gs, v) => gs.find(g => g.variants.some(x => x.v === v));

test('keys ignore capitals, spaces, dots, titles and "Dept."', () => {
  assert.equal(V.key('  Shri R.K. Choudhary '), 'r k choudhary'); assert.equal(V.key('R K  Choudhary'), 'r k choudhary'); assert.equal(V.key('Health Dept.'), 'health');
  assert.equal(V.key('REVENUE (LAND)'), V.key('Revenue  Land')); assert.equal(V.key('Food & Civil Supplies'), V.key('Food and Civil Supplies'));
});
test('blocks: case, spaces, typos and a "(Tehsil)" tail become one group each, the biggest spelling wins', () => {
  const col = bag({ Kishangarh: 2400, 'KISHANGARH': 80, 'Kishangrah': 40, 'Kishan Garh': 22, 'Kishangarh ': 30, Beawar: 1700, Byawar: 30, Beawer: 25, BEAWAR: 60, 'Beawar (Tehsil)': 20, Pushkar: 900, 'Pushker': 33, 'PUSHKAR': 40, Masuda: 1000, Masooda: 20, Arain: 900, Arayan: 15 });
  const gs = V.groups(col), kg = groupOf(gs, 'Kishangrah'), bg = groupOf(gs, 'Byawar');
  assert.equal(kg.canonical, 'Kishangarh'); assert.equal(kg.variants.length, 5, kg.variants.map(x => x.v).join('|')); assert.equal(kg.n, 2572);
  assert.equal(bg.canonical, 'Beawar'); assert.ok(bg.variants.some(x => x.v === 'Beawar (Tehsil)') && bg.variants.some(x => x.v === 'Beawer'));
  assert.equal(groupOf(gs, 'Pushker').canonical, 'Pushkar'); assert.equal(groupOf(gs, 'Masooda').canonical, 'Masuda'); assert.equal(groupOf(gs, 'Arayan').canonical, 'Arain');
  assert.equal(gs.length, 5, 'one group per block: ' + gs.map(g => g.canonical));
});
test('two real, frequent values that look alike are NOT merged', () => {
  const gs = V.groups(bag({ Bhinay: 1200, Bhilwara: 900, 'Arain': 900, 'Arhain': 700 }));
  assert.equal(gs.length, 0, JSON.stringify(plain(gs).map(g => g.variants)));
});
test('departments: a short form is "part of" the full name and is only a suggestion to check', () => {
  const col = bag({ 'Revenue (Land)': 8000, Revenue: 700, 'Revenue Land': 80, 'REVENUE (LAND)': 60, 'Social Security Pension': 5000, Pension: 500, 'Social Security  Pension': 70, 'Water Supply (PHED)': 6000, PHED: 400, 'Water Supply': 90, Health: 3000, 'Health ': 100, 'Health Dept.': 30, 'Police (Complaints)': 3000, Police: 200 });
  const gs = V.groups(col), rev = groupOf(gs, 'Revenue');
  assert.equal(rev.canonical, 'Revenue (Land)'); assert.equal(rev.variants.length, 4); assert.equal(rev.kind, 'part');
  assert.equal(groupOf(gs, 'Pension').canonical, 'Social Security Pension'); assert.equal(groupOf(gs, 'PHED').canonical, 'Water Supply (PHED)'); assert.equal(groupOf(gs, 'Police').canonical, 'Police (Complaints)');
  assert.equal(groupOf(gs, 'Health Dept.').canonical, 'Health'); assert.equal(groupOf(gs, 'Health Dept.').kind, 'format');
});
test('officers: re-ordered words, titles and initials', () => {
  const gs = V.groups(bag({ 'R.K. Chaudhary': 5000, 'R K Chaudhary': 300, 'R.K.Chaudhary': 200, 'Chaudhary R.K.': 150, 'Shri R.K. Choudhary': 100, 'Sunita Meena': 4800, 'Smt. Sunita Meena': 60, 'Sunita  Meena': 40, 'Mahesh Joshi': 5200, 'M. Joshi': 30 }));
  const g = groupOf(gs, 'Chaudhary R.K.');
  assert.equal(g.canonical, 'R.K. Chaudhary'); assert.ok(g.variants.length >= 5, g.variants.map(x => x.v).join('|'));
  assert.equal(groupOf(gs, 'Smt. Sunita Meena').canonical, 'Sunita Meena');
  assert.ok(!groupOf(gs, 'M. Joshi') || groupOf(gs, 'M. Joshi').canonical === 'Mahesh Joshi', '"M. Joshi" is only a suggestion at most');
});
test('statuses: spelling and case merge; true synonyms (Closed / Disposed) are left to the person', () => {
  const gs = V.groups(bag({ Disposed: 30000, DISPOSED: 500, disposed: 300, 'Disposed Off': 900, 'Disposed of': 200, Closed: 400, Pending: 1000, pending: 70, PENDING: 60, 'Pending ': 40, Pendng: 20, Rejected: 2000, REJECTED: 100, Reject: 90, Transferred: 800, Transfered: 60, Forwarded: 50 }));
  assert.equal(groupOf(gs, 'Pendng').canonical, 'Pending'); assert.equal(groupOf(gs, 'Transfered').canonical, 'Transferred'); assert.equal(groupOf(gs, 'Reject').canonical, 'Rejected');
  assert.ok(groupOf(gs, 'DISPOSED').variants.length >= 3);
  assert.ok(!groupOf(gs, 'Closed'), '"Closed" is a synonym, not a spelling: it stays for the person to merge');
});
test('apply changes only the chosen group, in the chosen spelling', () => {
  const rows = [['a', 'Kishangrah'], ['b', 'KISHANGARH'], ['c', 'Kishangarh'], ['d', 'Beawar'], ['e', 'Byawar']];
  const gs = V.groups(bag({ Kishangarh: 40, Kishangrah: 3, KISHANGARH: 5, Beawar: 30, Byawar: 2 }));
  const map = V.mappingOf(gs, gs.map(g => g.canonical === 'Beawar' ? false : true));
  assert.equal(V.apply(rows, 1, map), 2); assert.deepEqual(plain(rows.map(r => r[1])), ['Kishangarh', 'Kishangarh', 'Kishangarh', 'Beawar', 'Byawar']);
  assert.deepEqual(plain(V.mappingOf(gs, gs.map(g => g.canonical === 'Kishangarh' ? 'KISHANGARH' : false))), { Kishangarh: 'KISHANGARH', Kishangrah: 'KISHANGARH' });
});
test('a column with thousands of different values (names, IDs) is only grouped by format, not compared pair by pair', () => {
  const vals = []; for (let i = 0; i < 1500; i++) vals.push('Person ' + i); vals.push('person 7');
  const t = Date.now(), gs = V.groups(vals); assert.ok(Date.now() - t < 800);
  assert.equal(gs.length, 1); assert.equal(gs[0].kind, 'format');
});
test('values merged by hand go through the same mapping', () => {
  const g = [{ canonical: 'Disposed', kind: 'manual', n: 30400, variants: [{ v: 'Disposed', n: 30000 }, { v: 'Closed', n: 400 }] }];
  assert.deepEqual(plain(V.mappingOf(g, [true])), { Closed: 'Disposed' });
});
test('a truncated word is a spelling of the full word ("Reject" / "Rejected")', () => {
  const gs = V.groups(bag({ Rejected: 2500, REJECTED: 100, Reject: 350, Transferred: 800, Transfered: 210 }));
  assert.equal(groupOf(gs, 'Reject').canonical, 'Rejected'); assert.equal(groupOf(gs, 'Transfered').canonical, 'Transferred'), 'one letter in a long word is a typo even when it is common';
});
test('a prefix rule does not join different words that merely start alike ("Open" / "Opening hours")', () => {
  assert.equal(V.groups(bag({ Pending: 900, 'Pending approval': 500 })).length, 0, 'two frequent values are two values');
  assert.equal(V.groups(bag({ Water: 1000, Waterlogging: 200 })).length, 0, 'a different word is left alone');
});
test('a two-letter typo in a 6+ letter word is grouped even when about one row in ten has it', () => {
  const gs = V.groups(bag({ Masuda: 50, Masooda: 5, MASUDA: 4 }));
  assert.equal(gs.length, 1); assert.equal(gs[0].canonical, 'Masuda'); assert.equal(gs[0].variants.length, 3);
  assert.equal(V.groups(bag({ Masuda: 50, Masooda: 25 })).length, 0, 'but when a quarter of the rows has it, it may be a real second value');
});
