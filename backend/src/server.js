import { parseEnv } from './config/env.js';
import { createDatabase } from './config/database.js';
import { createLogger } from './utils/logger.js';
import { createApp } from './app.js';

let env;
try {
  env = parseEnv();
} catch (err) {
  // Fail fast with a readable message; nothing sensitive is printed.
  console.error(err.message);
  process.exit(1);
}

const logger = createLogger(env.LOG_LEVEL);
const db = createDatabase(env, logger);
const app = createApp({ env, db, logger });

// Render requires binding to 0.0.0.0 on process.env.PORT.
const server = app.listen(env.PORT, '0.0.0.0', () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API listening');
});

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  logger.info({ signal }, 'shutting down');
  server.close(async () => {
    await db.close().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => logger.error({ err: String(err) }, 'unhandled rejection'));
