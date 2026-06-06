# 🎲 Housie Ghar — Technical Architecture & Directory Map (`reaSon.md`)

Welcome to the **Housie Ghar** project blueprint documentation. This file provides an exhaustive, directory-by-directory, and file-by-file breakdown of the repository. It details modules, environment configuration, database migrations, containerized components, and the core runtime architectures.

---

## 🏗️ System Architecture Overview

Housie Ghar is designed as a modular, decoupled full-stack local application deployed via **Docker Compose** for ease of execution on a local area network (LAN). Below is a high-level representation of the request and real-time routing flow:

```mermaid
graph TD
    Player[📱 Player Client / Next.js] <-->|HTTP / SSE| Nginx[reverse proxy: Nginx]
    Staff[💻 Staff Client / Next.js] <-->|HTTP / WebSockets| Nginx
    Nginx <-->|Port 3000| FrontendServer[Next.js App Server]
    Nginx <-->|Port 4000| BackendServer[Express.js API Server]
    BackendServer <-->|ACID Transactions / Port 5432| Postgres[(PostgreSQL 16)]
    BackendServer <-->|Pub-Sub & Cache / Port 6379| Redis[(Redis 7)]
    BackendServer -.->|Job Scheduling| Cron[node-cron Sweeper & Backups]
```

---

## 📁 Project Directory Map

```
housie-ghar/                            
├── .env                                # Local environment secrets (not in git)
├── .env.example                        # Safe-to-share environment configuration template
├── .gitignore                          # Excludes dependencies, builds, backups, and environments
├── docker-compose.yml                  # Orchestrator for all 5 dockerized services
├── README.md                           # Main developer onboarding guide
│
├── nginx/
│   └── nginx.conf                      # Nginx reverse proxy routing rules (supports SSE & WebSockets)
│
├── shared/                             # Code shared across Frontend and Backend
│   └── types/                          # Shared TypeScript contracts and schemas
│       ├── booking.ts
│       ├── events.ts
│       ├── game.ts
│       ├── ticket.ts
│       └── user.ts
│
├── backend/                            # Express.js Server & Conductor Game Engine
│   ├── Dockerfile                      # Backend container configuration
│   ├── package.json                    # Backend runtime dependencies
│   ├── tsconfig.json                   # TS compiler settings
│   ├── migrations/                     # Sequential schema migrations (001-010)
│   ├── seeds/                          # Initial DB dataset (roles, admin, sample game)
│   └── src/
│       ├── app.ts                      # Express app setups (CORS, body parsers, rate limiters)
│       ├── server.ts                   # Bootloader: Node HTTP Server, Socket.io, Cron scheduler
│       ├── config/                     # Environment loading & constant definitions
│       ├── db/                         # Database adapters, seeds, and migration runner
│       ├── middleware/                 # Auth verification, audit loggers, role checkers
│       ├── modules/                    # API features (Auth, Games, Bookings, Tickets,
│       │                               #   Users, Wallet, Config, Audit, Themes)
│       ├── services/                   # Game Engine loop, win detector, and cron schedules
│       └── utils/                      # Helper libraries (SSE manager, ticket generator)
│
└── frontend/                           # Next.js client UI
    ├── Dockerfile                      # Frontend container configuration
    ├── package.json                    # Next.js runtime dependencies
    ├── next.config.ts                  # Next.js configuration
    ├── tailwind.config.ts              # Custom utility styles, spacing, and palettes
    ├── postcss.config.mjs              # CSS utility compiler rules
    ├── eslint.config.mjs               # Linter configuration
    └── src/app/                        # Next.js App Router root
        ├── globals.css                 # Base theme styles
        ├── layout.tsx                  # Global wrapper layout
        └── page.tsx                    # Main Sandbox (Interactive Player, Agent & Operator views)
```

---

## ⚙️ Environment Configuration (`.env`)

The application's runtime configuration is centralized in a `.env` file at the project root. Below is a breakdown of the variables defined in `.env.example`:

| Environment Variable | Purpose | Default / Description |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://housie_user:housie_password@localhost:5432/housie_ghar` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `JWT_PRIVATE_KEY` | Private RSA key for signing authorization tokens | PEM encoded private key |
| `JWT_PUBLIC_KEY` | Public RSA key for verifying authorization tokens | PEM encoded public key |
| `JWT_EXPIRY` | Authentication session duration | `24h` |
| `NODE_ENV` | Mode under which the server runs | `development` or `production` |
| `PORT` | Listening port for the backend server | `4000` |
| `FRONTEND_URL` | Allowed origin for CORS policies | `http://localhost:3000` |
| `SUPERADMIN_EMAIL` | Default Superadmin email used by seeds | `superadmin@housieghar.local` |
| `SUPERADMIN_TEMP_PASSWORD` | Default Superadmin password used by seeds | `ChangeMe123!` |
| `LOCK_DURATION_MINUTES`| Duration for soft-locking selected tickets | `10` minutes |
| `MAX_LOCK_ATTEMPTS_PER_MIN`| Rate limits for locking tickets | `5` attempts |
| `SPAM_FLAG_THRESHOLD` | Max lock failures before marking IP suspicious | `3` flags |
| `LOW_BALANCE_THRESHOLD`| Agent wallet balance that triggers a warning | `500` (INR ₹) |

---

## 🐋 Orchestration Services (`docker-compose.yml`)

The platform is containerized using `docker-compose.yml` to define five interdependent local services:

1. **`postgres` (PostgreSQL 16)**:
   - Persists all relational application data (users, bookings, games, tickets, ledgers, audit logs).
   - Port: `5432` mapped to host. Data volume: `pgdata`.
2. **`redis` (Redis 7)**:
   - Stores fast-changing in-memory game state (active draws) and acts as the Pub/Sub channel relayer.
   - Port: `6379` mapped to host. Data volume: `redisdata`.
3. **`backend` (Node + Express)**:
   - Runs the Express API server and conductor game loop.
   - Mounts local source folder to `/app/src` for hot reloading and binds to port `4000`.
   - Depends on postgres and redis being healthy.
4. **`frontend` (Next.js)**:
   - Serves the compiled React App router build and static assets.
   - Binds to port `3000` and depends on the backend container.
5. **`nginx` (Nginx HTTP Proxy)**:
   - Binds to port `80`.
   - Routes traffic matching `/api/` and `/socket.io/` to the backend, and all other public traffic to the frontend.

---

## 🤝 Shared Type Definitions (`shared/types/`)

To prevent duplicate contracts and runtime bugs, types are shared as a local symbolic package mapping between the frontend and backend:

*   **`booking.ts`**: Contains interfaces for `Booking` structures and transaction details (e.g., `BookingStatus` of type `'Locked' | 'Sold' | 'Cancelled' | 'Expired'`).
*   **`events.ts`**: Holds types for payload structures emitted over SSE/WebSockets (`draw`, `winner`, `game_paused`, `game_resumed`, `game_completed`).
*   **`game.ts`**: Defines parameters for `ScheduledGame`, its metadata, lifecycle state (`'Scheduled' | 'Live' | 'Paused' | 'Completed'`), and active patterns (`'Early Five' | 'Top Line' | 'Middle Line' | 'Bottom Line' | 'Four Corners' | 'Full House'`).
*   **`ticket.ts`**: Interfaces for Housie grids (9 columns × 3 rows layout structure) and individual ticket squares.
*   **`user.ts`**: Defines system authorization attributes, profiles, and roles (`Superadmin`, `Admin`, `Operator`, `Agent`).

---

## ⚡ Backend Service Breakdown (`backend/`)

### 🔑 Core Infrastructure Configuration
*   **`src/server.ts`**: The main bootloader. Initializes the Redis Client connections, starts the Redis Pub/Sub subscription channels, activates the cron-based scheduler, attaches Socket.io to the HTTP instance, and boots the listening process.
*   **`src/app.ts`**: Configures global middleware such as CORS policies, parser limits, standard API request rate-limiters, and mounts the feature routers.
*   **`src/config/env.ts`**: Safe environment variable loader that parses and validates keys, throwing startup errors on missing essential variables.
*   **`src/config/constants.ts`**: Stores app variables including grid shapes (3x9 grid, 15 numbers total), ticket lock limits (10 mins), rate parameters, and game speeds.

### 💾 Relational Database & Migrations
*   **`migrations/`**: Numeric sequential SQL migrations that construct the database schema:
    *   `001_create_roles.sql`: Definess roles hierarchy (1-Superadmin, 2-Admin, 3-Operator, 4-Agent).
    *   `002_create_users.sql`: Holds accounts info, hashed passwords, and associations.
    *   `003_create_games.sql`: Defines scheduled draws and operational state indicators.
    *   `004_create_prize_pools.sql`: Relates game winnings patterns to set prizes.
    *   `005_create_tickets.sql`: Contains generated 9x3 numeric ticket layouts.
    *   `006_create_bookings.sql`: Tracks ticket lock sessions, assigned agents, and transaction references.
    *   `007_create_wallet_ledger.sql`: Tracks agent credit adjustments and balances.
    *   `008_create_game_logs.sql`: Backs up draw sequences and number announcements for audits.
    *   `009_create_audit_log.sql`: Non-repudiation log for operations.
    *   `010_create_themes.sql`: Saves global layout skin overrides.
*   **`seeds/`**: Populates the database with roles (`seed_roles.sql`), a default superadmin credentials file (`seed_superadmin.sql`), and default playable datasets (`seed_sample_game.sql`).
*   **`src/db/migrate.ts`**: Queries the `_migrations` log and applies unexecuted `.sql` migration files sequentially using atomic transactions.
*   **`src/db/seed.ts`**: Runner that seeds initial data securely on bootstrap.
*   **`src/db/generateGameTickets.ts`**: Automatic generation daemon that pre-creates up to 120 valid tickets with distinct layouts whenever a game is scheduled.

### 🧩 API Modules
Each API feature is organized in a modular structure containing its own controller, routes, and business validation services:
*   **`src/modules/auth/`**: Manages backend authorization sessions (admin login/logout, cookie generation, and user self-queries).
*   **`src/modules/games/`**: Allows scheduling games (`POST /api/games` — validates the 80% prize-pool cap, inserts prize rows, and pre-generates tickets), adding patterns to the prize pool, and triggers game commands (Start, Pause, Resume, Speed).
*   **`src/modules/tickets/`**: Exposes endpoints to retrieve real-time ticket availability lists and grid configurations.
*   **`src/modules/bookings/`**: The booking engine. Handles concurrency soft-locks, round-robin agent routing, and P2P WhatsApp deep-link generation.
*   **`src/modules/users/`**: Staff lifecycle management (`GET/POST /api/users`, `PATCH /api/users/:id`). Creates Operator/Agent/Admin accounts with bcrypt-hashed passwords (work factor 12), enforces a role-elevation guard (only a Superadmin may create Admins/Superadmins), and blocks self-suspension. Every action is written to the audit log.
*   **`src/modules/wallet/`**: Agent wallet oversight and the top-up lifecycle (`GET /api/wallet/agents`, `POST /api/wallet/topup/request`, `POST /api/wallet/topup/:id/approve|reject`). Approvals credit the agent balance inside a `SELECT ... FOR UPDATE` transaction, append an immutable `Wallet_Ledger` Credit entry, and push a `wallet_credited` event to the agent over Socket.io.
*   **`src/modules/config/`**: Superadmin-only key-value platform settings (`GET/PUT /api/config`). Updates are restricted to existing `Platform_Config` keys and run transactionally so an unknown key rolls the whole batch back.
*   **`src/modules/audit/`**: Superadmin-only, read-only paginated access to the immutable `Audit_Log` (`GET /api/audit`) with optional `action` and `user_id` filters (page size capped at 100).
*   **`src/modules/themes/`**: Theme listing (`GET /api/themes`, public) and activation (`PUT /api/themes/active`, Superadmin). Activating a theme guarantees exactly one active row and broadcasts a `theme_change` event to **all** clients — players via SSE (`sseManager.broadcastAll`) and staff via Socket.io.

### ⚙️ Conductor Game Engine & Cron Services (`src/services/`)
*   **`gameEngine.ts`**: The heart of the platform.
    *   **The Conductor Loop**: Implements the drawing intervals (`setInterval`) and saves current draw index states.
    *   **Win Detection Engine**: An algorithm evaluated on every draw tick. Checks all sold ticket grids against called numbers to detect claims like *Early Five*, *Lines*, *Corners*, or *Full House* and handles prize splitting dynamically.
    *   **Redis Pub/Sub Broadcaster**: Relays updates across multiple server processes.
*   **`scheduler.service.ts`**: Initiates `node-cron` routines. Specifically:
    *   **Lock Sweeper**: Runs every 30 seconds to clean expired unpaid bookings (10-minute timeout) and releases tickets back to the available pool.
*   **`audit.service.ts`**: Implements non-destructive activity logging for administrative commands.

### 🛠️ Utilities & Helpers (`src/utils/`)
*   **`sseManager.ts`**: Implements Server-Sent Events (SSE) connections. Channels real-time updates directly to players (one-way feed) with low overhead.
*   **`ticketGenerator.ts`**: A mathematical implementation of the Tambola ticket rules:
    *   Creates a 9-column by 3-row layout structure containing exactly 15 numbers (5 per row).
    *   Enforces column range rules (Col 0: 1–9, Col 1: 10–19, ..., Col 8: 80–90).
    *   Guarantees numbers inside each column are sorted in ascending order.

---

## 🎨 Frontend Client Breakdown (`frontend/`)

### ⚡ Client State & Socket Connections
*   **`src/app/page.tsx`**: The main landing page. Under the sandbox mode, it organizes the application into three tabs to allow easy testing of roles in local development:
    *   **Player Hub**: Allows selecting tickets, viewing payment steps (P2P WhatsApp routing), monitoring the live drawing cage, and checking claimed prizes.
    *   **Agent Panel**: Contains the live request queues to approve/reject bookings and manage wallet credits.
    *   **Operator Board**: Provides speed controls (5s–12s draw interval slider), emergency pause triggers, and live draw logs.
*   **Real-time Integration**:
    *   **Socket.io Client**: Emits WebSocket actions and maintains two-way tunnels for Operator actions and Agent panels.
    *   **EventSource (SSE)**: Listens to the `/api/games/:id/live-stream` feed to update the drawn numbers panel for players in real-time.
*   **Custom Styling (`tailwind.config.ts` & `src/app/globals.css`)**: Defines custom design systems (colors, spacing, layout themes) suitable for mobile devices.

---

## 💡 Key Architectural Decisions Explained

### 1. Zero-Fee WhatsApp + UPI P2P Financial Routing
No player funds ever touch the servers. Instead, when a player books, they are assigned to an active Agent. The platform generates a WhatsApp chat link containing pre-filled details (e.g. Booking ID, ticket numbers, total amount). The player transfers funds directly via UPI to the Agent's phone number. The Agent confirms receipt on their console, which updates the booking status to `Sold` via real-time WebSocket events. This approach eliminates payment gateway fees (1.5% - 3%) and complies with local-first regulations.

### 2. Multi-Tier Real-Time Strategy: SSE vs WebSockets
*   **Server-Sent Events (SSE)** are used for the Player Lobby and live board. Since players only consume draw data and do not send updates back during a live game, SSE provides a lightweight, one-way HTTP stream that recovers from network drops automatically and reduces server overhead.
*   **WebSockets (Socket.io)** are used for Agent and Operator screens where two-way interactions (e.g. confirming payments, adjusting draw speeds, or triggering emergency pauses) require low-latency communication.

### 3. Cryptographically Secure Draw Sequence
Instead of using `Math.random()`, which is pseudo-random and vulnerable to predictability attacks, the game engine uses Node's built-in `crypto.randomInt()`. The drawing sequence is pre-shuffled at game start using the **Fisher-Yates Shuffle** algorithm with cryptographically secure entropy. The sequence is stored in the database at launch for transparency and auditing.

### 4. Database Locking & Soft-Locks
To prevent two players from booking the same ticket simultaneously, the engine uses PostgreSQL row-level locks (**`SELECT ... FOR UPDATE`**). When a ticket is clicked, it enters a `Locked` state for 10 minutes. A background `node-cron` runner releases these tickets back to the available pool if the booking is not approved by an Agent within the timeout window.

---

## 🔄 Recent Changes — PRD1 Alignment (2026-06-05)

This pass closed the gap between [`PRD1.md`](./PRD1.md) and the running backend. The PRD declared a full Phase-1 API surface (game creation, staff management, the wallet top-up workflow, audit access, platform config, and theme switching), but only the Auth, Games-control, Bookings, and Tickets routes had actually been wired. The database schema already supported everything — `TopUp_Requests` lives in migration `007`, and `Platform_Config` + `Themes` in migration `010` — so **no migrations were added**; the work was purely the missing API layer plus its two supporting transport tweaks.

### New backend modules

| Module | Endpoints | Role | Notes |
|---|---|---|---|
| `modules/users/` | `GET/POST /api/users`, `PATCH /api/users/:id` | Admin+ | bcrypt(12) hashing; role-elevation guard; self-suspend block; audited |
| `modules/wallet/` | `GET /api/wallet/agents`, `POST /api/wallet/topup/request`, `POST /api/wallet/topup/:id/approve\|reject` | Agent / Admin+ | Credit inside `SELECT FOR UPDATE`; immutable ledger entry; `wallet_credited` Socket.io push |
| `modules/config/` | `GET/PUT /api/config` | Superadmin | Transactional upsert restricted to known `Platform_Config` keys |
| `modules/audit/` | `GET /api/audit` | Superadmin | Paginated (cap 100) with `action` / `user_id` filters |
| `modules/themes/` | `GET /api/themes`, `PUT /api/themes/active` | Public / Superadmin | Single-active invariant; `theme_change` broadcast to SSE **and** Socket.io |

### Changes to existing files

*   **`src/modules/games/games.controller.ts`** — added `createGame()` (`POST /api/games`, Admin+): validates inputs and prize patterns, enforces the **80% prize-pool cap** (`CONSTANTS.MAX_PRIZE_POOL_PERCENTAGE`), inserts the game and `Prize_Pool` rows transactionally, then pre-generates tickets via `generateTicketsForGame()`. Writes a `CREATE_GAME` audit entry.
*   **`src/modules/games/games.routes.ts`** — mounted the new `POST /` create route (Admin+) ahead of the parameterised routes.
*   **`src/app.ts`** — imported and mounted the five new routers (`/api/users`, `/api/wallet`, `/api/config`, `/api/audit`, `/api/themes`).
*   **`src/server.ts`** — added a `join_admin_room` Socket.io handler so Admin/Superadmin dashboards can receive `topup_request_received` notifications via the shared `admin-room`.
*   **`src/utils/sseManager.ts`** — added `broadcastAll()` to push a single event (e.g. a theme change) to every connected SSE client across all games, not just one game room.
*   **`src/services/audit.service.ts`** — widened the `userAgent` field to `string | string[]` and normalised header arrays so controllers can pass `req.headers['user-agent']` directly.

### Verification

*   `npx tsc --noEmit` is clean across all new and modified modules. (The only remaining notices are the pre-existing `@shared/*` `rootDir` warnings and the `baseUrl` deprecation in `tsconfig.json`, both of which predate this change and are non-blocking under `ts-node`.)
*   The mounted route inventory now matches the PRD §7 API Reference one-for-one (plus a convenience `GET /api/users` and `GET /api/themes` for the Admin/Superadmin consoles).

> **Not in this pass:** the frontend remains the single-page sandbox (`frontend/src/app/page.tsx`); building the five dedicated role workspaces described in PRD §6 is the next frontend milestone. All new endpoints are server-side and immediately consumable by that work.
