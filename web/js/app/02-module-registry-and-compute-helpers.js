// =====================================================================
//  BATCH 5 — Helpers + real compute for SUMMARIZE + QUALITY modules
// =====================================================================

var _ddHelpers = {
  col: function(node) {
    var ci = (node.config && node.config.col !== undefined && node.config.col !== '') ? parseInt(node.config.col, 10) : -1;
    if (ci < 0 || !Array.isArray(headers) || ci >= headers.length) return [];
    return rawData.map(function(r) { return r[ci]; });
  },
  nums: function(values) {
    return values.map(function(v) {
      return parseFloat(String(v == null ? '' : v).replace(/[,\s₹$%]/g, ''));
    }).filter(function(v) { return Number.isFinite(v); });
  },
  t: function(obj) {
    var l = (typeof uiLanguage !== 'undefined') ? uiLanguage : 'en';
    return (obj && (obj[l] || obj.en)) || '';
  }
};

function _ddEscHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _ddFmt(n, d) { if (!Number.isFinite(n)) return '—'; return Number(n.toFixed(d!==undefined?d:4)).toLocaleString(); }
function _ddPct(a, b) { return b > 0 ? ((a/b)*100).toFixed(1) + '%' : '—'; }

// ── SUMMARIZE ─────────────────────────────────────────────────────
DD.modules.average.run = async function(node, h) {
  var nums = h.nums(h.col(node));
  if (!nums.length) throw new Error('No numeric values found. Please pick a numeric column.\nकोई संख्यात्मक मान नहीं मिला।');
  var avg = nums.reduce(function(a,b){return a+b;},0)/nums.length;
  return { type:'value', value:avg, label:{en:'Average',hi:'औसत'},
    display:'<div class="dd-res-mod">Average · औसत</div>' +
      '<div class="dd-res-big">'+_ddFmt(avg)+'</div>' +
      '<div class="dd-res-sub">of '+nums.length+' numeric values · '+nums.length+' संख्यात्मक मान</div>',
    raw:{avg:avg,n:nums.length} };
};

DD.modules.sum.run = async function(node, h) {
  var nums = h.nums(h.col(node));
  if (!nums.length) throw new Error('No numeric values found.\nकोई संख्यात्मक मान नहीं।');
  var total = nums.reduce(function(a,b){return a+b;},0);
  return { type:'value', value:total, label:{en:'Sum',hi:'योग'},
    display:'<div class="dd-res-mod">Sum · योग</div>' +
      '<div class="dd-res-big">'+_ddFmt(total)+'</div>' +
      '<div class="dd-res-sub">'+nums.length+' values added · '+nums.length+' मान जोड़े</div>',
    raw:{sum:total,n:nums.length} };
};

DD.modules.count.run = async function(node, h) {
  var vals = h.col(node);
  var filled = vals.filter(function(v){return v!==null&&v!==undefined&&String(v).trim()!=='';});
  return { type:'value', value:filled.length, label:{en:'Count',hi:'गिनती'},
    display:'<div class="dd-res-mod">Count · गिनती</div>' +
      '<div class="dd-res-big">'+filled.length+'</div>' +
      '<div class="dd-res-sub">non-empty of '+vals.length+' · '+vals.length+' में से भरे</div>',
    raw:{count:filled.length,total:vals.length,empty:vals.length-filled.length} };
};

DD.modules.min.run = async function(node, h) {
  var nums = h.nums(h.col(node));
  if (!nums.length) throw new Error('No numeric values found.\nकोई संख्यात्मक मान नहीं।');
  var m = Math.min.apply(null, nums);
  return { type:'value', value:m, label:{en:'Minimum',hi:'न्यूनतम'},
    display:'<div class="dd-res-mod">Minimum · न्यूनतम</div>' +
      '<div class="dd-res-big">'+_ddFmt(m)+'</div>' +
      '<div class="dd-res-sub">smallest of '+nums.length+' values · सबसे छोटा</div>',
    raw:{min:m,n:nums.length} };
};

DD.modules.max.run = async function(node, h) {
  var nums = h.nums(h.col(node));
  if (!nums.length) throw new Error('No numeric values found.\nकोई संख्यात्मक मान नहीं।');
  var m = Math.max.apply(null, nums);
  return { type:'value', value:m, label:{en:'Maximum',hi:'अधिकतम'},
    display:'<div class="dd-res-mod">Maximum · अधिकतम</div>' +
      '<div class="dd-res-big">'+_ddFmt(m)+'</div>' +
      '<div class="dd-res-sub">largest of '+nums.length+' values · सबसे बड़ा</div>',
    raw:{max:m,n:nums.length} };
};

DD.modules.median.run = async function(node, h) {
  var nums = h.nums(h.col(node)).sort(function(a,b){return a-b;});
  if (!nums.length) throw new Error('No numeric values found.\nकोई संख्यात्मक मान नहीं।');
  var mid = Math.floor(nums.length/2);
  var med = nums.length%2===0 ? (nums[mid-1]+nums[mid])/2 : nums[mid];
  return { type:'value', value:med, label:{en:'Median',hi:'माध्यिका'},
    display:'<div class="dd-res-mod">Median · माध्यिका</div>' +
      '<div class="dd-res-big">'+_ddFmt(med)+'</div>' +
      '<div class="dd-res-sub">middle value of '+nums.length+' · बीच का मान</div>',
    raw:{median:med,n:nums.length} };
};

DD.modules.mode.run = async function(node, h) {
  var vals = h.col(node).filter(function(v){return v!==null&&v!==undefined&&String(v).trim()!=='';});
  if (!vals.length) throw new Error('No values found.\nकोई मान नहीं मिला।');
  var freq = {};
  vals.forEach(function(v){var k=String(v).trim();freq[k]=(freq[k]||0)+1;});
  var maxF = Math.max.apply(null, Object.values(freq));
  var modes = Object.keys(freq).filter(function(k){return freq[k]===maxF;});
  var sz = modes[0].length > 8 ? '18' : '26';
  return { type:'value', value:modes[0], label:{en:'Mode',hi:'बहुलक'},
    display:'<div class="dd-res-mod">Mode · बहुलक</div>' +
      '<div class="dd-res-big" style="font-size:'+sz+'px">'+_ddEscHtml(modes[0])+'</div>' +
      '<div class="dd-res-sub">'+maxF+' times'+(modes.length>1?' ('+modes.length+' modes)':'')+' · '+maxF+' बार</div>',
    raw:{modes:modes,freq:maxF,allFreq:freq} };
};

DD.modules.stddev.run = async function(node, h) {
  var nums = h.nums(h.col(node));
  if (nums.length < 2) throw new Error('Need at least 2 numeric values.\nकम से कम 2 संख्यात्मक मान चाहिए।');
  var mean = nums.reduce(function(a,b){return a+b;},0)/nums.length;
  var sd = Math.sqrt(nums.reduce(function(a,b){return a+Math.pow(b-mean,2);},0)/nums.length);
  return { type:'value', value:sd, label:{en:'Std Dev',hi:'फैलाव'},
    display:'<div class="dd-res-mod">Std Dev · फैलाव</div>' +
      '<div class="dd-res-big">'+_ddFmt(sd)+'</div>' +
      '<div class="dd-res-sub">mean='+_ddFmt(mean,2)+' · n='+nums.length+'</div>',
    raw:{stddev:sd,mean:mean,n:nums.length} };
};

DD.modules.range.run = async function(node, h) {
  var nums = h.nums(h.col(node));
  if (!nums.length) throw new Error('No numeric values found.\nकोई संख्यात्मक मान नहीं।');
  var mn=Math.min.apply(null,nums), mx=Math.max.apply(null,nums), r=mx-mn;
  return { type:'value', value:r, label:{en:'Range',hi:'परास'},
    display:'<div class="dd-res-mod">Range · परास</div>' +
      '<div class="dd-res-big">'+_ddFmt(r)+'</div>' +
      '<div class="dd-res-sub">'+_ddFmt(mn,2)+' → '+_ddFmt(mx,2)+'</div>',
    raw:{range:r,min:mn,max:mx,n:nums.length} };
};

// ── QUALITY ───────────────────────────────────────────────────────
DD.modules.missing.run = async function(node, h) {
  var vals = h.col(node);
  var rows = [];
  vals.forEach(function(v,i){if(v===null||v===undefined||String(v).trim()==='')rows.push(i+1);});
  var pct = _ddPct(rows.length, vals.length);
  return { type:'table', value:rows.length, label:{en:'Missing',hi:'रिक्त'},
    display:'<div class="dd-res-mod">Missing · रिक्त</div>' +
      '<div class="dd-res-big">'+rows.length+'</div>' +
      '<div class="dd-res-sub">'+pct+' of '+vals.length+' rows · पंक्तियाँ</div>' +
      (rows.length?'<div class="dd-res-sub" style="margin-top:4px">Rows: '+rows.slice(0,10).join(', ')+(rows.length>10?'…':'')+'</div>':''),
    raw:{count:rows.length,rows:rows,total:vals.length} };
};

DD.modules.duplicates.run = async function(node, h) {
  var vals = h.col(node);
  var freq = {};
  vals.forEach(function(v){if(v!==null&&v!==undefined&&String(v).trim()!==''){var k=String(v).trim();freq[k]=(freq[k]||0)+1;}});
  var dups = Object.entries(freq).filter(function(e){return e[1]>1;}).sort(function(a,b){return b[1]-a[1];});
  return { type:'table', value:dups.length, label:{en:'Duplicates',hi:'दोहराव'},
    display:'<div class="dd-res-mod">Duplicates · दोहराव</div>' +
      '<div class="dd-res-big">'+dups.length+'</div>' +
      '<div class="dd-res-sub">repeated values · दोहराई प्रविष्टियाँ</div>' +
      (dups.length?'<table class="dd-res-table"><tr><th>Value</th><th>Count</th></tr>'+
        dups.slice(0,5).map(function(d){return '<tr><td>'+_ddEscHtml(d[0])+'</td><td>'+d[1]+'</td></tr>';}).join('')+'</table>':''),
    raw:{count:dups.length,top:dups.slice(0,20)} };
};

DD.modules.unique.run = async function(node, h) {
  var vals = h.col(node).filter(function(v){return v!==null&&v!==undefined&&String(v).trim()!=='';});
  var distinct = Array.from(new Set(vals.map(function(v){return String(v).trim();})));
  var sample = distinct.slice(0,5);
  return { type:'value', value:distinct.length, label:{en:'Unique',hi:'अद्वितीय'},
    display:'<div class="dd-res-mod">Unique Values · अद्वितीय मान</div>' +
      '<div class="dd-res-big">'+distinct.length+'</div>' +
      '<div class="dd-res-sub">of '+vals.length+' non-empty · '+vals.length+' में से</div>' +
      '<div class="dd-res-sub" style="margin-top:4px">'+sample.map(function(v){return _ddEscHtml(v);}).join(', ')+(distinct.length>5?'…':'')+'</div>',
    raw:{unique:distinct.length,total:vals.length,sample:sample} };
};

DD.modules.outliers_iqr.run = async function(node, h) {
  var nums = h.nums(h.col(node)).sort(function(a,b){return a-b;});
  if (nums.length < 4) throw new Error('Need at least 4 numeric values.\nकम से कम 4 संख्यात्मक मान चाहिए।');
  var n = nums.length;
  var q1=nums[Math.floor(n*0.25)], q3=nums[Math.floor(n*0.75)], iqr=q3-q1;
  var lo=q1-1.5*iqr, hi=q3+1.5*iqr;
  var out = nums.filter(function(v){return v<lo||v>hi;});
  return { type:'table', value:out.length, label:{en:'Outliers',hi:'असामान्य'},
    display:'<div class="dd-res-mod">Outliers (IQR) · असामान्य</div>' +
      '<div class="dd-res-big">'+out.length+'</div>' +
      '<div class="dd-res-sub">Q1='+_ddFmt(q1,2)+' Q3='+_ddFmt(q3,2)+' IQR='+_ddFmt(iqr,2)+'</div>' +
      '<div class="dd-res-sub">Fence: ['+_ddFmt(lo,2)+', '+_ddFmt(hi,2)+']</div>' +
      (out.length?'<div class="dd-res-sub" style="margin-top:4px">'+out.slice(0,8).map(function(v){return _ddFmt(v,2);}).join(', ')+(out.length>8?'…':'')+'</div>':''),
    raw:{count:out.length,q1:q1,q3:q3,iqr:iqr,lower:lo,upper:hi,outliers:out} };
};

DD.modules.dtype_check.run = async function(node, h) {
  var vals = h.col(node).filter(function(v){return v!==null&&v!==undefined&&String(v).trim()!=='';});
  if (!vals.length) throw new Error('Column is empty.\nकॉलम खाली है।');
  var counts={number:0,date:0,text:0};
  vals.forEach(function(v){
    var s=String(v).trim();
    if(Number.isFinite(parseFloat(s.replace(/[,\s₹$%]/g,'')))) counts.number++;
    else if(s.length>=6&&!isNaN(Date.parse(s))) counts.date++;
    else counts.text++;
  });
  var dom=Object.keys(counts).sort(function(a,b){return counts[b]-counts[a];})[0];
  return { type:'table', value:dom, label:{en:'Type Check',hi:'प्रकार जाँच'},
    display:'<div class="dd-res-mod">Type Check · प्रकार जाँच</div>' +
      '<div class="dd-res-big" style="font-size:19px;text-transform:capitalize">'+dom+'</div>' +
      '<div class="dd-res-sub">dominant type ('+_ddPct(counts[dom],vals.length)+') · मुख्य प्रकार</div>' +
      '<table class="dd-res-table"><tr><th>Type</th><th>Count</th></tr>' +
      '<tr><td>Number</td><td>'+counts.number+'</td></tr>' +
      '<tr><td>Date</td><td>'+counts.date+'</td></tr>' +
      '<tr><td>Text</td><td>'+counts.text+'</td></tr></table>',
    raw:{counts:counts,dominant:dom,total:vals.length} };
};

DD.modules.trim_clean.run = async function(node, h) {
  var vals = h.col(node);
  var changes = [];
  vals.forEach(function(v,i){
    if(v===null||v===undefined) return;
    var orig=String(v), clean=orig.trim().replace(/\s+/g,' ');
    if(orig!==clean) changes.push({row:i+1,before:orig,after:clean});
  });
  return { type:'series', value:changes.length, label:{en:'Clean Text',hi:'पाठ सफ़ाई'},
    display:'<div class="dd-res-mod">Clean Text · पाठ सफ़ाई</div>' +
      '<div class="dd-res-big">'+changes.length+'</div>' +
      '<div class="dd-res-sub">cells need trimming · सेल साफ़ होंगे</div>' +
      (changes.length?'<table class="dd-res-table"><tr><th>Row</th><th>Before → After</th></tr>'+
        changes.slice(0,4).map(function(c){return '<tr><td>'+c.row+'</td><td><span style="color:#f87171">'+_ddEscHtml(c.before)+'</span>→<span style="color:#34d399">'+_ddEscHtml(c.after)+'</span></td></tr>';}).join('')+'</table>' :
        '<div class="dd-res-sub" style="color:#34d399;margin-top:5px">✓ All cells clean!</div>'),
    raw:{changes:changes.length,preview:changes.slice(0,20)} };
};

// ---- Render drawer from registry ----
var _CAT_ORDER = ['summarize','quality','transform','predict','visualize','report','ai'];

function renderModuleDrawer() {
  var container = document.getElementById('dd-drawer-content');
  if (!container) return;
  var lang = (typeof uiLanguage !== 'undefined') ? (uiLanguage === 'hi' ? 'hi' : 'en') : 'en';
  var groups = DD.getModulesByCategory();
  container.innerHTML = '';

  _CAT_ORDER.forEach(function(cat) {
    var mods = groups[cat];
    if (!mods || !mods.length) return;
    var meta = DD._catMeta[cat];
    var catLabel = meta.label[lang] || meta.label.en;

    var section = document.createElement('div');
    section.className = 'dd-cat-section';
    section.dataset.cat = cat;

    // Measure total height for smooth collapse
    var header = document.createElement('div');
    header.className = 'dd-cat-header';
    header.innerHTML =
      '<span class="dd-cat-dot" style="background:' + meta.color + '"></span>' +
      '<span class="dd-cat-label">' + catLabel + '</span>' +
      '<span class="dd-cat-arrow">▾</span>';
    header.addEventListener('click', function() {
      section.classList.toggle('collapsed');
      var grid = section.querySelector('.dd-cat-bubbles');
      if (grid) grid.style.maxHeight = section.classList.contains('collapsed') ? '0' : grid.scrollHeight + 'px';
    });

    var grid = document.createElement('div');
    grid.className = 'dd-cat-bubbles';

    mods.forEach(function(mod) {
      var displayName = (lang === 'hi' && mod.name.hi) ? mod.name.hi : mod.name.en;
      var descText   = (lang === 'hi' && mod.desc.hi) ? mod.desc.hi : mod.desc.en;

      var card = document.createElement('div');
      card.className = 'dd-mod-card';
      card.dataset.modId  = mod.id;
      card.dataset.nameEn = mod.name.en.toLowerCase();
      card.dataset.nameHi = mod.name.hi || '';
      card.dataset.descEn = mod.desc.en.toLowerCase();
      card.dataset.descHi = mod.desc.hi || '';

      card.innerHTML =
        '<div class="dd-mod-bubble" style="--dd-mod-color:' + mod.color + ';--dd-mod-glow:' + meta.glow + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="' + mod.color + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="22" height="22">' + mod.icon + '</svg>' +
        '</div>' +
        '<div class="dd-mod-name">' + displayName + '</div>' +
        '<div class="dd-mod-tip">' + descText + '</div>';

      // Batch 4: drag from drawer onto canvas
      (function(mId) {
        var bub = card.querySelector('.dd-mod-bubble');
        if (bub) bub.addEventListener('pointerdown', function(e) {
          e.preventDefault();
          if (typeof _ddDragStart === 'function') _ddDragStart(e, mId);
        });
      })(mod.id);

      grid.appendChild(card);
    });

    // Set initial max-height for smooth animation
    grid.style.maxHeight = grid.scrollHeight + 'px';
    setTimeout(function() { if (grid.scrollHeight) grid.style.maxHeight = grid.scrollHeight + 180 + 'px'; }, 50);

    section.appendChild(header);
    section.appendChild(grid);
    container.appendChild(section);
  });
}

// ---- Live search / filter ----
function filterModuleDrawer(q) {
  q = (q || '').toLowerCase().trim();
  document.querySelectorAll('#dd-drawer-content .dd-mod-card').forEach(function(card) {
    var match = !q ||
      (card.dataset.nameEn || '').includes(q) ||
      (card.dataset.nameHi || '').includes(q) ||
      (card.dataset.descEn || '').includes(q) ||
      (card.dataset.descHi || '').includes(q);
    card.classList.toggle('hidden', !match);
  });
  // Show/hide category sections; auto-expand when searching
  document.querySelectorAll('#dd-drawer-content .dd-cat-section').forEach(function(sec) {
    var hasVisible = Array.from(sec.querySelectorAll('.dd-mod-card')).some(function(c) { return !c.classList.contains('hidden'); });
    sec.style.display = hasVisible ? '' : 'none';
    if (q && hasVisible && sec.classList.contains('collapsed')) {
      sec.classList.remove('collapsed');
      var grid = sec.querySelector('.dd-cat-bubbles');
      if (grid) grid.style.maxHeight = '999px';
    }
  });
}

