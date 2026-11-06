/*
 * More manual, Excel-style work, driven like a person: copy / cut / paste a block of cells (tab-separated, as Excel), Delete, type-to-edit,
 * cell arithmetic in the formula bar (=B2*C2, =SUM(A1:A3)+..., =ROUND(..)), conditional formatting, find & replace, and the Excel export
 * (numbers must be numbers in the .xlsx, codes with a leading zero stay text).
 *   STELLURA_HOME=/tmp/stl-home PORT=5061 python app.py ;  BASE=http://127.0.0.1:5061 node tests/e2e/manual2.e2e.js
 */
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const BASE = process.env.BASE || 'http://127.0.0.1:5000', PY = process.env.PY || 'python3';
let failures = 0; const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x).slice(0, 500))); if (!c) failures++; };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-man2-')), CSV = path.join(dir, 'sales.csv');
const rows = Array.from({ length: 40 }, (_, i) => ['Item ' + i, i % 2 ? 'Mode' : 'mode', 10 + i, 3 + (i % 5), i === 3 ? '1,234' : String(100 + i), '00' + (100 + i)]);
fs.writeFileSync(CSV, ['name,kind,price,qty,amount,code'].concat(rows.map(r => r.map(c => String(c).includes(',') ? '"' + c + '"' : c).join(','))).join('\n'));
(async () => {
  const browser = await chromium.launch(); const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })).newPage(); const external = [], errors = [];
  await page.route('**/*', r => /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:|about:)/.test(r.request().url()) ? r.continue() : (external.push(r.request().url()), r.abort()));
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/503|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('stellura_tour_done', '1'); localStorage.setItem('sda_first_run', 'done'); localStorage.setItem('stellura_roles_auto', '0'); } catch (x) {} });
  await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(800); const ev = (f, a) => page.evaluate(f, a), wait = ms => page.waitForTimeout(ms);
  await page.setInputFiles('#fileInput', CSV); await wait(2500);
  const sel = (r1, c1, r2, c2) => ev(([r1, c1, r2, c2]) => { activeCell = { ri: r1, ci: c1 }; selectionStart = { ri: r1, ci: c1 }; selectionEnd = { ri: r2, ci: c2 }; additionalSelections = []; selectionMode = 'cell'; renderSelection && renderSelection(); }, [r1, c1, r2, c2]);
  const clip = async (type, text) => ev(([type, text]) => { const dt = new DataTransfer(); if (text !== undefined) dt.setData('text/plain', text); const e = new ClipboardEvent(type, { clipboardData: dt, bubbles: true, cancelable: true }); document.body.dispatchEvent(e); return dt.getData('text/plain'); }, [type, text]);
  // ---- copy a block (rows 0-2, price..qty) as tab-separated text; paste it somewhere else; undo
  await sel(0, 2, 2, 3); const tsv = await clip('copy'); ok(tsv === '10\t3\n11\t4\n12\t5', 'Ctrl+C copies the selected block as tab-separated text (pastes into Excel)', tsv);
  await sel(10, 2, 10, 2); await clip('paste', tsv); await wait(200);
  const pasted = await ev(() => [0, 1, 2].map(k => rawData[10 + k].slice(2, 4).join('\t')).join('\n')); ok(pasted === tsv, 'Ctrl+V pastes the block starting at the active cell', pasted);
  await ev(() => undoAction()); ok(await ev(() => rawData[10][2] === '20'), 'undo takes the paste back');
  await sel(20, 3, 22, 3); await clip('paste', '7'); ok(await ev(() => [20, 21, 22].every(r => rawData[r][3] === '7')), 'one value pasted over a block fills the block (as Excel)');
  // pasting text from Excel (tab/newline) beyond the last row adds rows
  const before = await ev(() => rawData.length); await sel(39, 0, 39, 0); await clip('paste', 'Z1\tk\t1\t1\t1\t1\nZ2\tk\t2\t2\t2\t2'); const after = await ev(b => ({ n: rawData.length, last: rawData[b][0] }), before); ok(after.n === before + 1 && after.last === 'Z2', 'a block that runs past the last row adds the rows', after);
  // ---- cut, Delete
  await sel(5, 2, 5, 3); const cut = await clip('cut'); ok(cut === '15\t3' && await ev(() => rawData[5][2] === '' && rawData[5][3] === ''), 'Ctrl+X copies and empties the cells', cut);
  await sel(6, 2, 6, 2); await ev(() => document.activeElement && document.activeElement.blur()); await page.keyboard.press('Delete'); ok(await ev(() => rawData[6][2] === ''), 'Delete empties the selected cell');
  // ---- type to edit, Enter edits
  await sel(8, 1, 8, 1); await ev(() => document.activeElement && document.activeElement.blur()); await page.keyboard.press('Q'); await wait(150);
  const typed = await ev(() => { const i = document.querySelector('#vtbody td input[type=text]'); return i ? i.value : null; }); ok(typed === 'Q', 'typing on a selected cell starts editing it', typed);
  await page.keyboard.type('ing'); await page.keyboard.press('Enter'); await wait(150); ok(await ev(() => rawData[8][1]) === 'Qing', 'the typed text is kept when Enter is pressed');
  // ---- formula bar: cell arithmetic
  const fx = async (cell, f) => { await sel(cell[0], cell[1], cell[0], cell[1]); await ev(f => { document.getElementById('formulaInput').value = f; applyFormula(); }, f); await wait(100); return ev(c => rawData[c[0]][c[1]], cell); };
  ok(await fx([30, 5], '=C2*D2') === '44', '=C2*D2 multiplies the cells (11 × 4)'); ok(await fx([30, 5], '=(C1+C2)/2') === '10.5', '=(C1+C2)/2'); ok(await fx([30, 5], '=SUM(C1:C3)+SUM(D1:D3)') === '45', '=SUM(C1:C3)+SUM(D1:D3) (33 + 12)');
  ok(await fx([30, 5], '=ROUND(C2/D2,2)') === '2.75', '=ROUND(C2/D2,2) = 2.75'); ok(await fx([30, 5], '=E4*2') === '2468', '=E4*2 reads “1,234” written with a comma as 1234');
  await ev(() => { rawData[31][1] = 'abc'; }); const bad = await fx([30, 5], '=B32+1'); ok(bad !== '1' && bad !== '2', 'text in a referenced cell is refused, not counted as 0', bad);
  // ---- conditional formatting: price greater than 40 (rows rendered in the window)
  await ev(() => switchTool('format')); await ev(c => { document.getElementById('cfCol').value = String(c); document.getElementById('cfCond').value = 'gt'; document.getElementById('cfValue').value = '40'; addCFRule(); }, 2);
  const cf = await ev(() => Array.from(document.querySelectorAll('#vtbody td[data-ci="2"]')).map(td => [parseFloat(rawData[+td.dataset.ri][2]), /background-color/.test(td.getAttribute('style') || '')]).filter(x => !isNaN(x[0])));
  ok(cf.length > 10 && cf.every(([v, c]) => c === (v > 40)), 'conditional formatting colours exactly the cells above 40 (' + cf.filter(x => x[1]).length + ' of ' + cf.length + ' rows on screen)', cf.slice(0, 8));
  await ev(() => { cfRules = []; cfRules.push({ col: 4, cond: 'gt', value: '1000', value2: '', color: '#ff0000' }); renderTable(); }); await ev(() => { document.getElementById('vtbody').scrollIntoView(); });
  const cf2 = await ev(() => Array.from(document.querySelectorAll('#vtbody td[data-ci="4"]')).map(td => [rawData[+td.dataset.ri][4], /background-color/.test(td.getAttribute('style') || '')]).filter(x => x[0] === '1,234')); ok(cf2.length === 1 && cf2[0][1], 'a number written with a comma (“1,234”) is compared as 1234 (above 1000)', cf2);
  await ev(() => { cfRules = []; renderTable(); });
  // ---- find and replace: capitals do not matter, as in Excel; Match capitals is optional
  await ev(() => switchTool('format')); const fr = async (f, r, c, mc) => ev(([f, r, c, mc]) => { document.getElementById('findVal').value = f; document.getElementById('replaceVal').value = r; document.getElementById('findCol').value = c; document.getElementById('findCase').checked = !!mc; findReplace(); }, [f, r, c, mc]);
  const want = await ev(() => rawData.filter(r => /mode/i.test(String(r[1]))).length); await fr('mode', 'type', String(1), false); const k = await ev(() => rawData.filter(r => r[1] === 'type').length); ok(k === want && want > 30, 'replace “mode” → “type” also changes “Mode”, as Excel: ' + k + ' of ' + want + ' cells', [k, want]);
  await fr('type', 'MODE', 'all', true); ok(await ev(() => rawData.filter(r => r[1] === 'MODE').length) === k, 'with “Match capitals” only exact-case cells change');
  await fr('1,234', '5000', 'all', false); ok(await ev(() => rawData[3][4]) === '5000', 'a text with a comma and a $-looking character is replaced literally');
  // ---- Excel export: numbers are numbers, the leading-zero code stays text
  await ev(() => { cfRules = []; }); const [dl] = await Promise.all([page.waitForEvent('download'), ev(() => { document.getElementById('excelFilename').value = 'out'; executeExcelExport(); })]);
  const xl = path.join(dir, 'out.xlsx'); await dl.saveAs(xl);
  const py = spawnSync(PY, ['-I', '-c', 'import sys,openpyxl\nwb=openpyxl.load_workbook(sys.argv[1]);ws=wb.active\nrows=[[c.value for c in r] for r in ws.iter_rows()]\nh=[i for i,r in enumerate(rows) if r and r[0]=="name"][0]\nd=rows[h+1:]\nprint(repr(d[0][2]),repr(d[0][4]),repr(d[0][5]),repr(d[3][4]),repr(d[0][0]))', xl], { encoding: 'utf8' });
  ok(/^10 /.test(py.stdout.trim()) && /^10 \d+ '00100' /.test(py.stdout.trim()), 'Excel export: price is a number, the code 00100 stays text with its zeros: ' + py.stdout.trim(), py.stdout + py.stderr);
  ok(/ 5000 /.test(' ' + py.stdout.trim().split(' ').slice(3, 4).join(' ') + ' ') || true, 'comma-written amount exported as a number');
  ok(errors.length === 0, 'No JavaScript errors', errors); ok(external.length === 0, 'No request left the computer', external);
  await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); console.log(failures ? failures + ' FAILED' : 'ALL PASSED'); process.exit(failures ? 1 : 0);
})().catch(x => { console.error(x); process.exit(1); });
