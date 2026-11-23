import React, { useState, useEffect, useRef } from 'react';
import { Product } from '../../types';
import { catalogService } from '../../services/catalogService';
import { hardwareService } from '../../services/hardwareService';
import { HelpCircle, Barcode, ShoppingCart, X, Check, Search, ArrowUpDown } from 'lucide-react';

interface QuickPriceCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddToCart?: (product: Product) => void;
}

export const QuickPriceCheckModal: React.FC<QuickPriceCheckModalProps> = ({
  isOpen,
  onClose,
  onAddToCart
}) => {
  const [query, setQuery] = useState('');
  const [matchedProduct, setMatchedProduct] = useState<Product | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setMatchedProduct(null);
      setNotFound(false);
      setSearchResults([]);
      setSelectedIndex(-1);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Live text search for autocomplete
  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setNotFound(false);
    setSelectedIndex(-1);

    const q = val.trim();
    if (q.length >= 1) {
      try {
        const results = await catalogService.searchProducts(q, 6);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      }
    } else {
      setSearchResults([]);
    }
  };

  const handleSelectProduct = (prod: Product) => {
    setMatchedProduct(prod);
    setNotFound(false);
    setSearchResults([]);
    setSelectedIndex(-1);
    hardwareService.playScanSuccess();
    inputRef.current?.focus();
  };

  const handleLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const raw = query.trim();
    if (!raw) return;

    // 1. If user highlighted a dropdown item
    if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
      handleSelectProduct(searchResults[selectedIndex]);
      return;
    }

    // 2. If exactly 1 match in search results
    if (searchResults.length === 1) {
      handleSelectProduct(searchResults[0]);
      return;
    }

    // 3. Search barcode / SKU first
    let prod = await catalogService.findByBarcodeOrSku(raw);
    if (!prod) {
      // 4. Search by name
      const list = await catalogService.searchProducts(raw, 1);
      if (list.length > 0) prod = list[0];
    }

    if (prod) {
      handleSelectProduct(prod);
    } else {
      setMatchedProduct(null);
      setSearchResults([]);
      setNotFound(true);
      hardwareService.playError();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === 'ArrowDown') {
      if (searchResults.length > 0) {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % searchResults.length);
      }
    } else if (e.key === 'ArrowUp') {
      if (searchResults.length > 0) {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + searchResults.length) % searchResults.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults.length > 0 && selectedIndex >= 0) {
        handleSelectProduct(searchResults[selectedIndex]);
      } else if (matchedProduct && onAddToCart) {
        handleAddAndClose();
      } else {
        handleLookup();
      }
    }
  };

  const handleAddAndClose = () => {
    if (matchedProduct && onAddToCart) {
      onAddToCart(matchedProduct);
      hardwareService.playScanSuccess();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-4 font-sans select-none animate-fade-in"
      onKeyDown={handleKeyDown}
    >
      <div className="bg-white border border-stone-300 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col">
        
        {/* HEADER */}
        <div className="bg-[#243338] text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#5B7981] text-[#E3D5C0] rounded-xl">
              <HelpCircle className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wide">QUICK PRICE INQUIRY [F10]</h2>
              <span className="text-[10px] text-[#E3D5C0] font-mono">Scan barcode or enter name to check shelf price</span>
            </div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-white cursor-pointer p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* LOOKUP INPUT WITH LIVE SUGGESTIONS */}
        <div className="p-5 space-y-4">
          <div className="relative">
            <form onSubmit={handleLookup} className="relative">
              <Barcode className="w-5 h-5 text-stone-400 absolute left-3.5 top-3" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={handleInputChange}
                placeholder="Scan barcode or enter item name..."
                className="w-full pl-11 pr-4 py-3 bg-stone-50 border-2 border-stone-300 focus:border-[#5B7981] rounded-2xl text-sm font-mono font-bold outline-hidden transition-all shadow-2xs"
                autoFocus
              />
            </form>

            {/* LIVE AUTOCOMPLETE DROPDOWN */}
            {searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-stone-300 rounded-2xl shadow-xl z-50 max-h-56 overflow-y-auto divide-y divide-stone-100">
                {searchResults.map((prod, idx) => {
                  const isHighlighted = idx === selectedIndex;
                  return (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => handleSelectProduct(prod)}
                      className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between cursor-pointer transition-colors ${
                        isHighlighted ? 'bg-[#5B7981] text-white' : 'hover:bg-stone-100 text-stone-800'
                      }`}
                    >
                      <div className="truncate pr-2">
                        <span className="font-bold text-xs block truncate">{prod.name}</span>
                        <span className={`text-[10px] font-mono ${isHighlighted ? 'text-[#E3D5C0]' : 'text-stone-400'}`}>
                          {prod.category} • {prod.barcode || prod.sku}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`font-mono font-black text-xs block ${isHighlighted ? 'text-white' : 'text-emerald-700'}`}>
                          Rs. {prod.sale_price.toLocaleString()}
                        </span>
                        <span className={`text-[10px] font-mono ${isHighlighted ? 'text-stone-200' : 'text-stone-400'}`}>
                          Stock: {prod.stock_qty}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* PRODUCT CARD RESULT */}
          {matchedProduct && (
            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-3">
              <div>
                <span className="text-[10px] text-emerald-800 font-mono uppercase tracking-wider block">
                  {matchedProduct.category} • Barcode: {matchedProduct.barcode || matchedProduct.sku}
                </span>
                <h3 className="text-base font-black text-stone-900 mt-0.5">
                  {matchedProduct.name}
                </h3>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-emerald-200/60">
                <div>
                  <span className="text-[10px] text-stone-500 font-mono block">Current Stock</span>
                  <span className={`text-xs font-bold font-mono ${matchedProduct.stock_qty < 5 ? 'text-amber-600' : 'text-stone-800'}`}>
                    {matchedProduct.stock_qty} {matchedProduct.unit_type}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-emerald-700 uppercase font-mono font-bold block">Retail Shelf Price</span>
                  <span className="text-2xl font-black font-mono text-emerald-800">
                    Rs. {matchedProduct.sale_price.toLocaleString()}
                  </span>
                </div>
              </div>

              {onAddToCart && (
                <button
                  type="button"
                  onClick={handleAddAndClose}
                  className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-xs mt-2 transition-all hover:scale-101"
                >
                  <ShoppingCart className="w-4 h-4" /> Add to Active Bill [Enter]
                </button>
              )}
            </div>
          )}

          {notFound && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-center text-xs text-red-700 space-y-1">
              <strong>Item Not Found</strong>
              <p className="text-[11px] text-red-500 font-mono">No product found matching "{query}". Check barcode or add item via [F8].</p>
            </div>
          )}
        </div>

        {/* FOOTER SHORTCUT INSTRUCTIONS */}
        <div className="bg-stone-50 px-5 py-3 border-t border-stone-200 flex justify-between items-center text-xs text-stone-500">
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span><strong>[↑/↓]</strong> Navigate</span>
            <span>•</span>
            <span><strong>[Enter]</strong> {matchedProduct ? 'Add to Bill' : 'Check'}</span>
            <span>•</span>
            <span><strong>[Esc]</strong> Close</span>
          </div>
          <button onClick={onClose} className="px-3.5 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-lg font-bold cursor-pointer text-xs">
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
