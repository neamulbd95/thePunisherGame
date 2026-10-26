/**
 * Server-side copy of the game's scoring rules (frontend/js/game.js: resolve(), gameOver()).
 * Keep the two in sync: the server replays the client's round log and only accepts a score
 * that matches its own calculation exactly.
 *
 * A session is STAGES successful hits against a clock. It ends when the player
 *   - 'cleared' all stages (score += whole seconds left x TIME_BONUS_PER_SEC),
 *   - loses all lives ('lives': three misses), or
 *   - runs out of time ('timeout'). No time bonus unless cleared.
 */
export const VILLAINS = ['abuser', 'robber', 'rapist'];
export const SPOTS = ['L', 'R', 'S', 'B']; // left cheek, right cheek, the villain's special spot, bottom (kick)
export const GRADE_MULT = { PERFECT: 1.5, GREAT: 1.2, GOOD: 1 };
export const SPOT_MULT = { L: 1, R: 1, S: 1.6, B: 2 };

// Weapons: chosen before a game; unlock at a TOTAL score and add a small score multiplier. The bottom kick uses no weapon.
export const WEAPONS = {
  hand: { mult: 1, unlock: 0 },
  sandal: { mult: 1.05, unlock: 1000 },
  broom: { mult: 1.1, unlock: 3000 },
  bamboo: { mult: 1.15, unlock: 6000 },
  belan: { mult: 1.2, unlock: 10000 },
  pan: { mult: 1.25, unlock: 15000 },
};
export const WEAPON_IDS = Object.keys(WEAPONS);
// Villains unlock at a TOTAL score; the bottom kick unlocks per villain, at the score earned against that villain.
export const VILLAIN_UNLOCK = { robber: 0, abuser: 1500, rapist: 3500 };
export const KICK_UNLOCK = 1500;

/** progress = { total, per: { abuser, robber, rapist } } built from accepted scores. */
export const villainUnlocked = (progress, villain) => progress.total >= VILLAIN_UNLOCK[villain];
export const weaponUnlocked = (progress, weapon) => progress.total >= WEAPONS[weapon].unlock;
export const kickUnlocked = (progress, villain) => (progress.per[villain] ?? 0) >= KICK_UNLOCK;
export const MAX_MISSES = 3;
export const MIN_FORCE = 0.05;
export const STAGES = 12;
export const TIME_LIMIT_MS = 60_000;
export const TIME_BONUS_PER_SEC = 20;
export const END_REASONS = ['lives', 'cleared', 'timeout'];

export const LIMITS = {
  // A round needs at least the ~1 s hit animation, so a run cannot finish faster than this.
  minRoundMs: 1000,
  maxDurationMs: 3 * 60 * 60 * 1000,
  // Heuristic only: the PERFECT window shrinks every stage, so a streak this long is not humanly plausible.
  maxPerfectStreak: 9,
  maxScore: 5_000_000,
  // The game clock runs in game time during hit animations (slow motion costs no time), so wall-clock time
  // can exceed the claimed time used by this much without being suspicious. These bound how much extra
  // "time left" a forged claim can gain: session-creation latency + per-round frame slop + slow-motion hits.
  timeSlackMs: 4000,
  perRoundSlackMs: 150,
  perPerfectSlackMs: 2500,
  // The client's clock must have used at least this much per round (the hit animation, 1 s of game time).
  minUsedPerRoundMs: 900,
};

export function roundScore({ force, grade, spot, combo, weapon = 'hand' }) {
  // Same operation order as the client so floating point results are identical.
  const weaponMult = spot === 'B' ? 1 : WEAPONS[weapon].mult;
  return Math.round(100 * force * GRADE_MULT[grade] * SPOT_MULT[spot] * weaponMult * (1 + combo * 0.15));
}

export const timeBonus = (timeLeftMs) => Math.floor(timeLeftMs / 1000) * TIME_BONUS_PER_SEC;

/**
 * Replays a run. Returns { ok:true, score, perfects, rounds, bonus } or { ok:false, reason }.
 * `claimedScore`, `rounds`, `end` and `timeLeftMs` come from the untrusted client; `durationMs` is measured by the server.
 */
export function replayRun({ rounds, claimedScore, durationMs, end = 'lives', timeLeftMs = 0, weapon = 'hand', kickAllowed = false }) {
  if (!Array.isArray(rounds)) return { ok: false, reason: 'bad_rounds' };
  if (!END_REASONS.includes(end)) return { ok: false, reason: 'bad_end' };
  // At most STAGES hits and MAX_MISSES-1 earlier misses plus the final one.
  if (rounds.length > STAGES + MAX_MISSES) return { ok: false, reason: 'too_many_rounds' };

  let score = 0;
  let combo = 0;
  let hits = 0;
  let misses = 0;
  let perfects = 0;
  let streak = 0;

  for (const r of rounds) {
    if (misses >= MAX_MISSES || hits >= STAGES) return { ok: false, reason: 'rounds_after_game_over' };
    if (!SPOTS.includes(r.spot)) return { ok: false, reason: 'bad_spot' };
    if (r.spot === 'B' && !kickAllowed) return { ok: false, reason: 'locked_area' };
    if (r.grade === 'MISS') {
      combo = 0;
      misses++;
      streak = 0;
      continue;
    }
    if (!(r.grade in GRADE_MULT)) return { ok: false, reason: 'bad_grade' };
    if (!Number.isFinite(r.force) || r.force < MIN_FORCE || r.force > 1) return { ok: false, reason: 'bad_force' };
    score += roundScore({ force: r.force, grade: r.grade, spot: r.spot, combo, weapon });
    combo++;
    hits++;
    if (r.grade === 'PERFECT') {
      perfects++;
      streak++;
      if (streak > LIMITS.maxPerfectStreak) return { ok: false, reason: 'implausible_perfect_streak' };
    } else {
      streak = 0;
    }
  }

  const last = rounds[rounds.length - 1];
  if (end === 'lives') {
    if (misses !== MAX_MISSES || last?.grade !== 'MISS') return { ok: false, reason: 'game_not_finished' };
  } else if (end === 'cleared') {
    if (hits !== STAGES || misses >= MAX_MISSES) return { ok: false, reason: 'game_not_finished' };
  } else if (misses >= MAX_MISSES || hits >= STAGES) {
    // timeout: the game must still have been running when the clock hit zero
    return { ok: false, reason: 'game_not_finished' };
  } else if (durationMs < TIME_LIMIT_MS - LIMITS.timeSlackMs) {
    return { ok: false, reason: 'timeout_too_early' };
  }

  let bonus = 0;
  if (end === 'cleared') {
    if (!Number.isInteger(timeLeftMs) || timeLeftMs < 0 || timeLeftMs > TIME_LIMIT_MS - rounds.length * LIMITS.minUsedPerRoundMs) {
      return { ok: false, reason: 'bad_time' };
    }
    // Claiming lots of time left means claiming the game was played fast, which the server clock can contradict.
    const usedMs = TIME_LIMIT_MS - timeLeftMs;
    const allowance = LIMITS.timeSlackMs + rounds.length * LIMITS.perRoundSlackMs + perfects * LIMITS.perPerfectSlackMs;
    if (usedMs < durationMs - allowance) return { ok: false, reason: 'time_mismatch' };
    bonus = timeBonus(timeLeftMs);
  }

  const total = score + bonus;
  if (total > LIMITS.maxScore) return { ok: false, reason: 'score_out_of_range' };
  if (total !== claimedScore) return { ok: false, reason: 'score_mismatch' };
  if (durationMs < rounds.length * LIMITS.minRoundMs) return { ok: false, reason: 'too_fast' };
  if (durationMs > LIMITS.maxDurationMs) return { ok: false, reason: 'session_too_long' };

  return { ok: true, score: total, bonus, perfects, rounds: rounds.length };
}
