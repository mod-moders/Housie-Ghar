-- Migration 048: Add booking due fields for financial tracking
ALTER TABLE Bookings ADD COLUMN IF NOT EXISTS due_settled BOOLEAN DEFAULT FALSE;
ALTER TABLE Bookings ADD COLUMN IF NOT EXISTS due_settled_at TIMESTAMPTZ;
ALTER TABLE Bookings ADD COLUMN IF NOT EXISTS due_settled_by UUID REFERENCES Users(user_id);
