import { Router } from 'express';
import { handler, validate } from '../middleware/common.js';
import { updateProfileBody } from '../validators/schemas.js';
import { ok } from '../utils/response.js';
import { nicknameProblem } from '../utils/nickname.js';
import { unprocessable } from '../utils/errors.js';
import { toPublicPlayer } from '../repositories/players.repo.js';
import { VILLAINS, WEAPON_IDS, villainUnlocked, weaponUnlocked, kickUnlocked } from '../utils/game-rules.js';

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

  // What the player has unlocked, computed from verified scores.
  r.get(
    '/me/progress',
    handler(async (req, res) => {
      const p = await gamesRepo.progress(req.player.id);
      ok(res, {
        totalScore: p.total,
        villainScores: p.per,
        unlocked: {
          villains: VILLAINS.filter((v) => villainUnlocked(p, v)),
          weapons: WEAPON_IDS.filter((w) => weaponUnlocked(p, w)),
          kick: VILLAINS.filter((v) => kickUnlocked(p, v)),
        },
      });
    }),
  );

  // Change nickname: runs the same checks as sign-up and assigns a new #tag.
  r.patch(
    '/me',
    validate({ body: updateProfileBody }),
    handler(async (req, res) => {
      const problem = nicknameProblem(req.valid.body.nickname);
      if (problem) throw unprocessable('That nickname cannot be used', [{ field: 'nickname', message: problem }]);
      const player = await playersRepo.updateNickname(req.player.id, req.valid.body.nickname);
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
