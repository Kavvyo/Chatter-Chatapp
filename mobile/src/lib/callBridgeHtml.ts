import { BASE_URL, PROD_URL } from './config';

// Lazy-loaded JSON asset containing the minified livekit-client UMD bundle (~625 KB).
// Loaded via chunked injectJavaScript instead of inline HTML to avoid Android's
// 1 MB Binder IPC limit on WebView.loadDataWithBaseURL.
const livekitUmdAsset = require('../../assets/livekit-umd.json') as {
  version: string;
  code: string;
};

/**
 * WebRTC getUserMedia requires a Secure Context (HTTPS or localhost) inside
 * Android Chromium WebView and iOS WKWebView. Even when local dev connects to
 * an HTTP LAN backend, the virtual WebView origin must stay HTTPS.
 */
export const WEBRTC_SECURE_ORIGIN = BASE_URL.startsWith('https://')
  ? BASE_URL
  : PROD_URL;

/**
 * Splits the bundled livekit-client UMD source into safe ~120 KB injectJavaScript
 * statements so Android's Binder transaction buffer is never exceeded.
 */
export function getSdkInjectionScripts(chunkSize = 120_000): string[] {
  const code = livekitUmdAsset?.code || '';
  if (!code) return [];

  const scripts: string[] = [];
  let idx = 0;
  for (let i = 0; i < code.length; i += chunkSize) {
    const slice = code.slice(i, i + chunkSize);
    scripts.push(`window.__LOAD_SDK_CHUNK__(${idx}, ${JSON.stringify(slice)});true;`);
    idx += 1;
  }
  scripts.push(`window.__INIT_SDK__(${idx});true;`);
  return scripts;
}

export interface BridgeConnectPayload {
  url: string;
  token: string;
  roomName: string;
  callType: 'voice' | 'video';
  isMicMuted: boolean;
  isCameraOff: boolean;
  facingMode: 'user' | 'environment';
}

export type BridgeOutgoingMessage =
  | { type: 'BRIDGE_READY' }
  | { type: 'SDK_LOADED'; cached?: boolean }
  | { type: 'ROOM_CONNECTED' }
  | { type: 'PARTICIPANT_CONNECTED' }
  | { type: 'PARTICIPANT_DISCONNECTED' }
  | { type: 'ROOM_DISCONNECTED' }
  | { type: 'SWAP_CHANGED'; isSwapped: boolean }
  | { type: 'TOGGLE_CONTROLS' }
  | {
      type: 'LOCAL_MEDIA_STATE';
      hasVideo?: boolean;
      hasAudio?: boolean;
      cameraOff?: boolean;
      micMuted?: boolean;
      facingMode?: 'user' | 'environment';
    }
  | { type: 'REMOTE_VIDEO_STATE'; hasVideo: boolean; muted: boolean }
  | { type: 'REMOTE_AUDIO_STATE'; hasAudio: boolean; muted: boolean }
  | { type: 'AUDIO_PLAYBACK_BLOCKED'; blocked: boolean }
  | { type: 'ERROR'; message: string }
  | { type: 'LOG'; level: 'info' | 'warn' | 'error'; message: string };

/**
 * Hardware-accelerated HTML5 WebRTC bridge inside react-native-webview.
 * Supports fullscreen remote video, WhatsApp-style draggable/tappable PiP,
 * smooth Main <-> PiP video swap, tap-to-toggle overlay controls, and
 * clean minimized in-app PiP scaling.
 */
export const BRIDGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Chatter Call Bridge</title>
  <style>
    * {
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
      -webkit-tap-highlight-color: transparent;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: transparent;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    .video-box {
      position: fixed;
      overflow: hidden;
      background-color: transparent;
      transition:
        top 220ms cubic-bezier(0.22, 1, 0.36, 1),
        left 220ms cubic-bezier(0.22, 1, 0.36, 1),
        width 220ms cubic-bezier(0.22, 1, 0.36, 1),
        height 220ms cubic-bezier(0.22, 1, 0.36, 1),
        border-radius 220ms ease;
    }

    .video-box.dragging {
      transition: none !important;
    }

    .video-box.slot-main {
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      border-radius: 0 !important;
      border: none !important;
      box-shadow: none !important;
      background-color: transparent;
      z-index: 1;
    }

    .video-box.slot-main .off-placeholder {
      display: none !important;
    }

    .video-box.slot-pip {
      width: 104px;
      height: 152px;
      border-radius: 16px;
      background-color: #182229;
      border: 2px solid rgba(255, 255, 255, 0.28);
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.55);
      z-index: 15;
      touch-action: none;
    }

    body.minimized-mode .video-box.slot-pip {
      display: none !important;
    }

    body.minimized-mode .video-box.slot-main {
      background-color: #0b141a;
    }

    video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: none;
    }

    #local-video.mirrored {
      transform: scaleX(-1);
    }

    #remote-audio {
      display: none;
    }

    .off-placeholder {
      width: 100%;
      height: 100%;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      color: #8696a0;
      font-size: 11px;
      font-weight: 500;
      background-color: #182229;
      text-align: center;
      padding: 8px;
    }

    .off-placeholder svg {
      width: 22px;
      height: 22px;
      stroke: #8696a0;
    }

    .pip-badge {
      position: absolute;
      bottom: 6px;
      left: 6px;
      width: 22px;
      height: 22px;
      border-radius: 11px;
      background-color: rgba(239, 68, 68, 0.92);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 18;
    }

    .pip-badge svg {
      width: 12px;
      height: 12px;
      stroke: #ffffff;
    }

    .pip-swap-hint {
      position: absolute;
      bottom: 6px;
      right: 6px;
      width: 22px;
      height: 22px;
      border-radius: 11px;
      background-color: rgba(0, 0, 0, 0.45);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 18;
    }

    .slot-pip .pip-swap-hint {
      display: flex;
    }

    .pip-swap-hint svg {
      width: 12px;
      height: 12px;
      stroke: rgba(255, 255, 255, 0.9);
    }

    #audio-unlock-btn {
      position: fixed;
      top: 116px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 40;
      display: none;
      align-items: center;
      gap: 8px;
      padding: 10px 18px;
      border-radius: 9999px;
      border: none;
      background-color: #f59e0b;
      color: #09090b;
      font-weight: 700;
      font-size: 13px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    }
  </style>
</head>
<body>
  <audio id="remote-audio" autoplay playsinline></audio>

  <button id="audio-unlock-btn" type="button" onclick="window.__CALL_BRIDGE__.unlockAudio()">
    Tap to enable call audio
  </button>

  <!-- Receiver / Remote Video Box -->
  <div id="remote-box" class="video-box slot-main" style="display:none;">
    <video id="remote-video" autoplay playsinline webkit-playsinline></video>
    <div id="remote-off-placeholder" class="off-placeholder">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/>
        <path d="M10 5h4a2 2 0 0 1 2 2v3l5-3v10l-5-3"/>
        <line x1="2" y1="2" x2="22" y2="22"/>
      </svg>
      <span>Cam off</span>
    </div>
    <div class="pip-swap-hint">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m16 3 4 4-4 4"/>
        <path d="M20 7H4"/>
        <path d="m8 21-4-4 4-4"/>
        <path d="M4 17h16"/>
      </svg>
    </div>
  </div>

  <!-- Local Self Video Box -->
  <div id="local-box" class="video-box slot-pip" style="display:none;">
    <video id="local-video" class="mirrored" autoplay muted playsinline webkit-playsinline></video>
    <div id="local-off-placeholder" class="off-placeholder">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.062A.5.5 0 0 1 22 7.87v8.196"/>
        <path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/>
        <path d="m2 2 20 20"/>
      </svg>
      <span>Camera off</span>
    </div>
    <div id="pip-mute-badge" class="pip-badge">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="2" x2="22" y1="2" y2="22"/>
        <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/>
        <path d="M5 10v2a7 7 0 0 0 12 5"/>
        <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/>
        <path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>
        <line x1="12" x2="12" y1="19" y2="22"/>
      </svg>
    </div>
    <div class="pip-swap-hint">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m16 3 4 4-4 4"/>
        <path d="M20 7H4"/>
        <path d="m8 21-4-4 4-4"/>
        <path d="M4 17h16"/>
      </svg>
    </div>
  </div>

  <script>
    (function () {
      function post(type, payload) {
        try {
          if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
            var msg = Object.assign({ type: type }, payload || {});
            window.ReactNativeWebView.postMessage(JSON.stringify(msg));
          }
        } catch (e) {}
      }

      function log(level, message) {
        post('LOG', { level: level, message: String(message) });
      }

      // Chunked SDK bootstrapper
      window.__SDK_CHUNKS__ = [];
      window.__SDK_LOADED__ = false;

      window.__LOAD_SDK_CHUNK__ = function (index, chunk) {
        if (typeof index === 'number') {
          window.__SDK_CHUNKS__[index] = chunk;
        } else {
          window.__SDK_CHUNKS__.push(index);
        }
      };

      window.__INIT_SDK__ = function (expectedCount) {
        if (window.LivekitClient) {
          window.__SDK_LOADED__ = true;
          post('SDK_LOADED', { cached: true });
          return;
        }
        try {
          if (typeof expectedCount === 'number') {
            for (var i = 0; i < expectedCount; i++) {
              if (typeof window.__SDK_CHUNKS__[i] !== 'string') {
                post('ERROR', { message: 'Missing call engine chunk ' + i });
                return;
              }
            }
          }
          var code = window.__SDK_CHUNKS__.join('');
          window.__SDK_CHUNKS__ = [];
          (0, eval)(code);
          window.__SDK_LOADED__ = Boolean(window.LivekitClient);
          if (window.__SDK_LOADED__) {
            post('SDK_LOADED', { cached: false });
          } else {
            post('ERROR', { message: 'LivekitClient global missing after initialization' });
          }
        } catch (err) {
          post('ERROR', { message: 'SDK initialization failed: ' + (err && err.message ? err.message : String(err)) });
        }
      };

      var remoteBoxEl = document.getElementById('remote-box');
      var remoteVideoEl = document.getElementById('remote-video');
      var remoteOffEl = document.getElementById('remote-off-placeholder');
      var remoteAudioEl = document.getElementById('remote-audio');

      var localBoxEl = document.getElementById('local-box');
      var localVideoEl = document.getElementById('local-video');
      var localOffEl = document.getElementById('local-off-placeholder');
      var pipMuteBadgeEl = document.getElementById('pip-mute-badge');
      var audioUnlockBtnEl = document.getElementById('audio-unlock-btn');

      var activeRoom = null;
      var activeSessionKey = null;
      var preparedRoom = null;
      var preparedKey = null;
      var pendingTracks = [];
      var localVideoTrack = null;
      var remoteVideoTrack = null;
      var attachedAudioTrackId = null;
      var isDisconnecting = false;
      var isSwitchingCamera = false;
      var currentCallType = 'video';
      var currentFacing = 'user';
      var currentCameraOff = false;
      var currentMicMuted = false;
      var currentRemoteMuted = false;
      var isSwapped = false;
      var isMinimized = false;
      var controlsVisible = true;

      // Draggable PiP position state (snaps to corners; defaults to bottom-right like WhatsApp)
      var pipSideX = 'right'; // 'left' | 'right'
      var pipSideY = 'bottom'; // 'top' | 'bottom'
      var PIP_W = 104;
      var PIP_H = 152;
      var EDGE_PAD = 14;

      function getSafeVerticalBounds() {
        var topMin = controlsVisible ? 104 : 44;
        var bottomMax = Math.max(topMin + PIP_H, window.innerHeight - PIP_H - (controlsVisible ? 132 : 28));
        return { topMin: topMin, bottomMax: bottomMax };
      }

      function applyPipCornerPosition() {
        var pipEl = isSwapped ? remoteBoxEl : localBoxEl;
        var mainEl = isSwapped ? localBoxEl : remoteBoxEl;

        mainEl.style.top = '0px';
        mainEl.style.left = '0px';

        if (isMinimized) return;

        var bounds = getSafeVerticalBounds();
        var leftPx = pipSideX === 'left' ? EDGE_PAD : Math.max(EDGE_PAD, window.innerWidth - PIP_W - EDGE_PAD);
        var topPx = pipSideY === 'top' ? bounds.topMin : bounds.bottomMax;

        pipEl.style.left = leftPx + 'px';
        pipEl.style.top = topPx + 'px';
      }

      function syncVideoLayout() {
        var isVideoCall = currentCallType === 'video' || Boolean(localVideoTrack && !currentCameraOff) || Boolean(remoteVideoTrack && !currentRemoteMuted);

        if (isMinimized) {
          document.body.classList.add('minimized-mode');
        } else {
          document.body.classList.remove('minimized-mode');
        }

        if (!isVideoCall) {
          remoteBoxEl.style.display = 'none';
          localBoxEl.style.display = 'none';
          return;
        }

        remoteBoxEl.style.display = 'block';
        localBoxEl.style.display = isMinimized ? 'none' : 'block';

        if (isSwapped && !isMinimized) {
          localBoxEl.className = 'video-box slot-main';
          remoteBoxEl.className = 'video-box slot-pip';
        } else {
          remoteBoxEl.className = 'video-box slot-main';
          localBoxEl.className = 'video-box slot-pip';
        }

        // Local video state
        if (localVideoTrack && !currentCameraOff) {
          localVideoEl.style.display = 'block';
          localOffEl.style.display = 'none';
          if (currentFacing === 'user') {
            localVideoEl.classList.add('mirrored');
          } else {
            localVideoEl.classList.remove('mirrored');
          }
        } else {
          localVideoEl.style.display = 'none';
          localOffEl.style.display = 'flex';
        }

        // Remote video state (only show Cam off badge inside PiP when swapped; when main, RN draws clean avatar placeholder)
        if (remoteVideoTrack && !currentRemoteMuted) {
          remoteVideoEl.style.display = 'block';
          remoteOffEl.style.display = 'none';
        } else {
          remoteVideoEl.style.display = 'none';
          remoteOffEl.style.display = isSwapped && !isMinimized ? 'flex' : 'none';
        }

        pipMuteBadgeEl.style.display = currentMicMuted && !(isSwapped && !isMinimized) ? 'flex' : 'none';

        applyPipCornerPosition();
      }

      // Touch interaction: drag & magnetic snap on PiP + tap to swap; tap main to toggle controls
      function setupBoxTouchHandlers(boxEl) {
        var startX = 0;
        var startY = 0;
        var originLeft = 0;
        var originTop = 0;
        var dragging = false;
        var moved = false;

        boxEl.addEventListener('touchstart', function (e) {
          if (!e.touches || e.touches.length === 0) return;
          var t = e.touches[0];
          startX = t.clientX;
          startY = t.clientY;
          moved = false;
          dragging = boxEl.classList.contains('slot-pip') && !isMinimized;
          if (dragging) {
            originLeft = parseFloat(boxEl.style.left || '0') || boxEl.getBoundingClientRect().left;
            originTop = parseFloat(boxEl.style.top || '0') || boxEl.getBoundingClientRect().top;
          }
        }, { passive: true });

        boxEl.addEventListener('touchmove', function (e) {
          if (!dragging || !e.touches || e.touches.length === 0) return;
          var t = e.touches[0];
          var dx = t.clientX - startX;
          var dy = t.clientY - startY;
          if (!moved && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
            moved = true;
            boxEl.classList.add('dragging');
          }
          if (moved) {
            var bounds = getSafeVerticalBounds();
            var nextLeft = Math.max(EDGE_PAD, Math.min(window.innerWidth - PIP_W - EDGE_PAD, originLeft + dx));
            var nextTop = Math.max(40, Math.min(bounds.bottomMax + 30, originTop + dy));
            boxEl.style.left = nextLeft + 'px';
            boxEl.style.top = nextTop + 'px';
          }
        }, { passive: true });

        boxEl.addEventListener('touchend', function () {
          boxEl.classList.remove('dragging');
          if (dragging) {
            dragging = false;
            if (moved) {
              var rect = boxEl.getBoundingClientRect();
              var centerX = rect.left + rect.width / 2;
              var centerY = rect.top + rect.height / 2;
              pipSideX = centerX < window.innerWidth / 2 ? 'left' : 'right';
              pipSideY = centerY < window.innerHeight / 2 ? 'top' : 'bottom';
              applyPipCornerPosition();
            } else {
              window.__CALL_BRIDGE__.toggleSwap();
            }
          } else if (!moved && boxEl.classList.contains('slot-main') && !isMinimized) {
            post('TOGGLE_CONTROLS', {});
          }
        }, { passive: true });
      }

      setupBoxTouchHandlers(localBoxEl);
      setupBoxTouchHandlers(remoteBoxEl);

      window.addEventListener('resize', applyPipCornerPosition);

      function attachLocalVideo(track) {
        if (localVideoTrack && localVideoTrack !== track) {
          try { localVideoTrack.detach(localVideoEl); } catch (e) {}
        }
        localVideoTrack = track || null;
        if (localVideoTrack) {
          try {
            localVideoTrack.attach(localVideoEl);
            localVideoEl.muted = true;
            localVideoEl.play().catch(function () {});
          } catch (e) {}
        }
        syncVideoLayout();
      }

      function attachRemoteVideo(track) {
        if (remoteVideoTrack && remoteVideoTrack !== track) {
          try { remoteVideoTrack.detach(remoteVideoEl); } catch (e) {}
        }
        remoteVideoTrack = track || null;
        if (remoteVideoTrack) {
          try {
            remoteVideoTrack.attach(remoteVideoEl);
            remoteVideoEl.play().catch(function () {});
          } catch (e) {}
        }
        syncVideoLayout();
      }

      function detachElementStreams(el) {
        try {
          if (el && el.srcObject && typeof el.srcObject.getTracks === 'function') {
            el.srcObject.getTracks().forEach(function (t) {
              try { t.stop(); } catch (e) {}
            });
          }
          if (el) el.srcObject = null;
        } catch (e) {}
      }

      function stopLocalMediaAndRoom() {
        isDisconnecting = true;
        activeSessionKey = null;
        attachedAudioTrackId = null;

        if (preparedRoom) {
          try {
            preparedRoom.removeAllListeners();
            preparedRoom.disconnect(true);
          } catch (e) {}
          preparedRoom = null;
          preparedKey = null;
        }

        if (pendingTracks.length > 0) {
          pendingTracks.forEach(function (t) {
            try { t.stop(); } catch (e) {}
          });
          pendingTracks = [];
        }

        if (localVideoTrack) {
          try {
            localVideoTrack.detach(localVideoEl);
            localVideoTrack.stop();
          } catch (e) {}
          localVideoTrack = null;
        }

        if (remoteVideoTrack) {
          try {
            remoteVideoTrack.detach(remoteVideoEl);
          } catch (e) {}
          remoteVideoTrack = null;
        }

        detachElementStreams(localVideoEl);
        detachElementStreams(remoteVideoEl);
        detachElementStreams(remoteAudioEl);

        remoteBoxEl.style.display = 'none';
        localBoxEl.style.display = 'none';
        audioUnlockBtnEl.style.display = 'none';

        if (activeRoom) {
          var roomToClose = activeRoom;
          activeRoom = null;
          try {
            roomToClose.removeAllListeners();
            roomToClose.disconnect(true);
          } catch (e) {}
        }
      }

      function createOptimizedRoom(LK, facing) {
        return new LK.Room({
          adaptiveStream: false,
          dynacast: false,
          videoCaptureDefaults: {
            resolution: LK.VideoPresets.h540.resolution,
            facingMode: facing || 'user',
          },
          publishDefaults: {
            simulcast: false,
            dtx: true,
            red: true,
            videoCodec: 'vp8',
            videoEncoding: {
              maxBitrate: 900000,
              maxFramerate: 30,
            },
          },
        });
      }

      window.__CALL_BRIDGE__ = {
        prepare: function (url, token, facingMode) {
          if (!window.LivekitClient || !url || !token || activeRoom) return;
          var key = String(url) + ':' + String(token);
          if (preparedKey === key && preparedRoom) return;

          if (preparedRoom) {
            try { preparedRoom.disconnect(true); } catch (e) {}
            preparedRoom = null;
          }

          try {
            var r = createOptimizedRoom(window.LivekitClient, facingMode || 'user');
            preparedRoom = r;
            preparedKey = key;
            if (typeof r.prepareConnection === 'function') {
              r.prepareConnection(url, token).catch(function () {});
            }
          } catch (e) {}
        },

        connect: async function (config) {
          if (!window.LivekitClient) {
            post('ERROR', { message: 'LiveKit SDK not loaded yet' });
            return;
          }
          if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
            post('ERROR', { message: 'Camera/Microphone unavailable in this WebView security context' });
            return;
          }

          var sessionKey = String(config.roomName) + ':' + String(config.token);
          if (activeRoom && activeSessionKey === sessionKey && !isDisconnecting) {
            return;
          }

          // Preserve preparedRoom only if it matches this exact URL & token before cleanup
          var reusePrepared = null;
          var targetPrepKey = String(config.url) + ':' + String(config.token);
          if (preparedRoom && preparedKey === targetPrepKey) {
            reusePrepared = preparedRoom;
            preparedRoom = null;
            preparedKey = null;
          }

          if (activeRoom) {
            stopLocalMediaAndRoom();
          }

          isDisconnecting = false;
          activeSessionKey = sessionKey;
          attachedAudioTrackId = null;
          currentCallType = config.callType || 'video';
          currentFacing = config.facingMode || 'user';
          currentCameraOff = Boolean(config.isCameraOff);
          currentMicMuted = Boolean(config.isMicMuted);
          currentRemoteMuted = false;
          isSwapped = false;
          syncVideoLayout();

          var LK = window.LivekitClient;
          var RoomEvent = LK.RoomEvent;
          var Track = LK.Track;
          var VideoPresets = LK.VideoPresets;

          var shouldCaptureVideo = currentCallType === 'video' && !currentCameraOff;
          var audioConstraints = currentMicMuted
            ? false
            : { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

          var localAudioSettled = currentMicMuted;
          var remoteMediaSubscribed = false;
          var mediaConnectedNotified = false;
          var mutedFallbackTimer = null;

          function notifyConnectedOnce() {
            if (mediaConnectedNotified || isDisconnecting || activeSessionKey !== sessionKey) return;
            mediaConnectedNotified = true;
            if (mutedFallbackTimer) {
              clearTimeout(mutedFallbackTimer);
              mutedFallbackTimer = null;
            }
            post('PARTICIPANT_CONNECTED', {});
          }

          function checkMediaReady(roomRef) {
            if (mediaConnectedNotified || isDisconnecting || activeSessionKey !== sessionKey) return;
            if (remoteMediaSubscribed) {
              notifyConnectedOnce();
              return;
            }
            if (roomRef && roomRef.remoteParticipants && roomRef.remoteParticipants.size > 0) {
              if (localAudioSettled) {
                notifyConnectedOnce();
                return;
              }
              if (!mutedFallbackTimer) {
                mutedFallbackTimer = setTimeout(function () {
                  if (!mediaConnectedNotified && activeRoom === roomRef && roomRef.remoteParticipants.size > 0) {
                    notifyConnectedOnce();
                  }
                }, 650);
              }
            }
          }

          // Capture microphone IMMEDIATELY without blocking on camera hardware initialization
          var audioCapturePromise = (async function () {
            if (!audioConstraints) {
              post('LOCAL_MEDIA_STATE', { hasAudio: false, micMuted: true });
              return null;
            }
            var track = null;
            try {
              var tracks = await LK.createLocalTracks({ audio: audioConstraints, video: false });
              track = tracks.find(function (t) { return t.kind === Track.Kind.Audio; }) || null;
            } catch (err) {
              try {
                var fallback = await LK.createLocalTracks({ audio: true, video: false });
                track = fallback.find(function (t) { return t.kind === Track.Kind.Audio; }) || null;
              } catch (plainErr) {
                var pMsg = plainErr && plainErr.name ? (plainErr.name + ': ' + plainErr.message) : String(plainErr);
                log('error', 'Audio capture failed: ' + pMsg);
                currentMicMuted = true;
                post('ERROR', { message: 'Microphone access failed (' + pMsg + ')' });
              }
            }
            if (track && (isDisconnecting || activeSessionKey !== sessionKey)) {
              try { track.stop(); } catch (e) {}
              return null;
            }
            if (track) pendingTracks.push(track);
            post('LOCAL_MEDIA_STATE', {
              hasAudio: Boolean(track),
              micMuted: currentMicMuted || !track,
            });
            return track;
          })();

          // Capture camera concurrently so hardware camera warm-up never delays voice audio
          var videoCapturePromise = (async function () {
            if (!shouldCaptureVideo) {
              currentCameraOff = true;
              syncVideoLayout();
              post('LOCAL_MEDIA_STATE', { hasVideo: false, cameraOff: true, facingMode: currentFacing });
              return null;
            }
            var vidTrack = null;
            try {
              var vTracks = await LK.createLocalTracks({
                audio: false,
                video: { facingMode: currentFacing, resolution: VideoPresets.h540.resolution },
              });
              vidTrack = vTracks.find(function (t) { return t.kind === Track.Kind.Video; }) || null;
            } catch (err) {
              var errMsg = err && err.name ? (err.name + ': ' + err.message) : String(err);
              log('warn', 'Video capture failed: ' + errMsg);
              currentCameraOff = true;
            }
            if (vidTrack && (isDisconnecting || activeSessionKey !== sessionKey)) {
              try { vidTrack.stop(); } catch (e) {}
              return null;
            }
            if (vidTrack) {
              pendingTracks.push(vidTrack);
              attachLocalVideo(vidTrack);
            } else {
              currentCameraOff = true;
              syncVideoLayout();
            }
            post('LOCAL_MEDIA_STATE', {
              hasVideo: Boolean(vidTrack),
              cameraOff: !vidTrack,
              facingMode: currentFacing,
            });
            return vidTrack;
          })();

          var roomPromise = (async function () {
            var room = reusePrepared || createOptimizedRoom(LK, currentFacing);

            function handleTrackSubscribed(track) {
              if (isDisconnecting || activeRoom !== room) return;
              if (track.kind === Track.Kind.Video) {
                currentCallType = 'video';
                currentRemoteMuted = Boolean(track.isMuted);
                attachRemoteVideo(track);
                post('REMOTE_VIDEO_STATE', { hasVideo: true, muted: currentRemoteMuted });
                remoteMediaSubscribed = true;
                checkMediaReady(room);
              } else if (track.kind === Track.Kind.Audio) {
                var tid = track.sid || (track.mediaStreamTrack && track.mediaStreamTrack.id) || 'audio';
                if (attachedAudioTrackId !== tid) {
                  attachedAudioTrackId = tid;
                  try { track.attach(remoteAudioEl); } catch (e) {}
                }
                remoteAudioEl.muted = false;
                remoteAudioEl.volume = 1.0;
                remoteAudioEl.onplaying = function () {
                  remoteMediaSubscribed = true;
                  checkMediaReady(room);
                };
                remoteAudioEl.play().catch(function () {
                  audioUnlockBtnEl.style.display = 'flex';
                  post('AUDIO_PLAYBACK_BLOCKED', { blocked: true });
                });
                post('REMOTE_AUDIO_STATE', { hasAudio: true, muted: Boolean(track.isMuted) });
                remoteMediaSubscribed = true;
                checkMediaReady(room);
              }
            }

            room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);

            room.on(RoomEvent.TrackUnsubscribed, function (track) {
              try { track.detach(); } catch (e) {}
              if (track.kind === Track.Kind.Video) {
                currentRemoteMuted = false;
                attachRemoteVideo(null);
                post('REMOTE_VIDEO_STATE', { hasVideo: false, muted: false });
              } else if (track.kind === Track.Kind.Audio) {
                attachedAudioTrackId = null;
                post('REMOTE_AUDIO_STATE', { hasAudio: false, muted: false });
              }
            });

            room.on(RoomEvent.TrackMuted, function (pub, participant) {
              if (!participant.isLocal) {
                if (pub.kind === Track.Kind.Video) {
                  currentRemoteMuted = true;
                  syncVideoLayout();
                  post('REMOTE_VIDEO_STATE', { hasVideo: true, muted: true });
                } else if (pub.kind === Track.Kind.Audio) {
                  post('REMOTE_AUDIO_STATE', { hasAudio: true, muted: true });
                }
              }
            });

            room.on(RoomEvent.TrackUnmuted, function (pub, participant) {
              if (!participant.isLocal) {
                if (pub.kind === Track.Kind.Video) {
                  currentCallType = 'video';
                  currentRemoteMuted = false;
                  syncVideoLayout();
                  remoteVideoEl.play().catch(function () {});
                  post('REMOTE_VIDEO_STATE', { hasVideo: true, muted: false });
                } else if (pub.kind === Track.Kind.Audio) {
                  post('REMOTE_AUDIO_STATE', { hasAudio: true, muted: false });
                }
              }
            });

            room.on(RoomEvent.LocalTrackPublished, function (pub) {
              if (pub.kind === Track.Kind.Video && pub.track && !isSwitchingCamera) {
                currentCameraOff = false;
                attachLocalVideo(pub.track);
                post('LOCAL_MEDIA_STATE', { hasVideo: true, cameraOff: false });
              }
            });

            room.on(RoomEvent.LocalTrackUnpublished, function (pub) {
              if (pub.kind === Track.Kind.Video && !isSwitchingCamera) {
                currentCameraOff = true;
                attachLocalVideo(null);
                post('LOCAL_MEDIA_STATE', { hasVideo: false, cameraOff: true });
              }
            });

            room.on(RoomEvent.ParticipantConnected, function () {
              checkMediaReady(room);
            });

            room.on(RoomEvent.ParticipantDisconnected, function () {
              if (room.remoteParticipants.size === 0 && !isDisconnecting) {
                post('PARTICIPANT_DISCONNECTED', {});
              }
            });

            room.on(RoomEvent.AudioPlaybackStatusChanged, function () {
              var blocked = !room.canPlaybackAudio;
              audioUnlockBtnEl.style.display = blocked ? 'flex' : 'none';
              post('AUDIO_PLAYBACK_BLOCKED', { blocked: blocked });
            });

            room.on(RoomEvent.Disconnected, function () {
              if (mutedFallbackTimer) {
                clearTimeout(mutedFallbackTimer);
                mutedFallbackTimer = null;
              }
              if (!isDisconnecting && activeRoom === room) {
                post('ROOM_DISCONNECTED', {});
              }
            });

            var publishedEarlyAudio = false;
            var publishPromiseEarly = null;

            room.on(RoomEvent.SignalConnected, function () {
              // Publish microphone as soon as WebSocket signals join so audio negotiates without extra round-trip
              publishPromiseEarly = audioCapturePromise.then(function (track) {
                if (!track || publishedEarlyAudio || isDisconnecting || activeRoom !== room) return null;
                publishedEarlyAudio = true;
                return room.localParticipant
                  .publishTrack(track, {
                    source: Track.Source.Microphone,
                    simulcast: false,
                  })
                  .then(function () {
                    pendingTracks = pendingTracks.filter(function (t) { return t !== track; });
                    localAudioSettled = true;
                    checkMediaReady(room);
                  })
                  .catch(function () {
                    publishedEarlyAudio = false;
                  });
              });
            });

            activeRoom = room;
            room.startAudio().catch(function () {});
            await room.connect(config.url, config.token);

            if (isDisconnecting || activeSessionKey !== sessionKey) {
              try {
                room.removeAllListeners();
                room.disconnect(true);
              } catch (e) {}
              return null;
            }

            if (publishPromiseEarly) {
              await publishPromiseEarly.catch(function () {});
            }

            room.startAudio().catch(function () {});
            var blocked = !room.canPlaybackAudio;
            audioUnlockBtnEl.style.display = blocked ? 'flex' : 'none';
            post('AUDIO_PLAYBACK_BLOCKED', { blocked: blocked });
            post('ROOM_CONNECTED', {});

            if (room.remoteParticipants.size > 0) {
              room.remoteParticipants.forEach(function (participant) {
                participant.trackPublications.forEach(function (pub) {
                  if (pub.isSubscribed && pub.track) {
                    handleTrackSubscribed(pub.track);
                  }
                });
              });
              checkMediaReady(room);
            }

            return room;
          })();

          try {
            // Publish voice audio as soon as room & mic are ready — zero waiting for camera
            var audioAndRoom = await Promise.all([roomPromise, audioCapturePromise]);
            var connectedRoom = audioAndRoom[0];
            var audioTrack = audioAndRoom[1];

            if (!connectedRoom || isDisconnecting || activeSessionKey !== sessionKey) {
              if (audioTrack) { try { audioTrack.stop(); } catch (e) {} }
              return;
            }

            if (audioTrack && !localAudioSettled) {
              await connectedRoom.localParticipant.publishTrack(audioTrack, {
                source: Track.Source.Microphone,
                simulcast: false,
              }).catch(function () {});
              pendingTracks = pendingTracks.filter(function (t) { return t !== audioTrack; });
            } else if (currentMicMuted) {
              await connectedRoom.localParticipant.setMicrophoneEnabled(false).catch(function () {});
            }

            localAudioSettled = true;
            checkMediaReady(connectedRoom);

            // Publish video track independently once camera hardware initializes
            videoCapturePromise.then(async function (vidTrack) {
              if (!vidTrack || isDisconnecting || activeSessionKey !== sessionKey || activeRoom !== connectedRoom) {
                if (vidTrack) { try { vidTrack.stop(); } catch (e) {} }
                return;
              }
              await connectedRoom.localParticipant.publishTrack(vidTrack, {
                source: Track.Source.Camera,
                simulcast: false,
              }).catch(function () {});
              pendingTracks = pendingTracks.filter(function (t) { return t !== vidTrack; });
            });
          } catch (err) {
            log('error', 'LiveKit connect failed: ' + (err && err.message ? err.message : err));
            post('ERROR', { message: 'Failed to connect to call server' });
          }
        },

        toggleSwap: function (explicitSwap) {
          isSwapped = typeof explicitSwap === 'boolean' ? explicitSwap : !isSwapped;
          syncVideoLayout();
          post('SWAP_CHANGED', { isSwapped: isSwapped });
        },

        setMinimized: function (minimized) {
          isMinimized = Boolean(minimized);
          syncVideoLayout();
        },

        setControlsVisible: function (visible) {
          controlsVisible = Boolean(visible);
          applyPipCornerPosition();
        },

        setMic: async function (muted) {
          currentMicMuted = Boolean(muted);
          syncVideoLayout();
          if (activeRoom && activeRoom.localParticipant) {
            try {
              await activeRoom.localParticipant.setMicrophoneEnabled(!currentMicMuted);
              post('LOCAL_MEDIA_STATE', { micMuted: currentMicMuted });
            } catch (err) {
              log('warn', 'setMic error: ' + (err && err.message ? err.message : err));
              post('ERROR', { message: 'Could not toggle microphone' });
            }
          }
        },

        setCamera: async function (enabled) {
          var enableCam = Boolean(enabled);
          if (enableCam) {
            currentCallType = 'video';
          }
          currentCameraOff = !enableCam;
          syncVideoLayout();

          if (activeRoom && activeRoom.localParticipant && window.LivekitClient) {
            var Track = window.LivekitClient.Track;
            try {
              await activeRoom.localParticipant.setCameraEnabled(enableCam);
              var camPub = activeRoom.localParticipant.getTrackPublication(Track.Source.Camera);
              var track = enableCam && camPub ? camPub.track || camPub.videoTrack || null : null;
              attachLocalVideo(track);
              post('LOCAL_MEDIA_STATE', { hasVideo: Boolean(track), cameraOff: !enableCam });
            } catch (err) {
              currentCameraOff = true;
              attachLocalVideo(null);
              log('warn', 'setCamera error: ' + (err && err.message ? err.message : err));
              post('ERROR', { message: 'Could not access camera' });
            }
          }
        },

        switchCamera: async function (nextFacingMode) {
          var targetFacing = nextFacingMode || (currentFacing === 'user' ? 'environment' : 'user');
          currentFacing = targetFacing;
          syncVideoLayout();

          if (!activeRoom || !activeRoom.localParticipant || !window.LivekitClient || currentCameraOff) {
            return;
          }

          var LK = window.LivekitClient;
          var Track = LK.Track;
          var VideoPresets = LK.VideoPresets;
          var camPub = activeRoom.localParticipant.getTrackPublication(Track.Source.Camera);
          var camTrack = camPub ? (camPub.videoTrack || camPub.track) : localVideoTrack;

          if (!camTrack) return;

          isSwitchingCamera = true;
          try {
            await camTrack.restartTrack({
              facingMode: targetFacing,
              resolution: VideoPresets.h540.resolution,
            });
            attachLocalVideo(camTrack);
            post('LOCAL_MEDIA_STATE', { facingMode: targetFacing });
          } catch (err) {
            try {
              await activeRoom.localParticipant.setCameraEnabled(false);
              await new Promise(function (resolve) { setTimeout(resolve, 100); });
              await activeRoom.localParticipant.setCameraEnabled(true, {
                facingMode: targetFacing,
                resolution: VideoPresets.h540.resolution,
              });
              var nextPub = activeRoom.localParticipant.getTrackPublication(Track.Source.Camera);
              var nextTrack = nextPub ? (nextPub.videoTrack || nextPub.track) : null;
              attachLocalVideo(nextTrack);
              post('LOCAL_MEDIA_STATE', { facingMode: targetFacing, hasVideo: Boolean(nextTrack) });
            } catch (retryErr) {
              log('warn', 'switchCamera retry failed: ' + (retryErr && retryErr.message ? retryErr.message : retryErr));
              post('ERROR', { message: 'Could not switch camera' });
            }
          } finally {
            isSwitchingCamera = false;
          }
        },

        unlockAudio: async function () {
          if (!activeRoom) return;
          try {
            await activeRoom.startAudio();
            if (remoteAudioEl && remoteAudioEl.srcObject) {
              remoteAudioEl.play().catch(function () {});
            }
            var blocked = !activeRoom.canPlaybackAudio;
            audioUnlockBtnEl.style.display = blocked ? 'flex' : 'none';
            post('AUDIO_PLAYBACK_BLOCKED', { blocked: blocked });
          } catch (e) {}
        },

        disconnect: function () {
          stopLocalMediaAndRoom();
        },
      };

      window.addEventListener('pagehide', stopLocalMediaAndRoom);
      window.addEventListener('beforeunload', stopLocalMediaAndRoom);

      function notifyReady() {
        if (!window.__SDK_LOADED__) {
          post('BRIDGE_READY', {});
        }
      }

      notifyReady();
      window.addEventListener('load', notifyReady);
      setTimeout(notifyReady, 80);
    })();
  </script>
</body>
</html>`;
