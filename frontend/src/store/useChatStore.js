import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstanace } from "../lib/axios";
import {useAuthStore} from './useAuthStore';


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
        const {selectedUser, messages} = get();

        try {
            const res = await axiosInstanace.post(`/messages/send/${selectedUser._id}`, messageData);
            set({messages: [...messages, res.data]});
        } catch (error) {
            toast.error(error.response.data.message);
        }
    },

    subscribeToMessages: () => {
        const socket = useAuthStore.getState().socket;
    
        socket.on("newMessage", (newMessage) => {
            const { selectedUser, messages, unreadCounts } = get();

            if (selectedUser && selectedUser._id.toString() === newMessage.senderId.toString()) {
                set({ messages: [...messages, newMessage] });

                get().markMessageAsRead(selectedUser._id);

            } 
            else {
                const currentCount = unreadCounts[newMessage.senderId] || 0;
    
                set({unreadCounts: {...unreadCounts,[newMessage.senderId]: currentCount + 1}});  
            }
        });

        socket.on("messageRead", ({ readerId, messages: readMessages }) => {
            const { messages: currentMessages, selectedUser } = get();


            if (selectedUser && selectedUser._id === readerId) {
                const updatedMessages = currentMessages.map(msg => {
                    const found = readMessages.find(read => read._id === msg._id);
                    return found ? { ...msg, read: true } : msg;
                });

                set({ messages: updatedMessages });
            }
        });


    },
    
    unSubscribeFromMessages: () => {
        const socket = useAuthStore.getState().socket;
        socket.off("newMessage");
        socket.off("messageRead");

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
        try {
            await axiosInstanace.delete(`/messages/deleteAll/${userId}`);
            get().getMessages(userId);
            toast.success("Conversation deleted");
        } catch (error) {
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

    markMessageAsRead : async (userId) => {
        if (userId) {
            try {
                await axiosInstanace.put(`/messages/read/${userId}`);
            } catch (error) {
                console.error("Failed to mark messages as read", error);
            }
        }
    },

}));