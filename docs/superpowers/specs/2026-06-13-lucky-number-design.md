# Lucky Number Announcement — Design

**Date:** 2026-06-13
**Status:** Approved (brainstormed with user; user delegated efficiency/robustness trade-offs)
**Branch:** frontend-v2-housieghar

## Overview

A public "Lucky Number" spotlight card on the lobby, directly below the full-screen banner. The number is the most frequently *winning ticket number* across the last 60 completed games, and it refreshes on a fixed 12-day cycle.

Decisions made during brainstorming:

1. **"Winner number" = ticket number** — the `ticket_number` of a winning ticket (its index in the game's book), *not* a drawn ball (1–90) and *not* tied to the draw at all.
2. **All claimed prizes count** — each completed game contributes the winning ticket number of *every* claimed prize (Early Five, Top/Middle/Bottom Line, Four Corners, Full House — up to 6 data points per game).
3. **"Every 60 games" is the sample size; "every 12 days" is the refresh contract** — fixed 12-day cycles; each cycle uses the 60 games completed most recently before the cycle started.
4. **Display is the spotlight card with no win-count copy** — ball + headline + refresh countdown only.

## Goals

- Show one lucky number below the lobby banner, stable for 12 days at a time.
- Zero operational burden: no new table, no migration, no cron job.
- Deterministic: every process/instance computes the identical number for a given cycle, including after restarts ("works all the time").
- Graceful when data is sparse: with fewer than 60 completed games use what exists; with zero data points the card simply does not render.

## Non-goals

- No history of past lucky numbers (no storage).
- No staff/admin UI.
- No highlighting of the lucky ticket inside game rooms (possible future follow-up).
- No win-count / sample-size copy in the UI (explicitly excluded by user).

## Backend

### Endpoint

`GET /api/stats/lucky-number` — **public** (no auth), added to the existing stats module beside the public `/api/stats/hall-of-fame`.

Response `200`:

```json
{ "lucky_number": 23, "refreshes_at": "2026-06-25T00:00:00.000Z" }
```

`lucky_number` is `null` when there are zero data points. Errors follow the stats module's existing pattern (try/catch → `500 { "error": ... }`).

### Constants (`config/constants.ts`)

```ts
LUCKY_NUMBER_EPOCH_MS   // Date.UTC(2026, 5, 1) — fixed cycle anchor, 2026-06-01T00:00:00Z
LUCKY_NUMBER_CYCLE_DAYS = 12
LUCKY_NUMBER_SAMPLE_GAMES = 60
```

### Algorithm

1. `cycleIndex = max(0, floor((now - EPOCH_MS) / CYCLE_MS))` where `CYCLE_MS = 12 * 24 * 60 * 60 * 1000`.
2. `cycleStart = EPOCH_MS + cycleIndex * CYCLE_MS`; `refreshes_at = cycleStart + CYCLE_MS`.
3. Sample window **pinned to `cycleStart`**: the 60 games with `game_status = 'Completed'` and `completed_at < cycleStart`, ordered by `completed_at DESC`. Pinning means games completing mid-cycle never change the current number — it changes only at the boundary.
4. Data points — one row per claimed prize in those games:

```sql
SELECT t.ticket_number, p.claimed_at
FROM (
  SELECT game_id
  FROM Scheduled_Games
  WHERE game_status = 'Completed' AND completed_at < $1
  ORDER BY completed_at DESC
  LIMIT 60
) g
JOIN Prize_Pool p ON p.game_id = g.game_id
                 AND p.claimed = TRUE
                 AND p.winner_ticket_id IS NOT NULL
JOIN Tickets t    ON t.ticket_id = p.winner_ticket_id
```

5. **Mode with total tie-break** (computed in TypeScript — at most ~360 rows):
   - Count occurrences per `ticket_number`; track each number's latest `claimed_at`.
   - Order by: count DESC, latest `claimed_at` DESC, `ticket_number` ASC. The first row is the lucky number — the ordering is total, so the result is always exactly one number.
   - Zero rows → `lucky_number: null`.

6. **Memoization:** module-level cache `{ cycleIndex, response }`; recompute only when the requested cycleIndex differs (first hit after a boundary or after a process restart). The computation is a pure function of the database, so the cache is merely an optimization — correctness never depends on it.

### Data caveats (accepted)

- On split wins, `Prize_Pool.winner_ticket_id` stores only the first winner's ticket; that ticket is the one counted.
- Completed games with no claimed prizes (e.g., zero sold tickets) contribute nothing — the JOIN drops them naturally.

## Frontend

### Placement & data

- Lobby (`app/page.tsx`): one-shot `apiFetch<LuckyNumberResponse>("/api/stats/lucky-number")` on mount — **no polling** (the value changes every 12 days; the existing 15 s games poll is untouched).
- Rendered as the **first section inside `hg-lobby-v2`**, so it is the first thing revealed when scrolling past the full-screen `hg-banner`.
- `lib/types.ts`: `interface LuckyNumberResponse { lucky_number: number | null; refreshes_at: string }`.

### Card content (and nothing else)

- A big housie-ball-styled number: JetBrains Mono (`--font-mono`), chunky border, hard offset shadow, consistent with the live board's number styling.
- Headline **"Lucky Number"** in Space Grotesk (`--font-head`).
- A refresh line derived from `refreshes_at`, computed once at render (day granularity, no ticking):
  - `daysLeft = ceil((refreshes_at - now) / 86_400_000)`
  - `> 1` → "fresh number in N days" · `== 1` → "fresh number tomorrow" · `<= 0` → "refreshes today"
- **No win-count or sample-size copy** (user decision).
- Accessible label on the section, e.g. `aria-label="Lucky number 23, fresh number in 5 days"`.

### States

- `lucky_number === null`, fetch pending, or fetch error → the section is not rendered at all; the lobby looks exactly as it does today.
- Ticket numbers may exceed two digits (books can be large): the ball's font size must accommodate 3–4 digits (CSS `clamp()` or a length-based modifier class).

### Styling

New `hg-lucky-*` classes in `globals.css`, following the existing conventions: light-theme custom properties, sticker aesthetic (hard offset shadow `0 5px 0 -1px var(--ink)`, 18 px radius family, accent `var(--accent)`), and a tablet/desktop adjustment in the existing `@media` block where `hg-banner` is tuned (~880 px).

## Edge cases

| Case | Behavior |
| --- | --- |
| 0 completed games / 0 claimed prizes before cycleStart | `lucky_number: null` → card hidden |
| < 60 completed games | All available games used |
| Tie in frequency | Most recent `claimed_at` wins, then lower ticket number — always one number |
| Process restart / multiple instances | Same deterministic result recomputed; no coordination needed |
| Server clock before epoch (misconfiguration) | `cycleIndex` clamped to 0 |
| Client clock skew | Only affects countdown copy wording, never the number |

## Verification

The repo has no test framework; per project convention, verification is smoke testing against the seeded DB:

1. SQL fixtures: mark a handful of games `Completed` with claimed `Prize_Pool` rows pointing at known tickets (covering: clear mode, tie broken by recency, tie broken by lower number, zero-data).
2. `curl /api/stats/lucky-number` and assert the expected number / `null` for each fixture state.
3. `npm run lint` and `npm run build` in `HG/frontend`; `npm run build` in `HG/backend`.
4. Manual lobby check: card renders below the banner with data; page is unchanged when the endpoint returns `null` or fails.
