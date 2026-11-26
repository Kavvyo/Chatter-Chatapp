import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Easing,
} from 'react-native';
import { Image } from 'expo-image';
import { Check, CheckCheck, Clock, X } from 'lucide-react-native';
import { Message } from '../../store/useChatStore';
import { useThemeStore } from '../../store/useThemeStore';
import Avatar from '../ui/Avatar';

interface MessageBubbleProps {
  message: Message;
  isSender: boolean;
  senderAvatar?: string | null;
}

function formatTime(dateString: string) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

export const MessageBubble = React.memo<MessageBubbleProps>(
  ({ message, isSender, senderAvatar }) => {
    const { theme } = useThemeStore();
    const [imageModalVisible, setImageModalVisible] = useState(false);

    // Animate only newly sent/received live messages on mount (skip cached/historical ones)
    const shouldAnimateOnMount = useRef(
      Boolean(message.clientCreatedAt && Date.now() - message.clientCreatedAt < 10_000)
    ).current;

    const opacity = useRef(new Animated.Value(shouldAnimateOnMount ? 0 : 1)).current;
    const translateY = useRef(new Animated.Value(shouldAnimateOnMount ? 18 : 0)).current;
    const translateX = useRef(
      new Animated.Value(shouldAnimateOnMount ? (isSender ? 12 : -12) : 0)
    ).current;
    const scale = useRef(new Animated.Value(shouldAnimateOnMount ? 0.92 : 1)).current;

    useEffect(() => {
      if (!shouldAnimateOnMount) return;

      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          damping: 18,
          stiffness: 240,
          mass: 0.72,
          useNativeDriver: true,
        }),
        Animated.spring(translateX, {
          toValue: 0,
          damping: 18,
          stiffness: 240,
          mass: 0.72,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          damping: 16,
          stiffness: 250,
          mass: 0.68,
          useNativeDriver: true,
        }),
      ]).start();
    }, [shouldAnimateOnMount, opacity, translateY, translateX, scale]);

    const isPending = message._id.startsWith('temp_');

    return (
      <Animated.View
        style={[
          styles.row,
          isSender ? styles.senderRow : styles.receiverRow,
          {
            opacity,
            transform: [{ translateY }, { translateX }, { scale }],
          },
        ]}
      >
        {/* Sender Avatar for incoming message */}
        {!isSender && (
          <Avatar uri={senderAvatar} size={30} style={styles.bubbleAvatar} />
        )}

        <View
          style={[
            styles.bubble,
            isSender
              ? [styles.senderBubble, { backgroundColor: theme.primary }]
              : [styles.receiverBubble, { backgroundColor: theme.base300 }],
          ]}
        >
          {/* Attached Image (cached permanently to memory & disk) */}
          {message.image && (
            <>
              <TouchableOpacity onPress={() => setImageModalVisible(true)} activeOpacity={0.9}>
                <Image
                  source={{ uri: message.image }}
                  style={styles.messageImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={150}
                />
              </TouchableOpacity>

              <Modal visible={imageModalVisible} transparent statusBarTranslucent={true} animationType="fade">
                <View style={styles.fullImageModal}>
                  <TouchableOpacity onPress={() => setImageModalVisible(false)} style={styles.closeBtn}>
                    <X size={24} color="#ffffff" />
                  </TouchableOpacity>
                  <Image
                    source={{ uri: message.image }}
                    style={styles.fullImage}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                  />
                </View>
              </Modal>
            </>
          )}

          {/* Message Text */}
          {Boolean(message.text) && (
            <Text
              style={[
                styles.text,
                { color: isSender ? theme.primaryContent : theme.baseContent },
              ]}
            >
              {message.text}
            </Text>
          )}

          {/* Timestamp & Read Receipt */}
          <View style={styles.footer}>
            <Text
              style={[
                styles.time,
                { color: isSender ? theme.primaryContent + '90' : theme.baseContentMuted },
              ]}
            >
              {formatTime(message.createdAt)}
            </Text>

            {isSender && (
              <View style={styles.receipt}>
                {isPending ? (
                  <Clock size={12} color={theme.primaryContent + '85'} />
                ) : message.read ? (
                  <CheckCheck size={14} color={theme.primaryContent} />
                ) : (
                  <Check size={14} color={theme.primaryContent + '90'} />
                )}
              </View>
            )}
          </View>
        </View>
      </Animated.View>
    );
  },
  (prev, next) =>
    prev.message._id === next.message._id &&
    prev.message.read === next.message.read &&
    prev.message.text === next.message.text &&
    prev.message.image === next.message.image &&
    prev.isSender === next.isSender &&
    prev.senderAvatar === next.senderAvatar
);

const styles = StyleSheet.create({
  row: {
    marginVertical: 4,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  senderRow: {
    justifyContent: 'flex-end',
  },
  receiverRow: {
    justifyContent: 'flex-start',
    gap: 8,
  },
  bubbleAvatar: {
    marginBottom: 4,
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    elevation: 1,
  },
  senderBubble: {
    borderBottomRightRadius: 4,
  },
  receiverBubble: {
    borderBottomLeftRadius: 4,
  },
  text: {
    fontSize: 15,
    lineHeight: 21,
  },
  messageImage: {
    width: 220,
    height: 160,
    borderRadius: 14,
    marginBottom: 6,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 4,
  },
  time: {
    fontSize: 10,
    fontWeight: '500',
  },
  receipt: {
    marginLeft: 2,
  },
  fullImageModal: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 10,
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
  },
  fullImage: {
    width: '100%',
    height: '85%',
  },
});
