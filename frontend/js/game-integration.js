// Connects the (unchanged, offline-capable) game to the backend. The game dispatches
//   game:start  {villain, weapon}                 -> request a server-side game session
//   game:over   {villain, score, rounds, best}    -> submit the round log for server verification
// and never waits for the network, so a slow or missing API cannot affect gameplay.
import { api, userMessage } from './api.js';
import * as session from './session.js';
import { initBoard, loadBoard, initFriends, loadFriends, avatarNode } from './leaderboard.js';

const cfg = window.PUNISHER_CONFIG;
const $ = (id) => document.getElementById(id);
const dlg = $('social');
const auth = session.state;

$('year').textContent = new Date().getFullYear();

const announce = (t) => { $('live').textContent = t; };
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) (k === 'class' ? (n.className = v) : k === 'text' ? (n.textContent = v) : n.setAttribute(k, v));
  kids.forEach((k) => n.append(k));
  return n;
}
/** The server's field message for a validation error (for example "Please choose a respectful nickname."). */
const problemText = (err) => (err?.status === 422 && err.details?.[0]?.message) || userMessage(err);

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
  b.textContent = auth.status === 'authed' ? auth.player.displayName : 'Nickname';
  b.setAttribute('aria-label', auth.status === 'authed' ? `Player: ${auth.player.displayName}` : 'Choose a nickname');
}

function msg(id, text, kind = '') {
  $(id).textContent = text;
  $(id).dataset.kind = kind;
}
const acctMsg = (t, k) => msg('acctMsg', t, k);
const regMsg = (t, k) => msg('regMsg', t, k);

// The recovery code is shown once (right after sign-up or when a new one is requested). It is kept here, in memory,
// only until the player confirms they saved it.
let pendingRecovery = null;

function showRecovery(code) {
  pendingRecovery = code;
  renderRecovery();
}
function renderRecovery() {
  $('recoveryBox').hidden = !pendingRecovery;
  $('recoveryCode').textContent = pendingRecovery ?? '';
}

async function renderAccount() {
  const authed = auth.status === 'authed';
  $('acctGuest').hidden = authed;
  $('acctAuthed').hidden = !authed;
  if (!authed) return;
  const p = auth.player;
  $('acctName').textContent = p.displayName;
  $('acctSub').textContent = 'Friend code: ' + p.friendCode;
  $('acctAvatar').replaceChildren(avatarNode(p.avatarUrl));
  $('nickInput').value = p.nickname ?? '';
  renderRecovery();
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

$('regForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nickname = $('regNick').value.trim();
  if (!nickname) return regMsg('Type a nickname first.', 'error');
  regMsg('Creating your player…', 'loading');
  try {
    const { recoveryCode } = await session.register(nickname);
    $('regNick').value = '';
    regMsg('');
    showRecovery(recoveryCode);
    acctMsg('');
  } catch (err) {
    regMsg(err.status === 409 ? 'That nickname is very popular right now, please try another one.' : problemText(err), 'error');
  }
});

$('recoverForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  regMsg('Looking for your player…', 'loading');
  try {
    await session.recover($('recHandle').value, $('recCode').value);
    $('recHandle').value = '';
    $('recCode').value = '';
    regMsg('');
  } catch (err) {
    regMsg(err.status === 401 ? 'No player matches that name and recovery code. Check both and try again.' : userMessage(err), 'error');
  }
});

$('copyRecovery').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(`${auth.player.displayName}  ${pendingRecovery}`);
    acctMsg('Copied. Keep it somewhere safe, for example in a note on your phone.', 'ok');
  } catch {
    acctMsg('Could not copy automatically. Please write the code down.', 'info');
  }
});
$('downloadRecovery').addEventListener('click', () => {
  const text = `Bangla Punisher recovery code\nPlayer: ${auth.player.displayName}\nCode:   ${pendingRecovery}\n\nTo continue as this player on another device: Nickname button -> "I already have a player".\n`;
  const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/plain' })), download: 'bangla-punisher-recovery.txt' });
  a.click();
  URL.revokeObjectURL(a.href);
});
$('recoverySaved').addEventListener('click', () => {
  pendingRecovery = null;
  renderRecovery();
  acctMsg('');
});

$('newCodeBtn').addEventListener('click', async () => {
  if (!confirm('Create a new recovery code? The old one will stop working.')) return;
  try {
    showRecovery(await session.newRecoveryCode());
    acctMsg('Your old recovery code no longer works. Save the new one.', 'ok');
  } catch (err) {
    acctMsg(userMessage(err), 'error');
  }
});

$('nickForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await session.setNickname($('nickInput').value.trim());
    acctMsg(`You are now ${auth.player.displayName}.`, 'ok');
  } catch (err) {
    acctMsg(problemText(err), 'error');
  }
});

$('logoutBtn').addEventListener('click', async () => {
  const warn = pendingRecovery
    ? 'You have not confirmed that you saved your recovery code. Without it you cannot come back as this player. Sign out anyway?'
    : `Sign out on this device? You can come back as ${auth.player.displayName} only with your recovery code.`;
  if (!confirm(warn)) return;
  try {
    await session.logout();
    pendingRecovery = null;
  } catch (err) {
    acctMsg(userMessage(err), 'error');
  }
});
$('deleteBtn').addEventListener('click', async () => {
  if (!confirm('Delete your player, scores and friends permanently? This cannot be undone.')) return;
  try {
    await session.deleteAccount();
    pendingRecovery = null;
    regMsg('Your player and all its data were deleted.', 'ok');
  } catch (err) {
    acctMsg(userMessage(err), 'error');
  }
});

// ---------------- game hooks ----------------
let current = null; // { villain, promise }

document.addEventListener('game:start', (e) => {
  current = null;
  if (auth.status !== 'authed') return;
  const { villain, weapon } = e.detail;
  current = { villain, promise: api('/game-sessions', { method: 'POST', body: { villain, weapon } }).catch((error) => ({ error })) };
});

document.addEventListener('game:over', (e) => renderGameOver(e.detail, current));
document.addEventListener('ui:login', () => openDialog('account')); // the landing screen's "Create nickname" button

/** A normal link, so pop-up blockers never interfere. Facebook's own share window; no Facebook login or SDK is used. */
function shareLink(scoreId) {
  const page = `${cfg.API_BASE_URL}/share/score/${scoreId}`; // public page with the preview card (nickname#tag, score, villain)
  return el('a', {
    class: 'ovbtn fb small',
    href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(page)}`,
    target: '_blank',
    rel: 'noopener noreferrer',
    text: 'Share on Facebook',
  });
}

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
    status.textContent = 'Choose a nickname to save this score, join the leaderboard and unlock more villains, weapons and hit areas. Guests cannot unlock anything.';
    const create = el('button', { type: 'button', class: 'ovbtn small', text: 'Choose a nickname' });
    create.addEventListener('click', () => openDialog('account'));
    row.append(create, boardBtn);
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
      status.textContent = s.error.code === 'LOCKED'
        ? 'That villain or weapon is not unlocked on your player yet (progress counts verified, saved scores), so this score was not saved.'
        : 'Could not reach the server, so this score was not saved. ' + userMessage(s.error);
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
      row.prepend(shareLink(r.scoreId)); // only a saved (verified) score can be shared
      // the saved score may have unlocked something new
      const labels = await syncProgress();
      if (labels.length) {
        const box = el('div', { class: 'unlocks' });
        labels.forEach((l) => box.append(el('p', { text: `🔓 ${l}` })));
        status.after(box);
      }
    } catch (err) {
      if (err.code === 'NETWORK' || err.code === 'TIMEOUT') {
        status.textContent = userMessage(err);
        const retry = el('button', { type: 'button', class: 'ovbtn small', text: 'Retry' });
        retry.addEventListener('click', () => { retry.remove(); submit(); });
        row.prepend(retry);
      } else if (err.status === 401) {
        status.textContent = 'This browser is no longer signed in, so the score was not saved. Use your recovery code (Nickname button) and play again.';
      } else if (err.code === 'ALREADY_SUBMITTED') {
        status.textContent = 'This score was already saved.';
      } else {
        status.textContent = 'This score could not be verified and was not saved.';
      }
    }
  };
  submit();
}

// ---------------- progress (unlocks) ----------------
// Unlocks come only from verified, saved scores of a player with a nickname. A guest always has the starting set.
let progressFor = null; // id of the player whose server progress is applied
async function syncProgress() {
  try {
    return window.PunisherGame.applyServerProgress(await api('/players/me/progress'));
  } catch {
    return []; // offline: keep whatever is shown, the next game refreshes it
  }
}

// ---------------- boot ----------------
session.onChange(() => {
  renderChip();
  if (auth.status === 'authed' && progressFor !== auth.player.id) {
    progressFor = auth.player.id;
    syncProgress();
  } else if (auth.status === 'guest' && progressFor) {
    progressFor = null;
    window.PunisherGame.useLocalProgress();
  }
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
