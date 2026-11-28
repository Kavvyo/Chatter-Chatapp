import { create } from "zustand";
import {
  copyStickerIntoSavedPack,
  importArchiveAsStickerPack,
  importImageFilesAsStickerPack,
  loadRecentStickers,
  loadStickerPacks,
  removeStickerPack,
  SAVED_PACK_ID,
  saveRecentStickers,
} from "../lib/stickers.js";

export const useStickerStore = create((set, get) => ({
  packs: [],
  recentStickers: [],
  isHydrated: false,
  isImporting: false,

  hydrateStickers: async () => {
    if (get().isHydrated) return;
    try {
      const [packs, recentStickers] = await Promise.all([
        loadStickerPacks(),
        loadRecentStickers(),
      ]);
      set({ packs, recentStickers, isHydrated: true });
    } catch {
      set({ isHydrated: true });
    }
  },

  importFiles: async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return { ok: false, message: "No files selected" };

    set({ isImporting: true });
    try {
      const archives = files.filter((f) => /\.(wastickers|zip)$/i.test(f.name || ""));
      const images = files.filter((f) => !/\.(wastickers|zip)$/i.test(f.name || ""));
      let lastPack = null;

      for (const archive of archives) {
        lastPack = await importArchiveAsStickerPack(archive);
      }

      if (images.length > 0) {
        const defaultName =
          files.length === 1
            ? (files[0].name || "Sticker").replace(/\.[^.]+$/, "")
            : "WhatsApp Stickers";
        lastPack = await importImageFilesAsStickerPack(images, defaultName || "WhatsApp Stickers");
      }

      const packs = await loadStickerPacks();
      set({ packs, isHydrated: true });

      return {
        ok: true,
        pack: lastPack,
        message:
          archives.length > 1
            ? `Imported ${archives.length} sticker packs`
            : `Imported "${lastPack?.name || "Sticker Pack"}"`,
      };
    } catch (error) {
      return {
        ok: false,
        message: error?.message || "Failed to import stickers",
      };
    } finally {
      set({ isImporting: false });
    }
  },

  recordRecentSticker: async (sticker) => {
    if (!sticker?.stickerHash) return;
    const prev = get().recentStickers;
    const next = [
      sticker,
      ...prev.filter((item) => item.stickerHash !== sticker.stickerHash),
    ].slice(0, 24);
    set({ recentStickers: next });
    await saveRecentStickers(next);
  },

  deletePack: async (packId) => {
    await removeStickerPack(packId);
    const packs = await loadStickerPacks();
    set({ packs });
  },

  saveStickerToCollection: async ({ stickerHash, stickerUri, isAnimated }) => {
    try {
      await get().hydrateStickers();
      const existingPacks = get().packs;
      const alreadySaved = existingPacks.some((p) =>
        (p.stickers || []).some((s) => s.stickerHash === stickerHash)
      );
      if (alreadySaved) {
        return {
          ok: true,
          alreadySaved: true,
          message: "Already saved in your Chatter stickers",
        };
      }

      const existingSavedPack =
        existingPacks.find((p) => p.id === SAVED_PACK_ID) || null;
      const pack = await copyStickerIntoSavedPack({
        stickerHash,
        stickerUri,
        isAnimated,
        existingSavedPack,
      });
      const packs = await loadStickerPacks();
      set({ packs });
      return {
        ok: true,
        alreadySaved: false,
        pack,
        message: "Saved to Chatter stickers",
      };
    } catch (error) {
      return {
        ok: false,
        message: error?.message || "Could not save sticker",
      };
    }
  },
}));
