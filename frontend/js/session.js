// Who is playing. A player is a nickname + #tag remembered by this browser through an HttpOnly cookie that the server
// sets (about a year). There is no password: a recovery code, shown once, lets the same player continue elsewhere.
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
    // 401 = a new browser; network errors also fall back to guest mode so the game stays playable.
    set('guest');
    return err;
  }
}

/** Creates a player. Resolves with { player, recoveryCode }: the code is only ever shown at this moment. */
export async function register(nickname) {
  const { player, recoveryCode } = await api('/auth/register', { method: 'POST', body: { nickname } });
  set('authed', player);
  document.dispatchEvent(new CustomEvent('auth:login', { detail: { player } }));
  return { player, recoveryCode };
}

/** Continue as an existing player on this browser. */
export async function recover(handle, recoveryCode) {
  const { player } = await api('/auth/recover', { method: 'POST', body: { handle, recoveryCode } });
  set('authed', player);
  document.dispatchEvent(new CustomEvent('auth:login', { detail: { player } }));
  return player;
}

/** A fresh recovery code; the old one stops working. */
export async function newRecoveryCode() {
  const { recoveryCode } = await api('/auth/recovery-code', { method: 'POST' });
  return recoveryCode;
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

export async function setNickname(nickname) {
  const { player } = await api('/players/me', { method: 'PATCH', body: { nickname } });
  set('authed', player);
}
