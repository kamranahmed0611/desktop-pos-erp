import React, { useRef, useEffect, useState } from 'react';
import { Invoice, InvoiceItem, StoreSettings } from '../../types';
import { hardwareService } from '../../services/hardwareService';
import { emergencyBillService } from '../../services/emergencyBillService';
import { billingService } from '../../services/billingService';
import { invoicePdfService } from '../../services/invoicePdfService';
import { Printer, Share2, X, CheckCircle2, RefreshCw } from 'lucide-react';

interface HighDensityReceiptCardProps {
  invoice: Invoice;
  storeSettings: StoreSettings;
  onClose?: () => void;
  isDuplicateReprint?: boolean;
  shouldAutoPrint?: boolean;
}

export const HighDensityReceiptCard: React.FC<HighDensityReceiptCardProps> = ({
  invoice,
  storeSettings: initialStoreSettings,
  onClose,
  isDuplicateReprint = false,
  shouldAutoPrint = true
}) => {
  const receiptRef = useRef<HTMLDivElement>(null);
  
  // Real-time live settings sync from localStorage with instant event listener
  const [liveSettings, setLiveSettings] = useState<StoreSettings>(() => {
    try {
      const saved = localStorage.getItem('pos_store_settings');
      if (saved) {
        return { ...initialStoreSettings, ...JSON.parse(saved) };
      }
    } catch {}
    return initialStoreSettings;
  });

  useEffect(() => {
    const handleSync = (e: any) => {
      if (e?.detail) {
        setLiveSettings(prev => ({ ...prev, ...e.detail }));
      } else {
        const saved = localStorage.getItem('pos_store_settings');
        if (saved) {
          try {
            setLiveSettings(prev => ({ ...prev, ...JSON.parse(saved) }));
          } catch {}
        }
      }
    };
    window.addEventListener('pos_settings_updated', handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener('pos_settings_updated', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  const vis = liveSettings.receipt_visibility || {};
  const [items, setItems] = useState<InvoiceItem[]>(invoice.items || []);
  const [receiptHeightMm, setReceiptHeightMm] = useState<number>(110);

  // Helper to compute exact dynamic height for XP-365B thermal printer (eliminates white space)
  const getReceiptDimensions = () => {
    const el = receiptRef.current;
    const pxHeight = el?.offsetHeight || 220;
    // 1 px = 0.264583 mm (standard 96 DPI CSS pixel ratio)
    const contentHeightMm = Math.ceil(pxHeight * 0.264583);
    // Tight cut with zero bloated bottom white space + safety buffer for long lists
    const heightMm = Math.max(25, contentHeightMm + 2);
    return {
      heightMm,
      pageSize: {
        width: 80000, // 80mm in microns
        height: heightMm * 1000 // height in microns
      }
    };
  };

  // Ensure invoice items are fully loaded even if passed with empty items array
  useEffect(() => {
    if (invoice.items && invoice.items.length > 0) {
      setItems(invoice.items);
    } else if (invoice.invoice_number || invoice.id) {
      billingService.getInvoiceWithItems(invoice.invoice_number || invoice.id)
        .then(full => {
          if (full?.items && full.items.length > 0) {
            setItems(full.items);
          }
        })
        .catch(err => console.warn('[Receipt] Error loading invoice items:', err));
    }
  }, [invoice]);

  // Measure content height whenever items, invoice or settings change
  useEffect(() => {
    const updateDimensions = () => {
      const { heightMm } = getReceiptDimensions();
      setReceiptHeightMm(heightMm);
    };
    updateDimensions();
    const timer = setTimeout(updateDimensions, 100);
    return () => clearTimeout(timer);
  }, [items, invoice, liveSettings]);

  // Auto-dispatch silent print once the receipt DOM element is fully rendered and populated
  useEffect(() => {
    if (!shouldAutoPrint || isDuplicateReprint) return;

    const timer = setTimeout(async () => {
      try {
        await hardwareService.printInvoiceReceipt(invoice, items, liveSettings, {
          silent: true,
          isDuplicateReprint: false
        });
      } catch (err: any) {
        console.warn('[Receipt Auto-Print Notice]:', err?.message);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [shouldAutoPrint, invoice.id, isDuplicateReprint, items, liveSettings]);

  const formattedDate = new Date(invoice.created_at).toLocaleString('en-PK', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  const handlePrint = async () => {
    hardwareService.playScanSuccess();
    try {
      await hardwareService.printInvoiceReceipt(invoice, items, liveSettings, {
        silent: true,
        force: true,
        isDuplicateReprint
      });
    } catch (err: any) {
      console.warn('[Print notice] Print dispatch warning:', err?.message);
    }
  };

  // Keyboard shortcut listener: Esc or Enter to close, P or Shift+Enter to reprint copy
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        if (onClose) onClose();
      } else if (e.key === 'p' || e.key === 'P' || (e.shiftKey && e.key === 'Enter')) {
        e.preventDefault();
        handlePrint();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [invoice, onClose, isDuplicateReprint]);

  const [isSharingWhatsApp, setIsSharingWhatsApp] = useState(false);

  const handleWhatsAppShare = async () => {
    if (isSharingWhatsApp) return;
    setIsSharingWhatsApp(true);
    hardwareService.playScanSuccess();
    try {
      await invoicePdfService.generateAndShare(invoice, liveSettings);
    } catch (err: any) {
      console.warn('[WhatsApp Share Error]:', err?.message);
    } finally {
      setIsSharingWhatsApp(false);
    }
  };

  const totalQty = items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:static print:inset-auto print:p-0 print:m-0 print:overflow-visible print:bg-white print:backdrop-blur-none print:block print:w-[80mm] print:h-auto print:min-h-0">
      <div className="bg-stone-100 border border-stone-300 rounded-3xl max-w-lg w-full max-h-[94vh] shadow-2xl overflow-hidden flex flex-col my-auto font-sans print:static print:p-0 print:m-0 print:overflow-visible print:bg-white print:border-none print:shadow-none print:block print:max-h-none print:w-[80mm] print:h-auto print:min-h-0">
        
        {/* HEADER BAR */}
        <div className="bg-[#243338] text-white px-5 py-3.5 flex items-center justify-between border-b border-stone-700 shrink-0 print:hidden">
          <div className="flex items-center space-x-2.5">
            <div className="bg-[#5B7981] text-[#E3D5C0] p-1.5 rounded-xl">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm tracking-wide text-white">DIGITAL RECEIPT BILL</h3>
              <p className="text-[11px] text-[#E3D5C0] font-mono">Invoice #{invoice.invoice_number}</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-stone-300 hover:text-white bg-white/10 hover:bg-white/20 p-1.5 rounded-xl transition-colors cursor-pointer"
              title="Close [Esc]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* PRINT STATUS NOTIFICATION BANNER */}
        <div className="bg-emerald-700 text-white px-4 py-2 flex items-center justify-between text-xs font-bold border-b border-emerald-800 shrink-0 print:hidden">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
            <span>Bill print processed automatically to printer</span>
          </div>
          <div className="flex items-center gap-1.5 bg-black/25 px-2.5 py-0.5 rounded-lg text-[11px] font-mono tracking-wide text-white">
            Close using <kbd className="bg-white/20 px-1 py-0.5 rounded font-bold text-white">Esc</kbd>
          </div>
        </div>

        {/* PRINTABLE RECEIPT BODY */}
        <div className="p-4 sm:p-6 bg-stone-200/60 overflow-y-auto flex-1 min-h-0 flex justify-center items-start print:static print:p-0 print:m-0 print:overflow-visible print:bg-white print:block print:w-[80mm] print:h-auto print:min-h-0">
          <div
            ref={receiptRef}
            id="printable-thermal-receipt"
            className="w-[340px] bg-[#FFFDF9] text-black shadow-xl border border-stone-300 relative select-text shrink-0 my-2 print:my-0 print:border-none print:shadow-none print:w-[72mm] print:mx-auto print:bg-white"
            style={{
              fontFamily: "Consolas, 'Roboto Mono', 'Courier New', Courier, monospace",
              boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
              padding: '4mm 3mm 1.5mm 3mm',
              WebkitFontSmoothing: 'none'
            }}
          >
            {/* TORN TOP EDGE SVG (PREVIEW ONLY) */}
            <div
              className="absolute top-0 left-0 right-0 h-2 -mt-2 bg-repeat-x overflow-hidden pointer-events-none opacity-80 print:hidden"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23FFFDF9' d='M0 0l6 8 6-8z'/%3E%3C/svg%3E")`
              }}
            />

            {/* DUPLICATE REPRINT BANNER */}
            {isDuplicateReprint && (
              <div className="text-center py-1 mb-1.5 border border-dashed border-red-600 bg-red-50 text-red-700 font-bold text-xs tracking-wider uppercase font-mono">
                *** DUPLICATE REPRINT ***
              </div>
            )}

            {/* STORE HEADER (CRISP HIGH-CONTRAST BOLD) */}
            <div className="text-center pb-1.5 border-b border-dashed border-black space-y-0.5">
              {vis.show_store_name !== false && (
                <div className="text-[16px] font-extrabold font-sans tracking-tight text-black uppercase leading-tight">
                  {liveSettings.store_name || 'Point of Sale'}
                </div>
              )}
              {vis.show_tagline !== false && (
                <div className="text-[10px] font-bold font-sans text-black uppercase tracking-wider">
                  {liveSettings.tagline || 'Point of Sale & Inventory'}
                </div>
              )}
              {vis.show_address !== false && liveSettings.address && (
                <div className="text-[9.5px] text-black font-semibold font-sans leading-tight pt-0.5">
                  {liveSettings.address}
                </div>
              )}
              {((vis.show_phone !== false && liveSettings.phone) || (vis.show_whatsapp !== false && liveSettings.whatsapp_number)) && (
                <div className="text-[10px] text-black font-bold font-mono pt-0.5">
                  {vis.show_phone !== false && liveSettings.phone && `Ph: ${liveSettings.phone}`}
                  {vis.show_phone !== false && vis.show_whatsapp !== false && liveSettings.phone && liveSettings.whatsapp_number && ' • '}
                  {vis.show_whatsapp !== false && liveSettings.whatsapp_number && `WA: ${liveSettings.whatsapp_number}`}
                </div>
              )}
              {((vis.show_pos_reg_id !== false && liveSettings.pos_reg_id) || (vis.show_ntn !== false && liveSettings.ntn)) && (
                <div className="text-[9.5px] text-black font-bold font-mono pt-0.5">
                  {vis.show_pos_reg_id !== false && liveSettings.pos_reg_id && `POS: ${liveSettings.pos_reg_id}`}
                  {vis.show_pos_reg_id !== false && vis.show_ntn !== false && liveSettings.pos_reg_id && liveSettings.ntn && ' • '}
                  {vis.show_ntn !== false && liveSettings.ntn && `NTN: ${liveSettings.ntn}`}
                </div>
              )}
            </div>

            {/* INVOICE & CUSTOMER INFO (DARK BOLD) */}
            <div className="py-1 border-b border-dashed border-black space-y-0.5 text-[10.5px] font-mono">
              {vis.show_invoice_number !== false && (
                <div className="flex justify-between font-bold text-black">
                  <span>Bill: #{invoice.invoice_number}</span>
                  {Boolean(invoice.is_retroactive) ? (
                    <span className="border border-black px-1 text-[8.5px] font-bold">
                      PENDING
                    </span>
                  ) : (
                    <span>{new Date(invoice.created_at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</span>
                  )}
                </div>
              )}
              <div className="flex justify-between text-black font-bold">
                {vis.show_date_time !== false && (
                  <span>Date: {new Date(invoice.created_at).toLocaleDateString('en-PK')}</span>
                )}
                {vis.show_cashier_name !== false && (
                  <span>Cashier: {invoice.cashier_name || 'Cashier #01'}</span>
                )}
              </div>
              <div className="flex justify-between text-black font-bold pt-0.5">
                <span>Customer: {invoice.customer_name || 'Walk-in Customer'}</span>
                {invoice.customer_phone && <span className="font-mono">{invoice.customer_phone}</span>}
              </div>
            </div>

            {/* STATEMENT DURATION / CONSOLIDATED NOTES BANNER */}
            {invoice.notes && (
              <div className="my-1 p-1 border border-black bg-stone-50 text-center font-bold text-[10px] tracking-wider text-black uppercase font-mono">
                {invoice.notes}
              </div>
            )}

            {/* ITEMS TABLE HEADER (CLEAN 2-LINE FORMAT) */}
            <div className="py-1 border-b border-dashed border-black text-[10.5px] font-bold font-mono flex justify-between uppercase tracking-wide">
              <span>ITEM / DESCRIPTION</span>
              <span>SUBTOTAL (RS)</span>
            </div>

            {/* ITEM ROWS (DARK BOLD HIGH-CONTRAST) */}
            <div className="py-0.5 border-b border-dashed border-black">
              {items.map((it, idx) => (
                <div key={idx} className="receipt-item-row py-1 border-b border-dotted border-stone-300 last:border-none">
                  {/* Line 1: Full Item Name */}
                  <div className="text-[11.5px] leading-snug font-bold font-sans text-black break-words">
                    {it.product_name}
                  </div>
                  {/* Line 2: Qty x Rate on left, Subtotal on right */}
                  <div className="flex justify-between items-baseline text-[10.5px] font-mono pt-0.5 font-bold">
                    <span className="text-black">
                      {it.qty} × Rs. {it.unit_price.toLocaleString()}
                    </span>
                    <span className="text-[11.5px] text-black">
                      Rs. {it.subtotal.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* SUMMARY TOTALS */}
            <div className="py-1 border-b border-dashed border-black space-y-0.5 text-[10.5px] font-mono font-bold">
              <div className="flex justify-between text-black">
                <span>Gross Subtotal ({items.length} Items):</span>
                <span>PKR {items.reduce((acc, it) => acc + (it.subtotal || 0), 0).toLocaleString()}</span>
              </div>

              {invoice.discount_amount > 0 && (
                <div className="flex justify-between text-black">
                  <span>DISCOUNT:</span>
                  <span>- PKR {invoice.discount_amount.toLocaleString()}</span>
                </div>
              )}

              {vis.show_rounding !== false && invoice.round_off_amount !== 0 && (
                <div className="flex justify-between text-black text-[10px] italic">
                  <span>Cash Rounding (nearest Rs. 5):</span>
                  <span>{invoice.round_off_amount > 0 ? '+' : ''}PKR {invoice.round_off_amount}</span>
                </div>
              )}

              {/* CLEAN INK-SAVING DOUBLE-DASHED NET TOTAL */}
              <div className="my-1.5 py-1.5 border-t border-b border-dashed border-black flex justify-between items-center text-xs font-black font-mono">
                <span className="uppercase tracking-wider text-black">NET TOTAL:</span>
                <span className="text-[14px] font-black tracking-wide text-black">PKR {invoice.total_amount.toLocaleString()}</span>
              </div>

              {/* PAYMENT DETAILS */}
              <div className="space-y-0.5 pt-0.5 text-[10.5px] font-mono font-bold">
                <div className="flex justify-between text-black">
                  <span>PAYMENT MODE:</span>
                  <span className="uppercase">{invoice.payment_mode}</span>
                </div>
                {invoice.payment_mode === 'cash' && (
                  <>
                    <div className="flex justify-between text-black">
                      <span>Cash Tendered:</span>
                      <span>PKR {invoice.paid_amount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-black pt-0.5 border-t border-dotted border-stone-400">
                      <span>Change Returned:</span>
                      <span>PKR {invoice.change_due.toLocaleString()}</span>
                    </div>
                  </>
                )}
                {invoice.payment_mode === 'khata' && (
                  <div className="bg-stone-100 text-black p-1 text-center text-[10px] font-bold border border-dashed border-black mt-1 font-mono">
                    CHARGED TO CUSTOMER KHATA ACCOUNT
                  </div>
                )}
              </div>
            </div>

            {/* FOOTER & BRANDING (ZERO BOTTOM SLACK) */}
            <div className="pt-1 text-center space-y-0.5 receipt-footer-end">
              {vis.show_thank_you !== false && (
                <div className="text-[10.5px] font-bold font-sans text-black uppercase tracking-wide">
                  THANK YOU FOR SHOPPING WITH US!
                </div>
              )}
              {vis.show_urdu_dua !== false && liveSettings.receipt_footer_urdu && (
                <div className="text-xs font-bold text-black font-serif leading-snug">
                  {liveSettings.receipt_footer_urdu}
                </div>
              )}
              {vis.show_return_policy !== false && liveSettings.receipt_footer_english && (
                <div className="text-[9.5px] text-black font-bold font-sans leading-tight pt-0.5">
                  {liveSettings.receipt_footer_english}
                </div>
              )}

              {/* BARCODE AT BOTTOM (ONLY IF CHECKED IN ADMIN SETTINGS) */}
              {vis.show_barcode_qr !== false && (
                <div className="pt-1 flex flex-col items-center">
                  <div className="font-mono text-[9px] text-black tracking-widest uppercase font-bold">
                    ||| | ||||| ||| |||| || |||||| |
                  </div>
                  <div className="text-[8.5px] text-black font-mono pt-0.5 font-bold">
                    * {invoice.invoice_number} *
                  </div>
                </div>
              )}

              {/* TEDDOPS OFFICIAL DEVELOPER WATERMARK (PERMANENT / NON-REMOVABLE) */}
              <div className="pt-1 mt-0.5 border-t border-dashed border-black text-[8.5px] text-black font-mono tracking-tight leading-tight">
                <div className="uppercase font-bold">
                  Developed and maintained by Teddops
                </div>
                <div className="font-bold">
                  +923297263098 • +923235930559
                </div>
              </div>

              {/* ZERO-HEIGHT THERMAL CUT BOUNDARY */}
              <div className="thermal-cut-boundary" />
            </div>

            {/* TORN BOTTOM EDGE SVG (PREVIEW ONLY) */}
            <div
              className="absolute bottom-0 left-0 right-0 h-2 -mb-2 bg-repeat-x overflow-hidden pointer-events-none opacity-80 rotate-180 print:hidden"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23FFFDF9' d='M0 0l6 8 6-8z'/%3E%3C/svg%3E")`
              }}
            />
          </div>
        </div>

        {/* FOOTER ACTION BUTTONS */}
        <div className="bg-white px-4 py-3 border-t border-stone-200 flex flex-wrap items-center justify-between gap-2 font-sans shrink-0 print:hidden">
          <div className="text-xs text-stone-500 font-mono hidden sm:flex items-center gap-1">
            <span>Press</span>
            <kbd className="px-1.5 py-0.5 bg-stone-100 border border-stone-300 rounded text-stone-700 font-bold text-[11px]">Esc</kbd>
            <span>or</span>
            <kbd className="px-1.5 py-0.5 bg-stone-100 border border-stone-300 rounded text-stone-700 font-bold text-[11px]">Enter</kbd>
            <span>to close</span>
          </div>

          <div className="flex items-center gap-2 flex-1 justify-end">
            <button
              onClick={handleWhatsAppShare}
              disabled={isSharingWhatsApp}
              className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold cursor-pointer flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
            >
              {isSharingWhatsApp ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-700 animate-spin" />
                  <span>Opening WhatsApp...</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5 text-emerald-700" />
                  <span>WhatsApp</span>
                </>
              )}
            </button>

            <button
              onClick={handlePrint}
              className="px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-300 rounded-xl text-xs font-bold cursor-pointer flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
              title="Press P to reprint duplicate copy"
            >
              <Printer className="w-3.5 h-3.5 stroke-[2]" /> {isDuplicateReprint ? 'Reprint [P]' : 'Reprint Copy [P]'}
            </button>

            {onClose && (
              <button
                onClick={onClose}
                className="px-5 py-2.5 bg-[#243338] hover:bg-[#1a262a] text-white rounded-xl text-xs font-black cursor-pointer flex items-center justify-center gap-1.5 shadow-md transition-all hover:scale-102 whitespace-nowrap"
                title="Close receipt and scan next customer [Esc]"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400 stroke-[2.5]" /> Close [Esc]
              </button>
            )}
          </div>
        </div>
      </div>

      {/* PRINT MEDIA STYLES (MATCHES ON-SCREEN UI EXACTLY) */}
      <style>{`
        @media print {
          @page {
            margin: 0 !important;
            size: 80mm ${receiptHeightMm}mm !important;
          }
          *, *::before, *::after {
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            filter: none !important;
            transform: none !important;
            box-shadow: none !important;
            animation: none !important;
            transition: none !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body, #root {
            height: auto !important;
            min-height: ${receiptHeightMm}mm !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            width: 80mm !important;
            font-family: Consolas, 'Roboto Mono', 'Courier New', Courier, monospace !important;
          }
          body * {
            visibility: hidden;
          }
          #printable-thermal-receipt, #printable-thermal-receipt * {
            visibility: visible !important;
          }
          #printable-thermal-receipt {
            position: absolute !important;
            top: 0 !important;
            left: 5.5mm !important;
            display: block !important;
            width: 76mm !important;
            max-width: 76mm !important;
            margin: 0 !important;
            padding: 0 2.5mm 2mm 5.5mm !important;
            box-sizing: border-box !important;
            background: #ffffff !important;
            color: #000000 !important;
            font-family: Consolas, 'Roboto Mono', 'Courier New', Courier, monospace !important;
            font-size: 11px !important;
            line-height: 1.15 !important;
            -webkit-font-smoothing: none !important;
            font-smooth: never !important;
            text-rendering: geometricPrecision !important;
            box-shadow: none !important;
            border: none !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            overflow: hidden !important;
            z-index: 9999999 !important;
          }
          #printable-thermal-receipt * {
            color: #000000 !important;
            font-weight: 700 !important;
          }
          .receipt-item-row {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .receipt-footer-end {
            margin-bottom: 0 !important;
            padding-bottom: 0 !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .thermal-cut-boundary {
            height: 0px !important;
            line-height: 0px !important;
            margin: 0 !important;
            padding: 0 !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
            overflow: hidden !important;
          }
        }
      `}</style>
    </div>
  );
};
