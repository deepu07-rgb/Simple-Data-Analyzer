// =====================================================================
//  CHANGE RADAR and PENDENCY RADAR dialogs
//  One click to a finished picture: sensible defaults are found automatically, the result opens at once
//  with a chart, plain-language sentences and tables.
// =====================================================================
(function () {
  'use strict';
  var STL = window.STL = window.STL || {}, U = STL.ui, H = STL.rep, C = STL.change, P = STL.pend;
  var T = U.T, esc = U.esc, busy = U.busy, overlay = U.overlay, fmt = U.fmt;
  function $(id) { return document.getElementById(id); }
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function lang() { return (typeof uiLanguage !== 'undefined' && uiLanguage === 'hi') ? 'hi' : 'en'; }
  // charts use the same ECharts look as the Chart Studio: hover tooltips, save as picture, data view, legend toggles, click to act
  var charts = {};
  function disposeCharts() { Object.keys(charts).forEach(function (k) { try { charts[k].dispose(); } catch (e) {} }); charts = {}; }
  function drawChart(id, build, onClick) {
    STL.ensureECharts(function () {
      var el = $(id); if (!el) return;
      if (charts[id]) { try { charts[id].dispose(); } catch (e) {} }
      var inst = charts[id] = echarts.init(el, null, { renderer: 'canvas' });
      inst.setOption(build(STL.charts.kit.envOf({ hi: lang() === 'hi' })));
      if (onClick) inst.on('click', onClick);
      if (window.ResizeObserver) new ResizeObserver(function () { try { inst.resize(); } catch (e) {} }).observe(el);
    });
  }

  // =================================================================== CHANGE RADAR
  STL.openChangeRadar = function () {
    if (!H.needData()) return;
    var CR = { cur: H.editorData(), prev: null, res: null, key: undefined, chartIdx: 0 };
    function render() {
      var res = CR.res, html = '<div class="prj-h"><b>' + T('Change Radar', 'बदलाव रडार') + '</b><button id="crX" aria-label="close">×</button></div>';
      if (!res) {
        html += '<div class="big-note">' + T('What is different this month? Choose last month\'s file. I compare it with the data open now and show what moved and where.', 'इस माह क्या अलग है? पिछले माह की फ़ाइल चुनें। मैं उसकी तुलना अभी खुले डेटा से करके दिखाता हूँ कि क्या और कहाँ बदला।') + '</div>' +
          '<div class="rp-hero"><button class="tb-btn primary" id="crPick">' + T('Choose last month\'s file…', 'पिछले माह की फ़ाइल चुनें…') + '</button><div class="big-sub">' + T('This month: ', 'इस माह: ') + '<b>' + esc(CR.cur.name) + '</b> (' + fmt(CR.cur.rows.length) + ' ' + T('rows', 'पंक्तियाँ') + ')</div></div>';
      } else {
        var dr = CR.cur.rows.length - CR.prev.rows.length, rd = res.rowDiff;
        html += '<div class="rp-kpis">' +
          kpi(T('Rows', 'पंक्तियाँ'), fmt(CR.prev.rows.length) + ' → ' + fmt(CR.cur.rows.length), dr ? H.delta(dr) : '') +
          kpi(T('Columns compared', 'तुलना किए कॉलम'), res.matched.length, '') +
          (res.key ? kpi(T('Records matched by', 'रिकॉर्ड इससे मिलाए'), esc(res.key.name), '') : kpi(T('Records', 'रिकॉर्ड'), T('no stable ID found', 'स्थिर पहचान नहीं मिली'), '')) +
          (rd ? kpi(T('New / gone / changed', 'नए / गए / बदले'), rd.added.length + ' / ' + rd.removed.length + ' / ' + rd.changed.length, '') : '') + '</div>';
        // sentences
        var sents = res.insights.length ? res.insights.map(function (i) { return i.sentence[lang()]; }) : res.totals.filter(function (t) { return t.delta !== 0; }).slice(0, 4).map(function (t) { return t.sentence[lang()]; });
        if (!sents.length) sents = [T('Nothing moved: the totals are the same as last month.', 'कुछ नहीं बदला: योग पिछले माह जैसे ही हैं।')];
        html += '<div class="prj-sub">' + T('What changed', 'क्या बदला') + '</div><div class="rp-sum">' + sents.map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('') + '</div>';
        // chart
        if (res.insights.length) {
          html += '<div class="rp-chart-h"><select id="crChartSel" class="big-select">' + res.insights.map(function (i, k) { return '<option value="' + k + '"' + (k === CR.chartIdx ? ' selected' : '') + '>' + esc(i.column + ' — ' + T('by ', 'के अनुसार ') + i.groupBy) + '</option>'; }).join('') + '</select></div>' +
            '<div class="rp-chart"><div id="crChart" class="rp-echart"></div></div>';
        }
        // totals
        html += '<div class="prj-sub">' + T('All number columns', 'सभी संख्या कॉलम') + '</div><div class="big-tbl-wrap" style="max-height:200px"><table class="big-tbl"><tr><th>' + T('Column', 'कॉलम') + '</th><th>' + T('Last month', 'पिछला माह') + '</th><th>' + T('Now', 'अब') + '</th><th>' + T('Change', 'बदलाव') + '</th><th>%</th></tr>' +
          res.totals.map(function (t) { return '<tr><td>' + esc(t.name) + '</td><td class="num">' + C.indian(t.prev) + '</td><td class="num">' + C.indian(t.cur) + '</td><td class="num">' + H.delta(t.delta) + '</td><td class="num">' + (t.pct === null ? '–' : (t.pct > 0 ? '+' : '') + t.pct.toFixed(1) + '%') + '</td></tr>'; }).join('') + '</table></div>';
        // records
        if (rd) {
          var by = Object.keys(rd.changedByColumn).map(function (k) { return esc(k) + ' (' + rd.changedByColumn[k] + ')'; }).join(', ');
          html += '<div class="prj-sub">' + T('Records', 'रिकॉर्ड') + '</div><div class="big-note">' + T('New: ', 'नए: ') + '<b>' + fmt(rd.added.length) + '</b> · ' + T('Gone: ', 'गए: ') + '<b>' + fmt(rd.removed.length) + '</b> · ' + T('Changed: ', 'बदले: ') + '<b>' + fmt(rd.changed.length) + '</b>' + (by ? '<br>' + T('Most changed columns: ', 'सर्वाधिक बदले कॉलम: ') + by : '') + (rd.duplicateKeys ? '<br>⚠ ' + fmt(rd.duplicateKeys) + T(' repeated IDs were ignored.', ' दोहराई पहचानें छोड़ी गईं।') : '') + '</div>' +
            ((rd.added.length + rd.removed.length + rd.changed.length) ? '<button class="tb-btn" id="crShow">' + T('Show the changes in the sheet', 'बदलाव शीट में दिखाएँ') + '</button>' : '');
        }
        if (res.unmatchedPrev.length || res.unmatchedCur.length) html += '<div class="rp-warn">' + (res.unmatchedPrev.length ? '<div>' + T('Only in last month\'s file: ', 'केवल पिछले माह की फ़ाइल में: ') + res.unmatchedPrev.map(esc).join(', ') + '</div>' : '') + (res.unmatchedCur.length ? '<div>' + T('Only in this month\'s file: ', 'केवल इस माह की फ़ाइल में: ') + res.unmatchedCur.map(esc).join(', ') + '</div>' : '') + '</div>';
        html += '<div class="prj-row" style="margin-top:10px;flex-wrap:wrap"><label class="rp-inline">' + T('Match records by', 'रिकॉर्ड इससे मिलाएँ') + ' <select id="crKey" class="big-select"><option value="-1"' + (!res.key ? ' selected' : '') + '>' + T('(do not match records)', '(रिकॉर्ड न मिलाएँ)') + '</option>' + res.matched.map(function (m) { return '<option value="' + m.cur + '"' + (res.key && res.key.cur === m.cur ? ' selected' : '') + '>' + esc(m.name) + '</option>'; }).join('') + '</select></label>' +
          '<button class="tb-btn" id="crCopy">' + T('Copy summary', 'सार कॉपी करें') + '</button><button class="tb-btn" id="crAgain">' + T('Another file', 'दूसरी फ़ाइल') + '</button></div>';
      }
      var o = overlay('crDialog', html, true);
      $('crX').onclick = function () { o.remove(); disposeCharts(); };
      if ($('crPick')) $('crPick').onclick = pick;
      if ($('crAgain')) $('crAgain').onclick = pick;
      if ($('crChartSel')) $('crChartSel').onchange = function () { CR.chartIdx = +this.value; chart(); };
      if ($('crKey')) $('crKey').onchange = function () { var m = res.matched.filter(function (x) { return String(x.cur) === $('crKey').value; })[0]; CR.key = m ? { prev: m.prev, cur: m.cur } : -1; run(); };
      if ($('crShow')) $('crShow').onclick = function () { var t = C.changesTable(CR.prev, CR.cur, res); o.remove(); U.loadGrid([t.headers].concat(t.rows)); if ($('documentName')) $('documentName').textContent = T('Changes since last month', 'पिछले माह से बदलाव'); STL.logStep('change', { en: 'Compared with last month', hi: 'पिछले माह से तुलना' }, { en: CR.prev.name + ' → ' + CR.cur.name + ': ' + t.rows.length + ' changes', hi: CR.prev.name + ' → ' + CR.cur.name + ': ' + t.rows.length + ' बदलाव' }); };
      if ($('crCopy')) $('crCopy').onclick = function () {
        var txt = (res.insights.length ? res.insights : res.totals).map(function (i) { return H.lines(i.sentence); }).join('\n');
        (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast(T('Summary copied', 'सार कॉपी हुआ'), 'success'); }).catch(function () { toast(T('Could not copy. Select the text and press Ctrl+C.', 'कॉपी नहीं हुआ। पाठ चुनकर Ctrl+C दबाएँ।'), 'warning'); });
      };
      if (res && res.insights.length) chart();
    }
    function kpi(label, value, extra) { return '<div class="rp-kpi"><b>' + value + '</b><span>' + label + '</span>' + (extra ? '<i>' + extra + '</i>' : '') + '</div>'; }
    function chart() {
      var ins = CR.res.insights[CR.chartIdx]; if (!ins) return;
      var mv = ins.movers.slice().sort(function (a, b) { return b.delta - a.delta; });
      drawChart('crChart', function (env) {
        var K = STL.charts.kit, o = K.base({ title: ins.column + ' — ' + T('change since last month', 'पिछले माह से बदलाव') }, env), sg = function (v) { return (v > 0 ? '+' : '') + STL.charts.indian(v); };
        o.legend = undefined; o.tooltip.trigger = 'axis'; o.tooltip.axisPointer = { type: 'shadow' };
        o.tooltip.formatter = function (ps) { var p = ps[0]; return p.name + '<br/>' + p.marker + '<b>' + sg(p.value) + '</b> ' + (p.value > 0 ? T('more than last month', 'पिछले माह से अधिक') : T('less than last month', 'पिछले माह से कम')); };
        o.grid = { left: 12, right: 54, top: 50, bottom: 16, containLabel: true };
        o.xAxis = K.valueAxis(env, '', function (v) { return STL.charts.compact(v, env.hi); }); o.yAxis = K.catAxis(env, mv.map(function (x) { return x.name; }), { inverse: true });
        o.series = [{ type: 'bar', barMaxWidth: 22, emphasis: { focus: 'self' }, data: mv.map(function (x) { return { value: x.delta, itemStyle: { color: x.delta > 0 ? '#6d5bd0' : '#14a38b', borderRadius: x.delta > 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] }, label: { show: true, position: x.delta > 0 ? 'right' : 'left', color: env.sub, formatter: function (p) { return (p.value > 0 ? '+' : '') + STL.charts.compact(p.value, env.hi); } } }; }) }];
        return o;
      });
    }
    function pick() {
      H.pickFile('.csv,.tsv,.txt,.xlsx,.xls').then(function (f) {
        if (!f) return; busy(T('Reading last month\'s file…', 'पिछले माह की फ़ाइल पढ़ी जा रही है…'));
        H.loadDataset(f).then(function (d) { CR.prev = d; CR.key = undefined; busy(null); run(); }).catch(function (e) { busy(null); toast(e.message, 'error'); });
      });
    }
    function run() {
      busy(T('Comparing…', 'तुलना हो रही है…'));
      setTimeout(function () {
        try {
          var opts = {}; if (CR.key === -1) opts.keyCur = -1; else if (CR.key) { opts.keyPrev = CR.key.prev; opts.keyCur = CR.key.cur; }
          CR.res = C.compare({ headers: CR.prev.headers, rows: CR.prev.rows }, { headers: CR.cur.headers, rows: CR.cur.rows }, opts); CR.chartIdx = 0;
          if (!CR.res.matched.length) { toast(T('The two files have no columns in common.', 'दोनों फ़ाइलों में कोई कॉलम साझा नहीं है।'), 'error'); CR.res = null; }
        } catch (e) { toast(e.message, 'error'); CR.res = null; }
        busy(null); render();
      }, 40);
    }
    render();
  };

  // =================================================================== PENDENCY RADAR
  var SKEY = 'stellura_pendency';
  function loadSnaps() { if (STL.pendSnaps) return; try { STL.pendSnaps = JSON.parse(localStorage.getItem(SKEY) || '[]'); } catch (e) { STL.pendSnaps = []; } }
  function saveSnaps() { try { localStorage.setItem(SKEY, JSON.stringify(STL.pendSnaps)); } catch (e) {} }
  var RAMP = ['#14a38b', '#7cc36e', '#e8c33a', '#e8913a', '#d6456b', '#a3274f', '#6e1736'];
  function rampFor(n) { var out = []; for (var i = 0; i < n; i++) out.push(RAMP[Math.round(i * (RAMP.length - 1) / Math.max(n - 1, 1))]); return out; }

  STL.openPendency = function () {
    if (!H.needData()) return; loadSnaps();
    var g = P.guess(headers, rawData);
    var PD = { date: g.date, status: g.status, group: g.group, asOn: P.todayISO(), edges: '30,90,180,365', deadline: '', window: 15, vals: null, res: null, showCases: null };
    function statusList() { return PD.status >= 0 ? P.statusValues(rawData, PD.status) : []; }
    PD.sv = statusList(); PD.vals = PD.sv.filter(function (x) { return x.pending; }).map(function (x) { return x.value; });
    function compute() {
      PD.res = null; PD.error = null;
      if (PD.date < 0) return;
      var edges = String(PD.edges).split(/[,\s]+/).map(Number).filter(function (x) { return x > 0; });
      if (!edges.length) { PD.error = T('Enter day limits like 30,90,180,365', '30,90,180,365 जैसी दिन-सीमाएँ लिखें'); return; }
      if (PD.status >= 0 && !PD.vals.length) { PD.error = T('Tick at least one status that means "pending".', 'कम से कम एक स्थिति चुनें जिसका अर्थ "लंबित" है।'); return; }
      PD.res = P.compute(rawData, { dateCol: PD.date, statusCol: PD.status, groupCol: PD.group, pendingValues: PD.status >= 0 ? PD.vals : null, asOn: PD.asOn, edges: edges, deadlineDays: +PD.deadline || 0, windowDays: +PD.window });
    }
    function sel(id, val, allowNone, label) {
      return '<label class="rp-field"><span>' + label + '</span><select id="' + id + '" class="big-select">' + (allowNone ? '<option value="-1"' + (val < 0 ? ' selected' : '') + '>' + T('(none)', '(कोई नहीं)') + '</option>' : '<option value="-1"' + (val < 0 ? ' selected' : '') + '>' + T('Choose…', 'चुनें…') + '</option>') +
        headers.map(function (h, i) { return '<option value="' + i + '"' + (i === val ? ' selected' : '') + '>' + esc(h) + '</option>'; }).join('') + '</select></label>';
    }
    function render() {
      var res = PD.res, html = '<div class="prj-h"><b>' + T('Pendency Radar', 'लंबित प्रकरण रडार') + '</b><button id="pdX" aria-label="close">×</button></div>';
      html += '<details class="rp-settings" id="pdSet"' + ((res && !PD.open) ? '' : ' open') + '><summary>' + T('Settings', 'सेटिंग') + '</summary><div class="rp-grid">' +
        sel('pdDate', PD.date, false, T('Date the case was registered', 'प्रकरण पंजीयन की तारीख')) + sel('pdStatus', PD.status, true, T('Status column', 'स्थिति का कॉलम')) + sel('pdGroup', PD.group, true, T('Group by (station, officer…)', 'समूह (थाना, अधिकारी…)')) +
        '<label class="rp-field"><span>' + T('As on date', 'इस तारीख तक') + '</span><input type="date" id="pdAsOn" class="big-input" value="' + esc(PD.asOn) + '"></label>' +
        '<label class="rp-field"><span>' + T('Age limits (days)', 'आयु सीमाएँ (दिन)') + '</span><input id="pdEdges" class="big-input" value="' + esc(PD.edges) + '"></label>' +
        '<label class="rp-field"><span>' + T('Deadline (days, optional)', 'समय-सीमा (दिन, वैकल्पिक)') + '</span><input id="pdDl" class="big-input" type="number" min="1" value="' + esc(PD.deadline) + '" placeholder="60"></label></div>' +
        (PD.sv.length ? '<div class="prj-sub">' + T('Which statuses mean "pending"?', 'कौन-सी स्थितियाँ "लंबित" हैं?') + '</div><div class="rp-checks">' + PD.sv.map(function (x, i) { return '<label class="rp-inline"><input type="checkbox" data-sv="' + i + '"' + (PD.vals.indexOf(x.value) >= 0 ? ' checked' : '') + '> ' + esc(x.value) + ' <em>' + fmt(x.count) + (x.kind === 'unknown' ? ' · ' + T('check', 'जाँचें') : '') + '</em></label>'; }).join('') + '</div>' : '') + '</details>';
      if (PD.date < 0) html += '<div class="big-err">' + T('I could not find a date column. Choose the registration date above.', 'तारीख वाला कॉलम नहीं मिला। ऊपर पंजीयन तारीख चुनें।') + '</div>';
      if (PD.error) html += '<div class="big-err">' + esc(PD.error) + '</div>';
      if (res) {
        var t = res.total;
        html += '<div class="rp-kpis">' + [[T('Pending cases', 'लंबित प्रकरण'), fmt(t.total)], [T('Average age', 'औसत आयु'), Math.round(t.avgAge) + ' ' + T('days', 'दिन')], [T('Oldest', 'सबसे पुराना'), t.oldest + ' ' + T('days', 'दिन')], [T('Over 180 days', '180 दिन से अधिक'), fmt(t.over180) + ' (' + t.over180Pct.toFixed(0) + '%)']].map(function (k) { return '<div class="rp-kpi"><b>' + k[1] + '</b><span>' + k[0] + '</span></div>'; }).join('') +
          (res.deadline ? '<div class="rp-kpi warn"><b>' + fmt(res.overdueCount) + '</b><span>' + T('past the ' + res.deadline + '-day deadline', res.deadline + ' दिन की समय-सीमा पार') + '</span></div>' : '') + '</div>';
        if (res.groups.length > 1) html += '<div class="rp-chart tall"><div id="pdChart" class="rp-echart"></div></div>';
        var maxCol = res.labels.map(function (_, b) { return Math.max.apply(null, res.groups.map(function (x) { return x.counts[b]; })) || 1; });
        html += '<div class="big-tbl-wrap" style="max-height:300px"><table class="big-tbl rp-heat"><tr><th>' + (PD.group >= 0 ? esc(headers[PD.group]) : '') + '</th>' + res.labels.map(function (l) { return '<th>' + esc(l) + ' ' + T('days', 'दिन') + '</th>'; }).join('') + '<th>' + T('Total', 'कुल') + '</th><th>' + T('Oldest', 'सबसे पुराना') + '</th><th>&gt;180 %</th></tr>' +
          res.groups.map(function (gx) { return '<tr><td>' + esc(gx.name) + '</td>' + gx.counts.map(function (n, b) { return '<td class="num" style="background:' + heat(n / maxCol[b], b, res.labels.length) + '">' + (n || '') + '</td>'; }).join('') + '<td class="num"><b>' + fmt(gx.total) + '</b></td><td class="num">' + gx.oldest + '</td><td class="num">' + gx.over180Pct.toFixed(0) + '%</td></tr>'; }).join('') +
          '<tr class="rp-total"><td>' + T('Total', 'कुल') + '</td>' + t.counts.map(function (n) { return '<td class="num"><b>' + fmt(n) + '</b></td>'; }).join('') + '<td class="num"><b>' + fmt(t.total) + '</b></td><td class="num">' + t.oldest + '</td><td class="num">' + t.over180Pct.toFixed(0) + '%</td></tr></table></div>';
        var notes = []; if (res.undated) notes.push(fmt(res.undated) + T(' pending cases have no valid date (not in the table).', ' लंबित प्रकरणों की तारीख मान्य नहीं (तालिका में नहीं)।')); if (res.future) notes.push(fmt(res.future) + T(' cases are dated after the "as on" date (check the data).', ' प्रकरण "इस तारीख तक" के बाद की तारीख के हैं (डेटा जाँचें)।')); if (res.notPending) notes.push(fmt(res.notPending) + T(' cases are not pending and were left out.', ' प्रकरण लंबित नहीं हैं, छोड़े गए।'));
        if (PD.status < 0) notes.push(T('No status column: every dated row is counted as pending.', 'स्थिति कॉलम नहीं: हर दिनांक वाली पंक्ति लंबित गिनी गई।'));
        if (notes.length) html += '<div class="rp-warn">' + notes.map(function (n) { return '<div>ℹ ' + n + '</div>'; }).join('') + '</div>';
        if (res.deadline) {
          html += '<div class="prj-row" style="margin-top:8px;flex-wrap:wrap"><button class="tb-btn danger" id="pdOver"' + (res.overdueCount ? '' : ' disabled') + '>' + T('Past deadline: ', 'समय-सीमा पार: ') + fmt(res.overdueCount) + '</button><button class="tb-btn" id="pdNear"' + (res.nearCount ? '' : ' disabled') + '>' + T('Due within ' + PD.window + ' days: ', PD.window + ' दिन में देय: ') + fmt(res.nearCount) + '</button></div>';
        }
        // trend
        var tr = P.trend(STL.pendSnaps.filter(function (s) { return s.doc === PD.doc || true; }));
        html += '<div class="prj-sub">' + T('Weekly snapshots', 'साप्ताहिक स्नैपशॉट') + '</div>' + (tr.length ? '<div class="big-tbl-wrap" style="max-height:150px"><table class="big-tbl"><tr><th>' + T('As on', 'तारीख') + '</th><th>' + T('Pending', 'लंबित') + '</th><th>' + T('Change', 'बदलाव') + '</th><th>&gt;180</th><th>' + T('Biggest rise', 'सबसे अधिक वृद्धि') + '</th></tr>' + tr.map(function (r) { return '<tr><td>' + esc(r.asOn) + '</td><td class="num">' + fmt(r.total) + '</td><td class="num">' + (r.delta === null ? '–' : H.delta(r.delta)) + '</td><td class="num">' + fmt(r.over180) + '</td><td>' + (r.biggestRise ? esc(r.biggestRise.name) + ' +' + r.biggestRise.delta : '–') + '</td></tr>'; }).join('') + '</table></div>' : '<div class="big-note">' + T('Save a snapshot every week to see the trend here.', 'यहाँ प्रवृत्ति देखने के लिए हर सप्ताह एक स्नैपशॉट सहेजें।') + '</div>');
        html += '<div class="prj-row" style="margin-top:10px;flex-wrap:wrap"><button class="tb-btn primary" id="pdSnap">' + T('Save this week\'s snapshot', 'इस सप्ताह का स्नैपशॉट सहेजें') + '</button><button class="tb-btn" id="pdSheet">' + T('Put this table in the sheet', 'यह तालिका शीट में रखें') + '</button></div>';
      }
      var o = overlay('pdDialog', html, true);
      $('pdX').onclick = function () { o.remove(); disposeCharts(); };
      $('pdSet').addEventListener('toggle', function () { PD.open = this.open; });          // stay open while the user is adjusting settings
      wire(o); if (res && res.groups.length > 1) chart();
    }
    function heat(frac, b, n) { if (!frac) return 'transparent'; var c = rampFor(n)[b], a = 0.12 + 0.55 * Math.min(frac, 1); var m = /#(..)(..)(..)/.exec(c); return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + a.toFixed(2) + ')'; }
    function chart() {
      var res = PD.res, top = res.groups.slice(0, 12), cols = rampFor(res.labels.length);
      drawChart('pdChart', function (env) {
        var K = STL.charts.kit, o = K.base({ title: T('Pending cases by age', 'आयु के अनुसार लंबित प्रकरण') + (res.groups.length > 12 ? ' (' + T('top 12', 'शीर्ष 12') + ')' : '') }, env);
        o.color = cols; o.tooltip.trigger = 'axis'; o.tooltip.axisPointer = { type: 'shadow' };
        o.tooltip.formatter = function (ps) { var g = top[ps[0].dataIndex], tot = ps.reduce(function (a, p) { return a + (p.value || 0); }, 0); return '<b>' + g.name + '</b><br/>' + ps.filter(function (p) { return p.value; }).map(function (p) { return p.marker + p.seriesName + ': <b>' + STL.charts.indian(p.value) + '</b>'; }).join('<br/>') + '<br/>' + T('Total ', 'कुल ') + '<b>' + STL.charts.indian(tot) + '</b><br/><span style="color:#94a3b8">' + T('Click a coloured bar to open those cases', 'उन प्रकरणों को खोलने के लिए रंगीन पट्टी पर क्लिक करें') + '</span>'; };
        o.grid = { left: 12, right: 24, top: 50, bottom: 44, containLabel: true };
        o.xAxis = K.valueAxis(env, '', function (v) { return STL.charts.compact(v, env.hi); }); o.yAxis = K.catAxis(env, top.map(function (x) { return x.name; }), { inverse: true });
        o.legend = { type: 'scroll', bottom: 4, textStyle: { color: env.text }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 };
        o.series = res.labels.map(function (l, b) { return { name: l + ' ' + T('days', 'दिन'), type: 'bar', stack: 'age', barMaxWidth: 26, emphasis: { focus: 'series' }, itemStyle: { borderColor: '#fff', borderWidth: 1 }, label: { show: true, color: '#fff', fontSize: 10, formatter: function (p) { return p.value >= 8 ? p.value : ''; } }, data: top.map(function (x) { return x.counts[b]; }) }; });
        return o;
      }, function (p) {                                                                 // click a segment: those very cases open in the sheet
        var g = top[p.dataIndex], rows = g.rows.filter(function (_, i) { return g.bk[i] === p.seriesIndex; });
        if (!rows.length) return;
        var dlg = $('pdDialog'); if (dlg) dlg.remove(); disposeCharts();
        U.loadGrid([headers.slice()].concat(rows.map(function (i) { return rawData[i].slice(); })));
        if ($('documentName')) $('documentName').textContent = g.name + ' · ' + res.labels[p.seriesIndex] + ' ' + T('days', 'दिन');
        toast(fmt(rows.length) + T(' cases opened in the sheet', ' प्रकरण शीट में खुले'), 'success');
      });
    }
    function wire(o) {
      var again = function () { var d = $('pdSet'); if (d) PD.open = d.open; compute(); render(); };      // remember the panel state before redrawing
      [['pdDate', 'date'], ['pdStatus', 'status'], ['pdGroup', 'group']].forEach(function (p) {
        var el = $(p[0]); if (el) el.onchange = function () { PD[p[1]] = +el.value; if (p[1] === 'status') { PD.sv = statusList(); PD.vals = PD.sv.filter(function (x) { return x.pending; }).map(function (x) { return x.value; }); } again(); };
      });
      if ($('pdAsOn')) $('pdAsOn').onchange = function () { PD.asOn = this.value || P.todayISO(); again(); };
      if ($('pdEdges')) $('pdEdges').onchange = function () { PD.edges = this.value; again(); };
      if ($('pdDl')) $('pdDl').onchange = function () { PD.deadline = this.value; again(); };
      o.querySelectorAll('input[data-sv]').forEach(function (cb) { cb.onchange = function () { var v = PD.sv[+cb.dataset.sv].value, i = PD.vals.indexOf(v); if (cb.checked && i < 0) PD.vals.push(v); if (!cb.checked && i >= 0) PD.vals.splice(i, 1); again(); }; });
      var cases = function (list, title) { var idx = list.map(function (x) { return x.row; }), sub = idx.map(function (i) { var r = rawData[i].slice(); return r; }); o.remove(); U.loadGrid([headers.slice()].concat(sub)); if ($('documentName')) $('documentName').textContent = title; };
      if ($('pdOver')) $('pdOver').onclick = function () { cases(PD.res.overdue, T('Past deadline', 'समय-सीमा पार')); };
      if ($('pdNear')) $('pdNear').onclick = function () { cases(PD.res.near, T('Due soon', 'शीघ्र देय')); };
      if ($('pdSnap')) $('pdSnap').onclick = function () {
        var sn = P.snapshot(PD.res); STL.pendSnaps = STL.pendSnaps.filter(function (x) { return x.asOn !== sn.asOn; }); STL.pendSnaps.push(sn); saveSnaps();
        STL.logStep('pendency', { en: 'Pendency snapshot saved', hi: 'लंबित स्नैपशॉट सहेजा' }, { en: sn.asOn + ': ' + sn.total + ' pending', hi: sn.asOn + ': ' + sn.total + ' लंबित' });
        toast(T('Snapshot saved for ', 'स्नैपशॉट सहेजा: ') + sn.asOn, 'success'); render();
      };
      if ($('pdSheet')) $('pdSheet').onclick = function () {
        var res = PD.res, grid = [[PD.group >= 0 ? headers[PD.group] : T('Group', 'समूह')].concat(res.labels.map(function (l) { return l + ' ' + T('days', 'दिन'); })).concat([T('Total', 'कुल'), T('Oldest (days)', 'सबसे पुराना (दिन)'), T('Over 180 days %', '180 दिन से अधिक %')])];
        res.groups.forEach(function (gx) { grid.push([gx.name].concat(gx.counts.map(String)).concat([String(gx.total), String(gx.oldest), gx.over180Pct.toFixed(0)])); });
        grid.push([T('Total', 'कुल')].concat(res.total.counts.map(String)).concat([String(res.total.total), String(res.total.oldest), res.total.over180Pct.toFixed(0)]));
        o.remove(); U.loadGrid(grid); if ($('documentName')) $('documentName').textContent = T('Pending cases by age', 'आयु के अनुसार लंबित प्रकरण');
      };
    }
    compute(); render();
  };
})();
