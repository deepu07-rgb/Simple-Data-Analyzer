const { chromium } = require('playwright'); const fs = require('fs');
// Real-file regression: needs the original file. REAL_DIR=<folder holding the files> BASE=http://127.0.0.1:5055 node tests/real_files/<this file>
// (the file is not in the repository; without it this script says SKIP and exits 0)
const _fs = require('fs'); const _find = n => { const d = process.env.REAL_DIR; if (!d) { console.log('SKIP: set REAL_DIR to the folder with ' + n); process.exit(0); } const f = _fs.readdirSync(d).find(x => x.endsWith(n)); if (!f) { console.log('SKIP: ' + n + ' not found in ' + d); process.exit(0); } return d + '/' + f; };
const _BASE = process.env.BASE || 'http://127.0.0.1:5000';
const SD = '/tmp/claude-0/-home-user-Simple-Data-Analyzer/488a91e3-a416-5450-8d0d-3430e4418741/scratchpad/';
const CSV = '/root/.claude/uploads/488a91e3-a416-5450-8d0d-3430e4418741/57bf0d26-Zomato_Restaurant_Dataset.csv'.replace('3430e', '4430e').replace('488a91e3-a416-5450-8d0d-4430e4418741', '488a91e3-a416-5450-8d0d-3430e4418741');
const E = JSON.parse(fs.readFileSync(SD + 'expected.json'));
let pass = 0, fail = 0; const rows = [];
const near = (a, b, tol = 0.0006) => Math.abs(a - b) <= tol;
const check = (name, ok, got, want) => { ok ? pass++ : fail++; rows.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '   app=' + JSON.stringify(got) + '  pandas=' + JSON.stringify(want))); };
(async () => {
  const b = await chromium.launch(), page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errs = [], external = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/503/.test(m.text())) errs.push(m.text()); });
  await page.route('**/*', r => /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:|about:)/.test(r.request().url()) ? r.continue() : (external.push(r.request().url()), r.abort()));
  await page.addInitScript(() => { try { localStorage.setItem('stellura_tour_done', '1'); } catch (e) {} });
  await page.goto(_BASE + '/'); await page.waitForTimeout(1200); await page.evaluate(() => { try { _ddSkipTour(); } catch (e) {} });
  const ev = (f, a) => page.evaluate(f, a), wait = ms => page.waitForTimeout(ms);
  const t0 = Date.now();
  await page.setInputFiles('#fileInput', { name: 'Zomato_Restaurant_Dataset.csv', mimeType: 'text/csv', buffer: fs.readFileSync(CSV) });
  await page.waitForFunction(() => typeof rawData !== 'undefined' && rawData.length > 9000, null, { timeout: 60000 });
  const load = Date.now() - t0;
  check('file opens with every row (9,551) and column (21) in ' + load + ' ms', await ev(() => rawData.length) === E.rows && await ev(() => headers.length) === 21, await ev(() => rawData.length), E.rows);
  const col = n => ev(n => headers.indexOf(n), n);
  // a chart exactly as the Studio would draw it, and its numbers
  async function chart(type, spec) {
    const t = Date.now();
    await ev(a => STL.openChartStudio({ type: a.type, spec: a.spec }), { type, spec });
    await page.waitForFunction(() => document.querySelector('#csCap p') || document.getElementById('csMsg').style.display !== 'none', null, { timeout: 15000 }); await wait(250);
    const out = await ev(() => { const o = echarts.getInstanceByDom(document.getElementById('csChart')).getOption(), ax = (o.yAxis && o.yAxis[0] && o.yAxis[0].type === 'category') ? o.yAxis[0] : o.xAxis[0]; const val = v => (v && typeof v === 'object') ? v.value : v;
      return { cats: ax.data, series: o.series.map(s => ({ n: s.name, v: (s.data || []).map(val) })), cap: Array.from(document.querySelectorAll('#csCap p')).map(p => p.textContent), meta: (document.querySelector('#csCap .cs-meta') || {}).textContent }; });
    out.ms = Date.now() - t; return out;
  }
  const map = o => Object.fromEntries(o.cats.map((c, i) => [c, o.series[0].v[i]]));

  // 1. the column's own facts
  await ev(() => { filteredData = null; }); const ci = await col('Aggregate rating');
  await ev(c => STL.columnInsight(c), ci); await wait(500);
  const pop = await ev(() => document.getElementById('tvPop') ? document.getElementById('tvPop').innerText : '');
  check('column facts show the zeros (2,148 = 22%) and offer to hide them', /Zeros[\s\S]*2,148/.test(pop) && /22%/.test(pop) && /Hide the zeros/.test(pop), pop.slice(0, 200), '2,148 (22%)');
  await page.screenshot({ path: SD + 'z-insight.png' });
  await ev(() => document.getElementById('tvPopX').click());
  // 2. what the app suggests by itself
  await ev(() => STL.openBoard()); await page.waitForFunction(() => document.querySelectorAll('#boardDialog .cs-card-c canvas').length >= 6, null, { timeout: 25000 }); await wait(1500);
  const cards = await ev(() => Array.from(document.querySelectorAll('#boardDialog .cs-card')).map(c => c.querySelector('.cs-card-h span').textContent));
  console.log('AUTO-SUGGESTED CHARTS:'); cards.forEach((c, i) => console.log('  ' + (i + 1) + '. ' + c));
  await page.screenshot({ path: SD + 'z-board2.png' });
  check('first suggestion is the average rating by a group (never a sum of IDs)', /highest average Aggregate rating/.test(cards[0]) && !cards.some(c => /Restaurant ID|Longitude|Latitude/.test(c)), cards[0], 'Which … has the highest average Aggregate rating?');
  await ev(() => document.getElementById('bdX').click());
  const P = { rating: await col('Aggregate rating'), price: await col('Price range'), city: await col('City'), cuis: await col('Cuisines'), deliv: await col('Has Online delivery'), book: await col('Has Table booking'), votes: await col('Votes'), name: await col('Restaurant Name'), cc: await col('Country Code') };
  // 3. rating distribution
  let o = await chart('histogram', { xnum: P.rating, noZero: true });
  const hn = o.series[0].v.reduce((a, b) => a + b, 0);
  check('rating histogram counts the 7,403 rated restaurants (zeros left out), ' + o.ms + ' ms', hn === E.rated && o.cap.some(c => /2,148 rows have 0/.test(c)), [hn, o.cap.slice(-1)], E.rated);
  // 4. rating by price range
  o = await chart('column', { x: P.price, ys: [{ col: P.rating, fn: 'avg' }], sort: 'natural', noZero: true }); let m = map(o);
  check('average rating by price range matches (3.239 / 3.377 / 3.777 / 3.891), ' + o.ms + ' ms', Object.keys(E.avg_by_price).every(k => near(m[k], E.avg_by_price[k])), m, E.avg_by_price);
  // 5. cities
  o = await chart('bar', { x: P.city, ys: [{ col: -1, fn: 'count' }], sort: 'desc', topN: 4, others: false }); m = map(o);
  check('restaurants per city: New Delhi 5,473 / Gurgaon 1,118 / Noida 1,080 / Faridabad 251', Object.entries(E.city_counts).every(([k, v]) => m[k] === v), m, E.city_counts);
  // 6. cuisines (a list column)
  o = await chart('bar', { x: P.cuis, multi: true, ys: [{ col: -1, fn: 'count' }], sort: 'desc', topN: 6, others: false }); m = map(o);
  check('most common cuisines, each item counted separately (North Indian ' + E.cuisine_counts['North Indian'].toLocaleString() + ')', Object.entries(E.cuisine_counts).every(([k, v]) => m[k] === v), m, E.cuisine_counts);
  o = await chart('bar', { x: P.cuis, multi: true, ys: [{ col: P.rating, fn: 'avg' }], sort: 'desc', topN: 5, others: false, noZero: true, minRows: 40 }); m = map(o);
  check('best-rated cuisines (groups of 40+ rated restaurants) match', Object.entries(E.best_cuisines).every(([k, [v]]) => k in m && near(m[k], v)), m, E.best_cuisines);
  check('…and the caption says small groups were hidden', o.cap.some(c => /groups with fewer than 40 rows are hidden/.test(c)), o.cap, 'hidden-groups note');
  // 7. delivery and booking, raw
  o = await chart('column', { x: P.deliv, ys: [{ col: P.rating, fn: 'avg' }], noZero: true }); m = map(o);
  check('raw: online delivery No 3.467 / Yes 3.381', near(m.No, E.deliv_avg.No) && near(m.Yes, E.deliv_avg.Yes), m, E.deliv_avg);
  // 8. the paradox: same question inside Delhi-NCR, split by price range
  await ev(() => { const c = headers.indexOf('City'), k = headers.indexOf('Country Code'); activeFilters = [{ col: c, type: 'values', values: ['New Delhi', 'Gurgaon', 'Noida', 'Faridabad', 'Ghaziabad'] }, { col: k, type: 'values', values: ['1'] }]; applyAllFilters(); });
  await wait(400);
  o = await chart('column', { x: P.price, g: P.deliv, ys: [{ col: P.rating, fn: 'avg' }], sort: 'natural', noZero: true });
  const got = {}; o.series.forEach(s => o.cats.forEach((c, i) => { got[c + '|' + s.n] = s.v[i]; }));
  check('inside Delhi-NCR, delivery vs no delivery within each price range matches pandas (8 numbers)', Object.entries(E.ncr_deliv_by_price).every(([k, v]) => near(got[k], v)), got, E.ncr_deliv_by_price);
  check('…delivery is higher in 3 of 4 price ranges (the raw global gap pointed the other way)', ['1', '2', '4'].every(p => got[p + '|Yes'] > got[p + '|No']), got, 'Yes>No for 1,2,4');
  // 9. votes vs rating
  o = await chart('scatter', { xnum: P.votes, ynum: P.rating, noZero: true, trend: true });
  const rr = await ev(() => { const c = (document.querySelector('#csCap p') || {}).textContent || ''; const m = /r = (-?[\d.]+)/.exec(c); return m ? +m[1] : null; });
  await ev(() => { activeFilters = []; applyAllFilters(); }); await wait(300);
  o = await chart('scatter', { xnum: P.votes, ynum: P.rating, noZero: true, trend: true });
  const rr2 = await ev(() => { const c = (document.querySelector('#csCap p') || {}).textContent || ''; const m = /r = (-?[\d.]+)/.exec(c); return m ? +m[1] : null; });
  check('votes vs rating correlation r = ' + rr2 + ' (pandas ' + E.pearson_votes_rating.toFixed(2) + ')', rr2 !== null && near(rr2, E.pearson_votes_rating, 0.006), rr2, E.pearson_votes_rating);
  // 10. chains
  o = await chart('bar', { x: P.name, ys: [{ col: P.rating, fn: 'avg' }], sort: 'asc', topN: 40, others: false, noZero: true, minRows: 40 }); m = map(o);
  check('big chains (40+ rated outlets): Domino\'s 2.93, Cafe Coffee Day, Subway … match', Object.entries(E.chains40).every(([k, [v]]) => k in m && near(m[k], v)), m, E.chains40);
  // 11. click a cuisine bar: the table shows exactly those restaurants
  o = await chart('bar', { x: P.cuis, multi: true, ys: [{ col: -1, fn: 'count' }], sort: 'desc', topN: 8, others: false });
  const idx = o.cats.indexOf('Italian');
  const pos = await ev(i => { const inst = echarts.getInstanceByDom(document.getElementById('csChart')), o = inst.getOption(), v = o.series[0].data[i], val = typeof v === 'object' ? v.value : v; const p = inst.convertToPixel({ seriesIndex: 0 }, [val * 0.5, i]), r = document.getElementById('csChart').getBoundingClientRect(); return { x: r.left + p[0], y: r.top + p[1] }; }, idx);
  await page.mouse.click(pos.x, pos.y); await wait(700);
  const shown = await ev(() => filteredData ? filteredData.length : -1);
  check('clicking the “Italian” bar shows exactly its ' + E.italian_rows + ' restaurants in the table', shown === E.italian_rows, shown, E.italian_rows);
  await page.screenshot({ path: SD + 'z-click.png' });
  await ev(() => document.getElementById('csClear').click());
  // 12. countries
  o = await chart('column', { x: P.cc, ys: [{ col: P.rating, fn: 'avg' }], sort: 'desc', noZero: true }); m = map(o);
  check('average rating by country code matches pandas (15 countries)', Object.entries(E.avg_rating_by_country).every(([k, v]) => near(m[k], v)), m, '15 values');
  rows.forEach(r => console.log(r)); console.log(`\n${pass} passed, ${fail} failed; load ${load} ms; errors:`, errs, 'external:', external);
  await b.close();
})();
