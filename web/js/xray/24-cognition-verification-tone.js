// ═══════════════════════════════════════════════════════════════════════
//  BATCH 19 — Cognition Engine (Grounded Reasoning Orchestrator)
// ═══════════════════════════════════════════════════════════════════════
(function(){window.DD=window.DD||{};DD.cognition=DD.cognition||{};})();

// ── Stop-words for keyword extraction ────────────────────────────────
var _cogStop=new Set(['a','an','the','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','shall','can','what','which','who','how','when','where','why','this','that','these','those','it','its','in','of','for','to','with','by','from','and','or','but','not','on','at','as','all','any','each','per','their','they','them','we','our','you','your','most','some','than','then']);

function _cogKeywords(text){
  return String(text||'').toLowerCase().replace(/[^a-z0-9ऀ-ॿ\s]/g,' ')
    .split(/\s+/).filter(function(t){return t.length>2&&!_cogStop.has(t);});
}

// ── Score headers against step keywords ──────────────────────────────
function _cogFindCols(stepQ){
  if(!window.headers||!headers.length)return[];
  var kws=_cogKeywords(stepQ);
  if(!kws.length)return[];
  var scored=headers.map(function(h,ci){
    var hl=h.toLowerCase();
    var score=0;
    kws.forEach(function(k){if(hl.indexOf(k)!==-1||k.indexOf(hl)!==-1)score++;});
    return{ci:ci,h:h,score:score};
  });
  return scored.filter(function(s){return s.score>0;}).sort(function(a,b){return b.score-a.score;}).slice(0,5);
}

// ── Column statistics ─────────────────────────────────────────────────
function _cogStats(ci){
  if(!window.rawData||!rawData.length)return null;
  var h=headers[ci];
  if(window.alasql&&h){
    try{
      var safe=h.replace(/`/g,'``');
      var res=alasql('SELECT COUNT(`'+safe+'`) AS cnt,SUM(`'+safe+'`) AS s,AVG(`'+safe+'`) AS av,MIN(`'+safe+'`) AS mn,MAX(`'+safe+'`) AS mx FROM __dd WHERE `'+safe+'` IS NOT NULL AND `'+safe+'` != ""');
      if(res&&res.length&&res[0].cnt>0){return{col:h,count:res[0].cnt,sum:Math.round(res[0].s*100)/100,avg:Math.round(res[0].av*100)/100,min:res[0].mn,max:res[0].mx};}
    }catch(e){}
  }
  var vals=[];
  for(var i=0;i<rawData.length;i++){var n=parseFloat(String(rawData[i][ci]).replace(/,/g,''));if(!isNaN(n))vals.push(n);}
  if(!vals.length)return{col:h,count:0,distinct_samples:rawData.slice(0,5).map(function(r){return r[ci];}).filter(function(v){return v!==null&&v!=='';}).slice(0,5)};
  vals.sort(function(a,b){return a-b;});
  var sum=vals.reduce(function(a,b){return a+b;},0);
  return{col:h,count:vals.length,sum:Math.round(sum*100)/100,avg:Math.round(sum/vals.length*100)/100,min:vals[0],max:vals[vals.length-1]};
}

// ── Group-by (SQL when available, JS fallback) ────────────────────────
function _cogGroupBy(groupCol,valCol){
  var gi=headers.indexOf(groupCol),vi=headers.indexOf(valCol);
  if(gi<0||vi<0)return[];
  if(window.alasql){
    try{
      var gc=groupCol.replace(/`/g,'``'),vc=valCol.replace(/`/g,'``');
      var res=alasql('SELECT `'+gc+'` AS g,SUM(`'+vc+'`) AS v FROM __dd GROUP BY `'+gc+'` ORDER BY v DESC');
      if(res&&res.length)return res.map(function(r){return{g:String(r.g),v:Math.round(Number(r.v)*100)/100};});
    }catch(e){}
  }
  var acc={};
  rawData.forEach(function(row){
    var g=String(row[gi]||'(blank)'),n=parseFloat(String(row[vi]).replace(/,/g,''));
    if(!isNaN(n))acc[g]=(acc[g]||0)+n;
  });
  return Object.keys(acc).map(function(k){return{g:k,v:Math.round(acc[k]*100)/100};}).sort(function(a,b){return b.v-a.v;});
}

// ── Build evidence object for one step ───────────────────────────────
var _cogGroupKws=['per','by','each','department','category','group','across','breakdown','कुल','प्रति','विभाग','वर्ग'];
var _cogTrendKws=['trend','rising','falling','growth','change','increase','decrease','compare','प्रवृत्ति','बढ़','घट'];

function _cogGround(stepQ){
  if(!window.headers||!window.rawData||!rawData.length)return{};
  var cols=_cogFindCols(stepQ);
  var ev={relevant_columns:cols.map(function(c){return c.h;})};
  var numCols=cols.filter(function(c){return window.colTypes&&colTypes[c.ci]==='number';});
  var txtCols=cols.filter(function(c){return !window.colTypes||colTypes[c.ci]!=='number';});

  // Numeric stats
  var stats={};
  numCols.forEach(function(c){var s=_cogStats(c.ci);if(s)stats[c.h]=s;});
  if(Object.keys(stats).length)ev.stats=stats;

  // Group-by intent
  var ql=stepQ.toLowerCase();
  var wantGroup=_cogGroupKws.some(function(k){return ql.indexOf(k)!==-1;});
  if(wantGroup&&txtCols.length&&numCols.length){
    var grps=_cogGroupBy(txtCols[0].h,numCols[0].h);
    if(grps.length){
      ev.grouped_by=txtCols[0].h;ev.value_col=numCols[0].h;
      ev.top_groups=grps.slice(0,5);ev.total_groups=grps.length;
      ev.highest={group:grps[0].g,value:grps[0].v};
      if(grps.length>1)ev.lowest={group:grps[grps.length-1].g,value:grps[grps.length-1].v};
    }
  }

  // Trend intent
  var wantTrend=_cogTrendKws.some(function(k){return ql.indexOf(k)!==-1;});
  if(wantTrend&&numCols.length){
    var tc=numCols[0];
    var tvs=rawData.slice(0,50).map(function(r){var n=parseFloat(String(r[tc.ci]).replace(/,/g,''));return isNaN(n)?null:n;}).filter(function(v){return v!==null;});
    if(tvs.length>=2){
      var delta=tvs[tvs.length-1]-tvs[0];
      ev.trend_col=tc.h;ev.trend_direction=delta>0?'rising':delta<0?'falling':'stable';
      ev.trend_start=tvs[0];ev.trend_end=tvs[tvs.length-1];ev.trend_change=Math.round(delta*100)/100;
    }
  }

  // Fallback: sample rows for the relevant columns
  if(!ev.stats&&!ev.top_groups&&!ev.trend_col&&cols.length){
    ev.sample_rows=rawData.slice(0,5).map(function(row){
      var o={};cols.forEach(function(c){o[c.h]=row[c.ci];});return o;
    });
  }

  return ev;
}

// ── Render step trace + draft as HTML ────────────────────────────────
function _cogRenderSteps(result,isHi){
  var conf=typeof result.confidence==='number'?result.confidence:0;
  var confClass=conf>=0.7?'high':conf>=0.35?'medium':'low';
  var confLabel=conf>=0.7?(isHi?'उच्च विश्वास':'High confidence'):conf>=0.35?(isHi?'मध्यम विश्वास':'Medium confidence'):(isHi?'अपर्याप्त साक्ष्य':'Low evidence');
  var html='';
  html+='<div class="cog-confidence '+confClass+'">&#129504; '+confLabel+' ('+Math.round(conf*100)+'%)';
  if(result.consistency!==undefined&&result.consistency<0.8)html+=' · <span style="font-size:10px;opacity:.75">'+(isHi?'असंगत':'inconsistent')+'</span>';
  html+='</div>';
  // Tone badge (Batch 21)
  var _tbl={official:'&#128203; Official',friendly:'&#128172; Friendly',executive:'&#9889; Brief'};
  if(result.toneApplied)html+='<span class="tone-badge">&#9998; '+(_tbl[result.tonePreset]||String(result.tonePreset||''))+'</span>';
  else if(result.toneRejected)html+='<span class="tone-badge rejected">&#9888; '+(isHi?'स्वर अस्वीकृत':'style rejected')+'</span>';
  // Abstention card
  if(result.abstained){
    html+='<div class="ver-abstain"><div class="ver-abstain-title">&#9888; '+(isHi?'पर्याप्त विश्वास नहीं — Abstaining':'Insufficient Confidence — Abstaining')+'</div>';
    html+='<div class="ver-abstain-body">'+escHtml(result.draft||'')+'</div></div>';
  }else{
    html+='<div class="cog-draft">'+escHtml(result.draft||'')+'</div>';
  }
  if(result.steps&&result.steps.length){
    html+='<div class="cog-plan-label">'+(isHi?'तर्क चरण — Reasoning steps':'Reasoning steps')+'</div>';
    html+='<div class="cog-trace">';
    result.steps.forEach(function(s,i){
      var cls='cog-step'+(s.supported?' supported':' insufficient');
      html+='<div class="'+cls+'">';
      // Step header + verification badge
      var ns=s.numScore,cs=s.claimScore;
      var hasBadge=ns!==undefined;
      var badgeHtml='';
      if(hasBadge){
        if(ns>=0.99&&(cs===undefined||cs>=0.8))badgeHtml='<span class="ver-badge ok">&#10003; '+(isHi?'सत्यापित':'verified')+'</span>';
        else if(ns>=0.5)badgeHtml='<span class="ver-badge warn">&#9888; '+(isHi?'आंशिक':'partial')+'</span>';
        else if(s.supported)badgeHtml='<span class="ver-badge fail">&#215; '+(isHi?'असत्यापित':'unverified')+'</span>';
      }
      html+='<div class="cog-step-q">'+(i+1)+'. '+escHtml(s.q)+badgeHtml+'</div>';
      if(s.supported){
        html+='<div class="cog-step-ans">'+escHtml(s.answer)+'</div>';
        if(s.hadCorrections)html+='<div class="ver-correction-note">&#9986; '+(isHi?'असत्यापित संख्याएं हटाई गई':'Unverified numbers removed')+'</div>';
        if(s.criticNote)html+='<div class="ver-correction-note">&#128269; '+escHtml(s.criticNote)+'</div>';
        if(s.evidence&&s.evidence.relevant_columns&&s.evidence.relevant_columns.length){
          s.evidence.relevant_columns.forEach(function(c){html+='<span class="cog-evidence-tag">'+escHtml(c)+'</span>';});
        }
      }else{
        html+='<div class="cog-step-ans" style="color:var(--warning);font-size:11px">&#9888; '+(isHi?'पर्याप्त साक्ष्य नहीं':'Insufficient evidence — no data to ground this step')+'</div>';
      }
      html+='</div>';
    });
    html+='</div>';
  }
  return html;
}

// ── Main async orchestrator ───────────────────────────────────────────
DD.cognition.run=async function(task,ctx){
  ctx=ctx||{};
  var lang=(window.DD&&DD.lang)||'en';

  // 1. Decompose
  var steps=[task];
  try{
    var pr=await fetch('/api/ai/cognition/plan',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({task:task,headers:window.headers||[],colTypes:window.colTypes||[]})
    });
    if(pr.ok){var pd=await pr.json();if(pd.steps&&pd.steps.length)steps=pd.steps.slice(0,6);}
  }catch(e){}

  // 2+3+4. Ground each step + Draft
  var stepResults=[];
  for(var i=0;i<steps.length;i++){
    var q=steps[i];
    var ev=_cogGround(q);
    var answer='INSUFFICIENT',supported=false;
    try{
      var dr=await fetch('/api/ai/cognition/draft',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({q:q,evidence:ev,lang:lang})
      });
      if(dr.ok){
        var dd2=await dr.json();
        answer=dd2.answer||'INSUFFICIENT';
        supported=dd2.supported!==false&&answer.trim().toUpperCase()!=='INSUFFICIENT';
      }
    }catch(e){}
    stepResults.push({q:q,evidence:ev,answer:answer,supported:supported});
    if(typeof _pvLog==='function'){
      _pvLog({actor:'ai',action:'COGNITION_STEP',method:'grounded_draft',target:'step:'+(i+1),
        inputs:ev.relevant_columns||[],output:'answer',
        label:'Step '+(i+1)+': '+q.slice(0,60),labelHi:'चरण '+(i+1)+': '+q.slice(0,40)});
    }
  }

  // 5. Synthesize
  var ok=stepResults.filter(function(s){return s.supported;});
  var confidence=ok.length/Math.max(stepResults.length,1);
  var draft=ok.map(function(s){return s.answer;}).join(' ').trim();
  if(!draft)draft=(lang==='hi')?'पर्याप्त साक्ष्य नहीं — कृपया सही कॉलम लोड करें।':'Insufficient evidence to answer — verify the right columns are loaded.';

  var result={plan:steps,steps:stepResults,draft:draft,confidence:confidence};
  if(typeof _pvLog==='function'){
    _pvLog({actor:'ai',action:'COGNITION',method:'decompose_ground_draft',target:'query',
      inputs:steps,output:'draft',label:'Cognition: '+task.slice(0,80),labelHi:'संज्ञान: '+task.slice(0,40)});
  }
  return result;
};
// ═══════════════════════════════════════════════════════════════════════
//  BATCH 20 — Verification, Hallucination Guard & Abstention
// ═══════════════════════════════════════════════════════════════════════

// ── Number extraction from text ───────────────────────────────────────
function _verExtractNums(text){
  var ms=String(text||'').match(/\b\d[\d,]*(?:\.\d+)?%?\b/g)||[];
  return ms.map(function(m){return parseFloat(m.replace(/,/g,'').replace(/%$/,''));}).filter(function(n){return!isNaN(n);});
}

// ── Build set of allowed numbers from evidence ────────────────────────
function _verAllowed(ev){
  var arr=[];
  function add(v){
    var n=parseFloat(v);
    if(isNaN(n))return;
    [n,Math.round(n),Math.round(n*10)/10,Math.round(n*100)/100].forEach(function(r){arr.push(r);});
  }
  if(ev.stats)Object.keys(ev.stats).forEach(function(k){
    var s=ev.stats[k];
    ['count','sum','avg','min','max'].forEach(function(f){if(s&&s[f]!==undefined)add(s[f]);});
  });
  if(ev.top_groups)ev.top_groups.forEach(function(g){add(g.v);});
  if(ev.highest)add(ev.highest.value);
  if(ev.lowest)add(ev.lowest.value);
  if(ev.total_groups!==undefined)add(ev.total_groups);
  if(ev.trend_start!==undefined){add(ev.trend_start);add(ev.trend_end);add(ev.trend_change);}
  if(ev.sample_rows)ev.sample_rows.forEach(function(r){Object.keys(r).forEach(function(k){add(r[k]);});});
  return arr;
}

// ── Number verification: returns {score, unmatched[]} ────────────────
function _verNumCheck(answer,ev){
  var nums=_verExtractNums(answer);
  if(!nums.length)return{score:1,unmatched:[]};
  var allowed=_verAllowed(ev);
  var matched=0,unmatched=[];
  nums.forEach(function(n){
    var tol=Math.max(Math.abs(n)*0.02,0.5);
    var ok=allowed.some(function(a){return Math.abs(n-a)<=tol;});
    if(ok)matched++;else unmatched.push(n);
  });
  return{score:matched/nums.length,unmatched:unmatched};
}

// ── Strip sentences containing unmatched numbers ──────────────────────
function _verStrip(text,badNums){
  if(!badNums||!badNums.length)return text;
  var sents=text.replace(/([.!?।])\s+/g,'$1\n').split('\n').filter(Boolean);
  var clean=sents.filter(function(sent){
    var ns=_verExtractNums(sent);
    return!ns.some(function(n){return badNums.some(function(b){return Math.abs(n-b)<=Math.max(Math.abs(b)*0.02,0.5);});});
  });
  return clean.join(' ').trim()||'INSUFFICIENT';
}

// ── Evidence coverage score 0–1 ───────────────────────────────────────
function _verCoverage(ev){
  if(!ev||!Object.keys(ev).length)return 0;
  if(ev.stats&&Object.keys(ev.stats).length>0)return 1;
  if(ev.top_groups&&ev.top_groups.length>0)return 0.9;
  if(ev.trend_col)return 0.7;
  if(ev.sample_rows&&ev.sample_rows.length>0)return 0.4;
  if(ev.relevant_columns&&ev.relevant_columns.length>0)return 0.2;
  return 0;
}

// ── Main verification orchestrator ────────────────────────────────────
DD.cognition.verify=async function(result){
  var lang=(window.DD&&DD.lang)||'en';
  var isHi=lang==='hi';
  var steps=result.steps||[];
  var verSteps=[];

  for(var i=0;i<steps.length;i++){
    var s=steps[i];
    if(!s.supported){
      verSteps.push(Object.assign({},s,{confidence:0,numScore:0,covScore:0,claimScore:1,hadCorrections:false}));
      continue;
    }
    var ev=s.evidence||{};
    var numChk=_verNumCheck(s.answer,ev);
    var cleanAns=_verStrip(s.answer,numChk.unmatched);
    var covScore=_verCoverage(ev);
    var claimScore=1.0,criticNote='';
    var isInsuf=cleanAns.trim().toUpperCase()==='INSUFFICIENT';

    // Claim check via LLM (only when online, non-trivial answer, decent evidence)
    if(typeof _ollamaOnline!=='undefined'&&_ollamaOnline&&!isInsuf&&covScore>=0.4&&cleanAns.length>15){
      try{
        var cr=await fetch('/api/ai/cognition/verify',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({q:s.q,answer:cleanAns,evidence:ev,lang:lang})
        });
        if(cr.ok){
          var cd=await cr.json();
          claimScore=typeof cd.score==='number'?Math.max(0,Math.min(1,cd.score)):1.0;
          if(cd.cleaned_answer&&cd.cleaned_answer.trim())cleanAns=cd.cleaned_answer;
          criticNote=cd.note||'';
        }
      }catch(e){}
    }

    var stepConf=numChk.score*covScore*claimScore;
    var stillSupported=!isInsuf&&stepConf>0.05;
    verSteps.push(Object.assign({},s,{
      answer:cleanAns,original_answer:s.answer,
      supported:stillSupported,
      numScore:numChk.score,unmatched_nums:numChk.unmatched,
      covScore:covScore,claimScore:claimScore,
      confidence:stepConf,criticNote:criticNote,
      hadCorrections:cleanAns!==s.answer||numChk.unmatched.length>0
    }));
  }

  // Self-consistency: single-step, thin evidence, numbers uncertain
  var consistency=1.0;
  if(verSteps.length===1&&verSteps[0].supported&&verSteps[0].covScore<0.6&&verSteps[0].numScore<1
     &&typeof _ollamaOnline!=='undefined'&&_ollamaOnline){
    try{
      var sc=await fetch('/api/ai/cognition/sample',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({q:steps[0].q,evidence:steps[0].evidence||{},lang:lang,n:2})
      });
      if(sc.ok){var sd=await sc.json();consistency=typeof sd.agreement==='number'?sd.agreement:1.0;}
    }catch(e){}
  }

  // Overall confidence
  var supSteps=verSteps.filter(function(s){return s.supported;});
  var suppFrac=supSteps.length/Math.max(verSteps.length,1);
  var meanConf=supSteps.length?supSteps.reduce(function(a,s){return a+s.confidence;},0)/supSteps.length:0;
  var overallConf=meanConf*suppFrac*consistency;

  // Synthesize verified draft
  var draft=supSteps.map(function(s){return s.answer;}).join(' ').trim();

  // Abstention gate
  var THRESH=0.35;
  var abstained=overallConf<THRESH||!draft;
  if(abstained){
    var vFacts=supSteps.slice(0,3).map(function(s){return s.answer;}).filter(Boolean);
    var missCols=verSteps.filter(function(s){return!s.supported&&s.evidence&&s.evidence.relevant_columns;})
      .map(function(s){return s.evidence.relevant_columns;}).reduce(function(a,b){return a.concat(b);},[])
      .filter(function(v,i,a){return a.indexOf(v)===i;}).slice(0,4);
    var msg;
    if(isHi){
      msg='मुझे इस प्रश्न का उत्तर देने में पर्याप्त विश्वास नहीं है (विश्वास: '+Math.round(overallConf*100)+'%)।';
      if(vFacts.length)msg+='\n\nजो सत्यापित है:\n'+vFacts.join(' ');
      if(missCols.length)msg+='\n\nजो अनुपस्थित है: '+missCols.join(', ')+' के डेटा की आवश्यकता है।';
      msg+='\n\nकृपया अधिक डेटा जोड़ें या प्रश्न स्पष्ट करें।';
    }else{
      msg="I'm not confident enough to answer this (confidence: "+Math.round(overallConf*100)+"%).";
      if(vFacts.length)msg+='\n\nWhat I can verify:\n'+vFacts.join(' ');
      if(missCols.length)msg+='\n\nWhat is missing: data for '+missCols.join(', ')+'.';
      msg+='\n\nPlease add more relevant data or clarify your question.';
    }
    draft=msg;
  }

  // Provenance log
  if(typeof _pvLog==='function'){
    var pvNote=abstained?'abstained':'verified conf='+Math.round(overallConf*100)+'%';
    _pvLog({actor:'ai',action:'VERIFY',method:'num_check+claim_check+self_consistency',target:'draft',
      inputs:supSteps.map(function(s){return s.q.slice(0,30);}),output:'verified_draft',
      label:'Verify: '+pvNote+'; '+supSteps.length+'/'+verSteps.length+' steps passed',
      labelHi:'सत्यापन: '+pvNote});
  }

  return Object.assign({},result,{steps:verSteps,draft:draft,confidence:overallConf,abstained:abstained,consistency:consistency});
};
// ═══════════════════════════════════════════════════════════════════════
//  BATCH 21 — Humanized Expert Tone Layer (fact-frozen)
// ═══════════════════════════════════════════════════════════════════════
(function(){window.DD=window.DD||{};DD.ui=DD.ui||{};DD.ui.tonePreset=DD.ui.tonePreset||'friendly';})();

function _toneSelect(preset){
  window.DD=window.DD||{};DD.ui=DD.ui||{};DD.ui.tonePreset=preset;
  ['friendly','official','executive'].forEach(function(p){
    var btn=document.getElementById('tone-'+p);
    if(btn)btn.className='tone-btn'+(p===preset?' active':'');
  });
}

DD.cognition.tone=async function(verResult,preset){
  preset=preset||(window.DD&&DD.ui&&DD.ui.tonePreset)||'friendly';
  var lang=(window.DD&&DD.lang)||'en';
  var draft=verResult.draft||'';

  // Don't tone abstention messages or empty drafts
  if(!draft||verResult.abstained){
    return Object.assign({},verResult,{toneApplied:false,toneRejected:false,tonePreset:preset});
  }

  // Numbers in the verified draft are the only ones the model may use
  var draftNums=_verExtractNums(draft);

  // Build deduped allowed set (draft nums + evidence nums, capped at 30)
  var allAllowed=draftNums.slice();
  (verResult.steps||[]).forEach(function(s){
    if(s.evidence)_verAllowed(s.evidence).forEach(function(n){allAllowed.push(n);});
  });
  var dedupAllowed=allAllowed.filter(function(v,i,a){return a.indexOf(v)===i;}).slice(0,30);

  var styled=null;
  for(var attempt=0;attempt<2;attempt++){
    try{
      var resp=await fetch('/api/ai/cognition/tone',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({text:draft,allowed_nums:dedupAllowed,preset:preset,lang:lang})
      });
      if(!resp.ok)break;
      var data=await resp.json();
      if(data.error)break;
      var candidate=(data.styled||'').trim();
      if(!candidate)break;
      // Post-tone number check — fact-frozen: no new number allowed
      var tonedNums=_verExtractNums(candidate);
      var hasNew=tonedNums.some(function(n){
        return!draftNums.some(function(o){return Math.abs(n-o)<=Math.max(Math.abs(n)*0.02,0.5);});
      });
      if(!hasNew){styled=candidate;break;}
    }catch(e){break;}
  }

  var applied=!!styled;
  if(typeof _pvLog==='function'&&applied){
    _pvLog({actor:'ai',action:'TONE',method:'style_pass:'+preset,target:'draft',
      inputs:[draft.slice(0,40)],output:'styled_draft',
      label:'Tone ('+preset+'): applied',labelHi:'स्वर ('+preset+'): लागू'});
  }
  return Object.assign({},verResult,{
    draft:applied?styled:draft,
    toneApplied:applied,
    toneRejected:!applied,
    tonePreset:preset
  });
};
