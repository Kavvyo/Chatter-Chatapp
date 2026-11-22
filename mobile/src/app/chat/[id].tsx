import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useChatStore } from '../../store/useChatStore';
import { useFriendsStore } from '../../store/useFriendsStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useThemeStore } from '../../store/useThemeStore';
import { useToastStore } from '../../store/useToastStore';
import { ChatHeader } from '../../components/chat/ChatHeader';
import { MessageBubble } from '../../components/chat/MessageBubble';
import { MessageInput } from '../../components/chat/MessageInput';

export default function ChatConversationScreen() {
  const { id, unreadCount: paramUnreadCount } = useLocalSearchParams<{ id: string; unreadCount?: string }>();
  const { theme } = useThemeStore();
  const { authUser, socket } = useAuthStore();
  const {
    messages,
    getMessages,
    isMessagesLoading,
    selectedUser,
    setSelectedUser,
    isTyping,
    deleteAllMessages,
    subscribeToMessages,
    markMessageAsRead,
    unreadCounts,
    users,
    getUsers,
  } = useChatStore();
  const { friends, getFriends } = useFriendsStore();
  const { showAlert, showToast } = useToastStore();

  const flatListRef = useRef<FlatList>(null);
  const initialUnreadCountRef = useRef<number>(
    parseInt(paramUnreadCount || '0', 10) || (id ? useChatStore.getState().unreadCounts[id] || 0 : 0)
  );
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null);
  const unreadEvaluatedRef = useRef(false);

  // Sync selected user from id if missing
  useEffect(() => {
    if (!id) return;

    if (!selectedUser || selectedUser._id !== id) {
      const found =
        friends.find((f) => f._id === id) ||
        users.find((u) => u._id === id);

      if (found) {
        setSelectedUser(found);
      } else {
        // Fetch users to populate
        getUsers().then(() => {
          const userList = useChatStore.getState().users;
          const userFound = userList.find((u) => u._id === id);
          if (userFound) setSelectedUser(userFound);
        });
      }
    }
  }, [id, friends, users]);

  // Load messages and subscribe on screen mount
  useEffect(() => {
    if (id) {
      unreadEvaluatedRef.current = false;
      getMessages(id);
      subscribeToMessages();
    }
  }, [id, socket]);

  // Capture the first unread message on initial 1st view only, then mark as read
  useEffect(() => {
    if (!unreadEvaluatedRef.current && messages.length > 0 && id) {
      unreadEvaluatedRef.current = true;
      const count = initialUnreadCountRef.current;

      if (count > 0 && authUser) {
        // Filter incoming messages from other user
        const incomingMessages = messages.filter((m) => m.senderId !== authUser._id);
        const unreadIncoming = incomingMessages.filter((m) => !m.read);

        const target =
          unreadIncoming.length > 0
            ? unreadIncoming[0]
            : incomingMessages.slice(-count)[0];

        if (target) {
          setFirstUnreadId(target._id);
        }
      }

      // Mark as read in DB and clear unread counts locally so subsequent views don't show divider
      markMessageAsRead(id);
      initialUnreadCountRef.current = 0;
    }
  }, [messages, id, authUser]);

  // Auto-scroll reliably to the latest messages at the bottom
  useEffect(() => {
    if (messages.length > 0) {
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [messages.length]);

  const handleMenuPress = () => {
    showAlert(
      'Clear Conversation',
      'Are you sure you want to delete all messages in this conversation? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Chat',
          style: 'destructive',
          onPress: async () => {
            if (id) {
              await deleteAllMessages(id);
              showToast('Conversation cleared', 'info');
            }
          },
        },
      ]
    );
  };

  const renderItem = useCallback(
    ({ item }: { item: any }) => {
      const isFirstUnread = item._id === firstUnreadId;

      return (
        <View>
          {isFirstUnread && (
            <View style={styles.unreadDividerContainer}>
              <View style={[styles.unreadDividerLine, { backgroundColor: theme.primary + '50' }]} />
              <View
                style={[
                  styles.unreadBadgePill,
                  { backgroundColor: theme.base200, borderColor: theme.primary + '70' },
                ]}
              >
                <Text style={[styles.unreadDividerText, { color: theme.primary }]}>
                  Unread Messages
                </Text>
              </View>
              <View style={[styles.unreadDividerLine, { backgroundColor: theme.primary + '50' }]} />
            </View>
          )}

          <MessageBubble
            message={item}
            isSender={item.senderId === authUser?._id}
            senderAvatar={selectedUser?.profilePic}
          />
        </View>
      );
    },
    [authUser?._id, selectedUser?.profilePic, firstUnreadId, theme]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.base100 }]} edges={['top', 'left', 'right']}>
      {/* Chat Header */}
      <ChatHeader onMenuPress={handleMenuPress} />

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Messages List */}
        {isMessagesLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item._id}
            renderItem={renderItem}
            initialNumToRender={20}
            maxToRenderPerBatch={15}
            windowSize={11}
            removeClippedSubviews={Platform.OS === 'android'}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => {
              if (messages.length > 0) {
                flatListRef.current?.scrollToEnd({ animated: false });
              }
            }}
            onLayout={() => {
              if (messages.length > 0) {
                flatListRef.current?.scrollToEnd({ animated: false });
              }
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: theme.baseContentMuted }]}>
                  No messages yet. Send a wave or say hello!
                </Text>
              </View>
            }
          />
        )}

        {/* Typing indicator */}
        {isTyping && (
          <View style={[styles.typingContainer, { backgroundColor: theme.base200 }]}>
            <Text style={[styles.typingText, { color: theme.baseContentMuted }]}>
              {selectedUser?.fullName || 'User'} is typing...
            </Text>
          </View>
        )}

        {/* Bottom Input Field */}
        <MessageInput />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingVertical: 8,
    flexGrow: 1,
  },
  unreadDividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  unreadDividerLine: {
    flex: 1,
    height: 1,
  },
  unreadBadgePill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  unreadDividerText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 100,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  typingContainer: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginHorizontal: 16,
    marginBottom: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  typingText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
});
