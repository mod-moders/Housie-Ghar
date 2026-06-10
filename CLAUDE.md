# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Housie Ghar** — a full-stack web app that digitizes the Indian game of Housie (Tambola/Bingo). The actual project lives in `HG/`. The repo root (`/Users/monk/1`) only contains `HG/`, plus some planning docs (`PDR.md`, `reaSon.md`). The current git branch is `slice-2-cfo-financial-hub`. Main backend runs on port 4000, frontend on port 3000.

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
      migrate.ts        # Runs migrations/001_*.sql ... in order
      seed.ts           # Seeds roles, superadmin, sample game
      generateGameTickets.ts  # Bulk ticket generation at game creation
    middleware/
      auth.ts           # JWT RS256 cookie auth + RBAC middleware
    modules/            # Feature modules (auth, games, bookings, tickets)
    services/
      gameEngine.ts     # In-memory game loop + win detection
      bookingRouter.ts  # Liquidity-aware booking routing (NEW — untracked)
      scheduler.service.ts  # Expiry sweeper cron (every 30s)
      audit.service.ts  # Writes to Audit_Log table
    utils/
      sseManager.ts     # SSE connection registry and broadcaster
      ticketGenerator.ts  # Cryptographically fair Tambola ticket grid generation
  frontend/src/
    app/
      page.tsx          # Public landing page (redesigned with motion/react)
      layout.tsx        # Root layout — next/font/google fonts wired here
      globals.css       # Tailwind v4 @theme block — all design tokens
      admin/
        layout.tsx      # Admin shell: sidebar nav, topbar, role-gated
        login/          # Login page
        superadmin/     # Superadmin dashboard (tabs: overview/users/audit/themes)
          audit/        # Dedicated audit log page
          theming/      # Dedicated theming page
          users/        # Users management (may overlap with superadmin tabs)
        admin/          # Admin role pages
          game-builder/ # Create/edit games
          agents/       # Agent management (new — untracked)
        operator/       # Operator pages
          page.tsx      # Assigned games + overflow queue
          console/[game_id]/  # Live game control console
        agent/          # Agent pages
          page.tsx      # Live booking queue
          wallet/       # Wallet balance + recharge request
          sales/        # Sales history
  shared/types/         # Shared TypeScript interfaces (game, ticket, booking, user, events)
  migrations/           # SQL files: 001–010 (committed) + 011–012 (untracked)
  seeds/                # SQL seed files
  nginx/nginx.conf      # Reverse proxy config
  docker-compose.yml
  .env.example
```

### Real-Time Architecture

Two parallel channels relay game events to clients:

1. **SSE** (`sseManager.ts`) — players receive draw/winner/status events via one-way HTTP streams at `/api/games/:id/stream`.
2. **Socket.io** — operators and agents use WebSocket rooms (`game-{id}`, `agent-{id}`) for two-way control (pause, resume, speed change) and booking notifications.

Both channels are driven by a single **Redis Pub/Sub** channel (`game_events`). The game engine publishes to Redis; the subscriber (initialized in `server.ts`) fans out to SSE + Socket.io. This decouples the game loop from transport.

### Game Engine (`gameEngine.ts`)

- Active games are held in an in-memory `Map<string, ActiveGame>`. State is lost on process restart unless the game log in PostgreSQL is restored.
- Draw sequence is generated once at game start via Fisher-Yates + `crypto.randomInt` (CSPRNG). It is persisted to `Game_Logs` immediately.
- The conductor loop uses `setTimeout` (not `setInterval`) to allow variable speed. After a winner tick, a fixed 4-second pause is inserted before the next draw.
- Win detection is O(tickets × unclaimed_prizes) per tick; all checks run in memory.

### Booking Router (`bookingRouter.ts`) — NEW

Liquidity-aware routing layer introduced in `f006a48`. When a player books:
1. Router finds agents for that game sorted by descending balance.
2. First agent with balance ≥ booking amount gets the booking request.
3. If no agent qualifies, booking escalates to the **operator overflow queue**.
4. If an agent's balance falls mid-session, a `skip_alert` record is created and pushed via Socket.io to the agent's room (`booking_skipped` event).

### Database Schema (Key Tables)
- `Scheduled_Games` — game metadata and status (`Scheduled` → `Live` → `Paused` → `Completed`)
- `Tickets` — 3×9 grid per ticket, status lifecycle (`Available` → `Locked` → `Sold`)
- `Bookings` — a lock record tying a player's housie name to ticket IDs; expires after 10 minutes
- `Prize_Pool` — prize patterns per game; `claimed` flag toggled by game engine
- `Game_Logs` — draw sequence audit trail and resume state
- `Wallet_Ledger` — agent credit/debit ledger
- `Audit_Log` — staff action log written by `audit.service.ts`
- `Themes` — theming records; one row has `is_active = true` at a time
- **`skip_alerts`** — records when a booking was routed past an agent due to low balance (migration 011)
- **`is_cfo` column on Users** — flags one Admin-level user as the Chief Financial Officer (migration 012)

### Authentication & RBAC

JWT RS256 tokens stored as HttpOnly cookie (`hg_auth_token`). The middleware chain in `auth.ts` provides:
- `authenticateToken` — verifies the cookie JWT, attaches `req.user`
- `requireRole(roles[])` — guards routes to specific roles

Role hierarchy (role_id): `Superadmin(1)` → `Admin(2)` → `Operator(3)` → `Agent(4)`. Players are anonymous — no auth.

**CFO flag** (`is_cfo`): a boolean on the `Users` table for an Admin-level user designated as Chief Financial Officer. The CFO sees a Financial Hub component in the admin panel and receives WhatsApp recharge requests from agents. Carried on the auth store as `user.is_cfo`.

### Shared Types

`HG/shared/types/` is imported by the backend via the `@shared/*` path alias (configured in `backend/tsconfig.json`). The frontend does not yet consume these types directly. When adding new shared contracts, add them here.

### Important Next.js Note

The frontend uses **Next.js 16** (with React 19), which differs significantly from earlier versions. Before editing frontend routing or data-fetching patterns, check `node_modules/next/dist/docs/` for current API behavior — do not rely on training-data conventions for Next.js App Router.

---

## Current State

### What is fully built and working

**Backend (all committed):**
- Full game engine — draw loop, win detection, Redis pub/sub fan-out, SSE + Socket.io delivery
- Booking lifecycle — lock → confirm/reject → expiry sweeper (30s cron)
- Liquidity-aware booking router (`bookingRouter.ts`) — routes to highest-balance agent, escalates to operator overflow if none qualify
- Agent skip alerts — `booking_skipped` Socket.io event + `skip_alerts` DB records when an agent is bypassed
- Wallet ledger — agent balance, credit/debit, `GET /api/users/:id/wallet` history
- CFO wiring — `is_cfo` DB column, `GET /api/users/me` exposes it, FO-guarded financial HUD endpoints, master ledger endpoint
- WhatsApp recharge routing — agent recharge request POSTs to backend which constructs a WhatsApp deep-link to the CFO's number
- Audit log — all staff actions persisted to `Audit_Log` via `audit.service.ts`
- Theming — `Themes` table, `PUT /api/themes/active`, Superadmin can switch
- RBAC middleware — role-gated routes, JWT RS256 HttpOnly cookies
- All TypeScript errors resolved; `npm run build` passes cleanly

**Frontend (mostly committed, UI redesign uncommitted):**
- Admin layout with sidebar nav, topbar, role-based nav items, logout
- All role pages: Superadmin, Admin (game-builder, agents), Operator (games + overflow), Agent (queue, wallet, sales)
- Operator live game console (`/admin/operator/console/[game_id]`)
- CFO Financial Hub component renders for users where `is_cfo === true`
- Public landing page at `/` (full game info, how-to-play, live numbers display)

### Most recently worked on (this session — not yet committed)

**UI redesign pass across all three admin role pages:**

1. **`HG/frontend/src/app/admin/agent/page.tsx`** — redesigned:
   - Wallet card with gold ambient glow, tabular-nums balance, icon label
   - FOMO alert uses `AnimatePresence` slide-in/out, X dismiss, inline recharge CTA
   - Queue cards stagger in with `motion.div` (0.05s delay per index), `whileTap scale(0.97)` on buttons
   - Inline error state replaces `alert()` for confirm/reject failures
   - Empty state with duotone Tray icon
   - Queue count badge spring-animates in/out

2. **`HG/frontend/src/app/admin/superadmin/page.tsx`** — redesigned:
   - Stats cards have per-role gradient overlays (gold/violet/sky/emerald) and role pill badges
   - Tabs use `layoutId="tab-active"` spring-sliding indicator, icon per tab, fill/regular weight on active
   - Tab content transitions with `AnimatePresence mode="wait"` (18ms y-shift crossfade)
   - Users list has role-colored avatar squares, `whileTap` on toggle buttons
   - Audit table has action color-coding (red/green/gold/sky) and smart time formatting
   - Themes tab has `CheckCircle` icon on active, `whileTap` on select

3. **`HG/frontend/src/app/admin/operator/page.tsx`** — redesigned:
   - Same layoutId tab system, overflow badge spring-animates
   - Game cards have fill percentage progress bar (animated width on mount)
   - Status badges with colored pulsing dots (Live blinks with `animate-pulse`)
   - Open link with hover arrow translation
   - OverflowCard: staggered entry, Phosphor icons, inline error, `whileTap`

**Earlier this session (also uncommitted):**

4. **`HG/frontend/src/app/page.tsx`** — full public landing page redesign:
   - Motion spring animations throughout: hero stagger, GameCard `whileInView`, prize `AnimatePresence`
   - Emil Kowalski easing: `cubic-bezier(0.23, 1, 0.32, 1)` strong ease-out for all UI
   - Spring config `{ type: "spring", duration: 0.25, bounce: 0 }` for interactive elements
   - `useReducedMotion()` gates all animations for accessibility

5. **`HG/frontend/src/app/layout.tsx`** — switched from Google Fonts `<link>` to `next/font/google`:
   - Baloo 2 → `--font-display`, Outfit → `--font-body`, Geist → `--font-admin`, JetBrains Mono → `--font-mono`
   - All are variable fonts (no `weight` array needed)

6. **`HG/frontend/src/app/globals.css`** — updated:
   - Font fallbacks updated (Sora→Outfit, DM Sans→Geist)
   - Film grain overlay added: `body::before` with SVG `feTurbulence`, `opacity: 0.038`, `pointer-events: none`

7. **`HG/frontend/package.json`** — added `@phosphor-icons/react` dependency (used in all three admin pages)

### In-progress / partially done

- **All UI changes are uncommitted** on branch `slice-2-cfo-financial-hub`. Run `git add` + `git commit` before switching branches.
- **Migrations 011 and 012 are untracked** (`HG/backend/migrations/011_overflow_and_skip_alerts.sql`, `012_add_is_cfo.sql`). The migrate runner in `migrate.ts` currently only scans up to `010_*` — verify it uses a glob pattern that picks up new files, or update the runner.
- **`DESIGN.md` is deleted** (unstaged deletion). It was a design document at repo root. Either restore with `git checkout -- DESIGN.md` or commit the deletion.
- **`admin/admin/agents/` page** is untracked — an Admin-role agent management page exists but has never been committed.
- **`admin/superadmin/audit/` and `admin/superadmin/theming/`** are untracked dedicated sub-pages (the superadmin `page.tsx` has tabs for these inline; the standalone pages may be newer standalone versions).

### Known issues / TODOs

- 5 pre-existing ESLint warnings (`react-hooks/exhaustive-deps`) in `admin/layout.tsx`, `operator/console/[game_id]/page.tsx`, `game/[game_id]/page.tsx`, and `lib/hooks/useSSE.ts`. Not breaking — intentional mount-once effects.
- `alert()` still used in `superadmin/page.tsx` for `setTheme` / `toggleUser` errors (low-frequency admin operations — acceptable for now, but should eventually be replaced with toast or inline error).
- No mobile nav in admin layout — `aside` is `hidden md:flex`, no hamburger fallback.

---

## Design System

### Fonts (`HG/frontend/src/app/layout.tsx`)

All loaded via `next/font/google` as variable fonts — no external `<link>` tags.

| CSS Variable | Font | Usage |
|---|---|---|
| `--font-display` | Baloo 2 | Hero headings, game titles, large numbers |
| `--font-body` | Outfit | Public site body copy |
| `--font-admin` | Geist | All admin panel UI (`font-admin` class on body via layout) |
| `--font-mono` | JetBrains Mono | IDs, codes, amounts, timestamps |

### Color Palette (`HG/frontend/src/app/globals.css` — `@theme` block)

**Public site (warm forest/cream):**
```
--color-forest:       #1a3a2a   (nav bg, dark sections)
--color-forest-mid:   #24503a
--color-forest-light: #2d6b4a
--color-gold:         #f0a500   (primary accent, CTAs, balances)
--color-gold-light:   #ffc740
--color-amber:        #e07b00
--color-cream:        #fdf6e3   (page bg)
--color-cream-dark:   #f5e9c8
--color-rust:         #c94a1a
```

**Admin panel (dark):**
```
--color-bg1:          #0f1117   (page bg)
--color-bg2:          #161820   (card bg)
--color-bg3:          #1e2029   (hover bg, table row hover)
--color-bg4:          #252733
--color-border:       rgba(255,255,255,0.07)
--color-border-active:rgba(255,255,255,0.14)
--color-wa:           #25D366   (WhatsApp green)
```

**Semantic:**
```
--color-success: #22c55e
--color-danger:  #ef4444
--color-warning: #f59e0b
```

### Motion Library

`motion` v12 (`motion/react`) — import as `import { motion, AnimatePresence, useReducedMotion } from "motion/react"`.

**Canonical easing:**
```ts
const ease = [0.23, 1, 0.32, 1] as const;  // strong ease-out (Emil Kowalski)
const spring = { type: "spring" as const, duration: 0.25, bounce: 0 };
```

**Patterns in use:**
- **Staggered card entry**: `initial={{ opacity: 0, y: 14 }}`, `animate={{ opacity: 1, y: 0 }}`, `delay: index * 0.05`
- **Tab indicator**: `<motion.div layoutId="tab-active">` with `{ type: "spring", duration: 0.3, bounce: 0 }`
- **Tab content**: `AnimatePresence mode="wait"`, `initial y: 6`, `exit y: -4`, duration 0.18s
- **Badge pop**: `AnimatePresence` + `{ type: "spring", duration: 0.25, bounce: 0.15 }`
- **Button press**: `whileTap={{ scale: 0.97 }}`
- **FOMO/alert slide**: `initial y: -10`, exit duration 0.15s
- **Public hero**: staggered h1 (delay 0.06, duration 0.65), CTAs spring hover

### Icon Library

`@phosphor-icons/react` v2 — the only icon library installed. Use `weight="fill"` for active/selected states, `weight="duotone"` for decorative/context icons, `weight="regular"` for default.

**Convention in admin pages:**
- Confirm actions → `CheckCircle` (bold/fill)
- Reject/close → `XCircle`, `X`
- Warnings → `Warning`, `WarningCircle` (fill)
- Wallet → `Wallet`
- Navigation arrows → `ArrowRight` (with `group-hover:translate-x-0.5`)
- Empty states → `Tray`, `GameController` (duotone)
- Role icons: `Crown` (Superadmin), `ShieldCheck` (Admin), `Sliders` (Operator), `UserCircle` (Agent)

### Admin Role Color Map

| Role | Color | Bg | Border |
|---|---|---|---|
| Superadmin | `text-gold` | `bg-gold/10` | `border-gold/20` |
| Admin | `text-violet-400` | `bg-violet-500/10` | `border-violet-500/20` |
| Operator | `text-sky-400` | `bg-sky-500/10` | `border-sky-500/20` |
| Agent | `text-emerald-400` | `bg-emerald-500/10` | `border-emerald-500/20` |

---

## Resuming Work

### Start local dev

```bash
# 1. Start database + Redis (Docker)
cd /Users/monk/1/HG && docker compose up postgres redis -d

# 2. Backend
cd /Users/monk/1/HG/backend && npm run dev

# 3. Frontend (separate terminal)
cd /Users/monk/1/HG/frontend && npm run dev
```

Frontend: http://localhost:3000 — Backend API: http://localhost:4000

Admin login: http://localhost:3000/admin/login (default superadmin creds in `seeds/seed_superadmin.sql`)

### What was worked on last

The last session was a **UI redesign pass** on all three admin role pages (`agent/page.tsx`, `operator/page.tsx`, `superadmin/page.tsx`). Also redesigned the public landing page (`page.tsx`), updated fonts to `next/font/google`, added film grain to `globals.css`, and installed `@phosphor-icons/react`.

**None of this is committed.** The working tree has 7 modified files + package.json changes.

### Most logical next steps

1. **Commit the UI changes** — all the redesign work is uncommitted on `slice-2-cfo-financial-hub`. Stage and commit `globals.css`, `layout.tsx`, `page.tsx`, and the three admin pages.
2. **Commit the new migrations** — `011_overflow_and_skip_alerts.sql` and `012_add_is_cfo.sql` are untracked. Verify the migrate runner picks them up (check the glob in `migrate.ts`), then commit.
3. **Commit or clean up untracked admin pages** — `admin/admin/agents/`, `admin/superadmin/audit/`, `admin/superadmin/theming/` pages are untracked. Either commit them (they likely need the same Phosphor + motion redesign treatment) or clean up if redundant.
4. **Mobile nav** — the admin sidebar is hidden on mobile with no fallback. A hamburger or bottom tab bar would complete the mobile experience.
5. **Toast system** — `alert()` still used in `superadmin/page.tsx` for theme/user toggle errors. A lightweight toast (could use `sonner` or a simple custom component) would replace the last `alert()` calls.
