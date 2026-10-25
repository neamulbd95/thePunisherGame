import { newFriendCode } from '../utils/crypto.js';

const PUBLIC_COLS = 'id, display_name, avatar_url, friend_code, fb_friends_granted, created_at, last_login_at';

export const toPublicPlayer = (row) =>
  row && {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    friendCode: row.friend_code,
    facebookFriendsEnabled: row.fb_friends_granted,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };

export function playersRepo(db) {
  return {
    async findById(id, q = db) {
      return (await q.query(`SELECT ${PUBLIC_COLS} FROM players WHERE id = $1`, [id])).rows[0] ?? null;
    },

    async findByFacebookId(fbId, q = db) {
      return (await q.query(`SELECT ${PUBLIC_COLS} FROM players WHERE facebook_user_id = $1`, [fbId])).rows[0] ?? null;
    },

    async findFacebookId(id) {
      return (await db.query('SELECT facebook_user_id FROM players WHERE id = $1', [id])).rows[0]?.facebook_user_id ?? null;
    },

    async findByFriendCode(code, q = db) {
      return (await q.query(`SELECT ${PUBLIC_COLS} FROM players WHERE friend_code = $1`, [code])).rows[0] ?? null;
    },

    /** Insert or update by Facebook id in one statement, so concurrent first logins cannot create duplicates. */
    async upsertFacebookPlayer({ facebookUserId, displayName, avatarUrl }, q = db) {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const { rows } = await q.query(
            `INSERT INTO players (facebook_user_id, display_name, avatar_url, friend_code, last_login_at)
             VALUES ($1, $2, $3, $4, now())
             ON CONFLICT (facebook_user_id) DO UPDATE
               SET avatar_url = EXCLUDED.avatar_url, last_login_at = now(), updated_at = now()
             RETURNING ${PUBLIC_COLS}, (xmax = 0) AS inserted`,
            [facebookUserId, displayName, avatarUrl, newFriendCode()],
          );
          return rows[0];
        } catch (err) {
          // friend_code collision (extremely unlikely): retry with a new code.
          if (err.code === '23505' && /friend_code/.test(err.constraint ?? err.message)) continue;
          throw err;
        }
      }
      throw new Error('could not allocate a friend code');
    },

    async updateDisplayName(id, displayName) {
      return (
        await db.query(
          `UPDATE players SET display_name = $2, updated_at = now() WHERE id = $1 RETURNING ${PUBLIC_COLS}`,
          [id, displayName],
        )
      ).rows[0] ?? null;
    },

    async setFriendsPermission(id, granted, q = db) {
      await q.query(
        `UPDATE players SET fb_friends_granted = $2, fb_friends_synced_at = CASE WHEN $2 THEN now() ELSE NULL END
         WHERE id = $1`,
        [id, granted],
      );
    },

    async deleteById(id) {
      return (await db.query('DELETE FROM players WHERE id = $1', [id])).rowCount;
    },

    async deleteByFacebookId(fbId) {
      return (await db.query('DELETE FROM players WHERE facebook_user_id = $1', [fbId])).rowCount;
    },
  };
}
