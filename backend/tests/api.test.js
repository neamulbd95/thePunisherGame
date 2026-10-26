import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import { createTestDb, resetDb, buildApp, loginAs, nick, playGame, makeRun, makeCleared, ageSession, grantScore, CSRF } from './helpers.js';

let db;
let app;

beforeAll(async () => {
  db = await createTestDb();
  app = buildApp(db);
}, 60_000);
afterAll(() => db.close());
beforeEach(() => resetDb(db));

const count = async (table) => (await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;

describe('health & plumbing', () => {
  it('live and ready', async () => {
    expect((await request(app).get('/api/health/live')).status).toBe(200);
    const ready = await request(app).get('/api/health/ready');
    expect(ready.status).toBe(200);
    expect(ready.body).toMatchObject({ success: true, error: null });
  });

  it('readiness reports 503 (without leaking details) when the database is down', async () => {
    const broken = { ...db, query: async () => { throw Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:5432'), { code: 'ECONNREFUSED' }); } };
    const res = await request(buildApp(broken)).get('/api/health/ready');
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toMatch(/10\.0\.0\.1|ECONNREFUSED/);
  });

  it('turns a database outage on a normal route into a clean 503', async () => {
    const broken = { ...db, query: async () => { throw Object.assign(new Error('secret sql detail'), { code: 'ECONNREFUSED' }); }, tx: async () => { throw new Error('x'); } };
    const res = await request(buildApp(broken)).get('/api/v1/leaderboards/global');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toContain('secret sql detail');
  });

  it('unknown routes use the JSON error envelope', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  it('rejects mutations without the CSRF header and from foreign origins', async () => {
    const noHeader = await request(app).post('/api/v1/auth/logout');
    expect(noHeader.status).toBe(403);
    const evil = await request(app).post('/api/v1/auth/logout').set('X-Requested-With', 'fetch').set('Origin', 'https://evil.example');
    expect(evil.status).toBe(403);
  });

  it('only allows CORS for configured origins', async () => {
    const good = await request(app).get('/api/health/live').set('Origin', 'http://localhost:5500');
    expect(good.headers['access-control-allow-origin']).toBe('http://localhost:5500');
    expect(good.headers['access-control-allow-credentials']).toBe('true');
    const bad = await request(app).get('/api/health/live').set('Origin', 'https://evil.example');
    expect(bad.status).toBe(403);
  });

  it('sets security headers', async () => {
    const res = await request(app).get('/api/health/live');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('rejects oversized bodies', async () => {
    const res = await request(app).post('/api/v1/auth/register').set(CSRF).send({ nickname: 'x'.repeat(200_000) });
    expect(res.status).toBe(413);
  });
});

describe('players: nickname#tag, device session and recovery code', () => {
  const register = (nickname, a = app) => request(a).post('/api/v1/auth/register').set(CSRF).send({ nickname });
  const sha = (x) => crypto.createHash('sha256').update(x).digest('hex');

  it('rejects unauthenticated access', async () => {
    for (const [m, p] of [['get', '/api/v1/players/me'], ['get', '/api/v1/auth/me'], ['post', '/api/v1/game-sessions'], ['get', '/api/v1/friends']]) {
      const res = await request(app)[m](p).set(CSRF).send({});
      expect(res.status, p).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('creates a player with a #tag, a year-long HttpOnly device cookie and a one-time recovery code', async () => {
    const res = await register('Rahim');
    expect(res.status).toBe(201);
    const { player, recoveryCode } = res.body.data;
    expect(player.displayName).toMatch(/^Rahim#\d{4}$/);
    expect(player).toMatchObject({ nickname: 'Rahim', avatarUrl: null });
    expect(recoveryCode).toMatch(/^([A-Z2-9]{4}-){4}[A-Z2-9]{4}$/);

    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const expires = new Date(/Expires=([^;]+)/i.exec(cookie)[1]).getTime();
    expect(expires - Date.now()).toBeGreaterThan(300 * 24 * 3600 * 1000); // "tracked by device": about a year

    // the recovery code is stored only as a hash and is not echoed again
    const row = (await db.query('SELECT display_name, nickname, tag, recovery_hash FROM players')).rows[0];
    expect(row.display_name).toBe(player.displayName);
    expect(row.recovery_hash).toBe(sha(recoveryCode.replace(/-/g, '')));
    expect(row.recovery_hash).not.toContain(recoveryCode);
    const me = await request.agent(app).get('/api/v1/auth/me');
    expect(me.status).toBe(401); // a different browser is not that player
  });

  it('the same nickname can exist many times: only the #tag differs (case-insensitively unique)', async () => {
    const handles = new Set();
    for (let i = 0; i < 25; i++) handles.add((await register(i % 2 ? 'rahim' : 'RAHIM')).body.data.player.displayName.toLowerCase());
    expect(handles.size).toBe(25);
    expect(await count('players')).toBe(25);
  });

  it('stores only a hash of the session token and keeps the player logged in across requests', async () => {
    const { agent, res, player } = await loginAs(app, 'k1', 'Rahim');
    const token = /game_session=([^;]+)/.exec(res.headers['set-cookie'][0])[1];
    const rows = (await db.query('SELECT token_hash FROM auth_sessions')).rows;
    expect(rows[0].token_hash).not.toBe(token);
    expect(rows[0].token_hash).toBe(sha(decodeURIComponent(token)));
    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.player.id).toBe(player.id);
  });

  it('accepts Bengali nicknames and rejects bad ones', async () => {
    expect((await register('নীরব_প্রতিবাদ')).status).toBe(201);
    for (const bad of ['ab', 'x'.repeat(17), 'two words', 'with#hash', '<script>', 'a/b', '   ']) {
      const r = await register(bad);
      expect(r.status, bad).toBe(422);
    }
    for (const bad of ['Admin', 'M0derator', 'banglapunisher', 'F_u_c_k', 'sh1t', 'xX_Hitler_Xx', 'RAPIST']) {
      const r = await register(bad);
      expect(r.status, bad).toBe(422);
      expect(r.body.error.details[0].field).toBe('nickname');
    }
    expect((await register('Punisher')).status).toBe(201); // ordinary words are fine
    expect((await request(app).post('/api/v1/auth/register').set(CSRF).send({ nickname: 'Okname', playerId: 'x' })).status).toBe(422);
    expect((await request(app).post('/api/v1/auth/register').send({ nickname: 'Okname' })).status).toBe(403); // CSRF header required
  });

  it('logout revokes the session server-side', async () => {
    const { agent, res } = await loginAs(app, 'k1', 'Rahim');
    const cookie = res.headers['set-cookie'][0].split(';')[0];
    expect((await agent.post('/api/v1/auth/logout').set(CSRF)).status).toBe(200);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookie)).status).toBe(401); // replaying the old cookie fails too
  });

  it('rejects expired sessions', async () => {
    const { agent } = await loginAs(app, 'k1', 'Rahim');
    await db.query(`UPDATE auth_sessions SET created_at = now() - interval '2 days', expires_at = now() - interval '1 day'`);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('recovery: nickname#tag + code restores the same player on another browser', async () => {
    const first = await loginAs(app, 'k1', 'Rahim');
    await playGame(db, first.agent); // some progress to carry over
    const other = request.agent(app);
    const sloppy = first.recoveryCode.toLowerCase().replace(/-/g, ' '); // however the player typed it
    const res = await other.post('/api/v1/auth/recover').set(CSRF).send({ handle: first.player.displayName.toLowerCase(), recoveryCode: sloppy });
    expect(res.status).toBe(200);
    expect(res.body.data.player.id).toBe(first.player.id);
    expect((await other.get('/api/v1/auth/me')).body.data.player.id).toBe(first.player.id);
    expect((await other.get('/api/v1/players/me/stats')).body.data.gamesPlayed).toBe(1);
    expect(await count('players')).toBe(1);
  });

  it('recovery fails with one identical answer for a wrong code, an unknown name and a malformed name', async () => {
    const a = await loginAs(app, 'k1', 'Rahim');
    const attempt = (handle, recoveryCode) => request(app).post('/api/v1/auth/recover').set(CSRF).send({ handle, recoveryCode });
    const wrongCode = await attempt(a.player.displayName, 'AAAA-BBBB-CCCC-DDDD-EEEE');
    const unknown = await attempt('Nobody#0001', a.recoveryCode);
    const malformed = await attempt('Rahim', a.recoveryCode);
    for (const r of [wrongCode, unknown, malformed]) expect(r.status).toBe(401);
    expect(new Set([wrongCode, unknown, malformed].map((r) => r.body.error.message)).size).toBe(1);
    expect((await request(app).post('/api/v1/auth/recover').send({ handle: a.player.displayName, recoveryCode: a.recoveryCode })).status).toBe(403);
  });

  it('a new recovery code replaces the old one', async () => {
    const a = await loginAs(app, 'k1', 'Rahim');
    const fresh = await a.agent.post('/api/v1/auth/recovery-code').set(CSRF);
    expect(fresh.status).toBe(200);
    const code = fresh.body.data.recoveryCode;
    expect(code).toMatch(/^([A-Z2-9]{4}-){4}[A-Z2-9]{4}$/);
    const attempt = (c) => request(app).post('/api/v1/auth/recover').set(CSRF).send({ handle: a.player.displayName, recoveryCode: c });
    expect((await attempt(a.recoveryCode)).status).toBe(401);
    expect((await attempt(code)).status).toBe(200);
    expect((await request(app).post('/api/v1/auth/recovery-code').set(CSRF)).status).toBe(401); // needs a session
  });

  it('rate limits sign-ups', async () => {
    const limited = buildApp(db, { rateLimits: true });
    let last;
    for (let i = 0; i < 31; i++) last = await register('Spammer', limited);
    expect(last.status).toBe(429);
    expect(last.body.error.code).toBe('RATE_LIMITED');
  });

  it('changing the nickname assigns a new #tag; a case change keeps the tag; the same checks apply', async () => {
    const { agent, player } = await loginAs(app, 'k1', 'Rahim');
    const renamed = await agent.patch('/api/v1/players/me').set(CSRF).send({ nickname: 'নীরব' + '_প্রতিবাদ' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.player.displayName).toMatch(/^নীরব_প্রতিবাদ#\d{4}$/);
    const case1 = await agent.patch('/api/v1/players/me').set(CSRF).send({ nickname: 'Hero' });
    const case2 = await agent.patch('/api/v1/players/me').set(CSRF).send({ nickname: 'HERO' });
    expect(case2.body.data.player.tag).toBe(case1.body.data.player.tag);
    expect(case2.body.data.player.displayName).toBe(`HERO#${String(case1.body.data.player.tag).padStart(4, '0')}`);
    expect(case2.body.data.player.id).toBe(player.id);
    expect((await agent.patch('/api/v1/players/me').set(CSRF).send({ nickname: 'shit' })).status).toBe(422);
    expect((await agent.patch('/api/v1/players/me').set(CSRF).send({ displayName: 'Old' })).status).toBe(422);
  });
});

describe('game sessions & score submission', () => {
  it('accepts a valid run and ranks it', async () => {
    const { agent } = await loginAs(app, 'fb-1');
    const { start, done, score } = await playGame(db, agent);
    expect(start.status).toBe(201);
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ score, allTimeRank: 1, personalBest: true });
    expect((await db.query(`SELECT status FROM game_sessions`)).rows[0].status).toBe('completed');
  });

  it('rejects a second submission for the same session', async () => {
    const { agent } = await loginAs(app, 'fb-1');
    const { start, score } = await playGame(db, agent);
    const { rounds } = makeRun();
    const again = await agent.post(`/api/v1/game-sessions/${start.body.data.sessionId}/complete`).set(CSRF).send({ villain: 'robber', score, rounds });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_SUBMITTED');
    expect(await count('game_scores')).toBe(1);
  });

  it('serialises concurrent double submits into a single score', async () => {
    const { agent } = await loginAs(app, 'fb-1');
    const start = await agent.post('/api/v1/game-sessions').set(CSRF).send({ villain: 'robber' });
    const id = start.body.data.sessionId;
    await ageSession(db, id);
    const { rounds, score } = makeRun();
    const send = () => agent.post(`/api/v1/game-sessions/${id}/complete`).set(CSRF).send({ villain: 'robber', score, rounds });
    const results = await Promise.all([send(), send()]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await count('game_scores')).toBe(1);
  });

  it("hides other players' sessions", async () => {
    const a = await loginAs(app, 'fb-a');
    const b = await loginAs(app, 'fb-b');
    const start = await a.agent.post('/api/v1/game-sessions').set(CSRF).send({ villain: 'robber' });
    const { rounds, score } = makeRun();
    await ageSession(db, start.body.data.sessionId);
    const steal = await b.agent.post(`/api/v1/game-sessions/${start.body.data.sessionId}/complete`).set(CSRF).send({ villain: 'robber', score, rounds });
    expect(steal.status).toBe(404);
    expect(await count('game_scores')).toBe(0);
  });

  it('rejects tampered scores, logs a rejected row and keeps them off the leaderboard', async () => {
    const { agent } = await loginAs(app, 'fb-1');
    const start = await agent.post('/api/v1/game-sessions').set(CSRF).send({ villain: 'robber' });
    const id = start.body.data.sessionId;
    await ageSession(db, id);
    const { rounds, score } = makeRun();
    const res = await agent.post(`/api/v1/game-sessions/${id}/complete`).set(CSRF).send({ villain: 'robber', score: score + 5000, rounds });
    expect(res.status).toBe(422);
    expect(res.body.error.details.reason).toBe('score_mismatch');
    const row = (await db.query('SELECT validation_status, rejection_reason, score FROM game_scores')).rows[0];
    expect(row).toMatchObject({ validation_status: 'rejected', rejection_reason: 'score_mismatch', score: 0 });
    expect((await request(app).get('/api/v1/leaderboards/global')).body.data.players).toHaveLength(0);
    // A rejected session cannot be retried with a corrected payload.
    const retry = await agent.post(`/api/v1/game-sessions/${id}/complete`).set(CSRF).send({ villain: 'robber', score, rounds });
    expect(retry.status).toBe(409);
  });

  it('rejects impossibly fast runs and villain mismatches', async () => {
    const { agent } = await loginAs(app, 'fb-1');
    const { rounds, score } = makeRun();
    const fast = await agent.post('/api/v1/game-sessions').set(CSRF).send({ villain: 'robber' });
    const r1 = await agent.post(`/api/v1/game-sessions/${fast.body.data.sessionId}/complete`).set(CSRF).send({ villain: 'robber', score, rounds });
    expect(r1.body.error.details.reason).toBe('too_fast');

    const other = await agent.post('/api/v1/game-sessions').set(CSRF).send({ villain: 'robber' });
    await ageSession(db, other.body.data.sessionId);
    const r2 = await agent.post(`/api/v1/game-sessions/${other.body.data.sessionId}/complete`).set(CSRF).send({ villain: 'rapist', score, rounds });
    expect(r2.body.error.details.reason).toBe('villain_mismatch');
  });

  it('validates payload shape and ignores any client-supplied identity', async () => {
    const { agent } = await loginAs(app, 'fb-1');
    expect((await agent.post('/api/v1/game-sessions').set(CSRF).send({ villain: 'nobody' })).status).toBe(422);
    const start = await agent.post('/api/v1/game-sessions').set(CSRF).send({ villain: 'robber' });
    const { rounds, score } = makeRun();
    const res = await agent.post(`/api/v1/game-sessions/${start.body.data.sessionId}/complete`).set(CSRF).send({ villain: 'robber', score, rounds, playerId: 'someone-else' });
    expect(res.status).toBe(422);
    expect((await agent.post('/api/v1/game-sessions/not-a-uuid/complete').set(CSRF).send({})).status).toBe(422);
  });
});

describe('stages, clock and time bonus', () => {
  it('stores a cleared game with its time bonus', async () => {
    const { agent } = await loginAs(app, 'fb-1');
    const run = makeCleared({ timeLeftMs: 21_500 }); // played in ~38.5 s
    const { done } = await playGame(db, agent, { run, elapsedMs: 40_000 });
    expect(done.status).toBe(200);
    expect(done.body.data.score).toBe(run.score);
    const row = (await db.query('SELECT score, rounds, validation_status FROM game_scores')).rows[0];
    expect(row).toMatchObject({ score: run.score, rounds: 15, validation_status: 'accepted' });
  });

  it('rejects a forged time bonus on a cleared game', async () => {
    const { agent } = await loginAs(app, 'fb-1');
    const run = makeCleared({ timeLeftMs: 40_000 }); // claims 20 s of play, but the session is 60 s old
    const { done } = await playGame(db, agent, { run, elapsedMs: 60_000 });
    expect(done.status).toBe(422);
    expect(done.body.error.details.reason).toBe('time_mismatch');
  });

  it('accepts a timeout and ignores any bonus claim', async () => {
    const { agent } = await loginAs(app, 'fb-1');
    const run = makeRun([['L', 'GOOD', 0.5], ['R', 'GOOD', 0.5]], { lives: false });
    const { done } = await playGame(db, agent, { run: { ...run, timeLeftMs: 30_000 }, elapsedMs: 65_000 });
    expect(done.status).toBe(200);
    expect(done.body.data.score).toBe(run.score);
  });

  it('rejects an early "timeout" and unknown end reasons at the schema', async () => {
    const { agent } = await loginAs(app, 'fb-1');
    const run = makeRun([['L', 'GOOD', 0.5]], { lives: false });
    const early = await playGame(db, agent, { run, elapsedMs: 15_000 });
    expect(early.done.body.error.details.reason).toBe('timeout_too_early');
    const start = await agent.post('/api/v1/game-sessions').set(CSRF).send({ villain: 'robber' });
    const bad = await agent.post(`/api/v1/game-sessions/${start.body.data.sessionId}/complete`).set(CSRF).send({ villain: 'robber', score: 0, rounds: [], end: 'quit' });
    expect(bad.status).toBe(422);
  });
});

describe('unlocks: villains, weapons and the bottom kick', () => {
  const start = (agent, body) => agent.post('/api/v1/game-sessions').set(CSRF).send(body);

  it('starts with only the Snatcher and the bare hand', async () => {
    const { agent } = await loginAs(app, 'fb-1');
    expect((await start(agent, { villain: 'robber' })).status).toBe(201);
    const locked = await start(agent, { villain: 'abuser' });
    expect(locked.status).toBe(403);
    expect(locked.body.error.code).toBe('LOCKED');
    expect((await start(agent, { villain: 'rapist' })).status).toBe(403);
    expect((await start(agent, { villain: 'robber', weapon: 'sandal' })).status).toBe(403);
    expect((await start(agent, { villain: 'robber', weapon: 'chainsaw' })).status).toBe(422);
  });

  it('unlocks follow the verified total score', async () => {
    const { agent, player } = await loginAs(app, 'fb-1');
    await grantScore(db, player.id, 'robber', 2000);
    expect((await start(agent, { villain: 'abuser', weapon: 'sandal' })).status).toBe(201); // total 2000: Abuser and sandal
    expect((await start(agent, { villain: 'robber', weapon: 'broom' })).status).toBe(403); // broom needs 3000
    expect((await start(agent, { villain: 'rapist' })).status).toBe(403); // needs 5000
    expect((await start(agent, { villain: 'robber', weapon: 'bamboo' })).status).toBe(403); // needs 6000
    await grantScore(db, player.id, 'abuser', 4000); // total 6000
    expect((await start(agent, { villain: 'rapist', weapon: 'bamboo' })).status).toBe(201);
  });

  it('exposes progress for the client', async () => {
    const { agent, player } = await loginAs(app, 'fb-1');
    await grantScore(db, player.id, 'robber', 1600);
    const res = await agent.get('/api/v1/players/me/progress');
    expect(res.body.data).toMatchObject({
      totalScore: 1600,
      villainScores: { robber: 1600, abuser: 0, rapist: 0 },
      unlocked: { villains: ['robber'], weapons: ['hand', 'sandal'], kick: ['robber'] },
    });
    expect((await request(app).get('/api/v1/players/me/progress')).status).toBe(401);
  });

  it('scores with the weapon the session was started with', async () => {
    const { agent, player } = await loginAs(app, 'fb-1');
    await grantScore(db, player.id, 'robber', 1000);
    const run = makeRun([['L', 'GOOD', 1], ['R', 'GOOD', 1]], { weapon: 'sandal' });
    const { done } = await playGame(db, agent, { weapon: 'sandal', run });
    expect(done.status).toBe(200);
    // the same log is NOT valid for a session started with the bare hand (the client lied about its weapon)
    const lie = await playGame(db, agent, { weapon: 'hand', run });
    expect(lie.done.status).toBe(422);
    expect(lie.done.body.error.details.reason).toBe('score_mismatch');
  });

  it('the bottom kick is rejected until that villain has 1,500 points', async () => {
    const { agent, player } = await loginAs(app, 'fb-1');
    const kick = makeRun([['B', 'GOOD', 0.8], ['L', 'GOOD', 0.8]]);
    const early = await playGame(db, agent, { run: kick });
    expect(early.done.status).toBe(422);
    expect(early.done.body.error.details.reason).toBe('locked_area');
    await grantScore(db, player.id, 'robber', 1500);
    const ok = await playGame(db, agent, { run: kick });
    expect(ok.done.status).toBe(200);
    expect(ok.done.body.data.score).toBe(kick.score);
  });

  it('the kick unlock is per villain', async () => {
    const { agent, player } = await loginAs(app, 'fb-1');
    await grantScore(db, player.id, 'robber', 2600); // unlocks the Abuser, but his own kick needs 1,500 points against him
    const kick = makeRun([['B', 'GOOD', 0.8]]);
    const res = await playGame(db, agent, { villain: 'abuser', run: kick });
    expect(res.done.body.error.details.reason).toBe('locked_area');
  });
});

describe('global leaderboard', () => {
  it('ranks best score per player with deterministic tie-breaking', async () => {
    const a = await loginAs(app, 'fb-a', 'Aaa');
    const b = await loginAs(app, 'fb-b', 'Bbb');
    const c = await loginAs(app, 'fb-c', 'Ccc');
    const high = [['S', 'PERFECT', 1], ['S', 'PERFECT', 1]];
    const low = [['L', 'GOOD', 0.5]];
    await playGame(db, a.agent, { spec: low });
    await playGame(db, a.agent, { spec: high }); // a's best is the second game
    await playGame(db, b.agent, { spec: high }); // ties with a, but submitted later
    await playGame(db, c.agent, { spec: low });

    const res = await a.agent.get('/api/v1/leaderboards/global');
    expect(res.status).toBe(200);
    const names = res.body.data.players.map((p) => nick(p.displayName));
    expect(names).toEqual(['Aaa', 'Bbb', 'Ccc']);
    expect(res.body.data.players.map((p) => p.rank)).toEqual([1, 2, 3]);
    expect(res.body.data).toMatchObject({ period: 'all-time', totalPlayers: 3, myRank: 1 });
    expect(res.body.data.players[0].isMe).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/friend_?code|recovery|session|token/i);

    const guest = await request(app).get('/api/v1/leaderboards/global');
    expect(guest.body.data.myRank).toBeNull();
  });

  it('paginates and filters by villain', async () => {
    const a = await loginAs(app, 'fb-a', 'Aaa');
    const b = await loginAs(app, 'fb-b', 'Bbb');
    await grantScore(db, a.player.id, 'rapist', 2500); // unlocks the Child Abuser without touching the robber board
    await playGame(db, a.agent, { villain: 'abuser', spec: [['S', 'PERFECT', 1]] });
    await playGame(db, b.agent, { villain: 'robber', spec: [['L', 'GOOD', 0.5]] });
    const page2 = await request(app).get('/api/v1/leaderboards/global?limit=1&offset=1');
    expect(page2.body.data.players).toHaveLength(1);
    expect(page2.body.data.players[0].rank).toBe(2);
    const robber = await request(app).get('/api/v1/leaderboards/global?villain=robber');
    expect(robber.body.data.players.map((p) => nick(p.displayName))).toEqual(['Bbb']);
    expect((await request(app).get('/api/v1/leaderboards/global?limit=1000')).status).toBe(422);
    expect((await request(app).get('/api/v1/leaderboards/global?period=yearly')).status).toBe(422);
  });

  it('respects daily / weekly / monthly windows by submission time', async () => {
    const a = await loginAs(app, 'fb-a', 'Aaa');
    const b = await loginAs(app, 'fb-b', 'Bbb');
    const c = await loginAs(app, 'fb-c', 'Ccc');
    await playGame(db, a.agent);
    await playGame(db, b.agent);
    await playGame(db, c.agent);
    // push b back 3 days, c back 40 days
    const ids = (await db.query('SELECT id, player_id FROM game_scores')).rows;
    const byPlayer = Object.fromEntries((await db.query('SELECT id, nickname FROM players')).rows.map((p) => [p.nickname, p.id]));
    await db.query(`UPDATE game_scores SET submitted_at = now() - interval '3 days' WHERE player_id = $1`, [byPlayer.Bbb]);
    await db.query(`UPDATE game_scores SET submitted_at = now() - interval '40 days' WHERE player_id = $1`, [byPlayer.Ccc]);
    expect(ids).toHaveLength(3);

    const total = async (period) => (await request(app).get(`/api/v1/leaderboards/global?period=${period}`)).body.data.totalPlayers;
    expect(await total('all-time')).toBe(3);
    expect(await total('monthly')).toBeGreaterThanOrEqual(1);
    expect(await total('monthly')).toBeLessThanOrEqual(2);
    expect(await total('daily')).toBe(1);
  });
});

describe('in-game friends', () => {
  it('request / accept / leaderboard / remove', async () => {
    const a = await loginAs(app, 'fb-a', 'Aaa');
    const b = await loginAs(app, 'fb-b', 'Bbb');
    const c = await loginAs(app, 'fb-c', 'Ccc');
    await playGame(db, a.agent);
    await playGame(db, b.agent);
    await playGame(db, c.agent);

    const sent = await a.agent.post('/api/v1/friends/requests').set(CSRF).send({ friendCode: b.player.friendCode.toLowerCase() });
    expect(sent.status).toBe(201);
    expect((await a.agent.post('/api/v1/friends/requests').set(CSRF).send({ friendCode: b.player.friendCode })).status).toBe(409);

    const incoming = await b.agent.get('/api/v1/friends/requests');
    expect(incoming.body.data.requests[0]).toMatchObject({ direction: 'incoming', displayName: a.player.displayName });
    // the requester cannot accept their own request, and strangers cannot either
    expect((await a.agent.post(`/api/v1/friends/requests/${sent.body.data.id}/accept`).set(CSRF)).status).toBe(404);
    expect((await c.agent.post(`/api/v1/friends/requests/${sent.body.data.id}/accept`).set(CSRF)).status).toBe(404);
    expect((await b.agent.post(`/api/v1/friends/requests/${sent.body.data.id}/accept`).set(CSRF)).status).toBe(200);

    const board = await a.agent.get('/api/v1/leaderboards/game-friends');
    expect(board.body.data.players.map((p) => nick(p.displayName)).sort()).toEqual(['Aaa', 'Bbb']);
    expect((await c.agent.get('/api/v1/leaderboards/game-friends')).body.data.players.map((p) => nick(p.displayName))).toEqual(['Ccc']);

    const list = await a.agent.get('/api/v1/friends');
    expect(list.body.data.friends).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain(b.player.friendCode);
    expect((await b.agent.delete(`/api/v1/friends/${list.body.data.friends[0].friendshipId}`).set(CSRF)).status).toBe(200);
    expect((await a.agent.get('/api/v1/friends')).body.data.friends).toHaveLength(0);
  });

  it('rejects self requests, unknown codes and reverse duplicates; supports reject', async () => {
    const a = await loginAs(app, 'fb-a', 'Aaa');
    const b = await loginAs(app, 'fb-b', 'Bbb');
    expect((await a.agent.post('/api/v1/friends/requests').set(CSRF).send({ friendCode: a.player.friendCode })).status).toBe(400);
    expect((await a.agent.post('/api/v1/friends/requests').set(CSRF).send({ friendCode: 'ZZZZZZZZ' })).status).toBe(404);
    expect((await a.agent.post('/api/v1/friends/requests').set(CSRF).send({ friendCode: 'bad code!' })).status).toBe(422);

    const sent = await a.agent.post('/api/v1/friends/requests').set(CSRF).send({ friendCode: b.player.friendCode });
    expect((await b.agent.post(`/api/v1/friends/requests/${sent.body.data.id}/reject`).set(CSRF)).status).toBe(200);
    expect(await count('player_friendships')).toBe(0);

    // B adds A first, then A adds B back: this accepts instead of creating a duplicate pair.
    await b.agent.post('/api/v1/friends/requests').set(CSRF).send({ friendCode: a.player.friendCode });
    const back = await a.agent.post('/api/v1/friends/requests').set(CSRF).send({ friendCode: b.player.friendCode });
    expect(back.body.data.status).toBe('accepted');
    expect(await count('player_friendships')).toBe(1);
  });

  it('requires login for friend boards', async () => {
    expect((await request(app).get('/api/v1/leaderboards/game-friends')).status).toBe(401);
  });
});

describe('account deletion', () => {
  it('DELETE /players/me removes everything about the player', async () => {
    const a = await loginAs(app, 'k1', 'Aaa');
    const b = await loginAs(app, 'k2', 'Bbb');
    await playGame(db, a.agent);
    await a.agent.post('/api/v1/friends/requests').set(CSRF).send({ friendCode: b.player.friendCode });
    expect((await a.agent.delete('/api/v1/players/me').set(CSRF)).status).toBe(200);
    for (const t of ['game_scores', 'game_sessions', 'auth_sessions', 'player_friendships']) {
      const n = (await db.query(`SELECT count(*)::int AS n FROM ${t} WHERE player_id = $1`, [a.player.id])).rows[0].n;
      expect(n, t).toBe(0);
    }
    expect((await a.agent.get('/api/v1/auth/me')).status).toBe(401);
    // the recovery code is gone with the account
    expect((await request(app).post('/api/v1/auth/recover').set(CSRF).send({ handle: a.player.displayName, recoveryCode: a.recoveryCode })).status).toBe(401);
    expect(await count('players')).toBe(1);
  });
});

describe('share page (Facebook preview)', () => {
  const FB_BOT = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uagent.php)';

  async function savedScore() {
    const a = await loginAs(app, 'k1', 'Aaa');
    const { done } = await playGame(db, a.agent);
    return { a, scoreId: done.body.data.scoreId, score: done.body.data.score };
  }

  it('serves Open Graph tags to the Facebook crawler (nickname#tag, score, villain, image)', async () => {
    const { a, scoreId, score } = await savedScore();
    const res = await request(app).get(`/api/v1/share/score/${scoreId}`).set('User-Agent', FB_BOT);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain(`<meta property="og:title" content="${a.player.displayName.replace('#', '#')} scored ${score.toLocaleString('en-US')} against the Snatcher – Bangla Punisher">`);
    expect(res.text).toContain('og:image" content="http://localhost:5500/assets/og.png"');
    expect(res.text).toContain('og:site_name');
    expect(res.text).not.toMatch(/recovery|session|token|friend/i);
  });

  it('sends people straight to the game', async () => {
    const { scoreId } = await savedScore();
    const res = await request(app).get(`/api/v1/share/score/${scoreId}`).set('User-Agent', 'Mozilla/5.0 (iPhone)');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:5500/?ref=share');
  });

  it('shows nothing for unknown, malformed or rejected scores', async () => {
    const a = await loginAs(app, 'k1', 'Aaa');
    const start = await a.agent.post('/api/v1/game-sessions').set(CSRF).send({ villain: 'robber' });
    await ageSession(db, start.body.data.sessionId);
    const { rounds, score } = makeRun();
    await a.agent.post(`/api/v1/game-sessions/${start.body.data.sessionId}/complete`).set(CSRF).send({ villain: 'robber', score: score + 9, rounds });
    const rejected = (await db.query("SELECT id FROM game_scores WHERE validation_status = 'rejected'")).rows[0].id;
    expect((await request(app).get(`/api/v1/share/score/${rejected}`).set('User-Agent', FB_BOT)).status).toBe(404);
    expect((await request(app).get('/api/v1/share/score/3b241101-e2bb-4255-8caf-4136c566a962').set('User-Agent', FB_BOT)).status).toBe(404);
    expect((await request(app).get('/api/v1/share/score/not-a-uuid').set('User-Agent', FB_BOT)).status).toBe(422);
  });
});

describe('database integrity', () => {
  it('has idempotent migrations', async () => {
    const { runMigrations } = await import('../src/utils/migrate.js');
    expect(await runMigrations(db)).toEqual([]);
    expect((await db.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name)).toContain('001_init.sql');
  });

  it('enforces constraints independently of application code', async () => {
    const { player: a } = await loginAs(app, 'fb-a');
    const { player: b } = await loginAs(app, 'fb-b');
    await expect(db.query('INSERT INTO player_friendships (player_id, friend_player_id) VALUES ($1, $1)', [a.id])).rejects.toThrow();
    await db.query('INSERT INTO player_friendships (player_id, friend_player_id) VALUES ($1, $2)', [a.id, b.id]);
    await expect(db.query('INSERT INTO player_friendships (player_id, friend_player_id) VALUES ($1, $2)', [b.id, a.id])).rejects.toThrow();
    const s = (await db.query(`INSERT INTO game_sessions (player_id, villain) VALUES ($1, 'abuser') RETURNING id`, [a.id])).rows[0].id;
    const ins = () => db.query(`INSERT INTO game_scores (player_id, game_session_id, villain, score, validation_status) VALUES ($1, $2, 'abuser', 10, 'accepted')`, [a.id, s]);
    await ins();
    await expect(ins()).rejects.toThrow();
    await expect(db.query(`INSERT INTO game_scores (player_id, game_session_id, villain, score, validation_status) VALUES ($1, gen_random_uuid(), 'abuser', -1, 'accepted')`, [a.id])).rejects.toThrow();
  });

  it('enforces unique nickname#tag (case-insensitive) and the nickname/tag pair', async () => {
    await db.query("INSERT INTO players (display_name, nickname, tag, friend_code) VALUES ('Rahim#0001', 'Rahim', 1, 'AAAAAAAA')");
    await expect(db.query("INSERT INTO players (display_name, nickname, tag, friend_code) VALUES ('rahim#0001', 'RAHIM', 1, 'BBBBBBBB')")).rejects.toThrow();
    await db.query("INSERT INTO players (display_name, nickname, tag, friend_code) VALUES ('Rahim#0002', 'Rahim', 2, 'CCCCCCCC')"); // same name, other tag
    await expect(db.query("INSERT INTO players (display_name, nickname, friend_code) VALUES ('Orphan', 'Orphan', 'DDDDDDDD')")).rejects.toThrow(); // nickname without tag
    await expect(db.query("INSERT INTO players (display_name, nickname, tag, friend_code) VALUES ('X#10000', 'Xyz', 10000, 'EEEEEEEE')")).rejects.toThrow(); // tag out of range
  });
});
