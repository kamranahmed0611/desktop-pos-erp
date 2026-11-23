# Canonical Database Architecture & Non-Destructive Migration Engine

> **Critical Mandate:** The store owner is currently adding items into `grocery_master.db`.  
> Every deployment, startup, and code update must guarantee **100% Zero Data Loss**.

---

## 1. Database Location & Priority Path Resolver

The application must dynamically locate and connect to the existing production database using the following resolution chain in the Electron main process:

```
[START BOOT]
       │
       ▼
Check Candidate 1:
%APPDATA%\grocery-store-pos\grocery_master.db (EXISTING PRODUCTION DB)
       │─── Exists? ──► [USE THIS PATH] ──┐
       ▼ No                               │
Check Candidate 2:                        │
%APPDATA%\Point of Sale & ERP System\grocery_master.db
       │─── Exists? ──► [USE THIS PATH] ──┤
       ▼ No                               │
Check Candidate 3:                        │
%APPDATA%\mr-super-store-pos\grocery_master.db
       │─── Exists? ──► [USE THIS PATH] ──┤
       ▼ No                               │
Fallback Candidate 4:                     │
App Resources / Working Directory Path    │
       │─── Found / Initialize Clean ───► │
                                          ▼
                      [CREATE INSTANT TIMESTAMPED .BAK]
                                          │
                                          ▼
                      [RUN NON-DESTRUCTIVE ADDITIVE MIGRATIONS]
                                          │
                                          ▼
                      [INITIALIZE WAL & SYNCHRONOUS PRAGMAS]
```

### Pre-Boot Backup Creation Routine
Before connecting with write permissions or executing any schema adjustments, the system executes:
```typescript
const backupDir = path.join(app.getPath('userData'), 'POS_Backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `pre_upgrade_grocery_master_${timestamp}.bak`);
fs.copyFileSync(resolvedDbPath, backupPath);
```

---

## 2. Power-Loss Resilient SQLite Configuration

To withstand sudden power cuts and load-shedding common on retail counters:
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA busy_timeout = 5000;
PRAGMA cache_size = -8000; -- 8MB cache
PRAGMA foreign_keys = ON;
PRAGMA auto_vacuum = INCREMENTAL;
```

---

## 3. Canonical Database Schema

### Table: `products`
```sql
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barcode TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    urdu_name TEXT,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    cost_price REAL NOT NULL DEFAULT 0.0,
    sale_price REAL NOT NULL DEFAULT 0.0,
    stock_quantity REAL NOT NULL DEFAULT 0.0,
    min_stock_alert REAL NOT NULL DEFAULT 5.0,
    is_loose INTEGER NOT NULL DEFAULT 0,          -- 0 = Unit/Pack, 1 = Loose Produce (Kg)
    loose_unit TEXT DEFAULT 'kg',
    whole_bags_stock REAL NOT NULL DEFAULT 0.0,    -- Bori / Carton count
    bag_weight_kg REAL NOT NULL DEFAULT 50.0,      -- Weight of 1 whole bag in kg
    tax_rate REAL NOT NULL DEFAULT 0.0,            -- Percent (0.0 if exempt/included)
    is_archived INTEGER NOT NULL DEFAULT 0,        -- Soft delete
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
```

### Table: `product_barcodes` (Multi-Barcode Support per Item)
```sql
CREATE TABLE IF NOT EXISTS product_barcodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    barcode TEXT UNIQUE NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_alt_barcodes_barcode ON product_barcodes(barcode);
CREATE INDEX IF NOT EXISTS idx_alt_barcodes_pid ON product_barcodes(product_id);
```

### Table: `categories`
```sql
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    discount_percentage REAL NOT NULL DEFAULT 0.0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Table: `transactions`
```sql
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_no TEXT UNIQUE NOT NULL,
    shift_id INTEGER REFERENCES shifts(id),
    cashier_id INTEGER NOT NULL,
    cashier_name TEXT NOT NULL,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    subtotal REAL NOT NULL,
    discount_amount REAL NOT NULL DEFAULT 0.0,
    tax_amount REAL NOT NULL DEFAULT 0.0,
    kasar_amount REAL NOT NULL DEFAULT 0.0,
    rounding_amount REAL NOT NULL DEFAULT 0.0,     -- Nearest Rs. 5 adjustment
    final_total REAL NOT NULL,
    payment_method TEXT NOT NULL,                  -- CASH, CARD, DIGITAL, KHATA, SPLIT
    payment_details_json TEXT,                     -- Details if split or digital ref
    tendered_amount REAL NOT NULL DEFAULT 0.0,
    change_amount REAL NOT NULL DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'COMPLETED',      -- COMPLETED, VOIDED, RETURNED
    is_emergency INTEGER NOT NULL DEFAULT 0,       -- 1 if retroactive/emergency bill
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_transactions_invoice ON transactions(invoice_no);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_shift ON transactions(shift_id);
CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions(customer_id);
```

### Table: `transaction_items`
```sql
CREATE TABLE IF NOT EXISTS transaction_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    barcode TEXT NOT NULL,
    product_name TEXT NOT NULL,
    cost_price REAL NOT NULL,                      -- Historical cost at sale time
    unit_price REAL NOT NULL,                      -- Sale price per unit/kg
    quantity REAL NOT NULL,                        -- Units or kg
    line_total REAL NOT NULL,
    is_loose INTEGER NOT NULL DEFAULT 0,
    disposition TEXT NOT NULL DEFAULT 'SOLD'       -- SOLD, RETURN_RESTOCK, RETURN_SCRAP
);
CREATE INDEX IF NOT EXISTS idx_items_tx ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_items_pid ON transaction_items(product_id);
```

### Table: `customers` (Khata & Bahi Khata)
```sql
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_no TEXT UNIQUE,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    credit_limit REAL NOT NULL DEFAULT 0.0,
    udhaar_balance REAL NOT NULL DEFAULT 0.0,      -- Money customer owes store
    amanat_balance REAL NOT NULL DEFAULT 0.0,      -- Advance customer deposited with store
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
```

### Table: `customer_ledger`
```sql
CREATE TABLE IF NOT EXISTS customer_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
    entry_type TEXT NOT NULL,                      -- SALE_CREDIT, RECOVERY_WASOOLI, KASAR_DISCOUNT, AMANAT_DEPOSIT, AMANAT_DRAWDOWN, RETURN_CREDIT
    amount REAL NOT NULL,
    balance_after REAL NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cust_ledger_cid ON customer_ledger(customer_id);
```

### Table: `suppliers` (Wholesale Procurement & Wapsi)
```sql
CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    company TEXT,
    type TEXT NOT NULL DEFAULT 'POST_DELIVERY_CREDIT', -- ADVANCE_PREPAID, POST_DELIVERY_CREDIT
    balance REAL NOT NULL DEFAULT 0.0,
    pending_wapsi_amount REAL NOT NULL DEFAULT 0.0,    -- Outstanding return claims
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
```

### Table: `supplier_ledger`
```sql
CREATE TABLE IF NOT EXISTS supplier_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    entry_type TEXT NOT NULL,                      -- DELIVERY_BILL, PAYMENT, WAPSI_RETURN, KASAR
    amount REAL NOT NULL,
    balance_after REAL NOT NULL,
    reference_no TEXT,
    deduct_from_drawer INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_supp_ledger_sid ON supplier_ledger(supplier_id);
```

### Table: `shifts` (Blind Cash Reconciliation & Z-Reports)
```sql
CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cashier_id INTEGER NOT NULL,
    cashier_name TEXT NOT NULL,
    opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    opening_float REAL NOT NULL DEFAULT 0.0,
    expected_cash REAL NOT NULL DEFAULT 0.0,       -- Hidden from cashier until count entered
    counted_cash REAL NOT NULL DEFAULT 0.0,
    cash_variance REAL NOT NULL DEFAULT 0.0,       -- counted_cash - expected_cash
    variance_reason TEXT,
    denominations_json TEXT,                       -- Breakdown of 5000, 1000, 500, 100, etc.
    status TEXT NOT NULL DEFAULT 'OPEN'            -- OPEN, CLOSED
);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
```

### Table: `cash_drawer_events`
```sql
CREATE TABLE IF NOT EXISTS cash_drawer_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,                      -- FLOAT, SALE_CASH, RETURN_CASH, EXPENSE_PAYOUT, SUPPLIER_PAYOUT, CASH_DROP
    amount REAL NOT NULL,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_drawer_events_sid ON cash_drawer_events(shift_id);
```

### Table: `expenses` (Ctrl+D Petty Dukaan Kharch)
```sql
CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
    category TEXT NOT NULL,                        -- CHAI_FOOD, BILLS_FUEL, CLEANING_MAINT, MISC
    amount REAL NOT NULL,
    description TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_expenses_shift ON expenses(shift_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(created_at);
```

### Table: `users` (Staff & Cashier PINs)
```sql
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    pin TEXT NOT NULL,                             -- 4-6 digit numeric PIN
    role TEXT NOT NULL DEFAULT 'CASHIER',          -- ADMIN, CASHIER
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Table: `settings` (Key-Value Config)
```sql
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

---

## 4. Programmatic Non-Destructive Migration Engine

When upgrading an existing database, the engine runs programmatic column presence checks using `PRAGMA table_info` and executes additive `ALTER TABLE` statements:

```typescript
export function runAdditiveMigrations(db: Database.Database): void {
  const ensureColumn = (table: string, column: string, typeDef: string) => {
    const columns = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
    const exists = columns.some((c) => c.name.toLowerCase() === column.toLowerCase());
    if (!exists) {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeDef}`).run();
    }
  };

  // Products table additions
  ensureColumn('products', 'urdu_name', 'TEXT');
  ensureColumn('products', 'is_loose', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('products', 'loose_unit', "TEXT DEFAULT 'kg'");
  ensureColumn('products', 'whole_bags_stock', 'REAL NOT NULL DEFAULT 0.0');
  ensureColumn('products', 'bag_weight_kg', 'REAL NOT NULL DEFAULT 50.0');
  ensureColumn('products', 'tax_rate', 'REAL NOT NULL DEFAULT 0.0');
  ensureColumn('products', 'is_archived', 'INTEGER NOT NULL DEFAULT 0');

  // Transactions table additions
  ensureColumn('transactions', 'kasar_amount', 'REAL NOT NULL DEFAULT 0.0');
  ensureColumn('transactions', 'rounding_amount', 'REAL NOT NULL DEFAULT 0.0');
  ensureColumn('transactions', 'is_emergency', 'INTEGER NOT NULL DEFAULT 0');

  // Customers table additions
  ensureColumn('customers', 'account_no', 'TEXT');
  ensureColumn('customers', 'amanat_balance', 'REAL NOT NULL DEFAULT 0.0');

  // Suppliers table additions
  ensureColumn('suppliers', 'type', "TEXT NOT NULL DEFAULT 'POST_DELIVERY_CREDIT'");
  ensureColumn('suppliers', 'pending_wapsi_amount', 'REAL NOT NULL DEFAULT 0.0');

  // Create child tables if not existing
  // (product_barcodes, cash_drawer_events, expenses, etc.)
}
```

This guarantees 100% preservation of every single product, customer, and price previously entered by the store owner.

