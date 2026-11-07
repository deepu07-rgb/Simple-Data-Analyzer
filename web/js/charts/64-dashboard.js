// =====================================================================
//  DASHBOARD  /  डैशबोर्ड
//  The charts you pinned (Studio > "Pin to board") arranged on one page: a title, headline numbers, 1-3 columns,
//  a plain-language reading under each chart and an optional note. One click to PowerPoint (editable text,
//  chart pictures, speaker notes), to PDF (the browser draws every page, so Hindi is exact) or to the printer.
//  It follows the table's filters, and for a Large File every chart is calculated from all rows.
// =====================================================================
(function () {
  'use strict';
  var STL = window.STL = window.STL || {}, U = STL.ui, CH = STL.charts, T = U.T, esc = U.esc;
  function $(id) { return document.getElementById(id); }
  function hi() { return typeof uiLanguage !== 'undefined' && uiLanguage === 'hi'; }
  function isBig() { return !!(window.BIG && BIG.active && BIG.ds); }
  function today() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }

  var DEF = { title: '', sub: '', cols: 2, kpi: true };
  var B = STL.board = STL.board || { pins: null };
  function loadDash() { if (B.dash) return; try { B.dash = Object.assign({}, DEF, JSON.parse(localStorage.getItem('stellura_dash') || '{}')); } catch (e) { B.dash = Object.assign({}, DEF); } }
  function saveDash() { try { localStorage.setItem('stellura_dash', JSON.stringify(B.dash)); } catch (e) {} }
  function pins() { STL.boardLoad(); return B.pins; }
  function savePins() { STL.boardSave(); }

  // the board travels with a saved project
  STL.boardState = function () { STL.boardLoad(); loadDash(); return { pins: B.pins, dash: B.dash }; };
  STL.boardRestore = function (s) { if (!s) return; B.pins = Array.isArray(s.pins) ? s.pins : []; B.dash = Object.assign({}, DEF, s.dash || {}); STL.boardSave(); saveDash(); };

  // ---------------------------------------------------------------- one chart for a pin, from the current rows
  function envFor(pin) { return { hi: hi(), text: '#334155', sub: '#64748b', grid: 'rgba(148,163,184,.28)', palette: pin.palette || 'aurora' }; }
  function buildFor(pin) {
    var sp = Object.assign({}, pin.spec, { title: '' });
    return Promise.resolve().then(function () {
      if (isBig()) return STL.bigCharts.build(pin.type, sp, envFor(pin));
      var idx = typeof getDisplayData === 'function' ? getDisplayData() : rawData.map(function (_, i) { return i; });
      var out = CH.build(pin.type, sp, headers, rawData, idx, envFor(pin)); out.rows = idx.length; return out;
    });
  }
  function rowsOf(out) { return out.big ? out.big.matched : (out.rows || 0); }
  function plainOption(out, forImage) {
    var o = out.option; o.toolbox = undefined; o.brush = undefined; o.title = undefined;
    if (forImage) { if (o.legend && !Array.isArray(o.legend)) o.legend = Object.assign({}, o.legend, { type: 'plain' }); o.animation = false; if (o.dataZoom) o.dataZoom = o.dataZoom.filter(function (z) { return z.type !== 'slider'; }); }
    return o;
  }
  function titleOf(p) { return p.title || (CH.TYPES.filter(function (t) { return t.id === p.type; })[0] || { name: { en: 'Chart', hi: 'चार्ट' } }).name[hi() ? 'hi' : 'en']; }

  // ---------------------------------------------------------------- headline numbers
  function kpis() {
    return Promise.resolve().then(function () {
      // headline numbers: the rows, then the real measures - an average for rating-like columns (zeros = not rated), a total for amounts
      var pick = function (prof) { return CH.rankMeasures(prof.filter(CH.isMeasure)).slice(0, 3).map(function (n) { var fn = CH.fnFor(n); return { n: n, fn: fn, nz: !!(n.score && n.zeroPct >= 0.01), label: (/^(average|avg|mean|total)\b/i.test(n.name) ? '' : (fn === 'avg' ? T('Average ', 'औसत ') : T('Total of ', 'योग: '))) + n.name + (n.score && n.zeroPct >= 0.01 ? T(' (rated only)', ' (अंकित)') : '') }; }); };
      var fmtv = function (v, fn) { return v === null || v === undefined || isNaN(v) ? '–' : (fn === 'avg' && Math.abs(v) < 1000 ? String(Math.round(v * 100) / 100) : (CH.compact(v, hi()) || '0')); };
      if (isBig()) {
        return STL.bigCharts.loadSample().then(function (s) {
          var picks = pick(CH.profile(BIG.headers, s.rows, s.idx)), api = STL.bigCharts.api, sc = STL.bigCharts.scope();
          var base = { kind: 'agg', x: -1, g: -1, g2: -1, maxCats: 1, maxGroups: 2 };
          return Promise.all(picks.map(function (k) { return api('/api/engine/' + BIG.ds + '/chart', Object.assign({}, base, { measures: [{ col: k.n.index, fn: k.fn }], nozero: k.nz }, sc)).then(function (res) { return { label: k.label, value: fmtv(res.rows[0] ? res.rows[0][1] : null, k.fn), matched: res.matched }; }); })).then(function (list) {
            return api('/api/engine/' + BIG.ds + '/chart', Object.assign({}, base, { measures: [{ col: -1, fn: 'count' }] }, sc)).then(function (res) { return [{ label: T('Rows', 'पंक्तियाँ'), value: CH.indian(res.matched) }].concat(list); });
          });
        });
      }
      var idx = typeof getDisplayData === 'function' ? getDisplayData() : rawData.map(function (_, i) { return i; });
      var list = [{ label: T('Rows', 'पंक्तियाँ'), value: CH.indian(idx.length) }];
      pick(CH.profile(headers, rawData, idx)).forEach(function (k) {
        var sum = 0, cnt = 0; idx.forEach(function (i) { var x = CH.num(rawData[i][k.n.index]); if (x === null || (k.nz && x === 0)) return; sum += x; cnt++; });
        list.push({ label: k.label, value: fmtv(k.fn === 'avg' ? (cnt ? sum / cnt : null) : sum, k.fn) });
      });
      return list;
    }).catch(function () { return []; });
  }

  // ---------------------------------------------------------------- the screen
  var insts = [];
  function disposeAll() { insts.forEach(function (i) { try { i.dispose(); } catch (e) {} }); insts = []; }
  STL.openDashboard = function () {
    if (!isBig() && !U.hasData()) { toast(T('Open a file first, or try the sample data.', 'पहले फ़ाइल खोलें, या नमूना डेटा आज़माएँ।'), 'info'); return; }
    STL.ensureECharts(function () { loadDash(); STL.boardLoad(); render(); });
  };
  function docName() { var e = $('documentName'); return e ? e.textContent.trim() : ''; }

  function render() {
    disposeAll(); var P = pins(), d = B.dash, n = P.length;
    var nm = docName();
    var html = '<div class="prj-h"><b>' + T('Dashboard', 'डैशबोर्ड') + '</b><button id="dbX" aria-label="close">×</button></div>' +
      '<div class="dash-bar">' +
        '<label class="dash-f">' + T('Columns', 'कॉलम') + ' <select id="dbCols" class="big-select"><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>' +
        '<label class="dash-f"><input type="checkbox" id="dbKpi"> ' + T('Headline numbers', 'मुख्य संख्याएँ') + '</label>' +
        '<span class="cs-grow"></span>' +
        '<button class="tb-btn" id="dbAdd">✨ ' + T('Add suggested charts', 'सुझाए चार्ट जोड़ें') + '</button>' +
        '<button class="tb-btn" id="dbPrint">🖨 ' + T('Print', 'प्रिंट') + '</button>' +
        '<button class="tb-btn" id="dbPdf">⬇ PDF</button>' +
        '<button class="tb-btn primary" id="dbPpt">⬇ PowerPoint</button>' +
      '</div>' +
      '<div class="dash-page" id="dashPage">' +
        '<input id="dbTitle" class="dash-title" maxlength="120" placeholder="' + esc(T('Dashboard title', 'डैशबोर्ड का शीर्षक')) + '" value="' + esc(d.title || nm || '') + '">' +
        '<input id="dbSub" class="dash-sub" maxlength="160" placeholder="' + esc(T('Office, section, period…', 'कार्यालय, शाखा, अवधि…')) + '" value="' + esc(d.sub || '') + '">' +
        '<div class="dash-kpis" id="dashK"></div>' +
        (n ? '<div class="dash-grid" id="dashGrid" data-cols="' + d.cols + '" style="--cols:' + d.cols + '">' + P.map(function (p, i) {
          return '<div class="dash-card' + (p.w === 2 ? ' w2' : '') + '" data-i="' + i + '"><div class="dash-card-h"><input class="dash-ct" data-t="' + i + '" value="' + esc(titleOf(p)) + '" maxlength="120">' +
            '<span class="dash-tools"><button data-mv="-1" data-i="' + i + '" title="' + T('Move earlier', 'पहले ले जाएँ') + '"' + (i === 0 ? ' disabled' : '') + '>◀</button><button data-mv="1" data-i="' + i + '" title="' + T('Move later', 'बाद में ले जाएँ') + '"' + (i === n - 1 ? ' disabled' : '') + '>▶</button>' +
            '<button data-wd="' + i + '" title="' + T('Wide / normal', 'चौड़ा / सामान्य') + '">↔</button><button data-op="' + i + '" title="' + T('Open in the Studio', 'स्टूडियो में खोलें') + '">✎</button><button data-rm="' + i + '" title="' + T('Remove', 'हटाएँ') + '">×</button></span></div>' +
            '<div class="dash-chart" id="dc' + i + '"></div><div class="dash-cap" id="dk' + i + '"></div>' +
            '<textarea class="dash-note" data-n="' + i + '" rows="1" placeholder="' + esc(T('Add a note for this chart…', 'इस चार्ट के लिए टिप्पणी जोड़ें…')) + '">' + esc(p.note || '') + '</textarea></div>';
        }).join('') + '</div>' : '<div class="dash-empty"><div>📊</div><p>' + T('No charts yet. Open the Chart Studio, make a chart and press “Pin to board” — or let Stellura start you off.', 'अभी कोई चार्ट नहीं। चार्ट स्टूडियो में चार्ट बनाकर “बोर्ड पर लगाएँ” दबाएँ — या Stellura से शुरुआत करवाएँ।') + '</p><button class="tb-btn primary" id="dbAdd2">✨ ' + T('Add the best charts for this data', 'इस डेटा के सबसे उपयुक्त चार्ट जोड़ें') + '</button></div>') +
        '<div class="dash-foot">Stellura · ' + esc(nm) + ' · ' + today() + '</div>' +
      '</div>';
    var o = U.overlay('dashDialog', html, true); o.querySelector('.stl-box').classList.add('dash-box');
    $('dbCols').value = String(d.cols); $('dbKpi').checked = !!d.kpi;
    wire(o); draw(o);
  }

  function draw(o) {
    var P = pins(), d = B.dash;
    if (d.kpi) kpis().then(function (k) { var el = $('dashK'); if (!el) return; el.innerHTML = k.map(function (x) { return '<div class="dash-kpi"><b>' + esc(x.value) + '</b><span>' + esc(x.label) + '</span></div>'; }).join(''); }); else if ($('dashK')) $('dashK').innerHTML = '';
    P.forEach(function (p, i) {
      buildFor(p).then(function (out) {
        var el = $('dc' + i); if (!el) return;
        var inst = echarts.init(el, null, { renderer: 'canvas' }); insts.push(inst); inst.setOption(plainOption(out, false));
        $('dk' + i).textContent = out.caption.slice(0, 2).join(' ');
        if (window.ResizeObserver) new ResizeObserver(function () { try { inst.resize(); } catch (e) {} }).observe(el);
      }).catch(function (e) { var k = $('dk' + i); if (k) k.textContent = e.message; });
    });
  }

  function wire(o) {
    var d = B.dash, P = pins();
    function close() { disposeAll(); o.remove(); }
    $('dbX').onclick = close;
    $('dbCols').onchange = function () { d.cols = +this.value; saveDash(); render(); };
    $('dbKpi').onchange = function () { d.kpi = this.checked; saveDash(); render(); };
    $('dbTitle').oninput = function () { d.title = this.value; saveDash(); };
    $('dbSub').oninput = function () { d.sub = this.value; saveDash(); };
    var add = function () {
      var idx = isBig() ? STL.bigCharts.sample.idx : (typeof getDisplayData === 'function' ? getDisplayData() : rawData.map(function (_, i) { return i; }));
      var go = function () {
        var rec = CH.recommend(HD(), RD(), idx, 6).slice(0, 4);
        if (!rec.length) { toast(T('Not enough variety in this data to suggest charts.', 'चार्ट सुझाने के लिए इस डेटा में पर्याप्त विविधता नहीं।'), 'info'); return; }
        rec.forEach(function (r) { P.push({ type: r.type, spec: r.spec, palette: 'aurora', title: r.spec.title || r.why.en, ts: Date.now() }); });
        savePins(); render();
      };
      if (isBig() && STL.bigCharts.sample.ds !== BIG.ds) STL.bigCharts.loadSample().then(go).catch(function (e) { toast(e.message, 'error'); }); else go();
    };
    if ($('dbAdd')) $('dbAdd').onclick = add; if ($('dbAdd2')) $('dbAdd2').onclick = add;
    $('dbPpt').onclick = exportPptx; $('dbPdf').onclick = exportPdf; $('dbPrint').onclick = doPrint;
    o.querySelectorAll('[data-t]').forEach(function (e) { e.oninput = function () { P[+e.dataset.t].title = e.value; savePins(); }; });
    o.querySelectorAll('[data-n]').forEach(function (e) { e.oninput = function () { P[+e.dataset.n].note = e.value; savePins(); e.style.height = 'auto'; e.style.height = Math.min(120, e.scrollHeight) + 'px'; }; if (e.value) { e.style.height = Math.min(120, e.scrollHeight) + 'px'; } });
    o.querySelectorAll('[data-mv]').forEach(function (b) { b.onclick = function () { var i = +b.dataset.i, j = i + +b.dataset.mv; if (j < 0 || j >= P.length) return; var t = P[i]; P[i] = P[j]; P[j] = t; savePins(); render(); }; });
    o.querySelectorAll('[data-wd]').forEach(function (b) { b.onclick = function () { var p = P[+b.dataset.wd]; p.w = p.w === 2 ? 1 : 2; savePins(); render(); }; });
    o.querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { P.splice(+b.dataset.rm, 1); savePins(); render(); }; });
    o.querySelectorAll('[data-op]').forEach(function (b) { b.onclick = function () { var p = P[+b.dataset.op]; close(); STL.openChartStudio({ type: p.type, spec: p.spec, palette: p.palette, keepTitle: true }); }; });
  }
  function HD() { return isBig() ? BIG.headers : headers; }
  function RD() { return isBig() ? STL.bigCharts.sample.rows : rawData; }

  // ---------------------------------------------------------------- picture of a chart at an exact size
  // the picture is w x h pixels, but the chart is laid out `zoom` times smaller and drawn sharper, so axis text is as readable on a slide or paper as on screen
  function chartPng(out, w, h, zoom) {
    zoom = zoom || 1; var lw = Math.round(w / zoom), lh = Math.round(h / zoom);
    var div = document.createElement('div'); div.style.cssText = 'position:fixed;left:-20000px;top:0;width:' + lw + 'px;height:' + lh + 'px;background:#fff'; document.body.appendChild(div);
    var inst = echarts.init(div, null, { renderer: 'canvas', width: lw, height: lh });
    inst.setOption(plainOption(out, true));
    var url = inst.getDataURL({ type: 'png', pixelRatio: zoom, backgroundColor: '#ffffff' }); inst.dispose(); div.remove(); return url;
  }
  function rowsText(out) { var n = rowsOf(out); return n ? CH.indian(n) + T(' rows', ' पंक्तियाँ') : ''; }
  function download(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); }
  function post(path, body) {
    return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) {
      if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || 'Export failed'); });
      return r.blob();
    });
  }
  // a file name from the title: only what Windows forbids is removed, Hindi stays
  STL.dashFileName = function (title, ext) { var base = String(title || '').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 80); return (base || 'dashboard') + '.' + ext; };
  function headerInfo() { var d = B.dash; return { title: d.title || docName() || T('Dashboard', 'डैशबोर्ड'), subtitle: d.sub || '' }; }

  // ---------------------------------------------------------------- PowerPoint
  function exportPptx() {
    var P = pins(); if (!P.length) { toast(T('Pin or add a chart first.', 'पहले कोई चार्ट लगाएँ या जोड़ें।'), 'info'); return; }
    U.busy(T('Building the presentation…', 'प्रस्तुति बन रही है…'));
    Promise.all([Promise.all(P.map(buildFor)), B.dash.kpi ? kpis() : Promise.resolve([])]).then(function (r) {
      var outs = r[0], hd = headerInfo();
      return post('/api/dashboard/pptx', { title: hd.title, subtitle: hd.subtitle, date: today(), source: docName(), lang: hi() ? 'hi' : 'en', kpis: r[1],
        slides: P.map(function (p, i) { return { title: titleOf(p), caption: outs[i].caption.slice(0, 3), note: p.note || '', rows: rowsText(outs[i]), image: chartPng(outs[i], 1660, 1060, 2.2) }; }) });
    }).then(function (blob) { U.busy(null); download(blob, STL.dashFileName(headerInfo().title, 'pptx')); toast(T('Presentation downloaded.', 'प्रस्तुति डाउनलोड हुई।'), 'success'); if (STL.logStep) STL.logStep('dashboard', { en: 'Dashboard exported to PowerPoint', hi: 'डैशबोर्ड PowerPoint में निर्यात' }); })
      .catch(function (e) { U.busy(null); toast(e.message, 'error'); });
  }

  // ---------------------------------------------------------------- PDF: pages are drawn here, so Devanagari is shaped by the browser
  var FONT = "'Noto Sans Devanagari','Mangal','Nirmala UI','Inter','Segoe UI',sans-serif";
  function loadImg(url) { return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { rej(new Error('picture')); }; im.src = url; }); }
  function wrapLines(ctx, text, maxW, maxLines) {
    var words = String(text).split(/\s+/).filter(Boolean), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width <= maxW) { cur = t; return; }
      if (cur) lines.push(cur); cur = w;
      while (ctx.measureText(cur).width > maxW && cur.length > 1) { var k = cur.length - 1; while (k > 1 && ctx.measureText(cur.slice(0, k)).width > maxW) k--; lines.push(cur.slice(0, k)); cur = cur.slice(k); }
    });
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S{0,2}$/, '') + '…'; }
    return lines;
  }
  function roundRect(ctx, x, y, w, h, r, fill, stroke) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); } }

  // where every chart goes: pages of rows, charts can be one or two cells wide
  STL.dashLayout = function (items, cols, hasKpi) {
    var W = 1754, H = 1240, M = 70, GAP = 24, FOOT = 52, MIN_ROW = 430, pages = [], cellW = (W - 2 * M - GAP * (cols - 1)) / cols, maxRows = cols === 1 ? 1 : 2;
    var page = null, row = 0, col = 0, perPage = 1;
    // as many rows as fit with a comfortable chart in each (the first page also holds the title and the headline numbers)
    function newPage() {
      var first = pages.length === 0, top = first ? M + 150 + (hasKpi ? 130 : 0) : M + 70, avail = H - M - FOOT - top;
      perPage = Math.max(1, Math.min(maxRows, Math.floor((avail + GAP) / (MIN_ROW + GAP))));
      page = { first: first, top: top, rowH: Math.floor((avail - GAP * (perPage - 1)) / perPage), cards: [] }; pages.push(page); row = 0; col = 0;
    }
    newPage();
    items.forEach(function (it, i) {
      var w = Math.min(it.w === 2 ? 2 : 1, cols);
      if (col + w > cols) { row++; col = 0; }
      if (row >= perPage) newPage();
      page.cards.push({ i: i, row: row, x: Math.round(M + col * (cellW + GAP)), y: page.top + row * (page.rowH + GAP), w: Math.round(w * cellW + (w - 1) * GAP), h: page.rowH });
      col += w;
    });
    // a page that is not full (usually the last) gives its rows the free height, so those charts are not left short
    pages.forEach(function (pg) {
      var used = pg.cards.reduce(function (m, c) { return Math.max(m, c.row + 1); }, 1), avail = H - M - FOOT - pg.top;
      var h = Math.min(760, Math.floor((avail - GAP * (used - 1)) / used)); if (h <= pg.rowH) return;
      pg.rowH = h; pg.cards.forEach(function (c) { c.h = h; c.y = pg.top + c.row * (h + GAP); });
    });
    return { W: W, H: H, M: M, pages: pages };
  };

  function exportPdf() {
    var P = pins(); if (!P.length) { toast(T('Pin or add a chart first.', 'पहले कोई चार्ट लगाएँ या जोड़ें।'), 'info'); return; }
    U.busy(T('Building the PDF…', 'PDF बन रहा है…'));
    var d = B.dash, hd = headerInfo();
    var fonts = Promise.all(['700 30px "Noto Sans Devanagari"', '400 22px "Noto Sans Devanagari"', '700 30px Inter', '400 22px Inter'].map(function (f) { return document.fonts && document.fonts.load ? document.fonts.load(f, 'अaA1').catch(function () {}) : null; }));
    Promise.all([Promise.all(P.map(buildFor)), d.kpi ? kpis() : Promise.resolve([]), fonts]).then(function (r) {
      var outs = r[0], k = r[1], L = STL.dashLayout(P, d.cols, k.length > 0), jobs = [];
      L.pages.forEach(function (pg) { pg.cards.forEach(function (c) { var capH = 92, chartH = c.h - 58 - capH - 14, chartW = c.w - 32; jobs.push(loadImg(chartPng(outs[c.i], chartW, Math.max(120, chartH), 1.45)).then(function (im) { c.img = im; c.cw = chartW; c.ch = Math.max(120, chartH); })); }); });
      return Promise.all(jobs).then(function () { return { outs: outs, k: k, L: L }; });
    }).then(function (s) {
      var L = s.L, pages = [];
      L.pages.forEach(function (pg, pn) {
        var cv = document.createElement('canvas'); cv.width = L.W; cv.height = L.H; var ctx = cv.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, L.W, L.H); ctx.fillStyle = '#6d5bd0'; ctx.fillRect(0, 0, L.W, 14);
        ctx.textBaseline = 'alphabetic';
        if (pg.first) {
          ctx.fillStyle = '#1e1b4b'; ctx.font = '700 48px ' + FONT; var tl = wrapLines(ctx, hd.title, L.W - 2 * L.M, 1); ctx.fillText(tl[0] || '', L.M, L.M + 56);
          ctx.fillStyle = '#64748b'; ctx.font = '400 26px ' + FONT; ctx.fillText(((hd.subtitle ? hd.subtitle + '  ·  ' : '') + today()), L.M, L.M + 104);
          if (s.k.length) { var kw = (L.W - 2 * L.M - 20 * 3) / 4; s.k.slice(0, 4).forEach(function (kp, i) { var x = L.M + i * (kw + 20), y = L.M + 140; roundRect(ctx, x, y, kw, 108, 16, '#f6f5fd', '#e2e8f0'); ctx.fillStyle = '#6d5bd0'; ctx.font = '700 40px ' + FONT; ctx.fillText(wrapLines(ctx, kp.value, kw - 28, 1)[0], x + 18, y + 54); ctx.fillStyle = '#64748b'; ctx.font = '400 21px ' + FONT; ctx.fillText(wrapLines(ctx, kp.label, kw - 28, 1)[0], x + 18, y + 90); }); }
        } else { ctx.fillStyle = '#1e1b4b'; ctx.font = '700 28px ' + FONT; ctx.fillText(wrapLines(ctx, hd.title, L.W - 2 * L.M - 200, 1)[0] || '', L.M, L.M + 38); ctx.fillStyle = '#e2e8f0'; ctx.fillRect(L.M, L.M + 52, L.W - 2 * L.M, 2); }
        pg.cards.forEach(function (c) {
          var p = P[c.i], out = s.outs[c.i];
          roundRect(ctx, c.x, c.y, c.w, c.h, 16, '#ffffff', '#e2e8f0');
          ctx.fillStyle = '#1e1b4b'; ctx.font = '700 25px ' + FONT; ctx.fillText(wrapLines(ctx, titleOf(p), c.w - 32, 1)[0] || '', c.x + 16, c.y + 38);
          ctx.drawImage(c.img, c.x + 16, c.y + 52, c.cw, c.ch);
          ctx.fillStyle = '#475569'; ctx.font = '400 20px ' + FONT;
          var text = out.caption.slice(0, 2).join(' ') + (p.note ? '  ✎ ' + p.note : ''), lines = wrapLines(ctx, text, c.w - 32, 3);
          lines.forEach(function (ln, i) { ctx.fillText(ln, c.x + 16, c.y + 52 + c.ch + 30 + i * 27); });
        });
        ctx.fillStyle = '#94a3b8'; ctx.font = '400 18px ' + FONT; ctx.fillText('Stellura  ·  ' + docName() + '  ·  ' + today(), L.M, L.H - 30);
        var pn1 = (pn + 1) + ' / ' + L.pages.length; ctx.fillText(pn1, L.W - L.M - ctx.measureText(pn1).width, L.H - 30);
        pages.push(cv.toDataURL('image/png'));
      });
      return post('/api/dashboard/pdf', { title: hd.title, pages: pages });
    }).then(function (blob) { U.busy(null); download(blob, STL.dashFileName(headerInfo().title, 'pdf')); toast(T('PDF downloaded.', 'PDF डाउनलोड हुआ।'), 'success'); if (STL.logStep) STL.logStep('dashboard', { en: 'Dashboard exported to PDF', hi: 'डैशबोर्ड PDF में निर्यात' }); })
      .catch(function (e) { U.busy(null); toast(e.message, 'error'); });
  }

  function doPrint() {
    document.body.classList.add('dash-printing'); insts.forEach(function (i) { try { i.resize(); } catch (e) {} });
    setTimeout(function () { try { window.print(); } finally { document.body.classList.remove('dash-printing'); } }, 200);
  }

  // ---------------------------------------------------------------- doors in
  (STL.actions || []).push({ en: 'Dashboard from pinned charts (PowerPoint / PDF)', hi: 'पिन किए चार्ट का डैशबोर्ड (PowerPoint / PDF)', kw: 'dashboard report ppt pptx powerpoint pdf print slides presentation pinned charts', run: function () { STL.openDashboard(); }, group: 'Charts' });
})();
