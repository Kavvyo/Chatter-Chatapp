import React, { useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationBar } from 'expo-navigation-bar';
import * as SystemUI from 'expo-system-ui';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/useAuthStore';
import { useThemeStore } from '../store/useThemeStore';
import { useCallStore } from '../store/useCallStore';
import { useChatStore } from '../store/useChatStore';
import { useFriendsStore } from '../store/useFriendsStore';
import { IncomingCallModal } from '../components/call/IncomingCallModal';
import { ActiveCallView } from '../components/call/ActiveCallView';
import { ThemedToast } from '../components/ui/ThemedToast';
import { ThemedAlertModal } from '../components/ui/ThemedAlertModal';

export default function RootLayout() {
  const { authUser, isCheckingAuth, checkAuth, socket } = useAuthStore();
  const { theme, loadTheme } = useThemeStore();
  const { initializeSocketListeners, uninitializeSocketListeners } = useCallStore();
  const { subscribeToMessages, unSubscribeFromMessages } = useChatStore();
  const { subscribeToFriendReqests, unSubscribeFromFriendReqests } = useFriendsStore();
  const segments = useSegments();
  const router = useRouter();

  // Load theme and check authentication, immediately dismissing native splash screen
  useEffect(() => {
    loadTheme();
    checkAuth();
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // Synchronize native Android window background with DaisyUI theme
  useEffect(() => {
    if (Platform.OS === 'android') {
      try {
        SystemUI.setBackgroundColorAsync(theme.base100).catch(() => {});
      } catch {
        // Safe fallback
      }
    }
  }, [theme]);

  // Globally bind real-time socket listeners for calls, messages, and friend requests
  useEffect(() => {
    if (socket) {
      initializeSocketListeners(socket);
      subscribeToMessages();
      subscribeToFriendReqests();
    }
    return () => {
      uninitializeSocketListeners();
      unSubscribeFromMessages();
      unSubscribeFromFriendReqests();
    };
  }, [socket]);

  // Auth routing protection
  useEffect(() => {
    if (isCheckingAuth) return;

    const currentSegments = segments as string[];
    const inAuthGroup = currentSegments[0] === '(auth)';

    if (!authUser) {
      if (!inAuthGroup) {
        router.replace('/(auth)/login' as any);
      }
    } else if (!authUser.isVerified) {
      if (currentSegments[1] !== 'verify') {
        router.replace('/(auth)/verify' as any);
      }
    } else if (inAuthGroup) {
      router.replace('/(tabs)' as any);
    }
  }, [authUser, isCheckingAuth, segments]);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <View style={[styles.root, { backgroundColor: theme.base100 }]}>
        <StatusBar style={theme.isDark ? 'light' : 'dark'} />
        <NavigationBar style={theme.isDark ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.base100 } }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
        </Stack>
        <IncomingCallModal />
        <ActiveCallView />
        <ThemedToast />
        <ThemedAlertModal />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
