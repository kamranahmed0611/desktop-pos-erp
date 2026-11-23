import { create } from 'zustand';

export type AlertType = 'success' | 'error' | 'warning' | 'info';

export interface DialogState {
  isOpen: boolean;
  type: 'alert' | 'confirm' | 'prompt';
  alertType: AlertType;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  defaultValue?: string;
  placeholder?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  onPromptSubmit?: (value: string) => void;
}

interface UIStoreState {
  dialog: DialogState;
  showAlert: (title: string, message: string, alertType?: AlertType) => Promise<void>;
  showConfirm: (title: string, message: string, options?: { confirmText?: string; cancelText?: string; alertType?: AlertType }) => Promise<boolean>;
  showPrompt: (title: string, message: string, options?: { defaultValue?: string; placeholder?: string; confirmText?: string; cancelText?: string; alertType?: AlertType }) => Promise<string | null>;
  closeDialog: () => void;
}

const DEFAULT_DIALOG: DialogState = {
  isOpen: false,
  type: 'alert',
  alertType: 'info',
  title: '',
  message: '',
  confirmText: 'OK',
  cancelText: 'Cancel'
};

export const useUIStore = create<UIStoreState>((set) => ({
  dialog: DEFAULT_DIALOG,

  showAlert: (title, message, alertType = 'info') => {
    return new Promise<void>((resolve) => {
      set({
        dialog: {
          isOpen: true,
          type: 'alert',
          alertType,
          title,
          message,
          confirmText: 'Understood',
          cancelText: '',
          onConfirm: () => {
            set({ dialog: DEFAULT_DIALOG });
            resolve();
          }
        }
      });
    });
  },

  showConfirm: (title, message, options = {}) => {
    return new Promise<boolean>((resolve) => {
      set({
        dialog: {
          isOpen: true,
          type: 'confirm',
          alertType: options.alertType || 'warning',
          title,
          message,
          confirmText: options.confirmText || 'Yes, Proceed',
          cancelText: options.cancelText || 'Cancel',
          onConfirm: () => {
            set({ dialog: DEFAULT_DIALOG });
            resolve(true);
          },
          onCancel: () => {
            set({ dialog: DEFAULT_DIALOG });
            resolve(false);
          }
        }
      });
    });
  },

  showPrompt: (title, message, options = {}) => {
    return new Promise<string | null>((resolve) => {
      set({
        dialog: {
          isOpen: true,
          type: 'prompt',
          alertType: options.alertType || 'info',
          title,
          message,
          defaultValue: options.defaultValue || '',
          placeholder: options.placeholder || '',
          confirmText: options.confirmText || 'Submit',
          cancelText: options.cancelText || 'Cancel',
          onPromptSubmit: (val: string) => {
            set({ dialog: DEFAULT_DIALOG });
            resolve(val);
          },
          onCancel: () => {
            set({ dialog: DEFAULT_DIALOG });
            resolve(null);
          }
        }
      });
    });
  },

  closeDialog: () => set({ dialog: DEFAULT_DIALOG })
}));

// Global convenient helpers
export const posAlert = (title: string, message: string, type: AlertType = 'info') => {
  return useUIStore.getState().showAlert(title, message, type);
};

export const posConfirm = (title: string, message: string, options?: { confirmText?: string; cancelText?: string; alertType?: AlertType }) => {
  return useUIStore.getState().showConfirm(title, message, options);
};

export const posPrompt = (
  title: string,
  message: string,
  options?: { defaultValue?: string; placeholder?: string; confirmText?: string; cancelText?: string; alertType?: AlertType }
) => {
  return useUIStore.getState().showPrompt(title, message, options);
};
