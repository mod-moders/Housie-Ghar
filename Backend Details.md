# Housie Ghar: Backend Architecture & Database Details

This document outlines the backend services, relational database schemas, concurrency controls, draw conductor loops, routing logic, and win-detection formulas for **Housie Ghar**.

---

## 1. Database Schema Specifications (PostgreSQL)

The database schema uses strict relational structures to maintain transaction integrity. The key tables are defined below:

```sql
-- 1. Roles Definition
CREATE TABLE Roles (
    role_id INT PRIMARY KEY,
    role_name VARCHAR(50) UNIQUE NOT NULL
);
INSERT INTO Roles (role_id, role_name) VALUES 
(1, 'Superadmin'), (2, 'Admin'), (3, 'Operator'), (4, 'Agent');

-- 2. Staff Accounts
CREATE TABLE Users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role_id INT NOT NULL REFERENCES Roles(role_id),
    is_cfo BOOLEAN DEFAULT FALSE,
    whatsapp_number VARCHAR(20) NOT NULL,
    current_balance DECIMAL(12, 2) DEFAULT 0.00 CHECK (current_balance >= 0.00),
    status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Suspended', 'Pending'))
);

-- 3. Game Schedules
CREATE TABLE Scheduled_Games (
    game_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_title VARCHAR(200) NOT NULL,
    scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL,
    ticket_capacity INT NOT NULL DEFAULT 500,
    ticket_price DECIMAL(10, 2) NOT NULL CHECK (ticket_price > 0),
    operator_id UUID REFERENCES Users(user_id),
    game_status VARCHAR(20) DEFAULT 'Scheduled' CHECK (game_status IN ('Scheduled', 'Live', 'Paused', 'Completed', 'Postponed')),
    call_interval INT DEFAULT 8000, -- Default interval in milliseconds (8s)
    prize_pool_config JSONB NOT NULL -- Configures dividends and cash allocations
);

-- 4. Tickets (3x9 Grids)
CREATE TABLE Tickets (
    ticket_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES Scheduled_Games(game_id) ON DELETE CASCADE,
    matrix_structure JSONB NOT NULL, -- 3x9 grid matrix, e.g. [[null, 12, null, ...], [Row 2], [Row 3]]
    status VARCHAR(20) DEFAULT 'Available' CHECK (status IN ('Available', 'Locked', 'Sold')),
    booking_id VARCHAR(50),
    player_housie_name VARCHAR(100),
    locked_until TIMESTAMP WITH TIME ZONE,
    assigned_bookie_id UUID REFERENCES Users(user_id)
);
CREATE INDEX idx_tickets_game_status ON Tickets(game_id, status);

-- 5. Wallet Transactions Ledger
CREATE TABLE Wallet_Ledger (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bookie_id UUID NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('Credit', 'Debit')),
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    reference_note VARCHAR(255),
    status VARCHAR(20) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Conductor Draw Logs
CREATE TABLE Game_Logs (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL UNIQUE REFERENCES Scheduled_Games(game_id) ON DELETE CASCADE,
    draw_sequence JSONB NOT NULL, -- Pre-generated Fisher-Yates array [1-90]
    drawn_numbers JSONB DEFAULT '[]'::jsonb, -- Numbers called so far
    claimed_prizes JSONB DEFAULT '[]'::jsonb -- Records won patterns, timestamps, splits
);

-- 7. System Audit Trail (Non-repudiation)
CREATE TABLE System_Audit_Logs (
    log_id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    user_id UUID REFERENCES Users(user_id),
    action_performed VARCHAR(255) NOT NULL,
    target_data VARCHAR(100),
    ip_address VARCHAR(45) NOT NULL
);

-- 8. Platform Configuration Settings
CREATE TABLE Platform_Config (
    config_key VARCHAR(100) PRIMARY KEY,
    config_value VARCHAR(255) NOT NULL
);
```

---

## 2. Database Concurrency & Locking Controls

### A. Pessimistic Row Locking on Booking
To prevent multiple players from locking the same ticket at the same time:
*   A transaction locks the target rows using a row-level lock (`SELECT FOR UPDATE`).
*   The system checks if any selected ticket is not in the `Available` state.
*   If check passes, the status changes to `Locked` with a 10-minute timeout (`locked_until = NOW() + INTERVAL '10 minutes'`).
```sql
BEGIN;
SELECT ticket_id, status FROM Tickets 
WHERE game_id = $1 AND ticket_id = ANY($2::uuid[]) 
FOR UPDATE;
-- Check availability on each ticket row.
-- Update rows to 'Locked' if available; otherwise rollback.
COMMIT;
```

### B. Wallet Balance Overdraft Prevention
To prevent race conditions during booking confirmations:
*   A row-level lock is applied to the Agent's record in the `Users` table (`SELECT current_balance ... FOR UPDATE`).
*   If the balance is sufficient, the deduction is applied. If the balance is insufficient, the transaction rolls back, keeping wallet states accurate.

### C. Audit Log Non-Repudiation Trigger
An audit log trigger blocks `UPDATE` or `DELETE` commands on the `System_Audit_Logs` table, ensuring logs are write-only.
```sql
CREATE OR REPLACE FUNCTION block_audit_modifications() 
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Modifying or deleting system audit logs is strictly prohibited.';
END;
$$ LANGUAGE plSettings;

CREATE TRIGGER trg_block_audit_modifications
BEFORE UPDATE OR DELETE ON System_Audit_Logs
FOR EACH ROW EXECUTE FUNCTION block_audit_modifications();
```

---

## 3. Conductor Draw Engine Algorithms

### A. Cryptographically Secure Shuffle (CSPRNG)
At game startup, a randomized sequence of numbers from 1 to 90 is generated. The sequence is shuffled using the **Fisher-Yates Shuffle** algorithm with random indices generated by Node's cryptographically secure random number module (`crypto.randomInt`):
```typescript
import { randomInt } from "crypto";

export function generateDrawSequence(): number[] {
  const arr = Array.from({ length: 90 }, (_, i) => i + 1);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
```

### B. Conductor Draw State Machine
The game loop runs as a server-side timer using a configurable interval (5–12 seconds).
*   **Tick Flow:** Draws the next number in the sequence $\rightarrow$ appends it to the game's drawn array in the database $\rightarrow$ runs win detection across active tickets $\rightarrow$ broadcasts updates via SSE and Socket.io.
*   **Draw Speed Updates:** Speed changes made by the Operator update the timer interval for the subsequent draw loop cycle.

### C. Expired Lock Cleanup Sweeper
A background scheduler (using `node-cron` or `setInterval`) runs every 30 seconds to clean up expired bookings.
```sql
UPDATE Tickets 
SET status = 'Available', 
    booking_id = NULL, 
    player_housie_name = NULL, 
    locked_until = NULL
WHERE status = 'Locked' AND locked_until < NOW();
```

---

## 4. Smart Queue Liquidity Routing Engine

To distribute bookings efficiently, the backend routes requests dynamically:
1.  **Online Check:** Queries the roster of active Agents assigned to the game.
2.  **Wallet Check:** Checks if the target Agent has a wallet balance greater than or equal to the booking amount.
3.  **Routing Action:** If the check passes, routes the booking to the Agent's queue. If not, skips the Agent, logs a bypass event, sends a warning push notification to the skipped Agent, and checks the next Agent.
4.  **Operator Fallback:** If no Agent has sufficient balance, routes the booking to the Operator's "Overflow Queue," where it can be confirmed manually without a wallet deduction.

---

## 5. Automated Win-Verification Engine

### A. Winning Pattern Matrix Checks
Let the ticket matrix be $T[r][c]$ ($r \in \{0, 1, 2\}$, $c \in \{0, \dots, 8\}$).
Let $Marked(r, c)$ return `true` if $T[r][c] \neq null$ and the number is present in the drawn array.
Let $S_{non\_null}(r) = \{ c \mid T[r][c] \neq null \}$ represent the columns containing active numbers in row $r$.

*   **Early 5:** First ticket where any 5 numbers match:
    $$\sum_{r=0}^{2} \sum_{c \in S_{non\_null}(r)} [Marked(r, c)] \ge 5$$
*   **Quick 7:** First ticket where any 7 numbers match:
    $$\sum_{r=0}^{2} \sum_{c \in S_{non\_null}(r)} [Marked(r, c)] \ge 7$$
*   **Corner Check:** Corners are the first and last non-null numbers in the first and third rows:
    *   $C_1 = (0, \min(S_{non\_null}(0)))$
    *   $C_2 = (0, \max(S_{non\_null}(0)))$
    *   $C_3 = (2, \min(S_{non\_null}(2)))$
    *   $C_4 = (2, \max(S_{non\_null}(2)))$
    *   Corner condition: $Marked(C_1) \land Marked(C_2) \land Marked(C_3) \land Marked(C_4)$
*   **Star:** Corner condition met, plus the center number in the second row is matched:
    *   $StarCenter = (1, S_{non\_null}(1)[2])$
    *   Star condition: $\text{Corner Condition} \land Marked(StarCenter)$
*   **Top Line:** First row complete: $\forall c \in S_{non\_null}(0): Marked(0, c)$
*   **Middle Line:** Second row complete: $\forall c \in S_{non\_null}(1): Marked(1, c)$
*   **Bottom Line:** Third row complete: $\forall c \in S_{non\_null}(2): Marked(2, c)$
*   **Box Bonus:** At least two marked numbers in each row:
    $$\left( \sum_{c \in S_{non\_null}(0)} [Marked(0, c)] \ge 2 \right) \land \left( \sum_{c \in S_{non\_null}(1)} [Marked(1, c)] \ge 2 \right) \land \left( \sum_{c \in S_{non\_null}(2)} [Marked(2, c)] \ge 2 \right)$$
*   **Full House:** All 15 numbers marked:
    $$\forall r \in \{0,1,2\}, \forall c \in S_{non\_null}(r): Marked(r, c)$$

### B. Winner Announcement & Split Calculation
*   **Evaluation:** Checks patterns after every draw tick.
*   **Split Detection:** If multiple tickets win on the same number call, the reward is split equally, and the split is logged in the database.
*   **SSE Broadcast:** Emits the winner object to the stream, triggering a 4-second delay on the Conductor draw loop to allow for screen overlays.

---

## 6. Real-Time Stream Event Contracts

### A. Server-Sent Events (SSE) Stream
*   **Headers:**
    *   `Content-Type: text/event-stream`
    *   `Cache-Control: no-cache`
    *   `Connection: keep-alive`
*   **Keep-Alive Heartbeat:** Emits a blank heartbeat line every 15 seconds to prevent reverse-proxy timeouts.
*   **Sample Draw Event:**
    ```json
    event: draw
    data: {
      "draw_number": 42,
      "total_drawn": 12,
      "timestamp": 1717859041234
    }
    ```
*   **Sample Winner Event:**
    ```json
    event: winner
    data: {
      "game_id": "game-uuid-1024",
      "prize_name": "Star",
      "payout_amount": 750.00,
      "winners": [
        {
          "housie_name": "WinnerOne",
          "ticket_id": "ticket-uuid-098",
          "matched_number": 42
        },
        {
          "housie_name": "WinnerTwo",
          "ticket_id": "ticket-uuid-104",
          "matched_number": 42
        }
      ],
      "timestamp": 1717859045000
    }
    ```

### B. WebSockets (Socket.io) Rooms
*   **`admin-room`:** Staff dashboards connect to receive real-time wallet recharge notifications (`topup_request_received`).
*   **`agent-room:[agent_id]`:** Used to push individual ticket booking allocations (`new_booking_request`).
*   **`operator-room:[game_id]`:** Allows real-time synchronization of conductor state and drawn logs for the Operator interface.
