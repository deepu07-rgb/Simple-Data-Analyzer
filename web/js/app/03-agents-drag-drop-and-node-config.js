// =====================================================================
//  BATCH 4 — Drag-drop: module drawer → Agents canvas + node move
// =====================================================================

var _ddDrag = { active: false, moduleId: null, ghost: null };

function _ddDragStart(e, moduleId) {
  if (_ddDrag.active) return;
  var mod = DD.modules[moduleId];
  if (!mod) return;
  e.preventDefault();
  _ddDrag.active = true;
  _ddDrag.moduleId = moduleId;

  var ghost = document.createElement('div');
  ghost.id = 'dd-drag-ghost';
  ghost.innerHTML =
    '<div style="width:60px;height:60px;border-radius:50%;display:flex;align-items:center;' +
    'justify-content:center;background:var(--glass-bg);border:2px solid ' + mod.color + ';' +
    'backdrop-filter:blur(16px);box-shadow:0 0 24px ' + mod.color + '55,0 8px 24px rgba(0,0,0,.5)">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="' + mod.color + '" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" width="22" height="22">' + mod.icon + '</svg></div>';
  ghost.style.left = (e.clientX - 30) + 'px';
  ghost.style.top  = (e.clientY - 30) + 'px';
  document.body.appendChild(ghost);
  _ddDrag.ghost = ghost;

  var canvas = document.getElementById('dd-agents-canvas');
  if (canvas) canvas.classList.add('dd-drop-target');

  document.addEventListener('pointermove', _ddDragMove);
  document.addEventListener('pointerup',   _ddDragEnd);
}

function _ddDragMove(e) {
  if (!_ddDrag.active || !_ddDrag.ghost) return;
  _ddDrag.ghost.style.left = (e.clientX - 30) + 'px';
  _ddDrag.ghost.style.top  = (e.clientY - 30) + 'px';
}

function _ddDragEnd(e) {
  if (!_ddDrag.active) return;
  document.removeEventListener('pointermove', _ddDragMove);
  document.removeEventListener('pointerup',   _ddDragEnd);

  if (_ddDrag.ghost) { _ddDrag.ghost.remove(); _ddDrag.ghost = null; }

  var canvas = document.getElementById('dd-agents-canvas');
  if (canvas) {
    canvas.classList.remove('dd-drop-target');
    var rect = canvas.getBoundingClientRect();
    if (e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top  && e.clientY <= rect.bottom) {
      if (!window.DD || DD.workspace.view !== 'agents') switchDDView('agents');
      var x = Math.round((e.clientX - rect.left - 30) / 8) * 8;
      var y = Math.round((e.clientY - rect.top  - 30) / 8) * 8;
      x = Math.max(0, Math.min(x, rect.width  - 60));
      y = Math.max(0, Math.min(y, rect.height - 60));
      _ddCreateNode(_ddDrag.moduleId, x, y);
    }
  }
  _ddDrag.active = false;
  _ddDrag.moduleId = null;
}

// ── Create & render a node ────────────────────────────────────────
function _ddCreateNode(moduleId, x, y) {
  window.DD = window.DD || {};
  DD.workspace = DD.workspace || { view: 'agents', nodes: [], edges: [] };
  var id = 'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5);
  var node = { id: id, moduleId: moduleId, x: x, y: y, bindings: {}, config: {}, status: 'idle', result: null };
  DD.workspace.nodes.push(node);
  _ddRenderNode(node, true);
  _ddSaveNodes();
  _ddUpdateCanvasEmpty();
}

function _ddRenderNode(node, entering) {
  var layer = document.getElementById('dd-nodes-layer');
  if (!layer) return;
  var mod = DD.modules[node.moduleId];
  if (!mod) return;
  var lang = (typeof uiLanguage !== 'undefined') ? uiLanguage : 'en';
  var name = (lang === 'hi' && mod.name.hi) ? mod.name.hi : mod.name.en;
  var catMeta = (DD._catMeta && DD._catMeta[mod.category]) || {};
  var glow = catMeta.glow || 'rgba(221,184,255,.22)';
  var delay = (Math.random() * 3.5).toFixed(2) + 's';

  var el = document.createElement('div');
  el.className = 'dd-node' + (entering ? ' dd-node-entering' : '');
  el.id = 'ddnode-' + node.id;
  el.dataset.nodeId = node.id;
  el.style.cssText = 'left:' + node.x + 'px;top:' + node.y + 'px' +
    ';--dd-mod-color:' + mod.color + ';--dd-mod-glow:' + glow + ';--dd-node-delay:' + delay;

  el.innerHTML =
    '<div class="dd-node-wrap">' +
      '<div class="dd-anchor dd-anchor-in" title="Input"></div>' +
      '<div class="dd-node-bubble">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="' + mod.color + '" stroke-width="1.8" ' +
        'stroke-linecap="round" stroke-linejoin="round" width="22" height="22">' + mod.icon + '</svg>' +
      '</div>' +
      '<div class="dd-node-status ' + (node.status || 'idle') + '"></div>' +
      '<button class="dd-node-delete" title="Remove">\xd7</button>' +
      '<div class="dd-anchor dd-anchor-out" title="Drag to connect"></div>' +
    '</div>' +
    '<div class="dd-node-label">' + name + '</div>';

  el.querySelector('.dd-node-delete').addEventListener('click', function(ev) {
    ev.stopPropagation();
    _ddDeleteNode(node.id);
  });

  // Batch 6: edge-draw from output anchor
  var anchorOut = el.querySelector('.dd-anchor-out');
  if (anchorOut) anchorOut.addEventListener('pointerdown', function(ev) {
    ev.preventDefault(); ev.stopPropagation();
    if (typeof _ddEdgeDragStart === 'function') _ddEdgeDragStart(ev, node.id);
  });

  el.addEventListener('pointerdown', function(ev) {
    if (ev.target.closest && ev.target.closest('.dd-node-delete')) return;
    if (ev.target.closest && ev.target.closest('.dd-anchor-out')) return;
    _ddNodeDragStart(ev, node.id);
  });

  if (entering) setTimeout(function() { el.classList.remove('dd-node-entering'); }, 360);
  layer.appendChild(el);
}

// ── Reposition a placed node ──────────────────────────────────────
var _ddNodeDrag = { active: false, nodeId: null, startX: 0, startY: 0, origX: 0, origY: 0 };

function _ddNodeDragStart(e, nodeId) {
  e.preventDefault();
  e.stopPropagation();
  var el   = document.getElementById('ddnode-' + nodeId);
  var node = DD.workspace && DD.workspace.nodes && DD.workspace.nodes.find(function(n) { return n.id === nodeId; });
  if (!el || !node) return;
  el.classList.add('dd-node-dragging');
  _ddNodeDrag = { active: true, nodeId: nodeId, startX: e.clientX, startY: e.clientY, origX: node.x, origY: node.y };
  document.addEventListener('pointermove', _ddNodeDragMove);
  document.addEventListener('pointerup',   _ddNodeDragEnd);
}

var _ddEdgeRAF = null;

function _ddNodeDragMove(e) {
  if (!_ddNodeDrag.active) return;
  var node   = DD.workspace.nodes.find(function(n) { return n.id === _ddNodeDrag.nodeId; });
  var el     = document.getElementById('ddnode-' + _ddNodeDrag.nodeId);
  var canvas = document.getElementById('dd-agents-canvas');
  if (!node || !el || !canvas) return;
  var x = Math.round((_ddNodeDrag.origX + e.clientX - _ddNodeDrag.startX) / 8) * 8;
  var y = Math.round((_ddNodeDrag.origY + e.clientY - _ddNodeDrag.startY) / 8) * 8;
  x = Math.max(0, Math.min(x, canvas.offsetWidth  - 60));
  y = Math.max(0, Math.min(y, canvas.offsetHeight - 60));
  node.x = x; node.y = y;
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
  // Batch 14: RAF gate — one edge redraw per animation frame
  if (_ddEdgeRAF) cancelAnimationFrame(_ddEdgeRAF);
  _ddEdgeRAF = requestAnimationFrame(function() {
    if (typeof _ddRedrawEdges === 'function') _ddRedrawEdges();
    _ddEdgeRAF = null;
  });
  var resCard = document.getElementById('ddres-' + _ddNodeDrag.nodeId);
  if (resCard) { resCard.style.left = (x+72) + 'px'; resCard.style.top = Math.max(0,y-10) + 'px'; }
}

function _ddNodeDragEnd(e) {
  if (!_ddNodeDrag.active) return;
  document.removeEventListener('pointermove', _ddNodeDragMove);
  document.removeEventListener('pointerup',   _ddNodeDragEnd);
  var el = document.getElementById('ddnode-' + _ddNodeDrag.nodeId);
  if (el) el.classList.remove('dd-node-dragging');
  _ddNodeDrag.active = false;

  // Click detection: movement < 6px → open config popover
  var dist = e ? Math.hypot(e.clientX - _ddNodeDrag.startX, e.clientY - _ddNodeDrag.startY) : 99;
  if (dist < 6) {
    var node = DD.workspace && DD.workspace.nodes && DD.workspace.nodes.find(function(n){return n.id===_ddNodeDrag.nodeId;});
    if (node) {
      node.x = _ddNodeDrag.origX; node.y = _ddNodeDrag.origY;
      if (el) { el.style.left = node.x + 'px'; el.style.top = node.y + 'px'; }
      if (typeof _ddOpenPopover === 'function') _ddOpenPopover(node);
    }
    return;
  }
  _ddSaveNodes();
}

// ── Delete ────────────────────────────────────────────────────────
function _ddDeleteNode(nodeId) {
  if (!window.DD || !DD.workspace) return;
  _ddClosePopover && _ddClosePopover();
  DD.workspace.nodes = DD.workspace.nodes.filter(function(n) { return n.id !== nodeId; });
  // Batch 6: remove connected edges
  DD.workspace.edges = (DD.workspace.edges || []).filter(function(e) { return e.from !== nodeId && e.to !== nodeId; });
  if (typeof _ddRedrawEdges === 'function') _ddRedrawEdges();
  var el = document.getElementById('ddnode-' + nodeId);
  if (el) el.remove();
  var res = document.getElementById('ddres-' + nodeId);
  if (res) res.remove();
  _ddSaveNodes();
  _ddUpdateCanvasEmpty();
}

// ── Canvas empty-state ────────────────────────────────────────────
function _ddUpdateCanvasEmpty() {
  var empty = document.querySelector('#dd-agents-canvas .dd-agents-empty');
  if (!empty) return;
  var hasNodes = window.DD && DD.workspace && DD.workspace.nodes && DD.workspace.nodes.length > 0;
  empty.style.display = hasNodes ? 'none' : '';
  // Batch 6: show Run Agent button whenever there are nodes
  if (typeof _ddUpdateRunAgentBtn === 'function') _ddUpdateRunAgentBtn();
}

// ── Persistence ───────────────────────────────────────────────────
var _ddSaveTimer = null;
function _ddSaveNodes() {
  clearTimeout(_ddSaveTimer);
  _ddSaveTimer = setTimeout(function() {
    try {
      var saved = localStorage.getItem('sda_state_v2');
      var s = saved ? JSON.parse(saved) : {};
      s.ddNodes = (window.DD && DD.workspace) ? DD.workspace.nodes  : [];
      s.ddEdges = (window.DD && DD.workspace) ? DD.workspace.edges || [] : [];
      s.ddView  = (window.DD && DD.workspace) ? DD.workspace.view   : 'sheet';
      localStorage.setItem('sda_state_v2', JSON.stringify(s));
    } catch(e) { /* quota */ }
  }, 400);
}

function _ddRestoreNodes() {
  try {
    var saved = localStorage.getItem('sda_state_v2');
    if (!saved) return;
    var s = JSON.parse(saved);
    if (!s.ddNodes || !s.ddNodes.length) return;
    window.DD = window.DD || {};
    DD.workspace = DD.workspace || { view: 'sheet', nodes: [], edges: [] };
    DD.workspace.nodes = s.ddNodes;
    DD.workspace.nodes.forEach(function(node) {
      _ddRenderNode(node, false);
      if (node.result && typeof _ddShowResult === 'function') _ddShowResult(node, node.result);
    });
    // Batch 6: restore edges
    if (s.ddEdges && s.ddEdges.length) {
      DD.workspace.edges = s.ddEdges;
      if (typeof _ddRedrawEdges === 'function') _ddRedrawEdges();
    }
    _ddUpdateCanvasEmpty();
  } catch(e) { /* silently fail */ }
}

// ── Config popover ────────────────────────────────────────────────
function _ddOpenPopover(node) {
  _ddClosePopover();
  var mod = DD.modules[node.moduleId];
  if (!mod) return;
  var lang = (typeof uiLanguage !== 'undefined') ? uiLanguage : 'en';
  var t = function(obj) { return (obj && (obj[lang] || obj.en)) || ''; };
  var el = document.getElementById('ddnode-' + node.id);
  if (!el) return;
  var rect = el.getBoundingClientRect();

  var pop = document.createElement('div');
  pop.className = 'dd-node-popover';
  pop.id = 'dd-popover';

  var html = '<div class="dd-pop-title">' +
    '<span class="dd-pop-title-dot" style="background:' + mod.color + '"></span>' +
    _ddEscHtml(t(mod.name)) + '</div>';

  if (!mod.config || !mod.config.length) {
    html += '<p style="font-size:11px;color:var(--text-muted);margin-bottom:8px">' +
      (lang==='hi' ? 'कोई कॉन्फ़िगरेशन आवश्यक नहीं' : 'No configuration needed') + '</p>';
  } else {
    mod.config.forEach(function(field) {
      var lbl = t(field.label) || field.key;
      html += '<div class="dd-pop-field"><label>' + _ddEscHtml(lbl) + '</label>';
      var saved = node.config && node.config[field.key] !== undefined ? node.config[field.key] : '';
      if (field.type === 'column') {
        html += '<select data-field="' + field.key + '" data-ftype="column">';
        html += '<option value="">' + (lang==='hi' ? '— कॉलम चुनें —' : '— choose column —') + '</option>';
        (typeof headers !== 'undefined' ? headers : []).forEach(function(hdr, ci) {
          html += '<option value="' + ci + '"' + (String(saved) === String(ci) ? ' selected' : '') + '>' + _ddEscHtml(hdr) + '</option>';
        });
        html += '</select>';
      } else if (field.type === 'select') {
        html += '<select data-field="' + field.key + '" data-ftype="select">';
        (field.options || []).forEach(function(opt) {
          html += '<option value="' + _ddEscHtml(opt) + '"' + (saved === opt ? ' selected' : '') + '>' + _ddEscHtml(opt) + '</option>';
        });
        html += '</select>';
      } else if (field.type === 'number') {
        html += '<input type="number" data-field="' + field.key + '" value="' + _ddEscHtml(String(saved)) + '" min="1">';
      } else {
        html += '<input type="text" data-field="' + field.key + '" value="' + _ddEscHtml(String(saved)) + '">';
      }
      html += '</div>';
    });
  }

  html += '<button class="dd-pop-run" id="dd-pop-run-btn">' +
    (lang === 'hi' ? 'चलाएँ / Run' : 'Run / चलाएँ') + '</button>';
  pop.innerHTML = html;

  // Position right of node, clamped to viewport
  var left = rect.right + 10;
  var top  = Math.max(8, rect.top - 20);
  if (left + 290 > window.innerWidth) left = Math.max(8, rect.left - 300);
  if (top + 300 > window.innerHeight) top = Math.max(8, window.innerHeight - 320);
  pop.style.left = left + 'px';
  pop.style.top  = top  + 'px';

  pop._outsideClick = function(e2) {
    if (!pop.contains(e2.target) && !e2.target.closest('#ddnode-' + node.id)) _ddClosePopover();
  };

  pop.querySelector('#dd-pop-run-btn').addEventListener('click', function() {
    node.config = node.config || {};
    pop.querySelectorAll('[data-field]').forEach(function(ctrl) {
      var fk = ctrl.dataset.field, ft = ctrl.dataset.ftype;
      if (ft === 'column') node.config[fk] = ctrl.value !== '' ? parseInt(ctrl.value, 10) : undefined;
      else if (ctrl.type === 'number') node.config[fk] = parseFloat(ctrl.value) || 0;
      else node.config[fk] = ctrl.value;
    });
    _ddClosePopover();
    _ddRunNode(node);
  });

  document.body.appendChild(pop);
  setTimeout(function() { document.addEventListener('pointerdown', pop._outsideClick); }, 60);
}

function _ddClosePopover() {
  var p = document.getElementById('dd-popover');
  if (p) { if (p._outsideClick) document.removeEventListener('pointerdown', p._outsideClick); p.remove(); }
}

// ── Run a single node ─────────────────────────────────────────────
function _ddRunNode(node) {
  var mod = DD.modules[node.moduleId];
  if (!mod) return;
  var lang = (typeof uiLanguage !== 'undefined') ? uiLanguage : 'en';
  _ddUpdateNodeStatus(node.id, 'running');

  var upstream = typeof _ddGetUpstream === 'function' ? _ddGetUpstream(node.id) : [];
  Promise.resolve().then(function() { return mod.run(node, _ddHelpers, upstream); }).then(function(result) {
    node.status = 'done';
    node.result = result;
    _ddUpdateNodeStatus(node.id, 'done');
    _ddShowResult(node, result);
    _ddSaveNodes();
  }).catch(function(err) {
    node.status = 'error';
    node.result = { type:'error',
      display: '<div class="dd-res-error">⚠ ' + _ddEscHtml(err.message || 'Error') + '</div>', raw: null };
    _ddUpdateNodeStatus(node.id, 'error');
    _ddShowResult(node, node.result);
    _ddSaveNodes();
  });
}

function _ddUpdateNodeStatus(nodeId, status) {
  var el = document.getElementById('ddnode-' + nodeId);
  if (el) { var dot = el.querySelector('.dd-node-status'); if (dot) dot.className = 'dd-node-status ' + status; }
  var node = DD.workspace && DD.workspace.nodes && DD.workspace.nodes.find(function(n){return n.id===nodeId;});
  if (node) node.status = status;
}

// ── Result card ───────────────────────────────────────────────────
function _ddShowResult(node, result) {
  var old = document.getElementById('ddres-' + node.id);
  if (old) old.remove();
  var canvas = document.getElementById('dd-agents-canvas');
  if (!canvas || !result || !result.display) return;
  var card = document.createElement('div');
  card.className = 'dd-result-card';
  card.id = 'ddres-' + node.id;
  card.style.left = (node.x + 72) + 'px';
  card.style.top  = Math.max(0, node.y - 10) + 'px';
  card.innerHTML = result.display;
  if (result.type !== 'error') {
    var handle = document.createElement('div');
    handle.className = 'dd-res-insert-handle';
    handle.setAttribute('title', 'Drag to insert into sheet / शीट में डालने के लिए खींचें');
    handle.textContent = '↓ To Sheet / शीट में';
    handle.addEventListener('pointerdown', function(e) { _ddResInsertStart(e, node.id); });
    card.appendChild(handle);
  }
  canvas.appendChild(card);
}

// ── Bilingual node labels (called from setUiLanguage) ────────────
function _ddUpdateNodeLabels() {
  if (!window.DD || !DD.workspace || !DD.workspace.nodes) return;
  var lang = (typeof uiLanguage !== 'undefined') ? uiLanguage : 'en';
  DD.workspace.nodes.forEach(function(node) {
    var mod = DD.modules && DD.modules[node.moduleId];
    if (!mod) return;
    var el = document.getElementById('ddnode-' + node.id);
    if (!el) return;
    var lbl = el.querySelector('.dd-node-label');
    if (lbl) lbl.textContent = (lang === 'hi' && mod.name.hi) ? mod.name.hi : mod.name.en;
  });
}

// ─── Batch 6: Edge system + Predict modules + Agent pipeline runner ───────────

// series helper: prefer upstream result, fall back to col()
_ddHelpers.series = function(node, upstream) {
  if (upstream && upstream.length) {
    for (var i = 0; i < upstream.length; i++) {
      var r = upstream[i].result;
      if (r && r.raw && Array.isArray(r.raw.series)) return r.raw.series;
      if (r && r.raw && Array.isArray(r.raw.values)) return r.raw.values;
    }
  }
  return _ddHelpers.col(node);
};

// ── Predict module implementations ────────────────────────────────────────────
(function() {
  var M = window.DD && DD.modules;
  if (!M) return;

  if (M.linreg_project) M.linreg_project.run = function(node, h, upstream) {
    var cfg = node.config || {};
    var k = parseInt(cfg.k || 3, 10); if (k < 1) k = 1;
    var raw = h.series(node, upstream);
    var y = h.nums(raw);
    if (y.length < 2) return {type:'error',display:'<div class="dd-res-error">⚠ Need ≥2 numeric values / कम से कम 2 संख्याएँ चाहिए</div>',raw:null};
    var n=y.length,sumX=0,sumY=0,sumXY=0,sumXX=0,i;
    for(i=0;i<n;i++){sumX+=i;sumY+=y[i];sumXY+=i*y[i];sumXX+=i*i;}
    var denom=n*sumXX-sumX*sumX;
    var m=denom===0?0:(n*sumXY-sumX*sumY)/denom;
    var b=(sumY-m*sumX)/n;
    var ybar=sumY/n,ssTot=0,ssRes=0;
    for(i=0;i<n;i++){var yh=m*i+b;ssTot+=(y[i]-ybar)*(y[i]-ybar);ssRes+=(y[i]-yh)*(y[i]-yh);}
    var r2=ssTot===0?1:1-ssRes/ssTot;
    var proj=[];
    for(i=n;i<n+k;i++) proj.push(+(m*i+b).toFixed(4));
    var label={en:'Linear Projection (next '+k+')',hi:'रेखीय प्रक्षेपण (अगले '+k+')'};
    var disp='<div class="dd-res-big">'+proj.map(function(v){return '<span>'+v+'</span>';}).join(' ')+'</div>'+
      '<div class="dd-res-sub">R²: '+(r2*100).toFixed(1)+'% | slope: '+m.toFixed(4)+'</div>';
    return {type:'value',value:proj,label:label,display:disp,raw:{series:y,proj:proj,m:m,b:b,r2:r2}};
  };

  if (M.moving_avg) M.moving_avg.run = function(node, h, upstream) {
    var cfg=node.config||{};
    var w=parseInt(cfg.window||3,10); if(w<1)w=1;
    var raw=h.series(node,upstream);
    var y=h.nums(raw);
    if(y.length<w) return {type:'error',display:'<div class="dd-res-error">⚠ Not enough data / पर्याप्त डेटा नहीं</div>',raw:null};
    var ma=[];
    for(var i=w-1;i<y.length;i++){var s=0;for(var j=i-w+1;j<=i;j++)s+=y[j];ma.push(+(s/w).toFixed(4));}
    var label={en:'Moving Avg (w='+w+')',hi:'चलती औसत (w='+w+')'};
    var disp='<div class="dd-res-big">'+ma.slice(-3).join(' → ')+'</div>'+
      '<div class="dd-res-sub">Last 3 of '+ma.length+' values / मान</div>';
    return {type:'series',value:ma,label:label,display:disp,raw:{series:y,values:ma,window:w}};
  };

  if (M.growth_rate) M.growth_rate.run = function(node, h, upstream) {
    var raw=h.series(node,upstream);
    var y=h.nums(raw);
    if(y.length<2) return {type:'error',display:'<div class="dd-res-error">⚠ Need ≥2 values / कम से कम 2 चाहिए</div>',raw:null};
    var rates=[];
    for(var i=1;i<y.length;i++){
      if(y[i-1]===0){rates.push(null);continue;}
      rates.push(+((y[i]-y[i-1])/Math.abs(y[i-1])*100).toFixed(2));
    }
    var valid=rates.filter(function(r){return r!==null;});
    var avg=valid.length?+(valid.reduce(function(a,c){return a+c;},0)/valid.length).toFixed(2):0;
    var label={en:'Growth Rate',hi:'वृद्धि दर'};
    var disp='<div class="dd-res-big">'+avg+'% <span style="font-size:.75em">avg</span></div>'+
      '<div class="dd-res-sub">'+valid.length+' periods / अवधियाँ</div>';
    return {type:'value',value:avg,label:label,display:disp,raw:{series:y,rates:rates,avg:avg}};
  };

  if (M.trend) M.trend.run = function(node, h, upstream) {
    var raw=h.series(node,upstream);
    var y=h.nums(raw);
    if(y.length<2) return {type:'error',display:'<div class="dd-res-error">⚠ Need ≥2 values / कम से कम 2 चाहिए</div>',raw:null};
    var n=y.length,sumX=0,sumY=0,sumXY=0,sumXX=0,i;
    for(i=0;i<n;i++){sumX+=i;sumY+=y[i];sumXY+=i*y[i];sumXX+=i*i;}
    var denom=n*sumXX-sumX*sumX;
    var slope=denom===0?0:(n*sumXY-sumX*sumY)/denom;
    var dir=slope>0.0001?'↑ Uptrend / ऊर्ध्व प्रवृत्ति':slope<-0.0001?'↓ Downtrend / अधोगामी प्रवृत्ति':'→ Flat / स्थिर';
    var label={en:'Trend',hi:'प्रवृत्ति'};
    var disp='<div class="dd-res-big">'+dir+'</div>'+
      '<div class="dd-res-sub">slope: '+slope.toFixed(4)+'</div>';
    return {type:'value',value:slope,label:label,display:disp,raw:{series:y,slope:slope}};
  };
})();

