const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./load');

const ctx = sandbox(['web/js/tasks/30-messy-file-fixer.js', 'web/js/tasks/31-merge-anything.js']);
const M = ctx.STL.merge, F = ctx.STL.fix;
const plain = x => JSON.parse(JSON.stringify(x));
const sc = (a, b) => M.score(a, b).score;

test('names are normalised (case, punctuation, Hindi digits, spaces)', () => {
  assert.equal(M.normalize('  P.S.  Name '), 'p s name');
  assert.equal(M.normalize('Police_Station-Name'), 'police station name');
  assert.equal(M.normalize('क्र.सं.'), 'क्र सं');
});

test('office glossary joins Hindi, English and abbreviations', () => {
  for (const [a, b] of [['थाना', 'Police Station'], ['PS Name', 'थाने का नाम'], ['जिला', 'District'], ['दिनांक', 'Date'], ['क्र.सं.', 'S.No'],
                        ['मोबाइल नंबर', 'Phone'], ['पिता का नाम', "Father's Name"], ['एफआईआर संख्या', 'FIR No']]) {
    assert.ok(sc(a, b) >= 0.9, `${a} ~ ${b} = ${sc(a, b)}`);
  }
});

test('different meanings are never joined, even when the spelling is close', () => {
  assert.equal(sc('पुरुष', 'महिला'), 0);
  assert.equal(sc('Male', 'Female'), 0);
  assert.equal(sc('Amount', 'Total'), 0);
  assert.equal(sc('Registered', 'Pending'), 0);
  assert.ok(sc('Case Registered', 'Case Pending') < 0.9);          // not in the glossary: must not be auto-matched
});

test('spelling similarity finds near-identical names, flags weaker ones for review', () => {
  assert.ok(sc('Police Stations', 'Police Station') >= 0.9);
  assert.ok(sc('Beneficiary Mobile', 'Mobile') >= 0.7 && sc('Beneficiary Mobile', 'Mobile') < 0.9 || sc('Beneficiary Mobile', 'Mobile') >= 0.9);
  assert.ok(sc('Remarks', 'Salary') < 0.5);
});

test('a number column does not become a text column', () => {
  const r = M.score('Code', 'Code', ['1', '2', '3'], ['abc', 'def', 'ghi']);
  assert.ok(r.score < 0.5);
  assert.ok(M.score('Code', 'Code', ['1', '2'], ['3', '4']).score === 1);
});

const A = { name: 'जयपुर.xlsx', headers: ['क्र.सं.', 'थाना', 'दर्ज', 'लंबित'], rows: [['1', 'कोतवाली', '10', '2'], ['2', 'सांगानेर', '7', '1']] };
const B = { name: 'जोधपुर.xlsx', headers: ['S.No', 'Police Station', 'Registered', 'Pending', 'Remarks'], rows: [['1', 'सरदारपुरा', '8', '3', 'ok']] };
const C = { name: 'कोटा.csv', headers: ['थाने का नाम', 'लंबित', 'पंजीकृत', 'क्रमांक'], rows: [['विज्ञान नगर', '1', '4', '1']] };

test('plan: columns are matched across files in any order, extra columns are appended', () => {
  const p = plain(M.plan([A, B, C]));
  assert.deepEqual(p.headers, ['क्र.सं.', 'थाना', 'दर्ज', 'लंबित', 'Remarks']);
  const mapB = p.maps[1].map(m => [m.src, m.tgt]);
  assert.deepEqual(mapB, [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]]);
  assert.deepEqual(p.maps[2].map(m => [m.src, m.tgt]), [[0, 1], [1, 3], [2, 2], [3, 0]]);
  assert.ok(p.maps[1].every(m => m.level === 'auto' || m.level === 'new'));
});

test('build: rows are aligned, source column added, report counts', () => {
  const plan = M.plan([A, B, C]);
  const r = plain(M.build([A, B, C], plan, { sourceColumn: 'Source file' }));
  assert.deepEqual(r.headers, ['क्र.सं.', 'थाना', 'दर्ज', 'लंबित', 'Remarks', 'Source file']);
  assert.deepEqual(r.rows, [
    ['1', 'कोतवाली', '10', '2', '', 'जयपुर.xlsx'], ['2', 'सांगानेर', '7', '1', '', 'जयपुर.xlsx'],
    ['1', 'सरदारपुरा', '8', '3', 'ok', 'जोधपुर.xlsx'], ['1', 'विज्ञान नगर', '4', '1', '', 'कोटा.csv']]);
  assert.equal(r.report.rows, 4);
  assert.deepEqual(r.report.files.map(f => f.rows), [2, 1, 1]);
});

test('build: duplicate rows across files can be dropped and are counted', () => {
  const d1 = { name: 'a', headers: ['नाम', 'राशि'], rows: [['राम', '1'], ['श्याम', '2']] };
  const d2 = { name: 'b', headers: ['Name', 'Amount'], rows: [['श्याम', '2'], ['मोहन', '3']] };
  const r = plain(M.build([d1, d2], M.plan([d1, d2]), { dropDuplicates: true }));
  assert.equal(r.rows.length, 3); assert.equal(r.report.duplicates, 1);
});

test('plan: unrelated headers stay separate columns instead of being forced together', () => {
  const x = { name: 'x', headers: ['नाम', 'वेतन'], rows: [['राम', '100']] };
  const y = { name: 'y', headers: ['योजना', 'लाभार्थी'], rows: [['क', 'ख']] };
  const p = plain(M.plan([x, y]));
  assert.deepEqual(p.headers, ['नाम', 'वेतन', 'योजना', 'लाभार्थी']);
});

test('plan: an empty column is skipped', () => {
  const x = { name: 'x', headers: ['नाम', '', 'राशि'], rows: [['राम', '', '1']] };
  const p = plain(M.plan([x]));
  assert.deepEqual(p.headers, ['नाम', 'राशि']);
});

test('parseDelimited: quotes, embedded commas and newlines, BOM, semicolons, tabs', () => {
  assert.deepEqual(plain(M.parseDelimited('﻿नाम,पता\n"राम, शर्मा","जयपुर\nराजस्थान"\n"उद्धरण ""x"""," "\n')),
                   [['नाम', 'पता'], ['राम, शर्मा', 'जयपुर\nराजस्थान'], ['उद्धरण "x"', ' ']]);
  assert.deepEqual(plain(M.parseDelimited('a;b\n1;2\n\n3;4')), [['a', 'b'], ['1', '2'], ['3', '4']]);
  assert.deepEqual(plain(M.parseDelimited('a\tb\r\n1\t2\r\n')), [['a', 'b'], ['1', '2']]);
});

test('whole pipeline: three messy district files are cleaned, then merged', () => {
  const mk = (title, hdr, rows, extra) => [[title, '', '', ''], ['', '', '', ''], hdr, ...rows, ...(extra || [])];
  const f1 = mk('जयपुर जिला — अक्टूबर 2026', ['क्र.सं.', 'थाना', 'दर्ज', 'लंबित'], [['1', 'कोतवाली', '10', '2'], ['2', 'सांगानेर', '7', '1'], ['3', 'मानसरोवर', '5', '0'], ['4', 'बगरू', '4', '1']], [['कुल', '', '26', '4']]);
  const f2 = [['Police Station', 'Registered', 'Pending', 'S.No'], ['सरदारपुरा', '8', '3', '1'], ['उम्मेद', '5', '1', '2'], ['प्रताप', '3', '0', '3'], ['Police Station', 'Registered', 'Pending', 'S.No'], ['शास्त्री', '2', '2', '4']];
  const f3 = mk('कोटा', ['थाने का नाम', 'लंबित', 'पंजीकृत', 'क्रमांक'], [['विज्ञान नगर', '1', '4', '1'], ['नयापुरा', '0', '2', '2'], ['दादाबाड़ी', '2', '6', '3'], ['रामगंज', '1', '3', '4']]);
  const files = [['jaipur.xlsx', f1], ['jodhpur.csv', f2], ['kota.xlsx', f3]].map(([name, g]) => {
    const cleaned = plain(F.apply(F.prepare(g[0], g.slice(1)), ['headerRow', 'twoRowHeader', 'blanks', 'repeatedHeaders', 'totalRows', 'whitespace']).grid);
    return { name, headers: cleaned[0], rows: cleaned.slice(1) };
  });
  assert.equal(files[0].rows.length, 4);              // title rows and the total row are gone
  assert.equal(files[1].rows.length, 4);              // repeated header row is gone
  const plan = M.plan(files), out = plain(M.build(files, plan, { sourceColumn: 'Source' }));
  assert.equal(out.rows.length, 12);
  assert.equal(out.headers.length, 5);
  const col = h => out.headers.indexOf(h);
  const reg = out.rows.filter(r => r[col('Source')] === 'kota.xlsx').map(r => r[col('दर्ज')] || r[col('पंजीकृत')]);
  assert.deepEqual(reg, ['4', '2', '6', '3']);        // Kota's "पंजीकृत" landed in the "दर्ज" column
});
