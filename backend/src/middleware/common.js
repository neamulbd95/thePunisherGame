import { unprocessable, forbidden, unauthorized } from '../utils/errors.js';
import { fail } from '../utils/response.js';

/** Validates req.body / req.query / req.params with zod and exposes the parsed values on req.valid. */
export const validate = (schemas) => (req, _res, next) => {
  req.valid = req.valid ?? {};
  for (const [key, schema] of Object.entries(schemas)) {
    const parsed = schema.safeParse(req[key]);
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })).slice(0, 10);
      return next(unprocessable('Request validation failed', details));
    }
    req.valid[key] = parsed.data;
  }
  next();
};

/** Wraps an async handler for readability; Express 5 already forwards rejected promises to next(). */
export const handler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function requireAuth(authService, env) {
  return async (req, _res, next) => {
    try {
      const ctx = await authService.authenticate(req.cookies?.[env.SESSION_COOKIE_NAME]);
      req.player = ctx.player;
      req.sessionTokenHash = ctx.tokenHash;
      next();
    } catch (err) {
      next(err instanceof Error ? err : unauthorized());
    }
  };
}

/**
 * CSRF defence for cookie-authenticated mutations. Two independent checks:
 *  1. the request must carry a custom header, which a cross-site form or <img> cannot add and
 *     a cross-origin fetch cannot send without passing our strict CORS preflight;
 *  2. if the browser sent an Origin header it must be one of our front-end origins.
 */
export function csrfGuard(env) {
  const safe = new Set(['GET', 'HEAD', 'OPTIONS']);
  return (req, _res, next) => {
    if (safe.has(req.method)) return next();
    if (req.get('x-requested-with') !== 'fetch') return next(forbidden('Missing CSRF header', 'CSRF_HEADER_MISSING'));
    const origin = req.get('origin');
    if (origin && !env.frontendOrigins.includes(origin)) return next(forbidden('Origin not allowed', 'CSRF_ORIGIN'));
    next();
  };
}

export function notFoundHandler(_req, res) {
  fail(res, 404, 'NOT_FOUND', 'Route not found');
}

export function errorHandler(logger) {
  return (err, req, res, _next) => {
    if (err?.type === 'entity.too.large') return fail(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
    if (err?.type === 'entity.parse.failed') return fail(res, 400, 'BAD_JSON', 'Malformed JSON body');
    if (err?.message === 'CORS_NOT_ALLOWED') return fail(res, 403, 'CORS', 'Origin not allowed');
    if (err?.status && err?.code) {
      if (err.status >= 500) logger.error({ code: err.code, path: req.path }, err.message);
      return fail(res, err.status, err.code, err.message, err.details);
    }
    // Unknown error: log it, return nothing internal (no SQL text, no stack).
    logger.error({ err: { message: err?.message, code: err?.code, stack: err?.stack }, path: req.path }, 'unhandled error');
    const dbDown = ['ECONNREFUSED', 'ETIMEDOUT', '57P01', '08006', '08001', '53300'].includes(err?.code);
    if (dbDown) return fail(res, 503, 'SERVICE_UNAVAILABLE', 'Service temporarily unavailable');
    return fail(res, 500, 'INTERNAL_ERROR', 'Something went wrong');
  };
}
