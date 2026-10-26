// Nickname rules. A player is shown as "Nickname#0042": the nickname is chosen, the 4-digit tag is assigned by the
// server so that two players can pick the same nickname.
export const NICKNAME_RE = /^[\p{L}\p{M}\p{N}_-]+$/u; // letters of any script (Bengali too), digits, underscore, dash. No "#", no spaces.
export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 16;

export const formatHandle = (nickname, tag) => `${nickname}#${String(tag).padStart(4, '0')}`;

/** "Rahim#0042" -> { nickname: 'Rahim', tag: 42 } or null. */
export function parseHandle(handle) {
  const m = /^(.{1,40})#(\d{1,4})$/u.exec(String(handle).trim());
  return m ? { nickname: m[1], tag: Number(m[2]) } : null;
}

// Names that impersonate the game or staff.
const RESERVED = new Set(['admin', 'administrator', 'moderator', 'mod', 'support', 'official', 'staff', 'system', 'banglapunisher', 'thebanglapunisher']);
// A deliberately short, English-only starter list of clearly abusive terms. It cannot catch Bengali words or creative spellings:
// players are shown only nickname#tag and abusive names must be removed by hand (see docs/operations.md).
// Matching is by substring, so a very rare innocent word that contains a listed term is blocked too; that player just picks another name.
const BLOCKED = [
  'fuck', 'shit', 'bitch', 'cunt', 'whore', 'slut', 'nigger', 'nigga', 'faggot', 'bastard', 'asshole', 'dickhead', 'pussy',
  'porn', 'rapist', 'pedo', 'paedo', 'nazi', 'hitler',
];
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's' };

function squash(nickname) {
  return nickname
    .toLowerCase()
    .replace(/[0134578@$]/g, (c) => LEET[c])
    .replace(/[^a-z]/g, '');
}

/** Returns a human readable reason, or null when the nickname is fine. */
export function nicknameProblem(nickname) {
  if (nickname.length < NICKNAME_MIN || nickname.length > NICKNAME_MAX) return `Use ${NICKNAME_MIN}-${NICKNAME_MAX} characters.`;
  if (!NICKNAME_RE.test(nickname)) return 'Use letters, numbers, underscore or dash (no spaces or #).';
  const s = squash(nickname);
  if (RESERVED.has(s)) return 'That name is reserved.';
  if (BLOCKED.some((w) => s.includes(w))) return 'Please choose a respectful nickname.';
  return null;
}
