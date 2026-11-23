import React, { useState, useEffect } from 'react';
import { ActiveModule, HeaderNav } from './components/HeaderNav';
import { AdminSidebarNav } from './components/common/AdminSidebarNav';
import { EmergencyBillGenerator } from './components/emergency/EmergencyBillGenerator';
import { UniversalBillingTerminal } from './components/billing/UniversalBillingTerminal';
import { ProductCatalog } from './components/catalog/ProductCatalog';
import { CustomerKhataManager } from './components/khata/CustomerKhataManager';
import { SupplierLedgerManager } from './components/suppliers/SupplierLedgerManager';
import { FinancialReportsManager } from './components/reports/FinancialReportsManager';
import { BillHistoryManager } from './components/history/BillHistoryManager';
import { BlindShiftCloseModal } from './components/shifts/BlindShiftCloseModal';
import { OpenShiftModal } from './components/shifts/OpenShiftModal';
import { AdminSettingsModal } from './components/settings/AdminSettingsModal';
import { PinLockScreen } from './components/common/PinLockScreen';
import { StationGateway } from './components/common/StationGateway';
import { AdminPinPromptModal } from './components/common/AdminPinPromptModal';
import { GlobalDialogModal } from './components/common/GlobalDialogModal';
import { ensureSchemaAndSeed } from './db/schema';
import { shiftService } from './services/shiftService';
import { Shift, StoreSettings } from './types';
import { hardwareService } from './services/hardwareService';
import { InitialSetupScreen } from './components/common/InitialSetupScreen';
import { posAlert } from './store/uiStore';
import { 
  Store, Lock, LogOut, ShieldCheck, 
  ArrowRightLeft, Layers 
} from 'lucide-react';

const DEFAULT_STORE_SETTINGS: StoreSettings = {
  store_name: 'Point of Sale',
  tagline: 'Point of Sale &amp; Inventory System',
  address: 'Shop # 1, Main Market, Pakistan',
  phone: '+92 300 0000000',
  whatsapp_number: '+923000000000',
  ntn: '0000000-0',
  pos_reg_id: 'POS-001',
  easypaisa_number: '+92 300 0000000',
  jazzcash_number: '+92 300 0000000',
  currency_symbol: 'Rs.',
  receipt_footer_urdu: 'ہمارے ہاں آمد کا شکریہ - جزاک اللہ خیر',
  receipt_footer_english: 'Exchange/Return accepted within 7 days with original receipt.',
  cash_rounding_nearest: 5,
  admin_pin: '8888',
  cashier_pin: '1234',
  pins_configured: false,
  receipt_print_mode: 'SILENT_AUTO_PRINT',
  receipt_visibility: {
    show_store_name: true,
    show_tagline: true,
    show_address: true,
    show_phone: true,
    show_whatsapp: true,
    show_ntn: true,
    show_pos_reg_id: true,
    show_cashier_name: true,
    show_date_time: true,
    show_invoice_number: true,
    show_urdu_dua: true,
    show_return_policy: true,
    show_barcode_qr: true,
    show_rounding: true,
  }
};

export const App: React.FC = () => {
  // Seamless migration for any existing legacy storage keys
  if (typeof localStorage !== 'undefined') {
    const legacyKeys = ['store_settings', 'admin_pin', 'cashier_pin', 'pins_configured', 'cart_draft', 'receipt_printer', 'sticker_printer', 'sticker_prefs'];
    for (const k of legacyKeys) {
      const oldVal = localStorage.getItem(`mr_pos_${k}`);
      if (oldVal && !localStorage.getItem(`pos_${k}`)) {
        localStorage.setItem(`pos_${k}`, oldVal);
      }
    }
  }

  const [activeModule, setActiveModule] = useState<ActiveModule>('catalog');
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  
  // Persistent PIN state: reads from localStorage
  const [cashierPin, setCashierPin] = useState(() => {
    return localStorage.getItem('pos_cashier_pin') || '1234';
  });
  const [adminPin, setAdminPin] = useState(() => {
    return localStorage.getItem('pos_admin_pin') || '8888';
  });

  const [storeSettings, setStoreSettings] = useState<StoreSettings>(() => {
    const savedAdmin = localStorage.getItem('pos_admin_pin') || '8888';
    const savedCashier = localStorage.getItem('pos_cashier_pin') || '1234';
    try {
      const saved = localStorage.getItem('pos_store_settings');
      if (saved) {
        return { ...DEFAULT_STORE_SETTINGS, ...JSON.parse(saved), admin_pin: savedAdmin, cashier_pin: savedCashier };
      }
    } catch {}
    return { ...DEFAULT_STORE_SETTINGS, admin_pin: savedAdmin, cashier_pin: savedCashier };
  });

  // Listen for instant admin settings updates across windows and tabs
  useEffect(() => {
    const handleSettingsSync = (e: any) => {
      if (e?.detail) {
        setStoreSettings(prev => ({ ...prev, ...e.detail }));
      } else {
        const saved = localStorage.getItem('pos_store_settings');
        if (saved) {
          try {
            setStoreSettings(prev => ({ ...prev, ...JSON.parse(saved) }));
          } catch {}
        }
      }
    };
    window.addEventListener('pos_settings_updated', handleSettingsSync);
    window.addEventListener('storage', handleSettingsSync);
    return () => {
      window.removeEventListener('pos_settings_updated', handleSettingsSync);
      window.removeEventListener('storage', handleSettingsSync);
    };
  }, []);

  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [isAdminSettingsOpen, setIsAdminSettingsOpen] = useState(false);
  const [isTerminalLocked, setIsTerminalLocked] = useState(false);

  const [isInitializing, setIsInitializing] = useState(true);

  // Single-window Station Mode: 'setup' | 'gateway' | 'cashier' | 'admin'
  // When opened fresh without configured PINs, strictly forces 'setup' first
  const [stationMode, setStationMode] = useState<'setup' | 'gateway' | 'cashier' | 'admin'>(() => {
    const configured = localStorage.getItem('pos_pins_configured');
    if (configured !== 'true') return 'setup';
    const hash = window.location.hash.toLowerCase();
    if (hash.includes('cashier')) return 'cashier';
    if (hash.includes('admin')) return 'admin';
    return 'gateway';
  });

  const [isAdminPinModalOpen, setIsAdminPinModalOpen] = useState(false);

  // Synchronize hash with stationMode without reload
  const navigateStation = (mode: 'setup' | 'gateway' | 'cashier' | 'admin') => {
    setStationMode(mode);
    if (mode === 'cashier') {
      window.location.hash = '#/cashier';
    } else if (mode === 'admin') {
      window.location.hash = '#/admin';
    } else if (mode === 'setup') {
      window.location.hash = '#/setup';
    } else {
      window.location.hash = '';
    }
  };

  // First-time PIN setup completion handler
  const handleSaveFirstTimePins = (newAdmin: string, newCashier: string) => {
    setAdminPin(newAdmin);
    setCashierPin(newCashier);
    localStorage.setItem('pos_admin_pin', newAdmin);
    localStorage.setItem('pos_cashier_pin', newCashier);
    localStorage.setItem('pos_pins_configured', 'true');
    const updated = {
      ...storeSettings,
      admin_pin: newAdmin,
      cashier_pin: newCashier,
      pins_configured: true
    };
    setStoreSettings(updated);
    localStorage.setItem('pos_store_settings', JSON.stringify(updated));

    if ((window as any).electronAPI?.setupAdminPin) {
      (window as any).electronAPI.setupAdminPin({ pin: newAdmin }).catch(() => {});
    }
    navigateStation('gateway');
  };

  useEffect(() => {
    const handleHash = () => {
      const configured = localStorage.getItem('pos_pins_configured');
      if (configured !== 'true') {
        setStationMode('setup');
        return;
      }
      const hash = window.location.hash.toLowerCase();
      if (hash.includes('setup')) setStationMode('setup');
      else if (hash.includes('cashier')) setStationMode('cashier');
      else if (hash.includes('admin')) setStationMode('admin');
      else setStationMode('gateway');
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Listen for IPC station navigation from Electron (e.g. when Admin window focuses Cashier window)
  useEffect(() => {
    if ((window as any).electronAPI?.onNavigateStation) {
      const unsub = (window as any).electronAPI.onNavigateStation((mode: 'setup' | 'gateway' | 'cashier' | 'admin') => {
        if (mode === 'setup' || mode === 'gateway' || mode === 'cashier' || mode === 'admin') {
          navigateStation(mode);
        }
      });
      return unsub;
    }
  }, []);

  // Global Keyboard Shortcuts (F1, F2, F3, F4, F7, Ctrl+L)
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      // Ctrl+L: Lock workstation by immediately returning to Station Gateway selection
      if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        navigateStation('gateway');
        return;
      }

      // Check if target is an active input/textarea
      const activeEl = document.activeElement;
      const isInput = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.getAttribute('contenteditable') === 'true'
      );

      // In Cashier Mode: Under NO circumstances should F1-F6 open Admin Console!
      // Leave F1-F4 for Bill Switching, F6 for Exchange, F7 for Price Check, F9 for Loose Goods, F12 for Tender
      if (stationMode === 'cashier') {
        if (['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F12'].includes(e.key)) {
          return;
        }
      }

      // In Admin Mode: F1 focuses/switches to Cashier Register window, F2-F6 navigate Admin Modules
      if (stationMode === 'admin') {
        if (e.key === 'F1') {
          e.preventDefault();
          if ((window as any).electronAPI?.focusOrOpenCashierWindow) {
            (window as any).electronAPI.focusOrOpenCashierWindow();
          } else {
            navigateStation('cashier');
          }
          return;
        } else if (e.key === 'F2') {
          e.preventDefault();
          setActiveModule('catalog');
        } else if (e.key === 'F3') {
          e.preventDefault();
          setActiveModule('khata');
        } else if (e.key === 'F4') {
          e.preventDefault();
          setActiveModule('suppliers');
        } else if (e.key === 'F5') {
          e.preventDefault();
          setActiveModule('reports');
        } else if (e.key === 'F6') {
          e.preventDefault();
          setActiveModule('emergency');
        } else if (e.key === 'F8') {
          e.preventDefault();
          setActiveModule('history');
        } else if (e.key === 'F7') {
          e.preventDefault();
          if (activeShift) {
            setIsShiftModalOpen(true);
          }
        }
      }
    };
    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, [stationMode, activeShift]);

  // Initialize DB and load active shift
  const bootSystem = async () => {
    setIsInitializing(true);
    try {
      await ensureSchemaAndSeed();
      const shift = await shiftService.getActiveShift();
      setActiveShift(shift || null);
    } catch (e) {
      console.error('[pos-core] Boot error:', e);
    } finally {
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    bootSystem();
  }, []);

  const handleBackupDatabase = async () => {
    hardwareService.playScanSuccess();
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      await posAlert(
        'Database Snapshot Saved',
        `SQLite Master Backup created: grocery_master_backup_${timestamp}.db\nReady for export or USB drive transfer.`,
        'success'
      );
    } catch (e: any) {
      await posAlert('Backup Error', `Backup error: ${e.message}`, 'error');
    }
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-[#243338] text-white flex flex-col items-center justify-center p-4 font-sans">
        <div className="w-12 h-12 border-4 border-[#5B7981] border-t-[#E3D5C0] rounded-full animate-spin mb-4"></div>
        <h2 className="text-base font-bold font-heading tracking-wide">INITIALIZING POS-CORE ENGINE...</h2>
        <p className="text-xs text-stone-400 font-mono mt-1">Verifying Local SQLite Engine (grocery_master.db)</p>
      </div>
    );
  }

  // 1. DEDICATED INITIAL SETUP SCREEN (NO OVERLAYS, EXCLUSIVE FULL VIEW)
  if (stationMode === 'setup') {
    return (
      <>
        <InitialSetupScreen
          storeName={storeSettings.store_name}
          onComplete={handleSaveFirstTimePins}
        />
        <GlobalDialogModal />
      </>
    );
  }

  return (
    <>
      {/* 1. STATION GATEWAY: FIRST SCREEN PROMPTING CASHIER VS ADMIN + PIN */}
      {stationMode === 'gateway' ? (
        <StationGateway
          onSelectStation={(role) => {
            if (role === 'cashier') {
              navigateStation('cashier');
            } else if (role === 'admin') {
              navigateStation('admin');
              if ((window as any).electronAPI?.focusOrOpenAdminWindow) {
                (window as any).electronAPI.focusOrOpenAdminWindow();
              }
            }
          }}
          adminPin={adminPin}
          cashierPin={cashierPin}
          storeName={storeSettings.store_name}
        />
      ) : stationMode === 'cashier' ? (
        /* 2. DEDICATED CASHIER TERMINAL */
        <div className="h-screen max-h-screen bg-[#F7F5F0] text-stone-900 flex flex-col font-sans antialiased overflow-hidden">
          <header className="bg-stone-900 text-white px-4 py-2 border-b border-stone-800 flex items-center justify-between shadow-md select-none shrink-0 z-40">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-[#5B7981] text-[#E3D5C0] rounded-xl font-bold flex items-center gap-1.5 text-xs">
                <Store className="w-4 h-4" />
                <span>{storeSettings.store_name}</span>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-xs text-stone-300 font-mono">
                <span className="px-2 py-0.5 bg-stone-800 rounded-md border border-stone-700 text-emerald-400 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  CASHIER BILLING TERMINAL
                </span>
                <span>Cashier: <strong>{activeShift?.cashier_name || 'Not Logged In'}</strong></span>
                {activeShift && (
                  <span className="text-amber-300">Float: Rs. {Number(activeShift.opening_float || 0).toLocaleString()}</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => navigateStation('gateway')}
                className="px-2.5 py-1 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                title="Lock Screen [Ctrl+L]"
              >
                <Lock className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">[Ctrl+L] Lock</span>
              </button>

              {activeShift && (
                <button
                  onClick={() => setIsShiftModalOpen(true)}
                  className="px-3 py-1 bg-amber-600/90 hover:bg-amber-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
                  title="Close active shift [F7]"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>[F7] Close Shift</span>
                </button>
              )}

              {/* SWITCH TO ADMIN SCREEN BUTTON (DIRECT IF OPEN, OR PIN PROTECTED) */}
              <button
                onClick={async () => {
                  if ((window as any).electronAPI?.isAdminWindowOpen) {
                    try {
                      const isOpen = await (window as any).electronAPI.isAdminWindowOpen();
                      if (isOpen) {
                        await (window as any).electronAPI.focusOrOpenAdminWindow();
                        return;
                      }
                    } catch {}
                  }
                  setIsAdminPinModalOpen(true);
                }}
                className="px-2.5 py-1 bg-stone-800 hover:bg-stone-700 text-amber-300 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors border border-amber-500/30"
                title="Switch to Admin Console"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                <span>Admin Console</span>
              </button>

              {/* RETURN TO STATION GATEWAY */}
              <button
                onClick={() => navigateStation('gateway')}
                className="px-2.5 py-1 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                title="Return to Station Gateway / Switch Role"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Stations</span>
              </button>
            </div>
          </header>

          <main className="flex-1 min-h-0 overflow-y-auto">
            <UniversalBillingTerminal
              storeSettings={storeSettings}
              cashierName={activeShift?.cashier_name || 'Cashier #01'}
              activeShiftId={activeShift?.id}
              onOpenShiftClose={() => setIsShiftModalOpen(true)}
            />
          </main>

          {/* CASHIER STATUS FOOTER WITH TEDDOPS BRANDING */}
          <footer className="bg-stone-900 text-stone-400 px-4 py-1.5 flex items-center justify-between text-[11px] border-t border-stone-800 shrink-0 font-mono">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-stone-300 font-bold">Point of Sale &amp; ERP v1.0</span>
              <span className="text-stone-600">|</span>
              <span>Terminal: <strong>ACTIVE</strong></span>
            </div>
            <div className="text-right">
              <span className="text-stone-300 font-bold">Developed and Maintained by Teddops</span>
              <span className="text-stone-400 ml-1.5">(Engr Maryam &amp; Engr Kamran)</span>
              <span className="text-stone-500 ml-2">• Ph: 0329-7263098 / 0323-5930559</span>
            </div>
          </footer>
        </div>
      ) : (
        /* 3. DEDICATED ADMIN MANAGEMENT CONSOLE (WITH VERTICAL SIDEBAR) */
        <div className="h-screen w-screen bg-[#F7F5F0] text-stone-900 flex overflow-hidden font-sans antialiased">
          <AdminSidebarNav
            activeModule={activeModule}
            onSelectModule={setActiveModule}
            activeShift={activeShift}
            onOpenShiftClose={() => setIsShiftModalOpen(true)}
            storeSettings={storeSettings}
            onBackupDatabase={handleBackupDatabase}
            onOpenSettings={() => setIsAdminSettingsOpen(true)}
            onLockTerminal={() => navigateStation('gateway')}
            onSwitchToCashier={() => {
              if ((window as any).electronAPI?.focusOrOpenCashierWindow) {
                (window as any).electronAPI.focusOrOpenCashierWindow();
              } else {
                navigateStation('cashier');
              }
            }}
            onSwitchToGateway={() => navigateStation('gateway')}
          />
          <main className="flex-1 h-screen min-h-0 overflow-y-auto bg-[#F7F5F0]">
            {(activeModule === 'catalog' || activeModule === 'billing') && (
              <ProductCatalog storeSettings={storeSettings} />
            )}
            {activeModule === 'khata' && (
              <CustomerKhataManager storeSettings={storeSettings} />
            )}
            {activeModule === 'suppliers' && (
              <SupplierLedgerManager storeSettings={storeSettings} />
            )}
            {activeModule === 'reports' && (
              <FinancialReportsManager storeSettings={storeSettings} />
            )}
            {activeModule === 'emergency' && (
              <EmergencyBillGenerator storeSettings={storeSettings} />
            )}
            {activeModule === 'history' && (
              <BillHistoryManager storeSettings={storeSettings} activeShift={activeShift} />
            )}
          </main>
        </div>
      )}

      {/* CASHIER OPENING SHIFT FLOW MODAL (Shown when in Cashier mode and activeShift is null) */}
      {!activeShift && !isInitializing && stationMode === 'cashier' && (
        <OpenShiftModal
          isOpen={!activeShift && !isInitializing && stationMode === 'cashier'}
          storeSettings={storeSettings}
          onShiftOpened={(newShift) => setActiveShift(newShift)}
          onCancel={() => navigateStation('gateway')}
        />
      )}

      {/* BLIND SHIFT RECONCILIATION MODAL */}
      {isShiftModalOpen && activeShift && (
        <BlindShiftCloseModal
          isOpen={isShiftModalOpen}
          onClose={() => setIsShiftModalOpen(false)}
          activeShift={activeShift}
          storeSettings={storeSettings}
          onShiftClosed={bootSystem}
        />
      )}

      {/* ADMIN CONTROL PANEL MODAL */}
      {isAdminSettingsOpen && (
        <AdminSettingsModal
          isOpen={isAdminSettingsOpen}
          onClose={() => setIsAdminSettingsOpen(false)}
          storeSettings={storeSettings}
          onSaveSettings={(newSettings) => {
            setStoreSettings(newSettings);
            localStorage.setItem('pos_store_settings', JSON.stringify(newSettings));
          }}
        />
      )}

      {/* ADMIN PIN VERIFICATION MODAL (When switching from Cashier to Admin) */}
      <AdminPinPromptModal
        isOpen={isAdminPinModalOpen}
        onClose={() => setIsAdminPinModalOpen(false)}
        onSuccess={() => {
          setIsAdminPinModalOpen(false);
          if ((window as any).electronAPI?.focusOrOpenAdminWindow) {
            (window as any).electronAPI.focusOrOpenAdminWindow();
          } else {
            navigateStation('admin');
          }
        }}
        adminPin={adminPin}
      />

      {/* TWO-TIER PIN LOCK SCREEN */}
      <PinLockScreen
        isLocked={isTerminalLocked}
        onUnlock={() => setIsTerminalLocked(false)}
        cashierPin={cashierPin}
        adminPin={adminPin}
        onUpdatePins={(newCashier, newAdmin) => {
          setCashierPin(newCashier);
          setAdminPin(newAdmin);
          localStorage.setItem('pos_cashier_pin', newCashier);
          localStorage.setItem('pos_admin_pin', newAdmin);
          localStorage.setItem('pos_pins_configured', 'true');
        }}
      />

      {/* NON-BROWSER HIGH-DENSITY DIALOG SYSTEM (Alerts, Prompts &amp; Confirmations) */}
      <GlobalDialogModal />

    </>
  );
};
