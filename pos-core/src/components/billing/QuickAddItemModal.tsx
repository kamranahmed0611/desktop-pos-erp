import React, { useState, useEffect, useRef } from 'react';
import { Product } from '../../types';
import { catalogService } from '../../services/catalogService';
import { hardwareService } from '../../services/hardwareService';
import { posAlert } from '../../store/uiStore';
import { PlusCircle, Barcode, X, Check, Sparkles } from 'lucide-react';

interface QuickAddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialBarcode?: string;
  onProductCreated: (product: Product) => void;
}

export const QuickAddItemModal: React.FC<QuickAddItemModalProps> = ({
  isOpen,
  onClose,
  initialBarcode = '',
  onProductCreated
}) => {
  const [barcode, setBarcode] = useState(initialBarcode);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('General');
  const [salePrice, setSalePrice] = useState<number | ''>('');
  const [costPrice, setCostPrice] = useState<number | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const priceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setBarcode(initialBarcode);
      setName('');
      setCategory('General');
      setSalePrice('');
      setCostPrice('');
      
      // Focus barcode input immediately so scanner can scan directly
      setTimeout(() => {
        if (!initialBarcode) {
          barcodeInputRef.current?.focus();
        } else {
          nameInputRef.current?.focus();
        }
      }, 50);
    }
  }, [isOpen, initialBarcode]);

  if (!isOpen) return null;

  // Handle Enter key on Barcode input -> advance to Name
  const handleBarcodeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (barcode.trim()) {
        hardwareService.playScanSuccess();
        nameInputRef.current?.focus();
      }
    }
  };

  // Handle Enter key on Name input -> advance to Price
  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (name.trim()) {
        priceInputRef.current?.focus();
      }
    }
  };

  const handleGenerateBarcode = () => {
    const code = catalogService.generateEan13Barcode();
    setBarcode(code);
    hardwareService.playScanSuccess();
    nameInputRef.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isSubmitting) return;
    if (!name.trim() || !salePrice || Number(salePrice) <= 0) {
      await posAlert('Missing Information', 'Please enter product name and a valid selling price.', 'warning');
      return;
    }

    const effectiveBarcode = barcode.trim() || catalogService.generateEan13Barcode();

    setIsSubmitting(true);
    try {
      // Check for duplicate barcode
      const existing = await catalogService.findByBarcodeOrSku(effectiveBarcode);
      if (existing) {
        await posAlert(
          'Duplicate Barcode',
          `Barcode ${effectiveBarcode} is already registered to "${existing.name}". Please scan or enter a unique barcode.`,
          'error'
        );
        setIsSubmitting(false);
        barcodeInputRef.current?.focus();
        return;
      }

      const newProduct = await catalogService.createProduct({
        name: name.trim(),
        barcode: effectiveBarcode,
        category: category,
        cost_price: Number(costPrice) || 0,
        sale_price: Number(salePrice),
        stock_qty: 100, // Pre-seed initial shelf stock
        unit_type: 'piece',
        is_weighable: false,
        min_stock_alert: 5
      });

      hardwareService.playScanSuccess();
      onProductCreated(newProduct);
      onClose();
    } catch (err: any) {
      hardwareService.playError();
      await posAlert('Error Creating Product', err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-4 font-sans select-none animate-fade-in"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className="bg-white border border-stone-300 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col">
        
        {/* HEADER */}
        <div className="bg-[#243338] text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-xs">
              <PlusCircle className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wide">QUICK PRODUCT CREATION [F8]</h2>
              <span className="text-[10px] text-emerald-300 font-mono">Scan barcode &amp; type in 3 seconds</span>
            </div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* RAPID-FIRE FORM */}
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs">
          
          {/* STEP 1: SCAN BARCODE */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-[10px] font-bold text-stone-600 uppercase flex items-center gap-1">
                <Barcode className="w-3.5 h-3.5 text-stone-500" />
                <span>1. Scan Barcode (Scanner Input)</span>
              </label>
              <button
                type="button"
                onClick={handleGenerateBarcode}
                className="text-[10px] font-bold text-[#5B7981] hover:text-[#243338] underline cursor-pointer"
              >
                No Barcode? Auto-Gen
              </button>
            </div>
            <input
              ref={barcodeInputRef}
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={handleBarcodeKeyDown}
              placeholder="Point scanner &amp; scan, or type code and press Enter..."
              className="w-full px-3 py-2.5 bg-stone-50 border-2 border-stone-300 focus:border-emerald-600 rounded-xl font-mono font-bold text-stone-900 outline-hidden transition-all"
              autoFocus
            />
          </div>

          {/* STEP 2: PRODUCT TITLE */}
          <div>
            <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">
              2. Product Description / Name
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleNameKeyDown}
              placeholder="e.g. Shan Chaat Masala 100g (Press Enter to advance)"
              className="w-full px-3 py-2.5 bg-stone-50 border-2 border-stone-300 focus:border-emerald-600 rounded-xl font-bold text-sm text-stone-900 outline-hidden transition-all"
              required
            />
          </div>

          {/* STEP 3: CATEGORY &amp; SALE PRICE */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-2.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl font-bold text-xs"
              >
                <option value="General">General</option>
                <option value="Dairy &amp; Bakery">Dairy &amp; Bakery</option>
                <option value="Beverages &amp; Drinks">Beverages &amp; Drinks</option>
                <option value="Cooking Oil &amp; Ghee">Cooking Oil &amp; Ghee</option>
                <option value="Staples &amp; Grains">Staples &amp; Grains</option>
                <option value="Spices &amp; Seasonings">Spices &amp; Seasonings</option>
                <option value="Household &amp; Cleaning">Household &amp; Cleaning</option>
                <option value="Snacks &amp; Biscuits">Snacks &amp; Biscuits</option>
                <option value="Personal Care">Personal Care</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-emerald-800 uppercase mb-1">
                3. Retail Price (PKR)
              </label>
              <input
                ref={priceInputRef}
                type="number"
                step="any"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Rs. 150"
                className="w-full px-3 py-2 bg-stone-50 border-2 border-emerald-500 focus:border-emerald-700 rounded-xl font-mono font-bold text-base text-emerald-900 outline-hidden"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">
              Cost Price (Optional - for margin tracking)
            </label>
            <input
              type="number"
              step="any"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="Rs. 120 (Optional)"
              className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl font-mono text-stone-600 text-xs"
            />
          </div>

          <div className="pt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-xl font-bold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white rounded-xl font-black shadow-md cursor-pointer flex items-center gap-1.5 transition-all hover:scale-102"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>{isSubmitting ? 'Saving...' : 'Save &amp; Add to Bill [Enter]'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
