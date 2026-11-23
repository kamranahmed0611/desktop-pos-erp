import { sqlDb } from '../db/sqlite';
import { Supplier, SupplierPaymentChannel, SupplierTransaction, SupplierTxnType } from '../types';
import { catalogService } from './catalogService';

export interface CreateSupplierInput {
  name: string;
  company: string;
  phone: string;
  email?: string;
  address?: string;
  opening_balance?: number;
  balance_type?: 'PAYABLE' | 'ADVANCE' | 'ADVANCE_PREPAID' | 'POST_DELIVERY_CREDIT';
  credit_limit?: number;
  payment_terms_days?: number;
}

export interface PurchaseItemInput {
  product_id: string;
  product_name: string;
  billed_qty: number;
  scheme_qty?: number; // Free scheme cartons/pieces (e.g. 12 + 1 free)
  unit_cost: number;
  line_total?: number;
}

export interface RecordPurchaseBillInput {
  supplier_id: string;
  invoice_no: string; // Vendor invoice # or Parchi #
  bill_type?: 'VERIFIED_BILL' | 'PARCHI';
  gross_amount?: number;
  tax_amount?: number;
  freight_amount?: number;
  freight_deducted_from_bill?: boolean;
  total_bill_amount: number;
  wapsi_offset_amount?: number;
  advance_drawdown_amount?: number;
  is_quick_lump_sum?: boolean;
  items?: PurchaseItemInput[];
  notes?: string;
}

export interface RecordPaymentInput {
  supplier_id: string;
  amount: number; // Cash / Bank amount paid
  settlement_discount?: number; // Kasar / Settlement discount across ALL payment modes
  channel: SupplierPaymentChannel;
  bank_name?: string;
  ref_no?: string;
  cheque_date?: string;
  cheque_status?: 'CLEARED' | 'PENDING_CLEARANCE';
  deduct_from_drawer?: boolean;
  notes?: string;
}

export interface LedgerStatement {
  supplier: Supplier;
  start_date: string;
  end_date: string;
  opening_balance: number; // Sabqa Baqaya before period
  total_debits: number;    // Total Purchases / Kharid (+)
  total_credits: number;   // Total Payments + Returns (-)
  total_settlement: number;// Total Kasar / Chhoot
  closing_balance: number; // Final Baqaya
  transactions: SupplierTransaction[];
}

export const supplierService = {
  async getSuppliers(): Promise<Supplier[]> {
    return sqlDb.query<Supplier>(`
      SELECT * FROM suppliers ORDER BY current_balance DESC, company ASC
    `);
  },

  async getSupplierById(id: string): Promise<Supplier | null> {
    return sqlDb.get<Supplier>('SELECT * FROM suppliers WHERE id = ?', [id]);
  },

  async getSupplierTransactions(supplierId: string): Promise<SupplierTransaction[]> {
    return sqlDb.query<SupplierTransaction>(`
      SELECT * FROM supplier_transactions 
      WHERE supplier_id = ? 
      ORDER BY created_at ASC, id ASC
    `, [supplierId]);
  },

  async createSupplier(input: CreateSupplierInput): Promise<Supplier> {
    const id = `supp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const rawOpening = Number(input.opening_balance) || 0;
    const isAdvance = input.balance_type === 'ADVANCE' || input.balance_type === 'ADVANCE_PREPAID';
    // If advance, store balance is negative (money held with supplier)
    const openingBal = isAdvance ? -Math.abs(rawOpening) : Math.abs(rawOpening);

    await sqlDb.execute(`
      INSERT INTO suppliers (
        id, name, company, phone, email, address, current_balance, 
        credit_limit, payment_terms_days, balance_type, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `, [
      id,
      input.name.trim(),
      input.company.trim(),
      input.phone.trim(),
      input.email || '',
      input.address || '',
      openingBal,
      Number(input.credit_limit) || 0,
      Number(input.payment_terms_days) || 7,
      isAdvance ? 'ADVANCE_PREPAID' : 'POST_DELIVERY_CREDIT'
    ]);

    if (rawOpening > 0) {
      const debit = isAdvance ? 0 : rawOpening;
      const credit = isAdvance ? rawOpening : 0;
      await sqlDb.execute(`
        INSERT INTO supplier_transactions (
          id, supplier_id, type, debit_amount, credit_amount, amount, 
          balance_after, notes, created_at
        ) VALUES (?, ?, 'OPENING_BALANCE', ?, ?, ?, ?, ?, datetime('now', 'localtime'))
      `, [
        `stx-open-${Date.now()}`,
        id,
        debit,
        credit,
        rawOpening,
        openingBal,
        isAdvance ? 'Initial advance credit balance' : 'Sabqa Baqaya (Opening balance from previous ledger)'
      ]);
    }

    return (await this.getSupplierById(id))!;
  },

  async updateSupplier(id: string, updates: Partial<CreateSupplierInput>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name.trim()); }
    if (updates.company !== undefined) { fields.push('company = ?'); values.push(updates.company.trim()); }
    if (updates.phone !== undefined) { fields.push('phone = ?'); values.push(updates.phone.trim()); }
    if (updates.email !== undefined) { fields.push('email = ?'); values.push(updates.email.trim()); }
    if (updates.address !== undefined) { fields.push('address = ?'); values.push(updates.address.trim()); }
    if (updates.credit_limit !== undefined) { fields.push('credit_limit = ?'); values.push(Number(updates.credit_limit) || 0); }
    if (updates.payment_terms_days !== undefined) { fields.push('payment_terms_days = ?'); values.push(Number(updates.payment_terms_days) || 7); }

    if (fields.length > 0) {
      values.push(id);
      await sqlDb.execute(`UPDATE suppliers SET ${fields.join(', ')} WHERE id = ?`, values);
    }
  },

  /**
   * Record Purchase Delivery Bill (Flexible Mode: Quick Lump-Sum or Itemized)
   * Math:
   *   newBalance = current_balance + netBillAmount
   *   debit_amount = netBillAmount, credit_amount = 0
   */
  async recordPurchaseBill(input: RecordPurchaseBillInput): Promise<SupplierTransaction> {
    const supplier = await this.getSupplierById(input.supplier_id);
    if (!supplier) throw new Error('Supplier not found.');

    const rawBillAmount = Number(input.total_bill_amount);
    if (rawBillAmount <= 0) throw new Error('Bill amount must be greater than 0.');

    const wapsiOffset = Math.min(Number(input.wapsi_offset_amount) || 0, rawBillAmount);
    const netBillAdded = rawBillAmount - wapsiOffset;

    const newBalance = supplier.current_balance + netBillAdded;
    const billType = input.bill_type || 'VERIFIED_BILL';
    const txnType: SupplierTxnType = billType === 'PARCHI' ? 'PARCHI_DELIVERY' : 'PURCHASE_BILL';
    const txnId = `stx-bill-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // 1. Update Supplier Balance
    await sqlDb.execute(`
      UPDATE suppliers SET current_balance = ? WHERE id = ?
    `, [newBalance, input.supplier_id]);

    const finalNotes = [
      input.notes,
      wapsiOffset > 0 ? `[Wapsi Offset Applied: -Rs. ${wapsiOffset.toLocaleString()}]` : '',
      billType === 'PARCHI' ? `Handwritten delivery parchi #${input.invoice_no}` : `Procurement invoice #${input.invoice_no}`
    ].filter(Boolean).join(' • ');

    // 2. Insert Transaction Record
    await sqlDb.execute(`
      INSERT INTO supplier_transactions (
        id, supplier_id, type, debit_amount, credit_amount, amount, 
        balance_after, invoice_no, bill_type, freight_amount, tax_amount, 
        gross_amount, items_json, notes, created_at
      ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `, [
      txnId,
      input.supplier_id,
      txnType,
      netBillAdded,
      rawBillAmount,
      newBalance,
      input.invoice_no.trim(),
      billType,
      Number(input.freight_amount) || 0,
      Number(input.tax_amount) || 0,
      Number(input.gross_amount) || rawBillAmount,
      input.items && input.items.length > 0 ? JSON.stringify(input.items) : null,
      finalNotes
    ]);

    // 3. If Itemized, update inventory & moving average cost with Scheme Math
    if (!input.is_quick_lump_sum && input.items && input.items.length > 0) {
      for (const it of input.items) {
        if (!it.product_id) continue;
        const billedQty = Number(it.billed_qty) || 0;
        const schemeQty = Number(it.scheme_qty) || 0;
        const totalReceivedStock = billedQty + schemeQty;

        if (totalReceivedStock > 0) {
          // Scheme Math: Total cost charged = billedQty * unit_cost
          // Effective blended cost = (billedQty * unit_cost) / totalReceivedStock
          const lineCostCharged = billedQty * (Number(it.unit_cost) || 0);
          const effectiveUnitCost = lineCostCharged / totalReceivedStock;

          try {
            await catalogService.recordStockReceiptWithMovingAverage(
              it.product_id,
              totalReceivedStock,
              effectiveUnitCost
            );
          } catch (err: any) {
            console.warn(`[SupplierService] Stock receipt warning for "${it.product_name}":`, err?.message);
          }
        }
      }
    }

    return (await sqlDb.get<SupplierTransaction>('SELECT * FROM supplier_transactions WHERE id = ?', [txnId]))!;
  },

  /**
   * Reconcile a Handwritten Parchi into a Verified Computerized Bill
   */
  async reconcileParchiToBill(
    transactionId: string,
    officialInvoiceNo: string,
    verifiedAmount: number,
    notes?: string
  ): Promise<void> {
    const txn = await sqlDb.get<SupplierTransaction>('SELECT * FROM supplier_transactions WHERE id = ?', [transactionId]);
    if (!txn) throw new Error('Transaction record not found.');

    const supplier = await this.getSupplierById(txn.supplier_id);
    if (!supplier) throw new Error('Supplier not found.');

    const oldAmount = txn.debit_amount || txn.amount;
    const diff = verifiedAmount - oldAmount;
    const newBalance = supplier.current_balance + diff;

    // Update supplier current balance
    await sqlDb.execute(`
      UPDATE suppliers SET current_balance = ? WHERE id = ?
    `, [newBalance, supplier.id]);

    // Update transaction to VERIFIED_BILL
    await sqlDb.execute(`
      UPDATE supplier_transactions SET
        type = 'PURCHASE_BILL',
        bill_type = 'VERIFIED_BILL',
        invoice_no = ?,
        debit_amount = ?,
        amount = ?,
        balance_after = ?,
        notes = ?
      WHERE id = ?
    `, [
      officialInvoiceNo.trim(),
      verifiedAmount,
      verifiedAmount,
      newBalance,
      notes || `Reconciled from parchi #${txn.invoice_no} to verified invoice #${officialInvoiceNo}`,
      transactionId
    ]);
  },

  /**
   * Record Supplier Payment with Settlement (Kasar / Chhoot)
   * Math:
   *   Total Deducted = amount (paid) + settlement_discount (kasar)
   *   newBalance = current_balance - (amount + settlement_discount)
   *   debit_amount = 0, credit_amount = amount + settlement_discount
   */
  async recordPayment(input: RecordPaymentInput): Promise<SupplierTransaction> {
    const supplier = await this.getSupplierById(input.supplier_id);
    if (!supplier) throw new Error('Supplier not found.');

    const amountPaid = Number(input.amount) || 0;
    const kasar = Number(input.settlement_discount) || 0;
    const totalCredit = amountPaid + kasar;

    if (totalCredit <= 0) throw new Error('Payment or settlement amount must be greater than 0.');

    const isPendingCheque = input.channel === 'CHEQUE' && input.cheque_status === 'PENDING_CLEARANCE';
    
    // If pending cheque, do NOT deduct from balance yet
    const newBalance = isPendingCheque 
      ? supplier.current_balance 
      : supplier.current_balance - totalCredit;

    if (!isPendingCheque) {
      await sqlDb.execute(`
        UPDATE suppliers SET current_balance = ? WHERE id = ?
      `, [newBalance, input.supplier_id]);
    }

    const txnId = `stx-pay-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    await sqlDb.execute(`
      INSERT INTO supplier_transactions (
        id, supplier_id, type, debit_amount, credit_amount, amount, 
        settlement_discount, balance_after, payment_channel, bank_name, 
        reference_no, cheque_status, cheque_date, deduct_from_drawer, notes, created_at
      ) VALUES (?, ?, 'PAYMENT', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `, [
      txnId,
      input.supplier_id,
      isPendingCheque ? 0 : totalCredit,
      amountPaid,
      kasar,
      newBalance,
      input.channel,
      input.bank_name || null,
      input.ref_no || null,
      input.cheque_status || (input.channel === 'CHEQUE' ? 'CLEARED' : null),
      input.cheque_date || null,
      input.deduct_from_drawer ? 1 : 0,
      input.notes || `Payment via ${input.channel}${kasar > 0 ? ` with Rs. ${kasar} Settlement/Kasar` : ''}`
    ]);

    // If payment was cash and deduct_from_drawer is active, record till payout in active shift
    if (input.deduct_from_drawer && (input.channel === 'CASH' || input.channel === 'CASH_SAFE') && amountPaid > 0) {
      try {
        await sqlDb.execute(`
          UPDATE shifts 
          SET total_petty_expenses = total_petty_expenses + ? 
          WHERE status = 'OPEN'
        `, [amountPaid]);
      } catch (e) {
        console.warn('Could not deduct from active shift drawer:', e);
      }
    }

    return (await sqlDb.get<SupplierTransaction>('SELECT * FROM supplier_transactions WHERE id = ?', [txnId]))!;
  },

  /**
   * Mark Cheque as Cleared (Deducts from ledger balance)
   */
  async clearCheque(transactionId: string): Promise<void> {
    const txn = await sqlDb.get<SupplierTransaction>('SELECT * FROM supplier_transactions WHERE id = ?', [transactionId]);
    if (!txn) throw new Error('Cheque transaction not found.');
    if (txn.cheque_status === 'CLEARED') return;

    const supplier = await this.getSupplierById(txn.supplier_id);
    if (!supplier) throw new Error('Supplier not found.');

    const totalCredit = txn.amount + (txn.settlement_discount || 0);
    const newBalance = supplier.current_balance - totalCredit;

    await sqlDb.execute(`UPDATE suppliers SET current_balance = ? WHERE id = ?`, [newBalance, supplier.id]);
    await sqlDb.execute(`
      UPDATE supplier_transactions 
      SET cheque_status = 'CLEARED', credit_amount = ?, balance_after = ?, notes = notes || ' [Cleared in bank]'
      WHERE id = ?
    `, [totalCredit, newBalance, transactionId]);
  },

  /**
   * Supplier Return / Damaged Stock Claim (Wapsi / Khorak)
   * Math:
   *   newBalance = current_balance - returnAmount
   *   debit_amount = 0, credit_amount = returnAmount
   */
  async recordReturnClaim(
    supplierId: string,
    returnAmount: number,
    items: { product_id: string; return_qty: number; product_name?: string }[],
    notes?: string
  ): Promise<SupplierTransaction> {
    const supplier = await this.getSupplierById(supplierId);
    if (!supplier) throw new Error('Supplier not found.');

    const retAmt = Number(returnAmount);
    if (retAmt <= 0) throw new Error('Return claim amount must be greater than 0.');

    const newBalance = supplier.current_balance - retAmt;
    const txnId = `stx-ret-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    await sqlDb.execute(`
      UPDATE suppliers SET current_balance = ? WHERE id = ?
    `, [newBalance, supplierId]);

    await sqlDb.execute(`
      INSERT INTO supplier_transactions (
        id, supplier_id, type, debit_amount, credit_amount, amount, 
        balance_after, items_json, notes, created_at
      ) VALUES (?, ?, 'RETURN_CLAIM', 0, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `, [
      txnId,
      supplierId,
      retAmt,
      retAmt,
      newBalance,
      items.length > 0 ? JSON.stringify(items) : null,
      notes || 'Stock return / damage credit claim (Wapsi / Khorak)'
    ]);

    // Decrement returned stock from store inventory
    for (const it of items) {
      if (it.product_id && it.return_qty > 0) {
        await sqlDb.execute(`
          UPDATE products SET stock_qty = MAX(0, stock_qty - ?) WHERE id = ?
        `, [it.return_qty, it.product_id]);
      }
    }

    return (await sqlDb.get<SupplierTransaction>('SELECT * FROM supplier_transactions WHERE id = ?', [txnId]))!;
  },

  /**
   * Reversal Entry / Correction (Khaata Durusti)
   * User decision: Past rows are immutable; corrections are recorded via offsetting Adjustment rows.
   */
  async recordAdjustment(
    supplierId: string,
    amount: number,
    direction: 'DEBIT' | 'CREDIT',
    reason: string
  ): Promise<SupplierTransaction> {
    const supplier = await this.getSupplierById(supplierId);
    if (!supplier) throw new Error('Supplier not found.');

    if (!reason.trim()) throw new Error('Correction reason is mandatory for audit trail.');
    const adjAmt = Number(amount);
    if (adjAmt <= 0) throw new Error('Adjustment amount must be greater than 0.');

    const isDebit = direction === 'DEBIT'; // Store owes more (+)
    const newBalance = isDebit ? supplier.current_balance + adjAmt : supplier.current_balance - adjAmt;
    const txnType: SupplierTxnType = isDebit ? 'ADJUSTMENT_DEBIT' : 'ADJUSTMENT_CREDIT';
    const txnId = `stx-adj-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    await sqlDb.execute(`UPDATE suppliers SET current_balance = ? WHERE id = ?`, [newBalance, supplierId]);

    await sqlDb.execute(`
      INSERT INTO supplier_transactions (
        id, supplier_id, type, debit_amount, credit_amount, amount, 
        balance_after, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `, [
      txnId,
      supplierId,
      txnType,
      isDebit ? adjAmt : 0,
      isDebit ? 0 : adjAmt,
      adjAmt,
      newBalance,
      `[KHATA CORRECTION]: ${reason.trim()}`
    ]);

    return (await sqlDb.get<SupplierTransaction>('SELECT * FROM supplier_transactions WHERE id = ?', [txnId]))!;
  },

  /**
   * Advance Payment / Deposit (Peshgi)
   */
  async recordAdvanceDeposit(
    supplierId: string,
    amount: number,
    channel: SupplierPaymentChannel,
    refNo?: string,
    notes?: string
  ): Promise<SupplierTransaction> {
    const supplier = await this.getSupplierById(supplierId);
    if (!supplier) throw new Error('Supplier not found.');

    const advAmt = Number(amount);
    if (advAmt <= 0) throw new Error('Advance deposit amount must be greater than 0.');

    const newBalance = supplier.current_balance - advAmt;
    const txnId = `stx-adv-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    await sqlDb.execute(`UPDATE suppliers SET current_balance = ? WHERE id = ?`, [newBalance, supplierId]);

    await sqlDb.execute(`
      INSERT INTO supplier_transactions (
        id, supplier_id, type, debit_amount, credit_amount, amount, 
        balance_after, payment_channel, reference_no, notes, created_at
      ) VALUES (?, ?, 'ADVANCE_DEPOSIT', 0, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `, [
      txnId,
      supplierId,
      advAmt,
      advAmt,
      newBalance,
      channel,
      refNo || null,
      notes || 'Advance payment voucher (Peshgi)'
    ]);

    return (await sqlDb.get<SupplierTransaction>('SELECT * FROM supplier_transactions WHERE id = ?', [txnId]))!;
  },

  /**
   * Generate Period Statement with Carried Forward Balance (Sabqa Baqaya)
   */
  async getLedgerStatement(
    supplierId: string,
    startDate: string,
    endDate: string
  ): Promise<LedgerStatement> {
    const supplier = await this.getSupplierById(supplierId);
    if (!supplier) throw new Error('Supplier not found.');

    // 1. Calculate Opening Balance before startDate
    const priorTxns = await sqlDb.query<{ debit_amount: number; credit_amount: number }>(`
      SELECT debit_amount, credit_amount FROM supplier_transactions
      WHERE supplier_id = ? AND date(created_at) < date(?)
    `, [supplierId, startDate]);

    let openingBalance = 0;
    for (const t of priorTxns) {
      openingBalance += (t.debit_amount || 0) - (t.credit_amount || 0);
    }

    // 2. Fetch Period Transactions
    const periodTxns = await sqlDb.query<SupplierTransaction>(`
      SELECT * FROM supplier_transactions
      WHERE supplier_id = ? AND date(created_at) >= date(?) AND date(created_at) <= date(?)
      ORDER BY created_at ASC, id ASC
    `, [supplierId, startDate, endDate]);

    let totalDebits = 0;
    let totalCredits = 0;
    let totalSettlement = 0;
    let running = openingBalance;

    const recalculatedTxns = periodTxns.map(t => {
      totalDebits += t.debit_amount || 0;
      totalCredits += t.credit_amount || 0;
      totalSettlement += t.settlement_discount || 0;
      running += (t.debit_amount || 0) - (t.credit_amount || 0);
      return {
        ...t,
        balance_after: running
      };
    });

    return {
      supplier,
      start_date: startDate,
      end_date: endDate,
      opening_balance: openingBalance,
      total_debits: totalDebits,
      total_credits: totalCredits,
      total_settlement: totalSettlement,
      closing_balance: running,
      transactions: recalculatedTxns
    };
  },

  async deleteSupplier(supplierId: string): Promise<void> {
    const supp = await this.getSupplierById(supplierId);
    if (!supp) return;

    const statements: { sql: string; params?: any[] }[] = [];

    // Delete supplier transactions
    statements.push({
      sql: 'DELETE FROM supplier_transactions WHERE supplier_id = ?',
      params: [supplierId]
    });

    // Delete supplier
    statements.push({
      sql: 'DELETE FROM suppliers WHERE id = ?',
      params: [supplierId]
    });

    // Audit log
    const auditId = `aud-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    statements.push({
      sql: `
        INSERT INTO system_audit_logs (id, cashier, supervisor, invoice_number, action, status, timestamp, details)
        VALUES (?, 'ADMIN', 'ADMIN', 'N/A', 'SUPPLIER_DELETE', 'COMPLETED', ?, ?)
      `,
      params: [
        auditId,
        Date.now(),
        `Supplier "${supp.company} / ${supp.name}" (ID: ${supplierId}) deleted. Outstanding Balance was Rs. ${supp.current_balance}.`
      ]
    });

    await sqlDb.transaction(statements);
  }
};
