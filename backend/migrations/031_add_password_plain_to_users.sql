-- Migration 031: Add password_plain column to Users table
ALTER TABLE Users ADD COLUMN IF NOT EXISTS password_plain VARCHAR(255);

-- Seed default passwords for existing seeded accounts
UPDATE Users SET password_plain = 'Enterhg@01' WHERE username = 'superadmin';
UPDATE Users SET password_plain = 'ChangeMe123!' WHERE username IN ('admin', 'operator', 'bookie1', 'bookie2', 'bookie3');
