// =====================================================================
//  DOWNLOAD  /  डाउनलोड
//  One way to take any chart, table or answer out of the app as a PDF (pages are DRAWN BY THE BROWSER, so Hindi is exact) or a picture (PNG).
//    STL.dl.pdfOfElement(el, title, fileName)   a dialog or panel (also very long ones: split over pages)
//    STL.dl.pngOfElement(el, fileName)
//    STL.dl.chartPdf(echartsInstance, title, caption, fileName)
//    STL.dl.tablePdf(headers, rows, title, fileName, maxRows)   a table, 30 rows to a page, header on every page
//    STL.dl.attach(box, title)                  puts a “Download” menu into the header of a dialog
//  The PDF itself is put together on this computer (nothing is sent anywhere): /api/dashboard/pdf runs on 127.0.0.1.
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL = root.STL || {}, DL = STL.dl = {};
  var U = STL.ui, T = U ? U.T : function (a) { return a; };
  var FONT = "'Noto Sans Devanagari','Mangal','Nirmala UI','Inter','Segoe UI',sans-serif", PW = 1754, PH = 1240, M = 60;
  function today() { var d = new Date(); return ('0' + d.getDate()).slice(-2) + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + d.getFullYear(); }
  function fileName(title, ext) { var base = String(title || '').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 80); return (base || 'stellura') + '.' + ext; }
  function save(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); }
  function fonts() { return Promise.all(['700 28px "Noto Sans Devanagari"', '400 22px "Noto Sans Devanagari"', '700 28px Inter', '400 22px Inter'].map(function (f) { return document.fonts && document.fonts.load ? document.fonts.load(f, 'अआइ Abc') : null; })).catch(function () {}); }
  function docName() { var d = document.getElementById('documentName'); return (d && d.textContent || '').trim(); }
  // a blank page with the title on top and the footer below; returns { cv, ctx, top, bottom }
  function newPage(title, pn, total) {
    var cv = document.createElement('canvas'); cv.width = PW; cv.height = PH; var ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, PW, PH); ctx.fillStyle = '#6d5bd0'; ctx.fillRect(0, 0, PW, 12); ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#1e1b4b'; ctx.font = '700 34px ' + FONT; var t = String(title || ''); while (t.length > 3 && ctx.measureText(t).width > PW - 2 * M - 220) t = t.slice(0, -2); if (t !== String(title || '')) t += '…'; ctx.fillText(t, M, 66);
    ctx.fillStyle = '#64748b'; ctx.font = '400 22px ' + FONT; var d = today(); ctx.fillText(d, PW - M - ctx.measureText(d).width, 64);
    ctx.fillStyle = '#e2e8f0'; ctx.fillRect(M, 84, PW - 2 * M, 2);
    ctx.fillStyle = '#94a3b8'; ctx.font = '400 18px ' + FONT; ctx.fillText('Stellura  ·  ' + (docName() || ''), M, PH - 24); var pn1 = pn + ' / ' + total; ctx.fillText(pn1, PW - M - ctx.measureText(pn1).width, PH - 24);
    return { cv: cv, ctx: ctx, top: 104, bottom: PH - 50 };
  }
  // an image (canvas) cut into pages, scaled to the page width
  function pagesFromCanvas(src, title) {
    var w = PW - 2 * M, scale = Math.min(w / src.width, 1.6), dw = Math.round(src.width * scale), avail = PH - 104 - 50, sliceH = Math.floor(avail / scale), n = Math.max(1, Math.ceil(src.height / sliceH)), out = [];
    for (var i = 0; i < n; i++) {
      var p = newPage(title, i + 1, n), sy = i * sliceH, sh = Math.min(sliceH, src.height - sy);
      p.ctx.drawImage(src, 0, sy, src.width, sh, M + Math.round((w - dw) / 2), p.top, dw, Math.round(sh * scale)); out.push(p.cv.toDataURL('image/png'));
    }
    return out;
  }
  DL.pdfFromPages = function (title, pages, name) {
    return fetch('/api/dashboard/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title, pages: pages }) }).then(function (r) {
      if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || 'Could not make the PDF'); }); return r.blob();
    }).then(function (b) { DL.lastPages = pages; save(b, name || fileName(title, 'pdf')); toast(T('PDF downloaded.', 'PDF डाउनलोड हुआ।'), 'success'); });
  };
  DL.snapshot = function (el) {
    el.setAttribute('data-dl-target', '1');
    var full = Math.max(el.scrollHeight, el.offsetHeight);
    return fonts().then(function () {
      return html2canvas(el, { scale: 2, backgroundColor: '#ffffff', logging: false, height: full, windowHeight: full + 200, scrollY: 0,
        onclone: function (doc) { var e = doc.querySelector('[data-dl-target]'); if (e) { e.style.maxHeight = 'none'; e.style.overflow = 'visible'; e.style.height = 'auto'; e.querySelectorAll('*').forEach(function (c) { var cs = c.style; if (c.scrollHeight > c.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(c).overflowY || '')) { cs.maxHeight = 'none'; cs.overflow = 'visible'; cs.height = 'auto'; } }); e.querySelectorAll('.dl-skip').forEach(function (c) { c.style.display = 'none'; }); } } });
    }).then(function (cv) { el.removeAttribute('data-dl-target'); return cv; }, function (e) { el.removeAttribute('data-dl-target'); throw e; });
  };
  DL.pdfOfElement = function (el, title, name) {
    if (typeof html2canvas === 'undefined') { toast(T('The picture library is missing. Please reinstall Stellura.', 'चित्र लाइब्रेरी नहीं मिली। कृपया Stellura फिर से इंस्टॉल करें।'), 'error'); return Promise.resolve(); }
    U.busy(T('Making the PDF…', 'PDF बन रहा है…'));
    return DL.snapshot(el).then(function (cv) { return DL.pdfFromPages(title, pagesFromCanvas(cv, title), name); }).catch(function (e) { toast(e.message, 'error'); }).then(function () { U.busy(null); });
  };
  DL.pngOfElement = function (el, name) {
    if (typeof html2canvas === 'undefined') return Promise.resolve();
    return DL.snapshot(el).then(function (cv) { return new Promise(function (ok) { cv.toBlob(function (b) { save(b, name); toast(T('Picture downloaded.', 'चित्र डाउनलोड हुआ।'), 'success'); ok(); }, 'image/png'); }); }).catch(function (e) { toast(e.message, 'error'); });
  };
  // a chart: one page, the picture big, the caption below
  DL.chartPdf = function (inst, title, caption, name) {
    U.busy(T('Making the PDF…', 'PDF बन रहा है…'));
    return fonts().then(function () {
      var img = new Image(), url = inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff', excludeComponents: ['toolbox'] });
      return new Promise(function (ok, bad) { img.onload = ok; img.onerror = function () { bad(new Error('picture')); }; img.src = url; }).then(function () {
        var p = newPage(title, 1, 1), w = PW - 2 * M, h = p.bottom - p.top - 150, sc = Math.min(w / img.width, h / img.height), dw = img.width * sc, dh = img.height * sc;
        p.ctx.drawImage(img, M + (w - dw) / 2, p.top + 10, dw, dh); p.ctx.fillStyle = '#334155'; p.ctx.font = '400 24px ' + FONT;
        var words = String(caption || '').split(/\s+/), line = '', y = p.top + dh + 56; words.forEach(function (wd) { var t = line ? line + ' ' + wd : wd; if (p.ctx.measureText(t).width > w && line) { p.ctx.fillText(line, M, y); y += 34; line = wd; } else line = t; }); if (line && y < p.bottom) p.ctx.fillText(line, M, y);
        return DL.pdfFromPages(title, [p.cv.toDataURL('image/png')], name);
      });
    }).catch(function (e) { toast(e.message, 'error'); }).then(function () { U.busy(null); });
  };
  // a table: pages of rows, the headings repeated, the browser draws the cells (Hindi exact)
  DL.tablePdf = function (headers, rows, title, name, maxRows) {
    if (typeof html2canvas === 'undefined') { toast(T('The picture library is missing.', 'चित्र लाइब्रेरी नहीं मिली।'), 'error'); return Promise.resolve(); }
    var cap = maxRows || 2000, shown = rows.slice(0, cap), per = headers.length > 14 ? 38 : 30, n = Math.max(1, Math.ceil(shown.length / per)), fs = headers.length > 18 ? 11 : (headers.length > 12 ? 13 : 16), esc = function (x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    U.busy(T('Making the PDF…', 'PDF बन रहा है…'));
    var host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-20000px;top:0;width:' + (PW - 2 * M) + 'px;background:#fff'; document.body.appendChild(host);
    var pages = [], chain = fonts();
    var one = function (k) {
      var part = shown.slice(k * per, (k + 1) * per);
      host.innerHTML = '<table style="border-collapse:collapse;width:100%;table-layout:auto;font:' + fs + 'px ' + FONT + ';color:#0f172a"><thead><tr>' + headers.map(function (h) { return '<th style="border:1px solid #cbd5e1;background:#f1f0fb;padding:6px 8px;text-align:left">' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        part.map(function (r, i) { return '<tr style="background:' + (i % 2 ? '#fafafe' : '#fff') + '">' + headers.map(function (_, c) { var v = r[c], num = v !== '' && v != null && isFinite(Number(String(v).replace(/,/g, ''))); return '<td style="border:1px solid #e2e8f0;padding:5px 8px;' + (num ? 'text-align:right;' : '') + 'word-break:break-word;max-width:' + Math.round((PW - 2 * M) / Math.max(2, Math.min(headers.length, 6))) + 'px">' + esc(v) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
      return html2canvas(host, { scale: 2, backgroundColor: '#ffffff', logging: false }).then(function (cv) { var p = newPage(title + (rows.length > cap ? ' (' + T('first', 'पहली') + ' ' + cap + ')' : ''), k + 1, n), s = Math.min((PW - 2 * M) / cv.width, 1); p.ctx.drawImage(cv, 0, 0, cv.width, cv.height, M, p.top, cv.width * s, cv.height * s); pages.push(p.cv.toDataURL('image/png')); });
    };
    for (var k = 0; k < n; k++) (function (kk) { chain = chain.then(function () { return one(kk); }); })(k);
    return chain.then(function () { document.body.removeChild(host); return DL.pdfFromPages(title, pages, name || fileName(title, 'pdf')); }).catch(function (e) { try { document.body.removeChild(host); } catch (x) {} toast(e.message, 'error'); }).then(function () { U.busy(null); });
  };
  // the menu in a dialog's header: PDF and picture of what is on screen
  DL.attach = function (box, title) {
    var h = box.querySelector('.prj-h'); if (!h || h.querySelector('.dl-btn')) return;
    var b = document.createElement('button'); b.className = 'tb-btn dl-btn dl-skip'; b.style.cssText = 'margin-left:auto;margin-right:8px'; b.textContent = '⬇ ' + T('Download', 'डाउनलोड'); b.setAttribute('aria-haspopup', 'true');
    var close = h.querySelector('button[aria-label="close"]'); if (close) h.insertBefore(b, close); else h.appendChild(b);
    b.onclick = function (e) {
      e.stopPropagation(); var old = document.getElementById('dlMenu'); if (old) { old.remove(); return; }
      var m = document.createElement('div'); m.id = 'dlMenu'; m.className = 'dl-skip'; var r = b.getBoundingClientRect(); m.style.cssText = 'position:fixed;z-index:100000;left:' + Math.max(8, r.right - 190) + 'px;top:' + (r.bottom + 4) + 'px;width:190px;background:#fff;border:1px solid #cbd5e1;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.18);padding:4px';
      var ttl = typeof title === 'function' ? title() : (title || docName() || 'Stellura'), nm = function (ext) { return fileName(ttl, ext); }, body = box;
      [['📄 ' + T('PDF', 'PDF'), function () { DL.pdfOfElement(body, ttl, nm('pdf')); }], ['🖼 ' + T('Picture (PNG)', 'चित्र (PNG)'), function () { DL.pngOfElement(body, nm('png')); }]].forEach(function (it) { var x = document.createElement('button'); x.className = 'tb-btn'; x.style.cssText = 'display:block;width:100%;text-align:left;border:0;background:none;padding:8px 10px'; x.textContent = it[0]; x.onclick = function () { m.remove(); it[1](); }; m.appendChild(x); });
      document.body.appendChild(m); setTimeout(function () { document.addEventListener('click', function f() { m.remove(); document.removeEventListener('click', f); }); }, 0);
    };
  };
  // every answer dialog gets the menu as soon as it opens
  var ALLOW = { driversDialog: 1, fairDialog: 1, askDialog: 1, colChecksDialog: 1, wordsDialog: 1, repDialog: 1, forecastDialog: 1, outlierDialog: 1, clusterDialog: 1, findingsDialog: 1, colRolesDialog: 1, linkDialog: 0 };
  if (root.document) new MutationObserver(function (muts) {
    muts.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1 && n.id && ALLOW[n.id]) { var box = n.querySelector('.stl-box, .prj-box'); if (box) DL.attach(box, function () { var h = box.querySelector('.prj-h b'); return h ? h.textContent.replace(/^[^\wऀ-ॿ]+/, '').trim() : 'Stellura'; }); } }); });
  }).observe(document.body, { childList: true });
})(typeof window !== 'undefined' ? window : globalThis);
