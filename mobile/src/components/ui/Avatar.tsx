import React, { useState } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, ImageStyle } from 'react-native';
import { Image } from 'expo-image';

const DEFAULT_AVATAR = require('../../../assets/images/avatar.png');

interface AvatarProps {
  uri?: string | null;
  size?: number;
  showOnline?: boolean;
  isOnline?: boolean;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
}

export const Avatar = React.memo<AvatarProps>(
  ({
    uri,
    size = 44,
    showOnline = false,
    isOnline = false,
    style,
    imageStyle,
  }) => {
    const [hasError, setHasError] = useState(false);

    const isValidUri = Boolean(uri && typeof uri === 'string' && uri.trim().length > 0 && !hasError);
    const badgeSize = Math.max(10, Math.round(size * 0.28));

    return (
      <View style={[styles.container, { width: size, height: size }, style]}>
        <Image
          source={isValidUri ? { uri: uri!.trim() } : DEFAULT_AVATAR}
          onError={() => setHasError(true)}
          style={[
            styles.image,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
            },
            imageStyle,
          ]}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
        />
        {showOnline && isOnline && (
          <View
            style={[
              styles.onlineBadge,
              {
                width: badgeSize,
                height: badgeSize,
                borderRadius: badgeSize / 2,
                borderWidth: Math.max(1.5, Math.round(badgeSize * 0.2)),
              },
            ]}
          />
        )}
      </View>
    );
  },
  (prev, next) =>
    prev.uri === next.uri &&
    prev.size === next.size &&
    prev.showOnline === next.showOnline &&
    prev.isOnline === next.isOnline
);

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    backgroundColor: '#27272a',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#10b981',
    borderColor: '#ffffff',
  },
});

export default Avatar;
