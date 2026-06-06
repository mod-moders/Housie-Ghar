-- Migration 006: Create Bookings table
-- One row per booking attempt (whether successful or expired).

CREATE TABLE IF NOT EXISTS Bookings (
  booking_id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id                  UUID          NOT NULL REFERENCES Scheduled_Games(game_id),
  ticket_ids               INTEGER[]     NOT NULL,
  housie_name              VARCHAR(50)   NOT NULL,
  assigned_agent_id        UUID          NOT NULL REFERENCES Users(user_id),
  total_amount             DECIMAL(10,2) NOT NULL,
  booking_status           VARCHAR(20)   DEFAULT 'Locked',
  locked_at                TIMESTAMPTZ   DEFAULT NOW(),
  locked_until             TIMESTAMPTZ   NOT NULL,
  confirmed_at             TIMESTAMPTZ,
  confirmed_by             UUID          REFERENCES Users(user_id),
  rejected_at              TIMESTAMPTZ,
  player_device_fingerprint VARCHAR(255),
  spam_flagged             BOOLEAN       DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_bookings_agent_status ON Bookings(assigned_agent_id, booking_status);
CREATE INDEX IF NOT EXISTS idx_bookings_locked_until ON Bookings(locked_until);
CREATE INDEX IF NOT EXISTS idx_bookings_housie_name ON Bookings(housie_name);
