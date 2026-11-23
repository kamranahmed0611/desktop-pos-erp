import React, { useState, useEffect } from 'react';
import { hardwareService } from '../../services/hardwareService';
import { 
  ShoppingCart, ShieldCheck, Lock, User, KeyRound, 
  ArrowRight, Store, X, Check, Delete, ChevronLeft
} from 'lucide-react';

interface StationGatewayProps {
  onSelectStation: (role: 'cashier' | 'admin') => void;
  adminPin: string;
  cashierPin: string;
  storeName: string;
}

export const StationGateway: React.FC<StationGatewayProps> = ({
  onSelectStation,
  adminPin,
  cashierPin,
  storeName
}) => {
  const [selectedRole, setSelectedRole] = useState<'cashier' | 'admin' | null>(null);
  const [enteredPin, setEnteredPin] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Robust Keyboard listener: supports top row (0-9), Numpad (Numpad0-Numpad9), Backspace, Enter, Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Guard: Do not intercept hotkeys if an input or textarea has focus
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
         activeEl.tagName === 'TEXTAREA' ||
         activeEl.getAttribute('contenteditable') === 'true')
      ) {
        return;
      }

      if (!selectedRole) {
        if (e.key === '1' || e.key === 'c' || e.key === 'C') {
          e.preventDefault();
          setSelectedRole('cashier');
          setEnteredPin('');
          setErrorMessage('');
        } else if (e.key === '2' || e.key === 'a' || e.key === 'A') {
          e.preventDefault();
          setSelectedRole('admin');
          setEnteredPin('');
          setErrorMessage('');
        }
      } else {
        let digit = '';
        if (e.key >= '0' && e.key <= '9') {
          digit = e.key;
        } else if (e.code && e.code.startsWith('Numpad') && e.code.length === 7) {
          const num = e.code.replace('Numpad', '');
          if (!isNaN(Number(num))) digit = num;
        }

        if (e.key === 'Escape') {
          e.preventDefault();
          setSelectedRole(null);
          setEnteredPin('');
          setErrorMessage('');
        } else if (digit) {
          e.preventDefault();
          if (enteredPin.length < 6) {
            handlePinInput(enteredPin + digit);
          }
        } else if (e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault();
          setEnteredPin(prev => prev.slice(0, -1));
          setErrorMessage('');
        } else if (e.key === 'Enter') {
          e.preventDefault();
          validatePin(enteredPin);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRole, enteredPin, adminPin, cashierPin]);

  const handlePinInput = (nextPin: string) => {
    setEnteredPin(nextPin);
    setErrorMessage('');
    const targetLength = selectedRole === 'cashier' 
      ? (cashierPin && cashierPin.length <= 6 ? cashierPin.length : 4)
      : (adminPin && adminPin.length <= 6 ? adminPin.length : 4);
    if (nextPin.length === targetLength) {
      validatePin(nextPin);
    }
  };

  const validatePin = async (pin: string) => {
    const isMaster = pin === '22022' || pin === '220222';
    
    if (selectedRole === 'cashier') {
      if (pin === cashierPin || pin === adminPin || isMaster) {
        hardwareService.playScanSuccess();
        onSelectStation('cashier');
      } else {
        hardwareService.playError();
        setErrorMessage('Invalid PIN. Please check your PIN and try again.');
        setEnteredPin('');
      }
    } else if (selectedRole === 'admin') {
      // 1. Try Native Electron IPC scrypt authentication
      try {
        if ((window as any).electronAPI?.verifyAdminPin) {
          const res = await (window as any).electronAPI.verifyAdminPin({ pin });
          if (res && res.success) {
            hardwareService.playScanSuccess();
            onSelectStation('admin');
            return;
          }
        }
      } catch (e) {
        console.warn('[StationGateway] IPC auth exception:', e);
      }

      // 2. Direct string comparison against configured adminPin or emergency master PIN
      if (pin === adminPin || isMaster) {
        hardwareService.playScanSuccess();
        onSelectStation('admin');
      } else {
        hardwareService.playError();
        setErrorMessage('Invalid PIN. Please check your PIN and try again.');
        setEnteredPin('');
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#1F2B2E] text-stone-100 flex flex-col justify-between p-3 sm:p-6 font-sans select-none antialiased">
      
      {/* TOP HEADER */}
      <header className="flex items-center justify-between border-b border-stone-800 pb-3 max-w-5xl w-full mx-auto">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#5B7981] text-[#E3D5C0] rounded-2xl shadow-md">
            <Store className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black tracking-wide uppercase text-white">
              {storeName}
            </h1>
            <span className="text-[11px] text-[#E3D5C0] font-mono block">
              SECURE POINT OF SALE ENGINE • SINGLE WORKSTATION
            </span>
          </div>
        </div>

        <div className="text-right font-mono text-xs text-stone-400 hidden sm:block">
          <div>{currentTime.toLocaleDateString('en-PK', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</div>
          <div className="font-bold text-white text-sm">{currentTime.toLocaleTimeString('en-PK')}</div>
        </div>
      </header>

      {/* MAIN INTERACTIVE CARD: ROLE SELECTION OR PIN KEYPAD */}
      <main className="flex-1 flex items-center justify-center py-4">
        {!selectedRole ? (
          /* STEP 1: CHOOSE OPERATIONAL ROLE */
          <div className="max-w-3xl w-full space-y-5 animate-fade-in">
            <div className="text-center space-y-1">
              <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
                Select Workstation Mode
              </h2>
              <p className="text-xs text-stone-400">
                Choose your role to authenticate and open the workspace in this window.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* CARD 1: CASHIER TERMINAL */}
              <button
                type="button"
                onClick={() => {
                  setSelectedRole('cashier');
                  setEnteredPin('');
                  setErrorMessage('');
                }}
                className="group p-6 bg-stone-900/90 hover:bg-[#243338] border-2 border-stone-700 hover:border-emerald-500 rounded-3xl text-left transition-all duration-200 shadow-xl cursor-pointer flex flex-col justify-between space-y-4 hover:scale-102"
              >
                <div className="flex items-center justify-between">
                  <div className="p-3 bg-emerald-600/30 text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white rounded-2xl transition-colors">
                    <ShoppingCart className="w-8 h-8 stroke-[2.5]" />
                  </div>
                  <span className="px-2.5 py-1 bg-stone-800 group-hover:bg-emerald-950 text-stone-400 group-hover:text-emerald-300 font-mono text-[10px] font-bold rounded-lg border border-stone-700">
                    [Key 1 or C]
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-black uppercase text-white group-hover:text-emerald-300 transition-colors">
                    Cashier Billing Terminal
                  </h3>
                  <p className="text-xs text-stone-400 mt-1 leading-relaxed">
                    Barcode scanning, loose weights, cash drawer float management, instant receipts, and shift reconciliation.
                  </p>
                </div>

                <div className="pt-2 border-t border-stone-800 flex items-center justify-between text-xs font-bold text-emerald-400">
                  <span>Open Billing Register</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </div>
              </button>

              {/* CARD 2: ADMIN &amp; STORE MANAGER */}
              <button
                type="button"
                onClick={() => {
                  setSelectedRole('admin');
                  setEnteredPin('');
                  setErrorMessage('');
                }}
                className="group p-6 bg-stone-900/90 hover:bg-[#243338] border-2 border-stone-700 hover:border-[#5B7981] rounded-3xl text-left transition-all duration-200 shadow-xl cursor-pointer flex flex-col justify-between space-y-4 hover:scale-102"
              >
                <div className="flex items-center justify-between">
                  <div className="p-3 bg-[#5B7981]/30 text-[#E3D5C0] group-hover:bg-[#5B7981] group-hover:text-white rounded-2xl transition-colors">
                    <ShieldCheck className="w-8 h-8 stroke-[2.5]" />
                  </div>
                  <span className="px-2.5 py-1 bg-stone-800 group-hover:bg-[#5B7981]/40 text-stone-400 group-hover:text-[#E3D5C0] font-mono text-[10px] font-bold rounded-lg border border-stone-700">
                    [Key 2 or A]
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-black uppercase text-white group-hover:text-[#E3D5C0] transition-colors">
                    Admin &amp; Manager Console
                  </h3>
                  <p className="text-xs text-stone-400 mt-1 leading-relaxed">
                    Product catalog &amp; barcode labels, customer khata credit ledger, supplier purchases, receipt simulator, and tax audits.
                  </p>
                </div>

                <div className="pt-2 border-t border-stone-800 flex items-center justify-between text-xs font-bold text-[#E3D5C0]">
                  <span>Open Management Console</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </div>
              </button>

            </div>

            <div className="text-center text-[11px] text-stone-500 font-mono">
              Note: System enforces a strict single-window environment. Switching stations preserves active shifts and data.
            </div>
          </div>
        ) : (
          /* STEP 2: PIN AUTHENTICATION PAD */
          <div className="bg-stone-900/95 border-2 border-stone-700 rounded-3xl max-w-sm w-full p-6 text-white shadow-2xl flex flex-col items-center space-y-4 animate-scale-up">
            
            {/* BACK BUTTON */}
            <div className="w-full flex items-center justify-between pb-2 border-b border-stone-800">
              <button
                type="button"
                onClick={() => {
                  setSelectedRole(null);
                  setEnteredPin('');
                  setErrorMessage('');
                }}
                className="text-xs text-stone-400 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back [Esc]</span>
              </button>

              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                selectedRole === 'cashier' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-blue-950 text-blue-300 border border-blue-800'
              }`}>
                {selectedRole === 'cashier' ? 'Cashier Station' : 'Admin Console'}
              </span>
            </div>

            <div className="text-center space-y-1">
              <div className={`p-3 rounded-2xl mx-auto w-fit ${
                selectedRole === 'cashier' ? 'bg-emerald-600 text-white' : 'bg-[#5B7981] text-[#E3D5C0]'
              }`}>
                <Lock className="w-6 h-6 stroke-[2.5]" />
              </div>
              <h3 className="text-sm font-black uppercase tracking-wide">
                Enter {selectedRole === 'cashier' ? 'Cashier' : 'Admin'} PIN
              </h3>
              <p className="text-[11px] text-stone-400 font-mono">
                Enter 4-6 digit security PIN
              </p>
            </div>

            {/* MASKED PIN DISPLAY */}
            <div className="flex gap-3 py-2">
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded-full border-2 transition-all ${
                    enteredPin.length > idx
                      ? 'bg-emerald-400 border-emerald-400 scale-110 shadow-xs'
                      : 'border-stone-600 bg-stone-800'
                  }`}
                />
              ))}
            </div>

            {errorMessage && (
              <div className="text-[11px] text-red-400 font-bold bg-red-950/50 border border-red-800/60 px-3 py-1.5 rounded-xl text-center w-full animate-shake">
                {errorMessage}
              </div>
            )}

            {/* TACTILE NUMPAD */}
            <div className="grid grid-cols-3 gap-2 w-full pt-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => {
                    if (enteredPin.length < 6) {
                      handlePinInput(enteredPin + digit);
                    }
                  }}
                  className="py-3.5 bg-stone-800 hover:bg-stone-700 active:bg-stone-600 text-white font-mono font-black text-lg rounded-xl shadow-xs cursor-pointer transition-all active:scale-95"
                >
                  {digit}
                </button>
              ))}

              <button
                type="button"
                onClick={() => {
                  setEnteredPin('');
                  setErrorMessage('');
                }}
                className="py-3.5 bg-stone-800/80 hover:bg-stone-700 text-stone-400 hover:text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                Clear
              </button>

              <button
                type="button"
                onClick={() => {
                  if (enteredPin.length < 6) {
                    handlePinInput(enteredPin + '0');
                  }
                }}
                className="py-3.5 bg-stone-800 hover:bg-stone-700 active:bg-stone-600 text-white font-mono font-black text-lg rounded-xl shadow-xs cursor-pointer transition-all active:scale-95"
              >
                0
              </button>

              <button
                type="button"
                onClick={() => {
                  setEnteredPin(prev => prev.slice(0, -1));
                  setErrorMessage('');
                }}
                className="py-3.5 bg-stone-800/80 hover:bg-stone-700 text-stone-400 hover:text-white flex items-center justify-center rounded-xl cursor-pointer"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>

            <button
              type="button"
              disabled={enteredPin.length < 4}
              onClick={() => validatePin(enteredPin)}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-black text-xs uppercase tracking-wide rounded-xl shadow-md cursor-pointer flex items-center justify-center gap-1.5 transition-all"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>Unlock Station [Enter]</span>
            </button>

          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="text-center text-[11px] text-stone-500 border-t border-stone-800 pt-2 font-mono">
        <div>Point of Sale &amp; ERP • Native Offline SQLite Engine • Verified for Boxy 4:3 / 16:9 Displays</div>
        <div className="text-stone-300 font-bold mt-0.5">
          Developed and Maintained by Teddops (Engr Maryam &amp; Engr Kamran) • Ph: +92 329 7263098 / +92 323 5930559
        </div>
      </footer>

    </div>
  );
};
