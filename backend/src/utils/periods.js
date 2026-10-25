export const PERIODS = ['all-time', 'daily', 'weekly', 'monthly'];

/**
 * Start of the leaderboard window in UTC, or null for all-time.
 * Windows are decided by score submission time (game_scores.submitted_at).
 * weekly = ISO week (Monday 00:00 UTC); monthly = 1st of the month 00:00 UTC.
 */
export function periodStart(period, now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  switch (period) {
    case 'daily':
      return new Date(Date.UTC(y, m, d));
    case 'weekly': {
      const dow = (now.getUTCDay() + 6) % 7; // Monday = 0
      return new Date(Date.UTC(y, m, d - dow));
    }
    case 'monthly':
      return new Date(Date.UTC(y, m, 1));
    default:
      return null;
  }
}
