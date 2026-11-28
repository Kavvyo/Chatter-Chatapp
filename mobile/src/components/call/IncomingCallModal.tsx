import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Phone, PhoneOff, Video } from 'lucide-react-native';
import { useCallStore } from '../../store/useCallStore';
import { CallFullScreenBackdrop } from './CallFullScreenBackdrop';

export const IncomingCallModal = () => {
  const {
    receivingCall,
    callerName,
    callerAvatar,
    callType,
    callAccepted,
    answerCall,
    rejectCall,
  } = useCallStore();

  if (!receivingCall || callAccepted) return null;

  const isVoice = callType === 'voice';

  return (
    <View style={styles.overlay}>
      <StatusBar style="light" />

      {/* Full-screen darkened caller portrait + centered name header */}
      <CallFullScreenBackdrop
        avatarUri={callerAvatar}
        name={callerName || 'Incoming Caller'}
        subtitle={isVoice ? 'Chatter Audio...' : 'Chatter Video...'}
        showPhoto={true}
      />

      {/* Bottom Decline / Accept circular buttons directly over darkened portrait */}
      <View style={styles.bottomArea}>
        <View style={styles.primaryRow}>
          <View style={styles.actionCol}>
            <TouchableOpacity
              onPress={() => rejectCall()}
              style={[styles.primaryBtn, styles.declineBtn]}
              activeOpacity={0.85}
            >
              <PhoneOff size={28} color="#ffffff" />
            </TouchableOpacity>
            <Text style={styles.primaryLabel}>Decline</Text>
          </View>

          <View style={styles.actionCol}>
            <TouchableOpacity
              onPress={answerCall}
              style={[styles.primaryBtn, styles.acceptBtn]}
              activeOpacity={0.85}
            >
              {isVoice ? (
                <Phone size={28} color="#ffffff" />
              ) : (
                <Video size={28} color="#ffffff" />
              )}
            </TouchableOpacity>
            <Text style={styles.primaryLabel}>Accept</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    backgroundColor: '#111827',
    justifyContent: 'flex-end',
  },
  bottomArea: {
    zIndex: 20,
    paddingHorizontal: 46,
    paddingBottom: 56,
  },
  primaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionCol: {
    alignItems: 'center',
    gap: 10,
    width: 78,
  },
  primaryBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
  },
  declineBtn: {
    backgroundColor: '#ff3b30',
  },
  acceptBtn: {
    backgroundColor: '#34c759',
  },
  primaryLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
