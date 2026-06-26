-- Migration 018: Create Prize_Settlements table.
-- One row per winning ticket per prize: the platform's obligation to pay that
-- winner, through the agent who sold the ticket. Recorded ('Owed') in the same
-- transaction that claims the prize; a Financial Officer later settles it
-- ('Paid'), which credits the selling agent's wallet (symmetric to the debit
-- taken when the booking was confirmed). player_id is nullable: anonymous
-- bookings have no player account.

CREATE TABLE IF NOT EXISTS Prize_Settlements (
  settlement_id      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id            UUID          NOT NULL REFERENCES Scheduled_Games(game_id) ON DELETE CASCADE,
  prize_id           INTEGER       NOT NULL REFERENCES Prize_Pool(prize_id) ON DELETE CASCADE,
  pattern_name       VARCHAR(50)   NOT NULL,
  ticket_id          INTEGER       NOT NULL,
  ticket_number      INTEGER       NOT NULL,
  player_id          UUID          REFERENCES Player_Logins(player_id),
  winner_housie_name VARCHAR(50),
  agent_id           UUID          NOT NULL REFERENCES Users(user_id),
  amount             DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
  status             VARCHAR(12)   NOT NULL DEFAULT 'Owed',
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  settled_at         TIMESTAMPTZ,
  settled_by         UUID          REFERENCES Users(user_id),

  -- One settlement per (prize, ticket): makes win-time inserts replay-safe,
  -- since boot-time auto-resume can re-run draws on an already-claimed prize.
  CONSTRAINT uq_prize_ticket UNIQUE (prize_id, ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_settlements_game   ON Prize_Settlements(game_id);
CREATE INDEX IF NOT EXISTS idx_settlements_agent  ON Prize_Settlements(agent_id);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON Prize_Settlements(status);
