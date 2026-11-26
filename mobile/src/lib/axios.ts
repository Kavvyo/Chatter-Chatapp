import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { API_URL } from './config';

export const axiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 15000,
});

let storedCookie: string | null = null;

const isNodeSSR = Platform.OS === 'web' && typeof window === 'undefined';

const safeGetStorage = async (key: string): Promise<string | null> => {
  if (isNodeSSR) return null;
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSetStorage = async (key: string, value: string): Promise<void> => {
  if (isNodeSSR) return;
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // ignore
  }
};

const safeRemoveStorage = async (key: string): Promise<void> => {
  if (isNodeSSR) return;
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore
  }
};

// Request interceptor: attach Cookie header
axiosInstance.interceptors.request.use(
  async (config) => {
    if (!storedCookie) {
      storedCookie = await safeGetStorage('auth_cookie');
    }
    if (storedCookie) {
      config.headers['Cookie'] = storedCookie;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: save Set-Cookie header
axiosInstance.interceptors.response.use(
  async (response) => {
    const setCookie = response.headers['set-cookie'];
    if (setCookie) {
      const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
      storedCookie = cookieStr;
      await safeSetStorage('auth_cookie', cookieStr);
    }
    return response;
  },
  (error) => Promise.reject(error)
);

export const clearAuthCookie = async () => {
  storedCookie = null;
  await safeRemoveStorage('auth_cookie');
};

export const hasStoredAuthCookie = async (): Promise<boolean> => {
  if (Platform.OS === 'web') return true;
  if (!storedCookie) {
    storedCookie = await safeGetStorage('auth_cookie');
  }
  return Boolean(storedCookie);
};
