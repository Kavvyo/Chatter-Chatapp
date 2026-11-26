import mongoose from "mongoose";
import Message from "../models/message.model.js";

// Track messages currently waiting on background DB insertion so instant read receipts never miss them
const pendingDocs = new Map();

export function buildMessagePayload({ senderId, receiverId, text, imageUrl }) {
  const id = new mongoose.Types.ObjectId();
  const now = new Date();

  const doc = {
    _id: id,
    senderId,
    receiverId,
    ...(text !== undefined ? { text } : {}),
    ...(imageUrl !== undefined ? { image: imageUrl } : {}),
    read: false,
    createdAt: now,
    updatedAt: now,
  };

  const wire = {
    _id: id.toString(),
    senderId: senderId.toString(),
    receiverId: receiverId.toString(),
    ...(text !== undefined ? { text } : {}),
    ...(imageUrl !== undefined ? { image: imageUrl } : {}),
    read: false,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  return { doc, wire };
}

export function persistMessageInBackground(doc) {
  const docKey = doc._id.toString();
  pendingDocs.set(docKey, doc);

  Message.create(doc)
    .then(() => {
      pendingDocs.delete(docKey);
    })
    .catch((err) => {
      console.warn("Background message persist failed, retrying:", err?.message || err);
      setTimeout(() => {
        Message.create(doc)
          .catch((retryErr) => {
            console.error("Background message persist retry failed:", retryErr?.message || retryErr);
          })
          .finally(() => {
            pendingDocs.delete(docKey);
          });
      }, 1500);
    });
}

function emitReadReceipt(ioInstance, senderId, receiverId, ids) {
  if (!ioInstance || !ids || ids.length === 0) return;
  const docs = ids.map((_id) => ({ _id }));
  ioInstance.to(senderId).emit("messageRead", {
    readerId: receiverId,
    messages: docs,
    messageIds: ids,
  });
}

function syncReadInBackground(senderId, receiverId, emittedSet, hasInFlight, ioInstance) {
  const runSync = async () => {
    const dbUnread = await Message.find({
      senderId,
      receiverId,
      read: false,
    })
      .select("_id")
      .lean();

    if (dbUnread.length > 0) {
      const dbIds = dbUnread.map((m) => m._id);
      await Message.updateMany({ _id: { $in: dbIds } }, { $set: { read: true } });

      // Notify sender for any older unread DB docs not already included in immediate emit
      const extraIds = dbUnread
        .map((m) => m._id.toString())
        .filter((id) => !emittedSet.has(id));
      if (extraIds.length > 0) {
        emitReadReceipt(ioInstance, senderId, receiverId, extraIds);
      }
    }

    if (hasInFlight) {
      setTimeout(() => {
        Message.updateMany(
          { senderId, receiverId, read: false },
          { $set: { read: true } }
        ).catch(() => {});
      }, 450);
    }
  };

  runSync().catch((err) => {
    console.warn("Background mark-read sync failed:", err?.message || err);
  });
}

export async function markConversationReadFast(senderId, receiverId, ioInstance, knownMessageIds = []) {
  if (!senderId || !receiverId) return [];
  const sId = senderId.toString();
  const rId = receiverId.toString();

  const immediateSet = new Set();
  if (Array.isArray(knownMessageIds)) {
    for (const rawId of knownMessageIds) {
      const idStr = rawId?.toString();
      if (idStr && !idStr.startsWith("temp_")) {
        immediateSet.add(idStr);
      }
    }
  }

  let hasInFlight = false;
  for (const doc of pendingDocs.values()) {
    if (doc.senderId?.toString() === sId && doc.receiverId?.toString() === rId) {
      hasInFlight = true;
      doc.read = true;
      immediateSet.add(doc._id.toString());
    }
  }

  // Zero-DB-wait path when client passes incoming message IDs or messages are still persisting
  if (immediateSet.size > 0) {
    const ids = Array.from(immediateSet);
    emitReadReceipt(ioInstance, sId, rId, ids);
    syncReadInBackground(sId, rId, immediateSet, hasInFlight, ioInstance);
    return ids.map((_id) => ({ _id }));
  }

  // Fallback path (e.g. HTTP PUT or initial open without cached IDs)
  const unreadDocs = await Message.find({
    senderId: sId,
    receiverId: rId,
    read: false,
  })
    .select("_id")
    .lean();

  if (!unreadDocs || unreadDocs.length === 0) {
    return [];
  }

  const ids = unreadDocs.map((m) => m._id.toString());
  emitReadReceipt(ioInstance, sId, rId, ids);

  Message.updateMany(
    { _id: { $in: unreadDocs.map((m) => m._id) } },
    { $set: { read: true } }
  ).catch((err) => {
    console.warn("Background mark-read update failed:", err?.message || err);
  });

  return unreadDocs;
}
