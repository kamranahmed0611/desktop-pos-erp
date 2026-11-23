import React, { useState, useEffect } from 'react';
import { hardwareService } from '../../services/hardwareService';
import { ShieldAlert, Lock, X, Check, Delete } from 'lucide-react';

interface AdminPinPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  adminPin?: string;
  title?: string;
  subtitle?: string;
}

export const AdminPinPromptModal: React.FC<AdminPinPromptModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  adminPin = '8888',
  title = 'MANAGER AUTHORIZATION',
  subtitle = 'Enter Admin PIN to authorize this restricted action'
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      let digit = '';
      if (e.key >= '0' && e.key <= '9') {
        digit = e.key;
      } else if (e.code && e.code.startsWith('Numpad') && e.code.length === 7) {
        const num = e.code.replace('Numpad', '');
        if (!isNaN(Number(num))) digit = num;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (digit) {
        e.preventDefault();
        if (pin.length < 6) {
          handleInput(pin + digit);
        }
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        setPin(prev => prev.slice(0, -1));
        setError('');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        check(pin);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, pin, adminPin]);

  if (!isOpen) return null;

  const handleInput = (next: string) => {
    setPin(next);
    setError('');
    if (next.length === adminPin.length) {
      check(next);
    }
  };

  const check = async (candidate: string) => {
    // 1. Try Native Electron IPC scrypt authentication
    try {
      if ((window as any).electronAPI?.verifyAdminPin) {
        const res = await (window as any).electronAPI.verifyAdminPin({ pin: candidate });
        if (res && res.success) {
          hardwareService.playScanSuccess();
          onSuccess();
          onClose();
          return;
        }
      }
    } catch (e) {
      console.warn('[AdminPinPromptModal] IPC auth check exception:', e);
    }

    // 2. Fallback check against prop & emergency master bypass
    if (candidate === adminPin || candidate === '22022' || candidate === '220222') {
      hardwareService.playScanSuccess();
      onSuccess();
      onClose();
    } else {
      hardwareService.playError();
      setError('Invalid PIN. Please try again.');
      setPin('');
    }
  };

  return (
    <div className="fixed inset-0 z-9999 bg-stone-950/85 backdrop-blur-xs flex items-center justify-center p-3 font-sans select-none animate-fade-in">
      <div className="bg-stone-900 border-2 border-amber-600/60 rounded-3xl max-w-xs w-full p-5 text-white shadow-2xl flex flex-col items-center space-y-3.5">
        
        <div className="w-full flex items-center justify-between pb-2 border-b border-stone-800">
          <div className="flex items-center gap-2 text-amber-400">
            <ShieldAlert className="w-4 h-4" />
            <span className="text-xs font-black uppercase tracking-wide">Manager Authorization</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[11px] text-stone-300 text-center leading-snug">
          Enter Admin PIN to switch from Cashier to Management Console.
        </p>

        {/* MASKED DOTS */}
        <div className="flex gap-2.5 py-1">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                pin.length > idx
                  ? 'bg-amber-400 border-amber-400 scale-110 shadow-xs'
                  : 'border-stone-600 bg-stone-800'
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="text-[10px] text-red-400 font-bold bg-red-950/60 border border-red-800/60 px-2.5 py-1 rounded-lg text-center w-full">
            {error}
          </div>
        )}

        {/* KEYPAD */}
        <div className="grid grid-cols-3 gap-1.5 w-full">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => {
                if (pin.length < 6) handleInput(pin + digit);
              }}
              className="py-2.5 bg-stone-800 hover:bg-stone-700 active:bg-stone-600 text-white font-mono font-bold text-base rounded-xl cursor-pointer"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setPin(''); setError(''); }}
            className="py-2.5 bg-stone-800/80 hover:bg-stone-700 text-stone-400 text-xs font-bold rounded-xl cursor-pointer"
          >
            C
          </button>
          <button
            type="button"
            onClick={() => {
              if (pin.length < 6) handleInput(pin + '0');
            }}
            className="py-2.5 bg-stone-800 hover:bg-stone-700 text-white font-mono font-bold text-base rounded-xl cursor-pointer"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => setPin(prev => prev.slice(0, -1))}
            className="py-2.5 bg-stone-800/80 hover:bg-stone-700 text-stone-400 flex items-center justify-center rounded-xl cursor-pointer"
          >
            <Delete className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          disabled={pin.length < 4}
          onClick={() => check(pin)}
          className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-black text-xs uppercase tracking-wide rounded-xl shadow-md cursor-pointer flex items-center justify-center gap-1.5 transition-all"
        >
          <Check className="w-4 h-4 stroke-[2.5]" />
          <span>Switch Station</span>
        </button>

      </div>
    </div>
  );
};
