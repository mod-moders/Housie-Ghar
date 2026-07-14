-- Migration 023: player self-service profile fields.
-- phone/email are optional contact details the player can add themselves;
-- sound_enabled persists the caller/beep mute preference across devices;
-- password_hash is an optional upgrade from the default username-as-password
-- scheme (NULL = still logs in with username only).
ALTER TABLE Player_Logins
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
