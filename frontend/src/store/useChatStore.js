import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstanace } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";
import { useStickerStore } from "./useStickerStore";
import {
  clearLocalStickerMessages,
  getCachedStickerUrlSync,
  getLocalStickerMessages,
  getStickerOutbox,
  markLocalStickersRead,
  pruneLocalStickerMessagesBefore,
  readStickerBase64,
  resolveLocalStickerUri,
  saveLocalStickerMessage,
  saveReceivedSticker,
  setStickerOutbox,
} from "../lib/stickers";

const recentReadIds = new Set();
const sentStickerHashesByPeer = new Map();
let isFlushingOutbox = false;

function markStickerHashKnownByPeer(peerId, stickerHash) {
  if (!peerId || !stickerHash) return;
  let setForPeer = sentStickerHashesByPeer.get(peerId);
  if (!setForPeer) {
    setForPeer = new Set();
    sentStickerHashesByPeer.set(peerId, setForPeer);
  }
  setForPeer.add(stickerHash);
}

function emitStickerOverSocket({
  peerId,
  messageId,
  stickerHash,
  isAnimated,
  createdAt,
  dataBase64,
}) {
  const socket = useAuthStore.getState().socket;
  if (!socket?.connected) {
    return Promise.resolve({ ok: false, delivered: false, serverQueued: false });
  }
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ ok: false, delivered: false, serverQueued: false });
      }
    }, 15000);

    socket.emit(
      "sendSticker",
      {
        to: peerId,
        messageId,
        stickerHash,
        isAnimated: Boolean(isAnimated),
        createdAt,
        ...(dataBase64 ? { dataBase64 } : {}),
      },
      (ack) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (ack?.ok === false) {
          resolve({ ok: false, delivered: false, serverQueued: false, error: ack.message });
        } else {
          resolve({
            ok: true,
            delivered: Boolean(ack?.delivered),
            serverQueued: Boolean(ack?.serverQueued),
          });
        }
      }
    );
  });
}

async function dispatchStickerReliable(params) {
  const sockRes = await emitStickerOverSocket(params);
  if (sockRes.error || sockRes.delivered || sockRes.serverQueued) {
    return sockRes;
  }

  try {
    const httpRes = await axiosInstanace.post(
      `/messages/sticker/${params.peerId}`,
      {
        messageId: params.messageId,
        stickerHash: params.stickerHash,
        isAnimated: Boolean(params.isAnimated),
        width: 512,
        height: 512,
        ...(params.dataBase64 ? { dataBase64: params.dataBase64 } : {}),
        createdAt: params.createdAt,
      },
      { timeout: 25000 }
    );
    return {
      ok: Boolean(httpRes.data?.ok),
      delivered: Boolean(httpRes.data?.delivered),
      serverQueued: Boolean(httpRes.data?.serverQueued),
      error: httpRes.data?.ok === false ? httpRes.data?.message : undefined,
    };
  } catch (err) {
    const status = err?.response?.status;
    if (status && status >= 400 && status < 500) {
      return {
        ok: false,
        delivered: false,
        serverQueued: false,
        error: err?.response?.data?.message || "Sticker could not be sent",
      };
    }
    return { ok: false, delivered: false, serverQueued: false };
  }
}

async function queueStickerOutboxItem(myId, item) {
  if (!myId) return;
  const list = await getStickerOutbox(myId);
  if (list.some((x) => x.messageId === item.messageId)) return;
  await setStickerOutbox(myId, [...list, item]);
}

export const useChatStore = create((set, get) => ({
    messages: [],
    users: [],
    selectedUser: null,
    isUsersLoading: false,
    isMessagesLoading: false,
    unreadCounts: {},
    typingUsers: {},


    getUsers: async () => {
        set({isUsersLoading: true});
        try {
            const res = await axiosInstanace.get('/messages/users');
            const verifiedUsers = res.data.filter(user => user.isVerified);  // Filter only verified users
            set({ users: verifiedUsers });  // Store only verified users
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to load users");
        }
        finally{
            set({isUsersLoading: false});
        }
    },

    getMessages: async (userId) => {
        set({isMessagesLoading: true});
        try {
            const myId = useAuthStore.getState().authUser?._id;
            const [res, localStickers] = await Promise.all([
                axiosInstanace.get(`/messages/${userId}`, { params: { syncMeta: "1" } }),
                myId ? getLocalStickerMessages(myId, userId) : Promise.resolve([]),
            ]);

            const payload = res.data;
            const serverMsgs = Array.isArray(payload) ? payload : payload?.messages || [];
            const clearedAt = Array.isArray(payload) ? null : payload?.clearedAt || null;
            const serverNow = Array.isArray(payload) ? null : payload?.serverNow || null;

            let validStickers = localStickers;
            if (clearedAt) {
                const offsetMs = serverNow
                    ? Date.now() - new Date(serverNow).getTime()
                    : 0;
                const cutoffMs = new Date(clearedAt).getTime() + offsetMs;
                if (!Number.isNaN(cutoffMs)) {
                    validStickers = localStickers.filter((s) => {
                        const t = s.clientCreatedAt || new Date(s.createdAt || 0).getTime();
                        return !Number.isNaN(t) && t > cutoffMs;
                    });
                    if (myId && validStickers.length !== localStickers.length) {
                        pruneLocalStickerMessagesBefore(myId, userId, cutoffMs);
                    }
                }
            }

            const seenIds = new Set(serverMsgs.map((m) => m._id?.toString()));
            const merged = [...serverMsgs];
            for (const stk of validStickers) {
                if (!seenIds.has(stk._id?.toString())) {
                    merged.push(stk);
                    seenIds.add(stk._id?.toString());
                }
            }
            merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

            if (get().selectedUser?._id === userId) {
                set({messages: merged});
            }

            // Mark unread incoming local stickers as read now that the chat is open
            const unreadIncomingStickers = validStickers.filter(
                (s) => s.senderId?.toString() === userId?.toString() && !s.read
            );
            if (unreadIncomingStickers.length > 0 && myId) {
                const unreadIds = unreadIncomingStickers.map((s) => s._id);
                const socket = useAuthStore.getState().socket;
                if (socket?.connected) {
                    socket.emit("stickerRead", { to: userId, messageIds: unreadIds });
                }
                markLocalStickersRead(myId, userId, userId);
            }
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to load messages");
        }
        finally{
            set({isMessagesLoading: false});
        }
    },

    sendMessage: async (messageData) => {
        const { selectedUser } = get();
        if (!selectedUser?._id) return;

        const peerId = selectedUser._id;
        const { authUser, socket } = useAuthStore.getState();
        const myId = authUser?._id || "temp_me";
        const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        const optimisticMessage = {
            _id: tempId,
            localId: tempId,
            senderId: myId,
            receiverId: peerId,
            text: messageData.text,
            image: messageData.image,
            read: false,
            createdAt: new Date().toISOString(),
        };

        set((state) => ({
            messages:
                state.selectedUser?._id === peerId
                    ? [...state.messages, optimisticMessage]
                    : state.messages,
        }));

        try {
            let confirmed = null;

            // Text-only messages travel directly over WebSocket; images use HTTP upload
            if (!messageData.image && messageData.text && socket?.connected) {
                confirmed = await new Promise((resolve) => {
                    let settled = false;
                    const timer = setTimeout(() => {
                        if (!settled) {
                            settled = true;
                            resolve(null);
                        }
                    }, 1500);

                    socket.emit(
                        "sendMessage",
                        { to: peerId, text: messageData.text, localId: tempId },
                        (ack) => {
                            if (settled) return;
                            settled = true;
                            clearTimeout(timer);
                            resolve(ack?.ok && ack.message ? ack.message : null);
                        }
                    );
                });
            }

            if (!confirmed) {
                const res = await axiosInstanace.post(`/messages/send/${peerId}`, messageData);
                confirmed = res.data;
            }

            const confirmedWithRead = recentReadIds.has(confirmed._id?.toString())
                ? { ...confirmed, read: true }
                : confirmed;

            set((state) => {
                if (state.selectedUser?._id !== peerId) return state;
                const replaced = state.messages.map((m) =>
                    m._id === tempId || m.localId === tempId || m._id === confirmedWithRead._id
                        ? { ...confirmedWithRead, localId: m.localId || tempId }
                        : m
                );
                return { messages: replaced };
            });
        } catch (error) {
            set((state) => ({
                messages: state.messages.filter((m) => m._id !== tempId),
            }));
            toast.error(error.response?.data?.message || "Failed to send message");
        }
    },

    sendSticker: async (sticker) => {
        const { selectedUser } = get();
        if (!selectedUser?._id || !sticker?.stickerHash) {
            return { success: false, message: "No recipient selected" };
        }

        const peerId = selectedUser._id;
        const { authUser } = useAuthStore.getState();
        const myId = authUser?._id;
        if (!myId) return { success: false, message: "Not authenticated" };

        const now = Date.now();
        const messageId = `stk_${now}_${Math.random().toString(36).substring(2, 7)}`;
        const createdAt = new Date(now).toISOString();
        const localUri = sticker.uri || getCachedStickerUrlSync(sticker.stickerHash) || null;

        const patchOpenMessage = (targetId, patch) => {
            set((state) => {
                if (state.selectedUser?._id !== peerId) return state;
                return {
                    messages: state.messages.map((m) =>
                        m._id === targetId ? { ...m, ...patch } : m
                    ),
                };
            });
        };

        const localStickerMsg = {
            _id: messageId,
            localId: messageId,
            clientCreatedAt: now,
            senderId: myId,
            receiverId: peerId,
            isSticker: true,
            stickerHash: sticker.stickerHash,
            stickerUri: localUri,
            isAnimated: Boolean(sticker.isAnimated),
            stickerStatus: "uploading",
            localOnly: true,
            read: false,
            createdAt,
        };

        set((state) => ({
            messages:
                state.selectedUser?._id === peerId
                    ? [...state.messages, localStickerMsg]
                    : state.messages,
        }));

        // Let the entrance animation start before IndexedDB writes & base64 encoding
        await new Promise((resolve) => {
            requestAnimationFrame(() => resolve());
        });

        saveLocalStickerMessage(myId, peerId, {
            ...localStickerMsg,
            stickerStatus: "queued",
        });
        useStickerStore.getState().recordRecentSticker(sticker).catch(() => {});

        const peerAlreadyHasHash = sentStickerHashesByPeer.get(peerId)?.has(sticker.stickerHash);
        const dataBase64 = peerAlreadyHasHash
            ? null
            : await readStickerBase64(sticker.stickerHash);

        if (!peerAlreadyHasHash && !dataBase64) {
            patchOpenMessage(messageId, { stickerStatus: "queued" });
            return { success: false, message: "Sticker file missing from local browser storage" };
        }

        const result = await dispatchStickerReliable({
            peerId,
            messageId,
            stickerHash: sticker.stickerHash,
            isAnimated: sticker.isAnimated,
            createdAt,
            dataBase64,
        });

        if (result.error) {
            patchOpenMessage(messageId, { stickerStatus: "queued" });
            toast.error(result.error);
            return { success: false, message: result.error };
        }

        if (result.delivered || result.serverQueued) {
            if (result.delivered) {
                markStickerHashKnownByPeer(peerId, sticker.stickerHash);
            }
            const minSpin = Math.max(0, 340 - (Date.now() - now));
            if (minSpin > 0) await new Promise((r) => setTimeout(r, minSpin));
            saveLocalStickerMessage(myId, peerId, {
                ...localStickerMsg,
                stickerStatus: "sent",
            });
            patchOpenMessage(messageId, { stickerStatus: "sent" });
            return { success: true };
        }

        patchOpenMessage(messageId, { stickerStatus: "queued" });
        await queueStickerOutboxItem(myId, {
            messageId,
            peerId,
            stickerHash: sticker.stickerHash,
            isAnimated: Boolean(sticker.isAnimated),
            createdAt,
        });
        return { success: true };
    },

    flushStickerOutbox: async () => {
        if (isFlushingOutbox) return;
        const { authUser } = useAuthStore.getState();
        const myId = authUser?._id;
        if (!myId) return;

        isFlushingOutbox = true;
        try {
            const queue = await getStickerOutbox(myId);
            if (!queue.length) return;

            const remaining = [];

            for (const item of queue) {
                const peerHas = sentStickerHashesByPeer.get(item.peerId)?.has(item.stickerHash);
                const dataBase64 = peerHas ? null : await readStickerBase64(item.stickerHash);
                if (!peerHas && !dataBase64) {
                    continue; // Local file gone, drop cleanly
                }

                const startedAt = Date.now();
                set((state) => {
                    if (state.selectedUser?._id !== item.peerId) return state;
                    return {
                        messages: state.messages.map((m) =>
                            m._id === item.messageId ? { ...m, stickerStatus: "uploading" } : m
                        ),
                    };
                });

                const res = await dispatchStickerReliable({
                    peerId: item.peerId,
                    messageId: item.messageId,
                    stickerHash: item.stickerHash,
                    isAnimated: item.isAnimated,
                    createdAt: item.createdAt,
                    dataBase64,
                });

                if (res.delivered || res.serverQueued) {
                    if (res.delivered) {
                        markStickerHashKnownByPeer(item.peerId, item.stickerHash);
                    }
                    const minSpin = Math.max(0, 320 - (Date.now() - startedAt));
                    if (minSpin > 0) await new Promise((r) => setTimeout(r, minSpin));
                    set((state) => {
                        if (state.selectedUser?._id !== item.peerId) return state;
                        return {
                            messages: state.messages.map((m) =>
                                m._id === item.messageId ? { ...m, stickerStatus: "sent" } : m
                            ),
                        };
                    });
                } else {
                    set((state) => {
                        if (state.selectedUser?._id !== item.peerId) return state;
                        return {
                            messages: state.messages.map((m) =>
                                m._id === item.messageId ? { ...m, stickerStatus: "queued" } : m
                            ),
                        };
                    });
                    if (!res.error) {
                        remaining.push(item);
                    }
                }
            }

            await setStickerOutbox(myId, remaining);
        } finally {
            isFlushingOutbox = false;
        }
    },

    subscribeToMessages: () => {
        const socket = useAuthStore.getState().socket;
        if (!socket) return;

        socket.off("newMessage");
        socket.off("newSticker");
        socket.off("stickerRequested");
        socket.off("stickerDelivered");
        socket.off("messageRead");
        socket.off("conversationCleared");
        socket.off("typing");
        socket.off("stopTyping");

        socket.on("typing", ({ from }) => {
            if (!from) return;
            set((state) => ({
                typingUsers: { ...state.typingUsers, [from.toString()]: true },
            }));
        });

        socket.on("stopTyping", ({ from }) => {
            if (!from) return;
            set((state) => ({
                typingUsers: { ...state.typingUsers, [from.toString()]: false },
            }));
        });
    
        socket.on("newMessage", (newMessage) => {
            const { authUser } = useAuthStore.getState();
            const myId = authUser?._id;
            const senderId = newMessage.senderId?.toString();
            const receiverId = newMessage.receiverId?.toString();
            const isFromMe = Boolean(myId && senderId === myId.toString());
            const peerId = isFromMe ? receiverId : senderId;
            if (!peerId) return;

            const { selectedUser, messages, unreadCounts } = get();

            if (selectedUser && selectedUser._id.toString() === peerId) {
                const matchIdx = messages.findIndex(
                    (m) =>
                        m._id === newMessage._id ||
                        (newMessage.localId && (m.localId === newMessage.localId || m._id === newMessage.localId))
                );
                const updatedMessages =
                    matchIdx !== -1
                        ? messages.map((m, idx) =>
                              idx === matchIdx
                                  ? { ...newMessage, localId: m.localId || newMessage.localId }
                                  : m
                          )
                        : [...messages, newMessage];
                set({ messages: updatedMessages });

                if (!isFromMe && newMessage._id) {
                    get().markMessageAsRead(selectedUser._id, [newMessage._id]);
                }
            } else if (!isFromMe) {
                const currentCount = unreadCounts[peerId] || 0;
                set({ unreadCounts: { ...unreadCounts, [peerId]: currentCount + 1 } });
            }
        });

        socket.on("messageRead", ({ readerId, messages: readMessages = [], messageIds = [] }) => {
            const { messages: currentMessages, selectedUser } = get();
            const myId = useAuthStore.getState().authUser?._id;
            const rId = readerId?.toString();
            const collected = [
                ...readMessages.map((r) => (typeof r === "string" ? r : r?._id?.toString())),
                ...messageIds.map((id) => id?.toString()),
            ].filter(Boolean);

            if (collected.length === 0) return;
            collected.forEach((id) => recentReadIds.add(id));
            if (recentReadIds.size > 500) recentReadIds.clear();

            if (myId && rId) {
                markLocalStickersRead(myId, rId, myId);
            }

            if (selectedUser && selectedUser._id?.toString() === rId) {
                const readSet = new Set(collected);
                const updatedMessages = currentMessages.map((msg) =>
                    readSet.has(msg._id?.toString()) ? { ...msg, read: true } : msg
                );

                set({ messages: updatedMessages });
            }
        });

        socket.on("conversationCleared", async ({ peerId, clearedAt }) => {
            if (!peerId) return;
            const pId = peerId.toString();
            const parsedCutoff = clearedAt ? new Date(clearedAt).getTime() : NaN;
            // Cover minor clock skew on live conversation clears so existing local stickers clear immediately
            const effectiveCutoff = Number.isNaN(parsedCutoff)
                ? Date.now()
                : Math.max(parsedCutoff, Date.now());
            const myId = useAuthStore.getState().authUser?._id;
            if (myId) {
                await clearLocalStickerMessages(myId, pId);
                const outbox = await getStickerOutbox(myId);
                const filteredOutbox = outbox.filter((item) => item.peerId?.toString() !== pId);
                if (filteredOutbox.length !== outbox.length) {
                    await setStickerOutbox(myId, filteredOutbox);
                }
            }

            set((state) => {
                const nextUnread = { ...state.unreadCounts };
                delete nextUnread[pId];

                if (state.selectedUser?._id?.toString() !== pId) {
                    return { unreadCounts: nextUnread };
                }

                const remaining = state.messages.filter(
                    (m) =>
                        m._id?.toString().startsWith("temp_") &&
                        new Date(m.createdAt || 0).getTime() > effectiveCutoff
                );

                return {
                    unreadCounts: nextUnread,
                    messages: remaining,
                };
            });
        });

        socket.on("newSticker", async (incoming) => {
            const { authUser } = useAuthStore.getState();
            const myId = authUser?._id;
            const senderId = incoming.senderId?.toString();
            const receiverId = incoming.receiverId?.toString();
            const isFromMe = Boolean(myId && senderId === myId.toString());
            const peerId = isFromMe ? receiverId : senderId;
            if (!peerId || !incoming.stickerHash) return;

            const receivedAt = Date.now();
            const existingUri =
                getCachedStickerUrlSync(incoming.stickerHash) ||
                (await resolveLocalStickerUri(incoming.stickerHash));
            const alreadyOnDevice = Boolean(existingUri);
            const isRetryPayload = incoming._id?.toString().startsWith("stk_res_");
            const isViewingChat = get().selectedUser?._id?.toString() === peerId;

            const stickerMsg = {
                _id: incoming._id,
                localId: incoming._id,
                senderId: incoming.senderId,
                receiverId: incoming.receiverId,
                isSticker: true,
                stickerHash: incoming.stickerHash,
                stickerUri: existingUri || null,
                isAnimated: Boolean(incoming.isAnimated),
                stickerStatus: alreadyOnDevice ? "sent" : "downloading",
                localOnly: true,
                read: Boolean(isViewingChat && !isFromMe),
                createdAt: incoming.createdAt || new Date().toISOString(),
                clientCreatedAt: receivedAt,
            };

            if (isViewingChat) {
                set((state) => {
                    const idx = isRetryPayload
                        ? state.messages.findIndex(
                              (m) => m.stickerHash === incoming.stickerHash && !m.stickerUri
                          )
                        : state.messages.findIndex((m) => m._id === stickerMsg._id);
                    const nextMsgs =
                        idx !== -1
                            ? state.messages.map((m, i) =>
                                  i === idx
                                      ? {
                                            ...m,
                                            ...stickerMsg,
                                            _id: m._id,
                                            stickerUri: existingUri || m.stickerUri,
                                            localId: m.localId,
                                            clientCreatedAt: m.clientCreatedAt,
                                        }
                                      : m
                              )
                            : [...state.messages, stickerMsg];
                    return { messages: nextMsgs };
                });

                if (!isFromMe) {
                    socket.emit("stickerDelivered", {
                        to: senderId,
                        messageId: incoming._id,
                        stickerHash: incoming.stickerHash,
                    });
                    socket.emit("stickerRead", { to: senderId, messageIds: [incoming._id] });
                }
            } else if (!isFromMe) {
                socket.emit("stickerDelivered", {
                    to: senderId,
                    messageId: incoming._id,
                    stickerHash: incoming.stickerHash,
                });
                set((state) => ({
                    unreadCounts: {
                        ...state.unreadCounts,
                        [peerId]: (state.unreadCounts[peerId] || 0) + 1,
                    },
                }));
            }

            if (alreadyOnDevice) {
                if (myId) saveLocalStickerMessage(myId, peerId, stickerMsg);
                return;
            }

            if (incoming.dataBase64) {
                let finalUri = null;
                try {
                    const saved = await saveReceivedSticker({
                        stickerHash: incoming.stickerHash,
                        dataBase64: incoming.dataBase64,
                        isAnimated: incoming.isAnimated,
                    });
                    finalUri = saved?.uri || null;
                } catch {
                    finalUri = `data:image/webp;base64,${incoming.dataBase64}`;
                }

                const minSpin = Math.max(0, 360 - (Date.now() - receivedAt));
                if (minSpin > 0) await new Promise((r) => setTimeout(r, minSpin));

                const finalized = {
                    ...stickerMsg,
                    stickerUri: finalUri,
                    stickerStatus: "sent",
                };
                if (myId) {
                    saveLocalStickerMessage(myId, peerId, finalized);
                }

                set((state) => {
                    if (state.selectedUser?._id?.toString() !== peerId) return state;
                    return {
                        messages: state.messages.map((m) =>
                            m._id === incoming._id ||
                            (m.stickerHash === incoming.stickerHash && !m.stickerUri)
                                ? { ...m, stickerUri: finalUri, stickerStatus: "sent" }
                                : m
                        ),
                    };
                });
            } else {
                if (myId) saveLocalStickerMessage(myId, peerId, stickerMsg);
                if (!isFromMe) {
                    socket.emit("requestSticker", {
                        to: senderId,
                        messageId: incoming._id,
                        stickerHash: incoming.stickerHash,
                    });
                }
            }
        });

        socket.on("stickerDelivered", ({ peerId, stickerHash }) => {
            if (peerId && stickerHash) {
                markStickerHashKnownByPeer(peerId.toString(), stickerHash);
            }
        });

        socket.on("stickerRequested", async ({ from, messageId, stickerHash }) => {
            if (!from || !stickerHash) return;
            const dataBase64 = await readStickerBase64(stickerHash);
            if (!dataBase64) return;
            const targetId = from.toString();
            const res = await dispatchStickerReliable({
                peerId: targetId,
                messageId: messageId || `stk_res_${Date.now()}`,
                stickerHash,
                createdAt: new Date().toISOString(),
                dataBase64,
            });
            if (res.delivered) {
                markStickerHashKnownByPeer(targetId, stickerHash);
            }
        });

        if (socket.connected) {
            socket.emit("syncPendingStickers");
        }

    },

    unSubscribeFromMessages: () => {
        const socket = useAuthStore.getState().socket;
        if (!socket) return;
        socket.off("newMessage");
        socket.off("newSticker");
        socket.off("stickerRequested");
        socket.off("stickerDelivered");
        socket.off("messageRead");
        socket.off("conversationCleared");
        socket.off("typing");
        socket.off("stopTyping");
    },

    setSelectedUser: (selectedUser) => {
        const { unreadCounts } = get();
        if (selectedUser && unreadCounts[selectedUser._id]) {
            const updatedCounts = { ...unreadCounts };
            delete updatedCounts[selectedUser._id];
            set({ unreadCounts: updatedCounts });
        }
        
        
        set({ selectedUser });

        if(selectedUser) get().markMessageAsRead(selectedUser._id);
    },
    
    deleteAllMessages: async (userId) => {
        const myId = useAuthStore.getState().authUser?._id;
        if (myId) {
            clearLocalStickerMessages(myId, userId);
            getStickerOutbox(myId).then((outbox) => {
                const next = outbox.filter((item) => item.peerId?.toString() !== userId?.toString());
                if (next.length !== outbox.length) {
                    setStickerOutbox(myId, next);
                }
            });
        }
        set((state) => {
            const nextUnread = { ...state.unreadCounts };
            delete nextUnread[userId];
            return {
                unreadCounts: nextUnread,
                messages: state.selectedUser?._id === userId ? [] : state.messages,
            };
        });
        try {
            await axiosInstanace.delete(`/messages/deleteAll/${userId}`);
            toast.success("Conversation deleted");
        } catch (error) {
            get().getMessages(userId);
            toast.error(error.response?.data?.message || "Faild to delete messages");
        }

    },

    fetchUnreadCounts: async () => {
        try {
            const res = await axiosInstanace.get('/messages/unreadcounts');
            const countMap = {};
            res.data.forEach(item => {
            countMap[item._id] = item.count;
            });
            set({ unreadCounts: countMap });
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to load unread counts");
        }
    },

    markMessageAsRead : async (userId, messageIds) => {
        if (!userId) return;
        const socket = useAuthStore.getState().socket;
        if (socket?.connected) {
            socket.emit("markAsRead", {
                to: userId,
                ...(Array.isArray(messageIds) && messageIds.length > 0 ? { messageIds } : {}),
            });
            return;
        }
        try {
            await axiosInstanace.put(`/messages/read/${userId}`);
        } catch (error) {
            console.error("Failed to mark messages as read", error);
        }
    },

}));