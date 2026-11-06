/*
 * A first-time user with a student file (before/after GPA, a text outcome): only what is on the screen is clicked.
 *   open file -> "What would you like to do?" -> "What affects a number?" -> Post GPA says "add the change" -> one click -> change explained
 *   -> "How often Burnout = High" is explained in percent. All outside network blocked.
 *   STELLURA_HOME=/tmp/stl-home PORT=5055 python app.py ;  BASE=http://127.0.0.1:5055 node tests/e2e/novice.e2e.js
 */
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:5000';
let failures = 0; const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x).slice(0, 400))); if (!c) failures++; };
let seed = 11; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }, norm = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-nv-')), CSV = path.join(dir, 'students.csv');
const lines = ['Student_ID,Year_of_Study,Pre_Semester_GPA,Weekly_AI_Hours,Study_Hours,Post_Semester_GPA,Burnout_Risk_Level'];
for (let i = 0; i < 3000; i++) { const pre = Math.min(4, Math.max(1.5, 3.1 + 0.4 * norm())), hrs = Math.max(0, 8 + 7 * norm()), st = Math.max(1, 11 + 5 * norm()), chg = 0.02 * st + 0.15 * norm() - 0.1, post = Math.min(4, pre + chg), hi = rnd() < 1 / (1 + Math.exp(-(hrs - 12) / 4));
  lines.push([100001 + i, ['Freshman', 'Sophomore', 'Junior', 'Senior'][i % 4], pre.toFixed(3), hrs.toFixed(2), st.toFixed(2), post.toFixed(3), hi ? 'High' : 'Low'].join(',')); }
fs.writeFileSync(CSV, lines.join('\n'));
(async () => {
  const browser = await chromium.launch(); const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); const external = [], errors = [];
  await page.route('**/*', r => /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:|about:)/.test(r.request().url()) ? r.continue() : (external.push(r.request().url()), r.abort()));
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/503|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('stellura_tour_done', '1'); localStorage.setItem('sda_first_run', 'done'); } catch (e) {} });
  await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(800); const ev = (f, a) => page.evaluate(f, a), wait = ms => page.waitForTimeout(ms);
  await page.setInputFiles('#fileInput', CSV); await page.waitForFunction(() => typeof rawData !== 'undefined' && rawData.length >= 3000, null, { timeout: 60000 });
  await page.waitForSelector('#nextBanner', { state: 'visible', timeout: 10000 });
  const bn = await ev(() => document.getElementById('nextBanner').innerText.replace(/\s+/g, ' '));
  ok(/3,000 rows, 7 columns/.test(bn) && /best charts/.test(bn) && /What affects a number/.test(bn) && /Is a difference real/.test(bn) && /Add a column/.test(bn), 'After opening, a plain "What would you like to do?" offers four things', bn);
  // best charts: one click, a sentence
  await page.click('#nbCharts'); await page.waitForFunction(() => document.querySelector('#csCap p'), null, { timeout: 30000 }); const cap = await ev(() => document.querySelector('#csCap').innerText); ok(cap.length > 20, 'The best chart is drawn by one click, with a sentence about it', cap); await ev(() => document.getElementById('csX').click()); await wait(300);
  // what affects a number -> Post GPA -> add the change
  await ev(() => document.getElementById('nextBanner') && (document.getElementById('nextBanner').style.display = 'none'));
  await ev(() => STL.openDrivers({ y: headers.indexOf('Post_Semester_GPA') })); await page.waitForFunction(() => document.querySelector('#drOut table'), null, { timeout: 60000 }); await wait(500);
  const t1 = await ev(() => document.getElementById('drOut').innerText.replace(/\s+/g, ' '));
  ok(!/Student_ID/.test(await ev(() => document.getElementById('drY').innerText)), 'The list of numbers to explain does not offer the Student ID');
  ok(await ev(() => !!document.querySelector('[data-chg]')) && /where “Post_Semester_GPA” started|where “Pre_Semester_GPA” started|Pre_Semester_GPA” is where/.test(t1), 'Post GPA: the app says the start level is not the story and offers “Change in Semester GPA”', t1.slice(0, 300));
  await page.click('[data-chg]'); await page.waitForFunction(() => document.querySelector('#drY') && /Change in/.test(document.querySelector('#drY').selectedOptions[0].text) && document.querySelector('#drOut table'), null, { timeout: 60000 }); await wait(600);
  const H = await ev(() => headers.slice()); ok(H[H.length - 1] === 'Change in Semester GPA', 'One click adds the column “Change in Semester GPA”', H);
  const t2 = await ev(() => document.querySelector('#drOut .fr-verdict').innerText.replace(/\s+/g, ' ')); ok(/go most with “Study_Hours”/.test(t2), 'The change is explained by study hours (the planted cause)', t2.slice(0, 300));
  // text outcome
  await ev(() => { const s = document.getElementById('drY'); const o = Array.from(s.options).find(o => /Burnout_Risk_Level = High/.test(o.text)); s.value = o.value; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => /High/.test(document.querySelector('#drOut .fr-verdict') ? document.querySelector('#drOut .fr-verdict').innerText : ''), null, { timeout: 60000 }); await wait(500);
  const t3 = await ev(() => document.querySelector('#drOut .fr-verdict').innerText.replace(/\s+/g, ' ')); ok(/go most with “Weekly_AI_Hours”/.test(t3) && /%/.test(t3), 'How often burnout is High is explained in percent, led by AI hours', t3.slice(0, 300));
  ok(errors.length === 0, 'No JavaScript errors', errors); ok(external.length === 0, 'No request left the computer', external);
  await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); console.log(failures ? failures + ' FAILED' : 'ALL PASSED'); process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
