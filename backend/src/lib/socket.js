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

    // LiveKit Call Signalling Events
    socket.on("callUser", ({ userToCall, roomName, from, name, avatar, callType }) => {
        if (!userToCall || !roomName) return;
        const targetId = userToCall.toString();

        // Prevent self-calling loop
        if (targetId === socket.userId) {
            socket.emit("callFailed", { reason: "self", message: "You cannot call yourself" });
            return;
        }

        const isOnline = userSocketsMap.has(targetId) && userSocketsMap.get(targetId).size > 0;

        if (!isOnline) {
            socket.emit("callFailed", { reason: "offline", message: "User is currently offline" });
            return;
        }

        // Notify all devices/tabs of the target user
        socket.to(targetId).emit("incomingCall", { 
            roomName,
            from, 
            name, 
            avatar,
            callType: callType || "video" 
        });
    });

    socket.on("answerCall", ({ to, roomName }) => {
        if (to) {
            socket.to(to.toString()).emit("callAccepted", { roomName });
        }
        // Dismiss ringing modal on any other open tabs of the receiver
        if (socket.userId) {
            socket.to(socket.userId).emit("callHandledElsewhere");
        }
    });

    socket.on("rejectCall", ({ to }) => {
        if (to) {
            socket.to(to.toString()).emit("callRejected");
        }
        // Dismiss ringing modal on any other open tabs of the receiver
        if (socket.userId) {
            socket.to(socket.userId).emit("callHandledElsewhere");
        }
    });

    socket.on("userBusy", ({ to }) => {
        if (to) {
            socket.to(to.toString()).emit("userBusy");
        }
    });

    socket.on("endCall", ({ to }) => {
        if (to) {
            socket.to(to.toString()).emit("callEnded");
        }
    });
});


export {io, app, server};