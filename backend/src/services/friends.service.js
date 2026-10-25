import { notFound, conflict, badRequest } from '../utils/errors.js';

export function createFriendsService({ friendsRepo, playersRepo }) {
  return {
    async sendRequest(meId, friendCode) {
      const target = await playersRepo.findByFriendCode(friendCode);
      // Same answer for "no such code" as for a blocked relationship: no probing of private data.
      if (!target) throw notFound('No player with that friend code');
      if (target.id === meId) throw badRequest('You cannot add yourself', 'SELF_REQUEST');

      const existing = await friendsRepo.findBetween(meId, target.id);
      if (existing) {
        if (existing.status === 'blocked') throw notFound('No player with that friend code');
        if (existing.status === 'accepted') throw conflict('You are already friends', 'ALREADY_FRIENDS');
        // They already asked us: adding them back simply accepts.
        if (existing.friend_player_id === meId) {
          await friendsRepo.setStatus(existing.id, 'accepted');
          return { id: existing.id, status: 'accepted', displayName: target.display_name };
        }
        throw conflict('Request already sent', 'REQUEST_EXISTS');
      }
      const row = await friendsRepo.createRequest(meId, target.id);
      return { id: row.id, status: row.status, displayName: target.display_name };
    },

    listRequests: (meId) => friendsRepo.listRequests(meId),

    async list(meId) {
      return (await friendsRepo.listFriends(meId)).map((r) => ({
        friendshipId: r.friendship_id,
        playerId: r.player_id,
        displayName: r.display_name,
        avatarUrl: r.avatar_url,
      }));
    },

    async accept(meId, requestId) {
      const f = await friendsRepo.findById(requestId);
      if (!f || f.friend_player_id !== meId || f.status !== 'pending') throw notFound('Request not found');
      return friendsRepo.setStatus(requestId, 'accepted');
    },

    async reject(meId, requestId) {
      const f = await friendsRepo.findById(requestId);
      if (!f || f.friend_player_id !== meId || f.status !== 'pending') throw notFound('Request not found');
      await friendsRepo.remove(requestId);
    },

    /** Remove a friend or cancel an outgoing request; either party may do it. */
    async remove(meId, friendshipId) {
      const f = await friendsRepo.findById(friendshipId);
      if (!f || (f.player_id !== meId && f.friend_player_id !== meId)) throw notFound('Friendship not found');
      await friendsRepo.remove(friendshipId);
    },
  };
}
