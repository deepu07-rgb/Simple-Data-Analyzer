// =====================================================================
//  NAME MATCH ACROSS SCRIPTS  /  नाम मिलान
//  Finds the same person written differently: "राहुल शर्मा", "Rahul Sharma", "Rahul Sarma".
//  Rule-based and explainable (no AI model): Devanagari is turned into a Roman "sound form",
//  names are compared token by token, and father's name / village / age / mobile raise or lower
//  the confidence. Every pair carries a score and a reason; people always confirm.
//
//    STL.names.sound(text)               -> sound form used for comparison
//    STL.names.score(a, b)               -> 0..1 similarity of two names
//    STL.names.findDuplicates(rows, cols, opts)  -> { pairs, groups }
//    STL.names.matchLists(rowsA, rowsB, cols, opts) -> { pairs }
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL = root.STL || {};
  var N = STL.names = {};
  function s(v) { return v == null ? '' : String(v); }

  // ------------------------------------------------------------ Devanagari -> Roman
  var IND_VOWEL = { 'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऑ': 'o', 'ऍ': 'e' };
  var CONS = { 'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n', 'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
    'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n', 'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
    'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v',
    'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h', 'ळ': 'l' };
  var NUKTA = { 'क': 'q', 'ख': 'kh', 'ग': 'g', 'ज': 'z', 'ड': 'r', 'ढ': 'rh', 'फ': 'f' };
  var MATRA = { 'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o', 'ॅ': 'e' };
  var VIRAMA = '्', NUKTA_CH = '़';

  // Devanagari word -> Roman letters (schwa kept inside the word, dropped at the end)
  function romanize(word) {
    var out = '', i = 0, chars = Array.from(word.normalize('NFC').replace(/क़/g, 'क़').replace(/ख़/g, 'ख़').replace(/ग़/g, 'ग़').replace(/ज़/g, 'ज़').replace(/ड़/g, 'ड़').replace(/ढ़/g, 'ढ़').replace(/फ़/g, 'फ़'));
    while (i < chars.length) {
      var c = chars[i], nx = chars[i + 1];
      if (IND_VOWEL[c] !== undefined) { out += IND_VOWEL[c]; i++; continue; }
      if (CONS[c] !== undefined) {
        // conjuncts with their own sound
        if (c === 'क' && nx === VIRAMA && chars[i + 2] === 'ष') { out += 'ksh'; i += 3; nx = chars[i]; if (nx && (MATRA[nx] !== undefined)) { out += MATRA[nx]; i++; } else if (nx !== VIRAMA && nx !== undefined && !isSign(nx)) out += 'a'; else if (nx === undefined) { /* word end: schwa dropped */ } continue; }
        if (c === 'ज' && nx === VIRAMA && chars[i + 2] === 'ञ') { out += 'gy'; i += 3; nx = chars[i]; if (nx && MATRA[nx] !== undefined) { out += MATRA[nx]; i++; } else if (nx !== undefined && nx !== VIRAMA && !isSign(nx)) out += 'a'; continue; }
        var base = CONS[c];
        if (nx === NUKTA_CH) { base = NUKTA[c] || base; i++; nx = chars[i + 1]; }
        out += base;
        var m = chars[i + 1];
        if (m === VIRAMA) { i += 2; continue; }                      // no vowel: conjunct follows
        if (m !== undefined && MATRA[m] !== undefined) { out += MATRA[m]; i += 2; continue; }
        // inherent 'a' (dropped at the end of a word)
        if (i + 1 < chars.length && !isSign(m)) out += 'a';
        else if (i + 1 < chars.length && isSign(m)) out += 'a';
        i++; continue;
      }
      if (c === 'ं' || c === 'ँ') { out += 'n'; i++; continue; }
      if (c === 'ः') { out += 'h'; i++; continue; }
      if (c === '॰' || c === '.') { i++; continue; }
      if (/[०-९]/.test(c)) { out += String(c.charCodeAt(0) - 0x0966); i++; continue; }
      out += c; i++;
    }
    return out;
  }
  function isSign(ch) { return ch === 'ं' || ch === 'ँ' || ch === 'ः'; }

  // ------------------------------------------------------------ sound form
  var HONOR = { shri: 1, shree: 1, sri: 1, shrimati: 1, smt: 1, sh: 1, kumari: 0, mr: 1, mrs: 1, ms: 1, dr: 1, doctor: 1, late: 1, lt: 1, 'श्री': 1, 'श्रीमती': 1, 'डॉ': 1, 'स्व': 1, 'स्वर्गीय': 1, 'सुश्री': 1, 'मिस्टर': 1, 'मैडम': 1 };
  var ABBREV = { md: 'mhmd', mohd: 'mhmd', mhd: 'mhmd', mohammad: 'mhmd', mohammed: 'mhmd', mohamad: 'mhmd', muhammad: 'mhmd', muhammed: 'mhmd', mohamed: 'mhmd', mohmmad: 'mhmd', mahomed: 'mhmd' };

  // Roman letters -> small set of sound symbols so spelling variants fall together
  function soundOf(rom) {
    var t = rom.toLowerCase();
    t = t.replace(/[^a-z0-9]/g, '');
    t = t.replace(/ksh|x/g, 'ks').replace(/chh|ch|tch/g, 'C').replace(/sh|ss(?=h)/g, 'S').replace(/ngh/g, 'nh').replace(/kh/g, 'K').replace(/gh/g, 'G').replace(/jh/g, 'J')
         .replace(/th/g, 'T').replace(/dh/g, 'D').replace(/ph|f/g, 'F').replace(/bh/g, 'B').replace(/gya|gny|gn/g, 'gy').replace(/ck|q|c/g, 'k').replace(/w/g, 'v').replace(/z/g, 'j');
    t = t.replace(/ya$/, 'y');                                          // Kshatriya / क्षत्रिय: the final -a after y is often not written
    t = t.replace(/(ee|ii|ie|ea|y$)/g, 'i').replace(/(oo|uu|ou)/g, 'u').replace(/(aa|ah$)/g, 'a').replace(/(ai|ay|ae|ei)/g, 'e').replace(/au|aw/g, 'o');
    t = t.replace(/(.)\1+/g, '$1');                                   // double letters
    if (t.length >= 5) t = t.replace(/([^aeiou])e$/, '$1');            // silent final e: Rathore / राठौड़
    t = t.replace(/S/g, 's');                                          // sh and s fall together ("Sharma" / "Sarma")
    return t;
  }
  function skeleton(sound) { return sound.replace(/[aeiouhH]/g, '').replace(/(.)\1+/g, '$1'); }

  function tokens(name) {
    var raw = s(name).normalize('NFC').replace(/[​-‍﻿]/g, '').replace(/[._,;:()\-\/\\]+/g, ' ').trim();
    var out = [];
    raw.split(/\s+/).forEach(function (w) {
      if (!w) return;
      var lw = w.toLowerCase();
      if (HONOR[lw] === 1) return;
      var rom = /[ऀ-ॿ]/.test(w) ? romanize(w) : lw;
      var base = rom.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!base) return;
      var snd = ABBREV[base] ? ABBREV[base] : soundOf(base);
      out.push({ raw: w, rom: base, sound: snd, skel: skeleton(snd), initial: base.length === 1 && !/[ऀ-ॿ]/.test(w) || (/[ऀ-ॿ]/.test(w) && Array.from(w.replace(/[^ऀ-ॿ]/g, '')).length <= 1) });
    });
    return out;
  }
  N.tokens = tokens;
  N.sound = function (text) { return tokens(text).map(function (t) { return t.sound; }).join(' '); };
  N.romanize = function (text) { return s(text).split(/\s+/).map(function (w) { return /[ऀ-ॿ]/.test(w) ? romanize(w) : w; }).join(' '); };

  // ------------------------------------------------------------ similarity
  function lev(a, b) {
    if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur[0] = i;
      for (j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      var t = prev; prev = cur; cur = t;
    }
    return prev[b.length];
  }
  function tokSim(x, y) {
    if (x.sound === y.sound) return 1;
    if (x.initial || y.initial) return (x.sound[0] === y.sound[0]) ? 0.8 : 0;
    var d1 = 1 - lev(x.sound, y.sound) / Math.max(x.sound.length, y.sound.length);
    var sk = (x.skel && x.skel === y.skel && x.skel.length >= 3) ? 0.88 : 0;      // same consonants, different vowels
    var d3 = 1 - lev(x.skel, y.skel) / Math.max(x.skel.length, y.skel.length, 1);
    return Math.max(d1, sk, d3 * 0.8);
  }
  // returns {score, reason}
  N.nameScore = function (a, b) {
    var A = tokens(a), B = tokens(b);
    if (!A.length || !B.length) return { score: 0, reason: 'blank' };
    var short = A.length <= B.length ? A : B, long = A.length <= B.length ? B : A;
    var used = {}, total = 0, minSim = 1;
    short.forEach(function (t) {
      var best = 0, bi = -1;
      long.forEach(function (u, i) { if (used[i]) return; var v = tokSim(t, u); if (v > best) { best = v; bi = i; } });
      if (bi >= 0) { used[bi] = true; total += best; if (!t.initial && t.sound.length >= 3 && best < minSim) minSim = best; }
    });
    var avg = total / short.length;
    var coverage = short.length / long.length;
    var score;
    if (short.length === long.length) score = avg;
    else score = avg * (0.55 + 0.45 * coverage);                              // one name has extra words: lower, never auto
    // a shared surname must not hide a different first name ("Anil Gupta" / "Sunil Gupta")
    if (short.length >= 2 && minSim < 0.8) score = Math.min(score, 0.4 + 0.5 * minSim);
    var reason = score >= 0.97 ? 'same sound' : (score >= 0.85 ? 'similar sound' : (short.length < long.length && avg > 0.9 ? 'one name has extra words' : 'weak'));
    return { score: Math.max(0, Math.min(1, score)), reason: reason };
  };
  N.score = function (a, b) { return N.nameScore(a, b).score; };

  // supporting evidence
  function digits(v) { return s(v).replace(/[०-९]/g, function (c) { return String(c.charCodeAt(0) - 0x0966); }).replace(/\D/g, ''); }
  function combine(rowA, rowB, cols) {
    var main = N.nameScore(rowA[cols.name], rowB[cols.name]);
    var score = main.score, reasons = [main.reason];
    if (cols.father !== undefined && cols.father >= 0 && s(rowA[cols.father]).trim() && s(rowB[cols.father]).trim()) {
      var f = N.nameScore(rowA[cols.father], rowB[cols.father]).score;
      score = 0.65 * score + 0.35 * f;
      reasons.push(f >= 0.85 ? "father's name matches" : (f < 0.6 ? "father's name differs" : "father's name similar"));
    }
    if (cols.village !== undefined && cols.village >= 0 && s(rowA[cols.village]).trim() && s(rowB[cols.village]).trim()) {
      var v = N.nameScore(rowA[cols.village], rowB[cols.village]).score;
      if (v >= 0.85) { score = Math.min(1, score + 0.04); reasons.push('same place'); } else if (v < 0.5) { score *= 0.9; reasons.push('different place'); }
    }
    if (cols.age !== undefined && cols.age >= 0) {
      var a1 = parseFloat(digits(rowA[cols.age])), a2 = parseFloat(digits(rowB[cols.age]));
      if (isFinite(a1) && isFinite(a2)) { var d = Math.abs(a1 - a2); if (d <= 1) reasons.push('same age'); else if (d > 5) { score *= 0.8; reasons.push('ages differ'); } }
    }
    if (cols.mobile !== undefined && cols.mobile >= 0) {
      var m1 = digits(rowA[cols.mobile]).slice(-10), m2 = digits(rowB[cols.mobile]).slice(-10);
      if (m1.length === 10 && m1 === m2 && main.score >= 0.6) { score = Math.max(score, 0.95); reasons.push('same mobile number'); }
    }
    return { score: Math.max(0, Math.min(1, score)), reasons: reasons };
  }
  N.compareRows = combine;

  // ------------------------------------------------------------ candidate search
  function recordKeys(name) {
    var T = tokens(name).filter(function (t) { return !t.initial; });
    if (!T.length) return [];
    var first = T[0].skel.slice(0, 3), last = T[T.length - 1].skel.slice(0, 3), keys = {};
    keys[first + '|' + last] = 1;
    if (T.length === 1) keys[first] = 1;
    T.forEach(function (t) { if (t.skel.length >= 4) keys['t:' + t.skel.slice(0, 4)] = 1; });     // rare tokens only
    return Object.keys(keys);
  }
  function buildIndex(rows, col) {
    var idx = {};
    rows.forEach(function (r, i) { recordKeys(r[col]).forEach(function (k) { (idx[k] = idx[k] || []).push(i); }); });
    return idx;
  }
  var BUCKET_MAX = 300;

  // opts: {threshold (default 0.8), limit (default 20000 pairs)}
  N.findDuplicates = function (rows, cols, opts) {
    opts = opts || {}; var th = opts.threshold == null ? 0.8 : opts.threshold, limit = opts.limit || 20000;
    var idx = buildIndex(rows, cols.name), seen = {}, pairs = [];
    Object.keys(idx).forEach(function (k) {
      var b = idx[k]; if (b.length < 2 || b.length > BUCKET_MAX) return;
      for (var x = 0; x < b.length && pairs.length < limit; x++) for (var y = x + 1; y < b.length && pairs.length < limit; y++) {
        var i = b[x], j = b[y], key = i + ':' + j; if (seen[key]) continue; seen[key] = 1;
        var r = combine(rows[i], rows[j], cols);
        if (r.score >= th) pairs.push({ a: i, b: j, score: r.score, reasons: r.reasons });
      }
    });
    pairs.sort(function (p, q) { return q.score - p.score; });
    return { pairs: pairs, groups: groupPairs(pairs, rows.length, 0) };
  };

  // union-find over pairs >= minScore
  function groupPairs(pairs, n, minScore) {
    var parent = {}; function find(x) { while (parent[x] !== undefined && parent[x] !== x) x = parent[x]; return x; }
    pairs.forEach(function (p) { if (p.score < minScore) return; if (parent[p.a] === undefined) parent[p.a] = p.a; if (parent[p.b] === undefined) parent[p.b] = p.b; var ra = find(p.a), rb = find(p.b); if (ra !== rb) parent[rb] = ra; });
    var groups = {};
    Object.keys(parent).forEach(function (k) { var r = find(+k); (groups[r] = groups[r] || []).push(+k); });
    return Object.keys(groups).map(function (k) { return groups[k].sort(function (a, b) { return a - b; }); }).filter(function (g) { return g.length > 1; });
  }
  N.groupPairs = groupPairs;

  // match every row of A with its best row in B
  N.matchLists = function (rowsA, rowsB, cols, opts) {
    opts = opts || {}; var th = opts.threshold == null ? 0.8 : opts.threshold;
    var colsB = cols.nameB !== undefined ? Object.assign({}, cols, { name: cols.nameB, father: cols.fatherB !== undefined ? cols.fatherB : cols.father, village: cols.villageB !== undefined ? cols.villageB : cols.village, age: cols.ageB !== undefined ? cols.ageB : cols.age, mobile: cols.mobileB !== undefined ? cols.mobileB : cols.mobile }) : cols;
    var idx = buildIndex(rowsB, colsB.name), pairs = [];
    rowsA.forEach(function (ra, i) {
      var cand = {}; recordKeys(ra[cols.name]).forEach(function (k) { var b = idx[k]; if (b && b.length <= BUCKET_MAX) b.forEach(function (j) { cand[j] = 1; }); });
      var best = null, second = 0;
      Object.keys(cand).forEach(function (j) {
        var r = combine2(ra, rowsB[j], cols, colsB);
        if (!best || r.score > best.score) { if (best) second = best.score; best = { a: i, b: +j, score: r.score, reasons: r.reasons }; } else if (r.score > second) second = r.score;
      });
      if (best && best.score >= th) { best.runnerUp = second; best.ambiguous = second >= best.score - 0.03 && second >= th; pairs.push(best); }
    });
    pairs.sort(function (p, q) { return q.score - p.score; });
    return { pairs: pairs };
  };
  function combine2(ra, rb, colsA, colsB) {
    // reuse combine() by building comparable pseudo-rows with the same column positions
    var A = [], B = [], k = ['name', 'father', 'village', 'age', 'mobile'], m = {};
    k.forEach(function (key, i) { m[key] = i; A[i] = colsA[key] >= 0 && colsA[key] !== undefined ? ra[colsA[key]] : ''; B[i] = colsB[key] >= 0 && colsB[key] !== undefined ? rb[colsB[key]] : ''; });
    return combine(A, B, m);
  }
})(typeof window !== 'undefined' ? window : globalThis);
