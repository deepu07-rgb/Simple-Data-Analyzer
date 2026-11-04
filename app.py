"""
Pragya Data Studio - Flask Backend Server
==========================================
Serves the Single-Page HTML app and provides API endpoints for:
  - File upload (Excel / CSV) with parsing
  - Excel export with conditional-formatting colours
  - PDF export with Hindi / Devanagari Unicode support

Author: Auto-generated
Port  : 5555 (override with PORT env var)
"""

import io
import os
import re
import json
import sys
import math
import uuid
import html as _html
import webbrowser

# Force UTF-8 output on Windows so Devanagari in print() doesn't crash
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
import threading
import tempfile
from pathlib import Path
from datetime import datetime

from flask import Flask, request, jsonify, send_file, send_from_directory, abort
from flask_cors import CORS
import pandas as pd
import openpyxl
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from openpyxl.utils import get_column_letter

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv not installed; rely on system env vars

# ---------------------------------------------------------------------------
# App Configuration
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
STATIC_FONTS_DIR = BASE_DIR / "static" / "fonts"
DOWNLOAD_DIR = BASE_DIR / "download"

app = Flask(__name__, static_folder="static")

app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50 MB upload limit

PORT = int(os.environ.get("PORT", 5000))

# Security: listen on this PC only. Set STELLURA_HOST=0.0.0.0 only if you
# deliberately want other PCs on the office network to reach the app.
HOST = os.environ.get("STELLURA_HOST", "127.0.0.1")

# The app is served from the same origin, so CORS is only needed for local dev
# tools. Never allow arbitrary websites to call the local API.
CORS(app, origins=[
    f"http://127.0.0.1:{PORT}", f"http://localhost:{PORT}",
])

PID_FILE = BASE_DIR / "runtime" / "stellura.pid"

# ---------------------------------------------------------------------------
# Async Export Job Store
# ---------------------------------------------------------------------------
_export_jobs = {}   # {job_id: {status, result, error}}
_jobs_lock = threading.Lock()


def _run_export_job(job_id, export_fn, payload):
    """Execute export_fn(payload) in a background thread; store result in _export_jobs."""
    try:
        result = export_fn(payload)
        with _jobs_lock:
            _export_jobs[job_id]['status'] = 'done'
            _export_jobs[job_id]['result'] = result
    except Exception as exc:
        with _jobs_lock:
            _export_jobs[job_id]['status'] = 'error'
            _export_jobs[job_id]['error'] = str(exc)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_value(val):
    """Convert a cell value to a JSON-safe type."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
            return None
        return val
    if isinstance(val, datetime):
        if val.hour == 0 and val.minute == 0 and val.second == 0:
            return val.date().isoformat()
        return val.isoformat(sep=" ")
    return str(val)


def _parse_excel(file_bytes, filename, sheet_name=None):
    """Parse an .xlsx workbook: return headers, rows, sheet names and per-sheet size."""
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    sheet_names = wb.sheetnames
    sheet_info = [
        {"name": n, "rows": max((wb[n].max_row or 1) - 1, 0), "cols": wb[n].max_column or 0}
        for n in sheet_names
    ]

    # Select the requested sheet (default: first)
    if sheet_name and sheet_name in sheet_names:
        ws = wb[sheet_name]
    else:
        ws = wb.active
        sheet_name = ws.title

    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return {"headers": [], "data": [], "sheets": sheet_names,
                "sheetInfo": sheet_info, "activeSheet": sheet_name}

    headers = [str(h) if h is not None else f"Column {i+1}" for i, h in enumerate(rows[0])]
    data = [[_safe_value(cell) for cell in row] for row in rows[1:]]

    return {
        "headers": headers,
        "data": data,
        "sheets": sheet_names,
        "sheetInfo": sheet_info,
        "activeSheet": sheet_name,
    }


def _parse_csv(file_bytes, filename):
    """Parse a CSV file and return headers and rows."""
    try:
        text = file_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = file_bytes.decode("latin-1")

    df = pd.read_csv(io.StringIO(text), dtype=str, keep_default_na=False)
    headers = list(df.columns)
    data = df.values.tolist()

    return {
        "headers": headers,
        "data": data,
        "sheets": [],
        "activeSheet": None,
    }


# ---------------------------------------------------------------------------
# Font Management for PDF Hindi Support
# ---------------------------------------------------------------------------

_HINDI_FONT_READY = False
_HINDI_FONT_PATH = None


def _ensure_hindi_font():
    """
    Ensure a font that supports Devanagari / Hindi script is available.
    Strategy:
      1. Check for Noto Sans Devanagari in our local cache.
      2. Check common Windows system font paths (Nirmala UI, Mangal).
      3. Download Noto Sans Devanagari from Google Fonts CDN as a last resort.
    Returns the path to a .ttf file, or None if unavailable.
    """
    global _HINDI_FONT_READY, _HINDI_FONT_PATH

    if _HINDI_FONT_READY:
        return _HINDI_FONT_PATH

    # --- Check local cache first ---
    cached = STATIC_FONTS_DIR / "NotoSansDevanagari-Regular.ttf"
    if cached.exists():
        _HINDI_FONT_PATH = str(cached)
        _HINDI_FONT_READY = True
        return _HINDI_FONT_PATH

    # --- Check Windows system fonts ---
    win_font_dir = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts"
    system_fonts = [
        win_font_dir / "Nirmala.ttf",       # Nirmala UI (Windows 8+)
        win_font_dir / "NirmalaS.ttf",
        win_font_dir / "mangal.ttf",         # Mangal (older Windows)
    ]
    for sf in system_fonts:
        if sf.exists():
            _HINDI_FONT_PATH = str(sf)
            _HINDI_FONT_READY = True
            return _HINDI_FONT_PATH

    # --- Download Noto Sans Devanagari from Google Fonts ---
    try:
        import requests
        STATIC_FONTS_DIR.mkdir(parents=True, exist_ok=True)
        url = (
            "https://github.com/google/fonts/raw/main/ofl/"
            "notosansdevanagari/NotoSansDevanagari%5Bwdth%2Cwght%5D.ttf"
        )
        # Try the static regular weight first (more reliable)
        url_static = (
            "https://github.com/google/fonts/raw/main/ofl/"
            "notosansdevanagari/static/NotoSansDevanagari-Regular.ttf"
        )
        resp = requests.get(url_static, timeout=30)
        if resp.status_code != 200:
            resp = requests.get(url, timeout=30)
        if resp.status_code == 200:
            cached.parent.mkdir(parents=True, exist_ok=True)
            cached.write_bytes(resp.content)
            _HINDI_FONT_PATH = str(cached)
            _HINDI_FONT_READY = True
            print(f"  [OK] Downloaded Hindi font to {cached}")
            return _HINDI_FONT_PATH
    except Exception as e:
        print(f"  [WARN] Could not download Hindi font: {e}")

    _HINDI_FONT_READY = True  # Don't retry
    _HINDI_FONT_PATH = None
    return None


def _register_hindi_font():
    """Register the Hindi-capable font with ReportLab."""
    font_path = _ensure_hindi_font()
    if font_path is None:
        return False
    try:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        if "HindiFont" not in pdfmetrics._fonts:
            pdfmetrics.registerFont(TTFont("HindiFont", font_path))
        return True
    except Exception as e:
        print(f"  [WARN] Could not register Hindi font: {e}")
        return False


def _contains_devanagari(text):
    """Check if text contains any Devanagari characters."""
    if not isinstance(text, str):
        return False
    return bool(re.search(r'[\u0900-\u097F]', text))


# ---------------------------------------------------------------------------
# Offline-Shareable Interactive HTML Export
# ---------------------------------------------------------------------------
CHARTJS_CACHE_PATH = BASE_DIR / "static" / "js" / "chart.min.js"
_CHARTJS_CDN = "https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js"


def _get_chartjs_inline():
    """Return Chart.js source for inline embedding. Downloads and caches on first call."""
    if CHARTJS_CACHE_PATH.exists():
        return CHARTJS_CACHE_PATH.read_text(encoding='utf-8')
    try:
        import requests as _req
        resp = _req.get(_CHARTJS_CDN, timeout=30)
        if resp.status_code == 200:
            CHARTJS_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
            CHARTJS_CACHE_PATH.write_text(resp.text, encoding='utf-8')
            return resp.text
    except Exception as exc:
        print(f"  [WARN] Could not download Chart.js for caching: {exc}")
    return None


_DASHBOARD_HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>__DD_TITLE__ \u2014 Stellura</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:#f1f5f9;color:#1e293b;min-height:100vh}
.hdr{background:__DD_ACCENT__;color:#fff;padding:18px 24px;display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap}
.hdr-brand{font-size:10px;opacity:.7;letter-spacing:.08em;font-weight:700;text-transform:uppercase;margin-bottom:4px}
.hdr h1{font-size:20px;font-weight:800;margin:0;letter-spacing:-.3px}
.hdr .meta{font-size:12px;opacity:.8;margin-top:4px}
.hdr-right{margin-left:auto;padding-top:2px}
.print-btn{background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.45);color:#fff;padding:7px 16px;border-radius:7px;cursor:pointer;font-size:12px;font-weight:600}
.print-btn:hover{background:rgba(255,255,255,.3)}
.wrap{max-width:1440px;margin:0 auto;padding:20px 16px 48px}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:12px;margin-bottom:20px}
.kpi{background:#fff;border-radius:10px;padding:16px 14px;box-shadow:0 1px 4px rgba(0,0,0,.07);border-left:3px solid __DD_ACCENT__}
.kpi-lbl{font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px}
.kpi-val{font-size:23px;font-weight:800;color:#0f172a;line-height:1.1}
.kpi-unit{font-size:11px;color:#94a3b8;margin-top:3px}
.card{background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.07);margin-bottom:20px;overflow:hidden}
.card-hdr{padding:13px 20px;border-bottom:1px solid #e2e8f0;font-weight:700;font-size:13px;color:#475569;display:flex;align-items:center;gap:8px}
.chart-box{padding:20px;height:360px;position:relative}
.fbar{padding:10px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.fbar label{font-size:11px;color:#64748b;font-weight:700}
.fbar select{height:28px;padding:0 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;background:#fff;color:#1e293b;cursor:pointer}
.fbtn{height:28px;padding:0 12px;background:__DD_ACCENT__;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600}
.fbtn.clr{background:#e2e8f0;color:#475569}
.fstat{font-size:11px;color:#94a3b8}
.badge{display:inline-flex;align-items:center;background:rgba(99,102,241,.12);color:__DD_ACCENT__;font-size:10px;font-weight:700;padding:2px 8px;border-radius:8px;margin-left:8px}
.tbl-wrap{overflow-x:auto;max-height:520px;overflow-y:auto}
table{width:100%;border-collapse:collapse;font-size:12px}
thead th{background:__DD_ACCENT__;color:#fff;padding:9px 11px;text-align:left;font-weight:700;position:sticky;top:0;z-index:10;white-space:nowrap;font-size:11px}
tbody tr:nth-child(even){background:#f8fafc}
tbody tr:hover{background:#ede9fe}
td{padding:7px 11px;border-bottom:1px solid #f1f5f9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}
.more{text-align:center;padding:12px;color:#94a3b8;font-style:italic;font-size:12px}
.foot{text-align:center;padding:16px;color:#94a3b8;font-size:11px;background:#fff;border-top:1px solid #e2e8f0;margin-top:4px}
@media(max-width:600px){.kpi-val{font-size:19px}.hdr h1{font-size:16px}.chart-box{height:260px}}
@media print{.print-btn,.fbtn,.fbar select{display:none}.tbl-wrap{max-height:none;overflow:visible}.card{break-inside:avoid}body{background:#fff}}
</style>
__DD_CHARTJS__
</head>
<body>
<div class="hdr">
  <div>
    <div class="hdr-brand">Stellura \u2014 Data Vision Studio &nbsp;|&nbsp; \u0938\u094D\u091F\u0947\u0932\u094D\u092F\u0942\u0930\u093E</div>
    <h1>__DD_TITLE__</h1>
    <div class="meta">__DD_ROW_COUNT__ rows &times; __DD_COL_COUNT__ columns &nbsp;&bull;&nbsp; __DD_DATE__</div>
  </div>
  <div class="hdr-right">
    <button class="print-btn" onclick="window.print()">\U0001f5a8\uFE0F Print / Save PDF</button>
  </div>
</div>
<div class="wrap">
  <div id="kpi-grid" class="kpi-grid" style="margin-top:16px"></div>
  <div class="card" id="chart-card" style="display:none">
    <div class="card-hdr">\U0001f4ca Chart</div>
    <div class="chart-box"><canvas id="mainChart"></canvas></div>
  </div>
  <div class="card">
    <div class="card-hdr">
      \U0001f4cb Data Table
      <span class="badge" id="row-badge">__DD_ROW_COUNT__ rows</span>
    </div>
    <div class="fbar">
      <label>Filter:</label>
      <div id="fselects" style="display:flex;gap:8px;flex-wrap:wrap"></div>
      <button class="fbtn clr" onclick="clearF()">Clear</button>
      <span class="fstat" id="fstat"></span>
    </div>
    <div class="tbl-wrap"><table><thead id="thead"></thead><tbody id="tbody"></tbody></table></div>
  </div>
  <div class="foot">__DD_FOOTER_HTML__Generated by <strong>Stellura</strong> (\u0938\u094D\u091F\u0947\u0932\u094D\u092F\u0942\u0930\u093E) &nbsp;&bull;&nbsp; Developed by Neeraj Purohit, Senior Assistant, Rajasthan Police &nbsp;&bull;&nbsp; __DD_DATE__</div>
</div>
<script>
var H=__DD_HEADERS__,D=__DD_DATA__,KPIS=__DD_KPIS__,CF=__DD_CF__,CHC=__DD_CHART_CFG__;
var af={},fd=D.slice(),fi=D.map(function(_,i){return i;});
window.addEventListener('load',function(){kpis();fbar();tbl();chart();});
function esc(s){return String(s===null||s===undefined?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function kpis(){
  var c=document.getElementById('kpi-grid'),list=KPIS&&KPIS.length?KPIS:autoK();
  c.innerHTML=list.map(function(k){return '<div class="kpi"><div class="kpi-lbl">'+esc(k.label)+'</div><div class="kpi-val">'+esc(String(k.value))+'</div>'+(k.unit?'<div class="kpi-unit">'+esc(k.unit)+'</div>':'')+'</div>';}).join('');
}
function autoK(){
  var r=[],i,vals,sum;
  for(i=0;i<H.length&&r.length<4;i++){
    vals=D.map(function(row){return parseFloat(row[i]);}).filter(function(v){return !isNaN(v);});
    if(vals.length>D.length*0.5){sum=vals.reduce(function(a,b){return a+b;},0);r.push({label:'Total '+H[i],value:sum.toLocaleString('en-IN',{maximumFractionDigits:2})});}
  }
  r.push({label:'Total Records',value:D.length.toLocaleString('en-IN')});
  return r;
}
function fbar(){
  var c=document.getElementById('fselects'),added=0,i,j,s,u,seen,v;
  for(i=0;i<H.length&&added<4;i++){
    var samp=D.slice(0,30).map(function(r){return r[i];}).filter(function(x){return x!==null&&x!=='';});
    var nums=samp.filter(function(x){return !isNaN(parseFloat(x));}).length;
    if(nums>=samp.length*0.7)continue;
    u=[];seen={};
    for(j=0;j<D.length;j++){v=String(D[j][i]||'');if(v&&!seen[v]){seen[v]=true;u.push(v);}}
    u.sort();
    if(u.length<2||u.length>40)continue;
    s=document.createElement('select');
    s.style.cssText='height:28px;padding:0 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;background:#fff;color:#1e293b;cursor:pointer;outline:none';
    s.innerHTML='<option value="">All '+esc(H[i])+'</option>'+u.map(function(v){return '<option value="'+esc(v)+'">'+esc(v)+'</option>';}).join('');
    (function(ci){s.addEventListener('change',function(){af[ci]=s.value;applyF();});})(i);
    c.appendChild(s);added++;
  }
}
function applyF(){
  fd=[];fi=[];
  var keys=Object.keys(af);
  D.forEach(function(row,ri){
    var ok=keys.every(function(k){var val=af[k];return !val||String(row[parseInt(k)]||'')===val;});
    if(ok){fd.push(row);fi.push(ri);}
  });
  tbl();chart();
  var b=document.getElementById('row-badge');if(b)b.textContent=fd.length.toLocaleString('en-IN')+' rows';
  var st=document.getElementById('fstat');if(st)st.textContent=fd.length<D.length?'('+(D.length-fd.length).toLocaleString()+' rows hidden)':'';
}
function clearF(){
  af={};fd=D.slice();fi=D.map(function(_,i){return i;});
  document.querySelectorAll('#fselects select').forEach(function(s){s.value='';});
  tbl();chart();
  var b=document.getElementById('row-badge');if(b)b.textContent=D.length.toLocaleString('en-IN')+' rows';
  var st=document.getElementById('fstat');if(st)st.textContent='';
}
function tbl(){
  var th=document.getElementById('thead'),tb=document.getElementById('tbody');
  th.innerHTML='<tr>'+H.map(function(h){return '<th>'+esc(h)+'</th>';}).join('')+'</tr>';
  var disp=fd.slice(0,500),rows='',j,ri,row,ci,key,bg,val;
  for(j=0;j<disp.length;j++){
    row=disp[j];ri=fi[j];var cells='';
    for(ci=0;ci<row.length;ci++){
      key=ri+':'+ci;bg=CF[key]?'background:'+CF[key]+';':'';
      val=row[ci]===null||row[ci]===undefined?'':String(row[ci]);
      cells+='<td style="'+bg+'" title="'+esc(val)+'">'+esc(val)+'</td>';
    }
    rows+='<tr>'+cells+'</tr>';
  }
  if(fd.length>500)rows+='<tr><td colspan="'+H.length+'" class="more">&hellip; '+(fd.length-500).toLocaleString()+' more rows &mdash; use filters to narrow down</td></tr>';
  tb.innerHTML=rows;
}
var ci_=null;
function chart(){
  var sec=document.getElementById('chart-card');
  if(!CHC||!CHC.type||!CHC.xCol||typeof Chart==='undefined')return;
  sec.style.display='block';
  var xi=H.indexOf(CHC.xCol),yi=H.indexOf(CHC.yCol);
  if(xi<0)return;
  var pts=fd.slice(0,120);
  var lbls=pts.map(function(r){return String(r[xi]||'');});
  var vals=pts.map(function(r){return yi>=0?parseFloat(r[yi])||0:0;});
  var ctx=document.getElementById('mainChart').getContext('2d');
  if(ci_)ci_.destroy();
  var tp=CHC.type==='area'?'line':CHC.type;
  ci_=new Chart(ctx,{
    type:tp,
    data:{labels:lbls,datasets:[{label:CHC.label||CHC.yCol||CHC.xCol,data:vals,backgroundColor:'__DD_ACCENT__55',borderColor:'__DD_ACCENT__',borderWidth:2,fill:CHC.type==='area',tension:0.4,pointRadius:pts.length>40?2:4}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true},tooltip:{mode:'index',intersect:false}},scales:(tp==='pie'||tp==='doughnut')?{}:{x:{ticks:{maxTicksLimit:14,maxRotation:45}},y:{beginAtZero:true}}}
  });
}
</script>
</body>
</html>"""


def _build_dashboard_html(title, accent, row_count, col_count, gen_date,
                           chartjs_block, s_headers, s_data, s_kpis, s_cf,
                           s_chart, footer_text):
    """Substitute placeholders in the dashboard HTML template."""
    footer_prefix = (_html.escape(footer_text) + ' &nbsp;&bull;&nbsp; ') if footer_text else ''
    return (
        _DASHBOARD_HTML_TEMPLATE
        .replace('__DD_TITLE__', _html.escape(title))
        .replace('__DD_ACCENT__', accent)
        .replace('__DD_ROW_COUNT__', str(row_count))
        .replace('__DD_COL_COUNT__', str(col_count))
        .replace('__DD_DATE__', gen_date)
        .replace('__DD_CHARTJS__', chartjs_block)
        .replace('__DD_HEADERS__', s_headers)
        .replace('__DD_DATA__', s_data)
        .replace('__DD_KPIS__', s_kpis)
        .replace('__DD_CF__', s_cf)
        .replace('__DD_CHART_CFG__', s_chart)
        .replace('__DD_FOOTER_HTML__', footer_prefix)
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def serve_index():
    """Serve the main Single-Page Application HTML file."""
    html_path = DOWNLOAD_DIR / "Simple-Data-Analyser.html"
    if not html_path.exists():
        abort(404, description="Simple-Data-Analyser.html not found in /download folder.")
    return send_from_directory(str(DOWNLOAD_DIR), "Simple-Data-Analyser.html")


@app.route("/download/<path:filename>")
def serve_download(filename):
    """Serve static files from the download directory."""
    return send_from_directory(str(DOWNLOAD_DIR), filename)


# ---------------------------------------------------------------------------
# Upload API
# ---------------------------------------------------------------------------

@app.route("/api/upload", methods=["POST"])
def upload_file():
    """
    Accept an Excel (.xlsx, .xls) or CSV file, parse it, and return JSON.
    Optional query param: ?sheet=SheetName  (for multi-sheet Excel files)
    """
    if "file" not in request.files:
        return jsonify({"error": "No file part in the request."}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected."}), 400

    filename = file.filename.lower()
    file_bytes = file.read()

    try:
        if filename.endswith(".xls"):
            return jsonify({"error": "legacy_xls",
                            "message": "Legacy .xls is read in the browser."}), 415
        if filename.endswith(".xlsx"):
            sheet = request.form.get("sheet") or request.args.get("sheet")
            result = _parse_excel(file_bytes, file.filename, sheet_name=sheet)
        elif filename.endswith(".csv"):
            result = _parse_csv(file_bytes, file.filename)
        else:
            return jsonify({"error": "Unsupported file type. Please upload .xlsx, .xls, or .csv"}), 400
    except Exception as e:
        return jsonify({"error": f"Failed to parse file: {str(e)}"}), 500

    return jsonify(result)


# ---------------------------------------------------------------------------
# Excel Export API
# ---------------------------------------------------------------------------

def _build_excel(payload):
    """Build Excel file and return (bytes, filename, mimetype)."""
    headers_list = payload.get("headers", [])
    data = payload.get("data", [])
    title = payload.get("title", "Export")
    filename_base = payload.get("filename", title)
    cf_colors = payload.get("conditionalFormatting", {})
    cell_fonts = payload.get("cellFonts", {})
    freeze_header = payload.get("freezeHeader", True)
    include_logo = payload.get("includeLogo", True)
    include_profile = payload.get("includeProfile", True)
    paper_size_name = payload.get("paperSize", "a4").lower()
    orientation_name = payload.get("orientation", "landscape").lower()
    # Cell formatting maps: key = "row:col" (0-indexed)
    cell_bold = payload.get("cellBold", {})
    cell_italic = payload.get("cellItalic", {})
    cell_underline = payload.get("cellUnderline", {})
    cell_font_sizes = payload.get("cellFontSize", {})
    cell_font_colors = payload.get("cellFontColor", {})
    cell_bg_colors = payload.get("cellBgColor", {})
    cell_alignments = payload.get("cellAlignments", {})
    cell_wraps = payload.get("cellWraps", {})
    user_profile = payload.get("userProfile", {})

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = (title[:31] if title else "Sheet1")

    # --- Page Setup ---
    paper_map = {"a4": 9, "letter": 1, "legal": 5}  # openpyxl page size codes
    ws.page_setup.paperSize = paper_map.get(paper_size_name, 9)
    ws.page_setup.orientation = orientation_name
    ws.page_setup.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0

    # --- Styles ---
    accent_color = "6366F1"  # Indigo
    header_fill = PatternFill(start_color=accent_color, end_color=accent_color, fill_type="solid")
    header_font = Font(name="Calibri", bold=True, color="FFFFFF", size=11)
    thin_border = Border(
        left=Side(style="thin", color="E2E8F0"),
        right=Side(style="thin", color="E2E8F0"),
        top=Side(style="thin", color="E2E8F0"),
        bottom=Side(style="thin", color="E2E8F0"),
    )
    center_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
    left_align = Alignment(horizontal="left", vertical="center", wrap_text=True)

    start_row = 1

    # --- Logo / Title Header Row ---
    if include_logo:
        # Merge first row for title banner
        max_col = max(len(headers_list), 1)
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=max_col)
        banner_cell = ws.cell(row=1, column=1)
        banner_cell.value = "Stellura — Data Vision Studio  |  स्टेल्यूरा"
        banner_cell.font = Font(name="Calibri", bold=True, size=13, color="4338CA")
        banner_cell.alignment = Alignment(horizontal="center", vertical="center")
        banner_cell.fill = PatternFill(start_color="EEF2FF", end_color="EEF2FF", fill_type="solid")
        ws.row_dimensions[1].height = 22
        # Title row
        ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=max_col)
        title_cell = ws.cell(row=2, column=1)
        title_cell.value = title
        title_cell.font = Font(name="Calibri", bold=True, size=11, color="1E293B")
        title_cell.alignment = Alignment(horizontal="left", vertical="center")
        ws.row_dimensions[2].height = 18
        start_row = 3

    # --- Write Headers ---
    header_row_idx = start_row
    for col_idx, header in enumerate(headers_list, start=1):
        cell = ws.cell(row=header_row_idx, column=col_idx, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = center_align
        cell.border = thin_border
    ws.row_dimensions[header_row_idx].height = 18

    # --- Write Data Rows ---
    for row_idx_0, row in enumerate(data):
        excel_row = row_idx_0 + header_row_idx + 1
        for col_idx_0, value in enumerate(row):
            col_idx = col_idx_0 + 1
            cell = ws.cell(row=excel_row, column=col_idx, value=value)
            cell.border = thin_border

            cf_key = f"{row_idx_0}:{col_idx_0}"

            # Determine font properties
            fn = cell_fonts.get(cf_key, "Calibri")
            if fn in ("Krutidev 010", "Devlys 010", "Mangal"):
                fn = "Mangal"  # Best available for Hindi in Excel
            is_bold = bool(cell_bold.get(cf_key))
            is_italic = bool(cell_italic.get(cf_key))
            is_underline = "single" if cell_underline.get(cf_key) else None
            fs = int(cell_font_sizes.get(cf_key, 11))
            fc = cell_font_colors.get(cf_key, "000000").lstrip("#")

            cell.font = Font(name=fn, bold=is_bold, italic=is_italic,
                             underline=is_underline, size=fs, color=fc)

            # Background color (conditional formatting overrides bg)
            bg = cell_bg_colors.get(cf_key, "").lstrip("#")
            if cf_key in cf_colors:
                bg = cf_colors[cf_key].lstrip("#")
            if bg and bg not in ("ffffff", "FFFFFF", ""):
                cell.fill = PatternFill(start_color=bg, end_color=bg, fill_type="solid")
            elif row_idx_0 % 2 == 1:  # Alternate row
                cell.fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")

            # Alignment
            align = cell_alignments.get(cf_key, "left")
            wrap = bool(cell_wraps.get(cf_key))
            cell.alignment = Alignment(horizontal=align, vertical="center", wrap_text=wrap)

    # --- Auto-fit Column Widths ---
    for col_idx in range(1, len(headers_list) + 1):
        max_len = len(str(headers_list[col_idx - 1])) if col_idx <= len(headers_list) else 8
        for row_idx in range(header_row_idx + 1, len(data) + header_row_idx + 1):
            cell_val = ws.cell(row=row_idx, column=col_idx).value
            if cell_val is not None:
                max_len = max(max_len, len(str(cell_val)))
        ws.column_dimensions[get_column_letter(col_idx)].width = min(max_len + 4, 50)

    # --- Freeze Header Row ---
    if freeze_header:
        freeze_cell = f"A{header_row_idx + 1}"
        ws.freeze_panes = freeze_cell

    # --- User Profile Footer ---
    if include_profile and user_profile:
        footer_row = len(data) + header_row_idx + 2
        max_col = max(len(headers_list), 1)
        ws.merge_cells(start_row=footer_row, start_column=1, end_row=footer_row, end_column=max_col)
        name = user_profile.get("name", "")
        desig = user_profile.get("desig", "")
        org = user_profile.get("org", "")
        date_str = datetime.now().strftime("%d %b %Y")
        footer_parts = [p for p in [name, desig, org] if p]
        footer_text = "  |  ".join(footer_parts) + (f"  |  Date: {date_str}" if date_str else "")
        fc = ws.cell(row=footer_row, column=1)
        fc.value = footer_text
        fc.font = Font(name="Calibri", italic=True, size=8, color="94A3B8")
        fc.alignment = Alignment(horizontal="center", vertical="center")
        fc.fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
        ws.row_dimensions[footer_row].height = 14

    # --- Save to BytesIO and return ---
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    safe_name = re.sub(r'[^\w\s-]', '', filename_base or title or "export").strip().replace(" ", "_")
    dl_filename = f"{safe_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"

    return (
        output.read(),
        dl_filename,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@app.route("/api/export/excel", methods=["POST"])
def export_excel():
    """Accept JSON data and return a styled .xlsx file download. Supports async mode."""
    try:
        payload = request.get_json(force=True)
    except Exception:
        return jsonify({"error": "Invalid JSON body."}), 400

    if payload.get("async") and len(payload.get("data", [])) >= 1000:
        job_id = str(uuid.uuid4())
        with _jobs_lock:
            _export_jobs[job_id] = {'status': 'running'}
        t = threading.Thread(target=_run_export_job, args=(job_id, _build_excel, payload), daemon=True)
        t.start()
        return jsonify({"job_id": job_id})

    try:
        data_bytes, filename, mimetype = _build_excel(payload)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    return send_file(
        io.BytesIO(data_bytes),
        mimetype=mimetype,
        as_attachment=True,
        download_name=filename,
    )


# ---------------------------------------------------------------------------
# PDF Export API
# ---------------------------------------------------------------------------

def _build_pdf(payload):
    """Build PDF and return (bytes, filename, mimetype)."""
    headers_list = payload.get("headers", [])
    data = payload.get("data", [])
    title = payload.get("title", "Data Report")
    page_size_name = payload.get("pageSize", "a4").lower()
    orientation = payload.get("orientation", "landscape").lower()
    margins_name = payload.get("margins", "normal").lower()
    cf_colors = payload.get("conditionalFormatting", {})
    cell_bg_colors = payload.get("cellBgColor", {})
    watermark_text = payload.get("watermark", "")
    include_logo = payload.get("includeLogo", True)
    include_profile = payload.get("includeProfile", True)
    user_profile = payload.get("userProfile", {})

    try:
        from reportlab.lib import colors as rl_colors
        from reportlab.lib.pagesizes import A4, LEGAL, LETTER, landscape as rl_landscape
        from reportlab.lib.units import mm, inch
        from reportlab.platypus import (
            SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        )
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.pdfgen import canvas as rl_canvas
    except ImportError:
        return jsonify({"error": "reportlab is not installed. Run: pip install reportlab"}), 500

    # --- Page size ---
    page_sizes = {"a4": A4, "legal": LEGAL, "letter": LETTER}
    page_size = page_sizes.get(page_size_name, A4)
    if orientation == "landscape":
        page_size = rl_landscape(page_size)

    # --- Margins ---
    margin_map = {"normal": 12, "narrow": 6, "wide": 20}
    margin_mm = margin_map.get(margins_name, 12)
    top_margin = 18 if include_logo else 15

    # --- Register Hindi font ---
    has_hindi_font = _register_hindi_font()
    base_font = "HindiFont" if has_hindi_font else "Helvetica"
    bold_font = "HindiFont" if has_hindi_font else "Helvetica-Bold"

    # --- Check if any data contains Devanagari ---
    needs_hindi = False
    if has_hindi_font:
        for row in data:
            for cell in row:
                if _contains_devanagari(str(cell)):
                    needs_hindi = True
                    break
            if needs_hindi:
                break
        if _contains_devanagari(title):
            needs_hindi = True

    if needs_hindi and not has_hindi_font:
        print("  [WARN] Hindi text detected but no Devanagari font available.")

    # --- Styles ---
    styles = getSampleStyleSheet()
    accent_hex = "#6366F1"
    accent_dark = "#4F46E5"

    title_style = ParagraphStyle(
        "CustomTitle", parent=styles["Title"],
        fontName=bold_font, fontSize=16, spaceAfter=4 * mm,
        textColor=rl_colors.HexColor(accent_hex),
    )
    subtitle_style = ParagraphStyle(
        "CustomSubtitle", parent=styles["Normal"],
        fontName=base_font, fontSize=8.5,
        textColor=rl_colors.HexColor("#64748B"), spaceAfter=3 * mm,
    )
    cell_style = ParagraphStyle(
        "CellStyle", parent=styles["Normal"],
        fontName=base_font, fontSize=7, leading=9, wordWrap="CJK",
    )
    header_cell_style = ParagraphStyle(
        "HeaderCellStyle", parent=styles["Normal"],
        fontName=bold_font, fontSize=8, leading=10,
        textColor=rl_colors.white, wordWrap="CJK",
    )
    footer_style = ParagraphStyle(
        "FooterStyle", parent=styles["Normal"],
        fontName=base_font, fontSize=7,
        textColor=rl_colors.HexColor("#94A3B8"), alignment=1,
    )

    # --- Watermark callback ---
    def add_watermark(canvas_obj, doc_obj):
        if watermark_text:
            canvas_obj.saveState()
            canvas_obj.setFont(bold_font, 55)
            canvas_obj.setFillColorRGB(0, 0, 0, alpha=0.06)
            canvas_obj.translate(page_size[0] / 2, page_size[1] / 2)
            canvas_obj.rotate(45)
            canvas_obj.drawCentredString(0, 0, watermark_text)
            canvas_obj.restoreState()
        if include_logo:
            canvas_obj.saveState()
            canvas_obj.setFillColor(rl_colors.HexColor(accent_hex))
            canvas_obj.roundRect(margin_mm * mm, page_size[1] - (margin_mm + 8) * mm,
                                 80, 16, 4, fill=1, stroke=0)
            canvas_obj.setFillColor(rl_colors.white)
            canvas_obj.setFont(bold_font, 8)
            canvas_obj.drawString(margin_mm * mm + 4, page_size[1] - (margin_mm + 4) * mm,
                                  "Stellura — Data Vision Studio")
            canvas_obj.restoreState()

    # --- Build PDF ---
    output = io.BytesIO()
    doc = SimpleDocTemplate(
        output, pagesize=page_size,
        leftMargin=margin_mm * mm, rightMargin=margin_mm * mm,
        topMargin=(top_margin + (8 if include_logo else 0)) * mm,
        bottomMargin=(margin_mm + (12 if include_profile and user_profile else 0)) * mm,
        title=title,
    )

    elements = []

    # --- Title block ---
    elements.append(Paragraph(title, title_style))
    row_count = len(data)
    col_count = len(headers_list)
    timestamp = datetime.now().strftime("%d %b %Y, %I:%M %p")
    subtitle_text = f"{row_count:,} rows × {col_count} columns  •  Generated: {timestamp}"
    elements.append(Paragraph(subtitle_text, subtitle_style))
    elements.append(Spacer(1, 2 * mm))

    # --- Build Table Data ---
    table_headers = [Paragraph(str(h), header_cell_style) for h in headers_list]
    table_data = [table_headers]

    for row_idx_0, row in enumerate(data):
        table_row = []
        for col_idx_0, cell_val in enumerate(row):
            text = str(cell_val) if cell_val is not None else ""
            text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            # Apply cell-level background color to style
            cf_key = f"{row_idx_0}:{col_idx_0}"
            table_row.append(Paragraph(text, cell_style))
        table_data.append(table_row)

    # --- Column widths ---
    avail_width = page_size[0] - 2 * margin_mm * mm
    col_width = max(avail_width / col_count, 18 * mm) if col_count > 0 else avail_width
    col_widths_list = [col_width] * col_count

    # --- Create Table ---
    table = Table(table_data, colWidths=col_widths_list, repeatRows=1)

    # --- Table Style ---
    style_commands = [
        ("BACKGROUND", (0, 0), (-1, 0), rl_colors.HexColor(accent_hex)),
        ("TEXTCOLOR", (0, 0), (-1, 0), rl_colors.white),
        ("FONTNAME", (0, 0), (-1, 0), bold_font),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ("TOPPADDING", (0, 0), (-1, 0), 6),
        ("FONTNAME", (0, 1), (-1, -1), base_font),
        ("FONTSIZE", (0, 1), (-1, -1), 7),
        ("TOPPADDING", (0, 1), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("GRID", (0, 0), (-1, -1), 0.5, rl_colors.HexColor("#E2E8F0")),
        ("LINEBELOW", (0, 0), (-1, 0), 1.5, rl_colors.HexColor(accent_dark)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1),
         [rl_colors.white, rl_colors.HexColor("#F8FAFC")]),
    ]

    # Apply conditional formatting colours
    for key, color_hex in cf_colors.items():
        try:
            parts = key.split(":")
            r_idx, c_idx = int(parts[0]), int(parts[1])
            table_row_idx = r_idx + 1
            if 0 <= c_idx < col_count and table_row_idx < len(table_data):
                style_commands.append(
                    ("BACKGROUND", (c_idx, table_row_idx), (c_idx, table_row_idx),
                     rl_colors.HexColor(color_hex if color_hex.startswith('#') else f'#{color_hex}'))
                )
        except (ValueError, IndexError):
            continue

    # Apply cell background colors
    for key, color_hex in cell_bg_colors.items():
        try:
            parts = key.split(":")
            r_idx, c_idx = int(parts[0]), int(parts[1])
            table_row_idx = r_idx + 1
            if 0 <= c_idx < col_count and table_row_idx < len(table_data):
                if key not in cf_colors:  # CF takes priority
                    style_commands.append(
                        ("BACKGROUND", (c_idx, table_row_idx), (c_idx, table_row_idx),
                         rl_colors.HexColor(color_hex if color_hex.startswith('#') else f'#{color_hex}'))
                    )
        except (ValueError, IndexError):
            continue

    table.setStyle(TableStyle(style_commands))
    elements.append(table)

    # --- User Profile Footer ---
    if include_profile and user_profile:
        elements.append(Spacer(1, 4 * mm))
        name = user_profile.get("name", "")
        desig = user_profile.get("desig", "")
        org = user_profile.get("org", "")
        date_str = datetime.now().strftime("%d %b %Y")
        parts = [p for p in [name, desig, org] if p]
        footer_text = "  |  ".join(parts) + (f"  |  {date_str}" if parts else date_str)
        elements.append(Paragraph(footer_text, footer_style))

    elements.append(Spacer(1, 3 * mm))
    elements.append(Paragraph(
        "Generated by Stellura (स्टेल्यूरा)  |  Developed by Neeraj Purohit, Senior Assistant, Rajasthan Police",
        footer_style,
    ))

    # --- Build PDF with watermark/logo callback ---
    doc.build(
        elements,
        onFirstPage=add_watermark,
        onLaterPages=add_watermark,
    )
    output.seek(0)

    safe_title = re.sub(r'[^\w\s-]', '', title or "report").strip().replace(" ", "_")
    dl_filename = f"{safe_title}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"

    return (output.read(), dl_filename, "application/pdf")


@app.route("/api/export/pdf", methods=["POST"])
def export_pdf():
    """Accept JSON data and return a styled PDF file download. Supports async mode."""
    try:
        payload = request.get_json(force=True)
    except Exception:
        return jsonify({"error": "Invalid JSON body."}), 400

    if payload.get("async") and len(payload.get("data", [])) >= 1000:
        job_id = str(uuid.uuid4())
        with _jobs_lock:
            _export_jobs[job_id] = {'status': 'running'}
        t = threading.Thread(target=_run_export_job, args=(job_id, _build_pdf, payload), daemon=True)
        t.start()
        return jsonify({"job_id": job_id})

    try:
        data_bytes, filename, mimetype = _build_pdf(payload)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    return send_file(
        io.BytesIO(data_bytes),
        mimetype=mimetype,
        as_attachment=True,
        download_name=filename,
    )


@app.route("/api/export/status/<job_id>")
def export_status(job_id):
    """Poll async export job status. Returns the file when ready."""
    with _jobs_lock:
        job = _export_jobs.get(job_id)
    if not job:
        return jsonify({"status": "not_found"}), 404
    if job['status'] == 'done':
        data_bytes, filename, mimetype = job['result']
        with _jobs_lock:
            del _export_jobs[job_id]
        return send_file(
            io.BytesIO(data_bytes),
            mimetype=mimetype,
            as_attachment=True,
            download_name=filename,
        )
    return jsonify({"status": job['status'], "error": job.get('error', '')})


@app.route("/api/export/dashboard-html", methods=["POST"])
def export_dashboard_html():
    """Generate a self-contained offline-shareable interactive HTML dashboard."""
    try:
        payload = request.get_json(force=True)
    except Exception:
        return jsonify({"error": "Invalid JSON body."}), 400

    headers_list = payload.get("headers", [])
    data = payload.get("data", [])
    title = payload.get("title", "Analysis Report")
    chart_config = payload.get("chartConfig", {})
    kpis = payload.get("kpis", [])
    cf_colors = payload.get("conditionalFormatting", {})
    user_profile = payload.get("userProfile", {})
    accent_color = payload.get("accentColor", "#6366f1")

    # Only allow valid hex colours to prevent injection into CSS
    if not re.match(r'^#[0-9a-fA-F]{3,8}$', accent_color):
        accent_color = "#6366f1"

    safe_headers = json.dumps(headers_list, ensure_ascii=False)
    safe_data = json.dumps(data, ensure_ascii=False)
    safe_kpis = json.dumps(kpis, ensure_ascii=False)
    safe_cf = json.dumps(cf_colors, ensure_ascii=False)
    safe_chart = json.dumps(chart_config, ensure_ascii=False)

    chartjs_src = _get_chartjs_inline()
    chartjs_block = (
        f"<script>{chartjs_src}</script>" if chartjs_src
        else f'<script src="{_CHARTJS_CDN}"></script>'
    )

    user_name = user_profile.get("name", "")
    user_desig = user_profile.get("desig", "")
    user_org = user_profile.get("org", "")
    footer_parts = [p for p in [user_name, user_desig, user_org] if p]
    footer_text = "  |  ".join(footer_parts)
    generated_date = datetime.now().strftime("%d %B %Y, %I:%M %p")

    html_content = _build_dashboard_html(
        title=title,
        accent=accent_color,
        row_count=len(data),
        col_count=len(headers_list),
        gen_date=generated_date,
        chartjs_block=chartjs_block,
        s_headers=safe_headers,
        s_data=safe_data,
        s_kpis=safe_kpis,
        s_cf=safe_cf,
        s_chart=safe_chart,
        footer_text=footer_text,
    )

    safe_title = re.sub(r'[^\w\s-]', '', title or "report").strip().replace(" ", "_")
    dl_filename = f"{safe_title}_interactive_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html"

    return send_file(
        io.BytesIO(html_content.encode('utf-8')),
        mimetype="text/html",
        as_attachment=True,
        download_name=dl_filename,
    )


# ---------------------------------------------------------------------------
# Ollama Local AI  (Patch 9)
# ---------------------------------------------------------------------------

OLLAMA_BASE  = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
# Default: Qwen2.5-Instruct (Apache-2.0 license — safe for commercial/govt use).
# Override via .env: OLLAMA_MODEL=qwen2.5:3b  (low-RAM)  or  qwen2.5:14b  (high-RAM)
# DO NOT use gemma3 — Google Gemma Terms restrict commercial products.
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:7b")


def _build_data_prompt(headers_list, col_types, sample_data, output_lang):
    col_info = "\n".join(
        f'- "{h}" (type: {col_types[i] if i < len(col_types) else "text"})'
        for i, h in enumerate(headers_list)
    )
    sample_str = "\n".join(str(row) for row in sample_data[:5])
    lang_rule = {
        "hi":   "Always respond in Hindi (हिंदी में जवाब दें).",
        "en":   "Always respond in English.",
        "auto": "Detect the query language and reply in the same language.",
    }.get(output_lang, "Detect the query language and reply in the same language.")

    return f"""You are Stellura, a data analysis assistant for Indian government spreadsheets.
{lang_rule}

Available columns:
{col_info}

Sample data (first 5 rows):
{sample_str}

Respond with ONLY valid JSON (no markdown fences) in exactly this structure:
{{
  "intent": "filter"|"sort"|"stats"|"highlight"|"chart"|"summarize"|"unknown",
  "explanation": "Brief answer in the detected language (2-3 sentences)",
  "action": {{
    "column": "exact column name",
    "operator": ">"|"<"|"="|"contains"|"between",
    "value": value_or_string,
    "value2": second_value_for_between,
    "direction": "asc"|"desc",
    "operation": "sum"|"average"|"max"|"min"|"count",
    "color": "#hexcolor",
    "xColumn": "exact column name",
    "yColumn": "exact column name",
    "type": "bar"|"line"|"pie"
  }}
}}
Column names MUST exactly match the list above. Never invent column names."""


def _strip_fences(text):
    return re.sub(r'^```[a-z]*\s*|\s*```$', '', text.strip()).strip()


def _call_ollama(system_prompt, user_msg, num_predict=600):
    """Send a chat request to local Ollama service."""
    import requests as req
    try:
        r = req.post(
            f"{OLLAMA_BASE}/api/chat",
            json={
                "model": OLLAMA_MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user",   "content": user_msg}
                ],
                "stream": False,
                "options": {"temperature": 0.1, "num_predict": num_predict}
            },
            timeout=60
        )
        r.raise_for_status()
        return _strip_fences(r.json()["message"]["content"])
    except req.exceptions.ConnectionError:
        raise RuntimeError("Ollama service is not running. Restart Stellura using start.bat.")
    except req.exceptions.Timeout:
        raise RuntimeError("Ollama took too long to respond. Try a simpler query.")


@app.route("/api/ai/query", methods=["POST"])
def ai_query():
    """Send a natural language query to the local Ollama LLM."""
    try:
        payload = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    user_query = payload.get("query", "").strip()
    if not user_query:
        return jsonify({"error": "Empty query"}), 400

    out_lang     = payload.get("outputLanguage", "auto")
    headers_list = payload.get("headers", [])
    col_types    = payload.get("colTypes", [])
    sample_data  = payload.get("sampleData", [])[:5]

    system = _build_data_prompt(headers_list, col_types, sample_data, out_lang)

    try:
        raw    = _call_ollama(system, user_query)
        result = json.loads(raw)
        result["source"] = "ollama"
        return jsonify(result)
    except json.JSONDecodeError:
        return jsonify({"error": "AI returned malformed response. Please try again."}), 502
    except RuntimeError as ex:
        return jsonify({"error": "ollama_unavailable", "message": str(ex)}), 503
    except Exception as ex:
        return jsonify({"error": "ai_error", "message": str(ex)}), 500


@app.route("/api/ollama/status")
def ollama_status():
    """Check if Ollama is running and report which model is active."""
    import requests as req
    try:
        r = req.get(f"{OLLAMA_BASE}/api/tags", timeout=3)
        if r.status_code == 200:
            models = [m["name"] for m in r.json().get("models", [])]
            active = OLLAMA_MODEL if OLLAMA_MODEL in models else (models[0] if models else OLLAMA_MODEL)
            return jsonify({"status": "running", "model": active, "models": models})
        return jsonify({"status": "error"}), 502
    except Exception:
        return jsonify({"status": "offline"}), 503


# ---------------------------------------------------------------------------
# Batch 8 — AI Pipeline Planner  (/api/ai/plan)
# ---------------------------------------------------------------------------

_PLANNER_MODULE_CATALOG = (
    "average: mean of a column | sum: total | count: non-empty entries | "
    "min: minimum value | max: maximum value | median: middle value | "
    "mode: most frequent | stddev: standard deviation | range: max minus min | "
    "missing: find empty rows | duplicates: find repeated values | "
    "unique: count distinct values | outliers_iqr: detect outliers | "
    "dtype_check: verify column data types | trim_clean: clean text whitespace | "
    "linreg_project: forecast next k values (config needs k as integer) | "
    "moving_avg: rolling average (config needs window as integer) | "
    "growth_rate: period-over-period growth rate | trend: detect rising/falling/flat"
)


def _build_plan_prompt(headers_list, col_types):
    col_info = ", ".join(
        '"{}" ({})'.format(h, col_types[i] if i < len(col_types) else "text")
        for i, h in enumerate(headers_list)
    )
    col_names = json.dumps(headers_list)
    return (
        "You are a pipeline planner for Stellura spreadsheet analysis.\n\n"
        "Dataset columns: {col_info}\n\n"
        "Modules (id: purpose):\n{catalog}\n\n"
        "Output ONLY a JSON object — no prose, no markdown fences.\n"
        'Schema: {{"nodes":[{{"moduleId":"<id>","config":{{"col":"<exact_column_name>"}}}}...],'
        '"edges":[[fromIndex,toIndex]...]}}\n\n'
        "Rules:\n"
        "- moduleId must be one of the IDs listed above.\n"
        "- col must exactly match one of: {col_names}\n"
        "- edges are 0-based indices into the nodes array.\n"
        "- For linreg_project add k in config e.g. {{\"col\":\"X\",\"k\":3}}\n"
        "- For moving_avg add window in config e.g. {{\"col\":\"X\",\"window\":3}}\n"
        "- Chain analysis->predict with an edge so the predict node uses upstream series.\n\n"
        'Example 1 – "average of Salary and predict next 3 months":\n'
        'Columns: ["Name","Department","Salary"]\n'
        '{{"nodes":[{{"moduleId":"average","config":{{"col":"Salary"}}}},'
        '{{"moduleId":"linreg_project","config":{{"col":"Salary","k":3}}}}],"edges":[[0,1]]}}\n\n'
        'Example 2 – "check missing and outliers in Age":\n'
        'Columns: ["Name","Age","City"]\n'
        '{{"nodes":[{{"moduleId":"missing","config":{{"col":"Age"}}}},'
        '{{"moduleId":"outliers_iqr","config":{{"col":"Age"}}}}],"edges":[]}}\n\n'
        "Now output ONLY JSON for this request:"
    ).format(col_info=col_info, catalog=_PLANNER_MODULE_CATALOG, col_names=col_names)


def _extract_plan_json(text):
    """Extract the first syntactically valid JSON object from model output."""
    depth = 0
    start = None
    for i, ch in enumerate(text):
        if ch == '{':
            if start is None:
                start = i
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0 and start is not None:
                candidate = text[start:i + 1]
                try:
                    return json.loads(candidate)
                except (json.JSONDecodeError, ValueError):
                    start = None
                    depth = 0
    return None


@app.route("/api/ai/plan", methods=["POST"])
def ai_plan():
    """Build an analysis pipeline plan from a natural language query."""
    try:
        payload = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    query        = payload.get("query", "").strip()
    headers_list = payload.get("headers", [])
    col_types    = payload.get("colTypes", [])

    if not query:
        return jsonify({"error": "Empty query"}), 400
    if not headers_list:
        return jsonify({"error": "no_data", "message": "Load data first / पहले डेटा लोड करें"}), 400

    system = _build_plan_prompt(headers_list, col_types)

    try:
        raw  = _call_ollama(system, query, num_predict=900)
        plan = _extract_plan_json(raw)
        if not plan or not isinstance(plan.get("nodes"), list):
            return jsonify({"error": "empty_plan", "raw": raw[:300]}), 502
        plan.setdefault("edges", [])
        return jsonify(plan)
    except RuntimeError as ex:
        return jsonify({"error": "ollama_unavailable", "message": str(ex)}), 503
    except Exception as ex:
        return jsonify({"error": "ai_error", "message": str(ex)}), 500


# ---------------------------------------------------------------------------
# Batch 9 — Grounded Report Slots  (/api/ai/report-slots)
# ---------------------------------------------------------------------------

def _compute_report_facts(headers_list, data, col_types=None):
    """Compact, verifiable facts dict — the only numbers the LLM may cite."""
    nrows   = len(data)
    ncols   = len(headers_list)
    total_c = nrows * ncols
    empty_c = sum(1 for row in data for v in row
                  if v is None or str(v).strip() == "")
    pct     = round((total_c - empty_c) / total_c * 100, 1) if total_c else 100.0

    num_cols = []
    for ci, h in enumerate(headers_list):
        vals = _get_col_vals(data, ci)
        if vals and len(vals) >= max(int(nrows * 0.25), 2):
            s = sum(vals)
            num_cols.append({
                "name":  h,
                "count": len(vals),
                "sum":   round(s, 2),
                "avg":   round(s / len(vals), 2),
                "min":   round(min(vals), 2),
                "max":   round(max(vals), 2),
            })

    return {
        "rows":             nrows,
        "cols":             ncols,
        "completeness_pct": pct,
        "empty_cells":      empty_c,
        "total_cells":      total_c,
        "numeric_cols":     num_cols,
    }


def _facts_to_numbers(facts):
    """Return a flat set of numeric values (multiple roundings) present in facts."""
    allowed = set()

    def add(v):
        try:
            f = float(str(v).replace(",", "").strip())
            allowed.add(f)
            allowed.add(round(f, 1))
            allowed.add(round(f, 0))
            allowed.add(float(int(round(f, 0))))
        except (ValueError, TypeError):
            pass

    for key in ("rows", "cols", "completeness_pct", "empty_cells", "total_cells"):
        add(facts.get(key, 0))
    for nc in facts.get("numeric_cols", []):
        for key in ("count", "sum", "avg", "min", "max"):
            add(nc.get(key, 0))
    return allowed


def _validate_slot(text, allowed_nums):
    """Drop any sentence whose numbers are not grounded in allowed_nums."""
    sentences = re.split(r"(?<=[.!?।])\s+", text.strip())
    clean = []
    for sent in sentences:
        nums = re.findall(r"\b\d[\d,]*(?:\.\d+)?\b", sent)
        ok = True
        for ns in nums:
            try:
                val = float(ns.replace(",", ""))
                tol = max(abs(val) * 0.01, 1.0)
                if not any(abs(val - a) <= tol for a in allowed_nums):
                    ok = False
                    break
            except ValueError:
                pass
        if ok:
            clean.append(sent)
    return " ".join(clean).strip()


_SLOT_DESCS = {
    "summary": (
        "Write exactly 2 sentences: an executive summary mentioning "
        "the row count, column count, and completeness percentage."
    ),
    "findings": (
        "Write exactly 3 bullet points (each starting with •) about: "
        "data completeness, the highest-sum numeric column, and one quality note."
    ),
    "recommendations": (
        "Write exactly 2 concrete action recommendations "
        "each referencing a specific number from the facts."
    ),
}


def _build_slot_prompt(slot, facts, language):
    lang_rule = {"hi": "Write ONLY in Hindi (हिंदी में लिखें).",
                 "en": "Write ONLY in English."}.get(language, "Write ONLY in English.")
    return (
        "You are writing a structured slot for a government data report.\n"
        f"{lang_rule}\n\n"
        "GROUNDED FACTS — use ONLY these numbers, never invent or modify them:\n"
        f"{json.dumps(facts, ensure_ascii=False)}\n\n"
        f"Task: {_SLOT_DESCS.get(slot, 'Write one analytical sentence.')}\n\n"
        "Rules:\n"
        "- Maximum 60 words.\n"
        "- Every number MUST appear in GROUNDED FACTS above.\n"
        "- No markdown, headers, asterisks, or JSON.\n"
        "- Output ONLY plain prose.\n\nWrite now:"
    )


@app.route("/api/ai/report-slots", methods=["POST"])
def ai_report_slots():
    """Generate grounded, post-validated prose slots for the PDF report."""
    try:
        payload = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    headers_list = payload.get("headers", [])
    data         = payload.get("data",    [])[:500]
    col_types    = payload.get("colTypes", [])
    language     = payload.get("language", "en")

    if not headers_list or not data:
        return jsonify({"error": "no_data",
                        "message": "Load data first / पहले डेटा लोड करें"}), 400

    try:
        facts   = _compute_report_facts(headers_list, data, col_types)
        allowed = _facts_to_numbers(facts)
        slots   = {}
        for slot in ("summary", "findings", "recommendations"):
            try:
                raw         = _call_ollama(_build_slot_prompt(slot, facts, language),
                                           f"Generate the {slot}.", num_predict=220)
                slots[slot] = _validate_slot(raw, allowed)
            except RuntimeError:
                raise
            except Exception:
                slots[slot] = ""
        return jsonify({"slots": slots, "facts": facts})
    except RuntimeError as ex:
        return jsonify({"error": "ollama_unavailable", "message": str(ex)}), 503
    except Exception as ex:
        return jsonify({"error": "ai_error", "message": str(ex)}), 500


# ---------------------------------------------------------------------------
# Batch 19 — Cognition Engine  (/api/ai/cognition/plan + /draft)
# ---------------------------------------------------------------------------

def _build_cognition_plan_prompt(headers_list, col_types):
    col_info = ", ".join(
        '"{}" ({})'.format(h, col_types[i] if i < len(col_types) else "text")
        for i, h in enumerate(headers_list)
    )
    return (
        "You are a decomposition engine for Stellura data analysis.\n\n"
        "Dataset columns: " + col_info + "\n\n"
        "Break the user's question into at most 6 small, ordered sub-questions. "
        "Each sub-question must be answerable from the data columns listed above. "
        "Reference actual column names in every step.\n\n"
        'Output ONLY a JSON object — no prose, no markdown fences:\n'
        '{"steps":["step 1 question?","step 2 question?",...]}\n\n'
        "Rules:\n"
        "- Maximum 6 steps\n"
        "- Each step is ONE focused question\n"
        "- Steps must be ordered so earlier answers inform later steps\n"
        "- Use exact column names from the dataset\n"
        "Now output ONLY JSON:"
    )


def _build_cognition_draft_prompt(step_q, evidence, lang):
    lang_rule = (
        "Write ONLY in Hindi (हिंदी में लिखें)." if lang == "hi"
        else "Write ONLY in English."
    )
    ev_str = json.dumps(evidence, ensure_ascii=False)
    return (
        "You are narrating ONE step of a data analysis for a government report.\n"
        f"{lang_rule}\n\n"
        f"STEP QUESTION: {step_q}\n\n"
        "EVIDENCE — use ONLY these pre-computed facts; never invent or alter numbers:\n"
        f"{ev_str}\n\n"
        "Rules:\n"
        '- If the evidence object is empty {}, or has no numeric facts relevant to the '
        'question, reply with EXACTLY this single word: INSUFFICIENT\n'
        "- Otherwise write 1-2 plain sentences using ONLY numbers from EVIDENCE.\n"
        "- Never use the word 'causes' — use 'associated with' instead.\n"
        "- No markdown, no bullets, no headers.\n"
        "- Maximum 40 words.\n\n"
        "Answer:"
    )


@app.route("/api/ai/cognition/plan", methods=["POST"])
def cognition_plan():
    """Decompose a user task into ordered grounded sub-questions (max 6)."""
    try:
        payload = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    task         = payload.get("task", "").strip()
    headers_list = payload.get("headers", [])
    col_types    = payload.get("colTypes", [])

    if not task:
        return jsonify({"error": "Empty task"}), 400
    if not headers_list:
        return jsonify({"error": "no_data",
                        "message": "Load data first / पहले डेटा लोड करें"}), 400

    system = _build_cognition_plan_prompt(headers_list, col_types)
    try:
        raw  = _call_ollama(system, task, num_predict=350)
        obj  = _extract_plan_json(raw)
        raw_steps = obj.get("steps", []) if obj else []
        # Validate: list of non-empty strings, cap at 6
        steps = [str(s).strip() for s in raw_steps
                 if s and str(s).strip()][:6]
        if not steps:
            steps = [task]   # fallback: single-step = original task
        return jsonify({"steps": steps})
    except RuntimeError as ex:
        return jsonify({"error": "ollama_unavailable", "message": str(ex)}), 503
    except Exception as ex:
        return jsonify({"error": "ai_error", "message": str(ex)}), 500


@app.route("/api/ai/cognition/draft", methods=["POST"])
def cognition_draft():
    """Draft the answer for ONE grounded step. Returns INSUFFICIENT when evidence is absent."""
    try:
        payload = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    step_q   = payload.get("q", "").strip()
    evidence = payload.get("evidence", {})
    lang     = payload.get("lang", "en")

    if not step_q:
        return jsonify({"error": "Empty step"}), 400

    system = _build_cognition_draft_prompt(step_q, evidence, lang)
    try:
        raw     = _call_ollama(system, "Answer this step.", num_predict=180)
        answer  = raw.strip()
        supported = answer.upper() != "INSUFFICIENT"
        if not supported:
            answer = "INSUFFICIENT"
        return jsonify({"answer": answer, "supported": supported})
    except RuntimeError as ex:
        return jsonify({"error": "ollama_unavailable", "message": str(ex)}), 503
    except Exception as ex:
        return jsonify({"error": "ai_error", "message": str(ex)}), 500


# ---------------------------------------------------------------------------
# Batch 20 — Verification / Hallucination Guard  (/cognition/verify + /sample)
# ---------------------------------------------------------------------------

def _build_verify_prompt(step_q, answer, evidence, lang):
    lang_rule = "Write ONLY in Hindi." if lang == "hi" else "Write ONLY in English."
    ev_str = json.dumps(evidence, ensure_ascii=False)
    return (
        "You are a fact-checker for a government data analysis report.\n"
        f"{lang_rule}\n\n"
        f"STEP QUESTION: {step_q}\n\n"
        "EVIDENCE (pre-computed facts — these are the only true numbers):\n"
        f"{ev_str}\n\n"
        "DRAFT ANSWER TO CHECK:\n"
        f"{answer}\n\n"
        "For each sentence in DRAFT ANSWER, check if its claims and numbers are directly "
        "supported by a value in EVIDENCE.\n\n"
        'Output ONLY a JSON object — no prose, no markdown:\n'
        '{"score":0.0-1.0,"verdict":"pass"|"partial"|"fail",'
        '"cleaned_answer":"...","note":"one short line"}\n\n'
        "Rules:\n"
        "- score: fraction of sentences whose numbers exactly appear in EVIDENCE\n"
        "- cleaned_answer: copy only sentences whose numbers are in EVIDENCE; "
        "  if none survive, write exactly INSUFFICIENT\n"
        "- Maximum 40 words in cleaned_answer\n"
        "- verdict pass: score >= 0.8; partial: 0.3-0.8; fail: < 0.3\n"
        "Now output ONLY JSON:"
    )


@app.route("/api/ai/cognition/verify", methods=["POST"])
def cognition_verify():
    """Critic LLM pass: check answer sentences against evidence, return cleaned answer + score."""
    try:
        payload = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    step_q   = payload.get("q", "").strip()
    answer   = payload.get("answer", "").strip()
    evidence = payload.get("evidence", {})
    lang     = payload.get("lang", "en")

    if not step_q or not answer:
        return jsonify({"score": 1.0, "verdict": "pass",
                        "cleaned_answer": answer, "note": ""})

    system = _build_verify_prompt(step_q, answer, evidence, lang)
    try:
        raw = _call_ollama(system, "Check this answer.", num_predict=260)
        obj = _extract_plan_json(raw)
        if not obj:
            # parse failed — return original answer with partial trust
            return jsonify({"score": 0.8, "verdict": "partial",
                            "cleaned_answer": answer, "note": "critic_parse_fail"})
        score   = float(obj.get("score", 1.0))
        score   = max(0.0, min(1.0, score))
        cleaned = (obj.get("cleaned_answer") or answer).strip() or answer
        return jsonify({"score": score, "verdict": obj.get("verdict", "pass"),
                        "cleaned_answer": cleaned, "note": obj.get("note", "")})
    except RuntimeError as ex:
        return jsonify({"error": "ollama_unavailable", "message": str(ex)}), 503
    except Exception as ex:
        # Non-fatal: return original answer
        return jsonify({"score": 1.0, "verdict": "pass",
                        "cleaned_answer": answer, "note": str(ex)})


@app.route("/api/ai/cognition/sample", methods=["POST"])
def cognition_sample():
    """Self-consistency: run the draft prompt n times, measure numeric agreement."""
    try:
        payload = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    step_q   = payload.get("q", "").strip()
    evidence = payload.get("evidence", {})
    lang     = payload.get("lang", "en")
    n        = min(int(payload.get("n", 2)), 3)

    if not step_q:
        return jsonify({"agreement": 1.0, "answers": []})

    system  = _build_cognition_draft_prompt(step_q, evidence, lang)
    answers = []
    for _ in range(n):
        try:
            answers.append(_call_ollama(system, "Answer this step.", num_predict=180).strip())
        except Exception:
            break

    if len(answers) < 2:
        return jsonify({"agreement": 1.0, "answers": answers})

    # Extract numeric sets from each answer
    num_pat = re.compile(r'\b\d[\d,]*(?:\.\d+)?\b')

    def nums(text):
        return {float(m.replace(',', '')) for m in num_pat.findall(text)}

    sets = [nums(a) for a in answers]
    base = sets[0]
    if not base:
        # No numbers: text similarity via common words
        from difflib import SequenceMatcher
        pairs = [(answers[i], answers[j])
                 for i in range(len(answers)) for j in range(i + 1, len(answers))]
        scores = [SequenceMatcher(None, a, b).ratio() for a, b in pairs]
        agreement = sum(scores) / len(scores) if scores else 1.0
    else:
        agreed = 0
        others = sets[1:]
        for n_val in base:
            tol = max(abs(n_val) * 0.02, 0.5)
            if any(any(abs(n_val - v) <= tol for v in s) for s in others):
                agreed += 1
        agreement = agreed / len(base)

    return jsonify({"agreement": round(agreement, 3), "answers": answers[:2]})


# ---------------------------------------------------------------------------
# Batch 21 — Tone Layer  (/api/ai/cognition/tone)
# ---------------------------------------------------------------------------

_TONE_PRESET_DESC = {
    "official":  "Official/Formal — precise, professional, active voice; suitable for government reports",
    "friendly":  "Friendly/Simple — warm, plain language, natural flow; like explaining to a colleague",
    "executive": "Executive-brief — maximum 2 crisp sentences; key numbers only; no elaboration",
}

_TONE_EXAMPLES = {
    "en": {
        "official": (
            "EXAMPLES — Official/Formal:\n"
            "Original: The sum is 450000 and avg is 37500.\n"
            "Rewritten: Total value stands at 4,50,000, with a per-record average of 37,500.\n\n"
            "Original: Department A has 5000 and Department B has 3200.\n"
            "Rewritten: Department A recorded 5,000 against Department B's 3,200."
        ),
        "friendly": (
            "EXAMPLES — Friendly/Simple:\n"
            "Original: The sum is 450000 and avg is 37500.\n"
            "Rewritten: Together, the entries total 4,50,000 — averaging 37,500 each.\n\n"
            "Original: Department A has 5000 and Department B has 3200.\n"
            "Rewritten: Department A leads with 5,000, while Department B comes in at 3,200."
        ),
        "executive": (
            "EXAMPLES — Executive-brief:\n"
            "Original: The sum is 450000 and avg is 37500.\n"
            "Rewritten: Total: 4,50,000 · Avg: 37,500.\n\n"
            "Original: Department A has 5000 and Department B has 3200.\n"
            "Rewritten: A: 5,000 | B: 3,200."
        ),
    },
    "hi": {
        "official": (
            "उदाहरण — आधिकारिक स्वर:\n"
            "मूल: sum 450000 है और avg 37500 है।\n"
            "पुनर्लिखित: कुल मूल्य 4,50,000 दर्ज है तथा प्रति अभिलेख औसत 37,500 रहा।\n\n"
            "मूल: Department A में 5000 और B में 3200 है।\n"
            "पुनर्लिखित: विभाग A में 5,000 तथा विभाग B में 3,200 का आँकड़ा दर्ज किया गया।"
        ),
        "friendly": (
            "उदाहरण — सरल/मैत्रीपूर्ण स्वर:\n"
            "मूल: sum 450000 है और avg 37500 है।\n"
            "पुनर्लिखित: सभी प्रविष्टियों का योग 4,50,000 बनता है — यानी हर एक का औसत 37,500 रहा।\n\n"
            "मूल: Department A में 5000 और B में 3200 है।\n"
            "पुनर्लिखित: विभाग A में 5,000 का आँकड़ा है, जबकि विभाग B में 3,200।"
        ),
        "executive": (
            "उदाहरण — संक्षिप्त/कार्यकारी स्वर:\n"
            "मूल: sum 450000 है और avg 37500 है।\n"
            "पुनर्लिखित: योग: 4,50,000 · औसत: 37,500\n\n"
            "मूल: Department A में 5000 और B में 3200 है।\n"
            "पुनर्लिखित: A: 5,000 | B: 3,200"
        ),
    },
}


def _build_tone_prompt(text, allowed_nums, preset, lang):
    lang_rule = (
        "Write ONLY in Hindi (हिंदी में लिखें). "
        "Use natural, conversational Hindi — not a literal translation."
        if lang == "hi" else
        "Write ONLY in English."
    )
    preset_desc = _TONE_PRESET_DESC.get(preset, _TONE_PRESET_DESC["friendly"])
    nums_str = ", ".join(
        str(int(n) if n == int(n) else n)
        for n in sorted({float(v) for v in allowed_nums if str(v).replace('.','',1).isdigit()})[:20]
    )
    examples = _TONE_EXAMPLES.get(lang, _TONE_EXAMPLES["en"]).get(
        preset, _TONE_EXAMPLES["en"]["friendly"]
    )
    return (
        "You are a professional report editor. Rewrite the given text for TONE ONLY.\n"
        f"{lang_rule}\n\n"
        f"VOICE PRESET: {preset_desc}\n\n"
        "HARD CONSTRAINT: Every number in your output MUST appear exactly as it is in the "
        "original. Do NOT add, change, round, or invent any number. "
        f"Allowed numbers: {nums_str}.\n\n"
        f"{examples}\n\n"
        "NOW REWRITE (tone only — zero new facts):\n"
        f"Original: {text}\n\n"
        "Rewritten:"
    )


@app.route("/api/ai/cognition/tone", methods=["POST"])
def cognition_tone():
    """Style-pass: rewrite verified draft for tone without altering any fact or number."""
    try:
        payload = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    text         = payload.get("text", "").strip()
    allowed_nums = payload.get("allowed_nums", [])
    preset       = payload.get("preset", "friendly")
    lang         = payload.get("lang", "en")

    if not text:
        return jsonify({"styled": text, "safe": True})

    system = _build_tone_prompt(text, allowed_nums, preset, lang)
    try:
        raw    = _call_ollama(system, "Rewrite now.", num_predict=350)
        styled = raw.strip()

        # Server-side number guard — reject if any new number appears
        num_pat  = re.compile(r"\b\d[\d,]*(?:\.\d+)?\b")
        orig_set = {float(m.replace(",", "")) for m in num_pat.findall(text)}
        out_set  = {float(m.replace(",", "")) for m in num_pat.findall(styled)}
        for n in out_set:
            tol = max(abs(n) * 0.02, 0.5)
            if not any(abs(n - o) <= tol for o in orig_set):
                return jsonify({"error": "hallucination", "original": text}), 200

        return jsonify({"styled": styled, "safe": True})
    except RuntimeError as ex:
        return jsonify({"error": "ollama_unavailable", "message": str(ex)}), 503
    except Exception as ex:
        return jsonify({"error": "tone_error", "message": str(ex)}), 500


# ---------------------------------------------------------------------------
# Report Generator  (Patch 10)
# ---------------------------------------------------------------------------

def _safe_float(v):
    """Convert value to float, return None if not numeric."""
    if v is None:
        return None
    try:
        return float(str(v).replace(',', '').strip())
    except (ValueError, TypeError):
        return None


def _get_col_vals(data, ci):
    """Return list of numeric values for column ci."""
    result = []
    for row in data:
        if ci < len(row):
            f = _safe_float(row[ci])
            if f is not None:
                result.append(f)
    return result


def _build_report_pdf(payload):
    """Build a multi-page professional PDF report."""
    import base64 as _b64
    try:
        from reportlab.lib import colors as RC
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
            PageBreak, HRFlowable,
        )
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
        from reportlab.lib.utils import ImageReader
    except ImportError:
        raise RuntimeError(
            "reportlab is not installed. Run: pip install reportlab"
        )

    # ── Extract payload
    hdrs     = payload.get("headers", [])
    data     = payload.get("data", [])
    logo_b64 = payload.get("logoBase64", "")
    company  = payload.get("companyName", "")
    title    = payload.get("reportTitle", "Data Analysis Report")
    prepared = payload.get("preparedFor", "")
    desc     = payload.get("description", "")
    lang     = payload.get("language", "en")
    incl_ai  = payload.get("includeAI", False)
    ai_data  = payload.get("aiInsights", {})

    # ── Fonts
    has_hindi = _register_hindi_font()
    BF        = "HindiFont" if has_hindi else "Helvetica"
    BFBD      = "HindiFont" if has_hindi else "Helvetica-Bold"

    # ── Colors
    ACCENT  = "#4F46E5"
    ACC_L   = "#EEF2FF"
    DARK    = "#1E293B"
    MUTED   = "#64748B"
    BORDER  = "#E2E8F0"
    RED     = "#EF4444"
    GREEN   = "#10B981"
    AMBER   = "#F59E0B"

    is_hi = (lang == "hi")

    def t(en, hi):
        return hi if is_hi else en

    # ── Computed values
    now      = datetime.now()
    gen_date = now.strftime("%d %B %Y")
    gen_time = now.strftime("%I:%M %p")
    nrows    = len(data)
    ncols    = len(hdrs)
    total_c  = nrows * ncols
    empty_c  = sum(1 for r in data for v in r
                   if v is None or str(v).strip() == "")
    pct_fill = (total_c - empty_c) / total_c * 100 if total_c else 100.0

    num_cols = []
    for ci, h in enumerate(hdrs):
        vals = _get_col_vals(data, ci)
        if vals and len(vals) >= max(int(nrows * 0.3), 3):
            sv  = sorted(vals)
            mid = len(sv) // 2
            med = sv[mid] if len(sv) % 2 else (sv[mid - 1] + sv[mid]) / 2
            num_cols.append(dict(
                name=h, ci=ci, count=len(vals),
                sum=sum(vals), avg=sum(vals) / len(vals),
                median=med, min=min(vals), max=max(vals), vals=vals,
            ))

    def fmt(v, d=1):
        if isinstance(v, float):
            if abs(v) >= 1_000_000:
                return f"{v / 1_000_000:.1f}M"
            if abs(v) >= 1_000:
                return f"{int(v):,}" if v == int(v) else f"{v:,.{d}f}"
            return f"{int(v)}" if v == int(v) else f"{v:,.{d}f}"
        return f"{v:,}" if isinstance(v, int) else str(v)

    # ── Page geometry (A4 portrait)
    PW, PH = A4
    MG     = 18 * mm
    HDR_H  = 11 * mm
    FTR_H  = 9  * mm
    FW     = PW - 2 * MG

    # ── Style factory
    def ps(name, font=BF, size=10, color=DARK,
           align=TA_LEFT, leading=None, sb=2, sa=2, li=0, fi=0):
        return ParagraphStyle(
            name, fontName=font, fontSize=size,
            textColor=RC.HexColor(color),
            alignment=align,
            leading=leading or size * 1.4,
            spaceBefore=sb * mm, spaceAfter=sa * mm,
            leftIndent=li, firstLineIndent=fi,
        )

    S_H1   = ps("H1",  font=BFBD, size=20, color=ACCENT, sa=4, sb=3)
    S_H2   = ps("H2",  font=BFBD, size=14, color=DARK,   sa=3, sb=5)
    S_H3   = ps("H3",  font=BFBD, size=10, color=ACCENT, sa=2, sb=4)
    S_BODY = ps("Bd",  size=10, color=DARK, align=TA_JUSTIFY, sa=3, leading=16)
    S_BULL = ps("Bu",  size=10, color=DARK, sa=2, leading=16,
                li=int(8 * mm), fi=int(-4 * mm))
    S_DISC = ps("Dc",  size=8, color=MUTED, align=TA_JUSTIFY, sa=2, leading=12)
    S_TH   = ps("TH",  font=BFBD, size=9, color="#FFFFFF", sb=0, sa=0)
    S_TD   = ps("TD",  size=9, color=DARK, sb=0, sa=0)
    S_KV   = ps("KV",  font=BFBD, size=17, color=ACCENT, align=TA_CENTER, sb=2, sa=1)
    S_KL   = ps("KL",  size=8,  color=MUTED, align=TA_CENTER, sb=0, sa=2)

    def tbl_base():
        return [
            ("GRID",          (0, 0), (-1, -1), 0.5, RC.HexColor(BORDER)),
            ("TOPPADDING",    (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING",   (0, 0), (-1, -1), 6),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ]

    def tbl_hdr():
        return [
            ("BACKGROUND", (0, 0), (-1, 0), RC.HexColor(ACCENT)),
            ("TEXTCOLOR",  (0, 0), (-1, 0), RC.white),
            ("FONTNAME",   (0, 0), (-1, 0), BFBD),
        ]

    def tbl_zebra():
        return [("ROWBACKGROUNDS", (0, 1), (-1, -1),
                 [RC.white, RC.HexColor("#F8FAFC")])]

    def hr():
        return HRFlowable(width="100%", thickness=0.5,
                          color=RC.HexColor(BORDER),
                          spaceAfter=3 * mm, spaceBefore=1 * mm)

    def sp(h=4):
        return Spacer(1, h * mm)

    # ── Canvas callbacks
    def draw_cover(cv, doc):
        cv.saveState()

        # Top accent bar
        cv.setFillColor(RC.HexColor(ACCENT))
        cv.rect(0, PH - 22 * mm, PW, 22 * mm, fill=1, stroke=0)
        cv.setFillColor(RC.white)
        cv.setFont(BFBD, 12)
        cv.drawCentredString(PW / 2, PH - 13 * mm,
                             "Stellura — Data Vision Studio")
        cv.setFont(BF, 8)
        cv.drawCentredString(PW / 2, PH - 19 * mm,
                             "स्टेल्यूरा  •  Intelligent Data Analysis for Government Offices")

        # Bottom accent bar
        cv.setFillColor(RC.HexColor(ACCENT))
        cv.rect(0, 0, PW, 15 * mm, fill=1, stroke=0)
        cv.setFillColor(RC.white)
        cv.setFont(BF, 7.5)
        cv.drawCentredString(PW / 2, 8 * mm,
            "Generated by Stellura (स्टेल्यूरा)  •  "
            "Developed by Neeraj Purohit, Senior Assistant, Rajasthan Police")
        cv.drawCentredString(PW / 2, 3.5 * mm,
                             f"Report Generated: {gen_date}, {gen_time}")

        # Logo
        y = PH - 30 * mm
        if logo_b64:
            try:
                b64_clean = logo_b64.split(",", 1)[-1]
                img_bytes = _b64.b64decode(b64_clean)
                reader    = ImageReader(io.BytesIO(img_bytes))
                lw = lh   = 46 * mm
                cv.drawImage(reader, (PW - lw) / 2, y - lh,
                             width=lw, height=lh,
                             preserveAspectRatio=True, mask='auto')
                y -= (lh + 8 * mm)
            except Exception as ex:
                print(f"  [WARN] Cover logo error: {ex}")
                y -= 12 * mm
        else:
            y -= 12 * mm

        # Company name
        if company:
            cv.setFont(BFBD, 13)
            cv.setFillColor(RC.HexColor(MUTED))
            cv.drawCentredString(PW / 2, y, company)
            y -= 9 * mm

        # Report title (may wrap)
        cv.setFont(BFBD, 22)
        cv.setFillColor(RC.HexColor(DARK))
        words   = title.split()
        lines_t = []
        cur     = []
        for w in words:
            if cv.stringWidth(' '.join(cur + [w]), BFBD, 22) < PW - 40 * mm:
                cur.append(w)
            else:
                if cur:
                    lines_t.append(' '.join(cur))
                cur = [w]
        if cur:
            lines_t.append(' '.join(cur))
        for line in lines_t[:3]:
            cv.drawCentredString(PW / 2, y, line)
            y -= 9 * mm
        y -= 4 * mm

        # Prepared for
        if prepared:
            cv.setFont(BF, 11)
            cv.setFillColor(RC.HexColor(ACCENT))
            cv.drawCentredString(PW / 2, y,
                f"{'के लिए' if is_hi else 'Prepared for'}: {prepared}")
            y -= 9 * mm

        # Description
        if desc:
            cv.setFont(BF, 9)
            cv.setFillColor(RC.HexColor(MUTED))
            max_w   = PW - 60 * mm
            dwords  = desc.split()
            dlines  = []
            dcur    = []
            for w in dwords:
                if cv.stringWidth(' '.join(dcur + [w]), BF, 9) < max_w:
                    dcur.append(w)
                else:
                    if dcur:
                        dlines.append(' '.join(dcur))
                    dcur = [w]
            if dcur:
                dlines.append(' '.join(dcur))
            y -= 3 * mm
            for line in dlines[:5]:
                cv.drawCentredString(PW / 2, y, line)
                y -= 5 * mm

        # Divider line
        y -= 5 * mm
        cv.setStrokeColor(RC.HexColor(ACCENT))
        cv.setLineWidth(1)
        cv.line(PW / 2 - 32 * mm, y, PW / 2 + 32 * mm, y)
        y -= 7 * mm

        # Meta info
        cv.setFont(BF, 9)
        cv.setFillColor(RC.HexColor(MUTED))
        cv.drawCentredString(PW / 2, y,
            f"{gen_date}  •  {nrows:,} "
            f"{'रिकॉर्ड' if is_hi else 'Records'}  •  "
            f"{ncols} {'कॉलम' if is_hi else 'Columns'}")

        cv.restoreState()

    def draw_page(cv, doc):
        """Header + footer for pages 2+."""
        if doc.page <= 1:
            return
        cv.saveState()

        # Header bar
        cv.setFillColor(RC.HexColor(ACCENT))
        cv.rect(MG, PH - MG - HDR_H, FW, HDR_H, fill=1, stroke=0)
        cv.setFillColor(RC.white)
        cv.setFont(BFBD, 8)
        cv.drawString(MG + 3 * mm, PH - MG - HDR_H + 3.5 * mm,
                      company or "Stellura Report")
        cv.setFont(BF, 7.5)
        cv.drawRightString(PW - MG - 3 * mm, PH - MG - HDR_H + 3.5 * mm,
                           title[:55])

        # Footer
        cv.setStrokeColor(RC.HexColor(BORDER))
        cv.setLineWidth(0.5)
        cv.line(MG, MG + FTR_H - 1, PW - MG, MG + FTR_H - 1)
        cv.setFont(BF, 7)
        cv.setFillColor(RC.HexColor(MUTED))
        cv.drawCentredString(PW / 2, MG + 2 * mm,
            "Stellura (स्टेल्यूरा)  •  "
            "Developed by Neeraj Purohit, Senior Assistant, Rajasthan Police")
        cv.drawRightString(PW - MG, MG + 2 * mm,
                           f"{'पृष्ठ' if is_hi else 'Page'} {doc.page}")

        cv.restoreState()

    # ── Build document
    output = io.BytesIO()
    doc    = SimpleDocTemplate(
        output, pagesize=A4,
        leftMargin=MG, rightMargin=MG,
        topMargin=MG + HDR_H, bottomMargin=MG + FTR_H,
        title=title,
    )

    E = []   # flowable elements list

    # ── PAGE 1: Cover (drawn by canvas callback; put a PageBreak to trigger it)
    E.append(PageBreak())

    # ── PAGE 2: Executive Summary
    E.append(Paragraph(t("Executive Summary", "कार्यकारी सारांश"), S_H1))
    E.append(hr())
    if incl_ai and ai_data.get("summary"):
        E.append(Paragraph(ai_data["summary"], S_BODY))
    else:
        bullets = [
            t(f"This report analyzes {nrows:,} records across {ncols} data columns.",
              f"यह रिपोर्ट {ncols} कॉलम में {nrows:,} रिकॉर्ड का विश्लेषण करती है।"),
            t(f"Data completeness: {pct_fill:.1f}%"
              f" ({total_c - empty_c:,} of {total_c:,} cells populated).",
              f"डेटा पूर्णता: {pct_fill:.1f}%"
              f" ({total_c:,} में से {total_c - empty_c:,} सेल भरे हैं)।"),
        ]
        if num_cols:
            bc = max(num_cols, key=lambda x: x["sum"])
            bullets.append(
                t(f"Highest aggregate: \"{bc['name']}\" totals {fmt(bc['sum'])}"
                  f" across {bc['count']:,} entries.",
                  f"सर्वाधिक योग: \"{bc['name']}\" — {bc['count']:,}"
                  f" प्रविष्टियों में कुल {fmt(bc['sum'])}।"))
        bullets.append(
            t("All cells are populated — data quality is excellent.",
              "सभी सेल भरे हैं — डेटा गुणवत्ता उत्कृष्ट है।")
            if empty_c == 0 else
            t(f"{empty_c:,} empty cells detected — verify data quality"
              " before finalizing decisions.",
              f"{empty_c:,} रिक्त सेल मिले — निर्णय लेने से पहले"
              " डेटा गुणवत्ता जाँचें।"))
        for b in bullets:
            E.append(Paragraph(f"• {b}", S_BULL))
    E.append(PageBreak())

    # ── PAGE 3: Data Overview
    E.append(Paragraph(t("Data Overview", "डेटा अवलोकन"), S_H1))
    E.append(hr())

    def kpi_cell(val_str, lbl):
        rows = [[Paragraph(val_str, S_KV)], [Paragraph(lbl, S_KL)]]
        return Table(rows, style=TableStyle([
            ("BACKGROUND",     (0, 0), (-1, -1), RC.HexColor(ACC_L)),
            ("BOX",            (0, 0), (-1, -1), 0.5, RC.HexColor(ACCENT)),
            ("TOPPADDING",     (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING",  (0, 0), (-1, -1), 8),
            ("LEFTPADDING",    (0, 0), (-1, -1), 4),
            ("RIGHTPADDING",   (0, 0), (-1, -1), 4),
        ]))

    kpi_tbl = Table([[
        kpi_cell(f"{nrows:,}",          t("Total Records",  "कुल रिकॉर्ड")),
        kpi_cell(f"{ncols}",            t("Columns",        "कॉलम")),
        kpi_cell(f"{pct_fill:.0f}%",   t("Completeness",  "पूर्णता")),
        kpi_cell(f"{len(num_cols)}",    t("Numeric Cols",  "संख्यात्मक")),
    ]], colWidths=[FW / 4] * 4)
    kpi_tbl.setStyle(TableStyle([
        ("LEFTPADDING",  (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    E.append(kpi_tbl)
    E.append(sp(5))

    # Column directory
    E.append(Paragraph(t("Column Directory", "कॉलम सूची"), S_H2))
    cd = [[Paragraph(x, S_TH) for x in [
        t("#", "#"), t("Column Name", "कॉलम नाम"),
        t("Type", "प्रकार"), t("Non-Empty", "भरे"), t("Missing", "रिक्त"),
    ]]]
    for ci, h in enumerate(hdrs):
        col_v = [r[ci] if ci < len(r) else None for r in data]
        ne    = sum(1 for v in col_v if v is not None and str(v).strip() != "")
        miss  = nrows - ne
        pop   = [v for v in col_v if v is not None and str(v).strip() != ""]
        nums  = [_safe_float(v) for v in pop]
        nums  = [v for v in nums if v is not None]
        ctype = (t("Numeric", "संख्यात्मक")
                 if pop and len(nums) >= len(pop) * 0.5
                 else t("Text", "पाठ"))
        mc    = RED if miss > 0 else MUTED
        cd.append([
            Paragraph(str(ci + 1), S_TD),
            Paragraph(str(h), S_TD),
            Paragraph(ctype, S_TD),
            Paragraph(str(ne), S_TD),
            Paragraph(str(miss),
                      ParagraphStyle("TDR", fontName=BF, fontSize=9,
                                     textColor=RC.HexColor(mc))),
        ])
    cd_tbl = Table(cd, colWidths=[12 * mm, None, 28 * mm, 22 * mm, 20 * mm],
                   repeatRows=1)
    cd_tbl.setStyle(TableStyle(tbl_base() + tbl_hdr() + tbl_zebra()))
    E.append(cd_tbl)
    E.append(PageBreak())

    # ── PAGES 4-5: Key Statistics
    E.append(Paragraph(t("Key Statistics", "मुख्य सांख्यिकी"), S_H1))
    E.append(hr())
    if not num_cols:
        E.append(Paragraph(
            t("No numeric columns found in this dataset.",
              "इस डेटासेट में कोई संख्यात्मक कॉलम नहीं मिला।"), S_BODY))
    else:
        st = [[Paragraph(x, S_TH) for x in [
            t("Column","कॉलम"), t("Count","गिनती"), t("Sum","योग"),
            t("Average","औसत"), t("Median","मध्यमान"),
            t("Min","न्यूनतम"), t("Max","अधिकतम"),
        ]]]
        for nc in num_cols:
            st.append([Paragraph(x, S_TD) for x in [
                str(nc["name"]), str(nc["count"]),
                fmt(nc["sum"]), fmt(nc["avg"]), fmt(nc["median"]),
                fmt(nc["min"]), fmt(nc["max"]),
            ]])
        st_tbl = Table(st, repeatRows=1)
        st_tbl.setStyle(TableStyle(tbl_base() + tbl_hdr() + tbl_zebra()))
        E.append(st_tbl)
        E.append(sp(4))

        E.append(Paragraph(t("Column-wise Breakdown", "कॉलम-वार विश्लेषण"), S_H2))
        for nc in num_cols[:8]:
            E.append(Paragraph(str(nc["name"]), S_H3))
            rng = nc["max"] - nc["min"]
            bk  = [[Paragraph(x, S_TH) for x in [
                t("Metric", "मापदंड"),
                t("Value", "मान"),
                t("Range Position", "श्रेणी स्थिति"),
            ]]]
            for lbl, val in [
                (t("Minimum",  "न्यूनतम"),  nc["min"]),
                (t("Average",  "औसत"),      nc["avg"]),
                (t("Median",   "मध्यमान"),  nc["median"]),
                (t("Maximum",  "अधिकतम"),   nc["max"]),
            ]:
                pct = int((val - nc["min"]) / rng * 100) if rng else 50
                bk.append([
                    Paragraph(lbl, S_TD),
                    Paragraph(fmt(val), ParagraphStyle(
                        "BKV", fontName=BFBD, fontSize=9,
                        textColor=RC.HexColor(ACCENT))),
                    Paragraph(f"{pct}% of range", S_TD),
                ])
            bk_tbl = Table(bk, colWidths=[42 * mm, 40 * mm, None])
            bk_style = tbl_base() + tbl_hdr()
            bk_style.append(("ROWBACKGROUNDS", (0, 1), (-1, -1),
                              [RC.white, RC.HexColor("#F0F0FF")]))
            bk_tbl.setStyle(TableStyle(bk_style))
            E.append(bk_tbl)
            E.append(sp(3))
    E.append(PageBreak())

    # ── PAGE 6: Top 10 Records
    E.append(Paragraph(t("Top 10 Records", "शीर्ष 10 रिकॉर्ड"), S_H1))
    E.append(hr())
    E.append(Paragraph(
        t("First 10 records from the dataset (max 12 columns):",
          "डेटासेट के पहले 10 रिकॉर्ड (अधिकतम 12 कॉलम):"), S_BODY))
    E.append(sp(2))
    max_c = min(ncols, 12)
    top   = [[Paragraph(str(h), S_TH) for h in hdrs[:max_c]]]
    top  += [
        [Paragraph(str(r[ci]) if ci < len(r) and r[ci] is not None else "",
                   S_TD) for ci in range(max_c)]
        for r in data[:10]
    ]
    if top:
        col_w = FW / max_c if max_c else FW
        top_tbl = Table(top, colWidths=[col_w] * max_c, repeatRows=1)
        top_tbl.setStyle(TableStyle(tbl_base() + tbl_hdr() + tbl_zebra()))
        E.append(top_tbl)
    E.append(PageBreak())

    # ── PAGE 7: Findings
    E.append(Paragraph(t("Key Findings & Insights", "मुख्य निष्कर्ष"), S_H1))
    E.append(hr())
    if incl_ai and ai_data.get("findings"):
        E.append(Paragraph(ai_data["findings"], S_BODY))
    else:
        findings = []
        if empty_c == 0:
            findings.append(
                t("✓ Complete dataset — no missing values. Data integrity is excellent.",
                  "✓ पूर्ण डेटासेट — कोई रिक्त मान नहीं। डेटा अखंडता उत्कृष्ट है।"))
        elif (empty_c / total_c) * 100 > 20:
            findings.append(
                t(f"⚠ HIGH MISSING DATA: {(empty_c / total_c) * 100:.1f}% of cells empty"
                  f" ({empty_c:,} cells). Analysis reliability is impacted.",
                  f"⚠ अत्यधिक रिक्त डेटा: {(empty_c / total_c) * 100:.1f}%"
                  f" सेल रिक्त हैं ({empty_c:,})। विश्लेषण की विश्वसनीयता प्रभावित है।"))
        else:
            findings.append(
                t(f"✓ Data completeness is {pct_fill:.1f}%."
                  f" Minor gaps in {empty_c:,} cells.",
                  f"✓ डेटा पूर्णता {pct_fill:.1f}% है।"
                  f" {empty_c:,} सेल में मामूली रिक्तता।"))
        for nc in num_cols:
            sv   = sorted(nc["vals"])
            n_sv = len(sv)
            if n_sv >= 4:
                q1    = sv[n_sv // 4]
                q3    = sv[3 * n_sv // 4]
                iqr   = q3 - q1
                lo    = q1 - 1.5 * iqr
                hi_b  = q3 + 1.5 * iqr
                outlrs = [v for v in sv if v < lo or v > hi_b]
                if outlrs:
                    findings.append(
                        t(f"⚑ OUTLIERS in \"{nc['name']}\": {len(outlrs)} unusual values"
                          f" (range: {fmt(min(outlrs))} – {fmt(max(outlrs))})."
                          " Verify these entries.",
                          f"⚑ \"{nc['name']}\" में असामान्य मान: {len(outlrs)} मान"
                          f" (श्रेणी: {fmt(min(outlrs))} – {fmt(max(outlrs))})। सत्यापित करें।"))
                else:
                    findings.append(
                        t(f"✓ \"{nc['name']}\": Distribution is normal — no significant outliers.",
                          f"✓ \"{nc['name']}\": वितरण सामान्य — कोई असामान्य मान नहीं।"))
        for f in findings:
            E.append(Paragraph(f"• {f}", S_BULL))
    E.append(PageBreak())

    # ── PAGES 8-9: Decisions & Recommendations
    E.append(Paragraph(t("Decisions & Recommendations", "निर्णय एवं सुझाव"), S_H1))
    E.append(hr())
    E.append(Paragraph(
        t("Based on the analysis, the following actions are recommended:",
          "विश्लेषण के आधार पर निम्नलिखित कार्रवाइयाँ अनुशंसित हैं:"), S_BODY))
    E.append(sp(3))
    if incl_ai and ai_data.get("recommendations"):
        E.append(Paragraph(ai_data["recommendations"], S_BODY))
    else:
        recs = []
        if pct_fill < 90:
            recs.append(("HIGH", RED,
                t("Data Quality Improvement", "डेटा गुणवत्ता सुधार"),
                t(f"Immediate action: {empty_c:,} cells are empty. Assign data entry"
                  " responsibility with a 30-day completion deadline.",
                  f"तत्काल कार्रवाई: {empty_c:,} सेल रिक्त हैं। 30 दिन की समयसीमा"
                  " के साथ डेटा प्रविष्टि जिम्मेदारी सौंपें।")))
        else:
            recs.append(("LOW", GREEN,
                t("Maintain Data Quality", "डेटा गुणवत्ता बनाए रखें"),
                t("Data quality is excellent. Continue regular update cycles"
                  " with quarterly audit checks.",
                  "डेटा गुणवत्ता उत्कृष्ट है। त्रैमासिक ऑडिट के साथ"
                  " नियमित अद्यतन चक्र जारी रखें।")))
        for nc in num_cols[:3]:
            if nc["count"] > 1 and nc["max"] > nc["avg"] * 3:
                recs.append(("MEDIUM", AMBER,
                    t(f"Review High Values: {nc['name']}",
                      f"उच्च मान समीक्षा: {nc['name']}"),
                    t(f"Maximum ({fmt(nc['max'])}) is significantly above average"
                      f" ({fmt(nc['avg'])}). Investigate for data errors or exceptional cases.",
                      f"अधिकतम मान ({fmt(nc['max'])}) औसत ({fmt(nc['avg'])}) से काफी अधिक है।"
                      " डेटा त्रुटियों या असाधारण मामलों की जाँच करें।")))
        recs.append(("LOW", GREEN,
            t("Regular Monitoring", "नियमित निगरानी"),
            t("Establish monthly review cycles. Use Stellura to track trends"
              " and generate alerts when key metrics exceed thresholds.",
              "मासिक समीक्षा चक्र स्थापित करें। Stellura से रुझान ट्रैक करें"
              " और मुख्य मेट्रिक्स सीमा से अधिक होने पर अलर्ट उत्पन्न करें।")))
        recs.append(("LOW", GREEN,
            t("Digital Records", "डिजिटल रिकॉर्ड"),
            t("Migrate remaining paper records to digital format. Standardize"
              " column naming across departments for easier cross-departmental analysis.",
              "शेष कागजी रिकॉर्ड डिजिटल प्रारूप में स्थानांतरित करें।"
              " विभागों में कॉलम नामकरण मानकीकृत करें।")))

        plbl = {"HIGH": t("HIGH", "उच्च"),
                "MEDIUM": t("MEDIUM", "मध्यम"),
                "LOW": t("LOW", "निम्न")}
        for prio, pcol, rtitle, rdetail in recs:
            r_tbl = Table([[
                Paragraph(plbl[prio],
                          ParagraphStyle("PL", fontName=BFBD, fontSize=8,
                                         textColor=RC.white,
                                         alignment=TA_CENTER)),
                Paragraph(f"<b>{rtitle}</b><br/>{rdetail}",
                          ParagraphStyle("RD", fontName=BF, fontSize=9,
                                         leading=14, textColor=RC.HexColor(DARK))),
            ]], colWidths=[18 * mm, None])
            r_tbl.setStyle(TableStyle([
                ("BACKGROUND",    (0, 0), (0, -1), RC.HexColor(pcol)),
                ("BACKGROUND",    (1, 0), (-1, -1), RC.HexColor("#F8FAFC")),
                ("BOX",           (0, 0), (-1, -1), 0.5, RC.HexColor(BORDER)),
                ("LINEBEFORE",    (1, 0), (1, -1), 3, RC.HexColor(pcol)),
                ("TOPPADDING",    (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LEFTPADDING",   (0, 0), (-1, -1), 8),
                ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
                ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ]))
            E.append(r_tbl)
            E.append(sp(3))
    E.append(PageBreak())

    # ── PAGE 10: Disclaimer & Branding
    E.append(Paragraph(t("Disclaimer & Report Information",
                          "अस्वीकरण एवं रिपोर्ट जानकारी"), S_H1))
    E.append(hr())
    disc = t(
        "This report has been automatically generated by Stellura (स्टेल्यूरा) — "
        "an intelligent data analysis tool developed for Indian government offices. "
        "The analysis, findings, and recommendations are based solely on the data "
        "provided and do not constitute official government policy or decisions.\n\n"
        "The accuracy of this report depends on the quality of the source data. "
        "Stellura does not guarantee the accuracy or completeness of the analysis "
        "for any specific administrative decision.\n\n"
        "This report is intended for internal use by authorized government personnel "
        "only. Redistribution outside the intended scope requires approval from the "
        "competent authority.\n\n"
        "All data is processed locally on the user's computer and is never transmitted "
        "to external servers, ensuring complete data privacy and security in compliance "
        "with government data protection guidelines.",

        "यह रिपोर्ट Stellura (स्टेल्यूरा) द्वारा स्वचालित रूप से तैयार की गई है — "
        "भारतीय सरकारी कार्यालयों के लिए विकसित एक बुद्धिमान डेटा विश्लेषण उपकरण। "
        "इसमें प्रस्तुत विश्लेषण, निष्कर्ष और सुझाव केवल प्रदान किए गए डेटा पर आधारित "
        "हैं और इन्हें आधिकारिक सरकारी नीति या निर्णय नहीं माना जाना चाहिए।\n\n"
        "इस रिपोर्ट की सटीकता स्रोत डेटा की गुणवत्ता पर निर्भर करती है। Stellura "
        "किसी प्रशासनिक निर्णय के लिए विश्लेषण की सटीकता की गारंटी नहीं देता।\n\n"
        "यह रिपोर्ट केवल अधिकृत सरकारी कर्मियों के आंतरिक उपयोग के लिए है। इच्छित "
        "दायरे के बाहर पुनर्वितरण के लिए सक्षम प्राधिकारी की मंजूरी आवश्यक है।\n\n"
        "सभी डेटा उपयोगकर्ता के कंप्यूटर पर स्थानीय रूप से संसाधित होता है और बाहरी "
        "सर्वर पर नहीं भेजा जाता, जिससे सरकारी दिशानिर्देशों के अनुसार पूर्ण गोपनीयता "
        "सुनिश्चित होती है।"
    )
    for para in disc.split("\n\n"):
        E.append(Paragraph(para.strip(), S_DISC))

    E.append(sp(6))
    E.append(HRFlowable(width="100%", thickness=1,
                        color=RC.HexColor(ACCENT),
                        spaceAfter=3 * mm))
    E.append(sp(3))

    brand_tbl = Table([
        [Paragraph("Stellura",
                   ParagraphStyle("BN", fontName=BFBD, fontSize=18,
                                  textColor=RC.HexColor(ACCENT))),
         Paragraph("स्टेल्यूरा",
                   ParagraphStyle("BH", fontName=BF, fontSize=11,
                                  textColor=RC.HexColor(MUTED)))],
        [Paragraph("Intelligent Data Analysis for Government Offices",
                   ParagraphStyle("BS", fontName=BF, fontSize=9,
                                  textColor=RC.HexColor(MUTED))),
         ""],
        [Paragraph("Developed by: Neeraj Purohit, Senior Assistant,"
                   " Rajasthan Police",
                   ParagraphStyle("BD", fontName=BF, fontSize=9,
                                  textColor=RC.HexColor(DARK))),
         ""],
        [Paragraph(f"{t('Report generated', 'रिपोर्ट तैयार')}: "
                   f"{gen_date}, {gen_time}",
                   ParagraphStyle("BG", fontName=BF, fontSize=8,
                                  textColor=RC.HexColor(MUTED))),
         ""],
    ], colWidths=[None, 45 * mm])
    brand_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), RC.HexColor(ACC_L)),
        ("BOX",           (0, 0), (-1, -1), 1, RC.HexColor(ACCENT)),
        ("LINERIGHT",     (0, 0), (0, -1),  4, RC.HexColor(ACCENT)),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 14),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 14),
        ("SPAN",          (0, 1), (-1, 1)),
        ("SPAN",          (0, 2), (-1, 2)),
        ("SPAN",          (0, 3), (-1, 3)),
    ]))
    E.append(brand_tbl)

    # ── Build PDF
    doc.build(E, onFirstPage=draw_cover, onLaterPages=draw_page)
    output.seek(0)
    safe  = re.sub(r'[^\w\s-]', '', title or "report").strip().replace(" ", "_")
    fname = f"{safe}_Report_{now.strftime('%Y%m%d_%H%M%S')}.pdf"
    return (output.read(), fname, "application/pdf")


@app.route("/api/generate-report", methods=["POST"])
def generate_report():
    """Generate a multi-page professional PDF report from the current dataset."""
    try:
        payload = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400
    try:
        data_bytes, fname, mime = _build_report_pdf(payload)
    except RuntimeError as exc:
        return jsonify({"error": "dependency_missing", "message": str(exc)}), 503
    except Exception as exc:
        import traceback
        traceback.print_exc()
        return jsonify({"error": "report_failed", "message": str(exc)}), 500
    return send_file(io.BytesIO(data_bytes), mimetype=mime,
                     as_attachment=True, download_name=fname)


# ---------------------------------------------------------------------------
# Health Check
# ---------------------------------------------------------------------------

@app.route("/api/health")
def health_check():
    """Simple health-check endpoint."""
    return jsonify({
        "status": "ok",
        "server": "Stellura — Data Vision Studio v2.3",
        "version": "2.3.0",
        "port": PORT,
        "timestamp": datetime.now().isoformat(),
        "features": ["excel_export", "pdf_export", "dashboard_html_export", "async_export", "hindi_support", "watermarks", "cell_formatting"]
    })


# ---------------------------------------------------------------------------
# Government Sample Datasets  (Patch 7)
# ---------------------------------------------------------------------------

@app.route("/api/sample-data/<dataset_name>")
def get_sample_data(dataset_name):
    """Return pre-built sample datasets relevant to Indian government offices."""

    datasets = {
        "employee_salary": {
            "title": "Employee Salary Register / कर्मचारी वेतन पंजी",
            "headers": ["कर्मचारी_क्रमांक", "नाम", "विभाग", "पद", "मूल_वेतन", "महंगाई_भत्ता", "कुल_वेतन", "जिला", "स्थिति"],
            "data": [
                ["EMP001", "राहुल शर्मा",   "वित्त",          "लेखाकार",          45000, 18000, 63000, "जयपुर",   "सक्रिय"],
                ["EMP002", "प्रिया सिंह",   "प्रशासन",        "कनिष्ठ सहायक",     32000, 12800, 44800, "जोधपुर",  "सक्रिय"],
                ["EMP003", "अमित कुमार",    "तकनीकी",         "तकनीशियन",         38000, 15200, 53200, "उदयपुर",  "अवकाश पर"],
                ["EMP004", "सुनीता देवी",   "स्वास्थ्य",      "नर्स",             35000, 14000, 49000, "अजमेर",   "सक्रिय"],
                ["EMP005", "विक्रम सिंह",   "पुलिस",          "कांस्टेबल",        30000, 12000, 42000, "जयपुर",   "सक्रिय"],
                ["EMP006", "मीना कुमारी",   "शिक्षा",         "शिक्षक",           42000, 16800, 58800, "कोटा",    "सक्रिय"],
                ["EMP007", "सुरेश यादव",    "राजस्व",         "पटवारी",           36000, 14400, 50400, "भरतपुर",  "अवकाश पर"],
                ["EMP008", "कविता राव",     "कृषि",           "कृषि अधिकारी",     55000, 22000, 77000, "सीकर",    "सक्रिय"],
                ["EMP009", "नरेंद्र गुप्ता","लोक निर्माण",    "अभियंता",          62000, 24800, 86800, "जयपुर",   "सक्रिय"],
                ["EMP010", "पूनम शर्मा",    "महिला एवं बाल",  "पर्यवेक्षक",       40000, 16000, 56000, "अलवर",    "सक्रिय"],
                ["EMP011", "रमेश वर्मा",    "वित्त",          "सहायक",            33000, 13200, 46200, "जयपुर",   "सक्रिय"],
                ["EMP012", "आशा जोशी",      "प्रशासन",        "लिपिक",            28000, 11200, 39200, "जोधपुर",  "सक्रिय"],
                ["EMP013", "महेश पाल",      "तकनीकी",         "अधिकारी",          48000, 19200, 67200, "उदयपुर",  "सक्रिय"],
                ["EMP014", "दीपा शर्मा",    "स्वास्थ्य",      "तकनीशियन",         36000, 14400, 50400, "अजमेर",   "सक्रिय"],
                ["EMP015", "संजय मेहता",    "पुलिस",          "सहायक",            31500, 12600, 44100, "कोटा",    "अवकाश पर"],
                ["EMP016", "गीता राठौर",    "शिक्षा",         "लिपिक",            29000, 11600, 40600, "भरतपुर",  "सक्रिय"],
                ["EMP017", "विनोद सक्सेना", "राजस्व",         "अधिकारी",          52000, 20800, 72800, "सीकर",    "सक्रिय"],
                ["EMP018", "रीता अग्रवाल",  "कृषि",           "सहायक",            34000, 13600, 47600, "जयपुर",   "सक्रिय"],
                ["EMP019", "अरुण तिवारी",   "लोक निर्माण",    "लिपिक",            30500, 12200, 42700, "जोधपुर",  "सक्रिय"],
                ["EMP020", "मनोज सोनी",     "महिला एवं बाल",  "अधिकारी",          49000, 19600, 68600, "उदयपुर",  "सक्रिय"],
                ["EMP021", "शोभा मिश्रा",   "वित्त",          "तकनीशियन",         37000, 14800, 51800, "अजमेर",   "सक्रिय"],
                ["EMP022", "दीनदयाल",       "प्रशासन",        "अधिकारी",          55000, 22000, 77000, "जयपुर",   "सक्रिय"],
                ["EMP023", "पार्वती देवी",  "स्वास्थ्य",      "सहायक",            29500, 11800, 41300, "कोटा",    "अवकाश पर"],
                ["EMP024", "राजेश भट्ट",    "शिक्षा",         "अधिकारी",          57000, 22800, 79800, "भरतपुर",  "सक्रिय"],
                ["EMP025", "उषा चौधरी",     "राजस्व",         "लिपिक",            27000, 10800, 37800, "सीकर",    "सक्रिय"],
            ]
        },
        "attendance": {
            "title": "Attendance Register / उपस्थिति पंजी",
            "headers": ["दिनांक", "कर्मचारी_नाम", "विभाग", "उपस्थिति", "आगमन_समय", "प्रस्थान_समय", "छुट्टी_प्रकार"],
            "data": [
                ["01/06/2025", "राहुल शर्मा",  "वित्त",       "उपस्थित",    "09:05", "17:30", "-"],
                ["01/06/2025", "प्रिया सिंह",  "प्रशासन",     "अनुपस्थित",  "-",     "-",     "अर्जित छुट्टी"],
                ["01/06/2025", "अमित कुमार",   "तकनीकी",      "उपस्थित",    "08:55", "18:00", "-"],
                ["01/06/2025", "सुनीता देवी",  "स्वास्थ्य",   "उपस्थित",    "09:00", "17:00", "-"],
                ["01/06/2025", "विक्रम सिंह",  "पुलिस",       "उपस्थित",    "08:45", "16:45", "-"],
                ["02/06/2025", "राहुल शर्मा",  "वित्त",       "उपस्थित",    "09:10", "17:45", "-"],
                ["02/06/2025", "प्रिया सिंह",  "प्रशासन",     "उपस्थित",    "09:20", "17:15", "-"],
                ["02/06/2025", "अमित कुमार",   "तकनीकी",      "अनुपस्थित",  "-",     "-",     "चिकित्सा छुट्टी"],
                ["02/06/2025", "सुनीता देवी",  "स्वास्थ्य",   "उपस्थित",    "09:05", "17:00", "-"],
                ["02/06/2025", "मीना कुमारी",  "शिक्षा",      "उपस्थित",    "08:50", "16:55", "-"],
                ["03/06/2025", "राहुल शर्मा",  "वित्त",       "अनुपस्थित",  "-",     "-",     "आकस्मिक छुट्टी"],
                ["03/06/2025", "सुरेश यादव",   "राजस्व",      "उपस्थित",    "09:15", "17:30", "-"],
                ["03/06/2025", "कविता राव",    "कृषि",        "उपस्थित",    "09:00", "17:00", "-"],
                ["03/06/2025", "नरेंद्र गुप्ता","लोक निर्माण","उपस्थित",   "08:40", "17:10", "-"],
                ["03/06/2025", "पूनम शर्मा",   "महिला एवं बाल","उपस्थित",  "09:05", "17:00", "-"],
            ]
        },
        "budget": {
            "title": "Department Budget Register / विभागीय बजट पंजी",
            "headers": ["विभाग", "बजट_शीर्षक", "स्वीकृत_राशि", "व्यय_राशि", "शेष_राशि", "व्यय_प्रतिशत", "तिमाही", "स्थिति"],
            "data": [
                ["स्वास्थ्य",         "दवाई एवं उपकरण",    5000000, 3200000, 1800000, 64.0,  "Q1-2025", "सामान्य"],
                ["शिक्षा",            "पाठ्यपुस्तक",       8000000, 7500000,  500000, 93.75, "Q1-2025", "सावधान"],
                ["पुलिस",             "वाहन रखरखाव",       2500000,  980000, 1520000, 39.2,  "Q1-2025", "सामान्य"],
                ["लोक निर्माण",       "सड़क मरम्मत",      15000000, 6200000, 8800000, 41.3,  "Q1-2025", "सामान्य"],
                ["कृषि",              "बीज वितरण",         3500000, 3480000,   20000, 99.4,  "Q1-2025", "संकट"],
                ["महिला एवं बाल",     "पोषण कार्यक्रम",   4200000, 2100000, 2100000, 50.0,  "Q1-2025", "सामान्य"],
                ["राजस्व",            "भूमि सर्वेक्षण",   6000000, 2400000, 3600000, 40.0,  "Q1-2025", "सामान्य"],
                ["वित्त",             "लेखा सॉफ्टवेयर",   1200000,  960000,  240000, 80.0,  "Q1-2025", "सावधान"],
                ["प्रशासन",           "कार्यालय उपकरण",   1800000,  540000, 1260000, 30.0,  "Q1-2025", "सामान्य"],
                ["तकनीकी",            "नेटवर्क अपग्रेड",  3000000, 2850000,  150000, 95.0,  "Q1-2025", "संकट"],
            ]
        }
    }

    if dataset_name not in datasets:
        return jsonify({"error": f"Dataset '{dataset_name}' not found"}), 404

    ds = datasets[dataset_name]
    return jsonify({
        "headers": ds["headers"],
        "data": ds["data"],
        "title": ds["title"]
    })


# ---------------------------------------------------------------------------
# Error Handlers
# ---------------------------------------------------------------------------

@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": str(e)}), 404


@app.errorhandler(413)
def too_large(e):
    return jsonify({"error": "File too large. Maximum upload size is 50 MB."}), 413


@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": f"Internal server error: {str(e)}"}), 500


@app.after_request
def compress(response):
    """Gzip compress large response payloads if the client supports it."""
    import gzip
    accept_encoding = request.headers.get("Accept-Encoding", "")
    if "gzip" not in accept_encoding.lower():
        return response
    if response.status_code < 200 or response.status_code >= 300:
        return response
    if "gzip" in response.headers.get("Content-Encoding", ""):
        return response

    response.direct_passthrough = False
    data = response.get_data()
    if len(data) < 500:
        return response

    compressed_data = gzip.compress(data)
    response.set_data(compressed_data)
    response.headers["Content-Encoding"] = "gzip"
    response.headers["Content-Length"] = len(compressed_data)
    return response


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

def _open_browser():
    """Open the default browser after a short delay."""
    import time
    time.sleep(1.5)
    webbrowser.open(f"http://localhost:{PORT}")


if __name__ == "__main__":
    print()
    print("  +------------------------------------------------------+")
    print("  |   Stellura (स्टेल्यूरा) v2.3 - Backend          |")
    print("  |   Intelligent Data Analyzer — Made in India          |")
    print("  +------------------------------------------------------+")
    print(f"  |  Server  : http://localhost:{PORT}  (this PC only)       |")
    print(f"  |  AI Model: {OLLAMA_MODEL} (local, offline)        |")
    print("  |  Dev: Neeraj Purohit, Sr. Asst, Rajasthan Police     |")
    print("  |  Press Ctrl+C to stop                                |")
    print("  +------------------------------------------------------+")
    print()

    # Pre-load Hindi font in the background
    threading.Thread(target=_ensure_hindi_font, daemon=True).start()

    # Open browser in background thread
    threading.Thread(target=_open_browser, daemon=True).start()

    # Record our own PID so stop.bat stops only this app, never other programs.
    try:
        PID_FILE.parent.mkdir(parents=True, exist_ok=True)
        PID_FILE.write_text(str(os.getpid()), encoding="utf-8")
    except OSError as exc:
        print(f"  [WARN] Could not write PID file: {exc}")
    import atexit
    atexit.register(lambda: PID_FILE.unlink(missing_ok=True))

    app.run(host=HOST, port=PORT, debug=False)
