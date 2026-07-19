-- Persists uploaded audio config bytes in Postgres so they survive Railway
-- redeploys, which reset the backend's local filesystem (backend/uploads and
-- frontend/public/audio/config only lived on disk before this, so every
-- redeploy silently wiped uploaded intro/outro/background-music files while
-- Platform_Config still pointed at the now-missing filename).
CREATE TABLE IF NOT EXISTS Platform_Audio_Files (
  config_key   VARCHAR(100) PRIMARY KEY,
  filename     TEXT         NOT NULL,
  mime_type    TEXT,
  data         BYTEA        NOT NULL,
  updated_at   TIMESTAMPTZ  DEFAULT NOW()
);
