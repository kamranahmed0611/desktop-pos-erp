import { sqlDb } from '../db/sqlite';
import { Customer, CustomerTransaction, StoreSettings } from '../types';

export interface CreateCustomerInput {
  name: string;
  phone: string;
  nickname?: string;
  address?: string;
  credit_limit?: number;
  opening_balance?: number;
  opening_balance_notes?: string;
}

export const khataService = {
  async getCustomers(): Promise<Customer[]> {
    return sqlDb.query<Customer>(`
      SELECT * FROM customers ORDER BY current_balance DESC, name ASC
    `);
  },

  async searchCustomers(query: string): Promise<Customer[]> {
    const q = query.trim();
    if (!q) return this.getCustomers();
    return sqlDb.query<Customer>(`
      SELECT * FROM customers
      WHERE name LIKE ? OR phone LIKE ? OR nickname LIKE ?
      ORDER BY current_balance DESC, name ASC
    `, [`%${q}%`, `%${q}%`, `%${q}%`]);
  },

  async getCustomerById(id: string): Promise<Customer | null> {
    return sqlDb.get<Customer>('SELECT * FROM customers WHERE id = ?', [id]);
  },

  async getCustomerTransactions(customerId: string): Promise<CustomerTransaction[]> {
    return sqlDb.query<CustomerTransaction>(`
      SELECT * FROM customer_transactions WHERE customer_id = ? ORDER BY created_at DESC
    `, [customerId]);
  },

  async createCustomer(input: CreateCustomerInput): Promise<Customer> {
    const id = `cust-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const openingBal = input.opening_balance || 0;

    await sqlDb.execute(`
      INSERT INTO customers (id, name, phone, nickname, address, credit_limit, current_balance, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `, [
      id,
      input.name.trim(),
      input.phone.trim(),
      input.nickname || '',
      input.address || '',
      input.credit_limit || 25000,
      openingBal
    ]);

    if (openingBal > 0) {
      await sqlDb.execute(`
        INSERT INTO customer_transactions (id, customer_id, type, amount, balance_after, notes, created_at)
        VALUES (?, ?, 'OPENING_BALANCE', ?, ?, ?, datetime('now', 'localtime'))
      `, [
        `ctx-open-${Date.now()}`,
        id,
        openingBal,
        openingBal,
        input.opening_balance_notes || 'Opening balance transferred from register notebook'
      ]);
    }

    return (await this.getCustomerById(id))!;
  },

  async receivePayment(
    customerId: string,
    amountPaid: number,
    settlementDiscount = 0,
    notes?: string
  ): Promise<{ newBalance: number }> {
    const customer = await this.getCustomerById(customerId);
    if (!customer) throw new Error('Customer account not found.');

    const totalReduction = amountPaid + settlementDiscount;
    const newBalance = Math.max(0, customer.current_balance - totalReduction);

    const statements: { sql: string; params?: any[] }[] = [];

    // 1. Update Customer Balance
    statements.push({
      sql: 'UPDATE customers SET current_balance = ? WHERE id = ?',
      params: [newBalance, customerId]
    });

    // 2. Insert Payment Transaction
    if (amountPaid > 0) {
      statements.push({
        sql: `
          INSERT INTO customer_transactions (id, customer_id, type, amount, balance_after, notes, created_at)
          VALUES (?, ?, 'PAYMENT', ?, ?, ?, datetime('now', 'localtime'))
        `,
        params: [
          `ctx-pay-${Date.now()}`,
          customerId,
          amountPaid,
          customer.current_balance - amountPaid,
          notes || 'Cash/Digital recovery payment'
        ]
      });
    }

    // 3. Insert Settlement Discount Transaction if provided
    if (settlementDiscount > 0) {
      statements.push({
        sql: `
          INSERT INTO customer_transactions (id, customer_id, type, amount, balance_after, notes, created_at)
          VALUES (?, ?, 'SETTLEMENT_DISCOUNT', ?, ?, ?, datetime('now', 'localtime'))
        `,
        params: [
          `ctx-disc-${Date.now()}`,
          customerId,
          settlementDiscount,
          newBalance,
          'Authorized settlement discount / balance closure waiver'
        ]
      });
    }

    await sqlDb.transaction(statements);
    return { newBalance };
  },

  formatWhatsAppKhataStatement(cust: Customer, store: StoreSettings, recentTransactions: CustomerTransaction[]): string {
    const historyLines = recentTransactions.slice(0, 5).map(t => {
      const sign = t.type === 'CREDIT_SALE' ? '+' : '-';
      const date = new Date(t.created_at).toLocaleDateString('en-PK');
      return `• ${date}: ${sign}Rs. ${t.amount.toLocaleString()} (${t.type.replace('_', ' ')})`;
    }).join('\n');

    return [
      `📒 *${store.store_name} — KHATA STATEMENT*`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `👤 *Customer:* ${cust.name}`,
      `📱 *Phone:* ${cust.phone}`,
      `📅 *Date:* ${new Date().toLocaleDateString('en-PK')}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `💰 *CURRENT OUTSTANDING BALANCE:*`,
      `👉 *Rs. ${cust.current_balance.toLocaleString()}*`,
      `💳 *Credit Limit:* Rs. ${cust.credit_limit.toLocaleString()}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      historyLines ? `*RECENT ACTIVITY:*\n${historyLines}\n━━━━━━━━━━━━━━━━━━━━━━━━` : '',
      `🙏 *${store.receipt_footer_urdu}*`,
      `Please deposit payment via Easypaisa/Cash at counter:`,
      `Easypaisa: ${store.easypaisa_number || store.phone}`,
      `UAN: ${store.phone}`
    ].filter(Boolean).join('\n');
  },

  async deleteCustomer(customerId: string): Promise<void> {
    const cust = await this.getCustomerById(customerId);
    if (!cust) return;

    const statements: { sql: string; params?: any[] }[] = [];

    // Detach customer from past invoices so sales/tax audit history is 100% preserved
    statements.push({
      sql: 'UPDATE invoices SET customer_id = NULL WHERE customer_id = ?',
      params: [customerId]
    });

    // Delete customer transactions
    statements.push({
      sql: 'DELETE FROM customer_transactions WHERE customer_id = ?',
      params: [customerId]
    });

    // Delete customer
    statements.push({
      sql: 'DELETE FROM customers WHERE id = ?',
      params: [customerId]
    });

    // Log deletion into audit log
    const auditId = `aud-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    statements.push({
      sql: `
        INSERT INTO system_audit_logs (id, cashier, supervisor, invoice_number, action, status, timestamp, details)
        VALUES (?, 'ADMIN', 'ADMIN', 'N/A', 'KHATA_DELETE', 'COMPLETED', ?, ?)
      `,
      params: [
        auditId,
        Date.now(),
        `Customer "${cust.name}" (ID: ${customerId}) deleted. Remaining Balance was Rs. ${cust.current_balance}. Past sales detached and preserved.`
      ]
    });

    await sqlDb.transaction(statements);
  },

  // --- AMANAT (ADVANCE DEPOSIT WALLET) ENGINE (M6.2, M6.3) ---

  async addAmanatDeposit(
    customerId: string,
    amount: number,
    autoOffsetDebt = false,
    notes?: string
  ): Promise<{ newAmanat: number; newDebt: number; offsetAmount: number }> {
    const cust = await this.getCustomerById(customerId);
    if (!cust) throw new Error('Customer not found');
    const currentAmanat = Number(cust.amanat_balance || 0);
    const currentDebt = Number(cust.current_balance || 0);

    let offsetAmount = 0;
    let newDebt = currentDebt;
    let newAmanat = currentAmanat;

    if (autoOffsetDebt && currentDebt > 0) {
      offsetAmount = Math.min(amount, currentDebt);
      newDebt = currentDebt - offsetAmount;
      const surplus = amount - offsetAmount;
      newAmanat = currentAmanat + surplus;
    } else {
      newAmanat = currentAmanat + amount;
    }

    const statements: { sql: string; params?: any[] }[] = [];
    statements.push({
      sql: 'UPDATE customers SET amanat_balance = ?, current_balance = ? WHERE id = ?',
      params: [newAmanat, newDebt, customerId]
    });

    if (offsetAmount > 0) {
      statements.push({
        sql: `
          INSERT INTO customer_transactions (id, customer_id, type, amount, balance_after, notes, created_at)
          VALUES (?, ?, 'PAYMENT', ?, ?, ?, datetime('now', 'localtime'))
        `,
        params: [
          `ctx-pay-amn-${Date.now()}`,
          customerId,
          offsetAmount,
          newDebt,
          `Advance cash deposit auto-balanced & deducted from outstanding debt (Remaining Debt: Rs. ${newDebt.toLocaleString()})`
        ]
      });
    }

    const surplusAmount = amount - offsetAmount;
    if (surplusAmount > 0) {
      statements.push({
        sql: `
          INSERT INTO customer_transactions (id, customer_id, type, amount, balance_after, notes, created_at)
          VALUES (?, ?, 'AMANAT_DEPOSIT', ?, ?, ?, datetime('now', 'localtime'))
        `,
        params: [
          `ctx-amn-${Date.now()}`,
          customerId,
          surplusAmount,
          newAmanat,
          notes || 'Advance cash security deposit (Amanat)'
        ]
      });
    }

    await sqlDb.transaction(statements);
    return { newAmanat, newDebt, offsetAmount };
  },

  async reconcileAmanatWithDebt(
    customerId: string
  ): Promise<{ offsetAmount: number; newDebt: number; newAmanat: number }> {
    const cust = await this.getCustomerById(customerId);
    if (!cust) throw new Error('Customer account not found.');
    const debt = Number(cust.current_balance || 0);
    const amanat = Number(cust.amanat_balance || 0);
    if (debt <= 0 || amanat <= 0) {
      return { offsetAmount: 0, newDebt: debt, newAmanat: amanat };
    }

    const offsetAmount = Math.min(debt, amanat);
    const newDebt = debt - offsetAmount;
    const newAmanat = amanat - offsetAmount;

    const statements: { sql: string; params?: any[] }[] = [];
    statements.push({
      sql: 'UPDATE customers SET current_balance = ?, amanat_balance = ? WHERE id = ?',
      params: [newDebt, newAmanat, customerId]
    });

    statements.push({
      sql: `
        INSERT INTO customer_transactions (id, customer_id, type, amount, balance_after, notes, created_at)
        VALUES (?, ?, 'AMANAT_OFFSET_DEBT', ?, ?, ?, datetime('now', 'localtime'))
      `,
      params: [
        `ctx-offset-${Date.now()}`,
        customerId,
        offsetAmount,
        newDebt,
        `Reconciled advance Amanat against outstanding debt (Amanat remaining: Rs. ${newAmanat.toLocaleString()})`
      ]
    });

    await sqlDb.transaction(statements);
    return { offsetAmount, newDebt, newAmanat };
  },

  async deductAmanat(customerId: string, amount: number, notes?: string): Promise<{ newAmanat: number }> {
    const cust = await this.getCustomerById(customerId);
    if (!cust) throw new Error('Customer not found');
    const currentAmanat = Number(cust.amanat_balance || 0);
    if (amount > currentAmanat) {
      throw new Error(`Cannot deduct Rs. ${amount}. Available Amanat deposit is only Rs. ${currentAmanat}.`);
    }
    const newAmanat = currentAmanat - amount;
    const statements: { sql: string; params?: any[] }[] = [];

    statements.push({
      sql: 'UPDATE customers SET amanat_balance = ? WHERE id = ?',
      params: [newAmanat, customerId]
    });

    statements.push({
      sql: `
        INSERT INTO customer_transactions (id, customer_id, type, amount, balance_after, notes, created_at)
        VALUES (?, ?, 'AMANAT_DEDUCTION', ?, ?, ?, datetime('now', 'localtime'))
      `,
      params: [
        `ctx-amnded-${Date.now()}`,
        customerId,
        amount,
        newAmanat,
        notes || '1-Click Amanat deduction applied against POS bill'
      ]
    });

    await sqlDb.transaction(statements);
    return { newAmanat };
  },

  // --- KHATA PERIOD BILL INSPECTION & CONSOLIDATION ENGINE (M6.6) ---

  async getCustomerInvoicesForPeriod(customerId: string, fromDate?: string, toDate?: string): Promise<any[]> {
    let sql = 'SELECT * FROM invoices WHERE customer_id = ?';
    const params: any[] = [customerId];

    if (fromDate) {
      sql += ' AND date(created_at) >= date(?)';
      params.push(fromDate);
    }
    if (toDate) {
      sql += ' AND date(created_at) <= date(?)';
      params.push(toDate);
    }

    sql += ' ORDER BY created_at DESC';
    return sqlDb.query(sql, params);
  },

  async getCustomerInvoicesWithItems(customerId: string, fromDate?: string, toDate?: string): Promise<any[]> {
    const invoices = await this.getCustomerInvoicesForPeriod(customerId, fromDate, toDate);
    const enriched = [];
    for (const inv of invoices) {
      const items = await sqlDb.query('SELECT * FROM invoice_items WHERE invoice_id = ?', [inv.id]);
      enriched.push({
        ...inv,
        items: items || []
      });
    }
    return enriched;
  },

  async updateInvoiceItem(
    itemId: string,
    invoiceId: string,
    newQty: number,
    newPrice: number,
    newName?: string
  ): Promise<void> {
    const item = await sqlDb.get<any>('SELECT * FROM invoice_items WHERE id = ?', [itemId]);
    if (!item) throw new Error('Invoice item not found');
    const oldSubtotal = Number(item.subtotal || (item.qty * item.unit_price));
    const newSubtotal = newQty * newPrice;
    const diff = newSubtotal - oldSubtotal;
    const updatedName = newName !== undefined ? newName.trim() : (item.product_name || 'Item');

    const statements: { sql: string; params?: any[] }[] = [];
    statements.push({
      sql: 'UPDATE invoice_items SET product_name = ?, qty = ?, unit_price = ?, subtotal = ? WHERE id = ?',
      params: [updatedName, newQty, newPrice, newSubtotal, itemId]
    });

    statements.push({
      sql: 'UPDATE invoices SET total_amount = MAX(0, total_amount + ?) WHERE id = ?',
      params: [diff, invoiceId]
    });

    const inv = await sqlDb.get<any>('SELECT customer_id FROM invoices WHERE id = ?', [invoiceId]);
    if (inv && inv.customer_id) {
      statements.push({
        sql: 'UPDATE customers SET current_balance = MAX(0, current_balance + ?) WHERE id = ?',
        params: [diff, inv.customer_id]
      });
    }

    await sqlDb.transaction(statements);
  },

  async addInvoiceItem(
    invoiceId: string,
    productName: string,
    qty: number,
    unitPrice: number
  ): Promise<void> {
    const subtotal = qty * unitPrice;
    const itemId = `inv-item-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const statements: { sql: string; params?: any[] }[] = [];
    statements.push({
      sql: `INSERT INTO invoice_items (id, invoice_id, product_id, product_name, qty, unit_cost, unit_price, discount_amount, tax_amount, subtotal)
            VALUES (?, ?, 'ad-hoc-item', ?, ?, 0.0, ?, 0.0, 0.0, ?)`,
      params: [itemId, invoiceId, productName.trim() || 'Custom Item', qty, unitPrice, subtotal]
    });

    statements.push({
      sql: 'UPDATE invoices SET total_amount = total_amount + ? WHERE id = ?',
      params: [subtotal, invoiceId]
    });

    const inv = await sqlDb.get<any>('SELECT customer_id FROM invoices WHERE id = ?', [invoiceId]);
    if (inv && inv.customer_id) {
      statements.push({
        sql: 'UPDATE customers SET current_balance = current_balance + ? WHERE id = ?',
        params: [subtotal, inv.customer_id]
      });
    }

    await sqlDb.transaction(statements);
  },

  async deleteInvoiceItem(itemId: string, invoiceId: string): Promise<void> {
    const item = await sqlDb.get<any>('SELECT * FROM invoice_items WHERE id = ?', [itemId]);
    if (!item) return;
    const oldSubtotal = Number(item.subtotal || (item.qty * item.unit_price));

    const statements: { sql: string; params?: any[] }[] = [];
    statements.push({
      sql: 'DELETE FROM invoice_items WHERE id = ?',
      params: [itemId]
    });

    statements.push({
      sql: 'UPDATE invoices SET total_amount = MAX(0, total_amount - ?) WHERE id = ?',
      params: [oldSubtotal, invoiceId]
    });

    const inv = await sqlDb.get<any>('SELECT customer_id FROM invoices WHERE id = ?', [invoiceId]);
    if (inv && inv.customer_id) {
      statements.push({
        sql: 'UPDATE customers SET current_balance = MAX(0, current_balance - ?) WHERE id = ?',
        params: [oldSubtotal, inv.customer_id]
      });
    }

    await sqlDb.transaction(statements);
  },

  formatUnifiedConsolidatedBill(
    cust: Customer,
    store: StoreSettings,
    invoices: any[],
    amountPaid: number,
    settlementDiscount: number,
    fromDate?: string,
    toDate?: string
  ): string {
    const storeHeader = (store.store_name || 'POINT OF SALE').toUpperCase();
    const address = store.address || 'Pakistan';
    const phone = store.phone || '';

    const consolidatedRows: string[] = [];
    let grossItemTotal = 0;
    let totalItemsCount = 0;

    for (const inv of invoices) {
      const invDate = new Date(inv.created_at).toLocaleDateString('en-PK', { day: '2-digit', month: '2-digit' });
      for (const it of (inv.items || [])) {
        totalItemsCount += Number(it.qty || 1);
        const sub = Number(it.subtotal || (it.qty * it.unit_price));
        grossItemTotal += sub;
        const line = `${invDate} ${it.product_name.slice(0, 16).padEnd(16)} ${String(it.qty).padStart(3)} @${String(Math.round(it.unit_price)).padStart(5)} = ${String(Math.round(sub)).padStart(6)}`;
        consolidatedRows.push(line);
      }
    }

    const netSettled = amountPaid + settlementDiscount;

    return `
========================================
       ${storeHeader}
   CONSOLIDATED KHATA SETTLEMENT BILL
========================================
Store:   ${address}
Phone:   ${phone}
Date:    ${new Date().toLocaleString()}
Period:  ${fromDate || 'Past'} to ${toDate || 'Today'}
----------------------------------------
CUSTOMER ACCOUNT:
Name:    ${cust.name}
Phone:   ${cust.phone}
Account: ${cust.account_no || cust.id.slice(-6).toUpperCase()}
----------------------------------------
ITEMIZED BILL DETAILS (${invoices.length} Bills, ${totalItemsCount} Qty):
Date  Item             Qty   Price   Total
----------------------------------------
${consolidatedRows.length > 0 ? consolidatedRows.join('\n') : 'No line items found.'}
----------------------------------------
Gross Bills Total:       PKR ${grossItemTotal.toLocaleString()}
Previous Due Balance:    PKR ${cust.current_balance.toLocaleString()}
Settlement Discount:   - PKR ${settlementDiscount.toLocaleString()}
Amount Paid Received:    PKR ${amountPaid.toLocaleString()}
----------------------------------------
TOTAL SETTLED / CLEARED: PKR ${netSettled.toLocaleString()}
REMAINING KHATA BALANCE: PKR ${Math.max(0, cust.current_balance - netSettled).toLocaleString()}
========================================
    *** KHATA CLEARED & PAID ***
${store.receipt_footer_urdu || 'ہمارے ہاں آمد کا شکریہ - جزاک اللہ خیر'}
Easypaisa/Cash: ${store.easypaisa_number || store.phone}
========================================
`;
  },

  format80mmKhataStatement(
    cust: Customer,
    store: StoreSettings,
    invoices: any[],
    transactions: CustomerTransaction[],
    fromDate?: string,
    toDate?: string
  ): string {
    const invLines = invoices.slice(0, 15).map(inv => {
      const d = new Date(inv.created_at).toLocaleDateString('en-PK', { day: '2-digit', month: '2-digit' });
      return `${d} #${inv.invoice_number.slice(-8)} Rs. ${inv.total_amount.toLocaleString()}`;
    }).join('\n');

    return `
========================================
       ${storeSettingsHeader(store.store_name)}
    CUSTOMER KHATA STATEMENT (80MM)
========================================
Customer: ${cust.name}
Phone:    ${cust.phone}
Account:  ${cust.account_no || cust.id.slice(-6).toUpperCase()}
Period:   ${fromDate || 'Opening'} to ${toDate || 'Today'}
Printed:  ${new Date().toLocaleString()}
----------------------------------------
CURRENT BALANCE SUMMARY:
Udhaar Balance (Due):  PKR ${cust.current_balance.toLocaleString()}
Amanat Balance:        PKR ${(cust.amanat_balance || 0).toLocaleString()}
Credit Limit:          PKR ${cust.credit_limit.toLocaleString()}
Status:                ${cust.current_balance > cust.credit_limit ? 'OVER CREDIT LIMIT' : 'ACTIVE'}
----------------------------------------
INVOICES IN PERIOD (${invoices.length} Bills):
${invLines || 'No bills in selected period.'}
----------------------------------------
* Please settle outstanding balance *
${store.receipt_footer_urdu || ''}
Easypaisa / JazzCash: ${store.easypaisa_number || store.phone}
----------------------------------------
Developed & maintained by Teddops
+923297263098 • +923235930559
========================================
`;
  }
};

function storeSettingsHeader(name: string) {
  return name.toUpperCase();
}
