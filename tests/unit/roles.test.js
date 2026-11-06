// "Check your columns": the guesses in plain roles (English and Hindi headings), what a confirmed choice changes, and that nothing changes until a choice differs from the guess.
const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./load');
const ctx = sandbox(['web/js/tasks/29-csv-parse.js', 'web/js/tasks/30-messy-file-fixer.js', 'web/js/tasks/31-merge-anything.js', 'web/js/reports/41-pendency-radar.js', 'web/js/charts/60-chart-engine.js', 'web/js/charts/65-fair-compare.js', 'web/js/charts/66-drivers.js', 'web/js/charts/67-column-checks.js', 'web/js/tasks/41-column-roles.js']);
const CH = ctx.STL.charts, R = ctx.STL.roles, CC = ctx.STL.colChecks;
let seed = 3; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const H = ['', 'label', 'AMT_INCOME_TOTAL', 'DAYS_EMPLOYED', 'text', 'राशि', 'दिनांक', 'थाना', 'score', 'Case No'];
const THANA = ['कोतवाली', 'सदर', 'सिविल लाइन्स', 'महिला थाना', 'यातायात'];
const rows = Array.from({ length: 3000 }, (_, i) => [String(i), String(Math.floor(rnd() * 6)), String(30000 + Math.floor(rnd() * 900) * 500), i % 6 === 0 ? '365243' : String(-Math.floor(rnd() * 12000) - 1),
  'i feel ' + ['happy', 'sad', 'tired', 'angry'][Math.floor(rnd() * 4)] + ' about the thing that happened to me at work on day number ' + i, String(1000 + Math.floor(rnd() * 90000)), '2024-' + String(1 + (i % 12)).padStart(2, '0') + '-' + String(1 + (i % 27)).padStart(2, '0'), THANA[Math.floor(rnd() * 5)], (3 + rnd() * 2).toFixed(2), 'C-' + (100000 + i)]);
const idx = rows.map((_, i) => i), prof = CH.profile(H, rows, idx, true);
const avg = H.map((_, c) => rows.slice(0, 300).reduce((a, r) => a + r[c].length, 0) / 300), G = R.guess(H, prof, avg), role = n => G[H.indexOf(n)].role;
test('a blank-headed column of 0, 1, 2 … is a row number', () => { assert.equal(H.indexOf(''), 0); assert.equal(G[0].role, 'rowno'); });
test('label 0-5 is a code, amounts are amounts, a score is averaged', () => { assert.equal(role('label'), 'code'); assert.equal(role('AMT_INCOME_TOTAL') === 'amount' || role('AMT_INCOME_TOTAL') === 'measure', true); assert.equal(role('score'), 'measure'); });
test('Hindi headings: राशि is an amount, दिनांक a date, थाना a category', () => { assert.equal(role('राशि'), 'amount'); assert.equal(role('दिनांक'), 'date'); assert.equal(role('थाना'), 'category'); });
test('long free text is text; a different case number in every row is an ID', () => { assert.equal(role('text'), 'text'); assert.equal(role('Case No'), 'id'); });
test('365243 is found as a placeholder to offer as empty', () => { const c = CC.caps(rows, idx, H, prof).filter(x => x.placeholder); assert.equal(c.length, 1); assert.equal(c[0].name, 'DAYS_EMPLOYED'); assert.equal(c[0].value, 365243); });
test('nothing changes until a choice differs from the guess', () => {
  const H2 = H.map(h => h + ' '), p0 = CH.profile(H2, rows, idx); R.confirm(H2, G.map(g => g.role), G.map(g => g.role));
  const p1 = CH.profile(H2, rows, idx); assert.equal(JSON.stringify(p0.map(p => [p.numeric, p.unique, p.lowInt, p.serial])), JSON.stringify(p1.map(p => [p.numeric, p.unique, p.lowInt, p.serial])));
});
test('a confirmed choice changes what the app does: amount → average, code → category, text → ignored as a group', () => {
  const H3 = H.map(h => h + '  '), roles = G.map(g => g.role); roles[H.indexOf('राशि')] = 'measure'; roles[H.indexOf('label')] = 'category'; roles[H.indexOf('score')] = 'amount'; roles[H.indexOf('थाना')] = 'ignore';
  R.confirm(H3, roles, G.map(g => g.role)); const p = CH.profile(H3, rows, idx), at = n => p[H.indexOf(n)];
  assert.equal(CH.fnFor(at('राशि')), 'avg'); assert.equal(CH.fnFor(at('score')), 'sum'); assert.ok(at('label').lowInt && !CH.isMeasure(at('label')));
  assert.ok(at('थाना').ignored && at('थाना').unique);
  R.forget(H3); const q = CH.profile(H3, rows, idx); assert.equal(CH.fnFor(q[H.indexOf('score')]), 'avg', 'forgotten: back to the guess');
});
test('a measurement chosen for a row-number-like column makes it a measure', () => {
  const H4 = H.map(h => h + '   '), roles = G.map(g => g.role); roles[0] = 'measure'; R.confirm(H4, roles, G.map(g => g.role));
  const p = CH.profile(H4, rows, idx)[0]; assert.ok(p.numeric && !p.serial && CH.isMeasure(p));
});
test('a year / month / day is a period to group by, never an amount; bpm is averaged', () => {
  const Hs = ['released_year', 'released_day', 'bpm', 'streams'];
  const rs = Array.from({ length: 900 }, (_, i) => [String(1950 + i % 74), String(1 + i % 31), String(70 + (i * 7) % 130), i === 5 ? 'BPM110KeyAModeMajorDanceability53' : String(1e6 + (i * 99991) % 900000000)]);
  const ix = rs.map((_, i) => i), pf = CH.profile(Hs, rs, ix, true), g = R.guess(Hs, pf, Hs.map(() => 5));
  assert.equal(g[0].role, 'category'); assert.equal(g[1].role, 'category'); assert.equal(g[2].role, 'measure');
  assert.ok(g[3].doubt && /1 cell is not a number \(e\.g\. “BPM110/.test(g[3].why), JSON.stringify(g[3]));
});
test('a column with the same value in every row is “ignore”: it tells nothing', () => {
  const Hc = ['date', 'state', 'qty'], rs = Array.from({ length: 300 }, (_, i) => ['2026-07-05', 'तमिलनाडु', String(1 + (i * 7) % 90)]), ix = rs.map((_, i) => i), pf = CH.profile(Hc, rs, ix, true), g = R.guess(Hc, pf, [10, 8, 2]);
  assert.equal(g[0].role, 'ignore'); assert.equal(g[1].role, 'ignore'); assert.notEqual(g[2].role, 'ignore');
});
