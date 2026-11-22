import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Send, Check } from 'lucide-react-native';
import { THEMES, ThemeColors } from '../../constants/themes';
import { useThemeStore } from '../../store/useThemeStore';
import { useToastStore } from '../../store/useToastStore';

export default function SettingsTab() {
  const { theme, themeName, setTheme } = useThemeStore();
  const { showToast } = useToastStore();

  const themeKeys = Object.keys(THEMES);

  const handleSelectTheme = (key: string) => {
    setTheme(key as any);
    showToast(`Theme changed to ${key.charAt(0).toUpperCase() + key.slice(1)}`, 'info');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.base100 }]} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.baseContent }]}>Theme</Text>
          <Text style={[styles.subtitle, { color: theme.baseContentMuted }]}>
            Choose a theme for your chat interface
          </Text>
        </View>

        {/* Theme selection grid */}
        <View style={styles.grid}>
          {themeKeys.map((key) => {
            const t: ThemeColors = THEMES[key];
            const isSelected = themeName === key;

            return (
              <TouchableOpacity
                key={key}
                onPress={() => handleSelectTheme(key)}
                style={[
                  styles.themeCard,
                  {
                    backgroundColor: t.base200,
                    borderColor: isSelected ? theme.primary : t.base300,
                    borderWidth: isSelected ? 2 : 1,
                  },
                ]}
                activeOpacity={0.8}
              >
                {/* 4 Swatch Colors */}
                <View style={[styles.swatchContainer, { backgroundColor: t.base100 }]}>
                  <View style={[styles.swatch, { backgroundColor: t.primary }]} />
                  <View style={[styles.swatch, { backgroundColor: t.secondary }]} />
                  <View style={[styles.swatch, { backgroundColor: t.accent }]} />
                  <View style={[styles.swatch, { backgroundColor: t.neutral }]} />
                </View>

                {/* Theme Name */}
                <View style={styles.themeNameRow}>
                  <Text style={[styles.themeName, { color: t.baseContent }]}>
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </Text>
                  {isSelected && <Check size={14} color={theme.primary} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Live Chat Preview */}
        <View style={styles.previewSection}>
          <Text style={[styles.previewTitle, { color: theme.baseContent }]}>Preview</Text>

          <View
            style={[
              styles.previewContainer,
              { backgroundColor: theme.base200, borderColor: theme.base300 },
            ]}
          >
            {/* Mock Chat Card */}
            <View
              style={[
                styles.mockChat,
                { backgroundColor: theme.base100, borderColor: theme.base300 },
              ]}
            >
              {/* Header */}
              <View
                style={[
                  styles.mockHeader,
                  { borderBottomColor: theme.base300, backgroundColor: theme.base100 },
                ]}
              >
                <View style={[styles.mockAvatar, { backgroundColor: theme.primary }]}>
                  <Text style={[styles.mockAvatarText, { color: theme.primaryContent }]}>J</Text>
                </View>
                <View>
                  <Text style={[styles.mockName, { color: theme.baseContent }]}>John Doe</Text>
                  <Text style={[styles.mockStatus, { color: '#10b981' }]}>Online</Text>
                </View>
              </View>

              {/* Chat Messages */}
              <View style={styles.mockMessages}>
                {/* Incoming Message */}
                <View style={styles.incomingRow}>
                  <View style={[styles.mockBubble, { backgroundColor: theme.base300 }]}>
                    <Text style={[styles.bubbleText, { color: theme.baseContent }]}>
                      Hey! How's it going?
                    </Text>
                    <Text style={[styles.timeText, { color: theme.baseContentMuted }]}>
                      12:00 PM
                    </Text>
                  </View>
                </View>

                {/* Outgoing Message */}
                <View style={styles.outgoingRow}>
                  <View style={[styles.mockBubble, { backgroundColor: theme.primary }]}>
                    <Text style={[styles.bubbleText, { color: theme.primaryContent }]}>
                      I'm doing great! Just working on some new features.
                    </Text>
                    <Text style={[styles.timeText, { color: theme.primaryContent + '90' }]}>
                      12:01 PM
                    </Text>
                  </View>
                </View>
              </View>

              {/* Mock Input Bar */}
              <View
                style={[
                  styles.mockInputBar,
                  { borderTopColor: theme.base300, backgroundColor: theme.base100 },
                ]}
              >
                <TextInput
                  value="This is a preview"
                  editable={false}
                  style={[
                    styles.mockInput,
                    {
                      backgroundColor: theme.base200,
                      color: theme.baseContentMuted,
                      borderColor: theme.base300,
                    },
                  ]}
                />
                <View style={[styles.mockSendBtn, { backgroundColor: theme.primary }]}>
                  <Send size={15} color={theme.primaryContent} />
                </View>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  header: {
    paddingVertical: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  themeCard: {
    flexBasis: '30%',
    flexGrow: 1,
    minWidth: 95,
    borderRadius: 12,
    padding: 8,
    gap: 6,
  },
  swatchContainer: {
    flexDirection: 'row',
    height: 28,
    borderRadius: 6,
    padding: 3,
    gap: 3,
  },
  swatch: {
    flex: 1,
    borderRadius: 4,
  },
  themeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  themeName: {
    fontSize: 11,
    fontWeight: '700',
  },
  previewSection: {
    marginTop: 10,
    gap: 8,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  previewContainer: {
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
  },
  mockChat: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  mockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 8,
  },
  mockAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mockAvatarText: {
    fontSize: 12,
    fontWeight: '800',
  },
  mockName: {
    fontSize: 13,
    fontWeight: '700',
  },
  mockStatus: {
    fontSize: 10,
    fontWeight: '500',
  },
  mockMessages: {
    padding: 12,
    gap: 10,
  },
  incomingRow: {
    alignItems: 'flex-start',
  },
  outgoingRow: {
    alignItems: 'flex-end',
  },
  mockBubble: {
    maxWidth: '82%',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  bubbleText: {
    fontSize: 12,
    lineHeight: 16,
  },
  timeText: {
    fontSize: 9,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  mockInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  mockInput: {
    flex: 1,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 12,
  },
  mockSendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
