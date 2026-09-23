"""
PRD Batch P5 — Agents Constellation Canvas
- SVG glow filter on edges (feGaussianBlur)
- Node bubbles: larger (72px), stronger resting glow, better labels
- Connect flash animation on both nodes when edge created
- Empty-canvas bilingual constellation invitation
- Result cards: premium glass with top accent border
- Run-agent button: cosmic style
- Ask bar: glass treatment
"""

import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB  = ROOT / "public"  / "Simple-Data-Analyser.html"
DL   = ROOT / "download" / "Simple-Data-Analyser.html"

raw = PUB.read_bytes()
s   = raw.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")

# ── 1. Add SVG glow filter to edge-layer defs ────────────────────────────
OLD_DEFS = '''        <svg id="dd-edge-layer" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="dd-edge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#ddb8ff"/>
              <stop offset="100%" stop-color="#4cd7f6"/>
            </linearGradient>
          </defs>
        </svg>'''

NEW_DEFS = '''        <svg id="dd-edge-layer" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="dd-edge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#ddb8ff"/>
              <stop offset="100%" stop-color="#4cd7f6"/>
            </linearGradient>
            <filter id="dd-edge-glow" x="-30%" y="-300%" width="160%" height="700%" color-interpolation-filters="sRGB">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.8" result="blur"/>
              <feMerge>
                <feMergeNode in="blur"/>
                <feMergeNode in="blur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
        </svg>'''

assert OLD_DEFS in s, "SVG defs block not found"
s = s.replace(OLD_DEFS, NEW_DEFS, 1)

# ── 2. Update empty canvas hint to bilingual constellation copy ───────────
OLD_HINT = '<p class="dd-agents-hint" data-i18n="dragModuleHere">Drag a module here to begin</p>'
NEW_HINT = ('<p class="dd-agents-hint" data-i18n="dragModuleHere">'
            'Drag a module into your constellation<br>'
            '<span style="font-size:11px;opacity:.7;font-family:\'Noto Sans Devanagari\',sans-serif">'
            'अपने तारामंडल में मॉड्यूल खींचें</span></p>')
assert OLD_HINT in s, "agents hint paragraph not found"
s = s.replace(OLD_HINT, NEW_HINT, 1)

# ── 3. Add connect-flash JS to _ddCreateEdge (after _ddSaveNodes()) ──────
OLD_SAVE = ('  _ddRedrawEdges();\n'
            '  _ddUpdateRunAgentBtn();\n'
            '  _ddSaveNodes();\n'
            '}')
NEW_SAVE = ('  _ddRedrawEdges();\n'
            '  _ddUpdateRunAgentBtn();\n'
            '  _ddSaveNodes();\n'
            '  /* P5: connect-flash on both nodes */\n'
            '  [fromId, toId].forEach(function(id) {\n'
            '    var el = document.getElementById(\'ddnode-\' + id);\n'
            '    var b  = el && el.querySelector(\'.dd-node-bubble\');\n'
            '    if (!b) return;\n'
            '    b.classList.remove(\'dd-connect-flash\');\n'
            '    void b.offsetWidth;\n'
            '    b.classList.add(\'dd-connect-flash\');\n'
            '    setTimeout(function(){b.classList.remove(\'dd-connect-flash\');}, 650);\n'
            '  });\n'
            '}')
assert OLD_SAVE in s, "ERROR: _ddCreateEdge tail not found"
s = s.replace(OLD_SAVE, NEW_SAVE, 1)

# ── 4. Inject P5 CSS after end-P4 marker ─────────────────────────────────
ANCHOR_CSS = "/* ===== end P4 ============================================================ */"
assert ANCHOR_CSS in s

P5_CSS = """
/* ===== P5 — Constellation Canvas ======================================== */

/* --- Edge: glow filter + thicker stroke -------------------------------- */
.dd-edge-path{
  stroke-width:2.5!important;
  filter:url(#dd-edge-glow)!important;
  opacity:.9!important
}
.dd-edge-ghost{
  stroke-width:2!important;
  stroke-dasharray:6 4!important;
  opacity:.55!important
}
html.reduce-motion .dd-edge-path{filter:none!important}

/* --- Node bubble: larger, resting glow, luminous orb ------------------- */
.dd-node-bubble{
  width:72px!important;height:72px!important;
  border-width:2px!important;
  box-shadow:
    0 6px 20px rgba(0,0,0,.45),
    0 0 14px var(--dd-mod-glow,rgba(221,184,255,.25)),
    inset 0 1px 0 rgba(255,255,255,.14)!important;
  transition:box-shadow .22s,border-color .22s,transform .18s!important
}
.dd-node-wrap{width:72px!important;height:72px!important}
.dd-node:hover .dd-node-bubble{
  border-color:var(--dd-mod-color,rgba(221,184,255,.7))!important;
  box-shadow:
    0 10px 32px rgba(0,0,0,.5),
    0 0 28px var(--dd-mod-glow,rgba(221,184,255,.45)),
    inset 0 1px 0 rgba(255,255,255,.18)!important;
  transform:scale(1.06)!important
}

/* Node label: slightly larger + brighter */
.dd-node-label{
  font:600 9.5px/1.3 'Sora','Inter',sans-serif!important;
  color:var(--p3-muted,#b6a9c4)!important;
  letter-spacing:.02em!important;
  text-shadow:0 1px 4px rgba(0,0,0,.5)!important
}

/* Running glow: keeps existing dd-node-glow keyframe, just intensified */
.dd-node.dd-node-running .dd-node-bubble{
  animation:dd-node-glow .9s ease-in-out infinite!important;
  border-color:var(--dd-mod-color,#ddb8ff)!important
}

/* Connect flash: ring-ripple on successful edge creation */
@keyframes dd-connect-pulse{
  0%{box-shadow:0 0 0 0 var(--dd-mod-glow,rgba(221,184,255,.7)),0 6px 20px rgba(0,0,0,.45)}
  45%{box-shadow:0 0 0 14px rgba(221,184,255,.0),0 0 40px rgba(221,184,255,.55)}
  100%{box-shadow:0 0 0 0 rgba(221,184,255,.0),0 6px 20px rgba(0,0,0,.45)}
}
.dd-connect-flash{animation:dd-connect-pulse .6s cubic-bezier(.34,1.56,.64,1) forwards!important}
html.reduce-motion .dd-connect-flash{animation:none!important}

/* Status dots: slightly larger */
.dd-node-status{
  width:10px!important;height:10px!important;
  top:2px!important;right:2px!important;
  border-width:2px!important
}

/* --- Empty canvas: constellation invitation ----------------------------- */
.dd-agents-empty{
  position:absolute;inset:0;z-index:2;
  background:transparent!important
}
.dd-agents-title{
  font:700 20px/1.2 'Sora','Inter',sans-serif!important;
  color:var(--p3-surface,#eadfed)!important;
  letter-spacing:-.3px!important
}
.dd-agents-hint{
  font:400 13px/1.6 'Inter',sans-serif!important;
  color:var(--p3-muted,#b6a9c4)!important;
  text-align:center!important
}
.dd-orbital-ring{border-width:1.5px!important}
.dd-orbital-ring-1{border-color:rgba(221,184,255,.30)!important}
.dd-orbital-ring-2{border-color:rgba(76,215,246,.28)!important}
.dd-orbital-ring-3{border-color:rgba(221,184,255,.22)!important}
.dd-orbital-icon{color:var(--dd-primary)!important;opacity:.8!important}

/* --- Result cards: premium glass + top accent border -------------------- */
.dd-result-card{
  background:var(--glass-bg)!important;
  backdrop-filter:blur(32px) saturate(160%)!important;
  -webkit-backdrop-filter:blur(32px) saturate(160%)!important;
  border:1px solid rgba(221,184,255,.20)!important;
  border-top:2.5px solid var(--dd-mod-color,var(--dd-primary))!important;
  border-radius:14px!important;
  box-shadow:0 16px 48px rgba(0,0,0,.55),
             0 0 0 1px rgba(221,184,255,.06),
             0 0 24px rgba(221,184,255,.08)!important;
  min-width:180px!important;max-width:260px!important
}

/* --- Run-agent + report buttons: cosmic style --------------------------- */
#dd-run-agent-btn,#dd-rpt-agent-btn,#dd-focus-btn{
  height:36px!important;padding:0 18px!important;
  border-radius:10px!important;
  font:700 12px/1 'Sora','Inter',sans-serif!important;
  cursor:pointer!important;transition:all .18s!important
}
#dd-run-agent-btn{
  background:linear-gradient(120deg,var(--dd-primary),var(--dd-secondary))!important;
  color:#1c1430!important;border:none!important;
  box-shadow:0 4px 18px rgba(221,184,255,.35)!important
}
#dd-run-agent-btn:hover{
  box-shadow:0 6px 28px rgba(221,184,255,.5)!important;
  transform:translateY(-1px)!important
}
#dd-rpt-agent-btn,#dd-focus-btn{
  background:rgba(221,184,255,.10)!important;
  border:1px solid rgba(221,184,255,.25)!important;
  color:var(--dd-primary)!important
}
#dd-rpt-agent-btn:hover,#dd-focus-btn:hover{
  background:rgba(221,184,255,.18)!important;
  box-shadow:0 0 14px rgba(221,184,255,.20)!important
}

/* --- Ask bar: glass treatment ------------------------------------------- */
#dd-ask-bar{
  background:var(--glass-bg)!important;
  backdrop-filter:blur(28px)!important;
  -webkit-backdrop-filter:blur(28px)!important;
  border:1px solid rgba(221,184,255,.16)!important;
  border-radius:14px!important;
  box-shadow:0 8px 32px rgba(0,0,0,.3)!important
}
#dd-ask-input{
  background:rgba(255,255,255,.05)!important;
  border:1px solid rgba(221,184,255,.16)!important;
  border-radius:9px!important;
  color:var(--p3-surface,#eadfed)!important;
  font-family:'Inter',sans-serif!important
}
#dd-ask-input:focus{
  border-color:var(--dd-primary)!important;
  box-shadow:0 0 0 3px rgba(221,184,255,.16)!important;
  outline:none!important
}
#dd-ask-btn{
  background:linear-gradient(120deg,rgba(221,184,255,.22),rgba(76,215,246,.15))!important;
  border:1px solid rgba(221,184,255,.28)!important;
  border-radius:9px!important;
  color:var(--dd-primary)!important;
  font:700 11.5px/1 'Sora','Inter',sans-serif!important;
  padding:0 14px!important;height:30px!important;cursor:pointer!important;
  transition:all .15s!important
}
#dd-ask-btn:hover{
  background:rgba(221,184,255,.28)!important;
  box-shadow:0 0 14px rgba(221,184,255,.20)!important
}
.dd-ask-chip{
  background:rgba(221,184,255,.08)!important;
  border:1px solid rgba(221,184,255,.16)!important;
  border-radius:999px!important;
  color:var(--p3-muted,#b6a9c4)!important;
  font-family:'Inter',sans-serif!important;font-size:11px!important;
  padding:3px 10px!important;cursor:pointer!important;
  transition:all .14s!important
}
.dd-ask-chip:hover{
  background:rgba(221,184,255,.16)!important;
  color:var(--dd-primary)!important;
  border-color:rgba(221,184,255,.30)!important
}
#dd-ai-hint{
  font:400 11px/1 'Inter',sans-serif!important;
  color:var(--p3-muted,#b6a9c4)!important;
  opacity:.6!important
}

/* === end P5 ============================================================= */
"""

s = s.replace(ANCHOR_CSS, ANCHOR_CSS + P5_CSS, 1)

# Write both copies
out = s.encode("utf-8")
PUB.write_bytes(out)
DL.write_bytes(out)

sha = hashlib.sha256(out).hexdigest()
print(f"P5 done. {len(out):,} bytes | SHA-256: {sha}")

# Sanity checks
assert "dd-edge-glow" in s
assert "dd-connect-pulse" in s
assert "dd-connect-flash" in s
assert "अपने तारामंडल में मॉड्यूल खींचें" in s
assert "feGaussianBlur" in s
assert "#dd-run-agent-btn" in s
assert "/* === end P5" in s
print("All P5 sanity checks passed.")
