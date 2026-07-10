const { Client } = require('pg');

async function fixDB() {
  const c = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5432/housie_ghar' });
  await c.connect();
  try {
    await c.query("UPDATE Users SET phone = '0000000000' WHERE role_id = 2 AND phone IS NULL");
    await c.query("UPDATE Users SET current_balance = 1000000 WHERE role_id = 4");
    const r = await c.query("SELECT user_id FROM Users WHERE role_id = 2 LIMIT 1");
    if (r.rows.length > 0) {
      await c.query("UPDATE Scheduled_Games SET operator_id = $1 WHERE operator_id IS NULL", [r.rows[0].user_id]);
    }
    console.log("DB Fixed!");
  } catch (e) {
    console.error(e);
  } finally {
    await c.end();
  }
}

fixDB();
