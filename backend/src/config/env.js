import 'dotenv/config';
import { z } from 'zod';

const bool = z.enum(['true', 'false']).default('false').transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_DIRECT_URL: z.string().optional(),
  DATABASE_SSL: z.enum(['auto', 'true', 'false']).default('auto'),

  // Comma separated list of allowed browser origins (the game front end).
  FRONTEND_URL: z.string().min(1),
  API_PUBLIC_URL: z.string().min(1),

  FACEBOOK_APP_ID: z.string().default(''),
  FACEBOOK_APP_SECRET: z.string().default(''),
  FACEBOOK_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/, 'e.g. v25.0').default('v25.0'),
  // Local development only: accept "mock:<id>:<name>" tokens instead of calling Meta.
  FACEBOOK_MOCK: bool,

  SESSION_COOKIE_NAME: z.string().default('game_session'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  // "lax" works when the game and API share a site (same-origin proxy or sibling subdomains);
  // "none" is required when they sit on unrelated domains and needs HTTPS.
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_DOMAIN: z.string().optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
});

export function parseEnv(source = process.env) {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  const env = parsed.data;
  const isProd = env.NODE_ENV === 'production';
  const problems = [];

  if (isProd && env.FACEBOOK_MOCK) problems.push('FACEBOOK_MOCK must never be enabled in production');
  if (!env.FACEBOOK_MOCK && (!env.FACEBOOK_APP_ID || !env.FACEBOOK_APP_SECRET)) {
    problems.push('FACEBOOK_APP_ID and FACEBOOK_APP_SECRET are required unless FACEBOOK_MOCK=true');
  }
  if (isProd && !env.API_PUBLIC_URL.startsWith('https://')) problems.push('API_PUBLIC_URL must be https in production');
  if (env.COOKIE_SAMESITE === 'none' && !isProd && !env.API_PUBLIC_URL.startsWith('https://')) {
    problems.push('COOKIE_SAMESITE=none needs an https API (browsers reject Secure cookies on http)');
  }
  const origins = env.FRONTEND_URL.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  for (const o of origins) {
    try {
      const u = new URL(o);
      if (isProd && u.protocol !== 'https:') problems.push(`FRONTEND_URL origin must be https in production: ${o}`);
    } catch {
      problems.push(`FRONTEND_URL contains an invalid URL: ${o}`);
    }
  }
  if (problems.length) throw new Error(`Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);

  return {
    ...env,
    isProd,
    frontendOrigins: origins,
    cookieSecure: isProd || env.COOKIE_SAMESITE === 'none',
    sessionTtlMs: env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}
