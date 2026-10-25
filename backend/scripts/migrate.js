// Explicit migration runner. Never called from the web server on startup.
// Uses the direct (non-pooled) Neon connection when DATABASE_DIRECT_URL is set.
import 'dotenv/config';
import pg from 'pg';
import { runMigrations } from '../src/utils/migrate.js';

const url = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_DIRECT_URL or DATABASE_URL must be set');
  process.exit(1);
}
const ssl = /sslmode=require|\.neon\.tech/.test(url) ? { rejectUnauthorized: true } : undefined;
const client = new pg.Client({ connectionString: url, ssl });
await client.connect();

const db = {
  query: (t, p) => client.query(t, p),
  async tx(fn) {
    await client.query('BEGIN');
    try {
      const r = await fn({ query: (t, p) => client.query(t, p) });
      await client.query('COMMIT');
      return r;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  },
};

try {
  const applied = await runMigrations(db, { log: (m) => console.log(m) });
  console.log(applied.length ? `Done: ${applied.length} migration(s) applied.` : 'Database is up to date.');
} catch (err) {
  console.error('Migration failed (the failing file was rolled back):', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
