import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../store/useAuthStore';
import { useThemeStore } from '../store/useThemeStore';

export default function Index() {
  const { authUser, isCheckingAuth } = useAuthStore();
  const { theme } = useThemeStore();
  const router = useRouter();

  useEffect(() => {
    if (!isCheckingAuth) {
      if (!authUser) {
        router.replace('/(auth)/login' as any);
      } else if (!authUser.isVerified) {
        router.replace('/(auth)/verify' as any);
      } else {
        router.replace('/(tabs)' as any);
      }
    }
  }, [authUser, isCheckingAuth]);

  return (
    <View style={[styles.container, { backgroundColor: theme.base100 }]}>
      <ActivityIndicator size="large" color={theme.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
