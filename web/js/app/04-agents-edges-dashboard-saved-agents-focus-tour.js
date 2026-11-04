// =====================================================================
//  BATCH 22 — Transform, Visualize, Report & AI module compute
// =====================================================================

// ── TRANSFORM ─────────────────────────────────────────────────────────────────
(function() {
  var M = window.DD && DD.modules;
  if (!M) return;

  if (M.filter) M.filter.run = function(node, h, upstream) {
    var cfg = node.config || {};
    var ci = parseInt(cfg.col, 10);
    if (!Number.isFinite(ci) || ci < 0 || ci >= headers.length)
      return {type:'error',display:'<div class="dd-res-error">&#9888; Pick a column / कॉलम चुनें</div>',raw:null};
    var op = cfg.op || '=', val = String(cfg.val || '');
    var matched = [];
    rawData.forEach(function(row, i) {
      var cell = String(row[ci] == null ? '' : row[ci]).trim();
      var nc = parseFloat(cell.replace(/[,\s₹$%]/g,'')), nv = parseFloat(val.replace(/[,\s₹$%]/g,''));
      var ok = false;
      if (op === 'is empty') ok = cell === '';
      else if (op === 'contains') ok = cell.toLowerCase().indexOf(val.toLowerCase()) !== -1;
      else if (op === '=') ok = cell.toLowerCase() === val.toLowerCase() || (Number.isFinite(nc) && Number.isFinite(nv) && nc === nv);
      else if (op === '≠') ok = cell.toLowerCase() !== val.toLowerCase();
      else if (op === '>') ok = Number.isFinite(nc) && Number.isFinite(nv) && nc > nv;
      else if (op === '<') ok = Number.isFinite(nc) && Number.isFinite(nv) && nc < nv;
      if (ok) matched.push(i);
    });
    var cols4 = headers.slice(0,4);
    var sample = matched.slice(0,5).map(function(i) {
      return '<tr>'+cols4.map(function(_,j){return '<td>'+_ddEscHtml(String(rawData[i][j]||''))+'</td>';}).join('')+'</tr>';
    }).join('');
    return {type:'table', value:matched.length, label:{en:'Filtered',hi:'फ़िल्टर्ड'},
      display:'<div class="dd-res-mod">Filter · फ़िल्टर</div>'+
        '<div class="dd-res-big">'+matched.length+'</div>'+
        '<div class="dd-res-sub">rows matched · पंक्तियाँ मिलीं</div>'+
        (sample?'<table class="dd-res-table"><tr>'+cols4.map(function(c){return '<th>'+_ddEscHtml(c)+'</th>';}).join('')+'</tr>'+sample+'</table>':''),
      raw:{count:matched.length, rowIndices:matched}};
  };

  if (M.sort) M.sort.run = function(node, h, upstream) {
    var cfg = node.config || {};
    var ci = parseInt(cfg.col, 10);
    if (!Number.isFinite(ci) || ci < 0 || ci >= headers.length)
      return {type:'error',display:'<div class="dd-res-error">&#9888; Pick a column / कॉलम चुनें</div>',raw:null};
    var asc = String(cfg.dir||'').indexOf('Descend') === -1;
    var indices = rawData.map(function(_,i){return i;});
    var colNums = rawData.map(function(r){return parseFloat(String(r[ci]||'').replace(/[,\s₹$%]/g,''));});
    var allNum = colNums.every(function(v){return Number.isFinite(v);});
    indices.sort(function(a,b){
      var va = allNum ? colNums[a] : String(rawData[a][ci]||'').toLowerCase();
      var vb = allNum ? colNums[b] : String(rawData[b][ci]||'').toLowerCase();
      return asc ? (va>vb?1:va<vb?-1:0) : (va<vb?1:va>vb?-1:0);
    });
    var cols4 = headers.slice(0,4);
    var top5 = indices.slice(0,5).map(function(i){
      return '<tr>'+cols4.map(function(_,j){return '<td>'+_ddEscHtml(String(rawData[i][j]||''))+'</td>';}).join('')+'</tr>';
    }).join('');
    return {type:'table', value:indices.length, label:{en:'Sorted',hi:'क्रमबद्ध'},
      display:'<div class="dd-res-mod">Sort · क्रमबद्ध</div>'+
        '<div class="dd-res-sub">'+(asc?'&#9650; Ascending':'&#9660; Descending')+' by '+_ddEscHtml(headers[ci])+'</div>'+
        '<table class="dd-res-table"><tr>'+cols4.map(function(c){return '<th>'+_ddEscHtml(c)+'</th>';}).join('')+'</tr>'+top5+'</table>'+
        '<div class="dd-res-sub" style="margin-top:4px">Top 5 of '+indices.length+' rows</div>',
      raw:{count:indices.length, sortedIndices:indices}};
  };

  if (M.groupby) M.groupby.run = function(node, h, upstream) {
    var cfg = node.config || {};
    var gi = parseInt(cfg.groupCol, 10), ai = parseInt(cfg.aggCol, 10);
    var fn = (cfg.fn || 'Sum').split('/')[0].trim().toLowerCase();
    if (!Number.isFinite(gi) || gi < 0 || gi >= headers.length)
      return {type:'error',display:'<div class="dd-res-error">&#9888; Pick Group By column / समूह कॉलम चुनें</div>',raw:null};
    var hasAgg = Number.isFinite(ai) && ai >= 0 && ai < headers.length;
    var grp = {};
    rawData.forEach(function(row) {
      var key = String(row[gi] == null ? '' : row[gi]).trim() || '(blank)';
      if (!grp[key]) grp[key] = [];
      if (hasAgg) {
        var v = parseFloat(String(row[ai]||'').replace(/[,\s₹$%]/g,''));
        grp[key].push(Number.isFinite(v) ? v : null);
      } else { grp[key].push(1); }
    });
    var rows = Object.keys(grp).map(function(key) {
      var vs = grp[key].filter(function(v){return v!==null;});
      var agg;
      if (fn==='count') agg = grp[key].length;
      else if (fn==='average') agg = vs.length ? vs.reduce(function(a,b){return a+b;},0)/vs.length : 0;
      else if (fn==='min') agg = vs.length ? Math.min.apply(null,vs) : 0;
      else if (fn==='max') agg = vs.length ? Math.max.apply(null,vs) : 0;
      else agg = vs.reduce(function(a,b){return a+b;},0);
      return {key:key, agg:agg};
    }).sort(function(a,b){return b.agg-a.agg;});
    var fnLabel = (cfg.fn||'Sum').split('/')[0].trim();
    var aggHdr = hasAgg ? fnLabel+' of '+headers[ai] : fnLabel;
    var tbl = rows.slice(0,8).map(function(r){return '<tr><td>'+_ddEscHtml(r.key)+'</td><td>'+_ddFmt(r.agg,2)+'</td></tr>';}).join('');
    return {type:'table', value:rows.length, label:{en:'Grouped',hi:'समूहित'},
      display:'<div class="dd-res-mod">Group &amp; Total · समूह व योग</div>'+
        '<div class="dd-res-big">'+rows.length+'</div><div class="dd-res-sub">groups · समूह</div>'+
        '<table class="dd-res-table"><tr><th>'+_ddEscHtml(headers[gi])+'</th><th>'+_ddEscHtml(aggHdr)+'</th></tr>'+tbl+'</table>'+
        (rows.length>8?'<div class="dd-res-sub">&hellip; and '+(rows.length-8)+' more</div>':''),
      raw:{groups:rows, aggFn:fn, groupCol:headers[gi], aggCol:hasAgg?headers[ai]:''}};
  };

  if (M.normalize) M.normalize.run = function(node, h, upstream) {
    var nums = h.nums(h.col(node));
    if (nums.length < 2) return {type:'error',display:'<div class="dd-res-error">&#9888; Need &#8805;2 numeric values / कम से कम 2 चाहिए</div>',raw:null};
    var mn=Math.min.apply(null,nums), mx=Math.max.apply(null,nums), r=mx-mn;
    var norm = nums.map(function(v){return r===0?0:+((v-mn)/r).toFixed(6);});
    return {type:'series', value:norm, label:{en:'Normalized',hi:'सामान्यीकृत'},
      display:'<div class="dd-res-mod">Normalize · सामान्यीकरण</div>'+
        '<div class="dd-res-big">0 &#8594; 1</div>'+
        '<div class="dd-res-sub">min='+_ddFmt(mn,2)+' max='+_ddFmt(mx,2)+'</div>'+
        '<div class="dd-res-sub" style="margin-top:4px">Sample: '+norm.slice(0,4).map(function(v){return v.toFixed(3);}).join(', ')+(norm.length>4?'&hellip;':'')+'</div>',
      raw:{series:norm, values:norm, min:mn, max:mx}};
  };

  if (M.convert_krutidev) M.convert_krutidev.run = function(node, h, upstream) {
    var cfg = node.config || {};
    var vals = h.col(node);
    if (!vals.length) return {type:'error',display:'<div class="dd-res-error">&#9888; Column is empty / कॉलम खाली है</div>',raw:null};
    var toUni = String(cfg.dir||'').indexOf('Unicode →') === -1;
    var converted = vals.map(function(v) {
      var s = String(v == null ? '' : v);
      try { return toUni ? (typeof convertKrutidevToUnicode==='function'?convertKrutidevToUnicode(s):s) : (typeof convertUnicodeToKrutidev==='function'?convertUnicodeToKrutidev(s):s); }
      catch(e) { return s; }
    });
    var changed = converted.filter(function(v,i){return v!==String(vals[i]===null||vals[i]===undefined?'':vals[i]);}).length;
    var dirLabel = toUni ? 'Krutidev → Unicode' : 'Unicode → Krutidev';
    return {type:'series', value:changed, label:{en:'Converted',hi:'रूपांतरित'},
      display:'<div class="dd-res-mod">Krutidev Convert · कृतिदेव रूपांतरण</div>'+
        '<div class="dd-res-big">'+changed+'</div>'+
        '<div class="dd-res-sub">'+dirLabel+' · '+changed+' cells changed</div>'+
        '<div class="dd-res-sub" style="margin-top:4px">'+converted.slice(0,3).map(function(v){return _ddEscHtml(String(v).slice(0,18));}).join(' | ')+'</div>',
      raw:{series:converted, values:converted, changed:changed}};
  };
})();

// ── VISUALIZE ────────────────────────────────────────────────────────────────
(function() {
  var M = window.DD && DD.modules;
  if (!M) return;

  var _VC = ['#ddb8ff','#4cd7f6','#34d399','#fbbf24','#f472b6','#fb923c','#a78bfa'];

  function _ddSvgAxes(W,H,PL,PR,PT,PB) {
    return '<line x1="'+PL+'" y1="'+PT+'" x2="'+PL+'" y2="'+(H-PB)+'" stroke="rgba(255,255,255,.12)" stroke-width="1"/>'+
      '<line x1="'+PL+'" y1="'+(H-PB)+'" x2="'+(W-PR)+'" y2="'+(H-PB)+'" stroke="rgba(255,255,255,.12)" stroke-width="1"/>';
  }

  if (M.bar) M.bar.run = function(node, h, upstream) {
    var cfg=node.config||{};
    var xi=parseInt(cfg.xCol,10), yi=parseInt(cfg.yCol,10);
    if (!Number.isFinite(xi)||xi<0||!Number.isFinite(yi)||yi<0)
      return {type:'error',display:'<div class="dd-res-error">&#9888; Pick X and Y columns / X और Y चुनें</div>',raw:null};
    var W=220,H=82,PL=28,PR=6,PT=6,PB=18,cw=W-PL-PR,ch=H-PT-PB;
    var data=rawData.slice(0,60).map(function(r){return {lbl:String(r[xi]||''),val:parseFloat(String(r[yi]||'').replace(/[,\s₹$%]/g,''))};}).filter(function(d){return Number.isFinite(d.val);});
    if (!data.length) return {type:'error',display:'<div class="dd-res-error">&#9888; No numeric Y values</div>',raw:null};
    var mx=Math.max.apply(null,data.map(function(d){return d.val;}));
    var mn=Math.min(0,Math.min.apply(null,data.map(function(d){return d.val;})));
    var rv=mx-mn||1;
    var bw=Math.max(2,cw/data.length-1.5);
    var bars=data.map(function(d,i){
      var bx=(PL+(cw/data.length)*i+(cw/data.length-bw)/2).toFixed(1);
      var by=(PT+ch-((d.val-mn)/rv)*ch).toFixed(1);
      var bh=Math.max(1,(H-PB)-parseFloat(by)).toFixed(1);
      return '<rect x="'+bx+'" y="'+by+'" width="'+bw.toFixed(1)+'" height="'+bh+'" rx="1" fill="#ddb8ff" opacity=".8"/>';
    }).join('');
    var base=(PT+ch-((0-mn)/rv)*ch).toFixed(1);
    var svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' '+H+'" style="width:100%;height:'+H+'px">'+_ddSvgAxes(W,H,PL,PR,PT,PB)+bars+
      '<line x1="'+PL+'" y1="'+base+'" x2="'+(W-PR)+'" y2="'+base+'" stroke="rgba(255,255,255,.15)" stroke-width=".5" stroke-dasharray="2 2"/>'+
      '<text x="'+(PL-2)+'" y="'+(PT+5)+'" text-anchor="end" font-size="7" fill="rgba(255,255,255,.4)">'+_ddFmt(mx,0)+'</text>'+
      '<text x="'+(PL-2)+'" y="'+(H-PB)+'" text-anchor="end" font-size="7" fill="rgba(255,255,255,.4)">'+_ddFmt(mn,0)+'</text>'+
      (data.length?'<text x="'+(PL+(cw/data.length)*0.5).toFixed(1)+'" y="'+(H-2)+'" text-anchor="middle" font-size="6" fill="rgba(255,255,255,.35)">'+_ddEscHtml(String(data[0].lbl).slice(0,6))+'</text>':'')+
      (data.length>1?'<text x="'+(PL+(cw/data.length)*(data.length-1)+(cw/data.length)*0.5).toFixed(1)+'" y="'+(H-2)+'" text-anchor="middle" font-size="6" fill="rgba(255,255,255,.35)">'+_ddEscHtml(String(data[data.length-1].lbl).slice(0,6))+'</text>':'')+
      '</svg>';
    return {type:'chart',value:data.length,label:{en:'Bar Chart',hi:'बार चार्ट'},
      display:'<div class="dd-res-mod">Bar Chart · बार चार्ट</div>'+svg+'<div class="dd-res-sub">'+data.length+' values · '+_ddEscHtml(headers[xi])+' vs '+_ddEscHtml(headers[yi])+'</div>',
      raw:{labels:data.map(function(d){return d.lbl;}),values:data.map(function(d){return d.val;})}};
  };

  if (M.line) M.line.run = function(node, h, upstream) {
    var cfg=node.config||{};
    var xi=parseInt(cfg.xCol,10), yi=parseInt(cfg.yCol,10);
    if (!Number.isFinite(xi)||xi<0||!Number.isFinite(yi)||yi<0)
      return {type:'error',display:'<div class="dd-res-error">&#9888; Pick X and Y columns / X और Y चुनें</div>',raw:null};
    var W=220,H=82,PL=28,PR=6,PT=6,PB=18,cw=W-PL-PR,ch=H-PT-PB;
    var data=rawData.slice(0,200).map(function(r){return {lbl:String(r[xi]||''),val:parseFloat(String(r[yi]||'').replace(/[,\s₹$%]/g,''))};}).filter(function(d){return Number.isFinite(d.val);});
    if (data.length<2) return {type:'error',display:'<div class="dd-res-error">&#9888; Need &#8805;2 values / कम से कम 2 चाहिए</div>',raw:null};
    var mx=Math.max.apply(null,data.map(function(d){return d.val;}));
    var mn=Math.min.apply(null,data.map(function(d){return d.val;}));
    var rv=mx-mn||1;
    var pts=data.map(function(d,i){return [(PL+(cw/(data.length-1))*i).toFixed(1),(PT+ch-((d.val-mn)/rv)*ch).toFixed(1)];});
    var polyline=pts.map(function(p){return p[0]+','+p[1];}).join(' ');
    var areaPath='M '+pts[0][0]+','+pts[0][1]+' L '+pts.map(function(p){return p[0]+','+p[1];}).join(' L ')+' L '+(PL+cw).toFixed(1)+','+(H-PB)+' L '+PL+','+(H-PB)+' Z';
    var gid='llg'+String(node.id||'0').replace(/\W/g,'');
    var svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' '+H+'" style="width:100%;height:'+H+'px">'+
      '<defs><linearGradient id="'+gid+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ddb8ff" stop-opacity=".22"/><stop offset="100%" stop-color="#ddb8ff" stop-opacity=".01"/></linearGradient></defs>'+
      _ddSvgAxes(W,H,PL,PR,PT,PB)+
      '<path d="'+areaPath+'" fill="url(#'+gid+')"/>'+
      '<polyline points="'+polyline+'" fill="none" stroke="#ddb8ff" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>'+
      '<text x="'+(PL-2)+'" y="'+(PT+5)+'" text-anchor="end" font-size="7" fill="rgba(255,255,255,.4)">'+_ddFmt(mx,0)+'</text>'+
      '<text x="'+(PL-2)+'" y="'+(H-PB)+'" text-anchor="end" font-size="7" fill="rgba(255,255,255,.4)">'+_ddFmt(mn,0)+'</text>'+
      '</svg>';
    return {type:'chart',value:data.length,label:{en:'Line Chart',hi:'लाइन चार्ट'},
      display:'<div class="dd-res-mod">Line Chart · लाइन चार्ट</div>'+svg+'<div class="dd-res-sub">'+data.length+' points · '+_ddEscHtml(headers[yi])+'</div>',
      raw:{labels:data.map(function(d){return d.lbl;}),values:data.map(function(d){return d.val;})}};
  };

  if (M.pie) M.pie.run = function(node, h, upstream) {
    var cfg=node.config||{};
    var ci=parseInt(cfg.col,10);
    if (!Number.isFinite(ci)||ci<0||ci>=headers.length)
      return {type:'error',display:'<div class="dd-res-error">&#9888; Pick a column / कॉलम चुनें</div>',raw:null};
    var freq={};
    rawData.forEach(function(r){var k=String(r[ci]===null||r[ci]===undefined?'(blank)':r[ci]).trim()||'(blank)';freq[k]=(freq[k]||0)+1;});
    var slices=Object.entries(freq).sort(function(a,b){return b[1]-a[1];}).slice(0,6);
    var total=slices.reduce(function(s,e){return s+e[1];},0)||1;
    var W=220,H=82,CX=40,CY=41,R=35;
    var angle=-Math.PI/2, paths=[];
    slices.forEach(function(e,i){
      var sw=(e[1]/total)*2*Math.PI;
      var x1=(CX+R*Math.cos(angle)).toFixed(2), y1=(CY+R*Math.sin(angle)).toFixed(2);
      var a2=angle+sw;
      var x2=(CX+R*Math.cos(a2)).toFixed(2), y2=(CY+R*Math.sin(a2)).toFixed(2);
      paths.push('<path d="M '+CX+','+CY+' L '+x1+','+y1+' A '+R+','+R+' 0 '+(sw>Math.PI?1:0)+',1 '+x2+','+y2+' Z" fill="'+_VC[i]+'" opacity=".85" stroke="#050816" stroke-width=".5"/>');
      var lx=84,ly=10+i*12;
      paths.push('<rect x="'+lx+'" y="'+(ly-6)+'" width="7" height="7" rx="1" fill="'+_VC[i]+'" opacity=".85"/>');
      paths.push('<text x="'+(lx+10)+'" y="'+ly+'" font-size="7.5" fill="rgba(255,255,255,.75)">'+_ddEscHtml(String(e[0]).slice(0,13))+' ('+((e[1]/total*100).toFixed(0))+'%)</text>');
      angle=a2;
    });
    var svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' '+H+'" style="width:100%;height:'+H+'px">'+paths.join('')+'</svg>';
    return {type:'chart',value:slices.length,label:{en:'Pie Chart',hi:'पाई चार्ट'},
      display:'<div class="dd-res-mod">Pie Chart · पाई चार्ट</div>'+svg+'<div class="dd-res-sub">'+slices.length+' categories · '+_ddEscHtml(headers[ci])+'</div>',
      raw:{slices:slices.map(function(e){return {label:e[0],count:e[1],pct:+(e[1]/total*100).toFixed(1)};})  }};
  };

  if (M.scatter) M.scatter.run = function(node, h, upstream) {
    var cfg=node.config||{};
    var xi=parseInt(cfg.xCol,10), yi=parseInt(cfg.yCol,10);
    if (!Number.isFinite(xi)||xi<0||!Number.isFinite(yi)||yi<0)
      return {type:'error',display:'<div class="dd-res-error">&#9888; Pick X and Y columns / X और Y चुनें</div>',raw:null};
    var W=220,H=82,PL=28,PR=6,PT=6,PB=18,cw=W-PL-PR,ch=H-PT-PB;
    var pts=rawData.slice(0,500).map(function(r){return {x:parseFloat(String(r[xi]||'').replace(/[,\s₹$%]/g,'')),y:parseFloat(String(r[yi]||'').replace(/[,\s₹$%]/g,''))};}).filter(function(p){return Number.isFinite(p.x)&&Number.isFinite(p.y);});
    if (pts.length<2) return {type:'error',display:'<div class="dd-res-error">&#9888; Need &#8805;2 numeric rows</div>',raw:null};
    var xMn=pts[0].x,xMx=pts[0].x,yMn=pts[0].y,yMx=pts[0].y;
    pts.forEach(function(p){if(p.x<xMn)xMn=p.x;if(p.x>xMx)xMx=p.x;if(p.y<yMn)yMn=p.y;if(p.y>yMx)yMx=p.y;});
    var xR=xMx-xMn||1,yR=yMx-yMn||1;
    var dots=pts.slice(0,200).map(function(p){return '<circle cx="'+(PL+((p.x-xMn)/xR)*cw).toFixed(1)+'" cy="'+(PT+ch-((p.y-yMn)/yR)*ch).toFixed(1)+'" r="2" fill="#ddb8ff" opacity=".6"/>';}).join('');
    var svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' '+H+'" style="width:100%;height:'+H+'px">'+_ddSvgAxes(W,H,PL,PR,PT,PB)+dots+
      '<text x="'+(PL-2)+'" y="'+(PT+5)+'" text-anchor="end" font-size="7" fill="rgba(255,255,255,.4)">'+_ddFmt(yMx,0)+'</text>'+
      '<text x="'+(PL-2)+'" y="'+(H-PB)+'" text-anchor="end" font-size="7" fill="rgba(255,255,255,.4)">'+_ddFmt(yMn,0)+'</text>'+
      '</svg>';
    return {type:'chart',value:pts.length,label:{en:'Scatter',hi:'स्कैटर'},
      display:'<div class="dd-res-mod">Scatter · स्कैटर</div>'+svg+'<div class="dd-res-sub">'+pts.length+' points · '+_ddEscHtml(headers[xi])+' \xd7 '+_ddEscHtml(headers[yi])+'</div>',
      raw:{points:pts.slice(0,200)}};
  };

  if (M.kpi) M.kpi.run = function(node, h, upstream) {
    var cfg=node.config||{};
    var labelText=cfg.label||'KPI';
    var val=null;
    if (upstream&&upstream.length) { for(var i=0;i<upstream.length;i++){var r=upstream[i].result;if(r&&r.value!=null){val=r.value;break;}} }
    var dispVal = val!==null ? (typeof val==='number'?_ddFmt(val):String(val)) : '—';
    return {type:'chart',value:val,label:{en:'KPI',hi:'केपीआई'},
      display:'<div class="dd-res-mod">KPI Card · केपीआई</div>'+
        '<div style="background:rgba(221,184,255,.06);border:1px solid rgba(221,184,255,.18);border-radius:8px;padding:10px 14px;text-align:center;margin:4px 0">'+
        '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">'+_ddEscHtml(labelText)+'</div>'+
        '<div style="font-size:28px;font-weight:700;color:#ddb8ff;line-height:1">'+_ddEscHtml(dispVal)+'</div>'+
        '</div>',
      raw:{label:labelText,value:val}};
  };
})();

// ── REPORT & AI ──────────────────────────────────────────────────────────────
(function() {
  var M = window.DD && DD.modules;
  if (!M) return;

  if (M.excel_export) M.excel_export.run = async function(node, h, upstream) {
    if (!headers||!headers.length) return {type:'error',display:'<div class="dd-res-error">&#9888; No data loaded / डेटा नहीं है</div>',raw:null};
    if (typeof showExportExcelDialog==='function') showExportExcelDialog();
    return {type:'report',value:'excel',label:{en:'Excel Export',hi:'एक्सेल निर्यात'},
      display:'<div class="dd-res-mod">Excel Export · एक्सेल निर्यात</div>'+
        '<div class="dd-res-big" style="font-size:14px">&#128202; Launched</div>'+
        '<div class="dd-res-sub">'+headers.length+' columns · '+rawData.length.toLocaleString()+' rows / पंक्तियाँ</div>',
      raw:{rows:rawData.length,cols:headers.length}};
  };

  if (M.pdf_export) M.pdf_export.run = async function(node, h, upstream) {
    if (!headers||!headers.length) return {type:'error',display:'<div class="dd-res-error">&#9888; No data loaded / डेटा नहीं है</div>',raw:null};
    if (typeof showExportPDFDialog==='function') showExportPDFDialog();
    return {type:'report',value:'pdf',label:{en:'PDF Export',hi:'पीडीएफ निर्यात'},
      display:'<div class="dd-res-mod">PDF Export · पीडीएफ निर्यात</div>'+
        '<div class="dd-res-big" style="font-size:14px">&#128203; Launched</div>'+
        '<div class="dd-res-sub">'+rawData.length.toLocaleString()+' rows / पंक्तियाँ</div>',
      raw:{rows:rawData.length}};
  };

  if (M.ai_report) M.ai_report.run = async function(node, h, upstream) {
    if (!headers||!headers.length) return {type:'error',display:'<div class="dd-res-error">&#9888; No data loaded / डेटा नहीं है</div>',raw:null};
    if (typeof switchTool==='function') switchTool('report');
    return {type:'report',value:'ai_report',label:{en:'AI Report',hi:'एआई रिपोर्ट'},
      display:'<div class="dd-res-mod">AI Report · एआई रिपोर्ट</div>'+
        '<div class="dd-res-big" style="font-size:14px">&#128203; Opened</div>'+
        '<div class="dd-res-sub">Report panel launched / रिपोर्ट पैनल खुला</div>',
      raw:{cols:headers.length,rows:rawData.length}};
  };

  if (M.ask) M.ask.run = async function(node, h, upstream) {
    if (typeof switchTool==='function') switchTool('ai');
    var ctx='';
    if (upstream&&upstream.length) {
      ctx=upstream.map(function(u){return u.result&&u.result.value!=null?String(u.result.value):'';}).filter(Boolean).join(', ');
    }
    return {type:'any',value:'ask',label:{en:'Ask AI',hi:'AI से पूछें'},
      display:'<div class="dd-res-mod">Ask AI · AI से पूछें</div>'+
        '<div class="dd-res-big" style="font-size:14px">&#129504; Ready</div>'+
        '<div class="dd-res-sub">AI chat opened / AI चैट खुला</div>',
      raw:{context:ctx}};
  };
})();

// ── Anchor positions ──────────────────────────────────────────────────────────
function _ddAnchorPos(node) {
  return { inX: node.x - 6, inY: node.y + 30, outX: node.x + 66, outY: node.y + 30 };
}

// ── Edge SVG cubic bezier path ────────────────────────────────────────────────
function _ddGetEdgeSvg(ax, ay, bx, by) {
  var cp = Math.max(50, Math.abs(bx - ax) * 0.5);
  return 'M '+ax+','+ay+' C '+(ax+cp)+','+ay+' '+(bx-cp)+','+by+' '+bx+','+by;
}

// ── Redraw all edges ──────────────────────────────────────────────────────────
function _ddRedrawEdges() {
  var svg = document.getElementById('dd-edge-layer');
  if (!svg || !window.DD || !DD.workspace) return;
  var edges = DD.workspace.edges || [];
  var nodes = DD.workspace.nodes || [];
  var toRemove = [];
  var ch = svg.childNodes;
  for (var i = 0; i < ch.length; i++) {
    if (ch[i].tagName && ch[i].tagName.toLowerCase() !== 'defs') toRemove.push(ch[i]);
  }
  toRemove.forEach(function(n) { svg.removeChild(n); });
  edges.forEach(function(edge) {
    var fromNode = null, toNode = null;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].id === edge.from) fromNode = nodes[i];
      if (nodes[i].id === edge.to)   toNode   = nodes[i];
    }
    if (!fromNode || !toNode) return;
    var a = _ddAnchorPos(fromNode), b = _ddAnchorPos(toNode);
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'dd-edge-path');
    path.setAttribute('d', _ddGetEdgeSvg(a.outX, a.outY, b.inX, b.inY));
    path.setAttribute('data-edge-id', edge.id);
    svg.appendChild(path);
  });
}

// ── Edge drag system ──────────────────────────────────────────────────────────
var _ddEdgeDrag = null;

function _ddEdgeDragStart(e, fromNodeId) {
  e.preventDefault();
  e.stopPropagation();
  var canvas = document.getElementById('dd-agents-canvas');
  if (!canvas) return;
  var rect = canvas.getBoundingClientRect();
  var fromNode = null;
  var nodes = (window.DD && DD.workspace && DD.workspace.nodes) || [];
  for (var i = 0; i < nodes.length; i++) { if (nodes[i].id === fromNodeId) { fromNode = nodes[i]; break; } }
  var a = fromNode ? _ddAnchorPos(fromNode) : { outX: e.clientX - rect.left, outY: e.clientY - rect.top };
  var svg = document.getElementById('dd-edge-layer');
  var ghostPath = null;
  if (svg) {
    ghostPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    ghostPath.setAttribute('class', 'dd-edge-ghost');
    ghostPath.setAttribute('d', _ddGetEdgeSvg(a.outX, a.outY, a.outX, a.outY));
    svg.appendChild(ghostPath);
  }
  _ddEdgeDrag = { fromNodeId: fromNodeId, ax: a.outX, ay: a.outY, ghostPath: ghostPath };
  document.addEventListener('pointermove', _ddEdgeDragMove);
  document.addEventListener('pointerup',   _ddEdgeDragEnd);
}

function _ddEdgeDragMove(e) {
  if (!_ddEdgeDrag || !_ddEdgeDrag.ghostPath) return;
  var canvas = document.getElementById('dd-agents-canvas');
  if (!canvas) return;
  var rect = canvas.getBoundingClientRect();
  var mx = e.clientX - rect.left;
  var my = e.clientY - rect.top;
  _ddEdgeDrag.ghostPath.setAttribute('d', _ddGetEdgeSvg(_ddEdgeDrag.ax, _ddEdgeDrag.ay, mx, my));
}

function _ddEdgeDragEnd(e) {
  document.removeEventListener('pointermove', _ddEdgeDragMove);
  document.removeEventListener('pointerup',   _ddEdgeDragEnd);
  if (!_ddEdgeDrag) return;
  var drag = _ddEdgeDrag;
  _ddEdgeDrag = null;
  if (drag.ghostPath && drag.ghostPath.parentNode) drag.ghostPath.parentNode.removeChild(drag.ghostPath);
  var target = document.elementFromPoint(e.clientX, e.clientY);
  if (!target) return;
  var anchorEl = target.closest ? target.closest('.dd-anchor-in') : null;
  if (!anchorEl) return;
  var nodeEl = anchorEl.closest('.dd-node');
  if (!nodeEl) return;
  var toId = nodeEl.id.replace('ddnode-', '');
  if (toId === drag.fromNodeId) return;
  _ddCreateEdge(drag.fromNodeId, toId);
}

// ── Create edge with cycle detection ─────────────────────────────────────────
function _ddCreateEdge(fromId, toId) {
  if (!window.DD || !DD.workspace) return;
  var edges = DD.workspace.edges || [];
  for (var i = 0; i < edges.length; i++) {
    if (edges[i].from === fromId && edges[i].to === toId) return;
  }
  var adj = {};
  edges.forEach(function(e) { if (!adj[e.from]) adj[e.from]=[]; adj[e.from].push(e.to); });
  function reachable(start, target) {
    var visited={}, stack=[start];
    while (stack.length) {
      var cur=stack.pop();
      if (cur===target) return true;
      if (visited[cur]) continue;
      visited[cur]=1;
      (adj[cur]||[]).forEach(function(n){stack.push(n);});
    }
    return false;
  }
  if (reachable(toId, fromId)) return;
  DD.workspace.edges = edges.concat([{id:'e_'+Date.now(), from:fromId, to:toId}]);
  _ddRedrawEdges();
  _ddUpdateRunAgentBtn();
  _ddSaveNodes();
  /* P5: connect-flash on both nodes */
  [fromId, toId].forEach(function(id) {
    var el = document.getElementById('ddnode-' + id);
    var b  = el && el.querySelector('.dd-node-bubble');
    if (!b) return;
    b.classList.remove('dd-connect-flash');
    void b.offsetWidth;
    b.classList.add('dd-connect-flash');
    setTimeout(function(){b.classList.remove('dd-connect-flash');}, 650);
  });
}

// ── Run Agent button visibility ───────────────────────────────────────────────
function _ddUpdateRunAgentBtn() {
  var btn = document.getElementById('dd-run-agent-btn');
  if (!btn || !window.DD || !DD.workspace) return;
  btn.style.display = (DD.workspace.edges || []).length > 0 ? '' : 'none';
}

// ── Get upstream node results ─────────────────────────────────────────────────
function _ddGetUpstream(nodeId) {
  if (!window.DD || !DD.workspace) return [];
  var edges = DD.workspace.edges || [];
  var nodes = DD.workspace.nodes || [];
  var result = [];
  edges.forEach(function(e) {
    if (e.to !== nodeId) return;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].id === e.from && nodes[i].result) { result.push({nodeId:nodes[i].id, result:nodes[i].result}); break; }
    }
  });
  return result;
}

// ── Topological sort (Kahn's algorithm) ──────────────────────────────────────
function _ddTopoSort() {
  if (!window.DD || !DD.workspace) return [];
  var nodes = DD.workspace.nodes || [];
  var edges = DD.workspace.edges || [];
  var ids   = nodes.map(function(n){return n.id;});
  var inDeg = {}, adj = {};
  ids.forEach(function(id){inDeg[id]=0; adj[id]=[];});
  edges.forEach(function(e){
    if (inDeg[e.to] !== undefined) inDeg[e.to]++;
    if (adj[e.from]) adj[e.from].push(e.to);
  });
  var queue  = ids.filter(function(id){return inDeg[id]===0;});
  var sorted = [];
  while (queue.length) {
    var cur = queue.shift();
    sorted.push(cur);
    (adj[cur]||[]).forEach(function(nb){ if(--inDeg[nb]===0) queue.push(nb); });
  }
  return sorted.length === ids.length ? sorted : null;
}

// ── Run Agent: sequential glow execution ──────────────────────────────────────
function _ddRunAgent() {
  if (!window.DD || !DD.workspace) return;
  var order = _ddTopoSort();
  if (!order || !order.length) {
    alert('Cannot run: pipeline has a cycle.\nपाइपलाइन में चक्र है।');
    return;
  }
  var nodes = DD.workspace.nodes || [];
  nodes.forEach(function(n) {
    n.status='idle'; n.result=null;
    _ddUpdateNodeStatus(n.id,'idle');
    var res=document.getElementById('ddres-'+n.id); if(res) res.remove();
  });
  var reduceMotion = window.DD.ui && window.DD.ui.reduceMotion;
  var dwell = reduceMotion ? 0 : 400;
  var idx = 0;
  function runNext() {
    if (idx >= order.length) return;
    var nodeId = order[idx++];
    var node = null;
    for (var i=0;i<nodes.length;i++){if(nodes[i].id===nodeId){node=nodes[i];break;}}
    if (!node) { runNext(); return; }
    var mod = DD.modules[node.moduleId];
    if (!mod) { runNext(); return; }
    _ddUpdateNodeStatus(node.id,'running');
    var el = document.getElementById('ddnode-'+node.id);
    if (el) el.classList.add('dd-node-running');
    var upstream = _ddGetUpstream(node.id);
    Promise.resolve().then(function(){return mod.run(node,_ddHelpers,upstream);}).then(function(result){
      node.status='done'; node.result=result;
      if(el) el.classList.remove('dd-node-running');
      _ddUpdateNodeStatus(node.id,'done');
      _ddShowResult(node,result);
      _ddSaveNodes();
      setTimeout(runNext,dwell);
    }).catch(function(err){
      node.status='error';
      node.result={type:'error',display:'<div class="dd-res-error">⚠ '+_ddEscHtml(err.message||'Error')+'</div>',raw:null};
      if(el) el.classList.remove('dd-node-running');
      _ddUpdateNodeStatus(node.id,'error');
      _ddShowResult(node,node.result);
      _ddSaveNodes();
      setTimeout(runNext,dwell);
    });
  }
  runNext();
}

// ─── Batch 9: Report Templates + Grounded AI Prose ──────────────────────────

function _ddRptTemplate(key) {
  var now = new Date();
  var month = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  var presets = {
    exec:    { title: 'Executive Summary Report',
               desc:  'Comprehensive data overview and analysis for senior officers.' },
    monthly: { title: 'Monthly Report — ' + month,
               desc:  'Monthly performance review and trend analysis.' },
    quality: { title: 'Data Quality Audit Report',
               desc:  'Data completeness, outliers, and integrity assessment.' },
  };
  var p = presets[key]; if (!p) return;
  var ti = document.getElementById('reportTitle');
  var de = document.getElementById('reportDescription');
  if (ti) ti.value = p.title;
  if (de) de.value = p.desc;
  document.querySelectorAll('.dd-rpt-card').forEach(function(c) {
    c.classList.toggle('active', c.dataset.template === key);
  });
  if (typeof updateReportCoverPreview === 'function') updateReportCoverPreview();
}

function _ddGenerateAgentReport() {
  if (typeof switchDDView === 'function') switchDDView('reports');
  if (window.DD && DD.workspace && (DD.workspace.nodes || []).length) {
    var lang  = (typeof uiLanguage !== 'undefined') ? uiLanguage : 'en';
    var names = DD.workspace.nodes.map(function(n) {
      var m = DD.modules && DD.modules[n.moduleId];
      return m ? (lang === 'hi' && m.name.hi ? m.name.hi : m.name.en) : n.moduleId;
    }).join(' → ');
    setTimeout(function() {
      var ti = document.getElementById('reportTitle');
      if (ti && !ti.value) ti.value = 'Agent Report: ' + names;
      if (typeof updateReportCoverPreview === 'function') updateReportCoverPreview();
    }, 320);
  }
}

// Patch _ddUpdateRunAgentBtn so the Report button tracks canvas population
(function() {
  var _orig = window._ddUpdateRunAgentBtn || function(){};
  window._ddUpdateRunAgentBtn = function() {
    _orig();
    var rptBtn = document.getElementById('dd-rpt-agent-btn');
    if (!rptBtn || !window.DD || !DD.workspace) return;
    rptBtn.style.display = (DD.workspace.nodes || []).length > 0 ? '' : 'none';
  };
})();

// ─── Batch 8: Ask Mode — conversational pipeline builder ────────────────────

(function() {
  function _ddCheckOllama() {
    var input  = document.getElementById('dd-ask-input');
    var btn    = document.getElementById('dd-ask-btn');
    var status = document.getElementById('dd-ask-status');
    fetch('/api/ollama/status').then(function(r) { return r.json(); }).then(function(d) {
      var offline = d.status !== 'running';
      if (input) input.disabled = offline;
      if (btn)   btn.disabled   = offline;
      if (status) {
        status.textContent = offline
          ? 'Ollama offline — Ask Mode unavailable. Manual canvas is ready. / ऑफलाइन — मैन्युअल कैनवास उपलब्ध है।'
          : '';
        status.className = offline ? 'warn' : '';
      }
    }).catch(function() {
      if (input) input.disabled = true;
      if (btn)   btn.disabled   = true;
      if (status) { status.textContent = 'Cannot reach server / सर्वर से संपर्क नहीं'; status.className = 'warn'; }
    });
  }
  // Probe Ollama whenever the agents view opens
  var _origSwitchView = window.switchDDView;
  window.switchDDView = function(view) {
    if (_origSwitchView) _origSwitchView(view);
    if (view === 'agents') setTimeout(_ddCheckOllama, 250);
  };
})();

function _ddAskChip(el) {
  var input = document.getElementById('dd-ask-input');
  if (input && !input.disabled) { input.value = el.textContent.trim(); input.focus(); }
}

function _ddAskPlan() {
  var input  = document.getElementById('dd-ask-input');
  var query  = input ? input.value.trim() : '';
  if (!query) return;

  var status = document.getElementById('dd-ask-status');
  var btn    = document.getElementById('dd-ask-btn');

  if (typeof rawData === 'undefined' || !rawData || !rawData.length) {
    if (status) { status.textContent = 'Load data first / पहले डेटा लोड करें'; status.className = 'warn'; }
    return;
  }

  if (btn)    btn.disabled = true;
  if (status) { status.textContent = 'Planning… / योजना बना रहे हैं…'; status.className = ''; }

  fetch('/api/ai/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query:    query,
      headers:  typeof headers  !== 'undefined' ? headers  : [],
      colTypes: typeof colTypes !== 'undefined' ? colTypes : []
    })
  })
  .then(function(r) {
    if (!r.ok) return r.json().then(function(d) { throw new Error(d.message || d.error || r.status); });
    return r.json();
  })
  .then(function(plan) {
    if (btn) btn.disabled = false;
    var repaired = _ddRepairPlan(plan);
    if (!repaired || !repaired.nodes || !repaired.nodes.length) {
      if (status) {
        status.textContent = 'I could not plan that — try picking bubbles yourself. / अनुमान नहीं लगा सका — कृपया स्वयं मॉड्यूल चुनें।';
        status.className = 'err';
      }
      return;
    }
    if (status) { status.textContent = ''; status.className = ''; }
    _ddBuildPlan(repaired);
  })
  .catch(function(err) {
    if (btn) btn.disabled = false;
    var msg = String(err.message || err);
    var offline = msg.indexOf('ollama') !== -1 || msg.indexOf('503') !== -1 || msg.indexOf('offline') !== -1 || msg.indexOf('Ollama') !== -1;
    if (status) {
      status.textContent = offline
        ? 'Ollama offline — Ask Mode unavailable. / ऑफलाइन — Ask Mode अनुपलब्ध।'
        : 'I could not plan that — try picking bubbles yourself. / अनुमान नहीं लगा सका।';
      status.className = offline ? 'warn' : 'err';
    }
  });
}

function _ddRepairPlan(plan) {
  if (!plan || !Array.isArray(plan.nodes)) return null;
  var validIds     = (window.DD && DD.modules) ? DD.modules : {};
  var validHeaders = (typeof headers !== 'undefined' && Array.isArray(headers)) ? headers : [];
  var hLower       = validHeaders.map(function(h) { return h.toLowerCase(); });

  function bestHeader(col) {
    if (!col && validHeaders.length) return validHeaders[0];
    if (!col) return '';
    var exact = hLower.indexOf(String(col).toLowerCase());
    if (exact !== -1) return validHeaders[exact];
    // partial match
    var cl = String(col).toLowerCase();
    for (var i = 0; i < hLower.length; i++) {
      if (hLower[i].indexOf(cl) !== -1 || cl.indexOf(hLower[i]) !== -1) return validHeaders[i];
    }
    return validHeaders.length ? validHeaders[0] : col;
  }

  var goodNodes = [], indexMap = {};
  plan.nodes.forEach(function(n, oldIdx) {
    if (!n || !n.moduleId || !validIds[n.moduleId]) return;
    var cfg = {};
    if (n.config && typeof n.config === 'object') {
      Object.keys(n.config).forEach(function(k) { cfg[k] = n.config[k]; });
    }
    if (cfg.col !== undefined)    cfg.col    = bestHeader(cfg.col);
    if (cfg.k   !== undefined)    cfg.k      = Math.max(1, parseInt(cfg.k,      10) || 3);
    if (cfg.window !== undefined) cfg.window = Math.max(2, parseInt(cfg.window, 10) || 3);
    indexMap[oldIdx] = goodNodes.length;
    goodNodes.push({ moduleId: n.moduleId, config: cfg });
  });

  var goodEdges = [];
  (plan.edges || []).forEach(function(e) {
    if (!Array.isArray(e) || e.length < 2) return;
    var fi = indexMap[e[0]], ti = indexMap[e[1]];
    if (fi !== undefined && ti !== undefined && fi !== ti) goodEdges.push([fi, ti]);
  });

  return { nodes: goodNodes, edges: goodEdges };
}

function _ddBuildPlan(plan) {
  if (!window.DD || !DD.workspace) return;

  // Clear current canvas
  var oldIds = (DD.workspace.nodes || []).map(function(n) { return n.id; });
  DD.workspace.nodes = [];
  DD.workspace.edges = [];
  oldIds.forEach(function(id) {
    var el  = document.getElementById('ddnode-' + id);
    var res = document.getElementById('ddres-'  + id);
    if (el)  el.remove();
    if (res) res.remove();
  });
  if (typeof _ddRedrawEdges === 'function') _ddRedrawEdges();

  var canvas  = document.getElementById('dd-agents-canvas');
  var cW      = canvas ? Math.max(300, canvas.offsetWidth)  : 900;
  var cH      = canvas ? Math.max(200, canvas.offsetHeight) : 460;
  var spacing = 180;
  var totalW  = (plan.nodes.length - 1) * spacing + 60;
  var startX  = Math.max(80, Math.round((cW - totalW) / 2));
  // Push node row down to clear the ask bar (~100px)
  var nodeY   = Math.max(120, Math.round((cH - 60) / 2));

  var nodeIds = [];
  plan.nodes.forEach(function(n, i) {
    var node = {
      id:       'ddai_' + Date.now() + '_' + i,
      moduleId: n.moduleId,
      x:        startX + i * spacing,
      y:        nodeY,
      bindings: {},
      config:   n.config || {},
      status:   'idle',
      result:   null
    };
    DD.workspace.nodes.push(node);
    nodeIds.push(node.id);
    _ddRenderNode(node, true);
  });

  plan.edges.forEach(function(e) {
    var fromId = nodeIds[e[0]], toId = nodeIds[e[1]];
    if (fromId && toId) _ddCreateEdge(fromId, toId);
  });

  var hint = document.getElementById('dd-ai-hint');
  if (hint) hint.style.display = '';

  _ddUpdateCanvasEmpty();
  _ddSaveNodes();

  setTimeout(_ddRunAgent, 700);
}

// ─── Batch 10: Smart Dashboard (auto-profile → bento grid) ──────────────────

var _ddDashCharts = [];

function _ddt(o) {
  var l = (typeof uiLanguage !== 'undefined') ? uiLanguage : 'en';
  if (!o) return '';
  if (typeof o === 'string') return o;
  return o[l] || o.en || '';
}

function _ddColNums(ci) {
  return rawData.map(function(r) {
    return parseFloat(String(r[ci] == null ? '' : r[ci]).replace(/[,\s₹$%]/g, ''));
  }).filter(function(v) { return isFinite(v); });
}

// Classify columns into numeric / categorical / date (reuses colTypes)
function _ddProfileColumns() {
  if (typeof detectTypes === 'function' && (!colTypes || colTypes.length !== headers.length)) {
    try { detectTypes(); } catch (e) {}
  }
  var prof = { numeric: [], categorical: [], date: [] };
  headers.forEach(function(h, ci) {
    var t = (colTypes && colTypes[ci]) || 'text';
    if (t === 'number') {
      var nums = _ddColNums(ci);
      if (nums.length) {
        var sum = nums.reduce(function(a, b) { return a + b; }, 0);
        prof.numeric.push({ name: h, ci: ci, count: nums.length, sum: sum, avg: sum / nums.length });
      }
    } else if (t === 'date') {
      prof.date.push({ name: h, ci: ci });
    } else {
      var freq = {};
      rawData.forEach(function(r) { var v = String(r[ci] == null ? '' : r[ci]).trim(); if (v) freq[v] = (freq[v] || 0) + 1; });
      prof.categorical.push({ name: h, ci: ci, cardinality: Object.keys(freq).length });
    }
  });
  // Strongest numeric columns first (by sum magnitude)
  prof.numeric.sort(function(a, b) { return Math.abs(b.sum) - Math.abs(a.sum); });
  return prof;
}

// Build the default auto-card layout from the profile
function _ddDashboardAutoSpec() {
  var p = _ddProfileColumns();
  var cards = [];
  cards.push({ id: 'auto_rows', kind: 'kpi', metric: 'rows', title: { en: 'Total Rows', hi: 'कुल पंक्तियाँ' }, span: 1 });
  cards.push({ id: 'auto_cols', kind: 'kpi', metric: 'cols', title: { en: 'Total Columns', hi: 'कुल कॉलम' }, span: 1 });
  if (p.numeric[0]) {
    var n0 = p.numeric[0];
    cards.push({ id: 'auto_sum_' + n0.ci, kind: 'kpi', metric: 'sum', ci: n0.ci, title: { en: 'Total ' + n0.name, hi: 'कुल ' + n0.name }, span: 1 });
  }
  p.numeric.slice(0, 3).forEach(function(n) {
    cards.push({ id: 'auto_avg_' + n.ci, kind: 'kpi', metric: 'avg', ci: n.ci, title: { en: 'Avg ' + n.name, hi: 'औसत ' + n.name }, span: 1 });
  });
  // Bar: first usable categorical (low-to-mid cardinality)
  var barCat = p.categorical.filter(function(c) { return c.cardinality > 1 && c.cardinality <= 40; })[0];
  if (barCat) cards.push({ id: 'auto_bar_' + barCat.ci, kind: 'chart', chartType: 'bar', ci: barCat.ci, title: { en: 'Top ' + barCat.name, hi: barCat.name + ' — शीर्ष' }, span: 2 });
  // Line: date+numeric if available, else first numeric trend
  if (p.date[0] && p.numeric[0]) {
    cards.push({ id: 'auto_line', kind: 'chart', chartType: 'line', xci: p.date[0].ci, yci: p.numeric[0].ci, title: { en: p.numeric[0].name + ' over ' + p.date[0].name, hi: p.numeric[0].name + ' (समय)' }, span: 2 });
  } else if (p.numeric[0]) {
    cards.push({ id: 'auto_line', kind: 'chart', chartType: 'line', yci: p.numeric[0].ci, title: { en: p.numeric[0].name + ' Trend', hi: p.numeric[0].name + ' प्रवृत्ति' }, span: 2 });
  }
  // Pie: a low-cardinality category (distinct from the bar one)
  var pieCat = p.categorical.filter(function(c) { return c.cardinality >= 2 && c.cardinality <= 6 && (!barCat || c.ci !== barCat.ci); })[0];
  if (pieCat) cards.push({ id: 'auto_pie_' + pieCat.ci, kind: 'chart', chartType: 'pie', ci: pieCat.ci, title: { en: pieCat.name + ' Split', hi: pieCat.name + ' विभाजन' }, span: 1 });
  return cards;
}

function _ddEnsureDashboard() {
  window.DD = window.DD || {};
  DD.workspace = DD.workspace || { view: 'sheet', nodes: [], edges: [] };
  if (!DD.workspace.dashboard) {
    try { var s = JSON.parse(localStorage.getItem('sda_state_v2') || '{}'); if (s.ddDashboard) DD.workspace.dashboard = s.ddDashboard; } catch (e) {}
  }
  if (!DD.workspace.dashboard) DD.workspace.dashboard = { cards: [] };
  if (!Array.isArray(DD.workspace.dashboard.cards)) DD.workspace.dashboard.cards = [];
  return DD.workspace.dashboard;
}

function _ddSaveDashboard() {
  try {
    var s = JSON.parse(localStorage.getItem('sda_state_v2') || '{}');
    s.ddDashboard = (window.DD && DD.workspace) ? DD.workspace.dashboard : null;
    localStorage.setItem('sda_state_v2', JSON.stringify(s));
  } catch (e) { /* quota */ }
}

// Entry point — one click
function _ddSmartDashboard() {
  if (typeof rawData === 'undefined' || !rawData || !rawData.length) {
    toast((typeof uiLanguage !== 'undefined' && uiLanguage === 'hi') ? 'पहले डेटा आयात करें' : 'Import data first', 'error');
    return;
  }
  ensureChartLibrary(function() {
    var dash = _ddEnsureDashboard();
    if (!dash.cards.length) dash.cards = _ddDashboardAutoSpec();
    _ddRenderDashShell();
    _ddRenderDashCards();
    _ddSaveDashboard();
  });
}

function _ddDashRebuild() {
  var dash = _ddEnsureDashboard();
  dash.cards = _ddDashboardAutoSpec();
  _ddSaveDashboard();
  _ddRenderDashCards();
  toast((typeof uiLanguage !== 'undefined' && uiLanguage === 'hi') ? 'डैशबोर्ड पुनः बनाया' : 'Dashboard rebuilt', 'success');
}

function _ddRenderDashShell() {
  var view = document.getElementById('dashboard-view');
  if (!view) return;
  document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('visible'); });
  var tw = document.getElementById('table-wrap'); if (tw) tw.classList.remove('visible');
  var wel = document.getElementById('welcome'); if (wel) wel.style.display = 'none';
  view.classList.add('visible');
  var hi = (typeof uiLanguage !== 'undefined' && uiLanguage === 'hi');
  var colOpts = headers.map(function(h, i) { return '<option value="' + i + '">' + escHtml(h) + '</option>'; }).join('');
  view.innerHTML =
    '<div id="dash-export-bar" style="display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap;background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:10px 14px;box-shadow:var(--card-shadow)">' +
      '<span style="font-size:11px;color:var(--text-secondary);font-weight:700;text-transform:uppercase;letter-spacing:.04em">' + (hi ? 'डैशबोर्ड' : 'Dashboard') + '</span>' +
      '<button class="tb-btn" type="button" onclick="_ddDashRebuild()" style="font-size:11px;gap:5px" title="Auto-rebuild"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>' + (hi ? 'पुनः बनाएँ' : 'Auto-rebuild') + '</button>' +
      '<span class="dd-dash-add"><select id="dd-dash-addcol">' + colOpts + '</select>' +
      '<select id="dd-dash-addtype"><option value="kpi">KPI</option><option value="bar">Bar</option><option value="line">Line</option><option value="pie">Pie</option></select>' +
      '<button class="tb-btn" type="button" onclick="_ddDashAddManual()" style="font-size:11px">+ ' + (hi ? 'कार्ड' : 'Card') + '</button></span>' +
      '<span style="flex:1"></span>' +
      '<button class="tb-btn" type="button" onclick="exportDashboardPNG()" style="font-size:11px;gap:5px" title="PNG"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>PNG</button>' +
      '<button class="tb-btn" type="button" onclick="exportDashboardPDF()" style="font-size:11px;gap:5px" title="PDF"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>PDF</button>' +
      '<button class="tb-btn" type="button" onclick="exportDashboardExcel()" style="font-size:11px;gap:5px" title="Excel"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Excel</button>' +
    '</div>' +
    '<h2 style="margin-bottom:16px;font-size:20px;font-weight:800;color:var(--text-primary)">' + (hi ? 'स्मार्ट डैशबोर्ड' : 'Smart Dashboard') + '</h2>' +
    '<div id="dd-dash-grid" class="dd-dash-grid"></div>';
}

function _ddDashKpiValue(spec) {
  if (spec.metric === 'rows') return rawData.length.toLocaleString();
  if (spec.metric === 'cols') return String(headers.length);
  if (spec.custom) return String(spec.value);
  var nums = _ddColNums(spec.ci);
  if (!nums.length) return '—';
  var v = 0;
  switch (spec.metric) {
    case 'sum': v = nums.reduce(function(a, b) { return a + b; }, 0); break;
    case 'avg': v = nums.reduce(function(a, b) { return a + b; }, 0) / nums.length; break;
    case 'min': v = Math.min.apply(null, nums); break;
    case 'max': v = Math.max.apply(null, nums); break;
    case 'count': return String(nums.length);
    default: v = 0;
  }
  return formatNum(v);
}

function _ddDashChartOpts(type) {
  var pie = (type === 'pie' || type === 'doughnut');
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: pie, position: 'bottom', labels: { font: { size: 10 } } } },
    scales: pie ? {} : { x: { ticks: { font: { size: 9 }, maxRotation: 40 } }, y: { ticks: { font: { size: 9 } } } }
  };
}

function _ddRenderDashChart(spec) {
  var canvas = document.getElementById('ddcanvas-' + spec.id);
  if (!canvas || !window.Chart) return;
  var palette = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#3b82f6', '#a855f7'];
  var cfg = null;
  if (spec.custom) {
    if (spec.chartType === 'pie' || spec.chartType === 'doughnut') {
      cfg = { type: spec.chartType, data: { labels: spec.labels, datasets: [{ data: spec.data, backgroundColor: palette.map(function(c) { return c + 'cc'; }), borderWidth: 2 }] }, options: _ddDashChartOpts(spec.chartType) };
    } else {
      cfg = { type: spec.chartType, data: { labels: spec.labels, datasets: [{ label: _ddt(spec.title), data: spec.data, backgroundColor: '#6366f199', borderColor: '#6366f1', borderWidth: 2, tension: .3, fill: spec.chartType === 'line' }] }, options: _ddDashChartOpts(spec.chartType) };
    }
  } else if (spec.chartType === 'bar' || spec.chartType === 'pie' || spec.chartType === 'doughnut') {
    var freq = {};
    rawData.forEach(function(r) { var v = String(r[spec.ci] == null ? '' : r[spec.ci]).trim(); if (v) freq[v] = (freq[v] || 0) + 1; });
    var sorted = Object.keys(freq).map(function(k) { return [k, freq[k]]; }).sort(function(a, b) { return b[1] - a[1]; }).slice(0, spec.chartType === 'bar' ? 12 : 6);
    var labels = sorted.map(function(e) { return e[0]; });
    var data = sorted.map(function(e) { return e[1]; });
    if (spec.chartType === 'bar') {
      cfg = { type: 'bar', data: { labels: labels, datasets: [{ data: data, backgroundColor: '#6366f1cc', borderColor: '#6366f1', borderWidth: 1 }] }, options: _ddDashChartOpts('bar') };
    } else {
      cfg = { type: spec.chartType, data: { labels: labels, datasets: [{ data: data, backgroundColor: palette.map(function(c) { return c + 'cc'; }), borderWidth: 2 }] }, options: _ddDashChartOpts(spec.chartType) };
    }
  } else if (spec.chartType === 'line') {
    var labels2, data2;
    if (spec.xci != null) {
      var rows = rawData.map(function(r) {
        return { x: r[spec.xci], y: parseFloat(String(r[spec.yci] == null ? '' : r[spec.yci]).replace(/[,\s₹$%]/g, '')) };
      }).filter(function(o) { return isFinite(o.y); });
      rows.sort(function(a, b) { return new Date(a.x) - new Date(b.x); });
      rows = rows.slice(0, 50);
      labels2 = rows.map(function(o) { return o.x; });
      data2 = rows.map(function(o) { return o.y; });
    } else {
      data2 = _ddColNums(spec.yci).slice(0, 40);
      labels2 = data2.map(function(_, i) { return i + 1; });
    }
    cfg = { type: 'line', data: { labels: labels2, datasets: [{ label: _ddt(spec.title), data: data2, borderColor: '#6366f1', backgroundColor: '#6366f122', borderWidth: 2, fill: true, tension: .3, pointRadius: 2 }] }, options: _ddDashChartOpts('line') };
  }
  if (cfg) { try { _ddDashCharts.push(new Chart(canvas, cfg)); } catch (e) {} }
}

function _ddRenderDashCards() {
  var grid = document.getElementById('dd-dash-grid');
  if (!grid) return;
  (_ddDashCharts || []).forEach(function(c) { try { c.destroy(); } catch (e) {} });
  _ddDashCharts = [];
  var dash = _ddEnsureDashboard();
  if (!dash.cards.length) {
    grid.innerHTML = '<div class="dd-dash-empty">' + ((typeof uiLanguage !== 'undefined' && uiLanguage === 'hi') ? 'अभी कोई कार्ड नहीं — ऊपर से जोड़ें' : 'No cards yet — add one above') + '</div>';
    return;
  }
  var html = '';
  dash.cards.forEach(function(spec) {
    var span = spec.span === 2 ? ' dd-span-2' : '';
    html += '<div class="stellar-card dd-dash-card' + span + '" id="ddcard-' + spec.id + '">';
    html += '<div class="dd-dash-head">';
    html += '<span class="dd-dash-handle" onpointerdown="_ddDashDragStart(event,\'' + spec.id + '\')" title="Drag to rearrange">⠿</span>';
    html += '<span class="dd-dash-title">' + escHtml(_ddt(spec.title)) + '</span>';
    html += '<span class="dd-dash-actions">';
    html += '<button class="dd-dash-btn" type="button" onclick="_ddDashToggleSpan(\'' + spec.id + '\')" title="Resize">⇔</button>';
    html += '<button class="dd-dash-btn" type="button" onclick="_ddDashRemoveCard(\'' + spec.id + '\')" title="Remove">×</button>';
    html += '</span></div>';
    if (spec.kind === 'kpi') {
      html += '<div class="dd-dash-kpi-val">' + escHtml(_ddDashKpiValue(spec)) + '</div>';
    } else {
      html += '<div class="dd-dash-canvas-wrap"><canvas id="ddcanvas-' + spec.id + '"></canvas></div>';
    }
    html += '</div>';
  });
  grid.innerHTML = html;
  setTimeout(function() {
    dash.cards.forEach(function(spec) { if (spec.kind === 'chart') _ddRenderDashChart(spec); });
  }, 60);
}

function _ddDashToggleSpan(id) {
  var dash = _ddEnsureDashboard();
  var c = dash.cards.filter(function(x) { return x.id === id; })[0];
  if (!c) return;
  c.span = c.span === 2 ? 1 : 2;
  _ddSaveDashboard();
  _ddRenderDashCards();
}

function _ddDashRemoveCard(id) {
  var dash = _ddEnsureDashboard();
  dash.cards = dash.cards.filter(function(x) { return x.id !== id; });
  _ddSaveDashboard();
  _ddRenderDashCards();
}

function _ddDashAddManual() {
  var colSel = document.getElementById('dd-dash-addcol');
  var typeSel = document.getElementById('dd-dash-addtype');
  if (!colSel || !typeSel) return;
  var ci = parseInt(colSel.value, 10);
  var type = typeSel.value;
  var name = headers[ci] || ('Col ' + ci);
  var dash = _ddEnsureDashboard();
  var spec;
  if (type === 'kpi') {
    spec = { id: 'm_' + Date.now(), kind: 'kpi', metric: 'avg', ci: ci, title: { en: 'Avg ' + name, hi: 'औसत ' + name }, span: 1 };
  } else {
    var key = (type === 'line') ? 'yci' : 'ci';
    spec = { id: 'm_' + Date.now(), kind: 'chart', chartType: type, title: { en: name, hi: name }, span: type === 'pie' ? 1 : 2 };
    spec[key] = ci;
  }
  dash.cards.push(spec);
  _ddSaveDashboard();
  _ddRenderDashCards();
}

// Add an Agent result card to the dashboard (Batch 7 drop → "Dashboard" zone)
function _ddAddResultToDashboard(result) {
  if (!result) return;
  var dash = _ddEnsureDashboard();
  var hi = (typeof uiLanguage !== 'undefined' && uiLanguage === 'hi');
  var title = result.label ? { en: result.label.en, hi: result.label.hi || result.label.en } : { en: 'Result', hi: 'परिणाम' };
  var card;
  if (result.type === 'value' && !Array.isArray(result.value)) {
    card = { id: 'cust_' + Date.now(), kind: 'kpi', custom: true, value: result.value, title: title, span: 1 };
  } else {
    var data = (result.raw && Array.isArray(result.raw.values) && result.raw.values) ||
               (result.raw && Array.isArray(result.raw.proj) && result.raw.proj) ||
               (Array.isArray(result.value) ? result.value : [result.value]);
    data = data.map(Number).filter(isFinite);
    card = { id: 'cust_' + Date.now(), kind: 'chart', custom: true, chartType: 'bar', labels: data.map(function(_, i) { return i + 1; }), data: data, title: title, span: 2 };
  }
  dash.cards.push(card);
  _ddSaveDashboard();
  toast(hi ? 'डैशबोर्ड में जोड़ा गया' : 'Added to Dashboard / डैशबोर्ड में जोड़ा गया', 'success');
}

// Card drag-to-rearrange (pointer-based, reorder on drop)
var _ddDashDrag = null;
function _ddDashDragStart(e, cardId) {
  e.preventDefault();
  _ddDashDrag = { id: cardId };
  var el = document.getElementById('ddcard-' + cardId);
  if (el) el.classList.add('dd-dash-dragging');
  document.addEventListener('pointermove', _ddDashDragMove);
  document.addEventListener('pointerup', _ddDashDragEnd);
}
function _ddDashDragMove(e) {
  if (!_ddDashDrag) return;
  var t = document.elementFromPoint(e.clientX, e.clientY);
  var over = t && t.closest ? t.closest('.dd-dash-card') : null;
  document.querySelectorAll('.dd-dash-card').forEach(function(c) { c.classList.remove('dd-dash-over'); });
  if (over && over.id !== 'ddcard-' + _ddDashDrag.id) over.classList.add('dd-dash-over');
}
function _ddDashDragEnd(e) {
  document.removeEventListener('pointermove', _ddDashDragMove);
  document.removeEventListener('pointerup', _ddDashDragEnd);
  var draggedId = _ddDashDrag ? _ddDashDrag.id : null;
  _ddDashDrag = null;
  document.querySelectorAll('.dd-dash-card').forEach(function(c) { c.classList.remove('dd-dash-dragging', 'dd-dash-over'); });
  if (!draggedId) return;
  var t = document.elementFromPoint(e.clientX, e.clientY);
  var over = t && t.closest ? t.closest('.dd-dash-card') : null;
  if (!over) return;
  var targetId = over.id.replace('ddcard-', '');
  if (targetId === draggedId) return;
  var cards = _ddEnsureDashboard().cards;
  var fromI = -1, toI = -1, i;
  for (i = 0; i < cards.length; i++) { if (cards[i].id === draggedId) fromI = i; if (cards[i].id === targetId) toI = i; }
  if (fromI < 0 || toI < 0) return;
  var moved = cards.splice(fromI, 1)[0];
  cards.splice(toI, 0, moved);
  _ddSaveDashboard();
  _ddRenderDashCards();
}

// ─── Batch 7: Result → Sheet insertion ───────────────────────────────────────

var _ddResInsertDrag = null;

function _ddResInsertStart(e, nodeId) {
  e.preventDefault();
  e.stopPropagation();
  if (!window.DD || !DD.workspace) return;
  var node = null;
  for (var i = 0; i < DD.workspace.nodes.length; i++) {
    if (DD.workspace.nodes[i].id === nodeId) { node = DD.workspace.nodes[i]; break; }
  }
  if (!node || !node.result || node.result.type === 'error') return;
  _ddResInsertDrag = { nodeId: nodeId, result: node.result };
  var lang = (typeof uiLanguage !== 'undefined') ? uiLanguage : 'en';
  var lbl = node.result.label
    ? (lang === 'hi' && node.result.label.hi ? node.result.label.hi : node.result.label.en)
    : 'Value';
  var ghost = document.getElementById('dd-res-ghost');
  if (ghost) {
    ghost.textContent = '↓ ' + lbl;
    ghost.style.left = (e.clientX + 14) + 'px';
    ghost.style.top  = (e.clientY + 14) + 'px';
    ghost.style.display = '';
  }
  var overlay = document.getElementById('dd-sheet-drop-overlay');
  if (overlay) overlay.classList.add('active');
  document.addEventListener('pointermove', _ddResInsertMove);
  document.addEventListener('pointerup',   _ddResInsertEnd);
}

function _ddResInsertMove(e) {
  var ghost = document.getElementById('dd-res-ghost');
  if (ghost) {
    ghost.style.left = (e.clientX + 14) + 'px';
    ghost.style.top  = (e.clientY + 14) + 'px';
  }
  var el = document.elementFromPoint ? document.elementFromPoint(e.clientX, e.clientY) : null;
  var overZone = el && el.closest ? el.closest('.dd-drop-zone') : null;
  document.querySelectorAll('.dd-drop-zone').forEach(function(z) {
    z.classList.toggle('dd-drop-hover', overZone === z);
  });
}

function _ddResInsertEnd(e) {
  document.removeEventListener('pointermove', _ddResInsertMove);
  document.removeEventListener('pointerup',   _ddResInsertEnd);
  var ghost = document.getElementById('dd-res-ghost');
  if (ghost) ghost.style.display = 'none';
  var overlay = document.getElementById('dd-sheet-drop-overlay');
  if (overlay) overlay.classList.remove('active');
  document.querySelectorAll('.dd-drop-zone').forEach(function(z) { z.classList.remove('dd-drop-hover'); });
  if (!_ddResInsertDrag) return;
  var drag = _ddResInsertDrag;
  _ddResInsertDrag = null;
  var el = document.elementFromPoint ? document.elementFromPoint(e.clientX, e.clientY) : null;
  var zone = el && el.closest ? el.closest('.dd-drop-zone') : null;
  if (!zone) return;
  if (zone.id === 'ddz-dash') { _ddAddResultToDashboard(drag.result); return; }
  var mode = zone.id === 'ddz-cell' ? 'cell' : 'col';
  _ddInsertResultIntoSheet(drag.result, mode);
}

function _ddInsertResultIntoSheet(result, mode) {
  if (typeof rawData === 'undefined' || !rawData || !rawData.length) {
    toast('Import data first / पहले डेटा आयात करें', 'info');
    return;
  }
  var lang = (typeof uiLanguage !== 'undefined') ? uiLanguage : 'en';
  var labelEn = result.label ? result.label.en : 'Inserted';
  var labelHi = result.label ? (result.label.hi || labelEn) : labelEn;
  var colLabel = labelEn + ' / ' + labelHi;
  if (typeof switchDDView === 'function') switchDDView('sheet');
  if (mode === 'cell') {
    var val = Array.isArray(result.value) ? result.value[0] : result.value;
    if (val === undefined || val === null) { toast('No insertable value / कोई मान नहीं', 'info'); return; }
    var ri = (typeof activeCell !== 'undefined' && activeCell.ri !== null) ? activeCell.ri : 0;
    var ci = (typeof activeCell !== 'undefined' && activeCell.ci !== null) ? activeCell.ci : 0;
    ri = Math.max(0, Math.min(ri, rawData.length - 1));
    ci = Math.max(0, Math.min(ci, headers.length - 1));
    pushUndo();
    rawData[ri][ci] = String(val);
    if (typeof cellFormulaMeta !== 'undefined') delete cellFormulaMeta[ri + ':' + ci];
    showTable();
    autoSave();
  } else {
    var values, isProj = false;
    if (result.raw && Array.isArray(result.raw.proj)) {
      values = result.raw.proj; isProj = true;
    } else if (result.raw && Array.isArray(result.raw.values)) {
      values = result.raw.values;
    } else if (Array.isArray(result.value)) {
      values = result.value; isProj = true;
    } else {
      values = [result.value];
    }
    _ddInsertSeriesAsColumn(values, colLabel, isProj);
  }
  toast(lang === 'hi' ? 'शीट में जोड़ा गया' : 'Inserted into sheet / शीट में जोड़ा गया', 'success');
}

function _ddInsertSeriesAsColumn(values, colLabel, isProj) {
  pushUndo();
  var ci = headers.length;
  headers.push(colLabel);
  colTypes.push('number');
  var ri, vi;
  if (isProj) {
    // Extend all existing rows with empty for the new column
    for (ri = 0; ri < rawData.length; ri++) {
      while (rawData[ri].length < headers.length) rawData[ri].push('');
    }
    // Append projected rows with tinted background
    for (vi = 0; vi < values.length; vi++) {
      var newRi = rawData.length;
      var row = new Array(headers.length).fill('');
      row[ci] = String(values[vi]);
      rawData.push(row);
      if (typeof cellBgColor !== 'undefined') cellBgColor[newRi + ':' + ci] = 'rgba(76,215,246,0.12)';
    }
  } else {
    // Map series values into existing rows
    for (ri = 0; ri < rawData.length; ri++) {
      while (rawData[ri].length < headers.length - 1) rawData[ri].push('');
      rawData[ri].push(ri < values.length ? String(values[ri]) : '');
    }
  }
  showTable();
  autoSave();
}

// ─── Batch 12: Saved Agents — recipes, library, column remapping ─────────────

// 3 built-in example recipes shipped with the app (column '' = user must map)
var _BUILTIN_AGENTS = [
  { id:'builtin_quality', name:{en:'Data Quality Check',hi:'डेटा गुणवत्ता जाँच'}, icon:'&#128269;', builtin:true,
    nodes:[
      { moduleId:'missing',      relX:-190, relY:0, config:{}, colBindings:{col:''} },
      { moduleId:'duplicates',   relX:0,    relY:0, config:{}, colBindings:{col:''} },
      { moduleId:'outliers_iqr', relX:190,  relY:0, config:{}, colBindings:{col:''} }
    ], edges:[] },
  { id:'builtin_summary', name:{en:'Monthly Summary',hi:'मासिक सारांश'}, icon:'&#128202;', builtin:true,
    nodes:[
      { moduleId:'average', relX:-190, relY:0, config:{}, colBindings:{col:''} },
      { moduleId:'sum',     relX:0,    relY:0, config:{}, colBindings:{col:''} },
      { moduleId:'trend',   relX:190,  relY:0, config:{}, colBindings:{col:''} }
    ], edges:[{from:0,to:1},{from:1,to:2}] },
  { id:'builtin_projection', name:{en:'Projection',hi:'पूर्वानुमान'}, icon:'&#128200;', builtin:true,
    nodes:[
      { moduleId:'average',        relX:-140, relY:0, config:{}, colBindings:{col:''} },
      { moduleId:'linreg_project', relX:140,  relY:0, config:{k:3}, colBindings:{col:''} }
    ], edges:[{from:0,to:1}] }
];

function _ddInitAgents() {
  window.DD = window.DD || {};
  DD.agents = [];
  try {
    var s = JSON.parse(localStorage.getItem('sda_state_v2') || '{}');
    if (Array.isArray(s.ddAgents)) DD.agents = s.ddAgents;
  } catch(e) {}
}

function _ddSaveAgents() {
  try {
    var s = JSON.parse(localStorage.getItem('sda_state_v2') || '{}');
    s.ddAgents = DD.agents || [];
    localStorage.setItem('sda_state_v2', JSON.stringify(s));
  } catch(e) { /* quota */ }
}

function _ddDrawerTab(tab) {
  document.querySelectorAll('.dd-dtab').forEach(function(b) {
    b.classList.toggle('active', b.dataset.tab === tab);
    b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false');
  });
  var modPanel = document.getElementById('dd-drawer-modules');
  var agPanel  = document.getElementById('dd-drawer-agents');
  if (modPanel) modPanel.style.display = (tab === 'modules') ? 'flex' : 'none';
  if (agPanel)  agPanel.style.display  = (tab === 'agents')  ? 'flex' : 'none';
  if (tab === 'agents') _ddRenderAgentList();
}

function _ddRenderAgentList() {
  var container = document.getElementById('dd-drawer-agents');
  if (!container) return;
  var lang = (typeof uiLanguage !== 'undefined') ? uiLanguage : 'en';
  var allAgents = _BUILTIN_AGENTS.concat(DD.agents || []);

  var html = '<div class="dd-agent-save-row"><button class="dd-agent-save-btn" onclick="_ddShowSaveAgentDialog()" type="button">'
           + (lang === 'hi' ? '+ एजेंट सेव करें' : '+ Save as Agent') + '</button></div>';

  if (!allAgents.length) {
    html += '<p class="dd-agent-empty">'
          + (lang === 'hi' ? 'कोई सहेजा हुआ एजेंट नहीं।\nपहले पाइपलाइन बनाएँ।'
                           : 'No saved agents yet.\nBuild a pipeline first.') + '</p>';
  } else {
    html += '<div class="dd-agent-list">';
    allAgents.forEach(function(ag) {
      var name = (lang === 'hi' && ag.name.hi) ? ag.name.hi : ag.name.en;
      var agIdSafe = _ddEscHtml(ag.id);
      html += '<div class="dd-agent-item">'
            +   '<span class="dd-agent-icon">' + (ag.icon || '&#129302;') + '</span>'
            +   '<span class="dd-agent-name" title="' + _ddEscHtml(name) + '">' + _ddEscHtml(name) + '</span>'
            +   (ag.builtin ? '<span class="dd-agent-badge">built-in</span>' : '')
            +   '<div class="dd-agent-actions">'
            +     '<button class="dd-agent-btn" onclick="_ddLoadAgent(\'' + agIdSafe + '\')" type="button" title="' + (lang==='hi'?'कैनवास पर चलाएँ':'Run on canvas') + '">'
            +       (lang === 'hi' ? '&#9654;' : 'Run') + '</button>'
            +     (!ag.builtin ? '<button class="dd-agent-btn" onclick="_ddRenameAgentPrompt(\'' + agIdSafe + '\')" type="button" title="Rename">&#9998;</button>' : '')
            +     (!ag.builtin ? '<button class="dd-agent-btn" onclick="_ddDuplicateAgent(\'' + agIdSafe + '\')" type="button" title="Duplicate">&#10697;</button>' : '')
            +     (!ag.builtin ? '<button class="dd-agent-btn dd-agent-del" onclick="_ddDeleteAgent(\'' + agIdSafe + '\')" type="button" title="Delete">&#x2715;</button>' : '')
            +   '</div>'
            + '</div>';
    });
    html += '</div>';
  }
  container.innerHTML = html;
}

function _ddShowSaveAgentDialog() {
  var nodes = (window.DD && DD.workspace && DD.workspace.nodes) || [];
  if (!nodes.length) {
    toast((typeof uiLanguage !== 'undefined' && uiLanguage === 'hi')
      ? 'पहले कैनवास पर पाइपलाइन बनाएँ' : 'Build a pipeline on the canvas first', 'info');
    return;
  }
  var dlg = document.getElementById('dd-save-agent-dialog');
  if (!dlg) return;
  dlg.classList.add('active');
  var inp = document.getElementById('dd-sag-name-en');
  if (inp) { inp.value = ''; inp.focus(); inp.style.borderColor = ''; }
  var inpHi = document.getElementById('dd-sag-name-hi');
  if (inpHi) inpHi.value = '';
}

function _ddHideSaveAgentDialog() {
  var dlg = document.getElementById('dd-save-agent-dialog');
  if (dlg) dlg.classList.remove('active');
}

function _ddConfirmSaveAgent() {
  var inp   = document.getElementById('dd-sag-name-en');
  var inpHi = document.getElementById('dd-sag-name-hi');
  var nameEn = (inp   ? inp.value.trim()   : '');
  var nameHi = (inpHi ? inpHi.value.trim() : '');
  if (!nameEn) {
    if (inp) { inp.style.borderColor = '#f87171'; inp.focus(); }
    return;
  }
  DD.agents = DD.agents || [];
  DD.agents.push(_ddMakeAgentRecipe({ en: nameEn, hi: nameHi || nameEn }));
  _ddSaveAgents();
  _ddHideSaveAgentDialog();
  toast((typeof uiLanguage !== 'undefined' && uiLanguage === 'hi')
    ? '"' + (nameHi || nameEn) + '" सहेजा गया' : '"' + nameEn + '" saved as Agent', 'success');
  if (document.getElementById('dd-drawer-agents') &&
      document.getElementById('dd-drawer-agents').style.display === 'flex') {
    _ddRenderAgentList();
  }
}

function _ddMakeAgentRecipe(name) {
  var nodes = (DD.workspace && DD.workspace.nodes) || [];
  var edges = (DD.workspace && DD.workspace.edges) || [];
  var cx = nodes.reduce(function(s, n) { return s + n.x; }, 0) / (nodes.length || 1);
  var cy = nodes.reduce(function(s, n) { return s + n.y; }, 0) / (nodes.length || 1);

  var idToIdx = {};
  nodes.forEach(function(n, i) { idToIdx[n.id] = i; });

  var recipeNodes = nodes.map(function(node) {
    var mod = DD.modules && DD.modules[node.moduleId];
    var rn  = { moduleId: node.moduleId, relX: Math.round(node.x - cx), relY: Math.round(node.y - cy), config: {}, colBindings: {} };
    if (mod && mod.config) {
      mod.config.forEach(function(field) {
        var val = node.config && node.config[field.key];
        if (field.type === 'column' && val !== undefined && val !== null && val !== '') {
          var hdrs = (typeof headers !== 'undefined') ? headers : [];
          rn.colBindings[field.key] = (hdrs[+val] !== undefined) ? hdrs[+val] : '';
        } else if (val !== undefined) {
          rn.config[field.key] = val;
        }
      });
    }
    return rn;
  });

  var recipeEdges = edges.map(function(e) {
    return { from: idToIdx[e.from] !== undefined ? idToIdx[e.from] : -1,
             to:   idToIdx[e.to]   !== undefined ? idToIdx[e.to]   : -1 };
  }).filter(function(e) { return e.from >= 0 && e.to >= 0; });

  return { id:'ag_'+Date.now(), name:name, icon:'&#129302;', builtin:false,
           createdAt:new Date().toISOString(), nodes:recipeNodes, edges:recipeEdges };
}

function _ddDeleteAgent(agId) {
  DD.agents = (DD.agents || []).filter(function(a) { return a.id !== agId; });
  _ddSaveAgents();
  _ddRenderAgentList();
  toast((typeof uiLanguage !== 'undefined' && uiLanguage === 'hi') ? 'एजेंट हटाया गया' : 'Agent deleted', 'info');
}

function _ddDuplicateAgent(agId) {
  var src = (DD.agents || []).find(function(a) { return a.id === agId; });
  if (!src) return;
  var copy = JSON.parse(JSON.stringify(src));
  copy.id = 'ag_' + Date.now();
  copy.builtin = false;
  copy.name = { en: src.name.en + ' (copy)', hi: (src.name.hi || src.name.en) + ' (प्रति)' };
  DD.agents.push(copy);
  _ddSaveAgents();
  _ddRenderAgentList();
  toast((typeof uiLanguage !== 'undefined' && uiLanguage === 'hi') ? 'प्रतिलिपि बनाई गई' : 'Duplicated', 'success');
}

function _ddRenameAgentPrompt(agId) {
  var ag = (DD.agents || []).find(function(a) { return a.id === agId; });
  if (!ag) return;
  var lang = (typeof uiLanguage !== 'undefined') ? uiLanguage : 'en';
  var current = (lang === 'hi' && ag.name.hi) ? ag.name.hi : ag.name.en;
  var newName = window.prompt((lang === 'hi' ? 'एजेंट का नाम बदलें / Rename agent' : 'Rename agent'), current);
  if (newName === null) return;
  newName = newName.trim();
  if (!newName) return;
  ag.name.en = newName;
  ag.name.hi = newName;
  _ddSaveAgents();
  _ddRenderAgentList();
}

function _ddLoadAgent(agId) {
  var allAgents = _BUILTIN_AGENTS.concat(DD.agents || []);
  var ag = null;
  for (var i = 0; i < allAgents.length; i++) { if (allAgents[i].id === agId) { ag = allAgents[i]; break; } }
  if (!ag || !ag.nodes || !ag.nodes.length) {
    toast('Agent not found / एजेंट नहीं मिला', 'error'); return;
  }
  var hdrs = (typeof headers !== 'undefined') ? headers : [];

  // Detect which column bindings need user mapping
  var remapNeeded = [];
  ag.nodes.forEach(function(rn, nodeIdx) {
    Object.keys(rn.colBindings || {}).forEach(function(key) {
      var savedName = rn.colBindings[key];
      if (!savedName || hdrs.indexOf(savedName) < 0) {
        remapNeeded.push({ nodeIdx: nodeIdx, key: key, savedName: savedName });
      }
    });
  });

  if (remapNeeded.length) {
    _ddShowRemapDialog(ag, remapNeeded);
  } else {
    _ddBuildAgentOnCanvas(ag, {});
  }
}

function _ddShowRemapDialog(ag, remapNeeded) {
  var dlg = document.getElementById('dd-remap-dialog');
  if (!dlg) return;
  var lang = (typeof uiLanguage !== 'undefined') ? uiLanguage : 'en';
  var hdrs = (typeof headers !== 'undefined') ? headers : [];
  var agName = (lang === 'hi' && ag.name.hi) ? ag.name.hi : ag.name.en;

  if (!hdrs.length) {
    toast((lang === 'hi' ? 'पहले डेटा आयात करें' : 'Import data first before running an agent'), 'info');
    return;
  }

  var inner =
    '<div class="dd-remap-head">'
  +   '<h3 class="dd-remap-title">' + (lang==='hi' ? 'कॉलम मैपिंग' : 'Column Mapping') + '</h3>'
  +   '<p class="dd-remap-desc">' + _ddEscHtml(agName) + ' &mdash; '
  +     (lang==='hi' ? 'एजेंट के कॉलम वर्तमान डेटा से मिलाएँ' : "Map the agent's columns to your current data")
  + '</p></div><div class="dd-remap-rows">';

  remapNeeded.forEach(function(rm, i) {
    var mod = DD.modules && DD.modules[(ag.nodes[rm.nodeIdx] || {}).moduleId];
    var modName  = mod ? (lang==='hi'&&mod.name.hi ? mod.name.hi : mod.name.en) : (ag.nodes[rm.nodeIdx]||{}).moduleId;
    var cfgField = mod && mod.config && mod.config.find(function(f){return f.key===rm.key;});
    var fldLabel = cfgField ? (lang==='hi'&&cfgField.label.hi ? cfgField.label.hi : cfgField.label.en) : rm.key;

    inner += '<div class="dd-remap-row"><label class="dd-remap-label">'
           + '<span class="dd-remap-mod">' + _ddEscHtml(modName) + '</span>'
           + ' &rsaquo; ' + _ddEscHtml(fldLabel)
           + (rm.savedName ? ' <span class="dd-remap-was">(&ldquo;' + _ddEscHtml(rm.savedName) + '&rdquo;)</span>' : '')
           + '</label><select class="dd-remap-sel" data-ridx="' + i + '">'
           + '<option value="">' + (lang==='hi'?'— कॉलम चुनें —':'— choose column —') + '</option>';
    hdrs.forEach(function(h, ci) {
      var autoSel = rm.savedName && h.toLowerCase().includes(rm.savedName.toLowerCase());
      inner += '<option value="' + ci + '"' + (autoSel?' selected':'') + '>' + _ddEscHtml(h) + '</option>';
    });
    inner += '</select></div>';
  });

  inner += '</div><div class="dd-remap-foot">'
         + '<button class="dd-remap-cancel" onclick="_ddHideRemapDialog()" type="button">'
         + (lang==='hi'?'रद्द करें':'Cancel') + '</button>'
         + '<button class="dd-remap-ok" onclick="_ddConfirmRemap()" type="button">'
         + (lang==='hi'?'&#9654; लागू करें':'&#9654; Apply') + '</button></div>';

  dlg.querySelector('.dd-remap-body').innerHTML = inner;
  dlg._ag    = ag;
  dlg._remap = remapNeeded;
  dlg.classList.add('active');
}

function _ddHideRemapDialog() {
  var dlg = document.getElementById('dd-remap-dialog');
  if (dlg) { dlg.classList.remove('active'); dlg._ag = null; dlg._remap = null; }
}

function _ddConfirmRemap() {
  var dlg = document.getElementById('dd-remap-dialog');
  if (!dlg || !dlg._ag) return;
  var remapNeeded = dlg._remap || [];
  var overrides = {};
  var missing = false;

  dlg.querySelectorAll('.dd-remap-sel').forEach(function(sel, i) {
    var rm = remapNeeded[i];
    if (!rm) return;
    if (!sel.value) { sel.style.borderColor = '#f87171'; missing = true; return; }
    overrides[rm.nodeIdx + ':' + rm.key] = parseInt(sel.value, 10);
  });

  if (missing) {
    toast((typeof uiLanguage !== 'undefined' && uiLanguage === 'hi')
      ? 'सभी कॉलम मैप करें' : 'Please map all columns', 'info');
    return;
  }

  var ag = dlg._ag;
  _ddHideRemapDialog();
  _ddBuildAgentOnCanvas(ag, overrides);
}

function _ddBuildAgentOnCanvas(ag, overrides) {
  // Ensure agents view is active
  if (typeof switchDDView === 'function') switchDDView('agents');

  // Clear existing canvas state
  var nodesLayer = document.getElementById('dd-nodes-layer');
  if (nodesLayer) nodesLayer.innerHTML = '';
  document.querySelectorAll('.dd-result-card').forEach(function(c) { c.remove(); });
  window.DD = window.DD || {};
  DD.workspace = DD.workspace || { view: 'agents', nodes: [], edges: [] };
  DD.workspace.nodes = [];
  DD.workspace.edges = [];
  if (typeof _ddRedrawEdges === 'function') _ddRedrawEdges();

  // Compute canvas center (with fallback for hidden canvas)
  var canvas = document.getElementById('dd-agents-canvas');
  var cW = (canvas && canvas.offsetWidth  > 0) ? canvas.offsetWidth  : 820;
  var cH = (canvas && canvas.offsetHeight > 0) ? canvas.offsetHeight : 480;
  var cx = Math.round(cW / 2);
  var cy = Math.max(140, Math.round(cH / 2));

  var hdrs = (typeof headers !== 'undefined') ? headers : [];

  // Build nodes
  var newNodes = ag.nodes.map(function(rn, idx) {
    var nodeId = 'n_' + Date.now() + '_' + idx;
    var config = Object.assign({}, rn.config || {});
    Object.keys(rn.colBindings || {}).forEach(function(key) {
      var ovrKey = idx + ':' + key;
      if (overrides[ovrKey] !== undefined) {
        config[key] = overrides[ovrKey];
      } else {
        var savedName = rn.colBindings[key];
        var ci = hdrs.indexOf(savedName);
        if (ci >= 0) config[key] = ci;
      }
    });
    var node = {
      id: nodeId, moduleId: rn.moduleId,
      x: Math.round(cx + rn.relX), y: Math.round(cy + rn.relY),
      bindings: {}, config: config, status: 'idle', result: null
    };
    DD.workspace.nodes.push(node);
    if (typeof _ddRenderNode === 'function') _ddRenderNode(node, true);
    return node;
  });

  // Build edges (by recipe index → new node IDs)
  (ag.edges || []).forEach(function(re) {
    var fromNode = newNodes[re.from], toNode = newNodes[re.to];
    if (fromNode && toNode && typeof _ddCreateEdge === 'function') {
      _ddCreateEdge(fromNode.id, toNode.id);
    }
  });

  if (typeof _ddUpdateCanvasEmpty  === 'function') _ddUpdateCanvasEmpty();
  if (typeof _ddSaveNodes          === 'function') _ddSaveNodes();
  if (typeof _ddUpdateRunAgentBtn  === 'function') _ddUpdateRunAgentBtn();

  var lang = (typeof uiLanguage !== 'undefined') ? uiLanguage : 'en';
  var agName = (lang === 'hi' && ag.name.hi) ? ag.name.hi : ag.name.en;
  toast((lang === 'hi' ? '"' + agName + '" कैनवास पर लोड हुआ' : '"' + agName + '" loaded on canvas'), 'success');
}

// Initialize DD.agents at parse time
_ddInitAgents();

// ─── Batch 11: Focus / 360 Mode ─────────────────────────────────────────────

var _ddFocusState = { active: false, nodeIdx: 0, prevView: 'agents' };

function _ddEnterFocus() {
  if (!window.DD || !DD.workspace || !(DD.workspace.nodes || []).length) {
    toast('Add nodes to the canvas first / पहले कैनवास पर नोड जोड़ें', 'info');
    return;
  }
  _ddFocusState.prevView = DD.workspace.view || 'agents';
  _ddFocusState.nodeIdx  = 0;
  _ddFocusState.active   = true;
  if (typeof _ddClosePopover === 'function') _ddClosePopover();

  var overlay = document.getElementById('dd-focus-overlay');
  if (!overlay) return;
  overlay.classList.add('active');

  var reduceMotion = window.DD && DD.ui && DD.ui.reduceMotion;
  if (!reduceMotion && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(function() {});
  }

  _ddFocusRenderDock();
  _ddFocusOpenNode(0);
  document.addEventListener('keydown',          _ddFocusKeyHandler);
  document.addEventListener('fullscreenchange', _ddFocusFullscreenChange);
}

function _ddExitFocus() {
  if (!_ddFocusState.active) return;
  _ddFocusState.active = false;
  var overlay = document.getElementById('dd-focus-overlay');
  if (overlay) overlay.classList.remove('active');
  document.removeEventListener('keydown',          _ddFocusKeyHandler);
  document.removeEventListener('fullscreenchange', _ddFocusFullscreenChange);
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(function() {});
  }
  if (typeof switchDDView === 'function') switchDDView(_ddFocusState.prevView || 'agents');
}

function _ddFocusFullscreenChange() {
  if (_ddFocusState.active && !document.fullscreenElement) _ddExitFocus();
}

function _ddFocusKeyHandler(e) {
  if (!_ddFocusState.active) return;
  if (e.key === 'Escape') { e.preventDefault(); _ddExitFocus(); }
  else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); _ddFocusNav(1); }
  else if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); _ddFocusNav(-1); }
}

function _ddFocusNav(dir) {
  var nodes = (window.DD && DD.workspace && DD.workspace.nodes) || [];
  if (!nodes.length) return;
  _ddFocusState.nodeIdx = (_ddFocusState.nodeIdx + dir + nodes.length) % nodes.length;
  _ddFocusSyncDock();
  _ddFocusOpenNode(_ddFocusState.nodeIdx);
}

function _ddFocusRenderDock() {
  var dock = document.getElementById('dd-focus-dock');
  if (!dock) return;
  var nodes = (window.DD && DD.workspace && DD.workspace.nodes) || [];
  var lang = (typeof uiLanguage !== 'undefined') ? uiLanguage : 'en';
  dock.innerHTML = '';
  nodes.forEach(function(node, i) {
    var mod   = DD.modules && DD.modules[node.moduleId];
    var label = mod ? ((lang === 'hi' && mod.name.hi) ? mod.name.hi : mod.name.en) : node.moduleId;
    var color = mod ? (mod.color || '#ddb8ff') : '#ddb8ff';
    var icon  = mod ? (mod.icon  || '&#9711;') : '&#9711;';
    var statusClass = node.status === 'done'  ? ' done'
                    : node.status === 'error' ? ' err' : '';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dd-focus-bubble' + (i === _ddFocusState.nodeIdx ? ' active' : '') + statusClass;
    btn.style.setProperty('--foc-color', color);
    btn.setAttribute('aria-label', label);
    btn.innerHTML = '<span class="dd-focus-bubble-icon">' + icon + '</span>'
                  + '<span class="dd-focus-bubble-label">' + _ddEscHtml(label) + '</span>';
    btn.addEventListener('click', (function(idx) {
      return function() { _ddFocusState.nodeIdx = idx; _ddFocusSyncDock(); _ddFocusOpenNode(idx); };
    })(i));
    dock.appendChild(btn);
  });
}

function _ddFocusSyncDock() {
  document.querySelectorAll('.dd-focus-bubble').forEach(function(b, i) {
    b.classList.toggle('active', i === _ddFocusState.nodeIdx);
  });
}

function _ddFocusOpenNode(idx) {
  _ddFocusState.nodeIdx = idx;
  var nodes = (window.DD && DD.workspace && DD.workspace.nodes) || [];
  var node  = nodes[idx];
  var modal = document.getElementById('dd-focus-modal');
  if (!modal) return;
  if (!node) { modal.innerHTML = ''; return; }

  var mod  = DD.modules && DD.modules[node.moduleId];
  var lang = (typeof uiLanguage !== 'undefined') ? uiLanguage : 'en';
  var t    = function(obj) { return (obj && (obj[lang] || obj.en)) || ''; };
  var label = mod ? t(mod.name) : node.moduleId;
  var color = mod ? (mod.color || '#ddb8ff') : '#ddb8ff';
  var icon  = mod ? (mod.icon  || '&#9711;') : '&#9711;';
  var st    = node.status || 'idle';

  var html =
    '<div class="dd-focus-modal-header" style="--foc-color:' + color + '">'
  +   '<span class="dd-focus-modal-icon">' + icon + '</span>'
  +   '<span class="dd-focus-modal-title">' + _ddEscHtml(label) + '</span>'
  +   '<span class="dd-focus-status-dot dd-focus-status-' + st + '" title="' + st + '"></span>'
  + '</div>';

  if (mod && mod.desc) {
    html += '<p class="dd-focus-mod-desc">' + _ddEscHtml(t(mod.desc)) + '</p>';
  }

  html += '<div class="dd-focus-config">';
  if (mod && mod.config && mod.config.length) {
    mod.config.forEach(function(field) {
      var lbl   = t(field.label) || field.key;
      var saved = (node.config && node.config[field.key] !== undefined) ? node.config[field.key] : '';
      html += '<div class="dd-focus-field"><label class="dd-focus-label">' + _ddEscHtml(lbl) + '</label>';
      if (field.type === 'column') {
        html += '<select class="dd-focus-select" data-field="' + _ddEscHtml(field.key) + '" data-ftype="column">'
              + '<option value="">' + (lang === 'hi' ? '— कॉलम चुनें —' : '— choose column —') + '</option>';
        (typeof headers !== 'undefined' ? headers : []).forEach(function(hdr, ci) {
          html += '<option value="' + ci + '"' + (String(saved) === String(ci) ? ' selected' : '') + '>' + _ddEscHtml(hdr) + '</option>';
        });
        html += '</select>';
      } else if (field.type === 'select') {
        html += '<select class="dd-focus-select" data-field="' + _ddEscHtml(field.key) + '" data-ftype="select">';
        (field.options || []).forEach(function(opt) {
          var optVal = (typeof opt === 'object') ? (opt.value || '') : String(opt);
          var optLbl = (typeof opt === 'object') ? (opt.label || opt.value || '') : String(opt);
          html += '<option value="' + _ddEscHtml(optVal) + '"' + (String(saved) === optVal ? ' selected' : '') + '>' + _ddEscHtml(optLbl) + '</option>';
        });
        html += '</select>';
      } else if (field.type === 'number') {
        html += '<input type="number" class="dd-focus-input" data-field="' + _ddEscHtml(field.key) + '"'
              + ' value="' + _ddEscHtml(String(saved !== '' ? saved : (field.min || 1))) + '"'
              + ' min="' + (field.min || 1) + '">';
      } else {
        html += '<input type="text" class="dd-focus-input" data-field="' + _ddEscHtml(field.key) + '"'
              + ' value="' + _ddEscHtml(String(saved || '')) + '">';
      }
      html += '</div>';
    });
  } else {
    html += '<p style="font-size:11px;color:var(--text-muted);margin:0 0 8px">'
          + (lang === 'hi' ? 'कोई कॉन्फ़िगरेशन आवश्यक नहीं' : 'No configuration needed') + '</p>';
  }
  html += '</div>';

  html += '<button class="dd-focus-run-btn" id="dd-focus-run-btn-el" type="button"'
        + (st === 'running' ? ' disabled' : '') + '>'
        + (st === 'running'
            ? (lang === 'hi' ? '&#9203; चल रहा है…' : '&#9203; Running…')
            : (lang === 'hi' ? '&#9654; चलाएँ' : '&#9654; Run / चलाएँ'))
        + '</button>';

  if (node.result && node.result.display) {
    html += '<div class="dd-focus-result">' + node.result.display + '</div>';
  }

  modal.innerHTML = html;

  var runBtn = document.getElementById('dd-focus-run-btn-el');
  if (runBtn && st !== 'running') {
    runBtn.addEventListener('click', (function(nid) { return function() { _ddFocusRunNode(nid); }; })(node.id));
  }
}

function _ddFocusRunNode(nodeId) {
  var nodes = (window.DD && DD.workspace && DD.workspace.nodes) || [];
  var node = null, idx = -1;
  for (var i = 0; i < nodes.length; i++) { if (nodes[i].id === nodeId) { node = nodes[i]; idx = i; break; } }
  if (!node || idx < 0) return;

  // Collect config values from modal form before mutation
  var modal = document.getElementById('dd-focus-modal');
  if (modal) {
    node.config = node.config || {};
    modal.querySelectorAll('[data-field]').forEach(function(ctrl) {
      var fk = ctrl.dataset.field, ft = ctrl.dataset.ftype;
      if (ft === 'column') node.config[fk] = ctrl.value !== '' ? parseInt(ctrl.value, 10) : undefined;
      else if (ctrl.type === 'number') node.config[fk] = parseFloat(ctrl.value) || 0;
      else node.config[fk] = ctrl.value;
    });
  }

  var mod = DD.modules && DD.modules[node.moduleId];
  if (!mod) return;

  node.status = 'running';
  _ddFocusRenderDock();
  _ddFocusOpenNode(idx);

  var upstream = typeof _ddGetUpstream === 'function' ? _ddGetUpstream(node.id) : [];
  var helpers  = (typeof _ddHelpers !== 'undefined') ? _ddHelpers : {};
  Promise.resolve().then(function() { return mod.run(node, helpers, upstream); }).then(function(result) {
    node.status = 'done';
    node.result = result;
    if (typeof _ddUpdateNodeStatus === 'function') _ddUpdateNodeStatus(node.id, 'done');
    if (typeof _ddShowResult       === 'function') _ddShowResult(node, result);
    if (typeof _ddSaveNodes        === 'function') _ddSaveNodes();
    _ddFocusRenderDock();
    _ddFocusOpenNode(idx);
  }).catch(function(err) {
    node.status = 'error';
    node.result = { type:'error', display:'<div class="dd-res-error">&#9888; ' + _ddEscHtml(err.message || 'Error') + '</div>', raw:null };
    if (typeof _ddSaveNodes === 'function') _ddSaveNodes();
    _ddFocusRenderDock();
    _ddFocusOpenNode(idx);
  });
}

// Extend _ddUpdateRunAgentBtn to also track Focus button visibility
(function() {
  var _origUpd = window._ddUpdateRunAgentBtn || function(){};
  window._ddUpdateRunAgentBtn = function() {
    _origUpd();
    var focBtn = document.getElementById('dd-focus-btn');
    if (!focBtn || !window.DD || !DD.workspace) return;
    focBtn.style.display = (DD.workspace.nodes || []).length > 0 ? '' : 'none';
  };
})();

// ─── Batch 13: Onboarding Tour · Reduce-Motion Toggle · Accessibility ────────

// Restore reduce-motion preference from localStorage at parse time (before DOMContentLoaded)
(function() {
  try {
    if (localStorage.getItem('sda_reduce_motion') === '1') {
      window.DD = window.DD || {};
      DD.ui = DD.ui || {};
      DD.ui.reduceMotion = true;
      document.documentElement.classList.add('reduce-motion');
    }
  } catch(e) {}
})();

// ── Guided Tour ──────────────────────────────────────────────────────────────

var _DD_TOUR_STEPS = [
  {
    en: { title: 'Welcome to Stellura!',
          body: 'Your offline data analysis tool. No internet needed — your data never leaves this device.' },
    hi: { title: 'Stellura में आपका स्वागत है!',
          body: 'आपका ऑफलाइन डेटा विश्लेषण टूल। इंटरनेट की ज़रूरत नहीं — आपका डेटा इस डिवाइस से बाहर नहीं जाता।' },
    anchor: null, pos: 'center'
  },
  {
    en: { title: 'Step 1 — Load your data',
          body: 'Drop a CSV or Excel file anywhere on the screen, or paste data from clipboard. A sample dataset link is on the home screen if you want to try right now.' },
    hi: { title: 'चरण 1 — डेटा लोड करें',
          body: 'CSV या Excel फ़ाइल स्क्रीन पर कहीं भी छोड़ें, या क्लिपबोर्ड से पेस्ट करें। अभी आज़माने के लिए होम स्क्रीन पर नमूना डेटासेट लिंक देखें।' },
    anchor: 'dropZone', pos: 'right'
  },
  {
    en: { title: 'Step 2 — Open Agents view',
          body: 'Click "Agents" in the top bar. Then drag any bubble from the left drawer onto the canvas to add an analysis step.' },
    hi: { title: 'चरण 2 — Agents व्यू खोलें',
          body: 'ऊपर "Agents" बटन दबाएं। फिर बाईं दराज से कोई भी बुलबुला खींचकर कैनवास पर छोड़ें।' },
    anchor: null, pos: 'center'
  },
  {
    en: { title: 'Step 3 — Configure & Connect',
          body: 'Click a bubble to choose which column to analyse. Drag from the orange dot on one bubble to another to chain them into a pipeline.' },
    hi: { title: 'चरण 3 — सेट करें और जोड़ें',
          body: 'बुलबुले पर क्लिक करके कॉलम चुनें। एक बुलबुले के नारंगी बिंदु से दूसरे तक खींचकर पाइपलाइन बनाएं।' },
    anchor: null, pos: 'center'
  },
  {
    en: { title: 'Step 4 — Run & See Results',
          body: 'Press ▶ Run Agent. Results appear as cards on the canvas. Drag a card to Sheet or Dashboard. Save your pipeline as a named Agent recipe to reuse it.' },
    hi: { title: 'चरण 4 — चलाएं और परिणाम देखें',
          body: '▶ Run Agent दबाएं। परिणाम कैनवास पर कार्ड के रूप में आएंगे। कार्ड को Sheet या Dashboard पर खींचें। पाइपलाइन को Agent रेसिपी के रूप में सेव करें।' },
    anchor: null, pos: 'center'
  }
];

var _ddTourStepIdx = 0;

function _ddInitTour() {
  try { if (localStorage.getItem('sda_first_run') === 'done') return; } catch(e) {}
  setTimeout(_ddShowTour, 900);
}

function _ddShowTour() {
  var ovl = document.getElementById('dd-tour-overlay');
  if (!ovl) return;
  _ddTourStepIdx = 0;
  ovl.classList.add('active');
  _ddRenderTourStep(_ddTourStepIdx);
}

function _ddRenderTourStep(idx) {
  var step = _DD_TOUR_STEPS[idx];
  if (!step) { _ddSkipTour(); return; }
  var lang = (typeof uiLanguage !== 'undefined') ? uiLanguage : 'en';
  var t = (lang === 'hi' && step.hi) ? step.hi : step.en;
  var total = _DD_TOUR_STEPS.length;
  var ovl = document.getElementById('dd-tour-overlay');
  if (!ovl) return;

  var dots = Array.from({length: total}, function(_, i) {
    return '<span class="dd-tour-dot' + (i === idx ? ' active' : '') + '" aria-hidden="true"></span>';
  }).join('');

  var isLast = (idx === total - 1);
  var nextLabel = isLast
    ? (lang === 'hi' ? '✓ शुरू करें' : '✓ Get Started')
    : (lang === 'hi' ? 'अगला →' : 'Next →');
  var skipLabel = lang === 'hi' ? 'छोड़ें' : 'Skip';

  var html = '<div class="dd-tour-dots" aria-label="Step ' + (idx + 1) + ' of ' + total + '">' + dots + '</div>'
           + '<div class="dd-tour-title" id="dd-tour-title">' + _ddEscHtml(t.title) + '</div>'
           + '<div class="dd-tour-body">' + _ddEscHtml(t.body) + '</div>'
           + '<div class="dd-tour-btns">'
           +   '<button class="dd-tour-skip" onclick="_ddSkipTour()" type="button">' + skipLabel + '</button>'
           +   '<button class="dd-tour-next" onclick="_ddTourNext()" type="button">' + nextLabel + '</button>'
           + '</div>';

  var card = ovl.querySelector('.dd-tour-card');
  if (!card) {
    card = document.createElement('div');
    card.className = 'dd-tour-card';
    card.setAttribute('role', 'document');
    card.addEventListener('click', function(e) { e.stopPropagation(); });
    ovl.appendChild(card);
  }
  card.innerHTML = html;

  // Position: anchor element or center screen
  var anchor = step.anchor ? document.getElementById(step.anchor) : null;
  if (anchor && step.pos !== 'center') {
    var r = anchor.getBoundingClientRect();
    card.style.transform = '';
    if (step.pos === 'right') {
      card.style.top  = Math.max(20, r.top) + 'px';
      card.style.left = Math.min(r.right + 18, window.innerWidth - 360) + 'px';
    } else {
      card.style.top  = (r.bottom + 14) + 'px';
      card.style.left = Math.max(20, Math.min(r.left, window.innerWidth - 360)) + 'px';
    }
  } else {
    card.style.top       = '50%';
    card.style.left      = '50%';
    card.style.transform = 'translate(-50%, -50%)';
  }
}

function _ddTourNext() {
  _ddTourStepIdx++;
  if (_ddTourStepIdx >= _DD_TOUR_STEPS.length) { _ddSkipTour(); return; }
  _ddRenderTourStep(_ddTourStepIdx);
}

function _ddSkipTour() {
  var ovl = document.getElementById('dd-tour-overlay');
  if (ovl) ovl.classList.remove('active');
  try { localStorage.setItem('sda_first_run', 'done'); } catch(e) {}
}

// Tour keyboard navigation (Esc = skip, ArrowRight/Enter = next)
document.addEventListener('keydown', function(e) {
  var ovl = document.getElementById('dd-tour-overlay');
  if (!ovl || !ovl.classList.contains('active')) return;
  if (e.key === 'Escape') { e.preventDefault(); _ddSkipTour(); }
  else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); _ddTourNext(); }
});

// ── Reduce-Motion Toggle ─────────────────────────────────────────────────────

function _ddToggleReduceMotion(toggleEl) {
  window.DD = window.DD || {};
  DD.ui = DD.ui || { reduceMotion: false };
  DD.ui.reduceMotion = !DD.ui.reduceMotion;
  document.documentElement.classList.toggle('reduce-motion', DD.ui.reduceMotion);
  if (toggleEl) {
    toggleEl.classList.toggle('on', DD.ui.reduceMotion);
    toggleEl.setAttribute('aria-checked', DD.ui.reduceMotion ? 'true' : 'false');
  }
  try { localStorage.setItem('sda_reduce_motion', DD.ui.reduceMotion ? '1' : '0'); } catch(e) {}
  var lang = (typeof uiLanguage !== 'undefined') ? uiLanguage : 'en';
  toast(DD.ui.reduceMotion
    ? (lang === 'hi' ? 'शांत मोड चालू — एनिमेशन बंद' : 'Calm mode ON — animations off')
    : (lang === 'hi' ? 'शांत मोड बंद' : 'Calm mode OFF'), 'info');
}

// ── Auto-Calm (low-end hardware detection) ───────────────────────────────────

function _ddAutoCalmCheck() {
  try {
    var savedPref = localStorage.getItem('sda_reduce_motion');
    var tog = document.getElementById('reduceMotionToggle');
    if (savedPref !== null) {
      var isOn = (savedPref === '1');
      if (isOn) {
        window.DD = window.DD || {};
        DD.ui = DD.ui || {};
        DD.ui.reduceMotion = true;
        document.documentElement.classList.add('reduce-motion');
      }
      if (tog) {
        tog.classList.toggle('on', isOn);
        tog.setAttribute('aria-checked', isOn ? 'true' : 'false');
      }
      return; // Respect explicit user choice
    }
    // No saved preference — probe hardware
    var lowHw = false;
    if (typeof navigator.hardwareConcurrency !== 'undefined' && navigator.hardwareConcurrency <= 2) lowHw = true;
    if (!lowHw && typeof navigator.deviceMemory !== 'undefined' && navigator.deviceMemory < 2) lowHw = true;
    if (lowHw) {
      window.DD = window.DD || {};
      DD.ui = DD.ui || {};
      DD.ui.reduceMotion = true;
      document.documentElement.classList.add('reduce-motion');
      if (tog) { tog.classList.add('on'); tog.setAttribute('aria-checked', 'true'); }
      try { localStorage.setItem('sda_reduce_motion', '1'); } catch(ex) {}
      var lang2 = (typeof uiLanguage !== 'undefined') ? uiLanguage : 'en';
      toast(lang2 === 'hi'
        ? 'शांत मोड स्वतः चालू (कमज़ोर हार्डवेयर)'
        : 'Calm mode auto-enabled for smoother performance', 'info');
    } else {
      if (tog && window.DD && DD.ui) {
        tog.classList.toggle('on', !!DD.ui.reduceMotion);
        tog.setAttribute('aria-checked', DD.ui.reduceMotion ? 'true' : 'false');
      }
    }
  } catch(e) {}
}

// ── Plain-language module description patches ────────────────────────────────

function _ddPatchModuleDescs() {
  if (!window.DD || !DD.modules) return;
  var patches = {
    outliers_iqr:    { en: 'Find unusually high or low values that stand out from the rest',
                       hi: 'असाधारण रूप से ऊंचे या नीचे मूल्य वाली पंक्तियां खोजें' },
    linreg_project:  { en: 'Predict future values from the current trend in your data',
                       hi: 'डेटा के रुझान से आगे के मूल्यों का अनुमान लगाएं' },
    moving_avg:      { en: 'Average nearby values to smooth out noise and reveal the trend',
                       hi: 'नज़दीकी पंक्तियों का औसत निकालकर डेटा सुचारु करें' },
    growth_rate:     { en: 'How fast values are growing or shrinking, row by row (%)',
                       hi: 'पंक्ति दर पंक्ति मूल्य कितनी तेज़ी से बढ़ या घट रहे हैं (%)' },
    normalize:       { en: 'Scale all values to a 0–1 range so columns can be compared fairly',
                       hi: 'सभी मूल्यों को 0–1 के बीच लाएं ताकि कॉलमों की तुलना हो सके' }
  };
  Object.keys(patches).forEach(function(id) {
    if (DD.modules[id]) {
      DD.modules[id].desc.en = patches[id].en;
      DD.modules[id].desc.hi = patches[id].hi;
    }
  });
  if (typeof renderModuleDrawer === 'function') renderModuleDrawer();
}

// ── Aria-label pass for icon-only interactive elements ───────────────────────

function _ddA11yPass() {
  document.querySelectorAll('.panel-close').forEach(function(btn) {
    if (!btn.getAttribute('aria-label')) btn.setAttribute('aria-label', 'Close / बंद करें');
  });
  document.querySelectorAll('.sb-icon[title]').forEach(function(el) {
    if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', el.getAttribute('title'));
  });
  document.querySelectorAll('.tb-btn[title]').forEach(function(btn) {
    if (!btn.getAttribute('aria-label')) btn.setAttribute('aria-label', btn.getAttribute('title'));
  });
}

// ── Hindi UI_TEXT completeness patch ─────────────────────────────────────────

(function() {
  document.addEventListener('DOMContentLoaded', function() {
    if (typeof UI_TEXT === 'undefined' || !UI_TEXT.hi) return;
    var hiPatch = {
      viewSheet: 'शीट', viewAgents: 'एजेंट', viewReports: 'रिपोर्ट',
      agentsTitle: 'एजेंट', dragModuleHere: 'शुरू करने के लिए मॉड्यूल खींचें',
      modules: 'मॉड्यूल', dragToWorkspace: 'वर्कस्पेस में खींचें',
      paste: 'चिपकाएं', analyze: 'विश्लेषण', functions: 'फ़ंक्शन',
      pivotTable: 'पिवट टेबल', validate: 'जांचें', smartClean: 'स्मार्ट क्लीन',
      autoFormat: 'स्वतः प्रारूप', inspector: 'निरीक्षक', printLayout: 'प्रिंट',
      excel: 'एक्सेल', pdf: 'पीडीएफ', save: 'सहेजें', undo: 'पूर्ववत', redo: 'फिर करें',
      deleteRows: 'पंक्ति हटाएं', rowCount: 'पंक्तियाँ', colCount: 'कॉलम',
      noData: 'कोई डेटा नहीं', searchPlaceholder: 'सभी कॉलम में खोजें...',
      darkMode: 'डार्क मोड', zebraStripes: 'ज़ेब्रा पंक्तियाँ',
      showRowNumbers: 'पंक्ति संख्या दिखाएं', formattingToolbar: 'फॉर्मेटिंग टूलबार',
      calmMode: 'शांत मोड (एनिमेशन बंद)', autoSave: 'स्वतः सहेजें',
      exportDefaults: 'निर्यात डिफ़ॉल्ट'
    };
    Object.keys(hiPatch).forEach(function(k) {
      if (!UI_TEXT.hi[k]) UI_TEXT.hi[k] = hiPatch[k];
    });
  });
})();

// ── Batch 13 DOMContentLoaded init ───────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
  _ddAutoCalmCheck();
  _ddPatchModuleDescs();
  _ddA11yPass();
  _ddInitTour();
});

function tryAutoLoad() {
  try {
    const saved = localStorage.getItem('sda_state_v2');
    if (saved) {
      const s = JSON.parse(saved);
      if (s.headers && s.rawData && s.rawData.length > 0) {
        headers = s.headers;
        rawData = s.rawData;
        colTypes = s.colTypes || [];
        cfRules = s.cfRules || [];
        activeFilters = s.activeFilters || [];
        validationRules = s.validationRules || [];
        cellFormulaMeta = s.cellFormulaMeta || {};
        if (s.documentName) document.getElementById('documentName').textContent = s.documentName;
        showTable();
        toast('Previous session restored', 'info');
      }
      // Batch 2: restore last view
      if (s.ddProvenance && Array.isArray(s.ddProvenance)) { try { window.DD = window.DD || {}; DD.provenance = s.ddProvenance; } catch(e) {} }
      if (s.ddView && ['sheet','agents','reports','xray','whatif','audit'].includes(s.ddView)) {
        try { switchDDView(s.ddView); } catch(e) {}
      }
      // Batch 4: restore placed nodes
      if (typeof _ddRestoreNodes === 'function') _ddRestoreNodes();
    }
  } catch(e) { /* silently fail */ }
}

