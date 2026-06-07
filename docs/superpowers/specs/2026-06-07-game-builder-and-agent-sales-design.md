---
name: game-builder-and-agent-sales
description: Design spec for the Admin Game Builder Wizard and Agent Direct Sales page in Housie Ghar
metadata:
  type: project
---

# Game Builder Wizard & Agent Sales Page

**Date:** 2026-06-07  
**Scope:** Two missing frontend pages + two new backend endpoints

---

## 1. Overview

Two nav links are wired in the admin layout but have no pages yet:

- `/admin/admin/game-builder` — Admin creates a new Housie game
- `/admin/agent/sales` — Agent sells tickets directly to walk-in customers and views their sales history

---

## 2. Game Builder Wizard

### Route
`/admin/admin/game-builder/page.tsx` (new file)

### Approach
A 3-step wizard rendered as a single page with local step state. All form state is held in one object at the top level. Validation runs per-step on "Next". Users can go back freely.

### Steps

**Step 1 — Basics**
Fields:
- `title` — text, required
- `scheduled_at` — datetime-local, required
- `ticket_price` — number (₹), required, must be > 0
- `total_tickets` — number, required, must be > 0; quick-pick chips for 50 / 100 / 200 / 300
- `operator_id` — select dropdown, optional; populated from `GET /api/users` filtered to `role_id = 3`

**Step 2 — Prize Pool**
- Live display: Gross Revenue = `ticket_price × total_tickets`; Cap = Gross × 0.80
- Progress bar showing total prizes entered vs. cap
- Prize rows: each row has a pattern dropdown (6 valid patterns from `CONSTANTS.PRIZE_PATTERNS`) + amount ₹ input
- Duplicate patterns not allowed (used patterns are removed from the dropdown)
- [+ Add Prize] button; [× Remove] per row
- Must have ≥ 1 prize; total must not exceed cap
- Over-cap warning shown inline

**Step 3 — Review & Create**
- Read-only card summarising all fields from steps 1 and 2
- [← Back] and [Create Game →] buttons
- On submit: `POST /api/games` with `{ title, scheduled_at, ticket_price, total_tickets, operator_id, prizes }`
- On success: redirect to `/admin/admin`
- On error: show error message, stay on step 3

### State shape
```ts
{
  title: string;
  scheduled_at: string;
  ticket_price: string;
  total_tickets: string;
  operator_id: string;
  prizes: { pattern_name: string; prize_amount: string }[];
}
```

### No new backend endpoints needed
`POST /api/games` and `GET /api/users` already exist.

---

## 3. Agent Sales Page

### Route
`/admin/agent/sales/page.tsx` (new file)

### Layout
Two stacked sections on one page:
1. **Direct Sale** — top section, agent-initiated ticket sale
2. **Sales History** — bottom section, read-only confirmed sales log

### 3a. Direct Sale Section

**Flow:**
1. Agent selects a game from a dropdown (games with status `Scheduled` or `Live`)
2. Ticket grid loads inline — same toggle UX as the player game page
3. Agent enters customer's Housie Name (3–20 chars)
4. Agent clicks "Confirm Sale" → wallet balance check shown
5. On confirm: `POST /api/bookings/agent/direct-sale`
6. On success: show confirmation toast, reload history and wallet balance

**UI:**
```
Pick Game: [Diwali Special ▼]  ₹50/ticket · 63% sold

[Ticket grid — togglable, Available only selectable]

Selected: #12, #47, #88   Total: ₹150

Housie Name: [_________________]
Wallet: ₹3,200   After sale: ₹3,050

[Confirm Sale — ₹150]
```

### 3b. Sales History Section

Displays all bookings confirmed by this agent, newest first.

Columns: Housie Name · Game · Tickets · Amount · Time ago

Fetched from `GET /api/bookings/agent/sales`.

---

## 4. New Backend Endpoints

### 4a. `POST /api/bookings/agent/direct-sale`

**Auth:** Agent only (`requireRole(['Agent'])`)

**Body:**
```json
{ "game_id": "uuid", "ticket_ids": [1, 2, 3], "housie_name": "LuckyStar7" }
```

**Logic (single transaction):**
1. Validate: game exists, status is `Scheduled` or `Live`
2. Lock ticket rows for update; verify all are `Available`
3. Fetch agent's `current_balance`; verify ≥ `ticket_price × count`
4. Create `Bookings` row with `booking_status = 'Sold'`, `assigned_agent_id = confirmed_by = req.user.userId`, `confirmed_at = NOW()`
5. Update `Tickets`: status = `Sold`, `owner_housie_name = housie_name`, `confirmed_at = NOW()`
6. Deduct agent balance; insert `Wallet_Ledger` debit entry
7. COMMIT

**Response:**
```json
{ "booking_id": "...", "total_amount": 150, "balance_after": 3050 }
```

### 4b. `GET /api/bookings/agent/sales`

**Auth:** Agent only

**Logic:** Query `Bookings` where `confirmed_by = agent_id` AND `booking_status = 'Sold'`, join `Scheduled_Games` for title, resolve ticket numbers.

**Response:** Array of:
```json
{
  "booking_id": "...",
  "housie_name": "LuckyStar7",
  "game_title": "Diwali Special",
  "ticket_numbers": [12, 47, 88],
  "total_amount": 150,
  "confirmed_at": "..."
}
```

Both endpoints added to `bookings.controller.ts` and wired in `bookings.routes.ts`.

---

## 5. Files Changed

| File | Change |
|---|---|
| `frontend/src/app/admin/admin/game-builder/page.tsx` | New — 3-step wizard |
| `frontend/src/app/admin/agent/sales/page.tsx` | New — direct sale + history |
| `backend/src/modules/bookings/bookings.controller.ts` | Add `directSale` and `getAgentSales` |
| `backend/src/modules/bookings/bookings.routes.ts` | Wire new routes |

---

## 6. Out of Scope

- No changes to the existing player booking flow
- No new game-level API changes
- No real-time push for the sales history (manual reload on sale)
