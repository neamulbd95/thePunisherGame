import express, { Router } from 'express';
import crypto from 'node:crypto';
import { handler, validate } from '../middleware/common.js';
import { facebookLoginBody } from '../validators/schemas.js';
import { ok } from '../utils/response.js';
import { toPublicPlayer } from '../repositories/players.repo.js';
import { parseSignedRequest } from '../services/facebook.service.js';
import { badRequest, notFound } from '../utils/errors.js';

export function authRoutes({ env, authService, playersRepo, db, requireAuth, limiters }) {
  const r = Router();

  const cookieOpts = () => ({
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.COOKIE_SAMESITE,
    path: '/',
    domain: env.COOKIE_DOMAIN || undefined,
  });

  r.post(
    '/facebook',
    limiters.auth,
    validate({ body: facebookLoginBody }),
    handler(async (req, res) => {
      const { token, expiresAt, player, isNew } = await authService.loginWithFacebook(req.valid.body.accessToken);
      res.cookie(env.SESSION_COOKIE_NAME, token, { ...cookieOpts(), expires: expiresAt });
      ok(res, { player: toPublicPlayer(player), isNew, sessionExpiresAt: expiresAt });
    }),
  );

  r.get(
    '/me',
    requireAuth,
    handler(async (req, res) => ok(res, { player: toPublicPlayer(req.player) })),
  );

  r.post(
    '/logout',
    handler(async (req, res) => {
      await authService.logout(req.cookies?.[env.SESSION_COOKIE_NAME]);
      res.clearCookie(env.SESSION_COOKIE_NAME, cookieOpts());
      ok(res, { loggedOut: true });
    }),
  );

  // ----- Meta "Data Deletion Request Callback" (server to server, form encoded) -----
  r.post(
    '/facebook/data-deletion',
    express.urlencoded({ extended: false, limit: '8kb' }),
    handler(async (req, res) => {
      if (!env.FACEBOOK_APP_SECRET) throw badRequest('Not configured');
      const data = parseSignedRequest(req.body?.signed_request, env.FACEBOOK_APP_SECRET);
      if (!data?.user_id) throw badRequest('signed_request has no user_id');
      const code = crypto.randomBytes(9).toString('base64url');
      const removed = await playersRepo.deleteByFacebookId(String(data.user_id));
      await db.query(
        `INSERT INTO data_deletion_requests (confirmation_code, completed_at, status) VALUES ($1, now(), $2)`,
        [code, removed ? 'completed' : 'not_found'],
      );
      // Meta expects exactly { url, confirmation_code }.
      res.json({ url: `${env.frontendOrigins[0]}/deletion.html?code=${code}`, confirmation_code: code });
    }),
  );

  r.get(
    '/facebook/data-deletion/:code',
    handler(async (req, res) => {
      const { rows } = await db.query(
        'SELECT status, requested_at, completed_at FROM data_deletion_requests WHERE confirmation_code = $1',
        [String(req.params.code).slice(0, 40)],
      );
      if (!rows[0]) throw notFound('Unknown confirmation code');
      ok(res, { status: rows[0].status, requestedAt: rows[0].requested_at, completedAt: rows[0].completed_at });
    }),
  );

  return r;
}
