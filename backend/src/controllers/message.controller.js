import User from "../models/user.model.js";
import Message from '../models/message.model.js'
import cloudinary from "../lib/cloudinary.js";
import { getReciverSocketId, io } from "../lib/socket.js";
import Friendship from "../models/friendships.model.js";
import mongoose from "mongoose";

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
        const {id: userToChatId} = req.params;
        const myId = req.user._id;

        const messages = await Message.find({
                $or:[
                    {senderId: myId, receiverId: userToChatId},
                    {senderId: userToChatId, receiverId: myId}
                ]
        });

        res.status(200).json(messages);


    } catch (error) {
        console.log('Error in Getmessages: ', error.message);
        res.status(500).json({message: 'Internal Server Error'});
    }
}

export const sendMessages = async (req, res) => {
    try {
        const {text, image} = req.body;
        const {id: receiverId} = req.params;
        const senderId = req.user._id;

        let imageUrl;
        if(image){
            const uploadResponse = await cloudinary.uploader.upload(image);
            imageUrl = uploadResponse.secure_url;
        }

        const newMessage = new Message({
            senderId,
            receiverId,
            text,
            image: imageUrl,
            read: false,
        });

        const areFriends = await Friendship.findOne({
            $or: [
              { requester: senderId, recipient: receiverId, status: "accepted" },
              { requester: receiverId, recipient: senderId, status: "accepted" }
            ]
        });
          
        if (!areFriends) {
            return res.status(403).json({ message: "You must be friends to send a message." });
        }          

        await newMessage.save();

        const reciverSocketId = getReciverSocketId(receiverId);
        if(reciverSocketId){
            io.to(reciverSocketId).emit("newMessage", newMessage); 
        }

        res.status(200).json(newMessage);
        
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

        await Message.updateMany(
            { senderId, receiverId, read: false },
            { $set: { read: true } }
        );

        const updatedMessages = await Message.find({
            senderId,
            receiverId,
            read: true
        });

        const senderSocketId = getReciverSocketId(senderId);
        if (senderSocketId) {
            io.to(senderSocketId).emit("messageRead", {
                readerId: receiverId,
                messages: updatedMessages,
            });
        }


        res.status(200).json({ message: "Messages marked as read" });
    } catch (error) {
        console.error("Error marking messages as read:", error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

