# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Housie Ghar** — a full-stack web app that digitizes the Indian game of Housie (Tambola/Bingo). The actual project lives in `HG/`. The `housieGhar/` static prototype has been deleted — it was the design reference used during the port and is no longer needed. Current git branch: `frontend-v2-housieghar`. Backend runs on port 4000, frontend on port 3000.

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
npm run seed       # Seed roles, superadmin, two sample games, sample staff
npm test           # node:test runner (NOT Jest) — see "Backend Testing" below
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
      index.ts          # pg Pool singleton
      redis.ts          # Two Redis clients: publisher + subscriber
      migrate.ts        # Auto-discovers migrations/*.sql via readdirSync().sort(); _migrations table
      seed.ts           # Seeds: roles → superadmin → sample_games (x2) → sample_staff → tickets
      generateGameTickets.ts
    middleware/auth.ts  # JWT RS256 cookie auth; requireRole([roleNames]); requireFinancialOfficer
    modules/            # auth, games, bookings, tickets, users, wallet, audit, config, stats, players, settlements
    services/
      gameEngine.ts     # In-memory game loop; on a win, records Owed settlements in the claim txn (see below)
      winDetection.ts   # PURE win-detection (detectPatternWinners/splitPrize/allPrizesClaimed); imports only types — unit-tested
      settlements.service.ts  # recordSettlementsForPrize / listSettlements / settleSettlement; takes a pg client param (testable)
      bookingRouter.ts  # Liquidity-aware booking routing
      scheduler.service.ts  # Expiry sweeper cron (every 30s)
      audit.service.ts
    test-support/
      db.ts             # Integration-test harness: pool on TEST_DATABASE_URL, runMigrations, truncateAll, fixtures
                        #   (hasTestDb gates all DB tests; imports only pg + stdlib — never env/singleton pool)
    utils/
      sseManager.ts     # SSE registry; stream endpoint is /api/games/:id/live-stream
      ticketGenerator.ts
      trust.ts          # deriveTrust(soldCount): >=50 veteran, >=10 trusted, else new
      logger.ts         # pino logger; env-free so test-reachable modules can import it safely
  frontend/src/
    proxy.ts            # Next 16 proxy (replaces middleware.ts). Guards /staff/:path*; gates ALL
                        #   public pages behind hg_player_token or hg_auth_token → redirect to /login
    app/
      layout.tsx        # next/font/google: Space Grotesk, DM Sans, JetBrains Mono, DM Serif Display (--font-serif).
                        #   body.hg-root, data-theme="dark" default + inline script restoring localStorage 'hg-theme'.
                        #   Mounts <PlayerSync /> globally; exports viewport meta (themeColor, colorScheme).
                        #   Full OG/favicon/apple-icon metadata wired via metadataBase + NEXT_PUBLIC_SITE_URL.
      globals.css       # Entire hg-* design system (~1100 lines plain CSS under Tailwind v4 import)
      page.tsx          # Public lobby: game-night banner + Lucky Number + Live/Upcoming, 15s poll. SkeletonCard while loading.
      login/page.tsx    # Unified player+staff entry gate. Toggles between player card and staff card.
      game/[game_id]/page.tsx        # Game room: number grid, ticket previews, name entry, lock. AccountButton in header.
      game/[game_id]/live/page.tsx   # Live board: SSE draws, reveal-tease, prizes, 1-90 board.
                                     #   "Your tickets · auto-marked" in left column (below recent-numbers strip).
                                     #   AccountButton in top-right. Tickets from /api/players/me/tickets, fallback bookingStore.
      winners/page.tsx               # Hall of fame (real Prize_Pool winners)
      how-to-play/page.tsx
      staff/login/page.tsx           # Password-only staff login (also accessible via /login staff toggle)
      staff/page.tsx                 # Unified role-driven dashboard shell
    components/
      Icon.tsx          # ~36-path inline SVG icon set (NO icon library installed)
      ui.tsx            # Logo, Button, Badge, ProgressBar, CountdownPills, TrustBadges, KpiCard, …
      HousieTicket.tsx  # 3×9 grid renderer + gridToMatrix()
      TopNav.tsx        # Light/dark toggle; player username chip with sign-out; staff/burger menu
      AccountButton.tsx # Player account chip + dropdown (username, full_name, browse games, sign-out).
                        #   compact={true} mode used in game room + live board headers.
                        #   Renders nothing when no player session. Hydration-safe via useSyncExternalStore.
      PlayerSync.tsx    # Mounts globally in layout.tsx. On load: if playerStore is empty but hg_player_token
                        #   cookie is valid, calls GET /api/players/me and repopulates the store.
                        #   Fixes the cross-device / cleared-localStorage case where cookie outlives store.
      PublicShell.tsx / BookingModal.tsx
      staff/            # AdminSections, FinanceSections, OperatorSections, BookieSections
    lib/
      api.ts            # apiFetch (credentials: include, JSON)
      money.ts          # money(n) → "₹1,234" (en-IN)
      types.ts          # All API payload types (includes MyTicketsResponse)
      hooks/            # useSSE(gameId, onEvent?), useSocket, useCountdown
      stores/           # zustand: authStore, gameStore, bookingStore ("hg-booking"), playerStore ("hg-player")
  shared/types/         # Shared TS interfaces (backend imports via @shared/*)
  backend/migrations/   # 001–018 (016 = perf indexes fixed, 017 = player_id on Bookings, 018 = Prize_Settlements)
  backend/seeds/        # seed_roles, seed_superadmin, seed_sample_game (2 games), seed_sample_staff, seed_lucky_number
  nginx/nginx.conf
docs/superpowers/       # Remaining brainstorming docs (plans/specs deleted in cleanup commit)
launch.md               # Comprehensive production launch guide (added 2026-06-14)
```

### Real-Time Architecture

Two parallel channels relay game events to clients:

1. **SSE** (`sseManager.ts`) — players receive events via `GET /api/games/:id/live-stream`. Event names after the Redis relay: `initial_state` (drawn_numbers + claimed_prizes), `draw` (draw_number), `winner` (prize/housie_name/ticket_id/amount/split_count), `paused`, `resumed`, `completed`.
2. **Socket.io** — staff rooms (`join_agent_room`, `join_operator_room`, `join_admin_room`); events `new_booking_request`, `booking_expired`, `booking_skipped`, `wallet_credited`/`wallet_debited`, `topup_request_received`, `overflow_booking`.

Both are driven by a single Redis Pub/Sub channel (`game_events`); the subscriber in `server.ts` fans out to SSE + Socket.io.

**SSE critical note:** `GET /api/games/:id/live-stream` must send `Cache-Control: no-cache, no-transform`. Without `no-transform`, the Next dev proxy and nginx gzip the stream, buffering all events — the browser's EventSource gets headers but never receives data. `X-Accel-Buffering: no` is also set.

### Game Engine (`gameEngine.ts`)

- Active games live in an in-memory `Map<string, ActiveGame>`; draw sequence is CSPRNG-generated once and persisted to `Game_Logs`.
- `startGame` accepts games in `Scheduled` **or** `Paused` state and restores drawn_numbers/current_index from `Game_Logs` — this is the crash-recovery path.
- **Boot-time auto-resume**: on process start, `Live` games are re-hydrated from `Game_Logs`.
- **Paused-without-memory fix**: `resumeGame` now checks if the game is in `activeGames`. If not (e.g., process restarted while Paused), it calls `startGame` to rebuild from `Game_Logs` rather than failing with "Game state not loaded".
- Conductor uses `setTimeout` for variable speed (5–12s via `POST /api/games/:id/speed {interval_ms}`); 4s pause after a winner tick.
- **Win detection is delegated** to the pure `winDetection.ts` module (`detectPatternWinners`); `checkWins` no longer carries its own pattern helpers.
- **Atomic claim + settlement**: when a prize is won, `checkWins` marks `Prize_Pool.claimed` AND inserts an Owed row per winning ticket (`recordSettlementsForPrize`) in **one** transaction. If that transaction fails it rolls back, leaves the prize unclaimed for a later tick to retry, and announces no winner for it.
- **Exact split**: co-winners split the prize via `splitPrize` (integer-paise, remainder distributed so the full amount is always paid out); the per-winner share is what's announced and stored in `amount_per_winner`.
- **Always draws all 90**: the game completes only when all 90 numbers are drawn (or on a manual stop) — it does **not** end early when every prize is claimed. (Product decision 2026-06-30; the brief end-on-last-prize behavior from `d52bd5b` was reverted. `winDetection.allPrizesClaimed` is still exported/tested but no longer drives completion.)

### Booking Flow

1. Player POSTs `/api/bookings/lock` {game_id, ticket_ids, housie_name} → router picks the highest-balance agent with balance ≥ amount; response includes `agent_name`, `agent_phone`, `agent_town`, `whatsapp_link`, `is_overflow`.
2. If a player JWT cookie (`hg_player_token`) is present at lock time, the booking row gets `player_id` stamped — this is how tickets are recovered cross-device on the live board.
3. No qualifying agent → operator overflow queue (`GET /api/bookings/operator/overflow-queue`, `POST …/:id/force-confirm`); bypassed agents get `skip_alerts` rows + `booking_skipped` socket event.
4. Agent confirms/rejects via `POST /api/bookings/agent/:id/{confirm|reject}`; player polls `GET /api/bookings/status/:id` every 3s. Locks expire after 10 min (sweeper cron).
5. **Dev bypass** (non-production only): `POST /api/bookings/:booking_id/dev-bypass` auto-confirms a `Locked` booking using the assigned agent's wallet. Blocked by `NODE_ENV === 'production'` check (returns 404 in production).
6. Frontend persists the in-flight lock in `bookingStore` (localStorage `hg-booking`) — the game room restores it on reload; the live board uses it as a fallback when no player session is present.

### Prize Settlement Flow

The money flow is **symmetric** with booking: a confirmed booking *debits* the selling agent's wallet; winning a prize *credits* it back. Players never hold a wallet. Settlement is two-phase so payouts are auditable and never auto-pushed:

1. **Record (automatic, inside the game engine).** When `checkWins` claims a prize it calls `recordSettlementsForPrize(client, …)` in the **same transaction** as the `Prize_Pool` update. For each winning ticket it resolves the selling `agent_id` (and `player_id`) from that ticket's Sold booking and inserts a `Prize_Settlements` row with `status = 'Owed'`. No booking owns the ticket → it logs and skips (no row, no throw). `UNIQUE (prize_id, ticket_id)` makes a retry a no-op.
2. **Settle (manual, Financial Officer only).** `requireFinancialOfficer` settles each owed row: `settleSettlement` takes a row `FOR UPDATE`, flips `Owed → Paid`, stamps `settled_at`/`settled_by`, and credits the agent's wallet via a `Wallet_Ledger` `Credit` row (`reference_type = 'Prize'`, `reference_id = settlement_id`). Idempotent — a second call returns `already_paid` and does not double-credit. A zero-amount settlement flips status without a ledger write.

**API** (`modules/settlements`, all `authenticateToken` + `requireFinancialOfficer`):
- `GET /api/settlements?game_id=&status=` — list (joins Users for `agent_name`/`agent_town`)
- `GET /api/settlements/pending/count` — count of `Owed` rows
- `POST /api/settlements/:id/settle` — settle one row; audit-logs `SETTLE_PRIZE`. Returns 404 `not_found`, 409 `already_paid`, or the updated row + agent's `new_balance`.

The service functions take a `pg` Pool/PoolClient **parameter** (never the env-bound singleton) so they are integration-testable; win detection lives in pure `winDetection.ts` so it is unit-testable. No frontend consumes this API yet — it is a backend-only ledger surfaced for a future Finance Hub panel.

### Database Schema (Key Tables)
- `Scheduled_Games` (`Scheduled` → `Live` → `Paused` → `Completed`), `Tickets` (`Available` → `Locked` → `Sold`), `Bookings`, `Prize_Pool`, `Game_Logs`, `Wallet_Ledger`, `TopUp_Requests`, `Audit_Log`, `skip_alerts`
- `Users.is_cfo` — flags one Admin as Financial Officer; `Users.town` (migration 013) — staff/agent locality shown across the UI
- **`Themes` is dropped** (migration 014) — theming feature removed entirely; do not reintroduce
- `Player_Logins` (migration 015) — public player accounts. Columns: `player_id` (UUID PK), `username` (VARCHAR 30, unique, lowercased 3–18 `[a-zA-Z0-9_]`), `password` (= username at registration), `full_name`, `date_of_birth`, `created_at`, `last_login`.
- `Bookings.player_id` (migration 017) — nullable UUID FK to `Player_Logins`. Set at lock time when a player JWT is present; NULL for anonymous bookings. Indexed via `idx_bookings_player`. The settlement engine reads it to stamp the winner's `player_id`.
- `Prize_Settlements` (migration 018) — one row per winning ticket, the ledger of prize money owed to selling agents. Columns: `settlement_id` (UUID PK), `game_id`/`prize_id` FKs (ON DELETE CASCADE), `pattern_name`, `ticket_id`, `ticket_number`, `player_id` (nullable FK), `winner_housie_name`, `agent_id` (FK→Users, the **selling** agent resolved from the Sold booking), `amount` (the per-winner share), `status` (`Owed` → `Paid`, default `Owed`), `created_at`, `settled_at`, `settled_by`. `UNIQUE (prize_id, ticket_id)` makes settlement recording idempotent on engine retry. Indexed by game, agent, status.
- Trust is **derived, not stored**: count of `Sold` bookings per agent → `utils/trust.ts` tiers

### Authentication & RBAC

**Staff:** JWT RS256 in HttpOnly cookie `hg_auth_token`. `requireRole([...])` takes role **name strings** (e.g. `['Superadmin','Admin']`), not IDs. `requireFinancialOfficer` = Superadmin OR (Admin AND is_cfo). Login and `/api/auth/me` both return `is_cfo` and `town`.

**Players:** JWT RS256 in HttpOnly cookie `hg_player_token` (30-day expiry, `sameSite: 'lax'`). `POST /api/players/login` is register-or-login: new username → requires `full_name` + `date_of_birth`, creates account with `password = username`; existing username → checks `password === username` to log in. `GET /api/players/me` decodes the cookie. `GET /api/players/me/tickets?game_id=<id>` returns the player's booked tickets (Locked or Sold) for a game. `POST /api/players/logout` clears it. `playerStore` (zustand, localStorage `hg-player`) caches the player object client-side; `PlayerSync` in `layout.tsx` rehydrates it from the cookie on load.

**Proxy gating** (`src/proxy.ts`): all public routes (`/`, `/login`, `/game/:path*`, `/winners`, `/how-to-play`, `/staff/:path*`) are matched. `/login` itself is public but redirects to `/` if already logged in. All other public pages redirect to `/login` if neither `hg_player_token` nor `hg_auth_token` cookie is present. Staff routes redirect to `/staff/login` if `hg_auth_token` is absent.

Role hierarchy (role_id): `Superadmin(1)` → `Admin(2)` → `Operator(3)` → `Agent(4)`. The UI labels Agents as **"Bookie"**.

### Express 5 note

`req.body` is `undefined` when no JSON Content-Type is sent — optional-body handlers must destructure `req.body ?? {}`. `apiFetch` always sends the JSON header, so browser calls are safe.

### Backend Testing

Uses Node's built-in **`node:test`** + `node:assert/strict` (NOT Jest), run through ts-node. `npm test` = `node --require ts-node/register --test --test-concurrency=1 "src/**/*.test.ts"`. Tests live next to their subject as `*.test.ts`.

- **Two kinds of tests.** Pure unit tests (`winDetection.test.ts`, `bookingRouter` math, etc.) always run. **Integration tests are gated** by `TEST_DATABASE_URL`: each test passes `{ skip: !hasTestDb }`, so without the env var the suite reports them as skipped and exits 0.
- **`--test-concurrency=1` is required, not cosmetic.** `node --test` runs each test *file* in its own parallel process; the DB-backed files share one database and would otherwise INSERT duplicate fixtures / `TRUNCATE` each other mid-run. Serial file execution isolates them.
- **Run the DB tests locally** against a throwaway database (never the dev DB — `truncateAll` wipes it):
  ```bash
  createdb -O housie_user housie_ghar_test    # one-time; pgcrypto must exist
  cd HG/backend && TEST_DATABASE_URL="postgresql://housie_user:…@localhost:5432/housie_ghar_test" npm test
  ```
  The harness (`test-support/db.ts`) runs all migrations against it and exposes fixture builders (`freshGameWithAgent`, `createPrize`/`createTicket`/`createBooking`). Expected: **38 pass / 0 skip** with the env var, **30 pass / 8 skip** without it.
- **Testability rule:** anything reachable from a test must avoid importing `config/env.ts` (throws on missing vars at import) or the `db/index.ts` singleton (env-bound). Service functions therefore take a `pg` client parameter; `utils/logger.ts` is deliberately env-free.

### Important Next.js Note

The frontend uses **Next.js 16** (React 19). Conventions differ from training data — check `node_modules/next/dist/docs/` before changing routing/data-fetching. Notably: route params are a Promise (`use(params)`), and the request interceptor is **`src/proxy.ts` exporting `proxy()`** (the `middleware.ts` convention is deprecated). `HG/frontend/AGENTS.md` reinforces: read the bundled docs before touching routing/fonts/data-fetching.

---

## Design System (frontend-v2)

- **Plain CSS** component classes prefixed `hg-*`, all in `globals.css` (~1100 lines) under Tailwind v4's `@import "tailwindcss"`. **No motion library, no icon library** — animations are hand-written CSS keyframes, icons come from `components/Icon.tsx`.
- **Dark theme is the default** (`<body className="hg-root" data-theme="dark">`); a light palette block also exists. A **working toggle** lives in `TopNav` (`.hg-theme-btn`), persisting the choice to localStorage `hg-theme`; an inline script in `layout.tsx` restores it before hydration. Both palettes are defined as `--bg/--surface/--ink/--text/--accent/--cta/--cyan/…` under `.hg-root[data-theme='dark']` and `[data-theme='light']`.
- Accent pink `oklch(0.67 0.25 354)`, radius 18px, "sticker" aesthetic: hard offset shadows (`0 5px 0 -1px var(--ink)`), pill buttons, chunky borders. Brand trio in banner/coins: yellow `oklch(0.88 0.17 96)`, ocean `oklch(0.78 0.13 205)`/`--cyan`, pink `--accent`.
- Fonts via `next/font/google` variables: `--font-head` Space Grotesk (headings), `--font-body` DM Sans, `--font-mono` JetBrains Mono (amounts/IDs/timers), **`--font-serif` DM Serif Display (italic, the banner quote only)**.
- Money is always formatted with `lib/money.ts`. Status pills: `hg-pill-{live,scheduled,paused,completed,suspended}`; trust pills: `hg-pill-{veteran,trusted,new}`.
- Canonical prize names (backend + UI): `Early Five`, `Top Line`, `Middle Line`, `Bottom Line`, `Four Corners`, `Full House`.
- **Easing token system** (committed in `151220b`): `--ease-out-quart: cubic-bezier(.25,1,.5,1)`, `--ease-out-expo: cubic-bezier(.16,1,.3,1)`, `--ease-pop: cubic-bezier(.2,1.3,.4,1)` (win/sticker pops only); duration tokens `--dur-1` (130ms), `--dur-2` (200ms), `--dur-3` (320ms). Use these on all interactive transitions instead of bare `ease`/`linear`.

### Login page styles
`.hg-stage` — full-viewport centered flex container. `.hg-frame` — max-width 452px scrollable panel. `.hg-login-card` — card with `.hg-login-field`, `.hg-login-title`, `.hg-login-hint`, `.hg-login-err`, `.hg-login-switch` (mode toggle), `.hg-login-foot`. `.hg-player-chip` — pill in TopNav showing `username`, click to sign out.

### AccountButton styles
`.hg-acct` — relative wrapper. `.hg-player-chip` — pill button (icon + username label, or icon-only in `compact` mode). `.hg-acct-menu` — absolute dropdown card with `.hg-acct-head` (username + full_name display), `.hg-acct-item` (action row), `.hg-acct-item.is-danger` (sign-out, destructive tint).

### Lobby banner (`.hg-banner`, redesigned 2026-06-13)
The hero is a "game-night" composition, layered back-to-front via `--bn-*` banner-local vars (dark defaults on `.hg-banner`, light override in `[data-theme='light'] .hg-banner`):
- `.hg-banner-bloom` — four soft radial brand glows, slowly drifting (`hg-bloom-drift`).
- `.hg-banner-grid` — tilted 3×9 ticket (27 `.hg-banner-cell`, 8 lit numbers, 2 `.hg-banner-daub` rings pulsing via `hg-daub`).
- `.hg-banner-fade` — radial scrim quieting the grid/bloom under the hero.
- `.hg-banner-coin--1..4` — four scattered sticker number-balls, bobbing (`hg-coin-bob`, driven by `@property --bob`).
- `.hg-banner-hook` — `/hg-logo-2.png`, rotating italic-serif quote, single **"Browse games"** pill smooth-scrolling to lobby list.
- Quote rotates 3 `HOOKS` every 5s via `useSyncExternalStore` (no hydration mismatch). Full `@media (prefers-reduced-motion)` fallback.

## Staff Dashboard (`/staff`)

Single shell (`app/staff/page.tsx`); sections render from `components/staff/*` based on the authenticated role:
- **Superadmin/Admin:** overview (stats KPIs), games (table + create + start/pause/resume/speed), filling status, workforce (create/edit staff incl. town, suspend/reactivate, Superadmin can toggle CFO via `PATCH /api/users/:id/cfo`), audit log
- **Financial Officer extra:** Finance Hub (pending top-ups from master-ledger, approve/reject), Bookie Ledger, finance status-bar HUD (`GET /api/wallet/hud`)
- **Operator:** Live HUD (SSE big number, start/pause/resume, speed slider), overflow queue, filling
- **Bookie (Agent):** booking queue (socket-driven, WhatsApp reply copy, confirm/reject), wallet (balance, ledger, skip-alert FOMO card, request funds → opens `recharge_wa_link` to the CFO), filling

---

## Current State

### Most recent commits (as of 2026-06-30)
```
9968f03 test: run test files serially to isolate DB-backed integration tests
d52bd5b fix(engine): settle prizes, split exactly, end on last prize
50331ae feat(settlements): expose Financial Officer settlement API
2ac0d41 feat(settlements): list + settle (credits selling agent wallet)
ed7df42 feat(settlements): record Owed settlements on prize win
de601dd test(db): add TEST_DATABASE_URL-gated integration harness
08ecfc8 feat(db): add Prize_Settlements table (migration 018)
0513e0f feat(engine): extract pure win-detection module with unit tests
151220b feat(players): account-linkage for cross-device tickets + launch-prep
659b0f6 feat(staff): lock dropdown with three role doors
```

### Player account-linkage batch (committed `151220b`, 2026-06-21)

**Ties logged-in players to their bookings for cross-device ticket recovery.** The behaviour is documented in the architecture sections above (Booking Flow, Auth & RBAC, AccountButton/PlayerSync). Files changed in that commit:

1. **`017_add_player_to_bookings.sql`** — adds nullable `player_id UUID REFERENCES Player_Logins` to `Bookings` with index `idx_bookings_player`. Anonymous bookings stay NULL.

2. **`016_add_indexes.sql`** (modified) — removed `CONCURRENTLY` from all `CREATE INDEX` statements. The migration runner wraps files in a transaction; Postgres forbids `CONCURRENTLY` inside a transaction block, which was silently blocking all subsequent migrations.

3. **`bookings.controller.ts`** (modified) — `lockTickets` calls `getPlayerIdFromRequest(req)` and stamps `player_id` on new `Bookings` rows when a player JWT cookie is present. Both the normal and overflow booking paths updated.

4. **`players.controller.ts`** (modified) — added `getPlayerIdFromRequest(req)` helper (decodes `hg_player_token` silently, returns null if absent/invalid) and `getMyTickets` endpoint handler (`GET /api/players/me/tickets?game_id=`; resolves tickets via `unnest(b.ticket_ids)` join on Bookings filtered by `player_id` and `booking_status IN ('Locked','Sold')`).

5. **`players.routes.ts`** (modified) — wires `GET /me/tickets` → `getMyTickets`.

6. **`AccountButton.tsx`** (untracked) — player account chip + dropdown menu. Shows username + full_name, "Browse games" and "Sign out" actions. `compact={true}` renders icon-only chip for game room / live board headers. Hydration-safe via `useSyncExternalStore`. Click-outside and Escape to close.

7. **`PlayerSync.tsx`** (untracked) — invisible component mounted globally in `layout.tsx`. If `playerStore` is empty but `hg_player_token` cookie is valid, calls `GET /api/players/me` and rehydrates the store. Fixes the case where cookie outlives localStorage (other browser, cleared storage, cross-device).

8. **`layout.tsx`** (modified) — mounts `<PlayerSync />` in the body. Full OG/meta added: `metadataBase` (uses `NEXT_PUBLIC_SITE_URL`), `openGraph`, favicons (ico + hg-logo.png), apple-icon, `viewport` export with `themeColor: "#121310"` and `colorScheme: "dark light"`.

9. **`game/[game_id]/live/page.tsx`** (modified) — "Your tickets · auto-marked" moved from right column (below Prizes) to **left column** (inside `.hg-live-left`, directly after `.hg-recent` strip). Ticket source: `GET /api/players/me/tickets?game_id=` when logged in (cross-device), fallback to `bookingStore` for anonymous play. `AccountButton compact` in top-right of header.

10. **`game/[game_id]/page.tsx`** (modified) — `AccountButton compact` added to game room header.

11. **`page.tsx`** (lobby, modified) — `SkeletonCard` component renders three placeholders while `games` is null (prevents empty flash before first API response). Feed count badge hidden until data arrives.

12. **`globals.css`** (~166 line diff) — major polish pass:
    - Easing token system: `--ease-out-quart`, `--ease-out-expo`, `--ease-pop`; `--dur-1/2/3`. All transitions use these.
    - Universal keyboard focus ring via `:where(...):focus-visible` at specificity 0.
    - `html { scroll-behavior: smooth; scroll-padding-top: 84px }`.
    - `body` gets `-moz-osx-font-smoothing`, `text-rendering: optimizeLegibility`, `-webkit-tap-highlight-color: transparent`.
    - `::selection` branded with `--accent`/`--accent-ink`.
    - `text-wrap: pretty` on prose elements to reduce orphans.
    - Buttons: hover lifts 1px + shadow increase, active snaps down with 60ms fast-out.
    - `.hg-num-available`: hover lifts + shadow, active snap.
    - Input `:focus`: offset shadow added alongside border-color change.
    - Cage number revealed: ambient glow via `color-mix(in srgb, var(--accent) 45%, transparent)`.
    - Emoji bar: hover scale+lift, active snap, spring easing.

### Prize-settlement engine (committed `0513e0f` → `9968f03`, 2026-06-30)

Backend-only feature: a ledger of prize money owed to selling agents, plus game-engine correctness fixes, all under a real `node:test` suite. **No frontend was touched.** See **Prize Settlement Flow**, **Game Engine**, and **Backend Testing** above for the full design. Commit map:
- `0513e0f` — pure `winDetection.ts` (`detectPatternWinners`/`splitPrize`/`allPrizesClaimed`) + unit tests.
- `08ecfc8` — migration 018 `Prize_Settlements`.
- `de601dd` — `TEST_DATABASE_URL`-gated integration harness (`test-support/db.ts`).
- `ed7df42` / `2ac0d41` — `settlements.service.ts`: record Owed on win, list, and settle (credits the selling agent's wallet, idempotent) + integration tests.
- `50331ae` — `modules/settlements` HTTP API (Financial Officer only) mounted at `/api/settlements`.
- `d52bd5b` — `gameEngine.ts` rewired: settle in the claim txn, split exactly. (Also added end-on-last-prize, **reverted 2026-06-30** — games always draw all 90.)
- `9968f03` — `--test-concurrency=1` so DB-backed test files don't collide.

Tests: **30 pass / 8 skip** without a DB, **38 pass / 0 skip** with `TEST_DATABASE_URL`.

### Fully built & working (committed)
- Public site: lobby (banner, game cards, skeleton loading), game room, live board (SSE draws, auto-marked tickets in left column, reveal-tease, win overlay), winners, how-to-play.
- Player auth: `/login` gate, `hg_player_token` cookie, `playerStore`, TopNav chip, `PlayerSync` for cross-device rehydration.
- Staff: role-door login flow (commits `23085ff`–`659b0f6`) + unified role-driven `/staff` dashboard.
- Backend: migrations 001–018 committed; SSE `no-cache, no-transform` fix committed and working.
- Prize settlement: win → Owed `Prize_Settlements` row (in the claim txn) → Financial Officer settles → agent wallet credited. Backend + tests only; no frontend panel yet.

### Known issues / TODOs
- **Migrations 016–018 are committed** — Railway's pre-deploy `npm run migrate` applies them on deploy; for local dev run `cd HG/backend && npm run migrate` (018 = `Prize_Settlements`).
- **Settlement UI not built (by design).** The `/api/settlements` API exists and is tested but no `/staff` panel consumes it yet; a Finance Hub "Prize payouts" view (list Owed, one-click settle) is the natural next frontend task. The agent-facing wallet already shows `Prize` credits once settled (they land in `Wallet_Ledger`).
- **`housie_name` pre-fill — done.** The game-room name input pre-fills from `playerStore.player.username` (a username always satisfies the no-spaces / ≤18-char rule — `full_name` would not).
- **`dev-bypass` endpoint — working, not a bug.** Frontend (`BookingModal`) and backend route both use `POST /api/bookings/:booking_id/dev-bypass`; `app.ts` mounts it correctly and the `NODE_ENV === 'production'` guard returns 404 in production. The old `dev-bypass-confirm` name in earlier docs was incorrect and has been corrected here and in `manual.md`.
- **Sentry backend init — pending dependency install.** Per `manual.md` step 11: `cd HG/backend && npm install @sentry/node`, then add the guarded `Sentry.init` at process start. Not yet installed.
- OTP step intentionally skipped (password-only staff login remains).

---

## Resuming Work

**Start the local environment:**
```bash
brew services start postgresql@14 && brew services start redis
cd HG/backend && npm run migrate && npm run seed && npm run dev   # :4000
cd HG/frontend && npm run dev                                      # :3000
```

**Run migrate first** — migrations through 018 (`Prize_Settlements`) must be applied before the settlement engine works. Run `cd HG/backend && npm run migrate` (idempotent).

**What was last worked on (2026-06-30):**
Prize-settlement engine (backend only, **no frontend touched**) — committed across `0513e0f`→`9968f03`. Winning a prize now records an Owed `Prize_Settlements` row in the same transaction that claims the prize; a Financial Officer settles it via `/api/settlements`, which credits the selling agent's wallet. Co-winners split the prize exactly (no lost paisa). (An end-on-last-prize tweak was added then reverted on 2026-06-30 — games always draw all 90.) Win detection was extracted to a pure, unit-tested module and the project gained its first real backend test suite (`node:test`, gated DB integration harness). See **Prize Settlement Flow**, **Game Engine**, **Backend Testing**.

**Most logical next steps:**
1. **Build the Finance Hub settlement UI** (frontend) — list Owed settlements (`GET /api/settlements?status=Owed`) with a one-click settle (`POST /api/settlements/:id/settle`) in `components/staff/FinanceSections`. This is the only missing surface for the feature.
2. **Smoke-test settlement end-to-end** — start a game with sold tickets, let a prize hit, confirm a `Prize_Settlements` Owed row appears, settle it as the CFO, verify the agent's `current_balance` and `Wallet_Ledger` (`reference_type='Prize'`) update.
3. **Pre-fill `housie_name`** from `playerStore.player.full_name` in `game/[game_id]/page.tsx` (currently uses `username`).
4. When ready to ship, see `launch.md` at the repo root for the full production checklist.
