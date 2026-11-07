/*
 * A 600,000-row file in Large File mode (over 10 MB): every number must equal a calculation made here from the raw rows (nothing from a sample):
 *   - a value that only ~600 rows carry (a 4,000-row sample would miss it) is counted exactly through the question box
 *   - a text outcome ("how often Level = High") is explained, in percent, with the same shares as an independent calculation
 *   - a number with a few huge values is explained on a log scale
 *   - a dependence that exists only for one group at high hours ("It depends on …") is found
 *   STELLURA_HOME=/tmp/stl-home PORT=5055 python app.py ;  BASE=http://127.0.0.1:5055 node tests/e2e/scale.e2e.js
 */
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:5000';
let failures = 0; const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x).slice(0, 500))); if (!c) failures++; };
let seed = 5; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }, norm = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const N = 600000, rows = [], dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-scale-')), CSV = path.join(dir, 'scale.csv');
for (let i = 0; i < N; i++) { const g = i % 1000 === 7 ? 'Rare' : ['A', 'B', 'C'][i % 3], h = -20 * Math.log(1 - rnd()), use = rnd() < 0.5 ? 'X' : 'Y', hi = rnd() < 1 / (1 + Math.exp(-(h - 20) / 6)), lvl = rnd() < 0.05 ? '' : (hi ? 'High' : 'Low'), streams = Math.round(Math.exp(9 + 2 * (lvl === 'High') + 1.6 * norm())), gain = 0.2 + 0.1 * norm() - (use === 'Y' && h > 15 ? 0.03 * (h - 15) : 0);
  rows.push([g, h.toFixed(2), use, lvl, String(streams), gain.toFixed(3)]); }
fs.writeFileSync(CSV, ['Group,Hours,Use,Level,Streams,Gain'].concat(rows.map(r => r.join(','))).join('\n'));
// ---- the independent calculation (from the raw rows)
function omega(keyOf, yOf) { const g = {}; rows.forEach(r => { const y = yOf(r); if (y === null) return; const k = keyOf(r), o = g[k] || (g[k] = { n: 0, sy: 0, syy: 0 }); o.n++; o.sy += y; o.syy += y * y; });
  const L = Object.values(g), n = L.reduce((a, l) => a + l.n, 0), sy = L.reduce((a, l) => a + l.sy, 0), m = sy / n; let ssb = 0, ssw = 0; L.forEach(l => { const mi = l.sy / l.n; ssb += l.n * (mi - m) ** 2; ssw += Math.max(l.syy - l.n * mi * mi, 0); }); const sst = ssb + ssw, msw = ssw / (n - L.length); return Math.max(0, (ssb - (L.length - 1) * msw) / (sst + msw)); }
const hs = rows.map(r => +r[1]).sort((a, b) => a - b), q = p => { const x = (hs.length - 1) * p, lo = Math.floor(x); return hs[lo] + (hs[Math.ceil(x)] - hs[lo]) * (x - lo); }, e = [hs[0]]; [0.2, 0.4, 0.6, 0.8].forEach(p => { if (q(p) > e[e.length - 1]) e.push(q(p)); }); e.push(hs[hs.length - 1]);
const band = h => { for (let i = 0; i < e.length - 2; i++) if (h < e[i + 1]) return i; return e.length - 2; };
const truth = { rare: rows.filter(r => r[0] === 'Rare').length, omHours: omega(r => band(+r[1]), r => r[3] === '' ? null : (r[3] === 'High' ? 1 : 0)), omGroup: omega(r => r[0], r => r[3] === '' ? null : (r[3] === 'High' ? 1 : 0)), omLogHigh: omega(r => r[3] || '(blank)', r => Math.log1p(+r[4])) };
(async () => {
  const browser = await chromium.launch(); const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); const external = [], errors = [];
  await page.route('**/*', r => /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:|about:)/.test(r.request().url()) ? r.continue() : (external.push(r.request().url()), r.abort()));
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/503|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('stellura_tour_done', '1'); localStorage.setItem('sda_first_run', 'done'); } catch (x) {} });
  await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(800); const ev = (f, a) => page.evaluate(f, a), wait = ms => page.waitForTimeout(ms);
  const t0 = Date.now(); await page.setInputFiles('#fileInput', CSV); await page.waitForFunction(n => window.BIG && BIG.active && BIG.matched === n, N, { timeout: 120000 }).catch(async x => { console.log('state', JSON.stringify(await page.evaluate(() => ({ big: !!(window.BIG && BIG.active), matched: window.BIG && BIG.matched, total: window.BIG && BIG.total, toast: (document.querySelector('.toast') || {}).innerText })))); throw x; }); ok(true, N.toLocaleString() + ' rows opened in Large File mode in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s'); await wait(600);
  // the question box counts EVERY row
  await ev(() => STL.openAsk()); await page.waitForSelector('#akQ'); await page.fill('#akQ', 'how many Rare group rows'); await page.press('#akQ', 'Enter'); await page.waitForFunction(() => /of [\d,]+ rows/.test(document.getElementById('akOut').innerText), null, { timeout: 30000 });
  const cnt = await ev(() => document.getElementById('akOut').innerText.replace(/\s+/g, ' ')); ok(new RegExp('\\b' + truth.rare + ' of ' + N.toLocaleString('en-IN').replace(/,/g, ',?'), 'i').test(cnt.replace(/,/g, '')) || cnt.replace(/,/g, '').includes(truth.rare + ' of ' + N), 'The question box counts the ' + truth.rare + ' “Rare” rows exactly (a 4,000-row sample holds about ' + Math.round(truth.rare * 4000 / N) + ')', cnt);
  await ev(() => document.getElementById('akX').click());
  // text outcome through the engine
  const H = await ev(() => BIG.headers), c = n => H.indexOf(n);
  await ev(a => STL.openDrivers({ y: a, yCat: { col: a, value: 'High' } }), c('Level')); await page.waitForFunction(() => document.querySelector('#drOut table'), null, { timeout: 120000 }); await wait(500);
  const tbl = await ev(() => Array.from(document.querySelectorAll('#drOut table tr')).slice(1).map(t => Array.from(t.cells).slice(0, 2).map(x => x.innerText.replace(/\s+/g, ' ').trim())));
  const share = n => { const r = tbl.find(x => x[0].startsWith(n)); return r ? parseFloat(r[1]) : NaN; };
  ok(await ev(() => /Level = High/.test(document.querySelector('#drOut .fr-verdict').innerText)), 'A text outcome is explained on a large file: “Level = High”');
  ok(Math.abs(share('Hours') - truth.omHours * 100) < 0.06, 'Hours explains ' + share('Hours') + '% of how often Level is High; independent calculation ' + (truth.omHours * 100).toFixed(3) + '%', tbl);
  ok(Math.abs(share('Group') - truth.omGroup * 100) < 0.06, 'Group (with the rare value) explains ' + share('Group') + '%; independent ' + (truth.omGroup * 100).toFixed(3) + '%', tbl);
  await ev(() => document.getElementById('drX').click());
  // log scale
  await ev(a => STL.openDrivers({ y: a }), c('Streams')); await page.waitForFunction(() => document.querySelector('#drOut table'), null, { timeout: 120000 }); await wait(500);
  const t2 = await ev(() => ({ v: document.querySelector('#drOut .fr-verdict').innerText.replace(/\s+/g, ' '), rows: Array.from(document.querySelectorAll('#drOut table tr')).slice(1).map(t => Array.from(t.cells).slice(0, 2).map(x => x.innerText.replace(/\s+/g, ' ').trim())) }));
  const lv = t2.rows.find(r => r[0].startsWith('Level')); ok(/log scale/.test(t2.v) && lv && Math.abs(parseFloat(lv[1]) - truth.omLogHigh * 100) < 0.06, 'Streams (a few huge values) is explained on a log scale: Level ' + (lv && lv[1]) + ' against independent ' + (truth.omLogHigh * 100).toFixed(3) + '%', t2);
  await ev(() => document.getElementById('drX').click());
  // a dependence
  await ev(a => STL.openDrivers({ y: a }), c('Gain')); await page.waitForFunction(() => document.querySelector('#drOut table'), null, { timeout: 120000 }); await wait(500);
  const dep = await ev(() => Array.from(document.querySelectorAll('#drOut .big-note[style*="6d5bd0"]')).map(x => x.innerText));
  ok(dep.some(t => /Hours/.test(t) && /Use/.test(t) && /Y/.test(t)), '“It depends on …” finds that Hours matter only for Use = Y, from every row', dep);
  // Fair comparison of a yes/no outcome on every row of the large file: Use X vs Y, among rows in the same Group (the rare one included)
  await ev(a => STL.openFair({ y: a[0], f: a[1], adj: [a[2]], yCat: { col: a[0], value: 'High' } }), [c('Level'), c('Use'), c('Group')]);
  await page.waitForFunction(() => document.querySelector('#frOut .fr-verdict') && STL.fair.last && STL.fair.last.pct, null, { timeout: 120000 }); await wait(500);
  const fr = await ev(() => ({ ref: STL.fair.last.ref, main: STL.fair.last.main.level, raw: STL.fair.last.main.raw.diff, adj: STL.fair.last.main.adj.diff, n: STL.fair.last.n }));
  const known = rows.filter(r => r[3] !== ''), yes = r => r[3] === 'High' ? 100 : 0, grp = {}; known.forEach(r => { const o = grp[r[0]] || (grp[r[0]] = { n1: 0, s1: 0, n0: 0, s0: 0 }); if (r[2] === fr.main) { o.n1++; o.s1 += yes(r); } else { o.n0++; o.s0 += yes(r); } });
  let num = 0, den = 0; Object.values(grp).forEach(o => { if (o.n1 && o.n0) { const w = o.n1 * o.n0 / (o.n1 + o.n0); num += w * (o.s1 / o.n1 - o.s0 / o.n0); den += w; } });
  const mean = u => { const x = known.filter(r => r[2] === u); return x.reduce((a, r) => a + yes(r), 0) / x.length; };
  ok(fr.n === known.length, 'Fair comparison of “Level = High” uses every row that has a level: ' + fr.n + ' = ' + known.length, fr);
  ok(Math.abs(fr.raw - (mean(fr.main) - mean(fr.ref))) < 1e-6, 'plain gap in percentage points equals the calculation from the raw rows: ' + fr.raw.toFixed(4), [fr.raw, mean(fr.main) - mean(fr.ref)]);
  ok(Math.abs(fr.adj - num / den) < 1e-6, 'gap among rows of the same Group (rare group included) equals the independent calculation: ' + fr.adj.toFixed(4) + ' vs ' + (num / den).toFixed(4));
  await ev(() => document.getElementById('frX').click());
  ok(errors.length === 0, 'No JavaScript errors', errors); ok(external.length === 0, 'No request left the computer', external);
  await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); console.log(failures ? failures + ' FAILED' : 'ALL PASSED'); process.exit(failures ? 1 : 0);
})().catch(x => { console.error(x); process.exit(1); });
