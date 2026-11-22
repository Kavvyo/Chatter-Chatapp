import { create } from 'zustand';
import { Socket } from 'socket.io-client';
import { useAuthStore } from './useAuthStore';
import { playRingtone, stopCallSounds } from '../lib/sound';

export interface CallTargetUser {
  _id: string;
  fullName: string;
  profilePic?: string;
}

interface CallState {
  roomName: string | null;
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
  facingMode: 'user' | 'environment';
  callStatus: 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended';
  callDuration: 0;
  callTimeoutId: any;
  timerIntervalId: any;

  initializeSocketListeners: (socketInstance?: Socket | null) => void;
  uninitializeSocketListeners: () => void;
  startDurationTimer: () => void;
  callUser: (userToCall: CallTargetUser, type?: 'voice' | 'video') => void;
  answerCall: () => void;
  rejectCall: () => void;
  leaveCall: (emitEvent?: boolean) => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  switchCamera: () => void;
}

export const useCallStore = create<CallState>((set, get) => ({
  roomName: null,
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
  facingMode: 'user',
  callStatus: 'idle',
  callDuration: 0,
  callTimeoutId: null,
  timerIntervalId: null,

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

      set({
        receivingCall: true,
        roomName: data.roomName,
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
      const { callTimeoutId } = get();
      if (callTimeoutId) clearTimeout(callTimeoutId);
      set({ callAccepted: true, callStatus: 'connected', callTimeoutId: null });
      get().startDurationTimer();
    });

    socket.on('callEnded', () => {
      stopCallSounds();
      get().leaveCall(false);
    });

    socket.on('callRejected', () => {
      stopCallSounds();
      get().leaveCall(false);
    });

    socket.on('userBusy', () => {
      stopCallSounds();
      get().leaveCall(false);
    });

    socket.on('callFailed', () => {
      stopCallSounds();
      get().leaveCall(false);
    });

    socket.on('callHandledElsewhere', () => {
      const { receivingCall, callActive } = get();
      if (receivingCall && !callActive) {
        stopCallSounds();
        set({
          receivingCall: false,
          roomName: null,
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
      set((state) => ({ callDuration: (state.callDuration + 1) as any }));
    }, 1000);

    set({ timerIntervalId: interval });
  },

  callUser: (userToCall, type = 'video') => {
    const authUser = useAuthStore.getState().authUser;
    const socket = useAuthStore.getState().socket;

    if (!socket || !authUser) return;

    if (get().callActive) {
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
      callStatus: 'ringing',
      callDuration: 0,
      isMicMuted: false,
      isCameraOff: type === 'voice',
    });

    socket.emit('callUser', {
      userToCall: userToCall._id,
      roomName,
      from: authUser._id,
      name: authUser.fullName,
      avatar: authUser.profilePic,
      callType: type,
      receiverName: userToCall.fullName,
    });

    const timeoutId = setTimeout(() => {
      if (!get().callAccepted && get().callActive && get().roomName === roomName) {
        get().leaveCall(true);
      }
    }, 45000);

    set({ callTimeoutId: timeoutId });
  },

  answerCall: () => {
    stopCallSounds();
    const { roomName, caller } = get();
    const socket = useAuthStore.getState().socket;

    if (!socket || !roomName) return;

    set({
      callAccepted: true,
      callActive: true,
      receivingCall: false,
      callStatus: 'connected',
      callDuration: 0,
      isCaller: false,
    });

    socket.emit('answerCall', { to: caller, roomName });
    get().startDurationTimer();
  },

  rejectCall: () => {
    stopCallSounds();
    const { caller } = get();
    const socket = useAuthStore.getState().socket;

    if (socket && caller) {
      socket.emit('rejectCall', { to: caller });
    }

    set({
      receivingCall: false,
      roomName: null,
      caller: null,
      callerName: '',
      callerAvatar: '',
      targetUser: null,
      callStatus: 'idle',
    });
  },

  leaveCall: (emitEvent = true) => {
    stopCallSounds();
    const { caller, callActive, callTimeoutId, timerIntervalId } = get();
    const socket = useAuthStore.getState().socket;

    if (callTimeoutId) clearTimeout(callTimeoutId);
    if (timerIntervalId) clearInterval(timerIntervalId);

    if (emitEvent && callActive && socket && caller) {
      socket.emit('endCall', { to: caller });
    }

    set({
      roomName: null,
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
      facingMode: 'user',
      callDuration: 0,
      callTimeoutId: null,
      timerIntervalId: null,
    });

    setTimeout(() => {
      set({ callEnded: false });
    }, 1500);
  },

  toggleMic: () => {
    set((state) => ({ isMicMuted: !state.isMicMuted }));
  },

  toggleCamera: () => {
    set((state) => ({
      isCameraOff: !state.isCameraOff,
      callType: state.isCameraOff ? 'video' : state.callType,
    }));
  },

  switchCamera: () => {
    set((state) => ({
      facingMode: state.facingMode === 'user' ? 'environment' : 'user',
    }));
  },
}));
