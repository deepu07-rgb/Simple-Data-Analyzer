"""
FIX: Repair the JavaScript SyntaxError caused by the unclosed template literal
in executePrint().

ROOT CAUSE:
  p2_chrome.py used s.replace("</body>", P2_JS, 1) which replaced the FIRST
  </body> in the file — the one INSIDE executePrint()'s template literal.
  p4_cosmos.py then injected P4 before P2, both still inside the template
  literal area. The browser's HTML parser sees the P4 </script> tag as the
  main script's close, leaving the template literal unclosed → SyntaxError.

THE FIX (single atomic replacement):
  1. Restore the template literal content: </body>, </html>, `);, etc.
  2. Keep P4 and P2 as INLINE JavaScript (no <script>/<\\/script> wrappers)
     so no spurious tags appear inside the main script content.

After the fix, the main script runs from its <script> at ~line 4446 all the
way to the original </script> at ~line 16706 (the async-export block close).
"""

import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB  = ROOT / "public"  / "Simple-Data-Analyser.html"
DL   = ROOT / "download" / "Simple-Data-Analyser.html"

raw = PUB.read_bytes()
s   = raw.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")

# ── The broken section (lines 14416–14467 in the current file) ───────────────
OLD = (
    "        <script>window.onload = function() { window.print(); window.close(); }<\\/script>\n"
    "      \n"
    "<script>\n"
    "/* P4 — Pointer parallax on #dd-cosmos (dark theme, no reduce-motion) */\n"
    "(function(){\n"
    "  var cosmos = document.getElementById('dd-cosmos');\n"
    "  if (!cosmos) return;\n"
    "  var lastX = 0, lastY = 0;\n"
    "  document.addEventListener('mousemove', function(e){\n"
    "    var theme = document.documentElement.dataset.theme;\n"
    "    if (theme !== 'dark') return;\n"
    "    if (document.documentElement.classList.contains('reduce-motion')) return;\n"
    "    var nx = (e.clientX / window.innerWidth  - 0.5) * 20;\n"
    "    var ny = (e.clientY / window.innerHeight - 0.5) * 14;\n"
    "    if (Math.abs(nx - lastX) < 0.4 && Math.abs(ny - lastY) < 0.4) return;\n"
    "    lastX = nx; lastY = ny;\n"
    "    cosmos.style.transform = 'translate3d('+nx.toFixed(1)+'px,'+ny.toFixed(1)+'px,0)';\n"
    "  }, {passive:true});\n"
    "  /* Reset transform when leaving window */\n"
    "  document.addEventListener('mouseleave', function(){\n"
    "    cosmos.style.transform = 'translate3d(0,0,0)';\n"
    "  });\n"
    "})();\n"
    "</script>\n"
    "<script>\n"
    "/* P2 — overflow ⋮ menu helpers */\n"
    "function _p2ToggleOverflow(){\n"
    "  var m=document.getElementById('p2OverflowMenu');\n"
    "  var b=document.getElementById('p2OverflowBtn');\n"
    "  if(!m)return;\n"
    "  var open=m.classList.toggle('open');\n"
    "  if(b)b.setAttribute('aria-expanded',open);\n"
    "  if(open){\n"
    "    setTimeout(function(){document.addEventListener('click',_p2Outside,{once:true,capture:true})},0);\n"
    "  }\n"
    "}\n"
    "function _p2CloseOverflow(){\n"
    "  var m=document.getElementById('p2OverflowMenu');\n"
    "  var b=document.getElementById('p2OverflowBtn');\n"
    "  if(m)m.classList.remove('open');\n"
    "  if(b)b.setAttribute('aria-expanded','false');\n"
    "}\n"
    "function _p2Outside(e){\n"
    "  var w=document.getElementById('p2OverflowWrap');\n"
    "  if(w&&!w.contains(e.target))_p2CloseOverflow();\n"
    "}\n"
    "</script>\n"
    "</body>\n"
    "    </html>\n"
    "  `);\n"
    "  printWindow.document.close();\n"
    "}"
)

# ── Correct replacement: template literal properly closed, then P4 and P2 as
#    plain inline JS (no <script>/<\/script> wrappers inside the main script) ─
NEW = (
    "        <script>window.onload = function() { window.print(); window.close(); }<\\/script>\n"
    "      </body>\n"
    "    </html>\n"
    "  `);\n"
    "  printWindow.document.close();\n"
    "}\n"
    "/* P4 — Pointer parallax on #dd-cosmos (dark theme, no reduce-motion) */\n"
    "(function(){\n"
    "  var cosmos = document.getElementById('dd-cosmos');\n"
    "  if (!cosmos) return;\n"
    "  var lastX = 0, lastY = 0;\n"
    "  document.addEventListener('mousemove', function(e){\n"
    "    var theme = document.documentElement.dataset.theme;\n"
    "    if (theme !== 'dark') return;\n"
    "    if (document.documentElement.classList.contains('reduce-motion')) return;\n"
    "    var nx = (e.clientX / window.innerWidth  - 0.5) * 20;\n"
    "    var ny = (e.clientY / window.innerHeight - 0.5) * 14;\n"
    "    if (Math.abs(nx - lastX) < 0.4 && Math.abs(ny - lastY) < 0.4) return;\n"
    "    lastX = nx; lastY = ny;\n"
    "    cosmos.style.transform = 'translate3d('+nx.toFixed(1)+'px,'+ny.toFixed(1)+'px,0)';\n"
    "  }, {passive:true});\n"
    "  /* Reset transform when leaving window */\n"
    "  document.addEventListener('mouseleave', function(){\n"
    "    cosmos.style.transform = 'translate3d(0,0,0)';\n"
    "  });\n"
    "})();\n"
    "/* P2 — overflow ⋮ menu helpers */\n"
    "function _p2ToggleOverflow(){\n"
    "  var m=document.getElementById('p2OverflowMenu');\n"
    "  var b=document.getElementById('p2OverflowBtn');\n"
    "  if(!m)return;\n"
    "  var open=m.classList.toggle('open');\n"
    "  if(b)b.setAttribute('aria-expanded',open);\n"
    "  if(open){\n"
    "    setTimeout(function(){document.addEventListener('click',_p2Outside,{once:true,capture:true})},0);\n"
    "  }\n"
    "}\n"
    "function _p2CloseOverflow(){\n"
    "  var m=document.getElementById('p2OverflowMenu');\n"
    "  var b=document.getElementById('p2OverflowBtn');\n"
    "  if(m)m.classList.remove('open');\n"
    "  if(b)b.setAttribute('aria-expanded','false');\n"
    "}\n"
    "function _p2Outside(e){\n"
    "  var w=document.getElementById('p2OverflowWrap');\n"
    "  if(w&&!w.contains(e.target))_p2CloseOverflow();\n"
    "}"
)

assert OLD in s, (
    "OLD section not found in file — check for CRLF or encoding mismatch"
)
assert OLD.count(OLD) == s.count(OLD), "Multiple matches — unsafe to replace"

count_before = s.count(OLD)
assert count_before == 1, f"Expected exactly 1 match, found {count_before}"

s2 = s.replace(OLD, NEW, 1)

# ── Sanity checks ─────────────────────────────────────────────────────────────
# 1. Template literal properly closed inside main script
assert "`      </body>" not in s2, "Stray backtick+spaces before </body>"
assert "    </html>\n  `);" in s2,  "Template literal close sequence missing"
assert "</body>\n    </html>\n  `);\n  printWindow.document.close();\n}" in s2, \
    "executePrint tail not restored"

# 2. No <script>/<\/script> wrapper around P4 (would break the main script)
assert "<script>\n/* P4" not in s2, \
    "P4 still has a <script> wrapper — would cause SyntaxError in main script"
assert "</script>\n/* P2" not in s2, \
    "P2 block still has a </script> prefix — indicates wrapper not removed"

# 3. P4 IIFE and P2 helpers still present
assert "cosmos.style.transform = 'translate3d('" in s2, "P4 IIFE missing"
assert "function _p2ToggleOverflow" in s2,              "P2 helpers missing"
assert "_p2CloseOverflow" in s2,                        "P2 close helper missing"

# 4. The orphaned executePrint tail is gone (it's now in the right place)
orphan_check = "</script>\n</body>\n    </html>\n  `);"
assert orphan_check not in s2, "Orphaned tail still present"

# 5. Both copies must be identical
out = s2.encode("utf-8")
PUB.write_bytes(out)
DL .write_bytes(out)

pub_sha = hashlib.sha256(PUB.read_bytes()).hexdigest()
dl_sha  = hashlib.sha256(DL .read_bytes()).hexdigest()
assert pub_sha == dl_sha, "public/ and download/ differ!"

print(f"Fix applied. {len(out):,} bytes")
print(f"SHA-256: {pub_sha}")
print("public/ == download/  ✓")
print()
print("What changed:")
print("  - Restored </body>, </html>, `);, printWindow.document.close(), }")
print("    back inside the main <script> (executePrint template literal closed)")
print("  - P4 parallax IIFE kept as inline JS (no <script> wrapper)")
print("  - P2 overflow helpers kept as inline JS (no <script> wrapper)")
print("  - Orphaned executePrint tail removed from HTML context")
print()
print("Main script now spans ~line 4446 → ~line 16706 (original close).")
print("All app functions are back inside the main script block.")
