import PendingSticker from "../models/pendingSticker.model.js";
import { checkAreFriends } from "./friendshipCache.js";

// Base64 expansion adds ~33%, so 2.6M chars covers up to ~1.9 MB binary stickers cleanly.
export const MAX_STICKER_BASE64_CHARS = 2_600_000;

/**
 * Relays a sticker immediately when the recipient is connected, or temporarily queues it
 * in PendingSticker so mobile-data/sleeping recipients receive it automatically on reconnect.
 */
export async function relayOrQueueSticker({
  senderId,
  targetId,
  messageId,
  stickerHash,
  isAnimated = false,
  width = 512,
  height = 512,
  dataBase64,
  createdAt,
  io,
  isTargetOnline,
  excludeSenderSocket = null,
}) {
  if (!senderId || !targetId || !messageId || !stickerHash) {
    return { status: 400, ok: false, message: "Invalid sticker payload" };
  }

  if (typeof dataBase64 === "string" && dataBase64.length > MAX_STICKER_BASE64_CHARS) {
    return { status: 413, ok: false, message: "Sticker exceeds 1.8 MB limit" };
  }

  const fromId = senderId.toString();
  const toId = targetId.toString();

  const areFriends = await checkAreFriends(fromId, toId);
  if (!areFriends) {
    return { status: 403, ok: false, message: "You must be friends to send stickers." };
  }

  const createdIso = createdAt || new Date().toISOString();
  const cleanId = messageId.toString();
  const cleanHash = stickerHash.toString();
  const hasBase64 = typeof dataBase64 === "string" && dataBase64.length > 0;

  const wireSticker = {
    _id: cleanId,
    senderId: fromId,
    receiverId: toId,
    isSticker: true,
    stickerHash: cleanHash,
    isAnimated: Boolean(isAnimated),
    width: width || 512,
    height: height || 512,
    ...(hasBase64 ? { dataBase64 } : {}),
    createdAt: createdIso,
  };

  if (excludeSenderSocket) {
    excludeSenderSocket.to(fromId).emit("newSticker", wireSticker);
  } else {
    io.to(fromId).emit("newSticker", wireSticker);
  }

  if (isTargetOnline) {
    io.to(toId).emit("newSticker", wireSticker);
    return { status: 200, ok: true, delivered: true, serverQueued: false, offline: false, messageId: cleanId };
  }

  await PendingSticker.updateOne(
    { messageId: cleanId },
    {
      $setOnInsert: {
        to: toId,
        from: fromId,
        messageId: cleanId,
        stickerHash: cleanHash,
        isAnimated: Boolean(isAnimated),
        width: width || 512,
        height: height || 512,
        dataBase64: hasBase64 ? dataBase64 : null,
        clientCreatedAt: createdIso,
      },
    },
    { upsert: true }
  );

  return { status: 200, ok: true, delivered: false, serverQueued: true, offline: true, messageId: cleanId };
}

/**
 * Flushes any stickers queued while a user was offline/asleep and deletes them immediately once pushed.
 */
export async function flushPendingStickersForUser(userId, io) {
  if (!userId || !io) return;
  const uid = userId.toString();
  try {
    const queued = await PendingSticker.find({ to: uid }).sort({ createdAt: 1 }).limit(40).lean();
    if (!queued.length) return;

    const sentIds = [];
    for (const item of queued) {
      io.to(uid).emit("newSticker", {
        _id: item.messageId,
        senderId: item.from.toString(),
        receiverId: uid,
        isSticker: true,
        stickerHash: item.stickerHash,
        isAnimated: Boolean(item.isAnimated),
        width: item.width || 512,
        height: item.height || 512,
        ...(item.dataBase64 ? { dataBase64: item.dataBase64 } : {}),
        createdAt: item.clientCreatedAt || item.createdAt?.toISOString() || new Date().toISOString(),
      });
      sentIds.push(item._id);
    }

    if (sentIds.length > 0) {
      await PendingSticker.deleteMany({ _id: { $in: sentIds } });
    }
  } catch (err) {
    console.warn("Failed to flush pending stickers for user:", err?.message || err);
  }
}
