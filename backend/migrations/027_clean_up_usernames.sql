-- Migration 027: Clean up existing staff usernames

UPDATE Users SET username = 'superadmin' WHERE role_id = 1;
UPDATE Users SET username = 'admin' WHERE role_id = 2 AND (username = 'cfo@housieghar.local' OR username = 'cfo');
UPDATE Users SET username = 'operator' WHERE role_id = 3 AND (username = 'operator@housieghar.local' OR username = 'operator@housieghar.in');
UPDATE Users SET username = 'bookie1' WHERE username = 'bookie1@housieghar.local';
UPDATE Users SET username = 'bookie2' WHERE username = 'bookie2@housieghar.local';
UPDATE Users SET username = 'bookie3' WHERE username = 'bookie3@housieghar.local';
