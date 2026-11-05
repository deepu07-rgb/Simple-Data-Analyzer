/*
 * Analyst tools in a real browser, with all external network blocked: "What explains this?" (key drivers), numbers grouped
 * into bands on the x axis, the "% of rows where…" measure, and the warning for a label that is given by the number.
 *   STELLURA_HOME=/tmp/stl-home PORT=5055 python app.py
 *   BASE=http://127.0.0.1:5055 node tests/e2e/analyst.e2e.js        (SHOTS=/some/dir to keep screenshots)
 * Expected ω² values come from Python (tests/unit/fixtures/fair_fixture.json).
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:5000';
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'unit', 'fixtures', 'fair_fixture.json'), 'utf8'));
let failures = 0;
const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x))); if (!c) failures++; };
// rating, delivery, price range, city + a temperature-like number and a tier that is GIVEN by the rating (with a second test)
// + a cost that only follows the price range (a stand-in)
const temp = i => 30 + (i * 37) % 43;
// + a cost capped at 1,000, and a column calculated from two others (cost ÷ rating)
const cost = (r, i) => Math.min(+r[2] * 300 + (i * 13) % 97, 1000);
const line = (r, i) => r.join(',') + ',' + temp(i) + ',' + ((+r[0] >= 4 && temp(i) >= 50) ? 'Gold' : (+r[0] < 2.5 && temp(i) < 45) ? 'Poor' : 'Normal') + ',' + cost(r, i) + ',' + (cost(r, i) / +r[0]).toFixed(2);
const csv = reps => Buffer.from('Rating,Online delivery,Price range,City,Temperature,Tier,Cost for two,Cost per point\n' + Array.from({ length: reps }, () => FX.rows.map(line).join('\n')).join('\n') + '\n', 'utf8');
const pct = x => Math.round(x * 1000) / 10;

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const external = [], errors = [];
  await page.route('**/*', r => /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:|about:)/.test(r.request().url()) ? r.continue() : (external.push(r.request().url()), r.abort()));
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/503|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('stellura_tour_done', '1'); localStorage.setItem('sda_first_run', 'done'); } catch (e) {} });
  await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(1200);
  const ev = (fn, a) => page.evaluate(fn, a), wait = ms => page.waitForTimeout(ms);
  const shot = async n => { if (process.env.SHOTS) { await wait(500); await page.screenshot({ path: path.join(process.env.SHOTS, n + '.png') }); } };
  const drivers = async () => { await page.waitForFunction(() => document.querySelector('#drOut table'), null, { timeout: 30000 }); await wait(400);
    return ev(() => ({ y: document.getElementById('drY').selectedOptions[0].text, text: document.getElementById('drOut').innerText, rows: Array.from(document.querySelectorAll('#drOut tr')).map(t => t.innerText.replace(/\s+/g, ' ')), cells: Array.from(document.querySelectorAll('#drOut table:not(.dr-rule) tr')).slice(1).map(t => [t.cells[0].innerText.split('\n')[0].replace(/ ⚠| \(5 bands\)/g, '').trim(), t.cells[1] ? t.cells[1].innerText : '']) })); };
  const share = (d, name) => { const c = d.cells.find(x => x[0] === name); return c ? parseFloat(c[1]) : NaN; };

  await page.setInputFiles('#fileInput', { name: 'restaurants.csv', mimeType: 'text/csv', buffer: csv(1) });
  await page.waitForFunction(() => typeof rawData !== 'undefined' && rawData.length === 3000, null, { timeout: 15000 }); await wait(500);

  // ---- What explains this? from the Studio, in one click
  await ev(() => STL.openChartStudio({ type: 'column', spec: { x: 1, ys: [{ col: 0, fn: 'avg' }] } })); await wait(800);
  await ev(() => document.getElementById('csDrv').click());
  let d = await drivers(); await shot('drivers');
  ok(d.y === 'Rating', 'The Studio opens it for the chart\'s number (' + d.y + ')', d.y);
  ok(Math.abs(share(d, 'Price range') - pct(FX.omega.price[0])) < 0.051 && Math.abs(share(d, 'Online delivery') - pct(FX.omega.f[0])) < 0.051, 'ω² equals Python: Price range ' + share(d, 'Price range') + '%, Online delivery ' + share(d, 'Online delivery') + '%', d.rows);
  ok(/go most with “Price range”/.test(d.text), 'It says in words what goes most with the rating', d.text.slice(0, 300));
  ok(/“Tier” may be a label given BY “Rating”/.test(d.text) && d.rows.some(r => /^Tier ⚠/.test(r)), 'It warns that “Tier” looks like a label given by the rating', d.rows);
  ok(share(d, 'Temperature') >= 0 && d.rows.some(r => /^Temperature \(5 bands\)/.test(r)), 'Number columns take part in five bands', d.rows);
  ok(/“Cost for two” mostly stands in for “Price range”: it explains [\d.]+% overall but only [\d.]+% inside each “Price range” group/.test(d.text) && d.rows.some(r => /^Cost for two .*↳ mostly through Price range/.test(r)), 'A cost that only follows the price range is called a stand-in, not a cause', d.text.slice(0, 900));
  ok(!/Next: [^\n]*Cost for two/.test(d.text), 'The stand-in is not offered as the next factor', d.text.slice(0, 600));
  const rule = await ev(() => ({ head: (Array.from(document.querySelectorAll('#drOut .prj-sub')).find(e => /How “Tier” is made/.test(e.innerText)) || {}).innerText, rows: Array.from(document.querySelectorAll('.dr-rule tr')).slice(1).map(t => t.innerText.replace(/\s+/g, ' ').trim()) }));
  console.log('  rule heading:', rule.head);
  ok(/right for 100% of all 3,000 rows/.test(rule.head || '') && rule.rows.length === 3 && /^1 Rating ≥ 4 and Temperature ≥ 50 Gold /.test(rule.rows[0]) && /^2 Rating < 2\.5 and Temperature < 45 Poor /.test(rule.rows[1]) && /^otherwise Normal /.test(rule.rows[2]), 'It writes the rule behind “Tier” as a short list read from the top (' + rule.rows.join(' | ') + ')', rule);
  ok(/A rule on .*Rating.*Temperature.* reproduces it for 100% of rows/.test(d.text), 'The summary says the tier follows a rule', d.text.slice(0, 1200));
  await page.waitForFunction(() => /Columns calculated from others/.test((document.getElementById('drCols') || {}).textContent || ''), null, { timeout: 15000 }); await wait(300);
  const cc = await ev(() => ({ cols: document.getElementById('drCols').innerText, res: document.getElementById('drOut').innerText }));
  ok(/Cost per point = Cost for two ÷ Rating/.test(cc.cols) && /“Cost for two” stops at 1,?000: [\d,]+ rows \([\d.]+%\) sit exactly on it — a cap/.test(cc.cols), 'It finds the formula behind “Cost per point” and the cap on “Cost for two” (' + cc.cols.replace(/\n/g, ' | ').slice(0, 300) + ')', cc.cols);
  ok(/look calculated from “Rating”[^\n]*Cost per point/.test(cc.res), 'A column calculated FROM the rating is moved to the results', cc.res.slice(0, 1500));
  // Chart button opens the Studio on that column
  await ev(() => document.querySelector('#drOut [data-ch="2"]').click()); await wait(900);
  ok(await ev(() => !!document.getElementById('chartStudio') && STL.charts && document.getElementById('csX').value === '2'), 'The 📊 button draws the rating by that column', await ev(() => document.getElementById('csX') && document.getElementById('csX').value));
  // Fair comparison does not adjust for the label by itself
  await ev(() => STL.openFair({ y: 0, f: 1 })); await page.waitForFunction(() => document.querySelector('#frOut .fr-verdict'), null, { timeout: 15000 }); await wait(500);
  const adj = await ev(() => Array.from(document.querySelectorAll('#frOut, .fr-form')).map(e => e.innerText).join(' '));
  ok(!/alike in [^.]*Tier/.test(adj) && /alike in [^.]*Price range/.test(adj), 'Fair comparison adjusts for Price range, not for the Tier label', adj.slice(0, 400));
  await ev(() => document.getElementById('frX').click());
  // number adjusters as a straight line: the gap equals the row-level regression
  await ev(() => STL.openFair({ y: 0, f: 1, adj: [2, 4] })); await page.waitForFunction(() => document.querySelector('#frOut .fr-verdict'), null, { timeout: 15000 }); await wait(400);
  ok(await ev(() => document.getElementById('frLinW').style.display !== 'none' && document.getElementById('frLin').value === 'auto'), 'With a number column to adjust for, the shape is chosen automatically by default');
  await page.waitForFunction(() => /fits the data best \(lowest AIC/.test((document.querySelector('#frOut .fr-how') || {}).textContent || ''), null, { timeout: 15000 });
  const auto = await ev(() => document.querySelector('#frOut .fr-how b').textContent);
  ok(/Number columns adjusted for as (5 bands|a straight line|a curve) — it fits the data best \(lowest AIC; others: .+\+\d+/.test(auto), 'It says which shape it chose and by how much it fits better (' + auto + ')', auto);
  await page.selectOption('#frLin', 'line'); await page.waitForFunction(() => /straight line/.test((document.querySelector('#frOut .fr-how') || {}).textContent || ''), null, { timeout: 15000 }); await wait(300);
  const lin = await ev(() => { const row = Array.from(document.querySelectorAll('.fr-tbl tr')).find(t => /^Yes/.test(t.innerText)); const want = STL.fair.linearFit(rawData, rawData.map((_, i) => i), { y: 0, factor: 1, cats: [2], lins: [4], ref: 'No' }); return { row: row && row.innerText.replace(/\s+/g, ' '), want: want.levels.Yes[0], text: document.querySelector('#frOut .fr-verdict').innerText }; });
  const shown = +((/([−+-]\d+\.\d\d) \(/.exec((lin.row || '').split(')').slice(1).join(')')) || ['', 'NaN'])[1].replace('−', '-'));
  ok(Math.abs(shown - lin.want) < 0.006 && /Temperature \(straight line\)/.test(lin.text), 'Like-for-like gap with Temperature as a straight line: ' + shown + ' (regression ' + lin.want.toFixed(4) + ')', lin);
  await ev(() => document.getElementById('frX').click());

  // ---- bands on the x axis and the % measure
  await ev(() => STL.openChartStudio({ type: 'column', spec: { x: 4, ys: [{ col: 0, fn: 'avg' }] } })); await wait(900);
  let st = await ev(() => ({ band: document.getElementById('csBand').value, bars: echarts.getInstanceByDom(document.getElementById('csChart')).getOption().xAxis[0].data }));
  ok(+st.band > 0 && st.bars.length <= 8 && st.bars.every(b => /–/.test(b)), 'A number with many values on the x axis is grouped into bands by itself (' + st.bars.join(' | ') + ')', st);
  const want = {}; FX.rows.forEach((r, i) => { const t = temp(i), k = st.bars.find(b => { const [lo, hi] = b.split('–').map(Number); return t >= lo && (t < hi || (hi === 80 && t <= hi)); }); if (k) { (want[k] = want[k] || []).push(+r[0]); } });
  const got = await ev(() => { const o = echarts.getInstanceByDom(document.getElementById('csChart')).getOption(); return o.series[0].data.map(v => typeof v === 'object' ? v.value : v); });
  ok(st.bars.every((b, i) => Math.abs(got[i] - want[b].reduce((a, x) => a + x, 0) / want[b].length) < 0.006), 'Band averages equal a hand count', { got, bars: st.bars });
  await ev(() => STL.openChartStudio({ type: 'column', spec: { x: 2, ys: [{ col: 0, fn: 'pct', op: '>=', value: '4' }] } })); await wait(900);
  const pc = await ev(() => { const o = echarts.getInstanceByDom(document.getElementById('csChart')).getOption(); return { cats: o.xAxis[0].data, v: o.series[0].data.map(v => typeof v === 'object' ? v.value : v), name: o.series[0].name, op: document.querySelector('[data-mo="0"]') && document.querySelector('[data-mo="0"]').value }; });
  const wp = {}; FX.rows.forEach(r => { const k = String(r[2]); (wp[k] = wp[k] || [0, 0])[1]++; if (+r[0] >= 4) wp[k][0]++; });
  ok(pc.op === '>=' && pc.cats.every((k, i) => Math.abs(pc.v[i] - 100 * wp[k][0] / wp[k][1]) < 0.01), '“% of rows where Rating ≥ 4” per price range equals a hand count (' + pc.cats.map((k, i) => k + ': ' + pc.v[i].toFixed(1) + '%').join(', ') + ')', pc);
  ok(/Rating ≥ 4/.test(pc.name), 'The series is named after the condition (' + pc.name + ')', pc.name);
  await shot('pct'); await ev(() => document.getElementById('csX') && document.querySelector('#chartStudio .stl-x, #csClose') && document.querySelector('#csClose').click());

  // ---- the same in Large File mode (the engine adds up every row)
  await ev(c => { BIG.openFile(new File([c], 'restaurants_big.csv', { type: 'text/csv' })); }, csv(4).toString('utf8'));
  await page.waitForFunction(() => window.BIG && BIG.active && BIG.matched === 12000, null, { timeout: 30000 }); await wait(800);
  await ev(() => STL.openDrivers({ y: 0 })); d = await drivers(); await shot('drivers-big');
  ok(/Calculated by the engine from all rows/.test(d.text), 'Large file: the engine ranks the columns from all 12,000 rows', d.text.slice(-200));
  ok(Math.abs(share(d, 'Price range') - pct(FX.omega.price[0])) < 0.11 && /“Tier” may be a label/.test(d.text), 'Large file: same ω² for Price range (' + share(d, 'Price range') + '%) and the same Tier warning', d.rows);
  const brule = await ev(() => ({ head: (Array.from(document.querySelectorAll('#drOut .dr-rule-h'))[0] || {}).textContent, note: document.getElementById('drOut').innerText, rows: Array.from(document.querySelectorAll('.dr-rule tr')).slice(1).map(t => t.innerText.replace(/\s+/g, ' ').trim()) }));
  ok(/“Cost for two” mostly stands in for “Price range”/.test(d.text), 'Large file: the stand-in is found by the engine from all rows', d.text.slice(0, 600));
  await ev(() => document.getElementById('drX').click());
  await ev(() => STL.openColumnChecks()); await page.waitForFunction(() => /Columns calculated/.test((document.getElementById('ccOut') || {}).textContent || ''), null, { timeout: 30000 }); await wait(300);
  const bcc = await ev(() => document.getElementById('ccOut').innerText);
  ok(/Cost per point = Cost for two ÷ Rating \(true in every row, all 12,000 rows checked\)/.test(bcc) && /stops at 1,?000/.test(bcc), 'Large file: formula and cap found on the sample and checked by the engine on all 12,000 rows (' + bcc.replace(/\n/g, ' | ').slice(0, 260) + ')', bcc);
  await ev(() => document.getElementById('ccX').click());
  await ev(() => STL.openFair({ y: 0, f: 1, adj: [2, 4] })); await page.waitForFunction(() => document.querySelector('#frOut .fr-verdict'), null, { timeout: 30000 }); await wait(400);
  await page.selectOption('#frLin', 'line'); await page.waitForFunction(() => /straight line/.test((document.querySelector('#frOut .fr-how') || {}).textContent || ''), null, { timeout: 30000 }); await wait(300);
  const blin = await ev(() => { const row = Array.from(document.querySelectorAll('.fr-tbl tr')).find(t => /^Yes/.test(t.innerText)); return row && row.innerText.replace(/\s+/g, ' '); });
  const bshown = +((/([−+-]\d+\.\d\d) \(/.exec((blin || '').split(')').slice(1).join(')')) || ['', 'NaN'])[1].replace('−', '-'));
  ok(Math.abs(bshown - lin.want) < 0.006, 'Large file: the engine’s straight-line gap is the same (' + bshown + ')', blin);
  await ev(() => document.getElementById('frX').click());
  await ev(() => STL.openDrivers({ y: 0 })); d = await drivers();
  ok(/right for 100% of all 12,000 rows/.test(brule.head || '') && /checked on all rows/.test(brule.note) && brule.rows.length === 3 && /^1 Rating ≥ 4 and Temperature ≥ 50 Gold /.test(brule.rows[0]), 'Large file: the rule is learned from a sample that keeps every label and checked by the engine on all 12,000 rows (' + brule.head + ')', brule);
  await ev(() => document.getElementById('drX').click());
  await ev(() => STL.openChartStudio({ type: 'column', spec: { x: 2, ys: [{ col: 0, fn: 'pct', op: '>=', value: '4' }] } }));
  await page.waitForFunction(() => document.querySelector('#csCap p'), null, { timeout: 20000 }); await wait(500);
  const pb = await ev(() => { const o = echarts.getInstanceByDom(document.getElementById('csChart')).getOption(); return { cats: o.xAxis[0].data, v: o.series[0].data.map(v => typeof v === 'object' ? v.value : v) }; });
  ok(pb.cats.every((k, i) => Math.abs(pb.v[i] - 100 * wp[k][0] / wp[k][1]) < 0.01), 'Large file: the % measure matches too', pb);
  await ev(() => STL.openChartStudio({ type: 'column', spec: { x: 4, ys: [{ col: 0, fn: 'avg' }], bands: 5 } }));
  await page.waitForFunction(() => document.querySelector('#csCap p'), null, { timeout: 20000 }); await wait(500);
  const bb = await ev(() => echarts.getInstanceByDom(document.getElementById('csChart')).getOption().xAxis[0].data);
  ok(bb.length >= 3 && bb.length <= 8 && bb.every(b => /–/.test(b)), 'Large file: number bands on the x axis (' + bb.join(' | ') + ')', bb);

  ok(errors.length === 0, 'No JavaScript errors', errors);
  ok(external.length === 0, 'No request left the computer', external);
  await browser.close();
  console.log(failures ? failures + ' FAILED' : 'ALL PASSED'); process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
