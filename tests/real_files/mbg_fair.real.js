const { chromium } = require('playwright'); const fs = require('fs');
// Real-file regression: needs the original file. REAL_DIR=<folder holding the files> BASE=http://127.0.0.1:5055 node tests/real_files/<this file>
// (the file is not in the repository; without it this script says SKIP and exits 0)
const _fs = require('fs'); const _find = n => { const d = process.env.REAL_DIR; if (!d) { console.log('SKIP: set REAL_DIR to the folder with ' + n); process.exit(0); } const f = _fs.readdirSync(d).find(x => x.endsWith(n)); if (!f) { console.log('SKIP: ' + n + ' not found in ' + d); process.exit(0); } return d + '/' + f; };
const _BASE = process.env.BASE || 'http://127.0.0.1:5000';
const SD = '/tmp/claude-0/-home-user-Simple-Data-Analyzer/488a91e3-a416-5450-8d0d-3430e4418741/scratchpad/';
const CSV = _find('indonesia_mbg_nationwide_enriched_2026.csv');
const E = JSON.parse(fs.readFileSync(SD + 'mbg_expected.json'));
const near = (a, b, t = 0.006) => Math.abs(a - b) <= t; let P = 0, Fl = 0; const res = [];
const check = (n, ok, got, want) => { ok ? P++ : Fl++; res.push((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : '  app=' + JSON.stringify(got).slice(0, 300) + ' expected=' + JSON.stringify(want).slice(0, 300))); };
(async () => {
  const b = await chromium.launch(), page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(() => { try { localStorage.setItem('sda_first_run', 'done'); } catch (e) {} });
  await page.goto(_BASE + '/'); await page.waitForTimeout(1200);
  const ev = (f, a) => page.evaluate(f, a), wait = ms => page.waitForTimeout(ms);
  const t0 = Date.now();
  await page.setInputFiles('#fileInput', { name: 'indonesia_mbg_nationwide_enriched_2026.csv', mimeType: 'text/csv', buffer: fs.readFileSync(CSV) });
  await page.waitForFunction(() => window.BIG && BIG.active && BIG.matched === 13000, null, { timeout: 60000 });
  check('opens in Large File mode with all 13,000 rows in ' + (Date.now() - t0) + ' ms', true);
  const H = await ev(() => BIG.headers); const c = n => H.indexOf(n);
  async function chart(type, spec) { const t = Date.now(); await ev(a => STL.openChartStudio({ type: a.type, spec: a.spec }), { type, spec });
    await page.waitForFunction(() => { const m = document.getElementById('csMsg'); return (document.querySelector('#csCap p') || (m && m.style.display !== 'none')); }, null, { timeout: 20000 }); await wait(400);
    const o = await ev(() => { const o = echarts.getInstanceByDom(document.getElementById('csChart')).getOption(), ax = (o.yAxis && o.yAxis[0] && o.yAxis[0].type === 'category') ? o.yAxis[0] : (o.xAxis ? o.xAxis[0] : null); const val = v => (v && typeof v === 'object') ? (Array.isArray(v.value) ? v.value : v.value) : v; return { cats: ax && ax.data, series: o.series.map(s => ({ n: s.name, v: (s.data || []).map(val) })), cap: Array.from(document.querySelectorAll('#csCap p')).map(p => p.textContent), msg: document.getElementById('csMsg').style.display !== 'none' ? document.getElementById('csMsg').textContent : '' }; }); o.ms = Date.now() - t; return o; }
  const map = o => Object.fromEntries((o.cats || []).map((k, i) => [k, o.series[0].v[i]]));
  // 1. what it suggests unprompted
  await ev(() => STL.openBoard()); await page.waitForFunction(() => document.querySelectorAll('#boardDialog .cs-card-c canvas').length >= 5, null, { timeout: 40000 }); await wait(1500);
  const cards = await ev(() => Array.from(document.querySelectorAll('#boardDialog .cs-card')).map(c => c.querySelector('.cs-card-h span').textContent + '  ⇒ ' + c.querySelector('.cs-card-cap').textContent.slice(0, 110)));
  console.log('AUTO-SUGGESTED:'); cards.forEach((x, i) => console.log('  ' + (i + 1) + '. ' + x)); await page.screenshot({ path: SD + 'mbg-app-board.png' }); await ev(() => document.getElementById('bdX').click());
  // 2. waste by beneficiary
  let o = await chart('column', { x: c('beneficiary_category'), ys: [{ col: c('plate_waste_percentage'), fn: 'avg' }], sort: 'desc' }); let m = map(o);
  check('average plate waste by beneficiary group (5 values), ' + o.ms + ' ms', Object.entries(E.waste_by_cat).every(([k, v]) => near(m[k], v)), m, E.waste_by_cat);
  o = await chart('column', { x: c('delivery_transport_mode'), ys: [{ col: c('food_arrival_temperature_celsius'), fn: 'avg' }] }); m = map(o);
  check('average arrival temperature by transport mode', Object.entries(E.temp_by_mode).every(([k, v]) => near(m[k], v)), m, E.temp_by_mode);
  o = await chart('donut', { x: c('bgn_program_compliance_tier'), ys: [{ col: -1, fn: 'count' }] });
  const tiers = await ev(() => Object.fromEntries(echarts.getInstanceByDom(document.getElementById('csChart')).getOption().series[0].data.map(d => [d.name, d.value])));
  check('compliance tier counts', Object.entries(E.tiers).every(([k, v]) => tiers[k] === v), tiers, E.tiers);
  o = await chart('scatter', { xnum: c('estimated_calories_kcal'), ynum: c('plate_waste_percentage'), trend: true });
  const r = +((/r = (-?[\d.]+)/.exec(o.cap.join(' ')) || [])[1]); check('calories vs waste correlation r = ' + r, near(r, E.r_kcal_waste, 0.006), r, E.r_kcal_waste);
  // 3. Fair comparison: transport mode, adjusted for cluster + group
  await ev(a => STL.openFair({ y: a.y, f: a.f, adj: a.adj }), { y: c('plate_waste_percentage'), f: c('delivery_transport_mode'), adj: [c('regional_cluster'), c('beneficiary_category')] });
  await page.waitForFunction(() => document.querySelector('#frOut .fr-verdict'), null, { timeout: 20000 }); await wait(600);
  const fr = await ev(() => ({ ref: (document.querySelector('.fr-tbl tr:nth-child(2) td') || {}).innerText, rows: Array.from(document.querySelectorAll('.fr-tbl tr')).map(t => t.innerText.replace(/\s+/g, ' ')), v: document.querySelector('.fr-verdict').innerText }));
  const boatRow = fr.rows.find(t => /Perahu/.test(t)) || ''; const adj = +((/[−+-]\d+\.\d\d/g.exec(boatRow.split(')')[1] || '') || ['NaN'])[0].replace('−', '-'));
  console.log('\nFAIR (mode, adj cluster+group):', fr.v.replace(/\n/g, ' | ').slice(0, 400)); console.log('  boat row:', boatRow);
  check('Fair comparison: boat vs e-motor, like-for-like (cluster + group) = +0.94 like statsmodels', near(adj, E.fair_boat_cl_cat[0], 0.006), adj, E.fair_boat_cl_cat[0]);
  await page.screenshot({ path: SD + 'mbg-app-fair.png' }); await ev(() => document.getElementById('frX').click());
  // 4. things an analyst needs next
  o = await chart('column', { x: c('food_arrival_temperature_celsius'), ys: [{ col: c('plate_waste_percentage'), fn: 'avg' }], sort: 'natural' });
  console.log('\nTRY: waste by arrival temperature (a number on the x axis) ->', (o.cats || []).length, 'bars;', o.cap[0]);
  console.log('TRY: share of meals below 60°C by mode -> no direct measure; available functions:', await ev(() => STL.charts.FUNCS.map(f => f[0]).join(',')));
  res.forEach(x => console.log(x)); console.log(P + ' passed, ' + Fl + ' failed; errors', errs);
  await b.close();
})();
