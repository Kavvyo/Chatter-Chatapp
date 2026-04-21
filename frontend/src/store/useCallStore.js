import { create } from "zustand";
import Peer from "simple-peer";
import toast from "react-hot-toast";
import { useAuthStore } from "./useAuthStore";

export const useCallStore = create((set, get) => ({
  localStream: null,
  remoteStream: null,
  receivingCall: false,
  caller: null,
  callerName: "",
  callerSignal: null,
  callAccepted: false,
  callEnded: false,
  callActive: false,
  peer: null,
  
  initializeSocketListeners: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    
    // Cleanup first to avoid duplicate listeners
    socket.off("incomingCall");
    socket.off("callAccepted");
    socket.off("callEnded");

    socket.on("incomingCall", (data) => {
      set({
        receivingCall: true,
        caller: data.from,
        callerName: data.name,
        callerSignal: data.signal,
      });
    });

    socket.on("callEnded", () => {
      get().leaveCall(false); // don't emit endCall again
      toast.success("Call ended by the other user.");
    });
  },

  uninitializeSocketListeners: () => {
    const socket = useAuthStore.getState().socket;
    if (socket) {
      socket.off("incomingCall");
      socket.off("callAccepted");
      socket.off("callEnded");
    }
  },

  startLocalStream: async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      set({ localStream: stream });
      return stream;
    } catch (error) {
      toast.error("Failed to access camera and microphone");
      console.error(error);
      return null;
    }
  },

  callUser: async (userToCall) => {
    const stream = get().localStream || await get().startLocalStream();
    if (!stream) return;

    const authUser = useAuthStore.getState().authUser;
    const socket = useAuthStore.getState().socket;

    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream: stream,
    });

    peer.on("signal", (data) => {
      socket.emit("callUser", {
        userToCall: userToCall._id,
        signalData: data,
        from: authUser._id,
        name: authUser.fullName,
      });
    });

    peer.on("stream", (currentStream) => {
      set({ remoteStream: currentStream });
    });
    
    socket.on("callAccepted", (signal) => {
      set({ callAccepted: true, callActive: true });
      peer.signal(signal);
    });

    set({ peer, callActive: true, caller: userToCall._id });
  },

  answerCall: async () => {
    set({ callAccepted: true, callActive: true, receivingCall: false });
    
    const stream = get().localStream || await get().startLocalStream();
    if (!stream) return;

    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream: stream,
    });

    const socket = useAuthStore.getState().socket;
    
    peer.on("signal", (data) => {
      socket.emit("answerCall", { signal: data, to: get().caller });
    });

    peer.on("stream", (currentStream) => {
      set({ remoteStream: currentStream });
    });

    peer.signal(get().callerSignal);

    set({ peer });
  },

  leaveCall: (emitEvent = true) => {
    const { peer, localStream, caller, callActive } = get();
    const socket = useAuthStore.getState().socket;

    if (emitEvent && callActive && socket) {
      socket.emit("endCall", { to: caller });
    }

    if (peer) {
      peer.destroy();
    }
    
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }

    // if we were answering, remove callAccepted listener (might be lingering)
    if (socket) socket.off("callAccepted");

    set({
      localStream: null,
      remoteStream: null,
      receivingCall: false,
      caller: null,
      callerName: "",
      callerSignal: null,
      callAccepted: false,
      callEnded: true,
      callActive: false,
      peer: null,
    });
    
    setTimeout(() => {
        set({ callEnded: false });
    }, 2000);
  },

  rejectCall: () => {
    const { caller } = get();
    const socket = useAuthStore.getState().socket;
    
    if (socket && caller) {
      socket.emit("endCall", { to: caller });
    }

    set({
      receivingCall: false,
      caller: null,
      callerName: "",
      callerSignal: null,
    });
  }

}));
