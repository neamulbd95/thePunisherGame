import { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import { parseEnv } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { runMigrations } from '../src/utils/migrate.js';
import { roundScore, timeBonus, STAGES } from '../src/utils/game-rules.js';

export const testEnv = (over = {}) =>
  parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://unused',
    FRONTEND_URL: 'http://localhost:5500',
    API_PUBLIC_URL: 'http://localhost:3000',
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
  await db.query('TRUNCATE players CASCADE');
}

export const silentLogger = { info() {}, warn() {}, error() {}, debug() {} };

export function buildApp(db, { env = testEnv(), rateLimits = false } = {}) {
  return createApp({ env, db, logger: silentLogger, rateLimits });
}

export const CSRF = { 'X-Requested-With': 'fetch', Origin: 'http://localhost:5500' };

/** A new player (nickname + tag + device cookie) behind a supertest agent. `name` is the nickname. */
export async function loginAs(app, key, name) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/register').set(CSRF).send({ nickname: name ?? key });
  if (res.status !== 201) throw new Error(`register failed ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, player: res.body.data.player, res, recoveryCode: res.body.data.recoveryCode };
}

/** "Rahim#0042" -> "Rahim" */
export const nick = (displayName) => displayName.split('#')[0];

/**
 * Builds a legal run and the score the server should compute. By default it ends on lives (three misses).
 * Spec rows are [spot, grade, force] or [spot, 'MISS'].
 */
export function makeRun(spec = [['L', 'GOOD', 0.8], ['S', 'PERFECT', 0.9], ['R', 'GREAT', 0.5]], { lives = true, weapon = 'hand' } = {}) {
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
    score += roundScore({ force, grade, spot, combo, weapon });
    combo++;
  }
  if (lives) for (let i = 0; i < 3; i++) rounds.push({ spot: 'L', grade: 'MISS' });
  return { rounds, score, end: lives ? 'lives' : 'timeout', timeLeftMs: 0 };
}

/** A run that clears all stages with the given time left (score includes the time bonus). */
export function makeCleared({ spec, timeLeftMs = 20_000, weapon = 'hand' } = {}) {
  const rows = spec ?? Array.from({ length: STAGES }, (_, i) => [['L', 'R', 'S'][i % 3], i % 4 === 0 ? 'GREAT' : 'GOOD', 0.7]);
  const run = makeRun(rows, { lives: false, weapon });
  return { ...run, end: 'cleared', timeLeftMs, score: run.score + timeBonus(timeLeftMs) };
}

/** Pretend the session started long ago so the minimum-duration check passes. */
export const ageSession = (db, id) =>
  db.query(`UPDATE game_sessions SET started_at = now() - interval '1 hour' WHERE id = $1`, [id]);

/** Makes the server believe the session started `ms` ago. */
export const setElapsed = (db, id, ms) =>
  db.query(`UPDATE game_sessions SET started_at = now() - ($2 || ' milliseconds')::interval WHERE id = $1`, [id, String(ms)]);

/** Gives a player verified score on a villain, which unlocks villains, weapons and the kick (no gameplay needed). */
export async function grantScore(db, playerId, villain, score) {
  const s = (await db.query(`INSERT INTO game_sessions (player_id, villain, status, completed_at) VALUES ($1, $2, 'completed', now()) RETURNING id`, [playerId, villain])).rows[0].id;
  await db.query(
    `INSERT INTO game_scores (player_id, game_session_id, villain, score, rounds, perfects, duration_ms, validation_status) VALUES ($1, $2, $3, $4, 3, 0, 30000, 'accepted')`,
    [playerId, s, villain, score],
  );
}

/** Plays a whole accepted game (ends on lives unless `run` is given) for an agent. */
export async function playGame(db, agent, { villain = 'robber', weapon = 'hand', spec, run, elapsedMs } = {}) {
  const start = await agent.post('/api/v1/game-sessions').set(CSRF).send({ villain, weapon });
  const r = run ?? makeRun(spec, { weapon });
  if (elapsedMs) await setElapsed(db, start.body.data.sessionId, elapsedMs);
  else await ageSession(db, start.body.data.sessionId);
  const done = await agent
    .post(`/api/v1/game-sessions/${start.body.data.sessionId}/complete`)
    .set(CSRF)
    .send({ villain, score: r.score, rounds: r.rounds, end: r.end, timeLeftMs: r.timeLeftMs });
  return { start, done, score: r.score };
}
