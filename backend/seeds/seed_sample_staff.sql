-- Seed sample staff for local development
-- All accounts share the dev password: ChangeMe123! (same bcrypt hash as the superadmin seed)
-- Regenerate with: node -e "require('bcrypt').hash('ChangeMe123!',12).then(console.log)"
--
-- Fixed UUIDs so re-running is idempotent and other seeds can reference them:
--   a2 — CFO Admin, a3 — Operator, b1/b2/b3 — Bookies (Agents)

INSERT INTO Users (user_id, role_id, full_name, username, email, phone, upi_id, town, password_hash, temp_password_required, status, current_balance) VALUES
('00000000-0000-0000-0000-0000000000a2', 2, 'Carol Finance', 'admin', 'cfo@housieghar.local',      '+919999999902', 'carol@upi', 'Shillong', '$2b$12$zV/8efOtowujRPNCN5nH0uGvtaPnC6J1qxUeZrwh9amOrWAJ2RlRm', FALSE, 'Active', 0.00),
('00000000-0000-0000-0000-0000000000a3', 3, 'Oscar Operator', 'operator', 'operator@housieghar.local', '+919999999903', NULL,        'Shillong', '$2b$12$zV/8efOtowujRPNCN5nH0uGvtaPnC6J1qxUeZrwh9amOrWAJ2RlRm', FALSE, 'Active', 0.00),
('00000000-0000-0000-0000-0000000000b1', 4, 'Bah Khrawbor',   'bookie1', 'bookie1@housieghar.local',  '+919999999911', 'khraw@upi', 'Shillong', '$2b$12$zV/8efOtowujRPNCN5nH0uGvtaPnC6J1qxUeZrwh9amOrWAJ2RlRm', FALSE, 'Active', 5000.00),
('00000000-0000-0000-0000-0000000000b2', 4, 'Kong Daphi',     'bookie2', 'bookie2@housieghar.local',  '+919999999912', 'daphi@upi', 'Sohra',    '$2b$12$zV/8efOtowujRPNCN5nH0uGvtaPnC6J1qxUeZrwh9amOrWAJ2RlRm', FALSE, 'Active', 2000.00),
('00000000-0000-0000-0000-0000000000b3', 4, 'Banri Lyngdoh',  'bookie3', 'bookie3@housieghar.local',  '+919999999913', 'banri@upi', 'Jowai',    '$2b$12$zV/8efOtowujRPNCN5nH0uGvtaPnC6J1qxUeZrwh9amOrWAJ2RlRm', FALSE, 'Active', 0.00)
ON CONFLICT (email) DO NOTHING;

-- Single-FO model: designate the seeded admin as CFO
UPDATE Users SET is_cfo = TRUE
WHERE user_id = '00000000-0000-0000-0000-0000000000a2'
  AND NOT EXISTS (SELECT 1 FROM Users WHERE is_cfo = TRUE);

-- Opening-balance ledger entries so bookie balances reconcile with the ledger
INSERT INTO Wallet_Ledger (agent_id, transaction_type, amount, balance_after, reference_type, description)
SELECT u.user_id, 'Credit', u.current_balance, u.current_balance, 'Seed', 'Opening balance (dev seed)'
FROM Users u
WHERE u.user_id IN ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2')
  AND NOT EXISTS (
    SELECT 1 FROM Wallet_Ledger w
    WHERE w.agent_id = u.user_id AND w.reference_type = 'Seed'
  );

-- Assign the seeded operator to the sample game so the operator HUD has a game
UPDATE Scheduled_Games
SET operator_id = '00000000-0000-0000-0000-0000000000a3'
WHERE game_id = '00000000-0000-0000-0000-000000000001' AND operator_id IS NULL;
