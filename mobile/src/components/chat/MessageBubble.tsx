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
import {
  ArrowDown,
  ArrowUp,
  BookmarkCheck,
  BookmarkPlus,
  Check,
  CheckCheck,
  Clock,
  X,
} from 'lucide-react-native';
import { Message } from '../../store/useChatStore';
import { useThemeStore } from '../../store/useThemeStore';
import { useStickerStore } from '../../store/useStickerStore';
import { useToastStore } from '../../store/useToastStore';
import { resolveLocalStickerUri } from '../../lib/stickers';
import Avatar from '../ui/Avatar';

interface StickerTransferRingProps {
  mode: 'upload' | 'download';
  accentColor: string;
}

const StickerTransferRing: React.FC<StickerTransferRingProps> = ({ mode, accentColor }) => {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 850,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.transferBadgeCircle}>
      <Animated.View
        style={[
          styles.transferSpinArc,
          {
            borderTopColor: '#ffffff',
            borderRightColor: accentColor,
            transform: [{ rotate }],
          },
        ]}
      />
      {mode === 'upload' ? (
        <ArrowUp size={17} color="#ffffff" strokeWidth={2.5} />
      ) : (
        <ArrowDown size={17} color="#ffffff" strokeWidth={2.5} />
      )}
    </View>
  );
};

interface StickerDownloadPlaceholderProps {
  backgroundColor: string;
  textColor: string;
  accentColor: string;
}

const StickerDownloadPlaceholder: React.FC<StickerDownloadPlaceholderProps> = ({
  backgroundColor,
  textColor,
  accentColor,
}) => {
  const pulse = useRef(new Animated.Value(0.65)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.65,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        styles.stickerMissingBox,
        { backgroundColor, opacity: pulse },
      ]}
    >
      <StickerTransferRing mode="download" accentColor={accentColor} />
      <Text style={[styles.stickerMissingText, { color: textColor }]}>
        Downloading...
      </Text>
    </Animated.View>
  );
};

interface StickerPreviewModalProps {
  visible: boolean;
  onClose: () => void;
  stickerHash?: string;
  stickerUri?: string | null;
  isAnimated?: boolean;
}

const StickerPreviewModal: React.FC<StickerPreviewModalProps> = ({
  visible,
  onClose,
  stickerHash,
  stickerUri,
  isAnimated,
}) => {
  const { theme } = useThemeStore();
  const { showToast } = useToastStore();
  const packs = useStickerStore((s) => s.packs);
  const saveStickerToCollection = useStickerStore((s) => s.saveStickerToCollection);
  const [saving, setSaving] = useState(false);

  const isSaved = Boolean(
    stickerHash &&
      packs.some((p) => p.stickers.some((item) => item.stickerHash === stickerHash))
  );

  const handleSave = async () => {
    if (!stickerHash || isSaved || saving) return;
    setSaving(true);
    const res = await saveStickerToCollection({
      stickerHash,
      stickerUri,
      isAnimated,
    });
    setSaving(false);
    showToast(res.message, res.ok ? 'success' : 'error');
  };

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="fade">
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        style={styles.stickerModalOverlay}
      >
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <X size={24} color="#ffffff" />
        </TouchableOpacity>

        {stickerUri && (
          <Image
            source={{ uri: stickerUri }}
            style={styles.stickerModalPreview}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
        )}

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleSave}
          disabled={!stickerHash || isSaved || saving}
          style={[
            styles.saveStickerBtn,
            {
              backgroundColor: isSaved ? 'rgba(255,255,255,0.16)' : theme.primary,
            },
          ]}
        >
          {isSaved ? (
            <BookmarkCheck size={18} color="#ffffff" />
          ) : (
            <BookmarkPlus size={18} color="#ffffff" />
          )}
          <Text style={styles.saveStickerText}>
            {isSaved
              ? 'Saved in Chatter'
              : saving
              ? 'Saving...'
              : 'Save to Chatter'}
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

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
    const [stickerModalVisible, setStickerModalVisible] = useState(false);

    // Animate only newly sent/received live messages on mount (skip cached/historical ones)
    const shouldAnimateOnMount = useRef(
      Boolean(message.clientCreatedAt && Date.now() - message.clientCreatedAt < 10_000)
    ).current;

    const opacity = useRef(new Animated.Value(shouldAnimateOnMount ? 0 : 1)).current;
    const translateY = useRef(
      new Animated.Value(shouldAnimateOnMount ? (message.isSticker ? 14 : 18) : 0)
    ).current;
    const translateX = useRef(
      new Animated.Value(
        shouldAnimateOnMount && !message.isSticker ? (isSender ? 12 : -12) : 0
      )
    ).current;
    const scale = useRef(
      new Animated.Value(shouldAnimateOnMount ? (message.isSticker ? 0.72 : 0.92) : 1)
    ).current;

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
    const resolvedStickerUri = message.isSticker
      ? message.stickerUri ||
        (message.stickerHash ? resolveLocalStickerUri(message.stickerHash) : null)
      : null;

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

        {message.isSticker ? (
          <View
            style={[
              styles.stickerContainer,
              !isSender && styles.stickerReceiverContainer,
            ]}
          >
            {resolvedStickerUri ? (
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => setStickerModalVisible(true)}
                style={styles.stickerMediaWrap}
              >
                <Image
                  source={{ uri: resolvedStickerUri }}
                  style={[
                    styles.stickerImage,
                    (message.stickerStatus === 'uploading' ||
                      message.stickerStatus === 'downloading') &&
                      styles.stickerTransferringImage,
                  ]}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />

                {(message.stickerStatus === 'uploading' ||
                  message.stickerStatus === 'downloading') && (
                  <View style={styles.stickerOverlayCenter} pointerEvents="none">
                    <StickerTransferRing
                      mode={message.stickerStatus === 'uploading' ? 'upload' : 'download'}
                      accentColor={theme.primary}
                    />
                  </View>
                )}
              </TouchableOpacity>
            ) : (
              <StickerDownloadPlaceholder
                backgroundColor={theme.isDark ? theme.neutral : theme.base200}
                textColor={theme.baseContentMuted}
                accentColor={theme.primary}
              />
            )}

            {stickerModalVisible && (
              <StickerPreviewModal
                visible={stickerModalVisible}
                onClose={() => setStickerModalVisible(false)}
                stickerHash={message.stickerHash}
                stickerUri={resolvedStickerUri}
                isAnimated={message.isAnimated}
              />
            )}

            <View
              style={[
                styles.stickerFooterPill,
                {
                  backgroundColor: theme.isDark
                    ? 'rgba(0,0,0,0.45)'
                    : 'rgba(255,255,255,0.82)',
                },
              ]}
            >
              <Text style={[styles.time, { color: theme.baseContentMuted }]}>
                {formatTime(message.createdAt)}
              </Text>
              {isSender && (
                <View style={styles.receipt}>
                  {isPending || message.stickerStatus === 'queued' ? (
                    <Clock size={11} color={theme.baseContentMuted} />
                  ) : message.stickerStatus === 'uploading' ? (
                    <ArrowUp size={12} color={theme.primary} />
                  ) : message.read ? (
                    <CheckCheck size={13} color={theme.primary} />
                  ) : (
                    <Check size={13} color={theme.baseContentMuted} />
                  )}
                </View>
              )}
            </View>
          </View>
        ) : (
          <View
            style={[
              styles.bubble,
              isSender
                ? [styles.senderBubble, { backgroundColor: theme.primary }]
                : [
                    styles.receiverBubble,
                    { backgroundColor: theme.isDark ? theme.neutral : theme.base200 },
                  ],
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
        )}
      </Animated.View>
    );
  },
  (prev, next) =>
    prev.message._id === next.message._id &&
    prev.message.read === next.message.read &&
    prev.message.text === next.message.text &&
    prev.message.image === next.message.image &&
    prev.message.stickerUri === next.message.stickerUri &&
    prev.message.stickerHash === next.message.stickerHash &&
    prev.message.stickerStatus === next.message.stickerStatus &&
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
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  senderBubble: {
    borderBottomRightRadius: 6,
  },
  receiverBubble: {
    borderBottomLeftRadius: 6,
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
  stickerContainer: {
    alignItems: 'flex-end',
    gap: 4,
  },
  stickerReceiverContainer: {
    alignItems: 'flex-start',
  },
  stickerMediaWrap: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stickerImage: {
    width: 148,
    height: 148,
  },
  stickerTransferringImage: {
    opacity: 0.78,
  },
  stickerOverlayCenter: {
    position: 'absolute',
    inset: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transferBadgeCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15, 16, 22, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  transferSpinArc: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  stickerMissingBox: {
    width: 144,
    height: 144,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 8,
  },
  stickerMissingText: {
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '600',
  },
  stickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  stickerModalPreview: {
    width: 220,
    height: 220,
  },
  saveStickerBtn: {
    marginTop: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  saveStickerText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  stickerFooterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
});
