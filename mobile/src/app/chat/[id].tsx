import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useChatStore, type Message } from '../../store/useChatStore';
import { useFriendsStore } from '../../store/useFriendsStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useThemeStore } from '../../store/useThemeStore';
import { useToastStore } from '../../store/useToastStore';
import { ChatHeader } from '../../components/chat/ChatHeader';
import { MessageBubble } from '../../components/chat/MessageBubble';
import { MessageInput } from '../../components/chat/MessageInput';
import { TypingIndicator } from '../../components/chat/TypingIndicator';
import Avatar from '../../components/ui/Avatar';

export default function ChatConversationScreen() {
  const { id, unreadCount: paramUnreadCount } = useLocalSearchParams<{ id: string; unreadCount?: string }>();
  const { theme } = useThemeStore();
  const { authUser, socket } = useAuthStore();
  const {
    messages,
    getMessages,
    loadOlderMessages,
    hasMoreOlderByUser,
    isMessagesLoading,
    isLoadingOlder,
    selectedUser,
    setSelectedUser,
    isTyping,
    deleteAllMessages,
    markMessageAsRead,
    users,
    getUsers,
  } = useChatStore();
  const { friends } = useFriendsStore();
  const { showAlert, showToast } = useToastStore();

  const flatListRef = useRef<FlatList<Message>>(null);
  const initialUnreadCountRef = useRef<number>(
    parseInt(paramUnreadCount || '0', 10) || (id ? useChatStore.getState().unreadCounts[id] || 0 : 0)
  );
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null);
  const unreadEvaluatedRef = useRef(false);
  const lastNewestKeyRef = useRef<string | null>(null);
  const hasMoreOlder = id ? hasMoreOlderByUser[id] === true : false;

  // Inverted list expects [newest, ..., oldest] so recent messages anchor at bottom in 0ms
  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);

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
        getUsers().then(() => {
          const userList = useChatStore.getState().users;
          const userFound = userList.find((u) => u._id === id);
          if (userFound) setSelectedUser(userFound);
        });
      }
    }
  }, [id, friends, users]);

  // Load cached messages immediately + run silent delta sync on mount
  useEffect(() => {
    if (id) {
      unreadEvaluatedRef.current = false;
      lastNewestKeyRef.current = null;
      setFirstUnreadId(null);
      getMessages(id);
    }

    return () => {
      if (id && useChatStore.getState().selectedUser?._id === id) {
        setSelectedUser(null);
      }
    };
  }, [id]);

  // Capture the first unread message on initial 1st view only, then mark as read
  useEffect(() => {
    if (!unreadEvaluatedRef.current && messages.length > 0 && id) {
      unreadEvaluatedRef.current = true;
      const count = initialUnreadCountRef.current;
      const incomingMessages = messages.filter((m) => m.senderId !== authUser?._id);
      const unreadIncoming = incomingMessages.filter((m) => !m.read);

      if (count > 0 && authUser) {
        const target =
          unreadIncoming.length > 0
            ? unreadIncoming[0]
            : incomingMessages.slice(-count)[0];

        if (target) {
          setFirstUnreadId(target._id);
        }
      }

      const unreadIds = unreadIncoming
        .map((m) => m._id)
        .filter((mid) => !mid.startsWith('temp_'));
      markMessageAsRead(id, unreadIds.length > 0 ? unreadIds : undefined);
      initialUnreadCountRef.current = 0;
    }
  }, [messages, id, authUser]);

  // Snap smoothly to newest message (offset 0 in inverted list) ONLY when sending a live message
  const newestItem = reversedMessages[0];
  const newestKey = newestItem ? newestItem.localId || newestItem._id : null;
  useEffect(() => {
    if (!newestItem || !newestKey) return;

    if (lastNewestKeyRef.current && newestKey !== lastNewestKeyRef.current) {
      if (newestItem.clientCreatedAt && newestItem.senderId === authUser?._id) {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }
    }
    lastNewestKeyRef.current = newestKey;
  }, [newestKey, newestItem, authUser?._id]);

  const handleLoadOlder = async () => {
    if (!id || isLoadingOlder || !hasMoreOlder) return;
    await loadOlderMessages(id);
  };

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
    ({ item }: { item: Message }) => {
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
        {/* Messages List (inverted renders recent messages at bottom in 0ms without scroll jump) */}
        {isMessagesLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : reversedMessages.length === 0 ? (
          <View style={styles.emptyWrapper}>
            <View style={styles.emptyContainer}>
              <Avatar
                uri={selectedUser?.profilePic}
                size={68}
                showOnline={false}
              />
              <Text style={[styles.emptyTitle, { color: theme.baseContent }]}>
                {selectedUser ? selectedUser.fullName : 'Start chatting'}
              </Text>
              <Text style={[styles.emptyText, { color: theme.baseContentMuted }]}>
                {selectedUser
                  ? `Say hello to ${selectedUser.fullName.split(' ')[0]}`
                  : 'Send a message to start the conversation.'}
              </Text>
            </View>
            <TypingIndicator visible={isTyping} avatarUri={selectedUser?.profilePic} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            inverted={true}
            data={reversedMessages}
            keyExtractor={(item) => item.localId || item._id}
            renderItem={renderItem}
            initialNumToRender={20}
            maxToRenderPerBatch={15}
            windowSize={11}
            removeClippedSubviews={Platform.OS === 'android'}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            onEndReachedThreshold={0.25}
            onEndReached={handleLoadOlder}
            ListHeaderComponent={
              <TypingIndicator visible={isTyping} avatarUri={selectedUser?.profilePic} />
            }
            ListFooterComponent={
              hasMoreOlder ? (
                <TouchableOpacity
                  onPress={handleLoadOlder}
                  disabled={isLoadingOlder}
                  style={[styles.loadOlderBtn, { backgroundColor: theme.base200, borderColor: theme.base300 }]}
                  activeOpacity={0.75}
                >
                  {isLoadingOlder ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : (
                    <Text style={[styles.loadOlderText, { color: theme.primary }]}>
                      Load older messages
                    </Text>
                  )}
                </TouchableOpacity>
              ) : undefined
            }
          />
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
  emptyWrapper: {
    flex: 1,
    justifyContent: 'space-between',
  },
  listContent: {
    paddingVertical: 8,
  },
  loadOlderBtn: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    marginVertical: 10,
    minHeight: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadOlderText: {
    fontSize: 12,
    fontWeight: '600',
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
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginTop: 4,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
