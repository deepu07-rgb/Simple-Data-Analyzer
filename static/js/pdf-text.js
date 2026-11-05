/*!
 * Stellura - browser-side text helper for jsPDF (Hindi / Devanagari in PDFs)
 * ==========================================================================
 * jsPDF only knows the built-in Helvetica/Times/Courier fonts (WinAnsi), so any
 * Hindi passed to doc.text() or autoTable comes out as unreadable symbols, and
 * jsPDF has no complex-script shaping even if a Devanagari font were embedded.
 *
 * The browser *can* shape Devanagari (it is what draws the UI), so this helper
 * lets the browser draw every string jsPDF cannot: it renders the string to an
 * off-screen canvas in Noto Sans Devanagari and places the result in the PDF as
 * a transparent image, at the position, size and colour doc.text() would use.
 * Strings jsPDF can draw itself are still passed straight to doc.text(), so
 * Latin-only PDFs are unchanged.  Fully offline: no library, no font embedded.
 *
 *   var T = window.StelluraPdfText;
 *   await T.ready();                                  // once, before building the PDF
 *   T.text(doc, str, x, y, { align: 'center' });      // drop-in for doc.text
 *   T.split(doc, str, maxWidth);                      // drop-in for doc.splitTextToSize
 *   T.autoTable(doc, options, config);                // drop-in for doc.autoTable (tables with Hindi cells)
 *
 * Trade-off: Hindi text is an image, so it can't be selected or searched in the
 * PDF (it was unreadable before).  Server-built PDFs keep real text.
 */
(function (global) {
  'use strict';

  var FAMILY = '"Noto Sans Devanagari", "Nirmala UI", "Mangal", "Segoe UI Symbol", "Segoe UI", Arial, sans-serif';
  var BASE_SCALE = 5;        // canvas pixels per PDF point (360 dpi)
  var MAX_PX = 16000;        // stay well inside the browser's canvas size limit
  var MEASURE_PX = 100;      // measure at a large size so hinting can't skew widths
  var BASELINE_TOP = 0.85;   // jsPDF-AutoTable puts the first baseline 0.85 em below the text origin
  var RASTER_LINE_FACTOR = 1.4;  // Devanagari needs more leading than jsPDF's default 1.15
  var VIRAMA = '\u094D';
  var JOINERS = '\u200C\u200D';
  // Characters jsPDF's standard fonts can draw when no font metrics are available.
  var WINANSI_SAFE = /^[\x20-\x7E\xA1-\xFF\u2013\u2014\u2018\u2019\u201A\u201C\u201D\u201E\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u20AC\u2122]$/;

  var measureCtx = null, renderCanvas = null, renderCtx = null, readyPromise = null;
  var imageCache = Object.create(null);

  // ---------------------------------------------------------------- fonts
  /** Resolves once Noto Sans Devanagari is loaded (canvas silently uses a fallback otherwise). */
  function ready() {
    if (!readyPromise) {
      var fonts = global.document && global.document.fonts;
      if (fonts && fonts.load) {
        readyPromise = Promise.all([
          fonts.load('400 16px "Noto Sans Devanagari"', '\u0905'),
          fonts.load('700 16px "Noto Sans Devanagari"', '\u0905')
        ]).then(function () { return fonts.ready; }).catch(function () {});
      } else {
        readyPromise = Promise.resolve();
      }
    }
    return readyPromise;
  }

  // ------------------------------------------------------- what needs a raster
  // All of jsPDF's standard fonts share the WinAnsi character set, so Helvetica's table says
  // what any of them can draw.  (Not the *current* font: Courier's table is incomplete, and
  // autoTable switches fonts between cells.)
  function glyphWidths(doc) {
    try {
      var f = doc.getFont('helvetica', 'normal');
      return (f && f.metadata && f.metadata.Unicode && f.metadata.Unicode.widths) || null;
    } catch (e) { return null; }
  }

  /** True if jsPDF's standard fonts cannot draw *s* (Devanagari, check marks, rupee sign, ...). */
  function needsRaster(doc, s) {
    if (typeof s !== 'string' || !s) return false;
    var table = glyphWidths(doc);
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 32) continue;                              // line breaks etc. are handled by the caller
      if (c >= 0x900 && c <= 0x97F) return true;
      if (table ? table[c] === undefined : !WINANSI_SAFE.test(s.charAt(i))) return true;
    }
    return false;
  }

  // -------------------------------------------------------------- measuring
  function cssFont(style, px) {
    style = style || '';
    return (/italic/.test(style) ? 'italic ' : '') + (/bold/.test(style) ? '700 ' : '400 ') + px + 'px ' + FAMILY;
  }

  function ctx2d() {
    if (!measureCtx) measureCtx = global.document.createElement('canvas').getContext('2d');
    return measureCtx;
  }

  /** Advance width of *s* in points at *sizePt*. */
  function widthPt(s, sizePt, style) {
    var c = ctx2d();
    c.font = cssFont(style, MEASURE_PX);
    return c.measureText(s).width * sizePt / MEASURE_PX;
  }

  function scaleOf(doc) { return doc.internal.scaleFactor; }   // points per document unit

  /** Width of *s* in document units; shaped by the browser when it needs a raster. */
  function width(doc, s, sizePt, style) {
    sizePt = sizePt || doc.getFontSize();
    style = style == null ? fontStyleOf(doc) : style;
    return needsRaster(doc, s) ? widthPt(s, sizePt, style) / scaleOf(doc) : doc.getTextWidth(s);
  }

  function fontStyleOf(doc) {
    try { return doc.getFont().fontStyle || ''; } catch (e) { return ''; }
  }

  // ------------------------------------------------------------ clusters / wrap
  /** Split into aksharas: a base character plus everything that attaches to it. */
  function clusters(s) {
    var out = [], cur = '', last = '';
    var chars = Array.from(s);
    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i];
      var attaches = cur !== '' && (
        /\p{M}/u.test(ch) ||
        JOINERS.indexOf(ch) >= 0 ||
        (last === VIRAMA && ch >= '\u0900' && ch <= '\u097F'));
      if (attaches) { cur += ch; } else { if (cur) out.push(cur); cur = ch; }
      if (JOINERS.indexOf(ch) < 0) last = ch;
    }
    if (cur) out.push(cur);
    return out;
  }

  /** Greedy word wrap using browser text widths; over-long words break between aksharas. */
  function wrapLines(s, maxUnits, sizePt, style, k) {
    var fits = function (t) { return widthPt(t, sizePt, style) / k <= maxUnits; };
    var lines = [];
    String(s).split(/\r?\n/).forEach(function (para) {
      var line = '';
      para.split(' ').forEach(function (word) {
        var cand = line === '' ? word : line + ' ' + word;
        if (fits(cand)) { line = cand; return; }
        if (line !== '') { lines.push(line); line = ''; }
        if (fits(word)) { line = word; return; }
        clusters(word).forEach(function (unit) {          // a single word wider than the line
          var next = line + unit;
          if (line !== '' && !fits(next)) { lines.push(line); line = unit; } else { line = next; }
        });
      });
      lines.push(line);
    });
    return lines;
  }

  /** Drop-in for doc.splitTextToSize(). */
  function split(doc, s, maxWidth, options) {
    if (!needsRaster(doc, s)) return doc.splitTextToSize(s, maxWidth, options);
    return wrapLines(s, maxWidth, doc.getFontSize(), fontStyleOf(doc), scaleOf(doc));
  }

  // --------------------------------------------------------------- rendering
  function cssColor(c) {
    if (typeof c === 'string') return c;
    if (typeof c === 'number') { var g = Math.round(c); return 'rgb(' + g + ',' + g + ',' + g + ')'; }
    if (Array.isArray(c) && c.length >= 3) return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')';
    return '#000000';
  }

  /** Render one line of text to a transparent PNG; cached per (text, size, style, colour). */
  function renderLine(s, sizePt, style, color) {
    var key = JSON.stringify([s, sizePt, style, color]);
    if (imageCache[key]) return imageCache[key];

    var advPt = widthPt(s, sizePt, style);
    var scale = Math.max(1, Math.min(BASE_SCALE, MAX_PX / Math.max(advPt, 1)));
    var px = sizePt * scale;
    if (!renderCanvas) { renderCanvas = global.document.createElement('canvas'); renderCtx = renderCanvas.getContext('2d'); }

    renderCtx.font = cssFont(style, px);
    var m = renderCtx.measureText(s);
    var ascent = Math.ceil(m.fontBoundingBoxAscent || px * 1.1) + 1;
    var descent = Math.ceil(m.fontBoundingBoxDescent || px * 0.35) + 1;
    var pad = Math.ceil(px * 0.15);                         // room for marks that overhang the advance
    renderCanvas.width = Math.ceil(m.width) + 2 * pad;      // resizing resets the context state
    renderCanvas.height = ascent + descent;
    renderCtx.font = cssFont(style, px);
    renderCtx.fillStyle = color;
    renderCtx.textBaseline = 'alphabetic';
    renderCtx.direction = 'ltr';
    if ('textRendering' in renderCtx) renderCtx.textRendering = 'optimizeLegibility';
    renderCtx.fillText(s, pad, ascent);

    return (imageCache[key] = {
      url: renderCanvas.toDataURL('image/png'),
      w: renderCanvas.width, h: renderCanvas.height, pad: pad, ascent: ascent, scale: scale,
      alias: 'sdt' + Object.keys(imageCache).length
    });
  }

  /** Put *s* in the PDF as an image, baseline at y; x per *align*. Sizes are in document units. */
  function drawRaster(doc, s, x, y, align, sizePt, style, color) {
    var img = renderLine(s, sizePt, style, color);
    var perPx = 1 / (img.scale * scaleOf(doc));
    var adv = widthPt(s, sizePt, style) / scaleOf(doc);
    var left = align === 'center' ? x - adv / 2 : align === 'right' ? x - adv : x;
    doc.addImage(img.url, 'PNG', left - img.pad * perPx, y - img.ascent * perPx,
                 img.w * perPx, img.h * perPx, img.alias, 'FAST');
  }

  /** Drop-in for doc.text(str, x, y, options); Latin-only strings still go to jsPDF. */
  function text(doc, str, x, y, options) {
    var lines = Array.isArray(str) ? str : [str];
    var raster = lines.some(function (l) { return needsRaster(doc, String(l)); });
    if (!raster) return options === undefined ? doc.text(str, x, y) : doc.text(str, x, y, options);

    var align = (options && options.align) || 'left';
    var size = doc.getFontSize(), style = fontStyleOf(doc), color = cssColor(doc.getTextColor());
    var pitch = size * Math.max(doc.getLineHeightFactor(), RASTER_LINE_FACTOR) / scaleOf(doc);
    lines.forEach(function (line, i) {
      line = String(line);
      var yy = y + i * pitch;
      if (needsRaster(doc, line)) drawRaster(doc, line, x, yy, align, size, style, color);
      else if (line !== '') doc.text(line, x, yy, options);
    });
    return doc;
  }

  // ------------------------------------------------------------------ tables
  /**
   * Options for doc.autoTable() so that cells jsPDF cannot draw (Hindi) are laid
   * out and drawn by this helper.  Returns *options* itself when no cell needs it.
   *
   * jsPDF-AutoTable measures and wraps text with Helvetica metrics, which are
   * meaningless for Devanagari.  So when any cell needs a raster the columns get
   * fixed widths (config.colWidths, else equal), those cells are wrapped here
   * with real browser widths, autoTable is handed that many empty lines so the
   * row height is right, and the lines are drawn in didDrawCell.  Rows are kept
   * whole across page breaks (autoTable would otherwise split a tall row and hand
   * each page only some of a cell's lines).
   */
  function autoTableOptions(doc, options, config) {
    config = config || {};
    var rows = [].concat(options.head || [], options.body || [], options.foot || []);
    var anyRaster = rows.some(function (row) {
      return [].concat(row).some(function (cell) {
        var t = cell && typeof cell === 'object' && !Array.isArray(cell) ? cell.content : cell;
        return needsRaster(doc, t == null ? '' : String(t));
      });
    });
    if (!anyRaster) return options;

    var ncols = Math.max.apply(null, rows.map(function (r) { return [].concat(r).length; }).concat([1]));
    var margin = options.margin || {};
    var pageW = doc.internal.pageSize.getWidth();
    var inner = pageW - (margin.left != null ? margin.left : 14.11) - (margin.right != null ? margin.right : 14.11);
    var widths = config.colWidths || [];
    var equal = Math.max(inner / ncols, config.minColWidth || 18);

    var columnStyles = Object.assign({}, options.columnStyles);
    for (var c = 0; c < ncols; c++) {
      widths[c] = widths[c] || equal;
      columnStyles[c] = Object.assign({}, columnStyles[c], { cellWidth: widths[c] });
    }

    var userParse = options.didParseCell, userDraw = options.didDrawCell;
    var k = scaleOf(doc);

    return Object.assign({}, options, {
      rowPageBreak: options.rowPageBreak || 'avoid',
      columnStyles: columnStyles,
      didParseCell: function (data) {
        if (userParse) userParse(data);
        var cell = data.cell, str = (cell.text || []).join('\n');
        if (!needsRaster(doc, str)) return;
        var st = cell.styles, size = st.fontSize || 10, style = st.fontStyle || '';
        var room = widths[data.column.index] - cell.padding('left') - cell.padding('right');
        var lines = wrapLines(str, room, size, style, k);
        cell.stellura = { lines: lines, size: size, style: style };
        cell.text = lines.map(function () { return ''; });      // reserves the right row height
      },
      didDrawCell: function (data) {
        var cell = data.cell, r = cell.stellura;
        if (r) {
          var pos = cell.getTextPos(), st = cell.styles, halign = st.halign || 'left';
          var x = halign === 'center' ? cell.x + cell.width / 2 : halign === 'right' ? cell.x + cell.width - cell.padding('right') : pos.x;
          var color = cssColor(st.textColor);
          r.lines.slice(0, cell.text.length).forEach(function (line, i) {   // only the lines on this page
            if (line === '') return;
            drawRaster(doc, line, x, pos.y + (BASELINE_TOP + i * doc.getLineHeightFactor()) * r.size / k,
                       halign, r.size, r.style, color);
          });
        }
        if (userDraw) userDraw(data);
      }
    });
  }

  /**
   * Drop-in for doc.autoTable(options).  *config*: { colWidths: [..] in document units,
   * minColWidth } - only used when a cell needs the browser to draw it.
   */
  function autoTable(doc, options, config) {
    var opts = autoTableOptions(doc, options, config);
    if (opts === options) return doc.autoTable(options);
    var previous = doc.getLineHeightFactor();
    doc.setLineHeightFactor(RASTER_LINE_FACTOR);       // row heights and line pitch for every cell
    try { return doc.autoTable(opts); } finally { doc.setLineHeightFactor(previous); }
  }

  global.StelluraPdfText = {
    ready: ready, needsRaster: needsRaster, width: width, split: split, text: text,
    autoTable: autoTable, clusters: clusters, wrapLines: wrapLines
  };
})(typeof window !== 'undefined' ? window : this);
