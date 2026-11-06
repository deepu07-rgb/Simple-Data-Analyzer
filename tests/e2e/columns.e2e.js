/*
 * "Check your columns": a small Hindi register in the editor and a 10+ MB text file as a Large File.
 *   - under test automation the screen is not forced on a person; with the switch on it opens by itself, doubtful columns first
 *   - row number / code / amount / date / text guesses are shown; a placeholder (365243) is offered as empty and is emptied on "Looks right"
 *   - choices are remembered: the same columns open again without asking, and what was chosen is applied (an amount chosen as a measurement is averaged)
 *   STELLURA_HOME=/tmp/stl-home PORT=5059 python app.py ;  BASE=http://127.0.0.1:5059 node tests/e2e/columns.e2e.js
 */
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:5000';
let failures = 0; const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x).slice(0, 500))); if (!c) failures++; };
let seed = 29; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }, pick = a => a[Math.floor(rnd() * a.length)];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-cols-')), REG = path.join(dir, 'register.csv'), TXT = path.join(dir, 'text.csv');
const THANA = ['कोतवाली', 'सदर', 'सिविल लाइन्स', 'महिला थाना', 'यातायात'], STH = ['लंबित', 'निस्तारित'];
const reg = []; for (let i = 0; i < 1500; i++) reg.push([i, pick(THANA), 1000 + Math.floor(rnd() * 90000), '2024-' + String(1 + (i % 12)).padStart(2, '0') + '-' + String(1 + (i % 27)).padStart(2, '0'), pick(STH), i % 7 === 0 ? 99999 : 10 + Math.floor(rnd() * 400), 'शिकायत संख्या ' + (100000 + i) + ' के बारे में कार्यवाही लंबित है और उत्तर की प्रतीक्षा है']);
fs.writeFileSync(REG, ['क्रम,थाना,राशि,दिनांक,स्थिति,दिन,विवरण'].concat(reg.map(r => r.join(','))).join('\n'));
const W = ['sad', 'happy', 'angry', 'scared'], tx = []; for (let i = 0; i < 125000; i++) { const n = 8 + Math.floor(rnd() * 16), ws = []; for (let k = 0; k < n; k++) ws.push(pick(['i', 'feel', 'really', 'so', 'the', 'very', 'because', 'work', 'about', 'my', 'life'])); ws.push(pick(W)); tx.push([i, ws.join(' '), Math.floor(rnd() * 6)]); }
fs.writeFileSync(TXT, [',text,label'].concat(tx.map(r => r.join(','))).join('\n'));
console.log('text file', (fs.statSync(TXT).size / 1e6).toFixed(1), 'MB');
(async () => {
  const browser = await chromium.launch(); const ctxb = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctxb.newPage(); const external = [], errors = [];
  await page.route('**/*', r => /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:|about:)/.test(r.request().url()) ? r.continue() : (external.push(r.request().url()), r.abort()));
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/503|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  const init = () => page.addInitScript(() => { try { localStorage.setItem('stellura_tour_done', '1'); localStorage.setItem('sda_first_run', 'done'); } catch (x) {} });
  const ev = (f, a) => page.evaluate(f, a), wait = ms => page.waitForTimeout(ms);
  await init(); await page.goto(BASE + '/', { waitUntil: 'load' }); await wait(800); await ev(() => { localStorage.removeItem('stellura_roles'); localStorage.removeItem('stellura_roles_auto'); });
  // 1. a person is not interrupted by default under automation
  await page.setInputFiles('#fileInput', REG); await wait(3500);
  ok(!(await ev(() => !!document.getElementById('colRolesDialog'))), 'under test automation the screen does not open by itself');
  // 2. forced on: it opens by itself with the doubtful columns first
  await ev(() => { localStorage.setItem('stellura_roles_auto', '1'); }); await page.reload({ waitUntil: 'load' }); await wait(800); await page.setInputFiles('#fileInput', REG);
  await page.waitForSelector('#colRolesDialog', { timeout: 20000 }); await wait(300);
  const D = await ev(() => ({ txt: document.getElementById('colRolesDialog').innerText.replace(/\s+/g, ' '), rows: Array.from(document.querySelectorAll('#colRolesDialog .rc-tbl tr')).slice(1).map(tr => [tr.cells[0].innerText, tr.querySelector('select').value, !!tr.querySelector('.rc-blank')]) }));
  const role = n => (D.rows.find(r => r[0] === n) || [])[1];
  ok(role('क्रम') === 'rowno' && role('थाना') === 'category' && role('दिनांक') === 'date' && role('विवरण') === 'text', 'Hindi headings: क्रम = row number, थाना = category, दिनांक = date, विवरण = text', D.rows);
  ok(D.rows.find(r => r[0] === 'दिन')[2] && /99999/.test(D.txt), 'the code 99999 in “दिन” is offered as “empty”', D.txt.slice(0, 300));
  ok(D.rows[0][2] === true, 'the doubtful column is shown first', D.rows[0]);
  // 3. choose: the amount is a measurement (average); keep the placeholder ticked; Looks right
  await ev(() => { const tr = Array.from(document.querySelectorAll('#colRolesDialog .rc-tbl tr')).find(t => t.cells[0] && t.cells[0].innerText === 'राशि'); const s = tr.querySelector('select'); s.value = 'measure'; s.dispatchEvent(new Event('change')); });
  await page.click('#rcOk'); await wait(2500);
  const st = await ev(() => ({ blanks: rawData.filter(r => r[5] === '').length, p99: rawData.filter(r => r[5] === '99999').length, fn: STL.charts.fnFor(STL.charts.profile(headers, rawData, rawData.map((_, i) => i))[2]) }));
  ok(st.p99 === 0 && st.blanks === reg.filter(r => r[5] === 99999).length, 'the placeholder 99999 became empty in every row (' + st.blanks + ')', st);
  ok(st.fn === 'avg', 'an amount confirmed as a measurement is averaged, not added up', st);
  // 4. remembered: the same columns open again without asking, with the same effect
  await page.reload({ waitUntil: 'load' }); await wait(800); await page.setInputFiles('#fileInput', REG); await wait(3500);
  const again = await ev(() => ({ dlg: !!document.getElementById('colRolesDialog'), fn: STL.charts.fnFor(STL.charts.profile(headers, rawData, rawData.map((_, i) => i))[2]) }));
  ok(!again.dlg && again.fn === 'avg', 'the choices are remembered: no question, and the amount is still averaged', again);
  // 5. a large file (10+ MB): opened from the Check my columns button; row number and code recognised
  await ev(() => localStorage.removeItem('stellura_roles')); await page.reload({ waitUntil: 'load' }); await wait(800); await page.setInputFiles('#fileInput', TXT); await page.waitForFunction(() => window.BIG && BIG.active && BIG.profile, null, { timeout: 60000 }); await wait(2500);
  ok(!(await ev(() => !!document.getElementById('colRolesDialog'))), 'a file with nothing doubtful is not interrupted (no nagging)');
  await ev(() => STL.openColumnCheck()); await page.waitForSelector('#colRolesDialog', { timeout: 60000 }); await wait(300);
  const B = await ev(() => ({ big: !!(window.BIG && BIG.active), rows: Array.from(document.querySelectorAll('#colRolesDialog .rc-tbl tr')).slice(1).map(tr => [tr.cells[0].innerText, tr.querySelector('select').value]) }));
  ok(B.big && B.rows.find(r => r[0] === 'Column 1')[1] === 'rowno' && B.rows.find(r => r[0] === 'label')[1] === 'code' && B.rows.find(r => r[0] === 'text')[1] === 'text', 'large file: Column 1 = row number, label = code, text = text (from the whole file)', B);
  await page.click('#rcOk'); await wait(800);
  await ev(() => STL.openAsk()); await page.waitForSelector('#akQ'); await page.fill('#akQ', 'average label'); await page.press('#akQ', 'Enter'); await wait(2500);
  const ans = await ev(() => document.getElementById('akOut').innerText.replace(/\s+/g, ' ')); ok(/looks like a code/.test(ans), 'the answer still warns that label is a code', ans);
  await ev(() => STL.openDrivers({})); await page.waitForFunction(() => document.querySelector('#drUsed'), null, { timeout: 90000 });
  const used = await ev(() => document.getElementById('drUsed').innerText); ok(/What this used: .*label.*code.*125,?000? rows|What this used: .*label.* rows/.test(used.replace(/,/g, '')) && /your column check applied/.test(used), 'an answer says what it used: columns, their roles, rows read, and that the column check applied', used);
  ok(errors.length === 0, 'No JavaScript errors', errors); ok(external.length === 0, 'No request left the computer', external);
  await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); console.log(failures ? failures + ' FAILED' : 'ALL PASSED'); process.exit(failures ? 1 : 0);
})().catch(x => { console.error(x); process.exit(1); });
