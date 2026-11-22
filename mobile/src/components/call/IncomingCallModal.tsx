import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Phone, PhoneOff, Video } from 'lucide-react-native';
import { useCallStore } from '../../store/useCallStore';
import { useThemeStore } from '../../store/useThemeStore';
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

  const { theme } = useThemeStore();

  if (!receivingCall || callAccepted) return null;

  const isVoice = callType === 'voice';

  return (
    <Modal visible={true} transparent statusBarTranslucent={true} animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: theme.base100, borderColor: theme.base300 }]}>
          {/* Caller Avatar with pulsing waves */}
          <View style={styles.avatarContainer}>
            <View style={[styles.outerPulse, { backgroundColor: theme.primary + '20' }]} />
            <View style={[styles.innerPulse, { backgroundColor: theme.primary + '35' }]} />
            <Avatar uri={callerAvatar} size={88} imageStyle={{ borderWidth: 3, borderColor: theme.primary }} />
            <View style={[styles.typeBadge, { backgroundColor: theme.primary }]}>
              {isVoice ? <Phone size={14} color="#ffffff" /> : <Video size={14} color="#ffffff" />}
            </View>
          </View>

          {/* Call Type and Name */}
          <View style={[styles.tag, { backgroundColor: theme.primary + '15' }]}>
            <Text style={[styles.tagText, { color: theme.primary }]}>
              {isVoice ? 'VOICE CALL' : 'VIDEO CALL'}
            </Text>
          </View>

          <Text style={[styles.callerName, { color: theme.baseContent }]}>
            {callerName || 'Incoming Caller'}
          </Text>
          <Text style={[styles.statusText, { color: theme.baseContentMuted }]}>
            Incoming call...
          </Text>

          {/* Action Buttons */}
          <View style={styles.actions}>
            {/* Decline */}
            <View style={styles.actionCol}>
              <TouchableOpacity
                onPress={rejectCall}
                style={[styles.button, { backgroundColor: theme.error }]}
                activeOpacity={0.8}
              >
                <PhoneOff size={26} color="#ffffff" />
              </TouchableOpacity>
              <Text style={[styles.btnLabel, { color: theme.baseContentMuted }]}>Decline</Text>
            </View>

            {/* Accept */}
            <View style={styles.actionCol}>
              <TouchableOpacity
                onPress={answerCall}
                style={[styles.button, { backgroundColor: theme.success }]}
                activeOpacity={0.8}
              >
                {isVoice ? <Phone size={26} color="#ffffff" /> : <Video size={26} color="#ffffff" />}
              </TouchableOpacity>
              <Text style={[styles.btnLabel, { color: theme.baseContentMuted }]}>Accept</Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 28,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
  },
  avatarContainer: {
    width: 110,
    height: 110,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  outerPulse: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
  },
  innerPulse: {
    position: 'absolute',
    width: 95,
    height: 95,
    borderRadius: 47.5,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2.5,
  },
  typeBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  callerName: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  statusText: {
    fontSize: 14,
    marginBottom: 28,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  actionCol: {
    alignItems: 'center',
    gap: 8,
  },
  button: {
    width: 62,
    height: 62,
    borderRadius: 31,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
  },
  btnLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
});
