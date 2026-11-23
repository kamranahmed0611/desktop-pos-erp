import { sqlDb } from '../db/sqlite';
import { Invoice, InvoiceItem, PaymentMode, StoreSettings } from '../types';

export interface RetroactiveItemInput {
  name: string;
  qty: number;
  unit_price: number;
  subtotal: number;
}

export interface CreateRetroactiveBillParams {
  invoice_number?: string;
  custom_date: string; // ISO string e.g. "2026-10-14T15:30:00"
  customer_name?: string;
  customer_phone?: string;
  items: RetroactiveItemInput[];
  discount_amount?: number;
  paid_amount?: number;
  payment_mode: PaymentMode;
  deduct_inventory: boolean; // Default FALSE per client emergency requirements
  add_to_drawer?: boolean; // If true, adds cash to active shift drawer; if false, shift neutral
  cashier_name?: string;
  notes?: string;
}

/**
 * Emergency Retroactive Digital Receipt Generator Service
 * Specifically designed for the client's pending bills backlog.
 * - Freeform item entry
 * - Optional inventory deduction toggle
 * - Shift-neutral (does not corrupt today's active drawer cash)
 * - 1-Click WhatsApp HD PNG & PDF dispatch
 */
export const emergencyBillService = {
  async generateNextInvoiceNumber(dateStr: string): Promise<string> {
    const d = new Date(dateStr);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const prefix = `MRS-${yyyy}${mm}${dd}-`;

    const rows = await sqlDb.query<{ invoice_number: string }>(
      'SELECT invoice_number FROM invoices WHERE invoice_number LIKE ?',
      [`${prefix}%`]
    );

    let maxNum = 0;
    for (const r of rows) {
      if (r.invoice_number) {
        const parts = r.invoice_number.split('-');
        const lastPart = parts[parts.length - 1];
        const parsed = parseInt(lastPart, 10);
        if (!isNaN(parsed) && parsed > maxNum) {
          maxNum = parsed;
        }
      }
    }

    let nextSeq = maxNum + 1;
    let candidate = `${prefix}${String(nextSeq).padStart(4, '0')}`;

    let existing = await sqlDb.get<{ id: string }>(
      'SELECT id FROM invoices WHERE invoice_number = ? LIMIT 1',
      [candidate]
    );
    while (existing) {
      nextSeq++;
      candidate = `${prefix}${String(nextSeq).padStart(4, '0')}`;
      existing = await sqlDb.get<{ id: string }>(
        'SELECT id FROM invoices WHERE invoice_number = ? LIMIT 1',
        [candidate]
      );
    }

    return candidate;
  },

  async createRetroactiveInvoice(params: CreateRetroactiveBillParams): Promise<Invoice> {
    const invoiceId = `inv-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    let invoiceNumber = params.invoice_number?.trim();

    // Check if provided invoice number already exists to prevent UNIQUE constraint crash
    if (!invoiceNumber) {
      invoiceNumber = await this.generateNextInvoiceNumber(params.custom_date);
    } else {
      const existing = await sqlDb.get<{ id: string }>(
        'SELECT id FROM invoices WHERE invoice_number = ? LIMIT 1',
        [invoiceNumber]
      );
      if (existing) {
        invoiceNumber = await this.generateNextInvoiceNumber(params.custom_date);
      }
    }

    const grossTotal = params.items.reduce((sum, it) => sum + (it.unit_price * it.qty), 0);
    const discount = params.discount_amount || 0;
    const netPayable = Math.max(0, grossTotal - discount);

    // Cash rounding logic to nearest Rs. 5
    let finalPayable = netPayable;
    let roundOff = 0;
    if (params.payment_mode === 'cash') {
      const remainder = netPayable % 5;
      if (remainder !== 0) {
        if (remainder >= 2.5) {
          finalPayable = netPayable + (5 - remainder);
          roundOff = 5 - remainder;
        } else {
          finalPayable = netPayable - remainder;
          roundOff = -remainder;
        }
      }
    }

    const paid = params.paid_amount !== undefined ? params.paid_amount : finalPayable;
    const change = Math.max(0, paid - finalPayable);

    // 1. Insert Invoice
    await sqlDb.execute(`
      INSERT INTO invoices (
        id, invoice_number, customer_name, customer_phone,
        total_amount, tax_amount, discount_amount, paid_amount, change_due, round_off_amount,
        payment_mode, cashier_name, is_retroactive, inventory_deducted, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, 0.0, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `, [
      invoiceId,
      invoiceNumber,
      params.customer_name || 'Walk-in Customer',
      params.customer_phone || '',
      finalPayable,
      discount,
      paid,
      change,
      roundOff,
      params.payment_mode,
      params.cashier_name || 'Owner / Cashier',
      params.deduct_inventory ? 1 : 0,
      params.notes || 'Retroactive emergency digital bill',
      params.custom_date
    ]);

    // 2. Insert Items
    const createdItems: InvoiceItem[] = [];
    for (const it of params.items) {
      const itemId = `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const existingProd = await sqlDb.get<{ id: string }>('SELECT id FROM products WHERE name = ? LIMIT 1', [it.name]);
      const prodId = existingProd ? existingProd.id : 'ad-hoc-item';

      await sqlDb.execute(`
        INSERT INTO invoice_items (
          id, invoice_id, product_id, product_name, qty, unit_cost, unit_price, discount_amount, tax_amount, subtotal
        ) VALUES (?, ?, ?, ?, ?, 0.0, ?, 0.0, 0.0, ?)
      `, [
        itemId,
        invoiceId,
        prodId,
        it.name,
        it.qty,
        it.unit_price,
        it.qty * it.unit_price
      ]);

      createdItems.push({
        id: itemId,
        invoice_id: invoiceId,
        product_id: prodId,
        product_name: it.name,
        qty: it.qty,
        unit_cost: 0,
        unit_price: it.unit_price,
        discount_amount: 0,
        tax_amount: 0,
        subtotal: it.qty * it.unit_price
      });

      // 3. Optional Inventory Decrement if operator toggled it ON
      if (params.deduct_inventory) {
        try {
          await sqlDb.execute(`
            UPDATE products SET stock_qty = MAX(0, stock_qty - ?)
            WHERE name = ? OR sku = ? OR barcode = ?
          `, [it.qty, it.name, it.name, it.name]);
        } catch (e) {
          console.warn('[EmergencyBillService] Notice updating stock for item:', it.name, e);
        }
      }
    }

    // 4. Linkage to Active Shift Cash Register Drawer if requested
    if (params.add_to_drawer && params.payment_mode === 'cash') {
      try {
        await sqlDb.execute(`
          UPDATE shifts SET
            total_sales_cash = total_sales_cash + ?,
            expected_cash = expected_cash + ?
          WHERE status = 'OPEN'
        `, [finalPayable, finalPayable]);
      } catch (e) {
        console.warn('[EmergencyBillService] Notice updating open shift cash drawer:', e);
      }
    }

    return {
      id: invoiceId,
      invoice_number: invoiceNumber,
      customer_name: params.customer_name || 'Walk-in Customer',
      customer_phone: params.customer_phone || '',
      total_amount: finalPayable,
      tax_amount: 0,
      discount_amount: discount,
      paid_amount: paid,
      change_due: change,
      round_off_amount: roundOff,
      payment_mode: params.payment_mode,
      cashier_name: params.cashier_name || 'Owner / Cashier',
      is_retroactive: true,
      inventory_deducted: params.deduct_inventory,
      notes: params.notes,
      created_at: params.custom_date,
      items: createdItems
    };
  },

  async getRecentInvoices(limit = 40): Promise<Invoice[]> {
    const invoices = await sqlDb.query<Invoice>(`
      SELECT * FROM invoices ORDER BY created_at DESC LIMIT ?
    `, [limit]);

    for (const inv of invoices) {
      inv.items = await sqlDb.query<InvoiceItem>(`
        SELECT * FROM invoice_items WHERE invoice_id = ?
      `, [inv.id]);
    }
    return invoices;
  },

  formatWhatsAppText(inv: Invoice, store: StoreSettings): string {
    const itemsList = (inv.items || [])
      .map((it, idx) => `${idx + 1}. *${it.product_name}*\n   ${it.qty} x Rs. ${it.unit_price.toLocaleString()} = *Rs. ${it.subtotal.toLocaleString()}*`)
      .join('\n');

    const formattedDate = new Date(inv.created_at).toLocaleString('en-PK', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    return [
      `🛒 *${store.store_name}*`,
      `📍 ${store.address}`,
      `📞 Ph: ${store.phone}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `🧾 *TAX INVOICE / DIGITAL BILL*`,
      `🔢 *Invoice #:* ${inv.invoice_number}`,
      `📅 *Date:* ${formattedDate}`,
      `👤 *Customer:* ${inv.customer_name || 'Valued Customer'}`,
      inv.customer_phone ? `📱 *Phone:* ${inv.customer_phone}` : '',
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `*ITEMS PURCHASED:*`,
      itemsList,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      inv.discount_amount > 0 ? `🏷️ *Discount:* -Rs. ${inv.discount_amount.toLocaleString()}` : '',
      inv.round_off_amount !== 0 ? `⚖️ *Round-off:* ${inv.round_off_amount > 0 ? '+' : ''}Rs. ${inv.round_off_amount}` : '',
      `⭐ *TOTAL PAYABLE: Rs. ${inv.total_amount.toLocaleString()}*`,
      `💵 *Paid:* Rs. ${inv.paid_amount.toLocaleString()} | *Change:* Rs. ${inv.change_due.toLocaleString()}`,
      `💳 *Payment Method:* ${inv.payment_mode.toUpperCase()}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `🙏 *${store.receipt_footer_urdu}*`,
      `✨ ${store.receipt_footer_english}`,
      store.store_name || 'Point of Sale',
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `🛠️ *Developed and maintained by Teddops*`,
      `📞 +923297263098 • +923235930559`
    ].filter(Boolean).join('\n');
  }
};
