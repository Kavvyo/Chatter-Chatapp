import toast from 'react-hot-toast';
import {create} from 'zustand';
import {axiosInstanace} from '../lib/axios.js';
import { useAuthStore } from './useAuthStore.js';
import { useChatStore } from './useChatStore.js';

export const useFriendsStore = create((set, get) => ({
    friends: [],
    isFriendsLoading: false,
    pendingRequests: [],

    getFriends: async () => {
        set({isFriendsLoading: true});
        try {
            const res = await axiosInstanace.get('/friends/getfriends');
            set({ friends: res.data });  // Store only verified users

        } catch (error) {
            toast.error(error.response.data.message);
        }
        finally{
            set({isFriendsLoading: false});
        }
    },

    sendRequest: async (userId) => {
        try {
            await axiosInstanace.post(`/friends/request/${userId}`);
            toast.success('Friend request sent!');
            
        } catch (error) {
            toast.error(error.response?.data?.message || 'An error occurred while sending the request.');
            
        }
    },

    getPendingRequests: async () => {
        try {
          const res = await axiosInstanace.get("/friends/pendingReqs");
          set({ pendingRequests: res.data }); 

        } catch (error) {
          toast.error(error.response?.data?.message || "Failed to load friend requests");
        }
    },

    acceptRequest: async (userId) => {
        try {
            await axiosInstanace.post(`/friends/accept/${userId}`);
            get().getFriends();
            get().getPendingRequests();
            toast.success('Friend request accepted');
        } catch (error) {
            toast.error(error.response?.data?.message || 'An error occurred while accept');
        }
    },

    cancelRequest: async (userId) => {
        try {
            await axiosInstanace.delete(`/friends/cancel/${userId}`);
            get().getPendingRequests();
            toast.success("Friend request canceled");
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to cancel request");
        }
    },

    subscribeToFriendReqests: () => {
        const socket = useAuthStore.getState().socket;
    
        socket.on("newFriendship", (newFriendship) => {
            const { pendingRequests } = get();
            set({ pendingRequests: [...pendingRequests, newFriendship] });
            
            // console.log("Received new friend request:", newFriendship);
        
            toast.success(`${newFriendship.requester.fullName} sent you a friend request`);
        });

        socket.on("acceptedFriendship", (friendship) => {
            toast.success(`${friendship.recipient.fullName} accept your request`);
            get().getFriends();
        });

        socket.on("unfriendNotify", () => {
            const setSelectedUser = useChatStore.getState().setSelectedUser;

            get().getFriends();
            setSelectedUser(null);
        });
        
    },
    
    unSubscribeFromFriendReqests: () => {
        const socket = useAuthStore.getState().socket;
        socket.off("newFriendship");
        socket.off("acceptedFriendship");
        socket.off("unfriendNotify");

    },

    unfriendUser: async (userId) => {
        const setSelectedUser = useChatStore.getState().setSelectedUser;
        const deleteAllMessages = useChatStore.getState().deleteAllMessages;

        try {
            await axiosInstanace.delete(`/friends/unfriend/${userId}`);
            deleteAllMessages(userId);
            get().getFriends();
            setSelectedUser(null)
            toast.success("Unfriend succuess");
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to unfriend user");
        }
    },
    
      
}));