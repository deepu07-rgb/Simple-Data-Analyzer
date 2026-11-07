// =====================================================================
//  LETTERS FROM DATA  /  डेटा से पत्र      and      NAME MATCH  /  नाम मिलान
//  plus the Home tiles and Ctrl+K entries for all Phase 3 tools.
// =====================================================================
(function () {
  'use strict';
  var STL = window.STL = window.STL || {}, U = STL.ui, H = STL.rep, M = STL.merge, N = STL.names;
  var T = U.T, esc = U.esc, busy = U.busy, overlay = U.overlay, fmt = U.fmt;
  function $(id) { return document.getElementById(id); }

  // find the column that means "name", "father's name" ... in this file (same rules as Merge Anything)
  function colFor(heads, label, min) {
    var best = -1, bs = 0; heads.forEach(function (h, i) { var sc = M.score(h, label).score; if (sc > bs) { bs = sc; best = i; } });
    return bs >= (min || 0.9) ? best : -1;
  }

  // =================================================================== LETTERS
  function today() { var d = new Date(); return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear(); }
  function indianNum(n) { return STL.change.indian(n); }
  function applyFilter(v, f) {
    switch ((f || '').toLowerCase()) {
      case 'inr': var n = STL.fix.util.parseNumber(v); return n === null ? v : '₹' + indianNum(n);
      case 'num': var m = STL.fix.util.parseNumber(v); return m === null ? v : indianNum(m);
      case 'date': var ms = STL.pend.parseDate(v, true); if (ms === null) return v; var d = new Date(ms); return ('0' + d.getUTCDate()).slice(-2) + '/' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '/' + d.getUTCFullYear();
      case 'upper': return String(v).toUpperCase();
      case 'lower': return String(v).toLowerCase();
    }
    return v;
  }
  // {{column}} / {{column|inr}} / {{today}} / {{row}} / {{count}}
  function renderText(text, row, ctx) {
    return String(text == null ? '' : text).replace(/\{\{\s*([^{}|]+?)\s*(?:\|\s*([a-z]+)\s*)?\}\}/gi, function (m, name, f) {
      var key = M.normalize(name), v;
      if (key === 'today' || key === 'आज') v = today();
      else if (key === 'count' && ctx.count !== undefined) v = String(ctx.count);
      else if (key === 'row' && row) v = String(ctx.index + 1);
      else {
        var i = ctx.keys.indexOf(key);
        if (i < 0 || !row) { ctx.missing[name] = 1; return m; }
        v = row[i] == null ? '' : String(row[i]);
        if (v.trim() === '') ctx.blank++;
      }
      return applyFilter(v, f);
    });
  }
  function ctxFor(extra) { var c = { keys: headers.map(function (h) { return M.normalize(h); }), missing: {}, blank: 0, index: 0 }; for (var k in (extra || {})) c[k] = extra[k]; return c; }

  function presets(lang, cc) {
    var P = STL.pend && 0, ph = function (i) { return i >= 0 ? '{{' + headers[i] + '}}' : ''; };
    var name = colFor(headers, 'name'), addr = colFor(headers, 'address'), village = colFor(headers, 'village'), cas = colFor(headers, 'case no');
    var toLines = [ph(name), ph(addr >= 0 ? addr : village)].filter(Boolean).join('\n');
    var caseHi = cas >= 0 ? ' संख्या ' + ph(cas) : '', caseEn = cas >= 0 ? ' no. ' + ph(cas) : '';
    var hi = lang === 'hi';
    return {
      reminder: { mode: 'each', to: toLines, subject: hi ? 'विषय: स्मरण-पत्र' + (cas >= 0 ? ' — प्रकरण संख्या ' + ph(cas) : '') : 'Subject: Reminder' + (cas >= 0 ? ' — case no. ' + ph(cas) : ''),
        body: hi ? 'महोदय/महोदया,\n\nआपको सूचित किया जाता है कि आपसे संबंधित प्रकरण' + caseHi + ' अभी लंबित है। पूर्व में सूचित किए जाने के बावजूद अपेक्षित कार्यवाही पूर्ण नहीं हुई है।\n\nअतः निर्देशित किया जाता है कि इस पत्र की प्राप्ति के 7 दिन के भीतर कार्यालय में उपस्थित होकर आवश्यक कार्यवाही पूर्ण करें।'
          : 'Sir/Madam,\n\nThis is to inform you that the matter' + caseEn + ' concerning you is still pending. Despite earlier intimation, the required action has not been completed.\n\nYou are therefore directed to appear at this office and complete the required action within 7 days of receipt of this letter.', closing: hi ? 'भवदीय' : 'Yours faithfully' },
      showcause: { mode: 'each', to: toLines, subject: hi ? 'विषय: कारण बताओ नोटिस' : 'Subject: Show-cause notice',
        body: hi ? 'महोदय/महोदया,\n\nआपके संबंध में प्राप्त जानकारी' + (cas >= 0 ? ' (प्रकरण संख्या ' + ph(cas) + ')' : '') + ' के विषय में आपसे स्पष्टीकरण अपेक्षित है।\n\nअतः आपको निर्देशित किया जाता है कि इस नोटिस की प्राप्ति के 7 दिन के भीतर लिखित में कारण प्रस्तुत करें कि क्यों न आपके विरुद्ध नियमानुसार कार्यवाही की जाए। निर्धारित अवधि में उत्तर प्राप्त न होने पर यह माना जाएगा कि आपको कुछ नहीं कहना है और नियमानुसार कार्यवाही की जाएगी।'
          : 'Sir/Madam,\n\nAn explanation is required from you in respect of the information received' + (cas >= 0 ? ' (case no. ' + ph(cas) + ')' : '') + '.\n\nYou are directed to submit in writing, within 7 days of receipt of this notice, the reasons why action should not be taken against you as per rules. If no reply is received in the stipulated period, it will be presumed that you have nothing to say and action will be taken as per rules.', closing: hi ? 'भवदीय' : 'Yours faithfully' },
      cover: { mode: 'cover', to: hi ? 'सेवा में,\nसंबंधित अधिकारी' : 'To,\nThe Concerned Officer', subject: hi ? 'विषय: संलग्न सूची के संबंध में' : 'Subject: Enclosed list',
        body: hi ? 'महोदय,\n\nउपर्युक्त विषयान्तर्गत निवेदन है कि {{count}} प्रविष्टियों की सूची दिनांक {{today}} की स्थिति में संलग्न है।\n\nकृपया अग्रिम कार्यवाही हेतु अवलोकन करें।' : 'Sir,\n\nIt is submitted that the list of {{count}} entries as on {{today}} is enclosed.\n\nKindly examine it for further action.', closing: hi ? 'भवदीय' : 'Yours faithfully' },
      blank: { mode: 'each', to: toLines, subject: '', body: '', closing: hi ? 'भवदीय' : 'Yours faithfully' }
    };
  }

  STL.openLetters = function () {
    if (!H.needData()) return;
    var prof = (typeof userProfile !== 'undefined' && userProfile) || {};
    var LT = { lang: (typeof uiLanguage !== 'undefined' && uiLanguage === 'hi') ? 'hi' : 'en', preset: 'reminder', mode: 'each', annex: headers.slice(0, Math.min(6, headers.length)).map(function (_, i) { return i; }), f: { office: prof.org || '', officeSub: '', fileNo: '', date: today(), to: '', subject: '', body: '', closing: '', signName: prof.name || '', signDesig: prof.desig || '', signOffice: prof.org || '', copyTo: '' } };
    function usePreset(key) { var p = presets(LT.lang, null)[key]; LT.preset = key; LT.mode = p.mode; ['to', 'subject', 'body', 'closing'].forEach(function (k) { LT.f[k] = p[k]; }); }
    usePreset('reminder');
    var last = null;
    function rows() { var idx = (typeof getDisplayData === 'function') ? getDisplayData() : rawData.map(function (_, i) { return i; }); return idx.map(function (i) { return rawData[i]; }); }
    function build() {
      var f = LT.f, out = [], ctxMissing = {}, blank = 0;
      var make = function (row, i, count) {
        var ctx = ctxFor({ index: i, count: count }), r = function (t) { return renderText(t, row, ctx); };
        for (var k in ctx.missing) ctxMissing[k] = 1; blank += ctx.blank;
        return { office: f.office, officeSub: f.officeSub, fileNo: r(f.fileNo), date: f.date, to: r(f.to), subject: r(f.subject), body: r(f.body), closing: f.closing, signName: f.signName, signDesig: f.signDesig, signOffice: f.signOffice, copyTo: r(f.copyTo) };
      };
      var rs = rows(), annexure = null;
      if (LT.mode === 'each') { out = rs.slice(0, 2000).map(function (row, i) { return make(row, i, rs.length); }); }
      else { out = [make(null, 0, rs.length)]; annexure = { title: T('Annexure', 'संलग्नक'), headers: LT.annex.map(function (i) { return headers[i]; }), rows: rs.slice(0, 5000).map(function (r) { return LT.annex.map(function (i) { return r[i]; }); }) }; }
      return { letters: out, annexure: annexure, missing: Object.keys(ctxMissing), blank: blank, total: rs.length, capped: LT.mode === 'each' && rs.length > 2000 };
    }
    function paper(L) {
      var p = function (t) { return esc(t).replace(/\n/g, '<br>'); };
      return '<div class="lt-paper">' + (L.office ? '<div class="lt-office">' + p(L.office) + '</div>' : '') + (L.officeSub ? '<div class="lt-sub">' + p(L.officeSub) + '</div>' : '') +
        '<div class="lt-row"><span>' + p(L.fileNo) + '</span><span>' + p(L.date) + '</span></div>' + (L.to ? '<div class="lt-to">' + p(L.to) + '</div>' : '') + (L.subject ? '<div class="lt-subj">' + p(L.subject) + '</div>' : '') +
        String(L.body).split(/\n\s*\n/).map(function (c) { return c.trim() ? '<p>' + p(c.trim()) + '</p>' : ''; }).join('') +
        '<div class="lt-sign">' + p([L.closing, '', L.signName, L.signDesig, L.signOffice].filter(function (x, i) { return x !== undefined && (i !== 1 || (L.closing && (L.signName || L.signDesig || L.signOffice))); }).join('\n')) + '</div>' + (L.copyTo ? '<div class="lt-copy">' + p(L.copyTo) + '</div>' : '') + '</div>';
    }
    function field(id, label, val, rows) { return '<label class="rp-field wide"><span>' + label + '</span>' + (rows ? '<textarea id="' + id + '" class="big-sql" rows="' + rows + '" spellcheck="false">' + esc(val) + '</textarea>' : '<input id="' + id + '" class="big-input" value="' + esc(val) + '">') + '</label>'; }
    function render() {
      var b = build(), f = LT.f;
      var html = '<div class="prj-h"><b>' + T('Letters from data', 'डेटा से पत्र') + '</b><button id="ltX" aria-label="close">×</button></div>' +
        '<div class="big-note">' + T('Write the letter once with the column names in {{ }}. You get one letter for every row (or one covering letter with the list), in Word or as PDF. Please read the sample wording and adjust it to your office\'s style before use.', 'पत्र एक बार लिखें, कॉलम नाम {{ }} में रखें। हर पंक्ति के लिए एक पत्र (या सूची सहित एक अग्रेषण पत्र) वर्ड या पीडीएफ में मिलेगा। उपयोग से पहले नमूना भाषा पढ़कर अपने कार्यालय की शैली में बदलें।') + '</div>' +
        '<div class="lt-layout"><div class="lt-form">' +
        '<div class="rp-grid"><label class="rp-field"><span>' + T('Type of letter', 'पत्र का प्रकार') + '</span><select id="ltPreset" class="big-select">' + [['reminder', T('Reminder notice', 'स्मरण-पत्र')], ['showcause', T('Show-cause notice', 'कारण बताओ नोटिस')], ['cover', T('Covering letter with list', 'सूची सहित अग्रेषण पत्र')], ['blank', T('Blank letter', 'खाली पत्र')]].map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === LT.preset ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></label>' +
        '<label class="rp-field"><span>' + T('Language of the sample text', 'नमूना पाठ की भाषा') + '</span><select id="ltLang" class="big-select"><option value="hi"' + (LT.lang === 'hi' ? ' selected' : '') + '>हिंदी</option><option value="en"' + (LT.lang === 'en' ? ' selected' : '') + '>English</option></select></label>' +
        '<label class="rp-field"><span>' + T('Make', 'बनाएँ') + '</span><select id="ltMode" class="big-select"><option value="each"' + (LT.mode === 'each' ? ' selected' : '') + '>' + T('One letter for every row', 'हर पंक्ति का एक पत्र') + '</option><option value="cover"' + (LT.mode === 'cover' ? ' selected' : '') + '>' + T('One letter + list of the rows', 'एक पत्र + पंक्तियों की सूची') + '</option></select></label></div>' +
        '<div class="rp-grid">' + field('ltOffice', T('Office name', 'कार्यालय का नाम'), f.office) + field('ltFile', T('File / letter no.', 'पत्र क्रमांक'), f.fileNo) + field('ltDate', T('Date', 'दिनांक'), f.date) + '</div>' +
        field('ltTo', T('To (address)', 'सेवा में (पता)'), f.to, 3) + field('ltSubj', T('Subject', 'विषय'), f.subject) + field('ltBody', T('Letter', 'पत्र का पाठ'), f.body, 8) +
        '<div class="rp-grid">' + field('ltClose', T('Closing', 'समापन'), f.closing) + field('ltSName', T('Name', 'नाम'), f.signName) + field('ltSDesig', T('Designation', 'पदनाम'), f.signDesig) + '</div>' +
        '<div class="prj-sub">' + T('Click a column to put it in the letter', 'पत्र में डालने के लिए कॉलम पर क्लिक करें') + '</div><div class="lt-chips">' + headers.slice(0, 60).map(function (h, i) { return '<button class="lt-chip" data-ph="' + i + '">' + esc(h) + '</button>'; }).join('') + ['{{today}}', '{{count}}', '{{row}}'].map(function (x) { return '<button class="lt-chip alt" data-raw="' + x + '">' + x + '</button>'; }).join('') + '</div>' +
        '<div class="big-note">' + T('Tips: {{amount|inr}} shows ₹1,00,000 · {{date|date}} shows 03/04/2025 · {{name|upper}}', 'सुझाव: {{राशि|inr}} → ₹1,00,000 · {{तारीख|date}} → 03/04/2025 · {{name|upper}}') + '</div>' +
        (LT.mode === 'cover' ? '<div class="prj-sub">' + T('Columns in the list', 'सूची के कॉलम') + '</div><div class="rp-checks">' + headers.slice(0, 40).map(function (h, i) { return '<label class="rp-inline"><input type="checkbox" data-an="' + i + '"' + (LT.annex.indexOf(i) >= 0 ? ' checked' : '') + '> ' + esc(h) + '</label>'; }).join('') + '</div>' : '') +
        '</div><div class="lt-prev"><div class="prj-sub">' + T('Preview', 'पूर्वावलोकन') + ' — ' + (LT.mode === 'each' ? fmt(b.letters.length) + T(' letters', ' पत्र') : T('1 letter + list of ', '1 पत्र + सूची: ') + fmt(b.total)) + (T('', '')) + '</div>' + (b.letters[0] ? paper(b.letters[0]) : '') +
        (b.missing.length ? '<div class="big-err">' + T('These {{ }} names are not columns of this file: ', 'ये {{ }} नाम इस फ़ाइल के कॉलम नहीं हैं: ') + b.missing.map(esc).join(', ') + '</div>' : '') +
        (b.blank ? '<div class="rp-warn"><div>⚠ ' + fmt(b.blank) + T(' values used in the letters are empty.', ' मान जो पत्रों में आए, खाली हैं।') + '</div></div>' : '') +
        (b.capped ? '<div class="rp-warn"><div>⚠ ' + T('Only the first 2,000 rows are used. Filter the data to make the rest.', 'केवल पहली 2,000 पंक्तियाँ ली गईं। शेष के लिए डेटा फ़िल्टर करें।') + '</div></div>' : '') +
        '<div class="big-note">' + (LT.mode === 'each' ? T('Rows used: ', 'उपयोग हुई पंक्तियाँ: ') + fmt(b.total) + T(' (the rows you see now: filters apply).', ' (जो पंक्तियाँ अभी दिख रही हैं: फ़िल्टर लागू)।') : '') + '</div>' +
        '<div class="prj-row" style="flex-wrap:wrap"><button class="tb-btn primary" id="ltWord"' + (b.letters.length ? '' : ' disabled') + '>⬇ Word (.docx)</button><button class="tb-btn" id="ltPrint"' + (b.letters.length ? '' : ' disabled') + '>🖨 ' + T('Print / Save as PDF', 'प्रिंट / पीडीएफ सहेजें') + '</button></div></div></div>';
      var o = overlay('ltDialog', html, true); o.querySelector('.stl-box').classList.add('xwide');
      $('ltX').onclick = function () { o.remove(); };
      o.addEventListener('focusin', function (e) { if (e.target.matches('input.big-input, textarea')) last = e.target; });
      var bind = function (id, key) { var el = $(id); if (el) el.oninput = function () { LT.f[key] = el.value; var pv = o.querySelector('.lt-prev'); refreshPreview(o); }; };
      [['ltOffice', 'office'], ['ltFile', 'fileNo'], ['ltDate', 'date'], ['ltTo', 'to'], ['ltSubj', 'subject'], ['ltBody', 'body'], ['ltClose', 'closing'], ['ltSName', 'signName'], ['ltSDesig', 'signDesig']].forEach(function (p) { bind(p[0], p[1]); });
      $('ltPreset').onchange = function () { usePreset(this.value); render(); };
      $('ltLang').onchange = function () { LT.lang = this.value; usePreset(LT.preset); render(); };
      $('ltMode').onchange = function () { LT.mode = this.value; render(); };
      o.querySelectorAll('[data-ph],[data-raw]').forEach(function (b) {
        b.onclick = function () {
          var el = last && document.body.contains(last) ? last : $('ltBody'), txt = b.dataset.raw || '{{' + headers[+b.dataset.ph] + '}}', s = el.selectionStart || el.value.length, e = el.selectionEnd || s;
          el.value = el.value.slice(0, s) + txt + el.value.slice(e); el.focus(); el.selectionStart = el.selectionEnd = s + txt.length; el.dispatchEvent(new Event('input'));
        };
      });
      o.querySelectorAll('[data-an]').forEach(function (cb) { cb.onchange = function () { var i = +cb.dataset.an, k = LT.annex.indexOf(i); if (cb.checked && k < 0) LT.annex.push(i); if (!cb.checked && k >= 0) LT.annex.splice(k, 1); LT.annex.sort(function (a, b) { return a - b; }); refreshPreview(o); }; });
      $('ltWord').onclick = word; $('ltPrint').onclick = printAll;
    }
    function refreshPreview(o) {                                    // keep typing smooth: only the right-hand side is rebuilt
      var b = build(), prev = o.querySelector('.lt-prev'); if (!prev) return;
      var paperEl = prev.querySelector('.lt-paper'); if (paperEl && b.letters[0]) paperEl.outerHTML = paper(b.letters[0]);
    }
    function word() {
      var b = build(); busy(T('Writing the Word file…', 'वर्ड फ़ाइल बन रही है…'));
      fetch('/api/letters/docx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ letters: b.letters, annexure: b.annexure, filename: LT.preset === 'cover' ? 'covering_letter' : 'letters' }) })
        .then(function (r) { if (!r.ok) return r.json().then(function (j) { throw new Error(j.error); }); return r.blob(); })
        .then(function (blob) { H.download(blob, (LT.preset === 'cover' ? 'covering_letter' : 'letters') + '.docx'); toast(T('Word file ready: ', 'वर्ड फ़ाइल तैयार: ') + b.letters.length + T(' letter(s)', ' पत्र'), 'success'); STL.logStep('letters', { en: 'Letters written', hi: 'पत्र बनाए' }, { en: b.letters.length + ' letter(s), ' + LT.preset, hi: b.letters.length + ' पत्र' }); })
        .catch(function (e) { toast(e.message, 'error'); }).then(function () { busy(null); });
    }
    function printAll() {
      var b = build(), pages = b.letters.map(paper).join('<div class="pb"></div>');
      if (b.annexure) pages += '<div class="pb"></div><div class="lt-paper"><div class="lt-office">' + esc(b.annexure.title) + '</div><table><tr>' + b.annexure.headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr>' + b.annexure.rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(c == null ? '' : c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table></div>';
      var w = window.open('', '_blank'); if (!w) { toast(T('Allow pop-ups to print, or use the Word file.', 'प्रिंट के लिए पॉप-अप की अनुमति दें, या वर्ड फ़ाइल उपयोग करें।'), 'warning'); return; }
      w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(T('Letters', 'पत्र')) + '</title><style>@font-face{font-family:Deva;src:url(' + location.origin + '/static/fonts/NotoSansDevanagari-Regular.ttf)}@page{size:A4;margin:20mm 22mm}body{font-family:Deva,Mangal,"Nirmala UI",Arial,sans-serif;font-size:12pt;line-height:1.55;color:#000}.pb{page-break-after:always}.lt-paper{padding:0}.lt-office{text-align:center;font-weight:700;font-size:15pt}.lt-sub{text-align:center;margin-bottom:10px}.lt-row{display:flex;justify-content:space-between;margin:12px 0}.lt-to,.lt-subj{margin:10px 0}.lt-subj{font-weight:700}p{text-align:justify;margin:0 0 10px}.lt-sign{text-align:right;margin-top:36px}table{border-collapse:collapse;width:100%;font-size:10pt}td,th{border:1px solid #444;padding:3px 6px;text-align:left}</style></head><body>' + pages + '</body></html>');
      w.document.close(); w.focus(); setTimeout(function () { w.print(); }, 500);
    }
    render();
  };

  // =================================================================== NAME MATCH
  STL.openNameMatch = function () {
    if (!H.needData()) return;
    var NM = { mode: 'dups', cols: { name: colFor(headers, 'name'), father: colFor(headers, 'father name'), village: colFor(headers, 'village'), age: colFor(headers, 'age'), mobile: colFor(headers, 'mobile') }, other: null, colsB: null, threshold: 0.85, res: null, picks: {}, keepUnmatched: true };
    function opt(hs, val, none) { return (none ? '<option value="-1">' + T('(none)', '(कोई नहीं)') + '</option>' : '') + hs.map(function (h, i) { return '<option value="' + i + '"' + (i === val ? ' selected' : '') + '>' + esc(h) + '</option>'; }).join(''); }
    function pickSel(id, label, hs, val, none) { return '<label class="rp-field"><span>' + label + '</span><select id="' + id + '" class="big-select">' + opt(hs, val, none).replace('<option value="' + val + '"', '<option value="' + val + '" selected') + '</select></label>'; }
    function rowName(rows, i, cols) { var r = rows[i]; return esc(r[cols.name]) + (cols.father >= 0 && r[cols.father] ? ' <em>' + T('s/o', 'पुत्र') + ' ' + esc(r[cols.father]) + '</em>' : '') + (cols.village >= 0 && r[cols.village] ? ' · ' + esc(r[cols.village]) : ''); }
    function render() {
      var res = NM.res, cur = H.editorData(), html = '<div class="prj-h"><b>' + T('Find the same person', 'एक ही व्यक्ति खोजें') + '</b><button id="nmX" aria-label="close">×</button></div>' +
        '<div class="big-note">' + T('Finds the same person written differently: "राहुल शर्मा", "Rahul Sharma", "Rahul Sarma". Father\'s name, place, age and mobile number make the match stronger. You confirm every match.', 'एक ही व्यक्ति को अलग तरह लिखे जाने पर भी खोजता है: "राहुल शर्मा", "Rahul Sharma", "Rahul Sarma"। पिता का नाम, स्थान, आयु और मोबाइल से मिलान मज़बूत होता है। हर मिलान आप पक्का करते हैं।') + '</div>' +
        '<div class="rp-grid"><label class="rp-field wide"><span>' + T('What do you want?', 'आप क्या चाहते हैं?') + '</span><select id="nmMode" class="big-select"><option value="dups"' + (NM.mode === 'dups' ? ' selected' : '') + '>' + T('Find people entered twice in this file', 'इस फ़ाइल में दो बार दर्ज व्यक्ति खोजें') + '</option><option value="lists"' + (NM.mode === 'lists' ? ' selected' : '') + '>' + T('Match this file with another file', 'इस फ़ाइल को दूसरी फ़ाइल से मिलाएँ') + '</option></select></label>' +
        pickSel('nmName', T('Name column', 'नाम का कॉलम'), headers, NM.cols.name, false) + pickSel('nmFather', T("Father's name", 'पिता का नाम'), headers, NM.cols.father, true) + pickSel('nmVillage', T('Village / place', 'गाँव / स्थान'), headers, NM.cols.village, true) + pickSel('nmAge', T('Age', 'आयु'), headers, NM.cols.age, true) + pickSel('nmMobile', T('Mobile', 'मोबाइल'), headers, NM.cols.mobile, true) + '</div>';
      if (NM.mode === 'lists') {
        html += '<div class="rp-pick"><button class="tb-btn" id="nmOther">' + T('Choose the other file…', 'दूसरी फ़ाइल चुनें…') + '</button><span>' + (NM.other ? '✓ ' + esc(NM.other.name) + ' (' + fmt(NM.other.rows.length) + ')' : '') + '</span></div>';
        if (NM.other) html += '<div class="rp-grid">' + pickSel('nmNameB', T('Name column in the other file', 'दूसरी फ़ाइल में नाम का कॉलम'), NM.other.headers, NM.colsB.name, false) + pickSel('nmFatherB', T("Father's name (other file)", 'पिता का नाम (दूसरी फ़ाइल)'), NM.other.headers, NM.colsB.father, true) + pickSel('nmVillageB', T('Place (other file)', 'स्थान (दूसरी फ़ाइल)'), NM.other.headers, NM.colsB.village, true) + '</div>';
      }
      html += '<div class="prj-row" style="margin:8px 0;flex-wrap:wrap"><label class="rp-inline">' + T('Sensitivity', 'संवेदनशीलता') + ' <input type="range" id="nmTh" min="70" max="97" value="' + Math.round(NM.threshold * 100) + '"> <b>' + Math.round(NM.threshold * 100) + '%</b></label><button class="tb-btn primary" id="nmRun"' + (NM.mode === 'lists' && !NM.other ? ' disabled' : '') + '>' + T('Find matches', 'मिलान खोजें') + '</button></div>';
      if (res) {
        var A = H.editorData().rows, B = NM.mode === 'lists' ? NM.other.rows : A, show = res.pairs.slice(0, 300);
        html += '<div class="prj-sub">' + fmt(res.pairs.length) + T(' possible matches', ' संभावित मिलान') + (res.pairs.length > 300 ? ' (' + T('showing the best 300', 'सबसे अच्छे 300 दिखाए') + ')' : '') + '</div>' +
          (show.length ? '<div class="big-tbl-wrap" style="max-height:300px"><table class="big-tbl nm"><tr><th></th><th>' + T('This file', 'यह फ़ाइल') + '</th><th>' + (NM.mode === 'lists' ? T('Other file', 'दूसरी फ़ाइल') : T('Looks like', 'इसके जैसा')) + '</th><th>' + T('How sure', 'कितना पक्का') + '</th></tr>' +
            show.map(function (p, i) { var ck = NM.picks[i] !== undefined ? NM.picks[i] : (p.score >= 0.92 && !p.ambiguous); NM.picks[i] = ck; var cl = p.score >= 0.92 ? 'high' : (p.score >= 0.85 ? 'check' : 'low');
              return '<tr><td><input type="checkbox" data-pk="' + i + '"' + (ck ? ' checked' : '') + '></td><td>' + rowName(A, p.a, NM.cols) + '</td><td>' + rowName(B, p.b, NM.mode === 'lists' ? NM.colsB : NM.cols) + '</td><td><span class="rp-badge ' + cl + '">' + Math.round(p.score * 100) + '%</span>' + (p.ambiguous ? ' <span class="rp-badge check">' + T('2 equal candidates', '2 बराबर विकल्प') + '</span>' : '') + '<div class="big-sub">' + p.reasons.map(function (r) { return esc(T(r, r)); }).join(' · ') + '</div></td></tr>'; }).join('') + '</table></div>' +
            '<div class="prj-row" style="margin-top:8px;flex-wrap:wrap">' + (NM.mode === 'dups' ? '<button class="tb-btn primary" id="nmMark">' + T('Mark them in a new column', 'नए कॉलम में चिह्नित करें') + '</button><button class="tb-btn danger" id="nmDrop">' + T('Remove the later copy of each', 'हर एक की बाद वाली प्रति हटाएँ') + '</button>' : '<button class="tb-btn primary" id="nmJoin">' + T('Join the matched rows side by side', 'मिले हुए पंक्तियों को साथ-साथ जोड़ें') + '</button><label class="rp-inline"><input type="checkbox" id="nmKeep"' + (NM.keepUnmatched ? ' checked' : '') + '> ' + T('keep rows that found no match', 'बिना मिलान वाली पंक्तियाँ रखें') + '</label>') + '<button class="tb-btn" id="nmAll">' + T('Tick all / none', 'सब चुनें / हटाएँ') + '</button></div>' : '<div class="big-note">' + T('No matches at this sensitivity. Lower it to see weaker matches.', 'इस संवेदनशीलता पर कोई मिलान नहीं। कमज़ोर मिलान देखने के लिए इसे घटाएँ।') + '</div>');
      }
      var o = overlay('nmDialog', html, true); o.querySelector('.stl-box').classList.add('xwide');
      $('nmX').onclick = function () { o.remove(); }; wire(o);
    }
    function wire(o) {
      $('nmMode').onchange = function () { NM.mode = this.value; NM.res = null; NM.picks = {}; render(); };
      [['nmName', 'name'], ['nmFather', 'father'], ['nmVillage', 'village'], ['nmAge', 'age'], ['nmMobile', 'mobile']].forEach(function (p) { $(p[0]).onchange = function () { NM.cols[p[1]] = +this.value; NM.res = null; NM.picks = {}; render(); }; });
      [['nmNameB', 'name'], ['nmFatherB', 'father'], ['nmVillageB', 'village']].forEach(function (p) { if ($(p[0])) $(p[0]).onchange = function () { NM.colsB[p[1]] = +this.value; NM.res = null; render(); }; });
      $('nmTh').oninput = function () { NM.threshold = this.value / 100; this.nextElementSibling.textContent = this.value + '%'; };
      $('nmTh').onchange = function () { if (NM.res) run(); };
      $('nmRun').onclick = run;
      if ($('nmOther')) $('nmOther').onclick = function () {
        H.pickFile('.csv,.tsv,.txt,.xlsx,.xls').then(function (f) { if (!f) return; busy(T('Reading the file…', 'फ़ाइल पढ़ी जा रही है…')); H.loadDataset(f).then(function (d) { NM.other = d; NM.colsB = { name: colFor(d.headers, 'name'), father: colFor(d.headers, 'father name'), village: colFor(d.headers, 'village') }; if (NM.colsB.name < 0) NM.colsB.name = 0; NM.res = null; }).catch(function (e) { toast(e.message, 'error'); }).then(function () { busy(null); render(); }); });
      };
      o.querySelectorAll('input[data-pk]').forEach(function (cb) { cb.onchange = function () { NM.picks[+cb.dataset.pk] = cb.checked; }; });
      if ($('nmAll')) $('nmAll').onclick = function () { var any = Object.keys(NM.picks).some(function (k) { return NM.picks[k]; }); Object.keys(NM.picks).forEach(function (k) { NM.picks[k] = !any; }); render(); };
      if ($('nmKeep')) $('nmKeep').onchange = function () { NM.keepUnmatched = this.checked; };
      if ($('nmMark')) $('nmMark').onclick = mark; if ($('nmDrop')) $('nmDrop').onclick = drop; if ($('nmJoin')) $('nmJoin').onclick = join;
    }
    function run() {
      if (NM.cols.name < 0) { toast(T('Choose the name column', 'नाम का कॉलम चुनें'), 'error'); return; }
      busy(T('Comparing names…', 'नामों की तुलना हो रही है…')); NM.picks = {};
      setTimeout(function () {
        try {
          var A = H.editorData().rows;
          NM.res = NM.mode === 'dups' ? N.findDuplicates(A, NM.cols, { threshold: NM.threshold }) : N.matchLists(A, NM.other.rows, Object.assign({}, NM.cols, { nameB: NM.colsB.name, fatherB: NM.colsB.father, villageB: NM.colsB.village, ageB: -1, mobileB: -1 }), { threshold: NM.threshold });
        } catch (e) { toast(e.message, 'error'); NM.res = null; }
        busy(null); render();
      }, 40);
    }
    function chosen() { return NM.res.pairs.slice(0, 300).filter(function (p, i) { return NM.picks[i]; }); }
    function mark() {
      var pairs = chosen(); if (!pairs.length) { toast(T('Tick at least one match', 'कम से कम एक मिलान चुनें'), 'info'); return; }
      var groups = N.groupPairs(pairs, rawData.length, 0), gid = {}; groups.forEach(function (g, k) { g.forEach(function (i) { gid[i] = k + 1; }); });
      var col = T('Duplicate group', 'दोहराव समूह'), grid = [headers.concat([col])].concat(rawData.map(function (r, i) { return r.concat([gid[i] ? String(gid[i]) : '']); }));
      document.getElementById('nmDialog').remove(); U.loadGrid(grid);
      STL.logStep('names', { en: 'Marked duplicate people', hi: 'दोहराए व्यक्ति चिह्नित' }, { en: groups.length + ' group(s), ' + pairs.length + ' pair(s) confirmed', hi: groups.length + ' समूह' });
      toast(groups.length + T(' groups marked in the column "', ' समूह चिह्नित, कॉलम "') + col + '"', 'success');
    }
    function drop() {
      var pairs = chosen(); if (!pairs.length) { toast(T('Tick at least one match', 'कम से कम एक मिलान चुनें'), 'info'); return; }
      var groups = N.groupPairs(pairs, rawData.length, 0), rm = {}; groups.forEach(function (g) { g.slice(1).forEach(function (i) { rm[i] = 1; }); });
      var grid = [headers.slice()].concat(rawData.filter(function (_, i) { return !rm[i]; }));
      document.getElementById('nmDialog').remove(); U.loadGrid(grid);
      STL.logStep('names', { en: 'Removed duplicate people', hi: 'दोहराए व्यक्ति हटाए' }, { en: Object.keys(rm).length + ' row(s) removed (the first of each group kept)', hi: Object.keys(rm).length + ' पंक्तियाँ हटीं' });
      toast(T('Removed ', 'हटाई गईं: ') + Object.keys(rm).length + T(' rows. Undo brings them back.', ' पंक्तियाँ। पूर्ववत से वापस आएँगी।'), 'success');
    }
    function join() {
      var pairs = chosen(), B = NM.other, byA = {}; pairs.forEach(function (p) { byA[p.a] = p; });
      if (!pairs.length) { toast(T('Tick at least one match', 'कम से कम एक मिलान चुनें'), 'info'); return; }
      var hdr = headers.concat(B.headers.map(function (h) { return T('Other: ', 'दूसरी: ') + h; })), grid = [hdr];
      rawData.forEach(function (r, i) { var p = byA[i]; if (p) grid.push(r.concat(B.rows[p.b])); else if (NM.keepUnmatched) grid.push(r.concat(B.headers.map(function () { return ''; }))); });
      document.getElementById('nmDialog').remove(); U.loadGrid(grid);
      STL.logStep('names', { en: 'Matched two lists by name', hi: 'दो सूचियाँ नाम से मिलाईं' }, { en: pairs.length + ' match(es) confirmed', hi: pairs.length + ' मिलान' });
      toast(pairs.length + T(' matches joined', ' मिलान जोड़े गए'), 'success');
    }
    render();
  };

  // =================================================================== Home tiles and Ctrl+K
  STL.extraTiles = [
    ['📈', 'Make this month\'s report', 'इस माह की रिपोर्ट बनाएँ', 'Learns from last month\'s report', 'पिछली रिपोर्ट से सीखकर भरता है', function () { STL.openAutopilot(); }, true],
    ['🔍', 'What changed since last month?', 'पिछले माह से क्या बदला?', 'Compare two files in one click', 'दो फ़ाइलों की तुलना एक क्लिक में', function () { if (!U.hasData()) { toast(T('Open this month\'s file first.', 'पहले इस माह की फ़ाइल खोलें।'), 'info'); return; } STL.openChangeRadar(); }, true],
    ['⏳', 'Pending cases by age', 'आयु के अनुसार लंबित प्रकरण', 'Ageing, deadlines, weekly trend', 'आयु, समय-सीमा, साप्ताहिक प्रवृत्ति', function () { if (!U.hasData()) { toast(T('Open the case register first.', 'पहले प्रकरण पंजी खोलें।'), 'info'); return; } STL.openPendency(); }],
    ['✉️', 'Write letters from data', 'डेटा से पत्र बनाएँ', 'Notices and covering letters, Word / PDF', 'नोटिस और अग्रेषण पत्र, वर्ड / पीडीएफ', function () { if (!U.hasData()) { toast(T('Open the file with the names first.', 'पहले नामों वाली फ़ाइल खोलें।'), 'info'); return; } STL.openLetters(); }],
    ['👥', 'Find the same person', 'एक ही व्यक्ति खोजें', 'Hindi and English spellings', 'हिंदी और अंग्रेज़ी वर्तनी', function () { if (!U.hasData()) { toast(T('Open the file with the names first.', 'पहले नामों वाली फ़ाइल खोलें।'), 'info'); return; } STL.openNameMatch(); }]
  ];
  var A = STL.actions || [];
  [['Make this month\'s report (Report Autopilot)', 'इस माह की रिपोर्ट बनाएँ (ऑटोपायलट)', 'report autopilot monthly proforma fill excel masik report bharo', function () { STL.openAutopilot(); }],
   ['What changed since last month? (compare two files)', 'पिछले माह से क्या बदला? (दो फ़ाइलें)', 'change radar compare difference last month badlav tulna', function () { STL.openChangeRadar(); }],
   ['Pending cases by age (ageing, deadlines)', 'आयु के अनुसार लंबित प्रकरण', 'pendency pending ageing deadline lambit prakaran', function () { STL.openPendency(); }],
   ['Write letters from data (Word / PDF)', 'डेटा से पत्र बनाएँ (वर्ड / पीडीएफ)', 'letters notice reminder show cause covering patra naya notice', function () { STL.openLetters(); }],
   ['Find the same person (name match, duplicates)', 'एक ही व्यक्ति खोजें (नाम मिलान)', 'name match duplicate beneficiary same person naam milan', function () { STL.openNameMatch(); }]
  ].forEach(function (x) { A.push({ en: x[0], hi: x[1], kw: x[2], run: x[3], group: 'Reports' }); });
})();
