/*
 * A messy district workbook, end to end in a real browser (all external network blocked):
 *   Combine two sheets of one .xlsx (block-wise sheet with title/subtotal/signature lines + a two-row-header sheet with month totals)
 *   -> Clean (dates, Hindi digits, ₹ amounts, NIL) -> same thing, different spelling (Block, Status) -> the same case entered twice
 *   -> Pendency Radar. Every number is compared with the true answers printed by make_messy_workbook.py.
 *   STELLURA_HOME=/tmp/stl-home PORT=5055 python app.py
 *   BASE=http://127.0.0.1:5055 PY=python node tests/e2e/workbook.e2e.js
 */
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const BASE = process.env.BASE || 'http://127.0.0.1:5000', PY = process.env.PY || process.env.PYTHON || 'python3';
let failures = 0;
const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x).slice(0, 400))); if (!c) failures++; };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-wb-')), XL = path.join(dir, 'register.xlsx');
const T = JSON.parse(execFileSync(PY, ['-I', '-X', 'utf8', path.join(__dirname, 'make_messy_workbook.py'), XL], { encoding: 'utf8' }));

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const external = [], errors = [];
  await page.route('**/*', r => /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:|about:)/.test(r.request().url()) ? r.continue() : (external.push(r.request().url()), r.abort()));
  page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/503|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('stellura_tour_done', '1'); localStorage.setItem('sda_first_run', 'done'); } catch (e) {} });
  await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(1000);
  const ev = (fn, a) => page.evaluate(fn, a), wait = ms => page.waitForTimeout(ms);

  // ---- the workbook has several sheets: the picker offers them
  await page.setInputFiles('#fileInput', XL);
  await page.waitForFunction(() => { const m = document.getElementById('sheetModal'); return m && getComputedStyle(m).display !== 'none' && m.innerText.includes('FY A'); }, null, { timeout: 60000 });
  const picker = await ev(() => document.getElementById('sheetList').innerText); ok(/Cover/.test(picker) && /FY A/.test(picker) && /FY B/.test(picker), 'The sheet picker lists all three sheets', picker);
  await ev(() => closeModal('sheetModal'));

  // ---- combine the two data sheets of the one workbook
  await ev(() => STL.openMerge()); await wait(300); await page.setInputFiles('#mergeFileInput', [XL, XL]);
  await page.waitForFunction(() => document.querySelectorAll('select[data-sheet]').length >= 2, null, { timeout: 60000 });
  for (const [i, nm] of [[0, 'FY A'], [1, 'FY B']]) { await page.selectOption(`select[data-sheet="${i}"]`, nm); await page.waitForFunction(k => { const s = document.querySelectorAll('.stl-file > summary')[k]; return s && /\d+ rows/.test(s.innerText) && !/^\S+\s+[0-9]{1,2} rows · cleaned: 3 rows removed/.test(s.innerText.replace(/\s+/g, ' ')); }, i, { timeout: 60000 }); await wait(300); }
  const plan = await ev(() => ({ files: Array.from(document.querySelectorAll('.stl-file > summary')).map(s => s.innerText.replace(/\s+/g, ' ')), fresh: Array.from(document.querySelectorAll('tr.lvl-new td:first-child')).map(x => x.innerText), review: Array.from(document.querySelectorAll('tr.lvl-review td:first-child')).map(x => x.innerText), prev: (document.querySelector('.stl-opts + .prj-sub') || {}).innerText }));
  const rowsOf = s => +(/([\d,]+) rows/.exec(s)[1].replace(/,/g, ''));
  ok(rowsOf(plan.files[0]) === T.rowsA && rowsOf(plan.files[1]) === T.rowsB, 'Titles, repeated headers, subtotals, month totals and signature lines are removed: ' + rowsOf(plan.files[0]) + ' + ' + rowsOf(plan.files[1]) + ' rows (' + T.rowsA + ' + ' + T.rowsB + ' expected)', plan.files);
  ok(plan.review.length === 0 && plan.fresh.length === 1 && /Mobile/.test(plan.fresh[0]), 'Columns named differently ("Date of Reg", "Dept", "Amt Claimed", "Current Status", group headers) are matched by the app; only "Mobile" is new', plan);
  await page.click('#mgGo'); await page.waitForFunction(n => typeof rawData !== 'undefined' && rawData.length === n, T.rowsA + T.rowsB, { timeout: 60000 }); await wait(500);
  const hd = await ev(() => headers.slice()); ok(hd.includes('Block') && hd.includes('Date of Registration') && hd.includes('Status'), 'The Block that only existed in the "Block: X" titles of the first sheet is now a column', hd);
  const blocks0 = await ev(n => { const i = headers.indexOf('Block'); return Array.from(new Set(rawData.slice(0, n).map(r => r[i]))); }, T.rowsA);
  ok(blocks0.length === 4 && blocks0.includes('Beawar') && !blocks0.some(b => /Tehsil/.test(b)), 'Block values from the titles are clean ("Beawar (Tehsil Beawar)" → "Beawar")', blocks0);

  // ---- clean: dates, Hindi digits, ₹ amounts
  await ev(() => STL.openFixer()); await page.waitForSelector('#fxApply', { timeout: 60000 }); await page.click('#fxApply'); await page.waitForFunction(() => !document.getElementById('fixDialog'), null, { timeout: 60000 }); await wait(700);
  const cl = await ev(() => { const d = headers.indexOf('Date of Registration'), a = headers.findIndex(h => /amount|amt/i.test(h)), x = headers.indexOf('Date of Disposal'); return { badDate: rawData.filter(r => r[d] && !/^\d{4}-\d{2}-\d{2}$/.test(r[d])).length, badAmt: rawData.filter(r => r[a] && !/^\d+(\.\d+)?$/.test(r[a])).length, badDisp: rawData.filter(r => r[x] && !/^\d{4}-\d{2}-\d{2}$/.test(r[x])).length }; });
  ok(cl.badDate === 0 && cl.badDisp === 0 && cl.badAmt === 0, 'Every date is YYYY-MM-DD (also Hindi digits, 12-Mar-25, 12.03.2025) and every amount is a plain number (₹ 1,500, 1500/-, Rs.1,500.00; NIL and "-" are empty)', cl);

  // ---- same thing, different spelling
  async function spell(nm, merges) {
    await ev(n => STL.openValueGroups(headers.indexOf(n)), nm); await page.waitForSelector('#vgApply', { timeout: 30000 }); await wait(200);
    const sel = await ev(() => document.getElementById('vgCol').selectedOptions[0].text); if (!sel.startsWith(nm)) { const opts = await ev(() => Array.from(document.querySelectorAll('#vgCol option')).map(o => o.text)); await page.selectOption('#vgCol', String(opts.findIndex(o => o.startsWith(nm)))); await wait(200); }
    const groups = await ev(() => Array.from(document.querySelectorAll('.vg-tbl tr')).slice(1).map(t => t.innerText.replace(/\s+/g, ' ')));
    await page.click('#vgAll'); await wait(200);
    for (const set of merges || []) { await ev(() => { const d = document.querySelector('#valueGroupsDialog details'); if (d) d.open = true; });
      const n = await ev(vals => { let k = 0; document.querySelectorAll('.vg-oth label').forEach(l => { const t = l.innerText.replace(/\s+\d[\d,]*$/, '').replace(/\s+\+\d+ (spellings|वर्तनियाँ)$/, '').trim(); if (vals.includes(t)) { l.querySelector('input').checked = true; k++; } }); return k; }, set);
      if (n >= 2) { await page.click('#vgMerge'); await wait(200); } }
    await page.click('#vgApply'); await page.waitForFunction(() => !document.getElementById('valueGroupsDialog'), null, { timeout: 30000 }); await wait(500); return groups;
  }
  const bg = await spell('Block'); ok(bg.length === 4 && bg.every(g => /spelling|same|part/.test(g)), 'Block: four groups of spellings found (Kishangrah / KISHANGARH / Kishan Garh …)', bg);
  const sg = await spell('Status', [['Disposed', 'Closed']]);
  const dist = await ev(() => { const o = {}; ['Block', 'Status'].forEach(n => { const i = headers.indexOf(n); o[n] = Array.from(new Set(rawData.map(r => r[i]))).sort(); }); return o; });
  ok(dist.Block.length === 4 && dist.Status.join() === 'Disposed,Pending,Rejected', 'One spelling each: 4 blocks; 3 statuses ("Closed" merged into "Disposed" by hand, "Disposed Off" / "disposed" by the app)', dist);

  // ---- the same case entered twice
  await ev(() => STL.openDuplicates()); await page.waitForSelector('#dpRemove', { timeout: 30000 });
  const sug = await ev(() => Array.from(document.querySelectorAll('#dupDialog [data-p]')).map(b => b.innerText)); ok(sug.length === 2 && /registration number/i.test(sug[0]), 'The duplicate finder suggests the registration number + applicant, and person + place + department', sug);
  const msg = await ev(() => document.querySelector('#dupDialog .fr-verdict').innerText); ok(new RegExp('\\b' + T.dups + ' extra rows').test(msg), 'It finds exactly the ' + T.dups + ' rows that were entered twice (capitals, "Shri", spaces ignored)', msg);
  await page.click('#dpRemove'); await page.waitForFunction(() => !document.getElementById('dupDialog'), null, { timeout: 30000 }); await wait(500);
  ok(await ev(() => rawData.length) === T.cases, 'After removing them: ' + T.cases + ' cases', await ev(() => rawData.length));

  // ---- Pendency Radar
  const pend = await ev(() => { const g = STL.pend.guess(headers, rawData), sv = STL.pend.statusValues(rawData, g.status), bi = headers.indexOf('Block'); const r = STL.pend.compute(rawData, { dateCol: g.date, statusCol: g.status, groupCol: bi, pendingValues: sv.filter(x => x.pending).map(x => x.value), asOn: '2026-01-31' }); return { cols: [headers[g.date], headers[g.status]], total: r.total.total, by: Object.fromEntries(r.groups.map(x => [x.name, x.total])) }; });
  ok(/Date of Registration/.test(pend.cols[0]) && /Status/.test(pend.cols[1]), 'The Pendency Radar picks the date and status columns by itself', pend.cols);
  ok(pend.total === T.pending_total && Object.entries(T.pending).every(([b, n]) => pend.by[b] === n), 'Pending cases by block equal the true answer exactly: ' + JSON.stringify(pend.by), { app: pend.by, truth: T.pending });
  ok(errors.length === 0, 'No JavaScript errors', errors); ok(external.length === 0, 'No request left the computer', external);
  await browser.close(); fs.rmSync(dir, { recursive: true, force: true });
  console.log(failures ? failures + ' FAILED' : 'ALL PASSED'); process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
