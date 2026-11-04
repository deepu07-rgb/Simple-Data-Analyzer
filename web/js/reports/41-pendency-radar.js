// =====================================================================
//  PENDENCY RADAR  /  लंबित प्रकरण रडार
//  Age of pending cases (0-30, 31-90, 91-180, 181-365, over 365 days) by officer / station / section,
//  cases close to a deadline, and a weekly snapshot trail. Plain arithmetic on the user's own columns.
//
//    STL.pend.guess(headers, rows)        -> { date, status, group }  column indexes (or -1)
//    STL.pend.statusValues(rows, col)     -> [{value, count, pending}]
//    STL.pend.compute(rows, opts)         -> ageing table, totals, deadline lists
//    STL.pend.snapshot(result) / trend(list)
// =====================================================================
(function (root) {
  'use strict';
  var STL = root.STL = root.STL || {};
  var P = STL.pend = {};
  function s(v) { return v == null ? '' : String(v); }
  function norm(t) { return s(t).normalize('NFC').toLowerCase().replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim(); }

  // ------------------------------------------------------------ dates
  var DAY = 86400000;
  function utc(y, m, d) { return Date.UTC(y, m - 1, d); }
  function validYMD(y, m, d) { if (m < 1 || m > 12 || d < 1 || y < 1950 || y > 2200) return false; var dt = new Date(utc(y, m, d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d; }
  // -> UTC milliseconds at midnight, or null. Day first for 03/04/2025 (Indian style).
  function parseDate(v, dateHeader) {
    var t = s(v).replace(/[०-९]/g, function (c) { return String(c.charCodeAt(0) - 0x0966); }).trim();
    if (!t) return null;
    var parts = root.STL && STL.fix && STL.fix.util && STL.fix.util.parseDateParts ? STL.fix.util.parseDateParts(t) : null;
    if (parts) {
      if (parts.kind === 'iso') return validYMD(parts.y, parts.m, parts.d) ? utc(parts.y, parts.m, parts.d) : null;
      if (parts.kind === 'num') {
        if (validYMD(parts.y, parts.b, parts.a)) return utc(parts.y, parts.b, parts.a);
        return validYMD(parts.y, parts.a, parts.b) ? utc(parts.y, parts.a, parts.b) : null;       // only if day-first is impossible
      }
    }
    if (dateHeader && /^\d{5}$/.test(t)) { var n = +t; if (n >= 20000 && n <= 80000) return Date.UTC(1899, 11, 30) + n * DAY; }
    return null;
  }
  P.parseDate = parseDate;
  P.iso = function (ms) { var d = new Date(ms); return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); };
  P.todayISO = function () { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  // Indian financial year: 1 April to 31 March -> "2025-26"
  P.fy = function (ms) { var d = new Date(ms), y = d.getUTCFullYear(), m = d.getUTCMonth() + 1; var a = m >= 4 ? y : y - 1; return a + '-' + String((a + 1) % 100).padStart(2, '0'); };
  P.fyStart = function (ms) { var d = new Date(ms), y = d.getUTCFullYear(), m = d.getUTCMonth() + 1; return utc(m >= 4 ? y : y - 1, 4, 1); };

  // ------------------------------------------------------------ guessing columns
  var PENDING_W = ['pending', 'लंबित', 'लम्बित', 'पेंडिंग', 'under investigation', 'under inv', 'u/i', 'जांच', 'जाँच', 'विचाराधीन', 'open', 'चालू', 'in progress', 'अनिर्णित', 'awaiting', 'प्रक्रियाधीन', 'अप्रगति'];
  var CLOSED_W = ['disposed', 'निस्तारित', 'निस्तारण', 'closed', 'निपटारा', 'निपटाया', 'final report', 'चालान', 'charge sheet', 'chargesheet', 'decided', 'निर्णीत', 'समाप्त', 'completed', 'resolved', 'solved', 'हल', 'खात्मा', 'एफ आर', 'fr '];
  function has(text, list) { var t = ' ' + norm(text) + ' '; return list.some(function (w) { return t.indexOf(w) >= 0; }); }
  P.classify = function (value) {
    var closed = has(value, CLOSED_W), pending = has(value, PENDING_W);
    if (closed && !pending) return 'closed';
    if (pending && !closed) return 'pending';
    return 'unknown';
  };
  P.statusValues = function (rows, col) {
    var m = {};
    rows.forEach(function (r) { var v = s(r[col]).trim(); if (v) m[v] = (m[v] || 0) + 1; });
    return Object.keys(m).sort(function (a, b) { return m[b] - m[a]; }).slice(0, 60).map(function (v) { return { value: v, count: m[v], kind: P.classify(v), pending: P.classify(v) === 'pending' }; });
  };

  P.guess = function (headers, rows) {
    var out = { date: -1, status: -1, group: -1 }, sample = rows.slice(0, 500);
    var dateScore = -1, statScore = -1, grpScore = -1;
    headers.forEach(function (h, i) {
      var name = norm(h), vals = sample.map(function (r) { return r[i]; }).filter(function (v) { return s(v).trim() !== ''; });
      if (!vals.length) return;
      var distinct = {}; vals.forEach(function (v) { distinct[s(v).trim()] = 1; }); var nd = Object.keys(distinct).length;
      var dateRate = vals.filter(function (v) { return parseDate(v, /date|दिनांक|तारीख|तिथि/.test(name)) !== null; }).length / vals.length;
      if (dateRate >= 0.7) {
        var sc = 1 + (/registr|दर्ज|पंजी|fir|filed|receiv|प्राप्त|रजिस्ट|institut/.test(name) ? 3 : 0) + (/date|दिनांक|तारीख|तिथि/.test(name) ? 1 : 0) - (/disposal|निस्तारण|closed|बंद|decision|निर्णय|birth|जन्म|dob/.test(name) ? 3 : 0);
        if (sc > dateScore) { dateScore = sc; out.date = i; }
      }
      var textual = vals.filter(function (v) { return isNaN(Number(s(v).replace(/,/g, ''))); }).length / vals.length;
      var kinds = Object.keys(distinct).slice(0, 40).map(P.classify);
      var known = kinds.filter(function (k) { return k !== 'unknown'; }).length;
      if (nd <= 40 && textual > 0.9 && known >= 1) {
        var ss = known + (/status|स्थिति|disposal|निस्तारण|state/.test(name) ? 3 : 0);
        if (ss > statScore) { statScore = ss; out.status = i; }
      }
      if (nd >= 2 && nd <= 500 && textual > 0.9 && dateRate < 0.5 && i !== out.status) {
        var gs = (/station|थाना|district|जिला|officer|अधिकारी|section|अनुभाग|branch|विभाग|\bps\b|office|कार्यालय|unit|इकाई|circle|वृत्त|range|रेंज/.test(name) ? 3 : 0) + (nd < 80 ? 1 : 0);
        if (gs > grpScore && gs >= 3) { grpScore = gs; out.group = i; }
      }
    });
    if (out.group === out.status) out.group = -1;
    return out;
  };

  // ------------------------------------------------------------ ageing
  // opts: {dateCol, statusCol (-1 = all pending), groupCol (-1 = one group), pendingValues (array|null),
  //        asOn 'YYYY-MM-DD', edges [30,90,180,365], deadlineDays, windowDays}
  P.compute = function (rows, opts) {
    var edges = (opts.edges && opts.edges.length ? opts.edges : [30, 90, 180, 365]).slice().sort(function (a, b) { return a - b; });
    var labels = edges.map(function (e, i) { return (i === 0 ? '0' : String(edges[i - 1] + 1)) + '–' + e; }).concat(['>' + edges[edges.length - 1]]);
    var asOn = parseDate(opts.asOn || P.todayISO());
    var pendSet = null;
    if (opts.statusCol >= 0 && opts.pendingValues) { pendSet = {}; opts.pendingValues.forEach(function (v) { pendSet[s(v).trim()] = 1; }); }
    var groups = {}, order = [], total = { counts: edges.map(function () { return 0; }).concat([0]), total: 0, ages: 0, oldest: -1 };
    var undated = 0, future = 0, notPending = 0, near = [], overdue = [];
    var dl = opts.deadlineDays > 0 ? opts.deadlineDays : 0, win = opts.windowDays >= 0 ? opts.windowDays : 15;
    function bucket(age) { for (var i = 0; i < edges.length; i++) if (age <= edges[i]) return i; return edges.length; }
    rows.forEach(function (r, ri) {
      if (pendSet && !pendSet[s(r[opts.statusCol]).trim()]) { notPending++; return; }
      var ms = parseDate(r[opts.dateCol], true);
      if (ms === null) { undated++; return; }
      var age = Math.floor((asOn - ms) / DAY);
      if (age < 0) { future++; return; }
      var gname = opts.groupCol >= 0 ? (s(r[opts.groupCol]).trim() || '(blank)') : 'All';
      var g = groups[gname];
      if (!g) { g = groups[gname] = { name: gname, counts: edges.map(function () { return 0; }).concat([0]), total: 0, ages: 0, oldest: -1, rows: [] }; order.push(gname); }
      var b = bucket(age); g.counts[b]++; g.total++; g.ages += age; if (age > g.oldest) g.oldest = age; g.rows.push(ri);
      total.counts[b]++; total.total++; total.ages += age; if (age > total.oldest) total.oldest = age;
      if (dl) {
        if (age > dl) overdue.push({ row: ri, age: age, group: gname, over: age - dl });             // past the deadline
        else if (age >= dl - win) near.push({ row: ri, age: age, group: gname, left: dl - age });    // due within the window (0 = due today)
      }
    });
    var overIdx = edges.indexOf(180) >= 0 ? edges.indexOf(180) + 1 : Math.min(2, edges.length) ;      // buckets after 180 days
    function over180(counts) { var n = 0; for (var i = overIdx; i < counts.length; i++) n += counts[i]; return n; }
    var list = order.map(function (k) { var g = groups[k]; g.avgAge = g.total ? g.ages / g.total : 0; g.over180 = over180(g.counts); g.over180Pct = g.total ? g.over180 / g.total * 100 : 0; return g; })
      .sort(function (a, b) { return b.total - a.total || (a.name < b.name ? -1 : 1); });
    total.avgAge = total.total ? total.ages / total.total : 0; total.over180 = over180(total.counts); total.over180Pct = total.total ? total.over180 / total.total * 100 : 0;
    near.sort(function (a, b) { return b.age - a.age; }); overdue.sort(function (a, b) { return b.age - a.age; });
    return { asOn: P.iso(asOn), labels: labels, edges: edges, groups: list, total: total, undated: undated, future: future, notPending: notPending,
             near: near.slice(0, 500), overdue: overdue.slice(0, 500), nearCount: near.length, overdueCount: overdue.length, deadline: dl };
  };

  // ------------------------------------------------------------ snapshots and trend
  P.snapshot = function (res) {
    var g = {}; res.groups.forEach(function (x) { g[x.name] = { total: x.total, over180: x.over180 }; });
    return { asOn: res.asOn, total: res.total.total, over180: res.total.over180, groups: g };
  };
  // list of snapshots (any order) -> [{asOn,total,over180,delta,deltaOver180,biggestRise:{name,delta},biggestFall}]
  P.trend = function (snaps) {
    var a = snaps.slice().sort(function (x, y) { return x.asOn < y.asOn ? -1 : 1; }), out = [];
    a.forEach(function (sn, i) {
      var row = { asOn: sn.asOn, total: sn.total, over180: sn.over180, delta: null, deltaOver180: null, biggestRise: null, biggestFall: null };
      if (i > 0) {
        var p = a[i - 1]; row.delta = sn.total - p.total; row.deltaOver180 = sn.over180 - p.over180;
        var best = null, worst = null;
        Object.keys(Object.assign({}, p.groups, sn.groups)).forEach(function (k) {
          var d = ((sn.groups[k] || {}).total || 0) - ((p.groups[k] || {}).total || 0);
          if (d > 0 && (!best || d > best.delta)) best = { name: k, delta: d };
          if (d < 0 && (!worst || d < worst.delta)) worst = { name: k, delta: d };
        });
        row.biggestRise = best; row.biggestFall = worst;
      }
      out.push(row);
    });
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
