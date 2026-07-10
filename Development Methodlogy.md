# Housie Ghar: Development Methodology & Architecture

This document defines the technology stack, system topology, sprint delivery plan, testing parameters, and operational protocols for building and deploying **Housie Ghar**. It covers how the platform handles high-concurrency player booking spikes, real-time draw streams, financial ledger integrity, and local area network (LAN) execution.

---

## 1. System Topology & Recommended Tech Stack

The platform uses a decoupled, stateless architectural model designed to run inside local Docker containers or scale to cloud-managed infrastructures.

```
                    ┌────────────────────────┐
                    │    Next.js Frontend    │ (Lobby SSR, Game SPA)
                    └───────────┬────────────┘
                                │
                    HTTP / SSE  │  WebSockets (Socket.io)
                    (Players)   │  (Staff Portals)
                                ▼
                    ┌────────────────────────┐
                    │    Node.js Backend     │ (Express API & Conductor)
                    └────┬──────────────┬────┘
                         │              │
             Read/Write  │              │  Pub/Sub & Cache
             (ACID Locks)│              │  (State Sync / Locks)
                         ▼              ▼
                    ┌──────────┐  ┌──────────┐
                    │Postgres  │  │  Redis   │
                    │(Database)│  │ (Cache)  │
                    └──────────┘  └──────────┘
```

### A. Frontend Layer: Next.js (React) & Vanilla CSS / Tailwind
*   **Performance (Lobby):** Next.js handles server-side rendering (SSR) for the lobby landing page, allowing ticket capacity trackers and countdowns to load in under **2 seconds**.
*   **SPA Live Game Client:** The live execution view acts as a client-side Single Page Application (SPA), utilizing React hooks for EventSource (SSE) streams, local audio playback, and floating emoji engines.
*   **Styling & Responsiveness:** Pure CSS modules or Tailwind configurations define layout matrices, glassmorphic navigations, and custom keyframe animations.

### B. Backend Layer: Node.js (Express)
*   **Event-Loop Concurrency:** Node.js manages thousands of simultaneous Server-Sent Events (SSE) connections with minimal memory overhead.
*   **Real-time Handlers:** Express coordinates authentication middlewares, transaction locking queries, and WebSockets (Socket.io) for live staff portals.

### C. Database Layer: PostgreSQL (ACID Compliant)
*   **Locking Integrity:** Pessimistic database locking (`SELECT FOR UPDATE`) prevents double bookings when players attempt to lock the same ticket concurrently.
*   **Auditability:** Standard ledger tables record agent digital wallet credits/debits atomically, supported by database triggers that prevent updates or deletions on audit tables.

### D. In-Memory Cache & Message Broker: Redis
*   **State Caching:** Temporary booking locks, round-robin rosters, and draw streams are cached in Redis to eliminate database query bottlenecks.
*   **Pub/Sub Relay:** Coordinates draw events across multiple API instances during horizontal scaling.

---

## 2. Six-Sprint Development Lifecycle

The implementation is structured across six consecutive development sprints:

### Sprint 1: Database Setup & Infrastructure Foundation
*   Configure Docker container services for PostgreSQL and Redis.
*   Write SQL migration files (001–010) defining core tables (`Users`, `Games`, `Tickets`, `Bookings`, `Wallet_Ledger`, `Game_Logs`, `Audit_Logs`).
*   Establish seeding routines that generate the master Superadmin profile (`superadmin` / `Enterhg@0902`).

### Sprint 2: Core Booking API & Concurrency Logic
*   Build the `POST /api/booking/lock-ticket` endpoint, wrapping ticket updates in a PostgreSQL transaction block using row-level locking.
*   Program the **Round-Robin Routing Engine** for bookings, implementing wallet balance checks and "Skip-and-Route" notifications.
*   Configure the database fallback queue to route bookings to the Operator if no agents are funded.

### Sprint 3: Real-Time Stream Services (SSE & WebSockets)
*   Develop the Conductor engine shuffler using Node's cryptographically secure `crypto.randomInt()`.
*   Establish the Server-Sent Events channel (`GET /api/stream/game/[game_id]`) to broadcast active draw states and winner announcements to player clients.
*   Set up Socket.io channels for real-time booking updates on Agent and Operator interfaces.

### Sprint 4: Unified Design System & Frontend Portals
*   Integrate color tokens, custom font styling, glassmorphic headers, and footer components.
*   Construct dashboard UI screens for Superadmin, Admin, Operator, CFO, Promoter, and Bookie roles.
*   Build the player onboarding Sign-Up and Login interfaces.

### Sprint 5: Live Game Room Interface & Gameplay Features
*   Construct the interactive 1-90 number grid, support CSS ticket cell hits (cross-out animations), and render pop-art winner explosion overlays.
*   Program the **Audio-Visual Tease Delay** using the browser's Audio API, pausing draw updates for **1200ms** after voice playback completes.
*   Implement client reconnection hydration routines.

### Sprint 6: Load Testing, Security Hardening, & Deployment
*   Configure CORS constraints, rate-limiters, and secure HttpOnly cookie sessions.
*   Run simulation scripts testing ticket locks under high player spikes.
*   Set up automated database backup sequences.

---

## 3. Testing & Verification Strategies

### A. Concurrency Race-Condition Simulation
*   **Method:** Run Artillery or JMeter scripts firing 500 concurrent HTTP requests to `POST /api/booking/lock-ticket` requesting the same ticket ID within a 10ms window.
*   **Pass Criteria:** The database must return exactly one `200 OK` lock confirmation (attributing the ticket to a single player with a 10-minute lock) and 499 `409 Conflict` database lock rejections.

### B. Wallet Liquidity Reconciler Verification
*   **Method:** Set an Agent's wallet balance to ₹1,000. Initiate 5 parallel bookings of ₹300 tickets assigned to this Agent.
*   **Pass Criteria:** The transaction engine must process exactly 3 bookings, deducting ₹900 from the Agent's wallet. The 4th and 5th bookings must be skipped, routed to the next funded agent, and trigger low-wallet warnings on the skipped Agent's screen.

### C. Network Interruption & Hydration Test
*   **Method:** Disconnect a client browser's network adapter for 30 seconds during a live draw, then reconnect it.
*   **Pass Criteria:** The client must capture the connection failure, re-establish connection, query `GET /api/game/[game_id]/sync`, retrieve the updated `drawn_numbers` array, and highlight the matching ticket numbers retroactively.

---

## 4. Disaster Recovery & Operations

### A. Point-in-Time Recovery (PITR)
*   **Mechanism:** Enable PostgreSQL Write-Ahead Logs (WAL) archiving.
*   **Purpose:** Allows administrators to restore database states to a specific second, safeguarding agent wallet data in the event of data corruption.

### B. Ghost Host Conductor Auto-Resume
*   **Mechanism:** If the backend process crashes mid-game, the process manager (PM2) restarts the application.
*   **Purpose:** Upon boot, the engine scans the database for active games (`game_status == 'Live'`), reads the saved `draw_sequence` and current draw index, and resumes the conductor loop without interrupting client streams.
