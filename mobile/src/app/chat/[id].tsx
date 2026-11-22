import React, { useEffect, useRef, useCallback } from 'react';
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
  const { id } = useLocalSearchParams<{ id: string }>();
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
    users,
    getUsers,
  } = useChatStore();
  const { friends, getFriends } = useFriendsStore();
  const { showAlert, showToast } = useToastStore();

  const flatListRef = useRef<FlatList>(null);

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
      getMessages(id);
      markMessageAsRead(id);
      subscribeToMessages();
    }
  }, [id, socket]);

  const handleMenuPress = () => {
    showAlert('Conversation Options', 'What would you like to do?', [
      {
        text: 'Clear Chat History',
        style: 'destructive',
        onPress: () => {
          showAlert(
            'Confirm Clear',
            'Are you sure you want to delete all messages in this conversation?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete All',
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
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const renderItem = useCallback(
    ({ item }: { item: any }) => (
      <MessageBubble
        message={item}
        isSender={item.senderId === authUser?._id}
        senderAvatar={selectedUser?.profilePic}
      />
    ),
    [authUser?._id, selectedUser?.profilePic]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.base100 }]} edges={['top', 'left', 'right']}>
      {/* Chat Header */}
      <ChatHeader onMenuPress={handleMenuPress} />

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 25}
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
                flatListRef.current?.scrollToEnd({ animated: true });
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
    paddingVertical: 12,
    flexGrow: 1,
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
