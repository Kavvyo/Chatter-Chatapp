import { Server } from 'socket.io';
import http from 'http';
import express from 'express';
import { AccessToken } from 'livekit-server-sdk';
import User from '../models/user.model.js';
import { sendIncomingCallPush, sendMissedCallPush } from './pushNotifications.js';
import { checkAreFriends } from './friendshipCache.js';
import {
    buildMessagePayload,
    persistMessageInBackground,
    markConversationReadFast,
} from './messageService.js';

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
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            if (
                origin.startsWith('http://localhost:') ||
                origin.startsWith('http://127.0.0.1:') ||
                origin.startsWith('http://192.168.') ||
                origin.includes('railway.app') ||
                origin === process.env.CLIENT_URL
            ) {
                return callback(null, true);
            }
            return callback(new Error('CORS origin not allowed: ' + origin), false);
        },
        credentials: true
    },
    transports: ["websocket", "polling"],
    pingTimeout: 10000,
    pingInterval: 8000,
});

// Store connected sockets per user: userId -> Set<socket.id>
const userSocketsMap = new Map();
// Track active offline pushed calls so hangup converts notification to "Missed call"
const pendingPushedCalls = new Map();

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

    // Fast WebSocket-first text message relay with silent background MongoDB persistence
    socket.on("sendMessage", async ({ to, text, localId } = {}, ack) => {
        try {
            const senderId = socket.userId;
            if (!senderId || !to) {
                if (typeof ack === "function") ack({ ok: false, message: "Invalid sender or recipient" });
                return;
            }

            const cleanText = typeof text === "string" ? text.trim() : "";
            if (!cleanText) {
                if (typeof ack === "function") ack({ ok: false, message: "Message text is required" });
                return;
            }

            const targetId = to.toString();
            const areFriends = await checkAreFriends(senderId, targetId);
            if (!areFriends) {
                if (typeof ack === "function") ack({ ok: false, message: "You must be friends to send a message." });
                return;
            }

            const { doc, wire } = buildMessagePayload({
                senderId,
                receiverId: targetId,
                text: cleanText,
            });

            // Deliver immediately over live WebSocket before database write settles
            io.to(targetId).emit("newMessage", wire);
            // Mirror across sender's other logged-in tabs/devices
            socket.to(senderId.toString()).emit("newMessage", wire);

            if (typeof ack === "function") {
                ack({ ok: true, message: wire, localId });
            }

            // Persist silently in background
            persistMessageInBackground(doc);
        } catch (err) {
            if (typeof ack === "function") {
                ack({ ok: false, message: err?.message || "Failed to relay message" });
            }
        }
    });

    // Fast WebSocket read-receipt sync
    socket.on("markAsRead", async ({ to, messageIds } = {}) => {
        try {
            if (!socket.userId || !to) return;
            await markConversationReadFast(to.toString(), socket.userId, io, messageIds);
        } catch {
            // Safe fallback on next poll/open
        }
    });

    // Lightweight heartbeat probe so mobile clients recover immediately from OS-suspended sockets
    socket.on("heartbeat", (ack) => {
        if (typeof ack === "function") ack({ ok: true });
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
        const callerId = (from || socket.userId || "").toString();

        // Prevent self-calling loop
        if (targetId === socket.userId) {
            socket.emit("callFailed", { reason: "self", message: "You cannot call yourself" });
            if (typeof ack === "function") ack({ ok: false, reason: "self" });
            return;
        }

        const isOnline = userSocketsMap.has(targetId) && userSocketsMap.get(targetId).size > 0;
        let targetPushToken = "";

        if (!isOnline) {
            try {
                const targetUser = await User.findById(targetId).select("expoPushToken").lean();
                targetPushToken = targetUser?.expoPushToken || "";
            } catch {
                targetPushToken = "";
            }
        }

        if (!isOnline && !targetPushToken) {
            socket.emit("callFailed", { reason: "offline", message: "User is currently offline" });
            if (typeof ack === "function") ack({ ok: false, reason: "offline" });
            return;
        }

        // Sign both caller & receiver LiveKit JWT tokens in parallel (~0.5ms, zero DB query)
        const [callerAuth, receiverAuth] = await Promise.all([
            generateCallToken(callerId, name, roomName),
            generateCallToken(targetId, receiverName || "User", roomName),
        ]);

        // Notify any online devices/tabs immediately via Socket.IO
        if (isOnline) {
            socket.to(targetId).emit("incomingCall", {
                roomName,
                from: callerId,
                name,
                avatar,
                callType: callType || "video",
                token: receiverAuth?.token || null,
                url: receiverAuth?.url || null,
            });
        }

        // Send high-priority push notification to wake killed/backgrounded mobile devices
        if (!isOnline && targetPushToken) {
            const pushKey = `${callerId}:${targetId}`;
            pendingPushedCalls.set(pushKey, {
                expoPushToken: targetPushToken,
                callerId,
                callerName: name || "Incoming Caller",
                callType: callType || "video",
                roomName,
            });
            setTimeout(() => pendingPushedCalls.delete(pushKey), 50000);

            sendIncomingCallPush({
                expoPushToken: targetPushToken,
                roomName,
                callerId,
                callerName: name,
                callerAvatar: avatar,
                callType: callType || "video",
                receiverToken: receiverAuth?.token || null,
                livekitUrl: receiverAuth?.url || null,
            });
        }

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
        if (to && socket.userId) {
            pendingPushedCalls.delete(`${to.toString()}:${socket.userId}`);
        }
        if (to) {
            socket.to(to.toString()).emit("callAccepted", { roomName });
        }
        // Dismiss ringing modal on any other open tabs of the receiver
        if (socket.userId) {
            socket.to(socket.userId).emit("callHandledElsewhere");
        }
    });

    socket.on("rejectCall", ({ to }) => {
        if (to && socket.userId) {
            pendingPushedCalls.delete(`${to.toString()}:${socket.userId}`);
        }
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
            const targetId = to.toString();
            const callerId = socket.userId?.toString() || "";
            const pushKey = `${callerId}:${targetId}`;
            const pushedCall = pendingPushedCalls.get(pushKey);
            if (pushedCall) {
                pendingPushedCalls.delete(pushKey);
                sendMissedCallPush(pushedCall);
            }
            socket.to(targetId).emit("callEnded");
        }
    });
});


export {io, app, server};