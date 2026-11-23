const { contextBridge, ipcRenderer } = require('electron');

try {
  if (process.contextIsolated) {
    contextBridge.exposeInMainWorld('electronAPI', {
      isElectron: true,
      verifyPin: (params) => ipcRenderer.invoke('verify-pin', params),
      consumeAuthToken: (params) => ipcRenderer.invoke('consume-auth-token', params),
      forceCloseTerminal: (params) => ipcRenderer.invoke('force-close-terminal', params),
      openAdminWindow: (params) => ipcRenderer.invoke('open-admin-window', params),
      focusOrOpenAdminWindow: () => ipcRenderer.invoke('focus-or-open-admin-window'),
      isAdminWindowOpen: () => ipcRenderer.invoke('is-admin-window-open'),
      focusOrOpenCashierWindow: () => ipcRenderer.invoke('focus-or-open-cashier-window'),
      checkOpenShift: () => ipcRenderer.invoke('check-open-shift'),
      broadcastChange: (eventName, payload) => ipcRenderer.send('broadcast-change', { eventName, payload }),
      onBroadcast: (channel, callback) => {
        const listener = (_event, ...args) => callback(...args);
        ipcRenderer.on(channel, listener);
        return () => ipcRenderer.removeListener(channel, listener);
      },
      onCannotClose: (callback) => {
        const listener = (_event, data) => callback(data);
        ipcRenderer.on('shift:cannot-close', listener);
        return () => ipcRenderer.removeListener('shift:cannot-close', listener);
      },
      onRequestForceClose: (callback) => {
        const listener = (_event, data) => callback(data);
        ipcRenderer.on('request-admin-force-close', listener);
        return () => ipcRenderer.removeListener('request-admin-force-close', listener);
      },
      printReceipt: (options) => ipcRenderer.invoke('print-receipt', options),
      printSticker: (options) => ipcRenderer.invoke('print-sticker', options),
      generateInvoicePdf: (params) => ipcRenderer.invoke('generate-invoice-pdf', params),
      openWhatsApp: (params) => ipcRenderer.invoke('whatsapp:open', params),
      openPath: (path) => ipcRenderer.invoke('shell:open-path', path),
      openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
      showItemInFolder: (path) => ipcRenderer.invoke('shell:show-item-in-folder', path),
      getPrinters: () => ipcRenderer.invoke('get-printers'),
      quitApp: () => ipcRenderer.invoke('quit-app'),
      // Direct Native SQLite IPC Handlers
      dbQuery: (params) => ipcRenderer.invoke('db:query', params),
      dbGet: (params) => ipcRenderer.invoke('db:get', params),
      dbExecute: (params) => ipcRenderer.invoke('db:execute', params),
      dbTransaction: (params) => ipcRenderer.invoke('db:transaction', params),
      dbBackup: (params) => ipcRenderer.invoke('db:backup', params),
      dbVacuum: () => ipcRenderer.invoke('db:vacuum'),
      dbInfo: () => ipcRenderer.invoke('db:info'),
      dbExportUsb: () => ipcRenderer.invoke('db:export-usb'),
      dbSelectRestoreFile: () => ipcRenderer.invoke('db:select-restore-file'),
      dbExecuteRestore: (params) => ipcRenderer.invoke('db:execute-restore', params),
      onNavigateStation: (callback) => {
        const listener = (_event, mode) => callback(mode);
        ipcRenderer.on('navigate-station', listener);
        return () => ipcRenderer.removeListener('navigate-station', listener);
      },

      // Admin PIN & Security
      getAdminStatus: () => ipcRenderer.invoke('auth:get-admin-status'),
      setupAdminPin: (params) => ipcRenderer.invoke('auth:setup-admin-pin', params),
      verifyAdminPin: (params) => ipcRenderer.invoke('auth:verify-admin-pin', params),
      changeAdminPin: (params) => ipcRenderer.invoke('auth:change-admin-pin', params),
    });
  } else {
    window.electronAPI = {
      isElectron: true,
      verifyPin: (params) => ipcRenderer.invoke('verify-pin', params),
      consumeAuthToken: (params) => ipcRenderer.invoke('consume-auth-token', params),
      forceCloseTerminal: (params) => ipcRenderer.invoke('force-close-terminal', params),
      openAdminWindow: (params) => ipcRenderer.invoke('open-admin-window', params),
      focusOrOpenAdminWindow: () => ipcRenderer.invoke('focus-or-open-admin-window'),
      isAdminWindowOpen: () => ipcRenderer.invoke('is-admin-window-open'),
      focusOrOpenCashierWindow: () => ipcRenderer.invoke('focus-or-open-cashier-window'),
      checkOpenShift: () => ipcRenderer.invoke('check-open-shift'),
      broadcastChange: (eventName, payload) => ipcRenderer.send('broadcast-change', { eventName, payload }),
      onBroadcast: (channel, callback) => {
        const listener = (_event, ...args) => callback(...args);
        ipcRenderer.on(channel, listener);
        return () => ipcRenderer.removeListener(channel, listener);
      },
      onCannotClose: (callback) => {
        const listener = (_event, data) => callback(data);
        ipcRenderer.on('shift:cannot-close', listener);
        return () => ipcRenderer.removeListener('shift:cannot-close', listener);
      },
      onRequestForceClose: (callback) => {
        const listener = (_event, data) => callback(data);
        ipcRenderer.on('request-admin-force-close', listener);
        return () => ipcRenderer.removeListener('request-admin-force-close', listener);
      },
      printReceipt: (options) => ipcRenderer.invoke('print-receipt', options),
      printSticker: (options) => ipcRenderer.invoke('print-sticker', options),
      generateInvoicePdf: (params) => ipcRenderer.invoke('generate-invoice-pdf', params),
      openWhatsApp: (params) => ipcRenderer.invoke('whatsapp:open', params),
      openPath: (path) => ipcRenderer.invoke('shell:open-path', path),
      openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
      showItemInFolder: (path) => ipcRenderer.invoke('shell:show-item-in-folder', path),
      getPrinters: () => ipcRenderer.invoke('get-printers'),
      quitApp: () => ipcRenderer.invoke('quit-app'),
      onNavigateStation: (callback) => {
        const listener = (_event, mode) => callback(mode);
        ipcRenderer.on('navigate-station', listener);
        return () => ipcRenderer.removeListener('navigate-station', listener);
      },

      // Direct Native SQLite IPC Handlers
      dbQuery: (params) => ipcRenderer.invoke('db:query', params),
      dbGet: (params) => ipcRenderer.invoke('db:get', params),
      dbExecute: (params) => ipcRenderer.invoke('db:execute', params),
      dbTransaction: (params) => ipcRenderer.invoke('db:transaction', params),
      dbBackup: (params) => ipcRenderer.invoke('db:backup', params),
      dbVacuum: () => ipcRenderer.invoke('db:vacuum'),
      dbInfo: () => ipcRenderer.invoke('db:info'),
      dbExportUsb: () => ipcRenderer.invoke('db:export-usb'),
      dbSelectRestoreFile: () => ipcRenderer.invoke('db:select-restore-file'),
      dbExecuteRestore: (params) => ipcRenderer.invoke('db:execute-restore', params),

      // Admin PIN & Security
      getAdminStatus: () => ipcRenderer.invoke('auth:get-admin-status'),
      setupAdminPin: (params) => ipcRenderer.invoke('auth:setup-admin-pin', params),
      verifyAdminPin: (params) => ipcRenderer.invoke('auth:verify-admin-pin', params),
      changeAdminPin: (params) => ipcRenderer.invoke('auth:change-admin-pin', params),
    };
  }
} catch (e) {
  console.warn('[Preload] Notice during API exposure:', e.message);
}
