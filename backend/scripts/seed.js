// Development seed: a few fake players with accepted scores so the leaderboard has data.
// Refuses to run in production.
import 'dotenv/config';
import pg from 'pg';
import { newFriendCode } from '../src/utils/crypto.js';
import { formatHandle } from '../src/utils/nickname.js';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed a production database.');
  process.exit(1);
}
const url = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
const client = new pg.Client({
  connectionString: url,
  ssl: /sslmode=require|\.neon\.tech/.test(url ?? '') ? { rejectUnauthorized: true } : undefined,
});
await client.connect();

const names = ['Rahim', 'Karim', 'Nusrat', 'Tania', 'Sabbir', 'Mim'];
const villains = ['abuser', 'robber', 'rapist'];
try {
  await client.query('BEGIN');
  for (const [i, nickname] of names.entries()) {
    const tag = 1000 + i;
    const { rows } = await client.query(
      `INSERT INTO players (display_name, nickname, tag, friend_code) VALUES ($1,$2,$3,$4)
       ON CONFLICT (lower(nickname), tag) WHERE nickname IS NOT NULL DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id`,
      [formatHandle(nickname, tag), nickname, tag, newFriendCode()],
    );
    const villain = villains[i % 3];
    const { rows: s } = await client.query(
      `INSERT INTO game_sessions (player_id, villain, status, completed_at) VALUES ($1,$2,'completed', now()) RETURNING id`,
      [rows[0].id, villain],
    );
    await client.query(
      `INSERT INTO game_scores (player_id, game_session_id, villain, score, rounds, perfects, duration_ms, validation_status)
       VALUES ($1,$2,$3,$4,10,2,30000,'accepted')`,
      [rows[0].id, s[0].id, villain, 400 + i * 275],
    );
  }
  await client.query('COMMIT');
  console.log(`Seeded ${names.length} players.`);
} catch (err) {
  await client.query('ROLLBACK');
  console.error('Seed failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
