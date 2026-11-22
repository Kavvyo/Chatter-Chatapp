import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Keyboard,
  Platform,
} from 'react-native';
import { Image as ImageIcon, Send, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useChatStore } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useThemeStore } from '../../store/useThemeStore';

export const MessageInput: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const { sendMessage, selectedUser } = useChatStore();
  const { socket } = useAuthStore();
  const { theme } = useThemeStore();
  const typingTimeoutRef = useRef<any>(null);

  // Monitor keyboard visibility to dynamically adjust bottom elevation
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setIsKeyboardVisible(true)
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

  const handlePickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.6,
        base64: true,
      });

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

    // Instant reset for immediate 0ms UI feedback
    setText('');
    setImagePreview(null);

    // Non-blocking optimistic dispatch
    sendMessage(messagePayload);
  };

  // Snug bottom padding when keyboard is open vs closed
  const dynamicBottomPadding = isKeyboardVisible
    ? 4
    : Math.max(insets.bottom + 6, 16);

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
      {/* Attached Image Preview */}
      {imagePreview && (
        <View style={styles.previewContainer}>
          <Image source={{ uri: imagePreview }} style={styles.previewImage} />
          <TouchableOpacity onPress={() => setImagePreview(null)} style={styles.removeImageBtn}>
            <X size={14} color="#ffffff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Modern Floating Pill Capsule Input */}
      <View
        style={[
          styles.capsule,
          {
            backgroundColor: theme.base200,
            borderColor: theme.base300,
          },
        ]}
      >
        <TouchableOpacity
          onPress={handlePickImage}
          style={styles.attachBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ImageIcon size={22} color={imagePreview ? theme.primary : theme.baseContentMuted} />
        </TouchableOpacity>

        <TextInput
          value={text}
          onChangeText={handleTextChange}
          placeholder="Type here..."
          placeholderTextColor={theme.baseContentMuted}
          style={[styles.input, { color: theme.baseContent }]}
          multiline
          maxLength={1000}
        />

        <TouchableOpacity
          onPress={handleSend}
          disabled={!text.trim() && !imagePreview}
          style={[
            styles.sendBtn,
            {
              backgroundColor: text.trim() || imagePreview ? theme.primary : theme.base300,
            },
          ]}
          activeOpacity={0.8}
        >
          <Send size={18} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  previewContainer: {
    position: 'relative',
    width: 68,
    height: 68,
    marginBottom: 8,
    marginLeft: 6,
  },
  previewImage: {
    width: 68,
    height: 68,
    borderRadius: 12,
  },
  removeImageBtn: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 10,
    padding: 3,
  },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 6,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  attachBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingHorizontal: 8,
    paddingVertical: 6,
    maxHeight: 100,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
