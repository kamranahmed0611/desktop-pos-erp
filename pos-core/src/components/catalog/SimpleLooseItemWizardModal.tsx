import React, { useState } from 'react';
import { catalogService } from '../../services/catalogService';
import { hardwareService } from '../../services/hardwareService';
import { posAlert } from '../../store/uiStore';
import { 
  X, Scale, Check, ArrowRight, ArrowLeft, Sparkles, 
  Wheat, Egg, Droplet, ShoppingBag, Coffee, ChevronRight, QrCode
} from 'lucide-react';

interface SimpleLooseItemWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface CommodityTemplate {
  id: string;
  label: string;
  urdu: string;
  icon: any;
  defaultName: string;
  baseUnit: string;
  saleUnit: string;
  defaultRatio: number;
  unitType: 'kg' | 'piece' | 'liter';
  suggestedSalePrice: number;
  suggestedCostPrice: number;
}

const TEMPLATES: CommodityTemplate[] = [
  {
    id: 'sugar',
    label: 'Sugar / Cheeni',
    urdu: 'چینی (50 کلو بوری)',
    icon: ShoppingBag,
    defaultName: 'Refined White Sugar (Cheeni)',
    baseUnit: 'Bag (50kg)',
    saleUnit: 'kg',
    defaultRatio: 50,
    unitType: 'kg',
    suggestedSalePrice: 155,
    suggestedCostPrice: 7200
  },
  {
    id: 'flour',
    label: 'Flour / Atta',
    urdu: 'آٹا (20 کلو / 50 کلو بوری)',
    icon: Wheat,
    defaultName: 'Chakki Whole Wheat Atta',
    baseUnit: 'Bag (20kg)',
    saleUnit: 'kg',
    defaultRatio: 20,
    unitType: 'kg',
    suggestedSalePrice: 135,
    suggestedCostPrice: 2450
  },
  {
    id: 'rice',
    label: 'Rice / Chawal',
    urdu: 'چاول (باسمتی / سیلا بوری)',
    icon: Wheat,
    defaultName: 'Super Basmati Rice (Chawal)',
    baseUnit: 'Bag (25kg)',
    saleUnit: 'kg',
    defaultRatio: 25,
    unitType: 'kg',
    suggestedSalePrice: 340,
    suggestedCostPrice: 7600
  },
  {
    id: 'oil',
    label: 'Cooking Oil / Ghee',
    urdu: 'کوکنگ آئل / گھی (16 لیٹر ٹن)',
    icon: Droplet,
    defaultName: 'Pure Cooking Oil (Loose)',
    baseUnit: 'Tin (16 Litres)',
    saleUnit: 'Litre',
    defaultRatio: 16,
    unitType: 'liter',
    suggestedSalePrice: 480,
    suggestedCostPrice: 7100
  },
  {
    id: 'eggs',
    label: 'Eggs / Anday',
    urdu: 'انڈے (30 انڈوں والی ٹرے)',
    icon: Egg,
    defaultName: 'Fresh Farm Eggs (Anday)',
    baseUnit: 'Tray (30 Eggs)',
    saleUnit: 'Egg',
    defaultRatio: 30,
    unitType: 'piece',
    suggestedSalePrice: 28,
    suggestedCostPrice: 720
  },
  {
    id: 'pulses',
    label: 'Dal / Pulses &amp; Spices',
    urdu: 'دالیں اور مصالحہ جات',
    icon: Coffee,
    defaultName: 'Daal Chana (Special)',
    baseUnit: 'Bag (50kg)',
    saleUnit: 'kg',
    defaultRatio: 50,
    unitType: 'kg',
    suggestedSalePrice: 260,
    suggestedCostPrice: 11500
  },
  {
    id: 'custom',
    label: 'Custom Commodity',
    urdu: 'کوئی اور کھلی جنس',
    icon: Scale,
    defaultName: 'New Loose Item',
    baseUnit: 'Bulk Pack',
    saleUnit: 'kg',
    defaultRatio: 1,
    unitType: 'kg',
    suggestedSalePrice: 100,
    suggestedCostPrice: 90
  }
];

export const SimpleLooseItemWizardModal: React.FC<SimpleLooseItemWizardModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('sugar');

  // Step 1: Basic Info
  const [itemName, setItemName] = useState('Refined White Sugar (Cheeni)');
  const [barcode, setBarcode] = useState(() => '99' + Math.floor(1000 + Math.random() * 9000));
  const [baseUnit, setBaseUnit] = useState('Bag (50kg)');
  const [saleUnit, setSaleUnit] = useState('kg');
  const [unitType, setUnitType] = useState<'kg' | 'piece' | 'liter'>('kg');

  // Step 2: Pricing &amp; Stock
  const [retailSalePrice, setRetailSalePrice] = useState<number>(155);
  const [bulkCostPrice, setBulkCostPrice] = useState<number>(7200);
  const [initialStockBulk, setInitialStockBulk] = useState<number>(5);

  // Step 3: Dual-Unit Conversion
  const [enableDualUnit, setEnableDualUnit] = useState(true);
  const [conversionRatio, setConversionRatio] = useState<number>(50);

  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSelectTemplate = (t: CommodityTemplate) => {
    setSelectedTemplateId(t.id);
    setItemName(t.defaultName);
    setBaseUnit(t.baseUnit);
    setSaleUnit(t.saleUnit);
    setUnitType(t.unitType);
    setConversionRatio(t.defaultRatio);
    setRetailSalePrice(t.suggestedSalePrice);
    setBulkCostPrice(t.suggestedCostPrice);
    setEnableDualUnit(t.defaultRatio > 1);
  };

  const generateNewBarcode = () => {
    setBarcode('99' + Math.floor(1000 + Math.random() * 9000));
    hardwareService.playNoticeTone();
  };

  // Calculations for Step 3
  const totalSubunitsInBulk = conversionRatio;
  const totalRetailValueOfBulk = Math.round(retailSalePrice * totalSubunitsInBulk);
  const estimatedProfitPerBulk = Math.round(totalRetailValueOfBulk - bulkCostPrice);
  const profitMarginPercent = bulkCostPrice > 0 
    ? Math.round((estimatedProfitPerBulk / bulkCostPrice) * 1000) / 10 
    : 0;
  const costPerSaleUnit = totalSubunitsInBulk > 0 
    ? Math.round((bulkCostPrice / totalSubunitsInBulk) * 10) / 10 
    : 0;

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!itemName.trim()) {
      await posAlert('Name Required', 'Please enter a valid commodity name.', 'error');
      setStep(1);
      return;
    }

    if (retailSalePrice <= 0) {
      await posAlert('Price Required', 'Please enter a retail sale price greater than 0.', 'error');
      setStep(2);
      return;
    }

    setIsSubmitting(true);
    try {
      const finalRatio = enableDualUnit ? Math.max(1, conversionRatio) : 1;
      const bulkSalePrice = enableDualUnit ? Math.round(retailSalePrice * finalRatio) : retailSalePrice;
      const initialStock = Math.max(0, initialStockBulk);

      await catalogService.createProduct({
        name: itemName.trim(),
        barcode: barcode.trim(),
        sku: barcode.trim(),
        category: 'Loose &amp; Bulk Grocery',
        cost_price: bulkCostPrice,
        sale_price: bulkSalePrice,
        subunit_sale_price: retailSalePrice,
        stock_qty: initialStock,
        min_stock_alert: 2,
        is_loose: true,
        is_weighable: unitType !== 'piece',
        unit_type: unitType,
        base_unit: enableDualUnit ? baseUnit : saleUnit,
        sale_unit: saleUnit,
        unit_conversion_ratio: finalRatio
      });

      hardwareService.playCheckoutChime();
      await posAlert(
        'Loose Item Created Successfully',
        `"${itemName}" is now available in your catalog and cashier Loose Terminal [F9]!\n\n` +
        `• Sold to customers at Rs. ${retailSalePrice}/${saleUnit}\n` +
        `• Tracked in wholesale inventory as ${baseUnit} (1:${finalRatio})\n` +
        `• Barcode / QR: ${barcode}`,
        'success'
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      hardwareService.playError();
      await posAlert('Error Creating Item', err.message || 'Database error occurred.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-3 font-sans select-none">
      <div className="bg-white border border-stone-300 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* HEADER */}
        <div className="bg-[#243338] text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-[#5B7981] text-[#E3D5C0] p-2 rounded-xl">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm tracking-wide">SIMPLE LOOSE COMMODITY WIZARD</h3>
              <p className="text-[11px] text-[#E3D5C0]">Create Sugar, Atta, Rice, Eggs, Oil &amp; Pulses in 3 easy steps</p>
            </div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-white cursor-pointer p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STEPPER PROGRESS BAR */}
        <div className="bg-stone-100 border-b border-stone-200 px-6 py-3 flex items-center justify-between text-xs font-bold">
          <div className={`flex items-center gap-2 ${step >= 1 ? 'text-[#5B7981]' : 'text-stone-400'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
              step === 1 ? 'bg-[#5B7981] text-white shadow-xs' : (step > 1 ? 'bg-emerald-600 text-white' : 'bg-stone-300 text-stone-700')
            }`}>
              {step > 1 ? '✓' : '1'}
            </span>
            <span>Commodity Template</span>
          </div>

          <ChevronRight className="w-4 h-4 text-stone-400" />

          <div className={`flex items-center gap-2 ${step >= 2 ? 'text-[#5B7981]' : 'text-stone-400'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
              step === 2 ? 'bg-[#5B7981] text-white shadow-xs' : (step > 2 ? 'bg-emerald-600 text-white' : 'bg-stone-300 text-stone-700')
            }`}>
              {step > 2 ? '✓' : '2'}
            </span>
            <span>Pricing &amp; Stock</span>
          </div>

          <ChevronRight className="w-4 h-4 text-stone-400" />

          <div className={`flex items-center gap-2 ${step >= 3 ? 'text-[#5B7981]' : 'text-stone-400'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
              step === 3 ? 'bg-[#5B7981] text-white shadow-xs' : 'bg-stone-300 text-stone-700'
            }`}>
              3
            </span>
            <span>Dual-Unit Magic</span>
          </div>
        </div>

        {/* BODY CONTENT BY STEP */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* STEP 1: COMMODITY TEMPLATE &amp; BASIC INFO */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-2 uppercase tracking-wide">
                  Step 1: Choose Commodity Preset (Built-in Templates):
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {TEMPLATES.map(t => {
                    const Icon = t.icon;
                    const isSelected = selectedTemplateId === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleSelectTemplate(t)}
                        className={`p-3 rounded-2xl border text-left cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-amber-50 border-amber-600 ring-2 ring-amber-500/30 shadow-xs'
                            : 'bg-white hover:bg-stone-50 border-stone-200'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <Icon className={`w-5 h-5 ${isSelected ? 'text-amber-700' : 'text-stone-600'}`} />
                          {isSelected && <span className="text-[10px] bg-amber-600 text-white px-1.5 py-0.2 rounded font-bold">SELECTED</span>}
                        </div>
                        <div className="font-bold text-xs text-stone-900">{t.label}</div>
                        <div className="text-[10px] text-stone-500 font-serif leading-tight">{t.urdu}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* COMMODITY DETAILS FORM */}
              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-stone-800 mb-1">
                    Commodity Display Name *
                  </label>
                  <input
                    type="text"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder="e.g. Super Basmati Rice (Chawal)"
                    className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs font-bold outline-hidden focus:border-[#5B7981]"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center justify-between">
                      <span>Internal Barcode / QR *</span>
                      <button
                        type="button"
                        onClick={generateNewBarcode}
                        className="text-[10px] text-[#5B7981] hover:underline flex items-center gap-1 font-bold cursor-pointer"
                      >
                        <QrCode className="w-3 h-3" /> Re-roll
                      </button>
                    </label>
                    <input
                      type="text"
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs font-mono font-bold outline-hidden"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      Measurement Type
                    </label>
                    <select
                      value={unitType}
                      onChange={(e) => setUnitType(e.target.value as any)}
                      className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs font-bold outline-hidden"
                    >
                      <option value="kg">Weighed (Kg / Grams)</option>
                      <option value="piece">Counted (Eggs / Pieces)</option>
                      <option value="liter">Liquid (Litres / mL)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: PRICING &amp; STOCK */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-emerald-950 block">Retail Sale Rate</span>
                  <span className="text-[11px] text-emerald-800">
                    What the customer pays at the cashier terminal per {saleUnit}.
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-emerald-700 font-bold block uppercase">Retail Price</span>
                  <span className="text-xl font-black font-mono text-emerald-900">
                    Rs. {retailSalePrice.toLocaleString()} / {saleUnit}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
                  <label className="block text-xs font-bold text-stone-800">
                    Customer Retail Price (Rs. per {saleUnit}) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={retailSalePrice}
                    onChange={(e) => setRetailSalePrice(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-4 py-3 bg-white border-2 border-emerald-600 rounded-xl text-2xl font-mono font-black text-stone-900 text-center outline-hidden shadow-2xs"
                    autoFocus
                  />
                  <span className="text-[10px] text-stone-500 block text-center">
                    Cashier can bill any fractional weight (e.g. 250g = Rs. {Math.round(retailSalePrice * 0.25)})
                  </span>
                </div>

                <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
                  <label className="block text-xs font-bold text-stone-800">
                    Wholesale Purchase Cost (Rs. per {baseUnit})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={bulkCostPrice}
                    onChange={(e) => setBulkCostPrice(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-4 py-3 bg-white border border-stone-300 rounded-xl text-2xl font-mono font-black text-stone-900 text-center outline-hidden shadow-2xs"
                  />
                  <span className="text-[10px] text-stone-500 block text-center font-mono">
                    = Rs. {costPerSaleUnit} per {saleUnit} cost
                  </span>
                </div>
              </div>

              {/* INITIAL INVENTORY STOCK */}
              <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
                <label className="block text-xs font-bold text-stone-800">
                  Initial Stock on Hand ({baseUnit})
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={initialStockBulk}
                    onChange={(e) => setInitialStockBulk(Math.max(0, Number(e.target.value) || 0))}
                    className="w-36 px-3 py-2 bg-white border-2 border-[#5B7981] rounded-xl text-lg font-mono font-black text-stone-900 text-center outline-hidden shadow-2xs"
                  />
                  <div className="text-xs text-stone-600 font-mono">
                    = <strong>{Math.round(initialStockBulk * conversionRatio)} {saleUnit}</strong> available for sale
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: EASY VISUAL DUAL-UNIT CONVERSION */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3.5 bg-amber-50 border border-amber-300 rounded-2xl">
                <div>
                  <span className="text-xs font-bold text-amber-950 block">
                    Automatic Dual-Unit Inventory Deduction
                  </span>
                  <span className="text-[10px] text-amber-800">
                    Buy in wholesale bags/trays, sell in retail kg/eggs. Stock auto-deducts fractional bags.
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableDualUnit}
                    onChange={(e) => setEnableDualUnit(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-stone-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#5B7981]"></div>
                </label>
              </div>

              {enableDualUnit ? (
                <div className="space-y-3.5">
                  {/* VISUAL DIAGRAM CARD */}
                  <div className="p-5 bg-gradient-to-r from-stone-50 via-amber-50/40 to-stone-50 border-2 border-amber-300 rounded-3xl space-y-4 shadow-sm">
                    <span className="text-xs font-black text-stone-700 uppercase tracking-wider block text-center">
                      Visual Conversion Formula
                    </span>

                    <div className="flex items-center justify-between gap-2 text-center">
                      {/* BULK BOX */}
                      <div className="flex-1 p-3 bg-white border border-stone-300 rounded-2xl shadow-xs">
                        <span className="text-[10px] text-stone-500 font-mono block">Wholesale Unit</span>
                        <input
                          type="text"
                          value={baseUnit}
                          onChange={(e) => setBaseUnit(e.target.value)}
                          className="font-black text-sm text-stone-900 w-full text-center bg-transparent outline-hidden border-b border-dashed border-stone-400 mt-1"
                        />
                        <span className="text-[10px] text-stone-400 font-mono block mt-1">Cost: Rs. {bulkCostPrice.toLocaleString()}</span>
                      </div>

                      <div className="flex flex-col items-center px-1">
                        <span className="text-xs font-black text-amber-700 font-mono">CONTAINS</span>
                        <ArrowRight className="w-5 h-5 text-amber-600 my-0.5" />
                        <div className="flex items-center gap-1 bg-amber-200 px-2 py-0.5 rounded-lg border border-amber-400">
                          <input
                            type="number"
                            min="1"
                            value={conversionRatio}
                            onChange={(e) => setConversionRatio(Math.max(1, Number(e.target.value) || 1))}
                            className="w-12 text-center font-mono font-black text-xs bg-white rounded border border-amber-400 outline-hidden"
                          />
                          <span className="text-[10px] font-bold text-amber-900">{saleUnit}</span>
                        </div>
                      </div>

                      {/* RETAIL BOX */}
                      <div className="flex-1 p-3 bg-white border border-stone-300 rounded-2xl shadow-xs">
                        <span className="text-[10px] text-stone-500 font-mono block">Retail Sale Unit</span>
                        <input
                          type="text"
                          value={saleUnit}
                          onChange={(e) => setSaleUnit(e.target.value)}
                          className="font-black text-sm text-emerald-800 w-full text-center bg-transparent outline-hidden border-b border-dashed border-stone-400 mt-1"
                        />
                        <span className="text-[10px] text-emerald-700 font-mono font-bold block mt-1">
                          Rs. {retailSalePrice.toLocaleString()} / {saleUnit}
                        </span>
                      </div>
                    </div>

                    {/* LIVE BUSINESS SUMMARY */}
                    <div className="p-3 bg-white/90 border border-amber-200 rounded-xl space-y-1.5 text-xs">
                      <div className="flex justify-between font-bold text-stone-700">
                        <span>Total Revenue from 1 {baseUnit}:</span>
                        <span className="font-mono text-stone-900 font-black">
                          {conversionRatio} {saleUnit} × Rs. {retailSalePrice} = Rs. {totalRetailValueOfBulk.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between font-bold text-emerald-800">
                        <span>Profit per {baseUnit}:</span>
                        <span className="font-mono font-black">
                          + Rs. {estimatedProfitPerBulk.toLocaleString()} ({profitMarginPercent}%)
                        </span>
                      </div>
                      <div className="pt-1 border-t border-stone-200 text-[11px] text-stone-500 font-mono">
                        💡 When a cashier sells 1 {saleUnit}, inventory automatically deducts <strong>{(1 / conversionRatio).toFixed(4)} {baseUnit}</strong>.
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 bg-stone-100 rounded-2xl text-center text-xs text-stone-600 space-y-1">
                  <p className="font-bold">Simple 1:1 Item (No Dual Conversion)</p>
                  <p className="text-[11px] text-stone-500">
                    Stock will be directly counted in {saleUnit}s without wholesale bag conversion.
                  </p>
                </div>
              )}
            </div>
          )}

        </div>

        {/* FOOTER ACTIONS */}
        <div className="bg-stone-50 px-6 py-4 border-t border-stone-200 flex items-center justify-between shrink-0">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((step - 1) as any)}
              className="px-4 py-2.5 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl text-xs font-bold cursor-pointer transition-colors"
            >
              Cancel
            </button>
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep((step + 1) as any)}
              className="px-5 py-2.5 bg-[#5B7981] hover:bg-[#486269] text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-md transition-all hover:scale-102"
            >
              <span>Next: {step === 1 ? 'Pricing &amp; Stock' : 'Dual-Unit Magic'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinalSubmit}
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black flex items-center gap-2 cursor-pointer shadow-md transition-all hover:scale-102 disabled:opacity-50"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>{isSubmitting ? 'Creating Commodity...' : 'Complete &amp; Add to Catalog'}</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
