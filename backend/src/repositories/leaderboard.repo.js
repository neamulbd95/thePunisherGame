/**
 * Leaderboard ranking in a single SQL round trip.
 *  - one row per player: their best accepted score inside the window (and villain filter)
 *  - deterministic order: score DESC, earliest submission first, then player id
 *  - ROW_NUMBER (not RANK) so ranks are unique and stable across pages
 */
export function leaderboardRepo(db) {
  return {
    /**
     * @param {{since:Date|null, villain:string|null, playerIds:string[]|null, limit:number, offset:number, meId:string|null}} p
     */
    async rank(p) {
      const params = [p.since, p.villain, p.playerIds, p.limit, p.offset];
      const cte = `
        WITH best AS (
          SELECT DISTINCT ON (s.player_id) s.player_id, s.score, s.villain, s.submitted_at
            FROM game_scores s
           WHERE s.validation_status = 'accepted'
             AND ($1::timestamptz IS NULL OR s.submitted_at >= $1)
             AND ($2::text IS NULL OR s.villain = $2)
             AND ($3::uuid[] IS NULL OR s.player_id = ANY($3))
           ORDER BY s.player_id, s.score DESC, s.submitted_at ASC
        ), ranked AS (
          SELECT b.player_id, b.score, b.villain, b.submitted_at,
                 ROW_NUMBER() OVER (ORDER BY b.score DESC, b.submitted_at ASC, b.player_id ASC)::int AS rank
            FROM best b
        )`;
      const page = await db.query(
        `${cte}
         SELECT r.rank, r.player_id, r.score, r.villain, p.display_name, p.avatar_url
           FROM ranked r JOIN players p ON p.id = r.player_id
          ORDER BY r.rank
          LIMIT $4 OFFSET $5`,
        params,
      );
      const meta = await db.query(
        `${cte}
         SELECT (SELECT count(*)::int FROM ranked) AS total,
                (SELECT rank FROM ranked WHERE player_id = $4::uuid) AS my_rank,
                (SELECT score FROM ranked WHERE player_id = $4::uuid) AS my_score`,
        [p.since, p.villain, p.playerIds, p.meId],
      );
      return { rows: page.rows, ...meta.rows[0] };
    },
  };
}
