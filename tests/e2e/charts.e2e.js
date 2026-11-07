/*
 * Chart Studio, Insights board and table interactions in a real browser, all external network blocked.
 *   STELLURA_HOME=/tmp/stl-home PORT=5055 python app.py
 *   BASE=http://127.0.0.1:5055 node tests/e2e/charts.e2e.js        (SHOTS=/some/dir to keep screenshots)
 */
const { chromium } = require('playwright');
const path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:5000';
let failures = 0;
const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x))); if (!c) failures++; };

// ---------- a believable register: 8 stations, 3 statuses, 4 categories, amounts, dates, counts ----------
function rng(seed) { let x = seed; return () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296; }
const STATIONS = ['कोतवाली', 'सांगानेर', 'मानसरोवर', 'बगरू', 'चौमू', 'शाहपुरा', 'आमेर', 'विराटनगर'];
const STATUS = ['लंबित', 'निस्तारित', 'जाँच में'], CAT = ['चोरी', 'मारपीट', 'धोखाधड़ी', 'दुर्घटना'];
function makeCsv() {
  const r = rng(7), rows = [['थाना', 'स्थिति', 'श्रेणी', 'राशि', 'तारीख', 'गवाह', 'आयु']];
  for (let i = 0; i < 320; i++) {
    const st = Math.floor(r() * STATIONS.length), m = 1 + Math.floor(r() * 8), d = 1 + Math.floor(r() * 27), amt = Math.round(2000 + r() * 90000 * (1 + st * 0.15));
    rows.push([STATIONS[st], STATUS[Math.floor(r() * 3)], CAT[Math.floor(r() * 4)], amt, `${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}-2025`, 1 + Math.floor(r() * 6), 18 + Math.floor(r() * 50) + Math.round(amt / 9000)]);
  }
  return Buffer.from(rows.map(x => x.join(',')).join('\n') + '\n', 'utf8');
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const external = [], errors = [];
  await page.route('**/*', r => /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:|about:)/.test(r.request().url()) ? r.continue() : (external.push(r.request().url()), r.abort()));
  page.on('pageerror', e => errors.push('pageerror: ' + e.message + ' @ ' + String(e.stack || '').split('\n').slice(1, 3).join(' | ')));
  page.on('console', m => { if (m.type() === 'error' && !/503|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(1200);
  await page.evaluate(() => { try { _ddSkipTour(); } catch (e) {} });
  const shot = async n => { if (process.env.SHOTS) { await page.waitForTimeout(600); await page.screenshot({ path: path.join(process.env.SHOTS, n + '.png') }); } };
  const wait = ms => page.waitForTimeout(ms);
  const ev = (fn, arg) => page.evaluate(fn, arg);

  // ---- no data: friendly message, nothing breaks
  await ev(() => STL.openChartStudio());
  ok(!(await ev(() => document.body.classList.contains('cs-open'))), 'Studio refuses politely when no file is open');

  await page.setInputFiles('#fileInput', { name: 'register.csv', mimeType: 'text/csv', buffer: makeCsv() });
  await page.waitForFunction(() => rawData.length > 0, null, { timeout: 15000 }); await wait(900);
  await ev(() => { try { document.querySelectorAll('.stl-overlay').forEach(e => e.remove()); } catch (e) {} });

  // ---- open from the toolbar's Charts tool
  await ev(() => switchTool('chart'));
  await page.waitForFunction(() => window.echarts && echarts.getInstanceByDom(document.getElementById('csChart')), null, { timeout: 8000 });
  await wait(400);
  ok(await ev(() => document.getElementById('chartStudio').classList.contains('open')), 'The Charts tool opens the Chart Studio beside the table');
  const gallery = await ev(() => Array.from(document.querySelectorAll('#csGallery .cs-t')).map(b => b.dataset.type));
  ok(gallery.length === 25, 'The gallery offers 25 chart types', gallery.length);
  const firstCap = await ev(() => Array.from(document.querySelectorAll('#csCap p')).map(p => p.textContent));
  ok(firstCap.length >= 1 && firstCap[0].length > 20, 'A plain-language sentence describes the chart', firstCap);
  const startType = await ev(() => document.querySelector('#csGallery .cs-t.on').dataset.type);
  ok(startType === 'column', 'A sensible chart is chosen automatically (column: amount by station)', startType);
  await shot('01-studio-column');

  // ---- every chart type renders with real content and no errors
  const results = {};
  for (const t of gallery) {
    await ev(tp => document.querySelector('#csGallery .cs-t[data-type="' + tp + '"]').click(), t); await wait(260);
    results[t] = await ev(() => {
      const inst = echarts.getInstanceByDom(document.getElementById('csChart')), o = inst.getOption(), msg = document.getElementById('csMsg');
      const series = (o.series || []).length, data = (o.series || []).reduce((n, s) => n + ((s.data && s.data.length) || 0), 0);
      return { series, data, msg: msg.style.display !== 'none' ? msg.textContent : '', cap: document.querySelectorAll('#csCap p').length, nan: JSON.stringify(o.series).indexOf('NaN') >= 0 };
    });
  }
  const bad = Object.entries(results).filter(([t, r]) => r.series < 1 || r.data < 1 || r.msg || r.nan);
  ok(bad.length === 0, 'All 25 chart types draw real data with the sample register', bad);
  ok(Object.values(results).every(r => r.cap >= 1), 'Every chart type writes its caption', Object.entries(results).filter(([t, r]) => r.cap < 1).map(([t]) => t));
  if (process.env.SHOTS) for (const t of ['treemap', 'heatmap', 'scatter', 'calendar', 'radar', 'sunburst', 'waterfall', 'pareto', 'boxplot', 'histogram', 'donut', 'area']) { await ev(tp => document.querySelector('#csGallery .cs-t[data-type="' + tp + '"]').click(), t); await shot('t-' + t); }

  // ---- click a bar -> the table shows exactly those rows; click again -> back
  await ev(() => { document.querySelector('#csGallery .cs-t[data-type="column"]').click(); const x = document.getElementById('csX'); x.value = '0'; x.dispatchEvent(new Event('change')); }); await wait(400);
  const pickBar = async (i, ctrl) => {
    const pos = await ev(i => { const inst = echarts.getInstanceByDom(document.getElementById('csChart')), o = inst.getOption(), v = o.series[0].data[i], val = typeof v === 'object' && v ? v.value : v; const p = inst.convertToPixel({ seriesIndex: 0 }, [i, val / 2]); const r = document.getElementById('csChart').getBoundingClientRect(); return { x: r.left + p[0], y: r.top + p[1], label: o.xAxis[0].data[i] }; }, i);
    if (ctrl) await page.keyboard.down('Control');
    await page.mouse.click(pos.x, pos.y);
    if (ctrl) await page.keyboard.up('Control');
    await wait(350); return pos.label;
  };
  const total = await ev(() => rawData.length);
  const lab1 = await pickBar(0);
  const n1 = await ev(() => filteredData ? filteredData.length : -1);
  const expect1 = await ev(l => rawData.filter(r => String(r[0]).trim() === l).length, lab1);
  ok(n1 === expect1 && n1 > 0 && n1 < total, 'Clicking a bar shows only that station’s rows in the table (' + lab1 + ': ' + n1 + ' of ' + total + ')', [n1, expect1]);
  ok(await ev(() => !!document.querySelector('#tvChips .tv-chip.sel') && document.getElementById('csSelBar').style.display !== 'none'), 'A chart chip and a selection bar explain what the table shows');
  const lab2 = await pickBar(1, true);
  const n2 = await ev(() => filteredData ? filteredData.length : -1);
  const expect2 = await ev(([a, b]) => rawData.filter(r => [a, b].includes(String(r[0]).trim())).length, [lab1, lab2]);
  ok(n2 === expect2 && n2 > n1, 'Ctrl+click adds a second bar to the selection (' + n2 + ' rows)', [n2, expect2]);
  await shot('02-selection');
  await ev(() => document.getElementById('csClear').click()); await wait(300);
  ok(await ev(() => filteredData === null || filteredData.length === rawData.length), 'Show all rows brings the full table back');

  // ---- a filter applied in the table redraws the chart
  await ev(() => { activeFilters.push({ col: 1, type: 'values', values: ['लंबित'] }); applyAllFilters(); }); await wait(500);
  const meta = await ev(() => document.querySelector('.cs-meta').textContent);
  const nPend = await ev(() => rawData.filter(r => r[1] === 'लंबित').length);
  ok(meta.includes(String(nPend)) && /filters applied|फ़िल्टर/.test(meta), 'Table filters flow into the chart (' + meta + ')', meta);
  ok(await ev(() => document.querySelectorAll('#tvChips .tv-chip').length === 1), 'The filter shows as a removable chip above the table');
  await ev(() => document.querySelector('#tvChips button[data-rm]').click()); await wait(500);
  ok(await ev(() => activeFilters.length === 0 && (filteredData === null)), 'Removing the chip clears the filter');

  // ---- drag a range on a scatter chart -> the table follows
  await ev(() => document.querySelector('#csGallery .cs-t[data-type="scatter"]').click()); await wait(400);
  const area = await ev(() => { const inst = echarts.getInstanceByDom(document.getElementById('csChart')), r = document.getElementById('csChart').getBoundingClientRect(); inst.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: 'rect', brushMode: 'single' } }); const a = inst.convertToPixel({ seriesIndex: 0 }, [0, 0]); return { r: { l: r.left, t: r.top, w: r.width, h: r.height } }; });
  await page.mouse.move(area.r.l + area.r.w * 0.25, area.r.t + area.r.h * 0.3); await page.mouse.down(); await page.mouse.move(area.r.l + area.r.w * 0.6, area.r.t + area.r.h * 0.6, { steps: 8 }); await page.mouse.up(); await wait(500);
  const nBrush = await ev(() => filteredData ? filteredData.length : -1);
  ok(nBrush > 0 && nBrush < 320, 'Dragging a box on the scatter chart filters the table to those points (' + nBrush + ' rows)', nBrush);
  await shot('03-brush');
  await ev(() => document.getElementById('csClear').click()); await wait(300);

  // ---- pin and the Insights board
  await ev(() => document.querySelector('#csGallery .cs-t[data-type="donut"]').click()); await wait(300);
  await ev(() => document.getElementById('csPin').click()); await wait(200);
  await ev(() => STL.openBoard()); await wait(1200);
  const cards = await ev(() => Array.from(document.querySelectorAll('#boardDialog .cs-card')).map(c => ({ pinned: c.querySelector('.cs-card-h').textContent.includes('📌') && !!c.querySelector('[data-unpin]'), canvas: !!c.querySelector('canvas'), cap: c.querySelector('.cs-card-cap').textContent.length })));
  ok(cards.length >= 7, 'The board suggests several charts for this data (' + cards.length + ')', cards.length);
  ok(cards[0] && cards[0].pinned, 'Pinned charts come first');
  ok(cards.every(c => c.canvas && c.cap > 10), 'Every board chart is drawn and explained');
  await shot('04-board');
  await ev(() => document.querySelectorAll('#boardDialog .cs-card-c')[2].click()); await wait(700);
  ok(await ev(() => !document.getElementById('boardDialog') && document.getElementById('chartStudio').classList.contains('open')), 'Clicking a board chart opens it in the Studio');
  // a board chart that counts rows keeps counting rows when it is opened in the Studio (it used to switch to a total of the first number column)
  await ev(() => STL.openBoard()); await wait(900);
  const counted = await ev(() => { const cs = Array.from(document.querySelectorAll('#boardDialog .cs-card')), i = cs.findIndex(c => /How many rows/.test(c.querySelector('.cs-card-h').textContent)); if (i < 0) return null; cs[i].querySelector('.cs-card-c').click(); return i; });
  await wait(900);
  ok(counted !== null && await ev(() => { const o = echarts.getInstanceByDom(document.getElementById('csChart')).getOption(); return /Rows|पंक्ति/.test(o.yAxis[0].name || o.xAxis[0].name || '') && !/Total|योग/.test(o.xAxis[0].name || o.yAxis[0].name || ''); }), 'A "how many rows" board chart stays a count when opened in the Studio', counted);
  await ev(() => { STL.board.pins = []; localStorage.removeItem('stellura_board'); });

  // ---- table: column insight, click a bar to filter
  await ev(() => STL.closeChartStudio()); await wait(300);
  ok(await ev(() => document.querySelectorAll('#vthead .tv-i').length) === 7, 'Every column heading has an ⓘ insight button');
  await ev(() => document.querySelector('#vthead .tv-i[data-ci="3"]').click()); await wait(300);
  const pop = await ev(() => { const p = document.getElementById('tvPop'); return p ? { hb: p.querySelectorAll('.tv-hb').length, facts: p.querySelectorAll('.tv-grid div').length, text: p.textContent } : null; });
  ok(pop && pop.hb >= 5 && pop.facts >= 9, 'The insight popover shows the facts and a clickable spread picture', pop && [pop.hb, pop.facts]);
  await shot('05-insight-number');
  await ev(() => document.querySelectorAll('#tvPop .tv-hb')[1].click()); await wait(400);
  const nIns = await ev(() => filteredData ? filteredData.length : -1);
  ok(nIns > 0 && nIns < 320 && await ev(() => activeFilters.length === 1 && activeFilters[0].type === 'between'), 'Clicking a spread bar filters the table to that range (' + nIns + ' rows)', nIns);
  await ev(() => clearAllFilters()); await wait(200);
  await ev(() => document.querySelector('#vthead .tv-i[data-ci="0"]').click()); await wait(300);
  const popT = await ev(() => document.querySelectorAll('#tvPop .tv-tv').length);
  ok(popT === 8, 'A text column lists its most common values (' + popT + ')', popT);
  await shot('06-insight-text');
  await ev(() => document.querySelector('#tvPop .tv-tv').click()); await wait(400);
  const topLab = await ev(() => activeFilters[0] && activeFilters[0].values[0]);
  ok(await ev(() => filteredData && filteredData.every(i => String(rawData[i][0]).trim() === activeFilters[0].values[0])) , 'Clicking a common value shows only those rows (' + topLab + ')');
  await ev(() => clearAllFilters()); await wait(200);
  await ev(() => document.querySelector('#vthead .tv-i[data-ci="4"]').click()); await wait(300);
  ok(await ev(() => /Date|तारीख/.test(document.querySelector('#tvPop .tv-kind').textContent) && document.querySelectorAll('#tvPop .tv-hb').length >= 6), 'A date column shows earliest, latest and rows per month');
  await shot('07-insight-date');
  await page.keyboard.press('Escape'); await wait(150);
  ok(await ev(() => !document.getElementById('tvPop')), 'Esc closes the popover');

  // ---- column visuals through the heading menu
  await ev(() => { ctxHeaderColIdx = 3; STL.tableViz.set(3, 'bars'); }); await wait(300);
  const barsOn = await ev(() => Array.from(document.querySelectorAll('#vtbody td[data-ci="3"]')).slice(0, 6).every(td => td.getAttribute('style').includes('linear-gradient')));
  ok(barsOn, 'Data bars appear in the number column');
  await shot('08-databars');
  await ev(() => STL.tableViz.set(3, 'scale')); await wait(200);
  ok(await ev(() => Array.from(document.querySelectorAll('#vtbody td[data-ci="3"]')).slice(0, 6).every(td => /background-color:\s*rgba/.test(td.getAttribute('style')))), 'Colour scale shades the cells');
  await ev(() => STL.tableViz.set(6, 'dots')); await wait(200);
  ok(await ev(() => Array.from(document.querySelectorAll('#vtbody td[data-ci="6"]')).slice(0, 6).every(td => td.getAttribute('style').includes('radial-gradient'))), 'Traffic lights add coloured dots');
  await shot('09-visuals');
  await ev(() => { STL.tableViz.set(3, null); STL.tableViz.set(6, null); }); await wait(200);
  ok(await ev(() => !document.querySelector('#vtbody td[data-ci="3"]').getAttribute('style').includes('gradient')), 'Visuals can be removed');
  await ev(() => STL.tableViz.set(0, 'bars'));
  ok(await ev(() => !STL.tableViz.mode[headers[0]]), 'Text columns refuse visuals politely');

  // ---- heading right-click menu has the new entries; chart this column
  await page.click('#vthead th:nth-child(6)', { button: 'right' }); await wait(200);
  const items = await ev(() => Array.from(document.querySelectorAll('#col-context-menu .ctx-item')).map(e => e.textContent.trim()).filter(Boolean));
  ok(items.some(t => t.includes('About this column')) && items.some(t => t.includes('Chart this column')) && items.some(t => t.includes('Data bars')), 'The heading menu offers insight, chart and visuals', items);
  await ev(() => document.getElementById('tvm-chart').click()); await wait(900);
  const typeNow = await ev(() => document.querySelector('#csGallery .cs-t.on').dataset.type);
  ok(typeNow === 'histogram', 'Chart this column picks a histogram for a number column', typeNow);
  await ev(() => STL.chartColumn(0)); await wait(700);
  ok(await ev(() => /donut|bar/.test(document.querySelector('#csGallery .cs-t.on').dataset.type)), 'Chart this column picks a bar or donut for a text column');
  await ev(() => STL.chartColumn(4)); await wait(700);
  ok(await ev(() => document.querySelector('#csGallery .cs-t.on').dataset.type === 'area'), 'Chart this column picks a trend for a date column');
  await ev(() => STL.chartColumn(3, 6)); await wait(700);
  ok(await ev(() => document.querySelector('#csGallery .cs-t.on').dataset.type === 'scatter'), 'Two number columns give a scatter chart');

  // ---- measures, split, top N, sort, palette: the controls change the chart
  await ev(() => document.querySelector('#csGallery .cs-t[data-type="column"]').click()); await wait(300);
  ok(await ev(() => { const t = echarts.getInstanceByDom(document.getElementById('csChart')).getOption().title[0].text; return !/ vs /.test(t) && t.length > 3; }), 'Switching chart type does not keep an old, wrong heading');
  await ev(() => { const t = document.getElementById('csTitleIn'); t.value = 'मेरा शीर्षक'; t.dispatchEvent(new Event('input')); }); await wait(500);
  ok(await ev(() => echarts.getInstanceByDom(document.getElementById('csChart')).getOption().title[0].text) === 'मेरा शीर्षक', 'A typed title is used');
  await ev(() => { const t = document.getElementById('csTitleIn'); t.value = ''; t.dispatchEvent(new Event('input')); }); await wait(500);
  await ev(() => { const s = document.getElementById('csTop'); s.value = '5'; s.dispatchEvent(new Event('change')); }); await wait(300);
  ok(await ev(() => echarts.getInstanceByDom(document.getElementById('csChart')).getOption().xAxis[0].data.length) <= 6, 'Top 5 keeps five bars (plus “Others”)');
  await ev(() => { const s = document.getElementById('csTop'); s.value = '0'; s.dispatchEvent(new Event('change')); }); await wait(200);
  await ev(() => document.querySelector('#csGallery .cs-t[data-type="stackedColumn"]').click()); await wait(400);
  const nSer = await ev(() => echarts.getInstanceByDom(document.getElementById('csChart')).getOption().series.length);
  ok(nSer >= 2, 'A stacked chart splits into a series per category (' + nSer + ')', nSer);
  await shot('10-stacked');

  // ---- Hindi and dark theme
  await ev(() => setUiLanguage('hi')); await wait(500);
  ok(await ev(() => document.getElementById('csTitle').textContent) === 'चार्ट स्टूडियो', 'The Studio follows the language switch');
  ok(await ev(() => /[ऀ-ॿ]/.test(document.querySelector('#csCap p').textContent)), 'Captions switch to Hindi');
  await shot('11-hindi');
  await ev(() => { setUiLanguage('en'); toggleTheme(); }); await wait(700);
  await shot('12-dark');
  await ev(() => toggleTheme());
  await ev(() => STL.closeChartStudio()); await wait(200);
  ok(await ev(() => !document.body.classList.contains('cs-open') && !document.getElementById('chartStudio').classList.contains('open')), 'The Studio closes and the table gets its width back');

  // ---- Sankey: flow between two columns; clicking a box or a band shows those rows
  await ev(() => { filteredData = null; activeFilters = []; STL.openChartStudio(); }); await wait(300);
  await ev(() => document.querySelector('#csGallery .cs-t[data-type="sankey"]').click()); await wait(700);
  const sk = await ev(() => { const inst = echarts.getInstanceByDom(document.getElementById('csChart')), o = inst.getOption(); return { type: o.series[0].type, nodes: o.series[0].data.length, links: o.series[0].links.length, g2: getComputedStyle(document.getElementById('csG2').parentElement).display, cap: (document.querySelector('#csCap p') || {}).textContent || '', x: document.getElementById('csX').selectedOptions[0].textContent, g: document.getElementById('csG').selectedOptions[0].textContent }; });
  ok(sk.type === 'sankey' && sk.nodes >= 4 && sk.links >= 4, 'Flow (Sankey) draws boxes and bands from two category columns (' + sk.x + ' → ' + sk.g + ')', sk);
  ok(sk.g2 !== 'none' && /biggest flow/.test(sk.cap), 'The Sankey offers an optional third step and explains its biggest flow', sk);
  const boxPos = await ev(() => { const inst = echarts.getInstanceByDom(document.getElementById('csChart')), g = inst.getModel().getSeriesByIndex(0).getGraph(), l = g.getNodeByIndex(0).getLayout(), r = document.getElementById('csChart').getBoundingClientRect(); const s0 = inst.getOption().series[0]; return { x: r.left + s0.left + l.x + l.dx / 2, y: r.top + s0.top + l.y + l.dy / 2, name: g.getNodeByIndex(0).id }; });
  await page.mouse.click(boxPos.x, boxPos.y); await wait(500);
  const skSel = await ev(() => ({ shown: filteredData ? filteredData.length : -1, bar: document.getElementById('csSelBar').style.display }));
  ok(skSel.shown > 0 && skSel.shown < 320 && skSel.bar !== 'none', 'Clicking a Sankey box shows only those rows in the table (' + skSel.shown + ' of 320)', skSel);
  await ev(() => document.getElementById('csClear').click()); await wait(300);
  ok(await ev(() => !filteredData || filteredData.length === rawData.length), 'Show all rows brings the full table back after a Sankey click');
  await ev(() => STL.closeChartStudio()); await wait(200);

  // ---- sparklines: a trend line in each row, across a block of number columns
  await ev(() => { const mon = ['जन', 'फ़र', 'मार्च', 'अप्रैल', 'मई', 'जून']; const rows = []; for (let i = 0; i < 40; i++) rows.push(['थाना ' + (i + 1)].concat(mon.map((_, m) => String(100 + ((i * 7 + m * 13) % 50) + m * (i % 3 === 0 ? 10 : -4))))); rawData = rows; headers = ['थाना'].concat(mon); colTypes = ['text'].concat(mon.map(() => 'number')); filteredData = null; activeFilters = []; showTable(); });
  await wait(500);
  await ev(() => STL.tableViz.sparkFrom(3)); await wait(400);
  const spark = await ev(() => { const tds = Array.from(document.querySelectorAll('#vtbody tr')).slice(0, 8).map(tr => tr.querySelector('td[data-ci="6"]')).filter(Boolean); const none = document.querySelector('#vtbody td[data-ci="2"]'); return { n: tds.length, svg: tds.filter(td => /data:image\/svg\+xml/.test(td.getAttribute('style') || '')).length, other: /svg/.test((none && none.getAttribute('style')) || ''), target: STL.tableViz.spark && STL.tableViz.spark.target, cols: STL.tableViz.spark && STL.tableViz.spark.cols.length }; });
  ok(spark.n > 0 && spark.svg === spark.n && !spark.other, 'Sparklines appear only in the last column of the block (' + spark.target + ', ' + spark.cols + ' columns)', spark);
  await shot('20-sparklines');
  await ev(() => STL.tableViz.sparkOff()); await wait(300);
  ok(await ev(() => !document.querySelector('#vtbody td[data-ci="6"]').getAttribute('style').includes('svg')), 'Sparklines can be removed');
  await ev(() => STL.tableViz.sparkFrom(0)); await wait(200);
  ok(await ev(() => !STL.tableViz.spark), 'A text column does not get sparklines (needs 3 number columns side by side)');
  // restore the register for the big-table check
  // ---- a big table stays fast
  const big = await ev(() => { const t0 = performance.now(); const rows = []; for (let i = 0; i < 60000; i++) rows.push(['G' + (i % 40), 'S' + (i % 3), 'C' + (i % 5), i % 1000, '01-02-2025', 1, 20]); rawData = rows; headers = ['थाना', 'स्थिति', 'श्रेणी', 'राशि', 'तारीख', 'गवाह', 'आयु']; colTypes = ['text', 'text', 'text', 'number', 'text', 'number', 'number']; filteredData = null; activeFilters = []; showTable(); STL.openChartStudio(); return performance.now() - t0; });
  await wait(1200);
  ok(big < 6000, 'A 60,000-row table opens in the Studio without freezing (' + Math.round(big) + ' ms)', big);

  // ---- a CSV whose quoted cells contain line breaks keeps every record whole (this used to tear 6 restaurants of a 9,551-row file into 12 broken rows)
  const multi = 'ID,Name,Address,Rating\r\n1,Cafe A,"The Quayside\n60 Roberston Quay #01-13",4.5\r\n2,"Cafe, B","Food Court, HUDA City Center Metro\n Station, Sector 29",3.9\r\n3,Cafe C,Plain,0\r\n';
  await page.setInputFiles('#fileInput', { name: 'multiline.csv', mimeType: 'text/csv', buffer: Buffer.from(multi, 'utf8') }); await wait(900);
  const ml = await ev(() => ({ n: rawData.length, w: rawData.map(r => r.length), a: rawData[1][2], h: headers.slice() }));
  ok(ml.n === 3 && ml.w.every(x => x === 4) && ml.a.includes('Food Court, HUDA City Center Metro') && ml.h[0] === 'ID', 'A CSV cell with a line break stays one record (3 rows, 4 fields each)', ml);
  ok(external.length === 0, 'No external network requests were attempted', external);
  ok(errors.length === 0, 'No JavaScript errors', errors);
  await browser.close();
  console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
