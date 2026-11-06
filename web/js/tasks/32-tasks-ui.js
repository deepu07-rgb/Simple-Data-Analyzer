// =====================================================================
//  TASK-FIRST WORKSPACE  /  कार्य-केंद्रित कार्यक्षेत्र
//  Home tiles, Clean-a-messy-file dialog, Combine-files dialog, Steps record + Recipes,
//  command palette (Ctrl+K) and the Simple / Pro switch. Logic lives in 30-*.js and 31-*.js.
// =====================================================================
(function () {
  'use strict';
  var STL = window.STL = window.STL || {};
  var F = STL.fix, M = STL.merge;

  function T(en, hi) {
    var l = (typeof uiLanguage !== 'undefined') ? uiLanguage : 'en';
    return l === 'hi' ? hi : (l === 'bi' ? en + ' / ' + hi : en);
  }
  function TT(o) { return o ? T(o.en, o.hi) : ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function $(id) { return document.getElementById(id); }
  function fmt(n) { return Number(n).toLocaleString('en-IN'); }
  function hasData() { return typeof rawData !== 'undefined' && rawData.length > 0; }
  function busy(msg) {
    var el = $('stlBusy');
    if (!msg) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'stlBusy'; el.className = 'big-busy'; el.innerHTML = '<div class="big-busy-box"><div class="big-spin"></div><div id="stlBusyMsg"></div></div>'; document.body.appendChild(el); }
    $('stlBusyMsg').textContent = msg;
  }
  function overlay(id, inner, wide) {
    // Removing a dialog whose input has focus fires blur/change handlers that may redraw it again: let those run first,
    // then remove every old copy, so exactly one dialog is left.
    var act = document.activeElement; if (act && act !== document.body && act.blur && $(id) && $(id).contains(act)) act.blur();
    document.querySelectorAll('[id="' + id + '"]').forEach(function (e) { if (e.parentNode) e.parentNode.removeChild(e); });
    var o = document.createElement('div');
    o.id = id; o.className = 'big-busy prj-overlay stl-overlay';
    o.innerHTML = '<div class="prj-box stl-box' + (wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' + inner + '</div>';
    document.body.appendChild(o);
    o.addEventListener('mousedown', function (e) { if (e.target === o) o.remove(); });
    return o;
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ================================================================= steps record + recipes
  STL.steps = STL.steps || [];
  var RKEY = 'stellura_recipes';
  function loadRecipes() { try { return JSON.parse(localStorage.getItem(RKEY) || '[]'); } catch (e) { return []; } }
  function saveRecipes(r) { try { localStorage.setItem(RKEY, JSON.stringify(r)); } catch (e) {} }

  STL.logStep = function (type, title, detail, params) {
    STL.steps.push({ type: type, ts: Date.now(), title: title, detail: detail || null, params: params || null });
    updateStepsBadge(); if ($('stepsPanel') && $('stepsPanel').classList.contains('open')) renderSteps();
    if (typeof _pvLog === 'function') _pvLog({ actor: 'user', action: type.toUpperCase(), method: 'task', target: 'dataset', inputs: [], output: 'col:*', label: title.en + (detail ? ' — ' + detail.en : ''), labelHi: title.hi });
  };
  function updateStepsBadge() { var b = $('stepsBadge'); if (b) { b.textContent = STL.steps.length || ''; b.style.display = STL.steps.length ? '' : 'none'; } }

  function ensureStepsPanel() {
    if ($('stepsPanel')) return;
    var p = document.createElement('aside');
    p.id = 'stepsPanel'; p.className = 'stl-steps';
    p.innerHTML = '<div class="stl-steps-h"><b id="stepsTitle"></b><button id="stepsX" aria-label="close">×</button></div><div id="stepsBody" class="stl-steps-b"></div>';
    document.body.appendChild(p);
    $('stepsX').onclick = function () { p.classList.remove('open'); };
  }
  function renderSteps() {
    ensureStepsPanel();
    $('stepsTitle').textContent = T('Steps', 'चरण');
    var fixIds = {};
    STL.steps.forEach(function (s) { if (s.type === 'fix' && s.params && s.params.ids) s.params.ids.forEach(function (i) { fixIds[i] = 1; }); });
    var ids = F.STEP_IDS.filter(function (i) { return fixIds[i]; });
    var html = '<div class="big-note">' + T('Everything done to this file with the cleaning tools, in order. The original file is never changed.', 'सफ़ाई के औज़ारों से इस फ़ाइल पर किया गया सब कुछ, क्रम से। मूल फ़ाइल कभी नहीं बदलती।') + '</div>';
    if (!STL.steps.length) html += '<div class="big-note">' + T('No steps yet. Use "Clean a messy file" or "Combine files".', 'अभी कोई चरण नहीं। "बिगड़ी फ़ाइल साफ़ करें" या "फ़ाइलें जोड़ें" उपयोग करें।') + '</div>';
    html += STL.steps.map(function (s, i) {
      return '<div class="stl-step"><span class="stl-step-n">' + (i + 1) + '</span><div><b>' + esc(TT(s.title)) + '</b>' + (s.detail ? '<div class="big-sub">' + esc(TT(s.detail)) + '</div>' : '') + '<div class="big-sub">' + new Date(s.ts).toLocaleTimeString() + '</div></div></div>';
    }).join('');
    if (ids.length) {
      html += '<div class="stl-recipe-save"><label class="big-l">' + T('Save these cleaning steps as a recipe', 'इन सफ़ाई चरणों को रेसिपी के रूप में सहेजें') + '</label><div class="prj-row"><input id="rcName" class="big-input" placeholder="' + T('e.g. Monthly district file', 'जैसे: मासिक जिला फ़ाइल') + '"><button class="tb-btn primary" id="rcSave">' + T('Save', 'सहेजें') + '</button></div></div>';
    }
    var rec = loadRecipes();
    html += '<div class="prj-sub">' + T('Recipes', 'रेसिपी') + '</div>';
    html += rec.length ? rec.map(function (r, i) {
      return '<div class="prj-item"><div class="prj-n"><b>' + esc(r.name) + '</b><span>' + r.ids.map(function (id) { return esc(id); }).join(' · ') + '</span></div>' +
        '<button class="tb-btn primary" data-run="' + i + '">' + T('Run on this file', 'इस फ़ाइल पर चलाएँ') + '</button><button class="tb-btn danger" data-rm="' + i + '">×</button></div>';
    }).join('') : '<div class="big-note">' + T('A recipe repeats the same cleaning on next month\'s file in one click.', 'रेसिपी अगले महीने की फ़ाइल पर वही सफ़ाई एक क्लिक में दोहराती है।') + '</div>';
    $('stepsBody').innerHTML = html;
    var sv = $('rcSave');
    if (sv) sv.onclick = function () {
      var name = ($('rcName').value || '').trim(); if (!name) { toast(T('Enter a name', 'नाम लिखें'), 'error'); return; }
      var r = loadRecipes(); r.push({ name: name, ids: ids }); saveRecipes(r); renderSteps();
      toast(T('Recipe saved', 'रेसिपी सहेजी गई'), 'success');
    };
    $('stepsBody').querySelectorAll('[data-run]').forEach(function (b) { b.onclick = function () { runRecipe(loadRecipes()[+b.dataset.run]); }; });
    $('stepsBody').querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { var r = loadRecipes(); r.splice(+b.dataset.rm, 1); saveRecipes(r); renderSteps(); }; });
  }
  STL.toggleSteps = function () {
    ensureStepsPanel(); var p = $('stepsPanel');
    if (p.classList.toggle('open')) renderSteps();
  };
  function runRecipe(r) {
    if (!r) return;
    if (!hasData()) { toast(T('Open a file first', 'पहले फ़ाइल खोलें'), 'info'); return; }
    var res = F.apply(F.prepare(headers, rawData), r.ids);
    if (!res.applied.length) { toast(T('Nothing in this recipe applies to this file', 'इस रेसिपी का कुछ भी इस फ़ाइल पर लागू नहीं होता'), 'info'); return; }
    loadGrid(res.grid);
    STL.logStep('fix', { en: 'Recipe "' + r.name + '"', hi: 'रेसिपी "' + r.name + '"' }, { en: res.applied.map(function (a) { return a.id + ' ×' + a.count; }).join(', '), hi: res.applied.map(function (a) { return a.id + ' ×' + a.count; }).join(', ') }, { ids: res.applied.map(function (a) { return a.id; }) });
    toast(T('Recipe applied: ', 'रेसिपी लागू: ') + r.name, 'success');
  }

  // put a cleaned grid into the editor without raising the "tidy this file" banner again
  function loadGrid(grid) {
    var name = ($('documentName') || {}).textContent;
    STL._quiet = true;
    try { importData(grid); } finally { STL._quiet = false; }
    if (name && $('documentName')) $('documentName').textContent = name;
    hideBanner();
  }

  // ================================================================= Clean a messy file
  STL.openFixer = function () {
    if (window.BIG && BIG.active) { toast(T('Cleaning works on the editor. Use "Work on a copy" first.', 'सफ़ाई संपादक में चलती है। पहले "प्रति पर काम करें" उपयोग करें।'), 'info'); return; }
    if (!hasData()) { toast(T('Open a file first', 'पहले फ़ाइल खोलें'), 'info'); return; }
    busy(T('Looking for problems in the file…', 'फ़ाइल की समस्याएँ खोजी जा रही हैं…'));
    setTimeout(function () {
      var grid, res;
      try { grid = F.prepare(headers, rawData); res = F.analyze(grid); } catch (e) { busy(null); toast(e.message, 'error'); return; }
      busy(null); showFixer(grid, res);
    }, 40);
  };

  function showFixer(grid, res) {
    var inner = '<div class="prj-h"><b>' + T('Clean this file', 'यह फ़ाइल साफ़ करें') + '</b><button id="fxX" aria-label="close">×</button></div>';
    if (!res.steps.length) {
      inner += '<div class="stl-ok">✓ ' + T('Nothing to fix. This file looks clean.', 'सुधारने को कुछ नहीं। यह फ़ाइल साफ़ दिखती है।') + '</div>';
    } else {
      inner += '<div class="big-note">' + T('Tick what you want fixed. Nothing changes until you press Apply, and you can undo it.', 'जो ठीक करना चाहें उस पर निशान लगाएँ। "लागू करें" दबाने तक कुछ नहीं बदलता, और आप पूर्ववत कर सकते हैं।') + '</div>';
      inner += res.steps.map(function (s) {
        var ex = s.examples.map(function (e) { return '<div class="stl-ex"><span>' + esc(e.before) + '</span>' + (e.after !== '' ? ' → <b>' + esc(e.after) + '</b>' : ' <em>' + T('(removed)', '(हटाया जाएगा)') + '</em>') + '</div>'; }).join('');
        return '<label class="stl-fix"><input type="checkbox" data-id="' + s.id + '"' + (s.auto ? ' checked' : '') + '><div><div class="stl-fix-t"><b>' + esc(TT(s.title)) + '</b><span class="stl-count">' + fmt(s.count) + '</span></div>' +
          '<div class="big-sub">' + esc(TT(s.detail)) + '</div>' + (s.note ? '<div class="big-sub">' + T('Columns: ', 'कॉलम: ') + esc(s.note) + '</div>' : '') + ex + '</div></label>';
      }).join('');
      inner += '<div class="prj-row" style="justify-content:flex-end;margin-top:12px"><button class="tb-btn" id="fxCancel">' + T('Cancel', 'रद्द करें') + '</button><button class="tb-btn primary" id="fxApply"></button></div>';
    }
    var o = overlay('fixDialog', inner, true);
    var vgBtn = document.createElement('div'); vgBtn.className = 'prj-row'; vgBtn.style.cssText = 'margin-top:10px;justify-content:flex-start';
    vgBtn.innerHTML = '<button class="cs-link" id="fxVals">🔤 ' + T('Same thing, spelled differently (Kishangarh / Kishangrah)…', 'एक ही चीज़, अलग वर्तनी (Kishangarh / Kishangrah)…') + '</button>'; o.querySelector('.stl-box').appendChild(vgBtn);
    $('fxVals').onclick = function () { o.remove(); STL.openValueGroups(); };
    $('fxX').onclick = function () { o.remove(); };
    if (!res.steps.length) return;
    $('fxCancel').onclick = function () { o.remove(); };
    function count() { var n = o.querySelectorAll('input[data-id]:checked').length; $('fxApply').textContent = T('Apply ', 'लागू करें ') + '(' + n + ')'; $('fxApply').disabled = !n; }
    o.querySelectorAll('input[data-id]').forEach(function (c) { c.onchange = count; }); count();
    $('fxApply').onclick = function () {
      var ids = Array.prototype.map.call(o.querySelectorAll('input[data-id]:checked'), function (c) { return c.dataset.id; });
      o.remove(); busy(T('Cleaning…', 'सफ़ाई हो रही है…'));
      setTimeout(function () {
        try {
          var out = F.apply(grid, ids);
          loadGrid(out.grid);
          var title = { en: 'Cleaned the file', hi: 'फ़ाइल साफ़ की' };
          var names = out.applied.map(function (a) { var st = res.steps.filter(function (x) { return x.id === a.id; })[0]; return st ? st.title : null; }).filter(Boolean);
          STL.logStep('fix', title, { en: names.map(function (n) { return n.en; }).join('; '), hi: names.map(function (n) { return n.hi; }).join('; ') }, { ids: out.applied.map(function (a) { return a.id; }) });
          toast(T('Cleaned: ', 'साफ़ हुआ: ') + fmt(out.grid.length - 1) + T(' rows, ', ' पंक्तियाँ, ') + out.applied.length + T(' fixes applied', ' सुधार लागू'), 'success');
        } catch (e) { toast(e.message, 'error'); }
        busy(null);
      }, 40);
    };
  }

  // ---- "this file needs tidying" banner after import
  function hideBanner() { var b = $('fixBanner'); if (b) b.style.display = 'none'; }
  function showBanner(steps) {
    var b = $('fixBanner');
    if (!b) {
      b = document.createElement('div'); b.id = 'fixBanner'; b.className = 'stl-banner';
      var stage = $('workspace-stage'); if (stage && stage.parentNode) stage.parentNode.insertBefore(b, stage); else document.body.appendChild(b);
    }
    var names = steps.slice(0, 3).map(function (s) { return TT(s.title).toLowerCase(); });
    b.innerHTML = '<span class="stl-banner-t"><b>' + T('This file can be tidied: ', 'इस फ़ाइल को साफ़ किया जा सकता है: ') + '</b>' + esc(names.join('; ')) + (steps.length > 3 ? '…' : '') + '</span>' +
      '<button class="tb-btn primary" id="fbReview">' + T('Review', 'देखें') + '</button><button class="tb-btn" id="fbLater">' + T('Not now', 'अभी नहीं') + '</button>';
    b.style.display = 'flex';
    $('fbReview').onclick = function () { hideBanner(); STL.openFixer(); };
    $('fbLater').onclick = hideBanner;
  }
  // ---- "what do you want to know?" after a clean file opens: four plain choices
  function hideNext() { var b = $('nextBanner'); if (b) b.style.display = 'none'; }
  function showNext() {
    var b = $('nextBanner');
    if (!b) { b = document.createElement('div'); b.id = 'nextBanner'; b.className = 'stl-banner'; b.style.flexWrap = 'wrap'; var stage = $('workspace-stage'); if (stage && stage.parentNode) stage.parentNode.insertBefore(b, stage); else document.body.appendChild(b); }
    b.innerHTML = '<span class="stl-banner-t"><b>' + T('Your file is ready: ', 'आपकी फ़ाइल तैयार है: ') + fmt(rawData.length) + T(' rows, ', ' पंक्तियाँ, ') + headers.length + T(' columns. What would you like to do?', ' कॉलम। आप क्या करना चाहेंगे?') + '</b></span>' +
      '<button class="tb-btn primary" id="nbCharts">📊 ' + T('Show me the best charts', 'सबसे अच्छे चार्ट दिखाएँ') + '</button>' +
      '<button class="tb-btn" id="nbWhy">🔍 ' + T('What affects a number?', 'किसी संख्या को क्या प्रभावित करता है?') + '</button>' +
      '<button class="tb-btn" id="nbFair">⚖ ' + T('Is a difference real?', 'क्या अंतर असली है?') + '</button>' +
      '<button class="tb-btn" id="nbAdd">➕ ' + T('Add a column (like the change)', 'नया कॉलम जोड़ें (जैसे बदलाव)') + '</button>' +
      '<button class="tb-btn" id="nbX" aria-label="close">×</button>';
    b.style.display = 'flex';
    $('nbCharts').onclick = function () { hideNext(); if (STL.openChartStudio) STL.openChartStudio(); };
    $('nbWhy').onclick = function () { hideNext(); if (STL.openDrivers) STL.openDrivers(); };
    $('nbFair').onclick = function () { hideNext(); if (STL.openFair) STL.openFair(); };
    $('nbAdd').onclick = function () { hideNext(); if (STL.openAddColumn) STL.openAddColumn(); };
    $('nbX').onclick = hideNext;
  }
  function checkFile() {
    hideBanner(); hideNext();
    if (STL._openFixerAfterImport) { STL._openFixerAfterImport = false; setTimeout(STL.openFixer, 300); return; }
    if (!hasData()) return;
    setTimeout(function () {
      try {
        var res = F.analyze(F.prepare(headers, rawData.slice(0, 3000)));
        var found = res.steps.filter(function (s) { return s.banner; });
        if (found.length) showBanner(found); else if (rawData.length >= 20 && headers.length >= 2) showNext();
      } catch (e) { /* the banner is a convenience only */ }
    }, 600);
  }
  var _imp = window.importData;
  window.importData = function () {
    var r = _imp.apply(this, arguments);
    if (!STL._quiet) checkFile();
    return r;
  };

  // ================================================================= Combine files
  var MG = { files: [], plan: null, over: {}, opts: { source: true, dedupe: false } };
  var AUTO_CLEAN = ['sectionTitles', 'headerRow', 'twoRowHeader', 'blanks', 'repeatedHeaders', 'totalRows', 'footerRows', 'whitespace'];

  STL.openMerge = function () {
    MG.files = []; MG.plan = null; MG.over = {};
    var inp = $('mergeFileInput');
    if (!inp) {
      inp = document.createElement('input'); inp.type = 'file'; inp.id = 'mergeFileInput'; inp.multiple = true; inp.accept = '.csv,.tsv,.txt,.xlsx,.xls'; inp.style.display = 'none';
      inp.onchange = function (e) { addFiles(Array.prototype.slice.call(e.target.files)); e.target.value = ''; };
      document.body.appendChild(inp);
    }
    renderMerge();
  };

  function readGrid(file, sheet) {
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'xlsx') {
      var fd = new FormData(); fd.append('file', file); if (sheet) fd.append('sheet', sheet);
      return fetch('/api/upload', { method: 'POST', body: fd }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.message || j.error); return j; }); })
        .then(function (j) { return { grid: [j.headers || []].concat((j.data || []).map(function (r) { return r.map(function (c) { return c == null ? '' : String(c); }); })), sheets: j.sheets || [], sheet: j.activeSheet }; });
    }
    if (ext === 'xls') {
      return new Promise(function (res, rej) {
        if (!window.XLSX) { rej(new Error('Excel reader missing')); return; }
        var rd = new FileReader();
        rd.onload = function () { try { var wb = XLSX.read(rd.result, { type: 'array' }); var nm = sheet || wb.SheetNames[0]; res({ grid: XLSX.utils.sheet_to_json(wb.Sheets[nm], { header: 1, defval: '' }).map(function (r) { return r.map(String); }), sheets: wb.SheetNames, sheet: nm }); } catch (e) { rej(e); } };
        rd.onerror = function () { rej(new Error('Could not read the file')); };
        rd.readAsArrayBuffer(file);
      });
    }
    return file.text().then(function (t) { return { grid: M.parseDelimited(t), sheets: [], sheet: null }; });
  }

  function cleanFile(entry, grid, steps) {
    var prepared = F.prepare(grid[0] || [], grid.slice(1));
    var before = prepared.length - 1;
    var out = F.apply(prepared, steps || AUTO_CLEAN);
    entry.headers = out.grid[0]; entry.rows = out.grid.slice(1);
    entry.cleaned = out.applied;
    entry.removed = Math.max(before - entry.rows.length, 0);
  }

  function addFiles(list) {
    busy(T('Reading files…', 'फ़ाइलें पढ़ी जा रही हैं…'));
    var chain = Promise.resolve();
    list.forEach(function (f) {
      chain = chain.then(function () {
        return readGrid(f).then(function (r) {
          var e = { name: f.name, file: f, sheets: r.sheets, sheet: r.sheet };
          cleanFile(e, r.grid); MG.files.push(e);
        }).catch(function (err) { toast(f.name + ': ' + err.message, 'error'); });
      });
    });
    chain.then(function () { MG.over = {}; busy(null); renderMerge(); });
  }

  function replan() {
    MG.plan = MG.files.length ? M.plan(MG.files.map(function (f) { return { name: f.name, headers: f.headers, rows: f.rows }; })) : null;
    if (!MG.plan) return;
    // manual choices survive re-planning (keyed by file name + source column)
    MG.plan.maps.forEach(function (map, fi) {
      map.forEach(function (m) {
        var key = MG.files[fi].name + '|' + m.src, ov = MG.over[key];
        if (ov === undefined) return;
        m.level = 'manual';
        if (ov === '__skip') { m.tgt = -1; return; }
        var idx = MG.plan.headers.indexOf(ov);
        if (idx < 0) { MG.plan.headers.push(ov); idx = MG.plan.headers.length - 1; }
        m.tgt = idx;
      });
    });
  }

  function renderMerge() {
    replan();
    var plan = MG.plan, n = MG.files.length;
    var inner = '<div class="prj-h"><b>' + T('Combine files', 'फ़ाइलें जोड़ें') + '</b><button id="mgX" aria-label="close">×</button></div>' +
      '<div class="big-note">' + T('Add the files (Excel or CSV). Columns with the same meaning are matched even when the names differ ("थाना", "Police Station", "PS Name"). Title rows, totals and repeated headers are removed from each file.', 'फ़ाइलें जोड़ें (एक्सेल या CSV)। नाम अलग होने पर भी समान अर्थ वाले कॉलम मिलाए जाते हैं ("थाना", "Police Station", "PS Name")। हर फ़ाइल की शीर्षक पंक्तियाँ, योग और दोहराए शीर्षक हटाए जाते हैं।') + '</div>' +
      '<div class="stl-drop" id="mgDrop"><button class="tb-btn primary" id="mgAdd">' + T('Add files…', 'फ़ाइलें जोड़ें…') + '</button><span>' + T('or drop them here', 'या यहाँ छोड़ें') + '</span></div>';
    if (n) {
      inner += '<div class="prj-sub">' + T('Files', 'फ़ाइलें') + ' (' + n + ')</div>';
      inner += MG.files.map(function (f, fi) {
        var map = plan.maps[fi], review = map.filter(function (m) { return m.level === 'review'; }).length, fresh = fi > 0 ? map.filter(function (m) { return m.level === 'new'; }).length : 0;
        var rows = map.map(function (m) {
          var opts = '<option value="__skip"' + (m.tgt < 0 ? ' selected' : '') + '>' + T('(leave out)', '(छोड़ें)') + '</option>' +
            plan.headers.map(function (h, j) { return '<option value="' + esc(h) + '"' + (m.tgt === j ? ' selected' : '') + '>' + esc(h) + '</option>'; }).join('');
          var badge = { auto: T('matched', 'मिला'), review: T('please check', 'जाँचें'), 'new': T('new column', 'नया कॉलम'), first: '', manual: T('your choice', 'आपकी पसंद') }[m.level] || '';
          var why = /^values:/.test(m.reason || '') ? ' <span class="big-sub">(' + { 'values:code': T('same kind of number', 'उसी तरह की संख्या'), 'values:set': T('same values inside', 'भीतर वही मान'), 'values:dates': T('dates of the same period', 'उसी अवधि की तारीखें'), 'values:numbers': T('numbers of the same size', 'उसी आकार की संख्याएँ') }[m.reason] + ')</span>' : (m.reason === 'learned' ? ' <span class="big-sub">(' + T('you matched these before', 'आपने पहले ये मिलाए थे') + ')</span>' : '');
          return '<tr class="lvl-' + m.level + '"><td>' + esc(f.headers[m.src] || 'Column ' + (m.src + 1)) + why + '</td><td>→</td><td><select class="big-select" data-f="' + fi + '" data-s="' + m.src + '">' + opts + '</select></td><td class="stl-b">' + badge + '</td></tr>';
        }).join('');
        return '<details class="stl-file"' + ((review || fresh) ? ' open' : '') + '><summary><b>' + esc(f.name) + '</b> <span class="big-sub">' + fmt(f.rows.length) + ' ' + T('rows', 'पंक्तियाँ') + (f.removed ? ' · ' + T('cleaned: ', 'साफ़: ') + f.removed + ' ' + T('rows removed', 'पंक्तियाँ हटीं') : '') + (review ? ' · <span class="stl-warn">' + review + ' ' + T('to check', 'जाँचने हैं') + '</span>' : '') + '</span>' +
          '<span class="stl-file-a">' + (f.sheets.length > 1 ? '<select class="big-select" data-sheet="' + fi + '">' + f.sheets.map(function (s) { return '<option' + (s === f.sheet ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select>' : '') +
          (fi > 0 ? '<button class="stl-ic" data-up="' + fi + '" title="' + T('Move up', 'ऊपर') + '">↑</button>' : '') + '<button class="stl-ic" data-rm="' + fi + '" title="' + T('Remove', 'हटाएँ') + '">×</button></span></summary>' +
          '<table class="big-tbl stl-map"><tr><th>' + T('Column in this file', 'इस फ़ाइल का कॉलम') + '</th><th></th><th>' + T('Goes to', 'यहाँ जाएगा') + '</th><th></th></tr>' + rows + '</table></details>';
      }).join('');
      var built = M.build(MG.files.map(function (f) { return { name: f.name, headers: f.headers, rows: f.rows }; }), plan, { sourceColumn: MG.opts.source ? T('Source file', 'स्रोत फ़ाइल') : null, dropDuplicates: MG.opts.dedupe });
      MG.built = built;
      inner += '<div class="stl-opts"><label><input type="checkbox" id="mgSrc"' + (MG.opts.source ? ' checked' : '') + '> ' + T('Add a "Source file" column', '"स्रोत फ़ाइल" कॉलम जोड़ें') + '</label>' +
        '<label><input type="checkbox" id="mgDup"' + (MG.opts.dedupe ? ' checked' : '') + '> ' + T('Remove identical rows', 'एक जैसी पंक्तियाँ हटाएँ') + (MG.opts.dedupe ? ' (' + built.report.duplicates + ')' : '') + '</label></div>' +
        '<div class="prj-sub">' + T('Preview', 'पूर्वावलोकन') + ' — ' + fmt(built.rows.length) + ' ' + T('rows', 'पंक्तियाँ') + ' × ' + built.headers.length + ' ' + T('columns', 'कॉलम') + '</div>' +
        '<div class="big-tbl-wrap"><table class="big-tbl"><tr>' + built.headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr>' +
        built.rows.slice(0, 5).map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table></div>' +
        '<div class="prj-row" style="justify-content:flex-end;margin-top:12px"><button class="tb-btn" id="mgCancel">' + T('Cancel', 'रद्द करें') + '</button><button class="tb-btn primary" id="mgGo">' + T('Combine ', 'जोड़ें ') + '(' + fmt(built.rows.length) + ' ' + T('rows', 'पंक्तियाँ') + ')</button></div>';
    }
    var o = overlay('mergeDialog', inner, true);
    $('mgX').onclick = function () { o.remove(); };
    $('mgAdd').onclick = function () { $('mergeFileInput').click(); };
    var drop = $('mgDrop');
    drop.ondragover = function (e) { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = function () { drop.classList.remove('over'); };
    drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove('over'); addFiles(Array.prototype.slice.call(e.dataTransfer.files)); };
    if (!n) return;
    o.querySelectorAll('select[data-f]').forEach(function (sel) {
      sel.onchange = function () {
        var f = MG.files[+sel.dataset.f]; MG.over[f.name + '|' + sel.dataset.s] = sel.value;
        if (sel.value !== '__skip' && STL.lex) STL.lex.learnColumn(f.headers[+sel.dataset.s], sel.value);                       // next time these two headings match by themselves
        renderMerge();
      };
    });
    o.querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function (e) { e.preventDefault(); MG.files.splice(+b.dataset.rm, 1); MG.over = {}; renderMerge(); }; });
    o.querySelectorAll('[data-up]').forEach(function (b) { b.onclick = function (e) { e.preventDefault(); var i = +b.dataset.up, t = MG.files[i]; MG.files[i] = MG.files[i - 1]; MG.files[i - 1] = t; MG.over = {}; renderMerge(); }; });
    o.querySelectorAll('select[data-sheet]').forEach(function (sel) {
      sel.onchange = function () {
        var e = MG.files[+sel.dataset.sheet]; busy(T('Reading sheet…', 'शीट पढ़ी जा रही है…'));
        readGrid(e.file, sel.value).then(function (r) { e.sheet = r.sheet; cleanFile(e, r.grid); }).catch(function (er) { toast(er.message, 'error'); }).then(function () { busy(null); renderMerge(); });
      };
    });
    $('mgSrc').onchange = function () { MG.opts.source = this.checked; renderMerge(); };
    $('mgDup').onchange = function () { MG.opts.dedupe = this.checked; renderMerge(); };
    $('mgCancel').onclick = function () { o.remove(); };
    $('mgGo').onclick = function () {
      var b = MG.built;
      o.remove(); busy(T('Combining…', 'जोड़ा जा रहा है…'));
      setTimeout(function () {
        try {
          if (b.rows.length > 200000) { busy(null); toast(T('That is a lot of rows for the editor. Combine fewer files, or save them as CSV and open in Large File mode.', 'संपादक के लिए पंक्तियाँ बहुत हैं। कम फ़ाइलें जोड़ें, या CSV सहेजकर बड़ी फ़ाइल मोड में खोलें।'), 'error'); return; }
          loadGrid([b.headers].concat(b.rows));
          if ($('documentName')) $('documentName').textContent = T('Combined', 'संयुक्त') + ' (' + MG.files.length + ')';
          STL.logStep('merge', { en: 'Combined ' + MG.files.length + ' files', hi: MG.files.length + ' फ़ाइलें जोड़ीं' },
            { en: MG.files.map(function (f, i) { return f.name + ' (' + b.report.files[i].rows + ')'; }).join(', '), hi: MG.files.map(function (f, i) { return f.name + ' (' + b.report.files[i].rows + ')'; }).join(', ') });
          toast(T('Combined ', 'जोड़ा गया: ') + MG.files.length + T(' files into ', ' फ़ाइलें → ') + fmt(b.rows.length) + T(' rows', ' पंक्तियाँ'), 'success');
        } catch (e) { toast(e.message, 'error'); }
        busy(null);
      }, 40);
    };
  }

  // ================================================================= command palette
  var ACTIONS = [];
  function act(en, hi, kw, run, group) { ACTIONS.push({ en: en, hi: hi, kw: kw || '', run: run, group: group || '' }); }
  function tool(t) { return function () { switchTool(t); }; }
  function view(v) { return function () { switchDDView(v); }; }
  function click(id) { return function () { var e = $(id); if (e) e.click(); }; }
  // files and data
  act('Open a file', 'फ़ाइल खोलें', 'import excel csv upload kholo file kholna', click('fileInput'), 'File');
  act('Paste data from clipboard', 'क्लिपबोर्ड से डेटा चिपकाएँ', 'paste clipboard chipkao copy', function () { pasteFromClipboard(); }, 'File');
  act('Open a large file (millions of rows)', 'बड़ी फ़ाइल खोलें', 'large big million rows badi file', function () { BIG.pickFile(); }, 'File');
  act('Combine files', 'फ़ाइलें जोड़ें', 'merge combine consolidate join jodo ek karo district files', function () { STL.openMerge(); }, 'File');
  act('Clean a messy file', 'बिगड़ी फ़ाइल साफ़ करें', 'clean fix messy tidy saaf sudhar krutidev lakh dates title rows total rows', function () { STL.openFixer(); }, 'Clean');
  act('Projects: save or open', 'प्रोजेक्ट: सहेजें / खोलें', 'project save open sahejo kholo stellura', function () { PRJ.openDialog(); }, 'File');
  act('Steps and recipes', 'चरण और रेसिपी', 'steps history recipe repeat charan recipe', function () { STL.toggleSteps(); }, 'Clean');
  act('Load sample data (English)', 'नमूना डेटा (अंग्रेज़ी)', 'sample demo example namuna', function () { loadSampleEnglish(); }, 'File');
  act('Load sample data (Hindi)', 'नमूना डेटा (हिंदी)', 'sample demo example namuna hindi', function () { loadSampleHindi(); }, 'File');
  act('Save session', 'सत्र सहेजें', 'save ctrl s sahejo', function () { saveState(); }, 'File');
  act('Export to Excel', 'एक्सेल में निर्यात', 'export excel xlsx download', function () { showExportExcelDialog(); }, 'Export');
  act('Export to PDF', 'पीडीएफ में निर्यात', 'export pdf download print', function () { showExportPDFDialog(); }, 'Export');
  act('Print layout', 'प्रिंट लेआउट', 'print layout chhapo', function () { showPrintPreview(); }, 'Export');
  // work with data
  act('Smart clean wizard (duplicates, blanks, spaces)', 'स्मार्ट क्लीन (डुप्लिकेट, खाली, स्थान)', 'duplicates blanks trim remove cleanup wizard', function () { openCleanupWizard(); }, 'Clean');
  act('Find duplicates / data quality', 'डुप्लिकेट / डेटा गुणवत्ता', 'duplicates quality validate check', tool('validation'), 'Clean');
  act('Filter rows', 'पंक्तियाँ फ़िल्टर करें', 'filter search chhanto', tool('filter'), 'Analyse');
  act('Statistics for a column', 'कॉलम के आँकड़े', 'analyze statistics sum average min max count aankde', tool('analysis'), 'Analyse');
  act('Make a chart', 'चार्ट बनाएँ', 'chart graph bar pie line banao', tool('chart'), 'Analyse');
  act('Pivot table', 'पिवट टेबल', 'pivot summary table', tool('pivot'), 'Analyse');
  act('Group and total', 'समूह और योग', 'group by total sum category', tool('groupby'), 'Analyse');
  act('Compare two columns', 'दो कॉलम की तुलना', 'compare columns difference', tool('comparison'), 'Analyse');
  act('Formulas', 'सूत्र', 'formula function calculate sutra', tool('formulas'), 'Analyse');
  act('Conditional formatting (colour rules)', 'शर्त के अनुसार रंग', 'conditional formatting colour highlight rang', tool('format'), 'Analyse');
  act('Hindi fonts: Krutidev ↔ Unicode', 'हिंदी फ़ॉन्ट: कृतिदेव ↔ यूनिकोड', 'hindi font krutidev devlys unicode convert', tool('hindi'), 'Clean');
  act('Column tools (rename, split, merge)', 'कॉलम औज़ार', 'column rename split merge hide', tool('columns'), 'Clean');
  act('Ask a question about the data (AI)', 'डेटा से प्रश्न पूछें (एआई)', 'ask question ai intelligence forecast regression anomaly prashn poochho', tool('intelligence'), 'Analyse');
  act('Dashboard', 'डैशबोर्ड', 'dashboard kpi cards', tool('dashboard'), 'Analyse');
  // views
  act('Go to Data', 'डेटा पर जाएँ', 'data sheet table', view('sheet'), 'Go to');
  act('Structure (X-Ray): keys and links', 'संरचना (एक्स-रे)', 'xray structure relationships keys links', view('xray'), 'Go to');
  act('What-If simulation', 'क्या-अगर सिमुलेशन', 'whatif what if simulate slider', view('whatif'), 'Go to');
  act('History (audit trail)', 'इतिहास (ऑडिट)', 'history audit trail provenance log itihas', view('audit'), 'Go to');
  act('Reports', 'रिपोर्ट', 'report pdf generate', view('reports'), 'Go to');
  act('Recipes canvas (Pro)', 'रेसिपी कैनवास (प्रो)', 'agents recipes canvas pipeline modules', view('agents'), 'Go to');
  // app
  act('Undo', 'पूर्ववत', 'undo ctrl z wapas', function () { undoAction(); }, 'App');
  act('Redo', 'फिर करें', 'redo ctrl y', function () { redoAction(); }, 'App');
  act('Switch light / dark appearance', 'रोशनी / अँधेरा रूप बदलें', 'theme dark light office cosmos mode', function () { toggleTheme(); }, 'App');
  act('Switch Simple / Pro mode', 'सरल / प्रो मोड बदलें', 'simple pro mode advanced toolbar formula', function () { STL.toggleMode(); }, 'App');
  act('Language: English', 'भाषा: अंग्रेज़ी', 'language english bhasha', function () { setUiLanguage('en'); }, 'App');
  act('Language: हिंदी', 'भाषा: हिंदी', 'language hindi bhasha', function () { setUiLanguage('hi'); }, 'App');
  act('Language: English + हिंदी', 'भाषा: दोनों', 'language both bilingual bhasha', function () { setUiLanguage('bi'); }, 'App');
  act('Settings', 'सेटिंग्स', 'settings preferences', tool('settings'), 'App');
  act('My profile (name, office)', 'मेरी प्रोफ़ाइल (नाम, कार्यालय)', 'profile name office designation', tool('profile'), 'App');

  function normQ(t) { return String(t || '').toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim(); }
  function filterActions(q) {
    q = normQ(q);
    if (!q) return ACTIONS.slice();
    var toks = q.split(' ');
    var scored = [];
    ACTIONS.forEach(function (a) {
      var hay = normQ(a.en + ' ' + a.hi + ' ' + a.kw + ' ' + a.group);
      var ok = toks.every(function (t) { return hay.indexOf(t) >= 0; });
      if (!ok) return;
      var score = 0, title = normQ(a.en + ' ' + a.hi);
      toks.forEach(function (t) { if (title.indexOf(t) === 0) score += 3; else if (title.indexOf(' ' + t) >= 0) score += 2; else if (title.indexOf(t) >= 0) score += 1; });
      scored.push({ a: a, s: score });
    });
    scored.sort(function (x, y) { return y.s - x.s; });
    return scored.map(function (x) { return x.a; });
  }
  var PAL = { sel: 0, list: [] };
  STL.openPalette = function () {
    var o = overlay('palette', '<input id="palInput" class="big-input stl-pal-in" autocomplete="off" spellcheck="false"><div id="palList" class="stl-pal-list" role="listbox"></div><div class="stl-pal-foot"></div>');
    o.classList.add('stl-pal');
    var inp = $('palInput'); inp.placeholder = T('What do you want to do?  e.g. combine, clean, chart, साफ़', 'आप क्या करना चाहते हैं?  जैसे: जोड़ें, साफ़, चार्ट, combine');
    o.querySelector('.stl-pal-foot').textContent = T('↑↓ choose · Enter run · Esc close', '↑↓ चुनें · Enter चलाएँ · Esc बंद');
    function draw() {
      PAL.list = filterActions(inp.value); if (PAL.sel >= PAL.list.length) PAL.sel = Math.max(PAL.list.length - 1, 0);
      $('palList').innerHTML = PAL.list.length ? PAL.list.slice(0, 60).map(function (a, i) {
        return '<div class="stl-pal-i' + (i === PAL.sel ? ' sel' : '') + '" role="option" data-i="' + i + '"><span>' + esc(T(a.en, a.hi)) + '</span><em>' + esc(a.group) + '</em></div>';
      }).join('') : '<div class="big-note" style="padding:12px">' + T('Nothing matches. Try another word.', 'कुछ नहीं मिला। दूसरा शब्द आज़माएँ।') + '</div>';
      var sel = $('palList').querySelector('.sel'); if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
      $('palList').querySelectorAll('.stl-pal-i').forEach(function (el) {
        el.onmousemove = function () { PAL.sel = +el.dataset.i; $('palList').querySelectorAll('.stl-pal-i').forEach(function (x) { x.classList.toggle('sel', x === el); }); };
        el.onclick = function () { run(+el.dataset.i); };
      });
    }
    function run(i) { var a = PAL.list[i]; if (!a) return; o.remove(); setTimeout(function () { try { a.run(); } catch (e) { toast(e.message, 'error'); } }, 30); }
    inp.oninput = function () { PAL.sel = 0; draw(); };
    inp.onkeydown = function (e) {
      if (e.key === 'ArrowDown') { PAL.sel = Math.min(PAL.sel + 1, Math.min(PAL.list.length, 60) - 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { PAL.sel = Math.max(PAL.sel - 1, 0); draw(); e.preventDefault(); }
      else if (e.key === 'Enter') { run(PAL.sel); e.preventDefault(); }
      else if (e.key === 'Escape') { o.remove(); }
    };
    PAL.sel = 0; draw(); inp.focus();
  };
  ACTIONS.push({ en: 'How to use Stellura (user guide)', hi: 'Stellura कैसे उपयोग करें (उपयोग गाइड)', kw: 'help guide manual how to use tutorial madad margdarshika upyog', run: function () { window.open('/static/guide/guide.html', '_blank'); }, group: 'Help' });
  STL.actions = ACTIONS;
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault(); e.stopPropagation();
      if ($('palette')) $('palette').remove(); else STL.openPalette();
    }
  }, true);

  // ================================================================= Simple / Pro
  STL.setMode = function (m) {
    m = m === 'pro' ? 'pro' : 'simple';
    document.documentElement.setAttribute('data-stel-mode', m);
    try { localStorage.setItem('stellura_mode', m); } catch (e) {}
    var b = $('stlModeBtn'); if (b) { b.textContent = m === 'pro' ? T('Pro', 'प्रो') : T('Simple', 'सरल'); b.title = T('Switch between Simple and Pro. Pro shows the formatting bar, formula bar and every view.', 'सरल और प्रो के बीच बदलें। प्रो में फ़ॉर्मैटिंग बार, सूत्र बार और सभी व्यू दिखते हैं।'); b.setAttribute('aria-pressed', m === 'pro'); }
    if (m === 'simple' && window.DD && DD.workspace && ['agents'].indexOf(DD.workspace.view) >= 0 && typeof switchDDView === 'function') switchDDView('sheet');
  };
  STL.toggleMode = function () { STL.setMode(document.documentElement.getAttribute('data-stel-mode') === 'pro' ? 'simple' : 'pro'); };

  function buildToolbarExtras() {
    var tb = $('toolbar'); if (!tb || $('stlModeBtn')) return;
    // Insights: one tab that opens Structure / What-If / History (Simple mode)
    var sw = document.querySelector('.dd-view-switch');
    if (sw && !$('stlInsights')) {
      var wrap = document.createElement('div'); wrap.id = 'stlInsights'; wrap.className = 'stl-insights';
      wrap.innerHTML = '<button class="dd-view-btn" data-view="insights" id="stlInsBtn" aria-haspopup="true"></button><div class="stl-ins-menu" id="stlInsMenu"></div>';
      var reports = sw.querySelector('[data-view="reports"]'); sw.insertBefore(wrap, reports ? reports.nextSibling : null);
      $('stlInsBtn').onclick = function (e) { e.stopPropagation(); $('stlInsMenu').classList.toggle('open'); };
      document.addEventListener('click', function () { var m = $('stlInsMenu'); if (m) m.classList.remove('open'); });
    }
    var save = tb.querySelector('.tb-btn.primary');
    var steps = document.createElement('button'); steps.className = 'tb-btn'; steps.id = 'stlStepsBtn'; steps.onclick = function () { STL.toggleSteps(); };
    steps.innerHTML = '<span id="stlStepsLbl"></span> <span id="stepsBadge" class="stl-badge" style="display:none"></span>';
    var pal = document.createElement('button'); pal.className = 'tb-btn'; pal.id = 'stlPalBtn'; pal.onclick = function () { STL.openPalette(); };
    var mode = document.createElement('button'); mode.className = 'tb-btn stl-mode'; mode.id = 'stlModeBtn'; mode.onclick = function () { STL.toggleMode(); };
    var ref = save || tb.lastElementChild;
    tb.insertBefore(pal, ref); tb.insertBefore(steps, ref); tb.insertBefore(mode, ref);
    labelToolbar();
  }
  function labelToolbar() {
    var p = $('stlPalBtn'); if (p) { p.textContent = T('Search  Ctrl+K', 'खोजें  Ctrl+K'); p.title = T('Find any action (Ctrl+K)', 'कोई भी कार्य खोजें (Ctrl+K)'); }
    var s = $('stlStepsLbl'); if (s) s.textContent = T('Steps', 'चरण');
    var ib = $('stlInsBtn'); if (ib) ib.textContent = T('Insights', 'अंतर्दृष्टि');
    var m = $('stlInsMenu');
    if (m) {
      m.innerHTML = '<button data-v="xray">' + T('Structure (X-Ray)', 'संरचना (एक्स-रे)') + '</button><button data-v="whatif">' + T('What-If', 'क्या-अगर') + '</button><button data-v="audit">' + T('History', 'इतिहास') + '</button>';
      m.querySelectorAll('button').forEach(function (b) { b.onclick = function () { m.classList.remove('open'); switchDDView(b.dataset.v); document.querySelectorAll('.dd-view-btn').forEach(function (x) { x.classList.toggle('active', x.dataset.view === 'insights'); }); }; });
    }
    STL.setMode(document.documentElement.getAttribute('data-stel-mode'));
  }

  // ================================================================= Home tiles
  function buildHome() {
    var w = $('welcome'); if (!w || $('stlHome')) return;
    var hero = w.querySelector('.hero-section'); if (!hero) return;
    var home = document.createElement('div'); home.id = 'stlHome'; home.className = 'stl-home';
    hero.parentNode.insertBefore(home, hero.nextSibling);
    renderHome();
  }
  function renderHome() {
    var home = $('stlHome'); if (!home) return;
    var tiles = [
      ['📂', 'Open a file', 'फ़ाइल खोलें', 'Excel or CSV', 'एक्सेल या CSV', function () { $('fileInput').click(); }],
      ['🧩', 'Combine files', 'फ़ाइलें जोड़ें', 'Many files into one table', 'कई फ़ाइलें, एक तालिका', function () { STL.openMerge(); }],
      ['🧹', 'Clean a messy file', 'बिगड़ी फ़ाइल साफ़ करें', 'Titles, totals, old Hindi font, lakh, dates', 'शीर्षक, योग, पुराना हिंदी फ़ॉन्ट, लाख, तारीख', function () { STL._openFixerAfterImport = true; $('fileInput').click(); }],
      ['💬', 'Ask a question', 'प्रश्न पूछें', 'Ask about your data', 'अपने डेटा से पूछें', function () { if (!hasData()) { toast(T('Open a file first, or try the sample data below.', 'पहले फ़ाइल खोलें, या नीचे नमूना डेटा आज़माएँ।'), 'info'); return; } switchTool('intelligence'); }],
      ['🗃️', 'Open a large file', 'बड़ी फ़ाइल खोलें', 'Up to millions of rows', 'लाखों पंक्तियों तक', function () { BIG.pickFile(); }],
      ['💾', 'Open a project', 'प्रोजेक्ट खोलें', 'Continue saved work', 'सहेजा हुआ काम जारी रखें', function () { PRJ.openDialog(); }]
    ];
    var extra = STL.extraTiles || [];                                                // tiles added by later modules: flagship tools first
    tiles = extra.filter(function (t) { return t[6]; }).concat(tiles, extra.filter(function (t) { return !t[6]; }));
    home.innerHTML = '<div class="stl-home-t">' + T('What do you want to do?', 'आप क्या करना चाहते हैं?') + '</div><div class="stl-tiles">' +
      tiles.map(function (t, i) { return '<button class="stl-tile" data-i="' + i + '"><span class="stl-tile-i">' + t[0] + '</span><b>' + esc(T(t[1], t[2])) + '</b><span>' + esc(T(t[3], t[4])) + '</span></button>'; }).join('') + '</div>' +
      '<div class="stl-guide-link"><a href="/static/guide/guide.html" target="_blank" rel="noopener">📘 ' + esc(T('How to use Stellura — step-by-step guide', 'Stellura कैसे उपयोग करें — चरण-दर-चरण गाइड')) + '</a></div>';
    home.querySelectorAll('.stl-tile').forEach(function (b) { b.onclick = tiles[+b.dataset.i][5]; });
  }

  // shared with the report tools (web/js/reports/50-*.js)
  STL.ui = { T: T, TT: TT, esc: esc, busy: busy, overlay: overlay, fmt: fmt, hasData: hasData, loadGrid: loadGrid, readGrid: readGrid, cleanFile: cleanFile, logStep: STL.logStep };

  // ================================================================= start-up
  function init() {
    var mode = 'simple'; try { mode = localStorage.getItem('stellura_mode') || 'simple'; } catch (e) {}
    document.documentElement.setAttribute('data-stel-mode', mode);
    buildToolbarExtras(); buildHome(); updateStepsBadge();
  }
  document.addEventListener('DOMContentLoaded', init);

  var _lang = window.setUiLanguage;
  window.setUiLanguage = function () {
    var r = _lang.apply(this, arguments);
    labelToolbar(); renderHome();
    if ($('stepsPanel') && $('stepsPanel').classList.contains('open')) renderSteps();
    return r;
  };

})();
