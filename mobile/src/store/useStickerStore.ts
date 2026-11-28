import { create } from 'zustand';
import { Directory, File } from 'expo-file-system';
import {
  copyStickerIntoSavedPack,
  deleteStickerPackFiles,
  importStickerFromUri,
  installStickerFilesIntoPack,
  installWastickersArchive,
  loadRecentStickers,
  loadStickerPacks,
  SAVED_PACK_ID,
  saveRecentStickers,
  saveStickerPacks,
  type StickerItem,
  type StickerPack,
} from '../lib/stickers';

interface StickerState {
  packs: StickerPack[];
  recentStickers: StickerItem[];
  isHydrated: boolean;
  isImporting: boolean;

  hydrateStickers: () => Promise<void>;
  importPackArchive: () => Promise<{ ok: boolean; message: string; pack?: StickerPack }>;
  importStickerImages: () => Promise<{ ok: boolean; message: string; pack?: StickerPack }>;
  importWhatsAppFolder: () => Promise<{ ok: boolean; message: string; pack?: StickerPack }>;
  importFromExternalUri: (uri: string) => Promise<{ ok: boolean; message: string; pack?: StickerPack }>;
  saveStickerToCollection: (params: {
    stickerHash: string;
    stickerUri?: string | null;
    isAnimated?: boolean;
  }) => Promise<{ ok: boolean; alreadySaved?: boolean; message: string; pack?: StickerPack }>;
  deletePack: (packId: string) => Promise<void>;
  recordRecentSticker: (sticker: StickerItem) => Promise<void>;
}

function upsertPack(packs: StickerPack[], pack: StickerPack): StickerPack[] {
  const idx = packs.findIndex((p) => p.id === pack.id);
  if (idx === -1) return [pack, ...packs];
  return packs.map((p, i) => (i === idx ? pack : p));
}

export const useStickerStore = create<StickerState>((set, get) => ({
  packs: [],
  recentStickers: [],
  isHydrated: false,
  isImporting: false,

  hydrateStickers: async () => {
    if (get().isHydrated) return;
    const [packs, recentStickers] = await Promise.all([
      loadStickerPacks(),
      loadRecentStickers(),
    ]);
    set({ packs, recentStickers, isHydrated: true });
  },

  importPackArchive: async () => {
    set({ isImporting: true });
    try {
      const picked = await File.pickFileAsync({
        multipleFiles: false,
        mimeTypes: ['*/*'],
      });
      if (picked.canceled || !picked.result) {
        return { ok: false, message: 'canceled' };
      }

      const bytes = await picked.result.bytes();
      const pack = await installWastickersArchive(
        bytes,
        picked.result.name || 'WhatsApp Stickers'
      );
      const nextPacks = upsertPack(get().packs, pack);
      await saveStickerPacks(nextPacks);
      set({ packs: nextPacks });
      return {
        ok: true,
        message: `Installed "${pack.name}" (${pack.stickers.length} stickers)`,
        pack,
      };
    } catch (error: any) {
      return {
        ok: false,
        message: error?.message || 'Failed to import sticker pack',
      };
    } finally {
      set({ isImporting: false });
    }
  },

  importStickerImages: async () => {
    set({ isImporting: true });
    try {
      const picked = await File.pickFileAsync({
        multipleFiles: true,
        mimeTypes: ['image/webp', 'image/png', 'image/*'],
      });
      if (picked.canceled || !picked.result || picked.result.length === 0) {
        return { ok: false, message: 'canceled' };
      }

      const existingCustom =
        get().packs.find((p) => p.id.startsWith('chatter_custom_stickers')) || null;
      const pack = await installStickerFilesIntoPack(
        picked.result,
        'My Stickers',
        'Local Stickers',
        existingCustom
      );
      const nextPacks = upsertPack(get().packs, pack);
      await saveStickerPacks(nextPacks);
      set({ packs: nextPacks });
      return {
        ok: true,
        message: `Added stickers to "${pack.name}"`,
        pack,
      };
    } catch (error: any) {
      return {
        ok: false,
        message: error?.message || 'Failed to import sticker files',
      };
    } finally {
      set({ isImporting: false });
    }
  },

  importWhatsAppFolder: async () => {
    set({ isImporting: true });
    try {
      const dir = await Directory.pickDirectoryAsync();
      const entries = dir.list();
      const stickerFiles = entries.filter(
        (item): item is File =>
          item instanceof File && /\.(webp|png)$/i.test(item.name || item.uri)
      );

      if (stickerFiles.length === 0) {
        return {
          ok: false,
          message: 'No .webp or .png stickers found in the selected folder.',
        };
      }

      const folderLabel =
        dir.name && dir.name !== 'primary' ? dir.name : 'WhatsApp Stickers';
      const pack = await installStickerFilesIntoPack(
        stickerFiles,
        folderLabel,
        'WhatsApp Folder'
      );
      const nextPacks = upsertPack(get().packs, pack);
      await saveStickerPacks(nextPacks);
      set({ packs: nextPacks });
      return {
        ok: true,
        message: `Imported ${pack.stickers.length} stickers from "${pack.name}"`,
        pack,
      };
    } catch (error: any) {
      const msg = error?.message || '';
      if (/cancel/i.test(msg)) {
        return { ok: false, message: 'canceled' };
      }
      return {
        ok: false,
        message: msg || 'Could not read stickers from that folder.',
      };
    } finally {
      set({ isImporting: false });
    }
  },

  importFromExternalUri: async (uri: string) => {
    set({ isImporting: true });
    try {
      await get().hydrateStickers();
      const { pack } = await importStickerFromUri(uri, get().packs);
      const nextPacks = upsertPack(get().packs, pack);
      await saveStickerPacks(nextPacks);
      set({ packs: nextPacks });
      return {
        ok: true,
        message: `Installed "${pack.name}" (${pack.stickers.length} stickers)`,
        pack,
      };
    } catch (error: any) {
      return {
        ok: false,
        message: error?.message || 'Failed to open sticker pack',
      };
    } finally {
      set({ isImporting: false });
    }
  },

  saveStickerToCollection: async ({ stickerHash, stickerUri, isAnimated }) => {
    try {
      await get().hydrateStickers();
      const existingPacks = get().packs;
      const alreadyInPacks = existingPacks.some((p) =>
        p.stickers.some((s) => s.stickerHash === stickerHash)
      );
      if (alreadyInPacks) {
        return {
          ok: true,
          alreadySaved: true,
          message: 'Already saved in your Chatter stickers',
        };
      }

      const existingSaved = existingPacks.find((p) => p.id === SAVED_PACK_ID) || null;
      const updatedSavedPack = await copyStickerIntoSavedPack(
        stickerHash,
        stickerUri,
        isAnimated,
        existingSaved
      );
      const nextPacks = upsertPack(existingPacks, updatedSavedPack);
      await saveStickerPacks(nextPacks);
      set({ packs: nextPacks });
      return {
        ok: true,
        alreadySaved: false,
        message: 'Saved to Chatter stickers',
        pack: updatedSavedPack,
      };
    } catch (error: any) {
      return {
        ok: false,
        message: error?.message || 'Could not save sticker to Chatter',
      };
    }
  },

  deletePack: async (packId: string) => {
    deleteStickerPackFiles(packId);
    const nextPacks = get().packs.filter((p) => p.id !== packId);
    const nextRecent = get().recentStickers.filter((s) => s.packId !== packId);
    await Promise.all([saveStickerPacks(nextPacks), saveRecentStickers(nextRecent)]);
    set({ packs: nextPacks, recentStickers: nextRecent });
  },

  recordRecentSticker: async (sticker: StickerItem) => {
    const filtered = get().recentStickers.filter(
      (s) => s.stickerHash !== sticker.stickerHash
    );
    const next = [sticker, ...filtered].slice(0, 24);
    set({ recentStickers: next });
    await saveRecentStickers(next);
  },
}));
