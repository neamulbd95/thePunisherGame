import crypto from 'node:crypto';
import { newFriendCode } from '../utils/crypto.js';
import { formatHandle } from '../utils/nickname.js';
import { conflict } from '../utils/errors.js';

const PUBLIC_COLS = 'id, display_name, nickname, tag, avatar_url, friend_code, created_at, last_login_at';

export const toPublicPlayer = (row) =>
  row && {
    id: row.id,
    displayName: row.display_name, // "Nickname#0042"
    nickname: row.nickname,
    tag: row.tag,
    avatarUrl: row.avatar_url,
    friendCode: row.friend_code,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };

const randomTag = () => crypto.randomInt(0, 10_000);
const MAX_TAG_TRIES = 40;

export function playersRepo(db) {
  return {
    async findById(id, q = db) {
      return (await q.query(`SELECT ${PUBLIC_COLS} FROM players WHERE id = $1`, [id])).rows[0] ?? null;
    },

    async findByFriendCode(code, q = db) {
      return (await q.query(`SELECT ${PUBLIC_COLS} FROM players WHERE friend_code = $1`, [code])).rows[0] ?? null;
    },

    /** For recovery: the row plus its recovery hash. Never returned to clients. */
    async findForRecovery(nickname, tag) {
      return (
        (
          await db.query(
            `SELECT ${PUBLIC_COLS}, recovery_hash FROM players WHERE lower(nickname) = lower($1) AND tag = $2`,
            [nickname, tag],
          )
        ).rows[0] ?? null
      );
    },

    /**
     * Creates a player with a random free tag for this nickname. The unique index decides: on a collision
     * (same nickname + tag, or a friend-code clash) we simply draw again.
     */
    async createPlayer({ nickname, recoveryHash }, q = db) {
      for (let attempt = 0; attempt < MAX_TAG_TRIES; attempt++) {
        const tag = randomTag();
        try {
          const { rows } = await q.query(
            `INSERT INTO players (display_name, nickname, tag, recovery_hash, friend_code, last_login_at)
             VALUES ($1, $2, $3, $4, $5, now()) RETURNING ${PUBLIC_COLS}`,
            [formatHandle(nickname, tag), nickname, tag, recoveryHash, newFriendCode()],
          );
          return rows[0];
        } catch (err) {
          if (err.code === '23505') continue;
          throw err;
        }
      }
      throw conflict('That nickname is very popular, please pick another one', 'NICKNAME_BUSY');
    },

    /** Changing the nickname gives a new tag, unless only the letter case changed. */
    async updateNickname(id, nickname) {
      const cur = (await db.query('SELECT nickname, tag FROM players WHERE id = $1', [id])).rows[0];
      if (!cur) return null;
      if (cur.nickname && cur.nickname.toLowerCase() === nickname.toLowerCase()) {
        return (
          await db.query(
            `UPDATE players SET nickname = $2, display_name = $3, updated_at = now() WHERE id = $1 RETURNING ${PUBLIC_COLS}`,
            [id, nickname, formatHandle(nickname, cur.tag)],
          )
        ).rows[0];
      }
      for (let attempt = 0; attempt < MAX_TAG_TRIES; attempt++) {
        const tag = randomTag();
        try {
          return (
            await db.query(
              `UPDATE players SET nickname = $2, tag = $3, display_name = $4, updated_at = now() WHERE id = $1 RETURNING ${PUBLIC_COLS}`,
              [id, nickname, tag, formatHandle(nickname, tag)],
            )
          ).rows[0];
        } catch (err) {
          if (err.code === '23505') continue;
          throw err;
        }
      }
      throw conflict('That nickname is very popular, please pick another one', 'NICKNAME_BUSY');
    },

    async setRecoveryHash(id, hash) {
      await db.query('UPDATE players SET recovery_hash = $2, updated_at = now() WHERE id = $1', [id, hash]);
    },

    async touchLogin(id) {
      await db.query('UPDATE players SET last_login_at = now() WHERE id = $1', [id]);
    },

    async deleteById(id) {
      return (await db.query('DELETE FROM players WHERE id = $1', [id])).rowCount;
    },
  };
}
