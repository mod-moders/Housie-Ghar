-- Migration 001: Create Roles table
-- Stores the fixed set of user roles. Seeded once, never modified by application.

CREATE TABLE IF NOT EXISTS Roles (
  role_id     SERIAL       PRIMARY KEY,
  role_name   VARCHAR(50)  NOT NULL UNIQUE,
  description TEXT
);
