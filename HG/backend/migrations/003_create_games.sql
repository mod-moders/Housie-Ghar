-- Migration 003: Create Scheduled_Games table
-- Every game instance created on the platform.

CREATE TABLE IF NOT EXISTS Scheduled_Games (
  game_id       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  title         VARCHAR(100)  NOT NULL,
  scheduled_at  TIMESTAMPTZ   NOT NULL,
  total_tickets INTEGER       NOT NULL CHECK (total_tickets > 0),
  ticket_price  DECIMAL(10,2) NOT NULL CHECK (ticket_price > 0),
  game_status   VARCHAR(20)   NOT NULL DEFAULT 'Scheduled',
  operator_id   UUID          REFERENCES Users(user_id),
  created_by    UUID          REFERENCES Users(user_id),
  created_at    TIMESTAMPTZ   DEFAULT NOW(),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  postponed_to  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_games_status ON Scheduled_Games(game_status);
CREATE INDEX IF NOT EXISTS idx_games_operator ON Scheduled_Games(operator_id);
CREATE INDEX IF NOT EXISTS idx_games_scheduled ON Scheduled_Games(scheduled_at);
