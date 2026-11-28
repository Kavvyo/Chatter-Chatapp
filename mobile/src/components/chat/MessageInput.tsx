import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
  Platform,
  Animated,
  BackHandler,
} from 'react-native';
import { Image } from 'expo-image';
import { Camera, Image as ImageIcon, Send, Smile, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useChatStore } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useThemeStore } from '../../store/useThemeStore';
import { StickerPicker } from './StickerPicker';

export const MessageInput: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const { sendMessage, sendSticker, selectedUser } = useChatStore();
  const { socket } = useAuthStore();
  const { theme } = useThemeStore();
  const typingTimeoutRef = useRef<any>(null);
  const sendScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setIsKeyboardVisible(true);
        setShowStickers(false);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setIsKeyboardVisible(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!showStickers || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setShowStickers(false);
      return true;
    });
    return () => sub.remove();
  }, [showStickers]);

  const toggleStickerDrawer = () => {
    if (!showStickers) {
      Keyboard.dismiss();
    }
    setShowStickers((prev) => !prev);
  };

  const handleTextChange = (newText: string) => {
    setText(newText);

    if (socket && selectedUser) {
      socket.emit('typing', { to: selectedUser._id });

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('stopTyping', { to: selectedUser._id });
      }, 2000);
    }
  };

  const pickImageAsset = async (source: 'library' | 'camera') => {
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.6,
        base64: true,
      };

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);

      if (!result.canceled && result.assets[0]?.base64) {
        setImagePreview(`data:image/jpeg;base64,${result.assets[0].base64}`);
      }
    } catch {
      // ignore
    }
  };

  const handleSend = () => {
    if (!text.trim() && !imagePreview) return;

    if (socket && selectedUser) {
      socket.emit('stopTyping', { to: selectedUser._id });
    }

    const messagePayload: { text?: string; image?: string } = {};
    if (text.trim()) messagePayload.text = text.trim();
    if (imagePreview) messagePayload.image = imagePreview;

    // Tactile spring pulse on Send tap
    sendScale.setValue(0.84);
    Animated.spring(sendScale, {
      toValue: 1,
      damping: 12,
      stiffness: 280,
      mass: 0.6,
      useNativeDriver: true,
    }).start();

    // Instant reset for immediate 0ms UI feedback
    setText('');
    setImagePreview(null);

    // Non-blocking optimistic dispatch
    sendMessage(messagePayload);
  };

  const canSend = Boolean(text.trim() || imagePreview);
  const firstName = selectedUser?.fullName?.split(' ')[0];
  const cardBg = theme.isDark ? theme.neutral : theme.base200;
  const cardBorder = theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
  const disabledSendBg = theme.isDark ? 'rgba(255,255,255,0.09)' : theme.base300;
  const dynamicBottomPadding = isKeyboardVisible ? 8 : Math.max(insets.bottom + 8, 14);

  return (
    <View
      style={[
        styles.outerContainer,
        {
          backgroundColor: theme.base100,
          paddingBottom: dynamicBottomPadding,
        },
      ]}
    >
      {/* Two-row floating rounded composer adapted from screenshot */}
      <View
        style={[
          styles.composerCard,
          {
            backgroundColor: cardBg,
            borderColor: cardBorder,
          },
        ]}
      >
        {imagePreview && (
          <View style={styles.previewContainer}>
            <Image
              source={{ uri: imagePreview }}
              style={styles.previewImage}
              contentFit="cover"
            />
            <TouchableOpacity
              onPress={() => setImagePreview(null)}
              style={styles.removeImageBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={13} color="#ffffff" />
            </TouchableOpacity>
          </View>
        )}

        <TextInput
          value={text}
          onChangeText={handleTextChange}
          onFocus={() => setShowStickers(false)}
          placeholder={firstName ? `Message ${firstName}...` : 'Message...'}
          placeholderTextColor={theme.baseContentMuted}
          style={[styles.input, { color: theme.baseContent }]}
          multiline
          maxLength={1000}
        />

        <View style={styles.bottomActions}>
          <View style={styles.leftActions}>
            <TouchableOpacity
              onPress={toggleStickerDrawer}
              style={styles.iconBtn}
              activeOpacity={0.65}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Smile
                size={21}
                color={showStickers ? theme.primary : theme.baseContentMuted}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => pickImageAsset('library')}
              style={styles.iconBtn}
              activeOpacity={0.65}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <ImageIcon
                size={21}
                color={imagePreview ? theme.primary : theme.baseContentMuted}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => pickImageAsset('camera')}
              style={styles.iconBtn}
              activeOpacity={0.65}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Camera size={21} color={theme.baseContentMuted} />
            </TouchableOpacity>
          </View>

          <Animated.View style={{ transform: [{ scale: sendScale }] }}>
            <TouchableOpacity
              onPress={handleSend}
              disabled={!canSend}
              style={[
                styles.sendBtn,
                {
                  backgroundColor: canSend ? theme.primary : disabledSendBg,
                },
              ]}
              activeOpacity={0.8}
            >
              <Send
                size={18}
                strokeWidth={2.2}
                color={canSend ? theme.primaryContent : theme.baseContentMuted}
                style={styles.paperRocketOffset}
              />
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>

      {showStickers && (
        <StickerPicker onSelectSticker={(sticker) => sendSticker(sticker)} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  composerCard: {
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  previewContainer: {
    position: 'relative',
    width: 68,
    height: 68,
    marginBottom: 8,
  },
  previewImage: {
    width: 68,
    height: 68,
    borderRadius: 14,
  },
  removeImageBtn: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 10,
    padding: 3,
  },
  input: {
    fontSize: 15.5,
    lineHeight: 22,
    minHeight: 26,
    maxHeight: 112,
    paddingHorizontal: 2,
    paddingVertical: 2,
    textAlignVertical: 'top',
  },
  bottomActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  leftActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  paperRocketOffset: {
    marginRight: 1,
    marginTop: 1,
  },
});
