// Facebook Login (standalone website flow, official JavaScript SDK).
// The SDK is loaded only after the player clicks a Facebook button. The access token is sent once
// to our backend over HTTPS, is never stored in localStorage and never logged.
const cfg = window.PUNISHER_CONFIG;

let sdkPromise = null;

export const facebookAvailable = () => cfg.FACEBOOK_LOGIN_ENABLED;

function loadSdk() {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB.init({ appId: cfg.FACEBOOK_APP_ID, cookie: false, xfbml: false, version: cfg.FACEBOOK_GRAPH_API_VERSION });
      resolve(window.FB);
    };
    const s = document.createElement('script');
    s.src = 'https://connect.facebook.net/en_US/sdk.js';
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onerror = () => {
      sdkPromise = null;
      reject(new Error('Facebook could not be loaded (blocked by a content blocker or offline).'));
    };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

/**
 * Opens the Facebook login dialog. Resolves with { accessToken, grantedScopes } or
 * { cancelled: true } when the player closes the dialog / declines.
 * `scope` defaults to the minimum needed for sign-in.
 */
export async function facebookLogin({ scope = 'public_profile', rerequest = false } = {}) {
  const FB = await loadSdk();
  return new Promise((resolve) => {
    FB.login(
      (response) => {
        const auth = response && response.authResponse;
        if (!auth || !auth.accessToken) return resolve({ cancelled: true });
        resolve({ accessToken: auth.accessToken, grantedScopes: (auth.grantedScopes || '').split(',') });
      },
      { scope, return_scopes: true, ...(rerequest ? { auth_type: 'rerequest' } : {}) },
    );
  });
}
