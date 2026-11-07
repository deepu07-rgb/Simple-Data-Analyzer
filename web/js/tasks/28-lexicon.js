// =====================================================================
//  LEXICON  /  शब्दकोश  — one place that knows how the same word is written in Hindi and in English
//  Used by the spelling groups, the duplicate finder and Combine.
//    STL.lex.skeleton(text)          -> ["kml","ld"]   consonant skeleton of every word; Devanagari and Latin give the same skeleton
//    STL.lex.sameName(a, b)          -> true when two person names are the same name (script, spelling, initials, word order)
//    STL.lex.scriptPair(a, b)        -> true when one is Devanagari, the other Latin, and they sound the same
//    STL.lex.concept(key)            -> value key with Hindi words and office synonyms replaced by one English word
//    STL.lex.acronymOf(a, b)         -> true when a ("PWD") is the initials of b ("Public Works Department")
//    STL.lex.learn / learned         -> what the user told the app, kept on this computer for every later file
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL = root.STL || {}, L = STL.lex = {};
  function s(v) { return v == null ? '' : String(v); }

  // ------------------------------------------------------------ transliteration
  var DEV = /[ऀ-ॿ]/;
  L.isDev = function (t) { return DEV.test(s(t)); };
  var C = { 'क': 'k', 'ख': 'k', 'ग': 'g', 'घ': 'g', 'ङ': 'n', 'च': 'c', 'छ': 'c', 'ज': 'j', 'झ': 'j', 'ञ': 'n', 'ट': 't', 'ठ': 't', 'ड': 'd', 'ढ': 'd', 'ण': 'n', 'त': 't', 'थ': 't', 'द': 'd', 'ध': 'd', 'न': 'n', 'प': 'p', 'फ': 'p',
    'ब': 'b', 'भ': 'b', 'म': 'm', 'र': 'r', 'ल': 'l', 'ळ': 'l', 'व': 'v', 'श': 's', 'ष': 's', 'स': 's', 'ऋ': 'r', 'ृ': 'r', 'ं': 'N' };
  function devSkel(w) {
    w = w.replace(/ज्ञ/g, 'gn').replace(/क्ष/g, 'ks').replace(/त्र/g, 'tr').replace(/श्र/g, 'sr');
    var out = '';
    for (var i = 0; i < w.length; i++) {
      var ch = w[i], nx = w[i + 1];
      if ((ch === 'ड' || ch === 'ढ') && nx === '़') { out += 'R'; i++; continue; }                   // ड़ ढ़ are heard as r or d: Rathore/Rathod, Lodha/Lorha
      if (C[ch]) out += C[ch];
      else if (/[a-z]/.test(ch)) out += ch;
    }
    return out;
  }
  function latSkel(w) {
    w = w.normalize ? w.normalize('NFD').replace(/[̀-ͯ]/g, '') : w;
    w = w.toLowerCase().replace(/ksh/g, 'ks').replace(/chh/g, 'C').replace(/ch/g, 'C').replace(/sh/g, 's').replace(/ck/g, 'k').replace(/ngh/g, 'N').replace(/([kgtdbpj])h/g, '$1').replace(/rh/g, 'R');
    w = w.replace(/x/g, 'ks').replace(/q/g, 'k').replace(/w/g, 'v').replace(/z/g, 'j').replace(/f/g, 'p').replace(/c/g, 'k').replace(/C/g, 'c');
    return w.replace(/[aeiouyh]/g, '').replace(/[^a-zR]/g, '').replace(/(.)\1+/g, '$1');
  }
  function word(w) { return DEV.test(w) ? devSkel(w).replace(/(.)\1+/g, '$1') : latSkel(w); }
  function plain(t) {
    t = s(t); if (t.normalize) t = t.normalize('NFC');
    return t.replace(/[​-‍﻿]/g, '').toLowerCase().replace(/^\s*(shri|sh|smt|mr|mrs|ms|dr|श्री|श्रीमती|डॉ|कुमारी)\b\.?\s*/i, '').replace(/[._,;:()\[\]\/\\\-–—'"`’]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  L.skeleton = function (t) { return plain(t).split(' ').filter(Boolean).map(word).filter(Boolean); };
  // "N" (anusvara) may be n, m or silent; "R" may be r or d
  function eqSkel(a, b) {
    if (a === b) return true;
    if (!a) return /^N*$/.test(b); if (!b) return /^N*$/.test(a);
    var x = a[0], y = b[0];
    if (x === y || (x === 'R' && (y === 'r' || y === 'd')) || (y === 'R' && (x === 'r' || x === 'd')) || (x === 'N' && (y === 'n' || y === 'm')) || (y === 'N' && (x === 'n' || x === 'm'))) { if (eqSkel(a.slice(1), b.slice(1))) return true; }
    if (x === 'N' && eqSkel(a.slice(1), b)) return true; if (y === 'N' && eqSkel(a, b.slice(1))) return true;
    return false;
  }
  // 'n'/'m' before a consonant in Latin can stand for an anusvara that the other spelling omits ("Kanwar"/"Kawar"): allow one such drop
  function eqTok(a, b) {
    if (eqSkel(a, b)) return true;
    var longer = a.length >= b.length ? a : b, shorter = a.length >= b.length ? b : a;
    if (longer.length - shorter.length === 1 && shorter.length >= 3) { for (var i = 1; i < longer.length; i++) if ((longer[i] === 'n' || longer[i] === 'm') && eqSkel(longer.slice(0, i) + longer.slice(i + 1), shorter)) return true; }
    return false;
  }
  function tokensEqual(A, B, loose) {
    if (A.length !== B.length) return false;
    var ok = A.every(function (x, i) { return eqTok(x, B[i]); }); if (ok) return true;
    if (A.length > 1) {                                                                               // word order may differ
      var used = {}; return A.every(function (x) { for (var j = 0; j < B.length; j++) if (!used[j] && eqTok(x, B[j])) { used[j] = 1; return true; } return false; });
    }
    return false;
  }
  // a name reduced to words that are the same in either script ("Kamla Lodha" = "कमला लोढ़ा"); used to compare many rows quickly
  L.nameSig = function (t) { return L.skeleton(t).map(function (w) { return w.replace(/R/g, 'r').replace(/N/g, ''); }).filter(Boolean); };
  // for blocking places: also blind to nasals (हतुंडी = Hatundi = Hatudi)
  L.placeSig = function (t) { var a = L.skeleton(t).map(function (w) { return w.replace(/R/g, 'r').replace(/[Nnm]/g, ''); }).filter(Boolean); return a.length ? a : L.nameSig(t); };
  L.scriptPair = function (a, b) {
    if (L.isDev(a) === L.isDev(b)) return false;
    var A = L.skeleton(a), B = L.skeleton(b); if (!A.length || A.length !== B.length) return false;
    if (A.join('').length < 2) return false;
    return tokensEqual(A, B);
  };

  // person names: initials ("R.K." / "Ramesh Kumar"), dropped middle names, other script, other word order
  function initialsOf(t) { return plain(t).split(' ').filter(Boolean); }
  function nameTok(a, b) {                                                                             // one word of a name against one word of another
    if (a === b) return true;
    var ia = a.length === 1, ib = b.length === 1;
    if (ia || ib) {                                                                                   // an initial matches the first letter of a word
      var i1 = ia ? a : b, w2 = ia ? b : a; if (ia && ib) return false;
      if (!DEV.test(i1) && !DEV.test(w2)) return w2[0] === i1;
      var wi = word(i1), ww = word(w2); return !!wi && !!ww && ww[0] === wi[0];
    }
    return eqTok(word(a), word(b));
  }
  function editOne(a, b) {
    if (a === b) return true; var i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
    if (a.length === b.length) { if (a.slice(i + 1) === b.slice(i + 1)) return true; return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); }
    return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
  }
  L.sameName = function (a, b) {
    var A = initialsOf(a), B = initialsOf(b); if (!A.length || !B.length) return false;
    if (A.join(' ') === B.join(' ')) return true;
    var sa = L.skeleton(a), sb = L.skeleton(b);
    if (sa.length && sa.length === sb.length && sa.join('').length >= 3 && tokensEqual(sa, sb)) return true;
    // R K Chaudhary ~ Ramesh Kumar Chaudhary: every word of the shorter name is matched, in order, by a word of the longer one
    var sh = A.length <= B.length ? A : B, lo = A.length <= B.length ? B : A;
    if (sh.length < 2 && !(sh.length === 1 && lo.length === 1)) return false;
    var j = 0, hits = 0, full = 0;
    for (var i = 0; i < sh.length; i++) { var found = false; for (; j < lo.length; j++) if (nameTok(sh[i], lo[j])) { found = true; hits++; if (sh[i].length > 1) full++; j++; break; } if (!found) return false; }
    return hits === sh.length && full >= 1 && (lo.length - sh.length <= 2);
  };

  // ------------------------------------------------------------ office words, Hindi and English
  // each group is one meaning; words are compared after the same cleaning as the spelling groups
  var SYN = [
    ['pending', 'लंबित', 'लम्बित', 'पेंडिंग', 'under process', 'in process', 'in progress', 'processing', 'open', 'awaiting', 'under consideration', 'विचाराधीन', 'प्रक्रियाधीन'],
    ['disposed', 'निस्तारित', 'निस्तारण', 'निपटारा', 'निपटाया', 'closed', 'close', 'resolved', 'settled', 'redressed', 'completed', 'disposed off', 'disposed of', 'बंद', 'समाधान', 'समाधानित'],
    ['rejected', 'reject', 'खारिज', 'अस्वीकृत', 'declined', 'dismissed', 'refused', 'नामंजूर'],
    ['transferred', 'transfer', 'forwarded', 'referred', 'स्थानांतरित', 'अग्रेषित', 'प्रेषित'],
    ['approved', 'sanctioned', 'स्वीकृत', 'मंजूर', 'granted'],
    ['revenue', 'राजस्व', 'land revenue', 'भू राजस्व'],
    ['water supply', 'जलदाय', 'पेयजल', 'पानी', 'drinking water', 'phed', 'जल जीवन'],
    ['electricity', 'बिजली', 'विद्युत', 'power', 'discom', 'vidyut'],
    ['pension', 'पेंशन', 'social security', 'सामाजिक सुरक्षा', 'old age pension'],
    ['health', 'स्वास्थ्य', 'चिकित्सा', 'medical'],
    ['education', 'शिक्षा', 'school education', 'विद्यालय'],
    ['roads', 'सड़क', 'सड़कें', 'public works', 'pwd', 'लोक निर्माण', 'पीडब्ल्यूडी', 'पीडब्लूडी'],
    ['food supplies', 'खाद्य', 'ration', 'राशन', 'civil supplies', 'खाद्य एवं नागरिक आपूर्ति'],
    ['police', 'पुलिस', 'law and order'],
    ['yes', 'हाँ', 'हां', 'y'], ['no', 'नहीं', 'n'],
    ['male', 'पुरुष', 'm', 'man'], ['female', 'महिला', 'f', 'woman'],
    ['urban', 'शहरी', 'city', 'nagar'], ['rural', 'ग्रामीण', 'gramin'],
    ['january', 'jan', 'जनवरी'], ['february', 'feb', 'फरवरी', 'फ़रवरी'], ['march', 'mar', 'मार्च'], ['april', 'apr', 'अप्रैल'], ['may', 'मई'], ['june', 'jun', 'जून'], ['july', 'jul', 'जुलाई'], ['august', 'aug', 'अगस्त'],
    ['september', 'sep', 'sept', 'सितंबर', 'सितम्बर'], ['october', 'oct', 'अक्टूबर', 'अक्तूबर'], ['november', 'nov', 'नवंबर', 'नवम्बर'], ['december', 'dec', 'दिसंबर', 'दिसम्बर']
  ];
  function skey(v) { return plain(v).replace(/\b(dept|department|office|the|of|and)\b/g, ' ').replace(/\s+/g, ' ').trim(); }
  var CON = {};
  SYN.forEach(function (g) { g.forEach(function (w) { var k = skey(w); if (k && CON[k] === undefined) CON[k] = g[0]; }); });
  var PHRASES = Object.keys(CON).filter(function (k) { return k.indexOf(' ') > 0; }).sort(function (a, b) { return b.length - a.length; }).map(function (k) { return [k, CON[k]]; });
  L.concept = function (key) {
    var k = skey(key); if (!k) return '';
    var mem = L.learned(k); if (mem) k = mem;
    if (CON[k] !== undefined) return CON[k];
    PHRASES.forEach(function (ph) { k = (' ' + k + ' ').replace(new RegExp(' ' + ph[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?= )'), ' ' + ph[1]).trim(); });      // "public works roads" -> "roads"
    var seen = {}; return k.split(' ').map(function (w) { return CON[w] !== undefined && w.length > 2 ? CON[w] : w; }).filter(function (w) { if (seen[w]) return false; seen[w] = 1; return true; }).join(' ');
  };
  // PWD ~ Public Works (Roads) / Public Works Department
  L.acronymOf = function (a, b) {
    a = s(a).trim(); if (!/^[A-Za-z.\s]{2,8}$/.test(a) || a !== a.toUpperCase() || /\s\S+\s\S+\s\S/.test(a)) return false;
    var ac = a.toLowerCase().replace(/[^a-z]/g, ''); if (ac.length < 2) return false;
    var ws = plain(b).split(' ').filter(Boolean), ini = ws.map(function (w) { return w[0]; }).join('');
    if (ws.length < 2 || ac.length > ws.length + 1) return false;
    var base = /d$/.test(ac) && ac.length >= 3 ? ac.slice(0, -1) : ac;
    return ini.indexOf(base) >= 0 && base.length >= 2;
  };

  // ------------------------------------------------------------ what the user taught the app (kept on this computer)
  var KEY = 'stellura_learned_v1', mem = null;
  function load() { if (mem) return mem; mem = { values: {}, columns: [] }; try { var j = JSON.parse(root.localStorage.getItem(KEY) || 'null'); if (j && j.values) mem = j; } catch (e) {} return mem; }
  function save() { try { root.localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) {} }
  L.learned = function (k) { var m = load(); return Object.prototype.hasOwnProperty.call(m.values, k) ? m.values[k] : undefined; };
  // pairs of [variant, chosen]: next time "Closed" is offered as "Disposed" without asking
  L.learn = function (pairs) {
    var m = load(), n = 0; (pairs || []).forEach(function (p) { var a = skey(p[0]), b = skey(p[1]); if (!a || !b || a === b || a.length > 60) return; m.values[a] = m.values[b] || b; n++; });
    if (n) save(); return n;
  };
  L.learnColumn = function (a, b) { var m = load(); a = skey(a); b = skey(b); if (!a || !b || a === b) return; for (var i = 0; i < m.columns.length; i++) if ((m.columns[i][0] === a && m.columns[i][1] === b) || (m.columns[i][0] === b && m.columns[i][1] === a)) return; m.columns.push([a, b]); save(); };
  L.columnLearned = function (a, b) { var m = load(); a = skey(a); b = skey(b); return m.columns.some(function (p) { return (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a); }); };
  L.forget = function () { mem = { values: {}, columns: [] }; save(); };
  L.count = function () { var m = load(); return Object.keys(m.values).length + m.columns.length; };
  L._reset = function () { mem = null; };
})(typeof window !== 'undefined' ? window : globalThis);
