-- Migration 008: Create Game_Logs table
-- Critical audit and crash-recovery table for the live game engine.

CREATE TABLE IF NOT EXISTS Game_Logs (
  log_id                 SERIAL       PRIMARY KEY,
  game_id                UUID         NOT NULL UNIQUE REFERENCES Scheduled_Games(game_id),
  draw_sequence          INTEGER[]    NOT NULL,
  drawn_numbers          INTEGER[]    DEFAULT '{}',
  current_index          INTEGER      DEFAULT 0,
  sequence_generated_at  TIMESTAMPTZ,
  last_draw_at           TIMESTAMPTZ,
  total_drawn            INTEGER      DEFAULT 0
);
