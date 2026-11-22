import React, { useState, useEffect } from 'react';
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
import { UserCheck, X, UserPlus, UserMinus, Search, Users } from 'lucide-react-native';
import { useFriendsStore } from '../../store/useFriendsStore';
import { useChatStore, ChatUser } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useThemeStore } from '../../store/useThemeStore';
import { useToastStore } from '../../store/useToastStore';
import Avatar from '../../components/ui/Avatar';

type TabSection = 'requests' | 'find' | 'friends';

export default function FriendsTab() {
  const { theme } = useThemeStore();
  const { authUser } = useAuthStore();
  const {
    friends,
    pendingRequests,
    getFriends,
    getPendingRequests,
    acceptRequest,
    cancelRequest,
    unfriendUser,
    sendRequest,
  } = useFriendsStore();
  const { users, getUsers } = useChatStore();
  const { showToast, showAlert } = useToastStore();

  const [activeTab, setActiveTab] = useState<TabSection>('requests');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    getFriends();
    getPendingRequests();
    getUsers();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([getFriends(), getPendingRequests(), getUsers()]);
    setRefreshing(false);
  };

  const handleAccept = async (userId: string) => {
    const res = await acceptRequest(userId);
    if (res.success) {
      showToast('Friend request accepted!', 'success');
    } else {
      showToast(res.message || 'Failed to accept friend request', 'error');
    }
  };

  const handleCancel = async (userId: string) => {
    const res = await cancelRequest(userId);
    if (res.success) {
      showToast('Request canceled', 'info');
    } else {
      showToast(res.message || 'Failed to cancel request', 'error');
    }
  };

  const handleAddFriend = async (userId: string) => {
    const res = await sendRequest(userId);
    if (res.success) {
      showToast('Friend request sent!', 'success');
    } else {
      showToast(res.message || 'Failed to send request', 'error');
    }
  };

  const handleUnfriend = (user: ChatUser) => {
    showAlert(
      'Unfriend Confirmation',
      `Are you sure you want to unfriend ${user.fullName}? Conversation history will be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfriend',
          style: 'destructive',
          onPress: async () => {
            const res = await unfriendUser(user._id);
            if (res.success) {
              showToast(`Unfriended ${user.fullName}`, 'info');
            } else {
              showToast(res.message || 'Failed to unfriend user', 'error');
            }
          },
        },
      ]
    );
  };

  // Filter users in the "Find" tab
  const filteredUsers = users.filter((u) => {
    if (u._id === authUser?._id) return false;
    if (!searchQuery.trim()) return true;
    return u.fullName.toLowerCase().includes(searchQuery.toLowerCase().trim());
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.base100 }]} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.base300 }]}>
        <Text style={[styles.headerTitle, { color: theme.baseContent }]}>Friends</Text>
      </View>

      {/* Segmented Tab Controls */}
      <View style={[styles.tabBar, { backgroundColor: theme.base200 }]}>
        <TouchableOpacity
          onPress={() => setActiveTab('requests')}
          style={[
            styles.tabItem,
            activeTab === 'requests' && [styles.activeTabItem, { backgroundColor: theme.base100 }],
          ]}
        >
          <Text
            style={[
              styles.tabLabel,
              { color: activeTab === 'requests' ? theme.primary : theme.baseContentMuted },
            ]}
          >
            Requests
          </Text>
          {pendingRequests.length > 0 && (
            <View style={[styles.badge, { backgroundColor: theme.primary }]}>
              <Text style={[styles.badgeText, { color: theme.primaryContent }]}>
                {pendingRequests.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('find')}
          style={[
            styles.tabItem,
            activeTab === 'find' && [styles.activeTabItem, { backgroundColor: theme.base100 }],
          ]}
        >
          <Text
            style={[
              styles.tabLabel,
              { color: activeTab === 'find' ? theme.primary : theme.baseContentMuted },
            ]}
          >
            Find People
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('friends')}
          style={[
            styles.tabItem,
            activeTab === 'friends' && [styles.activeTabItem, { backgroundColor: theme.base100 }],
          ]}
        >
          <Text
            style={[
              styles.tabLabel,
              { color: activeTab === 'friends' ? theme.primary : theme.baseContentMuted },
            ]}
          >
            My Friends ({friends.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab 1: Pending Friend Requests */}
      {activeTab === 'requests' && (
        <FlatList
          data={pendingRequests}
          keyExtractor={(item) => item._id}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.primary]}
              tintColor={theme.primary}
            />
          }
          renderItem={({ item }) => {
            const requester = item.requester;
            return (
              <View
                style={[
                  styles.cardRow,
                  { backgroundColor: theme.base100, borderBottomColor: theme.base300 },
                ]}
              >
                <Avatar uri={requester.profilePic} size={46} style={styles.avatarMargin} />

                <View style={styles.userInfo}>
                  <Text style={[styles.name, { color: theme.baseContent }]} numberOfLines={1}>
                    {requester.fullName}
                  </Text>
                  <Text style={[styles.subtext, { color: theme.baseContentMuted }]}>
                    Wants to connect with you
                  </Text>
                </View>

                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    onPress={() => handleCancel(requester._id)}
                    style={[styles.iconButton, { backgroundColor: theme.error + '20' }]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <X size={18} color={theme.error} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleAccept(requester._id)}
                    style={[styles.iconButton, { backgroundColor: theme.primary }]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <UserCheck size={18} color={theme.primaryContent} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Users size={44} color={theme.baseContentMuted} />
              <Text style={[styles.emptyTitle, { color: theme.baseContent }]}>
                No pending requests
              </Text>
              <Text style={[styles.emptySubtitle, { color: theme.baseContentMuted }]}>
                When someone sends you a friend request, it will appear here.
              </Text>
            </View>
          }
        />
      )}

      {/* Tab 2: Find People */}
      {activeTab === 'find' && (
        <View style={styles.flex1}>
          <View
            style={[
              styles.searchBox,
              { backgroundColor: theme.base200, borderColor: theme.base300 },
            ]}
          >
            <Search size={18} color={theme.baseContentMuted} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search user by name..."
              placeholderTextColor={theme.baseContentMuted}
              style={[styles.searchInput, { color: theme.baseContent }]}
            />
          </View>

          <FlatList
            data={filteredUsers}
            keyExtractor={(item) => item._id}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={7}
            removeClippedSubviews={Platform.OS === 'android'}
            contentContainerStyle={{ paddingBottom: 24 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[theme.primary]}
                tintColor={theme.primary}
              />
            }
            renderItem={({ item }) => {
              const isFriend = friends.some((f) => f._id === item._id);
              const isPending = pendingRequests.some((p) => p.requester?._id === item._id);

              return (
                <View
                  style={[
                    styles.cardRow,
                    { backgroundColor: theme.base100, borderBottomColor: theme.base300 },
                  ]}
                >
                  <Avatar uri={item.profilePic} size={46} style={styles.avatarMargin} />

                  <View style={styles.userInfo}>
                    <Text style={[styles.name, { color: theme.baseContent }]} numberOfLines={1}>
                      {item.fullName}
                    </Text>
                    <Text style={[styles.subtext, { color: theme.baseContentMuted }]}>
                      {item.email}
                    </Text>
                  </View>

                  {isFriend ? (
                    <View style={[styles.statusBadge, { backgroundColor: theme.base300 }]}>
                      <Text style={[styles.statusBadgeText, { color: theme.baseContent }]}>
                        Friends
                      </Text>
                    </View>
                  ) : isPending ? (
                    <View style={[styles.statusBadge, { backgroundColor: theme.primary + '20' }]}>
                      <Text style={[styles.statusBadgeText, { color: theme.primary }]}>
                        Pending
                      </Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => handleAddFriend(item._id)}
                      style={[styles.addBtn, { backgroundColor: theme.primary }]}
                      activeOpacity={0.8}
                    >
                      <UserPlus size={16} color={theme.primaryContent} />
                      <Text style={[styles.addBtnText, { color: theme.primaryContent }]}>Add</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyTitle, { color: theme.baseContent }]}>No users found</Text>
              </View>
            }
          />
        </View>
      )}

      {/* Tab 3: My Friends List */}
      {activeTab === 'friends' && (
        <FlatList
          data={friends}
          keyExtractor={(item) => item._id}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.primary]}
              tintColor={theme.primary}
            />
          }
          renderItem={({ item }) => (
            <View
              style={[
                styles.cardRow,
                { backgroundColor: theme.base100, borderBottomColor: theme.base300 },
              ]}
            >
              <Avatar uri={item.profilePic} size={46} style={styles.avatarMargin} />

              <View style={styles.userInfo}>
                <Text style={[styles.name, { color: theme.baseContent }]} numberOfLines={1}>
                  {item.fullName}
                </Text>
                <Text style={[styles.subtext, { color: theme.baseContentMuted }]}>
                  {item.email}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => handleUnfriend(item)}
                style={[styles.unfriendBtn, { borderColor: theme.error }]}
                activeOpacity={0.7}
              >
                <UserMinus size={15} color={theme.error} />
                <Text style={[styles.unfriendBtnText, { color: theme.error }]}>Unfriend</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Users size={44} color={theme.baseContentMuted} />
              <Text style={[styles.emptyTitle, { color: theme.baseContent }]}>
                No friends yet
              </Text>
              <Text style={[styles.emptySubtitle, { color: theme.baseContentMuted }]}>
                Search for friends in the "Find People" tab.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex1: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 12,
    padding: 3,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 9,
    gap: 6,
  },
  activeTabItem: {
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    height: '100%',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  avatarMargin: {
    marginRight: 12,
  },
  userInfo: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
  },
  subtext: {
    fontSize: 12,
    marginTop: 2,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  unfriendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  unfriendBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
  },
});
