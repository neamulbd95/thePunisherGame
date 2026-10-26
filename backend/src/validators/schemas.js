import { z } from 'zod';
import { VILLAINS, WEAPON_IDS, END_REASONS, STAGES, MAX_MISSES, TIME_LIMIT_MS } from '../utils/game-rules.js';
import { PERIODS } from '../utils/periods.js';

import { NICKNAME_MIN, NICKNAME_MAX } from '../utils/nickname.js';

// Letters of any script (Bengali too), digits, _ and -; the blocklist and reserved names are checked in the auth service.
const nickname = z
  .string()
  .trim()
  .min(NICKNAME_MIN, `Use ${NICKNAME_MIN}-${NICKNAME_MAX} characters.`)
  .max(NICKNAME_MAX, `Use ${NICKNAME_MIN}-${NICKNAME_MAX} characters.`)
  .regex(/^[\p{L}\p{M}\p{N}_-]+$/u, 'Use letters, numbers, underscore or dash (no spaces or #)');

export const registerBody = z.strictObject({ nickname });

export const recoverBody = z.strictObject({
  handle: z.string().trim().min(5).max(40), // "Nickname#0042"
  recoveryCode: z.string().trim().min(8).max(40),
});

export const startGameBody = z.strictObject({
  villain: z.enum(VILLAINS),
  weapon: z.enum(WEAPON_IDS).default('hand'),
});

const round = z.strictObject({
  spot: z.enum(['L', 'R', 'S', 'B']),
  grade: z.enum(['PERFECT', 'GREAT', 'GOOD', 'MISS']),
  force: z.number().min(0).max(1).optional(),
});

export const completeGameBody = z.strictObject({
  score: z.number().int().min(0).max(5_000_000),
  villain: z.enum(VILLAINS),
  rounds: z.array(round).max(STAGES + MAX_MISSES),
  // Defaults keep a browser that still has the previous front end cached working (those runs ended on lives).
  end: z.enum(END_REASONS).default('lives'),
  timeLeftMs: z.number().int().min(0).max(TIME_LIMIT_MS).default(0),
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

export const updateProfileBody = registerBody; // { nickname }: the server assigns a new #tag
