import { unzipSync, strFromU8 } from "fflate";

const DB_NAME = "chatter_stickers_db";
const DB_VERSION = 1;
const STORE_PACKS = "packs";
const STORE_FILES = "files";
const STORE_MESSAGES = "messages";
const STORE_META = "meta";
export const SAVED_PACK_ID = "chatter_saved_stickers";

const objectUrlCache = new Map();

let dbPromise = null;

function openStickerDb() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not supported in this browser"));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_PACKS)) {
        db.createObjectStore(STORE_PACKS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        db.createObjectStore(STORE_FILES, { keyPath: "stickerHash" });
      }
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        const msgStore = db.createObjectStore(STORE_MESSAGES, { keyPath: "key" });
        msgStore.createIndex("by_chatKey", "chatKey", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error("Failed to open sticker database"));
    };
  });

  return dbPromise;
}

function idbRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbTxComplete(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function uint8ArrayToBase64(bytes) {
  const chunkSize = 0x8000;
  const parts = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    parts.push(String.fromCharCode(...slice));
  }
  return btoa(parts.join(""));
}

export function base64ToUint8Array(base64) {
  const clean = (base64 || "").replace(/^data:[^;]+;base64,/, "").trim();
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Deterministic 64-bit FNV-1a content hash so identical stickers deduplicate across packs and P2P sessions.
 */
export function computeStickerHash(bytes) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    h1 ^= b;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= b ^ (i & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const partA = (h1 >>> 0).toString(16).padStart(8, "0");
  const partB = (h2 >>> 0).toString(16).padStart(8, "0");
  const sizePart = bytes.length.toString(16).padStart(6, "0");
  return `stk_${partA}${partB}_${sizePart}`;
}

export function detectStickerMime(bytes) {
  if (bytes.length >= 12) {
    const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (riff === "RIFF" && webp === "WEBP") return "image/webp";
  }
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length >= 4 && String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === "GIF8") {
    return "image/gif";
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "image/jpeg";
  }
  return "image/webp";
}

export function isAnimatedStickerBytes(bytes) {
  if (bytes.length < 21) return false;
  const mime = detectStickerMime(bytes);
  if (mime === "image/gif") return true;
  if (mime !== "image/webp") return false;

  const vp8x = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (vp8x === "VP8X" && (bytes[20] & 0x02) !== 0) {
    return true;
  }
  // Scan chunk header window for ANIM chunk
  const limit = Math.min(bytes.length - 4, 256);
  for (let i = 12; i < limit; i += 1) {
    if (bytes[i] === 0x41 && bytes[i + 1] === 0x4e && bytes[i + 2] === 0x49 && bytes[i + 3] === 0x4d) {
      return true;
    }
  }
  return false;
}

export function getCachedStickerUrlSync(stickerHash) {
  return stickerHash ? objectUrlCache.get(stickerHash) || null : null;
}

function createAndCacheObjectUrl(stickerHash, bufferOrBytes, mime) {
  const existing = objectUrlCache.get(stickerHash);
  if (existing) return existing;
  const blob = new Blob([bufferOrBytes], { type: mime || "image/webp" });
  const url = URL.createObjectURL(blob);
  objectUrlCache.set(stickerHash, url);
  return url;
}

export async function saveStickerBytesToDb(stickerHash, bytes, mime, isAnimated) {
  const resolvedMime = mime || detectStickerMime(bytes);
  const resolvedAnimated =
    typeof isAnimated === "boolean" ? isAnimated : isAnimatedStickerBytes(bytes);

  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const db = await openStickerDb();
  const tx = db.transaction(STORE_FILES, "readwrite");
  tx.objectStore(STORE_FILES).put({
    stickerHash,
    data: arrayBuffer,
    mime: resolvedMime,
    isAnimated: resolvedAnimated,
    updatedAt: Date.now(),
  });
  await idbTxComplete(tx);

  const uri = createAndCacheObjectUrl(stickerHash, arrayBuffer, resolvedMime);
  return { stickerHash, uri, mime: resolvedMime, isAnimated: resolvedAnimated };
}

export async function resolveLocalStickerUri(stickerHash) {
  if (!stickerHash) return null;
  const cached = objectUrlCache.get(stickerHash);
  if (cached) return cached;

  try {
    const db = await openStickerDb();
    const tx = db.transaction(STORE_FILES, "readonly");
    const record = await idbRequest(tx.objectStore(STORE_FILES).get(stickerHash));
    if (!record?.data) return null;
    return createAndCacheObjectUrl(stickerHash, record.data, record.mime || "image/webp");
  } catch {
    return null;
  }
}

export async function saveReceivedSticker({ stickerHash, dataBase64, isAnimated }) {
  if (!stickerHash || !dataBase64) return null;
  const bytes = base64ToUint8Array(dataBase64);
  if (!bytes.length) return null;
  return saveStickerBytesToDb(stickerHash, bytes, detectStickerMime(bytes), isAnimated);
}

export async function readStickerBase64(stickerHash) {
  if (!stickerHash) return null;
  try {
    const db = await openStickerDb();
    const tx = db.transaction(STORE_FILES, "readonly");
    const record = await idbRequest(tx.objectStore(STORE_FILES).get(stickerHash));
    if (!record?.data) return null;
    return uint8ArrayToBase64(new Uint8Array(record.data));
  } catch {
    return null;
  }
}

export async function loadStickerPacks() {
  try {
    const db = await openStickerDb();
    const tx = db.transaction(STORE_PACKS, "readonly");
    const packs = (await idbRequest(tx.objectStore(STORE_PACKS).getAll())) || [];
    packs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // Hydrate ObjectURLs for every pack sticker and tray icon
    for (const pack of packs) {
      if (pack.trayStickerHash) {
        pack.trayUri = await resolveLocalStickerUri(pack.trayStickerHash);
      }
      if (Array.isArray(pack.stickers)) {
        for (const item of pack.stickers) {
          item.uri = (await resolveLocalStickerUri(item.stickerHash)) || item.uri || null;
        }
      }
    }
    return packs;
  } catch {
    return [];
  }
}

export async function saveStickerPack(pack) {
  const db = await openStickerDb();
  const serializable = {
    ...pack,
    trayUri: undefined,
    stickers: (pack.stickers || []).map((s) => ({
      id: s.id,
      stickerHash: s.stickerHash,
      mime: s.mime,
      isAnimated: s.isAnimated,
      emojis: s.emojis || [],
    })),
  };
  const tx = db.transaction(STORE_PACKS, "readwrite");
  tx.objectStore(STORE_PACKS).put(serializable);
  await idbTxComplete(tx);
  return loadStickerPacks();
}

export async function removeStickerPack(packId) {
  const db = await openStickerDb();
  const tx = db.transaction(STORE_PACKS, "readwrite");
  tx.objectStore(STORE_PACKS).delete(packId);
  await idbTxComplete(tx);
}

export async function loadRecentStickers() {
  try {
    const db = await openStickerDb();
    const tx = db.transaction(STORE_META, "readonly");
    const record = await idbRequest(tx.objectStore(STORE_META).get("recent_stickers"));
    const items = Array.isArray(record?.value) ? record.value : [];
    const hydrated = [];
    for (const item of items) {
      const uri = await resolveLocalStickerUri(item.stickerHash);
      if (uri) {
        hydrated.push({ ...item, uri });
      }
    }
    return hydrated;
  } catch {
    return [];
  }
}

export async function saveRecentStickers(items) {
  try {
    const db = await openStickerDb();
    const tx = db.transaction(STORE_META, "readwrite");
    const clean = (items || []).slice(0, 24).map((s) => ({
      id: s.id || s.stickerHash,
      stickerHash: s.stickerHash,
      mime: s.mime || "image/webp",
      isAnimated: Boolean(s.isAnimated),
      emojis: s.emojis || [],
    }));
    tx.objectStore(STORE_META).put({ key: "recent_stickers", value: clean });
    await idbTxComplete(tx);
  } catch {
    // Non-critical recent list
  }
}

const VALID_IMAGE_RE = /\.(webp|png|gif|jpe?g)$/i;

export async function importArchiveAsStickerPack(file) {
  const arrayBuffer = await file.arrayBuffer();
  const entries = unzipSync(new Uint8Array(arrayBuffer));
  const names = Object.keys(entries).sort();

  let packName = file.name.replace(/\.(wastickers|zip)$/i, "").replace(/[_-]+/g, " ").trim() || "Sticker Pack";
  let author = "Imported Pack";
  let trayEntryName = null;
  const imageEntries = [];

  for (const name of names) {
    if (!name || name.startsWith("__MACOSX/") || name.endsWith("/")) continue;
    const base = name.split("/").pop() || "";
    if (!base || base.startsWith(".")) continue;
    const lower = base.toLowerCase();

    if (lower === "title.txt") {
      const text = strFromU8(entries[name]).trim();
      if (text) packName = text;
      continue;
    }
    if (lower === "author.txt") {
      const text = strFromU8(entries[name]).trim();
      if (text) author = text;
      continue;
    }
    if (lower === "contents.json" || lower === "pack.json") {
      try {
        const meta = JSON.parse(strFromU8(entries[name]));
        if (typeof meta?.name === "string" && meta.name.trim()) packName = meta.name.trim();
        if (typeof meta?.publisher === "string" && meta.publisher.trim()) author = meta.publisher.trim();
        if (typeof meta?.author === "string" && meta.author.trim()) author = meta.author.trim();
      } catch {
        // Ignore malformed metadata JSON
      }
      continue;
    }
    if (VALID_IMAGE_RE.test(lower)) {
      if (lower.startsWith("tray")) {
        trayEntryName = name;
      } else {
        imageEntries.push(name);
      }
    }
  }

  if (imageEntries.length === 0 && trayEntryName) {
    imageEntries.push(trayEntryName);
  }

  if (imageEntries.length === 0) {
    throw new Error("No sticker images (.webp / .png) found inside archive");
  }

  const seenHashes = new Set();
  const stickers = [];
  for (const entryName of imageEntries) {
    if (stickers.length >= 60) break;
    const bytes = entries[entryName];
    if (!bytes || bytes.length === 0 || bytes.length > 1.8 * 1024 * 1024) continue;
    const hash = computeStickerHash(bytes);
    if (seenHashes.has(hash)) continue;
    seenHashes.add(hash);

    const saved = await saveStickerBytesToDb(hash, bytes);
    stickers.push({
      id: hash,
      stickerHash: hash,
      mime: saved.mime,
      isAnimated: saved.isAnimated,
      uri: saved.uri,
      emojis: [],
    });
  }

  if (stickers.length === 0) {
    throw new Error("Archive did not contain valid sticker files");
  }

  let trayStickerHash = stickers[0].stickerHash;
  if (trayEntryName && entries[trayEntryName]?.length) {
    const trayBytes = entries[trayEntryName];
    trayStickerHash = computeStickerHash(trayBytes);
    await saveStickerBytesToDb(trayStickerHash, trayBytes);
  }

  const packId = `pack_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const pack = {
    id: packId,
    name: packName,
    author,
    trayStickerHash,
    stickers,
    createdAt: Date.now(),
  };

  await saveStickerPack(pack);
  const allPacks = await loadStickerPacks();
  return allPacks.find((p) => p.id === packId) || pack;
}

export async function importImageFilesAsStickerPack(fileList, packName = "My Stickers") {
  const files = Array.from(fileList || []).filter((f) => {
    const type = (f.type || "").toLowerCase();
    return type.startsWith("image/") || VALID_IMAGE_RE.test(f.name || "");
  });

  if (files.length === 0) {
    throw new Error("No valid .webp or .png sticker images selected");
  }

  const seenHashes = new Set();
  const stickers = [];
  for (const file of files.slice(0, 60)) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!bytes.length || bytes.length > 1.8 * 1024 * 1024) continue;
    const hash = computeStickerHash(bytes);
    if (seenHashes.has(hash)) continue;
    seenHashes.add(hash);
    const saved = await saveStickerBytesToDb(hash, bytes);
    stickers.push({
      id: hash,
      stickerHash: hash,
      mime: saved.mime,
      isAnimated: saved.isAnimated,
      uri: saved.uri,
      emojis: [],
    });
  }

  if (stickers.length === 0) {
    throw new Error("Selected files exceeded the 1.8 MB sticker size limit or were empty");
  }

  const packId = `pack_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const pack = {
    id: packId,
    name: packName,
    author: "Custom Stickers",
    trayStickerHash: stickers[0].stickerHash,
    stickers,
    createdAt: Date.now(),
  };

  await saveStickerPack(pack);
  const allPacks = await loadStickerPacks();
  return allPacks.find((p) => p.id === packId) || pack;
}

// ---------- Per-chat local P2P sticker history & outbox (zero server storage) ----------

export async function saveLocalStickerMessage(myId, peerId, msg) {
  if (!myId || !peerId || !msg?.stickerHash) return;
  try {
    const db = await openStickerDb();
    const tx = db.transaction(STORE_MESSAGES, "readwrite");
    const msgId = msg._id || msg.localId;
    tx.objectStore(STORE_MESSAGES).put({
      key: `${myId}:${peerId}:${msgId}`,
      chatKey: `${myId}:${peerId}`,
      _id: msgId,
      localId: msg.localId || msgId,
      senderId: msg.senderId,
      receiverId: msg.receiverId,
      isSticker: true,
      stickerHash: msg.stickerHash,
      isAnimated: Boolean(msg.isAnimated),
      read: Boolean(msg.read),
      createdAt: msg.createdAt,
      clientCreatedAt: msg.clientCreatedAt || new Date(msg.createdAt || Date.now()).getTime(),
      localOnly: true,
    });
    await idbTxComplete(tx);
  } catch {
    // Non-critical local persistence
  }
}

export async function getLocalStickerMessages(myId, peerId) {
  if (!myId || !peerId) return [];
  try {
    const db = await openStickerDb();
    const tx = db.transaction(STORE_MESSAGES, "readonly");
    const index = tx.objectStore(STORE_MESSAGES).index("by_chatKey");
    const records = (await idbRequest(index.getAll(`${myId}:${peerId}`))) || [];
    const hydrated = [];
    for (const rec of records) {
      const uri = await resolveLocalStickerUri(rec.stickerHash);
      hydrated.push({
        _id: rec._id,
        localId: rec.localId,
        senderId: rec.senderId,
        receiverId: rec.receiverId,
        isSticker: true,
        stickerHash: rec.stickerHash,
        stickerUri: uri,
        isAnimated: rec.isAnimated,
        read: Boolean(rec.read),
        createdAt: rec.createdAt,
        clientCreatedAt: rec.clientCreatedAt,
        localOnly: true,
      });
    }
    return hydrated;
  } catch {
    return [];
  }
}

export async function markLocalStickersRead(myId, peerId, readerSenderId) {
  if (!myId || !peerId) return;
  try {
    const db = await openStickerDb();
    const tx = db.transaction(STORE_MESSAGES, "readwrite");
    const store = tx.objectStore(STORE_MESSAGES);
    const records = (await idbRequest(store.index("by_chatKey").getAll(`${myId}:${peerId}`))) || [];
    for (const rec of records) {
      if (!rec.read && (!readerSenderId || rec.senderId === readerSenderId)) {
        store.put({ ...rec, read: true });
      }
    }
    await idbTxComplete(tx);
  } catch {
    // Ignore
  }
}

export async function clearLocalStickerMessages(myId, peerId) {
  if (!myId || !peerId) return;
  try {
    const db = await openStickerDb();
    const tx = db.transaction(STORE_MESSAGES, "readwrite");
    const store = tx.objectStore(STORE_MESSAGES);
    const keys = (await idbRequest(store.index("by_chatKey").getAllKeys(`${myId}:${peerId}`))) || [];
    for (const key of keys) {
      store.delete(key);
    }
    await idbTxComplete(tx);
  } catch {
    // Ignore
  }
}

export async function pruneLocalStickerMessagesBefore(myId, peerId, cutoffMs) {
  if (!myId || !peerId) return;
  if (!cutoffMs || Number.isNaN(cutoffMs)) {
    return clearLocalStickerMessages(myId, peerId);
  }
  try {
    const db = await openStickerDb();
    const tx = db.transaction(STORE_MESSAGES, "readwrite");
    const store = tx.objectStore(STORE_MESSAGES);
    const records = (await idbRequest(store.index("by_chatKey").getAll(`${myId}:${peerId}`))) || [];
    for (const rec of records) {
      const msgTime = rec.clientCreatedAt || new Date(rec.createdAt || 0).getTime();
      if (!Number.isNaN(msgTime) && msgTime <= cutoffMs) {
        store.delete(rec.key);
      }
    }
    await idbTxComplete(tx);
  } catch {
    // Ignore
  }
}

export async function getStickerOutbox(myId) {
  if (!myId) return [];
  try {
    const db = await openStickerDb();
    const tx = db.transaction(STORE_META, "readonly");
    const record = await idbRequest(tx.objectStore(STORE_META).get(`outbox:${myId}`));
    return Array.isArray(record?.value) ? record.value : [];
  } catch {
    return [];
  }
}

export async function setStickerOutbox(myId, items) {
  if (!myId) return;
  try {
    const db = await openStickerDb();
    const tx = db.transaction(STORE_META, "readwrite");
    tx.objectStore(STORE_META).put({ key: `outbox:${myId}`, value: items || [] });
    await idbTxComplete(tx);
  } catch {
    // Ignore
  }
}

export async function hasStickerInDb(stickerHash) {
  if (!stickerHash) return false;
  if (objectUrlCache.has(stickerHash)) return true;
  const uri = await resolveLocalStickerUri(stickerHash);
  return Boolean(uri);
}

export async function copyStickerIntoSavedPack({
  stickerHash,
  stickerUri,
  isAnimated,
  existingSavedPack,
}) {
  if (!stickerHash) throw new Error("Missing sticker identifier");

  let uri = await resolveLocalStickerUri(stickerHash);
  let mime = "image/webp";
  let animatedFlag = Boolean(isAnimated);

  if (!uri && typeof stickerUri === "string" && stickerUri.startsWith("data:")) {
    const saved = await saveReceivedSticker({
      stickerHash,
      dataBase64: stickerUri,
      isAnimated,
    });
    if (saved) {
      uri = saved.uri;
      mime = saved.mime || mime;
      animatedFlag = Boolean(saved.isAnimated);
    }
  }

  if (!uri) {
    throw new Error("Sticker file is not downloaded yet");
  }

  const item = {
    id: stickerHash,
    stickerHash,
    mime,
    isAnimated: animatedFlag,
    uri,
    emojis: [],
  };

  const existing = existingSavedPack?.stickers || [];
  const nextStickers = [
    item,
    ...existing.filter((s) => s.stickerHash !== stickerHash),
  ].slice(0, 60);

  const pack = {
    id: SAVED_PACK_ID,
    name: existingSavedPack?.name || "Saved Stickers",
    author: "Chatter",
    trayStickerHash: existingSavedPack?.trayStickerHash || stickerHash,
    stickers: nextStickers,
    createdAt: existingSavedPack?.createdAt || Date.now(),
  };

  const allPacks = await saveStickerPack(pack);
  return allPacks.find((p) => p.id === SAVED_PACK_ID) || pack;
}
