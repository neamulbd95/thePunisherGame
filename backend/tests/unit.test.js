import { describe, it, expect } from 'vitest';
import { replayRun, roundScore, timeBonus, villainUnlocked, weaponUnlocked, kickUnlocked, LIMITS, STAGES, TIME_LIMIT_MS, TIME_BONUS_PER_SEC } from '../src/utils/game-rules.js';
import { periodStart } from '../src/utils/periods.js';
import { parseEnv } from '../src/config/env.js';
import { nicknameProblem, parseHandle, formatHandle } from '../src/utils/nickname.js';
import { newRecoveryCode, normalizeRecoveryCode } from '../src/utils/crypto.js';
import { makeRun, makeCleared } from './helpers.js';

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
  it('needs no third-party credentials', () => {
    const env = parseEnv({ ...base, NODE_ENV: 'production' });
    expect(env.cookieSecure).toBe(true);
    expect(env.SESSION_TTL_DAYS).toBe(365); // the device cookie lasts a year by default
  });
  it('requires https in production', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'production', FRONTEND_URL: 'http://game.example.com' })).toThrow(/https/);
    expect(() => parseEnv({ ...base, NODE_ENV: 'production', API_PUBLIC_URL: 'http://api.example.com' })).toThrow(/https/);
  });
  it('fails fast on a missing database url or a bad origin', () => {
    expect(() => parseEnv({ ...base, DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ ...base, FRONTEND_URL: 'not a url' })).toThrow(/invalid URL/);
  });
});

describe('nicknames and handles', () => {
  it('accepts ordinary names in any script', () => {
    for (const ok of ['Rahim', 'নীরব_প্রতিবাদ', 'Punisher', 'bangla-hero', 'Nusrat99', 'আমি', 'x_y']) expect(nicknameProblem(ok), ok).toBeNull();
  });
  it('rejects bad length, characters, reserved names and clearly abusive terms (including leetspeak)', () => {
    for (const bad of ['ab', 'a'.repeat(17), 'two words', 'a#b', '<b>', 'Admin', 'adm1n', 'Moderator', 'BanglaPunisher', 'FUCK', 'sh1t', 'xX_f.u.c.k_Xx', 'Rapist', 'HITLER']) {
      expect(nicknameProblem(bad), bad).toBeTruthy();
    }
  });
  it('does not block innocent words that merely contain letters of a blocked term', () => {
    for (const ok of ['Shiitake', 'Assam', 'Classic', 'Dickens']) expect(nicknameProblem(ok), ok).toBeNull();
  });
  it('formats and parses handles', () => {
    expect(formatHandle('Rahim', 42)).toBe('Rahim#0042');
    expect(parseHandle('Rahim#0042')).toEqual({ nickname: 'Rahim', tag: 42 });
    expect(parseHandle(' নীরব#7 ')).toEqual({ nickname: 'নীরব', tag: 7 });
    for (const bad of ['Rahim', 'Rahim#', '#0042', 'Rahim#12345', 'Rahim#abcd']) expect(parseHandle(bad), bad).toBeNull();
  });
  it('recovery codes are 100-bit, readable, and forgiving to type', () => {
    const code = newRecoveryCode();
    expect(code).toMatch(/^([A-Z2-9]{4}-){4}[A-Z2-9]{4}$/);
    expect(new Set(Array.from({ length: 200 }, newRecoveryCode)).size).toBe(200);
    expect(normalizeRecoveryCode(code.toLowerCase().replace(/-/g, ' '))).toBe(code.replace(/-/g, ''));
  });
});
