import React, { useState, useEffect, useRef } from 'react';
import { Product } from '../../types';
import { hardwareService } from '../../services/hardwareService';
import { Scale, X, Check, Egg, Wheat, ArrowUpDown, Coins, Package, Search } from 'lucide-react';

interface LooseWeightModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    product: Product, 
    calculatedQty: number, 
    calculatedPrice: number,
    deductQty?: number,
    unitLabel?: string,
    isSubunitSale?: boolean
  ) => void;
  products: Product[];
}

const isCountedItem = (prod: Product | null): boolean => {
  if (!prod) return false;
  if (Boolean(prod.is_loose) && prod.unit_type === 'piece') return true;
  const nameLower = (prod.name || '').toLowerCase();
  const baseLower = (prod.base_unit || '').toLowerCase();
  const saleLower = (prod.sale_unit || '').toLowerCase();
  return (
    nameLower.includes('egg') || 
    baseLower.includes('tray') || 
    baseLower.includes('dozen') || 
    saleLower.includes('egg') || 
    saleLower.includes('piece')
  );
};

export const LooseWeightModal: React.FC<LooseWeightModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  products
}) => {
  // Filter products that are loose, weighable, or bulk grocery
  const looseProducts = products.filter(
    p => Boolean(p.is_loose) || p.is_weighable || p.unit_type === 'kg' || p.category === 'Loose &amp; Bulk Grocery'
  );

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [filterType, setFilterType] = useState<'ALL' | 'COUNT' | 'WEIGHT'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Dual Produce Input Engine (M3.2): 'WEIGHT' (kg) <---> 'RUPEES' (Rs.)
  const [entryMode, setEntryMode] = useState<'WEIGHT' | 'RUPEES'>('WEIGHT');
  const [weightKg, setWeightKg] = useState<number>(1.0);
  const [rupeesAmount, setRupeesAmount] = useState<number>(0);
  const [ratePerKg, setRatePerKg] = useState<number>(0);

  // State for counted dual-unit products (e.g. Eggs)
  const [countedQty, setCountedQty] = useState<number>(6); // Default half dozen
  const [subunitRate, setSubunitRate] = useState<number>(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const weightInputRef = useRef<HTMLInputElement>(null);
  const rupeesInputRef = useRef<HTMLInputElement>(null);
  const countedInputRef = useRef<HTMLInputElement>(null);

  const handleSelectProduct = (prod: Product) => {
    setSelectedProduct(prod);
    if (isCountedItem(prod)) {
      const subPrice = prod.subunit_sale_price || 
        (prod.unit_conversion_ratio && prod.unit_conversion_ratio > 0 
          ? Math.round((prod.sale_price / prod.unit_conversion_ratio) * 100) / 100 
          : prod.sale_price);
      setSubunitRate(subPrice);
      setCountedQty(6);
    } else {
      const priceKg = prod.subunit_sale_price || prod.sale_price;
      setRatePerKg(priceKg);
      setWeightKg(1.0);
      setRupeesAmount(Math.round(priceKg));
      setEntryMode('WEIGHT');
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 60);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (looseProducts.length > 0 && !selectedProduct) {
      handleSelectProduct(looseProducts[0]);
    }
  }, [isOpen, looseProducts.length, selectedProduct]);

  if (!isOpen) return null;

  const activeIsCounted = isCountedItem(selectedProduct);

  // Synchronized Weight <---> Rupees Calculations
  const handleWeightChange = (val: number) => {
    const safeVal = Math.max(0, val);
    setWeightKg(safeVal);
    if (ratePerKg > 0) {
      setRupeesAmount(Math.round(safeVal * ratePerKg));
    }
  };

  const handleRupeesChange = (val: number) => {
    const safeVal = Math.max(0, val);
    setRupeesAmount(safeVal);
    if (ratePerKg > 0) {
      const computedKg = Math.round((safeVal / ratePerKg) * 1000) / 1000;
      setWeightKg(computedKg);
    }
  };

  // Calculations
  let finalQty = 1;
  let finalPrice = 0;
  let deductQty = 1;
  let unitLabel = '';
  let isSubunitSale = false;

  if (selectedProduct) {
    if (activeIsCounted) {
      finalQty = Math.max(1, countedQty);
      finalPrice = Math.round(finalQty * subunitRate);
      const ratio = selectedProduct.unit_conversion_ratio || 1;
      deductQty = Math.round((finalQty / ratio) * 1000) / 1000;
      unitLabel = selectedProduct.sale_unit || 'Eggs';
      isSubunitSale = true;
    } else {
      finalQty = weightKg;
      finalPrice = Math.round(weightKg * ratePerKg);
      unitLabel = selectedProduct.sale_unit || (selectedProduct.unit_type === 'liter' ? 'Litres' : 'kg');
      if (Boolean(selectedProduct.is_loose) && selectedProduct.unit_conversion_ratio && selectedProduct.unit_conversion_ratio > 1) {
        deductQty = Math.round((weightKg / selectedProduct.unit_conversion_ratio) * 1000) / 1000;
        isSubunitSale = true;
      } else {
        deductQty = weightKg;
        isSubunitSale = false;
      }
    }
  }

  const handleConfirm = () => {
    if (!selectedProduct) return;
    if (activeIsCounted) {
      if (countedQty <= 0) return;
      onConfirm(selectedProduct, finalQty, subunitRate, deductQty, unitLabel, isSubunitSale);
    } else {
      if (finalQty <= 0) return;
      onConfirm(selectedProduct, finalQty, ratePerKg, deductQty, unitLabel, isSubunitSale);
    }
    onClose();
  };

  // Left/Right and Up/Down keyboard navigation listener between Weight and Rupees (M3.2)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (!activeIsCounted) {
      if ((e.key === 'ArrowRight' || e.key === 'ArrowDown') && entryMode === 'WEIGHT') {
        e.preventDefault();
        setEntryMode('RUPEES');
        rupeesInputRef.current?.focus();
        rupeesInputRef.current?.select();
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') && entryMode === 'RUPEES') {
        e.preventDefault();
        setEntryMode('WEIGHT');
        weightInputRef.current?.focus();
        weightInputRef.current?.select();
      }
    }
  };

  const filteredDisplayProducts = looseProducts.filter(p => {
    if (filterType === 'COUNT' && !isCountedItem(p)) return false;
    if (filterType === 'WEIGHT' && isCountedItem(p)) return false;
    if (searchTerm.trim()) {
      const st = searchTerm.trim().toLowerCase();
      const matchName = (p.name || '').toLowerCase().includes(st);
      const matchBarcode = (p.barcode || '').toLowerCase().includes(st);
      const matchSku = (p.sku || '').toLowerCase().includes(st);
      const matchCat = (p.category || '').toLowerCase().includes(st);
      return matchName || matchBarcode || matchSku || matchCat;
    }
    return true;
  });

  return (
    <div 
      className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-3 font-sans select-none"
      onKeyDown={handleKeyDown}
    >
      <div className="bg-white border border-stone-300 rounded-3xl max-w-xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* HEADER */}
        <div className="bg-[#243338] text-white px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="bg-[#5B7981] text-[#E3D5C0] p-1.5 rounded-xl">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm tracking-wide">LOOSE &amp; DUAL-UNIT COMMODITY TERMINAL [F9]</h3>
              <p className="text-[11px] text-[#E3D5C0]">Sugar, Flour, Rice, Cooking Oil, Spices &amp; Eggs</p>
            </div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-white cursor-pointer p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-3.5 overflow-y-auto">
          
          {/* SEARCH BAR (WORD &amp; BARCODE SCANNER) */}
          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => {
                const val = e.target.value;
                setSearchTerm(val);
                const clean = val.trim();
                if (clean) {
                  const exact = looseProducts.find(p => (p.barcode && p.barcode === clean) || (p.sku && p.sku === clean));
                  if (exact) {
                    handleSelectProduct(exact);
                    hardwareService.playScanSuccess();
                  }
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (filteredDisplayProducts.length > 0) {
                    handleSelectProduct(filteredDisplayProducts[0]);
                    hardwareService.playScanSuccess();
                    if (isCountedItem(filteredDisplayProducts[0])) {
                      countedInputRef.current?.focus();
                    } else {
                      weightInputRef.current?.focus();
                      weightInputRef.current?.select();
                    }
                  }
                }
              }}
              placeholder="Scan barcode or type commodity name (e.g. Sugar, Atta, Rice, Eggs, Dal...)..."
              className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border-2 border-stone-300 focus:border-[#5B7981] focus:bg-white rounded-2xl text-xs font-mono font-bold outline-hidden transition-all shadow-2xs"
            />
          </div>

          {/* CATEGORY FILTER TABS */}
          <div className="flex gap-1.5 p-1 bg-stone-100 rounded-xl">
            <button
              type="button"
              onClick={() => setFilterType('ALL')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterType === 'ALL' ? 'bg-white shadow-xs text-stone-900' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              All Loose ({looseProducts.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('COUNT')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                filterType === 'COUNT' ? 'bg-white shadow-xs text-amber-900' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <Egg className="w-3.5 h-3.5" /> Counted (Eggs/Pcs)
            </button>
            <button
              type="button"
              onClick={() => setFilterType('WEIGHT')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                filterType === 'WEIGHT' ? 'bg-white shadow-xs text-emerald-900' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <Scale className="w-3.5 h-3.5" /> Weighed / Liquids
            </button>
          </div>

          {/* COMMODITY PICKER GRID */}
          <div>
            <label className="block text-[11px] font-bold text-stone-700 mb-1">
              Select Commodity Item:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto p-1.5 bg-stone-50 rounded-2xl border border-stone-200">
              {filteredDisplayProducts.length === 0 ? (
                <div className="col-span-3 text-center py-4 text-xs text-stone-400">
                  No loose items in this category.
                </div>
              ) : (
                filteredDisplayProducts.map(p => {
                  const isCount = isCountedItem(p);
                  const isSelected = selectedProduct?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectProduct(p)}
                      className={`p-2 rounded-xl text-left text-xs font-bold transition-all cursor-pointer border ${
                        isSelected
                          ? 'bg-[#5B7981] text-white border-[#5B7981] shadow-xs'
                          : 'bg-white hover:bg-stone-100 text-stone-800 border-stone-200'
                      }`}
                    >
                      <div className="flex items-center gap-1 truncate">
                        {isCount ? <Egg className="w-3 h-3 text-amber-400 shrink-0" /> : <Wheat className="w-3 h-3 text-emerald-400 shrink-0" />}
                        <span className="truncate">{p.name}</span>
                      </div>
                      <span className={`text-[10px] block font-mono ${isSelected ? 'text-[#E3D5C0]' : 'text-stone-500'}`}>
                        {Boolean(p.is_loose) && p.subunit_sale_price
                          ? `Rs. ${p.subunit_sale_price}/${p.sale_unit || 'unit'}`
                          : `Rs. ${p.sale_price}/${p.unit_type}`}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* ACTIVE PRODUCT DUAL-UNIT CALCULATOR PANEL */}
          {selectedProduct && (
            <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-3.5">
              
              <div className="flex items-center justify-between border-b border-stone-200 pb-2">
                <div>
                  <h4 className="font-bold text-sm text-stone-900">{selectedProduct.name}</h4>
                  <span className="text-[10px] text-stone-500 font-mono">
                    Stock: {selectedProduct.stock_qty} {selectedProduct.base_unit || selectedProduct.unit_type}
                    {Boolean(selectedProduct.is_loose) && selectedProduct.unit_conversion_ratio && selectedProduct.unit_conversion_ratio > 1
                      ? ` (≈ ${Math.round(selectedProduct.stock_qty * selectedProduct.unit_conversion_ratio)} ${selectedProduct.sale_unit || 'units'})`
                      : ''}
                  </span>
                </div>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                  activeIsCounted ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'
                }`}>
                  {activeIsCounted ? 'COUNTED SUBUNIT' : 'WEIGHT / RUPEES ENGINE'}
                </span>
              </div>

              {activeIsCounted ? (
                /* COUNTED DUAL-UNIT UI (e.g. EGGS) */
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">
                        Number of {selectedProduct.sale_unit || 'Eggs / Pieces'}
                      </label>
                      <input
                        ref={countedInputRef}
                        type="number"
                        min="1"
                        step="1"
                        value={countedQty}
                        onChange={(e) => setCountedQty(Math.max(1, parseInt(e.target.value) || 0))}
                        className="w-full px-3 py-2 bg-white border-2 border-[#5B7981] rounded-xl text-lg font-mono font-black text-stone-900 text-center outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">
                        Rate (Rs. per {selectedProduct.sale_unit || 'Egg'})
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={subunitRate}
                        onChange={(e) => setSubunitRate(Number(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-lg font-mono font-bold text-stone-800 text-center outline-hidden"
                      />
                    </div>
                  </div>

                  {/* QUICK COUNT PRESETS (EGGS) */}
                  <div>
                    <span className="text-[10px] font-bold text-stone-500 uppercase block mb-1">
                      Quick Egg / Piece Select:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: '1 Egg', qty: 1 },
                        { label: '2 Eggs', qty: 2 },
                        { label: '4 Eggs', qty: 4 },
                        { label: '6 Eggs (Half Dozen)', qty: 6 },
                        { label: '12 Eggs (1 Dozen)', qty: 12 },
                        { label: '24 Eggs (2 Dozens)', qty: 24 },
                        { label: '30 Eggs (1 Full Tray)', qty: 30 }
                      ].map(preset => (
                        <button
                          key={preset.qty}
                          type="button"
                          onClick={() => setCountedQty(preset.qty)}
                          className={`px-2.5 py-1.5 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer ${
                            countedQty === preset.qty
                              ? 'bg-[#243338] text-white shadow-xs'
                              : 'bg-white hover:bg-stone-200 text-stone-800 border border-stone-200'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* DUAL PRODUCE ENGINE: WEIGHT (KG) <---> RUPEES (RS.) TOGGLED VIA UP/DOWN ARROWS (M3.2) */
                <div className="space-y-3">
                  
                  {/* MODE INDICATOR PILL */}
                  <div className="flex items-center justify-between text-[11px] font-bold text-stone-600 bg-stone-200/60 px-3 py-1.5 rounded-xl">
                    <span className="flex items-center gap-1.5">
                      <ArrowUpDown className="w-3.5 h-3.5 text-[#5B7981]" />
                      <span>Use <strong>Left / Right Arrow Keys [← / →]</strong> to switch between Weight and Rupee Amount</span>
                    </span>
                    <span className="font-mono text-[#5B7981]">
                      Mode: <strong>{entryMode === 'WEIGHT' ? 'Kg Input [←]' : 'Rs. Input [→]'}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    
                    {/* 1. WEIGHT IN KG */}
                    <div>
                      <label className="block text-xs font-bold text-stone-800 mb-1 flex items-center justify-between">
                        <span>Weight in Kg</span>
                        {entryMode === 'WEIGHT' && (
                          <span className="text-[10px] text-[#5B7981] font-mono font-black">ACTIVE [←]</span>
                        )}
                      </label>
                      <input
                        ref={weightInputRef}
                        type="number"
                        min="0.001"
                        step="any"
                        value={weightKg || ''}
                        onFocus={() => setEntryMode('WEIGHT')}
                        onChange={(e) => handleWeightChange(Number(e.target.value) || 0)}
                        className={`w-full px-3 py-2 bg-white rounded-xl text-lg font-mono font-black text-stone-900 text-center outline-hidden transition-all ${
                          entryMode === 'WEIGHT'
                            ? 'border-2 border-[#5B7981] shadow-xs ring-2 ring-[#5B7981]/20'
                            : 'border border-stone-300'
                        }`}
                        placeholder="e.g. 1.5"
                      />
                      <span className="text-[10px] text-stone-500 block text-center mt-1 font-mono">
                        = {Math.round(weightKg * 1000)} grams
                      </span>
                    </div>

                    {/* 2. RUPEES AMOUNT */}
                    <div>
                      <label className="block text-xs font-bold text-stone-800 mb-1 flex items-center justify-between">
                        <span>Rupees Amount</span>
                        {entryMode === 'RUPEES' && (
                          <span className="text-[10px] text-emerald-700 font-mono font-black">ACTIVE [→]</span>
                        )}
                      </label>
                      <input
                        ref={rupeesInputRef}
                        type="number"
                        min="1"
                        step="any"
                        value={rupeesAmount || ''}
                        onFocus={() => setEntryMode('RUPEES')}
                        onChange={(e) => handleRupeesChange(Number(e.target.value) || 0)}
                        className={`w-full px-3 py-2 bg-white rounded-xl text-lg font-mono font-black text-stone-900 text-center outline-hidden transition-all ${
                          entryMode === 'RUPEES'
                            ? 'border-2 border-emerald-600 shadow-xs ring-2 ring-emerald-600/20'
                            : 'border border-stone-300'
                        }`}
                        placeholder="e.g. 150"
                      />
                      <span className="text-[10px] text-stone-500 block text-center mt-1 font-mono">
                        Customer Budget
                      </span>
                    </div>

                    {/* 3. RATE PER KG */}
                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">
                        Rate (Rs. per {selectedProduct.sale_unit || 'kg'})
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={ratePerKg}
                        onChange={(e) => {
                          const r = Number(e.target.value) || 0;
                          setRatePerKg(r);
                          if (entryMode === 'WEIGHT') {
                            setRupeesAmount(Math.round(weightKg * r));
                          } else if (r > 0) {
                            setWeightKg(Math.round((rupeesAmount / r) * 1000) / 1000);
                          }
                        }}
                        className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-lg font-mono font-bold text-stone-800 text-center outline-hidden"
                      />
                      <span className="text-[10px] text-stone-500 block text-center mt-1 font-mono">
                        Standard Shelf Rate
                      </span>
                    </div>

                  </div>

                  {/* QUICK PRESETS: WEIGHT VS RUPEES */}
                  <div className="space-y-2">
                    {/* WEIGHT PRESETS */}
                    <div>
                      <span className="text-[10px] font-bold text-stone-500 uppercase block mb-1">
                        Quick Weight Presets:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: '250g', kg: 0.25 },
                          { label: '500g (Adha Kg)', kg: 0.5 },
                          { label: '750g', kg: 0.75 },
                          { label: '1 kg', kg: 1.0 },
                          { label: '2 kg', kg: 2.0 },
                          { label: '5 kg', kg: 5.0 },
                          { label: '10 kg', kg: 10.0 },
                          { label: '20 kg (Bori/Bag)', kg: 20.0 }
                        ].map(w => (
                          <button
                            key={w.kg}
                            type="button"
                            onClick={() => {
                              handleWeightChange(w.kg);
                              setEntryMode('WEIGHT');
                              weightInputRef.current?.focus();
                            }}
                            className={`px-2 py-1 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer ${
                              weightKg === w.kg
                                ? 'bg-[#243338] text-white shadow-xs'
                                : 'bg-white hover:bg-stone-200 text-stone-800 border border-stone-200'
                            }`}
                          >
                            {w.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* RUPEE AMOUNT PRESETS */}
                    <div>
                      <span className="text-[10px] font-bold text-emerald-800 uppercase block mb-1">
                        Quick Rupee Amount Presets:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {[50, 100, 150, 200, 300, 500, 1000].map(rs => (
                          <button
                            key={rs}
                            type="button"
                            onClick={() => {
                              handleRupeesChange(rs);
                              setEntryMode('RUPEES');
                              rupeesInputRef.current?.focus();
                            }}
                            className={`px-2 py-1 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer ${
                              rupeesAmount === rs
                                ? 'bg-emerald-700 text-white shadow-xs'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200'
                            }`}
                          >
                            Rs. {rs}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                </div>
              )}

              {/* DEDUCTION SUMMARY HINT */}
              {Boolean(selectedProduct.is_loose) && selectedProduct.unit_conversion_ratio && selectedProduct.unit_conversion_ratio > 1 && (
                <div className="p-2 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900 font-mono flex items-center justify-between">
                  <span>
                    Stock Deduction: <strong>{deductQty} {selectedProduct.base_unit || 'Base Units'}</strong>
                  </span>
                  <span>(1:{selectedProduct.unit_conversion_ratio})</span>
                </div>
              )}

            </div>
          )}

          {/* CALCULATED TOTAL BOX */}
          <div className="p-4 bg-stone-900 text-white rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-xs text-stone-400 block font-mono">
                {selectedProduct?.name} ({finalQty} {unitLabel} @ Rs. {activeIsCounted ? subunitRate : ratePerKg})
              </span>
              <span className="text-2xl font-black font-mono text-[#E3D5C0]">
                Rs. {finalPrice.toLocaleString()}
              </span>
            </div>

            <button
              type="button"
              onClick={handleConfirm}
              className="px-6 py-3 bg-[#5B7981] hover:bg-[#486269] text-white rounded-xl text-xs font-black cursor-pointer flex items-center gap-1.5 transition-all shadow-md active:scale-98"
            >
              <Check className="w-4 h-4" /> Add to Cart [Enter]
            </button>
          </div>

        </div>

        {/* FOOTER KEYBOARD SHORTCUTS BAR */}
        <div className="bg-stone-50 px-5 py-2.5 border-t border-stone-200 flex justify-between items-center text-xs text-stone-500 font-mono">
          <div className="flex items-center gap-2 text-[11px]">
            <span><strong>[Type/Scan]</strong> Search</span>
            <span>•</span>
            <span><strong>[←/→]</strong> Kg/Rs</span>
            <span>•</span>
            <span><strong>[Enter]</strong> Add to Cart</span>
            <span>•</span>
            <span><strong>[Esc]</strong> Close</span>
          </div>
          <button onClick={onClose} className="px-3 py-1 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-lg font-bold cursor-pointer text-xs">
            Done [Esc]
          </button>
        </div>

      </div>
    </div>
  );
};
