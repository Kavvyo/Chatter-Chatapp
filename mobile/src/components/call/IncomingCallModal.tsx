import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Lock, Phone, PhoneOff, Video } from 'lucide-react-native';
import { useCallStore } from '../../store/useCallStore';
import Avatar from '../ui/Avatar';

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
      {/* Top Info */}
      <View style={styles.topSection}>
        <View style={styles.encryptedRow}>
          <Lock size={12} color="#8696a0" />
          <Text style={styles.encryptedText}>
            {isVoice ? 'Chatter Voice Call' : 'Chatter Video Call'}
          </Text>
        </View>

        <Text style={styles.callerName} numberOfLines={1}>
          {callerName || 'Incoming Caller'}
        </Text>
        <Text style={styles.statusText}>
          {isVoice ? 'Ringing • Voice' : 'Ringing • Video'}
        </Text>
      </View>

      {/* Center Pulsing Caller Avatar */}
      <View style={styles.centerSection}>
        <View style={styles.avatarContainer}>
          <View style={styles.outerPulse} />
          <View style={styles.innerPulse} />
          <Avatar
            uri={callerAvatar}
            size={128}
            imageStyle={{ borderWidth: 3, borderColor: 'rgba(16, 185, 129, 0.5)' }}
          />
          <View style={styles.typeBadge}>
            {isVoice ? <Phone size={15} color="#ffffff" /> : <Video size={15} color="#ffffff" />}
          </View>
        </View>
      </View>

      {/* Bottom Ergonomic WhatsApp-Style Action Buttons */}
      <View style={styles.actions}>
        <View style={styles.actionCol}>
          <TouchableOpacity
            onPress={() => rejectCall()}
            style={[styles.button, styles.declineBtn]}
            activeOpacity={0.85}
          >
            <PhoneOff size={28} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.btnLabel}>Decline</Text>
        </View>

        <View style={styles.actionCol}>
          <TouchableOpacity
            onPress={answerCall}
            style={[styles.button, styles.acceptBtn]}
            activeOpacity={0.85}
          >
            {isVoice ? <Phone size={28} color="#ffffff" /> : <Video size={28} color="#ffffff" />}
          </TouchableOpacity>
          <Text style={styles.btnLabel}>Accept</Text>
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
    backgroundColor: '#0b141a',
    justifyContent: 'space-between',
    paddingTop: 72,
    paddingBottom: 60,
    paddingHorizontal: 28,
  },
  topSection: {
    alignItems: 'center',
    gap: 8,
  },
  encryptedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  encryptedText: {
    color: '#8696a0',
    fontSize: 13,
    fontWeight: '500',
  },
  callerName: {
    color: '#e9edef',
    fontSize: 30,
    fontWeight: '700',
    textAlign: 'center',
  },
  statusText: {
    color: '#8696a0',
    fontSize: 15,
    fontWeight: '500',
  },
  centerSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 176,
    height: 176,
    justifyContent: 'center',
    alignItems: 'center',
  },
  outerPulse: {
    position: 'absolute',
    width: 176,
    height: 176,
    borderRadius: 88,
    backgroundColor: 'rgba(0, 168, 132, 0.12)',
  },
  innerPulse: {
    position: 'absolute',
    width: 152,
    height: 152,
    borderRadius: 76,
    backgroundColor: 'rgba(0, 168, 132, 0.2)',
  },
  typeBadge: {
    position: 'absolute',
    bottom: 18,
    right: 18,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#00a884',
    borderWidth: 2,
    borderColor: '#0b141a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  actionCol: {
    alignItems: 'center',
    gap: 10,
  },
  button: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 10,
  },
  declineBtn: {
    backgroundColor: '#ef4444',
  },
  acceptBtn: {
    backgroundColor: '#00a884',
  },
  btnLabel: {
    color: '#d1d7db',
    fontSize: 14,
    fontWeight: '600',
  },
});
