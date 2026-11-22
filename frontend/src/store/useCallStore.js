import { create } from "zustand";
import {
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  createLocalTracks,
} from "livekit-client";
import toast from "react-hot-toast";
import { useAuthStore } from "./useAuthStore";
import { axiosInstanace } from "../lib/axios";
import {
  playIncomingRingtone,
  playOutgoingRingback,
  playEndCallTone,
  stopCallSounds,
} from "../lib/callSounds";

// Tuned for ultra-low-latency 1-on-1 voice & video calling
function createOptimizedRoom() {
  return new Room({
    adaptiveStream: false, // Skip ResizeObserver 180p->HD ramp-up delay
    dynacast: false, // Stream video immediately for 1-on-1 calls
    videoCaptureDefaults: {
      resolution: VideoPresets.h540.resolution,
      facingMode: "user",
    },
    publishDefaults: {
      simulcast: false, // Single stream = 3x lower CPU & encoding latency on 1-on-1
      dtx: true, // Discord-style silence suppression (Discontinuous Transmission)
      red: true, // Redundant audio packet recovery for lossy mobile networks
      videoCodec: "vp8",
      videoEncoding: {
        maxBitrate: 900_000,
        maxFramerate: 30,
      },
    },
  });
}

export const useCallStore = create((set, get) => ({
  room: null,
  roomName: null,
  preparedCall: null, // { roomName, token, url, room }
  pendingTracks: [],
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

      if (roomName && data.roomName && roomName === data.roomName) {
        return;
      }

      if (callActive && caller && caller.toString() !== data.from?.toString()) {
        socket.emit("userBusy", { to: data.from });
        return;
      }

      playIncomingRingtone();

      // Immediately pre-warm LiveKit Cloud region, DNS & TLS while ringing!
      let preparedCall = null;
      if (data.token && data.url && data.roomName) {
        const preparedRoom = createOptimizedRoom();
        preparedRoom.prepareConnection(data.url, data.token).catch(() => {});
        preparedCall = {
          roomName: data.roomName,
          token: data.token,
          url: data.url,
          room: preparedRoom,
        };
      }

      set({
        receivingCall: true,
        roomName: data.roomName,
        preparedCall,
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

      // Fallback pre-fetch only if socket payload did not include token
      if (!preparedCall && data.roomName) {
        axiosInstanace
          .get("/livekit/token", { params: { roomName: data.roomName } })
          .then((res) => {
            if (get().roomName === data.roomName && get().receivingCall) {
              const preparedRoom = createOptimizedRoom();
              preparedRoom
                .prepareConnection(res.data.url, res.data.token)
                .catch(() => {});
              set({
                preparedCall: {
                  roomName: data.roomName,
                  token: res.data.token,
                  url: res.data.url,
                  room: preparedRoom,
                },
              });
            }
          })
          .catch(() => {});
      }
    });

    socket.on("callAccepted", () => {
      stopCallSounds();
      const { callTimeoutId } = get();
      if (callTimeoutId) {
        clearTimeout(callTimeoutId);
      }
      set({ callAccepted: true, callStatus: "connected", callTimeoutId: null });
      get().startDurationTimer();
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
          preparedCall: null,
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
    if (timerIntervalId) return;

    const interval = setInterval(() => {
      set((state) => ({ callDuration: state.callDuration + 1 }));
    }, 1000);

    set({ timerIntervalId: interval });
  },

  connectToLiveKitRoom: async (roomName, callType, authPromise = null) => {
    const isVideo = callType === "video";

    // Task A: Start local mic + camera capture IMMEDIATELY (don't wait for network)
    const captureMediaPromise = (async () => {
      let tracks = [];
      try {
        tracks = await createLocalTracks({
          audio: true,
          video: isVideo
            ? {
                facingMode: "user",
                resolution: VideoPresets.h540.resolution,
              }
            : false,
        });
      } catch (err) {
        if (isVideo) {
          console.warn("Video+Audio capture failed, falling back to audio only:", err);
          try {
            tracks = await createLocalTracks({ audio: true, video: false });
            set({ isCameraOff: true });
            toast.error("Could not access camera — continuing with audio only");
          } catch (audioErr) {
            console.error("Audio capture failed:", audioErr);
            set({ isMicMuted: true, isCameraOff: true });
            toast.error("Could not access microphone");
            return [];
          }
        } else {
          console.error("Audio capture failed:", err);
          set({ isMicMuted: true });
          toast.error("Could not access microphone");
          return [];
        }
      }

      if (!get().callActive || get().roomName !== roomName) {
        tracks.forEach((t) => t.stop());
        return [];
      }

      const videoTrack = tracks.find((t) => t.kind === Track.Kind.Video) || null;
      set({
        pendingTracks: tracks,
        localVideoTrack: videoTrack,
        isCameraOff: !videoTrack,
        isMicMuted: !tracks.some((t) => t.kind === Track.Kind.Audio),
      });

      return tracks;
    })();

    // Task B: Resolve token (from Socket ack / pre-warmed cache / HTTP fallback) & connect SFU
    const connectRoomPromise = (async () => {
      let token;
      let url;
      let room;

      const prepared = get().preparedCall;
      if (prepared && prepared.roomName === roomName) {
        token = prepared.token;
        url = prepared.url;
        room = prepared.room;
        set({ preparedCall: null });
      } else if (authPromise) {
        const ackAuth = await authPromise;
        if (ackAuth?.token && ackAuth?.url) {
          token = ackAuth.token;
          url = ackAuth.url;
        }
      }

      if (!token || !url) {
        const res = await axiosInstanace.get("/livekit/token", {
          params: { roomName },
        });
        token = res.data.token;
        url = res.data.url;
      }

      if (!get().callActive || get().roomName !== roomName) {
        return null;
      }

      if (!room) {
        room = createOptimizedRoom();
      }

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

      room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);

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
        if (room.remoteParticipants.size === 0 && get().callActive) {
          get().leaveCall(false);
          toast("Call ended", { icon: "📞" });
        }
      });

      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        set({ audioBlocked: !room.canPlaybackAudio });
      });

      room.on(RoomEvent.Disconnected, () => {
        if (get().room === room && get().callActive) {
          get().leaveCall(false);
        }
      });

      await room.connect(url, token);

      if (!get().callActive || get().roomName !== roomName) {
        room.removeAllListeners();
        room.disconnect(true);
        return null;
      }

      try {
        await room.startAudio();
      } catch {
        // Handled by AudioPlaybackStatusChanged
      }

      set({ room, audioBlocked: !room.canPlaybackAudio });

      // Subscribe immediately to anyone already in the room
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

      return room;
    })();

    const [room, tracks] = await Promise.all([
      connectRoomPromise,
      captureMediaPromise,
    ]);

    if (!room || !get().callActive || get().roomName !== roomName) {
      tracks.forEach((t) => t.stop());
      return null;
    }

    // Publish audio & video tracks in parallel with low-latency settings
    await Promise.allSettled(
      tracks.map((track) =>
        room.localParticipant.publishTrack(track, {
          source:
            track.kind === Track.Kind.Video
              ? Track.Source.Camera
              : Track.Source.Microphone,
          simulcast: false,
        })
      )
    );

    set({ pendingTracks: [] });
    return room;
  },

  callUser: async (userToCall, type = "video") => {
    const authUser = useAuthStore.getState().authUser;
    const socket = useAuthStore.getState().socket;

    if (!socket || !socket.connected || !authUser) {
      toast.error("Not connected to server");
      return;
    }

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
      callStatus: "ringing",
      callDuration: 0,
      isMicMuted: false,
      isCameraOff: type === "voice",
      remoteVideoTrack: null,
      remoteAudioTrack: null,
      remoteVideoMuted: false,
      remoteAudioMuted: false,
    });

    playOutgoingRingback();

    // Emit callUser immediately AND get caller's LiveKit token back in the same WebSocket frame (zero DB/HTTP!)
    const socketAuthPromise = new Promise((resolve) => {
      const fallbackTimer = setTimeout(() => resolve(null), 3000);
      socket.emit(
        "callUser",
        {
          userToCall: userToCall._id,
          roomName,
          from: authUser._id,
          name: authUser.fullName,
          avatar: authUser.profilePic,
          callType: type,
          receiverName: userToCall.fullName,
        },
        (ack) => {
          clearTimeout(fallbackTimer);
          if (ack && ack.ok && ack.token && ack.url) {
            resolve({ token: ack.token, url: ack.url });
          } else {
            resolve(null);
          }
        }
      );
    });

    const timeoutId = setTimeout(() => {
      if (!get().callAccepted && get().callActive && get().roomName === roomName) {
        toast.error("No answer");
        get().leaveCall(true);
      }
    }, 45000);

    set({ callTimeoutId: timeoutId });

    try {
      await get().connectToLiveKitRoom(roomName, type, socketAuthPromise);
    } catch (error) {
      console.error("Failed to start LiveKit call:", error);
      if (get().callActive && get().roomName === roomName) {
        toast.error(error?.response?.data?.message || "Failed to connect call");
        get().leaveCall(true);
      }
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
      callStatus: "connected",
      callDuration: 0,
      isCaller: false,
    });

    socket.emit("answerCall", { to: caller, roomName });
    get().startDurationTimer();

    try {
      await get().connectToLiveKitRoom(roomName, callType || "video");
    } catch (error) {
      console.error("Failed to join LiveKit room:", error);
      if (get().callActive && get().roomName === roomName) {
        toast.error("Failed to connect to call");
        get().leaveCall(true);
      }
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
      preparedCall: null,
      caller: null,
      callerName: "",
      callerAvatar: "",
      targetUser: null,
      callStatus: "idle",
    });
  },

  leaveCall: (emitEvent = true) => {
    stopCallSounds();
    const {
      room,
      pendingTracks,
      localVideoTrack,
      caller,
      callActive,
      callTimeoutId,
      timerIntervalId,
    } = get();
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

    set({
      room: null,
      roomName: null,
      preparedCall: null,
      pendingTracks: [],
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

    if (pendingTracks && pendingTracks.length > 0) {
      pendingTracks.forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
    } else if (localVideoTrack && !room) {
      try {
        localVideoTrack.stop();
      } catch {
        // ignore
      }
    }

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
        resolution: VideoPresets.h540.resolution,
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
