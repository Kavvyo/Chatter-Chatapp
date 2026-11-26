import mongoose from "mongoose";
import Message from "../models/message.model.js";

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
  Message.create(doc).catch((err) => {
    console.warn("Background message persist failed, retrying:", err?.message || err);
    setTimeout(() => {
      Message.create(doc).catch((retryErr) => {
        console.error("Background message persist retry failed:", retryErr?.message || retryErr);
      });
    }, 1500);
  });
}

export async function markConversationReadFast(senderId, receiverId, ioInstance) {
  const unreadDocs = await Message.find({
    senderId,
    receiverId,
    read: false,
  })
    .select("_id")
    .lean();

  if (!unreadDocs || unreadDocs.length === 0) {
    return [];
  }

  const ids = unreadDocs.map((m) => m._id);
  await Message.updateMany({ _id: { $in: ids } }, { $set: { read: true } });

  if (ioInstance) {
    ioInstance.to(senderId.toString()).emit("messageRead", {
      readerId: receiverId,
      messages: unreadDocs,
    });
  }

  return unreadDocs;
}
