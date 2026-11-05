// =====================================================================
//  TABLE INTERACTIONS  /  तालिका में सुविधाएँ
//   * Column visuals: data bars, colour scale, traffic lights (right-click a column heading)
//   * Column insight (the small "i" in every heading): facts, spread picture, top values -
//     click a bar or a value and the table shows exactly those rows
//   * Filter chips above the table: every active filter (and the chart selection) with one-click removal
//   * "Chart this column" from the heading menu and from the cell menu
// =====================================================================
(function () {
  'use strict';
  var STL = window.STL = window.STL || {}, U = STL.ui, CH = STL.charts;
  var T = U.T, esc = U.esc;
  function $(id) { return document.getElementById(id); }
  function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
  function numOf(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof parseFlexibleNumber === 'function') { var n = parseFlexibleNumber(v); return n === null || n === undefined || !isFinite(n) ? null : n; }
    var x = parseFloat(String(v).replace(/,/g, '')); return isFinite(x) ? x : null;
  }
  function blank(v) { return v === null || v === undefined || String(v).trim() === ''; }
  function ind(v) { return CH.indian(v); }
  function dmy(ms) { var d = new Date(ms), p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(d.getUTCDate()) + '-' + p(d.getUTCMonth() + 1) + '-' + d.getUTCFullYear(); }

  // ================================================================= 1. column visuals
  var TV = { mode: {}, stats: {}, spark: null };                                      // mode: header name -> bars|scale|dots|dotsrev
  function colStats(ci) {
    var key = ci + ':' + rawData.length; if (TV.stats[key]) return TV.stats[key];
    var vals = [], mn = Infinity, mx = -Infinity;
    for (var i = 0; i < rawData.length; i++) { var x = numOf(rawData[i][ci]); if (x === null) continue; vals.push(x); if (x < mn) mn = x; if (x > mx) mx = x; }
    var sorted = vals.slice().sort(function (a, b) { return a - b; }), n = sorted.length;
    var st = { min: mn, max: mx, n: n, q1: n ? sorted[Math.floor(n / 3)] : 0, q2: n ? sorted[Math.floor(2 * n / 3)] : 0 };
    TV.stats = (function (o) { o[key] = st; return o; })(TV.stats); return st;
  }
  function mix(a, b, t) { return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]; }
  var LOW = [238, 242, 255], MID = [169, 156, 240], HIGH = [109, 91, 208];
  function vizStyle(ri, ci) {
    var m = TV.mode[headers[ci]]; if (!m) return '';
    var x = numOf(rawData[ri][ci]); if (x === null) return '';
    var st = colStats(ci), range = st.max - st.min;
    if (m === 'bars') {
      if (!(range > 0) || !(st.max > 0 || st.min < 0)) return '';
      var a, b, col;
      if (st.min >= 0) { a = 0; b = x / st.max * 100; col = 'rgba(109,91,208,.30)'; }
      else {
        var zero = -st.min / range * 100, w = Math.abs(x) / range * 100;
        if (x >= 0) { a = zero; b = zero + w; col = 'rgba(109,91,208,.30)'; } else { a = zero - w; b = zero; col = 'rgba(214,69,107,.32)'; }
      }
      a = Math.max(0, Math.min(100, a)); b = Math.max(0, Math.min(100, b));
      return 'background-image:linear-gradient(90deg,transparent ' + a.toFixed(1) + '%,' + col + ' ' + a.toFixed(1) + '%,' + col + ' ' + b.toFixed(1) + '%,transparent ' + b.toFixed(1) + '%);';
    }
    if (m === 'scale') {
      if (!(range > 0)) return '';
      var t = (x - st.min) / range, c = t < 0.5 ? mix(LOW, MID, t * 2) : mix(MID, HIGH, (t - 0.5) * 2);
      return 'background-color:rgba(' + c.join(',') + ',' + (0.28 + t * 0.3).toFixed(2) + ');';
    }
    if (m === 'dots' || m === 'dotsrev') {
      var level = x <= st.q1 ? 0 : (x <= st.q2 ? 1 : 2); if (m === 'dotsrev') level = 2 - level;
      var color = ['#e5484d', '#f5a524', '#30a46c'][level];
      return 'background-image:radial-gradient(circle at 11px 50%,' + color + ' 4.5px,transparent 5.5px);padding-left:24px;';
    }
    return '';
  }
  // ---- sparklines: a tiny trend line drawn inside the last cell of a block of number columns (Jan ... Dec)
  var SPARK_W = 68, sparkCache = new Map();
  function sparkStyle(ri, ci) {
    var sp = TV.spark; if (!sp || headers[ci] !== sp.target) return '';
    var vals = [], key = ri + ':';
    for (var k = 0; k < sp.cols.length; k++) { var c = headers.indexOf(sp.cols[k]); if (c < 0) continue; var x = numOf(rawData[ri][c]); vals.push(x); key += x + ','; }
    var n = vals.filter(function (v) { return v !== null; }).length; if (n < 2) return '';
    var hit = sparkCache.get(key); if (!hit) {
      var mn = Infinity, mx = -Infinity; vals.forEach(function (v) { if (v !== null) { if (v < mn) mn = v; if (v > mx) mx = v; } });
      var pts = [], W = SPARK_W, H = 20, pad = 3, lastX = 0, lastY = 0;
      vals.forEach(function (v, i) { if (v === null) return; var px = pad + (vals.length === 1 ? 0 : i / (vals.length - 1)) * (W - 2 * pad), py = mx === mn ? H / 2 : H - pad - (v - mn) / (mx - mn) * (H - 2 * pad); pts.push(px.toFixed(1) + ',' + py.toFixed(1)); lastX = px; lastY = py; });
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '"><polyline points="' + pts.join(' ') + '" fill="none" stroke="#6d5bd0" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><circle cx="' + lastX.toFixed(1) + '" cy="' + lastY.toFixed(1) + '" r="2.4" fill="#d6456b"/></svg>';
      hit = 'background-image:url(data:image/svg+xml,' + encodeURIComponent(svg) + ');background-repeat:no-repeat;background-position:right 6px center;background-size:' + W + 'px 20px;padding-right:' + (W + 14) + 'px;';
      if (sparkCache.size > 4000) sparkCache.clear(); sparkCache.set(key, hit);
    }
    return hit;
  }
  var _gcs = window.getCellStyle;
  window.getCellStyle = function (ri, ci) {
    var base = _gcs.apply(this, arguments);
    var any = !!TV.spark; for (var k in TV.mode) { any = true; break; }
    return any ? vizStyle(ri, ci) + sparkStyle(ri, ci) + base : base;                // the user's own colours (with !important) still win
  };
  // which columns? the selected ones, or the whole run of number columns around the clicked heading
  TV.sparkFrom = function (ci) {
    if (!U.hasData()) return;
    var s0 = typeof selectionStart !== 'undefined' ? selectionStart : null, e0 = typeof selectionEnd !== 'undefined' ? selectionEnd : null, cols = [];
    if (s0 && e0 && s0.ci !== null && e0.ci !== null && Math.abs(e0.ci - s0.ci) >= 2) { for (var c = Math.min(s0.ci, e0.ci); c <= Math.max(s0.ci, e0.ci); c++) if (numeric(c)) cols.push(c); }
    else if (ci >= 0 && numeric(ci)) { var a = ci, b = ci; while (a > 0 && numeric(a - 1)) a--; while (b < headers.length - 1 && numeric(b + 1)) b++; for (var d = a; d <= b; d++) cols.push(d); }
    if (cols.length < 3) { toast(T('Sparklines need 3 or more number columns side by side (for example Jan, Feb, Mar…). Select them first, then try again.', 'स्पार्कलाइन के लिए साथ-साथ 3 या अधिक संख्या कॉलम चाहिए (जैसे जन, फ़र, मार्च…)। पहले उन्हें चुनें, फिर दोबारा करें।'), 'info'); return; }
    TV.spark = { cols: cols.map(function (c) { return headers[c]; }), target: headers[cols[cols.length - 1]] };
    sparkCache.clear(); renderTableHeader(); renderTable();
    toast(T('Trend lines added in “', 'ट्रेंड लाइन जोड़ी गई “') + TV.spark.target + T('” for ', '” में, ') + cols.length + T(' columns.', ' कॉलम के लिए।'), 'success');
  };
  TV.sparkOff = function () { TV.spark = null; sparkCache.clear(); renderTableHeader(); renderTable(); };
  TV.set = function (ci, mode) {
    if (ci < 0 || ci >= headers.length) return;
    var name = headers[ci];
    if (mode) {
      if (!numeric(ci)) { toast(T('This works on number columns only.', 'यह केवल संख्या वाले कॉलम पर चलता है।'), 'info'); return; }
      TV.mode[name] = mode;
    } else delete TV.mode[name];
    TV.stats = {}; renderTableHeader(); renderTable();
  };
  function numeric(ci) {
    var n = 0, t = 0; for (var i = 0; i < rawData.length && t < 200; i++) { var v = rawData[i][ci]; if (blank(v)) continue; t++; if (numOf(v) !== null) n++; }
    return t > 0 && n / t >= 0.8;
  }
  STL.tableViz = TV;

  // ================================================================= 2. heading button and insight popover
  var _rth = window.renderTableHeader;
  window.renderTableHeader = function () {
    TV.stats = {};
    var r = _rth.apply(this, arguments), th = $('vthead'); if (!th) return r;
    th.querySelectorAll('th').forEach(function (h) {
      var oc = h.getAttribute('oncontextmenu') || '', m = /showColumnHeaderMenu\(event,(\d+)\)/.exec(oc); if (!m) return;
      var ci = +m[1], b = document.createElement('span'); b.className = 'tv-i' + (TV.mode[headers[ci]] || (TV.spark && TV.spark.target === headers[ci]) ? ' on' : ''); b.dataset.ci = ci; b.textContent = 'ⓘ';
      b.title = T('About this column', 'इस कॉलम के बारे में'); h.appendChild(b);
    });
    return r;
  };
  ready(function () {
    var th = $('vthead'); if (!th) return;
    th.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.tv-i'); if (!b) return; e.stopPropagation(); e.preventDefault(); openInsight(+b.dataset.ci, b); }, true);
    th.addEventListener('dblclick', function (e) { if (e.target.closest && e.target.closest('.tv-i')) { e.stopPropagation(); e.preventDefault(); } }, true);
    th.addEventListener('mouseover', function (e) { if (e.target.closest && e.target.closest('.tv-i') && typeof hideColStatsTooltip === 'function') hideColStatsTooltip(); });
  });

  function closePop() { var p = $('tvPop'); if (p) p.remove(); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', escKey, true); }
  function outside(e) { var p = $('tvPop'); if (p && !p.contains(e.target) && !(e.target.closest && e.target.closest('.tv-i'))) closePop(); }
  function escKey(e) { if (e.key === 'Escape') closePop(); }

  function setFilter(f) {                                                        // replaces an earlier filter of the same kind on that column
    activeFilters = activeFilters.filter(function (x) { return !(x.col === f.col && (x.type === f.type || (f.type === 'values' && x.type === 'values'))); });
    activeFilters.push(f);
    applyAllFilters(); if (typeof renderActiveFilters === 'function') renderActiveFilters();
  }

  function openInsight(ci, anchor) {
    if (!U.hasData() || ci >= headers.length) return; closePop();
    var idx = getDisplayData(), n = idx.length, name = headers[ci], vals = [], nonblank = 0, counts = new Map(), nums = [];
    for (var k = 0; k < n; k++) {
      var v = rawData[idx[k]][ci]; if (blank(v)) continue; nonblank++; vals.push(idx[k]);
      var s = String(v).trim(); counts.set(s, (counts.get(s) || 0) + 1);
      var x = numOf(v); if (x !== null) nums.push(x);
    }
    var isNum = nonblank > 0 && nums.length / nonblank >= 0.8 && counts.size > 1;
    var P = STL.pend, dates = [];
    if (!isNum && P && P.parseDate) { for (var q = 0; q < vals.length && q < 20000; q++) { var ms = P.parseDate(rawData[vals[q]][ci], false); if (ms !== null) dates.push([ms, vals[q]]); } }
    var isDate = !isNum && dates.length > 0 && dates.length / Math.min(vals.length, 20000) >= 0.8;
    var kind = isNum ? T('Number', 'संख्या') : isDate ? T('Date', 'तारीख') : T('Text', 'पाठ');
    var html = '<div class="tv-pop-h"><b>' + esc(name) + '</b><span class="tv-kind">' + kind + '</span><button class="tv-x" id="tvPopX" aria-label="close">×</button></div>';
    var facts = [[T('Filled', 'भरे हुए'), ind(nonblank) + ' (' + (n ? Math.round(nonblank / n * 100) : 0) + '%)'], [T('Blank', 'खाली'), ind(n - nonblank)], [T('Different values', 'अलग मान'), ind(counts.size)]];
    var bars = '';
    if (isNum && nums.length) {
      var sorted = nums.slice().sort(function (a, b) { return a - b; }), sum = nums.reduce(function (a, b) { return a + b; }, 0), q = function (p) { var pos = (sorted.length - 1) * p, lo = Math.floor(pos), hi = Math.ceil(pos); return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo); };
      var q1 = q(0.25), q3 = q(0.75), iqr = q3 - q1, odd = sorted.filter(function (x) { return x < q1 - 1.5 * iqr || x > q3 + 1.5 * iqr; }).length;
      facts.push([T('Total', 'योग'), ind(Math.round(sum * 100) / 100)], [T('Average', 'औसत'), ind(Math.round(sum / nums.length * 100) / 100)], [T('Middle (median)', 'मध्य (माध्यिका)'), ind(Math.round(q(0.5) * 100) / 100)],
        [T('Smallest', 'न्यूनतम'), ind(sorted[0])], [T('Largest', 'अधिकतम'), ind(sorted[sorted.length - 1])], [T('Unusual values', 'असामान्य मान'), ind(odd)]);
      var h = CH.histogram(nums, 12), mx = Math.max.apply(null, h.counts) || 1;
      bars = '<div class="tv-sec">' + T('How the values are spread — click a bar to show those rows', 'मान कैसे फैले हैं — उन पंक्तियों के लिए पट्टी पर क्लिक करें') + '</div><div class="tv-hist">' + h.counts.map(function (c, i) {
        return '<button class="tv-hb" data-b="' + i + '" style="height:' + Math.max(4, Math.round(c / mx * 100)) + '%" title="' + esc(CH.compact(h.edges[i]) + ' – ' + CH.compact(h.edges[i + 1]) + ': ' + ind(c)) + '"></button>';
      }).join('') + '</div><div class="tv-axis"><span>' + CH.compact(h.edges[0]) + '</span><span>' + CH.compact(h.edges[h.edges.length - 1]) + '</span></div>';
      var hist = h;
    } else if (isDate) {
      var lo = Math.min.apply(null, dates.map(function (d) { return d[0]; })), hi2 = Math.max.apply(null, dates.map(function (d) { return d[0]; }));
      facts.push([T('Earliest', 'सबसे पुरानी'), dmy(lo)], [T('Latest', 'सबसे नई'), dmy(hi2)], [T('Span', 'अवधि'), ind(Math.round((hi2 - lo) / 86400000)) + T(' days', ' दिन')]);
      var by = {}; dates.forEach(function (d) { var k2 = CH.bucketKey(d[0], 'month'); (by[k2] = by[k2] || []).push(d[1]); });
      var keys = Object.keys(by).sort(); if (keys.length > 24) keys = keys.slice(-24);
      var mx2 = Math.max.apply(null, keys.map(function (k3) { return by[k3].length; })) || 1;
      bars = '<div class="tv-sec">' + T('Rows per month — click a bar to show them', 'प्रति माह पंक्तियाँ — देखने के लिए पट्टी पर क्लिक करें') + '</div><div class="tv-hist">' + keys.map(function (k3, i) { return '<button class="tv-hb" data-m="' + i + '" style="height:' + Math.max(4, Math.round(by[k3].length / mx2 * 100)) + '%" title="' + esc(k3 + ': ' + by[k3].length) + '"></button>'; }).join('') + '</div><div class="tv-axis"><span>' + esc(keys[0]) + '</span><span>' + esc(keys[keys.length - 1]) + '</span></div>';
      var monthRows = keys.map(function (k3) { return by[k3]; });
    }
    if (!isNum && !isDate || counts.size <= 12) {
      var top = Array.from(counts.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8), tm = top.length ? top[0][1] : 1;
      if (top.length && counts.size > 1 && (!isNum)) bars += '<div class="tv-sec">' + T('Most common — click one to show only those rows', 'सबसे आम — केवल वही पंक्तियाँ देखने के लिए क्लिक करें') + '</div><div class="tv-top">' + top.map(function (t2, i) {
        return '<button class="tv-tv" data-t="' + i + '"><span class="tv-tl">' + esc(t2[0].length > 30 ? t2[0].slice(0, 29) + '…' : t2[0]) + '</span><span class="tv-tb"><i style="width:' + Math.round(t2[1] / tm * 100) + '%"></i></span><span class="tv-tn">' + ind(t2[1]) + '</span></button>';
      }).join('') + '</div>';
    }
    html += '<div class="tv-grid">' + facts.map(function (f) { return '<div><span>' + f[0] + '</span><b>' + esc(f[1]) + '</b></div>'; }).join('') + '</div>' + bars;
    html += '<div class="tv-acts"><button class="tb-btn" id="tvChart">📊 ' + T('Chart this column', 'इस कॉलम का चार्ट') + '</button>' + (isNum ? '<button class="tb-btn" id="tvBars">' + T('Data bars', 'डेटा बार') + '</button><button class="tb-btn" id="tvScale">' + T('Colour scale', 'रंग-पैमाना') + '</button><button class="tb-btn" id="tvDots">' + T('Traffic lights', 'ट्रैफ़िक लाइट') + '</button>' : '') + (TV.mode[name] ? '<button class="tb-btn" id="tvOff">' + T('Remove visual', 'दृश्य हटाएँ') + '</button>' : '') + '</div>';
    html += '<div class="tv-foot">' + T('Based on ', 'आधार: ') + ind(n) + T(' rows in view', ' पंक्तियाँ') + '</div>';

    var pop = document.createElement('div'); pop.id = 'tvPop'; pop.className = 'tv-pop'; pop.innerHTML = html; document.body.appendChild(pop);
    var r = anchor.getBoundingClientRect(), w = pop.offsetWidth, hgt = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(r.left - 20, window.innerWidth - w - 12)) + 'px'; pop.style.top = Math.max(8, Math.min(r.bottom + 6, window.innerHeight - hgt - 12)) + 'px';
    var on = function (id, fn) { var e = $(id); if (e) e.onclick = fn; };
    on('tvPopX', closePop); on('tvChart', function () { closePop(); STL.chartColumn(ci); });
    on('tvBars', function () { closePop(); TV.set(ci, 'bars'); }); on('tvScale', function () { closePop(); TV.set(ci, 'scale'); }); on('tvDots', function () { closePop(); TV.set(ci, 'dots'); }); on('tvOff', function () { closePop(); TV.set(ci, null); });
    pop.querySelectorAll('[data-b]').forEach(function (b) {
      b.onclick = function () {
        var i = +b.dataset.b, a = hist.edges[i], z = hist.edges[i + 1], last = i === hist.counts.length - 1;
        closePop(); setFilter({ col: ci, type: 'between', from: a, to: last ? z : z - (z - a) * 1e-9 });
        toast(name + ': ' + CH.compact(a) + ' – ' + CH.compact(z) + ' (' + ind(getDisplayData().length) + T(' rows)', ' पंक्तियाँ)'), 'success');
      };
    });
    pop.querySelectorAll('[data-m]').forEach(function (b) {
      b.onclick = function () { var rows = monthRows[+b.dataset.m], set = {}; rows.forEach(function (ri) { set[String(rawData[ri][ci])] = 1; }); closePop(); setFilter({ col: ci, type: 'values', values: Object.keys(set) }); };
    });
    pop.querySelectorAll('[data-t]').forEach(function (b) {
      b.onclick = function () {
        var key = top[+b.dataset.t][0], set = {}; set[key] = 1;
        vals.forEach(function (ri) { var raw = String(rawData[ri][ci]); if (raw.trim() === key) set[raw] = 1; });         // keeps spacing variants of the same text
        closePop(); setFilter({ col: ci, type: 'values', values: Object.keys(set) });
      };
    });
    setTimeout(function () { document.addEventListener('mousedown', outside, true); document.addEventListener('keydown', escKey, true); }, 0);
  }
  STL.columnInsight = function (ci) { var th = $('vthead') && $('vthead').querySelector('.tv-i[data-ci="' + ci + '"]'); openInsight(ci, th || document.body); };

  // ================================================================= 3. filter chips above the table
  function ftext(f) {
    var h = headers[f.col] || '?', t = f.type;
    if (t === 'values') { var v = f.values || []; return h + ' = ' + (v.length > 2 ? v.slice(0, 2).join(', ') + ' +' + (v.length - 2) : (v.join(', ') || T('(blank)', '(खाली)'))); }
    if (t === 'text') return h + T(' contains “', ' में “') + (f.text || '') + T('”', '” है');
    if (t === 'gt') return h + ' > ' + f.numVal; if (t === 'lt') return h + ' < ' + f.numVal; if (t === 'eq') return h + ' = ' + f.numVal;
    if (t === 'between') return h + ': ' + CH.compact(f.from) + ' – ' + CH.compact(f.to);
    return h + ': ' + t;
  }
  function chips() {
    var wrap = $('virtual-table-container'); if (!wrap) return;
    var bar = $('tvChips');
    if (!bar) { bar = document.createElement('div'); bar.id = 'tvChips'; bar.className = 'tv-chips'; wrap.parentNode.insertBefore(bar, wrap); bar.addEventListener('click', onChip); }
    var sel = CH.selectionInfo && CH.selectionInfo(), out = [];
    activeFilters.forEach(function (f, i) { out.push('<span class="tv-chip"><span>' + esc(ftext(f)) + '</span><button data-rm="' + i + '" aria-label="remove">×</button></span>'); });
    if (sel) out.push('<span class="tv-chip sel"><span>📊 ' + esc(sel.label.length > 40 ? sel.label.slice(0, 39) + '…' : sel.label) + '</span><button data-rmsel="1" aria-label="remove">×</button></span>');
    if (!out.length) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
    var n = filteredData ? filteredData.length : rawData.length;
    bar.style.display = 'flex';
    bar.innerHTML = '<span class="tv-chips-l">' + T('Showing ', 'दिख रही हैं ') + '<b>' + ind(n) + '</b>' + T(' of ', ' / ') + ind(rawData.length) + '</span>' + out.join('') + '<button class="tv-clear" data-clr="1">' + T('Clear all', 'सब हटाएँ') + '</button>';
  }
  function onChip(e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.rm !== undefined) { removeFilter(+b.dataset.rm); chips(); }
    else if (b.dataset.rmsel) CH.clearSelection();
    else if (b.dataset.clr) { if (CH.selectionInfo && CH.selectionInfo()) CH.clearSelection(true); clearAllFilters(); chips(); }
  }
  STL.tvChips = chips;
  var _aaf = window.applyAllFilters; window.applyAllFilters = function () { var r = _aaf.apply(this, arguments); chips(); return r; };
  var _caf = window.clearAllFilters; if (_caf) window.clearAllFilters = function () { var r = _caf.apply(this, arguments); chips(); return r; };

  // ================================================================= 4. menu entries
  function addItem(menu, id, fn) { var d = document.createElement('div'); d.className = 'ctx-item'; d.id = id; d.addEventListener('click', fn); menu.appendChild(d); return d; }
  function buildMenus() {
    var cm = $('col-context-menu'), cell = $('context-menu');
    if (cm && !$('tvm-sep')) {
      var sep = document.createElement('div'); sep.className = 'ctx-sep'; sep.id = 'tvm-sep'; cm.appendChild(sep);
      addItem(cm, 'tvm-ins', function () { STL.columnInsight(ctxHeaderColIdx); });
      addItem(cm, 'tvm-chart', function () { STL.chartColumn(ctxHeaderColIdx); });
      addItem(cm, 'tvm-bars', function () { TV.set(ctxHeaderColIdx, 'bars'); });
      addItem(cm, 'tvm-scale', function () { TV.set(ctxHeaderColIdx, 'scale'); });
      addItem(cm, 'tvm-dots', function () { TV.set(ctxHeaderColIdx, 'dots'); });
      addItem(cm, 'tvm-dotsr', function () { TV.set(ctxHeaderColIdx, 'dotsrev'); });
      addItem(cm, 'tvm-spark', function () { TV.sparkFrom(ctxHeaderColIdx); });
      addItem(cm, 'tvm-sparkoff', function () { TV.sparkOff(); });
      addItem(cm, 'tvm-off', function () { TV.set(ctxHeaderColIdx, null); });
    }
    if (cell && !$('tvc-sep')) {
      var s2 = document.createElement('div'); s2.className = 'ctx-sep'; s2.id = 'tvc-sep'; cell.appendChild(s2);
      addItem(cell, 'tvc-ins', function () { if (ctxColIdx >= 0) STL.columnInsight(ctxColIdx); });
      addItem(cell, 'tvc-chart', function () { if (ctxColIdx >= 0) STL.chartColumn(ctxColIdx); });
    }
  }
  function labelMenus() {
    var L = { 'tvm-ins': ['ⓘ  About this column', 'ⓘ  इस कॉलम के बारे में'], 'tvm-chart': ['📊  Chart this column', '📊  इस कॉलम का चार्ट'], 'tvm-bars': ['▮  Data bars', '▮  डेटा बार'], 'tvm-scale': ['🎨  Colour scale', '🎨  रंग-पैमाना'], 'tvm-dots': ['🚦  Traffic lights (high = good)', '🚦  ट्रैफ़िक लाइट (अधिक = अच्छा)'], 'tvm-dotsr': ['🚦  Traffic lights (high = bad)', '🚦  ट्रैफ़िक लाइट (अधिक = बुरा)'], 'tvm-spark': ['📈  Trend line in each row (sparkline)', '📈  हर पंक्ति में ट्रेंड लाइन (स्पार्कलाइन)'], 'tvm-sparkoff': ['✕  Remove trend lines', '✕  ट्रेंड लाइन हटाएँ'], 'tvm-off': ['✕  Remove visual', '✕  दृश्य हटाएँ'], 'tvc-ins': ['ⓘ  About this column', 'ⓘ  इस कॉलम के बारे में'], 'tvc-chart': ['📊  Chart this column', '📊  इस कॉलम का चार्ट'] };
    Object.keys(L).forEach(function (id) { var e = $(id); if (e) e.textContent = T(L[id][0], L[id][1]); });
    var so = $('tvm-sparkoff'); if (so) so.style.display = TV.spark ? '' : 'none';
    var off = $('tvm-off'); if (off) off.style.display = TV.mode[headers[ctxHeaderColIdx]] ? '' : 'none';
  }
  (STL.actions || []).push({ en: 'Trend lines (sparklines) across number columns', hi: 'संख्या कॉलमों में ट्रेंड लाइन (स्पार्कलाइन)', kw: 'sparkline trend line months columns row mini chart', run: function () { TV.sparkFrom(typeof ctxHeaderColIdx !== 'undefined' ? ctxHeaderColIdx : -1); }, group: 'Charts' });
  ready(buildMenus);
  var _shm = window.showColumnHeaderMenu; window.showColumnHeaderMenu = function () { buildMenus(); var r = _shm.apply(this, arguments); labelMenus(); return r; };
  var _scm = window.showContextMenu; window.showContextMenu = function () { buildMenus(); var r = _scm.apply(this, arguments); labelMenus(); return r; };

  // new data: forget the visuals of the old file, redraw the chips
  var _lastSig = '', _st = window.showTable;
  window.showTable = function () {
    var sig = headers.join('|'); if (sig !== _lastSig) { TV.mode = {}; TV.stats = {}; TV.spark = null; sparkCache.clear(); _lastSig = sig; }
    var r = _st.apply(this, arguments); chips(); return r;
  };
})();
