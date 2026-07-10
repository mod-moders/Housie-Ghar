# CFO Designation & Financial Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Superadmin designate one Admin as Financial Officer (CFO); a CFO's dashboard becomes a Financial Hub (HUD totals, recharge-approval queue, master bookie ledger, manual ledger adjust), and bookie recharge requests route to the CFO's WhatsApp.

**Architecture:** Wire the already-written-but-dangling `designateCfo` controller and `requireFinancialOfficer` middleware; assemble the Hub from existing wallet endpoints plus three new ones (HUD aggregates, master ledger, manual adjust); extract a shared `buildWaLink` util and use it for recharge routing. Frontend reads `is_cfo` (already returned by `/api/auth/me`) and conditionally renders the Hub.

**Tech Stack:** Express + TypeScript + pg (backend), Next.js 16 / React 19 / Zustand / Tailwind (frontend), Socket.io, `node:test` for unit tests.

**Conventions for this plan:**
- Backend tests: `cd HG/backend && npm test` (runs `node --test` on `src/**/*.test.ts`). Pure units get true TDD; DB-backed controllers are verified by build + manual smoke (the repo has no DB integration harness).
- TypeScript build check: `cd HG/backend && npm run build`.
- Frontend check: `cd HG/frontend && npm run lint && npm run build`.
- Run migrations once before manual testing: `cd HG/backend && npm run migrate` (applies `011` + `012`).

---

## Task 1: Shared `buildWaLink` util (extract + reuse)

**Files:**
- Create: `HG/backend/src/utils/waLink.ts`
- Create (test): `HG/backend/src/utils/waLink.test.ts`
- Modify: `HG/backend/src/modules/bookings/bookings.controller.ts` (~line 116–135 + call sites 176, 219)

- [ ] **Step 1: Write the failing test**

`HG/backend/src/utils/waLink.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWaLink } from './waLink';

test('strips non-numeric chars from phone except +', () => {
  assert.equal(
    buildWaLink('+91 90466-82303', 'hi'),
    'https://wa.me/+919046682303?text=hi'
  );
});

test('url-encodes the message', () => {
  const link = buildWaLink('919046682303', 'Hi Ram, ₹500?');
  assert.ok(link.startsWith('https://wa.me/919046682303?text='));
  assert.ok(link.includes(encodeURIComponent('Hi Ram, ₹500?')));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd HG/backend && npm test`
Expected: FAIL — `Cannot find module './waLink'`.

- [ ] **Step 3: Write minimal implementation**

`HG/backend/src/utils/waLink.ts`:
```ts
/**
 * Build a wa.me deep link. Strips formatting from the phone (keeps digits and +),
 * URL-encodes the prefilled message. Callers compose their own message.
 */
export function buildWaLink(phone: string, message: string): string {
  const formattedPhone = phone.replace(/[^0-9+]/g, '');
  return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd HG/backend && npm test`
Expected: PASS for both `waLink` tests.

- [ ] **Step 5: Refactor bookings.controller to use the util**

In `HG/backend/src/modules/bookings/bookings.controller.ts`, add to the imports at the top of the file:
```ts
import { buildWaLink } from '../../utils/waLink';
```

Replace the inner helper (currently lines ~116–120):
```ts
    const buildWaLink = (phone: string, fullName: string, bookingId: string): string => {
      const formattedPhone = phone.replace(/[^0-9+]/g, '');
      const msg = `Hi ${fullName}, I am ${housie_name}. I want to book Ticket(s): [${ticketNumbersList}] for "${game.title}". Booking ID: #${bookingId.substring(0, 8).toUpperCase()}. Amount: ₹${totalAmount}.`;
      return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(msg)}`;
    };
```
with (renamed so it no longer shadows the imported util):
```ts
    const makeBookingWaLink = (phone: string, fullName: string, bookingId: string): string => {
      const msg = `Hi ${fullName}, I am ${housie_name}. I want to book Ticket(s): [${ticketNumbersList}] for "${game.title}". Booking ID: #${bookingId.substring(0, 8).toUpperCase()}. Amount: ₹${totalAmount}.`;
      return buildWaLink(phone, msg);
    };
```

Then update the two call sites:
- Line ~176: `whatsapp_link: buildWaLink(operator.phone, operator.full_name, overflowBookingId),` → `whatsapp_link: makeBookingWaLink(operator.phone, operator.full_name, overflowBookingId),`
- Line ~219: `whatsapp_link: buildWaLink(assigned.phone, assigned.full_name, bookingId),` → `whatsapp_link: makeBookingWaLink(assigned.phone, assigned.full_name, bookingId),`

- [ ] **Step 6: Verify build + tests**

Run: `cd HG/backend && npm run build && npm test`
Expected: build succeeds, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add HG/backend/src/utils/waLink.ts HG/backend/src/utils/waLink.test.ts HG/backend/src/modules/bookings/bookings.controller.ts
git commit -m "refactor(backend): extract shared buildWaLink util"
```

---

## Task 2: Wire CFO designation route + expose is_cfo in listUsers

**Files:**
- Modify: `HG/backend/src/modules/users/users.routes.ts`
- Modify: `HG/backend/src/modules/users/users.controller.ts` (`listUsers`, ~lines 17–47)

> `designateCfo` already exists in the controller (Superadmin/Admin-target validation, single-CFO invariant, audit log). This task only adds its route (Superadmin-only) and surfaces `is_cfo` + `role_id` so the UI can render the toggle.

- [ ] **Step 1: Add the route**

In `HG/backend/src/modules/users/users.routes.ts`, change the import line:
```ts
import { listUsers, createUser, updateUser } from './users.controller';
```
to:
```ts
import { listUsers, createUser, updateUser, designateCfo } from './users.controller';
```
and add this route after the `updateUser` route:
```ts
// CFO designation — Superadmin only
router.patch('/:id/cfo', authenticateToken, requireRole(['Superadmin']), designateCfo);
```

- [ ] **Step 2: Add is_cfo + role_id to listUsers**

In `HG/backend/src/modules/users/users.controller.ts`, in `listUsers`, change the SELECT column list from:
```ts
      `SELECT u.user_id, u.full_name, u.email, u.phone, u.upi_id, u.status,
              u.current_balance, u.last_login, r.role_name,
```
to:
```ts
      `SELECT u.user_id, u.full_name, u.email, u.phone, u.upi_id, u.status,
              u.current_balance, u.last_login, u.role_id, u.is_cfo, r.role_name,
```
and in the `.map(...)` response object add these two fields (after `role_name: row.role_name,`):
```ts
        role_id: row.role_id,
        is_cfo: row.is_cfo === true,
```

- [ ] **Step 3: Verify build**

Run: `cd HG/backend && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual smoke (optional, requires running stack + migrations)**

```bash
cd HG/backend && npm run migrate   # ensure is_cfo column exists
```
With a Superadmin session cookie, `PATCH /api/users/<adminId>/cfo` returns `{ is_cfo: true, message: "... is now the Financial Officer" }`; `GET /api/users` shows that admin with `is_cfo: true` and all others `false`.

- [ ] **Step 5: Commit**

```bash
git add HG/backend/src/modules/users/users.routes.ts HG/backend/src/modules/users/users.controller.ts
git commit -m "feat(backend): wire Superadmin-only CFO designation route + expose is_cfo"
```

---

## Task 3: Route recharge requests to the CFO's WhatsApp

**Files:**
- Create: `HG/backend/src/modules/wallet/rechargeContact.ts`
- Create (test): `HG/backend/src/modules/wallet/rechargeContact.test.ts`
- Modify: `HG/backend/src/modules/wallet/wallet.controller.ts` (`requestTopUp`, ~lines 125–161)

- [ ] **Step 1: Write the failing test for the pure message builder**

`HG/backend/src/modules/wallet/rechargeContact.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRechargeMessage } from './rechargeContact';

test('recharge message includes agent name, amount, and reference', () => {
  const msg = buildRechargeMessage('Ramesh K.', 5000, 'UPI-8841');
  assert.ok(msg.includes('Ramesh K.'));
  assert.ok(msg.includes('5000'));
  assert.ok(msg.includes('UPI-8841'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd HG/backend && npm test`
Expected: FAIL — `Cannot find module './rechargeContact'`.

- [ ] **Step 3: Write the implementation**

`HG/backend/src/modules/wallet/rechargeContact.ts`:
```ts
/**
 * Pure builder for the recharge-request WhatsApp message a Bookie sends to the
 * Financial Officer. The CFO/Superadmin lookup itself happens in the controller
 * (it needs the DB); this stays pure so it can be unit-tested.
 */
export function buildRechargeMessage(agentName: string, amount: number, reference: string): string {
  return `Hi, I am ${agentName} (Bookie). I have sent ₹${amount} for a wallet recharge. Reference: ${reference}. Please verify and credit my wallet.`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd HG/backend && npm test`
Expected: PASS.

- [ ] **Step 5: Use it in requestTopUp**

In `HG/backend/src/modules/wallet/wallet.controller.ts`, add to the imports at the top:
```ts
import { buildWaLink } from '../../utils/waLink';
import { buildRechargeMessage } from './rechargeContact';
```

In `requestTopUp`, after the `const request = result.rows[0];` line and before the `io.to('admin-room')...` emit, add the CFO contact lookup and include the link in the response. Replace the final success block:
```ts
    const request = result.rows[0];

    // Notify staff dashboards (admins listening on the shared admin room)
    io.to('admin-room').emit('topup_request_received', {
      request_id: request.request_id,
      agent_name: agent.fullName,
      amount,
    });

    res.status(201).json({ request_id: request.request_id, message: 'Top-up request submitted for approval' });
```
with:
```ts
    const request = result.rows[0];

    // Resolve the recharge contact: the Active Admin designated CFO, else an
    // Active Superadmin. Used to redirect the Bookie to that person's WhatsApp.
    const contactRes = await pool.query(
      `SELECT full_name, phone
       FROM Users
       WHERE status = 'Active' AND phone IS NOT NULL
         AND ((role_id = 2 AND is_cfo = TRUE) OR role_id = 1)
       ORDER BY (role_id = 2 AND is_cfo = TRUE) DESC, role_id ASC
       LIMIT 1`
    );
    let recharge_wa_link: string | null = null;
    if (contactRes.rowCount && contactRes.rows[0].phone) {
      const msg = buildRechargeMessage(agent.fullName, amount, payment_reference);
      recharge_wa_link = buildWaLink(contactRes.rows[0].phone, msg);
    }

    // Notify staff dashboards (admins listening on the shared admin room)
    io.to('admin-room').emit('topup_request_received', {
      request_id: request.request_id,
      agent_name: agent.fullName,
      amount,
    });

    res.status(201).json({
      request_id: request.request_id,
      message: 'Top-up request submitted for approval',
      recharge_wa_link,
    });
```

- [ ] **Step 6: Verify build + tests**

Run: `cd HG/backend && npm run build && npm test`
Expected: build succeeds, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add HG/backend/src/modules/wallet/rechargeContact.ts HG/backend/src/modules/wallet/rechargeContact.test.ts HG/backend/src/modules/wallet/wallet.controller.ts
git commit -m "feat(backend): route Bookie recharge requests to the CFO WhatsApp"
```

---

## Task 4: Manual ledger adjust (validation helper + endpoint)

**Files:**
- Create: `HG/backend/src/modules/wallet/walletAdjust.ts`
- Create (test): `HG/backend/src/modules/wallet/walletAdjust.test.ts`
- Modify: `HG/backend/src/modules/wallet/wallet.controller.ts` (add `manualAdjust`)
- Modify: `HG/backend/src/modules/wallet/wallet.routes.ts`

- [ ] **Step 1: Write the failing test for the pure helpers**

`HG/backend/src/modules/wallet/walletAdjust.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAdjust, computeBalanceAfter, MIN_REASON_LEN } from './walletAdjust';

const goodReason = 'Correcting a bounced bank transfer from yesterday';

test('rejects invalid type', () => {
  const v = validateAdjust({ type: 'Foo', amount: 100, reason: goodReason });
  assert.equal(v.ok, false);
});

test('rejects non-positive amount', () => {
  assert.equal(validateAdjust({ type: 'Credit', amount: 0, reason: goodReason }).ok, false);
  assert.equal(validateAdjust({ type: 'Credit', amount: -5, reason: goodReason }).ok, false);
});

test(`rejects reason shorter than ${MIN_REASON_LEN} chars`, () => {
  assert.equal(validateAdjust({ type: 'Credit', amount: 100, reason: 'too short' }).ok, false);
});

test('accepts a valid credit and coerces amount to number', () => {
  const v = validateAdjust({ type: 'Credit', amount: '150.5', reason: goodReason });
  assert.equal(v.ok, true);
  assert.equal(v.amount, 150.5);
  assert.equal(v.type, 'Credit');
});

test('credit increases balance', () => {
  const r = computeBalanceAfter(100, 'Credit', 50);
  assert.deepEqual(r, { ok: true, balance_after: 150 });
});

test('debit decreases balance', () => {
  const r = computeBalanceAfter(100, 'Debit', 40);
  assert.deepEqual(r, { ok: true, balance_after: 60 });
});

test('debit that would go negative is rejected', () => {
  const r = computeBalanceAfter(30, 'Debit', 40);
  assert.equal(r.ok, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd HG/backend && npm test`
Expected: FAIL — `Cannot find module './walletAdjust'`.

- [ ] **Step 3: Write the implementation**

`HG/backend/src/modules/wallet/walletAdjust.ts`:
```ts
export type AdjustType = 'Credit' | 'Debit';
export const MIN_REASON_LEN = 20;

export interface AdjustValidation {
  ok: boolean;
  error?: string;
  type?: AdjustType;
  amount?: number;
  reason?: string;
}

/** Validate a manual-adjust request body. Pure — no DB. */
export function validateAdjust(input: { type?: unknown; amount?: unknown; reason?: unknown }): AdjustValidation {
  const { type, amount, reason } = input;
  if (type !== 'Credit' && type !== 'Debit') {
    return { ok: false, error: "type must be 'Credit' or 'Debit'" };
  }
  const amt = typeof amount === 'string' ? parseFloat(amount) : (amount as number);
  if (typeof amt !== 'number' || isNaN(amt) || amt <= 0) {
    return { ok: false, error: 'amount must be a positive number' };
  }
  if (typeof reason !== 'string' || reason.trim().length < MIN_REASON_LEN) {
    return { ok: false, error: `reason is required and must be at least ${MIN_REASON_LEN} characters` };
  }
  return { ok: true, type, amount: amt, reason: reason.trim() };
}

export interface BalanceResult {
  ok: boolean;
  balance_after?: number;
  error?: string;
}

/** Compute the post-adjustment balance, rejecting debits that would go negative. */
export function computeBalanceAfter(current: number, type: AdjustType, amount: number): BalanceResult {
  if (type === 'Credit') return { ok: true, balance_after: current + amount };
  if (amount > current) return { ok: false, error: 'Debit would make the wallet balance negative' };
  return { ok: true, balance_after: current - amount };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd HG/backend && npm test`
Expected: PASS for all `walletAdjust` tests.

- [ ] **Step 5: Add the `manualAdjust` controller**

In `HG/backend/src/modules/wallet/wallet.controller.ts`, add to the imports at the top:
```ts
import { validateAdjust, computeBalanceAfter } from './walletAdjust';
```
and append this function to the end of the file:
```ts
/**
 * Manual ledger adjustment by the Financial Officer (credit or debit with a
 * mandatory reason). ACID; debits cannot drive the balance negative.
 */
export async function manualAdjust(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { agentId } = req.params;
  const actor = req.user!;

  const v = validateAdjust(req.body);
  if (!v.ok) {
    res.status(400).json({ message: v.error });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const agentRes = await client.query(
      `SELECT current_balance, role_id FROM Users WHERE user_id = $1 FOR UPDATE`,
      [agentId]
    );
    if (agentRes.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Agent not found' });
      return;
    }
    if (agentRes.rows[0].role_id !== 4) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'Manual adjustments apply only to Bookie wallets' });
      return;
    }

    const current = parseFloat(agentRes.rows[0].current_balance);
    const calc = computeBalanceAfter(current, v.type!, v.amount!);
    if (!calc.ok) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: calc.error });
      return;
    }

    await client.query(`UPDATE Users SET current_balance = $1 WHERE user_id = $2`, [
      calc.balance_after,
      agentId,
    ]);

    await client.query(
      `INSERT INTO Wallet_Ledger (agent_id, transaction_type, amount, balance_after, reference_type, description, performed_by)
       VALUES ($1, $2, $3, $4, 'Manual', $5, $6)`,
      [agentId, v.type, v.amount, calc.balance_after, v.reason, actor.userId]
    );

    await client.query('COMMIT');

    io.to(`agent-${agentId}`).emit(v.type === 'Credit' ? 'wallet_credited' : 'wallet_debited', {
      new_balance: calc.balance_after,
      amount: v.amount,
    });

    await logAuditEvent({
      userId: actor.userId,
      userName: actor.fullName,
      userRole: actor.roleName,
      action: 'MANUAL_ADJUST',
      targetType: 'User',
      targetId: String(agentId),
      targetDescription: `${v.type} ₹${v.amount} — ${v.reason}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ message: 'Adjustment applied', new_balance: calc.balance_after });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error applying manual adjustment:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
}
```

- [ ] **Step 6: Add the route (FO-guarded)**

In `HG/backend/src/modules/wallet/wallet.routes.ts`, extend the controller import to include `manualAdjust` (added with the HUD/master-ledger imports in Task 5) — for now add `manualAdjust` to the import list and add the middleware import + route:
```ts
import { authenticateToken, requireRole, requireFinancialOfficer } from '../../middleware/auth';
```
and add at the end (before `export default router;`):
```ts
// Financial Officer hub
router.post('/agents/:agentId/adjust', authenticateToken, requireFinancialOfficer, manualAdjust);
```
Add `manualAdjust` to the existing `import { ... } from './wallet.controller';` list.

- [ ] **Step 7: Verify build + tests**

Run: `cd HG/backend && npm run build && npm test`
Expected: build succeeds, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add HG/backend/src/modules/wallet/walletAdjust.ts HG/backend/src/modules/wallet/walletAdjust.test.ts HG/backend/src/modules/wallet/wallet.controller.ts HG/backend/src/modules/wallet/wallet.routes.ts
git commit -m "feat(backend): add FO manual ledger adjust endpoint"
```

---

## Task 5: Financial HUD + master ledger endpoints

**Files:**
- Modify: `HG/backend/src/modules/wallet/wallet.controller.ts` (add `getFinancialHud`, `getMasterLedger`)
- Modify: `HG/backend/src/modules/wallet/wallet.routes.ts`

- [ ] **Step 1: Add the two controllers**

In `HG/backend/src/modules/wallet/wallet.controller.ts`, append:
```ts
/**
 * Financial HUD aggregates for the FO ribbon.
 */
export async function getFinancialHud(_req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const [liability, gross, pending] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(current_balance), 0) AS total FROM Users WHERE role_id = 4`),
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM Wallet_Ledger
         WHERE transaction_type = 'Credit' AND created_at::date = CURRENT_DATE`
      ),
      pool.query(`SELECT COUNT(*) AS c FROM TopUp_Requests WHERE request_status = 'Pending'`),
    ]);

    res.json({
      total_liability: parseFloat(liability.rows[0].total),
      daily_gross_processed: parseFloat(gross.rows[0].total),
      pending_count: parseInt(pending.rows[0].c, 10),
    });
  } catch (error) {
    console.error('Error building financial HUD:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Master Bookie Ledger: every bookie with balance, lifetime top-ups, last
 * recharge timestamp, and any pending recharge requests.
 */
export async function getMasterLedger(_req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const agentsRes = await pool.query(
      `SELECT u.user_id, u.full_name, u.phone, u.status, u.current_balance,
              COALESCE(SUM(CASE WHEN w.transaction_type = 'Credit' AND w.reference_type = 'TopUp' THEN w.amount END), 0) AS lifetime_topups,
              MAX(CASE WHEN w.transaction_type = 'Credit' AND w.reference_type = 'TopUp' THEN w.created_at END) AS last_recharge_at
       FROM Users u
       LEFT JOIN Wallet_Ledger w ON w.agent_id = u.user_id
       WHERE u.role_id = 4
       GROUP BY u.user_id
       ORDER BY u.full_name ASC`
    );

    const pendingRes = await pool.query(
      `SELECT request_id, agent_id, requested_amount, payment_reference, requested_at
       FROM TopUp_Requests
       WHERE request_status = 'Pending'
       ORDER BY requested_at ASC`
    );
    const pendingByAgent: Record<string, any[]> = {};
    for (const r of pendingRes.rows) {
      (pendingByAgent[r.agent_id] ||= []).push({
        request_id: r.request_id,
        requested_amount: parseFloat(r.requested_amount),
        payment_reference: r.payment_reference,
        requested_at: r.requested_at,
      });
    }

    res.json(
      agentsRes.rows.map((a) => ({
        agent_id: a.user_id,
        full_name: a.full_name,
        phone: a.phone,
        status: a.status,
        current_balance: parseFloat(a.current_balance),
        lifetime_topups: parseFloat(a.lifetime_topups),
        last_recharge_at: a.last_recharge_at,
        pending_requests: pendingByAgent[a.user_id] || [],
      }))
    );
  } catch (error) {
    console.error('Error building master ledger:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
```

- [ ] **Step 2: Add the routes**

In `HG/backend/src/modules/wallet/wallet.routes.ts`, add `getFinancialHud, getMasterLedger` to the `./wallet.controller` import list, and add (next to the adjust route from Task 4):
```ts
router.get('/hud', authenticateToken, requireFinancialOfficer, getFinancialHud);
router.get('/master-ledger', authenticateToken, requireFinancialOfficer, getMasterLedger);
```

- [ ] **Step 3: Verify build**

Run: `cd HG/backend && npm run build && npm test`
Expected: build succeeds, all tests pass.

- [ ] **Step 4: Manual smoke (optional)**

With a CFO Admin (or Superadmin) session: `GET /api/wallet/hud` returns the three numbers; `GET /api/wallet/master-ledger` returns the bookie array. A non-CFO Admin gets `403`.

- [ ] **Step 5: Commit**

```bash
git add HG/backend/src/modules/wallet/wallet.controller.ts HG/backend/src/modules/wallet/wallet.routes.ts
git commit -m "feat(backend): add FO financial HUD + master ledger endpoints"
```

---

## Task 6: Frontend — authStore carries is_cfo

**Files:**
- Modify: `HG/frontend/src/lib/stores/authStore.ts`

- [ ] **Step 1: Add the field**

In `HG/frontend/src/lib/stores/authStore.ts`, add `is_cfo` to `AuthUser` (after `current_balance?: number;`):
```ts
  is_cfo?: boolean;
```
(`/api/auth/me` already returns `is_cfo`, so no other change is needed for the value to flow through `setUser`.)

- [ ] **Step 2: Verify**

Run: `cd HG/frontend && npm run lint`
Expected: no new lint errors.

- [ ] **Step 3: Commit**

```bash
git add HG/frontend/src/lib/stores/authStore.ts
git commit -m "feat(frontend): carry is_cfo on the auth store"
```

---

## Task 7: Frontend — Superadmin CFO designation toggle

**Files:**
- Modify: `HG/frontend/src/app/admin/superadmin/users/page.tsx`

- [ ] **Step 1: Extend the User interface + add the toggle handler**

In `HG/frontend/src/app/admin/superadmin/users/page.tsx`, change the `User` interface to:
```ts
interface User {
  user_id: string; full_name: string; email: string;
  role_name: string; status: string; current_balance?: number;
  role_id?: number; is_cfo?: boolean;
}
```
and add this handler next to `toggleUser`:
```ts
  const toggleCfo = async (userId: string, isCfo: boolean) => {
    try {
      await apiFetch(`/api/users/${userId}/cfo`, {
        method: "PATCH",
        body: JSON.stringify({ is_cfo: !isCfo }),
      });
      reload();
    } catch (e: any) { alert(e.message); }
  };
```

- [ ] **Step 2: Render the CFO control for Admin rows**

In the row markup, alongside the existing suspend button, add (for Admins only) a CFO badge + toggle. Insert this just before the suspend `<button>`:
```tsx
          {u.role_id === 2 && (
            <button onClick={() => toggleCfo(u.user_id, !!u.is_cfo)}
              className={`text-[10px] font-bold px-3 py-1.5 rounded-xl border transition-all mr-2 ${
                u.is_cfo
                  ? "border-gold/40 text-gold bg-gold/10"
                  : "border-border text-[#9ca3af] hover:text-white"
              }`}>
              {u.is_cfo ? "★ Financial Officer" : "Make FO"}
            </button>
          )}
```
(If the suspend button and CFO button are not already in a flex container, wrap them in `<div className="flex items-center">…</div>`.)

- [ ] **Step 3: Verify**

Run: `cd HG/frontend && npm run lint && npm run build`
Expected: builds cleanly.

- [ ] **Step 4: Manual smoke (optional)**

As Superadmin on the Users page: an Admin row shows "Make FO"; clicking it flips to "★ Financial Officer" and any previously-designated Admin reverts to "Make FO" after reload.

- [ ] **Step 5: Commit**

```bash
git add HG/frontend/src/app/admin/superadmin/users/page.tsx
git commit -m "feat(frontend): Superadmin CFO designation toggle"
```

---

## Task 8: Frontend — Financial Hub component

**Files:**
- Create: `HG/frontend/src/app/admin/admin/FinancialHub.tsx`

This is the approved v2 layout adapted to the existing dark forest/gold theme (`bg2`, `border`, `gold`, `success`, `danger`, `font-display`). Progressive disclosure: active queue row reveals actions; selecting a bookie reveals the ledger detail; manual adjust is a modal.

- [ ] **Step 1: Create the component**

`HG/frontend/src/app/admin/admin/FinancialHub.tsx`:
```tsx
"use client";
import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";

interface Hud { total_liability: number; daily_gross_processed: number; pending_count: number; }
interface PendingReq { request_id: string; requested_amount: number; payment_reference: string; requested_at: string; }
interface LedgerRow {
  agent_id: string; full_name: string; phone: string; status: string;
  current_balance: number; lifetime_topups: number; last_recharge_at: string | null;
  pending_requests: PendingReq[];
}

const LOW_BALANCE = 500;
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export default function FinancialHub() {
  const [hud, setHud] = useState<Hud | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [adjustFor, setAdjustFor] = useState<LedgerRow | null>(null);

  const reload = useCallback(() => {
    apiFetch<Hud>("/api/wallet/hud").then(setHud).catch(() => {});
    apiFetch<LedgerRow[]>("/api/wallet/master-ledger").then(setLedger).catch(() => {});
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const pending = ledger.flatMap((l) => l.pending_requests.map((p) => ({ ...p, agent: l })));
  const selectedRow = ledger.find((l) => l.agent_id === selected) || null;

  const approve = async (id: string) => {
    try { await apiFetch(`/api/wallet/topup/${id}/approve`, { method: "POST" }); }
    catch (e: any) { alert(e.message); }
    reload();
  };
  const reject = async (id: string) => {
    try { await apiFetch(`/api/wallet/topup/${id}/reject`, { method: "POST", body: JSON.stringify({ reviewer_notes: "Rejected by FO" }) }); }
    catch (e: any) { alert(e.message); }
    reload();
  };

  return (
    <div className="max-w-6xl">
      {/* HUD ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Platform Liability", value: hud ? inr(hud.total_liability) : "—", hint: "all bookie balances" },
          { label: "Daily Gross Processed", value: hud ? inr(hud.daily_gross_processed) : "—", hint: "credits approved today" },
          { label: "Pending Recharge Requests", value: hud ? String(hud.pending_count) : "—", hint: "awaiting your approval" },
        ].map((s) => (
          <div key={s.label} className="bg-bg2 border border-border rounded-2xl p-4">
            <p className="text-[10px] text-[#9ca3af] uppercase tracking-wider">{s.label}</p>
            <p className="font-display text-2xl font-black text-white mt-1">{s.value}</p>
            <p className="text-[10px] text-[#6b7280] mt-0.5">{s.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recharge queue */}
        <div className="bg-bg2 border border-border rounded-2xl p-4">
          <p className="text-xs font-semibold text-white mb-3 uppercase tracking-wider">Recharge Queue</p>
          {pending.length === 0 && <p className="text-[#6b7280] text-sm">No pending requests.</p>}
          {pending.map((p) => (
            <div key={p.request_id} className="border border-border rounded-xl p-3 mb-2">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-white text-sm">{p.agent.full_name}</span>
                <span className="text-gold font-display font-black">{inr(p.requested_amount)}</span>
              </div>
              <p className="text-[11px] text-[#9ca3af] mt-1">
                wallet {inr(p.agent.current_balance)} · ref {p.payment_reference}
              </p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => approve(p.request_id)}
                  className="flex-1 bg-success text-white text-xs font-bold py-2 rounded-lg hover:opacity-90 transition-all">
                  Credit wallet
                </button>
                <button onClick={() => reject(p.request_id)}
                  className="flex-1 border border-danger/40 text-danger text-xs font-bold py-2 rounded-lg hover:bg-danger hover:text-white transition-all">
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Master bookie ledger */}
        <div className="bg-bg2 border border-border rounded-2xl p-4">
          <p className="text-xs font-semibold text-white mb-3 uppercase tracking-wider">Master Bookie Ledger</p>
          {ledger.map((l) => {
            const low = l.current_balance < LOW_BALANCE;
            const open = selected === l.agent_id;
            return (
              <div key={l.agent_id} className="border border-border rounded-xl mb-2 overflow-hidden">
                <button onClick={() => setSelected(open ? null : l.agent_id)}
                  className="w-full flex justify-between items-center p-3 hover:bg-bg transition-all">
                  <span className="font-semibold text-white text-sm">{l.full_name}</span>
                  <span className={`font-display font-black ${low ? "text-danger" : "text-white"}`}>
                    {inr(l.current_balance)}{low && " ⚠"}
                  </span>
                </button>
                {open && (
                  <div className="p-3 border-t border-border text-[11px] text-[#9ca3af] space-y-1">
                    <p>Lifetime top-ups: <span className="text-white">{inr(l.lifetime_topups)}</span></p>
                    <p>Last recharge: <span className="text-white">{l.last_recharge_at ? new Date(l.last_recharge_at).toLocaleDateString() : "—"}</span></p>
                    <div className="flex gap-2 pt-2">
                      <button onClick={() => setAdjustFor(l)}
                        className="border border-border text-[#9ca3af] hover:text-white text-[11px] px-3 py-1.5 rounded-lg transition-all">
                        ⚙ Manual adjust
                      </button>
                      {low && l.phone && (
                        <a href={`https://wa.me/${l.phone.replace(/[^0-9+]/g, "")}?text=${encodeURIComponent(`Hi ${l.full_name}, your wallet is low (${inr(l.current_balance)}). Top up before the next game so you don't miss sales.`)}`}
                          target="_blank" rel="noopener noreferrer"
                          className="border border-gold/40 text-gold text-[11px] px-3 py-1.5 rounded-lg hover:bg-gold/10 transition-all">
                          WhatsApp top-up nudge
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {adjustFor && (
        <ManualAdjustModal agent={adjustFor} onClose={() => setAdjustFor(null)} onDone={() => { setAdjustFor(null); reload(); }} />
      )}
    </div>
  );
}

function ManualAdjustModal({ agent, onClose, onDone }: { agent: LedgerRow; onClose: () => void; onDone: () => void; }) {
  const [type, setType] = useState<"Credit" | "Debit">("Credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const valid = parseFloat(amount) > 0 && reason.trim().length >= 20;

  const submit = async () => {
    try {
      await apiFetch(`/api/wallet/agents/${agent.agent_id}/adjust`, {
        method: "POST",
        body: JSON.stringify({ type, amount: parseFloat(amount), reason: reason.trim() }),
      });
      onDone();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-bg2 border border-border rounded-2xl p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold text-white mb-4">Manual Adjust — {agent.full_name}</p>
        <div className="flex gap-2 mb-3">
          {(["Credit", "Debit"] as const).map((t) => (
            <button key={t} onClick={() => setType(t)}
              className={`flex-1 text-xs font-bold py-2 rounded-lg border transition-all ${
                type === t ? (t === "Credit" ? "border-success/40 text-success bg-success/10" : "border-danger/40 text-danger bg-danger/10") : "border-border text-[#9ca3af]"
              }`}>
              {t}
            </button>
          ))}
        </div>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" placeholder="Amount (₹)"
          className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-white mb-3" />
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
          placeholder="Reason (required, min 20 chars)"
          className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-white mb-1" />
        <p className="text-[10px] text-[#6b7280] mb-3">{reason.trim().length}/20 — written to the audit log.</p>
        <div className="flex gap-2">
          <button onClick={submit} disabled={!valid}
            className="flex-1 bg-gold text-forest font-black text-xs py-2 rounded-lg disabled:opacity-40 transition-all">
            Apply
          </button>
          <button onClick={onClose} className="flex-1 border border-border text-[#9ca3af] text-xs py-2 rounded-lg hover:text-white transition-all">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `cd HG/frontend && npm run lint && npm run build`
Expected: builds cleanly.

- [ ] **Step 3: Commit**

```bash
git add HG/frontend/src/app/admin/admin/FinancialHub.tsx
git commit -m "feat(frontend): add Financial Hub component for the CFO"
```

---

## Task 9: Frontend — render the Hub for a CFO admin

**Files:**
- Modify: `HG/frontend/src/app/admin/admin/page.tsx`

- [ ] **Step 1: Conditionally render the Hub**

In `HG/frontend/src/app/admin/admin/page.tsx`, add to the imports:
```tsx
import { useAuthStore } from "@/lib/stores/authStore";
import FinancialHub from "./FinancialHub";
```
At the top of the `AdminDashboard` component body (before the existing `useState`/`useEffect`), add:
```tsx
  const user = useAuthStore((s) => s.user);
```
Immediately before the existing `return (` of the component, add the early return:
```tsx
  if (user?.is_cfo) {
    return <FinancialHub />;
  }
```
> Hooks above this point still run unconditionally (the early return is after all hooks), satisfying the rules of hooks.

- [ ] **Step 2: Verify**

Run: `cd HG/frontend && npm run lint && npm run build`
Expected: builds cleanly.

- [ ] **Step 3: Manual smoke (optional, full stack)**

Log in as the designated CFO Admin → the dashboard renders the Financial Hub. Log in as a non-CFO Admin → the normal dashboard. Approve a request, then confirm the bookie's balance and HUD update on reload.

- [ ] **Step 4: Commit**

```bash
git add HG/frontend/src/app/admin/admin/page.tsx
git commit -m "feat(frontend): render Financial Hub for designated CFO admin"
```

---

## Task 10: Frontend — agent recharge opens the CFO WhatsApp

**Files:**
- Modify: `HG/frontend/src/app/admin/agent/wallet/page.tsx` (`requestTopUp`, ~lines 21–30)

- [ ] **Step 1: Capture and open recharge_wa_link**

In `HG/frontend/src/app/admin/agent/wallet/page.tsx`, replace the existing `requestTopUp` handler (lines ~21–36) with this version — same body fields, but it now types the response, opens the CFO WhatsApp link, and keeps the existing `setMsg` / `loadLedger` behavior:
```tsx
  const requestTopUp = async () => {
    if (!amount || !reference.trim()) return;
    setMsg("");
    try {
      const res = await apiFetch<{ request_id: string; recharge_wa_link: string | null }>(
        "/api/wallet/topup/request",
        {
          method: "POST",
          body: JSON.stringify({
            requested_amount: Number(amount),
            payment_reference: reference.trim(),
            payment_method: "UPI",
          }),
        }
      );
      if (res.recharge_wa_link) {
        window.open(res.recharge_wa_link, "_blank", "noopener,noreferrer");
        setMsg("Request sent — opening the Financial Officer's WhatsApp…");
      } else {
        setMsg("Request submitted. No Financial Officer is set yet — please contact an admin.");
      }
      setAmount(""); setReference("");
      loadLedger();
    } catch (e: any) { setMsg(e.message); }
  };
```

- [ ] **Step 2: Verify**

Run: `cd HG/frontend && npm run lint && npm run build`
Expected: builds cleanly.

- [ ] **Step 3: Manual smoke (optional)**

As an Agent with a CFO designated: submitting a top-up request opens a WhatsApp tab addressed to the CFO with a prefilled recharge message. With no CFO set: shows the fallback alert.

- [ ] **Step 4: Commit**

```bash
git add HG/frontend/src/app/admin/agent/wallet/page.tsx
git commit -m "feat(frontend): agent recharge opens the CFO WhatsApp"
```

---

## Final verification

- [ ] Backend: `cd HG/backend && npm run build && npm test` — all green.
- [ ] Frontend: `cd HG/frontend && npm run lint && npm run build` — clean.
- [ ] Migrations applied: `cd HG/backend && npm run migrate` (idempotent; `012` adds `is_cfo`).
- [ ] End-to-end smoke: designate a CFO → CFO sees Hub → approve a recharge → agent balance + HUD update → manual debit guard rejects over-debit → agent "Request Funds" opens CFO WhatsApp.

## Spec coverage check

- Designation (Superadmin sets is_cfo, single-CFO, audit) → Tasks 2, 7.
- Hub transform (is_cfo flips the dashboard) → Tasks 6, 8, 9.
- Financial HUD (liability / daily gross / pending) → Tasks 5, 8.
- Recharge queue (approve/reject, reused) → Task 8.
- Master bookie ledger (balance / lifetime / last recharge) → Tasks 5, 8.
- Low-balance highlight + WhatsApp nudge → Task 8.
- Manual adjust (credit/debit, reason ≥20, audit, debit guard) → Tasks 4, 8.
- Recharge → CFO WhatsApp routing → Tasks 1, 3, 10.
- Out of scope (EOD, trust score, OTP, theming) → not implemented, by design.
