import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface AlertConfig {
  title: string;
  message?: string;
  buttons?: AlertButton[];
}

interface ToastState {
  toast: { message: string; type: ToastType } | null;
  alertConfig: AlertConfig | null;

  showToast: (message: string, type?: ToastType) => void;
  hideToast: () => void;

  showAlert: (title: string, message?: string, buttons?: AlertButton[]) => void;
  hideAlert: () => void;
}

let toastTimer: any = null;

export const useToastStore = create<ToastState>((set) => ({
  toast: null,
  alertConfig: null,

  showToast: (message: string, type: ToastType = 'info') => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: { message, type } });
    const durationMs = type === 'error' ? 5200 : 3200;
    toastTimer = setTimeout(() => {
      set({ toast: null });
    }, durationMs);
  },

  hideToast: () => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: null });
  },

  showAlert: (title: string, message?: string, buttons?: AlertButton[]) => {
    set({
      alertConfig: {
        title,
        message,
        buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK', style: 'default' }],
      },
    });
  },

  hideAlert: () => {
    set({ alertConfig: null });
  },
}));
