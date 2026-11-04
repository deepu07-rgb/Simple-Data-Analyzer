/*
 * Task-first workspace: Home tiles, Simple/Pro, command palette, Clean a messy file (banner, dialog, undo,
 * recipes), Combine files (xlsx + csv + xls with different headers). All external network blocked.
 *   STELLURA_HOME=/tmp/stl-home PORT=5055 python app.py
 *   BASE=http://127.0.0.1:5055 node tests/e2e/tasks.e2e.js
 */
const { chromium } = require('playwright');
const path = require('path');
const XLSX = require(path.join(__dirname, '..', '..', 'static', 'js', 'xlsx.full.min.js'));

const BASE = process.env.BASE || 'http://127.0.0.1:5000';
let failures = 0;
const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x))); if (!c) failures++; };
const book = (aoa, type) => Buffer.from(XLSX.write((() => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Sheet1'); return wb; })(), { type: 'buffer', bookType: type }));
const file = (name, buffer, mime) => ({ name, mimeType: mime || 'application/octet-stream', buffer });

// a typical messy district return: title rows, Hindi digits, "lakh", day-first dates, a total row
const messy = (district, n) => {
  const rows = [['राजस्थान पुलिस — मासिक रिपोर्ट', '', '', '', ''], ['जिला: ' + district, '', '', '', ''], ['', '', '', '', ''],
                ['क्र.सं.', 'थाना', 'दर्ज', 'राशि', 'दिनांक']];
  const dev = x => String(x).replace(/\d/g, d => String.fromCharCode(0x0966 + +d));
  for (let i = 1; i <= n; i++) rows.push([dev(i), 'थाना ' + i, dev(10 + i), (i + 0.5) + ' लाख', String(i).padStart(2, '0') + '/04/2025']);
  rows.push(['कुल', '', dev(100), '99 लाख', '']);
  return rows;
};
const MESSY_EXPECT = [['1', 'थाना 1', '11', '150000', '2025-04-01'], ['2', 'थाना 2', '12', '250000', '2025-04-02'], ['3', 'थाना 3', '13', '350000', '2025-04-03'], ['4', 'थाना 4', '14', '450000', '2025-04-04']];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const external = [], errors = [];
  await page.route('**/*', r => /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:)/.test(r.request().url()) ? r.continue() : (external.push(r.request().url()), r.abort()));
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/503|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { try { _ddSkipTour(); } catch (e) {} });

  // ---- 1. first screen: Office theme, Simple mode, task tiles
  const first = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme, mode: document.documentElement.dataset.stelMode,
    fmt: getComputedStyle(document.getElementById('fmt-toolbar')).display, formula: getComputedStyle(document.getElementById('formula-bar')).display,
    tiles: document.querySelectorAll('.stl-tile').length,
    tabs: [...document.querySelectorAll('.dd-view-btn')].filter(b => b.offsetParent).map(b => b.textContent.trim())
  }));
  ok(first.theme === 'light', 'new users get the light Office theme', first.theme);
  ok(first.mode === 'simple' && first.fmt === 'none' && first.formula === 'none', 'Simple mode hides the formatting bar and formula bar', first);
  ok(first.tiles === 6, 'Home shows six task tiles', first.tiles);
  ok(JSON.stringify(first.tabs) === JSON.stringify(['Data', 'Reports', 'Insights']) || JSON.stringify(first.tabs) === JSON.stringify(['Data', 'Insights', 'Reports']), 'Simple mode shows only Data, Insights and Reports', first.tabs);

  // ---- 2. command palette
  await page.keyboard.press('Control+k');
  await page.waitForSelector('#palette #palInput');
  await page.fill('#palInput', 'combine');
  ok((await page.$eval('#palList .stl-pal-i.sel span', e => e.textContent)).includes('Combine files'), 'palette: "combine" finds Combine files first');
  await page.fill('#palInput', 'चार्ट');
  ok((await page.$eval('#palList .stl-pal-i span', e => e.textContent)).includes('chart'), 'palette: a Hindi word finds the English-titled action too');
  await page.fill('#palInput', 'saaf');
  ok((await page.$$eval('#palList .stl-pal-i span', es => es.map(e => e.textContent))).some(t => t.includes('Clean a messy file')), 'palette: Hinglish "saaf" finds Clean a messy file');
  await page.fill('#palInput', 'zzzz');
  ok((await page.$$('#palList .stl-pal-i')).length === 0, 'palette: no match shows an empty state');
  await page.keyboard.press('Escape');
  ok((await page.$('#palette')) === null, 'Escape closes the palette');
  await page.keyboard.press('Control+k'); await page.fill('#palInput', 'steps'); await page.keyboard.press('Enter');
  await page.waitForSelector('#stepsPanel.open');
  ok(true, 'palette runs an action with Enter (opens Steps)');
  await page.click('#stepsX');

  // ---- 3. messy file: banner -> review -> apply -> undo
  await page.setInputFiles('#fileInput', file('जयपुर.xlsx', book(messy('जयपुर', 4), 'xlsx')));
  await page.waitForSelector('#fixBanner', { state: 'visible', timeout: 15000 });
  ok(true, 'importing a messy file shows the "can be tidied" banner');
  await page.click('#fbReview');
  await page.waitForSelector('#fixDialog .stl-fix');
  const stepIds = await page.$$eval('#fixDialog input[data-id]', es => es.map(e => [e.dataset.id, e.checked]));
  ok(['headerRow', 'totalRows', 'hindiDigits', 'numbers', 'dates'].every(id => stepIds.some(s => s[0] === id && s[1])), 'dialog lists the problems found, safe fixes pre-ticked', stepIds);
  const exTxt = await page.$$eval('#fixDialog .stl-ex', es => es.map(e => e.textContent).join(' | '));
  ok(/लाख/.test(exTxt) && /150000/.test(exTxt), 'dialog shows before → after examples', exTxt.slice(0, 120));
  await page.click('#fxApply');
  await page.waitForFunction(() => rawData.length === 4 && headers[0] === 'क्र.सं.', null, { timeout: 15000 });
  const cleaned = await page.evaluate(() => ({ h: headers, r: rawData }));
  ok(JSON.stringify(cleaned.r) === JSON.stringify(MESSY_EXPECT), 'Apply: title rows, total row, Hindi digits, lakh and dates are all fixed', cleaned.r);
  ok(JSON.stringify(cleaned.h) === JSON.stringify(['क्र.सं.', 'थाना', 'दर्ज', 'राशि', 'दिनांक']), 'header row is the real header', cleaned.h);
  ok((await page.$('#fixBanner:not([style*="none"])')) === null || await page.$eval('#fixBanner', e => getComputedStyle(e).display) === 'none', 'banner does not come back after cleaning');
  await page.evaluate(() => undoAction());
  await page.waitForFunction(() => rawData.length > 5, null, { timeout: 5000 });
  ok(await page.evaluate(() => rawData.length) === 7, 'Undo brings the original messy rows back (4 rows + blank + 2 title/total)', await page.evaluate(() => rawData.length));

  // ---- 4. steps record and recipe: save from the first cleaning, replay on a second file
  await page.evaluate(() => { STL._quiet = false; });
  await page.evaluate(() => STL.openFixer());
  await page.waitForSelector('#fixDialog #fxApply'); await page.click('#fxApply');
  await page.waitForFunction(() => rawData.length === 4, null, { timeout: 15000 });
  await page.evaluate(() => STL.toggleSteps());
  await page.waitForSelector('#stepsBody .stl-step');
  ok((await page.$$('#stepsBody .stl-step')).length >= 2, 'Steps panel records what was done');
  await page.fill('#rcName', 'मासिक जिला फ़ाइल'); await page.click('#rcSave');
  await page.waitForSelector('#stepsBody [data-run]');
  ok(true, 'cleaning steps saved as a recipe');
  await page.click('#stepsX');
  await page.setInputFiles('#fileInput', file('जोधपुर.xlsx', book(messy('जोधपुर', 4), 'xlsx')));
  await page.waitForFunction(() => rawData.length === 7, null, { timeout: 15000 });
  await page.evaluate(() => { document.getElementById('fixBanner') && (document.getElementById('fixBanner').style.display = 'none'); STL.toggleSteps(); });
  await page.waitForSelector('#stepsBody [data-run]'); await page.click('#stepsBody [data-run]');
  await page.waitForFunction(() => rawData.length === 4, null, { timeout: 15000 });
  ok(JSON.stringify(await page.evaluate(() => rawData)) === JSON.stringify(MESSY_EXPECT), 'recipe repeats the same cleaning on another file in one click');
  await page.click('#stepsX');

  // ---- 5. combine three files with different headers and formats
  const f1 = book([['जयपुर जिला — अक्टूबर', '', '', ''], ['', '', '', ''], ['क्र.सं.', 'थाना', 'दर्ज', 'लंबित'], ['1', 'कोतवाली', '10', '2'], ['2', 'सांगानेर', '7', '1'], ['3', 'मानसरोवर', '5', '0'], ['4', 'बगरू', '4', '1'], ['कुल', '', '26', '4']], 'xlsx');
  const f2 = Buffer.from('S.No,Police Station,Registered,Pending,Remarks\n1,सरदारपुरा,8,3,ok\n2,उम्मेद,5,1,\nS.No,Police Station,Registered,Pending,Remarks\n3,प्रताप,3,0,late\n', 'utf8');
  const f3 = book([['थाने का नाम', 'लंबित', 'पंजीकृत', 'क्रमांक'], ['विज्ञान नगर', '1', '4', '1'], ['नयापुरा', '0', '2', '2'], ['दादाबाड़ी', '2', '6', '3']], 'biff8');
  await page.keyboard.press('Control+k'); await page.fill('#palInput', 'combine files'); await page.keyboard.press('Enter');
  await page.waitForSelector('#mergeFileInput', { state: 'attached' });
  await page.setInputFiles('#mergeFileInput', [file('जयपुर.xlsx', f1), file('जोधपुर.csv', f2, 'text/csv'), file('कोटा.xls', f3)]);
  await page.waitForSelector('#mergeDialog .stl-file >> nth=2', { timeout: 20000 });
  const files = await page.$$eval('#mergeDialog .stl-file summary b', es => es.map(e => e.textContent));
  ok(files.length === 3, 'three files of three formats (xlsx, csv, xls) are read', files);
  const badges = await page.$$eval('#mergeDialog .stl-map tr[class^="lvl-"] .stl-b', es => es.map(e => e.textContent.trim()).filter(Boolean));
  ok(badges.filter(b => /matched|मिला/.test(b)).length >= 7, 'columns with different names (थाना / Police Station / थाने का नाम) are matched automatically', badges);
  const goLabel = await page.$eval('#mgGo', e => e.textContent);
  ok(/\(10 rows|\(10 पंक्तियाँ/.test(goLabel), 'result is 10 rows (4 + 3 + 3): titles, total row and repeated header removed', goLabel);
  await page.click('#mgGo');
  await page.waitForFunction(() => rawData.length === 10, null, { timeout: 15000 });
  const merged = await page.evaluate(() => ({ h: headers, r: rawData }));
  ok(merged.h.length === 6 && merged.h[merged.h.length - 1].length > 0, 'combined table has the unified columns plus a source-file column', merged.h);
  const ci = n => merged.h.indexOf(n);
  const kotaReg = merged.r.filter(r => r[merged.h.length - 1] === 'कोटा.xls').map(r => r[ci('दर्ज')]);
  ok(JSON.stringify(kotaReg) === JSON.stringify(['4', '2', '6']), 'Kota\'s "पंजीकृत" values landed in the "दर्ज" column', kotaReg);
  ok(merged.r.filter(r => r[ci('Remarks')] === 'late').length === 1, 'a column that exists in only one file is kept, blank elsewhere');
  ok(await page.evaluate(() => STL.steps.some(s => s.type === 'merge')), 'combining is recorded in Steps');

  // ---- 6. Simple / Pro and Insights menu
  await page.click('#stlInsBtn'); await page.click('#stlInsMenu button[data-v="audit"]');
  await page.waitForSelector('#dd-audit-view', { state: 'visible' });
  ok(true, 'Insights menu opens History (audit trail)');
  await page.evaluate(() => switchDDView('sheet'));
  await page.click('#stlModeBtn');
  const pro = await page.evaluate(() => ({ mode: document.documentElement.dataset.stelMode, fmt: getComputedStyle(document.getElementById('fmt-toolbar')).display,
    tabs: [...document.querySelectorAll('.dd-view-btn')].filter(b => b.offsetParent).map(b => b.textContent.trim()) }));
  ok(pro.mode === 'pro' && pro.fmt !== 'none' && pro.tabs.includes('Structure') && pro.tabs.includes('Recipes') && !pro.tabs.includes('Insights'), 'Pro mode shows the formatting bar and every view', pro);
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(800);
  ok(await page.evaluate(() => document.documentElement.dataset.stelMode) === 'pro', 'the chosen mode is remembered');
  await page.evaluate(() => { try { _ddSkipTour(); } catch (e) {} STL.setMode('simple'); setUiLanguage('hi'); });
  await page.waitForTimeout(300);
  const hi = await page.evaluate(() => ({ tile: document.querySelector('.stl-tile b').textContent, tabs: [...document.querySelectorAll('.dd-view-btn')].filter(b => b.offsetParent).map(b => b.textContent.trim()) }));
  ok(/[ऀ-ॿ]/.test(hi.tile) && hi.tabs.some(t => /डेटा/.test(t)) && hi.tabs.some(t => /अंतर्दृष्टि/.test(t)), 'Hindi mode translates the tiles and tabs', hi);

  ok(external.length === 0, 'zero requests left this PC', external);
  ok(errors.length === 0, 'no JavaScript errors', errors);
  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})();
