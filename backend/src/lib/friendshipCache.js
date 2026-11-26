import Friendship from "../models/friendships.model.js";

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 10000;
const friendshipCache = new Map();

function makePairKey(userA, userB) {
  const a = userA.toString();
  const b = userB.toString();
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function setFriendshipCache(userA, userB, accepted) {
  if (!userA || !userB) return;
  if (friendshipCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = friendshipCache.keys().next().value;
    if (oldestKey) friendshipCache.delete(oldestKey);
  }
  friendshipCache.set(makePairKey(userA, userB), {
    accepted: Boolean(accepted),
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

export function invalidateFriendshipCache(userA, userB) {
  if (!userA || !userB) return;
  friendshipCache.delete(makePairKey(userA, userB));
}

export async function checkAreFriends(userA, userB) {
  if (!userA || !userB) return false;
  const key = makePairKey(userA, userB);
  const cached = friendshipCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.accepted;
  }

  const found = await Friendship.exists({
    $or: [
      { requester: userA, recipient: userB, status: "accepted" },
      { requester: userB, recipient: userA, status: "accepted" },
    ],
  });

  const accepted = Boolean(found);
  setFriendshipCache(userA, userB, accepted);
  return accepted;
}
