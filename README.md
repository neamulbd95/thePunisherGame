# Bangla Punisher — a social-awareness game

A protest game against child abuse, street snatching and sexual violence in Bangladesh. Players punish a cartoon criminal by timing a swing on a shrinking, speeding-up dial. The game is **a protest, not a substitute for justice**: every game-over screen shows the real helplines (999, 1098, 109), and the target is abusers, not any religion.

| Part | Tech | Hosting |
|---|---|---|
| `frontend/` | plain HTML / CSS / JS (no framework, no build step) | Cloudflare |
| `backend/` | Node.js 22, Express 5, `pg`, zod, helmet, pino | Render |
| database | PostgreSQL, SQL migrations in `backend/migrations/` | Neon |
| `e2e/` | Playwright tests (real API + in-memory Postgres) | local / CI |

## Players: nickname#tag, remembered by the device

No Facebook, Google or email login, and no passwords.

- **Guests** can play right away. Nothing is saved on the server and nothing can be unlocked.
- **Choose a nickname** (3-16 letters, numbers, `_` or `-`, Bengali included). The server adds a number tag, so you are *Rahim#4821*; the same nickname can be used by many people.
- The browser is remembered by an HttpOnly **device cookie** (a year). A one-time **recovery code** lets the same player continue on another device or after clearing the browser (only its hash is stored).
- Scores are verified on the server, unlocks (villains, weapons, the bottom kick) follow verified scores, and the leaderboards show *Nickname#tag*.
- After a saved score a player can **Share on Facebook**: a plain link to Facebook's own share window (no login, no SDK) pointing at a public preview page with the nickname#tag, score and villain.

## Quick start

```bash
cd backend
npm install
cp .env.example .env          # set DATABASE_URL (and DATABASE_SSL=false for a local PostgreSQL)
npm run migrate
npm run seed                  # optional demo scores
npm run dev                   # API on http://localhost:3000

# second terminal, from the repo root
python -m http.server 5500 --directory frontend    # or: npx http-server frontend -p 5500
```

Open <http://localhost:5500>, press **Nickname**, create a player and play. No credentials of any kind are needed.

## Scripts

| Where | Command | What |
|---|---|---|
| `backend` | `npm start` / `npm run dev` | run the API |
| `backend` | `npm run migrate` | apply pending SQL migrations (explicit, never on startup) |
| `backend` | `npm test` / `npm run lint` | tests on in-process PostgreSQL / ESLint |
| `e2e` | `npx playwright test` | browser tests of the whole stack |

## How a score is protected

The game runs in the browser, so a score can't be trusted on its own. The client sends the **round log** (spot, grade and force per swing), how the game ended and the time left; the server replays it with the same scoring formula, requires an exact match, checks the game really ended, minimum run time and the time bonus against its own clock, and stores one row per server-issued session. This stops edited requests, **not** a determined cheater who automates the game. Because accounts are free and anonymous, one person can also make several players; treat the leaderboard as a community board, not a prize competition.
