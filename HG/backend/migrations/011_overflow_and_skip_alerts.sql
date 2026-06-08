-- Migration 011: Overflow failsafe + FOMO skip alerts
-- Supports the Liquidity-Aware Routing Engine (Phase 2 §4, Phase 5 §2).

-- Marks a booking that was routed to an Operator because every active bookie
-- had insufficient wallet balance (the Operator Overflow Failsafe).
ALTER TABLE Bookings ADD COLUMN IF NOT EXISTS is_overflow BOOLEAN DEFAULT FALSE;

-- Durable log of "FOMO" skip events: a bookie was skipped during round-robin
-- because their wallet balance could not cover the booking total. Powers the
-- agent dashboard banner and the (future) Financial Officer portal view.
CREATE TABLE IF NOT EXISTS Skip_Alerts (
  alert_id       SERIAL        PRIMARY KEY,
  agent_id       UUID          NOT NULL REFERENCES Users(user_id),
  game_id        UUID          REFERENCES Scheduled_Games(game_id) ON DELETE SET NULL,
  booking_amount DECIMAL(10,2) NOT NULL,
  agent_balance  DECIMAL(10,2) NOT NULL,
  seen           BOOLEAN       DEFAULT FALSE,
  created_at     TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skip_alerts_agent ON Skip_Alerts(agent_id, seen);
CREATE INDEX IF NOT EXISTS idx_bookings_overflow ON Bookings(is_overflow, booking_status);
