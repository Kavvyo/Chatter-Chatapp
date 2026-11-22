import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { axiosInstance, clearAuthCookie } from '../lib/axios';
import { BASE_URL } from '../lib/config';

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
    try {
      const res = await axiosInstance.get('/auth/check');
      set({ authUser: res.data });
      get().connectSocket();
    } catch (error) {
      set({ authUser: null });
    } finally {
      set({ isCheckingAuth: false });
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
    try {
      await axiosInstance.post('/auth/logout');
    } catch (error) {
      // Continue cleanup anyway
    } finally {
      await clearAuthCookie();
      get().disConnectSocket();
      set({ authUser: null });
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { useChatStore } = require('./useChatStore');
        useChatStore.getState().setSelectedUser(null);
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
  },

  disConnectSocket: () => {
    if (get().socket?.connected) {
      get().socket?.disconnect();
    }
    set({ socket: null });
  },
}));
