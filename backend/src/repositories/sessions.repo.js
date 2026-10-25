export function sessionsRepo(db) {
  return {
    async create({ playerId, tokenHash, expiresAt }) {
      const { rows } = await db.query(
        `INSERT INTO auth_sessions (player_id, token_hash, expires_at, last_used_at)
         VALUES ($1, $2, $3, now()) RETURNING id, expires_at`,
        [playerId, tokenHash, expiresAt],
      );
      return rows[0];
    },

    /** Returns the session only when it is neither revoked nor expired. */
    async findValid(tokenHash) {
      const { rows } = await db.query(
        `SELECT s.id, s.player_id, s.expires_at, s.last_used_at
           FROM auth_sessions s
          WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
        [tokenHash],
      );
      return rows[0] ?? null;
    },

    async touch(id) {
      await db.query('UPDATE auth_sessions SET last_used_at = now() WHERE id = $1', [id]);
    },

    async revoke(tokenHash) {
      await db.query('UPDATE auth_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [tokenHash]);
    },

    async purgeExpired() {
      return (await db.query(`DELETE FROM auth_sessions WHERE expires_at < now() - interval '30 days'`)).rowCount;
    },
  };
}
