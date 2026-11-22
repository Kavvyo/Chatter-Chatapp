import { create } from 'zustand';
import { axiosInstance } from '../lib/axios';
import { useAuthStore } from './useAuthStore';
import { useChatStore, ChatUser } from './useChatStore';

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

  getFriends: () => Promise<void>;
  sendRequest: (userId: string) => Promise<{ success: boolean; message?: string }>;
  getPendingRequests: () => Promise<void>;
  acceptRequest: (userId: string) => Promise<{ success: boolean; message?: string }>;
  cancelRequest: (userId: string) => Promise<{ success: boolean; message?: string }>;
  unfriendUser: (userId: string) => Promise<{ success: boolean; message?: string }>;
  subscribeToFriendReqests: () => void;
  unSubscribeFromFriendReqests: () => void;
}

export const useFriendsStore = create<FriendsState>((set, get) => ({
  friends: [],
  isFriendsLoading: false,
  pendingRequests: [],

  getFriends: async () => {
    set({ isFriendsLoading: true });
    try {
      const res = await axiosInstance.get('/friends/getfriends');
      set({ friends: res.data });
    } catch (error) {
      // ignore
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
    try {
      const res = await axiosInstance.get('/friends/pendingReqs');
      set({ pendingRequests: res.data });
    } catch (error) {
      // ignore
    }
  },

  acceptRequest: async (userId: string) => {
    try {
      await axiosInstance.post(`/friends/accept/${userId}`);
      await get().getFriends();
      await get().getPendingRequests();
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
      await get().getFriends();
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
      const { pendingRequests } = get();
      set({ pendingRequests: [...pendingRequests, newFriendship] });
    });

    socket.on('acceptedFriendship', () => {
      get().getFriends();
    });

    socket.on('unfriendNotify', () => {
      get().getFriends();
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
}));
