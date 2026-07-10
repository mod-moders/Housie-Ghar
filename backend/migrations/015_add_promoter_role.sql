-- Migration 015: Add Promoter role to Roles table
INSERT INTO Roles (role_id, role_name, description) VALUES
(5, 'Promoter', 'Affiliate marketer who registers players and earns commission on ticket sales')
ON CONFLICT (role_id) DO NOTHING;
