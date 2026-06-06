-- Seed Roles
INSERT INTO Roles (role_id, role_name, description) VALUES
(1, 'Superadmin', 'Unrestricted administrative control across the system'),
(2, 'Admin', 'Workforce management, game planning, and wallet audits'),
(3, 'Operator', 'Dedicated control of the live game board and draw speed'),
(4, 'Agent', 'Local sales, payment confirmation, and ticket provisioning')
ON CONFLICT (role_id) DO UPDATE SET
  role_name = EXCLUDED.role_name,
  description = EXCLUDED.description;
