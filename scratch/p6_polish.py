"""
PRD Batch P6 — Onboarding, Empty States & Final Polish
- Tour card: glass + Sora + entrance animation + bilingual overlay
- All view empty states elevated (X-Ray, What-If, Audit)
- Onboarding tip: glass upgrade
- View-transition fade improved
- Light-theme dual-surface audit pass
- Body text-rendering smooth
"""

import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB  = ROOT / "public"  / "Simple-Data-Analyser.html"
DL   = ROOT / "download" / "Simple-Data-Analyser.html"

raw = PUB.read_bytes()
s   = raw.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")

ANCHOR_CSS = "/* === end P5 ============================================================= */"
assert ANCHOR_CSS in s, "end-P5 marker not found"

P6_CSS = """
/* ===== P6 — Onboarding, Empty States, Final Polish ===================== */

/* --- Smooth text rendering across the app ------------------------------ */
body,input,button,select,textarea{
  -webkit-font-smoothing:antialiased!important;
  -moz-osx-font-smoothing:grayscale!important;
  text-rendering:optimizeLegibility!important
}

/* --- Tour overlay backdrop: deeper blur -------------------------------- */
#dd-tour-backdrop{
  background:rgba(5,8,22,.82)!important;
  backdrop-filter:blur(8px) saturate(120%)!important;
  -webkit-backdrop-filter:blur(8px) saturate(120%)!important
}

/* Tour card entrance */
@keyframes p6TourIn{
  from{opacity:0;transform:translate(-50%,-50%) scale(.92)}
  to{opacity:1;transform:translate(-50%,-50%) scale(1)}
}
@keyframes p6TourInAnchored{
  from{opacity:0;transform:translateY(10px)}
  to{opacity:1;transform:translateY(0)}
}

/* --- Tour card: glass system ------------------------------------------ */
.dd-tour-card{
  background:rgba(16,12,24,.96)!important;
  backdrop-filter:blur(48px) saturate(160%)!important;
  -webkit-backdrop-filter:blur(48px) saturate(160%)!important;
  border:1px solid rgba(221,184,255,.32)!important;
  border-radius:20px!important;
  padding:26px 24px 18px!important;
  box-shadow:
    0 32px 80px rgba(0,0,0,.75),
    0 0 0 1px rgba(221,184,255,.06),
    0 0 40px rgba(221,184,255,.06)!important;
  min-width:280px!important;max-width:360px!important
}
.dd-tour-card[style*="translate(-50%,-50%)"]{
  animation:p6TourIn .3s cubic-bezier(.34,1.26,.64,1) both
}

/* Tour dots: larger, softer */
.dd-tour-dots{margin-bottom:16px!important}
.dd-tour-dot{
  width:8px!important;height:8px!important;
  background:rgba(221,184,255,.18)!important;
  transition:background .25s,transform .25s!important
}
.dd-tour-dot.active{
  background:var(--dd-primary,#ddb8ff)!important;
  transform:scale(1.25)!important
}

/* Tour title: Sora headline */
.dd-tour-title{
  font:700 16px/1.3 'Sora','Inter',sans-serif!important;
  color:#f0e8f6!important;
  margin:0 0 9px!important;
  letter-spacing:-.2px!important
}

/* Tour body: Inter, readable */
.dd-tour-body{
  font:400 12.5px/1.7 'Inter',sans-serif!important;
  color:rgba(234,223,237,.72)!important;
  margin-bottom:20px!important
}

/* Tour next button: cosmic gradient */
.dd-tour-next{
  height:34px!important;padding:0 20px!important;
  background:linear-gradient(120deg,var(--dd-primary,#ddb8ff),var(--dd-secondary,#4cd7f6))!important;
  border-radius:10px!important;
  color:#1c1430!important;
  font:700 11.5px/1 'Sora','Inter',sans-serif!important;
  box-shadow:0 4px 16px rgba(221,184,255,.35)!important;
  border:none!important
}
.dd-tour-next:hover{
  box-shadow:0 6px 22px rgba(221,184,255,.5)!important;
  transform:translateY(-1px)!important
}

/* Skip link: muted */
.dd-tour-skip{
  font:400 11px/1 'Inter',sans-serif!important;
  color:rgba(234,223,237,.38)!important;
  letter-spacing:.02em!important
}
.dd-tour-skip:hover{color:rgba(234,223,237,.65)!important}

/* Empty tour button (agents canvas): already glass from P5; refine */
.dd-empty-tour-btn{
  font:600 11px/1 'Sora','Inter',sans-serif!important
}

/* --- Onboarding tip: glass upgrade ------------------------------------- */
#onboarding-tip{
  background:rgba(16,12,24,.96)!important;
  backdrop-filter:blur(36px) saturate(140%)!important;
  -webkit-backdrop-filter:blur(36px) saturate(140%)!important;
  border:1px solid rgba(221,184,255,.26)!important;
  border-radius:14px!important;
  box-shadow:0 16px 48px rgba(0,0,0,.55),0 0 0 1px rgba(221,184,255,.05)!important;
  color:rgba(234,223,237,.9)!important;
  font:400 12px/1.6 'Inter',sans-serif!important
}
[data-theme="light"] #onboarding-tip{
  background:rgba(255,255,255,.96)!important;
  border-color:rgba(126,34,206,.20)!important;
  color:#102033!important
}

/* --- X-Ray empty state ------------------------------------------------- */
.xr-empty{
  display:flex!important;
  flex-direction:column!important;
  align-items:center!important;
  gap:10px!important;
  padding:36px 16px!important;
  font:400 12px/1.7 'Inter',sans-serif!important;
  color:rgba(221,184,255,.45)!important;
  text-align:center!important
}
.xr-empty::before{
  content:'⊙';
  font-size:28px!important;
  opacity:.35!important;
  display:block!important;
  line-height:1!important
}

/* X-Ray detail empty */
.xr-detail-empty{
  font:400 11px/1.5 'Inter',sans-serif!important;
  color:rgba(234,223,237,.28)!important
}

/* --- What-If empty state ----------------------------------------------- */
.wi-nodata{
  display:flex!important;
  flex-direction:column!important;
  align-items:center!important;
  justify-content:center!important;
  height:100%!important;
  gap:10px!important;
  padding:48px 24px!important;
  font:400 13px/1.7 'Inter',sans-serif!important;
  color:rgba(221,184,255,.50)!important;
  text-align:center!important
}
.wi-nodata::before{
  content:'∿';
  font-size:36px!important;
  opacity:.30!important;
  display:block!important;
  line-height:1!important
}

/* --- Audit empty states ------------------------------------------------- */
.pv-detail-empty{
  font:400 11.5px/1.6 'Inter',sans-serif!important;
  color:rgba(234,223,237,.30)!important;
  padding:20px 12px!important;
  text-align:center!important
}
/* Empty event list: shown via JS as first child */
#pv-event-list:empty::after{
  content:'No events yet — start working with your data\a कोई घटना नहीं — डेटा के साथ काम शुरू करें';
  white-space:pre;
  display:block!important;
  padding:32px 16px!important;
  text-align:center!important;
  font:400 11.5px/1.7 'Inter',sans-serif!important;
  color:rgba(221,184,255,.35)!important
}

/* --- View-transition fade: slightly faster + smooth ------------------- */
#content{transition:opacity .12s ease!important}

/* --- Light-theme dual-surface audit ------------------------------------ */
/* Tour card in light mode */
[data-theme="light"] .dd-tour-card{
  background:rgba(255,255,255,.97)!important;
  border-color:rgba(126,34,206,.20)!important;
  box-shadow:0 24px 60px rgba(0,0,0,.18),0 0 0 1px rgba(126,34,206,.06)!important
}
[data-theme="light"] .dd-tour-title{color:#1c1430!important}
[data-theme="light"] .dd-tour-body{color:rgba(28,20,48,.65)!important}
[data-theme="light"] #dd-tour-backdrop{background:rgba(200,195,220,.55)!important}

/* Light-mode empty state text */
[data-theme="light"] .xr-empty,
[data-theme="light"] .wi-nodata,
[data-theme="light"] .pv-detail-empty,
[data-theme="light"] #pv-event-list:empty::after{
  color:rgba(126,34,206,.45)!important
}

/* --- Anchor-chip hover: tighten focus ring ----------------------------- */
.dd-anchor:focus-visible{
  outline:2px solid var(--dd-primary,#ddb8ff)!important;
  outline-offset:2px!important
}

/* === end P6 ============================================================= */
"""

s = s.replace(ANCHOR_CSS, ANCHOR_CSS + P6_CSS, 1)

# Write both copies
out = s.encode("utf-8")
PUB.write_bytes(out)
DL.write_bytes(out)

sha = hashlib.sha256(out).hexdigest()
print(f"P6 done. {len(out):,} bytes | SHA-256: {sha}")

# Sanity checks
assert "p6TourIn" in s
assert "dd-tour-card" in s
assert ".xr-empty" in s and "::before" in s
assert ".wi-nodata" in s
assert ".pv-detail-empty" in s
assert "#onboarding-tip" in s and "backdrop-filter:blur(36px)" in s
assert "/* === end P6" in s
assert "-webkit-font-smoothing:antialiased" in s
print("All P6 sanity checks passed.")
