import React, { useState, useEffect } from 'react';
import { shiftService } from '../../services/shiftService';
import { hardwareService } from '../../services/hardwareService';
import { StoreSettings, Shift } from '../../types';
import { posAlert } from '../../store/uiStore';
import { PlayCircle, DollarSign, User, ShieldCheck, Printer, Check, Calculator, ChevronDown, ChevronUp } from 'lucide-react';

interface OpenShiftModalProps {
  isOpen: boolean;
  storeSettings: StoreSettings;
  onShiftOpened: (newShift: Shift) => void;
  onCancel?: () => void;
}

export const OpenShiftModal: React.FC<OpenShiftModalProps> = ({
  isOpen,
  storeSettings,
  onShiftOpened,
  onCancel
}) => {
  const [cashierName, setCashierName] = useState('Cashier #01');
  const [openingFloat, setOpeningFloat] = useState<number | ''>(5000);
  const [shiftNote, setShiftNote] = useState('Morning Register Shift');
  const [shouldPrintSlip, setShouldPrintSlip] = useState(false); // Default to NO so transactions never block on disconnected printer
  const [showDenomCalculator, setShowDenomCalculator] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Note breakdown state
  const [denoms, setDenoms] = useState({
    n5000: 0,
    n1000: 5,
    n500: 0,
    n100: 0,
    n50: 0,
    coins: 0
  });

  // Calculate sum from denominations
  const totalFromDenoms = (denoms.n5000 * 5000) + (denoms.n1000 * 1000) + (denoms.n500 * 500) + (denoms.n100 * 100) + (denoms.n50 * 50) + denoms.coins;

  // Keyboard shortcut for Y/N print toggle
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return; // Don't intercept while typing in text inputs
      }
      if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        setShouldPrintSlip(true);
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setShouldPrintSlip(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleApplyDenomSum = () => {
    setOpeningFloat(totalFromDenoms);
    setShowDenomCalculator(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cashierName.trim()) {
      await posAlert('Cashier Required', 'Please enter cashier name to open register.', 'warning');
      return;
    }
    const floatAmount = Number(openingFloat) || 0;

    setIsSubmitting(true);
    try {
      const cashierId = `cashier-${cashierName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      const shift = await shiftService.openShift(cashierId, cashierName.trim(), floatAmount);

      hardwareService.playCheckoutChime();

      // Non-blocking print: if printer offline, never block terminal
      if (shouldPrintSlip) {
        try {
          const slip = `
========================================
       ${storeSettings.store_name}
          REGISTER OPENING SLIP
========================================
Shift #: ${shift.id.slice(-6).toUpperCase()}
Date: ${new Date().toLocaleString()}
Cashier: ${cashierName.trim()}
----------------------------------------
STARTING CASH IN DRAWER:
       PKR ${floatAmount.toLocaleString()}
----------------------------------------
Change notes verified in cash drawer.
Memo: ${shiftNote || 'Shift initialized'}
----------------------------------------
Cashier Signature: ____________________
========================================
`;
          hardwareService.printReceiptSilent(slip);
        } catch (printErr: any) {
          console.warn('[Printer Warning] Could not dispatch opening slip:', printErr.message);
        }
      }

      await posAlert(
        'Shift Opened',
        `Register successfully opened for ${cashierName.trim()} with Rs. ${floatAmount.toLocaleString()} starting cash in drawer.`,
        'success'
      );
      onShiftOpened(shift);
    } catch (err: any) {
      await posAlert('Shift Open Error', err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-9990 bg-stone-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 font-sans select-none animate-fade-in">
      <div className="bg-white border-2 border-stone-300 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* HEADER */}
        <div className="bg-[#243338] text-white px-5 py-3.5 flex items-center justify-between border-b border-stone-700">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-xs">
              <PlayCircle className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wide">OPEN CASHIER SHIFT</h2>
              <span className="text-[10px] text-emerald-300 font-mono">Counter Drawer Initialization</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-stone-400">
              {new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
            </span>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="p-1 rounded-lg text-stone-400 hover:text-white hover:bg-stone-700 cursor-pointer transition-colors"
                title="Cancel / Return to Gateway"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* BODY FORM */}
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs overflow-y-auto">
          
          <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-[11px] text-emerald-900 leading-relaxed flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 animate-pulse"></span>
            <span><strong>Register Standby:</strong> Count the physical cash in drawer and initialize your shift float.</span>
          </div>

          {/* CASHIER IDENTITY */}
          <div>
            <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">
              Cashier Name / Assigned Operator
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={cashierName}
                onChange={(e) => setCashierName(e.target.value)}
                placeholder="e.g. Cashier 1 / Counter A"
                className="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-300 rounded-xl font-bold text-sm text-stone-900 outline-hidden focus:border-emerald-600 focus:bg-white"
                required
                autoFocus
              />
            </div>
          </div>

          {/* STARTING CASH AMOUNT IN DRAWER */}
          <div className="p-3 bg-stone-50 border-2 border-emerald-600/40 rounded-2xl space-y-2">
            <div className="flex justify-between items-center">
              <label className="block text-[10px] font-black text-stone-800 uppercase tracking-wide">
                STARTING CASH IN DRAWER (PKR)
              </label>
              <button
                type="button"
                onClick={() => setShowDenomCalculator(!showDenomCalculator)}
                className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>{showDenomCalculator ? 'Hide Counter' : 'Count Notes'}</span>
                {showDenomCalculator ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>

            <div className="relative">
              <DollarSign className="w-4 h-4 text-emerald-600 absolute left-3 top-2.5" />
              <input
                type="number"
                step="50"
                value={openingFloat}
                onChange={(e) => setOpeningFloat(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="5000"
                className="w-full pl-9 pr-3 py-2 bg-white border-2 border-emerald-500 rounded-xl font-mono font-black text-xl text-emerald-900 outline-hidden shadow-inner focus:border-emerald-700"
                required
              />
            </div>

            {/* QUICK PRESET BUTTONS */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[2000, 3000, 5000, 10000, 15000].map(amt => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setOpeningFloat(amt)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold cursor-pointer transition-all ${
                    openingFloat === amt 
                      ? 'bg-emerald-700 text-white shadow-xs' 
                      : 'bg-stone-200 hover:bg-stone-300 text-stone-800'
                  }`}
                >
                  Rs. {amt.toLocaleString()}
                </button>
              ))}
            </div>

            {/* COLLAPSIBLE NOTE COUNTER */}
            {showDenomCalculator && (
              <div className="pt-2 border-t border-stone-200 space-y-1.5 animate-fade-in">
                <span className="text-[10px] font-bold text-stone-500 uppercase block">Denomination Breakdown:</span>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="flex items-center justify-between bg-white px-2 py-1 rounded border border-stone-200">
                    <span>Rs. 5,000 x</span>
                    <input 
                      type="number" 
                      min="0" 
                      value={denoms.n5000 || ''} 
                      onChange={(e) => setDenoms({ ...denoms, n5000: Number(e.target.value) || 0 })} 
                      className="w-12 text-right font-mono font-bold" 
                      placeholder="0" 
                    />
                  </div>
                  <div className="flex items-center justify-between bg-white px-2 py-1 rounded border border-stone-200">
                    <span>Rs. 1,000 x</span>
                    <input 
                      type="number" 
                      min="0" 
                      value={denoms.n1000 || ''} 
                      onChange={(e) => setDenoms({ ...denoms, n1000: Number(e.target.value) || 0 })} 
                      className="w-12 text-right font-mono font-bold" 
                      placeholder="0" 
                    />
                  </div>
                  <div className="flex items-center justify-between bg-white px-2 py-1 rounded border border-stone-200">
                    <span>Rs. 500 x</span>
                    <input 
                      type="number" 
                      min="0" 
                      value={denoms.n500 || ''} 
                      onChange={(e) => setDenoms({ ...denoms, n500: Number(e.target.value) || 0 })} 
                      className="w-12 text-right font-mono font-bold" 
                      placeholder="0" 
                    />
                  </div>
                  <div className="flex items-center justify-between bg-white px-2 py-1 rounded border border-stone-200">
                    <span>Rs. 100 x</span>
                    <input 
                      type="number" 
                      min="0" 
                      value={denoms.n100 || ''} 
                      onChange={(e) => setDenoms({ ...denoms, n100: Number(e.target.value) || 0 })} 
                      className="w-12 text-right font-mono font-bold" 
                      placeholder="0" 
                    />
                  </div>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="font-bold text-stone-700">Total Count: Rs. {totalFromDenoms.toLocaleString()}</span>
                  <button
                    type="button"
                    onClick={handleApplyDenomSum}
                    className="px-2.5 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-bold cursor-pointer"
                  >
                    Use Counted Float
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* SHIFT MEMO */}
          <div>
            <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">
              Shift Memo / Counter Note
            </label>
            <input
              type="text"
              value={shiftNote}
              onChange={(e) => setShiftNote(e.target.value)}
              placeholder="e.g. Counter 1 Morning Shift"
              className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-medium"
            />
          </div>

          {/* PRINT CONFIRMATION TOGGLE [ Y / N ] */}
          <div className="p-3 bg-stone-100 rounded-2xl flex items-center justify-between">
            <div>
              <span className="font-black text-stone-900 block text-xs flex items-center gap-1.5">
                <Printer className="w-3.5 h-3.5 text-stone-600" />
                Print Till Opening Slip?
              </span>
              <span className="text-[10px] text-stone-500 font-mono">
                {shouldPrintSlip ? 'Yes: Will send slip to printer' : 'No: Skip printing (Safe if no printer)'}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShouldPrintSlip(true)}
                className={`px-3 py-1.5 rounded-xl font-bold font-mono text-xs cursor-pointer transition-all ${
                  shouldPrintSlip
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-stone-200 text-stone-600 hover:bg-stone-300'
                }`}
                title="Press Y on keyboard"
              >
                [Y] Yes
              </button>
              <button
                type="button"
                onClick={() => setShouldPrintSlip(false)}
                className={`px-3 py-1.5 rounded-xl font-bold font-mono text-xs cursor-pointer transition-all ${
                  !shouldPrintSlip
                    ? 'bg-stone-800 text-white shadow-xs'
                    : 'bg-stone-200 text-stone-600 hover:bg-stone-300'
                }`}
                title="Press N on keyboard"
              >
                [N] No
              </button>
            </div>
          </div>

          {/* SUBMIT BUTTON */}
          <div className="pt-2 flex items-center gap-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="w-1/3 py-3 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-2xl text-xs font-bold cursor-pointer transition-all"
              >
                Back to Stations
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className={`${onCancel ? 'w-2/3' : 'w-full'} py-3 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 disabled:opacity-40 text-white rounded-2xl text-xs font-black shadow-lg cursor-pointer flex items-center justify-center gap-2 transition-all hover:scale-101`}
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>{isSubmitting ? 'Opening Register...' : 'START SHIFT & UNLOCK'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
