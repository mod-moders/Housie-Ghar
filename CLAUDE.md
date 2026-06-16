# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Housie Ghar** — a full-stack web app that digitizes the Indian game of Housie (Tambola/Bingo). The actual project lives in `HG/`. Backend runs on port 4000, frontend on port 3000. The repo is pushed to `https://github.com/mod-moders/Housie-Ghar.git` (branches: `frontend-v2-housieghar`, `master`). The old `housieGhar/` static prototype and all `docs/superpowers/` spec/plan files have been deleted from the repo.

## Commands

### Infrastructure

Local dev uses **Homebrew services** (Docker is not installed on this machine):

```bash
brew services start postgresql@14   # Postgres on localhost:5432
brew services start redis           # Redis on localhost:6379
```

`HG/docker-compose.yml` still exists for containerized setups (`docker compose up postgres redis -d`) but is not the active local path. Connection strings live in `HG/.env` (`DATABASE_URL`, `REDIS_URL`).

### Backend (`HG/backend/`)
```bash
npm run dev        # Start dev server with nodemon + ts-node (port 4000)
npm run build      # Compile TypeScript to dist/
npm run start      # Run compiled dist/server.js
npm run migrate    # Run all SQL migrations in order (idempotent, tracked in _migrations)
npm run seed       # Seed roles, superadmin, sample game, sample staff
```

### Frontend (`HG/frontend/`)
```bash
npm run dev        # Next.js dev server (port 3000)
npm run build      # Production build
npm run lint       # ESLint (React Compiler rules enabled — no ref writes in render, no setState in effect bodies)
```
There is **no frontend test runner** — `lint` + `build` are the only automated gates.

### JWT Key Generation (RS256)
The backend requires RSA key pairs in `.env`. Generate with:
```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```
Paste the keys as single-line escaped strings (`\n`) in `HG/.env`.

### Seeded dev logins (all password `ChangeMe123!`)
| Email | Role | Notes |
|---|---|---|
| superadmin@housieghar.local | Superadmin | `temp_password_required = TRUE` |
| cfo@housieghar.local | Admin | `is_cfo = TRUE` (Carol Finance, Shillong) — WhatsApp recharge target |
| operator@housieghar.local | Operator | assigned to the sample game |
| bookie1@housieghar.local | Agent | Bah Khrawbor, Shillong, seeded ₹5,000 |
| bookie2@housieghar.local | Agent | Kong Daphi, Sohra, seeded ₹2,000 |
| bookie3@housieghar.local | Agent | Banri Lyngdoh, Jowai, ₹0 (exercises skip-alert/overflow) |

## Architecture

### Directory Layout
```
HG/
  backend/src/
    app.ts              # Express 5 app (CORS, routes, error middleware); mounts /api/players
    server.ts           # HTTP + Socket.io boot, Redis + cron init
    config/             # env.ts (validated env), constants.ts (timings, limits, prize patterns)
    db/
      index.ts          # pg Pool singleton (default export)
      redis.ts          # Two Redis clients: publisher + subscriber
      migrate.ts        # Auto-discovers migrations/*.sql via readdirSync().sort(); _migrations table
      seed.ts           # HARDCODED seed list: roles → superadmin → sample_game → sample_staff
      generateGameTickets.ts
    middleware/auth.ts  # JWT RS256 cookie auth; requireRole([roleNames]); requireFinancialOfficer
    modules/            # auth, games, bookings, tickets, users, wallet, audit, config, stats, players
    services/
      gameEngine.ts     # In-memory game loop + win detection
      bookingRouter.ts  # Liquidity-aware booking routing
      scheduler.service.ts  # Expiry sweeper cron (every 30s)
      audit.service.ts
    utils/
      sseManager.ts     # SSE registry; stream endpoint is /api/games/:id/live-stream
      ticketGenerator.ts
      trust.ts          # deriveTrust(soldCount): >=50 veteran, >=10 trusted, else new
    migrations/         # 001–015 (015 = Player_Logins table)
    seeds/              # seed_sample_game.sql, seed_lucky_number.sql
  frontend/src/
    proxy.ts            # Next.js request interceptor. Guards /staff/:path* (staff cookie) AND all
                        #   public pages (/, /game/:path*, /winners, /how-to-play) behind
                        #   hg_player_token OR hg_auth_token → redirect to /login
    app/
      layout.tsx        # next/font/google: Space Grotesk, DM Sans, JetBrains Mono, DM Serif Display
                        #   body.hg-root, data-theme="dark" default + inline script restoring hg-theme
      globals.css       # Entire hg-* design system (~850 lines plain CSS under Tailwind v4 import)
      page.tsx          # Public lobby: game-night banner + Lucky Number card + Live/Upcoming, 15s poll
      login/page.tsx    # Unified entry gate: player mode (username/name/dob) + staff mode (email/pw)
                        #   toggled with a small "Staff login" / "← Player login" link below the card
      game/[game_id]/page.tsx        # Game room: number grid, ticket previews, name entry, lock
      game/[game_id]/live/page.tsx   # Live board: SSE draws, reveal-tease, prizes, 1-90 board
      winners/page.tsx               # Hall of fame (real Prize_Pool winners)
      how-to-play/page.tsx
      staff/login/page.tsx           # Password-only staff login (legacy; /login now also handles staff)
      staff/page.tsx                 # Unified role-driven dashboard shell
    components/
      Icon.tsx          # ~36-path inline SVG icon set (NO icon library installed)
      ui.tsx            # Logo, Button, Badge, ProgressBar, CountdownPills, TrustBadges, KpiCard, …
      HousieTicket.tsx  # 3×9 grid renderer + gridToMatrix()
      TopNav.tsx        # Sticky nav; shows .hg-player-chip (username + sign-out) when player logged in;
                        #   light/dark .hg-theme-btn toggle; staff lock icon; hamburger sheet
      PublicShell.tsx / BookingModal.tsx
      staff/            # AdminSections, FinanceSections, OperatorSections, BookieSections
    lib/
      api.ts            # apiFetch (credentials: include, JSON)
      money.ts          # money(n) → "₹1,234" (en-IN)
      types.ts          # All API payload types (incl. LuckyNumberResponse)
      hooks/            # useSSE(gameId, onEvent?), useSocket, useCountdown
      stores/           # zustand: authStore, gameStore, bookingStore ("hg-booking"), playerStore ("hg-player")
    public/
      hg-logo-2.png     # Primary logo used in the banner (185px)
      hg-logo.png       # Alternate logo
  shared/types/         # Shared TS interfaces (backend imports via @shared/*)
  nginx/nginx.conf
```

### Real-Time Architecture

Two parallel channels relay game events to clients:

1. **SSE** (`sseManager.ts`) — players receive events via `GET /api/games/:id/live-stream`. Event names after the Redis relay: `initial_state` (drawn_numbers + claimed_prizes), `draw` (draw_number), `winner` (prize/housie_name/ticket_id/amount/split_count), `paused`, `resumed`, `completed`.
2. **Socket.io** — staff rooms (`join_agent_room`, `join_operator_room`, `join_admin_room`); events `new_booking_request`, `booking_expired`, `booking_skipped`, `wallet_credited`/`wallet_debited`, `topup_request_received`, `overflow_booking`.

Both are driven by a single Redis Pub/Sub channel (`game_events`); the subscriber in `server.ts` fans out to SSE + Socket.io.

### Game Engine (`gameEngine.ts`)

- Active games live in an in-memory `Map<string, ActiveGame>`; draw sequence is CSPRNG-generated once and persisted to `Game_Logs`.
- `startGame` accepts games in `Scheduled` **or** `Paused` state and restores drawn_numbers/current_index from `Game_Logs` — this is the crash-recovery path.
- **Boot-time auto-resume** (`465a259`): on process start, `Live` games are re-hydrated from `Game_Logs` so resume/pause work after a restart.
- Conductor uses `setTimeout` for variable speed (5–12s via `POST /api/games/:id/speed {interval_ms}`); 4s pause after a winner tick.

### Booking Flow

1. Player POSTs `/api/bookings/lock` {game_id, ticket_ids, housie_name} → router picks the highest-balance agent with balance ≥ amount; response includes `agent_name`, `agent_phone`, `agent_town`, `whatsapp_link`, `is_overflow`.
2. No qualifying agent → operator overflow queue (`GET /api/bookings/operator/overflow-queue`, `POST …/:id/force-confirm`); bypassed agents get `skip_alerts` rows + `booking_skipped` socket event.
3. Agent confirms/rejects via `POST /api/bookings/agent/:id/{confirm|reject}`; player polls `GET /api/bookings/status/:id` every 3s. Locks expire after 10 min (sweeper cron).
4. Frontend persists the in-flight lock in `bookingStore` (localStorage `hg-booking`) — the game room restores it on reload, and the live board uses its ticketIds for "Your tickets · auto-marked".

### Database Schema (Key Tables)
- `Scheduled_Games` (`Scheduled` → `Live` → `Paused` → `Completed`), `Tickets` (`Available` → `Locked` → `Sold`), `Bookings`, `Prize_Pool`, `Game_Logs`, `Wallet_Ledger`, `TopUp_Requests`, `Audit_Log`, `skip_alerts`
- `Users.is_cfo` — flags one Admin as Financial Officer; `Users.town` (migration 013) — staff/agent locality shown across the UI
- **`Themes` is dropped** (migration 014) — do not reintroduce
- `Player_Logins` (migration 015) — public player accounts. Columns: `player_id UUID PK`, `username VARCHAR(30) UNIQUE`, `password VARCHAR(30)` (= username at registration), `full_name VARCHAR(100)`, `date_of_birth DATE`, `created_at`, `last_login`
- Trust is **derived, not stored**: count of `Sold` bookings per agent → `utils/trust.ts` tiers

### Authentication & RBAC

**Staff:** JWT RS256 in HttpOnly cookie `hg_auth_token`. `requireRole([...])` takes role name strings. `requireFinancialOfficer` = Superadmin OR (Admin AND is_cfo).

**Players:** Separate `hg_player_token` cookie (RS256, 30-day expiry). `POST /api/players/login` is register-or-login — new username requires `full_name` + `date_of_birth`; existing username authenticates by checking `password === username`. `GET /api/players/me` returns current player. `POST /api/players/logout` clears cookie. The `playerStore` (zustand, persisted `hg-player`) caches the player object client-side. `TopNav` shows a `.hg-player-chip` with username + sign-out when hydrated player session exists.

**Proxy gating** (`src/proxy.ts`): ALL public routes (`/`, `/login`, `/game/:path*`, `/winners`, `/how-to-play`) AND staff routes (`/staff/:path*`) are gated. Missing cookie → redirect to `/login` (public) or `/staff/login` (staff). Already-logged-in players hitting `/login` are redirected to `/`.

Role hierarchy: `Superadmin(1)` → `Admin(2)` → `Operator(3)` → `Agent(4)`. UI labels Agents as **"Bookie"**.

### Express 5 note

`req.body` is `undefined` when no JSON Content-Type is sent — optional-body handlers must destructure `req.body ?? {}`. `apiFetch` always sends the JSON header, so browser calls are safe.

### Important Next.js Note

The frontend uses **Next.js 16** (React 19). Route params are a Promise (`use(params)`). The request interceptor is **`src/proxy.ts` exporting `proxy()`** — the `middleware.ts` convention is deprecated. Read `node_modules/next/dist/docs/` before changing routing/data-fetching.

---

## Design System

- **Plain CSS** component classes prefixed `hg-*`, all in `globals.css` under Tailwind v4's `@import "tailwindcss"`. **No motion library, no icon library** — animations are hand-written CSS keyframes, icons from `components/Icon.tsx`.
- **Dark theme is the default** (`<body className="hg-root" data-theme="dark">`). Toggle in `TopNav` (`.hg-theme-btn`), persisted to localStorage `hg-theme`; restored pre-hydration by inline script in `layout.tsx`.
- Palettes: `--bg/--surface/--ink/--text/--accent/--cta/--cyan/…` under `.hg-root[data-theme='dark']` and `[data-theme='light']`.
- Accent pink `oklch(0.67 0.25 354)`, radius 18px, "sticker" aesthetic: hard offset shadows (`0 5px 0 -1px var(--ink)`), pill buttons, chunky borders. Brand trio: yellow `oklch(0.88 0.17 96)`, ocean `oklch(0.78 0.13 205)`, pink `--accent`.
- Fonts via `next/font/google` variables: `--font-head` Space Grotesk, `--font-body` DM Sans, `--font-mono` JetBrains Mono (amounts/IDs/timers), `--font-serif` DM Serif Display (banner quote only).
- Money: `lib/money.ts` → `"₹1,234"`. Status pills: `hg-pill-{live,scheduled,paused,completed,suspended}`. Trust pills: `hg-pill-{veteran,trusted,new}`.
- Canonical prize names: `Early Five`, `Top Line`, `Middle Line`, `Bottom Line`, `Four Corners`, `Full House`.

### Lobby banner (`.hg-banner`)
Game-night hero, layered back-to-front:
- `.hg-banner-bloom` — four radial brand glows, slowly drifting (`hg-bloom-drift`).
- `.hg-banner-grid` — tilted 3×9 ticket (27 cells, 8 lit numbers in yellow/ocean/pink/plain, 2 daub rings `hg-daub`).
- `.hg-banner-fade` — radial scrim over the grid.
- `.hg-banner-coin--1..4` — four sticker number-balls bobbing (`hg-coin-bob`, `@property --bob`).
- `.hg-banner-hook` — `/hg-logo-2.png` (185px), rotating italic-serif quote (3 `HOOKS`, 5s interval, random start via `useSyncExternalStore`, `key={step}` replays `hg-quote-in`), single **"Browse games"** CTA scrolling to `#hg-lobby-v2`.

### Lucky Number card (`.hg-lucky`)
Compact horizontal row widget (NOT a tall column). Ball on left (54px mobile / 66px desktop), "Lucky Number" label to the right. Layout: `flex-direction:row`, `padding:14px 18px`, `gap:14px`. Ball: `background` radial gradient on `--accent`, `border:2px solid var(--ink)`, `font-size:24px` (mobile) / `30px` (desktop). Sparks: `hg-lucky-spark--y` (11px) and `--o` (8px). Title: `18px` / `22px`. `is-wide` class for 2-digit numbers.

### Booking modal (`.hg-modal`)
- `.hg-modal`: `max-height:92vh; overflow-y:auto; -webkit-overflow-scrolling:touch` — scrollable on iOS.
- `.hg-digital-tickets` (confirmed phase): `max-height:42vh; overflow-y:auto; -webkit-overflow-scrolling:touch` — caps ticket thumbnails so the "Go to Live Board" CTA stays visible with 4+ tickets.
- `.hg-ls-row b`: `word-break:break-word; overflow-wrap:anywhere` — long ticket number strings wrap correctly.

## Staff Dashboard (`/staff`)

Single shell (`app/staff/page.tsx`); sections render from `components/staff/*` based on role:
- **Superadmin/Admin:** overview KPIs, games table + create/start/pause/resume/speed, filling status, workforce (create/edit/town/suspend/CFO toggle), audit log
- **Financial Officer extra:** Finance Hub (pending top-ups, approve/reject), Bookie Ledger, HUD (`GET /api/wallet/hud`)
- **Operator:** Live HUD (SSE big number, controls, speed slider), overflow queue, filling
- **Bookie:** booking queue (socket), WhatsApp copy, confirm/reject, wallet (balance/ledger/skip-alerts/request funds)

---

## Current State

### Last committed work (chronological, most recent last)

| Commit | What |
|---|---|
| `465a259` | Boot-time auto-resume of `Live` games from `Game_Logs` |
| `faebb82` | Lucky number endpoint (`/api/stats/lucky-number`, 12-day cycles over last 60 games) |
| `7e0586a`–`e90f633` | Lobby banner redesign — game-night hero (bloom + tilted ticket + coins + serif quote); "How to play" CTA removed, "Browse games" is the sole action |
| `17010d0` | Fix: add `LuckyNumberResponse` type to `lib/types.ts` |
| `15fdc04` | `.gitignore` for root-level design sources and screenshots |
| `9736968` | **Big cleanup + player-login commit**: deleted `housieGhar/`, `docs/superpowers/`, `PDR.md`, `PRD1.md`, `PRODUCT.md`, `reaSon.md`, `run.md`, proposed HTML mocks, napkin sketch; committed all player-login WIP (migration 015, players module, login page, playerStore, proxy gating, TopNav chip, BookingModal scroll fix, lucky number resize, logo assets) |

### Fully built & working
- Public site: lobby (game-night banner, lucky number card, live/upcoming sections), game room (ticket grid, name entry, lock flow), booking modal (lock → WhatsApp → poll → confirmed with scrollable ticket thumbnails), live board (SSE draws, reveal-tease, win overlay), winners, how-to-play.
- Player login system (code committed in `9736968`): `/login` page (player mode + staff mode toggle), `POST /api/players/login` (register-or-login), `GET /api/players/me`, `POST /api/players/logout`, `playerStore`, `hg_player_token` cookie (RS256 30d), TopNav player chip + sign-out, `proxy.ts` gating of all public routes.
- Staff: password-only login + role-driven `/staff` dashboard (admin/finance/operator/bookie).
- Backend: game engine, booking router, lucky number, derived trust, FO gating, migrations 001–015, seeds.
- Smoke-verified (pre-cleanup session): anonymous lock → bookie confirm → wallet debit; operator start/pause/resume/speed + SSE; CFO topup approve; superadmin overview/workforce/audit; hall-of-fame; lucky-number.

### Known issues / unverified
- **Player login end-to-end is UNVERIFIED.** Migration 015 (`Player_Logins` table) may not have been applied to the local DB yet. Run `npm run migrate` in `HG/backend/` before testing. The register/login/logout/proxy flows were committed but not smoke-tested in a browser session.
- The `/login` page uses the same `hg-staff-login` / `hg-login-card` CSS classes as `staff/login/page.tsx` — confirm the styles render correctly for the player form fields (full name, date of birth inputs).
- `staff/login/page.tsx` still exists as a standalone page. Players can also log in as staff via the `/login` unified card (staff mode toggle). Both paths should work.
- Lucky number card visual resize and booking modal scroll fix are committed but not visually confirmed in a browser (lint/build passed).

---

## Resuming Work

**Start the local environment:**
```bash
brew services start postgresql@14 && brew services start redis
cd HG/backend  && npm run migrate && npm run seed && npm run dev   # :4000
cd HG/frontend && npm run dev                                       # :3000
```

**Apply migration 015 first** — if `Player_Logins` table doesn't exist, the player login endpoint will 500. `npm run migrate` is idempotent; safe to re-run.

**Viewing the lobby:** `proxy.ts` gates `/` behind a player or staff session. Visit `http://localhost:3000/login`, enter any username (3–18 chars, letters/numbers/underscore) + your name + DOB to register → you'll land on the lobby. On return visits, just enter the same username.

**GitHub remote:** `https://github.com/mod-moders/Housie-Ghar.git` — branches `frontend-v2-housieghar` and `master` are both pushed. No PAT is stored in git config (was stripped after use).

**Most logical next steps:**
1. **Verify player login end-to-end** — run `npm run migrate`, open `http://localhost:3000/login`, register as a new player, confirm redirect to lobby, check TopNav chip, test sign-out.
2. **Visual QA** — eyeball the lucky number compact row and the booking modal 4+ ticket scroll fix in both dark and light themes on mobile viewport.
3. **`/staff/login` vs `/login` staff-mode redundancy** — decide if `staff/login/page.tsx` should redirect to `/login?mode=staff` or stay as-is. Currently two paths to staff login exist.
4. **Seed a lucky number** — `HG/backend/seeds/seed_lucky_number.sql` was committed; check if it needs to be run manually or if `npm run seed` picks it up.
