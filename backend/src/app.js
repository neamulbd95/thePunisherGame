import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createAuthService } from './services/auth.service.js';
import { createScoreService } from './services/score.service.js';
import { createLeaderboardService } from './services/leaderboard.service.js';
import { createFriendsService } from './services/friends.service.js';
import { playersRepo as makePlayersRepo } from './repositories/players.repo.js';
import { sessionsRepo as makeSessionsRepo } from './repositories/sessions.repo.js';
import { gamesRepo as makeGamesRepo } from './repositories/games.repo.js';
import { leaderboardRepo as makeLeaderboardRepo } from './repositories/leaderboard.repo.js';
import { friendsRepo as makeFriendsRepo } from './repositories/friends.repo.js';
import { csrfGuard, requireAuth, errorHandler, notFoundHandler } from './middleware/common.js';
import { createLimiters } from './middleware/rate-limiter.js';
import { authRoutes } from './routes/auth.routes.js';
import { playerRoutes } from './routes/player.routes.js';
import { gameRoutes } from './routes/game.routes.js';
import { leaderboardRoutes } from './routes/leaderboard.routes.js';
import { friendsRoutes } from './routes/friends.routes.js';
import { shareRoutes } from './routes/share.routes.js';
import { ok, fail } from './utils/response.js';

/**
 * Builds the Express app. Everything external (database, rate limits) is injected
 * so tests can run the real routes against an in-process PostgreSQL.
 */
export function createApp({ env, db, logger, rateLimits = true }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  const playersRepo = makePlayersRepo(db);
  const sessionsRepo = makeSessionsRepo(db);
  const gamesRepo = makeGamesRepo(db);
  const leaderboardRepo = makeLeaderboardRepo(db);
  const friendsRepo = makeFriendsRepo(db);

  const authService = createAuthService({ env, playersRepo, sessionsRepo });
  const scoreService = createScoreService({ db, logger, gamesRepo, leaderboardRepo });
  const leaderboardService = createLeaderboardService({ leaderboardRepo, friendsRepo });
  const friendsService = createFriendsService({ friendsRepo, playersRepo });

  const limiters = createLimiters(rateLimits);
  const auth = requireAuth(authService, env);

  // HTTPS-only in production (TLS is terminated by the host; it tells us via X-Forwarded-Proto).
  if (env.isProd) {
    app.use((req, res, next) => {
      if (req.path.startsWith('/api/health') || req.secure) return next();
      return res.redirect(301, `${env.API_PUBLIC_URL}${req.originalUrl}`);
    });
  }

  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin || env.frontendOrigins.includes(origin)) return cb(null, true);
        cb(new Error('CORS_NOT_ALLOWED'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-Requested-With'],
      maxAge: 600,
    }),
  );

  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      if (req.path.startsWith('/api/health')) return;
      logger.info({ method: req.method, path: req.path, status: res.statusCode, ms: Number((process.hrtime.bigint() - start) / 1_000_000n) }, 'request');
    });
    next();
  });

  // ----- health (no auth, no CSRF, no rate limit) -----
  app.get('/api/health/live', (_req, res) => ok(res, { status: 'ok' }));
  app.get('/api/health/ready', async (_req, res) => {
    try {
      await db.query('SELECT 1');
      ok(res, { status: 'ready' });
    } catch (err) {
      logger.error({ code: err.code }, 'readiness check failed');
      fail(res, 503, 'NOT_READY', 'Database unavailable');
    }
  });

  app.use('/api/v1', limiters.general);
  app.use(cookieParser());
  app.use(express.json({ limit: '64kb' }));
  app.use(csrfGuard(env));

  const common = { env, limiters, requireAuth: auth, authService };
  app.use('/api/v1/auth', authRoutes(common));
  app.use('/api/v1/players', playerRoutes({ ...common, playersRepo, gamesRepo, leaderboardRepo }));
  app.use('/api/v1/game-sessions', gameRoutes({ ...common, scoreService }));
  app.use('/api/v1/leaderboards', leaderboardRoutes({ ...common, leaderboardService }));
  app.use('/api/v1/friends', friendsRoutes({ ...common, friendsService }));
  app.use('/api/v1/share', shareRoutes({ env, db }));

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  app.locals.repos = { playersRepo, sessionsRepo, gamesRepo, friendsRepo };
  return app;
}
