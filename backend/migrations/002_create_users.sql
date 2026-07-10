-- Migration 002: Create Users table
-- All staff accounts (Superadmin, Admin, Operator, Agent). Players have no entry here.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS Users (
  user_id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id                INTEGER       NOT NULL REFERENCES Roles(role_id),
  full_name              VARCHAR(100)  NOT NULL,
  email                  VARCHAR(255)  NOT NULL UNIQUE,
  phone                  VARCHAR(20)   UNIQUE,
  upi_id                 VARCHAR(100),
  password_hash          VARCHAR(255)  NOT NULL,
  temp_password_required BOOLEAN       DEFAULT TRUE,
  status                 VARCHAR(20)   DEFAULT 'Active',
  current_balance        DECIMAL(12,2) DEFAULT 0.00,
  created_by             UUID          REFERENCES Users(user_id),
  created_at             TIMESTAMPTZ   DEFAULT NOW(),
  last_login             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_email ON Users(email);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON Users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON Users(status);
