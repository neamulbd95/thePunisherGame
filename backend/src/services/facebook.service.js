import crypto from 'node:crypto';
import { hmacHex } from '../utils/crypto.js';
import { unauthorized, unavailable, badRequest } from '../utils/errors.js';

/**
 * Talks to Meta's Graph API. Every call is server-side; the App Secret never leaves the backend.
 *  - debug_token validates the user token (valid, our app id, not expired, a USER token)
 *  - /me returns only the minimal profile fields we need
 *  - /me/friends (permission user_friends) lists friends who ALSO use this app
 * `fetchImpl` is injectable so tests mock Meta completely.
 */
export function createFacebookService(env, { fetchImpl = fetch } = {}) {
  const base = `https://graph.facebook.com/${env.FACEBOOK_GRAPH_API_VERSION}`;
  const appToken = `${env.FACEBOOK_APP_ID}|${env.FACEBOOK_APP_SECRET}`;
  const proof = (token) => hmacHex(env.FACEBOOK_APP_SECRET, token);

  async function graph(path, params) {
    const url = `${base}${path}?${new URLSearchParams(params)}`;
    let res;
    try {
      res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    } catch {
      throw unavailable('Could not reach Facebook', 'FACEBOOK_UNREACHABLE');
    }
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON error page */
    }
    if (!res.ok) {
      // 4xx from Meta nearly always means a bad/expired token; anything else is an upstream problem.
      if (res.status >= 400 && res.status < 500) throw unauthorized('Facebook rejected the access token');
      throw unavailable('Facebook is temporarily unavailable', 'FACEBOOK_UNAVAILABLE');
    }
    return body;
  }

  function mockProfile(token) {
    // mock:<id>:<name>[:friends=<id>,<id>] — development only (guarded in env.js).
    const m = /^mock:([A-Za-z0-9_-]{1,40}):([^:]{1,60})(?::friends=([A-Za-z0-9_,-]*))?$/.exec(token);
    if (!m) throw unauthorized('Invalid mock token');
    return { id: m[1], name: m[2], friends: m[3] ? m[3].split(',').filter(Boolean) : null };
  }

  return {
    /** Returns { facebookUserId, displayName, avatarUrl, grantedFriends } or throws 401/503. */
    async verifyAndFetchProfile(accessToken) {
      if (env.FACEBOOK_MOCK) {
        const p = mockProfile(accessToken);
        return { facebookUserId: p.id, displayName: p.name, avatarUrl: null, grantedFriends: p.friends !== null };
      }
      const dbg = await graph('/debug_token', { input_token: accessToken, access_token: appToken });
      const d = dbg?.data;
      if (!d || d.is_valid !== true) throw unauthorized('Facebook token is not valid');
      if (String(d.app_id) !== String(env.FACEBOOK_APP_ID)) throw unauthorized('Facebook token was issued for another app');
      if (d.type && d.type !== 'USER') throw unauthorized('Facebook token is not a user token');
      if (d.expires_at && d.expires_at * 1000 < Date.now()) throw unauthorized('Facebook token expired');
      if (!d.user_id) throw unauthorized('Facebook token has no user');

      const me = await graph('/me', {
        fields: 'id,first_name,last_name,picture.width(128).height(128)',
        access_token: accessToken,
        appsecret_proof: proof(accessToken),
      });
      // The id in the profile must match the id Meta vouched for in debug_token.
      if (!me?.id || String(me.id) !== String(d.user_id)) throw unauthorized('Facebook identity mismatch');

      const first = (me.first_name ?? '').trim();
      const lastInitial = (me.last_name ?? '').trim().charAt(0);
      return {
        facebookUserId: String(me.id),
        // Privacy by default: first name + last initial. Players may choose a nickname later.
        displayName: (first ? `${first}${lastInitial ? ` ${lastInitial}.` : ''}` : 'Player').slice(0, 40),
        avatarUrl: safeAvatar(me.picture?.data?.url),
        grantedFriends: Array.isArray(d.scopes) && d.scopes.includes('user_friends'),
      };
    },

    /** Facebook ids of friends who also use this app. Requires the user_friends permission. */
    async fetchAppFriends(accessToken) {
      if (env.FACEBOOK_MOCK) {
        const p = mockProfile(accessToken);
        if (p.friends === null) throw badRequest('user_friends permission not granted', 'FRIENDS_PERMISSION_MISSING');
        return p.friends;
      }
      const ids = [];
      let next = `/me/friends`;
      let params = { fields: 'id', limit: '200', access_token: accessToken, appsecret_proof: proof(accessToken) };
      for (let page = 0; page < 10 && next; page++) {
        const body = await graph(next, params);
        for (const f of body?.data ?? []) ids.push(String(f.id));
        const cursor = body?.paging?.cursors?.after;
        if (body?.paging?.next && cursor) params = { ...params, after: cursor };
        else next = null;
      }
      return ids;
    },
  };
}

function safeAvatar(url) {
  if (typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(\.|^)(fbcdn\.net|facebook\.com|fbsbx\.com)$/.test(u.hostname) ? url : null;
  } catch {
    return null;
  }
}

/**
 * Parses and verifies a Meta "signed_request" (data-deletion callback).
 * Format: base64url(signature) "." base64url(json payload); signature = HMAC-SHA256(payload, app secret).
 */
export function parseSignedRequest(signedRequest, appSecret) {
  if (typeof signedRequest !== 'string' || !signedRequest.includes('.')) throw badRequest('Malformed signed_request');
  const [sig, payload] = signedRequest.split('.', 2);
  const expected = hmacHex(appSecret, payload);
  const got = Buffer.from(sig, 'base64url').toString('hex');
  if (got.length !== expected.length || !timingSafeEqualHex(got, expected)) throw unauthorized('Bad signed_request signature');
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw badRequest('Malformed signed_request payload');
  }
}

function timingSafeEqualHex(a, b) {
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
