import { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import { parseEnv } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { runMigrations } from '../src/utils/migrate.js';
import { roundScore, timeBonus } from '../src/utils/game-rules.js';

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

/**
 * Builds a legal run and the score the server should compute. By default it ends on lives (three misses).
 * Spec rows are [spot, grade, force] or [spot, 'MISS'].
 */
export function makeRun(spec = [['L', 'GOOD', 0.8], ['S', 'PERFECT', 0.9], ['R', 'GREAT', 0.5]], { lives = true } = {}) {
  const rounds = [];
  let combo = 0;
  let score = 0;
  for (const [spot, grade, force] of spec) {
    if (grade === 'MISS') {
      rounds.push({ spot, grade });
      combo = 0;
      continue;
    }
    rounds.push({ spot, grade, force });
    score += roundScore({ force, grade, spot, combo });
    combo++;
  }
  if (lives) for (let i = 0; i < 3; i++) rounds.push({ spot: 'L', grade: 'MISS' });
  return { rounds, score, end: lives ? 'lives' : 'timeout', timeLeftMs: 0 };
}

/** A run that clears all ten stages with the given time left (score includes the time bonus). */
export function makeCleared({ spec, timeLeftMs = 20_000 } = {}) {
  const rows = spec ?? Array.from({ length: 10 }, (_, i) => [['L', 'R', 'S'][i % 3], i % 4 === 0 ? 'GREAT' : 'GOOD', 0.7]);
  const run = makeRun(rows, { lives: false });
  return { ...run, end: 'cleared', timeLeftMs, score: run.score + timeBonus(timeLeftMs) };
}

/** Pretend the session started long ago so the minimum-duration check passes. */
export const ageSession = (db, id) =>
  db.query(`UPDATE game_sessions SET started_at = now() - interval '1 hour' WHERE id = $1`, [id]);

/** Makes the server believe the session started `ms` ago. */
export const setElapsed = (db, id, ms) =>
  db.query(`UPDATE game_sessions SET started_at = now() - ($2 || ' milliseconds')::interval WHERE id = $1`, [id, String(ms)]);

/** Plays a whole accepted game (ends on lives unless `run` is given) for an agent. */
export async function playGame(db, agent, { villain = 'abuser', spec, run, elapsedMs } = {}) {
  const start = await agent.post('/api/v1/game-sessions').set(CSRF).send({ villain });
  const r = run ?? makeRun(spec);
  if (elapsedMs) await setElapsed(db, start.body.data.sessionId, elapsedMs);
  else await ageSession(db, start.body.data.sessionId);
  const done = await agent
    .post(`/api/v1/game-sessions/${start.body.data.sessionId}/complete`)
    .set(CSRF)
    .send({ villain, score: r.score, rounds: r.rounds, end: r.end, timeLeftMs: r.timeLeftMs });
  return { start, done, score: r.score };
}
