import { sqlDb } from '../db/sqlite';
import { CurrencyDenominations, Shift } from '../types';

export const shiftService = {
  async getActiveShift(): Promise<Shift | null> {
    return sqlDb.get<Shift>(`
      SELECT * FROM shifts WHERE UPPER(status) = 'OPEN' ORDER BY opened_at DESC LIMIT 1
    `);
  },

  async openShift(cashierId: string, cashierName: string, openingFloat = 5000): Promise<Shift> {
    const existing = await this.getActiveShift();
    if (existing) {
      return existing;
    }

    const id = `shift-${Date.now()}`;
    await sqlDb.execute(`
      INSERT INTO shifts (
        id, cashier_id, cashier_name, opening_float, expected_cash,
        total_sales_cash, total_sales_card, total_sales_digital, total_sales_khata,
        total_returns_cash, total_petty_expenses, status, opened_at
      ) VALUES (?, ?, ?, ?, ?, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 'OPEN', datetime('now', 'localtime'))
    `, [id, cashierId, cashierName, openingFloat, openingFloat]);

    return (await sqlDb.get<Shift>('SELECT * FROM shifts WHERE id = ?', [id]))!;
  },

  calculateTotalCash(denoms: CurrencyDenominations): number {
    return (
      (denoms.notes_5000 || 0) * 5000 +
      (denoms.notes_1000 || 0) * 1000 +
      (denoms.notes_500 || 0) * 500 +
      (denoms.notes_100 || 0) * 100 +
      (denoms.notes_50 || 0) * 50 +
      (denoms.notes_20 || 0) * 20 +
      (denoms.notes_10 || 0) * 10 +
      (denoms.coins || 0)
    );
  },

  async closeShiftBlind(
    shiftId: string,
    denominations: CurrencyDenominations,
    varianceReason?: string,
    pettyExpenseAmount: number = 0,
    pettyExpenseNotes: string = ''
  ): Promise<Shift> {
    const shift = await sqlDb.get<Shift>('SELECT * FROM shifts WHERE id = ?', [shiftId]);
    if (!shift) throw new Error('Shift not found.');

    // If petty expenses were incurred (e.g. staff tea/cleaning), record and deduct
    if (pettyExpenseAmount > 0) {
      await sqlDb.execute(`
        CREATE TABLE IF NOT EXISTS expenses (
          id TEXT PRIMARY KEY,
          shift_id TEXT,
          cashier_name TEXT,
          amount REAL,
          notes TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        )
      `);
      await sqlDb.execute(`
        INSERT INTO expenses (id, shift_id, cashier_name, amount, notes, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
      `, [`exp-${Date.now()}`, shiftId, shift.cashier_name, pettyExpenseAmount, pettyExpenseNotes]);

      await sqlDb.execute(`
        UPDATE shifts SET
          total_petty_expenses = total_petty_expenses + ?,
          expected_cash = expected_cash - ?
        WHERE id = ?
      `, [pettyExpenseAmount, pettyExpenseAmount, shiftId]);

      // refresh expected_cash
      shift.expected_cash -= pettyExpenseAmount;
      shift.total_petty_expenses += pettyExpenseAmount;
    }

    const actualCash = this.calculateTotalCash(denominations);
    const variance = actualCash - shift.expected_cash;
    const finalReason = varianceReason || (variance === 0 ? 'Exact match' : 'Unexplained discrepancy');

    await sqlDb.execute(`
      UPDATE shifts SET
        closing_cash_actual = ?,
        variance = ?,
        variance_reason = ?,
        variance_note = ?,
        closing_denominations = ?,
        status = 'CLOSED',
        closed_at = datetime('now', 'localtime')
      WHERE id = ?
    `, [actualCash, variance, finalReason, finalReason, JSON.stringify(denominations), shiftId]);

    return (await sqlDb.get<Shift>('SELECT * FROM shifts WHERE id = ?', [shiftId]))!;
  },

  async recordShiftReturnOrExpense(
    shiftId: string,
    amount: number,
    type: 'RETURN' | 'PETTY_EXPENSE',
    reason: string
  ): Promise<void> {
    if (type === 'RETURN') {
      await sqlDb.execute(`
        UPDATE shifts SET
          total_returns_cash = total_returns_cash + ?,
          expected_cash = expected_cash - ?
        WHERE id = ?
      `, [amount, amount, shiftId]);
    } else {
      await sqlDb.execute(`
        UPDATE shifts SET
          total_petty_expenses = total_petty_expenses + ?,
          expected_cash = expected_cash - ?
        WHERE id = ?
      `, [amount, amount, shiftId]);
    }
  }
};
