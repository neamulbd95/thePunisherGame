import rateLimit from 'express-rate-limit';
import { fail } from '../utils/response.js';

const make = (windowMs, limit) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => fail(res, 429, 'RATE_LIMITED', 'Too many requests, please slow down'),
  });

const passthrough = (_req, _res, next) => next();

/** `enabled=false` is used by tests that are not about rate limiting. */
export function createLimiters(enabled = true) {
  if (!enabled) return { general: passthrough, auth: passthrough, scores: passthrough, friends: passthrough };
  return {
    general: make(15 * 60 * 1000, 600),
    auth: make(15 * 60 * 1000, 30),
    scores: make(60 * 60 * 1000, 120),
    friends: make(60 * 60 * 1000, 30),
  };
}
