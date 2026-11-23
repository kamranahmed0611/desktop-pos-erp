import React, { useState, useRef, useEffect } from 'react';
import { hardwareService } from '../../services/hardwareService';
import { 
  ShieldCheck, Lock, User, Check, Store, Eye, EyeOff, 
  ArrowRight, Sparkles, AlertCircle, CheckCircle2, RotateCcw
} from 'lucide-react';

interface InitialSetupScreenProps {
  onComplete: (adminPin: string, cashierPin: string) => void;
  storeName: string;
}

type FieldKey = 'admin' | 'confirmAdmin' | 'cashier' | 'confirmCashier';

export const InitialSetupScreen: React.FC<InitialSetupScreenProps> = ({
  onComplete,
  storeName
}) => {
  const [adminPin, setAdminPin] = useState('');
  const [confirmAdminPin, setConfirmAdminPin] = useState('');
  const [cashierPin, setCashierPin] = useState('');
  const [confirmCashierPin, setConfirmCashierPin] = useState('');
  
  const [activeField, setActiveField] = useState<FieldKey>('admin');
  const [showAdminPin, setShowAdminPin] = useState(false);
  const [showCashierPin, setShowCashierPin] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Refs for smooth keyboard focus
  const adminRef = useRef<HTMLInputElement>(null);
  const confirmAdminRef = useRef<HTMLInputElement>(null);
  const cashierRef = useRef<HTMLInputElement>(null);
  const confirmCashierRef = useRef<HTMLInputElement>(null);

  // Focus active field on mount
  useEffect(() => {
    adminRef.current?.focus();
  }, []);

  const getRef = (key: FieldKey) => {
    switch (key) {
      case 'admin': return adminRef;
      case 'confirmAdmin': return confirmAdminRef;
      case 'cashier': return cashierRef;
      case 'confirmCashier': return confirmCashierRef;
    }
  };

  const handleFieldFocus = (field: FieldKey) => {
    setActiveField(field);
    setErrorMessage('');
  };

  const handleInputChange = (field: FieldKey, val: string) => {
    const cleaned = val.replace(/\D/g, '').slice(0, 6);
    setErrorMessage('');
    if (field === 'admin') setAdminPin(cleaned);
    else if (field === 'confirmAdmin') setConfirmAdminPin(cleaned);
    else if (field === 'cashier') setCashierPin(cleaned);
    else if (field === 'confirmCashier') setConfirmCashierPin(cleaned);
  };

  const handleNumpadPress = (digit: string) => {
    setErrorMessage('');
    const update = (current: string, setter: (val: string) => void, nextField?: FieldKey) => {
      if (current.length < 6) {
        const nextVal = current + digit;
        setter(nextVal);
        if (nextVal.length >= 4 && nextField) {
          // If 4 digits entered, user can keep typing or switch
        }
      }
    };

    if (activeField === 'admin') update(adminPin, setAdminPin, 'confirmAdmin');
    else if (activeField === 'confirmAdmin') update(confirmAdminPin, setConfirmAdminPin, 'cashier');
    else if (activeField === 'cashier') update(cashierPin, setCashierPin, 'confirmCashier');
    else if (activeField === 'confirmCashier') update(confirmCashierPin, setConfirmCashierPin);
    
    // Keep focus in input
    getRef(activeField).current?.focus();
  };

  const handleBackspace = () => {
    setErrorMessage('');
    if (activeField === 'admin') setAdminPin(prev => prev.slice(0, -1));
    else if (activeField === 'confirmAdmin') setConfirmAdminPin(prev => prev.slice(0, -1));
    else if (activeField === 'cashier') setCashierPin(prev => prev.slice(0, -1));
    else if (activeField === 'confirmCashier') setConfirmCashierPin(prev => prev.slice(0, -1));
    getRef(activeField).current?.focus();
  };

  const handleClearCurrent = () => {
    setErrorMessage('');
    if (activeField === 'admin') setAdminPin('');
    else if (activeField === 'confirmAdmin') setConfirmAdminPin('');
    else if (activeField === 'cashier') setCashierPin('');
    else if (activeField === 'confirmCashier') setConfirmCashierPin('');
    getRef(activeField).current?.focus();
  };

  const handleKeyDownInInput = (e: React.KeyboardEvent<HTMLInputElement>, currentField: FieldKey) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (currentField === 'admin') {
        confirmAdminRef.current?.focus();
        setActiveField('confirmAdmin');
      } else if (currentField === 'confirmAdmin') {
        cashierRef.current?.focus();
        setActiveField('cashier');
      } else if (currentField === 'cashier') {
        confirmCashierRef.current?.focus();
        setActiveField('confirmCashier');
      } else if (currentField === 'confirmCashier') {
        handleSubmit();
      }
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage('');

    if (adminPin.length < 4 || adminPin.length > 6) {
      setErrorMessage('Admin PIN must be 4 to 6 numeric digits.');
      adminRef.current?.focus();
      setActiveField('admin');
      hardwareService.playError();
      return;
    }

    if (adminPin !== confirmAdminPin) {
      setErrorMessage('Admin PIN and Confirmation PIN do not match.');
      confirmAdminRef.current?.focus();
      setActiveField('confirmAdmin');
      hardwareService.playError();
      return;
    }

    if (cashierPin.length < 4 || cashierPin.length > 6) {
      setErrorMessage('Cashier PIN must be 4 to 6 numeric digits.');
      cashierRef.current?.focus();
      setActiveField('cashier');
      hardwareService.playError();
      return;
    }

    if (cashierPin !== confirmCashierPin) {
      setErrorMessage('Cashier PIN and Confirmation PIN do not match.');
      confirmCashierRef.current?.focus();
      setActiveField('confirmCashier');
      hardwareService.playError();
      return;
    }

    hardwareService.playScanSuccess();
    onComplete(adminPin, cashierPin);
  };

  // Match helpers
  const adminMatch = adminPin.length >= 4 && confirmAdminPin.length >= 4 && adminPin === confirmAdminPin;
  const adminMismatch = confirmAdminPin.length >= 4 && adminPin !== confirmAdminPin;
  const cashierMatch = cashierPin.length >= 4 && confirmCashierPin.length >= 4 && cashierPin === confirmCashierPin;
  const cashierMismatch = confirmCashierPin.length >= 4 && cashierPin !== confirmCashierPin;

  return (
    <div className="min-h-screen bg-[#182327] text-stone-100 flex flex-col justify-between p-3 sm:p-6 font-sans select-none antialiased">
      
      {/* TOP BRAND HEADER */}
      <header className="flex items-center justify-between border-b border-stone-800 pb-3 max-w-4xl w-full mx-auto">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#5B7981] text-[#E3D5C0] rounded-2xl shadow-md">
            <Store className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black tracking-wide uppercase text-white">
              {storeName}
            </h1>
            <span className="text-[11px] text-[#E3D5C0] font-mono block">
              INITIAL TERMINAL SECURITY SETUP • نیا پن کوڈ سیٹ اپ
            </span>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2">
          <span className="px-3 py-1 bg-amber-950/80 border border-amber-700/80 text-amber-300 text-xs font-mono font-bold rounded-xl flex items-center gap-1.5 shadow-sm">
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            First Time Initialization
          </span>
        </div>
      </header>

      {/* MAIN WORKSTATION SETUP CARD */}
      <main className="flex-1 flex items-center justify-center py-4">
        <div className="max-w-2xl w-full bg-stone-900/90 border-2 border-stone-700 rounded-3xl p-5 sm:p-7 shadow-2xl space-y-5 animate-fade-in backdrop-blur-md">
          
          {/* INTRO TITLE */}
          <div className="text-center space-y-1">
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight uppercase">
              Establish Station Access PINs
            </h2>
            <p className="text-xs text-stone-400 max-w-md mx-auto leading-relaxed">
              Before commencing sales, configure your private Owner Master PIN and Cashier Terminal PIN. Both physical keyboard/numpad and on-screen touch tiles work.
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 bg-red-950/90 border-2 border-red-700 text-red-200 text-xs font-bold rounded-2xl text-center flex items-center justify-center gap-2 animate-shake">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* STEP 1: OWNER / ADMIN PIN */}
            <div className={`p-4 rounded-2xl border-2 transition-all ${
              activeField === 'admin' || activeField === 'confirmAdmin'
                ? 'bg-[#223136] border-amber-500/80 shadow-md ring-2 ring-amber-500/20'
                : 'bg-stone-800/80 border-stone-700'
            }`}>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-amber-500/20 text-amber-400 rounded-lg">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-black uppercase text-amber-300 block">
                      1. Owner / Admin PIN (4-6 Digits)
                    </span>
                    <span className="text-[10px] text-stone-400 font-mono">
                      Full access to Ledger, Inventory, Reports &amp; Settings
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {adminMatch && (
                    <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800">
                      <CheckCircle2 className="w-3.5 h-3.5" /> PINs Match
                    </span>
                  )}
                  {adminMismatch && (
                    <span className="text-[10px] font-bold text-red-400 flex items-center gap-1 bg-red-950/60 px-2 py-0.5 rounded-md border border-red-800">
                      Mismatch
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowAdminPin(!showAdminPin)}
                    className="p-1.5 text-stone-400 hover:text-stone-200 rounded-lg bg-stone-800 hover:bg-stone-700 cursor-pointer transition-colors"
                    title={showAdminPin ? "Hide PIN" : "Show PIN"}
                  >
                    {showAdminPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-stone-400 mb-1">
                    Set Admin PIN <span className="text-amber-400 font-mono">(4-6 Digits)</span>
                  </label>
                  <input
                    ref={adminRef}
                    type={showAdminPin ? "text" : "password"}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={adminPin}
                    onFocus={() => handleFieldFocus('admin')}
                    onChange={(e) => handleInputChange('admin', e.target.value)}
                    onKeyDown={(e) => handleKeyDownInInput(e, 'admin')}
                    placeholder="Enter 4-6 Digits"
                    className={`w-full px-3 py-2.5 bg-stone-900 border text-center font-mono font-black text-base tracking-widest text-amber-300 rounded-xl outline-hidden transition-all ${
                      activeField === 'admin'
                        ? 'border-amber-400 ring-2 ring-amber-400/40 bg-stone-950'
                        : 'border-stone-700 hover:border-stone-600'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-stone-400 mb-1">
                    Confirm Admin PIN
                  </label>
                  <input
                    ref={confirmAdminRef}
                    type={showAdminPin ? "text" : "password"}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={confirmAdminPin}
                    onFocus={() => handleFieldFocus('confirmAdmin')}
                    onChange={(e) => handleInputChange('confirmAdmin', e.target.value)}
                    onKeyDown={(e) => handleKeyDownInInput(e, 'confirmAdmin')}
                    placeholder="Repeat Admin PIN"
                    className={`w-full px-3 py-2.5 bg-stone-900 border text-center font-mono font-black text-base tracking-widest text-amber-300 rounded-xl outline-hidden transition-all ${
                      activeField === 'confirmAdmin'
                        ? 'border-amber-400 ring-2 ring-amber-400/40 bg-stone-950'
                        : 'border-stone-700 hover:border-stone-600'
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* STEP 2: CASHIER TERMINAL PIN */}
            <div className={`p-4 rounded-2xl border-2 transition-all ${
              activeField === 'cashier' || activeField === 'confirmCashier'
                ? 'bg-[#1e2f2b] border-emerald-500/80 shadow-md ring-2 ring-emerald-500/20'
                : 'bg-stone-800/80 border-stone-700'
            }`}>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-black uppercase text-emerald-300 block">
                      2. Cashier Terminal PIN (4-6 Digits)
                    </span>
                    <span className="text-[10px] text-stone-400 font-mono">
                      For Daily Barcode Billing, Receipts &amp; Drawer Shifts
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {cashierMatch && (
                    <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800">
                      <CheckCircle2 className="w-3.5 h-3.5" /> PINs Match
                    </span>
                  )}
                  {cashierMismatch && (
                    <span className="text-[10px] font-bold text-red-400 flex items-center gap-1 bg-red-950/60 px-2 py-0.5 rounded-md border border-red-800">
                      Mismatch
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowCashierPin(!showCashierPin)}
                    className="p-1.5 text-stone-400 hover:text-stone-200 rounded-lg bg-stone-800 hover:bg-stone-700 cursor-pointer transition-colors"
                    title={showCashierPin ? "Hide PIN" : "Show PIN"}
                  >
                    {showCashierPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-stone-400 mb-1">
                    Set Cashier PIN <span className="text-emerald-400 font-mono">(4-6 Digits)</span>
                  </label>
                  <input
                    ref={cashierRef}
                    type={showCashierPin ? "text" : "password"}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={cashierPin}
                    onFocus={() => handleFieldFocus('cashier')}
                    onChange={(e) => handleInputChange('cashier', e.target.value)}
                    onKeyDown={(e) => handleKeyDownInInput(e, 'cashier')}
                    placeholder="Enter 4-6 Digits"
                    className={`w-full px-3 py-2.5 bg-stone-900 border text-center font-mono font-black text-base tracking-widest text-emerald-300 rounded-xl outline-hidden transition-all ${
                      activeField === 'cashier'
                        ? 'border-emerald-400 ring-2 ring-emerald-400/40 bg-stone-950'
                        : 'border-stone-700 hover:border-stone-600'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-stone-400 mb-1">
                    Confirm Cashier PIN
                  </label>
                  <input
                    ref={confirmCashierRef}
                    type={showCashierPin ? "text" : "password"}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={confirmCashierPin}
                    onFocus={() => handleFieldFocus('confirmCashier')}
                    onChange={(e) => handleInputChange('confirmCashier', e.target.value)}
                    onKeyDown={(e) => handleKeyDownInInput(e, 'confirmCashier')}
                    placeholder="Repeat Cashier PIN"
                    className={`w-full px-3 py-2.5 bg-stone-900 border text-center font-mono font-black text-base tracking-widest text-emerald-300 rounded-xl outline-hidden transition-all ${
                      activeField === 'confirmCashier'
                        ? 'border-emerald-400 ring-2 ring-emerald-400/40 bg-stone-950'
                        : 'border-stone-700 hover:border-stone-600'
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* INTEGRATED TOUCH NUMPAD FOR TOUCHSCREEN &amp; MOUSE */}
            <div className="bg-stone-950/60 p-3 rounded-2xl border border-stone-800">
              <div className="flex items-center justify-between pb-2 text-[10px] font-mono text-stone-400 border-b border-stone-800 mb-2">
                <span>Touch / Mouse Keypad (Typing into: <strong className="text-white uppercase">{activeField}</strong>)</span>
                <span>Keyboard: [0-9], [Tab], [Enter]</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleNumpadPress(num)}
                    className="py-2.5 sm:py-3 bg-stone-800 hover:bg-stone-700 active:bg-stone-600 text-white font-mono font-black text-base rounded-xl cursor-pointer shadow-xs transition-transform active:scale-95"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleClearCurrent}
                  className="py-2.5 sm:py-3 bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-stone-200 text-xs font-bold rounded-xl cursor-pointer transition-colors"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => handleNumpadPress('0')}
                  className="py-2.5 sm:py-3 bg-stone-800 hover:bg-stone-700 active:bg-stone-600 text-white font-mono font-black text-base rounded-xl cursor-pointer shadow-xs transition-transform active:scale-95"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={handleBackspace}
                  className="py-2.5 sm:py-3 bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-stone-200 text-xs font-bold rounded-xl cursor-pointer transition-colors"
                >
                  ⌫ Del
                </button>
              </div>
            </div>

            {/* ACTION SUBMIT BUTTON */}
            <button
              type="submit"
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-2xl text-xs sm:text-sm font-black uppercase tracking-wider cursor-pointer shadow-xl flex items-center justify-center gap-2 transition-all hover:scale-101"
            >
              <Check className="w-5 h-5 stroke-[2.5]" />
              <span>SAVE PINS &amp; ENTER WORKSTATION [ENTER]</span>
            </button>
          </form>

        </div>
      </main>

      {/* FOOTER */}
      <footer className="text-center font-mono text-[11px] text-stone-500 pt-2 border-t border-stone-800 max-w-4xl w-full mx-auto flex flex-col sm:flex-row items-center justify-between gap-1">
        <span>Developed &amp; Maintained by Teddops (Engr Maryam &amp; Engr Kamran)</span>
        <span>Ph: +92 329 7263098 / +92 323 5930559</span>
      </footer>

    </div>
  );
};
