/**
 * Server-side copy of the game's scoring rules (frontend/js/game.js, function resolve()).
 * Keep the two in sync: the server replays the client's round log and only accepts a score
 * that matches its own calculation exactly.
 */
export const VILLAINS = ['abuser', 'robber', 'rapist'];
export const SPOTS = ['L', 'R', 'S'];
export const GRADE_MULT = { PERFECT: 1.5, GREAT: 1.2, GOOD: 1 };
export const SPOT_MULT = { L: 1, R: 1, S: 1.6 };
export const MAX_MISSES = 3;
export const MIN_FORCE = 0.05;

export const LIMITS = {
  maxRounds: 400,
  // A round needs at least the ~1 s hit animation, so a run cannot finish faster than this.
  minRoundMs: 1000,
  maxDurationMs: 3 * 60 * 60 * 1000,
  // Heuristic only: the arc shrinks and the needle speeds up every hit, so long perfect streaks are not humanly plausible.
  maxPerfectStreak: 12,
  maxScore: 5_000_000,
};

export function roundScore({ force, grade, spot, combo }) {
  // Same operation order as the client so floating point results are identical.
  return Math.round(100 * force * GRADE_MULT[grade] * SPOT_MULT[spot] * (1 + combo * 0.15));
}

/**
 * Replays a run. Returns { ok:true, score, perfects, rounds } or { ok:false, reason }.
 * `claimedScore` and `rounds` come from the untrusted client.
 */
export function replayRun({ rounds, claimedScore, durationMs }) {
  if (!Array.isArray(rounds) || rounds.length < MAX_MISSES) return { ok: false, reason: 'too_few_rounds' };
  if (rounds.length > LIMITS.maxRounds) return { ok: false, reason: 'too_many_rounds' };

  let score = 0;
  let combo = 0;
  let misses = 0;
  let perfects = 0;
  let streak = 0;

  for (let i = 0; i < rounds.length; i++) {
    if (misses >= MAX_MISSES) return { ok: false, reason: 'rounds_after_game_over' };
    const r = rounds[i];
    if (!SPOTS.includes(r.spot)) return { ok: false, reason: 'bad_spot' };
    if (r.grade === 'MISS') {
      combo = 0;
      misses++;
      streak = 0;
      continue;
    }
    if (!(r.grade in GRADE_MULT)) return { ok: false, reason: 'bad_grade' };
    if (!Number.isFinite(r.force) || r.force < MIN_FORCE || r.force > 1) return { ok: false, reason: 'bad_force' };
    score += roundScore({ force: r.force, grade: r.grade, spot: r.spot, combo });
    combo++;
    if (r.grade === 'PERFECT') {
      perfects++;
      streak++;
      if (streak > LIMITS.maxPerfectStreak) return { ok: false, reason: 'implausible_perfect_streak' };
    } else {
      streak = 0;
    }
  }

  if (misses !== MAX_MISSES) return { ok: false, reason: 'game_not_finished' };
  if (rounds[rounds.length - 1].grade !== 'MISS') return { ok: false, reason: 'game_not_finished' };
  if (score > LIMITS.maxScore) return { ok: false, reason: 'score_out_of_range' };
  if (score !== claimedScore) return { ok: false, reason: 'score_mismatch' };
  if (durationMs < rounds.length * LIMITS.minRoundMs) return { ok: false, reason: 'too_fast' };
  if (durationMs > LIMITS.maxDurationMs) return { ok: false, reason: 'session_too_long' };

  return { ok: true, score, perfects, rounds: rounds.length };
}
