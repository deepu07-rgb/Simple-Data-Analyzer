// Found by testing a music file (10,000 tracks): a yes/no target (viral), 0-1 audio scores, plays that follow the target, a handful of huge play counts.
const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./load');
const ctx = sandbox(['web/js/tasks/29-csv-parse.js', 'web/js/tasks/30-messy-file-fixer.js', 'web/js/tasks/31-merge-anything.js', 'web/js/reports/41-pendency-radar.js', 'web/js/charts/60-chart-engine.js', 'web/js/charts/65-fair-compare.js', 'web/js/charts/66-drivers.js']);
const CH = ctx.STL.charts, D = ctx.STL.drivers;
let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }, norm = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const GEN = [['Pop', 0.62, 0.8], ['Rock', 0.33, 0.6], ['Jazz', 0.06, 0.4], ['Latin', 0.65, 0.85]];
const H = ['track_id', 'genre', 'release_year', 'danceability', 'tempo_bpm', 'streams', 'viral'];
const rows = []; for (let i = 0; i < 3000; i++) {
  const g = GEN[i % 4], viral = rnd() < g[1] ? 1 : 0, dance = Math.min(1, Math.max(0, g[2] + 0.12 * norm())), streams = Math.round(Math.exp(11.8 + 2.4 * viral + 1.6 * norm()));
  rows.push([`t${i}`, g[0], String(2010 + (i % 16)), dance.toFixed(3), (110 + 15 * norm()).toFixed(1), String(streams), String(viral)]);
}
const idx = rows.map((_, i) => i), prof = CH.profile(H, rows, idx), P = n => prof[H.indexOf(n)];
test('a 0-1 share is averaged, never added up; a yes/no column is a flag; a few huge values are noticed', () => {
  assert.equal(P('danceability').unit, true); assert.equal(CH.fnFor(P('danceability')), 'avg'); assert.equal(P('tempo_bpm').unit, false);
  assert.equal(P('viral').flag, true); assert.equal(P('genre').flag, false); assert.equal(P('streams').heavy, true); assert.equal(P('tempo_bpm').heavy, false); assert.equal(P('danceability').heavy, false);
});
test('the first chart is the share of the yes/no target by the grouping that goes most with it', () => {
  const rec = CH.recommend(H, rows, idx, 8)[0]; assert.equal(rec.type, 'column');
  assert.equal(rec.spec.x, H.indexOf('genre')); assert.deepEqual(JSON.parse(JSON.stringify(rec.spec.ys)), [{ col: H.indexOf('viral'), fn: 'pct', op: '=', value: '1' }]);
});
test('plays are a result of "viral", left out of its ranking; plays themselves are explained on a log scale', () => {
  const yv = H.indexOf('viral'), R = D.rank(rows, idx, H, yv, { prof }), s = R.find(r => r.name === 'streams');
  assert.ok(s && s.derived && s.derived.why === 'result'); assert.equal(R.filter(r => !r.derived)[0].name, 'genre');
  assert.ok(D.summary(R, 'viral', false).some(l => /streams.*result of it, not a cause/.test(l)));
  const ys = H.indexOf('streams'), raw = D.rank(rows, idx, H, ys, { prof }).find(r => r.name === 'viral'), lg = D.rank(rows, idx, H, ys, { prof, logY: true }).find(r => r.name === 'viral');
  assert.ok(lg.omega2 > raw.omega2 + 0.1, `log ${lg.omega2} vs raw ${raw.omega2}`); assert.ok(lg.omega2 > 0.3 && lg.omega2 < 0.5);
  D.logY = false;
});
