import { create } from 'zustand';
import { axiosInstance } from '../lib/axios';
import { useAuthStore } from './useAuthStore';
import { useChatStore, ChatUser } from './useChatStore';
import {
  getCachedFriends,
  getCachedPendingRequests,
  prefetchImageUrls,
  setCachedFriends,
  setCachedPendingRequests,
} from '../lib/cache';

export interface FriendRequest {
  _id: string;
  requester: ChatUser;
  recipient: ChatUser;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

interface FriendsState {
  friends: ChatUser[];
  isFriendsLoading: boolean;
  pendingRequests: FriendRequest[];

  hydrateFromCache: (userId: string) => Promise<void>;
  getFriends: (silent?: boolean) => Promise<void>;
  sendRequest: (userId: string) => Promise<{ success: boolean; message?: string }>;
  getPendingRequests: () => Promise<void>;
  acceptRequest: (userId: string) => Promise<{ success: boolean; message?: string }>;
  cancelRequest: (userId: string) => Promise<{ success: boolean; message?: string }>;
  unfriendUser: (userId: string) => Promise<{ success: boolean; message?: string }>;
  subscribeToFriendReqests: () => void;
  unSubscribeFromFriendReqests: () => void;
  reset: () => void;
}

export const useFriendsStore = create<FriendsState>((set, get) => ({
  friends: [],
  isFriendsLoading: false,
  pendingRequests: [],

  hydrateFromCache: async (userId: string) => {
    if (!userId) return;
    const [cachedFriends, cachedPending] = await Promise.all([
      getCachedFriends<ChatUser>(userId),
      getCachedPendingRequests<FriendRequest>(userId),
    ]);

    const updates: Partial<FriendsState> = {};
    if (cachedFriends && cachedFriends.length > 0 && get().friends.length === 0) {
      updates.friends = cachedFriends;
      prefetchImageUrls(cachedFriends.map((f) => f.profilePic));
    }
    if (cachedPending && cachedPending.length > 0 && get().pendingRequests.length === 0) {
      updates.pendingRequests = cachedPending;
    }

    if (Object.keys(updates).length > 0) {
      set(updates);
    }
  },

  getFriends: async (silent = false) => {
    const userId = useAuthStore.getState().authUser?._id;
    const hasExisting = get().friends.length > 0;

    if (!silent && !hasExisting) {
      set({ isFriendsLoading: true });
    }

    try {
      const res = await axiosInstance.get('/friends/getfriends');
      const freshFriends = res.data as ChatUser[];
      set({ friends: freshFriends });
      if (userId) {
        setCachedFriends(userId, freshFriends);
      }
      prefetchImageUrls(freshFriends.map((f) => f.profilePic));
    } catch {
      // Keep cached friends visible if offline
    } finally {
      set({ isFriendsLoading: false });
    }
  },

  sendRequest: async (userId: string) => {
    try {
      await axiosInstance.post(`/friends/request/${userId}`);
      return { success: true, message: 'Friend request sent!' };
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to send request';
      return { success: false, message };
    }
  },

  getPendingRequests: async () => {
    const userId = useAuthStore.getState().authUser?._id;
    try {
      const res = await axiosInstance.get('/friends/pendingReqs');
      set({ pendingRequests: res.data });
      if (userId) {
        setCachedPendingRequests(userId, res.data);
      }
    } catch {
      // Keep cached pending requests if offline
    }
  },

  acceptRequest: async (userId: string) => {
    try {
      await axiosInstance.post(`/friends/accept/${userId}`);
      await Promise.all([get().getFriends(true), get().getPendingRequests()]);
      return { success: true, message: 'Friend request accepted!' };
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to accept request';
      return { success: false, message };
    }
  },

  cancelRequest: async (userId: string) => {
    try {
      await axiosInstance.delete(`/friends/cancel/${userId}`);
      await get().getPendingRequests();
      return { success: true, message: 'Friend request canceled' };
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to cancel request';
      return { success: false, message };
    }
  },

  unfriendUser: async (userId: string) => {
    try {
      await axiosInstance.delete(`/friends/unfriend/${userId}`);
      await useChatStore.getState().deleteAllMessages(userId);
      await get().getFriends(true);
      useChatStore.getState().setSelectedUser(null);
      return { success: true, message: 'Unfriended successfully' };
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to unfriend user';
      return { success: false, message };
    }
  },

  subscribeToFriendReqests: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    socket.off('newFriendship');
    socket.off('acceptedFriendship');
    socket.off('unfriendNotify');

    socket.on('newFriendship', (newFriendship: FriendRequest) => {
      const myId = useAuthStore.getState().authUser?._id;
      const updated = [...get().pendingRequests, newFriendship];
      set({ pendingRequests: updated });
      if (myId) setCachedPendingRequests(myId, updated);
    });

    socket.on('acceptedFriendship', () => {
      get().getFriends(true);
    });

    socket.on('unfriendNotify', () => {
      get().getFriends(true);
      useChatStore.getState().setSelectedUser(null);
    });
  },

  unSubscribeFromFriendReqests: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    socket.off('newFriendship');
    socket.off('acceptedFriendship');
    socket.off('unfriendNotify');
  },

  reset: () => {
    set({ friends: [], pendingRequests: [], isFriendsLoading: false });
  },
}));
