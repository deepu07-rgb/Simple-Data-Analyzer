// =====================================================================
//  LARGE FILE MODE  /  बड़ी फ़ाइल मोड
//  Big tables stay in the local DuckDB engine (server side). The page only holds the rows
//  on screen, so a million-row file opens in seconds and never freezes the browser.
//  Read-only view: sort, search, filter, profile, group + chart, SQL, export, and
//  "Work on a copy" which brings up to 100,000 matching rows into the normal editor.
// =====================================================================
(function () {
  'use strict';

  var ROW = 30, HEAD = 34, PAGE = 200, MAX_CACHE = 60, MAX_SPACER = 8000000, COPY_MAX = 100000;
  var AUTO_THRESHOLD = 10 * 1024 * 1024;           // files above 10 MB open in Large File mode
  var COLW = 150, IDW = 64;

  var BIG = window.BIG = {
    active: false, ds: null, name: '', headers: [], total: 0, matched: 0, file: null, sheets: [],
    sort: null, desc: false, search: '', filters: [], profile: null,
    cache: new Map(), pending: new Set(), gen: 0, tab: 'columns'
  };

  // ---- small helpers ------------------------------------------------
  function T(en, hi) {
    var l = (typeof uiLanguage !== 'undefined') ? uiLanguage : 'en';
    return l === 'hi' ? hi : (l === 'bi' ? en + ' / ' + hi : en);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function $(id) { return document.getElementById(id); }
  function fmtInt(n) { return Number(n).toLocaleString('en-IN'); }
  function fmtNum(v) {
    if (v == null || v === '') return '–';
    var n = Number(v);
    if (!isFinite(n)) return String(v);
    return Math.abs(n) >= 1000 ? n.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : String(Math.round(n * 1000) / 1000);
  }
  function api(path, body) {
    var opt = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    return fetch(path, opt).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error || j.message || 'Request failed');
        return j;
      });
    });
  }
  function isNumericCol(i) {
    if (!BIG.profile) return false;
    var c = BIG.profile.columns[i];
    return !!c && c.type === 'number';
  }
  function queryBody(extra) {
    var b = { sort: BIG.sort, desc: BIG.desc, numeric: BIG.sort != null && isNumericCol(BIG.sort),
              search: BIG.search, filters: BIG.filters.map(function (f) { return { col: f.col, op: f.op, value: f.value, value2: f.value2 }; }) };
    for (var k in (extra || {})) b[k] = extra[k];
    return b;
  }

  // ---- routing: which files go to Large File mode -------------------
  BIG.shouldUse = function (file) {
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    return file.size >= AUTO_THRESHOLD && (ext === 'csv' || ext === 'tsv' || ext === 'txt' || ext === 'xlsx');
  };

  BIG.pickFile = function () {
    var inp = $('bigFileInput');
    if (!inp) {
      inp = document.createElement('input');
      inp.type = 'file'; inp.id = 'bigFileInput'; inp.accept = '.csv,.tsv,.txt,.xlsx'; inp.style.display = 'none';
      inp.onchange = function (e) { var f = e.target.files[0]; e.target.value = ''; if (f) BIG.openFile(f); };
      document.body.appendChild(inp);
    }
    inp.click();
  };

  function busy(msg) {
    var el = $('bigBusy');
    if (!msg) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div'); el.id = 'bigBusy'; el.className = 'big-busy';
      el.innerHTML = '<div class="big-busy-box"><div class="big-spin"></div><div id="bigBusyMsg"></div></div>';
      document.body.appendChild(el);
    }
    $('bigBusyMsg').textContent = msg;
  }

  BIG.openFile = function (file, sheet) {
    busy(T('Opening large file… this can take a few seconds', 'बड़ी फ़ाइल खुल रही है… कुछ सेकंड लग सकते हैं'));
    var fd = new FormData();
    fd.append('file', file);
    if (sheet) fd.append('sheet', sheet);
    return fetch('/api/engine/load', { method: 'POST', body: fd })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || j.message || 'Could not open the file'); return j; }); })
      .then(function (info) {
        BIG.file = file;
        BIG.sheets = info.sheets || [];
        BIG.attach(info, sheet);
        if (typeof _pvLog === 'function') _pvLog({ actor: 'user', action: 'LOAD', method: 'large-file', target: 'dataset', inputs: [], output: 'col:*', label: 'Large file loaded: ' + fmtInt(info.rows) + ' rows × ' + info.headers.length + ' columns', labelHi: 'बड़ी फ़ाइल लोड: ' + fmtInt(info.rows) + ' पंक्तियाँ' });
      })
      .catch(function (e) { toast(T('Could not open file: ', 'फ़ाइल नहीं खुली: ') + e.message, 'error'); })
      .then(function () { busy(null); });
  };

  // ---- build the view -------------------------------------------------
  function ensureDom() {
    if ($('bigview')) return;
    var host = $('workspace-stage') || document.body;
    var el = document.createElement('div');
    el.id = 'bigview';
    el.innerHTML =
      '<div class="big-top">' +
        '<div class="big-title"><span class="big-badge" id="bigBadge"></span><b id="bigName"></b><span id="bigDims" class="big-dim"></span>' +
        '<select id="bigSheet" class="big-select" style="display:none"></select></div>' +
        '<input id="bigSearch" class="big-input" type="search" autocomplete="off">' +
        '<div class="big-actions">' +
          '<button class="tb-btn" id="bigChartBtn"></button>' +
          '<button class="tb-btn" id="bigFiltBtn"></button>' +
          '<button class="tb-btn success" id="bigCopyBtn"></button>' +
          '<button class="tb-btn" id="bigCsvBtn">CSV</button>' +
          '<button class="tb-btn" id="bigXlsxBtn">Excel</button>' +
          '<button class="tb-btn" id="bigSaveBtn"></button>' +
          '<button class="tb-btn danger" id="bigExitBtn"></button>' +
        '</div>' +
      '</div>' +
      '<div class="big-filters" id="bigFilterBar"></div>' +
      '<div class="big-body">' +
        '<div class="big-scroll" id="bigScroll"><div class="big-head" id="bigHead"></div><div class="big-spacer" id="bigSpacer"><div class="big-rows" id="bigRows"></div></div></div>' +
        '<aside class="big-side" id="bigSide">' +
          '<div class="big-tabs"><button data-tab="columns" id="bigTabCols"></button><button data-tab="group" id="bigTabGroup"></button><button data-tab="sql" id="bigTabSql"></button></div>' +
          '<div class="big-pane" id="bigPane"></div>' +
        '</aside>' +
      '</div>' +
      '<div class="big-status" id="bigStatus"></div>';
    host.appendChild(el);

    $('bigSearch').addEventListener('input', debounce(function () { BIG.search = $('bigSearch').value.trim(); BIG.refresh(); }, 300));
    $('bigScroll').addEventListener('scroll', function () { requestAnimationFrame(render); });
    window.addEventListener('resize', function () { if (BIG.active) render(); });
    $('bigChartBtn').onclick = function () { if (window.STL && STL.openChartStudio) STL.openChartStudio(); };
    $('bigFiltBtn').onclick = function () { showFilterEditor(); };
    $('bigCopyBtn').onclick = function () { BIG.copyToEditor(); };
    $('bigCsvBtn').onclick = function () { BIG.exportView('csv'); };
    $('bigXlsxBtn').onclick = function () { BIG.exportView('xlsx'); };
    $('bigSaveBtn').onclick = function () { if (window.PRJ) PRJ.openDialog(); };
    $('bigExitBtn').onclick = function () { BIG.exit(); };
    $('bigSheet').onchange = function () { if (BIG.file) BIG.openFile(BIG.file, this.value); };
    el.querySelectorAll('.big-tabs button').forEach(function (b) { b.onclick = function () { BIG.tab = b.dataset.tab; renderSide(); }; });
  }

  function debounce(fn, ms) { var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); }; }

  function labels() {
    $('bigBadge').textContent = T('Large file', 'बड़ी फ़ाइल');
    $('bigSearch').placeholder = T('Search all columns…', 'सभी कॉलम में खोजें…');
    $('bigChartBtn').textContent = '📊 ' + T('Charts', 'चार्ट');
    $('bigChartBtn').title = T('Charts from every row of the file, calculated on this PC. Click a bar to filter the file.', 'फ़ाइल की हर पंक्ति से चार्ट, इसी पीसी पर गणना। फ़ाइल फ़िल्टर करने के लिए पट्टी पर क्लिक करें।');
    $('bigFiltBtn').textContent = T('Filters', 'फ़िल्टर');
    $('bigCopyBtn').textContent = T('Work on a copy', 'प्रति पर काम करें');
    $('bigCopyBtn').title = T('Bring up to 100,000 matching rows into the full editor', 'पूर्ण संपादक में 1,00,000 तक मेल खाती पंक्तियाँ लाएँ');
    $('bigSaveBtn').textContent = T('Save project', 'प्रोजेक्ट सहेजें');
    $('bigExitBtn').textContent = T('Close', 'बंद करें');
    $('bigTabCols').textContent = T('Columns', 'कॉलम');
    $('bigTabGroup').textContent = T('Group & chart', 'समूह व चार्ट');
    $('bigTabSql').textContent = 'SQL';
  }

  // ---- attach a dataset ------------------------------------------------
  BIG.attach = function (info, sheetName) {
    ensureDom();
    BIG.active = true;
    BIG.ds = info.id; BIG.name = info.name || 'data'; BIG.headers = info.headers; BIG.total = info.rows;
    BIG.sort = null; BIG.desc = false; BIG.search = ''; BIG.filters = []; BIG.profile = null;
    try { sessionStorage.setItem('stellura_big', JSON.stringify({ id: info.id })); } catch (e) {}
    $('bigview').classList.add('visible');
    $('bigSearch').value = '';
    $('bigName').textContent = BIG.name;
    var sel = $('bigSheet');
    if (BIG.sheets.length > 1) {
      sel.style.display = '';
      sel.innerHTML = BIG.sheets.map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
      sel.value = sheetName || BIG.sheets[0];
    } else sel.style.display = 'none';
    var dn = $('documentName'); if (dn) dn.textContent = BIG.name;
    labels();
    renderHeader();
    renderFilterBar();
    BIG.tab = 'columns';
    renderSide();
    BIG.refresh();
    api('/api/engine/' + BIG.ds + '/profile').then(function (p) {
      if (BIG.ds !== info.id) return;
      BIG.profile = p; renderHeader(); renderSide();
    }).catch(function () {});
  };

  BIG.exit = function () {
    BIG.active = false;
    if (window.STL && STL.closeChartStudio) STL.closeChartStudio();
    var v = $('bigview'); if (v) v.classList.remove('visible');
    try { sessionStorage.removeItem('stellura_big'); } catch (e) {}
    var dn = $('documentName'); if (dn && typeof rawData !== 'undefined' && !rawData.length) dn.textContent = 'Untitled Analysis';
    if (typeof switchDDView === 'function') switchDDView('sheet');
  };

  // ---- query state -> rows -------------------------------------------------
  BIG.refresh = function () {
    BIG.gen++;
    BIG.cache.clear(); BIG.pending.clear();
    var gen = BIG.gen;
    var sc = $('bigScroll'); if (sc) sc.scrollTop = 0;
    api('/api/engine/' + BIG.ds + '/rows', queryBody({ offset: 0, limit: PAGE, count: true })).then(function (r) {
      if (gen !== BIG.gen) return;
      BIG.matched = r.matched;
      BIG.cache.set(0, r);
      sizeSpacer(); render(); status();
      if (window.STL && STL.redrawChartStudio) STL.redrawChartStudio();                 // an open chart follows the grid's search and filters
    }).catch(function (e) { toast(e.message, 'error'); });
  };

  function sizeSpacer() {
    var h = Math.min(BIG.matched * ROW, MAX_SPACER) + 2;
    $('bigSpacer').style.height = h + 'px';
  }

  function fetchPage(p) {
    if (BIG.cache.has(p) || BIG.pending.has(p)) return;
    BIG.pending.add(p);
    var gen = BIG.gen;
    api('/api/engine/' + BIG.ds + '/rows', queryBody({ offset: p * PAGE, limit: PAGE })).then(function (r) {
      if (gen !== BIG.gen) return;
      BIG.pending.delete(p);
      BIG.cache.set(p, r);
      if (BIG.cache.size > MAX_CACHE) { BIG.cache.delete(BIG.cache.keys().next().value); }
      render();
    }).catch(function () { BIG.pending.delete(p); });
  }

  // ---- rendering ------------------------------------------------------------
  function renderHeader() {
    var h = '<div class="big-hrow"><div class="big-idc" style="width:' + IDW + 'px">#</div>';
    BIG.headers.forEach(function (name, i) {
      var arrow = BIG.sort === i ? (BIG.desc ? ' ▼' : ' ▲') : '';
      var kind = BIG.profile ? (BIG.profile.columns[i] && BIG.profile.columns[i].type === 'number' ? '#' : 'T') : '';
      h += '<div class="big-hc" data-i="' + i + '" style="width:' + COLW + 'px" title="' + esc(name) + '"><span class="big-kind">' + kind + '</span>' + esc(name) + arrow + '</div>';
    });
    $('bigHead').innerHTML = h + '</div>';
    var w = IDW + BIG.headers.length * COLW;
    $('bigHead').style.width = w + 'px'; $('bigSpacer').style.width = w + 'px';
    $('bigHead').querySelectorAll('.big-hc').forEach(function (c) {
      c.onclick = function () {
        var i = +c.dataset.i;
        if (BIG.sort !== i) { BIG.sort = i; BIG.desc = false; } else if (!BIG.desc) { BIG.desc = true; } else { BIG.sort = null; BIG.desc = false; }
        renderHeader(); BIG.refresh();
      };
    });
  }

  function render() {
    if (!BIG.active) return;
    var sc = $('bigScroll'), rowsEl = $('bigRows');
    var viewH = Math.max(sc.clientHeight - HEAD, ROW);
    var visible = Math.ceil(viewH / ROW) + 1;
    var total = BIG.matched, scaled = total * ROW > MAX_SPACER;
    var first;
    if (!scaled) first = Math.floor(sc.scrollTop / ROW);
    else {
      var maxScroll = Math.max(MAX_SPACER - viewH, 1);
      first = Math.floor(Math.min(sc.scrollTop / maxScroll, 1) * Math.max(total - visible, 0));
    }
    first = Math.max(0, Math.min(first, Math.max(total - 1, 0)));
    var last = Math.min(total, first + visible + 2);
    rowsEl.style.top = (scaled ? sc.scrollTop : first * ROW) + 'px';
    var html = '';
    for (var i = first; i < last; i++) {
      var p = Math.floor(i / PAGE), page = BIG.cache.get(p);
      if (!page) { fetchPage(p); html += '<div class="big-row big-skel"><div class="big-idc" style="width:' + IDW + 'px">…</div></div>'; continue; }
      var idx = i - p * PAGE, row = page.rows[idx];
      if (!row) { html += '<div class="big-row"></div>'; continue; }
      html += '<div class="big-row' + (i % 2 ? ' odd' : '') + '"><div class="big-idc" style="width:' + IDW + 'px">' + (page.ids[idx] + 1) + '</div>';
      for (var c = 0; c < row.length; c++) {
        html += '<div class="big-c' + (isNumericCol(c) ? ' num' : '') + '" style="width:' + COLW + 'px" title="' + esc(row[c]) + '">' + esc(row[c]) + '</div>';
      }
      html += '</div>';
    }
    rowsEl.innerHTML = html;
    // read-ahead: next page
    var np = Math.floor(last / PAGE); if (np * PAGE < total) fetchPage(np);
    $('bigHead').style.transform = 'translateX(0)';
    status(first, last);
  }

  function status(first, last) {
    var el = $('bigStatus'); if (!el) return;
    var s = fmtInt(BIG.matched) + ' ' + T('rows', 'पंक्तियाँ');
    if (BIG.matched !== BIG.total) s += ' ' + T('match (of ', 'मेल खाती (कुल ') + fmtInt(BIG.total) + ')';
    s += ' · ' + BIG.headers.length + ' ' + T('columns', 'कॉलम');
    if (first != null && BIG.matched) s += ' · ' + T('showing ', 'दिख रहीं ') + fmtInt(first + 1) + '–' + fmtInt(last);
    el.textContent = s;
    $('bigDims').textContent = fmtInt(BIG.total) + ' × ' + BIG.headers.length;
  }

  // ---- filters ----------------------------------------------------------------
  var OPS = [
    ['eq', 'equals', 'बराबर'], ['neq', 'not equal', 'बराबर नहीं'], ['contains', 'contains', 'शामिल'],
    ['gt', '>', '>'], ['gte', '>=', '>='], ['lt', '<', '<'], ['lte', '<=', '<='], ['between', 'between', 'बीच में'],
    ['empty', 'is empty', 'खाली है'], ['notempty', 'is not empty', 'खाली नहीं']
  ];
  function opLabel(op) { var o = OPS.filter(function (x) { return x[0] === op; })[0]; return o ? T(o[1], o[2]) : op; }

  function renderFilterBar() {
    var bar = $('bigFilterBar'); if (!bar) return;
    bar.style.display = BIG.filters.length ? 'flex' : 'none';
    bar.innerHTML = BIG.filters.map(function (f, i) {
      var v = (f.op === 'empty' || f.op === 'notempty') ? '' : ' ' + esc(f.value) + (f.op === 'between' ? ' – ' + esc(f.value2) : '');
      var txt = f.label ? esc(f.label) : opLabel(f.op) + v;
      return '<span class="big-chip' + (f._chart ? ' big-chip-chart' : '') + '">' + esc(BIG.headers[f.col]) + ' ' + txt + ' <button data-i="' + i + '" aria-label="remove">×</button></span>';
    }).join('') + (BIG.filters.length ? '<button class="big-link" id="bigClearF">' + T('Clear all', 'सब हटाएँ') + '</button>' : '');
    bar.querySelectorAll('.big-chip button').forEach(function (b) { b.onclick = function () { BIG.filters.splice(+b.dataset.i, 1); renderFilterBar(); BIG.refresh(); }; });
    var c = $('bigClearF'); if (c) c.onclick = function () { BIG.filters = []; renderFilterBar(); BIG.refresh(); };
  }

  // used by the charts: show the filters in the bar and reload the grid
  BIG.syncFilters = function () { renderFilterBar(); BIG.refresh(); };

  function showFilterEditor(presetCol, presetVal) {
    var old = $('bigFilterEditor'); if (old) old.remove();
    var box = document.createElement('div'); box.id = 'bigFilterEditor'; box.className = 'big-pop';
    box.innerHTML =
      '<div class="big-pop-t">' + T('Add filter', 'फ़िल्टर जोड़ें') + '</div>' +
      '<select id="bfCol" class="big-select">' + BIG.headers.map(function (h, i) { return '<option value="' + i + '">' + esc(h) + '</option>'; }).join('') + '</select>' +
      '<select id="bfOp" class="big-select">' + OPS.map(function (o) { return '<option value="' + o[0] + '">' + esc(T(o[1], o[2])) + '</option>'; }).join('') + '</select>' +
      '<input id="bfV1" class="big-input" placeholder="' + T('value', 'मान') + '"><input id="bfV2" class="big-input" placeholder="' + T('to', 'से') + '" style="display:none">' +
      '<div class="big-pop-a"><button class="tb-btn" id="bfCancel">' + T('Cancel', 'रद्द') + '</button><button class="tb-btn primary" id="bfAdd">' + T('Apply', 'लागू करें') + '</button></div>';
    $('bigview').appendChild(box);
    if (presetCol != null) { $('bfCol').value = presetCol; $('bfV1').value = presetVal == null ? '' : presetVal; }
    function sync() {
      var op = $('bfOp').value;
      $('bfV1').style.display = (op === 'empty' || op === 'notempty') ? 'none' : '';
      $('bfV2').style.display = op === 'between' ? '' : 'none';
    }
    $('bfOp').onchange = sync; sync();
    $('bfCancel').onclick = function () { box.remove(); };
    $('bfAdd').onclick = function () {
      var f = { col: +$('bfCol').value, op: $('bfOp').value, value: $('bfV1').value, value2: $('bfV2').value };
      var needsNum = ['gt', 'gte', 'lt', 'lte', 'between'].indexOf(f.op) >= 0;
      if (needsNum && (isNaN(parseFloat(f.value)) || (f.op === 'between' && isNaN(parseFloat(f.value2))))) { toast(T('Enter a number', 'संख्या दर्ज करें'), 'error'); return; }
      if (['eq', 'neq', 'contains'].indexOf(f.op) >= 0 && f.value === '') { toast(T('Enter a value', 'मान दर्ज करें'), 'error'); return; }
      if (needsNum) { f.value = parseFloat(f.value); if (f.op === 'between') f.value2 = parseFloat(f.value2); }
      BIG.filters.push(f); box.remove(); renderFilterBar(); BIG.refresh();
    };
    $('bfV1').focus();
  }

  // ---- side panel -----------------------------------------------------------------
  function renderSide() {
    document.querySelectorAll('.big-tabs button').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === BIG.tab); });
    var pane = $('bigPane');
    if (BIG.tab === 'columns') paneColumns(pane);
    else if (BIG.tab === 'group') paneGroup(pane);
    else paneSql(pane);
  }

  function paneColumns(pane) {
    if (!BIG.profile) { pane.innerHTML = '<div class="big-note">' + T('Analysing columns…', 'कॉलम जाँचे जा रहे हैं…') + '</div>'; return; }
    pane.innerHTML = '<div class="big-note">' + T('Click a column to see its most common values.', 'सबसे आम मान देखने के लिए कॉलम पर क्लिक करें।') + '</div>' +
      BIG.profile.columns.map(function (c) {
        var filledPct = BIG.profile.rows ? Math.round(c.filled / BIG.profile.rows * 100) : 0;
        var stats = c.type === 'number' ? T('min ', 'न्यूनतम ') + fmtNum(c.min) + ' · ' + T('max ', 'अधिकतम ') + fmtNum(c.max) + ' · ' + T('avg ', 'औसत ') + fmtNum(c.avg) : '~' + fmtInt(c.distinct) + ' ' + T('different values', 'अलग मान');
        return '<div class="big-card" data-i="' + c.index + '"><div class="big-card-h"><b>' + esc(c.name) + '</b><span class="big-tag">' + (c.type === 'number' ? T('number', 'संख्या') : (c.type === 'categorical' ? T('category', 'श्रेणी') : T('text', 'पाठ'))) + '</span><button class="big-chart" data-chart="' + c.index + '" title="' + T('Chart this column', 'इस कॉलम का चार्ट') + '">📊</button></div>' +
          '<div class="big-bar"><i style="width:' + filledPct + '%"></i></div><div class="big-sub">' + filledPct + '% ' + T('filled', 'भरा') + ' · ' + stats + '</div><div class="big-top-vals"></div></div>';
      }).join('');
    pane.querySelectorAll('.big-card').forEach(function (card) {
      card.onclick = function (ev) {
        if (ev.target.closest('.big-val')) return;
        var cb = ev.target.closest('.big-chart'); if (cb) { ev.stopPropagation(); if (window.STL && STL.chartColumn) STL.chartColumn(+cb.dataset.chart); return; }
        var i = +card.dataset.i, box = card.querySelector('.big-top-vals');
        if (box.dataset.open) { box.innerHTML = ''; delete box.dataset.open; return; }
        box.dataset.open = '1'; box.textContent = '…';
        api('/api/engine/' + BIG.ds + '/top/' + i + '?limit=8').then(function (vals) {
          box.innerHTML = vals.map(function (v) { return '<div class="big-val" data-v="' + esc(v.value) + '" title="' + T('Filter to this value', 'इस मान से फ़िल्टर करें') + '"><span>' + esc(v.value) + '</span><em>' + fmtInt(v.count) + '</em></div>'; }).join('') || '–';
          box.querySelectorAll('.big-val').forEach(function (r) { r.onclick = function () { BIG.filters.push({ col: i, op: 'eq', value: r.dataset.v }); renderFilterBar(); BIG.refresh(); }; });
        });
      };
    });
  }

  var groupChart = null;
  function paneGroup(pane) {
    var cols = BIG.headers.map(function (h, i) { return '<option value="' + i + '">' + esc(h) + '</option>'; }).join('');
    var nums = (BIG.profile ? BIG.profile.columns.filter(function (c) { return c.type === 'number'; }) : [])
      .map(function (c) { return '<option value="' + c.index + '">' + esc(c.name) + '</option>'; }).join('');
    pane.innerHTML =
      '<div class="big-note">' + T('Applies to the current search and filters.', 'वर्तमान खोज और फ़िल्टर पर लागू।') + '</div>' +
      '<label class="big-l">' + T('Group by', 'समूह बनाएँ') + '</label><select id="bgBy" class="big-select">' + cols + '</select>' +
      '<label class="big-l">' + T('Calculate', 'गणना') + '</label>' +
      '<select id="bgFn" class="big-select"><option value="count">' + T('Count of rows', 'पंक्तियों की गिनती') + '</option><option value="sum">' + T('Sum', 'योग') + '</option><option value="avg">' + T('Average', 'औसत') + '</option><option value="min">' + T('Minimum', 'न्यूनतम') + '</option><option value="max">' + T('Maximum', 'अधिकतम') + '</option><option value="median">' + T('Median', 'माध्यिका') + '</option></select>' +
      '<label class="big-l" id="bgColL">' + T('of column', 'कॉलम') + '</label><select id="bgCol" class="big-select">' + (nums || '<option value="">–</option>') + '</select>' +
      '<label class="big-l">' + T('Show top', 'शीर्ष') + '</label><select id="bgN" class="big-select"><option>10</option><option>20</option><option>50</option></select>' +
      '<button class="tb-btn primary" id="bgRun" style="width:100%;margin-top:8px;justify-content:center">' + T('Show result', 'परिणाम दिखाएँ') + '</button>' +
      '<div id="bgOut"></div>';
    function sync() { var c = $('bgFn').value === 'count'; $('bgCol').style.display = c ? 'none' : ''; $('bgColL').style.display = c ? 'none' : ''; }
    $('bgFn').onchange = sync; sync();
    $('bgRun').onclick = function () {
      var fn = $('bgFn').value, by = +$('bgBy').value, col = $('bgCol').value, n = +$('bgN').value;
      if (fn !== 'count' && col === '') { toast(T('This file has no number column', 'इस फ़ाइल में संख्या वाला कॉलम नहीं है'), 'error'); return; }
      var aggs = [fn === 'count' ? { fn: 'count' } : { fn: fn, col: +col }];
      api('/api/engine/' + BIG.ds + '/aggregate', { groupBy: [by], aggs: aggs, limit: n, desc: true, search: BIG.search, filters: queryBody().filters }).then(function (r) {
        var out = $('bgOut');
        out.innerHTML = '<canvas id="bgChart" height="190"></canvas><table class="big-tbl"><tr><th>' + esc(r.headers[0]) + '</th><th>' + esc(r.headers[1]) + '</th></tr>' +
          r.rows.map(function (x) { return '<tr><td>' + esc(x[0]) + '</td><td class="num">' + fmtNum(x[1]) + '</td></tr>'; }).join('') + '</table>';
        ensureChartLibrary(function () {
          if (groupChart) groupChart.destroy();
          var accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6366f1';
          groupChart = new Chart($('bgChart'), { type: 'bar',
            data: { labels: r.rows.map(function (x) { return String(x[0]).slice(0, 18); }), datasets: [{ label: r.headers[1], data: r.rows.map(function (x) { return x[1]; }), backgroundColor: accent }] },
            options: { indexAxis: 'y', plugins: { legend: { display: false } }, animation: false, scales: { x: { ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8' } } } } });
        });
      }).catch(function (e) { toast(e.message, 'error'); });
    };
  }

  function paneSql(pane) {
    var first = BIG.headers[0] || 'col';
    pane.innerHTML =
      '<div class="big-note">' + T('Write a SELECT. The table is called ', 'SELECT लिखें। तालिका का नाम है ') + '<code>data</code>. ' + T('Read-only: nothing can be changed.', 'केवल पढ़ने के लिए: कुछ भी बदला नहीं जा सकता।') + '</div>' +
      '<textarea id="sqlText" class="big-sql" spellcheck="false" rows="6">SELECT "' + esc(first.replace(/"/g, '""')) + '", count(*) AS n\nFROM data\nGROUP BY 1\nORDER BY n DESC\nLIMIT 20</textarea>' +
      '<button class="tb-btn primary" id="sqlRun" style="width:100%;justify-content:center">' + T('Run', 'चलाएँ') + '</button><div id="sqlOut"></div>';
    $('sqlRun').onclick = function () {
      var out = $('sqlOut'); out.textContent = '…';
      api('/api/engine/' + BIG.ds + '/query', { sql: $('sqlText').value }).then(function (r) {
        out.innerHTML = (r.truncated ? '<div class="big-note">' + T('Showing the first 10,000 rows.', 'पहली 10,000 पंक्तियाँ दिखाई गईं।') + '</div>' : '') +
          '<div class="big-tbl-wrap"><table class="big-tbl"><tr>' + r.headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr>' +
          r.rows.map(function (x) { return '<tr>' + x.map(function (v) { return '<td>' + esc(v) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table></div>';
        if (typeof _pvLog === 'function') _pvLog({ actor: 'user', action: 'SQL', method: 'sql', target: 'dataset', inputs: [], output: 'table', label: 'SQL query: ' + $('sqlText').value.slice(0, 80), labelHi: 'SQL क्वेरी' });
      }).catch(function (e) { out.innerHTML = '<div class="big-err">' + esc(e.message) + '</div>'; });
    };
  }

  // ---- actions -----------------------------------------------------------------------
  BIG.exportView = function (fmt) {
    toast(T('Preparing file…', 'फ़ाइल तैयार हो रही है…'), 'info');
    fetch('/api/engine/' + BIG.ds + '/export', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(queryBody({ format: fmt })) })
      .then(function (r) { if (!r.ok) return r.json().then(function (j) { throw new Error(j.error); }); return r.blob(); })
      .then(function (blob) {
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = BIG.name + '.' + fmt; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      }).catch(function (e) { toast(e.message, 'error'); });
  };

  BIG.copyToEditor = function () {
    busy(T('Copying rows into the editor…', 'पंक्तियाँ संपादक में लाई जा रही हैं…'));
    api('/api/engine/' + BIG.ds + '/copy', queryBody({ limit: COPY_MAX })).then(function (r) {
      var name = BIG.name;
      BIG.exit();
      importData([r.headers].concat(r.rows));
      var dn = $('documentName'); if (dn) dn.textContent = name + (r.truncated ? ' (first ' + fmtInt(r.limit) + ')' : ' (copy)');
      if (r.truncated) toast(T('Only the first ', 'केवल पहली ') + fmtInt(r.limit) + T(' matching rows were copied. Add filters to narrow the data.', ' मेल खाती पंक्तियाँ ली गईं। डेटा घटाने के लिए फ़िल्टर लगाएँ।'), 'warning');
    }).catch(function (e) { toast(e.message, 'error'); }).then(function () { busy(null); });
  };

  // ---- hooks into the rest of the app ------------------------------------------------------
  var _process = window.processFile;
  window.processFile = function (file) {
    if (BIG.shouldUse(file)) { BIG.openFile(file); return; }
    return _process.apply(this, arguments);
  };

  var _view = window.switchDDView;
  window.switchDDView = function (view) {
    if (BIG.active && view !== 'sheet') {
      toast(T('Not available for a large file. Use "Work on a copy" to bring rows into the editor first.', 'बड़ी फ़ाइल के लिए उपलब्ध नहीं। पहले "प्रति पर काम करें" से पंक्तियाँ संपादक में लाएँ।'), 'info');
      return;
    }
    return _view.apply(this, arguments);
  };

  var _tool = window.switchTool;
  window.switchTool = function (tool) {
    if (BIG.active && ['settings', 'profile'].indexOf(tool) < 0) {
      toast(T('Not available for a large file. Use "Work on a copy" to bring rows into the editor first.', 'बड़ी फ़ाइल के लिए उपलब्ध नहीं। पहले "प्रति पर काम करें" से पंक्तियाँ संपादक में लाएँ।'), 'info');
      return;
    }
    return _tool.apply(this, arguments);
  };

  // re-attach after a page refresh (the engine keeps the table while the app is running)
  document.addEventListener('DOMContentLoaded', function () {
    var s = null; try { s = JSON.parse(sessionStorage.getItem('stellura_big') || 'null'); } catch (e) {}
    if (!s) return;
    api('/api/engine/' + s.id + '/info').then(function (info) { BIG.attach(info); }).catch(function () { try { sessionStorage.removeItem('stellura_big'); } catch (e) {} });
  });

  // language switch
  var _setLang = window.setUiLanguage;
  window.setUiLanguage = function () {
    var r = _setLang.apply(this, arguments);
    if (BIG.active) { labels(); renderHeader(); renderFilterBar(); renderSide(); status(); }
    return r;
  };
})();
