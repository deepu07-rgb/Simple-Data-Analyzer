/*
 * Charts on a Large File (300,000 rows) in a real browser: the engine answers every chart from all rows,
 * and clicking a bar filters the file. All numbers are checked against values computed here, independently.
 *   STELLURA_HOME=/tmp/stl-home PORT=5055 python app.py
 *   BASE=http://127.0.0.1:5055 node tests/e2e/bigcharts.e2e.js        (SHOTS=/some/dir to keep screenshots)
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:5000';
const N = 300000;
let failures = 0;
const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x))); if (!c) failures++; };

const DIST = ['जयपुर', 'जोधपुर', 'कोटा', 'अजमेर', 'बीकानेर', 'अलवर'], STAT = ['लंबित', 'निस्तारित', 'जाँच में'];
function rng(seed) { let x = seed; return () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296; }
const r = rng(5), truth = { byDist: {}, byDistAmt: {}, byMonth: {}, byDistStat: {}, n: N, amt: 0, valid: 0, janRows: 0 };
const rows = ['जिला,स्थिति,राशि,आयु,दिनांक'];
for (let i = 0; i < N; i++) {
  const d = DIST[Math.floor(r() * DIST.length) % DIST.length], s = STAT[Math.floor(r() * 3)], amt = Math.round(1000 + r() * 80000), age = 18 + Math.floor(r() * 50);
  const day = Math.floor(r() * 365), dt = new Date(Date.UTC(2024, 3, 1) + day * 86400000), ds = `${String(dt.getUTCDate()).padStart(2, '0')}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${dt.getUTCFullYear()}`;
  rows.push(`${d},${s},${amt},${age},${ds}`);
  truth.byDist[d] = (truth.byDist[d] || 0) + 1; truth.byDistAmt[d] = (truth.byDistAmt[d] || 0) + amt; truth.amt += amt;
  const mk = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`; truth.byMonth[mk] = (truth.byMonth[mk] || 0) + 1;
  truth.byDistStat[d + '|' + s] = (truth.byDistStat[d + '|' + s] || 0) + 1;
}
const csv = Buffer.from(rows.join('\n') + '\n', 'utf8');

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const external = [], errors = [];
  await page.route('**/*', rt => /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:|about:)/.test(rt.request().url()) ? rt.continue() : (external.push(rt.request().url()), rt.abort()));
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/503|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('stellura_tour_done', '1'); } catch (e) {} });
  await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(1200);
  await page.evaluate(() => { try { _ddSkipTour(); } catch (e) {} });
  const ev = (fn, arg) => page.evaluate(fn, arg), wait = ms => page.waitForTimeout(ms);
  const shot = async n => { if (process.env.SHOTS) { await wait(500); await page.screenshot({ path: path.join(process.env.SHOTS, n + '.png') }); } };

  await page.setInputFiles('#fileInput', { name: 'register.csv', mimeType: 'text/csv', buffer: csv });
  await page.waitForFunction(n => window.BIG && BIG.active && BIG.matched === n, N, { timeout: 60000 });
  ok(await ev(() => !!document.getElementById('bigChartBtn')), 'The large-file toolbar has a Charts button');

  // ---- open the Studio on the large file
  const t0 = Date.now();
  await ev(() => document.getElementById('bigChartBtn').click());
  await page.waitForFunction(() => document.querySelector('#csCap .cs-meta') && /all/i.test(document.querySelector('#csCap .cs-meta').textContent), null, { timeout: 20000 });
  ok(true, 'The Studio opens on a 300,000-row file and draws a chart in ' + (Date.now() - t0) + ' ms');
  ok(await ev(n => /300,000|3,00,000/.test(document.querySelector('#csCap .cs-meta').textContent), N), 'The chart says it was calculated from all rows', await ev(() => document.querySelector('#csCap .cs-meta').textContent));
  ok(await ev(() => getComputedStyle(document.querySelector('#bigview .big-side')).display === 'none'), 'The file side panel steps aside for the Studio');
  await shot('30-big-studio');

  // ---- numbers are exact: a column chart of the amount (or count) by district
  async function pickColumn(spec) { await ev(s => STL.openChartStudio({ type: s.type, spec: s.spec }), spec); await wait(1500); }
  await pickColumn({ type: 'column', spec: { x: 0, ys: [{ col: -1, fn: 'count' }], sort: 'desc' } });
  const colData = await ev(() => { const o = echarts.getInstanceByDom(document.getElementById('csChart')).getOption(); return { cats: o.xAxis[0].data, vals: o.series[0].data.map(v => (v && typeof v === 'object') ? v.value : v) }; });
  ok(colData.cats.length === DIST.length && colData.cats.every((c, i) => colData.vals[i] === truth.byDist[c]), 'A count by district equals the real count for every district', colData);
  await pickColumn({ type: 'column', spec: { x: 0, ys: [{ col: 2, fn: 'sum' }], sort: 'desc' } });
  const sumData = await ev(() => { const o = echarts.getInstanceByDom(document.getElementById('csChart')).getOption(); return { cats: o.xAxis[0].data, vals: o.series[0].data.map(v => (v && typeof v === 'object') ? v.value : v) }; });
  ok(sumData.cats.every((c, i) => Math.abs(sumData.vals[i] - truth.byDistAmt[c]) < 0.5), 'A total of the amount by district equals the real total for every district');
  await pickColumn({ type: 'stackedColumn', spec: { x: 0, g: 1, ys: [{ col: -1, fn: 'count' }] } });
  const stack = await ev(() => { const o = echarts.getInstanceByDom(document.getElementById('csChart')).getOption(); return { cats: o.xAxis[0].data, series: o.series.map(s => ({ n: s.name, v: s.data.map(v => (v && typeof v === 'object') ? v.value : v) })) }; });
  ok(stack.series.length === 3 && stack.series.every(s => s.v.every((v, i) => v === truth.byDistStat[stack.cats[i] + '|' + s.n])), 'A stacked chart (district by status) is exact for all 18 combinations');

  // ---- click a bar: the file view filters to those rows
  await pickColumn({ type: 'column', spec: { x: 0, ys: [{ col: -1, fn: 'count' }], sort: 'desc' } });
  const pos = await ev(() => { const inst = echarts.getInstanceByDom(document.getElementById('csChart')), o = inst.getOption(), v = o.series[0].data[0], val = typeof v === 'object' && v ? v.value : v; const p = inst.convertToPixel({ seriesIndex: 0 }, [0, val]), r = document.getElementById('csChart').getBoundingClientRect(); return { x: r.left + p[0], y: r.top + p[1] + 12, cat: o.xAxis[0].data[0] }; });
  await page.mouse.click(pos.x, pos.y); await wait(1200);
  const afterClick = await ev(() => ({ matched: BIG.matched, chip: !!document.querySelector('#bigFilterBar .big-chip-chart'), bar: document.getElementById('csSelBar').style.display, text: document.getElementById('csSelBar').textContent }));
  ok(afterClick.matched === truth.byDist[pos.cat], 'Clicking the ' + pos.cat + ' bar filters the file to exactly its rows (' + afterClick.matched + ')', afterClick);
  ok(afterClick.chip && afterClick.bar !== 'none', 'A chart chip appears in the file filter bar and the Studio explains the selection');
  const stillAll = await ev(() => { const o = echarts.getInstanceByDom(document.getElementById('csChart')).getOption(); return o.xAxis[0].data.length; });
  ok(stillAll === DIST.length, 'The chart keeps all its bars (the others are dimmed) while the file is filtered');
  await shot('31-big-click');
  // Ctrl+click adds a second district
  const pos2 = await ev(() => { const inst = echarts.getInstanceByDom(document.getElementById('csChart')), o = inst.getOption(), v = o.series[0].data[1], val = typeof v === 'object' && v ? v.value : v; const p = inst.convertToPixel({ seriesIndex: 0 }, [1, val]), r = document.getElementById('csChart').getBoundingClientRect(); return { x: r.left + p[0], y: r.top + p[1] + 12, cat: o.xAxis[0].data[1] }; });
  await page.keyboard.down('Control'); await page.mouse.click(pos2.x, pos2.y); await page.keyboard.up('Control'); await wait(1200);
  ok(await ev(() => BIG.matched) === truth.byDist[pos.cat] + truth.byDist[pos2.cat], 'Ctrl+click adds a second district to the selection (' + await ev(() => BIG.matched) + ' rows)');
  await ev(() => document.getElementById('csClear').click()); await wait(1200);
  ok(await ev(n => BIG.matched === n && !BIG.filters.some(f => f._chart), N), 'Show all rows brings back the whole file');

  // ---- the grid's own search narrows the chart
  await ev(() => { const s = document.getElementById('bigSearch'); s.value = 'कोटा'; s.dispatchEvent(new Event('input')); }); await wait(1800);
  const searched = await ev(() => { const o = echarts.getInstanceByDom(document.getElementById('csChart')).getOption(); return { cats: o.xAxis[0].data, meta: document.querySelector('#csCap .cs-meta').textContent }; });
  ok(searched.cats.length === 1 && searched.cats[0] === 'कोटा' && /search/i.test(searched.meta), 'Searching the grid narrows the chart to the same rows', searched);
  await ev(() => { const s = document.getElementById('bigSearch'); s.value = ''; s.dispatchEvent(new Event('input')); }); await wait(1500);

  // ---- dates: months, financial year, weekday
  await pickColumn({ type: 'line', spec: { x: 4, time: 'month', ys: [{ col: -1, fn: 'count' }] } });
  const months = await ev(() => { const o = echarts.getInstanceByDom(document.getElementById('csChart')).getOption(); return { cats: o.xAxis[0].data, vals: o.series[0].data.map(v => (v && typeof v === 'object') ? v.value : v) }; });
  ok(months.cats.length === Object.keys(truth.byMonth).length && months.cats.every((c, i) => months.vals[i] === truth.byMonth[c]), 'Rows per month (dates written dd-mm-yyyy) equal the real counts for all ' + months.cats.length + ' months');
  const mpos = await ev(() => { const inst = echarts.getInstanceByDom(document.getElementById('csChart')), o = inst.getOption(), i = 3, val = o.series[0].data[i], v = typeof val === 'object' && val ? val.value : val; const p = inst.convertToPixel({ seriesIndex: 0 }, [i, v]), r = document.getElementById('csChart').getBoundingClientRect(); return { x: r.left + p[0], y: r.top + p[1], cat: o.xAxis[0].data[i] }; });
  await page.mouse.click(mpos.x, mpos.y); await wait(1300);
  ok(await ev(() => BIG.matched) === truth.byMonth[mpos.cat], 'Clicking the ' + mpos.cat + ' point filters the file to that month (' + await ev(() => BIG.matched) + ' rows)');
  await ev(() => document.getElementById('csClear').click()); await wait(1000);
  await pickColumn({ type: 'column', spec: { x: 4, time: 'fy', ys: [{ col: 2, fn: 'sum' }] } });
  const fy = await ev(() => echarts.getInstanceByDom(document.getElementById('csChart')).getOption().xAxis[0].data);
  ok(fy.length === 1 && fy[0] === '2024-25', 'Financial-year grouping reads the dates correctly', fy);
  await pickColumn({ type: 'column', spec: { x: 4, time: 'weekday', ys: [{ col: -1, fn: 'count' }] } });
  const wd = await ev(() => echarts.getInstanceByDom(document.getElementById('csChart')).getOption().xAxis[0].data);
  ok(JSON.stringify(wd) === JSON.stringify(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']), 'Weekdays come in calendar order, not alphabetical', wd);

  // ---- every chart type answers from the engine
  const specs = {
    column: { x: 0, ys: [{ col: 2, fn: 'sum' }] }, bar: { x: 0, ys: [{ col: 2, fn: 'avg' }] }, stackedColumn: { x: 0, g: 1, ys: [{ col: -1, fn: 'count' }] }, percentColumn: { x: 0, g: 1, ys: [{ col: -1, fn: 'count' }] },
    combo: { x: 0, ys: [{ col: 2, fn: 'sum' }, { col: 3, fn: 'avg' }] }, pareto: { x: 0, ys: [{ col: 2, fn: 'sum' }] }, waterfall: { x: 0, ys: [{ col: 2, fn: 'sum' }] },
    line: { x: 4, time: 'month', ys: [{ col: 2, fn: 'sum' }] }, area: { x: 4, time: 'month', ys: [{ col: 2, fn: 'median' }] }, stackedArea: { x: 4, time: 'quarter', g: 1, ys: [{ col: -1, fn: 'count' }] },
    calendar: { x: 4, ys: [{ col: -1, fn: 'count' }] }, pie: { x: 1, ys: [{ col: 2, fn: 'sum' }] }, donut: { x: 1, ys: [{ col: -1, fn: 'count' }] }, rose: { x: 0, ys: [{ col: 2, fn: 'sum' }] }, funnel: { x: 1, ys: [{ col: -1, fn: 'count' }] },
    treemap: { x: 0, g: 1, ys: [{ col: 2, fn: 'sum' }] }, sunburst: { x: 0, g: 1, ys: [{ col: 2, fn: 'sum' }] }, scatter: { xnum: 3, ynum: 2, trend: true }, bubble: { xnum: 3, ynum: 2, size: 3 },
    heatmap: { x: 0, g: 1, ys: [{ col: -1, fn: 'count' }] }, sankey: { x: 0, g: 1, ys: [{ col: -1, fn: 'count' }] }, radar: { x: 0, ys: [{ col: 2, fn: 'avg' }, { col: 3, fn: 'avg' }, { col: 2, fn: 'max' }] },
    histogram: { xnum: 2 }, boxplot: { x: 1, ys: [{ col: 2, fn: 'sum' }] }, gauge: { ys: [{ col: 2, fn: 'sum' }] }
  };
  const results = {}; let slowest = 0;
  for (const [type, spec] of Object.entries(specs)) {
    const t1 = Date.now();
    await ev(a => STL.openChartStudio({ type: a.type, spec: a.spec }), { type, spec });
    await page.waitForFunction(() => { const m = document.getElementById('csMsg'); return (document.querySelector('#csCap p') || (m && m.style.display !== 'none')); }, null, { timeout: 20000 });
    await wait(150); slowest = Math.max(slowest, Date.now() - t1);
    results[type] = await ev(() => { const inst = echarts.getInstanceByDom(document.getElementById('csChart')), o = inst.getOption(), msg = document.getElementById('csMsg'); const data = (o.series || []).reduce((n, s) => n + ((s.data && s.data.length) || (s.links && s.links.length) || 0), 0); return { series: (o.series || []).length, data, msg: msg.style.display !== 'none' ? msg.textContent : '', cap: document.querySelectorAll('#csCap p').length, nan: JSON.stringify(o.series).indexOf('NaN') >= 0 }; });
  }
  const bad = Object.entries(results).filter(([t, x]) => x.series < 1 || x.data < 1 || x.msg || x.nan);
  ok(bad.length === 0, 'All 25 chart types draw from the engine on the 300,000-row file', bad);
  ok(Object.keys(results).length === 25 && Object.values(results).every(x => x.cap >= 1), 'Every chart type writes its caption');
  ok(slowest < 8000, 'The slowest chart answered in ' + slowest + ' ms', slowest);
  const sc = await ev(() => { document.querySelector('#csGallery .cs-t[data-type="scatter"]').click(); return null; }); await wait(1800);
  ok(await ev(() => /random sample/.test(document.getElementById('csCap').textContent) && echarts.getInstanceByDom(document.getElementById('csChart')).getOption().series[0].data.length <= 5000), 'The scatter chart draws a sample of at most 5,000 dots and says so');
  // histogram: click a bar
  await ev(() => STL.openChartStudio({ type: 'histogram', spec: { xnum: 2, bins: 10 } })); await wait(1800);
  const hp = await ev(() => { const inst = echarts.getInstanceByDom(document.getElementById('csChart')), o = inst.getOption(); const i = 4, v = o.series[0].data[i]; const p = inst.convertToPixel({ seriesIndex: 0 }, [i, v]), r = document.getElementById('csChart').getBoundingClientRect(); return { x: r.left + p[0], y: r.top + p[1] + 10, count: v }; });
  await page.mouse.click(hp.x, hp.y); await wait(1300);
  ok(await ev(() => BIG.matched) === hp.count, 'Clicking a histogram bar filters the file to that range (' + hp.count + ' rows)', await ev(() => BIG.matched));
  await ev(() => document.getElementById('csClear').click()); await wait(1000);
  await shot('32-big-histogram');

  // ---- the board and a column's chart button work for large files too
  await ev(() => STL.openBoard()); await page.waitForFunction(() => document.querySelectorAll('#boardDialog .cs-card-c canvas').length >= 4, null, { timeout: 25000 });
  ok(true, 'The Insights board draws ' + await ev(() => document.querySelectorAll('#boardDialog .cs-card-c canvas').length) + ' suggested charts for the large file');
  await shot('33-big-board'); await ev(() => document.getElementById('bdX').click());
  await ev(() => STL.closeChartStudio()); await wait(300);
  await ev(() => { BIG.tab = 'columns'; document.getElementById('bigTabCols').click(); }); await wait(500);
  await ev(() => document.querySelector('#bigPane .big-chart[data-chart="2"]').click()); await wait(2200);
  ok(await ev(() => document.getElementById('chartStudio').classList.contains('open') && echarts.getInstanceByDom(document.getElementById('csChart')).getOption().series[0].type === 'bar'), 'The chart button on a column card opens a histogram of that column');

  // ---- leaving large-file mode closes the Studio cleanly
  await ev(() => BIG.exit()); await wait(400);
  ok(await ev(() => !document.getElementById('chartStudio').classList.contains('open')), 'Closing the large file closes the Studio');
  ok(external.length === 0, 'No external network requests were attempted', external);
  ok(errors.length === 0, 'No JavaScript errors', errors);
  await browser.close();
  console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
