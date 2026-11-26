import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { Image as ExpoImage } from 'expo-image';

const AUTH_USER_CACHE_KEY = 'chatter_cached_auth_user';
const MAX_CACHED_MESSAGES_PER_CHAT = 80;

const isSSR = Platform.OS === 'web' && typeof window === 'undefined';

async function readJson<T>(key: string): Promise<T | null> {
  if (isSSR) return null;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  if (isSSR) return;
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota or serialization issues cleanly
  }
}

function userPrefix(userId: string): string {
  return `chatter_cache_${userId}_`;
}

export async function getCachedAuthUser<T>(): Promise<T | null> {
  return readJson<T>(AUTH_USER_CACHE_KEY);
}

export async function setCachedAuthUser(user: unknown): Promise<void> {
  await writeJson(AUTH_USER_CACHE_KEY, user);
}

export async function clearCachedAuthUser(): Promise<void> {
  if (isSSR) return;
  try {
    await AsyncStorage.removeItem(AUTH_USER_CACHE_KEY);
  } catch {
    // ignore
  }
}

export async function getCachedFriends<T>(userId: string): Promise<T[] | null> {
  return readJson<T[]>(`${userPrefix(userId)}friends`);
}

export async function setCachedFriends<T>(userId: string, friends: T[]): Promise<void> {
  await writeJson(`${userPrefix(userId)}friends`, friends);
}

export async function getCachedUsers<T>(userId: string): Promise<T[] | null> {
  return readJson<T[]>(`${userPrefix(userId)}users`);
}

export async function setCachedUsers<T>(userId: string, users: T[]): Promise<void> {
  await writeJson(`${userPrefix(userId)}users`, users);
}

export async function getCachedPendingRequests<T>(userId: string): Promise<T[] | null> {
  return readJson<T[]>(`${userPrefix(userId)}pending_reqs`);
}

export async function setCachedPendingRequests<T>(userId: string, requests: T[]): Promise<void> {
  await writeJson(`${userPrefix(userId)}pending_reqs`, requests);
}

export async function getCachedUnreadCounts(userId: string): Promise<Record<string, number> | null> {
  return readJson<Record<string, number>>(`${userPrefix(userId)}unread`);
}

export async function setCachedUnreadCounts(
  userId: string,
  counts: Record<string, number>
): Promise<void> {
  await writeJson(`${userPrefix(userId)}unread`, counts);
}

export async function getCachedMessages<T>(userId: string, peerId: string): Promise<T[] | null> {
  return readJson<T[]>(`${userPrefix(userId)}chat_${peerId}`);
}

export async function setCachedMessages<T extends { _id?: string; localId?: string; clientCreatedAt?: number }>(
  userId: string,
  peerId: string,
  messages: T[]
): Promise<void> {
  // Persist confirmed (non-optimistic) recent slice capped to keep disk reads fast
  const clean = messages
    .filter((m) => !m._id || !m._id.startsWith('temp_'))
    .slice(-MAX_CACHED_MESSAGES_PER_CHAT)
    .map(({ localId: _l, clientCreatedAt: _c, ...rest }) => rest);
  await writeJson(`${userPrefix(userId)}chat_${peerId}`, clean);
}

export async function clearUserDataCaches(userId: string): Promise<void> {
  if (isSSR) return;
  try {
    const keys = await AsyncStorage.getAllKeys();
    const prefix = userPrefix(userId);
    const matching = keys.filter((k) => k.startsWith(prefix));
    if (matching.length > 0) {
      await AsyncStorage.multiRemove(matching);
    }
  } catch {
    // ignore
  }
}

const prefetchedUrls = new Set<string>();

/**
 * Warms remote Cloudinary avatars and chat photo URLs into expo-image's
 * memory-disk cache silently in the background.
 */
export function prefetchImageUrls(urls: (string | null | undefined)[]): void {
  if (Platform.OS === 'web') return;
  const toFetch: string[] = [];

  for (const raw of urls) {
    if (!raw || typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed.startsWith('http') || prefetchedUrls.has(trimmed)) continue;
    prefetchedUrls.add(trimmed);
    toFetch.push(trimmed);
  }

  if (toFetch.length === 0) return;
  try {
    ExpoImage.prefetch(toFetch, 'memory-disk').catch(() => {});
  } catch {
    // ignore
  }
}
