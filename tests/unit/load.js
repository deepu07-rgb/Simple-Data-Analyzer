// Loads Stellura's browser modules into a plain Node sandbox so pure logic can be unit-tested.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');

function sandbox(files) {
  const ctx = vm.createContext({ console, Math, Date, Number, String, Array, Object, JSON, RegExp, Set, Map, parseFloat, parseInt, isNaN, isFinite, Intl });
  ctx.globalThis = ctx; ctx.window = ctx;
  // Hindi font converters live in the main script; they are plain functions, so load just that section
  const krutiSrc = fs.readFileSync(path.join(ROOT, 'web/js/app/17-export-pdf-excel.js'), 'utf8');
  const a = krutiSrc.indexOf('function detectEncoding'), b = krutiSrc.indexOf('function checkHindiEncodingInData');
  vm.runInContext(krutiSrc.slice(a, b), ctx);
  (files || []).forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
  return ctx;
}
module.exports = { sandbox, ROOT };
