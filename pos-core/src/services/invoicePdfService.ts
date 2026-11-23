import { Invoice, InvoiceItem, StoreSettings, Customer, CustomerTransaction } from '../types';
import { posPrompt } from '../store/uiStore';

export const invoicePdfService = {
  sanitizePhone(phone: string): string {
    let clean = (phone || '').replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) {
      clean = '92' + clean.substring(1);
    } else if (clean.length === 10 && clean.startsWith('3')) {
      clean = '92' + clean;
    }
    return clean;
  },

  openExternalUrl(url: string): void {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.openExternal) {
      (window as any).electronAPI.openExternal(url);
    } else if (typeof window !== 'undefined') {
      window.open(url, '_blank');
    }
  },

  dispatchWhatsApp(phone: string, message: string): void {
    if (typeof window === 'undefined') return;
    const cleanPhone = this.sanitizePhone(phone);
    if ((window as any).electronAPI?.openWhatsApp) {
      (window as any).electronAPI.openWhatsApp({ phone: cleanPhone, message });
    } else {
      const url = cleanPhone
        ? `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`
        : `https://web.whatsapp.com/send?text=${encodeURIComponent(message)}`;
      this.openExternalUrl(url);
    }
  },

  generateA4InvoiceHtml(invoice: Invoice, storeSettings: StoreSettings): string {
    const items = invoice.items || [];
    const dateStr = new Date(invoice.created_at).toLocaleDateString('en-PK', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    const timeStr = new Date(invoice.created_at).toLocaleTimeString('en-PK', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const rowsHtml = items.map((it, idx) => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 10px; text-align: center; color: #64748b; font-size: 10pt;">${idx + 1}</td>
        <td style="padding: 8px 10px; font-weight: 600; color: #0f172a; font-size: 10.5pt;">${it.product_name}</td>
        <td style="padding: 8px 10px; text-align: center; font-weight: 700; color: #0f172a; font-size: 10.5pt;">${it.qty} ${it.unit_label || ''}</td>
        <td style="padding: 8px 10px; text-align: right; color: #334155; font-size: 10pt;">Rs. ${Number(it.unit_price).toLocaleString()}</td>
        <td style="padding: 8px 10px; text-align: right; font-weight: 700; color: #0f172a; font-size: 10.5pt;">Rs. ${Number(it.subtotal).toLocaleString()}</td>
      </tr>
    `).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Sales Invoice - #${invoice.invoice_number}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 15mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 0;
      line-height: 1.45;
      font-size: 10pt;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .invoice-card {
      border: 2px solid #0f172a;
      border-radius: 8px;
      padding: 24px;
      min-height: 94vh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .header-table {
      width: 100%;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    .store-name {
      font-size: 22pt;
      font-weight: 900;
      text-transform: uppercase;
      color: #0f172a;
      letter-spacing: 0.5px;
      margin: 0 0 4px 0;
    }
    .store-tagline {
      font-size: 10pt;
      font-weight: 700;
      color: #0284c7;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin: 0 0 6px 0;
    }
    .store-details {
      font-size: 9pt;
      color: #475569;
      line-height: 1.4;
    }
    .invoice-badge-box {
      text-align: right;
    }
    .invoice-title {
      font-size: 18pt;
      font-weight: 900;
      color: #0284c7;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin: 0 0 6px 0;
    }
    .meta-table {
      width: 100%;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #f8fafc;
      padding: 12px 16px;
      margin-bottom: 20px;
    }
    .meta-table td {
      padding: 3px 8px;
      font-size: 9.5pt;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    .items-table th {
      background: #0f172a;
      color: #ffffff;
      padding: 9px 10px;
      font-size: 9pt;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .summary-box {
      width: 320px;
      margin-left: auto;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #f8fafc;
      padding: 12px 16px;
      margin-bottom: 20px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      font-size: 10pt;
    }
    .summary-total {
      border-top: 2px solid #0f172a;
      padding-top: 8px;
      margin-top: 6px;
      font-size: 13pt;
      font-weight: 900;
      color: #0284c7;
    }
    .terms-box {
      font-size: 8.5pt;
      color: #64748b;
      line-height: 1.4;
      border-top: 1px dashed #cbd5e1;
      padding-top: 12px;
      margin-top: auto;
    }
    .teddops-tag {
      text-align: center;
      font-size: 8.5pt;
      color: #334155;
      font-weight: 700;
      margin-top: 14px;
      padding-top: 10px;
      border-top: 1.5px solid #0f172a;
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
  <div class="invoice-card">
    <div>
      <!-- Header -->
      <table class="header-table">
        <tr>
          <td style="vertical-align: top;">
            <div class="store-name">${storeSettings.store_name || 'POINT OF SALE'}</div>
            <div class="store-tagline">${storeSettings.tagline || 'Point of Sale & Inventory System'}</div>
            <div class="store-details">
              ${storeSettings.address || 'Pakistan'}<br/>
              ${storeSettings.phone ? `Phone: ${storeSettings.phone}` : ''} 
              ${storeSettings.whatsapp_number ? `• WhatsApp: ${storeSettings.whatsapp_number}` : ''}<br/>
              ${storeSettings.ntn ? `FBR NTN: ${storeSettings.ntn}` : ''} 
              ${storeSettings.pos_reg_id ? `• POS Reg ID: ${storeSettings.pos_reg_id}` : ''}
            </div>
          </td>
          <td class="invoice-badge-box" style="vertical-align: top;">
            <div class="invoice-title">OFFICIAL INVOICE</div>
            <div style="font-family: monospace; font-size: 11pt; font-weight: 800; color: #0f172a;">
              Bill #${invoice.invoice_number}
            </div>
            <div style="font-size: 9pt; color: #64748b; margin-top: 3px;">
              Date: <strong>${dateStr}</strong><br/>
              Time: <strong>${timeStr}</strong>
            </div>
          </td>
        </tr>
      </table>

      <!-- Meta info: Customer & Cashier -->
      <table class="meta-table">
        <tr>
          <td style="width: 50%;">
            <span style="color: #64748b; font-size: 8.5pt; text-transform: uppercase;">Billed To:</span><br/>
            <strong style="font-size: 11pt; color: #0f172a;">${invoice.customer_name || 'Walk-in Customer'}</strong><br/>
            ${invoice.customer_phone ? `<span style="color: #475569; font-family: monospace;">Phone: ${invoice.customer_phone}</span>` : ''}
          </td>
          <td style="width: 50%;">
            <span style="color: #64748b; font-size: 8.5pt; text-transform: uppercase;">Register & Tender:</span><br/>
            <strong>Cashier:</strong> ${invoice.cashier_name || 'Cashier #01'}<br/>
            <strong>Payment Mode:</strong> <span style="text-transform: uppercase; font-weight: 700; color: #0284c7;">${invoice.payment_mode}</span>
          </td>
        </tr>
      </table>

      <!-- Items Table -->
      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 8%; text-align: center;">#</th>
            <th style="width: 48%; text-align: left;">Item Description</th>
            <th style="width: 14%; text-align: center;">Qty</th>
            <th style="width: 15%; text-align: right;">Unit Price</th>
            <th style="width: 15%; text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <!-- Totals Summary -->
      <div class="summary-box">
        <div class="summary-row">
          <span style="color: #64748b;">Gross Subtotal (${items.length} items):</span>
          <strong>Rs. ${(invoice.total_amount + (invoice.discount_amount || 0)).toLocaleString()}</strong>
        </div>
        ${invoice.discount_amount > 0 ? `
        <div class="summary-row" style="color: #dc2626;">
          <span>Discount Applied:</span>
          <strong>- Rs. ${Number(invoice.discount_amount).toLocaleString()}</strong>
        </div>` : ''}
        ${invoice.tax_amount > 0 ? `
        <div class="summary-row" style="color: #64748b;">
          <span>Sales Tax (GST):</span>
          <strong>+ Rs. ${Number(invoice.tax_amount).toLocaleString()}</strong>
        </div>` : ''}
        <div class="summary-row summary-total">
          <span>NET PAYABLE:</span>
          <span>PKR ${Number(invoice.total_amount).toLocaleString()}</span>
        </div>
        <div class="summary-row" style="font-size: 9pt; color: #475569; margin-top: 4px;">
          <span>Amount Paid:</span>
          <strong>Rs. ${Number(invoice.paid_amount || invoice.total_amount).toLocaleString()}</strong>
        </div>
        ${invoice.change_due > 0 ? `
        <div class="summary-row" style="font-size: 9pt; color: #16a34a;">
          <span>Change Returned:</span>
          <strong>Rs. ${Number(invoice.change_due).toLocaleString()}</strong>
        </div>` : ''}
      </div>
    </div>

    <!-- Terms & Developer Footer -->
    <div>
      <div class="terms-box">
        <strong>Terms & Conditions:</strong><br/>
        1. Exchange/Return accepted within 7 days with this original official invoice.<br/>
        2. Perishable, dairy, and cold storage items are non-returnable once taken from store premises.<br/>
        3. For any invoice queries or customer support, please contact: ${storeSettings.phone || '+92 306 5157506'}.
      </div>

      <div class="teddops-tag">
        DEVELOPED AND MAINTAINED BY TEDDOPS SOFTWARE ENGINEERING<br/>
        Technical Support Helpline: +92 329 7263098 • +92 323 5930559 • Islamabad, Pakistan
      </div>
    </div>
  </div>
</body>
</html>`;
  },

  async generateAndShare(
    invoice: Invoice, 
    storeSettings: StoreSettings,
    customPhone?: string
  ): Promise<{
    success: boolean;
    filePath?: string;
    whatsappUrl: string;
    cleanPhone: string;
  }> {
    let targetPhone = customPhone || invoice.customer_phone || '';
    if (!targetPhone || !targetPhone.trim() || targetPhone.trim() === '03000000000') {
      const enteredPhone = await posPrompt(
        'Walk-in Customer WhatsApp',
        `No phone number recorded for ${invoice.customer_name || 'Walk-in Customer'}.\n\nEnter customer's WhatsApp number (e.g. 03001234567) to send bill & PDF:`,
        {
          placeholder: '03001234567',
          confirmText: 'Send via WhatsApp',
          cancelText: 'Skip (Select Contact)',
          alertType: 'info'
        }
      );
      if (enteredPhone && enteredPhone.trim()) {
        targetPhone = enteredPhone.trim();
      }
    }

    const html = this.generateA4InvoiceHtml(invoice, storeSettings);
    let filePath: string | undefined;

    if (typeof window !== 'undefined' && (window as any).electronAPI?.generateInvoicePdf) {
      try {
        const res = await (window as any).electronAPI.generateInvoicePdf({
          html,
          invoiceNumber: invoice.invoice_number
        });
        if (res && res.success) {
          filePath = res.filePath;
        }
      } catch (e) {
        console.warn('[InvoicePdfService] PDF generation notice:', e);
      }
    }

    const cleanPhone = this.sanitizePhone(targetPhone);
    const storeName = storeSettings.store_name || 'Point of Sale';
    const totalFormatted = `PKR ${Number(invoice.total_amount).toLocaleString()}`;
    const itemsCount = (invoice.items || []).length;

    const message = [
      `*${storeName.toUpperCase()} — SALES INVOICE*`,
      `Assalam-o-Alaikum ${invoice.customer_name || 'Valued Customer'}!`,
      `Thank you for shopping with us.`,
      ``,
      `*Bill #:* #${invoice.invoice_number}`,
      `*Items:* ${itemsCount}`,
      `*Net Payable:* ${totalFormatted}`,
      `*Mode:* ${invoice.payment_mode.toUpperCase()}`,
      ``,
      filePath ? `Official A4 invoice PDF has been saved.` : ``,
      `Helpline: ${storeSettings.phone || '+92 306 5157506'}`
    ].filter(Boolean).join('\n');

    if (filePath) {
      try {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(filePath);
        }
      } catch {}
    }

    this.dispatchWhatsApp(cleanPhone, message);

    return {
      success: true,
      filePath,
      whatsappUrl: cleanPhone ? `https://web.whatsapp.com/send?phone=${cleanPhone}` : '',
      cleanPhone
    };
  },

  generateA4KhataStatementHtml(
    customer: Customer,
    storeSettings: StoreSettings,
    transactions: CustomerTransaction[] = [],
    periodInvoices: (Invoice & { items: InvoiceItem[] })[] = []
  ): string {
    const dateStr = new Date().toLocaleDateString('en-PK', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    const timeStr = new Date().toLocaleTimeString('en-PK', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const storeName = storeSettings.store_name || 'POINT OF SALE';
    const storeAddress = storeSettings.address || 'Pakistan';
    const storePhone = storeSettings.phone || '';

    const balanceDue = Number(customer.current_balance || 0);
    const advanceWallet = Number(customer.amanat_balance || 0);

    // Build map of invoices for instant lookup of items and bill details
    const invoiceMap = new Map<string, Invoice & { items: InvoiceItem[] }>();
    periodInvoices.forEach(inv => {
      if (inv.id) invoiceMap.set(inv.id, inv);
      if (inv.invoice_number) invoiceMap.set(inv.invoice_number, inv);
    });

    interface UnifiedLedgerRow {
      date: string;
      rawDate: number;
      label: string;
      billNumber: string;
      itemCount: number;
      notes: string;
      debit: number;
      credit: number;
      balanceAfter: number;
    }

    const unifiedRows: UnifiedLedgerRow[] = [];

    if (transactions && transactions.length > 0) {
      // Sort transactions oldest to newest for clear chronological accounting ledger
      const sortedTx = [...transactions].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      sortedTx.forEach(tx => {
        const d = new Date(tx.created_at);
        const dStr = d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
        const tStr = d.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });

        let matchedInv = tx.invoice_id ? invoiceMap.get(tx.invoice_id) : undefined;
        if (!matchedInv && tx.notes) {
          for (const [key, inv] of invoiceMap.entries()) {
            if (tx.notes.includes(key) || (inv.invoice_number && tx.notes.includes(inv.invoice_number))) {
              matchedInv = inv;
              break;
            }
          }
        }

        const itemCount = (matchedInv?.items || []).length;

        let debit = 0;
        let credit = 0;
        let label = '';

        switch (tx.type) {
          case 'CREDIT_SALE':
            debit = Number(tx.amount || 0);
            label = 'Credit Purchase (ادھار خریداری)';
            break;
          case 'PAYMENT':
            credit = Number(tx.amount || 0);
            label = 'Cash Payment Received (وصول رقم نقد)';
            break;
          case 'OPENING_BALANCE':
            debit = Number(tx.amount || 0);
            label = 'Opening Balance Forwarded (سابقہ ادھار کھاتہ)';
            break;
          case 'SETTLEMENT_DISCOUNT':
            credit = Number(tx.amount || 0);
            label = 'Settlement Discount Concession (رعایت)';
            break;
          case 'AMANAT_DEPOSIT':
            credit = Number(tx.amount || 0);
            label = 'Advance Deposit to Amanat (امانت جمع)';
            break;
          case 'AMANAT_DEDUCTION':
            debit = Number(tx.amount || 0);
            label = 'Deducted from Amanat (امانت سے کٹوتی)';
            break;
          case 'RETURN_CREDIT':
            credit = Number(tx.amount || 0);
            label = 'Goods Return Credit (واپسی مال کریڈٹ)';
            break;
          default:
            label = tx.type.replace(/_/g, ' ');
            debit = Number(tx.amount || 0);
            break;
        }

        unifiedRows.push({
          date: `${dStr} ${tStr}`,
          rawDate: d.getTime(),
          label,
          billNumber: matchedInv?.invoice_number || (tx.notes?.match(/MRS-[A-Za-z0-9-]+/)?.[0]) || '-',
          itemCount,
          notes: tx.notes || '',
          debit,
          credit,
          balanceAfter: Number(tx.balance_after || 0)
        });
      });
    } else if (periodInvoices && periodInvoices.length > 0) {
      let running = 0;
      const sortedInvs = [...periodInvoices].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      sortedInvs.forEach(inv => {
        const d = new Date(inv.created_at);
        const dStr = d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
        const tStr = d.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });
        const amt = Number(inv.total_amount || 0);
        running += amt;

        unifiedRows.push({
          date: `${dStr} ${tStr}`,
          rawDate: d.getTime(),
          label: 'Credit Purchase (ادھار خریداری)',
          billNumber: inv.invoice_number,
          itemCount: (inv.items || []).length,
          notes: '',
          debit: amt,
          credit: 0,
          balanceAfter: running
        });
      });
    }

    // Collect all invoices that have items for detailed itemized tables
    const invoicesWithItems: (Invoice & { items: InvoiceItem[] })[] = [];
    const seenInvIds = new Set<string>();

    periodInvoices.forEach(inv => {
      if (inv.items && inv.items.length > 0 && !seenInvIds.has(inv.invoice_number || inv.id)) {
        seenInvIds.add(inv.invoice_number || inv.id);
        invoicesWithItems.push(inv);
      }
    });

    for (const [_, inv] of invoiceMap.entries()) {
      if (inv.items && inv.items.length > 0 && !seenInvIds.has(inv.invoice_number || inv.id)) {
        seenInvIds.add(inv.invoice_number || inv.id);
        invoicesWithItems.push(inv);
      }
    }

    const totalDebits = unifiedRows.reduce((s, r) => s + r.debit, 0);
    const totalCredits = unifiedRows.reduce((s, r) => s + r.credit, 0);

    const ledgerRowsHtml = unifiedRows.map((r, idx) => `
      <tr style="border-bottom: 1px solid #e2e8f0; background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
        <td style="padding: 7px 8px; text-align: center; color: #64748b; font-size: 8.5pt;">${idx + 1}</td>
        <td style="padding: 7px 8px; font-size: 8.5pt; color: #0f172a; white-space: nowrap;">${r.date}</td>
        <td style="padding: 7px 8px; font-size: 9pt;">
          <div style="font-weight: 700; color: #0f172a;">${r.label}</div>
          ${r.itemCount > 0 ? `
            <div style="font-size: 8pt; color: #0284c7; font-weight: 700; margin-top: 2px;">
              • ${r.itemCount} Items Purchased (See details in item breakdown below)
            </div>
          ` : ''}
          ${r.notes ? `
            <div style="font-size: 7.5pt; color: #64748b; font-style: italic; margin-top: 1px;">
              ${r.notes}
            </div>
          ` : ''}
        </td>
        <td style="padding: 7px 8px; text-align: center; font-family: monospace; font-weight: 700; color: #0f172a; font-size: 8.5pt;">
          ${r.billNumber !== '-' ? `#${r.billNumber}` : '-'}
        </td>
        <td style="padding: 7px 8px; text-align: right; font-weight: 700; font-size: 9pt; color: ${r.debit > 0 ? '#b91c1c' : '#94a3b8'};">
          ${r.debit > 0 ? `Rs. ${r.debit.toLocaleString()}` : '-'}
        </td>
        <td style="padding: 7px 8px; text-align: right; font-weight: 700; font-size: 9pt; color: ${r.credit > 0 ? '#15803d' : '#94a3b8'};">
          ${r.credit > 0 ? `Rs. ${r.credit.toLocaleString()}` : '-'}
        </td>
        <td style="padding: 7px 8px; text-align: right; font-family: monospace; font-weight: 800; font-size: 9pt; color: #0f172a;">
          Rs. ${r.balanceAfter.toLocaleString()}
        </td>
      </tr>
    `).join('');

    const itemBreakdownHtml = invoicesWithItems.length > 0 ? `
      <div style="margin-top: 22px; page-break-inside: auto;">
        <div style="background: #0f172a; color: #ffffff; padding: 7px 12px; font-weight: 800; font-size: 9.5pt; border-radius: 4px 4px 0 0; text-transform: uppercase; letter-spacing: 0.5px;">
          Detailed Purchase & Items Breakdown (تفصیل اشیاء بل جات)
        </div>
        ${invoicesWithItems.map(inv => {
          const invDate = new Date(inv.created_at).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
          const invTime = new Date(inv.created_at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });
          return `
            <div style="margin-top: 12px; border: 1.5px solid #cbd5e1; border-radius: 6px; overflow: hidden; page-break-inside: avoid;">
              <div style="background: #334155; color: #ffffff; padding: 6px 10px; font-size: 9pt; font-weight: 700; display: flex; justify-content: space-between; align-items: center;">
                <span>Bill #${inv.invoice_number} &nbsp;•&nbsp; Date: ${invDate} ${invTime} &nbsp;•&nbsp; Cashier: ${inv.cashier_name || 'Cashier'}</span>
                <span>Bill Total: Rs. ${Number(inv.total_amount).toLocaleString()} (${(inv.items || []).length} Items)</span>
              </div>
              <table style="width: 100%; border-collapse: collapse; font-size: 8.5pt;">
                <thead>
                  <tr style="background: #f1f5f9; color: #334155; border-bottom: 1px solid #cbd5e1; text-align: left; font-size: 8pt; text-transform: uppercase;">
                    <th style="padding: 5px 8px; width: 35px; text-align: center;">#</th>
                    <th style="padding: 5px 8px;">Item Description</th>
                    <th style="padding: 5px 8px; width: 75px; text-align: center;">Qty</th>
                    <th style="padding: 5px 8px; width: 90px; text-align: right;">Unit Rate</th>
                    <th style="padding: 5px 8px; width: 100px; text-align: right;">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${(inv.items || []).map((it, idx) => `
                    <tr style="border-bottom: 1px solid #e2e8f0; background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                      <td style="padding: 5px 8px; text-align: center; color: #64748b; font-size: 8pt;">${idx + 1}</td>
                      <td style="padding: 5px 8px; font-weight: 600; color: #0f172a;">${it.product_name}</td>
                      <td style="padding: 5px 8px; text-align: center; font-weight: 700; color: #0f172a;">${it.qty} ${it.unit_label || ''}</td>
                      <td style="padding: 5px 8px; text-align: right; color: #334155;">Rs. ${Number(it.unit_price).toLocaleString()}</td>
                      <td style="padding: 5px 8px; text-align: right; font-weight: 700; color: #0f172a;">Rs. ${Number(it.subtotal).toLocaleString()}</td>
                    </tr>
                  `).join('')}
                </tbody>
                <tfoot>
                  <tr style="background: #f8fafc; font-weight: 800; border-top: 1.5px solid #cbd5e1;">
                    <td colspan="4" style="padding: 6px 8px; text-align: right; color: #334155;">Bill #${inv.invoice_number} Total Payable:</td>
                    <td style="padding: 6px 8px; text-align: right; color: #0f172a; font-size: 9pt;">Rs. ${Number(inv.total_amount).toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          `;
        }).join('')}
      </div>
    ` : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Khata Statement - ${customer.name}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 14mm;
    }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 0;
      line-height: 1.35;
      font-size: 9.5pt;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .statement-card { width: 100%; background: #ffffff; }
    .header-table { width: 100%; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
    .store-name { font-size: 19pt; font-weight: 900; letter-spacing: -0.5px; color: #0f172a; text-transform: uppercase; margin: 0; }
    .statement-title-badge { display: inline-block; background: #0f172a; color: #ffffff; padding: 4px 10px; font-weight: 800; font-size: 10.5pt; letter-spacing: 0.5px; border-radius: 4px; text-transform: uppercase; margin-top: 4px; }
    .info-grid { width: 100%; margin-bottom: 14px; border-collapse: separate; border-spacing: 8px 0; }
    .info-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 9px 12px; vertical-align: top; }
    .balance-box { background: #fef2f2; border: 1.5px solid #f87171; border-radius: 6px; padding: 9px 12px; text-align: right; vertical-align: top; }
    .balance-amount { font-size: 17pt; font-weight: 900; color: #b91c1c; margin-top: 3px; font-family: monospace; }
    .ledger-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    .ledger-table th { background: #0f172a; color: #ffffff; font-size: 8.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; padding: 7px 8px; border-top: 1px solid #0f172a; border-bottom: 1px solid #0f172a; }
    .footer-box { margin-top: 16px; border-top: 1.5px solid #0f172a; padding-top: 10px; font-size: 8.5pt; color: #64748b; }
    .watermark { margin-top: 12px; text-align: center; font-family: monospace; font-weight: 700; font-size: 8pt; letter-spacing: 1px; color: #0f172a; border-top: 1px dashed #cbd5e1; padding-top: 6px; }
  </style>
</head>
<body>
  <div class="statement-card">
    <table class="header-table">
      <tr>
        <td style="vertical-align: top;">
          <h1 class="store-name">${storeName}</h1>
          <div style="font-size: 9pt; color: #475569; font-weight: 600; margin-top: 1px;">
            ${storeSettings.tagline || 'GENERAL STORE & GROCERY'}
          </div>
          <div style="font-size: 8.5pt; color: #64748b; margin-top: 3px;">
            ${storeAddress}
          </div>
          <div style="font-size: 8.5pt; color: #64748b; font-weight: 600;">
            Helpline: ${storePhone} ${storeSettings.whatsapp_number ? `• WhatsApp: ${storeSettings.whatsapp_number}` : ''}
          </div>
        </td>
        <td style="text-align: right; vertical-align: top;">
          <div class="statement-title-badge">KHATA ACCOUNT STATEMENT (کھاتہ لیجر)</div>
          <div style="font-size: 9pt; font-weight: 700; color: #0f172a; margin-top: 6px;">
            STATEMENT DATE: ${dateStr}
          </div>
          <div style="font-size: 8pt; color: #64748b;">
            PRINTED AT: ${timeStr}
          </div>
          <div style="font-size: 8pt; font-family: monospace; color: #64748b; margin-top: 2px;">
            ACCOUNT: #${customer.account_no || customer.id.slice(0, 8).toUpperCase()}
          </div>
        </td>
      </tr>
    </table>

    <table class="info-grid">
      <tr>
        <td class="info-box" style="width: 55%;">
          <div style="font-size: 8pt; font-weight: 800; color: #64748b; text-transform: uppercase;">Customer Ledger Details (کھاتہ دار تفصیل)</div>
          <div style="font-size: 12pt; font-weight: 900; color: #0f172a; margin-top: 2px;">${customer.name}</div>
          <div style="font-size: 9pt; color: #334155; margin-top: 2px;">
            <strong>WhatsApp / Mobile:</strong> ${customer.phone || 'N/A'}
          </div>
          <div style="font-size: 8.5pt; color: #64748b; margin-top: 1px;">
            <strong>Address / Mohalla:</strong> ${customer.address || 'Local Mohalla Resident'}
          </div>
          <div style="font-size: 8.5pt; color: #64748b; margin-top: 1px;">
            <strong>Credit Limit (حدِ ادھار):</strong> Rs. ${Number(customer.credit_limit || 0).toLocaleString()}
          </div>
        </td>
        <td class="balance-box" style="width: 45%;">
          <div style="font-size: 8pt; font-weight: 800; color: #991b1b; text-transform: uppercase;">Current Net Outstanding (کل واجب الادا رقم)</div>
          <div class="balance-amount">Rs. ${balanceDue.toLocaleString()}</div>
          ${advanceWallet > 0 ? `<div style="font-size: 8.5pt; font-weight: 700; color: #16a34a; margin-top: 3px;">Advance Deposit (امانت): Rs. ${advanceWallet.toLocaleString()}</div>` : ''}
          <div style="font-size: 8pt; color: #64748b; margin-top: 4px;">
            Account Status: <strong>${balanceDue > 0 ? 'PAYMENT DUE (ادائیگی واجب الادا)' : 'BALANCED (کھاتہ صاف)'}</strong>
          </div>
        </td>
      </tr>
    </table>

    <!-- CHRONOLOGICAL UNIFIED STATEMENT TABLE -->
    <table class="ledger-table">
      <thead>
        <tr>
          <th style="width: 25px; text-align: center;">#</th>
          <th style="width: 95px;">Date & Time<br/><span style="font-size: 7pt; font-weight: normal; opacity: 0.85;">تاریخ و وقت</span></th>
          <th>Particulars & Item Details<br/><span style="font-size: 7pt; font-weight: normal; opacity: 0.85;">تفصیلات، اشیاء و نوعیت لین دین</span></th>
          <th style="width: 100px; text-align: center;">Bill / Ref #<br/><span style="font-size: 7pt; font-weight: normal; opacity: 0.85;">بل نمبر</span></th>
          <th style="width: 85px; text-align: right; color: #fca5a5;">Debit (Udhaar +)<br/><span style="font-size: 7pt; font-weight: normal; opacity: 0.85;">ادھار رقم</span></th>
          <th style="width: 85px; text-align: right; color: #86efac;">Credit (Paid -)<br/><span style="font-size: 7pt; font-weight: normal; opacity: 0.85;">وصول رقم</span></th>
          <th style="width: 90px; text-align: right;">Balance<br/><span style="font-size: 7pt; font-weight: normal; opacity: 0.85;">میزان بقایا</span></th>
        </tr>
      </thead>
      <tbody>
        ${ledgerRowsHtml || '<tr><td colspan="7" style="padding: 16px; text-align: center; color: #94a3b8;">No transactions found in this period.</td></tr>'}
      </tbody>
    </table>

    <!-- RECONCILIATION SUMMARY AUDIT BOX -->
    <table style="width: 100%; border-collapse: collapse; margin-top: 10px; border: 1.5px solid #0f172a; border-radius: 6px; overflow: hidden;">
      <tr style="background: #0f172a; color: #ffffff; font-weight: 800; font-size: 8.5pt;">
        <td colspan="2" style="padding: 6px 12px; text-transform: uppercase; letter-spacing: 0.5px;">
          ACCOUNT LEDGER RECONCILIATION SUMMARY (کھاتہ خلاصہ و حتمی حساب کتاب)
        </td>
      </tr>
      <tr style="background: #f8fafc; border-bottom: 1px solid #cbd5e1; font-size: 8.5pt;">
        <td style="padding: 5px 12px; color: #334155;">Total Purchases & Debits Added (کل ادھار خریداری):</td>
        <td style="padding: 5px 12px; text-align: right; font-weight: 700; color: #b91c1c;">+Rs. ${totalDebits.toLocaleString()}</td>
      </tr>
      <tr style="background: #ffffff; border-bottom: 1px solid #cbd5e1; font-size: 8.5pt;">
        <td style="padding: 5px 12px; color: #334155;">Total Payments & Credits Deducted (کل وصول شدہ رقم):</td>
        <td style="padding: 5px 12px; text-align: right; font-weight: 700; color: #15803d;">-Rs. ${totalCredits.toLocaleString()}</td>
      </tr>
      <tr style="background: #fef2f2; font-size: 10.5pt; font-weight: 900;">
        <td style="padding: 7px 12px; color: #991b1b; text-transform: uppercase;">
          FINAL NET OUTSTANDING BALANCE (خالص واجب الادا رقم):
        </td>
        <td style="padding: 7px 12px; text-align: right; font-family: monospace; color: #b91c1c; font-size: 11.5pt;">
          Rs. ${balanceDue.toLocaleString()}
        </td>
      </tr>
    </table>

    ${itemBreakdownHtml}

    <div class="footer-box">
      <table style="width: 100%;">
        <tr>
          <td style="vertical-align: top; width: 65%;">
            <div style="font-weight: 800; color: #0f172a; margin-bottom: 2px; text-transform: uppercase;">Settlement & Payment Instructions (ہدایات برائے ادائیگی)</div>
            <div>• Please deposit outstanding dues at the store cash counter or via mobile payment.</div>
            <div>• <strong>Easypaisa / JazzCash:</strong> ${storeSettings.easypaisa_number || storeSettings.phone || '0306-5157506'} (Account: ${storeName})</div>
            <div>• Please notify counter after digital transfer to receive instant payment receipt.</div>
          </td>
          <td style="vertical-align: bottom; text-align: right; width: 35%;">
            <div style="border-top: 1px solid #94a3b8; width: 140px; margin-left: auto; text-align: center; padding-top: 4px; font-weight: 700; color: #334155;">
              Authorized Signature
            </div>
          </td>
        </tr>
      </table>

      <div class="watermark">
        DEVELOPED AND MAINTAINED BY TEDDOPS • +92 329 7263098 • +92 323 5930559 • ISLAMABAD, PAKISTAN
      </div>
    </div>
  </div>
</body>
</html>`;
  },

  async generateAndShareKhataStatement(
    customer: Customer,
    storeSettings: StoreSettings,
    transactions: CustomerTransaction[] = [],
    periodInvoices: (Invoice & { items: InvoiceItem[] })[] = [],
    customPhone?: string
  ): Promise<{
    success: boolean;
    filePath?: string;
    whatsappUrl: string;
    cleanPhone: string;
  }> {
    let targetPhone = customPhone || customer.phone || '';
    if (!targetPhone || !targetPhone.trim() || targetPhone.trim() === '03000000000') {
      const enteredPhone = await posPrompt(
        'Customer WhatsApp Number',
        `No phone number recorded for ${customer.name || 'this customer'}.\n\nEnter customer's WhatsApp number (e.g. 03001234567) to send statement:`,
        {
          placeholder: '03001234567',
          confirmText: 'Send Statement',
          cancelText: 'Skip (Select Contact)',
          alertType: 'info'
        }
      );
      if (enteredPhone && enteredPhone.trim()) {
        targetPhone = enteredPhone.trim();
      }
    }

    const html = this.generateA4KhataStatementHtml(customer, storeSettings, transactions, periodInvoices);
    let filePath: string | undefined;

    const safeCustName = (customer.name || 'Customer').replace(/[^a-zA-Z0-9]/g, '_');
    const statementId = `Khata_Statement_${safeCustName}_${Date.now()}`;

    if (typeof window !== 'undefined' && (window as any).electronAPI?.generateInvoicePdf) {
      try {
        const res = await (window as any).electronAPI.generateInvoicePdf({
          html,
          invoiceNumber: statementId
        });
        if (res && res.success) {
          filePath = res.filePath;
        }
      } catch (e) {
        console.warn('[InvoicePdfService] Khata PDF generation notice:', e);
      }
    }

    const cleanPhone = this.sanitizePhone(targetPhone);
    const storeName = storeSettings.store_name || 'Point of Sale';
    const balanceDueFormatted = `PKR ${Number(customer.current_balance || 0).toLocaleString()}`;
    const today = new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });

    const message = [
      `*${storeName.toUpperCase()} — KHATA STATEMENT*`,
      `Assalam-o-Alaikum ${customer.name}!`,
      ``,
      `Your official account statement PDF has been generated.`,
      `*Customer:* ${customer.name}`,
      `*Current Net Due:* ${balanceDueFormatted}`,
      `*Statement Date:* ${today}`,
      ``,
      filePath ? `Official A4 statement PDF has been saved.` : ``,
      `Store Helpline: ${storeSettings.phone || '+92 306 5157506'}`
    ].filter(Boolean).join('\n');

    if (filePath) {
      try {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(filePath);
        }
      } catch {}
    }

    this.dispatchWhatsApp(cleanPhone, message);

    return {
      success: true,
      filePath,
      whatsappUrl: cleanPhone ? `https://web.whatsapp.com/send?phone=${cleanPhone}` : '',
      cleanPhone
    };
  }
};

