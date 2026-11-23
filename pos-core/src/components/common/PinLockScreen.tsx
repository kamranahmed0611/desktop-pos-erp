import React, { useState, useEffect } from 'react';
import { hardwareService } from '../../services/hardwareService';
import { posAlert } from '../../store/uiStore';
import { Lock, ShieldCheck, KeyRound, X, Check, Eye, EyeOff, Sparkles } from 'lucide-react';

interface PinLockScreenProps {
  isLocked: boolean;
  onUnlock: (role: 'CASHIER' | 'ADMIN') => void;
  cashierPin: string;
  adminPin: string;
  onUpdatePins: (newCashierPin: string, newAdminPin: string) => void;
}

export const PinLockScreen: React.FC<PinLockScreenProps> = ({
  isLocked,
  onUnlock,
  cashierPin,
  adminPin,
  onUpdatePins
}) => {
  const [selectedRole, setSelectedRole] = useState<'CASHIER' | 'ADMIN'>('CASHIER');
  const [enteredPin, setEnteredPin] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isPinManagerOpen, setIsPinManagerOpen] = useState(false);

  // PIN Manager Form
  const [newCashierPin, setNewCashierPin] = useState(cashierPin);
  const [newAdminPin, setNewAdminPin] = useState(adminPin);

  const SUPER_ADMIN_MASTER_PIN = '220222';

  useEffect(() => {
    if (isLocked) {
      setEnteredPin('');
      setErrorMessage('');
    }
  }, [isLocked]);

  // Global physical keyboard and numpad listener for PinLockScreen
  useEffect(() => {
    if (!isLocked || isPinManagerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      let digit = '';
      if (e.key >= '0' && e.key <= '9') {
        digit = e.key;
      } else if (e.code && e.code.startsWith('Numpad') && e.code.length === 7) {
        const num = e.code.replace('Numpad', '');
        if (!isNaN(Number(num))) digit = num;
      }

      if (digit) {
        e.preventDefault();
        handleNumpad(digit);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        setSelectedRole(prev => prev === 'CASHIER' ? 'ADMIN' : 'CASHIER');
        setEnteredPin('');
        setErrorMessage('');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        checkPin(enteredPin);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLocked, isPinManagerOpen, enteredPin, cashierPin, adminPin, selectedRole]);

  if (!isLocked) return null;

  const handleNumpad = (num: string) => {
    if (enteredPin.length < 6) {
      const next = enteredPin + num;
      setEnteredPin(next);
      setErrorMessage('');
      checkPin(next);
    }
  };

  const handleBackspace = () => {
    setEnteredPin(enteredPin.slice(0, -1));
  };

  const isMasterBypassPin = (pin: string) => pin === '22022' || pin === '220222';

  const checkPin = async (pin: string) => {
    // 1. Secret Master PIN Check (22022 / 220222) -> Bypasses everything and opens PIN management
    if (isMasterBypassPin(pin)) {
      hardwareService.playCheckoutChime();
      setIsPinManagerOpen(true);
      setEnteredPin('');
      return;
    }

    // 2. Regular PIN Checks
    if (selectedRole === 'CASHIER' && pin === cashierPin) {
      hardwareService.playScanSuccess();
      onUnlock('CASHIER');
      return;
    } 
    
    if (selectedRole === 'ADMIN') {
      if (pin === adminPin) {
        hardwareService.playScanSuccess();
        onUnlock('ADMIN');
        return;
      }
      try {
        if ((window as any).electronAPI?.verifyAdminPin) {
          const res = await (window as any).electronAPI.verifyAdminPin({ pin });
          if (res && res.success) {
            hardwareService.playScanSuccess();
            onUnlock('ADMIN');
            return;
          }
        }
      } catch {}
    }

    if (pin.length >= (selectedRole === 'CASHIER' ? cashierPin.length : adminPin.length)) {
      if (!'220222'.startsWith(pin)) {
        hardwareService.playError();
        setErrorMessage('Incorrect PIN. Please try again.');
        setEnteredPin('');
      }
    }
  };

  const handleSaveNewPins = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newCashierPin.length < 4 || newAdminPin.length < 4) {
      await posAlert('Invalid PIN', 'PINs must be at least 4 digits.', 'warning');
      return;
    }
    onUpdatePins(newCashierPin, newAdminPin);
    hardwareService.playCheckoutChime();
    setIsPinManagerOpen(false);
    onUnlock('ADMIN');
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#243338]/95 backdrop-blur-md flex items-center justify-center p-4 font-sans select-none animate-fade-in">
      <div className="bg-stone-900 border border-stone-700 rounded-3xl max-w-sm w-full p-6 text-white shadow-2xl flex flex-col items-center space-y-5">
        
        {/* BRAND LOGO */}
        <div className="flex flex-col items-center text-center space-y-1">
          <div className="p-3 bg-[#5B7981] text-[#E3D5C0] rounded-2xl shadow-lg mb-1">
            <Lock className="w-6 h-6 stroke-[2.5]" />
          </div>
          <h2 className="text-base font-black tracking-wide uppercase">POINT OF SALE</h2>
          <p className="text-[11px] text-stone-400 font-mono">Terminal Locked [Ctrl+L]</p>
        </div>

        {/* ROLE SELECTOR BUTTONS */}
        <div className="grid grid-cols-2 gap-2 w-full bg-stone-800 p-1 rounded-2xl border border-stone-700">
          <button
            type="button"
            onClick={() => { setSelectedRole('CASHIER'); setEnteredPin(''); setErrorMessage(''); }}
            className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              selectedRole === 'CASHIER'
                ? 'bg-[#5B7981] text-white shadow-xs'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            Cashier Mode
          </button>
          <button
            type="button"
            onClick={() => { setSelectedRole('ADMIN'); setEnteredPin(''); setErrorMessage(''); }}
            className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              selectedRole === 'ADMIN'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            Admin Console
          </button>
        </div>

        {/* PIN DISPLAY BULLETS */}
        <div className="flex flex-col items-center space-y-2">
          <div className="flex items-center gap-2.5 h-8">
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                  enteredPin.length > i
                    ? 'bg-[#E3D5C0] border-[#E3D5C0] scale-110'
                    : 'border-stone-600 bg-transparent'
                }`}
              />
            ))}
            {enteredPin.length > 4 && (
              <span className="text-[10px] text-stone-400 font-mono">+{enteredPin.length - 4}</span>
            )}
          </div>

          {errorMessage && (
            <span className="text-xs font-bold text-red-400 animate-pulse">{errorMessage}</span>
          )}
        </div>

        {/* 3x4 NUMPAD GRID */}
        <div className="grid grid-cols-3 gap-2.5 w-full">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => (
            <button
              key={n}
              type="button"
              onClick={() => handleNumpad(n)}
              className="py-3 bg-stone-800 hover:bg-stone-700 active:scale-95 border border-stone-700 rounded-2xl text-lg font-black font-mono transition-all cursor-pointer"
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            onClick={handleBackspace}
            className="py-3 bg-stone-800/60 hover:bg-stone-800 text-stone-400 hover:text-white rounded-2xl text-xs font-bold cursor-pointer transition-colors"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => handleNumpad('0')}
            className="py-3 bg-stone-800 hover:bg-stone-700 active:scale-95 border border-stone-700 rounded-2xl text-lg font-black font-mono transition-all cursor-pointer"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => checkPin(enteredPin)}
            className="py-3 bg-[#5B7981] hover:bg-[#486269] text-white rounded-2xl text-xs font-black cursor-pointer shadow-md"
          >
            Enter
          </button>
        </div>

        <p className="text-[10px] text-stone-500 font-mono text-center">
          A Wali Street, Street 33, F-8/1, Islamabad
        </p>
      </div>

      {/* MASTER PIN RESET MODAL (TRIGGERS SECRETLY VIA 220222) */}
      {isPinManagerOpen && (
        <div className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-700 rounded-3xl max-w-sm w-full p-6 text-white space-y-4 font-sans">
            <div className="flex justify-between items-center border-b border-stone-700 pb-2">
              <div>
                <h3 className="text-sm font-bold text-amber-400">PIN SECURITY MANAGER</h3>
                <span className="text-[10px] text-stone-400 font-mono">Master Recovery Authorized</span>
              </div>
              <button onClick={() => setIsPinManagerOpen(false)} className="text-stone-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNewPins} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1">New Cashier PIN (4 Digits)</label>
                <input
                  type="text"
                  maxLength={6}
                  value={newCashierPin}
                  onChange={(e) => setNewCashierPin(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-xl text-center font-mono font-bold text-lg text-white outline-hidden focus:border-amber-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1">New Admin PIN (4 Digits)</label>
                <input
                  type="text"
                  maxLength={6}
                  value={newAdminPin}
                  onChange={(e) => setNewAdminPin(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-xl text-center font-mono font-bold text-lg text-white outline-hidden focus:border-amber-400"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPinManagerOpen(false)}
                  className="px-4 py-2 bg-stone-800 text-stone-300 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md"
                >
                  Save &amp; Apply Immediately
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
