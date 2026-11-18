import { Server } from 'socket.io';
import http from 'http';
import express from 'express';
import { AccessToken } from 'livekit-server-sdk';

async function generateCallToken(identity, name, roomName) {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const url = process.env.LIVEKIT_URL;
    if (!apiKey || !apiSecret || !url) return null;

    const at = new AccessToken(apiKey, apiSecret, {
        identity: identity.toString(),
        name: name || "User",
        ttl: "2h",
    });

    at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
    });

    const token = await at.toJwt();
    return { token, url };
}

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: [process.env.CLIENT_URL, "http://localhost:5173", "http://127.0.0.1:5173"].filter(Boolean),
        credentials: true
    },
    transports: ["websocket", "polling"],
    pingTimeout: 20000,
    pingInterval: 10000,
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
    socket.on("callUser", async ({ userToCall, roomName, from, name, avatar, callType, receiverName }, ack) => {
        if (!userToCall || !roomName) return;
        const targetId = userToCall.toString();

        // Prevent self-calling loop
        if (targetId === socket.userId) {
            socket.emit("callFailed", { reason: "self", message: "You cannot call yourself" });
            if (typeof ack === "function") ack({ ok: false, reason: "self" });
            return;
        }

        const isOnline = userSocketsMap.has(targetId) && userSocketsMap.get(targetId).size > 0;

        if (!isOnline) {
            socket.emit("callFailed", { reason: "offline", message: "User is currently offline" });
            if (typeof ack === "function") ack({ ok: false, reason: "offline" });
            return;
        }

        // Sign both caller & receiver LiveKit JWT tokens in parallel (~0.5ms, zero DB query)
        const [callerAuth, receiverAuth] = await Promise.all([
            generateCallToken(from || socket.userId, name, roomName),
            generateCallToken(targetId, receiverName || "User", roomName),
        ]);

        // Notify all devices/tabs of the target user with their token already bundled
        socket.to(targetId).emit("incomingCall", {
            roomName,
            from,
            name,
            avatar,
            callType: callType || "video",
            token: receiverAuth?.token || null,
            url: receiverAuth?.url || null,
        });

        // Immediately return caller's token via ack callback
        if (typeof ack === "function") {
            ack({
                ok: true,
                token: callerAuth?.token || null,
                url: callerAuth?.url || null,
            });
        }
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