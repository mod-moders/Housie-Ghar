# PRD1.md — Housie Ghar: Product Requirements Document

| Field | Value |
|-------|-------|
| Version | 1.0 |
| Status | Approved |
| Date | 2026-06-05 |
| Author | PriyamThapa |
| Scope | Phase 1 (Local/LAN Deployment) |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Success Metrics](#3-goals--success-metrics)
4. [User Personas & Journeys](#4-user-personas--journeys)
5. [System Overview](#5-system-overview)
6. [Feature Specification — Phase 1](#6-feature-specification--phase-1)
7. [API Reference](#7-api-reference)
8. [Data Model Summary](#8-data-model-summary)
9. [Non-Functional Requirements](#9-non-functional-requirements)
10. [MoSCoW Prioritization](#10-moscow-prioritization)
11. [Risk Register](#11-risk-register)
12. [Phase 2 Roadmap](#12-phase-2-roadmap)
13. [Glossary](#13-glossary)

---

## 1. Executive Summary

**Housie Ghar** is a full-stack web application that digitizes Housie (Tambola), the Indian community number-drawing game. It replaces manual callers, paper tickets, cash envelopes, and handwritten ledgers with a real-time, auditable platform — while preserving the social ceremony that makes Housie worth playing.

**Core value proposition:** A game organizer can run a fully verified, dispute-free Housie session from a single laptop on a local network. Players join on their phones with no app download. Prizes are paid out within seconds of a win. Every draw, booking, and transaction is on the record.

**Deployment model (Phase 1):** Single Docker Compose stack on a local machine. Players and staff connect over LAN (e.g., `http://192.168.1.15`). No internet dependency, no cloud costs, no payment gateway.

**Phase 1 scope:** Five role-based workspaces (Player, Agent, Operator, Admin, Superadmin), automated draw engine with cryptographic fairness, real-time ticket highlighting via SSE, P2P payment workflow through agent digital wallets, and a tamper-proof audit log.

---

## 2. Problem Statement

### How Housie Is Run Today

Traditional Housie sessions are manual end-to-end. A caller draws numbered tokens from a bag, shouts each number, and players manually cross off matches on paper tickets. Winners self-declare and walk to the front to have their card hand-verified. Cash is collected before the game in envelopes, prize pools are calculated on the fly, and payouts happen on trust.

### Pain Points

| Pain Point | Who Suffers | Impact |
|---|---|---|
| Draw disputes ("you skipped 47!") | Players, Organizer | Erodes trust, derails games |
| Manual ticket verification | Operator | 3–10 min delay per winner |
| Cash collection chaos | Agents, Players | Lost cash, wrong change, no receipt |
| No audit trail | Organizer | Zero accountability for disputes |
| Caller fatigue | Operator | Error rate climbs after 60+ numbers |
| No attendance insight | Admin | Can't optimize future games |
| Paper ticket counterfeiting | Organizer | Prize fraud risk |

### The Opportunity

Digitize the mechanics (draw, tickets, verification, payment ledger) while keeping the social layer intact. Players still gather. An Operator still runs the show. Agents still handle cash — but now from a digital queue with a wallet, not a shoebox. The draw is automated and cryptographically provable. Winners are auto-detected in milliseconds.

---

## 3. Goals & Success Metrics

### Phase 1 Goals

| Goal | KPI | Target |
|---|---|---|
| Fast setup | Time from login to first draw | < 10 minutes |
| Zero draw disputes | Draw sequence verifiability | Cryptographic audit trail in Game_Logs |
| Low booking abandonment | % of locks that expire without confirmation | < 5% |
| Fast agent settlement | Time from booking lock to wallet debit | < 60 seconds |
| Draw reliability | % of scheduled ticks fired on time | ≥ 99.9% per game session |
| Staff adoption | % of game sessions requiring manual intervention | < 2% |
| Accurate win detection | False positive / false negative rate | 0% (all patterns verified) |

### Phase 1 Non-Goals

- Public internet accessibility
- Player accounts or registration
- Automated payment processing (Razorpay, Stripe, etc.)
- Mobile native app

---

## 4. User Personas & Journeys

### 4.1 Player (Anonymous)

**Profile:** Community member, 18–60, comfortable with smartphones, no technical expectation.

**Journey:**

```
1. Open browser → navigate to game URL (shared via WhatsApp group)
2. Browse lobby → see available games with prize pool and fill %
3. Enter Housie Name (alias, 3–20 chars) → choose 1–6 tickets
4. Submit lock request → see "Locked! Agent will confirm"
5. Pay agent via UPI/cash (offline or WhatsApp instruction)
6. Booking status flips to Sold → ticket grid unlocks on screen
7. Watch live draw → numbers highlight on their ticket in real time
8. If win → celebration overlay appears automatically
9. Collect prize from agent/operator
```

**Key needs:** Fast ticket selection, real-time feedback, no login friction, mobile-first layout.

**Edge cases:** Booking times out if agent doesn't confirm in 10 min → tickets released, player must re-lock.

---

### 4.2 Agent

**Profile:** Trusted community member, handles 10–50 booking requests per game session, manages cash collection.

**Journey:**

```
1. Login → Agent Workspace loads with wallet balance visible
2. New booking request arrives via WebSocket notification
3. Review: player Housie Name, ticket numbers, lock expiry countdown
4. Collect payment (cash/UPI) from player in person or via WhatsApp
5. Press Confirm → wallet deducted by ticket price × count → tickets flip to Sold
   OR press Reject → tickets released, player re-queues
6. Watch game → celebrate wins with players
7. Request wallet top-up from Admin when balance runs low
```

**Key needs:** Real-time queue with expiry countdown, clear wallet balance, fast confirm/reject UX.

**Edge cases:** Wallet insufficient → confirm blocked; agent must request top-up first. Lock expires before confirmation → booking auto-cancelled, tickets auto-released by 30s sweeper cron.

---

### 4.3 Operator

**Profile:** Game runner, often the event MC. Responsible for the live experience.

**Journey:**

```
1. Login → Operator Console loads
2. Verify game is in Scheduled state, ticket sales are open
3. Press Start → conductor loop begins, first number drawn after interval
4. Adjust speed slider if crowd energy shifts (5s fast ↔ 12s slow)
5. Pause when needed (restroom break, prize ceremony) → draw halts
6. Resume → draw continues from next number in sequence
7. All 90 numbers drawn OR Full House claimed → game auto-completes
8. Review draw log and winner summary
```

**Key needs:** Single-button game control, speed slider, clear current-number display, winner feed.

**Edge cases:** Operator disconnects mid-game → game remains live (in-memory engine independent of WebSocket connection). Ghost Host auto-resume planned for Phase 2.

---

### 4.4 Admin

**Profile:** Event organizer, manages the game schedule and staff roster.

**Journey:**

```
1. Login → Admin Console
2. Create game: set name, date/time, ticket price, ticket count, prize patterns + amounts
3. Assign operator to game
4. Monitor active games → view ticket fill percentage in real time
5. Manage agents: create accounts, approve top-up requests, adjust wallet balances
6. View financial summary: total revenue, agent ledger, outstanding top-ups
7. Review game history and exports
```

**Key needs:** Game builder form, agent management table, financial oversight.

---

### 4.5 Superadmin

**Profile:** Platform owner. Full system access, infrequent use.

**Journey:**

```
1. Login → Superadmin Dashboard
2. Manage all staff (create/suspend any role)
3. Configure platform: prize pool cap %, lock duration, rate limits via Platform_Config
4. Review immutable audit log for any dispute
5. Switch UI theme globally (Default / Dark / Festive / Classic Hall)
6. Trigger backup or view backup schedule
```

**Key needs:** Audit log search, platform config editor, theme management.

---

## 5. System Overview

### Architecture

```
┌──────────────────────────────────────────────────┐
│                   LAN Clients                    │
│  Players (phone browser)  Staff (laptop/tablet)  │
└──────────┬────────────────────────┬──────────────┘
           │ HTTP/WebSocket          │ HTTP/WebSocket
           ▼                        ▼
┌──────────────────────────────────────────────────┐
│                  Nginx :80                       │
│  /api/* → backend:4000   /* → frontend:3000      │
└──────────┬──────────────────────────┬────────────┘
           │                          │
     ┌─────▼──────┐           ┌───────▼──────┐
     │  Next.js   │           │  Express.js  │
     │  :3000     │           │  :4000       │
     │  App Router│           │  REST + WS   │
     └────────────┘           └───────┬──────┘
                                      │
               ┌──────────────────────┴──────────────┐
               │                                     │
         ┌─────▼──────┐                     ┌────────▼────┐
         │ PostgreSQL │                     │   Redis 7   │
         │    :5432   │                     │    :6379    │
         │  (ACID DB) │                     │  (Pub/Sub + │
         └────────────┘                     │   cache)    │
                                            └─────────────┘
```

### Real-Time Event Flow

```
Game Engine (in-memory)
       │
       │ publishGameEvent()
       ▼
Redis Pub/Sub channel: "game_events"
       │
       ├──► SSE Manager → broadcast to all Player SSE connections
       │    (DrawEvent, WinnerEvent, PausedEvent, ResumedEvent, CompletedEvent)
       │
       └──► Socket.io → emit to Operator room (game-{id}) and Agent room (agent-{id})
            (draw_update, winner_announced, paused, resumed, new_booking_request)
```

### Financial Model

No payment gateway. Zero platform fee on transactions.

```
Player ──[cash/UPI]──► Agent (offline)
                          │
                    Agent confirms booking
                          │
                    Agent wallet debited (PostgreSQL)
                          │
                    Wallet_Ledger entry created (immutable)
                          │
                    Admin tops up agent wallets (credit entry)
```

Agents operate as pre-funded float holders. The platform tracks wallet state but never touches real money.

---

## 6. Feature Specification — Phase 1

### 6.1 Player Interface & Booking Engine

**Description:** Anonymous players browse scheduled games, select up to 6 tickets, and initiate a soft-lock booking. A round-robin assigned agent confirms and collects payment within 10 minutes.

**Acceptance Criteria:**

- [ ] Player can view all games in `Scheduled` or `Live` status with ticket availability percentage
- [ ] Player enters a Housie Name (3–20 alphanumeric chars) and selects 1–6 `Available` tickets
- [ ] On submit, selected tickets transition to `Locked` status atomically (SELECT FOR UPDATE)
- [ ] A booking record is created with a 10-minute expiry (`locked_until`)
- [ ] An agent is assigned via round-robin across active agents for that game
- [ ] Player receives a `booking_id` and can poll `/api/bookings/status/:booking_id`
- [ ] If agent confirms → tickets flip to `Sold`, booking status → `Sold`
- [ ] If agent rejects → tickets flip to `Available`, booking status → `Cancelled`
- [ ] If 10 minutes elapse without confirmation → expiry sweeper releases tickets to `Available`, booking → `Expired`
- [ ] Player's sold ticket grid highlights drawn numbers in real time via SSE
- [ ] Rate limit: max 5 lock attempts per minute per IP; max 3 simultaneous locked bookings per IP

**Edge Cases:**
- Two players attempt same ticket simultaneously → only one succeeds (DB lock prevents double-booking)
- Player submits invalid Housie Name → 400 error with validation message
- All agents offline → booking still created, agent assigned on next active login

---

### 6.2 Automated Game Engine

**Description:** A cryptographically fair draw conductor runs as an in-memory loop, drawing one number every configurable interval (5–12s). Win detection runs after every tick against all sold tickets.

**Acceptance Criteria:**

- [ ] Draw sequence of 1–90 is generated once at game start using Fisher-Yates + `crypto.randomInt` (CSPRNG)
- [ ] Full sequence is persisted to `Game_Logs` immediately on generation
- [ ] Each tick: next number drawn, `Game_Logs.drawn_numbers` appended, Redis event published
- [ ] Default draw interval: 8 seconds; configurable per operator 5–12s
- [ ] Win detection runs after every draw across all `Sold` tickets for all unclaimed prize patterns
- [ ] Supported prize patterns: Early Five, Top Line, Middle Line, Bottom Line, Four Corners, Full House
- [ ] Multiple tickets matching same pattern on same tick → prize split equally (`split_count` recorded)
- [ ] 4-second pause inserted after winner announcement before next draw
- [ ] Game auto-completes when all 90 numbers drawn or Full House claimed
- [ ] Operator can pause and resume draw at any time
- [ ] All game events (draw, win, pause, resume, complete) broadcast via Redis Pub/Sub

**Edge Cases:**
- Process restart mid-game → `Game_Logs` contains enough state to restore `currentIndex` and `drawnNumbers`
- Operator changes speed during draw → new interval takes effect on next tick
- No tickets sold → game still runs to completion, no winners declared

---

### 6.3 Agent Workspace

**Description:** Agents receive booking requests in real time, review the lock countdown, and confirm or reject. Their digital wallet is debited on confirmation.

**Acceptance Criteria:**

- [ ] Agent receives `new_booking_request` WebSocket event with booking details and lock expiry
- [ ] Queue displays: Housie Name, ticket count, ticket numbers, time remaining to expiry
- [ ] Confirm action: checks agent wallet balance ≥ (ticket price × count); if sufficient, deducts and marks booking Sold
- [ ] Reject action: releases tickets to Available, marks booking Cancelled
- [ ] Wallet balance displayed in real time; `WalletCreditedEvent` pushed on top-up approval
- [ ] Agent can request top-up from Admin; request appears in Admin dashboard
- [ ] Expired bookings auto-removed from queue (swept by 30s cron, `BookingExpiredEvent` sent)
- [ ] Low balance warning shown when wallet < ₹500

**Edge Cases:**
- Wallet exactly equal to required amount → confirmation succeeds (not blocked)
- Multiple agents assigned to same game → each agent only sees their own queue
- Agent logs in after booking was assigned → booking still visible if still within lock window

---

### 6.4 Operator Console

**Description:** Operators manage the live game HUD: start, pause, resume, and adjust draw speed. They see the full conductor event log and current game state.

**Acceptance Criteria:**

- [ ] Start button transitions game from `Scheduled` to `Live` and initializes conductor
- [ ] Current number display shows the most recently drawn number prominently
- [ ] Full 90-number board shows drawn (marked) vs undrawn numbers
- [ ] Draw count and total (e.g., "42 / 90") displayed
- [ ] Speed slider adjusts draw interval from 5s (fast) to 12s (slow) in real time
- [ ] Pause button halts conductor; Resume restarts it from next number
- [ ] Live prize pool panel shows each pattern: unclaimed / claimed with winner Housie Name
- [ ] Conductor event log feed shows each number as it is drawn with timestamp
- [ ] Live player count (SSE connections) displayed

**Edge Cases:**
- Start pressed on already-Live game → 409 conflict returned
- Pause pressed on already-Paused game → 409 conflict returned
- Operator disconnects → game continues in engine; reconnecting operator sees current state via REST GET

---

### 6.5 Admin Console

**Description:** Admins create and configure games, manage the agent roster, and approve wallet top-up requests.

**Acceptance Criteria:**

- [ ] Game builder: name, scheduled date/time, ticket price, total ticket count, prize patterns with prize amounts
- [ ] Prize pool validation: total prizes ≤ 80% of (ticket price × ticket count)
- [ ] Operator assigned to game during creation
- [ ] Tickets pre-generated at game creation (bulk insert to `Tickets` table)
- [ ] User management: create Agent/Operator accounts; suspend/reactivate
- [ ] Wallet management: view agent balances; approve/reject top-up requests
- [ ] Game history list with status, revenue, ticket fill %, and winner summary

**Edge Cases:**
- Admin creates game with 0 tickets → validation error
- Prize pool exceeds 80% cap → form error before save
- Admin attempts to delete a Live game → 409 conflict (must complete or cancel first)

---

### 6.6 Superadmin Control Center

**Description:** Superadmins have full platform visibility: staff management, immutable audit log, global platform configuration, and theme management.

**Acceptance Criteria:**

- [ ] All user management operations available (create/update/suspend any role)
- [ ] Audit log displays: timestamp, actor, action, target entity, IP address — non-deletable (DB trigger enforces)
- [ ] Platform_Config editor: update lock duration, rate limits, spam threshold, prize pool cap %
- [ ] Theme selector: choose one of four presets (Default, Dark, Festive, Classic Hall); change broadcasts to all connected clients via `ThemeChangeEvent`
- [ ] Spam flagging: players flagged by 3+ different agents are soft-banned for 24 hours (lock attempts return 429)
- [ ] Backup cron visible in dashboard; manual trigger available

**Edge Cases:**
- Superadmin changes `LOCK_DURATION_MINUTES` mid-session → new value applies to locks created after change; existing locks honour their original expiry
- Superadmin attempts to suspend self → 400 error (cannot self-suspend)

---

## 7. API Reference

### Auth

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/api/auth/login` | No | Any | Email + password → JWT HttpOnly cookie |
| POST | `/api/auth/logout` | No | Any | Clear JWT cookie |
| GET | `/api/auth/me` | Yes | Any | Return authenticated user profile |

### Games

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/games` | No | Public | List all games with ticket counts and prize pool |
| GET | `/api/games/:id/drawn` | No | Public | Return drawn numbers history and current index |
| GET | `/api/games/:id/live-stream` | No | Public | SSE stream: draw, winner, pause, resume events |
| POST | `/api/games/:id/start` | Yes | Operator+ | Initialize conductor, transition to Live |
| POST | `/api/games/:id/pause` | Yes | Operator+ | Halt conductor loop |
| POST | `/api/games/:id/resume` | Yes | Operator+ | Resume conductor from current index |
| POST | `/api/games/:id/speed` | Yes | Operator+ | Change draw interval (ms) |

### Tickets

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/games/:id/tickets` | No | Public | All tickets for a game (status, ticket_number) |
| GET | `/api/tickets/:ticket_id` | No | Public | Full 3×9 grid data for a single ticket |

### Bookings

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/api/bookings/lock` | No | Public | Lock tickets, assign agent, return booking_id |
| GET | `/api/bookings/status/:id` | No | Public | Poll booking status |
| GET | `/api/bookings/agent/queue` | Yes | Agent | Fetch agent's active booking queue |
| POST | `/api/bookings/agent/:id/confirm` | Yes | Agent | Deduct wallet, mark tickets Sold |
| POST | `/api/bookings/agent/:id/reject` | Yes | Agent | Release tickets, cancel booking |

### Wallet (Admin+)

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/wallet/agents` | Yes | Admin+ | List all agent wallet balances |
| POST | `/api/wallet/topup/request` | Yes | Agent | Agent submits top-up request |
| POST | `/api/wallet/topup/:id/approve` | Yes | Admin+ | Credit agent wallet, create ledger entry |
| POST | `/api/wallet/topup/:id/reject` | Yes | Admin+ | Reject top-up request |

### Admin / Superadmin

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/api/games` | Yes | Admin+ | Create game + pre-generate tickets |
| POST | `/api/users` | Yes | Admin+ | Create staff account |
| PATCH | `/api/users/:id` | Yes | Admin+ | Update / suspend user |
| GET | `/api/audit` | Yes | Superadmin | Paginated audit log |
| GET/PUT | `/api/config` | Yes | Superadmin | Read / update Platform_Config |
| PUT | `/api/themes/active` | Yes | Superadmin | Set active theme |

> **WebSocket events (Socket.io)** are not REST endpoints. See `HG/shared/types/events.ts` for full event payload contracts.

---

## 8. Data Model Summary

### Key Tables

| Table | Primary Key | Status Lifecycle | Notes |
|-------|-------------|-----------------|-------|
| `Roles` | `role_id` INT | Static (4 rows) | Superadmin(1), Admin(2), Operator(3), Agent(4) |
| `Users` | `user_id` UUID | `Active` / `Suspended` | Staff only; players are anonymous |
| `Scheduled_Games` | `game_id` UUID | `Scheduled → Live → Paused → Completed / Postponed` | Holds operator assignment |
| `Tickets` | `ticket_id` INT | `Available → Locked → Sold / Cancelled` | `grid_data` JSONB (3×9), pre-generated |
| `Bookings` | `booking_id` UUID | `Locked → Sold / Cancelled / Expired` | `ticket_ids[]`, `locked_until` for expiry |
| `Prize_Pool` | `prize_id` INT | `claimed` BOOLEAN | UNIQUE(game_id, pattern_name) |
| `Wallet_Ledger` | `entry_id` BIGSERIAL | Immutable append-only | `transaction_type`: Credit / Debit / Reversal |
| `TopUp_Requests` | `request_id` UUID | `Pending → Approved / Rejected` | Links to Wallet_Ledger on approval |
| `Game_Logs` | `log_id` INT | One row per game | `draw_sequence[]`, `drawn_numbers[]`, `current_index` |
| `Audit_Log` | `log_id` BIGSERIAL | Immutable (trigger prevents UPDATE/DELETE) | Indexed on timestamp, user_id, action |
| `Themes` | `theme_id` INT | `is_active` boolean (max 1 active) | 4 presets |
| `Platform_Config` | `config_key` VARCHAR (PK) | Key-value store | Superadmin-editable |

### Critical Status Transitions

```
Game:    Scheduled ──start──► Live ──pause──► Paused ──resume──► Live ──complete──► Completed
                                                                               └──► Postponed

Ticket:  Available ──lock──► Locked ──confirm──► Sold
                                    └──reject/expire──► Available

Booking: Locked ──confirm──► Sold
                └──reject──► Cancelled
                └──expire──► Expired (auto via 30s cron)
```

### Concurrency Controls

- Ticket locking: `SELECT FOR UPDATE` on `Tickets` rows during lock request — prevents double-booking
- Wallet debit: `SELECT FOR UPDATE` on `Users.current_balance` during booking confirmation — prevents overdraft
- Audit log: DB trigger blocks `UPDATE` and `DELETE` on `Audit_Log` — tamper-proof

---

## 9. Non-Functional Requirements

### Performance

| Requirement | Target |
|-------------|--------|
| Draw tick latency (engine to Redis publish) | < 100ms |
| SSE broadcast latency (Redis → Player browser) | < 500ms end-to-end |
| Booking lock API response time | < 300ms (p95) |
| SSE heartbeat interval | 15 seconds (prevents Nginx timeout) |
| Win detection per tick | O(tickets × unclaimed_prizes), in-memory |
| Expiry sweeper | Every 30 seconds |
| Backup cron | Daily at 03:00 |

### Security

| Control | Implementation |
|---------|---------------|
| Authentication | JWT RS256, HttpOnly + SameSite=Strict cookie, 24h expiry |
| Authorization | RBAC via `requireRole(roles[])` middleware |
| Concurrency | `SELECT FOR UPDATE` pessimistic locking |
| Rate limiting | 5 lock attempts/min/IP; 3 concurrent locks/IP |
| Audit immutability | PostgreSQL trigger blocks UPDATE/DELETE on Audit_Log |
| Ticket fairness | CSPRNG Fisher-Yates shuffle (crypto.randomInt) |
| Input validation | Housie Name: 3–20 chars; ticket count: 1–6; price > 0 |
| Spam detection | 3 agent flags → 24-hour soft-ban |

### Scalability

Phase 1 is designed for a single-machine LAN deployment. The architecture is cloud-portable with no code changes required:

- Replace `DATABASE_URL` → managed PostgreSQL (AWS RDS, Supabase)
- Replace `REDIS_URL` → managed Redis (AWS ElastiCache, Upstash)
- Add `HTTPS=true` → TLS via Let's Encrypt or Cloudflare
- Docker Compose → Docker Swarm or ECS for multi-instance

### Reliability

| Mechanism | Coverage |
|-----------|----------|
| Game state persistence | `Game_Logs` stores full draw sequence and current index; engine can restore after restart |
| Booking expiry | 30-second sweeper cron catches stale locks even if no explicit rejection |
| SSE reconnect | Clients reconnect automatically; browser EventSource retries on disconnect |
| Daily backup | `0 3 * * *` cron; backup written to `/backups` volume |
| Health checks | Docker Compose health checks on postgres (`pg_isready`) and redis (`ping`) |

---

## 10. MoSCoW Prioritization

### Must Have — Phase 1 (Delivered)

- Cryptographically fair draw engine (CSPRNG + Fisher-Yates)
- Real-time number broadcast via SSE to players
- Ticket grid with live highlight of drawn numbers
- Soft-lock booking with 10-minute expiry
- Agent wallet with debit-on-confirm
- Round-robin agent assignment
- Win detection (all 6 patterns)
- JWT authentication + RBAC
- Immutable audit log
- Expiry sweeper cron

### Should Have — Phase 1 (Delivered)

- Operator speed slider (5–12s draw interval)
- Pause / Resume conductor
- Theme system (4 presets)
- Spam detection and soft-ban
- Platform_Config editable by Superadmin
- Wallet top-up request workflow
- 4-second winner celebration pause
- 15-second SSE heartbeat

### Could Have — Phase 2 (Planned)

- WhatsApp API: auto-send ticket PDF and booking confirmation
- Tease animation (1.2s suspense before number reveal)
- Emoji reaction broadcast (players send live reactions)
- Audio board (operator uploads MP3s for draw sounds and winner jingle)
- Ghost Host auto-resume (engine auto-continues if operator connection drops)
- Fast-filling badge (ticket fill milestone celebration)
- Full-screen conductor display (projector mode)

### Won't Have — Phase 1

- Payment gateway integration (Razorpay, Stripe, UPI API)
- Player accounts or self-registration
- Public cloud hosting with HTTPS
- Multi-game concurrent sessions on same instance
- Native mobile app (iOS/Android)
- SMS/email notifications

---

## 11. Risk Register

| # | Risk | Likelihood | Impact | Mitigation | Status |
|---|------|-----------|--------|-----------|--------|
| R1 | Game engine crash mid-session | Low | High | `Game_Logs` persists draw sequence and current index; restore on next start | Mitigated |
| R2 | Booking race condition (double-lock) | Medium | High | `SELECT FOR UPDATE` on Tickets rows during lock; only one request wins | Mitigated |
| R3 | Agent wallet overdraft | Low | Medium | Balance check + `SELECT FOR UPDATE` on `Users.current_balance` before debit | Mitigated |
| R4 | Spam ticket locking (IP flood) | Medium | Low | Rate limit 5/min/IP; 3 concurrent locks/IP cap; IP soft-ban on 3+ agent flags | Mitigated |
| R5 | SSE connection drops mid-game | Medium | Medium | Browser EventSource auto-retries; 15s heartbeat keeps Nginx from timing out | Mitigated |
| R6 | Stale booking locks block tickets | Medium | Medium | 30s expiry sweeper cron releases expired locks even without explicit rejection | Mitigated |
| R7 | Audit log tampering | Low | High | PostgreSQL trigger blocks UPDATE/DELETE; BIGSERIAL PK prevents row removal | Mitigated |
| R8 | Operator disconnects mid-game | Medium | Medium | Engine runs independently of WebSocket; reconnect restores state via REST GET | Partial — Ghost Host (Phase 2) |
| R9 | Prize pool misconfiguration | Low | High | 80% cap enforced at game creation; validation rejects invalid configs | Mitigated |
| R10 | LAN IP address changes between sessions | Low | Low | Nginx serves on `:80`; new IP requires only WhatsApp group update | Accepted |

---

## 12. Phase 2 Roadmap

Phase 2 targets events with larger audiences, cloud deployment, and a richer player experience. Items are sequenced by dependency and user impact.

### Tier 1 — Immersion (Next)

| Feature | Description | Rationale |
|---------|-------------|----------|
| Tease animation | 1.2s spinning reel before number reveal | Builds tension; highest player impact per engineering effort |
| Winner celebration overlay | 3.5s full-screen animation per winner | Already partially designed; needs polish |
| Audio board | Operator uploads MP3s; engine plays draw sound + winner jingle | Recreates physical game atmosphere |
| Emoji reactions | Players send live emojis; broadcast to all screens | Social layer retention |

### Tier 2 — Operations

| Feature | Description | Rationale |
|---------|-------------|----------|
| WhatsApp API integration | Auto-send ticket PDF and booking confirmation via WhatsApp Cloud API | Reduces agent manual messaging overhead |
| Ghost Host auto-resume | If operator WebSocket drops, engine continues; reconnect restores HUD state | Eliminates single point of operational failure |
| Fast-filling badge | Visual badge when game crosses 50%/75%/90% ticket sales | Creates FOMO, accelerates ticket sales |
| Multi-game support | Run two games concurrently on same instance | Needed for larger festivals |

### Tier 3 — Cloud & Scale

| Feature | Description | Rationale |
|---------|-------------|----------|
| HTTPS + cloud deployment | TLS via Cloudflare; managed RDS + ElastiCache | Required for internet-accessible events |
| Horizontal scaling | Docker Swarm / ECS with sticky sessions for WebSocket | Needed when LAN capacity is exceeded |
| Player accounts (optional) | Returning player history, saved aliases, booking history | Loyalty layer for recurring events |
| Analytics dashboard | Revenue by game, peak booking times, agent performance | Operational intelligence for organizers |

---

## 13. Glossary

| Term | Definition |
|------|------------|
| **Housie** | Indian name for Tambola, a variant of Bingo played with 1–90 numbers on a 3×9 ticket grid |
| **Tambola** | Another common name for Housie; same rules, different region |
| **Housie Name** | Anonymous 3–20 character alias a player chooses instead of a real name (no account needed) |
| **Conductor** | The game engine's `setTimeout`-driven draw loop that fires one number per tick |
| **Tick** | A single draw cycle: pull next number → persist → detect wins → broadcast |
| **Soft Lock** | A temporary 10-minute reservation of tickets pending agent confirmation |
| **Hard Lock** | Tickets in `Sold` status after agent confirmation; cannot be unlocked without admin action |
| **Expiry Sweeper** | A cron job that runs every 30 seconds and releases `Locked` tickets whose `locked_until` timestamp has passed |
| **Agent Wallet** | A digital float balance held in PostgreSQL (`Users.current_balance`) that agents use to confirm bookings. Not a real bank account. |
| **Round-Robin Assignment** | Distributing incoming bookings evenly across active agents in rotation |
| **P2P Payment** | Player pays agent directly (cash / UPI / WhatsApp) outside the platform. Platform only tracks the wallet debit, not the actual money. |
| **Draw Sequence** | A CSPRNG Fisher-Yakes shuffle of 1–90 generated once at game start and stored in `Game_Logs` |
| **CSPRNG** | Cryptographically Secure Pseudo-Random Number Generator. Used via Node.js `crypto.randomInt()` |
| **SSE** | Server-Sent Events — a one-way HTTP stream used to push draw updates to player browsers |
| **Ghost Host** | Planned Phase 2 feature: engine auto-continues if operator WebSocket drops |
| **Platform_Config** | A key-value table in PostgreSQL that stores tunable platform parameters editable by Superadmin |
| **Split Prize** | When two or more tickets claim the same pattern on the same tick, the prize amount is divided equally. `split_count` records the denominator. |
| **Early Five** | The first prize pattern: any 5 numbers matched on a ticket, in any row |
| **Full House** | All 15 numbers on a ticket marked — the final and largest prize |
