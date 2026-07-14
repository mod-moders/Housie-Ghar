-- Migration 024: Rename and clean up staff roles
-- Delete Promoter role and its users
DELETE FROM Users WHERE role_id = 5;
DELETE FROM Roles WHERE role_id = 5;

-- Update role names and descriptions for role_id 2 and 4
UPDATE Roles 
SET role_name = 'Financial Admin', 
    description = 'Financial management, Master Bookie Ledger, and wallet audits'
WHERE role_id = 2;

UPDATE Roles 
SET role_name = 'Bookie', 
    description = 'Local sales, payment confirmation, and ticket provisioning'
WHERE role_id = 4;
