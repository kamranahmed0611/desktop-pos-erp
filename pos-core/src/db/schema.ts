import { sqlDb } from './sqlite';

export const INIT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  is_taxable INTEGER NOT NULL DEFAULT 0,
  tax_rate_percent REAL NOT NULL DEFAULT 18.0
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  sku TEXT UNIQUE NOT NULL,
  barcode TEXT UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  cost_price REAL NOT NULL DEFAULT 0.0,
  sale_price REAL NOT NULL DEFAULT 0.0,
  tax_rate REAL NOT NULL DEFAULT 0.0,
  stock_qty REAL NOT NULL DEFAULT 0.0,
  unit_type TEXT NOT NULL DEFAULT 'piece',
  is_weighable INTEGER NOT NULL DEFAULT 0,
  is_loose INTEGER NOT NULL DEFAULT 0,
  base_unit TEXT NOT NULL DEFAULT '',
  sale_unit TEXT NOT NULL DEFAULT '',
  unit_conversion_ratio REAL NOT NULL DEFAULT 1.0,
  subunit_sale_price REAL NOT NULL DEFAULT 0.0,
  min_stock_alert REAL NOT NULL DEFAULT 10.0,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT UNIQUE NOT NULL,
  customer_id TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  total_amount REAL NOT NULL DEFAULT 0.0,
  tax_amount REAL NOT NULL DEFAULT 0.0,
  discount_amount REAL NOT NULL DEFAULT 0.0,
  paid_amount REAL NOT NULL DEFAULT 0.0,
  change_due REAL NOT NULL DEFAULT 0.0,
  round_off_amount REAL NOT NULL DEFAULT 0.0,
  payment_mode TEXT NOT NULL DEFAULT 'cash',
  cashier_id TEXT,
  cashier_name TEXT,
  shift_id TEXT,
  is_retroactive INTEGER NOT NULL DEFAULT 0,
  inventory_deducted INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 1.0,
  unit_cost REAL NOT NULL DEFAULT 0.0,
  unit_price REAL NOT NULL DEFAULT 0.0,
  discount_amount REAL NOT NULL DEFAULT 0.0,
  tax_amount REAL NOT NULL DEFAULT 0.0,
  subtotal REAL NOT NULL DEFAULT 0.0,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  nickname TEXT,
  address TEXT,
  credit_limit REAL NOT NULL DEFAULT 25000.0,
  current_balance REAL NOT NULL DEFAULT 0.0,
  amanat_balance REAL NOT NULL DEFAULT 0.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS customer_transactions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  invoice_id TEXT,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  balance_after REAL NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  current_balance REAL NOT NULL DEFAULT 0.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS supplier_transactions (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  balance_after REAL NOT NULL,
  payment_channel TEXT,
  bank_name TEXT,
  reference_no TEXT,
  invoice_no TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  cashier_id TEXT NOT NULL,
  cashier_name TEXT NOT NULL,
  opening_float REAL NOT NULL DEFAULT 5000.0,
  closing_cash_actual REAL DEFAULT 0.0,
  expected_cash REAL NOT NULL DEFAULT 5000.0,
  total_sales_cash REAL NOT NULL DEFAULT 0.0,
  total_sales_card REAL NOT NULL DEFAULT 0.0,
  total_sales_digital REAL NOT NULL DEFAULT 0.0,
  total_sales_khata REAL NOT NULL DEFAULT 0.0,
  total_returns_cash REAL NOT NULL DEFAULT 0.0,
  total_petty_expenses REAL NOT NULL DEFAULT 0.0,
  variance REAL DEFAULT 0.0,
  variance_reason TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  opened_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS store_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export async function ensureSchemaAndSeed(): Promise<void> {
  try {
    // 1. Run Table Creations
    const statements = INIT_SCHEMA_SQL.split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const stmt of statements) {
      await sqlDb.execute(stmt);
    }

    // 2. Add missing columns safely if upgrading existing tables
    const safeAddColumn = async (table: string, columnDef: string) => {
      try {
        await sqlDb.execute(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
      } catch {}
    };

    await safeAddColumn('customers', 'amanat_balance REAL NOT NULL DEFAULT 0.0');
    await safeAddColumn('invoices', 'customer_name TEXT');
    await safeAddColumn('invoices', 'customer_phone TEXT');
    await safeAddColumn('invoices', 'cashier_name TEXT');
    await safeAddColumn('invoices', 'is_retroactive INTEGER NOT NULL DEFAULT 0');
    await safeAddColumn('invoices', 'inventory_deducted INTEGER NOT NULL DEFAULT 1');
    await safeAddColumn('invoices', 'round_off_amount REAL NOT NULL DEFAULT 0.0');
    await safeAddColumn('invoices', 'notes TEXT');
    await safeAddColumn('invoice_items', 'product_name TEXT NOT NULL DEFAULT ""');
    await safeAddColumn('invoice_items', 'is_taxable INTEGER NOT NULL DEFAULT 0');
    await safeAddColumn('invoice_items', 'unit_label TEXT DEFAULT ""');
    await safeAddColumn('shifts', 'cashier_name TEXT NOT NULL DEFAULT "Cashier #01"');
    await safeAddColumn('shifts', 'total_sales_digital REAL NOT NULL DEFAULT 0.0');
    await safeAddColumn('shifts', 'variance_reason TEXT');
    await safeAddColumn('shifts', 'variance_note TEXT');
    await safeAddColumn('shifts', 'closing_denominations TEXT');
    await safeAddColumn('products', 'is_loose INTEGER NOT NULL DEFAULT 0');
    await safeAddColumn('products', 'base_unit TEXT NOT NULL DEFAULT ""');
    await safeAddColumn('products', 'sale_unit TEXT NOT NULL DEFAULT ""');
    await safeAddColumn('products', 'unit_conversion_ratio REAL NOT NULL DEFAULT 1.0');
    await safeAddColumn('products', 'subunit_sale_price REAL NOT NULL DEFAULT 0.0');
    await safeAddColumn('suppliers', 'credit_limit REAL DEFAULT 0.0');
    await safeAddColumn('suppliers', 'payment_terms_days INTEGER DEFAULT 7');
    await safeAddColumn('suppliers', 'balance_type TEXT DEFAULT "PAYABLE"');
    await safeAddColumn('supplier_transactions', 'debit_amount REAL NOT NULL DEFAULT 0.0');
    await safeAddColumn('supplier_transactions', 'credit_amount REAL NOT NULL DEFAULT 0.0');
    await safeAddColumn('supplier_transactions', 'settlement_discount REAL DEFAULT 0.0');
    await safeAddColumn('supplier_transactions', 'bill_type TEXT DEFAULT "VERIFIED_BILL"');
    await safeAddColumn('supplier_transactions', 'cheque_status TEXT');
    await safeAddColumn('supplier_transactions', 'cheque_date TEXT');
    await safeAddColumn('supplier_transactions', 'freight_amount REAL DEFAULT 0.0');
    await safeAddColumn('supplier_transactions', 'tax_amount REAL DEFAULT 0.0');
    await safeAddColumn('supplier_transactions', 'gross_amount REAL DEFAULT 0.0');
    await safeAddColumn('supplier_transactions', 'deduct_from_drawer INTEGER DEFAULT 0');
    await safeAddColumn('supplier_transactions', 'items_json TEXT');

    // Safe Non-Destructive High-Speed Query Indexes
    try {
      await sqlDb.execute('CREATE INDEX IF NOT EXISTS idx_invoices_created_shift ON invoices(created_at, shift_id)');
      await sqlDb.execute('CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number)');
      await sqlDb.execute('CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id)');
      await sqlDb.execute('CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id)');
      await sqlDb.execute('CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)');
      await sqlDb.execute('CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)');
      await sqlDb.execute('CREATE INDEX IF NOT EXISTS idx_products_name ON products(name)');
      await sqlDb.execute('CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)');
    } catch {}

    // Ensure ad-hoc fallback item exists for freeform emergency lines
    await sqlDb.execute(`
      INSERT OR IGNORE INTO products (id, sku, barcode, name, category, cost_price, sale_price, stock_qty, unit_type, is_active)
      VALUES ('ad-hoc-item', 'AD-HOC', '000000000000', 'Custom Ad-Hoc Item', 'General', 0.0, 0.0, 999999.0, 'piece', 1)
    `);

    // Ensure Loose & Bulk Grocery category always exists
    await sqlDb.execute(`
      INSERT OR IGNORE INTO categories (id, name, is_taxable, tax_rate_percent)
      VALUES ('cat-loose-bulk', 'Loose & Bulk Grocery', 0, 0.0)
    `);

    // 3. Seed Clean Standard Categories if empty (Tax Rate: 18%, Default Is_Taxable: 0)
    const catCount = await sqlDb.get<{ count: number }>('SELECT count(*) as count FROM categories');
    if (!catCount || catCount.count === 0) {
      const defaultCategories = [
        'Loose & Bulk Grocery',
        'Dairy & Bakery',
        'Beverages & Drinks',
        'Cooking Oil & Ghee',
        'Staples & Grains',
        'Spices & Seasonings',
        'Household & Cleaning',
        'Snacks & Biscuits',
        'Personal Care',
        'General'
      ];
      for (const cat of defaultCategories) {
        await sqlDb.execute(
          'INSERT OR IGNORE INTO categories (id, name, is_taxable, tax_rate_percent) VALUES (?, ?, 0, 18.0)',
          [`cat-${cat.toLowerCase().replace(/[^a-z0-9]/g, '-')}`, cat]
        );
      }
    }

    // 6. Clean any legacy NaN barcodes automatically
    try {
      const nanRows = await sqlDb.query<{ id: string }>("SELECT id FROM products WHERE barcode LIKE '%NaN%'");
      for (const row of nanRows) {
        const prefix = '8964';
        const randomMiddle = Math.floor(10000000 + Math.random() * 90000000).toString();
        const raw12 = (prefix + randomMiddle).substring(0, 12);
        let sum = 0;
        for (let i = 0; i < 12; i++) {
          sum += i % 2 === 0 ? parseInt(raw12[i], 10) : parseInt(raw12[i], 10) * 3;
        }
        const checkDigit = (10 - (sum % 10)) % 10;
        await sqlDb.execute('UPDATE products SET barcode = ? WHERE id = ?', [`${raw12}${checkDigit}`, row.id]);
      }
    } catch {}

    console.log('[pos-core] Clean SQLite schema verified and ready in grocery_master.db.');
  } catch (err) {
    console.error('[pos-core] Error initializing schema:', err);
  }
}

/**
 * Clean Database Utility
 * Wipes all dummy / test data from grocery_master.db for clean operational deployment
 */
export async function cleanDatabase(): Promise<void> {
  await sqlDb.execute('DELETE FROM invoice_items');
  await sqlDb.execute('DELETE FROM invoices');
  await sqlDb.execute('DELETE FROM customer_transactions');
  await sqlDb.execute('DELETE FROM customers');
  await sqlDb.execute('DELETE FROM supplier_transactions');
  await sqlDb.execute('DELETE FROM suppliers');
  await sqlDb.execute("DELETE FROM products WHERE id != 'ad-hoc-item'");
  await sqlDb.execute('DELETE FROM shifts');
  try { await sqlDb.execute('DELETE FROM void_bills'); } catch {}
  try { await sqlDb.execute('DELETE FROM cash_drops'); } catch {}
  try { await sqlDb.execute('DELETE FROM expenses'); } catch {}
  console.log('[pos-core] Database wiped clean. All test records removed.');
}
