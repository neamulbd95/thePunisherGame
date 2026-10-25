// Authentication state. The session itself lives in an HttpOnly cookie, so a page refresh or
// browser restart keeps the player logged in until the server-side session expires (7 days by default).
import { api } from './api.js';

const listeners = new Set();
export const state = { status: 'loading', player: null };

function set(status, player = null) {
  state.status = status;
  state.player = player;
  listeners.forEach((fn) => fn(state));
}

export const onChange = (fn) => {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
};

export async function restore() {
  try {
    const { player } = await api('/auth/me');
    set('authed', player);
  } catch (err) {
    // 401 = simply not logged in; network errors also fall back to guest mode so the game stays playable.
    set('guest');
    return err;
  }
}

export async function loginWithFacebookToken(accessToken) {
  const { player } = await api('/auth/facebook', { method: 'POST', body: { accessToken } });
  set('authed', player);
  document.dispatchEvent(new CustomEvent('auth:login', { detail: { player } }));
  return player;
}

export async function logout() {
  try {
    await api('/auth/logout', { method: 'POST' });
  } finally {
    set('guest');
    document.dispatchEvent(new CustomEvent('auth:logout'));
  }
}

export async function deleteAccount() {
  await api('/players/me', { method: 'DELETE' });
  set('guest');
  document.dispatchEvent(new CustomEvent('auth:logout'));
}

export async function setNickname(displayName) {
  const { player } = await api('/players/me', { method: 'PATCH', body: { displayName } });
  set('authed', player);
}
