import { Router } from 'express';
import { handler, validate } from '../middleware/common.js';
import { friendRequestBody, uuidParam } from '../validators/schemas.js';
import { ok, created } from '../utils/response.js';

export function friendsRoutes({ friendsService, requireAuth, limiters }) {
  const r = Router();
  r.use(requireAuth);

  r.get('/', handler(async (req, res) => ok(res, { friends: await friendsService.list(req.player.id) })));

  r.delete(
    '/:id',
    validate({ params: uuidParam }),
    handler(async (req, res) => {
      await friendsService.remove(req.player.id, req.valid.params.id);
      ok(res, { removed: true });
    }),
  );

  r.get('/requests', handler(async (req, res) => {
    const rows = await friendsService.listRequests(req.player.id);
    ok(res, {
      requests: rows.map((x) => ({
        id: x.id, direction: x.direction, displayName: x.display_name, avatarUrl: x.avatar_url, createdAt: x.created_at,
      })),
    });
  }));

  r.post(
    '/requests',
    limiters.friends,
    validate({ body: friendRequestBody }),
    handler(async (req, res) => created(res, await friendsService.sendRequest(req.player.id, req.valid.body.friendCode))),
  );

  r.post(
    '/requests/:id/accept',
    validate({ params: uuidParam }),
    handler(async (req, res) => ok(res, await friendsService.accept(req.player.id, req.valid.params.id))),
  );

  r.post(
    '/requests/:id/reject',
    validate({ params: uuidParam }),
    handler(async (req, res) => {
      await friendsService.reject(req.player.id, req.valid.params.id);
      ok(res, { rejected: true });
    }),
  );

  return r;
}
