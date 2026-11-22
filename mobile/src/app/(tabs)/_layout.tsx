import React, { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { MessageSquare, Users, User, Settings } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeStore } from '../../store/useThemeStore';
import { useChatStore } from '../../store/useChatStore';
import { useFriendsStore } from '../../store/useFriendsStore';
import { useAuthStore } from '../../store/useAuthStore';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { theme } = useThemeStore();
  const { unreadCounts, fetchUnreadCounts } = useChatStore();
  const { pendingRequests, getPendingRequests } = useFriendsStore();
  const { socket } = useAuthStore();

  useEffect(() => {
    fetchUnreadCounts();
    getPendingRequests();
  }, []);

  // Compute total unread messages count
  const totalUnread = Object.values(unreadCounts).reduce((acc, count) => acc + count, 0);
  const pendingRequestsCount = pendingRequests.length;

  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          left: 18,
          right: 18,
          bottom: insets.bottom > 0 ? insets.bottom + 6 : 14,
          height: 64,
          borderRadius: 32,
          backgroundColor: theme.base200,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: theme.base300,
          elevation: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.25,
          shadowRadius: 10,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.baseContentMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chats',
          tabBarIcon: ({ color, size }) => <MessageSquare size={size} color={color} />,
          tabBarBadge: totalUnread > 0 ? (totalUnread > 99 ? '99+' : totalUnread) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: theme.primary,
            color: theme.primaryContent,
            fontSize: 10,
            fontWeight: '700',
          },
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: 'Friends',
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
          tabBarBadge: pendingRequestsCount > 0 ? pendingRequestsCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: theme.primary,
            color: theme.primaryContent,
            fontSize: 10,
            fontWeight: '700',
          },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
