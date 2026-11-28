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
  const { selectedUser, isTyping } = useChatStore();
  const { onlineUsers } = useAuthStore();
  const { callUser } = useCallStore();
  const { theme } = useThemeStore();

  const isOnline = Boolean(selectedUser && onlineUsers.includes(selectedUser._id));
  const surfaceBtnBg = theme.isDark ? 'rgba(255,255,255,0.07)' : theme.base200;
  const dividerColor = theme.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';

  return (
    <View style={[styles.header, { backgroundColor: theme.base100, borderBottomColor: dividerColor }]}>
      <View style={styles.left}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: surfaceBtnBg }]}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ChevronLeft size={22} color={theme.baseContent} />
        </TouchableOpacity>

        {/* Avatar + Online indicator */}
        <Avatar
          uri={selectedUser?.profilePic}
          size={40}
          showOnline={true}
          isOnline={isOnline}
        />

        {/* User Info */}
        <View style={styles.userInfo}>
          <Text style={[styles.name, { color: theme.baseContent }]} numberOfLines={1}>
            {selectedUser ? selectedUser.fullName : 'Chat'}
          </Text>
          <Text
            style={[
              styles.status,
              {
                color: isTyping
                  ? theme.primary
                  : isOnline
                  ? '#10b981'
                  : theme.baseContentMuted,
              },
            ]}
          >
            {isTyping
              ? 'typing...'
              : selectedUser
              ? isOnline
                ? 'Active now'
                : 'Offline'
              : 'Connecting...'}
          </Text>
        </View>
      </View>

      {/* Action Buttons: Voice Call, Video Call, Menu */}
      {selectedUser && (
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={() => callUser(selectedUser, 'voice')}
            style={[styles.actionBtn, { backgroundColor: surfaceBtnBg }]}
            activeOpacity={0.7}
          >
            <Phone size={18} color={theme.baseContent} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => callUser(selectedUser, 'video')}
            style={[styles.actionBtn, { backgroundColor: surfaceBtnBg }]}
            activeOpacity={0.7}
          >
            <Video size={18} color={theme.baseContent} />
          </TouchableOpacity>

          {onMenuPress && (
            <TouchableOpacity
              onPress={onMenuPress}
              style={[styles.actionBtn, { backgroundColor: surfaceBtnBg }]}
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
    borderBottomWidth: 0.5,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  status: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
