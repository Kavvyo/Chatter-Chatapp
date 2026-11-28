import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const PRIVACY_KEY = 'chatter_privacy_settings_v1';

interface PrivacyState {
  protectScreenshots: boolean;
  isLoaded: boolean;
  loadPrivacy: () => Promise<void>;
  setProtectScreenshots: (enabled: boolean) => Promise<void>;
}

export const usePrivacyStore = create<PrivacyState>((set, get) => ({
  protectScreenshots: true,
  isLoaded: false,

  loadPrivacy: async () => {
    if (get().isLoaded) return;
    try {
      const raw = await AsyncStorage.getItem(PRIVACY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { protectScreenshots?: boolean };
        if (typeof parsed.protectScreenshots === 'boolean') {
          set({ protectScreenshots: parsed.protectScreenshots, isLoaded: true });
          return;
        }
      }
    } catch {
      // Fall back safely to default protection enabled
    }
    set({ isLoaded: true });
  },

  setProtectScreenshots: async (enabled: boolean) => {
    set({ protectScreenshots: enabled, isLoaded: true });
    try {
      await AsyncStorage.setItem(
        PRIVACY_KEY,
        JSON.stringify({ protectScreenshots: enabled })
      );
    } catch {
      // Ignore storage write error
    }
  },
}));
