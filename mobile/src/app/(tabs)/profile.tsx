import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  User,
  Mail,
  LogOut,
  Check,
  X,
  ChevronRight,
  ShieldCheck,
  Calendar,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../store/useAuthStore';
import { useFriendsStore } from '../../store/useFriendsStore';
import { useChatStore } from '../../store/useChatStore';
import { useThemeStore } from '../../store/useThemeStore';
import { useToastStore } from '../../store/useToastStore';
import Avatar from '../../components/ui/Avatar';

export default function ProfileTab() {
  const { theme } = useThemeStore();
  const { authUser, isUpdatingProfile, updateProfile, updateFullname, logOut } = useAuthStore();
  const { friends } = useFriendsStore();
  const { users } = useChatStore();
  const { showToast, showAlert } = useToastStore();

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameText, setNameText] = useState(authUser?.fullName || '');
  const [isSavingName, setIsSavingName] = useState(false);

  const handlePickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showToast('Camera roll permission is required to change photo', 'warning');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets[0]?.base64) {
        const base64Data = `data:image/jpeg;base64,${result.assets[0].base64}`;
        const res = await updateProfile({ profilePic: base64Data });
        if (res.success) {
          showToast('Profile photo updated!', 'success');
        } else {
          showToast(res.message || 'Failed to update profile photo', 'error');
        }
      }
    } catch {
      showToast('An error occurred while uploading photo', 'error');
    }
  };

  const handleSaveName = async () => {
    if (!nameText.trim()) return;
    setIsSavingName(true);
    const res = await updateFullname({ fullName: nameText.trim() });
    setIsSavingName(false);
    if (res.success) {
      setIsEditingName(false);
      showToast('Name updated successfully!', 'success');
    } else {
      showToast(res.message || 'Failed to update name', 'error');
    }
  };

  const handleLogoutPress = () => {
    showAlert('Confirm Log Out', 'Are you sure you want to sign out of your account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => logOut(),
      },
    ]);
  };

  const memberSinceYear = authUser?.createdAt
    ? new Date(authUser.createdAt).toLocaleDateString([], { month: 'short', year: 'numeric' })
    : '2025';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.base100 }]} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header Title */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.baseContent }]}>Profile</Text>
        </View>

        {/* Hero Section: Centered Avatar & Name (Screenshot 3 style) */}
        <View style={styles.heroSection}>
          <View style={styles.avatarWrapper}>
            <Avatar uri={authUser?.profilePic} size={96} showOnline={true} isOnline={true} />
            <TouchableOpacity
              onPress={handlePickImage}
              disabled={isUpdatingProfile}
              style={[styles.cameraBtn, { backgroundColor: theme.primary }]}
              activeOpacity={0.8}
            >
              {isUpdatingProfile ? (
                <ActivityIndicator size="small" color={theme.primaryContent} />
              ) : (
                <Camera size={16} color={theme.primaryContent} />
              )}
            </TouchableOpacity>
          </View>

          <Text style={[styles.heroName, { color: theme.baseContent }]}>
            {authUser?.fullName || 'User'}
          </Text>
          <Text style={[styles.heroEmail, { color: theme.baseContentMuted }]}>
            {authUser?.email || ''}
          </Text>
        </View>

        {/* 3-Column Stats Row (Screenshot 3 style) */}
        <View style={[styles.statsCard, { backgroundColor: theme.base200, borderColor: theme.base300 }]}>
          <View style={styles.statCol}>
            <Text style={[styles.statValue, { color: theme.baseContent }]}>{users.length}</Text>
            <Text style={[styles.statLabel, { color: theme.baseContentMuted }]}>Chats</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: theme.base300 }]} />
          <View style={styles.statCol}>
            <Text style={[styles.statValue, { color: theme.baseContent }]}>{friends.length}</Text>
            <Text style={[styles.statLabel, { color: theme.baseContentMuted }]}>Friends</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: theme.base300 }]} />
          <View style={styles.statCol}>
            <Text style={[styles.statValue, { color: '#10b981' }]}>Active</Text>
            <Text style={[styles.statLabel, { color: theme.baseContentMuted }]}>Status</Text>
          </View>
        </View>

        {/* Account Details & Edit Section */}
        <View style={[styles.sectionCard, { backgroundColor: theme.base200, borderColor: theme.base300 }]}>
          <Text style={[styles.cardHeaderTitle, { color: theme.baseContent }]}>Account Settings</Text>

          {/* Full Name item */}
          {isEditingName ? (
            <View style={styles.editRow}>
              <TextInput
                value={nameText}
                onChangeText={setNameText}
                style={[
                  styles.nameInput,
                  {
                    backgroundColor: theme.base100,
                    color: theme.baseContent,
                    borderColor: theme.base300,
                  },
                ]}
                autoFocus
                placeholder="Full Name"
                placeholderTextColor={theme.baseContentMuted}
              />
              <TouchableOpacity
                onPress={handleSaveName}
                disabled={isSavingName}
                style={[styles.saveBtn, { backgroundColor: theme.primary }]}
              >
                {isSavingName ? (
                  <ActivityIndicator size="small" color={theme.primaryContent} />
                ) : (
                  <Check size={18} color={theme.primaryContent} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setIsEditingName(false);
                  setNameText(authUser?.fullName || '');
                }}
                style={[styles.cancelBtn, { backgroundColor: theme.base300 }]}
              >
                <X size={18} color={theme.baseContent} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => {
                setNameText(authUser?.fullName || '');
                setIsEditingName(true);
              }}
              style={[styles.cardRow, { borderBottomColor: theme.base300 }]}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <View style={[styles.iconCircle, { backgroundColor: theme.primary + '18' }]}>
                  <User size={18} color={theme.primary} />
                </View>
                <View>
                  <Text style={[styles.rowLabel, { color: theme.baseContentMuted }]}>Display Name</Text>
                  <Text style={[styles.rowValue, { color: theme.baseContent }]}>{authUser?.fullName}</Text>
                </View>
              </View>
              <ChevronRight size={18} color={theme.baseContentMuted} />
            </TouchableOpacity>
          )}

          {/* Email item */}
          <View style={[styles.cardRow, { borderBottomColor: theme.base300 }]}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconCircle, { backgroundColor: theme.primary + '18' }]}>
                <Mail size={18} color={theme.primary} />
              </View>
              <View>
                <Text style={[styles.rowLabel, { color: theme.baseContentMuted }]}>Email Address</Text>
                <Text style={[styles.rowValue, { color: theme.baseContent }]}>{authUser?.email}</Text>
              </View>
            </View>
            <ShieldCheck size={18} color="#10b981" />
          </View>

          {/* Member since item */}
          <View style={styles.cardRow}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconCircle, { backgroundColor: theme.primary + '18' }]}>
                <Calendar size={18} color={theme.primary} />
              </View>
              <View>
                <Text style={[styles.rowLabel, { color: theme.baseContentMuted }]}>Member Since</Text>
                <Text style={[styles.rowValue, { color: theme.baseContent }]}>{memberSinceYear}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Log Out Button Card */}
        <TouchableOpacity
          onPress={handleLogoutPress}
          style={[styles.logoutCard, { borderColor: theme.error + '40', backgroundColor: theme.error + '10' }]}
          activeOpacity={0.8}
        >
          <LogOut size={18} color={theme.error} />
          <Text style={[styles.logoutText, { color: theme.error }]}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 110, // Room for floating dock
    gap: 16,
  },
  header: {
    paddingVertical: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 6,
  },
  cameraBtn: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
    elevation: 3,
  },
  heroName: {
    fontSize: 22,
    fontWeight: '800',
  },
  heroEmail: {
    fontSize: 14,
    fontWeight: '500',
  },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 16,
    elevation: 2,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    height: 28,
  },
  sectionCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    elevation: 2,
  },
  cardHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  rowValue: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 1,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  nameInput: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  saveBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 8,
    marginTop: 4,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
