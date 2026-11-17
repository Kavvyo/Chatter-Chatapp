import {Server} from 'socket.io';
import http from 'http';
import express from 'express';

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: [process.env.CLIENT_URL, "http://localhost:5173", "http://127.0.0.1:5173"].filter(Boolean),
        credentials: true
    }
});

// Store connected sockets per user: userId -> Set<socket.id>
const userSocketsMap = new Map();

export function getReciverSocketId(userId) {
    if (!userId) return null;
    const uid = userId.toString();
    const sockets = userSocketsMap.get(uid);
    if (sockets && sockets.size > 0) {
        return uid; // Room name for the user
    }
    return null;
}

io.on("connection", (socket) => {
    console.log("A user connected", socket.id);

    const userId = socket.handshake.query.userId;
    if (userId) {
        const uid = userId.toString();
        socket.userId = uid;
        socket.join(uid);

        if (!userSocketsMap.has(uid)) {
            userSocketsMap.set(uid, new Set());
        }
        userSocketsMap.get(uid).add(socket.id);
    }

    io.emit("getOnlineUsers", Array.from(userSocketsMap.keys()));

    socket.on("typing", ({ to }) => {
        if (to) {
            io.to(to.toString()).emit("typing", { from: socket.userId });
        }
    });
    
    socket.on("stopTyping", ({ to }) => {
        if (to) {
            io.to(to.toString()).emit("stopTyping", { from: socket.userId });
        }
    });

    socket.on("disconnect", () => {
        console.log("A user disconnected", socket.id);
        if (socket.userId) {
            const uid = socket.userId;
            const sockets = userSocketsMap.get(uid);
            if (sockets) {
                sockets.delete(socket.id);
                if (sockets.size === 0) {
                    userSocketsMap.delete(uid);
                }
            }
        }
        io.emit("getOnlineUsers", Array.from(userSocketsMap.keys()));
    });

    // WebRTC Signalling Events
    socket.on("callUser", ({ userToCall, signalData, from, name, avatar, callType }) => {
        if (!userToCall) return;
        const targetId = userToCall.toString();
        const isOnline = userSocketsMap.has(targetId) && userSocketsMap.get(targetId).size > 0;

        if (!isOnline) {
            socket.emit("callFailed", { reason: "offline", message: "User is currently offline" });
            return;
        }

        io.to(targetId).emit("incomingCall", { 
            signal: signalData, 
            from, 
            name, 
            avatar,
            callType: callType || "video" 
        });
    });

    socket.on("answerCall", ({ to, signal }) => {
        if (to) {
            io.to(to.toString()).emit("callAccepted", signal);
        }
    });

    socket.on("rejectCall", ({ to }) => {
        if (to) {
            io.to(to.toString()).emit("callRejected");
        }
    });

    socket.on("userBusy", ({ to }) => {
        if (to) {
            io.to(to.toString()).emit("userBusy");
        }
    });

    socket.on("endCall", ({ to }) => {
        if (to) {
            io.to(to.toString()).emit("callEnded");
        }
    });
});


export {io, app, server};