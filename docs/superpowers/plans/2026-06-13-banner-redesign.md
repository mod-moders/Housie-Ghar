# Lobby Banner Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the lobby hero (`.hg-banner`) with a game-night composition — brand bloom + tilted ticket grid + sticker coins + big logo + rotating italic-serif quote + two pill CTAs — working in both light and dark themes with a reduced-motion fallback.

**Architecture:** Pure frontend/CSS change across three files. `layout.tsx` registers a new `next/font/google` serif. `globals.css` rewrites the `.hg-banner` block: banner-local `--bn-*` CSS variables (dark defaults + a `[data-theme='light']` override) drive a layered hero (ground → bloom → grid → fade → coins → hook). `page.tsx` rewrites the banner JSX (decorative grid/coins from data arrays, plus a 5s quote rotation). No new npm dependencies.

**Tech Stack:** Next.js 16 (React 19), `next/font/google`, plain CSS under Tailwind v4's `@import`, OKLCH brand tokens. Spec: `docs/superpowers/specs/2026-06-13-banner-redesign-design.md`.

**Verification note:** the frontend has **no test runner** (CLAUDE.md lists only `dev`/`build`/`lint`). The honest gates for a visual change are `npm run lint`, `npm run build`, and a manual visual checklist in both themes — used here instead of invented unit tests (YAGNI).

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `HG/frontend/src/app/layout.tsx` | Font registration | Add `DM_Serif_Display` → `--font-dm-serif-display` on `<html>` |
| `HG/frontend/src/app/globals.css` | Design system + banner styling | Add `--font-serif` to `.hg-root`; rewrite the `.hg-banner` block (currently lines 134–195) |
| `HG/frontend/src/app/page.tsx` | Lobby markup + quote rotation | Replace hook-picking logic; rewrite banner JSX; add `next/link` import |

All three changes are interdependent (CSS classes ⇄ markup ⇄ font var). Land them in sequence; the banner is only visually correct after Task 3, but lint/build pass after each task.

---

## Task 1: Register the DM Serif Display font

**Files:**
- Modify: `HG/frontend/src/app/layout.tsx`
- Modify: `HG/frontend/src/app/globals.css:9-21` (the `.hg-root` token block)

- [ ] **Step 1: Reference Next 16 `next/font` usage**

Per `HG/frontend/AGENTS.md`, this is not the Next.js in training data. Confirm the `next/font/google` API before editing:

Run: `ls node_modules/next/dist/docs/ 2>/dev/null && grep -rl "next/font" node_modules/next/dist/docs/ 2>/dev/null | head`
Expected: docs exist; `next/font/google` named-import pattern (already used in `layout.tsx`) is current. If the docs contradict the code below, follow the docs.

- [ ] **Step 2: Add the serif import and instance in `layout.tsx`**

Change the import on line 2 and add the font instance after line 7.

Line 2 — from:
```tsx
import { Space_Grotesk, DM_Sans, JetBrains_Mono } from "next/font/google";
```
to:
```tsx
import { Space_Grotesk, DM_Sans, JetBrains_Mono, DM_Serif_Display } from "next/font/google";
```

After line 7 (`const mono = ...`), add:
```tsx
const dmSerif = DM_Serif_Display({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-dm-serif-display", display: "swap" });
```

- [ ] **Step 3: Apply the font variable on `<html>`**

Line 16 — from:
```tsx
    <html lang="en" className={`${spaceGrotesk.variable} ${dmSans.variable} ${mono.variable}`}>
```
to:
```tsx
    <html lang="en" className={`${spaceGrotesk.variable} ${dmSans.variable} ${mono.variable} ${dmSerif.variable}`}>
```

- [ ] **Step 4: Expose `--font-serif` in `globals.css`**

In the `.hg-root` block, after the `--font-mono:` line (line 20), add:
```css
  --font-serif: var(--font-dm-serif-display), "DM Serif Display", serif;
```

- [ ] **Step 5: Verify build picks up the font**

Run: `cd HG/frontend && npm run lint`
Expected: PASS (no new errors).

Run: `cd HG/frontend && npm run build`
Expected: build succeeds; no "Unknown font" / module error for `DM_Serif_Display`.

- [ ] **Step 6: Commit**

```bash
cd /Users/monk/1
git add HG/frontend/src/app/layout.tsx HG/frontend/src/app/globals.css
git commit -m "feat(frontend): register DM Serif Display for the banner quote"
```

---

## Task 2: Rewrite the `.hg-banner` CSS

**Files:**
- Modify: `HG/frontend/src/app/globals.css` — replace the `.hg-banner` block (currently lines 134–195, from the `/* ============ LOBBY v2 ... */` header through the `[data-theme='light'] .hg-banner` override) with the CSS below. Do **not** touch line 197+ (`.hg-lobby-v2` onward).

- [ ] **Step 1: Replace the banner block**

Delete lines 134–195 and paste:

```css
/* ============ LOBBY v2 — BANNER (game-night hero) ============ */
/* Fills the screen below the sticky nav (--nav-h). Layers back-to-front:
   ground → bloom → ticket grid → fade → coins → hook. */
.hg-banner{
  --nav-h:70px;
  /* banner-local palette — dark defaults; [data-theme='light'] overrides at the end */
  --bn-ground:var(--bg);
  --bn-bloom-y:oklch(0.88 0.17 96 / .18);
  --bn-bloom-o:oklch(0.78 0.13 205 / .16);
  --bn-bloom-p:oklch(0.70 0.24 350 / .20);
  --bn-bloom-v:oklch(0.58 0.25 290 / .15);
  --bn-grid-line:rgba(255,255,255,.12);
  --bn-grid-opacity:.38;
  --bn-num-yellow:oklch(0.88 0.17 96);
  --bn-num-ocean:oklch(0.78 0.13 205);
  --bn-num-pink:oklch(0.70 0.24 350);
  --bn-num-plain:var(--text);
  --bn-fade:oklch(0.16 0.01 120 / .92);
  --bn-quote-ink:#e6e3ee;
  --bn-logo-shadow:drop-shadow(0 0 30px rgba(14,13,18,.85));

  position:relative;overflow:hidden;
  min-height:calc(100dvh - var(--nav-h));
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  text-align:center;padding:40px 22px;
  border-bottom:1.5px solid var(--card-line);
  background:var(--bn-ground);
}

/* bloom — four soft brand glows, slowly drifting */
.hg-banner-bloom{position:absolute;inset:-12%;z-index:0;pointer-events:none;
  background:
    radial-gradient(70% 55% at 12% 10%, var(--bn-bloom-y), transparent 60%),
    radial-gradient(66% 60% at 88% 16%, var(--bn-bloom-o), transparent 62%),
    radial-gradient(82% 72% at 50% 110%, var(--bn-bloom-p), transparent 64%),
    radial-gradient(56% 60% at 80% 88%, var(--bn-bloom-v), transparent 62%);
  animation:hg-bloom-drift 22s ease-in-out infinite}

/* tilted 3×9 ticket grid */
.hg-banner-grid{position:absolute;inset:-8% -4%;z-index:0;pointer-events:none;
  transform:rotate(-4deg);display:grid;
  grid-template-columns:repeat(9,1fr);grid-template-rows:repeat(3,1fr);
  opacity:var(--bn-grid-opacity)}
.hg-banner-cell{border:1px solid var(--bn-grid-line);display:flex;align-items:center;justify-content:center}
.hg-banner-num{position:relative;font:700 16px var(--font-head)}
.hg-banner-num--yellow{color:var(--bn-num-yellow)}
.hg-banner-num--ocean{color:var(--bn-num-ocean)}
.hg-banner-num--pink{color:var(--bn-num-pink)}
.hg-banner-num--plain{color:var(--bn-num-plain)}
.hg-banner-daub{position:absolute;inset:-8px -10px;border-radius:50%;border:2.5px solid transparent}
.hg-banner-daub--pink{--daub-rot:-8deg;border-color:var(--bn-num-pink);transform:rotate(var(--daub-rot));
  animation:hg-daub 3s ease-in-out infinite}
.hg-banner-daub--ocean{--daub-rot:6deg;border-color:var(--bn-num-ocean);transform:rotate(var(--daub-rot));
  animation:hg-daub 3s ease-in-out infinite .8s}

/* fade — quiets the grid + bloom under the hero */
.hg-banner-fade{position:absolute;inset:0;z-index:1;pointer-events:none;
  background:radial-gradient(58% 56% at 50% 48%, var(--bn-fade), transparent 80%)}

/* sticker coins */
.hg-banner-coin{position:absolute;z-index:2;border-radius:50%;display:grid;place-items:center;
  font-family:var(--font-head);font-weight:700;color:var(--ink);
  border:2px solid var(--ink);pointer-events:none;
  transform:translateY(var(--bob)) rotate(var(--coin-rot))}
.hg-banner-coin--1{--coin-rot:-9deg;top:11%;left:9%;width:44px;height:44px;font-size:16px;
  background:oklch(0.88 0.17 96);border-width:2.5px;
  box-shadow:0 4px 0 -1px var(--ink), 0 0 20px oklch(0.88 0.17 96 / .25);
  animation:hg-coin-bob 4s ease-in-out infinite}
.hg-banner-coin--2{--coin-rot:7deg;top:64%;left:14%;width:28px;height:28px;font-size:11px;
  background:oklch(0.78 0.13 205);
  box-shadow:0 3px 0 -1px var(--ink), 0 0 16px oklch(0.78 0.13 205 / .30);
  animation:hg-coin-bob 4.8s ease-in-out infinite .4s}
.hg-banner-coin--3{--coin-rot:11deg;top:15%;right:10%;width:36px;height:36px;font-size:13px;
  background:oklch(0.70 0.24 350);color:#fff;border-width:2.5px;
  box-shadow:0 3px 0 -1px var(--ink), 0 0 18px oklch(0.70 0.24 350 / .30);
  animation:hg-coin-bob 3.6s ease-in-out infinite .2s}
.hg-banner-coin--4{--coin-rot:-6deg;top:71%;right:15%;width:20px;height:20px;font-size:9px;
  background:oklch(0.88 0.17 96);
  box-shadow:0 2px 0 -1px var(--ink), 0 0 12px oklch(0.88 0.17 96 / .30);
  animation:hg-coin-bob 4.2s ease-in-out infinite .6s}

/* hook — logo, rotating quote, CTAs */
.hg-banner-hook{position:relative;z-index:3;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:14px}
.hg-banner-logo img{display:block;width:185px;height:185px;object-fit:contain;filter:var(--bn-logo-shadow)}
.hg-banner-quote{margin:0;max-width:22ch;min-height:2.3em;
  font-family:var(--font-serif);font-style:italic;font-weight:400;
  font-size:27px;line-height:1.15;color:var(--bn-quote-ink);text-wrap:balance;
  animation:hg-quote-in .5s ease}
.hg-banner-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:4px}
.hg-banner-btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;
  padding:11px 20px;border-radius:999px;font-family:var(--font-head);font-size:13px;
  cursor:pointer;text-decoration:none;white-space:nowrap;
  transition:filter .15s ease, background .15s ease, border-color .15s ease, color .15s ease}
.hg-banner-btn--primary{background:#f5f3f8;color:#16151a;border:0;font-weight:700}
.hg-banner-btn--primary:hover{filter:brightness(1.04)}
.hg-banner-btn--secondary{background:rgba(255,255,255,.05);color:#cfcdd6;
  border:1px solid rgba(255,255,255,.25);font-weight:600}
.hg-banner-btn--secondary:hover{border-color:rgba(255,255,255,.5);color:#fff}

@property --bob{syntax:"<length>";inherits:false;initial-value:0px}
@keyframes hg-coin-bob{50%{--bob:-6px}}
@keyframes hg-bloom-drift{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(1.5%,-1.5%,0) scale(1.05)}}
@keyframes hg-daub{0%,100%{opacity:.55;transform:scale(.98) rotate(var(--daub-rot,0deg))}50%{opacity:1;transform:scale(1.02) rotate(var(--daub-rot,0deg))}}
@keyframes hg-quote-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}

@media (prefers-reduced-motion: reduce){
  .hg-banner-bloom,.hg-banner-coin,.hg-banner-daub,.hg-banner-quote{animation:none}
}

/* responsive */
@media (max-width:1023px){
  .hg-banner-logo img{width:160px;height:160px}
  .hg-banner-quote{font-size:23px}
}
@media (max-width:559px){
  .hg-banner-logo img{width:130px;height:130px}
  .hg-banner-quote{font-size:20px}
  .hg-banner-coin--1{top:9%;left:6%;width:36px;height:36px;font-size:13px}
  .hg-banner-coin--2{top:62%;left:8%;width:22px;height:22px;font-size:9px}
  .hg-banner-coin--3{top:12%;right:6%;width:30px;height:30px;font-size:11px}
  .hg-banner-coin--4{display:none}
}

/* light theme — pastel bloom on a near-white ground, ink grid, sticker buttons */
.hg-root[data-theme='light'] .hg-banner{
  --bn-ground:oklch(0.95 0.012 320);
  --bn-bloom-y:oklch(0.87 0.16 96 / .34);
  --bn-bloom-o:oklch(0.74 0.13 205 / .30);
  --bn-bloom-p:oklch(0.72 0.22 350 / .26);
  --bn-bloom-v:oklch(0.58 0.25 290 / .18);
  --bn-grid-line:rgba(38,37,28,.14);
  --bn-grid-opacity:.62;
  --bn-num-yellow:oklch(0.62 0.13 80);
  --bn-num-ocean:oklch(0.58 0.12 215);
  --bn-num-pink:oklch(0.62 0.22 0);
  --bn-num-plain:#26222e;
  --bn-fade:oklch(0.97 0.008 320 / .94);
  --bn-quote-ink:#26222e;
  --bn-logo-shadow:drop-shadow(0 8px 18px rgba(14,13,17,.18));
}
.hg-root[data-theme='light'] .hg-banner-coin--1{box-shadow:0 4px 0 -1px var(--ink)}
.hg-root[data-theme='light'] .hg-banner-coin--2{box-shadow:0 3px 0 -1px var(--ink)}
.hg-root[data-theme='light'] .hg-banner-coin--3{box-shadow:0 3px 0 -1px var(--ink)}
.hg-root[data-theme='light'] .hg-banner-coin--4{box-shadow:0 2px 0 -1px var(--ink)}
.hg-root[data-theme='light'] .hg-banner-btn--primary{background:var(--accent);color:var(--accent-ink);
  border:2.5px solid var(--ink);box-shadow:var(--card-shadow-sm);font-weight:800}
.hg-root[data-theme='light'] .hg-banner-btn--secondary{background:var(--surface);color:var(--text);
  border:2px solid var(--ink);box-shadow:var(--card-shadow-sm);font-weight:700}
.hg-root[data-theme='light'] .hg-banner-btn--secondary:hover{background:var(--surface-2);border-color:var(--ink);color:var(--text)}
```

- [ ] **Step 2: Confirm no orphaned references**

The old block defined `.hg-banner::before`, `.hg-banner::after`, `@keyframes hg-grid-shine`, `.hg-banner-cue`, `.hg-banner-cue svg`, `@keyframes hg-cue`, and `.hg-banner > *`. These are now deleted.

Run: `cd HG/frontend && grep -n "hg-banner-cue\|hg-grid-shine\|hg-cue\|hg-banner > " src/app/globals.css`
Expected: no matches (the `.hg-banner-cue` button markup is removed from `page.tsx` in Task 3).

Run: `cd HG/frontend && grep -rn "hg-banner-cue" src/`
Expected: one match in `src/app/page.tsx` (removed next task), none elsewhere.

- [ ] **Step 3: Build**

Run: `cd HG/frontend && npm run build`
Expected: build succeeds. (Lint runs on TS/JS, not CSS; visual correctness is verified in Task 4.)

- [ ] **Step 4: Commit**

```bash
cd /Users/monk/1
git add HG/frontend/src/app/globals.css
git commit -m "feat(frontend): rewrite .hg-banner as the game-night hero (dark + light)"
```

---

## Task 3: Rewrite the banner JSX + quote rotation in `page.tsx`

**Files:**
- Modify: `HG/frontend/src/app/page.tsx`

- [ ] **Step 1: Add the `next/link` import**

After line 6 (`import Image from "next/image";`), add:
```tsx
import Link from "next/link";
```

- [ ] **Step 2: Add the grid + coin data, update the HOOKS comment**

Replace the `HOOKS` declaration and its comment (lines 14–19):
```tsx
// Shown one-at-a-time on the banner; a fresh one is picked on every page load.
const HOOKS = [
  "The whole town's playing — don't miss your number.",
  "Mark your numbers. Match the call. Win the house.",
  "Tambola night, every night — straight from the hills.",
];
```
with:
```tsx
// Rotated on the banner every 5s, starting from a random hook each page load.
const HOOKS = [
  "The whole town's playing — don't miss your number.",
  "Mark your numbers. Match the call. Win the house.",
  "Tambola night, every night — straight from the hills.",
];

// Decorative 3×9 ticket grid behind the hero. null = empty cell.
type BannerCell = { n: number; tone: "yellow" | "ocean" | "pink" | "plain"; daub?: "pink" | "ocean" } | null;
const GRID_CELLS: BannerCell[] = [
  null, { n: 12, tone: "yellow" }, null, null, { n: 44, tone: "plain", daub: "pink" }, null, { n: 61, tone: "ocean" }, null, null,
  null, null, { n: 27, tone: "pink" }, null, null, null, { n: 75, tone: "yellow" }, null, null,
  null, null, { n: 9, tone: "ocean" }, null, null, null, { n: 58, tone: "plain", daub: "ocean" }, null, { n: 83, tone: "pink" },
];

// Scattered sticker coins (size/colour/position come from .hg-banner-coin--N in CSS).
const COINS = [33, 7, 62, 88];
```

- [ ] **Step 3: Replace the hook-picking logic with the rotation**

Replace lines 111–119 (the comment + `hookRef`/`hook` block):
```tsx
  // Pick a hook once per page load, client-side only: the server snapshot is ""
  // (no hydration mismatch), then useSyncExternalStore reveals the chosen quote.
  // The ref keeps the choice stable across re-renders so it doesn't flicker.
  const hookRef = useRef<string | null>(null);
  const hook = useSyncExternalStore(
    emptySubscribe,
    () => (hookRef.current ??= HOOKS[Math.floor(Math.random() * HOOKS.length)]),
    () => "",
  );
```
with:
```tsx
  // The quote rotates through HOOKS every 5s. A client-only random start (via
  // useSyncExternalStore: null on the server → no hydration mismatch) keeps the
  // first quote fresh each visit; `step` advances on a timer; `key={step}` on the
  // <p> replays the fade-in. React Compiler safe: setState lives in the interval
  // callback, never synchronously in the effect body.
  const startRef = useRef<number | null>(null);
  const start = useSyncExternalStore(
    emptySubscribe,
    () => (startRef.current ??= Math.floor(Math.random() * HOOKS.length)),
    (): number | null => null,
  );
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => s + 1), 5000);
    return () => clearInterval(id);
  }, []);
  const quote = start === null ? "" : HOOKS[(start + step) % HOOKS.length];
```

- [ ] **Step 4: Replace the banner JSX**

Replace the banner `<section>` (lines 163–173):
```tsx
        {/* Banner — fills the screen below the nav; the hook rotates each visit */}
        <section className="hg-banner">
          <div className="hg-banner-logo">
            <Image src="/hg-logo-2.png" alt="Housie Ghar" width={180} height={180} priority />
          </div>
          <p className="hg-banner-quote">{hook || " "}</p>
          <button className="hg-banner-cue" onClick={scrollToGames}>
            <span>Browse games</span>
            <Icon name="chevR" size={16} strokeWidth={2.4} />
          </button>
        </section>
```
with:
```tsx
        {/* Banner — game-night hero: bloom + ticket grid + coins behind a logo/quote/CTAs hook */}
        <section className="hg-banner">
          <div className="hg-banner-bloom" aria-hidden="true" />
          <div className="hg-banner-grid" aria-hidden="true">
            {GRID_CELLS.map((c, i) => (
              <span key={i} className="hg-banner-cell">
                {c && (
                  <span className={`hg-banner-num hg-banner-num--${c.tone}`}>
                    {c.n}
                    {c.daub && <span className={`hg-banner-daub hg-banner-daub--${c.daub}`} />}
                  </span>
                )}
              </span>
            ))}
          </div>
          <div className="hg-banner-fade" aria-hidden="true" />
          {COINS.map((n, i) => (
            <span key={n} className={`hg-banner-coin hg-banner-coin--${i + 1}`} aria-hidden="true">{n}</span>
          ))}
          <div className="hg-banner-hook">
            <div className="hg-banner-logo">
              <Image src="/hg-logo-2.png" alt="Housie Ghar" width={185} height={185} priority />
            </div>
            <p className="hg-banner-quote" key={step}>{quote || " "}</p>
            <div className="hg-banner-actions">
              <button className="hg-banner-btn hg-banner-btn--primary" onClick={scrollToGames}>Browse games</button>
              <Link className="hg-banner-btn hg-banner-btn--secondary" href="/how-to-play">How to play</Link>
            </div>
          </div>
        </section>
```

- [ ] **Step 5: Lint (catches unused imports + React Compiler rules)**

Run: `cd HG/frontend && npm run lint`
Expected: PASS. In particular: no "unused var" for `Icon` (still used in `GameCard`), `Button`, `Badge`, etc.; no React Compiler error on the `useSyncExternalStore` ref write (same accepted pattern as the old `hookRef`) or the `setStep` interval.

If lint flags `Icon` as unused, confirm it's still referenced in `GameCard` (lines ~61, 94, 98) — it is, so the import stays.

- [ ] **Step 6: Build**

Run: `cd HG/frontend && npm run build`
Expected: build succeeds; no type error on `BannerCell` / `GRID_CELLS`.

- [ ] **Step 7: Commit**

```bash
cd /Users/monk/1
git add HG/frontend/src/app/page.tsx
git commit -m "feat(frontend): wire the new banner markup + rotating serif quote"
```

---

## Task 4: Verification pass (both themes, motion, responsive)

**Files:** none (manual verification; fix forward into the relevant file if a check fails).

- [ ] **Step 1: Lint + build clean**

Run: `cd HG/frontend && npm run lint && npm run build`
Expected: both PASS.

- [ ] **Step 2: Run the dev server**

Run: `cd HG/frontend && npm run dev`
Open `http://localhost:3000/`. (Backend need not be up; the banner renders without game data — the list below may show its error/empty state, which is fine for banner verification.)

- [ ] **Step 3: Dark theme checklist** (default `data-theme="dark"`)

Confirm visually:
- Four-color bloom (yellow TL, ocean TR, pink bottom, violet LR) sunk into the dark ground.
- Tilted ticket grid with eight lit numbers; `44` and `58` carry a pulsing daub ring.
- Four coins at the corners, bobbing gently on different timers.
- Logo ~185px with a soft dark halo.
- Quote in italic serif; it changes every ~5s with a brief fade-in.
- "Browse games" (white pill) scrolls down to the games list; "How to play" (outlined pill) navigates to `/how-to-play`.

- [ ] **Step 4: Light theme checklist**

Click the theme toggle in the TopNav (sets `data-theme="light"`). Confirm:
- Bloom becomes soft pastel clouds on a near-white ground; grid lines are dark ink; lit numbers stay legible (deepened gold/ocean, pink).
- Quote is ink-dark and readable; logo has a soft drop-shadow.
- Buttons switch to the sticker style: pink primary + outlined, both with the ink border and hard offset shadow.
- Coins read cleanly (hard shadow, no neon glow).

- [ ] **Step 5: Reduced-motion**

In DevTools: Rendering panel → "Emulate CSS prefers-reduced-motion: reduce". Reload.
Expected: coins, bloom, and daub rings are static; the quote still rotates but swaps **instantly** (no fade). Banner is fully visible (nothing blank).

- [ ] **Step 6: Responsive**

In DevTools responsive mode, check widths 375 / 768 / 1024 / 1440:
- No horizontal scroll at any width.
- No coin overlaps the logo/quote/buttons; at <560px the smallest coin (`88`) is hidden and the others tuck to the corners.
- Logo/quote scale down (160/130px logo; 23/20px quote); buttons stay reachable (wrap if needed).
- Banner fills the viewport height below the nav (no thin-strip collapse).

- [ ] **Step 7: Final commit (only if a fix was needed)**

If any step required an edit, commit it:
```bash
cd /Users/monk/1
git add HG/frontend/src/app/
git commit -m "fix(frontend): banner verification adjustments"
```
If no fixes were needed, skip — the banner is done.

---

## Self-Review

**Spec coverage** (against `2026-06-13-banner-redesign-design.md`):
- §2 composition (bloom → grid → fade → coins → hook) → Task 2 CSS + Task 3 markup. ✓
- §3.1 brand tokens / §3.2 `--bn-*` vars → Task 2 (dark defaults + light override). ✓
- §3.3 grid (lit cells 12/44/61/27/75/9/58/83, daubs on 44+58) → `GRID_CELLS` (Task 3) + `.hg-banner-grid` (Task 2). ✓
- §3.4 coins (4, sizes/positions/rotations/glow) → `.hg-banner-coin--1..4` (Task 2) + `COINS` (Task 3). ✓
- §3.5 logo 185px + per-theme shadow → `.hg-banner-logo img` + `--bn-logo-shadow`. ✓
- §3.6 quote (serif italic, 27px, max-width 22ch, rotation, font-count note) → `.hg-banner-quote` + Task 1 font + Task 3 rotation. ✓
- §3.7 buttons (per-theme treatments, links/actions) → `.hg-banner-btn*` + light overrides + Task 3 wiring. ✓
- §4 copy (3 rotating hooks, Browse→scroll, How to play→/how-to-play) → Task 3. ✓
- §5 motion (coin bob, bloom drift, daub pulse, quote crossfade) + reduced-motion → keyframes + `@media (prefers-reduced-motion)` (Task 2). ✓
- §6 responsive → `@media` blocks (Task 2) + Task 4 checks. ✓
- §7 a11y (contrast, aria-hidden decor, real focusable buttons, 44px targets, reduced-motion) → markup `aria-hidden` (Task 3) + button `min-height:44px` (Task 2) + Task 4. ✓
- §8 surface (3 files, no new deps) → matches. ✓

**Placeholder scan:** no TBD/TODO; every code step shows the full before/after. ✓

**Type/name consistency:** class names match across CSS and JSX (`hg-banner-bloom/grid/cell/num/daub/fade/coin/hook/logo/quote/actions/btn`); `--coin-rot`, `--bob`, `--daub-rot`, `--bn-*` defined where referenced; `GRID_CELLS`/`BannerCell`/`COINS`/`start`/`step`/`quote` consistent in Task 3; `--font-dm-serif-display` (layout) → `--font-serif` (globals) → `.hg-banner-quote` chain intact. ✓

**Known non-blocking note:** two existing hooks contain an em dash. They are pre-existing product copy kept verbatim per the spec (§4); not rewritten here to avoid scope creep.
