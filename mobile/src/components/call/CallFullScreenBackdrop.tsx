import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Image } from 'expo-image';

const DEFAULT_AVATAR = require('../../../assets/images/avatar.png');

interface CallFullScreenBackdropProps {
  avatarUri?: string | null;
  name: string;
  subtitle: string;
  showPhoto?: boolean;
  mutedBadge?: boolean;
  headerOpacity?: Animated.Value;
}

/**
 * Full-screen profile portrait backdrop with subtle top/bottom contrast scrims
 * and centered caller/participant header typography shared by active & incoming call screens.
 */
export const CallFullScreenBackdrop: React.FC<CallFullScreenBackdropProps> = ({
  avatarUri,
  name,
  subtitle,
  showPhoto = true,
  mutedBadge = false,
  headerOpacity,
}) => {
  const validUri =
    typeof avatarUri === 'string' && avatarUri.trim().length > 0
      ? { uri: avatarUri.trim() }
      : DEFAULT_AVATAR;

  return (
    <>
      {showPhoto && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Image
            source={validUri}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
          />
          {/* Uniform full-screen darkening over portrait with zero top/bottom band edges */}
          <View style={styles.overallDim} />
        </View>
      )}

      <Animated.View
        style={[styles.topHeader, headerOpacity ? { opacity: headerOpacity } : null]}
        pointerEvents="none"
      >
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {mutedBadge && (
          <View style={styles.mutedPill}>
            <Text style={styles.mutedText}>Muted</Text>
          </View>
        )}
      </Animated.View>
    </>
  );
};

const styles = StyleSheet.create({
  overallDim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  topHeader: {
    position: 'absolute',
    top: 66,
    left: 28,
    right: 28,
    alignItems: 'center',
    zIndex: 12,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.1,
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  name: {
    marginTop: 6,
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  mutedPill: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.32)',
  },
  mutedText: {
    color: '#fecaca',
    fontSize: 11,
    fontWeight: '600',
  },
});
