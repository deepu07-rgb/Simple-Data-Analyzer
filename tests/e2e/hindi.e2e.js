/*
 * A Hindi sales sheet (.xlsx: Hindi headings with units, Hindi districts / items, blanks in four number columns, bill = quantity × rate − discount):
 *   - the question box in Hindi: totals, “by district” (जिले के अनुसार), counts, how many are empty (कितने … खाली), the effect of X on Y (X का Y पर असर)
 *   - the column check shows how many cells are empty, a rate is a measurement (averaged) and not an amount
 *   - How are the columns built? finds bill = quantity × rate − discount, and offers to fill the empty bills from it: equal to the calculation here
 *   STELLURA_HOME=/tmp/stl-home PORT=5062 python app.py ;  BASE=http://127.0.0.1:5062 node tests/e2e/hindi.e2e.js    (needs python with openpyxl: PY=python3)
 */
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const BASE = process.env.BASE || 'http://127.0.0.1:5000', PY = process.env.PY || 'python3';
let failures = 0; const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x).slice(0, 500))); if (!c) failures++; };
let seed = 53; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }, pick = a => a[Math.floor(rnd() * a.length)];
const DIST = ['अजमेर', 'जयपुर', 'पाली', 'नागौर', 'बीकानेर', 'उदयपुर', 'कोटा', 'सीकर'], TYP = ['थोक', 'खुदरा', 'किराना दुकान', 'होटल'], ITEM = { 'चीनी': 45, 'अरहर दाल': 135, 'मसाले': 290, 'चाय पत्ती': 420, 'नमक': 23 };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-hi-')), XLSX = path.join(dir, 'sales.xlsx'), N = 700, R = [];
for (let i = 0; i < N; i++) { const it = pick(Object.keys(ITEM)), q = Math.round((5 + rnd() * 195) * 10) / 10, rate = Math.round(ITEM[it] * (0.9 + rnd() * 0.2) * 100) / 100, disc = rnd() < 0.6 ? 0 : Math.round(rnd() * q * rate * 0.05 * 100) / 100, amt = Math.round((q * rate - disc) * 100) / 100;
  R.push({ bill: 'RJ-' + (100001 + i), date: '2024-' + String(4 + Math.floor(i / 60) % 9).padStart(2, '0') + '-' + String(1 + i % 28).padStart(2, '0'), d: pick(DIST), t: pick(TYP), it, q, rate, disc, amt }); }
R.forEach((r, i) => { if (i % 17 === 0) r.amt = null; if (i % 19 === 0) r.q = null; if (i % 23 === 0) r.rate = null; if (i % 13 === 0) r.disc = null; });
fs.writeFileSync(path.join(dir, 'rows.json'), JSON.stringify(R));
const mk = spawnSync(PY, ['-I', '-c', 'import json,sys,openpyxl\nR=json.load(open(sys.argv[1],encoding="utf-8"))\nwb=openpyxl.Workbook();ws=wb.active;ws.title="बिक्री आंकड़े"\nws.append(["बिल संख्या","बिल दिनांक","जिला","ग्राहक प्रकार","सामान","मात्रा (किलो)","दर (₹ प्रति किलो)","छूट (₹)","बिल राशि (₹)"])\nfor r in R: ws.append([r["bill"],r["date"],r["d"],r["t"],r["it"],r["q"],r["rate"],r["disc"],r["amt"]])\nwb.save(sys.argv[2])', path.join(dir, 'rows.json'), XLSX], { encoding: 'utf8' });
if (mk.status !== 0) { console.log('SKIP: openpyxl needed to build the sheet', mk.stderr); process.exit(0); }
const have = a => a.filter(x => x !== null), sum = a => a.reduce((x, y) => x + y, 0);
const total = sum(have(R.map(r => r.amt))), recov = R.filter(r => r.amt === null && r.q !== null && r.rate !== null && r.disc !== null), recovSum = sum(recov.map(r => Math.round((r.q * r.rate - r.disc) * 100) / 100));
(async () => {
  const browser = await chromium.launch(); const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); const external = [], errors = [];
  await page.route('**/*', r => /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:|about:)/.test(r.request().url()) ? r.continue() : (external.push(r.request().url()), r.abort()));
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/503|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('stellura_tour_done', '1'); localStorage.setItem('sda_first_run', 'done'); localStorage.setItem('stellura_roles_auto', '0'); } catch (x) {} });
  await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(800); const ev = (f, a) => page.evaluate(f, a), wait = ms => page.waitForTimeout(ms);
  await page.setInputFiles('#fileInput', XLSX); await page.waitForFunction(n => typeof rawData !== 'undefined' && rawData.length > 0, N, { timeout: 60000 }); console.log('rows loaded', await ev(() => rawData.length)); await wait(1500);
  // ---- the column check
  await ev(() => STL.openColumnCheck()); await page.waitForSelector('#colRolesDialog'); await wait(300);
  const rows = await ev(() => Array.from(document.querySelectorAll('#colRolesDialog .rc-tbl tr')).slice(1).map(tr => [tr.cells[0].innerText, tr.querySelector('select').value, tr.cells[1].innerText.replace(/\s+/g, ' ')]));
  const rv = n => (rows.find(r => r[0].indexOf(n) === 0) || [])[1], rr = n => (rows.find(r => r[0].indexOf(n) === 0) || [])[2] || '';
  ok(rv('दर') === 'measure', 'the rate per kg is a measurement (averaged), not an amount', rows);
  const blanksRate = R.filter(r => r.rate === null).length; ok(new RegExp(blanksRate + ' (empty|खाली)').test(rr('दर')), 'the column check shows how many rates are empty: ' + blanksRate, rr('दर'));
  await ev(() => document.getElementById('rcX').click());
  // ---- questions in Hindi
  await ev(() => STL.openAsk()); await page.waitForSelector('#akQ'); const ask = async q => { await page.fill('#akQ', q); await page.press('#akQ', 'Enter'); await wait(1300); return ev(() => document.getElementById('akOut').innerText.replace(/\s+/g, ' ').replace(/,/g, '')); };
  let a = await ask('कुल बिल राशि'); ok(a.includes(Math.round(total).toString()) || a.includes(total.toFixed(2)), 'कुल बिल राशि = ' + total.toFixed(2), a.slice(0, 200));
  a = await ask('कितने बिल थोक के हैं'); ok(a.includes(R.filter(r => r.t === 'थोक').length + ' of ' + N), 'कितने बिल थोक के हैं = ' + R.filter(r => r.t === 'थोक').length, a.slice(0, 200));
  a = await ask('कितने बिल में दर खाली है'); ok(a.includes(blanksRate + ' of ' + N), 'कितने बिल में दर खाली है = ' + blanksRate, a.slice(0, 220));
  a = await ask('जिले के अनुसार कुल बिल राशि'); ok(/for each “जिला”/.test(a), 'जिले के अनुसार (by district) groups by the district column', a.slice(0, 200));
  a = await ask('छूट का बिल राशि पर क्या असर है'); ok(/“छूट \(₹\)” really makes a difference to “बिल राशि \(₹\)”/.test(a), 'X का Y पर असर: the discount is the group, the bill amount the measure', a.slice(0, 220));
  await ev(() => document.getElementById('akX').click());
  // ---- the formula and the fill
  await ev(() => STL.openColumnChecks()); await page.waitForFunction(() => /calculated from others|गणना/.test((document.getElementById('ccOut') || {}).innerText || ''), null, { timeout: 30000 }); await wait(500);
  const cc = await ev(() => document.getElementById('ccOut').innerText.replace(/\s+/g, ' ')); ok(/बिल राशि \(₹\) = मात्रा \(किलो\) × दर \(₹ प्रति किलो\) − छूट \(₹\)/.test(cc) || /बिल राशि.*=.*मात्रा.*×.*दर.*−.*छूट/.test(cc), 'How are the columns built? finds bill = quantity × rate − discount', cc.slice(0, 300));
  ok(new RegExp('Fill the ' + recov.length + ' empty cells').test(cc), 'it offers to fill exactly the ' + recov.length + ' empty bills whose inputs are all there', cc.slice(0, 300));
  await page.click('.cc-fill'); await wait(800);
  const after = await ev(() => { const i = headers.findIndex(h => /बिल राशि/.test(h)); return { sum: rawData.reduce((s, r) => s + (parseFloat(r[i]) || 0), 0), empty: rawData.filter(r => String(r[i]).trim() === '').length }; });
  ok(Math.abs(after.sum - (total + recovSum)) < 0.05 && after.empty === R.filter(r => r.amt === null).length - recov.length, 'after filling, the bills total ' + (total + recovSum).toFixed(2) + ' (+' + recovSum.toFixed(2) + ') and ' + after.empty + ' stay empty because an input is missing', after);
  await ev(() => undoAction()); ok(await ev(() => { const i = headers.findIndex(h => /बिल राशि/.test(h)); return rawData.filter(r => String(r[i]).trim() === '').length; }) === R.filter(r => r.amt === null).length, 'undo brings the empty cells back');
  ok(errors.length === 0, 'No JavaScript errors', errors); ok(external.length === 0, 'No request left the computer', external);
  await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); console.log(failures ? failures + ' FAILED' : 'ALL PASSED'); process.exit(failures ? 1 : 0);
})().catch(x => { console.error(x); process.exit(1); });
