import toast from 'react-hot-toast';
import {io} from 'socket.io-client'
import {create} from 'zustand';
import {axiosInstanace} from '../lib/axios.js';
import { useChatStore } from './useChatStore.js';
import { useCallStore } from './useCallStore.js';
import { useStickerStore } from './useStickerStore.js';

const BASE_URL = import.meta.env.MODE === "development" ? "http://localhost:5001": "/";

let webPresenceListenersBound = false;
let webDisconnectGraceTimer = null;

export const useAuthStore = create((set, get) => ({
    authUser: null,
    isSigningUp: false,
    isLoggingIn:false,
    isUpdatingProfile: false,
    onlineUsers: [],
    lastSeenMap: {},
    isSocketConnected: false,
    socket: null,
    isCheckingAuth: true,
    isVerifing: false,

    checkAuth: async () => {
        try {
            const res = await axiosInstanace.get("/auth/check");
            set({ authUser: res.data });
            get().connectSocket();

        } catch (error) {
            console.log('Error in checkAuth: ', error);
            set({ authUser: null });
        }
        finally{
            set({ isCheckingAuth: false});
        }
    },

    signUp: async (data) => {
        set({isSigningUp: true});
        try {
            await axiosInstanace.post("/auth/signup", data);
            // set({authUser: res.data});
            await get().checkAuth();
            get().connectSocket();
        } catch (error) {
            toast.error(error.response.data.message);
        }
        finally{
            set({isSigningUp: false});
        }
    },

    logIn: async (data) => {
        set({isLoggingIn:true})
        try {
            await axiosInstanace.post("/auth/login", data);
            // set({authUser: res.data});
            await get().checkAuth();
            toast.success("Logged in successfully");
            get().connectSocket();
        } catch (error) {
            toast.error(error.response.data.message);
        }
        finally{
            set({isLoggingIn: false});
        }
    },

    logOut: async () => {
        try {
            
            await axiosInstanace.post("/auth/logout");
            set({authUser: null});
            toast.success("Logged out successfully");
            get().disConnectSocket();
            
            useChatStore.persist.clearStorage();

        } catch (error) {
            toast.error(error.response.data.message);
        }
    },

    updateProfile: async (data) => {
        set({isUpdatingProfile: true});
        try {
            const res = await axiosInstanace.put("auth/update-profile", data);
            set({authUser: res.data.updatedUser});
            toast.success("profile updated successfully");
        } catch (error) {
            console.log(error);
            toast.error(error.response.data.message);
        }
        finally {
            set({isUpdatingProfile: false});
        }
    },

    updateFullname: async (data) => {
        try {
            const res = await axiosInstanace.put("auth/update-fullname", data);
            set({authUser: res.data.updatedUser});
            toast.success("Full Name updated successfully");
        } catch (error) {
            console.log(error);
            toast.error(error.response.data.message);
        }

    },

    connectSocket: () => {

        const {authUser} = get();
        if(!authUser|| get().socket?.connected) return;

        const existing = get().socket;
        if (existing) {
            if (!existing.connected) existing.connect();
            return;
        }

        const socket = io(BASE_URL, {
            query: {
                userId: authUser._id,
            },
            transports: ["websocket", "polling"],
            timeout: 20000,
            reconnection: true,
            reconnectionDelay: 500,
            reconnectionDelayMax: 4000,
        });

        
        set({socket: socket, isSocketConnected: socket.connected});
        
        // Immediately bind call socket listeners & hydrate local IndexedDB stickers
        useStickerStore.getState().hydrateStickers();
        useCallStore.getState().initializeSocketListeners(socket);
        socket.on("connect", () => {
            if (webDisconnectGraceTimer) {
                clearTimeout(webDisconnectGraceTimer);
                webDisconnectGraceTimer = null;
            }
            set({ isSocketConnected: true });
            socket.emit("requestOnlineUsers");
            if (typeof socket.hasListeners === "function" && socket.hasListeners("newSticker")) {
                socket.emit("syncPendingStickers");
            }
            useCallStore.getState().initializeSocketListeners(socket);
            useChatStore.getState().flushStickerOutbox(get().onlineUsers);
        });

        socket.on("disconnect", () => {
            set({ isSocketConnected: false });
            if (webDisconnectGraceTimer) clearTimeout(webDisconnectGraceTimer);
            webDisconnectGraceTimer = setTimeout(() => {
                if (!get().isSocketConnected) {
                    set({ onlineUsers: [] });
                }
            }, 4500);
        });

        socket.on("getOnlineUsers", (userIds) => {
            const normalized = Array.isArray(userIds) ? userIds.map(String) : [];
            set({onlineUsers: normalized});
            useChatStore.getState().flushStickerOutbox(normalized);
        });

        socket.on("userLastSeen", ({ userId, lastSeen }) => {
            if (!userId || !lastSeen) return;
            set((state) => ({
                lastSeenMap: { ...state.lastSeenMap, [userId.toString()]: lastSeen },
            }));
        });

        socket.on("newFriendship", (newFriendship) => {
            console.log("Received new friend request:", newFriendship);
            toast.success(`${newFriendship.requester.fullName} sent you a friend request`);
        });

        if (!webPresenceListenersBound && typeof window !== "undefined") {
            webPresenceListenersBound = true;
            const probeSocket = () => {
                const { authUser: currentUser, socket: activeSocket, connectSocket } = get();
                if (!currentUser) return;
                if (!activeSocket) {
                    connectSocket();
                    return;
                }
                if (!activeSocket.connected) {
                    activeSocket.connect();
                    return;
                }
                activeSocket.timeout(2500).emit("heartbeat", (err) => {
                    if (err) {
                        try {
                            activeSocket.disconnect();
                        } catch {
                            // ignore socket teardown error before reconnect
                        }
                        activeSocket.connect();
                    } else {
                        activeSocket.emit("requestOnlineUsers");
                    }
                });
            };
            window.addEventListener("online", probeSocket);
            document.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "visible") probeSocket();
            });
        }
    },

    disConnectSocket: () => {
        if (webDisconnectGraceTimer) {
            clearTimeout(webDisconnectGraceTimer);
            webDisconnectGraceTimer = null;
        }
        useCallStore.getState().uninitializeSocketListeners();
        if(get().socket?.connected) get().socket.disconnect();
        set({ socket: null, isSocketConnected: false, onlineUsers: [] });
    },

    OtpVerify: async (data) => {
        set({isVerifing: true});
        try {
            await axiosInstanace.post("/auth/verify", data);
            await get().checkAuth();
            toast.success("Email verified!");
            toast.success("Account created successfully");
        } catch (error) {
            toast.error(error.response.data.message);
        }
        finally{
            set({isVerifing:false});
        }


    },
    
    resendOtp: async (email) => {
        try {
          await axiosInstanace.post("/auth/resend-otp", { email });
          toast.success("A new OTP has been sent to your email.");
          await get().checkAuth();
        } catch (error) {
          console.log(error);
          toast.error(error.response?.data?.message || "Failed to resend OTP.");
        }
    },

}));