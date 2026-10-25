import { Router } from 'express';
import { handler, validate } from '../middleware/common.js';
import { startGameBody, completeGameBody, uuidParam } from '../validators/schemas.js';
import { ok, created } from '../utils/response.js';

export function gameRoutes({ scoreService, requireAuth, limiters }) {
  const r = Router();
  r.use(requireAuth, limiters.scores);

  r.post(
    '/',
    validate({ body: startGameBody }),
    handler(async (req, res) => created(res, await scoreService.startGame(req.player.id, req.valid.body.villain))),
  );

  r.post(
    '/:id/complete',
    validate({ params: uuidParam, body: completeGameBody }),
    handler(async (req, res) =>
      ok(res, await scoreService.completeGame(req.player.id, req.valid.params.id, req.valid.body)),
    ),
  );

  return r;
}
