-- Migration 005: Create Tickets table
-- One row per ticket per game.

CREATE TABLE IF NOT EXISTS Tickets (
  ticket_id          SERIAL        PRIMARY KEY,
  game_id            UUID          NOT NULL REFERENCES Scheduled_Games(game_id) ON DELETE CASCADE,
  ticket_number      INTEGER       NOT NULL,
  grid_data          JSONB         NOT NULL,
  status             VARCHAR(20)   DEFAULT 'Available',
  locked_by_booking  UUID,
  locked_until       TIMESTAMPTZ,
  owner_housie_name  VARCHAR(50),
  confirmed_at       TIMESTAMPTZ,

  CONSTRAINT uq_game_ticket UNIQUE (game_id, ticket_number)
);

CREATE INDEX IF NOT EXISTS idx_tickets_game_status ON Tickets(game_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_locked_until ON Tickets(locked_until);
