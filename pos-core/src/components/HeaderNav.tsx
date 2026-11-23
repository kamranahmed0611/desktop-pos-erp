import React, { useState, useEffect } from 'react';
import { Shift, StoreSettings } from '../types';
import { 
  ShoppingCart, FileText, Package, BookOpen, 
  Truck, Lock, Database, Clock, Sparkles, Store, CheckCircle2,
  Settings, KeyRound, Monitor, LogOut, ArrowRightLeft, BarChart3, History
} from 'lucide-react';

export type ActiveModule = 'emergency' | 'billing' | 'catalog' | 'khata' | 'suppliers' | 'reports' | 'history';

interface HeaderNavProps {
  activeModule: ActiveModule;
  onSelectModule: (mod: ActiveModule) => void;
  activeShift: Shift | null;
  onOpenShiftClose: () => void;
  storeSettings: StoreSettings;
  onBackupDatabase: () => void;
  onOpenSettings: () => void;
  onLockTerminal: () => void;
  onSwitchToCashier?: () => void;
  onSwitchToGateway?: () => void;
}

export const HeaderNav: React.FC<HeaderNavProps> = ({
  activeModule,
  onSelectModule,
  activeShift,
  onOpenShiftClose,
  storeSettings,
  onBackupDatabase,
  onOpenSettings,
  onLockTerminal,
  onSwitchToCashier,
  onSwitchToGateway
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="bg-[#243338] text-white border-b border-stone-700 font-sans shadow-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-col md:flex-row items-center justify-between gap-3">
        
        {/* BRAND &amp; ACTIVE SHIFT STATUS */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-2.5">
            <div className="bg-[#5B7981] text-[#E3D5C0] p-2 rounded-xl shadow-xs">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <span className="font-black text-sm tracking-tight text-white block uppercase">
                {storeSettings.store_name}
              </span>
              <span className="text-[10px] text-[#E3D5C0] font-mono block">
                {storeSettings.tagline}
              </span>
            </div>
          </div>

          {activeShift && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-[11px] text-emerald-300 font-mono">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
              <span>REGISTER #{activeShift.id.slice(-4)} • {activeShift.cashier_name}</span>
            </div>
          )}
        </div>

        {/* NAVIGATION MODULE BUTTONS (POS BILLING AS PRIMARY FIRST SCREEN) */}
        <nav className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          
          {/* 1. UNIVERSAL BILLING TERMINAL (PRIMARY FIRST SCREEN) */}
          <button
            onClick={() => onSelectModule('billing')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-xs ${
              activeModule === 'billing'
                ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-400'
                : 'bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 border border-emerald-500/30'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>POS CASHIER TERMINAL [F1-F4]</span>
          </button>

          {/* 2. PRODUCT CATALOG */}
          <button
            onClick={() => onSelectModule('catalog')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeModule === 'catalog'
                ? 'bg-[#5B7981] text-white shadow-md'
                : 'text-stone-300 hover:bg-stone-800'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Catalog &amp; Stock</span>
          </button>

          {/* 3. CUSTOMER KHATA */}
          <button
            onClick={() => onSelectModule('khata')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeModule === 'khata'
                ? 'bg-[#5B7981] text-white shadow-md'
                : 'text-stone-300 hover:bg-stone-800'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Customer Khata</span>
          </button>

          {/* 4. SUPPLIER LEDGER */}
          <button
            onClick={() => onSelectModule('suppliers')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeModule === 'suppliers'
                ? 'bg-[#5B7981] text-white shadow-md'
                : 'text-stone-300 hover:bg-stone-800'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>Suppliers</span>
          </button>

          {/* 5. REPORTS &amp; PROFIT AUDIT [F5] */}
          <button
            onClick={() => onSelectModule('reports')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeModule === 'reports'
                ? 'bg-[#5B7981] text-white shadow-md'
                : 'text-stone-300 hover:bg-stone-800'
            }`}
            title="Financial Reports &amp; Profit Audits [F5]"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Reports &amp; Audits</span>
          </button>

          {/* 5. EMERGENCY / PENDING DIGITAL BILLS (SEPARATE UTILITY TAB) */}
          <button
            onClick={() => onSelectModule('emergency')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeModule === 'emergency'
                ? 'bg-amber-500 text-stone-950 shadow-md font-black'
                : 'text-amber-300/80 hover:bg-amber-500/20 border border-amber-400/20'
            }`}
            title="Generate pending digital receipts for customers"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Pending Bills (Digital)</span>
          </button>

          {/* 6. ALL BILLS ARCHIVE &amp; SEARCH */}
          <button
            onClick={() => onSelectModule('history')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeModule === 'history'
                ? 'bg-[#5B7981] text-white shadow-md font-bold'
                : 'text-stone-300 hover:bg-stone-800'
            }`}
            title="Search and reprint past bills till date [F8]"
          >
            <History className="w-3.5 h-3.5" />
            <span>Bill History</span>
          </button>
        </nav>

        {/* RIGHT CONTROLS: CLOCK, SHIFT CLOSE &amp; USB BACKUP */}
        <div className="hidden lg:flex items-center gap-2.5">
          <div className="text-right font-mono text-[11px] text-stone-300 pr-2 border-r border-stone-700">
            <div>{currentTime.toLocaleDateString('en-PK', { weekday: 'short', day: '2-digit', month: 'short' })}</div>
            <div className="font-bold text-white">{currentTime.toLocaleTimeString('en-PK')}</div>
          </div>

          <button
            onClick={onOpenShiftClose}
            className="px-2.5 py-1.5 bg-red-950/60 hover:bg-red-900 border border-red-500/40 text-red-300 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
            title="Shift Reconciliation / Z-Report"
          >
            <Lock className="w-3.5 h-3.5" /> Close Shift
          </button>

          <button
            onClick={onOpenSettings}
            className="p-1.5 bg-stone-800 hover:bg-stone-700 border border-stone-600 text-stone-300 rounded-xl cursor-pointer transition-colors"
            title="Admin Settings &amp; Tax Toggles"
          >
            <Settings className="w-4 h-4 text-amber-400" />
          </button>

          <button
            onClick={onLockTerminal}
            className="p-1.5 bg-stone-800 hover:bg-stone-700 border border-stone-600 text-stone-300 rounded-xl cursor-pointer transition-colors"
            title="Lock Terminal [Ctrl+L]"
          >
            <KeyRound className="w-4 h-4 text-blue-400" />
          </button>

          {onSwitchToCashier && (
            <button
              onClick={onSwitchToCashier}
              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
              title="Switch to Cashier Terminal [Single Window]"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Cashier Terminal</span>
            </button>
          )}

          {onSwitchToGateway && (
            <button
              onClick={onSwitchToGateway}
              className="px-2 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors border border-stone-600"
              title="Log Out to Station Gateway Screen"
            >
              <LogOut className="w-3.5 h-3.5 text-red-400" />
              <span className="hidden xl:inline">Stations</span>
            </button>
          )}

          <button
            onClick={onBackupDatabase}
            className="p-1.5 bg-stone-800 hover:bg-stone-700 border border-stone-600 text-stone-300 rounded-xl cursor-pointer transition-colors"
            title="1-Click Backup Database to USB"
          >
            <Database className="w-4 h-4 text-emerald-400" />
          </button>
        </div>

      </div>
    </header>
  );
};
