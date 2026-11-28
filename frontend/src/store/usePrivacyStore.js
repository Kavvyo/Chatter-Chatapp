import { create } from "zustand";

const STORAGE_KEY = "chatter_privacy_settings_v1";

function loadInitialScreenshotSetting() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.protectScreenshots === "boolean") {
        return parsed.protectScreenshots;
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return true;
}

export const usePrivacyStore = create((set) => ({
  protectScreenshots: loadInitialScreenshotSetting(),

  setProtectScreenshots: (enabled) => {
    const value = Boolean(enabled);
    set({ protectScreenshots: value });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ protectScreenshots: value }));
    } catch {
      // Ignore storage write errors
    }
  },
}));
