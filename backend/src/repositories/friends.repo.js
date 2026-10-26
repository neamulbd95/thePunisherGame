export function friendsRepo(db) {
  return {
    async findBetween(a, b) {
      const { rows } = await db.query(
        `SELECT id, player_id, friend_player_id, status FROM player_friendships
          WHERE LEAST(player_id, friend_player_id) = LEAST($1::uuid, $2::uuid)
            AND GREATEST(player_id, friend_player_id) = GREATEST($1::uuid, $2::uuid)`,
        [a, b],
      );
      return rows[0] ?? null;
    },

    async createRequest(requesterId, targetId) {
      const { rows } = await db.query(
        `INSERT INTO player_friendships (player_id, friend_player_id) VALUES ($1, $2)
         RETURNING id, status, created_at`,
        [requesterId, targetId],
      );
      return rows[0];
    },

    async findById(id) {
      return (await db.query('SELECT id, player_id, friend_player_id, status FROM player_friendships WHERE id = $1', [id])).rows[0] ?? null;
    },

    async setStatus(id, status) {
      return (
        await db.query(
          'UPDATE player_friendships SET status = $2, updated_at = now() WHERE id = $1 RETURNING id, status',
          [id, status],
        )
      ).rows[0];
    },

    async remove(id) {
      await db.query('DELETE FROM player_friendships WHERE id = $1', [id]);
    },

    /** Pending requests addressed to the player (incoming) or sent by them (outgoing). */
    async listRequests(playerId) {
      const { rows } = await db.query(
        `SELECT f.id, f.created_at,
                CASE WHEN f.friend_player_id = $1 THEN 'incoming' ELSE 'outgoing' END AS direction,
                p.display_name, p.avatar_url
           FROM player_friendships f
           JOIN players p ON p.id = CASE WHEN f.friend_player_id = $1 THEN f.player_id ELSE f.friend_player_id END
          WHERE f.status = 'pending' AND (f.player_id = $1 OR f.friend_player_id = $1)
          ORDER BY f.created_at DESC`,
        [playerId],
      );
      return rows;
    },

    async listFriends(playerId) {
      const { rows } = await db.query(
        `SELECT f.id AS friendship_id, p.id AS player_id, p.display_name, p.avatar_url
           FROM player_friendships f
           JOIN players p ON p.id = CASE WHEN f.player_id = $1 THEN f.friend_player_id ELSE f.player_id END
          WHERE f.status = 'accepted' AND (f.player_id = $1 OR f.friend_player_id = $1)
          ORDER BY lower(p.display_name)`,
        [playerId],
      );
      return rows;
    },

    async friendIds(playerId) {
      const { rows } = await db.query(
        `SELECT CASE WHEN player_id = $1 THEN friend_player_id ELSE player_id END AS id
           FROM player_friendships
          WHERE status = 'accepted' AND (player_id = $1 OR friend_player_id = $1)`,
        [playerId],
      );
      return rows.map((r) => r.id);
    },
  };
}
