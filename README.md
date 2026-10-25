# Slap the Abuser — a social-awareness game

A protest game against child abuse, street snatching and sexual violence in Bangladesh. Players punish a cartoon criminal by timing a swing on a shrinking, speeding-up dial. The game is **a protest, not a substitute for justice**: every game-over screen shows the real helplines (999, 1098, 109), and the faith disclaimer on the abuser stays — the target is abusers, not religion.

This repository is the "mature" version: the original single-file game (`demoGame.html`, kept untouched) split into a front end, plus a Node.js API with PostgreSQL, Facebook Login, verified scores and leaderboards.

| Part | Tech | Hosting |
|---|---|---|
| `frontend/` | plain HTML / CSS / JS (no framework, no build step) | Cloudflare Pages |
| `backend/` | Node.js 22, Express 5, `pg`, zod, helmet, pino | Render Web Service |
| database | PostgreSQL, SQL migrations in `backend/migrations/` | Neon |
| `e2e/` | Playwright tests (real API + in-memory Postgres) | CI |

Guests can always play (scores stay in the browser). Logging in with Facebook adds: saved & verified scores, global / daily / weekly / monthly leaderboards, a Facebook-friends board (only where Meta permits), and an in-game friends board that works without any Meta permission.

## Quick start (no Facebook credentials needed)

```bash
cd backend
npm install
cp .env.example .env          # set DATABASE_URL, DATABASE_SSL=false, FACEBOOK_MOCK=true
npm run migrate
npm run seed                  # optional demo scores
npm run dev                   # API on http://localhost:3000

# second terminal, from the repo root
npx http-server frontend -p 5500    # or: python -m http.server 5500 --directory frontend
```

Open <http://localhost:5500>. In **Log in → Dev login (mock)** you can sign in without Meta. Full guide: [docs/local-development.md](docs/local-development.md).

## Scripts

| Where | Command | What |
|---|---|---|
| `backend` | `npm start` / `npm run dev` | run the API |
| `backend` | `npm run migrate` | apply pending SQL migrations (explicit, never on startup) |
| `backend` | `npm run seed` | demo data (refuses production) |
| `backend` | `npm test` / `npm run lint` | 72 tests on in-process PostgreSQL + mocked Meta / ESLint |
| `e2e` | `npx playwright test` | 10 browser tests of the whole stack |

## How a score is protected

The game is client-side, so a score can't be trusted on its own. The client sends the **round log** (spot, grade, force per swing), how the game ended and the time left; the server replays it with the same scoring formula, requires an exact match, checks the game really ended (3 misses), a minimum run time, and an implausible-perfect-streak heuristic, and stores one row per server-issued session. This stops casual tampering, **not** a determined cheater who automates the game — see [docs/security.md](docs/security.md).

## Documentation

- [Architecture](docs/architecture.md) · [Local development](docs/local-development.md) · [API reference](docs/api-reference.md)
- [Facebook setup](docs/facebook-setup.md) · [Deployment (Cloudflare, Render, Neon)](docs/deployment.md)
- [Security & privacy](docs/security.md) · [Operations](docs/operations.md)
