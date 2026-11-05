// =====================================================================
//  CHART STUDIO  /  चार्ट स्टूडियो      and      INSIGHTS BOARD  /  अंतर्दृष्टि बोर्ड
//  A docked panel beside the table. Pick any of 25 chart types; the charts are alive:
//    click a bar / slice / cell  -> the table shows exactly those rows (Ctrl+click adds more)
//    drag on the chart (brush)   -> the table shows the selected range
//    filter the table            -> the chart redraws
//    zoom, legend toggles, data view, save as picture, copy, pin to the board.
//  "Auto charts" builds a whole board of suggested charts from the data in one click.
// =====================================================================
(function () {
  'use strict';
  var STL = window.STL = window.STL || {}, U = STL.ui, CH = STL.charts;
  var T = U.T, esc = U.esc;
  function $(id) { return document.getElementById(id); }
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function hi() { return typeof uiLanguage !== 'undefined' && uiLanguage === 'hi'; }
  function nm(o) { return o ? T(o.en, o.hi) : ''; }

  // ---------------------------------------------------------------- library
  var loading = null;
  function ensureECharts(cb) {
    if (window.echarts) { cb(); return; }
    if (!loading) {
      loading = [];
      var sc = document.createElement('script'); sc.src = '/static/js/echarts.min.js';
      sc.onload = function () { var q = loading; loading = null; q.forEach(function (f) { f(); }); };
      sc.onerror = function () { loading = null; toast(T('The chart library is missing from static/js — please reinstall Stellura.', 'चार्ट लाइब्रेरी static/js में नहीं है — कृपया Stellura फिर से स्थापित करें।'), 'error'); };
      document.head.appendChild(sc);
    }
    loading.push(cb);
  }
  STL.ensureECharts = ensureECharts;

  // ---------------------------------------------------------------- small pictograms for the gallery
  var I = {
    column: '<rect x="3" y="12" width="4" height="9"/><rect x="10" y="6" width="4" height="15"/><rect x="17" y="9" width="4" height="12"/>',
    bar: '<rect x="3" y="3" width="10" height="4"/><rect x="3" y="10" width="16" height="4"/><rect x="3" y="17" width="7" height="4"/>',
    stackedColumn: '<rect x="3" y="14" width="5" height="7"/><rect x="3" y="9" width="5" height="5" opacity=".5"/><rect x="11" y="8" width="5" height="13"/><rect x="11" y="4" width="5" height="4" opacity=".5"/>',
    percentColumn: '<rect x="3" y="3" width="6" height="18"/><rect x="3" y="3" width="6" height="8" opacity=".45"/><rect x="13" y="3" width="6" height="18"/><rect x="13" y="3" width="6" height="12" opacity=".45"/>',
    combo: '<rect x="3" y="12" width="4" height="9"/><rect x="10" y="8" width="4" height="13"/><rect x="17" y="14" width="4" height="7"/><polyline points="4 8 12 4 20 9" fill="none"/>',
    pareto: '<rect x="3" y="6" width="4" height="15"/><rect x="9" y="12" width="4" height="9"/><rect x="15" y="16" width="4" height="5"/><polyline points="4 6 11 4 20 3" fill="none"/>',
    waterfall: '<rect x="3" y="12" width="4" height="9"/><rect x="9" y="6" width="4" height="6" opacity=".6"/><rect x="15" y="6" width="4" height="9" opacity=".6"/>',
    line: '<polyline points="3 17 9 10 14 14 21 5" fill="none"/>',
    area: '<polygon points="3 21 3 15 9 9 14 13 21 5 21 21" opacity=".45"/><polyline points="3 15 9 9 14 13 21 5" fill="none"/>',
    stackedArea: '<polygon points="3 21 3 14 10 12 21 8 21 21" opacity=".35"/><polygon points="3 21 3 18 10 17 21 15 21 21" opacity=".7"/>',
    calendar: '<rect x="3" y="4" width="18" height="17" rx="2" fill="none"/><rect x="6" y="9" width="3" height="3"/><rect x="11" y="9" width="3" height="3" opacity=".5"/><rect x="16" y="9" width="3" height="3" opacity=".25"/><rect x="6" y="14" width="3" height="3" opacity=".25"/><rect x="11" y="14" width="3" height="3"/>',
    pie: '<path d="M12 3a9 9 0 1 0 9 9h-9z" opacity=".5"/><path d="M12 3v9h9a9 9 0 0 0-9-9z"/>',
    donut: '<circle cx="12" cy="12" r="7" fill="none" stroke-width="5" opacity=".45"/><path d="M12 5a7 7 0 0 1 7 7" fill="none" stroke-width="5"/>',
    rose: '<path d="M12 12 12 3a9 9 0 0 1 8 5z"/><path d="M12 12 20 8a7 7 0 0 1 0 8z" opacity=".6"/><path d="M12 12 20 16a5 5 0 0 1-8 4z" opacity=".4"/>',
    funnel: '<polygon points="3 4 21 4 17 10 7 10"/><polygon points="7 12 17 12 15 17 9 17" opacity=".6"/><rect x="10" y="19" width="4" height="2" opacity=".4"/>',
    treemap: '<rect x="3" y="3" width="11" height="18"/><rect x="15" y="3" width="6" height="9" opacity=".6"/><rect x="15" y="13" width="6" height="8" opacity=".35"/>',
    sunburst: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7" fill="none" stroke-width="3" opacity=".5"/>',
    scatter: '<circle cx="6" cy="17" r="1.8"/><circle cx="11" cy="12" r="1.8"/><circle cx="16" cy="8" r="1.8"/><circle cx="19" cy="14" r="1.8"/><circle cx="8" cy="8" r="1.8"/>',
    bubble: '<circle cx="8" cy="15" r="4" opacity=".5"/><circle cx="16" cy="9" r="5" opacity=".5"/><circle cx="17" cy="18" r="2"/>',
    heatmap: '<rect x="3" y="3" width="5" height="5"/><rect x="10" y="3" width="5" height="5" opacity=".5"/><rect x="17" y="3" width="4" height="5" opacity=".25"/><rect x="3" y="10" width="5" height="5" opacity=".4"/><rect x="10" y="10" width="5" height="5"/><rect x="17" y="10" width="4" height="5" opacity=".6"/>',
    radar: '<polygon points="12 3 20 9 17 19 7 19 4 9" fill="none"/><polygon points="12 7 16 10 15 15 9 15 8 10" opacity=".5"/>',
    histogram: '<rect x="3" y="14" width="3" height="7"/><rect x="7" y="9" width="3" height="12"/><rect x="11" y="4" width="3" height="17"/><rect x="15" y="10" width="3" height="11"/><rect x="19" y="16" width="2" height="5"/>',
    sankey: '<rect x="3" y="4" width="3" height="7"/><rect x="3" y="14" width="3" height="6"/><rect x="18" y="4" width="3" height="16"/><path d="M6 6C12 6 12 8 18 8M6 17C12 17 12 15 18 15" fill="none" opacity=".6" stroke-width="3"/>',
    boxplot: '<rect x="7" y="8" width="10" height="8" fill="none"/><line x1="12" y1="3" x2="12" y2="8"/><line x1="12" y1="16" x2="12" y2="21"/><line x1="7" y1="12" x2="17" y2="12"/>',
    gauge: '<path d="M4 17a8 8 0 0 1 16 0" fill="none" stroke-width="3" opacity=".4"/><path d="M4 17a8 8 0 0 1 8-8" fill="none" stroke-width="3"/><line x1="12" y1="17" x2="16" y2="11"/>'
  };
  function icon(t) { return '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + (I[t] || '') + '</svg>'; }
  STL.chartIcon = icon;

  // ---------------------------------------------------------------- state
  var CS = { seq: 0, bigSel: null, srcSig: '', open: false, expanded: false, type: 'column', spec: null, inst: null, prof: null, sig: '', sel: null, baseIdx: null, selLabel: '', out: null, palette: 'aurora', cache: null };
  STL.board = STL.board || { pins: null };
  function loadPins() { if (STL.board.pins) return; try { STL.board.pins = JSON.parse(localStorage.getItem('stellura_board') || '[]'); } catch (e) { STL.board.pins = []; } }
  function savePins() { try { localStorage.setItem('stellura_board', JSON.stringify(STL.board.pins)); } catch (e) {} }
  STL.boardLoad = loadPins; STL.boardSave = savePins;

  // the rows come from the editor, or - for a Large File - from the engine, which answers every chart from all the rows
  function isBig() { return !!(window.BIG && BIG.active && BIG.ds); }
  function HD() { return isBig() ? BIG.headers : headers; }
  function RD() { return isBig() ? STL.bigCharts.sample.rows : rawData; }
  function noData() {
    if (isBig()) return false;
    if (!U.hasData()) { toast(T('Open a file first, or try the sample data.', 'पहले फ़ाइल खोलें, या नमूना डेटा आज़माएँ।'), 'info'); return true; }
    return false;
  }
  function viewIdx() { if (isBig()) return STL.bigCharts.sample.idx; return (CS.sel && CS.baseIdx) ? CS.baseIdx : (typeof getDisplayData === 'function' ? getDisplayData() : RD().map(function (_, i) { return i; })); }
  // charts always sit on a white card with dark text, in light and dark theme alike: what you copy or save is readable in Word / PowerPoint
  function env() { return { hi: hi(), text: '#334155', sub: '#64748b', grid: 'rgba(148,163,184,.28)', palette: CS.palette }; }
  function profile() {
    var sig = (isBig() ? 'big:' + BIG.ds : 'mem') + HD().join('|') + '#' + RD().length + '#' + (!isBig() && filteredData ? filteredData.length : 'all');
    if (CS.sig !== sig || !CS.prof) { CS.prof = CH.profile(HD(), RD(), viewIdx()); CS.sig = sig; }
    return CS.prof;
  }
  function good(p) { return p.numeric && !p.serial && !p.code && !p.unique; }

  // which spec fields each chart uses
  var USES = {
    x: 'column bar stackedColumn percentColumn combo pareto waterfall line area stackedArea calendar pie donut rose funnel treemap sunburst heatmap sankey radar boxplot',
    measure: 'column bar stackedColumn percentColumn combo pareto waterfall line area stackedArea calendar pie donut rose funnel treemap sunburst heatmap sankey radar boxplot gauge',
    multi: 'column bar line area combo radar',
    split: 'column bar stackedColumn percentColumn line area stackedArea treemap sunburst heatmap sankey scatter bubble', then: 'sankey',
    xy: 'scatter bubble histogram', y: 'scatter bubble', size: 'bubble', bins: 'histogram',
    sort: 'column bar stackedColumn percentColumn combo pareto waterfall pie donut rose funnel treemap sunburst boxplot sankey', top: 'column bar stackedColumn percentColumn combo pareto waterfall pie donut rose funnel treemap sunburst boxplot',
    labels: 'column bar stackedColumn percentColumn combo pareto waterfall line area stackedArea pie donut rose funnel', smooth: 'line area stackedArea combo', trend: 'scatter',
    time: 'column bar stackedColumn percentColumn combo line area stackedArea pie donut rose funnel calendar'
  };
  function uses(field, type) { return (' ' + USES[field] + ' ').indexOf(' ' + type + ' ') >= 0; }

  // pick sensible columns when the chart type changes (keepX: the person chose the category column themselves)
  var TREND = 'line area stackedArea calendar';
  function adapt(type, keepX) {
    var p = profile(), sp = CS.spec, nums = p.filter(good), cats = p.filter(function (c) { return !c.numeric && !c.date && !c.code && c.distinct >= 2 && c.distinct <= 60 && !c.unique; }), dates = p.filter(function (c) { return c.date && !c.numeric; });
    var col = function (i) { return i !== undefined && i >= 0 && p[i]; };
    if (type === 'scatter' || type === 'bubble' || type === 'histogram') {
      if (!col(sp.xnum) || !p[sp.xnum].numeric) sp.xnum = nums[0] ? nums[0].index : undefined;
      if (type !== 'histogram' && (!col(sp.ynum) || sp.ynum === sp.xnum)) sp.ynum = (nums.filter(function (n) { return n.index !== sp.xnum; })[0] || nums[0] || {}).index;
      if (type === 'bubble' && !(sp.size >= 0)) sp.size = (nums.filter(function (n) { return n.index !== sp.xnum && n.index !== sp.ynum; })[0] || nums[0] || {}).index;
    } else if (type !== 'gauge') {
      var trend = (' ' + TREND + ' ').indexOf(' ' + type + ' ') >= 0, cur = col(sp.x), curDate = cur && cur.date && !cur.numeric;
      if (!keepX) {
        if (type === 'calendar') { if (!curDate) sp.x = dates[0] ? dates[0].index : sp.x; }
        else if (trend) { if (!curDate && dates[0]) sp.x = dates[0].index; else if (!cur) sp.x = (cats[0] || p[0] || {}).index; }
        else if (!cur || (cur.numeric && !cur.date) || cur.unique || curDate) sp.x = (cats[0] || dates[0] || p[0] || {}).index;     // not a time chart: a category reads better than one bar per day
      } else if (!cur) sp.x = (cats[0] || dates[0] || p[0] || {}).index;
      cur = col(sp.x); curDate = cur && cur.date && !cur.numeric;
      if (type === 'calendar') sp.time = 'day';
      else if (curDate) { if (uses('time', type) && (!sp.time || sp.time === 'none')) sp.time = 'month'; if (!uses('time', type)) sp.time = 'none'; }
      else sp.time = 'none';
      if (['stackedColumn', 'percentColumn', 'stackedArea', 'sunburst', 'heatmap', 'sankey'].indexOf(type) >= 0 && !(sp.g >= 0 && sp.g !== sp.x)) sp.g = (cats.filter(function (c) { return c.index !== sp.x; })[0] || {}).index;
      if (!uses('split', type)) sp.g = -1;
      if (type !== 'sankey' || sp.g2 === sp.x || sp.g2 === sp.g) sp.g2 = -1;
    }
    if (!sp.ys || !sp.ys.length || (sp.ys.length === 1 && sp.ys[0].col < 0 && nums[0] && !sp._userMeasure)) sp.ys = nums[0] ? [{ col: nums[0].index, fn: 'sum' }] : [{ col: -1, fn: 'count' }];
    if (type === 'combo' || type === 'radar') { var need = type === 'radar' ? 3 : 2; nums.forEach(function (n) { if (sp.ys.length < need && !sp.ys.some(function (y) { return y.col === n.index; })) sp.ys.push({ col: n.index, fn: 'avg' }); }); }
    if (!uses('multi', type) && sp.ys.length > 1) sp.ys = sp.ys.slice(0, 1);
    if (type === 'sankey') { sp.ys = sp.ys.slice(0, 1); sp.ys[0].fn = sp.ys[0].col < 0 ? 'count' : 'sum'; if (!(sp.topN > 0)) sp.topN = 8; }
    if (sp.g >= 0 && sp.ys.length > 1) sp.g = -1;
  }

  // ---------------------------------------------------------------- the dock
  function dockHtml() {
    var gal = CH.TYPES.map(function (t) { return '<button class="cs-t" data-type="' + t.id + '" data-group="' + t.group + '"></button>'; }).join('');
    return '<div class="cs-head"><b id="csTitle"></b><span class="cs-grow"></span><button class="tb-btn" id="csAuto"></button><button class="cs-ic" id="csExpand" title="Expand">⤢</button><button class="cs-ic" id="csClose" aria-label="close">×</button></div>' +
      '<div class="cs-chartwrap"><div id="csChart"></div><div class="cs-msg" id="csMsg" style="display:none"></div></div>' +
      '<div class="cs-selbar" id="csSelBar" style="display:none"></div>' +
      '<div class="cs-cap" id="csCap"></div>' +
      '<div class="cs-tools"><button class="tb-btn" id="csPng"></button><button class="tb-btn" id="csCopy"></button><button class="tb-btn" id="csCsv"></button><button class="tb-btn" id="csPin"></button><button class="tb-btn" id="csBoard"></button><button class="tb-btn" id="csDash"></button></div>' +
      '<div class="cs-sec" id="csTypeLbl"></div><div class="cs-gallery" id="csGallery">' + gal + '</div>' +
      '<details class="cs-fields" id="csFieldsBox" open><summary id="csFieldsLbl"></summary><div class="cs-grid" id="csFields">' +
        '<label class="cs-f" data-use="x"><span id="csXl"></span><select id="csX" class="big-select"></select></label>' +
        '<label class="cs-f" data-use="time"><span id="csTl"></span><select id="csTime" class="big-select"></select></label>' +
        '<div class="cs-f wide" data-use="measure"><span id="csMl"></span><div id="csMeasures"></div><button class="cs-link" id="csAddM"></button></div>' +
        '<label class="cs-f" data-use="split"><span id="csGl"></span><select id="csG" class="big-select"></select></label>' +
        '<label class="cs-f" data-use="then"><span id="csG2l"></span><select id="csG2" class="big-select"></select></label>' +
        '<label class="cs-f" data-use="xy"><span id="csXnl"></span><select id="csXn" class="big-select"></select></label>' +
        '<label class="cs-f" data-use="y"><span id="csYnl"></span><select id="csYn" class="big-select"></select></label>' +
        '<label class="cs-f" data-use="size"><span id="csSzl"></span><select id="csSz" class="big-select"></select></label>' +
        '<label class="cs-f" data-use="bins"><span id="csBl"></span><select id="csBins" class="big-select"></select></label>' +
        '<label class="cs-f" data-use="sort"><span id="csSl"></span><select id="csSort" class="big-select"></select></label>' +
        '<label class="cs-f" data-use="top"><span id="csTopl"></span><select id="csTop" class="big-select"></select></label>' +
        '<label class="cs-f" data-use="palette"><span id="csPl"></span><select id="csPal" class="big-select"></select></label>' +
        '<label class="cs-f wide"><span id="csTil"></span><input id="csTitleIn" class="big-input"></label>' +
        '<div class="cs-f wide cs-tg"><label data-use="labels"><input type="checkbox" id="csLab"> <span id="csLabl"></span></label><label data-use="smooth"><input type="checkbox" id="csSm"> <span id="csSml"></span></label><label data-use="trend"><input type="checkbox" id="csTr"> <span id="csTrl"></span></label></div>' +
      '</div></details>' +
      '<div class="cs-hint" id="csHint"></div>';
  }
  function ensureDock() {
    if ($('chartStudio')) return;
    var d = document.createElement('aside'); d.id = 'chartStudio'; d.className = 'cs-dock'; d.setAttribute('aria-label', 'Chart Studio');
    d.innerHTML = dockHtml(); document.body.appendChild(d);
    $('csClose').onclick = STL.closeChartStudio; $('csExpand').onclick = function () { CS.expanded = !CS.expanded; document.body.classList.toggle('cs-wide', CS.expanded); setTimeout(resize, 260); };
    $('csAuto').onclick = function () { STL.openBoard(); };
    d.querySelectorAll('.cs-t').forEach(function (b) { b.onclick = function () { setType(b.dataset.type); }; });
    var on = function (id, ev, fn) { var e = $(id); if (e) e.addEventListener(ev, fn); };
    on('csX', 'change', function () { CS.spec.x = +this.value; adapt(CS.type, true); sync(); redraw(); });
    on('csTime', 'change', function () { CS.spec.time = this.value; redraw(); });
    on('csG', 'change', function () { CS.spec.g = +this.value; if (CS.spec.g >= 0 && CS.spec.ys.length > 1) CS.spec.ys = CS.spec.ys.slice(0, 1); sync(); redraw(); });
    on('csG2', 'change', function () { CS.spec.g2 = +this.value; sync(); redraw(); });
    on('csXn', 'change', function () { CS.spec.xnum = +this.value; redraw(); }); on('csYn', 'change', function () { CS.spec.ynum = +this.value; redraw(); }); on('csSz', 'change', function () { CS.spec.size = +this.value; redraw(); });
    on('csBins', 'change', function () { CS.spec.bins = +this.value; redraw(); }); on('csSort', 'change', function () { CS.spec.sort = this.value; redraw(); });
    on('csTop', 'change', function () { CS.spec.topN = +this.value; redraw(); }); on('csPal', 'change', function () { CS.palette = this.value; redraw(); });
    on('csTitleIn', 'input', function () { CS.spec.title = this.value; clearTimeout(CS._tt); CS._tt = setTimeout(redraw, 250); });
    on('csLab', 'change', function () { CS.spec.labels = this.checked; redraw(); }); on('csSm', 'change', function () { CS.spec.smooth = this.checked; redraw(); }); on('csTr', 'change', function () { CS.spec.trend = this.checked; redraw(); });
    on('csAddM', 'click', function () { var p = profile(), n = p.filter(good).filter(function (c) { return !CS.spec.ys.some(function (y) { return y.col === c.index; }); })[0]; if (CS.spec.ys.length >= 6) return; CS.spec.ys.push({ col: n ? n.index : -1, fn: n ? 'sum' : 'count' }); CS.spec.g = -1; CS.spec._userMeasure = true; sync(); redraw(); });
    on('csPng', 'click', savePng); on('csCopy', 'click', copyPng); on('csCsv', 'click', saveCsv); on('csPin', 'click', pin); on('csBoard', 'click', function () { STL.openBoard(); }); on('csDash', 'click', function () { STL.openDashboard(); });
    if (window.ResizeObserver) new ResizeObserver(function () { resize(); }).observe($('csChart'));
  }
  function resize() { if (CS.inst) try { CS.inst.resize(); } catch (e) {} }

  function opts(list, val, none) { return (none ? '<option value="-1"' + (val < 0 || val === undefined ? ' selected' : '') + '>' + none + '</option>' : '') + list.map(function (o) { return '<option value="' + o[0] + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join(''); }
  function sync() {
    var sp = CS.spec, type = CS.type, p = profile(), all = HD().map(function (h, i) { return [i, h]; }), numeric = all.filter(function (a) { return p[a[0]].numeric; });
    $('csTitle').textContent = T('Chart Studio', 'चार्ट स्टूडियो'); $('csAuto').textContent = '✨ ' + T('Auto charts', 'ऑटो चार्ट');
    $('csFieldsLbl').textContent = T('What to show', 'क्या दिखाएँ');
    $('csTypeLbl').textContent = T('Chart type', 'चार्ट का प्रकार');
    document.querySelectorAll('#csGallery .cs-t').forEach(function (b) { var tt = CH.TYPES.filter(function (x) { return x.id === b.dataset.type; })[0]; b.innerHTML = icon(b.dataset.type) + '<span>' + esc(nm(tt.name)) + '</span>'; b.classList.toggle('on', b.dataset.type === type); b.title = nm(CH.GROUPS[tt.group]) + ' · ' + nm(tt.name); });
    var xl = type === 'calendar' ? T('Date column', 'तारीख कॉलम') : type === 'sankey' ? T('From (category)', 'से (श्रेणी)') : type === 'heatmap' ? T('Rows (category)', 'पंक्तियाँ (श्रेणी)') : T('Category or date', 'श्रेणी या तारीख');
    $('csXl').textContent = xl; $('csX').innerHTML = opts(all, sp.x); $('csTl').textContent = T('Group dates by', 'तारीख इस प्रकार समूहित');
    $('csTime').innerHTML = [['none', T('(as is)', '(जैसा है)')], ['day', T('Day', 'दिन')], ['month', T('Month', 'माह')], ['quarter', T('Quarter', 'तिमाही')], ['fy', T('Financial year', 'वित्त वर्ष')], ['year', T('Year', 'वर्ष')], ['weekday', T('Weekday', 'सप्ताह का दिन')]].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === (sp.time || 'none') ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('');
    $('csMl').textContent = type === 'radar' ? T('Measures (3 or more)', 'माप (3 या अधिक)') : (uses('multi', type) ? T('Measure(s)', 'माप') : T('Measure', 'माप'));
    $('csMeasures').innerHTML = sp.ys.map(function (y, i) {
      return '<div class="cs-m"><select class="big-select" data-mc="' + i + '">' + opts(numeric, y.col, T('(count of rows)', '(पंक्तियों की गिनती)')) + '</select><select class="big-select" data-mf="' + i + '"' + (y.col < 0 ? ' disabled' : '') + '>' + CH.FUNCS.filter(function (f) { return type === 'sankey' ? f[0] === (y.col >= 0 ? 'sum' : 'count') : (y.col >= 0 || f[0] === 'count'); }).map(function (f) { return '<option value="' + f[0] + '"' + (f[0] === y.fn ? ' selected' : '') + '>' + nm(f[1]) + '</option>'; }).join('') + '</select>' + (sp.ys.length > 1 ? '<button class="cs-ic sm" data-mr="' + i + '" aria-label="remove">×</button>' : '') + '</div>';
    }).join('');
    $('csMeasures').querySelectorAll('[data-mc]').forEach(function (e) { e.onchange = function () { var y = sp.ys[+e.dataset.mc]; y.col = +e.value; if (y.col < 0) y.fn = 'count'; else if (y.fn === 'count') y.fn = 'sum'; sp._userMeasure = true; sync(); redraw(); }; });
    $('csMeasures').querySelectorAll('[data-mf]').forEach(function (e) { e.onchange = function () { sp.ys[+e.dataset.mf].fn = e.value; redraw(); }; });
    $('csMeasures').querySelectorAll('[data-mr]').forEach(function (e) { e.onclick = function () { sp.ys.splice(+e.dataset.mr, 1); sync(); redraw(); }; });
    $('csAddM').textContent = '+ ' + T('Add a measure', 'माप जोड़ें'); $('csAddM').style.display = uses('multi', type) ? '' : 'none';
    $('csGl').textContent = type === 'sankey' ? T('To (category)', 'तक (श्रेणी)') : type === 'heatmap' ? T('Columns (category)', 'स्तंभ (श्रेणी)') : T('Split / colour by', 'इसके अनुसार बाँटें / रंग'); $('csG').innerHTML = opts(all.filter(function (a) { return a[0] !== sp.x; }), sp.g, T('(none)', '(कोई नहीं)'));
    $('csG2l').textContent = T('Then to (optional)', 'फिर (वैकल्पिक)'); $('csG2').innerHTML = opts(all.filter(function (a) { return a[0] !== sp.x && a[0] !== sp.g; }), sp.g2, T('(none)', '(कोई नहीं)'));
    $('csXnl').textContent = type === 'histogram' ? T('Number column', 'संख्या कॉलम') : T('X (number)', 'X (संख्या)'); $('csXn').innerHTML = opts(numeric, sp.xnum);
    $('csYnl').textContent = T('Y (number)', 'Y (संख्या)'); $('csYn').innerHTML = opts(numeric, sp.ynum);
    $('csSzl').textContent = T('Bubble size (number)', 'बबल आकार (संख्या)'); $('csSz').innerHTML = opts(numeric, sp.size, T('(none)', '(कोई नहीं)'));
    $('csBl').textContent = T('Number of bars', 'पट्टियों की संख्या'); $('csBins').innerHTML = [[0, T('Automatic', 'स्वतः')], [8, '8'], [12, '12'], [20, '20'], [30, '30'], [50, '50']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === (sp.bins || 0) ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('');
    $('csSl').textContent = T('Order', 'क्रम'); $('csSort').innerHTML = [['desc', T('Largest first', 'बड़ा पहले')], ['asc', T('Smallest first', 'छोटा पहले')], ['label', T('A to Z / by date', 'A-Z / तारीख')], ['natural', T('As numbers', 'संख्या क्रम')]].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === (sp.sort || 'desc') ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('');
    $('csTopl').textContent = T('Show only the top', 'केवल शीर्ष दिखाएँ'); $('csTop').innerHTML = [[0, T('All', 'सभी')], [5, '5'], [8, '8'], [10, '10'], [15, '15'], [20, '20'], [30, '30']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === (sp.topN || 0) ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('');
    $('csPl').textContent = T('Colours', 'रंग'); $('csPal').innerHTML = [['aurora', 'Aurora'], ['saffron', T('Saffron & green', 'केसरिया-हरा')], ['ocean', T('Ocean', 'सागर')], ['safe', T('Colour-blind safe', 'रंग-अंध सुरक्षित')], ['mono', T('One colour', 'एक रंग')]].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === CS.palette ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('');
    $('csTil').textContent = T('Title', 'शीर्षक'); $('csTitleIn').value = sp.title || ''; $('csTitleIn').placeholder = autoTitle(type, sp);
    $('csLabl').textContent = T('Show values', 'मान दिखाएँ'); $('csLab').checked = !!sp.labels; $('csSml').textContent = T('Smooth lines', 'चिकनी रेखाएँ'); $('csSm').checked = !!sp.smooth; $('csTrl').textContent = T('Trend line', 'प्रवृत्ति रेखा'); $('csTr').checked = !!sp.trend;
    document.querySelectorAll('#csFields [data-use]').forEach(function (e) { var f = e.dataset.use, show = f === 'palette' ? true : uses(f, type); if (f === 'time') show = show && sp.x >= 0 && p[sp.x] && p[sp.x].date; if (f === 'xy' && type === 'histogram') show = true; e.style.display = show ? '' : 'none'; });
    $('csPng').textContent = '⬇ ' + T('Picture', 'चित्र'); $('csCopy').textContent = T('Copy', 'कॉपी'); $('csCsv').textContent = '⬇ ' + T('Data (CSV)', 'डेटा (CSV)'); $('csPin').textContent = '📌 ' + T('Pin to board', 'बोर्ड पर लगाएँ'); $('csBoard').textContent = T('Board', 'बोर्ड'); $('csDash').textContent = '📋 ' + T('Dashboard', 'डैशबोर्ड'); $('csDash').title = T('Arrange the pinned charts on a page and export to PowerPoint or PDF', 'पिन किए चार्ट एक पृष्ठ पर सजाएँ और PowerPoint या PDF में निर्यात करें');
    $('csHint').textContent = T('Click a bar, slice or cell to show only those rows in the table (Ctrl+click adds more). Drag on the chart with the select tool (top right) to pick a range. Scroll with Ctrl to zoom.', 'तालिका में केवल वे पंक्तियाँ देखने के लिए पट्टी, टुकड़े या खाने पर क्लिक करें (Ctrl+क्लिक से और जोड़ें)। दायरा चुनने के लिए ऊपर दाएँ के चयन औज़ार से चार्ट पर खींचें। ज़ूम के लिए Ctrl के साथ स्क्रॉल करें।');
    $('csExpand').title = T('Wider', 'चौड़ा');
  }

  // ---------------------------------------------------------------- opening and type switching
  STL.openChartStudio = function (preset) {
    if (noData()) return;
    if (isBig() && STL.bigCharts.sample.ds !== BIG.ds) {                       // learn which columns are numbers, dates or categories from a small sample
      STL.bigCharts.loadSample().then(function () { STL.openChartStudio(preset); }).catch(function (e) { toast(e.message, 'error'); });
      return;
    }
    var src = isBig() ? 'big:' + BIG.ds : 'mem';
    if (CS.srcSig !== src) { CS.srcSig = src; CS.spec = null; CS.prof = null; CS.sel = null; CS.baseIdx = null; CS.bigSel = null; CS.stale = true; }
    ensureDock(); profile();
    document.body.classList.add('cs-open'); $('chartStudio').classList.add('open'); CS.open = true;
    if (preset && preset.spec) { CS.type = preset.type; CS.spec = JSON.parse(JSON.stringify(preset.spec)); CS.spec._userMeasure = true; if (!preset.keepTitle) CS.spec.title = ''; if (preset.palette) CS.palette = preset.palette; }   // a chart that was asked for keeps its measure (e.g. a plain count of rows)
    else if (!CS.spec || CS.spec.x >= HD().length || !CS.prof || CS.stale) {
      var rec = CH.recommend(HD(), RD(), viewIdx(), 8)[0];
      if (rec) { CS.type = rec.type; CS.spec = JSON.parse(JSON.stringify(rec.spec)); CS.spec.title = ''; } else { CS.type = 'column'; CS.spec = { ys: [{ col: -1, fn: 'count' }], sort: 'desc' }; }
      CS.stale = false;
    }
    adapt(CS.type, true); sync(); ensureECharts(function () { redraw(); });
    setTimeout(resize, 300);
  };
  STL.closeChartStudio = function () { CS.open = false; document.body.classList.remove('cs-open', 'cs-wide'); CS.expanded = false; var d = $('chartStudio'); if (d) d.classList.remove('open'); if (CS.sel || CS.bigSel) clearSelection(); };
  function setType(type) { CS.type = type; var sp = CS.spec; if (['line', 'area', 'stackedArea'].indexOf(type) >= 0) sp.sort = undefined; adapt(type); sync(); redraw(); }

  // ---------------------------------------------------------------- drawing
  // the heading follows the current choices; only a title the person typed is kept
  function autoTitle(type, sp) {
    var h = HD(), nmOf = function (i) { return i >= 0 && h[i] !== undefined ? h[i] : ''; }, y0 = sp.ys && sp.ys[0], m = y0 ? (y0.col >= 0 ? nmOf(y0.col) : T('Rows', 'पंक्तियाँ')) : '';
    if (type === 'scatter' || type === 'bubble') return nmOf(sp.xnum) + ' vs ' + nmOf(sp.ynum);
    if (type === 'histogram') return T('Spread of ', '') + nmOf(sp.xnum);
    if (type === 'gauge') return m;
    if (type === 'heatmap') return nmOf(sp.x) + ' × ' + nmOf(sp.g);
    if (type === 'sankey') return nmOf(sp.x) + ' → ' + nmOf(sp.g) + (sp.g2 >= 0 ? ' → ' + nmOf(sp.g2) : '');
    if (type === 'calendar') return T('Rows per day — ', 'प्रतिदिन — ') + nmOf(sp.x);
    if (sp.ys && sp.ys.length > 1) return nmOf(sp.x);
    return m + ' — ' + nmOf(sp.x);
  }
  function message(txt) { var m = $('csMsg'); m.textContent = txt; m.style.display = txt ? 'flex' : 'none'; $('csChart').style.visibility = txt ? 'hidden' : 'visible'; }
  var redrawTimer = null;
  function redraw() {
    if (!CS.open) return;
    ensureECharts(function () {
      var big = isBig(), idx = viewIdx(), seq = ++CS.seq, bspec = Object.assign({}, CS.spec); bspec.title = CS.spec.title || autoTitle(CS.type, CS.spec);
      function fail(e) {
        if (seq !== CS.seq) return;
        message(/two number|Choose/.test(e.message) ? T('Choose the number columns for this chart.', 'इस चार्ट के लिए संख्या वाले कॉलम चुनें।') : e.message);
        if (CS.inst) CS.inst.clear(); $('csCap').innerHTML = '';
      }
      function draw(out, matched) {
        if (seq !== CS.seq) return;                                              // a newer question was asked while the engine was working
        if (!matched) { message(T('No rows to show. Clear the filters.', 'दिखाने के लिए कोई पंक्ति नहीं। फ़िल्टर हटाएँ।')); return; }
        message(''); CS.out = out;
        var option = decorate(out.option);
        if (!CS.inst || CS.inst.isDisposed()) { CS.inst = echarts.init($('csChart'), null, { renderer: 'canvas' }); bind(); }
        CS.inst.setOption(option, true);
        var filtered = big ? !!(BIG.search || BIG.filters.some(function (f) { return !f._chart; })) : (CS.sel ? (CS.baseIdx && CS.baseIdx.length !== RD().length) : !!filteredData);
        $('csCap').innerHTML = out.caption.map(function (c) { return '<p>' + esc(c) + '</p>'; }).join('') +
          (big && out.big && out.big.more ? '<p>' + T('The biggest groups are shown; smaller ones are combined as “Others”.', 'सबसे बड़े समूह दिखाए गए हैं; छोटे “अन्य” में जोड़े गए हैं।') + '</p>' : '') +
          '<div class="cs-meta">' + (big ? T('Calculated from all ', 'सभी ') + Number(matched).toLocaleString('en-IN') + T(' rows of the large file', ' पंक्तियों से गणना (बड़ी फ़ाइल)') : T('Using ', 'उपयोग: ') + Number(matched).toLocaleString('en-IN') + T(' rows', ' पंक्तियाँ')) + (filtered ? (big ? T(' (grid search / filters applied)', ' (ग्रिड खोज / फ़िल्टर लागू)') : T(' (table filters applied)', ' (तालिका फ़िल्टर लागू)')) : '') + '</div>';
        CS.cur = { type: CS.type, spec: JSON.parse(JSON.stringify(CS.spec)) };
        if (big) bigSelState();
      }
      if (big) { STL.bigCharts.build(CS.type, bspec, env()).then(function (out) { draw(out, out.big.matched); }, fail); return; }
      var out;
      try { out = CH.build(CS.type, bspec, HD(), RD(), idx, env()); } catch (e) { fail(e); return; }
      draw(out, idx.length);
    });
  }
  STL.redrawChartStudio = function () { clearTimeout(redrawTimer); redrawTimer = setTimeout(function () { if (CS.open) { profile(); redraw(); } }, 120); };

  // dim what is not selected
  function dimSeries(o, cats, on) {
    var dim = { opacity: 0.25 };
    (o.series || []).forEach(function (sr) {
      if ((sr.type === 'bar' || sr.type === 'line') && Array.isArray(sr.data) && sr.data.length === cats.length) sr.data = sr.data.map(function (v, i) { return on[i] ? v : { value: v, itemStyle: dim }; });
      if ((sr.type === 'pie' || sr.type === 'funnel' || sr.type === 'treemap') && Array.isArray(sr.data)) sr.data = sr.data.map(function (it) { return it._cat !== undefined && !on[it._cat] ? Object.assign({}, it, { itemStyle: Object.assign({}, it.itemStyle, dim) }) : it; });
    });
  }
  function decorate(option) {
    var o = option, d = CS.out && CS.out.data;
    if (isBig()) {                                                                 // the selection is a filter on the file: dim the bars that are not part of it
      var bs = CS.bigSel;
      if (bs && bs.xkeys && d && d.cats && d.cats.length) { var bc = o._cats || d.cats; dimSeries(o, bc, bc.map(function (c) { return bs.xkeys.indexOf(c.label) >= 0; })); }
      return o;
    }
    var sel = CS.sel;
    if (sel && CS.type === 'sankey' && CS.out.ctx.sankey) {
      var K = CS.out.ctx.sankey, hit = function (rs) { for (var q = 0; q < rs.length; q++) if (sel.has(rs[q])) return true; return false; }, sr0 = o.series[0];
      sr0.data = sr0.data.map(function (n) { return hit(K.nodes[n._ni].rows) ? n : Object.assign({}, n, { itemStyle: { opacity: 0.25 }, label: { opacity: 0.4 } }); });
      sr0.links = sr0.links.map(function (l) { return hit(K.links[l._li].rows) ? l : Object.assign({}, l, { lineStyle: { opacity: 0.05 } }); });
      return o;
    }
    if (!sel || !d || !d.cats || !d.cats.length) return o;
    var cats = o._cats || d.cats, on = cats.map(function (c) { return c.rows.some(function (r) { return sel.has(r); }); });
    dimSeries(o, cats, on);
    (o.series || []).forEach(function (sr) { if (sr.type === 'scatter' && sr.data && sr.data.length < 30000) sr.data = sr.data.map(function (pt) { return sel.has(pt.ri) ? pt : Object.assign({}, pt, { itemStyle: { opacity: 0.12 } }); }); });
    return o;
  }

  // ---------------------------------------------------------------- interactions: chart -> table
  function bind() {
    var inst = CS.inst;
    inst.on('click', function (p) {
      if (isBig()) { bigClick(p); return; }
      var out = CS.out; if (!out) return; var type = CS.type, d = out.data, cats = out.option._cats || d.cats, rows = null, label = '';
      var add = !!(p.event && p.event.event && (p.event.event.ctrlKey || p.event.event.metaKey));
      try {
        if (type === 'scatter' || type === 'bubble') { if (p.data && p.data.ri !== undefined) { rows = [p.data.ri]; label = T('row ', 'पंक्ति ') + (p.data.ri + 1); } }
        else if (type === 'histogram') { var h = out.ctx.hist, lo = h.edges[p.dataIndex], hi2 = h.edges[p.dataIndex + 1], last = p.dataIndex === h.counts.length - 1; rows = viewIdx().filter(function (i) { var x = CH.num ? CH.num(RD()[i][CS.spec.xnum]) : parseFloat(RD()[i][CS.spec.xnum]); return x !== null && x >= lo && (last ? x <= hi2 : x < hi2); }); label = HD()[CS.spec.xnum] + ' ' + CH.compact(lo) + '–' + CH.compact(hi2); }
        else if (type === 'heatmap') { var m = out.ctx.matrix, xv = m.xs[p.value[0]], yv = m.ys[p.value[1]]; rows = viewIdx().filter(function (i) { return String(RD()[i][CS.spec.x]).trim() === xv && String(RD()[i][CS.spec.g]).trim() === yv; }); label = xv + ' × ' + yv; }
        else if (type === 'calendar') { var day = p.value[0]; rows = viewIdx().filter(function (i) { var ms = STL.pend.parseDate(RD()[i][CS.spec.x], false); return ms !== null && CH.bucketKey(ms, 'day') === day; }); label = day; }
        else if (type === 'boxplot') { var bl = out.ctx.box.labels[p.dataIndex !== undefined && p.seriesType === 'boxplot' ? p.dataIndex : (p.value ? p.value[0] : 0)]; rows = viewIdx().filter(function (i) { return String(RD()[i][CS.spec.x]).trim() === bl; }); label = bl; }
        else if (type === 'gauge') return;
        else if (type === 'sankey') {
          var K2 = out.ctx.sankey, itm = p.dataType === 'edge' ? K2.links[p.data._li] : K2.nodes[p.data._ni];
          if (!itm) return; if (itm.isOthers) { toast(T('"Others" combines smaller groups. Choose a single band or box.', '"अन्य" छोटे समूहों को जोड़ता है। कोई एक पट्टी या डिब्बा चुनें।'), 'info'); return; }
          rows = itm.rows; label = p.dataType === 'edge' ? K2.nodes[itm.s].label + ' → ' + K2.nodes[itm.t].label : itm.label;
        }
        else {
          var ci = (p.data && p.data._cat !== undefined) ? p.data._cat : p.dataIndex, c = cats[ci]; if (!c) return;
          if (c.isOthers) { toast(T('"Others" combines smaller groups. Choose a single bar.', '"अन्य" छोटे समूहों को जोड़ता है। कोई एक पट्टी चुनें।'), 'info'); return; }
          var si = (p.data && p.data._ser !== undefined) ? p.data._ser : (d.split && p.seriesIndex !== undefined ? p.seriesIndex : -1), sk = si >= 0 ? d.seriesKeys[si] : null;
          rows = sk && c.rb && c.rb[sk] ? c.rb[sk] : c.rows; label = c.label + (sk && d.split ? ' · ' + d.series[si].name : '');
        }
      } catch (e) { rows = null; }
      if (rows && rows.length) applySelection(rows, label, add);
    });
    inst.on('brushSelected', function (ev) {
      if (isBig()) { clearTimeout(CS._bt); CS._bt = setTimeout(function () { bigBrush(ev); }, 250); return; }
      if (!CS.out) return; var b = ev.batch && ev.batch[0], rows = [], type = CS.type, d = CS.out.data, opt = CS.inst.getOption();
      if (!b || !b.selected || !b.selected.some(function (s2) { return s2.dataIndex && s2.dataIndex.length; })) { if (CS.sel && CS.fromBrush) clearSelection(true); return; }
      try {
        if (type === 'scatter' || type === 'bubble') b.selected.forEach(function (s2, si) { (s2.dataIndex || []).forEach(function (di) { var pt = opt.series[si].data[di]; if (pt && pt.ri !== undefined) rows.push(pt.ri); }); });
        else if (type === 'histogram') { var h = CS.out.ctx.hist, bins = {}; (b.selected[0].dataIndex || []).forEach(function (k) { bins[k] = 1; }); rows = viewIdx().filter(function (i) { var x = parseFloat(RD()[i][CS.spec.xnum]); if (isNaN(x)) return false; for (var k = 0; k < h.counts.length; k++) if (bins[k] && x >= h.edges[k] && (x < h.edges[k + 1] || k === h.counts.length - 1)) return true; return false; }); }
        else { var cats = CS.out.option._cats || d.cats, seen = {}; b.selected.forEach(function (s2) { (s2.dataIndex || []).forEach(function (di) { if (cats[di] && !cats[di].isOthers && !seen[di]) { seen[di] = 1; rows = rows.concat(cats[di].rows); } }); }); }
      } catch (e) { rows = []; }
      if (rows.length) { CS.fromBrush = true; applySelection(rows, T('selected range', 'चुना हुआ दायरा'), false, true); }
    });
  }

  // ---- large file: a click or a drag becomes a filter of the grid (shown as a purple chip), the chart itself keeps all its bars
  function bigSameSel(a, b) { return !!a && JSON.stringify(a.filters.map(function (f) { return [f.col, f.op, f.value, f.value2]; })) === JSON.stringify(b.filters.map(function (f) { return [f.col, f.op, f.value, f.value2]; })); }
  function bigClick(p) {
    var out = CS.out; if (!out) return;
    var add = !!(p.event && p.event.event && (p.event.event.ctrlKey || p.event.event.metaKey)), d = null;
    try { d = STL.bigCharts.selection(CS.type, CS.spec, out, p); } catch (e) { d = null; }
    if (!d) return;
    if (d.others) { toast(T('"Others" combines smaller groups. Choose a single bar.', '"अन्य" छोटे समूहों को जोड़ता है। कोई एक पट्टी चुनें।'), 'info'); return; }
    if (add && CS.bigSel) d = STL.bigCharts.combine(CS.spec, CS.bigSel, d);
    else if (bigSameSel(CS.bigSel, d)) { clearBigSelection(); return; }
    CS.fromBrush = false; applyBigSelection(d);
  }
  function bigBrush(ev) {
    var out = CS.out; if (!out) return; var d = null;
    try { d = STL.bigCharts.brush(CS.type, CS.spec, out, ev); } catch (e) { d = null; }
    if (!d) { if (CS.bigSel && CS.fromBrush) clearBigSelection(true); return; }
    if (bigSameSel(CS.bigSel, d)) return;
    CS.fromBrush = true; applyBigSelection(d);
  }
  function applyBigSelection(d) {
    BIG.filters = BIG.filters.filter(function (f) { return !f._chart; });
    d.filters.forEach(function (f) { BIG.filters.push(Object.assign({}, f, { _chart: true })); });
    CS.bigSel = { filters: d.filters, label: d.label, xkeys: d.xkeys || null };
    BIG.syncFilters(); showSelBar();
  }
  function clearBigSelection(quiet) {
    if (!CS.bigSel) return;
    BIG.filters = BIG.filters.filter(function (f) { return !f._chart; });
    CS.bigSel = null; CS.fromBrush = false; var b = $('csSelBar'); if (b) b.style.display = 'none';
    if (BIG.active) BIG.syncFilters();
    if (quiet && CS.inst) try { CS.inst.dispatchAction({ type: 'brush', areas: [] }); } catch (e) {}
  }
  // the grid's own chips may have removed the selection; keep the bar honest
  function bigSelState() {
    if (CS.bigSel && !BIG.filters.some(function (f) { return f._chart; })) { CS.bigSel = null; var b = $('csSelBar'); if (b) b.style.display = 'none'; }
    if (CS.bigSel) showSelBar();
  }

  function sameSet(a, b) { if (a.size !== b.size) return false; var ok = true; a.forEach(function (v) { if (!b.has(v)) ok = false; }); return ok; }
  function applySelection(rows, label, additive, fromBrush) {
    var set = additive && CS.sel ? new Set(Array.from(CS.sel).concat(rows)) : new Set(rows);
    if (!fromBrush && !additive && CS.sel && sameSet(CS.sel, set)) { clearSelection(); return; }
    if (!CS.sel) CS.baseIdx = viewIdx();
    CS.sel = set; CS.selLabel = additive && CS.selLabel ? CS.selLabel + ' + ' + label : label; if (!fromBrush) CS.fromBrush = false;
    CS._applying = true;
    try { applyAllFilters(); var base = filteredData || RD().map(function (_, i) { return i; }); filteredData = base.filter(function (i) { return set.has(i); }); renderTableHeader(); renderTable(); updateStatus(); } finally { CS._applying = false; }
    showSelBar(); if (STL.tvChips) STL.tvChips(); if (!fromBrush) redraw();
  }
  function clearSelection(quiet) {
    if (isBig() || CS.bigSel) { clearBigSelection(quiet); return; }
    CS.sel = null; CS.baseIdx = null; CS.selLabel = ''; CS.fromBrush = false;
    CS._applying = true; try { applyAllFilters(); } finally { CS._applying = false; }
    var b = $('csSelBar'); if (b) b.style.display = 'none'; if (STL.tvChips) STL.tvChips();
    if (!quiet) redraw(); else if (CS.inst) try { CS.inst.dispatchAction({ type: 'brush', areas: [] }); } catch (e) {}
  }
  function showSelBar() {
    var b = $('csSelBar'); if (!b) return; var big = isBig(), n = big ? BIG.matched : (filteredData ? filteredData.length : 0), lab = (big && CS.bigSel ? CS.bigSel.label : CS.selLabel) || '';
    b.innerHTML = '<span>🔎 ' + (big ? T('The file view shows ', 'फ़ाइल व्यू में दिख रही हैं ') : T('Table shows ', 'तालिका में दिख रही हैं ')) + '<b>' + Number(n).toLocaleString('en-IN') + '</b> ' + T('rows from the chart: ', 'पंक्तियाँ चार्ट से: ') + esc(lab.length > 60 ? lab.slice(0, 59) + '…' : lab) + '</span><button class="cs-link" id="csClear">' + T('Show all rows', 'सभी पंक्तियाँ दिखाएँ') + '</button>';
    b.style.display = 'flex'; $('csClear').onclick = function () { clearSelection(); };
  }
  STL.charts.selectRows = applySelection; STL.charts.clearSelection = clearSelection;
  STL.charts.selectionInfo = function () { return !isBig() && CS.sel ? { label: CS.selLabel || T('chart selection', 'चार्ट चयन'), n: CS.sel.size } : null; };

  // table filters changed elsewhere: drop the chart selection, redraw from the new rows
  var _apply = window.applyAllFilters;
  window.applyAllFilters = function () {
    if (!CS._applying && CS.sel) { CS.sel = null; CS.baseIdx = null; var b = $('csSelBar'); if (b) b.style.display = 'none'; }
    var r = _apply.apply(this, arguments);
    if (!CS._applying && CS.open) STL.redrawChartStudio();
    return r;
  };
  var _caf = window.clearAllFilters;
  if (_caf) window.clearAllFilters = function () { CS.sel = null; CS.baseIdx = null; var b = $('csSelBar'); if (b) b.style.display = 'none'; var r = _caf.apply(this, arguments); if (CS.open) STL.redrawChartStudio(); return r; };
  var _show = window.showTable;
  window.showTable = function () { var r = _show.apply(this, arguments); if (CS.open) { CS.prof = null; CS.stale = true; STL.redrawChartStudio(); } else CS.stale = true; return r; };

  // ---------------------------------------------------------------- toolbar actions
  function savePng() { if (!CS.inst) return; var a = document.createElement('a'); a.href = CS.inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' }); a.download = (CS.spec.title || 'chart').replace(/[^\wऀ-ॿ -]+/g, '') + '.png'; document.body.appendChild(a); a.click(); a.remove(); }
  function copyPng() {
    if (!CS.inst) return;
    try { fetch(CS.inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' })).then(function (r) { return r.blob(); }).then(function (b) { return navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); }).then(function () { toast(T('Chart copied. Paste it into Word or PowerPoint.', 'चार्ट कॉपी हुआ। इसे वर्ड या पावरपॉइंट में चिपकाएँ।'), 'success'); }).catch(function () { toast(T('Could not copy here. Use the Picture button.', 'यहाँ कॉपी नहीं हुआ। "चित्र" बटन उपयोग करें।'), 'warning'); }); }
    catch (e) { toast(T('Could not copy here. Use the Picture button.', 'यहाँ कॉपी नहीं हुआ। "चित्र" बटन उपयोग करें।'), 'warning'); }
  }
  function saveCsv() {
    var out = CS.out; if (!out || !out.data.cats.length) { toast(T('This chart has no table of numbers to save. Use the Data view button on the chart.', 'इस चार्ट में सहेजने योग्य संख्याओं की तालिका नहीं। चार्ट के डेटा बटन का उपयोग करें।'), 'info'); return; }
    var d = out.data, lines = [[HD()[CS.spec.x] || ''].concat(d.series.map(function (x) { return x.name; }))];
    d.cats.forEach(function (c) { lines.push([c.label].concat(c.values.map(function (v) { return v === null ? '' : v; }))); });
    var csv = '﻿' + lines.map(function (r) { return r.map(function (v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'chart_data.csv'; document.body.appendChild(a); a.click(); a.remove();
  }
  function pin() {
    loadPins(); var cur = CS.cur; if (!cur) return;
    var title = cur.spec.title || autoTitle(cur.type, cur.spec);
    STL.board.pins.push({ type: cur.type, spec: cur.spec, palette: CS.palette, title: title, ts: Date.now() }); savePins();
    toast(T('Pinned to the board (', 'बोर्ड पर लगाया (') + STL.board.pins.length + ')', 'success');
    if (STL.logStep) STL.logStep('chart', { en: 'Chart pinned: ' + title, hi: 'चार्ट बोर्ड पर लगाया: ' + title });
  }

  // ---------------------------------------------------------------- Insights board
  var boardInst = [];
  function disposeBoard() { boardInst.forEach(function (i) { try { i.dispose(); } catch (e) {} }); boardInst = []; }
  STL.openBoard = function () {
    if (noData()) return;
    if (isBig() && STL.bigCharts.sample.ds !== BIG.ds) { STL.bigCharts.loadSample().then(function () { STL.openBoard(); }).catch(function (e) { toast(e.message, 'error'); }); return; }
    loadPins(); ensureECharts(function () {
      disposeBoard();
      var idx = isBig() ? STL.bigCharts.sample.idx : ((typeof getDisplayData === 'function') ? getDisplayData() : RD().map(function (_, i) { return i; }));
      var auto = CH.recommend(HD(), RD(), idx, 8).map(function (r) { return { type: r.type, spec: r.spec, why: r.why, auto: true }; });
      var pins = STL.board.pins.map(function (p, i) { return { type: p.type, spec: p.spec, palette: p.palette, why: { en: p.title, hi: p.title }, pinned: true, pi: i }; });
      var cards = pins.concat(auto);
      var html = '<div class="prj-h"><b>' + T('Insights board', 'अंतर्दृष्टि बोर्ड') + '</b><button id="bdX" aria-label="close">×</button></div>' +
        '<div class="big-note">' + T('Charts chosen for your data, each with a plain-language reason. Click a chart to open it in the Studio. Pin your own charts from the Studio.', 'आपके डेटा के लिए चुने गए चार्ट, हर एक का सरल कारण सहित। स्टूडियो में खोलने के लिए चार्ट पर क्लिक करें। स्टूडियो से अपने चार्ट पिन करें।') + ' ' + Number(idx.length).toLocaleString('en-IN') + T(' rows', ' पंक्तियाँ') + '</div>' +
        (cards.length ? '<div class="cs-board">' + cards.map(function (c, i) {
          return '<div class="cs-card" data-i="' + i + '"><div class="cs-card-h"><span>' + (c.pinned ? '📌 ' : '') + esc(nm(c.why)) + '</span>' + (c.pinned ? '<button class="cs-ic sm" data-unpin="' + c.pi + '" title="Unpin">×</button>' : '<button class="cs-ic sm" data-pinit="' + i + '" title="Pin">📌</button>') + '</div><div class="cs-card-c" id="bdc' + i + '"></div><div class="cs-card-cap" id="bdk' + i + '"></div></div>';
        }).join('') + '</div>' : '<div class="big-err">' + T('Not enough variety in this data to suggest charts. Try the Chart Studio.', 'चार्ट सुझाने के लिए इस डेटा में पर्याप्त विविधता नहीं। चार्ट स्टूडियो आज़माएँ।') + '</div>');
      var o = U.overlay('boardDialog', html, true); o.querySelector('.stl-box').classList.add('xwide');
      $('bdX').onclick = function () { disposeBoard(); o.remove(); };
      cards.forEach(function (c, i) {
        var ev = Object.assign(env(), { palette: c.palette || 'aurora' });
        Promise.resolve().then(function () { return isBig() ? STL.bigCharts.build(c.type, c.spec, ev) : CH.build(c.type, c.spec, HD(), RD(), idx, ev); }).then(function (out) {
          if (!$('bdc' + i)) return;                                                  // the board was closed meanwhile
          var opt = out.option; opt.toolbox = undefined; opt.brush = undefined; opt.title = undefined; if (opt.dataZoom) opt.dataZoom = opt.dataZoom.slice(0, 1);
          var inst = echarts.init($('bdc' + i)); inst.setOption(opt); boardInst.push(inst);
          $('bdk' + i).textContent = out.caption[0] || '';
          $('bdc' + i).addEventListener('click', function () { disposeBoard(); o.remove(); STL.openChartStudio({ type: c.type, spec: c.spec, palette: c.palette, keepTitle: !!c.pinned }); });
        }).catch(function (e) { if ($('bdk' + i)) $('bdk' + i).textContent = e.message; });
      });
      o.querySelectorAll('[data-unpin]').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); STL.board.pins.splice(+b.dataset.unpin, 1); savePins(); STL.openBoard(); }; });
      o.querySelectorAll('[data-pinit]').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); var c = cards[+b.dataset.pinit]; STL.board.pins.push({ type: c.type, spec: c.spec, palette: 'aurora', title: c.why.en, ts: Date.now() }); savePins(); toast(T('Pinned', 'पिन किया'), 'success'); STL.openBoard(); }; });
    });
  };

  // ---------------------------------------------------------------- quick charts from the table
  // "Chart this column" and "Chart the selected cells"
  STL.chartColumn = function (ci, other) {
    if (noData()) return; var p = CH.profile(HD(), RD(), viewIdx()), a = p[ci], b = other !== undefined ? p[other] : null, spec, type;
    if (b && a.numeric && b.numeric) { type = 'scatter'; spec = { xnum: ci, ynum: other, trend: true, title: a.name + ' vs ' + b.name }; }
    else if (b && !a.numeric && b.numeric) { type = 'column'; spec = { x: ci, ys: [{ col: other, fn: 'sum' }], sort: 'desc', topN: 15, title: b.name + ' — ' + a.name }; }
    else if (b && a.numeric && !b.numeric) { type = 'column'; spec = { x: other, ys: [{ col: ci, fn: 'sum' }], sort: 'desc', topN: 15, title: a.name + ' — ' + b.name }; }
    else if (b && !a.numeric && !b.numeric) { type = 'heatmap'; spec = { x: ci, g: other, ys: [{ col: -1, fn: 'count' }], title: a.name + ' × ' + b.name }; }
    else if (a.numeric) { type = 'histogram'; spec = { xnum: ci, title: T('Spread of ', '') + a.name }; }
    else if (a.date) { type = 'area'; spec = { x: ci, time: 'month', ys: [{ col: -1, fn: 'count' }], smooth: true, title: T('Rows per month — ', 'प्रति माह पंक्तियाँ — ') + a.name }; }
    else { type = a.distinct <= 6 ? 'donut' : 'bar'; spec = { x: ci, ys: [{ col: -1, fn: 'count' }], sort: 'desc', topN: 15, title: T('Rows by ', 'पंक्तियाँ — ') + a.name }; }
    STL.openChartStudio({ type: type, spec: spec });
  };
  STL.chartSelection = function () {
    if (noData()) return; var s0 = typeof selectionStart !== 'undefined' ? selectionStart : null, e0 = typeof selectionEnd !== 'undefined' ? selectionEnd : null;
    var c1 = s0 && s0.ci !== null ? Math.min(s0.ci, e0.ci === null ? s0.ci : e0.ci) : (typeof activeCell !== 'undefined' && activeCell.ci !== null ? activeCell.ci : -1), c2 = s0 && s0.ci !== null && e0 && e0.ci !== null ? Math.max(s0.ci, e0.ci) : c1;
    if (c1 < 0) { toast(T('Select a column or some cells first.', 'पहले कोई कॉलम या कुछ सेल चुनें।'), 'info'); return; }
    STL.chartColumn(c1, c2 !== c1 ? c2 : undefined);
  };

  // palette entries and Home tile
  (STL.actions || []).push(
    { en: 'Chart Studio (25 chart types)', hi: 'चार्ट स्टूडियो (25 प्रकार)', kw: 'chart graph studio bar pie line scatter heatmap treemap histogram charts banao', run: function () { STL.openChartStudio(); }, group: 'Charts' },
    { en: 'Auto charts for this data (Insights board)', hi: 'इस डेटा के ऑटो चार्ट (बोर्ड)', kw: 'auto charts board insights suggest dashboard', run: function () { STL.openBoard(); }, group: 'Charts' },
    { en: 'Chart the selected column / cells', hi: 'चुने कॉलम / सेल का चार्ट', kw: 'chart selection column cells', run: function () { STL.chartSelection(); }, group: 'Charts' });
  (STL.extraTiles = STL.extraTiles || []).splice(2, 0, ['📊', 'Charts for my data', 'मेरे डेटा के चार्ट', 'One click: the best charts, clickable', 'एक क्लिक: सबसे उपयुक्त चार्ट, क्लिक योग्य', function () { if (!U.hasData()) { toast(T('Open a file first, or try the sample data.', 'पहले फ़ाइल खोलें, या नमूना डेटा आज़माएँ।'), 'info'); return; } STL.openBoard(); }, true]);

  // the "Charts" button opens the Studio instead of the old 50-point chart panel
  var _tool = window.switchTool;
  window.switchTool = function (tool) { if (tool === 'chart') { STL.openChartStudio(); return; } return _tool.apply(this, arguments); };

  // light / dark switch
  var _thm = window.toggleTheme;
  if (_thm) window.toggleTheme = function () { var r = _thm.apply(this, arguments); if (CS.open) setTimeout(function () { redraw(); }, 60); return r; };

  // language switch
  var _lang = window.setUiLanguage;
  window.setUiLanguage = function () { var r = _lang.apply(this, arguments); if ($('chartStudio') && CS.open) { sync(); redraw(); } return r; };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && CS.open && !$('palette') && !document.querySelector('.stl-overlay')) { if (CS.sel || CS.bigSel) clearSelection(); } });
})();
