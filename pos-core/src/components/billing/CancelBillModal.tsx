import React, { useState } from 'react';
import { sqlDb } from '../../db/sqlite';
import { hardwareService } from '../../services/hardwareService';
import { posAlert } from '../../store/uiStore';
import { AlertOctagon, X, Check } from 'lucide-react';

interface CancelBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  cartCount: number;
  totalAmount: number;
  cashierName: string;
  onConfirmCancel: () => void;
}

export const CancelBillModal: React.FC<CancelBillModalProps> = ({
  isOpen,
  onClose,
  cartCount,
  totalAmount,
  cashierName,
  onConfirmCancel
}) => {
  const [selectedReason, setSelectedReason] = useState('Customer Walked Out');
  const [customNote, setCustomNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const REASONS = [
    'Customer Walked Out / Cancelled',
    'Card / Online Payment Declined',
    'Cashier Ringing Mistake',
    'Customer Lacked Cash / Insufficient Funds',
    'Price Dispute at Checkout'
  ];

  const handleCancelBill = async () => {
    setIsSubmitting(true);
    try {
      await sqlDb.execute(`
        CREATE TABLE IF NOT EXISTS void_bills (
          id TEXT PRIMARY KEY,
          cashier_name TEXT NOT NULL,
          bill_items_count INTEGER NOT NULL,
          total_amount REAL NOT NULL,
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        )
      `);

      const voidId = `void-${Date.now()}`;
      const finalReason = customNote.trim() ? `${selectedReason} - ${customNote.trim()}` : selectedReason;

      await sqlDb.execute(`
        INSERT INTO void_bills (id, cashier_name, bill_items_count, total_amount, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [voidId, cashierName, cartCount, totalAmount, finalReason, new Date().toISOString()]);

      hardwareService.playScanSuccess();
      onConfirmCancel();
      onClose();
    } catch (err: any) {
      await posAlert('Void Bill Error', `Error logging voided bill: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-4 font-sans select-none animate-fade-in">
      <div className="bg-white border border-stone-300 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col">
        
        {/* HEADER */}
        <div className="bg-red-950 text-white px-5 py-4 flex items-center justify-between border-b border-red-900">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-red-600 text-white rounded-xl">
              <AlertOctagon className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wide">VOID &amp; ABORT BILL</h2>
              <span className="text-[10px] text-red-300 font-mono">Permanent audit trail logged to SQLite</span>
            </div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CONTENT */}
        <div className="p-5 space-y-4 text-xs">
          
          <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex justify-between items-center text-red-950">
            <div>
              <span className="font-bold block">Active Cart: {cartCount} Items</span>
              <span className="text-[11px] text-stone-500 font-mono">Cashier: {cashierName}</span>
            </div>
            <span className="text-lg font-black font-mono text-red-700">
              Rs. {totalAmount.toLocaleString()}
            </span>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-stone-500 uppercase mb-2">Select Void Reason</label>
            <div className="space-y-1.5">
              {REASONS.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setSelectedReason(r)}
                  className={`w-full text-left px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    selectedReason === r
                      ? 'bg-red-600 text-white border-red-600 shadow-xs'
                      : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Additional Note (Optional)</label>
            <input
              type="text"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="e.g. Card machine timeout error"
              className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl font-medium"
            />
          </div>

          <div className="pt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-xl font-bold cursor-pointer"
            >
              Back to Bill
            </button>
            <button
              type="button"
              onClick={handleCancelBill}
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-red-700 hover:bg-red-800 disabled:opacity-40 text-white rounded-xl font-black shadow-md cursor-pointer"
            >
              {isSubmitting ? 'Voiding...' : 'Confirm Void Cart'}
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
