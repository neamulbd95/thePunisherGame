// Leaderboard + friends UI inside the <dialog id="social">. Player names are untrusted, so every
// piece of text is inserted with textContent / createElement, never innerHTML.
import { api, userMessage } from './api.js';
import { state as auth } from './session.js';

const $ = (id) => document.getElementById(id);
const VILLAIN_NAMES = { abuser: 'Child Abuser', robber: 'Snatcher', rapist: 'Rapist' };
const PAGE = 15;

const view = { scope: 'global', period: 'all-time', villain: '', offset: 0, token: 0 };

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v);
  }
  kids.forEach((k) => n.append(k));
  return n;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Generic user silhouette, built with DOM calls (no innerHTML). */
function defaultAvatar() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const head = document.createElementNS(SVG_NS, 'circle');
  head.setAttribute('cx', '12'); head.setAttribute('cy', '8.5'); head.setAttribute('r', '4');
  const body = document.createElementNS(SVG_NS, 'path');
  body.setAttribute('d', 'M3.5 21c.6-4.6 4-7 8.5-7s7.9 2.4 8.5 7z');
  svg.append(head, body);
  return svg;
}

/** Profile picture, or the default icon when there is none or it fails to load (blocked, expired, offline). */
export function avatarNode(url, extraClass = '') {
  const av = el('span', { class: `av ${extraClass}`.trim() });
  const fallback = () => av.replaceChildren(defaultAvatar());
  if (typeof url === 'string' && /^https:\/\//.test(url)) {
    const img = el('img', { alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', fallback, { once: true });
    img.src = url;
    av.append(img);
  } else {
    fallback();
  }
  return av;
}

function setState(msg, kind = '') {
  const s = $('boardState');
  s.textContent = msg;
  s.dataset.kind = kind;
  s.hidden = !msg;
}

function row(p) {
  const li = el('li', { class: `board-row${p.isMe ? ' me' : ''}` });
  li.append(el('span', { class: 'rk', text: `#${p.rank}` }));
  li.append(avatarNode(p.avatarUrl));
  const name = el('span', { class: 'nm' }, el('b', { text: p.displayName }));
  name.append(el('small', { text: VILLAIN_NAMES[p.villain] ?? '' }));
  li.append(name, el('span', { class: 'sc', text: p.bestScore.toLocaleString() }));
  return li;
}

export async function loadBoard({ append = false } = {}) {
  const my = ++view.token;
  const list = $('boardList');
  const more = $('boardMore');
  if (!append) {
    view.offset = 0;
    list.replaceChildren();
    $('boardMe').textContent = '';
  }
  more.hidden = true;

  if (view.scope !== 'global' && auth.status !== 'authed') {
    setState('Log in to see your friends’ scores.', 'info');
    return;
  }
  setState('Loading…', 'loading');
  const qs = new URLSearchParams({ period: view.period, limit: String(PAGE), offset: String(view.offset) });
  if (view.villain) qs.set('villain', view.villain);
  const path = { global: '/leaderboards/global', game: '/leaderboards/game-friends' }[view.scope];

  try {
    const data = await api(`${path}?${qs}`);
    if (my !== view.token) return; // a newer request superseded this one
    if (!data.players.length && !append) {
      setState(
        view.scope === 'global' ? 'No scores yet for this filter. Be the first to punish!' : 'No friends with scores yet. Invite some from the Friends tab.',
        'info',
      );
      return;
    }
    setState('');
    data.players.forEach((p) => list.append(row(p)));
    view.offset += data.players.length;
    more.hidden = view.offset >= data.totalPlayers;
    if (auth.status === 'authed') {
      $('boardMe').textContent = data.myRank
        ? `You: #${data.myRank} of ${data.totalPlayers} · best ${data.myScore.toLocaleString()}`
        : 'You have no score in this view yet.';
    }
  } catch (err) {
    if (my !== view.token) return;
    setState(userMessage(err), 'error');
  }
}

function setPressed(containerId, attr, value) {
  $(containerId).querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[attr] === value)));
}

export function initBoard() {
  $('scopeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-scope]');
    if (!b) return;
    view.scope = b.dataset.scope;
    setPressed('scopeSeg', 'scope', view.scope);
    loadBoard();
  });
  $('periodSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-period]');
    if (!b) return;
    view.period = b.dataset.period;
    setPressed('periodSeg', 'period', view.period);
    loadBoard();
  });
  $('villainSel').addEventListener('change', (e) => {
    view.villain = e.target.value;
    loadBoard();
  });
  $('boardMore').addEventListener('click', () => loadBoard({ append: true }));
}

// ---------------- friends ----------------
function msg(text, kind = '') {
  const m = $('friendMsg');
  m.textContent = text;
  m.dataset.kind = kind;
}

function personItem(name, avatar, ...buttons) {
  const li = el('li', { class: 'person' }, el('span', { class: 'nm', text: name }));
  buttons.forEach((b) => li.append(b));
  return li;
}

const btn = (label, onClick, cls = 'chip') => {
  const b = el('button', { type: 'button', class: cls, text: label });
  b.addEventListener('click', onClick);
  return b;
};

export const inviteLink = () => `${location.origin}${location.pathname}?invite=${auth.player?.friendCode ?? ''}`;

export async function loadFriends() {
  const authed = auth.status === 'authed';
  $('friendsGuest').hidden = authed;
  $('friendsAuthed').hidden = !authed;
  if (!authed) return;
  $('myCode').textContent = auth.player.friendCode;
  try {
    const [reqs, friends] = await Promise.all([api('/friends/requests'), api('/friends')]);
    const rl = $('requestList');
    rl.replaceChildren();
    if (!reqs.requests.length) rl.append(el('li', { class: 'empty', text: 'No pending requests.' }));
    reqs.requests.forEach((r) => {
      const items =
        r.direction === 'incoming'
          ? [
              btn('Accept', () => act(`/friends/requests/${r.id}/accept`)),
              btn('Decline', () => act(`/friends/requests/${r.id}/reject`)),
            ]
          : [btn('Cancel', () => act(`/friends/${r.id}`, 'DELETE'))];
      rl.append(personItem(`${r.displayName} · ${r.direction === 'incoming' ? 'wants to be friends' : 'request sent'}`, null, ...items));
    });
    const fl = $('friendList');
    fl.replaceChildren();
    if (!friends.friends.length) fl.append(el('li', { class: 'empty', text: 'No friends yet — share your invite link.' }));
    friends.friends.forEach((f) => fl.append(personItem(f.displayName, null, btn('Remove', () => act(`/friends/${f.friendshipId}`, 'DELETE')))));
  } catch (err) {
    msg(userMessage(err), 'error');
  }
}

async function act(path, method = 'POST') {
  try {
    await api(path, { method });
    msg('');
    await loadFriends();
  } catch (err) {
    msg(userMessage(err), 'error');
  }
}

export function initFriends() {
  $('addFriend').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = $('friendCode').value.trim();
    if (!code) return;
    try {
      const r = await api('/friends/requests', { method: 'POST', body: { friendCode: code } });
      $('friendCode').value = '';
      msg(r.status === 'accepted' ? `You and ${r.displayName} are now friends.` : `Request sent to ${r.displayName}.`, 'ok');
      loadFriends();
    } catch (err) {
      msg(err.status === 404 ? 'No player with that code.' : userMessage(err), 'error');
    }
  });
  $('copyInvite').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(inviteLink());
      msg('Invite link copied. Send it to a friend.', 'ok');
    } catch {
      msg(inviteLink(), 'info'); // clipboard blocked: show the link so it can be copied by hand
    }
  });
}
