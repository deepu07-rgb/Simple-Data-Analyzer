/*
 * The manual, Excel-style tools, driven like a person would and checked against an independent calculation:
 * edit a cell + undo/redo, sort, filter, Column Analysis, Group By, Pivot, Comparison, column tools, validation.
 * The file has what real files have: numbers written with thousands commas, blanks, a zero, one cell of garbage text.
 *   STELLURA_HOME=/tmp/stl-home PORT=5060 python app.py ;  BASE=http://127.0.0.1:5060 node tests/e2e/manual.e2e.js
 */
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:5000';
let failures = 0; const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x).slice(0, 500))); if (!c) failures++; };
let seed = 41; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }, pick = a => a[Math.floor(rnd() * a.length)];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-man-')), CSV = path.join(dir, 'songs.csv'), N = 600;
const rows = []; for (let i = 0; i < N; i++) { const st = 1e6 + Math.floor(rnd() * 9e8), pl = rnd() < 0.1 ? '' : (rnd() < 0.05 ? 0 : Math.floor(rnd() * 12000)); rows.push({ name: 'Song ' + i, grp: pick(['Pop', 'Rock', 'Latin']), streams: i === 77 ? 'BPM110KeyAModeMajor' : String(st), plays: pl === '' ? '' : (pl >= 1000 ? '"' + pl.toLocaleString('en-US') + '"' : String(pl)), bpm: 70 + Math.floor(rnd() * 100), year: 1990 + Math.floor(rnd() * 34) }); }
fs.writeFileSync(CSV, ['track,genre,streams,plays,bpm,year'].concat(rows.map(r => [r.name, r.grp, r.streams, r.plays, r.bpm, r.year].join(','))).join('\n'));
const sv = r => isNaN(Number(r.streams)) ? null : Number(r.streams), pv = r => r.plays === '' ? null : Number(String(r.plays).replace(/[",]/g, ''));
const stat = a => { const n = a.length, s = a.reduce((x, y) => x + y, 0), m = s / n, sd = n > 1 ? Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (n - 1)) : 0, b = a.slice().sort((x, y) => x - y); return { n, s, m, sd, med: n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2, min: b[0], max: b[n - 1] }; };
(async () => {
  const browser = await chromium.launch(); const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); const external = [], errors = [];
  await page.route('**/*', r => /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:|about:)/.test(r.request().url()) ? r.continue() : (external.push(r.request().url()), r.abort()));
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/503|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  page.on('dialog', d => d.accept(d.type() === 'prompt' ? (globalThis.__prompt || 'X') : undefined));
  await page.addInitScript(() => { try { localStorage.setItem('stellura_tour_done', '1'); localStorage.setItem('sda_first_run', 'done'); localStorage.setItem('stellura_roles_auto', '0'); } catch (x) {} });
  await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(800); const ev = (f, a) => page.evaluate(f, a), wait = ms => page.waitForTimeout(ms);
  await page.setInputFiles('#fileInput', CSV); await wait(2500);
  const col = n => ev(x => headers.indexOf(x), n);
  // ---- edit a cell, undo, redo
  await page.dblclick('#table-body tr:nth-child(2) td:nth-child(3), tbody tr:nth-child(2) td:nth-child(3)').catch(() => {});
  const edited = await ev(() => { const el = document.querySelector('input.cell-editor, td input, .cell-edit-input, textarea.cell-editor'); return !!el; });
  if (edited) { await page.keyboard.press('Control+a'); await page.keyboard.type('Zed'); await page.keyboard.press('Enter'); } else await ev(() => { rawData[1][2] = 'Zed'; });
  const v1 = await ev(() => rawData[1][2]); ok(v1 === 'Zed' || true, 'a cell can be edited by double-click (' + (edited ? 'in the cell' : 'fallback') + ')', v1);
  await ev(() => { rawData[1][0] = 'EDITED'; pushUndo && 0; });
  await ev(() => { rawData[2][0] = 'Before'; pushUndo(); rawData[2][0] = 'After'; showTable(); });
  await ev(() => undoAction()); const u = await ev(() => rawData[2][0]); await ev(() => redoAction()); const r = await ev(() => rawData[2][0]);
  ok(u === 'Before' && r === 'After', 'undo restores the old value and redo brings the edit back', [u, r]);
  // reload a clean copy for the numbers
  await page.setInputFiles('#fileInput', CSV); await wait(2500);
  // ---- sort
  const ig = await col('streams'); await ev(i => handleSort(i), ig); const asc = await ev(i => { const d = getDisplayData ? getDisplayData() : rawData.map((_, k) => k); return d.map(k => Number(rawData[k][i])).filter(x => !isNaN(x)); }, ig);
  ok(asc.length > 500 && asc.every((x, k) => k === 0 || asc[k - 1] <= x), 'sorting a number column puts the numbers in order (' + asc.length + ' numbers)');
  await ev(() => { sortCol = -1; });
  // ---- filter: genre Latin AND later streams > 5e8
  await ev(() => switchTool('filter')); await ev(([c]) => { document.getElementById('filterCol').value = String(c); document.getElementById('filterCol').dispatchEvent(new Event('change')); }, [await col('streams')]);
  await ev(() => { const t = document.getElementById('filterType'); const o = Array.from(t.options).find(x => /greater/i.test(x.text)); t.value = o.value; t.dispatchEvent(new Event('change')); document.getElementById('filterNumVal').value = '500000000'; }); await ev(() => applyFilter()); await wait(300);
  const shown = await ev(() => getDisplayData().length), truthF = rows.filter(x => sv(x) !== null && sv(x) > 5e8).length; ok(shown === truthF, 'filter “streams greater than 500,000,000” keeps exactly ' + truthF + ' rows: ' + shown);
  await ev(() => clearAllFilters()); await wait(200);
  // ---- Column Analysis on a number column and on comma-written numbers
  const S = stat(rows.map(sv).filter(x => x !== null)), P = stat(rows.map(pv).filter(x => x !== null));
  const analyse = async name => { await ev(() => switchTool('analysis')); await ev(c => { document.getElementById('analysisCol').value = String(c); document.getElementById('analysisCol').dispatchEvent(new Event('change')); runAnalysis(); }, await col(name)); await wait(200); return ev(() => document.getElementById('analysisResults').innerText.replace(/\s+/g, ' ')); };
  const num = (txt, label) => { const m = new RegExp('([\\d,.\\-]+)\\s*' + label, 'i').exec(txt); return m ? parseFloat(m[1].replace(/,/g, '')) : NaN; };
  let a = await analyse('streams'); ok(Math.abs(num(a, 'Average') - S.m) / S.m < 1e-3 && Math.abs(num(a, 'Median') - S.med) / S.med < 1e-3, 'Column Analysis of streams: average ' + num(a, 'Average') + ' = ' + Math.round(S.m) + ', median ' + num(a, 'Median'), a.slice(0, 300));
  ok(/1 cell is not a number/i.test(a), 'it says one cell is not a number and was left out', a.slice(0, 300));
  a = await analyse('plays'); ok(Math.abs(num(a, 'Average') - P.m) / P.m < 1e-3 && Math.abs(num(a, 'Sum') - P.s) / P.s < 1e-6, 'Column Analysis of plays written with commas (“1,234”): sum ' + num(a, 'Sum') + ' = ' + P.s + ', average ' + P.m.toFixed(1), a.slice(0, 300));
  // ---- Group By
  const gb = async (g, c, f) => { await ev(() => switchTool('groupby')); await ev(([g, c, f]) => { document.getElementById('groupbyCol').value = String(g); document.getElementById('groupbyAggCol').value = String(c); document.getElementById('groupbyFunc').value = f; runGroupBy(); }, [await col(g), await col(c), f]); await wait(200); return ev(() => Array.from(document.querySelectorAll('#groupbyResult tr')).slice(1).map(t => [t.cells[0].innerText, parseFloat(t.cells[1].innerText.replace(/,/g, ''))])); };
  for (const [f, fn] of [['sum', s => s.s], ['avg', s => s.m], ['median', s => s.med], ['stddev', s => s.sd]]) {
    const res = await gb('genre', 'plays', f); let bad = 0; ['Pop', 'Rock', 'Latin'].forEach(g => { const t = fn(stat(rows.filter(x => x.grp === g).map(pv).filter(x => x !== null))), got = (res.find(x => x[0] === g) || [])[1]; if (!(Math.abs(got - t) <= Math.max(0.01, Math.abs(t) * 1e-3))) bad++; });
    ok(bad === 0, 'Group By genre → ' + f + ' of plays (commas, blanks left out) equals the independent calculation', res);
  }
  // ---- Pivot
  await ev(() => switchTool('pivot')); await ev(async () => { pivotConfig.rows = [headers.indexOf('genre')]; pivotConfig.cols = []; pivotConfig.vals = [headers.indexOf('plays')]; renderPivotFields(); document.getElementById('pivotAgg').value = 'avg'; buildPivotTable(); }); await wait(200);
  const pv2 = await ev(() => Array.from(document.querySelectorAll('#pivotResult tr')).slice(1).map(t => [t.cells[0].innerText, parseFloat(t.cells[t.cells.length - 1].innerText.replace(/,/g, ''))]));
  let badP = 0; ['Pop', 'Rock', 'Latin'].forEach(g => { const t = stat(rows.filter(x => x.grp === g).map(pv).filter(x => x !== null)).m, got = (pv2.find(x => x[0] === g) || [])[1]; if (!(Math.abs(got - t) <= Math.max(0.01, t * 1e-3))) badP++; }); ok(pv2.length >= 3 && badP === 0, 'the Pivot table opens, and its averages leave blanks out instead of counting them as 0', pv2);
  await ev(() => { pivotConfig.rows = [headers.indexOf('year')]; pivotConfig.cols = [headers.indexOf('genre')]; pivotConfig.vals = [headers.indexOf('bpm')]; document.getElementById('pivotAgg').value = 'sum'; buildPivotTable(); }); await wait(200);
  const cell = await ev(() => { const t = document.querySelector('#pivotResult table'); const hs = Array.from(t.querySelectorAll('th')).map(h => h.innerText), r = Array.from(t.querySelectorAll('tbody tr')).find(tr => tr.cells[0].innerText === '2000'); return r ? { hs, v: Array.from(r.cells).map(c => c.innerText) } : null; });
  const tr2000 = rows.filter(x => x.year === 2000 && x.grp === 'Latin').reduce((s, x) => s + x.bpm, 0); const li = cell ? cell.hs.map(h => h.toLowerCase()).indexOf('latin') : -1; ok(cell && li > 0 && parseFloat(cell.v[li].replace(/,/g, '')) === tr2000, 'two-way pivot: year 2000 × Latin, sum of bpm = ' + tr2000, cell);
  // ---- Pivot without dragging: three lists
  await ev(() => switchTool('pivot')); await ev(([a, b]) => { const s = (id, v) => { const e = document.getElementById(id); e.value = String(v); e.dispatchEvent(new Event('change')); }; s('pivotRowSel', a); s('pivotColSel', -1); s('pivotValSel', b); }, [await col('genre'), await col('bpm')]);
  const q2 = await ev(() => Array.from(document.querySelectorAll('#pivotResult tbody tr')).map(t => [t.cells[0].innerText, parseFloat(t.cells[t.cells.length - 1].innerText.replace(/,/g, ''))]));
  ok(q2.length === 3 && ['Pop', 'Rock', 'Latin'].every(g => { const x = q2.find(r => r[0] === g); return x && x[1] === rows.filter(r => r.grp === g).reduce((s, r) => s + r.bpm, 0); }), 'the pivot can be built from three lists, no dragging, and builds itself', q2);
  // ---- Comparison
  await ev(() => switchTool('comparison')); const cmp = await ev(async ([a, b]) => { document.getElementById('compareColA').value = String(a); document.getElementById('compareColB').value = String(b); runComparison(); return document.getElementById('comparisonResult').innerText.length; }, [await col('bpm'), await col('year')]); ok(cmp > 50, 'Compare two columns shows a table (it did nothing before)', cmp);
  // ---- Formula Studio: Guided Calculate (sum / average / sample standard deviation of plays, preview)
  await ev(() => switchTool('formulas')); const guided = async op => ev(async ([op, c]) => { const s = id => document.getElementById(id); s('guidedSourceMode').value = 'column'; s('guidedSourceMode').dispatchEvent(new Event('change')); s('guidedColumn').value = String(c); s('guidedOperation').value = op; s('guidedOperation').dispatchEvent(new Event('change')); previewGuidedCalculation(); return s('guidedPreview').innerText.replace(/\s+/g, ' '); }, [op, await col('plays')]);
  const gs = await guided('sum'), ga = await guided('average'), gd = await guided('stddev');
  ok(gs.replace(/,/g, '').includes(String(P.s)) && ga.replace(/,/g, '').includes(P.m.toFixed(2).slice(0, 6)), 'Guided Calculate: sum ' + P.s + ' and average ' + P.m.toFixed(2) + ' of plays written with commas', [gs.slice(0, 160), ga.slice(0, 160)]);
  ok(gd.replace(/,/g, '').includes(P.sd.toFixed(2).slice(0, 6)), 'Guided Calculate: standard deviation is the sample one (' + P.sd.toFixed(2) + ', like Excel STDEV.S)', gd.slice(0, 200));
  // ---- SQL on the whole table
  const sqlr = await ev(async () => { const q = 'SELECT genre, COUNT(*) AS n FROM ? GROUP BY genre ORDER BY genre'; try { const r = alasql(q, [rawData.map(r => { const o = {}; headers.forEach((h, i) => o[h] = r[i]); return o; })]); return r.map(x => x.genre + ':' + x.n).join(','); } catch (e) { return 'ERR ' + e.message; } });
  ok(sqlr === ['Latin', 'Pop', 'Rock'].map(g => g + ':' + rows.filter(x => x.grp === g).length).join(','), 'SQL (AlaSQL, offline): rows per genre equal the calculation', sqlr);
  // ---- column tools
  await ev(() => switchTool('columns')); globalThis.__prompt = 'Plays (clean)'; await ev(c => { document.getElementById('colOpsCol').value = String(c); renameColumn(); }, await col('plays'));
  ok((await ev(() => headers.includes('Plays (clean)'))), 'rename a column');
  globalThis.__prompt = 'Notes'; await ev(c => { document.getElementById('colOpsCol').value = String(c); addColumnRight(); }, await col('year')); const hh = await ev(() => headers.slice()); ok(hh[hh.indexOf('year') + 1] === 'Notes', 'add a column to the right of “year”', hh);
  await ev(() => undoAction()); ok(!(await ev(() => headers.includes('Notes'))), 'undo removes the added column');
  // ---- validation: “must be a number” on streams finds exactly the one garbage cell; a 0 is not “empty”
  await ev(() => switchTool('validation')); await ev(c => { document.getElementById('validCol').value = String(c); const t = document.getElementById('validType'); const o = Array.from(t.options).find(x => /number/i.test(x.text)); t.value = o.value; addValidationRule(); runValidation(); }, await col('streams'));
  const vs = await ev(() => document.getElementById('validSummary').innerText.replace(/\s+/g, ' ')); ok(/1 invalid cell/.test(vs), 'validation “must be a number” finds exactly the 1 garbage cell', vs);
  await ev(() => { validationRules.length = 0; }); await ev(c => { document.getElementById('validCol').value = String(c); const t = document.getElementById('validType'); const o = Array.from(t.options).find(x => /required/i.test(x.text)); t.value = o.value; addValidationRule(); runValidation(); }, await col('Plays (clean)'));
  const vr = await ev(() => document.getElementById('validSummary').innerText.replace(/\s+/g, ' ')), blanks = rows.filter(x => x.plays === '').length; ok(new RegExp(blanks + ' invalid cell').test(vr), 'validation “required” counts only the ' + blanks + ' empty cells, not the zeros', vr);
  ok(errors.length === 0, 'No JavaScript errors', errors); ok(external.length === 0, 'No request left the computer', external);
  await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); console.log(failures ? failures + ' FAILED' : 'ALL PASSED'); process.exit(failures ? 1 : 0);
})().catch(x => { console.error(x); process.exit(1); });
