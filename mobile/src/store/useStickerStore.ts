import { create } from 'zustand';
import { Directory, File } from 'expo-file-system';
import {
  copyStickerIntoSavedPack,
  deleteStickerPackFiles,
  importStickerBatchFromPaths,
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

export interface ExternalStickerIntentPayload {
  type: 'started' | 'files' | 'wa_pack' | 'error';
  paths?: string[];
  packName?: string;
  author?: string;
  trayPath?: string;
  message?: string;
}

export interface StickerImportModalState {
  status: 'importing' | 'success' | 'error';
  packName?: string;
  message?: string;
  pack?: StickerPack;
}

interface StickerState {
  packs: StickerPack[];
  recentStickers: StickerItem[];
  isHydrated: boolean;
  isImporting: boolean;
  importModal: StickerImportModalState | null;

  hydrateStickers: () => Promise<void>;
  clearImportModal: () => void;
  importPackArchive: () => Promise<{ ok: boolean; message: string; pack?: StickerPack }>;
  importStickerImages: () => Promise<{ ok: boolean; message: string; pack?: StickerPack }>;
  importWhatsAppFolder: () => Promise<{ ok: boolean; message: string; pack?: StickerPack }>;
  importFromExternalUri: (uri: string) => Promise<{ ok: boolean; message: string; pack?: StickerPack }>;
  importStickerIntentPayload: (
    payload: ExternalStickerIntentPayload
  ) => Promise<{ ok: boolean; message: string; pack?: StickerPack }>;
  saveStickerToCollection: (params: {
    stickerHash: string;
    stickerUri?: string | null;
    isAnimated?: boolean;
  }) => Promise<{ ok: boolean; alreadySaved?: boolean; message: string; pack?: StickerPack }>;
  deletePack: (packId: string) => Promise<void>;
  recordRecentSticker: (sticker: StickerItem) => Promise<void>;
}

let hydratePromise: Promise<void> | null = null;

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
  importModal: null,

  clearImportModal: () => set({ importModal: null }),

  hydrateStickers: async () => {
    if (get().isHydrated) return;
    if (!hydratePromise) {
      hydratePromise = Promise.all([loadStickerPacks(), loadRecentStickers()])
        .then(([packs, recentStickers]) => {
          set({ packs, recentStickers, isHydrated: true });
        })
        .catch(() => {
          set({ isHydrated: true });
        })
        .finally(() => {
          hydratePromise = null;
        });
    }
    return hydratePromise;
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
    set({
      isImporting: true,
      importModal: { status: 'importing', packName: 'Sticker Pack' },
    });
    try {
      await get().hydrateStickers();
      const startedAt = Date.now();
      const { pack } = await importStickerFromUri(uri, get().packs);
      const nextPacks = upsertPack(get().packs, pack);
      await saveStickerPacks(nextPacks);
      const minAnim = Math.max(0, 420 - (Date.now() - startedAt));
      if (minAnim > 0) await new Promise<void>((r) => setTimeout(r, minAnim));
      set({
        packs: nextPacks,
        isImporting: false,
        importModal: {
          status: 'success',
          packName: pack.name,
          message: `${pack.stickers.length} stickers added to Chatter`,
          pack,
        },
      });
      return {
        ok: true,
        message: `Installed "${pack.name}" (${pack.stickers.length} stickers)`,
        pack,
      };
    } catch (error: any) {
      const msg = error?.message || 'Failed to open sticker pack';
      set({
        isImporting: false,
        importModal: {
          status: 'error',
          packName: 'Sticker Pack',
          message: msg,
        },
      });
      return {
        ok: false,
        message: msg,
      };
    }
  },

  importStickerIntentPayload: async (payload: ExternalStickerIntentPayload) => {
    if (payload.type === 'started') {
      set({
        isImporting: true,
        importModal: {
          status: 'importing',
          packName: payload.packName || 'Sticker Pack',
        },
      });
      return { ok: true, message: 'importing' };
    }

    if (payload.type === 'error') {
      const msg = payload.message || 'Could not import stickers from that app.';
      set({
        isImporting: false,
        importModal: {
          status: 'error',
          packName: payload.packName || 'Sticker Pack',
          message: msg,
        },
      });
      return { ok: false, message: msg };
    }

    const uris = Array.isArray(payload.paths) ? payload.paths.filter(Boolean) : [];
    if (uris.length === 0) {
      const msg = 'No sticker files were received from the external app.';
      set({
        isImporting: false,
        importModal: {
          status: 'error',
          packName: payload.packName || 'Sticker Pack',
          message: msg,
        },
      });
      return { ok: false, message: msg };
    }

    set({
      isImporting: true,
      importModal: {
        status: 'importing',
        packName: payload.packName || 'Sticker Pack',
      },
    });
    try {
      await get().hydrateStickers();
      const startedAt = Date.now();
      const { pack } = await importStickerBatchFromPaths(uris, get().packs, {
        packName: payload.packName,
        author: payload.author,
        trayUri: payload.trayPath,
        createDedicatedPack: payload.type === 'wa_pack' || uris.length > 1,
      });
      const nextPacks = upsertPack(get().packs, pack);
      await saveStickerPacks(nextPacks);

      // Give the adding popup animation a clean readable beat before revealing success
      const minAnim = Math.max(0, 480 - (Date.now() - startedAt));
      if (minAnim > 0) {
        await new Promise<void>((r) => setTimeout(r, minAnim));
      }

      const successMsg = `${pack.stickers.length} stickers added to Chatter`;
      set({
        packs: nextPacks,
        isImporting: false,
        importModal: {
          status: 'success',
          packName: pack.name,
          message: successMsg,
          pack,
        },
      });
      return {
        ok: true,
        message: `Installed "${pack.name}" (${pack.stickers.length} stickers)`,
        pack,
      };
    } catch (error: any) {
      const errMsg = error?.message || 'Failed to import stickers.';
      set({
        isImporting: false,
        importModal: {
          status: 'error',
          packName: payload.packName || 'Sticker Pack',
          message: errMsg,
        },
      });
      return { ok: false, message: errMsg };
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
