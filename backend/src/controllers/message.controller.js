import User from "../models/user.model.js";
import Message from '../models/message.model.js'
import cloudinary from "../lib/cloudinary.js";
import { getReciverSocketId, io } from "../lib/socket.js";
import Friendship from "../models/friendships.model.js";
import mongoose from "mongoose";
import { checkAreFriends } from "../lib/friendshipCache.js";
import {
    buildMessagePayload,
    persistMessageInBackground,
    markConversationReadFast,
    cancelPendingForConversation,
} from "../lib/messageService.js";
import ConversationClear, { getConversationPairKey } from "../models/conversationClear.model.js";
import PendingSticker from "../models/pendingSticker.model.js";
import { relayOrQueueSticker } from "../lib/stickerRelay.js";

export const getUserForSidebar = async (req, res) => {
    try {
        const loggedInUserId = req.user._id;
        const filterdUsers = await User.find({ _id: {$ne: loggedInUserId}}).select("-password");
        res.status(200).json(filterdUsers);
    } catch (error) {
        console.log('Error in getUserForSidebar: ', error.message);
        res.status(500).json({message: 'Internal Server Error'});
    }
}

export const getMessages = async (req, res) => {
    try {
        const { id: userToChatId } = req.params;
        const { after, before, limit } = req.query;
        const myId = req.user._id;

        const baseFilter = {
            $or: [
                { senderId: myId, receiverId: userToChatId },
                { senderId: userToChatId, receiverId: myId },
            ],
        };

        // Incremental delta sync: fetch only messages created after a cursor timestamp
        if (typeof after === "string" && after.trim()) {
            const afterDate = new Date(after);
            if (!Number.isNaN(afterDate.getTime())) {
                if (req.query.syncMeta === "1") {
                    const pairKey = getConversationPairKey(myId, userToChatId);
                    const [deltaMessages, clearDoc, serverCount] = await Promise.all([
                        Message.find({
                            ...baseFilter,
                            createdAt: { $gt: afterDate },
                        }).sort({ createdAt: 1 }),
                        ConversationClear.findOne({ participantsKey: pairKey })
                            .select("clearedAt")
                            .lean(),
                        Message.countDocuments(baseFilter),
                    ]);

                    return res.status(200).json({
                        messages: deltaMessages,
                        clearedAt: clearDoc?.clearedAt ? clearDoc.clearedAt.toISOString() : null,
                        serverCount,
                        serverNow: new Date().toISOString(),
                    });
                }

                const deltaMessages = await Message.find({
                    ...baseFilter,
                    createdAt: { $gt: afterDate },
                }).sort({ createdAt: 1 });
                return res.status(200).json(deltaMessages);
            }
        }

        // Paginated older slice or initial recent page
        const parsedLimit = Number.parseInt(limit, 10);
        if (!Number.isNaN(parsedLimit) && parsedLimit > 0) {
            const safeLimit = Math.min(parsedLimit, 200);
            const queryFilter = { ...baseFilter };

            if (typeof before === "string" && before.trim()) {
                const beforeDate = new Date(before);
                if (!Number.isNaN(beforeDate.getTime())) {
                    queryFilter.createdAt = { $lt: beforeDate };
                }
            }

            if (req.query.syncMeta === "1" && !before) {
                const pairKey = getConversationPairKey(myId, userToChatId);
                const [recentDesc, clearDoc] = await Promise.all([
                    Message.find(queryFilter).sort({ createdAt: -1 }).limit(safeLimit),
                    ConversationClear.findOne({ participantsKey: pairKey })
                        .select("clearedAt")
                        .lean(),
                ]);

                return res.status(200).json({
                    messages: recentDesc.reverse(),
                    clearedAt: clearDoc?.clearedAt ? clearDoc.clearedAt.toISOString() : null,
                    serverNow: new Date().toISOString(),
                });
            }

            const recentDesc = await Message.find(queryFilter)
                .sort({ createdAt: -1 })
                .limit(safeLimit);

            return res.status(200).json(recentDesc.reverse());
        }

        if (req.query.syncMeta === "1") {
            const pairKey = getConversationPairKey(myId, userToChatId);
            const [messages, clearDoc] = await Promise.all([
                Message.find(baseFilter).sort({ createdAt: 1 }),
                ConversationClear.findOne({ participantsKey: pairKey })
                    .select("clearedAt")
                    .lean(),
            ]);
            return res.status(200).json({
                messages,
                clearedAt: clearDoc?.clearedAt ? clearDoc.clearedAt.toISOString() : null,
                serverNow: new Date().toISOString(),
            });
        }

        // Default unpaginated response (100% backward compatible with Web client)
        const messages = await Message.find(baseFilter).sort({ createdAt: 1 });
        res.status(200).json(messages);
    } catch (error) {
        console.log('Error in Getmessages: ', error.message);
        res.status(500).json({ message: 'Internal Server Error' });
    }
}

export const sendMessages = async (req, res) => {
    try {
        const {text, image} = req.body;
        const {id: receiverId} = req.params;
        const senderId = req.user._id;

        const areFriends = await checkAreFriends(senderId, receiverId);
        if (!areFriends) {
            return res.status(403).json({ message: "You must be friends to send a message." });
        }

        let imageUrl;
        if(image){
            const uploadResponse = await cloudinary.uploader.upload(image);
            imageUrl = uploadResponse.secure_url;
        }

        const { doc, wire } = buildMessagePayload({ senderId, receiverId, text, imageUrl });

        // Relay over Socket.IO and respond immediately, persisting asynchronously to MongoDB
        const reciverSocketId = getReciverSocketId(receiverId);
        if(reciverSocketId){
            io.to(reciverSocketId).emit("newMessage", wire);
        }

        res.status(200).json(wire);
        persistMessageInBackground(doc);
        
    } catch (error) {
        console.log('Error in sendMessages ', error.message);
        res.status(500).json({message: 'Internal Server Error'});
    }
}

export const sendStickerHttp = async (req, res) => {
    try {
        const senderId = req.user._id;
        const { id: targetId } = req.params;
        const {
            messageId,
            stickerHash,
            isAnimated,
            width,
            height,
            dataBase64,
            createdAt,
        } = req.body || {};

        const isTargetOnline = Boolean(getReciverSocketId(targetId));
        const result = await relayOrQueueSticker({
            senderId,
            targetId,
            messageId,
            stickerHash,
            isAnimated,
            width,
            height,
            dataBase64,
            createdAt,
            io,
            isTargetOnline,
        });

        return res.status(result.status || 200).json(result);
    } catch (error) {
        console.log("Error in sendStickerHttp:", error.message);
        return res.status(500).json({ ok: false, message: "Internal Server Error" });
    }
};

export const deleteAllMessages = async (req, res) => {
    try {
        const {id: receiverId} = req.params;
        const myId = req.user._id;
        const clearedAt = new Date();
        const clearedAtIso = clearedAt.toISOString();
        const pairKey = getConversationPairKey(myId, receiverId);

        const inFlightIds = cancelPendingForConversation(myId, receiverId);

        const [deleted] = await Promise.all([
            Message.deleteMany({
                $or:[
                    {senderId: myId, receiverId: receiverId},
                    {senderId: receiverId, receiverId: myId}
                ]
            }),
            PendingSticker.deleteMany({
                $or: [
                    { from: myId, to: receiverId },
                    { from: receiverId, to: myId },
                ],
            }),
            ConversationClear.findOneAndUpdate(
                { participantsKey: pairKey },
                {
                    $set: {
                        participants: [myId, receiverId],
                        clearedAt,
                        clearedBy: myId,
                    },
                },
                { upsert: true, new: true }
            ),
        ]);

        if (!deleted) {
            return res.status(404).json({ message: "Masseges alredy deleted" });
        }

        // Sweep any in-flight write-behind creates that had already reached MongoDB
        if (inFlightIds.length > 0) {
            setTimeout(() => {
                Message.deleteMany({ _id: { $in: inFlightIds } }).catch(() => {});
            }, 500);
        }

        // Immediately sync clear across both users' connected mobile and web clients
        io.to(receiverId.toString()).emit("conversationCleared", {
            peerId: myId.toString(),
            clearedBy: myId.toString(),
            clearedAt: clearedAtIso,
        });
        io.to(myId.toString()).emit("conversationCleared", {
            peerId: receiverId.toString(),
            clearedBy: myId.toString(),
            clearedAt: clearedAtIso,
        });

        res.status(200).json({ message: "conversation Deleted", clearedAt: clearedAtIso });
    } catch (error) {
        console.log("Error conversation deletation:", error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

export const unreadCounts = async (req, res) => {

    const userId = new mongoose.Types.ObjectId(req.user.id);

    try {
        if (req.query.includeClears === "1") {
            const myIdStr = req.user.id.toString();
            const [counts, clearDocs] = await Promise.all([
                Message.aggregate([
                    { $match: { receiverId: userId, read: false } },
                    { $group: { _id: "$senderId", count: { $sum: 1 } } }
                ]),
                ConversationClear.find({ participants: userId })
                    .select("participants clearedAt")
                    .lean(),
            ]);

            const clears = {};
            for (const doc of clearDocs) {
                const peer = doc.participants.find((p) => p.toString() !== myIdStr);
                if (peer && doc.clearedAt) {
                    clears[peer.toString()] = doc.clearedAt.toISOString();
                }
            }

            return res.json({ counts, clears, serverNow: new Date().toISOString() });
        }

        const unreadCounts = await Message.aggregate([

            { $match: { receiverId: userId, read: false } },
            { $group: { _id: "$senderId", count: { $sum: 1 } } }
        ]);

        res.json(unreadCounts);

    } catch (error) {
        console.log("Error in Unreads counts:", error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }

}

export const markMessagesAsRead = async (req, res) => {
    try {
        const receiverId = req.user._id;
        const senderId = req.params.id;

        await markConversationReadFast(senderId, receiverId, io);

        res.status(200).json({ message: "Messages marked as read" });
    } catch (error) {
        console.error("Error marking messages as read:", error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

