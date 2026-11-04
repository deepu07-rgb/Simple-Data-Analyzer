// =====================================================================
//  REPORT AUTOPILOT  /  रिपोर्ट ऑटोपायलट
//  Show it last month's FILLED proforma and last month's data once. It works out which calculation
//  produced every cell (count of rows per district, how many were pending, total amount, an average,
//  a percentage of two other columns, the total row ...), proves each rule against last month's numbers,
//  and then fills the same proforma from this month's data.
//
//    STL.auto.learn(template, data)       template = { rows:[[value,...]], formulas:[[r,c],...] }
//                                         data     = { headers, rows }
//    STL.auto.apply(rules, data2, tmpl)   -> { values:[{r,c,value,old,delta}], warnings, summary }
//
//  Rules are explainable ("Count of rows where Status = लंबित, for each police station") and every
//  rule reports how many of last month's cells it reproduced. Nothing is guessed silently.
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL = root.STL || {};
  var A = STL.auto = {};
  function s(v) { return v == null ? '' : String(v); }
  function blank(v) { return s(v).trim() === ''; }
  function gkey(v) { return s(v).normalize('NFC').replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function pnum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var F = STL.fix && STL.fix.util; if (F) return F.parseNumber(v);
    var t = s(v).replace(/,/g, '').trim(); return t === '' || isNaN(Number(t)) ? null : Number(t);
  }
  var TOTAL_RE = /^(?:grand\s*|sub\s*|g\.?\s*)?total\b|^(?:कुल|योग|जोड़|महायोग|उप\s*योग)(?:\s|$|:)/i;
  function isTotalLabel(v) { return TOTAL_RE.test(s(v).trim()); }
  var MAXCAT = 25;                                                      // filters only on columns with few distinct values

  // ------------------------------------------------------------ prepare data once
  function prepData(data) {
    var n = data.rows.length, cols = data.headers.map(function (h, i) {
      var raw = new Array(n), nums = new Array(n), nn = 0, np = 0, distinct = {}, nd = 0, code = 0;
      for (var r = 0; r < n; r++) {
        var v = data.rows[r][i]; raw[r] = v;
        if (blank(v)) { nums[r] = null; continue; }
        nn++; var x = pnum(v); nums[r] = x; if (x !== null) np++;
        var t = s(v).trim(); if (/^0\d+$/.test(t) || /^\d{10,}$/.test(t)) code++;
        var k = gkey(v); if (nd <= 5000 && !distinct[k]) { distinct[k] = s(v).trim(); nd++; }
      }
      return { i: i, name: s(h), raw: raw, nums: nums, numeric: nn > 0 && np / nn >= 0.8 && code / nn < 0.3, cat: nd >= 1 && nd <= 5000, distinct: distinct, nd: nd, filled: nn };
    });
    return { n: n, cols: cols, headers: data.headers.map(s) };
  }

  // ------------------------------------------------------------ descriptions
  function describe(rule, groupName) {
    var g = groupName, f = rule.filter;
    var fe = f ? ' where ' + f.colName + ' = ' + f.value : '', fh = f ? ' जहाँ ' + f.colName + ' = ' + f.value : '';
    switch (rule.type) {
      case 'count': return { en: 'Number of rows' + fe + ', for each ' + g, hi: 'पंक्तियों की संख्या' + fh + ', हर ' + g + ' के लिए' };
      case 'distinct': return { en: 'Number of different ' + rule.colName + fe + ', for each ' + g, hi: 'अलग-अलग ' + rule.colName + ' की संख्या' + fh + ', हर ' + g + ' के लिए' };
      case 'sum': return { en: 'Total of ' + rule.colName + fe + ', for each ' + g, hi: rule.colName + ' का योग' + fh + ', हर ' + g + ' के लिए' };
      case 'avg': return { en: 'Average of ' + rule.colName + fe + ', for each ' + g, hi: rule.colName + ' का औसत' + fh + ', हर ' + g + ' के लिए' };
      case 'min': return { en: 'Smallest ' + rule.colName + fe + ', for each ' + g, hi: 'न्यूनतम ' + rule.colName + fh + ', हर ' + g + ' के लिए' };
      case 'max': return { en: 'Largest ' + rule.colName + fe + ', for each ' + g, hi: 'अधिकतम ' + rule.colName + fh + ', हर ' + g + ' के लिए' };
      case 'derived': {
        var o = { add: ['+', 'जोड़'], sub: ['−', 'घटा'], pct: ['÷ × 100', 'का प्रतिशत'], ratio: ['÷', 'भाग'] }[rule.op];
        return { en: rule.aName + ' ' + o[0] + ' ' + rule.bName, hi: rule.aName + ' ' + o[1] + ' ' + rule.bName };
      }
    }
    return { en: rule.type, hi: rule.type };
  }

  // ------------------------------------------------------------ measures
  // one pass: for every row, update every (filter, measure) bucket of its group
  function aggregate(P, groupCol, groupIndex, wantFilters) {
    var G = Object.keys(groupIndex).length, numCols = P.cols.filter(function (c) { return c.numeric && c.i !== groupCol; });
    var catCols = P.cols.filter(function (c) { return c.cat && c.nd >= 1 && c.nd <= MAXCAT && c.i !== groupCol; });
    function bucket() { var o = { n: 0 }; numCols.forEach(function (c) { o['s' + c.i] = new Float64Array(G); o['c' + c.i] = new Float64Array(G); o['mn' + c.i] = new Float64Array(G).fill(Infinity); o['mx' + c.i] = new Float64Array(G).fill(-Infinity); }); o.cnt = new Float64Array(G); return o; }
    var all = bucket(), filt = {};                                       // filt["colIdx|valueKey"] = bucket
    var distinctSets = {};                                               // distinct counts (no filter) for categorical columns
    P.cols.forEach(function (c) { if (c.cat && c.i !== groupCol && c.nd <= 5000) distinctSets[c.i] = new Array(G); });
    var gc = P.cols[groupCol];
    for (var r = 0; r < P.n; r++) {
      var gi = groupIndex[gkey(gc.raw[r])]; if (gi === undefined) continue;
      add(all, r, gi);
      if (wantFilters) catCols.forEach(function (c) {
        if (blank(c.raw[r])) return;
        var k = c.i + '|' + gkey(c.raw[r]); var b = filt[k]; if (!b) { b = filt[k] = bucket(); b.col = c.i; b.value = s(c.raw[r]).trim(); }
        add(b, r, gi);
      });
      for (var ci in distinctSets) { var v = P.cols[ci].raw[r]; if (blank(v)) continue; var set = distinctSets[ci][gi] || (distinctSets[ci][gi] = {}); set[gkey(v)] = 1; }
    }
    function add(b, r, gi) {
      b.cnt[gi]++;
      for (var k = 0; k < numCols.length; k++) { var c = numCols[k], x = c.nums[r]; if (x === null) continue; b['s' + c.i][gi] += x; b['c' + c.i][gi]++; if (x < b['mn' + c.i][gi]) b['mn' + c.i][gi] = x; if (x > b['mx' + c.i][gi]) b['mx' + c.i][gi] = x; }
    }
    return { all: all, filt: filt, numCols: numCols, G: G, distinct: distinctSets };
  }
  // value of a rule for group index gi from an aggregate (null if the group has no rows)
  function valueFrom(agg, rule, gi) {
    var b = rule.filter ? agg.filt[rule.filter.col + '|' + gkey(rule.filter.value)] : agg.all;
    if (!b) return rule.type === 'count' || rule.type === 'sum' || rule.type === 'distinct' ? 0 : null;
    var cnt = b.cnt[gi];
    switch (rule.type) {
      case 'count': return cnt;
      case 'distinct': { if (rule.filter) return null; var set = agg.distinct[rule.col] && agg.distinct[rule.col][gi]; return set ? Object.keys(set).length : 0; }
      case 'sum': return b['s' + rule.col] ? b['s' + rule.col][gi] : null;
      case 'avg': return b['c' + rule.col] && b['c' + rule.col][gi] > 0 ? b['s' + rule.col][gi] / b['c' + rule.col][gi] : null;
      case 'min': return b['c' + rule.col] && b['c' + rule.col][gi] > 0 ? b['mn' + rule.col][gi] : null;
      case 'max': return b['c' + rule.col] && b['c' + rule.col][gi] > 0 ? b['mx' + rule.col][gi] : null;
    }
    return null;
  }
  // a cell matches when it equals the computed value rounded the way the proforma shows it (dec decimals)
  function close(a, b, dec) {
    if (a === null || b === null || a === undefined || b === undefined) return false;
    return Math.abs(a - b) <= 0.5 * Math.pow(10, -dec) + 1e-9;
  }
  // Excel-style rounding: 34.45 -> 34.5 (plain Math.round(v * 10) / 10 gives 34.4 because of binary floating point)
  function roundHalfUp(v, d) {
    var sign = v < 0 ? -1 : 1, a = Math.abs(v), t = String(a);
    if (t.indexOf('e') >= 0) { var f = Math.pow(10, d); return sign * Math.round(a * f) / f; }
    return sign * Number(Math.round(Number(t + 'e' + d)) + 'e-' + d);
  }
  A.roundHalfUp = roundHalfUp;
  function decimals(x) { var t = String(x); var i = t.indexOf('.'); return i < 0 ? 0 : Math.min(4, t.length - i - 1); }

  // ------------------------------------------------------------ learn
  A.learn = function (template, data, opts) {
    opts = opts || {};
    var T = template.rows, formula = {};
    (template.formulas || []).forEach(function (rc) { formula[rc[0] + ',' + rc[1]] = 1; });
    var P = prepData(data), result = { ok: false, warnings: [], cols: [], skipped: [], rows: [], totalRow: null };
    var maxC = 0; T.forEach(function (r) { if (r.length > maxC) maxC = r.length; });
    function cell(r, c) { return T[r] ? T[r][c] : null; }
    function isNumCell(r, c) { var v = cell(r, c); return !formula[r + ',' + c] && v !== null && v !== undefined && v !== '' && pnum(v) !== null && !(typeof v === 'string' && /[^\d\s.,\-+()₹/A-Za-zऀ-ॿ]/.test(v)); }

    // 1. which template column holds the row labels, and which data column they are values of
    var best = null;
    for (var c = 0; c < maxC; c++) {
      var labels = [];
      for (var r = 0; r < T.length; r++) { var v = cell(r, c); if (typeof v === 'string' && !blank(v) && pnum(v) === null && !isTotalLabel(v)) labels.push({ r: r, k: gkey(v), v: s(v).trim() }); }
      if (labels.length < 3) continue;
      P.cols.forEach(function (g) {
        if (!g.cat || g.numeric || g.nd < 2) return;
        var seen = {}, hit = 0; labels.forEach(function (l) { if (g.distinct[l.k] !== undefined && !seen[l.k]) { seen[l.k] = 1; hit++; } });
        if (hit < 3 || hit / labels.length < 0.5) return;
        var score = hit - 0.0001 * g.nd;
        if (!best || score > best.score) best = { labelCol: c, group: g, labels: labels, hit: hit, score: score };
      });
    }
    if (!best) { result.error = 'labels'; return result; }
    var g = best.group, seenRow = {}, rowOf = [];
    best.labels.forEach(function (l) { if (g.distinct[l.k] !== undefined) { if (seenRow[l.k]) { result.warnings.push({ kind: 'duplicate-label', label: l.v }); return; } seenRow[l.k] = 1; rowOf.push({ r: l.r, key: l.k, label: l.v }); } });
    result.labelCol = best.labelCol; result.group = { col: g.i, name: g.name }; result.rows = rowOf;
    for (var r2 = T.length - 1; r2 >= 0; r2--) { if (isTotalLabel(cell(r2, best.labelCol))) { result.totalRow = r2; break; } }
    var firstRow = Math.min.apply(null, rowOf.map(function (x) { return x.r; }));

    // 2. aggregates for every candidate measure, per group
    var groupIndex = {}, gk = []; rowOf.forEach(function (x, i) { groupIndex[x.key] = i; gk.push(x.key); });
    var agg = aggregate(P, g.i, groupIndex, true);

    // candidate rules
    var cands = [];
    function cand(rule, complexity) { rule.complexity = complexity; cands.push(rule); }
    cand({ type: 'count' }, 1);
    P.cols.forEach(function (c) { if (c.i !== g.i && c.cat && c.nd >= 2 && !c.numeric) cand({ type: 'distinct', col: c.i, colName: c.name }, 2); });
    agg.numCols.forEach(function (c) { ['sum', 'avg', 'max', 'min'].forEach(function (t, k) { cand({ type: t, col: c.i, colName: c.name }, 2 + k * 0.1); }); });
    Object.keys(agg.filt).forEach(function (k) {
      var b = agg.filt[k], colName = P.cols[b.col].name, f = { col: b.col, colName: colName, value: b.value };
      cand({ type: 'count', filter: f }, 3);
      agg.numCols.forEach(function (c) { if (c.i !== b.col) ['sum', 'avg'].forEach(function (t) { cand({ type: t, col: c.i, colName: c.name, filter: f }, 4); }); });
    });

    // 3. every numeric template column: find the rule that reproduces last month's cells
    var tmplCols = [];
    for (var cc = 0; cc < maxC; cc++) {
      if (cc === best.labelCol) continue;
      var n = 0; rowOf.forEach(function (x) { if (isNumCell(x.r, cc)) n++; });
      if (n >= 2) tmplCols.push(cc);
    }
    function headerText(c) {
      var parts = []; for (var r = firstRow - 1; r >= Math.max(0, firstRow - 3); r--) { var v = cell(r, c); if (typeof v === 'string' && !blank(v) && pnum(v) === null) parts.unshift(s(v).trim()); else if (parts.length) break; }
      return parts.join(' / ') || ('Column ' + (c + 1));
    }
    var M = STL.merge;
    function affinity(rule, header) {
      if (!M || !M.score) return 0;
      var a = 0, names = [];
      if (rule.filter) { names.push(rule.filter.value); }
      if (rule.colName) names.push(rule.colName);
      names.forEach(function (nm) { a = Math.max(a, M.score(header, nm).score); });
      if (rule.type === 'count' && !rule.filter) a = Math.max(a, M.score(header, 'registered').score * 0.9, M.score(header, 'total').score * 0.8);
      if (rule.type === 'count' && rule.filter) a = Math.max(a, 0);
      return a;
    }
    var valuesByCol = {};                                                // template values (by col) for derived rules
    tmplCols.forEach(function (c) {
      var rows = rowOf.filter(function (x) { return isNumCell(x.r, c); }), tv = rows.map(function (x) { return pnum(cell(x.r, c)); });
      valuesByCol[c] = { rows: rows, tv: tv };
      var dec = Math.max.apply(null, tv.map(decimals)), isInt = dec === 0, distinctV = {}; tv.forEach(function (x) { distinctV[x] = 1; });
      if (tv.length >= 3 && tv.every(function (x, i) { return x === i + 1; })) { result.cols.push({ c: c, header: headerText(c), serial: true, of: rows.length }); return; }     // 1, 2, 3 ... row numbers
      var informative = Object.keys(distinctV).length > 1;
      var hdr = headerText(c), scored = [];
      cands.forEach(function (rule) {
        var m = 0;
        for (var i = 0; i < rows.length; i++) { var gi = groupIndex[rows[i].key], val = valueFrom(agg, rule, gi); if (close(tv[i], val, dec)) m++; }
        if (m / rows.length >= 0.9) scored.push({ rule: rule, matched: m, of: rows.length, aff: affinity(rule, hdr) });
      });
      scored.sort(function (a, b) { return b.matched / b.of - a.matched / a.of || b.aff - a.aff || a.rule.complexity - b.rule.complexity; });
      var colInfo = { c: c, header: hdr, of: rows.length, dec: dec, integer: isInt, informative: informative };
      if (scored.length) {
        var top = scored[0], ambiguous = scored.length > 1 && scored[1].matched === top.matched && Math.abs(scored[1].aff - top.aff) < 0.2 && (scored[1].rule.type !== top.rule.type || JSON.stringify(scored[1].rule.filter) !== JSON.stringify(top.rule.filter) || scored[1].rule.col !== top.rule.col);
        colInfo.rule = top.rule; colInfo.matched = top.matched;
        colInfo.confidence = !informative ? 'low' : (ambiguous && top.aff < 0.7 ? 'check' : 'high');
        colInfo.alts = scored.slice(0, 5).map(function (x) { return { rule: x.rule, matched: x.matched, desc: describe(x.rule, g.name) }; });
        colInfo.desc = describe(top.rule, g.name);
      }
      result.cols.push(colInfo);
    });

    // 4. columns built from other columns: A + B, A - B, A / B * 100, A / B
    result.cols.forEach(function (ci) {
      if (ci.rule || ci.serial) return;
      var mine = valuesByCol[ci.c], found = null;
      result.cols.forEach(function (a) {
        if (found || !a.rule || a.c === ci.c) return;
        result.cols.forEach(function (b) {
          if (found || !b.rule || b.c === ci.c) return;
          ['add', 'sub', 'pct', 'ratio'].forEach(function (op) {
            if (found || (op === 'add' && b.c < a.c)) return;
            var m = 0, tried = 0;
            mine.rows.forEach(function (x, i) {
              var av = pnum(cell(x.r, a.c)), bv = pnum(cell(x.r, b.c)); if (av === null || bv === null) return; tried++;
              var val = op === 'add' ? av + bv : op === 'sub' ? av - bv : (bv === 0 ? null : (op === 'pct' ? av / bv * 100 : av / bv));
              if (close(mine.tv[i], val, ci.dec)) m++;
            });
            if (tried >= 2 && m / mine.rows.length >= 0.9 && ci.informative) found = { rule: { type: 'derived', op: op, a: a.c, b: b.c, aName: a.header, bName: b.header, complexity: 5 }, matched: m };
          });
        });
      });
      if (found) { ci.rule = found.rule; ci.matched = found.matched; ci.confidence = 'high'; ci.desc = describe(found.rule, g.name); ci.alts = []; }
    });

    // 5. the total row
    if (result.totalRow !== null) {
      result.cols.forEach(function (ci) {
        if (!ci.rule) return;
        var tv = cell(result.totalRow, ci.c); if (formula[result.totalRow + ',' + ci.c]) { ci.total = { type: 'formula' }; return; }
        var t = pnum(tv); if (t === null) return;
        ci.dec = Math.max(ci.dec, decimals(t));                          // the total cell may show more decimals than the rows
        var vals = valuesByCol[ci.c] ? valuesByCol[ci.c].tv : [], sum = vals.reduce(function (a, b) { return a + b; }, 0);
        if (close(t, sum, ci.dec) && (ci.rule.type === 'count' || ci.rule.type === 'sum' || ci.rule.type === 'distinct' || ci.rule.type === 'derived' && ci.rule.op === 'add')) { ci.total = { type: 'sum' }; return; }
        if (ci.rule.type === 'derived') { ci.total = { type: 'derived' }; return; }
        // the same measure over ALL rows (e.g. overall average)
        var overall = overallValue(P, ci.rule);
        if (overall !== null && close(t, overall, ci.dec)) ci.total = { type: 'overall' };
      });
    }
    result.ok = result.cols.some(function (x) { return x.rule; });
    result.unmatched = result.cols.filter(function (x) { return !x.rule && !x.serial; }).map(function (x) { return x.header; });
    result.template = { dataHeaders: P.headers };
    return result;
  };

  // measure over every row (no grouping)
  function overallValue(P, rule) {
    var n = 0, sum = 0, cnt = 0, mn = Infinity, mx = -Infinity, set = {};
    var fc = rule.filter ? P.cols[rule.filter.col] : null, fk = rule.filter ? gkey(rule.filter.value) : null;
    for (var r = 0; r < P.n; r++) {
      if (fc && gkey(fc.raw[r]) !== fk) continue;
      n++;
      if (rule.type === 'distinct') { var v = P.cols[rule.col].raw[r]; if (!blank(v)) set[gkey(v)] = 1; continue; }
      if (rule.col === undefined) continue;
      var x = P.cols[rule.col].nums[r]; if (x === null) continue; sum += x; cnt++; if (x < mn) mn = x; if (x > mx) mx = x;
    }
    switch (rule.type) {
      case 'count': return n; case 'distinct': return Object.keys(set).length; case 'sum': return sum;
      case 'avg': return cnt ? sum / cnt : null; case 'min': return cnt ? mn : null; case 'max': return cnt ? mx : null;
    }
    return null;
  }

  // ------------------------------------------------------------ apply to new data
  function mapColumns(learnedHeaders, headers2) {
    var M = STL.merge, map = {};
    learnedHeaders.forEach(function (h, i) {
      var best = -1, bs = 0;
      headers2.forEach(function (h2, j) {
        var sc = (gkey(h) === gkey(h2)) ? 1 : (M && M.score ? M.score(h, h2).score : 0);
        if (sc > bs) { bs = sc; best = j; }
      });
      map[i] = bs >= 0.9 ? best : -1;
    });
    return map;
  }

  // rules: result of learn() (possibly with user-chosen rules); data2: {headers, rows}; template: {rows}
  A.apply = function (rules, data2, template, opts) {
    opts = opts || {};
    var P = prepData(data2), warnings = [], map = mapColumns(rules.template.dataHeaders, P.headers);
    function remap(rule) {                                               // translate column indexes of last month's data to this month's
      if (rule.type === 'derived') return rule;
      var r = Object.assign({}, rule);
      if (r.col !== undefined) { if (map[r.col] < 0 || map[r.col] === undefined) return null; r.col = map[r.col]; }
      if (r.filter) { if (map[r.filter.col] < 0 || map[r.filter.col] === undefined) return null; r.filter = Object.assign({}, r.filter, { col: map[r.filter.col] }); }
      return r;
    }
    var gcol = map[rules.group.col];
    if (gcol === undefined || gcol < 0) return { ok: false, error: 'group-column', warnings: [{ kind: 'column-missing', name: rules.group.name }], values: [] };
    var groupIndex = {}, gk = []; rules.rows.forEach(function (x, i) { groupIndex[x.key] = i; gk.push(x.key); });
    var agg = aggregate(P, gcol, groupIndex, true);
    var present = {}; for (var r0 = 0; r0 < P.n; r0++) present[gkey(P.cols[gcol].raw[r0])] = (present[gkey(P.cols[gcol].raw[r0])] || 0) + 1;
    var values = [], computed = {}, colWarned = {};
    // direct rules first, derived after
    var order = rules.cols.filter(function (c) { return c.rule && c.rule.type !== 'derived'; }).concat(rules.cols.filter(function (c) { return c.rule && c.rule.type === 'derived'; }));
    order.forEach(function (ci) {
      var rule = ci.rule, col = computed[ci.c] = new Array(rules.rows.length);
      if (rule.type === 'derived') {
        for (var i = 0; i < rules.rows.length; i++) {
          var a = computed[rule.a] ? computed[rule.a][i] : null, b = computed[rule.b] ? computed[rule.b][i] : null;
          col[i] = (a === null || b === null || a === undefined || b === undefined) ? null : rule.op === 'add' ? a + b : rule.op === 'sub' ? a - b : (b === 0 ? null : (rule.op === 'pct' ? a / b * 100 : a / b));
        }
      } else {
        var rr = remap(rule);
        if (!rr) { if (!colWarned[ci.header]) { warnings.push({ kind: 'rule-skipped', header: ci.header, name: (rule.colName || (rule.filter && rule.filter.colName)) }); colWarned[ci.header] = 1; } for (var k = 0; k < rules.rows.length; k++) col[k] = undefined; return; }
        for (var i2 = 0; i2 < rules.rows.length; i2++) col[i2] = valueFrom(agg, rr, i2);
      }
    });
    function round(v, ci) { if (v === null || v === undefined) return null; if (ci.rule.type === 'count' || ci.rule.type === 'distinct') return Math.round(v); return roundHalfUp(v, ci.dec); }
    rules.cols.forEach(function (ci) {
      if (!ci.rule || !computed[ci.c] || computed[ci.c][0] === undefined && rules.rows.length) return;
      rules.rows.forEach(function (x, i) {
        var v = computed[ci.c][i], isCount = ci.rule.type === 'count' || ci.rule.type === 'sum' || ci.rule.type === 'distinct';
        if (v === null && isCount) v = 0;
        var nv = round(v, ci), old = template.rows[x.r] ? template.rows[x.r][ci.c] : null, oldN = pnum(old);
        values.push({ r: x.r, c: ci.c, value: nv === null ? '' : nv, old: oldN, delta: nv !== null && oldN !== null ? nv - oldN : null, group: x.label, column: ci.header });
      });
      // total row
      if (rules.totalRow !== null && ci.total && ci.total.type !== 'formula') {
        var tv = null;
        if (ci.total.type === 'sum') tv = computed[ci.c].reduce(function (a, b) { return a + (b || 0); }, 0);
        else if (ci.total.type === 'overall') { var rr = remap(ci.rule); tv = rr ? overallValue(P, rr) : null; }
        else if (ci.total.type === 'derived') {
          var ta = values.filter(function (v) { return v.r === rules.totalRow && v.c === ci.rule.a; })[0], tb = values.filter(function (v) { return v.r === rules.totalRow && v.c === ci.rule.b; })[0];
          if (ta && tb && ta.value !== '' && tb.value !== '' && !(tb.value === 0 && ci.rule.op !== 'add' && ci.rule.op !== 'sub')) { var a = ta.value, b = tb.value; tv = ci.rule.op === 'add' ? a + b : ci.rule.op === 'sub' ? a - b : ci.rule.op === 'pct' ? a / b * 100 : a / b; }
        }
        var nv2 = round(tv, ci), old2 = template.rows[rules.totalRow] ? pnum(template.rows[rules.totalRow][ci.c]) : null;
        if (nv2 !== null) values.push({ r: rules.totalRow, c: ci.c, value: nv2, old: old2, delta: old2 !== null ? nv2 - old2 : null, group: '(total)', column: ci.header, total: true });
      }
    });
    // what does not line up
    var inTemplate = {}; rules.rows.forEach(function (x) { inTemplate[x.key] = 1; });
    var newGroups = Object.keys(present).filter(function (k) { return !inTemplate[k] && k !== ''; }).map(function (k) { return { name: P.cols[gcol].distinct[k] || k, rows: present[k] }; }).sort(function (a, b) { return b.rows - a.rows; });
    if (newGroups.length) warnings.push({ kind: 'new-groups', groups: newGroups.slice(0, 30), count: newGroups.length, rows: newGroups.reduce(function (a, b) { return a + b.rows; }, 0) });
    var missing = rules.rows.filter(function (x) { return !present[x.key]; }).map(function (x) { return x.label; });
    if (missing.length) warnings.push({ kind: 'missing-groups', groups: missing });
    var blankGroup = 0; for (var r1 = 0; r1 < P.n; r1++) if (blank(P.cols[gcol].raw[r1])) blankGroup++;
    if (blankGroup) warnings.push({ kind: 'blank-group', rows: blankGroup });
    rules.cols.forEach(function (ci) { if (!ci.rule && !ci.serial) warnings.push({ kind: 'not-learned', header: ci.header }); });
    return { ok: true, values: values, warnings: warnings, rows: P.n, groupName: rules.group.name, summary: A.summary(rules, values) };
  };

  // ------------------------------------------------------------ grounded summary
  function ind(n) { return STL.change && STL.change.indian ? STL.change.indian(n) : String(n); }
  A.summary = function (rules, values) {
    var out = { en: [], hi: [] }, byCol = {};
    values.forEach(function (v) { if (v.total || v.delta === null) return; (byCol[v.column] = byCol[v.column] || []).push(v); });
    var cols = Object.keys(byCol).map(function (k) {
      var list = byCol[k], tot = list.reduce(function (a, x) { return a + x.value; }, 0), totOld = list.reduce(function (a, x) { return a + x.old; }, 0);
      var up = list.slice().sort(function (a, b) { return b.delta - a.delta; })[0], down = list.slice().sort(function (a, b) { return a.delta - b.delta; })[0];
      return { name: k, tot: tot, old: totOld, d: tot - totOld, up: up, down: down };
    }).filter(function (c) { return c.d !== 0 || (c.up && c.up.delta !== 0); });
    cols.sort(function (a, b) { return Math.abs(b.d) / Math.max(Math.abs(b.old), 1) - Math.abs(a.d) / Math.max(Math.abs(a.old), 1); });
    cols.slice(0, 4).forEach(function (c) {
      var dir = c.d > 0 ? ['rose', 'बढ़ा'] : ['fell', 'घटा'];
      var en = c.name + ' ' + (c.d === 0 ? 'is unchanged at ' + ind(c.tot) : dir[0] + ' by ' + ind(Math.abs(c.d)) + ' to ' + ind(c.tot) + ' (from ' + ind(c.old) + ')') + '.';
      var hi = c.name + (c.d === 0 ? ' ' + ind(c.tot) + ' पर अपरिवर्तित है' : ' ' + ind(c.old) + ' से ' + dir[1] + ' और अब ' + ind(c.tot) + ' है') + '।';
      if (c.up && c.up.delta > 0) { en += ' Largest rise: ' + c.up.group + ' (+' + ind(c.up.delta) + ').'; hi += ' सबसे अधिक वृद्धि: ' + c.up.group + ' (+' + ind(c.up.delta) + ')।'; }
      if (c.down && c.down.delta < 0) { en += ' Largest fall: ' + c.down.group + ' (−' + ind(Math.abs(c.down.delta)) + ').'; hi += ' सबसे अधिक कमी: ' + c.down.group + ' (−' + ind(Math.abs(c.down.delta)) + ')।'; }
      out.en.push(en); out.hi.push(hi);
    });
    return out;
  };

  A.describe = describe;
})(typeof window !== 'undefined' ? window : globalThis);
