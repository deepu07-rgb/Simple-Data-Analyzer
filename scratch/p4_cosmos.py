"""
PRD Batch P4 — Living Cosmos Elevated
- Nebula drift layer (CSS ::before on #dd-cosmos)
- Pointer parallax (JS mousemove → CSS transition on #dd-cosmos)
- Welcome hero elevated (Sora 64px wordmark, glass drop-zone, cosmic cards)
- Reduce-motion: nebula + parallax both freeze
- Dual-surface rule preserved (grid surface untouched)
"""

import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB  = ROOT / "public"  / "Simple-Data-Analyser.html"
DL   = ROOT / "download" / "Simple-Data-Analyser.html"

raw = PUB.read_bytes()
s   = raw.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")

ANCHOR_CSS = "/* ===== end P3 ============================================================ */"
assert ANCHOR_CSS in s

P4_CSS = """
/* ===== P4 — Living Cosmos Elevated ====================================== */

/* --- Nebula drift layer (::before on #dd-cosmos, clipped to viewport) --- */
#dd-cosmos::before{
  content:'';
  position:absolute;
  inset:-30%;
  background:
    radial-gradient(ellipse 55% 38% at 18% 28%, rgba(126,34,206,.22) 0%, transparent 60%),
    radial-gradient(ellipse 45% 32% at 78% 68%, rgba(76,215,246,.15) 0%, transparent 55%),
    radial-gradient(ellipse 38% 28% at 52% 8%,  rgba(221,184,255,.12) 0%, transparent 50%),
    radial-gradient(ellipse 30% 22% at 88% 22%, rgba(76,215,246,.09) 0%, transparent 48%);
  animation:czNebula 32s ease-in-out infinite;
  will-change:transform,opacity;
  pointer-events:none
}
@keyframes czNebula{
  0%,100%{transform:translate3d(0,0,0) scale(1);opacity:.9}
  30%{transform:translate3d(24px,-18px,0) scale(1.06);opacity:.75}
  65%{transform:translate3d(-18px,22px,0) scale(.95);opacity:.85}
}
[data-theme="light"] #dd-cosmos::before{opacity:.4}

/* Pointer parallax: CSS transition does all the interpolation (GPU) */
[data-theme="dark"] #dd-cosmos{
  transition:transform 1.6s cubic-bezier(.25,.46,.45,.94)
}

/* Freeze nebula + parallax on reduce-motion */
html.reduce-motion #dd-cosmos{transition:none!important;transform:none!important}
html.reduce-motion #dd-cosmos::before{animation:none!important}
@media(prefers-reduced-motion:reduce){
  #dd-cosmos{transition:none!important;transform:none!important}
  #dd-cosmos::before{animation:none!important}
}

/* --- Welcome screen: full-bleed hero, universe as dominant visual --- */
#welcome{
  background:transparent!important;
  padding:48px 24px 40px!important;
  justify-content:flex-start!important
}
#welcome .hero-section{
  margin-bottom:32px!important;
  display:flex!important;
  flex-direction:column!important;
  align-items:center!important
}

/* Large Sora wordmark */
#welcome h1{
  font:750 62px/1 'Sora','Inter',sans-serif!important;
  letter-spacing:-2.5px!important;
  margin-bottom:6px!important;
  background:linear-gradient(110deg,var(--dd-primary),var(--dd-secondary),var(--dd-primary))!important;
  background-size:220% 100%!important;
  -webkit-background-clip:text!important;background-clip:text!important;
  -webkit-text-fill-color:transparent!important;color:transparent!important;
  animation:stelWordmark 8s ease-in-out infinite!important
}
@keyframes stelWordmark{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
html.reduce-motion #welcome h1,
[data-theme="light"] #welcome h1{animation:none!important;background-position:0% 50%!important}

/* Devanagari brand line */
#welcome .hero-section > div:first-of-type{
  font-size:20px!important;font-weight:700!important;
  color:var(--dd-secondary)!important;
  letter-spacing:.8px!important;
  margin-top:-2px!important;margin-bottom:10px!important;
  opacity:.9!important;
  text-shadow:0 0 20px rgba(76,215,246,.4)!important
}

/* Hero tagline */
#welcome .hero-tagline,#welcome .hero-section p{
  font:400 13.5px/1.65 'Inter',sans-serif!important;
  color:var(--p3-muted,#b6a9c4)!important;
  max-width:440px!important;
  text-align:center!important
}

/* --- Drop zone: glass card, cosmic hover glow --- */
.drop-zone{
  background:var(--glass-bg)!important;
  backdrop-filter:blur(28px) saturate(140%)!important;
  -webkit-backdrop-filter:blur(28px) saturate(140%)!important;
  border:1.5px dashed rgba(221,184,255,.30)!important;
  border-radius:20px!important;
  box-shadow:0 8px 32px rgba(0,0,0,.28),0 0 0 1px rgba(221,184,255,.07)!important;
  transition:border-color .25s,box-shadow .25s,transform .25s cubic-bezier(.34,1.56,.64,1)!important
}
.drop-zone::before{display:none!important}
.drop-zone:hover,.drop-zone.drag-over{
  border-color:rgba(221,184,255,.65)!important;
  box-shadow:
    0 16px 52px rgba(0,0,0,.40),
    0 0 0 1px rgba(221,184,255,.18),
    0 0 48px rgba(221,184,255,.12)!important;
  transform:translateY(-4px)!important;
  background:rgba(221,184,255,.06)!important
}
.drop-zone svg{color:var(--dd-primary)!important;filter:drop-shadow(0 0 8px rgba(221,184,255,.4))!important}
.drop-zone h3{color:var(--p3-surface,#eadfed)!important;font-family:'Sora','Inter',sans-serif!important}
.drop-zone p{color:var(--p3-muted,#b6a9c4)!important}
[data-theme="light"] .drop-zone{
  border-color:rgba(126,34,206,.22)!important;
  box-shadow:0 8px 28px rgba(0,0,0,.10)!important
}

/* --- Paste textarea: glass --- */
#welcome .paste-area textarea{
  background:rgba(255,255,255,.05)!important;
  border:1px solid rgba(221,184,255,.16)!important;
  border-radius:12px!important;
  color:var(--p3-surface,#eadfed)!important;
  font-family:'Inter',monospace!important;
  transition:border-color .15s,box-shadow .15s!important
}
#welcome .paste-area textarea:focus{
  border-color:var(--dd-primary)!important;
  box-shadow:0 0 0 3px rgba(221,184,255,.18)!important;
  outline:none!important;
  background:rgba(221,184,255,.04)!important
}
[data-theme="light"] #welcome .paste-area textarea{
  background:rgba(255,255,255,.7)!important;
  border-color:rgba(126,34,206,.18)!important;color:#102033!important
}

/* --- Feature cards: glass with cosmic hover --- */
.feature-card{
  background:var(--glass-bg)!important;
  backdrop-filter:blur(20px)!important;
  -webkit-backdrop-filter:blur(20px)!important;
  border:1px solid rgba(221,184,255,.13)!important;
  border-radius:14px!important;
  transition:transform .28s cubic-bezier(.34,1.56,.64,1),
             border-color .2s,box-shadow .2s!important
}
.feature-card:hover{
  border-color:rgba(221,184,255,.35)!important;
  transform:translateY(-4px)!important;
  box-shadow:0 12px 36px rgba(0,0,0,.35),0 0 0 1px rgba(221,184,255,.12),
             0 0 24px rgba(221,184,255,.08)!important
}
.feature-card h4{color:var(--p3-surface,#eadfed)!important;font-family:'Sora','Inter',sans-serif!important}
.feature-card p{color:var(--p3-muted,#b6a9c4)!important}
.feature-card .fc-icon{
  background:linear-gradient(135deg,rgba(221,184,255,.15),rgba(76,215,246,.10))!important;
  border:1px solid rgba(221,184,255,.16)!important;border-radius:10px!important
}

/* --- Sample dataset cards: cosmic glass --- */
.sample-ds-card{
  background:var(--glass-bg)!important;
  backdrop-filter:blur(20px)!important;
  -webkit-backdrop-filter:blur(20px)!important;
  border:1px solid rgba(221,184,255,.14)!important;
  border-radius:12px!important;
  transition:transform .25s cubic-bezier(.34,1.56,.64,1),
             border-color .18s,box-shadow .18s!important
}
.sample-ds-card:hover{
  transform:translateY(-3px)!important;
  box-shadow:0 10px 32px rgba(0,0,0,.35),0 0 0 1px rgba(221,184,255,.14)!important
}
.sample-ds-card .sds-name{color:var(--p3-surface,#eadfed)!important;font-family:'Inter',sans-serif!important}
.sample-ds-card .sds-desc{color:var(--p3-muted,#b6a9c4)!important}

/* ===== end P4 ============================================================ */
"""

s = s.replace(ANCHOR_CSS, ANCHOR_CSS + P4_CSS, 1)

# Inject pointer-parallax JS just before the P2 script block
P4_JS = """<script>
/* P4 — Pointer parallax on #dd-cosmos (dark theme, no reduce-motion) */
(function(){
  var cosmos = document.getElementById('dd-cosmos');
  if (!cosmos) return;
  var lastX = 0, lastY = 0;
  document.addEventListener('mousemove', function(e){
    var theme = document.documentElement.dataset.theme;
    if (theme !== 'dark') return;
    if (document.documentElement.classList.contains('reduce-motion')) return;
    var nx = (e.clientX / window.innerWidth  - 0.5) * 20;
    var ny = (e.clientY / window.innerHeight - 0.5) * 14;
    if (Math.abs(nx - lastX) < 0.4 && Math.abs(ny - lastY) < 0.4) return;
    lastX = nx; lastY = ny;
    cosmos.style.transform = 'translate3d('+nx.toFixed(1)+'px,'+ny.toFixed(1)+'px,0)';
  }, {passive:true});
  /* Reset transform when leaving window */
  document.addEventListener('mouseleave', function(){
    cosmos.style.transform = 'translate3d(0,0,0)';
  });
})();
</script>
"""

# Inject before the P2 script block
P2_SCRIPT_ANCHOR = "<script>\n/* P2 — overflow ⋮ menu helpers */"
assert P2_SCRIPT_ANCHOR in s
s = s.replace(P2_SCRIPT_ANCHOR, P4_JS + P2_SCRIPT_ANCHOR, 1)

# Write both copies
out = s.encode("utf-8")
PUB.write_bytes(out)
DL.write_bytes(out)

sha = hashlib.sha256(out).hexdigest()
print(f"P4 done. {len(out):,} bytes | SHA-256: {sha}")

# Sanity checks
assert "czNebula" in s
assert "stelWordmark" in s
assert "pointer-parallax" in s or "Pointer parallax" in s
assert "backdrop-filter:blur(28px)" in s   # drop-zone
assert "/* ===== end P4" in s
print("All P4 sanity checks passed.")
