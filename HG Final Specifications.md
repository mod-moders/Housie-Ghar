# Housie Ghar: Final System Specifications

This document outlines the final system specifications, functional requirements, and platform architecture for **Housie Ghar**, a real-time, high-concurrency online Tambola (Housie) platform. This document serves as the master functional specification for the project, incorporating custom player onboarding flows, a pre-funded agent transaction framework, and real-time automated draw conductor rules.

---

## 1. Project Background & Core Objective

**Housie Ghar** is designed to digitize the traditional Indian community game of Tambola (also known as Housie or Bingo). The platform replaces manual processes (drawing physical tokens, checking paper tickets, manual ledger tracking, and cash handoffs) with an automated, cryptographically secure web-based application.

### Core Value Proposition:
1.  **Trust & Verifiability:** An automated draw engine shuffles numbers using a Cryptographically Secure Pseudo-Random Number Generator (CSPRNG), generating an audit trail that guarantees a manipulation-free game.
2.  **Instant Verification:** Winnings are calculated in real time by the backend game engine the millisecond a number is drawn, eliminating manual ticket review delays.
3.  **Digital Liquidity Framework:** Standard payment gateway dependencies and compliance barriers are bypassed using a decentralized Peer-to-Peer (P2P) agent-ledger network. Agents act as pre-funded float holders, collecting player cash/UPI payments offline and confirming ticket orders via their wallet balance.
4.  **Zero-Friction Player Access:** Players access the platform through a mobile-first web app on their phone browser without needing to download native apps.

---

## 2. Player Onboarding & Access Flow

To protect player privacy while ensuring returning identities for tickets and prize claims, the onboarding experience uses a simple, passwordless validation model.

```
                  [ First-Time Visitor ]
                             │
                             ▼
                 ┌──────────────────────┐
                 │    Sign-Up Page      │ ◄─── Integrates HG Secondary Logo
                 │                      │
                 │ 1. Full Name         │
                 │ 2. Housie Name       │ (Acts as Username & Password)
                 └───────────┬──────────┘
                             │
                             ▼ (Saves Cookie / LocalStorage)
                     [ Player Lobby ]
                             ▲
                             │ (Subsequent Visits)
                 ┌───────────┴──────────┐
                 │     Login Page       │ ◄─── Integrates HG Secondary Logo
                 │                      │
                 │ 1. Enter Housie Name │
                 └──────────────────────┘
                             ▲
                             │ (Staff Portal Access Link)
                 ┌───────────┴──────────┐
                 │  Staff Login Icon    │ ◄─── Ledgers & Operational HUDs
                 └──────────────────────┘
```

### A. Sign Up Page (First Visit)
Upon visiting the website for the first time, players are greeted by a clean, modern sign-up page.
*   **Input Fields:**
    1.  **Full Name:** The user's real name (used by agents for physical payment verification).
    2.  **Housie Name:** A unique alias (username, 3–20 characters, alphanumeric) chosen by the player.
*   **Authentication Logic:** The **Housie Name** serves as both the username and the credentials password. Once registered, a secure authentication state is saved in the player's browser cookies and local storage.
*   **Branding Integration:** The page features the **Housie Ghar Secondary Logo** (`HG Logos/HG Secondary.png`) prominently centered above the input fields.
*   **Staff Shortcut:** A key icon or subtle button is integrated in the header or bottom section of the screen, leading directly to the **Staff Login Page**.

### B. Login Page (Returning Visits)
If a player has visited the site previously, the sign-up form is bypassed, and a login page is displayed.
*   **Input Fields:** A single text field asking the user to enter their **Housie Name**.
*   **Validation:** The system checks the database for the matching Housie Name. Upon submission, it re-establishes the session and redirects the player to the active public lobby.
*   **Branding Integration:** Uses the same secondary branding template with the secondary logo.

---

## 3. Platform Role Hierarchy

The platform operations are divided between anonymous public users, promotional partners, and five distinct management staff roles under a Role-Based Access Control (RBAC) model:

| Level | Role Name | Type | Access Scope & Core Responsibilities |
| :---: | :--- | :--- | :--- |
| **-** | **Player** | Public | Registers with a Housie Name. Browses lobbies, locks tickets, pays agents, views live draws, sends emoji reactions, and claims prizes. |
| **-** | **Promoter** | Partner | Marketing affiliate. Generates referral codes, accesses promo assets, tracks referred registrations, and earns commission percentages on tickets purchased by referrals. |
| **4** | **Bookie / Agent** | Staff | Sales handler. Monitors their assigned booking queue. Collects offline UPI/cash payments from players, clicks "Confirm" to debit their digital wallet, and finalizes the booking. |
| **3** | **Operator** | Staff | Event conductor. Creates schedules, initiates live draws, adjusts caller speed sliders (5s-12s), pauses the conductor loop, broadcasts text banners, and resolves overflow queues. |
| **2.1**| **Finance Officer / CFO**| Staff | Financial ledger admin. Tracks platform liability, verifies physical cash top-ups, and approves digital wallet credits for agents. |
| **2** | **Admin** | Staff | Supervisor. Creates and configures games, builds prize configurations, registers operator and agent accounts, and oversees operations. |
| **1** | **Superadmin** | Staff | Master Administrator. Manages all staff accounts, overrides live games, updates system settings, switches themes, and reviews the read-only audit log. |

---

## 4. Core System Workflows

### A. Ticket Selection & Soft Lock Booking Engine
*   **Lock Request:** A player clicks ticket numbers on the lobby grid and submits their booking. The backend database executes a row-level lock (`SELECT FOR UPDATE`) on the selected tickets to prevent double-booking.
*   **10-Minute Lock:** The tickets enter a `Locked` state for a maximum of 10 minutes. A modal is overlayed on the player's screen with a `10:00` countdown timer.
*   **WhatsApp P2P Redirect:** The booking triggers a deep link opening WhatsApp to the assigned Agent with pre-filled syntax:
    `https://wa.me/[Agent_Phone]?text=Hi!+I+am+[Housie_Name].+I+want+to+book+Ticket(s):+[Ticket_Numbers]+for+[Game_Title].+Booking+ID:+%23[Booking_ID]`
*   **State Resolution:** The player waits while the agent confirms payment receipt. Once confirmed, the tickets transition to `Sold`. If the 10-minute timer expires, the background lock sweeper cron job releases the tickets back to `Available`.

### B. Liquidity-Aware Round-Robin Routing
To distribute sales workload and prevent bottlenecks:
1.  **Roster Check:** When a booking is submitted, the system queries active, online Agents assigned to the game.
2.  **Wallet Verification:** The routing engine validates the target Agent's database balance (`current_balance`) against the booking cost.
3.  **Route/Skip Loop:** If the agent has sufficient balance, the booking is pushed to their queue. If balance is insufficient, the system skips them, logs a "Skip-and-Route" event, fires a push alert to the skipped agent, and routes the booking to the next funded agent.
4.  **Operator Failsafe:** If no agents have sufficient wallet balances, the booking routes to the Operator's "Overflow Queue," where it can be manually confirmed without wallet deductions.

### C. Live Automated Conductor
*   **CSPRNG Shuffle:** The draw sequence is pre-generated at game startup using Node's `crypto.randomInt()` module and saved in the database `Game_Logs` table.
*   **SSE Streaming:** The backend Conductor shuffles and calls numbers at a speed set by the Operator (5–12 seconds). It streams the numbers to players via Server-Sent Events (SSE).
*   **Tease Delay & Auto-Marking:** The player interface plays voice audio for each called number instantly, delaying the visual pop-out on the grid for **1200ms** to build suspense. The client auto-marks matching numbers on the player's ticket.
*   **Floating Emoji Reactions:** Players can send reactions (🔥, 👏, 🎉, 🤩) that float up the screen in real-time, managed by a low-overhead fire-and-forget API.

### D. Win Evaluation & Split Prize Logic
*   **Real-time Intersection:** The backend scans ticket matrices against the drawn array on every tick.
*   **Prize Locking:** Once a pattern matches, the engine records it. If multiple tickets win on the same number call, the system detects the split and distributes the prize money equally.
*   **Celebration Interruption:** The Conductor pauses for **4 seconds** when a win is registered, displaying a pop-art comic explosion on all player screens while playing announcement voiceovers.

---

## 5. Ticket Specifications & Rules

Housie/Tambola tickets are defined by strict structural regulations:
*   **Dimensions:** Each ticket is a $3 \times 9$ grid matrix (3 rows and 9 columns).
*   **Numbers Distribution:**
    *   Each row contains exactly **5 numbers** and **4 empty (null) spaces**.
    *   A single ticket contains exactly **15 numbers** in total.
*   **Column Index Constraints:** Columns map to specific number blocks:
    *   **Column 0:** 1 – 9
    *   **Column 1:** 10 – 19
    *   **Column 2:** 20 – 29
    *   **Column 3:** 30 – 39
    *   **Column 4:** 40 – 49
    *   **Column 5:** 50 – 59
    *   **Column 6:** 60 – 69
    *   **Column 7:** 70 – 79
    *   **Column 8:** 80 – 90
*   **Sorting:** Numbers within any column must be sorted in ascending order from top to row bottom.
*   **Uniqueness:** No two tickets generated for a scheduled game may share identical layouts.
