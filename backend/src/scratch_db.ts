import pool from './db';

async function main() {
  try {
    const prizes = await pool.query(
      `SELECT * FROM Prize_Pool WHERE game_id = $1`,
      ['d2090e27-d8a6-45b3-8210-a797e2df5fd6']
    );
    console.log('PRIZES:');
    console.log(prizes.rows);
  } catch (err) {
    console.error('DB query error:', err);
  } finally {
    process.exit(0);
  }
}

main();
