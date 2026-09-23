# Stellura — Premium "Living Universe" UI/UX PRD (Mini)

**Owner:** Neeraj Purohit (Founder/Product)
**Author:** CTO
**Version:** 1.0 — 2026-06-16
**Status:** Ready for execution
**Product:** Stellura (स्टेल्यूरा) — *Living Data Intelligence*. Offline-first, privacy-first data analysis for government + MSME, global.

---

## 0. Why this document exists

The engine works. The app launches. But the **surface does not yet look or feel like a premium product.** A founder demo of this UI to a paying MSME or a government secretary would not land. This PRD defines — precisely and testably — the gap between *what exists* and *what "premium universe" means*, so that each implementation agent delivers a result that passes objective acceptance criteria, not a subjective "looks fine to me."

**Read this rule first:** "Done" is defined by the acceptance checklists in Section 5, verified in a real browser per Section 6. An agent that has not run the verification has not finished the task.

---

## 1. Non-negotiable constraints (violating ANY of these = task failed)

These are permanent product constraints. They override convenience.

1. **100% OFFLINE.** No CDN, no Google Fonts, no runtime network calls for assets. Every font/icon/library is embedded or served locally by Flask. If you add a library, it must have an offline fallback.
2. **Single-file SPA.** All UI lives in `public/Simple-Data-Analyser.html`. No build step, no framework.
3. **Byte-identical copies.** `public/Simple-Data-Analyser.html` and `download/Simple-Data-Analyser.html` MUST be byte-identical after every change. Edit `public/`, then copy it over `download/`. Verify with `sha256sum` — identical hash is part of Done.
4. **Bilingual (Hindi + English).** Every user-facing string has both. Devanagari renders from the locally-served `static/fonts/NotoSansDevanagari-Regular.ttf`. The brand is **Stellura / स्टेल्यूरा**.
5. **No causal language anywhere.** Use "associated with", "linked to", "trend" — never "causes", "drives", "because of".
6. **Pointer-event drag only** on the Agents canvas. No HTML5 drag-and-drop API.
7. **Dual-surface rule.** Cosmic-dark chrome is the hero aesthetic, but the **data grid stays solid and high-contrast readable** — never tiny low-contrast text on a busy nebula. Readability of data beats decoration, always.
8. **Reduce-motion respected.** All motion has a calm fallback via `html.reduce-motion` and `@media (prefers-reduced-motion: reduce)`. Nothing important depends on animation.
9. **Performance on weak govt PCs.** Target 4 GB RAM, integrated graphics, no GPU. Animations use only `transform`/`opacity`. No layout thrash, no heavy continuous repaint. 60fps idle is the target; if a machine can't, the calm fallback must keep it smooth.

---

## 2. The gap — current state vs. target (with evidence)

| # | Current state (observed) | Target |
|---|--------------------------|--------|
| G1 | App was rendering literal `!DOCTYPE html>` text at top-left (missing `<`). **FIXED 2026-06-16.** | First line is exactly `<!DOCTYPE html>`. No stray markup ever visible. |
| G2 | Working file drifted to **CRLF** line endings while repo is **LF**; first byte was lost in a prior text-mode write. | File hygiene restored to LF; no tooling writes the HTML in text mode on Windows (use binary-safe writes). |
| G3 | A one-time `localStorage sda_theme=light` makes the whole app render light; the universe dims to opacity .16 and disappears. | Dark cosmic is unmistakably the default *and* the showcase. Light theme is a legitimate, equally-polished alternative — but the universe must still read as premium in BOTH. |
| G4 | The chrome (brand bar + ribbon + format toolbar + formula bar = 4 dense stacked bars of tiny controls) looks like a 2010 Excel clone. | A modern, calm, premium SaaS chrome (Linear / Raycast / Arc level of polish), reskinned cosmic. Clear hierarchy, breathing room, refined type. |
| G5 | The cosmos is a faint background only; UI components (cards, panels, buttons, inputs) don't share the cosmic language — they look like default web controls. | A cohesive design system: glass surfaces, soft glows, depth, consistent radius/elevation/spacing. The universe permeates the components, not just the backdrop. |
| G6 | Agents canvas bubbles float plainly; connections/edges feel mechanical, not "constellation-like". | Connecting modules feels like drawing constellations — luminous nodes, glowing bezier edges, satisfying snap + glow on connect, step-by-step run lighting. |
| G7 | Typography is cramped; many competing small labels; weak hierarchy. | A deliberate type scale and spacing scale. One clear focal point per screen. |

---

## 3. Design system (the single source of truth)

Implement these as CSS custom properties in `:root` / `[data-theme]` and **use them everywhere** — no hard-coded hex outside the token block.

**Palette (dark / hero):**
- `--space-0: #050816` (deepest), `--space-1: #0b0a1f`, `--surface: #16111b`, `--surface-glass: rgba(22,17,27,.62)`
- `--primary: #ddb8ff` (starlight violet), `--secondary: #4cd7f6` (ion cyan), `--primary-container: #7e22ce`
- `--on-surface: #eadfed`, `--on-surface-muted: #b6a9c4`
- `--success: #34d399`, `--warning: #fbbf24`, `--danger: #f472b6`
- Grid (dual-surface): `--grid-surface: #ffffff` (light) / a solid readable dark `#141821` (dark), `--grid-text` high-contrast.

**Type scale (Sora for display/headings, Inter for UI/body — both embedded offline, Devanagari = Noto Sans Devanagari):**
- Display 28/700, H1 22/700, H2 18/650, Body 14/450, Label 12/600, Caption 11/500. Line-height ≥ 1.4 for body.

**Spacing scale:** 4, 8, 12, 16, 24, 32, 48. **Radius:** sm 10, md 14, lg 18, pill 999. **Elevation:** 3 glass shadow levels (resting / hover / floating).

**Motion:** standard ease `cubic-bezier(.4,0,.2,1)` 180ms; entrance ease `cubic-bezier(.34,1.56,.64,1)` 320ms; ambient drifts 24–200s linear. Everything cancellable by reduce-motion.

---

## 4. Requirements by surface

Each subsection is **one batch** = one agent handoff. Each has explicit acceptance criteria (AC).

### Batch P1 — Hygiene & theme foundation
- Confirm `<!DOCTYPE html>` correct; normalize HTML to LF line endings; ensure no future text-mode writes.
- Make dark the true default; add a first-run that ignores a stale `light` pref ONLY if you also ship a polished light theme (otherwise leave user choice intact but ensure dark is gorgeous).
- Embed **Sora + Inter** as base64 woff2 (run the existing `scratch/embed_fonts.py` ONLINE; inject between the FONT-EMBED markers). Verify offline rendering — no Segoe fallback.
- **AC:** View source line 1 = `<!DOCTYPE html>`; `file` reports LF; fonts load with network throttled to *Offline* in DevTools; both HTML copies share one SHA-256.

### Batch P2 — Premium chrome redesign
- Collapse the 4 stacked bars into a calm, modern top system: a slim brand/identity bar + a single contextual toolbar that adapts to the active view (Sheet / Agents / Reports / X-Ray / What-If / Audit). Secondary actions move into tidy overflow menus, not a wall of buttons.
- Glass top bar with subtle bottom border-glow; the nebula reads through it. Brand "Stellura" with the star mark, refined.
- **AC:** No more than 2 horizontal control rows visible at rest on a 1366×768 screen; every control has a hover/focus state; visible-text density reduced ≥ 30% vs current; keyboard focus ring present and on-brand.

### Batch P3 — Component design-system pass
- Restyle: buttons (primary/secondary/ghost), inputs, selects, the formula bar, dropdowns, modals, toasts, cards, the live inspector, the status bar — all to the token system with glass + glow + correct radius/elevation.
- **AC:** Zero hard-coded colors outside the `:root` token block (grep for `#` hex in component CSS returns only tokens). Every interactive element has resting/hover/active/disabled/focus states. Modals share one consistent shell.

### Batch P4 — The living cosmos, elevated (the showcase)
- Keep `#dd-cosmos` (parallax stars, drifting planets, shooting stars). Elevate: subtle depth parallax that reacts *gently* to pointer (dark theme only, reduce-motion off), a slow nebula drift, and a tasteful welcome-screen hero where the universe is front-and-center with the Stellura wordmark.
- Ensure the cosmos is beautiful but **never** reduces data-grid legibility (dual-surface rule).
- **AC:** On the welcome screen in dark mode, the universe is the dominant visual; on the data grid, contrast ratio of cell text ≥ 7:1; reduce-motion freezes all drift and hides shooting stars; idle CPU < 5% on a mid PC.

### Batch P5 — Agents canvas = constellations
- Nodes glow as luminous orbs; edges are glowing bezier curves; connecting two nodes snaps with a satisfying glow pulse; running a pipeline lights nodes sequentially (one lit node + result card per step). Result cards are premium glass.
- Empty-canvas state invites the user ("Drag a module into your constellation / अपने तारामंडल में मॉड्यूल खींचें").
- **AC:** Drag uses pointer events only; connect/disconnect have clear affordances; a 3-node pipeline (e.g., Average → Min/Max → Trend) runs with visible step-lighting and renders result cards; works at 1366×768 without overlap.

### Batch P6 — Onboarding, empty states, polish, QA
- First-run welcome tour (skippable, bilingual) that shows the universe and the core flow in ≤ 4 steps.
- Every empty state (no data, no chart, no agent) is designed, not blank.
- Final consistency sweep + the full verification protocol (Section 6).
- **AC:** A new user with zero data can reach a first insight in ≤ 3 actions; no blank/unstyled state anywhere; Section 6 protocol passes end-to-end.

---

## 5. Definition of Done (per batch + global)

A batch is Done only when ALL are true:
- [ ] All AC for that batch pass, verified in a real browser (Chrome + Edge).
- [ ] Both HTML copies are byte-identical (matching SHA-256 recorded).
- [ ] Bilingual: every new string has Hindi + English; Devanagari renders offline.
- [ ] No causal language introduced.
- [ ] Reduce-motion path verified (toggle OS setting or `html.reduce-motion`).
- [ ] Offline verified: DevTools → Network → Offline → hard reload → app fully functional, no failed asset requests.
- [ ] No regressions: existing features (import, sample data, charts, export Excel/PDF, X-Ray, What-If, Audit, AI panel) still work.
- [ ] App still launches via `start.bat` and serves HTTP 200.

---

## 6. Verification protocol (run before claiming Done)

1. `start.bat` → app opens at `http://localhost:5000`, HTTP 200.
2. View source: first line exactly `<!DOCTYPE html>`. No stray text on screen.
3. Toggle dark/light (Ctrl+D): both themes look premium; universe present in both per spec.
4. Load **Police Register (English, 250 rows)** and **पुलिस पंजी (Hindi)**: grid is crisp, readable, no overflow.
5. Build a 3-node agent pipeline; run it; confirm step-lighting + result cards.
6. Export an Excel and a PDF report; confirm Stellura branding, Devanagari renders.
7. Open the AI panel (Ollama `qwen2.5:7b` running); ask one English + one Hindi question; answers are grounded, no causal language.
8. DevTools → Network → **Offline** → reload → everything still works.
9. DevTools → Performance: idle CPU low; no long tasks > 50ms during ambient animation.
10. `sha256sum public/... download/...` → identical.

---

## 7. Out of scope (do NOT do in this PRD)
- New analytical features or new modules (this is a UI/UX + polish effort).
- Cloud/online dependencies of any kind.
- Renaming away from Stellura (name is decided; formal trademark/domain clearance is a separate founder task before public launch).
- Changing the compute/Cognition engine behavior.

---

## 8. Risks & notes
- **Trademark:** "Stellura" passed a basic web search but is NOT legally cleared. Founder action before launch: trademark search (India + target markets) + domain.
- **Font embedding** must be run online once (`scratch/embed_fonts.py`); after that the app is fully offline. Until then, fonts alias to system Segoe UI — acceptable for dev, not for the premium bar.
- **Don't gold-plate motion** at the cost of weak-PC performance. Calm and smooth beats flashy and janky.

---

*End of PRD. Hand each Batch (P1→P6) to a fresh implementation agent in order. Each agent must paste back the Section 5 checklist with every box checked and the matching SHA-256 before the batch is accepted.*
