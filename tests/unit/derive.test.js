// Found by testing a 50,000-row student file: Pre_/Post_ GPA, a text outcome (burnout), a column named "…Skill" next to "Skill_…"
const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./load');
const ctx = sandbox(['web/js/tasks/28-lexicon.js', 'web/js/tasks/29-csv-parse.js', 'web/js/tasks/30-messy-file-fixer.js', 'web/js/tasks/31-merge-anything.js', 'web/js/reports/41-pendency-radar.js', 'web/js/charts/60-chart-engine.js', 'web/js/charts/65-fair-compare.js', 'web/js/charts/66-drivers.js', 'web/js/tasks/37-derive.js']);
const X = ctx.STL.derive, CH = ctx.STL.charts, D = ctx.STL.drivers, plain = x => JSON.parse(JSON.stringify(x));
test('before / after pairs are found from the names and named in plain words', () => {
  const H = ['Student_ID', 'Pre_Semester_GPA', 'Weekly_Hours', 'Post_Semester_GPA', 'Weight_Start', 'Weight_End', 'SalesBefore', 'SalesAfter', 'Pre', 'Prepaid_Amount'];
  const p = X.pairs(H).map(x => [H[x.before], H[x.after], x.name]);
  assert.deepEqual(plain(p), [['Pre_Semester_GPA', 'Post_Semester_GPA', 'Change in Semester GPA'], ['Weight_Start', 'Weight_End', 'Change in Weight'], ['SalesBefore', 'SalesAfter', 'Change in Sales']]);
});
test('the new column: minus, divide by zero, percent change, empty cells', () => {
  const rows = [['3.0', '3.5'], ['2', ''], ['0', '4'], ['x', '1']];
  assert.deepEqual(plain(X.compute(rows, 1, 'minus', 0)), ['0.5', '', '4', '']);
  assert.deepEqual(plain(X.compute(rows, 1, 'divide', 0)), ['1.166667', '', '', '']);
  assert.deepEqual(plain(X.compute(rows, 0, 'change', 1)), ['16.666667', '', '', '']);
  const r = X.apply(['a', 'b'], rows, 1, 'minus', 0, 'Change'); assert.deepEqual(plain(r.headers), ['a', 'b', 'Change']); assert.equal(r.rows[0][2], '0.5'); assert.equal(X.uniqueName(['a', 'Change'], 'Change'), 'Change 2');
});
// ---- a column that only shares a WORD with the explained one is not "calculated from" it
let seed = 3; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }, norm = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const H = ['Prompt_Engineering_Skill', 'Skill_Retention_Score', 'Weekly_Hours', 'Study_Hours', 'Burnout_Risk_Level'];
const rows = []; for (let i = 0; i < 4000; i++) { const lv = ['Beginner', 'Intermediate', 'Advanced'][i % 3], hrs = Math.max(0, 8 + 7 * norm()), st = Math.max(1, 11 + 5 * norm()); rows.push([lv, String((70 + 6 * (i % 3) + 8 * norm()).toFixed(2)), hrs.toFixed(2), st.toFixed(2), rnd() < 1 / (1 + Math.exp(-(hrs - 12) / 4)) ? 'High' : 'Low']); }
const idx = rows.map((_, i) => i), prof = CH.profile(H, rows, idx);
test('"Prompt_Engineering_Skill" is not called a result of "Skill_Retention_Score" just because both say Skill', () => {
  const R = D.rank(rows, idx, H, 1, { prof }), p = R.find(r => r.name === 'Prompt_Engineering_Skill'); assert.ok(p && !p.derived, 'must stay a possible cause'); assert.equal(R.filter(r => !r.derived)[0].name, 'Prompt_Engineering_Skill');
  const R2 = D.rank(rows, idx, H, 2, { prof }), s = R2.find(r => r.name === 'Study_Hours'); assert.ok(s && !s.derived, 'a shared word like Hours is not a formula');
});
test('a text outcome is explained as "how often it is High"', () => {
  const R = D.rank(rows, idx, H, 4, { prof, yFn: c => { const t = String(c == null ? '' : c).trim(); return t === '' ? null : (t === 'High' ? 1 : 0); } }); D.yFn = null;
  assert.equal(R[0].name, 'Weekly_Hours'); assert.ok(R[0].omega2 > 0.2); assert.ok(R[0].high.mean > 0.6 && R[0].low.mean < 0.3, JSON.stringify([R[0].high, R[0].low]));
  const lines = (D.yFn = c => 1, D.yFn = null, D.summary(R, 'Burnout_Risk_Level = High', false)); assert.ok(lines[0].includes('Weekly_Hours'));
});
test('GPA, retention and similar per-row scores are averaged, never added up', () => {
  const P = n => CH.profile(['Post_Semester_GPA', 'Skill_Retention_Score', 'Orders'], Array.from({ length: 60 }, (_, i) => [(2 + (i % 20) / 10).toFixed(2), String(40 + (i * 7) % 60 + 0.5), String(i)]), Array.from({ length: 60 }, (_, i) => i)).find(p => p.name === n);
  assert.equal(CH.fnFor(P('Post_Semester_GPA')), 'avg'); assert.equal(CH.fnFor(P('Skill_Retention_Score')), 'avg'); assert.equal(CH.fnFor(P('Orders')), 'sum');
});
