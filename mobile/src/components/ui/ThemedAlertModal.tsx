import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Modal,
  Platform,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
} from 'react-native';
import { useToastStore } from '../../store/useToastStore';
import { useThemeStore } from '../../store/useThemeStore';

export const ThemedAlertModal: React.FC = () => {
  const { alertConfig, hideAlert } = useToastStore();
  const { theme } = useThemeStore();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  const isVisible = Boolean(alertConfig);

  useEffect(() => {
    if (isVisible) {
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.9);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 75,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isVisible]);

  const handleClose = (callback?: () => void) => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 130,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 130,
        useNativeDriver: true,
      }),
    ]).start(() => {
      hideAlert();
      if (callback) callback();
    });
  };

  if (!alertConfig) return null;

  const { title, message, buttons = [{ text: 'OK', style: 'default' }] } = alertConfig;

  // Stacking buttons vertically ensures responsive layout if multiple options or long labels
  const shouldStackButtons =
    buttons.length > 2 || buttons.some((b) => Boolean(b.text && b.text.length > 13));

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      statusBarTranslucent={true}
      animationType="none"
      onRequestClose={() => handleClose()}
    >
      <KeyboardAvoidingView
        style={styles.modalBackdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Animated Dimmer Background - tapping outside dismisses */}
        <Animated.View style={[styles.dimmer, { opacity: fadeAnim }]}>
          <TouchableWithoutFeedback onPress={() => handleClose()}>
            <View style={styles.dimmerTouchArea} />
          </TouchableWithoutFeedback>
        </Animated.View>

        {/* Centered Modal Card */}
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: theme.base200,
              borderColor: theme.base300,
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Title */}
          <Text style={[styles.title, { color: theme.baseContent }]}>{title}</Text>

          {/* Optional Message */}
          {Boolean(message) && (
            <Text style={[styles.message, { color: theme.baseContentMuted }]}>
              {message}
            </Text>
          )}

          {/* Action Buttons */}
          <View
            style={[
              styles.buttonContainer,
              shouldStackButtons ? styles.buttonColumn : styles.buttonRow,
            ]}
          >
            {buttons.map((btn, index) => {
              const isDestructive = btn.style === 'destructive';
              const isCancel = btn.style === 'cancel';

              let btnBg = theme.primary;
              let textColor = theme.primaryContent;

              if (isDestructive) {
                btnBg = theme.error;
                textColor = '#ffffff';
              } else if (isCancel) {
                btnBg = theme.base300;
                textColor = theme.baseContent;
              }

              return (
                <TouchableOpacity
                  key={index}
                  onPress={() => handleClose(btn.onPress)}
                  style={[
                    styles.btn,
                    shouldStackButtons ? styles.btnFullWidth : styles.btnFlex,
                    { backgroundColor: btnBg },
                  ]}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.btnText, { color: textColor }]}>
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  dimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  dimmerTouchArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    borderWidth: 1.5,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 24,
    gap: 12,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  buttonContainer: {
    width: '100%',
    marginTop: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  buttonColumn: {
    flexDirection: 'column',
    gap: 10,
  },
  btn: {
    minHeight: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  btnFlex: {
    flex: 1,
  },
  btnFullWidth: {
    width: '100%',
  },
  btnText: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
});

export default ThemedAlertModal;
