/*
 * Phase 3 tools in a real browser, all external network blocked:
 *   Report Autopilot (teach, fill, download, recipe), Change Radar, Pendency Radar, Letters, Name Match.
 *   STELLURA_HOME=/tmp/stl-home PORT=5055 python app.py
 *   BASE=http://127.0.0.1:5055 node tests/e2e/reports.e2e.js
 */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os'), zlib = require('zlib');
const { execFileSync } = require('child_process');
const XLSX = require(path.join(__dirname, '..', '..', 'static', 'js', 'xlsx.full.min.js'));

const BASE = process.env.BASE || 'http://127.0.0.1:5000';
const PY = process.env.PY || 'python3';
let failures = 0;
const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x))); if (!c) failures++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-rep-'));

// ---------- the office: 8 stations, a monthly progress proforma ----------
const STATIONS = ['कोतवाली', 'सांगानेर', 'मानसरोवर', 'बगरू', 'चौमू', 'शाहपुरा', 'आमेर', 'विराटनगर'], STATUS = ['लंबित', 'निस्तारित', 'जाँच में'];
function rng(seed) { let x = seed; return () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296; }
function month(seed, bump) {
  const r = rng(seed), rows = [];
  STATIONS.forEach((st, si) => { const n = 4 + Math.floor(r() * 8) + (bump && si < 2 ? 15 : 0); for (let i = 0; i < n; i++) rows.push([st, STATUS[Math.floor(r() * 3)], String(1000 * (1 + Math.floor(r() * 90))), 'C' + (seed * 1000 + rows.length)]); });
  return rows;
}
const HEAD = ['थाना', 'स्थिति', 'राशि', 'प्रकरण'];
const rd = (x, d) => Number(Math.round(Number(String(Math.abs(x)) + 'e' + d)) + 'e-' + d);
function proforma(rows) {
  const out = [['राजस्थान पुलिस — मासिक प्रगति प्रतिवेदन', null, null, null, null, null], [null, null, null, null, null, null], ['क्र.सं.', 'थाना', 'दर्ज', 'लंबित', 'निस्तारित', 'राशि']];
  let tn = 0, tp = 0, td = 0, ts = 0;
  STATIONS.forEach((st, i) => { const rs = rows.filter(x => x[0] === st), n = rs.length, p = rs.filter(x => x[1] === 'लंबित').length, d = rs.filter(x => x[1] === 'निस्तारित').length, sm = rs.reduce((a, x) => a + +x[2], 0); tn += n; tp += p; td += d; ts += sm; out.push([i + 1, st, n, p, d, sm]); });
  out.push([null, 'कुल', tn, tp, td, ts]); return out;
}
const csv = rows => Buffer.from([HEAD.join(',')].concat(rows.map(r => r.join(','))).join('\n') + '\n', 'utf8');
const xlsx = (aoa, type = 'xlsx') => Buffer.from(XLSX.write((() => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'प्रगति'); return wb; })(), { type: 'buffer', bookType: type }));
const M1 = month(11), M2 = month(22, true), M3 = month(33);
const file = (name, buffer) => ({ name, mimeType: 'application/octet-stream', buffer });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const external = [], errors = [];
  await page.route('**/*', r => /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:|about:)/.test(r.request().url()) ? r.continue() : (external.push(r.request().url()), r.abort()));
  page.on('pageerror', e => errors.push('pageerror: ' + e.message + ' @ ' + String(e.stack || '').split('\n').slice(1, 4).join(' | ')));
  page.on('console', m => { if (m.type() === 'error' && !/503|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(1200);
  await page.evaluate(() => { try { _ddSkipTour(); } catch (e) {} });
  const shot = async n => { if (process.env.SHOTS) { await page.waitForTimeout(700); await page.screenshot({ path: path.join(process.env.SHOTS, n + '.png') }); } };
  const chooser = async (selector, f) => { const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(selector)]); await fc.setFiles(f); };
  const importFile = async f => { await page.setInputFiles('#fileInput', f); await page.waitForFunction(() => rawData.length > 0, null, { timeout: 15000 }); await page.waitForTimeout(900); await page.evaluate(() => { const b = document.getElementById('fixBanner'); if (b) b.style.display = 'none'; }); };

  // ---- Home
  const tiles = await page.$$eval('.stl-tile b', es => es.map(e => e.textContent));
  ok(tiles.length === 12 && tiles[0].includes('report') && tiles[1].includes('changed') && tiles[2].includes('Charts'), 'Home shows the flagship tools first (12 tiles)', tiles);

  // ---- 1. Report Autopilot: teach with last month, fill this month, download, verify the Excel
  await importFile(file('this_month.csv', csv(M2)));
  await page.keyboard.press('Control+k'); await page.fill('#palInput', 'autopilot'); await page.keyboard.press('Enter');
  await page.waitForSelector('#apDialog');
  await chooser('#apTmpl', file('last_month_report.xlsx', xlsx(proforma(M1))));
  await page.waitForSelector('#apData:not([disabled])');
  await chooser('#apData', file('last_month_data.csv', csv(M1)));
  await page.waitForFunction(() => document.getElementById('apLearn') && !document.getElementById('apLearn').disabled, null, { timeout: 15000 });
  await page.click('#apLearn');
  await page.waitForSelector('select[data-col]', { timeout: 15000 });
  const rules = await page.$$eval('#apDialog table.big-tbl tr', trs => trs.slice(1).map(tr => [...tr.children].map(td => (td.querySelector('select') ? td.querySelector('select').selectedOptions[0].textContent : td.textContent).trim())));
  ok(rules.length === 4 && rules.every(r => /\d+\/\d+/.test(r[2])), 'Autopilot learned a rule for each of the 4 report columns, each with a proof (n/n cells)', rules);
  ok(rules.find(r => r[0] === 'लंबित')[1].includes('स्थिति = लंबित') && rules.find(r => r[0] === 'राशि')[1].includes('राशि'), 'rules are explained in plain words', rules.map(r => r[1]));
  ok(rules.every(r => /verified|सत्यापित/.test(r[2])), 'all rules are marked verified');
  await page.click('#apFill');
  await page.waitForSelector('#apDialog .rp-prev', { timeout: 15000 });
  const want2 = proforma(M2);
  const cells = await page.$$eval('#apDialog .rp-prev tr', trs => trs.slice(1).map(tr => [...tr.children].map(td => td.textContent.trim())));
  ok(cells.length === 9 && cells[0][0] === 'कोतवाली' && cells[0][1].startsWith(String(want2[3][2])), 'preview shows the new numbers per station (+ total)', cells[0]);
  ok(await page.$eval('#apDialog', e => /▲|▼/.test(e.innerText)), 'preview shows increases and decreases against last month');
  ok(await page.$eval('#apSum', e => e.innerText.includes('Largest rise') || e.innerText.includes('सबसे अधिक वृद्धि')), 'a summary is written from the numbers');
  await shot('p3_autopilot');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#apDownload')]);
  const out = path.join(tmp, 'filled.xlsx'); await dl.saveAs(out);
  const wb = XLSX.read(fs.readFileSync(out)), ws = wb.Sheets['प्रगति'], aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  let bad = [];
  want2.forEach((row, r) => { if (r < 3) return; [2, 3, 4, 5].forEach(c => { if (aoa[r][c] !== row[c]) bad.push([r, c, aoa[r][c], row[c]]); }); });
  ok(bad.length === 0, 'the downloaded Excel holds exactly the independently computed numbers (incl. total row)', bad.slice(0, 3));
  ok(aoa[0][0] === 'राजस्थान पुलिस — मासिक प्रगति प्रतिवेदन' && aoa[2][1] === 'थाना', 'titles and headers of the office\'s own file are kept');
  ok(wb.SheetNames.length === 3 && wb.SheetNames.some(n => n.includes('Comparison')) && wb.SheetNames.some(n => n.includes('Summary')), 'comparison and summary sheets were added', wb.SheetNames);
  // recipe: save, then next month with one click
  await page.fill('#apName', 'मासिक प्रगति'); await page.click('#apSave');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('stellura_autopilot') || '[]').length === 1, null, { timeout: 8000 });
  ok(await page.evaluate(() => { const r = JSON.parse(localStorage.getItem('stellura_autopilot'))[0]; return r.name === 'मासिक प्रगति' && !!r.fileB64 && r.rules.cols.length > 0; }), 'recipe saved with its rules and the proforma file');
  await page.evaluate(() => document.getElementById('apDialog').remove());
  await importFile(file('third_month.csv', csv(M3)));
  await page.evaluate(() => STL.openAutopilot());
  await page.waitForSelector('[data-use]'); await page.click('[data-use="0"]');
  await page.waitForSelector('#apFill'); await page.click('#apFill');
  await page.waitForSelector('#apDialog .rp-prev', { timeout: 15000 });
  const [dl3] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#apDownload')]);
  const out3 = path.join(tmp, 'filled3.xlsx'); await dl3.saveAs(out3);
  const a3 = XLSX.utils.sheet_to_json(XLSX.read(fs.readFileSync(out3)).Sheets['प्रगति'], { header: 1, defval: null }), w3 = proforma(M3);
  ok(w3.every((row, r) => r < 3 || [2, 3, 4, 5].every(c => a3[r][c] === row[c])), 'next month: pick the data, one click, correct report (from the saved recipe)');
  await page.evaluate(() => document.getElementById('apDialog') && document.getElementById('apDialog').remove());

  // ---- 2. Change Radar (this month = M2 loaded; last month = M1)
  await importFile(file('this_month.csv', csv(M2)));
  await page.evaluate(() => STL.openChangeRadar());
  await chooser('#crPick', file('last_month.csv', csv(M1)));
  await page.waitForSelector('#crDialog .rp-sum', { timeout: 15000 });
  const sent = await page.$eval('#crDialog .rp-sum', e => e.innerText);
  ok(/rose by|fell by/.test(sent) && /\d/.test(sent), 'Change Radar writes what moved, with numbers', sent.slice(0, 160));
  const sumNow = M2.reduce((a, x) => a + +x[2], 0), sumPrev = M1.reduce((a, x) => a + +x[2], 0);
  ok(await page.$eval('#crDialog', (e, v) => e.innerText.includes(v), new Intl.NumberFormat('en-IN').format(sumNow)), 'the totals shown are the real totals');
  ok(await page.waitForFunction(() => !!document.getElementById('crChart') && !!Chart.getChart(document.getElementById('crChart')), null, { timeout: 8000 }).then(() => true).catch(() => false), 'a movers chart is drawn');
  await shot('p3_change');
  await page.evaluate(() => document.getElementById('crDialog').remove());

  // ---- 3. Pendency Radar
  const day = n => { const d = new Date(Date.UTC(2025, 11, 31) - n * 86400000); return d.toISOString().slice(0, 10); };
  const reg = ['प्रकरण संख्या,पंजीयन दिनांक,थाना,स्थिति'];
  const ages = [5, 20, 45, 80, 100, 150, 200, 300, 400, 500, 700, 15, 60, 95, 130];
  ages.forEach((a, i) => reg.push(`${i + 1},${day(a)},${i % 3 ? 'कोतवाली' : 'सांगानेर'},${i % 5 === 0 ? 'निस्तारित' : 'लंबित'}`));
  await importFile(file('register.csv', Buffer.from(reg.join('\n') + '\n', 'utf8')));
  await page.evaluate(() => STL.openPendency());
  await page.waitForSelector('#pdDialog .rp-heat');
  ok(await page.evaluate(() => !document.getElementById('pdSet').open), 'Pendency Radar opens straight on the finished result (settings tucked away)');
  await page.click('#pdSet summary');
  await page.fill('#pdAsOn', '2025-12-31'); await page.dispatchEvent('#pdAsOn', 'change');
  await page.waitForSelector('#pdDialog .rp-heat');
  const pending = ages.filter((_, i) => i % 5 !== 0);
  const kpi = await page.$$eval('#pdDialog .rp-kpi b', es => es.map(e => e.textContent));
  ok(kpi[0] === String(pending.length), 'pending cases counted (disposed ones left out)', kpi);
  ok(+kpi[2].split(' ')[0] === Math.max(...pending), 'oldest case is right', kpi[2]);
  const over180 = pending.filter(a => a > 180).length;
  ok(kpi[3].startsWith(String(over180)), 'over-180-day count is right', kpi[3]);
  ok(await page.waitForFunction(() => !!document.getElementById('pdChart') && !!Chart.getChart(document.getElementById('pdChart')), null, { timeout: 8000 }).then(() => true).catch(() => false), 'stacked age chart is drawn');
  await page.fill('#pdDl', '90'); await page.dispatchEvent('#pdDl', 'change');
  await page.waitForSelector('#pdOver');
  const overdue = pending.filter(a => a > 90).length;
  ok((await page.$eval('#pdOver', e => e.textContent)).includes(String(overdue)), 'cases past a 90-day deadline are counted', overdue);
  await shot('p3_pendency');
  await page.click('#pdSnap'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => STL.pendSnaps.length) === 1, 'weekly snapshot saved');
  await page.click('#pdOver');
  await page.waitForFunction(n => rawData.length === n, overdue, { timeout: 8000 });
  ok(true, 'the overdue cases open in the sheet for action');

  // ---- 4. Letters
  const people = ['नाम,पिता का नाम,गाँव,प्रकरण संख्या,राशि'];
  [['राहुल शर्मा', 'रमेश शर्मा', 'जयपुर', 'FIR/101', '250000'], ['प्रिया सिंह', 'मोहन सिंह', 'जोधपुर', 'FIR/102', '45000'], ['अमित कुमार', 'राम प्रसाद', 'कोटा', 'FIR/103', '1200']].forEach(r => people.push(r.join(',')));
  await importFile(file('people.csv', Buffer.from(people.join('\n') + '\n', 'utf8')));
  await page.evaluate(() => STL.openLetters());
  await page.waitForSelector('#ltDialog .lt-paper');
  const paper = await page.$eval('#ltDialog .lt-paper', e => e.innerText);
  ok(paper.includes('राहुल शर्मा') && paper.includes('FIR/101') && !paper.includes('{{'), 'the letter is filled with the first row\'s name and case number', paper.slice(0, 200));
  await shot('p3_letters');
  await page.fill('#ltBody', 'आपसे ₹ राशि {{राशि|inr}} वसूली योग्य है। दिनांक {{today}}।'); await page.waitForTimeout(200);
  ok((await page.$eval('#ltDialog .lt-paper', e => e.innerText)).includes('₹2,50,000'), 'amounts are written Indian style (₹2,50,000)');
  await page.fill('#ltBody', 'पत्र {{कोई कॉलम}} {{नाम}}'); await page.waitForTimeout(200);
  ok(await page.$eval('#ltDialog', e => e.innerText.includes('कोई कॉलम')), 'a {{name}} that is not a column is flagged');
  await page.selectOption('#ltPreset', 'reminder'); await page.waitForTimeout(200);
  const [dlw] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#ltWord')]);
  const docx = path.join(tmp, 'letters.docx'); await dlw.saveAs(docx);
  const info = JSON.parse(execFileSync(PY, ['-I', '-c', 'import zipfile,sys,json;x=zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode("utf8");print(json.dumps({"pages":x.count("w:type=\\"page\\""),"names":[n in x for n in ["राहुल शर्मा","प्रिया सिंह","अमित कुमार"]],"cs":"w:cs=\\"Mangal\\"" in x}))', docx]).toString());
  ok(info.pages === 2 && info.names.every(Boolean) && info.cs, 'Word file: 3 letters (2 page breaks), each person once, Hindi complex-script font set', info);
  await page.evaluate(() => { window.__printed = null; window.open = () => ({ document: { write(h) { window.__printed = h; }, close() {} }, focus() {}, print() { window.__didPrint = true; } }); });
  await page.click('#ltPrint'); await page.waitForTimeout(900);
  const html = await page.evaluate(() => window.__printed || '');
  ok((html.match(/lt-paper/g) || []).length >= 3 && html.includes('राहुल शर्मा') && html.includes('@page') && await page.evaluate(() => window.__didPrint === true), 'Print / Save as PDF page: 3 letters, A4 page rules, print dialog opened');
  await page.selectOption('#ltMode', 'cover'); await page.waitForTimeout(250);
  ok(await page.$eval('#ltDialog', e => e.innerText.includes('3')), 'covering-letter mode lists the rows in an annexure');
  await page.evaluate(() => document.getElementById('ltDialog').remove());

  // ---- 5. Name Match
  const names = ['नाम,पिता का नाम,गाँव'];
  [['राहुल शर्मा', 'रमेश शर्मा', 'जयपुर'], ['Rahul Sharma', 'Ramesh Sharma', 'Jaipur'], ['सुनीता देवी', 'मोहन लाल', 'अलवर'], ['अमित कुमार', 'राम प्रसाद', 'सीकर'], ['Sunita Devi', 'Mohan Lal', 'Alwar'], ['विक्रम सिंह', 'हरि सिंह', 'कोटा']].forEach(r => names.push(r.join(',')));
  await importFile(file('names.csv', Buffer.from(names.join('\n') + '\n', 'utf8')));
  await page.evaluate(() => STL.openNameMatch());
  await page.waitForSelector('#nmRun'); await page.click('#nmRun');
  await page.waitForSelector('#nmDialog table.nm', { timeout: 10000 });
  const rowsTxt = await page.$$eval('#nmDialog table.nm tr', trs => trs.slice(1).map(tr => tr.innerText.replace(/\s+/g, ' ')));
  ok(rowsTxt.length === 2 && rowsTxt.some(t => t.includes('राहुल शर्मा') && t.includes('Rahul Sharma')) && rowsTxt.some(t => t.includes('सुनीता देवी') && t.includes('Sunita Devi')), 'finds the two people entered in both Hindi and English, and nobody else', rowsTxt);
  ok(await page.$$eval('#nmDialog input[data-pk]', es => es.every(e => e.checked)), 'strong matches are pre-ticked for confirmation');
  await shot('p3_names');
  await page.click('#nmMark');
  await page.waitForFunction(() => headers.length === 4, null, { timeout: 8000 });
  const grp = await page.evaluate(() => rawData.map(r => r[3]));
  ok(grp[0] !== '' && grp[0] === grp[1] && grp[2] === grp[4] && grp[0] !== grp[2] && grp[3] === '' && grp[5] === '', 'duplicates are marked in a new column, grouped correctly', grp);

  ok(external.length === 0, 'zero requests left this PC', external);
  ok(errors.length === 0, 'no JavaScript errors', errors);
  await browser.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})();
