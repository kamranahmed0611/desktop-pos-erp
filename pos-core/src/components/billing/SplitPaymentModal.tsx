import React, { useState, useEffect, useRef } from 'react';
import { Customer, PaymentMode, StoreSettings } from '../../types';
import { posAlert, posConfirm } from '../../store/uiStore';
import { khataService } from '../../services/khataService';
import { hardwareService } from '../../services/hardwareService';
import { 
  Banknote, CreditCard, Smartphone, BookOpen, 
  Check, X, AlertTriangle, Calculator, Sparkles, Printer,
  Search, UserPlus, UserCheck, ShieldCheck, ArrowLeft
} from 'lucide-react';

interface SplitPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmCheckout: (params: {
    payment_mode: PaymentMode;
    paid_amount: number;
    split_khata_amount?: number;
    amanat_used?: number;
    notes?: string;
    should_print?: boolean;
  }) => void;
  netPayable: number;
  totalTax: number;
  customer: Customer | null;
  storeSettings: StoreSettings;
  onSelectCustomer?: (customer: Customer | null) => void;
}

export const SplitPaymentModal: React.FC<SplitPaymentModalProps> = ({
  isOpen,
  onClose,
  onConfirmCheckout,
  netPayable,
  totalTax,
  customer,
  storeSettings,
  onSelectCustomer
}) => {
  const [activeMode, setActiveMode] = useState<PaymentMode>('cash');
  const [cashTendered, setCashTendered] = useState<number | ''>('');
  const [splitKhataAmount, setSplitKhataAmount] = useState<number>(0);
  const [applyAmanat, setApplyAmanat] = useState(false);
  const [notes, setNotes] = useState('');
  const [shouldPrint, setShouldPrint] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Embedded Khata customer selector / creator state
  const [isKhataPickerOpen, setIsKhataPickerOpen] = useState(false);
  const [khataSearchQuery, setKhataSearchQuery] = useState('');
  const [khataResults, setKhataResults] = useState<Customer[]>([]);
  const [selectedKhataIndex, setSelectedKhataIndex] = useState<number>(-1);

  // New Khata Customer inline creation with Admin PIN
  const [isNewCustFormOpen, setIsNewCustFormOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustLimit, setNewCustLimit] = useState<number>(25000);
  const [newCustPin, setNewCustPin] = useState('');
  const [newCustError, setNewCustError] = useState('');

  const cashInputRef = useRef<HTMLInputElement>(null);
  const khataSearchInputRef = useRef<HTMLInputElement>(null);
  const openedAtRef = useRef<number>(0);

  // Amanat calculations
  const availableAmanat = Number(customer?.amanat_balance || 0);
  const amanatUsed = (applyAmanat && availableAmanat > 0) ? Math.min(availableAmanat, netPayable) : 0;
  const netAfterAmanat = Math.max(0, netPayable - amanatUsed);

  // Cash rounding to nearest Rs. 5
  let roundedCashPayable = netAfterAmanat;
  let roundOff = 0;
  if (activeMode === 'cash') {
    const remainder = netAfterAmanat % 5;
    if (remainder !== 0) {
      if (remainder >= 2.5) {
        roundedCashPayable = netAfterAmanat + (5 - remainder);
        roundOff = 5 - remainder;
      } else {
        roundedCashPayable = netAfterAmanat - remainder;
        roundOff = -remainder;
      }
    }
  }

  const effectivePayable = activeMode === 'cash' ? roundedCashPayable : netAfterAmanat;
  const effectivePaid = cashTendered === '' ? effectivePayable : Number(cashTendered);
  const changeDue = Math.max(0, effectivePaid - (effectivePayable - splitKhataAmount));

  // Reset and focus on open
  useEffect(() => {
    if (isOpen) {
      openedAtRef.current = Date.now();
      setIsSubmitting(false);
      setActiveMode('cash');
      setApplyAmanat(false);
      setCashTendered(effectivePayable);
      setSplitKhataAmount(0);
      setNotes('');
      setShouldPrint(true); // Always default to Print: YES (Y) for every new checkout
      setIsKhataPickerOpen(false);
      setIsNewCustFormOpen(false);
      setKhataSearchQuery('');
      setNewCustName('');
      setNewCustPhone('');
      setNewCustPin('');
      setNewCustError('');

      // Auto-focus amount input and select all text for instant keyboard typing / override
      setTimeout(() => {
        cashInputRef.current?.focus();
        cashInputRef.current?.select();
      }, 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setCashTendered(effectivePayable);
  }, [effectivePayable, activeMode]);

  // Load / search Khata customers
  useEffect(() => {
    if (isKhataPickerOpen) {
      khataService.searchCustomers(khataSearchQuery).then((res) => {
        setKhataResults(res);
        setSelectedKhataIndex(res.length > 0 ? 0 : -1);
      });
      setTimeout(() => khataSearchInputRef.current?.focus(), 60);
    }
  }, [isKhataPickerOpen, khataSearchQuery]);

  const handleQuickCash = (amount: number) => {
    setCashTendered(amount);
  };

  const handleSelectPaymentMode = (mode: PaymentMode) => {
    if (mode === 'khata') {
      setActiveMode('khata');
      if (!customer) {
        setIsKhataPickerOpen(true);
      }
    } else {
      setActiveMode(mode);
      setIsKhataPickerOpen(false);
      setIsNewCustFormOpen(false);
      setTimeout(() => {
        cashInputRef.current?.focus();
        cashInputRef.current?.select();
      }, 30);
    }
  };

  const handlePickCustomer = (c: Customer) => {
    if (onSelectCustomer) onSelectCustomer(c);
    setIsKhataPickerOpen(false);
    setIsNewCustFormOpen(false);
    setActiveMode('khata');
    hardwareService.playScanSuccess();
  };

  const handleCreateNewCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewCustError('');

    if (!newCustName.trim()) {
      setNewCustError('Customer name is required.');
      return;
    }
    if (!newCustPhone.trim()) {
      setNewCustError('Phone number is required.');
      return;
    }

    // Verify Admin PIN (Check localStorage, storeSettings, native Electron scrypt auth, and master PIN)
    const effectiveAdminPin = localStorage.getItem('pos_admin_pin') || storeSettings.admin_pin || '8888';
    let isAuthorized = (newCustPin === effectiveAdminPin || newCustPin === '22022' || newCustPin === '220222');
    
    if (!isAuthorized) {
      try {
        if ((window as any).electronAPI?.verifyAdminPin) {
          const res = await (window as any).electronAPI.verifyAdminPin({ pin: newCustPin });
          if (res && res.success) isAuthorized = true;
        }
      } catch {}
    }

    if (!isAuthorized) {
      hardwareService.playError();
      setNewCustError('Invalid Admin PIN. Authorized permission required.');
      return;
    }

    try {
      const created = await khataService.createCustomer({
        name: newCustName.trim(),
        phone: newCustPhone.trim(),
        credit_limit: newCustLimit || 25000
      });
      hardwareService.playCheckoutChime();
      if (onSelectCustomer) onSelectCustomer(created);
      setIsNewCustFormOpen(false);
      setIsKhataPickerOpen(false);
      setActiveMode('khata');
    } catch (err: any) {
      setNewCustError(err.message || 'Error creating customer.');
    }
  };

  const handleConfirm = async () => {
    if (isSubmitting || isKhataPickerOpen || isNewCustFormOpen) return;
    setIsSubmitting(true);

    // Check Khata credit limit if Khata involved
    if (activeMode === 'khata' || splitKhataAmount > 0) {
      if (!customer) {
        setIsSubmitting(false);
        setIsKhataPickerOpen(true);
        return;
      }
      const newBalance = customer.current_balance + (activeMode === 'khata' ? effectivePayable : splitKhataAmount);
      if (customer.credit_limit > 0 && newBalance > customer.credit_limit) {
        const proceed = await posConfirm(
          'Credit Limit Exceeded',
          `Customer credit limit exceeded!\n\nLimit: Rs. ${customer.credit_limit.toLocaleString()}\nNew Balance: Rs. ${newBalance.toLocaleString()}\n\nAuthorized by Admin/Owner to proceed?`,
          { confirmText: 'Authorize &amp; Charge', cancelText: 'Cancel', alertType: 'warning' }
        );
        if (!proceed) {
          setIsSubmitting(false);
          return;
        }
      }
    }

    try {
      onConfirmCheckout({
        payment_mode: activeMode,
        paid_amount: effectivePaid,
        split_khata_amount: splitKhataAmount > 0 ? splitKhataAmount : undefined,
        amanat_used: amanatUsed > 0 ? amanatUsed : undefined,
        notes: notes + (amanatUsed > 0 ? ` [Amanat used: Rs. ${amanatUsed}]` : ''),
        should_print: shouldPrint
      });
    } catch (e) {
      setIsSubmitting(false);
    }
  };

  // Keyboard Navigation: Z (Cash), X (Card), C (Digital), V (Khata), Y (Print), N (No Print), S (Split), A (Amanat), Enter, Esc
  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      // 1. If inside the New Customer registration form, let user type freely except Esc
      if (isNewCustFormOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setIsNewCustFormOpen(false);
          setTimeout(() => khataSearchInputRef.current?.focus(), 30);
        }
        return;
      }

      // 2. If inside Khata customer search picker
      if (isKhataPickerOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setIsKhataPickerOpen(false);
          setTimeout(() => {
            cashInputRef.current?.focus();
            cashInputRef.current?.select();
          }, 30);
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedKhataIndex(prev => Math.min(prev + 1, khataResults.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedKhataIndex(prev => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          if (selectedKhataIndex >= 0 && selectedKhataIndex < khataResults.length) {
            handlePickCustomer(khataResults[selectedKhataIndex]);
          }
          return;
        }
        return;
      }

      // 3. Main Payment Modal Key Catching
      // Keys: ArrowLeft / ArrowRight to cycle modes, Y, N, S, A, Enter, Esc are ALWAYS intercepted even if amount input has focus!
      const paymentModes: PaymentMode[] = ['cash', 'card', 'easypaisa', 'khata'];

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const currIdx = paymentModes.indexOf(activeMode);
        const nextIdx = (currIdx + 1) % paymentModes.length;
        handleSelectPaymentMode(paymentModes[nextIdx]);
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const currIdx = paymentModes.indexOf(activeMode);
        const prevIdx = (currIdx - 1 + paymentModes.length) % paymentModes.length;
        handleSelectPaymentMode(paymentModes[prevIdx]);
        return;
      }

      const k = e.key.toLowerCase();

      if (k === 'z') {
        e.preventDefault();
        handleSelectPaymentMode('cash');
        return;
      }
      if (k === 'x') {
        e.preventDefault();
        handleSelectPaymentMode('card');
        return;
      }
      if (k === 'c') {
        e.preventDefault();
        handleSelectPaymentMode('easypaisa');
        return;
      }
      if (k === 'v') {
        e.preventDefault();
        handleSelectPaymentMode('khata');
        return;
      }
      if (k === 'y') {
        e.preventDefault();
        setShouldPrint(true);
        return;
      }
      if (k === 'n') {
        e.preventDefault();
        setShouldPrint(false);
        return;
      }
      if (k === 'p' || e.key === 'F10') {
        e.preventDefault();
        setShouldPrint(prev => !prev);
        return;
      }
      if (k === 's') {
        e.preventDefault();
        setSplitKhataAmount(prev => (prev > 0 ? 0 : Math.round(effectivePayable / 2)));
        return;
      }
      if (k === 'a' && availableAmanat > 0) {
        e.preventDefault();
        setApplyAmanat(prev => !prev);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (Date.now() - openedAtRef.current < 250) {
          return;
        }
        if (!isSubmitting) {
          handleConfirm();
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // If user typed digits 0-9 and focus wasn't on amount input, focus it
      if ((e.key >= '0' && e.key <= '9') && document.activeElement !== cashInputRef.current) {
        cashInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [
    isOpen, isKhataPickerOpen, isNewCustFormOpen, khataResults, selectedKhataIndex,
    activeMode, effectivePaid, splitKhataAmount, notes, shouldPrint, customer, 
    effectivePayable, availableAmanat, applyAmanat
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/85 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 font-sans select-none">
      <div className="bg-white border border-stone-300 rounded-3xl max-w-xl w-full max-h-[94vh] flex flex-col shadow-2xl overflow-hidden font-sans">
        
        {/* HEADER */}
        <div className="bg-[#243338] text-white px-5 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="bg-[#5B7981] text-[#E3D5C0] p-1.5 rounded-xl">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm tracking-wide">
                SETTLEMENT &amp; PAYMENT [Use ← / → to Select Mode]
              </h3>
              <p className="text-[11px] text-[#E3D5C0]">
                Press Enter to Finalize | Esc to Cancel | Y/N to Toggle Print | S to Split
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-3.5 sm:space-y-4 flex-1 min-h-0 overflow-y-auto">
          
          {/* NET PAYABLE BANNER */}
          <div className="p-4 bg-stone-900 text-white rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-xs text-stone-400 block font-mono">
                {activeMode === 'cash' && roundOff !== 0 ? `Exact: Rs. ${netAfterAmanat.toLocaleString()} (Rounded to Rs. 5)` : 'Total Amount Due'}
              </span>
              <span className="text-2xl sm:text-3xl font-black font-mono text-[#E3D5C0]">
                PKR {effectivePayable.toLocaleString()}
              </span>
              {amanatUsed > 0 && (
                <span className="text-[11px] text-emerald-400 block font-mono font-bold mt-0.5">
                  ✓ Amanat deposit applied: -Rs. {amanatUsed.toLocaleString()} (Orig: Rs. {netPayable.toLocaleString()})
                </span>
              )}
            </div>

            {customer && (
              <div className="text-right">
                <span className="text-[10px] text-stone-400 block">CUSTOMER KHATA</span>
                <span className="text-xs font-bold text-white block">{customer.name}</span>
                <span className="text-[11px] font-mono text-amber-300 block">
                  Due: Rs. {customer.current_balance.toLocaleString()}
                </span>
                {availableAmanat > 0 && (
                  <span className="text-[11px] font-mono text-emerald-300 font-bold block">
                    Amanat: Rs. {availableAmanat.toLocaleString()}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* AMANAT AUTO-DEDUCT BANNER */}
          {customer && availableAmanat > 0 && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-700" />
                <div>
                  <span className="text-xs font-bold text-emerald-950 block">
                    Customer Amanat Available: Rs. {availableAmanat.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-emerald-700">
                    {applyAmanat 
                      ? `Applied Rs. ${amanatUsed.toLocaleString()} from advance wallet. Remaining payable is Rs. ${effectivePayable.toLocaleString()}.` 
                      : `You can deduct up to Rs. ${Math.min(availableAmanat, netPayable).toLocaleString()} directly from advance deposit.`}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setApplyAmanat(prev => !prev)}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer transition-all ${
                  applyAmanat
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300'
                }`}
              >
                {applyAmanat ? '✓ Amanat Applied [A]' : '+ Use Amanat [A]'}
              </button>
            </div>
          )}

          {/* CREDIT LIMIT SOFT WARNING */}
          {customer && customer.credit_limit > 0 && (customer.current_balance + (activeMode === 'khata' ? effectivePayable : splitKhataAmount) > customer.credit_limit) && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-2xl flex items-center gap-2.5 text-amber-900">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <div className="text-xs">
                <span className="font-bold block">Credit Limit Warning</span>
                <span className="text-[11px] text-amber-800">
                  New balance Rs. {(customer.current_balance + (activeMode === 'khata' ? effectivePayable : splitKhataAmount)).toLocaleString()} exceeds limit of Rs. {customer.credit_limit.toLocaleString()}. (Requires confirmation on save)
                </span>
              </div>
            </div>
          )}

          {/* PAYMENT MODE SELECTOR [← / →] */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wide flex items-center gap-1.5">
                <span>Payment Method</span>
                <span className="text-[10px] font-mono text-[#5B7981] bg-stone-100 px-1.5 py-0.5 rounded border border-stone-300">
                  Use [← / →] to navigate
                </span>
              </label>
              <button
                type="button"
                onClick={() => setSplitKhataAmount(splitKhataAmount > 0 ? 0 : Math.round(effectivePayable / 2))}
                className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                  splitKhataAmount > 0 ? 'bg-[#5B7981] text-white border-[#5B7981]' : 'bg-stone-100 text-stone-600 border-stone-300'
                }`}
              >
                Split Mode [S]
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => handleSelectPaymentMode('cash')}
                className={`p-3 rounded-2xl flex flex-col items-center gap-1.5 font-bold text-xs transition-all cursor-pointer ${
                  activeMode === 'cash'
                    ? 'bg-[#5B7981] text-white shadow-md ring-2 ring-[#243338]'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-800'
                }`}
              >
                <Banknote className="w-5 h-5" />
                <span>Cash</span>
                {activeMode === 'cash' && <span className="text-[9px] bg-white/20 px-1.5 py-0.2 rounded">ACTIVE</span>}
              </button>

              <button
                type="button"
                onClick={() => handleSelectPaymentMode('card')}
                className={`p-3 rounded-2xl flex flex-col items-center gap-1.5 font-bold text-xs transition-all cursor-pointer ${
                  activeMode === 'card'
                    ? 'bg-blue-700 text-white shadow-md ring-2 ring-blue-900'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-800'
                }`}
              >
                <CreditCard className="w-5 h-5" />
                <span>Card</span>
                {activeMode === 'card' && <span className="text-[9px] bg-white/20 px-1.5 py-0.2 rounded">ACTIVE</span>}
              </button>

              <button
                type="button"
                onClick={() => handleSelectPaymentMode('easypaisa')}
                className={`p-3 rounded-2xl flex flex-col items-center gap-1.5 font-bold text-xs transition-all cursor-pointer ${
                  activeMode === 'easypaisa'
                    ? 'bg-emerald-700 text-white shadow-md ring-2 ring-emerald-900'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-800'
                }`}
              >
                <Smartphone className="w-5 h-5" />
                <span>Digital</span>
                {activeMode === 'easypaisa' && <span className="text-[9px] bg-white/20 px-1.5 py-0.2 rounded">ACTIVE</span>}
              </button>

              <button
                type="button"
                onClick={() => handleSelectPaymentMode('khata')}
                className={`p-3 rounded-2xl flex flex-col items-center gap-1.5 font-bold text-xs transition-all cursor-pointer ${
                  activeMode === 'khata'
                    ? 'bg-amber-600 text-white shadow-md ring-2 ring-amber-800'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-800'
                }`}
              >
                <BookOpen className="w-5 h-5" />
                <span>Khata</span>
                {activeMode === 'khata' && <span className="text-[9px] bg-white/20 px-1.5 py-0.2 rounded">ACTIVE</span>}
              </button>
            </div>
          </div>

          {/* EMBEDDED KHATA CUSTOMER SEARCH / SELECTION VIEW */}
          {isKhataPickerOpen && !isNewCustFormOpen && (
            <div className="p-4 bg-amber-50/80 rounded-2xl border-2 border-amber-300 space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-amber-700" />
                  <span className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                    Select Khata Customer [V]
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsNewCustFormOpen(true)}
                  className="px-2.5 py-1 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                >
                  <UserPlus className="w-3.5 h-3.5" /> + New Khata Customer
                </button>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
                <input
                  ref={khataSearchInputRef}
                  type="text"
                  value={khataSearchQuery}
                  onChange={(e) => setKhataSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsKhataPickerOpen(false);
                      setTimeout(() => {
                        cashInputRef.current?.focus();
                        cashInputRef.current?.select();
                      }, 40);
                    }
                  }}
                  placeholder="Search by customer name, phone or nickname..."
                  className="w-full pl-9 pr-3.5 py-2 bg-white border border-amber-300 rounded-xl text-xs font-medium outline-hidden focus:border-amber-600 focus:ring-1 focus:ring-amber-600 shadow-2xs"
                />
              </div>

              <div className="max-h-48 overflow-y-auto divide-y divide-amber-200/60 bg-white rounded-xl border border-amber-200">
                {khataResults.length === 0 ? (
                  <div className="p-4 text-center text-xs text-stone-500">
                    No customer matched. Click "+ New Khata Customer" to register immediately.
                  </div>
                ) : (
                  khataResults.map((c, idx) => (
                    <div
                      key={c.id}
                      onClick={() => handlePickCustomer(c)}
                      className={`p-2.5 flex justify-between items-center cursor-pointer text-xs transition-colors ${
                        idx === selectedKhataIndex ? 'bg-amber-100 font-bold' : 'hover:bg-amber-50'
                      }`}
                    >
                      <div>
                        <span className="font-bold text-stone-900 block">{c.name}</span>
                        <span className="text-[10px] text-stone-500 font-mono">{c.phone} {c.nickname && `("${c.nickname}")`}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-amber-800 block">
                          Due: Rs. {c.current_balance.toLocaleString()}
                        </span>
                        {c.credit_limit > 0 && (
                          <span className="text-[9px] text-stone-400 font-mono">
                            Limit: Rs. {c.credit_limit.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* INLINE NEW KHATA CUSTOMER FORM WITH ADMIN PIN VERIFICATION */}
          {isNewCustFormOpen && (
            <form onSubmit={handleCreateNewCustomer} className="p-4 bg-stone-50 rounded-2xl border-2 border-[#5B7981] space-y-3">
              <div className="flex justify-between items-center border-b border-stone-200 pb-2">
                <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-[#5B7981]" /> Register New Khata Customer
                </span>
                <button
                  type="button"
                  onClick={() => setIsNewCustFormOpen(false)}
                  className="text-stone-400 hover:text-stone-700 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>

              {newCustError && (
                <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-bold">
                  {newCustError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 mb-0.5">Customer Name *</label>
                  <input
                    type="text"
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                    placeholder="e.g. Haji Rafiq"
                    className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg text-xs font-bold outline-hidden focus:border-[#5B7981]"
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 mb-0.5">WhatsApp Phone *</label>
                  <input
                    type="tel"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    placeholder="03001234567"
                    className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg text-xs font-mono font-bold outline-hidden focus:border-[#5B7981]"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 mb-0.5">Credit Limit (Rs.)</label>
                  <input
                    type="number"
                    value={newCustLimit}
                    onChange={(e) => setNewCustLimit(Number(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg text-xs font-mono font-bold outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-amber-900 mb-0.5 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-700" /> Admin PIN (Required) *
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    value={newCustPin}
                    onChange={(e) => setNewCustPin(e.target.value)}
                    placeholder="Enter Admin PIN"
                    className="w-full px-2.5 py-1.5 bg-amber-50 border border-amber-300 rounded-lg text-xs font-mono font-black tracking-widest outline-hidden focus:border-amber-600"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsNewCustFormOpen(false)}
                  className="px-3 py-1.5 bg-stone-200 text-stone-700 rounded-lg text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#5B7981] hover:bg-[#486269] text-white rounded-lg text-xs font-black cursor-pointer shadow-xs"
                >
                  Confirm &amp; Create Khata
                </button>
              </div>
            </form>
          )}

          {/* ACTIVE MODE DETAILS: CASH TENDER &amp; DIRECT OVERRIDE */}
          {activeMode === 'cash' && (
            <div className="space-y-3 p-4 bg-stone-50 rounded-2xl border border-stone-200">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-stone-700">Cash Received from Customer</label>
                <span className="text-[11px] text-stone-500 font-mono">PKR (Direct number typing overrides)</span>
              </div>

              <input
                ref={cashInputRef}
                type="number"
                value={cashTendered}
                onChange={(e) => setCashTendered(e.target.value === '' ? '' : Number(e.target.value))}
                onFocus={(e) => e.target.select()}
                className="w-full px-4 py-3 bg-white border-2 border-stone-300 rounded-xl text-2xl font-mono font-black text-stone-900 focus:border-[#5B7981] focus:ring-2 focus:ring-[#5B7981]/30 outline-hidden text-right shadow-2xs"
                placeholder={String(effectivePayable)}
                autoFocus
              />

              {/* DYNAMIC SMART TENDER BUTTONS */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleQuickCash(effectivePayable)}
                  className="py-2 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-xl text-[11px] font-bold font-mono text-stone-900 cursor-pointer"
                >
                  Exact (Rs. {effectivePayable.toLocaleString()})
                </button>
                {Math.ceil(effectivePayable / 100) * 100 !== effectivePayable && (
                  <button
                    type="button"
                    onClick={() => handleQuickCash(Math.ceil(effectivePayable / 100) * 100)}
                    className="py-2 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-xl text-[11px] font-bold font-mono text-stone-900 cursor-pointer"
                  >
                    Rs. {(Math.ceil(effectivePayable / 100) * 100).toLocaleString()}
                  </button>
                )}
                {Math.ceil(effectivePayable / 500) * 500 > effectivePayable && (
                  <button
                    type="button"
                    onClick={() => handleQuickCash(Math.ceil(effectivePayable / 500) * 500)}
                    className="py-2 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-xl text-[11px] font-bold font-mono text-stone-900 cursor-pointer"
                  >
                    Rs. {(Math.ceil(effectivePayable / 500) * 500).toLocaleString()}
                  </button>
                )}
                {Math.ceil(effectivePayable / 1000) * 1000 > effectivePayable && (
                  <button
                    type="button"
                    onClick={() => handleQuickCash(Math.ceil(effectivePayable / 1000) * 1000)}
                    className="py-2 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-xl text-[11px] font-bold font-mono text-stone-900 cursor-pointer"
                  >
                    Rs. {(Math.ceil(effectivePayable / 1000) * 1000).toLocaleString()}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleQuickCash(5000)}
                  className="py-2 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-xl text-[11px] font-bold font-mono text-amber-900 cursor-pointer"
                >
                  Rs. 5,000 Note
                </button>
              </div>

              {/* CHANGE DUE DISPLAY */}
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-900">CHANGE RETURNED TO CUSTOMER:</span>
                <span className="text-lg font-black font-mono text-emerald-800">
                  Rs. {changeDue.toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {activeMode === 'easypaisa' && (
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-2 text-center">
              <span className="text-xs font-bold text-emerald-900 block">
                EASYPAISA / JAZZCASH DIGITAL TRANSFER
              </span>
              <p className="text-xs text-stone-600 font-mono">
                Store Account: <strong className="text-stone-900">{storeSettings.easypaisa_number || storeSettings.phone}</strong>
              </p>
              <div className="p-2 bg-white rounded-xl inline-block border border-stone-200 shadow-2xs">
                <span className="text-[11px] text-emerald-700 font-bold block font-mono">
                  Scan QR / Send Rs. {effectivePayable.toLocaleString()}
                </span>
              </div>
              <p className="text-[11px] text-stone-500">
                Cashier visually checks transaction on mobile phone and clicks Confirm.
              </p>
            </div>
          )}

          {activeMode === 'khata' && !isKhataPickerOpen && (
            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-amber-900 block">
                  CHARGE FULL AMOUNT TO CUSTOMER KHATA ACCOUNT
                </span>
                <button
                  type="button"
                  onClick={() => setIsKhataPickerOpen(true)}
                  className="text-xs font-bold text-amber-800 hover:text-amber-950 underline cursor-pointer"
                >
                  Change Customer [V]
                </button>
              </div>
              {customer ? (
                <div className="text-xs text-stone-700 space-y-1">
                  <p>Customer: <strong>{customer.name}</strong> ({customer.phone})</p>
                  <p>Current Balance: <strong>Rs. {customer.current_balance.toLocaleString()}</strong></p>
                  <p className="text-amber-800 font-bold">
                    New Balance: Rs. {(customer.current_balance + effectivePayable).toLocaleString()}
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs text-red-700 font-bold">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> No customer selected!
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsKhataPickerOpen(true)}
                    className="px-2.5 py-1 bg-amber-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                  >
                    Select Customer
                  </button>
                </div>
              )}
            </div>
          )}

          {/* PRINT RECEIPT TOGGLE [ Y / N ] */}
          <div className="p-3 bg-stone-100 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Printer className="w-4 h-4 text-stone-600" />
              <div>
                <span className="font-bold text-stone-900 text-xs block">Print Paper Receipt?</span>
                <span className="text-[10px] text-stone-500 font-mono">
                  {shouldPrint ? 'YES: Will send slip to 80mm printer' : 'NO: Paperless sale (Zero delay if printer offline)'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShouldPrint(true)}
                className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold cursor-pointer transition-all ${
                  shouldPrint
                    ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-800'
                    : 'bg-stone-200 text-stone-600 hover:bg-stone-300'
                }`}
                title="Press Y to print"
              >
                [Y] Print
              </button>
              <button
                type="button"
                onClick={() => setShouldPrint(false)}
                className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold cursor-pointer transition-all ${
                  !shouldPrint
                    ? 'bg-stone-800 text-white shadow-xs ring-2 ring-stone-900'
                    : 'bg-stone-200 text-stone-600 hover:bg-stone-300'
                }`}
                title="Press N to skip print"
              >
                [N] No Print
              </button>
            </div>
          </div>
        </div>

        {/* DOCKED ACTIONS FOOTER */}
        <div className="bg-stone-50 px-5 sm:px-6 py-3 border-t border-stone-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl text-xs font-bold cursor-pointer transition-colors"
          >
            Cancel [Esc]
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className={`px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-black shadow-lg cursor-pointer flex items-center gap-2 transition-all hover:scale-102 disabled:opacity-50 disabled:cursor-not-allowed ${
              shouldPrint
                ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                : 'bg-[#5B7981] hover:bg-[#486269] text-white'
            }`}
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            <span>
              {isSubmitting
                ? 'PROCESSING...'
                : (shouldPrint ? 'CONFIRM &amp; PRINT [Enter]' : 'CONFIRM SALE (NO PRINT) [Enter]')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
