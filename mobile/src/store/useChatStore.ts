import { create } from 'zustand';
import { axiosInstance } from '../lib/axios';
import { useAuthStore } from './useAuthStore';
import {
  getCachedMessages,
  getCachedUnreadCounts,
  getCachedUsers,
  getPendingStickerOutbox,
  prefetchImageUrls,
  setCachedMessages,
  setCachedUnreadCounts,
  setCachedUsers,
  setPendingStickerOutbox,
  type PendingStickerOutboxItem,
} from '../lib/cache';
import {
  readStickerBase64,
  resolveLocalStickerUri,
  saveReceivedSticker,
  type StickerItem,
} from '../lib/stickers';
import { useStickerStore } from './useStickerStore';

export interface Message {
  _id: string;
  localId?: string;
  clientCreatedAt?: number;
  senderId: string;
  receiverId: string;
  text?: string;
  image?: string;
  isSticker?: boolean;
  stickerHash?: string;
  stickerUri?: string;
  isAnimated?: boolean;
  stickerStatus?: 'uploading' | 'queued' | 'downloading' | 'sent';
  localOnly?: boolean;
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

function toLocalCutoffIso(serverClearedAtIso?: string | null, serverNowIso?: string | null): string | null {
  if (!serverClearedAtIso) return null;
  const serverClearMs = new Date(serverClearedAtIso).getTime();
  if (Number.isNaN(serverClearMs)) return null;
  const offsetMs = serverNowIso
    ? Date.now() - new Date(serverNowIso).getTime()
    : 0;
  return new Date(serverClearMs + (Number.isNaN(offsetMs) ? 0 : offsetMs)).toISOString();
}

function pruneMessagesBefore(
  list: Message[],
  clearedAtIso?: string | null,
  preserveLocalOnly = false
): Message[] {
  if (list.length === 0) return list;
  if (!clearedAtIso) {
    return list.filter((m) => m._id.startsWith('temp_') || (preserveLocalOnly && m.localOnly));
  }

  const cutoffMs = new Date(clearedAtIso).getTime();
  if (Number.isNaN(cutoffMs)) return list;

  return list.filter((m) => {
    if (m._id.startsWith('temp_')) return true;
    if (preserveLocalOnly && m.localOnly) return true;
    const itemMs = m.clientCreatedAt || new Date(m.createdAt).getTime();
    return !Number.isNaN(itemMs) && itemMs > cutoffMs;
  });
}

async function applyConversationClear(
  peerId: string,
  clearedAtIso: string | undefined,
  get: () => ChatState,
  set: (fn: (state: ChatState) => Partial<ChatState>) => void,
  clearUnread = false
) {
  const myId = useAuthStore.getState().authUser?._id;
  let existing = get().messagesByUser[peerId];
  if ((!existing || existing.length === 0) && myId) {
    existing = (await getCachedMessages<Message>(myId, peerId)) || [];
  }

  const base = existing || [];
  const pruned = pruneMessagesBefore(base, clearedAtIso);
  const listChanged = pruned.length !== base.length;
  const shouldClearUnread = clearUnread && (get().unreadCounts[peerId] || 0) > 0;
  if (!listChanged && !shouldClearUnread) return;

  if (listChanged && myId) {
    await setCachedMessages(myId, peerId, pruned);
  }

  set((state) => {
    const nextUnread =
      clearUnread && (state.unreadCounts[peerId] || 0) > 0
        ? { ...state.unreadCounts, [peerId]: 0 }
        : state.unreadCounts;
    if (nextUnread !== state.unreadCounts && myId) {
      setCachedUnreadCounts(myId, nextUnread);
    }

    return {
      unreadCounts: nextUnread,
      ...(listChanged
        ? {
            messagesByUser: { ...state.messagesByUser, [peerId]: pruned },
            messages: state.selectedUser?._id?.toString() === peerId ? pruned : state.messages,
            hasMoreOlderByUser: {
              ...state.hasMoreOlderByUser,
              [peerId]: pruned.length >= INITIAL_PAGE_LIMIT,
            },
          }
        : {}),
    };
  });
}

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
  const confirmed = cached.filter((m) => !m._id.startsWith('temp_') && !m.localOnly);
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

const sentStickerHashesByPeer = new Map<string, Set<string>>();
function markStickerHashKnownByPeer(peerId: string, stickerHash: string) {
  let set = sentStickerHashesByPeer.get(peerId);
  if (!set) {
    set = new Set<string>();
    sentStickerHashesByPeer.set(peerId, set);
  }
  set.add(stickerHash);
}

let isFlushingStickerOutbox = false;

async function emitStickerOverSocket(params: {
  peerId: string;
  messageId: string;
  stickerHash: string;
  isAnimated?: boolean;
  createdAt: string;
  dataBase64?: string | null;
}): Promise<{ delivered: boolean; error?: string }> {
  const socket = useAuthStore.getState().socket;
  if (!socket?.connected) {
    return { delivered: false };
  }

  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ delivered: false });
      }
    }, 3500);

    socket.emit(
      'sendSticker',
      {
        to: params.peerId,
        messageId: params.messageId,
        stickerHash: params.stickerHash,
        isAnimated: Boolean(params.isAnimated),
        width: 512,
        height: 512,
        ...(params.dataBase64 ? { dataBase64: params.dataBase64 } : {}),
        createdAt: params.createdAt,
      },
      (ack?: { ok?: boolean; delivered?: boolean; message?: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (ack?.ok === false) {
          resolve({ delivered: false, error: ack.message });
        } else {
          resolve({ delivered: Boolean(ack?.delivered) });
        }
      }
    );
  });
}

async function queueStickerOutboxItem(userId: string, item: PendingStickerOutboxItem) {
  const existing = await getPendingStickerOutbox(userId);
  if (existing.some((x) => x.messageId === item.messageId)) return;
  await setPendingStickerOutbox(userId, [...existing, item]);
}

async function patchPeerMessages(
  peerId: string,
  predicate: (m: Message) => boolean,
  updater: (m: Message) => Message,
  get: () => ChatState,
  set: (fn: (state: ChatState) => Partial<ChatState>) => void
) {
  const myId = useAuthStore.getState().authUser?._id;
  let existing = get().messagesByUser[peerId];
  if ((!existing || existing.length === 0) && myId) {
    existing = (await getCachedMessages<Message>(myId, peerId)) || [];
  }
  if (!existing || existing.length === 0) return;

  let changed = false;
  const next = existing.map((m) => {
    if (!predicate(m)) return m;
    changed = true;
    return updater(m);
  });
  if (!changed) return;

  if (myId) {
    setCachedMessages(myId, peerId, next);
  }
  set((state) => ({
    messagesByUser: { ...state.messagesByUser, [peerId]: next },
    messages: state.selectedUser?._id === peerId ? next : state.messages,
  }));
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
  sendSticker: (sticker: StickerItem) => Promise<{ success: boolean; message?: string }>;
  flushPendingStickers: () => Promise<void>;
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
        // 2a. Incremental delta sync + deletion reconciliation (clearedAt & serverCount)
        const cursor = getDeltaCursor(cached, myId);
        const res = await axiosInstance.get(`/messages/${peerId}`, {
          params: {
            ...(cursor ? { after: cursor } : { limit: INITIAL_PAGE_LIMIT }),
            syncMeta: '1',
          },
        });
        const payload = res.data as
          | Message[]
          | { messages: Message[]; clearedAt?: string | null; serverCount?: number; serverNow?: string };
        const delta = Array.isArray(payload) ? payload : payload.messages || [];
        const clearedAt = Array.isArray(payload) ? null : payload.clearedAt || null;
        const serverCount = Array.isArray(payload) ? undefined : payload.serverCount;
        const serverNow = Array.isArray(payload) ? null : payload.serverNow || null;

        const latestList = get().messagesByUser[peerId] || cached;
        let prunedBase = latestList;
        if (clearedAt) {
          const localCutoff = toLocalCutoffIso(clearedAt, serverNow) || clearedAt;
          prunedBase = pruneMessagesBefore(latestList, localCutoff, false);
        } else if (serverCount === 0) {
          // Only prune server-synced items; preserve already-downloaded P2P local stickers
          prunedBase = pruneMessagesBefore(latestList, null, true);
        }

        const wasPruned = prunedBase.length !== latestList.length;

        if (wasPruned || delta.length > 0) {
          const merged = mergeMessagesById(prunedBase, delta);

          set((state) => {
            const nextUnread =
              serverCount === 0 && (state.unreadCounts[peerId] || 0) > 0
                ? { ...state.unreadCounts, [peerId]: 0 }
                : state.unreadCounts;
            if (nextUnread !== state.unreadCounts && myId) {
              setCachedUnreadCounts(myId, nextUnread);
            }

            return {
              messagesByUser: { ...state.messagesByUser, [peerId]: merged },
              messages: state.selectedUser?._id === peerId ? merged : state.messages,
              hasMoreOlderByUser: {
                ...state.hasMoreOlderByUser,
                [peerId]:
                  serverCount === 0
                    ? false
                    : wasPruned
                    ? merged.length >= INITIAL_PAGE_LIMIT
                    : state.hasMoreOlderByUser[peerId],
              },
              unreadCounts: nextUnread,
            };
          });

          if (myId) setCachedMessages(myId, peerId, merged);
          if (delta.length > 0) {
            prefetchImageUrls(delta.map((m) => m.image));
          }

          if (get().selectedUser?._id === peerId && delta.length > 0) {
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
          params: { limit: INITIAL_PAGE_LIMIT, syncMeta: '1' },
        });
        const payload = res.data as
          | Message[]
          | { messages: Message[]; clearedAt?: string | null };
        const fetched = Array.isArray(payload) ? payload : payload.messages || [];

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

  sendSticker: async (sticker: StickerItem) => {
    const { selectedUser } = get();
    if (!selectedUser) return { success: false, message: 'No recipient selected' };

    const peerId = selectedUser._id;
    const { authUser, socket } = useAuthStore.getState();
    const myId = authUser?._id;
    if (!myId) return { success: false, message: 'Not authenticated' };

    const now = Date.now();
    const messageId = `stk_${now}_${Math.random().toString(36).substring(2, 7)}`;
    const createdAt = new Date(now).toISOString();
    // Avoid synchronous file.exists bridges on tap when the pack item already has a file URI.
    const localUri =
      sticker.uri || resolveLocalStickerUri(sticker.stickerHash, sticker.uri) || '';

    const localStickerMsg: Message = {
      _id: messageId,
      localId: messageId,
      clientCreatedAt: now,
      senderId: myId,
      receiverId: peerId,
      isSticker: true,
      stickerHash: sticker.stickerHash,
      stickerUri: localUri,
      isAnimated: sticker.isAnimated,
      stickerStatus: 'uploading',
      localOnly: true,
      read: false,
      createdAt,
    };

    let updatedMessages: Message[] = [];
    let nextUnreadSnapshot: Record<string, number> = {};

    set((state) => {
      const currentList = state.messagesByUser[peerId] || state.messages;
      updatedMessages = [...currentList, localStickerMsg];
      nextUnreadSnapshot = { ...state.unreadCounts, [peerId]: 0 };

      return {
        messages: state.selectedUser?._id === peerId ? updatedMessages : state.messages,
        messagesByUser: { ...state.messagesByUser, [peerId]: updatedMessages },
        unreadCounts: nextUnreadSnapshot,
      };
    });

    // Yield two animation frames so the message bubble pops in cleanly with the upload ring before disk I/O.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    setCachedMessages(
      myId,
      peerId,
      updatedMessages.map((m) =>
        m._id === messageId
          ? { ...m, stickerStatus: socket?.connected ? 'sent' : 'queued' }
          : m
      )
    );
    setCachedUnreadCounts(myId, nextUnreadSnapshot);
    useStickerStore.getState().recordRecentSticker(sticker).catch(() => {});

    const resolvedUri =
      resolveLocalStickerUri(sticker.stickerHash, localUri) || localUri;
    const peerAlreadyHasHash = sentStickerHashesByPeer.get(peerId)?.has(sticker.stickerHash);
    const dataBase64 = peerAlreadyHasHash
      ? null
      : await readStickerBase64(sticker.stickerHash, resolvedUri);

    if (!peerAlreadyHasHash && !dataBase64) {
      await patchPeerMessages(
        peerId,
        (m) => m._id === messageId,
        (m) => ({ ...m, stickerStatus: 'queued' }),
        get,
        set
      );
      return { success: false, message: 'Sticker file missing from device storage' };
    }

    if (socket?.connected) {
      const result = await emitStickerOverSocket({
        peerId,
        messageId,
        stickerHash: sticker.stickerHash,
        isAnimated: sticker.isAnimated,
        createdAt,
        dataBase64,
      });

      if (result.error) {
        await patchPeerMessages(
          peerId,
          (m) => m._id === messageId,
          (m) => ({ ...m, stickerStatus: 'queued' }),
          get,
          set
        );
        return { success: false, message: result.error };
      }

      if (result.delivered) {
        markStickerHashKnownByPeer(peerId, sticker.stickerHash);
        const remainingMs = Math.max(0, 340 - (Date.now() - now));
        if (remainingMs > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, remainingMs));
        }
        await patchPeerMessages(
          peerId,
          (m) => m._id === messageId,
          (m) => ({ ...m, stickerStatus: 'sent' }),
          get,
          set
        );
        return { success: true };
      }
    }

    // Recipient offline: hold locally in P2P outbox and send directly once they come online
    await patchPeerMessages(
      peerId,
      (m) => m._id === messageId,
      (m) => ({ ...m, stickerStatus: 'queued' }),
      get,
      set
    );
    await queueStickerOutboxItem(myId, {
      messageId,
      peerId,
      stickerHash: sticker.stickerHash,
      stickerUri: resolvedUri,
      isAnimated: sticker.isAnimated,
      createdAt,
    });
    return { success: true };
  },

  flushPendingStickers: async () => {
    if (isFlushingStickerOutbox) return;
    const { authUser, socket, onlineUsers } = useAuthStore.getState();
    const myId = authUser?._id;
    if (!myId || !socket?.connected || onlineUsers.length === 0) return;

    isFlushingStickerOutbox = true;
    try {
      const outbox = await getPendingStickerOutbox(myId);
      if (outbox.length === 0) return;

      const onlineSet = new Set(onlineUsers.map((id) => id.toString()));
      const remaining: PendingStickerOutboxItem[] = [];

      for (const item of outbox) {
        if (!onlineSet.has(item.peerId.toString())) {
          remaining.push(item);
          continue;
        }

        const dataBase64 = await readStickerBase64(item.stickerHash, item.stickerUri);
        if (!dataBase64) {
          continue;
        }

        const startedAt = Date.now();
        await patchPeerMessages(
          item.peerId,
          (m) => m._id === item.messageId,
          (m) => ({ ...m, stickerStatus: 'uploading' }),
          get,
          set
        );

        const res = await emitStickerOverSocket({
          peerId: item.peerId,
          messageId: item.messageId,
          stickerHash: item.stickerHash,
          isAnimated: item.isAnimated,
          createdAt: item.createdAt,
          dataBase64,
        });

        if (res.delivered) {
          markStickerHashKnownByPeer(item.peerId, item.stickerHash);
          const minSpin = Math.max(0, 320 - (Date.now() - startedAt));
          if (minSpin > 0) await new Promise<void>((r) => setTimeout(r, minSpin));
          await patchPeerMessages(
            item.peerId,
            (m) => m._id === item.messageId,
            (m) => ({ ...m, stickerStatus: 'sent' }),
            get,
            set
          );
        } else if (!res.error) {
          await patchPeerMessages(
            item.peerId,
            (m) => m._id === item.messageId,
            (m) => ({ ...m, stickerStatus: 'queued' }),
            get,
            set
          );
          remaining.push(item);
        }
      }

      if (remaining.length !== outbox.length) {
        await setPendingStickerOutbox(myId, remaining);
      }
    } finally {
      isFlushingStickerOutbox = false;
    }
  },

  subscribeToMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    socket.off('newMessage');
    socket.off('newSticker');
    socket.off('stickerRequested');
    socket.off('stickerDelivered');
    socket.off('messageRead');
    socket.off('conversationCleared');
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

    socket.on(
      'conversationCleared',
      async ({ peerId, clearedAt }: { peerId: string; clearedAt?: string }) => {
        if (!peerId) return;
        const pId = peerId.toString();
        const serverMs = clearedAt ? new Date(clearedAt).getTime() : NaN;
        const effectiveCutoffIso = new Date(
          Number.isNaN(serverMs) ? Date.now() : Math.max(serverMs, Date.now())
        ).toISOString();

        const myId = useAuthStore.getState().authUser?._id;
        if (myId) {
          const outbox = await getPendingStickerOutbox(myId);
          const filtered = outbox.filter((x) => x.peerId.toString() !== pId);
          if (filtered.length !== outbox.length) {
            await setPendingStickerOutbox(myId, filtered);
          }
        }
        await applyConversationClear(pId, effectiveCutoffIso, get, set, true);
      }
    );

    socket.on(
      'newSticker',
      async (
        incoming: Message & { dataBase64?: string; stickerHash: string }
      ) => {
        const myId = useAuthStore.getState().authUser?._id;
        const senderId = incoming.senderId?.toString();
        const receiverId = incoming.receiverId?.toString() || '';
        const isFromMe = Boolean(myId && senderId === myId.toString());
        const peerId = isFromMe ? receiverId : senderId;
        if (!peerId || !incoming.stickerHash) return;

        const existingLocalUri = resolveLocalStickerUri(incoming.stickerHash);
        const alreadyOnDevice = Boolean(existingLocalUri);
        const isRetryPayload = incoming._id?.startsWith('stk_retry_');
        const receivedAt = Date.now();

        const { dataBase64, ...rest } = incoming;

        let existingList = get().messagesByUser[peerId];
        if ((!existingList || existingList.length === 0) && myId) {
          existingList = (await getCachedMessages<Message>(myId, peerId)) || [];
        }
        const baseList = existingList || [];

        const initialMsg: Message = {
          ...rest,
          isSticker: true,
          stickerHash: incoming.stickerHash,
          ...(existingLocalUri ? { stickerUri: existingLocalUri } : {}),
          stickerStatus: alreadyOnDevice ? 'sent' : 'downloading',
          localOnly: true,
          clientCreatedAt: receivedAt,
        };

        let updatedList: Message[];
        const waitingMatchIdx = isRetryPayload
          ? baseList.findIndex(
              (m) => m.stickerHash === incoming.stickerHash && !m.stickerUri
            )
          : baseList.findIndex((m) => m._id === incoming._id);

        if (waitingMatchIdx !== -1) {
          updatedList = baseList.map((m, idx) =>
            idx === waitingMatchIdx
              ? {
                  ...m,
                  ...initialMsg,
                  _id: m._id,
                  stickerUri: existingLocalUri || m.stickerUri,
                  localId: m.localId,
                  clientCreatedAt: m.clientCreatedAt,
                }
              : m
          );
        } else {
          updatedList = [...baseList, initialMsg];
        }

        const { selectedUser, unreadCounts } = get();
        const isViewing = Boolean(selectedUser && selectedUser._id.toString() === peerId);

        if (isViewing) {
          set((state) => ({
            messages: updatedList,
            messagesByUser: { ...state.messagesByUser, [peerId]: updatedList },
          }));
          if (!isFromMe) {
            socket.emit('stickerDelivered', {
              to: senderId,
              messageId: incoming._id,
              stickerHash: incoming.stickerHash,
            });
            get().markMessageAsRead(selectedUser!._id, [incoming._id]);
          }
        } else if (!isFromMe) {
          socket.emit('stickerDelivered', {
            to: senderId,
            messageId: incoming._id,
            stickerHash: incoming.stickerHash,
          });
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

        if (alreadyOnDevice) {
          if (myId) setCachedMessages(myId, peerId, updatedList);
          return;
        }

        if (dataBase64) {
          const savedUri = await saveReceivedSticker(incoming.stickerHash, dataBase64);
          const minAnimMs = Math.max(0, 360 - (Date.now() - receivedAt));
          if (minAnimMs > 0) {
            await new Promise<void>((r) => setTimeout(r, minAnimMs));
          }
          await patchPeerMessages(
            peerId,
            (m) =>
              m._id === incoming._id ||
              (m.stickerHash === incoming.stickerHash && !m.stickerUri),
            (m) => ({
              ...m,
              ...(savedUri ? { stickerUri: savedUri } : {}),
              stickerStatus: 'sent',
            }),
            get,
            set
          );
        } else if (!isFromMe) {
          if (myId) setCachedMessages(myId, peerId, updatedList);
          socket.emit('requestSticker', {
            to: senderId,
            messageId: incoming._id,
            stickerHash: incoming.stickerHash,
          });
        }
      }
    );

    socket.on(
      'stickerRequested',
      async ({
        from,
        messageId,
        stickerHash,
      }: {
        from: string;
        messageId?: string;
        stickerHash: string;
      }) => {
        if (!from || !stickerHash) return;
        const dataBase64 = await readStickerBase64(stickerHash);
        if (!dataBase64) return;

        await emitStickerOverSocket({
          peerId: from.toString(),
          messageId: messageId || `stk_retry_${Date.now()}`,
          stickerHash,
          createdAt: new Date().toISOString(),
          dataBase64,
        });
      }
    );

    socket.on(
      'stickerDelivered',
      async ({
        peerId,
        messageId,
        stickerHash,
      }: {
        peerId: string;
        messageId: string;
        stickerHash?: string;
      }) => {
        if (peerId && stickerHash) {
          markStickerHashKnownByPeer(peerId.toString(), stickerHash);
        }
        const myId = useAuthStore.getState().authUser?._id;
        if (myId && messageId) {
          const outbox = await getPendingStickerOutbox(myId);
          const filtered = outbox.filter((x) => x.messageId !== messageId);
          if (filtered.length !== outbox.length) {
            await setPendingStickerOutbox(myId, filtered);
          }
        }
      }
    );
  },

  unSubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    socket.off('newMessage');
    socket.off('newSticker');
    socket.off('stickerRequested');
    socket.off('stickerDelivered');
    socket.off('messageRead');
    socket.off('conversationCleared');
    socket.off('typing');
    socket.off('stopTyping');
  },

  setSelectedUser: (selectedUser) => {
    const peerMessages = selectedUser ? get().messagesByUser[selectedUser._id] || [] : [];
    set({ selectedUser, isTyping: false, messages: peerMessages });
  },

  deleteAllMessages: async (userId: string) => {
    const myId = useAuthStore.getState().authUser?._id;
    set((state) => {
      const nextUnread = { ...state.unreadCounts, [userId]: 0 };
      if (myId) setCachedUnreadCounts(myId, nextUnread);
      return {
        messages: state.selectedUser?._id === userId ? [] : state.messages,
        messagesByUser: { ...state.messagesByUser, [userId]: [] },
        hasMoreOlderByUser: { ...state.hasMoreOlderByUser, [userId]: false },
        unreadCounts: nextUnread,
      };
    });
    if (myId) {
      setCachedMessages(myId, userId, []);
      const outbox = await getPendingStickerOutbox(myId);
      const filtered = outbox.filter((x) => x.peerId.toString() !== userId.toString());
      if (filtered.length !== outbox.length) {
        await setPendingStickerOutbox(myId, filtered);
      }
    }

    try {
      await axiosInstance.delete(`/messages/deleteAll/${userId}`);
    } catch {
      await get().getMessages(userId, true);
    }
  },

  fetchUnreadCounts: async () => {
    const myId = useAuthStore.getState().authUser?._id;
    try {
      const res = await axiosInstance.get('/messages/unreadcounts', {
        params: { includeClears: '1' },
      });
      const payload = res.data as
        | Array<{ _id: string; count: number }>
        | {
            counts: Array<{ _id: string; count: number }>;
            clears?: Record<string, string>;
            serverNow?: string;
          };

      const countsList = Array.isArray(payload) ? payload : payload.counts || [];
      const clears = Array.isArray(payload) ? {} : payload.clears || {};
      const serverNow = Array.isArray(payload) ? null : payload.serverNow || null;

      const countMap: Record<string, number> = {};
      countsList.forEach((item) => {
        countMap[item._id] = item.count;
      });
      set({ unreadCounts: countMap });
      if (myId) setCachedUnreadCounts(myId, countMap);

      if (clears) {
        for (const [peerId, clearedAt] of Object.entries(clears)) {
          if (clearedAt) {
            const localCutoff = toLocalCutoffIso(clearedAt, serverNow) || clearedAt;
            await applyConversationClear(peerId, localCutoff, get, set);
          }
        }
      }
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
    const localStickerIds = existingList
      .filter(
        (m) =>
          m.localOnly &&
          m.senderId === userId &&
          !m.read &&
          (mergedIds.length === 0 || mergedIds.includes(m._id))
      )
      .map((m) => m._id);

    const serverUnreadIds = mergedIds.filter((id) => !localStickerIds.includes(id));

    if (socket?.connected) {
      if (localStickerIds.length > 0) {
        socket.emit('stickerRead', { to: userId, messageIds: localStickerIds });
      }
      if (serverUnreadIds.length > 0 || mergedIds.length === 0) {
        socket.emit('markAsRead', {
          to: userId,
          ...(serverUnreadIds.length > 0 ? { messageIds: serverUnreadIds } : {}),
        });
      }
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
    sentStickerHashesByPeer.clear();
    recentReadIds.clear();
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
