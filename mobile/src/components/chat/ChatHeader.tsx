import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronLeft, Phone, Video, EllipsisVertical } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../store/useAuthStore';
import { useChatStore } from '../../store/useChatStore';
import { useCallStore } from '../../store/useCallStore';
import { useThemeStore } from '../../store/useThemeStore';
import Avatar from '../ui/Avatar';

interface ChatHeaderProps {
  onMenuPress?: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({ onMenuPress }) => {
  const router = useRouter();
  const { selectedUser } = useChatStore();
  const { onlineUsers } = useAuthStore();
  const { callUser } = useCallStore();
  const { theme } = useThemeStore();

  const isOnline = Boolean(selectedUser && onlineUsers.includes(selectedUser._id));

  return (
    <View style={[styles.header, { backgroundColor: theme.base100, borderBottomColor: theme.base300 }]}>
      <View style={styles.left}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ChevronLeft size={26} color={theme.baseContent} />
        </TouchableOpacity>

        {/* Avatar + Online indicator */}
        <Avatar
          uri={selectedUser?.profilePic}
          size={42}
          showOnline={true}
          isOnline={isOnline}
        />

        {/* User Info */}
        <View style={styles.userInfo}>
          <Text style={[styles.name, { color: theme.baseContent }]} numberOfLines={1}>
            {selectedUser ? selectedUser.fullName : 'Chat'}
          </Text>
          <Text style={[styles.status, { color: isOnline ? '#10b981' : theme.baseContentMuted }]}>
            {selectedUser ? (isOnline ? 'Online' : 'Offline') : 'Connecting...'}
          </Text>
        </View>
      </View>

      {/* Action Buttons: Voice Call, Video Call, Menu */}
      {selectedUser && (
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={() => callUser(selectedUser, 'voice')}
            style={[styles.actionBtn, { backgroundColor: theme.base200 }]}
            activeOpacity={0.7}
          >
            <Phone size={18} color={theme.baseContent} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => callUser(selectedUser, 'video')}
            style={[styles.actionBtn, { backgroundColor: theme.base200 }]}
            activeOpacity={0.7}
          >
            <Video size={18} color={theme.baseContent} />
          </TouchableOpacity>

          {onMenuPress && (
            <TouchableOpacity
              onPress={onMenuPress}
              style={[styles.actionBtn, { backgroundColor: theme.base200 }]}
              activeOpacity={0.7}
            >
              <EllipsisVertical size={18} color={theme.baseContent} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  backBtn: {
    paddingRight: 2,
    paddingVertical: 4,
  },
  userInfo: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
  },
  status: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ChatHeader;
