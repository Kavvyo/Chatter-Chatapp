import React, { useEffect, useRef } from 'react';
import { Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react-native';
import { useToastStore, ToastType } from '../../store/useToastStore';
import { useThemeStore } from '../../store/useThemeStore';

export const ThemedToast: React.FC = () => {
  const { toast, hideToast } = useToastStore();
  const { theme } = useThemeStore();
  const insets = useSafeAreaInsets();

  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (toast) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          friction: 8,
          tension: 75,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 160,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      translateY.setValue(-80);
      opacity.setValue(0);
    }
  }, [toast]);

  if (!toast) return null;

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -80,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => hideToast());
  };

  const getToastColors = (type: ToastType) => {
    switch (type) {
      case 'success':
        return { bg: theme.success, text: '#ffffff', Icon: CheckCircle2 };
      case 'error':
        return { bg: theme.error, text: '#ffffff', Icon: AlertCircle };
      case 'warning':
        return { bg: theme.warning, text: '#18181b', Icon: AlertTriangle };
      case 'info':
      default:
        return { bg: theme.primary, text: theme.primaryContent, Icon: Info };
    }
  };

  const { bg, text, Icon } = getToastColors(toast.type);

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          top: insets.top + 8,
          opacity,
          transform: [{ translateY }],
        },
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        onPress={handleDismiss}
        activeOpacity={0.9}
        style={[styles.toastContainer, { backgroundColor: bg }]}
      >
        <Icon size={20} color={text} style={styles.icon} />
        <Text style={[styles.message, { color: text }]} numberOfLines={4}>
          {toast.message}
        </Text>
        <TouchableOpacity onPress={handleDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <X size={16} color={text} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: 'center',
  },
  toastContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    maxWidth: 500,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  icon: {
    marginRight: 10,
  },
  message: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
});

export default ThemedToast;
