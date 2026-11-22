import { create } from 'zustand';
import { axiosInstance } from '../lib/axios';
import { useAuthStore } from './useAuthStore';

export interface Message {
  _id: string;
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

interface ChatState {
  messages: Message[];
  users: ChatUser[];
  selectedUser: ChatUser | null;
  isUsersLoading: boolean;
  isMessagesLoading: boolean;
  unreadCounts: Record<string, number>;
  isTyping: boolean;

  getUsers: () => Promise<void>;
  getMessages: (userId: string) => Promise<void>;
  sendMessage: (messageData: { text?: string; image?: string }) => Promise<{ success: boolean; message?: string }>;
  subscribeToMessages: () => void;
  unSubscribeFromMessages: () => void;
  setSelectedUser: (user: ChatUser | null) => void;
  deleteAllMessages: (userId: string) => Promise<void>;
  fetchUnreadCounts: () => Promise<void>;
  markMessageAsRead: (userId: string) => Promise<void>;
  setIsTyping: (isTyping: boolean) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  users: [],
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,
  unreadCounts: {},
  isTyping: false,

  getUsers: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get('/messages/users');
      const verifiedUsers = res.data.filter((u: ChatUser) => u.isVerified);
      set({ users: verifiedUsers });
    } catch (error) {
      // ignore
    } finally {
      set({ isUsersLoading: false });
    }
  },

  getMessages: async (userId: string) => {
    set({ isMessagesLoading: true });
    try {
      const res = await axiosInstance.get(`/messages/${userId}`);
      set({ messages: res.data });
    } catch (error) {
      // ignore
    } finally {
      set({ isMessagesLoading: false });
    }
  },

  sendMessage: async (messageData) => {
    const { selectedUser, messages } = get();
    if (!selectedUser) return { success: false, message: 'No recipient selected' };

    const currentUserId = useAuthStore.getState().authUser?._id || 'temp_me';
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Optimistic message displayed immediately in 0ms
    const optimisticMessage: Message = {
      _id: tempId,
      senderId: currentUserId,
      receiverId: selectedUser._id,
      text: messageData.text,
      image: messageData.image,
      read: false,
      createdAt: new Date().toISOString(),
    };

    set({ messages: [...messages, optimisticMessage] });

    try {
      const res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, messageData);
      
      // Seamlessly swap temp message with server confirmed message
      const currentList = get().messages;
      const replaced = currentList.map((m) => (m._id === tempId ? res.data : m));
      set({ messages: replaced });
      return { success: true };
    } catch (error: any) {
      // Revert if sending failed
      const rolledBack = get().messages.filter((m) => m._id !== tempId);
      set({ messages: rolledBack });
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

    socket.on('newMessage', (newMessage: Message) => {
      const { selectedUser, messages, unreadCounts } = get();

      if (selectedUser && selectedUser._id.toString() === newMessage.senderId.toString()) {
        const exists = messages.some(
          (m) =>
            m._id === newMessage._id ||
            (m.senderId === newMessage.senderId &&
              m.text === newMessage.text &&
              Math.abs(new Date(m.createdAt).getTime() - new Date(newMessage.createdAt).getTime()) < 4000)
        );
        if (!exists) {
          set({ messages: [...messages, newMessage] });
        }
        get().markMessageAsRead(selectedUser._id);
      } else {
        const count = unreadCounts[newMessage.senderId] || 0;
        set({
          unreadCounts: { ...unreadCounts, [newMessage.senderId]: count + 1 },
        });
      }
    });

    socket.on('messageRead', ({ readerId, messages: readMessages }: { readerId: string; messages: Message[] }) => {
      const { messages: currentMessages, selectedUser } = get();

      if (selectedUser && selectedUser._id === readerId) {
        const updated = currentMessages.map((msg) => {
          const found = readMessages.find((r) => r._id === msg._id);
          return found ? { ...msg, read: true } : msg;
        });
        set({ messages: updated });
      }
    });

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
    const { unreadCounts } = get();
    if (selectedUser && unreadCounts[selectedUser._id]) {
      const updatedCounts = { ...unreadCounts };
      delete updatedCounts[selectedUser._id];
      set({ unreadCounts: updatedCounts });
    }
    set({ selectedUser, isTyping: false });
    if (selectedUser) {
      get().markMessageAsRead(selectedUser._id);
    }
  },

  deleteAllMessages: async (userId: string) => {
    try {
      await axiosInstance.delete(`/messages/deleteAll/${userId}`);
      await get().getMessages(userId);
    } catch (error) {
      // ignore
    }
  },

  fetchUnreadCounts: async () => {
    try {
      const res = await axiosInstance.get('/messages/unreadcounts');
      const countMap: Record<string, number> = {};
      res.data.forEach((item: { _id: string; count: number }) => {
        countMap[item._id] = item.count;
      });
      set({ unreadCounts: countMap });
    } catch (error) {
      // ignore
    }
  },

  markMessageAsRead: async (userId: string) => {
    if (!userId) return;
    try {
      await axiosInstance.put(`/messages/read/${userId}`);
    } catch (error) {
      // ignore
    }
  },

  setIsTyping: (isTyping: boolean) => set({ isTyping }),
}));
