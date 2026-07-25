-- Migration 045: Add monthly_salary column to Users table
ALTER TABLE Users ADD COLUMN IF NOT EXISTS monthly_salary DECIMAL(12,2) DEFAULT 0.00;
