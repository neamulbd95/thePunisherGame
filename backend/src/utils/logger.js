import pino from 'pino';

export function createLogger(level = 'info') {
  return pino({
    level,
    // Never let credentials reach the logs.
    redact: {
      paths: ['req.headers.cookie', 'req.headers.authorization', 'accessToken', '*.accessToken', 'signed_request'],
      censor: '[redacted]',
    },
  });
}
