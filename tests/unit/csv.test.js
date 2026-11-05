const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./load');
const ctx = sandbox(['web/js/tasks/29-csv-parse.js']);
const parse = (t, s) => JSON.parse(JSON.stringify(ctx.STL.parseCsv(t, s)));

test('a quoted cell may contain a line break without tearing the row (the Zomato address bug)', () => {
  const t = 'ID,Name,Address,Rating\r\n1,"Cafe A","The Quayside\n60 Roberston Quay #01-13",4.5\r\n2,"Cafe B","Food Court, HUDA City Center Metro\n Station, Sector 29, Gurgaon",3.9\r\n3,Cafe C,Plain,4\r\n';
  const r = parse(t);
  assert.equal(r.length, 4);
  assert.deepEqual(r[1], ['1', 'Cafe A', 'The Quayside\n60 Roberston Quay #01-13', '4.5']);
  assert.equal(r[2][2], 'Food Court, HUDA City Center Metro\n Station, Sector 29, Gurgaon');
  assert.ok(r.every(x => x.length === 4), 'every record keeps all 4 fields');
});
test('commas, doubled quotes, BOM, CRLF / LF / CR and blank lines', () => {
  assert.deepEqual(parse('﻿a,b\n"x, y","say ""hi"""\n\n \r\nlast,1\r'), [['a', 'b'], ['x, y', 'say "hi"'], ['last', '1']]);
  assert.deepEqual(parse('a;b\n1;2', ';'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parse('a\tb\n"1\t2"\t3', '\t'), [['a', 'b'], ['1\t2', '3']]);
});
test('a stray quote inside text is just a character; empty and Hindi cells survive', () => {
  assert.deepEqual(parse('नाम,आकार,टिप्पणी\nराहुल,5" पाइप,\n"प्रिया ""सिंह""",,ठीक'), [['नाम', 'आकार', 'टिप्पणी'], ['राहुल', '5" पाइप', ''], ['प्रिया "सिंह"', '', 'ठीक']]);
});
test('an unfinished quote at the end of the file does not lose the data or hang', () => {
  assert.deepEqual(parse('a,b\n1,"never closed\nstill text'), [['a', 'b'], ['1', 'never closed\nstill text']]);
  assert.deepEqual(parse(''), []);
});
test('a quarter-million-row file is read quickly', () => {
  let s = 'a,b,c\n'; for (let i = 0; i < 250000; i++) s += i + ',"x, y",z\n';
  const t0 = Date.now(), r = ctx.STL.parseCsv(s, ','); assert.equal(r.length, 250001); assert.ok(Date.now() - t0 < 4000, 'took ' + (Date.now() - t0));
});

test('damaged letters (U+FFFD) are counted so the user can be told', () => {
  assert.equal(ctx.STL.countDamaged([['S��o Paulo', 'ok'], ['Bras�_lia', 'x'], [3, null]]), 2);
  assert.equal(ctx.STL.countDamaged([['सही', 'text']]), 0);
});
