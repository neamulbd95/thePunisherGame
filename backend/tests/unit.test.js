import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { replayRun, roundScore, timeBonus, villainUnlocked, weaponUnlocked, kickUnlocked, LIMITS, STAGES, TIME_LIMIT_MS, TIME_BONUS_PER_SEC } from '../src/utils/game-rules.js';
import { periodStart } from '../src/utils/periods.js';
import { parseEnv } from '../src/config/env.js';
import { createFacebookService, parseSignedRequest } from '../src/services/facebook.service.js';
import { testEnv, makeRun, makeCleared } from './helpers.js';

describe('scoring rules', () => {
  it('matches the client formula', () => {
    // 100 * force * grade * spot * (1 + combo*.15)
    expect(roundScore({ force: 0.8, grade: 'PERFECT', spot: 'S', combo: 2 })).toBe(Math.round(100 * 0.8 * 1.5 * 1.6 * 1.3));
  });

  it('accepts a legal finished run', () => {
    const { rounds, score } = makeRun();
    const r = replayRun({ rounds, claimedScore: score, durationMs: rounds.length * 2000 });
    expect(r.ok).toBe(true);
    expect(r.score).toBe(score);
    expect(r.perfects).toBe(1);
  });

  it.each([
    ['tampered score', (x) => ({ ...x, claimedScore: x.claimedScore + 1 }), 'score_mismatch'],
    ['unfinished game', (x) => ({ ...x, rounds: x.rounds.slice(0, -1) }), 'game_not_finished'],
    ['too fast', (x) => ({ ...x, durationMs: 500 }), 'too_fast'],
    ['force above 1', (x) => ({ ...x, rounds: [{ ...x.rounds[0], force: 1.5 }, ...x.rounds.slice(1)] }), 'bad_force'],
    ['force below minimum', (x) => ({ ...x, rounds: [{ ...x.rounds[0], force: 0 }, ...x.rounds.slice(1)] }), 'bad_force'],
    ['unknown grade', (x) => ({ ...x, rounds: [{ ...x.rounds[0], grade: 'GODLIKE' }, ...x.rounds.slice(1)] }), 'bad_grade'],
    ['rounds after game over', (x) => ({ ...x, rounds: [...x.rounds, { spot: 'L', grade: 'GOOD', force: 1 }] }), 'rounds_after_game_over'],
  ])('rejects %s', (_n, mutate, reason) => {
    const { rounds, score } = makeRun();
    const input = mutate({ rounds, claimedScore: score, durationMs: rounds.length * 2000 });
    expect(replayRun(input)).toEqual({ ok: false, reason });
  });

  it('rejects an implausible perfect streak', () => {
    const run = makeCleared({ spec: Array.from({ length: STAGES }, () => ['S', 'PERFECT', 1]), timeLeftMs: 20_000 });
    expect(LIMITS.maxPerfectStreak).toBeLessThan(STAGES);
    expect(replayRun({ ...run, claimedScore: run.score, durationMs: 90_000 }).reason).toBe('implausible_perfect_streak');
  });

  it('rejects more rounds than a game can contain', () => {
    const spec = Array.from({ length: STAGES + 1 }, () => ['L', 'GOOD', 0.5]);
    const { rounds, score } = makeRun(spec);
    expect(replayRun({ rounds, claimedScore: score, durationMs: 999_999, end: 'lives' }).reason).toBe('too_many_rounds');
  });
});

describe('stages and the clock', () => {
  const replay = (run, durationMs, over = {}) => replayRun({ rounds: run.rounds, claimedScore: run.score, durationMs, end: run.end, timeLeftMs: run.timeLeftMs, ...over });

  it('adds whole seconds left x bonus when all stages are cleared', () => {
    const run = makeCleared({ timeLeftMs: 21_800 });
    const r = replay(run, 40_000);
    expect(r.ok).toBe(true);
    expect(r.bonus).toBe(21 * TIME_BONUS_PER_SEC);
    expect(r.score).toBe(run.score);
    expect(timeBonus(21_999)).toBe(21 * TIME_BONUS_PER_SEC);
  });

  it('gives no bonus for losing all lives, even if the client claims time left', () => {
    const { rounds, score } = makeRun();
    expect(replayRun({ rounds, claimedScore: score, durationMs: 20_000, end: 'lives', timeLeftMs: 50_000 }).ok).toBe(true);
    expect(replayRun({ rounds, claimedScore: score + 1000, durationMs: 20_000, end: 'lives', timeLeftMs: 50_000 }).reason).toBe('score_mismatch');
  });

  it('rejects a bonus the server clock contradicts', () => {
    const run = makeCleared({ timeLeftMs: 40_000 }); // claims the game took 20 s ...
    expect(replay(run, 20_500).ok).toBe(true); //        ... which fits 20 s of wall clock
    expect(replay(run, 45_000).reason).toBe('time_mismatch'); // but not 45 s
  });

  it('rejects impossible time claims', () => {
    expect(replay(makeCleared({ timeLeftMs: TIME_LIMIT_MS }), 30_000).reason).toBe('bad_time');
    expect(replay(makeCleared({ timeLeftMs: 20_000 }), 30_000, { timeLeftMs: -5 }).reason).toBe('bad_time');
    expect(replay(makeCleared({ timeLeftMs: 20_000 }), 30_000, { timeLeftMs: 12.5 }).reason).toBe('bad_time');
  });

  it('cleared needs exactly ten hits and fewer than three misses', () => {
    const nine = makeCleared({ spec: Array.from({ length: STAGES - 1 }, () => ['L', 'GOOD', 0.6]), timeLeftMs: 20_000 });
    expect(replay(nine, 30_000).reason).toBe('game_not_finished');
  });

  it('a clear may include up to two misses', () => {
    const spec = [['L', 'GOOD', 0.7], ['L', 'MISS'], ...Array.from({ length: STAGES - 1 }, () => ['R', 'GREAT', 0.7]), ];
    const run = makeCleared({ spec, timeLeftMs: 10_000 });
    expect(replay(run, 25_000).ok).toBe(true);
  });

  it('accepts a timeout only once the clock could really have run out', () => {
    const spec = [['L', 'GOOD', 0.5], ['R', 'GOOD', 0.5]];
    const { rounds, score } = makeRun(spec, { lives: false });
    const base = { rounds, claimedScore: score, end: 'timeout', timeLeftMs: 0 };
    expect(replayRun({ ...base, durationMs: TIME_LIMIT_MS + 5_000 }).ok).toBe(true);
    expect(replayRun({ ...base, durationMs: 20_000 }).reason).toBe('timeout_too_early');
    // a run that was already over (three misses) cannot also be a timeout
    const dead = makeRun(spec);
    expect(replayRun({ rounds: dead.rounds, claimedScore: dead.score, end: 'timeout', durationMs: 90_000 }).reason).toBe('game_not_finished');
  });

  it('weapons add their multiplier, but the kick ignores the weapon', () => {
    const base = { force: 1, grade: 'GOOD', combo: 0 };
    expect(roundScore({ ...base, spot: 'L', weapon: 'hand' })).toBe(100);
    expect(roundScore({ ...base, spot: 'L', weapon: 'sandal' })).toBe(105);
    expect(roundScore({ ...base, spot: 'L', weapon: 'pan' })).toBe(125);
    expect(roundScore({ ...base, spot: 'B', weapon: 'pan' })).toBe(200); // kick x2.0, no weapon bonus
  });

  it('the kick needs its unlock', () => {
    const { rounds, score } = makeRun([['B', 'GOOD', 0.5]]);
    expect(replayRun({ rounds, claimedScore: score, durationMs: 20_000, end: 'lives' }).reason).toBe('locked_area');
    expect(replayRun({ rounds, claimedScore: score, durationMs: 20_000, end: 'lives', kickAllowed: true }).ok).toBe(true);
  });

  it('unlock thresholds', () => {
    const p = (total, per = {}) => ({ total, per: { abuser: 0, robber: 0, rapist: 0, ...per } });
    expect(villainUnlocked(p(0), 'robber')).toBe(true);
    expect(villainUnlocked(p(1999), 'abuser')).toBe(false);
    expect(villainUnlocked(p(2000), 'abuser')).toBe(true);
    expect(villainUnlocked(p(5000), 'rapist')).toBe(true);
    expect(weaponUnlocked(p(0), 'hand')).toBe(true);
    expect(weaponUnlocked(p(999), 'sandal')).toBe(false);
    expect(weaponUnlocked(p(15000), 'pan')).toBe(true);
    expect(kickUnlocked(p(9999, { abuser: 1499 }), 'abuser')).toBe(false);
    expect(kickUnlocked(p(1500, { abuser: 1500 }), 'abuser')).toBe(true);
  });

  it('rejects unknown end reasons', () => {
    const { rounds, score } = makeRun();
    expect(replayRun({ rounds, claimedScore: score, durationMs: 20_000, end: 'quit' }).reason).toBe('bad_end');
  });
});

describe('leaderboard periods (UTC)', () => {
  const now = new Date('2026-03-18T15:30:00Z'); // a Wednesday
  it('daily starts at 00:00 UTC', () => expect(periodStart('daily', now).toISOString()).toBe('2026-03-18T00:00:00.000Z'));
  it('weekly starts on Monday', () => expect(periodStart('weekly', now).toISOString()).toBe('2026-03-16T00:00:00.000Z'));
  it('weekly on a Sunday still belongs to the Monday before', () =>
    expect(periodStart('weekly', new Date('2026-03-22T23:59:59Z')).toISOString()).toBe('2026-03-16T00:00:00.000Z'));
  it('weekly rolls back over a month boundary', () =>
    expect(periodStart('weekly', new Date('2026-04-01T10:00:00Z')).toISOString()).toBe('2026-03-30T00:00:00.000Z'));
  it('monthly starts on the 1st', () => expect(periodStart('monthly', now).toISOString()).toBe('2026-03-01T00:00:00.000Z'));
  it('all-time has no lower bound', () => expect(periodStart('all-time', now)).toBeNull());
});

describe('environment validation', () => {
  const base = { DATABASE_URL: 'postgres://x', FRONTEND_URL: 'https://game.example.com', API_PUBLIC_URL: 'https://api.example.com' };
  it('fails fast when Facebook credentials are missing', () => {
    expect(() => parseEnv({ ...base })).toThrow(/FACEBOOK_APP_ID/);
  });
  it('refuses mock login in production', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'production', FACEBOOK_MOCK: 'true' })).toThrow(/FACEBOOK_MOCK/);
  });
  it('requires https in production', () => {
    expect(() =>
      parseEnv({ ...base, NODE_ENV: 'production', FACEBOOK_APP_ID: '1', FACEBOOK_APP_SECRET: 's', FRONTEND_URL: 'http://game.example.com' }),
    ).toThrow(/https/);
  });
  it('accepts a complete production config', () => {
    const env = parseEnv({ ...base, NODE_ENV: 'production', FACEBOOK_APP_ID: '1', FACEBOOK_APP_SECRET: 's' });
    expect(env.cookieSecure).toBe(true);
  });
});

describe('Facebook token validation (mocked Meta)', () => {
  const env = testEnv({ FACEBOOK_MOCK: 'false' });
  const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

  const service = (routes) =>
    createFacebookService(env, {
      fetchImpl: async (url) => {
        const u = new URL(url);
        const handler = routes[u.pathname.split('/').pop()];
        if (!handler) throw new Error(`unexpected ${u.pathname}`);
        return handler(u);
      },
    });

  const goodDebug = { data: { is_valid: true, app_id: '123456', type: 'USER', user_id: '777', expires_at: Math.floor(Date.now() / 1000) + 3600, scopes: ['public_profile', 'user_friends'] } };
  const goodMe = { id: '777', first_name: 'Rahim', last_name: 'Uddin', picture: { data: { url: 'https://scontent.xx.fbcdn.net/a.jpg' } } };

  it('accepts a valid token and shortens the name for privacy', async () => {
    const p = await service({ debug_token: () => json(goodDebug), me: () => json(goodMe) }).verifyAndFetchProfile('tok-tok-tok-tok');
    expect(p).toMatchObject({ facebookUserId: '777', displayName: 'Rahim U.', grantedFriends: true });
    expect(p.avatarUrl).toContain('fbcdn.net');
  });

  it('sends appsecret_proof and never the secret itself to /me', async () => {
    let meUrl;
    await service({ debug_token: () => json(goodDebug), me: (u) => (meUrl = u) && json(goodMe) }).verifyAndFetchProfile('tok-tok-tok-tok');
    const expected = crypto.createHmac('sha256', 'test-secret').update('tok-tok-tok-tok').digest('hex');
    expect(meUrl.searchParams.get('appsecret_proof')).toBe(expected);
    expect(meUrl.toString()).not.toContain('test-secret');
  });

  it.each([
    ['invalid token', { data: { ...goodDebug.data, is_valid: false } }],
    ['token for another app', { data: { ...goodDebug.data, app_id: '999' } }],
    ['expired token', { data: { ...goodDebug.data, expires_at: 100 } }],
    ['page token', { data: { ...goodDebug.data, type: 'PAGE' } }],
  ])('rejects %s', async (_n, dbg) => {
    await expect(service({ debug_token: () => json(dbg), me: () => json(goodMe) }).verifyAndFetchProfile('tok-tok-tok-tok')).rejects.toMatchObject({ status: 401 });
  });

  it('rejects an identity that does not match debug_token', async () => {
    await expect(
      service({ debug_token: () => json(goodDebug), me: () => json({ ...goodMe, id: '888' }) }).verifyAndFetchProfile('tok-tok-tok-tok'),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('maps a Meta 5xx to 503 and a network failure to 503', async () => {
    await expect(service({ debug_token: () => json({}, 500) }).verifyAndFetchProfile('tok-tok-tok-tok')).rejects.toMatchObject({ status: 503 });
    const down = createFacebookService(env, { fetchImpl: async () => { throw new Error('boom'); } });
    await expect(down.verifyAndFetchProfile('tok-tok-tok-tok')).rejects.toMatchObject({ status: 503 });
  });

  it('only keeps avatars hosted by Meta', async () => {
    const p = await service({ debug_token: () => json(goodDebug), me: () => json({ ...goodMe, picture: { data: { url: 'https://evil.example/x.jpg' } } }) }).verifyAndFetchProfile('tok-tok-tok-tok');
    expect(p.avatarUrl).toBeNull();
  });

  it('pages through /me/friends', async () => {
    let calls = 0;
    const svc = service({
      friends: () => (calls++ === 0
        ? json({ data: [{ id: '1' }, { id: '2' }], paging: { cursors: { after: 'c1' }, next: 'x' } })
        : json({ data: [{ id: '3' }], paging: {} })),
    });
    expect(await svc.fetchAppFriends('tok-tok-tok-tok')).toEqual(['1', '2', '3']);
  });
});

describe('signed_request (data deletion callback)', () => {
  const sign = (payload, secret) => {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    return `${sig}.${body}`;
  };
  it('accepts a correctly signed request', () => {
    expect(parseSignedRequest(sign({ user_id: '42' }, 's3'), 's3').user_id).toBe('42');
  });
  it('rejects a forged signature', () => {
    expect(() => parseSignedRequest(sign({ user_id: '42' }, 'other'), 's3')).toThrow();
  });
  it('rejects malformed input', () => {
    expect(() => parseSignedRequest('garbage', 's3')).toThrow();
  });
});
