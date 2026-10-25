export function gamesRepo(db) {
  return {
    async createSession(playerId, villain) {
      const { rows } = await db.query(
        `INSERT INTO game_sessions (player_id, villain) VALUES ($1, $2) RETURNING id, villain, started_at, status`,
        [playerId, villain],
      );
      return rows[0];
    },

    /** Locks the row so two concurrent submissions for one session serialise. Must run inside tx. */
    async lockSession(id, q) {
      const { rows } = await q.query(
        `SELECT id, player_id, villain, started_at, status,
                (extract(epoch FROM (now() - started_at)) * 1000)::bigint AS elapsed_ms
           FROM game_sessions WHERE id = $1 FOR UPDATE`,
        [id],
      );
      return rows[0] ?? null;
    },

    async finishSession(id, status, metadata, q) {
      await q.query(
        `UPDATE game_sessions SET status = $2, completed_at = now(), validation_metadata = $3 WHERE id = $1`,
        [id, status, metadata ? JSON.stringify(metadata) : null],
      );
    },

    async insertScore(s, q) {
      const { rows } = await q.query(
        `INSERT INTO game_scores
           (player_id, game_session_id, villain, score, rounds, perfects, duration_ms, validation_status, rejection_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id, score, validation_status, submitted_at`,
        [s.playerId, s.sessionId, s.villain, s.score, s.rounds, s.perfects, s.durationMs, s.status, s.reason ?? null],
      );
      return rows[0];
    },

    async expireStaleSessions(olderThanHours = 6) {
      return (
        await db.query(
          `UPDATE game_sessions SET status = 'expired'
            WHERE status = 'active' AND started_at < now() - ($1 || ' hours')::interval`,
          [String(olderThanHours)],
        )
      ).rowCount;
    },

    async playerStats(playerId) {
      const { rows } = await db.query(
        `SELECT count(*)::int AS games_played,
                COALESCE(max(score) FILTER (WHERE validation_status = 'accepted'), 0)::int AS highest_score,
                COALESCE(sum(perfects) FILTER (WHERE validation_status = 'accepted'), 0)::int AS total_perfects
           FROM game_scores WHERE player_id = $1`,
        [playerId],
      );
      return rows[0];
    },
  };
}
