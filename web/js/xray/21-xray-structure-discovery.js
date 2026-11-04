(function(){
  window.DD=window.DD||{};
  DD.model=DD.model||{};
  DD.model.columns=DD.model.columns||[];
  DD.model.keys=DD.model.keys||[];
  DD.model.relationships=DD.model.relationships||[];
  DD.model.dependencies=DD.model.dependencies||[];
  DD.model.entityFlags=DD.model.entityFlags||[];
  DD.model.confirmed=DD.model.confirmed||[];
})();

// ── Idle scheduler (rIC with setTimeout fallback) ────────────────────────
function _xIdle(fn){
  if(typeof requestIdleCallback!=='undefined') requestIdleCallback(fn,{timeout:400});
  else setTimeout(fn,0);
}

// ── Date heuristic ───────────────────────────────────────────────────────
function _xIsDate(s){
  return s.length>=4&&s.length<=22&&/[\-\/\.]/.test(s)&&!isNaN(Date.parse(s));
}

// ── Trigrams for Jaccard entity similarity ───────────────────────────────
function _xTri(s){
  var p=' '+s.toLowerCase()+' ',t=new Set();
  for(var i=0;i<p.length-2;i++) t.add(p.slice(i,i+3));
  return t;
}
function _xJaccard(a,b){
  if(!a.size||!b.size) return 0;
  var n=0; a.forEach(function(x){if(b.has(x))n++;});
  return n/(a.size+b.size-n);
}

// ── Semantic type detection ──────────────────────────────────────────────
function _xSemantic(name,samples,baseType){
  var n=name.toLowerCase().replace(/[\s_\-\.]/g,'');
  if(/id$|^id|empid|empno|rollno|regid|employeeno|serialno|ref/.test(n)&&baseType!=='date') return 'id';
  if(/email/.test(n)) return 'email';
  if(/phone|mobile|mob|tel|contact/.test(n)) return 'phone';
  if(/salary|pay|income|amount|cost|price|fee|budget|expenditure|amt|₹|rs/.test(n)) return 'currency';
  if(/percent|pct|ratio|rate$/.test(n)) return 'percent';
  if(/date|dob|doj|born|joining/.test(n)) return 'date';
  if(/dept|department|division|section|district|state|zone|region/.test(n)) return 'code';
  if(samples.length<2) return baseType;
  var check=Math.min(samples.length,40),em=0,ph=0,pc=0;
  for(var i=0;i<check;i++){
    var v=String(samples[i]).trim();
    if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) em++;
    if(/^[\d\s+\-()\[\]]{7,16}$/.test(v)&&/\d{6,}/.test(v.replace(/\D/g,''))) ph++;
    if(/^\d+(\.\d+)?%$/.test(v)) pc++;
  }
  if(em/check>0.55) return 'email';
  if(ph/check>0.55) return 'phone';
  if(pc/check>0.55) return 'percent';
  return baseType;
}

// ── State ────────────────────────────────────────────────────────────────
var _xRunning=false;
var _xLastSig='';
var _xSelNode=null;

// ── Schedule / debounce profiling ────────────────────────────────────────
function _ddXraySchedule(force){
  var rows=(typeof rawData!=='undefined')?rawData:[];
  var hdrs=(typeof headers!=='undefined')?headers:[];
  if(!force&&(!hdrs.length||!rows.length)) return;
  var sig=hdrs.join('\t')+'|'+rows.length;
  if(!force&&sig===_xLastSig) return;
  _xLastSig=sig;
  if(_xRunning) return;
  _xRunning=true;
  _xProgress('Profiling… / विश्लेषण…');
  _xIdle(function(){
    _xProfile(function(cols){
      DD.model.columns=cols;
      _xFindKeys();
      _xProgress('Relationships… / संबंध…');
      _xIdle(function(){
        _xFindRel();
        _xProgress('Dependencies… / निर्भरता…');
        _xIdle(function(){
          _xFindDep();
          _xProgress('Entity flags… / डुप्लिकेट…');
          _xIdle(function(){
            _xEntityRes();
            _xLoadConfirmed();
            _xRunning=false;
            _xSaveModel();
            _xProgress(null);
            var xv=document.getElementById('dd-xray-view');
            if(xv&&xv.style.display!=='none') _ddXrayRender();
          });
        });
      });
    });
  });
}

function _xProgress(msg){
  var el=document.getElementById('dd-xray-progress');
  if(!el) return;
  if(msg){el.textContent=msg;el.style.display='';}
  else el.style.display='none';
}

// ── Column profiler (chunked, async) ────────────────────────────────────
function _xProfile(cb){
  var rows=(typeof rawData!=='undefined')?rawData:[];
  var hdrs=(typeof headers!=='undefined')?headers:[];
  if(!hdrs.length){cb([]);return;}
  // Batch 18: lift sample cap when SQL engine provides full-dataset stats
  var SAMPLE=(window.DD&&DD.sqlEngine==='alasql')?rows.length:Math.min(rows.length,20000);
  var cols=[],ci=0;
  function step(){
    var end=Math.min(ci+4,hdrs.length);
    for(;ci<end;ci++){
      var nc=0,nuc=0,dc=0,distinct=new Set(),nums=[],nn=[];
      for(var ri=0;ri<SAMPLE;ri++){
        var raw=rows[ri][ci];
        var s=(raw==null)?'':String(raw).trim();
        if(!s){nc++;continue;}
        nn.push(s);distinct.add(s);
        var num=parseFloat(s.replace(/[,₹$%\s]/g,''));
        if(!isNaN(num)){nuc++;nums.push(num);}
        else if(_xIsDate(s)) dc++;
      }
      var total=SAMPLE,nonNull=total-nc;
      var type='text';
      if(nonNull>0){
        if(nuc/nonNull>0.7) type='number';
        else if(dc/nonNull>0.7) type='date';
        else if(distinct.size<=2&&nonNull>5) type='boolean';
        else if(distinct.size<=Math.max(2,Math.floor(total*0.06))&&nonNull>5) type='categorical';
      }
      var min=null,max=null;
      if(type==='number'&&nums.length){min=Math.min.apply(null,nums);max=Math.max.apply(null,nums);}
      var cr=total>0?distinct.size/total:0;
      cols.push({
        key:hdrs[ci],sheet:'Sheet1',type:type,
        semantic:_xSemantic(hdrs[ci],nn.slice(0,200),type),
        distinct:distinct.size,nullRate:Math.round((nc/total)*1000)/1000,
        cardinalityRatio:Math.round(cr*1000)/1000,min:min,max:max,
        sample:Array.from(distinct).slice(0,8)
      });
    }
    if(ci<hdrs.length) _xIdle(step); else cb(cols);
  }
  _xIdle(step);
}

// ── Key detection ────────────────────────────────────────────────────────
function _xFindKeys(){
  DD.model.keys=DD.model.columns
    .filter(function(c){return c.cardinalityRatio>=0.98&&c.nullRate<=0.02;})
    .map(function(c){return{column:c.key,confidence:c.cardinalityRatio};});
}

// ── Relationship discovery (approx inclusion dependency) ─────────────────
// Names overlap only if they share an informative word (generic words such as
// "id", "no", "code" or "name" do not count) or one name contains the other.
var _X_GENERIC={id:1,no:1,sr:1,sl:1,code:1,name:1,date:1,of:1,num:1,number:1,type:1};
function _xNameOverlap(x,y){
  var nx=String(x).toLowerCase().replace(/[\s_\-\.\/]+/g,''),ny=String(y).toLowerCase().replace(/[\s_\-\.\/]+/g,'');
  if(nx.length>=4&&ny.length>=4&&(nx.includes(ny)||ny.includes(nx))) return true;
  var tx=String(x).toLowerCase().split(/[\s_\-\.\/]+/).filter(function(t){return t.length>=3&&!_X_GENERIC[t];});
  var ty=String(y).toLowerCase().split(/[\s_\-\.\/]+/).filter(function(t){return t.length>=3&&!_X_GENERIC[t];});
  return tx.some(function(t){return ty.indexOf(t)>=0;});
}
function _xFindRel(){
  DD.model.relationships=[];
  var cols=DD.model.columns;
  var rows=(typeof rawData!=='undefined')?rawData:[];
  var SAMPLE=Math.min(rows.length,20000),MAX_SET=8000,MAX_PAIRS=300,id=0;
  var sets={};
  cols.forEach(function(col,ci){
    var s=new Set();
    for(var ri=0;ri<SAMPLE&&s.size<MAX_SET;ri++){
      var v=rows[ri][ci];
      var str=(v==null)?'':String(v).trim();
      if(str) s.add(str);
    }
    sets[col.key]=s;
  });
  var keySet=new Set((DD.model.keys||[]).map(function(k){return k.column;}));
  var pairs=[];
  for(var i=0;i<cols.length;i++){
    for(var j=0;j<cols.length;j++){
      if(i===j||pairs.length>=MAX_PAIRS) break;
      var a=cols[i],b=cols[j];
      // A foreign key must point at a real key (unique, filled) and must repeat
      // enough to be meaningful. Small numbers inside a 1..n serial column are not links.
      if(a.distinct<8||b.cardinalityRatio<0.98||b.nullRate>0.02) continue;
      var sameSem=((a.semantic==='id'||a.semantic==='code')&&(b.semantic==='id'||b.semantic==='code'));
      var nameOvlp=_xNameOverlap(a.key,b.key);
      if(!sameSem&&!nameOvlp) continue;
      if(a.type==='number'&&a.semantic!=='id'&&!nameOvlp) continue;
      if(!pairs.some(function(p){return p[0]===i&&p[1]===j;})) pairs.push([i,j]);
    }
    if(pairs.length>=MAX_PAIRS) break;
  }
  pairs.forEach(function(pair){
    var a=cols[pair[0]],b=cols[pair[1]];
    var sa=sets[a.key],sb=sets[b.key];
    if(!sa||!sb||!sa.size||!sb.size) return;
    var hit=0; sa.forEach(function(v){if(sb.has(v))hit++;});
    var containment=hit/sa.size;
    if(containment>=0.90){
      DD.model.relationships.push({id:'rel_'+(id++),from:a.key,to:b.key,type:'fk',confidence:Math.round(containment*1000)/1000});
    }
  });
}

// ── Functional dependency (single-column, approximate) ───────────────────
function _xFindDep(){
  DD.model.dependencies=[];
  var cols=DD.model.columns;
  var rows=(typeof rawData!=='undefined')?rawData:[];
  var SAMPLE=Math.min(rows.length,20000),MAX_A=50,id=0;
  for(var ai=0;ai<cols.length;ai++){
    var ca=cols[ai];
    if(ca.distinct<2||ca.distinct>MAX_A) continue;
    // a numeric measure (rating, salary) does not "determine" a category
    if(ca.type==='number'&&ca.semantic!=='code'&&ca.semantic!=='id') continue;
    for(var bi=0;bi<cols.length;bi++){
      if(ai===bi) continue;
      if(cols[bi].distinct<2) continue;
      var grp={},gsz={},gb={};
      for(var ri=0;ri<SAMPLE;ri++){
        var av=rows[ri][ai],bv=rows[ri][bi];
        var as=(av==null)?'':String(av).trim();
        var bs=(bv==null)?'':String(bv).trim();
        if(!as) continue;
        if(!grp[as]){grp[as]={};gsz[as]=0;}
        grp[as][bs]=(grp[as][bs]||0)+1;
        gsz[as]++;gb[bs]=(gb[bs]||0)+1;
      }
      var totalR=0,confR=0;
      Object.keys(grp).forEach(function(gk){
        var sz=gsz[gk];totalR+=sz;
        var mx=0,vs=Object.values(grp[gk]);
        for(var k=0;k<vs.length;k++) if(vs[k]>mx) mx=vs[k];
        if(mx/sz>=0.95) confR+=sz;
      });
      var conf=totalR>0?confR/totalR:0;
      // must beat what chance alone gives (share of the most common value) and have real group sizes
      var gbMax=0;Object.keys(gb).forEach(function(k){if(gb[k]>gbMax)gbMax=gb[k];});
      var baseline=totalR>0?gbMax/totalR:1;
      var nGroups=Object.keys(grp).length;
      if(conf>=0.95&&(conf-baseline)>=0.2&&nGroups>0&&totalR/nGroups>=3){
        DD.model.dependencies.push({id:'dep_'+(id++),from:ca.key,to:cols[bi].key,confidence:Math.round(conf*1000)/1000});
      }
    }
  }
}

// ── Entity resolution (flag near-identical values in categorical cols) ────
function _xEntityRes(){
  DD.model.entityFlags=[];
  var cols=DD.model.columns;
  var rows=(typeof rawData!=='undefined')?rawData:[];
  var hdrs=(typeof headers!=='undefined')?headers:[];
  var checked=0;
  for(var ci=0;ci<cols.length&&checked<4;ci++){
    var col=cols[ci];
    if((col.type!=='categorical'&&col.type!=='text')||col.distinct<2||col.distinct>120) continue;
    checked++;
    var idx=hdrs.indexOf(col.key); if(idx<0) continue;
    var norm2orig={},SAMPLE=Math.min(rows.length,5000);
    for(var ri=0;ri<SAMPLE;ri++){
      var v=rows[ri][idx];
      var s=(v==null)?'':String(v).trim(); if(!s) continue;
      var nm=s.toLowerCase().replace(/\s+/g,' ');
      if(!norm2orig[nm]) norm2orig[nm]=s;
    }
    var keys=Object.keys(norm2orig); if(keys.length<2||keys.length>100) continue;
    keys.sort();
    for(var i=0;i<keys.length-1&&DD.model.entityFlags.length<30;i++){
      var na=keys[i],nb=keys[i+1]; if(na===nb) continue;
      var j=_xJaccard(_xTri(na),_xTri(nb));
      if(j>=0.60) DD.model.entityFlags.push({column:col.key,valueA:norm2orig[na],valueB:norm2orig[nb],similarity:Math.round(j*100)});
    }
  }
}

// ── Confirm / Dismiss decisions ──────────────────────────────────────────
function _ddXrayConfirm(id){_xDecide(id,'confirm');}
function _ddXrayDismiss(id){_xDecide(id,'dismiss');}
function _xDecide(id,dec){
  var confirmed=DD.model.confirmed;
  var idx=confirmed.findIndex(function(c){return c.id===id;});
  if(idx>=0) confirmed[idx].decision=dec;
  else confirmed.push({id:id,decision:dec});
  _xSaveModel(); _ddXrayRender();
}
function _xGetDec(id){
  var c=DD.model.confirmed.find(function(c){return c.id===id;});
  return c?c.decision:null;
}

// ── Persist DD.model to localStorage ─────────────────────────────────────
function _xSaveModel(){
  try{
    var s=JSON.parse(localStorage.getItem('sda_state_v2')||'{}');
    s.ddModel={
      keys:DD.model.keys,relationships:DD.model.relationships,
      dependencies:DD.model.dependencies,entityFlags:DD.model.entityFlags||[],
      confirmed:DD.model.confirmed
    };
    localStorage.setItem('sda_state_v2',JSON.stringify(s));
  }catch(e){}
}
function _xLoadConfirmed(){
  try{
    var s=JSON.parse(localStorage.getItem('sda_state_v2')||'{}');
    if(s.ddModel) DD.model.confirmed=s.ddModel.confirmed||[];
  }catch(e){}
}

// ── Render: list + graph ─────────────────────────────────────────────────
function _ddXrayRender(){ _xRenderList(); requestAnimationFrame(_xRenderGraph); }

function _xEsc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Findings list ────────────────────────────────────────────────────────
function _xRenderList(){
  var el=document.getElementById('dd-xray-findings'); if(!el) return;
  var isHi=(typeof uiLanguage!=='undefined'&&uiLanguage==='hi');
  var esc=(typeof escHtml==='function')?escHtml:_xEsc;
  var html='';

  // Keys
  if(DD.model.keys.length){
    html+='<div class="xr-section-title">'+(isHi?'कैंडिडेट कुंजियाँ':'Candidate Keys')+'</div>';
    DD.model.keys.forEach(function(k){
      html+='<div class="xr-finding"><div class="xr-finding-label"><span class="xr-badge xr-badge-key">KEY</span>'+esc(k.column)+'</div>'
        +'<div class="xr-conf">'+Math.round(k.confidence*100)+'% '+(isHi?'अनन्य':'unique')+'</div></div>';
    });
  }

  // FK relationships
  if(DD.model.relationships.length){
    html+='<div class="xr-section-title">'+(isHi?'संभावित FK संबंध':'Possible FK Relationships')+'</div>';
    DD.model.relationships.forEach(function(r){
      var dec=_xGetDec(r.id);
      var cls=dec==='confirm'?' xr-confirmed':dec==='dismiss'?' xr-dismissed':'';
      html+='<div class="xr-finding'+cls+'"><div class="xr-finding-label"><span class="xr-badge xr-badge-fk">FK</span><b>'+esc(r.from)+'</b> → '+esc(r.to)+'</div>'
        +'<div class="xr-conf">'+Math.round(r.confidence*100)+'% '+(isHi?'मिलान':'match')+(r.confidence<0.95?' · '+(isHi?'कम विश्वास':'low confidence'):'')+'</div>'
        +(dec?'<div class="xr-dec">'+(dec==='confirm'?'✓ '+(isHi?'पुष्ट':'Confirmed'):'✗ '+(isHi?'अनदेखा':'Dismissed'))+'</div>'
             :'<div class="xr-btns"><button type="button" class="xr-btn-confirm" onclick="_ddXrayConfirm(\''+r.id+'\')">✓ '+(isHi?'पुष्ट':'Confirm')+'</button>'
              +'<button type="button" class="xr-btn-dismiss" onclick="_ddXrayDismiss(\''+r.id+'\')">✗ '+(isHi?'अनदेखा':'Dismiss')+'</button></div>')
        +'</div>';
    });
  }

  // Functional dependencies
  if(DD.model.dependencies.length){
    html+='<div class="xr-section-title">'+(isHi?'कार्यात्मक निर्भरता':'Functional Dependencies')+'</div>';
    DD.model.dependencies.forEach(function(d){
      var dec=_xGetDec(d.id);
      var cls=dec==='confirm'?' xr-confirmed':dec==='dismiss'?' xr-dismissed':'';
      html+='<div class="xr-finding'+cls+'"><div class="xr-finding-label"><span class="xr-badge xr-badge-dep">DEP</span><b>'+esc(d.from)+'</b> → '+esc(d.to)+'</div>'
        +'<div class="xr-conf">'+Math.round(d.confidence*100)+'% '+(isHi?'विश्वसनीय':'confidence')+'</div>'
        +(dec?'<div class="xr-dec">'+(dec==='confirm'?'✓ '+(isHi?'पुष्ट':'Confirmed'):'✗ '+(isHi?'अनदेखा':'Dismissed'))+'</div>'
             :'<div class="xr-btns"><button type="button" class="xr-btn-confirm" onclick="_ddXrayConfirm(\''+d.id+'\')">✓ '+(isHi?'पुष्ट':'Confirm')+'</button>'
              +'<button type="button" class="xr-btn-dismiss" onclick="_ddXrayDismiss(\''+d.id+'\')">✗ '+(isHi?'अनदेखा':'Dismiss')+'</button></div>')
        +'</div>';
    });
  }

  // Entity flags
  var flags=DD.model.entityFlags||[];
  if(flags.length){
    html+='<div class="xr-section-title">'+(isHi?'संभावित डुप्लिकेट':'Possible Duplicates')+'</div>';
    flags.forEach(function(f){
      html+='<div class="xr-finding"><div class="xr-finding-label"><span class="xr-badge xr-badge-ent">≈</span>'+esc(f.column)+': <b>"'+esc(f.valueA)+'"</b> ≈ <b>"'+esc(f.valueB)+'"</b></div>'
        +'<div class="xr-conf">'+f.similarity+'% '+(isHi?'समान':'similar')+'</div></div>';
    });
  }

  if(!html){
    html='<div class="xr-empty">'+(isHi
      ?'कोई पैटर्न नहीं मिला।<br>डेटा लोड करें और ↺ Rescan दबाएं।'
      :'No patterns found yet.<br>Load data and press ↺ Rescan.')+'</div>';
  }
  el.innerHTML=html;
}

// ── SVG Force-graph ──────────────────────────────────────────────────────
function _xRenderGraph(){
  var svg=document.getElementById('dd-xray-svg'); if(!svg) return;
  var rect=svg.getBoundingClientRect();
  var W=rect.width||700,H=rect.height||420;
  var cols=DD.model.columns;
  var isHi=(typeof uiLanguage!=='undefined'&&uiLanguage==='hi');
  if(!cols.length){
    svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" fill="rgba(221,184,255,.25)" font-size="13" font-family="Sora,Segoe UI Variable,sans-serif">'
      +(isHi?'डेटा लोड करें और ↺ Rescan दबाएं':'Load data and click ↺ Rescan')+'</text>';
    return;
  }
  var MAX_NODES=40;
  var visCols=cols.slice(0,MAX_NODES);
  var nodeMap={},pad=54;
  var nodes=visCols.map(function(c,i){
    var angle=(i/visCols.length)*2*Math.PI-Math.PI/2;
    var rx=(W-2*pad)*0.38,ry=(H-2*pad)*0.36;
    return{id:c.key,col:c,
      x:W/2+rx*Math.cos(angle)+(Math.random()-0.5)*24,
      y:H/2+ry*Math.sin(angle)+(Math.random()-0.5)*24,
      vx:0,vy:0};
  });
  nodes.forEach(function(n){nodeMap[n.id]=n;});
  var keySet=new Set((DD.model.keys||[]).map(function(k){return k.column;}));

  // Build visible edge list (skip dismissed)
  var edges=[];
  (DD.model.relationships||[]).forEach(function(r){
    if(_xGetDec(r.id)==='dismiss') return;
    if(nodeMap[r.from]&&nodeMap[r.to]) edges.push({from:r.from,to:r.to,type:'fk',conf:r.confidence,id:r.id});
  });
  (DD.model.dependencies||[]).forEach(function(d){
    if(_xGetDec(d.id)==='dismiss') return;
    if(nodeMap[d.from]&&nodeMap[d.to]) edges.push({from:d.from,to:d.to,type:'dep',conf:d.confidence,id:d.id});
  });

  _xForceLayout(nodes,edges,W,H,140);

  var esc=_xEsc;
  var colors={fk:'#4cd7f6',dep:'#a78bfa'};
  var parts=['<defs>'
    +'<marker id="xra-fk" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L0,6 L8,3 z" fill="#4cd7f6"/></marker>'
    +'<marker id="xra-dep" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L0,6 L8,3 z" fill="#a78bfa"/></marker>'
    +'</defs>'];

  // Edges (drawn before nodes)
  edges.forEach(function(e){
    var na=nodeMap[e.from],nb=nodeMap[e.to]; if(!na||!nb) return;
    var col=colors[e.type];
    var dash=e.conf<0.95?'stroke-dasharray="6 3"':'';
    var dx=nb.x-na.x,dy=nb.y-na.y,d=Math.sqrt(dx*dx+dy*dy)||1;
    var r1=_xNR(na,keySet,_xSelNode),r2=_xNR(nb,keySet,_xSelNode)+9;
    var x1=na.x+(dx/d)*r1,y1=na.y+(dy/d)*r1;
    var x2=nb.x-(dx/d)*r2,y2=nb.y-(dy/d)*r2;
    parts.push('<line class="xr-graph-edge" x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2
      +'" stroke="'+col+'" stroke-width="1.6" opacity="'+Math.max(0.38,e.conf)+'" '+dash
      +' marker-end="url(#xra-'+e.type+')" onclick="_xEdgeClick(\''+e.id+'\')" cursor="pointer"/>');
    parts.push('<text x="'+((x1+x2)/2)+'" y="'+((y1+y2)/2-5)+'" font-size="9" text-anchor="middle" fill="'+col+'" opacity="0.7" pointer-events="none">'+Math.round(e.conf*100)+'%</text>');
  });

  // Nodes
  nodes.forEach(function(n){
    var c=n.col,isKey=keySet.has(n.id),isSel=(_xSelNode===n.id);
    var r=_xNR(n,keySet,_xSelNode);
    var fill=isSel?'rgba(221,184,255,.42)':(isKey?'rgba(221,184,255,.18)':'rgba(22,17,27,.82)');
    var stroke=isSel?'#ddb8ff':(isKey?'rgba(221,184,255,.72)':'rgba(221,184,255,.25)');
    var sw=isKey||isSel?2:1.5;
    var icons={id:'🔑',currency:'₹',percent:'%',email:'@',phone:'☎',date:'📅',code:'{}',number:'#',categorical:'≡',boolean:'⊤',text:'T'};
    var icon=icons[c.semantic||c.type]||'◉';
    var lbl=n.id.length>13?n.id.slice(0,11)+'…':n.id;
    parts.push('<g onclick="_xNodeClick(\''+n.id.replace(/\\/g,'\\\\').replace(/'/g,"\\'")+'\')" style="cursor:pointer">');
    if(isKey) parts.push('<circle cx="'+n.x+'" cy="'+n.y+'" r="'+(r+6)+'" fill="none" stroke="rgba(221,184,255,.1)" stroke-width="1.5"/>');
    parts.push('<circle cx="'+n.x+'" cy="'+n.y+'" r="'+r+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+sw+'"/>');
    parts.push('<text x="'+n.x+'" y="'+(n.y+4.5)+'" font-size="12" text-anchor="middle" fill="'+(isSel?'#ddb8ff':'#eadfed')+'" pointer-events="none">'+icon+'</text>');
    parts.push('<text x="'+n.x+'" y="'+(n.y+r+12)+'" font-size="9" text-anchor="middle" fill="rgba(234,223,237,.65)" pointer-events="none">'+esc(lbl)+'</text>');
    parts.push('</g>');
  });

  svg.innerHTML=parts.join('');
}

function _xNR(n,keySet,selNode){
  return (keySet&&keySet.has(n.id))?26:(selNode===n.id?28:22);
}

// ── Force layout (naive spring+repulsion, N^2) ───────────────────────────
function _xForceLayout(nodes,edges,W,H,iters){
  var n=nodes.length; if(n<2) return;
  var k=Math.sqrt((W*H)/n)*0.7;
  var links=edges.map(function(e){
    return{a:nodes.findIndex(function(x){return x.id===e.from;}),
           b:nodes.findIndex(function(x){return x.id===e.to;})};
  }).filter(function(l){return l.a>=0&&l.b>=0;});
  var pad=54;
  for(var iter=0;iter<iters;iter++){
    var dt=Math.max(0.15,2*(1-iter/iters));
    for(var i=0;i<n;i++){nodes[i].vx=0;nodes[i].vy=0;}
    for(var i=0;i<n;i++){
      for(var j=i+1;j<n;j++){
        var dx=nodes[i].x-nodes[j].x||0.1,dy=nodes[i].y-nodes[j].y||0.1;
        var d=Math.sqrt(dx*dx+dy*dy+1),f=k*k/d;
        var fx=(dx/d)*f,fy=(dy/d)*f;
        nodes[i].vx+=fx;nodes[i].vy+=fy;nodes[j].vx-=fx;nodes[j].vy-=fy;
      }
    }
    links.forEach(function(l){
      if(l.a<0||l.b<0) return;
      var dx=nodes[l.b].x-nodes[l.a].x,dy=nodes[l.b].y-nodes[l.a].y;
      var d=Math.sqrt(dx*dx+dy*dy)+0.01,f=(d-k)*0.5/d;
      nodes[l.a].vx+=dx*f;nodes[l.a].vy+=dy*f;nodes[l.b].vx-=dx*f;nodes[l.b].vy-=dy*f;
    });
    for(var i=0;i<n;i++){
      nodes[i].vx+=(W/2-nodes[i].x)*0.015;nodes[i].vy+=(H/2-nodes[i].y)*0.015;
      nodes[i].x=Math.max(pad,Math.min(W-pad,nodes[i].x+nodes[i].vx*dt));
      nodes[i].y=Math.max(pad,Math.min(H-pad,nodes[i].y+nodes[i].vy*dt));
    }
  }
}

// ── Node / edge click handlers ────────────────────────────────────────────
function _xNodeClick(nodeId){
  _xSelNode=(_xSelNode===nodeId)?null:nodeId;
  _xRenderGraph();
  var det=document.getElementById('dd-xray-detail');
  var isHi=(typeof uiLanguage!=='undefined'&&uiLanguage==='hi');
  if(!_xSelNode){
    if(det) det.innerHTML='<div class="xr-detail-empty">'+(isHi?'नोड पर क्लिक करें — विवरण यहाँ दिखेगा।':'Click a node or edge for details.')+'</div>';
    return;
  }
  _xShowNodeDetail(_xSelNode);
}

function _xEdgeClick(edgeId){
  var rel=(DD.model.relationships||[]).find(function(r){return r.id===edgeId;});
  var dep=(DD.model.dependencies||[]).find(function(d){return d.id===edgeId;});
  var item=rel||dep; if(!item) return;
  var isHi=(typeof uiLanguage!=='undefined'&&uiLanguage==='hi');
  var esc=_xEsc;
  var isFk=!!rel,dec=_xGetDec(item.id);
  var desc=isFk
    ?(isHi?'<b>'+esc(item.from)+'</b> का '+Math.round(item.confidence*100)+'% डेटा <b>'+esc(item.to)+'</b> में भी मिलता है — संभावित FK लिंक।'
          :'<b>'+esc(item.from)+'</b> values appear in <b>'+esc(item.to)+'</b> at '+Math.round(item.confidence*100)+'% — likely foreign-key link.')
    :(isHi?'<b>'+esc(item.from)+'</b> के हर मान पर <b>'+esc(item.to)+'</b> लगभग स्थिर रहता है ('+Math.round(item.confidence*100)+'% ग्रुप्स में)।'
          :'For each value of <b>'+esc(item.from)+'</b>, <b>'+esc(item.to)+'</b> is nearly constant across '+Math.round(item.confidence*100)+'% of groups.');
  var el=document.getElementById('dd-xray-detail'); if(!el) return;
  el.innerHTML='<div class="xr-detail-title">'+(isFk?(isHi?'संबंध':'Relationship'):(isHi?'कार्यात्मक निर्भरता':'Functional Dependency'))+'</div>'
    +'<div class="xr-detail-row">'+desc+'</div>'
    +(dec?'<div class="xr-dec">'+(dec==='confirm'?'✓ '+(isHi?'पुष्ट':'Confirmed'):'✗ '+(isHi?'अनदेखा':'Dismissed'))+'</div>'
         :'<div class="xr-btns" style="margin-top:7px">'
          +'<button type="button" class="xr-btn-confirm" onclick="_ddXrayConfirm(\''+item.id+'\')">✓ '+(isHi?'पुष्ट':'Confirm')+'</button>'
          +'<button type="button" class="xr-btn-dismiss" onclick="_ddXrayDismiss(\''+item.id+'\')">✗ '+(isHi?'अनदेखा':'Dismiss')+'</button>'
          +'</div>');
}

function _xShowNodeDetail(nodeId){
  var col=DD.model.columns.find(function(c){return c.key===nodeId;}); if(!col) return;
  var isHi=(typeof uiLanguage!=='undefined'&&uiLanguage==='hi');
  var esc=(typeof escHtml==='function')?escHtml:_xEsc;
  var isKey=(DD.model.keys||[]).some(function(k){return k.column===nodeId;});
  var rels=(DD.model.relationships||[]).filter(function(r){return r.from===nodeId||r.to===nodeId;});
  var deps=(DD.model.dependencies||[]).filter(function(d){return d.from===nodeId||d.to===nodeId;});
  var el=document.getElementById('dd-xray-detail'); if(!el) return;
  var html='<div class="xr-detail-title">'+esc(col.key)+(isKey?' <span class="xr-badge xr-badge-key">KEY</span>':'')+'</div>'
    +'<div class="xr-detail-row"><b>'+(isHi?'प्रकार':'Type')+':</b> '+col.type+' / '+(col.semantic||col.type)
    +' &nbsp;·&nbsp; <b>'+(isHi?'अलग':'Distinct')+':</b> '+col.distinct
    +' &nbsp;·&nbsp; <b>'+(isHi?'रिक्त':'Null')+':</b> '+(col.nullRate*100).toFixed(1)+'%</div>';
  if(col.min!==null) html+='<div class="xr-detail-row"><b>Min / Max:</b> '+col.min+' – '+col.max+'</div>';
  if(col.sample&&col.sample.length) html+='<div class="xr-detail-row"><b>'+(isHi?'उदाहरण':'Sample')+':</b> '+col.sample.slice(0,5).map(function(v){return esc(String(v));}).join(', ')+'</div>';
  if(rels.length) html+='<div class="xr-detail-row"><b>'+(isHi?'FK लिंक':'FK links')+':</b> '+rels.map(function(r){return esc(r.from)+' → '+esc(r.to)+' ('+Math.round(r.confidence*100)+'%)';}).join('; ')+'</div>';
  if(deps.length) html+='<div class="xr-detail-row"><b>'+(isHi?'निर्भरता':'Deps')+':</b> '+deps.map(function(d){return esc(d.from)+' → '+esc(d.to)+' ('+Math.round(d.confidence*100)+'%)';}).join('; ')+'</div>';
  if(isKey) html+='<div class="xr-detail-note">'+(isHi?'✓ संभावित अनन्य पहचानकर्ता (Unique ID)':'✓ Likely unique identifier — candidate primary key')+'</div>';
  el.innerHTML=html;
}
