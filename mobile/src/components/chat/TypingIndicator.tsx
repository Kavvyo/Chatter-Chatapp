import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';
import { useThemeStore } from '../../store/useThemeStore';
import Avatar from '../ui/Avatar';

interface TypingIndicatorProps {
  visible: boolean;
  avatarUri?: string | null;
}

const DOT_DELAYS = [0, 150, 300];

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ visible, avatarUri }) => {
  const { theme } = useThemeStore();

  const containerOpacity = useRef(new Animated.Value(0)).current;
  const containerScale = useRef(new Animated.Value(0.9)).current;
  const containerTranslateY = useRef(new Animated.Value(10)).current;

  const dotAnims = useRef(DOT_DELAYS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(containerOpacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(containerScale, {
          toValue: 1,
          damping: 16,
          stiffness: 220,
          mass: 0.7,
          useNativeDriver: true,
        }),
        Animated.spring(containerTranslateY, {
          toValue: 0,
          damping: 18,
          stiffness: 220,
          mass: 0.75,
          useNativeDriver: true,
        }),
      ]).start();

      const loops = dotAnims.map((anim, idx) => {
        anim.setValue(0);
        return Animated.loop(
          Animated.sequence([
            Animated.delay(DOT_DELAYS[idx]),
            Animated.timing(anim, {
              toValue: 1,
              duration: 300,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0,
              duration: 300,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.delay(450 - DOT_DELAYS[idx]),
          ])
        );
      });

      loops.forEach((l) => l.start());
      return () => {
        loops.forEach((l) => l.stop());
      };
    } else {
      containerOpacity.setValue(0);
      containerScale.setValue(0.9);
      containerTranslateY.setValue(10);
    }
  }, [visible, containerOpacity, containerScale, containerTranslateY, dotAnims]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.row,
        {
          opacity: containerOpacity,
          transform: [
            { translateY: containerTranslateY },
            { scale: containerScale },
          ],
        },
      ]}
    >
      <Avatar uri={avatarUri} size={30} style={styles.avatar} />

      <View
        style={[
          styles.bubble,
          { backgroundColor: theme.isDark ? theme.neutral : theme.base200 },
        ]}
      >
        <View style={styles.dotsRow}>
          {dotAnims.map((anim, index) => {
            const translateY = anim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -5],
            });
            const opacity = anim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.4, 1],
            });
            const scale = anim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.88, 1.16],
            });

            return (
              <Animated.View
                key={index}
                style={[
                  styles.dot,
                  {
                    backgroundColor: theme.baseContentMuted,
                    opacity,
                    transform: [{ translateY }, { scale }],
                  },
                ]}
              />
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    marginTop: 4,
    marginBottom: 8,
    gap: 8,
  },
  avatar: {
    marginBottom: 2,
  },
  bubble: {
    borderRadius: 20,
    borderBottomLeftRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 12,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
});
