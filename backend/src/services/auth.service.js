import { newToken, sha256 } from '../utils/crypto.js';
import { unauthorized, forbidden } from '../utils/errors.js';

const SESSION_TOUCH_MS = 5 * 60 * 1000;

export function createAuthService({ db, env, logger, facebook, playersRepo, sessionsRepo, friendsRepo }) {
  /** Refreshes the cached list of Facebook friends who also play. Never throws: login must still work. */
  async function syncFriends(playerId, accessToken, granted) {
    try {
      if (!granted) {
        await db.tx(async (t) => {
          await friendsRepo.clearFacebookCache(playerId, t);
          await playersRepo.setFriendsPermission(playerId, false, t);
        });
        return false;
      }
      const ids = await facebook.fetchAppFriends(accessToken);
      await db.tx(async (t) => {
        await friendsRepo.replaceFacebookCache(playerId, ids, t);
        await playersRepo.setFriendsPermission(playerId, true, t);
      });
      return true;
    } catch (err) {
      logger.warn({ code: err.code, status: err.status }, 'facebook friends sync failed');
      return false;
    }
  }

  return {
    async loginWithFacebook(accessToken) {
      // Identity always comes from Meta, never from the request body.
      const profile = await facebook.verifyAndFetchProfile(accessToken);
      const row = await playersRepo.upsertFacebookPlayer(profile);
      const token = newToken();
      const expiresAt = new Date(Date.now() + env.sessionTtlMs);
      await sessionsRepo.create({ playerId: row.id, tokenHash: sha256(token), expiresAt });
      await syncFriends(row.id, accessToken, profile.grantedFriends);
      const player = await playersRepo.findById(row.id);
      return { token, expiresAt, player, isNew: row.inserted === true };
    },

    /** Re-checks a fresh Facebook token for the *current* player and refreshes the friends cache. */
    async syncFacebookFriends(playerId, accessToken) {
      const profile = await facebook.verifyAndFetchProfile(accessToken);
      const ownFbId = await playersRepo.findFacebookId(playerId);
      if (!ownFbId || ownFbId !== profile.facebookUserId) throw forbidden('Token belongs to a different Facebook user');
      const ok = await syncFriends(playerId, accessToken, profile.grantedFriends);
      return { enabled: ok };
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
