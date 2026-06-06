# HOUSIE GHAR — PROJECT DESIGN & REQUIREMENTS DOCUMENT (PDR)

**Document Version:** 2.0 (Master)
**Project Scope:** Full-Stack Local Web Application — Phase 1
**Organization:** Mission for Operations & Development (MOD)
**Deployment Target:** Local Device / LAN Network (Phase 1)
**Based On:** HG_Doc.pdf (Housie Ghar Website Specifications v1.0) + PRD.md v1.0

---

## CONFIRMED TECHNICAL DECISIONS

Before reading this document, note the following decisions that have been locked in:

| Decision Point | Confirmed Choice | Reasoning |
|---|---|---|
| Backend Framework | **Node.js + Express.js** | Lightweight, flexible, and ideal for a local-first deployment |
| Frontend State Management | **Zustand** | Simple, minimal boilerplate; perfect for managing live game state |
| Deployment Environment | **Local Device / LAN** | Phase 1 runs on a single machine accessible over a local network |
| Page Architecture | **Single-Page with Sections** | Both the Player Lobby and Admin Panel are sections of one `index` page — no separate routes needed for Phase 1 |
| Audio System | **Deferred to Phase 2** | No audio files in Phase 1; the number announcement is visual-only |

---

## TABLE OF CONTENTS

1. [Project Overview](#chapter-1-project-overview)
2. [Technology Stack — Detailed](#chapter-2-technology-stack--detailed)
3. [Project File & Folder Structure](#chapter-3-project-file--folder-structure)
4. [Single-Page Architecture — Section Layout](#chapter-4-single-page-architecture--section-layout)
5. [Role-Based Access Control (RBAC)](#chapter-5-role-based-access-control-rbac)
6. [Module 1 — Player Interface & Booking Engine](#chapter-6-module-1--player-interface--booking-engine)
7. [Module 2 — Automated Game Engine](#chapter-7-module-2--automated-game-engine)
8. [Module 3 — Superadmin Control Center](#chapter-8-module-3--superadmin-control-center)
9. [Module 4 — Admin Console](#chapter-9-module-4--admin-console)
10. [Module 5 — Operator Console](#chapter-10-module-5--operator-console)
11. [Module 6 — Agent Workspace](#chapter-11-module-6--agent-workspace)
12. [Database Schema — Full Detail](#chapter-12-database-schema--full-detail)
13. [API Endpoints — Full Reference](#chapter-13-api-endpoints--full-reference)
14. [Real-Time Infrastructure](#chapter-14-real-time-infrastructure)
15. [Security Requirements](#chapter-15-security-requirements)
16. [UI/UX & Design Guidelines](#chapter-16-uiux--design-guidelines)
17. [Smart Features Index](#chapter-17-smart-features-index)
18. [Local Deployment Setup](#chapter-18-local-deployment-setup)
19. [Out of Scope (Phase 1)](#chapter-19-out-of-scope-phase-1)
20. [Glossary of Terms](#chapter-20-glossary-of-terms)

---

## CHAPTER 1: PROJECT OVERVIEW

### 1.1 What Is Housie Ghar?

Housie Ghar is a full-stack web application that digitizes the traditional Indian game of Housie (also called Tambola or Indian Bingo). The game is deeply embedded in the social fabric of the Darjeeling and Sikkim communities, where it is played at family gatherings, clubs, and festive events.

The physical version of this game involves:
- A human "Caller" drawing numbered tokens from a bag and announcing them aloud
- Players holding paper tickets with numbers printed in a 9×3 grid
- Players manually crossing out called numbers with a pen
- Players shouting "Housie!" when they complete a winning pattern

Housie Ghar replaces all of this with a seamless, automated digital experience — while preserving the excitement, community spirit, and cultural flavor of the original game.

### 1.2 The Core Problem Being Solved

Running a physical Housie event is logistically complex:

**Problem 1 — Trust:** Players at digital events worry: "Is the number draw rigged?" Physical draws are visible; digital draws feel like a black box.

**Problem 2 — Financial Friction:** Using payment gateways like Razorpay costs 1.5–3% per transaction, directly reducing prize pools. Collecting money via WhatsApp manually is chaotic and untracked.

**Problem 3 — Operational Fatigue:** Hosts manually verify payment screenshots, type out sold ticket numbers, pause games to verify winner claims, and handle customer complaints. This is exhausting and error-prone.

**Problem 4 — Loss of Cultural Identity:** Generic digital tools strip away the regional dialect, local slang, and warm community atmosphere that make Housie special in Darjeeling and Sikkim.

### 1.3 How Housie Ghar Solves These Problems

| Problem | Solution |
|---|---|
| Trust in the draw | Cryptographically Secure RNG (CSPRNG) with a pre-generated, database-saved, fully auditable draw sequence |
| Financial friction | P2P payment via WhatsApp + UPI — zero platform fees, instant Agent liquidity |
| Operational fatigue | 100% automated: number drawing, win detection, prize splitting, announcements — zero manual intervention once started |
| Cultural disconnect | Localized UI copy in Darjeeling/Sikkim dialect; custom audio files (Phase 2); warm community-first design |

### 1.4 Three Core Pillars

**Pillar 1 — Absolute Automation**
Once an Operator clicks "Start Game," the platform handles everything: drawing numbers at configurable intervals, auto-marking player tickets, detecting winning patterns across thousands of tickets simultaneously, splitting prizes in case of ties, and broadcasting winner announcements in real-time to every connected screen. No human needs to do anything until the game ends.

**Pillar 2 — Granular Role-Based Access Control (RBAC)**
Every user of the system occupies exactly one of five roles. Each role has a specific, limited set of permissions. A person cannot access anything outside their role's boundary — not through the frontend UI, and not through direct API calls. The hierarchy is: Superadmin → Admin → Operator → Agent → Player.

**Pillar 3 — Decentralized P2P Financial Routing**
No money ever passes through Housie Ghar's servers. When a Player books a ticket, they are connected directly to a local Agent via WhatsApp. The Player sends money to the Agent via UPI. The Agent confirms receipt and approves the ticket on the dashboard. The platform tracks ticket ownership without ever touching the funds.

### 1.5 Financial Architecture Explained in Detail

The decision to use WhatsApp + UPI P2P instead of a payment gateway is the most distinctive technical and business decision in this project. Here is the full justification:

**Zero Commission Economics:**
If a ticket costs ₹50 and 1,000 tickets are sold per game, the gross revenue is ₹50,000. A payment gateway at 2% commission would take ₹1,000 from every game — directly out of the prize pool or platform profit. At 4 games per week, that is ₹4,000 per week, ₹16,000 per month, and ₹192,000 per year lost purely to commission fees. P2P eliminates this entirely.

**Instant Agent Liquidity:**
Traditional gateways hold funds for T+2 or T+3 settlement cycles (2–3 business days). Agents cannot wait for their money — they need to confirm tickets in real-time. With P2P, funds arrive in their UPI account instantly, allowing them to immediately confirm the booking.

**Regulatory De-Risking:**
Holding player funds in a central digital wallet makes Housie Ghar a financial institution under Indian regulations, requiring RBI compliance, KYC mandates, gaming licenses, and escrow management. By routing funds directly between individuals, Housie Ghar legally operates only as a software platform — no financial regulation applies to the platform itself.

**Trust Through Human Interaction:**
A Player transferring ₹50 to a named, known local Agent via WhatsApp feels far safer than sending money to a faceless digital portal. The Agent is accountable, accessible, and responsive. This local trust network is a competitive advantage.

### 1.6 Target User Personas

**The Player**
A mobile-first user who accesses the platform primarily from a smartphone. They are comfortable using WhatsApp daily and make UPI payments regularly. They want a game that is fast, exciting, and fair. They do not want to create an account or remember a password. They want to pick their tickets, pay quickly, and watch the live draw.

**The Agent**
A local, entrepreneurial individual who has been onboarded by an Admin. They operate entirely from their smartphone, constantly switching between the Housie Ghar dashboard, their WhatsApp messages, and their UPI banking app. Their income is based on the markup between what they pay for digital inventory (e.g., ₹45/ticket from the platform's digital wallet) and what they collect from the Player (e.g., ₹50/ticket). Their dashboard must be fast, minimal, and action-focused.

**The Operator**
A trusted member of the MOD team who is assigned to host live games. Their job begins 15 minutes before the game starts (pre-game lobby checks) and ends when the last prize is claimed. They have no access to finances or agent management. Their entire interface is the Live Execution HUD.

**The Admin**
An operations manager who builds game schedules, sets prize pools, manages Agents under their jurisdiction, and processes wallet top-ups. They are a bridge between the Superadmin's strategy and the Operator's execution.

**The Superadmin**
The founding member(s) of MOD. They have unrestricted access to everything: user management across all levels, global financial analytics, emergency game overrides, platform theming, audio asset management (Phase 2), and the master audit trail. There may be multiple Superadmins but this role is strictly controlled.

### 1.7 What Is Out of Scope for Phase 1

The following features are explicitly deferred:
- Native iOS/Android mobile application
- Direct in-app fiat wallets for Players
- Live video streaming of a human host
- Custom audio files for number calls (the audio mapping system architecture is built, but no audio is played in Phase 1)
- Cloud deployment (runs locally in Phase 1)

---

## CHAPTER 2: TECHNOLOGY STACK — DETAILED

This chapter explains not just *what* technology is used, but *why* each specific tool was chosen and how it fits into the system.

### 2.1 Frontend Layer

#### 2.1.1 Framework: Next.js (React)

Next.js is a React framework that supports multiple rendering strategies:

- **Static Site Generation (SSG):** Pages are pre-rendered at build time. Used for the landing page/lobby, the "How to Play" section, and the "Winners" hall of fame. These pages load near-instantly because they are just HTML files served directly.
- **Server-Side Rendering (SSR):** Pages are rendered on the server for each request. Used for game-specific pages where real-time ticket availability data must be fetched before the page renders.
- **Client-Side Rendering (CSR):** The page renders in the browser using JavaScript. Used for the live game board and all admin dashboards, where data changes constantly and page re-renders happen frequently.

In Phase 1 (local deployment), the Next.js dev server runs on the local machine (e.g., `http://localhost:3000`). All players on the same Wi-Fi network access it via the host machine's local IP (e.g., `http://192.168.1.5:3000`).

#### 2.1.2 State Management: Zustand

Zustand is a lightweight state management library for React. It replaces Redux for this project because:

- **Minimal boilerplate:** A Zustand store is a simple JavaScript object with state and actions. No reducers, no action creators, no dispatch.
- **React integration:** Components subscribe to only the slice of state they need — no unnecessary re-renders.
- **Persistence middleware:** Zustand has a built-in `persist` middleware that automatically syncs state to `localStorage`. This is used to save the Player's `booking_id` and Housie Name across tab closures.

The following Zustand stores will be created:

| Store Name | Purpose | Key State |
|---|---|---|
| `gameStore` | Tracks live game state | `drawnNumbers[]`, `claimedPrizes[]`, `currentNumber`, `gameStatus`, `drawInterval` |
| `bookingStore` | Manages a Player's active booking | `bookingId`, `housieNamed`, `lockedTickets[]`, `lockExpiry`, `bookingStatus` |
| `ticketGridStore` | Tracks the real-time ticket grid | `tickets[]` (each with `ticketId`, `status`, `gridData`) |
| `authStore` | Manages admin authentication | `user`, `role`, `isAuthenticated`, `token` |
| `agentQueueStore` | Manages the Agent's live booking queue | `pendingRequests[]`, `walletBalance` |
| `operatorStore` | Manages the Operator's live HUD | `gameId`, `playerCount`, `nextNumber`, `drawSpeed` |

#### 2.1.3 Styling: Tailwind CSS

Tailwind CSS is a utility-first CSS framework. Instead of writing `.card { background: white; padding: 16px; }` in a separate CSS file, styles are applied directly in JSX using class names like `bg-white p-4`.

Why Tailwind for this project:
- **Mobile-first by design:** All Tailwind classes are mobile-first with responsive prefixes (`md:`, `lg:`).
- **Theme variables:** Tailwind's `tailwind.config.ts` file allows defining custom colors (forest green, twilight blue, gold) as named variables used throughout the entire UI.
- **CSS themes:** The four platform themes (Default, Dark, Festive, Classic Hall) are implemented as Tailwind configuration sets — switching the active theme updates all CSS variables site-wide instantly.

#### 2.1.4 Real-Time (Player View): Server-Sent Events (SSE)

SSE is a standard browser technology (`EventSource` API) that allows a server to push data to a browser over a single, long-lived HTTP connection. Key characteristics:

- **One-way:** Data only flows from Server → Client. The browser cannot send data back on the same SSE connection.
- **Why it is preferred over WebSockets for Players:** During a live game, Players only *receive* data (drawn numbers, winner announcements, prize claims). They never *send* data. SSE is perfectly suited for this one-way flow and consumes significantly less server memory than maintaining bidirectional WebSocket TCP connections for thousands of simultaneous users.
- **Automatic reconnection:** The browser's `EventSource` API automatically attempts to reconnect if the connection drops — built into the browser, no extra code needed.
- **HTTP-compatible:** SSE works over standard HTTP/HTTPS, meaning it works with any load balancer or proxy without special configuration (unlike WebSockets which sometimes need upgrade headers).

#### 2.1.5 Real-Time (Operator & Agent Views): WebSockets via Socket.io

WebSockets provide a true bidirectional, persistent TCP connection between the browser and the server. This is required for the Operator and Agent dashboards because:

- **Operator sends data:** When the Operator moves the Speed Slider, that data must be sent to the server to update the draw interval. When they hit Emergency Pause, a command is sent upstream.
- **Agent sends data:** When the Agent clicks "Confirm Payment," that is a client-initiated action that must reach the server. The Agent's queue also updates bidirectionally — new requests push in, confirmed requests push out.

Socket.io is the library of choice because it adds automatic reconnection, room-based event broadcasting (useful for scoping events to a specific `game_id`), and graceful fallback to HTTP long-polling when WebSockets are unavailable.

#### 2.1.6 Local Data Persistence: localStorage / sessionStorage

The browser provides two key-value storage APIs:
- **`localStorage`:** Persists across browser sessions. Used to save the Player's `booking_id` and `housie_name` so they can close the browser and return hours later to find their tickets.
- **`sessionStorage`:** Persists only within a browser tab session. Used for temporary UI state.

Zustand's `persist` middleware wraps the `bookingStore` to automatically sync it with `localStorage` on every state change.

### 2.2 Backend Layer

#### 2.2.1 Runtime: Node.js

Node.js executes JavaScript on the server. Its key architectural property is an **asynchronous, non-blocking, event-driven** model. This means:

- A traditional server (e.g., PHP) creates a new thread for every incoming request. Under heavy load (1,000 concurrent users), it needs 1,000 threads, consuming massive RAM.
- Node.js runs on a single thread with an event loop. It processes requests asynchronously — while waiting for a database response for User A, it simultaneously handles User B's request. It can handle thousands of concurrent connections with minimal RAM.

This makes Node.js the ideal choice for a platform that must sustain thousands of simultaneous SSE connections during a Mega Draw.

#### 2.2.2 Framework: Express.js

Express.js is the most widely used Node.js web framework. It provides:

- **Routing:** Define URL patterns and link them to handler functions (`GET /api/games`, `POST /api/bookings/lock`).
- **Middleware pipeline:** Every incoming request passes through a chain of middleware functions before reaching its handler. This is where authentication checking, rate limiting, request logging, and JSON parsing happen.
- **WebSocket compatibility:** Express.js works alongside Socket.io by sharing the same HTTP server instance.

Express.js is intentionally minimal — it does not enforce a project structure, which gives the development team full flexibility in organizing the codebase. This is preferable to NestJS (which is more opinionated) for Phase 1 of a local deployment.

#### 2.2.3 RNG: `crypto.randomInt` (Node.js Built-in)

The Node.js `crypto` module provides cryptographically secure random number generation. It uses the operating system's secure entropy source (e.g., `/dev/urandom` on Linux). This is critically different from `Math.random()`:

| Property | `Math.random()` | `crypto.randomInt()` |
|---|---|---|
| Algorithm | Pseudo-random (deterministic seed) | Cryptographically secure (OS entropy) |
| Predictability | Predictable with enough observations | Computationally impossible to predict |
| Suitability for games | No — can be exploited | Yes — mathematically fair |

The Fisher-Yates Shuffle algorithm applied with `crypto.randomInt` guarantees that every possible ordering of numbers 1–90 is equally likely. No sequence can ever be predicted or manipulated.

#### 2.2.4 Job Scheduling: node-cron

`node-cron` is a task scheduling library that runs functions on a time-based schedule (similar to Linux's `cron` system). Used for:

- **Expiry Sweeper (every 30 seconds):** Scans the `Bookings` table for records where `locked_until < NOW()` and `status = 'Locked'`. These are expired unpaid bookings. The sweeper automatically changes their status to `Cancelled` and releases the tickets back to the pool.
- **Daily Database Backup trigger (3:00 AM IST):** In Phase 1 (local), this triggers a PostgreSQL `pg_dump` command to create a backup file on the local disk.

### 2.3 Database Layer

#### 2.3.1 Primary Database: PostgreSQL

PostgreSQL is a powerful, open-source relational database. It enforces **ACID compliance**, which is mandatory for any system handling financial transactions:

- **Atomicity:** A transaction is all-or-nothing. If an Agent confirms a payment and the database crashes halfway through, the entire operation is rolled back — the wallet is not debited without the ticket being marked Sold.
- **Consistency:** Database constraints (foreign keys, unique constraints, check constraints) are always enforced. A ticket can never be simultaneously "Sold" to two different players.
- **Isolation:** Two concurrent transactions cannot interfere with each other. If two Players click "Book Now" for the same ticket at the same millisecond, PostgreSQL serializes the conflict and one player gets the ticket; the other gets an "Unavailable" error.
- **Durability:** Once a transaction is committed, it is permanently saved even if the server crashes immediately after.

PostgreSQL's **`SELECT ... FOR UPDATE`** feature is critical for the ticket booking concurrency engine. When the booking request arrives, the backend locks the specific ticket rows in the database, preventing any other transaction from modifying them until the current one completes.

#### 2.3.2 Cache & Pub/Sub: Redis

Redis is an in-memory data store used for two distinct purposes:

**Purpose 1 — In-Memory Cache (Speed):**
The live game state (current drawn numbers, claimed prizes, draw sequence index, current draw interval) is stored in Redis rather than queried from PostgreSQL on every tick. A Redis read is measured in microseconds; a PostgreSQL read is measured in milliseconds. For a live game broadcasting a new number every 5–12 seconds, this difference matters enormously at scale.

Specific Redis keys used:
- `game:{game_id}:drawn_numbers` → A Redis List of numbers drawn so far
- `game:{game_id}:draw_sequence` → The full shuffled array (stored once at game start)
- `game:{game_id}:sequence_index` → The current position in the draw sequence
- `game:{game_id}:interval_ms` → The current draw interval (updated by Operator Speed Slider)
- `game:{game_id}:status` → `live`, `paused`, `completed`
- `booking:{booking_id}:timer` → TTL-based key; expires automatically when the 10-minute lock window closes

**Purpose 2 — Pub/Sub (Real-Time Broadcasting):**
When the Conductor (backend game engine) draws a new number, it publishes a message to a Redis channel. All backend server instances subscribe to that channel and relay the message to their connected SSE/WebSocket clients. This allows horizontal scaling — in Phase 1 this runs on a single server, but the architecture is already designed for multi-server scaling in Phase 2.

### 2.4 Infrastructure (Phase 1 — Local)

#### 2.4.1 Local Deployment Stack

In Phase 1, the entire platform runs on a single local machine (laptop or desktop). All services run simultaneously using Docker Compose:

| Service | Technology | Local Port |
|---|---|---|
| Frontend (Next.js) | Node.js | 3000 |
| Backend (Express.js) | Node.js | 4000 |
| Database | PostgreSQL 16 | 5432 |
| Cache / Pub/Sub | Redis 7 | 6379 |
| Reverse Proxy | Nginx | 80 |

Nginx sits in front of the frontend and backend, routing:
- `http://[local-ip]/` → Frontend (port 3000)
- `http://[local-ip]/api/` → Backend (port 4000)
- `http://[local-ip]/socket.io/` → WebSocket server (port 4000)

Players on the same Wi-Fi network access the platform via `http://192.168.x.x` (the host machine's local IP address).

#### 2.4.2 Authentication (Local)

Even in local deployment, authentication is enforced for all admin routes. JWT tokens are signed with a local secret key (stored in `.env`). Tokens are set as `HttpOnly` cookies scoped to the admin subdirectory.

---

## CHAPTER 3: PROJECT FILE & FOLDER STRUCTURE

This chapter explains every folder and file in the project, describing its purpose so that any developer can understand the codebase layout before writing a single line of code.

```
housie-ghar/                           ROOT — The entire project lives here
│
├── .env                               Environment variables (DB credentials, JWT secret, Redis URL, etc.)
├── .env.example                       A template of .env with placeholder values — safe to commit to Git
├── .gitignore                         Tells Git which files to ignore (node_modules, .env, build outputs)
├── docker-compose.yml                 Defines all four services (frontend, backend, postgres, redis) for local dev
├── README.md                          Developer onboarding guide — how to run the project locally
│
├── nginx/
│   └── nginx.conf                     Nginx reverse proxy configuration for local routing
│
├── shared/                            Code shared between frontend and backend
│   └── types/
│       ├── game.ts                    TypeScript interfaces for Game objects (GameStatus, GameCard, etc.)
│       ├── ticket.ts                  TypeScript interfaces for Ticket objects (TicketStatus, GridData, etc.)
│       ├── user.ts                    TypeScript interfaces for User objects (Role, UserProfile, etc.)
│       ├── booking.ts                 TypeScript interfaces for Booking objects (BookingStatus, etc.)
│       └── events.ts                  TypeScript interfaces for all WebSocket/SSE event payloads
│
├── frontend/                          The Next.js React application
│   │
│   ├── package.json                   Frontend dependencies (next, react, zustand, tailwindcss, socket.io-client)
│   ├── next.config.ts                 Next.js configuration (rewrites, environment variables, image domains)
│   ├── tailwind.config.ts             Tailwind custom colors, fonts, breakpoints, and theme extensions
│   ├── tsconfig.json                  TypeScript configuration
│   │
│   ├── public/                        Static files served directly (no processing)
│   │   ├── images/
│   │   │   ├── logo.svg               Housie Ghar logo
│   │   │   ├── mod-badge.svg          MOD trust badge
│   │   │   └── favicon.ico
│   │   └── fonts/                     Self-hosted web fonts (for offline/LAN use — no Google Fonts CDN)
│   │
│   ├── src/
│   │   │
│   │   ├── app/                       Next.js App Router directory
│   │   │   │
│   │   │   ├── layout.tsx             Root layout — wraps every page with <html>, <body>, nav, footer
│   │   │   ├── page.tsx               THE MAIN INDEX PAGE — contains all public sections as scroll sections
│   │   │   │                          Sections rendered in order:
│   │   │   │                          #hero, #games, #how-to-play, #winners, #live-game
│   │   │   │
│   │   │   ├── admin/                 All admin panel pages (protected by middleware)
│   │   │   │   ├── layout.tsx         Admin shell layout (sidebar, top bar, role-aware nav)
│   │   │   │   ├── login/
│   │   │   │   │   └── page.tsx       Staff login page (email + password form)
│   │   │   │   │
│   │   │   │   ├── superadmin/        Superadmin-exclusive pages
│   │   │   │   │   ├── page.tsx       Executive Dashboard (real-time HUD)
│   │   │   │   │   ├── users/
│   │   │   │   │   │   └── page.tsx   User management grid (all roles)
│   │   │   │   │   ├── games/
│   │   │   │   │   │   └── page.tsx   Full game list with emergency controls
│   │   │   │   │   ├── finances/
│   │   │   │   │   │   └── page.tsx   Financial hub — top-up queue, ledger, profit distribution
│   │   │   │   │   ├── audit-log/
│   │   │   │   │   │   └── page.tsx   Immutable audit trail viewer
│   │   │   │   │   └── theming/
│   │   │   │   │       └── page.tsx   CSS theme switcher + global variables editor
│   │   │   │   │
│   │   │   │   ├── admin/             Admin-level pages
│   │   │   │   │   ├── page.tsx       Admin dashboard overview
│   │   │   │   │   ├── game-builder/
│   │   │   │   │   │   └── page.tsx   3-step game creation wizard
│   │   │   │   │   └── agents/
│   │   │   │   │       └── page.tsx   Agent management table + wallet approval queue
│   │   │   │   │
│   │   │   │   ├── operator/          Operator pages
│   │   │   │   │   ├── page.tsx       List of games assigned to this Operator
│   │   │   │   │   └── console/
│   │   │   │   │       └── [game_id]/
│   │   │   │   │           └── page.tsx  Live Execution HUD for a specific game
│   │   │   │   │
│   │   │   │   └── agent/             Agent pages
│   │   │   │       ├── page.tsx       Overview (redirects to Live Queue)
│   │   │   │       ├── queue/
│   │   │   │       │   └── page.tsx   Real-time live booking queue
│   │   │   │       ├── sales/
│   │   │   │       │   └── page.tsx   Historical sales ledger
│   │   │   │       └── wallet/
│   │   │   │           └── page.tsx   Digital wallet + top-up request form
│   │   │   │
│   │   │   └── game/
│   │   │       └── [game_id]/
│   │   │           └── page.tsx       The Game Room — ticket selection grid for a specific game
│   │   │                              (Separate route because it has a unique URL per game)
│   │   │
│   │   ├── components/                All reusable React components
│   │   │   │
│   │   │   ├── ui/                    Primitive, theme-aware base components
│   │   │   │   ├── Button.tsx         Button (variants: primary, secondary, danger, ghost)
│   │   │   │   ├── Modal.tsx          Base modal (dismissible and non-dismissible variants)
│   │   │   │   ├── Badge.tsx          Status badges (Fast Filling!, Sold Out, Live, etc.)
│   │   │   │   ├── Card.tsx           Generic card container
│   │   │   │   ├── Countdown.tsx      Reusable countdown timer component (MM:SS display)
│   │   │   │   ├── ProgressBar.tsx    Animated progress bar (used on game cards for ticket fill)
│   │   │   │   ├── DataTable.tsx      Sortable/filterable table (used in all admin dashboards)
│   │   │   │   ├── Toast.tsx          Notification toasts (success, error, warning, info)
│   │   │   │   └── Spinner.tsx        Loading spinner
│   │   │   │
│   │   │   ├── layout/                Page layout components
│   │   │   │   ├── Navbar.tsx         Sticky top navigation bar (public-facing)
│   │   │   │   ├── Footer.tsx         Global footer with MOD branding
│   │   │   │   ├── AdminSidebar.tsx   Left sidebar for admin panel (role-aware menu items)
│   │   │   │   └── AdminTopBar.tsx    Top bar for admin panel (user info, logout, wallet balance for Agent)
│   │   │   │
│   │   │   ├── sections/              Page sections rendered inside the main index page
│   │   │   │   ├── HeroSection.tsx    Hero banner with upcoming Mega Game + countdown timer
│   │   │   │   ├── GamesSection.tsx   Scrollable feed of game cards
│   │   │   │   ├── GameCard.tsx       Individual game card component
│   │   │   │   ├── PrizeDropdown.tsx  Collapsible prize pool list inside a GameCard
│   │   │   │   ├── HowToPlaySection.tsx  Instructional section with game rules
│   │   │   │   ├── WinnersSection.tsx  Hall of Fame — recent winners display
│   │   │   │   └── LiveGameSection.tsx  Embedded live game board for watching (not interactive)
│   │   │   │
│   │   │   ├── game-room/             Components for the ticket selection Game Room
│   │   │   │   ├── TicketGrid.tsx     Responsive grid of all tickets for a game
│   │   │   │   ├── TicketSquare.tsx   Individual ticket square (Available/Locked/Sold states)
│   │   │   │   ├── BookingFooter.tsx  Sticky bottom footer (total, Housie Name input, Book Now button)
│   │   │   │   ├── LockModal.tsx      Non-dismissible soft-lock confirmation modal with countdown
│   │   │   │   └── SuccessModal.tsx   Post-confirmation success screen with digital ticket display
│   │   │   │
│   │   │   ├── live-board/            Components for the live game screen
│   │   │   │   ├── TambolaCage.tsx    CSS-animated ball machine / draw visual
│   │   │   │   ├── CurrentNumber.tsx  Large, prominent display of the latest drawn number
│   │   │   │   ├── NumberBoard.tsx    9×10 grid showing all numbers 1–90; called numbers highlighted
│   │   │   │   ├── PlayerTicket.tsx   The player's own ticket with auto-marked numbers
│   │   │   │   ├── WinnerAnnouncement.tsx  Celebratory overlay shown when a prize is claimed
│   │   │   │   ├── EmojiReactionBar.tsx  Floating emoji reaction system
│   │   │   │   └── MuteToggle.tsx    Audio mute button (Phase 2 — rendered but inactive in Phase 1)
│   │   │   │
│   │   │   ├── agent/                 Agent-specific components
│   │   │   │   ├── BookingRequestCard.tsx  Actionable card in the live booking queue
│   │   │   │   ├── WalletDisplay.tsx  Wallet balance display with low-balance alert
│   │   │   │   ├── WhatsAppTemplates.tsx  1-click copy WhatsApp message templates
│   │   │   │   └── TopUpRequestForm.tsx  Wallet top-up request submission form
│   │   │   │
│   │   │   ├── operator/              Operator-specific components
│   │   │   │   ├── SpeedSlider.tsx    Draw interval speed control slider
│   │   │   │   ├── PauseButton.tsx    Emergency pause/resume toggle
│   │   │   │   ├── SystemHealth.tsx   WebSocket ping indicator and player count
│   │   │   │   └── WinnersFeed.tsx    Scrolling read-only winner announcements terminal
│   │   │   │
│   │   │   └── admin/                 Admin/Superadmin-specific components
│   │   │       ├── GameBuilderWizard.tsx  3-step game creation form
│   │   │       ├── PrizePoolBuilder.tsx   Dynamic prize entry form with validation
│   │   │       ├── UserManagementGrid.tsx  Filterable admin user table
│   │   │       ├── TopUpQueue.tsx     Agent top-up approval queue
│   │   │       ├── AuditLogViewer.tsx  Paginated, filterable audit trail
│   │   │       ├── ThemeSwitcher.tsx  Global theme selector
│   │   │       └── ProfitDistribution.tsx  MOD profit split visualization widget
│   │   │
│   │   ├── hooks/                     Custom React hooks
│   │   │   ├── useSSE.ts              Manages an EventSource connection for live game data
│   │   │   │                          Handles: connect, disconnect, auto-reconnect, state hydration
│   │   │   ├── useSocket.ts           Manages a Socket.io connection for Operator/Agent
│   │   │   ├── usePolling.ts          Polls an endpoint every N seconds (used for booking status)
│   │   │   ├── useWakeLock.ts         Requests the Screen Wake Lock API during live game
│   │   │   ├── useCountdown.ts        Generic countdown timer returning seconds remaining
│   │   │   ├── useTicketAutoMark.ts   Watches drawnNumbers and highlights matching ticket cells
│   │   │   └── useLocalBooking.ts     Reads/writes booking data from localStorage (Zustand persist)
│   │   │
│   │   ├── store/                     Zustand global state stores
│   │   │   ├── gameStore.ts           Live game state (drawn numbers, prizes, game status)
│   │   │   ├── bookingStore.ts        Player's active booking (persisted to localStorage)
│   │   │   ├── ticketGridStore.ts     All tickets for the current game (real-time statuses)
│   │   │   ├── authStore.ts           Admin authentication state
│   │   │   ├── agentQueueStore.ts     Agent's live booking request queue
│   │   │   └── operatorStore.ts       Operator's live HUD state
│   │   │
│   │   ├── lib/                       Utility and helper functions
│   │   │   ├── api.ts                 Centralized API call wrapper (handles auth headers, errors)
│   │   │   ├── whatsapp.ts            Builds wa.me deep-link URLs with pre-filled messages
│   │   │   ├── ticket.ts              Ticket grid rendering helpers (parse JSON grid, find numbers)
│   │   │   ├── profanity.ts           Regex-based profanity filter for Housie Name validation
│   │   │   └── formatters.ts          Currency formatting (₹), date/time formatting utilities
│   │   │
│   │   ├── styles/
│   │   │   ├── globals.css            Global CSS reset and base styles
│   │   │   └── themes/
│   │   │       ├── default.css        CSS :root variables — Default theme
│   │   │       ├── dark.css           CSS :root variables — Dark Mode theme
│   │   │       ├── festive.css        CSS :root variables — Festive/Dashain/Diwali theme
│   │   │       └── classic-hall.css   CSS :root variables — Classic Hall theme
│   │   │
│   │   └── middleware.ts              Next.js edge middleware — intercepts requests to /admin/*
│   │                                  and redirects unauthenticated users to /admin/login
│   │
│   └── Dockerfile                     Containerizes the Next.js frontend
│
├── backend/                           The Node.js + Express.js server
│   │
│   ├── package.json                   Backend dependencies (express, pg, redis, socket.io, jsonwebtoken, node-cron)
│   ├── tsconfig.json                  TypeScript configuration
│   │
│   ├── src/
│   │   │
│   │   ├── app.ts                     Express application entry point
│   │   │                              Creates the Express app, attaches middleware, mounts all routers
│   │   │
│   │   ├── server.ts                  HTTP server entry point
│   │   │                              Creates the HTTP server, attaches Socket.io, starts listening
│   │   │
│   │   ├── config/
│   │   │   ├── env.ts                 Reads and validates all environment variables (throws on missing)
│   │   │   └── constants.ts           App-wide constants (LOCK_DURATION_MS, MAX_LOCK_ATTEMPTS, etc.)
│   │   │
│   │   ├── db/
│   │   │   ├── index.ts               PostgreSQL connection pool (pg.Pool)
│   │   │   ├── redis.ts               Redis client + pub/sub channel setup
│   │   │   └── migrate.ts             Runs SQL migration files in order on startup
│   │   │
│   │   ├── middleware/
│   │   │   ├── authenticate.ts        Reads JWT from HttpOnly cookie, verifies signature, attaches user to req
│   │   │   ├── authorize.ts           Checks req.user.role_id against required roles for the route
│   │   │   ├── rateLimiter.ts         express-rate-limit: IP-based limits per endpoint
│   │   │   └── auditLogger.ts         After every POST/PUT/DELETE, writes a row to the Audit_Log table
│   │   │
│   │   ├── modules/                   Feature-based modules (each has routes, controller, service)
│   │   │   │
│   │   │   ├── auth/
│   │   │   │   ├── auth.routes.ts     POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me
│   │   │   │   ├── auth.controller.ts  Handles request/response for auth endpoints
│   │   │   │   └── auth.service.ts    Business logic: verify credentials, issue JWT, revoke JWT
│   │   │   │
│   │   │   ├── users/
│   │   │   │   ├── users.routes.ts    CRUD routes for user management
│   │   │   │   ├── users.controller.ts
│   │   │   │   └── users.service.ts   Creates users, generates temp passwords, sends credentials via email
│   │   │   │
│   │   │   ├── games/
│   │   │   │   ├── games.routes.ts    GET /api/games, POST, PUT, DELETE, publish, postpone
│   │   │   │   ├── games.controller.ts
│   │   │   │   └── games.service.ts   Game lifecycle management (state transitions, validation)
│   │   │   │
│   │   │   ├── tickets/
│   │   │   │   ├── tickets.routes.ts  GET /api/games/:id/tickets (real-time grid data)
│   │   │   │   ├── tickets.controller.ts
│   │   │   │   └── tickets.service.ts  Ticket generation algorithm (valid 9×3 Housie grid per game rules)
│   │   │   │
│   │   │   ├── bookings/
│   │   │   │   ├── bookings.routes.ts  POST lock, GET status, POST cancel
│   │   │   │   ├── bookings.controller.ts
│   │   │   │   └── bookings.service.ts  Concurrency engine (SELECT FOR UPDATE), P2P WhatsApp link gen,
│   │   │   │                            Round-Robin agent assignment
│   │   │   │
│   │   │   ├── wallet/
│   │   │   │   ├── wallet.routes.ts   GET balance, POST top-up request, POST approve, POST adjust
│   │   │   │   ├── wallet.controller.ts
│   │   │   │   └── wallet.service.ts  ACID wallet transactions, top-up queue management
│   │   │   │
│   │   │   ├── engine/                The Automated Game Engine — the heart of the platform
│   │   │   │   ├── conductor.ts       The draw tick timer (setInterval with configurable ms)
│   │   │   │   │                      Reads game state from Redis, pops next number, broadcasts, saves to DB
│   │   │   │   ├── rng.ts             CSPRNG Fisher-Yates shuffle — generates the draw_sequence array
│   │   │   │   ├── winDetector.ts     Pattern evaluation engine — runs after every draw tick
│   │   │   │   │                      Checks all tickets for: Quick5, TopLine, MiddleLine, BottomLine,
│   │   │   │   │                      Corners, FullHouse. Returns winners array.
│   │   │   │   └── broadcaster.ts     Publishes draw events to Redis Pub/Sub channel
│   │   │   │                          Relays to SSE connections (Player) and Socket.io rooms (Operator)
│   │   │   │
│   │   │   ├── analytics/
│   │   │   │   ├── analytics.routes.ts
│   │   │   │   ├── analytics.controller.ts
│   │   │   │   └── analytics.service.ts  Revenue queries, profit distribution calculations
│   │   │   │
│   │   │   ├── theming/
│   │   │   │   ├── theming.routes.ts  GET current theme, PUT switch theme
│   │   │   │   ├── theming.controller.ts
│   │   │   │   └── theming.service.ts  Updates global theme variable in DB, broadcasts theme change
│   │   │   │
│   │   │   └── audit/
│   │   │       ├── audit.routes.ts    GET /api/audit-log (paginated, filterable)
│   │   │       ├── audit.controller.ts
│   │   │       └── audit.service.ts   Reads from Audit_Log table with filters
│   │   │
│   │   ├── realtime/
│   │   │   ├── sseManager.ts          Manages a Map of active SSE connections (keyed by game_id)
│   │   │   │                          Provides: addClient(), removeClient(), broadcastToGame()
│   │   │   └── socketManager.ts       Socket.io server setup
│   │   │                              Defines rooms (game:{id}:operators, game:{id}:agents)
│   │   │                              Handles: join-room, speed-change, pause-game events
│   │   │
│   │   └── jobs/
│   │       ├── expirySweeperJob.ts    Cron: runs every 30 seconds
│   │       │                          SELECT * FROM Bookings WHERE locked_until < NOW() AND status = 'Locked'
│   │       │                          → Sets status = 'Cancelled', releases tickets back to Available
│   │       └── backupJob.ts           Cron: runs at 3:00 AM IST
│   │                                  Executes pg_dump to /backups/housie-ghar-{date}.sql
│   │
│   ├── migrations/                    SQL migration files run in numeric order
│   │   ├── 001_create_roles.sql
│   │   ├── 002_create_users.sql
│   │   ├── 003_create_games.sql
│   │   ├── 004_create_prize_pools.sql
│   │   ├── 005_create_tickets.sql
│   │   ├── 006_create_bookings.sql
│   │   ├── 007_create_wallet_ledger.sql
│   │   ├── 008_create_game_logs.sql
│   │   ├── 009_create_audit_log.sql
│   │   └── 010_create_themes.sql
│   │
│   ├── seeds/                         Sample data for development and testing
│   │   ├── seed_roles.sql
│   │   ├── seed_superadmin.sql        Creates a default Superadmin account
│   │   └── seed_sample_game.sql
│   │
│   └── Dockerfile                     Containerizes the Express backend
│
└── backups/                           Local PostgreSQL backup files (auto-generated, not committed to Git)
```

---

## CHAPTER 4: SINGLE-PAGE ARCHITECTURE — SECTION LAYOUT

This is one of the most important architectural decisions confirmed for Phase 1. Instead of routing Players to separate pages (e.g., `/games`, `/winners`, `/how-to-play`), all public-facing content is presented as **scrollable sections within a single `index` page**. Admin dashboards are accessible via a discrete login link and exist at `/admin/*` routes.

### 4.1 Why Single-Page Sections?

- **Simplicity for local deployment:** Fewer routes to manage, easier to navigate during a LAN game night.
- **Performance:** The entire public experience loads at once. Scrolling between sections is instant with no network round-trips.
- **Engagement:** Players can scroll from the lobby to the live game without navigating away, keeping them immersed.

### 4.2 The Public Index Page — Section Map

The `src/app/page.tsx` file renders these sections sequentially. Each section has an `id` attribute for anchor-link navigation from the top navbar.

```
http://[local-ip]/
│
├── Section: #hero
│   The Hero Banner
│   - Dynamic countdown timer to the next scheduled game
│   - Prominent "Mega Game" title and prize pool teaser
│   - "Book Now" CTA button (smooth scrolls to #games)
│
├── Section: #games
│   The Games Lobby
│   - Scrollable horizontal or vertical feed of GameCard components
│   - Each GameCard: Title, Date/Time, Ticket Price, Progress Bar, Prize Dropdown
│   - Clicking a GameCard navigates to /game/[game_id] (the only external page link from index)
│   - Live WebSocket update: ticket fill percentages update in real-time without page refresh
│
├── Section: #how-to-play
│   How To Play
│   - Static content explaining Housie rules, winning patterns, and the booking process
│   - Step-by-step visual guide
│   - FAQ about the P2P WhatsApp payment flow
│
├── Section: #winners
│   Hall of Fame
│   - Grid of recent winners (Housie Name, Prize Won, Game Title, Date)
│   - Pulled from the database (SSG: regenerated every build, or SSR on every request)
│
└── Section: #live
    Embedded Live Game Viewer
    - If a game is currently Live, this section shows the live board (number display, number history)
    - Players without a ticket can still watch the draw in real-time
    - Players with a confirmed ticket see a "Go to My Ticket" button linking to their ticket view
    - If no game is live, this section shows "Next game starts in [countdown]"
```

### 4.3 The Admin Panel — Separate Route Group

The admin interface is not part of the index page. It exists at `/admin/*` and is a completely separate, protected shell with its own layout (sidebar navigation, top bar). It is accessed via the discrete "Staff Login" icon in the top navbar.

```
http://[local-ip]/admin/login         Staff login form (accessible to all, but JWT needed beyond here)
http://[local-ip]/admin/superadmin/   Superadmin Dashboard (requires role: Superadmin)
http://[local-ip]/admin/admin/        Admin Dashboard (requires role: Admin or Superadmin)
http://[local-ip]/admin/operator/     Operator Dashboard (requires role: Operator+)
http://[local-ip]/admin/agent/        Agent Workspace (requires role: Agent+)
```

The Next.js middleware (`src/middleware.ts`) intercepts every request to `/admin/*`. If the request does not carry a valid JWT cookie, the user is immediately redirected to `/admin/login`. If they carry a valid JWT but try to access a route above their role (e.g., an Agent trying to access `/admin/superadmin`), they receive a 403 page.

### 4.4 The Game Room — The Only External Public Route

The Ticket Selection Grid has its own dedicated URL:

```
http://[local-ip]/game/[game_id]
```

This is because each game has unique data (its tickets, prize pool, status) that requires a game-specific URL. When a Player clicks a GameCard in the `#games` section, they navigate here. After completing their booking, they return to the index page (their ticket is accessible via the `#live` section or a "My Tickets" persistent banner).

---

## CHAPTER 5: ROLE-BASED ACCESS CONTROL (RBAC)

### 5.1 The Five-Tier Hierarchy — Conceptual Explanation

The RBAC system is the security skeleton of Housie Ghar. Every user of the backend system is assigned exactly one role. That role defines what they can see, what they can do, and what API endpoints they can call.

The hierarchy is strictly vertical — higher roles inherit lower role capabilities but are not required to exercise them. The key principle is **compartmentalization**: an Agent can never accidentally (or maliciously) access a financial ledger; an Operator can never accidentally modify a prize pool.

```
┌─────────────────────────────────────────────────────────┐
│  LEVEL 1: SUPERADMIN                                    │
│  Full unrestricted CRUD across entire platform          │
│  ┌─────────────────────────────────────────────────┐   │
│  │  LEVEL 2: ADMIN                                 │   │
│  │  Operations & workforce management              │   │
│  │  ┌─────────────────────────────────────────┐   │   │
│  │  │  LEVEL 3: OPERATOR                      │   │   │
│  │  │  Live game execution only               │   │   │
│  │  │  ┌─────────────────────────────────┐   │   │   │
│  │  │  │  LEVEL 4: AGENT                 │   │   │   │
│  │  │  │  Sales & ticket fulfillment     │   │   │   │
│  │  │  │  ┌─────────────────────────┐   │   │   │   │
│  │  │  │  │  LEVEL 5: PLAYER        │   │   │   │   │
│  │  │  │  │  No login required      │   │   │   │   │
│  │  │  │  └─────────────────────────┘   │   │   │   │
│  │  │  └─────────────────────────────────┘   │   │   │
│  │  └─────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 5.2 Level 1 — Superadmin (Ultimate Authority)

**Who holds this role:** MOD founding members only. This account is created via the database seed script on initial setup and never through the UI.

**What they can do:**
- Create, edit, suspend, and permanently delete any Admin account
- Create, manage, and terminate any Operator and Agent account
- View the complete, global financial ledger including every wallet transaction across all Agents
- Approve or reject Agent wallet top-up requests with full verification
- Manually add or deduct funds from any Agent's wallet (requires a mandatory reason for audit)
- Switch the platform's global CSS theme instantly (Default, Dark, Festive, Classic Hall)
- Edit global platform variables (support contact, terms, marquee text)
- Upload custom audio files for numbers 1–90 (Phase 2 feature — architecture present in Phase 1)
- Batch-upload 90 audio files via ZIP file upload
- Start, force-pause, or forcefully terminate any game at any time
- Manually enter a specific number into the live draw (emergency override)
- Manually book a ticket for a Player (in case of P2P system failure)
- Adjust the RNG draw speed before or during a live game
- View the master, immutable audit trail of every backend action
- Access the Emergency Console for any live game (force-pause, manual number push, bulk refund)

**What they cannot do:**
- Play the game as a Player (role conflict — Superadmins are staff only)

### 5.3 Level 2 — Admin (Operations Manager)

**Who holds this role:** Trusted operational managers appointed by Superadmins.

**What they can do:**
- Create, edit, and manage Operator and Agent accounts under their jurisdiction
- Generate temporary login credentials for Operators and Agents (system auto-emails them)
- Reset passwords for Operators and Agents
- Create new game instances using the 3-step Game Builder Wizard
- Edit game parameters (title, date, time, capacity, ticket price, prize pool) while the game is in `Scheduled` state only
- Publish games to the public lobby
- Postpone a game and notify all players in the waiting room
- Approve Agent wallet top-up requests (after verifying the bank transfer)
- View all Agents under their jurisdiction and their wallet balances and daily sales figures
- Use the "Force Assign" feature to manually issue tickets to a Player when an Agent is non-responsive

**What they cannot do:**
- Create or manage other Admin accounts (Superadmin-exclusive)
- View global financial analytics or the profit distribution module
- Manually adjust Agent wallets without an active top-up request (prevents embezzlement)
- Edit any game parameters once the game status changes to `Live`
- Access the global theming or audio management system

### 5.4 Level 3 — Operator (Live Game Host)

**Who holds this role:** Staff members assigned to host specific games. An Operator is assigned to a game by an Admin during the Game Builder Wizard.

**What they can do:**
- View a list of all games assigned to their `operator_id`
- Access the Pre-Game Lobby for a game up to 15 minutes before its scheduled start time
- Run the pre-game system health checklist (audio test, WebSocket ping)
- Monitor the real-time player count in the waiting room
- Click "Start Game" once the scheduled time arrives and the checklist is complete
- Monitor the Live Execution HUD (current number, next number, player count, speed setting)
- Adjust the draw interval in real-time using the Speed Slider (5s–12s)
- Trigger Emergency Pause / Resume to halt and restart the automated draw
- View the read-only Winners Feed as prizes are auto-claimed
- Schedule new games under their own Operator ID

**What they cannot do:**
- Access any financial information (wallets, top-ups, ledgers)
- View or manage Agents or other Users
- Modify prize pool values once a game is Live
- Access games not assigned to their `operator_id`
- Verify or reject ticket bookings (Agent's responsibility)

### 5.5 Level 4 — Agent (Sales Frontline)

**Who holds this role:** Entrepreneurial local individuals onboarded by an Admin. They are the financial bridge between Players and the platform.

**What they can do:**
- View their real-time live booking queue (requests assigned to them via Round-Robin)
- View each request card (Booking ID, Player Housie Name, Game, Tickets, Amount, Countdown Timer)
- Click "Confirm Payment" to approve a booking after receiving UPI payment on WhatsApp
- Click "Reject/Expire" to release tickets back to the pool if a Player does not pay
- Use 1-Click WhatsApp Template buttons to send standardized messages to Players
- View their complete wallet balance and transaction history
- Submit a wallet top-up request to Admins/Superadmins
- Flag a booking as "Spam" for repeat non-paying Players
- View their daily sales summary (tickets sold, estimated commission)

**What they cannot do:**
- Access game configuration or scheduling tools
- View other Agents' queues, wallets, or sales data
- Access the live game engine or RNG controls
- View global platform analytics
- Confirm a booking if their wallet balance is insufficient

### 5.6 Level 5 — Player (End User)

**Who holds this role:** Everyone else. Players have no account and no persistent identity beyond their session.

**Player identity is established through:**
- Their chosen Housie Name (set during the booking process)
- Their `booking_id` (generated by the backend when they lock tickets)
- `localStorage` on their device (saves `booking_id` and Housie Name)

**What they can do:**
- View the public lobby (all public sections of the index page)
- Browse scheduled games and their prize pools
- Click into a Game Room to view and select tickets
- Enter a Housie Name and click "Book Now" to initiate the P2P payment process
- Receive the WhatsApp deep-link to an Agent and complete payment
- Watch the soft-lock countdown timer while payment is being processed
- See the success screen with their digital ticket after the Agent confirms payment
- Watch the live game draw on the `#live` section of the index page
- Return to the site after closing their browser and retrieve their tickets via `localStorage`

**What they cannot do:**
- Access any admin route or dashboard
- See other players' tickets or Housie Names (until a winner is announced)
- Call or manipulate the game draw in any way

### 5.7 Permissions Matrix — Complete Reference

| Capability | Superadmin | Admin | Operator | Agent | Player |
|---|:---:|:---:|:---:|:---:|:---:|
| Create Admin accounts | ✅ | ❌ | ❌ | ❌ | ❌ |
| Suspend/delete Admin accounts | ✅ | ❌ | ❌ | ❌ | ❌ |
| Create Operator/Agent accounts | ✅ | ✅ | ❌ | ❌ | ❌ |
| Suspend/delete Operator/Agent | ✅ | ✅* | ❌ | ❌ | ❌ |
| View global financial analytics | ✅ | ❌ | ❌ | ❌ | ❌ |
| View profit distribution | ✅ | ❌ | ❌ | ❌ | ❌ |
| Approve wallet top-ups | ✅ | ✅* | ❌ | ❌ | ❌ |
| Manual wallet adjustment | ✅ | ❌ | ❌ | ❌ | ❌ |
| View audit log | ✅ | ❌ | ❌ | ❌ | ❌ |
| Switch global CSS theme | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage audio assets | ✅ | ❌ | ❌ | ❌ | ❌ |
| Edit global platform variables | ✅ | ❌ | ❌ | ❌ | ❌ |
| Create/schedule games | ✅ | ✅ | ✅** | ❌ | ❌ |
| Edit pending game parameters | ✅ | ✅ | ✅** | ❌ | ❌ |
| Publish game to public lobby | ✅ | ✅ | ❌ | ❌ | ❌ |
| Assign Operator to game | ✅ | ✅ | ❌ | ❌ | ❌ |
| Postpone a game | ✅ | ✅ | ❌ | ❌ | ❌ |
| Start live game | ✅ | ❌ | ✅** | ❌ | ❌ |
| Pause/resume live game | ✅ | ❌ | ✅** | ❌ | ❌ |
| Adjust draw speed live | ✅ | ❌ | ✅** | ❌ | ❌ |
| Force terminate game | ✅ | ❌ | ❌ | ❌ | ❌ |
| Emergency manual number push | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manually book a ticket | ✅ | ✅ | ❌ | ❌ | ❌ |
| Force-assign ticket (fraud case) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Confirm/reject booking | ❌ | ❌ | ❌ | ✅** | ❌ |
| View own booking queue | ❌ | ❌ | ❌ | ✅** | ❌ |
| Request wallet top-up | ❌ | ❌ | ❌ | ✅** | ❌ |
| Flag player as spam | ❌ | ❌ | ❌ | ✅** | ❌ |
| Book tickets / view game | ❌ | ❌ | ❌ | ❌ | ✅ |
| Watch live draw | ✅ | ✅ | ✅ | ✅ | ✅ |

*Admin actions scoped to their own jurisdiction (cannot manage Admins of the same level)
**Operator/Agent actions scoped to their own `operator_id` / `agent_id`

### 5.8 Security Enforcement — Two Layers

**Layer 1 — Frontend UI (UX protection):** Role-aware navigation and component rendering. An Agent never sees an "Edit Game" button. An Operator never sees a "Wallet" tab. This prevents accidental navigation but is not the security boundary.

**Layer 2 — Backend API (True security boundary):** Every protected API endpoint validates the JWT and checks `role_id` before executing any database operation. Even if someone bypasses the UI and calls the API directly with a forged request, the backend independently rejects it with HTTP 403 Forbidden. Frontend UI hiding alone is never sufficient.

---

## CHAPTER 6: MODULE 1 — PLAYER INTERFACE & BOOKING ENGINE

This module covers everything a Player experiences from landing on the site to completing a ticket booking.

### 6.1 The Landing Page Sections (Public Index Page)

#### 6.1.1 Global Navigation Bar

The navigation bar is sticky — it remains fixed at the top of the viewport as the Player scrolls. It contains:

- **Brand Logo** (top-left): Clicking it scrolls the page back to the top (`#hero` section).
- **Navigation Links** (center): "Home" (→ `#hero`), "Games" (→ `#games`), "Winners" (→ `#winners`), "How to Play" (→ `#how-to-play`). These are smooth-scroll anchor links — no page navigation.
- **Staff Login Icon** (far right): A discrete padlock or silhouette icon. Clicking it navigates to `/admin/login`. It is intentionally subtle — not prominently labeled — to discourage Players from clicking it.

#### 6.1.2 Hero Section (`#hero`)

The first thing every visitor sees. Must communicate excitement, trust, and urgency.

Contents:
- Platform name ("Housie Ghar") with the MOD branding tag
- A dynamic marquee (scrolling text banner) with customizable text set by the Superadmin
- If a Mega Game is scheduled within 24 hours: a prominent countdown timer (HH:MM:SS) displaying time until that game starts, with the game title and top prize amount displayed alongside it
- If no Mega Game is imminent: a static welcome banner with the platform tagline
- A "Browse Games" CTA button that smooth-scrolls to the `#games` section

#### 6.1.3 Games Section (`#games`)

This is the primary conversion funnel — where Players decide which game to book.

**Game Card Component:** Each upcoming game is represented as a card. Cards are ordered by scheduled time (soonest first). Cards for games in `Completed` or `Cancelled` state are not shown. Cards for `Live` games are shown with a pulsing "LIVE" badge.

Each Game Card displays:
- **Game Title** (e.g., "Friday Night Fever") — large and prominent
- **Date and Start Time** — clearly displayed (e.g., "Friday, June 6 · 8:00 PM")
- **Ticket Price** (e.g., "₹50 / Ticket") — clear, no hidden fees
- **Dynamic Progress Bar:** Shows `(Sold + Locked Tickets) / Total Tickets` as a percentage fill. Updates in real-time via WebSocket — no page refresh needed.
- **Urgency Badges:**
  - At 80% full: an animated orange badge reading "Fast Filling!"
  - At 100%: card grays out with a red "Sold Out" stamp and becomes unclickable
  - If game is `Live`: card shows a pulsing green "LIVE NOW" badge; clicking it smooth-scrolls to `#live`
- **Collapsible Prize Pool Dropdown:** A small arrow icon in the card footer. Clicking it expands a list showing all prize categories and their amounts (e.g., "1st Full House: ₹5,000 | Top Line: ₹1,000 | Early Five: ₹500"). Clicking again collapses it.
- **"Book Now" Button:** Only enabled when game is in `Scheduled` state. Clicking navigates to `/game/[game_id]`.

#### 6.1.4 How to Play Section (`#how-to-play`)

Static educational content. Renders as a visually appealing step-by-step guide:

1. Browse games and select your preferred game
2. Choose your tickets from the grid
3. Enter your Housie Name
4. Click "Book Now" — you'll be connected to a local Agent via WhatsApp
5. Send your payment via UPI to the Agent
6. Agent confirms → your ticket is locked in
7. Join the live draw and watch for your numbers

Also includes:
- Visual explanation of the 9×3 ticket grid
- List of winning patterns with diagrams
- FAQ: "What if I accidentally close the tab?" → "Your ticket is saved. Just come back to Housie Ghar and tap 'My Tickets'."
- FAQ: "What is a Housie Name?" → Explanation of the nickname system

#### 6.1.5 Winners Section (`#winners`)

A Hall of Fame showing the most recent winners across all games. Each entry shows:
- Housie Name of the winner
- Prize won (e.g., "1st Full House")
- Amount won (e.g., "₹5,000")
- Game title (e.g., "Sunday Blockbuster")
- Date

This data is fetched from the database. The section builds community trust and excitement — seeing real names and real prize amounts makes the platform feel legitimate and rewarding.

#### 6.1.6 Live Game Section (`#live`)

An embedded live game board that shows the current draw in real-time.

**If a game is currently Live:**
- The Tambola Cage animation plays (a CSS-animated rotating ball machine)
- The most recently drawn number is displayed prominently in the center
- A grid of all numbers 1–90 is shown; called numbers are highlighted
- A scrolling "Last 5 Numbers" list shows recent draw history
- A scrolling Winners Feed shows prizes claimed so far
- If the Player has a confirmed ticket for this game: a "Show My Ticket" button appears (inline ticket view with auto-marked numbers)
- The emoji reaction bar is active

**If no game is currently Live:**
- Shows "Next game starts in [countdown]" for the next scheduled game
- A "Book Your Ticket" button linking to the game's Game Room

### 6.2 The Game Room (`/game/[game_id]`)

When a Player clicks "Book Now" on a Game Card, they navigate to the dedicated Game Room page for that game. This page has one purpose: ticket selection and booking initiation.

#### 6.2.1 Page Header

- Game title prominently displayed
- Date and time of draw
- Ticket price per ticket
- A real-time player count ("247 players joined")
- A live progress bar showing how full the game is

#### 6.2.2 Ticket Grid

The core of the Game Room. All tickets for this game are displayed in a responsive grid.

**Grid layout:**
- Desktop: 6 columns
- Tablet: 4 columns
- Mobile: 3 columns (optimized for thumb-tapping)

**Each ticket square shows:**
- The ticket number (e.g., "#042")
- A state-based visual style (see table below)

| State | Visual Style | Icon | Interaction |
|---|---|---|---|
| Available | Clean white/light background, strong border | None | Tappable; tap to select |
| Selected | Thick colored border (gold/orange), highlighted | Checkmark ✓ | Tap again to deselect |
| Locked | Yellow/amber background | 🔒 spinning loader | Not tappable |
| Sold | Grey background, opacity 50% | ✕ strikethrough | Not tappable |

**Important accessibility rule:** Status must never be conveyed by color alone. The icon is mandatory alongside the color change.

**Real-time updates:** The grid is connected to an SSE stream for this `game_id`. If another Player on the network books Ticket #042 right now, Ticket #042 on every other Player's screen instantly turns Locked — no page refresh, no manual polling.

#### 6.2.3 Sticky Action Footer

As soon as a Player selects at least one ticket, a fixed footer panel slides up from the bottom of the screen. It stays visible even as the Player scrolls the ticket grid.

Footer contents:
- **Selected tickets count** (e.g., "3 Tickets Selected")
- **Total amount** (e.g., "Total: ₹150") — recalculates dynamically as tickets are added/removed
- **Housie Name input field:**
  - Placeholder text: something culturally warm and localized (e.g., "Your Housie nickname — e.g., HillBoy99")
  - Required: cannot be empty
  - Minimum 3 characters, maximum 20 characters
  - Profanity filter: validated against a regex list; invalid names show a gentle error ("Please choose a friendlier name!")
  - This field gets autofocus on mobile when the footer appears
- **"Book Now" button:** Disabled until Housie Name is valid. When enabled, tapping it triggers the booking lock sequence.

#### 6.2.4 The Booking Lock Sequence (Concurrency Engine)

This is the most technically critical moment of the booking flow. When the Player taps "Book Now":

**Step 1 — Frontend sends POST request:**
The frontend sends `POST /api/bookings/lock` with `{ ticket_ids: [42, 87, 103], housie_name: "HillBoy99", game_id: "..." }`.

**Step 2 — Backend concurrency check:**
The backend opens a PostgreSQL transaction and executes `SELECT * FROM Tickets WHERE ticket_id IN (42, 87, 103) FOR UPDATE`. This line is crucial — it places a pessimistic lock on those three rows. No other database transaction can touch those rows until this one completes.

The backend then checks: are all three tickets still `Available`?
- **If yes:** Updates them to `Locked`, creates a `Bookings` record, commits the transaction. Returns `{ booking_id, locked_until, agent_phone, agent_name }`.
- **If no (one or more were taken):** Rolls back the transaction. Returns an error indicating which tickets are no longer available. The frontend highlights those tickets in red and removes them from the selection. The Player must pick different ones.

**Step 3 — Lock Screen Modal appears:**
The booking returns successfully. The entire Game Room UI is overlaid by a non-dismissible modal (the Player cannot close it or navigate away). The modal shows:
- A large countdown timer (10:00 → 00:00, ticking second by second)
- "Tickets reserved! Pay within [timer] to confirm."
- The total amount owed
- The Agent's name (for familiarity and trust)
- A prominent "Open WhatsApp" button (which fires the wa.me deep link)

**Step 4 — WhatsApp deep link fires:**
Simultaneously with the modal appearing, the frontend constructs and triggers:
```
https://wa.me/[Agent_Phone]?text=Hi!%20I%20am%20HillBoy99.%20I%20want%20to%20book...
```
The Player's device opens WhatsApp with the pre-typed message ready to send. The Player sends it, transfers the UPI payment, and waits.

**Step 5 — Background polling:**
While the Player is in WhatsApp, the Housie Ghar browser tab (still open in the background) polls `/api/bookings/status/[booking_id]` every 3–5 seconds.

**Step 6 — Booking confirmed:**
The Agent confirms payment on their dashboard → `booking_status` → `Sold` in the database. The next poll from the frontend detects the change. The countdown timer is destroyed. The modal transitions to a full-screen green success animation with confetti. The Player's digital tickets are displayed with their Housie Name stamped on each one. The tickets are now theirs.

**Step 7 — Lock expiry (if Player doesn't pay):**
If the 10-minute timer reaches zero and the Agent has not confirmed payment, the backend cron job automatically cancels the booking. The modal shows "Time's up! Your reservation expired. Please try again." The tickets return to `Available` in the grid.

#### 6.2.5 Local Storage Persistence

Immediately after the booking lock is confirmed, the following is saved to `localStorage`:
```json
{
  "booking_id": "BKG-8842",
  "housie_name": "HillBoy99",
  "game_id": "...",
  "ticket_ids": [42, 87, 103],
  "booking_status": "locked"
}
```
If the Player closes their browser and returns hours later, the Zustand `bookingStore` (with persist middleware) reads this data and shows a "My Tickets" banner at the top of the index page, allowing them to retrieve their confirmed tickets instantly.

---

## CHAPTER 7: MODULE 2 — AUTOMATED GAME ENGINE

The Game Engine is the technological core of Housie Ghar. It operates entirely autonomously once the Operator clicks "Start Game." No human intervention is required or expected until the game ends.

### 7.1 Game State Machine — Immutable Transitions

A game instance exists in exactly one state at any moment. State transitions are strictly controlled and enforced at the database level.

```
                 Admin publishes
Scheduled ──────────────────────► [Scheduled]
                                        │
                         Operator clicks "Start Game"
                                        ▼
                                    [Live] ◄──────────────────────────┐
                                      │  │                            │
                        Operator pause│  │ Operator/Superadmin resume │
                                      ▼  └────────────────────────────┘
                                  [Paused]
                                      │
                   All prizes claimed (automatic) OR
                   Superadmin force terminates
                                      ▼
                                 [Completed]

         Admin/Superadmin intervenes (only from Scheduled state)
                                      │
                              [Postponed]
                                      │
                         Admin sets new date/time
                                      ▼
                              [Scheduled] (loop)
```

**State-based rules:**
- In `Scheduled`: Admins can edit all parameters; Players can book tickets; Agents can confirm bookings
- In `Live`: No edits allowed to any game parameter; booking is locked; draw is broadcasting
- In `Paused`: Draw is halted; WebSocket/SSE connection stays open; frontend shows "Game paused" overlay
- In `Completed`: Final leaderboard saved; WebSocket connection terminated gracefully; tickets become permanent records
- In `Postponed`: Same as Scheduled but all affected Players receive a WebSocket notification about the new time

### 7.2 The RNG Protocol — Step by Step

When the Operator clicks "Start Game," the following sequence occurs in the backend in under 100 milliseconds:

**Step 1 — Generate base array:**
Create `[1, 2, 3, 4, ..., 89, 90]` — an ordered array of all possible draw numbers.

**Step 2 — Apply Fisher-Yates Shuffle with CSPRNG:**
The Fisher-Yates algorithm iterates the array from right to left. For each position `i`, it generates a cryptographically secure random integer `j` between 0 and `i` (inclusive) using `crypto.randomInt(0, i + 1)`. It then swaps the values at positions `i` and `j`. After 90 iterations, the array is in a genuinely random order.

Example result: `[54, 7, 23, 88, 1, 42, 67, ...]` — 90 unique numbers, perfectly shuffled.

**Step 3 — Save to database BEFORE first broadcast:**
The complete `draw_sequence` array is saved to `Game_Logs.draw_sequence`. This happens before a single number is sent to any Player. This is a critical audit and crash-recovery mechanism.

**Step 4 — Save to Redis:**
The same sequence is stored in Redis under `game:{game_id}:draw_sequence` for fast in-memory access during the draw, and `game:{game_id}:sequence_index` is initialized to `0`.

**Step 5 — Update game status:**
`game_status` transitions to `Live` in the database. Booking is instantly locked for this game. The public lobby marks the game as Live.

### 7.3 The Conductor — Draw Tick Logic

The Conductor is a recurring timer function in the backend. Its job is to pop one number from the draw sequence, broadcast it, and wait for the next interval.

**The tick lifecycle (every N milliseconds):**

1. Read `game:{game_id}:interval_ms` from Redis → current draw speed
2. Read `game:{game_id}:sequence_index` from Redis → current position
3. Read the `draw_sequence` from Redis at that index position → next number to draw
4. **Broadcast the number:** Publish `{ draw_number: 42, total_drawn: 15, timestamp: "..." }` to Redis Pub/Sub channel `game:{game_id}:draw`
5. **Save progress:** Append `42` to `game:{game_id}:drawn_numbers` in Redis AND write to `Game_Logs.drawn_numbers` in PostgreSQL
6. Increment `sequence_index` by 1 in Redis
7. **Trigger Win Detection:** Call the `winDetector` module (see §7.4)
8. **Check for completion:** If `sequence_index >= 90` OR if all defined prize categories are `Claimed`, trigger game completion
9. **Schedule next tick:** `setTimeout(conductorTick, interval_ms)` — using the current interval from Redis ensures the Speed Slider takes effect immediately

**Pause/Resume:**
- On Pause: Clear the pending `setTimeout`. Store the current `sequence_index`. Broadcast a `{ event: "paused" }` SSE event.
- On Resume: Read the stored `sequence_index`. Restart `setTimeout(conductorTick, interval_ms)`.

**Crash Recovery:**
If the Node.js process crashes during a live game, on restart the server checks the database for any games with `game_status = 'Live'`. For each such game, it reads the `drawn_numbers` array and `sequence_index` from `Game_Logs`, restores them to Redis, and restarts the Conductor from where it left off. Players experience a brief disconnection and then reconnect to the resumed draw.

### 7.4 The Win Detection Engine

After every draw tick, the backend runs the win detection evaluation against every ticket in the current game. This must complete within the draw interval (e.g., within 5 seconds) to not cause delays.

**Ticket data structure (stored as JSON in `Tickets.grid_data`):**
```
Row 1: [null, 12, null, 34, 45, null, 61, null, 88]
Row 2: [3, null, 25, null, 48, 55, null, 72, null]
Row 3: [7, 18, null, 39, null, null, 68, 77, null]
```
Each row has exactly 9 cells. Null represents a blank space. Each row has exactly 5 numbers and 4 blanks.

**Detection algorithm for each ticket:**

| Prize Pattern | Detection Logic |
|---|---|
| Early Five (Jaldi 5) | Extract all 15 non-null numbers from all rows. Intersect with `drawn_numbers[]`. If intersection.length >= 5 and this prize is not yet Claimed: winner. |
| Top Line | Extract 5 non-null numbers from Row 1. Check if all 5 are in `drawn_numbers[]`. |
| Middle Line | Extract 5 non-null numbers from Row 2. Check if all 5 are in `drawn_numbers[]`. |
| Bottom Line | Extract 5 non-null numbers from Row 3. Check if all 5 are in `drawn_numbers[]`. |
| Four Corners | Find first and last non-null value in Row 1 (2 numbers) and first and last non-null value in Row 3 (2 numbers). Check if all 4 are in `drawn_numbers[]`. |
| Full House | Extract all 15 non-null numbers. Check if all 15 are in `drawn_numbers[]`. |

**On winning pattern detected:**

1. **Lock the prize category:** Mark `Prize_Pool.claimed = true` and set `winner_ticket_id`. This prize will no longer be evaluated.
2. **Check for ties:** If two or more tickets achieve the same pattern on the same draw tick (identical numbers appeared on the same draw), both are winners. The prize amount is split equally.
3. **Broadcast the win event:** Publish `{ event: "winner", prize: "Top Line", housie_name: "HillBoy99", ticket_id: 105, amount: 1000 }` to all connected clients.
4. **Add a 4-second pause to the Conductor:** The `setTimeout` for the next draw tick is extended by 4,000ms to give all clients time to display the winner celebration animation before the next number is drawn.
5. **Write to database:** The win is permanently recorded in `Prize_Pool` with the winner's ticket ID, Housie Name, amount, and timestamp.

**Performance consideration:** For a game with 500 tickets, each draw tick evaluates up to 500 tickets × 6 patterns = 3,000 checks. Each check is a simple array intersection — this is computationally trivial and completes in milliseconds.

### 7.5 Audio-Visual Synchronization (Phase 2 Architecture — Phase 1 Visual Only)

In Phase 1, there is no audio. However, the visual synchronization system is built:

**Phase 1 visual sequence (per draw tick):**
1. Backend broadcasts the draw number via SSE
2. Frontend receives the number
3. The Tambola Cage animation plays (ball bouncing, spinning)
4. After a 1,200ms delay ("the tease"): the number appears on the `CurrentNumber` display
5. The `NumberBoard` grid highlights the drawn number
6. The `PlayerTicket` component scans the ticket's `grid_data` and applies a CSS highlight to any matching cell
7. If the number completes a winning pattern: `WinnerAnnouncement` overlay appears

**Phase 2 addition:**
Between steps 2 and 3, the frontend checks the audio cache for `audio/{number}.mp3` and plays it immediately. The 1,200ms visual delay is specifically designed to create suspense — the audio calls the number first, the visual confirms it a moment later, exactly like a physical caller.

---

## CHAPTER 8: MODULE 3 — SUPERADMIN CONTROL CENTER

### 8.1 Executive Dashboard

The Superadmin lands here after logging in. It is a real-time operations HUD designed for bird's-eye awareness.

**Live Metrics Ribbon (top of page, auto-refreshing every 10 seconds):**

| Metric | Description | Data Source |
|---|---|---|
| Active Live Games | Count of games with `game_status = 'Live'` | PostgreSQL query |
| Concurrent Players | Total active SSE connections across all live games | Redis counter |
| Today's Gross Volume | Sum of (`ticket_price × sold_count`) for all games today | PostgreSQL query |
| Total Wallet Liability | Sum of `current_balance` for all active Agents | PostgreSQL query |

**Financial Data Visualizations:**

- **Sales Line Chart:** Rendered using Chart.js. Three views: 7 days, 30 days, 90 days. X-axis = date, Y-axis = total ticket sales value. Toggle between views without page reload.
- **Profit Distribution Widget:** Calculates net profit (Gross Volume minus total prize payouts) and displays the MOD team's equal split. For example, if net profit is ₹10,000 and there are 5 founding members, each member's share (₹2,000) is displayed. This is a private widget visible only to Superadmins.

### 8.2 Global Configuration & Theming Engine

**Theme Switcher:**
A dropdown with four options: Default, Dark Mode, Festive, Classic Hall. Selecting a theme:
1. Saves the selected `theme_id` to the `Themes` table in the database
2. The frontend fetches the active theme on load and applies the CSS variable set
3. All connected clients (via a WebSocket broadcast) immediately switch themes — no refresh needed

**Global Variables Form:**
A simple form with editable fields:
- Support Email Address
- Support Phone Number
- Terms & Conditions text (textarea)
- Marquee Banner Text (the scrolling text on the public landing page)

Changes are saved to the database and take effect immediately on the next page load.

### 8.3 Workforce & Identity Management

**User Grid:** A filterable, sortable data table showing all users across all roles (except Players, who have no accounts). Columns: Name, Role, Contact, Assigned Games (count), Status (Active/Suspended), Last Login.

Filters available: Role, Status, Date Range (Last Login).

**Creating a New User:**
1. Superadmin fills in: Name, Email, Phone, Role
2. System generates a cryptographically random temporary password
3. System sends an email to the new user's email address with their login credentials
4. The new user is prompted to change their password on first login

**The Kill Switch:**
A "Suspend" button on every user row. Clicking it opens a confirmation modal: "Are you sure you want to suspend [Name]? This will immediately log them out of all devices."

On confirmation:
1. `Users.status` set to `Suspended` in the database
2. A backend function invalidates the user's JWT (stored revocation list in Redis, checked on every API call)
3. Any active Socket.io connection from that user is forcibly disconnected
4. The user is locked out within milliseconds — they cannot complete any in-progress action

### 8.4 Financial Hub — Wallet Top-Up Management

**The Top-Up Queue:**
Displays all pending Agent wallet top-up requests in chronological order. Each request shows:
- Agent Name and contact details
- Requested amount (₹)
- Request timestamp
- Attached proof screenshot (a file upload from the Agent, viewable in the dashboard)

**Approval Process (for Superadmin to follow):**
1. Superadmin checks their physical bank account/UPI app to confirm the specified amount was received
2. Superadmin clicks "Approve" on the matching request
3. System executes an ACID transaction:
   - Inserts a row into `Wallet_Ledger`: `{ agent_id, type: 'Credit', amount: X, reference: 'Top-up approved' }`
   - Updates `Users.current_balance` += X for that agent
4. Agent receives an instant WebSocket notification: "Your wallet has been credited with ₹X."

**Manual Adjustment:**
A "Manual Adjust" button per Agent. Opens a modal with:
- Adjust Type: Credit (+) or Debit (-)
- Amount (₹)
- Reason (required text field — minimum 20 characters)

The reason is mandatory because all manual adjustments are written to the Audit Log with the Superadmin's identity. This creates an accountable paper trail for every financial adjustment.

### 8.5 Audio Localization Hub (Phase 2 — UI present in Phase 1)

The UI for this feature is built and visible in Phase 1, but non-functional. In Phase 2, it becomes active.

**Audio Matrix UI:** A 9×10 grid (numbers 1–90) where each cell shows:
- The number
- Status indicator: "No File" (red dot) or "File Uploaded" (green dot) and filename
- A clickable zone to upload a `.mp3` or `.wav` file
- A "▶ Play" button to preview the uploaded audio

**File constraints:**
- Accepted formats: `.mp3`, `.wav`
- Maximum file size: 500KB per file (enforced server-side)
- Files are stored in `backend/public/audio/` and served statically

**Batch Upload:**
A drag-and-drop zone accepting a `.zip` file. The backend script:
1. Unzips the file to a temporary directory
2. Validates each file is named `1.mp3` through `90.mp3` (or `.wav`)
3. Validates each file is under 500KB
4. Moves valid files to the audio directory, mapping them to their numbers
5. Reports a summary: "87 files uploaded successfully. 3 errors: [list]"

### 8.6 Audit Log Viewer

A paginated, read-only display of every action taken by any staff member (Admin, Operator, Agent) on the platform.

**Log entry format:**
```
2026-06-06 14:30:00  |  Admin_Rohit  |  Admin  |  Created Game #1042  |  game_id: 1042  |  192.168.1.15
```

**Filters available:**
- Date range
- User name
- Role
- Action type (Created, Edited, Deleted, Approved, Suspended, etc.)
- Target entity (Game ID, User ID, Booking ID)

The log is immutable — no user, including Superadmins, can delete or edit audit log entries.

### 8.7 Emergency Console

Accessible for any game with `game_status = 'Live'`. A dedicated panel showing:

**Emergency Actions:**
- **Force Pause:** Halts the Conductor. All Player screens show the "Game Paused" overlay.
- **Manual Number Push:** A number input (1–90). Submitting it bypasses the Conductor and broadcasts that number immediately. Used if the Conductor malfunctions on a specific number.
- **Force Terminate + Bulk Refund:** Terminates the game immediately. The system automatically reverses all `Sold` ticket values back to the respective Agent wallets. All Players receive a WebSocket notification: "This game has been cancelled. Your ticket value has been credited to the Agent."

---

## CHAPTER 9: MODULE 4 — ADMIN CONSOLE

### 9.1 Admin Dashboard

The Admin's entry page after login. Shows:
- Summary statistics: Games Scheduled (count), Agents Active (count), Agents with Low Wallet Balance (count)
- Quick-access buttons: "Create New Game," "View Agent Queue"
- A list of the 5 most recently scheduled games with their status

### 9.2 The Game Builder Wizard (3-Step Flow)

Creating a game is a critical task — errors here directly impact revenue and player trust. The wizard enforces step-by-step completion with validation at each stage.

#### Step 1 — Core Parameters

| Field | Type | Validation Rules |
|---|---|---|
| Game Title | Text input | Required; 3–60 characters |
| Scheduled Date | Date picker | Must be today or a future date |
| Scheduled Time | Time picker | Combined with date, must be at least 1 hour in the future |
| Total Tickets | Number input | Required; minimum 10; maximum 10,000 |
| Ticket Price | Currency input (₹) | Required; minimum ₹10 |

**Auto-calculated display (below the inputs):**
`Total Potential Gross = Total Tickets × Ticket Price`
e.g., "500 tickets × ₹50 = **Potential Gross: ₹25,000**"

The "Next →" button is disabled until all fields pass validation.

#### Step 2 — Prize Pool Constructor

A dynamic form where the Admin builds the reward structure for this specific game. Not all prize categories need to be active — the Admin selects which ones to offer.

**Adding a prize:**
1. Select from dropdown: Early Five | Top Line | Middle Line | Bottom Line | Four Corners | Full House
2. Enter the prize amount (₹)
3. Click "Add Prize" — it appears in the prize list

**Prize list shows:**
- Category name
- Prize amount
- A delete button to remove it

**Real-time validation progress bar:**
`Total Prize Pool: ₹7,500 / Max Allowed: ₹20,000 (80% of ₹25,000 Gross)`

**Hard constraint:** If the Total Prize Pool exceeds 80% of the Potential Gross, the progress bar turns red and the "Next →" button is disabled. This ensures the platform always retains at least 20% margin. The Admin must reduce prizes or increase ticket capacity.

**Example valid prize structure:**
- Full House: ₹10,000
- Top Line: ₹2,000
- Middle Line: ₹2,000
- Bottom Line: ₹2,000
- Early Five: ₹1,000
- **Total: ₹17,000 out of ₹20,000 maximum (68% of Gross) ✅**

#### Step 3 — Assignment & Publishing

| Field | Type | Description |
|---|---|---|
| Assign Operator | Dropdown | Lists all active Operators; required |
| Review Summary | Read-only display | Final review of all settings from Steps 1 and 2 |

**"Publish Game" button:** On click:
1. Final server-side validation of all parameters
2. `game_status` is set to `Scheduled`
3. The game's ticket pool is generated by the ticket generation algorithm (all tickets created in the database with `status = 'Available'`)
4. The Game Card appears on the public lobby's `#games` section immediately
5. Admin is redirected to the Game List view

**Editing a Scheduled Game:**
Any parameter can be edited while `game_status = 'Scheduled'`. Once the Operator clicks "Start Game" and the status becomes `Live`, all edit interfaces are locked and read-only.

### 9.3 Agent Pipeline Management

**Agent Overview Table:** Shows all Agents under this Admin's jurisdiction.

| Column | Description |
|---|---|
| Agent Name | Clickable, opens agent detail view |
| Current Wallet Balance | Live value in ₹; turns red if below ₹500 threshold |
| Tickets Sold Today | Count of confirmed bookings today |
| Status | Active / Suspended |
| Last Active | Timestamp of last login or dashboard action |

**Wallet Approval Queue:**
Below the table, a feed of pending top-up requests from Agents. Same workflow as Superadmin (§8.4) but scoped to this Admin's Agents only.

**Security constraint:** The Admin's "Approve Top-Up" button is only enabled when there is an active request from the Agent. There is no "Manual Adjust" button for Admins — they cannot add or remove funds from an Agent's wallet without a formal request, preventing internal embezzlement.

---

## CHAPTER 10: MODULE 5 — OPERATOR CONSOLE

### 10.1 Operator Dashboard (Game List)

When an Operator logs in, they see only games assigned to their `operator_id`. The list shows:
- Game Title
- Scheduled Date/Time
- Current Status (Scheduled / Live / Completed)
- Ticket Fill % (progress bar)
- "Enter Console" button (only activates 15 minutes before scheduled time, or immediately if game is Live)

### 10.2 Pre-Game Lobby (T-15 minutes)

When the Operator clicks "Enter Console" for a game starting in less than 15 minutes, they enter the Pre-Game Lobby. The "Start Game" button is not yet active — the Operator must complete a health checklist first.

**System Health Checklist (must complete before Start is enabled):**

**Check 1 — Audio Sync (Phase 2):** A button labeled "Test Audio." In Phase 2, clicking it plays a sample audio file and asks the Operator to confirm it played correctly. In Phase 1, this is shown as "Audio: Disabled (Phase 2)" — greyed out and auto-checked.

**Check 2 — WebSocket Connection Health:**
A real-time ping indicator showing latency to the backend server. Displayed as:
- Green (< 50ms): "Excellent"
- Yellow (50–200ms): "Good"
- Red (> 200ms): "Poor — check network before starting"

The Start button remains disabled if latency is above the threshold.

**Live Audience Metrics:**
- Total Tickets Sold: Database count of `status = 'Sold'` for this game
- Total Tickets Locked: Database count of `status = 'Locked'`
- Players Online Now: Count of active browser sessions in the game's waiting room

**Start Scheduled Time:**
At the exact scheduled time (or after manual confirmation), the "Start Game" button becomes fully active. A brief countdown (5-4-3-2-1) plays on click before the engine starts, giving the Operator a chance to abort.

### 10.3 Live Execution HUD

After clicking "Start Game" (and the backend completes the RNG shuffle), the interface transforms.

**Layout:** Full-screen, dark-mode, distraction-free interface.

**Center Panel — The Teleprompter:**
- Large font display showing the current drawn number (e.g., **42**)
- A smaller display below showing the next number in the sequence (preview only — not yet announced)
- Total numbers drawn so far (e.g., "15 of 90")

**Left Panel — Game Controls:**
- **Speed Slider:** A large, thumb-friendly horizontal slider from Slow (12s) to Fast (5s) with Normal (8s) as the default center position. Moving the slider sends a real-time update to the backend Conductor — the next draw tick uses the new interval.
- **Emergency Pause Button:** A large red button labeled "⏸ Pause Game." On click: a confirmation dialog ("Pause the live game? Players will see a pause notice.") and then pause is applied.
- **Resume Button:** Replaces the Pause button when paused. Large green button.

**Right Panel — Situational Awareness:**
- **Player Count:** Live counter of active SSE connections for this game
- **Network Health Indicator:** Backend WebSocket latency to Redis
- **Winners Feed:** A scrolling terminal showing prize claims as they happen (e.g., "🏆 Top Line claimed by HillBoy99 — Ticket #042 — ₹1,000")

The Operator does not click anything in the Winners Feed — it is purely for situational awareness. The detection, announcement, and recording are all automated.

### 10.4 Ghost Host Scenario (Key Failsafe)

If the Operator's device loses power or internet connectivity during a live game:

- The backend Conductor continues drawing numbers completely unaffected — it lives on the server, not the Operator's device
- Players continue receiving numbers and auto-marking their tickets
- Win detection continues operating and awarding prizes
- The Operator can reconnect from any device (including a phone) and navigate to the Live Execution HUD — the HUD re-syncs to the current live state

This is the "Ghost Host" feature — the game can run from start to finish without the Operator ever being online.

---

## CHAPTER 11: MODULE 6 — AGENT WORKSPACE

### 11.1 Workspace Philosophy

The Agent's dashboard is built around one principle: **every action must be completable in under 3 seconds**. Agents are constantly multitasking between this dashboard, WhatsApp messages, and their banking app. The UI must be ruthlessly simple, fast, and mobile-first.

### 11.2 Persistent Header

Always visible at the top of every Agent screen:
- Agent's name and avatar/initials
- **Current Wallet Balance** (₹) — prominently displayed
  - Normal: displayed in the platform's primary color
  - Below threshold (< ₹500): entire header background turns red with text "LOW BALANCE — Top up now"

### 11.3 Tabbed Navigation

Three tabs, always accessible:
1. **Live Queue** (default tab on login) — the real-time booking queue
2. **My Sales** — historical confirmed bookings
3. **Wallet** — digital wallet balance, ledger, and top-up request form

### 11.4 Live Queue — Detailed Specification

**Connection:** The queue uses a WebSocket (Socket.io) connection. New booking requests appear instantly — the Agent never needs to refresh the page. A subtle audio ping (a soft chime) plays on each new request arrival.

**Request Card anatomy:**
```
┌──────────────────────────────────────────────────────────┐
│  #BKG-8842                              ⏱ 09:42 remaining │
│                                                           │
│  HillBoy99                                                │
│  Sunday Mega Bonanza · 8:00 PM                           │
│                                                           │
│  Tickets: #14, #22, #89                                   │
│                                                           │
│  TOTAL: ₹150                  [💬 WhatsApp] [✓ Confirm] [✗ Reject]│
└──────────────────────────────────────────────────────────┘
```

Field breakdown:
- **Booking ID** (#BKG-8842): The unique reference the Agent and Player both use to identify this transaction
- **Countdown Timer** (⏱ 09:42): The remaining time in the Player's 10-minute lock window. This timer runs on the frontend in real-time. When it hits 0:00, the card grays out and displays "EXPIRED" — the system has already auto-cancelled it.
- **Housie Name** (HillBoy99): The Player's nickname — makes the WhatsApp message easy to match
- **Game Name & Time:** For context — especially if the Agent is handling requests for multiple games
- **Ticket Numbers:** Which specific tickets are being held for this Player
- **Total Payable Amount (₹150):** Large, prominent — this is what the Player must send the Agent

**Three action buttons:**

**💬 WhatsApp Button:**
Opens the `wa.me` deep link for this Player directly to the Agent's own WhatsApp (with a pre-filled payment request message). Also shows the "1-Click Template" options (see §11.5).

**✓ Confirm Button (Green):**
Before confirming, the backend checks:
- Is `Agent.current_balance >= ₹150`?
- If yes: deduct ₹150 from Agent's wallet; set booking status to `Sold`; move card to "My Sales" tab; Player's frontend updates instantly.
- If no: error toast: "Insufficient Wallet Balance (₹X available). Please top up to confirm." The card remains in the queue; the Agent cannot confirm until they have sufficient balance.

**✗ Reject Button (Red):**
Immediately cancels the booking. Tickets return to `Available`. No funds are deducted. A confirmation modal prevents accidental rejection: "Reject this booking? Ticket #14, #22, #89 will be released for others to book."

### 11.5 WhatsApp 1-Click Templates (Smart Feature 1)

When the Agent taps the WhatsApp button on a Request Card, a small popup appears with three pre-formatted message buttons:

**Template 1 — Payment Request:**
> "Hi HillBoy99! 🙏 Please send ₹150 to my UPI ID: [agent_upi_id] or scan my QR code. Booking ID: #BKG-8842. Reply with a screenshot once done!"

**Template 2 — Payment Confirmed:**
> "Payment received! ✅ Your tickets #14, #22, #89 for Sunday Mega Bonanza are confirmed. Good luck! 🎲"

**Template 3 — Ticket Expired:**
> "Hi HillBoy99, the 10-minute window for your tickets #14, #22, #89 has expired. Please rebook at [platform URL] if you're still interested!"

Each template button copies the text to the clipboard with one tap. The Agent pastes it into WhatsApp and sends it. The UPI ID and QR code displayed in Template 1 are the Agent's own UPI details (set during account creation).

### 11.6 My Sales Tab

A chronological list of all confirmed bookings by this Agent. Each entry shows:
- Booking ID
- Player Housie Name
- Game Name
- Ticket Numbers
- Amount Collected (₹)
- Confirmation Timestamp

**Daily Summary (top of the tab):**
- Total Tickets Sold Today: count
- Total Amount Processed Today: ₹
- Estimated Commission Earned: Based on the markup (ticket sell price minus ticket cost to Agent). E.g., if Agent buys inventory at ₹45 and sells at ₹50, commission = ₹5 × tickets sold.

### 11.7 Wallet Tab — Detailed Specification

**Balance Display:**
- Current balance in ₹ (large, prominent)
- Total Top-Ups Received (all time)
- Total Confirmed (debited) — all time

**Transaction Ledger:**
Chronological list of all transactions:
- Date / Time
- Type: Credit (+) or Debit (-)
- Amount (₹)
- Description (e.g., "Top-up approved by Admin_Rohit" or "Booking #BKG-8842 confirmed")
- Running balance after each transaction

**Top-Up Request Form:**
When the Agent runs low on balance, they transfer real money to the MOD bank account via their banking app, then submit this form:

- Amount being requested (₹) — required
- Payment method used (e.g., "Google Pay to MOD UPI") — required
- Transaction reference number (from their banking app) — required
- Screenshot upload (optional but strongly encouraged)

On submit: request status → `Pending`. The Agent sees "Your request of ₹X is pending approval" in their wallet tab. Admin/Superadmin dashboards show the new request.

### 11.8 Player Spam Flagging

If a Player consistently locks tickets and disappears (never paying), the Agent can tap a "Flag as Spam" icon on an expired request card.

Spam tracking:
- Each flag is tied to the Player's device fingerprint (browser fingerprint or IP address)
- If a Player accumulates 3+ spam flags from different Agents: their device is soft-banned from locking tickets for 24 hours
- The soft-ban prevents them from completing the "Book Now" action — they can browse tickets but the lock action returns a "Booking temporarily disabled" error
- Superadmins can review and clear soft-bans from the User Management section

---

## CHAPTER 12: DATABASE SCHEMA — FULL DETAIL

This chapter defines every table, column, data type, constraint, and index in the PostgreSQL database. The schema is designed for ACID compliance, data integrity, and query performance.

### 12.1 Table: Roles

Stores the fixed set of user roles. This table is seeded once and never modified by the application.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `role_id` | SERIAL | PRIMARY KEY | Auto-incrementing identifier |
| `role_name` | VARCHAR(50) | NOT NULL, UNIQUE | 'Superadmin', 'Admin', 'Operator', 'Agent' |
| `description` | TEXT | | Human-readable role description |

**Seed data:**
```
role_id=1  role_name='Superadmin'
role_id=2  role_name='Admin'
role_id=3  role_name='Operator'
role_id=4  role_name='Agent'
```

### 12.2 Table: Users

All staff accounts (Superadmin, Admin, Operator, Agent). Players have no entry here.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `user_id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique user identifier |
| `role_id` | INTEGER | NOT NULL, FK → Roles(role_id) | The user's role |
| `full_name` | VARCHAR(100) | NOT NULL | Display name |
| `email` | VARCHAR(255) | NOT NULL, UNIQUE | Login email |
| `phone` | VARCHAR(20) | UNIQUE | Contact phone (also UPI handle for Agents) |
| `upi_id` | VARCHAR(100) | | Agent's UPI ID for receiving Player payments |
| `password_hash` | VARCHAR(255) | NOT NULL | bcrypt-hashed password |
| `temp_password_required` | BOOLEAN | DEFAULT TRUE | Forces password change on first login |
| `status` | VARCHAR(20) | DEFAULT 'Active' | 'Active', 'Suspended' |
| `current_balance` | DECIMAL(12,2) | DEFAULT 0.00 | Agent digital wallet balance (0 for non-Agents) |
| `created_by` | UUID | FK → Users(user_id) | Who created this account |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Account creation timestamp |
| `last_login` | TIMESTAMPTZ | | Last successful login timestamp |

**Indexes:** `email` (unique lookup), `role_id` (filter by role), `status` (filter active users)

### 12.3 Table: Scheduled_Games

Every game instance created on the platform.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `game_id` | UUID | PRIMARY KEY | Unique game identifier |
| `title` | VARCHAR(100) | NOT NULL | Game display name |
| `scheduled_at` | TIMESTAMPTZ | NOT NULL | Game start date and time |
| `total_tickets` | INTEGER | NOT NULL, CHECK > 0 | Total number of tickets available |
| `ticket_price` | DECIMAL(10,2) | NOT NULL, CHECK > 0 | Price per ticket in ₹ |
| `game_status` | VARCHAR(20) | NOT NULL, DEFAULT 'Scheduled' | 'Scheduled', 'Live', 'Paused', 'Completed', 'Postponed' |
| `operator_id` | UUID | FK → Users(user_id) | The Operator assigned to host this game |
| `created_by` | UUID | FK → Users(user_id) | Admin who created this game |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `started_at` | TIMESTAMPTZ | | When game_status changed to 'Live' |
| `completed_at` | TIMESTAMPTZ | | When game_status changed to 'Completed' |
| `postponed_to` | TIMESTAMPTZ | | New scheduled time if Postponed |

**Indexes:** `game_status` (filter live/scheduled games), `operator_id` (Operator's game list), `scheduled_at` (order by upcoming)

### 12.4 Table: Prize_Pool

One row per prize category per game. The Admin constructs this during the Game Builder Wizard.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `prize_id` | SERIAL | PRIMARY KEY | |
| `game_id` | UUID | NOT NULL, FK → Scheduled_Games(game_id) | |
| `pattern_name` | VARCHAR(50) | NOT NULL | 'Early Five', 'Top Line', 'Middle Line', 'Bottom Line', 'Four Corners', 'Full House' |
| `prize_amount` | DECIMAL(10,2) | NOT NULL, CHECK > 0 | ₹ value of this prize |
| `claimed` | BOOLEAN | DEFAULT FALSE | Has this prize been won? |
| `winner_ticket_id` | INTEGER | FK → Tickets(ticket_id) | Null until claimed |
| `winner_housie_name` | VARCHAR(50) | | Duplicated for fast display (denormalized) |
| `claimed_at` | TIMESTAMPTZ | | When this prize was claimed |
| `split_count` | INTEGER | DEFAULT 1 | Number of winners (>1 = tie) |
| `amount_per_winner` | DECIMAL(10,2) | | prize_amount / split_count |

**Constraint:** UNIQUE(`game_id`, `pattern_name`) — one row per pattern per game.

### 12.5 Table: Tickets

One row per ticket per game. Generated en masse when a game is published.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `ticket_id` | SERIAL | PRIMARY KEY | |
| `game_id` | UUID | NOT NULL, FK → Scheduled_Games(game_id) | |
| `ticket_number` | INTEGER | NOT NULL | Display number (1, 2, 3..., up to total_tickets) |
| `grid_data` | JSONB | NOT NULL | The 3×9 number grid (see structure below) |
| `status` | VARCHAR(20) | DEFAULT 'Available' | 'Available', 'Locked', 'Sold', 'Cancelled' |
| `locked_by_booking` | UUID | FK → Bookings(booking_id) | Set when Locked; null when Available/Sold |
| `locked_until` | TIMESTAMPTZ | | Expiry of the soft-lock (10 minutes from lock time) |
| `owner_housie_name` | VARCHAR(50) | | Set when Sold; null otherwise |
| `confirmed_at` | TIMESTAMPTZ | | When status changed to Sold |

**JSONB grid_data structure:**
```json
{
  "row1": [null, 12, null, 34, 45, null, 61, null, 88],
  "row2": [3, null, 25, null, 48, 55, null, 72, null],
  "row3": [7, 18, null, 39, null, null, 68, 77, null]
}
```

**Indexes:** `(game_id, status)` composite (filter available tickets per game — critical for booking page performance), `locked_until` (expiry sweeper cron job query)

**Unique constraint:** `(game_id, ticket_number)` — no duplicate ticket numbers within a game.

### 12.6 Table: Bookings

One row per booking attempt (whether successful or expired).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `booking_id` | UUID | PRIMARY KEY | Unique booking reference (shown to Player and Agent) |
| `game_id` | UUID | NOT NULL, FK → Scheduled_Games(game_id) | |
| `ticket_ids` | INTEGER[] | NOT NULL | Array of ticket_ids being booked |
| `housie_name` | VARCHAR(50) | NOT NULL | Player's chosen nickname |
| `assigned_agent_id` | UUID | NOT NULL, FK → Users(user_id) | Agent assigned via Round-Robin |
| `total_amount` | DECIMAL(10,2) | NOT NULL | Calculated: ticket_count × ticket_price |
| `booking_status` | VARCHAR(20) | DEFAULT 'Locked' | 'Locked', 'Sold', 'Cancelled', 'Expired' |
| `locked_at` | TIMESTAMPTZ | DEFAULT NOW() | When booking was created |
| `locked_until` | TIMESTAMPTZ | NOT NULL | locked_at + 10 minutes |
| `confirmed_at` | TIMESTAMPTZ | | When Agent confirmed payment |
| `confirmed_by` | UUID | FK → Users(user_id) | Agent who confirmed |
| `rejected_at` | TIMESTAMPTZ | | When Agent rejected or timer expired |
| `player_device_fingerprint` | VARCHAR(255) | | For spam flagging purposes |
| `spam_flagged` | BOOLEAN | DEFAULT FALSE | Flagged as spam by Agent |

**Indexes:** `(assigned_agent_id, booking_status)` (Agent's live queue query), `locked_until` (expiry sweeper), `housie_name` (player lookup)

### 12.7 Table: Wallet_Ledger

Every financial transaction affecting an Agent's digital wallet. The source of truth for all wallet balances.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `entry_id` | SERIAL | PRIMARY KEY | |
| `agent_id` | UUID | NOT NULL, FK → Users(user_id) | |
| `transaction_type` | VARCHAR(20) | NOT NULL | 'Credit', 'Debit', 'Reversal' |
| `amount` | DECIMAL(10,2) | NOT NULL, CHECK > 0 | Always positive; type determines direction |
| `balance_after` | DECIMAL(10,2) | NOT NULL | Agent's balance after this transaction |
| `reference_type` | VARCHAR(50) | | 'TopUp', 'BookingConfirm', 'ManualAdjust', 'BulkRefund' |
| `reference_id` | VARCHAR(100) | | booking_id or top-up request ID |
| `description` | TEXT | | Human-readable description |
| `performed_by` | UUID | FK → Users(user_id) | Who triggered this entry (Agent or Admin/Superadmin) |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Note:** The `current_balance` on the `Users` table is a denormalized cache for fast display. The canonical balance is the sum of all Wallet_Ledger entries for that agent. On any discrepancy, the Ledger wins.

### 12.8 Table: TopUp_Requests

Tracks Agent wallet top-up requests through their lifecycle.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `request_id` | UUID | PRIMARY KEY | |
| `agent_id` | UUID | NOT NULL, FK → Users(user_id) | |
| `requested_amount` | DECIMAL(10,2) | NOT NULL, CHECK > 0 | Amount requested |
| `payment_reference` | VARCHAR(100) | NOT NULL | UPI transaction ID from Agent's bank |
| `payment_method` | VARCHAR(100) | | e.g., "Google Pay to MOD Bank" |
| `proof_screenshot_url` | VARCHAR(500) | | Path to uploaded proof file |
| `request_status` | VARCHAR(20) | DEFAULT 'Pending' | 'Pending', 'Approved', 'Rejected' |
| `requested_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `reviewed_by` | UUID | FK → Users(user_id) | Admin/Superadmin who processed it |
| `reviewed_at` | TIMESTAMPTZ | | |
| `reviewer_notes` | TEXT | | Optional notes from reviewer |

### 12.9 Table: Game_Logs

The critical audit and crash-recovery table for the live game engine.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `log_id` | SERIAL | PRIMARY KEY | |
| `game_id` | UUID | NOT NULL, UNIQUE, FK → Scheduled_Games(game_id) | One log per game |
| `draw_sequence` | INTEGER[] | NOT NULL | The complete pre-generated shuffled array [54, 7, 23...] |
| `drawn_numbers` | INTEGER[] | DEFAULT '{}' | Numbers drawn so far, appended each tick |
| `current_index` | INTEGER | DEFAULT 0 | Current position in draw_sequence |
| `sequence_generated_at` | TIMESTAMPTZ | | When the RNG generated the sequence |
| `last_draw_at` | TIMESTAMPTZ | | Timestamp of the most recent draw tick |
| `total_drawn` | INTEGER | DEFAULT 0 | Count of numbers drawn so far |

**Critical use:** On server crash and restart, the backend reads `game_id` (from games where `game_status = 'Live'`), loads `draw_sequence` and `current_index`, restores them to Redis, and resumes the Conductor from that position.

### 12.10 Table: Audit_Log

An immutable record of every state-changing action performed by any staff member.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `log_id` | BIGSERIAL | PRIMARY KEY | Auto-incrementing large integer |
| `timestamp` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | When the action occurred |
| `user_id` | UUID | FK → Users(user_id) | Who performed the action |
| `user_name` | VARCHAR(100) | NOT NULL | Denormalized for historical accuracy |
| `user_role` | VARCHAR(50) | NOT NULL | Denormalized for historical accuracy |
| `action` | VARCHAR(100) | NOT NULL | e.g., 'Created Game', 'Approved TopUp', 'Suspended User' |
| `target_type` | VARCHAR(50) | | 'Game', 'User', 'Booking', 'Wallet', 'System' |
| `target_id` | VARCHAR(100) | | The ID of the affected entity |
| `target_description` | TEXT | | Human-readable description of what changed |
| `ip_address` | VARCHAR(45) | | Client IP (supports IPv4 and IPv6) |
| `user_agent` | TEXT | | Browser/device information |

**Important:** No DELETE or UPDATE operations are ever performed on this table. New entries only. Database triggers can additionally be set to prevent modification.

### 12.11 Table: Themes

Stores the available UI themes and the currently active one.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `theme_id` | SERIAL | PRIMARY KEY | |
| `theme_name` | VARCHAR(50) | NOT NULL, UNIQUE | 'Default', 'Dark', 'Festive', 'Classic Hall' |
| `css_class` | VARCHAR(50) | NOT NULL | CSS class name applied to `<html>` or `:root` |
| `is_active` | BOOLEAN | DEFAULT FALSE | Only one theme is active at a time |
| `preview_image_url` | VARCHAR(500) | | Thumbnail image for the theme switcher UI |

### 12.12 Table: Platform_Config

Key-value store for global platform variables editable by the Superadmin.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `config_key` | VARCHAR(100) | PRIMARY KEY | e.g., 'support_email', 'marquee_text' |
| `config_value` | TEXT | NOT NULL | The current value |
| `description` | TEXT | | What this config controls |
| `updated_by` | UUID | FK → Users(user_id) | Last Superadmin who changed it |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Default seed entries:**
```
support_email → support@housieghar.com
support_phone → +91-XXXXXXXXXX
marquee_text  → Welcome to Housie Ghar! Next Mega Draw this Sunday at 8 PM!
terms_text    → [Full T&C text]
lock_duration_minutes → 10
low_balance_threshold → 500
```

---

## CHAPTER 13: API ENDPOINTS — FULL REFERENCE

All API endpoints are prefixed with `/api`. All protected endpoints require a valid JWT in an `HttpOnly` cookie. The backend validates the JWT and the user's `role_id` before processing any request.

### 13.1 Authentication Endpoints

| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| POST | `/api/auth/login` | None | Accepts email + password. Returns JWT in HttpOnly cookie. |
| POST | `/api/auth/logout` | Yes (any role) | Invalidates the JWT. Clears the cookie. |
| GET | `/api/auth/me` | Yes (any role) | Returns the currently authenticated user's profile and role. |
| POST | `/api/auth/change-password` | Yes (any role) | Required on first login (when `temp_password_required = true`). |

### 13.2 Public Endpoints (No Authentication)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/games` | Returns all `Scheduled` and `Live` games with ticket fill percentages. Used by the `#games` lobby section. |
| GET | `/api/games/:game_id` | Returns full game details including prize pool, ticket counts by status. |
| GET | `/api/games/:game_id/tickets` | Returns all tickets for a game with their current status. Used by the Ticket Grid. |
| GET | `/api/winners` | Returns recent winners across all completed games. Used by the `#winners` section. |
| GET | `/api/config/public` | Returns public-safe config values (marquee text, support contact, active theme). |
| GET | `/api/games/:game_id/live-state` | Returns the current `drawn_numbers`, `claimed_prizes`, and `game_status`. Used for state hydration on reconnect. |

### 13.3 Booking Endpoints (No Authentication, Rate-Limited)

| Method | Endpoint | Rate Limit | Description |
|---|---|---|---|
| POST | `/api/bookings/lock` | 5 requests/minute/IP | Initiates the soft-lock. Requires: `ticket_ids[]`, `housie_name`, `game_id`. Returns: `booking_id`, `locked_until`, `agent_phone`, `agent_name`. |
| GET | `/api/bookings/status/:booking_id` | 30 requests/minute/IP | Polling endpoint. Returns current `booking_status`. Player's frontend polls this every 3–5 seconds. |
| GET | `/api/bookings/:booking_id/ticket` | 10 requests/minute/IP | Returns the confirmed ticket's `grid_data` for display. Only works when `booking_status = 'Sold'`. |

### 13.4 Real-Time Streaming Endpoints (No Authentication)

| Method | Endpoint | Type | Description |
|---|---|---|---|
| GET | `/api/stream/game/:game_id` | SSE | Server-Sent Events stream for a live game. Client connects and receives all draw events, winner events, and game state events. |

### 13.5 Agent Endpoints (Role: Agent+)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/agent/queue` | Returns all `Locked` bookings assigned to the authenticated Agent, ordered by `locked_at`. |
| POST | `/api/agent/bookings/:booking_id/confirm` | Confirms a booking. Triggers ACID transaction: deduct wallet, mark Sold, notify Player. |
| POST | `/api/agent/bookings/:booking_id/reject` | Rejects a booking. Cancels lock, releases tickets, notifies frontend. |
| POST | `/api/agent/bookings/:booking_id/flag-spam` | Flags the Player's device fingerprint for the spam system. |
| GET | `/api/agent/sales` | Returns all `Sold` bookings confirmed by this Agent. Supports date filters. |
| GET | `/api/agent/wallet` | Returns current balance and full transaction ledger. |
| POST | `/api/agent/wallet/topup-request` | Submits a new top-up request. Notifies Admin/Superadmin. |

### 13.6 Operator Endpoints (Role: Operator+)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/operator/games` | Returns games assigned to the authenticated Operator. |
| GET | `/api/operator/games/:game_id/pre-lobby` | Returns pre-game system health data (ticket fill, player count, latency). |
| POST | `/api/operator/games/:game_id/start` | Triggers the game start sequence (RNG shuffle, state → Live, Conductor start). |
| POST | `/api/operator/games/:game_id/pause` | Pauses the Conductor. Broadcasts pause event to all clients. |
| POST | `/api/operator/games/:game_id/resume` | Resumes the Conductor. Broadcasts resume event. |
| PUT | `/api/operator/games/:game_id/speed` | Updates `call_interval_ms` in Redis. Takes effect on the next draw tick. Body: `{ interval_ms: 8000 }` |
| POST | `/api/operator/games` | Creates a new game under the Operator's own ID (limited game creation). |

### 13.7 Admin Endpoints (Role: Admin+)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/admin/dashboard` | Returns summary stats: scheduled games count, active agents, low-balance agents. |
| GET | `/api/admin/games` | Returns all games (for game management). |
| POST | `/api/admin/games` | Creates a new game. |
| PUT | `/api/admin/games/:game_id` | Updates a `Scheduled` game's parameters. Returns 403 if game is `Live`. |
| POST | `/api/admin/games/:game_id/publish` | Sets game to `Scheduled` and makes it visible on the public lobby. Generates ticket pool. |
| POST | `/api/admin/games/:game_id/postpone` | Sets game to `Postponed`, updates time, broadcasts notification to waiting room. |
| GET | `/api/admin/agents` | Returns all Agents under this Admin's jurisdiction. |
| GET | `/api/admin/topup-requests` | Returns pending wallet top-up requests from Agents. |
| POST | `/api/admin/topup-requests/:request_id/approve` | Approves a top-up. Triggers ACID wallet credit transaction. |
| POST | `/api/admin/topup-requests/:request_id/reject` | Rejects a top-up request with optional reason. |
| POST | `/api/admin/bookings/:booking_id/force-assign` | Bypasses the Agent to manually issue tickets to a Player (fraud case). Deducts from Agent's wallet. |
| POST | `/api/admin/users` | Creates a new Operator or Agent account. |
| PUT | `/api/admin/users/:user_id` | Updates a user's details. |
| POST | `/api/admin/users/:user_id/suspend` | Suspends a user account (Operator or Agent only). |

### 13.8 Superadmin Endpoints (Role: Superadmin only)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/superadmin/dashboard` | Returns live metrics: active games, concurrent players, today's gross, total wallet liability. |
| GET | `/api/superadmin/analytics` | Returns sales chart data for 7/30/90 day views. |
| GET | `/api/superadmin/profit-distribution` | Returns calculated net profit and MOD member split. |
| POST | `/api/superadmin/users` | Creates any user including Admin accounts. |
| PUT | `/api/superadmin/users/:user_id` | Full edit rights on any user. |
| POST | `/api/superadmin/users/:user_id/suspend` | Suspends any user (including Admins). Invalidates JWT. |
| DELETE | `/api/superadmin/users/:user_id` | Permanently deletes a user (with data retention checks). |
| GET | `/api/superadmin/wallet-liability` | Returns sum of all active Agent wallet balances. |
| POST | `/api/superadmin/topup-requests/:request_id/approve` | Same as Admin approval but with override capability. |
| POST | `/api/superadmin/wallet/manual-adjust` | Manual wallet credit or debit. Requires `reason` field. |
| GET | `/api/superadmin/audit-log` | Returns paginated, filterable audit log. |
| GET | `/api/superadmin/themes` | Returns all available themes. |
| PUT | `/api/superadmin/themes/active` | Switches the active theme. Broadcasts change to all clients. |
| GET | `/api/superadmin/config` | Returns all platform config variables. |
| PUT | `/api/superadmin/config` | Updates one or more platform config variables. |
| GET | `/api/superadmin/games/:game_id/emergency` | Returns emergency console data for a live game. |
| POST | `/api/superadmin/games/:game_id/force-terminate` | Terminates a live game and triggers bulk refund. |
| POST | `/api/superadmin/games/:game_id/manual-push` | Pushes a specific number to all live game clients. |
| POST | `/api/superadmin/games/:game_id/force-pause` | Emergency pause (overrides Operator control). |

---

## CHAPTER 14: REAL-TIME INFRASTRUCTURE

### 14.1 Why Real-Time Matters in Housie Ghar

Three critical parts of the platform require real-time data flow:

1. **The Ticket Grid:** When one Player locks a ticket, every other Player viewing that same game's grid must see the ticket turn "Locked" immediately — without refreshing the page.
2. **The Live Game Draw:** Every connected Player must receive the drawn number simultaneously, within milliseconds of each other.
3. **The Agent's Booking Queue:** New booking requests must appear on the Agent's screen the instant a Player clicks "Book Now."

Traditional HTTP polling (where the browser repeatedly asks "anything new?") is too slow and resource-intensive for these use cases. Real-time push technology is required.

### 14.2 Server-Sent Events (SSE) — For Players

**What it is:** SSE uses a standard HTTP connection (`Content-Type: text/event-stream`). The server holds the connection open and sends data down to the browser whenever new information is available. The browser cannot send data back on this connection.

**How it works in Housie Ghar:**
1. When a Player opens the `#live` section or the Game Room, the frontend opens an SSE connection: `GET /api/stream/game/:game_id`
2. The backend's `sseManager` registers this connection in a Map keyed by `game_id`
3. The Redis Pub/Sub subscriber listens on `game:{game_id}:draw` channel
4. When the Conductor publishes a new draw number to Redis, the subscriber receives it and calls `sseManager.broadcastToGame(game_id, event)`
5. The `broadcastToGame` function iterates all registered connections for that `game_id` and writes the SSE event to each one

**Event types sent via SSE:**

| Event Name | Payload | When Triggered |
|---|---|---|
| `draw` | `{ draw_number, total_drawn, timestamp }` | Every time a number is drawn |
| `winner` | `{ prize, housie_name, ticket_id, amount, split_count }` | When a prize is claimed |
| `game_paused` | `{ timestamp }` | When Operator/Superadmin pauses |
| `game_resumed` | `{ timestamp, interval_ms }` | When game is resumed |
| `game_completed` | `{ final_leaderboard[] }` | When all prizes are claimed |
| `ticket_status_change` | `{ ticket_id, new_status }` | When any ticket status changes |
| `game_postponed` | `{ new_time }` | When a game is postponed |
| `theme_change` | `{ theme_class }` | When Superadmin switches theme |

**Reconnection handling:**
The browser's `EventSource` API automatically reconnects when the connection drops. The `lastEventId` header is sent on reconnect, allowing the server to resume streaming from the last received event. On reconnect, the frontend also calls `GET /api/games/:game_id/live-state` to get the full current state (all drawn numbers, claimed prizes) and reconcile any missed events.

### 14.3 WebSockets via Socket.io — For Operators and Agents

**What it is:** WebSockets provide a true bidirectional, persistent TCP connection. Both the browser and the server can send data to each other at any time.

**Socket.io rooms used:**

| Room Name | Members | Events |
|---|---|---|
| `game:{game_id}:operators` | All Operators viewing this game's console | `draw`, `winner`, `game_paused`, `game_completed`, `player_count_update` |
| `game:{game_id}:agents` | All Agents | `new_booking_request`, `booking_expired`, `booking_cancelled` |
| `admin:{user_id}` | Individual Admin/Superadmin | `topup_request_received`, `wallet_updated` |

**Events received BY the server from Operators:**

| Event | Payload | Action |
|---|---|---|
| `speed_change` | `{ game_id, interval_ms }` | Updates Redis `game:{game_id}:interval_ms` |
| `pause_game` | `{ game_id }` | Halts the Conductor; broadcasts `game_paused` to all SSE clients |
| `resume_game` | `{ game_id }` | Restarts the Conductor; broadcasts `game_resumed` |

**Events received BY the server from Agents:**

| Event | Payload | Action |
|---|---|---|
| `join_agent_room` | `{ agent_id }` | Subscribes the Agent to their personal booking queue channel |

**Events sent TO Agents:**

| Event | Payload | When |
|---|---|---|
| `new_booking_request` | Full booking card data | When Round-Robin assigns a new booking to this Agent |
| `booking_expired` | `{ booking_id }` | When a booking's 10-minute lock expires |
| `wallet_credited` | `{ new_balance, amount }` | When a top-up is approved |

### 14.4 Redis Pub/Sub Architecture

Redis Pub/Sub is the message broker connecting the Game Engine to all real-time delivery layers.

**Channels:**

| Channel | Publisher | Subscribers | Message Type |
|---|---|---|---|
| `game:{game_id}:draw` | Conductor (Game Engine) | SSE Manager, Socket.io Operator room | Draw tick events |
| `game:{game_id}:control` | Operator WebSocket handler | Conductor (receives pause/resume/speed) | Control events |
| `bookings:{agent_id}` | Booking service | Socket.io Agent handler | New booking request |
| `global:theme` | Theming service | SSE Manager (broadcasts to all clients) | Theme change event |

**Why Redis Pub/Sub is used instead of direct function calls:**
In Phase 1 (single server), direct function calls would work. But in Phase 2 (multiple servers), the Conductor might run on Server A while the SSE connections for a given Player are on Server B. Redis Pub/Sub acts as the intermediary — any server publishing to a channel reaches all servers subscribed to it, regardless of physical location.

### 14.5 Round-Robin Agent Assignment

When a Player clicks "Book Now," the backend must assign exactly one Agent to handle the WhatsApp payment. The assignment algorithm is Round-Robin:

**How it works:**
1. The system maintains a Redis key: `game:{game_id}:agent_pool` — an ordered list of all active Agents available for this game
2. A Redis counter `game:{game_id}:agent_index` tracks which Agent is next in the rotation
3. On each booking lock: increment the index, take the Agent at that position, wrap around if at the end of the list
4. The selected Agent's phone number is returned to the frontend for the WhatsApp deep link

**Why Round-Robin:**
It distributes the booking load evenly across all active Agents. No single Agent is overwhelmed while others are idle.

**Agent eligibility:** An Agent is included in the pool only if their `status = 'Active'` and their `current_balance >= ticket_price` (they must have sufficient wallet balance to potentially confirm the booking).

---

## CHAPTER 15: SECURITY REQUIREMENTS

### 15.1 Authentication — JWT in HttpOnly Cookies

**JWT (JSON Web Token):** A cryptographically signed token that encodes user identity and role. The token is signed using an RS256 algorithm (asymmetric — separate signing and verification keys).

**Cookie security settings:**
- `HttpOnly: true` — JavaScript in the browser cannot read the cookie. XSS attacks cannot steal the token.
- `SameSite: Strict` — The cookie is never sent on cross-site requests. CSRF attacks cannot use the token.
- `Secure: true` — Cookie only sent over HTTPS. (In Phase 1 local, this is relaxed to `false` but must be `true` in production.)

**Token payload:**
```json
{
  "user_id": "...",
  "role_id": 4,
  "role_name": "Agent",
  "email": "agent@example.com",
  "iat": 1717689600,
  "exp": 1717776000
}
```

**Token expiry:** 24 hours. After expiry, the user must log in again.

**Token revocation:** On account suspension, the backend adds the `user_id` to a Redis set `revoked_tokens` with a TTL matching the token's remaining validity. The `authenticate` middleware checks this set on every request — revoked tokens are rejected immediately.

### 15.2 Authorization — Backend Role Enforcement

The `authorize` middleware takes a list of permitted `role_id` values. When attached to a route, it runs after `authenticate` and verifies that `req.user.role_id` is in the permitted list.

Example middleware chain for an Admin-only endpoint:
```
authenticate → authorize([1, 2]) → adminController.createGame
```
- If `role_id = 1` (Superadmin): passes ✅
- If `role_id = 2` (Admin): passes ✅
- If `role_id = 3` (Operator): returns HTTP 403 ❌
- If no JWT: `authenticate` returns HTTP 401 ❌

**Critical rule:** Frontend UI hiding is never the security boundary. Every protected API route must independently verify authorization, regardless of what the frontend shows.

### 15.3 Race Condition Prevention — Database Row Locking

The most vulnerable moment in the entire application is when two Players click "Book Now" for the same ticket at the same millisecond. Without protection, both could succeed and the same ticket would be sold twice.

**Protection mechanism — PostgreSQL `SELECT ... FOR UPDATE`:**

When the booking endpoint receives a request for tickets [42, 87, 103]:
1. Begin a PostgreSQL transaction
2. Execute: `SELECT * FROM Tickets WHERE ticket_id IN (42, 87, 103) AND game_id = '...' FOR UPDATE`
3. The `FOR UPDATE` clause places a pessimistic lock on those three rows
4. Any other transaction attempting to touch these rows is forced to wait (or fail with an error, depending on configuration)
5. Check: are all three rows `status = 'Available'`?
6. If yes: update them to `Locked`, create the booking, commit
7. If no: rollback, return error to the Player

This guarantees it is physically impossible for two Players to receive the same ticket.

### 15.4 Rate Limiting

The `/api/bookings/lock` endpoint is the most abuse-prone endpoint on the platform. A malicious script could repeatedly call it to lock all available tickets, making them unavailable for real players, and then let them expire — a Denial of Service attack on the ticket pool.

**Protection:**
- Maximum 5 lock requests per minute per IP address
- Maximum 3 simultaneous locked bookings per IP at any one time (prevents holding many locks open)
- On exceeding the limit: HTTP 429 Too Many Requests with a `Retry-After` header

The rate limiting uses the `express-rate-limit` library backed by Redis (for consistency across multiple server instances in Phase 2).

### 15.5 Input Validation & Sanitization

All incoming data from the frontend is validated and sanitized before reaching the database.

**Housie Name validation:**
- Minimum 3 characters, maximum 20 characters
- Alphanumeric, spaces, underscores, and hyphens only
- Regex profanity filter against a maintained word list
- Server-side validation (even if frontend already validated — never trust client input)

**General rules:**
- All string inputs are trimmed of leading/trailing whitespace
- All numeric inputs are parsed as integers/decimals with bounds checks
- SQL injection is prevented by using parameterized queries (never string concatenation in SQL)
- All file uploads (proof screenshots, audio files in Phase 2) have MIME type and file size validation

### 15.6 Audit Trail

Every state-changing API request (`POST`, `PUT`, `DELETE`) is intercepted by the `auditLogger` middleware after the handler completes. The middleware writes a row to the `Audit_Log` table containing:
- Exact timestamp
- Authenticated user's ID, name, and role (from JWT)
- HTTP method and endpoint called
- Target entity and ID
- Client IP address
- Browser user agent

This creates an unbreakable paper trail. If funds are misappropriated, a game is manipulated, or a user is improperly suspended, the Superadmin can trace exactly who did what and when.

### 15.7 Data Protection

**Passwords:** Never stored in plain text. Hashed using bcrypt with a minimum work factor of 12.

**Agent UPI details:** Stored in the database but only returned to the booking service (to include in the WhatsApp link). Never returned to the Player's browser directly.

**Player data:** Players have no stored account. The only Player data stored is: Housie Name (not real name), `booking_id`, ticket ownership, and a device fingerprint for spam detection (hashed IP).

---

## CHAPTER 16: UI/UX & DESIGN GUIDELINES

### 16.1 Core Design Philosophy — "Fellowship of the Hills"

The visual identity of Housie Ghar must communicate three things simultaneously:
1. **Trust:** Players are handing over real money. The interface must look professional, serious, and reliable.
2. **Warmth:** This is a community game. The interface must feel like a friendly gathering, not a cold casino.
3. **Excitement:** Housie is a game of anticipation and suspense. The interface must create energy and buzz.

The design draws subtle inspiration from the hill towns of Darjeeling and Sikkim — earthy tones, honest typography, community warmth — without resorting to tourist-trap clichés (no generic mountains or tea-leaf imagery unless executed with genuine creativity).

### 16.2 Color System

The color system is built as CSS custom properties (CSS variables) defined in the `:root` selector. Switching themes means overriding these variables with a different set of values.

**Default Theme variables:**

| Variable | Color | Usage |
|---|---|---|
| `--color-primary` | Deep Forest Green (#2D5016) | Primary buttons, headings, brand elements |
| `--color-primary-light` | Sage Green (#6B9E5A) | Hover states, subtle accents |
| `--color-accent` | Warm Gold (#D4A017) | CTA buttons (Book Now, Confirm), highlights |
| `--color-accent-hot` | Vibrant Orange (#E8640A) | Urgency badges (Fast Filling!), alerts |
| `--color-danger` | Deep Red (#B91C1C) | Reject buttons, error states, low balance warning |
| `--color-surface` | Warm White (#FAFAF8) | Page backgrounds, card backgrounds |
| `--color-surface-raised` | Off-White (#F0EDE8) | Slightly elevated surfaces (cards on white bg) |
| `--color-text-primary` | Near-Black (#1A1A1A) | All primary body text |
| `--color-text-secondary` | Medium Grey (#6B6B6B) | Subtitles, timestamps, secondary info |
| `--color-border` | Light Sand (#E2DDD8) | Card borders, dividers, input borders |

**The four theme presets:**
- **Default:** The above warm, earthy palette
- **Dark Mode:** Deep charcoals and dark navys with the same gold accents
- **Festive:** Warm reds, magentas, and ochres — evokes Dashain/Diwali celebration lighting
- **Classic Hall:** Sepia tones and cream backgrounds with dark wood-like accents — evokes an old community hall

### 16.3 Typography

**Primary Font (Display):** A characterful serif or slab-serif for headings and the game title — conveys heritage and warmth. Self-hosted (no external CDN dependency in Phase 1 local deployment).

**Secondary Font (Body):** A clean, highly legible sans-serif for all body text, labels, and UI copy. Optimized for small mobile screen readability.

**Numbers Font (Critical):** A monospaced or tabular-numerals font used exclusively for ticket numbers, the draw board, and the current drawn number display. The key requirement is that `0`, `6`, `8`, and `9` are visually distinct at small sizes and low screen brightness — players in dim rooms must not misread "86" as "68."

### 16.4 Mobile-First Design Rules

Every component is designed for 375px viewport width first. Wider viewports get enhancements, not rewrites.

**Touch target rule:** Every interactive element must have a minimum tap target of 48×48px (WCAG AA standard). This is critical for the Agent's Confirm/Reject buttons and the Player's ticket grid squares.

**Bandwidth optimization:**
- No background video
- Hero images: WebP format, max 100KB
- CSS animations only for Tambola cage and win celebrations — no GIF files
- All fonts self-hosted (no Google Fonts CDN calls)
- Lazy-load images in the Winners and Games sections

**Load time target:** The public index page must reach First Contentful Paint (FCP) within 2 seconds on a 4G connection.

### 16.5 Accessibility Requirements

**Color blindness:** No UI state is communicated by color alone. Every status indicator must include a text label or icon alongside the color:
- Ticket "Locked": Yellow background + 🔒 lock icon + text "Locked"
- Ticket "Sold": Grey background + ✕ strikethrough text
- Low wallet balance: Red header background + "LOW BALANCE" text label

**Screen Wake Lock API:** During the live game view, the frontend requests `navigator.wakeLock.request('screen')`. This prevents the player's phone screen from auto-dimming or locking while they are watching the draw. The wake lock is released when the player navigates away from the live game.

**Audio Mute Toggle:** A prominent mute button (speaker icon with a cross) is rendered on the live game screen. In Phase 1, this button is shown but functionally inactive (no audio). In Phase 2, it mutes/unmutes the custom audio files.

**Keyboard navigation:** All interactive elements are focusable and operable via keyboard (Tab, Enter, Space) for desktop users.

### 16.6 Localization — Copy and Language

The UI is written in the natural dialect of Darjeeling and Sikkim — not in formal English, and not in generic Indian English. The copy should feel like it was written by a local friend running the game, not by a corporate team.

Examples:

| Generic Copy | Localized Copy |
|---|---|
| "Enter your nickname" | "Choose your Housie name, daju! (e.g., HillBoy99)" |
| "Payment confirmed" | "Payment received! 🙏 Your tickets are safe bhai!" |
| "Booking expired" | "Timout bho! Come on, rebook quickly!" |
| "Game is starting" | "Aayo game! Get your tickets ready!" |
| "You won!" | "HOUSIE! 🎉 [Housie Name] le jityo!" |

All copy strings are centralized in a `localization.ts` file so they can be easily reviewed and updated.

### 16.7 Branding

**Footer (all public pages):**
> "Powered by Mission for Operations & Development (MOD)"

**Trust badges on the landing page:**
- "🔒 Secure P2P Payments — Your money goes directly to your local Agent"
- "🎲 Certified Fair Play — All draws are cryptographically generated and fully auditable"
- "📱 Mobile-First — Built for smartphones, plays perfectly on any screen"

---

## CHAPTER 17: SMART FEATURES INDEX

This chapter consolidates all "Smart Features" — the quality-of-life enhancements that elevate Housie Ghar from a functional utility to a genuinely delightful, community-driven product.

### SF-1: WhatsApp 1-Click Templates (Agent UI)

**Problem solved:** Agents handle dozens of WhatsApp conversations per game. Typing the same messages repeatedly is slow and error-prone.

**Implementation:** Each Request Card in the Agent's Live Queue has a "💬 WhatsApp" button. Tapping it opens a small overlay with three pre-formatted message buttons. Tapping any message copies it to the clipboard and optionally opens the `wa.me` deep link to that Player's chat window.

**The three templates:** Payment Request, Confirmation Received, and Ticket Expired (see §11.5 for full text).

**Phase 1 status:** Fully implemented.

### SF-2: Ghost Host Auto-Resume (Backend + Operator UI)

**Problem solved:** If the Operator loses internet during a live game, does the game stop? No.

**Implementation:** The Game Engine (Conductor) runs entirely on the backend server, not on the Operator's device. The Operator's console is just a viewing and control interface. If the Operator disconnects:
- The Conductor continues drawing numbers autonomously
- Win detection continues operating
- Prizes are awarded automatically
- Players experience no disruption

If the entire backend server crashes:
- On restart, the server reads all games with `game_status = 'Live'` from the database
- For each live game, it reads the pre-saved `draw_sequence` and `current_index` from `Game_Logs`
- It restores the game state to Redis and restarts the Conductor from the last recorded position
- Maximum player disruption: ~30 seconds of connection loss

**Phase 1 status:** Fully implemented.

### SF-3: Live Emoji Reactions (Player UI)

**Problem solved:** Physical Housie halls are loud — groans, cheers, excitement. Digital games feel silent and isolating.

**Implementation:** A fixed reaction bar at the bottom of the live game screen shows 5–8 emoji options (🎉 😮 😤 🤩 😂 🙏). When a Player taps an emoji:
- The emoji appears as a floating element that rises up the right side of the screen
- It fades out after 2 seconds
- Other Players see the same floating emoji appear (via SSE broadcast)

**Technical approach:** To avoid server strain from a full chat system, emoji reactions are sent to a dedicated lightweight Redis channel and broadcast via SSE with high rate-limiting (max 1 reaction per Player per 2 seconds).

**Phase 1 status:** Fully implemented.

### SF-4: Dynamic Speed Slider (Operator UI)

**Problem solved:** Players may message in the WhatsApp group that the game is too fast or too slow. The Operator needs to adjust without disrupting the draw.

**Implementation:** The Operator's Live HUD has a slider from 5s (Fast) to 12s (Relaxed), defaulting to 8s (Normal). Moving the slider:
1. Sends a `speed_change` WebSocket event from the Operator's browser to the server
2. The server updates `game:{game_id}:interval_ms` in Redis
3. The Conductor reads this value before scheduling each next tick — the new speed takes effect on the very next draw

The draw that is currently in progress is not interrupted. The change applies from the next tick onwards.

**Phase 1 status:** Fully implemented.

### SF-5: The Tease Animation (Player UI — Visual Only in Phase 1)

**Problem solved:** In a physical Housie hall, the Caller creates suspense by calling the number before showing the ball. Digital draws feel instant and flat.

**Implementation (Phase 1 — visual only):**
1. Backend broadcasts draw number
2. Frontend receives number
3. Tambola Cage animation begins (ball bouncing, dramatic spin)
4. **1,200ms delay** — the number is hidden during this time
5. Number "reveals" with an animation — slides in or fades in dramatically
6. Ticket auto-marking occurs simultaneously with the reveal

**Phase 2 enhancement:** Custom audio plays at Step 3; the 1,200ms delay separates hearing the number from seeing it.

**Phase 1 status:** Implemented (visual tease only, no audio).

### SF-6: Fast Filling Badge (Lobby)

**Problem solved:** Players don't know when to create urgency around a game.

**Implementation:** The ticket fill percentage is calculated in real-time via SSE updates to the Game Cards in the lobby. JavaScript checks:
- If fill % >= 80%: Display animated orange "Fast Filling!" badge on the Game Card
- If fill % = 100%: Game Card grays out; button becomes "Sold Out" (unclickable)

**Phase 1 status:** Fully implemented.

### SF-7: Auto-Expiry Sweeper (Backend Cron)

**Problem solved:** Agents cannot manually reject every expired booking. Some will be missed, leaving tickets in "Locked" state indefinitely.

**Implementation:** `node-cron` runs a background job every 30 seconds that queries:
`SELECT * FROM Tickets WHERE locked_until < NOW() AND status = 'Locked'`

For each result:
1. Sets `Tickets.status = 'Available'`
2. Sets `Bookings.booking_status = 'Expired'`
3. Sends a WebSocket notification to the assigned Agent: "Booking #BKG-XXXX automatically expired"
4. The Request Card in the Agent's queue automatically removes itself
5. The Player's lock modal shows "Time's up! Please rebook."

**Phase 1 status:** Fully implemented.

### SF-8: Player Spam Flagging (Agent UI)

**Problem solved:** Some players repeatedly lock tickets and never pay, denying legitimate players from booking.

**Implementation:**
- Agents tap "Flag Spam" on an expired Request Card
- Each flag is stored with: `booking_id`, `agent_id`, `player_device_fingerprint`, `flagged_at`
- A `Platform_Config` entry defines `spam_flag_threshold` (default: 3)
- If a player's device fingerprint accumulates `spam_flag_threshold` flags from different Agents: a 24-hour soft-ban is applied
- During the soft-ban: `POST /api/bookings/lock` returns HTTP 429 with message "Booking temporarily disabled."
- Superadmins can review and clear soft-bans from the User Management panel

**Phase 1 status:** Fully implemented.

### SF-9: Screen Wake Lock (Player UI)

**Problem solved:** A player's phone screen auto-dims or locks while they are watching the draw, causing them to miss their number.

**Implementation:**
```
When the #live section enters the viewport:
    navigator.wakeLock.request('screen')

When the player navigates away from the live game:
    wakeLock.release()
```

The `useWakeLock` custom React hook manages this lifecycle. If the Wake Lock API is not supported (some older browsers), the hook fails silently with no error.

**Phase 1 status:** Fully implemented.

### SF-10: Batch Audio Upload (Superadmin — Phase 2 Architecture)

**Problem solved:** Uploading 90 individual audio files one by one through a web interface would take 30+ minutes.

**Implementation (architecture ready, activated in Phase 2):**
- A drag-and-drop zone in the Superadmin Audio Hub accepts a single `.zip` file
- The backend extracts the zip, validates each file is named `1.mp3` to `90.mp3` (or `.wav`)
- Each file is validated for size (≤ 500KB) and MIME type
- Valid files are moved to `backend/public/audio/` and mapped in the `Audio_Assets` table
- A summary report is returned: "87 files uploaded. 3 errors: [21.mp3 too large, 55.mp4 wrong format, 99.mp3 invalid number]"

**Phase 1 status:** UI present (grayed out), backend endpoint architecture designed. Activated in Phase 2.

---

## CHAPTER 18: LOCAL DEPLOYMENT SETUP

### 18.1 Prerequisites (Host Machine)

The machine running the platform must have the following installed:

| Software | Version | Purpose |
|---|---|---|
| Node.js | 20 LTS or higher | Runs both frontend and backend |
| npm | 10+ | Package management |
| Docker Desktop | Latest | Runs PostgreSQL and Redis |
| Docker Compose | v2.x | Orchestrates all services together |
| Git | Any | Code version control |

### 18.2 Environment Variables (`.env` file)

Create a `.env` file in the project root. This file must never be committed to Git.

```
# Database
DATABASE_URL=postgresql://housie_user:housie_password@localhost:5432/housie_ghar

# Redis
REDIS_URL=redis://localhost:6379

# Authentication
JWT_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\n[your private key]\n-----END RSA PRIVATE KEY-----
JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n[your public key]\n-----END PUBLIC KEY-----
JWT_EXPIRY=24h

# Application
NODE_ENV=development
PORT=4000
FRONTEND_URL=http://localhost:3000

# Admin Seed
SUPERADMIN_EMAIL=superadmin@housieghar.local
SUPERADMIN_TEMP_PASSWORD=ChangeMe123!

# Security
LOCK_DURATION_MINUTES=10
MAX_LOCK_ATTEMPTS_PER_MINUTE=5
SPAM_FLAG_THRESHOLD=3
LOW_BALANCE_THRESHOLD=500
```

### 18.3 Service Startup Sequence

```
1. Start PostgreSQL and Redis via Docker Compose
2. Run database migrations (creates all tables)
3. Run database seeds (creates Superadmin account, roles, default theme)
4. Start the Backend (Express.js on port 4000)
5. Start the Frontend (Next.js on port 3000)
```

### 18.4 LAN Access for Players

Once the platform is running on the host machine:

1. Find the host machine's local IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
2. Look for the IP address on the local Wi-Fi adapter (e.g., `192.168.1.15`)
3. Players on the same Wi-Fi network access the platform at: `http://192.168.1.15`
4. The Nginx reverse proxy (port 80) routes requests to the appropriate service

All staff (Admins, Operators, Agents) access their dashboards at: `http://192.168.1.15/admin/login`

### 18.5 Phase 2 Deployment Path

When the platform is ready to go public, the transition path is:

1. Provision a cloud server (e.g., AWS EC2, DigitalOcean Droplet)
2. Enable HTTPS (TLS certificate via Let's Encrypt or AWS Certificate Manager)
3. Configure a real domain (www.housieghar.com)
4. Set up managed PostgreSQL and Redis services (AWS RDS + ElastiCache)
5. Set up Cloudflare in front of the application for DDoS protection
6. Configure Auto-Scaling Groups for peak game-night traffic

The codebase requires no structural changes — only environment variable updates.

---

## CHAPTER 19: OUT OF SCOPE (PHASE 1)

The following features are explicitly deferred from Phase 1. They are documented here to ensure the Phase 1 architecture does not accidentally block their future implementation.

| Feature | Why Deferred | Phase 1 Architecture Impact |
|---|---|---|
| Native iOS/Android App | Requires additional React Native development cycle | None — web app is fully mobile-responsive |
| Direct Player Fiat Wallets | Regulatory complexity; RBI compliance required | None — P2P via WhatsApp covers all Phase 1 financial flow |
| Live Video Streaming | High bandwidth; complex CDN setup | None — all gameplay is automated UI and animations |
| Custom Audio for Number Calls | Audio asset creation (90 files) not yet ready | Audio system architecture is built; UI is present but inactive |
| Cloud Deployment | Phase 1 is local; cloud setup comes later | Code is cloud-ready; only `.env` changes needed |
| Email Notifications | SMTP/email service not configured yet | Backend `users.service.ts` has email stub; easy to activate |
| Player Accounts / Login | Adds complexity; P2P flow works session-based | No schema changes needed; `Users` table is staff-only by design |
| In-App Prize Payout Tracking | Prizes are tracked in the database; actual payout is manual | Database records winners; financial settlement is offline |

---

## CHAPTER 20: GLOSSARY OF TERMS

| Term | Full Explanation |
|---|---|
| **ACID** | Atomicity, Consistency, Isolation, Durability. The four properties that guarantee database transactions are processed reliably. PostgreSQL is ACID-compliant. |
| **Audit Log** | An immutable chronological record of every state-changing action performed by any staff member on the platform. |
| **Booking** | The process of a Player reserving tickets by clicking "Book Now." Creates a soft-lock and triggers the WhatsApp P2P flow. |
| **booking_id** | A unique identifier for each booking attempt. Shared between the Player (shown on their lock screen), the Agent (shown in their queue), and the backend (used for all status updates). Format: UUID internally, displayed as "#BKG-XXXX". |
| **Conductor** | The backend timer module that pops numbers from the pre-shuffled draw sequence at configurable intervals and broadcasts them to all connected clients. |
| **CSPRNG** | Cryptographically Secure Pseudorandom Number Generator. The type of RNG used for the Fisher-Yates shuffle. In Node.js, this is `crypto.randomInt()`. |
| **Digital Wallet** | The virtual credit balance maintained by the platform for each Agent. Agents "purchase" ticket inventory by topping up their wallet; each confirmed booking deducts from their balance. |
| **draw_sequence** | The pre-generated, cryptographically shuffled array of numbers 1–90 that defines the exact order of the draw for a given game. Saved to the database before the first number is drawn. |
| **Fisher-Yates Shuffle** | A classic algorithm for generating a random permutation of an array with provably uniform distribution. When combined with CSPRNG, every ordering of 1–90 is equally likely. |
| **Ghost Host** | The scenario where an Operator's device disconnects during a live game. Because the Conductor runs on the server, the game continues autonomously. The Operator can reconnect from any device and resync. |
| **Housie Name** | The mandatory, unique nickname chosen by a Player during the ticket booking process. Used for all public winner announcements. Not a real name — a fun, culturally resonant alias. |
| **HttpOnly Cookie** | A browser cookie that cannot be accessed by JavaScript. Used to store the JWT to prevent XSS attacks from stealing authentication tokens. |
| **JWT (JSON Web Token)** | A cryptographically signed token encoding a user's identity and role. Used to authenticate all staff API requests. |
| **Lock Screen Modal** | The non-dismissible overlay that appears on the Player's screen after clicking "Book Now," showing the 10-minute countdown timer and WhatsApp payment instructions. |
| **MOD** | Mission for Operations & Development. The founding organization behind Housie Ghar. Credited in the platform footer. |
| **P2P (Peer-to-Peer)** | In this context, the financial model where Players transfer money directly to Agents via UPI/WhatsApp, bypassing any central payment gateway. |
| **PITR (Point-in-Time Recovery)** | A PostgreSQL backup capability that preserves Write-Ahead Logs, allowing the database to be restored to any specific minute in history. |
| **Prize Pool** | The set of winning categories and their monetary values for a specific game, configured by the Admin during the Game Builder Wizard. |
| **RBAC (Role-Based Access Control)** | The five-tier permission system governing every capability on the platform. Each user's role determines exactly what they can see and do. |
| **Redis Pub/Sub** | A publish-subscribe messaging system built into Redis. The Game Engine publishes draw events; the SSE manager and Socket.io server subscribe and relay them to connected clients. |
| **Round-Robin** | The Agent assignment algorithm. Booking requests are distributed evenly across all active Agents in order, cycling back to the first Agent after the last. |
| **RNG (Random Number Generator)** | The algorithm that produces the draw sequence. Housie Ghar uses a CSPRNG — never `Math.random()`. |
| **SameSite: Strict** | A cookie setting that prevents the cookie from being sent on any cross-site request, protecting against CSRF attacks. |
| **SELECT ... FOR UPDATE** | A PostgreSQL query clause that places a pessimistic row-level lock on the selected rows, preventing concurrent transactions from modifying them. Critical for the ticket booking concurrency engine. |
| **Soft Lock** | The 10-minute temporary reservation of tickets placed when a Player clicks "Book Now." The tickets are marked "Locked" and reserved exclusively for that Player while they complete payment via WhatsApp. |
| **SSE (Server-Sent Events)** | A web standard for one-way server-to-client data streaming over HTTP. Used to push live game events to Player browsers. More memory-efficient than WebSockets for one-way flows. |
| **Tambola Cage** | The frontend CSS animation that simulates the physical revolving cage used in traditional Housie to mix numbered balls before drawing. |
| **Tie-Breaker** | When two or more tickets simultaneously achieve the same winning pattern on the same drawn number, the prize is split equally among all winners. Both Housie Names are announced. |
| **wa.me Deep Link** | The WhatsApp URL scheme (`https://wa.me/[phone]?text=[message]`) that opens the WhatsApp application on a user's device with a pre-typed message and a specific contact. |
| **Wallet Liability** | The total sum of all Agent digital wallet balances across the platform. Represents the total value of unsold ticket inventory held by the Agent network. Displayed on the Superadmin dashboard. |
| **WebSocket** | A persistent, bidirectional TCP connection between a browser and a server. Used for Operator and Agent interfaces where data flows in both directions (commands sent upstream, events received downstream). |
| **Zustand** | The lightweight state management library used in the Next.js frontend. Manages global state (live game data, booking state, authentication) with minimal boilerplate. |
```
