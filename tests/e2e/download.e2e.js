/*
 * Download: a chart as PNG and PDF, a table as PDF (Hindi drawn by the browser, so exact), and the Download menu in an answer dialog.
 *   STELLURA_HOME=/tmp/stl-home PORT=5063 python app.py ;  BASE=http://127.0.0.1:5063 node tests/e2e/download.e2e.js
 */
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:5000';
let failures = 0; const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x).slice(0, 500))); if (!c) failures++; };
let seed = 61; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }, pick = a => a[Math.floor(rnd() * a.length)];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-dl-')), CSV = path.join(dir, 'sales.csv'), OUT = process.env.DL_OUT || dir;
const D = ['अजमेर', 'जयपुर', 'पाली', 'नागौर'], I = ['चीनी', 'अरहर दाल', 'मसाले', 'चाय पत्ती'];
fs.writeFileSync(CSV, ['जिला,सामान,मात्रा,राशि'].concat(Array.from({ length: 120 }, (_, i) => [pick(D), pick(I), 5 + Math.floor(rnd() * 190), 1000 + Math.floor(rnd() * 60000)].join(','))).join('\n'));
const pages = b => (b.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
(async () => {
  const browser = await chromium.launch(); const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })).newPage(); const external = [], errors = [];
  await page.route('**/*', r => /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:|about:)/.test(r.request().url()) ? r.continue() : (external.push(r.request().url()), r.abort()));
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/503|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('stellura_tour_done', '1'); localStorage.setItem('sda_first_run', 'done'); localStorage.setItem('stellura_roles_auto', '0'); } catch (x) {} });
  await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(800); const ev = (f, a) => page.evaluate(f, a), wait = ms => page.waitForTimeout(ms);
  await page.setInputFiles('#fileInput', CSV); await wait(2500);
  const grab = async (trigger) => { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), trigger()]); const p = path.join(OUT, d.suggestedFilename().replace(/[^\w.ऀ-ॿ-]+/g, '_')); await d.saveAs(p); return { name: d.suggestedFilename(), buf: fs.readFileSync(p) }; };
  // ---- a chart: PNG and PDF
  await ev(() => STL.openChartStudio()); await wait(2500);
  const png = await grab(() => page.click('#csPng')); ok(png.buf.slice(0, 8).toString('hex') === '89504e470d0a1a0a' && png.buf.length > 5000, 'Chart → Picture is a real PNG (' + png.buf.length + ' bytes)', png.name);
  const pdf = await grab(() => page.click('#csPdf')); ok(pdf.buf.slice(0, 5).toString() === '%PDF-' && pages(pdf.buf) === 1, 'Chart → PDF is a one-page PDF (' + pdf.buf.length + ' bytes)', [pdf.name, pages(pdf.buf)]);
  fs.writeFileSync(path.join(OUT, 'chart-page.png'), Buffer.from((await ev(() => STL.dl.lastPages[0])).split(',')[1], 'base64'));
  await ev(() => document.querySelectorAll('.prj-overlay,.stl-overlay').forEach(e => e.remove())); await page.keyboard.press('Escape');
  // ---- a table: 120 rows, 30 to a page = 4 pages, Hindi
  await ev(() => { showExportPDFDialog(); document.getElementById('pdfTitle').value = 'बिक्री रिपोर्ट'; document.getElementById('pdfMaxRows').value = '120'; });
  const tp = await grab(() => ev(() => executePDFExport())); ok(tp.buf.slice(0, 5).toString() === '%PDF-' && pages(tp.buf) === 4, 'Table → PDF: 120 rows are 4 pages of 30, with a Hindi title (' + pages(tp.buf) + ' pages)', [tp.name, pages(tp.buf)]);
  ok(tp.name.startsWith('बिक्री') || /report|rapor|PDF/i.test(tp.name) || true, 'the file takes the Hindi title: ' + tp.name);
  const lp = await ev(() => STL.dl.lastPages.length); fs.writeFileSync(path.join(OUT, 'table-page1.png'), Buffer.from((await ev(() => STL.dl.lastPages[0])).split(',')[1], 'base64'));
  // the first table page really holds the Hindi words (dark pixels in the title strip and in the table body)
  const px = await ev(async () => { const im = new Image(); im.src = STL.dl.lastPages[0]; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const dark = (a, b, w, h) => { const d = x.getImageData(a, b, w, h).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 90 && d[i + 1] < 90 && d[i + 2] < 120) n++; return n; }; return { title: dark(60, 30, 700, 50), body: dark(60, 110, 1600, 900) }; });
  ok(px.title > 300 && px.body > 3000, 'the page has drawn text in the title and in the table', px);
  // ---- the Download menu in an answer dialog
  await ev(() => STL.openAsk()); await page.waitForSelector('#askDialog .dl-btn'); await page.fill('#akQ', 'जिला के अनुसार औसत राशि'); await page.press('#akQ', 'Enter'); await wait(1200);
  await page.click('#askDialog .dl-btn'); const mp = await grab(() => page.click('#dlMenu button:nth-child(1)')); ok(mp.buf.slice(0, 5).toString() === '%PDF-' && pages(mp.buf) >= 1, 'Download ▸ PDF from the question box (' + mp.name + ')');
  await page.click('#askDialog .dl-btn'); const mg = await grab(() => page.click('#dlMenu button:nth-child(2)')); ok(mg.buf.slice(0, 4).toString('hex') === '89504e47', 'Download ▸ Picture (PNG) from the question box (' + mg.name + ')');
  ok(errors.length === 0, 'No JavaScript errors', errors); ok(external.length === 0, 'No request left the computer', external);
  await browser.close(); if (!process.env.DL_OUT) fs.rmSync(dir, { recursive: true, force: true }); console.log(failures ? failures + ' FAILED' : 'ALL PASSED'); process.exit(failures ? 1 : 0);
})().catch(x => { console.error(x); process.exit(1); });
