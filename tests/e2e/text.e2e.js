/*
 * A file of free text with a numeric code label (10+ MB, so a Large File), like an emotion data set:
 *   - the blank-headed row-number column is recognised as a row number (never summed or explained), the label 0-5 is offered as an outcome
 *   - the question box counts rows that contain a word (whole word) and different texts, equal to a calculation made here
 *   - Words: the word that stands out for each label, its rows and shares, equal to a calculation made here
 *   - Repeats: repeated texts, extra copies and texts with conflicting labels, equal to a calculation made here
 *   STELLURA_HOME=/tmp/stl-home PORT=5058 python app.py ;  BASE=http://127.0.0.1:5058 node tests/e2e/text.e2e.js
 */
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:5000';
let failures = 0; const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x).slice(0, 500))); if (!c) failures++; };
let seed = 17; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }, pick = a => a[Math.floor(rnd() * a.length)];
const COMMON = ['i', 'feel', 'feeling', 'really', 'so', 'the', 'very', 'because', 'work', 'about', 'my', 'life', 'today', 'after', 'being', 'always', 'sometimes', 'people', 'around', 'myself'];
const BYLAB = { 0: ['sad', 'lonely', 'tired', 'gloomy', 'helpless'], 1: ['happy', 'glad', 'bright', 'cheerful', 'content'], 2: ['loving', 'tender', 'caring', 'fond', 'sweet'], 3: ['angry', 'furious', 'bitter', 'irritated', 'rude'], 4: ['scared', 'afraid', 'anxious', 'tense', 'uneasy'], 5: ['amazed', 'stunned', 'shocked', 'startled', 'curious'] };
const LABW = [0, 0, 1, 1, 1, 2, 3, 3, 4, 5], N = 125000, rows = [];
for (let i = 0; i < N; i++) { const lab = pick(LABW), n = 6 + Math.floor(rnd() * 22), ws = []; for (let k = 0; k < n; k++) ws.push(pick(COMMON)); ws.splice(Math.floor(rnd() * n), 0, rnd() < 0.7 ? pick(BYLAB[lab]) : pick(BYLAB[pick([0, 1, 2, 3, 4, 5])])); rows.push([String(i), ws.join(' '), String(lab)]); }
for (let i = 0; i < 4000; i++) rows[100 + i * 29][1] = rows[i * 7][1];                          // 4,000 rows carry the text of another row, with its own label
rows.forEach((r, i) => { r[0] = String(i); });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-text-')), CSV = path.join(dir, 'text.csv');
fs.writeFileSync(CSV, [',text,label'].concat(rows.map(r => r.join(','))).join('\n'));
console.log('text file', (fs.statSync(CSV).size / 1e6).toFixed(1), 'MB;', N, 'rows');
const tok = s => new Set(s.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, ' ').trim().split(' ').filter(w => w.length >= 2));
const T = rows.map(r => tok(r[1]));
const truth = { happy: T.filter(s => s.has('happy')).length, happy4: rows.filter((r, i) => T[i].has('scared') && r[2] === '4').length, distinct: new Set(rows.map(r => r[1].trim().toLowerCase())).size };
const byLab = {}; rows.forEach((r, i) => { (byLab[r[2]] = byLab[r[2]] || { n: 0, w: {} }).n++; T[i].forEach(w => { byLab[r[2]].w[w] = (byLab[r[2]].w[w] || 0) + 1; }); });
const all = {}; T.forEach(s => s.forEach(w => { all[w] = (all[w] || 0) + 1; }));
const grp = {}; rows.forEach((r, i) => { const k = r[1].trim().toLowerCase(), o = grp[k] || (grp[k] = { n: 0, l: new Set() }); o.n++; o.l.add(r[2]); });
const reps = Object.values(grp).filter(o => o.n > 1), tr = { repeated: reps.length, rowsIn: reps.reduce((a, o) => a + o.n, 0), extra: reps.reduce((a, o) => a + o.n - 1, 0), conflicts: reps.filter(o => o.l.size > 1).length, rowsConf: reps.filter(o => o.l.size > 1).reduce((a, o) => a + o.n, 0) };
(async () => {
  const browser = await chromium.launch(); const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); const external = [], errors = [];
  await page.route('**/*', r => /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:|about:)/.test(r.request().url()) ? r.continue() : (external.push(r.request().url()), r.abort()));
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/503|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('stellura_tour_done', '1'); localStorage.setItem('sda_first_run', 'done'); } catch (x) {} });
  await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(800); const ev = (f, a) => page.evaluate(f, a), wait = ms => page.waitForTimeout(ms);
  await page.setInputFiles('#fileInput', CSV); await page.waitForFunction(n => window.BIG && BIG.active && BIG.matched === n, N, { timeout: 120000 });
  await ev(() => STL.bigCharts.loadSample()); await wait(500);
  const pr = await ev(() => STL.charts.profile(BIG.headers, STL.bigCharts.sample.rows, STL.bigCharts.sample.idx).map(p => ({ serial: !!p.serial, numeric: !!p.numeric, lowInt: !!p.lowInt })));
  ok(pr[0].serial && !pr[0].numeric, 'the blank-headed row-number column is a row number (never summed): ' + JSON.stringify(pr[0]), pr);
  ok(pr[2].lowInt, 'the label 0-5 is a code with a few values');
  // the question box
  await ev(() => STL.openAsk()); await page.waitForSelector('#akQ'); const ask = async q => { await page.fill('#akQ', q); await page.press('#akQ', 'Enter'); await wait(2500); return ev(() => document.getElementById('akOut').innerText.replace(/\s+/g, ' ').replace(/,/g, '')); };
  let a = await ask('how many rows contain the word happy'); ok(a.includes(truth.happy + ' of ' + N), 'rows containing the word “happy” = ' + truth.happy, a);
  a = await ask('how many rows containing scared have label 4'); ok(a.includes(truth.happy4 + ' of ' + N), 'rows containing “scared” with label 4 = ' + truth.happy4, a);
  a = await ask('how many different text'); ok(a.includes(truth.distinct + ' different'), 'different texts = ' + truth.distinct, a);
  a = await ask('average label'); ok(/looks like a code/.test(a), 'an average of a code carries a warning', a);
  await ev(() => document.getElementById('akX').click());
  // the label is offered as an outcome
  await ev(() => STL.openDrivers({})); await page.waitForSelector('#drY, #drOut', { timeout: 60000 }); await wait(2500);
  const opts = await ev(() => Array.from(document.querySelectorAll('#driversDialog select option')).map(o => o.textContent));
  ok(opts.some(o => /label = 4/.test(o)), 'What explains this? offers “How often label = 4”', opts.slice(0, 20));
  const dr0 = await ev(() => document.getElementById('drOut').innerText.replace(/\s+/g, ' ')); ok(!/no number column/i.test(dr0) && /label = /.test(dr0), 'a file with no number column explains the label itself instead of giving up', dr0.slice(0, 200));
  await ev(() => document.getElementById('drX').click());
  // words
  await ev(() => STL.openWords()); await page.waitForFunction(() => document.querySelector('#wdOut table'), null, { timeout: 90000 }); await wait(500);
  const W = await ev(() => { const o = document.getElementById('wdOut'); return { n: o.innerText.match(/([\d,]+) rows read/)[1], boxes: Array.from(o.querySelectorAll('div[style*="flex:1"]')).map(d => ({ g: d.querySelector('b').innerText, rows: Array.from(d.querySelectorAll('tr')).map(tr => Array.from(tr.cells).map(c => c.innerText)) })) }; });
  ok(W.n.replace(/,/g, '') === String(N), 'every row is read: ' + W.n, W);
  let good = 0; W.boxes.forEach(b => { const lab = b.g, top = b.rows[0]; if (!top || !byLab[lab]) return; const w = top[0], k = byLab[lab].w[w] || 0, share = (k / byLab[lab].n * 100); const inList = BYLAB[lab].indexOf(w) >= 0; const shown = parseFloat(top[1]); if (inList && Math.abs(shown - share) < 0.06 + (share < 0.1 ? 0.01 : 0)) good++; });
  ok(W.boxes.length === 6 && good === 6, 'for each of the 6 labels the word that stands out is one of its planted words, with the exact share of that label’s rows (' + good + ' of ' + W.boxes.length + ')', W.boxes.map(b => [b.g, b.rows[0]]));
  const lift = await ev(() => Array.from(document.querySelectorAll('#wdOut div[style*="flex:1"]')).map(d => d.querySelectorAll('tr')[0].cells[2].innerText));
  const top0 = W.boxes[0], lab0 = top0.g, w0 = top0.rows[0][0], expect = (byLab[lab0].w[w0] / byLab[lab0].n) / (all[w0] / N);
  ok(Math.abs(parseFloat(lift[0].replace('×', '')) - expect) < 0.06, 'the “times as often” figure equals the calculation: ' + lift[0] + ' vs ×' + expect.toFixed(2));
  await ev(() => document.getElementById('wdX').click());
  // repeats
  await ev(() => STL.openRepeats()); await page.waitForFunction(() => /appear more than once/.test((document.getElementById('rpOut') || {}).innerText || ''), null, { timeout: 90000 }); await wait(500);
  const R = await ev(() => document.getElementById('rpOut').innerText.replace(/\s+/g, ' ').replace(/,/g, ''));
  ok(R.includes(tr.repeated + ' different values') && R.includes(tr.rowsIn + ' rows') && R.includes(tr.extra + ' rows are extra copies'), 'repeated texts ' + tr.repeated + ', rows ' + tr.rowsIn + ', extra copies ' + tr.extra, R.slice(0, 400));
  ok(R.includes(tr.conflicts + ' of those repeated values') && R.includes('(' + tr.rowsConf + ' rows)'), 'texts with conflicting labels ' + tr.conflicts + ' (' + tr.rowsConf + ' rows)', R.slice(0, 600));
  // text length and number of words as columns, then asked about
  await ev(() => document.getElementById('rpX').click()); await ev(() => STL.openWords()); await page.waitForFunction(() => document.querySelector('#wdLen'), null, { timeout: 90000 }); await page.click('#wdLen');
  await page.waitForFunction(() => window.BIG && BIG.active && BIG.headers.length === 5, null, { timeout: 90000 }); await wait(1500);
  await ev(() => STL.openAsk()); await page.waitForSelector('#akQ'); const meanW = rows.reduce((s, r) => s + r[1].trim().split(/\s+/).length, 0) / N;
  a = await ask('average text_words'); const got = parseFloat((/Average [^:]*: ([\d.]+)/.exec(a) || [])[1]);
  ok(Math.abs(got - meanW) < 0.006, 'the new column “' + (await ev(() => BIG.headers[4])) + '” gives an average of ' + got + ' words = ' + meanW.toFixed(3), a);
  await ev(() => document.getElementById('akX').click());
  ok(errors.length === 0, 'No JavaScript errors', errors); ok(external.length === 0, 'No request left the computer', external);
  await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); console.log(failures ? failures + ' FAILED' : 'ALL PASSED'); process.exit(failures ? 1 : 0);
})().catch(x => { console.error(x); process.exit(1); });
