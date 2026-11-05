/*
 * Dashboard from pinned charts: layout, edits, PowerPoint, PDF, print, and the board travelling with a project.
 *   STELLURA_HOME=/tmp/stl-home PORT=5055 python app.py
 *   BASE=http://127.0.0.1:5055 node tests/e2e/dashboard.e2e.js        (SHOTS=/some/dir to keep screenshots)
 */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os'), { execFileSync } = require('child_process');

const BASE = process.env.BASE || 'http://127.0.0.1:5000';
let failures = 0;
const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x))); if (!c) failures++; };
const PY = process.env.PYTHON || 'python3';
function py(script, ...args) { return execFileSync(PY, ['-I', '-c', script, ...args], { encoding: 'utf8' }).trim(); }

function rng(seed) { let x = seed; return () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296; }
const STATIONS = ['कोतवाली', 'सांगानेर', 'मानसरोवर', 'बगरू', 'चौमू', 'शाहपुरा'], STATUS = ['लंबित', 'निस्तारित', 'जाँच में'], CAT = ['चोरी', 'मारपीट', 'धोखाधड़ी', 'दुर्घटना'];
function makeCsv() {
  const r = rng(9), rows = [['थाना', 'स्थिति', 'श्रेणी', 'राशि', 'तारीख', 'आयु']];
  for (let i = 0; i < 300; i++) { const st = Math.floor(r() * 6), m = 1 + Math.floor(r() * 8), d = 1 + Math.floor(r() * 27), amt = Math.round(2000 + r() * 90000 * (1 + st * 0.15)); rows.push([STATIONS[st], STATUS[Math.floor(r() * 3)], CAT[Math.floor(r() * 4)], amt, `${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}-2025`, 18 + Math.floor(r() * 50)]); }
  return Buffer.from(rows.map(x => x.join(',')).join('\n') + '\n', 'utf8');
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-dash-'));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const external = [], errors = [];
  await page.route('**/*', r => /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:|about:)/.test(r.request().url()) ? r.continue() : (external.push(r.request().url()), r.abort()));
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/503|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('stellura_tour_done', '1'); localStorage.setItem('sda_first_run', 'done'); localStorage.removeItem('stellura_board'); localStorage.removeItem('stellura_dash'); } catch (e) {} });
  await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(1200);
  await page.evaluate(() => { try { _ddSkipTour(); } catch (e) {} });
  const ev = (fn, arg) => page.evaluate(fn, arg), wait = ms => page.waitForTimeout(ms);
  const shot = async n => { if (process.env.SHOTS) { await wait(700); await page.screenshot({ path: path.join(process.env.SHOTS, n + '.png') }); } };

  // ---- no data: a friendly message
  await ev(() => STL.openDashboard()); await wait(200);
  ok(await ev(() => !document.getElementById('dashDialog')), 'Without data the dashboard asks for a file first');
  await page.setInputFiles('#fileInput', { name: 'register.csv', mimeType: 'text/csv', buffer: makeCsv() });
  await page.waitForFunction(() => typeof rawData !== 'undefined' && rawData.length === 300, null, { timeout: 15000 }); await wait(600);

  // ---- empty board offers a start
  await ev(() => STL.openDashboard()); await page.waitForSelector('#dashDialog .dash-empty');
  ok(await ev(() => !!document.getElementById('dbAdd2') && document.getElementById('dbTitle').value.length > 0), 'An empty dashboard offers the best charts and starts with the file name as its title');
  await ev(() => document.getElementById('dbAdd2').click());
  await page.waitForFunction(() => document.querySelectorAll('#dashGrid .dash-card').length === 4 && document.querySelectorAll('#dashGrid .dash-chart canvas').length === 4, null, { timeout: 15000 });
  ok(true, 'Add the best charts: four suggested charts are placed and drawn');
  ok(await ev(() => Array.from(document.querySelectorAll('.dash-cap')).every(c => c.textContent.length > 15)), 'Every chart has its plain-language reading under it');
  const kp = await ev(() => Array.from(document.querySelectorAll('.dash-kpi')).map(k => k.textContent));
  ok(kp.length === 3 && /300/.test(kp[0]) && /राशि/.test(kp.join(' ')), 'Headline numbers show the rows and the totals of the number columns', kp);
  await shot('40-dashboard');

  // ---- edit: title, columns, width, order, note, remove
  await ev(() => { const t = document.getElementById('dbTitle'); t.value = 'जिला पुलिस — जुलाई रिपोर्ट'; t.dispatchEvent(new Event('input')); const s = document.getElementById('dbSub'); s.value = 'पुलिस आयुक्तालय, जयपुर'; s.dispatchEvent(new Event('input')); });
  ok(await ev(() => JSON.parse(localStorage.getItem('stellura_dash')).title === 'जिला पुलिस — जुलाई रिपोर्ट'), 'The title and subtitle are remembered');
  const firstTitle = await ev(() => document.querySelector('.dash-ct').value);
  await ev(() => { const s = document.getElementById('dbCols'); s.value = '3'; s.dispatchEvent(new Event('change')); }); await wait(900);
  ok(await ev(() => document.getElementById('dashGrid').dataset.cols === '3' && getComputedStyle(document.getElementById('dashGrid')).gridTemplateColumns.split(' ').length === 3), 'Three columns lay the charts out three across');
  await ev(() => document.querySelector('[data-wd="0"]').click()); await wait(900);
  ok(await ev(() => document.querySelector('.dash-card').classList.contains('w2') && document.querySelector('.dash-card').getBoundingClientRect().width > document.querySelectorAll('.dash-card')[2].getBoundingClientRect().width * 1.6), 'A chart can be made twice as wide');
  await ev(() => document.querySelector('[data-mv="1"][data-i="0"]').click()); await wait(900);
  ok(await ev(t => document.querySelectorAll('.dash-ct')[1].value === t, firstTitle), 'A chart can be moved later');
  await ev(() => { const n = document.querySelector('[data-n="0"]'); n.value = 'सांगानेर पर विशेष ध्यान'; n.dispatchEvent(new Event('input')); });
  ok(await ev(() => STL.board.pins[0].note === 'सांगानेर पर विशेष ध्यान'), 'A note written under a chart is kept');
  await ev(() => { document.querySelector('[data-rm="3"]').click(); }); await wait(900);
  ok(await ev(() => document.querySelectorAll('.dash-card').length === 3 && STL.board.pins.length === 3), 'A chart can be removed');
  await ev(() => { const s = document.getElementById('dbCols'); s.value = '2'; s.dispatchEvent(new Event('change')); }); await wait(900);
  await shot('41-dashboard-edited');

  // ---- PowerPoint
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 40000 }), ev(() => document.getElementById('dbPpt').click())]);
  const pptx = path.join(tmp, 'd.pptx'); await dl.saveAs(pptx);
  ok((await dl.failure()) === null && fs.statSync(pptx).size > 20000, 'PowerPoint downloads (' + fs.statSync(pptx).size + ' bytes)');
  const names = await ev(() => [STL.dashFileName('जिला पुलिस — जुलाई रिपोर्ट', 'pptx'), STL.dashFileName('Q1: Cases <open>/closed?', 'pdf'), STL.dashFileName('  ', 'pdf'), STL.dashFileName('x'.repeat(200), 'pdf').length]);
  ok(names[0] === 'जिला पुलिस — जुलाई रिपोर्ट.pptx' && names[1] === 'Q1 Cases open closed.pdf' && names[2] === 'dashboard.pdf' && names[3] === 84, 'File names keep Hindi and drop only characters Windows forbids', names);
  const info = JSON.parse(py(`import sys,json
from pptx import Presentation
p=Presentation(sys.argv[1]); out={'n':len(p.slides),'cover':' '.join(s.text_frame.text for s in p.slides[0].shapes if s.has_text_frame),'pics':[sum(1 for s in sl.shapes if s.shape_type==13) for sl in p.slides],'txt':[' '.join(s.text_frame.text for s in sl.shapes if s.has_text_frame) for sl in p.slides][1:],'notes':[sl.notes_slide.notes_text_frame.text for sl in p.slides][1:]}
print(json.dumps(out,ensure_ascii=False))`, pptx));
  ok(info.n === 4 && info.cover.includes('जिला पुलिस — जुलाई रिपोर्ट') && info.cover.includes('पुलिस आयुक्तालय, जयपुर') && /300/.test(info.cover), 'The presentation has a cover (title, subtitle, headline numbers) and one slide per chart', { n: info.n, cover: info.cover.slice(0, 120) });
  ok(info.pics.slice(1).every(n => n === 1) && info.txt.every(t => t.length > 40), 'Every chart slide has its picture and its reading');
  ok(info.txt.some(t => t.includes('सांगानेर पर विशेष ध्यान')) && info.notes.every(n => n.length > 10), 'The note is on its slide and the speaker notes carry the reading');

  // ---- PDF
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 40000 }), ev(() => document.getElementById('dbPdf').click())]);
  const pdf = path.join(tmp, 'd.pdf'); await dl2.saveAs(pdf);
  const pinfo = JSON.parse(py(`import sys,json
from pypdf import PdfReader
r=PdfReader(sys.argv[1]); print(json.dumps({'pages':len(r.pages),'w':float(r.pages[0].mediabox.width),'h':float(r.pages[0].mediabox.height)}))`, pdf));
  ok(pinfo.pages >= 1 && Math.abs(pinfo.w - 842) < 3 && Math.abs(pinfo.h - 595) < 3, 'PDF downloads as A4 landscape (' + pinfo.pages + ' page(s))', pinfo);
  if (process.env.SHOTS) { try { execFileSync('pdftoppm', ['-r', '70', '-png', '-f', '1', '-l', '1', pdf, path.join(process.env.SHOTS, '42-dashboard-pdf')]); } catch (e) {} }
  // with 5+ charts the PDF needs more pages
  await ev(() => document.getElementById('dbAdd') && document.getElementById('dbAdd').click()); await wait(1500);
  await ev(() => { const s = document.getElementById('dbCols'); s.value = '1'; s.dispatchEvent(new Event('change')); }); await wait(1200);
  const [dl3] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), ev(() => document.getElementById('dbPdf').click())]);
  const pdf3 = path.join(tmp, 'd3.pdf'); await dl3.saveAs(pdf3);
  const p3 = JSON.parse(py(`import sys,json
from pypdf import PdfReader
print(json.dumps({'pages':len(PdfReader(sys.argv[1]).pages)}))`, pdf3));
  const n3 = await ev(() => STL.board.pins.length);
  ok(p3.pages === n3, 'In one column the PDF has one page per chart (' + n3 + ' charts, ' + p3.pages + ' pages)', p3);
  await ev(() => { const s = document.getElementById('dbCols'); s.value = '2'; s.dispatchEvent(new Event('change')); }); await wait(900);

  // ---- print
  await ev(() => { window.__printState = null; window.print = () => { window.__printState = document.body.classList.contains('dash-printing'); }; document.getElementById('dbPrint').click(); }); await wait(700);
  ok(await ev(() => window.__printState === true && !document.body.classList.contains('dash-printing')), 'Print hides everything but the dashboard while printing, then restores the screen');

  // ---- the layout engine
  const lay = await ev(() => { const items = [{ w: 2 }, { w: 1 }, { w: 1 }, { w: 1 }, { w: 1 }, { w: 2 }, { w: 1 }]; const L = STL.dashLayout(items, 2, true); return { pages: L.pages.map(p => p.cards.map(c => [c.i, c.x, c.y, c.w, c.h])), W: L.W, H: L.H }; });
  const flat = lay.pages.flat();
  ok(flat.length === 7 && lay.pages.length >= 2, 'Seven charts flow onto several pages', lay.pages.map(p => p.length));
  ok(flat.every(c => c[1] >= 70 && c[1] + c[3] <= lay.W - 70 && c[2] + c[4] <= lay.H - 52), 'No chart runs off the page');
  const overlaps = (a, b) => a[1] < b[1] + b[3] && b[1] < a[1] + a[3] && a[2] < b[2] + b[4] && b[2] < a[2] + a[4];
  ok(lay.pages.every(p => p.every((a, i) => p.every((b, j) => i === j || !overlaps(a, b)))), 'Charts on a page never overlap');

  // ---- project files carry the board
  const saved = await ev(() => PRJ.collectState());
  ok(saved.stlBoard && saved.stlBoard.pins.length === n3 && saved.stlBoard.dash.title === 'जिला पुलिस — जुलाई रिपोर्ट', 'A saved project includes the pinned charts and the dashboard settings');
  await ev(() => { STL.board.pins = []; STL.board.dash = null; localStorage.removeItem('stellura_board'); localStorage.removeItem('stellura_dash'); });
  await ev(s => PRJ.applyState(s), saved);
  ok(await ev(n => STL.board.pins.length === n && STL.board.dash.title === 'जिला पुलिस — जुलाई रिपोर्ट' && JSON.parse(localStorage.getItem('stellura_board')).length === n, n3), 'Opening the project brings the dashboard back');

  // ---- Hindi
  await ev(() => setUiLanguage('hi')); await wait(300);
  await ev(() => STL.openDashboard()); await wait(1500);
  ok(await ev(() => /डैशबोर्ड/.test(document.querySelector('#dashDialog .prj-h').textContent) && /पंक्तियाँ/.test(document.querySelector('.dash-kpi').textContent)), 'The dashboard speaks Hindi when the language is Hindi');
  await shot('43-dashboard-hindi');
  await ev(() => { document.getElementById('dbX').click(); setUiLanguage('en'); });

  ok(external.length === 0, 'No external network requests were attempted', external);
  ok(errors.length === 0, 'No JavaScript errors', errors);
  await browser.close();
  console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
