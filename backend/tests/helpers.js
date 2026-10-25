import { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import { parseEnv } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { runMigrations } from '../src/utils/migrate.js';
import { roundScore } from '../src/utils/game-rules.js';

export const testEnv = (over = {}) =>
  parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://unused',
    FRONTEND_URL: 'http://localhost:5500',
    API_PUBLIC_URL: 'http://localhost:3000',
    FACEBOOK_APP_ID: '123456',
    FACEBOOK_APP_SECRET: 'test-secret',
    FACEBOOK_MOCK: 'true',
    LOG_LEVEL: 'silent',
    ...over,
  });

/** Wraps in-process PostgreSQL (PGlite) in the { query, tx } shape the app expects. */
export async function createTestDb() {
  const pg = new PGlite();
  const wrap = (c) => ({
    async query(text, params) {
      // node-postgres runs multi-statement text (migrations) when there are no parameters; PGlite needs exec() for that.
      if (!params || params.length === 0) {
        const results = await c.exec(text);
        const last = results[results.length - 1] ?? { rows: [] };
        return { rows: last.rows, rowCount: last.affectedRows ?? last.rows.length };
      }
      const r = await c.query(text, params);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
  });
  const db = {
    ...wrap(pg),
    tx: (fn) => pg.transaction((t) => fn(wrap(t))),
    close: () => pg.close(),
    raw: pg,
  };
  await runMigrations(db);
  return db;
}

export async function resetDb(db) {
  await db.query('TRUNCATE players, data_deletion_requests CASCADE');
}

export const silentLogger = { info() {}, warn() {}, error() {}, debug() {} };

export function buildApp(db, { env = testEnv(), facebook, rateLimits = false } = {}) {
  return createApp({ env, db, logger: silentLogger, facebook, rateLimits });
}

export const CSRF = { 'X-Requested-With': 'fetch', Origin: 'http://localhost:5500' };

/** A logged-in supertest agent (cookie jar) for a mock Facebook user. */
export async function loginAs(app, fbId, name = fbId, extra = '') {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/facebook').set(CSRF).send({ accessToken: `mock:${fbId}:${name}${extra}` });
  if (res.status !== 200) throw new Error(`login failed ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, player: res.body.data.player, res };
}

/** Builds a legal finished run (3 misses at the end) and the score the server should compute. */
export function makeRun(spec = [['L', 'GOOD', 0.8], ['S', 'PERFECT', 0.9], ['R', 'GREAT', 0.5]]) {
  const rounds = [];
  let combo = 0;
  let score = 0;
  for (const [spot, grade, force] of spec) {
    rounds.push({ spot, grade, force });
    score += roundScore({ force, grade, spot, combo });
    combo++;
  }
  for (let i = 0; i < 3; i++) rounds.push({ spot: 'L', grade: 'MISS' });
  return { rounds, score };
}

/** Pretend the session started long ago so the minimum-duration check passes. */
export const ageSession = (db, id) =>
  db.query(`UPDATE game_sessions SET started_at = now() - interval '1 hour' WHERE id = $1`, [id]);

/** Plays a whole accepted game for an agent and returns the score. */
export async function playGame(db, agent, { villain = 'abuser', spec } = {}) {
  const start = await agent.post('/api/v1/game-sessions').set(CSRF).send({ villain });
  const { rounds, score } = makeRun(spec);
  await ageSession(db, start.body.data.sessionId);
  const done = await agent
    .post(`/api/v1/game-sessions/${start.body.data.sessionId}/complete`)
    .set(CSRF)
    .send({ villain, score, rounds });
  return { start, done, score };
}
