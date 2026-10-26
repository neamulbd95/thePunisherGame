import { periodStart } from '../utils/periods.js';

export function createLeaderboardService({ leaderboardRepo, friendsRepo }) {
  async function build({ period, villain, limit, offset, meId, playerIds }, now = new Date()) {
    const r = await leaderboardRepo.rank({
      since: periodStart(period, now),
      villain: villain ?? null,
      playerIds,
      limit,
      offset,
      meId: meId ?? null,
    });
    return {
      period,
      villain: villain ?? null,
      players: r.rows.map((x) => ({
        rank: x.rank,
        playerId: x.player_id,
        displayName: x.display_name,
        avatarUrl: x.avatar_url,
        bestScore: x.score,
        villain: x.villain,
        isMe: meId ? x.player_id === meId : false,
      })),
      myRank: r.my_rank ?? null,
      myScore: r.my_score ?? null,
      totalPlayers: r.total,
    };
  }

  return {
    global: (q, meId, now) => build({ ...q, meId, playerIds: null }, now),

    /** Accepted in-game friends plus the requesting player. */
    async gameFriends(q, meId, now) {
      const ids = await friendsRepo.friendIds(meId);
      return build({ ...q, meId, playerIds: [meId, ...ids] }, now);
    },
  };
}
