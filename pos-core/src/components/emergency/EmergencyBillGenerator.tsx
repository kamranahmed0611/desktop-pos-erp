import React, { useState, useEffect, useRef } from 'react';
import { Invoice, PaymentMode, StoreSettings } from '../../types';
import { emergencyBillService, RetroactiveItemInput } from '../../services/emergencyBillService';
import { catalogService } from '../../services/catalogService';
import { hardwareService } from '../../services/hardwareService';
import { HighDensityReceiptCard } from './HighDensityReceiptCard';
import { QuickAddItemModal } from '../billing/QuickAddItemModal';
import { posAlert, posConfirm } from '../../store/uiStore';
import { AdminPinPromptModal } from '../common/AdminPinPromptModal';
import { 
  FileText, Plus, Trash2, Calendar, User, Phone, 
  CreditCard, ShieldAlert, Sparkles, Share2, Printer, Search, RefreshCw, CheckCircle,
  Barcode, X
} from 'lucide-react';

interface EmergencyBillGeneratorProps {
  storeSettings: StoreSettings;
}

export const EmergencyBillGenerator: React.FC<EmergencyBillGeneratorProps> = ({ storeSettings }) => {
  // Form State
  const [customDate, setCustomDate] = useState(() => {
    const now = new Date();
    // format as YYYY-MM-DDTHH:mm
    return now.toISOString().slice(0, 16);
  });
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [isManualInvoiceNum, setIsManualInvoiceNum] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [paidAmount, setPaidAmount] = useState<number | ''>('');
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [deductInventory, setDeductInventory] = useState(false);
  const [addToDrawer, setAddToDrawer] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [cashierName, setCashierName] = useState('Store Owner');
  const [notes, setNotes] = useState('');

  // Line items state (100% Freeform text rows)
  const [items, setItems] = useState<RetroactiveItemInput[]>([
    { name: '', qty: 1, unit_price: 0, subtotal: 0 }
  ]);

  // Catalog quick search &amp; barcode scanner helper
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogSuggestions, setCatalogSuggestions] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [prefixMultiplier, setPrefixMultiplier] = useState<number | null>(null);

  // Quick Add Item Modal state
  const [isQuickAddModalOpen, setIsQuickAddModalOpen] = useState(false);
  const [pendingQuickAddCode, setPendingQuickAddCode] = useState('');
  const [pendingMultiplier, setPendingMultiplier] = useState(1);

  // Generated bill modal
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  // Recent Invoices list
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Live Settings Synchronizer: immediately reflects changes made in Admin Settings Modal without needing refresh/tab switch
  const [liveSettings, setLiveSettings] = useState<StoreSettings>(() => {
    try {
      const saved = localStorage.getItem('pos_store_settings');
      if (saved) return { ...storeSettings, ...JSON.parse(saved) };
    } catch {}
    return storeSettings;
  });

  useEffect(() => {
    setLiveSettings(storeSettings);
  }, [storeSettings]);

  useEffect(() => {
    const handleSettingsUpdate = () => {
      try {
        const saved = localStorage.getItem('pos_store_settings');
        if (saved) setLiveSettings(prev => ({ ...prev, ...JSON.parse(saved) }));
      } catch {}
    };
    window.addEventListener('storage', handleSettingsUpdate);
    window.addEventListener('pos_settings_updated', handleSettingsUpdate);
    return () => {
      window.removeEventListener('storage', handleSettingsUpdate);
      window.removeEventListener('pos_settings_updated', handleSettingsUpdate);
    };
  }, []);

  // Auto-generate invoice number whenever date changes if not manual
  useEffect(() => {
    if (!isManualInvoiceNum) {
      emergencyBillService.generateNextInvoiceNumber(customDate).then(num => {
        setInvoiceNumber(num);
      });
    }
  }, [customDate, isManualInvoiceNum]);

  // Load recent invoices
  const loadRecent = async () => {
    setIsLoading(true);
    try {
      const list = await emergencyBillService.getRecentInvoices(20);
      setRecentInvoices(list);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRecent();

    // Live Cross-Tab &amp; Cross-Window Database Synchronization
    let unsubElectron: (() => void) | undefined;
    if ((window as any).electronAPI?.onBroadcast) {
      unsubElectron = (window as any).electronAPI.onBroadcast('db-change', () => loadRecent());
    }
    const handleDbChange = () => loadRecent();
    window.addEventListener('pos-db-change', handleDbChange);
    const handleStorageSync = (e: StorageEvent) => {
      if (e.key === 'pos_db_sync') loadRecent();
    };
    window.addEventListener('storage', handleStorageSync);

    return () => {
      if (unsubElectron) unsubElectron();
      window.removeEventListener('pos-db-change', handleDbChange);
      window.removeEventListener('storage', handleStorageSync);
    };
  }, []);

  // Line items handlers
  const handleItemChange = (index: number, field: keyof RetroactiveItemInput, value: any) => {
    const updated = [...items];
    const item = { ...updated[index], [field]: value };
    if (field === 'qty' || field === 'unit_price') {
      const q = field === 'qty' ? Number(value) || 0 : item.qty;
      const p = field === 'unit_price' ? Number(value) || 0 : item.unit_price;
      item.subtotal = q * p;
    }
    updated[index] = item;
    setItems(updated);
  };

  const addItemRow = () => {
    setItems([...items, { name: '', qty: 1, unit_price: 0, subtotal: 0 }]);
  };

  const removeItemRow = (index: number) => {
    if (items.length <= 1) {
      setItems([{ name: '', qty: 1, unit_price: 0, subtotal: 0 }]);
      return;
    }
    setItems(items.filter((_, idx) => idx !== index));
  };

  const handleCatalogSelect = (prod: any, multiplier: number = 1) => {
    const unitPrice = Number(prod.sale_price || 0);
    const existingIndex = items.findIndex(it => it.name.trim().toLowerCase() === prod.name.trim().toLowerCase());

    if (existingIndex >= 0) {
      const updated = [...items];
      const newQty = (updated[existingIndex].qty || 1) + multiplier;
      updated[existingIndex] = {
        ...updated[existingIndex],
        qty: newQty,
        subtotal: newQty * (updated[existingIndex].unit_price || unitPrice)
      };
      setItems(updated);
    } else {
      if (items.length === 1 && !items[0].name.trim() && items[0].subtotal === 0) {
        setItems([{
          name: prod.name,
          qty: multiplier,
          unit_price: unitPrice,
          subtotal: multiplier * unitPrice
        }]);
      } else {
        setItems(prev => [...prev, {
          name: prod.name,
          qty: multiplier,
          unit_price: unitPrice,
          subtotal: multiplier * unitPrice
        }]);
      }
    }

    setCatalogQuery('');
    setCatalogSuggestions([]);
    setSelectedIndex(-1);
    setPrefixMultiplier(null);
    hardwareService.playScanSuccess();
    barcodeInputRef.current?.focus();
  };

  const searchCatalog = async (q: string) => {
    setCatalogQuery(q);
    let searchStr = q.trim();
    if (searchStr.includes('*')) {
      const parts = searchStr.split('*');
      searchStr = (parts[1] || '').trim();
    }

    if (searchStr.length > 1) {
      const results = await catalogService.searchProducts(searchStr, 6);
      setCatalogSuggestions(results);
      setSelectedIndex(-1);
    } else {
      setCatalogSuggestions([]);
      setSelectedIndex(-1);
    }
  };

  const handleBarcodeOrSearchSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const raw = catalogQuery.trim();
    if (!raw) return;

    let multiplier = prefixMultiplier || 1;
    let codeToSearch = raw;

    if (raw.includes('*')) {
      const parts = raw.split('*');
      const count = parseInt(parts[0], 10);
      if (!isNaN(count) && count > 0) {
        multiplier = count;
        codeToSearch = (parts[1] || '').trim();
      }
    }

    if (!codeToSearch) {
      setPrefixMultiplier(multiplier);
      setCatalogQuery('');
      setCatalogSuggestions([]);
      return;
    }

    // 1. Try exact barcode match first
    try {
      const exact = await catalogService.findByBarcodeOrSku(codeToSearch);
      if (exact) {
        handleCatalogSelect(exact, multiplier);
        return;
      }
    } catch {}

    // 2. Try selected suggestion from dropdown
    if (catalogSuggestions.length > 0) {
      const selected = (selectedIndex >= 0 && selectedIndex < catalogSuggestions.length)
        ? catalogSuggestions[selectedIndex]
        : catalogSuggestions[0];
      handleCatalogSelect(selected, multiplier);
      return;
    }

    // 3. Fallback: search DB directly
    try {
      const results = await catalogService.searchProducts(codeToSearch, 1);
      if (results && results.length > 0) {
        handleCatalogSelect(results[0], multiplier);
        return;
      }
    } catch {}

    // 4. If nothing matched in catalog, offer Quick Add or manual line entry
    if (codeToSearch) {
      hardwareService.playNoticeTone();
      const wantAdd = await posConfirm(
        'Product Not in Catalog',
        `Barcode or item "${codeToSearch}" was not found in your catalog.\n\nWould you like to register this item now with Quick Add?`,
        { confirmText: 'Quick Add Product', cancelText: 'Use As Line Item', alertType: 'warning' }
      );
      if (wantAdd) {
        setPendingQuickAddCode(codeToSearch);
        setPendingMultiplier(multiplier);
        setIsQuickAddModalOpen(true);
        setCatalogQuery('');
        setCatalogSuggestions([]);
        return;
      }

      setItems(prev => {
        if (prev.length === 1 && !prev[0].name.trim()) {
          return [{ name: codeToSearch, qty: multiplier, unit_price: 0, subtotal: 0 }];
        }
        return [...prev, { name: codeToSearch, qty: multiplier, unit_price: 0, subtotal: 0 }];
      });
      setCatalogQuery('');
      setCatalogSuggestions([]);
      setSelectedIndex(-1);
      setPrefixMultiplier(null);
      barcodeInputRef.current?.focus();
    }
  };

  const handleScanInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === '*' || e.code === 'NumpadMultiply') {
      e.preventDefault();
      const val = catalogQuery.trim();
      const num = parseInt(val, 10);
      if (!isNaN(num) && num > 0 && String(num) === val) {
        setPrefixMultiplier(num);
        setCatalogQuery('');
        setCatalogSuggestions([]);
        hardwareService.playNoticeTone();
      } else {
        const cycles = [null, 2, 3, 5, 6, 10, 12];
        const curIdx = cycles.indexOf(prefixMultiplier || null);
        const next = cycles[(curIdx + 1) % cycles.length];
        setPrefixMultiplier(next);
        hardwareService.playNoticeTone();
      }
      return;
    }

    if ((e.ctrlKey && (e.key === 'r' || e.key === 'R')) || e.code === 'NumpadDivide') {
      e.preventDefault();
      setPrefixMultiplier(null);
      setCatalogQuery('');
      setCatalogSuggestions([]);
      hardwareService.playNoticeTone();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (catalogSuggestions.length > 0) {
        setSelectedIndex(prev => (prev + 1) % catalogSuggestions.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (catalogSuggestions.length > 0) {
        setSelectedIndex(prev => (prev - 1 + catalogSuggestions.length) % catalogSuggestions.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleBarcodeOrSearchSubmit();
    } else if (e.key === 'Escape') {
      setCatalogSuggestions([]);
      setSelectedIndex(-1);
      if (prefixMultiplier !== null) {
        setPrefixMultiplier(null);
        hardwareService.playNoticeTone();
      }
    }
  };

  // Calculations
  const grossTotal = items.reduce((sum, it) => sum + (it.subtotal || 0), 0);
  const netPayable = Math.max(0, grossTotal - (discountAmount || 0));

  let finalPayable = netPayable;
  let roundOff = 0;
  if (paymentMode === 'cash') {
    const remainder = netPayable % 5;
    if (remainder !== 0) {
      if (remainder >= 2.5) {
        finalPayable = netPayable + (5 - remainder);
        roundOff = 5 - remainder;
      } else {
        finalPayable = netPayable - remainder;
        roundOff = -remainder;
      }
    }
  }

  const effectivePaid = paidAmount === '' ? finalPayable : Number(paidAmount);
  const changeDue = Math.max(0, effectivePaid - finalPayable);

  // Submit Handler
  const handleGenerateBill = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = items.filter(it => it.name.trim().length > 0 && it.qty > 0);
    if (validItems.length === 0) {
      await posAlert('Item Required', 'Please add at least one line item with a name and price.', 'warning');
      hardwareService.playError();
      return;
    }
    // Require Admin PIN before generating backdated bill
    setIsPinModalOpen(true);
  };

  const executeCreateBill = async () => {
    setIsPinModalOpen(false);
    const validItems = items.filter(it => it.name.trim().length > 0 && it.qty > 0);
    try {
      const invoice = await emergencyBillService.createRetroactiveInvoice({
        invoice_number: invoiceNumber,
        custom_date: new Date(customDate).toISOString(),
        customer_name: customerName.trim() || 'Walk-in Customer',
        customer_phone: customerPhone.trim() || undefined,
        items: validItems,
        discount_amount: discountAmount,
        paid_amount: effectivePaid,
        payment_mode: paymentMode,
        deduct_inventory: deductInventory,
        add_to_drawer: addToDrawer,
        cashier_name: cashierName,
        notes: notes
      });

      hardwareService.playCheckoutChime();
      setSelectedInvoice(invoice);

      // Reset form for next pending bill
      setItems([{ name: '', qty: 1, unit_price: 0, subtotal: 0 }]);
      setCustomerName('');
      setCustomerPhone('');
      setPaidAmount('');
      setDiscountAmount(0);
      setNotes('');
      loadRecent();

      // Immediately increment &amp; update invoice number for next pending bill
      if (!isManualInvoiceNum) {
        const nextNum = await emergencyBillService.generateNextInvoiceNumber(customDate);
        setInvoiceNumber(nextNum);
      }
    } catch (err: any) {
      await posAlert('Error Creating Bill', err.message, 'error');
      hardwareService.playError();
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      
      {/* BANNER */}
      <div className="bg-[#243338] text-white p-5 rounded-3xl shadow-lg border border-stone-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/20 text-amber-300 rounded-full text-xs font-bold font-mono tracking-wide mb-2">
            <Sparkles className="w-3.5 h-3.5" /> DEDICATED EMERGENCY MODE
          </div>
          <h1 className="text-xl sm:text-2xl font-black font-heading tracking-tight">
            PENDING BILLS &amp; DIGITAL RECEIPT GENERATOR
          </h1>
          <p className="text-xs sm:text-sm text-stone-300 mt-1 max-w-2xl">
            Created for tomorrow's handover backlog: backdate receipts to any past date/time, type freeform item rows, 
            bypass physical store stock distortion, and dispatch instant WhatsApp &amp; PDF bills.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-stone-800/80 px-4 py-2.5 rounded-2xl border border-stone-700 text-right">
            <span className="text-[10px] text-stone-400 block font-mono">STOCK SAFETY</span>
            <span className="text-xs font-bold text-emerald-400">
              {deductInventory ? 'Deducting Stock' : 'Protected (No Stock Deduction)'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT / TOP FORM: RAPID BILL CREATOR */}
        <div className="lg:col-span-7 bg-white p-5 sm:p-6 rounded-3xl border border-stone-200 shadow-sm space-y-5">
          <form onSubmit={handleGenerateBill} className="space-y-5">
            
            {/* ROW 1: DATE &amp; INVOICE NUMBER */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#5B7981]" /> Bill Date &amp; Time (Past / Current)
                </label>
                <input
                  type="datetime-local"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-[#5B7981] focus:bg-white outline-hidden"
                  required
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-stone-700">Invoice Number</label>
                  <button
                    type="button"
                    onClick={() => setIsManualInvoiceNum(!isManualInvoiceNum)}
                    className="text-[10px] text-[#5B7981] hover:underline font-bold"
                  >
                    {isManualInvoiceNum ? 'Use Auto Format' : 'Custom Slip #'}
                  </button>
                </div>
                <input
                  type="text"
                  value={invoiceNumber}
                  readOnly={!isManualInvoiceNum}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className={`w-full px-3.5 py-2.5 border rounded-xl text-xs font-mono font-bold outline-hidden ${
                    isManualInvoiceNum 
                      ? 'bg-amber-50/50 border-amber-400 text-stone-900 focus:ring-2 focus:ring-amber-500' 
                      : 'bg-stone-100 border-stone-300 text-stone-600 cursor-not-allowed'
                  }`}
                  placeholder="ALM-20261015-001"
                  required
                />
              </div>
            </div>

            {/* ROW 2: CUSTOMER NAME &amp; PHONE */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-[#5B7981]" /> Customer Name (Optional)
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Haji Muhammad Rafiq"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#5B7981] focus:bg-white outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-[#5B7981]" /> WhatsApp Mobile Phone
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="0300-1234567"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-mono font-medium focus:ring-2 focus:ring-[#5B7981] focus:bg-white outline-hidden"
                />
              </div>
            </div>

            {/* QUICK BARCODE SCANNER &amp; REAL-TIME SEARCH BAR */}
            <div className="relative">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Barcode className="w-4 h-4 text-emerald-600 absolute left-3.5 top-3" />
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    value={catalogQuery}
                    onChange={(e) => searchCatalog(e.target.value)}
                    onKeyDown={handleScanInputKeyDown}
                    placeholder="Scan barcode or type item name... (e.g. 89640001, Olpers, Tapal, 3*barcode)"
                    className="w-full pl-10 pr-32 py-2.5 bg-stone-50 border-2 border-stone-300 focus:border-emerald-600 focus:bg-white rounded-2xl text-xs font-sans font-bold outline-hidden transition-all shadow-2xs"
                  />
                  <div className="absolute right-2.5 top-1.5 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const cycles = [null, 2, 3, 5, 6, 10, 12];
                        const curIdx = cycles.indexOf(prefixMultiplier || null);
                        const next = cycles[(curIdx + 1) % cycles.length];
                        setPrefixMultiplier(next);
                        barcodeInputRef.current?.focus();
                      }}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1 transition-all cursor-pointer ${
                        prefixMultiplier
                          ? 'bg-amber-400 text-stone-950 font-black shadow-xs ring-1 ring-amber-500'
                          : 'bg-stone-200 hover:bg-stone-300 text-stone-700'
                      }`}
                      title="Press Numpad * to toggle multiplier or type number then *"
                    >
                      <span>Qty: {prefixMultiplier || 1}x</span>
                      <span className="opacity-75">[*]</span>
                    </button>

                    {prefixMultiplier && (
                      <button
                        type="button"
                        onClick={() => {
                          setPrefixMultiplier(null);
                          barcodeInputRef.current?.focus();
                        }}
                        className="px-1.5 py-0.5 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg text-[10px] font-mono font-black flex items-center gap-0.5 cursor-pointer shadow-2xs"
                        title="Reset quantity multiplier to 1 [Ctrl+R / Numpad /]"
                      >
                        <span>[Ctrl+R] 1x</span>
                      </button>
                    )}

                    {catalogQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setCatalogQuery('');
                          setCatalogSuggestions([]);
                          setSelectedIndex(-1);
                          barcodeInputRef.current?.focus();
                        }}
                        className="text-stone-400 hover:text-stone-700 cursor-pointer p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleBarcodeOrSearchSubmit()}
                  className="px-3.5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Scan / Add</span>
                </button>
              </div>

              {catalogSuggestions.length > 0 && (
                <div className="absolute z-30 left-0 right-0 mt-1 bg-white border-2 border-emerald-600/40 rounded-2xl shadow-2xl overflow-hidden divide-y divide-stone-100 max-h-60 overflow-y-auto">
                  <div className="px-3 py-1 bg-stone-100 text-[10px] font-bold text-stone-500 uppercase flex justify-between font-mono">
                    <span>{catalogSuggestions.length} Matches (Use ↑ ↓ arrows &amp; Enter)</span>
                    <span>PKR Price • Live Stock</span>
                  </div>
                  {catalogSuggestions.map((prod, idx) => {
                    const isSelected = idx === selectedIndex;
                    return (
                      <div
                        key={prod.id}
                        onClick={() => handleCatalogSelect(prod, prefixMultiplier || 1)}
                        className={`p-2.5 flex justify-between items-center cursor-pointer text-xs transition-colors ${
                          isSelected ? 'bg-emerald-50 text-emerald-950 font-bold' : 'hover:bg-stone-50'
                        }`}
                      >
                        <div>
                          <span className="font-bold text-stone-900 block">{prod.name}</span>
                          <span className="text-[10px] text-stone-500 font-mono">
                            {prod.category} • Barcode: {prod.barcode || prod.sku} • Stock: {prod.stock_qty}
                          </span>
                        </div>
                        <span className="font-bold text-emerald-700 font-mono">Rs. {Number(prod.sale_price).toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* FREEFORM LINE ITEMS TABLE */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-stone-900 uppercase tracking-wide">
                  Line Items ({items.length})
                </span>
                <button
                  type="button"
                  onClick={addItemRow}
                  className="px-3 py-1 bg-[#5B7981]/15 hover:bg-[#5B7981]/25 text-[#5B7981] rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Row
                </button>
              </div>

              <div className="border border-stone-200 rounded-2xl overflow-hidden divide-y divide-stone-200">
                <div className="bg-stone-100 px-3 py-2 text-[10px] font-bold text-stone-600 grid grid-cols-12 gap-2 uppercase">
                  <span className="col-span-6">Item Description</span>
                  <span className="col-span-2 text-center">Qty</span>
                  <span className="col-span-2 text-right">Price (Rs.)</span>
                  <span className="col-span-2 text-right">Total</span>
                </div>

                <div className="max-h-64 overflow-y-auto divide-y divide-stone-100 bg-white">
                  {items.map((it, idx) => (
                    <div key={idx} className="p-2 grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-6">
                        <input
                          type="text"
                          value={it.name}
                          onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                          placeholder="Type item name..."
                          className="w-full px-2.5 py-1.5 border border-stone-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-[#5B7981] outline-hidden"
                          required
                        />
                      </div>

                      <div className="col-span-2">
                        <input
                          type="number"
                          step="any"
                          min="0.1"
                          value={it.qty}
                          onChange={(e) => handleItemChange(idx, 'qty', e.target.value)}
                          className="w-full px-2 py-1.5 border border-stone-300 rounded-lg text-xs text-center font-mono font-bold focus:ring-1 focus:ring-[#5B7981] outline-hidden"
                          required
                        />
                      </div>

                      <div className="col-span-2">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={it.unit_price}
                          onChange={(e) => handleItemChange(idx, 'unit_price', e.target.value)}
                          className="w-full px-2 py-1.5 border border-stone-300 rounded-lg text-xs text-right font-mono font-bold focus:ring-1 focus:ring-[#5B7981] outline-hidden"
                          required
                        />
                      </div>

                      <div className="col-span-2 flex items-center justify-end gap-1.5">
                        <span className="text-xs font-bold font-mono text-stone-900">
                          {(it.subtotal || 0).toLocaleString()}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeItemRow(idx)}
                          className="text-stone-400 hover:text-red-600 p-1 rounded cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* PAYMENT, DISCOUNT &amp; INVENTORY TOGGLE */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Payment Method</label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-900 focus:ring-2 focus:ring-[#5B7981] outline-hidden"
                >
                  <option value="cash">Cash Tender</option>
                  <option value="easypaisa">Easypaisa</option>
                  <option value="jazzcash">JazzCash</option>
                  <option value="card">Bank Card</option>
                  <option value="khata">Customer Khata</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Discount (Rs.)</label>
                <input
                  type="number"
                  min="0"
                  value={discountAmount || ''}
                  onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
                  placeholder="0"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-[#5B7981] outline-hidden text-right"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Cash Tendered (Rs.)</label>
                <input
                  type="number"
                  min="0"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder={String(finalPayable)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-[#5B7981] outline-hidden text-right"
                />
              </div>
            </div>

            {/* DEDUCT INVENTORY TOGGLE GUARD */}
            <div className="p-3 bg-stone-100 rounded-2xl border border-stone-200 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-stone-900 block">Deduct Items from Live Stock?</span>
                <span className="text-[11px] text-stone-500">
                  Default OFF so past pending bills do not decrease current store shelf inventory.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={deductInventory}
                  onChange={(e) => setDeductInventory(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-stone-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#5B7981]"></div>
              </label>
            </div>

            {/* CASH DRAWER LINKAGE TOGGLE (M8.7) */}
            <div className="p-3 bg-stone-100 rounded-2xl border border-stone-200 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-stone-900 block">
                  {addToDrawer ? '[Add to Drawer] Cash Added to Today\'s Register' : '[Past Settlement] Shift-Neutral Retroactive Billing'}
                </span>
                <span className="text-[11px] text-stone-500">
                  {addToDrawer 
                    ? 'Cash received today: added to active shift expected cash and included in shift close blind count.' 
                    : 'Cash was already collected previously: drawer expected cash remains completely unaffected.'}
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={addToDrawer}
                  onChange={(e) => setAddToDrawer(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-stone-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            {/* LIVE TOTALS &amp; SUBMIT BUTTON */}
            <div className="p-4 bg-stone-900 text-white rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-0.5 text-center sm:text-left">
                <div className="text-xs text-stone-400">
                  Gross: Rs. {grossTotal.toLocaleString()} • Discount: Rs. {discountAmount.toLocaleString()}
                  {roundOff !== 0 && <span> • Rounding: {roundOff > 0 ? '+' : ''}Rs. {roundOff}</span>}
                </div>
                <div className="text-xl sm:text-2xl font-black font-mono text-[#E3D5C0]">
                  NET: PKR {finalPayable.toLocaleString()}
                </div>
                {paymentMode === 'cash' && changeDue > 0 && (
                  <div className="text-xs font-bold text-emerald-400">
                    Change Due: Rs. {changeDue.toLocaleString()}
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="w-full sm:w-auto px-6 py-3 bg-[#5B7981] hover:bg-[#486269] text-white rounded-xl text-sm font-black shadow-lg cursor-pointer flex items-center justify-center gap-2 transition-all hover:scale-102"
              >
                <FileText className="w-4 h-4 stroke-[2.5]" /> GENERATE DIGITAL BILL
              </button>
            </div>
          </form>
        </div>

        {/* RIGHT: RECENT DIGITAL BILLS LIST */}
        <div className="lg:col-span-5 bg-white p-5 sm:p-6 rounded-3xl border border-stone-200 shadow-sm flex flex-col space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-stone-200">
            <div>
              <h2 className="text-sm font-bold text-stone-900 uppercase tracking-wide">
                Recent Generated Bills
              </h2>
              <span className="text-[11px] text-stone-500">Fast lookup, re-print &amp; WhatsApp</span>
            </div>
            <button
              onClick={loadRecent}
              className="text-stone-500 hover:text-stone-900 p-1.5 rounded-lg hover:bg-stone-100 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[580px] space-y-2.5 pr-1">
            {recentInvoices.length === 0 ? (
              <div className="p-8 text-center text-stone-400 text-xs">
                No recent bills generated yet. Fill out the form to generate the first bill.
              </div>
            ) : (
              recentInvoices.map((inv) => (
                <div
                  key={inv.id}
                  className="p-3.5 bg-stone-50 hover:bg-stone-100/80 border border-stone-200 rounded-2xl flex flex-col gap-2 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs font-bold font-mono text-stone-900 block">
                        #{inv.invoice_number}
                      </span>
                      <span className="text-[11px] text-stone-600">
                        {inv.customer_name || 'Walk-in'} {inv.customer_phone ? `(${inv.customer_phone})` : ''}
                      </span>
                      <span className="text-[10px] text-stone-400 block font-mono">
                        {new Date(inv.created_at).toLocaleDateString('en-PK')} {new Date(inv.created_at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-black font-mono text-[#5B7981] block">
                        Rs. {inv.total_amount.toLocaleString()}
                      </span>
                      <span className="text-[10px] uppercase font-bold text-stone-500 bg-stone-200 px-1.5 py-0.5 rounded">
                        {inv.payment_mode}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-stone-200/60">
                    <button
                      onClick={() => setSelectedInvoice(inv)}
                      className="px-2.5 py-1 bg-white hover:bg-stone-200 border border-stone-300 text-stone-800 rounded-lg text-[11px] font-bold cursor-pointer flex items-center gap-1"
                    >
                      <FileText className="w-3 h-3" /> View / Print
                    </button>
                    <button
                      onClick={() => {
                        const text = emergencyBillService.formatWhatsAppText(inv, liveSettings);
                        hardwareService.openWhatsApp(inv.customer_phone || liveSettings.whatsapp_number, text);
                      }}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold cursor-pointer flex items-center gap-1"
                    >
                      <Share2 className="w-3 h-3" /> WhatsApp
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* MODAL RECEIPT PREVIEW */}
      {selectedInvoice && (
        <HighDensityReceiptCard
          invoice={selectedInvoice}
          storeSettings={liveSettings}
          onClose={() => setSelectedInvoice(null)}
          isDuplicateReprint={true}
          shouldAutoPrint={false}
        />
      )}

      {/* ADMIN PIN VERIFICATION MODAL */}
      {isPinModalOpen && (
        <AdminPinPromptModal
          isOpen={isPinModalOpen}
          onClose={() => setIsPinModalOpen(false)}
          onSuccess={executeCreateBill}
          title="AUTHORIZE EMERGENCY BILL"
          subtitle="Enter Admin PIN to generate backdated retroactive bill"
        />
      )}

      {/* QUICK ADD NEW PRODUCT MODAL */}
      {isQuickAddModalOpen && (
        <QuickAddItemModal
          isOpen={isQuickAddModalOpen}
          onClose={() => setIsQuickAddModalOpen(false)}
          initialBarcode={pendingQuickAddCode}
          onProductCreated={(prod) => {
            handleCatalogSelect(prod, pendingMultiplier || 1);
            setIsQuickAddModalOpen(false);
          }}
        />
      )}

    </div>
  );
};
