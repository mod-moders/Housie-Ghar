-- Migration 010: Create Themes and Platform_Config tables

-- Themes table: Available UI themes and currently active one
CREATE TABLE IF NOT EXISTS Themes (
  theme_id          SERIAL       PRIMARY KEY,
  theme_name        VARCHAR(50)  NOT NULL UNIQUE,
  css_class         VARCHAR(50)  NOT NULL,
  is_active         BOOLEAN      DEFAULT FALSE,
  preview_image_url VARCHAR(500)
);

-- Platform_Config table: Key-value store for global platform variables
CREATE TABLE IF NOT EXISTS Platform_Config (
  config_key    VARCHAR(100) PRIMARY KEY,
  config_value  TEXT         NOT NULL,
  description   TEXT,
  updated_by    UUID         REFERENCES Users(user_id),
  updated_at    TIMESTAMPTZ  DEFAULT NOW()
);
