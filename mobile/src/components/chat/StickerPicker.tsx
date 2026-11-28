import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Clock, FileArchive, FolderOpen, ImagePlus, Plus, X } from 'lucide-react-native';
import { useStickerStore } from '../../store/useStickerStore';
import { useThemeStore } from '../../store/useThemeStore';
import { useToastStore } from '../../store/useToastStore';
import type { StickerItem } from '../../lib/stickers';

interface StickerPickerProps {
  onSelectSticker: (sticker: StickerItem) => void;
}

export const StickerPicker: React.FC<StickerPickerProps> = ({ onSelectSticker }) => {
  const { theme } = useThemeStore();
  const { showToast, showAlert } = useToastStore();
  const {
    packs,
    recentStickers,
    isImporting,
    hydrateStickers,
    importPackArchive,
    importStickerImages,
    importWhatsAppFolder,
    deletePack,
  } = useStickerStore();

  const [selectedTab, setSelectedTab] = useState<string>('recent');
  const [showImportMenu, setShowImportMenu] = useState(false);

  useEffect(() => {
    hydrateStickers();
  }, [hydrateStickers]);

  // Keep selected tab valid when packs change or load
  useEffect(() => {
    if (selectedTab === 'recent' && recentStickers.length === 0 && packs.length > 0) {
      setSelectedTab(packs[0].id);
    } else if (
      selectedTab !== 'recent' &&
      !packs.some((p) => p.id === selectedTab)
    ) {
      setSelectedTab(recentStickers.length > 0 ? 'recent' : packs[0]?.id || 'recent');
    }
  }, [packs, recentStickers.length, selectedTab]);

  const activePack = useMemo(
    () => packs.find((p) => p.id === selectedTab) || null,
    [packs, selectedTab]
  );

  const visibleStickers = useMemo(() => {
    if (selectedTab === 'recent') return recentStickers;
    return activePack?.stickers || [];
  }, [selectedTab, recentStickers, activePack]);

  const runImport = async (
    action: () => Promise<{ ok: boolean; message: string; pack?: { id: string } }>
  ) => {
    const res = await action();
    if (res.message === 'canceled') return;
    showToast(res.message, res.ok ? 'success' : 'error');
    if (res.ok && res.pack?.id) {
      setSelectedTab(res.pack.id);
      setShowImportMenu(false);
    }
  };

  const confirmDeletePack = (packId: string, packName: string) => {
    showAlert(
      'Remove Sticker Pack',
      `Delete "${packName}" from this device?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => deletePack(packId),
        },
      ]
    );
  };

  const surfaceBg = theme.isDark ? theme.base200 : theme.base200;
  const cardBg = theme.isDark ? theme.neutral : theme.base100;
  const borderColor = theme.isDark ? 'rgba(255,255,255,0.08)' : theme.base300;
  const showingEmptyOrImport = showImportMenu || (packs.length === 0 && recentStickers.length === 0);

  return (
    <View style={[styles.container, { backgroundColor: surfaceBg, borderColor }]}>
      {/* Top Pack Tray Switcher */}
      <View style={[styles.tabBar, { borderBottomColor: borderColor }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabScroll}
        >
          {recentStickers.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setShowImportMenu(false);
                setSelectedTab('recent');
              }}
              style={[
                styles.tabBtn,
                selectedTab === 'recent' &&
                  !showImportMenu && { backgroundColor: theme.primary + '26' },
              ]}
              activeOpacity={0.75}
            >
              <Clock
                size={18}
                color={
                  selectedTab === 'recent' && !showImportMenu
                    ? theme.primary
                    : theme.baseContentMuted
                }
              />
            </TouchableOpacity>
          )}

          {packs.map((pack) => {
            const isActive = selectedTab === pack.id && !showImportMenu;
            return (
              <TouchableOpacity
                key={pack.id}
                onPress={() => {
                  setShowImportMenu(false);
                  setSelectedTab(pack.id);
                }}
                onLongPress={() => confirmDeletePack(pack.id, pack.name)}
                style={[
                  styles.tabBtn,
                  isActive && { backgroundColor: theme.primary + '26' },
                ]}
                activeOpacity={0.75}
              >
                <Image
                  source={{ uri: pack.trayUri }}
                  style={styles.trayThumb}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <TouchableOpacity
          onPress={() => setShowImportMenu((prev) => !prev)}
          style={[
            styles.importChip,
            { backgroundColor: showImportMenu ? theme.primary : cardBg, borderColor },
          ]}
          activeOpacity={0.8}
        >
          {showImportMenu && packs.length > 0 ? (
            <X size={15} color={theme.primaryContent} />
          ) : (
            <Plus size={15} color={showImportMenu ? theme.primaryContent : theme.primary} />
          )}
          <Text
            style={[
              styles.importChipText,
              { color: showImportMenu ? theme.primaryContent : theme.baseContent },
            ]}
          >
            {showImportMenu && packs.length > 0 ? 'Done' : 'Import'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Pack Grid or Import Options */}
      {isImporting ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.hintText, { color: theme.baseContentMuted }]}>
            Importing stickers locally...
          </Text>
        </View>
      ) : showingEmptyOrImport ? (
        <ScrollView contentContainerStyle={styles.importArea}>
          <Text style={[styles.importHeading, { color: theme.baseContent }]}>
            Install WhatsApp Stickers Locally
          </Text>
          <Text style={[styles.importSub, { color: theme.baseContentMuted }]}>
            Stored privately on your device & sent P2P without server uploads.
          </Text>

          <TouchableOpacity
            onPress={() => runImport(importPackArchive)}
            style={[styles.importOption, { backgroundColor: cardBg, borderColor }]}
            activeOpacity={0.8}
          >
            <View style={[styles.optionIcon, { backgroundColor: theme.primary + '20' }]}>
              <FileArchive size={18} color={theme.primary} />
            </View>
            <View style={styles.optionText}>
              <Text style={[styles.optionTitle, { color: theme.baseContent }]}>
                Import .wastickers / .zip Pack
              </Text>
              <Text style={[styles.optionSub, { color: theme.baseContentMuted }]}>
                Select WhatsApp sticker pack archives from Downloads or Files
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => runImport(importStickerImages)}
            style={[styles.importOption, { backgroundColor: cardBg, borderColor }]}
            activeOpacity={0.8}
          >
            <View style={[styles.optionIcon, { backgroundColor: theme.primary + '20' }]}>
              <ImagePlus size={18} color={theme.primary} />
            </View>
            <View style={styles.optionText}>
              <Text style={[styles.optionTitle, { color: theme.baseContent }]}>
                Pick .webp / PNG Sticker Files
              </Text>
              <Text style={[styles.optionSub, { color: theme.baseContentMuted }]}>
                Add static or animated WebP stickers into a local pack
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => runImport(importWhatsAppFolder)}
            style={[styles.importOption, { backgroundColor: cardBg, borderColor }]}
            activeOpacity={0.8}
          >
            <View style={[styles.optionIcon, { backgroundColor: theme.primary + '20' }]}>
              <FolderOpen size={18} color={theme.primary} />
            </View>
            <View style={styles.optionText}>
              <Text style={[styles.optionTitle, { color: theme.baseContent }]}>
                Import From WhatsApp Folder
              </Text>
              <Text style={[styles.optionSub, { color: theme.baseContentMuted }]}>
                Grant folder access to Android/media/.../WhatsApp Stickers
              </Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <View style={styles.gridWrap}>
          {activePack && (
            <View style={styles.packMetaRow}>
              <Text style={[styles.packTitle, { color: theme.baseContentMuted }]} numberOfLines={1}>
                {activePack.name} • {activePack.stickers.length} stickers
              </Text>
              <Text style={[styles.packHint, { color: theme.baseContentMuted }]}>
                Hold icon to remove
              </Text>
            </View>
          )}

          <FlatList
            data={visibleStickers}
            keyExtractor={(item) => item.id}
            numColumns={4}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.gridContent}
            columnWrapperStyle={styles.gridColumn}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => onSelectSticker(item)}
                style={styles.stickerCell}
                activeOpacity={0.7}
              >
                <Image
                  source={{ uri: item.uri }}
                  style={styles.stickerThumb}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 278,
    marginTop: 8,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    gap: 6,
  },
  tabScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 4,
  },
  tabBtn: {
    width: 38,
    height: 34,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trayThumb: {
    width: 26,
    height: 26,
    borderRadius: 6,
  },
  importChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  importChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  hintText: {
    fontSize: 13,
    fontWeight: '500',
  },
  importArea: {
    padding: 12,
    gap: 8,
  },
  importHeading: {
    fontSize: 14,
    fontWeight: '700',
  },
  importSub: {
    fontSize: 12,
    marginBottom: 4,
  },
  importOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  optionSub: {
    fontSize: 11,
    marginTop: 1,
  },
  gridWrap: {
    flex: 1,
  },
  packMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 2,
  },
  packTitle: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  packHint: {
    fontSize: 10,
    opacity: 0.75,
  },
  gridContent: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  gridColumn: {
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  stickerCell: {
    width: '24%',
    aspectRatio: 1,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
  },
  stickerThumb: {
    width: '100%',
    height: '100%',
  },
});
