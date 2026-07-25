-- Migration 046: Enforce phone number uniqueness for players (signup OTP verification)
-- Partial index (WHERE phone IS NOT NULL) so existing/legacy rows with no phone
-- are unaffected — only actual duplicate phone numbers are rejected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_phone_unique ON Players (phone) WHERE phone IS NOT NULL;
