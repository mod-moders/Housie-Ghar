import pool from './db';

async function main() {
  try {
    const games = await pool.query("SELECT game_id, title, total_tickets, game_status FROM Scheduled_Games WHERE game_status = 'Scheduled'");
    console.log('SCHEDULED GAMES:');
    for (const g of games.rows) {
      const ticketsCount = await pool.query('SELECT COUNT(*) FROM Tickets WHERE game_id = $1', [g.game_id]);
      console.log(`Game "${g.title}" (ID: ${g.game_id}) has ${ticketsCount.rows[0].count} tickets generated.`);
    }
  } catch (err) {
    console.error('DB query error:', err);
  } finally {
    process.exit(0);
  }
}

main();
