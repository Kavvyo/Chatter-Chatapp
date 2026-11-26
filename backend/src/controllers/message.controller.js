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
} from "../lib/messageService.js";

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

            const recentDesc = await Message.find(queryFilter)
                .sort({ createdAt: -1 })
                .limit(safeLimit);

            return res.status(200).json(recentDesc.reverse());
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

export const deleteAllMessages = async (req, res) => {
    try {
        const {id: receiverId} = req.params;
        const myId = req.user._id;

        const deleted = await Message.deleteMany({
            $or:[
                {senderId: myId, receiverId: receiverId},
                {senderId: receiverId, receiverId: myId}
            ]
        });

        if (!deleted) {
            return res.status(404).json({ message: "Masseges alredy deleted" });
        }

        res.status(200).json({ message: "conversation Deleted" });
    } catch (error) {
        console.log("Error conversation deletation:", error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

export const unreadCounts = async (req, res) => {

    const userId = new mongoose.Types.ObjectId(req.user.id);

    try {
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

