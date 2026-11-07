/*
 * Large File mode + projects, in a real browser with all external network blocked.
 *   STELLURA_HOME=/tmp/stl-home PORT=5055 python app.py     (a throw-away projects folder!)
 *   BASE=http://127.0.0.1:5055 node tests/e2e/large.e2e.js
 */
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:5000';
const N = 250000;
let failures = 0;
const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x))); if (!c) failures++; };

// ---- deterministic test file (Hindi, leading zeros, commas in numbers) ----
const DIST = ['जयपुर', 'जोधपुर', 'उदयपुर', 'कोटा', 'अजमेर', 'सीकर', 'अलवर', 'भरतपुर'];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-large-'));
const file = path.join(tmp, 'register.csv');
const HINDI_NAME = 'पुलिस_रजिस्टर.csv';     // sent as an in-memory file so the Hindi name reaches the app on any OS locale
let maxSal = 0, jaipurHigh = 0, searchHits = 0;
const lines = ['क्र_सं,नाम,जिला,वेतन,फोन'];
for (let i = 1; i <= N; i++) {
  const d = DIST[i % 8], sal = 20000 + (i * 7919) % 70000, name = 'व्यक्ति ' + i;
  maxSal = Math.max(maxSal, sal);
  if (d === 'जयपुर' && sal > 80000) jaipurHigh++;
  if (name.includes('9999')) searchHits++;
  lines.push(`${i},${name},${d},"${sal.toLocaleString('en-US')}",09${String(i).padStart(9, '0')}`);
}
fs.writeFileSync(file, lines.join('\n') + '\n');
console.log(`test file: ${N.toLocaleString()} rows, ${(fs.statSync(file).size / 1e6).toFixed(0)} MB`);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const external = [], errors = [];
  await page.route('**/*', r => /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:)/.test(r.request().url()) ? r.continue() : (external.push(r.request().url()), r.abort()));
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  let allowed400 = 1;                                  // the refused DROP TABLE below is expected to return one 400
  page.on('console', m => { if (m.type() === 'error' && !/503|ERR_FAILED/.test(m.text()) && !(/\b400\b/.test(m.text()) && allowed400-- > 0)) errors.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('stellura_tour_done', '1'); localStorage.setItem('sda_first_run', 'done'); } catch (e) {} });
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { try { _ddSkipTour(); } catch (e) {} });

  // 1. big file opens in Large File mode, quickly
  const t0 = Date.now();
  await page.setInputFiles('#fileInput', { name: HINDI_NAME, mimeType: 'text/csv', buffer: fs.readFileSync(file) });
  await page.waitForFunction(n => window.BIG && BIG.active && BIG.matched === n, N, { timeout: 60000 });
  const openMs = Date.now() - t0;
  ok(true, `${N.toLocaleString()}-row file opened in Large File mode in ${(openMs / 1000).toFixed(1)} s`);
  ok(openMs < 10000, 'opens in under 10 seconds', openMs);
  const first = await page.$$eval('#bigRows .big-row:not(.big-skel)', rs => rs.slice(0, 2).map(r => [...r.children].map(c => c.textContent)));
  ok(first[0][0] === '1' && first[0][1] === '1' && first[0][2] === 'व्यक्ति 1' && first[0][5] === '09000000001', 'first row shows Hindi text and keeps the leading zero', first[0]);
  ok(await page.evaluate(() => document.querySelector('#bigBadge').textContent.length > 0 && document.getElementById('documentName').textContent === 'पुलिस_रजिस्टर'), 'badge and document name shown');

  // 2. scrolling reaches any row
  const visibleId = id => page.waitForFunction(id => [...document.querySelectorAll('#bigRows .big-row:not(.big-skel) .big-idc')].some(e => e.textContent === String(id)), id, { timeout: 8000 }).then(() => true).catch(() => false);
  await page.evaluate(() => { document.getElementById('bigScroll').scrollTop = 30 * 120000; });
  ok(await visibleId(120001), 'scrolling to the middle shows row 120,001');
  await page.evaluate(() => { const s = document.getElementById('bigScroll'); s.scrollTop = s.scrollHeight; });
  ok(await visibleId(N), `scrolling to the end shows row ${N.toLocaleString()}`);

  // 3. sort (numeric: "45,000" style text sorts as a number)
  await page.evaluate(() => { document.getElementById('bigScroll').scrollTop = 0; });
  await page.waitForFunction(() => BIG.profile, null, { timeout: 15000 });
  await page.click('#bigHead .big-hc[data-i="3"]'); await page.click('#bigHead .big-hc[data-i="3"]');   // 2nd click = descending
  await page.waitForFunction(() => BIG.sort === 3 && BIG.desc, null, { timeout: 5000 });
  await page.waitForTimeout(700);
  const top = await page.$eval('#bigRows .big-row:not(.big-skel) .big-c:nth-child(5)', e => e.textContent);
  ok(top.replace(/,/g, '') === String(maxSal), `sorting by salary (descending) puts the maximum (${maxSal.toLocaleString()}) first`, top);
  await page.click('#bigHead .big-hc[data-i="3"]');                                                      // 3rd click clears the sort
  await page.waitForFunction(() => BIG.sort === null, null, { timeout: 5000 });

  // 4. search
  await page.fill('#bigSearch', '9999');
  await page.waitForFunction(n => BIG.matched === n, searchHits, { timeout: 8000 }).catch(() => {});
  ok(await page.evaluate(() => BIG.matched) === searchHits, `search "9999" finds exactly ${searchHits} rows`, await page.evaluate(() => BIG.matched));
  await page.fill('#bigSearch', '');
  await page.waitForFunction(n => BIG.matched === n, N, { timeout: 8000 });

  // 5. filter dialog: district = जयपुर AND salary > 80000
  const addFilter = async (col, op, v) => {
    await page.click('#bigFiltBtn');
    await page.selectOption('#bfCol', String(col)); await page.selectOption('#bfOp', op); await page.fill('#bfV1', String(v));
    await page.click('#bfAdd');
  };
  await addFilter(2, 'eq', 'जयपुर');
  await addFilter(3, 'gt', 80000);
  await page.waitForFunction(n => BIG.matched === n, jaipurHigh, { timeout: 8000 }).catch(() => {});
  ok(await page.evaluate(() => BIG.matched) === jaipurHigh, `two filters leave exactly ${jaipurHigh.toLocaleString()} rows`, await page.evaluate(() => BIG.matched));
  ok((await page.$$('#bigFilterBar .big-chip')).length === 2, 'filters are shown as removable chips');

  // 6. side panel: columns, group & chart, SQL
  await page.click('.big-tabs button[data-tab="columns"]');
  ok((await page.$$('#bigPane .big-card')).length === 5, 'Columns tab profiles all 5 columns');
  await page.click('#bigPane .big-card[data-i="2"]');
  await page.waitForSelector('#bigPane .big-val', { timeout: 5000 });
  ok(true, 'clicking a column lists its most common values');
  await page.click('.big-tabs button[data-tab="group"]');
  await page.selectOption('#bgFn', 'sum'); await page.selectOption('#bgBy', '2');
  await page.click('#bgRun');
  await page.waitForSelector('#bgOut table tr:nth-child(2)', { timeout: 8000 });
  const chartDrawn = await page.waitForFunction(() => !!window.echarts && !!echarts.getInstanceByDom(document.getElementById('bgChart')), null, { timeout: 8000 }).then(() => true).catch(() => false);
  ok(chartDrawn, 'Group & chart shows a table and a bar chart (respecting the filters)');
  // clicking a bar of the group chart filters the file to that group
  await page.waitForTimeout(1100);                                                  // let the bars finish growing
  const gbar = await page.evaluate(() => { const inst = echarts.getInstanceByDom(document.getElementById('bgChart')), o = inst.getOption(), v = o.series[0].data[0], val = typeof v === 'object' && v ? v.value : v; const p = inst.convertToPixel({ seriesIndex: 0 }, [val, 0]), r = document.getElementById('bgChart').getBoundingClientRect(); return { x: r.left + Math.max(10, p[0] - 8), y: r.top + p[1], label: o.yAxis[0].data[0], matched: BIG.matched }; });
  await page.mouse.click(gbar.x, gbar.y); await page.waitForTimeout(1200);
  const gAfter = await page.evaluate(() => ({ matched: BIG.matched, f: BIG.filters.map(f => f.op + ':' + f.value) }));
  ok(gAfter.matched > 0 && gAfter.matched <= gbar.matched && gAfter.f.includes('ieq:' + gbar.label), 'clicking a bar of the group chart adds a filter for that group (' + gbar.label + ', ' + gAfter.matched + ' rows)', { gbar, gAfter });
  await page.evaluate(() => { BIG.filters = BIG.filters.filter(f => f.op !== 'ieq'); BIG.syncFilters(); }); await page.waitForTimeout(800);
  await page.click('.big-tabs button[data-tab="sql"]');
  await page.fill('#sqlText', 'SELECT "जिला", count(*) AS n FROM data GROUP BY 1 ORDER BY n DESC');
  await page.click('#sqlRun');
  await page.waitForSelector('#sqlOut table', { timeout: 8000 });
  ok(true, 'SQL tab runs a SELECT');
  await page.fill('#sqlText', 'DROP TABLE data'); await page.click('#sqlRun');
  await page.waitForSelector('#sqlOut .big-err', { timeout: 8000 });
  ok(true, 'a non-SELECT statement is refused with a clear message');

  // 7. export of the filtered view
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#bigCsvBtn')]);
  const csvPath = path.join(tmp, 'out.csv'); await dl.saveAs(csvPath);
  const outLines = fs.readFileSync(csvPath, 'utf8').trim().split('\n');
  ok(outLines.length === jaipurHigh + 1 && outLines[1].includes('जयपुर'), 'CSV export contains exactly the filtered rows', outLines.length);

  // 8. save the big dataset as a project, close, reopen
  await page.evaluate(() => PRJ.openDialog());
  await page.fill('#prjName', 'बड़ा परीक्षण');
  await page.click('#prjSave');
  await page.waitForFunction(() => /Saved:/.test(document.body.innerText) && !document.getElementById('prjSave').disabled, null, { timeout: 30000 });
  await page.waitForSelector('#prjList [data-open="बड़ा परीक्षण"]', { timeout: 30000 });
  ok(true, 'large dataset saved as a project');
  await page.evaluate(() => document.getElementById('prjDialog').remove());
  // closing the dialog while a save is still running must not throw (regression)
  await page.evaluate(() => PRJ.openDialog());
  await page.click('#prjSave');
  await page.evaluate(() => document.getElementById('prjDialog').remove());
  await page.waitForTimeout(2000);
  await page.evaluate(() => BIG.exit());
  await page.evaluate(() => PRJ.openDialog());
  await page.click('#prjList [data-open="बड़ा परीक्षण"]');
  await page.waitForFunction(n => BIG.active && BIG.matched === n, N, { timeout: 30000 });
  ok(true, 'reopening it returns to Large File mode with all rows');

  // 9. work on a copy: filter to a small set, bring it into the full editor
  await addFilter(2, 'eq', 'कोटा'); await addFilter(3, 'gt', 89000);
  await page.waitForFunction(() => BIG.filters.length === 2 && BIG.matched < 2000 && BIG.matched > 0, null, { timeout: 8000 });
  const want = await page.evaluate(() => BIG.matched);
  await page.click('#bigCopyBtn');
  await page.waitForFunction(() => !BIG.active && rawData.length > 0, null, { timeout: 15000 });
  const copy = await page.evaluate(() => ({ n: rawData.length, h: headers, r: rawData[0] }));
  ok(copy.n === want && copy.r[2] === 'कोटा' && /^09\d{9}$/.test(copy.r[4]), `"Work on a copy" brought ${want} rows into the editor with text intact`, copy.r);
  ok(await page.evaluate(() => document.getElementById('table-wrap').classList.contains('visible')), 'normal editor is shown');

  // 10. normal-size project keeps formatting
  await page.evaluate(() => { cellBold['0:1'] = true; cfRules.push({ col: 3, cond: '>', val: '89500', color: '#ef4444' }); cellBgColor['1:2'] = '#ffff00'; });
  await page.evaluate(() => PRJ.openDialog());
  await page.fill('#prjName', 'छोटा परीक्षण'); await page.click('#prjSave');
  await page.waitForSelector('#prjList [data-open="छोटा परीक्षण"]', { timeout: 15000 });
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(1000);
  await page.evaluate(() => { try { _ddSkipTour(); } catch (e) {} ; localStorage.clear(); });
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(800);
  await page.evaluate(() => { try { _ddSkipTour(); } catch (e) {} PRJ.openDialog(); });
  await page.click('#prjList [data-open="छोटा परीक्षण"]');
  await page.waitForFunction(n => rawData.length === n, want, { timeout: 15000 });
  const restored = await page.evaluate(() => ({ b: cellBold['0:1'], cf: cfRules.length, bg: cellBgColor['1:2'], n: rawData.length, ph: rawData[0][4] }));
  ok(restored.b === true && restored.cf >= 1 && restored.bg === '#ffff00', 'project restores bold, conditional formatting and cell colours', restored);
  ok(/^09\d{9}$/.test(restored.ph), 'project keeps leading zeros', restored.ph);

  // 11. the old autosave tells the truth when the browser store is full
  await page.evaluate(() => { const orig = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new Error('QuotaExceededError'); }; autoSave(); Storage.prototype.setItem = orig; });
  ok(/not auto-saved/i.test(await page.$eval('#saveStateText', e => e.textContent)), 'when browser storage is full the status says "Not auto-saved"');

  ok(external.length === 0, 'zero requests left this PC', external);
  ok(errors.length === 0, 'no JavaScript errors', errors);
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})();
