import { create } from "zustand";
import Peer from "simple-peer";
import toast from "react-hot-toast";
import { useAuthStore } from "./useAuthStore";
import {
  playIncomingRingtone,
  playOutgoingRingback,
  playEndCallTone,
  stopCallSounds,
} from "../lib/callSounds";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
];

export const useCallStore = create((set, get) => ({
  localStream: null,
  remoteStream: null,
  receivingCall: false,
  caller: null,
  callerName: "",
  callerAvatar: "",
  callerSignal: null,
  callAccepted: false,
  callEnded: false,
  callActive: false,
  callType: "video", // "voice" | "video"
  targetUser: null,
  isCaller: false,
  isMicMuted: false,
  isCameraOff: false,
  facingMode: "user",
  callStatus: "idle", // "idle" | "calling" | "ringing" | "connected" | "ended"
  callDuration: 0,
  peer: null,
  callTimeoutId: null,
  timerIntervalId: null,

  initializeSocketListeners: (socketInstance) => {
    const socket = socketInstance || useAuthStore.getState().socket;
    if (!socket) return;

    // Clean up previous listeners to prevent multiple triggers
    socket.off("incomingCall");
    socket.off("callAccepted");
    socket.off("callEnded");
    socket.off("callRejected");
    socket.off("userBusy");
    socket.off("callFailed");

    socket.on("incomingCall", (data) => {
      const { callActive, caller } = get();

      // Case 1: If this is duplicate or updated signal from the CURRENT caller
      if (caller && caller.toString() === data.from?.toString()) {
        if (data.signal) {
          set({ callerSignal: data.signal });
          const { peer, callAccepted } = get();
          if (peer && !peer.destroyed && callAccepted) {
            try {
              peer.signal(data.signal);
            } catch (err) {
              console.warn("Peer signal update error:", err);
            }
          }
        }
        return;
      }

      // Case 2: Only report busy if user is currently active in a call with a DIFFERENT person
      if (callActive && caller && caller.toString() !== data.from?.toString()) {
        socket.emit("userBusy", { to: data.from });
        return;
      }

      // Case 3: Fresh incoming call
      playIncomingRingtone();

      set({
        receivingCall: true,
        caller: data.from,
        callerName: data.name || "Unknown caller",
        callerAvatar: data.avatar || "/avatar.png",
        callerSignal: data.signal,
        callType: data.callType || "video",
        targetUser: {
          _id: data.from,
          fullName: data.name || "Unknown caller",
          profilePic: data.avatar || "/avatar.png",
        },
        callStatus: "ringing",
      });
    });

    socket.on("callAccepted", (signal) => {
      stopCallSounds();
      const { peer, callTimeoutId } = get();
      if (callTimeoutId) {
        clearTimeout(callTimeoutId);
      }

      set({ callAccepted: true, callStatus: "connected", callTimeoutId: null });

      // Start duration timer once connected
      get().startDurationTimer();

      if (peer && !peer.destroyed) {
        try {
          peer.signal(signal);
        } catch (e) {
          console.error("Error setting remote signal on accept:", e);
        }
      }
    });

    socket.on("callEnded", () => {
      stopCallSounds();
      get().leaveCall(false);
      toast("Call ended by the other user", { icon: "📞" });
    });

    socket.on("callRejected", () => {
      stopCallSounds();
      get().leaveCall(false);
      toast.error("Call was declined");
    });

    socket.on("userBusy", () => {
      stopCallSounds();
      get().leaveCall(false);
      toast.error("User is busy on another call");
    });

    socket.on("callFailed", (data) => {
      stopCallSounds();
      get().leaveCall(false);
      toast.error(data?.message || "User is unavailable");
    });
  },

  uninitializeSocketListeners: () => {
    const socket = useAuthStore.getState().socket;
    if (socket) {
      socket.off("incomingCall");
      socket.off("callAccepted");
      socket.off("callEnded");
      socket.off("callRejected");
      socket.off("userBusy");
      socket.off("callFailed");
    }
  },

  startDurationTimer: () => {
    const { timerIntervalId } = get();
    if (timerIntervalId) clearInterval(timerIntervalId);

    const interval = setInterval(() => {
      set((state) => ({ callDuration: state.callDuration + 1 }));
    }, 1000);

    set({ timerIntervalId: interval });
  },

  startLocalStream: async (type = "video") => {
    try {
      const isVoice = type === "voice";
      const constraints = {
        audio: true,
        video: isVoice
          ? false
          : {
              facingMode: "user",
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
      };

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (videoError) {
        if (!isVoice) {
          console.warn("High constraints failed, falling back to basic video+audio", videoError);
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } else {
          throw videoError;
        }
      }

      set({
        localStream: stream,
        callType: type,
        isMicMuted: false,
        isCameraOff: isVoice,
        facingMode: "user",
      });
      return stream;
    } catch (error) {
      console.error("Media devices access error:", error);
      toast.error(
        type === "voice"
          ? "Microphone access denied or unavailable"
          : "Camera / Microphone access denied or unavailable"
      );
      return null;
    }
  },

  callUser: async (userToCall, type = "video") => {
    const authUser = useAuthStore.getState().authUser;
    const socket = useAuthStore.getState().socket;

    if (!socket || !socket.connected) {
      toast.error("Not connected to real-time server");
      return;
    }

    // Clean up any lingering call state
    get().leaveCall(false);

    set({
      callActive: true,
      callAccepted: false,
      callEnded: false,
      caller: userToCall._id,
      targetUser: userToCall,
      callType: type,
      isCaller: true,
      callStatus: "calling",
      callDuration: 0,
      isMicMuted: false,
      isCameraOff: type === "voice",
    });

    const stream = await get().startLocalStream(type);
    if (!stream) {
      get().leaveCall(false);
      return;
    }

    playOutgoingRingback();

    let peer;
    try {
      peer = new Peer({
        initiator: true,
        trickle: false,
        stream: stream,
        config: {
          iceServers: ICE_SERVERS,
        },
      });
    } catch (err) {
      console.error("Peer creation error:", err);
      toast.error("WebRTC connection failed to initialize");
      get().leaveCall(false);
      return;
    }

    let hasSentOffer = false;
    peer.on("signal", (data) => {
      if (!hasSentOffer) {
        hasSentOffer = true;
        socket.emit("callUser", {
          userToCall: userToCall._id,
          signalData: data,
          from: authUser._id,
          name: authUser.fullName,
          avatar: authUser.profilePic,
          callType: type,
        });
        set({ callStatus: "ringing" });
      }
    });

    peer.on("stream", (currentStream) => {
      stopCallSounds();
      set({ remoteStream: currentStream, callStatus: "connected" });
      get().startDurationTimer();
    });

    peer.on("error", (err) => {
      console.warn("Peer connection warning/error:", err);
    });

    peer.on("close", () => {
      console.log("Peer connection closed");
    });

    // 45s ringing timeout
    const timeoutId = setTimeout(() => {
      if (!get().callAccepted && get().callActive) {
        toast.error("No answer");
        get().leaveCall(true);
      }
    }, 45000);

    set({ peer, callTimeoutId: timeoutId });
  },

  answerCall: async () => {
    stopCallSounds();
    const { callerSignal, caller, callType } = get();
    const socket = useAuthStore.getState().socket;

    if (!socket || !callerSignal) return;

    set({
      callAccepted: true,
      callActive: true,
      receivingCall: false,
      callStatus: "connecting",
      callDuration: 0,
    });

    const stream = await get().startLocalStream(callType || "video");
    if (!stream) {
      get().leaveCall(true);
      return;
    }

    let peer;
    try {
      peer = new Peer({
        initiator: false,
        trickle: false,
        stream: stream,
        config: {
          iceServers: ICE_SERVERS,
        },
      });
    } catch (err) {
      console.error("Receiver peer creation error:", err);
      toast.error("Failed to answer call");
      get().leaveCall(true);
      return;
    }

    let hasSentAnswer = false;
    peer.on("signal", (data) => {
      if (!hasSentAnswer) {
        hasSentAnswer = true;
        socket.emit("answerCall", { signal: data, to: caller });
      }
    });

    peer.on("stream", (currentStream) => {
      set({ remoteStream: currentStream, callStatus: "connected" });
      get().startDurationTimer();
    });

    peer.on("error", (err) => {
      console.warn("Receiver peer error:", err);
    });

    try {
      peer.signal(callerSignal);
    } catch (err) {
      console.error("Signal error on answer:", err);
    }

    set({ peer });
  },

  rejectCall: () => {
    stopCallSounds();
    const { caller } = get();
    const socket = useAuthStore.getState().socket;

    if (socket && caller) {
      socket.emit("rejectCall", { to: caller });
    }

    set({
      receivingCall: false,
      caller: null,
      callerName: "",
      callerAvatar: "",
      callerSignal: null,
      targetUser: null,
      callStatus: "idle",
    });
  },

  leaveCall: (emitEvent = true) => {
    stopCallSounds();
    const { peer, localStream, caller, callActive, callTimeoutId, timerIntervalId } = get();
    const socket = useAuthStore.getState().socket;

    if (callTimeoutId) {
      clearTimeout(callTimeoutId);
    }
    if (timerIntervalId) {
      clearInterval(timerIntervalId);
    }

    if (emitEvent && callActive && socket && caller) {
      socket.emit("endCall", { to: caller });
    }

    if (peer) {
      try {
        peer.destroy();
      } catch (e) {
        console.warn("Peer destroy error:", e);
      }
    }

    if (localStream) {
      try {
        localStream.getTracks().forEach((track) => track.stop());
      } catch (e) {
        console.warn("Stream cleanup error:", e);
      }
    }

    playEndCallTone();

    set({
      localStream: null,
      remoteStream: null,
      receivingCall: false,
      caller: null,
      callerName: "",
      callerAvatar: "",
      callerSignal: null,
      targetUser: null,
      callAccepted: false,
      callEnded: true,
      callActive: false,
      callStatus: "idle",
      peer: null,
      isMicMuted: false,
      isCameraOff: false,
      facingMode: "user",
      callDuration: 0,
      callTimeoutId: null,
      timerIntervalId: null,
    });

    setTimeout(() => {
      set({ callEnded: false });
    }, 1500);
  },

  toggleMic: () => {
    const { localStream, isMicMuted } = get();
    if (!localStream) return;
    const audioTracks = localStream.getAudioTracks();
    const newMutedState = !isMicMuted;
    audioTracks.forEach((track) => {
      track.enabled = !newMutedState;
    });
    set({ isMicMuted: newMutedState });
  },

  toggleCamera: async () => {
    const { localStream, isCameraOff, peer } = get();

    // If stream already has video tracks (e.g. video call)
    if (localStream && localStream.getVideoTracks().length > 0) {
      const videoTracks = localStream.getVideoTracks();
      const newCameraOffState = !isCameraOff;
      videoTracks.forEach((track) => {
        track.enabled = !newCameraOffState;
      });
      set({ isCameraOff: newCameraOffState });
      return;
    }

    // Voice call upgrade: add a video track dynamically
    if (localStream && localStream.getVideoTracks().length === 0) {
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
        });
        const videoTrack = videoStream.getVideoTracks()[0];
        if (videoTrack) {
          localStream.addTrack(videoTrack);
          if (peer && !peer.destroyed && typeof peer.addTrack === "function") {
            try {
              peer.addTrack(videoTrack, localStream);
            } catch (e) {
              console.warn("Peer addTrack warning:", e);
            }
          }
          set({
            localStream: new MediaStream(localStream.getTracks()),
            isCameraOff: false,
            callType: "video",
          });
          toast.success("Camera turned on");
        }
      } catch (err) {
        console.error("Camera activation error:", err);
        toast.error("Could not turn on camera");
      }
    }
  },

  switchCamera: async () => {
    const { localStream, peer, isCameraOff, facingMode } = get();
    if (!localStream || isCameraOff) return;
    const currentVideoTrack = localStream.getVideoTracks()[0];
    if (!currentVideoTrack) return;

    const newFacingMode = facingMode === "user" ? "environment" : "user";

    try {
      let newStream;
      try {
        newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: newFacingMode } },
          audio: false,
        });
      } catch {
        newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: newFacingMode },
          audio: false,
        });
      }

      const newVideoTrack = newStream.getVideoTracks()[0];
      if (newVideoTrack) {
        if (peer && !peer.destroyed && typeof peer.replaceTrack === "function") {
          peer.replaceTrack(currentVideoTrack, newVideoTrack, localStream);
        }
        localStream.removeTrack(currentVideoTrack);
        currentVideoTrack.stop();
        localStream.addTrack(newVideoTrack);

        set({
          localStream: new MediaStream(localStream.getTracks()),
          facingMode: newFacingMode,
        });
      }
    } catch (err) {
      console.warn("Could not switch camera:", err);
    }
  },
}));
