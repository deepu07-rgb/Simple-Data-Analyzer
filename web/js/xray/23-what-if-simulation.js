// ═══════════════════════════════════════════════════════════════════════
//  BATCH 16 — Live What-If Simulation / क्या-अगर सिमुलेशन
// ═══════════════════════════════════════════════════════════════════════
(function(){window.DD=window.DD||{};DD.sim=DD.sim||{fitted:{},topoOrder:[],scenarios:[]};})();
var _wiTarget='';
var _wiDriverVals={};
var _wiSig='';
// Gaussian elimination for OLS normal equations
function _wiGauss(A,b){
  var n=b.length;
  var M=A.map(function(r,i){return r.slice().concat([b[i]]);});
  for(var col=0;col<n;col++){
    var mx=col;
    for(var r=col+1;r<n;r++) if(Math.abs(M[r][col])>Math.abs(M[mx][col])) mx=r;
    var t=M[col];M[col]=M[mx];M[mx]=t;
    if(Math.abs(M[col][col])<1e-12) return null;
    for(var r2=col+1;r2<n;r2++){var f=M[r2][col]/M[col][col];for(var c=col;c<=n;c++) M[r2][c]-=f*M[col][c];}
  }
  var x=new Array(n);
  for(var i=n-1;i>=0;i--){x[i]=M[i][n];for(var j=i+1;j<n;j++) x[i]-=M[i][j]*x[j];x[i]/=M[i][i];}
  return x;
}
// OLS linear regression: y = b0 + b1*x1 + ... (multiple drivers, up to 5)
function _wiLinReg(driverKeys,targetKey){
  var rows=(typeof rawData!=='undefined')?rawData:[];
  var hdrs=(typeof headers!=='undefined')?headers:[];
  var dIdx=driverKeys.map(function(k){return hdrs.indexOf(k);});
  var tIdx=hdrs.indexOf(targetKey);
  if(dIdx.some(function(i){return i<0;})||tIdx<0) return null;
  var SAMPLE=Math.min(rows.length,20000),p=driverKeys.length,data=[];
  for(var ri=0;ri<SAMPLE;ri++){
    var xs=dIdx.map(function(xi){return parseFloat(rows[ri][xi]);});
    var y=parseFloat(rows[ri][tIdx]);
    if(xs.some(isNaN)||isNaN(y)) continue;
    data.push({xs:xs,y:y});
  }
  var n=data.length;if(n<p+2) return null;
  var XtX=[],Xty=new Array(p+1).fill(0);
  for(var i=0;i<=p;i++) XtX.push(new Array(p+1).fill(0));
  data.forEach(function(d){
    var x=[1].concat(d.xs);
    for(var i=0;i<=p;i++){Xty[i]+=x[i]*d.y;for(var j=0;j<=p;j++) XtX[i][j]+=x[i]*x[j];}
  });
  var beta=_wiGauss(XtX,Xty);if(!beta) return null;
  var yBar=data.reduce(function(s,d){return s+d.y;},0)/n;
  var SStot=data.reduce(function(s,d){return s+Math.pow(d.y-yBar,2);},0);
  var SSres=data.reduce(function(s,d){
    var x=[1].concat(d.xs);
    var yh=beta.reduce(function(sm,b,i){return sm+b*x[i];},0);
    return s+Math.pow(d.y-yh,2);
  },0);
  var r2=SStot>0?Math.max(0,Math.min(1,1-SSres/SStot)):0;
  var residStd=Math.sqrt(SSres/Math.max(1,n-p-1));
  return{type:'linear',drivers:driverKeys,coeffs:beta,r2:r2,residualStd:residStd,n:n,yMean:yBar};
}
// Exact arithmetic: C=k*A, C=k*(A*B), C=A+B+offset
function _wiFitExact(driverKeys,targetKey){
  var rows=(typeof rawData!=='undefined')?rawData:[];
  var hdrs=(typeof headers!=='undefined')?headers:[];
  var dIdx=driverKeys.map(function(k){return hdrs.indexOf(k);});
  var tIdx=hdrs.indexOf(targetKey);
  if(dIdx.some(function(i){return i<0;})||tIdx<0) return null;
  var SAMPLE=Math.min(rows.length,10000),TOL=0.01,MIN=10,tr=[];
  for(var ri=0;ri<SAMPLE;ri++){
    var ds=dIdx.map(function(xi){return parseFloat(rows[ri][xi]);});
    var t=parseFloat(rows[ri][tIdx]);
    if(ds.some(isNaN)||isNaN(t)) continue;
    tr.push({ds:ds,t:t});
  }
  if(tr.length<MIN) return null;
  // Single driver: C = k * A
  if(driverKeys.length===1){
    var nz=tr.filter(function(r){return Math.abs(r.ds[0])>1e-9;});
    if(nz.length>=MIN){
      var kv=nz.map(function(r){return r.t/r.ds[0];});
      var km=kv.reduce(function(s,v){return s+v;},0)/kv.length;
      if(tr.every(function(r){return Math.abs(r.t-km*r.ds[0])/(Math.abs(r.t)+1e-9)<=TOL;}))
        return{type:'exact',op:'scale',drivers:driverKeys,coeffs:[km]};
    }
  }
  // Two drivers: C = k*(A*B) or C = A+B+offset
  if(driverKeys.length===2){
    var prod=tr.filter(function(r){return Math.abs(r.ds[0]*r.ds[1])>1e-9;});
    if(prod.length>=MIN){
      var kv2=prod.map(function(r){return r.t/(r.ds[0]*r.ds[1]);});
      var km2=kv2.reduce(function(s,v){return s+v;},0)/kv2.length;
      if(tr.every(function(r){return Math.abs(r.t-km2*r.ds[0]*r.ds[1])/(Math.abs(r.t)+1e-9)<=TOL;}))
        return{type:'exact',op:'multiply',drivers:driverKeys,coeffs:[km2]};
    }
    var offs=tr.map(function(r){return r.t-r.ds[0]-r.ds[1];});
    var om=offs.reduce(function(s,v){return s+v;},0)/offs.length;
    if(tr.every(function(r){return Math.abs(r.t-r.ds[0]-r.ds[1]-om)/(Math.abs(r.t)+1e-9)<=TOL;}))
      return{type:'exact',op:'add',drivers:driverKeys,coeffs:[om]};
  }
  return null;
}
// Kahn's topological sort
function _wiTopo(deps){
  var inDeg={},adj={},nodes=new Set();
  deps.forEach(function(d){
    nodes.add(d.from);nodes.add(d.to);
    if(!adj[d.from]) adj[d.from]=[];
    adj[d.from].push(d.to);
    inDeg[d.to]=(inDeg[d.to]||0)+1;
  });
  var q=[],order=[];
  nodes.forEach(function(n){if(!(inDeg[n]>0)) q.push(n);});
  while(q.length){var cur=q.shift();order.push(cur);(adj[cur]||[]).forEach(function(nb){inDeg[nb]--;if(inDeg[nb]<=0) q.push(nb);});}
  return order;
}
// Pearson correlation
function _wiPearson(aKey,bKey){
  var rows=(typeof rawData!=='undefined')?rawData:[];
  var hdrs=(typeof headers!=='undefined')?headers:[];
  var ai=hdrs.indexOf(aKey),bi=hdrs.indexOf(bKey);
  if(ai<0||bi<0) return 0;
  var SAMPLE=Math.min(rows.length,5000),av=[],bv=[];
  for(var ri=0;ri<SAMPLE;ri++){var a=parseFloat(rows[ri][ai]),b=parseFloat(rows[ri][bi]);if(!isNaN(a)&&!isNaN(b)){av.push(a);bv.push(b);}}
  var n=av.length;if(n<5) return 0;
  var ab=av.reduce(function(s,v){return s+v;},0)/n,bb=bv.reduce(function(s,v){return s+v;},0)/n;
  var num=0,da=0,db2=0;
  for(var i=0;i<n;i++){num+=(av[i]-ab)*(bv[i]-bb);da+=Math.pow(av[i]-ab,2);db2+=Math.pow(bv[i]-bb,2);}
  var denom=Math.sqrt(da*db2);
  return denom>0?num/denom:0;
}
// Format number nicely
function _wiNum(v){
  if(v==null||!isFinite(v)||isNaN(v)) return '—';
  var abs=Math.abs(v);
  if(abs>=1e9) return (v/1e9).toFixed(2)+'B';
  if(abs>=1e6) return (v/1e6).toFixed(2)+'M';
  if(abs>=1000) return v.toLocaleString(undefined,{maximumFractionDigits:1});
  if(abs<10) return v.toFixed(2);
  return v.toLocaleString(undefined,{maximumFractionDigits:1});
}
// Formula display label
function _wiFormLabel(m,target){
  if(m.type==='exact'){
    if(m.op==='scale') return target+' = '+m.coeffs[0].toFixed(4)+' \xd7 '+m.drivers[0];
    if(m.op==='multiply') return target+' ≈ '+m.coeffs[0].toFixed(4)+' \xd7 '+m.drivers[0]+' \xd7 '+m.drivers[1];
    var off=m.coeffs[0];
    return target+' = '+m.drivers[0]+' + '+m.drivers[1]+(Math.abs(off)>0.01?(off>0?' + '+off.toFixed(2):' − '+Math.abs(off).toFixed(2)):'');
  }
  if(m.type==='linear'){
    var parts=m.drivers.map(function(k,i){var b=m.coeffs[i+1];return(b>=0?'+ ':'− ')+Math.abs(b).toFixed(3)+'\xd7'+k;});
    return target+' ≈ '+m.coeffs[0].toFixed(2)+' '+parts.join(' ');
  }
  return '';
}
// Fit all models from DD.model.dependencies
function _wiInit(){
  if(!window.DD||!DD.model||!DD.model.dependencies||!DD.model.columns) return;
  var sig=DD.model.dependencies.length+'|'+DD.model.columns.length;
  if(sig===_wiSig&&Object.keys(DD.sim.fitted).length>0) return;
  _wiSig=sig;
  var cols=DD.model.columns;
  var numCols=new Set(cols.filter(function(c){return c.type==='number'||c.semantic==='currency';}).map(function(c){return c.key;}));
  var tdMap={};
  DD.model.dependencies.forEach(function(dep){
    if(!numCols.has(dep.from)||!numCols.has(dep.to)) return;
    var dec=(DD.model.confirmed||[]).find(function(c){return c.id===dep.id;});
    if(dec&&dec.decision==='dismiss') return;
    if(!tdMap[dep.to]) tdMap[dep.to]=[];
    if(!tdMap[dep.to].includes(dep.from)) tdMap[dep.to].push(dep.from);
  });
  DD.sim.fitted={};
  Object.keys(tdMap).forEach(function(target){
    var drivers=tdMap[target];
    var model=_wiFitExact(drivers,target)||_wiLinReg(drivers,target);
    if(model){model.formula=_wiFormLabel(model,target);DD.sim.fitted[target]=model;}
  });
  DD.sim.topoOrder=_wiTopo(DD.model.dependencies.filter(function(d){return numCols.has(d.from)&&numCols.has(d.to);}));
  _wiPopulateSelect();
  _wiPersist();
}
// Populate target dropdown
function _wiPopulateSelect(){
  var sel=document.getElementById('dd-wi-target');if(!sel) return;
  var isHi=(typeof uiLanguage!=='undefined'&&uiLanguage==='hi');
  sel.innerHTML='<option value="">— '+(isHi?'लक्ष्य चुनें':'Select target')+' —</option>';
  Object.keys(DD.sim.fitted).forEach(function(key){
    var opt=document.createElement('option');opt.value=key;opt.textContent=key;sel.appendChild(opt);
  });
  if(_wiTarget&&DD.sim.fitted[_wiTarget]) sel.value=_wiTarget;
}
// Select target: render sliders
function _wiSelectTarget(v){
  _wiTarget=v;
  var driversDiv=document.getElementById('dd-wi-drivers'),contentDiv=document.getElementById('dd-wi-content');
  if(!driversDiv||!contentDiv) return;
  var isHi=(typeof uiLanguage!=='undefined'&&uiLanguage==='hi');
  if(!v||!DD.sim||!DD.sim.fitted[v]){
    driversDiv.innerHTML='';
    contentDiv.innerHTML='<div class="wi-nodata">'+(isHi?'लक्ष्य मीट्रिक चुनें।':'Select a target metric to begin simulation.')+'</div>';
    return;
  }
  var model=DD.sim.fitted[v];
  model.drivers.forEach(function(col){
    if(_wiDriverVals[col]===undefined){
      var cm=(DD.model.columns||[]).find(function(c){return c.key===col;});
      var mn=(cm&&cm.min!=null)?cm.min:0,mx=(cm&&cm.max!=null)?cm.max:100;
      _wiDriverVals[col]=(mn+mx)/2;
    }
  });
  _wiRenderSliders(model);
  _wiSimRun();
}
// Render driver sliders
function _wiRenderSliders(model){
  var driversDiv=document.getElementById('dd-wi-drivers');if(!driversDiv) return;
  var isHi=(typeof uiLanguage!=='undefined'&&uiLanguage==='hi');
  var html='<div class="wi-drivers-label">'+(isHi?'चालक':'Drivers')+'</div>';
  model.drivers.forEach(function(col){
    var cm=(DD.model.columns||[]).find(function(c){return c.key===col;});
    var mn=(cm&&cm.min!=null)?cm.min:0,mx=(cm&&cm.max!=null)?cm.max:100;
    var rng=Math.max(mx-mn,1);
    var lo=(mn>=0)?Math.max(0,mn-rng*0.05):mn-rng*0.05;
    var hi=mx+rng*0.05;
    var cur=(_wiDriverVals[col]!=null)?_wiDriverVals[col]:(mn+mx)/2;
    var pct=(hi>lo)?Math.max(0,Math.min(100,((cur-lo)/(hi-lo))*100)).toFixed(1)+'%':'50%';
    var step=(rng>10000?100:rng>1000?10:rng>100?1:rng>10?0.5:0.1);
    var sid='wisldr-'+col.replace(/[^a-z0-9]/gi,'_');
    var svid='wisv-'+col.replace(/[^a-z0-9]/gi,'_');
    var escCol=col.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    html+='<div class="wi-driver-block">'
      +'<div class="wi-driver-name">'+_xEsc(col)+'</div>'
      +'<div class="wi-slider-row">'
        +'<input type="range" class="wi-slider" id="'+sid+'" min="'+lo+'" max="'+hi+'" step="'+step+'" value="'+cur+'" style="--pct:'+pct+'" oninput="_wiOnSlider(this,\''+escCol+'\')" />'
        +'<span class="wi-slider-val" id="'+svid+'">'+_wiNum(cur)+'</span>'
      +'</div>'
      +'<div class="wi-slider-range"><span>'+_wiNum(lo)+'</span><span>'+_wiNum(hi)+'</span></div>'
      +'</div>';
  });
  driversDiv.innerHTML=html;
}
// Slider input handler
function _wiOnSlider(el,col){
  var val=parseFloat(el.value);
  _wiDriverVals[col]=val;
  var lo=parseFloat(el.min),hi=parseFloat(el.max);
  var pct=(hi>lo)?((val-lo)/(hi-lo)*100).toFixed(1)+'%':'50%';
  el.style.setProperty('--pct',pct);
  var sv=document.getElementById('wisv-'+col.replace(/[^a-z0-9]/gi,'_'));
  if(sv) sv.textContent=_wiNum(val);
  _wiSimRun();
}
// Compute value for one model given a value map
function _wiCompute(m,dvMap){
  var dVals=m.drivers.map(function(k){return dvMap[k];});
  if(dVals.some(function(v){return v==null||isNaN(v);})) return null;
  if(m.type==='exact'){
    if(m.op==='scale') return m.coeffs[0]*dVals[0];
    if(m.op==='multiply') return m.coeffs[0]*dVals[0]*dVals[1];
    if(m.op==='add') return dVals[0]+dVals[1]+m.coeffs[0];
  }
  if(m.type==='linear'&&m.r2>=0.5){
    var xs=[1].concat(dVals);
    return m.coeffs.reduce(function(s,b,i){return s+b*xs[i];},0);
  }
  return null;
}
// Full simulation + ripple propagation
function _wiSimRun(){
  var target=_wiTarget;if(!target||!window.DD||!DD.sim) return;
  var model=DD.sim.fitted[target];if(!model) return;
  var isHi=(typeof uiLanguage!=='undefined'&&uiLanguage==='hi');
  var dvMap=Object.assign({},_wiDriverVals);
  var rippleChain=[];
  // Pre-target ripple (dependencies of drivers)
  (DD.sim.topoOrder||[]).forEach(function(col){
    if(col===target||!DD.sim.fitted[col]||dvMap[col]!==undefined) return;
    var v=_wiCompute(DD.sim.fitted[col],dvMap);
    if(v!==null){dvMap[col]=v;rippleChain.push({key:col,val:v});}
  });
  // Primary result
  var dVals=model.drivers.map(function(k){return dvMap[k];});
  var missingDrv=dVals.some(function(v){return v==null||isNaN(v);});
  var simResult;
  if(missingDrv){
    simResult={type:'missing'};
  } else if(model.type==='exact'){
    var val=_wiCompute(model,dvMap);
    if(val!==null) dvMap[target]=val;
    simResult={type:'exact',value:val,band:0,r2:1};
  } else if(model.type==='linear'){
    if(model.r2<0.5){
      simResult={type:'weak',r2:model.r2};
    } else {
      var xs=[1].concat(dVals);
      var val=model.coeffs.reduce(function(s,b,i){return s+b*xs[i];},0);
      dvMap[target]=val;
      simResult={type:'linear',value:val,band:1.96*model.residualStd,r2:model.r2};
    }
  } else {
    simResult={type:'none'};
  }
  // Post-target ripple (downstream dependents)
  (DD.sim.topoOrder||[]).forEach(function(col){
    if(!DD.sim.fitted[col]||dvMap[col]!==undefined) return;
    var v=_wiCompute(DD.sim.fitted[col],dvMap);
    if(v!==null){dvMap[col]=v;rippleChain.push({key:col,val:v});}
  });
  // Associated drivers (Pearson correlation with target)
  var numericCols=(DD.model.columns||[]).filter(function(c){return c.type==='number'||c.semantic==='currency';});
  var corrs=numericCols
    .filter(function(c){return c.key!==target&&!model.drivers.includes(c.key);})
    .map(function(c){return{key:c.key,r:_wiPearson(c.key,target)};})
    .filter(function(c){return Math.abs(c.r)>0.15;})
    .sort(function(a,b){return Math.abs(b.r)-Math.abs(a.r);})
    .slice(0,5);
  _wiRenderResult(target,model,simResult,rippleChain,corrs,isHi,dvMap);
}
// Render result card + ripple chain + associated drivers
function _wiRenderResult(target,model,simResult,rippleChain,corrs,isHi,dvMap){
  var el=document.getElementById('dd-wi-content');if(!el) return;
  var html='';
  if(simResult.type==='missing'){
    html='<div class="wi-weak-msg">'+(isHi?'चालक मान उपलब्ध नहीं — स्लाइडर सेट करें।':'Driver value not available — adjust the sliders.')+'</div>';
  } else if(simResult.type==='weak'){
    html='<div class="wi-weak-msg">'
      +(isHi?'यह पैटर्न पूर्वानुमान के लिए पर्याप्त भरोसेमंद नहीं (R² = '+simResult.r2.toFixed(2)+').<br>'
             :'Pattern not reliable enough to project (R² = '+simResult.r2.toFixed(2)+').<br>')
      +'Not a reliable pattern / भरोसेमंद पैटर्न नहीं।</div>';
  } else if(simResult.type==='exact'||simResult.type==='linear'){
    var r2lbl=simResult.type==='exact'
      ?'Exact formula / सटीक सूत्र'
      :(simResult.r2>=0.7?'R² = '+simResult.r2.toFixed(2)+' (strong / मज़बूत)':
        simResult.r2>=0.5?'R² = '+simResult.r2.toFixed(2)+' (moderate / मध्यम)':
        'R² = '+simResult.r2.toFixed(2));
    var r2cls=simResult.type==='exact'?'wi-exact-badge':
      (simResult.r2>=0.7?'wi-r2-strong':simResult.r2>=0.5?'wi-r2-moderate':'wi-r2-weak');
    html='<div class="wi-result-card">'
      +'<div class="wi-result-label">'+(isHi?'अनुमानित ':'Projected ')+_xEsc(target)+'</div>'
      +'<div class="wi-result-value">'+_wiNum(simResult.value)+'</div>'
      +(simResult.band>0?'<div class="wi-result-band">±'+_wiNum(simResult.band)+' ('+(isHi?'95% अनुमान':'95% prediction interval')+')</div>':'')
      +'<div class="wi-result-badges"><span class="wi-r2-badge '+r2cls+'">'+r2lbl+'</span></div>'
      +(model.formula?'<div class="wi-result-formula">'+_xEsc(model.formula)+'</div>':'')
      +'<div class="wi-result-disclaimer">'
        +(isHi?'पिछले पैटर्न पर आधारित अनुमान — गारंटी नहीं / Estimate based on past patterns — not a guarantee':'Estimate based on past patterns — not a guarantee / पिछले पैटर्न पर आधारित अनुमान')
        +'</div>'
      +'</div>';
  }
  // Ripple chain (exclude target itself)
  var rippleFilt=rippleChain.filter(function(r){return r.key!==target;});
  if((simResult.type==='exact'||simResult.type==='linear')&&(rippleFilt.length||model.drivers.length)){
    html+='<div class="wi-section"><div class="wi-section-title">'+(isHi?'प्रभाव शृंखला':'Ripple Chain')+'</div>'
      +'<div class="wi-ripple-row">';
    model.drivers.forEach(function(col,i){
      if(i>0) html+='<span class="wi-ripple-arr">+</span>';
      html+='<div class="wi-ripple-node"><div class="wi-ripple-key">'+_xEsc(col)+'</div><div class="wi-ripple-val">'+_wiNum(dvMap[col])+'</div></div>';
    });
    html+='<span class="wi-ripple-arr">→</span>'
      +'<div class="wi-ripple-node"><div class="wi-ripple-key">'+_xEsc(target)+'</div><div class="wi-ripple-val">'+(simResult.value!=null?_wiNum(simResult.value):'?')+'</div></div>';
    rippleFilt.forEach(function(r){
      html+='<span class="wi-ripple-arr">→</span>'
        +'<div class="wi-ripple-node"><div class="wi-ripple-key">'+_xEsc(r.key)+'</div><div class="wi-ripple-val">'+_wiNum(r.val)+'</div></div>';
    });
    html+='</div></div>';
  }
  // Associated drivers (correlation)
  if(corrs.length){
    var maxR=Math.abs(corrs[0].r)||1;
    html+='<div class="wi-section"><div class="wi-section-title">'+(isHi?'संबंधित चालक':'Associated Drivers')+'</div>';
    corrs.forEach(function(c){
      var pct=(Math.abs(c.r)/maxR*100).toFixed(0);
      html+='<div class="wi-corr-row">'
        +'<div class="wi-corr-name" title="'+_xEsc(c.key)+'">'+(c.key.length>13?_xEsc(c.key.slice(0,12))+'…':_xEsc(c.key))+'</div>'
        +'<div class="wi-corr-bar-bg"><div class="wi-corr-bar" style="width:'+pct+'%"></div></div>'
        +'<div class="wi-corr-r">r='+c.r.toFixed(2)+'</div>'
        +'</div>';
    });
    html+='<div class="wi-corr-note">⚠ '+(isHi?'संबंध है, कारण का प्रमाण नहीं / association, not proof of cause':'association, not proof of cause / संबंध, कारण का प्रमाण नहीं')+'</div>'
      +'</div>';
  }
  if(!html) html='<div class="wi-nodata">'+(isHi?'कोई परिणाम नहीं।':'No result. Adjust the sliders to begin.')+'</div>';
  el.innerHTML=html;
}
// Reset sliders to midpoint of data range
function _wiReset(){
  var model=DD.sim&&DD.sim.fitted&&DD.sim.fitted[_wiTarget];if(!model) return;
  model.drivers.forEach(function(col){
    var cm=(DD.model.columns||[]).find(function(c){return c.key===col;});
    var mn=(cm&&cm.min!=null)?cm.min:0,mx=(cm&&cm.max!=null)?cm.max:100;
    _wiDriverVals[col]=(mn+mx)/2;
  });
  _wiRenderSliders(model);_wiSimRun();
}
// Save current scenario
function _wiSaveScenario(){
  var isHi=(typeof uiLanguage!=='undefined'&&uiLanguage==='hi');
  if(!_wiTarget||!DD.sim||!DD.sim.fitted[_wiTarget]){
    if(typeof toast==='function') toast(isHi?'पहले लक्ष्य चुनें।':'Select a target first.','info');return;
  }
  var result=_wiCompute(DD.sim.fitted[_wiTarget],_wiDriverVals);
  DD.sim.scenarios=DD.sim.scenarios||[];
  DD.sim.scenarios.unshift({id:'sc_'+Date.now(),target:_wiTarget,drivers:Object.assign({},_wiDriverVals),result:result,ts:Date.now()});
  if(DD.sim.scenarios.length>20) DD.sim.scenarios.length=20;
  _wiPersist();
  if(typeof toast==='function') toast(isHi?'परिदृश्य सहेजा गया।':'Scenario saved.','success');
}
// Persist DD.sim to localStorage
function _wiPersist(){
  try{
    var s=JSON.parse(localStorage.getItem('sda_state_v2')||'{}');
    s.ddSim={fitted:DD.sim.fitted,scenarios:DD.sim.scenarios,topoOrder:DD.sim.topoOrder};
    localStorage.setItem('sda_state_v2',JSON.stringify(s));
  }catch(e){}
}
// Restore DD.sim from localStorage
(function _wiRestore(){
  try{
    var s=JSON.parse(localStorage.getItem('sda_state_v2')||'{}');
    if(s.ddSim){window.DD=window.DD||{};DD.sim=DD.sim||{};DD.sim.fitted=s.ddSim.fitted||{};DD.sim.scenarios=s.ddSim.scenarios||[];DD.sim.topoOrder=s.ddSim.topoOrder||[];}
  }catch(e){}
})();
