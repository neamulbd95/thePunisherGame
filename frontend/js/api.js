// Thin fetch wrapper for the REST API. Cookies carry the session (HttpOnly, set by the server).
const cfg = window.PUNISHER_CONFIG;

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api(path, { method = 'GET', body, timeoutMs = 10000 } = {}) {
  let res;
  try {
    res = await fetch(cfg.API_BASE_URL + path, {
      method,
      credentials: 'include',
      headers: {
        'X-Requested-With': 'fetch', // required by the server's CSRF guard on mutations
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError';
    throw new ApiError(0, timedOut ? 'TIMEOUT' : 'NETWORK', timedOut ? 'The server is slow to respond' : 'Cannot reach the server');
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* not JSON */
  }
  if (!res.ok || !json?.success) {
    const e = json?.error;
    throw new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return json.data;
}

export const userMessage = (err) =>
  err?.code === 'NETWORK' || err?.code === 'TIMEOUT'
    ? 'Server unreachable. It may be waking up — try again in a few seconds.'
    : err?.status === 429
      ? 'Too many requests. Please wait a moment.'
      : err?.message || 'Something went wrong.';
