// =====================================================================
//  PROJECTS  /  प्रोजेक्ट
//  A project is one .stellura file in the user's Stellura/Projects folder: the table plus
//  all formatting, filters, steps and the audit trail. No 5 MB browser limit, easy to copy.
// =====================================================================
(function () {
  'use strict';

  function T(en, hi) {
    var l = (typeof uiLanguage !== 'undefined') ? uiLanguage : 'en';
    return l === 'hi' ? hi : (l === 'bi' ? en + ' / ' + hi : en);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function $(id) { return document.getElementById(id); }
  function api(path, body) {
    var opt = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    return fetch(path, opt).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Request failed'); return j; }); });
  }
  function fmtSize(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }

  // ---- what a project remembers about the sheet --------------------------------------
  // Explicit accessors for the sheet's state (these are page-level variables of the main script)
  var ACC = {
    colTypes: [function () { return colTypes; }, function (v) { colTypes = v; }],
    cfRules: [function () { return cfRules; }, function (v) { cfRules = v; }],
    activeFilters: [function () { return activeFilters; }, function (v) { activeFilters = v; }],
    validationRules: [function () { return validationRules; }, function (v) { validationRules = v; }],
    cellFonts: [function () { return cellFonts; }, function (v) { cellFonts = v; }],
    cellBold: [function () { return cellBold; }, function (v) { cellBold = v; }],
    cellItalic: [function () { return cellItalic; }, function (v) { cellItalic = v; }],
    cellUnderline: [function () { return cellUnderline; }, function (v) { cellUnderline = v; }],
    cellFontSize: [function () { return cellFontSize; }, function (v) { cellFontSize = v; }],
    cellFontColor: [function () { return cellFontColor; }, function (v) { cellFontColor = v; }],
    cellBgColor: [function () { return cellBgColor; }, function (v) { cellBgColor = v; }],
    cellAlignments: [function () { return cellAlignments; }, function (v) { cellAlignments = v; }],
    cellWraps: [function () { return cellWraps; }, function (v) { cellWraps = v; }],
    cellNumFormats: [function () { return cellNumFormats; }, function (v) { cellNumFormats = v; }],
    cellComments: [function () { return cellComments; }, function (v) { cellComments = v; }],
    mergedCells: [function () { return mergedCells; }, function (v) { mergedCells = v; }],
    cellFormulaMeta: [function () { return cellFormulaMeta; }, function (v) { cellFormulaMeta = v; }],
    colWidths: [function () { return colWidths; }, function (v) { colWidths = v; }],
    userProfile: [function () { return userProfile; }, function (v) { userProfile = v; }]
  };
  var KEYS = Object.keys(ACC);
  function getVar(k) { try { return ACC[k][0](); } catch (e) { return undefined; } }
  function setVar(k, v) { try { ACC[k][1](v); } catch (e) {} }

  function collectState() {
    var s = { documentName: ($('documentName') || {}).textContent || 'Untitled Analysis', savedBy: 'Stellura' };
    KEYS.forEach(function (k) { var v = getVar(k); if (v !== undefined) s[k] = v; });
    try { s.hiddenCols = Array.from(hiddenCols); } catch (e) {}
    if (window.DD) {
      s.ddProvenance = DD.provenance || [];
      s.ddNodes = (DD.workspace && DD.workspace.nodes) || [];
      s.ddEdges = (DD.workspace && DD.workspace.edges) || [];
      s.ddConfirmed = (DD.model && DD.model.confirmed) || [];
    }
    s.stlSteps = (window.STL && STL.steps) || [];
    return s;
  }

  function applyState(s) {
    if (!s) return;
    KEYS.forEach(function (k) { if (s[k] !== undefined) setVar(k, s[k]); });
    try { hiddenCols.clear(); (s.hiddenCols || []).forEach(function (c) { hiddenCols.add(c); }); } catch (e) {}
    if (window.DD) {
      if (Array.isArray(s.ddProvenance)) DD.provenance = s.ddProvenance;
      if (DD.workspace) { DD.workspace.nodes = s.ddNodes || []; DD.workspace.edges = s.ddEdges || []; }
      if (DD.model && Array.isArray(s.ddConfirmed)) DD.model.confirmed = s.ddConfirmed;
    }
    if (window.STL && Array.isArray(s.stlSteps)) { STL.steps = s.stlSteps; }
    if (s.documentName && $('documentName')) $('documentName').textContent = s.documentName;
    try { filteredData = null; populatePanelSelects(); showTable(); } catch (e) {}
    try { if (typeof renderCFRules === 'function') renderCFRules(); if (typeof renderActiveFilters === 'function') renderActiveFilters(); if (typeof renderValidationRules === 'function') renderValidationRules(); } catch (e) {}
    try { if (typeof _ddRestoreNodes === 'function') _ddRestoreNodes(); } catch (e) {}
  }

  // ---- dialog -------------------------------------------------------------------------
  function close() { var d = $('prjDialog'); if (d) d.remove(); }

  function openDialog() {
    close();
    var big = window.BIG && BIG.active;
    var hasData = big || (typeof rawData !== 'undefined' && rawData.length > 0);
    var d = document.createElement('div');
    d.id = 'prjDialog'; d.className = 'big-busy prj-overlay';
    var defName = (big ? BIG.name : (($('documentName') || {}).textContent || 'Untitled Analysis')).trim();
    d.innerHTML =
      '<div class="prj-box" role="dialog" aria-modal="true">' +
        '<div class="prj-h"><b>' + T('Projects', 'प्रोजेक्ट') + '</b><button id="prjX" aria-label="close">×</button></div>' +
        (hasData ? '<div class="prj-save"><label>' + T('Save current work as', 'वर्तमान कार्य इस नाम से सहेजें') + '</label>' +
          '<div class="prj-row"><input id="prjName" class="big-input" value="' + esc(defName) + '"><button class="tb-btn primary" id="prjSave">' + T('Save', 'सहेजें') + '</button></div></div>' : '') +
        '<div class="prj-sub">' + T('Saved projects', 'सहेजे गए प्रोजेक्ट') + '</div>' +
        '<div id="prjList" class="prj-list">…</div>' +
        '<div class="prj-foot" id="prjFolder"></div>' +
      '</div>';
    document.body.appendChild(d);
    $('prjX').onclick = close;
    d.addEventListener('mousedown', function (e) { if (e.target === d) close(); });
    if (hasData) $('prjSave').onclick = save;
    list();
  }

  function list() {
    api('/api/project/list').then(function (r) {
      if (!$('prjList')) return;                           // dialog was closed meanwhile
      $('prjFolder').textContent = T('Folder: ', 'फ़ोल्डर: ') + r.folder + '  —  ' + T('copy .stellura files to a pen drive to share', 'साझा करने के लिए .stellura फ़ाइलें पेन ड्राइव में कॉपी करें');
      $('prjList').innerHTML = r.projects.length ? r.projects.map(function (p) {
        return '<div class="prj-item"><div class="prj-n"><b>' + esc(p.name) + '</b><span>' + (p.rows != null ? Number(p.rows).toLocaleString('en-IN') + ' ' + T('rows', 'पंक्तियाँ') + ' × ' + p.cols + ' · ' : '') + fmtSize(p.size) + (p.saved ? ' · ' + esc(p.saved.replace('T', ' ')) : '') + '</span></div>' +
          '<button class="tb-btn primary" data-open="' + esc(p.name) + '">' + T('Open', 'खोलें') + '</button>' +
          '<button class="tb-btn danger" data-del="' + esc(p.name) + '">' + T('Delete', 'हटाएँ') + '</button></div>';
      }).join('') : '<div class="big-note">' + T('No projects yet.', 'अभी कोई प्रोजेक्ट नहीं।') + '</div>';
      $('prjList').querySelectorAll('[data-open]').forEach(function (b) { b.onclick = function () { openProject(b.dataset.open); }; });
      $('prjList').querySelectorAll('[data-del]').forEach(function (b) {
        b.onclick = function () {
          if (b.dataset.sure) { api('/api/project/delete', { name: b.dataset.del }).then(list); return; }
          b.dataset.sure = '1'; b.textContent = T('Click again to delete', 'हटाने के लिए फिर क्लिक करें');
        };
      });
    }).catch(function (e) { if ($('prjList')) $('prjList').textContent = e.message; });
  }

  function save() {
    var btn = $('prjSave'), nameBox = $('prjName');
    var name = ((nameBox && nameBox.value) || '').trim();
    if (!name) { toast(T('Enter a project name', 'प्रोजेक्ट का नाम लिखें'), 'error'); return; }
    var big = window.BIG && BIG.active;
    var body = big ? { name: name, state: { documentName: name, largeFile: true }, dataset: BIG.ds }
                   : { name: name, state: collectState(), headers: headers, data: rawData };
    btn.disabled = true;
    var done = function () { btn.disabled = false; };         // the button object stays valid even if the dialog is closed
    api('/api/project/save', body).then(function (r) {
      toast(T('Saved: ', 'सहेजा गया: ') + r.path, 'success');
      var st = $('saveStateText'); if (st) st.textContent = T('Project saved', 'प्रोजेक्ट सहेजा गया');
      if (window._pvLog) _pvLog({ actor: 'user', action: 'SAVE', method: 'project', target: 'file', inputs: [], output: 'file', label: 'Project saved: ' + name, labelHi: 'प्रोजेक्ट सहेजा: ' + name });
      done(); list();
    }).catch(function (e) { toast(e.message, 'error'); done(); });
  }

  function openProject(name) {
    api('/api/project/open', { name: name }).then(function (r) {
      close();
      if (r.data) {                                        // normal editor
        if (window.BIG && BIG.active) BIG.exit();
        if (window.STL) STL._quiet = true;
        try { importData([r.dataset.headers].concat(r.data)); } finally { if (window.STL) STL._quiet = false; }
        applyState(r.state);
        try { if (window.DD) { DD.provenance = r.state.ddProvenance || DD.provenance; } } catch (e) {}
      } else {                                             // too big for the editor -> Large File mode
        BIG.file = null; BIG.sheets = [];
        BIG.attach(r.dataset);
      }
      toast(T('Opened: ', 'खोला गया: ') + name, 'success');
    }).catch(function (e) { toast(e.message, 'error'); });
  }

  window.PRJ = { openDialog: openDialog, collectState: collectState, applyState: applyState };
})();
