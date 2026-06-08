# Slice 1 — Liquidity-Aware Routing & Operator Overflow Failsafe

**Date:** 2026-06-08
**Spec source:** techAd.pdf Phase 2 §4 (Bookie Workspace), Phase 5 §2 (Booking Engine APIs)

## Goal

Upgrade the existing round-robin booking assignment so it is **liquidity-aware**:
when a player locks tickets, the system routes the booking only to a bookie whose
wallet balance can cover the total. Bookies with insufficient balance are **skipped**
(and notified via a FOMO alert). If *every* active bookie lacks funds, the booking
falls back to the game's **Operator** (overflow failsafe), who can "Force Confirm"
the sale with no wallet deduction.

## Current behaviour (to change)

`bookings.controller.ts → lockTickets` picks the next agent in `user_id` order after
the last assigned agent, **without checking balance**, and has no operator fallback.

## Design

### Data model (migration 011)

- `Bookings.is_overflow BOOLEAN DEFAULT FALSE` — true when the booking was routed to
  an Operator because all bookies were skipped.
- New table `Skip_Alerts` — durable log of FOMO skip events (also powers the agent
  dashboard banner and the future FO portal view):
  - `alert_id SERIAL PK`, `agent_id UUID`, `game_id UUID`, `booking_amount DECIMAL`,
    `agent_balance DECIMAL`, `seen BOOLEAN DEFAULT FALSE`, `created_at TIMESTAMPTZ`.

### Pure routing module (`services/bookingRouter.ts`)

`selectAgentForBooking(agents, lastAgentId, totalAmount) → { assigned, skipped }`

- `agents`: active bookies in a deterministic order (`{ user_id, current_balance }`).
- Round-robin cursor starts at the agent **after** `lastAgentId` (or index 0).
- Iterate exactly `agents.length` times circularly:
  - balance ≥ total → `assigned = agent`, stop (skipped accumulates those passed).
  - balance < total → push to `skipped`, continue.
- No qualifying agent → `assigned = null` (overflow). All agents are in `skipped`.

This pure function is unit-tested (no DB) with `node:test` + `ts-node`.

### Controller `lockTickets` (rewrite)

1. Lock ticket rows / availability (unchanged).
2. Compute `totalAmount`.
3. Load active bookies (`role_id=4, status='Active'`) with `current_balance`, ordered by `user_id`.
4. `lastAgentId` = assigned agent of most recent booking.
5. `selectAgentForBooking(...)`.
6. For each skipped agent: insert `Skip_Alerts` row + emit `booking_skipped` to `agent-{id}`.
7. **Assigned path:** create booking (`is_overflow=false`), lock tickets, WhatsApp link to the bookie, emit `new_booking_request` to `agent-{id}`. (unchanged shape)
8. **Overflow path:** load game's `operator_id` (+ phone/status). If active operator:
   create booking assigned to the operator (`is_overflow=true`), lock tickets, build
   operator `wa.me` link, emit `overflow_booking` to `operator-{id}`, respond with
   `is_overflow: true`. If no active operator → rollback + 503.

Balance read here is **advisory** (per spec). Actual deduction stays at confirm time,
which already re-checks balance.

### New operator endpoints

- `GET /api/bookings/operator/overflow-queue` (role Operator) — Locked overflow
  bookings assigned to this operator, not expired.
- `POST /api/bookings/operator/:booking_id/force-confirm` (role Operator) — marks
  tickets `Sold` + booking `Sold` (`confirmed_by` = operator). **No** wallet
  deduction, **no** ledger debit (direct-to-platform sale). Emits `ticket_status_change`.

### New agent endpoint

- `GET /api/bookings/agent/skip-alerts` (role Agent) — unseen `Skip_Alerts`, marks
  them seen. Powers the dashboard FOMO banner on reload.

### Real-time wiring

- Server: add `join_operator_room` → joins `operator-{id}`.
- Frontend `useSocket`: accept an optional room-join descriptor and emit it on connect;
  add `booking_skipped` + `overflow_booking` to the listened events. (Fixes the
  pre-existing gap where agents never joined `agent-{id}`.)

### Frontend UI

- **Agent dashboard:** join `agent-{id}`; on `booking_skipped` show a dismissible FOMO
  banner ("You just missed a booking — wallet too low. Recharge to resume sales.") and
  reload skip alerts on mount.
- **Operator dashboard:** add an "Overflow Queue" tab; join `operator-{id}`; list
  overflow request cards with a "Force Confirm" button.

## Out of scope (later slices)

CFO portal aggregation of skip alerts, OTP, theming. This slice only adds the routing
engine, overflow failsafe, and the minimal UI to operate them.
