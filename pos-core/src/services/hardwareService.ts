/**
 * Hardware Service for Audio Feedback, ESC/POS Thermal Printing, and WhatsApp Dispatch
 */
import { Invoice, InvoiceItem, StoreSettings } from '../types';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

const printedInvoiceIds = new Set<string>();
let lastFrontendPrintTime = 0;

export const hardwareService = {
  hasInvoiceBeenPrinted(invoiceId: string): boolean {
    if (!invoiceId) return false;
    return printedInvoiceIds.has(invoiceId);
  },

  markInvoiceAsPrinted(invoiceId: string): void {
    if (invoiceId) {
      printedInvoiceIds.add(invoiceId);
      if (printedInvoiceIds.size > 500) {
        const first = printedInvoiceIds.values().next().value;
        if (first) printedInvoiceIds.delete(first);
      }
    }
  },

  playScanSuccess() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch {}
  },

  playNoticeTone() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {}
  },

  playError() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {}
  },

  playCheckoutChime() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 major chord
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + (idx * 0.06));
        gain.gain.setValueAtTime(0.15, ctx.currentTime + (idx * 0.06));
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (idx * 0.06) + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + (idx * 0.06));
        osc.stop(ctx.currentTime + (idx * 0.06) + 0.25);
      });
    } catch {}
  },

  async printReceipt(options?: any, invoiceId?: string): Promise<{ success: boolean; skipped?: boolean }> {
    if (typeof window === 'undefined') return { success: false };

    const now = Date.now();
    const isReprint = Boolean(options?.isDuplicateReprint || options?.force);

    // Bill ID Deduplication: If this invoice ID was already auto-printed, strictly reject duplicates
    if (invoiceId && !isReprint) {
      if (printedInvoiceIds.has(invoiceId)) {
        console.warn(`[Hardware Service] Invoice #${invoiceId} has already been printed. Duplicate auto-print prevented.`);
        return { success: false, skipped: true };
      }
    }

    // Cooldown guard between prints (1.8s minimum unless forced reprint)
    if (!isReprint && (now - lastFrontendPrintTime < 1800)) {
      console.warn('[Hardware Service] Print request throttled: previous print dispatched less than 1800ms ago.');
      return { success: false, skipped: true };
    }

    lastFrontendPrintTime = now;
    if (invoiceId) {
      printedInvoiceIds.add(invoiceId);
    }

    if ((window as any).electronAPI?.printReceipt) {
      try {
        const savedReceiptPrinter = typeof localStorage !== 'undefined' ? localStorage.getItem('pos_receipt_printer') : null;
        let printPayload: any;
        if (typeof options === 'string') {
          printPayload = {
            html: this.formatThermalSlipHtml(options),
            silent: true,
            force: true,
            printerName: savedReceiptPrinter || undefined
          };
        } else if (typeof options === 'object') {
          printPayload = {
            ...options,
            html: options.html ? (options.html.startsWith('<!DOCTYPE') ? options.html : this.formatThermalSlipHtml(options.html)) : undefined,
            printerName: options.printerName || savedReceiptPrinter || undefined
          };
        } else {
          printPayload = {
            silent: true,
            printerName: savedReceiptPrinter || undefined
          };
        }
        const res = await (window as any).electronAPI.printReceipt(printPayload);
        return { success: res?.success !== false, skipped: res?.blocked };
      } catch (e) {
        console.warn('[Hardware] Electron silent print notice:', e);
        return { success: false };
      }
    }
    // Web browser environment: do not pop up print dialog during automatic silent print
    if (options?.silent) {
      console.log('[Hardware Service] Web browser simulated silent print for invoice:', invoiceId);
      return { success: true };
    }
    window.print();
    return { success: true };
  },

  async printReceiptSilent(options?: any): Promise<any> {
    return this.printReceipt(options);
  },

  generateThermalReceiptHtml(
    invoice: Invoice,
    items: InvoiceItem[] = [],
    storeSettings?: StoreSettings,
    options?: {
      partIndex?: number;
      totalParts?: number;
      partItems?: InvoiceItem[];
      isDuplicateReprint?: boolean;
    }
  ): string {
    const settings = storeSettings || ({} as StoreSettings);
    const vis = settings.receipt_visibility || {};
    const isMultiPart = Boolean(options?.totalParts && options.totalParts > 1);
    const currentPart = options?.partIndex || 1;
    const totalParts = options?.totalParts || 1;
    const isFinalPart = !isMultiPart || currentPart === totalParts;

    const displayItems = options?.partItems || items || [];
    const allItems = items.length > 0 ? items : displayItems;

    const formattedDate = new Date(invoice.created_at).toLocaleDateString('en-PK', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const formattedTime = new Date(invoice.created_at).toLocaleTimeString('en-PK', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    const storeName = vis.show_store_name !== false ? (settings.store_name || 'Point of Sale') : '';
    const tagline = vis.show_tagline !== false ? (settings.tagline || 'Point of Sale & Inventory System') : '';
    const address = vis.show_address !== false && settings.address ? settings.address : '';
    const phone = vis.show_phone !== false && settings.phone ? settings.phone : '';
    const whatsapp = vis.show_whatsapp !== false && settings.whatsapp_number ? settings.whatsapp_number : '';
    const posId = vis.show_pos_reg_id !== false && settings.pos_reg_id ? settings.pos_reg_id : '';
    const ntn = vis.show_ntn !== false && settings.ntn ? settings.ntn : '';

    const grossSubtotal = allItems.reduce((acc, it) => acc + (Number(it.subtotal) || 0), 0);
    const partSubtotal = displayItems.reduce((acc, it) => acc + (Number(it.subtotal) || 0), 0);

    const itemsHtml = displayItems.map((it, idx) => {
      const lineNo = isMultiPart ? ((currentPart - 1) * 25 + idx + 1) : (idx + 1);
      const name = it.product_name || 'Item';
      const qty = Number(it.qty) || 1;
      const rate = Number(it.unit_price) || 0;
      const total = Number(it.subtotal) || (qty * rate);

      return `
        <div class="item-row">
          <div class="item-name">${lineNo}. ${name}</div>
          <div class="item-meta">
            <span>${qty} × Rs. ${rate.toLocaleString()}</span>
            <span>Rs. ${total.toLocaleString()}</span>
          </div>
        </div>
      `;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Receipt #${invoice.invoice_number}${isMultiPart ? ` - Part ${currentPart} of ${totalParts}` : ''}</title>
  <style>
    @page {
      margin: 0;
      size: 80mm auto;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      font-family: Consolas, 'Roboto Mono', 'Courier New', Courier, monospace;
      font-size: 11px;
      line-height: 1.25;
      width: 80mm;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .receipt-wrapper {
      width: 76mm;
      max-width: 76mm;
      margin: 0;
      padding-top: 0;
      padding-bottom: 2mm;
      padding-left: 5.5mm;
      padding-right: 2.5mm;
      box-sizing: border-box;
      color: #000000;
    }
    .receipt-wrapper * {
      color: #000000 !important;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .font-bold { font-weight: 700; }
    .font-black { font-weight: 900; }
    .store-title {
      font-size: 15px;
      font-weight: 900;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.2;
    }
    .store-tagline {
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      margin-top: 1px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .store-address {
      font-size: 9px;
      font-weight: 600;
      margin-top: 2px;
      line-height: 1.2;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .store-contact {
      font-size: 9.5px;
      font-weight: 700;
      margin-top: 2px;
    }
    .banner {
      border: 1px dashed #000000;
      padding: 3px 2px;
      text-align: center;
      font-weight: 700;
      font-size: 11px;
      margin: 4px 0;
      letter-spacing: 0.5px;
    }
    .divider {
      border-bottom: 1px dashed #000000;
      margin: 4px 0;
    }
    .double-divider {
      border-top: 1px dashed #000000;
      border-bottom: 1px dashed #000000;
      padding: 3px 0;
      margin: 4px 0;
    }
    .flex-between {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .item-row {
      padding: 2.5px 0;
      border-bottom: 1px dotted #ccc;
    }
    .item-row:last-child {
      border-bottom: none;
    }
    .item-name {
      font-weight: 700;
      font-size: 11px;
      word-break: break-word;
      line-height: 1.2;
    }
    .item-meta {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      font-weight: 700;
      margin-top: 1px;
    }
    .net-total-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13.5px;
      font-weight: 900;
    }
    .teddops-tag {
      text-align: center;
      font-size: 8px;
      font-weight: 700;
      margin-top: 6px;
      padding-top: 4px;
      border-top: 1px dotted #000000;
      letter-spacing: 0.4px;
      line-height: 1.3;
    }
  </style>
</head>
<body>
  <div class="receipt-wrapper">
    <!-- STORE HEADER -->
    <div class="text-center" style="margin-top: 0; padding-top: 0; padding-bottom: 2px;">
      ${storeName ? `<div class="store-title">${storeName}</div>` : ''}
      ${tagline ? `<div class="store-tagline">${tagline}</div>` : ''}
      ${address ? `<div class="store-address">${address}</div>` : ''}
      ${(phone || whatsapp) ? `
        <div class="store-contact">
          ${phone ? `Ph: ${phone}` : ''}
          ${phone && whatsapp ? ' • ' : ''}
          ${whatsapp ? `WA: ${whatsapp}` : ''}
        </div>
      ` : ''}
      ${(posId || ntn) ? `
        <div class="store-contact" style="font-size: 9px;">
          ${posId ? `POS: ${posId}` : ''}
          ${posId && ntn ? ' • ' : ''}
          ${ntn ? `NTN: ${ntn}` : ''}
        </div>
      ` : ''}
    </div>

    <!-- REPRINT & PART BANNERS -->
    ${options?.isDuplicateReprint ? `
      <div class="banner">*** DUPLICATE REPRINT ***</div>
    ` : ''}

    ${isMultiPart ? `
      <div class="banner">*** PART ${currentPart} OF ${totalParts} ***</div>
    ` : ''}

    <div class="divider"></div>

    <!-- INVOICE INFO -->
    <div style="font-size: 10.5px; line-height: 1.35; font-weight: 700;">
      <div class="flex-between">
        <span>Bill: #${invoice.invoice_number}</span>
        <span>${formattedTime}</span>
      </div>
      <div class="flex-between">
        <span>Date: ${formattedDate}</span>
        <span>Cashier: ${invoice.cashier_name || 'Cashier #01'}</span>
      </div>
      <div class="flex-between" style="margin-top: 1px;">
        <span>Customer: ${invoice.customer_name || 'Walk-in Customer'}</span>
        ${invoice.customer_phone ? `<span>${invoice.customer_phone}</span>` : ''}
      </div>
    </div>

    ${invoice.notes ? `
      <div class="banner" style="font-size: 10px; margin: 3px 0;">${invoice.notes}</div>
    ` : ''}

    <div class="divider"></div>

    <!-- TABLE HEADER -->
    <div class="flex-between font-bold" style="font-size: 10.5px; text-transform: uppercase;">
      <span>ITEM / DESCRIPTION</span>
      <span>SUBTOTAL (RS)</span>
    </div>

    <div class="divider"></div>

    <!-- ITEMS LIST -->
    <div style="padding: 1px 0;">
      ${itemsHtml}
    </div>

    <div class="divider"></div>

    <!-- MULTI-PART CONTINUATION FOOTER (IF NOT FINAL PART) -->
    ${isMultiPart && !isFinalPart ? `
      <div style="padding: 2px 0; font-size: 10.5px; font-weight: 700;">
        <div class="flex-between">
          <span>PART ${currentPart} SUB-TOTAL (${displayItems.length} Items):</span>
          <span>PKR ${partSubtotal.toLocaleString()}</span>
        </div>
      </div>
      <div class="banner" style="margin-top: 5px;">
        --- CONTINUED IN PART ${currentPart + 1} --->
      </div>
    ` : `
      <!-- GRAND TOTALS & PAYMENT DETAILS (FINAL PART OR SINGLE RECEIPT) -->
      <div style="font-size: 10.5px; font-weight: 700; line-height: 1.35;">
        ${isMultiPart ? `
          <div class="flex-between">
            <span>PART ${currentPart} SUB-TOTAL (${displayItems.length} Items):</span>
            <span>PKR ${partSubtotal.toLocaleString()}</span>
          </div>
          <div class="dotted-divider"></div>
        ` : ''}

        <div class="flex-between">
          <span>Gross Subtotal (${allItems.length} Items):</span>
          <span>PKR ${grossSubtotal.toLocaleString()}</span>
        </div>

        ${invoice.discount_amount > 0 ? `
          <div class="flex-between">
            <span>DISCOUNT:</span>
            <span>- PKR ${Number(invoice.discount_amount).toLocaleString()}</span>
          </div>
        ` : ''}

        ${vis.show_rounding !== false && invoice.round_off_amount !== 0 ? `
          <div class="flex-between" style="font-size: 10px; font-style: italic;">
            <span>Cash Rounding (nearest Rs. 5):</span>
            <span>${invoice.round_off_amount > 0 ? '+' : ''}PKR ${invoice.round_off_amount}</span>
          </div>
        ` : ''}

        <div class="double-divider">
          <div class="net-total-row">
            <span>NET TOTAL:</span>
            <span>PKR ${Number(invoice.total_amount).toLocaleString()}</span>
          </div>
        </div>

        <!-- PAYMENT MODE -->
        <div class="flex-between" style="margin-top: 2px;">
          <span>PAYMENT MODE:</span>
          <span style="text-transform: uppercase;">${invoice.payment_mode}</span>
        </div>

        ${invoice.payment_mode === 'cash' ? `
          <div class="flex-between">
            <span>Cash Tendered:</span>
            <span>PKR ${Number(invoice.paid_amount).toLocaleString()}</span>
          </div>
          <div class="flex-between" style="border-top: 1px dotted #888; padding-top: 2px; margin-top: 2px;">
            <span>Change Returned:</span>
            <span>PKR ${Number(invoice.change_due).toLocaleString()}</span>
          </div>
        ` : ''}

        ${invoice.payment_mode === 'khata' ? `
          <div class="banner" style="margin-top: 4px; font-size: 10px;">
            CHARGED TO CUSTOMER KHATA ACCOUNT
          </div>
        ` : ''}

        ${isMultiPart ? `
          <div class="banner" style="margin-top: 6px;">
            *** FINAL PART (${currentPart} OF ${totalParts}) - BILL COMPLETE ***
          </div>
        ` : ''}
      </div>

      <!-- FOOTER -->
      <div class="text-center" style="margin-top: 6px; padding-top: 3px; font-size: 10px; font-weight: 700; line-height: 1.3;">
        ${vis.show_thank_you !== false ? `
          <div style="text-transform: uppercase; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            THANK YOU FOR SHOPPING WITH US!
          </div>
        ` : ''}
        ${vis.show_urdu_dua !== false && settings.receipt_footer_urdu ? `
          <div style="font-size: 11px; margin-top: 2px;">
            ${settings.receipt_footer_urdu}
          </div>
        ` : ''}
        ${vis.show_return_policy !== false && settings.receipt_footer_english ? `
          <div style="font-size: 9px; margin-top: 2px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            ${settings.receipt_footer_english}
          </div>
        ` : ''}

        ${vis.show_barcode_qr !== false ? `
          <div style="margin-top: 4px;">
            <div style="letter-spacing: 3px; font-size: 9px;">||| | ||||| ||| |||| || |||||| |</div>
            <div style="font-size: 8.5px; margin-top: 1px;">* ${invoice.invoice_number} *</div>
          </div>
        ` : ''}
      </div>
    `}

    <!-- WATERMARK -->
    <div class="teddops-tag">
      DEVELOPED AND MAINTAINED BY TEDDOPS<br/>
      +923297263098 • +923235930559
    </div>
  </div>
</body>
</html>`;
  },

  async printInvoiceReceipt(
    invoice: Invoice,
    items: InvoiceItem[] = [],
    storeSettings?: StoreSettings,
    options?: { isDuplicateReprint?: boolean; force?: boolean; silent?: boolean }
  ): Promise<{ success: boolean; skipped?: boolean }> {
    const liveSettings: StoreSettings = storeSettings || {
      store_name: 'Point of Sale',
      tagline: 'Point of Sale & Inventory System',
      address: '',
      phone: '',
      whatsapp_number: '',
      currency_symbol: 'Rs.',
      cash_rounding_nearest: 5,
      admin_pin: '8888',
      receipt_footer_urdu: 'ہمارے ہاں ہر قسم کی اشیاء مناسب ریٹ پر دستیاب ہیں',
      receipt_footer_english: 'Exchange within 3 days with original receipt'
    };

    let receiptItems = items;
    if (!receiptItems || receiptItems.length === 0) {
      if (invoice.items && invoice.items.length > 0) {
        receiptItems = invoice.items;
      }
    }

    const CHUNK_SIZE = 50; // 50 items per thermal ticket (user preferred batch size for long bills)
    if (receiptItems.length <= CHUNK_SIZE) {
      // Single continuous ticket
      const html = this.generateThermalReceiptHtml(invoice, receiptItems, liveSettings, {
        isDuplicateReprint: options?.isDuplicateReprint
      });
      return await this.printReceipt(
        {
          html,
          silent: options?.silent ?? true,
          force: options?.force ?? true,
          isDuplicateReprint: options?.isDuplicateReprint
        },
        invoice.id
      );
    }

    // Long bill (> 25 items): Split sequentially into parts (Part 1 of X, Part 2 of X)
    const totalParts = Math.ceil(receiptItems.length / CHUNK_SIZE);
    let overallSuccess = true;

    for (let i = 0; i < totalParts; i++) {
      const partIndex = i + 1;
      const partItems = receiptItems.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const partHtml = this.generateThermalReceiptHtml(invoice, receiptItems, liveSettings, {
        partIndex,
        totalParts,
        partItems,
        isDuplicateReprint: options?.isDuplicateReprint
      });

      const res = await this.printReceipt(
        {
          html: partHtml,
          silent: true,
          force: true, // allow fast successive spooling without 2.5s block
          isDuplicateReprint: options?.isDuplicateReprint
        },
        i === 0 ? invoice.id : undefined
      );

      if (!res.success && !res.skipped) {
        overallSuccess = false;
      }

      // 1.2s delay between parts to let printer feed and cutter cycle
      if (i < totalParts - 1) {
        await new Promise(r => setTimeout(r, 1200));
      }
    }

    return { success: overallSuccess };
  },

  formatThermalSlipHtml(content: string, title = 'Thermal Slip'): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    @page {
      margin: 0;
      size: 80mm auto;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      font-family: Consolas, 'Roboto Mono', 'Courier New', Courier, monospace;
      font-size: 11px;
      line-height: 1.2;
      width: 80mm;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    #thermal-slip-container {
      width: 76mm;
      max-width: 76mm;
      margin: 0;
      padding-top: 0;
      padding-bottom: 2mm;
      padding-left: 5.5mm;
      padding-right: 2.5mm;
      box-sizing: border-box;
      color: #000000;
    }
    #thermal-slip-container * {
      color: #000000 !important;
      font-weight: 700 !important;
    }
    pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-all;
      font-family: inherit;
      font-size: 11px;
      line-height: 1.25;
    }
    .teddops-tag {
      text-align: center;
      font-size: 8px;
      margin-top: 6px;
      padding-top: 3px;
      border-top: 1px dotted #000000;
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
  <div id="thermal-slip-container">
    ${content.startsWith('<') ? content : `<pre>${content}</pre>`}
    <div class="teddops-tag">
      DEVELOPED AND MAINTAINED BY TEDDOPS<br/>
      +923297263098 • +923235930559
    </div>
  </div>
</body>
</html>`;
  },

  async printDirectThermal(text: string): Promise<void> {
    if (typeof window === 'undefined') return;

    // Use invisible iframe to completely eliminate window popup lag
    let iframe = document.getElementById('thermal-silent-print-frame') as HTMLIFrameElement;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'thermal-silent-print-frame';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);
    }

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!doc) {
      window.print();
      return;
    }

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Slip</title>
          <style>
            @page { margin: 0 !important; size: 80mm auto !important; }
            html, body {
              height: auto !important;
              min-height: 0 !important;
              max-height: none !important;
              font-family: 'Courier New', monospace;
              font-size: 11px;
              font-weight: 700;
              line-height: 1.2;
              width: 70mm !important;
              max-width: 70mm !important;
              padding: 4px 2px 2px 4px !important;
              margin: 0 0 0 4.5mm !important;
              box-sizing: border-box !important;
              color: #000000;
              background: #ffffff;
              white-space: pre-wrap;
              page-break-after: avoid;
              break-after: avoid;
            }
          </style>
        </head>
        <body>${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.warn('[Thermal Print Notice]:', e);
      }
    }, 50);
  },

  async getPrinters(): Promise<Array<{ name: string; displayName?: string; isDefault?: boolean }>> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.getPrinters) {
      try {
        const printers = await (window as any).electronAPI.getPrinters();
        return Array.isArray(printers) ? printers : [];
      } catch (e) {
        console.warn('[HardwareService] Failed to retrieve system printers:', e);
        return [];
      }
    }
    return [];
  },

  async printSticker(options: {
    html: string;
    pageSize?: any;
    printerName?: string;
    copies?: number;
    silent?: boolean;
  }): Promise<{ success: boolean; printerName?: string; error?: string }> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.printSticker) {
      try {
        const savedStickerPrinter = typeof localStorage !== 'undefined' ? localStorage.getItem('pos_sticker_printer') : null;
        const targetPrinter = options.printerName || savedStickerPrinter || undefined;
        return await (window as any).electronAPI.printSticker({
          ...options,
          printerName: targetPrinter,
          copies: options.copies || 1,
          silent: options.silent !== false
        });
      } catch (e: any) {
        console.warn('[HardwareService] Electron sticker print error:', e);
        return { success: false, error: e?.message };
      }
    }

    // Fallback for browser mode
    try {
      const printWin = window.open('', '_blank', 'width=800,height=600');
      if (printWin) {
        printWin.document.write(options.html);
        printWin.document.close();
        return { success: true };
      }
    } catch {}
    return { success: false, error: 'Could not open print window' };
  },

  openWhatsApp(phone: string, text: string): void {
    if (typeof window === 'undefined') return;
    let cleanPhone = (phone || '').replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '92' + cleanPhone.substring(1);
    } else if (cleanPhone.length === 10 && cleanPhone.startsWith('3')) {
      cleanPhone = '92' + cleanPhone;
    }

    if ((window as any).electronAPI?.openWhatsApp) {
      (window as any).electronAPI.openWhatsApp({ phone: cleanPhone, message: text });
    } else {
      const url = cleanPhone
        ? `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`
        : `https://web.whatsapp.com/send?text=${encodeURIComponent(text)}`;
      if ((window as any).electronAPI?.openExternal) {
        (window as any).electronAPI.openExternal(url);
      } else {
        window.open(url, '_blank');
      }
    }
  }
};
