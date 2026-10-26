import { newToken, sha256, newRecoveryCode, normalizeRecoveryCode, safeEqualHex } from '../utils/crypto.js';
import { nicknameProblem, parseHandle } from '../utils/nickname.js';
import { unauthorized, unprocessable } from '../utils/errors.js';

const SESSION_TOUCH_MS = 5 * 60 * 1000;
const hashRecovery = (code) => sha256(normalizeRecoveryCode(code));

/**
 * Players are anonymous: a nickname, a server-assigned #tag, and this browser (a long-lived HttpOnly session cookie).
 * A recovery code (only its hash is stored) lets the same player continue on another browser or after clearing data.
 */
export function createAuthService({ env, playersRepo, sessionsRepo }) {
  /** Opens a server-side session and returns the raw token (only its hash is stored). */
  async function startSession(playerId) {
    const token = newToken();
    const expiresAt = new Date(Date.now() + env.sessionTtlMs);
    await sessionsRepo.create({ playerId, tokenHash: sha256(token), expiresAt });
    return { token, expiresAt };
  }

  return {
    /** Creates a new player. The recovery code is returned once and never stored in clear text. */
    async register(nickname) {
      const problem = nicknameProblem(nickname);
      if (problem) throw unprocessable('That nickname cannot be used', [{ field: 'nickname', message: problem }]);
      const recoveryCode = newRecoveryCode();
      const player = await playersRepo.createPlayer({ nickname, recoveryHash: hashRecovery(recoveryCode) });
      const { token, expiresAt } = await startSession(player.id);
      return { token, expiresAt, player, recoveryCode };
    },

    /** Continue as an existing player on a new device with "Nickname#0042" + the recovery code. */
    async recover(handle, recoveryCode) {
      const parsed = parseHandle(handle);
      // One answer for every failure so nobody can probe which names exist.
      const fail = () => unauthorized('No player matches that name and recovery code');
      if (!parsed) throw fail();
      const row = await playersRepo.findForRecovery(parsed.nickname, parsed.tag);
      if (!row?.recovery_hash || !safeEqualHex(hashRecovery(recoveryCode), row.recovery_hash)) throw fail();
      await playersRepo.touchLogin(row.id);
      const { token, expiresAt } = await startSession(row.id);
      return { token, expiresAt, player: await playersRepo.findById(row.id) };
    },

    /** Replaces the recovery code (the old one stops working). */
    async newRecoveryCode(playerId) {
      const code = newRecoveryCode();
      await playersRepo.setRecoveryHash(playerId, hashRecovery(code));
      return code;
    },

    /** Resolves a raw cookie token to the player, or throws 401. */
    async authenticate(rawToken) {
      if (!rawToken || typeof rawToken !== 'string' || rawToken.length > 200) throw unauthorized();
      const hash = sha256(rawToken);
      const session = await sessionsRepo.findValid(hash);
      if (!session) throw unauthorized('Session expired or invalid');
      if (!session.last_used_at || Date.now() - new Date(session.last_used_at).getTime() > SESSION_TOUCH_MS) {
        await sessionsRepo.touch(session.id).catch(() => {});
      }
      const player = await playersRepo.findById(session.player_id);
      if (!player) throw unauthorized();
      return { player, tokenHash: hash, expiresAt: session.expires_at };
    },

    async logout(rawToken) {
      if (rawToken) await sessionsRepo.revoke(sha256(rawToken));
    },
  };
}
