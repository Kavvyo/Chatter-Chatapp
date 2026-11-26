import { create } from 'zustand';
import { axiosInstance } from '../lib/axios';
import { useAuthStore } from './useAuthStore';
import {
  getCachedMessages,
  getCachedUnreadCounts,
  getCachedUsers,
  prefetchImageUrls,
  setCachedMessages,
  setCachedUnreadCounts,
  setCachedUsers,
} from '../lib/cache';

export interface Message {
  _id: string;
  localId?: string;
  clientCreatedAt?: number;
  senderId: string;
  receiverId: string;
  text?: string;
  image?: string;
  read: boolean;
  createdAt: string;
}

export interface ChatUser {
  _id: string;
  fullName: string;
  email: string;
  profilePic?: string;
  isVerified: boolean;
}

const INITIAL_PAGE_LIMIT = 50;

function mergeMessagesById(existing: Message[], incoming: Message[]): Message[] {
  if (incoming.length === 0) return existing;

  const byId = new Map<string, Message>();
  for (const msg of existing) {
    byId.set(msg._id, msg);
  }
  for (const msg of incoming) {
    const prev = byId.get(msg._id);
    byId.set(
      msg._id,
      prev
        ? {
            ...msg,
            ...(prev.localId ? { localId: prev.localId } : {}),
            ...(prev.clientCreatedAt ? { clientCreatedAt: prev.clientCreatedAt } : {}),
          }
        : msg
    );
  }

  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

function getDeltaCursor(cached: Message[], myUserId?: string): string | null {
  const confirmed = cached.filter((m) => !m._id.startsWith('temp_'));
  if (confirmed.length === 0) return null;

  // Include recent unread sent messages in delta window so read receipts catch up too
  const recentWindow = confirmed.slice(-30);
  const earliestUnreadSent = myUserId
    ? recentWindow.find((m) => m.senderId === myUserId && !m.read)
    : undefined;

  if (earliestUnreadSent) {
    const ms = new Date(earliestUnreadSent.createdAt).getTime();
    return new Date(Math.max(0, ms - 1)).toISOString();
  }

  return confirmed[confirmed.length - 1].createdAt;
}

const recentReadIds = new Set<string>();
function rememberReadIds(ids: string[]) {
  for (const id of ids) {
    recentReadIds.add(id);
  }
  if (recentReadIds.size > 500) {
    recentReadIds.clear();
  }
}

interface ChatState {
  messages: Message[];
  messagesByUser: Record<string, Message[]>;
  hasMoreOlderByUser: Record<string, boolean>;
  users: ChatUser[];
  selectedUser: ChatUser | null;
  isUsersLoading: boolean;
  isMessagesLoading: boolean;
  isLoadingOlder: boolean;
  unreadCounts: Record<string, number>;
  isTyping: boolean;

  hydrateFromCache: (userId: string) => Promise<void>;
  getUsers: (silent?: boolean) => Promise<void>;
  getMessages: (userId: string, forceFull?: boolean) => Promise<void>;
  loadOlderMessages: (userId: string) => Promise<void>;
  sendMessage: (messageData: { text?: string; image?: string }) => Promise<{ success: boolean; message?: string }>;
  subscribeToMessages: () => void;
  unSubscribeFromMessages: () => void;
  setSelectedUser: (user: ChatUser | null) => void;
  deleteAllMessages: (userId: string) => Promise<void>;
  fetchUnreadCounts: () => Promise<void>;
  markMessageAsRead: (userId: string, messageIds?: string[]) => Promise<void>;
  setIsTyping: (isTyping: boolean) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  messagesByUser: {},
  hasMoreOlderByUser: {},
  users: [],
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,
  isLoadingOlder: false,
  unreadCounts: {},
  isTyping: false,

  hydrateFromCache: async (userId: string) => {
    if (!userId) return;
    const [cachedUnread, cachedUsers] = await Promise.all([
      getCachedUnreadCounts(userId),
      getCachedUsers<ChatUser>(userId),
    ]);

    const updates: Partial<ChatState> = {};
    if (cachedUnread && Object.keys(get().unreadCounts).length === 0) {
      updates.unreadCounts = cachedUnread;
    }
    if (cachedUsers && cachedUsers.length > 0 && get().users.length === 0) {
      updates.users = cachedUsers;
      prefetchImageUrls(cachedUsers.map((u) => u.profilePic));
    }

    if (Object.keys(updates).length > 0) {
      set(updates);
    }
  },

  getUsers: async (silent = false) => {
    const myId = useAuthStore.getState().authUser?._id;
    if (!silent && get().users.length === 0) {
      set({ isUsersLoading: true });
    }

    try {
      const res = await axiosInstance.get('/messages/users');
      const verifiedUsers = (res.data as ChatUser[]).filter((u) => u.isVerified);
      set({ users: verifiedUsers });
      if (myId) {
        setCachedUsers(myId, verifiedUsers);
      }
      prefetchImageUrls(verifiedUsers.map((u) => u.profilePic));
    } catch {
      // Keep cached users if offline
    } finally {
      set({ isUsersLoading: false });
    }
  },

  getMessages: async (peerId: string, forceFull = false) => {
    const myId = useAuthStore.getState().authUser?._id;

    // 1. Check fast in-memory map first, then AsyncStorage disk cache
    let cached = get().messagesByUser[peerId];
    if ((!cached || cached.length === 0) && myId) {
      const diskCached = await getCachedMessages<Message>(myId, peerId);
      if (diskCached && diskCached.length > 0) {
        cached = diskCached;
        set((state) => ({
          messagesByUser: { ...state.messagesByUser, [peerId]: diskCached },
          messages: state.selectedUser?._id === peerId || !state.selectedUser ? diskCached : state.messages,
        }));
      }
    } else if (cached && cached.length > 0) {
      set({ messages: cached });
    }

    const hasCachedData = Boolean(cached && cached.length > 0 && !forceFull);

    // Show spinner ONLY when no local messages exist yet
    if (!hasCachedData) {
      set({ isMessagesLoading: true, messages: [] });
    } else {
      set({ isMessagesLoading: false });
    }

    try {
      if (hasCachedData && cached) {
        // 2a. Incremental delta sync (fetch only messages after cached cursor)
        const cursor = getDeltaCursor(cached, myId);
        const res = await axiosInstance.get(`/messages/${peerId}`, {
          params: cursor ? { after: cursor } : { limit: INITIAL_PAGE_LIMIT },
        });
        const delta = (res.data || []) as Message[];

        if (delta.length > 0) {
          const latestList = get().messagesByUser[peerId] || cached;
          const merged = mergeMessagesById(latestList, delta);

          set((state) => ({
            messagesByUser: { ...state.messagesByUser, [peerId]: merged },
            messages: state.selectedUser?._id === peerId ? merged : state.messages,
          }));

          if (myId) setCachedMessages(myId, peerId, merged);
          prefetchImageUrls(delta.map((m) => m.image));

          if (get().selectedUser?._id === peerId) {
            const unreadIncoming = delta
              .filter((m) => m.senderId === peerId && !m.read)
              .map((m) => m._id);
            if (unreadIncoming.length > 0) {
              get().markMessageAsRead(peerId, unreadIncoming);
            }
          }
        }
      } else {
        // 2b. Initial sync (fetch newest page of 50 messages)
        const res = await axiosInstance.get(`/messages/${peerId}`, {
          params: { limit: INITIAL_PAGE_LIMIT },
        });
        const fetched = (res.data || []) as Message[];

        set((state) => ({
          messagesByUser: { ...state.messagesByUser, [peerId]: fetched },
          hasMoreOlderByUser: {
            ...state.hasMoreOlderByUser,
            [peerId]: fetched.length >= INITIAL_PAGE_LIMIT,
          },
          messages: state.selectedUser?._id === peerId || !state.selectedUser ? fetched : state.messages,
        }));

        if (myId) setCachedMessages(myId, peerId, fetched);
        prefetchImageUrls(fetched.map((m) => m.image));

        if (get().selectedUser?._id === peerId) {
          const unreadIncoming = fetched
            .filter((m) => m.senderId === peerId && !m.read)
            .map((m) => m._id);
          if (unreadIncoming.length > 0) {
            get().markMessageAsRead(peerId, unreadIncoming);
          }
        }
      }
    } catch {
      // Stay cleanly on cached messages if offline
    } finally {
      set({ isMessagesLoading: false });
    }
  },

  loadOlderMessages: async (peerId: string) => {
    const { isLoadingOlder, hasMoreOlderByUser, messagesByUser } = get();
    if (isLoadingOlder || hasMoreOlderByUser[peerId] === false) return;

    const existing = messagesByUser[peerId] || [];
    const oldest = existing.find((m) => !m._id.startsWith('temp_'));
    if (!oldest) return;

    set({ isLoadingOlder: true });
    try {
      const res = await axiosInstance.get(`/messages/${peerId}`, {
        params: { before: oldest.createdAt, limit: INITIAL_PAGE_LIMIT },
      });
      const older = (res.data || []) as Message[];
      const merged = mergeMessagesById(older, get().messagesByUser[peerId] || existing);

      set((state) => ({
        messagesByUser: { ...state.messagesByUser, [peerId]: merged },
        hasMoreOlderByUser: {
          ...state.hasMoreOlderByUser,
          [peerId]: older.length >= INITIAL_PAGE_LIMIT,
        },
        messages: state.selectedUser?._id === peerId ? merged : state.messages,
      }));

      prefetchImageUrls(older.map((m) => m.image));
    } catch {
      // ignore offline
    } finally {
      set({ isLoadingOlder: false });
    }
  },

  sendMessage: async (messageData) => {
    const { selectedUser } = get();
    if (!selectedUser) return { success: false, message: 'No recipient selected' };

    const peerId = selectedUser._id;
    const { authUser, socket } = useAuthStore.getState();
    const myId = authUser?._id || 'temp_me';
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const hadUnread = (get().unreadCounts[peerId] || 0) > 0;

    const now = Date.now();
    const optimisticMessage: Message = {
      _id: tempId,
      localId: tempId,
      clientCreatedAt: now,
      senderId: myId,
      receiverId: peerId,
      text: messageData.text,
      image: messageData.image,
      read: false,
      createdAt: new Date(now).toISOString(),
    };

    set((state) => {
      const currentList = state.messagesByUser[peerId] || state.messages;
      const updated = [...currentList, optimisticMessage];
      const nextUnread = { ...state.unreadCounts, [peerId]: 0 };
      if (myId !== 'temp_me') setCachedUnreadCounts(myId, nextUnread);

      return {
        messages: state.selectedUser?._id === peerId ? updated : state.messages,
        messagesByUser: { ...state.messagesByUser, [peerId]: updated },
        unreadCounts: nextUnread,
      };
    });

    try {
      let confirmed: Message | null = null;

      // Text-only messages travel directly over WebSocket; images use HTTP upload
      if (!messageData.image && messageData.text && socket?.connected) {
        confirmed = await new Promise<Message | null>((resolve) => {
          let settled = false;
          const timer = setTimeout(() => {
            if (!settled) {
              settled = true;
              resolve(null);
            }
          }, 1500);

          socket.emit(
            'sendMessage',
            { to: peerId, text: messageData.text, localId: tempId },
            (ack?: { ok: boolean; message?: Message }) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              resolve(ack?.ok && ack.message ? ack.message : null);
            }
          );
        });
      }

      if (!confirmed) {
        const res = await axiosInstance.post(`/messages/send/${peerId}`, messageData);
        confirmed = res.data as Message;
      }

      if (hadUnread) {
        get().markMessageAsRead(peerId);
      }

      const confirmedWithRead = recentReadIds.has(confirmed._id)
        ? { ...confirmed, read: true }
        : confirmed;

      set((state) => {
        const currentList = state.messagesByUser[peerId] || state.messages;
        const hasTarget = currentList.some(
          (m) => m._id === tempId || m.localId === tempId || m._id === confirmedWithRead._id
        );
        const replaced = hasTarget
          ? currentList.map((m) =>
              m._id === tempId || m.localId === tempId || m._id === confirmedWithRead._id
                ? {
                    ...confirmedWithRead,
                    localId: m.localId || tempId,
                    clientCreatedAt: m.clientCreatedAt,
                  }
                : m
            )
          : [...currentList, { ...confirmedWithRead, localId: tempId, clientCreatedAt: now }];
        if (myId !== 'temp_me') setCachedMessages(myId, peerId, replaced);
        return {
          messages: state.selectedUser?._id === peerId ? replaced : state.messages,
          messagesByUser: { ...state.messagesByUser, [peerId]: replaced },
        };
      });

      if (confirmed.image) {
        prefetchImageUrls([confirmed.image]);
      }
      return { success: true };
    } catch (error: any) {
      set((state) => {
        const currentList = state.messagesByUser[peerId] || state.messages;
        const rolledBack = currentList.filter((m) => m._id !== tempId);
        return {
          messages: state.selectedUser?._id === peerId ? rolledBack : state.messages,
          messagesByUser: { ...state.messagesByUser, [peerId]: rolledBack },
        };
      });
      const message = error.response?.data?.message || 'Failed to send message';
      return { success: false, message };
    }
  },

  subscribeToMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    socket.off('newMessage');
    socket.off('messageRead');
    socket.off('typing');
    socket.off('stopTyping');

    socket.on('newMessage', async (newMessage: Message) => {
      const myId = useAuthStore.getState().authUser?._id;
      const senderId = newMessage.senderId.toString();
      const receiverId = newMessage.receiverId?.toString() || '';
      const isFromMe = Boolean(myId && senderId === myId.toString());
      const peerId = isFromMe ? receiverId : senderId;
      if (!peerId) return;

      const { selectedUser, unreadCounts } = get();

      if (newMessage.image) {
        prefetchImageUrls([newMessage.image]);
      }

      // Append to peer's cached conversation even if another chat or tab is currently open
      let existingList = get().messagesByUser[peerId];
      if ((!existingList || existingList.length === 0) && myId) {
        existingList = (await getCachedMessages<Message>(myId, peerId)) || [];
      }

      const baseList = existingList || [];
      const matchIdx = baseList.findIndex(
        (m) =>
          m._id === newMessage._id ||
          (newMessage.localId && (m.localId === newMessage.localId || m._id === newMessage.localId))
      );

      let updatedList: Message[];
      if (matchIdx !== -1) {
        const existing = baseList[matchIdx];
        updatedList = baseList.map((m, idx) =>
          idx === matchIdx
            ? { ...newMessage, localId: existing.localId || newMessage.localId, clientCreatedAt: existing.clientCreatedAt }
            : m
        );
      } else {
        const hasRecentDupe = baseList.some(
          (m) =>
            m.senderId?.toString() === senderId &&
            m.text === newMessage.text &&
            Math.abs(new Date(m.createdAt).getTime() - new Date(newMessage.createdAt).getTime()) < 4000
        );
        const liveMessage: Message = { ...newMessage, clientCreatedAt: Date.now() };
        updatedList = hasRecentDupe ? baseList : [...baseList, liveMessage];
      }

      if (myId) {
        setCachedMessages(myId, peerId, updatedList);
      }

      if (selectedUser && selectedUser._id.toString() === peerId) {
        set((state) => ({
          messages: updatedList,
          messagesByUser: { ...state.messagesByUser, [peerId]: updatedList },
          ...(isFromMe ? {} : { isTyping: false }),
        }));
        if (!isFromMe && newMessage._id) {
          get().markMessageAsRead(selectedUser._id, [newMessage._id]);
        }
      } else if (!isFromMe) {
        const nextUnread = {
          ...unreadCounts,
          [peerId]: (unreadCounts[peerId] || 0) + 1,
        };
        if (myId) setCachedUnreadCounts(myId, nextUnread);
        set((state) => ({
          messagesByUser: { ...state.messagesByUser, [peerId]: updatedList },
          unreadCounts: nextUnread,
        }));
      } else {
        set((state) => ({
          messagesByUser: { ...state.messagesByUser, [peerId]: updatedList },
        }));
      }
    });

    socket.on(
      'messageRead',
      async ({
        readerId,
        messages: readMessages = [],
        messageIds = [],
      }: {
        readerId: string;
        messages?: Array<{ _id?: string } | string>;
        messageIds?: string[];
      }) => {
        const rId = readerId?.toString();
        if (!rId) return;

        const collectedIds = [
          ...readMessages.map((r) => (typeof r === 'string' ? r : r?._id?.toString())),
          ...messageIds.map((id) => id?.toString()),
        ].filter((id): id is string => Boolean(id));

        if (collectedIds.length === 0) return;
        rememberReadIds(collectedIds);

        const myId = useAuthStore.getState().authUser?._id;
        const { messagesByUser, selectedUser } = get();

        let peerMessages = messagesByUser[rId];
        if ((!peerMessages || peerMessages.length === 0) && myId) {
          peerMessages = (await getCachedMessages<Message>(myId, rId)) || [];
        }

        if (peerMessages && peerMessages.length > 0) {
          const readSet = new Set(collectedIds);
          const updated = peerMessages.map((msg) =>
            readSet.has(msg._id?.toString()) ? { ...msg, read: true } : msg
          );

          if (myId) setCachedMessages(myId, rId, updated);
          set((state) => ({
            messagesByUser: { ...state.messagesByUser, [rId]: updated },
            messages: selectedUser?._id?.toString() === rId ? updated : state.messages,
          }));
        }
      }
    );

    socket.on('typing', ({ from }: { from: string }) => {
      const { selectedUser } = get();
      if (selectedUser && selectedUser._id === from) {
        set({ isTyping: true });
      }
    });

    socket.on('stopTyping', ({ from }: { from: string }) => {
      const { selectedUser } = get();
      if (selectedUser && selectedUser._id === from) {
        set({ isTyping: false });
      }
    });
  },

  unSubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    socket.off('newMessage');
    socket.off('messageRead');
    socket.off('typing');
    socket.off('stopTyping');
  },

  setSelectedUser: (selectedUser) => {
    const peerMessages = selectedUser ? get().messagesByUser[selectedUser._id] || [] : [];
    set({ selectedUser, isTyping: false, messages: peerMessages });
  },

  deleteAllMessages: async (userId: string) => {
    const myId = useAuthStore.getState().authUser?._id;
    set((state) => ({
      messages: state.selectedUser?._id === userId ? [] : state.messages,
      messagesByUser: { ...state.messagesByUser, [userId]: [] },
      hasMoreOlderByUser: { ...state.hasMoreOlderByUser, [userId]: false },
    }));
    if (myId) setCachedMessages(myId, userId, []);

    try {
      await axiosInstance.delete(`/messages/deleteAll/${userId}`);
    } catch {
      await get().getMessages(userId, true);
    }
  },

  fetchUnreadCounts: async () => {
    const myId = useAuthStore.getState().authUser?._id;
    try {
      const res = await axiosInstance.get('/messages/unreadcounts');
      const countMap: Record<string, number> = {};
      res.data.forEach((item: { _id: string; count: number }) => {
        countMap[item._id] = item.count;
      });
      set({ unreadCounts: countMap });
      if (myId) setCachedUnreadCounts(myId, countMap);
    } catch {
      // Keep cached unread counts if offline
    }
  },

  markMessageAsRead: async (userId: string, messageIds?: string[]) => {
    if (!userId) return;
    const myId = useAuthStore.getState().authUser?._id;
    const existingList = get().messagesByUser[userId] || [];
    const localUnreadIds = existingList
      .filter((m) => m.senderId === userId && !m.read && !m._id.startsWith('temp_'))
      .map((m) => m._id);

    const mergedIds = Array.from(
      new Set([...(messageIds || []), ...localUnreadIds].filter((id) => id && !id.startsWith('temp_')))
    );

    set((state) => {
      const nextUnread = { ...state.unreadCounts, [userId]: 0 };
      if (myId) setCachedUnreadCounts(myId, nextUnread);

      const list = state.messagesByUser[userId];
      if (!list || list.length === 0) {
        return { unreadCounts: nextUnread };
      }

      const idSet = mergedIds.length > 0 ? new Set(mergedIds) : null;
      let changed = false;
      const updated = list.map((m) => {
        if (m.senderId === userId && !m.read && (!idSet || idSet.has(m._id))) {
          changed = true;
          return { ...m, read: true };
        }
        return m;
      });

      if (changed && myId) {
        setCachedMessages(myId, userId, updated);
      }

      return {
        unreadCounts: nextUnread,
        ...(changed
          ? {
              messagesByUser: { ...state.messagesByUser, [userId]: updated },
              messages: state.selectedUser?._id === userId ? updated : state.messages,
            }
          : {}),
      };
    });

    const socket = useAuthStore.getState().socket;
    if (socket?.connected) {
      socket.emit('markAsRead', {
        to: userId,
        ...(mergedIds.length > 0 ? { messageIds: mergedIds } : {}),
      });
      return;
    }

    try {
      await axiosInstance.put(`/messages/read/${userId}`);
    } catch {
      // ignore
    }
  },

  setIsTyping: (isTyping: boolean) => set({ isTyping }),

  reset: () => {
    set({
      messages: [],
      messagesByUser: {},
      hasMoreOlderByUser: {},
      users: [],
      selectedUser: null,
      isUsersLoading: false,
      isMessagesLoading: false,
      isLoadingOlder: false,
      unreadCounts: {},
      isTyping: false,
    });
  },
}));
