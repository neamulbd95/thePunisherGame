import { Router } from 'express';
import { handler, validate } from '../middleware/common.js';
import { registerBody, recoverBody } from '../validators/schemas.js';
import { created, ok } from '../utils/response.js';
import { toPublicPlayer } from '../repositories/players.repo.js';

export function authRoutes({ env, authService, requireAuth, limiters }) {
  const r = Router();

  const cookieOpts = () => ({
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.COOKIE_SAMESITE,
    path: '/',
    domain: env.COOKIE_DOMAIN || undefined,
  });
  const setSession = (res, token, expiresAt) => res.cookie(env.SESSION_COOKIE_NAME, token, { ...cookieOpts(), expires: expiresAt });

  // Create a player: pick a nickname, get Nickname#tag, a device session and a one-time recovery code.
  r.post(
    '/register',
    limiters.signup,
    validate({ body: registerBody }),
    handler(async (req, res) => {
      const { token, expiresAt, player, recoveryCode } = await authService.register(req.valid.body.nickname);
      setSession(res, token, expiresAt);
      created(res, { player: toPublicPlayer(player), recoveryCode, sessionExpiresAt: expiresAt });
    }),
  );

  // Continue as an existing player on another browser.
  r.post(
    '/recover',
    limiters.auth,
    validate({ body: recoverBody }),
    handler(async (req, res) => {
      const { token, expiresAt, player } = await authService.recover(req.valid.body.handle, req.valid.body.recoveryCode);
      setSession(res, token, expiresAt);
      ok(res, { player: toPublicPlayer(player), sessionExpiresAt: expiresAt });
    }),
  );

  r.get(
    '/me',
    requireAuth,
    handler(async (req, res) => ok(res, { player: toPublicPlayer(req.player) })),
  );

  // A fresh recovery code; the previous one stops working.
  r.post(
    '/recovery-code',
    requireAuth,
    limiters.auth,
    handler(async (req, res) => ok(res, { recoveryCode: await authService.newRecoveryCode(req.player.id) })),
  );

  r.post(
    '/logout',
    handler(async (req, res) => {
      await authService.logout(req.cookies?.[env.SESSION_COOKIE_NAME]);
      res.clearCookie(env.SESSION_COOKIE_NAME, cookieOpts());
      ok(res, { loggedOut: true });
    }),
  );

  return r;
}
