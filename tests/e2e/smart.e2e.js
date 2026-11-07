/*
 * Built-in smart analysis: unusual values, forecast, groups of similar rows — checked against independent calculations.
 *   STELLURA_HOME=/tmp/stl-home PORT=5064 python app.py ;  BASE=http://127.0.0.1:5064 node tests/e2e/smart.e2e.js
 */
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:5000';
let failures = 0; const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x).slice(0, 600))); if (!c) failures++; };
let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-smart-')), F1 = path.join(dir, 'bills.csv'), F2 = path.join(dir, 'blobs.csv'), F3 = path.join(dir, 'comments.csv');
// bills: 4 items with their own usual amount, 36 months of dates, a rising trend in the count; 3 planted wrong amounts
const items = { sugar: 400, dal: 1500, spice: 90, tea: 700 }, names = Object.keys(items), rows = [], planted = [];
for (let i = 0; i < 480; i++) { const it = names[i % 4], m = i % 36, y = 2021 + Math.floor(m / 12), mo = 1 + m % 12, base = items[it]; let amt = Math.round(base * (0.9 + rnd() * 0.2)); rows.push([it, y + '-' + String(mo).padStart(2, '0') + '-' + String(1 + (i % 27)).padStart(2, '0'), amt]); }
[[10, 9], [57, 5], [203, 12]].forEach(([i, f]) => { rows[i][2] = Math.round(items[rows[i][0]] * f); planted.push(i); });
fs.writeFileSync(F1, 'item,date,amount\n' + rows.map(r => r.join(',')).join('\n'));
// three blobs
const B = [[10, 10], [60, 15], [30, 70]], bl = []; for (let i = 0; i < 300; i++) { const c = B[i % 3]; bl.push([(c[0] + (rnd() - .5) * 8).toFixed(2), (c[1] + (rnd() - .5) * 8).toFixed(2)]); }
fs.writeFileSync(F2, 'age,spend\n' + bl.map(r => r.join(',')).join('\n'));
const CM = [['Bus came late, very bad', 'Delay', 'Negative'], ['Staff were friendly and helpful', 'Staff', 'Positive'], ['Pending for months, nobody listens', 'Delay', 'Negative'], ['The plate was clean', 'Other', 'Positive'], ['पानी की देरी, बहुत खराब', 'Delay', 'Negative'], ['स्टाफ अच्छा है, धन्यवाद', 'Staff', 'Positive'], ['काम अच्छा नहीं है', 'Other', 'Negative'], ['Staff not helpful, late reply', 'Delay; Staff', 'Negative'], ['Ordinary visit', 'Other', 'Neutral']];
fs.writeFileSync(F3, 'id,comment\n' + Array.from({ length: 450 }, (_, i) => i + ',"' + CM[i % 9][0] + '"').join('\n'));
(async () => {
  const browser = await chromium.launch(); const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); const external = [], errors = [];
  await page.route('**/*', r => /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:|about:)/.test(r.request().url()) ? r.continue() : (external.push(r.request().url()), r.abort()));
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/503|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('stellura_tour_done', '1'); localStorage.setItem('sda_first_run', 'done'); localStorage.setItem('stellura_roles_auto', '0'); } catch (x) {} });
  await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(800); const ev = (f, a) => page.evaluate(f, a), wait = ms => page.waitForTimeout(ms);
  await page.setInputFiles('#fileInput', F1); await wait(2500);
  // ---- unusual values
  await ev(() => STL.openOutliers({ y: 2, by: 0 })); await page.waitForFunction(() => /unusual|No unusual/.test((document.getElementById('ouOut') || {}).innerText || ''), null, { timeout: 30000 }); await wait(300);
  const o = await ev(() => ({ t: document.getElementById('ouOut').innerText, nums: Array.from(document.querySelectorAll('#ouOut tr td:first-child')).map(x => +x.textContent.replace(/,/g, '')) }));
  ok(planted.every(i => o.nums.indexOf(i + 1) >= 0), 'all 3 planted wrong amounts are found (rows ' + planted.map(i => i + 1) + ')', o.nums);
  ok(o.nums.length <= 6, 'and almost nothing else is flagged (' + o.nums.length + ')', o.nums);
  ok(/much higher/.test(o.t) && /times the usual/.test(o.t), 'each flagged row says why, in words');
  await ev(() => document.querySelector('#outlierDialog .dl-btn') && 1); ok(await ev(() => !!document.querySelector('#outlierDialog .dl-btn')), 'the Download menu is on the unusual-values screen');
  await ev(() => document.getElementById('outlierDialog').remove());
  // ---- forecast: independent monthly totals and straight-line fit
  const tot = {}; rows.forEach(r => { const k = r[1].slice(0, 7); tot[k] = (tot[k] || 0) + r[2]; }); const ks = Object.keys(tot).sort();
  await ev(() => STL.openForecast()); await page.waitForFunction(() => /next 6 months/.test((document.getElementById('fcOut') || {}).innerText || ''), null, { timeout: 30000 }); await wait(500);
  const fc = await ev(() => ({ t: document.getElementById('fcOut').innerText, s: STL.fcLast && STL.fcLast.series.map(x => x.value), months: STL.fcLast && STL.fcLast.series.map(x => x.month), f: STL.fcLast && STL.fcLast.fc.forecast }));
  ok(fc.months && fc.months.length === ks.length && fc.months.every((m, i) => m === ks[i]) && fc.s.every((v, i) => Math.abs(v - tot[ks[i]]) < 1e-6), 'the 36 monthly totals equal an independent sum of the file', [fc.months && fc.months.length, ks.length]);
  ok(fc.f && fc.f.length === 6 && fc.f.every(x => x.lo <= x.value && x.value <= x.hi && isFinite(x.value)), 'six forecast months, each inside its range');
  ok(/Method:/.test(fc.t) && /error of/.test(fc.t), 'the method and its held-back error are stated');
  ok(await ev(() => !!document.querySelector('#forecastDialog .dl-btn') && !!document.querySelector('#fcChart canvas')), 'the forecast chart is drawn and has the Download menu');
  await ev(() => document.getElementById('forecastDialog').remove());
  // ---- findings + asking in words
  await ev(() => STL.openFindings()); await page.waitForFunction(() => /rows and/.test((document.getElementById('fnOut') || {}).innerText || ''), null, { timeout: 30000 }); await wait(500);
  const fn = await ev(() => document.getElementById('fnOut').innerText);
  ok(/480 rows and 3 columns/.test(fn), 'the summary states the exact rows and columns', fn);
  const tot2 = rows.reduce((a, r) => a + r[2], 0); ok(fn.replace(/,/g, '').indexOf('total ' + tot2) >= 0, 'and the exact total of the amount column (' + tot2 + ')', fn);
  await ev(() => document.getElementById('findingsDialog').remove());
  const qs = await ev(() => ['show me unusual values', 'forecast the next months', 'find clusters of customers', 'give me key findings', 'असामान्य मान दिखाओ', 'अगले महीने का पूर्वानुमान'].map(q => STL.ask.parse(q, headers, rawData.slice(0, 50)).tool));
  ok(qs.join() === 'outliers,forecast,clusters,findings,outliers,forecast', 'the question box understands all four, in English and Hindi', qs);
  // ---- groups
  await page.reload({ waitUntil: 'load' }); await wait(800); await page.setInputFiles('#fileInput', F2); await wait(2500);
  await ev(() => STL.openClusters()); await page.waitForFunction(() => /groups/.test((document.getElementById('clOut') || {}).innerText || '') && !!STL.clLast, null, { timeout: 30000 }); await wait(400);
  const cl = await ev(() => ({ k: STL.clLast.pick.k, strength: STL.clLast.pick.strength, sizes: STL.clLast.groups.map(g => g.rows).sort((a, b) => b - a), t: document.getElementById('clOut').innerText }));
  ok(cl.k === 3 && cl.strength === 'clear', 'three clear groups found in three blobs', cl);
  ok(cl.sizes.every(s => s === 100), 'each group has exactly its 100 rows', cl.sizes);
  ok(/high|low/.test(cl.t), 'each group is described in words');
  await page.click('#clAdd'); await wait(1500);
  const col = await ev(() => { const i = headers.indexOf('Group'); const c = {}; rawData.forEach(r => c[r[i]] = (c[r[i]] || 0) + 1); return c; });
  ok(Object.keys(col).length === 3 && Object.values(col).every(v => v === 100), 'adding the group column labels every row (100 / 100 / 100)', col);
  // ---- tag comments
  await page.reload({ waitUntil: 'load' }); await wait(800); await page.setInputFiles('#fileInput', F3); await wait(2500);
  await ev(() => STL.openTagging()); await page.waitForSelector('#tagDialog #tgGo');
  await ev(() => { const n = document.querySelectorAll('.tgN'), w = document.querySelectorAll('.tgW'); n[0].value = 'Delay'; n[0].dispatchEvent(new Event('input')); w[0].value = 'late, pending, देरी'; w[0].dispatchEvent(new Event('input')); document.getElementById('tgAdd').click(); });
  await ev(() => { const n = document.querySelectorAll('.tgN'), w = document.querySelectorAll('.tgW'); n[1].value = 'Staff'; n[1].dispatchEvent(new Event('input')); w[1].value = 'staff, स्टाफ'; w[1].dispatchEvent(new Event('input')); });
  await page.click('#tgGo'); await page.waitForSelector('#tgKeep', { timeout: 30000 });
  const tg = await ev(() => document.getElementById('tgOut').innerText);
  const cnt = k => CM.filter(c => c[1].split('; ').indexOf(k) >= 0).length * 50, n = (a, b) => new RegExp(a + '\\s+' + b.toLocaleString('en-IN').replace(/,/g, ',?')).test(tg.replace(/\n/g, ' ').replace(/\t/g, ' '));
  ok(/Delay\s+(\d+)/.exec(tg) && +/Delay\s+(\d+)/.exec(tg)[1] === cnt('Delay'), 'topic "Delay" counts exactly ' + cnt('Delay') + ' comments (Hindi included)', tg.slice(0, 400));
  ok(+(/Staff\s+(\d+)/.exec(tg) || [])[1] === cnt('Staff'), 'topic "Staff" counts exactly ' + cnt('Staff'), tg.slice(0, 400));
  ok(+(/Other \(no topic word\)\s+(\d+)/.exec(tg) || [])[1] === cnt('Other'), '"plate" is not mistaken for "late": Other = ' + cnt('Other'));
  const fl = k => CM.filter(c => c[2] === k).length * 50;
  ok(['Positive', 'Negative', 'Neutral'].every(k => new RegExp(k + '[^\\n]*\\t' + fl(k) + '\\t').test(tg)), 'feeling counts: ' + ['Positive', 'Negative', 'Neutral'].map(k => k + ' ' + fl(k)).join(', '), tg.slice(-900));
  await page.click('#tgKeep'); await wait(2500);
  const cols = await ev(() => ({ h: headers.slice(), t: rawData.map(r => r[2]), f: rawData.map(r => r[3]) }));
  ok(cols.h.join() === 'id,comment,comment_topic,comment_feeling' && cols.t.every((x, i) => x === CM[i % 9][1]) && cols.f.every((x, i) => x === CM[i % 9][2]), 'the two new columns are in the file and right on every one of the 450 rows', cols.h);
  const askQ = await ev(() => STL.ask.parse('what is the sentiment of the comments', headers, rawData.slice(0, 50)).tool); ok(askQ === 'tagging', 'the question box understands “sentiment of the comments”', askQ);
  ok(errors.length === 0, 'No JavaScript errors', errors); ok(external.length === 0, 'No request left the computer', external);
  await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); console.log(failures ? failures + ' FAILED' : 'ALL PASSED'); process.exit(failures ? 1 : 0);
})().catch(x => { console.error(x); process.exit(1); });
