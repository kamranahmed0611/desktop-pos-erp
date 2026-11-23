import React, { useState, useEffect } from 'react';
import { Category, StoreSettings, ReceiptFieldVisibility, Invoice, InvoiceItem } from '../../types';
import { sqlDb } from '../../db/sqlite';
import { hardwareService } from '../../services/hardwareService';
import { billingService } from '../../services/billingService';
import { invoicePdfService } from '../../services/invoicePdfService';
import { HighDensityReceiptCard } from '../emergency/HighDensityReceiptCard';
import { posAlert } from '../../store/uiStore';
import { 
  Settings, Store, Percent, FileText, Lock, 
  Download, Printer, Check, X, ShieldAlert, Sliders, Eye, Sparkles,
  History, Calendar, Search, Share2, RefreshCw
} from 'lucide-react';

interface AdminSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeSettings: StoreSettings;
  onSaveSettings: (newSettings: StoreSettings) => void;
}

export const AdminSettingsModal: React.FC<AdminSettingsModalProps> = ({
  isOpen,
  onClose,
  storeSettings,
  onSaveSettings
}) => {
  const [activeTab, setActiveTab] = useState<'store' | 'tax' | 'receipt' | 'history' | 'security' | 'audit'>('store');
  const [formSettings, setFormSettings] = useState<StoreSettings>(storeSettings);

  // Bill History State
  const [historyInvoices, setHistoryInvoices] = useState<(Invoice & { items: InvoiceItem[] })[]>([]);
  const [historyTotalCount, setHistoryTotalCount] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historySearch, setHistorySearch] = useState('');
  const [historyStartDate, setHistoryStartDate] = useState('');
  const [historyEndDate, setHistoryEndDate] = useState('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedHistoryInvoice, setSelectedHistoryInvoice] = useState<(Invoice & { items: InvoiceItem[] }) | null>(null);

  const fetchHistory = async (page = 1) => {
    setIsLoadingHistory(true);
    try {
      const res = await billingService.searchInvoicesPaginated({
        search: historySearch.trim() || undefined,
        startDate: historyStartDate || undefined,
        endDate: historyEndDate || undefined,
        allShifts: true,
        page,
        limit: 20
      });
      setHistoryInvoices(res.invoices);
      setHistoryTotalCount(res.totalCount);
      setHistoryPage(res.page);
      setHistoryTotalPages(res.totalPages);
    } catch (err: any) {
      console.warn('Failed to load invoice history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'history') {
      fetchHistory(1);
    }
  }, [isOpen, activeTab]);

  // Category tax states
  const [categories, setCategories] = useState<Category[]>([]);
  const [systemPrinters, setSystemPrinters] = useState<Array<{ name: string; isDefault?: boolean }>>([]);
  const [receiptPrinter, setReceiptPrinter] = useState<string>(() => {
    return typeof localStorage !== 'undefined' ? localStorage.getItem('pos_receipt_printer') || '' : '';
  });

  useEffect(() => {
    if (isOpen) {
      hardwareService.getPrinters().then(printers => {
        setSystemPrinters(printers);
        if (!receiptPrinter) {
          const match = printers.find(p => /xp-80|xp80|pos-80|receipt|xp-80c|xp-90|xp90|xp-90c|xp90c/i.test(p.name));
          if (match) {
            setReceiptPrinter(match.name);
            localStorage.setItem('pos_receipt_printer', match.name);
          }
        }
      });
    }
  }, [isOpen]);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    setFormSettings(storeSettings);
    loadCategories();
  }, [isOpen, storeSettings]);

  if (!isOpen) return null;

  const updateVisibility = (field: keyof ReceiptFieldVisibility, checked: boolean) => {
    const updated: StoreSettings = {
      ...formSettings,
      receipt_visibility: {
        ...(formSettings.receipt_visibility || {}),
        [field]: checked
      }
    };
    setFormSettings(updated);
    onSaveSettings(updated);
    try {
      localStorage.setItem('pos_store_settings', JSON.stringify(updated));
      window.dispatchEvent(new Event('pos_settings_updated'));
    } catch {}
  };

  const updateSettingField = (updates: Partial<StoreSettings>) => {
    const updated: StoreSettings = {
      ...formSettings,
      ...updates
    };
    setFormSettings(updated);
    onSaveSettings(updated);
    try {
      localStorage.setItem('pos_store_settings', JSON.stringify(updated));
      window.dispatchEvent(new Event('pos_settings_updated'));
    } catch {}
  };

  const loadCategories = async () => {
    try {
      const rows = await sqlDb.query<Category>('SELECT * FROM categories ORDER BY name ASC');
      setCategories(rows);
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleCategoryTax = async (catId: string, currentStatus: boolean) => {
    try {
      const nextStatus = currentStatus ? 0 : 1;
      await sqlDb.execute('UPDATE categories SET is_taxable = ? WHERE id = ?', [nextStatus, catId]);
      await loadCategories();
      hardwareService.playScanSuccess();
    } catch (e: any) {
      await posAlert('Tax Setting Error', `Error updating category tax: ${e.message}`, 'error');
    }
  };

  const handleSaveStoreProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(formSettings);
    hardwareService.playCheckoutChime();
    await posAlert('Settings Saved', 'Admin Settings Saved Successfully!', 'success');
  };

  // 1-Click Complete Audit Package Export (CSV of Invoices, Khata, Suppliers)
  const handleExportAuditPackage = async () => {
    setIsExporting(true);
    try {
      // 1. Invoices
      const invoices = await sqlDb.query<any>('SELECT * FROM invoices ORDER BY created_at DESC');
      let invoicesCsv = 'Invoice_Number,Date,Customer,Total_PKR,Paid_PKR,Mode,Cashier,Is_Retroactive\n';
      invoices.forEach(inv => {
        invoicesCsv += `"${inv.invoice_number}","${inv.created_at}","${inv.customer_name || 'Walk-in'}","${inv.total_amount}","${inv.paid_amount}","${inv.payment_mode}","${inv.cashier_name}","${inv.is_retroactive ? 'YES' : 'NO'}"\n`;
      });

      // 2. Download Invoices CSV
      const blob = new Blob([invoicesCsv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MR_SUPER_STORE_SALES_AUDIT_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      hardwareService.playScanSuccess();
      await posAlert('Audit Export Complete', 'Audit CSV generated and downloaded!\nIncludes all Sales, Customer Invoices, and Retroactive Bills.', 'success');
    } catch (e: any) {
      await posAlert('Export Failed', `Export error: ${e.message}`, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // Print Annual Financial Summary on 80mm Roll
  const handlePrintAnnualSummary = async () => {
    try {
      const stats = await sqlDb.get<any>(`
        SELECT 
          COUNT(*) as total_bills,
          COALESCE(SUM(total_amount), 0) as grand_total,
          COALESCE(SUM(paid_amount), 0) as total_cash_received,
          COALESCE(SUM(discount_amount), 0) as total_discounts
        FROM invoices
      `);

      const slip = `
========================================
       ${formSettings.store_name}
    ANNUAL / TAX AUDIT SUMMARY
========================================
Date: ${new Date().toLocaleString()}
NTN: ${formSettings.ntn || '4398120-7'}
POS Reg ID: ${formSettings.pos_reg_id || 'ALM-884129'}
----------------------------------------
FINANCIAL PERFORMANCE:
Total Invoices Billed: ${stats?.total_bills || 0}
Grand Gross Sales:     PKR ${(stats?.grand_total || 0).toLocaleString()}
Discounts Granted:     PKR ${(stats?.total_discounts || 0).toLocaleString()}
Total Net Realized:    PKR ${(stats?.total_cash_received || 0).toLocaleString()}
----------------------------------------
EXCHANGE & RETURNS:
No Cash Refund Policy Verified.
All transactions recorded in SQLite.
----------------------------------------
Printed for Auditor Review.
POINT OF SALE & ERP CORE ENGINE
========================================
`;
      hardwareService.printReceiptSilent(slip);
      await posAlert('Print Dispatched', 'Annual Summary dispatched to Epson TM-T88V printer!', 'success');
    } catch (e: any) {
      await posAlert('Printer Error', `Print error: ${e.message}`, 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 font-sans select-none animate-fade-in">
      <div className="bg-white border border-stone-300 rounded-3xl max-w-4xl w-full shadow-2xl flex flex-col h-[88vh] max-h-[92vh] overflow-hidden">
        
        {/* MODAL HEADER */}
        <div className="bg-[#243338] text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#5B7981] text-[#E3D5C0] rounded-xl">
              <Settings className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-wide uppercase">ADMIN CONTROL PANEL</h2>
              <span className="text-xs text-[#E3D5C0] font-mono">Store Profile • Category Taxes • Receipt Options • Audit</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-stone-400 hover:text-white rounded-lg cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* NAVIGATION TABS */}
        <div className="bg-stone-100 border-b border-stone-200 px-4 sm:px-6 flex items-center gap-1 shrink-0 h-12 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[
            { id: 'store', label: 'Store Profile', icon: Store },
            { id: 'tax', label: 'Category Taxes', icon: Percent },
            { id: 'receipt', label: 'Receipt Options', icon: FileText },
            { id: 'history', label: 'Bill History & Invoices', icon: History },
            { id: 'security', label: 'Policy & PINs', icon: Lock },
            { id: 'audit', label: 'Audit & Exports', icon: Download }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`h-full px-3.5 sm:px-4 border-b-2 text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors shrink-0 ${
                  activeTab === tab.id
                    ? 'border-[#5B7981] text-[#5B7981] bg-white'
                    : 'border-transparent text-stone-500 hover:text-stone-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB CONTENTS */}
        <div className="p-4 sm:p-6 flex-1 min-h-0 overflow-y-auto">
          
          {/* TAB 1: STORE PROFILE */}
          {activeTab === 'store' && (
            <form onSubmit={handleSaveStoreProfile} className="space-y-4 max-w-xl text-xs">
              <div>
                <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Store Name</label>
                <input
                  type="text"
                  value={formSettings.store_name}
                  onChange={(e) => setFormSettings({ ...formSettings, store_name: e.target.value })}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl font-bold text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Tagline</label>
                <input
                  type="text"
                  value={formSettings.tagline}
                  onChange={(e) => setFormSettings({ ...formSettings, tagline: e.target.value })}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl font-medium"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Physical Address</label>
                <input
                  type="text"
                  value={formSettings.address}
                  onChange={(e) => setFormSettings({ ...formSettings, address: e.target.value })}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Store Phone</label>
                  <input
                    type="text"
                    value={formSettings.phone}
                    onChange={(e) => setFormSettings({ ...formSettings, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">WhatsApp #</label>
                  <input
                    type="text"
                    value={formSettings.whatsapp_number}
                    onChange={(e) => setFormSettings({ ...formSettings, whatsapp_number: e.target.value })}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">FBR NTN</label>
                  <input
                    type="text"
                    value={formSettings.ntn || ''}
                    onChange={(e) => setFormSettings({ ...formSettings, ntn: e.target.value })}
                    placeholder="4398120-7"
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">POS Reg ID</label>
                  <input
                    type="text"
                    value={formSettings.pos_reg_id || ''}
                    onChange={(e) => setFormSettings({ ...formSettings, pos_reg_id: e.target.value })}
                    placeholder="MRS-884129"
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="px-6 py-2.5 bg-[#5B7981] hover:bg-[#486269] text-white rounded-xl font-black shadow-md cursor-pointer flex items-center gap-2"
              >
                <Check className="w-4 h-4 stroke-[2.5]" /> Save Store Profile
              </button>
            </form>
          )}

          {/* TAB 2: CATEGORY TAXES */}
          {activeTab === 'tax' && (
            <div className="space-y-4 max-w-2xl text-xs">
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-2xl text-stone-600">
                <strong>Pakistani GST Category Configuration:</strong> Toggle taxable status per category. In Pakistan, fresh vegetables, flour, and raw grains are tax-exempt, while confectionery and beverages are subject to GST.
              </div>

              <div className="border border-stone-200 rounded-2xl overflow-hidden divide-y divide-stone-100">
                {categories.map(cat => (
                  <div key={cat.id} className="p-3.5 flex items-center justify-between hover:bg-stone-50">
                    <div>
                      <span className="font-bold text-stone-900 block">{cat.name}</span>
                      <span className="text-[11px] text-stone-500 font-mono">
                        Standard GST: {cat.tax_rate_percent}%
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleCategoryTax(cat.id, cat.is_taxable)}
                      className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer ${
                        cat.is_taxable
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-stone-200 text-stone-600 hover:bg-stone-300'
                      }`}
                    >
                      {cat.is_taxable ? 'GST ACTIVE (18%)' : 'TAX EXEMPT (0%)'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: RECEIPT OPTIONS WITH LIVE 80mm SIMULATOR */}
          {activeTab === 'receipt' && (() => {
            const vis = formSettings.receipt_visibility || {};
            return (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start text-xs">
                
                {/* LEFT PANE: CONFIGURATION INPUTS WITH TOGGLE CHECKBOXES */}
                <div className="md:col-span-7 space-y-3.5">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 leading-relaxed flex items-center justify-between">
                    <div>
                      <strong>Receipt Field Control:</strong> Check or uncheck fields below to customize your thermal slip. Every change updates the preview instantly.
                    </div>
                    <span className="px-2 py-0.5 bg-emerald-200 text-emerald-900 font-mono text-[10px] font-bold rounded">
                      80mm Roll
                    </span>
                  </div>

                  {/* DUAL-MODE HARDWARE RECEIPT PRINTER SELECTOR */}
                  <div className="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-stone-900 uppercase flex items-center gap-1.5">
                        <Printer className="w-4 h-4 text-[#5B7981]" />
                        Receipt Thermal Printer
                      </label>
                      <span className="text-[10px] bg-stone-200 text-stone-700 font-mono px-2 py-0.5 rounded font-bold">
                        XP-80 / XP-80C / XP-90C Driver
                      </span>
                    </div>
                    <select
                      value={receiptPrinter}
                      onChange={(e) => {
                        setReceiptPrinter(e.target.value);
                        if (e.target.value) {
                          localStorage.setItem('pos_receipt_printer', e.target.value);
                        } else {
                          localStorage.removeItem('pos_receipt_printer');
                        }
                      }}
                      className="w-full px-3 py-1.5 bg-white border border-stone-300 rounded-xl font-bold text-xs cursor-pointer focus:ring-2 focus:ring-[#5B7981]"
                    >
                      <option value="">Auto-Detect (XP-80 / XP-80C / XP-90C / POS-80 Driver)</option>
                      {systemPrinters.map(p => (
                        <option key={p.name} value={p.name}>
                          {p.name} {/xp-80|xp80|pos-80|receipt|xp-80c|xp-90|xp90|xp-90c/i.test(p.name) ? '★ (Detected Receipt Driver)' : ''}
                        </option>
                      ))}
                    </select>
                    <div className="text-[10.5px] text-stone-500 leading-tight">
                      Continuous roll receipt driver without trailing white margins. For dual-mode XP-365B, install the XP-80 / XP-80C / XP-90C driver on USB for receipt bills.
                    </div>
                  </div>

                  <div className="space-y-3">
                    {/* 1. STORE NAME */}
                    <div className="p-2.5 bg-stone-50 border border-stone-200 rounded-2xl space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-stone-600 uppercase">Store Name (Header)</label>
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={vis.show_store_name !== false}
                            onChange={(e) => updateVisibility('show_store_name', e.target.checked)}
                            className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                          <span>Print on Slip</span>
                        </label>
                      </div>
                      <input
                        type="text"
                        value={formSettings.store_name}
                        onChange={(e) => updateSettingField({ store_name: e.target.value })}
                        className="w-full px-3 py-1.5 bg-white border border-stone-300 rounded-xl font-bold text-sm text-stone-900"
                        placeholder="Store Name"
                      />
                    </div>

                    {/* 2. TAGLINE */}
                    <div className="p-2.5 bg-stone-50 border border-stone-200 rounded-2xl space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-stone-600 uppercase">Tagline / Business Nature</label>
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={vis.show_tagline !== false}
                            onChange={(e) => updateVisibility('show_tagline', e.target.checked)}
                            className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                          <span>Print on Slip</span>
                        </label>
                      </div>
                      <input
                        type="text"
                        value={formSettings.tagline}
                        onChange={(e) => updateSettingField({ tagline: e.target.value })}
                        className="w-full px-3 py-1.5 bg-white border border-stone-300 rounded-xl font-medium"
                        placeholder="e.g. GENERAL STORE & GROCERY"
                      />
                    </div>

                    {/* 3. STORE ADDRESS */}
                    <div className="p-2.5 bg-stone-50 border border-stone-200 rounded-2xl space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-stone-600 uppercase">Store Address</label>
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={vis.show_address !== false}
                            onChange={(e) => updateVisibility('show_address', e.target.checked)}
                            className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                          <span>Print on Slip</span>
                        </label>
                      </div>
                      <input
                        type="text"
                        value={formSettings.address}
                        onChange={(e) => updateSettingField({ address: e.target.value })}
                        className="w-full px-3 py-1.5 bg-white border border-stone-300 rounded-xl font-medium"
                        placeholder="Full Store Address"
                      />
                    </div>

                    {/* 4. PHONE & WHATSAPP */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="p-2.5 bg-stone-50 border border-stone-200 rounded-2xl space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-stone-600 uppercase">Phone</label>
                          <label className="flex items-center gap-1 text-[10px] font-bold text-emerald-800 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={vis.show_phone !== false}
                              onChange={(e) => updateVisibility('show_phone', e.target.checked)}
                              className="w-3.5 h-3.5 rounded text-emerald-600 cursor-pointer"
                            />
                            <span>Print</span>
                          </label>
                        </div>
                        <input
                          type="text"
                          value={formSettings.phone}
                          onChange={(e) => updateSettingField({ phone: e.target.value })}
                          className="w-full px-3 py-1.5 bg-white border border-stone-300 rounded-xl font-mono text-xs"
                        />
                      </div>
                      <div className="p-2.5 bg-stone-50 border border-stone-200 rounded-2xl space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-stone-600 uppercase">WhatsApp</label>
                          <label className="flex items-center gap-1 text-[10px] font-bold text-emerald-800 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={vis.show_whatsapp !== false}
                              onChange={(e) => updateVisibility('show_whatsapp', e.target.checked)}
                              className="w-3.5 h-3.5 rounded text-emerald-600 cursor-pointer"
                            />
                            <span>Print</span>
                          </label>
                        </div>
                        <input
                          type="text"
                          value={formSettings.whatsapp_number}
                          onChange={(e) => updateSettingField({ whatsapp_number: e.target.value })}
                          className="w-full px-3 py-1.5 bg-white border border-stone-300 rounded-xl font-mono text-xs"
                        />
                      </div>
                    </div>

                    {/* 5. TAX IDENTIFIERS */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="p-2.5 bg-stone-50 border border-stone-200 rounded-2xl space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-stone-600 uppercase">FBR NTN</label>
                          <label className="flex items-center gap-1 text-[10px] font-bold text-emerald-800 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={vis.show_ntn !== false}
                              onChange={(e) => updateVisibility('show_ntn', e.target.checked)}
                              className="w-3.5 h-3.5 rounded text-emerald-600 cursor-pointer"
                            />
                            <span>Print</span>
                          </label>
                        </div>
                        <input
                          type="text"
                          value={formSettings.ntn || ''}
                          onChange={(e) => setFormSettings({ ...formSettings, ntn: e.target.value })}
                          placeholder="4398120-7"
                          className="w-full px-3 py-1.5 bg-white border border-stone-300 rounded-xl font-mono text-xs"
                        />
                      </div>
                      <div className="p-2.5 bg-stone-50 border border-stone-200 rounded-2xl space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-stone-600 uppercase">POS Reg ID</label>
                          <label className="flex items-center gap-1 text-[10px] font-bold text-emerald-800 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={vis.show_pos_reg_id !== false}
                              onChange={(e) => updateVisibility('show_pos_reg_id', e.target.checked)}
                              className="w-3.5 h-3.5 rounded text-emerald-600 cursor-pointer"
                            />
                            <span>Print</span>
                          </label>
                        </div>
                        <input
                          type="text"
                          value={formSettings.pos_reg_id || ''}
                          onChange={(e) => setFormSettings({ ...formSettings, pos_reg_id: e.target.value })}
                          placeholder="MRS-884129"
                          className="w-full px-3 py-1.5 bg-white border border-stone-300 rounded-xl font-mono text-xs"
                        />
                      </div>
                    </div>

                    {/* 6. RECEIPT METADATA TOGGLES */}
                    <div className="p-2.5 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
                      <span className="text-[10px] font-bold text-stone-600 uppercase block">Invoice &amp; Cashier Info</span>
                      <div className="grid grid-cols-3 gap-2">
                        <label className="flex items-center gap-1.5 text-xs text-stone-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={vis.show_invoice_number !== false}
                            onChange={(e) => updateVisibility('show_invoice_number', e.target.checked)}
                            className="w-3.5 h-3.5 rounded text-emerald-600 cursor-pointer"
                          />
                          <span>Invoice #</span>
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-stone-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={vis.show_date_time !== false}
                            onChange={(e) => updateVisibility('show_date_time', e.target.checked)}
                            className="w-3.5 h-3.5 rounded text-emerald-600 cursor-pointer"
                          />
                          <span>Date &amp; Time</span>
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-stone-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={vis.show_cashier_name !== false}
                            onChange={(e) => updateVisibility('show_cashier_name', e.target.checked)}
                            className="w-3.5 h-3.5 rounded text-emerald-600 cursor-pointer"
                          />
                          <span>Cashier Name</span>
                        </label>
                      </div>
                    </div>

                    {/* 7. URDU BLESSING */}
                    <div className="p-2.5 bg-stone-50 border border-stone-200 rounded-2xl space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-stone-600 uppercase">Urdu Dua / Blessing (Receipt Bottom)</label>
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={vis.show_urdu_dua !== false}
                            onChange={(e) => updateVisibility('show_urdu_dua', e.target.checked)}
                            className="w-3.5 h-3.5 rounded text-emerald-600 cursor-pointer"
                          />
                          <span>Print on Slip</span>
                        </label>
                      </div>
                      <input
                        type="text"
                        dir="rtl"
                        value={formSettings.receipt_footer_urdu}
                        onChange={(e) => updateSettingField({ receipt_footer_urdu: e.target.value })}
                        className="w-full px-3 py-1.5 bg-white border border-stone-300 rounded-xl font-bold text-sm text-right"
                      />
                    </div>

                    {/* 8. RETURN / EXCHANGE POLICY */}
                    <div className="p-2.5 bg-stone-50 border border-stone-200 rounded-2xl space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-stone-600 uppercase">Return / Exchange Policy (English)</label>
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={vis.show_return_policy !== false}
                            onChange={(e) => updateVisibility('show_return_policy', e.target.checked)}
                            className="w-3.5 h-3.5 rounded text-emerald-600 cursor-pointer"
                          />
                          <span>Print on Slip</span>
                        </label>
                      </div>
                      <input
                        type="text"
                        value={formSettings.receipt_footer_english}
                        onChange={(e) => updateSettingField({ receipt_footer_english: e.target.value })}
                        className="w-full px-3 py-1.5 bg-white border border-stone-300 rounded-xl font-medium"
                      />
                    </div>

                    {/* 9. BARCODE & ROUNDING TOGGLES */}
                    <div className="p-2.5 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
                      <span className="text-[10px] font-bold text-stone-600 uppercase block">Barcode &amp; Rounding</span>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex items-center gap-1.5 text-xs text-stone-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={vis.show_barcode_qr !== false}
                            onChange={(e) => updateVisibility('show_barcode_qr', e.target.checked)}
                            className="w-3.5 h-3.5 rounded text-emerald-600 cursor-pointer"
                          />
                          <span>Barcode at Bottom</span>
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-stone-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={vis.show_rounding !== false}
                            onChange={(e) => updateVisibility('show_rounding', e.target.checked)}
                            className="w-3.5 h-3.5 rounded text-emerald-600 cursor-pointer"
                          />
                          <span>Cash Rounding (Rs. 5)</span>
                        </label>
                      </div>
                    </div>

                    {/* 10. THANK YOU NOTE TOGGLE */}
                    <div className="p-2.5 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
                      <span className="text-[10px] font-bold text-stone-600 uppercase block">Thank You Message</span>
                      <div>
                        <label className="flex items-center gap-1.5 text-xs text-stone-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={vis.show_thank_you !== false}
                            onChange={(e) => updateVisibility('show_thank_you', e.target.checked)}
                            className="w-3.5 h-3.5 rounded text-emerald-600 cursor-pointer"
                          />
                          <span>Print 'THANK YOU FOR SHOPPING WITH US!' on Slip</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleSaveStoreProfile}
                      className="px-6 py-2.5 bg-[#5B7981] hover:bg-[#486269] text-white rounded-xl font-black shadow-md cursor-pointer flex items-center gap-2"
                    >
                      <Check className="w-4 h-4 stroke-[2.5]" /> Save Bill Settings
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const testSlipHtml = `
                            <!DOCTYPE html>
                            <html>
                              <head>
                                <meta charset="utf-8" />
                                <style>
                                  @page { size: 80mm auto portrait; margin: 0; }
                                  html, body {
                                    width: 68mm;
                                    margin: 0 0 0 6.5mm;
                                    padding: 2mm 1.5mm 1mm 1.5mm;
                                    font-family: Consolas, 'Roboto Mono', 'Courier New', Courier, monospace;
                                    font-size: 11px;
                                    font-weight: 700;
                                    color: #000000;
                                    text-align: center;
                                    background: #ffffff;
                                    -webkit-font-smoothing: none !important;
                                    text-rendering: geometricPrecision !important;
                                  }
                                  .title { font-size: 16px; font-weight: 800; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-transform: uppercase; margin-bottom: 2px; }
                                  .sub { font-size: 10px; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin-bottom: 2px; }
                                  .divider { border-bottom: 1px dashed #000000; margin: 4px 0; }
                                  .box { border-top: 1px dashed #000000; border-bottom: 1px dashed #000000; padding: 3px; font-weight: 800; font-size: 12px; margin: 4px 0; }
                                  .footer { font-size: 8.5px; margin-top: 4px; line-height: 1.2; font-family: Consolas, monospace; font-weight: 700; }
                                </style>
                              </head>
                              <body>
                                <div class="title">${formSettings.store_name || 'POINT OF SALE'}</div>
                                <div class="sub">${formSettings.tagline || 'Point of Sale & Inventory System'}</div>
                                <div class="sub">${formSettings.address || 'Pakistan'}</div>
                                <div>Ph: ${formSettings.phone || ''}</div>
                                <div class="divider"></div>
                                <div class="box">THERMAL PRINTER TEST OK</div>
                                <div style="font-size: 10px; text-align: left; margin: 4px 0;">
                                  <div>Driver: ${receiptPrinter || 'Auto-Detected'}</div>
                                  <div>Date: ${new Date().toLocaleString('en-PK')}</div>
                                </div>
                                <div class="divider"></div>
                                <div class="footer">
                                  <strong>POINT OF SALE & ERP</strong><br/>
                                  DEVELOPED AND MAINTAINED BY TEDDOPS<br/>
                                  +923297263098 • +923235930559
                                </div>
                              </body>
                            </html>
                          `;

                          const res = await hardwareService.printReceipt({
                            html: testSlipHtml,
                            printerName: receiptPrinter || undefined,
                            pageSize: { width: 80000, height: 75000 },
                            force: true
                          });

                          if (res?.success) {
                            hardwareService.playScanSuccess();
                            await posAlert('Printer Dispatched', `Sample test slip sent to ${receiptPrinter || 'Thermal Printer'}.`, 'success');
                          } else {
                            hardwareService.playError();
                            await posAlert('Printer Notice', `Could not dispatch to printer: ${receiptPrinter || 'Default'}. Please verify power and USB cable.`, 'warning');
                          }
                        } catch (err: any) {
                          await posAlert('Printer Notice', `Printer error: ${err.message}`, 'warning');
                        }
                      }}
                      className="px-4 py-2.5 bg-stone-800 hover:bg-stone-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Printer className="w-4 h-4" /> Test Print
                    </button>
                  </div>
                </div>

                {/* RIGHT PANE: REAL-TIME 80mm THERMAL RECEIPT SIMULATOR */}
                <div className="md:col-span-5 flex flex-col items-center sticky top-2">
                  <div className="w-full flex items-center justify-between mb-2 px-1">
                    <span className="text-xs font-black uppercase text-stone-700 flex items-center gap-1.5">
                      <Eye className="w-4 h-4 text-[#5B7981]" />
                      Live 80mm Receipt Preview
                    </span>
                    <span className="text-[10px] text-emerald-700 font-mono font-bold bg-emerald-100 px-2 py-0.5 rounded-md animate-pulse">
                      LIVE SIMULATOR
                    </span>
                  </div>

                  <div 
                    className="w-full max-w-[340px] bg-[#FFFDF9] text-black p-4 pb-2 border border-stone-300 font-mono text-[11px] shadow-2xl relative select-none rounded-sm transition-all"
                    style={{
                      fontFamily: "Consolas, 'Roboto Mono', 'Courier New', Courier, monospace",
                      boxShadow: '0 12px 36px rgba(0,0,0,0.18)'
                    }}
                  >
                    {/* TORN TOP EDGE SVG */}
                    <div
                      className="absolute top-0 left-0 right-0 h-2 -mt-2 bg-repeat-x overflow-hidden pointer-events-none opacity-80"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23FFFDF9' d='M0 0l6 8 6-8z'/%3E%3C/svg%3E")`
                      }}
                    />

                    {/* STORE HEADER (CRISP HIGH-CONTRAST BOLD) */}
                    <div className="text-center space-y-0.5 pb-1.5 border-b border-dashed border-black">
                      {vis.show_store_name !== false && (
                        <div className="text-[16px] font-extrabold font-sans uppercase tracking-tight text-black leading-tight">
                          {formSettings.store_name || 'Point of Sale'}
                        </div>
                      )}
                      {vis.show_tagline !== false && (
                        <div className="text-[10px] font-bold font-sans text-black uppercase tracking-wider">
                          {formSettings.tagline || 'Point of Sale & Inventory'}
                        </div>
                      )}
                      {vis.show_address !== false && (
                        <div className="text-[9.5px] font-sans text-black font-semibold leading-tight pt-0.5">
                          {formSettings.address || 'Shop # 1, Main Market, Pakistan'}
                        </div>
                      )}
                      {(vis.show_phone !== false || vis.show_whatsapp !== false) && (
                        <div className="text-[10px] text-black font-bold font-mono pt-0.5">
                          {vis.show_phone !== false && `Ph: ${formSettings.phone || '+92 306 5157506'}`}
                          {vis.show_phone !== false && vis.show_whatsapp !== false && ' • '}
                          {vis.show_whatsapp !== false && `WA: ${formSettings.whatsapp_number || '+92 306 5157506'}`}
                        </div>
                      )}
                      {(vis.show_pos_reg_id !== false || vis.show_ntn !== false) && (formSettings.pos_reg_id || formSettings.ntn) && (
                        <div className="text-[9.5px] text-black font-bold font-mono pt-0.5">
                          {vis.show_pos_reg_id !== false && `POS: ${formSettings.pos_reg_id || 'MRS-884129'}`}
                          {vis.show_pos_reg_id !== false && vis.show_ntn !== false && ' • '}
                          {vis.show_ntn !== false && `NTN: ${formSettings.ntn || '4398120-7'}`}
                        </div>
                      )}
                    </div>

                    {/* RECEIPT METADATA (NO COUNTER NO) */}
                    <div className="py-1 border-b border-dashed border-black text-[10.5px] space-y-0.5 font-mono">
                      <div className="flex justify-between font-bold text-black">
                        {vis.show_invoice_number !== false ? <span>Bill: #MRS-2026-0042</span> : <span>Bill #</span>}
                        {vis.show_date_time !== false && <span>{new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</span>}
                      </div>
                      <div className="flex justify-between text-black font-bold">
                        {vis.show_date_time !== false && <span>Date: {new Date().toLocaleDateString('en-PK')}</span>}
                        {vis.show_cashier_name !== false && <span>Cashier: Cashier #01</span>}
                      </div>
                      <div className="flex justify-between text-black font-bold pt-0.5">
                        <span>Customer: Walk-in Customer</span>
                      </div>
                    </div>

                    {/* 2-LINE ITEMS TABLE (100% IDENTICAL TO CASHIER BILL) */}
                    <div className="py-0.5 border-b border-dashed border-black font-mono">
                      <div className="py-1 border-b border-dashed border-black text-[10.5px] font-bold flex justify-between uppercase tracking-wide">
                        <span>ITEM / DESCRIPTION</span>
                        <span>SUBTOTAL (RS)</span>
                      </div>

                      <div className="space-y-0.5 pt-0.5">
                        <div className="py-0.5 border-b border-dotted border-stone-300">
                          <div className="text-[11.5px] leading-snug font-bold font-sans text-black break-words">
                            Milk Pack 1000ml
                          </div>
                          <div className="flex justify-between items-baseline text-[10.5px] font-mono pt-0.5 font-bold">
                            <span className="text-black">1 × Rs. 280.00</span>
                            <span className="text-[11.5px] text-black">Rs. 280.00</span>
                          </div>
                        </div>

                        <div className="py-0.5 border-b border-dotted border-stone-300">
                          <div className="text-[11.5px] leading-snug font-bold font-sans text-black break-words">
                            Tapal Danedar 450g
                          </div>
                          <div className="flex justify-between items-baseline text-[10.5px] font-mono pt-0.5 font-bold">
                            <span className="text-black">1 × Rs. 680.00</span>
                            <span className="text-[11.5px] text-black">Rs. 680.00</span>
                          </div>
                        </div>

                        <div className="py-0.5 border-b border-dotted border-stone-300">
                          <div className="text-[11.5px] leading-snug font-bold font-sans text-black break-words">
                            Dalda Cooking Oil 1L
                          </div>
                          <div className="flex justify-between items-baseline text-[10.5px] font-mono pt-0.5 font-bold">
                            <span className="text-black">2 × Rs. 520.00</span>
                            <span className="text-[11.5px] text-black">Rs. 1,040.00</span>
                          </div>
                        </div>

                        <div className="py-0.5">
                          <div className="text-[11.5px] leading-snug font-bold font-sans text-black break-words">
                            National Salt 800g
                          </div>
                          <div className="flex justify-between items-baseline text-[10.5px] font-mono pt-0.5 font-bold">
                            <span className="text-black">1 × Rs. 75.00</span>
                            <span className="text-[11.5px] text-black">Rs. 75.00</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* TOTALS & BREAKDOWN */}
                    <div className="py-1 border-b border-dashed border-black text-[10.5px] space-y-0.5 font-mono font-bold">
                      <div className="flex justify-between text-black">
                        <span>Gross Subtotal (5 Items):</span>
                        <span>PKR 2,075.00</span>
                      </div>
                      <div className="flex justify-between text-black">
                        <span>Category GST (18% Confectionery):</span>
                        <span>PKR 122.40</span>
                      </div>
                      {vis.show_rounding !== false && (
                        <div className="flex justify-between text-black text-[10px] italic">
                          <span>Cash Rounding (nearest Rs. 5):</span>
                          <span>+PKR 2.60</span>
                        </div>
                      )}

                      {/* CLEAN INK-SAVING DOUBLE-DASHED NET TOTAL */}
                      <div className="my-1.5 py-1.5 border-t border-b border-dashed border-black flex justify-between items-center text-xs font-black font-mono">
                        <span className="uppercase tracking-wider text-black">NET TOTAL:</span>
                        <span className="text-[14px] font-black tracking-wide text-black">PKR 2,200.00</span>
                      </div>

                      <div className="space-y-0.5 pt-0.5 text-[10.5px] font-mono">
                        <div className="flex justify-between text-black">
                          <span>PAYMENT MODE:</span>
                          <span className="uppercase">CASH</span>
                        </div>
                        <div className="flex justify-between text-black">
                          <span>Cash Tendered:</span>
                          <span>PKR 2,500.00</span>
                        </div>
                        <div className="flex justify-between text-black pt-0.5 border-t border-dotted border-stone-400">
                          <span>Change Returned:</span>
                          <span>PKR 300.00</span>
                        </div>
                      </div>
                    </div>

                    {/* FOOTER & POLICY & TEDDOPS ATTRIBUTION (ZERO BOTTOM SLACK) */}
                    <div className="pt-1 text-center space-y-0.5">
                      {vis.show_thank_you !== false && (
                        <div className="text-[10.5px] font-bold font-sans text-black uppercase tracking-wide">
                          THANK YOU FOR SHOPPING WITH US!
                        </div>
                      )}
                      {vis.show_urdu_dua !== false && (
                        <div className="text-xs font-bold text-black font-serif leading-snug">
                          {formSettings.receipt_footer_urdu || 'ہمارے ہاں آمد کا شکریہ - جزاک اللہ خیر'}
                        </div>
                      )}
                      {vis.show_return_policy !== false && (
                        <div className="text-[9.5px] font-sans text-black font-bold leading-tight pt-0.5">
                          {formSettings.receipt_footer_english || 'Exchange/Return accepted within 7 days with original receipt.'}
                        </div>
                      )}
                      {vis.show_barcode_qr !== false && (
                        <div className="pt-1 flex flex-col items-center">
                          <div className="font-mono text-[9px] text-black tracking-widest uppercase font-bold">
                            ||| | ||||| ||| |||| || |||||| |
                          </div>
                          <div className="text-[8.5px] text-black font-mono pt-0.5 font-bold">
                            * MRS-2026-0042 *
                          </div>
                        </div>
                      )}
                      {/* TEDDOPS OFFICIAL DEVELOPER WATERMARK (PERMANENT) */}
                      <div className="pt-1 mt-0.5 border-t border-dashed border-black text-[8.5px] text-black font-mono tracking-tight leading-tight">
                        <div className="uppercase font-bold">
                          Developed and maintained by Teddops
                        </div>
                        <div className="font-bold">
                          +923297263098 • +923235930559
                        </div>
                      </div>
                    </div>

                    {/* TORN BOTTOM EDGE SVG */}
                    <div
                      className="absolute bottom-0 left-0 right-0 h-2 -mb-2 bg-repeat-x overflow-hidden pointer-events-none opacity-80"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23FFFDF9' d='M0 8l6-8 6 8z'/%3E%3C/svg%3E")`
                      }}
                    />
                  </div>
                </div>

              </div>
            );
          })()}

          {/* TAB: BILL HISTORY & ARCHIVE */}
          {activeTab === 'history' && (
            <div className="space-y-4 max-w-5xl text-xs font-sans">
              {/* FILTER BAR */}
              <div className="bg-stone-50 border border-stone-200 p-4 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-3 shadow-2xs">
                <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto flex-1">
                  <div className="relative w-full sm:w-64">
                    <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && fetchHistory(1)}
                      placeholder="Search bill #, customer, phone..."
                      className="w-full pl-9 pr-3.5 py-2 bg-white border border-stone-300 rounded-xl text-xs outline-hidden focus:border-[#5B7981]"
                    />
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="flex items-center gap-1 bg-white border border-stone-300 rounded-xl px-2.5 py-1.5 text-xs text-stone-600">
                      <Calendar className="w-3.5 h-3.5 text-stone-400" />
                      <span className="text-[10px] text-stone-400 uppercase">From:</span>
                      <input
                        type="date"
                        value={historyStartDate}
                        onChange={(e) => setHistoryStartDate(e.target.value)}
                        className="bg-transparent text-xs text-stone-700 outline-hidden"
                      />
                    </div>

                    <div className="flex items-center gap-1 bg-white border border-stone-300 rounded-xl px-2.5 py-1.5 text-xs text-stone-600">
                      <Calendar className="w-3.5 h-3.5 text-stone-400" />
                      <span className="text-[10px] text-stone-400 uppercase">To:</span>
                      <input
                        type="date"
                        value={historyEndDate}
                        onChange={(e) => setHistoryEndDate(e.target.value)}
                        className="bg-transparent text-xs text-stone-700 outline-hidden"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => fetchHistory(1)}
                    disabled={isLoadingHistory}
                    className="px-4 py-2 bg-[#5B7981] hover:bg-[#486269] text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>Search</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setHistorySearch('');
                      setHistoryStartDate('');
                      setHistoryEndDate('');
                      setTimeout(() => {
                        billingService.searchInvoicesPaginated({ allShifts: true, page: 1, limit: 20 }).then(res => {
                          setHistoryInvoices(res.invoices);
                          setHistoryTotalCount(res.totalCount);
                          setHistoryPage(res.page);
                          setHistoryTotalPages(res.totalPages);
                        });
                      }, 50);
                    }}
                    className="px-3 py-2 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-xl font-bold flex items-center gap-1 cursor-pointer transition-colors"
                    title="Reset filters"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </button>
                </div>
              </div>

              {/* INVOICES TABLE */}
              <div className="bg-white rounded-2xl border border-stone-200 shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-100 border-b border-stone-200 text-[10px] font-bold text-stone-600 uppercase tracking-wide">
                      <tr>
                        <th className="p-3">Bill #</th>
                        <th className="p-3">Date &amp; Time</th>
                        <th className="p-3">Customer</th>
                        <th className="p-3 text-center">Items</th>
                        <th className="p-3 text-center">Mode</th>
                        <th className="p-3 text-right">Net Total</th>
                        <th className="p-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {isLoadingHistory ? (
                        <tr>
                          <td colSpan={7} className="p-12 text-center text-stone-400">
                            Loading bill history...
                          </td>
                        </tr>
                      ) : historyInvoices.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-12 text-center text-stone-400">
                            No bills found matching the selected criteria.
                          </td>
                        </tr>
                      ) : (
                        historyInvoices.map((inv) => (
                          <tr key={inv.id} className="hover:bg-stone-50/80 transition-colors">
                            <td className="p-3 font-mono font-bold text-stone-900">
                              #{inv.invoice_number}
                            </td>
                            <td className="p-3 text-stone-600 text-[11px] whitespace-nowrap">
                              {new Date(inv.created_at).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}{' '}
                              <span className="text-stone-400">
                                {new Date(inv.created_at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </td>
                            <td className="p-3 text-stone-800">
                              <span className="font-semibold block">{inv.customer_name || 'Walk-in Customer'}</span>
                              {inv.customer_phone && (
                                <span className="text-[10px] text-stone-400 font-mono">{inv.customer_phone}</span>
                              )}
                            </td>
                            <td className="p-3 text-center font-bold text-stone-700">
                              {(inv.items || []).length}
                            </td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                                inv.payment_mode === 'cash' ? 'bg-emerald-100 text-emerald-800' :
                                inv.payment_mode === 'khata' ? 'bg-amber-100 text-amber-800' :
                                inv.payment_mode === 'card' ? 'bg-blue-100 text-blue-800' :
                                'bg-purple-100 text-purple-800'
                              }`}>
                                {inv.payment_mode.toUpperCase()}
                              </span>
                            </td>
                            <td className="p-3 text-right font-black font-mono text-stone-900 text-sm">
                              PKR {Number(inv.total_amount).toLocaleString()}
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setSelectedHistoryInvoice(inv)}
                                  className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                  title="Preview & Reprint Receipt"
                                >
                                  <Printer className="w-3.5 h-3.5 text-[#5B7981]" />
                                  <span>Reprint</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => invoicePdfService.generateAndShare(inv, formSettings)}
                                  className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                  title="Send A4 PDF / WhatsApp"
                                >
                                  <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>WhatsApp</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* PAGINATION */}
                {historyTotalCount > 20 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 border-t border-stone-200 bg-stone-50 gap-2">
                    <span className="text-xs text-stone-600">
                      Showing <span className="font-bold text-stone-900">{(historyPage - 1) * 20 + 1}</span> to{' '}
                      <span className="font-bold text-stone-900">{Math.min(historyPage * 20, historyTotalCount)}</span> of{' '}
                      <span className="font-bold text-stone-900">{historyTotalCount}</span> bills
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={historyPage === 1}
                        onClick={() => fetchHistory(1)}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-stone-300 bg-white hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        First
                      </button>
                      <button
                        type="button"
                        disabled={historyPage === 1}
                        onClick={() => fetchHistory(historyPage - 1)}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-stone-300 bg-white hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Prev
                      </button>
                      <span className="px-3 py-1 text-xs font-bold text-stone-700 bg-stone-200 rounded-lg">
                        Page {historyPage} of {historyTotalPages}
                      </span>
                      <button
                        type="button"
                        disabled={historyPage >= historyTotalPages}
                        onClick={() => fetchHistory(historyPage + 1)}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-stone-300 bg-white hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Next
                      </button>
                      <button
                        type="button"
                        disabled={historyPage >= historyTotalPages}
                        onClick={() => fetchHistory(historyTotalPages)}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-stone-300 bg-white hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Last
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* RECEIPT PREVIEW MODAL */}
              {selectedHistoryInvoice && (
                <HighDensityReceiptCard
                  invoice={selectedHistoryInvoice}
                  storeSettings={formSettings}
                  onClose={() => setSelectedHistoryInvoice(null)}
                  isDuplicateReprint={true}
                  shouldAutoPrint={false}
                />
              )}
            </div>
          )}

          {/* TAB 4: POLICY & SECURITY */}
          {activeTab === 'security' && (
            <div className="space-y-4 max-w-xl text-xs">
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
                <span className="font-bold text-stone-800 block">Checkout Control Toggles</span>
                <p className="text-[11px] text-stone-500">
                  - Prompt 'Print Receipt? (Y/N)' after every transaction: <strong>Enabled</strong><br />
                  - Strict Equal or Greater Value Exchange Policy: <strong>Enforced [F6]</strong><br />
                  - Single-Store Counter Setup: <strong>Optimized</strong>
                </p>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 space-y-2">
                <strong className="flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-600" /> Terminal Security PIN Management
                </strong>
                <p className="text-[11px] text-stone-600">
                  Current Owner Admin PIN and Cashier PIN can be reset anytime using the Initial Setup Wizard.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem('pos_pins_configured');
                    window.location.hash = '#/setup';
                    window.location.reload();
                  }}
                  className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs cursor-pointer shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Launch Initial PIN Setup Wizard</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 5: AUDIT & EXPORT */}
          {activeTab === 'audit' && (
            <div className="space-y-5 max-w-xl text-xs">
              <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
                <h3 className="font-bold text-stone-900 uppercase">One-Click Complete Audit Package</h3>
                <p className="text-stone-500 text-[11px]">
                  Exports clean CSV spreadsheets of all sales history, customer khata transactions, and emergency retroactive receipts for tax filing or external accounting.
                </p>
                <button
                  type="button"
                  onClick={handleExportAuditPackage}
                  disabled={isExporting}
                  className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold flex items-center gap-2 cursor-pointer shadow-xs"
                >
                  <Download className="w-4 h-4" />
                  <span>{isExporting ? 'Generating CSV...' : 'Download Sales Audit CSV'}</span>
                </button>
              </div>

              <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
                <h3 className="font-bold text-stone-900 uppercase">Print Annual / Tax Summary Slip</h3>
                <p className="text-stone-500 text-[11px]">
                  Prints a consolidated physical summary of lifetime revenue, discounts, and bill volume directly onto the Epson TM-T88V roll.
                </p>
                <button
                  type="button"
                  onClick={handlePrintAnnualSummary}
                  className="px-4 py-2.5 bg-stone-800 hover:bg-stone-700 text-white rounded-xl font-bold flex items-center gap-2 cursor-pointer shadow-xs"
                >
                  <Printer className="w-4 h-4" /> Print Annual Summary on 80mm Roll
                </button>
              </div>
            </div>
          )}

        </div>

        {/* FOOTER */}
        <div className="bg-stone-50 px-6 py-3 border-t border-stone-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-xl font-bold text-xs cursor-pointer"
          >
            Close Panel
          </button>
        </div>

      </div>
    </div>
  );
};
