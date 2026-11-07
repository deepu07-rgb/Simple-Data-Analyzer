/*
 * Two files about the same people (an application list and a month-by-month payment record, over 10 MB so it opens as a Large File):
 *   - "One row for each ID" turns the long file into one row per person: months, months late, ever 60+ days late — equal to a calculation made here
 *   - "Link two files" brings the person's details into that table by ID: matched counts are exact, an ID that is in the details file twice is left EMPTY
 *   - the question box then answers from the linked table
 *   STELLURA_HOME=/tmp/stl-home PORT=5056 python app.py ;  BASE=http://127.0.0.1:5056 node tests/e2e/link.e2e.js
 */
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:5000';
let failures = 0; const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x).slice(0, 500))); if (!c) failures++; };
let seed = 11; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }, pick = a => a[Math.floor(rnd() * a.length)];
const P = 46000, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-link-')), APP = path.join(dir, 'application_record.csv'), CRED = path.join(dir, 'credit_record.csv');
const app = [], cred = [], stat = {};
for (let p = 0; p < P; p++) {
  const id = String(5000000 + p), g = rnd() < 0.62 ? 'F' : 'M', inc = pick([54000, 90000, 126000, 180000, 270000]), emp = rnd() < 0.17 ? '365243' : String(-Math.floor(rnd() * 9000));
  app.push([id, g, inc, emp]);
  if (p % 6 === 0) continue;                                              // no payment history for this person
  const n = 1 + Math.floor(rnd() * 40); let late = 0, late60 = 0;
  for (let m = 0; m < n; m++) { const s = pick(['C', 'C', '0', '0', '0', 'X', '0', '1', '0', '2', '0', '0', '5'].slice(0, 13)); cred.push([id, -m, s]); if ('1235'.includes(s)) late++; if ('25'.includes(s)) late60++; }
  stat[id] = { n, late, late60, g, inc };
}
app.push(['5000007', 'M', 70000, '-100'], ['5000011', 'F', 80000, '-200']);       // two ids that are in the details file twice (different people)
cred.push(['9999991', 0, '0']);                                           // somebody with no details at all
fs.writeFileSync(APP, ['ID,CODE_GENDER,AMT_INCOME_TOTAL,DAYS_EMPLOYED'].concat(app.map(r => r.join(','))).join('\n'));
fs.writeFileSync(CRED, ['ID,MONTHS_BALANCE,STATUS'].concat(cred.map(r => r.join(','))).join('\n'));
const ids = Object.keys(stat), amb = new Set(['5000007', '5000011']);
const truth = { people: ids.length + 1, rows: cred.length, ever60: ids.filter(i => stat[i].late60 > 0).length + 0, everLate: ids.filter(i => stat[i].late > 0).length, lateMonths: ids.reduce((a, i) => a + stat[i].late, 0) };
const linkedRows = ids.filter(i => !amb.has(i)).length;
console.log('credit file', (fs.statSync(CRED).size / 1e6).toFixed(1), 'MB;', truth.people, 'people;', truth.rows, 'rows');
(async () => {
  const browser = await chromium.launch(); const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); const external = [], errors = [];
  await page.route('**/*', r => /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:|about:)/.test(r.request().url()) ? r.continue() : (external.push(r.request().url()), r.abort()));
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/503|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('stellura_tour_done', '1'); localStorage.setItem('sda_first_run', 'done'); } catch (x) {} });
  await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(800); const ev = (f, a) => page.evaluate(f, a), wait = ms => page.waitForTimeout(ms);
  await page.setInputFiles('#fileInput', CRED); await page.waitForFunction(n => window.BIG && BIG.active && BIG.matched === n, truth.rows, { timeout: 120000 });
  ok(true, 'the payment record opens as a Large File (' + truth.rows + ' rows)');
  // ---- the credit file alone: a wrong question is not answered
  await ev(() => STL.openAsk()); await page.waitForSelector('#akQ'); const ask = async q => { await page.fill('#akQ', q); await page.press('#akQ', 'Enter'); await wait(2200); return ev(() => document.getElementById('akOut').innerText.replace(/\s+/g, ' ')); };
  const s5 = ids.reduce((a, i) => a, 0), rows5 = cred.filter(r => r[2] === '5').length, noreg = await ask('how many rows have STATUS 5');
  ok(new RegExp('\\b' + String(rows5).replace(/(\d)(?=(\d\d)+\d$)/g, '$1,?') + ' of').test(noreg.replace(/,/g, '')) || noreg.includes(String(rows5)) , 'rows with STATUS 5 = ' + rows5 + ' (not every row)', noreg);
  const dist = await ask('how many different ID'); ok(dist.replace(/,/g, '').includes(String(truth.people)), 'different IDs = ' + truth.people, dist);
  const bad = await ask('how many people were ever delinquent'); ok(/did not count/.test(bad), 'an unknown word is not answered with a made-up count', bad);
  await ev(() => document.getElementById('akX').click());
  // ---- one row for each ID
  await ev(() => STL.openSummary()); await page.waitForSelector('#smK'); await page.waitForFunction(() => /will make [\d,]+ rows/.test(document.getElementById('sumDialog').innerText), null, { timeout: 30000 });
  const msg = await ev(() => document.getElementById('sumDialog').innerText.replace(/\s+/g, ' ')); ok(msg.replace(/,/g, '').includes('will make ' + truth.people + ' rows'), 'the dialog says how many rows it will make: ' + truth.people, msg.slice(0, 300));
  // untick the defaults, add: rows, rows where STATUS is 1/2/3/4/5, any of 2/3/4/5
  await ev(() => { document.querySelectorAll('.smOn').forEach(c => { if (!/Rows|Number of rows/.test(c.parentNode.innerText)) { c.checked = false; c.dispatchEvent(new Event('change')); } }); });
  await page.selectOption('#smF', 'countif'); await page.selectOption('#smC', { label: 'STATUS' }); await page.waitForSelector('.smV');
  for (const v of ['1', '2', '5']) await page.check('.smV[data-v="' + v + '"]'); await page.click('#smAdd');
  await page.selectOption('#smF', 'anyif'); await page.selectOption('#smC', { label: 'STATUS' }); await page.waitForSelector('.smV');
  for (const v of ['2', '5']) await page.check('.smV[data-v="' + v + '"]'); await page.click('#smAdd');
  await page.click('#smGo'); await page.waitForFunction(() => !window.BIG || !BIG.active, null, { timeout: 60000 }); await wait(1500);
  const H1 = await ev(() => headers.slice()), R1 = await ev(() => rawData.length);
  ok(R1 === truth.people, 'the new table has one row for each ID: ' + R1 + ' = ' + truth.people, R1);
  const col = n => H1.findIndex(h => h.indexOf(n) === 0), cMon = col('Rows'), cLate = H1.findIndex(h => /STATUS = 1\/2\/5/.test(h)), cAny = H1.findIndex(h => /^Any STATUS/.test(h));
  ok(cMon >= 0 && cLate >= 0 && cAny >= 0, 'columns made: ' + H1.join(' | '), H1);
  const got = await ev(a => rawData.map(r => [r[0], r[a[0]], r[a[1]], r[a[2]]]), [cMon, cLate, cAny]);
  let bad1 = 0, sumLate = 0, ever60 = 0; got.forEach(r => { const s = stat[r[0]]; if (!s) return; if (+r[1] !== s.n || +r[2] !== s.late || (r[3] === 'Yes') !== (s.late60 > 0)) bad1++; sumLate += +r[2]; if (r[3] === 'Yes') ever60++; });
  ok(bad1 === 0, 'every person: months, late months and "ever 60+ days late" equal the calculation from the raw rows (' + bad1 + ' differ)');
  ok(ever60 === truth.ever60 && sumLate === truth.lateMonths, 'people ever 60+ days late = ' + truth.ever60 + '; late months = ' + truth.lateMonths, [ever60, sumLate]);
  // ---- link the details file into it
  await ev(() => STL.openLink()); await page.waitForSelector('#lkPick'); const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#lkPick')]); await fc.setFiles(APP);
  await page.waitForFunction(() => /find a match/.test((document.getElementById('linkDialog') || {}).innerText || ''), null, { timeout: 60000 });
  const lk = await ev(() => document.getElementById('linkDialog').innerText.replace(/\s+/g, ' '));
  const inApp = new Set(app.map(r => r[0])); const matchedRows = got.filter(r => inApp.has(r[0])).length;
  ok(lk.replace(/,/g, '').includes(matchedRows + ' of ' + R1 + ' rows') && /appear more than once/.test(lk), 'the check says ' + matchedRows + ' of ' + R1 + ' rows match and that repeated IDs exist', lk.slice(0, 500));
  await page.click('#lkGo'); await page.waitForFunction(() => typeof headers !== 'undefined' && headers.indexOf('CODE_GENDER') >= 0, null, { timeout: 30000 }).catch(async x => { console.log('LINK DEBUG', await ev(() => ({ t: Array.from(document.querySelectorAll('.toast,.stl-toast,#toastContainer *')).map(e => e.innerText).join('/'), dlg: (document.getElementById('linkDialog') || {}).innerText, h: headers.slice(0, 8) }))); throw x; }); await wait(1500);
  const H2 = await ev(() => headers.slice()), rows2 = await ev(() => rawData.map(r => r.slice())); const ci = n => H2.indexOf(n);
  ok(rows2.length === R1, 'linking keeps every row (' + rows2.length + ')');
  let badG = 0, empties = 0, ambFilled = 0; rows2.forEach(r => { const s = stat[r[0]]; if (amb.has(r[0])) { if (r[ci('CODE_GENDER')] !== '') ambFilled++; return; } if (!s) { if (r[ci('CODE_GENDER')] !== '') ambFilled++; empties++; return; } if (r[ci('CODE_GENDER')] !== s.g || +r[ci('AMT_INCOME_TOTAL')] !== s.inc) badG++; });
  ok(badG === 0, 'gender and income of every linked person equal the details file (' + badG + ' differ)');
  ok(ambFilled === 0, 'the two IDs that are in the details file twice are left empty, not guessed');
  const lateF = rows2.filter(r => r[ci('CODE_GENDER')] === 'F' && r[cAny] === 'Yes').length, nF = rows2.filter(r => r[ci('CODE_GENDER')] === 'F').length;
  const trueF = ids.filter(i => stat[i].g === 'F' && !amb.has(i)); ok(nF === trueF.length && lateF === trueF.filter(i => stat[i].late60 > 0).length, 'women: ' + nF + ', of them ever 60+ days late: ' + lateF);
  // ---- the question box on the linked table
  await ev(() => STL.openAsk()); await page.waitForSelector('#akQ'); const q2 = await ask('how many rows have CODE_GENDER F'); ok(q2.replace(/,/g, '').includes(String(nF)), 'asked: women = ' + nF, q2); await ev(() => document.getElementById('akX').click());
  // ---- Fair comparison of a yes/no outcome: "how often Any STATUS = 2/5 is Yes", women vs men, among people with the same income
  const fwl = (f1, f0, key, yes) => { const g = {}; rows2.forEach(r => { const f = r[ci('CODE_GENDER')]; if (f !== f1 && f !== f0) return; const k = r[ci(key)], o = g[k] || (g[k] = { n1: 0, s1: 0, n0: 0, s0: 0 }); if (f === f1) { o.n1++; o.s1 += yes(r) ? 100 : 0; } else { o.n0++; o.s0 += yes(r) ? 100 : 0; } });
    let num = 0, den = 0; Object.values(g).forEach(o => { if (o.n1 && o.n0) { const w = o.n1 * o.n0 / (o.n1 + o.n0); num += w * (o.s1 / o.n1 - o.s0 / o.n0); den += w; } }); return num / den; };
  await ev(a => STL.openFair({ y: a[0], f: a[1], adj: [a[2]], yCat: { col: a[0], value: 'Yes' } }), [cAny, ci('CODE_GENDER'), ci('AMT_INCOME_TOTAL')]);
  await page.waitForFunction(() => document.querySelector('#frOut .fr-verdict'), null, { timeout: 60000 }); await wait(600);
  const FR = await ev(() => ({ R: { ref: STL.fair.last.ref, main: STL.fair.last.main.level, raw: STL.fair.last.main.raw.diff, adj: STL.fair.last.main.adj && STL.fair.last.main.adj.diff, pct: STL.fair.last.pct }, txt: document.getElementById('frOut').innerText.replace(/\s+/g, ' ') }));
  const f1 = FR.R.main, f0 = FR.R.ref, rate = (f) => { const x = rows2.filter(r => r[ci('CODE_GENDER')] === f); return 100 * x.filter(r => r[cAny] === 'Yes').length / x.length; };
  ok(FR.R.pct && Math.abs(FR.R.raw - (rate(f1) - rate(f0))) < 1e-6, 'Fair comparison, yes/no outcome: plain gap ' + FR.R.raw.toFixed(3) + ' points = ' + (rate(f1) - rate(f0)).toFixed(3), FR.R);
  ok(Math.abs(FR.R.adj - fwl(f1, f0, 'AMT_INCOME_TOTAL', r => r[cAny] === 'Yes')) < 1e-6, 'gap among people with the same income ' + FR.R.adj.toFixed(3) + ' points equals an independent calculation ' + fwl(f1, f0, 'AMT_INCOME_TOTAL', r => r[cAny] === 'Yes').toFixed(3));
  ok(/Measured as: Any STATUS = 2\/5 = Yes \(a percentage\)/.test(FR.txt) && /points/.test(FR.txt) && /How often Any STATUS/.test(FR.txt), 'the answer is written in percent and percentage points', FR.txt.slice(0, 400));
  await ev(() => document.getElementById('frX').click());
  // ---- a placeholder code is made empty on request
  const nPl = rows2.filter(r => r[ci('DAYS_EMPLOYED')] === '365243').length;
  await ev(a => STL.blankValue(a, '365243'), ci('DAYS_EMPLOYED')); await wait(2500);
  const after = await ev(a => ({ blanks: rawData.filter(r => r[a] === '').length, code: rawData.filter(r => r[a] === '365243').length, rows: rawData.length }), ci('DAYS_EMPLOYED'));
  ok(after.code === 0 && after.blanks >= nPl && after.rows === R1, 'the placeholder 365243 (' + nPl + ' cells) is now empty and no row is lost', after);
  ok(errors.length === 0, 'No JavaScript errors', errors); ok(external.length === 0, 'No request left the computer', external);
  await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); console.log(failures ? failures + ' FAILED' : 'ALL PASSED'); process.exit(failures ? 1 : 0);
})().catch(x => { console.error(x); process.exit(1); });
