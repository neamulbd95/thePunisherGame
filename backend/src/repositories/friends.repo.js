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

    // ----- Facebook friend cache -----
    async replaceFacebookCache(playerId, facebookIds, q) {
      await q.query('DELETE FROM facebook_friend_cache WHERE player_id = $1', [playerId]);
      if (facebookIds.length) {
        await q.query(
          `INSERT INTO facebook_friend_cache (player_id, friend_facebook_id)
           SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`,
          [playerId, facebookIds],
        );
      }
    },

    async clearFacebookCache(playerId, q = db) {
      await q.query('DELETE FROM facebook_friend_cache WHERE player_id = $1', [playerId]);
    },

    /** Local players matching the cached Facebook friends, only while the cache is fresh. */
    async facebookFriendPlayerIds(playerId, maxAgeHours = 24) {
      const { rows } = await db.query(
        `SELECT pl.id
           FROM facebook_friend_cache c
           JOIN players pl ON pl.facebook_user_id = c.friend_facebook_id
          WHERE c.player_id = $1 AND c.fetched_at > now() - ($2 || ' hours')::interval`,
        [playerId, String(maxAgeHours)],
      );
      return rows.map((r) => r.id);
    },

    async facebookCacheState(playerId, maxAgeHours = 24) {
      const { rows } = await db.query(
        `SELECT fb_friends_granted AS granted,
                (fb_friends_synced_at IS NOT NULL AND fb_friends_synced_at > now() - ($2 || ' hours')::interval) AS fresh
           FROM players WHERE id = $1`,
        [playerId, String(maxAgeHours)],
      );
      return rows[0] ?? { granted: false, fresh: false };
    },
  };
}
