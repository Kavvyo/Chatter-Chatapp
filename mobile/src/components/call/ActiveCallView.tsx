import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Mic, MicOff, PhoneOff, SwitchCamera, Video, VideoOff, Volume2 } from 'lucide-react-native';
import { useCallStore } from '../../store/useCallStore';
import Avatar from '../ui/Avatar';

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const ActiveCallView = () => {
  const {
    callActive,
    callType,
    callStatus,
    callDuration,
    targetUser,
    callerName,
    callerAvatar,
    isMicMuted,
    isCameraOff,
    facingMode,
    toggleMic,
    toggleCamera,
    switchCamera,
    leaveCall,
  } = useCallStore();

  if (!callActive) return null;

  const participantName = targetUser?.fullName || callerName || 'User';
  const participantAvatar = targetUser?.profilePic || callerAvatar || '';
  const isVoice = callType === 'voice';
  const isConnected = callStatus === 'connected';

  return (
    <Modal visible={true} animationType="slide" transparent={false}>
      <StatusBar style="light" />
      <View style={styles.container}>
        {/* Top Header Overlay */}
        <View style={styles.headerOverlay}>
          <View style={styles.headerLeft}>
            <Avatar
              uri={participantAvatar}
              size={44}
              imageStyle={{ borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)' }}
            />
            <View>
              <Text style={styles.headerName} numberOfLines={1}>
                {participantName}
              </Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: isConnected ? '#10b981' : '#f59e0b' }]} />
                <Text style={styles.statusLabel}>
                  {isConnected ? formatDuration(callDuration) : callStatus === 'ringing' ? 'Ringing...' : 'Connecting...'}
                </Text>
                <Text style={styles.statusDotSeparator}>•</Text>
                <Text style={styles.callTypeLabel}>{callType.toUpperCase()}</Text>
              </View>
            </View>
          </View>

          <View style={styles.badge}>
            <Text style={styles.badgeText}>{isConnected ? 'HD Live' : 'Connecting'}</Text>
          </View>
        </View>

        {/* Center Main View Area */}
        <View style={styles.centerArea}>
          {isVoice ? (
            /* VOICE CALL MODE */
            <View style={styles.voiceMode}>
              <View style={styles.pulseContainer}>
                {isConnected && (
                  <>
                    <View style={styles.voicePulseOuter} />
                    <View style={styles.voicePulseInner} />
                  </>
                )}
                <Avatar
                  uri={participantAvatar}
                  size={120}
                  imageStyle={{ borderWidth: 3, borderColor: 'rgba(255,255,255,0.25)' }}
                />
              </View>

              <Text style={styles.voiceName}>{participantName}</Text>
              <View style={styles.voiceStatusRow}>
                {isConnected && <Volume2 size={18} color="#10b981" />}
                <Text style={styles.voiceStatusText}>
                  {isConnected ? 'In Voice Call' : callStatus === 'ringing' ? 'Ringing...' : 'Connecting...'}
                </Text>
              </View>

              {isConnected && (
                <Text style={styles.voiceTimer}>{formatDuration(callDuration)}</Text>
              )}
            </View>
          ) : (
            /* VIDEO CALL MODE */
            <View style={styles.videoMode}>
              {/* Remote view fallback placeholder */}
              <View style={styles.remoteVideoPlaceholder}>
                <Avatar
                  uri={participantAvatar}
                  size={100}
                  imageStyle={{ borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' }}
                />
                <Text style={styles.remoteName}>{participantName}</Text>
                <Text style={styles.remoteStatus}>
                  {isConnected ? (isCameraOff ? 'Camera is off' : 'Connected') : 'Connecting video...'}
                </Text>
              </View>

              {/* Local Video PiP Preview */}
              <View style={styles.pipPreview}>
                {!isCameraOff ? (
                  <View style={styles.pipActive}>
                    <Text style={styles.pipText}>{facingMode === 'user' ? 'Front Camera' : 'Back Camera'}</Text>
                  </View>
                ) : (
                  <View style={styles.pipOff}>
                    <VideoOff size={18} color="#f87171" />
                    <Text style={styles.pipOffText}>Camera off</Text>
                  </View>
                )}
                {isMicMuted && (
                  <View style={styles.pipMuteBadge}>
                    <MicOff size={10} color="#ffffff" />
                  </View>
                )}
              </View>
            </View>
          )}
        </View>

        {/* Bottom Floating Control Dock */}
        <View style={styles.bottomDockWrapper}>
          <View style={styles.bottomDock}>
            {/* Mic Toggle */}
            <TouchableOpacity
              onPress={toggleMic}
              style={[styles.dockBtn, isMicMuted && styles.dockBtnMuted]}
              activeOpacity={0.8}
            >
              {isMicMuted ? <MicOff size={22} color="#f87171" /> : <Mic size={22} color="#ffffff" />}
            </TouchableOpacity>

            {/* Camera Toggle */}
            <TouchableOpacity
              onPress={toggleCamera}
              style={[styles.dockBtn, isCameraOff && styles.dockBtnMuted]}
              activeOpacity={0.8}
            >
              {isCameraOff ? <VideoOff size={22} color="#f87171" /> : <Video size={22} color="#ffffff" />}
            </TouchableOpacity>

            {/* Camera Flip */}
            {!isCameraOff && (
              <TouchableOpacity onPress={switchCamera} style={styles.dockBtn} activeOpacity={0.8}>
                <SwitchCamera size={22} color="#d4d4d8" />
              </TouchableOpacity>
            )}

            {/* End Call */}
            <TouchableOpacity onPress={() => leaveCall(true)} style={styles.endCallBtn} activeOpacity={0.8}>
              <PhoneOff size={26} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
    justifyContent: 'space-between',
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    paddingTop: 48,
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  headerName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    maxWidth: 180,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    color: '#d4d4d8',
    fontSize: 12,
  },
  statusDotSeparator: {
    color: '#71717a',
    fontSize: 12,
  },
  callTypeLabel: {
    color: '#a1a1aa',
    fontSize: 11,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  centerArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceMode: {
    alignItems: 'center',
    gap: 16,
  },
  pulseContainer: {
    width: 180,
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  voicePulseOuter: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  voicePulseInner: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  voiceAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  voiceName: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '700',
  },
  voiceStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  voiceStatusText: {
    color: '#a1a1aa',
    fontSize: 15,
    fontWeight: '500',
  },
  voiceTimer: {
    color: '#10b981',
    fontSize: 22,
    fontFamily: 'monospace',
    fontWeight: '700',
    marginTop: 4,
  },
  videoMode: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  remoteVideoPlaceholder: {
    alignItems: 'center',
    gap: 10,
  },
  remoteAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  remoteName: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '600',
  },
  remoteStatus: {
    color: '#a1a1aa',
    fontSize: 13,
  },
  pipPreview: {
    position: 'absolute',
    top: 110,
    right: 16,
    width: 90,
    height: 130,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#18181b',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    elevation: 10,
  },
  pipActive: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#27272a',
    padding: 4,
  },
  pipText: {
    color: '#ffffff',
    fontSize: 9,
    textAlign: 'center',
  },
  pipOff: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  pipOffText: {
    color: '#a1a1aa',
    fontSize: 9,
  },
  pipMuteBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: '#dc2626',
    borderRadius: 6,
    padding: 2,
  },
  bottomDockWrapper: {
    paddingBottom: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  bottomDock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 36,
    backgroundColor: 'rgba(24, 24, 27, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    elevation: 20,
  },
  dockBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dockBtnMuted: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.5)',
  },
  endCallBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
  },
});
