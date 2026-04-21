import {Server} from 'socket.io';
import http from 'http';
import express from 'express';

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173",
    }
});

export function getReciverSocketId(userId) {
    return userSocketMap[userId];
}

const userSocketMap = {}; // store online users

io.on("connection", (socket) => {
    console.log("A user connected", socket.id);

    const userId = socket.handshake.query.userId;
    if(userId) {
        userSocketMap[userId] = socket.id;
        socket.userId = userId;
    }

    io.emit("getOnlineUsers", Object.keys(userSocketMap));

    socket.on("typing", ({ to }) => {
        const receiverSocketId = userSocketMap[to];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("typing", { from: socket.userId });
        }
    });
    
    socket.on("stopTyping", ({ to }) => {
        const receiverSocketId = userSocketMap[to];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("stopTyping", { from: socket.userId });
        }
    });


    socket.on("disconnect", () => {
        console.log("A user disconnected", socket.id);
        delete userSocketMap[userId];
        io.emit("getOnlineUsers", Object.keys(userSocketMap));
    });

    // WebRTC Signalling Events
    socket.on("callUser", ({ userToCall, signalData, from, name }) => {
        const receiverSocketId = userSocketMap[userToCall];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("incomingCall", { signal: signalData, from, name });
        }
    });

    socket.on("answerCall", ({ to, signal }) => {
        const callerSocketId = userSocketMap[to]; // 'to' is the original caller
        if (callerSocketId) {
            io.to(callerSocketId).emit("callAccepted", signal);
        }
    });

    socket.on("endCall", ({ to }) => {
        const receiverSocketId = userSocketMap[to];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("callEnded");
        }
    });
})


export {io, app, server};