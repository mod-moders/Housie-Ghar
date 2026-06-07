# Game Builder Wizard & Agent Sales Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 3-step game creation wizard for Admin and a direct-sale + history page for Agent.

**Architecture:** Two new backend endpoints (direct-sale + sales history) added to `bookings.controller.ts` and wired in `bookings.routes.ts`. Two new frontend pages under the existing Next.js App Router admin layout — no new layout changes needed.

**Tech Stack:** TypeScript, Express, pg (PostgreSQL), Next.js 16 App Router, Tailwind CSS v4, Zustand stores

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `HG/backend/src/modules/bookings/bookings.controller.ts` | Add `directSale` and `getAgentSales` functions |
| Modify | `HG/backend/src/modules/bookings/bookings.routes.ts` | Wire two new routes |
| Create | `HG/frontend/src/app/admin/admin/game-builder/page.tsx` | 3-step game builder wizard |
| Create | `HG/frontend/src/app/admin/agent/sales/page.tsx` | Direct sale form + sales history |

---

## Task 1: Backend — `directSale` endpoint

**Files:**
- Modify: `HG/backend/src/modules/bookings/bookings.controller.ts`

### Context
This endpoint lets an authenticated Agent atomically lock + confirm tickets in a single transaction, deducting from their wallet immediately. No WhatsApp or timer involved.

The `Bookings` table insert must include `confirmed_at` and `confirmed_by` so the row is immediately in `'Sold'` status. `locked_until` is set to `NOW()` since there is no timer.

- [ ] **Step 1: Add `directSale` to the controller**

Open `HG/backend/src/modules/bookings/bookings.controller.ts`. At the very end of the file (after `rejectBooking`), append this function:

```typescript
/**
 * Agent-initiated direct sale — atomically lock + confirm tickets in one transaction
 */
export async function directSale(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { game_id, ticket_ids, housie_name } = req.body;
  const agentId = req.user!.userId;

  if (!game_id || !Array.isArray(ticket_ids) || ticket_ids.length === 0 || !housie_name) {
    res.status(400).json({ message: 'game_id, ticket_ids, and housie_name are required' });
    return;
  }
  if (housie_name.length < 3 || housie_name.length > 20) {
    res.status(400).json({ message: 'Housie Name must be between 3 and 20 characters' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify game accepts sales
    const gameRes = await client.query(
      `SELECT game_id, title, ticket_price, game_status FROM Scheduled_Games WHERE game_id = $1`,
      [game_id]
    );
    if (gameRes.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Game not found' });
      return;
    }
    const game = gameRes.rows[0];
    if (!['Scheduled', 'Live'].includes(game.game_status)) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'Game is not accepting sales' });
      return;
    }

    // 2. Lock ticket rows and verify availability
    const ticketsRes = await client.query(
      `SELECT ticket_id, ticket_number, status
       FROM Tickets
       WHERE ticket_id = ANY($1) AND game_id = $2
       FOR UPDATE`,
      [ticket_ids, game_id]
    );
    if (ticketsRes.rowCount !== ticket_ids.length) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'Some tickets do not exist in this game' });
      return;
    }
    const unavailable = ticketsRes.rows.filter((t) => t.status !== 'Available');
    if (unavailable.length > 0) {
      await client.query('ROLLBACK');
      res.status(409).json({
        message: `Tickets ${unavailable.map((t) => `#${t.ticket_number}`).join(', ')} are not available`,
      });
      return;
    }

    // 3. Check agent wallet balance
    const agentRes = await client.query(
      `SELECT current_balance FROM Users WHERE user_id = $1 FOR UPDATE`,
      [agentId]
    );
    const balance = parseFloat(agentRes.rows[0].current_balance);
    const ticketPrice = parseFloat(game.ticket_price);
    const totalAmount = ticketPrice * ticket_ids.length;
    if (balance < totalAmount) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'Insufficient wallet balance' });
      return;
    }

    // 4. Create Booking — immediately Sold
    const now = new Date();
    const bookingRes = await client.query(
      `INSERT INTO Bookings (
         game_id, ticket_ids, housie_name, assigned_agent_id, total_amount,
         booking_status, locked_at, locked_until, confirmed_at, confirmed_by
       ) VALUES ($1, $2, $3, $4, $5, 'Sold', $6, $6, $6, $4)
       RETURNING booking_id`,
      [game_id, ticket_ids, housie_name, agentId, totalAmount, now]
    );
    const bookingId = bookingRes.rows[0].booking_id;

    // 5. Mark tickets Sold
    await client.query(
      `UPDATE Tickets
       SET status = 'Sold',
           owner_housie_name = $1,
           confirmed_at = $2,
           locked_by_booking = $3,
           locked_until = NULL
       WHERE ticket_id = ANY($4)`,
      [housie_name, now, bookingId, ticket_ids]
    );

    // 6. Deduct agent balance and record ledger entry
    const newBalance = balance - totalAmount;
    await client.query(
      `UPDATE Users SET current_balance = $1 WHERE user_id = $2`,
      [newBalance, agentId]
    );
    await client.query(
      `INSERT INTO Wallet_Ledger (
         agent_id, transaction_type, amount, balance_after,
         reference_type, reference_id, description, performed_by
       ) VALUES ($1, 'Debit', $2, $3, 'Booking', $4, $5, $1)`,
      [
        agentId, totalAmount, newBalance, bookingId,
        `Direct sale #${bookingId.substring(0, 8).toUpperCase()} for ${housie_name}`,
      ]
    );

    await client.query('COMMIT');

    res.status(201).json({
      booking_id: bookingId,
      total_amount: totalAmount,
      balance_after: newBalance,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Direct sale error:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd HG/backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add HG/backend/src/modules/bookings/bookings.controller.ts
git commit -m "feat(backend): add directSale endpoint for agent-initiated ticket sales"
```

---

## Task 2: Backend — `getAgentSales` endpoint + wire both routes

**Files:**
- Modify: `HG/backend/src/modules/bookings/bookings.controller.ts`
- Modify: `HG/backend/src/modules/bookings/bookings.routes.ts`

- [ ] **Step 1: Add `getAgentSales` to the controller**

At the end of `HG/backend/src/modules/bookings/bookings.controller.ts` (after `directSale`), append:

```typescript
/**
 * Get all confirmed sales for the authenticated Agent
 */
export async function getAgentSales(req: AuthenticatedRequest, res: Response): Promise<void> {
  const agentId = req.user!.userId;

  try {
    const result = await pool.query(
      `SELECT b.booking_id, b.housie_name, b.total_amount, b.confirmed_at, b.ticket_ids,
              g.title AS game_title
       FROM Bookings b
       JOIN Scheduled_Games g ON b.game_id = g.game_id
       WHERE b.confirmed_by = $1 AND b.booking_status = 'Sold'
       ORDER BY b.confirmed_at DESC`,
      [agentId]
    );

    const sales = [];
    for (const row of result.rows) {
      const ticketsRes = await pool.query(
        `SELECT ticket_number FROM Tickets WHERE ticket_id = ANY($1) ORDER BY ticket_number ASC`,
        [row.ticket_ids]
      );
      sales.push({
        booking_id: row.booking_id,
        housie_name: row.housie_name,
        game_title: row.game_title,
        ticket_numbers: ticketsRes.rows.map((t) => t.ticket_number),
        total_amount: parseFloat(row.total_amount),
        confirmed_at: row.confirmed_at,
      });
    }

    res.json(sales);
  } catch (error) {
    console.error('Error fetching agent sales:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
```

- [ ] **Step 2: Wire both new routes in `bookings.routes.ts`**

Replace the contents of `HG/backend/src/modules/bookings/bookings.routes.ts` with:

```typescript
import { Router } from 'express';
import {
  lockTickets,
  getBookingStatus,
  getAgentQueue,
  confirmBooking,
  rejectBooking,
  directSale,
  getAgentSales,
} from './bookings.controller';
import { authenticateToken, requireRole } from '../../middleware/auth';

const router = Router();

// Player endpoints (Public)
router.post('/lock', lockTickets);
router.get('/status/:booking_id', getBookingStatus);

// Agent endpoints (Authenticated)
router.get('/agent/queue', authenticateToken, requireRole(['Agent']), getAgentQueue);
router.get('/agent/sales', authenticateToken, requireRole(['Agent']), getAgentSales);
router.post('/agent/direct-sale', authenticateToken, requireRole(['Agent']), directSale);
router.post('/agent/:booking_id/confirm', authenticateToken, requireRole(['Agent']), confirmBooking);
router.post('/agent/:booking_id/reject', authenticateToken, requireRole(['Agent']), rejectBooking);

export default router;
```

Note: `GET /agent/sales` and `POST /agent/direct-sale` are declared **before** `POST /agent/:booking_id/confirm` so Express matches them as literal paths, not as `:booking_id` parameters.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd HG/backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Start backend and manually verify both endpoints**

Start the backend and run a curl test as an agent (replace `TOKEN` with a real agent session cookie):

```bash
# Check getAgentSales — should return [] for a fresh agent
curl -s -b "hg_auth_token=TOKEN" http://localhost:4000/api/bookings/agent/sales | jq .

# directSale — should return 400 (bad body) confirming the route exists
curl -s -b "hg_auth_token=TOKEN" -X POST \
  -H "Content-Type: application/json" \
  -d '{}' \
  http://localhost:4000/api/bookings/agent/direct-sale | jq .
```

Expected for first curl: `[]`
Expected for second curl: `{"message":"game_id, ticket_ids, and housie_name are required"}`

- [ ] **Step 5: Commit**

```bash
git add HG/backend/src/modules/bookings/bookings.controller.ts \
        HG/backend/src/modules/bookings/bookings.routes.ts
git commit -m "feat(backend): add getAgentSales and wire direct-sale + sales routes"
```

---

## Task 3: Frontend — Game Builder Wizard

**Files:**
- Create: `HG/frontend/src/app/admin/admin/game-builder/page.tsx`

### Context

- This page is already linked from the Admin nav (`/admin/admin/game-builder`) in `admin/layout.tsx`.
- The Admin dashboard (`admin/admin/page.tsx`) also has a "+ New Game" link pointing here.
- `POST /api/games` accepts: `{ title, scheduled_at, ticket_price, total_tickets, operator_id?, prizes: [{ pattern_name, prize_amount }] }`
- `GET /api/users` returns all staff; filter by `role_name === 'Operator'` on the frontend to populate the operator dropdown.
- Gross revenue cap = `ticket_price × total_tickets × 0.80`. Backend enforces this; frontend shows a live progress bar.
- Valid prize patterns (must match exactly): `"Early Five" | "Top Line" | "Middle Line" | "Bottom Line" | "Four Corners" | "Full House"`
- On success, redirect to `/admin/admin`.

- [ ] **Step 1: Create the page file**

Create `HG/frontend/src/app/admin/admin/game-builder/page.tsx` with this content:

```tsx
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const PRIZE_PATTERNS = [
  "Early Five", "Top Line", "Middle Line", "Bottom Line", "Four Corners", "Full House",
] as const;

interface Prize { pattern_name: string; prize_amount: string; }
interface Operator { user_id: string; full_name: string; }
interface WizardState {
  title: string;
  scheduled_at: string;
  ticket_price: string;
  total_tickets: string;
  operator_id: string;
  prizes: Prize[];
}

const INITIAL: WizardState = {
  title: "", scheduled_at: "", ticket_price: "", total_tickets: "",
  operator_id: "", prizes: [{ pattern_name: "Full House", prize_amount: "" }],
};

function validateStep1(s: WizardState): string | null {
  if (!s.title.trim()) return "Title is required";
  if (!s.scheduled_at) return "Scheduled time is required";
  if (!s.ticket_price || parseFloat(s.ticket_price) <= 0) return "Ticket price must be greater than 0";
  if (!s.total_tickets || parseInt(s.total_tickets) <= 0) return "Total tickets must be greater than 0";
  return null;
}

function validateStep2(s: WizardState): string | null {
  if (s.prizes.length === 0) return "Add at least one prize";
  for (const p of s.prizes) {
    if (!p.pattern_name) return "Select a pattern for each prize";
    if (!p.prize_amount || parseFloat(p.prize_amount) <= 0) return "Each prize amount must be greater than 0";
  }
  const gross = parseFloat(s.ticket_price) * parseInt(s.total_tickets);
  const cap = gross * 0.80;
  const total = s.prizes.reduce((sum, p) => sum + parseFloat(p.prize_amount || "0"), 0);
  if (total > cap) return `Total prizes ₹${total.toLocaleString()} exceeds the 80% cap of ₹${cap.toFixed(2)}`;
  return null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-[#9ca3af] mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-sm py-0.5">
      <span className="text-[#6b7280]">{label}</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}

const INPUT = "w-full bg-bg3 border border-border text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-border-active placeholder:text-[#4b5563]";

export default function GameBuilderPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<WizardState>(INITIAL);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<any[]>("/api/users")
      .then((users) => setOperators(users.filter((u) => u.role_name === "Operator")))
      .catch(() => {});
  }, []);

  const gross = parseFloat(form.ticket_price || "0") * parseInt(form.total_tickets || "0");
  const cap = gross * 0.80;
  const totalPrize = form.prizes.reduce((s, p) => s + parseFloat(p.prize_amount || "0"), 0);
  const capPct = cap > 0 ? Math.min((totalPrize / cap) * 100, 100) : 0;
  const usedPatterns = new Set(form.prizes.map((p) => p.pattern_name));
  const availablePatterns = PRIZE_PATTERNS.filter((p) => !usedPatterns.has(p));

  const addPrize = () => {
    const next = availablePatterns[0];
    if (!next) return;
    setForm((f) => ({ ...f, prizes: [...f.prizes, { pattern_name: next, prize_amount: "" }] }));
  };

  const removePrize = (i: number) =>
    setForm((f) => ({ ...f, prizes: f.prizes.filter((_, idx) => idx !== i) }));

  const updatePrize = (i: number, field: keyof Prize, val: string) =>
    setForm((f) => ({
      ...f,
      prizes: f.prizes.map((p, idx) => (idx === i ? { ...p, [field]: val } : p)),
    }));

  const goNext = () => {
    setError("");
    const err = step === 1 ? validateStep1(form) : step === 2 ? validateStep2(form) : null;
    if (err) { setError(err); return; }
    setStep((s) => (s + 1) as 1 | 2 | 3);
  };

  const submit = async () => {
    setLoading(true); setError("");
    try {
      await apiFetch("/api/games", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          scheduled_at: form.scheduled_at,
          ticket_price: parseFloat(form.ticket_price),
          total_tickets: parseInt(form.total_tickets),
          operator_id: form.operator_id || undefined,
          prizes: form.prizes.map((p) => ({
            pattern_name: p.pattern_name,
            prize_amount: parseFloat(p.prize_amount),
          })),
        }),
      });
      router.push("/admin/admin");
    } catch (e: any) {
      setError(e.message ?? "Failed to create game");
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-xl">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {([1, 2, 3] as const).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border transition-all ${
              step === s ? "bg-gold text-forest border-gold" :
              step > s ? "bg-success/20 text-success border-success/30" :
              "bg-bg3 text-[#6b7280] border-border"
            }`}>{s}</div>
            {s < 3 && <div className={`h-px w-8 ${step > s ? "bg-success/40" : "bg-border"}`} />}
          </div>
        ))}
        <span className="ml-3 text-xs text-[#9ca3af]">
          {step === 1 ? "Basics" : step === 2 ? "Prize Pool" : "Review & Create"}
        </span>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger text-xs px-4 py-3 rounded-xl mb-5">
          {error}
        </div>
      )}

      {/* ── Step 1: Basics ── */}
      {step === 1 && (
        <div className="space-y-5">
          <Field label="Game Title">
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Sunday Blockbuster" className={INPUT} />
          </Field>

          <Field label="Scheduled At">
            <input type="datetime-local" value={form.scheduled_at}
              onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))}
              className={INPUT} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Ticket Price (₹)">
              <input type="number" min="1" value={form.ticket_price}
                onChange={(e) => setForm((f) => ({ ...f, ticket_price: e.target.value }))}
                placeholder="50" className={INPUT} />
            </Field>
            <Field label="Total Tickets">
              <input type="number" min="1" value={form.total_tickets}
                onChange={(e) => setForm((f) => ({ ...f, total_tickets: e.target.value }))}
                placeholder="200" className={INPUT} />
              <div className="flex gap-1.5 mt-2">
                {[50, 100, 200, 300].map((n) => (
                  <button key={n} type="button"
                    onClick={() => setForm((f) => ({ ...f, total_tickets: String(n) }))}
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-lg border transition-all ${
                      form.total_tickets === String(n)
                        ? "bg-gold/10 border-gold/30 text-gold"
                        : "border-border text-[#6b7280] hover:text-white"
                    }`}>{n}</button>
                ))}
              </div>
            </Field>
          </div>

          <Field label="Assign Operator (optional)">
            <select value={form.operator_id}
              onChange={(e) => setForm((f) => ({ ...f, operator_id: e.target.value }))}
              className={INPUT}>
              <option value="">— No operator assigned —</option>
              {operators.map((op) => (
                <option key={op.user_id} value={op.user_id}>{op.full_name}</option>
              ))}
            </select>
          </Field>

          <div className="flex justify-end pt-2">
            <button onClick={goNext}
              className="bg-gold text-forest font-black text-sm px-6 py-2.5 rounded-xl hover:bg-gold-light transition-all">
              Next: Prize Pool →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Prize Pool ── */}
      {step === 2 && (
        <div className="space-y-5">
          {/* Cap meter */}
          <div className="bg-bg2 border border-border rounded-xl p-4">
            <div className="flex justify-between text-xs text-[#9ca3af] mb-2">
              <span>Gross Revenue: <span className="text-white font-mono">₹{gross.toLocaleString()}</span></span>
              <span>80% Cap: <span className="text-white font-mono">₹{cap.toLocaleString()}</span></span>
            </div>
            <div className="h-2 bg-bg3 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-300 ${
                capPct >= 100 ? "bg-danger" : capPct >= 80 ? "bg-warning" : "bg-success"
              }`} style={{ width: `${capPct}%` }} />
            </div>
            <div className="flex justify-between text-xs mt-1.5">
              <span className={`font-mono ${totalPrize > cap ? "text-danger" : "text-[#9ca3af]"}`}>
                Used: ₹{totalPrize.toLocaleString()}
              </span>
              <span className="text-[#6b7280] font-mono">
                Remaining: ₹{Math.max(0, cap - totalPrize).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Prize rows */}
          <div className="space-y-3">
            {form.prizes.map((p, i) => {
              const opts = PRIZE_PATTERNS.filter((pat) => pat === p.pattern_name || !usedPatterns.has(pat));
              return (
                <div key={i} className="flex gap-3 items-center">
                  <select value={p.pattern_name}
                    onChange={(e) => updatePrize(i, "pattern_name", e.target.value)}
                    className="flex-1 bg-bg3 border border-border text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-border-active">
                    {opts.map((pat) => <option key={pat} value={pat}>{pat}</option>)}
                  </select>
                  <div className="relative w-32">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280] text-xs">₹</span>
                    <input type="number" min="1" value={p.prize_amount}
                      onChange={(e) => updatePrize(i, "prize_amount", e.target.value)}
                      placeholder="0"
                      className="w-full bg-bg3 border border-border text-white text-sm rounded-xl pl-7 pr-3 py-2.5 focus:outline-none focus:border-border-active" />
                  </div>
                  <button onClick={() => removePrize(i)}
                    className="text-[#6b7280] hover:text-danger transition-colors text-xl leading-none w-6 text-center">
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          {availablePatterns.length > 0 && (
            <button onClick={addPrize}
              className="text-xs text-gold border border-gold/20 bg-gold/5 px-4 py-2 rounded-xl hover:bg-gold/10 transition-all">
              + Add Prize
            </button>
          )}

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(1)}
              className="text-xs text-[#9ca3af] hover:text-white border border-border px-5 py-2.5 rounded-xl transition-all">
              ← Back
            </button>
            <button onClick={goNext}
              className="bg-gold text-forest font-black text-sm px-6 py-2.5 rounded-xl hover:bg-gold-light transition-all">
              Review →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Review ── */}
      {step === 3 && (
        <div className="space-y-5">
          <div className="bg-bg2 border border-border rounded-2xl p-5 space-y-3">
            <ReviewRow label="Title" value={form.title} />
            <ReviewRow label="Scheduled At" value={new Date(form.scheduled_at).toLocaleString("en-IN")} />
            <ReviewRow label="Ticket Price" value={`₹${parseFloat(form.ticket_price).toLocaleString()}`} />
            <ReviewRow label="Total Tickets" value={parseInt(form.total_tickets).toLocaleString()} />
            <ReviewRow label="Gross Revenue" value={`₹${gross.toLocaleString()}`} />
            {form.operator_id && (
              <ReviewRow
                label="Operator"
                value={operators.find((o) => o.user_id === form.operator_id)?.full_name ?? "—"}
              />
            )}
            <div className="border-t border-border pt-3 mt-3">
              <p className="text-[10px] text-[#6b7280] uppercase tracking-wider mb-2">Prize Pool</p>
              {form.prizes.map((p, i) => (
                <div key={i} className="flex justify-between text-sm py-0.5">
                  <span className="text-[#9ca3af]">{p.pattern_name}</span>
                  <span className="font-mono text-white">₹{parseFloat(p.prize_amount).toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between text-xs mt-2 pt-2 border-t border-border">
                <span className="text-[#6b7280]">Total Prizes</span>
                <span className="font-mono text-gold font-bold">₹{totalPrize.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(2)}
              className="text-xs text-[#9ca3af] hover:text-white border border-border px-5 py-2.5 rounded-xl transition-all">
              ← Back
            </button>
            <button onClick={submit} disabled={loading}
              className="bg-gold text-forest font-black text-sm px-6 py-2.5 rounded-xl hover:bg-gold-light transition-all disabled:opacity-50">
              {loading ? "Creating..." : "Create Game →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript / lint**

```bash
cd HG/frontend && npm run lint
```

Expected: no errors.

- [ ] **Step 3: Manually verify the wizard**

Start both backend and frontend if not already running:
```bash
# Terminal 1
cd HG/backend && npm run dev

# Terminal 2
cd HG/frontend && npm run dev
```

Log in as an Admin at `http://localhost:3000/admin/login`. Navigate to **Game Builder** in the sidebar.

Verify these behaviours:
1. Step 1 — clicking "Next" with empty fields shows an inline error message; filling all fields advances to step 2.
2. Step 2 — the cap progress bar updates as you type prize amounts; entering prizes that exceed 80% cap turns the bar red and blocks "Review".
3. Quick-pick buttons (50 / 100 / 200 / 300) fill the total-tickets input and highlight the selected chip.
4. Duplicate prize patterns are not offered in the dropdown once selected.
5. Step 3 — review card shows all entered values; submitting redirects back to `/admin/admin`.

- [ ] **Step 4: Commit**

```bash
git add HG/frontend/src/app/admin/admin/game-builder/page.tsx
git commit -m "feat(frontend): add 3-step game builder wizard for Admin"
```

---

## Task 4: Frontend — Agent Sales Page

**Files:**
- Create: `HG/frontend/src/app/admin/agent/sales/page.tsx`

### Context

- This page is already linked in the Agent nav at `/admin/agent/sales` in `admin/layout.tsx`.
- Games are fetched from `GET /api/games`; filter to `game_status === 'Scheduled' || 'Live'` on the frontend.
- Ticket grid uses `GET /api/games/:game_id/tickets` (returns `{ tickets: [...] }`).
- Direct sale calls `POST /api/bookings/agent/direct-sale` with `{ game_id, ticket_ids, housie_name }`.
- After a successful sale: reload ticket grid, reload sales history, refresh wallet balance via `GET /api/auth/me`.
- `GET /api/bookings/agent/sales` returns the history array.
- Max 6 tickets selectable per booking (matches player flow).

- [ ] **Step 1: Create the page file**

Create `HG/frontend/src/app/admin/agent/sales/page.tsx` with this content:

```tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/authStore";

interface Game {
  game_id: string; title: string; ticket_price: number;
  game_status: string; fill_percentage: number;
}
interface Ticket {
  ticket_id: number; ticket_number: number; status: "Available" | "Locked" | "Sold";
}
interface Sale {
  booking_id: string; housie_name: string; game_title: string;
  ticket_numbers: number[]; total_amount: number; confirmed_at: string;
}

export default function AgentSalesPage() {
  const { setUser } = useAuthStore();

  const [games, setGames] = useState<Game[]>([]);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [housieName, setHousieName] = useState("");
  const [saleLoading, setSaleLoading] = useState(false);
  const [saleError, setSaleError] = useState("");
  const [saleSuccess, setSaleSuccess] = useState("");
  const [sales, setSales] = useState<Sale[]>([]);

  const loadGames = useCallback(async () => {
    const all = await apiFetch<Game[]>("/api/games").catch(() => []);
    setGames(all.filter((g) => g.game_status === "Scheduled" || g.game_status === "Live"));
  }, []);

  const loadSales = useCallback(async () => {
    const data = await apiFetch<Sale[]>("/api/bookings/agent/sales").catch(() => []);
    setSales(data);
  }, []);

  const loadWallet = useCallback(async () => {
    const me = await apiFetch<{ user: any }>("/api/auth/me").catch(() => null);
    if (me) setUser(me.user);
  }, [setUser]);

  const loadTickets = useCallback(async (game: Game) => {
    const data = await apiFetch<{ tickets: Ticket[] }>(`/api/games/${game.game_id}/tickets`).catch(() => ({ tickets: [] }));
    setTickets(data.tickets);
  }, []);

  useEffect(() => {
    loadGames();
    loadSales();
  }, [loadGames, loadSales]);

  const selectGame = async (gameId: string) => {
    const game = games.find((g) => g.game_id === gameId);
    if (!game) return;
    setSelectedGame(game);
    setSelected([]);
    setHousieName("");
    setSaleError("");
    setSaleSuccess("");
    await loadTickets(game);
  };

  const toggle = (id: number) => {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= 6 ? prev : [...prev, id]
    );
  };

  const handleSale = async () => {
    if (!selectedGame || selected.length === 0 || !housieName.trim()) return;
    setSaleLoading(true); setSaleError(""); setSaleSuccess("");
    try {
      const result = await apiFetch<{ booking_id: string; total_amount: number; balance_after: number }>(
        "/api/bookings/agent/direct-sale",
        {
          method: "POST",
          body: JSON.stringify({
            game_id: selectedGame.game_id,
            ticket_ids: selected,
            housie_name: housieName.trim(),
          }),
        }
      );
      setSaleSuccess(
        `✓ Sale confirmed — ₹${result.total_amount} · Booking #${result.booking_id.slice(0, 8).toUpperCase()}`
      );
      setSelected([]);
      setHousieName("");
      await Promise.all([loadSales(), loadWallet(), loadTickets(selectedGame)]);
    } catch (e: any) {
      setSaleError(e.message ?? "Sale failed. Try again.");
    } finally { setSaleLoading(false); }
  };

  const totalAmount = selectedGame ? selectedGame.ticket_price * selected.length : 0;

  return (
    <div className="max-w-2xl space-y-6">
      {/* ── Direct Sale ── */}
      <div className="bg-bg2 border border-border rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Direct Sale</h2>

        {/* Game picker */}
        <div className="mb-4">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[#9ca3af] mb-1.5">
            Select Game
          </label>
          <select
            value={selectedGame?.game_id ?? ""}
            onChange={(e) => selectGame(e.target.value)}
            className="w-full bg-bg3 border border-border text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-border-active">
            <option value="">— Choose a game —</option>
            {games.map((g) => (
              <option key={g.game_id} value={g.game_id}>
                {g.title} · ₹{g.ticket_price}/ticket · {g.fill_percentage}% sold
              </option>
            ))}
          </select>
        </div>

        {selectedGame && (
          <>
            {/* Ticket grid */}
            <p className="text-xs text-[#9ca3af] mb-3">
              Select up to 6 tickets for the customer.
              {selected.length > 0 && (
                <span className="ml-2 text-gold font-mono">{selected.length} selected · ₹{totalAmount}</span>
              )}
            </p>
            <div className="grid grid-cols-10 gap-1.5 mb-5">
              {tickets.map((t) => {
                const sel = selected.includes(t.ticket_id);
                return (
                  <button
                    key={t.ticket_id}
                    disabled={t.status !== "Available"}
                    onClick={() => toggle(t.ticket_id)}
                    className={`h-9 rounded-lg border text-xs font-mono font-bold transition-all ${
                      sel
                        ? "bg-gold/20 border-gold text-gold scale-105"
                        : t.status === "Sold"
                        ? "bg-bg1 border-border/40 text-[#3b3f4a] cursor-not-allowed"
                        : t.status === "Locked"
                        ? "bg-warning/5 border-warning/20 text-warning/40 cursor-not-allowed"
                        : "bg-bg3 border-border text-[#6b7280] hover:border-gold/40 hover:text-white"
                    }`}>
                    {t.status === "Sold" ? "×" : t.status === "Locked" ? "🔒" : t.ticket_number}
                  </button>
                );
              })}
            </div>

            {/* Name + confirm */}
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#9ca3af] mb-1.5">
                  Customer Housie Name
                </label>
                <input
                  value={housieName}
                  onChange={(e) => setHousieName(e.target.value)}
                  placeholder="e.g. LuckyStar7"
                  maxLength={20}
                  className="w-full bg-bg3 border border-border text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-border-active placeholder:text-[#4b5563]"
                />
              </div>
              <button
                onClick={handleSale}
                disabled={saleLoading || selected.length === 0 || !housieName.trim()}
                className="bg-gold text-forest font-black text-xs px-5 py-2.5 rounded-xl hover:bg-gold-light transition-all disabled:opacity-40 whitespace-nowrap">
                {saleLoading ? "Processing..." : `Sell ${selected.length} · ₹${totalAmount}`}
              </button>
            </div>

            {saleError && <p className="text-danger text-xs mt-2">{saleError}</p>}
            {saleSuccess && <p className="text-success text-xs mt-2">{saleSuccess}</p>}
          </>
        )}

        {games.length === 0 && (
          <p className="text-[#6b7280] text-sm">No active or scheduled games available for sales.</p>
        )}
      </div>

      {/* ── Sales History ── */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3">Sales History</h2>
        {sales.length === 0 ? (
          <div className="bg-bg2 border border-dashed border-border rounded-2xl p-10 text-center text-[#6b7280] text-sm">
            No sales yet. Use Direct Sale above to sell your first ticket.
          </div>
        ) : (
          <div className="space-y-2">
            {sales.map((s) => (
              <div
                key={s.booking_id}
                className="bg-bg2 border border-border rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">{s.housie_name}</p>
                  <p className="text-xs text-[#6b7280] font-mono">
                    {s.game_title} · #{s.ticket_numbers.join(", #")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono font-bold text-gold">₹{s.total_amount}</p>
                  <p className="text-[10px] text-[#6b7280]">
                    {new Date(s.confirmed_at).toLocaleString("en-IN")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript / lint**

```bash
cd HG/frontend && npm run lint
```

Expected: no errors.

- [ ] **Step 3: Manually verify the page**

Log in as an Agent at `http://localhost:3000/admin/login`. Navigate to **Sales** in the sidebar.

Verify these behaviours:
1. Selecting a game from the dropdown loads the ticket grid immediately below it.
2. Available tickets are clickable; Sold tickets show `×` and are disabled; Locked tickets show 🔒 and are disabled.
3. Selecting more than 6 tickets is blocked (7th click does nothing).
4. "Sell" button is disabled until at least one ticket is selected and a housie name is entered.
5. After a successful sale: the success message shows booking ID and amount; selected tickets become `×` in the grid; Sales History table shows the new row at the top; Wallet balance in the topbar decreases.
6. If wallet balance is insufficient, an error message appears under the button.
7. Sales History shows "No sales yet." when the agent has no confirmed sales.

- [ ] **Step 4: Commit**

```bash
git add HG/frontend/src/app/admin/agent/sales/page.tsx
git commit -m "feat(frontend): add agent direct-sale form and sales history page"
```

---

## Self-Review Notes

**Spec coverage:**
- ✓ Game builder wizard: 3 steps, all fields, cap meter, operator dropdown, redirect on success
- ✓ directSale backend: atomic lock+confirm, wallet check, ledger entry, game status guard
- ✓ getAgentSales backend: filtered by confirmed_by, ticket numbers resolved
- ✓ Agent sales page: game picker, ticket grid, direct sale form, sales history
- ✓ After sale: ticket grid refreshes, history refreshes, wallet balance refreshes

**Type consistency:**
- `WizardState.prizes` uses `prize_amount: string` (string form input), parsed to float only on submit — consistent throughout Task 3.
- `Ticket.ticket_id` is `number` matching the `ticket_id = ANY($1)` query expectation.
- `Sale.ticket_numbers` is `number[]` matching the join query output.

**Route ordering:**
- `GET /agent/sales` and `POST /agent/direct-sale` declared before `POST /agent/:booking_id/confirm` in routes file — no Express path collision.

**Edge cases covered:**
- Operator dropdown gracefully handles zero operators (only shows the "no operator" option).
- Prize pattern dropdown only shows patterns not already used in another row.
- `GET /api/games` may return Completed games; filtered on frontend to Scheduled/Live only.
