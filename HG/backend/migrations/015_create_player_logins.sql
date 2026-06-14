-- Migration 015: Create Player_Logins table
-- Public player accounts (separate from staff, who live in Users).
-- Per product spec the player's username doubles as their password for
-- subsequent logins, so `password` is set to the username at registration.

CREATE TABLE IF NOT EXISTS Player_Logins (
  player_id     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(30)  NOT NULL UNIQUE,
  password      VARCHAR(30)  NOT NULL,
  full_name     VARCHAR(100) NOT NULL,
  date_of_birth DATE         NOT NULL,
  created_at    TIMESTAMPTZ  DEFAULT NOW(),
  last_login    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_player_logins_username ON Player_Logins(username);
