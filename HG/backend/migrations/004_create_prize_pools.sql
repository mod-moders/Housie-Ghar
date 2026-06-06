-- Migration 004: Create Prize_Pool table
-- One row per prize category per game.

CREATE TABLE IF NOT EXISTS Prize_Pool (
  prize_id            SERIAL        PRIMARY KEY,
  game_id             UUID          NOT NULL REFERENCES Scheduled_Games(game_id) ON DELETE CASCADE,
  pattern_name        VARCHAR(50)   NOT NULL,
  prize_amount        DECIMAL(10,2) NOT NULL CHECK (prize_amount > 0),
  claimed             BOOLEAN       DEFAULT FALSE,
  winner_ticket_id    INTEGER,
  winner_housie_name  VARCHAR(50),
  claimed_at          TIMESTAMPTZ,
  split_count         INTEGER       DEFAULT 1,
  amount_per_winner   DECIMAL(10,2),

  CONSTRAINT uq_game_pattern UNIQUE (game_id, pattern_name)
);
