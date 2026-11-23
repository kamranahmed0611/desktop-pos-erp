import React, { useState, useEffect, useRef } from 'react';
import { Customer, Invoice, InvoiceItem, PaymentMode, Product, StoreSettings } from '../../types';
import { useBillingStore } from '../../store/billingStore';
import { catalogService } from '../../services/catalogService';
import { billingService } from '../../services/billingService';
import { khataService } from '../../services/khataService';
import { hardwareService } from '../../services/hardwareService';
import { LooseWeightModal } from './LooseWeightModal';
import { SplitPaymentModal } from './SplitPaymentModal';
import { HighDensityReceiptCard } from '../emergency/HighDensityReceiptCard';
import { ExchangeModal } from '../exchange/ExchangeModal';
import { QuickPriceCheckModal } from './QuickPriceCheckModal';
import { QuickAddItemModal } from './QuickAddItemModal';
import { CashDropModal } from './CashDropModal';
import { CancelBillModal } from './CancelBillModal';
import { posAlert, posConfirm } from '../../store/uiStore';
import { 
  Barcode, ShoppingCart, Plus, Minus, Trash2, 
  Search, Scale, CreditCard, User, X, Check, ArrowRight, Sparkles,
  RefreshCw, HelpCircle, PlusCircle, ArrowDownCircle, Printer, AlertTriangle, LogOut,
  History, RotateCcw
} from 'lucide-react';

interface UniversalBillingTerminalProps {
  storeSettings: StoreSettings;
  cashierName?: string;
  activeShiftId?: string;
  onOpenShiftClose?: () => void;
}

export const UniversalBillingTerminal: React.FC<UniversalBillingTerminalProps> = ({
  storeSettings,
  cashierName = 'Cashier 1',
  activeShiftId,
  onOpenShiftClose
}) => {
  const {
    activeTab,
    tabs,
    prefixMultiplier,
    setActiveTab,
    setPrefixMultiplier,
    addItemToActiveTab,
    updateItemQty,
    updateItemPrice,
    removeItem,
    setDiscount,
    setCustomer,
    clearActiveCart,
    restoreTabsFromDraft
  } = useBillingStore();

  const currentTab = (tabs && tabs[activeTab]) || tabs?.[0] || {
    id: 0,
    label: 'Bill #1 [F1]',
    cart: [],
    customer: null,
    discountAmount: 0,
    notes: ''
  };
  const cart = currentTab.cart || [];

  // Unified Master Barcode & Live Text Search State
  const [unifiedInput, setUnifiedInput] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [isReprintMode, setIsReprintMode] = useState<boolean>(false);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Customer search state
  const [custQuery, setCustQuery] = useState('');
  const [custResults, setCustResults] = useState<Customer[]>([]);
  const [isCustModalOpen, setIsCustModalOpen] = useState(false);

  // Modals state
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isExchangeModalOpen, setIsExchangeModalOpen] = useState(false);
  const [isPriceCheckModalOpen, setIsPriceCheckModalOpen] = useState(false);
  const [isQuickAddModalOpen, setIsQuickAddModalOpen] = useState(false);
  const [isCashDropModalOpen, setIsCashDropModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [completedInvoice, setCompletedInvoice] = useState<Invoice | null>(null);
  const [lastCompletedInvoice, setLastCompletedInvoice] = useState<Invoice | null>(null);
  const [pendingBarcode, setPendingBarcode] = useState('');

  // Accidental Clear & Ergonomics Refs (M2.2, M2.3)
  const lastEscTimeRef = useRef<number>(0);
  const lastBarcodeScanTimeRef = useRef<number>(0);
  const lastProcessedBarcodeRef = useRef<{ code: string; time: number }>({ code: '', time: 0 }); // Prevents double addition on instant scan/paste
  const isProcessingScanRef = useRef<boolean>(false); // Strict atomic mutex for single-scan lock
  const lastItemAddedTimeRef = useRef<number>(0); // Guard to separate barcode scanner trailing Enter from cashier manual checkout Enter
  const liveSearchTimerRef = useRef<any>(null); // Debounce timer for instant typing feel
  const lastModalCloseTimeRef = useRef<number>(0);
  const [shouldAutoPrintReceipt, setShouldAutoPrintReceipt] = useState(true);
  const clearedCartCacheRef = useRef<{ tabIndex: number; cart: any[]; customer: Customer | null } | null>(null);

  // Shift Invoices History & Universal Past Bill Explorer (A1)
  const [isShiftHistoryOpen, setIsShiftHistoryOpen] = useState(false);
  const [showAllShifts, setShowAllShifts] = useState(false);
  const [shiftInvoices, setShiftInvoices] = useState<(Invoice & { items: InvoiceItem[] })[]>([]);
  const [shiftHistorySearch, setShiftHistorySearch] = useState('');
  const [isLoadingShiftHistory, setIsLoadingShiftHistory] = useState(false);
  const [checkoutToast, setCheckoutToast] = useState<{ message: string; invoiceNumber: string } | null>(null);

  const fetchShiftHistory = async (search = shiftHistorySearch, allShifts = showAllShifts) => {
    setIsLoadingShiftHistory(true);
    try {
      const invs = await billingService.getShiftInvoices(activeShiftId, 100, allShifts, search);
      setShiftInvoices(invs);
    } catch (e) {
      console.warn('Failed to load shift invoices history:', e);
    } finally {
      setIsLoadingShiftHistory(false);
    }
  };

  const handleQuickReprintLastBill = () => {
    if (!lastCompletedInvoice) {
      posAlert('No Recent Bill', 'No sales bill has been completed yet in this session to reprint.', 'info');
      return;
    }
    setIsReprintMode(true);
    setCompletedInvoice(lastCompletedInvoice);
  };

  const handleLoadInvoiceInCart = (inv: Invoice & { items: InvoiceItem[] }) => {
    if (!inv.items || inv.items.length === 0) return;
    hardwareService.playScanSuccess();
    for (const it of inv.items) {
      const found = allProducts.find(p => p.id === it.product_id);
      const prod: Product = found || {
        id: it.product_id || `prod-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        name: it.product_name,
        barcode: '',
        sku: '',
        category: 'General',
        cost_price: it.unit_cost || 0,
        sale_price: it.unit_price,
        tax_rate: 0,
        stock_qty: 100,
        min_stock_alert: 5,
        unit_type: 'piece',
        is_weighable: false,
        is_active: 1,
        updated_at: new Date().toISOString()
      };

      // Accurately determine whether this line item was sold in retail subunits (e.g. Kg vs 50kg wholesale Bag)
      let isSubunitSale = false;
      let unitLabel = it.unit_label || '';
      let deductQty = it.qty;

      if (Boolean(prod.is_loose)) {
        const ratio = prod.unit_conversion_ratio || 1;
        const isNearSubunitPrice = prod.subunit_sale_price && Math.abs(it.unit_price - prod.subunit_sale_price) < Math.abs(it.unit_price - prod.sale_price);
        const hasDecimals = it.qty % 1 !== 0;
        const isExplicitSaleUnit = it.unit_label === prod.sale_unit;

        if (isExplicitSaleUnit || isNearSubunitPrice || (ratio > 1 && (hasDecimals || it.unit_price < prod.sale_price))) {
          isSubunitSale = true;
          unitLabel = prod.sale_unit || 'kg';
          deductQty = Math.round((it.qty / ratio) * 1000) / 1000;
        } else {
          isSubunitSale = false;
          unitLabel = prod.base_unit || prod.unit_type;
          deductQty = it.qty;
        }
      } else {
        unitLabel = it.unit_label || prod.sale_unit || prod.base_unit || prod.unit_type;
      }

      addItemToActiveTab(prod, it.qty, it.unit_price, deductQty, unitLabel, isSubunitSale);
    }
    setIsShiftHistoryOpen(false);
    setCheckoutToast({
      message: `✓ Re-loaded ${inv.items.length} items from Bill #${inv.invoice_number} into cart`,
      invoiceNumber: inv.invoice_number
    });
    setTimeout(() => setCheckoutToast(null), 3000);
  };

  const handleReprintShiftInvoice = (inv: Invoice & { items: InvoiceItem[] }) => {
    hardwareService.playScanSuccess();
    setIsReprintMode(true);
    setCompletedInvoice(inv);
    setIsShiftHistoryOpen(false);
  };

  // Cart Row Input Ergonomics Refs (Tab & Arrow Navigation)
  const qtyInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const priceInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});

  // Load products for quick search & weight scales (Refreshes on mount and window focus)
  const refreshCatalog = () => {
    catalogService.getProducts().then(setAllProducts);
  };

  useEffect(() => {
    refreshCatalog();

    // Live Cross-Tab & Cross-Window Database Synchronization
    const handleDbChange = () => {
      refreshCatalog();
    };

    let unsubElectron: (() => void) | undefined;
    if ((window as any).electronAPI?.onBroadcast) {
      unsubElectron = (window as any).electronAPI.onBroadcast('db-change', handleDbChange);
    }
    window.addEventListener('pos-db-change', handleDbChange);
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'pos_db_sync') handleDbChange();
    };
    window.addEventListener('storage', handleStorage);

    window.addEventListener('focus', refreshCatalog);

    return () => {
      if (unsubElectron) unsubElectron();
      window.removeEventListener('pos-db-change', handleDbChange);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', refreshCatalog);
    };
  }, []);

  // Crash Recovery Auto-Prompt (M11.5)
  useEffect(() => {
    try {
      const savedDraftRaw = localStorage.getItem('pos_cart_draft');
      if (savedDraftRaw) {
        const draft = JSON.parse(savedDraftRaw);
        if (draft && Array.isArray(draft.tabs)) {
          const totalItems = draft.tabs.reduce((sum: number, t: any) => sum + (t.cart?.length || 0), 0);
          if (totalItems > 0) {
            posConfirm(
              'Unfinished Bill Detected (Crash Recovery)',
              `An unfinished cart with ${totalItems} item(s) from a previous session was detected.\n\nWould you like to resume this unfinished bill or discard and start fresh?`,
              { confirmText: 'Resume Unfinished Bill', cancelText: 'Start New Bill', alertType: 'info' }
            ).then((resume) => {
              if (resume) {
                restoreTabsFromDraft(draft.tabs);
                hardwareService.playNoticeTone();
              } else {
                localStorage.removeItem('pos_cart_draft');
              }
            });
          }
        }
      }
    } catch {}
  }, []);

  // Autofocus barcode input & maintain active scanner readiness
  useEffect(() => {
    const focusBar = () => {
      const active = document.activeElement;
      const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');
      const anyModal = isPaymentModalOpen || isWeightModalOpen || isCustModalOpen || 
                       isExchangeModalOpen || isPriceCheckModalOpen || isQuickAddModalOpen || 
                       isCashDropModalOpen || isCancelModalOpen;
      if (!isInput && !anyModal) {
        barcodeInputRef.current?.focus();
      }
    };

    focusBar();
    window.addEventListener('focus', focusBar);
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('input, textarea, select, button, a, [role="button"]')) {
        focusBar();
      }
    };
    document.addEventListener('click', handleDocumentClick);
    return () => {
      window.removeEventListener('focus', focusBar);
      document.removeEventListener('click', handleDocumentClick);
    };
  }, [
    activeTab, 
    isPaymentModalOpen, 
    isWeightModalOpen, 
    isCustModalOpen,
    isExchangeModalOpen, 
    isPriceCheckModalOpen, 
    isQuickAddModalOpen, 
    isCashDropModalOpen, 
    isCancelModalOpen
  ]);

  // Global Keyboard Navigation (F1-F4 Tabs, F6 Exchange, F7 Price Check, F8 Quick Add, F9 Scale, F12 Pay, Ctrl+D Drop, Ctrl+P Reprint, Ctrl+Z Undo, Double-Esc Clear)
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // If payment modal is open, let SplitPaymentModal handle its own internal Escape hierarchy
      if (isPaymentModalOpen) {
        return;
      }

      // Close open modals on Escape
      const anyModalOpen = isWeightModalOpen || isCustModalOpen || 
                           isExchangeModalOpen || isPriceCheckModalOpen || isQuickAddModalOpen || 
                           isCashDropModalOpen || isCancelModalOpen || isShiftHistoryOpen;

      if (anyModalOpen) {
        if (e.key === 'Escape') {
          setIsWeightModalOpen(false);
          setIsCustModalOpen(false);
          setIsExchangeModalOpen(false);
          setIsPriceCheckModalOpen(false);
          setIsQuickAddModalOpen(false);
          setIsCashDropModalOpen(false);
          setIsCancelModalOpen(false);
          setIsShiftHistoryOpen(false);
          lastEscTimeRef.current = 0; // Reset double-Esc timer whenever any modal closes
        }
        return;
      }

      // Global Ctrl + Z: Undo accidental bill clear
      if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (clearedCartCacheRef.current) {
          const { cart: cachedItems, customer: cachedCustomer } = clearedCartCacheRef.current;
          for (const item of cachedItems) {
            addItemToActiveTab(
              item.product, 
              item.qty || item.quantity || 1, 
              item.unit_price, 
              item.deduct_qty, 
              item.unit_label, 
              item.is_subunit_sale
            );
          }
          if (cachedCustomer) setCustomer(cachedCustomer);
          clearedCartCacheRef.current = null;
          hardwareService.playScanSuccess();
        }
        return;
      }

      // Double-Tap Esc (within 500ms): Clear active bill immediately with zero confirmation popups
      if (e.key === 'Escape') {
        if (cart.length > 0) {
          const now = Date.now();
          if (now - lastEscTimeRef.current <= 500) {
            // Double-Esc within 500ms! Clear active bill immediately without popup
            clearedCartCacheRef.current = {
              tabIndex: activeTab,
              cart: [...cart],
              customer: currentTab.customer
            };
            clearActiveCart();
            lastEscTimeRef.current = 0;
            hardwareService.playNoticeTone();
          } else {
            lastEscTimeRef.current = now;
          }
        }
        return;
      }

      // Ctrl + D: Cash drop / safe skim
      if (e.ctrlKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        setIsCashDropModalOpen(true);
        return;
      }

      // Ctrl + H: View Recent Bills / Shift Invoices History
      if (e.ctrlKey && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        setIsShiftHistoryOpen(prev => {
          const next = !prev;
          if (next) fetchShiftHistory();
          return next;
        });
        return;
      }

      // Ctrl + P: Reprint Last Bill
      if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        if (lastCompletedInvoice) {
          hardwareService.playScanSuccess();
          setIsReprintMode(true);
          setCompletedInvoice(lastCompletedInvoice);
        } else {
          await posAlert('Reprint Memory Empty', 'No previous finalized bill found in memory to reprint.', 'info');
        }
        return;
      }

      // F1 - F4: Switch tabs
      if (e.key === 'F1') { e.preventDefault(); setActiveTab(0); }
      if (e.key === 'F2') { e.preventDefault(); setActiveTab(1); }
      if (e.key === 'F3') { e.preventDefault(); setActiveTab(2); }
      if (e.key === 'F4') { e.preventDefault(); setActiveTab(3); }

      // F6: Exchange Window
      if (e.key === 'F6') { e.preventDefault(); setIsExchangeModalOpen(true); }

      // F7: Close Shift
      if (e.key === 'F7') {
        e.preventDefault();
        if (onOpenShiftClose) onOpenShiftClose();
        return;
      }

      // F8: Quick Add Item
      if (e.key === 'F8') { e.preventDefault(); setIsQuickAddModalOpen(true); }

      // F9: Loose weight calculator
      if (e.key === 'F9') { e.preventDefault(); setIsWeightModalOpen(true); }

      // F10: Quick Price Check
      if (e.key === 'F10') { e.preventDefault(); setIsPriceCheckModalOpen(true); }

      // F12: Instant 1-Click Quick Reprint of Last Bill
      if (e.key === 'F12') {
        e.preventDefault();
        handleQuickReprintLastBill();
        return;
      }

      // Ctrl+R or Numpad Divide (/): Quick Reset Quantity of last cart item to 1, or reset multiplier
      if ((e.ctrlKey && (e.key === 'r' || e.key === 'R')) || e.code === 'NumpadDivide') {
        e.preventDefault();
        setPrefixMultiplier(null);
        setUnifiedInput('');
        setSearchResults([]);
        if (cart.length > 0) {
          const lastIdx = cart.length - 1;
          updateItemQty(lastIdx, 1);
          hardwareService.playNoticeTone();
        }
        return;
      }

      // Enter: Open checkout (guarded against barcode scanner trailing Enter)
      if (e.key === 'Enter') {
        const target = e.target as HTMLElement;
        if (target === barcodeInputRef.current) {
          return;
        }
        const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
        if (isInput) return;

        if (Date.now() - lastItemAddedTimeRef.current < 500) {
          return;
        }

        e.preventDefault();
        if (cart.length > 0) setIsPaymentModalOpen(true);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isPaymentModalOpen, isWeightModalOpen, isCustModalOpen, 
    isExchangeModalOpen, isPriceCheckModalOpen, isQuickAddModalOpen, 
    isCashDropModalOpen, isCancelModalOpen, cart.length, setActiveTab, lastCompletedInvoice
  ]);

  // Unified Master Live Search Change Handler (Lag-free 120ms debounced search + instant exact barcode auto-add)
  const handleUnifiedInputChange = (val: string) => {
    setUnifiedInput(val);
    setSelectedIndex(-1);

    if (liveSearchTimerRef.current) {
      clearTimeout(liveSearchTimerRef.current);
      liveSearchTimerRef.current = null;
    }

    let q = val.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }

    if (q.includes('*')) {
      const parts = q.split('*');
      q = (parts[1] || '').trim();
    }

    if (!q) {
      setSearchResults([]);
      return;
    }

    // Instant exact barcode detection (useful when scanning or pasting barcodes)
    if (q.length >= 6) {
      catalogService.findByBarcodeOrSku(q).then((directP) => {
        if (directP && (directP.barcode === q || directP.sku === q)) {
          if (liveSearchTimerRef.current) {
            clearTimeout(liveSearchTimerRef.current);
            liveSearchTimerRef.current = null;
          }
          setSearchResults([]);
          handleUnifiedSubmit(undefined, val);
        }
      }).catch(() => {});
    }

    if (q.length >= 1) {
      liveSearchTimerRef.current = setTimeout(async () => {
        try {
          if (!barcodeInputRef.current?.value.trim()) {
            setSearchResults([]);
            return;
          }
          const results = await catalogService.searchProducts(q, 8);
          if (!barcodeInputRef.current?.value.trim()) {
            setSearchResults([]);
            return;
          }
          setSearchResults(results);
        } catch (err) {
          setSearchResults([]);
        }
      }, 120);
    } else {
      setSearchResults([]);
    }
  };

  // Keyboard navigation on master input (Arrow Up, Arrow Down, Enter, Escape, Tab, Numpad Multiplier *, +/-, etc.)
  const handleUnifiedInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 0. Instant Enter Key Handler on Master Barcode Input
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (Date.now() - lastModalCloseTimeRef.current < 400) {
        return;
      }

      const domVal = barcodeInputRef.current?.value || '';
      const raw = (unifiedInput || domVal).trim();

      if (!raw) {
        // Empty barcode search bar: Cashier pressed Enter to Checkout!
        // 500ms cooldown prevents barcode scanner's trailing Enter from triggering checkout
        if (Date.now() - lastItemAddedTimeRef.current < 500) {
          return;
        }
        if (cart.length > 0) {
          setIsPaymentModalOpen(true);
        }
        return;
      }

      handleUnifiedSubmit();
      return;
    }

    // 1. Numpad Multiplier Shortcut (*)
    if (e.key === '*' || e.code === 'NumpadMultiply') {
      e.preventDefault();
      const val = unifiedInput.trim();
      const cleanVal = val.replace(/\*/g, '').trim();
      const num = parseInt(cleanVal, 10);
      if (!isNaN(num) && num > 0) {
        // Cashier typed number e.g. "5" or "5*" and pressed "*" on numpad -> immediately set 5x multiplier!
        setPrefixMultiplier(num);
        setUnifiedInput('');
        setSearchResults([]);
        hardwareService.playNoticeTone();
      } else {
        // Empty or non-numeric: Cycle through common multipliers (1x -> 2x -> 3x -> 5x -> 6x -> 10x -> 12x -> 1x)
        const cycles = [null, 2, 3, 5, 6, 10, 12];
        const curIdx = cycles.indexOf(prefixMultiplier || null);
        const next = cycles[(curIdx + 1) % cycles.length];
        setPrefixMultiplier(next);
        hardwareService.playNoticeTone();
      }
      return;
    }

    // Reset multiplier or cart item quantity via Ctrl+R or Numpad Divide (/)
    if ((e.ctrlKey && (e.key === 'r' || e.key === 'R')) || e.code === 'NumpadDivide') {
      e.preventDefault();
      setPrefixMultiplier(null);
      setUnifiedInput('');
      setSearchResults([]);
      if (cart.length > 0) {
        const lastIdx = cart.length - 1;
        updateItemQty(lastIdx, 1);
        hardwareService.playNoticeTone();
      }
      return;
    }

    // 2. Numpad "+" increments quantity of last cart item if input is empty
    if ((e.key === '+' || e.code === 'NumpadAdd') && !unifiedInput.trim() && cart.length > 0) {
      e.preventDefault();
      const lastIdx = cart.length - 1;
      const lastItem = cart[lastIdx];
      updateItemQty(lastIdx, (lastItem.qty || 1) + 1);
      hardwareService.playNoticeTone();
      return;
    }

    // 3. Numpad "-" decrements quantity of last cart item if input is empty
    if ((e.key === '-' || e.code === 'NumpadSubtract') && !unifiedInput.trim() && cart.length > 0) {
      e.preventDefault();
      const lastIdx = cart.length - 1;
      const lastItem = cart[lastIdx];
      if ((lastItem.qty || 1) > 1) {
        updateItemQty(lastIdx, (lastItem.qty || 1) - 1);
        hardwareService.playNoticeTone();
      }
      return;
    }

    if (e.key === 'Tab') {
      if (cart.length > 0) {
        e.preventDefault();
        const lastIdx = cart.length - 1;
        qtyInputRefs.current[lastIdx]?.focus();
        qtyInputRefs.current[lastIdx]?.select();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      if (searchResults.length > 0) {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % searchResults.length);
      } else if (!unifiedInput.trim() && cart.length > 0) {
        e.preventDefault();
        qtyInputRefs.current[0]?.focus();
        qtyInputRefs.current[0]?.select();
      }
    } else if (e.key === 'ArrowUp') {
      if (searchResults.length > 0) {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + searchResults.length) % searchResults.length);
      }
    } else if (e.key === 'Escape') {
      setSearchResults([]);
      setSelectedIndex(-1);
      if (prefixMultiplier !== null) {
        setPrefixMultiplier(null);
        hardwareService.playNoticeTone();
      }
    }
  };

  // Unified Master Input Submission (Barcode scan, single match auto-add, or arrow selection)
  const handleUnifiedSubmit = async (e?: React.FormEvent, overrideVal?: string) => {
    if (e) e.preventDefault();

    const domVal = barcodeInputRef.current?.value || '';
    const raw = (overrideVal || unifiedInput || domVal).trim();
    if (!raw) {
      return;
    }

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
      setUnifiedInput('');
      setSearchResults([]);
      return;
    }

    // Deduplication check: ignore rapid duplicate scans for the exact same barcode within 800ms
    if (
      lastProcessedBarcodeRef.current.code === codeToSearch &&
      Date.now() - lastProcessedBarcodeRef.current.time < 800
    ) {
      return;
    }

    // Atomic scan processing lock + 150ms debounce window (stops 2x double additions)
    if (isProcessingScanRef.current) return;
    if (Date.now() - lastBarcodeScanTimeRef.current < 150 || Date.now() - lastModalCloseTimeRef.current < 400) {
      return;
    }

    isProcessingScanRef.current = true;
    lastBarcodeScanTimeRef.current = Date.now();

    try {
      // 1. DIRECT EXACT BARCODE / SKU LOOKUP (Instant Scanner Match!)
      const directProduct = await catalogService.findByBarcodeOrSku(codeToSearch);
      if (directProduct) {
        lastItemAddedTimeRef.current = Date.now();
        lastProcessedBarcodeRef.current = { code: codeToSearch, time: Date.now() };
        addItemToActiveTab(directProduct, multiplier);
        hardwareService.playScanSuccess();
        setUnifiedInput('');
        setSearchResults([]);
        setSelectedIndex(-1);
        setPrefixMultiplier(null);
        if (barcodeInputRef.current) barcodeInputRef.current.value = '';
        barcodeInputRef.current?.focus();
        return;
      }

      // 2. 13-digit Weighing Scale barcode check (20AAAAAWWWWWK)
      if (codeToSearch.startsWith('20') && codeToSearch.length === 13) {
        const itemCode = codeToSearch.substring(2, 7);
        const weightRaw = parseInt(codeToSearch.substring(7, 12), 10);
        const weightKg = weightRaw / 1000;

        const scaleProduct = await catalogService.findByBarcodeOrSku(itemCode);
        if (scaleProduct) {
          lastItemAddedTimeRef.current = Date.now();
          lastProcessedBarcodeRef.current = { code: codeToSearch, time: Date.now() };
          addItemToActiveTab(scaleProduct, weightKg);
          hardwareService.playScanSuccess();
          setUnifiedInput('');
          setSearchResults([]);
          setPrefixMultiplier(null);
          if (barcodeInputRef.current) barcodeInputRef.current.value = '';
          barcodeInputRef.current?.focus();
          return;
        }
      }

      // 3. If an item in dropdown is actively highlighted via Arrow keys
      if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
        const selected = searchResults[selectedIndex];
        lastItemAddedTimeRef.current = Date.now();
        lastProcessedBarcodeRef.current = { code: codeToSearch, time: Date.now() };
        addItemToActiveTab(selected, multiplier);
        hardwareService.playScanSuccess();
        setUnifiedInput('');
        setSearchResults([]);
        setSelectedIndex(-1);
        setPrefixMultiplier(null);
        if (barcodeInputRef.current) barcodeInputRef.current.value = '';
        barcodeInputRef.current?.focus();
        return;
      }

      // 4. If search results are present in dropdown, select top match on Enter!
      if (searchResults.length > 0) {
        const targetMatch = searchResults[0];
        lastItemAddedTimeRef.current = Date.now();
        lastProcessedBarcodeRef.current = { code: codeToSearch, time: Date.now() };
        addItemToActiveTab(targetMatch, multiplier);
        hardwareService.playScanSuccess();
        setUnifiedInput('');
        setSearchResults([]);
        setSelectedIndex(-1);
        setPrefixMultiplier(null);
        if (barcodeInputRef.current) barcodeInputRef.current.value = '';
        barcodeInputRef.current?.focus();
        return;
      }

      // 5. Try live query if searchResults had not loaded yet
      try {
        const liveResults = await catalogService.searchProducts(codeToSearch, 5);
        if (liveResults.length > 0) {
          const topMatch = liveResults[0];
          lastItemAddedTimeRef.current = Date.now();
          lastProcessedBarcodeRef.current = { code: codeToSearch, time: Date.now() };
          addItemToActiveTab(topMatch, multiplier);
          hardwareService.playScanSuccess();
          setUnifiedInput('');
          setSearchResults([]);
          setSelectedIndex(-1);
          setPrefixMultiplier(null);
          if (barcodeInputRef.current) barcodeInputRef.current.value = '';
          barcodeInputRef.current?.focus();
          return;
        }
      } catch {}

      // 6. PRODUCT NOT IN DATABASE -> DIRECTLY OPEN QUICK ADD MODAL!
      hardwareService.playError();
      setPendingBarcode(codeToSearch);
      setIsQuickAddModalOpen(true);
      setUnifiedInput('');
      setSearchResults([]);
      setPrefixMultiplier(null);
      if (barcodeInputRef.current) barcodeInputRef.current.value = '';
    } finally {
      if (liveSearchTimerRef.current) {
        clearTimeout(liveSearchTimerRef.current);
        liveSearchTimerRef.current = null;
      }
      setSearchResults([]);
      setTimeout(() => {
        isProcessingScanRef.current = false;
      }, 100);
    }
  };

  const handleSelectSearchResult = (prod: Product) => {
    let multiplier = prefixMultiplier || 1;
    if (unifiedInput.includes('*')) {
      const parts = unifiedInput.split('*');
      const count = parseInt(parts[0], 10);
      if (!isNaN(count) && count > 0) multiplier = count;
    }
    lastItemAddedTimeRef.current = Date.now();
    addItemToActiveTab(prod, multiplier);
    hardwareService.playScanSuccess();
    if (liveSearchTimerRef.current) {
      clearTimeout(liveSearchTimerRef.current);
      liveSearchTimerRef.current = null;
    }
    setUnifiedInput('');
    setSearchResults([]);
    setSelectedIndex(-1);
    setPrefixMultiplier(null);
    barcodeInputRef.current?.focus();
  };

  // Customer search
  const handleSearchCustomer = async (q: string) => {
    setCustQuery(q);
    if (q.trim().length > 0) {
      const list = await khataService.searchCustomers(q);
      setCustResults(list);
    } else {
      setCustResults([]);
    }
  };

  // Calculations
  const totalItemsCount = cart.length;
  const totalQty = cart.reduce((sum, it) => sum + it.qty, 0);
  const grossTotal = cart.reduce((sum, it) => sum + it.subtotal, 0);
  const totalTax = cart.reduce((sum, it) => sum + (it.tax_amount || 0), 0);
  const netPayable = Math.max(0, grossTotal + totalTax - currentTab.discountAmount);

  // Process Checkout
  const handleConfirmCheckout = async (params: {
    payment_mode: PaymentMode;
    paid_amount: number;
    split_khata_amount?: number;
    amanat_used?: number;
    notes?: string;
    should_print?: boolean;
  }) => {
    try {
      const invoice = await billingService.processCheckout({
        cart: cart,
        customer_id: currentTab.customer?.id,
        customer_name: currentTab.customer?.name,
        customer_phone: currentTab.customer?.phone,
        payment_mode: params.payment_mode,
        paid_amount: params.paid_amount,
        discount_amount: currentTab.discountAmount,
        cashier_id: 'cashier-01',
        cashier_name: cashierName,
        shift_id: activeShiftId,
        split_khata_amount: params.split_khata_amount,
        amanat_used: params.amanat_used,
        notes: params.notes
      });

      const doPrint = params.should_print !== false;
      setShouldAutoPrintReceipt(doPrint);

      hardwareService.playCheckoutChime();
      clearActiveCart();
      setIsPaymentModalOpen(false);
      setIsReprintMode(false);
      lastModalCloseTimeRef.current = Date.now();

      // Ensure invoice has items attached so bill is never empty
      if (!invoice.items || invoice.items.length === 0) {
        try {
          const fullInv = await billingService.getInvoiceWithItems(invoice.invoice_number);
          if (fullInv?.items?.length) {
            invoice.items = fullInv.items;
          }
        } catch {}
      }
      
      if (doPrint) {
        // [Y] Selected: Open Digital Receipt Card preview with full bill (Receipt card auto-dispatches print when DOM ready)
        setCompletedInvoice(invoice);
      } else {
        // [N] Selected: Paperless sale - just clear cart, no receipt modal, focus scanner
        setCompletedInvoice(null);
        setTimeout(() => {
          barcodeInputRef.current?.focus();
        }, 50);
      }
      setLastCompletedInvoice(invoice);

      // Brief non-intrusive notification banner
      setCheckoutToast({
        message: `✓ Bill #${invoice.invoice_number} Finalized (PKR ${invoice.total_amount.toLocaleString()}) ${doPrint ? '• Printing Receipt' : '• Paperless'}`,
        invoiceNumber: invoice.invoice_number
      });
      setTimeout(() => setCheckoutToast(null), 3500);

      // Focus barcode scanner input immediately if modal not open
      if (!doPrint) {
        setTimeout(() => {
          barcodeInputRef.current?.focus();
        }, 60);
      }

      // Live Instant Multi-Window & Multi-Tab Database Synchronization (Instant Khata balance refresh)
      if ((window as any).electronAPI?.broadcastChange) {
        (window as any).electronAPI.broadcastChange('db-change', { 
          type: 'new-invoice', 
          paymentMode: params.payment_mode,
          customerId: invoice.customer_id 
        });
      }
      window.dispatchEvent(new CustomEvent('pos-db-change', { 
        detail: { 
          type: 'new-invoice', 
          paymentMode: params.payment_mode,
          customerId: invoice.customer_id 
        } 
      }));
      localStorage.setItem('pos_db_sync', Date.now().toString());
    } catch (err: any) {
      hardwareService.playError();
      await posAlert('Checkout Error', err.message, 'error');
    }
  };

  return (
    <div className="max-w-[1850px] w-full mx-auto p-2 sm:p-3 space-y-2 sm:space-y-2.5 font-sans select-none">
      
      {/* 4 CONCURRENT TABS HEADER */}
      <div className="flex items-center justify-between bg-stone-900 p-2 rounded-2xl border border-stone-800">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {tabs.map((tab, idx) => {
            const hasItems = tab.cart.length > 0;
            const tabTotal = tab.cart.reduce((sum, it) => sum + it.subtotal, 0);
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(idx)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === idx
                    ? 'bg-[#5B7981] text-white shadow-md'
                    : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                }`}
              >
                <span>{tab.label}</span>
                {hasItems && (
                  <span className="bg-stone-950/40 text-amber-300 px-1.5 py-0.5 rounded text-[10px] font-mono">
                    Rs. {tabTotal.toLocaleString()}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* CUSTOMER ASSIGNMENT BADGE */}
        <div className="flex items-center gap-2">
          {currentTab.customer && (
            <div className="bg-[#243338] border border-stone-700 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs text-white">
              <User className="w-3.5 h-3.5 text-[#E3D5C0]" />
              <span className="font-bold">{currentTab.customer.name}</span>
              <span className="text-[10px] text-amber-300 font-mono">
                (Due: Rs. {currentTab.customer.current_balance.toLocaleString()})
              </span>
              <button
                onClick={() => setCustomer(null)}
                className="text-stone-400 hover:text-white ml-1 cursor-pointer"
                title="Remove customer from this bill"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* QUICK OPERATIONAL HOTKEYS TOOLBAR */}
      <div className="bg-stone-100 border border-stone-200 px-4 py-2 rounded-2xl flex items-center justify-between text-xs overflow-x-auto gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExchangeModalOpen(true)}
            className="px-2.5 py-1 bg-white hover:bg-amber-50 border border-stone-300 rounded-lg font-bold text-stone-800 flex items-center gap-1 cursor-pointer shadow-2xs"
          >
            <RefreshCw className="w-3.5 h-3.5 text-amber-600" />
            <span>[F6] Exchange Window</span>
          </button>

          <button
            onClick={() => onOpenShiftClose && onOpenShiftClose()}
            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold flex items-center gap-1 cursor-pointer shadow-2xs transition-colors"
            title="Close active cashier shift [F7]"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>[F7] Close Shift</span>
          </button>

          <button
            onClick={() => setIsPriceCheckModalOpen(true)}
            className="px-2.5 py-1 bg-white hover:bg-blue-50 border border-stone-300 rounded-lg font-bold text-stone-800 flex items-center gap-1 cursor-pointer shadow-2xs"
          >
            <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
            <span>[F10] Price Check</span>
          </button>

          <button
            onClick={() => setIsQuickAddModalOpen(true)}
            className="px-2.5 py-1 bg-white hover:bg-emerald-50 border border-stone-300 rounded-lg font-bold text-stone-800 flex items-center gap-1 cursor-pointer shadow-2xs"
          >
            <PlusCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span>[F8] Quick Add Item</span>
          </button>

          <button
            onClick={() => setIsWeightModalOpen(true)}
            className="px-2.5 py-1 bg-white hover:bg-[#E3D5C0]/40 border border-stone-300 rounded-lg font-bold text-stone-800 flex items-center gap-1 cursor-pointer shadow-2xs"
          >
            <Scale className="w-3.5 h-3.5 text-[#5B7981]" />
            <span>[F9] Loose Scale</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCashDropModalOpen(true)}
            className="px-2.5 py-1 bg-stone-200 hover:bg-stone-300 rounded-lg font-bold text-stone-800 flex items-center gap-1 cursor-pointer"
            title="Skim excess cash from till to back-office safe"
          >
            <ArrowDownCircle className="w-3.5 h-3.5 text-amber-700" />
            <span>[Ctrl+D] Safe Drop</span>
          </button>

          <button
            onClick={() => {
              setIsShiftHistoryOpen(true);
              fetchShiftHistory();
            }}
            className="px-2.5 py-1 bg-[#243338] hover:bg-[#34464d] text-white rounded-lg font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="View recent bills from this shift [Ctrl+H]"
          >
            <History className="w-3.5 h-3.5 text-[#E3D5C0]" />
            <span>[Ctrl+H] Recent Bills</span>
          </button>

          {lastCompletedInvoice && (
            <button
              onClick={handleQuickReprintLastBill}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-stone-950 font-black rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Reprint last completed bill immediately [F12 / Ctrl+P]"
            >
              <Printer className="w-3.5 h-3.5 text-stone-950" />
              <span>Last Bill: #{lastCompletedInvoice.invoice_number.slice(-4)} [F12]</span>
            </button>
          )}
        </div>
      </div>

      {/* CHECKOUT COMPLETION INSTANT TOAST (A4) */}
      {checkoutToast && (
        <div className="bg-emerald-600 text-white px-4 py-2.5 rounded-2xl shadow-lg flex items-center justify-between font-bold text-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 stroke-[3]" />
            <span>{checkoutToast.message}</span>
          </div>
          <button
            onClick={() => {
              setIsShiftHistoryOpen(true);
              fetchShiftHistory();
            }}
            className="text-[11px] bg-emerald-700 hover:bg-emerald-800 px-2.5 py-1 rounded-lg border border-emerald-500 font-mono underline cursor-pointer"
          >
            View in Recent Bills [Ctrl+H]
          </button>
        </div>
      )}

      {/* MAIN BILLING WORKSPACE (Optimized for Boxy Squared LCDs 1024x768 and 1280x1024) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
        
        {/* LEFT / CENTER: BARCODE INPUT & CART TABLE */}
        <div className="md:col-span-8 bg-white p-3.5 sm:p-4 rounded-3xl border border-stone-200 shadow-sm flex flex-col space-y-3.5">
          
          {/* UNIFIED MASTER INPUT FOR SCANNING & LIVE SEARCH */}
          <div className="relative">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <form onSubmit={handleUnifiedSubmit} className="sm:col-span-9 relative">
                <button type="submit" className="hidden" tabIndex={-1} aria-hidden="true" />
                <div className="absolute left-3.5 top-3 flex items-center gap-1.5 text-stone-400 pointer-events-none">
                  <Barcode className="w-5 h-5 text-stone-500" />
                  <Search className="w-4 h-4 text-stone-400" />
                </div>
                <input
                  ref={barcodeInputRef}
                  type="text"
                  value={unifiedInput}
                  onChange={(e) => handleUnifiedInputChange(e.target.value)}
                  onKeyDown={handleUnifiedInputKeyDown}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData('text').trim();
                    if (pasted) {
                      setUnifiedInput(pasted);
                      if (barcodeInputRef.current) barcodeInputRef.current.value = pasted;
                      setTimeout(() => {
                        handleUnifiedSubmit(undefined, pasted);
                      }, 20);
                    }
                  }}
                  placeholder="Scan barcode or type item name (e.g. Olpers, Tapal, Dalda)..."
                  className="w-full pl-16 pr-36 py-3 bg-stone-50 border-2 border-stone-300 focus:border-emerald-600 focus:bg-white rounded-2xl text-sm font-sans font-bold outline-hidden transition-all shadow-2xs"
                  autoFocus
                />
                <div className="absolute right-2.5 top-2 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const cycles = [null, 2, 3, 5, 6, 10, 12];
                      const curIdx = cycles.indexOf(prefixMultiplier || null);
                      const next = cycles[(curIdx + 1) % cycles.length];
                      setPrefixMultiplier(next);
                      barcodeInputRef.current?.focus();
                    }}
                    className={`px-2 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1 transition-all cursor-pointer ${
                      prefixMultiplier
                        ? 'bg-amber-400 text-stone-950 font-black shadow-xs ring-2 ring-amber-500'
                        : 'bg-stone-200 hover:bg-stone-300 text-stone-700'
                    }`}
                    title="Press Numpad * to toggle multiplier or type number then *"
                  >
                    <span>Qty: {prefixMultiplier || 1}x</span>
                    <span className="text-[10px] opacity-75">[*]</span>
                  </button>

                  {prefixMultiplier && (
                    <button
                      type="button"
                      onClick={() => {
                        setPrefixMultiplier(null);
                        barcodeInputRef.current?.focus();
                      }}
                      className="px-1.5 py-1 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg text-[10px] font-mono font-black flex items-center gap-0.5 cursor-pointer shadow-2xs"
                      title="Reset quantity multiplier to 1 [Ctrl+R / Numpad /]"
                    >
                      <span>[Ctrl+R] 1x</span>
                    </button>
                  )}

                  {unifiedInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setUnifiedInput('');
                        setSearchResults([]);
                        setSelectedIndex(-1);
                        barcodeInputRef.current?.focus();
                      }}
                      className="text-stone-400 hover:text-stone-700 cursor-pointer p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </form>

              <button
                type="button"
                onClick={() => setIsWeightModalOpen(true)}
                className="sm:col-span-3 px-3 py-3 bg-[#E3D5C0]/40 hover:bg-[#E3D5C0]/60 border border-[#E3D5C0] text-[#5B7981] rounded-2xl text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
              >
                <Scale className="w-4 h-4 text-[#5B7981]" /> [F9] Scale Item
              </button>
            </div>

            {/* LIVE AUTOCOMPLETE DROPDOWN (UP/DOWN KEYBOARD NAVIGATION) */}
            {Boolean(unifiedInput.trim()) && searchResults.length > 0 && (
              <div className="absolute z-30 left-0 right-0 sm:right-[26%] mt-1.5 bg-white border-2 border-emerald-600/40 rounded-2xl shadow-2xl overflow-hidden divide-y divide-stone-100 max-h-72 overflow-y-auto">
                <div className="px-3 py-1.5 bg-stone-100 text-[10px] font-bold text-stone-500 uppercase flex justify-between font-mono">
                  <span>{searchResults.length} Match{searchResults.length > 1 ? 'es' : ''} (Use ↑ ↓ arrows &amp; Enter)</span>
                  <span>PKR Price • Live Stock</span>
                </div>
                {searchResults.map((prod, idx) => {
                  const isSelected = idx === selectedIndex;
                  const isLowStock = prod.stock_qty <= 5;
                  const isOutOfStock = prod.stock_qty <= 0;
                  return (
                    <div
                      key={prod.id}
                      onClick={() => handleSelectSearchResult(prod)}
                      className={`p-3 flex justify-between items-center cursor-pointer text-xs transition-colors ${
                        isSelected ? 'bg-emerald-50 border-l-4 border-emerald-600' : 'hover:bg-stone-50'
                      }`}
                    >
                      <div className="flex-1 pr-3">
                        <div className="font-bold text-stone-900 flex items-center gap-2">
                          <span>{prod.name}</span>
                          {prod.is_loose && (
                            <span className="text-[9px] px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded font-semibold">
                              Loose
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-stone-500 block font-mono">
                          {prod.category} • Barcode: {prod.barcode || 'N/A'}
                        </span>
                      </div>
                      <div className="text-right space-y-0.5">
                        <div className="font-black text-emerald-800 font-mono text-sm">
                          Rs. {prod.sale_price.toLocaleString()}
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold block ${
                          isOutOfStock ? 'bg-red-100 text-red-700' :
                          isLowStock ? 'bg-amber-100 text-amber-800' :
                          'bg-stone-100 text-stone-600'
                        }`}>
                          Stock: {prod.stock_qty} {prod.unit_type || 'pcs'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* DENSE CART TABLE */}
          <div className="flex-1 border border-stone-200 rounded-2xl overflow-hidden flex flex-col">
            <div className="bg-stone-100 px-4 py-2.5 text-[11px] font-bold text-stone-600 grid grid-cols-12 gap-2 uppercase tracking-wide border-b border-stone-200">
              <span className="col-span-1 text-center">#</span>
              <span className="col-span-5">Product Description</span>
              <span className="col-span-3 text-center">Qty / Scale</span>
              <span className="col-span-2 text-right">Price</span>
              <span className="col-span-1 text-center">Del</span>
            </div>

            <div className="flex-1 overflow-y-auto min-h-[140px] max-h-[38vh] divide-y divide-stone-100 bg-white">
              {cart.length === 0 ? (
                <div className="p-12 text-center text-stone-400 space-y-2">
                  <ShoppingCart className="w-8 h-8 mx-auto text-stone-300" />
                  <p className="text-xs font-medium">Cart is empty. Scan an item or press [F9] for loose weights.</p>
                </div>
              ) : (
                cart.map((item, idx) => {
                  const isMultiQty = item.qty > 1;
                  return (
                    <div 
                      key={idx} 
                      className={`px-4 py-2.5 grid grid-cols-12 gap-2 items-center text-xs transition-colors ${
                        isMultiQty 
                          ? 'bg-amber-50/70 hover:bg-amber-100/70 border-l-4 border-l-amber-500' 
                          : 'hover:bg-stone-50/70'
                      }`}
                    >
                      <span className="col-span-1 text-center font-mono text-[11px] font-bold text-stone-500">{idx + 1}</span>
                      
                      <div className="col-span-5 truncate">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="font-bold text-stone-900 truncate">{item.product.name}</span>
                          {isMultiQty && (
                            <span className="px-1.5 py-0.2 bg-amber-500 text-white rounded font-mono font-black text-[10px] shrink-0 shadow-2xs">
                              x{item.product.is_weighable || (item.qty % 1 !== 0) ? item.qty.toFixed(2) : item.qty}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-stone-500 font-mono flex items-center gap-1.5 flex-wrap">
                          {item.unit_label ? (
                            <span className="text-[#5B7981] font-bold">[{item.unit_label}]</span>
                          ) : null}
                          <span>Barcode: {item.product.barcode || item.product.sku}</span>
                          {item.deduct_qty !== undefined && Boolean(item.product.is_loose) ? (
                            <span className="text-amber-700 font-sans font-semibold">
                              (Stock: -{item.deduct_qty.toFixed(2)} {item.product.base_unit || 'base'})
                            </span>
                          ) : null}
                        </span>
                      </div>

                      <div className="col-span-3 flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateItemQty(idx, item.qty - (item.product.is_weighable || (item.qty % 1 !== 0) ? 0.25 : 1))}
                          className="p-1 bg-stone-100 hover:bg-stone-200 rounded-md text-stone-700 cursor-pointer shadow-2xs"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <input
                          ref={(el) => { qtyInputRefs.current[idx] = el; }}
                          type="number"
                          min="0.001"
                          step="any"
                          value={item.product.is_weighable || (item.qty % 1 !== 0) ? Number(item.qty.toFixed(3)) : item.qty}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val) && val >= 0) {
                              updateItemQty(idx, val);
                            }
                          }}
                          onKeyDown={(e) => {
                            if ((e.ctrlKey && (e.key === 'r' || e.key === 'R')) || e.code === 'NumpadDivide') {
                              e.preventDefault();
                              updateItemQty(idx, 1);
                              hardwareService.playNoticeTone();
                              return;
                            }
                            if (e.key === 'Tab' || e.key === 'ArrowRight') {
                              e.preventDefault();
                              priceInputRefs.current[idx]?.focus();
                              priceInputRefs.current[idx]?.select();
                            } else if (e.key === 'ArrowLeft') {
                              e.preventDefault();
                              if (idx > 0) {
                                priceInputRefs.current[idx - 1]?.focus();
                                priceInputRefs.current[idx - 1]?.select();
                              } else {
                                barcodeInputRef.current?.focus();
                              }
                            } else if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              if (idx < cart.length - 1) {
                                qtyInputRefs.current[idx + 1]?.focus();
                                qtyInputRefs.current[idx + 1]?.select();
                              }
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              if (idx > 0) {
                                qtyInputRefs.current[idx - 1]?.focus();
                                qtyInputRefs.current[idx - 1]?.select();
                              } else {
                                barcodeInputRef.current?.focus();
                              }
                            } else if (e.key === 'Enter' || e.key === 'Escape') {
                              e.preventDefault();
                              barcodeInputRef.current?.focus();
                            }
                          }}
                          className={`w-16 px-1.5 py-0.5 text-center font-mono rounded text-xs outline-hidden transition-all shadow-2xs ${
                            isMultiQty
                              ? 'bg-amber-100 text-amber-950 font-black border-2 border-amber-500 ring-2 ring-amber-400/40'
                              : 'bg-stone-50 hover:bg-stone-100 focus:bg-white border border-stone-300 focus:border-emerald-600 font-bold'
                          }`}
                          title="[Tab / →] to Price, direct numeric input to change qty"
                        />
                        <span className="text-[10px] text-stone-500 font-bold">{item.unit_label || item.product.unit_type}</span>
                        <button
                          type="button"
                          onClick={() => updateItemQty(idx, item.qty + (item.product.is_weighable || (item.qty % 1 !== 0) ? 0.25 : 1))}
                          className="p-1 bg-stone-100 hover:bg-stone-200 rounded-md text-stone-700 cursor-pointer shadow-2xs"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="col-span-2 text-right font-mono text-stone-900">
                        <div className="text-sm font-black">Rs. {item.subtotal.toLocaleString()}</div>
                        <div className="flex items-center justify-end gap-1 text-[11px] text-stone-600 font-semibold">
                          <span>@ Rs.</span>
                          <input
                            ref={(el) => { priceInputRefs.current[idx] = el; }}
                            type="number"
                            min="0"
                            step="any"
                            value={item.unit_price}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && val >= 0) {
                                updateItemPrice(idx, val);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
                                e.preventDefault();
                                qtyInputRefs.current[idx]?.focus();
                                qtyInputRefs.current[idx]?.select();
                              } else if (e.key === 'Tab' || e.key === 'ArrowRight') {
                                e.preventDefault();
                                if (idx < cart.length - 1) {
                                  qtyInputRefs.current[idx + 1]?.focus();
                                  qtyInputRefs.current[idx + 1]?.select();
                                } else {
                                  barcodeInputRef.current?.focus();
                                }
                              } else if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                if (idx < cart.length - 1) {
                                  priceInputRefs.current[idx + 1]?.focus();
                                  priceInputRefs.current[idx + 1]?.select();
                                }
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                if (idx > 0) {
                                  priceInputRefs.current[idx - 1]?.focus();
                                  priceInputRefs.current[idx - 1]?.select();
                                } else {
                                  barcodeInputRef.current?.focus();
                                }
                              } else if (e.key === 'Enter' || e.key === 'Escape') {
                                e.preventDefault();
                                barcodeInputRef.current?.focus();
                              }
                            }}
                            className="w-16 px-1 py-0.5 text-right font-mono font-bold bg-transparent hover:bg-stone-100 focus:bg-white border-b-2 border-stone-300 focus:border-emerald-600 text-[11px] outline-hidden"
                            title="[Shift+Tab / ←] to Qty, direct numeric input to change price"
                          />
                        </div>
                      </div>

                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="text-stone-300 hover:text-red-600 p-1 rounded cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* BOTTOM QUICK ACTIONS */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={async () => {
                if (cart.length > 0) {
                  const ok = await posConfirm('Discard Active Cart', 'Are you sure you want to discard all scanned items in the active bill?');
                  if (ok) clearActiveCart();
                }
              }}
              disabled={cart.length === 0}
              className="px-3 py-1.5 text-stone-500 hover:text-red-700 disabled:opacity-30 text-xs font-bold cursor-pointer"
            >
              Clear Cart [Esc]
            </button>

            <div className="text-xs text-stone-500 font-mono">
              Total Items: <strong className="text-stone-800">{totalItemsCount}</strong> • Units: <strong className="text-stone-800">{totalQty}</strong>
            </div>
          </div>
        </div>

        {/* RIGHT: BILL SUMMARY & CHECKOUT BUTTON */}
        <div className="md:col-span-4 bg-white p-3 sm:p-4 rounded-2xl sm:rounded-3xl border border-stone-200 shadow-sm flex flex-col justify-between space-y-3 sm:space-y-4">
          
          <div className="space-y-3 sm:space-y-4">
            <h2 className="text-sm font-bold text-stone-900 uppercase tracking-wide border-b border-stone-200 pb-2">
              Payment Summary
            </h2>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-stone-600">
                <span>Gross Subtotal:</span>
                <span className="font-mono font-bold text-stone-900">Rs. {grossTotal.toLocaleString()}</span>
              </div>

              {totalTax > 0 && (
                <div className="flex justify-between text-stone-600">
                  <span>Sales Tax (Category-wise):</span>
                  <span className="font-mono font-bold text-stone-900">Rs. {totalTax.toLocaleString()}</span>
                </div>
              )}

              <div className="flex justify-between items-center text-stone-600">
                <span>Discount (Rs.):</span>
                <input
                  type="number"
                  min="0"
                  value={currentTab.discountAmount || ''}
                  onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                  placeholder="0"
                  className="w-24 px-2 py-1 bg-stone-100 border border-stone-300 rounded-lg text-right font-mono font-bold text-xs outline-hidden"
                />
              </div>

              {/* CASH ROUNDING PREVIEW */}
              {netPayable % 5 !== 0 && (
                <div className="flex justify-between text-[11px] text-stone-500 italic">
                  <span>Cash Rounding (nearest Rs. 5):</span>
                  <span>{netPayable % 5 >= 2.5 ? `+Rs. ${5 - (netPayable % 5)}` : `-Rs. ${netPayable % 5}`}</span>
                </div>
              )}
            </div>

            {/* BIG TOTAL BOX */}
            <div className="p-3 sm:p-4 bg-stone-900 text-white rounded-xl sm:rounded-2xl space-y-0.5 sm:space-y-1">
              <span className="text-[10px] sm:text-[11px] text-stone-400 uppercase font-mono block">Net Payable Amount</span>
              <span className="text-2xl sm:text-3xl font-black font-mono text-[#E3D5C0] block">
                PKR {netPayable.toLocaleString()}
              </span>
              <span className="text-[10px] text-stone-400 block">Inclusive of line discounts</span>
            </div>
          </div>

          {/* CHECKOUT BUTTON */}
          <button
            onClick={() => setIsPaymentModalOpen(true)}
            disabled={cart.length === 0}
            className="w-full py-3 sm:py-3.5 bg-[#5B7981] hover:bg-[#486269] disabled:opacity-40 text-white rounded-xl sm:rounded-2xl text-xs sm:text-sm font-black shadow-lg cursor-pointer flex items-center justify-center gap-2 transition-all hover:scale-102"
          >
            <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
            <span>CHECKOUT &amp; PRINT [Enter]</span>
          </button>
        </div>

      </div>

      {/* LOOSE COMMODITY & DUAL-UNIT MODAL */}
      <LooseWeightModal
        isOpen={isWeightModalOpen}
        onClose={() => setIsWeightModalOpen(false)}
        products={allProducts}
        onConfirm={(prod, qty, price, deductQty, unitLabel, isSubunitSale) => {
          lastItemAddedTimeRef.current = Date.now();
          addItemToActiveTab(prod, qty, price, deductQty, unitLabel, isSubunitSale);
          hardwareService.playScanSuccess();
        }}
      />

      {/* SPLIT PAYMENT MODAL */}
      <SplitPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        netPayable={netPayable}
        totalTax={totalTax}
        customer={currentTab.customer}
        storeSettings={storeSettings}
        onConfirmCheckout={handleConfirmCheckout}
        onSelectCustomer={setCustomer}
      />

      {/* COMPLETED RECEIPT CARD PREVIEW */}
      {completedInvoice && (
        <HighDensityReceiptCard
          invoice={completedInvoice}
          storeSettings={storeSettings}
          onClose={() => setCompletedInvoice(null)}
          isDuplicateReprint={isReprintMode}
          shouldAutoPrint={shouldAutoPrintReceipt}
        />
      )}

      {/* CUSTOMER SEARCH MODAL */}
      {isCustModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-stone-300 rounded-3xl max-w-md w-full shadow-2xl p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-stone-200 pb-2">
              <h3 className="font-bold text-sm text-stone-900">Select Customer for Khata Credit</h3>
              <button onClick={() => setIsCustModalOpen(false)} className="text-stone-400 hover:text-stone-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <input
              type="text"
              value={custQuery}
              onChange={(e) => handleSearchCustomer(e.target.value)}
              placeholder="Search by name, phone or nickname..."
              className="w-full px-3.5 py-2.5 bg-stone-100 border border-stone-300 rounded-xl text-xs font-medium outline-hidden focus:bg-white focus:border-[#5B7981]"
              autoFocus
            />

            <div className="max-h-56 overflow-y-auto divide-y divide-stone-100">
              {custResults.map(c => (
                <div
                  key={c.id}
                  onClick={() => {
                    setCustomer(c);
                    setIsCustModalOpen(false);
                    hardwareService.playScanSuccess();
                  }}
                  className="p-2.5 hover:bg-stone-50 flex justify-between items-center cursor-pointer text-xs"
                >
                  <div>
                    <span className="font-bold text-stone-900 block">{c.name}</span>
                    <span className="text-[10px] text-stone-500 font-mono">{c.phone}</span>
                  </div>
                  <span className="font-mono font-bold text-amber-700">
                    Rs. {c.current_balance.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* F6: DEDICATED EXCHANGE MODAL */}
      {isExchangeModalOpen && (
        <ExchangeModal
          isOpen={isExchangeModalOpen}
          onClose={() => setIsExchangeModalOpen(false)}
          storeSettings={storeSettings}
          cashierName={cashierName}
          activeShiftId={activeShiftId}
          onExchangeComplete={() => {
            catalogService.getProducts().then(setAllProducts);
          }}
        />
      )}

      {/* F7: QUICK PRICE CHECK MODAL */}
      {isPriceCheckModalOpen && (
        <QuickPriceCheckModal
          isOpen={isPriceCheckModalOpen}
          onClose={() => setIsPriceCheckModalOpen(false)}
          onAddToCart={(prod) => {
            lastItemAddedTimeRef.current = Date.now();
            addItemToActiveTab(prod);
          }}
        />
      )}

      {/* F8: QUICK PRODUCT CREATION MODAL */}
      {isQuickAddModalOpen && (
        <QuickAddItemModal
          isOpen={isQuickAddModalOpen}
          initialBarcode={pendingBarcode}
          onClose={() => {
            lastModalCloseTimeRef.current = Date.now();
            setIsQuickAddModalOpen(false);
            setPendingBarcode('');
            setTimeout(() => barcodeInputRef.current?.focus(), 80);
          }}
          onProductCreated={(prod) => {
            lastModalCloseTimeRef.current = Date.now();
            lastItemAddedTimeRef.current = Date.now();
            setIsQuickAddModalOpen(false);
            setPendingBarcode('');
            addItemToActiveTab(prod);
            catalogService.getProducts().then(setAllProducts);
            setTimeout(() => barcodeInputRef.current?.focus(), 80);
          }}
        />
      )}

      {/* Ctrl+D: CASH DROP MODAL */}
      {isCashDropModalOpen && (
        <CashDropModal
          isOpen={isCashDropModalOpen}
          onClose={() => setIsCashDropModalOpen(false)}
          activeShiftId={activeShiftId}
          cashierName={cashierName}
          storeSettings={storeSettings}
          onDropComplete={() => {
            // Updated in DB
          }}
        />
      )}

      {/* CANCEL / VOID BILL MODAL */}
      {isCancelModalOpen && (
        <CancelBillModal
          isOpen={isCancelModalOpen}
          onClose={() => setIsCancelModalOpen(false)}
          cartCount={cart.length}
          totalAmount={netPayable}
          cashierName={cashierName}
          onConfirmCancel={() => {
            clearActiveCart();
          }}
        />
      )}

      {/* SHIFT INVOICES HISTORY & QUICK REPRINT/RE-OPEN SIDE PANEL (A1) */}
      {isShiftHistoryOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex justify-end">
          <div className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col font-sans animate-in slide-in-from-right duration-200">
            {/* PANEL HEADER */}
            <div className="bg-[#243338] text-white p-4 border-b border-stone-700 shrink-0 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="bg-[#5B7981] text-[#E3D5C0] p-1.5 rounded-xl">
                    <History className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm tracking-wide">
                      {showAllShifts ? 'ALL HISTORICAL INVOICES' : 'CURRENT SHIFT INVOICES'}
                    </h3>
                    <p className="text-[11px] text-[#E3D5C0] font-mono">
                      {showAllShifts ? 'System-wide Database Archive' : `Shift #${activeShiftId ? activeShiftId.slice(-6) : 'Current'}`} • {shiftInvoices.length} Bills Loaded
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsShiftHistoryOpen(false)}
                  className="text-stone-300 hover:text-white p-1 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* SHIFT SCOPE TOGGLE */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-stone-900/60 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setShowAllShifts(false);
                    fetchShiftHistory(shiftHistorySearch, false);
                  }}
                  className={`py-1.5 rounded-lg transition-all cursor-pointer text-center ${
                    !showAllShifts ? 'bg-[#5B7981] text-white shadow-xs' : 'text-stone-300 hover:text-white'
                  }`}
                >
                  Current Shift
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAllShifts(true);
                    fetchShiftHistory(shiftHistorySearch, true);
                  }}
                  className={`py-1.5 rounded-lg transition-all cursor-pointer text-center ${
                    showAllShifts ? 'bg-amber-600 text-white shadow-xs' : 'text-stone-300 hover:text-white'
                  }`}
                >
                  All Past Shifts
                </button>
              </div>
            </div>

            {/* SEARCH & FILTER */}
            <div className="p-3 bg-stone-100 border-b border-stone-200 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={shiftHistorySearch}
                  onChange={(e) => {
                    const val = e.target.value;
                    setShiftHistorySearch(val);
                    if (liveSearchTimerRef.current) clearTimeout(liveSearchTimerRef.current);
                    liveSearchTimerRef.current = setTimeout(() => {
                      fetchShiftHistory(val, showAllShifts);
                    }, 200);
                  }}
                  placeholder="Search by Bill # (e.g. 0012), Customer Name or Phone..."
                  className="w-full pl-9 pr-3.5 py-1.5 bg-white border border-stone-300 rounded-xl text-xs font-bold outline-hidden focus:border-[#5B7981]"
                  autoFocus
                />
              </div>
            </div>

            {/* INVOICES LIST */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 divide-y divide-stone-100">
              {isLoadingShiftHistory ? (
                <div className="p-8 text-center text-stone-400 text-xs">
                  Loading shift bills...
                </div>
              ) : shiftInvoices.filter(inv => {
                if (!shiftHistorySearch.trim()) return true;
                const q = shiftHistorySearch.trim().toLowerCase();
                return (
                  inv.invoice_number.toLowerCase().includes(q) ||
                  (inv.customer_name || '').toLowerCase().includes(q) ||
                  (inv.customer_phone || '').includes(q)
                );
              }).length === 0 ? (
                <div className="p-8 text-center text-stone-400 text-xs">
                  No invoices found matching query in this shift.
                </div>
              ) : (
                shiftInvoices
                  .filter(inv => {
                    if (!shiftHistorySearch.trim()) return true;
                    const q = shiftHistorySearch.trim().toLowerCase();
                    return (
                      inv.invoice_number.toLowerCase().includes(q) ||
                      (inv.customer_name || '').toLowerCase().includes(q) ||
                      (inv.customer_phone || '').includes(q)
                    );
                  })
                  .map(inv => {
                    const d = new Date(inv.created_at);
                    const formattedDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                    const formattedTime = d.toLocaleTimeString('en-PK', {
                      hour: '2-digit',
                      minute: '2-digit'
                    });
                    return (
                      <div
                        key={inv.id}
                        className="p-3 bg-stone-50 hover:bg-stone-100/80 rounded-2xl border border-stone-200 transition-all space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-black text-xs text-stone-900">
                              #{inv.invoice_number}
                            </span>
                            <span className="text-[10px] text-stone-500 font-mono">
                              {showAllShifts ? `${formattedDate} • ` : ''}{formattedTime}
                            </span>
                          </div>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase font-mono ${
                            inv.payment_mode === 'cash' ? 'bg-emerald-100 text-emerald-800' :
                            inv.payment_mode === 'card' ? 'bg-blue-100 text-blue-800' :
                            inv.payment_mode === 'khata' ? 'bg-amber-100 text-amber-900' :
                            'bg-purple-100 text-purple-900'
                          }`}>
                            {inv.payment_mode}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-stone-800 block">
                              {inv.customer_name || 'Walk-in Customer'}
                            </span>
                            <span className="text-[10px] text-stone-500 font-mono">
                              {(inv.items || []).length} items • Qty: {(inv.items || []).reduce((s, it) => s + it.qty, 0)}
                            </span>
                          </div>
                          <span className="text-sm font-black font-mono text-stone-900">
                            PKR {inv.total_amount.toLocaleString()}
                          </span>
                        </div>

                        {/* ACTIONS: REPRINT DUPLICATE & LOAD IN CART */}
                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-stone-200/80">
                          <button
                            type="button"
                            onClick={() => handleReprintShiftInvoice(inv)}
                            className="py-1.5 px-2 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                            title="Preview and print marked duplicate receipt"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Reprint Bill [P]</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleLoadInvoiceInCart(inv)}
                            className="py-1.5 px-2 bg-[#5B7981] hover:bg-[#486269] text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-2xs"
                            title="Re-open all items in active cart tab"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Re-open in Cart</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            {/* PANEL FOOTER */}
            <div className="p-3 bg-stone-100 border-t border-stone-200 flex items-center justify-between text-xs text-stone-600 font-mono shrink-0">
              <span>Press [Esc] to Close Drawer</span>
              <button
                onClick={() => setIsShiftHistoryOpen(false)}
                className="px-3 py-1 bg-stone-300 hover:bg-stone-400 text-stone-800 rounded-lg font-bold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
