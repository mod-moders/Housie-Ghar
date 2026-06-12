# Lucky Number Announcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Public lucky-number announcement on the lobby — the most frequent winning ticket number across the last 60 completed games, refreshed on fixed 12-day cycles — per `docs/superpowers/specs/2026-06-13-lucky-number-design.md`.

**Architecture:** One new public endpoint `GET /api/stats/lucky-number` in the existing stats module (stateless, deterministic per cycle, memoized in-process), plus a `LuckyNumberCard`-style section rendered as the first child of `hg-lobby-v2` on the lobby, styled with new `hg-lucky-*` classes mirroring the live board's `hg-cage-num` ball.

**Tech Stack:** Express 5 + pg (backend, port 4000), Next.js 16 / React 19 (frontend, port 3000), plain CSS in `globals.css`. **No test framework exists in this repo** — per project convention (CLAUDE.md), verification is fixture-first smoke testing: write the SQL fixture and expected output *before* implementing (red), implement, re-run (green).

**Preconditions:** `brew services start postgresql@14 redis` running; DB migrated + seeded. `DATABASE_URL` lives in `/Users/monk/1/HG/.env`. Helper used throughout:

```bash
PSQL() { psql "$(grep -m1 '^DATABASE_URL=' /Users/monk/1/HG/.env | sed 's/^DATABASE_URL=//')" "$@"; }
```

**Memo caveat for smoke phases:** the endpoint memoizes per 12-day cycle, so after changing fixtures the backend must restart to recompute. If a nodemon dev server is already running on port 4000, `touch /Users/monk/1/HG/backend/src/server.ts && sleep 5` restarts it; otherwise start/stop a background `npm run dev` per phase (`lsof -ti:4000` tells you which case you're in).

---

### Task 1: Backend — constants + `GET /api/stats/lucky-number`

**Files:**
- Modify: `HG/backend/src/config/constants.ts` (insert before the `// Prize Patterns` block)
- Modify: `HG/backend/src/modules/stats/stats.controller.ts` (append after `getHallOfFame`)
- Modify: `HG/backend/src/modules/stats/stats.routes.ts`

- [ ] **Step 1: Write the Phase-1 fixture (the "failing test" data)**

Ticket numbers 7777/7778 are impossible in organic data (fixture games declare `total_tickets 9000`), and the target's 8 wins exceed the 6-prizes-per-game organic maximum, so assertions are exact even with seeded data present. Prize rows leave `winner_housie_name` NULL so the hall of fame is not polluted. `completed_at` values are before the current cycle boundary `2026-06-13T00:00:00Z`.

```bash
PSQL <<'SQL'
DO $$
DECLARE
  g1 UUID; g2 UUID; g3 UUID;
  t1a INT; t2a INT; t2b INT; t3b INT;
BEGIN
  INSERT INTO Scheduled_Games (title, scheduled_at, total_tickets, ticket_price, game_status, completed_at)
  VALUES ('LUCKY_SMOKE 1','2026-06-08T18:00:00Z',9000,50,'Completed','2026-06-08T20:00:00Z') RETURNING game_id INTO g1;
  INSERT INTO Scheduled_Games (title, scheduled_at, total_tickets, ticket_price, game_status, completed_at)
  VALUES ('LUCKY_SMOKE 2','2026-06-09T18:00:00Z',9000,50,'Completed','2026-06-09T20:00:00Z') RETURNING game_id INTO g2;
  INSERT INTO Scheduled_Games (title, scheduled_at, total_tickets, ticket_price, game_status, completed_at)
  VALUES ('LUCKY_SMOKE 3','2026-06-10T18:00:00Z',9000,50,'Completed','2026-06-10T20:00:00Z') RETURNING game_id INTO g3;

  INSERT INTO Tickets (game_id, ticket_number, grid_data, status)
  VALUES (g1, 7777, '{"row1":[],"row2":[],"row3":[]}', 'Sold') RETURNING ticket_id INTO t1a;
  INSERT INTO Tickets (game_id, ticket_number, grid_data, status)
  VALUES (g2, 7777, '{"row1":[],"row2":[],"row3":[]}', 'Sold') RETURNING ticket_id INTO t2a;
  INSERT INTO Tickets (game_id, ticket_number, grid_data, status)
  VALUES (g2, 7778, '{"row1":[],"row2":[],"row3":[]}', 'Sold') RETURNING ticket_id INTO t2b;
  INSERT INTO Tickets (game_id, ticket_number, grid_data, status)
  VALUES (g3, 7778, '{"row1":[],"row2":[],"row3":[]}', 'Sold') RETURNING ticket_id INTO t3b;

  -- G1: ticket 7777 sweeps all 6 prizes
  INSERT INTO Prize_Pool (game_id, pattern_name, prize_amount, claimed, winner_ticket_id, claimed_at) VALUES
    (g1,'Early Five',  100, TRUE, t1a, '2026-06-08T19:01:00Z'),
    (g1,'Top Line',    100, TRUE, t1a, '2026-06-08T19:02:00Z'),
    (g1,'Middle Line', 100, TRUE, t1a, '2026-06-08T19:03:00Z'),
    (g1,'Bottom Line', 100, TRUE, t1a, '2026-06-08T19:04:00Z'),
    (g1,'Four Corners',100, TRUE, t1a, '2026-06-08T19:05:00Z'),
    (g1,'Full House',  100, TRUE, t1a, '2026-06-08T19:06:00Z');
  -- G2: 7777 takes 2 more (total 8); 7778 takes 4
  INSERT INTO Prize_Pool (game_id, pattern_name, prize_amount, claimed, winner_ticket_id, claimed_at) VALUES
    (g2,'Early Five',  100, TRUE, t2a, '2026-06-09T19:01:00Z'),
    (g2,'Full House',  100, TRUE, t2a, '2026-06-09T19:06:00Z'),
    (g2,'Top Line',    100, TRUE, t2b, '2026-06-09T19:02:00Z'),
    (g2,'Middle Line', 100, TRUE, t2b, '2026-06-09T19:03:00Z'),
    (g2,'Bottom Line', 100, TRUE, t2b, '2026-06-09T19:04:00Z'),
    (g2,'Four Corners',100, TRUE, t2b, '2026-06-09T19:05:00Z');
END $$;
SQL
```

Expected totals: **7777 → 8 wins, 7778 → 4 wins** ⇒ lucky number 7777. (G3/t3b stay empty until Task 2.)

- [ ] **Step 2: Run the "failing test" — endpoint must 404 before implementation**

Run (with a backend up on port 4000):
```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4000/api/stats/lucky-number
```
Expected: `404`

- [ ] **Step 3: Add constants**

In `HG/backend/src/config/constants.ts`, insert directly above the `// Prize Patterns` line:

```ts
  // Lucky Number (public lobby announcement)
  LUCKY_NUMBER_EPOCH_MS: Date.UTC(2026, 5, 1),   // 2026-06-01T00:00:00Z — fixed cycle anchor
  LUCKY_NUMBER_CYCLE_DAYS: 12,                   // display refresh contract
  LUCKY_NUMBER_SAMPLE_GAMES: 60,                 // most recent completed games per cycle

```

- [ ] **Step 4: Implement the handler**

In `HG/backend/src/modules/stats/stats.controller.ts`, add to the imports:

```ts
import { CONSTANTS } from '../../config/constants';
```

Append after `getHallOfFame`:

```ts
const LUCKY_CYCLE_MS = CONSTANTS.LUCKY_NUMBER_CYCLE_DAYS * 24 * 60 * 60 * 1000;

interface LuckyNumberBody {
  lucky_number: number | null;
  refreshes_at: string;
}

// Pure function of the DB per cycle, so this cache is only an optimization —
// restarts and parallel instances all recompute the identical value.
let luckyMemo: { cycleIndex: number; body: LuckyNumberBody } | null = null;

/**
 * Public Lucky Number — most frequent winning ticket number across the 60
 * games completed most recently before the current 12-day cycle started.
 */
export async function getLuckyNumber(req: Request, res: Response): Promise<void> {
  try {
    const cycleIndex = Math.max(
      0,
      Math.floor((Date.now() - CONSTANTS.LUCKY_NUMBER_EPOCH_MS) / LUCKY_CYCLE_MS)
    );
    if (luckyMemo && luckyMemo.cycleIndex === cycleIndex) {
      res.json(luckyMemo.body);
      return;
    }

    const cycleStartMs = CONSTANTS.LUCKY_NUMBER_EPOCH_MS + cycleIndex * LUCKY_CYCLE_MS;
    const result = await pool.query(
      `SELECT t.ticket_number, p.claimed_at
       FROM (
         SELECT game_id
         FROM Scheduled_Games
         WHERE game_status = 'Completed' AND completed_at < $1
         ORDER BY completed_at DESC
         LIMIT $2
       ) g
       JOIN Prize_Pool p ON p.game_id = g.game_id
                        AND p.claimed = TRUE
                        AND p.winner_ticket_id IS NOT NULL
       JOIN Tickets t    ON t.ticket_id = p.winner_ticket_id`,
      [new Date(cycleStartMs), CONSTANTS.LUCKY_NUMBER_SAMPLE_GAMES]
    );

    const tallies = new Map<number, { count: number; latestWinMs: number }>();
    for (const row of result.rows) {
      const n: number = row.ticket_number;
      const winMs = row.claimed_at ? new Date(row.claimed_at).getTime() : 0;
      const tally = tallies.get(n);
      if (tally) {
        tally.count += 1;
        if (winMs > tally.latestWinMs) tally.latestWinMs = winMs;
      } else {
        tallies.set(n, { count: 1, latestWinMs: winMs });
      }
    }

    // Mode with a total tie-break (count DESC, latest win DESC, lower number)
    // so the result is always exactly one number.
    let luckyNumber: number | null = null;
    let best: { count: number; latestWinMs: number } | null = null;
    for (const [n, tally] of tallies) {
      if (
        luckyNumber === null || best === null ||
        tally.count > best.count ||
        (tally.count === best.count &&
          (tally.latestWinMs > best.latestWinMs ||
            (tally.latestWinMs === best.latestWinMs && n < luckyNumber)))
      ) {
        luckyNumber = n;
        best = tally;
      }
    }

    const body: LuckyNumberBody = {
      lucky_number: luckyNumber,
      refreshes_at: new Date(cycleStartMs + LUCKY_CYCLE_MS).toISOString(),
    };
    luckyMemo = { cycleIndex, body };
    res.json(body);
  } catch (error) {
    console.error('Error fetching lucky number:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
```

- [ ] **Step 5: Register the route (public, like hall-of-fame)**

Replace the full contents of `HG/backend/src/modules/stats/stats.routes.ts` with:

```ts
import { Router } from 'express';
import { getOverview, getHallOfFame, getLuckyNumber } from './stats.controller';
import { authenticateToken, requireRole } from '../../middleware/auth';

const router = Router();

router.get('/overview', authenticateToken, requireRole(['Superadmin', 'Admin']), getOverview);
router.get('/hall-of-fame', getHallOfFame);
router.get('/lucky-number', getLuckyNumber);

export default router;
```

(No `app.ts` change — the stats router is already mounted at `/api/stats`.)

- [ ] **Step 6: Run the test — expect green**

Restart the backend (see memo caveat), then:
```bash
curl -s http://localhost:4000/api/stats/lucky-number
```
Expected (when run 2026-06-13 → 2026-06-24): `{"lucky_number":7777,"refreshes_at":"2026-06-25T00:00:00.000Z"}`

- [ ] **Step 7: Type-check build + commit**

```bash
cd /Users/monk/1/HG/backend && npm run build
cd /Users/monk/1 && git add HG/backend/src/config/constants.ts HG/backend/src/modules/stats/stats.controller.ts HG/backend/src/modules/stats/stats.routes.ts
git commit -m "feat(backend): public lucky-number endpoint — 12-day cycles over last 60 games"
```
Expected: build exits 0; commit created.

---

### Task 2: Backend — tie-break and empty-state smoke phases

**Files:** none modified (verification only; fix-forward in `stats.controller.ts` if a phase fails, then re-commit).

- [ ] **Step 1: Phase 2 — tie broken by recency**

Give 7778 four more wins in G3 with the most recent `claimed_at` (totals become 8 vs 8; 7778's latest win is newer):

```bash
PSQL <<'SQL'
INSERT INTO Prize_Pool (game_id, pattern_name, prize_amount, claimed, winner_ticket_id, claimed_at)
SELECT g.game_id, p.pat, 100, TRUE, t.ticket_id, p.at::timestamptz
FROM Scheduled_Games g
JOIN Tickets t ON t.game_id = g.game_id AND t.ticket_number = 7778
CROSS JOIN (VALUES
  ('Early Five','2026-06-12T19:01:00Z'),
  ('Top Line','2026-06-12T19:02:00Z'),
  ('Middle Line','2026-06-12T19:03:00Z'),
  ('Full House','2026-06-12T19:06:00Z')
) AS p(pat, at)
WHERE g.title = 'LUCKY_SMOKE 3';
SQL
```

Restart backend, then `curl -s http://localhost:4000/api/stats/lucky-number`.
Expected: `{"lucky_number":7778,...}` (8 = 8, recency wins).

- [ ] **Step 2: Phase 3 — full tie falls back to lower number**

```bash
PSQL -c "UPDATE Prize_Pool SET claimed_at='2026-06-10T12:00:00Z' WHERE game_id IN (SELECT game_id FROM Scheduled_Games WHERE title LIKE 'LUCKY_SMOKE%');"
```

Restart backend, then `curl -s http://localhost:4000/api/stats/lucky-number`.
Expected: `{"lucky_number":7777,...}` (8 = 8, identical latest win ⇒ lower ticket number).

- [ ] **Step 3: Phase 4 — cleanup and empty/baseline state**

```bash
PSQL -c "SELECT t.ticket_number, COUNT(*) FROM Scheduled_Games g JOIN Prize_Pool p ON p.game_id=g.game_id AND p.claimed=TRUE AND p.winner_ticket_id IS NOT NULL JOIN Tickets t ON t.ticket_id=p.winner_ticket_id WHERE g.game_status='Completed' AND g.title NOT LIKE 'LUCKY_SMOKE%' GROUP BY 1 ORDER BY 2 DESC;"
PSQL -c "DELETE FROM Scheduled_Games WHERE title LIKE 'LUCKY_SMOKE%';"
```
(The delete cascades to the fixture Tickets and Prize_Pool rows.)

Restart backend, then `curl -s http://localhost:4000/api/stats/lucky-number`.
Expected: if the first query returned no rows → `{"lucky_number":null,...}`; otherwise the top organic ticket_number from that query. Either confirms the sparse/empty path.

---

### Task 3: Frontend — type, lobby card, CSS

**Files:**
- Modify: `HG/frontend/src/lib/types.ts` (append after `OverviewStats`, ~line 83)
- Modify: `HG/frontend/src/app/page.tsx`
- Modify: `HG/frontend/src/app/globals.css` (two anchored insertions)

- [ ] **Step 1: Re-apply the Phase-1 fixture** (visual check needs data; 7777 also exercises the wide-ball variant):

```bash
PSQL <<'SQL'
DO $$
DECLARE
  g1 UUID; g2 UUID; g3 UUID;
  t1a INT; t2a INT; t2b INT; t3b INT;
BEGIN
  INSERT INTO Scheduled_Games (title, scheduled_at, total_tickets, ticket_price, game_status, completed_at)
  VALUES ('LUCKY_SMOKE 1','2026-06-08T18:00:00Z',9000,50,'Completed','2026-06-08T20:00:00Z') RETURNING game_id INTO g1;
  INSERT INTO Scheduled_Games (title, scheduled_at, total_tickets, ticket_price, game_status, completed_at)
  VALUES ('LUCKY_SMOKE 2','2026-06-09T18:00:00Z',9000,50,'Completed','2026-06-09T20:00:00Z') RETURNING game_id INTO g2;
  INSERT INTO Scheduled_Games (title, scheduled_at, total_tickets, ticket_price, game_status, completed_at)
  VALUES ('LUCKY_SMOKE 3','2026-06-10T18:00:00Z',9000,50,'Completed','2026-06-10T20:00:00Z') RETURNING game_id INTO g3;

  INSERT INTO Tickets (game_id, ticket_number, grid_data, status)
  VALUES (g1, 7777, '{"row1":[],"row2":[],"row3":[]}', 'Sold') RETURNING ticket_id INTO t1a;
  INSERT INTO Tickets (game_id, ticket_number, grid_data, status)
  VALUES (g2, 7777, '{"row1":[],"row2":[],"row3":[]}', 'Sold') RETURNING ticket_id INTO t2a;
  INSERT INTO Tickets (game_id, ticket_number, grid_data, status)
  VALUES (g2, 7778, '{"row1":[],"row2":[],"row3":[]}', 'Sold') RETURNING ticket_id INTO t2b;
  INSERT INTO Tickets (game_id, ticket_number, grid_data, status)
  VALUES (g3, 7778, '{"row1":[],"row2":[],"row3":[]}', 'Sold') RETURNING ticket_id INTO t3b;

  -- G1: ticket 7777 sweeps all 6 prizes
  INSERT INTO Prize_Pool (game_id, pattern_name, prize_amount, claimed, winner_ticket_id, claimed_at) VALUES
    (g1,'Early Five',  100, TRUE, t1a, '2026-06-08T19:01:00Z'),
    (g1,'Top Line',    100, TRUE, t1a, '2026-06-08T19:02:00Z'),
    (g1,'Middle Line', 100, TRUE, t1a, '2026-06-08T19:03:00Z'),
    (g1,'Bottom Line', 100, TRUE, t1a, '2026-06-08T19:04:00Z'),
    (g1,'Four Corners',100, TRUE, t1a, '2026-06-08T19:05:00Z'),
    (g1,'Full House',  100, TRUE, t1a, '2026-06-08T19:06:00Z');
  -- G2: 7777 takes 2 more (total 8); 7778 takes 4
  INSERT INTO Prize_Pool (game_id, pattern_name, prize_amount, claimed, winner_ticket_id, claimed_at) VALUES
    (g2,'Early Five',  100, TRUE, t2a, '2026-06-09T19:01:00Z'),
    (g2,'Full House',  100, TRUE, t2a, '2026-06-09T19:06:00Z'),
    (g2,'Top Line',    100, TRUE, t2b, '2026-06-09T19:02:00Z'),
    (g2,'Middle Line', 100, TRUE, t2b, '2026-06-09T19:03:00Z'),
    (g2,'Bottom Line', 100, TRUE, t2b, '2026-06-09T19:04:00Z'),
    (g2,'Four Corners',100, TRUE, t2b, '2026-06-09T19:05:00Z');
END $$;
SQL
```

Restart the backend, then confirm `curl -s http://localhost:4000/api/stats/lucky-number` → `lucky_number: 7777`.

- [ ] **Step 2: Add the response type**

In `HG/frontend/src/lib/types.ts`, after the `OverviewStats` interface:

```ts
export interface LuckyNumberResponse {
  lucky_number: number | null;
  refreshes_at: string;
}
```

- [ ] **Step 3: Wire the lobby**

In `HG/frontend/src/app/page.tsx`:

a. Extend the type import (line 12):
```ts
import type { GameSummary, LuckyNumberResponse } from "@/lib/types";
```

b. Below `formatWhen` (module level), add:
```ts
function refreshCopy(refreshesAt: string): string {
  const daysLeft = Math.ceil((new Date(refreshesAt).getTime() - Date.now()) / 86_400_000);
  if (daysLeft > 1) return `fresh number in ${daysLeft} days`;
  if (daysLeft === 1) return "fresh number tomorrow";
  return "refreshes today";
}
```

c. After `const [error, setError] = useState<string | null>(null);`:
```ts
const [lucky, setLucky] = useState<LuckyNumberResponse | null>(null);
```

d. After the games-poll `useEffect` (the one with `setInterval(load, 15000)`), add a one-shot fetch — async callback setState, same pattern as the games load (React Compiler lint-safe), errors swallowed because failure simply hides the card:
```ts
useEffect(() => {
  let alive = true;
  apiFetch<LuckyNumberResponse>("/api/stats/lucky-number")
    .then((l) => { if (alive) setLucky(l); })
    .catch(() => {});
  return () => { alive = false; };
}, []);
```

e. Directly inside `<div className="hg-lobby-v2" ref={lobbyRef}>`, **above** the `{error && …}` line (first section after the banner; renders only with data — null/pending/error leave the page exactly as today):
```tsx
{lucky && lucky.lucky_number !== null && (
  <section
    className="hg-lucky"
    aria-label={`Lucky number ${lucky.lucky_number}, ${refreshCopy(lucky.refreshes_at)}`}
  >
    <div className={`hg-lucky-ball${String(lucky.lucky_number).length > 2 ? " is-wide" : ""}`}>
      {lucky.lucky_number}
    </div>
    <div className="hg-lucky-meta">
      <h2 className="hg-lucky-title">Lucky Number</h2>
      <span className="hg-lucky-refresh">{refreshCopy(lucky.refreshes_at)}</span>
    </div>
  </section>
)}
```

- [ ] **Step 4: Styles**

In `HG/frontend/src/app/globals.css`, insert above the `/* ============ HERO ============ */` line (~203) — ball mirrors `.hg-cage-num`, card mirrors `.hg-hero-card`, shadow is the system's sticker offset:

```css
/* ============ LUCKY NUMBER ============ */
.hg-lucky{display:flex;align-items:center;gap:16px;padding:16px 18px;
  background:var(--surface);border:1.5px solid var(--card-line);
  box-shadow:var(--card-shadow);border-radius:var(--radius-lg)}
.hg-lucky-ball{width:74px;height:74px;flex:none;border-radius:50%;display:grid;place-items:center;
  font-family:var(--font-mono);font-weight:700;font-size:30px;color:var(--accent-ink);
  background:radial-gradient(circle at 35% 30%, color-mix(in srgb,var(--accent) 70%,#fff), var(--accent));
  border:2px solid var(--ink);box-shadow:0 5px 0 -1px var(--ink)}
.hg-lucky-ball.is-wide{font-size:22px}
.hg-lucky-title{font-family:var(--font-head);font-size:18px;font-weight:700;margin:0;line-height:1.1}
.hg-lucky-refresh{display:block;margin-top:3px;font-size:11.5px;color:var(--text-dim);font-weight:600}
```

Then in the desktop media block, directly after the rule
`.hg-lobby-v2{max-width:1180px;width:100%;margin:0 auto;gap:34px;padding:44px 40px 0;scroll-margin-top:82px}` (~line 917), add:

```css
  .hg-lucky{padding:22px 26px;gap:22px}
  .hg-lucky-ball{width:92px;height:92px;font-size:38px}
  .hg-lucky-ball.is-wide{font-size:27px}
  .hg-lucky-title{font-size:22px}
  .hg-lucky-refresh{font-size:12.5px}
```

- [ ] **Step 5: Lint + build**

```bash
cd /Users/monk/1/HG/frontend && npm run lint && npm run build
```
Expected: both exit 0 (React Compiler rules pass — no setState in effect body, no ref writes in render).

- [ ] **Step 6: Visual smoke**

With backend + `npm run dev` frontend running and the fixture applied, load `http://localhost:3000`: scrolling past the banner shows the Lucky Number card (ball "7777" in wide variant, "Lucky Number" headline, "fresh number in N days"). If available, use the `run` skill to launch and screenshot instead of checking by hand. Then stop the backend and reload — the card must disappear and the lobby otherwise render normally.

- [ ] **Step 7: Cleanup fixture + commit**

```bash
PSQL -c "DELETE FROM Scheduled_Games WHERE title LIKE 'LUCKY_SMOKE%';"
cd /Users/monk/1 && git add HG/frontend/src/lib/types.ts HG/frontend/src/app/page.tsx HG/frontend/src/app/globals.css
git commit -m "feat(frontend): lucky-number announcement card below the lobby banner"
```

---

### Task 4: Docs

**Files:**
- Modify: `/Users/monk/1/CLAUDE.md`

- [ ] **Step 1: Record the feature**

In the **Authentication & RBAC** section, change the sentence
`/api/stats/hall-of-fame is public.` to `/api/stats/hall-of-fame and /api/stats/lucky-number are public.`

In **Current State → Done and verified end-to-end**, add the bullet:
`- Lucky Number announcement: public /api/stats/lucky-number (12-day cycles, mode of winning ticket numbers over last 60 completed games, memoized per cycle) + lobby card below the banner (hidden when null)`

- [ ] **Step 2: Commit**

```bash
cd /Users/monk/1 && git add CLAUDE.md && git commit -m "docs: record lucky-number endpoint + lobby card in CLAUDE.md"
```
