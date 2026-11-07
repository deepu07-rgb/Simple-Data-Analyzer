const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./load');

const ctx = sandbox(['web/js/tasks/30-messy-file-fixer.js', 'web/js/reports/41-pendency-radar.js']);
const P = ctx.STL.pend;
const plain = x => JSON.parse(JSON.stringify(x));

test('Indian financial year runs April to March', () => {
  const ms = (y, m, d) => Date.UTC(y, m - 1, d);
  assert.equal(P.fy(ms(2025, 3, 31)), '2024-25');
  assert.equal(P.fy(ms(2025, 4, 1)), '2025-26');
  assert.equal(P.fy(ms(2026, 1, 15)), '2025-26');
  assert.equal(P.fy(ms(1999, 12, 31)), '1999-00');
  assert.equal(P.iso(P.fyStart(ms(2026, 1, 15))), '2025-04-01');
});

test('dates are day-first, month-first only when day-first is impossible; bad dates are rejected', () => {
  assert.equal(P.iso(P.parseDate('03/04/2025')), '2025-04-03');
  assert.equal(P.iso(P.parseDate('04/15/2025')), '2025-04-15');
  assert.equal(P.iso(P.parseDate('2025-04-03')), '2025-04-03');
  assert.equal(P.iso(P.parseDate('३/४/२०२५')), '2025-04-03');
  assert.equal(P.parseDate('31/02/2025'), null);
  assert.equal(P.parseDate('hello'), null);
  assert.equal(P.parseDate(''), null);
  assert.equal(P.iso(P.parseDate('45000', true)), '2023-03-15');
  assert.equal(P.parseDate('45000', false), null);
});

test('status words are classified in Hindi and English', () => {
  for (const v of ['Pending', 'लंबित', 'Under Investigation', 'विचाराधीन', 'जाँच जारी']) assert.equal(P.classify(v), 'pending', v);
  for (const v of ['Disposed', 'निस्तारित', 'Closed', 'चालान पेश', 'Final Report', 'निपटारा']) assert.equal(P.classify(v), 'closed', v);
  assert.equal(P.classify('कुछ और'), 'unknown');
  assert.equal(P.classify('Disposed, appeal pending'), 'unknown');   // contains both kinds of word: ask the user
});

const ASON = '2025-12-31';
const day = n => { const d = new Date(Date.UTC(2025, 11, 31) - n * 86400000); return d.toISOString().slice(0, 10); };
const H = ['प्रकरण संख्या', 'पंजीयन दिनांक', 'थाना', 'स्थिति'];
const ROWS = [
  ['1', day(10), 'कोतवाली', 'लंबित'], ['2', day(30), 'कोतवाली', 'लंबित'], ['3', day(31), 'कोतवाली', 'लंबित'],
  ['4', day(100), 'कोतवाली', 'लंबित'], ['5', day(400), 'सांगानेर', 'लंबित'], ['6', day(200), 'सांगानेर', 'लंबित'],
  ['7', day(5), 'सांगानेर', 'निस्तारित'], ['8', day(90), 'सांगानेर', 'लंबित'], ['9', day(91), 'सांगानेर', 'लंबित'],
  ['10', '', 'सांगानेर', 'लंबित'], ['11', day(-3), 'सांगानेर', 'लंबित'],
];

test('guess finds the date, status and group columns from the headers and values', () => {
  const g = P.guess(H, ROWS);
  assert.deepEqual(plain(g), { date: 1, status: 3, group: 2 });
});

test('ageing buckets: boundaries are inclusive (30 is in 0–30, 31 in 31–90)', () => {
  const r = plain(P.compute(ROWS, { dateCol: 1, statusCol: 3, groupCol: 2, pendingValues: ['लंबित'], asOn: ASON }));
  assert.deepEqual(r.labels, ['0–30', '31–90', '91–180', '181–365', '>365']);
  const g = Object.fromEntries(r.groups.map(x => [x.name, x]));
  assert.deepEqual(g['कोतवाली'].counts, [2, 1, 1, 0, 0]);          // ages 10,30 | 31 | 100
  assert.deepEqual(g['सांगानेर'].counts, [0, 1, 1, 1, 1]);          // 90 | 91 | 200 | 400
  assert.equal(r.total.total, 8);
  assert.equal(r.notPending, 1);                                     // the disposed case
  assert.equal(r.undated, 1);                                        // pending but no date: counted apart, never guessed
  assert.equal(r.future, 1);                                         // registration date after "as on": reported as a data error
  assert.equal(g['सांगानेर'].oldest, 400);
});

test('over-180-day share', () => {
  const r = P.compute(ROWS, { dateCol: 1, statusCol: 3, groupCol: 2, pendingValues: ['लंबित'], asOn: ASON });
  const g = Object.fromEntries(r.groups.map(x => [x.name, x]));
  assert.equal(g['सांगानेर'].over180, 2);
  assert.ok(Math.abs(g['सांगानेर'].over180Pct - 50) < 1e-9);          // 2 of 4 dated pending cases
  assert.equal(r.total.over180, 2);
});

test('deadline: overdue and due-soon lists', () => {
  const r = plain(P.compute(ROWS, { dateCol: 1, statusCol: 3, groupCol: 2, pendingValues: ['लंबित'], asOn: ASON, deadlineDays: 90, windowDays: 15 }));
  assert.deepEqual(r.overdue.map(x => x.age), [400, 200, 100, 91]);
  assert.deepEqual(r.near.map(x => x.age), [90]);                    // 75..90 days: 90 is due today, not yet overdue
  assert.equal(r.near[0].left, 0);
  assert.equal(r.overdueCount, 4);
});

test('no status column means every dated row counts as pending', () => {
  const r = P.compute(ROWS, { dateCol: 1, statusCol: -1, groupCol: -1, asOn: ASON });
  assert.equal(r.total.total, 9);                                    // 11 rows - 1 undated - 1 future
  assert.equal(r.groups.length, 1);
});

test('custom bucket edges', () => {
  const r = P.compute(ROWS, { dateCol: 1, statusCol: 3, groupCol: -1, pendingValues: ['लंबित'], asOn: ASON, edges: [60, 120] });
  assert.deepEqual(plain(r.labels), ['0–60', '61–120', '>120']);
  assert.deepEqual(plain(r.total.counts), [3, 3, 2]);
});

test('weekly snapshots show the trend and the biggest movers', () => {
  const a = P.snapshot(P.compute(ROWS, { dateCol: 1, statusCol: 3, groupCol: 2, pendingValues: ['लंबित'], asOn: '2025-12-24' }));
  const b = P.snapshot(P.compute(ROWS, { dateCol: 1, statusCol: 3, groupCol: 2, pendingValues: ['लंबित'], asOn: ASON }));
  b.groups['कोतवाली'].total += 5;                                   // simulate growth
  b.total += 5;
  const t = plain(P.trend([b, a]));                                   // order given backwards on purpose
  assert.equal(t[0].asOn, '2025-12-24');
  assert.equal(t[1].delta, b.total - a.total);
  assert.deepEqual(t[1].biggestRise, { name: 'कोतवाली', delta: 5 });
});
