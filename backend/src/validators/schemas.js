import { z } from 'zod';
import { VILLAINS } from '../utils/game-rules.js';
import { PERIODS } from '../utils/periods.js';

export const facebookLoginBody = z.strictObject({
  accessToken: z.string().min(10).max(4096),
});

export const facebookSyncBody = facebookLoginBody;

export const startGameBody = z.strictObject({
  villain: z.enum(VILLAINS),
});

const round = z.strictObject({
  spot: z.enum(['L', 'R', 'S']),
  grade: z.enum(['PERFECT', 'GREAT', 'GOOD', 'MISS']),
  force: z.number().min(0).max(1).optional(),
});

export const completeGameBody = z.strictObject({
  score: z.number().int().min(0).max(5_000_000),
  villain: z.enum(VILLAINS),
  rounds: z.array(round).min(3).max(400),
});

export const uuidParam = z.strictObject({ id: z.uuid() });

export const leaderboardQuery = z.object({
  period: z.enum(PERIODS).default('all-time'),
  villain: z.enum(VILLAINS).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export const friendRequestBody = z.strictObject({
  friendCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z2-9]{6,16}$/, 'Invalid friend code'),
});

export const updateProfileBody = z.strictObject({
  displayName: z
    .string()
    .trim()
    .min(2)
    .max(24)
    // letters (any script, so Bengali names work), digits, spaces and a few separators
    .regex(/^[\p{L}\p{M}\p{N} ._-]+$/u, 'Use letters, numbers, spaces, dot, dash or underscore'),
});
