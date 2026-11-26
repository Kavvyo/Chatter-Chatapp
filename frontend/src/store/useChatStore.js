import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstanace } from "../lib/axios";
import {useAuthStore} from './useAuthStore';


const recentReadIds = new Set();

export const useChatStore = create((set, get) => ({
    messages: [],
    users: [],
    selectedUser: null,
    isUsersLoading: false,
    isMessagesLoading: false,
    unreadCounts: {},


    getUsers: async () => {
        set({isUsersLoading: true});
        try {
            const res = await axiosInstanace.get('/messages/users');
            const verifiedUsers = res.data.filter(user => user.isVerified);  // Filter only verified users
            set({ users: verifiedUsers });  // Store only verified users
        } catch (error) {
            toast.error(error.response.data.message);
        }
        finally{
            set({isUsersLoading: false});
        }
    },

    getMessages: async (userId) => {
        set({isMessagesLoading: true});
        try {
            const res = await axiosInstanace.get(`/messages/${userId}`);
            set({messages: res.data});
        } catch (error) {
            toast.error(error.response.data.message);
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

    subscribeToMessages: () => {
        const socket = useAuthStore.getState().socket;
        if (!socket) return;

        socket.off("newMessage");
        socket.off("messageRead");
        socket.off("conversationCleared");
    
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
            const rId = readerId?.toString();
            const collected = [
                ...readMessages.map((r) => (typeof r === "string" ? r : r?._id?.toString())),
                ...messageIds.map((id) => id?.toString()),
            ].filter(Boolean);

            if (collected.length === 0) return;
            collected.forEach((id) => recentReadIds.add(id));
            if (recentReadIds.size > 500) recentReadIds.clear();

            if (selectedUser && selectedUser._id?.toString() === rId) {
                const readSet = new Set(collected);
                const updatedMessages = currentMessages.map((msg) =>
                    readSet.has(msg._id?.toString()) ? { ...msg, read: true } : msg
                );

                set({ messages: updatedMessages });
            }
        });

        socket.on("conversationCleared", ({ peerId, clearedAt }) => {
            if (!peerId) return;
            const pId = peerId.toString();
            const cutoffMs = clearedAt ? new Date(clearedAt).getTime() : NaN;

            set((state) => {
                const nextUnread = { ...state.unreadCounts };
                delete nextUnread[pId];

                if (state.selectedUser?._id?.toString() !== pId) {
                    return { unreadCounts: nextUnread };
                }

                const remaining = Number.isNaN(cutoffMs)
                    ? state.messages.filter((m) => m._id?.toString().startsWith("temp_"))
                    : state.messages.filter(
                          (m) =>
                              m._id?.toString().startsWith("temp_") ||
                              new Date(m.createdAt).getTime() > cutoffMs
                      );

                return {
                    unreadCounts: nextUnread,
                    messages: remaining,
                };
            });
        });


    },
    
    unSubscribeFromMessages: () => {
        const socket = useAuthStore.getState().socket;
        if (!socket) return;
        socket.off("newMessage");
        socket.off("messageRead");
        socket.off("conversationCleared");

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