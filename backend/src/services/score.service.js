import { replayRun, villainUnlocked, weaponUnlocked, kickUnlocked } from '../utils/game-rules.js';
import { notFound, conflict, unprocessable, forbidden } from '../utils/errors.js';

export function createScoreService({ db, logger, gamesRepo, leaderboardRepo }) {
  return {
    async startGame(playerId, villain, weapon) {
      // Unlocks are enforced here, from verified scores, not from anything the browser claims.
      const progress = await gamesRepo.progress(playerId);
      if (!villainUnlocked(progress, villain)) throw forbidden('This villain is still locked', 'LOCKED');
      if (!weaponUnlocked(progress, weapon)) throw forbidden('This weapon is still locked', 'LOCKED');
      await gamesRepo.expireStaleSessions().catch(() => {});
      const s = await gamesRepo.createSession(playerId, villain, weapon);
      return { sessionId: s.id, villain: s.villain, weapon: s.weapon, startedAt: s.started_at };
    },

    /**
     * Replays the submitted round log on the server and stores the result in one transaction.
     * The session row is locked, so a double submit can never produce two scores.
     */
    async completeGame(playerId, sessionId, body) {
      const outcome = await db.tx(async (t) => {
        const session = await gamesRepo.lockSession(sessionId, t);
        // Another player's session looks exactly like a missing one.
        if (!session || session.player_id !== playerId) throw notFound('Game session not found');
        if (session.status !== 'active') throw conflict('This game session was already submitted', 'ALREADY_SUBMITTED');

        const durationMs = Number(session.elapsed_ms);
        let reason = null;
        let result = { ok: false };
        if (body.villain !== session.villain) {
          reason = 'villain_mismatch';
        } else {
          const rounds = body.rounds.map((r) => ({ spot: r.spot, grade: r.grade, force: r.force ?? 0 }));
          const progress = await gamesRepo.progress(playerId, t); // before this game is counted
          result = replayRun({
            rounds,
            claimedScore: body.score,
            durationMs,
            end: body.end,
            timeLeftMs: body.timeLeftMs,
            weapon: session.weapon,
            kickAllowed: kickUnlocked(progress, session.villain),
          });
          if (!result.ok) reason = result.reason;
        }

        const accepted = reason === null;
        const row = await gamesRepo.insertScore(
          {
            playerId,
            sessionId,
            villain: session.villain,
            score: accepted ? result.score : 0,
            rounds: accepted ? result.rounds : body.rounds.length,
            perfects: accepted ? result.perfects : 0,
            durationMs,
            status: accepted ? 'accepted' : 'rejected',
            reason,
          },
          t,
        );
        await gamesRepo.finishSession(sessionId, accepted ? 'completed' : 'rejected', { reason, durationMs, rounds: body.rounds.length }, t);
        return { accepted, reason, row, perfects: result.perfects };
      });

      if (!outcome.accepted) {
        // Log the reason only; never the payload.
        logger.warn({ playerId, sessionId, reason: outcome.reason }, 'score rejected');
        throw unprocessable('Score could not be verified', { reason: outcome.reason });
      }

      const all = await leaderboardRepo.rank({ since: null, villain: null, playerIds: null, limit: 1, offset: 0, meId: playerId });
      return {
        scoreId: outcome.row.id,
        score: outcome.row.score,
        perfects: outcome.perfects,
        allTimeRank: all.my_rank,
        personalBest: all.my_score === outcome.row.score,
      };
    },
  };
}
