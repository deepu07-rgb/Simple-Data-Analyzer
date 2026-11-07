const { chromium } = require('playwright'); const fs = require('fs');
// Real-file regression: needs the original file. REAL_DIR=<folder holding the files> BASE=http://127.0.0.1:5055 node tests/real_files/<this file>
// (the file is not in the repository; without it this script says SKIP and exits 0)
const _fs = require('fs'); const _find = n => { const d = process.env.REAL_DIR; if (!d) { console.log('SKIP: set REAL_DIR to the folder with ' + n); process.exit(0); } const f = _fs.readdirSync(d).find(x => x.endsWith(n)); if (!f) { console.log('SKIP: ' + n + ' not found in ' + d); process.exit(0); } return d + '/' + f; };
const _BASE = process.env.BASE || 'http://127.0.0.1:5000';
const SD = '/tmp/claude-0/-home-user-Simple-Data-Analyzer/488a91e3-a416-5450-8d0d-3430e4418741/scratchpad/';
const CSV = _find('indonesia_coffee_chain_wars_enriched_2026.csv');
const X = JSON.parse(fs.readFileSync(SD + 'cof/expected2.json'));
const near = (a, b, t) => Math.abs(a - b) <= t; let P = 0, Fl = 0; const res = [];
const check = (n, ok, got, want) => { ok ? P++ : Fl++; res.push((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : '  app=' + JSON.stringify(got).slice(0, 400) + ' expected=' + JSON.stringify(want).slice(0, 400))); };
(async () => {
  const b = await chromium.launch(), page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(() => { try { localStorage.setItem('sda_first_run', 'done'); } catch (e) {} });
  await page.goto(_BASE + '/'); await page.waitForTimeout(1200);
  const ev = (f, a) => page.evaluate(f, a), wait = ms => page.waitForTimeout(ms);
  const t0 = Date.now();
  await page.setInputFiles('#fileInput', { name: 'coffee.csv', mimeType: 'text/csv', buffer: fs.readFileSync(CSV) });
  await page.waitForFunction(() => (window.BIG && BIG.active && BIG.matched === 13000) || (typeof rawData !== 'undefined' && rawData.length === 13000), null, { timeout: 90000 });
  const big = await ev(() => !!(window.BIG && BIG.active)); const loadMs = Date.now() - t0;
  check('opens with all 13,000 rows (' + (big ? 'Large File mode' : 'normal mode') + ') in ' + loadMs + ' ms', true);
  const H = await ev(() => (window.BIG && BIG.active) ? BIG.headers : headers); const c = n => H.indexOf(n);
  async function chart(type, spec) { const t = Date.now(); await ev(a => STL.openChartStudio({ type: a.type, spec: a.spec }), { type, spec });
    await page.waitForFunction(() => { const m = document.getElementById('csMsg'); return (document.querySelector('#csCap p') || (m && m.style.display !== 'none')); }, null, { timeout: 30000 }); await wait(400);
    const o = await ev(() => { const o = echarts.getInstanceByDom(document.getElementById('csChart')).getOption(), ax = (o.yAxis && o.yAxis[0] && o.yAxis[0].type === 'category') ? o.yAxis[0] : (o.xAxis ? o.xAxis[0] : null); const val = v => (v && typeof v === 'object') ? v.value : v; return { cats: ax && ax.data, series: o.series.map(s => ({ n: s.name, v: (s.data || []).map(val) })), cap: Array.from(document.querySelectorAll('#csCap p')).map(p => p.textContent) }; }); o.ms = Date.now() - t; return o; }
  const map = o => Object.fromEntries((o.cats || []).map((k, i) => [k, o.series[0].v[i]]));
  const allNear = (m, w, t) => Object.entries(w).every(([k, v]) => near(m[k], v, t));
  // 1. suggestions
  await ev(() => STL.openBoard()); await page.waitForFunction(() => document.querySelectorAll('#boardDialog .cs-card-c canvas').length >= 5, null, { timeout: 60000 }); await wait(1500);
  const cards = await ev(() => Array.from(document.querySelectorAll('#boardDialog .cs-card')).map(c => c.querySelector('.cs-card-h span').textContent + '  ⇒ ' + c.querySelector('.cs-card-cap').textContent.slice(0, 120)));
  console.log('AUTO-SUGGESTED:'); cards.forEach((x, i) => console.log('  ' + (i + 1) + '. ' + x)); await page.screenshot({ path: SD + 'cof-app-board.png' }); check('the board leads with a business number (revenue, margin or cups), not a score', /revenue|margin|cups/.test(cards[0]), cards[0], 'revenue/margin/cups');
  check('no board card sums a percentage column', !cards.some(x => /total discount_voucher_pct|total .*_pct/.test(x)), cards, 'no totals of pct');
  await ev(() => document.getElementById('bdX').click());
  // 2. plain numbers
  let o = await chart('column', { x: c('coffee_brand'), ys: [{ col: c('daily_cups_sold'), fn: 'avg' }], sort: 'desc' }); check('average cups per day by brand (5), ' + o.ms + ' ms', allNear(map(o), X.cups_by_brand, 0.006), map(o), X.cups_by_brand);
  o = await chart('column', { x: c('coffee_brand'), ys: [{ col: c('daily_revenue_estimate_idr'), fn: 'avg' }] }); check('average daily revenue by brand', allNear(map(o), X.rev_by_brand, 1), map(o), X.rev_by_brand);
  o = await chart('column', { x: c('coffee_brand'), ys: [{ col: c('outlet_operating_margin_estimate_pct'), fn: 'avg' }] }); check('average margin by brand', allNear(map(o), X.margin_by_brand, 0.006), map(o), X.margin_by_brand);
  o = await chart('column', { x: c('coffee_brand'), ys: [{ col: c('discount_voucher_pct'), fn: 'pct', op: '>=', value: '30' }] }); check('% of stores with discount ≥ 30% by brand', allNear(map(o), X.pct_disc30_by_brand, 0.01), map(o), X.pct_disc30_by_brand);
  o = await chart('column', { x: c('store_format'), ys: [{ col: c('customer_review_rating'), fn: 'pct', op: '=', value: '5' }] }); check('% of 5-star ratings by store format', allNear(map(o), X.pct_rating5_by_format, 0.01), map(o), X.pct_rating5_by_format);
  o = await chart('column', { x: c('order_method'), ys: [{ col: c('dwell_time_minutes'), fn: 'avg' }] }); check('average dwell time by order method (dine-in 57.5 vs ~9)', allNear(map(o), X.dwell_mean_by_method, 0.006), map(o), X.dwell_mean_by_method);
  o = await chart('column', { x: c('order_method'), ys: [{ col: c('dwell_time_minutes'), fn: 'median' }] }); check('median dwell time by order method', allNear(map(o), X.dwell_median_by_method, 0.6), map(o), X.dwell_median_by_method);
  o = await chart('donut', { x: c('customer_brand_loyalty_tier'), ys: [{ col: -1, fn: 'count' }] }); const tiers = await ev(() => Object.fromEntries(echarts.getInstanceByDom(document.getElementById('csChart')).getOption().series[0].data.map(d => [d.name, d.value]))); check('loyalty tier counts', Object.entries(X.tiers).every(([k, v]) => tiers[k] === v), tiers, X.tiers);
  o = await chart('scatter', { xnum: c('discount_voucher_pct'), ynum: c('outlet_operating_margin_estimate_pct'), trend: true }); const r1 = +((/r = (-?[\d.]+)/.exec(o.cap.join(' ')) || [])[1]); check('discount vs margin correlation r = ' + r1, near(r1, X.r.disc_margin, 0.006), r1, X.r.disc_margin);
  o = await chart('scatter', { xnum: c('discount_voucher_pct'), ynum: c('daily_cups_sold'), trend: true }); const r2 = +((/r = (-?[\d.]+)/.exec(o.cap.join(' ')) || [])[1]); check('discount vs cups correlation r = ' + r2 + ' (looks like discounts work)', near(r2, X.r.disc_cups, 0.006), r2, X.r.disc_cups);
  // 3. key drivers
  const drv = async (yName, noZero) => { await ev(a => STL.openDrivers({ y: a }), c(yName)); await page.waitForFunction(() => document.querySelector('#drOut table'), null, { timeout: 90000 }); await wait(1800);
    const r = await ev(() => ({ lines: Array.from(document.querySelectorAll('#drOut .fr-verdict p')).map(p => p.innerText), cols: document.getElementById('drCols') ? document.getElementById('drCols').innerText : '', rule: Array.from(document.querySelectorAll('.dr-rule-h')).map(h => h.textContent), rules: Array.from(document.querySelectorAll('.dr-rule tr')).slice(1).map(t => t.innerText.replace(/\s+/g, ' ').trim()), rows: Array.from(document.querySelectorAll('#drOut table:not(.dr-rule) tr')).slice(1).map(t => [t.cells[0].innerText.split('\n')[0].replace(/ ⚠| \(5 bands\)/g, '').trim(), parseFloat(t.cells[1] ? t.cells[1].innerText : 'NaN')]) }));
    await page.screenshot({ path: SD + 'cof-app-drivers-' + yName + '.png' }); await ev(() => document.getElementById('drX').click()); return r; };
  const out = {};
  for (const y of ['outlet_operating_margin_estimate_pct', 'daily_cups_sold', 'daily_revenue_estimate_idr', 'customer_review_rating']) {
    const t = Date.now(); const r = await drv(y); r.ms = Date.now() - t; out[y] = r; console.log('\nDRIVERS for ' + y + ' (' + r.ms + ' ms):'); r.lines.forEach(l => console.log('  > ' + l)); r.rule.forEach(l => console.log('  ' + l)); r.rules.forEach(l => console.log('    ' + l));
    const om = X.omega[y], app = Object.fromEntries(r.rows); const top = Object.entries(om).slice(0, 4).filter(([k]) => k in app); check('ω² for ' + y + ' matches Python (' + top.map(([k, v]) => k + ' ' + v).join(', ') + ')', top.length && top.every(([k, v]) => near((app[k] || 0) / 100, v, 0.005)), top.map(([k]) => [k, app[k]]), top); }
  // 4. fair comparison: brand margin, same discount / beans / format
  await ev(a => STL.openFair({ y: a.y, f: a.f, adj: a.adj }), { y: c('outlet_operating_margin_estimate_pct'), f: c('coffee_brand'), adj: [c('discount_voucher_pct'), c('coffee_beans_type'), c('store_format')] });
  await page.waitForFunction(() => document.querySelector('#frOut .fr-verdict'), null, { timeout: 90000 }); await wait(1200);
  const fairRead = async () => ev(() => ({ v: document.querySelector('.fr-verdict').innerText.replace(/\n+/g, ' | '), how: (document.querySelector('#frOut .fr-how') || {}).innerText, rows: Array.from(document.querySelectorAll('.fr-tbl tr')).slice(1).map(t => Array.from(t.cells).map(x => x.innerText.replace(/\s+/g, ' ').trim())) }));
  const num = s => +((/[−+-]?\d+(\.\d+)?/.exec(s || '') || ['NaN'])[0].replace('−', '-'));
  let fr = await fairRead(); check('Fair (automatic): the brand margin gap is called a mix effect, not "part of the gap"', /The gap is not real — it comes from who is in each group/.test(fr.v) && /only \d+(\.\d)?% of the first gap/.test(fr.v), fr.v.slice(0, 500), 'explained + tiny'); console.log('\nFAIR automatic:', fr.v.slice(0, 700)); console.log('  how:', (fr.how || '').slice(0, 260)); fr.rows.forEach(r => console.log('  ', r.join(' ; ')));
  for (const shape of ['line', 'curve']) {
    await page.selectOption('#frLin', shape); await page.waitForFunction(s => new RegExp(s === 'curve' ? 'curves' : 'straight lines').test((document.querySelector('#frOut .fr-how') || {}).textContent || ''), shape, { timeout: 60000 }); await wait(500);
    fr = await fairRead(); const got = {}; fr.rows.forEach(r => { if (!/compared against/.test(r[0])) got[r[0]] = num(r[4]); });
    const exp = Object.fromEntries(Object.entries(X['fair_' + shape]).map(([k, v]) => [k, v[0]]));
    check('Fair: brand margin gap vs Tomoro, same discount/beans/format, discount as a ' + shape + ' = statsmodels', Object.entries(exp).every(([k, v]) => near(got[k], v, 0.006)), got, exp); }
  await page.screenshot({ path: SD + 'cof-app-fair.png' }); await ev(() => document.getElementById('frX').click());
  // the key question of this file: do discounts sell more cups once the brand is the same?
  await ev(a => STL.openFair({ y: a.y, f: a.f, adj: a.adj }), { y: c('daily_cups_sold'), f: c('discount_voucher_pct'), adj: [c('coffee_brand')] });
  await page.waitForFunction(() => document.querySelector('#frOut .fr-verdict'), null, { timeout: 90000 }); await wait(1000);
  const nf = await fairRead(); console.log('\nFAIR cups by discount band, same brand:', nf.v.slice(0, 600)); nf.rows.forEach(r => console.log('  ', r.join(' ; ')));
  const top = nf.rows.filter(r => !/compared against/.test(r[0])).sort((a, b) => Math.abs(num(b[3])) - Math.abs(num(a[3])))[0] || [];
  check('Fair with a number as the compared column: top discount band, plain gap > +120 cups but same-brand gap < 30', Math.abs(num(top[3])) > 120 && Math.abs(num(top[4])) < 30, top, 'raw big, adjusted small');
  check('…and the verdict says the gap is the brand mix', /who is in each group/.test(nf.v), nf.v.slice(0, 400), 'mix effect');
  await page.screenshot({ path: SD + 'cof-app-fair-discount.png' }); await ev(() => document.getElementById('frX').click());
  // 5. column checks
  await ev(() => STL.openColumnChecks()); await page.waitForFunction(() => /Columns calculated|No column/.test((document.getElementById('ccOut') || {}).textContent || ''), null, { timeout: 90000 }); const cc = await ev(() => document.getElementById('ccOut').innerText); console.log('\nCOLUMN CHECKS:\n' + cc);
  check('formula: net_discounted_price = base_price × (1 − discount ÷ 100)', /net_discounted_price_idr = base_price_idr × \(1 − discount_voucher_pct ÷ 100\)/.test(cc), cc.slice(0, 600), 'net = base × (1 − d/100)');
  check('formula: daily_revenue = net price × cups sold (the product, not "net = revenue ÷ cups")', /daily_revenue_estimate_idr = (net_discounted_price_idr × daily_cups_sold|daily_cups_sold × net_discounted_price_idr)/.test(cc) && !/net_discounted_price_idr = daily_revenue/.test(cc), cc.slice(0, 700), 'revenue = net × cups');
  check('formula: dwell_time_to_spend_ratio = dwell × 1,000 ÷ net price', /dwell_time_to_spend_ratio = dwell_time_minutes × 1,?000 ÷ net_discounted_price_idr/.test(cc), cc.slice(0, 900), 'dwell ratio');
  check('formula: revenue_per_competitor_density = revenue ÷ (competitors + 1)', /revenue_per_competitor_density = daily_revenue_estimate_idr ÷ \(competitor_density_500m \+ 1\)/.test(cc), cc.slice(0, 900), 'rev per competitor');
  check('cap: margin stops at 45 (118 rows = 0.9%)', /outlet_operating_margin_estimate_pct” stops at 45: 118 rows/.test(cc), cc.slice(-700), 'margin cap 45');
  check('cap: confidence_score stops at 0.99', /confidence_score” stops at 0\.99: 3,509 rows/.test(cc), cc.slice(-700), 'confidence cap');
  await page.screenshot({ path: SD + 'cof-app-columns.png' }); await ev(() => document.getElementById('ccX').click());
  res.forEach(x => console.log(x)); console.log(P + ' passed, ' + Fl + ' failed; load ' + loadMs + ' ms; errors', errs); fs.writeFileSync(SD + 'cof/app_out.json', JSON.stringify({ out, cc, cards }, null, 1)); await b.close();
})();
