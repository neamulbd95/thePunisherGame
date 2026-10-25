import { Router } from 'express';
import { handler, validate } from '../middleware/common.js';
import { leaderboardQuery } from '../validators/schemas.js';
import { ok } from '../utils/response.js';
import { unauthorized } from '../utils/errors.js';

export function leaderboardRoutes({ leaderboardService, authService, env }) {
  const r = Router();

  // Public boards work for guests too; a valid session only adds "my rank".
  const optionalAuth = async (req, _res, next) => {
    try {
      const raw = req.cookies?.[env.SESSION_COOKIE_NAME];
      if (raw) req.player = (await authService.authenticate(raw)).player;
    } catch {
      /* treat as guest */
    }
    next();
  };

  const needAuth = (req, _res, next) => {
    if (req.player) return next();
    next(unauthorized());
  };

  r.get(
    '/global',
    optionalAuth,
    validate({ query: leaderboardQuery }),
    handler(async (req, res) => ok(res, await leaderboardService.global(req.valid.query, req.player?.id ?? null))),
  );

  r.get(
    '/game-friends',
    optionalAuth,
    needAuth,
    validate({ query: leaderboardQuery }),
    handler(async (req, res) => ok(res, await leaderboardService.gameFriends(req.valid.query, req.player.id))),
  );

  r.get(
    '/facebook-friends',
    optionalAuth,
    needAuth,
    validate({ query: leaderboardQuery }),
    handler(async (req, res) => ok(res, await leaderboardService.facebookFriends(req.valid.query, req.player.id))),
  );

  return r;
}
