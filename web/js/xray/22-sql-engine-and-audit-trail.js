// ═══════════════════════════════════════════════════════════════════════
//  BATCH 18 — Local SQL Engine (AlaSQL / JS fallback)
// ═══════════════════════════════════════════════════════════════════════
(function(){window.DD=window.DD||{};DD.sqlEngine='js';})();

function _dbUpdateBadge(){
  var b=document.getElementById('sql-engine-badge');
  if(!b)return;
  if(window.DD&&DD.sqlEngine==='alasql'){
    b.className='api-status-btn sql-active';b.textContent='💾 SQL: AlaSQL';
    b.title='AlaSQL 4.3.0 active — full-dataset SQL queries enabled';
  }else{
    b.className='api-status-btn sql-js';b.textContent='💾 SQL: JS';
    b.title='SQL engine not loaded — click to retry. Using JS fallback.';
  }
}

function _dbInit(){
  if(window.alasql){window.DD.sqlEngine='alasql';_dbUpdateBadge();_dbLoadTable();return;}
  var s=document.createElement('script');
  s.src='/static/alasql.min.js';
  s.onload=function(){
    if(window.alasql){
      window.DD.sqlEngine='alasql';
      _dbUpdateBadge();
      _dbLoadTable();
      if(typeof _ddXraySchedule==='function')_ddXraySchedule();
    }
  };
  s.onerror=function(){window.DD.sqlEngine='unavailable';_dbUpdateBadge();};
  document.head.appendChild(s);
}

function _dbRows(colIndices){
  var h=window.headers||[];
  var rd=window.rawData||[];
  var cols=colIndices?colIndices.map(function(i){return h[i];}):h;
  var rows=[];
  for(var i=0;i<rd.length;i++){
    var row={};
    for(var j=0;j<cols.length;j++){
      var ci=colIndices?colIndices[j]:j;
      var v=rd[i][ci];
      var n=parseFloat(String(v).replace(/,/g,''));
      row[cols[j]]=isNaN(n)?v:n;
    }
    rows.push(row);
  }
  return rows;
}

var _dbTableSig='';
function _dbLoadTable(){
  if(!window.alasql)return;
  var h=window.headers||[];
  var rd=window.rawData||[];
  var sig=h.join('\t')+'|'+rd.length;
  if(sig===_dbTableSig)return;
  _dbTableSig=sig;
  try{
    alasql('DROP TABLE IF EXISTS __dd');
    alasql('CREATE TABLE __dd');
    alasql.tables['__dd'].data=_dbRows();
  }catch(e){console.warn('[DB18] loadTable:',e);}
}

function _dbOnDataChange(){
  _dbTableSig='';
  if(window.alasql)_dbLoadTable();
}

window.DD=window.DD||{};
DD.sql=function(query,data){
  return new Promise(function(resolve,reject){
    if(!window.alasql){reject(new Error('AlaSQL not loaded'));return;}
    try{_dbLoadTable();resolve(alasql(query,data||[]));}
    catch(e){reject(e);}
  });
};

DD.sqlSync=function(query,data){
  if(!window.alasql)return null;
  try{_dbLoadTable();return alasql(query,data||[]);}
  catch(e){console.warn('[DB18] sqlSync:',e);return null;}
};

function _dbSqlAggregate(func,colName){
  if(!window.alasql||!colName)return null;
  _dbLoadTable();
  var fMap={SUM:'SUM',AVG:'AVG',AVERAGE:'AVG',MIN:'MIN',MAX:'MAX',COUNT:'COUNT'};
  var af=fMap[(func||'').toUpperCase()];
  if(!af)return null;
  var safe=colName.replace(/`/g,'``');
  try{
    var res=alasql('SELECT '+af+'(`'+safe+'`) AS v FROM __dd');
    if(res&&res.length&&res[0].v!==null)return Number(res[0].v);
    return null;
  }catch(e){console.warn('[DB18] aggregate:',e);return null;}
}

setTimeout(_dbInit,500);

// ═══════════════════════════════════════════════════════════════════════
//  BATCH 17 — Provenance / Audit Time-Machine
// ═══════════════════════════════════════════════════════════════════════
(function(){window.DD=window.DD||{};DD.provenance=DD.provenance||[];DD.pvVersion=DD.pvVersion||0;})();
var _pvSeq=0;
var _pvFilterActor='all';
var _pvSelectedId=null;
var _pvLastLoadSig='';

// SHA-256 (synchronous, pure JS) - used for the audit hash chain
var _PV_GENESIS='0'.repeat(64);
var _PV_SHA={K:null,H0:null};
function _pvSHA256(str){
  if(!_PV_SHA.K){
    var K=[],H=[],n=2;
    while(K.length<64){
      var pr=true;for(var d=2;d*d<=n;d++){if(n%d===0){pr=false;break;}}
      if(pr){K.push(Math.floor((Math.cbrt(n)%1)*4294967296)>>>0);if(H.length<8)H.push(Math.floor((Math.sqrt(n)%1)*4294967296)>>>0);}
      n++;
    }
    _PV_SHA.K=K;_PV_SHA.H0=H;
  }
  var KK=_PV_SHA.K,h=_PV_SHA.H0.slice();
  var bytes=new TextEncoder().encode(str),len=bytes.length;
  var total=((len+9+63)>>6)<<6,m=new Uint8Array(total);
  m.set(bytes);m[len]=0x80;
  var dv=new DataView(m.buffer);
  dv.setUint32(total-8,Math.floor(len*8/4294967296));dv.setUint32(total-4,(len*8)>>>0);
  var w=new Uint32Array(64),i;
  for(var off=0;off<total;off+=64){
    for(i=0;i<16;i++)w[i]=dv.getUint32(off+i*4);
    for(i=16;i<64;i++){
      var x=w[i-15],y=w[i-2];
      var s0=((x>>>7)|(x<<25))^((x>>>18)|(x<<14))^(x>>>3);
      var s1=((y>>>17)|(y<<15))^((y>>>19)|(y<<13))^(y>>>10);
      w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;
    }
    var a=h[0],b=h[1],c=h[2],dd=h[3],e=h[4],f=h[5],g=h[6],hh=h[7];
    for(i=0;i<64;i++){
      var S1=((e>>>6)|(e<<26))^((e>>>11)|(e<<21))^((e>>>25)|(e<<7));
      var ch=(e&f)^(~e&g);
      var t1=(hh+S1+ch+KK[i]+w[i])>>>0;
      var S0=((a>>>2)|(a<<30))^((a>>>13)|(a<<19))^((a>>>22)|(a<<10));
      var mj=(a&b)^(a&c)^(b&c);
      var t2=(S0+mj)>>>0;
      hh=g;g=f;f=e;e=(dd+t1)>>>0;dd=c;c=b;b=a;a=(t1+t2)>>>0;
    }
    h[0]=(h[0]+a)>>>0;h[1]=(h[1]+b)>>>0;h[2]=(h[2]+c)>>>0;h[3]=(h[3]+dd)>>>0;
    h[4]=(h[4]+e)>>>0;h[5]=(h[5]+f)>>>0;h[6]=(h[6]+g)>>>0;h[7]=(h[7]+hh)>>>0;
  }
  return h.map(function(v){return v.toString(16).padStart(8,'0');}).join('');
}
// Hash of one event. Old logs (8-hex-digit FNV hashes) still verify; new events use SHA-256.
function _pvHashFor(e){
  var payload=JSON.stringify({id:e.id,ts:e.ts,actor:e.actor,action:e.action,method:e.method||'',target:e.target||'',inputs:(e.inputs||[]).join(','),output:e.output||'',label:e.label||'',dataVersion:e.dataVersion,prevHash:e.prevHash});
  return (e.hash&&e.hash.length===8)?_pvFNV(payload):_pvSHA256(payload);
}
function _pvIsGenesis(h){return h==='00000000'||h===_PV_GENESIS;}

// FNV-1a 32-bit hash - legacy, kept only to verify logs written by older versions
function _pvFNV(str){
  var h=0x811c9dc5>>>0;
  for(var i=0;i<str.length;i++){h^=str.charCodeAt(i);h=(h*0x01000193)>>>0;}
  return h.toString(16).padStart(8,'0');
}

// Core append-only log function
function _pvLog(ev){
  window.DD=window.DD||{};DD.provenance=DD.provenance||[];
  var prev=DD.provenance.length?DD.provenance[DD.provenance.length-1]:null;
  var prevHash=prev?prev.hash:_PV_GENESIS;
  var id='pv_'+Date.now()+'_'+(++_pvSeq);
  var entry=Object.assign({},ev,{id:id,ts:Date.now(),dataVersion:DD.pvVersion||0,prevHash:prevHash});
  entry.hash=_pvSHA256(JSON.stringify({id:entry.id,ts:entry.ts,actor:entry.actor,action:entry.action,method:entry.method||'',target:entry.target||'',inputs:(entry.inputs||[]).join(','),output:entry.output||'',label:entry.label||'',dataVersion:entry.dataVersion,prevHash:prevHash}));
  DD.provenance.push(entry);
  // Compact if > 500 events
  if(DD.provenance.length>500) _pvCheckpoint();
  // Async persist
  setTimeout(_pvPersist,0);
  // Refresh audit view if open
  var av=document.getElementById('dd-audit-view');
  if(av&&av.style.display!=='none') setTimeout(_pvRender,0);
}

// Log data load events (called from showTable hook)
var _pvLoadSig='';
function _pvLogLoad(){
  if(typeof rawData==='undefined'||!rawData.length) return;
  var sig=(typeof headers!=='undefined'?headers.join('\t'):'')+'|'+rawData.length;
  if(sig===_pvLoadSig) return;
  _pvLoadSig=sig;
  DD.pvVersion=(DD.pvVersion||0)+1;
  _pvLog({actor:'user',action:'LOAD',method:'import',target:'dataset',inputs:[],output:'col:*',label:'Dataset loaded: '+rawData.length+' rows × '+((typeof headers!=='undefined')?headers.length:0)+' columns',labelHi:'डेटासेट लोड: '+rawData.length+' पंक्तियाँ × '+((typeof headers!=='undefined')?headers.length:0)+' कॉलम'});
}

// Checkpoint: roll oldest 250 events into a CHECKPOINT entry
function _pvCheckpoint(){
  if(!DD.provenance||DD.provenance.length<=250) return;
  var rolled=DD.provenance.splice(0,250);
  var lastRolled=rolled[rolled.length-1];
  var checkpoint={id:'pv_ckpt_'+Date.now(),ts:Date.now(),actor:'system',action:'CHECKPOINT',method:'rollup',target:'log',inputs:[],output:'checkpoint',label:'Checkpoint: '+rolled.length+' earlier events summarised',labelHi:'चेकपॉइंट: '+rolled.length+' पुरानी घटनाएं संक्षेपित',dataVersion:lastRolled.dataVersion,prevHash:lastRolled.prevHash,hash:lastRolled.hash,count:rolled.length,fromId:rolled[0].id,toId:lastRolled.id};
  DD.provenance.unshift(checkpoint);
}

// Persist to localStorage (async)
function _pvPersist(){
  try{
    var s=JSON.parse(localStorage.getItem('sda_state_v2')||'{}');
    s.ddProvenance=DD.provenance;
    localStorage.setItem('sda_state_v2',JSON.stringify(s));
  }catch(e){}
}

// Verify hash chain integrity
function _pvVerify(){
  var pv=DD.provenance||[];
  var banner=document.getElementById('pv-verify-banner');
  if(!banner) return;
  if(pv.length===0){
    banner.className='pv-verify-banner pv-verify-ok';
    banner.textContent='✓ Log is empty — nothing to verify / लॉग खाली है';
    banner.style.display='block';
    setTimeout(function(){banner.style.display='none';},4000);
    return;
  }
  var broken=-1;
  for(var i=0;i<pv.length;i++){
    var e=pv[i];
    if(e.action==='CHECKPOINT') continue; // skip checkpoint meta-events
    if(i===0?!_pvIsGenesis(e.prevHash):e.prevHash!==pv[i-1].hash){broken=i;break;}
    if(e.hash!==_pvHashFor(e)){broken=i;break;}
  }
  banner.style.display='block';
  if(broken<0){
    banner.className='pv-verify-banner pv-verify-ok';
    banner.textContent='✓ Chain intact — '+pv.length+' events verified / श्रृंखला अखंड — '+pv.length+' घटनाएं सत्यापित';
  }else{
    banner.className='pv-verify-banner pv-verify-fail';
    banner.textContent='✗ Chain broken at event #'+(broken+1)+' ('+pv[broken].id+') — possible tampering / घटना #'+(broken+1)+' पर श्रृंखला टूटी — छेड़छाड़ संभव';
  }
  setTimeout(function(){banner.style.display='none';},8000);
}

// Render the Audit view
function _pvRender(){
  var pv=DD.provenance||[];
  // Update count
  var cntEl=document.getElementById('pv-event-count');
  if(cntEl) cntEl.textContent=pv.length+' events / घटनाएं';
  // Update replay slider
  var slider=document.getElementById('pv-replay-slider');
  var idxEl=document.getElementById('pv-replay-idx');
  if(slider){slider.max=Math.max(0,pv.length-1);var cur=parseInt(slider.value)||0;if(cur>pv.length-1) slider.value=pv.length-1;}
  if(idxEl&&slider) idxEl.textContent=(pv.length?parseInt(slider.value)+1:0)+' / '+pv.length;
  _pvRenderList();
}

// Render event list
function _pvRenderList(){
  var el=document.getElementById('pv-event-list');if(!el) return;
  var pv=DD.provenance||[];
  var filtered=(_pvFilterActor==='all')?pv:pv.filter(function(e){return e.actor===_pvFilterActor;});
  if(!filtered.length){el.innerHTML='<div class="pv-detail-empty">No events yet.<br>घटनाएं अभी नहीं।</div>';return;}
  var html='';
  // Show newest first
  for(var i=filtered.length-1;i>=0;i--){
    var e=filtered[i];
    var icon=e.actor==='ai'?'🤖':e.actor==='module'?'⚙️':e.action==='CHECKPOINT'?'📦':e.action==='LOAD'?'📂':e.action==='FORMULA'?'ƒ':'✏️';
    var ts=new Date(e.ts);
    var tsStr=ts.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    var sel=(e.id===_pvSelectedId)?'pv-selected':'';
    html+='<div class="pv-event pv-'+e.actor+' '+sel+'" onclick="_pvSelectEvent(\''+e.id+'\')">'
      +'<div class="pv-ev-header">'
        +'<span class="pv-ev-icon">'+icon+'</span>'
        +'<span class="pv-ev-action">'+e.action+'</span>'
        +'<span class="pv-ev-ts">'+tsStr+'</span>'
      +'</div>'
      +'<div class="pv-ev-label">'+_xEsc(String(e.label||'').slice(0,80))+'</div>'
      +'<div class="pv-ev-hash">'+e.hash+'</div>'
      +'</div>';
  }
  el.innerHTML=html;
}

// Select event and show detail + lineage
function _pvSelectEvent(id){
  _pvSelectedId=id;
  _pvRenderList();
  _pvRenderDetail(id);
  // Sync replay slider
  var pv=DD.provenance||[];
  var idx=pv.findIndex(function(e){return e.id===id;});
  if(idx>=0){var sl=document.getElementById('pv-replay-slider');if(sl) sl.value=idx;_pvUpdateReplayIdx();}
}

function _pvUpdateReplayIdx(){
  var pv=DD.provenance||[];
  var sl=document.getElementById('pv-replay-slider'),idxEl=document.getElementById('pv-replay-idx');
  if(sl&&idxEl) idxEl.textContent=(pv.length?parseInt(sl.value)+1:0)+' / '+pv.length;
  // Also update slider gradient
  if(sl) sl.style.setProperty('--pct',pv.length>1?(parseInt(sl.value)/(pv.length-1)*100).toFixed(1)+'%':'0%');
}

// Replay slider movement
function _pvReplaySet(val){
  _pvUpdateReplayIdx();
  var pv=DD.provenance||[];
  var idx=parseInt(val);
  if(idx>=0&&idx<pv.length) _pvSelectEvent(pv[idx].id);
}

// Render detail panel for a given event id
function _pvRenderDetail(id){
  var det=document.getElementById('pv-detail');if(!det) return;
  var pv=DD.provenance||[];
  var e=pv.find(function(ev){return ev.id===id;});
  if(!e){det.innerHTML='<div class="pv-detail-empty">Event not found.</div>';return;}
  var isHi=(typeof uiLanguage!=='undefined'&&uiLanguage==='hi');
  var ts=new Date(e.ts).toLocaleString();
  var actorCls='pv-la-'+e.actor;
  var html='<div class="pv-det-card">'
    +'<div class="pv-det-label">'+(isHi?'घटना विवरण':'Event Detail')+'</div>'
    +'<div class="pv-det-row"><b>Action:</b> '+_xEsc(e.action)+(e.method?' / '+_xEsc(e.method):'')+'</div>'
    +'<div class="pv-det-row"><b>Actor:</b> <span class="pv-lineage-actor '+actorCls+'">'+e.actor+'</span></div>'
    +'<div class="pv-det-row"><b>Time:</b> '+_xEsc(ts)+'</div>'
    +'<div class="pv-det-row"><b>Target:</b> '+_xEsc(e.target||'—')+'</div>'
    +(e.inputs&&e.inputs.length?'<div class="pv-det-row"><b>Inputs:</b> '+e.inputs.map(_xEsc).join(', ')+'</div>':'')
    +'<div class="pv-det-row"><b>Output:</b> '+_xEsc(e.output||'—')+'</div>'
    +'<div class="pv-det-row"><b>Data version:</b> '+e.dataVersion+'</div>'
    +(isHi&&e.labelHi?'<div class="pv-det-row">'+_xEsc(e.labelHi)+'</div>':'<div class="pv-det-row">'+_xEsc(e.label||'')+'</div>')
    +'<div class="pv-det-hash">hash: '+e.hash+'&nbsp;&nbsp;prev: '+e.prevHash+'</div>'
    +'</div>';
  // Lineage tree: ancestors of this event's output
  html+=_pvLineageHTML(e,pv,isHi);
  det.innerHTML=html;
}

// Build lineage HTML for an event's ancestry chain
function _pvLineageHTML(rootEv,pv,isHi){
  var html='<div class="pv-lineage-tree"><div class="pv-lineage-title">'+(isHi?'वंशावली / Lineage':'Lineage Chain')+'</div>';
  // Find all ancestors: events whose output is an input of root (by column/ref match)
  var seen=new Set();
  var queue=[rootEv];
  var chain=[];
  while(queue.length&&chain.length<20){
    var cur=queue.shift();
    if(seen.has(cur.id)) continue;
    seen.add(cur.id);
    chain.push(cur);
    // Find parent events (whose output matches any of cur's inputs)
    var inputs=cur.inputs||[];
    if(inputs.length){
      pv.forEach(function(ev){
        if(!seen.has(ev.id)&&ev.id!==cur.id&&ev.ts<cur.ts){
          var outKey=ev.output||'';
          if(inputs.some(function(inp){return outKey&&(outKey===inp||inp.includes(outKey)||outKey.includes(inp));})){
            queue.push(ev);
          }
        }
      });
    }
  }
  if(chain.length<2){html+='<div class="pv-detail-empty" style="padding:10px">'+(isHi?'कोई पूर्वज नहीं — यह एक स्रोत है।':'No ancestors — this is a source event.')+'</div>';}
  else{
    chain.forEach(function(ev,i){
      var icon=ev.actor==='ai'?'🤖':ev.actor==='module'?'⚙️':ev.action==='LOAD'?'📂':ev.action==='FORMULA'?'ƒ':'✏️';
      var actCls='pv-la-'+ev.actor;
      var ts=new Date(ev.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
      if(i>0) html+='<div class="pv-lineage-connector">↑</div>';
      html+='<div class="pv-lineage-node" onclick="_pvSelectEvent(\''+ev.id+'\')">'
        +'<span style="font-size:14px">'+icon+'</span>'
        +'<div class="pv-lineage-text"><span class="pv-lineage-actor '+actCls+'">'+ev.actor+'</span> '+_xEsc(String(ev.label||ev.action).slice(0,70))+'</div>'
        +'<span class="pv-lineage-ts">'+ts+'</span>'
        +'</div>';
    });
  }
  html+='</div>';
  return html;
}

// Filter by actor
function _pvFilter(actor){
  _pvFilterActor=actor;
  ['all','user','ai','module'].forEach(function(a){
    var btn=document.getElementById('pvf-'+a);
    if(btn) btn.className='pv-filter-btn'+(a===actor?' active':'');
  });
  _pvRenderList();
}

// Export audit trail as PDF
function _pvExportPDF(){
  if(typeof window.jspdf==='undefined'||!window.jspdf.jsPDF){toast('PDF engine not available','error');return;}
  var pv=DD.provenance||[];
  if(!pv.length){toast('No events to export / कोई घटना नहीं','info');return;}
  var isHi=(typeof uiLanguage!=='undefined'&&uiLanguage==='hi');
  var jsPDF=window.jspdf.jsPDF;
  var doc=new jsPDF({orientation:'portrait',format:'a4'});
  var title='Stellura Audit Trail / ऑडिट रिकॉर्ड';
  doc.setFontSize(16);doc.setTextColor(99,102,241);doc.text(title,14,15);
  doc.setFontSize(9);doc.setTextColor(100);
  doc.text('Generated: '+new Date().toLocaleString()+' | Events: '+pv.length+' | Chain: '+(_pvSelectedId?'Event '+_pvSelectedId:'All'),14,22);
  // Events focused on selected or all
  var evList=_pvSelectedId?_pvGetChain(_pvSelectedId,pv):pv.slice(-50);
  var rows=evList.map(function(e){
    return[new Date(e.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'}),e.actor,e.action,String(e.label||'').slice(0,60),e.hash];
  });
  doc.autoTable({head:[['Time','Actor','Action','Description','Hash']],body:rows,startY:28,styles:{fontSize:7,cellPadding:1.5},headStyles:{fillColor:[99,102,241],textColor:[255,255,255],fontStyle:'bold'},columnStyles:{4:{font:'courier',fontSize:6,textColor:[150,100,200]}},margin:{top:28}});
  var finalY=doc.lastAutoTable?doc.lastAutoTable.finalY+8:120;
  var verifyOk=_pvGetVerifyStatus(pv);
  doc.setFontSize(9);doc.setTextColor(verifyOk?52:248,verifyOk?211:113,verifyOk?153:113);
  doc.text(verifyOk?'✓ Hash chain verified — log has not been tampered with':'✗ Hash chain BROKEN — log may have been tampered with',14,finalY);
  doc.setFontSize(7);doc.setTextColor(150);
  doc.text('Stellura | Offline, Tamper-Evident Provenance Log | Hash: FNV-1a 32-bit chain',14,finalY+6);
  doc.save('Stellura_Audit_'+Date.now()+'.pdf');
  toast(isHi?'ऑडिट PDF निर्यात हुई।':'Audit PDF exported.','success');
}

// Get ancestry chain for a specific event
function _pvGetChain(id,pv){
  var e=pv.find(function(ev){return ev.id===id;});if(!e) return pv.slice(-30);
  var seen=new Set(),queue=[e],chain=[];
  while(queue.length&&chain.length<30){var cur=queue.shift();if(seen.has(cur.id)) continue;seen.add(cur.id);chain.unshift(cur);var inputs=cur.inputs||[];pv.forEach(function(ev){if(!seen.has(ev.id)&&ev.ts<cur.ts){var outKey=ev.output||'';if(inputs.some(function(inp){return outKey&&(outKey===inp||inp.includes(outKey)||outKey.includes(inp));})){queue.push(ev);}}});}
  return chain;
}

// Return true if chain is intact
function _pvGetVerifyStatus(pv){
  for(var i=0;i<pv.length;i++){
    var e=pv[i];if(e.action==='CHECKPOINT') continue;
    if(i===0?!_pvIsGenesis(e.prevHash):e.prevHash!==pv[i-1].hash) return false;
    var exp=_pvHashFor(e);
    if(e.hash!==exp) return false;
  }
  return true;
}

// Clear log (with confirmation)
function _pvClear(){
  var isHi=(typeof uiLanguage!=='undefined'&&uiLanguage==='hi');
  if(!confirm(isHi?'संपूर्ण ऑडिट लॉग साफ करें? यह क्रिया अपरिवर्तनीय है।':'Clear the entire audit log? This cannot be undone.')) return;
  DD.provenance=[];DD.pvVersion=0;_pvLoadSig='';_pvSelectedId=null;
  _pvPersist();_pvRender();
  toast(isHi?'ऑडिट लॉग साफ किया गया।':'Audit log cleared.','info');
}

// Open audit view showing lineage for a specific cell (from context menu)
function _pvCtxLineage(){
  if(typeof ctxRowIdx==='undefined'||typeof ctxColIdx==='undefined') return;
  var colKey='col:'+(typeof headers!=='undefined'&&headers[ctxColIdx]?headers[ctxColIdx]:'col'+ctxColIdx);
  _pvSelectedId=null;
  // Find most recent event touching this column
  var pv=DD.provenance||[];
  for(var i=pv.length-1;i>=0;i--){
    if((pv[i].output||'').includes(colKey)||(pv[i].target||'').includes('C'+ctxColIdx)){
      _pvSelectedId=pv[i].id;break;
    }
  }
  switchDDView('audit');
  setTimeout(function(){_pvRender();if(_pvSelectedId)_pvSelectEvent(_pvSelectedId);},120);
}

