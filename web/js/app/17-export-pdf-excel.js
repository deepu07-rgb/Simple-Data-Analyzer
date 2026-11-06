// =====================================================================
//  EXPORT: EXCEL
// =====================================================================
function showExportExcelDialog() {
  if (rawData.length === 0) { toast('No data to export', 'error'); return; }
  showModal('excelModal');
}

function executeExcelExport() {
  closeModal('excelModal');
  const filename = document.getElementById('excelFilename').value || 'data_export';
  const freezeHeader = document.getElementById('excelFreezeHeader').checked;
  const includeFormat = document.getElementById('excelIncludeFormat').checked;
  const includeLogo = document.getElementById('excelIncludeLogo') ? document.getElementById('excelIncludeLogo').checked : true;
  const includeProfile = document.getElementById('excelIncludeProfile') ? document.getElementById('excelIncludeProfile').checked : false;
  const paperSize = document.getElementById('excelPaperSize') ? document.getElementById('excelPaperSize').value : 'a4';
  const orientation = document.getElementById('excelOrientation') ? document.getElementById('excelOrientation').value : 'landscape';

  const displayData = getDisplayData();
  const indices = displayData;
  const tableData = displayData.map(ri => headers.map((_, ci) => String(rawData[ri][ci] != null ? rawData[ri][ci] : '')));

  // Extract conditional formatting colors
  const cfColors = {};
  if (includeFormat) {
    indices.forEach((ri, exportRowIdx) => {
      headers.forEach((_, ci) => {
        for (const rule of cfRules) {
          if (rule.col !== ci) continue;
          const val = String(rawData[ri][ci] == null ? '' : rawData[ri][ci]);
          const numVal = parseFloat(val);
          let match = false;
          switch(rule.cond) {
            case 'gt': match = !isNaN(numVal) && numVal > parseFloat(rule.value); break;
            case 'lt': match = !isNaN(numVal) && numVal < parseFloat(rule.value); break;
            case 'eq': match = val === rule.value; break;
            case 'neq': match = val !== rule.value; break;
            case 'contains': match = val.toLowerCase().includes(rule.value.toLowerCase()); break;
            case 'between': { const [mn,mx]=[parseFloat(rule.value),parseFloat(rule.value2)]; match=!isNaN(numVal)&&numVal>=mn&&numVal<=mx; break; }
          }
          if (match) cfColors[`${exportRowIdx}:${ci}`] = rule.color;
        }
      });
    });
  }

  // Build cell-level formatting payloads (re-indexed to export row order)
  function buildPayload(src) {
    const out = {};
    indices.forEach((ri, exportRowIdx) => {
      headers.forEach((_, ci) => {
        const srcKey = `${ri}:${ci}`;
        const dstKey = `${exportRowIdx}:${ci}`;
        if (src[srcKey] !== undefined) out[dstKey] = src[srcKey];
      });
    });
    return out;
  }

  const payload = {
    headers,
    data: tableData,
    title: filename,
    filename,
    freezeHeader,
    includeLogo,
    includeProfile,
    paperSize,
    orientation,
    conditionalFormatting: cfColors,
    cellFonts: buildPayload(typeof cellFonts !== 'undefined' ? cellFonts : {}),
    cellBold: buildPayload(typeof cellBold !== 'undefined' ? cellBold : {}),
    cellItalic: buildPayload(typeof cellItalic !== 'undefined' ? cellItalic : {}),
    cellUnderline: buildPayload(typeof cellUnderline !== 'undefined' ? cellUnderline : {}),
    cellFontSize: buildPayload(typeof cellFontSize !== 'undefined' ? cellFontSize : {}),
    cellFontColor: buildPayload(typeof cellFontColor !== 'undefined' ? cellFontColor : {}),
    cellBgColor: buildPayload(typeof cellBgColor !== 'undefined' ? cellBgColor : {}),
    cellAlignments: buildPayload(typeof cellAlignments !== 'undefined' ? cellAlignments : {}),
    cellWraps: buildPayload(typeof cellWraps !== 'undefined' ? cellWraps : {}),
    userProfile: (includeProfile && typeof userProfile !== 'undefined') ? userProfile : {}
  };

  if (window.location.protocol === 'file:') {
    generateClientExcel(filename, freezeHeader, includeFormat, indices);
    return;
  }

  const useAsync = indices.length >= 1000;
  if (useAsync) showExportProgress('Generating Excel…');
  else toast('Generating Excel on server...', 'info');

  const dlName = `${filename}.xlsx`;

  fetch('/api/export/excel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({}, payload, { async: useAsync }))
  })
  .then(resp => {
    if (!resp.ok) throw new Error('Server Excel generation failed');
    const ct = resp.headers.get('Content-Type') || '';
    if (ct.includes('application/json')) {
      return resp.json().then(d => {
        if (d.job_id) { pollExportJob(d.job_id, dlName); return null; }
        throw new Error(d.error || 'Unknown error');
      });
    }
    return resp.blob();
  })
  .then(blob => {
    if (!blob) return;
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = dlName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast('Excel downloaded successfully', 'success');
  })
  .catch(err => {
    if (useAsync) hideExportProgress();
    console.warn('Backend Excel failed, falling back to client Excel', err);
    generateClientExcel(filename, freezeHeader, includeFormat, indices);
  });
}

function generateClientExcel(filename, freezeHeader, includeFormat, indices) {
  const wb = XLSX.utils.book_new();
  const data = [headers, ...indices.map(ri => rawData[ri])];
  const ws = XLSX.utils.aoa_to_sheet(data);

  const colWidthArr = headers.map((h, ci) => {
    let maxLen = h.length;
    indices.slice(0, 100).forEach(ri => {
      const len = String(rawData[ri][ci] == null ? '' : rawData[ri][ci]).length;
      if (len > maxLen) maxLen = len;
    });
    return { wch: Math.min(maxLen + 2, 40) };
  });
  ws['!cols'] = colWidthArr;

  if (freezeHeader) {
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  }

  if (includeFormat && cfRules.length > 0) {
    indices.forEach((ri, rowIdx) => {
      headers.forEach((_, ci) => {
        for (const rule of cfRules) {
          if (rule.col !== ci) continue;
          const val = String(rawData[ri][ci] == null ? '' : rawData[ri][ci]);
          const numVal = parseFloat(val);
          const ruleNum = parseFloat(rule.value);
          let match = false;
          switch(rule.cond) {
            case 'gt': match = !isNaN(numVal) && numVal > ruleNum; break;
            case 'lt': match = !isNaN(numVal) && numVal < ruleNum; break;
            case 'eq': match = val === rule.value; break;
            case 'contains': match = val.toLowerCase().includes(rule.value.toLowerCase()); break;
          }
          if (match) {
            const cellRef = XLSX.utils.encode_cell({ r: rowIdx + 1, c: ci });
            if (!ws[cellRef]) ws[cellRef] = { v: val, t: 's' };
            ws[cellRef].s = {
              fill: { fgColor: { rgb: rule.color.replace('#', '') } },
              font: { color: { rgb: 'FFFFFF' } }
            };
          }
        }
      });
    });
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, filename + '.xlsx');
  toast('Excel exported successfully (local)', 'success');
}

// =====================================================================
//  HINDI FONT CONVERSION — COMPLETE KRUTIDEV/DEVLYS/UNICODE
// =====================================================================

// The DEFINITIVE Krutidev-to-Unicode conversion table
// Based on standard conversion mappings used by Indian government offices
const KRUTIDEV_TO_UNICODE_MAP = [
  // 4+ character sequences (must come first)
  ['vkSj', 'और'], ['vksa', 'ओं'],
  // 3-character vowel sequences
  ['vks', 'ओ'], ['vkS', 'औ'], ['vkW', 'ऑ'], ['vk¡', 'आँ'], ['vka', 'आं'],
  // Multi-char consonant conjuncts (3-char)
  ['Ùkk', 'त्ता'], ['Ùks', 'त्ते'], ['ÙkS', 'त्तै'], ['Ùk', 'त्त'],
  ['{kk', 'क्षा'], ['{ks', 'क्षे'], ['{kS', 'क्षै'], ['{k', 'क्ष'],
  // Nukta forms (3-char)
  ['Kkk', 'ग़ा'], ['Kks', 'ग़े'],
  // 2-char vowel sequences
  ['vk', 'आ'], ['bZ', 'ई'], ['b±', 'ईं'], ['b¡', 'इँ'],
  [',s', 'ऐ'], [',¡', 'एँ'],
  // 2-char consonant combinations
  ['[k', 'ख'], ['?k', 'घ'], ['>k', 'झ'], ['Nk', 'छ'],
  ['Fk', 'थ'], ['èk', 'ध'], ['Hk', 'भ'], ['.k', 'ण'],
  ['\'k', 'श'], ['"k', 'ष'],
  // Nukta consonants
  ['d+', 'क़'], ['[+', 'ख़'], ['x+', 'ग़'], ['T+', 'ज़'], ['Q+', 'फ़'],
  ['M+', 'ड़'], ['<+', 'ढ़'],
  // Important conjuncts (2-char)
  ['Dd', 'क्क'], ['ä', 'क्क'],
  ['Ùk', 'त्त'],
  ['Í', 'द्य'], ['Ì', 'द्द'], ['í', 'क्त'],
  ['ê', 'न्न'], ['é', 'द्म'], ['â', 'श्व'],
  ['à', 'ट्ट'], ['Ë', 'द्व'], ['ñ', 'स्व'],
  ['Ê', 'न्न'],
  ['Ü', 'द्ध'], ['Ù', 'त्त'],
  ['D;', 'क्य'], ['Ñ', 'कृ'],
  ['Á', 'प्र'], ['ç', 'प्र'], ['Ø', 'फ्र'],
  ['Ð', 'ह्र'], ['–', 'ह्म'],
  ['J', 'श्र'],
  ['K', 'ज्ञ'], ['«', 'त्र'],
  ['nz', 'द्र'], ['æ', 'द्र'],
  // Matra combinations (2-char — must come before single matras)
  ['ks', 'ो'], ['kS', 'ौ'], ['ká', 'ॉ'],
  // Single-char vowels
  ['v', 'अ'], ['b', 'इ'], ['m', 'उ'], ['Å', 'ऊ'],
  [',', 'ए'], ['_', 'ऋ'],
  // Single-char consonants
  ['d', 'क'], ['x', 'ग'], ['Ä', 'ङ'],
  ['p', 'च'], ['N', 'छ'], ['t', 'ज'], ['>', 'झ'], ['¥', 'ञ'],
  ['V', 'ट'], ['B', 'ठ'], ['M', 'ड'], ['<', 'ढ'],
  ['r', 'त'], ['n', 'द'], ['u', 'न'],
  ['i', 'प'], ['Q', 'फ'], ['c', 'ब'], ['e', 'म'],
  [';', 'य'], ['j', 'र'], ['y', 'ल'], ['o', 'व'],
  ['l', 'स'], ['g', 'ह'],
  // Matras (single-char)
  ['k', 'ा'], ['q', 'ु'], ['w', 'ू'],
  ['`', 'ृ'], ['s', 'े'], ['S', 'ै'],
  // Anusvara, Chandrabindu, Visarga
  ['a', 'ं'], ['%', 'ँ'], ['¡', 'ँ'], [':', 'ः'],
  // Halant
  ['~', '्'],
  // Avagraha
  ['A', 'ऽ'],
  // Special
  ['\\', 'ॅ'],
  ['|', '।'],
  // Numerals
  ['0', '०'], ['1', '१'], ['2', '२'], ['3', '३'], ['4', '४'],
  ['5', '५'], ['6', '६'], ['7', '७'], ['8', '८'], ['9', '९'],
  // Reph (Z = half-ra / reph sign above)
  ['z', '्र'],
  ['Z', 'र्'],
];

// Build Unicode → Krutidev reverse map
function buildReverseMap() {
  const rev = [];
  KRUTIDEV_TO_UNICODE_MAP.forEach(([k, u]) => {
    rev.push([u, k]);
  });
  // Sort by Unicode length descending for proper matching
  rev.sort((a, b) => b[0].length - a[0].length);
  return rev;
}

const UNICODE_TO_KRUTIDEV_MAP = buildReverseMap();

function convertKrutidevToUnicode(str) {
  if (!str) return str;

  let result = str;

  // Step 1: Handle the 'f' (ि matra) repositioning
  // In Krutidev, 'f' appears BEFORE the consonant but in Unicode ि comes AFTER
  // We need to find 'f' followed by one or more Krutidev consonant chars and reposition
  // First, mark 'f' positions with a unique placeholder
  // The pattern: 'f' followed by Krutidev consonant sequence, then move 'f' content after

  // Preprocess: handle 'f' (ि matra) — move it after the next consonant group
  // In Krutidev text like "fgUnh" → "हिन्दी"
  // 'f' before 'g' means the ि goes after the ह

  // We do 'f' handling AFTER the main conversion by pre-inserting a placeholder
  const F_PLACEHOLDER = '\uE000'; // Private Use Area character
  result = result.replace(/f/g, F_PLACEHOLDER);

  // Step 2: Sort map by key length (descending) and apply replacements
  const sortedMap = [...KRUTIDEV_TO_UNICODE_MAP].sort((a, b) => b[0].length - a[0].length);

  for (const [from, to] of sortedMap) {
    if (result.includes(from)) {
      result = result.split(from).join(to);
    }
  }

  // Step 3: Reposition ि matra (the F_PLACEHOLDER)
  // The placeholder should now be followed by a converted Unicode consonant
  // We move it to after the consonant
  let final = '';
  for (let i = 0; i < result.length; i++) {
    if (result[i] === F_PLACEHOLDER) {
      // Look ahead for the next consonant (Devanagari range 0x0915-0x0939, or a conjunct)
      // Collect the next consonant + any halant-consonant sequence
      let consonantGroup = '';
      let j = i + 1;
      while (j < result.length) {
        const code = result.charCodeAt(j);
        // Devanagari consonant range
        if ((code >= 0x0915 && code <= 0x0939) || code === 0x0958 || code === 0x0959 ||
            code === 0x095A || code === 0x095B || code === 0x095C || code === 0x095D ||
            code === 0x095E || code === 0x095F) {
          consonantGroup += result[j];
          j++;
          // Check if followed by halant (virama) + another consonant
          if (j < result.length && result.charCodeAt(j) === 0x094D) {
            consonantGroup += result[j]; // halant
            j++;
            continue; // loop to catch next consonant
          }
          break;
        } else if (consonantGroup === '' && (code < 0x0900 || code > 0x097F)) {
          // Non-Devanagari char before any consonant found — place ि here
          consonantGroup = result[j];
          j++;
          break;
        } else {
          break;
        }
      }
      if (consonantGroup) {
        final += consonantGroup + 'ि';
        i = j - 1;
      } else {
        final += 'ि';
      }
    } else {
      final += result[i];
    }
  }

  return final;
}

function convertUnicodeToKrutidev(str) {
  if (!str) return str;

  let result = str;

  // Step 1: Handle ि (reverse repositioning)
  // In Unicode, ि comes after consonant. In Krutidev, 'f' comes before.
  // Find consonant+ि patterns and move 'f' before consonant
  result = result.replace(/([\u0915-\u0939\u0958-\u095F](?:\u094D[\u0915-\u0939\u0958-\u095F])*)ि/g, function(match, consonants) {
    return 'f' + consonants;
  });

  // Step 2: Apply Unicode→Krutidev replacement
  for (const [from, to] of UNICODE_TO_KRUTIDEV_MAP) {
    if (result.includes(from)) {
      result = result.split(from).join(to);
    }
  }

  return result;
}

// Auto-detect encoding
function detectEncoding(text) {
  if (!text || text.length === 0) return 'unknown';

  let unicodeCount = 0;
  let asciiHigh = 0;
  let normalAscii = 0;

  for (let i = 0; i < Math.min(text.length, 500); i++) {
    const code = text.charCodeAt(i);
    if (code >= 0x0900 && code <= 0x097F) {
      unicodeCount++;
    } else if (code >= 128 && code <= 255) {
      asciiHigh++;
    } else if (code >= 32 && code <= 126) {
      normalAscii++;
    }
  }

  const total = text.length;
  if (unicodeCount / total > 0.15) return 'unicode';
  if (asciiHigh / total > 0.05) return 'krutidev'; // Krutidev and Devlys use high ASCII

  // Check for common Krutidev patterns
  const krutidevPatterns = ['vk', 'bZ', '[k', '?k', 'Fk', 'èk', 'Hk', '.k', '>k', '{k', 'Ùk'];
  let patternMatch = 0;
  krutidevPatterns.forEach(p => { if (text.includes(p)) patternMatch++; });
  if (patternMatch >= 2) return 'krutidev';

  return 'unknown';
}

function checkHindiEncodingInData() {
  if (!rawData || rawData.length === 0) return;
  let krutidevCells = 0;
  let unicodeHindiCells = 0;
  const sampleRows = rawData.slice(0, Math.min(rawData.length, 100));
  sampleRows.forEach(row => {
    row.forEach(cell => {
      const val = String(cell || '').trim();
      if (val.length < 3) return;
      const enc = detectEncoding(val);
      if (enc === 'unicode') unicodeHindiCells++;
      else if (enc === 'krutidev') krutidevCells++;
    });
  });
  if (krutidevCells >= 3) {
    setTimeout(() => toast(
      `Krutidev/Devlys Hindi detected in ${krutidevCells} cells. Use Hindi panel → Convert to Unicode, or select cells and set Krutidev 010 font.`,
      'info'
    ), 1200);
  }
}

function convertHindi() {
  const src = document.getElementById('hindiSrcFont').value;
  const tgt = document.getElementById('hindiTgtFont').value;
  const colSel = document.getElementById('hindiCol').value;

  if (src === tgt) { toast('Source and target are the same', 'error'); return; }
  if (rawData.length === 0) { toast('Import data first', 'error'); return; }

  pushUndo();

  const cols = colSel === 'all'
    ? headers.map((_, i) => i).filter(i => colTypes[i] === 'text')
    : [parseInt(colSel)];

  let converted = 0;
  cols.forEach(ci => {
    rawData.forEach(row => {
      const original = String(row[ci] == null ? '' : row[ci]);
      if (!original.trim()) return;

      let actualSrc = src;
      if (src === 'auto') {
        actualSrc = detectEncoding(original);
        if (actualSrc === 'unknown') return;
      }

      let result = original;
      if ((actualSrc === 'krutidev' || actualSrc === 'devlys') && tgt === 'unicode') {
        result = convertKrutidevToUnicode(original);
      } else if (actualSrc === 'unicode' && (tgt === 'krutidev' || tgt === 'devlys')) {
        result = convertUnicodeToKrutidev(original);
      }

      if (result !== original) {
        row[ci] = result;
        converted++;
      }
    });
  });

  renderTable();
  toast(`Converted ${converted} cells from ${src} to ${tgt}`, 'success');
}

function testHindiConversion() {
  const input = document.getElementById('hindiTestInput').value;
  const src = document.getElementById('hindiSrcFont').value;
  const tgt = document.getElementById('hindiTgtFont').value;

  let actualSrc = src;
  if (src === 'auto') {
    actualSrc = detectEncoding(input);
    if (actualSrc === 'unknown') actualSrc = 'krutidev';
  }

  let result = input;
  if ((actualSrc === 'krutidev' || actualSrc === 'devlys') && tgt === 'unicode') {
    result = convertKrutidevToUnicode(input);
  } else if (actualSrc === 'unicode' && (tgt === 'krutidev' || tgt === 'devlys')) {
    result = convertUnicodeToKrutidev(input);
  }

  document.getElementById('hindiTestOutput').value = result;
}

