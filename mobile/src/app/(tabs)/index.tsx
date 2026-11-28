import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Search, Users, X } from 'lucide-react-native';
import { useChatStore, ChatUser } from '../../store/useChatStore';
import { useFriendsStore } from '../../store/useFriendsStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useThemeStore } from '../../store/useThemeStore';
import Avatar from '../../components/ui/Avatar';

type FilterType = 'all' | 'online' | 'unread';

function formatShortLastSeen(iso?: string | null): string {
  if (!iso) return 'Offline';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return 'Offline';
  const diffMin = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(ts).toLocaleDateString();
}

export default function ChatsTab() {
  const router = useRouter();
  const { theme } = useThemeStore();
  const { setSelectedUser, unreadCounts, fetchUnreadCounts } = useChatStore();
  const { friends, getFriends } = useFriendsStore();
  const { authUser, onlineUsers, lastSeenMap } = useAuthStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!authUser?._id) return;
    // Cached friends & unread counts render immediately; sync updates quietly in background
    getFriends(true);
    fetchUnreadCounts();
  }, [authUser?._id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([getFriends(true), fetchUnreadCounts()]);
    setRefreshing(false);
  };

  const handleSelectFilter = (filter: FilterType) => {
    setActiveFilter(filter);
  };

  // Filter friends according to active filter and search query
  const filteredFriends = friends.filter((friend) => {
    const isOnline = onlineUsers.includes(friend._id);
    const unread = unreadCounts[friend._id] || 0;

    if (activeFilter === 'online' && !isOnline) return false;
    if (activeFilter === 'unread' && unread === 0) return false;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      return friend.fullName.toLowerCase().includes(query);
    }
    return true;
  });

  // Extract active/online friends for stories horizontal row
  const onlineFriends = friends.filter((f) => onlineUsers.includes(f._id));

  const handleSelectChat = (user: ChatUser) => {
    const unreadCount = unreadCounts[user._id] || 0;
    setSelectedUser(user);
    router.push({
      pathname: '/chat/[id]' as any,
      params: { id: user._id, unreadCount: String(unreadCount) },
    });
  };

  const renderFriendItem = ({ item }: { item: ChatUser }) => {
    const isOnline = onlineUsers.includes(item._id);
    const unreadCount = unreadCounts[item._id] || 0;

    return (
      <TouchableOpacity
        onPress={() => handleSelectChat(item)}
        style={[
          styles.chatItem,
          {
            backgroundColor: theme.base100,
            borderBottomColor: theme.base300 + '50',
          },
        ]}
        activeOpacity={0.7}
      >
        {/* Avatar with Online indicator */}
        <Avatar
          uri={item.profilePic}
          size={52}
          showOnline={true}
          isOnline={isOnline}
          style={styles.avatarMargin}
        />

        {/* Content Info */}
        <View style={styles.chatDetails}>
          <View style={styles.topRow}>
            <Text style={[styles.userName, { color: theme.baseContent }]} numberOfLines={1}>
              {item.fullName}
            </Text>
            <Text style={[styles.timeText, { color: theme.baseContentMuted }]}>
              {isOnline ? 'Active' : formatShortLastSeen(lastSeenMap[item._id] || item.lastSeen)}
            </Text>
          </View>

          <View style={styles.bottomRow}>
            <Text
              style={[
                styles.statusText,
                { color: isOnline ? '#10b981' : theme.baseContentMuted },
              ]}
              numberOfLines={1}
            >
              {isOnline ? 'Online • Tap to chat' : 'Tap to message'}
            </Text>

            {unreadCount > 0 && (
              <View style={[styles.unreadBadge, { backgroundColor: theme.primary }]}>
                <Text style={[styles.unreadBadgeText, { color: theme.primaryContent }]}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.base100 }]} edges={['top', 'left', 'right']}>
      {/* Top Header */}
      <View style={styles.header}>
        <Text style={[styles.appTitle, { color: theme.baseContent }]}>Chats</Text>
      </View>

      {/* Category Filter Pills (All / Online / Unread) */}
      <View style={styles.filterSection}>
        <TouchableOpacity
          onPress={() => handleSelectFilter('all')}
          style={[
            styles.filterPill,
            {
              backgroundColor: activeFilter === 'all' ? theme.primary : theme.base200,
              borderColor: activeFilter === 'all' ? theme.primary : theme.base300,
            },
          ]}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.filterPillText,
              { color: activeFilter === 'all' ? theme.primaryContent : theme.baseContentMuted },
            ]}
          >
            All
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleSelectFilter('online')}
          style={[
            styles.filterPill,
            {
              backgroundColor: activeFilter === 'online' ? theme.primary : theme.base200,
              borderColor: activeFilter === 'online' ? theme.primary : theme.base300,
            },
          ]}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.filterPillText,
              { color: activeFilter === 'online' ? theme.primaryContent : theme.baseContentMuted },
            ]}
          >
            Online ({onlineFriends.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleSelectFilter('unread')}
          style={[
            styles.filterPill,
            {
              backgroundColor: activeFilter === 'unread' ? theme.primary : theme.base200,
              borderColor: activeFilter === 'unread' ? theme.primary : theme.base300,
            },
          ]}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.filterPillText,
              { color: activeFilter === 'unread' ? theme.primaryContent : theme.baseContentMuted },
            ]}
          >
            Unread
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={[styles.searchBox, { backgroundColor: theme.base200, borderColor: theme.base300 }]}>
        <Search size={18} color={theme.baseContentMuted} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search contacts..."
          placeholderTextColor={theme.baseContentMuted}
          style={[styles.searchInput, { color: theme.baseContent }]}
        />
        {Boolean(searchQuery) && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={16} color={theme.baseContentMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Friends / Chats List */}
      <FlatList
        data={filteredFriends}
        keyExtractor={(item) => item._id}
        renderItem={renderFriendItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.primary]}
            tintColor={theme.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Users size={48} color={theme.baseContentMuted} />
            <Text style={[styles.emptyTitle, { color: theme.baseContent }]}>
              {activeFilter === 'online' ? 'No friends online' : 'No contacts yet'}
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.baseContentMuted }]}>
              {activeFilter === 'online'
                ? 'Check back later or switch to the All filter.'
                : 'Head over to the Friends tab to find and add people.'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 8,
  },
  appTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  filterSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    height: '100%',
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 90, // Room for floating dock tab bar
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
  },
  avatarMargin: {
    marginRight: 14,
  },
  chatDetails: {
    flex: 1,
    gap: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  timeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 80,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
