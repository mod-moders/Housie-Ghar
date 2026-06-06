# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Housie Ghar** — a full-stack web app that digitizes the Indian game of Housie (Tambola/Bingo). The actual project lives in `HG/`. The repo root (`/Users/monk/1`) only contains `HG/`, plus some planning docs (`PDR.md`, `reaSon.md`).

## Commands

All commands are run from within `HG/` unless otherwise noted.

### Infrastructure (Docker)
```bash
# Start PostgreSQL and Redis only (for local dev)
docker compose up postgres redis -d

# Full stack via Docker
docker compose up -d
```

### Backend (`HG/backend/`)
```bash
npm run dev        # Start dev server with nodemon + ts-node (port 4000)
npm run build      # Compile TypeScript to dist/
npm run start      # Run compiled dist/server.js
npm run migrate    # Run all SQL migrations in order
npm run seed       # Seed roles, superadmin, and a sample game
```

### Frontend (`HG/frontend/`)
```bash
npm run dev        # Start Next.js dev server (port 3000)
npm run build      # Production build
npm run lint       # ESLint
```

### JWT Key Generation (RS256)
The backend requires RSA key pairs in `.env`. Generate with:
```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```
Paste the keys as single-line escaped strings (`\n`) in `HG/.env`.

## Architecture

### Directory Layout
```
HG/
  backend/src/
    app.ts              # Express app setup (CORS, middleware, routes)
    server.ts           # HTTP + Socket.io boot, Redis + cron init
    config/
      env.ts            # Reads and validates all env vars (throws on missing)
      constants.ts      # Game timings, rate limits, prize patterns, etc.
    db/
      index.ts          # pg Pool singleton
      redis.ts          # Two Redis clients: publisher + subscriber
      migrate.ts        # Runs migrations/001_*.sql ... 010_*.sql in order
      seed.ts           # Seeds roles, superadmin, sample game
      generateGameTickets.ts  # Bulk ticket generation at game creation
    middleware/
      auth.ts           # JWT RS256 cookie auth + RBAC middleware
    modules/            # Feature modules (auth, games, bookings, tickets)
    services/
      gameEngine.ts     # In-memory game loop + win detection
      scheduler.service.ts  # Expiry sweeper cron (every 30s)
      audit.service.ts  # Writes to Audit_Log table
    utils/
      sseManager.ts     # SSE connection registry and broadcaster
      ticketGenerator.ts  # Cryptographically fair Tambola ticket grid generation
  frontend/src/
    app/                # Next.js App Router pages
  shared/types/         # Shared TypeScript interfaces (game, ticket, booking, user, events)
  migrations/           # Numbered SQL files (001–010)
  seeds/                # SQL seed files
  nginx/nginx.conf      # Reverse proxy config
  docker-compose.yml
  .env.example
```

### Real-Time Architecture

Two parallel channels relay game events to clients:

1. **SSE** (`sseManager.ts`) — players receive draw/winner/status events via one-way HTTP streams at `/api/games/:id/stream`.
2. **Socket.io** — operators and agents use WebSocket rooms (`game-{id}`, `agent-{id}`) for two-way control (pause, resume, speed change) and booking notifications.

These two channels are driven by a single **Redis Pub/Sub** channel (`game_events`). The game engine publishes to Redis; the subscriber (initialized in `server.ts`) fans out to SSE + Socket.io. This decouples the game loop from transport.

### Game Engine (`gameEngine.ts`)

- Active games are held in an in-memory `Map<string, ActiveGame>`. State is lost on process restart unless the game log in PostgreSQL is restored.
- Draw sequence is generated once at game start via Fisher-Yates + `crypto.randomInt` (CSPRNG). It is persisted to `Game_Logs` immediately.
- The conductor loop uses `setTimeout` (not `setInterval`) to allow variable speed. After a winner tick, a fixed 4-second pause is inserted before the next draw.
- Win detection is O(tickets × unclaimed_prizes) per tick; all checks run in memory.

### Database Schema (Key Tables)
- `Scheduled_Games` — game metadata and status (`Scheduled` → `Live` → `Paused` → `Completed`)
- `Tickets` — 3×9 grid per ticket, status lifecycle (`Available` → `Locked` → `Sold`)
- `Bookings` — a lock record tying a player's housie name to ticket IDs; expires after 10 minutes
- `Prize_Pool` — prize patterns per game; `claimed` flag toggled by game engine
- `Game_Logs` — draw sequence audit trail and resume state
- `Wallet_Ledger` — agent credit/debit ledger
- `Audit_Log` — staff action log written by `audit.service.ts`

### Authentication & RBAC

JWT RS256 tokens stored as HttpOnly cookie (`hg_auth_token`). The middleware chain in `auth.ts` provides:
- `authenticateToken` — verifies the cookie JWT, attaches `req.user`
- `requireRole(roles[])` — guards routes to specific roles

Role hierarchy (role_id): `Superadmin(1)` → `Admin(2)` → `Operator(3)` → `Agent(4)`. Players are anonymous — no auth.

### Shared Types

`HG/shared/types/` is imported by the backend via the `@shared/*` path alias (configured in `backend/tsconfig.json`). The frontend does not yet consume these types directly. When adding new shared contracts, add them here.

### Important Next.js Note

The frontend uses **Next.js 16** (with React 19), which differs significantly from earlier versions. Before editing frontend routing or data-fetching patterns, check `node_modules/next/dist/docs/` for current API behavior — do not rely on training-data conventions for Next.js App Router.
