-- Migration 018: Make full_name optional for Players

ALTER TABLE Players ALTER COLUMN full_name DROP NOT NULL;
