import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Category, Product, ProductBarcode, UnitType, StoreSettings } from '../../types';
import { catalogService, CreateProductInput } from '../../services/catalogService';
import { hardwareService } from '../../services/hardwareService';
import { BarcodeStickerModal } from './BarcodeStickerModal';
import { SimpleLooseItemWizardModal } from './SimpleLooseItemWizardModal';
import { printItemBarcodeSlip } from '../../utils/barcodePrinter';
import { posAlert, posConfirm } from '../../store/uiStore';
import { 
  Package, Plus, Search, Edit2, Trash2, 
  Barcode, Percent, AlertCircle, AlertTriangle, CheckCircle, Sparkles, X, Check, 
  Download, RefreshCw, Calculator, Printer, ArrowUpRight, Scale 
} from 'lucide-react';

interface LoosePreset {
  label: string;
  base_unit: string;
  sale_unit: string;
  ratio: number;
  unit_type: UnitType;
}

const LOOSE_PRESETS: LoosePreset[] = [
  { label: 'Eggs (Tray 30 -> 1 Egg)', base_unit: 'Tray (30 eggs)', sale_unit: 'Egg (Piece)', ratio: 30, unit_type: 'piece' },
  { label: 'Eggs (Dozen 12 -> 1 Egg)', base_unit: 'Dozen (12 eggs)', sale_unit: 'Egg (Piece)', ratio: 12, unit_type: 'piece' },
  { label: 'Sugar/Rice/Flour (50kg Bag -> 1 kg)', base_unit: 'Bag (50 kg)', sale_unit: 'kg', ratio: 50, unit_type: 'kg' },
  { label: 'Atta Flour (20kg Bag -> 1 kg)', base_unit: 'Bag (20 kg)', sale_unit: 'kg', ratio: 20, unit_type: 'kg' },
  { label: 'Cooking Oil (16L Tin -> 1 Litre)', base_unit: 'Tin / Cane (16 L)', sale_unit: 'Litre', ratio: 16, unit_type: 'liter' },
  { label: 'Milk / Liquids (1L -> 1000 mL)', base_unit: 'Litre (1 L)', sale_unit: 'mL', ratio: 1000, unit_type: 'liter' },
  { label: 'Spices / Pulses (1kg -> 1000g)', base_unit: 'Kilogram (1 kg)', sale_unit: 'Gram (g)', ratio: 1000, unit_type: 'kg' },
];

export const ProductCatalog: React.FC<{ storeSettings?: StoreSettings }> = ({ storeSettings }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;
  const searchTimerRef = useRef<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [stockFilter, setStockFilter] = useState<'ALL' | 'LOW' | 'OUT' | 'LOOSE'>('ALL');
  const [isLoading, setIsLoading] = useState(false);

  // Modals
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isLooseWizardOpen, setIsLooseWizardOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isTaxModalOpen, setIsTaxModalOpen] = useState(false);
  const [restockProduct, setRestockProduct] = useState<Product | null>(null);

  // Restock Form State
  const [restockQty, setRestockQty] = useState<number>(10);
  const [restockCost, setRestockCost] = useState<number>(0);

  // Product Form State
  const [formData, setFormData] = useState<CreateProductInput>({
    name: '',
    urdu_name: '',
    barcode: '',
    sku: '',
    category: 'General',
    cost_price: 0,
    sale_price: 0,
    stock_qty: 0,
    whole_bags_stock: 0,
    bag_weight_kg: 50,
    unit_type: 'piece',
    min_stock_alert: 10,
    is_loose: false,
    base_unit: '',
    sale_unit: '',
    unit_conversion_ratio: 1,
    subunit_sale_price: 0
  });

  // Multi-Barcode State (M3.1)
  const [altBarcodes, setAltBarcodes] = useState<ProductBarcode[]>([]);
  const [newAltBarcode, setNewAltBarcode] = useState('');
  const [newAltNotes, setNewAltNotes] = useState('');

  // Rapid Entry &amp; Pricing Calculator State (M8.1, M8.2)
  const [marginPercent, setMarginPercent] = useState<number | ''>('');
  const [duplicateFound, setDuplicateFound] = useState<Product | null>(null);
  const [rapidContinuousMode, setRapidContinuousMode] = useState<boolean>(true);
  const [lastSavedMessage, setLastSavedMessage] = useState<string>('');

  const [barcodePrintProduct, setBarcodePrintProduct] = useState<Product | null>(null);
  const [barcodePrintFormat, setBarcodePrintFormat] = useState<'38x25mm' | '80mm'>('38x25mm');
  const [includePriceOnBarcode, setIncludePriceOnBarcode] = useState<boolean>(true);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const salePriceInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const prods = await catalogService.getProducts();
      const cats = await catalogService.getCategories();
      setProducts(prods);
      setCategories(cats);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    let unsubElectron: (() => void) | undefined;
    if ((window as any).electronAPI?.onBroadcast) {
      unsubElectron = (window as any).electronAPI.onBroadcast('db-change', () => loadData());
    }
    const handleDbChange = () => loadData();
    window.addEventListener('pos-db-change', handleDbChange);
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'pos_db_sync') loadData();
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      if (unsubElectron) unsubElectron();
      window.removeEventListener('pos-db-change', handleDbChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const syncCatalogChange = (type: string) => {
    if ((window as any).electronAPI?.broadcastChange) {
      (window as any).electronAPI.broadcastChange('db-change', { type });
    }
    window.dispatchEvent(new CustomEvent('pos-db-change', { detail: { type } }));
    localStorage.setItem('pos_db_sync', Date.now().toString());
  };

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setAltBarcodes([]);
    setNewAltBarcode('');
    setNewAltNotes('');
    setDuplicateFound(null);
    setLastSavedMessage('');
    setMarginPercent('');
    setFormData({
      name: '',
      urdu_name: '',
      barcode: '', // Leave empty so barcode scanner can input directly!
      sku: '',
      category: categories[0]?.name || 'General',
      cost_price: 0,
      sale_price: 0,
      stock_qty: 10,
      whole_bags_stock: 0,
      bag_weight_kg: 50,
      unit_type: 'piece',
      min_stock_alert: 5,
      is_loose: false,
      base_unit: '',
      sale_unit: '',
      unit_conversion_ratio: 1,
      subunit_sale_price: 0
    });
    setIsProductModalOpen(true);
    setTimeout(() => barcodeInputRef.current?.focus(), 80);
  };

  const handleOpenEdit = async (p: Product) => {
    setEditingProduct(p);
    setNewAltBarcode('');
    setNewAltNotes('');
    setDuplicateFound(null);
    setLastSavedMessage('');
    setMarginPercent(p.cost_price > 0 && p.sale_price > 0 ? Math.round(((p.sale_price - p.cost_price) / p.cost_price) * 100) : '');
    setFormData({
      name: p.name,
      urdu_name: p.urdu_name || '',
      barcode: p.barcode,
      sku: p.sku,
      category: p.category,
      cost_price: p.cost_price,
      sale_price: p.sale_price,
      stock_qty: p.stock_qty,
      whole_bags_stock: p.whole_bags_stock || 0,
      bag_weight_kg: p.bag_weight_kg || 50,
      unit_type: p.unit_type,
      min_stock_alert: p.min_stock_alert,
      is_loose: Boolean(p.is_loose),
      base_unit: p.base_unit || '',
      sale_unit: p.sale_unit || '',
      unit_conversion_ratio: p.unit_conversion_ratio || 1,
      subunit_sale_price: p.subunit_sale_price || 0
    });
    try {
      const bars = await catalogService.getProductBarcodes(p.id);
      setAltBarcodes(bars);
    } catch {
      setAltBarcodes([]);
    }
    setIsProductModalOpen(true);
    setTimeout(() => nameInputRef.current?.focus(), 80);
  };

  const handleAddAltBarcode = async () => {
    if (!editingProduct || !newAltBarcode.trim()) return;
    try {
      await catalogService.addProductBarcode(editingProduct.id, newAltBarcode.trim(), newAltNotes.trim());
      const bars = await catalogService.getProductBarcodes(editingProduct.id);
      setAltBarcodes(bars);
      setNewAltBarcode('');
      setNewAltNotes('');
      hardwareService.playScanSuccess();
    } catch (e: any) {
      hardwareService.playError();
      await posAlert('Barcode Error', e.message, 'error');
    }
  };

  const handleDeleteAltBarcode = async (barId: number) => {
    if (!editingProduct) return;
    try {
      await catalogService.deleteProductBarcode(barId);
      const bars = await catalogService.getProductBarcodes(editingProduct.id);
      setAltBarcodes(bars);
      hardwareService.playScanSuccess();
    } catch (e: any) {
      await posAlert('Error', e.message, 'error');
    }
  };

  const handleOpenWholeBag = async (p: Product) => {
    const ok = await posConfirm(
      'Open Whole Bag (Bori)',
      `Open 1 whole bag of "${p.name}"? This will deduct 1 bag and add ${p.bag_weight_kg || 50} kg to loose stock.`
    );
    if (!ok) return;
    try {
      const res = await catalogService.openWholeBag(p.id);
      hardwareService.playScanSuccess();
      await posAlert(
        'Bag Opened',
        `Successfully opened 1 bag.\nRemaining Whole Bags: ${res.newBags}\nNew Loose Stock: ${res.newStockKg} kg`,
        'success'
      );
      loadData();
    } catch (e: any) {
      hardwareService.playError();
      await posAlert('Error', e.message, 'error');
    }
  };

  const handleOpenRestock = (p: Product) => {
    setRestockProduct(p);
    setRestockQty(10);
    setRestockCost(p.cost_price);
  };

  const handleConfirmRestock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockProduct || restockQty <= 0) return;

    try {
      await catalogService.recordStockReceiptWithMovingAverage(
        restockProduct.id,
        restockQty,
        restockCost
      );
      hardwareService.playCheckoutChime();
      setRestockProduct(null);
      await posAlert('Stock Updated', `Restocked ${restockQty} units of ${restockProduct.name}. Moving average cost recalculated.`, 'success');
      loadData();
      syncCatalogChange('product-restock');
    } catch (err: any) {
      await posAlert('Restock Error', err.message, 'error');
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || formData.sale_price <= 0) {
      await posAlert('Validation Error', 'Please provide a valid product name and retail price.', 'warning');
      return;
    }

    try {
      if (editingProduct) {
        await catalogService.updateProduct(editingProduct.id, formData);
        hardwareService.playScanSuccess();
        setIsProductModalOpen(false);
        loadData();
        syncCatalogChange('product-update');
        await posAlert('Product Updated', `${formData.name} successfully updated.`, 'success');
      } else {
        await catalogService.createProduct(formData);
        hardwareService.playScanSuccess();
        loadData();
        syncCatalogChange('product-create');

        if (rapidContinuousMode) {
          setLastSavedMessage(`✓ "${formData.name}" added to catalog! Ready for next barcode.`);
          setFormData({
            name: '',
            urdu_name: '',
            barcode: '',
            sku: '',
            category: formData.category, // Preserve category
            cost_price: 0,
            sale_price: 0,
            stock_qty: 10,
            whole_bags_stock: 0,
            bag_weight_kg: 50,
            unit_type: 'piece',
            min_stock_alert: 5,
            is_loose: false,
            base_unit: '',
            sale_unit: '',
            unit_conversion_ratio: 1,
            subunit_sale_price: 0
          });
          setMarginPercent('');
          setDuplicateFound(null);
          setTimeout(() => barcodeInputRef.current?.focus(), 100);
        } else {
          setIsProductModalOpen(false);
          await posAlert('Product Created', `${formData.name} added to catalog.`, 'success');
        }
      }
    } catch (err: any) {
      hardwareService.playError();
      await posAlert('Error Saving Product', err.message, 'error');
    }
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    const ok = await posConfirm('Delete Product', `Are you sure you want to delete "${name}" from the catalog? This cannot be undone.`);
    if (ok) {
      await catalogService.deleteProduct(id);
      hardwareService.playScanSuccess();
      loadData();
      syncCatalogChange('product-delete');
    }
  };

  const handleExportCsv = () => {
    const headers = ['ID', 'Barcode', 'SKU', 'Name', 'Category', 'Cost Price', 'Sale Price', 'Stock Qty', 'Unit', 'Min Alert'];
    const rows = products.map(p => [
      p.id,
      p.barcode,
      p.sku,
      `"${p.name.replace(/"/g, '""')}"`,
      p.category,
      p.cost_price,
      p.sale_price,
      p.stock_qty,
      p.unit_type,
      p.min_stock_alert
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MR_Super_Store_Catalog_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedQuery(val);
      setCurrentPage(1);
    }, 150);
  };

  // Filtered Products (memoized with debounced query for instant UI performance)
  const filteredProducts = useMemo(() => {
    const q = debouncedQuery.toLowerCase().trim();
    return products.filter(p => {
      const matchesCat = selectedCategory === 'ALL' || p.category === selectedCategory;
      const matchesQuery = !q || 
        p.name.toLowerCase().includes(q) || 
        p.barcode?.toLowerCase().includes(q) || 
        p.sku?.toLowerCase().includes(q);
      
      let matchesStock = true;
      if (stockFilter === 'LOW') matchesStock = p.stock_qty <= p.min_stock_alert && p.stock_qty > 0;
      if (stockFilter === 'OUT') matchesStock = p.stock_qty <= 0;
      if (stockFilter === 'LOOSE') matchesStock = Boolean(p.is_loose);

      return matchesCat && matchesQuery && matchesStock;
    });
  }, [products, selectedCategory, debouncedQuery, stockFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, currentPage, pageSize]);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5 font-sans">
      
      {/* HEADER BANNER */}
      <div className="bg-[#243338] text-white p-5 rounded-3xl shadow-lg border border-stone-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black font-heading tracking-tight flex items-center gap-2.5">
            <Package className="w-6 h-6 text-[#E3D5C0]" /> PRODUCT CATALOG &amp; INVENTORY MASTER
          </h1>
          <p className="text-xs sm:text-sm text-stone-300 mt-1">
            Inflation-resistant inventory with weighted moving average costing, single-item restocking, and custom barcode slip printing.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          <button
            onClick={handleExportCsv}
            className="px-3.5 py-2.5 bg-stone-800 hover:bg-stone-700 border border-stone-600 rounded-xl text-xs font-bold text-stone-200 flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Download className="w-4 h-4 text-emerald-400" /> Export CSV
          </button>

          <button
            onClick={() => setIsTaxModalOpen(true)}
            className="px-3.5 py-2.5 bg-stone-800 hover:bg-stone-700 border border-stone-600 rounded-xl text-xs font-bold text-stone-200 flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Percent className="w-4 h-4 text-amber-400" /> Tax Rules
          </button>

          <button
            onClick={() => setIsLooseWizardOpen(true)}
            className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 cursor-pointer transition-all hover:scale-102"
            title="Create bulk goods (Sugar, Atta, Rice, Eggs, Oil) in 3 simple steps"
          >
            <Scale className="w-4 h-4 stroke-[2.5]" /> Simple Loose Item Wizard
          </button>

          <button
            onClick={handleOpenAdd}
            className="px-5 py-2.5 bg-[#5B7981] hover:bg-[#486269] text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 cursor-pointer transition-all hover:scale-102"
          >
            <Plus className="w-4 h-4 stroke-[3]" /> Add Product
          </button>
        </div>
      </div>

      {/* SEARCH &amp; QUICK FILTERS */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by name, barcode or SKU..."
            className="w-full pl-9 pr-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs outline-hidden focus:bg-white focus:border-[#5B7981]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* STOCK FILTER BADGES */}
          <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => { setStockFilter('ALL'); setCurrentPage(1); }}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                stockFilter === 'ALL' ? 'bg-[#5B7981] text-white' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              All
            </button>
            <button
              onClick={() => { setStockFilter('LOW'); setCurrentPage(1); }}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                stockFilter === 'LOW' ? 'bg-amber-600 text-white' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Low Stock
            </button>
            <button
              onClick={() => { setStockFilter('OUT'); setCurrentPage(1); }}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                stockFilter === 'OUT' ? 'bg-red-600 text-white' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Out of Stock
            </button>
            <button
              onClick={() => { setStockFilter('LOOSE'); setCurrentPage(1); }}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                stockFilter === 'LOOSE' ? 'bg-amber-700 text-white' : 'text-stone-600 hover:text-stone-900'
              }`}
              title="Show only loose &amp; bulk items (Sugar, Atta, Rice, Eggs, Oil...)"
            >
              <Scale className="w-3 h-3 text-amber-400" />
              <span>Loose Items ({products.filter(p => p.is_loose).length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* LOOSE COMMODITIES WIZARD BANNER */}
      {stockFilter === 'LOOSE' && (
        <div className="bg-amber-50 border-2 border-amber-300 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-200 rounded-xl text-amber-900">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-black text-sm text-amber-950">
                Bulk Loose Commodities Master (Dual-Unit Wholesale / Retail Tracking)
              </h4>
              <p className="text-xs text-amber-800">
                Manage Sugar, Atta, Rice, Eggs, Oil &amp; Pulses. Stock counts wholesale bags/trays while registers bill retail kg/pieces.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsLooseWizardOpen(true)}
            className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 cursor-pointer transition-all hover:scale-102 shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[3]" /> + Create Loose Item (Wizard)
          </button>
        </div>
      )}

      {/* PRODUCTS TABLE */}
      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-100 border-b border-stone-200 text-[10px] font-bold text-stone-600 uppercase tracking-wide">
              <tr>
                <th className="p-3.5">Barcode / SKU</th>
                <th className="p-3.5">Product Name</th>
                <th className="p-3.5">Category</th>
                <th className="p-3.5 text-right">Cost (Avg)</th>
                <th className="p-3.5 text-right">Sale Price</th>
                <th className="p-3.5 text-center">Margin %</th>
                <th className="p-3.5 text-center">Stock Level</th>
                <th className="p-3.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-stone-400">
                    No products found matching your filter criteria.
                  </td>
                </tr>
              ) : (
                paginatedProducts.map((p) => {
                  const marginPct = p.sale_price > 0 && p.cost_price > 0
                    ? Math.round(((p.sale_price - p.cost_price) / p.sale_price) * 100)
                    : 0;
                  const isLowStock = p.stock_qty <= p.min_stock_alert && p.stock_qty > 0;
                  const isOutOfStock = p.stock_qty <= 0;

                  return (
                    <tr key={p.id} className="hover:bg-stone-50/80 transition-colors">
                      <td className="p-3.5 font-mono text-stone-700">
                        <span className="font-bold text-stone-900 block">{p.barcode || 'NO BARCODE'}</span>
                        <span className="text-[10px] text-stone-400">{p.sku}</span>
                      </td>

                      <td className="p-3.5 font-bold text-stone-900">
                        {p.name}
                        {Boolean(p.is_weighable) && (
                          <span className="ml-1.5 px-1.5 py-0.5 bg-blue-100 text-blue-800 text-[9px] rounded font-mono">
                            SCALE
                          </span>
                        )}
                        {Boolean(p.is_loose) && (
                          <span className="ml-1.5 px-1.5 py-0.5 bg-amber-100 text-amber-900 text-[9px] rounded font-mono font-bold" title={`Loose Commodity: 1 ${p.base_unit || 'Base'} = ${p.unit_conversion_ratio || 1} ${p.sale_unit || 'Units'}`}>
                            LOOSE (1:{p.unit_conversion_ratio || 1})
                          </span>
                        )}
                      </td>

                      <td className="p-3.5 text-stone-600">
                        {p.category}
                      </td>

                      <td className="p-3.5 text-right font-mono text-stone-700">
                        Rs. {p.cost_price.toLocaleString()}
                      </td>

                      <td className="p-3.5 text-right font-mono font-bold text-[#5B7981]">
                        <div>Rs. {p.sale_price.toLocaleString()}{Boolean(p.is_loose) && <span className="text-[10px] text-stone-400 font-normal"> /{p.base_unit || p.unit_type}</span>}</div>
                        {Boolean(p.is_loose) && Boolean(p.subunit_sale_price) && (
                          <div className="text-[10px] text-emerald-700 font-black">
                            Rs. {p.subunit_sale_price?.toLocaleString()} /{p.sale_unit || 'unit'}
                          </div>
                        )}
                      </td>

                      <td className="p-3.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          marginPct >= 15 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {marginPct}%
                        </span>
                      </td>

                      <td className="p-3.5 text-center font-mono">
                        <span className={`font-bold ${isOutOfStock ? 'text-red-700' : isLowStock ? 'text-amber-600' : 'text-stone-800'}`}>
                          {p.is_weighable ? p.stock_qty.toFixed(2) : p.stock_qty} {p.base_unit || p.unit_type}
                        </span>
                        {Boolean(p.is_loose) && p.unit_conversion_ratio && p.unit_conversion_ratio > 1 ? (
                          <span className="text-[9px] block text-stone-500 font-sans">
                            ≈ {Math.round(p.stock_qty * p.unit_conversion_ratio)} {p.sale_unit || 'units'}
                          </span>
                        ) : null}
                        {Boolean(p.whole_bags_stock && p.whole_bags_stock > 0) && (
                          <div className="mt-1 flex items-center justify-center gap-1">
                            <span className="text-[10px] text-[#5B7981] font-bold">
                              {p.whole_bags_stock} Bags ({p.bag_weight_kg || 50}kg)
                            </span>
                            <button
                              type="button"
                              onClick={() => handleOpenWholeBag(p)}
                              className="px-1.5 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded text-[9px] font-bold cursor-pointer transition-colors"
                              title="Open 1 Whole Bag (+50kg into loose stock)"
                            >
                              Open Bag
                            </button>
                          </div>
                        )}
                        {isOutOfStock && <span className="text-[9px] block text-red-600 font-bold font-sans">Out of Stock</span>}
                        {isLowStock && <span className="text-[9px] block text-amber-600 font-bold font-sans">Low Alert</span>}
                      </td>

                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* QUICK RESTOCK BUTTON WITH BLENDED MEAN */}
                          <button
                            onClick={() => handleOpenRestock(p)}
                            className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-[11px] font-bold cursor-pointer flex items-center gap-0.5"
                            title="Restock with Weighted Mean Cost"
                          >
                            <Plus className="w-3 h-3" /> Restock
                          </button>

                          {/* BARCODE STICKER / SLIP PRINT */}
                          <button
                            onClick={() => setBarcodePrintProduct(p)}
                            className="p-1.5 text-stone-500 hover:text-stone-900 rounded-lg hover:bg-stone-100 cursor-pointer"
                            title="Print Barcode Sticker / Label (XP-365B &amp; Sheets)"
                          >
                            <Barcode className="w-4 h-4 text-[#5B7981]" />
                          </button>

                          <button
                            onClick={() => handleOpenEdit(p)}
                            className="p-1.5 text-stone-500 hover:text-stone-900 rounded-lg hover:bg-stone-100 cursor-pointer"
                            title="Edit Details"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleDeleteProduct(p.id, p.name)}
                            className="p-1.5 text-stone-400 hover:text-red-600 rounded-lg hover:bg-red-50 cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION CONTROL BAR */}
        {filteredProducts.length > pageSize && (
          <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-3.5 border-t border-stone-200 bg-stone-50 gap-3">
            <span className="text-xs text-stone-600 font-medium">
              Showing <span className="font-bold text-stone-900">{(currentPage - 1) * pageSize + 1}</span> to{' '}
              <span className="font-bold text-stone-900">{Math.min(currentPage * pageSize, filteredProducts.length)}</span> of{' '}
              <span className="font-bold text-stone-900">{filteredProducts.length}</span> products
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(1)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-stone-300 bg-white hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs"
              >
                First
              </button>
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-stone-300 bg-white hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs"
              >
                Prev
              </button>
              <span className="px-3 py-1 text-xs font-bold text-stone-700 bg-stone-200 rounded-lg">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-stone-300 bg-white hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs"
              >
                Next
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(totalPages)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-stone-300 bg-white hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs"
              >
                Last
              </button>
            </div>
          </div>
        )}
      </div>

      {/* QUICK RESTOCK MODAL WITH WEIGHTED MEAN */}
      {restockProduct && (
        <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-stone-300 rounded-3xl max-w-md w-full shadow-2xl p-6 space-y-4 font-sans">
            <div className="flex justify-between items-center border-b border-stone-200 pb-3">
              <div>
                <h3 className="font-bold text-sm text-stone-900">RESTOCK ITEM (WEIGHTED MEAN COST)</h3>
                <span className="text-[11px] text-stone-500 block">{restockProduct.name}</span>
              </div>
              <button onClick={() => setRestockProduct(null)} className="text-stone-400 hover:text-stone-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmRestock} className="space-y-4">
              <div className="p-3 bg-stone-100 rounded-2xl flex justify-between items-center text-xs">
                <span>Current Stock: <strong>{restockProduct.stock_qty} {restockProduct.unit_type}</strong></span>
                <span>Current Avg Cost: <strong>Rs. {restockProduct.cost_price}</strong></span>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Received Restock Quantity</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={restockQty}
                  onChange={(e) => setRestockQty(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-mono font-bold outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">New Supplier Unit Cost (Rs.)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={restockCost}
                  onChange={(e) => setRestockCost(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-mono font-bold outline-hidden"
                  required
                />
              </div>

              {/* LIVE BLENDED COST PREVIEW */}
              {(() => {
                const oldTotal = Math.max(0, restockProduct.stock_qty) * restockProduct.cost_price;
                const newTotal = restockQty * restockCost;
                const combinedQty = Math.max(0, restockProduct.stock_qty) + restockQty;
                const projectedCost = combinedQty > 0 ? (oldTotal + newTotal) / combinedQty : restockCost;
                return (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-1">
                    <div className="flex justify-between font-bold text-emerald-900">
                      <span>Projected Blended Moving Cost:</span>
                      <span className="font-mono text-sm">Rs. {Math.round(projectedCost * 100) / 100}</span>
                    </div>
                    <span className="text-[10px] text-emerald-700 block">
                      New Total Stock will be {combinedQty} {restockProduct.unit_type}
                    </span>
                  </div>
                );
              })()}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRestockProduct(null)}
                  className="px-4 py-2 bg-stone-200 text-stone-800 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#5B7981] hover:bg-[#486269] text-white rounded-xl text-xs font-bold shadow-md"
                >
                  Confirm Restock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRODUCT EDIT MODAL */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-stone-300 rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-sans my-auto">
            <div className="bg-[#243338] text-white px-6 py-4 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-sm tracking-wide">
                {editingProduct ? 'EDIT PRODUCT ATTRIBUTES' : 'ADD NEW CATALOG PRODUCT'}
              </h3>
              <button onClick={() => setIsProductModalOpen(false)} className="text-stone-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="p-6 space-y-4 flex-1 overflow-y-auto">
              
              {/* LAST SAVED SUCCESS NOTICE (M8.1) */}
              {lastSavedMessage && (
                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-center justify-between text-xs font-bold text-emerald-950">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{lastSavedMessage}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLastSavedMessage('')}
                    className="text-stone-400 hover:text-stone-600 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* DUPLICATE BARCODE GUARD BANNER (M8.3) */}
              {duplicateFound && (
                <div className="p-3 bg-red-50 border border-red-300 rounded-2xl flex items-center justify-between text-xs text-red-950">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    <div>
                      <span className="font-bold block">Duplicate Barcode Alert!</span>
                      <span className="text-[11px] text-red-800">
                        Barcode "{formData.barcode}" is already registered to <strong>{duplicateFound.name}</strong> (Rs. {duplicateFound.sale_price.toLocaleString()}).
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(duplicateFound)}
                    className="px-3 py-1 bg-red-700 hover:bg-red-800 text-white rounded-xl font-bold text-xs cursor-pointer shrink-0 shadow-xs"
                  >
                    Jump to Edit
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-stone-700 flex items-center gap-1">
                      <Barcode className="w-3.5 h-3.5 text-stone-500" />
                      <span>1. Scan Barcode</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const code = catalogService.generateEan13Barcode();
                        setFormData({ ...formData, barcode: code });
                        setDuplicateFound(null);
                        hardwareService.playScanSuccess();
                        nameInputRef.current?.focus();
                      }}
                      className="text-[10px] text-[#5B7981] hover:underline font-bold cursor-pointer"
                    >
                      Auto EAN-13
                    </button>
                  </div>
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    value={formData.barcode}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormData({ ...formData, barcode: val });
                      if (val.trim()) {
                        const dup = products.find(p => p.id !== editingProduct?.id && (p.barcode?.toLowerCase() === val.trim().toLowerCase() || p.sku?.toLowerCase() === val.trim().toLowerCase()));
                        setDuplicateFound(dup || null);
                      } else {
                        setDuplicateFound(null);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (formData.barcode?.trim()) {
                          hardwareService.playScanSuccess();
                          nameInputRef.current?.focus();
                        }
                      }
                    }}
                    placeholder="Scan barcode with scanner..."
                    className={`w-full px-3 py-2 bg-stone-50 border-2 rounded-xl text-xs font-mono font-bold outline-hidden ${
                      duplicateFound ? 'border-red-500 bg-red-50/50' : 'border-stone-300 focus:border-[#5B7981]'
                    }`}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-800 outline-hidden"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">2. Product Title / Description</label>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (formData.name.trim()) {
                        salePriceInputRef.current?.focus();
                      }
                    }
                  }}
                  placeholder="e.g. Olpers Milk 1 Litre (Press Enter to advance)"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 focus:border-[#5B7981] rounded-xl text-xs font-bold outline-hidden"
                  required
                />
              </div>

              {/* BIDIRECTIONAL PRICING CALCULATOR (M8.2) */}
              <div className="grid grid-cols-3 gap-3 p-3 bg-stone-50 border border-stone-200 rounded-2xl">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Cost Price (Rs.)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={formData.cost_price || ''}
                    onChange={(e) => {
                      const newCost = Number(e.target.value) || 0;
                      let newSale = formData.sale_price;
                      if (marginPercent !== '' && Number(marginPercent) > 0) {
                        newSale = Math.round(newCost * (1 + Number(marginPercent) / 100));
                      }
                      setFormData(prev => ({ ...prev, cost_price: newCost, sale_price: newSale }));
                    }}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs font-mono font-bold outline-hidden focus:border-[#5B7981]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Margin % (منافع)</label>
                  <input
                    type="number"
                    step="any"
                    value={marginPercent}
                    onChange={(e) => {
                      const m = e.target.value === '' ? '' : Number(e.target.value);
                      setMarginPercent(m);
                      if (m !== '' && formData.cost_price > 0) {
                        const calculatedSale = Math.round(formData.cost_price * (1 + Number(m) / 100));
                        setFormData(prev => ({ ...prev, sale_price: calculatedSale }));
                      }
                    }}
                    placeholder="e.g. 20"
                    className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs font-mono font-bold outline-hidden text-[#5B7981] focus:border-[#5B7981]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-emerald-800 mb-1">3. Retail Sale Price (Rs.)</label>
                  <input
                    ref={salePriceInputRef}
                    type="number"
                    min="0.1"
                    step="any"
                    value={formData.sale_price || ''}
                    onChange={(e) => {
                      const newSale = Number(e.target.value) || 0;
                      setFormData(prev => ({ ...prev, sale_price: newSale }));
                      if (formData.cost_price > 0) {
                        setMarginPercent(Math.round(((newSale - formData.cost_price) / formData.cost_price) * 100));
                      }
                    }}
                    className="w-full px-3 py-2 bg-white border-2 border-emerald-500 rounded-xl text-xs font-mono font-black outline-hidden text-emerald-900"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Stock Quantity</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.stock_qty}
                    onChange={(e) => setFormData({ ...formData, stock_qty: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-mono font-bold outline-hidden"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Unit Type</label>
                  <select
                    value={formData.unit_type}
                    onChange={(e) => setFormData({ ...formData, unit_type: e.target.value as UnitType })}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold outline-hidden"
                  >
                    <option value="piece">Piece / Pcs</option>
                    <option value="kg">Kilogram (kg)</option>
                    <option value="pack">Pack / Packet</option>
                    <option value="liter">Liter (Ltr)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Min Alert Qty</label>
                  <input
                    type="number"
                    value={formData.min_stock_alert}
                    onChange={(e) => setFormData({ ...formData, min_stock_alert: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-mono font-bold outline-hidden"
                  />
                </div>
              </div>

              {/* DUAL-UNIT &amp; LOOSE COMMODITY PANEL */}
              <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(formData.is_loose)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFormData({
                          ...formData,
                          is_loose: checked,
                          category: checked && formData.category === 'General' ? 'Loose & Bulk Grocery' : formData.category
                        });
                      }}
                      className="w-4 h-4 text-[#5B7981] rounded border-stone-300 focus:ring-0 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-black text-amber-950 block">Loose Commodity / Dual-Unit Conversion</span>
                      <span className="text-[10px] text-amber-800">
                        For bulk goods sold in subunits (e.g. Eggs in pieces vs tray, Flour/Rice in kg vs 50kg bag, Oil in litres vs tin)
                      </span>
                    </div>
                  </label>
                  {formData.is_loose && (
                    <span className="px-2 py-0.5 bg-amber-200 text-amber-900 text-[10px] font-black rounded-md">
                      DUAL-UNIT ACTIVE
                    </span>
                  )}
                </div>

                {formData.is_loose && (
                  <div className="space-y-3 pt-2 border-t border-amber-200/80">
                    {/* QUICK PRESETS */}
                    <div>
                      <span className="text-[10px] font-bold text-amber-900 block mb-1.5 uppercase tracking-wide">
                        Quick Built-in Presets:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {LOOSE_PRESETS.map((pst, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              const subPrice = formData.sale_price > 0 
                                ? Math.round((formData.sale_price / pst.ratio) * 100) / 100
                                : formData.subunit_sale_price;
                              setFormData({
                                ...formData,
                                is_loose: true,
                                base_unit: pst.base_unit,
                                sale_unit: pst.sale_unit,
                                unit_conversion_ratio: pst.ratio,
                                unit_type: pst.unit_type,
                                subunit_sale_price: subPrice
                              });
                            }}
                            className="px-2 py-1 bg-white hover:bg-amber-100 border border-amber-300 rounded-lg text-[10px] font-bold text-amber-950 flex items-center gap-1 shadow-xs cursor-pointer transition-colors"
                          >
                            <span>{pst.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-stone-700 mb-1">
                          Base Inventory Unit (Wholesale / Bulk)
                        </label>
                        <input
                          type="text"
                          value={formData.base_unit || ''}
                          onChange={(e) => setFormData({ ...formData, base_unit: e.target.value })}
                          placeholder="e.g. Tray (30 eggs), Bag (50 kg), Cane (16 L)"
                          className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-xl text-xs font-bold outline-hidden"
                          required={Boolean(formData.is_loose)}
                        />
                        <span className="text-[9px] text-stone-500 block mt-0.5">Stock qty is counted in this unit.</span>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-stone-700 mb-1">
                          Retail Sale Subunit (Customer Buys)
                        </label>
                        <input
                          type="text"
                          value={formData.sale_unit || ''}
                          onChange={(e) => setFormData({ ...formData, sale_unit: e.target.value })}
                          placeholder="e.g. Egg (Piece), kg, Gram, Litre, mL"
                          className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-xl text-xs font-bold outline-hidden"
                          required={Boolean(formData.is_loose)}
                        />
                        <span className="text-[9px] text-stone-500 block mt-0.5">Sold at POS register in this unit.</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-stone-700 mb-1">
                          Subunits per Base Unit (Conversion Ratio)
                        </label>
                        <input
                          type="number"
                          min="0.001"
                          step="any"
                          value={formData.unit_conversion_ratio || ''}
                          onChange={(e) => {
                            const ratio = Number(e.target.value) || 1;
                            const subPrice = formData.sale_price > 0 ? Math.round((formData.sale_price / ratio) * 100) / 100 : formData.subunit_sale_price;
                            setFormData({ 
                              ...formData, 
                              unit_conversion_ratio: ratio,
                              subunit_sale_price: subPrice
                            });
                          }}
                          placeholder="e.g. 30, 50, 16, 1000"
                          className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-xl text-xs font-mono font-bold outline-hidden"
                          required={Boolean(formData.is_loose)}
                        />
                        <span className="text-[9px] text-stone-500 block mt-0.5">
                          How many subunits make 1 base unit? (e.g. 30 eggs = 1 tray)
                        </span>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-emerald-800 mb-1">
                          Retail Subunit Sale Price (Rs.)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={formData.subunit_sale_price || ''}
                          onChange={(e) => {
                            const subPrice = Number(e.target.value) || 0;
                            const ratio = formData.unit_conversion_ratio || 1;
                            const basePrice = Math.round(subPrice * ratio * 100) / 100;
                            setFormData({
                              ...formData,
                              subunit_sale_price: subPrice,
                              sale_price: basePrice > 0 ? basePrice : formData.sale_price
                            });
                          }}
                          placeholder="e.g. 18"
                          className="w-full px-2.5 py-1.5 bg-white border-2 border-emerald-500 rounded-xl text-xs font-mono font-black text-emerald-950 outline-hidden"
                          required={Boolean(formData.is_loose)}
                        />
                        <span className="text-[9px] text-emerald-700 block mt-0.5">
                          Price per loose subunit (Auto-calculates base price).
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1 border-t border-amber-200/60">
                      <div>
                        <label className="block text-[11px] font-bold text-stone-700 mb-1">
                          Whole Bags in Stock (Bori / Cartons)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={formData.whole_bags_stock || 0}
                          onChange={(e) => setFormData({ ...formData, whole_bags_stock: Number(e.target.value) || 0 })}
                          placeholder="e.g. 5"
                          className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-xl text-xs font-mono font-bold outline-hidden"
                        />
                        <span className="text-[9px] text-stone-500 block mt-0.5">Unopened wholesale bags in stockroom.</span>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-stone-700 mb-1">
                          Weight of 1 Whole Bag (kg)
                        </label>
                        <input
                          type="number"
                          min="0.1"
                          step="any"
                          value={formData.bag_weight_kg || 50}
                          onChange={(e) => setFormData({ ...formData, bag_weight_kg: Number(e.target.value) || 50 })}
                          placeholder="e.g. 50"
                          className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-xl text-xs font-mono font-bold outline-hidden"
                        />
                        <span className="text-[9px] text-stone-500 block mt-0.5">kg added to loose stock on bag opening.</span>
                      </div>
                    </div>

                    {formData.unit_conversion_ratio && formData.unit_conversion_ratio > 0 ? (
                      <div className="p-2 bg-white/80 rounded-xl border border-amber-200 text-[10px] text-amber-900 flex items-center justify-between font-mono">
                        <span>
                          1 {formData.base_unit || 'Base Unit'} = {formData.unit_conversion_ratio} {formData.sale_unit || 'Subunits'}
                        </span>
                        <span>
                          {formData.subunit_sale_price ? `@ Rs. ${formData.subunit_sale_price} / ${formData.sale_unit || 'item'}` : ''}
                        </span>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {/* MULTI-BARCODE MANAGEMENT SECTION (M3.1) */}
              {editingProduct && (
                <div className="p-3.5 bg-stone-100 rounded-2xl border border-stone-300 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-stone-800 flex items-center gap-1.5">
                      <Barcode className="w-3.5 h-3.5 text-[#5B7981]" />
                      <span>Alternate Barcodes (M3.1)</span>
                    </span>
                    <span className="text-[10px] text-stone-500 font-mono">
                      {altBarcodes.length} Registered
                    </span>
                  </div>

                  {altBarcodes.length > 0 && (
                    <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                      {altBarcodes.map(b => (
                        <div key={b.id} className="flex items-center justify-between px-2.5 py-1 bg-white border border-stone-200 rounded-xl text-xs font-mono">
                          <div>
                            <span className="font-bold text-stone-800">{b.barcode}</span>
                            {b.notes && <span className="text-stone-500 ml-2 text-[10px]">({b.notes})</span>}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteAltBarcode(b.id)}
                            className="text-stone-400 hover:text-red-600 cursor-pointer p-0.5"
                            title="Delete Alternate Barcode"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newAltBarcode}
                      onChange={(e) => setNewAltBarcode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddAltBarcode();
                        }
                      }}
                      placeholder="Scan/type alternate barcode..."
                      className="flex-1 px-2.5 py-1.5 bg-white border border-stone-300 rounded-xl text-xs font-mono font-bold outline-hidden"
                    />
                    <input
                      type="text"
                      value={newAltNotes}
                      onChange={(e) => setNewAltNotes(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddAltBarcode();
                        }
                      }}
                      placeholder="Notes (optional)..."
                      className="w-32 px-2.5 py-1.5 bg-white border border-stone-300 rounded-xl text-xs outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={handleAddAltBarcode}
                      className="px-3 py-1.5 bg-[#5B7981] hover:bg-[#486269] text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}

              </div>

              {/* STICKY DOCKED FOOTER: ALWAYS VISIBLE AND CLICKABLE */}
              <div className="px-6 py-3.5 bg-stone-50 border-t border-stone-200 flex items-center justify-between shrink-0">
                {!editingProduct ? (
                  <label className="flex items-center gap-2 text-xs font-bold text-stone-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rapidContinuousMode}
                      onChange={(e) => setRapidContinuousMode(e.target.checked)}
                      className="w-4 h-4 text-[#5B7981] rounded border-stone-300 focus:ring-0"
                    />
                    <span className="text-[11px]">Rapid Continuous Mode (Keep open for next barcode)</span>
                  </label>
                ) : <div />}

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsProductModalOpen(false)}
                    className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-[#5B7981] hover:bg-[#486269] text-white rounded-xl text-xs font-black shadow-md cursor-pointer flex items-center gap-1.5 transition-all"
                  >
                    <Check className="w-4 h-4" />
                    <span>{editingProduct ? 'Save Changes' : (rapidContinuousMode ? 'Save &amp; Add Next [Enter]' : 'Save Product [Enter]')}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CATEGORY TAX MODAL */}
      {isTaxModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-stone-300 rounded-3xl max-w-lg w-full shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-stone-200 pb-3">
              <div>
                <h3 className="font-bold text-sm text-stone-900">CATEGORY-WISE TAX RULES</h3>
                <p className="text-[11px] text-stone-500">Enable or disable sales tax per department</p>
              </div>
              <button onClick={() => setIsTaxModalOpen(false)} className="text-stone-400 hover:text-stone-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-stone-100">
              {categories.map(cat => (
                <div key={cat.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-xs text-stone-900 block">{cat.name}</span>
                    <span className="text-[10px] text-stone-500">
                      {cat.is_taxable ? `Tax Active (${cat.tax_rate_percent}%)` : 'Tax Exempt (0%)'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cat.is_taxable}
                        onChange={async () => {
                          await catalogService.toggleCategoryTax(cat.id, !cat.is_taxable, cat.tax_rate_percent);
                          const updated = await catalogService.getCategories();
                          setCategories(updated);
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-stone-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#5B7981]"></div>
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 text-right">
              <button
                onClick={() => setIsTaxModalOpen(false)}
                className="px-5 py-2 bg-[#5B7981] text-white rounded-xl text-xs font-bold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIGURABLE BARCODE STICKER MODAL (M10.4) */}
      {barcodePrintProduct && (
        <BarcodeStickerModal
          isOpen={Boolean(barcodePrintProduct)}
          onClose={() => setBarcodePrintProduct(null)}
          product={barcodePrintProduct}
          storeSettings={storeSettings || {
            store_name: 'Point of Sale',
            tagline: 'Point of Sale &amp; Inventory',
            address: 'Shop # 1, Main Market, Pakistan',
            phone: '+92 300 0000000',
            whatsapp_number: '+923000000000',
            currency_symbol: 'Rs.',
            receipt_footer_urdu: 'ہمارے ہاں آمد کا شکریہ - جزاک اللہ خیر',
            receipt_footer_english: 'Exchange/Return accepted within 7 days with original receipt.',
            cash_rounding_nearest: 5,
            admin_pin: '8888'
          }}
        />
      )}

      {/* SIMPLE LOOSE ITEM WIZARD MODAL */}
      <SimpleLooseItemWizardModal
        isOpen={isLooseWizardOpen}
        onClose={() => setIsLooseWizardOpen(false)}
        onSuccess={loadData}
      />

    </div>
  );
};
