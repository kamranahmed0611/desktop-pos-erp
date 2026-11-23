import { sqlDb } from '../db/sqlite';
import { CartItem, Invoice, InvoiceItem, PaymentMode } from '../types';

export interface CheckoutParams {
  cart: CartItem[];
  customer_id?: string;
  customer_name?: string;
  customer_phone?: string;
  payment_mode: PaymentMode;
  paid_amount: number;
  discount_amount: number;
  cashier_id: string;
  cashier_name: string;
  shift_id?: string;
  split_khata_amount?: number; // For partial cash + partial khata split tender
  amanat_used?: number; // Advance security deposit wallet auto-deduction
  notes?: string;
}

export const billingService = {
  async generateNextInvoiceNumber(customDate?: string | Date): Promise<string> {
    const d = customDate ? new Date(customDate) : new Date();
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
        // Extract trailing numeric sequence
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

    // Collision-proof database existence guard loop
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

  async processCheckout(params: CheckoutParams): Promise<Invoice> {
    if (!params.cart || params.cart.length === 0) {
      throw new Error('Cannot checkout with an empty cart.');
    }

    const invoiceId = `inv-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const invoiceNumber = await this.generateNextInvoiceNumber();
    const createdAt = new Date().toISOString();

    const grossTotal = params.cart.reduce((sum, item) => sum + item.subtotal, 0);
    const totalTax = params.cart.reduce((sum, item) => sum + (item.tax_amount || 0), 0);
    const discount = params.discount_amount || 0;
    const netBeforeRounding = Math.max(0, grossTotal + totalTax - discount);

    // Apply Amanat deduction if requested
    const amanatUsed = Math.min(params.amanat_used || 0, netBeforeRounding);
    const netAfterAmanat = Math.max(0, netBeforeRounding - amanatUsed);

    // Apply Rs. 5 rounding only on physical cash tender
    let finalPayable = netAfterAmanat;
    let roundOff = 0;
    if (params.payment_mode === 'cash') {
      const remainder = netAfterAmanat % 5;
      if (remainder !== 0) {
        if (remainder >= 2.5) {
          finalPayable = netAfterAmanat + (5 - remainder);
          roundOff = 5 - remainder;
        } else {
          finalPayable = netAfterAmanat - remainder;
          roundOff = -remainder;
        }
      }
    }

    const paid = params.paid_amount || finalPayable;
    const change = Math.max(0, paid - finalPayable);

    // Prepare atomic transaction statements
    const statements: { sql: string; params?: any[] }[] = [];

    // 1. Insert Invoice
    statements.push({
      sql: `
        INSERT INTO invoices (
          id, invoice_number, customer_id, customer_name, customer_phone,
          total_amount, tax_amount, discount_amount, paid_amount, change_due, round_off_amount,
          payment_mode, cashier_id, cashier_name, shift_id, is_retroactive, inventory_deducted, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)
      `,
      params: [
        invoiceId,
        invoiceNumber,
        params.customer_id || null,
        params.customer_name || 'Walk-in Customer',
        params.customer_phone || '',
        finalPayable,
        totalTax,
        discount,
        paid,
        change,
        roundOff,
        params.payment_mode,
        params.cashier_id,
        params.cashier_name,
        params.shift_id || null,
        params.notes || '',
        createdAt
      ]
    });

    // 2. Insert Invoice Items & Decrement Stock
    const createdItems: InvoiceItem[] = [];
    for (const item of params.cart) {
      const itemId = `it-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const finalUnitLabel = item.unit_label || (item.is_subunit_sale ? item.product.sale_unit : item.product.base_unit) || '';
      statements.push({
        sql: `
          INSERT INTO invoice_items (
            id, invoice_id, product_id, product_name, qty, unit_cost, unit_price, discount_amount, tax_amount, subtotal, unit_label
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        params: [
          itemId,
          invoiceId,
          item.product.id,
          item.product.name,
          item.qty,
          item.product.cost_price,
          item.unit_price,
          item.discount_amount || 0,
          item.tax_amount || 0,
          item.subtotal,
          finalUnitLabel
        ]
      });

      // Stock decrement: uses deduct_qty if sold in loose subunit (e.g. 6 eggs / 30 = 0.2 tray), otherwise item.qty
      const deductQty = typeof item.deduct_qty === 'number' ? item.deduct_qty : item.qty;
      statements.push({
        sql: 'UPDATE products SET stock_qty = MAX(0, stock_qty - ?) WHERE id = ?',
        params: [deductQty, item.product.id]
      });

      createdItems.push({
        id: itemId,
        invoice_id: invoiceId,
        product_id: item.product.id,
        product_name: item.product.name,
        qty: item.qty,
        unit_cost: item.product.cost_price,
        unit_price: item.unit_price,
        discount_amount: item.discount_amount || 0,
        tax_amount: item.tax_amount || 0,
        subtotal: item.subtotal,
        unit_label: finalUnitLabel,
        is_subunit_sale: item.is_subunit_sale
      });
    }

    // 3. Customer Khata update if credit or split-khata
    const khataAmount = params.payment_mode === 'khata' ? finalPayable : (params.split_khata_amount || 0);
    if (khataAmount > 0 && params.customer_id) {
      statements.push({
        sql: 'UPDATE customers SET current_balance = current_balance + ? WHERE id = ?',
        params: [khataAmount, params.customer_id]
      });
      statements.push({
        sql: `
          INSERT INTO customer_transactions (id, customer_id, invoice_id, type, amount, balance_after, notes, created_at)
          VALUES (?, ?, ?, 'CREDIT_SALE', ?, (SELECT current_balance FROM customers WHERE id = ?), ?, ?)
        `,
        params: [
          `ctx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          params.customer_id,
          invoiceId,
          khataAmount,
          params.customer_id,
          `Credit bill #${invoiceNumber}`,
          createdAt
        ]
      });
    }

    // 3b. Customer Amanat deduction if amanatUsed was applied
    if (amanatUsed > 0 && params.customer_id) {
      statements.push({
        sql: 'UPDATE customers SET amanat_balance = MAX(0, amanat_balance - ?) WHERE id = ?',
        params: [amanatUsed, params.customer_id]
      });
      statements.push({
        sql: `
          INSERT INTO customer_transactions (id, customer_id, invoice_id, type, amount, balance_after, notes, created_at)
          VALUES (?, ?, ?, 'AMANAT_DEDUCTION', ?, (SELECT amanat_balance FROM customers WHERE id = ?), ?, ?)
        `,
        params: [
          `ctx-amn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          params.customer_id,
          invoiceId,
          amanatUsed,
          params.customer_id,
          `Amanat applied on bill #${invoiceNumber}`,
          createdAt
        ]
      });
    }

    // 4. Update Shift Sales Totals if active shift
    if (params.shift_id) {
      if (params.payment_mode === 'cash') {
        const netCashAdded = finalPayable - khataAmount;
        statements.push({
          sql: `
            UPDATE shifts SET
              total_sales_cash = total_sales_cash + ?,
              expected_cash = expected_cash + ?
            WHERE id = ?
          `,
          params: [netCashAdded, netCashAdded, params.shift_id]
        });
      } else if (params.payment_mode === 'card') {
        statements.push({
          sql: 'UPDATE shifts SET total_sales_card = total_sales_card + ? WHERE id = ?',
          params: [finalPayable, params.shift_id]
        });
      } else if (params.payment_mode === 'easypaisa' || params.payment_mode === 'jazzcash') {
        statements.push({
          sql: 'UPDATE shifts SET total_sales_digital = total_sales_digital + ? WHERE id = ?',
          params: [finalPayable, params.shift_id]
        });
      } else if (params.payment_mode === 'khata') {
        statements.push({
          sql: 'UPDATE shifts SET total_sales_khata = total_sales_khata + ? WHERE id = ?',
          params: [finalPayable, params.shift_id]
        });
      }
    }

    // Execute atomic transaction
    await sqlDb.transaction(statements);

    return {
      id: invoiceId,
      invoice_number: invoiceNumber,
      customer_id: params.customer_id,
      customer_name: params.customer_name || 'Walk-in Customer',
      customer_phone: params.customer_phone || '',
      total_amount: finalPayable,
      tax_amount: totalTax,
      discount_amount: discount,
      paid_amount: paid,
      change_due: change,
      round_off_amount: roundOff,
      payment_mode: params.payment_mode,
      cashier_id: params.cashier_id,
      cashier_name: params.cashier_name,
      shift_id: params.shift_id,
      is_retroactive: false,
      inventory_deducted: true,
      notes: params.notes,
      created_at: createdAt,
      items: createdItems
    };
  },

  // --- F6 RETURNS, EXCHANGES & INVOICE VOIDS ENGINE (PHASE 4) ---

  async getInvoiceWithItems(invoiceNumber: string): Promise<(Invoice & { items: InvoiceItem[] }) | null> {
    const trimmed = invoiceNumber.trim();
    if (!trimmed) return null;
    const inv = await sqlDb.get<Invoice>(
      'SELECT * FROM invoices WHERE invoice_number = ? OR id = ? LIMIT 1',
      [trimmed, trimmed]
    );
    if (!inv) return null;
    const items = await sqlDb.query<InvoiceItem>(
      'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC',
      [inv.id]
    );
    return { ...inv, items };
  },

  async processReturnOrExchange(params: {
    originalInvoiceId: string;
    originalInvoiceNumber: string;
    returnedItems: Array<{
      productId: string;
      productName: string;
      qty: number;
      unitPrice: number;
      disposition: 'RESTOCK' | 'SCRAP';
    }>;
    replacementItems: Array<{
      productId: string;
      productName: string;
      qty: number;
      unitPrice: number;
      subtotal: number;
    }>;
    refundMode: 'CASH' | 'KHATA';
    refundAmount: number;
    differencePayable: number;
    cashierName: string;
    shiftId?: string;
    customerId?: string;
  }): Promise<{ returnInvoiceNumber: string }> {
    const timestamp = new Date().toISOString();
    const returnSeq = Date.now().toString().slice(-6);
    const returnInvoiceNo = `RET-${returnSeq}`;
    const returnInvoiceId = `ret-${Date.now()}`;
    const statements: { sql: string; params?: any[] }[] = [];

    // 1. Process returned items with disposition
    for (const item of params.returnedItems) {
      if (item.disposition === 'RESTOCK' && item.productId) {
        statements.push({
          sql: 'UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?',
          params: [item.qty, item.productId]
        });
      }
    }

    // 2. Process replacement items
    for (const item of params.replacementItems) {
      if (item.productId) {
        statements.push({
          sql: 'UPDATE products SET stock_qty = MAX(0, stock_qty - ?) WHERE id = ?',
          params: [item.qty, item.productId]
        });
      }
    }

    // 3. Insert Return/Exchange record
    statements.push({
      sql: `
        INSERT INTO invoices (
          id, invoice_number, total_amount, paid_amount, change_due, round_off_amount,
          payment_mode, cashier_name, shift_id, notes, created_at
        ) VALUES (?, ?, ?, ?, 0.0, 0.0, ?, ?, ?, ?, ?)
      `,
      params: [
        returnInvoiceId,
        returnInvoiceNo,
        params.differencePayable,
        params.differencePayable,
        params.refundMode.toLowerCase(),
        params.cashierName,
        params.shiftId || null,
        `RETURN/EXCHANGE for Invoice #${params.originalInvoiceNumber} (Refund: Rs. ${params.refundAmount} via ${params.refundMode})`,
        timestamp
      ]
    });

    // 4. Update shift drawer totals if cash refund was issued
    if (params.refundAmount > 0 && params.refundMode === 'CASH' && params.shiftId) {
      statements.push({
        sql: `
          UPDATE shifts SET
            total_returns_cash = total_returns_cash + ?,
            expected_cash = expected_cash - ?
          WHERE id = ?
        `,
        params: [params.refundAmount, params.refundAmount, params.shiftId]
      });
    }

    // 5. Update customer balance if Khata refund was chosen
    if (params.refundAmount > 0 && params.refundMode === 'KHATA' && params.customerId) {
      statements.push({
        sql: 'UPDATE customers SET current_balance = current_balance - ? WHERE id = ?',
        params: [params.refundAmount, params.customerId]
      });
      statements.push({
        sql: `
          INSERT INTO customer_transactions (id, customer_id, invoice_id, type, amount, balance_after, notes, created_at)
          VALUES (?, ?, ?, 'RETURN_CREDIT', ?, (SELECT current_balance FROM customers WHERE id = ?), ?, ?)
        `,
        params: [
          `ctx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          params.customerId,
          returnInvoiceId,
          params.refundAmount,
          params.customerId,
          `Return credit voucher for #${params.originalInvoiceNumber}`,
          timestamp
        ]
      });
    }

    await sqlDb.transaction(statements);
    return { returnInvoiceNumber: returnInvoiceNo };
  },

  async processVoidInvoice(params: {
    invoiceId: string;
    invoiceNumber: string;
    cashierName: string;
    shiftId?: string;
    reason?: string;
  }): Promise<void> {
    const inv = await sqlDb.get<Invoice>('SELECT * FROM invoices WHERE id = ?', [params.invoiceId]);
    if (!inv) throw new Error('Invoice not found.');
    if (inv.notes?.includes('[VOIDED]')) {
      throw new Error('This invoice is already voided.');
    }

    const items = await sqlDb.query<InvoiceItem>('SELECT * FROM invoice_items WHERE invoice_id = ?', [params.invoiceId]);
    const statements: { sql: string; params?: any[] }[] = [];

    // 1. Restore inventory stock for all items
    for (const it of items) {
      if (it.product_id) {
        statements.push({
          sql: 'UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?',
          params: [it.qty, it.product_id]
        });
      }
    }

    // 2. Reverse shift drawer totals
    if (inv.shift_id) {
      if (inv.payment_mode === 'cash') {
        statements.push({
          sql: `
            UPDATE shifts SET
              total_sales_cash = MAX(0, total_sales_cash - ?),
              expected_cash = MAX(0, expected_cash - ?)
            WHERE id = ?
          `,
          params: [inv.total_amount, inv.total_amount, inv.shift_id]
        });
      } else if (inv.payment_mode === 'card') {
        statements.push({
          sql: 'UPDATE shifts SET total_sales_card = MAX(0, total_sales_card - ?) WHERE id = ?',
          params: [inv.total_amount, inv.shift_id]
        });
      } else if (inv.payment_mode === 'easypaisa' || inv.payment_mode === 'jazzcash') {
        statements.push({
          sql: 'UPDATE shifts SET total_sales_digital = MAX(0, total_sales_digital - ?) WHERE id = ?',
          params: [inv.total_amount, inv.shift_id]
        });
      } else if (inv.payment_mode === 'khata' && inv.customer_id) {
        statements.push({
          sql: 'UPDATE shifts SET total_sales_khata = MAX(0, total_sales_khata - ?) WHERE id = ?',
          params: [inv.total_amount, inv.shift_id]
        });
      }
    }

    // 3. Reverse customer balance if Khata credit
    if (inv.customer_id && inv.payment_mode === 'khata') {
      statements.push({
        sql: 'UPDATE customers SET current_balance = MAX(0, current_balance - ?) WHERE id = ?',
        params: [inv.total_amount, inv.customer_id]
      });
      statements.push({
        sql: `
          INSERT INTO customer_transactions (id, customer_id, invoice_id, type, amount, balance_after, notes, created_at)
          VALUES (?, ?, ?, 'VOID_REVERSAL', ?, (SELECT current_balance FROM customers WHERE id = ?), ?, datetime('now', 'localtime'))
        `,
        params: [
          `ctx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          inv.customer_id,
          inv.id,
          inv.total_amount,
          inv.customer_id,
          `Reversal for voided bill #${inv.invoice_number}`
        ]
      });
    }

    // 4. Mark invoice as voided in DB
    statements.push({
      sql: `
        UPDATE invoices SET
          notes = CASE WHEN notes IS NULL OR notes = '' THEN '[VOIDED: ' || ? || ']' ELSE notes || ' [VOIDED: ' || ? || ']' END
        WHERE id = ?
      `,
      params: [params.reason || 'Supervisor Void', params.reason || 'Supervisor Void', params.invoiceId]
    });

    await sqlDb.transaction(statements);
  },

  async getShiftInvoices(shiftId?: string | null, limit = 50, allShifts = false, search = ''): Promise<(Invoice & { items: InvoiceItem[] })[]> {
    const conditions: string[] = [];
    const params: any[] = [];

    if (!allShifts && shiftId) {
      conditions.push('shift_id = ?');
      params.push(shiftId);
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push('(invoice_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)');
      params.push(q, q, q);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit);

    const invoices = await sqlDb.query<Invoice>(
      `SELECT * FROM invoices ${whereClause} ORDER BY created_at DESC LIMIT ?`,
      params
    );

    const fullInvoices: (Invoice & { items: InvoiceItem[] })[] = [];
    for (const inv of invoices) {
      const items = await sqlDb.query<InvoiceItem>(
        'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC',
        [inv.id]
      );
      fullInvoices.push({ ...inv, items });
    }
    return fullInvoices;
  },

  async searchInvoicesPaginated(options: {
    search?: string;
    shiftId?: string | null;
    allShifts?: boolean;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }): Promise<{ invoices: (Invoice & { items: InvoiceItem[] })[]; totalCount: number; page: number; totalPages: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 50));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];

    if (!options.allShifts && options.shiftId) {
      conditions.push('shift_id = ?');
      params.push(options.shiftId);
    }

    if (options.search && options.search.trim()) {
      const q = `%${options.search.trim()}%`;
      conditions.push('(invoice_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)');
      params.push(q, q, q);
    }

    if (options.startDate) {
      conditions.push('date(created_at) >= date(?)');
      params.push(options.startDate);
    }

    if (options.endDate) {
      conditions.push('date(created_at) <= date(?)');
      params.push(options.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = await sqlDb.get<{ count: number }>(
      `SELECT count(*) as count FROM invoices ${whereClause}`,
      params
    );
    const totalCount = countRow?.count || 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));

    const invoices = await sqlDb.query<Invoice>(
      `SELECT * FROM invoices ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const fullInvoices: (Invoice & { items: InvoiceItem[] })[] = [];
    for (const inv of invoices) {
      const items = await sqlDb.query<InvoiceItem>(
        'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC',
        [inv.id]
      );
      fullInvoices.push({ ...inv, items });
    }

    return {
      invoices: fullInvoices,
      totalCount,
      page,
      totalPages
    };
  }
};
