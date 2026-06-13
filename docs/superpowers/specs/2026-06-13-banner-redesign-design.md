# Lobby Banner Redesign — Design Spec

- **Date:** 2026-06-13
- **Surface:** `HG/frontend/src/app/page.tsx` (public lobby) + `HG/frontend/src/app/globals.css` `.hg-banner` block
- **Status:** Approved in brainstorming (visual locked via companion v6 dark + v6 light)
- **Skills:** brainstorming (ideation) · ui-ux-pro-max + impeccable (UI craft)

---

## 1. Goal

Replace the current lobby hero (`.hg-banner`: brand-wash + 30px CSS line-grid + animated diagonal shine + 148px logo + single rotating quote in Space Grotesk + one ghost "scroll" cue) with a richer "game-night" composition that keeps the existing identity and token system:

- A **multi-color brand bloom** sunk into the ground (yellow / ocean / pink / a new violet).
- A **tilted 3×9 housie ticket** as the background texture, a few cells lit in brand colors with two "daubed" numbers.
- **Four scattered sticker coins** (the hg number-ball aesthetic), four sizes.
- A **larger logo** (185px) as the centerpiece.
- The existing **rotating quote**, restyled in an elegant italic serif (DM Serif Display).
- **Two pill CTAs**: primary "Browse games" + secondary "How to play".

Both **light and dark** themes are first-class (the app has a `data-theme` toggle in TopNav). Subtle, CSS-only motion with a full `prefers-reduced-motion` fallback. **No new npm dependencies** — grid, coins, and bloom are plain CSS/markup.

This is a visual-only change to the banner. The rest of the lobby (live strip, game cards, upcoming list) is untouched.

---

## 2. Composition (layered back-to-front)

1. **Ground + multi-gradient bloom** — themed ground color with four soft radial brand glows.
2. **Tilted 3×9 ticket grid** — `transform: rotate(-4deg)`, decorative, `aria-hidden`. Most cells empty; eight lit with numbers; two carry a daub ring.
3. **Radial fade behind the hero** — a centered radial of the ground color so the grid + bloom quiet down under the text.
4. **Four sticker coins** — absolutely positioned at the corners, `aria-hidden`.
5. **Hook** — vertical stack, centered: logo → rotating italic-serif quote → two pill buttons.

DOM lives in `page.tsx`; all styling/animation in `globals.css`. Decorative layers (grid, coins) are `aria-hidden="true"`.

---

## 3. Tokens & exact values

### 3.1 Brand colors — reuse existing tokens

| Role | Existing token | Value | Banner usage |
|---|---|---|---|
| Pink | `--accent` | `oklch(0.67 0.25 354)` | bloom (tuned `oklch(0.70 0.24 350)`), pink coin, lit cells 27/83, daub ring on 44 |
| Yellow | (banner-tuned) | `oklch(0.88 0.17 96)` | bloom, yellow coins 33/88, lit cells 12/75 |
| Ocean | `--cyan` | `oklch(0.78 0.13 205)` | bloom, ocean coin 7, lit cells 61/9, daub ring on 58 |
| Violet | **new, banner-local** | `oklch(0.58 0.25 290)` | bloom only (4th glow) |
| Ink / borders | `--ink`, `--card-shadow`, `--card-shadow-sm` | themed | coin borders + hard offset shadows |

The mockup used hex approximations (`#ECC53B`, `#E84393`, `#5BC8E8`, `#8C52FF`, `#0e0d12`). **Implementation uses the OKLCH tokens above**, not these hexes — identity preservation. The dark ground stays the warm `var(--bg)` (`#121310`), not the mockup's cool `#0e0d12`.

### 3.2 Banner-local CSS variables

Declare on `.hg-banner` (dark/default), override in `.hg-root[data-theme='light'] .hg-banner`. This mirrors how the current banner overrides its `background` per theme.

| Variable | Dark (default) | Light |
|---|---|---|
| `--bn-ground` | `var(--bg)` (`#121310`) | `var(--bg2)` lightened — target `oklch(0.95 0.012 320)` (≈ `#f4f1f7`) |
| `--bn-bloom-y` | `oklch(0.88 0.17 96 / .18)` | `oklch(0.87 0.16 96 / .34)` |
| `--bn-bloom-o` | `oklch(0.78 0.13 205 / .16)` | `oklch(0.74 0.13 205 / .30)` |
| `--bn-bloom-p` | `oklch(0.70 0.24 350 / .20)` | `oklch(0.72 0.22 350 / .26)` |
| `--bn-bloom-v` | `oklch(0.58 0.25 290 / .15)` | `oklch(0.58 0.25 290 / .18)` |
| `--bn-grid-line` | `rgba(255,255,255,.12)` | `rgba(38,37,28,.14)` |
| `--bn-grid-opacity` | `.38` | `.62` |
| `--bn-num-yellow` | `oklch(0.88 0.17 96)` | `oklch(0.62 0.13 80)` (deepened gold for legibility) |
| `--bn-num-ocean` | `oklch(0.78 0.13 205)` | `oklch(0.58 0.12 215)` (deepened) |
| `--bn-num-pink` | `oklch(0.70 0.24 350)` | `oklch(0.62 0.22 0)` |
| `--bn-num-plain` | `var(--text)` (`#f4f3ec`) | `#26222e` |
| `--bn-fade` | `oklch(0.16 0.01 120 / .92)` (center color) | `oklch(0.97 0.008 320 / .94)` (center color) |
| `--bn-quote-ink` | `#e6e3ee` | `#26222e` |
| `--bn-logo-shadow` | `drop-shadow(0 0 30px rgba(14,13,18,.85))` | `drop-shadow(0 8px 18px rgba(14,13,17,.18))` |

The bloom is one `background:` with four `radial-gradient()` layers over `--bn-ground`, positions: yellow `70% 55% at 12% 10%`, ocean `66% 60% at 88% 16%`, pink `82% 72% at 50% 110%`, violet `56% 60% at 80% 88%`. The hero fade (§2 layer 3) is `.hg-banner-fade { background: radial-gradient(58% 56% at 50% 48%, var(--bn-fade), transparent 80%) }`.

### 3.3 Ticket grid

- Container `.hg-banner-grid`: `position:absolute; inset:-8% -4%; transform:rotate(-4deg); display:grid; grid-template-columns:repeat(9,1fr); grid-template-rows:repeat(3,1fr); opacity:var(--bn-grid-opacity)`.
- 27 cells, each `border:1px solid var(--bn-grid-line)`.
- Lit cells (row-major index, 0-based): `1→12` (yellow), `4→44` (plain + pink daub ring), `6→61` (ocean), `11→27` (pink), `15→75` (yellow), `20→9` (ocean), `24→58` (plain + ocean daub ring), `26→83` (pink). Number `font:800 16px var(--font-head)`.
- Daub ring: a child `<span>` absolutely positioned `inset:-8px -10px; border:2.5px solid <ring-color>; border-radius:50%; transform:rotate(±8deg)` (pink ring on 44 rot -8°, ocean ring on 58 rot 6°).

### 3.4 Coins

`.hg-banner-coin` base: `position:absolute; border-radius:50%; display:grid; place-items:center; font:800 <n>px var(--font-head); border:<bw> solid var(--ink)`. Dark adds a soft color glow after the hard shadow; light uses the hard shadow only.

| Coin | Value | Size | Fill | Text | Position | Rotate | Border / shadow |
|---|---|---|---|---|---|---|---|
| 1 | 33 | 44px | yellow | `var(--ink)` | `top:11%; left:9%` | -9° | 2.5px / `0 4px 0 -1px ink` (+glow `0 0 20px yellow/.25`) |
| 2 | 7 | 28px | ocean | `var(--ink)` | `top:64%; left:14%` | 7° | 2px / `0 3px 0 -1px ink` (+glow ocean/.30) |
| 3 | 62 | 36px | pink | `#fff` | `top:15%; right:10%` | 11° | 2.5px / `0 3px 0 -1px ink` (+glow pink/.30) |
| 4 | 88 | 20px | yellow | `var(--ink)` | `top:71%; right:15%` | -6° | 2px / `0 2px 0 -1px ink` (+glow yellow/.30) |

### 3.5 Logo

`.hg-banner-logo img`: `width:185px; height:185px; object-fit:contain; filter:var(--bn-logo-shadow)`. Source `/hg-logo-2.png` (already in `public/`), `priority`, descriptive alt "Housie Ghar".

### 3.6 Quote

`.hg-banner-quote`: `font-family:var(--font-serif); font-style:italic; font-size:27px; line-height:1.15; max-width:22ch; color:var(--bn-quote-ink); text-wrap:balance; min-height:2.3em` (reserve two lines so rotation doesn't shift layout). Rotates through the existing three hooks (§4) with a ~600ms opacity crossfade.

**Font-count note:** this adds a 4th font family (DM Serif Display) on top of the app's Space Grotesk / DM Sans / JetBrains Mono. impeccable caps families at 3; this is a deliberate, user-requested exception for the quote's voice, scoped to the banner only.

### 3.7 Buttons

`.hg-banner-actions`: flex row, gap 10px, margin-top 6px, wraps on narrow screens. Both are real elements, pill (`border-radius:999px`), padding `10px 20px`, `font-family:var(--font-head)`, min height 44px (touch target).

| | Dark | Light |
|---|---|---|
| Primary "Browse games" | `background:#f5f3f8; color:#16151a; border:0` | `background:var(--accent); color:var(--accent-ink); border:2.5px solid var(--ink); box-shadow:var(--card-shadow-sm)` |
| Secondary "How to play" | `background:rgba(255,255,255,.05); color:#cfcdd6; border:1px solid rgba(255,255,255,.25)` | `background:var(--surface); color:var(--text); border:2px solid var(--ink); box-shadow:var(--card-shadow-sm)` |

Rationale: in dark mode the screenshot-style flat-white primary pops against the dark hero; on a light page that pill vanishes, so light switches to the hg-native sticker treatment (pink primary, ink border, hard shadow). Both keep the same labels/positions.

---

## 4. Copy

- **Quote rotation** — keep the app's existing three hooks, cycling every ~5s:
  1. "Mark your numbers. Win the house."
  2. "The whole town's playing — don't miss your number."
  3. "Tambola night, every night — straight from the hills."
- **Primary button:** label "Browse games" → smooth-scrolls to the lobby game list below the banner (the existing `.hg-lobby-v2` section; it already has `scroll-margin-top:70px`).
- **Secondary button:** label "How to play" → navigates to `/how-to-play`.

---

## 5. Motion (subtle, CSS-only)

All animations use `transform`/`opacity` only.

- **Coin bob** — each coin `translateY` ±4–6px on its own ease-in-out timer (durations 3.6s / 4.2s / 4.8s / 4.0s, staggered delays) so they drift independently. Rotation from §3.4 is preserved as the resting transform.
- **Bloom drift** — the bloom is a dedicated absolutely-positioned layer; very slow `transform: translate3d` / scale loop (~22s) for a gentle living-light feel. Subtle enough not to distract from the hook.
- **Daub pulse** — the two ring `<span>`s pulse opacity `0.6 → 1` and scale `0.98 → 1.02` on a ~3s loop, offset from each other, evoking a freshly dabbed number.
- **Quote crossfade** — on rotation, fade out (300ms) → swap text → fade in (300ms).

### Reduced motion
Under `@media (prefers-reduced-motion: reduce)`: disable coin bob, bloom drift, and daub pulse (static resting state). The quote still rotates but swaps **instantly** (no crossfade). Nothing depends on a class-triggered reveal — the banner renders fully visible by default.

---

## 6. Responsive

`.hg-banner` keeps `min-height: calc(100dvh - var(--nav-h))` so it never collapses to a thin strip.

| Width | Logo | Quote | Coins | Buttons |
|---|---|---|---|---|
| ≥1024px | 185px | 27px | as specced | row |
| 560–1023px | 160px | 23px | scale ~0.85, same anchors | row |
| <560px | 130px | 20px | scale ~0.7, anchors pulled tighter to the corners so none sit under the text; smallest (88) may hide | row, wraps to two if needed |

Coins are positioned in `%`, so they track the banner box; the mobile rule tightens their insets and downsizes. Grid stays at all widths (its `inset:-8% -4%` + rotation keeps it full-bleed).

---

## 7. Accessibility

- **Contrast:** quote `#e6e3ee` on the dark faded center and `#26222e` on the light faded center both exceed 4.5:1. Coin numbers use ink-on-color (yellow/ocean carry `--ink`; pink carries `#fff`) — all ≥4.5:1. Lit grid numbers are decorative (and behind the fade), not informational.
- **Semantics:** grid and coins are `aria-hidden="true"`. Logo `<img>` has descriptive alt. "Browse games" is a `<button>` (scroll action); "How to play" is a link (`<a>`/`next/link`) — real, keyboard-focusable, with visible focus rings (inherit the app's focus styling).
- **Touch targets:** both buttons ≥44px tall.
- **Motion:** full `prefers-reduced-motion` fallback (§5).

---

## 8. Implementation surface

1. **`HG/frontend/src/app/layout.tsx`** — add `DM_Serif_Display` (italic, weight 400) via `next/font/google`, expose as `--font-serif`; register the variable on `.hg-root` (alongside `--font-head/body/mono`). (Next 16 — check `node_modules/next/dist/docs/` for `next/font` usage before editing, per AGENTS.md.)
2. **`HG/frontend/src/app/globals.css`** — rewrite the `.hg-banner` block (currently ~lines 134–195):
   - Replace the four-radial `background` with the bloom using `--bn-*` vars; set dark defaults on `.hg-banner`, light overrides in the existing `[data-theme='light'] .hg-banner` rule.
   - **Remove** `.hg-banner::before` (line-grid), `.hg-banner::after` + `@keyframes hg-grid-shine` (shine sweep), and `.hg-banner-cue` (+ `@keyframes hg-cue`).
   - **Add** `.hg-banner-grid` (+ cell / lit / daub classes), `.hg-banner-coin` (+ size/color modifiers), `.hg-banner-fade`, `.hg-banner-hook`, restyled `.hg-banner-quote` (serif), `.hg-banner-actions` + `.hg-banner-btn-primary/secondary`.
   - Add `--font-serif: var(--font-dm-serif-display), "DM Serif Display", serif;` to the `.hg-root` font-var block, and the `--bn-*` variables (§3.2) to `.hg-banner` / the light override.
   - Add the coin / bloom / daub `@keyframes` and extend the `prefers-reduced-motion` block.
3. **`HG/frontend/src/app/page.tsx`** — rewrite the banner JSX: `.hg-banner` → `.hg-banner-grid` (27 cells, 8 lit, 2 daubed) + 4 `.hg-banner-coin` + `.hg-banner-hook` (logo `Image`, rotating quote, two buttons). Wire "Browse games" to `scrollIntoView` on the lobby list and "How to play" to the `/how-to-play` route. Keep the existing hooks-rotation effect/state; swap the cue button for the two CTAs.

No other files. No dependency changes (`DM Serif Display` ships via `next/font/google`, no install).

---

## 9. Non-goals

- No changes to the live strip, game cards, or upcoming list.
- No new icon or motion library (CSS only; project has neither installed and keeps it that way).
- Do not reintroduce the dropped `Themes` feature.

---

## 10. Verification

- `cd HG/frontend && npm run lint && npm run build` pass (React Compiler rules: no ref writes in render, no setState in effect bodies — the quote rotation already follows this; preserve the pattern).
- Visual check in **both** themes (toggle in TopNav): bloom, grid, coins, logo, quote rotation, buttons.
- `prefers-reduced-motion: reduce`: coins/bloom/daub static, quote swaps instantly.
- Widths 375 / 768 / 1024 / 1440: no coin overlaps the text, no horizontal scroll, buttons reachable, banner fills the viewport below the nav.
