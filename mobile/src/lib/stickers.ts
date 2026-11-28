import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { strFromU8, unzipSync } from 'fflate';

export interface StickerItem {
  id: string;
  stickerHash: string;
  uri: string;
  isAnimated: boolean;
  packId: string;
  ext: 'webp' | 'png';
}

export interface StickerPack {
  id: string;
  name: string;
  author: string;
  trayUri: string;
  createdAt: number;
  stickers: StickerItem[];
}

const STICKER_PACKS_KEY = 'chatter_sticker_packs_v1';
const RECENT_STICKERS_KEY = 'chatter_recent_stickers_v1';
const CUSTOM_PACK_ID = 'chatter_custom_stickers';
export const SAVED_PACK_ID = 'chatter_saved_stickers';
const MAX_STICKER_BYTES = 950_000;
const MAX_PACK_STICKERS = 60;

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_LOOKUP = new Uint8Array(256).fill(255);
for (let i = 0; i < BASE64_ALPHABET.length; i++) {
  BASE64_LOOKUP[BASE64_ALPHABET.charCodeAt(i)] = i;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let out = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const has1 = i + 1 < len;
    const has2 = i + 2 < len;
    const b1 = has1 ? bytes[i + 1] : 0;
    const b2 = has2 ? bytes[i + 2] : 0;

    out += BASE64_ALPHABET[b0 >> 2];
    out += BASE64_ALPHABET[((b0 & 3) << 4) | (b1 >> 4)];
    out += has1 ? BASE64_ALPHABET[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += has2 ? BASE64_ALPHABET[b2 & 63] : '=';
  }
  return out;
}

export function base64ToUint8Array(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  const len = clean.length;
  let padding = 0;
  if (len >= 2 && clean[len - 1] === '=') padding++;
  if (len >= 2 && clean[len - 2] === '=') padding++;

  const outLen = Math.max(0, (len * 3) / 4 - padding);
  const out = new Uint8Array(outLen);
  let ptr = 0;

  for (let i = 0; i < len; i += 4) {
    const c0 = BASE64_LOOKUP[clean.charCodeAt(i)];
    const c1 = BASE64_LOOKUP[clean.charCodeAt(i + 1)];
    const c2 = BASE64_LOOKUP[clean.charCodeAt(i + 2)];
    const c3 = BASE64_LOOKUP[clean.charCodeAt(i + 3)];

    if (c0 === 255 || c1 === 255) break;
    out[ptr++] = (c0 << 2) | (c1 >> 4);
    if (c2 !== 255 && ptr < outLen) {
      out[ptr++] = ((c1 & 15) << 4) | (c2 >> 2);
    }
    if (c3 !== 255 && ptr < outLen) {
      out[ptr++] = ((c2 & 3) << 6) | c3;
    }
  }
  return out;
}

/**
 * Computes a deterministic dual 32-bit FNV-1a + length fingerprint for deduplicating
 * P2P sticker transfers cleanly with zero native crypto dependencies.
 */
export function computeStickerHash(bytes: Uint8Array): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    h1 ^= b;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= b ^ (i & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `stk_${hex1}${hex2}_${bytes.length}`;
}

export function isAnimatedWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false;
  // RIFF....WEBP
  if (
    bytes[0] !== 0x52 ||
    bytes[1] !== 0x49 ||
    bytes[2] !== 0x46 ||
    bytes[3] !== 0x46 ||
    bytes[8] !== 0x57 ||
    bytes[9] !== 0x45 ||
    bytes[10] !== 0x42 ||
    bytes[11] !== 0x50
  ) {
    return false;
  }

  // VP8X extended header bit 1 indicates animation
  if (
    bytes[12] === 0x56 &&
    bytes[13] === 0x50 &&
    bytes[14] === 0x38 &&
    bytes[15] === 0x58 &&
    bytes.length > 20 &&
    (bytes[20] & 0x02) !== 0
  ) {
    return true;
  }

  // Fallback scan first 128 bytes for ANIM / ANMF chunks
  const limit = Math.min(bytes.length - 4, 128);
  for (let i = 12; i < limit; i++) {
    if (
      bytes[i] === 0x41 &&
      bytes[i + 1] === 0x4e &&
      bytes[i + 2] === 0x49 &&
      bytes[i + 3] === 0x4d
    ) {
      return true;
    }
  }
  return false;
}

function getDirs() {
  const root = new Directory(Paths.document, 'chatter_stickers');
  const packs = new Directory(root, 'packs');
  const received = new Directory(root, 'received');
  const sent = new Directory(root, 'sent');
  return { root, packs, received, sent };
}

function ensureStickerDirs() {
  if (Platform.OS === 'web') return;
  const { root, packs, received, sent } = getDirs();
  root.create({ intermediates: true, idempotent: true });
  packs.create({ intermediates: true, idempotent: true });
  received.create({ intermediates: true, idempotent: true });
  sent.create({ intermediates: true, idempotent: true });
}

function writeBytesToFile(file: File, bytes: Uint8Array) {
  file.create({ intermediates: true, overwrite: true });
  file.write(bytes);
}

function detectExt(bytes: Uint8Array, fileName = ''): 'webp' | 'png' | null {
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45
  ) {
    return 'webp';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png';
  }
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.webp')) return 'webp';
  if (lower.endsWith('.png')) return 'png';
  return null;
}

function isZipBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function getSafeStickerFilename(stickerHash: string, ext: 'webp' | 'png' = 'webp'): string {
  const sanitized = stickerHash.replace(/[^a-zA-Z0-9_-]/g, '');
  return `${sanitized}.${ext}`;
}

export function resolveLocalStickerUri(stickerHash: string, preferredUri?: string | null): string | null {
  if (Platform.OS === 'web') return preferredUri || null;
  if (preferredUri && preferredUri.startsWith('file://')) {
    try {
      const f = new File(preferredUri);
      if (f.exists) return f.uri;
    } catch {
      // ignore invalid path
    }
  }

  ensureStickerDirs();
  const { received, sent } = getDirs();

  for (const dir of [received, sent]) {
    for (const ext of ['webp', 'png'] as const) {
      const candidate = new File(dir, getSafeStickerFilename(stickerHash, ext));
      if (candidate.exists) {
        return candidate.uri;
      }
    }
  }
  return null;
}

export async function saveReceivedSticker(
  stickerHash: string,
  base64Data: string,
  ext: 'webp' | 'png' = 'webp'
): Promise<string | null> {
  if (Platform.OS === 'web') {
    const mime = ext === 'png' ? 'image/png' : 'image/webp';
    return `data:${mime};base64,${base64Data}`;
  }

  ensureStickerDirs();
  const existing = resolveLocalStickerUri(stickerHash);
  if (existing) return existing;

  const { received } = getDirs();
  const bytes = base64ToUint8Array(base64Data);
  const actualExt = detectExt(bytes) || ext;
  const target = new File(received, getSafeStickerFilename(stickerHash, actualExt));
  writeBytesToFile(target, bytes);
  return target.uri;
}

export async function cacheSentStickerBytes(
  stickerHash: string,
  bytes: Uint8Array,
  ext: 'webp' | 'png' = 'webp'
): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  ensureStickerDirs();
  const { sent } = getDirs();
  const target = new File(sent, getSafeStickerFilename(stickerHash, ext));
  if (!target.exists) {
    writeBytesToFile(target, bytes);
  }
  return target.uri;
}

export async function readStickerBase64(
  stickerHash: string,
  preferredUri?: string | null
): Promise<string | null> {
  const localUri = resolveLocalStickerUri(stickerHash, preferredUri);
  if (!localUri) return null;
  try {
    const file = new File(localUri);
    if (!file.exists) return null;
    // Use Expo FileSystem's native base64 decoder/encoder to avoid blocking the JS thread.
    return await file.base64();
  } catch {
    return null;
  }
}

export async function loadStickerPacks(): Promise<StickerPack[]> {
  try {
    const raw = await AsyncStorage.getItem(STICKER_PACKS_KEY);
    return raw ? (JSON.parse(raw) as StickerPack[]) : [];
  } catch {
    return [];
  }
}

export async function saveStickerPacks(packs: StickerPack[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STICKER_PACKS_KEY, JSON.stringify(packs));
  } catch {
    // ignore storage quota errors
  }
}

export async function loadRecentStickers(): Promise<StickerItem[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_STICKERS_KEY);
    return raw ? (JSON.parse(raw) as StickerItem[]) : [];
  } catch {
    return [];
  }
}

export async function saveRecentStickers(items: StickerItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(RECENT_STICKERS_KEY, JSON.stringify(items.slice(0, 24)));
  } catch {
    // ignore
  }
}

export async function installWastickersArchive(
  zipBytes: Uint8Array,
  fallbackName = 'WhatsApp Stickers'
): Promise<StickerPack> {
  if (Platform.OS === 'web') {
    throw new Error('Sticker import is only available on mobile devices');
  }

  ensureStickerDirs();
  const entries = unzipSync(zipBytes);
  const packId = `pack_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const { packs, sent } = getDirs();
  const packDir = new Directory(packs, packId);
  packDir.create({ intermediates: true, idempotent: true });

  let title = fallbackName.replace(/\.(wastickers|zip)$/i, '').trim() || 'WhatsApp Stickers';
  let author = 'WhatsApp Pack';
  let trayEntryName: string | null = null;
  let declaredStickers: string[] | null = null;

  for (const [entryPath, entryBytes] of Object.entries(entries)) {
    const baseName = entryPath.split('/').pop()?.toLowerCase() || '';
    if (!baseName || entryPath.endsWith('/')) continue;

    if (baseName === 'title.txt') {
      const parsed = strFromU8(entryBytes).trim();
      if (parsed) title = parsed;
    } else if (baseName === 'author.txt') {
      const parsed = strFromU8(entryBytes).trim();
      if (parsed) author = parsed;
    } else if (baseName === 'contents.json') {
      try {
        const meta = JSON.parse(strFromU8(entryBytes)) as {
          name?: string;
          publisher?: string;
          tray_image_file?: string;
          stickers?: Array<{ image_file?: string }>;
        };
        if (meta.name) title = meta.name;
        if (meta.publisher) author = meta.publisher;
        if (meta.tray_image_file) trayEntryName = meta.tray_image_file.toLowerCase();
        if (Array.isArray(meta.stickers)) {
          declaredStickers = meta.stickers
            .map((s) => s.image_file?.toLowerCase())
            .filter((s): s is string => Boolean(s));
        }
      } catch {
        // Ignore malformed contents.json
      }
    }
  }

  let trayUri = '';
  const stickerItems: StickerItem[] = [];
  const seenHashes = new Set<string>();

  const candidateFiles = Object.entries(entries)
    .filter(([entryPath, data]) => {
      if (entryPath.endsWith('/') || data.length === 0 || data.length > MAX_STICKER_BYTES) {
        return false;
      }
      const baseName = entryPath.split('/').pop()?.toLowerCase() || '';
      if (baseName.startsWith('.')) return false;
      return Boolean(detectExt(data, baseName));
    })
    .sort(([a], [b]) => a.localeCompare(b));

  for (const [entryPath, data] of candidateFiles) {
    const baseName = entryPath.split('/').pop()?.toLowerCase() || '';
    const ext = detectExt(data, baseName);
    if (!ext) continue;

    const isTray =
      (trayEntryName && baseName === trayEntryName) ||
      /^tray(_|\.)/i.test(baseName) ||
      baseName === 'icon.png' ||
      baseName === 'icon.webp';

    if (isTray && !trayUri) {
      const trayFile = new File(packDir, `tray.${ext}`);
      writeBytesToFile(trayFile, data);
      trayUri = trayFile.uri;
      if (trayEntryName || baseName.startsWith('tray')) {
        continue;
      }
    }

    if (declaredStickers && !declaredStickers.includes(baseName) && isTray) {
      continue;
    }

    if (stickerItems.length >= MAX_PACK_STICKERS) continue;

    const stickerHash = computeStickerHash(data);
    if (seenHashes.has(stickerHash)) continue;
    seenHashes.add(stickerHash);

    const stickerFile = new File(packDir, `${stickerHash}.${ext}`);
    writeBytesToFile(stickerFile, data);

    const sentCopy = new File(sent, getSafeStickerFilename(stickerHash, ext));
    if (!sentCopy.exists) {
      writeBytesToFile(sentCopy, data);
    }

    stickerItems.push({
      id: `${packId}_${stickerHash}`,
      stickerHash,
      uri: stickerFile.uri,
      isAnimated: ext === 'webp' && isAnimatedWebp(data),
      packId,
      ext,
    });
  }

  if (stickerItems.length === 0) {
    try {
      packDir.delete();
    } catch {
      // ignore
    }
    throw new Error('No valid .webp or .png stickers found in that archive.');
  }

  if (!trayUri) {
    trayUri = stickerItems[0].uri;
  }

  return {
    id: packId,
    name: title,
    author,
    trayUri,
    createdAt: Date.now(),
    stickers: stickerItems,
  };
}

export async function installStickerFilesIntoPack(
  files: File[],
  packName = 'Imported Stickers',
  author = 'Local Device',
  existingCustomPack?: StickerPack | null
): Promise<StickerPack> {
  if (Platform.OS === 'web') {
    throw new Error('Sticker import is only available on mobile devices');
  }

  ensureStickerDirs();
  const packId = existingCustomPack?.id || `${CUSTOM_PACK_ID}_${Date.now()}`;
  const { packs, sent } = getDirs();
  const packDir = new Directory(packs, packId);
  packDir.create({ intermediates: true, idempotent: true });

  const existingStickers = existingCustomPack?.stickers || [];
  const existingHashes = new Set(existingStickers.map((s) => s.stickerHash));
  const addedStickers: StickerItem[] = [];

  for (const file of files) {
    if (existingStickers.length + addedStickers.length >= MAX_PACK_STICKERS) break;
    try {
      const bytes = await file.bytes();
      if (bytes.length === 0 || bytes.length > MAX_STICKER_BYTES) continue;

      const ext = detectExt(bytes, file.name);
      if (!ext) continue;

      const stickerHash = computeStickerHash(bytes);
      if (existingHashes.has(stickerHash)) continue;
      existingHashes.add(stickerHash);

      const outFile = new File(packDir, `${stickerHash}.${ext}`);
      writeBytesToFile(outFile, bytes);

      const sentCopy = new File(sent, getSafeStickerFilename(stickerHash, ext));
      if (!sentCopy.exists) {
        writeBytesToFile(sentCopy, bytes);
      }

      addedStickers.push({
        id: `${packId}_${stickerHash}`,
        stickerHash,
        uri: outFile.uri,
        isAnimated: ext === 'webp' && isAnimatedWebp(bytes),
        packId,
        ext,
      });
    } catch {
      // Skip unreadable entry cleanly
    }
  }

  if (addedStickers.length === 0 && existingStickers.length === 0) {
    throw new Error('No valid .webp or .png sticker files under 950 KB were selected.');
  }

  const combined = [...addedStickers, ...existingStickers];
  return {
    id: packId,
    name: existingCustomPack?.name || packName,
    author: existingCustomPack?.author || author,
    trayUri: existingCustomPack?.trayUri || combined[0]?.uri || '',
    createdAt: existingCustomPack?.createdAt || Date.now(),
    stickers: combined,
  };
}

export async function importStickerFromUri(
  uri: string,
  existingPacks: StickerPack[]
): Promise<{ pack: StickerPack; isNewPack: boolean }> {
  const file = new File(uri);
  const bytes = await file.bytes();

  if (isZipBytes(bytes) || uri.toLowerCase().includes('.wastickers') || uri.toLowerCase().includes('.zip')) {
    const pack = await installWastickersArchive(bytes, file.name || 'WhatsApp Stickers');
    return { pack, isNewPack: true };
  }

  const ext = detectExt(bytes, file.name);
  if (!ext) {
    throw new Error('Unsupported sticker file. Pick a .wastickers, .zip, .webp, or .png file.');
  }

  const customPack = existingPacks.find((p) => p.id.startsWith(CUSTOM_PACK_ID)) || null;
  const pack = await installStickerFilesIntoPack([file], 'My Stickers', 'Imported', customPack);
  return { pack, isNewPack: !customPack };
}

export function deleteStickerPackFiles(packId: string) {
  if (Platform.OS === 'web') return;
  try {
    const { packs } = getDirs();
    const dir = new Directory(packs, packId);
    if (dir.exists) {
      dir.delete();
    }
  } catch {
    // ignore
  }
}

export async function copyStickerIntoSavedPack(
  stickerHash: string,
  preferredUri?: string | null,
  isAnimated?: boolean,
  existingSavedPack?: StickerPack | null
): Promise<StickerPack> {
  if (Platform.OS === 'web') {
    throw new Error('Saving stickers to file system is only available on mobile');
  }

  ensureStickerDirs();
  const sourceUri = resolveLocalStickerUri(stickerHash, preferredUri);
  if (!sourceUri) {
    throw new Error('Sticker file is not downloaded yet');
  }

  const srcFile = new File(sourceUri);
  const bytes = await srcFile.bytes();
  if (!bytes || bytes.length === 0) {
    throw new Error('Sticker file is empty or unreadable');
  }

  const ext = detectExt(bytes, sourceUri) || 'webp';
  const { packs, sent } = getDirs();
  const packDir = new Directory(packs, SAVED_PACK_ID);
  packDir.create({ intermediates: true, idempotent: true });

  const outFile = new File(packDir, `${stickerHash}.${ext}`);
  if (!outFile.exists) {
    writeBytesToFile(outFile, bytes);
  }

  const sentCopy = new File(sent, getSafeStickerFilename(stickerHash, ext));
  if (!sentCopy.exists) {
    writeBytesToFile(sentCopy, bytes);
  }

  const item: StickerItem = {
    id: `${SAVED_PACK_ID}_${stickerHash}`,
    stickerHash,
    uri: outFile.uri,
    isAnimated:
      typeof isAnimated === 'boolean' ? isAnimated : ext === 'webp' && isAnimatedWebp(bytes),
    packId: SAVED_PACK_ID,
    ext,
  };

  const existing = existingSavedPack?.stickers || [];
  const deduped = [item, ...existing.filter((s) => s.stickerHash !== stickerHash)];

  return {
    id: SAVED_PACK_ID,
    name: existingSavedPack?.name || 'Saved Stickers',
    author: 'Chatter',
    trayUri: existingSavedPack?.trayUri || item.uri,
    createdAt: existingSavedPack?.createdAt || Date.now(),
    stickers: deduped.slice(0, MAX_PACK_STICKERS),
  };
}
