# Housie Ghar: Website Base Architectural Blueprint

This master blueprint maps the functional components, interface layouts, and communication APIs of the legacy site to the new, decoupled **Next.js**, **Node.js/Express**, and **PostgreSQL** architecture.

---

## 1. System Migration Blueprint (Legacy to Modern)

The legacy PHP codebase relied on continuous client AJAX polling to synchronize database variables. The new architecture transitions to state-hydration on page load and Server-Sent Events (SSE) for one-way gameplay streams, reducing server overhead.

```
LEGACY SYSTEM (AJAX Polling / PHP / HTML)
┌──────────────────────┐      Poll (5s)     ┌──────────────────────┐
│  old_HG_homepage.html├───────────────────>│ getBookingStatistic  │
│                      ├───────────────────>│ getGameStatus (3s)   │
│                      ├───────────────────>│ getChat (5s)         │
└──────────────────────┘                    └──────────────────────┘

NEW SYSTEM (Next.js / SSE / Redis / PostgreSQL)
┌──────────────────────┐    Page Load Sync  ┌──────────────────────┐
│    Next.js Client    ├───────────────────>│ GET /api/games/sync  │
│   (Wake Lock / SSE)  │<───────────────────┤ SSE Stream (Draws)   │
│                      │     Real-time      │                      │
└──────────────────────┘                    └──────────────────────┘
```

---

## 2. API Endpoints Migration Map

| Legacy PHP Endpoint | HTTP Method | New REST / SSE Endpoint | Access Role | Core Migration Logic & Enhancements |
| :--- | :---: | :--- | :---: | :--- |
| `Ui/userUi/php/getBookingStatistic.php` | `GET` | `GET /api/analytics/booking` | Staff | Returns live booking counts from Redis cache instead of running heavy SQL counts. |
| `api/gameApi/getGameStatus.php` | `GET` | `GET /api/games/active` | Player | Hydrates general metadata on page load. Active gameplay draws shift from polling this file to the SSE stream. |
| `Ui/userUi/php/getAvailableTicket.php` | `GET` | `GET /api/games/[id]/available` | Player | Serves a JSON array of available ticket IDs (e.g. `[1, 2, 4, ...]`) instead of sending raw HTML fragments. |
| `Ui/userUi/php/searchAllTicket.php` | `GET` | `GET /api/games/[id]/tickets` | Player | Serves structured 3x9 ticket matrices as JSON for dynamic client-side rendering. Eliminates base64-encoded HTML template variables. |
| `Ui/userUi/php/getAgentList.php` | `GET` | `GET /api/agents/active` | Player | Populates name and contact details for active Agents. |
| `api/chatApi/getChat.php` | `GET` | `GET /api/chat/messages` | Player | Fetches the recent messages on lobby entry. |
| `api/chatApi/chatSend.php` | `GET` | `POST /api/chat/send` | Player | Posts message strings, running a backend profanity regex pattern matching. |
| `Ui/userUi/php/getAnnouncement.php` | `GET` | *None (Pushed over SSE)* | Player | Text announcements are pushed as events down the live SSE channel, triggering overlay alerts. |
| *None (Legacy Audio Scripts)* | `GET` | `GET /api/stream/game/[id]` | Player | Server-Sent Events channel streaming game draw numbers and winner events. |
| *None (Legacy manual balance)* | `GET` | `POST /api/wallet/recharge` | Bookie | Triggers secure P2P top-up workflows to Admin/CFO. |

---

## 3. Next.js App Directory Tree Layout

```
src/
├── app/
│   ├── layout.tsx                 # Global HTML & Body styles (Dark Mode default)
│   ├── page.tsx                   # Player Onboarding & Public Lobby (Landing Page)
│   ├── game/
│   │   └── [game_id]/
│   │       ├── page.tsx           # Ticket Grid selection page
│   │       └── play/
│   │           └── page.tsx       # Live Draw Board (Wake Lock, SSE)
│   └── staff/
│       ├── login/
│       │   └── page.tsx           # Authenticated Staff Portal entry
│       ├── cfo/
│       │   └── page.tsx           # CFO Dashboard (Wallet & Ledgers)
│       ├── operator/
│       │   └── page.tsx           # Operator Console (Draw Controller)
│       └── bookie/
│           └── page.tsx           # Bookie Workspace (Queue & Receipts)
├── components/
│   ├── common/
│   │   ├── Navigation.tsx
│   │   └── Footer.tsx             # Powered by MOD banner
│   ├── game/
│   │   ├── TicketGrid.tsx
│   │   ├── ActiveCage.tsx         # 3D Golden Tambola cage
│   │   └── WinExplosion.tsx       # Celebratory SVG overlay
│   └── chat/
│       └── LiveChat.tsx           # Live chat and emojis reaction stream
└── lib/
    ├── sse.ts                     # SSE wrapper & hydration re-sync
    └── db.ts                      # PostgreSQL connector & locking queries
```

---

## 4. Component Architecture

### A. Player Frontend Components (`/src/components/player/`)
1.  **`Navigation.tsx`:** Sticky header containing the circular spinning logo badge, navigation links, and the Staff login icon on the far right.
2.  **`HeroTimer.tsx`:** Reads the scheduled game date/time and runs a React `useEffect` countdown hook, displaying hours, minutes, and seconds. Runs dynamic urgency overlays.
3.  **`TicketSelectionGrid.tsx`:** Renders a grid of ticket numbers. Selecting a slot renders a nested 3x9 monospaced CSS matrix representing the actual ticket sheets.
4.  **`CheckoutDrawer.tsx`:** A sticky slide-up footer containing the nickname input (profanity-filtered), price summary calculations, and the "Book Now" CTA routing to the soft-lock modal.
5.  **`LiveGameDashboard.tsx`:** The live execution interface. Requests the Screen Wake Lock API, listens to SSE updates, plays voice audio tracks with a 1200ms tease delay, auto-marks matching numbers, and floats emoji reactions up the screen.

### B. Staff Management Components (`/src/components/staff/`)
1.  **`StaffLoginModal.tsx`:** Provides access to authenticated portals, checking HttpOnly cookies for JWT variables.
2.  **`CFOPanel.tsx`:** The CFO ledger console. Employs a split-screen queue showing top-up requests on the left and bookie balance sheets on the right.
3.  **`OperatorConsole.tsx`:** Draw host panel. Configures call settings and speed sliders (5s to 12s) pushing interval changes directly to the active Conductor.
4.  **`BookieQueue.tsx`:** The booking processor. Lists current 10-minute player reservation cards and deductions logs.

---

## 5. Legitimate Core Code Porting Examples

### A. Porting: Legacy Countdown Timer to React Component
*   **Legacy Code (`old_HG_homepage.html:L642-679`):** Relied on global intervals and manual `innerHTML` queries targeting separate hBtn, mBtn, and sBtn button nodes.
*   **React Hook Port (`/src/components/player/HeroTimer.tsx`):**
```tsx
import React, { useState, useEffect } from "react";

interface HeroTimerProps {
  targetTime: string; // ISO string format
}

export const HeroTimer: React.FC<HeroTimerProps> = ({ targetTime }) => {
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const calculateTime = () => {
      const difference = +new Date(targetTime) - +new Date();
      if (difference <= 0) {
        return { hours: 0, minutes: 0, seconds: 0 };
      }
      return {
        hours: Math.floor(difference / (1000 * 60 * 60)),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60),
      };
    };

    const timer = setInterval(() => {
      setTimeLeft(calculateTime());
    }, 1000);

    return () => clearInterval(timer);
  }, [targetTime]);

  const pad = (num: number) => String(num).padStart(2, "0");

  return (
    <div className="flex gap-4 justify-center py-6">
      <div className="flex flex-col items-center">
        <span className="text-4xl font-mono text-cyan-400">{pad(timeLeft.hours)}</span>
        <span className="text-xs uppercase text-gray-500">Hours</span>
      </div>
      <span className="text-4xl text-gray-500">:</span>
      <div className="flex flex-col items-center">
        <span className="text-4xl font-mono text-cyan-400">{pad(timeLeft.minutes)}</span>
        <span className="text-xs uppercase text-gray-500">Minutes</span>
      </div>
      <span className="text-4xl text-gray-500">:</span>
      <div className="flex flex-col items-center">
        <span className="text-4xl font-mono text-cyan-400">{pad(timeLeft.seconds)}</span>
        <span className="text-xs uppercase text-gray-500">Seconds</span>
      </div>
    </div>
  );
};
```

### B. Porting: Legacy Booking Submit to ACID PostgreSQL Transaction
*   **Legacy Code (`old_HG_homepage.html:L507-518`):** Direct front-end window redirect to WhatsApp without validating inventory or securing the ticket ID in the database first.
*   **API Node.js Router Port (`/src/app/api/booking/lock-ticket/route.ts`):**
```typescript
import { NextRequest, NextResponse } from "next/server";
import { pgPool } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { game_id, ticket_ids, player_housie_name } = await req.json();
  const client = await pgPool.connect();

  try {
    await client.query("BEGIN");

    // 1. Pessimistic Lock on matching ticket rows
    const lockQuery = `
      SELECT ticket_id, status 
      FROM Tickets 
      WHERE game_id = $1 AND ticket_id = ANY($2::uuid[]) 
      FOR UPDATE
    `;
    const checkTickets = await client.query(lockQuery, [game_id, ticket_ids]);

    // 2. Validate availability
    const isAnyUnavailable = checkTickets.rows.some(t => t.status !== "Available");
    if (isAnyUnavailable) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "One or more tickets already locked or sold." }, { status: 409 });
    }

    // 3. Round-Robin Bookie Balance Check & Allocation
    // Note: Bookie selection query is executed here...
    const assignedBookieId = "some-active-bookie-uuid"; 

    // 4. Execute locking updates
    const updateQuery = `
      UPDATE Tickets 
      SET status = 'Locked', 
          player_housie_name = $1, 
          locked_until = NOW() + INTERVAL '10 minutes',
          assigned_bookie_id = $2
      WHERE game_id = $3 AND ticket_id = ANY($4::uuid[])
    `;
    await client.query(updateQuery, [player_housie_name, assignedBookieId, game_id, ticket_ids]);

    await client.query("COMMIT");

    // 5. Generate and return redirect details
    const booking_id = `BK-${Date.now()}`;
    const whatsappUrl = `https://wa.me/919046682303?text=Hi!+Booking+ID:+${booking_id}`;

    return NextResponse.json({
      success: true,
      booking_id,
      whatsappUrl,
      locked_until: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Booking transaction failed:", error);
    return NextResponse.json({ error: "Internal server error during booking" }, { status: 500 });
  } finally {
    client.release();
  }
}
```
