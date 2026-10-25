// Connects the (unchanged, offline-capable) game to the backend. The game dispatches
//   game:start  {villain}                         -> request a server-side game session
//   game:over   {villain, score, rounds, best}    -> submit the round log for server verification
// and never waits for the network, so a slow or missing API cannot affect gameplay.
import { api, userMessage } from './api.js';
import * as session from './session.js';
import { facebookAvailable, facebookLogin } from './facebook-auth.js';
import { initBoard, loadBoard, initFriends, loadFriends } from './leaderboard.js';

const cfg = window.PUNISHER_CONFIG;
const $ = (id) => document.getElementById(id);
const dlg = $('social');
const auth = session.state;

const announce = (t) => { $('live').textContent = t; };
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) (k === 'class' ? (n.className = v) : k === 'text' ? (n.textContent = v) : n.setAttribute(k, v));
  kids.forEach((k) => n.append(k));
  return n;
}

// ---------------- dialog + tabs ----------------
const TABS = ['board', 'friends', 'account'];
function showTab(name) {
  TABS.forEach((t) => {
    $(`tab-${t}`).setAttribute('aria-selected', String(t === name));
    $(`panel-${t}`).hidden = t !== name;
  });
  if (name === 'board') loadBoard();
  if (name === 'friends') loadFriends();
  if (name === 'account') renderAccount();
}
function openDialog(tab) {
  if (window.PunisherGame?.isBusy()) return; // never interrupt a swing
  showTab(tab);
  if (!dlg.open) dlg.showModal();
}
TABS.forEach((t) => $(`tab-${t}`).addEventListener('click', () => showTab(t)));
$('socialClose').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // click on the backdrop
$('board').addEventListener('click', () => openDialog('board'));
$('account').addEventListener('click', () => openDialog('account'));

// ---------------- account panel ----------------
function renderChip() {
  const b = $('account');
  b.textContent = auth.status === 'authed' ? auth.player.displayName.slice(0, 12) : 'Log in';
  b.setAttribute('aria-label', auth.status === 'authed' ? `Account: ${auth.player.displayName}` : 'Log in');
}

function acctMsg(text, kind = '') {
  $('acctMsg').textContent = text;
  $('acctMsg').dataset.kind = kind;
}

async function renderAccount() {
  const authed = auth.status === 'authed';
  $('acctGuest').hidden = authed;
  $('acctAuthed').hidden = !authed;
  if (!authed) {
    const fb = facebookAvailable();
    $('fbLogin').disabled = !fb;
    $('fbLogin').hidden = !fb && cfg.DEV_MOCK_LOGIN;
    $('devLogin').hidden = !cfg.DEV_MOCK_LOGIN;
    $('fbNote').textContent = fb
      ? 'You can keep playing as a guest at any time.'
      : cfg.DEV_MOCK_LOGIN
        ? 'Facebook is not configured locally; use the dev login below.'
        : 'Facebook login is not available on this address.';
    return;
  }
  const p = auth.player;
  $('acctName').textContent = p.displayName;
  $('acctSub').textContent = 'Friend code: ' + p.friendCode;
  const img = $('acctAvatar');
  img.hidden = !(p.avatarUrl && /^https:\/\//.test(p.avatarUrl));
  if (!img.hidden) img.src = p.avatarUrl;
  $('nickInput').value = p.displayName;
  $('fbFriendsBtn').hidden = !(facebookAvailable() && !p.facebookFriendsEnabled);
  try {
    const s = await api('/players/me/stats');
    const dl = $('acctStats');
    dl.replaceChildren();
    [['Games', s.gamesPlayed], ['Best score', s.highestScore.toLocaleString()], ['Perfect hits', s.totalPerfects], ['Global rank', s.globalRank ? `#${s.globalRank}` : '—']].forEach(([k, v]) =>
      dl.append(el('div', {}, el('dt', { text: k }), el('dd', { text: String(v) }))),
    );
  } catch (err) {
    acctMsg(userMessage(err), 'error');
  }
}

async function doLogin(getToken) {
  acctMsg('Signing in…', 'loading');
  try {
    const t = await getToken();
    if (t.cancelled) return acctMsg('Login cancelled. You can keep playing as a guest.', 'info');
    await session.loginWithFacebookToken(t.accessToken);
    acctMsg('');
  } catch (err) {
    acctMsg(err.status === 401 ? 'Facebook login was rejected. Please try again.' : userMessage(err), 'error');
  }
}

$('fbLogin').addEventListener('click', () => doLogin(() => facebookLogin()));
$('devLogin').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('devName').value.trim().replace(/:/g, ' ') || 'Dev Player';
  const id = 'dev-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
  doLogin(async () => ({ accessToken: `mock:${id}:${name}` }));
});

$('fbFriendsBtn').addEventListener('click', async () => {
  acctMsg('Asking Facebook…', 'loading');
  try {
    const t = await facebookLogin({ scope: 'user_friends', rerequest: true });
    if (t.cancelled) return acctMsg('Nothing changed.', 'info');
    if (!t.grantedScopes.includes('user_friends')) return acctMsg('Facebook friends sharing was not allowed. The Game friends board still works.', 'info');
    await api('/friends/facebook/sync', { method: 'POST', body: { accessToken: t.accessToken } });
    const { player } = await api('/auth/me');
    auth.player = player;
    acctMsg('Facebook friends board enabled.', 'ok');
    renderAccount();
  } catch (err) {
    acctMsg(userMessage(err), 'error');
  }
});

$('nickForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await session.setNickname($('nickInput').value);
    acctMsg('Nickname saved.', 'ok');
  } catch (err) {
    acctMsg(err.status === 422 ? 'Use 2–24 letters, numbers, spaces, dot, dash or underscore.' : userMessage(err), 'error');
  }
});
$('logoutBtn').addEventListener('click', () => session.logout().catch((err) => acctMsg(userMessage(err), 'error')));
$('deleteBtn').addEventListener('click', async () => {
  if (!confirm('Delete your account, scores and friends permanently? This cannot be undone.')) return;
  try {
    await session.deleteAccount();
    acctMsg('Your account and data were deleted.', 'ok');
  } catch (err) {
    acctMsg(userMessage(err), 'error');
  }
});

// ---------------- game hooks ----------------
let current = null; // { villain, promise }

document.addEventListener('game:start', (e) => {
  current = null;
  if (auth.status !== 'authed') return;
  const villain = e.detail.villain;
  current = { villain, promise: api('/game-sessions', { method: 'POST', body: { villain } }).catch((error) => ({ error })) };
});

document.addEventListener('game:over', (e) => renderGameOver(e.detail, current));

function renderGameOver(result, game) {
  const slot = $('socialSlot');
  if (!slot) return;
  slot.replaceChildren();
  const status = el('p', { class: 'lead', role: 'status' });
  const row = el('div', { class: 'btnrow' });
  const boardBtn = el('button', { type: 'button', class: 'ovbtn ghost small', text: 'Leaderboard' });
  boardBtn.addEventListener('click', () => openDialog('board'));
  slot.append(status, row);

  if (auth.status !== 'authed') {
    status.textContent = 'Log in to save this score and join the leaderboard.';
    const login = el('button', { type: 'button', class: 'ovbtn small', text: 'Log in' });
    login.addEventListener('click', () => openDialog('account'));
    row.append(login, boardBtn);
    return;
  }
  row.append(boardBtn);
  if (!game || game.villain !== result.villain) {
    status.textContent = 'This game was not started online, so the score was not saved. Play again to save your next score.';
    return;
  }

  const submit = async () => {
    status.textContent = 'Saving your score…';
    const s = await game.promise;
    if (s.error) {
      status.textContent = 'Could not reach the server, so this score was not saved. ' + userMessage(s.error);
      return;
    }
    try {
      const r = await api(`/game-sessions/${s.sessionId}/complete`, {
        method: 'POST',
        body: { score: result.score, villain: result.villain, rounds: result.rounds, end: result.end, timeLeftMs: result.timeLeftMs },
        timeoutMs: 15000,
      });
      status.textContent = `Saved! You are #${r.allTimeRank} on the all-time board${r.personalBest ? ' — a new personal best!' : '.'}`;
      announce(status.textContent);
    } catch (err) {
      if (err.code === 'NETWORK' || err.code === 'TIMEOUT') {
        status.textContent = userMessage(err);
        const retry = el('button', { type: 'button', class: 'ovbtn small', text: 'Retry' });
        retry.addEventListener('click', () => { retry.remove(); submit(); });
        row.prepend(retry);
      } else if (err.status === 401) {
        status.textContent = 'Your login expired, so this score was not saved. Log in and play again.';
      } else if (err.code === 'ALREADY_SUBMITTED') {
        status.textContent = 'This score was already saved.';
      } else {
        status.textContent = 'This score could not be verified and was not saved.';
      }
    }
  };
  submit();
}

// ---------------- boot ----------------
session.onChange(() => {
  renderChip();
  if (dlg.open) {
    renderAccount();
    const active = TABS.find((t) => $(`tab-${t}`).getAttribute('aria-selected') === 'true');
    if (active === 'board') loadBoard();
    if (active === 'friends') loadFriends();
  }
});

initBoard();
initFriends();

// Friend invite deep link: ?invite=CODE
const invite = new URLSearchParams(location.search).get('invite');
function handleInvite() {
  if (!invite) return;
  $('friendCode').value = invite.toUpperCase().slice(0, 16);
  history.replaceState(null, '', location.pathname);
  openDialog(auth.status === 'authed' ? 'friends' : 'account');
}
document.addEventListener('auth:login', () => { if (invite && $('friendCode').value) openDialog('friends'); });

session.restore().then(handleInvite);
