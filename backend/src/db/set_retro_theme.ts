import pool from './index';

async function updateTheme() {
  console.log('Updating active_theme to digital_neon...');
  try {
    const res = await pool.query(
      `INSERT INTO Platform_Config (config_key, config_value, description)
       VALUES ('active_theme', 'digital_neon', 'The active UI theme')
       ON CONFLICT (config_key) 
       DO UPDATE SET config_value = 'digital_neon';`
    );
    console.log('✅ active_theme updated successfully:', res.rowCount);
  } catch (error) {
    console.error('❌ Failed to update active_theme:', error);
  } finally {
    await pool.end();
  }
}

updateTheme();
