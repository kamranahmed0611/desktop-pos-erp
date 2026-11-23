import React, { useState } from 'react';
import { CurrencyDenominations, Shift, StoreSettings } from '../../types';
import { shiftService } from '../../services/shiftService';
import { hardwareService } from '../../services/hardwareService';
import { posAlert } from '../../store/uiStore';
import { 
  Lock, Calculator, Printer, Check, X, 
  AlertTriangle, CheckCircle2, DollarSign 
} from 'lucide-react';

interface BlindShiftCloseModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeShift: Shift;
  storeSettings: StoreSettings;
  onShiftClosed: () => void;
}

export const BlindShiftCloseModal: React.FC<BlindShiftCloseModalProps> = ({
  isOpen,
  onClose,
  activeShift,
  storeSettings,
  onShiftClosed
}) => {
  const [denominations, setDenominations] = useState<CurrencyDenominations>({
    notes_5000: 0,
    notes_1000: 0,
    notes_500: 0,
    notes_100: 0,
    notes_50: 0,
    notes_20: 0,
    notes_10: 0,
    coins: 0
  });

  const [varianceReason, setVarianceReason] = useState('');
  const [pettyExpense, setPettyExpense] = useState<number | ''>('');
  const [expenseNotes, setExpenseNotes] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [closedShift, setClosedShift] = useState<Shift | null>(null);

  if (!isOpen) return null;

  const totalCalculatedCash = shiftService.calculateTotalCash(denominations);

  const handleNoteChange = (denomKey: keyof CurrencyDenominations, val: string) => {
    const num = Math.max(0, parseInt(val, 10) || 0);
    setDenominations({ ...denominations, [denomKey]: num });
  };

  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const expenseAmt = Number(pettyExpense) || 0;
      const closed = await shiftService.closeShiftBlind(
        activeShift.id,
        denominations,
        varianceReason,
        expenseAmt,
        expenseNotes
      );

      // If petty expenses were recorded and print requested, print expense voucher safely
      if (expenseAmt > 0) {
        try {
          const voucher = `
========================================
       ${storeSettings.store_name}
      STAFF PETTY EXPENSE VOUCHER
========================================
Shift #: ${activeShift.id.slice(-6).toUpperCase()}
Date: ${new Date().toLocaleString()}
Cashier: ${activeShift.cashier_name}
----------------------------------------
AMOUNT PAID OUT: PKR ${expenseAmt.toLocaleString()}
Memo: ${expenseNotes || 'Counter staff tea/samosa/cleaning'}
----------------------------------------
Cashier Signature: ____________________
========================================
`;
          hardwareService.printReceiptSilent(voucher);
        } catch (printErr: any) {
          console.warn('[Printer Warning] Expense voucher print skipped:', printErr.message);
        }
      }

      hardwareService.playCheckoutChime();
      setClosedShift(closed);
      setIsSubmitted(true);
      onShiftClosed();

      // M5.5: Automatic 80mm Z-Report thermal printing upon shift close
      try {
        const autoZSlip = `
========================================
       ${storeSettings.store_name}
        OFFICIAL SHIFT Z-REPORT
========================================
Register #: ${closed.id.slice(-6).toUpperCase()}
Date: ${new Date().toLocaleString()}
Cashier: ${closed.cashier_name}
Started: ${new Date(closed.opened_at).toLocaleTimeString('en-PK')}
Closed:  ${new Date().toLocaleTimeString('en-PK')}
----------------------------------------
SALES RECONCILIATION:
Opening Float:       PKR ${closed.opening_float.toLocaleString()}
Cash Sales:          PKR ${closed.total_sales_cash.toLocaleString()}
Card Sales:          PKR ${closed.total_sales_card.toLocaleString()}
Digital (Easypaisa): PKR ${closed.total_sales_digital.toLocaleString()}
Khata Credit Sales:  PKR ${closed.total_sales_khata.toLocaleString()}
Returns (Cash Paid): PKR ${closed.total_returns_cash.toLocaleString()}
Petty Cash Out:      PKR ${closed.total_petty_expenses.toLocaleString()}
----------------------------------------
DRAWER CASH AUDIT:
Expected Cash:       PKR ${closed.expected_cash.toLocaleString()}
Actual Cash Declared:PKR ${(closed.closing_cash_actual || 0).toLocaleString()}
Variance:            PKR ${(closed.variance || 0).toLocaleString()} [${(closed.variance || 0) === 0 ? 'BALANCED' : (closed.variance || 0) > 0 ? 'SURPLUS' : 'SHORTAGE'}]
${closed.variance_reason ? `Variance Memo: ${closed.variance_reason}\n` : ''}----------------------------------------
DENOMINATIONS COUNTED:
- 5000 x ${denominations.notes_5000} = PKR ${(denominations.notes_5000 * 5000).toLocaleString()}
- 1000 x ${denominations.notes_1000} = PKR ${(denominations.notes_1000 * 1000).toLocaleString()}
-  500 x ${denominations.notes_500} = PKR ${(denominations.notes_500 * 500).toLocaleString()}
-  100 x ${denominations.notes_100} = PKR ${(denominations.notes_100 * 100).toLocaleString()}
-   50 x ${denominations.notes_50} = PKR ${(denominations.notes_50 * 50).toLocaleString()}
-   20 x ${denominations.notes_20} = PKR ${(denominations.notes_20 * 20).toLocaleString()}
-   10 x ${denominations.notes_10} = PKR ${(denominations.notes_10 * 10).toLocaleString()}
- Coins: PKR ${denominations.coins.toLocaleString()}
----------------------------------------
Cashier Signature: ____________________
Manager Signature: ____________________
========================================
`;
        hardwareService.printReceiptSilent(autoZSlip);
      } catch (printErr: any) {
        console.warn('[Z-Report Auto Print Warning]:', printErr.message);
      }

      // Automated shift-close backup to POS_Backups (Phase 11 &amp; Q4)
      try {
        if ((window as any).electronAPI?.dbBackup) {
          await (window as any).electronAPI.dbBackup();
        }
      } catch (backupErr: any) {
        console.warn('[Shift Close Backup Warning]:', backupErr.message);
      }
    } catch (err: any) {
      await posAlert('Shift Close Error', `Error closing shift: ${err.message}`, 'error');
    }
  };

  const handleWhatsAppZReport = () => {
    if (!closedShift) return;
    const msg = `*${(storeSettings?.store_name || 'POINT OF SALE').toUpperCase()} - Z-REPORT*
Cashier: ${closedShift.cashier_name}
Closed: ${new Date().toLocaleString()}
-----------------------------
Opening Float: Rs. ${closedShift.opening_float.toLocaleString()}
Cash Sales: Rs. ${closedShift.total_sales_cash.toLocaleString()}
Card Sales: Rs. ${closedShift.total_sales_card.toLocaleString()}
Digital (Easypaisa): Rs. ${closedShift.total_sales_digital.toLocaleString()}
Khata Credit: Rs. ${closedShift.total_sales_khata.toLocaleString()}
Petty Expenses: Rs. ${closedShift.total_petty_expenses.toLocaleString()}
-----------------------------
Expected Cash: Rs. ${closedShift.expected_cash.toLocaleString()}
Actual Cash Declared: Rs. ${closedShift.closing_cash_actual?.toLocaleString()}
Variance: Rs. ${closedShift.variance?.toLocaleString()} (${(closedShift.variance || 0) === 0 ? 'BALANCED' : (closedShift.variance || 0) > 0 ? 'SURPLUS' : 'SHORTAGE'})
${storeSettings?.store_name || 'Point of Sale'} ERP Engine`;

    hardwareService.openWhatsApp(storeSettings.whatsapp_number, msg);
  };

  const handlePrintZReport = async () => {
    if (!closedShift) return;
    hardwareService.playScanSuccess();
    try {
      const zSlip = `
========================================
       ${storeSettings.store_name}
        OFFICIAL SHIFT Z-REPORT
========================================
Register #: ${closedShift.id.slice(-6).toUpperCase()}
Date: ${new Date().toLocaleString()}
Cashier: ${closedShift.cashier_name}
Started: ${new Date(closedShift.opened_at).toLocaleTimeString('en-PK')}
Closed:  ${new Date().toLocaleTimeString('en-PK')}
----------------------------------------
SALES RECONCILIATION:
Opening Float:       PKR ${closedShift.opening_float.toLocaleString()}
Cash Sales:          PKR ${closedShift.total_sales_cash.toLocaleString()}
Card Sales:          PKR ${closedShift.total_sales_card.toLocaleString()}
Digital (Easypaisa): PKR ${closedShift.total_sales_digital.toLocaleString()}
Khata Credit Sales:  PKR ${closedShift.total_sales_khata.toLocaleString()}
Returns (Cash Paid): PKR ${closedShift.total_returns_cash.toLocaleString()}
Petty Cash Out:      PKR ${closedShift.total_petty_expenses.toLocaleString()}
----------------------------------------
DRAWER RECONCILIATION:
Expected Cash:       PKR ${closedShift.expected_cash.toLocaleString()}
Actual Cash Counted: PKR ${(closedShift.closing_cash_actual || 0).toLocaleString()}
----------------------------------------
AUDIT VARIANCE:      PKR ${(closedShift.variance || 0).toLocaleString()}
Status: ${(closedShift.variance || 0) === 0 ? 'PERFECTLY BALANCED' : (closedShift.variance || 0) > 0 ? 'SURPLUS' : 'SHORTAGE'}
Reason: ${closedShift.variance_reason || 'N/A'}
----------------------------------------
Supervisor Sign: _______________________

Cashier Sign:    _______________________
========================================
`;
      hardwareService.printReceiptSilent(zSlip);
      await posAlert('Z-Report Dispatched', 'Z-Report sent to 80mm thermal printer.', 'success');
    } catch (e: any) {
      await posAlert('Printer Notice', `Printer offline or error: ${e.message}`, 'warning');
    }
  };

  React.useEffect(() => {
    if (!isOpen || !isSubmitted) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'y' || e.key === 'Y' || e.key === 'Enter') {
        e.preventDefault();
        handlePrintZReport().then(() => onClose());
      } else if (e.key === 'n' || e.key === 'N' || e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitted, closedShift]);

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/85 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-stone-300 rounded-3xl max-w-xl w-full shadow-2xl overflow-hidden font-sans">
        
        {/* HEADER */}
        <div className="bg-[#243338] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-[#5B7981] text-[#E3D5C0] p-1.5 rounded-xl">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm tracking-wide">BLIND SHIFT RECONCILIATION &amp; Z-REPORT</h3>
              <p className="text-[11px] text-[#E3D5C0]">
                Cashier: {activeShift.cashier_name} • Started: {new Date(activeShift.opened_at).toLocaleTimeString('en-PK')}
              </p>
            </div>
          </div>
          {!isSubmitted && (
            <button onClick={onClose} className="text-stone-400 hover:text-white cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {!isSubmitted ? (
          <form onSubmit={handleCloseShift} className="p-6 space-y-5">
            
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-2.5 text-xs text-amber-900 font-medium">
              <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
              <span>
                <strong>Blind Close Enforced:</strong> Physical cash in the drawer must be counted and declared. Expected system total is hidden until counts are submitted.
              </span>
            </div>

            {/* CURRENCY DENOMINATIONS GRID */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wide">
                Pakistani Currency Note Counts
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-stone-50 p-3.5 rounded-2xl border border-stone-200">
                
                {/* 5000 */}
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-stone-700 block">Rs. 5,000</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={denominations.notes_5000 || ''}
                    onChange={(e) => handleNoteChange('notes_5000', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg text-xs font-mono font-bold text-center outline-hidden focus:border-[#5B7981]"
                  />
                  <span className="text-[10px] text-stone-500 font-mono block text-center">
                    = Rs. {(denominations.notes_5000 * 5000).toLocaleString()}
                  </span>
                </div>

                {/* 1000 */}
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-stone-700 block">Rs. 1,000</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={denominations.notes_1000 || ''}
                    onChange={(e) => handleNoteChange('notes_1000', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg text-xs font-mono font-bold text-center outline-hidden focus:border-[#5B7981]"
                  />
                  <span className="text-[10px] text-stone-500 font-mono block text-center">
                    = Rs. {(denominations.notes_1000 * 1000).toLocaleString()}
                  </span>
                </div>

                {/* 500 */}
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-stone-700 block">Rs. 500</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={denominations.notes_500 || ''}
                    onChange={(e) => handleNoteChange('notes_500', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg text-xs font-mono font-bold text-center outline-hidden focus:border-[#5B7981]"
                  />
                  <span className="text-[10px] text-stone-500 font-mono block text-center">
                    = Rs. {(denominations.notes_500 * 500).toLocaleString()}
                  </span>
                </div>

                {/* 100 */}
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-stone-700 block">Rs. 100</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={denominations.notes_100 || ''}
                    onChange={(e) => handleNoteChange('notes_100', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg text-xs font-mono font-bold text-center outline-hidden focus:border-[#5B7981]"
                  />
                  <span className="text-[10px] text-stone-500 font-mono block text-center">
                    = Rs. {(denominations.notes_100 * 100).toLocaleString()}
                  </span>
                </div>

                {/* 50 */}
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-stone-700 block">Rs. 50</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={denominations.notes_50 || ''}
                    onChange={(e) => handleNoteChange('notes_50', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg text-xs font-mono font-bold text-center outline-hidden focus:border-[#5B7981]"
                  />
                  <span className="text-[10px] text-stone-500 font-mono block text-center">
                    = Rs. {(denominations.notes_50 * 50).toLocaleString()}
                  </span>
                </div>

                {/* 20 */}
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-stone-700 block">Rs. 20</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={denominations.notes_20 || ''}
                    onChange={(e) => handleNoteChange('notes_20', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg text-xs font-mono font-bold text-center outline-hidden focus:border-[#5B7981]"
                  />
                  <span className="text-[10px] text-stone-500 font-mono block text-center">
                    = Rs. {(denominations.notes_20 * 20).toLocaleString()}
                  </span>
                </div>

                {/* 10 */}
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-stone-700 block">Rs. 10</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={denominations.notes_10 || ''}
                    onChange={(e) => handleNoteChange('notes_10', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg text-xs font-mono font-bold text-center outline-hidden focus:border-[#5B7981]"
                  />
                  <span className="text-[10px] text-stone-500 font-mono block text-center">
                    = Rs. {(denominations.notes_10 * 10).toLocaleString()}
                  </span>
                </div>

                {/* LOOSE COINS */}
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-stone-700 block">Coins (Rs.)</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={denominations.coins || ''}
                    onChange={(e) => handleNoteChange('coins', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg text-xs font-mono font-bold text-center outline-hidden focus:border-[#5B7981]"
                  />
                  <span className="text-[10px] text-stone-500 font-mono block text-center">
                    = Rs. {denominations.coins.toLocaleString()}
                  </span>
                </div>

              </div>
            </div>

            {/* TOTAL ACTUAL CASH COUNT BANNER */}
            <div className="p-4 bg-stone-900 text-white rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-xs text-stone-400 block font-mono">Total Physical Cash Declared</span>
                <span className="text-2xl font-black font-mono text-[#E3D5C0]">
                  PKR {totalCalculatedCash.toLocaleString()}
                </span>
              </div>
              <span className="text-xs text-stone-400 font-mono">Drawer Count</span>
            </div>

            {/* STAFF PETTY CASH / TEA EXPENSES */}
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
              <span className="text-[11px] font-bold text-stone-700 uppercase tracking-wide block">
                Counter Staff Tea / Petty Expenses (Optional)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <input
                    type="number"
                    min="0"
                    placeholder="Expense Total (e.g. 500)"
                    value={pettyExpense}
                    onChange={(e) => setPettyExpense(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-white border border-stone-300 rounded-xl text-xs font-mono font-bold outline-hidden"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="Notes (e.g. Tea Rs. 350, Cleaning Rs. 150)"
                    value={expenseNotes}
                    onChange={(e) => setExpenseNotes(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-stone-300 rounded-xl text-xs outline-hidden"
                  />
                </div>
              </div>
              <span className="text-[10px] text-stone-500 italic block">
                Automatically deducted from register expected cash and prints expense slip.
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Cashier Remarks / Shift Notes
              </label>
              <input
                type="text"
                value={varianceReason}
                onChange={(e) => setVarianceReason(e.target.value)}
                placeholder="e.g. Regular shift handover, drawer change balanced"
                className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs outline-hidden"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-stone-200 text-stone-800 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 bg-red-700 hover:bg-red-800 text-white rounded-xl text-xs font-black shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <Lock className="w-4 h-4" /> RECONCILE &amp; CLOSE REGISTER
              </button>
            </div>
          </form>
        ) : (
          /* Z-REPORT SUMMARY AFTER CLOSING */
          <div className="p-6 space-y-4 font-mono text-xs">
            {/* QUICK KEYBOARD Y/N PROMPT BANNER */}
            <div className="p-4 bg-[#243338] text-white rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 border border-stone-600 shadow-md">
              <div className="flex items-center gap-3">
                <div className="bg-[#5B7981] p-2 rounded-xl text-[#E3D5C0]">
                  <Printer className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm tracking-wide text-white">Print Z-Report Slip?</h4>
                  <p className="text-stone-300 text-[11px] font-sans">
                    Press <kbd className="px-1.5 py-0.5 bg-stone-800 border border-stone-500 rounded text-amber-300 font-bold">Y</kbd> or <kbd className="px-1.5 py-0.5 bg-stone-800 border border-stone-500 rounded text-amber-300 font-bold">Enter</kbd> to Print, or <kbd className="px-1.5 py-0.5 bg-stone-800 border border-stone-500 rounded text-stone-300 font-bold">N</kbd> / <kbd className="px-1.5 py-0.5 bg-stone-800 border border-stone-500 rounded text-stone-300 font-bold">Esc</kbd> to Skip.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => { await handlePrintZReport(); onClose(); }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer shadow-xs"
                >
                  [Y] Print (Enter)
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-stone-700 hover:bg-stone-600 text-stone-200 rounded-xl text-xs font-bold cursor-pointer"
                >
                  [N] Skip &amp; Exit
                </button>
              </div>
            </div>

            <div className="p-4 bg-stone-100 border border-stone-300 rounded-2xl space-y-2">
              <div className="text-center font-bold text-stone-900 pb-2 border-b border-dashed border-stone-400">
                <span className="text-sm font-black font-sans block">{storeSettings.store_name}</span>
                <span>Z-REPORT / SHIFT RECONCILIATION</span>
              </div>

              <div className="space-y-1 pt-1 text-[11px]">
                <div className="flex justify-between">
                  <span>Opening Float:</span>
                  <span>Rs. {closedShift?.opening_float.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cash Sales:</span>
                  <span>Rs. {closedShift?.total_sales_cash.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Card Sales:</span>
                  <span>Rs. {closedShift?.total_sales_card.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Digital (Easypaisa):</span>
                  <span>Rs. {closedShift?.total_sales_digital.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Khata Credit Sales:</span>
                  <span>Rs. {closedShift?.total_sales_khata.toLocaleString()}</span>
                </div>
                {closedShift?.total_petty_expenses ? (
                  <div className="flex justify-between text-amber-900 font-bold">
                    <span>Petty Cash Expenses:</span>
                    <span>- Rs. {closedShift.total_petty_expenses.toLocaleString()}</span>
                  </div>
                ) : null}

                <div className="border-t border-dashed border-stone-400 my-1 pt-1 flex justify-between font-bold">
                  <span>Expected Cash in Drawer:</span>
                  <span>Rs. {closedShift?.expected_cash.toLocaleString()}</span>
                </div>

                <div className="flex justify-between font-bold">
                  <span>Actual Cash Declared:</span>
                  <span>Rs. {closedShift?.closing_cash_actual?.toLocaleString()}</span>
                </div>

                <div className={`p-2.5 rounded-xl font-bold flex justify-between text-xs border ${
                  (closedShift?.variance || 0) === 0
                    ? 'bg-emerald-100 border-emerald-300 text-emerald-900'
                    : (closedShift?.variance || 0) > 0
                    ? 'bg-blue-100 border-blue-300 text-blue-900'
                    : 'bg-red-100 border-red-300 text-red-900'
                }`}>
                  <span className="font-black">Cash Variance:</span>
                  <span className="font-black text-sm">
                    {(closedShift?.variance || 0) > 0 ? '+' : ''}
                    Rs. {closedShift?.variance?.toLocaleString()} 
                    {closedShift?.variance === 0 ? ' (PERFECTLY BALANCED)' : (closedShift?.variance || 0) > 0 ? ' (SURPLUS)' : ' (SHORTAGE)'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintZReport}
                  className="px-4 py-2 bg-[#5B7981] hover:bg-[#486269] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Printer className="w-4 h-4" /> Print Z-Report
                </button>
                <button
                  onClick={handleWhatsAppZReport}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  WhatsApp Summary
                </button>
              </div>

              <button
                onClick={onClose}
                className="px-5 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Close &amp; Next Shift
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
