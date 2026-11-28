import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { AlertCircle, CheckCircle2, Sparkles, X } from 'lucide-react-native';
import { useStickerStore } from '../../store/useStickerStore';
import { useThemeStore } from '../../store/useThemeStore';

export const StickerImportModal: React.FC = () => {
  const { theme } = useThemeStore();
  const { importModal, clearImportModal } = useStickerStore();

  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.86)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!importModal) return;

    opacity.setValue(0);
    scale.setValue(0.86);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        damping: 16,
        stiffness: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [importModal?.status, Boolean(importModal)]);

  useEffect(() => {
    if (importModal?.status !== 'importing') {
      spin.setValue(0);
      pulse.setValue(1);
      return;
    }

    const spinLoop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 950,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.09,
          duration: 520,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.94,
          duration: 520,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    spinLoop.start();
    pulseLoop.start();
    return () => {
      spinLoop.stop();
      pulseLoop.stop();
    };
  }, [importModal?.status, spin, pulse]);

  // Auto-dismiss only after a clean success so users always have time to read any error
  useEffect(() => {
    if (importModal?.status !== 'success') return;
    const timer = setTimeout(() => {
      clearImportModal();
    }, 2800);
    return () => clearTimeout(timer);
  }, [importModal?.status, importModal?.pack?.id, clearImportModal]);

  if (!importModal) return null;

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const previewStickers = importModal.pack?.stickers?.slice(0, 4) || [];

  return (
    <Modal
      visible={Boolean(importModal)}
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={() => {
        if (importModal.status !== 'importing') clearImportModal();
      }}
    >
      <Animated.View style={[styles.backdrop, { opacity }]}>
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: theme.base200,
              borderColor: theme.isDark ? 'rgba(255,255,255,0.1)' : theme.base300,
              transform: [{ scale }],
            },
          ]}
        >
          {importModal.status !== 'importing' && (
            <TouchableOpacity
              onPress={clearImportModal}
              style={styles.closeIconBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={18} color={theme.baseContentMuted} />
            </TouchableOpacity>
          )}

          {importModal.status === 'importing' && (
            <>
              <View style={styles.heroWrap}>
                <Animated.View
                  style={[
                    styles.spinnerRing,
                    {
                      borderColor: theme.primary + '28',
                      borderTopColor: theme.primary,
                      borderRightColor: theme.primary,
                      transform: [{ rotate }],
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.heroBadge,
                    { backgroundColor: theme.primary + '1c', transform: [{ scale: pulse }] },
                  ]}
                >
                  <Sparkles size={28} color={theme.primary} />
                </Animated.View>
              </View>

              <Text style={[styles.title, { color: theme.baseContent }]}>
                Adding Stickers...
              </Text>
              <Text style={[styles.subtitle, { color: theme.baseContentMuted }]}>
                {importModal.packName
                  ? `Importing "${importModal.packName}" to Chatter`
                  : 'Importing sticker pack into Chatter'}
              </Text>
            </>
          )}

          {importModal.status === 'success' && (
            <>
              <View style={[styles.heroBadge, { backgroundColor: theme.success + '20' }]}>
                <CheckCircle2 size={32} color={theme.success} />
              </View>

              <Text style={[styles.title, { color: theme.baseContent }]}>
                {importModal.packName || 'Stickers Added'}
              </Text>
              <Text style={[styles.subtitle, { color: theme.baseContentMuted }]}>
                {importModal.message || 'Ready to send in your chats'}
              </Text>

              {previewStickers.length > 0 && (
                <View style={styles.previewRow}>
                  {previewStickers.map((item) => (
                    <View
                      key={item.id}
                      style={[
                        styles.previewTile,
                        { backgroundColor: theme.isDark ? theme.neutral : theme.base100 },
                      ]}
                    >
                      <Image
                        source={{ uri: item.uri }}
                        style={styles.previewThumb}
                        contentFit="contain"
                      />
                    </View>
                  ))}
                </View>
              )}

              <TouchableOpacity
                onPress={clearImportModal}
                style={[styles.actionBtn, { backgroundColor: theme.primary }]}
                activeOpacity={0.85}
              >
                <Text style={[styles.actionText, { color: theme.primaryContent }]}>
                  Done
                </Text>
              </TouchableOpacity>
            </>
          )}

          {importModal.status === 'error' && (
            <>
              <View style={[styles.heroBadge, { backgroundColor: theme.error + '20' }]}>
                <AlertCircle size={32} color={theme.error} />
              </View>

              <Text style={[styles.title, { color: theme.baseContent }]}>
                Could Not Add Stickers
              </Text>

              <ScrollView
                style={styles.errorScroll}
                contentContainerStyle={styles.errorScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <Text style={[styles.errorMessage, { color: theme.baseContentMuted }]}>
                  {importModal.message || 'An unexpected error occurred while reading the sticker pack.'}
                </Text>
              </ScrollView>

              <TouchableOpacity
                onPress={clearImportModal}
                style={[styles.actionBtn, { backgroundColor: theme.error }]}
                activeOpacity={0.85}
              >
                <Text style={[styles.actionText, { color: '#ffffff' }]}>Got It</Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingVertical: 26,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 14,
  },
  closeIconBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    padding: 4,
  },
  heroWrap: {
    width: 78,
    height: 78,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  spinnerRing: {
    position: 'absolute',
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3,
  },
  heroBadge: {
    width: 62,
    height: 62,
    borderRadius: 31,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 6,
  },
  previewRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  previewTile: {
    width: 56,
    height: 56,
    borderRadius: 14,
    padding: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewThumb: {
    width: 44,
    height: 44,
  },
  errorScroll: {
    maxHeight: 160,
    width: '100%',
    marginTop: 8,
  },
  errorScrollContent: {
    paddingVertical: 2,
  },
  errorMessage: {
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
  },
  actionBtn: {
    marginTop: 18,
    width: '100%',
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
  },
  actionText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
