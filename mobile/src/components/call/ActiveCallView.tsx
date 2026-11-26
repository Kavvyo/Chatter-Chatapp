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
  ArrowLeftRight,
  ChevronDown,
  Lock,
  Maximize2,
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
    callType,
    callStatus,
    callDuration,
    roomName,
    preparedToken,
    preparedUrl,
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
    toggleSwap,
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

  // Re-clamp floating PiP coordinates when callType or window dimensions change
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

  // Memoize source with empty deps so duration timer updates never reload the WebView page
  const webViewSource = useMemo(
    () => ({ html: BRIDGE_HTML, baseUrl: WEBRTC_SECURE_ORIGIN }),
    []
  );

  // Register imperative command dispatcher for mute, camera, flip, swap & PiP
  useEffect(() => {
    if (!callActive || Platform.OS === 'web') {
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
  }, [callActive, registerBridgeCommandHandler]);

  // Trigger LiveKit connection inside WebView once SDK & credentials are ready
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

  // Android Hardware Back minimizes fullscreen call into floating In-App PiP (WhatsApp style)
  useEffect(() => {
    if (!callActive || isMinimized || Platform.OS !== 'android') return;

    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setMinimized(true);
      return true;
    });

    return () => sub.remove();
  }, [callActive, isMinimized, setMinimized]);

  // Enter Android OS System PiP automatically when leaving app during an active connected video call
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

  // Animate & auto-hide WhatsApp overlay controls after 4.5s on connected video calls
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

  if (!callActive) return null;

  const participantName = targetUser?.fullName || callerName || 'User';
  const participantAvatar = targetUser?.profilePic || callerAvatar || '';
  const isConnected = callStatus === 'connected';
  const showRemoteVideo = !isVoice && remoteHasVideo && !remoteVideoMuted;
  const showMainPlaceholder = !isVoice && !isSwapped && !showRemoteVideo;
  const showControls = (isVoice || controlsVisible) && !isMinimized && !systemPip;

  const containerStyle = isMinimized
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
    <Animated.View style={containerStyle} pointerEvents="box-none">
      {!isMinimized && !systemPip && <StatusBar style="light" />}

      {/* Layer 0: Hardware-accelerated OS WebView WebRTC Engine */}
      {Platform.OS !== 'web' && (
        <View
          style={[
            styles.webviewWrapper,
            isMinimized && { borderRadius: isVoice ? 34 : 18, overflow: 'hidden' },
          ]}
          pointerEvents={isMinimized ? 'none' : 'auto'}
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
      {isMinimized ? (
        <View
          style={styles.pipTouchLayer}
          {...panResponder.panHandlers}
        >
          {isVoice ? (
            /* Minimized Floating Voice Call Chip */
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
            /* Minimized Floating Video Call Window */
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
        /* FULLSCREEN WHATSAPP-STYLE CALL INTERFACE */
        <>
          {/* Center Voice Mode UI or Remote Camera-Off Avatar */}
          <View style={styles.centerArea} pointerEvents="box-none">
            {isVoice ? (
              <View style={styles.voiceMode} pointerEvents="none">
                <View style={styles.pulseContainer}>
                  {isConnected && (
                    <>
                      <View style={styles.voicePulseOuter} />
                      <View style={styles.voicePulseInner} />
                    </>
                  )}
                  <Avatar
                    uri={participantAvatar}
                    size={136}
                    imageStyle={{ borderWidth: 3, borderColor: 'rgba(0, 168, 132, 0.45)' }}
                  />
                </View>

                <Text style={styles.voiceName}>{participantName}</Text>
                <Text style={styles.voiceTimer}>
                  {isConnected
                    ? formatDuration(callDuration)
                    : callStatus === 'ringing'
                    ? 'Calling...'
                    : 'Connecting...'}
                </Text>

                <View style={styles.audioRoutePill}>
                  {isSpeakerOn ? (
                    <Volume2 size={14} color="#00a884" />
                  ) : (
                    <Volume1 size={14} color="#8696a0" />
                  )}
                  <Text style={styles.audioRouteText}>
                    {remoteAudioMuted
                      ? 'Participant muted'
                      : isSpeakerOn
                      ? 'Speaker on'
                      : 'Earpiece • Hold near ear'}
                  </Text>
                </View>
              </View>
            ) : showMainPlaceholder ? (
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => setControlsVisible(!controlsVisible)}
                style={styles.remoteVideoPlaceholder}
              >
                <Avatar
                  uri={participantAvatar}
                  size={108}
                  imageStyle={{ borderWidth: 2, borderColor: 'rgba(255,255,255,0.22)' }}
                />
                <Text style={styles.remoteName}>{participantName}</Text>
                <Text style={styles.remoteStatus}>
                  {isConnected
                    ? remoteVideoMuted
                      ? 'Camera is off'
                      : 'Connected'
                    : callStatus === 'ringing'
                    ? 'Calling...'
                    : 'Connecting video...'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Top WhatsApp Header Bar (Auto-hides on tap in Video calls) */}
          <Animated.View
            style={[styles.headerOverlay, { opacity: controlsOpacity }]}
            pointerEvents={showControls ? 'box-none' : 'none'}
          >
            <TouchableOpacity
              onPress={() => setMinimized(true)}
              style={styles.headerCircleBtn}
              activeOpacity={0.8}
            >
              <ChevronDown size={22} color="#e9edef" />
            </TouchableOpacity>

            <View style={styles.headerCenter} pointerEvents="none">
              <Text style={styles.headerName} numberOfLines={1}>
                {participantName}
              </Text>
              <View style={styles.headerSubRow}>
                {!isConnected ? (
                  <>
                    <Lock size={11} color="#8696a0" />
                    <Text style={styles.headerSubtitle}>
                      {callStatus === 'ringing' ? 'Ringing...' : 'Connecting...'}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.headerTimer}>{formatDuration(callDuration)}</Text>
                )}
                {isConnected && remoteAudioMuted && (
                  <View style={styles.remoteMutePill}>
                    <MicOff size={10} color="#fca5a5" />
                    <Text style={styles.remoteMuteText}>Muted</Text>
                  </View>
                )}
              </View>
            </View>

            {!isVoice ? (
              <TouchableOpacity
                onPress={toggleSwap}
                style={[styles.headerCircleBtn, isSwapped && styles.headerCircleBtnActive]}
                activeOpacity={0.8}
              >
                <ArrowLeftRight size={18} color={isSwapped ? '#0b141a' : '#e9edef'} />
              </TouchableOpacity>
            ) : (
              <View style={styles.headerSpacer} />
            )}
          </Animated.View>

          {/* Bottom Ergonomic WhatsApp Control Dock */}
          <Animated.View
            style={[styles.bottomDockWrapper, { opacity: controlsOpacity }]}
            pointerEvents={showControls ? 'box-none' : 'none'}
          >
            <View style={styles.bottomDock}>
              {/* Speaker / Earpiece Toggle */}
              <TouchableOpacity
                onPress={toggleSpeaker}
                style={[styles.dockBtn, isSpeakerOn && styles.dockBtnActiveWhite]}
                activeOpacity={0.8}
              >
                {isSpeakerOn ? (
                  <Volume2 size={22} color="#0b141a" />
                ) : (
                  <Volume1 size={22} color="#e9edef" />
                )}
              </TouchableOpacity>

              {/* Camera On/Off (or Upgrade Voice -> Video) */}
              <TouchableOpacity
                onPress={toggleCamera}
                style={[styles.dockBtn, isCameraOff && styles.dockBtnMuted]}
                activeOpacity={0.8}
              >
                {isCameraOff ? (
                  <VideoOff size={22} color="#fca5a5" />
                ) : (
                  <Video size={22} color="#e9edef" />
                )}
              </TouchableOpacity>

              {/* Flip Front/Back Camera */}
              {!isCameraOff && (
                <TouchableOpacity
                  onPress={switchCamera}
                  style={styles.dockBtn}
                  activeOpacity={0.8}
                >
                  <SwitchCamera size={22} color="#e9edef" />
                </TouchableOpacity>
              )}

              {/* Mic Mute Toggle */}
              <TouchableOpacity
                onPress={toggleMic}
                style={[styles.dockBtn, isMicMuted && styles.dockBtnMuted]}
                activeOpacity={0.8}
              >
                {isMicMuted ? (
                  <MicOff size={22} color="#fca5a5" />
                ) : (
                  <Mic size={22} color="#e9edef" />
                )}
              </TouchableOpacity>

              {/* End Call */}
              <TouchableOpacity
                onPress={() => leaveCall(true)}
                style={styles.endCallBtn}
                activeOpacity={0.85}
              >
                <PhoneOff size={24} color="#ffffff" />
              </TouchableOpacity>
            </View>
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
    backgroundColor: '#0b141a',
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
    backgroundColor: '#0b141a',
  },
  webview: {
    flex: 1,
    backgroundColor: '#0b141a',
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
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(11, 20, 26, 0.55)',
  },
  headerCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCircleBtnActive: {
    backgroundColor: '#e9edef',
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  headerName: {
    color: '#e9edef',
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  headerSubtitle: {
    color: '#8696a0',
    fontSize: 12,
    fontWeight: '500',
  },
  headerTimer: {
    color: '#e9edef',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  remoteMutePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    marginLeft: 4,
  },
  remoteMuteText: {
    color: '#fca5a5',
    fontSize: 10,
    fontWeight: '600',
  },
  centerArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  voiceMode: {
    alignItems: 'center',
    gap: 12,
    paddingBottom: 40,
  },
  pulseContainer: {
    width: 190,
    height: 190,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  voicePulseOuter: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(0, 168, 132, 0.1)',
  },
  voicePulseInner: {
    position: 'absolute',
    width: 162,
    height: 162,
    borderRadius: 81,
    backgroundColor: 'rgba(0, 168, 132, 0.18)',
  },
  voiceName: {
    color: '#e9edef',
    fontSize: 28,
    fontWeight: '700',
  },
  voiceTimer: {
    color: '#8696a0',
    fontSize: 17,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  audioRoutePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  audioRouteText: {
    color: '#d1d7db',
    fontSize: 12,
    fontWeight: '500',
  },
  remoteVideoPlaceholder: {
    alignItems: 'center',
    gap: 10,
    padding: 20,
  },
  remoteName: {
    color: '#e9edef',
    fontSize: 22,
    fontWeight: '600',
  },
  remoteStatus: {
    color: '#8696a0',
    fontSize: 14,
  },
  bottomDockWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 34,
    paddingHorizontal: 16,
    alignItems: 'center',
    zIndex: 20,
  },
  bottomDock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    width: '100%',
    maxWidth: 400,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 28,
    backgroundColor: 'rgba(31, 44, 52, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    elevation: 20,
  },
  dockBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2a3942',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dockBtnActiveWhite: {
    backgroundColor: '#e9edef',
  },
  dockBtnMuted: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.45)',
  },
  endCallBtn: {
    width: 56,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
  },
});
