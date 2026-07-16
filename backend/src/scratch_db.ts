import pool from './db';

async function main() {
  try {
    const requests = await pool.query('SELECT * FROM TopUp_Requests');
    console.log('TOPUP REQUESTS IN DB:');
    console.log(requests.rows);

    const foadmins = await pool.query("SELECT user_id, full_name, phone, role_id, is_cfo FROM Users WHERE role_id IN (1, 2)");
    console.log('FO / ADMIN USERS IN DB:');
    console.log(foadmins.rows);
  } catch (err) {
    console.error('DB query error:', err);
  } finally {
    process.exit(0);
  }
}

main();
