import { Router } from 'express';
import { handler, validate } from '../middleware/common.js';
import { updateProfileBody } from '../validators/schemas.js';
import { ok } from '../utils/response.js';
import { toPublicPlayer } from '../repositories/players.repo.js';

export function playerRoutes({ env, playersRepo, gamesRepo, leaderboardRepo, authService, requireAuth }) {
  const r = Router();
  r.use(requireAuth);

  r.get('/me', handler(async (req, res) => ok(res, { player: toPublicPlayer(req.player) })));

  r.get(
    '/me/stats',
    handler(async (req, res) => {
      const stats = await gamesRepo.playerStats(req.player.id);
      const rank = await leaderboardRepo.rank({
        since: null, villain: null, playerIds: null, limit: 1, offset: 0, meId: req.player.id,
      });
      ok(res, {
        gamesPlayed: stats.games_played,
        highestScore: stats.highest_score,
        totalPerfects: stats.total_perfects,
        globalRank: rank.my_rank ?? null,
        rankedPlayers: rank.total,
      });
    }),
  );

  // Players may replace their (Facebook-derived) name with a nickname.
  r.patch(
    '/me',
    validate({ body: updateProfileBody }),
    handler(async (req, res) => {
      const player = await playersRepo.updateDisplayName(req.player.id, req.valid.body.displayName);
      ok(res, { player: toPublicPlayer(player) });
    }),
  );

  // Deletes the player and, via ON DELETE CASCADE, their sessions, scores, friendships and cached friend ids.
  r.delete(
    '/me',
    handler(async (req, res) => {
      await playersRepo.deleteById(req.player.id);
      await authService.logout(req.cookies?.[env.SESSION_COOKIE_NAME]);
      res.clearCookie(env.SESSION_COOKIE_NAME, {
        httpOnly: true, secure: env.cookieSecure, sameSite: env.COOKIE_SAMESITE, path: '/', domain: env.COOKIE_DOMAIN || undefined,
      });
      ok(res, { deleted: true });
    }),
  );

  return r;
}
