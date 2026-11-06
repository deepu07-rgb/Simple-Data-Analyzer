// =====================================================================
//  ASK IN YOUR OWN WORDS  /  अपने शब्दों में पूछें
//  "What affects burnout?"  "Does a paid subscription change GPA?"  "Average GPA by year"  "How many are Strict Ban?"
//  Offline and rule-based (no internet, no model): the question is matched to the columns and values of the open file, and to one of the
//  tools the app already has. It always says what it understood, before anything is shown, and offers the other readings.
//    STL.ask.parse(question, headers, rows)  -> { intent, y, f, by, value, fn, cols, say, alt, conf }
//    STL.ask.examples(headers, rows)         -> ["What affects …?", …]
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL = root.STL || {}, A = STL.ask = {};
  function s(v) { return v == null ? '' : String(v); }

  // ------------------------------------------------------------ words
  var STOP = {}; ('a an the of in on at to for from by with and or is are was were be been do does did can could will would should it its this that these those my our your their me we you they them i what which who whom how why when where whether any some all each every per than then there here as about into over under between among if not no yes please show tell give find me us get want need like using use used also more most much many very just only own words ' +
    'का की के है हैं था थे थी को से में पर और या क्या कौन कैसे कितना कितने कितनी क्यों यह वह ये वे मेरे हमारे ने भी तो ही कि जो').split(' ').forEach(function (w) { if (w) STOP[w] = 1; });
  var KEEP = { 'no': 1, 'yes': 1 };
  function stem(w) { if (w.length > 3 && /[ऀ-ॿ]/.test(w)) return w.replace(/[ािीुूेैोौंँ]+$/, ''); if (w.length > 5 && /ies$/.test(w)) return w.slice(0, -3) + 'y'; if (w.length > 5 && /(ing|ed)$/.test(w)) return w.replace(/(ing|ed)$/, ''); if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1); return w; }
  A.words = function (t) { return s(t).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9ऀ-ॿ]+/).filter(Boolean); };
  var SYN = [['gpa', 'grade', 'marks', 'अंक'], ['hour', 'hr', 'time', 'duration', 'usage', 'घंटे', 'घंटा'], ['burnout', 'burn', 'exhaustion', 'exhausted', 'tired', 'stress', 'थकान', 'बर्नआउट'], ['skill', 'ability', 'competence', 'कौशल'], ['paid', 'premium', 'subscription', 'pay', 'भुगतान'],
    ['major', 'course', 'subject', 'stream', 'branch', 'विषय'], ['year', 'class', 'वर्ष'], ['salary', 'pay', 'income', 'wage', 'वेतन'], ['age', 'आयु', 'उम्र'], ['price', 'cost', 'rate', 'कीमत'], ['sale', 'revenue', 'turnover', 'बिक्री'], ['rating', 'review', 'stars', 'रेटिंग'], ['city', 'town', 'शहर'], ['gender', 'sex', 'लिंग'], ['loudness', 'loud', 'louder', 'loudest', 'volume'], ['duration', 'length', 'long', 'longer'], ['tempo', 'speed', 'bpm', 'faster', 'slower'], ['energy', 'energetic'], ['dance', 'danceability', 'danceable']];
  var SYNOF = {}; SYN.forEach(function (g, i) { g.forEach(function (w) { (SYNOF[stem(w)] = SYNOF[stem(w)] || []).push(i); }); });
  function syn(a, b) { var x = SYNOF[a], y = SYNOF[b]; return !!(x && y && x.some(function (i) { return y.indexOf(i) >= 0; })); }

  // ------------------------------------------------------------ what the file holds
  A.catalog = function (headers, rows, prof) {
    var C = STL.charts, idx = rows.length > 6000 ? rows.filter(function (_, i) { return i % Math.ceil(rows.length / 6000) === 0; }) : rows, cols = [];
    prof = prof || C.profile(headers, rows, rows.map(function (_, i) { return i; }));
    headers.forEach(function (h, i) {
      var p = prof[i], ws = A.words(h).map(stem).filter(function (w) { return !STOP[w]; }), vals = null;
      if (!p.date && !p.list && !p.unique && p.distinct >= 2 && p.distinct <= 40 && (!p.numeric || p.lowInt || p.flag)) { var seen = {}, k = 0; vals = []; for (var r = 0; r < idx.length && vals.length < 41; r++) { var v = s(idx[r][i]).trim(); if (v && !seen[v]) { seen[v] = 1; vals.push(v); } } }
      var tl = 0, tn = 0; if (!p.numeric) for (var r0 = 0; r0 < Math.min(idx.length, 400); r0++) { var sv = s(idx[r0][i]); if (sv) { tl += sv.length; tn++; } }
      var catOk = !p.date && !p.list && !p.unique && (!p.numeric || p.lowInt || p.flag); cols.push({ i: i, name: h, catOk: catOk, words: ws, p: p, avgLen: tn ? tl / tn : 0, measure: !!(p.numeric && !p.unique && !p.serial && !p.idLike && !p.lowInt && !p.code), numeric: !!p.numeric && !p.unique && !p.serial && !p.idLike, cat: !!vals, vals: vals, date: !!p.date });
    });
    var df = {}; cols.forEach(function (c) { var seen = {}; c.words.forEach(function (w) { if (!seen[w]) { seen[w] = 1; df[w] = (df[w] || 0) + 1; } }); }); cols.df = df;
    return cols;
  };
  // large file: the real values (and how many there are) of every column the sample took for a category, counted over EVERY row
  A.refine = function (cat, V) {
    cat.forEach(function (c) { var v = V && V[c.i]; if (!v) return; c.vals = (v.distinct >= 2 && v.distinct <= 40 && c.catOk) ? v.values.map(function (x) { return x[0]; }) : null; c.cat = !!c.vals; });
    return cat;
  };
  // how well does the question talk about this column?  0 .. 1
  function prefix(a, b) { var i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; }
  function nameScore(col, qw, df, rareMax) {
    if (!col.words.length) return { sc: 0, pos: 99 }; var hit = 0, pos = 99, rare = 0, toks = [];
    col.words.forEach(function (w) { var best = 0, at = 99; if (/^\d+$/.test(w) && col.words.length > 1) return; qw.forEach(function (q, k) { var sc = q === w ? 1 : (syn(q, w) ? 0.85 : ((q.length >= 4 && w.length >= 4 && (q.indexOf(w) === 0 || w.indexOf(q) === 0)) ? 0.7 : (prefix(q, w) >= 4 && prefix(q, w) >= 0.6 * Math.min(q.length, w.length) ? 0.65 : 0))); if (sc > best) { best = sc; at = k; } }); if (best) { hit += best; toks.push(at); if (at < pos) pos = at; if ((df[w] || 1) <= (rareMax || 2) && (w.length >= 3 || (w.length >= 2 && /[ऀ-ॿ]/.test(w))) && best >= 0.85) rare = Math.max(rare, best); } });
    var cover = hit / col.words.length;
    return { sc: rare ? Math.max(cover, 0.6 + 0.4 * cover) : cover, pos: pos, cover: cover, toks: toks };                  // one distinctive word of the name (burnout, gpa) is enough; common words (level, score) need most of the name
  }
  function valueHits(cols, qtext, qw) {                                                                // "strict ban", "High", "STEM": a value of a column named in the question
    var out = []; var t = ' ' + qtext.toLowerCase().replace(/[_\-\/]+/g, ' ').replace(/[^a-z0-9ऀ-ॿ ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
    cols.forEach(function (c) { if (!c.vals) return; c.vals.forEach(function (v) { var vv = v.toLowerCase().replace(/[_\-\/]+/g, ' ').replace(/[^a-z0-9ऀ-ॿ ]+/g, ' ').replace(/\s+/g, ' ').trim(); if (!vv || vv.length < 2 || (c.numeric && /^\d+$/.test(vv))) return; var at = t.indexOf(' ' + vv + ' '); if (at >= 0) out.push({ col: c.i, value: v, pos: t.slice(0, at).split(' ').length - 1, len: vv.length }); }); });
    // a single distinctive word of a value ("debugging" for “Debugging/Troubleshooting”) when no other value carries it
    var idx = {}; cols.forEach(function (c) { if (!c.vals) return; c.vals.forEach(function (v) { var seen = {}; A.words(v).map(stem).forEach(function (w) { if (w.length < 4 || seen[w] || (c.numeric && /^\d+$/.test(w))) return; seen[w] = 1; (idx[w] = idx[w] || []).push({ col: c.i, value: v }); }); }); });
    qw.forEach(function (w, k) { var e = idx[w]; if (e && e.length === 1 && !out.some(function (o) { return o.col === e[0].col && o.value === e[0].value; }) && !out.some(function (o) { return o.col === e[0].col; })) out.push({ col: e[0].col, value: e[0].value, pos: k, len: w.length }); });
    return out;
  }


  // “STATUS 5”, “gender M”, “ID 5001711”: a short code or a number written right after the column's own name is that column's value
  var FILL = { is: 1, are: 1, was: 1, were: 1, of: 1, equal: 1, equals: 1, to: 1, as: 1, being: 1, has: 1, have: 1, with: 1, code: 1, value: 1, the: 1, a: 1, an: 1, at: 1, in: 1, for: 1, 'है': 1, 'हैं': 1 };
  function adjacentHits(cols, q) {
    var tk = A.words(q), out = [];
    cols.forEach(function (c) {
      if (!c.words.length) return; var hw = A.words(c.name).map(stem).filter(function (w) { return !STOP[w]; }); if (!hw.length) return;
      for (var k = 0; k < tk.length; k++) {
        if (hw.indexOf(stem(tk[k])) < 0) continue;
        var j = k + 1; while (j < tk.length && FILL[tk[j]]) j++; if (j >= tk.length) continue;
        var tok = tk[j], hit = null;
        if (c.vals) { var lc = tok.toLowerCase(); for (var m = 0; m < c.vals.length; m++) { if (String(c.vals[m]).trim().toLowerCase() === lc) { hit = c.vals[m]; break; } } }
        else if (/^\d{3,}$/.test(tok) && !(c.p && c.p.date)) hit = tok;                        // an ID, a code, an amount named exactly
        if (hit !== null) { out.push({ col: c.i, value: String(hit).trim(), pos: j, len: String(hit).length, adj: true }); break; }
      }
    });
    return out;
  }

  // ------------------------------------------------------------ intents
  var RX = {
    clean: /\b(clean (up )?(the )?(file|data|sheet)|tidy|messy|fix the (file|data)|साफ़|सफाई)/i,
    dups: /duplicate|entered twice|same (case|person|record) (twice|again)|दोहराव|डुप्लीकेट/i,
    words: /\b(commonest|common|frequent|most used|top)\s+words\b|\bkey ?words\b|\bword (count|frequency|cloud)\b|\bwhich words\b|\bwords?\b.*\b(go with|stand out|differ between)|शब्द/i,
    contain: /\b(contain|contains|containing|mention|mentions|mentioning|include|includes|including|with the word|has the word|having the word|word)\s+(?:the\s+)?(?:words?\s+)?["“']?([A-Za-z0-9ऀ-ॿ']+)/i,
    link: /\b(link|lookup|vlookup|match|attach|bring)\b.*\b(files?|sheets?|tables?|columns?)\b|\bvlookup\b|दो फ़ाइलें ID|आईडी से जोड़/i,
    summary: /\bone row (for|per) (each|every)\b|\b(summari[sz]e|roll up)\b.*\b(per|by|for each)\b|\bper (person|customer|applicant|id)\b.*\b(summary|total|history)\b|हर (व्यक्ति|आईडी) की एक/i,
    merge: /\b(combine|merge|join|stack)\b.*\b(files?|sheets?|tables?)\b|फ़ाइलें जोड़/i,
    missing: /missing|blank|empty|null|कमी|खाली|रिक्त/i,
    why: /\b(what|which)\b.*\b(affect|influence|drive|decide|determine|cause|explain|matter|relate|lead to|go(es)? with|predict|behind)|\bwhy\b|\breasons?\b|\bfactors?\b|\bdepends?\b|\bwhat makes\b|\bdrivers?\b|कारण|क्यों|प्रभावित|निर्भर|तय करता|किससे जुड़ा/i,
    fair: /\b(does|do|did|is|are|will|can)\b.*\b(affect|impact|influence|change|improve|increase|reduce|raise|lower|decrease|differ|different|better|worse|higher|lower|matter|help|hurt)\b|\b(do|does|did|are|is)\b.*\b(get|have|make|earn|give|receive|score)\b.*\b(more|less|higher|lower|fewer|better|worse)\b|\beffect of\b|\bimpact of\b|\bdifference (between|in|of)\b|\bcompare|\bversus\b|\bvs\.?\b|\breal difference|\bsignificant|तुलना|अंतर|असर|प्रभाव डाल|बढ़ाता|घटाता/i,
    top: /\b(highest|lowest|biggest|smallest|largest|best|worst|top|bottom|most|least|maximum|minimum)\b|सबसे (अधिक|ज़्यादा|ज्यादा|कम|बड़ा|छोटा)|सर्वाधिक|न्यूनतम/i,
    agg: /\b(average|mean|typical|total|sum|median|avg)\b|औसत|कुल|योग|माध्यिका/i,
    distinct: /\b(different|distinct|unique|separate)\b|अलग/i,
    count: /\bhow many\b|\bnumber of\b|\bcount\b|\b(share|percentage|percent|proportion|fraction|%)\s+of\s+(the\s+)?(rows|records|entries|people|persons|cases|applicants|customers|students|employees|accounts|months)\b|कितने|कितनी|गिनती/i,
    trend: /\btrend|over time|monthly|per month|by month|over the years|timeline|रुझान|समय के साथ|ट्रेंड/i,
    dist: /\bspread\b|\bdistribution\b|\bhistogram\b|how are .* distributed|वितरण|फैलाव/i,
    corr: /\bcorrelat|\brelationship\b|\brelated\b|\bgo together\b|\bconnected\b|\blink between\b|सहसंबंध|संबंध/i,
    change: /\b(improv(e|ed|es|ement)?|gain(s|ed)?|grew|grow|progress|how much .*chang|what chang|chang(e|ed) in|before and after)\b|पहले और बाद|सुधार|बदलाव/i,
    by: /\b(by|per|for each|in each|across|wise)\b|-wise|\bवार\b|के अनुसार|हर/i
  };
  var BAD = /^(high|yes|true|1|severe|bad|fail|failed|churn|churned|default|defaulted|positive|critical|poor|late|dropout|risk|y)$/i;
  function pickValue(col, hint) { if (hint) return hint; var v = (col.vals || []).filter(function (x) { return BAD.test(x); })[0]; return v || null; }
  function sayList(a) { return a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : a[0] || ''; }

  A.parse = function (question, headers, rows, cat) {
    var q = s(question).trim(), hi = /[ऀ-ॿ]/.test(q); cat = cat || A.catalog(headers, rows);
    var qw = A.words(q).map(stem).filter(function (w) { return !STOP[w] || KEEP[w]; });
    var res = { q: q, intent: null, conf: 0, cols: [], alt: [], hi: hi };
    if (!q) return res;
    // columns named in the question, best first, in the order they were mentioned
    var named = cat.map(function (c) { var n = nameScore(c, qw, cat.df || {}, Math.max(2, Math.round(cat.length * 0.2))); return { c: c, sc: n.sc, pos: n.pos, cover: n.cover, toks: n.toks }; }).filter(function (x) { return x.sc >= 0.5; });
    // when one matched column's words contain another's ("Study Hours" / "Hours"), the longer, fuller match wins
    named = named.filter(function (x) { return !named.some(function (y) { return y !== x && y.sc >= x.sc && y.c.words.length > x.c.words.length && x.c.words.every(function (w) { return y.c.words.indexOf(w) >= 0; }) && y.pos <= x.pos + 3; }); });
    named.sort(function (a, b) { return b.sc - a.sc || a.pos - b.pos; });
    var hasPair = STL.derive ? STL.derive.pairs(headers, STL.charts.profile(headers, rows, rows.slice(0, 3000).map(function (_, i) { return i; }))) : [], alts = [];
    // "GPA" matches both Pre_ and Post_: unless the question says pre / before, the end of the pair is meant
    hasPair.forEach(function (pr) { var a = named.filter(function (x) { return x.c.i === pr.after; })[0], b = named.filter(function (x) { return x.c.i === pr.before; })[0]; if (a && b && a.sc >= b.sc) { named = named.filter(function (x) { return x !== b; }); alts.push({ col: b.c, word: qw[b.pos] }); } });
    var vals = valueHits(cat, q, qw), adj = adjacentHits(cat, q);
    adj.forEach(function (a) { vals = vals.filter(function (v) { return v.col !== a.col; }); vals.push(a); });
    vals.sort(function (a, b) { return b.len - a.len; });
    var byPos = function (a, b) { return a.pos - b.pos; };
    var cols = named.slice(0, 4).sort(byPos).map(function (x) { return x.c; });
    // a value ("High", "Strict Ban") names its column too
    var vcols = []; vals.forEach(function (v) { if (!vcols.some(function (x) { return x.col === v.col; }) && !vals.some(function (w) { return w !== v && w.len > v.len && w.pos <= v.pos && w.col === v.col; })) vcols.push(v); });
    res.vals = vcols;
    vcols.forEach(function (v) { var c = cat[v.col]; if (!cols.some(function (x) { return x.i === c.i; })) cols.push(c); });
    res.cols = cols.map(function (c) { return c.name; });
    var H = function (c) { return c.name; }, meas = cols.filter(function (c) { return c.measure; }), nums = cols.filter(function (c) { return c.numeric; }), cats = cols.filter(function (c) { return c.cat; });
    // a column named in the question can be the “by” column even with many values (artist, year, district): text with repeats, or whole numbers like a year
    var byM = /\b(?:by|per|for each|across|wise)\s+([\w()%.]+)/i.exec(q), byTok = byM ? byM[1].toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    var byCol = byTok.length >= 3 ? cols.filter(function (c) { var nm = c.name.toLowerCase().replace(/[^a-z0-9]/g, ''); return nm === byTok || (byTok.length >= 4 && nm.indexOf(byTok) === 0); })[0] : null;       // the column written right after “by”
    var gcols = cols.filter(function (c) { return !c.cat && !c.date && c.p && !c.p.unique && !c.p.serial && c.p.distinct >= 2 && ((!c.numeric && c.p.distinct < 0.95 * Math.max(c.p.filled, 1)) || (c.numeric && c.p.allInt && c.p.distinct <= 120)); });
    var valOf = function (c) { var v = vcols.filter(function (x) { return x.col === c.i; })[0]; return v ? v.value : null; };
    res.named = named;
    function done(o) {
      for (var k in o) res[k] = o[k];
      var used = [o.y, o.f, o.x].filter(function (v) { return v != null && v >= 0; }); res.alts = [];
      used.forEach(function (ci) { var me = named.filter(function (x) { return x.c.i === ci; })[0]; if (!me) return;
        named.forEach(function (x) { var sh = x.toks.filter(function (k) { return me.toks.indexOf(k) >= 0; })[0]; if (x !== me && sh !== undefined && used.indexOf(x.c.i) < 0 && !res.alts.some(function (z) { return z.col === x.c; })) res.alts.push({ col: x.c, word: qw[sh] }); });
        alts.forEach(function (al) { if (al.word === qw[me.pos] || true) { if (!res.alts.some(function (z) { return z.col === al.col; })) res.alts.push(al); } }); });
      res.alts = res.alts.map(function (z) { var nm = z.col.name.replace(/_/g, ' '), re = new RegExp('\\b' + (z.word || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\w*', 'i'); return { name: z.col.name, q: z.word && re.test(q) ? q.replace(re, nm) : q + ' ' + nm }; }).slice(0, 3);
      return res;
    }
    // ---- quick routes to existing tools
    // ---- how many are empty / missing in a column
    if (RX.missing.test(q) && (RX.count.test(q) || /\bhow many\b/i.test(q)) && cols.length) {
      var mc = (named.slice().sort(function (a, b) { return b.sc - a.sc || a.pos - b.pos; })[0] || { c: cols.slice().sort(byPos)[0] }).c;                  // the column the question names best
      return done({ intent: 'count', conds: [{ col: mc.i, op: 'empty', value: '' }], conf: 0.85, say: 'You want to count the rows where “' + mc.name + '” is empty.' });
    }
    if (RX.words.test(q) && !RX.count.test(q)) return done({ intent: 'tool', tool: 'words', conf: 0.9, say: 'You want to see which words a text column uses.' });
    if (RX.summary.test(q)) return done({ intent: 'tool', tool: 'summary', conf: 0.9, say: 'You want one row for each person or ID.' });
    if (RX.link.test(q) && !RX.merge.test(q)) return done({ intent: 'tool', tool: 'link', conf: 0.9, say: 'You want to bring columns from another file, matched by a shared column.' });
    if (RX.merge.test(q)) return done({ intent: 'tool', tool: 'merge', conf: 0.9, say: 'You want to combine files.' });
    if (RX.dups.test(q)) return done({ intent: 'tool', tool: 'dups', conf: 0.9, say: 'You want to find rows entered twice.' });
    if (RX.clean.test(q) && !cols.length) return done({ intent: 'tool', tool: 'clean', conf: 0.85, say: 'You want to tidy the file.' });
    if (RX.missing.test(q) && /how many|which|where|any|find|check|कितने|कौन/i.test(q) && !RX.why.test(q)) return done({ intent: 'missing', conf: 0.8, say: cols.length ? 'You want to know what is missing in ' + sayList(cols.map(H)) + '.' : 'You want to know what is missing in the file.', f: cols[0] ? cols[0].i : -1 });
    // ---- change (before / after)
    var haveChange = /\bchange/i.test(q) && cols.some(function (c) { return hasPair.some(function (p) { return p.name === c.name; }); });          // the change column is already in the file: it is an ordinary number
    if (RX.change.test(q) && hasPair.length && !haveChange && !(cols.length && cols.every(function (c) { return !hasPair.some(function (p) { return p.before === c.i || p.after === c.i; }); }) && meas.length > 1)) {
      var pr = hasPair[0], why = RX.why.test(q) || /what (affect|drive|decide)/i.test(q);
      return done({ intent: why ? 'why_change' : 'change', pair: pr, conf: 0.85, say: why ? 'You want to know what affects the change from “' + headers[pr.before] + '” to “' + headers[pr.after] + '”.' : 'You want to know how much “' + headers[pr.after] + '” changed from “' + headers[pr.before] + '”.' });
    }
    // ---- why / what affects
    if (RX.why.test(q) && (cols.filter(function (c) { return c.measure || c.cat; }).length < 2 || !RX.fair.test(q.replace(RX.why, ' ')))) {
      var byName = named.slice().sort(function (a, b) { return a.pos - b.pos; }).map(function (x) { return x.c; }).filter(function (c) { return c.measure || c.cat; });
      var y = byName[0] || cats.filter(function (c) { return valOf(c); })[0] || meas[0] || cols[0] || null;
      if (!y) return done({ intent: 'ask_y', conf: 0.3, say: 'Which column would you like to understand?' });
      if (y.cat && (!y.numeric || (y.p.lowInt && y.vals.length <= 4))) { var vv = pickValue(y, valOf(y)); if (vv) return done({ intent: 'why', y: y.i, yCat: { col: y.i, value: vv }, conf: valOf(y) ? 0.9 : 0.75, say: 'You want to know what goes with how often “' + y.name + '” is “' + vv + '”.' }); return done({ intent: 'pick_value', y: y.i, conf: 0.4, say: 'Which value of “' + y.name + '” do you mean?', choices: y.vals.slice(0, 8) }); }
      return done({ intent: 'why', y: y.i, conf: 0.85, say: 'You want to know what goes with “' + y.name + '”.' });                // (a 1-10 scale is a number, not a category)
    }
    // ---- is a difference real / does X affect Y
    if (RX.fair.test(q) && !RX.top.test(q.replace(/\bhigher|lower|better|worse\b/g, ' ')) ) {
      var fy = null, ff = null, ordered = cols.slice().sort(byPos), onOn = /\b(effect|impact|affect|influence)s?( of)?\b.*\bon\b/i.test(q) || /\b(affect|influence|impact|improve|reduce|increase|raise|lower|change|help|hurt|get|have|make|earn|give|receive|score)s?\b/i.test(q);
      var ymeas = ordered.filter(function (c) { return c.measure; });
      if (valOf(ordered.filter(function (c) { return c.cat; })[0] || {}) !== null && ymeas.length) { fy = ymeas[ymeas.length - 1]; ff = ordered.filter(function (c) { return c.cat && c !== fy; })[0] || null; }
      if (!fy && ymeas.length) fy = onOn || ymeas.length === 1 ? ymeas[ymeas.length - 1] : ymeas[0];
      if (fy) ff = ff || ordered.filter(function (c) { return c !== fy && (c.cat || c.numeric); })[0] || null;
      if (!fy && ordered.length >= 2 && ordered.some(function (c) { return c.cat && (!c.numeric || c.p.lowInt) && !c.vals.every(function (v) { return /^\d+$/.test(v); }); })) {   // a text outcome ("does a ban change burnout")
        var oc = ordered.filter(function (c) { return c.cat && BAD.test((c.vals || []).join(' ').split(' ').filter(function (x) { return BAD.test(x); })[0] || ''); })[0];
        var other = ordered.filter(function (c) { return c !== oc; })[0];
        if (oc && other) { var ov = pickValue(oc, valOf(oc)); return done({ intent: 'fair', y: oc.i, yCat: { col: oc.i, value: ov }, f: other.i, conf: 0.8, say: 'You want to know whether “' + other.name + '” really makes a difference to how often “' + oc.name + '” is “' + ov + '” (compared fairly).' }); }
      }
      // Hindi: “X का Y पर असर” = the effect of X on Y (X is the group, Y the measure)
      var hiP = /(\S.*?)\s+(?:का|की|के)\s+(.+?)\s+पर\s+(?:क्या\s+)?(?:असर|प्रभाव)/.exec(q);
      if (hiP) { var g1 = A.words(hiP[1]).map(stem), g2 = A.words(hiP[2]).map(stem), hit = function (c, g) { return c.words.some(function (w) { return g.indexOf(w) >= 0; }); };
        var cy = cat.filter(function (c) { return hit(c, g2) && !hit(c, g1) && (c.measure || c.numeric); })[0] || cat.filter(function (c) { return hit(c, g2); })[0], cx = cat.filter(function (c) { return hit(c, g1) && c !== cy; })[0];
        if (cy && cx) { fy = cy; ff = cx; } }
      if (fy && ff) return done({ intent: 'fair', y: fy.i, f: ff.i, conf: 0.85, say: 'You want to know whether “' + ff.name + '” really makes a difference to “' + fy.name + '” (compared fairly).' });
      if (fy) return done({ intent: 'ask_f', y: fy.i, conf: 0.4, say: 'What do you want to compare “' + fy.name + '” across?' });
    }
    // ---- trend
    if (RX.trend.test(q)) {
      var dc = cols.filter(function (c) { return c.date; })[0] || cat.filter(function (c) { return c.date; })[0] || cat.filter(function (c) { return /(^|[_ ])(year|month|date|week|day|period|season|quarter|time)s?($|[_ ])/i.test(c.name); })[0];
      var ym = meas[0] || cat.filter(function (c) { return c.measure; })[0];
      if (dc && ym) return done({ intent: 'trend', x: dc.i, y: ym.i, fn: STL.charts.fnFor(ym.p), conf: 0.8, say: 'You want to see how “' + ym.name + '” moves over “' + dc.name + '”.' });
    }
    // ---- relationship between two numbers
    if (RX.corr.test(q) && nums.length >= 2) return done({ intent: 'corr', x: nums[0].i, y: nums[1].i, conf: 0.8, say: 'You want to see whether “' + nums[0].name + '” and “' + nums[1].name + '” go together.' });
    // ---- distribution
    if (RX.dist.test(q) && nums.length) return done({ intent: 'dist', x: nums[0].i, conf: 0.85, say: 'You want to see how “' + nums[0].name + '” is spread.' });
    // ---- how many different … (distinct values of a column)
    if (RX.distinct.test(q) && RX.count.test(q)) {
      var dcol = named.filter(function (x) { return !valOf(x.c); }).sort(byPos)[0];
      if (!dcol) return done({ intent: 'none', conf: 0, say: 'I could not tell which column to count the different values of. Say its name, for example “how many different ' + (cat[0] ? cat[0].name : 'ID') + '”.' });
      return done({ intent: 'distinct', y: dcol.c.i, conds: vcols.filter(function (v) { return v.col !== dcol.c.i; }).map(function (v) { return { col: v.col, value: v.value }; }), conf: 0.85, say: 'You want to count how many different values “' + dcol.c.name + '” has' + (vcols.length ? ' among the rows where ' + vcols.filter(function (v) { return v.col !== dcol.c.i; }).map(function (v) { return '“' + headers[v.col] + '” = “' + v.value + '”'; }).join(' and ') : '') + '.' });
    }
    // ---- never answer a different question: a number or a word that was not understood stops the answer
    var used = {}; vcols.forEach(function (v) { A.words(v.value).forEach(function (w) { used[w] = 1; }); }); cols.forEach(function (c) { A.words(c.name).forEach(function (w) { used[w] = 1; }); });
    var lost = A.words(q).filter(function (w) { return /^\d+$/.test(w) && !used[w]; });
    if (lost.length && (RX.count.test(q) || RX.agg.test(q)) && !/\b(top|bottom|first|last|next|previous|past|worst|best)\b/i.test(q)) {
      var homes = cat.filter(function (c) { return c.vals && c.vals.some(function (v) { return String(v).trim() === lost[0]; }); }).slice(0, 4);
      return done({ intent: 'none', conf: 0, say: 'I could not tell which column “' + lost[0] + '” belongs to, so I did not count anything.' + (homes.length ? ' Put the column name before it' : ''), examples: homes.map(function (c) { return 'How many rows have ' + c.name.replace(/_/g, ' ') + ' ' + lost[0] + '?'; }) });
    }
    // ---- counts
    if (RX.count.test(q)) {
      var gb = cats.filter(function (c) { return !valOf(c); })[0] || gcols[0], fv = vcols, cm = RX.contain.exec(q), wcond = null;
      if (cm && !/^(the|a|an|word|words|all|any)$/i.test(cm[2])) {                                  // "how many rows contain happy": the text column holds this word
        var isTxt = function (c) { return !c.cat && !c.numeric && !c.date && !c.p.serial && !c.p.unique && c.avgLen >= 12; }, tcol = cols.filter(isTxt)[0] || cat.filter(isTxt).sort(function (a, b) { return b.avgLen - a.avgLen; })[0] || cat.filter(function (c) { return !c.cat && !c.numeric && !c.date && /text|comment|remark|description|feedback|complaint|message|note|review|reason/i.test(c.name); })[0] || cat.filter(function (c) { return !c.catOk && !c.numeric && !c.date; }).sort(function (a, b) { return b.p.distinct - a.p.distinct; })[0];
        if (tcol) { wcond = { col: tcol.i, value: cm[2].toLowerCase(), op: 'word' }; used[cm[2].toLowerCase()] = 1; }
      }

      if (RX.by.test(q) && gb) return done({ intent: 'count_by', x: gb.i, conf: 0.85, say: 'You want to count rows for each “' + gb.name + '”.' });
      var GEN = /^(row|record|entry|entrie|people|person|case|applic|applicant|application|total|number|count|file|data|line|item|there|exist|exists|tabl|sheet|column|one|everyone|everybody|customer|client|member|student|employee|worker)\w*$/;
      var left = A.words(q).map(stem).filter(function (w) { return !STOP[w] && !GEN.test(w) && !/^\d+$/.test(w) && !used[w] && !named.some(function (x) { return x.c.words.indexOf(w) >= 0; }) && !/^(count|different|distinct|unique)$/.test(w); });
      if (!fv.length && !wcond && left.length) return done({ intent: 'none', conf: 0, say: 'I could not match “' + left.slice(0, 3).join(' ') + '” to a column or a value of this file, so I did not count anything.' });
      var cc = fv.map(function (v) { return { col: v.col, value: v.value }; }).concat(wcond ? [wcond] : []), parts = fv.map(function (v) { return '“' + headers[v.col] + '” = “' + v.value + '”'; }).concat(wcond ? ['“' + headers[wcond.col] + '” contains the word “' + wcond.value + '”'] : []);
      return done({ intent: 'count', conds: cc, conf: 0.85, say: parts.length ? 'You want to count the rows where ' + parts.join(' and ') + '.' : 'You want to count the rows.' });
    }
    // ---- highest / lowest
    var g0 = function (oc) { return cats.filter(function (c) { return c !== oc && !valOf(c) && !c.numeric; })[0] || cat.filter(function (c) { return c.cat && !c.numeric && c !== oc && c.vals.length <= 12; })[0]; };
    var isTop = RX.top.test(q), isAgg = RX.agg.test(q), fn = /\b(total|sum)\b|कुल|योग/i.test(q) ? 'sum' : (/median|माध्यिका/i.test(q) ? 'median' : 'avg');
    if (isTop || isAgg) {
      var m = meas[0] || nums.filter(function (c) { return !c.cat; })[0] || nums[0] || null, g = (byCol && byCol !== m && (byCol.cat || gcols.indexOf(byCol) >= 0) ? byCol : null) || cats.filter(function (c) { return c !== m && !valOf(c); })[0] || gcols.filter(function (c) { return c !== m; })[0] || null;
      var oc = cats.filter(function (c) { return !c.numeric && c.vals && c.vals.some(function (v) { return BAD.test(v); }); })[0];
      if (!m && oc && g0(oc)) { var ov = pickValue(oc, valOf(oc)); return done({ intent: isTop ? 'top' : 'agg_by', y: oc.i, yCat: { col: oc.i, value: ov }, x: g0(oc).i, fn: 'pct', sort: /\b(lowest|smallest|least|minimum)\b/i.test(q) ? 'asc' : 'desc', conf: 0.75, say: 'You want to see how often “' + oc.name + '” is “' + ov + '” for each “' + g0(oc).name + '”.' }); }
      if (!m) { var anyM = cat.filter(function (c) { return c.measure; }); return done({ intent: 'ask_y', conf: 0.3, say: 'Which number do you mean?', choices: anyM.slice(0, 6).map(function (c) { return c.name; }) }); }
      if (g && (RX.by.test(q) || isTop)) { var low = /\b(lowest|smallest|least|worst|minimum|bottom)\b|सबसे कम|न्यूनतम/i.test(q); return done({ intent: isTop ? 'top' : 'agg_by', y: m.i, x: g.i, fn: m.p && STL.charts.avgy(m.p) ? 'avg' : (isAgg ? fn : STL.charts.fnFor(m.p)), sort: low ? 'asc' : 'desc', conf: 0.85, say: (isTop ? (low ? 'You want to see which “' + g.name + '” has the lowest ' : 'You want to see which “' + g.name + '” has the highest ') : 'You want the ' + (fn === 'sum' ? 'total ' : (fn === 'median' ? 'median ' : 'average ')) + 'of ') + '“' + m.name + '”' + (isTop ? '.' : ' for each “' + g.name + '”.') }); }
      return done({ intent: 'agg', y: m.i, fn: isAgg ? fn : 'avg', conds: vcols.filter(function (v) { return v.col !== m.i; }).map(function (v) { return { col: v.col, value: v.value }; }), conf: 0.85, say: 'You want the ' + (fn === 'sum' ? 'total' : (fn === 'median' ? 'median' : 'average')) + ' of “' + m.name + '”' + (vcols.length ? ' for the rows where ' + vcols.map(function (v) { return '“' + headers[v.col] + '” = “' + v.value + '”'; }).join(' and ') : '') + '.' });
    }
    // ---- only column names, no verb: best guess = how it differs by group
    if (cols.length === 1 && cols[0].measure) return done({ intent: 'dist', x: cols[0].i, conf: 0.5, say: 'I think you want to see “' + cols[0].name + '”.' });
    if (cols.length >= 2) { var mm = meas[0], gg = cols.filter(function (c) { return c !== mm && c.cat; })[0]; if (mm && gg) return done({ intent: 'agg_by', y: mm.i, x: gg.i, fn: STL.charts.fnFor(mm.p), sort: 'desc', conf: 0.5, say: 'I think you want “' + mm.name + '” for each “' + gg.name + '”.' }); }
    return done({ intent: 'none', conf: 0, say: 'I could not match your words to this file.' });
  };

  // a few questions this file can answer, to start from
  A.examples = function (headers, rows, cat) {
    cat = cat || A.catalog(headers, rows); var out = [], C = STL.charts, nm = function (c) { return c.name.replace(/_/g, ' '); };
    var meas = cat.filter(function (c) { return c.measure; }); meas = C.rankMeasures(meas.map(function (c) { return Object.assign({}, c.p, { c: c }); })).map(function (p) { return p.c; });
    var cats = cat.filter(function (c) { return c.cat && !c.numeric && c.vals.length <= 12; });
    var oc = cat.filter(function (c) { return c.cat && c.vals.length <= 6 && c.vals.some(function (v) { return BAD.test(v) && !/^\d+$/.test(v); }); }), OR = STL.drivers && STL.drivers.NAME_OUTCOMECAT, outc = oc.filter(function (c) { return OR && OR.test(c.name); })[0] || oc[0];
    if (meas[0]) out.push('What affects ' + nm(meas[0]) + '?');
    if (outc) out.push('What affects ' + nm(outc) + ' ' + outc.vals.filter(function (v) { return BAD.test(v) && !/^\d+$/.test(v); })[0] + '?');
    if (meas[0] && cats[0]) out.push('Does ' + nm(cats[0]) + ' change ' + nm(meas[0]) + '?');
    if (meas[0] && cats[0]) out.push('Average ' + nm(meas[0]) + ' by ' + nm(cats[0]));
    if (cats[0] && cats[0].vals[0]) out.push('How many rows have ' + nm(cats[0]) + ' ' + cats[0].vals[0] + '?');
    return out.slice(0, 5);
  };
})(typeof window !== 'undefined' ? window : globalThis);

// =====================================================================
//  The screen
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL, A = STL.ask;
  if (!root.document || !STL.ui) return;
  var U = STL.ui, T = U.T, esc = U.esc, fmt = U.fmt;
  function $(id) { return document.getElementById(id); }
  var S = null;

  STL.openAsk = function (preset) {
    if (!U.hasData() && !(root.BIG && BIG.active)) { toast(T('Open a file first', 'पहले फ़ाइल खोलें'), 'info'); return; }
    var big = !!(root.BIG && BIG.active), H = big ? BIG.headers : headers, R = big ? (STL.bigCharts && STL.bigCharts.sample ? STL.bigCharts.sample.rows : []) : rawData;
    var go = function () {
      if (big) R = STL.bigCharts.sample.rows;                                                              // the sample is read only after it has been loaded
      var cat = A.catalog(H, R), fin = function () { S = { H: H, R: R, big: big, cat: cat, q: preset || '', res: null }; S.ex = A.examples(H, R, S.cat); draw(); if (S.q) run(S.q); };
      if (!big) { fin(); return; }
      var ids = cat.filter(function (c) { return c.catOk && c.p.distinct >= 2; }).map(function (c) { return c.i; }).slice(0, 60);
      STL.bigCharts.values(ids).then(function (V) { A.refine(cat, V); fin(); }).catch(fin);
    };
    if (big && STL.bigCharts && STL.bigCharts.sample.ds !== BIG.ds) STL.bigCharts.loadSample().then(go).catch(function (e) { toast(e.message, 'error'); }); else go();
  };
  function draw() {
    var html = '<div class="prj-h"><b>💬 ' + T('Ask in your own words', 'अपने शब्दों में पूछें') + '</b><button id="akX" aria-label="close">×</button></div>' +
      '<div class="big-note">' + T('Type a question about your data, like you would ask a person. Nothing leaves your computer.', 'अपने डेटा के बारे में ऐसे प्रश्न लिखें जैसे किसी व्यक्ति से पूछते हैं। कुछ भी आपके कंप्यूटर से बाहर नहीं जाता।') + '</div>' +
      '<div class="prj-row" style="gap:8px"><input id="akQ" class="big-input" style="flex:1;font-size:16px;padding:10px" placeholder="' + esc(T('For example: What affects burnout?', 'उदाहरण: बर्नआउट को क्या प्रभावित करता है?')) + '" value="' + esc(S.q) + '"><button class="tb-btn primary" id="akGo">' + T('Ask', 'पूछें') + '</button></div>' +
      '<div class="prj-sub">' + T('Try one of these', 'इनमें से कोई आज़माएँ') + '</div><div class="prj-row" style="flex-wrap:wrap;gap:6px">' + S.ex.map(function (e, i) { return '<button class="tb-btn" data-ex="' + i + '">' + esc(e) + '</button>'; }).join('') + '</div>' +
      '<div id="akOut" style="margin-top:12px"></div>';
    var o = U.overlay('askDialog', html, true); o.querySelector('.stl-box').classList.add('fr-box');
    $('akX').onclick = function () { o.remove(); }; $('akGo').onclick = function () { run($('akQ').value); };
    $('akQ').onkeydown = function (e) { if (e.key === 'Enter') run($('akQ').value); }; setTimeout(function () { var i = $('akQ'); if (i) i.focus(); }, 50);
    o.querySelectorAll('[data-ex]').forEach(function (b) { b.onclick = function () { $('akQ').value = S.ex[+b.dataset.ex]; run(S.ex[+b.dataset.ex]); }; });
  }
  function colName(i) { return S.H[i]; }
  // an average of a column of codes (label 0-5, status 1-4) means little: say so
  function codeNote(i) { var c = S.cat && S.cat[i]; return c && c.p && c.p.lowInt ? T('(“' + colName(i) + '” looks like a code with a few values, so an average means little; ask “how often …” instead.) ', '(“' + colName(i) + '” कुछ मानों वाला कोड लगता है, इसलिए औसत का अर्थ कम है; “कितनी बार …” पूछें।) ') : ''; }
  function nums(col) { var C = STL.charts, out = []; S.R.forEach(function (r) { var x = C.num(r[col]); if (x !== null) out.push(x); }); return out; }
  function rowsWhere(conds) {
    return S.R.filter(function (r) { return (conds || []).every(function (c) {
      var v = String(r[c.col] == null ? '' : r[c.col]); if (c.op === 'empty') return v.trim() === ''; if (c.op === 'word') return v.toLowerCase().replace(/[^a-z0-9ऀ-ॿ']+/g, ' ').split(' ').indexOf(c.value) >= 0; if (c.op === 'contains') return v.toLowerCase().indexOf(c.value) >= 0; return v.trim() === c.value;
    }); });
  }
  function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
  function f2(x) { return STL.charts.indian(Math.round(x * 100) / 100, Math.abs(x) < 100 ? 2 : 0); }

  function run(q) {
    S.q = q; var out = $('akOut'); if (!out) return; var res = A.parse(q, S.H, S.R, S.cat); S.res = res;
    if (!q.trim()) { out.innerHTML = ''; return; }
    var say = res.say ? esc(res.hi ? T(res.say, res.say) : T(res.say, hiSay(res))) : '';
    var body = '', btns = '';
    var open = function (label, fn) { btns += '<button class="tb-btn primary" data-act="' + (acts.push(fn) - 1) + '">' + esc(label) + '</button>'; }, acts = S.acts = [];
    var C = STL.charts, I = res;
    try {
      if (I.intent === 'why') open(T('Show me', 'दिखाएँ'), function () { close(); STL.openDrivers({ y: I.y, yCat: I.yCat || null }); });
      else if (I.intent === 'fair') open(T('Show me', 'दिखाएँ'), function () { close(); STL.openFair({ y: I.y, f: I.f, yCat: I.yCat || undefined }); });
      else if (I.intent === 'why_change') {
        open(T('Add the change and explain it', 'बदलाव जोड़ें और समझाएँ'), function () { close(); STL.addColumn({ a: I.pair.after, op: 'minus', b: I.pair.before, name: I.pair.name }, function (ni) { STL.openDrivers({ y: ni }); }); });
      } else if (I.intent === 'change') {
        var pr = I.pair, d = []; S.R.forEach(function (r) { var a = C.num(r[pr.after]), b = C.num(r[pr.before]); if (a !== null && b !== null) d.push(a - b); });
        if (d.length && !S.big) body = '<div class="fr-verdict" style="border-color:#14a38b"><b>' + esc(T('On average ' + colName(pr.after) + ' is ' + f2(Math.abs(mean(d))) + (mean(d) >= 0 ? ' higher' : ' lower') + ' than ' + colName(pr.before) + '. ', 'औसतन ' + colName(pr.after) + ', ' + colName(pr.before) + ' से ' + f2(Math.abs(mean(d))) + (mean(d) >= 0 ? ' अधिक' : ' कम') + ' है। ')) + fmt(Math.round(d.filter(function (x) { return x > 0; }).length / d.length * 1000) / 10) + esc(T('% of rows went up.', '% पंक्तियों में बढ़ोतरी हुई।')) + '</b></div>';
        open(T('Add the change as a column', 'बदलाव को कॉलम बनाएँ'), function () { close(); STL.addColumn({ a: pr.after, op: 'minus', b: pr.before, name: pr.name }, function (ni) { STL.openDrivers({ y: ni }); }); });
      } else if ((I.intent === 'agg' || I.intent === 'count' || I.intent === 'distinct') && S.big) {
        var conds = (I.conds || []).filter(function (c) { return c.col !== I.y; }); out.innerHTML = '<div class="big-note" style="border-color:#6d5bd0"><b>' + T('I understood: ', 'मैं यह समझा: ') + '</b>' + esc(res.say) + '</div><div class="big-note">' + T('Counting every row…', 'हर पंक्ति गिनी जा रही है…') + '</div>';
        STL.bigCharts.scalar(I.intent === 'count' ? -1 : I.y, I.intent === 'count' ? 'count' : (I.intent === 'distinct' ? 'distinct' : I.fn), conds).then(function (r) {
          var txt = I.intent === 'distinct' ? fmt(r.value) + T(' different values of ', ' अलग-अलग मान: ') + colName(I.y) + '<p>' + esc(T('counted over ' + fmt(r.n) + ' filled rows, every row of the file', fmt(r.n) + ' भरी पंक्तियों में, फ़ाइल की हर पंक्ति')) + '</p>' : I.intent === 'count' ? fmt(r.n) + T(' of ' + fmt(r.total) + ' rows', ' / ' + fmt(r.total) + ' पंक्तियाँ') + (r.total ? ' (' + (r.n / r.total < 0.01 ? Math.round(r.n / r.total * 10000) / 100 : Math.round(r.n / r.total * 1000) / 10) + '%)' : '') : (I.fn === 'sum' ? T('Total ', 'कुल ') : (I.fn === 'median' ? T('Median ', 'माध्यिका ') : T('Average ', 'औसत '))) + colName(I.y) + ': ' + (r.value === null ? '–' : f2(r.value)) + '<p>' + esc(codeNote(I.y) + T('from ' + fmt(r.n) + ' rows, every row of the file counted', fmt(r.n) + ' पंक्तियों से, फ़ाइल की हर पंक्ति गिनी गई')) + '</p>';
          if ($('akOut') && S.q === q) $('akOut').innerHTML = '<div class="big-note" style="border-color:#6d5bd0"><b>' + T('I understood: ', 'मैं यह समझा: ') + '</b>' + esc(res.say) + '</div><div class="fr-verdict" style="border-color:#14a38b"><b>' + txt + '</b></div>';
        }).catch(function (e) { if ($('akOut')) $('akOut').innerHTML += '<div class="big-err">' + esc(e.message) + '</div>'; });
        return;
      } else if (I.intent === 'agg' && !S.big) {
        var rows = rowsWhere(I.conds), v = []; rows.forEach(function (r) { var x = C.num(r[I.y]); if (x !== null) v.push(x); }); var val = I.fn === 'sum' ? v.reduce(function (a, b) { return a + b; }, 0) : (I.fn === 'median' ? (v.sort(function (a, b) { return a - b; }), v.length ? (v[(v.length - 1) >> 1] + v[v.length >> 1]) / 2 : null) : mean(v));
        body = '<div class="fr-verdict" style="border-color:#14a38b"><b>' + esc((I.fn === 'sum' ? T('Total ', 'कुल ') : (I.fn === 'median' ? T('Median ', 'माध्यिका ') : T('Average ', 'औसत '))) + colName(I.y) + ': ') + (val === null ? '–' : f2(val)) + '</b><p>' + esc(T('from ' + fmt(v.length) + ' rows', fmt(v.length) + ' पंक्तियों से')) + '</p></div>';
        open(T('Show it by group', 'समूह के अनुसार दिखाएँ'), function () { close(); var g = S.cat.filter(function (c) { return c.cat && !c.numeric && c.i !== I.y; })[0]; STL.openChartStudio(g ? { type: 'column', spec: { x: g.i, ys: [{ col: I.y, fn: I.fn }], sort: 'desc' } } : undefined); });
      } else if (I.intent === 'distinct' && !S.big) {
        var seenD = {}, nD = 0, filled = 0; rowsWhere(I.conds).forEach(function (r) { var v = String(r[I.y] == null ? '' : r[I.y]).trim(); if (v === '') return; filled++; if (!seenD[v]) { seenD[v] = 1; nD++; } });
        body = '<div class="fr-verdict" style="border-color:#14a38b"><b>' + fmt(nD) + esc(T(' different values of ', ' अलग-अलग मान: ') + colName(I.y)) + '</b><p>' + esc(T('counted over ' + fmt(filled) + ' filled rows', fmt(filled) + ' भरी पंक्तियों में')) + '</p></div>';
      } else if (I.intent === 'count' && !S.big) {
        var n = rowsWhere(I.conds).length; body = '<div class="fr-verdict" style="border-color:#14a38b"><b>' + fmt(n) + esc(T(' of ' + fmt(S.R.length) + ' rows', ' / ' + fmt(S.R.length) + ' पंक्तियाँ')) + (S.R.length ? ' (' + (Math.round(n / S.R.length * 1000) / 10) + '%)' : '') + '</b></div>';
      } else if (I.intent === 'count_by' || I.intent === 'agg_by' || I.intent === 'top') {
        var spec = I.intent === 'count_by' ? { x: I.x, ys: [{ col: -1, fn: 'count' }], sort: 'desc' } : { x: I.x, ys: [I.yCat ? { col: I.y, fn: 'pct', op: '=', value: I.yCat.value } : { col: I.y, fn: I.fn }], sort: I.sort === 'asc' ? 'asc' : 'desc', topN: I.intent === 'top' ? 12 : 0, minRows: I.fn === 'avg' || I.yCat ? 20 : 0 };
        open(T('Show me', 'दिखाएँ'), function () { close(); STL.openChartStudio({ type: I.intent === 'count_by' ? 'bar' : 'column', spec: spec }); });
      } else if (I.intent === 'trend') open(T('Show me', 'दिखाएँ'), function () { close(); STL.openChartStudio({ type: 'line', spec: { x: I.x, ys: [{ col: I.y, fn: I.fn }], time: S.cat[I.x].date ? 'month' : undefined, sort: 'label' } }); });
      else if (I.intent === 'corr') open(T('Show me', 'दिखाएँ'), function () { close(); STL.openChartStudio({ type: 'scatter', spec: { xnum: I.x, ynum: I.y, trend: true } }); });
      else if (I.intent === 'dist') open(T('Show me', 'दिखाएँ'), function () { close(); STL.openChartStudio({ type: 'histogram', spec: { xnum: I.x } }); });
      else if (I.intent === 'tool') open(T('Open it', 'खोलें'), function () { close(); ({ merge: STL.openMerge, dups: (S.big && STL.openRepeats ? STL.openRepeats : STL.openDuplicates), clean: STL.openFixer, link: STL.openLink, summary: STL.openSummary, words: STL.openWords }[I.tool] || function () {})(); });
      else if (I.intent === 'missing') open(T('Show the checks', 'जाँच दिखाएँ'), function () { close(); STL.openDrivers({}); });
      else if (I.intent === 'pick_value') (I.choices || []).forEach(function (v) { open(v, function () { run(q + ' ' + v); }); });
      else if (I.intent === 'ask_y' && I.choices) I.choices.forEach(function (c) { open(c, function () { run(q + ' ' + c); }); });
    } catch (e) { body = '<div class="big-err">' + esc(e.message) + '</div>'; }
    var alt = '';
    if (res.alts && res.alts.length) alt += '<div class="prj-sub">' + T('Did you mean a different column?', 'क्या आपका मतलब कोई और कॉलम था?') + '</div><div class="prj-row" style="flex-wrap:wrap;gap:6px">' + res.alts.map(function (a, i) { return '<button class="tb-btn" data-alt="' + i + '">' + esc(a.name) + '</button>'; }).join('') + '</div>';
    S.exShown = res.examples && res.examples.length ? res.examples : S.ex;
    if (res.intent === 'none' || res.conf < 0.6) alt = '<div class="prj-sub">' + T('Maybe one of these?', 'शायद इनमें से कोई?') + '</div><div class="prj-row" style="flex-wrap:wrap;gap:6px">' + S.exShown.map(function (e, i) { return '<button class="tb-btn" data-ex="' + i + '">' + esc(e) + '</button>'; }).join('') + '</div>';
    out.innerHTML = '<div class="big-note" style="border-color:#6d5bd0"><b>' + T('I understood: ', 'मैं यह समझा: ') + '</b>' + (say || esc(T('I could not match your words to this file.', 'मैं आपके शब्द इस फ़ाइल से नहीं मिला सका।'))) + '</div>' + body + '<div class="prj-row" style="gap:8px;margin-top:8px;flex-wrap:wrap">' + btns + '</div>' + alt +
      (res.intent === 'none' ? '<div class="big-note">' + T('Tip: use the names of the columns, for example “average ' + (S.cat[0] ? S.cat[0].name : 'column') + ' by …”.', 'सुझाव: कॉलम के नाम का उपयोग करें, जैसे “… के अनुसार औसत …”।') + '</div>' : '');
    out.querySelectorAll('[data-alt]').forEach(function (b) { b.onclick = function () { var a = res.alts[+b.dataset.alt]; $('akQ').value = a.q; run(a.q); }; });
    out.querySelectorAll('[data-act]').forEach(function (b) { b.onclick = function () { S.acts[+b.dataset.act](); }; });
    out.querySelectorAll('[data-ex]').forEach(function (b) { b.onclick = function () { var e = S.exShown[+b.dataset.ex]; $('akQ').value = e; run(e); }; });
  }
  function hiSay(r) { return r.say; }
  function close() { var d = $('askDialog'); if (d) d.remove(); }
  (STL.actions || []).push({ en: 'Ask in your own words (type a question)', hi: 'अपने शब्दों में पूछें (प्रश्न लिखें)', kw: 'ask question type what affects why does how many average explain prashn poochho sawal', run: function () { STL.openAsk(); }, group: 'Analyse' });
})(typeof window !== 'undefined' ? window : globalThis);
