/*
 * Fair comparison in a real browser, with all external network blocked.
 *   STELLURA_HOME=/tmp/stl-home PORT=5055 python app.py
 *   BASE=http://127.0.0.1:5055 node tests/e2e/fair.e2e.js        (SHOTS=/some/dir to keep screenshots)
 * The data (tests/unit/fixtures/fair_fixture.json) was made so that online delivery looks 0.25 WORSE in plain averages but is
 * +0.10 BETTER between restaurants of the same price range; the expected numbers come from statsmodels.
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:5000';
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'unit', 'fixtures', 'fair_fixture.json'), 'utf8'));
let failures = 0;
const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x))); if (!c) failures++; };
const csv = reps => Buffer.from('Rating,Online delivery,Price range,City\n' + Array.from({ length: reps }, () => FX.rows.map(r => r.join(',')).join('\n')).join('\n') + '\n', 'utf8');

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const external = [], errors = [];
  await page.route('**/*', r => /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:|about:)/.test(r.request().url()) ? r.continue() : (external.push(r.request().url()), r.abort()));
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/503|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('stellura_tour_done', '1'); localStorage.setItem('sda_first_run', 'done'); } catch (e) {} });
  await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(1200);
  await page.evaluate(() => { try { _ddSkipTour(); } catch (e) {} });
  const ev = (fn, a) => page.evaluate(fn, a), wait = ms => page.waitForTimeout(ms);
  const shot = async n => { if (process.env.SHOTS) { await wait(500); await page.screenshot({ path: path.join(process.env.SHOTS, n + '.png') }); } };

  await ev(() => STL.openFair()); await wait(200);
  ok(await ev(() => !document.getElementById('fairDialog')), 'Without data it asks for a file first');
  await page.setInputFiles('#fileInput', { name: 'delivery.csv', mimeType: 'text/csv', buffer: csv(1) });
  await page.waitForFunction(() => typeof rawData !== 'undefined' && rawData.length === 3000, null, { timeout: 15000 }); await wait(500);

  // ---- from the Studio, in one click
  await ev(() => STL.openChartStudio({ type: 'column', spec: { x: 1, ys: [{ col: 0, fn: 'avg' }] } })); await wait(900);
  await ev(() => document.getElementById('csFair').click());
  await page.waitForFunction(() => document.querySelector('#frOut .fr-verdict'), null, { timeout: 10000 }); await wait(700);
  const r = await ev(() => ({ title: document.querySelector('.fr-verdict b').innerText, text: document.querySelector('.fr-verdict p').innerText, rows: Array.from(document.querySelectorAll('.fr-tbl tr')).map(t => t.innerText.replace(/\s+/g, ' ')), adj: Array.from(document.querySelectorAll('#frAdj input:checked')).map(i => i.parentNode.innerText.trim()), strata: !!document.querySelector('#frChart canvas'), y: document.getElementById('frY').selectedOptions[0].text, f: document.getElementById('frF').selectedOptions[0].text }));
  ok(r.y === 'Rating' && r.f === 'Online delivery', 'The Studio opens it with the chart\'s measure and groups (' + r.y + ' by ' + r.f + ')', r);
  ok(/Price range/.test(r.adj.join()) , 'It chooses the factors to adjust for by itself (' + r.adj.join(', ') + ')', r.adj);
  ok(/misleading/.test(r.title) && /flips/.test(r.title), 'The verdict says the first comparison is misleading because the answer flips', r.title);
  ok(/as they are, the difference is −0\.25/.test(r.text) && /\+0\.1[0-9]/.test(r.text), 'It states both numbers: as they are −0.25, among similar rows +0.10', r.text);
  ok(/Price range/.test(r.text) && /% Price range = 1 versus/.test(r.text), 'It names the cause and shows the make-up difference', r.text);
  ok(r.rows.some(t => /Yes/.test(t) && /−0\.25/.test(t) && /\+0\.10/.test(t)), 'The table shows the plain and the adjusted gap with the range it most likely lies in', r.rows);
  ok(r.strata, 'A chart shows the gap inside every price range');
  await shot('50-fair-reversal');
  // the app's number equals statsmodels
  const beta = await ev(() => { const c = STL.fair.cellsFromRows(rawData, rawData.map((_, i) => i), { y: 0, factor: 1, adjusters: [2, 3] }); return STL.fair.analyse(c.cells, ['a', 'b', 'c']).main.adj; }).catch(() => null);
  ok(beta && Math.abs(beta.diff - FX.full.beta) < 1e-6 && Math.abs(beta.se - FX.full.se) < 1e-6, 'In the browser the coefficient and robust standard error equal statsmodels (' + (beta && beta.diff.toFixed(6)) + ' / ' + (beta && beta.se.toFixed(6)) + ')', beta);

  // ---- change the choices: take price out and the gap no longer looks reversed
  await ev(() => { const price = Array.from(document.querySelectorAll('#frAdj input')).find(i => /Price/.test(i.parentNode.innerText)); price.click(); }); await wait(500);
  await page.waitForFunction(() => !/REVERSES/.test(document.querySelector('.fr-verdict b').innerText), null, { timeout: 5000 });
  ok(await ev(() => /holds|stays|barely/i.test(document.querySelector('.fr-verdict').innerText) || !/REVERSES/.test(document.querySelector('.fr-verdict b').innerText)), 'Without adjusting for price the same data no longer shows the reversal (so the choice matters, and the screen says what was adjusted)', await ev(() => document.querySelector('.fr-verdict b').innerText));
  await ev(() => Array.from(document.querySelectorAll('#frAdj input')).forEach(i => { if (i.checked) i.click(); })); await wait(500);
  ok(await ev(() => /Plain difference only/.test(document.querySelector('.fr-verdict b').innerText)), 'With nothing to adjust for it says it is only the plain difference');

  // ---- Hindi
  await ev(() => { document.getElementById('frX').click(); setUiLanguage('hi'); STL.openFair({ y: 0, f: 1, adj: [2, 3] }); }); await wait(900);
  ok(await ev(() => /भ्रामक/.test(document.querySelector('.fr-verdict b').innerText) && /जैसे हैं वैसे समूहों में अंतर −0\.25/.test(document.querySelector('.fr-verdict p').innerText) && /निष्पक्ष तुलना/.test(document.querySelector('#fairDialog .prj-h').innerText)), 'The whole screen and the verdict speak Hindi');
  await shot('51-fair-hindi');
  await ev(() => { document.getElementById('frX').click(); setUiLanguage('en'); });

  // ---- open as a chart
  await ev(() => STL.openFair({ y: 0, f: 1, adj: [2, 3] })); await wait(700);
  await ev(() => document.getElementById('frChartBtn').click()); await wait(1200);
  ok(await ev(() => document.getElementById('chartStudio').classList.contains('open') && !document.getElementById('fairDialog')), 'Open as a chart shows the gap inside each price range in the Studio');
  await ev(() => STL.closeChartStudio());

  // ---- Ctrl+K entry
  ok(await ev(() => STL.actions.some(a => /Fair comparison/.test(a.en))), 'Ctrl+K finds “Fair comparison”');

  // ---- a large file gives the same coefficient (engine cells -> same maths)
  await page.setInputFiles('#fileInput', { name: 'big.csv', mimeType: 'text/csv', buffer: csv(1) }); await wait(500);
  await ev(c => { BIG.openFile(new File([c], 'delivery_big.csv', { type: 'text/csv' })); }, csv(4).toString('utf8'));
  await page.waitForFunction(() => window.BIG && BIG.active && BIG.matched === 12000, null, { timeout: 30000 });
  await ev(() => STL.openFair({ y: 0, f: 1, adj: [2, 3] })); await page.waitForFunction(() => document.querySelector('#frOut .fr-verdict'), null, { timeout: 15000 }); await wait(500);
  const big = await ev(() => ({ title: document.querySelector('.fr-verdict b').innerText, text: document.querySelector('.fr-verdict p').innerText }));
  ok(/misleading/.test(big.title) && /as they are, the difference is −0\.25/.test(big.text), 'On a 12,000-row Large File (calculated by the engine) the verdict is the same', big);
  const m = /it is \+(\d\.\d\d)/.exec(big.text); ok(m && Math.abs(+m[1] - Math.round(FX.full.beta * 100) / 100) < 0.011, 'and the like-for-like gap equals the in-memory one (+' + (m && m[1]) + ')', big.text);
  await shot('52-fair-big');

  ok(external.length === 0, 'No external network requests were attempted', external);
  ok(errors.length === 0, 'No JavaScript errors', errors);
  await browser.close();
  console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
