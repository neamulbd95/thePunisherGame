import pg from 'pg';

/**
 * The rest of the code only depends on { query(text, params), tx(fn), close() } so tests can
 * swap in an in-process PostgreSQL (PGlite) with the same shape.
 */
export function createDatabase(env, logger) {
  const useSsl =
    env.DATABASE_SSL === 'true' ||
    (env.DATABASE_SSL === 'auto' && /sslmode=require|\.neon\.tech/.test(env.DATABASE_URL));

  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    ssl: useSsl ? { rejectUnauthorized: true } : undefined,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on('error', (err) => logger.error({ err: err.message }, 'idle pg client error'));

  return {
    query: (text, params) => pool.query(text, params),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({ query: (t, p) => client.query(t, p) });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
