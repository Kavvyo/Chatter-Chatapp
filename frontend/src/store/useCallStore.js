import { create } from "zustand";
import { Room, RoomEvent, Track, VideoPresets } from "livekit-client";
import toast from "react-hot-toast";
import { useAuthStore } from "./useAuthStore";
import { axiosInstanace } from "../lib/axios";
import {
  playIncomingRingtone,
  playOutgoingRingback,
  playEndCallTone,
  stopCallSounds,
} from "../lib/callSounds";

export const useCallStore = create((set, get) => ({
  room: null,
  roomName: null,
  localVideoTrack: null,
  remoteVideoTrack: null,
  remoteAudioTrack: null,
  remoteVideoMuted: false,
  remoteAudioMuted: false,
  audioBlocked: false,

  receivingCall: false,
  caller: null,
  callerName: "",
  callerAvatar: "",
  callAccepted: false,
  callEnded: false,
  callActive: false,
  callType: "video", // "voice" | "video"
  targetUser: null,
  isCaller: false,
  isMicMuted: false,
  isCameraOff: false,
  facingMode: "user",
  callStatus: "idle", // "idle" | "calling" | "ringing" | "connecting" | "connected" | "ended"
  callDuration: 0,
  callTimeoutId: null,
  timerIntervalId: null,

  initializeSocketListeners: (socketInstance) => {
    const socket = socketInstance || useAuthStore.getState().socket;
    if (!socket) return;

    socket.off("incomingCall");
    socket.off("callAccepted");
    socket.off("callEnded");
    socket.off("callRejected");
    socket.off("userBusy");
    socket.off("callFailed");
    socket.off("callHandledElsewhere");

    socket.on("incomingCall", (data) => {
      const { callActive, caller, roomName } = get();

      // Ignore duplicate notification for the same room/call
      if (roomName && data.roomName && roomName === data.roomName) {
        return;
      }

      // Report busy only if user is actively on a call with someone else
      if (callActive && caller && caller.toString() !== data.from?.toString()) {
        socket.emit("userBusy", { to: data.from });
        return;
      }

      playIncomingRingtone();

      set({
        receivingCall: true,
        roomName: data.roomName,
        caller: data.from,
        callerName: data.name || "Unknown caller",
        callerAvatar: data.avatar || "/avatar.png",
        callType: data.callType || "video",
        targetUser: {
          _id: data.from,
          fullName: data.name || "Unknown caller",
          profilePic: data.avatar || "/avatar.png",
        },
        callStatus: "ringing",
      });
    });

    socket.on("callAccepted", () => {
      stopCallSounds();
      const { callTimeoutId } = get();
      if (callTimeoutId) {
        clearTimeout(callTimeoutId);
      }
      set({ callAccepted: true, callStatus: "connecting", callTimeoutId: null });
    });

    socket.on("callEnded", () => {
      const { callActive, receivingCall } = get();
      if (!callActive && !receivingCall) return;
      stopCallSounds();
      get().leaveCall(false);
      toast("Call ended", { icon: "📞" });
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

    socket.on("callHandledElsewhere", () => {
      const { receivingCall, callActive } = get();
      if (receivingCall && !callActive) {
        stopCallSounds();
        set({
          receivingCall: false,
          roomName: null,
          caller: null,
          callerName: "",
          callerAvatar: "",
          targetUser: null,
          callStatus: "idle",
        });
      }
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
      socket.off("callHandledElsewhere");
    }
  },

  startDurationTimer: () => {
    const { timerIntervalId } = get();
    if (timerIntervalId) return; // Already running

    const interval = setInterval(() => {
      set((state) => ({ callDuration: state.callDuration + 1 }));
    }, 1000);

    set({ timerIntervalId: interval });
  },

  connectToLiveKitRoom: async (roomName, callType) => {
    // Request JWT token from backend
    const res = await axiosInstanace.get("/livekit/token", {
      params: { roomName },
    });
    const { token, url } = res.data;

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: VideoPresets.h720.resolution,
        facingMode: "user",
      },
    });

    // Helper to sync remote tracks
    const handleTrackSubscribed = (track) => {
      stopCallSounds();
      const { callTimeoutId } = get();
      if (callTimeoutId) clearTimeout(callTimeoutId);

      if (track.kind === Track.Kind.Video) {
        set({
          remoteVideoTrack: track,
          remoteVideoMuted: track.isMuted,
          callType: "video",
          callStatus: "connected",
          callAccepted: true,
          callTimeoutId: null,
        });
      } else if (track.kind === Track.Kind.Audio) {
        set({
          remoteAudioTrack: track,
          remoteAudioMuted: track.isMuted,
          callStatus: "connected",
          callAccepted: true,
          callTimeoutId: null,
        });
      }
      get().startDurationTimer();
    };

    room.on(RoomEvent.TrackSubscribed, (track) => {
      handleTrackSubscribed(track);
    });

    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      if (track.kind === Track.Kind.Video) {
        set({ remoteVideoTrack: null });
      } else if (track.kind === Track.Kind.Audio) {
        set({ remoteAudioTrack: null });
      }
    });

    room.on(RoomEvent.TrackMuted, (publication, participant) => {
      if (!participant.isLocal) {
        if (publication.kind === Track.Kind.Video) {
          set({ remoteVideoMuted: true });
        } else if (publication.kind === Track.Kind.Audio) {
          set({ remoteAudioMuted: true });
        }
      }
    });

    room.on(RoomEvent.TrackUnmuted, (publication, participant) => {
      if (!participant.isLocal) {
        if (publication.kind === Track.Kind.Video) {
          set({ remoteVideoMuted: false, callType: "video" });
        } else if (publication.kind === Track.Kind.Audio) {
          set({ remoteAudioMuted: false });
        }
      }
    });

    room.on(RoomEvent.LocalTrackPublished, (publication) => {
      if (publication.kind === Track.Kind.Video && publication.track) {
        set({ localVideoTrack: publication.track, isCameraOff: false });
      }
    });

    room.on(RoomEvent.LocalTrackUnpublished, (publication) => {
      if (publication.kind === Track.Kind.Video) {
        set({ localVideoTrack: null, isCameraOff: true });
      }
    });

    room.on(RoomEvent.ParticipantConnected, () => {
      stopCallSounds();
      const { callTimeoutId } = get();
      if (callTimeoutId) clearTimeout(callTimeoutId);
      set({ callStatus: "connected", callAccepted: true, callTimeoutId: null });
      get().startDurationTimer();
    });

    room.on(RoomEvent.ParticipantDisconnected, () => {
      // In a 1-on-1 call, if the other participant leaves the room, end the call cleanly
      if (room.remoteParticipants.size === 0 && get().callActive) {
        get().leaveCall(false);
        toast("Call ended", { icon: "📞" });
      }
    });

    room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      set({ audioBlocked: !room.canPlaybackAudio });
    });

    room.on(RoomEvent.Disconnected, () => {
      // Only trigger cleanup if this room is still the active room
      if (get().room === room && get().callActive) {
        get().leaveCall(false);
      }
    });

    // Connect to LiveKit SFU
    await room.connect(url, token);

    // Ensure audio playback is unlocked on mobile browsers
    try {
      await room.startAudio();
    } catch {
      // Handled by AudioPlaybackStatusChanged if blocked
    }
    set({ room, audioBlocked: !room.canPlaybackAudio });

    // Check if the other participant is already in the room (e.g., receiver joining caller's room)
    if (room.remoteParticipants.size > 0) {
      stopCallSounds();
      set({ callStatus: "connected", callAccepted: true });
      get().startDurationTimer();

      room.remoteParticipants.forEach((participant) => {
        participant.trackPublications.forEach((pub) => {
          if (pub.isSubscribed && pub.track) {
            handleTrackSubscribed(pub.track);
          }
        });
      });
    }

    // Enable Microphone
    try {
      await room.localParticipant.setMicrophoneEnabled(true);
      set({ isMicMuted: false });
    } catch (err) {
      console.error("Microphone permission error:", err);
      set({ isMicMuted: true });
      toast.error("Could not access microphone");
    }

    // Enable Camera only if video call
    if (callType === "video") {
      try {
        await room.localParticipant.setCameraEnabled(true);
        const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
        set({
          localVideoTrack: camPub?.track || null,
          isCameraOff: false,
        });
      } catch (err) {
        console.error("Camera permission error:", err);
        set({ isCameraOff: true });
        toast.error("Could not access camera — continuing with audio only");
      }
    } else {
      set({ isCameraOff: true, localVideoTrack: null });
    }

    return room;
  },

  callUser: async (userToCall, type = "video") => {
    const authUser = useAuthStore.getState().authUser;
    const socket = useAuthStore.getState().socket;

    if (!socket || !socket.connected || !authUser) {
      toast.error("Not connected to server");
      return;
    }

    // Clean up any lingering call state
    if (get().callActive || get().room) {
      get().leaveCall(false);
    }

    const roomName = `call_${authUser._id}_${userToCall._id}_${Date.now()}`;

    set({
      callActive: true,
      callAccepted: false,
      callEnded: false,
      roomName,
      caller: userToCall._id,
      targetUser: userToCall,
      callType: type,
      isCaller: true,
      callStatus: "calling",
      callDuration: 0,
      isMicMuted: false,
      isCameraOff: type === "voice",
      remoteVideoTrack: null,
      remoteAudioTrack: null,
      remoteVideoMuted: false,
      remoteAudioMuted: false,
    });

    try {
      // Connect to LiveKit SFU room first so caller's media is immediately ready when receiver answers
      await get().connectToLiveKitRoom(roomName, type);

      // Guard in case user hung up while connecting
      if (!get().callActive || get().roomName !== roomName) {
        return;
      }

      playOutgoingRingback();

      socket.emit("callUser", {
        userToCall: userToCall._id,
        roomName,
        from: authUser._id,
        name: authUser.fullName,
        avatar: authUser.profilePic,
        callType: type,
      });

      set({ callStatus: "ringing" });

      // 45s no-answer timeout
      const timeoutId = setTimeout(() => {
        if (!get().callAccepted && get().callActive && get().roomName === roomName) {
          toast.error("No answer");
          get().leaveCall(true);
        }
      }, 45000);

      set({ callTimeoutId: timeoutId });
    } catch (error) {
      console.error("Failed to start LiveKit call:", error);
      toast.error(error?.response?.data?.message || "Failed to connect call");
      get().leaveCall(false);
    }
  },

  answerCall: async () => {
    stopCallSounds();
    const { roomName, caller, callType } = get();
    const socket = useAuthStore.getState().socket;

    if (!socket || !roomName) return;

    set({
      callAccepted: true,
      callActive: true,
      receivingCall: false,
      callStatus: "connecting",
      callDuration: 0,
      isCaller: false,
    });

    socket.emit("answerCall", { to: caller, roomName });

    try {
      await get().connectToLiveKitRoom(roomName, callType || "video");
    } catch (error) {
      console.error("Failed to join LiveKit room:", error);
      toast.error("Failed to connect to call");
      get().leaveCall(true);
    }
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
      roomName: null,
      caller: null,
      callerName: "",
      callerAvatar: "",
      targetUser: null,
      callStatus: "idle",
    });
  },

  leaveCall: (emitEvent = true) => {
    stopCallSounds();
    const { room, caller, callActive, callTimeoutId, timerIntervalId } = get();
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

    // Reset state before calling room.disconnect() so Disconnected event handler doesn't re-enter
    set({
      room: null,
      roomName: null,
      localVideoTrack: null,
      remoteVideoTrack: null,
      remoteAudioTrack: null,
      remoteVideoMuted: false,
      remoteAudioMuted: false,
      audioBlocked: false,
      receivingCall: false,
      caller: null,
      callerName: "",
      callerAvatar: "",
      targetUser: null,
      callAccepted: false,
      callEnded: true,
      callActive: false,
      callStatus: "idle",
      isMicMuted: false,
      isCameraOff: false,
      facingMode: "user",
      callDuration: 0,
      callTimeoutId: null,
      timerIntervalId: null,
    });

    if (room) {
      try {
        room.removeAllListeners();
        room.disconnect(true);
      } catch (e) {
        console.warn("LiveKit disconnect warning:", e);
      }
    }

    if (callActive) {
      playEndCallTone();
    }

    setTimeout(() => {
      set({ callEnded: false });
    }, 1500);
  },

  toggleMic: async () => {
    const { room, isMicMuted } = get();
    if (!room) return;
    const nextMuted = !isMicMuted;
    try {
      await room.localParticipant.setMicrophoneEnabled(!nextMuted);
      set({ isMicMuted: nextMuted });
    } catch (err) {
      console.error("Error toggling microphone:", err);
      toast.error("Could not toggle microphone");
    }
  },

  toggleCamera: async () => {
    const { room, isCameraOff } = get();
    if (!room) return;
    const nextCameraOff = !isCameraOff;
    try {
      await room.localParticipant.setCameraEnabled(!nextCameraOff);
      const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      set((state) => ({
        isCameraOff: nextCameraOff,
        localVideoTrack: nextCameraOff ? null : camPub?.track || null,
        // Upgrade UI to video mode if turning camera on during a voice call
        callType: !nextCameraOff ? "video" : state.callType,
      }));
    } catch (err) {
      console.error("Error toggling camera:", err);
      toast.error("Could not access camera");
    }
  },

  switchCamera: async () => {
    const { localVideoTrack, isCameraOff, facingMode } = get();
    if (!localVideoTrack || isCameraOff) return;

    const newFacingMode = facingMode === "user" ? "environment" : "user";
    try {
      await localVideoTrack.restartTrack({
        facingMode: newFacingMode,
        resolution: VideoPresets.h720.resolution,
      });
      set({ facingMode: newFacingMode });
    } catch (err) {
      console.warn("Could not switch camera:", err);
      toast.error("No secondary camera available");
    }
  },

  unlockAudio: async () => {
    const { room } = get();
    if (!room) return;
    try {
      await room.startAudio();
      set({ audioBlocked: !room.canPlaybackAudio });
    } catch (err) {
      console.warn("Audio unlock failed:", err);
    }
  },
}));
