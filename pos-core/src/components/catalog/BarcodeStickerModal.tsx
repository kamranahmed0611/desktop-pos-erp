import React, { useState, useEffect } from 'react';
import bwipjs from 'bwip-js';
import { Product, StoreSettings } from '../../types';
import { posAlert } from '../../store/uiStore';
import { hardwareService } from '../../services/hardwareService';
import { 
  Barcode, Printer, X, Sliders, Eye, Plus, Minus, Settings2, CheckCircle2, ChevronDown, ChevronUp, Save
} from 'lucide-react';

export type StickerFormat = 
  | 'roll_70x40' // (Default - client's measured XP-365B roll: 7cm x 4cm)
  | 'roll_50x30' // (Standard retail shelf sticker roll)
  | 'roll_80x50' // (Full width 80mm thermal roll sticker)
  | 'roll_75x40' // (Wide 75x40mm thermal shelf sticker)
  | 'roll_50x25' // (50x25mm compact shelf sticker)
  | 'roll_40x30' // (40x30mm small grocery sticker)
  | 'roll_38x25' // (38x25mm mini sticker)
  | 'roll_custom'// (Custom mm x mm dimensions)
  | 'a4_24'      // A4 Grid (24 Labels - 70x37mm)
  | 'a4_30'      // A4 Grid (30 Labels - 70x29.7mm)
  | 'a4_40';     // A4 Grid (40 Labels - 52.5x29.7mm)

interface BarcodeStickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  storeSettings: StoreSettings;
}

export const BarcodeStickerModal: React.FC<BarcodeStickerModalProps> = ({
  isOpen,
  onClose,
  product,
  storeSettings
}) => {
  // Load saved preferences if available
  const savedPrefs = (() => {
    try {
      const p = localStorage.getItem('pos_sticker_prefs');
      return p ? JSON.parse(p) : null;
    } catch {
      return null;
    }
  })();

  // Configurable Elements - Default: Name, Barcode Graphic, Code Number ON; Store Name and Price OFF
  const [showBarcodeGraphic, setShowBarcodeGraphic] = useState<boolean>(savedPrefs?.showBarcodeGraphic ?? true);
  const [showBarcodeNumber, setShowBarcodeNumber] = useState<boolean>(savedPrefs?.showBarcodeNumber ?? true);
  const [showProductName, setShowProductName] = useState<boolean>(savedPrefs?.showProductName ?? true);
  const [showRetailPrice, setShowRetailPrice] = useState<boolean>(savedPrefs?.showRetailPrice ?? false);
  const [showStoreName, setShowStoreName] = useState<boolean>(savedPrefs?.showStoreName ?? false);

  // Format Selection - Default to 70x40mm roll (Client's exact measured roll: 7cm x 4cm)
  const [format, setFormat] = useState<StickerFormat>(savedPrefs?.format ?? 'roll_70x40');

  // Custom roll dimensions &amp; gap distance in mm
  const [customWidthMm, setCustomWidthMm] = useState<number>(savedPrefs?.customWidthMm ?? 70);
  const [customHeightMm, setCustomHeightMm] = useState<number>(savedPrefs?.customHeightMm ?? 40);
  const [gapDistanceMm, setGapDistanceMm] = useState<number>(savedPrefs?.gapDistanceMm ?? 2); // Gap between stickers
  const [paddingTopMm, setPaddingTopMm] = useState<number>(savedPrefs?.paddingTopMm ?? 1.5);
  const [paddingSideMm, setPaddingSideMm] = useState<number>(savedPrefs?.paddingSideMm ?? 2);
  const [barcodeHeightMm, setBarcodeHeightMm] = useState<number>(savedPrefs?.barcodeHeightMm ?? 12);

  // System printers &amp; target XP-365B selection
  const [systemPrinters, setSystemPrinters] = useState<Array<{ name: string; isDefault?: boolean }>>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>(
    savedPrefs?.selectedPrinter || (typeof localStorage !== 'undefined' ? localStorage.getItem('pos_sticker_printer') || '' : '')
  );
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  // Fetch installed OS printers and auto-match XP-365B / XP-D365B
  useEffect(() => {
    if (!isOpen) return;
    hardwareService.getPrinters().then(printers => {
      setSystemPrinters(printers);
      if (!selectedPrinter) {
        const match = printers.find(p => /365|d365|label|barcode|xp-365|xp-d365/i.test(p.name));
        if (match) {
          setSelectedPrinter(match.name);
          localStorage.setItem('pos_sticker_printer', match.name);
        }
      }
    });
  }, [isOpen]);

  // Advanced calibration drawer toggle
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false);

  // Custom copies counter (Default = 1 for rolls, 24 for A4)
  const [copies, setCopies] = useState<number>(1);

  // Generated Barcode Data URL
  const [barcodeDataUrl, setBarcodeDataUrl] = useState<string>('');

  // Save current preferences to localStorage
  const handleSavePreferences = () => {
    const prefs = {
      showBarcodeGraphic,
      showBarcodeNumber,
      showProductName,
      showRetailPrice,
      showStoreName,
      format,
      customWidthMm,
      customHeightMm,
      gapDistanceMm,
      paddingTopMm,
      paddingSideMm,
      barcodeHeightMm,
      selectedPrinter
    };
    try {
      localStorage.setItem('pos_sticker_prefs', JSON.stringify(prefs));
      if (selectedPrinter) {
        localStorage.setItem('pos_sticker_printer', selectedPrinter);
      }
      hardwareService.playScanSuccess();
      posAlert('Preferences Saved', 'Sticker dimensions, gap, printer, and toggle settings saved as permanent default.', 'success');
    } catch {}
  };

  // Generate crisp 1-bit barcode using bwip-js whenever product changes
  useEffect(() => {
    if (!isOpen || !product) return;

    const rawBarcode = (product.barcode || '').trim();
    if (!rawBarcode) {
      setBarcodeDataUrl('');
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      const isEan13 = rawBarcode.length === 13 && /^\d+$/.test(rawBarcode);
      
      // High-precision barcode rendering optimized for 203 DPI direct thermal printheads
      bwipjs.toCanvas(canvas, {
        bcid: isEan13 ? 'ean13' : 'code128',
        text: rawBarcode,
        scale: 3,
        height: Math.max(8, barcodeHeightMm - 2),
        includetext: false,
        backgroundcolor: 'ffffff',
        paddingleft: 4,
        paddingright: 4
      });
      setBarcodeDataUrl(canvas.toDataURL('image/png'));
    } catch (err: any) {
      console.warn('[bwip-js] Barcode render fallback to code128:', err?.message);
      try {
        const canvas = document.createElement('canvas');
        bwipjs.toCanvas(canvas, {
          bcid: 'code128',
          text: rawBarcode,
          scale: 3,
          height: Math.max(8, barcodeHeightMm - 2),
          includetext: false,
          backgroundcolor: 'ffffff',
          paddingleft: 4,
          paddingright: 4
        });
        setBarcodeDataUrl(canvas.toDataURL('image/png'));
      } catch {
        setBarcodeDataUrl('');
      }
    }
  }, [isOpen, product, barcodeHeightMm]);

  // Adjust default copies when switching format family
  useEffect(() => {
    if (format === 'a4_24') setCopies(24);
    else if (format === 'a4_30') setCopies(30);
    else if (format === 'a4_40') setCopies(40);
    else if (copies > 50) setCopies(1);
  }, [format]);

  if (!isOpen || !product) return null;

  // Resolve current label dimensions in millimeters
  const getDimensionsMm = () => {
    switch (format) {
      case 'roll_70x40': return { width: 70, height: 40 }; // Exact 7cm x 4cm client roll
      case 'roll_50x30': return { width: 50, height: 30 };
      case 'roll_80x50': return { width: 80, height: 50 };
      case 'roll_75x40': return { width: 75, height: 40 };
      case 'roll_50x25': return { width: 50, height: 25 };
      case 'roll_40x30': return { width: 40, height: 30 };
      case 'roll_38x25': return { width: 38, height: 25 };
      case 'roll_custom': return { width: Math.max(20, customWidthMm || 70), height: Math.max(15, customHeightMm || 40) };
      case 'a4_24': return { width: 70, height: 37 };
      case 'a4_30': return { width: 70, height: 29.7 };
      case 'a4_40': return { width: 52.5, height: 29.7 };
      default: return { width: 70, height: 40 };
    }
  };

  const currentDims = getDimensionsMm();

  // Dynamic font sizing for product name (auto-scales down for long names without moving other elements)
  const calculateProductNameFontSize = (name: string, labelHeight: number) => {
    const len = (name || '').trim().length;
    let base = labelHeight >= 40 ? 11.5 : labelHeight >= 30 ? 10 : 8.5;
    if (len > 35) {
      return Math.max(7, base - 4);
    } else if (len > 24) {
      return Math.max(8, base - 2.5);
    } else if (len > 16) {
      return Math.max(9, base - 1.5);
    }
    return base;
  };

  const dynamicNameSize = calculateProductNameFontSize(product.name, currentDims.height);

  const handlePrintStickers = async (silentDirect = true) => {
    if (!product.barcode) {
      posAlert('Barcode Required', 'This product does not have a barcode assigned.', 'warning');
      return;
    }

    hardwareService.playScanSuccess();
    setIsPrinting(true);

    const isRoll = format.startsWith('roll_');
    const { width: labelW, height: labelH } = currentDims;

    const stickerHtml = `
      <div class="sticker-cell">
        ${showStoreName ? `<div class="store-name">${storeSettings.store_name}</div>` : ''}
        ${showProductName ? `<div class="prod-name">${product.name}</div>` : ''}
        ${showRetailPrice ? `<div class="price-tag">Rs. ${Math.round(product.sale_price).toLocaleString()}</div>` : ''}
        ${showBarcodeGraphic && barcodeDataUrl ? `<img src="${barcodeDataUrl}" class="barcode-img" alt="Barcode" />` : ''}
        ${showBarcodeNumber ? `<div class="barcode-digits">${product.barcode}</div>` : ''}
      </div>
    `;

    const allStickers = Array.from({ length: Math.max(1, copies) }, () => stickerHtml).join('\n');

    let gridCols = 3;
    if (format === 'a4_40') gridCols = 4;

    const pageCss = isRoll ? `
      @page {
        size: ${labelW}mm ${labelH}mm portrait;
        margin: 0 !important;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
      }
      .sticker-cell {
        width: ${labelW}mm !important;
        height: ${labelH}mm !important;
        page-break-after: always !important;
        break-after: page !important;
        box-sizing: border-box !important;
        padding: ${paddingTopMm}mm ${paddingSideMm}mm !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        text-align: center !important;
        overflow: hidden !important;
      }
    ` : `
      @page {
        size: A4 portrait;
        margin: 6mm 4mm !important;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
      }
      .grid-container {
        display: grid;
        grid-template-columns: repeat(${gridCols}, 1fr);
        gap: 0;
        width: 100%;
      }
      .sticker-cell {
        width: ${labelW}mm;
        height: ${labelH}mm;
        box-sizing: border-box;
        border: 0.5px dashed #cccccc;
        padding: ${paddingTopMm}mm ${paddingSideMm}mm;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        overflow: hidden;
      }
    `;

    const getHtmlDocument = (content: string) => `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Stickers - ${product.name}</title>
          <style>
            * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            ${pageCss}
            .store-name {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              font-size: 9px;
              font-weight: 800;
              text-transform: uppercase;
              color: #000000;
              line-height: 1;
              letter-spacing: 0.5px;
              margin-bottom: 1.2mm;
              -webkit-font-smoothing: none !important;
            }
            .prod-name {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              font-size: ${dynamicNameSize}px;
              font-weight: 700;
              color: #000000;
              line-height: 1.2;
              max-width: 96%;
              max-height: 9mm;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
              overflow: hidden;
              word-break: break-word;
              margin-bottom: 1.5mm;
              text-align: center;
              -webkit-font-smoothing: none !important;
            }
            .price-tag {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              font-size: 14px;
              font-weight: 900;
              color: #000000;
              line-height: 1.1;
              margin-bottom: 1.2mm;
              -webkit-font-smoothing: none !important;
            }
            .barcode-img {
              max-height: ${barcodeHeightMm}mm;
              max-width: 94%;
              object-fit: contain;
              image-rendering: pixelated;
              display: block;
              margin: 0 auto;
            }
            .barcode-digits {
              font-family: 'Courier New', Courier, monospace;
              font-size: 10px;
              font-weight: 800;
              color: #000000;
              letter-spacing: 1.5px;
              line-height: 1;
              margin-top: 1.2mm;
              -webkit-font-smoothing: none !important;
            }
          </style>
        </head>
        <body>
          ${content}
        </body>
      </html>
    `;

    // For silent roll printing: Send 1 single sticker to the driver with `copies: N`
    // to prevent N pages * N copies double multiplication.
    // For preview or A4: Send full repeated items.
    const silentPrintHtml = isRoll 
      ? getHtmlDocument(stickerHtml) 
      : getHtmlDocument(`<div class="grid-container">${allStickers}</div>`);
    const previewHtml = isRoll 
      ? getHtmlDocument(allStickers) 
      : getHtmlDocument(`<div class="grid-container">${allStickers}</div>`);

    if (silentDirect && (window as any).electronAPI?.printSticker) {
      try {
        const res = await hardwareService.printSticker({
          html: silentPrintHtml,
          pageSize: isRoll ? { width: Math.round(labelW * 1000), height: Math.round(labelH * 1000) } : 'A4',
          printerName: selectedPrinter || undefined,
          copies: Math.max(1, copies),
          silent: true
        });
        setIsPrinting(false);
        if (res.success) {
          posAlert(
            'Stickers Dispatched',
            `Successfully sent ${copies} sticker(s) to ${res.printerName || selectedPrinter || 'XP-365B'}.`,
            'success'
          );
        } else {
          posAlert('Printer Notice', `Print error: ${res.error || 'Failed to dispatch to driver'}`, 'warning');
        }
        return;
      } catch (err: any) {
        setIsPrinting(false);
        console.warn('[Barcode Sticker Print Notice]:', err);
      }
    }

    // Manual preview / PDF window fallback
    setIsPrinting(false);
    const printWin = window.open('', '_blank', 'width=800,height=700');
    if (printWin) {
      printWin.document.write(previewHtml);
      printWin.document.close();
      setTimeout(() => {
        printWin.focus();
        printWin.print();
      }, 250);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 font-sans select-none animate-fade-in">
      <div className="bg-white border border-stone-300 rounded-3xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[94vh] overflow-hidden">
        
        {/* MODAL HEADER */}
        <div className="bg-[#243338] text-white px-6 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#5B7981] text-[#E3D5C0] rounded-xl shadow-xs">
              <Barcode className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-wide uppercase">Barcode Sticker &amp; Label Generator</h2>
              <span className="text-xs text-[#E3D5C0] font-mono">
                {product.name} • {product.barcode || 'NO BARCODE'}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-stone-400 hover:text-white rounded-lg cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          
          {/* 1. CONFIGURABLE ELEMENTS (DEFAULTS PER USER INSTRUCTION: NAME, BARCODE GRAPHIC &amp; DIGITS ON; REST OFF) */}
          <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-800 uppercase flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-[#5B7981]" />
                Sticker Elements to Print
              </span>
              <button
                type="button"
                onClick={handleSavePreferences}
                className="text-[10px] font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer transition-colors"
                title="Save current element &amp; size preferences as default"
              >
                <Save className="w-3 h-3" /> Save as Default
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              {/* Product Name (Default: ON) */}
              <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-stone-200 cursor-pointer hover:bg-stone-50">
                <input
                  type="checkbox"
                  checked={showProductName}
                  onChange={(e) => setShowProductName(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 cursor-pointer"
                />
                <span className="font-bold text-stone-900">Product Name</span>
              </label>

              {/* Barcode Graphic (Default: ON) */}
              <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-stone-200 cursor-pointer hover:bg-stone-50">
                <input
                  type="checkbox"
                  checked={showBarcodeGraphic}
                  onChange={(e) => setShowBarcodeGraphic(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 cursor-pointer"
                />
                <span className="font-bold text-stone-900">Barcode Graphic</span>
              </label>

              {/* Barcode Number (Default: ON) */}
              <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-stone-200 cursor-pointer hover:bg-stone-50">
                <input
                  type="checkbox"
                  checked={showBarcodeNumber}
                  onChange={(e) => setShowBarcodeNumber(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 cursor-pointer"
                />
                <span className="font-bold text-stone-900">Barcode Digits</span>
              </label>

              {/* Retail Price (Default: OFF per user request) */}
              <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-stone-200 cursor-pointer hover:bg-stone-50">
                <input
                  type="checkbox"
                  checked={showRetailPrice}
                  onChange={(e) => setShowRetailPrice(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 cursor-pointer"
                />
                <span className="font-bold text-stone-700">Retail Price (Rs)</span>
              </label>

              {/* Store Name (Default: OFF per user request) */}
              <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-stone-200 cursor-pointer hover:bg-stone-50">
                <input
                  type="checkbox"
                  checked={showStoreName}
                  onChange={(e) => setShowStoreName(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 cursor-pointer"
                />
                <span className="font-bold text-stone-700">Store Name</span>
              </label>
            </div>
          </div>

          {/* 2. FORMAT SELECTION (XP-365B THERMAL ROLLS &amp; A4 SHEETS) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-stone-700 uppercase">
                Paper &amp; Roll Presets
              </label>
              <span className="text-[11px] font-mono font-bold text-[#5B7981] bg-[#5B7981]/10 px-2 py-0.5 rounded-lg flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Active Size: {currentDims.width}mm × {currentDims.height}mm
              </span>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              
              {/* ROLL 70x40 (CLIENT'S ROLL - 7cm x 4cm - DEFAULT) */}
              <button
                type="button"
                onClick={() => setFormat('roll_70x40')}
                className={`p-2.5 rounded-2xl border text-left cursor-pointer transition-all relative ${
                  format === 'roll_70x40'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-600'
                    : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-black text-xs text-emerald-950">70×40 mm</span>
                  <span className="text-[8.5px] font-black uppercase bg-emerald-700 text-white px-1.5 py-0.2 rounded">
                    Client Roll
                  </span>
                </div>
                <div className="text-[10px] text-emerald-800 font-mono mt-0.5 font-bold">
                  7cm × 4cm (Measured)
                </div>
              </button>

              {/* ROLL 50x30 */}
              <button
                type="button"
                onClick={() => setFormat('roll_50x30')}
                className={`p-2.5 rounded-2xl border text-left cursor-pointer transition-all ${
                  format === 'roll_50x30'
                    ? 'border-[#5B7981] bg-[#5B7981]/10 text-[#243338] ring-2 ring-[#5B7981]'
                    : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                }`}
              >
                <div className="font-black text-xs text-[#243338]">50×30 mm</div>
                <div className="text-[10px] text-stone-500 font-mono mt-0.5">Retail Shelf Roll</div>
              </button>

              {/* ROLL 80x50 */}
              <button
                type="button"
                onClick={() => setFormat('roll_80x50')}
                className={`p-2.5 rounded-2xl border text-left cursor-pointer transition-all ${
                  format === 'roll_80x50'
                    ? 'border-[#5B7981] bg-[#5B7981]/10 text-[#243338] ring-2 ring-[#5B7981]'
                    : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                }`}
              >
                <div className="font-black text-xs text-[#243338]">80×50 mm</div>
                <div className="text-[10px] text-stone-500 font-mono mt-0.5">80mm Full Roll</div>
              </button>

              {/* ROLL 75x40 */}
              <button
                type="button"
                onClick={() => setFormat('roll_75x40')}
                className={`p-2.5 rounded-2xl border text-left cursor-pointer transition-all ${
                  format === 'roll_75x40'
                    ? 'border-[#5B7981] bg-[#5B7981]/10 text-[#243338] ring-2 ring-[#5B7981]'
                    : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                }`}
              >
                <div className="font-black text-xs text-[#243338]">75×40 mm</div>
                <div className="text-[10px] text-stone-500 font-mono mt-0.5">Wide Shelf Sticker</div>
              </button>

              {/* ROLL 50x25 */}
              <button
                type="button"
                onClick={() => setFormat('roll_50x25')}
                className={`p-2.5 rounded-2xl border text-left cursor-pointer transition-all ${
                  format === 'roll_50x25'
                    ? 'border-[#5B7981] bg-[#5B7981]/10 text-[#243338] ring-2 ring-[#5B7981]'
                    : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                }`}
              >
                <div className="font-black text-xs text-[#243338]">50×25 mm</div>
                <div className="text-[10px] text-stone-500 font-mono mt-0.5">Compact Roll</div>
              </button>

              {/* ROLL 40x30 */}
              <button
                type="button"
                onClick={() => setFormat('roll_40x30')}
                className={`p-2.5 rounded-2xl border text-left cursor-pointer transition-all ${
                  format === 'roll_40x30'
                    ? 'border-[#5B7981] bg-[#5B7981]/10 text-[#243338] ring-2 ring-[#5B7981]'
                    : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                }`}
              >
                <div className="font-black text-xs text-[#243338]">40×30 mm</div>
                <div className="text-[10px] text-stone-500 font-mono mt-0.5">Grocery Sticker</div>
              </button>

              {/* ROLL 38x25 */}
              <button
                type="button"
                onClick={() => setFormat('roll_38x25')}
                className={`p-2.5 rounded-2xl border text-left cursor-pointer transition-all ${
                  format === 'roll_38x25'
                    ? 'border-[#5B7981] bg-[#5B7981]/10 text-[#243338] ring-2 ring-[#5B7981]'
                    : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                }`}
              >
                <div className="font-black text-xs text-[#243338]">38×25 mm</div>
                <div className="text-[10px] text-stone-500 font-mono mt-0.5">Mini Sticker</div>
              </button>

              {/* A4 24 */}
              <button
                type="button"
                onClick={() => setFormat('a4_24')}
                className={`p-2.5 rounded-2xl border text-left cursor-pointer transition-all ${
                  format === 'a4_24'
                    ? 'border-[#5B7981] bg-[#5B7981]/10 text-[#243338] ring-2 ring-[#5B7981]'
                    : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                }`}
              >
                <div className="font-black text-xs text-[#243338]">A4 Sheet (24-up)</div>
                <div className="text-[10px] text-stone-500 font-mono mt-0.5">PDF &amp; Print Grid</div>
              </button>

            </div>
          </div>

          {/* 3. FUTURE-PROOF ROLL CALIBRATION &amp; GAP DRAWER */}
          <div className="border border-stone-200 rounded-2xl overflow-hidden bg-stone-50">
            <button
              type="button"
              onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
              className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-bold text-stone-800 hover:bg-stone-100 cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Settings2 className="w-4 h-4 text-[#5B7981]" />
                Roll Calibration &amp; Gap Settings (If roll size or gap changes)
              </span>
              {showAdvancedSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showAdvancedSettings && (
              <div className="p-4 border-t border-stone-200 bg-white space-y-3.5 text-xs">
                {/* TARGET PRINTER SELECTION */}
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-emerald-950 uppercase flex items-center gap-1.5">
                      <Printer className="w-4 h-4 text-emerald-700" />
                      Target Barcode Label Printer
                    </label>
                    <span className="text-[10px] bg-emerald-200/80 text-emerald-900 font-mono px-2 py-0.5 rounded font-bold">
                      XP-365B / D365B Driver
                    </span>
                  </div>
                  <select
                    value={selectedPrinter}
                    onChange={(e) => {
                      setSelectedPrinter(e.target.value);
                      localStorage.setItem('pos_sticker_printer', e.target.value);
                    }}
                    className="w-full px-3 py-1.5 bg-white border border-stone-300 rounded-xl font-bold text-xs cursor-pointer focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Auto-Detect (XP-365B / XP-D365B / Label Driver)</option>
                    {systemPrinters.map(p => (
                      <option key={p.name} value={p.name}>
                        {p.name} {/365|d365|label/i.test(p.name) ? '★ (Detected Barcode Driver)' : ''}
                      </option>
                    ))}
                  </select>
                  <div className="text-[10.5px] text-emerald-800 leading-tight">
                    Routed directly to the XP-365B label driver with exact millimetric dimensions and zero margin rotation.
                  </div>
                </div>

                <p className="text-[11px] text-stone-600 leading-relaxed">
                  Configure custom sticker width, height, and the backing gap between stickers. These values instruct the XP-365B driver to align each label:
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                  <div>
                    <label className="block text-[10px] font-bold text-stone-500 uppercase font-sans mb-1">
                      Width (mm)
                    </label>
                    <input
                      type="number"
                      min="20"
                      max="100"
                      value={customWidthMm}
                      onChange={(e) => {
                        setCustomWidthMm(parseInt(e.target.value) || 70);
                        setFormat('roll_custom');
                      }}
                      className="w-full px-2 py-1.5 border border-stone-300 rounded-lg font-bold text-center"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-stone-500 uppercase font-sans mb-1">
                      Height (mm)
                    </label>
                    <input
                      type="number"
                      min="15"
                      max="150"
                      value={customHeightMm}
                      onChange={(e) => {
                        setCustomHeightMm(parseInt(e.target.value) || 40);
                        setFormat('roll_custom');
                      }}
                      className="w-full px-2 py-1.5 border border-stone-300 rounded-lg font-bold text-center"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-stone-500 uppercase font-sans mb-1">
                      Sticker Gap (mm)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={gapDistanceMm}
                      onChange={(e) => setGapDistanceMm(parseFloat(e.target.value) || 2)}
                      className="w-full px-2 py-1.5 border border-stone-300 rounded-lg font-bold text-center"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-stone-500 uppercase font-sans mb-1">
                      Barcode Height (mm)
                    </label>
                    <input
                      type="number"
                      min="8"
                      max="25"
                      value={barcodeHeightMm}
                      onChange={(e) => setBarcodeHeightMm(parseInt(e.target.value) || 12)}
                      className="w-full px-2 py-1.5 border border-stone-300 rounded-lg font-bold text-center"
                    />
                  </div>
                </div>

                {/* HARDWARE GAP AUTO-DETECTION GUIDE */}
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-amber-950">
                  <div className="font-bold flex items-center gap-1.5 uppercase text-amber-900 text-[11px]">
                    <Settings2 className="w-3.5 h-3.5" />
                    XP-365B Dual-Mode &amp; Gap Auto-Detection Instructions
                  </div>
                  <div className="space-y-1.5 text-[11px] leading-relaxed">
                    <p>
                      <strong>1. How the XP-365B Auto-Detects Gap &amp; Height:</strong> The XP-365B has an optical transmission sensor. When you insert a new sticker roll:
                    </p>
                    <ol className="list-decimal list-inside pl-1 space-y-0.5 text-stone-800 font-medium">
                      <li>Power <strong>OFF</strong> the XP-365B printer.</li>
                      <li>Hold down the <strong>FEED</strong> button and switch power <strong>ON</strong>.</li>
                      <li>Watch the LED: When it flashes <strong>RED</strong> (second flash), release <strong>FEED</strong> immediately.</li>
                      <li>The printer will automatically feed 2–3 empty labels, calculate the gap distance and height, and lock its sensor!</li>
                      <li>LED turns solid Blue. The software will now print each sticker perfectly centered without shifting!</li>
                    </ol>
                    <p className="pt-1.5 border-t border-amber-200 font-medium">
                      <strong>2. Switching Dual Modes (Receipts vs Barcodes):</strong>
                      <br />
                      Hold <strong>PAUSE</strong> while powering ON until 2 beeps sound. Press <strong>FEED</strong> to toggle between Receipt Mode (bills via XP-80 / XP-80C driver) and Label Mode (stickers via XP-365B driver), then power off and on.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 4. COPIES COUNTER */}
          <div className="p-3 bg-stone-50 border border-stone-200 rounded-2xl flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-stone-800 block">Number of Copies</span>
              <span className="text-[10px] text-stone-500">Number of sticker labels to print</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCopies(Math.max(1, copies - 1))}
                className="w-8 h-8 rounded-xl bg-white border border-stone-300 font-bold flex items-center justify-center hover:bg-stone-100 cursor-pointer shadow-xs"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <input
                type="number"
                min="1"
                max="1000"
                value={copies}
                onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 px-2 py-1 bg-white border border-stone-300 rounded-xl font-mono font-bold text-center text-sm shadow-inner"
              />
              <button
                type="button"
                onClick={() => setCopies(copies + 1)}
                className="w-8 h-8 rounded-xl bg-white border border-stone-300 font-bold flex items-center justify-center hover:bg-stone-100 cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>

              <div className="flex items-center gap-1 pl-1">
                {[1, 2, 5, 10, 20, 50, 100].map(cnt => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setCopies(cnt)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold cursor-pointer transition-colors ${
                      copies === cnt ? 'bg-[#5B7981] text-white' : 'bg-white border border-stone-300 hover:bg-stone-100 text-stone-800'
                    }`}
                  >
                    {cnt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 5. LIVE VISUAL STICKER PREVIEW (DYNAMIC AUTO-SCALED NAME) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-700 uppercase flex items-center gap-1">
                <Eye className="w-3.5 h-3.5 text-[#5B7981]" />
                Live 203 DPI Sticker Preview ({currentDims.width}mm × {currentDims.height}mm)
              </span>
              <span className="text-[10px] text-stone-500 font-mono">
                Name Auto-Scale: {dynamicNameSize}px
              </span>
            </div>

            <div className="p-4 bg-stone-100 rounded-2xl flex justify-center border border-stone-200">
              <div 
                className="bg-white p-3 rounded-lg border-2 border-black shadow-sm text-center flex flex-col items-center justify-center transition-all overflow-hidden"
                style={{
                  width: `${Math.min(320, currentDims.width * 4.4)}px`,
                  minHeight: `${Math.min(220, currentDims.height * 4.4)}px`
                }}
              >
                {showStoreName && (
                  <div className="text-[9.5px] font-black uppercase tracking-wider text-black leading-none font-sans mb-1">
                    {storeSettings.store_name}
                  </div>
                )}
                {showProductName && (
                  <div 
                    className="font-bold text-black max-w-[95%] leading-tight font-sans text-center mb-1 overflow-hidden"
                    style={{
                      fontSize: `${dynamicNameSize}px`,
                      maxHeight: '36px',
                      wordBreak: 'break-word',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical'
                    }}
                  >
                    {product.name}
                  </div>
                )}
                {showRetailPrice && (
                  <div className="text-[15px] font-black text-black font-sans mb-1">
                    Rs. {Math.round(product.sale_price).toLocaleString()}
                  </div>
                )}
                {showBarcodeGraphic && barcodeDataUrl ? (
                  <img 
                    src={barcodeDataUrl} 
                    className="max-w-[94%] object-contain my-0.5" 
                    style={{ height: `${barcodeHeightMm * 2.8}px` }} 
                    alt="Barcode preview" 
                  />
                ) : (
                  showBarcodeGraphic && (
                    <div className="h-9 w-48 bg-stone-100 border border-stone-300 flex items-center justify-center text-[10px] text-stone-400 font-mono my-0.5">
                      Generating Barcode...
                    </div>
                  )
                )}
                {showBarcodeNumber && (
                  <div className="text-[10px] font-mono font-bold tracking-widest text-black mt-0.5">
                    {product.barcode || 'N/A'}
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* MODAL FOOTER */}
        <div className="bg-stone-50 px-6 py-3 border-t border-stone-200 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-xl text-xs font-bold cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handlePrintStickers(false)}
              className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5 transition-colors"
              title="Open browser print / PDF export window"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview / PDF</span>
            </button>

            <button
              type="button"
              disabled={isPrinting}
              onClick={() => handlePrintStickers(true)}
              className={`px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black shadow-md cursor-pointer flex items-center gap-2 transition-all hover:scale-102 ${
                isPrinting ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <Printer className="w-4 h-4" />
              <span>
                {isPrinting ? 'Dispatching...' : `Print ${copies} ${copies > 1 ? 'Stickers' : 'Sticker'} (${currentDims.width}×${currentDims.height}mm)`}
              </span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
