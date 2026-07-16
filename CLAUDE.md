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
npm run seed       # Seed roles, superadmin, two sample games, sample staff (dev only — throws in production)
npm run seed:prod  # Production bootstrap: roles + Platform_Config + one Superadmin from env (idempotent;
                   #   refuses dev-default SUPERADMIN_EMAIL/SUPERADMIN_TEMP_PASSWORD in production)
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
      seed.ts           # Seeds: roles → superadmin → sample_games (x2) → sample_staff → tickets (dev only)
      seedProd.ts       # Production bootstrap (roles + Platform_Config + Superadmin from env; idempotent)
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
    instrumentation.ts          # Sentry server init + onRequestError (no-op without SENTRY_DSN)
    instrumentation-client.ts   # Sentry browser init (no-op without NEXT_PUBLIC_SENTRY_DSN)
    app/
      layout.tsx        # next/font/google: Space Grotesk, DM Sans, JetBrains Mono, DM Serif Display (--font-serif).
                        #   body.hg-root, data-theme="dark" default + inline script restoring localStorage 'hg-theme'.
                        #   Mounts <PlayerSync /> globally; exports viewport meta (themeColor, colorScheme).
                        #   Full OG/favicon/apple-icon metadata wired via metadataBase + NEXT_PUBLIC_SITE_URL.
      globals.css       # Entire hg-* design system (~1100 lines plain CSS under Tailwind v4 import)
      page.tsx          # Public lobby: game-night banner + Lucky Number + Live/Upcoming, 15s poll. SkeletonCard while loading.
      login/page.tsx    # Unified player+staff entry gate. Toggles between player card and staff card.
                        #   Progressive player sign-in (c812409): username first; full-name/DOB fields
                        #   appear only when the backend says the username doesn't exist yet.
      game/[game_id]/page.tsx        # Game room: number grid, ticket previews, name entry, lock. AccountButton in header.
      game/[game_id]/live/page.tsx   # Live board: SSE draws, reveal-tease, prizes, 1-90 board.
                                     #   "Your tickets · auto-marked" in left column (below recent-numbers strip).
                                     #   AccountButton in top-right. Tickets from /api/players/me/tickets, fallback bookingStore.
                                     #   Spoken caller: on each draw, beep() then speak() (Web Speech API) announces the
                                     #   number caller-style ("two and one, twenty one") as it reveals. Gated by the mute toggle.
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
      staff/            # AdminSections, FinanceSections, OperatorSections, BookieSections, StaffShell,
                        #   RoleLogin, ChangePasswordCard (forced first-login password change, gated by StaffShell)
    lib/
      api.ts            # apiFetch (credentials: include, JSON)
      money.ts          # money(n) → "₹1,234" (en-IN)
      caller.ts         # callerPhrase(n) → spoken Housie phrasing, e.g. 21 → "two and one, twenty one" (pure)
      types.ts          # All API payload types (includes MyTicketsResponse)
      hooks/            # useSSE(gameId, onEvent?), useSocket, useCountdown
      stores/           # zustand: authStore, gameStore, bookingStore ("hg-booking"), playerStore ("hg-player")
  shared/types/         # Shared TS interfaces (backend imports via @shared/*)
  backend/migrations/   # 001–019 (016 = perf indexes fixed, 017 = player_id on Bookings, 018 = Prize_Settlements,
                        #   019 = drop Audit_Log.user_id FK so staff deletion isn't blocked by past logins)
  railpack.json / package.json / package-lock.json   # HG-root deploy shims for Railway (Root Directory = HG):
                        #   railpack.json pins provider node 22 for Railpack; the root package.json (private,
                        #   engines node 22.x) makes Node auto-detection work under either builder. Not used locally.
  backend/seeds/        # seed_roles, seed_superadmin, seed_sample_game (2 games), seed_sample_staff, seed_lucky_number
  nginx/nginx.conf
docs/superpowers/       # Remaining brainstorming docs (plans/specs deleted in cleanup commit)
launch.md               # Comprehensive production launch guide (added 2026-06-14)
```

### Real-Time Architecture

Two parallel channels relay game events to clients:

1. **SSE** (`sseManager.ts`) — players receive events via `GET /api/games/:id/live-stream`. Event names after the Redis relay: `initial_state` (drawn_numbers + claimed_prizes), `draw` (draw_number), `winner` (prize/housie_name/ticket_id/amount/split_count), `paused`, `resumed`, `completed`.
2. **Socket.io** — staff rooms (`join_agent_room`, `join_operator_room`, `join_admin_room`); events `new_booking_request`, `booking_expired`, `booking_skipped`, `wallet_credited`/`wallet_debited`, `topup_request_received`, `overflow_booking`, `prize_owed` (to the selling agent's room when a settlement is recorded — published by the engine after the claim txn commits; never broadcast to players).

Both are driven by a single Redis Pub/Sub channel (`game_events`); the subscriber in `server.ts` fans out to SSE + Socket.io.

**SSE critical note:** `GET /api/games/:id/live-stream` must send `Cache-Control: no-cache, no-transform`. Without `no-transform`, the Next dev proxy and nginx gzip the stream, buffering all events — the browser's EventSource gets headers but never receives data. `X-Accel-Buffering: no` is also set.

### Game Engine (`gameEngine.ts`)

- Active games live in an in-memory `Map<string, ActiveGame>`; draw sequence is CSPRNG-generated once and persisted to `Game_Logs`.
- `startGame` accepts games in `Scheduled` **or** `Paused` state and restores drawn_numbers/current_index from `Game_Logs` — this is the crash-recovery path.
- **Boot-time auto-resume**: on process start, `Live` games are re-hydrated from `Game_Logs`.
- **Paused-without-memory fix**: `resumeGame` now checks if the game is in `activeGames`. If not (e.g., process restarted while Paused), it calls `startGame` to rebuild from `Game_Logs` rather than failing with "Game state not loaded".
- Conductor uses `setTimeout` for variable speed (**default 4s**, range 3–12s via `POST /api/games/:id/speed {interval_ms}`); 4s pause after a winner tick. The start-up default is read from `CONSTANTS.DEFAULT_DRAW_INTERVAL_MS` (no longer hardcoded); the operator slider in `OperatorSections.tsx` spans 3–12s.
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

**WhatsApp payout rails (2026-07-03).** Real money never moves through the website — it moves person-to-person on WhatsApp, exactly like ticket purchase and wallet recharge; the app only records it. Three hops:
- **Winner → Bookie ("Collect").** The live board shows a "You won" card for the player's winning tickets with a prefilled wa.me link to the **selling bookie** (the same person the player paid at booking). Logged-in players get server truth via `GET /api/players/me/wins?game_id=` (reads `Prize_Settlements.player_id`, joins the agent's phone, builds the link with `buildCollectMessage`); anonymous winners get a client-built link from the `winner` SSE event + `bookingStore` agent contact.
- **Bookie → CFO ("Claim").** The bookie wallet shows a "Prize money owed to you" card (`GET /api/settlements/mine`, Agent role) listing owed rows + one "Claim ₹total on WhatsApp" button — an itemized `buildClaimMessage` to the finance contact (same CFO/Superadmin lookup as recharges, now shared via `services/financeContact.ts`). The `prize_owed` socket event refreshes this card live mid-game.
- **CFO settles (recording, not payment).** After the WhatsApp claim checks out, the FO's existing Settle click credits the wallet coins — the bookkeeping step, same as approving a top-up. Each FO panel row also carries a WhatsApp chip (`agent_wa_link`) to jump into that bookie's chat.

Message builders are pure (`modules/settlements/payoutMessages.ts` — claim/collect/settle-notice, unit-tested); wa.me assembly stays server-side via `utils/waLink.ts`.

**API** (`modules/settlements`):
- `GET /api/settlements/mine` — **Agent-only**: own prize ledger (owed first, joins game title) + `total_owed` + `claim_wa_link`
- `GET /api/settlements?game_id=&status=` — FO: list (joins Users for `agent_name`/`agent_town`/`agent_phone`; adds `agent_wa_link`)
- `GET /api/settlements/pending/count` — FO: count of `Owed` rows
- `POST /api/settlements/:id/settle` — FO: settle one row; audit-logs `SETTLE_PRIZE`. Returns 404 `not_found`, 409 `already_paid`, or the updated row + agent's `new_balance`.
- `GET /api/players/me/wins?game_id=` — player cookie: wins + per-win `whatsapp_link` to the selling bookie (in `modules/players`).

The service functions take a `pg` Pool/PoolClient **parameter** (never the env-bound singleton) so they are integration-testable (`listAgentSettlements`, `listPlayerWins`, `recordSettlementsForPrize` — which returns the inserted rows so the engine can publish `prize_owed` after commit); win detection lives in pure `winDetection.ts` so it is unit-testable. The Finance Hub **Prize Payouts** panel (`PrizePayoutsSection` in `components/staff/FinanceSections.tsx`, FO-only) consumes this API — an Owed/Paid ledger with a two-click Settle. `getSettlements`/`postSettle` coerce the `DECIMAL` `amount` to a JS number before responding (node-pg returns numeric as a string), matching `wallet.controller.ts`.

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

**Per-request account flags (2026-07-02):** `authenticateToken` re-checks the DB on every request (`getStaffAccessFlags` in `modules/auth/auth.service.ts`): suspended accounts 403 immediately (a live cookie no longer outlives suspension), and `temp_password_required = TRUE` locks the account to `/api/auth/change-password` + `/api/auth/me` + `/api/auth/logout` — everything else returns 403 `{ code: 'TEMP_PASSWORD_REQUIRED' }`. `POST /api/auth/change-password` (`{ current_password, new_password }`, min 8 chars) verifies the current password, re-hashes (bcrypt 12), clears the temp flag, and audit-logs `CHANGE_PASSWORD`. The login bcrypt fallback backdoor (any account + `ChangeMe123!` on a malformed hash) was **removed** — malformed hashes now fail closed. Admin password reset: `PATCH /api/users/:id` accepts optional `password` (≥8 chars, not for your own account), re-hashes and re-flags `temp_password_required = TRUE`, audit-logs `RESET_USER_PASSWORD`. Frontend: `StaffShell` gates on `temp_password_required` from `/api/auth/me` and renders `ChangePasswordCard` (all staff login paths funnel through the shell, so the three login forms needed no changes). Service functions live in `auth.service.ts` (pg-client param, env-free) with integration tests in `auth.service.test.ts`.

**Players:** JWT RS256 in HttpOnly cookie `hg_player_token` (30-day expiry, `sameSite: 'lax'`). `POST /api/players/login` is register-or-login: new username → requires `full_name` + `date_of_birth`, creates account with `password = username`; existing username → checks `password === username` to log in. `GET /api/players/me` decodes the cookie. `GET /api/players/me/tickets?game_id=<id>` returns the player's booked tickets (Locked or Sold) for a game. `GET /api/players/me/wins?game_id=<id>` returns the player's prize wins with a WhatsApp collect link to the selling bookie. `POST /api/players/logout` clears it. `playerStore` (zustand, localStorage `hg-player`) caches the player object client-side; `PlayerSync` in `layout.tsx` rehydrates it from the cookie on load.

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
  The harness (`test-support/db.ts`) runs all migrations against it and exposes fixture builders (`freshGameWithAgent`, `createPrize`/`createTicket`/`createBooking`, `createStaff`/`createPlayer`). Expected (as of `1a28383`): **58 pass / 0 skip** with the env var; the DB-backed tests all report skipped without it.
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
- **Compact banner (2026-07-09)** — `.hg-banner` is a hero *band*, not a full viewport: `min-height:clamp(340px, 44dvh, 460px)` (the old `calc(100dvh - var(--nav-h))` and the `--nav-h` var are gone). Logo 148px base / 156px desktop / 128px ≤899 / 108px ≤559; desktop quote 26px.
- **Candy daylight layer (2026-07-09, light theme)** — light mode's answer to neon, appended after the neon layer in `globals.css`. Same brand trio as *print*, not light: pastel ambient washes on `.hg-frame`/`.hg-stage` (live board + login grounds made transparent to show them), crisp pink→cyan→gold hairline under sticky chrome, tinted color-spill shadows under live cards/CTAs/lucky ball/cage, cyan-lit called tiles on the 1–90 board (deep-teal text for AA), deep-magenta "Live Now" label (`oklch(0.52 0.23 354)` — the base accent fails AA at 11.5px on cream), candy conic border ring on `.hg-login-card` (2px; ink offset shadow retained).
- **Neon radiant layer (2026-07-08, dark theme only)** — final section of `globals.css` before the candy layer. Tokens on `.hg-root[data-theme='dark']`: `--neon-pink/--neon-cyan/--neon-gold` (brand trio run as light) + `--halo-pink/cyan/gold` (layered box-shadow stacks). Neon-sign language on player surfaces: gradient hairline under sticky chrome (`.hg-nav/.hg-live-top/.hg-room-head::after`), LIVE badge ignition flicker + breathe (`hg-neon-ignite`/`hg-neon-breathe`; `:has(.hg-live-dot)` scopes it so PAUSED renders amber instead), pink tube rim + top edge-light on `.hg-card.is-live`, halo'd cage ball with expanding `hg-neon-ring` on reveal, cyan-lit called tiles on the 1–90 board, conic-gradient border ring on `.hg-login-card`, glowing banner coins/lucky ball, chrome micro-glow hovers. The 2026-07-07 casino-layer ambient alphas were also raised (.05→.09–.13) and banner blooms amped. Light theme and staff dashboards untouched; reduced-motion relies on the global animation kill-switch.

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
- **Superadmin/Admin:** overview (stats KPIs), games (table + create + start/pause/resume/speed), filling status, workforce (create/edit staff incl. town, suspend/reactivate, Superadmin can toggle CFO via `PATCH /api/users/:id/cfo`; Superadmin can hard-delete via `DELETE /api/users/:id` — two-click trash button, committed `1a28383`. Accounts referenced by games/bookings/wallet/created-staff 409 ("suspend instead"); migration 019 dropped the `Audit_Log.user_id` FK (log is immutable + stores name/role text) so a past login doesn't block deletion; audit-logs `DELETE_USER`; service in `users.service.ts`, 6 integration tests, suite 52 → 58), audit log
- **Financial Officer extra:** Finance Hub (pending top-ups from master-ledger, approve/reject), Bookie Ledger, **Prize Payouts** (Owed/Paid settlement ledger — two-click Settle credits the selling agent's wallet; per-row WhatsApp chip to the bookie; sidebar owed-count badge from `GET /api/settlements/pending/count`), finance status-bar HUD (`GET /api/wallet/hud`)
- **Operator:** Live HUD (SSE big number, start/pause/resume, speed slider), overflow queue, filling
- **Bookie (Agent):** booking queue (socket-driven, WhatsApp reply copy, confirm/reject), wallet (balance, ledger, skip-alert FOMO card, request funds → opens `recharge_wa_link` to the CFO, **"Prize money owed to you" card** → itemized "Claim on WhatsApp" to the CFO, refreshed live by `prize_owed`), filling

---

## Current State

### ⚠️ Production cutover: `master` branch is now the live website (2026-07-15/16)

**The single most important thing to know before touching anything in this repo:** the live `housieghar.in` site no longer runs the codebase documented in the Architecture/Design System/Staff Dashboard sections above. Those sections describe `frontend-v2-housieghar` (this checkout's branch), which is now **fully stopped** and serves nothing. Per explicit user instruction ("the master branch should be the live website"), production was cut over to the unrelated-history `master` branch — a separate, simpler codebase (no prize-settlement engine, no `node:test` suite, no auth hardening, Bearer-token localStorage auth instead of httpOnly cookies — see the "Master-branch staff-feature integration" entry further down for what master lacks). This checkout's local working tree was **not modified** by this cutover; only remote infra (Railway, Vercel, GitHub `master`) changed.

**What changed, concretely:**

1. **New backend** — Railway project `alluring-adventure`, service `housie-ghar-master`, built from `origin/master`. Fresh Postgres + Redis (not shared with the old deployment). Root Directory is the repo root (not `backend/` — `master`'s `backend/tsconfig.json` imports `@shared/types/*` from a sibling `shared/`, same constraint as `frontend-v2-housieghar`). Build `cd backend && npm ci && npm run build`, Pre-Deploy `cd backend && npm run migrate`, Start `cd backend && npm start`. Two commits pushed directly to `origin/master` (not present in this checkout's history, pushed from detached worktrees):
   - `fe27343` — added root-level `railpack.json`/`package.json`/`package-lock.json` so Railway's Node auto-detection works (mirrors the fix already on `frontend-v2-housieghar`'s `HG/railpack.json`).
   - `1d824ff` — empty `chore(deploy): trigger production deployment` commit, needed because Vercel's in-dashboard "Redeploy" kept trying to reuse a stale source snapshot instead of pulling `master`'s current HEAD under the corrected project settings.
   - Live at `https://housie-ghar-master-production.up.railway.app` (Railway-generated domain only — **no custom domain attached yet**, see Known Issues below).
   - A fresh JWT RS256 keypair was generated for this deployment (not reused from the old site).
   - Seeded via `master`'s `seed_roles.sql` + `seed_superadmin.sql` (4 roles, 1 Superadmin, 11 `Platform_Config` rows), applied SSH-free through `railway connect Postgres --no-ssh < seed.sql` (no local SSH key existed, and generating one was correctly blocked as unauthorized persistence).
   - **`master`'s seed ships a hardcoded, publicly-committed bcrypt hash for the Superadmin password (`Enterhg@01` for `superadmin@housieghar.in`)** — this is a real exposure in `backend/seeds/seed_superadmin.sql` on `origin/master`. Login was verified working with that password, then **immediately rotated** via `POST /api/auth/change-password`. Current live Superadmin credentials: `superadmin@housieghar.in` / `StR3pONsf93vCv3JG0me` (verified: old password now 401s). **This is different from every dev login in the Commands table above** — those are for local `frontend-v2-housieghar` dev only.

2. **Vercel repointed** — project `housie-ghar` (bound to `mod-moders/Housie-Ghar`, domain `housieghar.in`):
   - Production environment's Branch Tracking: `frontend-v2-housieghar` → **`master`**.
   - Root Directory: `HG/frontend` → **`frontend`** (`master`'s repo layout has no `HG/` prefix — root-level `backend/`, `frontend/`, `shared/`).
   - New env var `NEXT_PUBLIC_API_URL = https://housie-ghar-master-production.up.railway.app` (Production+Preview, not marked Sensitive — `master`'s `lib/api.ts` reads this directly, unlike `frontend-v2-housieghar`'s `BACKEND_ORIGIN` var, which is now unused dead config left in Vercel's project settings).
   - Verified live end-to-end in a real browser: `housieghar.in` renders `master`'s distinct signup UI (comic-book logo, "Powered by MOD" footer); `/staff/login` → Superadmin dashboard loads with the rotated credentials, confirming the full Vercel→Railway→Postgres→auth chain works.

3. **Old backend stopped, not deleted** — Railway project `exciting-rebirth`, service `Housie-Ghar` (was Online at `https://api.housieghar.in`, built from `frontend-v2-housieghar` @ `2b4b907`, same HEAD as this checkout). Per explicit user request ("disconnect the frontend-v2-housieghar, nothing should be running") with scope confirmed via AskUserQuestion (**stop app, keep data** — not a full teardown):
   - `railway down --service Housie-Ghar --yes` removed the active deployment (service now shows `Failed`/offline; `curl https://api.housieghar.in` now 404s at Railway's edge).
   - The `frontend-v2-housieghar` branch link was disconnected in the service's Settings → Source (so a future push to that branch cannot silently redeploy it).
   - **Postgres + Redis for `exciting-rebirth` were left Online, untouched** — old data (if any real usage happened) is preserved but nothing reads/writes it anymore.

**Known issues / open decisions from this cutover — read before doing more infra work:**
- **`api.housieghar.in` DNS is now stale.** The Hostinger CNAME still points at the old Railway hostname (the now-stopped service). Nothing currently resolves it to the new backend — the new backend is only reachable via its raw Railway domain. Decide: repoint `api.housieghar.in` at `housie-ghar-master-production.up.railway.app` (or attach it as a Railway custom domain), or leave it retired if nothing hard-codes that URL.
- **This is a different codebase, not a redeploy.** `master` lacks the prize-settlement engine, the `node:test` suite, and all the auth-hardening work documented throughout this file (temp-password gate, rate limiters, backdoor removal — see "Master-branch staff-feature integration" below for the fuller list of what was deliberately *not* ported from master into `frontend-v2-housieghar` because master regressed things). Anyone debugging "the live site" now needs `master`'s source, not this checkout's `HG/` tree.
- **The Finance Hub "Withdrawal Queue ₹24,500 · 6 pending requests" card** shown on first Superadmin login looked like `master`'s pre-existing fabricated demo data rather than something backed by the fresh, freshly-seeded database — unconfirmed, worth checking before trusting any number on the new dashboard.
- **`exciting-rebirth`'s Postgres/Redis are still running** (kept per user's choice) but serve no traffic — pure cost/cleanup item whenever the user wants to revisit it.
- **Two GitHub repos** (see the dedicated section below) now matters even more: both `master` and `frontend-v2-housieghar` live in the same `mod-moders/Housie-Ghar` repo, so always confirm which **branch** each Railway/Vercel project tracks before making changes — it's no longer just a repo-identity check.
- Local scratchpad files from this session (JWT keypair, seed SQL, the rotated-password note) live under this session's temp scratchpad directory, not in the repo — nothing was written into this checkout.

### Latest session (2026-07-14 evening): staff-account cleanup + player profile polish

Most recent commit is **`a9921ef`** on top of a run of small player/staff-facing fixes made earlier the same day. In commit order (oldest → newest):

- **`8273e11` chore** — removed "Powered by MOD" and the `TrustBadges` copy ("Provably fair draws" / "Pay your agent directly") site-wide. `TrustBadges` and the `Footer`'s tagline/branding line were deleted from `ui.tsx` entirely (now unused); every staff login surface (`/login`, `RoleLogin`, `/staff/login`, `ChangePasswordCard`) and the staff sidebar had their standalone "Powered by MOD" line stripped too.
- **`14e1795` feat(players)** — ports master's player profile/stats parity, adapted to this branch's real schema: new **`/profile`** page (`HG/frontend/src/app/profile/page.tsx`) lets a player edit `full_name`/`phone`/`email`, toggle the caller-sound preference, and optionally layer a real password on top of the default username-only login (set/change/remove); new **`/stats`** page (`HG/frontend/src/app/stats/page.tsx`) shows lifetime engagement/wins computed from real `Bookings`/`Prize_Settlements` rows (net profit, win rate, streaks, luckiest ticket) — **not** master's fabricated numbers. Backend: migration **023** adds `Player_Logins.phone/email/password_hash/sound_enabled`; `players.controller.ts` grew a `PATCH /api/players/me` (accepts `password`/`remove_password` to toggle real-password login) and `GET /api/players/me/stats`. Login (`/login/page.tsx`) and the live board's default mute state now honor the saved password/sound preferences.
- **`c229c93` fix(profile)** — the two profile cards felt cramped; bumped panel padding 20→28px and inner gap 14→18px (`HG/frontend/src/app/profile/page.tsx`).
- **`afefa6b` fix(lobby)** — the lobby's "next draw" hero card was pulling the soonest **scheduled** game up above the Upcoming Games list whenever nothing was live, contradicting the intended section order. Fixed in `page.tsx`: only `Live`/`Paused` games ever render above "Upcoming Games"; that section now always lists every scheduled game.
- **`a9921ef` feat(staff)** — three unrelated small fixes bundled together per user request:
  1. **Add Staff form simplified** (`AdminSections.tsx`, `WorkforceSection`) — no longer asks for email/phone when provisioning an Admin/Operator/Bookie. Backend (`users.controller.ts`, `createUser`) synthesizes a unique placeholder email (`staff-<uuid>@housieghar.internal`) server-side when none is submitted, since `Users.email` is `NOT NULL UNIQUE`. New staff also no longer get `temp_password_required = TRUE` on creation — they log in directly with the password the admin set (this only affects newly-created accounts; admin-initiated password *resets* via `PATCH /api/users/:id` still re-flag the target account, that's a separate intentional reset flow).
  2. **Staff self-service email edit** (`ProfileSection.tsx` + `auth.controller.ts`) — Admins/Operators/Bookies can now edit their own login email directly from **My Profile**, no admin approval needed. `PATCH /api/auth/me` accepts an optional `email` field (empty/whitespace rejected, 409 on collision with another account's email/phone).
  3. **Lobby spacing** (`globals.css`, `.hg-lobby-v2`) — added bottom padding (40px mobile / 64px ≥900px) so there's breathing room after the last game card instead of the list running flush to the page edge.

  Both `tsc --noEmit` (backend and frontend) pass clean. Not covered by the `node:test` suite (small UI/controller tweaks, no new integration tests written this session).

**Caution for next session:** the `a9921ef` commit's diff to `globals.css` shows ~325 lines changed even though only ~2 lines (the `.hg-lobby-v2` padding) were intentionally authored this session — the file already carried the **uncommitted neon/candy CSS layer** (see "Uncommitted working tree" below, dated 2026-07-08/09) before this session started, and it rode along into the commit. The user was asked and explicitly said to push as-is, so this is expected/accepted, not a mistake to undo — but it means `git blame`/`git show a9921ef -- globals.css` will show that older CSS work attributed to this commit's message.

### Master-branch staff-feature integration (committed `be706da`→`3732147`, 2026-07-14)

The user pushed a parallel "HG Final Website" codebase to `origin/master` (unrelated history) and asked to **port all new superadmin/admin/operator/bookie features into `frontend-v2-housieghar` without merging branches**. Master also *regressed* things this branch has (it lacks the settlement engine, the test suite, and the auth hardening), so only the genuinely-new staff features were re-implemented against our architecture — and master's fabricated dashboard data was replaced with real SQL. Landed as 10 feature-grouped commits:

- **`be706da` engine** — 11-dividend prize system (Early Five, Quick 7, Corner, Star, Top/Middle/Bottom Line, Box Bonus, tiered 1st/2nd/3rd Full House with exclusion-set semantics; legacy aliases like Four Corners→Corner for editing old games). Draw pace default now **8s** (range 5–12s). `winDetection.ts` + tests + `gameEngine.ts` + `shared/types/game.ts`.
- **`d856cdc` game management + caller** — `PATCH /api/games/:id` (edit Scheduled games; economics frozen once any ticket is Sold/Locked) and `DELETE /api/games/:id` (blocks Live/Paused). `getGames` returns `completed_at` + real `player_count`. **Number_Calls** (migration **020**): per-number caller `call_text` + MP3s uploaded base64→`uploads/audio/calls` (cwd-relative, gitignored), served at `/audio/calls` with `Cross-Origin-Resource-Policy: cross-origin` (helmet default would block cross-origin playback); a 6mb JSON parser is scoped to the upload path *before* the global parser. **CORS `methods` gained `PATCH`** — a real production bug (dev's same-origin rewrites hid it). `numberCalls.controller.ts` new; number-calls routes declared before `/:game_id` param routes.
- **`ac2c6cb` players** — `GET /api/players` (derived stats), `PATCH /:id/status` (Admin+ suspend/reactivate), `DELETE /:id` (Superadmin-only; NULLs `player_id` on bookings + settlements first). Migration **022** adds `Player_Logins.status`; suspended players are rejected at login and `/me`.
- **`7ca12a4` auth** — `PATCH /api/auth/me` (staff self-edit full_name/phone/upi_id; duplicate WhatsApp 409s).
- **`d9c414f` stats** — `GET /api/stats/financial-analysis` (Admin+): lifetime collection/payouts/profit over Completed games, per-game rows, 7-day daily series, 24-bucket hourly-today, new-vs-returning retention from `Bookings.player_id`. Fixes master's `SUM(DISTINCT prize_amount)` bug (gross computed in JS).
- **`298fb0b` config** — Platform_Config gains `announcements_list` (JSON, ≤5 `{id,text,muted}`), `announcement_speed`, `announcements_muted`, `english_caller_enabled` (migration **021**, seeded dev + `seedProd`). `config/public` whitelists all four.
- **`3721b37` ui primitives** — role avatars (`public/avatars/` + `roleAvatar.ts` + self-contained `Avatar` in `ui.tsx`), edit/eye/spark icons, Canvas `sharePoster.ts`, new payload types, `phone`/`upi_id` on `AuthUser`, `/audio` rewrite in `next.config.ts` (same-origin MP3s in dev).
- **`0e45714` admin sections** — GamesSection 11-dividend prize editor (Full House tier auto-rename `1st Full House`→`Full House`), inline edit + two-click delete, Watch-Live link, real player count; new `HistorySection` (completed games + results modal); real-data analytics widgets (Sparkline via `useId`, AnalyticsChart, Heatmap, Retention). New `CallVoiceSettings` (per-number phrase/MP3 editor + TTS preview; global caller toggle only for Superadmin since `PUT /api/config` is Superadmin-only). **`AnnouncementSection` removed** (folded into SettingsSection).
- **`fdbc4d4` staff sections + shell** — `PlayersSection`, `ProfileSection`, `SettingsSection` (Superadmin lobby-announcements manager, **no theme gallery** — `Themes` stays dropped), Operator `ShareGamesSection`, tabbed `FinanceHubSection` (analysis tab renders the real `financial-analysis` series with true day-over-day deltas; **`MasterLedgerSection` export removed**, folded into a Ledgers tab; master's fake "Withdrawal Queue" dropped). `StaffShell` nav rebuilt (Past Games/Player Management/Staff Management/Website Audits/Website Settings/My Profile/Share to WhatsApp; `document.title = HG-{role}`; avatar in status bar).
- **`3732147` public** — lobby strip rotates the un-muted `announcements_list` at `announcement_speed` (per-item + global mutes; `marquee_text` fallback when empty); live board's spoken caller uses each number's configured `call_text`/MP3 (respects saved voice preference), silent when `english_caller_enabled === "false"`, else falls back to `callerPhrase()`.

**Deliberately NOT ported:** master's login backdoor (`ChangeMe123!` bcrypt fallback — our branch removed it), the theme gallery / `active_theme` (`Themes` is dropped), the fabricated dashboard charts/deltas/heatmap/retention (replaced with real SQL), and master's fake withdrawal queue. Gates green at integration: backend build clean + `npm test` 63 tests (38 pass / 25 skip, no `TEST_DATABASE_URL`), frontend `tsc` + `eslint` clean + production build clean; all new endpoints smoke-tested against the running dev backend (config/public, number-calls list + PATCH + restore, players, financial-analysis, auth/me PATCH, games PATCH/DELETE 404). **Excluded from these commits** (left in the working tree, pre-existing dirty state owned by the launch work): `manual.md`, `HG/frontend/src/app/globals.css`, this `CLAUDE.md`, and untracked `HG/nixpacks.toml`. Not yet pushed.

### Most recent commits on `frontend-v2-housieghar` (as of 2026-07-13)
```
c77d59b fix(nav): keep staff doors out of the mobile hamburger
c812409 feat(login): progressive player sign-in — username first, register only if new
1a28383 feat(staff): delete staff accounts from the Workforce panel
24f0e75 chore: trigger Vercel production deploy
4b93efb chore(deploy): lockfile for the HG-root manifest
c831021 fix(deploy): add HG-root package.json so Nixpacks detects Node
e569daa fix(deploy): declare Node provider via railpack.json, not nixpacks.toml
b3b5cef fix(deploy): use generic nodejs package name in nixpacks.toml
f790451 fix(deploy): force Node.js provider for Railway build
6e51aa8 feat(admin): smart game presets + announcement marquee strip
a35f44d docs: record WhatsApp payout rails + login-page desktop fix
```
(Superseded as the live branch by the `master` cutover above — this branch's HEAD, `2b4b907`, is one commit newer than this list and is what the now-stopped `exciting-rebirth` backend was running.)

**Two GitHub repos exist.** `origin` is now **`mod-moders/Housie-Ghar`** (canonical) — it hosts **both** `frontend-v2-housieghar` (this checkout) and `master` (now live) as unrelated-history branches of the same repo; **`flinchtheflincher/Housie-Ghar`** is the original and sits several commits behind. Mid-launch (2026-07-11) `origin` was silently repointed from flinchtheflincher to mod-moders while the mod-moders copy was 17 commits stale — Railway (watching the stale copy) kept building old code, making every deploy fix look ineffective for an evening ("npm: not found" across 6+ deployments). Since resolved: all work now lands on mod-moders. See memory `hg-two-github-repos`. **Before debugging any deploy: confirm both the Source repo AND the branch in Railway/Vercel Settings match what you're pushing to** — now that two branches of the same repo are both deployed (one to `alluring-adventure`+Vercel-production, one formerly to `exciting-rebirth`), branch confusion is the more likely failure mode than repo confusion.

### Production launch history (2026-07-10 → 07-13) — original Railway + Hostinger DNS + Vercel setup for `frontend-v2-housieghar`

This is the now-superseded original launch (see the cutover section at the top of Current State for what replaced it). Kept for reference since the same Railway/Node-detection gotchas apply to any future Railway service in this repo:

- **Railway backend service config (the combination that builds):** Root Directory **`HG`** — NOT `HG/backend`; the backend imports `@shared/types/*` from the sibling `HG/shared`, which a narrower root excludes from the build context (tsc exit 2). All three commands are prefixed: Build `cd backend && npm ci && npm run build`, Start `cd backend && npm start`, Pre-Deploy `cd backend && npm run migrate`.
- **Node detection at the HG root:** with Root Directory `HG` there is no `package.json` at the build root, so Railway's builder installed no Node at all → `sh: 1: npm: not found` (exit 127). Fixes committed: `HG/railpack.json` (`provider: node`, node 22 — the service builds with **Railpack**, so the earlier `nixpacks.toml` attempts were silently ignored), `HG/package.json` (root manifest: private, engines node 22.x, build/start scripts delegating into `backend/` — makes detection work under either builder; commit `c831021`, authored by a parallel session), and `HG/package-lock.json` (empty lockfile so a root `npm ci` can't fail; `4b93efb`).
- **Railway state (now stopped, see cutover section):** project `housie-ghar`/`exciting-rebirth` with Postgres + Redis plugins + the `Housie-Ghar` repo service. Custom domain `api.housieghar.in` was attached here — **now stale**, points at a service with no active deployment.
- **Hostinger DNS (Step 8, still live):** apex A → `76.76.21.21` with the Name field left **blank** (hPanel rejects a literal `@`), `www` CNAME → `cname.vercel-dns.com`, `api` CNAME → `housie-ghar-production.up.railway.app` (the old backend — needs a decision, see Known Issues in the cutover section).
- **Vercel:** this project (`housie-ghar`) is the same one now repointed to `master` in the cutover above.

Parallel-session features landed meanwhile: **`1a28383`** Superadmin hard-delete of staff (`DELETE /api/users/:id`, two-click trash in Workforce; 409 "suspend instead" when referenced by games/bookings/wallet/created-staff; migration **019** drops the `Audit_Log.user_id` FK so a past login doesn't block deletion; suite 52 → 58) and **`c812409`** progressive player sign-in (username-first; full-name/DOB fields appear only when the backend says the username is new).

### Uncommitted working tree (as of 2026-07-16, unchanged since 2026-07-13)

- **`manual.md` (~372-line diff)** — launch-guide corrections from walking the real launch: Step 5 rewritten (Root Directory `HG`, `cd backend &&` commands, the railpack/npm-not-found correction blocks), Step 6 expanded for a first-time Railway user (6.1 reference-variable picker, 6.2 beginner walkthrough, 6.3 Raw Editor multi-line PEM format, 6.4 variables table with per-variable failure modes, 6.4a plain-terms explainer, 6.5 deploy verification), Step 8 corrections (blank apex Name, de-bracketed CNAME placeholder, "Waiting for DNS update" explainer with a beginner box). This guide now describes the **old, superseded** `frontend-v2-housieghar` launch path — it has not been updated for the `master` cutover.
- **Untracked `HG/nixpacks.toml`** — inert leftover from the deploy debugging (Railpack ignores it); safe to delete.
- Note: `HG/frontend/src/app/globals.css` (neon/candy CSS layers) and `HG/frontend/src/components/TopNav.tsx` (mobile staff-door removal), both previously listed here as uncommitted, **were committed** in `a9921ef`/earlier — no longer part of the dirty working tree. Only `manual.md` and `HG/nixpacks.toml` remain.

### Committed in `6e51aa8` (2026-07-07) — two new features from `do.md` triage

A `do.md` "V3.0 master spec" was dropped into the repo root describing the whole platform. Most of it documents already-built functionality; two genuinely new, valuable pieces were implemented and **committed in `6e51aa8`** together with the casino-night CSS layer and the user's own `seed_superadmin.sql`/`app.ts` edits:

**1. Smart Game Presets (`AdminSections.tsx`, `GamesSection`).** The create-game form previously opened with a default 120%-of-gross prize spread (invalid until hand-tuned). Four one-click preset chips now sit above the form: *High Noon Fortune* (12:00, ₹50×100), *Snack & Stack* (15:00, ₹30×150), *Sundown Showdown* (18:30, ₹80×120), *Prime Time* (21:00, ₹100×200 = 70% of gross). `nextSlotFor(hour, minute)` computes the next occurrence of that time-of-day (rolls to tomorrow if <15 min lead), `toLocalInput()` builds a zone-less `datetime-local` string by hand (no `toISOString()` UTC shift), `slotLabel()` renders "Today/Tomorrow h:mm". Clicking a chip fills title/schedule/price/capacity/prize-pattern all at once; every field stays editable after.

**2. Superadmin announcement / marquee strip.** `Platform_Config.marquee_text` existed in the schema but had no reader and no editor — dead data. Now: `GET /api/config/public` (`config.controller.ts`/`config.routes.ts`, no auth) whitelists `marquee_text`/`support_email`/`support_phone` for public consumption; the lobby (`page.tsx`) renders it as a sticker-style `.hg-notice` strip (bell icon, ink border, offset shadow) above the games list, hidden when empty; a new Superadmin-only **Announcement** sidebar section (`AnnouncementSection` in `AdminSections.tsx`, wired into `StaffShell.tsx` nav for `role_id === 1`) edits it with a live preview and `PUT /api/config`, audit-logged via the existing `UPDATE_PLATFORM_CONFIG` path. New `seed_platform_config.sql` (mirrors `seedProd.ts` defaults, `ON CONFLICT DO NOTHING`) was added to `seed.ts`'s `seedFiles` so a fresh dev DB has the config rows the editor needs — without it `updateConfig`'s UPDATE-only semantics leave the key permanently missing.

Files touched: `config.controller.ts`, `config.routes.ts`, `db/seed.ts`, `seeds/seed_platform_config.sql` (new), `lib/types.ts` (`PublicConfigResponse`, `ConfigEntry`), `AdminSections.tsx`, `StaffShell.tsx`, `app/page.tsx`, `globals.css` (`.hg-notice*`, `.hg-preset-*`, `.hg-form-saved`).

**Skipped from `do.md` deliberately:** Retro Arcade theme / `active_theme` (violates the standing "`Themes` is dropped, do not reintroduce" rule below), OTP (already an intentional skip), a fake SCORE/CREDITS HUD (fabricated data), a `promoters` table (no workflow behind it), a Bingo Machine hero (banner was deliberately redesigned 2026-06-13), a `/sync` reconnect endpoint (SSE `initial_state` + EventSource auto-reconnect already cover it).

Both features were verified end-to-end in headless Chromium (player sees the lobby strip; Superadmin edits it and sees it go live + audit-logged; Prime Time preset → Create Game succeeds with a valid 70%-of-gross pool and 200 generated tickets). Gates green: backend build clean, `npm test` 52/52 (33 pass / 19 skip without `TEST_DATABASE_URL`), frontend `eslint` + `tsc --noEmit` clean. Frontend production build was **not** run because `next dev` was live at the time (see Turbopack note below).

Also present, pre-dating this session and **not to be reverted** — user's own in-progress edits:
- `seeds/seed_superadmin.sql` — rebranded superadmin to `superadmin@housieghar.com` / password `Housie@2026`, `ON CONFLICT (phone) DO UPDATE`.
- `src/app.ts` — both auth rate-limiter `app.use` lines commented out.

**Gotcha hit this session:** Turbopack's dev server can miss the second of two back-to-back writes to `globals.css` in the same turn — `touch` does not force a recompile (content-hash based), only a real content change does. Logged to memory (`hg-turbopack-misses-rapid-css-writes`).

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

### Fully built & working (committed, on `frontend-v2-housieghar` — this checkout; NOT what's currently live, see cutover section)
- Public site: lobby (banner, game cards, skeleton loading), game room, live board (SSE draws, auto-marked tickets in left column, reveal-tease, win overlay), winners, how-to-play.
- Player auth: `/login` gate, `hg_player_token` cookie, `playerStore`, TopNav chip, `PlayerSync` for cross-device rehydration.
- Staff: role-door login flow (commits `23085ff`–`659b0f6`) + unified role-driven `/staff` dashboard.
- Backend: migrations 001–018 committed; SSE `no-cache, no-transform` fix committed and working.
- Prize settlement (full stack): win → Owed `Prize_Settlements` row (in the claim txn) → Financial Officer settles via the Finance Hub **Prize Payouts** panel (`PrizePayoutsSection`) → agent wallet credited. Backend + tests + frontend UI all committed.
- WhatsApp payout rails (2026-07-03): winner "Collect" card on the live board, bookie "Claim on WhatsApp" card in the wallet, FO WhatsApp chip in Prize Payouts, `prize_owed` socket event. See **Prize Settlement Flow**.

### Known issues / TODOs
- **The `master` cutover (top of Current State) supersedes the production-launch items below for the live site** — the DNS/rate-limiter/Sentry items still apply to `frontend-v2-housieghar` if it's ever redeployed, but they no longer describe what's serving `housieghar.in` today.
- **Migrations 001–019 are committed** (018 = `Prize_Settlements`, 019 = drop `Audit_Log.user_id` FK for staff deletion) — for local dev run `cd HG/backend && npm run migrate`.
- **Settlement UI — built (2026-07-02).** The Finance Hub **Prize Payouts** panel (`PrizePayoutsSection` in `components/staff/FinanceSections.tsx`, FO-only) lists Owed/Paid settlements with a two-click Settle → `POST /api/settlements/:id/settle` that credits the selling agent's wallet; a sidebar badge shows the owed count. The agent-facing wallet also shows the `Prize` credit once settled (`Wallet_Ledger`). Commits `ee1c46f` (amount coercion) + `43f6def` (UI). New CSS: `.hg-seg*`, `.hg-settle*`, `.hg-side-badge`, `.hg-payouts-*`.
- **Settlement smoke-tested end-to-end (2026-07-02).** Full local flow verified via API + browser: player lock → bookie confirm (wallet −₹60) → live game → Early Five split ₹50/₹50 across co-winning tickets + Top Line ₹100 → Owed rows with `player_id` stamped → CFO settle (+₹100, `Wallet_Ledger` `Prize` credit, `settled_by` stamped) → second settle 409 `already_paid` → pending-count badge decremented.
- **`housie_name` pre-fill — done.** The game-room name input pre-fills from `playerStore.player.username` (a username always satisfies the no-spaces / ≤18-char rule — `full_name` would not).
- **`dev-bypass` endpoint — working, not a bug.** Frontend (`BookingModal`) and backend route both use `POST /api/bookings/:booking_id/dev-bypass`; `app.ts` mounts it correctly and the `NODE_ENV === 'production'` guard returns 404 in production. The old `dev-bypass-confirm` name in earlier docs was incorrect and has been corrected here and in `manual.md`.
- **Sentry — fully wired, DSN-gated (2026-07-02).** Backend: `@sentry/node` guarded init at the top of `server.ts`. Frontend: `@sentry/nextjs` via `src/instrumentation.ts` (server, `onRequestError`) + `src/instrumentation-client.ts` (browser, `onRouterTransitionStart`). All no-ops until `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` are set. (Applies to `frontend-v2-housieghar` only — unknown whether `master`'s deployment has Sentry wired.)
- **npm audit — 0 vulnerabilities in both packages (2026-07-02, `frontend-v2-housieghar`).** Backend/frontend `ws` chain fixed via `npm audit fix`; the `postcss` copy nested in Next lifted via `"overrides": { "postcss": "^8.5.10" }` in `HG/frontend/package.json` (don't remove the override until Next ships postcss ≥8.5.10 itself). `.github/dependabot.yml` keeps weekly watch on both packages + Actions.
- **Temp passwords are enforced on `frontend-v2-housieghar`** — see Authentication & RBAC. Not known whether `master` has an equivalent gate (likely not, per the "regressed" note in the master-integration section).
- OTP step intentionally skipped (password-only staff login remains, on `frontend-v2-housieghar`).
- **Two GitHub repos / two branches** — see the dedicated section above; always confirm both Source repo AND branch before debugging any deploy (memory `hg-two-github-repos`).
- **Auth rate limiters are still commented out in `frontend-v2-housieghar`'s `app.ts`** (the user's own edit — don't silently revert). Moot for the live site until/unless this branch is redeployed, but re-enable before it ever serves real users again.
- **`ci.yml`'s deploy jobs are broken by design-drift** — they curl `RAILWAY_*_DEPLOY_HOOK` secrets for a Railway feature that doesn't exist. Delete the two curl jobs when convenient. CI only triggers on `main`/`staging` pushes — neither `frontend-v2-housieghar` nor `master` get CI runs.

---

## Resuming Work

**Start the local environment** (this checkout, `frontend-v2-housieghar` — for local dev only, not what's live):
```bash
brew services start postgresql@14 && brew services start redis
cd HG/backend && npm run migrate && npm run seed && npm run dev   # :4000
cd HG/frontend && npm run dev                                      # :3000
```

**Run migrate first** — migrations through 018 (`Prize_Settlements`) must be applied before the settlement engine works. Run `cd HG/backend && npm run migrate` (idempotent). If you're using the dev `seed`, note it now also runs `seed_platform_config.sql` (adds `seed:prod`'s default `Platform_Config` rows, `ON CONFLICT DO NOTHING`) — needed for the Announcement editor's `PUT /api/config` to succeed on a fresh DB.

**What was last worked on (2026-07-15/16): production cutover to `master`**
See **Current State → ⚠️ Production cutover** for full detail. `housieghar.in` now serves the `master` branch from a brand-new Railway backend (`alluring-adventure` project, service `housie-ghar-master`) with its own fresh Postgres/Redis; the old `frontend-v2-housieghar` backend (`exciting-rebirth` project) was stopped (deployment removed, GitHub branch disconnected) but its database was left running/untouched. This checkout's local files were not modified — the local branch, working tree, and dirty files (`manual.md`, `HG/nixpacks.toml`) are exactly as they were on 2026-07-13.

**Most logical next step:** this is now an infra/product decision point, not a coding task:
1. **Fix `api.housieghar.in` DNS** — it still points at the stopped old backend. Either repoint it at the new Railway service or leave it retired if nothing depends on it.
2. **Decide the long-term codebase direction.** `master` is live but architecturally simpler than `frontend-v2-housieghar` (no settlement engine, no test suite, weaker auth). Does the user want to keep iterating on `master` going forward, port `frontend-v2-housieghar`'s backend features onto `master` (mirroring the reverse port done 2026-07-14), or eventually cut back to `frontend-v2-housieghar`? Nothing in this session answered that — ask before assuming either direction.
3. **Verify the Finance Hub "Withdrawal Queue" numbers** on the new live site aren't fabricated demo data before anyone relies on them.
4. Routine cleanup whenever convenient: old `exciting-rebirth` Postgres/Redis (running, unused), `manual.md`'s stale launch guide (documents the now-superseded path), untracked `HG/nixpacks.toml`, the `ci.yml` deploy-hook jobs.

If instead picking up **local feature work on `frontend-v2-housieghar`** (independent of the live-site question above):

Before the cutover (2026-07-14 evening): staff-account cleanup + player profile polish
Five commits landed, all pushed to `origin/frontend-v2-housieghar` (currently at `a9921ef`): removed leftover "Powered by MOD" branding (`8273e11`); ported player self-service profile/stats pages with real data (`14e1795`); tightened profile-page padding (`c229c93`); fixed the lobby so only Live/Paused games ever appear above "Upcoming Games" (`afefa6b`); and simplified the staff Add-Staff form, added staff self-service email editing, and added bottom spacing to the lobby games list (`a9921ef`). See **Current State → Latest session** for full detail.

Before that (2026-07-10 → 07-13): original production launch — manual.md steps 4–8 on Railway/Hostinger/Vercel, now superseded by the `master` cutover (see **Current State → Production launch history**). The Railway Root-Directory/Node-detection gotchas documented there still apply to any future Railway service in this repo.

Before that (2026-07-08/09): neon radiant layer + compact banner + candy daylight in `globals.css` — since committed (no longer uncommitted work).

Before that (2026-07-07): `do.md` triage — Smart Game Presets + Announcement strip, committed in `6e51aa8` (see Current State).

Before that (2026-07-03): WhatsApp payout rails + desktop login fix
Product decision: prize money is never paid "via the website" — it flows person-to-person on WhatsApp like every other rupee in the system, and the app only records it. Built on top of the existing settlement engine (see **Prize Settlement Flow** for the full design):
1. **Winner → Bookie:** "You won" card on the live board (`.hg-wins*`) with per-win "Collect" wa.me links to the selling bookie — server-truth via new `GET /api/players/me/wins` for logged-in players, `bookingStore` fallback for anonymous; overlay gets a "that's your ticket" line.
2. **Bookie → CFO:** "Prize money owed to you" card in the bookie wallet (`.hg-owed*`) with an itemized "Claim ₹total on WhatsApp" button — new `GET /api/settlements/mine`; live-refreshed by the new `prize_owed` socket event (engine publishes per recorded settlement after the claim txn commits).
3. **CFO:** Prize Payouts rows get a WhatsApp chip (`agent_wa_link`); Settle stays as the recording step (like top-up approval). CFO/Superadmin contact lookup extracted to shared `services/financeContact.ts` (recharge + claim use the same person).
4. Pure `payoutMessages.ts` builders + tests; test suite 44 → **52** (harness gained `createStaff`/`createPlayer` fixtures). Verified in headless Chromium: bookie card (₹3,000 claim), player card (6 wins, Collect links), FO chips.
Same day, earlier: staff/player login pages were stuck in the 452px phone column on desktop — the `:has(.hg-staff-login)` exclusion in the ≥900px de-phone block was removed and `.hg-staff-login` pinned to `100dvh` (a `min-height:100%` child can't resolve against a `height:auto` parent).

Before that (2026-07-02, second batch): launch-prep sweep
Everything automatable from `launch.md`/`manual.md` was built and verified, leaving only account/dashboard work for a human:
1. **Auth hardening** — login backdoor removed (malformed hash + `ChangeMe123!` no longer authenticates); `POST /api/auth/change-password`; per-request DB check of `status` + `temp_password_required` in `authenticateToken` (suspension + temp-password now bite immediately); admin password reset via `PATCH /api/users/:id` re-flags temp. New env-free `modules/auth/auth.service.ts` + 6 integration tests (suite now 44).
2. **Forced first-login password change (frontend)** — `ChangePasswordCard` rendered by `StaffShell` when `/api/auth/me` carries `temp_password_required`; covers all staff login paths.
3. **`seed:prod`** — production bootstrap (roles + `Platform_Config` + Superadmin from env, idempotent, refuses dev defaults in production).
4. **Dependencies** — `npm audit` → 0 vulnerabilities both packages; Dependabot config added; `forceConsistentCasingInFileNames` added to frontend tsconfig.
5. **Frontend Sentry** — `@sentry/nextjs` wired wizard-free via `src/instrumentation.ts` + `src/instrumentation-client.ts`, DSN-gated.
6. **Gates + smoke test** — migrate idempotency, backend build + 44/44 tests, frontend lint + tsc + production build, and the full settlement E2E.

Before that (same day): Finance Hub **Prize Payouts UI** (`43f6def` + `ee1c46f`) — the FO-facing Owed/Paid ledger with two-click Settle; sidebar owed-count badge; `DECIMAL` amount coerced to number in the controller.

Before that (2026-06-30): the prize-settlement **engine** (backend only) — committed across `0513e0f`→`9968f03`. Winning a prize records an Owed `Prize_Settlements` row in the same transaction that claims the prize; a Financial Officer settles it via `/api/settlements`, crediting the selling agent's wallet. Co-winners split exactly (no lost paisa). Win detection extracted to a pure, unit-tested module; first real backend test suite (`node:test`, gated DB integration harness). See **Prize Settlement Flow**, **Game Engine**, **Backend Testing**.
