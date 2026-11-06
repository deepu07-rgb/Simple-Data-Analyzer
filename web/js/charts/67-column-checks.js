// =====================================================================
//  HOW ARE THE COLUMNS BUILT?  /  कॉलम कैसे बने हैं?
//  Two things an analyst checks by hand before trusting a file:
//   - FORMULAS: a column that is calculated from others ("waste_adjusted_cost = total_cost ÷ (1 − waste/100)",
//     "cooling_rate = (75 − arrival_temp) ÷ transit_time"). Such a column adds no information and must not be
//     read as a cause.
//   - CAPS AND FLOORS: many rows sitting exactly on the highest (or lowest) value while the values just below are
//     rare ("17% of meals cost exactly Rp 15,000"): the real values beyond it are hidden.
//  Found on (a sample of) the rows; on a large file the engine then checks every finding on all rows.
//    STL.colChecks.formulas(rows, idx, headers, prof)  -> [{ t, a, b, op, c, k, share, n, text }]
//    STL.colChecks.caps(rows, idx, headers, prof)      -> [{ col, name, side, value, count, n, share, natural }]
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL = root.STL || {}, CC = STL.colChecks = {};
  function CH() { return STL.charts; }
  function s(v) { return v == null ? '' : String(v); }

  // the operations, as (a, b, c) -> value; the same list (by name) is checked by the engine on large files
  var OPS = {
    add: { f: function (a, b) { return a + b; }, sym: true, txt: function (A, B) { return A + ' + ' + B; } },
    sub: { f: function (a, b) { return a - b; }, txt: function (A, B) { return A + ' − ' + B; } },
    mul: { f: function (a, b) { return a * b; }, sym: true, txt: function (A, B) { return A + ' × ' + B; } },
    div: { f: function (a, b) { return b === 0 ? NaN : a / b; }, txt: function (A, B) { return A + ' ÷ ' + B; } },
    pctof: { f: function (a, b) { return a * b / 100; }, sym: true, txt: function (A, B) { return A + ' × ' + B + ' ÷ 100'; } },
    less: { f: function (a, b) { return a * (1 - b / 100); }, txt: function (A, B) { return A + ' × (1 − ' + B + ' ÷ 100)'; } },
    more: { f: function (a, b) { return a * (1 + b / 100); }, txt: function (A, B) { return A + ' × (1 + ' + B + ' ÷ 100)'; } },
    divless: { f: function (a, b) { return b === 100 ? NaN : a / (1 - b / 100); }, txt: function (A, B) { return A + ' ÷ (1 − ' + B + ' ÷ 100)'; } },
    share: { f: function (a, b) { return b === 0 ? NaN : a / b * 100; }, txt: function (A, B) { return A + ' ÷ ' + B + ' × 100'; } },
    cdiv: { f: function (a, b, c) { return b === 0 ? NaN : (c - a) / b; }, fitC: function (a, b, t) { return a + t * b; }, txt: function (A, B, c) { return '(' + c + ' − ' + A + ') ÷ ' + B; } },
    kdiv: { f: function (a, b, c) { return b === 0 ? NaN : c * a / b; }, fitC: function (a, b, t) { return a === 0 ? NaN : t * b / a; }, txt: function (A, B, c) { return A + ' × ' + c + ' ÷ ' + B; } },          // a rate per thousand: dwell ÷ (price ÷ 1,000)
    divp1: { f: function (a, b) { return a / (b + 1); }, txt: function (A, B) { return A + ' ÷ (' + B + ' + 1)'; } },                                                                       // revenue ÷ (competitors + 1): no division by zero
    divc: { f: function (a, b, c) { return b === 0 ? NaN : (a - c) / b; }, fitC: function (a, b, t) { return a - t * b; }, txt: function (A, B, c) { return '(' + A + ' − ' + c + ') ÷ ' + B; } },
    lin: { one: true, txt: function (A, B, c, k) { return (k === 1 ? A : A + ' × ' + num(k)) + (c ? (c > 0 ? ' + ' : ' − ') + num(Math.abs(c)) : ''); } }
  };
  CC.OPS = OPS;
  function num(v) { var C = CH(); return Math.abs(v) >= 1000 && C && C.indian ? C.indian(+v.toPrecision(10)) : String(+(+v).toPrecision(8)); }
  function roundC(v) { var a = Math.abs(v); if (!isFinite(v)) return v; var st = a >= 100 ? 1 : a >= 10 ? 0.1 : 0.01; var r = Math.round(v / st) * st; return Math.abs(r - Math.round(r)) < 1e-9 ? Math.round(r) : +r.toPrecision(10); }

  CC.numberCols = function (prof) {
    var C = CH();
    return prof.filter(function (p) { return p.numeric && !p.idLike && !p.coord && p.fill >= 0.9 && p.distinct >= 5; }).slice(0, 30);
  };
  function sampleIdx(idx, max) { if (idx.length <= max) return idx.slice(); var out = [], st = idx.length / max; for (var i = 0; i < max; i++) out.push(idx[Math.floor(i * st)]); return out; }
  function decimals(arr) { var d = 0; for (var i = 0; i < arr.length && i < 400; i++) { var v = arr[i]; if (!isFinite(v)) continue; var t = String(v), p = t.indexOf('.'); if (p >= 0) d = Math.max(d, Math.min(6, t.length - p - 1)); } return d; }
  // close enough, given that the column itself is rounded
  function near(pred, t, dT) { if (!isFinite(pred)) return false; return Math.abs(pred - t) <= 0.5 * Math.pow(10, -dT) * 1.01 + 0.002 * Math.abs(t) + 1e-9; }
  function median(a) { var b = a.filter(isFinite).sort(function (x, y) { return x - y; }); return b.length ? b[Math.floor(b.length / 2)] : NaN; }

  CC.formulas = function (rows, idx, headers, prof) {
    var C = CH(), cols = CC.numberCols(prof), S = sampleIdx(idx, 2000), V = {}, D = {};
    cols.forEach(function (p) { var a = new Float64Array(S.length); for (var i = 0; i < S.length; i++) { var v = C.num(rows[S[i]][p.index]); a[i] = v === null ? NaN : v; } V[p.index] = a; D[p.index] = decimals(a); });
    var nS = S.length, found = [], screen = Math.min(60, nS);
    function test(T, fn) {                                              // share of rows that fit; quick exit when it clearly fails
      var bad = 0, n = 0, t = V[T], d = D[T];
      for (var i = 0; i < nS; i++) { var tv = t[i]; if (!isFinite(tv)) continue; var pv = fn(i); if (!isFinite(pv)) continue; n++; if (!near(pv, tv, d)) { bad++; if (i < screen ? bad > 3 : bad > 0.02 * nS + 3) return null; } }
      return n >= Math.min(30, nS * 0.5) ? { share: (n - bad) / n, n: n } : null;
    }
    function varies(c) { var a = V[c], lo = Infinity, hi = -Infinity; for (var i = 0; i < nS; i++) if (isFinite(a[i])) { lo = Math.min(lo, a[i]); hi = Math.max(hi, a[i]); } return hi > lo; }
    var vcols = cols.filter(function (p) { return varies(p.index); });
    vcols.forEach(function (T) {
      var t = T.index;
      vcols.forEach(function (A) {
        var a = A.index; if (a === t) return;
        // a rescaled copy: T = k × A + c (k, c fitted from two far-apart rows, then checked on all)
        var lo = -1, hi = -1; for (var i = 0; i < nS; i++) { if (!isFinite(V[a][i]) || !isFinite(V[t][i])) continue; if (lo < 0 || V[a][i] < V[a][lo]) lo = i; if (hi < 0 || V[a][i] > V[a][hi]) hi = i; }
        if (lo >= 0 && V[a][hi] > V[a][lo]) {
          var k = (V[t][hi] - V[t][lo]) / (V[a][hi] - V[a][lo]), c0 = V[t][lo] - k * V[a][lo]; k = +k.toPrecision(6); c0 = roundC(c0);
          var r1 = k !== 0 ? test(t, function (i) { return k * V[a][i] + c0; }) : null;
          if (r1 && r1.share >= 0.98) found.push({ t: t, a: a, b: -1, op: 'lin', k: k, c: c0, share: r1.share, n: r1.n, d: D[t] });
        }
        vcols.forEach(function (B) {
          var b = B.index; if (b === t || b === a) return;
          Object.keys(OPS).forEach(function (op) {
            var O = OPS[op]; if (O.one || (O.sym && a > b)) return;
            var c = 0;
            if (O.fitC) { var cs = []; for (var i2 = 0; i2 < Math.min(nS, 200); i2++) if (isFinite(V[a][i2]) && isFinite(V[b][i2]) && isFinite(V[t][i2])) cs.push(O.fitC(V[a][i2], V[b][i2], V[t][i2])); c = roundC(median(cs)); if (!isFinite(c)) return; }
            var r = test(t, function (i) { return O.f(V[a][i], V[b][i], c); });
            if (r && r.share >= 0.95) found.push({ t: t, a: a, b: b, op: op, c: c, share: r.share, n: r.n, d: D[t] });
          });
        });
      });
    });
    // one relation per set of columns, said with the column that looks calculated on the left
    // which column of a relation is the calculated one: its name says so (estimate, ratio, adjusted ...); on a tie the
    // relation written as a product or a sum (revenue = price × cups) rather than as a quotient
    var DER = /adjusted|effective|ratio|per[_ ]|rate|index|share|pct|percent|score|multiplier|total|estimate|revenue|sales|margin/i, FORWARD = { add: 1, mul: 1, pctof: 1, less: 1, more: 1 };
    function sideScore(f) { return (DER.test(s(headers[f.t])) ? 2 : 0) + (FORWARD[f.op] ? 0.5 : 0) + f.t / 1000 - (f.op === 'lin' ? 0.5 : 0) - (f.op === 'kdiv' && f.c === 1 ? 0.3 : 0) + f.share; }
    var bySet = {};
    found.forEach(function (f) { var key = [f.t, f.a, f.b].filter(function (x) { return x >= 0; }).sort(function (x, y) { return x - y; }).join(','); if (!bySet[key] || sideScore(f) > sideScore(bySet[key])) bySet[key] = f; });
    var out = Object.keys(bySet).map(function (k) { return bySet[k]; });
    // a column already explained by a formula with fewer columns is not listed again with more
    out = out.filter(function (f) { return !(f.b >= 0 && out.some(function (g) { return g !== f && g.t === f.t && g.b < 0 && (g.a === f.a || g.a === f.b); })); });
    out.forEach(function (f) { f.text = CC.formulaText(f, headers); });
    return out.sort(function (x, y) { return y.share - x.share || x.t - y.t; });
  };
  CC.formulaText = function (f, headers) {
    var A = s(headers[f.a]), B = f.b >= 0 ? s(headers[f.b]) : '', O = OPS[f.op];
    return s(headers[f.t]) + ' = ' + (f.op === 'lin' ? O.txt(A, B, f.c, f.k) : O.txt(A, B, num(f.c)));
  };

  // caps and floors: many rows exactly on the end value, few just inside it
  CC.caps = function (rows, idx, headers, prof) {
    var C = CH(), out = [];
    prof.filter(function (p) { return p.numeric && !p.idLike && !p.coord && p.distinct >= 20; }).forEach(function (p) {
      var cnt = {}, n = 0; idx.forEach(function (i) { var v = C.num(rows[i][p.index]); if (v === null) return; n++; cnt[v] = (cnt[v] || 0) + 1; });
      var vals = Object.keys(cnt).map(Number).sort(function (a, b) { return a - b; }); if (vals.length < 20) return;
      [['max', vals.length - 1, -1], ['min', 0, 1]].forEach(function (sd) {
        var at = sd[1], v = vals[at], c = cnt[v], near5 = 0, m = 0;
        for (var q = 1; q <= 5; q++) { var w = vals[at + sd[2] * q]; if (w === undefined) break; near5 += cnt[w]; m++; }
        var avg = m ? near5 / m : 0;
        if (c >= Math.max(10, 0.005 * n) && c >= 5 * Math.max(avg, 1)) {
          var pctName = /percent|pct|%|rate|प्रतिशत/i.test(s(p.name));
          var nx = vals[at + sd[2]], rng = nx === undefined ? 0 : (sd[0] === 'max' ? nx - vals[0] : vals[vals.length - 1] - nx);
          // a code far outside every other value (365243 days employed, 9999, -999): not a limit that hides real values, but "not applicable" typed as a number
          var placeholder = !((pctName && (v === 100 || v === 0)) || (v === 0 && sd[0] === 'min')) && nx !== undefined && Math.abs(v - nx) > 3 * Math.max(rng, 1);
          out.push({ col: p.index, name: s(headers[p.index]), side: sd[0], value: v, count: c, n: n, share: c / n, natural: (pctName && (v === 100 || v === 0)) || (v === 0 && sd[0] === 'min'), placeholder: placeholder });
        }
      });
    });
    return out.sort(function (a, b) { return b.share - a.share; });
  };
  CC.capText = function (cp, hi) {
    var C = CH(), v = num(cp.value), pc = (Math.round(cp.share * 1000) / 10) + '%';
    if (cp.natural) return hi ? '“' + cp.name + '”: ' + C.indian(cp.count) + ' पंक्तियाँ (' + pc + ') ठीक ' + v + ' पर हैं — इसका ' + (cp.side === 'max' ? 'उच्चतम' : 'न्यूनतम') + ' संभव मान।'
                                : '“' + cp.name + '”: ' + C.indian(cp.count) + ' rows (' + pc + ') sit exactly at ' + v + ', its ' + (cp.side === 'max' ? 'highest' : 'lowest') + ' possible value.';
    if (cp.placeholder) return hi ? '“' + cp.name + '”: ' + C.indian(cp.count) + ' पंक्तियाँ (' + pc + ') में ' + v + ' है, जो बाकी सभी मानों से बहुत दूर है। यह कोड लगता है (“लागू नहीं”), असली संख्या नहीं; औसत और तुलना बिगाड़ता है।'
                                  : '“' + cp.name + '”: ' + C.indian(cp.count) + ' rows (' + pc + ') hold ' + v + ', far away from every other value. This looks like a code for “not applicable”, not a real number; it spoils averages and comparisons.';
    return hi ? '“' + cp.name + '” ' + v + ' पर ' + (cp.side === 'max' ? 'रुक जाता है' : 'से शुरू होता है') + ': ' + C.indian(cp.count) + ' पंक्तियाँ (' + pc + ') ठीक इसी मान पर हैं — एक ' + (cp.side === 'max' ? 'ऊपरी सीमा' : 'निचली सीमा') + '; इसके ' + (cp.side === 'max' ? 'ऊपर' : 'नीचे') + ' के असली मान छिपे हैं।'
              : '“' + cp.name + '” stops at ' + v + ': ' + C.indian(cp.count) + ' rows (' + pc + ') sit exactly on it — a ' + (cp.side === 'max' ? 'cap' : 'floor') + '; the real values ' + (cp.side === 'max' ? 'above' : 'below') + ' it are hidden.';
  };
  CC.formulaLine = function (f, hi) {
    var pc = f.share >= 0.9995 ? (hi ? 'हर पंक्ति में' : 'in every row') : (Math.floor(f.share * 1000) / 10) + (hi ? '% पंक्तियों में' : '% of rows');
    return f.text + '  (' + (hi ? 'सही ' : 'true ') + pc + (f.checkedOn ? (hi ? ', सभी ' + CH().indian(f.checkedOn) + ' पंक्तियाँ जाँचीं' : ', all ' + CH().indian(f.checkedOn) + ' rows checked') : '') + ')';
  };
  // a large file: copy in the engine's counts over every row
  CC.applyCheck = function (found, caps, res) {
    (res.formulas || []).forEach(function (r, k) { if (found[k]) { found[k].share = r.n ? r.ok / r.n : 0; found[k].checkedOn = r.n; } });
    (res.caps || []).forEach(function (r, k) { if (caps[k]) { caps[k].count = r.count; caps[k].n = r.n; caps[k].share = r.n ? r.count / r.n : 0; caps[k].checkedOn = r.n; } });
    return { formulas: found.filter(function (f) { return f.share >= 0.95; }), caps: caps.filter(function (c) { return c.count >= 10; }) };
  };
  CC.engineBody = function (found, caps) {
    return { formulas: found.map(function (f) { return { t: f.t, a: f.a, b: f.b, op: f.op, c: f.c || 0, k: f.k === undefined ? 1 : f.k, d: f.d === undefined ? 6 : f.d }; }), caps: caps.map(function (c) { return { col: c.col, value: c.value }; }) };
  };
})(typeof window !== 'undefined' ? window : globalThis);

// =====================================================================
//  The screen: a section for "What explains this?" and its own dialog (Ctrl+K)
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL, CC = STL.colChecks;
  if (!root.document || !STL.ui) return;
  var U = STL.ui, CH = STL.charts, T = U.T, esc = U.esc;
  function hi() { return typeof uiLanguage !== 'undefined' && uiLanguage === 'hi'; }
  function isBig() { return !!(root.BIG && BIG.active && BIG.ds); }
  // { formulas, caps } for the open file (a promise); on a large file found on the sample, checked on every row
  CC.run = function () {
    var H, rows, idx;
    if (isBig()) { var S = STL.bigCharts.sample; H = BIG.headers; rows = S.rows; idx = S.idx; }
    else { H = headers; rows = rawData; idx = typeof getDisplayData === 'function' ? getDisplayData() : rawData.map(function (_, i) { return i; }); }
    var prof = CH.profile(H, rows, idx.length > 20000 ? idx.filter(function (_, k) { return k % Math.ceil(idx.length / 20000) === 0; }) : idx);
    var f = CC.formulas(rows, idx, H, prof), c = CC.caps(rows, idx, H, prof);
    if (!isBig()) { f.forEach(function (x) { x.checkedOn = 0; }); return Promise.resolve({ formulas: f, caps: c, headers: H }); }
    if (!f.length && !c.length) return Promise.resolve({ formulas: f, caps: c, headers: H });
    return STL.bigCharts.api('/api/engine/' + BIG.ds + '/chart', Object.assign({ kind: 'column_checks' }, CC.engineBody(f, c), STL.bigCharts.scope())).then(function (res) { var r = CC.applyCheck(f, c, res); r.headers = H; return r; });
  };
  CC.html = function (res) {
    if (!res.formulas.length && !res.caps.length) return '<div class="big-note">' + esc(T('No column looks calculated from others, and no column stops at a cap.', 'कोई कॉलम दूसरों से गणना किया हुआ नहीं लगता, और किसी कॉलम पर सीमा नहीं दिखती।')) + '</div>';
    return (res.formulas.length ? '<div class="prj-sub dr-rule-h">🧮 ' + esc(T('Columns calculated from others (results, not causes)', 'दूसरे कॉलमों से गणना किए गए कॉलम (परिणाम, कारण नहीं)')) + '</div><ul class="cc-list">' + res.formulas.map(function (f) { return '<li>' + esc(CC.formulaLine(f, hi())) + '</li>'; }).join('') + '</ul>' : '') +
      (res.caps.length ? '<div class="prj-sub dr-rule-h">⛔ ' + esc(T('Caps and floors', 'ऊपरी और निचली सीमाएँ')) + '</div><ul class="cc-list">' + res.caps.map(function (c) { return '<li>' + esc(CC.capText(c, hi())) + (c.placeholder ? ' <button class="tb-btn cc-blank" data-col="' + c.col + '" data-val="' + esc(String(c.value)) + '">' + esc(T('Make them empty', 'इन्हें खाली करें')) + '</button>' : '') + '</li>'; }).join('') + '</ul>' : '');
  };
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.cc-blank'); if (!b) return; ['driversDialog', 'colChecksDialog'].forEach(function (id) { var d = document.getElementById(id); if (d) d.remove(); }); if (STL.blankValue) STL.blankValue(+b.dataset.col, b.dataset.val); });
  STL.openColumnChecks = function () {
    if (!isBig() && !U.hasData()) { toast(T('Open a file first, or try the sample data.', 'पहले फ़ाइल खोलें, या नमूना डेटा आज़माएँ।'), 'info'); return; }
    var o = U.overlay('colChecksDialog', '<div class="prj-h"><b>🧮 ' + T('How are the columns built?', 'कॉलम कैसे बने हैं?') + '</b><button id="ccX" aria-label="close">×</button></div><div class="big-note">' + T('Formulas between columns, and values where a column stops (a cap or a floor).', 'कॉलमों के बीच सूत्र, और वे मान जहाँ कोई कॉलम रुक जाता है (ऊपरी या निचली सीमा)।') + '</div><div id="ccOut"><div class="big-note">' + T('Checking…', 'जाँच हो रही है…') + '</div></div>', true);
    o.querySelector('.stl-box').classList.add('fr-box');
    document.getElementById('ccX').onclick = function () { o.remove(); };
    var go = function () { CC.run().then(function (res) { var el = document.getElementById('ccOut'); if (el) el.innerHTML = CC.html(res); }).catch(function (e) { var el = document.getElementById('ccOut'); if (el) el.innerHTML = '<div class="big-err">' + esc(e.message) + '</div>'; }); };
    if (isBig() && STL.bigCharts.sample.ds !== BIG.ds) STL.bigCharts.loadSample().then(go); else setTimeout(go, 20);
  };
  (STL.actions || []).push({ en: 'How are the columns built? (formulas, caps)', hi: 'कॉलम कैसे बने हैं? (सूत्र, सीमाएँ)', kw: 'formula calculated derived columns cap ceiling floor limit how built check', run: function () { STL.openColumnChecks(); }, group: 'Charts' });
})(typeof window !== 'undefined' ? window : globalThis);
