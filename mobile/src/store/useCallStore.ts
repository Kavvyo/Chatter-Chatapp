import { AppState, Linking } from 'react-native';
import { create } from 'zustand';
import { Socket } from 'socket.io-client';
import { useAuthStore } from './useAuthStore';
import { useToastStore } from './useToastStore';
import { playRingtone, stopCallSounds } from '../lib/sound';
import { requestCallPermissions, type CallPermissionResult } from '../lib/permissions';
import { axiosInstance } from '../lib/axios';
import {
  startCallAudio,
  setSpeakerphoneOn,
  setProximityEnabled,
  stopCallAudio,
} from '../lib/callAudio';
import {
  presentIncomingCallLocalNotification,
  dismissIncomingCallNotifications,
} from '../lib/notifications';
import type { BridgeOutgoingMessage } from '../lib/callBridgeHtml';

export interface CallTargetUser {
  _id: string;
  fullName: string;
  profilePic?: string;
}

export type BridgeCommand =
  | { type: 'SET_MIC'; muted: boolean }
  | { type: 'SET_CAMERA'; enabled: boolean }
  | { type: 'SWITCH_CAMERA'; facingMode: 'user' | 'environment' }
  | { type: 'SET_SWAPPED'; swapped: boolean }
  | { type: 'SET_MINIMIZED'; minimized: boolean }
  | { type: 'SET_CONTROLS_VISIBLE'; visible: boolean }
  | { type: 'DISCONNECT' };

function showPermissionAlert(perm: CallPermissionResult, actionLabel: string) {
  const buttons: { text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }[] = [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Open Settings',
      style: 'default',
      onPress: () => {
        Linking.openSettings().catch(() => {});
      },
    },
  ];

  useToastStore.getState().showAlert(
    'Permission Required',
    `${perm.missing.join(' and ')} permission is required to ${actionLabel}. Please allow it in App Settings.`,
    perm.neverAskAgain ? buttons : [{ text: 'OK', style: 'default' }]
  );
}

interface CallState {
  roomName: string | null;
  preparedToken: string | null;
  preparedUrl: string | null;
  remoteHasVideo: boolean;
  remoteVideoMuted: boolean;
  remoteAudioMuted: boolean;
  audioBlocked: boolean;
  receivingCall: boolean;
  caller: string | null;
  callerName: string;
  callerAvatar: string;
  callAccepted: boolean;
  callEnded: boolean;
  callActive: boolean;
  callType: 'voice' | 'video';
  targetUser: CallTargetUser | null;
  isCaller: boolean;
  isMicMuted: boolean;
  isCameraOff: boolean;
  isSpeakerOn: boolean;
  isMinimized: boolean;
  isSwapped: boolean;
  controlsVisible: boolean;
  facingMode: 'user' | 'environment';
  callStatus: 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended';
  callDuration: number;
  callTimeoutId: any;
  timerIntervalId: any;
  pendingDeclineCallerId: string | null;
  bridgeCommandHandler: ((cmd: BridgeCommand) => void) | null;

  initializeSocketListeners: (socketInstance?: Socket | null) => void;
  uninitializeSocketListeners: () => void;
  startDurationTimer: () => void;
  registerBridgeCommandHandler: (handler: ((cmd: BridgeCommand) => void) | null) => void;
  handleBridgeEvent: (msg: BridgeOutgoingMessage) => void;
  resolveCallCredentials: (
    roomName: string,
    tokenOverride?: string | null,
    urlOverride?: string | null
  ) => Promise<{ token: string; url: string } | null>;
  callUser: (userToCall: CallTargetUser, type?: 'voice' | 'video') => Promise<void>;
  receivePushCall: (data: any, autoAccept?: boolean) => Promise<void>;
  answerCall: () => Promise<void>;
  rejectCall: (callerIdOverride?: string | null) => void;
  leaveCall: (emitEvent?: boolean) => void;
  toggleMic: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleSpeaker: () => void;
  toggleSwap: () => void;
  setMinimized: (minimized: boolean) => void;
  setControlsVisible: (visible: boolean) => void;
  switchCamera: () => Promise<void>;
}

export const useCallStore = create<CallState>((set, get) => ({
  roomName: null,
  preparedToken: null,
  preparedUrl: null,
  remoteHasVideo: false,
  remoteVideoMuted: false,
  remoteAudioMuted: false,
  audioBlocked: false,
  receivingCall: false,
  caller: null,
  callerName: '',
  callerAvatar: '',
  callAccepted: false,
  callEnded: false,
  callActive: false,
  callType: 'video',
  targetUser: null,
  isCaller: false,
  isMicMuted: false,
  isCameraOff: false,
  isSpeakerOn: true,
  isMinimized: false,
  isSwapped: false,
  controlsVisible: true,
  facingMode: 'user',
  callStatus: 'idle',
  callDuration: 0,
  callTimeoutId: null,
  timerIntervalId: null,
  pendingDeclineCallerId: null,
  bridgeCommandHandler: null,

  registerBridgeCommandHandler: (handler) => {
    set({ bridgeCommandHandler: handler });
  },

  handleBridgeEvent: (msg) => {
    switch (msg.type) {
      case 'PARTICIPANT_CONNECTED': {
        if (!get().callActive) return;
        stopCallSounds();
        const { callTimeoutId } = get();
        if (callTimeoutId) clearTimeout(callTimeoutId);
        set({
          callStatus: 'connected',
          callAccepted: true,
          callTimeoutId: null,
        });
        get().startDurationTimer();
        break;
      }

      case 'PARTICIPANT_DISCONNECTED': {
        if (get().callActive) {
          get().leaveCall(false);
          useToastStore.getState().showToast('Call ended', 'info');
        }
        break;
      }

      case 'ROOM_DISCONNECTED': {
        if (get().callActive) {
          get().leaveCall(false);
        }
        break;
      }

      case 'SWAP_CHANGED': {
        set({ isSwapped: msg.isSwapped });
        break;
      }

      case 'TOGGLE_CONTROLS': {
        set((state) => {
          const next = !state.controlsVisible;
          state.bridgeCommandHandler?.({ type: 'SET_CONTROLS_VISIBLE', visible: next });
          return { controlsVisible: next };
        });
        break;
      }

      case 'LOCAL_MEDIA_STATE': {
        const updates: Partial<CallState> = {};
        if (typeof msg.cameraOff === 'boolean') updates.isCameraOff = msg.cameraOff;
        if (typeof msg.micMuted === 'boolean') updates.isMicMuted = msg.micMuted;
        if (msg.facingMode) updates.facingMode = msg.facingMode;
        if (Object.keys(updates).length > 0) {
          set(updates);
        }
        break;
      }

      case 'REMOTE_VIDEO_STATE': {
        set((state) => {
          const upgradingToVideo = msg.hasVideo && !msg.muted && state.callType === 'voice';
          if (upgradingToVideo) {
            setSpeakerphoneOn(true);
            setProximityEnabled(false);
          }
          return {
            remoteHasVideo: msg.hasVideo,
            remoteVideoMuted: msg.muted,
            callType: msg.hasVideo && !msg.muted ? 'video' : state.callType,
            isSpeakerOn: upgradingToVideo ? true : state.isSpeakerOn,
          };
        });
        break;
      }

      case 'REMOTE_AUDIO_STATE': {
        set({ remoteAudioMuted: msg.muted });
        break;
      }

      case 'AUDIO_PLAYBACK_BLOCKED': {
        set({ audioBlocked: msg.blocked });
        break;
      }

      case 'ERROR': {
        if (msg.message) {
          useToastStore.getState().showToast(msg.message, 'error');
        }
        break;
      }

      case 'LOG': {
        console.log(`[CallBridge:${msg.level}]`, msg.message);
        break;
      }

      default:
        break;
    }
  },

  initializeSocketListeners: (socketInstance) => {
    const socket = socketInstance || useAuthStore.getState().socket;
    if (!socket) return;

    socket.off('incomingCall');
    socket.off('callAccepted');
    socket.off('callEnded');
    socket.off('callRejected');
    socket.off('userBusy');
    socket.off('callFailed');
    socket.off('callHandledElsewhere');

    socket.on('incomingCall', (data: any) => {
      const { callActive, caller, roomName } = get();

      if (roomName && data.roomName && roomName === data.roomName) {
        return;
      }

      if (callActive && caller && caller.toString() !== data.from?.toString()) {
        socket.emit('userBusy', { to: data.from });
        return;
      }

      playRingtone();

      if (AppState.currentState !== 'active') {
        presentIncomingCallLocalNotification(data);
      }

      set({
        receivingCall: true,
        roomName: data.roomName,
        preparedToken: data.token || null,
        preparedUrl: data.url || null,
        caller: data.from,
        callerName: data.name || 'Incoming Caller',
        callerAvatar: data.avatar || '',
        callType: data.callType || 'video',
        targetUser: {
          _id: data.from,
          fullName: data.name || 'Incoming Caller',
          profilePic: data.avatar || '',
        },
        callStatus: 'ringing',
      });
    });

    socket.on('callAccepted', () => {
      stopCallSounds();
      const { callTimeoutId, roomName, preparedToken, preparedUrl } = get();
      if (callTimeoutId) clearTimeout(callTimeoutId);
      set({ callAccepted: true, callStatus: 'connected', callTimeoutId: null });
      get().startDurationTimer();

      if (roomName && (!preparedToken || !preparedUrl)) {
        get().resolveCallCredentials(roomName);
      }
    });

    socket.on('callEnded', () => {
      const { callActive, receivingCall } = get();
      dismissIncomingCallNotifications();
      if (!callActive && !receivingCall) return;
      stopCallSounds();
      get().leaveCall(false);
      useToastStore.getState().showToast('Call ended', 'info');
    });

    socket.on('callRejected', () => {
      dismissIncomingCallNotifications();
      stopCallSounds();
      get().leaveCall(false);
      useToastStore.getState().showToast('Call was declined', 'info');
    });

    socket.on('userBusy', () => {
      stopCallSounds();
      get().leaveCall(false);
      useToastStore.getState().showToast('User is busy on another call', 'error');
    });

    socket.on('callFailed', (data: any) => {
      stopCallSounds();
      get().leaveCall(false);
      useToastStore.getState().showToast(data?.message || 'User is unavailable', 'error');
    });

    socket.on('callHandledElsewhere', () => {
      dismissIncomingCallNotifications();
      const { receivingCall, callActive } = get();
      if (receivingCall && !callActive) {
        stopCallSounds();
        set({
          receivingCall: false,
          roomName: null,
          preparedToken: null,
          preparedUrl: null,
          caller: null,
          callerName: '',
          callerAvatar: '',
          targetUser: null,
          callStatus: 'idle',
        });
      }
    });
  },

  uninitializeSocketListeners: () => {
    const socket = useAuthStore.getState().socket;
    if (socket) {
      socket.off('incomingCall');
      socket.off('callAccepted');
      socket.off('callEnded');
      socket.off('callRejected');
      socket.off('userBusy');
      socket.off('callFailed');
      socket.off('callHandledElsewhere');
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

  resolveCallCredentials: async (roomName, tokenOverride, urlOverride) => {
    let token = tokenOverride || get().preparedToken;
    let url = urlOverride || get().preparedUrl;

    if (!token || !url) {
      try {
        const res = await axiosInstance.get('/livekit/token', {
          params: { roomName },
        });
        token = res.data?.token || null;
        url = res.data?.url || null;
      } catch (err) {
        console.warn('Could not fetch LiveKit credentials from server:', err);
      }
    }

    if (!token || !url) return null;

    if (get().callActive && get().roomName === roomName) {
      set({ preparedToken: token, preparedUrl: url });
    }

    return { token, url };
  },

  callUser: async (userToCall, type = 'video') => {
    const authUser = useAuthStore.getState().authUser;
    const socket = useAuthStore.getState().socket;

    if (!socket || !authUser) return;

    // 1. Request required system permissions before mounting call bridge
    const perm = await requestCallPermissions(type);
    if (!perm.granted) {
      showPermissionAlert(perm, `start a ${type} call`);
      return;
    }

    if (get().callActive) {
      get().leaveCall(false);
    }

    const roomName = `call_${authUser._id}_${userToCall._id}_${Date.now()}`;
    const initialSpeaker = type === 'video';

    // Initialize Android audio communication routing & voice call proximity sensor
    startCallAudio(initialSpeaker, type === 'voice' && !initialSpeaker);

    set({
      callActive: true,
      callAccepted: false,
      callEnded: false,
      roomName,
      preparedToken: null,
      preparedUrl: null,
      caller: userToCall._id,
      targetUser: userToCall,
      callType: type,
      isCaller: true,
      callStatus: 'ringing',
      callDuration: 0,
      isMicMuted: false,
      isCameraOff: type === 'voice',
      isSpeakerOn: initialSpeaker,
      isMinimized: false,
      isSwapped: false,
      controlsVisible: true,
      facingMode: 'user',
      remoteHasVideo: false,
      remoteVideoMuted: false,
      remoteAudioMuted: false,
      audioBlocked: false,
    });

    // 2. Emit callUser to backend and retrieve caller's LiveKit token
    const socketAuthPromise = new Promise<{ token: string; url: string } | null>((resolve) => {
      const fallbackTimer = setTimeout(() => resolve(null), 3000);
      socket.emit(
        'callUser',
        {
          userToCall: userToCall._id,
          roomName,
          from: authUser._id,
          name: authUser.fullName,
          avatar: authUser.profilePic,
          callType: type,
          receiverName: userToCall.fullName,
        },
        (ack: any) => {
          clearTimeout(fallbackTimer);
          if (ack?.ok && ack?.token && ack?.url) {
            resolve({ token: ack.token, url: ack.url });
          } else {
            resolve(null);
          }
        }
      );
    });

    socketAuthPromise.then((auth) => {
      if (get().callActive && get().roomName === roomName) {
        get().resolveCallCredentials(roomName, auth?.token, auth?.url);
      }
    });

    const timeoutId = setTimeout(() => {
      if (!get().callAccepted && get().callActive && get().roomName === roomName) {
        useToastStore.getState().showToast('No answer', 'info');
        get().leaveCall(true);
      }
    }, 45000);

    set({ callTimeoutId: timeoutId });
  },

  receivePushCall: async (data, autoAccept = false) => {
    if (!data?.roomName || !data?.from) return;

    // Ignore stale call pushes older than 50s
    if (data.sentAt && Date.now() - Number(data.sentAt) > 50_000) {
      dismissIncomingCallNotifications();
      useToastStore.getState().showToast('Missed call from ' + (data.name || 'User'), 'info');
      return;
    }

    const { callActive, roomName } = get();
    if (callActive && roomName === data.roomName) {
      return;
    }

    set({
      receivingCall: !autoAccept,
      roomName: data.roomName,
      preparedToken: data.token || null,
      preparedUrl: data.url || null,
      caller: data.from,
      callerName: data.name || 'Incoming Caller',
      callerAvatar: data.avatar || '',
      callType: data.callType || 'video',
      targetUser: {
        _id: data.from,
        fullName: data.name || 'Incoming Caller',
        profilePic: data.avatar || '',
      },
      callStatus: 'ringing',
    });

    if (autoAccept) {
      await get().answerCall();
    } else {
      playRingtone();
    }
  },

  answerCall: async () => {
    stopCallSounds();
    dismissIncomingCallNotifications();

    const { roomName, caller, callType, preparedToken, preparedUrl } = get();
    if (!roomName) return;

    const socket = useAuthStore.getState().socket;

    // 1. Request required system permissions on incoming call accept
    const perm = await requestCallPermissions(callType);
    if (!perm.granted) {
      showPermissionAlert(perm, `join this ${callType} call`);
      return;
    }

    const initialSpeaker = callType === 'video';
    startCallAudio(initialSpeaker, callType === 'voice' && !initialSpeaker);

    set({
      callAccepted: true,
      callActive: true,
      receivingCall: false,
      callStatus: 'connected',
      callDuration: 0,
      isCaller: false,
      isMicMuted: false,
      isCameraOff: callType === 'voice',
      isSpeakerOn: initialSpeaker,
      isMinimized: false,
      isSwapped: false,
      controlsVisible: true,
      facingMode: 'user',
      remoteHasVideo: false,
      remoteVideoMuted: false,
      remoteAudioMuted: false,
      audioBlocked: false,
    });

    if (socket?.connected) {
      socket.emit('answerCall', { to: caller, roomName });
    } else if (socket) {
      socket.once('connect', () => {
        if (get().callActive && get().roomName === roomName) {
          socket.emit('answerCall', { to: caller, roomName });
        }
      });
    }

    get().startDurationTimer();

    // 2. Ensure LiveKit token & URL are present so WebView connects immediately
    await get().resolveCallCredentials(roomName, preparedToken, preparedUrl);
  },

  rejectCall: (callerIdOverride) => {
    stopCallSounds();
    dismissIncomingCallNotifications();

    const targetCaller = callerIdOverride || get().caller;
    const socket = useAuthStore.getState().socket;

    if (targetCaller) {
      if (socket?.connected) {
        socket.emit('rejectCall', { to: targetCaller });
      } else {
        set({ pendingDeclineCallerId: targetCaller });
      }
    }

    set({
      receivingCall: false,
      roomName: null,
      preparedToken: null,
      preparedUrl: null,
      caller: null,
      callerName: '',
      callerAvatar: '',
      targetUser: null,
      callStatus: 'idle',
    });
  },

  leaveCall: (emitEvent = true) => {
    stopCallSounds();
    dismissIncomingCallNotifications();
    stopCallAudio();

    const {
      caller,
      callActive,
      callTimeoutId,
      timerIntervalId,
      bridgeCommandHandler,
    } = get();
    const socket = useAuthStore.getState().socket;

    if (callTimeoutId) clearTimeout(callTimeoutId);
    if (timerIntervalId) clearInterval(timerIntervalId);

    if (bridgeCommandHandler) {
      try {
        bridgeCommandHandler({ type: 'DISCONNECT' });
      } catch {
        // safe fallback
      }
    }

    if (emitEvent && callActive && socket && caller) {
      socket.emit('endCall', { to: caller });
    }

    set({
      roomName: null,
      preparedToken: null,
      preparedUrl: null,
      remoteHasVideo: false,
      remoteVideoMuted: false,
      remoteAudioMuted: false,
      audioBlocked: false,
      receivingCall: false,
      caller: null,
      callerName: '',
      callerAvatar: '',
      targetUser: null,
      callAccepted: false,
      callEnded: true,
      callActive: false,
      callStatus: 'idle',
      isMicMuted: false,
      isCameraOff: false,
      isSpeakerOn: true,
      isMinimized: false,
      isSwapped: false,
      controlsVisible: true,
      facingMode: 'user',
      callDuration: 0,
      callTimeoutId: null,
      timerIntervalId: null,
    });

    setTimeout(() => {
      set({ callEnded: false });
    }, 1500);
  },

  toggleMic: async () => {
    const { isMicMuted, bridgeCommandHandler } = get();
    const nextMuted = !isMicMuted;

    if (!nextMuted) {
      const perm = await requestCallPermissions('voice');
      if (!perm.granted) {
        showPermissionAlert(perm, 'use the microphone');
        return;
      }
    }

    set({ isMicMuted: nextMuted });
    bridgeCommandHandler?.({ type: 'SET_MIC', muted: nextMuted });
  },

  toggleCamera: async () => {
    const { isCameraOff, bridgeCommandHandler, callActive, callType, isSpeakerOn } = get();
    const nextCameraOff = !isCameraOff;

    // Request Android CAMERA permission before turning on camera during a voice-started call
    if (!nextCameraOff) {
      const perm = await requestCallPermissions('video');
      if (!perm.granted) {
        showPermissionAlert(perm, 'turn on video');
        return;
      }
    }

    const nextCallType = !nextCameraOff ? 'video' : callType;
    const nextSpeaker = !nextCameraOff ? true : isSpeakerOn;

    if (callActive) {
      if (!nextCameraOff) {
        setSpeakerphoneOn(true);
        setProximityEnabled(false);
      } else {
        setProximityEnabled(nextCallType === 'voice' && !nextSpeaker);
      }
    }

    set({
      isCameraOff: nextCameraOff,
      callType: nextCallType,
      isSpeakerOn: nextSpeaker,
    });
    bridgeCommandHandler?.({ type: 'SET_CAMERA', enabled: !nextCameraOff });
  },

  toggleSpeaker: () => {
    const { isSpeakerOn, callActive, callType, isMinimized } = get();
    const nextSpeaker = !isSpeakerOn;
    setSpeakerphoneOn(nextSpeaker);
    if (callActive) {
      setProximityEnabled(callType === 'voice' && !nextSpeaker && !isMinimized);
    }
    set({ isSpeakerOn: nextSpeaker });
  },

  toggleSwap: () => {
    const { isSwapped, bridgeCommandHandler } = get();
    const next = !isSwapped;
    set({ isSwapped: next });
    bridgeCommandHandler?.({ type: 'SET_SWAPPED', swapped: next });
  },

  setMinimized: (minimized) => {
    const { callActive, callType, isSpeakerOn, bridgeCommandHandler } = get();
    if (callActive) {
      // Disable ear proximity sensor while minimized so user can text freely in chat!
      setProximityEnabled(callType === 'voice' && !isSpeakerOn && !minimized);
    }
    set({
      isMinimized: minimized,
      controlsVisible: true,
    });
    bridgeCommandHandler?.({ type: 'SET_MINIMIZED', minimized });
  },

  setControlsVisible: (visible) => {
    set({ controlsVisible: visible });
    get().bridgeCommandHandler?.({ type: 'SET_CONTROLS_VISIBLE', visible });
  },

  switchCamera: async () => {
    const { facingMode, isCameraOff, bridgeCommandHandler } = get();
    if (isCameraOff) return;
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    set({ facingMode: nextFacing });
    bridgeCommandHandler?.({ type: 'SWITCH_CAMERA', facingMode: nextFacing });
  },
}));
