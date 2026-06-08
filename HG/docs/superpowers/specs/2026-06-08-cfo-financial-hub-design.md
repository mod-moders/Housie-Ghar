# Slice 2 — CFO Designation & Financial Hub

**Date:** 2026-06-08
**Spec source:** techAd.pdf §1c (Superadmin Financial Hub & Analytics), §2.1 (The Admin/Financial Officer Dashboard)

## Goal

Let the **Superadmin designate one Admin as the Financial Officer (CFO)** via an `is_cfo`
flag. A designated Admin's standard dashboard transforms into a **Financial Hub** focused
on liquidity and ledger management: a metrics ribbon, a live recharge-approval queue, a
master bookie ledger, and manual ledger adjustments. Bookie recharge requests are routed
to the CFO's WhatsApp.

## Current state (what already exists, uncommitted)

- `backend/migrations/012_add_is_cfo.sql` — `Users.is_cfo BOOLEAN DEFAULT FALSE` + partial index.
- `auth.controller.ts` — login response already returns `is_cfo`.
- `users.controller.ts → designateCfo()` — written but **has no route**.
- `middleware/auth.ts → requireFinancialOfficer` — written but **used nowhere**.
- Wallet module already has `listAgentWallets`, `listPendingTopUps`, `requestTopUp`,
  `approveTopUp`, `rejectTopUp`, `getMyLedger`.
- `bookings.controller.ts` has a local `buildWaLink(phone, name, bookingId)` helper.

This slice wires the dangling code, assembles the Hub from existing endpoints, and adds the
gaps (HUD totals, master ledger, manual adjust, WhatsApp routing, frontend).

## Scope decisions

- **EOD reconciliation:** deferred to a later slice.
- **Recharge → CFO WhatsApp routing:** included.
- **Manual ledger adjust:** included.

## Data model

No new schema beyond the existing `012_add_is_cfo.sql`. Manual adjustments reuse
`Wallet_Ledger` (no CHECK constraints on `transaction_type`/`reference_type`; `amount > 0`):

- `transaction_type` = `'Credit'` or `'Debit'`
- `reference_type` = `'Manual'`
- `amount` = positive magnitude
- `description` = the mandatory reason text

## Backend

### Designation

- `PATCH /api/users/:id/cfo` → `designateCfo` (existing fn), guarded **Superadmin-only**.
  Body `{ is_cfo?: boolean }` (default true). Single-CFO invariant: in the same transaction,
  clears `is_cfo` on all other users before setting the target. Target must be `role_id = 2`
  (Admin). Writes a `DESIGNATE_CFO` / `REVOKE_CFO` audit entry.

### Financial Hub endpoints (guarded by `requireFinancialOfficer`)

`requireFinancialOfficer` allows Superadmin, or an Admin whose DB `is_cfo = true` (checked
against the DB, not the JWT, so designation takes effect immediately).

- `GET /api/wallet/hud` → `{ total_liability, daily_gross_processed, pending_count }`
  - `total_liability` = `SUM(current_balance)` over `role_id = 4`.
  - `daily_gross_processed` = `SUM(amount)` from `Wallet_Ledger` where
    `transaction_type = 'Credit'` and `created_at::date = CURRENT_DATE`.
  - `pending_count` = count of `TopUp_Requests` with `request_status = 'Pending'`.
- `GET /api/wallet/master-ledger` → per active bookie:
  `{ agent_id, full_name, phone, status, current_balance, pending_requests[], lifetime_topups, last_recharge_at }`.
  Extends the existing `listAgentWallets` query with `SUM` of approved credits and
  `MAX(created_at)` of credits per agent.
- `POST /api/wallet/agents/:agentId/adjust` → body `{ type: 'Credit' | 'Debit', amount, reason }`.
  - Validates: `type` in set; `amount` positive number; `reason` length ≥ 20 chars.
  - ACID transaction: `FOR UPDATE` lock on the agent, compute `balance_after`, **reject a
    Debit that would make the balance negative (400)**, update `Users.current_balance`,
    insert a `Wallet_Ledger` row (`reference_type = 'Manual'`, `description = reason`,
    `performed_by = actor`), write a `MANUAL_ADJUST` audit entry.
  - Emits `wallet_credited` (Credit) or `wallet_debited` (Debit) to `agent-{agentId}`.

Existing `listPendingTopUps`, `approveTopUp`, `rejectTopUp` are reused unchanged for the
queue (re-exposed under the FO guard as needed; the current `Admin/Superadmin` guard already
covers a CFO Admin).

### WhatsApp routing

- Extract `buildWaLink` from `bookings.controller.ts` into `utils/waLink.ts`; update the
  bookings controller to import it (no behavior change).
- `requestTopUp` resolves the recharge contact: the `Active` Admin with `is_cfo = true`,
  else fall back to an `Active` Superadmin. Returns `recharge_wa_link` (built from that
  user's `phone`) in the response so the agent's "Request Funds" action redirects to the
  CFO's WhatsApp. If neither exists, omit the link (frontend shows a graceful fallback).

## Frontend

- **`authStore`** — add `is_cfo: boolean` to the user shape (already returned by login).
- **Superadmin users page** (`admin/superadmin/users/page.tsx`) — per-Admin "Designate as
  Financial Officer" toggle calling `PATCH /api/users/:id/cfo`; a badge marks the current CFO;
  designating one clears the others (server-enforced) and the list refetches.
- **Admin dashboard** (`admin/admin/page.tsx`) — when `is_cfo`, render the **Financial Hub**;
  otherwise the existing dashboard. Hub composition (approved v2 layout):
  - **HUD ribbon** — Total Platform Liability, Daily Gross Processed, Pending Recharge count
    (quiet, glanceable; no flashing).
  - **Recharge queue** — list of pending requests; the active row expands to show
    Credit / Reject actions (green / red color coding per spec).
  - **Master bookie ledger** — table from `/api/wallet/master-ledger`; selecting a bookie
    reveals a detail panel (current balance, lifetime top-ups, last recharge, recent ledger
    rows) — progressive disclosure, not all-on-load.
  - **Manual Adjust modal** — Credit/Debit, amount, mandatory reason (≥ 20 chars, enforced
    client + server) → `POST /api/wallet/agents/:agentId/adjust`.
  - **Low-balance highlight** — bookies under a threshold (₹500) flagged with a 1-click
    WhatsApp template link.
- **Agent wallet page** — "Request Funds" uses `recharge_wa_link` from the `requestTopUp`
  response; falls back gracefully if absent.
- **Theme** — adapt the approved layout/density to the **existing dark forest/gold design
  system**; the brainstorm mockup's light palette was for information-architecture review
  only. Retain the green-Credit / red-Reject color coding.

## Real-time

Reuse the existing `agent-{id}` room and `wallet_credited` event; add `wallet_debited` for
manual debits. The Hub refreshes its HUD/queue on the existing `topup_request_received`
event emitted to `admin-room`.

## Testing

- `buildWaLink` (shared util) — unit tests via `node:test` + `ts-node` (encoding, phone
  normalization), mirroring the `bookingRouter.test.ts` pattern.
- Manual-adjust validation — pure validation helper unit-tested: reason length, amount
  positivity, debit-negative guard.
- Endpoint smoke checks following existing module patterns.

## Out of scope (later slices)

EOD reconciliation report; bookie trust score; audio localization hub; OTP; theming hub.
