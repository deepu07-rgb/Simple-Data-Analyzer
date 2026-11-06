// Found by testing a coffee-chain file (13,000 rows): a remainder that is statistically "significant" but tiny, formulas that
// read the wrong way round, words shared by many column names, percentage columns summed, the wrong headline number.
const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./load');
const ctx = sandbox(['web/js/tasks/29-csv-parse.js', 'web/js/tasks/30-messy-file-fixer.js', 'web/js/tasks/31-merge-anything.js', 'web/js/reports/41-pendency-radar.js', 'web/js/charts/60-chart-engine.js', 'web/js/charts/65-fair-compare.js', 'web/js/charts/66-drivers.js', 'web/js/charts/67-column-checks.js']);
const CH = ctx.STL.charts, F = ctx.STL.fair, D = ctx.STL.drivers, CC = ctx.STL.colChecks;

// brand sells at its own price; revenue = net price × cups; rate columns made from others
function make(n) {
  const rows = [], brands = [['Aa', 14000, 60, 800], ['Bb', 28000, 25, 410], ['Cc', 19000, 18, 370], ['Dd', 22000, 23, 580]];
  for (let i = 0; i < n; i++) {
    const b = brands[i % 4], u = k => ((i * k) % 1000) / 1000;
    const disc = Math.round((b[2] + (u(7919) - 0.5) * 20) * 10) / 10, base = b[1] + Math.round(u(104729) * 4) * 1000, net = Math.round(base * (1 - disc / 100));
    const cups = Math.round(b[3] + (u(1299709) - 0.5) * 120), dens = i % 9, dwell = 5 + (i % 37), rev = net * cups;
    rows.push([b[0], String(base), String(disc), String(net), String(cups), String(rev), String(dens), String(dwell), (dwell * 1000 / net).toFixed(2), (rev / (dens + 1)).toFixed(1), String(Math.round(45 - 0.35 * disc + (i % 4) * 0.01)), String(3 + (i % 5) * 0.5), String(1 + (i % 10)), String(1 + (i * 3 % 10))]);
  }
  return rows;
}
const H = ['coffee_brand', 'base_price_idr', 'discount_voucher_pct', 'net_discounted_price_idr', 'daily_cups_sold', 'daily_revenue_estimate_idr', 'competitor_density_500m', 'dwell_time_minutes', 'dwell_time_to_spend_ratio', 'revenue_per_competitor_density', 'outlet_operating_margin_estimate_pct', 'customer_review_rating', 'customer_price_sensitivity_score', 'customer_loyalty_score'];
const rows = make(4000), idx = rows.map((_, i) => i);

test('formulas: revenue is the calculated column (a product), plus "rate per thousand" and "÷ (b + 1)"', () => {
  const prof = CH.profile(H, rows, idx), f = CC.formulas(rows, idx, H, prof), text = f.map(x => x.text);
  assert.ok(text.some(t => /^daily_revenue_estimate_idr = (net_discounted_price_idr × daily_cups_sold|daily_cups_sold × net_discounted_price_idr)$/.test(t)), text.join(' | '));
  assert.ok(text.some(t => /^net_discounted_price_idr = base_price_idr × \(1 − discount_voucher_pct ÷ 100\)$/.test(t)), text.join(' | '));
  assert.ok(text.some(t => /^dwell_time_to_spend_ratio = dwell_time_minutes × 1,?000 ÷ net_discounted_price_idr$/.test(t)), text.join(' | '));
  assert.ok(text.some(t => /^revenue_per_competitor_density = daily_revenue_estimate_idr ÷ \(competitor_density_500m \+ 1\)$/.test(t)), text.join(' | '));
  assert.ok(!text.some(t => /^net_discounted_price_idr = daily_revenue_estimate_idr/.test(t)), 'net price is not "revenue ÷ cups"');
});

test('a ceiling that holds under 1% of the rows is still found when it is 15 times its neighbours', () => {
  const r2 = rows.map((r, i) => r.slice(0, 10).concat([i % 100 === 0 ? '45' : String(20 + ((i * 7919) % 2400) / 100)], r.slice(11)));
  const prof = CH.profile(H, r2, idx), c = CC.caps(r2, idx, H, prof).filter(x => x.name === 'outlet_operating_margin_estimate_pct');
  assert.ok(c.length === 1 && c[0].side === 'max' && c[0].value === 45 && c[0].count === 40 && c[0].share < 0.011, JSON.stringify(c));
});

test('words that many columns share are ignored; real "calculated from" words still count', () => {
  const prof = CH.profile(H, rows, idx);
  assert.ok(!CH.commonWords.customer, 'three columns share it: not yet common');
  const h2 = H.concat(['customer_segment_code']); CH.profile(h2, rows.map(r => r.concat(['x'])), idx);
  assert.ok(CH.commonWords.customer, 'four columns share it');
  assert.deepEqual(plain(D.sharesName('customer_price_sensitivity_score', 'customer_review_rating')), [], 'only "customer" is shared');
  assert.deepEqual(plain(D.sharesName('revenue_per_competitor_density', 'daily_revenue_estimate_idr')), ['revenue']);
  assert.deepEqual(plain(D.sharesName('outlet_operating_margin_estimate_pct', 'daily_revenue_estimate_idr')), [], '"estimate" and "daily" are generic');
  CH.profile(H, rows, idx);
});
function plain(x) { return JSON.parse(JSON.stringify(x)); }

test('a "_pct" column is averaged, not summed; revenue or margin is the headline, not a score or a price', () => {
  const Hh = ['coffee_brand', 'base_price_idr', 'discount_voucher_pct', 'net_discounted_price_idr', 'daily_cups_sold', 'daily_revenue_estimate_idr', 'competitor_density_500m', 'dwell_time_minutes', 'dwell_time_to_spend_ratio', 'revenue_per_competitor_density', 'outlet_operating_margin_estimate_pct', 'customer_review_rating', 'customer_price_sensitivity_score'];
  const r2 = []; for (let i = 0; i < 4000; i++) { const net = 10000 + (i * 37) % 20000, cups = 100 + (i * 13) % 900; r2.push(['A', String(14000 + i % 9 * 1000), String(i % 50), String(net), String(cups), String(net * cups), String(i % 9), String(5 + i % 37), String(i / 7), String(i * 3), String(20 + i % 25), String(3 + (i % 5) * 0.5), String(1 + i % 10)]); }
  const prof = CH.profile(Hh, r2, r2.map((_, i) => i)), by = n => prof[Hh.indexOf(n)];
  assert.equal(CH.fnFor(by('discount_voucher_pct')), 'avg', 'a percentage is averaged');
  const nums = CH.rankMeasures(prof.filter(CH.isMeasure)).map(p => p.name);
  assert.equal(nums[0], 'daily_revenue_estimate_idr', 'headline: ' + nums.slice(0, 4).join(', '));
  assert.notEqual(nums[0], 'customer_price_sensitivity_score', 'an index with "price" in its name never leads');
  assert.ok(nums.indexOf('revenue_per_competitor_density') > nums.indexOf('daily_revenue_estimate_idr'), 'a "per" figure comes after the figure it is made from');
});

test('a remainder of 0.2% of the gap is "explained by mix", however significant it is', () => {
  const R = { names: ['brand', 'discount (curve)'], ref: 'Tomoro', adjusters: ['discount (curve)', 'beans'], nAdjust: 2, n: 13000, groups: [], levels: [],
    main: { level: 'Point', n: 1709, mean: 36, raw: { diff: 10.98, se: 0.1, p: 1e-12 }, adj: { diff: 0.02, se: 0.005, lo: 0.01, hi: 0.03, p: 0.003 } },
    driver: { name: 'discount (curve)', dim: 1 }, mix: { main: 'Point', ref: 'Tomoro', rows: [{ level: '0.1–15.4', shareMain: 0.45, shareRef: 0.01 }] } };
  const v = F.verdict(R, false);
  assert.equal(v.kind, 'explained'); assert.ok(v.tiny); assert.match(v.text, /What is left \(\+0\.02\) is only 0\.2% of the first gap/);
  assert.match(F.verdict(R, true).text, /केवल 0\.2%/);
  R.main.adj = { diff: 3, se: 0.2, lo: 2.6, hi: 3.4, p: 1e-9 };                              // 27% left: not negligible
  assert.equal(F.verdict(R, false).kind, 'shrinks');
  R.main.adj = { diff: -0.02, se: 0.005, lo: -0.03, hi: -0.01, p: 0.003 };                    // tiny and on the other side: not a "reversal"
  assert.equal(F.verdict(R, false).kind, 'explained');
});

test('a number can be the compared column: ref = the lowest band', () => {
  const lab = ['0–10', '10–20', '20–30', '30+'], cells = [];
  [[0, 400], [1, 405], [2, 402], [3, 408]].forEach(([k, m]) => { for (const br of ['A', 'B']) cells.push({ k: [lab[k], br], n: 500, sy: 500 * (m + (br === 'A' ? 0 : 300)), syy: 500 * Math.pow(m + (br === 'A' ? 0 : 300), 2) + 500 * 100 }); });
  const R = F.analyse(cells, ['discount (bands)', 'brand'], { ref: '0–10' });
  assert.equal(R.ref, '0–10'); assert.ok(R.levels.every(l => l.level !== '0–10'));
  assert.ok(R.levels.every(l => Math.abs(l.adj.diff) < 9), 'within a brand the bands hardly differ: ' + R.levels.map(l => l.adj.diff.toFixed(1)));
});
