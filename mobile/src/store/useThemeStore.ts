import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { THEMES, DEFAULT_THEME, ThemeColors } from '../constants/themes';

interface ThemeState {
  themeName: string;
  theme: ThemeColors;
  setTheme: (themeName: string) => Promise<void>;
  loadTheme: () => Promise<void>;
}

const isNodeSSR = Platform.OS === 'web' && typeof window === 'undefined';

export const useThemeStore = create<ThemeState>((set) => ({
  themeName: DEFAULT_THEME,
  theme: THEMES[DEFAULT_THEME],

  setTheme: async (themeName: string) => {
    const selected = THEMES[themeName] || THEMES[DEFAULT_THEME];
    if (!isNodeSSR) {
      try {
        await AsyncStorage.setItem('chat-theme', themeName);
      } catch {
        // ignore
      }
    }
    set({ themeName, theme: selected });
  },

  loadTheme: async () => {
    if (isNodeSSR) return;
    try {
      const saved = await AsyncStorage.getItem('chat-theme');
      if (saved && THEMES[saved]) {
        set({ themeName: saved, theme: THEMES[saved] });
      }
    } catch {
      // ignore
    }
  },
}));
