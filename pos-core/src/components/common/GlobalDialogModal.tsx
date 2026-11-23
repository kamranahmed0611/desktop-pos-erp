import React, { useEffect, useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export const GlobalDialogModal: React.FC = () => {
  const { dialog, closeDialog } = useUIStore();
  const [promptValue, setPromptValue] = useState('');

  useEffect(() => {
    if (dialog.isOpen && dialog.type === 'prompt') {
      setPromptValue(dialog.defaultValue || '');
    }
  }, [dialog.isOpen, dialog.type, dialog.defaultValue]);

  useEffect(() => {
    if (!dialog.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (dialog.type === 'prompt' && dialog.onPromptSubmit) {
          dialog.onPromptSubmit(promptValue);
        } else if (dialog.onConfirm) {
          dialog.onConfirm();
        } else {
          closeDialog();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (dialog.onCancel) dialog.onCancel();
        else closeDialog();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialog, promptValue, closeDialog]);

  if (!dialog.isOpen) return null;

  const getTheme = () => {
    switch (dialog.alertType) {
      case 'success':
        return {
          icon: CheckCircle2,
          iconBg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
          confirmBtn: 'bg-emerald-700 hover:bg-emerald-800 text-white',
          badge: 'bg-emerald-50 text-emerald-900 border-emerald-200'
        };
      case 'error':
        return {
          icon: AlertCircle,
          iconBg: 'bg-red-100 text-red-800 border-red-300',
          confirmBtn: 'bg-red-700 hover:bg-red-800 text-white',
          badge: 'bg-red-50 text-red-900 border-red-200'
        };
      case 'warning':
        return {
          icon: AlertTriangle,
          iconBg: 'bg-amber-100 text-amber-800 border-amber-300',
          confirmBtn: 'bg-amber-600 hover:bg-amber-700 text-white',
          badge: 'bg-amber-50 text-amber-900 border-amber-200'
        };
      case 'info':
      default:
        return {
          icon: Info,
          iconBg: 'bg-[#E3D5C0] text-[#243338] border-stone-300',
          confirmBtn: 'bg-[#5B7981] hover:bg-[#486269] text-white',
          badge: 'bg-stone-50 text-stone-900 border-stone-200'
        };
    }
  };

  const theme = getTheme();
  const Icon = theme.icon;

  return (
    <div className="fixed inset-0 z-9999 bg-stone-950/75 backdrop-blur-xs flex items-center justify-center p-4 font-sans select-none animate-fade-in">
      <div className="bg-white border-2 border-stone-300 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col transform transition-all scale-100">
        
        {/* TOP ACCENT STRIP */}
        <div className="bg-[#243338] px-5 py-3.5 flex items-center justify-between text-white border-b border-stone-700">
          <div className="flex items-center gap-2.5">
            <div className={`p-1.5 rounded-xl border ${theme.iconBg}`}>
              <Icon className="w-4 h-4 stroke-[2.5]" />
            </div>
            <span className="text-xs font-black uppercase tracking-wider text-[#E3D5C0]">
              POINT OF SALE &amp; ERP
            </span>
          </div>
          <button
            onClick={() => {
              if (dialog.type === 'confirm' && dialog.onCancel) dialog.onCancel();
              else closeDialog();
            }}
            className="text-stone-400 hover:text-white p-1 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* CONTENT BODY */}
        <div className="p-6 space-y-3">
          <h3 className="text-base font-black text-stone-900 leading-tight">
            {dialog.title}
          </h3>
          <p className="text-xs text-stone-600 whitespace-pre-line leading-relaxed font-medium">
            {dialog.message}
          </p>

          {dialog.type === 'prompt' && (
            <div className="pt-2">
              <input
                type="text"
                autoFocus
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                placeholder={dialog.placeholder || 'Enter value...'}
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-stone-300 focus:border-[#5B7981] focus:ring-2 focus:ring-[#5B7981]/20 outline-none font-mono text-sm font-bold text-stone-900 bg-stone-50"
              />
            </div>
          )}
        </div>

        {/* ACTIONS */}
        <div className="bg-stone-50 px-6 py-3.5 border-t border-stone-200 flex items-center justify-end gap-2.5">
          {(dialog.type === 'confirm' || dialog.type === 'prompt') && (
            <button
              type="button"
              onClick={() => {
                if (dialog.onCancel) dialog.onCancel();
                else closeDialog();
              }}
              className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-xl text-xs font-bold cursor-pointer transition-colors"
            >
              {dialog.cancelText || 'Cancel [Esc]'}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (dialog.type === 'prompt' && dialog.onPromptSubmit) {
                dialog.onPromptSubmit(promptValue);
              } else if (dialog.onConfirm) {
                dialog.onConfirm();
              } else {
                closeDialog();
              }
            }}
            className={`px-6 py-2 rounded-xl text-xs font-black shadow-md cursor-pointer transition-all hover:scale-102 ${theme.confirmBtn}`}
            autoFocus={dialog.type !== 'prompt'}
          >
            {dialog.confirmText || (dialog.type === 'prompt' ? 'Confirm [Enter]' : 'OK [Enter]')}
          </button>
        </div>

      </div>
    </div>
  );
};
