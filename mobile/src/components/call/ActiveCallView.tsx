import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  PanResponder,
  Animated,
  Dimensions,
  BackHandler,
  AppState,
  type ScaledSize,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import {
  ChevronDown,
  Maximize2,
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  SwitchCamera,
  Video,
  VideoOff,
  Volume1,
  Volume2,
} from 'lucide-react-native';
import { useCallStore, type BridgeCommand } from '../../store/useCallStore';
import { useToastStore } from '../../store/useToastStore';
import {
  BRIDGE_HTML,
  WEBRTC_SECURE_ORIGIN,
  getSdkInjectionScripts,
  type BridgeOutgoingMessage,
} from '../../lib/callBridgeHtml';
import {
  enterSystemPictureInPicture,
  isInSystemPictureInPicture,
} from '../../lib/callAudio';
import Avatar from '../ui/Avatar';
import { CallFullScreenBackdrop } from './CallFullScreenBackdrop';

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

const VIDEO_PIP_W = 122;
const VIDEO_PIP_H = 178;
const VOICE_PIP_W = 176;
const VOICE_PIP_H = 68;
const PIP_EDGE = 14;

export const ActiveCallView = () => {
  const {
    callActive,
    receivingCall,
    callType,
    callStatus,
    callDuration,
    roomName,
    preparedToken,
    preparedUrl,
    facingMode,
    targetUser,
    callerName,
    callerAvatar,
    remoteHasVideo,
    remoteVideoMuted,
    remoteAudioMuted,
    isMicMuted,
    isCameraOff,
    isSpeakerOn,
    isMinimized,
    isSwapped,
    controlsVisible,
    toggleMic,
    toggleCamera,
    toggleSpeaker,
    setMinimized,
    setControlsVisible,
    switchCamera,
    leaveCall,
    registerBridgeCommandHandler,
    handleBridgeEvent,
  } = useCallStore();

  const webViewRef = useRef<WebView<{}> | null>(null);
  const sdkInjectedRef = useRef(false);
  const connectedSessionRef = useRef<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);

  const [windowSize, setWindowSize] = useState(() => Dimensions.get('window'));
  const [systemPip, setSystemPip] = useState(false);
  const controlsOpacity = useRef(new Animated.Value(1)).current;

  const isVoice = callType === 'voice';
  const pipWidth = isVoice ? VOICE_PIP_W : VIDEO_PIP_W;
  const pipHeight = isVoice ? VOICE_PIP_H : VIDEO_PIP_H;

  // Draggable in-app floating PiP position
  const initialX = Math.max(PIP_EDGE, windowSize.width - pipWidth - PIP_EDGE);
  const initialY = 86;
  const pan = useRef(new Animated.ValueXY({ x: initialX, y: initialY })).current;
  const currentPosRef = useRef({ x: initialX, y: initialY });

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }: { window: ScaledSize }) => {
      setWindowSize(window);
      setSystemPip(isInSystemPictureInPicture() || window.height < 420);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const maxX = Math.max(PIP_EDGE, windowSize.width - pipWidth - PIP_EDGE);
    const maxY = Math.max(54, windowSize.height - pipHeight - 96);
    const clampedX = currentPosRef.current.x < windowSize.width / 2 ? PIP_EDGE : maxX;
    const clampedY = Math.max(54, Math.min(maxY, currentPosRef.current.y));
    currentPosRef.current = { x: clampedX, y: clampedY };
    pan.setValue({ x: clampedX, y: clampedY });
  }, [pipWidth, pipHeight, windowSize.width, windowSize.height, isMinimized]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          pan.setOffset({
            x: currentPosRef.current.x,
            y: currentPosRef.current.y,
          });
          pan.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: (_, gesture) => {
          pan.flattenOffset();

          const moved = Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6;
          if (!moved) {
            setMinimized(false);
            return;
          }

          const win = Dimensions.get('window');
          const latestCallType = useCallStore.getState().callType;
          const w = latestCallType === 'voice' ? VOICE_PIP_W : VIDEO_PIP_W;
          const h = latestCallType === 'voice' ? VOICE_PIP_H : VIDEO_PIP_H;

          const rawX = currentPosRef.current.x + gesture.dx;
          const rawY = currentPosRef.current.y + gesture.dy;

          const snapLeft = rawX + w / 2 < win.width / 2;
          const targetX = snapLeft ? PIP_EDGE : Math.max(PIP_EDGE, win.width - w - PIP_EDGE);
          const minY = 52;
          const maxY = Math.max(minY, win.height - h - 96);
          const targetY = Math.max(minY, Math.min(maxY, rawY));

          currentPosRef.current = { x: targetX, y: targetY };
          Animated.spring(pan, {
            toValue: { x: targetX, y: targetY },
            useNativeDriver: false,
            friction: 7,
            tension: 70,
          }).start();
        },
      }),
    [pan, setMinimized]
  );

  const webViewSource = useMemo(
    () => ({ html: BRIDGE_HTML, baseUrl: WEBRTC_SECURE_ORIGIN }),
    []
  );

  const shouldKeepBridgeAlive =
    Platform.OS !== 'web' && (callActive || receivingCall);

  // Register imperative command dispatcher for mute, camera, flip, swap & PiP
  useEffect(() => {
    if (!shouldKeepBridgeAlive) {
      sdkInjectedRef.current = false;
      connectedSessionRef.current = null;
      setSdkReady(false);
      registerBridgeCommandHandler(null);
      return;
    }

    const dispatch = (cmd: BridgeCommand) => {
      const wv = webViewRef.current;
      if (!wv) return;

      switch (cmd.type) {
        case 'SET_MIC':
          wv.injectJavaScript(
            `window.__CALL_BRIDGE__ && window.__CALL_BRIDGE__.setMic(${cmd.muted ? 'true' : 'false'});true;`
          );
          break;
        case 'SET_CAMERA':
          wv.injectJavaScript(
            `window.__CALL_BRIDGE__ && window.__CALL_BRIDGE__.setCamera(${cmd.enabled ? 'true' : 'false'});true;`
          );
          break;
        case 'SWITCH_CAMERA':
          wv.injectJavaScript(
            `window.__CALL_BRIDGE__ && window.__CALL_BRIDGE__.switchCamera(${JSON.stringify(cmd.facingMode)});true;`
          );
          break;
        case 'SET_SWAPPED':
          wv.injectJavaScript(
            `window.__CALL_BRIDGE__ && window.__CALL_BRIDGE__.toggleSwap(${cmd.swapped ? 'true' : 'false'});true;`
          );
          break;
        case 'SET_MINIMIZED':
          wv.injectJavaScript(
            `window.__CALL_BRIDGE__ && window.__CALL_BRIDGE__.setMinimized(${cmd.minimized ? 'true' : 'false'});true;`
          );
          break;
        case 'SET_CONTROLS_VISIBLE':
          wv.injectJavaScript(
            `window.__CALL_BRIDGE__ && window.__CALL_BRIDGE__.setControlsVisible(${cmd.visible ? 'true' : 'false'});true;`
          );
          break;
        case 'DISCONNECT':
          wv.injectJavaScript(
            `window.__CALL_BRIDGE__ && window.__CALL_BRIDGE__.disconnect();true;`
          );
          break;
      }
    };

    registerBridgeCommandHandler(dispatch);

    return () => {
      dispatch({ type: 'DISCONNECT' });
      registerBridgeCommandHandler(null);
    };
  }, [shouldKeepBridgeAlive, registerBridgeCommandHandler]);

  // Pre-warm LiveKit DNS, TLS & signaling socket while phone rings so Accept connects instantly
  useEffect(() => {
    if (
      Platform.OS === 'web' ||
      callActive ||
      !receivingCall ||
      !sdkReady ||
      !preparedUrl ||
      !preparedToken
    ) {
      return;
    }
    webViewRef.current?.injectJavaScript(
      `window.__CALL_BRIDGE__ && window.__CALL_BRIDGE__.prepare(${JSON.stringify(preparedUrl)}, ${JSON.stringify(preparedToken)}, ${JSON.stringify(facingMode)});true;`
    );
  }, [callActive, receivingCall, sdkReady, preparedUrl, preparedToken, facingMode]);

  useEffect(() => {
    if (
      Platform.OS === 'web' ||
      !callActive ||
      !sdkReady ||
      !roomName ||
      !preparedToken ||
      !preparedUrl
    ) {
      return;
    }

    const sessionKey = `${roomName}:${preparedToken}`;
    if (connectedSessionRef.current === sessionKey) {
      return;
    }

    connectedSessionRef.current = sessionKey;
    const latest = useCallStore.getState();

    const connectPayload = {
      url: preparedUrl,
      token: preparedToken,
      roomName,
      callType: latest.callType,
      isMicMuted: latest.isMicMuted,
      isCameraOff: latest.isCameraOff,
      facingMode: latest.facingMode,
    };

    webViewRef.current?.injectJavaScript(
      `window.__CALL_BRIDGE__ && window.__CALL_BRIDGE__.connect(${JSON.stringify(connectPayload)});true;`
    );
  }, [callActive, sdkReady, roomName, preparedToken, preparedUrl]);

  // Android Hardware Back minimizes fullscreen call into floating In-App PiP
  useEffect(() => {
    if (!callActive || isMinimized || Platform.OS !== 'android') return;

    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setMinimized(true);
      return true;
    });

    return () => sub.remove();
  }, [callActive, isMinimized, setMinimized]);

  // Enter Android OS System PiP automatically when leaving app during connected video calls
  useEffect(() => {
    if (!callActive || Platform.OS !== 'android') return;

    const sub = AppState.addEventListener('change', (nextState) => {
      const state = useCallStore.getState();
      if (
        (nextState === 'background' || nextState === 'inactive') &&
        state.callActive &&
        state.callType === 'video' &&
        state.callAccepted
      ) {
        enterSystemPictureInPicture(9, 16);
      } else if (nextState === 'active') {
        setSystemPip(isInSystemPictureInPicture() || Dimensions.get('window').height < 420);
      }
    });

    return () => sub.remove();
  }, [callActive]);

  // Auto-hide controls after 4.5s ONLY when live remote video is visible
  useEffect(() => {
    Animated.timing(controlsOpacity, {
      toValue: controlsVisible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();

    if (!callActive || isVoice || callStatus !== 'connected' || isMinimized || !controlsVisible) {
      return;
    }

    const timer = setTimeout(() => {
      setControlsVisible(false);
    }, 4500);

    return () => clearTimeout(timer);
  }, [controlsVisible, callActive, isVoice, callStatus, isMinimized, controlsOpacity, setControlsVisible]);

  const injectSdkIfNeeded = () => {
    if (sdkInjectedRef.current || !webViewRef.current) return;
    sdkInjectedRef.current = true;
    const scripts = getSdkInjectionScripts();
    scripts.forEach((script) => {
      webViewRef.current?.injectJavaScript(script);
    });
  };

  const handleWebViewMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as BridgeOutgoingMessage;

      if (msg.type === 'BRIDGE_READY') {
        injectSdkIfNeeded();
        return;
      }

      if (msg.type === 'SDK_LOADED') {
        setSdkReady(true);
        return;
      }

      handleBridgeEvent(msg);
    } catch {
      // Ignore malformed messages
    }
  };

  if (!shouldKeepBridgeAlive) return null;

  const participantName = targetUser?.fullName || callerName || 'User';
  const participantAvatar = targetUser?.profilePic || callerAvatar || '';
  const isConnected = callStatus === 'connected';
  const showRemoteVideo = !isVoice && remoteHasVideo && !remoteVideoMuted;
  const showFullScreenPhoto = !showRemoteVideo && !(isSwapped && !isCameraOff);
  const showControls = (isVoice || !showRemoteVideo || controlsVisible) && !isMinimized && !systemPip;
  const audioOnlyMode = isVoice && isCameraOff && !showRemoteVideo;

  const topSubtitle = isConnected
    ? formatDuration(callDuration)
    : callStatus === 'ringing'
    ? isVoice
      ? 'Chatter Audio...'
      : 'Chatter Video...'
    : callStatus === 'calling'
    ? 'Calling...'
    : 'Connecting...';

  const containerStyle = !callActive
    ? styles.prewarmContainer
    : isMinimized
    ? [
        styles.minimizedContainer,
        {
          width: pipWidth,
          height: pipHeight,
          borderRadius: isVoice ? 34 : 18,
          transform: pan.getTranslateTransform(),
        },
      ]
    : styles.fullscreenContainer;

  return (
    <Animated.View style={containerStyle} pointerEvents={callActive ? 'box-none' : 'none'}>
      {callActive && !isMinimized && !systemPip && <StatusBar style="light" />}

      {/* Layer 0: Full-Screen Profile Image Backdrop (shown on audio calls & before video starts) */}
      {callActive && !isMinimized && !systemPip && (
        <CallFullScreenBackdrop
          avatarUri={participantAvatar}
          name={participantName}
          subtitle={topSubtitle}
          showPhoto={showFullScreenPhoto}
          mutedBadge={isConnected && remoteAudioMuted}
          headerOpacity={controlsOpacity}
        />
      )}

      {/* Layer 1: Single persistent WebView pre-warmed during incoming ring & reused live */}
      {Platform.OS !== 'web' && (
        <View
          style={[
            styles.webviewWrapper,
            (!callActive || (audioOnlyMode && !isMinimized)) && styles.hiddenAudioWebView,
            callActive && isMinimized && { borderRadius: isVoice ? 34 : 18, overflow: 'hidden', backgroundColor: '#0b141a' },
          ]}
          pointerEvents={!callActive || isMinimized || audioOnlyMode ? 'none' : 'auto'}
        >
          <WebView<{}>
            ref={webViewRef}
            source={webViewSource}
            style={styles.webview}
            originWhitelist={['*']}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            allowsInlineMediaPlayback={true}
            mediaPlaybackRequiresUserAction={false}
            mediaCapturePermissionGrantType="grant"
            mixedContentMode="compatibility"
            allowsFullscreenVideo={false}
            bounces={false}
            scrollEnabled={false}
            overScrollMode="never"
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            onLoadEnd={injectSdkIfNeeded}
            onMessage={handleWebViewMessage}
            onRenderProcessGone={() => {
              useToastStore.getState().showToast('Call engine restarted unexpectedly', 'error');
              leaveCall(true);
            }}
          />
        </View>
      )}

      {/* MINIMIZED IN-APP FLOATING PIP OVERLAY */}
      {!callActive ? null : isMinimized ? (
        <View style={styles.pipTouchLayer} {...panResponder.panHandlers}>
          {isVoice ? (
            <View style={styles.voicePipCard}>
              <Avatar uri={participantAvatar} size={42} />
              <View style={styles.voicePipInfo}>
                <Text style={styles.voicePipName} numberOfLines={1}>
                  {participantName}
                </Text>
                <View style={styles.voicePipTimerRow}>
                  <View style={styles.liveGreenDot} />
                  <Text style={styles.voicePipTimer}>
                    {isConnected ? formatDuration(callDuration) : 'Ringing...'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => leaveCall(true)}
                style={styles.miniEndBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <PhoneOff size={15} color="#ffffff" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.videoPipOverlay}>
              {!showRemoteVideo && (
                <View style={styles.videoPipAvatarBg}>
                  <Avatar uri={participantAvatar} size={52} />
                </View>
              )}
              <View style={styles.videoPipTopRow}>
                <View style={styles.miniExpandPill}>
                  <Maximize2 size={12} color="#ffffff" />
                </View>
              </View>
              <View style={styles.videoPipBottomBar}>
                <Text style={styles.videoPipTimer} numberOfLines={1}>
                  {isConnected ? formatDuration(callDuration) : 'Calling'}
                </Text>
              </View>
            </View>
          )}
        </View>
      ) : systemPip ? null : (
        /* FULLSCREEN REFERENCE-INSPIRED CALL OVERLAY */
        <>
          {/* Minimal Top Corner Utilities */}
          <Animated.View
            style={[styles.topCornerRow, { opacity: controlsOpacity }]}
            pointerEvents={showControls ? 'box-none' : 'none'}
          >
            <TouchableOpacity
              onPress={() => setMinimized(true)}
              style={styles.cornerCircleBtn}
              activeOpacity={0.8}
            >
              <ChevronDown size={20} color="#ffffff" />
            </TouchableOpacity>

            {!isVoice && !isCameraOff ? (
              <TouchableOpacity
                onPress={switchCamera}
                style={styles.cornerCircleBtn}
                activeOpacity={0.8}
              >
                <SwitchCamera size={19} color="#ffffff" />
              </TouchableOpacity>
            ) : (
              <View style={styles.cornerSpacer} />
            )}
          </Animated.View>

          {/* Bottom Controls: 4-Button Pill for Video Calls, 3x2 Dark Box for Voice Calls */}
          <Animated.View
            style={[styles.bottomGridWrapper, { opacity: controlsOpacity }]}
            pointerEvents={showControls ? 'box-none' : 'none'}
          >
            {isVoice ? (
              <View style={styles.controlsBox}>
                <View style={styles.gridRow}>
                  {/* 1. Speaker */}
                  <View style={styles.gridItem}>
                    <TouchableOpacity
                      onPress={toggleSpeaker}
                      style={[styles.gridCircleBtn, isSpeakerOn && styles.gridCircleActive]}
                      activeOpacity={0.8}
                    >
                      {isSpeakerOn ? (
                        <Volume2 size={26} color="#111827" />
                      ) : (
                        <Volume1 size={26} color="#ffffff" />
                      )}
                    </TouchableOpacity>
                    <Text style={styles.gridLabel}>Speaker</Text>
                  </View>

                  {/* 2. Video Toggle / Upgrade */}
                  <View style={styles.gridItem}>
                    <TouchableOpacity
                      onPress={toggleCamera}
                      style={[styles.gridCircleBtn, !isCameraOff && styles.gridCircleActive]}
                      activeOpacity={0.8}
                    >
                      {isCameraOff ? (
                        <VideoOff size={25} color="#ffffff" />
                      ) : (
                        <Video size={25} color="#111827" />
                      )}
                    </TouchableOpacity>
                    <Text style={styles.gridLabel}>Video</Text>
                  </View>

                  {/* 3. Mute */}
                  <View style={styles.gridItem}>
                    <TouchableOpacity
                      onPress={toggleMic}
                      style={[styles.gridCircleBtn, isMicMuted && styles.gridCircleActive]}
                      activeOpacity={0.8}
                    >
                      {isMicMuted ? (
                        <MicOff size={25} color="#111827" />
                      ) : (
                        <Mic size={25} color="#ffffff" />
                      )}
                    </TouchableOpacity>
                    <Text style={styles.gridLabel}>Mute</Text>
                  </View>
                </View>

                <View style={styles.gridRow}>
                  {/* 4. Minimize to Chat (In-App Floating PiP) */}
                  <View style={styles.gridItem}>
                    <TouchableOpacity
                      onPress={() => setMinimized(true)}
                      style={styles.gridCircleBtn}
                      activeOpacity={0.8}
                    >
                      <MessageSquare size={24} color="#ffffff" />
                    </TouchableOpacity>
                    <Text style={styles.gridLabel}>Chat</Text>
                  </View>

                  {/* 5. Center Red End Call */}
                  <View style={styles.gridItem}>
                    <TouchableOpacity
                      onPress={() => leaveCall(true)}
                      style={[styles.gridCircleBtn, styles.endCircleBtn]}
                      activeOpacity={0.85}
                    >
                      <PhoneOff size={26} color="#ffffff" />
                    </TouchableOpacity>
                    <Text style={styles.gridLabel}>End</Text>
                  </View>

                  {/* 6. Flip Camera (enabled when camera active) */}
                  <View style={styles.gridItem}>
                    <TouchableOpacity
                      onPress={switchCamera}
                      disabled={isCameraOff}
                      style={[styles.gridCircleBtn, isCameraOff && styles.gridCircleDisabled]}
                      activeOpacity={0.8}
                    >
                      <SwitchCamera
                        size={24}
                        color={isCameraOff ? 'rgba(255,255,255,0.4)' : '#ffffff'}
                      />
                    </TouchableOpacity>
                    <Text style={[styles.gridLabel, isCameraOff && styles.gridLabelDisabled]}>
                      Flip
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              /* Clean 4-Button Video Call Pill */
              <View style={styles.videoPillDock}>
                <TouchableOpacity
                  onPress={toggleCamera}
                  style={[styles.pillCircleBtn, isCameraOff && styles.pillCircleActive]}
                  activeOpacity={0.8}
                >
                  {isCameraOff ? (
                    <VideoOff size={25} color="#111827" />
                  ) : (
                    <Video size={25} color="#ffffff" />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={toggleSpeaker}
                  style={[styles.pillCircleBtn, isSpeakerOn && styles.pillCircleActive]}
                  activeOpacity={0.8}
                >
                  {isSpeakerOn ? (
                    <Volume2 size={25} color="#111827" />
                  ) : (
                    <Volume1 size={25} color="#ffffff" />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={toggleMic}
                  style={[styles.pillCircleBtn, isMicMuted && styles.pillCircleActive]}
                  activeOpacity={0.8}
                >
                  {isMicMuted ? (
                    <MicOff size={25} color="#111827" />
                  ) : (
                    <Mic size={25} color="#ffffff" />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => leaveCall(true)}
                  style={[styles.pillCircleBtn, styles.pillEndBtn]}
                  activeOpacity={0.85}
                >
                  <PhoneOff size={25} color="#ffffff" />
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>
        </>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  fullscreenContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    backgroundColor: '#111827',
  },
  minimizedContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 999,
    backgroundColor: '#182229',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.22)',
    elevation: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    overflow: 'hidden',
  },
  webviewWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 4,
  },
  hiddenAudioWebView: {
    opacity: 0.01,
  },
  prewarmContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 2,
    height: 2,
    opacity: 0.01,
    zIndex: -1,
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  pipTouchLayer: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  voicePipCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 8,
    backgroundColor: '#1f2c34',
  },
  voicePipInfo: {
    flex: 1,
    minWidth: 0,
  },
  voicePipName: {
    color: '#e9edef',
    fontSize: 12,
    fontWeight: '700',
  },
  voicePipTimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  liveGreenDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#00a884',
  },
  voicePipTimer: {
    color: '#00a884',
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  miniEndBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPipOverlay: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 8,
  },
  videoPipAvatarBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#182229',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPipTopRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  miniExpandPill: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPipBottomBar: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  videoPipTimer: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  topCornerRow: {
    position: 'absolute',
    top: 48,
    left: 18,
    right: 18,
    zIndex: 25,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cornerCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cornerCircleActive: {
    backgroundColor: '#ffffff',
  },
  cornerSpacer: {
    width: 38,
    height: 38,
  },
  bottomGridWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 25,
    paddingBottom: 32,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  controlsBox: {
    width: '100%',
    maxWidth: 348,
    borderRadius: 32,
    backgroundColor: 'rgba(10, 14, 20, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 14,
    paddingVertical: 20,
    gap: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 16,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    width: '100%',
  },
  gridItem: {
    alignItems: 'center',
    width: 82,
    gap: 7,
  },
  gridCircleBtn: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridCircleActive: {
    backgroundColor: '#ffffff',
  },
  gridCircleDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  endCircleBtn: {
    backgroundColor: '#ff3b30',
  },
  gridLabel: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '500',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  gridLabelDisabled: {
    color: 'rgba(255, 255, 255, 0.45)',
  },
  videoPillDock: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161618',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 18,
  },
  pillCircleBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#3f3f46',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillCircleActive: {
    backgroundColor: '#ffffff',
  },
  pillEndBtn: {
    backgroundColor: '#ef1c43',
  },
});
