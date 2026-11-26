import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { axiosInstance, clearAuthCookie, hasStoredAuthCookie } from '../lib/axios';
import { BASE_URL } from '../lib/config';
import { clearSyncedPushToken, registerAndSyncPushToken } from '../lib/notifications';
import {
  clearCachedAuthUser,
  clearUserDataCaches,
  getCachedAuthUser,
  setCachedAuthUser,
} from '../lib/cache';

export interface AuthUser {
  _id: string;
  fullName: string;
  email: string;
  profilePic?: string;
  isVerified: boolean;
  createdAt?: string;
}

interface AuthState {
  authUser: AuthUser | null;
  isSigningUp: boolean;
  isLoggingIn: boolean;
  isUpdatingProfile: boolean;
  isVerifying: boolean;
  isCheckingAuth: boolean;
  onlineUsers: string[];
  socket: Socket | null;

  checkAuth: () => Promise<void>;
  signUp: (data: { fullName: string; email: string; password: string }) => Promise<{ success: boolean; message?: string }>;
  logIn: (data: { email: string; password: string }) => Promise<{ success: boolean; message?: string }>;
  logOut: () => Promise<void>;
  updateProfile: (data: { profilePic: string }) => Promise<{ success: boolean; message?: string }>;
  updateFullname: (data: { fullName: string }) => Promise<{ success: boolean; message?: string }>;
  OtpVerify: (data: { email: string; otp: string }) => Promise<{ success: boolean; message?: string }>;
  resendOtp: (email: string) => Promise<{ success: boolean; message?: string }>;

  connectSocket: () => void;
  disConnectSocket: () => void;
}

function hydrateDataStores(userId: string) {
  try {
    // Lazy imports avoid circular store dependencies at module evaluation
    const { useFriendsStore } = require('./useFriendsStore');
    const { useChatStore } = require('./useChatStore');
    useFriendsStore.getState().hydrateFromCache(userId);
    useChatStore.getState().hydrateFromCache(userId);
  } catch {
    // ignore
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  authUser: null,
  isSigningUp: false,
  isLoggingIn: false,
  isUpdatingProfile: false,
  isVerifying: false,
  isCheckingAuth: true,
  onlineUsers: [],
  socket: null,

  checkAuth: async () => {
    let hydratedFromCache = false;

    try {
      const [hasCookie, cachedUser] = await Promise.all([
        hasStoredAuthCookie(),
        getCachedAuthUser<AuthUser>(),
      ]);

      if (hasCookie && cachedUser?._id) {
        hydratedFromCache = true;
        set({ authUser: cachedUser, isCheckingAuth: false });
        hydrateDataStores(cachedUser._id);
        get().connectSocket();
      }
    } catch {
      // Fall through cleanly to network check
    }

    try {
      const res = await axiosInstance.get('/auth/check');
      const freshUser = res.data as AuthUser;
      set({ authUser: freshUser, isCheckingAuth: false });
      await setCachedAuthUser(freshUser);

      if (!hydratedFromCache && freshUser?._id) {
        hydrateDataStores(freshUser._id);
      }

      get().connectSocket();
      registerAndSyncPushToken().catch(() => {});
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401 || status === 403 || !hydratedFromCache) {
        if (status === 401 || status === 403) {
          await clearAuthCookie();
          await clearCachedAuthUser();
          get().disConnectSocket();
        }
        set({ authUser: null, isCheckingAuth: false });
      } else {
        // Offline / transient network timeout: preserve cached user so offline history remains viewable
        set({ isCheckingAuth: false });
      }
    }
  },

  signUp: async (data) => {
    set({ isSigningUp: true });
    try {
      await axiosInstance.post('/auth/signup', data);
      await get().checkAuth();
      get().connectSocket();
      return { success: true };
    } catch (error: any) {
      const message = error.response?.data?.message || 'Signup failed';
      return { success: false, message };
    } finally {
      set({ isSigningUp: false });
    }
  },

  logIn: async (data) => {
    set({ isLoggingIn: true });
    try {
      await axiosInstance.post('/auth/login', data);
      await get().checkAuth();
      get().connectSocket();
      return { success: true };
    } catch (error: any) {
      const message = error.response?.data?.message || 'Login failed';
      return { success: false, message };
    } finally {
      set({ isLoggingIn: false });
    }
  },

  logOut: async () => {
    const userId = get().authUser?._id;
    try {
      await clearSyncedPushToken();
      await axiosInstance.post('/auth/logout');
    } catch (error) {
      // Continue cleanup anyway
    } finally {
      await clearAuthCookie();
      await clearCachedAuthUser();
      if (userId) {
        await clearUserDataCaches(userId);
      }
      get().disConnectSocket();
      set({ authUser: null, onlineUsers: [] });
      try {
        const { useChatStore } = require('./useChatStore');
        const { useFriendsStore } = require('./useFriendsStore');
        useChatStore.getState().reset();
        useFriendsStore.getState().reset();
      } catch {
        // ignore
      }
    }
  },

  updateProfile: async (data) => {
    set({ isUpdatingProfile: true });
    try {
      const res = await axiosInstance.put('/auth/update-profile', data);
      set({ authUser: res.data.updatedUser });
      await setCachedAuthUser(res.data.updatedUser);
      return { success: true };
    } catch (error: any) {
      const message = error.response?.data?.message || 'Profile update failed';
      return { success: false, message };
    } finally {
      set({ isUpdatingProfile: false });
    }
  },

  updateFullname: async (data) => {
    try {
      const res = await axiosInstance.put('/auth/update-fullname', data);
      set({ authUser: res.data.updatedUser });
      await setCachedAuthUser(res.data.updatedUser);
      return { success: true };
    } catch (error: any) {
      const message = error.response?.data?.message || 'Name update failed';
      return { success: false, message };
    }
  },

  OtpVerify: async (data) => {
    set({ isVerifying: true });
    try {
      await axiosInstance.post('/auth/verify', data);
      await get().checkAuth();
      return { success: true };
    } catch (error: any) {
      const message = error.response?.data?.message || 'OTP verification failed';
      return { success: false, message };
    } finally {
      set({ isVerifying: false });
    }
  },

  resendOtp: async (email) => {
    try {
      await axiosInstance.post('/auth/resend-otp', { email });
      await get().checkAuth();
      return { success: true };
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to resend OTP';
      return { success: false, message };
    }
  },

  connectSocket: () => {
    const { authUser } = get();
    if (!authUser || get().socket?.connected) return;

    const existing = get().socket;
    if (existing) {
      if (!existing.connected) existing.connect();
      return;
    }

    const socket = io(BASE_URL, {
      query: {
        userId: authUser._id,
      },
      transports: ['websocket'],
    });

    set({ socket });

    socket.on('getOnlineUsers', (userIds: string[]) => {
      set({ onlineUsers: userIds });
    });

    socket.on('connect', () => {
      try {
        const { useCallStore } = require('./useCallStore');
        const pendingDecline = useCallStore.getState().pendingDeclineCallerId;
        if (pendingDecline) {
          socket.emit('rejectCall', { to: pendingDecline });
          useCallStore.setState({ pendingDeclineCallerId: null });
        }
      } catch {
        // ignore
      }
    });
  },

  disConnectSocket: () => {
    if (get().socket) {
      get().socket?.disconnect();
    }
    set({ socket: null });
  },
}));
