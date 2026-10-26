import { Router } from 'express';
import { handler, validate } from '../middleware/common.js';
import { uuidParam } from '../validators/schemas.js';
import { notFound } from '../utils/errors.js';

const VILLAIN_NAMES = { abuser: 'Child Abuser', robber: 'Snatcher', rapist: 'Rapist' };
const BOTS = /facebookexternalhit|facebot|twitterbot|whatsapp|telegrambot|slackbot|linkedinbot|discordbot|pinterest/i;

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Public page used when a score is shared (for example on Facebook). Social crawlers read its Open Graph tags to build
 * the preview card; people who click the link are sent straight to the game. It only exposes what the leaderboard
 * already shows: nickname#tag, score and villain.
 */
export function shareRoutes({ env, db }) {
  const r = Router();
  const home = env.frontendOrigins[0];

  r.get(
    '/score/:id',
    validate({ params: uuidParam }),
    handler(async (req, res) => {
      const { rows } = await db.query(
        `SELECT s.score, s.villain, p.display_name
           FROM game_scores s JOIN players p ON p.id = s.player_id
          WHERE s.id = $1 AND s.validation_status = 'accepted'`,
        [req.valid.params.id],
      );
      const row = rows[0];
      if (!row) throw notFound('Score not found');

      if (!BOTS.test(req.get('user-agent') ?? '')) return res.redirect(302, `${home}/?ref=share`);

      const score = Number(row.score).toLocaleString('en-US');
      const villain = VILLAIN_NAMES[row.villain] ?? 'the criminal';
      const title = `${row.display_name} scored ${score} against the ${villain} – Bangla Punisher`;
      const description = 'Raise your voice against abuse: play free, punish the criminal and see if you can beat this score.';
      const url = `${env.API_PUBLIC_URL}${req.originalUrl.split('?')[0]}`;
      res
        .status(200)
        .set('Content-Type', 'text/html; charset=utf-8')
        .set('Cache-Control', 'public, max-age=300')
        .send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:site_name" content="Bangla Punisher">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(home)}/assets/og.png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${esc(home)}/?ref=share">
</head><body><p><a href="${esc(home)}/?ref=share">${esc(title)}</a></p></body></html>`);
    }),
  );

  return r;
}
