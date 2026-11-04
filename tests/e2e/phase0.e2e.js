/*
 * Stellura end-to-end checks (Phase 0). Needs: a running server and Playwright.
 *   python app.py            (or PORT=5055 python app.py)
 *   BASE=http://127.0.0.1:5000 node tests/e2e/phase0.e2e.js
 * Every request that leaves this PC is blocked and counted: the offline promise is a test.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const XLSX = require(path.join(__dirname, '..', '..', 'static', 'js', 'xlsx.full.min.js'));

const BASE = process.env.BASE || 'http://127.0.0.1:5000';
const HTML = path.join(__dirname, '..', '..', 'public', 'Simple-Data-Analyser.html');
let failures = 0;
const ok = (cond, msg, extra) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg + (cond || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!cond) failures++;
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const external = [], consoleErrors = [];
  const isLocal = u => /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:|about:)/.test(u);
  await page.route('**/*', r => { if (isLocal(r.request().url())) r.continue(); else { external.push(r.request().url()); r.abort(); } });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/503|ERR_FAILED/.test(m.text())) consoleErrors.push(m.text()); });

  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { try { _ddSkipTour(); } catch (e) {} });

  // 1. offline libraries
  const libs = await page.evaluate(() => ({ xlsx: typeof XLSX, jspdf: typeof window.jspdf, h2c: typeof html2canvas, alasql: typeof alasql }));
  ok(libs.xlsx === 'object' && libs.jspdf === 'object' && libs.h2c === 'function' && libs.alasql === 'function', 'libraries load from the local server', libs);
  const chartOk = await page.evaluate(() => new Promise(res => { ensureChartLibrary(() => res(typeof Chart)); setTimeout(() => res('timeout'), 5000); }));
  ok(chartOk === 'function', 'Chart.js loads on demand from the local server', chartOk);

  // 2. translations
  const src = fs.readFileSync(HTML, 'utf8');
  const keys = new Set([...src.matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1]));
  for (const m of src.matchAll(/(?:uiLabel|translatedText)\(\s*'([A-Za-z0-9_]+)'\s*\)/g)) keys.add(m[1]);
  const miss = await page.evaluate(k => ({ en: k.filter(x => !UI_TEXT.en[x]), hi: k.filter(x => !UI_TEXT.hi[x]) }), [...keys]);
  ok(!miss.en.length && !miss.hi.length, `all ${keys.size} UI keys translated in English and Hindi`, miss);
  await page.evaluate(() => setUiLanguage('hi'));
  const tabs = await page.$$eval('.dd-view-btn', els => els.map(e => e.textContent.trim()));
  ok(!tabs.some(t => /^view[A-Z]/.test(t)), 'no raw translation keys on the view tabs', tabs);
  await page.evaluate(() => setUiLanguage('en'));

  // 3. X-Ray on the bundled sample: no false links
  await page.evaluate(() => loadSampleHindi());
  await page.waitForTimeout(800);
  const runXray = () => page.evaluate(() => new Promise(res => {
    _ddXraySchedule(true);
    const t = setInterval(() => { if (!_xRunning) { clearInterval(t); res({ rel: DD.model.relationships.map(r => r.from + '>' + r.to), dep: DD.model.dependencies.map(d => d.from + '>' + d.to), keys: DD.model.keys.map(k => k.column) }); } }, 100);
  }));
  let xr = await runXray();
  ok(xr.rel.length === 0, 'sample register: no false foreign-key links (small numbers vs serial column)', xr.rel);
  ok(!xr.dep.some(d => d.startsWith('मूल्यांकन>')), 'sample register: a numeric rating is not reported as determining a station', xr.dep);
  ok(xr.keys.length === 1, 'sample register: exactly one key column (serial number)', xr.keys);

  // 4. X-Ray on synthetic data with a REAL structure
  const synth = await page.evaluate(() => {
    const regions = { Jaipur: 'North', Jodhpur: 'West', Udaipur: 'South', Kota: 'East', Ajmer: 'Central', Sikar: 'North' };
    const depts = Object.keys(regions);
    const rows = [['EmpID', 'Dept', 'Region', 'Score', 'ManagerEmpID']];
    for (let i = 1; i <= 240; i++) {
      const d = depts[i % depts.length];
      rows.push(['E' + String(i).padStart(4, '0'), d, regions[d], String((i * 7919) % 97), i > 12 ? 'E' + String(1 + (i % 12)).padStart(4, '0') : '']);
    }
    importData(rows);
    return true;
  });
  xr = await runXray();
  ok(xr.dep.includes('Dept>Region'), 'synthetic: real dependency Dept -> Region is found', xr.dep);
  ok(!xr.dep.some(d => d.endsWith('>Score')), 'synthetic: random Score is not "determined" by anything', xr.dep);
  ok(xr.rel.includes('ManagerEmpID>EmpID'), 'synthetic: real foreign key ManagerEmpID -> EmpID is found', xr.rel);

  // 5. audit trail: SHA-256 chain verifies and detects tampering
  const audit = await page.evaluate(() => {
    DD.provenance = [];
    _pvLog({ actor: 'user', action: 'TEST', method: 'm', label: 'one' });
    _pvLog({ actor: 'ai', action: 'TEST', method: 'm', label: 'two' });
    _pvLog({ actor: 'module', action: 'TEST', method: 'm', label: 'three' });
    const len = DD.provenance[0].hash.length, before = _pvGetVerifyStatus(DD.provenance);
    DD.provenance[1].label = 'changed after the fact';
    const tampered = _pvGetVerifyStatus(DD.provenance);
    // a log written by the previous version (32-bit hash) must still verify
    const legacy = []; const prevH = '00000000';
    const e = { id: 'x1', ts: 1, actor: 'user', action: 'LOAD', method: '', target: '', inputs: [], output: '', label: 'old', dataVersion: 1, prevHash: prevH };
    e.hash = _pvFNV(JSON.stringify({ id: e.id, ts: e.ts, actor: e.actor, action: e.action, method: '', target: '', inputs: '', output: '', label: e.label, dataVersion: 1, prevHash: prevH }));
    legacy.push(e);
    return { len, before, tampered, legacy: _pvGetVerifyStatus(legacy) };
  });
  ok(audit.len === 64, 'new audit events use SHA-256 (64 hex digits)', audit);
  ok(audit.before === true && audit.tampered === false, 'audit chain verifies when intact and fails after an edit', audit);
  ok(audit.legacy === true, 'audit logs from the previous version still verify', audit);

  // 6. Excel import through the local server
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-'));
  const mk = (file, sheets, bookType) => {
    const wb = XLSX.utils.book_new();
    for (const [n, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), n);
    fs.writeFileSync(file, XLSX.write(wb, { type: 'buffer', bookType }));
    return file;
  };
  const multi = mk(path.join(tmp, 'multi.xlsx'), { जनवरी: [['नाम', 'राशि'], ['राम', 10]], फरवरी: [['नाम', 'राशि'], ['श्याम', 20], ['मोहन', 30]] }, 'xlsx');
  await page.setInputFiles('#fileInput', multi);
  await page.waitForSelector('#sheetModal.visible, #sheetModal.show, #sheetModal[style*="flex"]', { timeout: 8000 }).catch(() => {});
  const sheetNames = await page.$$eval('#sheetList .sheet-name', e => e.map(x => x.textContent.trim()));
  ok(sheetNames.length === 2 && sheetNames[1].includes('फरवरी'), 'multi-sheet .xlsx shows the sheet picker (read by server)', sheetNames);
  await page.click('#sheetList .sheet-item:nth-child(2)');
  await page.evaluate(() => importSelectedSheet());
  await page.waitForTimeout(1200);
  const imp = await page.evaluate(() => ({ h: headers, n: rawData.length, first: rawData[0] }));
  ok(imp.n === 2 && imp.first[0] === 'श्याम', 'second sheet imported correctly', imp);

  const single = mk(path.join(tmp, 'one.xlsx'), { Data: [['a', 'b'], [1, 2], [3, 4], [5, 6]] }, 'xlsx');
  await page.setInputFiles('#fileInput', single);
  await page.waitForTimeout(1500);
  ok((await page.evaluate(() => rawData.length)) === 3, 'single-sheet .xlsx imports directly');

  const xls = mk(path.join(tmp, 'legacy.xls'), { Data: [['a', 'b'], [1, 2], [3, 4]] }, 'biff8');
  await page.setInputFiles('#fileInput', xls);
  await page.waitForTimeout(1500);
  ok((await page.evaluate(() => rawData.length)) === 2, 'legacy .xls imports (browser fallback, offline)');

  // 7. client-side Excel export works with no internet
  const xlsxWrite = await page.evaluate(() => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x'], [1]]), 'S'); return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }).byteLength > 100; });
  ok(xlsxWrite, 'SheetJS can build an .xlsx in the browser offline');
  const pdfWrite = await page.evaluate(() => { const d = new window.jspdf.jsPDF(); d.text('hi', 10, 10); return d.output('arraybuffer').byteLength > 500; });
  ok(pdfWrite, 'jsPDF can build a PDF in the browser offline');

  // 8. overall
  ok(external.length === 0, 'zero requests left this PC during the whole run', external);
  ok(consoleErrors.length === 0, 'no JavaScript errors', consoleErrors);

  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})();
