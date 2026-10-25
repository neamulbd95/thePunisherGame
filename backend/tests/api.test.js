import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import { createTestDb, resetDb, buildApp, loginAs, playGame, makeRun, makeCleared, ageSession, testEnv, CSRF } from './helpers.js';

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
    const res = await request(app).post('/api/v1/auth/facebook').set(CSRF).send({ accessToken: 'x'.repeat(200_000) });
    expect(res.status).toBe(413);
  });
});

describe('authentication & sessions', () => {
  it('rejects unauthenticated access', async () => {
    for (const [m, p] of [['get', '/api/v1/players/me'], ['get', '/api/v1/auth/me'], ['post', '/api/v1/game-sessions'], ['get', '/api/v1/friends']]) {
      const res = await request(app)[m](p).set(CSRF).send({});
      expect(res.status, p).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('creates a player and a hardened cookie on first login, and does not duplicate on repeat login', async () => {
    const first = await loginAs(app, 'fb-1', 'Rahim');
    const cookie = first.res.headers['set-cookie'][0];
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(first.res.body.data.isNew).toBe(true);
    expect(JSON.stringify(first.res.body)).not.toMatch(/facebook_user_id|token/i);

    const again = await loginAs(app, 'fb-1', 'Rahim');
    expect(again.res.body.data.isNew).toBe(false);
    expect(again.player.id).toBe(first.player.id);
    expect(await count('players')).toBe(1);
    expect(await count('auth_sessions')).toBe(2);
  });

  it('stores only a hash of the session token', async () => {
    const { res } = await loginAs(app, 'fb-1');
    const token = /game_session=([^;]+)/.exec(res.headers['set-cookie'][0])[1];
    const rows = (await db.query('SELECT token_hash FROM auth_sessions')).rows;
    expect(rows[0].token_hash).not.toBe(token);
    expect(rows[0].token_hash).toBe(crypto.createHash('sha256').update(decodeURIComponent(token)).digest('hex'));
  });

  it('GET /auth/me returns the profile; the login persists across requests', async () => {
    const { agent, player } = await loginAs(app, 'fb-1', 'Rahim');
    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.player.id).toBe(player.id);
  });

  it('logout revokes the session server-side', async () => {
    const { agent, res } = await loginAs(app, 'fb-1');
    const cookie = res.headers['set-cookie'][0].split(';')[0];
    expect((await agent.post('/api/v1/auth/logout').set(CSRF)).status).toBe(200);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
    // Replaying the old cookie must fail too.
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('rejects expired sessions', async () => {
    const { agent } = await loginAs(app, 'fb-1');
    await db.query(`UPDATE auth_sessions SET created_at = now() - interval '2 days', expires_at = now() - interval '1 day'`);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('rejects invalid tokens and malformed bodies', async () => {
    const bad = await request(app).post('/api/v1/auth/facebook').set(CSRF).send({ accessToken: 'not-a-valid-mock-token' });
    expect(bad.status).toBe(401);
    const malformed = await request(app).post('/api/v1/auth/facebook').set(CSRF).send({ accessToken: 'short' });
    expect(malformed.status).toBe(422);
    const extra = await request(app).post('/api/v1/auth/facebook').set(CSRF).send({ accessToken: 'mock:1:A', playerId: 'x' });
    expect(extra.status).toBe(422);
  });

  it('rate limits login attempts', async () => {
    const limited = buildApp(db, { rateLimits: true });
    let last;
    for (let i = 0; i < 31; i++) last = await request(limited).post('/api/v1/auth/facebook').set(CSRF).send({ accessToken: 'mock:bad' });
    expect(last.status).toBe(429);
    expect(last.body.error.code).toBe('RATE_LIMITED');
  });

  it('lets players choose a nickname', async () => {
    const { agent } = await loginAs(app, 'fb-1', 'Rahim');
    const ok = await agent.patch('/api/v1/players/me').set(CSRF).send({ displayName: 'নীরব প্রতিবাদ' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.player.displayName).toBe('নীরব প্রতিবাদ');
    expect((await agent.patch('/api/v1/players/me').set(CSRF).send({ displayName: '<script>' })).status).toBe(422);
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
    const again = await agent.post(`/api/v1/game-sessions/${start.body.data.sessionId}/complete`).set(CSRF).send({ villain: 'abuser', score, rounds });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_SUBMITTED');
    expect(await count('game_scores')).toBe(1);
  });

  it('serialises concurrent double submits into a single score', async () => {
    const { agent } = await loginAs(app, 'fb-1');
    const start = await agent.post('/api/v1/game-sessions').set(CSRF).send({ villain: 'abuser' });
    const id = start.body.data.sessionId;
    await ageSession(db, id);
    const { rounds, score } = makeRun();
    const send = () => agent.post(`/api/v1/game-sessions/${id}/complete`).set(CSRF).send({ villain: 'abuser', score, rounds });
    const results = await Promise.all([send(), send()]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await count('game_scores')).toBe(1);
  });

  it("hides other players' sessions", async () => {
    const a = await loginAs(app, 'fb-a');
    const b = await loginAs(app, 'fb-b');
    const start = await a.agent.post('/api/v1/game-sessions').set(CSRF).send({ villain: 'abuser' });
    const { rounds, score } = makeRun();
    await ageSession(db, start.body.data.sessionId);
    const steal = await b.agent.post(`/api/v1/game-sessions/${start.body.data.sessionId}/complete`).set(CSRF).send({ villain: 'abuser', score, rounds });
    expect(steal.status).toBe(404);
    expect(await count('game_scores')).toBe(0);
  });

  it('rejects tampered scores, logs a rejected row and keeps them off the leaderboard', async () => {
    const { agent } = await loginAs(app, 'fb-1');
    const start = await agent.post('/api/v1/game-sessions').set(CSRF).send({ villain: 'abuser' });
    const id = start.body.data.sessionId;
    await ageSession(db, id);
    const { rounds, score } = makeRun();
    const res = await agent.post(`/api/v1/game-sessions/${id}/complete`).set(CSRF).send({ villain: 'abuser', score: score + 5000, rounds });
    expect(res.status).toBe(422);
    expect(res.body.error.details.reason).toBe('score_mismatch');
    const row = (await db.query('SELECT validation_status, rejection_reason, score FROM game_scores')).rows[0];
    expect(row).toMatchObject({ validation_status: 'rejected', rejection_reason: 'score_mismatch', score: 0 });
    expect((await request(app).get('/api/v1/leaderboards/global')).body.data.players).toHaveLength(0);
    // A rejected session cannot be retried with a corrected payload.
    const retry = await agent.post(`/api/v1/game-sessions/${id}/complete`).set(CSRF).send({ villain: 'abuser', score, rounds });
    expect(retry.status).toBe(409);
  });

  it('rejects impossibly fast runs and villain mismatches', async () => {
    const { agent } = await loginAs(app, 'fb-1');
    const { rounds, score } = makeRun();
    const fast = await agent.post('/api/v1/game-sessions').set(CSRF).send({ villain: 'abuser' });
    const r1 = await agent.post(`/api/v1/game-sessions/${fast.body.data.sessionId}/complete`).set(CSRF).send({ villain: 'abuser', score, rounds });
    expect(r1.body.error.details.reason).toBe('too_fast');

    const other = await agent.post('/api/v1/game-sessions').set(CSRF).send({ villain: 'robber' });
    await ageSession(db, other.body.data.sessionId);
    const r2 = await agent.post(`/api/v1/game-sessions/${other.body.data.sessionId}/complete`).set(CSRF).send({ villain: 'abuser', score, rounds });
    expect(r2.body.error.details.reason).toBe('villain_mismatch');
  });

  it('validates payload shape and ignores any client-supplied identity', async () => {
    const { agent } = await loginAs(app, 'fb-1');
    expect((await agent.post('/api/v1/game-sessions').set(CSRF).send({ villain: 'nobody' })).status).toBe(422);
    const start = await agent.post('/api/v1/game-sessions').set(CSRF).send({ villain: 'abuser' });
    const { rounds, score } = makeRun();
    const res = await agent.post(`/api/v1/game-sessions/${start.body.data.sessionId}/complete`).set(CSRF).send({ villain: 'abuser', score, rounds, playerId: 'someone-else' });
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
    expect(row).toMatchObject({ score: run.score, rounds: 10, validation_status: 'accepted' });
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
    const start = await agent.post('/api/v1/game-sessions').set(CSRF).send({ villain: 'abuser' });
    const bad = await agent.post(`/api/v1/game-sessions/${start.body.data.sessionId}/complete`).set(CSRF).send({ villain: 'abuser', score: 0, rounds: [], end: 'quit' });
    expect(bad.status).toBe(422);
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
    const names = res.body.data.players.map((p) => p.displayName.split(' ')[0]);
    expect(names).toEqual(['Aaa', 'Bbb', 'Ccc']);
    expect(res.body.data.players.map((p) => p.rank)).toEqual([1, 2, 3]);
    expect(res.body.data).toMatchObject({ period: 'all-time', totalPlayers: 3, myRank: 1 });
    expect(res.body.data.players[0].isMe).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/friend_?code|facebook/i);

    const guest = await request(app).get('/api/v1/leaderboards/global');
    expect(guest.body.data.myRank).toBeNull();
  });

  it('paginates and filters by villain', async () => {
    const a = await loginAs(app, 'fb-a', 'Aaa');
    const b = await loginAs(app, 'fb-b', 'Bbb');
    await playGame(db, a.agent, { villain: 'abuser', spec: [['S', 'PERFECT', 1]] });
    await playGame(db, b.agent, { villain: 'robber', spec: [['L', 'GOOD', 0.5]] });
    const page2 = await request(app).get('/api/v1/leaderboards/global?limit=1&offset=1');
    expect(page2.body.data.players).toHaveLength(1);
    expect(page2.body.data.players[0].rank).toBe(2);
    const robber = await request(app).get('/api/v1/leaderboards/global?villain=robber');
    expect(robber.body.data.players.map((p) => p.displayName)).toEqual(['Bbb']);
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
    const byPlayer = Object.fromEntries((await db.query('SELECT id, facebook_user_id FROM players')).rows.map((p) => [p.facebook_user_id, p.id]));
    await db.query(`UPDATE game_scores SET submitted_at = now() - interval '3 days' WHERE player_id = $1`, [byPlayer['fb-b']]);
    await db.query(`UPDATE game_scores SET submitted_at = now() - interval '40 days' WHERE player_id = $1`, [byPlayer['fb-c']]);
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
    expect(incoming.body.data.requests[0]).toMatchObject({ direction: 'incoming', displayName: 'Aaa' });
    // the requester cannot accept their own request, and strangers cannot either
    expect((await a.agent.post(`/api/v1/friends/requests/${sent.body.data.id}/accept`).set(CSRF)).status).toBe(404);
    expect((await c.agent.post(`/api/v1/friends/requests/${sent.body.data.id}/accept`).set(CSRF)).status).toBe(404);
    expect((await b.agent.post(`/api/v1/friends/requests/${sent.body.data.id}/accept`).set(CSRF)).status).toBe(200);

    const board = await a.agent.get('/api/v1/leaderboards/game-friends');
    expect(board.body.data.players.map((p) => p.displayName).sort()).toEqual(['Aaa', 'Bbb']);
    expect((await c.agent.get('/api/v1/leaderboards/game-friends')).body.data.players.map((p) => p.displayName)).toEqual(['Ccc']);

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
    expect((await request(app).get('/api/v1/leaderboards/facebook-friends')).status).toBe(401);
  });
});

describe('Facebook friends leaderboard', () => {
  it('reports "unavailable" when user_friends was not granted, and never fakes a list', async () => {
    const a = await loginAs(app, 'fb-a', 'Aaa');
    await playGame(db, a.agent);
    const res = await a.agent.get('/api/v1/leaderboards/facebook-friends');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ available: false, reason: 'PERMISSION_MISSING' });
  });

  it('ranks only Facebook friends who play when permission is granted', async () => {
    const b = await loginAs(app, 'fb-b', 'Bbb');
    const c = await loginAs(app, 'fb-c', 'Ccc');
    await playGame(db, b.agent);
    await playGame(db, c.agent);
    const a = await loginAs(app, 'fb-a', 'Aaa', ':friends=fb-b,fb-unknown');
    await playGame(db, a.agent);

    const res = await a.agent.get('/api/v1/leaderboards/facebook-friends');
    expect(res.body.data.available).toBe(true);
    expect(res.body.data.players.map((p) => p.displayName).sort()).toEqual(['Aaa', 'Bbb']); // Ccc is not A's friend
  });

  it('forgets friends when permission is later revoked', async () => {
    await loginAs(app, 'fb-b', 'Bbb');
    const a = await loginAs(app, 'fb-a', 'Aaa', ':friends=fb-b');
    expect(await count('facebook_friend_cache')).toBe(1);
    await loginAs(app, 'fb-a', 'Aaa'); // logs in again without user_friends
    expect(await count('facebook_friend_cache')).toBe(0);
    expect((await a.agent.get('/api/v1/leaderboards/facebook-friends')).body.data.available).toBe(false);
  });

  it('treats a stale cache as unavailable until refreshed', async () => {
    await loginAs(app, 'fb-b', 'Bbb');
    const a = await loginAs(app, 'fb-a', 'Aaa', ':friends=fb-b');
    await db.query(`UPDATE players SET fb_friends_synced_at = now() - interval '2 days' WHERE facebook_user_id = 'fb-a'`);
    expect((await a.agent.get('/api/v1/leaderboards/facebook-friends')).body.data).toEqual({ available: false, reason: 'NEEDS_REFRESH' });
    const sync = await a.agent.post('/api/v1/friends/facebook/sync').set(CSRF).send({ accessToken: 'mock:fb-a:Aaa:friends=fb-b' });
    expect(sync.body.data.enabled).toBe(true);
    expect((await a.agent.get('/api/v1/leaderboards/facebook-friends')).body.data.available).toBe(true);
  });

  it("refuses to sync with someone else's Facebook token", async () => {
    const a = await loginAs(app, 'fb-a', 'Aaa');
    const res = await a.agent.post('/api/v1/friends/facebook/sync').set(CSRF).send({ accessToken: 'mock:fb-other:Eve:friends=fb-a' });
    expect(res.status).toBe(403);
  });
});

describe('account deletion & Meta data-deletion callback', () => {
  it('DELETE /players/me removes everything about the player', async () => {
    const a = await loginAs(app, 'fb-a', 'Aaa', ':friends=fb-b');
    const b = await loginAs(app, 'fb-b', 'Bbb');
    await playGame(db, a.agent);
    await a.agent.post('/api/v1/friends/requests').set(CSRF).send({ friendCode: b.player.friendCode });
    expect((await a.agent.delete('/api/v1/players/me').set(CSRF)).status).toBe(200);
    for (const t of ['game_scores', 'game_sessions', 'auth_sessions', 'player_friendships', 'facebook_friend_cache']) {
      const n = (await db.query(`SELECT count(*)::int AS n FROM ${t} WHERE player_id = (SELECT id FROM players WHERE facebook_user_id = 'fb-a')`)).rows[0].n;
      expect(n, t).toBe(0);
    }
    expect((await a.agent.get('/api/v1/auth/me')).status).toBe(401);
    expect(await count('players')).toBe(1);
  });

  it('data-deletion callback verifies the signature and deletes the user', async () => {
    const env = testEnv();
    await loginAs(app, 'fb-9', 'Nine');
    const sign = (payload, secret) => {
      const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
      return `${crypto.createHmac('sha256', secret).update(body).digest('base64url')}.${body}`;
    };
    const forged = await request(app).post('/api/v1/auth/facebook/data-deletion').type('form').send({ signed_request: sign({ user_id: 'fb-9' }, 'wrong') });
    expect(forged.status).toBe(401);
    expect(await count('players')).toBe(1);

    const res = await request(app).post('/api/v1/auth/facebook/data-deletion').type('form').send({ signed_request: sign({ user_id: 'fb-9' }, env.FACEBOOK_APP_SECRET) });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['confirmation_code', 'url']);
    expect(await count('players')).toBe(0);
    const status = await request(app).get(`/api/v1/auth/facebook/data-deletion/${res.body.confirmation_code}`);
    expect(status.body.data.status).toBe('completed');
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
});
