import React, { useState, useEffect } from 'react';
import { Shift, StoreSettings } from '../../types';
import { 
  ShoppingCart, Package, BookOpen, Truck, Sparkles, 
  Store, Lock, Settings, Database, ArrowRightLeft, 
  ExternalLink, LogOut, ShieldCheck, BarChart3, History
} from 'lucide-react';
import { ActiveModule } from '../HeaderNav';

interface AdminSidebarNavProps {
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

export const AdminSidebarNav: React.FC<AdminSidebarNavProps> = ({
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
    <aside className="w-60 min-w-[240px] max-w-[240px] h-screen max-h-screen bg-[#F4F1EA] border-r border-stone-300 flex flex-col font-sans select-none z-30 shrink-0 shadow-xs overflow-hidden">
      
      {/* TOP BRAND HEADER */}
      <div className="p-3 sm:p-4 border-b border-stone-200 bg-[#EAE6DD]/60 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-[#5B7981] text-[#E3D5C0] rounded-xl shadow-xs">
            <Store className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div className="overflow-hidden">
            <h2 className="font-black text-sm tracking-tight text-stone-900 truncate uppercase">
              {storeSettings.store_name}
            </h2>
            <span className="text-[10px] text-stone-600 font-mono block truncate">
              Admin Console
            </span>
          </div>
        </div>
      </div>

      {/* PRIMARY NAVIGATION MODULES */}
      <nav className="flex-1 min-h-0 overflow-y-auto p-2.5 sm:p-3 space-y-1 sm:space-y-1.5 [scrollbar-width:thin]">
          <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-stone-500 font-mono">
            Modules
          </div>

          {/* 1. SWITCH TO CASHIER REGISTER WINDOW (F1) */}
          <button
            onClick={() => {
              if (onSwitchToCashier) onSwitchToCashier();
            }}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 shadow-2xs"
            title="Switch to Cashier Register Window [F1]"
          >
            <div className="flex items-center gap-2.5">
              <ShoppingCart className="w-4 h-4 text-emerald-700" />
              <span>Switch to Cashier</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-emerald-700 text-white font-bold">
              F1
            </span>
          </button>

          {/* 2. CATALOG &amp; STOCK (F2) */}
          <button
            onClick={() => onSelectModule('catalog')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeModule === 'catalog'
                ? 'bg-[#5B7981] text-white shadow-sm'
                : 'text-stone-700 hover:bg-stone-200/80 hover:text-stone-900'
            }`}
            title="Manage Products &amp; Barcodes [F2]"
          >
            <div className="flex items-center gap-2.5">
              <Package className={`w-4 h-4 ${activeModule === 'catalog' ? 'text-[#E3D5C0]' : 'text-[#5B7981]'}`} />
              <span>Catalog &amp; Stock</span>
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
              activeModule === 'catalog' ? 'bg-[#48636a] text-stone-200' : 'bg-stone-200 text-stone-600'
            }`}>
              F2
            </span>
          </button>

          {/* 3. CUSTOMER KHATA (F3) */}
          <button
            onClick={() => onSelectModule('khata')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeModule === 'khata'
                ? 'bg-[#5B7981] text-white shadow-sm'
                : 'text-stone-700 hover:bg-stone-200/80 hover:text-stone-900'
            }`}
            title="Customer Khata Credit Accounts [F3]"
          >
            <div className="flex items-center gap-2.5">
              <BookOpen className={`w-4 h-4 ${activeModule === 'khata' ? 'text-[#E3D5C0]' : 'text-[#5B7981]'}`} />
              <span>Customer Khata</span>
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
              activeModule === 'khata' ? 'bg-[#48636a] text-stone-200' : 'bg-stone-200 text-stone-600'
            }`}>
              F3
            </span>
          </button>

          {/* 4. SUPPLIER LEDGER (F4) */}
          <button
            onClick={() => onSelectModule('suppliers')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeModule === 'suppliers'
                ? 'bg-[#5B7981] text-white shadow-sm'
                : 'text-stone-700 hover:bg-stone-200/80 hover:text-stone-900'
            }`}
            title="Supplier Purchasing &amp; Khata [F4]"
          >
            <div className="flex items-center gap-2.5">
              <Truck className={`w-4 h-4 ${activeModule === 'suppliers' ? 'text-[#E3D5C0]' : 'text-[#5B7981]'}`} />
              <span>Supplier Ledger</span>
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
              activeModule === 'suppliers' ? 'bg-[#48636a] text-stone-200' : 'bg-stone-200 text-stone-600'
            }`}>
              F4
            </span>
          </button>

          {/* 5. REPORTS &amp; FINANCIAL AUDIT (F5) */}
          <button
            onClick={() => onSelectModule('reports')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeModule === 'reports'
                ? 'bg-[#5B7981] text-white shadow-sm'
                : 'text-stone-700 hover:bg-stone-200/80 hover:text-stone-900'
            }`}
            title="Financial Reports &amp; Profit Audits [F5]"
          >
            <div className="flex items-center gap-2.5">
              <BarChart3 className={`w-4 h-4 ${activeModule === 'reports' ? 'text-[#E3D5C0]' : 'text-[#5B7981]'}`} />
              <span>Reports &amp; Profit</span>
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
              activeModule === 'reports' ? 'bg-[#48636a] text-stone-200' : 'bg-stone-200 text-stone-600'
            }`}>
              F5
            </span>
          </button>

          {/* 6. PENDING DIGITAL BILLS */}
          <button
            onClick={() => onSelectModule('emergency')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeModule === 'emergency'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-amber-800 hover:bg-amber-100/60'
            }`}
            title="Pending Digital Bills / Slip Simulator"
          >
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>Pending Bills</span>
            </div>
          </button>

          {/* 7. ALL BILLS ARCHIVE &amp; SEARCH (TILL DATE) */}
          <button
            onClick={() => onSelectModule('history')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeModule === 'history'
                ? 'bg-[#5B7981] text-white shadow-sm'
                : 'text-stone-700 hover:bg-stone-200/80 hover:text-stone-900'
            }`}
            title="Search &amp; Reprint All Past Bills Till Date [F8]"
          >
            <div className="flex items-center gap-2.5">
              <History className={`w-4 h-4 ${activeModule === 'history' ? 'text-[#E3D5C0]' : 'text-[#5B7981]'}`} />
              <span>Bill History &amp; Search</span>
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
              activeModule === 'history' ? 'bg-[#48636a] text-stone-200' : 'bg-stone-200 text-stone-600'
            }`}>
              F8
            </span>
          </button>

          <div className="pt-3 pb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-stone-500 font-mono">
            Settings &amp; System
          </div>

          {/* BILL &amp; RECEIPT SETTINGS */}
          <button
            onClick={onOpenSettings}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-stone-700 hover:bg-stone-200/80 transition-colors cursor-pointer"
          >
            <Settings className="w-4 h-4 text-stone-600" />
            <span>Bill &amp; Tax Settings</span>
          </button>

          {/* LOCK TERMINAL */}
          <button
            onClick={onLockTerminal}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-stone-700 hover:bg-stone-200/80 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Lock className="w-4 h-4 text-stone-600" />
              <span>Lock Terminal</span>
            </div>
            <span className="text-[10px] text-stone-500 font-mono">Ctrl+L</span>
          </button>

          {/* BACKUP DATABASE */}
          <button
            onClick={onBackupDatabase}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-stone-700 hover:bg-stone-200/80 transition-colors cursor-pointer"
            title="Create SQLite Snapshot"
          >
            <Database className="w-4 h-4 text-stone-600" />
            <span>Backup Database</span>
          </button>

          {/* RETURN TO GATEWAY */}
          {onSwitchToGateway && (
            <button
              onClick={onSwitchToGateway}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-stone-700 hover:bg-stone-200/80 transition-colors cursor-pointer"
              title="Station Gateway Mode Switch"
            >
              <ArrowRightLeft className="w-4 h-4 text-stone-600" />
              <span>Station Gateway</span>
            </button>
          )}
        </nav>

      {/* BOTTOM SHIFT &amp; RECONCILIATION CARD */}
      <div className="p-2.5 sm:p-3 border-t border-stone-300 bg-[#EAE6DD]/50 space-y-1.5 sm:space-y-2 shrink-0">
        {activeShift ? (
          <div className="p-2.5 bg-white rounded-xl border border-stone-200 shadow-2xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-stone-500 uppercase font-mono">Active Shift</span>
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                OPEN
              </span>
            </div>
            <div className="text-xs font-bold text-stone-800 truncate">
              {activeShift.cashier_name}
            </div>
            <div className="text-[11px] text-stone-600 font-mono">
              Float: Rs. {Number(activeShift.opening_float || 0).toLocaleString()}
            </div>
            <button
              onClick={onOpenShiftClose}
              className="w-full mt-1 py-1.5 px-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Close Shift [F7]</span>
            </button>
          </div>
        ) : (
          <div className="p-2 bg-stone-200/60 rounded-xl text-center">
            <span className="text-[11px] text-stone-500 font-mono">No Active Shift</span>
          </div>
        )}

        {/* CLOCK */}
        <div className="text-center font-mono text-[11px] text-stone-500 pt-1">
          <div>{currentTime.toLocaleDateString('en-PK', { weekday: 'short', day: '2-digit', month: 'short' })}</div>
          <div className="font-bold text-stone-800">{currentTime.toLocaleTimeString('en-PK')}</div>
        </div>

        {/* TEDDOPS BRANDING WATERMARK */}
        <div className="text-center pt-2 border-t border-stone-300/80 font-sans">
          <p className="text-[10px] font-bold text-stone-800 leading-tight">
            Developed and Maintained by Teddops
          </p>
          <p className="text-[9px] font-semibold text-stone-600">
            Engr Maryam &amp; Engr Kamran
          </p>
          <p className="text-[9px] text-[#5B7981] font-mono mt-0.5">
            +92 329 7263098 • +92 323 5930559
          </p>
        </div>
      </div>

    </aside>
  );
};
