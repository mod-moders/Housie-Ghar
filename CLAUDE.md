# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Housie Ghar** — a full-stack web app that digitizes the Indian game of Housie (Tambola/Bingo). The actual project lives in `HG/`. The repo root (`/Users/monk/1`) also contains `housieGhar/` — the static React-via-Babel **design prototype** (mock data) that the current frontend was ported from; keep it as a visual reference only, never import from it. Current git branch: `frontend-v2-housieghar`. Backend runs on port 4000, frontend on port 3000.

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
    app.ts              # Express 5 app (CORS, routes, error middleware)
    server.ts           # HTTP + Socket.io boot, Redis + cron init
    config/             # env.ts (validated env), constants.ts (timings, limits, prize patterns)
    db/
      index.ts          # pg Pool singleton
      redis.ts          # Two Redis clients: publisher + subscriber
      migrate.ts        # Auto-discovers migrations/*.sql via readdirSync().sort(); _migrations table
      seed.ts           # HARDCODED seed list: roles → superadmin → sample_game → sample_staff
      generateGameTickets.ts
    middleware/auth.ts  # JWT RS256 cookie auth; requireRole([roleNames]); requireFinancialOfficer
    modules/            # auth, games, bookings, tickets, users, wallet, audit, config, stats
    services/
      gameEngine.ts     # In-memory game loop + win detection
      bookingRouter.ts  # Liquidity-aware booking routing
      scheduler.service.ts  # Expiry sweeper cron (every 30s)
      audit.service.ts
    utils/
      sseManager.ts     # SSE registry; stream endpoint is /api/games/:id/live-stream
      ticketGenerator.ts
      trust.ts          # deriveTrust(soldCount): >=50 veteran, >=10 trusted, else new
  frontend/src/
    proxy.ts            # Next 16 proxy (replaces middleware.ts) — guards /staff/:path*
    app/
      layout.tsx        # next/font/google: Space Grotesk, DM Sans, JetBrains Mono; body.hg-root
      globals.css       # Entire hg-* design system (~750 lines plain CSS under Tailwind v4 import)
      page.tsx          # Public lobby (featured game + game cards, 15s poll)
      game/[game_id]/page.tsx        # Game room: number grid, ticket previews, name entry, lock
      game/[game_id]/live/page.tsx   # Live board: SSE draws, reveal-tease, prizes, 1-90 board
      winners/page.tsx               # Hall of fame (real Prize_Pool winners)
      how-to-play/page.tsx
      staff/login/page.tsx           # Password-only staff login (no OTP)
      staff/page.tsx                 # Unified role-driven dashboard shell
    components/
      Icon.tsx          # ~36-path inline SVG icon set (NO icon library installed)
      ui.tsx            # Logo, Button, Badge, ProgressBar, CountdownPills, TrustBadges, KpiCard, …
      HousieTicket.tsx  # 3×9 grid renderer + gridToMatrix()
      TopNav.tsx / PublicShell.tsx / BookingModal.tsx
      staff/            # AdminSections, FinanceSections, OperatorSections, BookieSections
    lib/
      api.ts            # apiFetch (credentials: include, JSON)
      money.ts          # money(n) → "₹1,234" (en-IN)
      types.ts          # All API payload types
      hooks/            # useSSE(gameId, onEvent?), useSocket, useCountdown
      stores/           # zustand: authStore, gameStore, bookingStore (persisted "hg-booking")
  shared/types/         # Shared TS interfaces (backend imports via @shared/*)
  backend/migrations/   # 001–014 (013 adds Users.town, 014 drops Themes)
  backend/seeds/
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
- **Known gap:** there is no boot-time auto-resume. If the process restarts while a game is `Live`, the game is stranded (resume/pause return "Game state not loaded"). Recovery: `UPDATE Scheduled_Games SET game_status='Paused' WHERE game_id=…` then POST `/api/games/:id/start`.
- Conductor uses `setTimeout` for variable speed (5–12s via `POST /api/games/:id/speed {interval_ms}`); 4s pause after a winner tick.

### Booking Flow

1. Anonymous player POSTs `/api/bookings/lock` {game_id, ticket_ids, housie_name} → router picks the highest-balance agent with balance ≥ amount; response includes `agent_name`, `agent_phone`, `agent_town`, `whatsapp_link`, `is_overflow`.
2. No qualifying agent → operator overflow queue (`GET /api/bookings/operator/overflow-queue`, `POST …/:id/force-confirm`); bypassed agents get `skip_alerts` rows + `booking_skipped` socket event.
3. Agent confirms/rejects via `POST /api/bookings/agent/:id/{confirm|reject}`; player polls `GET /api/bookings/status/:id` every 3s. Locks expire after 10 min (sweeper cron).
4. Frontend persists the in-flight lock in `bookingStore` (localStorage `hg-booking`) — the game room restores it on reload, and the live board uses its ticketIds for "Your tickets · auto-marked".

### Database Schema (Key Tables)
- `Scheduled_Games` (`Scheduled` → `Live` → `Paused` → `Completed`), `Tickets` (`Available` → `Locked` → `Sold`), `Bookings`, `Prize_Pool`, `Game_Logs`, `Wallet_Ledger`, `TopUp_Requests`, `Audit_Log`, `skip_alerts`
- `Users.is_cfo` — flags one Admin as Financial Officer; `Users.town` (migration 013) — staff/agent locality shown across the UI
- **`Themes` is dropped** (migration 014) — theming feature removed entirely; do not reintroduce
- Trust is **derived, not stored**: count of `Sold` bookings per agent → `utils/trust.ts` tiers

### Authentication & RBAC

JWT RS256 in HttpOnly cookie `hg_auth_token`. `requireRole([...])` takes role **name strings** (e.g. `['Superadmin','Admin']`), not IDs. `requireFinancialOfficer` = Superadmin OR (Admin AND is_cfo) — guards `/api/wallet/{hud,master-ledger,topup/pending,topup/:id/*,agents/:id/adjust}`. Audit log is `['Superadmin','Admin']`. `/api/stats/overview` is Superadmin/Admin; `/api/stats/hall-of-fame` is public. Players are anonymous. Login and `/api/auth/me` both return `is_cfo` and `town`.

Role hierarchy (role_id): `Superadmin(1)` → `Admin(2)` → `Operator(3)` → `Agent(4)`. The UI labels Agents as **"Bookie"**.

### Express 5 note

`req.body` is `undefined` when no JSON Content-Type is sent — optional-body handlers must destructure `req.body ?? {}` (already done in wallet approve/reject/adjust). `apiFetch` always sends the JSON header, so browser calls are safe.

### Important Next.js Note

The frontend uses **Next.js 16** (React 19). Conventions differ from training data — check `node_modules/next/dist/docs/` before changing routing/data-fetching. Notably: route params are a Promise (`use(params)`), and the request interceptor is **`src/proxy.ts` exporting `proxy()`** (the `middleware.ts` convention is deprecated).

---

## Design System (frontend-v2, ported from `housieGhar/housieghar/`)

- **Plain CSS** component classes prefixed `hg-*`, all in `globals.css` under Tailwind v4's `@import "tailwindcss"`. No motion library, no icon library — animations are CSS, icons come from `components/Icon.tsx`.
- **Light theme default** (`<body className="hg-root" data-theme="light">`); a dark palette block exists in CSS but there is no toggle.
- Accent pink `oklch(0.67 0.25 354)`, radius 18px, "sticker" aesthetic: hard offset shadows (`0 5px 0 -1px var(--ink)`), pill buttons, chunky borders.
- Fonts via `next/font/google` variables: `--font-head` Space Grotesk (headings), `--font-body` DM Sans, `--font-mono` JetBrains Mono (amounts, IDs, timers).
- Money is always formatted with `lib/money.ts`. Status pills: `hg-pill-{live,scheduled,paused,completed,suspended}`; trust pills: `hg-pill-{veteran,trusted,new}`.
- Canonical prize names (backend + UI): `Early Five`, `Top Line`, `Middle Line`, `Bottom Line`, `Four Corners`, `Full House`.

## Staff Dashboard (`/staff`)

Single shell (`app/staff/page.tsx`); sections render from `components/staff/*` based on the authenticated role:
- **Superadmin/Admin:** overview (stats KPIs), games (table + create + start/pause/resume/speed), filling status, workforce (create/edit staff incl. town, suspend/reactivate, Superadmin can toggle CFO via `PATCH /api/users/:id/cfo`), audit log
- **Financial Officer extra:** Finance Hub (pending top-ups from master-ledger, approve/reject), Bookie Ledger, finance status-bar HUD (`GET /api/wallet/hud`)
- **Operator:** Live HUD (SSE big number, start/pause/resume, speed slider), overflow queue, filling
- **Bookie (Agent):** booking queue (socket-driven, WhatsApp reply copy, confirm/reject), wallet (balance, ledger, skip-alert FOMO card, request funds → opens `recharge_wa_link` to the CFO), filling

---

## Current State (as of frontend-v2 port)

**Done and verified end-to-end** (lint + builds pass; API smoke tested against seeded DB):
- Full prototype port: lobby, game room, booking modal (lock → WhatsApp → 3s poll → success), live board (SSE draws, reveal-tease, win overlay), winners, how-to-play, staff login, unified staff dashboard
- Old `src/app/admin/**` tree deleted; `motion` + `@phosphor-icons/react` uninstalled; `middleware.ts` → `proxy.ts`
- Backend: stats module, trust/town in payloads, FO gating, seeds (sample staff), migrations 011–014 applied
- Smoke-verified flows: anonymous lock → bookie confirm → wallet debit; operator start/pause/resume/speed + SSE; CFO topup approve → `wallet_credited`; superadmin overview/workforce/audit; hall-of-fame from a real claimed prize; `/staff` redirect when logged out; `/admin/*` 404s

**Known issues / TODOs:**
- No boot-time resume for `Live` games after process restart (see Game Engine note)
- The prototype's OTP step was intentionally skipped (password-only staff login)
- `housieGhar/` prototype folder can be deleted once the port is considered final
