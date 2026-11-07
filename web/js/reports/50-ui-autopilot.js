// =====================================================================
//  REPORT AUTOPILOT dialog  /  रिपोर्ट ऑटोपायलट
//  Teach once (last month's filled proforma + last month's data), then every month:
//  pick this month's data -> preview -> download the same proforma, filled.
//  Also hosts the small helpers shared by the other report tools.
// =====================================================================
(function () {
  'use strict';
  var STL = window.STL = window.STL || {}, U = STL.ui, A = STL.auto;
  var T = U.T, esc = U.esc, busy = U.busy, overlay = U.overlay, fmt = U.fmt;
  function $(id) { return document.getElementById(id); }

  // ---------------------------------------------------------------- helpers shared with 51 / 52
  var H = STL.rep = {};
  H.pickFile = function (accept) {
    return new Promise(function (res) {
      var i = document.createElement('input'); i.type = 'file'; i.accept = accept || ''; i.style.display = 'none';
      i.onchange = function () { res(i.files[0] || null); i.remove(); };
      document.body.appendChild(i); i.click();
    });
  };
  H.editorData = function () { return { name: (($('documentName') || {}).textContent || 'Data').trim(), headers: headers.slice(), rows: rawData }; };
  H.loadDataset = function (file) {                           // read + tidy the obvious problems (titles, totals, repeated headers)
    return U.readGrid(file).then(function (r) {
      var e = { name: file.name, sheets: r.sheets, sheet: r.sheet };
      U.cleanFile(e, r.grid);
      return e;
    });
  };
  H.needData = function () {
    if (window.BIG && BIG.active) { toast(T('Use "Work on a copy" first: this tool works on the editor.', 'पहले "प्रति पर काम करें" उपयोग करें: यह औज़ार संपादक पर चलता है।'), 'info'); return false; }
    if (!U.hasData()) { toast(T('Open this month\'s file first.', 'पहले इस माह की फ़ाइल खोलें।'), 'info'); return false; }
    return true;
  };
  H.download = function (blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  };
  H.lines = function (obj) {                                    // sentence pair -> text in the language the user reads
    var l = (typeof uiLanguage !== 'undefined') ? uiLanguage : 'en';
    return l === 'hi' ? obj.hi : (l === 'bi' ? obj.en + '\n' + obj.hi : obj.en);
  };
  H.pal = function (n) {                                         // calm, colour-blind-safe palette that works on light and dark
    var c = ['#6d5bd0', '#14a38b', '#e8913a', '#d6456b', '#3b82c4', '#8f9aa8', '#9a6fd0', '#4aa3a2'];
    return c[n % c.length];
  };
  function sign(n) { return n > 0 ? '+' : (n < 0 ? '−' : ''); }
  H.delta = function (d, dec) { if (d === null || d === undefined || d === 0) return '<span class="rp-delta flat">–</span>'; var a = Math.abs(d); return '<span class="rp-delta ' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '▲ ' : '▼ ') + (dec ? a.toFixed(dec) : STL.change.indian(a)) + '</span>'; };
  H.toBlob = function (dataUrl) { var p = dataUrl.split(','), m = /:(.*?);/.exec(p[0])[1], b = atob(p[1]), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new Blob([u], { type: m }); };
  H.toDataUrl = function (file) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsDataURL(file); }); };

  // ---------------------------------------------------------------- state and recipes
  var RKEY = 'stellura_autopilot';
  function recipes() { try { return JSON.parse(localStorage.getItem(RKEY) || '[]'); } catch (e) { return []; } }
  function saveRecipes(l) { try { localStorage.setItem(RKEY, JSON.stringify(l)); return true; } catch (e) { return false; } }
  var AP = null;
  function fresh() { return { tmplFile: null, tmpl: null, sheetName: null, learnSrc: 'file', learnData: null, rules: null, thisSrc: 'editor', thisData: null, result: null, recipeName: '', sheets: [], fromRecipe: null }; }

  STL.openAutopilot = function () { AP = fresh(); if (U.hasData()) AP.hasEditor = true; render(); };

  // ---------------------------------------------------------------- learning
  function readTemplate(file) {
    var fd = new FormData(); fd.append('file', file);
    return fetch('/api/autopilot/read', { method: 'POST', body: fd }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Could not read the file'); return j; }); });
  }
  function learn() {
    var sh = AP.tmplInfo.sheets.filter(function (s) { return s.name === AP.sheetName; })[0] || AP.tmplInfo.sheets[0];
    AP.tmpl = { rows: sh.rows, formulas: sh.formulas, truncated: sh.truncated };
    var data = AP.learnSrc === 'editor' ? H.editorData() : AP.learnData;
    busy(T('Working out the calculations…', 'गणनाएँ समझी जा रही हैं…'));
    setTimeout(function () {
      try { AP.rules = A.learn(AP.tmpl, { headers: data.headers, rows: data.rows }); AP.learnedFrom = data.name; }
      catch (e) { AP.rules = null; toast(e.message, 'error'); }
      busy(null); render();
    }, 40);
  }

  // ---------------------------------------------------------------- render
  function ruleOptions(ci, idx) {
    var opts = (ci.alts || []).map(function (a, i) { return '<option value="' + i + '"' + (a.rule === ci.rule || JSON.stringify(a.rule) === JSON.stringify(ci.rule) ? ' selected' : '') + '>' + esc(T(a.desc.en, a.desc.hi)) + ' (' + a.matched + '/' + ci.of + ')</option>'; }).join('');
    if (ci.rule && ci.rule.type === 'derived') opts = '<option value="d" selected>' + esc(T(ci.desc.en, ci.desc.hi)) + '</option>';
    return opts + '<option value="skip"' + (!ci.rule ? ' selected' : '') + '>' + T('(do not fill this column)', '(इस कॉलम को न भरें)') + '</option>';
  }
  function badge(ci) {
    if (!ci.rule) return '<span class="rp-badge low">' + T('not learned', 'नहीं सीखा') + '</span>';
    var m = { high: [T('verified', 'सत्यापित'), 'high'], check: [T('please check', 'जाँचें'), 'check'], low: [T('unsure', 'अनिश्चित'), 'low'] }[ci.confidence || 'high'];
    return '<span class="rp-badge ' + m[1] + '" title="' + ci.matched + ' / ' + ci.of + '">' + m[0] + ' · ' + ci.matched + '/' + ci.of + '</span>';
  }
  function warnText(w) {
    switch (w.kind) {
      case 'new-groups': return T('Not in the proforma, so not counted: ', 'प्रोफ़ार्मा में नहीं हैं, इसलिए नहीं गिने: ') + w.groups.slice(0, 8).map(function (g) { return esc(g.name) + ' (' + g.rows + ')'; }).join(', ') + (w.count > 8 ? ' … +' + (w.count - 8) : '') + ' — ' + fmt(w.rows) + T(' rows', ' पंक्तियाँ');
      case 'missing-groups': return T('In the proforma but no rows this month (shown as 0): ', 'प्रोफ़ार्मा में हैं पर इस माह कोई पंक्ति नहीं (0 दिखाया): ') + w.groups.map(esc).join(', ');
      case 'blank-group': return fmt(w.rows) + T(' rows have no value in the grouping column and are not counted.', ' पंक्तियों में समूह कॉलम खाली है, उन्हें नहीं गिना।');
      case 'rule-skipped': return T('Column "', 'कॉलम "') + esc(w.header) + T('" was not filled: this month\'s file has no column like "', '" नहीं भरा: इस माह की फ़ाइल में "') + esc(w.name || '') + T('".', '" जैसा कॉलम नहीं है।');
      case 'not-learned': return T('Column "', 'कॉलम "') + esc(w.header) + T('" was not filled (the calculation could not be worked out).', '" नहीं भरा (गणना समझ नहीं आई)।');
      case 'duplicate-label': return T('"', '"') + esc(w.label) + T('" appears twice in the proforma; only the first is filled.', '" प्रोफ़ार्मा में दो बार है; केवल पहला भरा गया।');
    }
    return '';
  }

  function render() {
    var rec = recipes(), r = AP.rules, res = AP.result;
    var html = '<div class="prj-h"><b>' + T('Report Autopilot', 'रिपोर्ट ऑटोपायलट') + '</b><button id="apX" aria-label="close">×</button></div>' +
      '<div class="big-note">' + T('Teach it once with last month\'s filled report. Every month after that: pick the new data, check the preview, download the finished report in your own format.', 'एक बार पिछले माह की भरी रिपोर्ट से सिखाएँ। उसके बाद हर माह: नया डेटा चुनें, पूर्वावलोकन देखें, अपने ही प्रारूप में तैयार रिपोर्ट डाउनलोड करें।') + '</div>';

    if (rec.length && !r) {
      html += '<div class="prj-sub">' + T('Your recipes', 'आपकी रेसिपी') + '</div>' + rec.map(function (x, i) {
        return '<div class="prj-item"><div class="prj-n"><b>' + esc(x.name) + '</b><span>' + esc(x.filename || '') + ' · ' + new Date(x.ts).toLocaleDateString() + '</span></div><button class="tb-btn primary" data-use="' + i + '">' + T('Use', 'उपयोग') + '</button><button class="tb-btn danger" data-del="' + i + '">×</button></div>';
      }).join('');
    }

    if (!r || !r.ok) {
      // ---- step 1: teach
      html += '<div class="rp-card"><div class="rp-step">1</div><div class="rp-body"><b>' + T('Teach it (once)', 'सिखाएँ (एक बार)') + '</b>' +
        '<div class="rp-pick"><button class="tb-btn" id="apTmpl">' + T('Last month\'s filled report (Excel)…', 'पिछले माह की भरी रिपोर्ट (एक्सेल)…') + '</button><span>' + (AP.tmplFile ? '✓ ' + esc(AP.tmplFile.name) : '') + '</span></div>' +
        (AP.sheets.length > 1 ? '<div class="rp-pick"><label>' + T('Sheet', 'शीट') + '</label><select id="apSheet" class="big-select">' + AP.sheets.map(function (s) { return '<option' + (s === AP.sheetName ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></div>' : '') +
        (AP.tmplInfo && AP.tmplInfo.hasChartsOrPictures ? '<div class="big-err">' + T('This file has charts or pictures. Filling keeps tables and formatting, but charts and pictures can be lost. Keep the original for those.', 'इस फ़ाइल में चार्ट या चित्र हैं। भरने पर तालिकाएँ और फ़ॉर्मैटिंग रहती हैं, पर चार्ट/चित्र खो सकते हैं। उनके लिए मूल प्रति रखें।') + '</div>' : '') +
        '<div class="rp-pick"><button class="tb-btn" id="apData">' + T('The data used for that report…', 'उस रिपोर्ट में प्रयुक्त डेटा…') + '</button><span>' + (AP.learnData ? '✓ ' + esc(AP.learnData.name) + ' (' + fmt(AP.learnData.rows.length) + ')' : '') + '</span>' +
        (AP.hasEditor ? '<label class="rp-inline"><input type="checkbox" id="apUseEditor"' + (AP.learnSrc === 'editor' ? ' checked' : '') + '> ' + T('it is the file open now', 'वही फ़ाइल अभी खुली है') + '</label>' : '') + '</div>' +
        (r && !r.ok ? '<div class="big-err">' + (r.error === 'labels' ? T('I could not find the row names (for example the police stations) of the report inside this data. Check that it is the data of that report.', 'इस डेटा में रिपोर्ट के पंक्ति-नाम (जैसे थाने) नहीं मिले। जाँचें कि यह उसी रिपोर्ट का डेटा है।') : T('No calculation could be worked out.', 'कोई गणना समझ नहीं आई।')) + '</div>' : '') +
        '<div class="prj-row" style="margin-top:10px"><button class="tb-btn primary" id="apLearn"' + ((AP.tmplFile && (AP.learnData || AP.learnSrc === 'editor')) ? '' : ' disabled') + '>' + T('Learn', 'सीखें') + '</button></div></div></div>';
    } else {
      // ---- learned: rules
      html += '<div class="rp-card"><div class="rp-step ok">✓</div><div class="rp-body"><b>' + T('What I learned', 'मैंने क्या सीखा') + '</b>' +
        '<div class="big-note">' + T('Rows are the ', 'पंक्तियाँ हैं: ') + '<b>' + esc(r.group.name) + '</b> (' + r.rows.length + '). ' + T('Each rule below reproduced last month\'s numbers; the counts show how many cells matched.', 'नीचे हर नियम ने पिछले माह की संख्याएँ दोहराईं; गिनती बताती है कितनी सेल मिलीं।') + '</div>' +
        '<div class="big-tbl-wrap" style="max-height:260px"><table class="big-tbl"><tr><th>' + T('Column of the report', 'रिपोर्ट का कॉलम') + '</th><th>' + T('How it is calculated', 'कैसे गणना होती है') + '</th><th></th></tr>' +
        r.cols.filter(function (c) { return !c.serial; }).map(function (ci, i) {
          var idx = r.cols.indexOf(ci);
          return '<tr><td><b>' + esc(ci.header) + '</b></td><td>' + (ci.rule && ci.rule.type === 'derived' ? esc(T(ci.desc.en, ci.desc.hi)) : '<select class="big-select" data-col="' + idx + '">' + ruleOptions(ci, idx) + '</select>') + '</td><td>' + badge(ci) + '</td></tr>';
        }).join('') + '</table></div>' +
        '<div class="prj-row" style="margin-top:8px"><input id="apName" class="big-input" placeholder="' + T('Name this recipe, e.g. Monthly progress report', 'रेसिपी का नाम, जैसे: मासिक प्रगति रिपोर्ट') + '" value="' + esc(AP.recipeName || '') + '"><button class="tb-btn" id="apSave">' + T('Save recipe', 'रेसिपी सहेजें') + '</button><button class="tb-btn" id="apAgain">' + T('Start over', 'फिर से') + '</button></div></div></div>';
      // ---- step 2: fill
      html += '<div class="rp-card"><div class="rp-step">2</div><div class="rp-body"><b>' + T('Fill this month', 'इस माह की रिपोर्ट भरें') + '</b>' +
        '<div class="rp-pick">' + (AP.hasEditor ? '<label class="rp-inline"><input type="radio" name="apThis" value="editor"' + (AP.thisSrc === 'editor' ? ' checked' : '') + '> ' + T('The data open now: ', 'अभी खुला डेटा: ') + '<b>' + esc(H.editorData().name) + '</b> (' + fmt(rawData.length) + ')</label>' : '') +
        '<label class="rp-inline"><input type="radio" name="apThis" value="file"' + (AP.thisSrc === 'file' ? ' checked' : '') + '> ' + T('Another file…', 'दूसरी फ़ाइल…') + '</label><span>' + (AP.thisData ? '✓ ' + esc(AP.thisData.name) + ' (' + fmt(AP.thisData.rows.length) + ')' : '') + '</span></div>' +
        '<div class="prj-row" style="margin-top:8px"><button class="tb-btn primary" id="apFill">' + T('Fill the report', 'रिपोर्ट भरें') + '</button></div>';
      if (res && res.ok) {
        var map = {}; res.values.forEach(function (v) { map[v.r + '|' + v.c] = v; });
        var cols = r.cols.filter(function (c) { return c.rule; });
        html += '<div class="rp-kpis">' + [[T('Rows read', 'पढ़ी पंक्तियाँ'), fmt(res.rows)], [T('Cells filled', 'भरी सेल'), fmt(res.values.length)], [T('Warnings', 'चेतावनियाँ'), res.warnings.length]].map(function (k) { return '<div class="rp-kpi"><b>' + k[1] + '</b><span>' + k[0] + '</span></div>'; }).join('') + '</div>' +
          '<div class="big-tbl-wrap"><table class="big-tbl rp-prev"><tr><th>' + esc(r.group.name) + '</th>' + cols.map(function (c) { return '<th>' + esc(c.header) + '</th>'; }).join('') + '</tr>' +
          r.rows.concat(r.totalRow !== null ? [{ r: r.totalRow, label: T('Total', 'कुल') }] : []).map(function (x) {
            return '<tr' + (x.r === r.totalRow ? ' class="rp-total"' : '') + '><td>' + esc(x.label) + '</td>' + cols.map(function (c) { var v = map[x.r + '|' + c.c]; return '<td class="num">' + (v ? '<b>' + esc(v.value === '' ? '–' : v.value) + '</b> ' + H.delta(v.delta, c.dec) : '') + '</td>'; }).join('') + '</tr>';
          }).join('') + '</table></div>';
        if (res.warnings.length) html += '<div class="rp-warn">' + res.warnings.map(function (w) { return '<div>⚠ ' + warnText(w) + '</div>'; }).join('') + '</div>';
        if (res.summary.en.length) html += '<div class="prj-sub">' + T('Summary (written from the numbers above)', 'सार (ऊपर की संख्याओं से लिखा)') + '</div><div class="rp-sum" id="apSum">' + res.summary[(typeof uiLanguage !== 'undefined' && uiLanguage === 'hi') ? 'hi' : 'en'].map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') + '</div>';
        html += '<div class="prj-row" style="margin-top:10px;flex-wrap:wrap"><label class="rp-inline"><input type="checkbox" id="apExtra" checked> ' + T('add comparison + summary sheets', 'तुलना + सार शीट जोड़ें') + '</label><button class="tb-btn primary" id="apDownload">⬇ ' + T('Download the filled report (Excel)', 'भरी रिपोर्ट डाउनलोड करें (एक्सेल)') + '</button></div>';
      }
      html += '</div></div>';
    }
    var o = overlay('apDialog', html, true);
    $('apX').onclick = function () { o.remove(); };
    wire(o);
  }

  function wire(o) {
    o.querySelectorAll('[data-use]').forEach(function (b) { b.onclick = function () { useRecipe(recipes()[+b.dataset.use]); }; });
    o.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () { var l = recipes(); l.splice(+b.dataset.del, 1); saveRecipes(l); render(); }; });
    var q = function (id) { return $(id); };
    if (q('apTmpl')) q('apTmpl').onclick = function () {
      H.pickFile('.xlsx,.xlsm').then(function (f) {
        if (!f) return; busy(T('Reading the report…', 'रिपोर्ट पढ़ी जा रही है…'));
        readTemplate(f).then(function (info) { AP.tmplFile = f; AP.tmplInfo = info; AP.sheets = info.sheets.map(function (s) { return s.name; }); AP.sheetName = info.active; AP.rules = null; }).catch(function (e) { toast(e.message, 'error'); }).then(function () { busy(null); render(); });
      });
    };
    if (q('apSheet')) q('apSheet').onchange = function () { AP.sheetName = this.value; AP.rules = null; render(); };
    if (q('apData')) q('apData').onclick = function () {
      H.pickFile('.csv,.tsv,.txt,.xlsx,.xls').then(function (f) {
        if (!f) return; busy(T('Reading the data…', 'डेटा पढ़ा जा रहा है…'));
        H.loadDataset(f).then(function (d) { AP.learnData = d; AP.learnSrc = 'file'; }).catch(function (e) { toast(e.message, 'error'); }).then(function () { busy(null); render(); });
      });
    };
    if (q('apUseEditor')) q('apUseEditor').onchange = function () { AP.learnSrc = this.checked ? 'editor' : 'file'; render(); };
    if (q('apLearn')) q('apLearn').onclick = learn;
    if (q('apAgain')) q('apAgain').onclick = function () { var keep = AP.hasEditor; AP = fresh(); AP.hasEditor = keep; render(); };
    o.querySelectorAll('select[data-col]').forEach(function (sel) {
      sel.onchange = function () {
        var ci = AP.rules.cols[+sel.dataset.col];
        if (sel.value === 'skip') { ci.rule = null; ci.desc = null; ci.matched = 0; }
        else { var a = ci.alts[+sel.value]; ci.rule = a.rule; ci.desc = a.desc; ci.matched = a.matched; ci.confidence = 'high'; }
        AP.result = null; render();
      };
    });
    if (q('apName')) q('apName').oninput = function () { AP.recipeName = this.value; };
    if (q('apSave')) q('apSave').onclick = saveRecipe;
    o.querySelectorAll('input[name="apThis"]').forEach(function (rd) {
      rd.onchange = function () {
        AP.thisSrc = rd.value;
        if (rd.value === 'file' && !AP.thisData) H.pickFile('.csv,.tsv,.txt,.xlsx,.xls').then(function (f) {
          if (!f) { AP.thisSrc = AP.hasEditor ? 'editor' : 'file'; render(); return; }
          busy(T('Reading the data…', 'डेटा पढ़ा जा रहा है…')); H.loadDataset(f).then(function (d) { AP.thisData = d; }).catch(function (e) { toast(e.message, 'error'); }).then(function () { busy(null); render(); });
        }); else render();
      };
    });
    if (q('apFill')) q('apFill').onclick = fill;
    if (q('apDownload')) q('apDownload').onclick = download;
  }

  function fill() {
    var data = AP.thisSrc === 'editor' && AP.hasEditor ? H.editorData() : AP.thisData;
    if (!data) { toast(T('Choose this month\'s data', 'इस माह का डेटा चुनें'), 'info'); return; }
    busy(T('Filling the report…', 'रिपोर्ट भरी जा रही है…'));
    setTimeout(function () {
      try { AP.result = A.apply(AP.rules, { headers: data.headers, rows: data.rows }, AP.tmpl); AP.result.dataName = data.name; if (!AP.result.ok) toast(T('This month\'s file has no column like "', 'इस माह की फ़ाइल में "') + AP.result.warnings[0].name + T('"', '" जैसा कॉलम नहीं है'), 'error'); }
      catch (e) { toast(e.message, 'error'); }
      busy(null); render();
    }, 40);
  }

  function download() {
    var res = AP.result, file = AP.tmplFile || AP.recipeFile;
    var go = function (f) {
      var fd = new FormData(); fd.append('file', f);
      var extra = $('apExtra') && $('apExtra').checked;
      var payload = { sheet: AP.sheetName, filename: (f.name || 'report').replace(/\.[^.]+$/, ''), language: (typeof uiLanguage !== 'undefined' && uiLanguage === 'hi') ? 'hi' : ((typeof uiLanguage !== 'undefined' && uiLanguage === 'bi') ? 'both' : 'en'),
        updates: res.values.map(function (v) { return { r: v.r, c: v.c, value: v.value }; }) };
      if (extra) {
        payload.comparison = { headers: [T('Row', 'पंक्ति'), T('Column', 'कॉलम'), T('Last month', 'पिछला माह'), T('This month', 'इस माह'), T('Change', 'बदलाव')], rows: res.values.filter(function (v) { return !v.total; }).map(function (v) { return [v.group, v.column, v.old, v.value, v.delta]; }) };
        payload.summary = res.summary;
      }
      fd.append('payload', JSON.stringify(payload)); busy(T('Preparing the Excel file…', 'एक्सेल फ़ाइल बन रही है…'));
      fetch('/api/autopilot/fill', { method: 'POST', body: fd }).then(function (r) { if (!r.ok) return r.json().then(function (j) { throw new Error(j.error); }); var sk = r.headers.get('X-Cells-Skipped'); return r.blob().then(function (b) { return { b: b, sk: sk }; }); })
        .then(function (x) {
          H.download(x.b, payload.filename + '_' + T('filled', 'भरी') + '.xlsx');
          toast(T('Downloaded. ', 'डाउनलोड हो गई। ') + (x.sk ? T('These cells were left as they are (formulas or merged): ', 'ये सेल जैसी थीं वैसी छोड़ीं (सूत्र/मर्ज): ') + x.sk : ''), x.sk ? 'warning' : 'success');
          STL.logStep('autopilot', { en: 'Report filled by Autopilot', hi: 'ऑटोपायलट से रिपोर्ट भरी' }, { en: payload.filename + ' ← ' + (res.dataName || ''), hi: payload.filename + ' ← ' + (res.dataName || '') });
        }).catch(function (e) { toast(e.message, 'error'); }).then(function () { busy(null); });
    };
    if (file) go(file); else toast(T('Choose the proforma file again (it was too large to store with the recipe).', 'प्रोफ़ार्मा फ़ाइल फिर चुनें (रेसिपी के साथ सहेजने के लिए बहुत बड़ी थी)।'), 'info');
  }

  function saveRecipe() {
    var name = (AP.recipeName || '').trim(); if (!name) { toast(T('Name the recipe first', 'पहले रेसिपी का नाम लिखें'), 'error'); return; }
    var rules = JSON.parse(JSON.stringify(AP.rules)); rules.cols.forEach(function (c) { if (c.alts) c.alts = c.alts.slice(0, 5); });
    var rows = AP.tmpl.rows.slice(0, 400).map(function (r) { return r.slice(0, 60); });
    var save = function (b64) {
      var list = recipes(), item = { id: Date.now(), name: name, ts: Date.now(), filename: AP.tmplFile ? AP.tmplFile.name : '', sheet: AP.sheetName, rules: rules, tmplRows: rows, tmplFormulas: AP.tmpl.formulas || [], fileB64: b64 || null };
      list = list.filter(function (x) { return x.name !== name; }); list.unshift(item);
      if (saveRecipes(list)) toast(T('Recipe saved: ', 'रेसिपी सहेजी: ') + name + (b64 ? '' : T(' (without the proforma file: you will choose it again next time)', ' (प्रोफ़ार्मा फ़ाइल के बिना: अगली बार फिर चुननी होगी)')), 'success');
      else { item.fileB64 = null; if (saveRecipes(list)) toast(T('Recipe saved without the file (browser storage is nearly full).', 'रेसिपी फ़ाइल के बिना सहेजी (ब्राउज़र भंडार लगभग भरा है)।'), 'warning'); else toast(T('Browser storage is full. Save a project instead.', 'ब्राउज़र भंडार भरा है। इसके बजाय प्रोजेक्ट सहेजें।'), 'error'); }
      render();
    };
    if (AP.tmplFile && AP.tmplFile.size <= 900 * 1024) H.toDataUrl(AP.tmplFile).then(save); else save(null);
  }

  function useRecipe(x) {
    AP = fresh(); AP.hasEditor = U.hasData(); AP.rules = x.rules; AP.sheetName = x.sheet; AP.tmpl = { rows: x.tmplRows, formulas: x.tmplFormulas };
    AP.recipeName = x.name; AP.fromRecipe = x.name; AP.tmplInfo = { sheets: [{ name: x.sheet }] };
    if (x.fileB64) { var blob = H.toBlob(x.fileB64); try { AP.recipeFile = new File([blob], x.filename || 'report.xlsx', { type: blob.type }); } catch (e) { AP.recipeFile = blob; AP.recipeFile.name = x.filename; } }
    render();
  }
})();
