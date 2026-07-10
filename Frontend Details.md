# Housie Ghar: Frontend Details & User Interface Workflows

This document details the frontend visual layouts, view states, screen components, and interactive workflows for **Housie Ghar**. It covers the onboarding process, player screens, and the staff control panels.

---

## 1. Player Onboarding & Lobby Screens

### A. Sign-Up & Login Onboarding Pages
*   **Branding Integration:** A dark overlay backdrop (`#0B0B0C`) features the **Housie Ghar Secondary Logo** (`HG Logos/HG Secondary.png`) prominently centered at the top.
*   **Sign-Up Form (First-Time User):**
    *   **Full Name Input:** Text box for real-name validation.
    *   **Housie Name Input:** Unique alias (3–20 alphanumeric characters) that acts as both the player's username and authentication password.
    *   **Action Button:** A gold button labeled "REGISTER & ENTER" styled with a comic drop shadow.
*   **Login Form (Returning User):**
    *   **Housie Name Input:** Enter the registered alias. Bypasses the full name field.
    *   **Validation:** Queries the backend database. On success, sets a secure browser cookie and redirects to the Lobby.
*   **Staff Login Entrance:** A glowing neon key icon (`#06B6D4`) in the upper-right corner of both screens redirects users to the secure **Staff Login Page**.

### B. Public Lobby Screen
*   **Hero Banner Countdown:** A prominent banner displaying the immediate upcoming game. Uses a React countdown timer highlighting `Hours : Minutes : Seconds` in Electric Cyan monospaced typography.
*   **Scrollable Game Card Feed:** Displays a list of scheduled games. Each card shows:
    *   Game title, date/time, ticket price (e.g., `₹100`), and active prize list.
    *   **Dynamic Progress Bar:** Visual filling calculation:
        $$\text{Fill \%} = \frac{\text{Tickets Booked} + \text{Locked}}{\text{Total Capacity}} \times 100$$
    *   **"Fast Filling!" Alert:** If capacity reaches 80%, the card borders pulse in Neon Pink and a gold comic badge labeled "Fast Filling!" overlays the card.
    *   **"Sold Out" State:** If capacity hits 100%, a grayscale mask overlays the card, reducing opacity to `0.5`, and a bold, diagonal "SOLD OUT" badge appears across the card.

---

## 2. Interactive Game Room & Conductor View

```
 ┌──────────────────────────────────────────────────────────────────┐
 │                         STAY WAKE ON                             │ (Wake Lock active)
 ├──────────────────────────────────────────────────────────────────┤
 │     [ 3D Gold Cage ]   ──(0.6s Spin)──>   [ POP BALL: 42 ]       │
 │                                                  │               │
 │    Called Tray: (14) (28) (36) [42]              ▼ (1.2s delay)  │
 ├──────────────────────────────────────────────────────────────────┤
 │  [ TICKET MATRIX (Auto-marked) ]                                 │
 │  [ ] [02] [ ] [07] [15] [ ]  [23] [ ]  [30]                      │
 │  [38] [ ] [42] [ ] [51] [57] [ ]  [64] [ ]  ◄── (Green Ink hit   │
 │  [71] [ ] [ ] [ ]  [78] [82] [86] [ ]  [90]      and ✕ mark)     │
 ├──────────────────────────────────────────────────────────────────┤
 │  🏆 Winner Stream: Star claimed by Darjeeling_King (₹1,500)      │
 ├──────────────────────────────────────────────────────────────────┤
 │  🔥 👏 🤩  ◄── [ Emoji Buttons ]  (Floats up screen)             │
 └──────────────────────────────────────────────────────────────────┘
```

### A. Ticket Selection Grid
*   **Roster View:** Displays available ticket numbers (e.g., 1–500).
*   **Grid Rendering:** Tapping a ticket slot opens the corresponding 3x9 grid matrix below it.
*   **Visual Indicators:**
    *   *Available:* Dark slate box with a hover glow.
    *   *Locked:* Amber background with a lock icon and spinning loader.
    *   *Sold:* Muted gray background, strikethrough text, unclickable.

### B. Selected Ticket Checkout Drawer
*   Appears when a player selects one or more available tickets.
*   Contains a nickname field running a backend profanity check.
*   Displays the total price (e.g., `3 Tickets × ₹100 = ₹300`) and a gold "BOOK NOW" button.
*   Redirects to a non-dismissible modal displaying a `10:00` countdown timer and the WhatsApp redirect instructions.

### C. Live Game Conductor Room
*   **Screen Wake Lock API:** Prevents mobile devices from dimming or sleeping during live gameplay.
*   **3D Gold Tambola Cage:** A digital wireframe cage spins rapidly for 0.6s when a draw is triggered.
*   **Audio-Visual Tease Sync:** Instantly plays local voiceovers for called numbers (e.g., *"Balle Balle! Number 42..."*), pausing the visual pop-out on the grid for **1200ms** to build suspense.
*   **Live Active Ticket Hit:** Displays an animated green glow ink hit and a pink "✕" mark overlay on matching numbers.
*   **Mute Toggle & Accessibility:** Features an audio mute icon. For accessibility, locked tickets display lock symbols, and sold tickets have strikethrough styling.
*   **Emoji Reactions:** A bottom tray lets players trigger emojis (🔥, 👏, 🎉, 🤩) that float up the screen in a sine-wave path.

---

## 3. Staff Dashboards & Interfaces

### A. Superadmin Control Center (Level 1)
*   **User Manager:** Form to create, suspend, or update users. Restricts Superadmins from self-suspension.
*   **Platform Config Editor:** Tuning controls for lock durations, rate limits, spam thresholds, and prize caps.
*   **Theme Manager:** Activates and broadcasts visual presets (Default, Dark, Festive, Classic Hall) across the platform.
*   **Audit Logger View:** Non-deletable tabular log displaying timestamps, actors, actions, targets, and IP addresses.

### B. Admin Dashboard (Level 2)
*   **Game Builder Form:** Setup for title, date/time, total tickets, operator assignment, and selectable prize pools. Enforces the 80% maximum prize pool cap.
*   **Wallet Overview:** Real-time balances and top-up approval queues.
*   **Auditing Feed:** Metrics for ticket fill percentages, active connection counts, and post-game reports.

### C. Finance Officer / CFO Panel (Level 2.1)
*   **Split-Screen Interface:**
    *   *Left Side:* Pending wallet recharge requests from agents.
    *   *Right Side:* Agent performance ledgers, balance sheets, and transaction logs.
*   **Credit Engine:** Approve or reject digital credits following physical payment verification.
*   **Balance Alerts:** Displays red warnings for agent balances below ₹500.

### D. Operator Console (Level 3)
*   **Draw HUD:** Large display of the current called number and a full 90-number grid showing called versus remaining numbers.
*   **Control Panel:** "Start Game", "Pause Conductor", and "Resume Conductor" triggers.
*   **Speed Slider:** Adjusts call intervals between 5 seconds (fast) and 12 seconds (slow) in real time.
*   **Live Text Banner:** A text input box to broadcast emergency announcements directly to player screens.
*   **Overflow Queue:** Force-confirm tickets when agents are underfunded.

### E. Bookie / Agent Workspace (Level 4)
*   **Fulfillment Queue:** Real-time list of 10-minute player booking requests.
*   **Action Hub:** "Confirm" (debits wallet and books tickets) or "Reject" (releases tickets).
*   **One-Click Follow-up:** Copies pre-formatted WhatsApp reminders to nudge players before booking timers expire.
*   **Wallet Indicator:** Tracks current balance and includes a "Request Top-up" shortcut.

### F. Promoter Console (Affiliate Tier)
*   **Referral Link Generator:** Creates custom links (e.g., `?ref=promoterID`).
*   **Affiliate HUD:** Tracks referred user registrations, ticket sales volumes, and pending commissions.
*   **Commissions Ledger:** Displays historical referral earnings (e.g., 2% per ticket purchase).
*   **Asset Hub:** Download templates for promotional graphics and status updates.
