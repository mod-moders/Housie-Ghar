import pool from './src/db';

async function main() {
  const client = await pool.connect();
  try {
    await client.query(`
      INSERT INTO Platform_Config (config_key, config_value, description)
      VALUES ('english_caller_enabled', 'true', 'Enable English AI voice calling during live games')
      ON CONFLICT (config_key) DO NOTHING;
    `);
    console.log("Added english_caller_enabled to Platform_Config");
  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    process.exit(0);
  }
}

main();
