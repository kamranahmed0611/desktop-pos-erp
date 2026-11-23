const { app, BrowserWindow, session, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

console.log('[Main] Process starting, isPackaged:', app.isPackaged);
const gotTheLock = app.requestSingleInstanceLock();
console.log('[Main] Got single instance lock:', gotTheLock);
if (!gotTheLock) {
  console.log('[Main] Another instance is already running, quitting.');
  app.quit();
}

/**
 * Scrypt Password/PIN Hashing Helpers (Zero External Dependencies)
 * Standard Node.js crypto scrypt (N=16384, r=8, p=1, keylen=64)
 */
function hashPinWithScrypt(pin, customSalt) {
  const salt = customSalt || crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(pin, salt, 64);
  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

function verifyScryptPin(pin, storedHash) {
  if (!storedHash || !pin) return false;
  if (storedHash.startsWith('scrypt:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 3) return false;
    const salt = parts[1];
    const expectedHash = parts[2];
    try {
      const derivedKey = crypto.scryptSync(pin, salt, 64);
      const expectedBuf = Buffer.from(expectedHash, 'hex');
      return crypto.timingSafeEqual(derivedKey, expectedBuf);
    } catch {
      return false;
    }
  }
  // Fallback for unmigrated legacy development records
  return pin === storedHash;
}

function migrateUserPinsToScrypt(db) {
  if (!db) return;
  try {
    const users = db.prepare('SELECT id, pin_code FROM users').all();
    const updateStmt = db.prepare('UPDATE users SET pin_code = ? WHERE id = ?');
    let count = 0;
    for (const u of users) {
      if (u.pin_code && !u.pin_code.startsWith('scrypt:')) {
        const hashed = hashPinWithScrypt(u.pin_code);
        updateStmt.run(hashed, u.id);
        count++;
      }
    }
    if (count > 0) {
      console.log(`[Main Process] Migrated ${count} users to scrypt salted hashes.`);
    }
  } catch (e) {
    console.warn('[Main Process] Notice during PIN scrypt migration:', e.message);
  }
}

function getCandidateDatabasePaths() {
  const candidates = [];
  if (process.env.POS_DB_PATH) {
    candidates.push(process.env.POS_DB_PATH);
  }

  const appDataRoaming = process.env.APPDATA || (process.platform === 'win32'
    ? path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming')
    : app.getPath('userData'));

  // Priority 1: Point of Sale & ERP
  candidates.push(path.join(appDataRoaming, 'Point of Sale & ERP', 'grocery_master.db'));
  candidates.push(path.join(appDataRoaming, 'pos-product', 'grocery_master.db'));
  candidates.push(path.join(appDataRoaming, 'grocery-store-pos', 'grocery_master.db'));
  candidates.push(path.join(appDataRoaming, 'MR Super Store POS', 'grocery_master.db'));
  candidates.push(path.join(appDataRoaming, 'mr-super-store-pos', 'grocery_master.db'));
  // Priority 4: Electron userData path
  try {
    candidates.push(path.join(app.getPath('userData'), 'grocery_master.db'));
  } catch (e) {}

  // Priority 5: Fallback seed paths
  candidates.push(path.join(process.resourcesPath, 'grocery_master.db'));
  candidates.push(path.join(app.getAppPath ? app.getAppPath() : process.cwd(), 'grocery_master.db'));
  candidates.push(path.join(process.cwd(), 'grocery_master.db'));

  return candidates;
}

function createPreBootBackup(dbPath) {
  try {
    if (!fs.existsSync(dbPath)) return;
    const stats = fs.statSync(dbPath);
    if (stats.size === 0) return;

    const backupDir = path.join(path.dirname(dbPath), 'POS_Backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `pre_upgrade_grocery_master_${timestamp}.bak`);
    fs.copyFileSync(dbPath, backupPath);
    console.log(`[Safe Database Engine] Pre-boot snapshot successfully created: ${backupPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  } catch (err) {
    console.warn('[Safe Database Engine] Notice creating pre-boot backup snapshot:', err.message);
  }
}

function resolveAndPrepareDatabase() {
  const candidates = getCandidateDatabasePaths();
  let resolvedPath = null;

  // Search in priority order for existing database
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      resolvedPath = p;
      console.log(`[Safe Database Engine] Latching onto existing database at: ${resolvedPath}`);
      break;
    }
  }

  // If no database exists anywhere, initialize fresh in canonical AppData folder
  if (!resolvedPath) {
    const defaultDir = path.join(
      process.env.APPDATA || app.getPath('userData'),
      'grocery-store-pos'
    );
    if (!fs.existsSync(defaultDir)) {
      fs.mkdirSync(defaultDir, { recursive: true });
    }
    resolvedPath = path.join(defaultDir, 'grocery_master.db');

    // Copy seed if available in resources
    const seedCandidates = [
      path.join(process.resourcesPath, 'grocery_master.db'),
      path.join(app.getAppPath ? app.getAppPath() : process.cwd(), 'grocery_master.db'),
      path.join(process.cwd(), 'grocery_master.db')
    ];
    for (const seed of seedCandidates) {
      if (fs.existsSync(seed)) {
        try {
          fs.copyFileSync(seed, resolvedPath);
          console.log(`[Safe Database Engine] Initialized canonical database from seed ${seed} -> ${resolvedPath}`);
          break;
        } catch (e) {
          console.warn('[Safe Database Engine] Seed copy notice:', e.message);
        }
      }
    }
  }

  // M1.2: Pre-Boot Backup Snapshot Engine
  createPreBootBackup(resolvedPath);

  return resolvedPath;
}

function runAdditiveMigrations(db) {
  if (!db) return;

  const ensureColumn = (table, column, def) => {
    try {
      const cols = db.pragma(`table_info(${table})`);
      if (Array.isArray(cols)) {
        const found = cols.some((c) => c.name.toLowerCase() === column.toLowerCase());
        if (!found) {
          console.log(`[Migration Engine] Adding missing column ${table}.${column} ${def}`);
          db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`).run();
        }
      }
    } catch (e) {
      console.warn(`[Migration Engine] Notice ensuring ${table}.${column}:`, e.message);
    }
  };

  try {
    // 1. Ensure core parent tables exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        discount_percentage REAL NOT NULL DEFAULT 0.0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

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
        is_loose INTEGER NOT NULL DEFAULT 0,
        loose_unit TEXT DEFAULT 'kg',
        whole_bags_stock REAL NOT NULL DEFAULT 0.0,
        bag_weight_kg REAL NOT NULL DEFAULT 50.0,
        tax_rate REAL NOT NULL DEFAULT 0.0,
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS product_barcodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        barcode TEXT UNIQUE NOT NULL,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_prod_alt_barcode ON product_barcodes(barcode);

      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_no TEXT UNIQUE,
        name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        credit_limit REAL NOT NULL DEFAULT 0.0,
        udhaar_balance REAL NOT NULL DEFAULT 0.0,
        amanat_balance REAL NOT NULL DEFAULT 0.0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS customer_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        transaction_id INTEGER,
        entry_type TEXT NOT NULL,
        amount REAL NOT NULL,
        balance_after REAL NOT NULL,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        company TEXT,
        type TEXT NOT NULL DEFAULT 'POST_DELIVERY_CREDIT',
        balance REAL NOT NULL DEFAULT 0.0,
        pending_wapsi_amount REAL NOT NULL DEFAULT 0.0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS supplier_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        entry_type TEXT NOT NULL,
        amount REAL NOT NULL,
        balance_after REAL NOT NULL,
        reference_no TEXT,
        deduct_from_drawer INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS shifts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cashier_id INTEGER NOT NULL,
        cashier_name TEXT NOT NULL,
        opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        closed_at DATETIME,
        opening_float REAL NOT NULL DEFAULT 0.0,
        expected_cash REAL NOT NULL DEFAULT 0.0,
        counted_cash REAL NOT NULL DEFAULT 0.0,
        cash_variance REAL NOT NULL DEFAULT 0.0,
        variance_reason TEXT,
        denominations_json TEXT,
        status TEXT NOT NULL DEFAULT 'OPEN'
      );

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
        rounding_amount REAL NOT NULL DEFAULT 0.0,
        final_total REAL NOT NULL,
        payment_method TEXT NOT NULL,
        payment_details_json TEXT,
        tendered_amount REAL NOT NULL DEFAULT 0.0,
        change_amount REAL NOT NULL DEFAULT 0.0,
        status TEXT NOT NULL DEFAULT 'COMPLETED',
        is_emergency INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS transaction_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        barcode TEXT NOT NULL,
        product_name TEXT NOT NULL,
        cost_price REAL NOT NULL,
        unit_price REAL NOT NULL,
        quantity REAL NOT NULL,
        line_total REAL NOT NULL,
        is_loose INTEGER NOT NULL DEFAULT 0,
        disposition TEXT NOT NULL DEFAULT 'SOLD'
      );

      CREATE TABLE IF NOT EXISTS cash_drawer_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        amount REAL NOT NULL,
        reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        username TEXT UNIQUE,
        pin_code TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'CASHIER',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS system_audit_logs (
        id TEXT PRIMARY KEY,
        cashier TEXT,
        supervisor TEXT,
        invoice_number TEXT,
        action TEXT,
        status TEXT,
        timestamp INTEGER,
        details TEXT
      );

      CREATE TABLE IF NOT EXISTS security_lockout (
        id TEXT PRIMARY KEY,
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until_ms INTEGER NOT NULL DEFAULT 0,
        last_attempt_at INTEGER NOT NULL DEFAULT 0
      );
      INSERT OR IGNORE INTO security_lockout (id, failed_attempts, locked_until_ms, last_attempt_at)
      VALUES ('terminal_lockout', 0, 0, 0);
    `);

    // 2. Additive columns for existing tables
    ensureColumn('products', 'urdu_name', 'TEXT');
    ensureColumn('products', 'is_loose', 'INTEGER NOT NULL DEFAULT 0');
    ensureColumn('products', 'loose_unit', "TEXT DEFAULT 'kg'");
    ensureColumn('products', 'whole_bags_stock', 'REAL NOT NULL DEFAULT 0.0');
    ensureColumn('products', 'bag_weight_kg', 'REAL NOT NULL DEFAULT 50.0');
    ensureColumn('products', 'tax_rate', 'REAL NOT NULL DEFAULT 0.0');
    ensureColumn('products', 'is_archived', 'INTEGER NOT NULL DEFAULT 0');

    ensureColumn('transactions', 'kasar_amount', 'REAL NOT NULL DEFAULT 0.0');
    ensureColumn('transactions', 'rounding_amount', 'REAL NOT NULL DEFAULT 0.0');
    ensureColumn('transactions', 'is_emergency', 'INTEGER NOT NULL DEFAULT 0');

    ensureColumn('customers', 'account_no', 'TEXT');
    ensureColumn('customers', 'amanat_balance', 'REAL NOT NULL DEFAULT 0.0');

    ensureColumn('suppliers', 'type', "TEXT NOT NULL DEFAULT 'POST_DELIVERY_CREDIT'");
    ensureColumn('suppliers', 'pending_wapsi_amount', 'REAL NOT NULL DEFAULT 0.0');

    // 3. Migrate plaintext PINs to scrypt
    migrateUserPinsToScrypt(db);

    console.log('[Migration Engine] Non-destructive additive migrations executed successfully.');
  } catch (err) {
    console.error('[Migration Engine] Migration error:', err);
  }
}

// Master SQLite Connection owned exclusively by Main process
let mainDb = null;
try {
  const Database = require('better-sqlite3');
  const dbPath = resolveAndPrepareDatabase();
  process.env.POS_DB_PATH = dbPath;
  mainDb = new Database(dbPath);
  mainDb.pragma('journal_mode = WAL');
  mainDb.pragma('synchronous = FULL');
  mainDb.pragma('busy_timeout = 5000');
  mainDb.pragma('cache_size = -8000');
  mainDb.pragma('foreign_keys = ON');

  const syncVal = mainDb.pragma('synchronous', { simple: true });
  console.log(`[Main Process] SQLite master established at ${dbPath}. PRAGMA synchronous = ${syncVal} (FULL durability enforced)`);

  // Run non-destructive additive migrations
  runAdditiveMigrations(mainDb);
} catch (e) {
  console.warn('[Main Process] Could not open master SQLite in main process:', e.message);
}

// Embedded Express & SQLite Bridge Server (Ensures Standalone Installer works everywhere)
function startEmbeddedApiServer() {
  if (!mainDb) return;
  try {
    const express = require('express');
    const cors = require('cors');
    const api = express();
    api.use(cors());
    api.use(express.json({ limit: '10mb' }));

    api.post('/api/sql/query', (req, res) => {
      const { sql, params = [] } = req.body;
      try {
        const rows = mainDb.prepare(sql).all(...params);
        res.json({ success: true, rows });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    api.post('/api/sql/get', (req, res) => {
      const { sql, params = [] } = req.body;
      try {
        const row = mainDb.prepare(sql).get(...params);
        res.json({ success: true, row: row || null });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    api.post('/api/sql/execute', (req, res) => {
      const { sql, params = [] } = req.body;
      try {
        const result = mainDb.prepare(sql).run(...params);
        res.json({ success: true, changes: result.changes, lastInsertRowid: result.lastInsertRowid });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    api.post('/api/sql/transaction', (req, res) => {
      const { statements = [] } = req.body;
      try {
        const txn = mainDb.transaction(() => {
          const results = [];
          for (const stmt of statements) {
            const r = mainDb.prepare(stmt.sql).run(...(stmt.params || []));
            results.push(r);
          }
          return results;
        });
        const results = txn();
        res.json({ success: true, results });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    const srv = api.listen(3001, '127.0.0.1', () => {
      console.log('[Main Process] Standalone Embedded Express SQLite API running on 127.0.0.1:3001');
    });

    srv.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log('[Main Process] Port 3001 already bound by external dev server.');
      } else {
        console.warn('[Main Process] Embedded server notice:', err.message);
      }
    });
  } catch (e) {
    console.warn('[Main Process] Notice starting embedded API:', e.message);
  }
}

// Start embedded server
startEmbeddedApiServer();

function getHtmlPath() {
  const candidates = [
    path.join(__dirname, '../dist-core/index.html'),
    path.join(app.getAppPath(), 'dist-core/index.html'),
    path.join(process.resourcesPath, 'app.asar/dist-core/index.html'),
    path.join(process.cwd(), 'dist-core/index.html'),
    path.join(__dirname, '../dist/index.html')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      console.log(`[Main Process] Resolved HTML path: ${p}`);
      return p;
    }
  }
  return path.join(__dirname, '../dist-core/index.html');
}

// In-Memory Short-Lived Security Auth Tokens (60s TTL, single-use)
const activeAuthTokens = new Map();

function hasOpenShift() {
  if (!mainDb) return false;
  try {
    const row = mainDb.prepare("SELECT id, cashier_name FROM shifts WHERE UPPER(status) = 'OPEN' LIMIT 1").get();
    return Boolean(row);
  } catch (e) {
    return false;
  }
}

let cashierWindow = null;
let adminWindow = null;
let isAppQuitting = false;

app.on('before-quit', () => {
  isAppQuitting = true;
  if (mainDb) {
    try {
      mainDb.pragma('wal_checkpoint(TRUNCATE)');
    } catch (e) {
      console.warn('[SQLite] WAL checkpoint notice on quit:', e?.message);
    }
  }
});

app.on('will-quit', () => {
  if (mainDb) {
    try {
      mainDb.close();
      mainDb = null;
    } catch {}
  }
});

const preloadPath = path.join(__dirname, 'preload.cjs');

function createCashierWindow() {
  cashierWindow = new BrowserWindow({
    title: 'Point of Sale & ERP',
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  });

  if (app.isPackaged) {
    cashierWindow.removeMenu();
  }

  cashierWindow.maximize();
  cashierWindow.show();

  // Delegate all external URLs and WhatsApp links to the default system browser / WhatsApp app
  cashierWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('whatsapp:') || url.startsWith('mailto:')) {
      const { shell } = require('electron');
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  cashierWindow.webContents.on('console-message', (_event, _level, message) => {
    console.log(`[Cashier Renderer] ${message}`);
  });

  cashierWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Cashier Renderer] Failed to load URL: ${validatedURL} (${errorCode} - ${errorDescription})`);
  });

  cashierWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      cashierWindow.webContents.toggleDevTools();
    }
  });

  // Load Main Station route
  if (process.env.ELECTRON_LOAD_DIST === '1') {
    cashierWindow.loadFile(getHtmlPath());
  } else if (isDev) {
    const port = process.env.PORT || 3000;
    cashierWindow.loadURL(`http://localhost:${port}`).catch(() => {
      cashierWindow.loadFile(getHtmlPath());
    });
  } else {
    cashierWindow.loadFile(getHtmlPath());
  }

  // Guard: Block closing the cashier terminal if an active shift is OPEN, unless OS shutdown or on Gateway
  cashierWindow.on('close', (e) => {
    if (isAppQuitting) {
      return; // Never block Windows OS shutdown / reboot
    }
    const currentUrl = (cashierWindow && cashierWindow.webContents && cashierWindow.webContents.getURL()) || '';
    const isCashierBilling = currentUrl.toLowerCase().includes('cashier');

    // Only guard if the cashier is actively inside Cashier Billing mode AND an open shift exists
    if (isCashierBilling && hasOpenShift()) {
      e.preventDefault();
      console.warn('[Main Process] Cashier window close guarded: Active shift is open');
      cashierWindow.webContents.send('shift:cannot-close', {
        message: 'Active shift is still OPEN. Please perform Shift Reconciliation / Close Shift [F7] before exiting.'
      });
      const choice = dialog.showMessageBoxSync(cashierWindow, {
        type: 'warning',
        title: 'Active Cashier Shift Open',
        message: 'An active cashier shift is currently OPEN in the cash drawer.\n\nPlease close the shift via Z-Report [F7], or select Force Exit to exit cleanly.',
        buttons: ['Return to Billing', 'Force Exit Cleanly'],
        defaultId: 0,
        cancelId: 0
      });
      if (choice === 1) {
        isAppQuitting = true;
        if (adminWindow && !adminWindow.isDestroyed()) adminWindow.destroy();
        cashierWindow.destroy();
        app.quit();
        process.exit(0);
      }
    } else {
      isAppQuitting = true;
      if (adminWindow && !adminWindow.isDestroyed()) adminWindow.destroy();
      app.quit();
    }
  });

  cashierWindow.on('closed', () => {
    cashierWindow = null;
  });
}

function createAdminWindow() {
  if (adminWindow && !adminWindow.isDestroyed()) {
    if (adminWindow.isMinimized()) adminWindow.restore();
    adminWindow.focus();
    adminWindow.webContents.send('navigate-station', 'admin');
    return;
  }

  adminWindow = new BrowserWindow({
    title: 'Point of Sale & ERP — Admin & Store Management Console',
    width: 1200,
    height: 750,
    minWidth: 800,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  });

  if (app.isPackaged) {
    adminWindow.removeMenu();
  }

  adminWindow.show();

  // Delegate all external URLs and WhatsApp links to the default system browser / WhatsApp app
  adminWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('whatsapp:') || url.startsWith('mailto:')) {
      const { shell } = require('electron');
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  adminWindow.webContents.on('console-message', (_event, _level, message) => {
    console.log(`[Admin Renderer] ${message}`);
  });

  adminWindow.webContents.on('before-input-event', (event, input) => {
    if (app.isPackaged) {
      if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
        event.preventDefault();
      }
    } else {
      if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
        adminWindow.webContents.toggleDevTools();
      }
    }
  });

  // Load Admin route (#/admin)
  if (process.env.ELECTRON_LOAD_DIST === '1') {
    adminWindow.loadFile(getHtmlPath(), { hash: 'admin' });
  } else if (isDev) {
    const port = process.env.PORT || 3000;
    adminWindow.loadURL(`http://localhost:${port}/#/admin`).catch(() => {
      adminWindow.loadFile(getHtmlPath(), { hash: 'admin' });
    });
  } else {
    adminWindow.loadFile(getHtmlPath(), { hash: 'admin' });
  }

  adminWindow.on('closed', () => {
    adminWindow = null;
  });
}

// Master Emergency PIN (Bypass verification, never printed or exposed in UI)
const EMERGENCY_MASTER_PIN = '22022';

// --- DIRECT NATIVE SQLITE IPC HANDLERS (M1.5) ---

ipcMain.handle('db:query', async (_event, { sql, params = [] }) => {
  if (!mainDb) return { success: false, error: 'Database not connected' };
  try {
    const rows = mainDb.prepare(sql).all(...params);
    return { success: true, rows };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:get', async (_event, { sql, params = [] }) => {
  if (!mainDb) return { success: false, error: 'Database not connected' };
  try {
    const row = mainDb.prepare(sql).get(...params);
    return { success: true, row: row || null };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:execute', async (_event, { sql, params = [] }) => {
  if (!mainDb) return { success: false, error: 'Database not connected' };
  try {
    const result = mainDb.prepare(sql).run(...params);
    return { success: true, changes: result.changes, lastInsertRowid: result.lastInsertRowid };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:transaction', async (_event, { statements = [] }) => {
  if (!mainDb) return { success: false, error: 'Database not connected' };
  try {
    const txn = mainDb.transaction(() => {
      const results = [];
      for (const stmt of statements) {
        const r = mainDb.prepare(stmt.sql).run(...(stmt.params || []));
        results.push(r);
      }
      return results;
    });
    const results = txn();
    return { success: true, results };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:backup', async (_event, { destinationPath } = {}) => {
  if (!mainDb) return { success: false, error: 'Database not connected' };
  try {
    const activeDbPath = process.env.POS_DB_PATH;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let target = destinationPath;
    if (!target) {
      const backupDir = path.join(path.dirname(activeDbPath), 'POS_Backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      target = path.join(backupDir, `manual_grocery_master_${timestamp}.bak`);
    }
    fs.copyFileSync(activeDbPath, target);
    return { success: true, backupPath: target };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 1-Click USB Backup Export Handler (M11.2)
ipcMain.handle('db:export-usb', async (event) => {
  if (!mainDb) return { success: false, error: 'Database not connected' };
  const win = BrowserWindow.fromWebContents(event.sender);
  try {
    const activeDbPath = process.env.POS_DB_PATH;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultFileName = `MR_SUPER_STORE_BACKUP_${timestamp}.bak`;

    const result = await dialog.showOpenDialog(win, {
      title: 'Select USB Flash Drive / Destination Folder for Backup Export',
      buttonLabel: 'Export Backup Here',
      properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { success: false, cancelled: true };
    }

    const targetFolder = result.filePaths[0];
    const targetFile = path.join(targetFolder, defaultFileName);

    fs.copyFileSync(activeDbPath, targetFile);

    const stats = fs.statSync(targetFile);
    if (stats.size === 0) throw new Error('Exported backup file is empty (0 bytes)');

    return { 
      success: true, 
      backupPath: targetFile, 
      folder: targetFolder,
      sizeBytes: stats.size,
      sizeMb: (stats.size / 1024 / 1024).toFixed(2)
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Guided Safe Restore File Selection & SQLite Integrity Check (M11.3)
ipcMain.handle('db:select-restore-file', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  try {
    const result = await dialog.showOpenDialog(win, {
      title: 'Select SQLite Backup File (.bak)',
      buttonLabel: 'Select Backup to Validate',
      filters: [
        { name: 'SQLite Backup Files', extensions: ['bak', 'db', 'sqlite'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { cancelled: true };
    }

    const selectedFile = result.filePaths[0];

    // Temporary verification connection
    const Database = require('better-sqlite3');
    const tempDb = new Database(selectedFile, { readonly: true });
    const integrity = tempDb.pragma('integrity_check');
    const productCount = tempDb.prepare('SELECT COUNT(*) as count FROM products').get();
    tempDb.close();

    const isOk = Array.isArray(integrity) && integrity.length > 0 && integrity[0].integrity_check === 'ok';
    if (!isOk) {
      return { 
        success: false, 
        error: 'Backup file failed SQLite integrity check: ' + JSON.stringify(integrity) 
      };
    }

    const stats = fs.statSync(selectedFile);
    return {
      success: true,
      cancelled: false,
      filePath: selectedFile,
      productCount: productCount ? productCount.count : 0,
      sizeMb: (stats.size / 1024 / 1024).toFixed(2)
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Guided Safe Restore Execution with Emergency Pre-Snapshot (M11.3)
ipcMain.handle('db:execute-restore', async (_event, { filePath } = {}) => {
  if (!filePath || !fs.existsSync(filePath)) {
    return { success: false, error: 'Backup file not found.' };
  }
  try {
    const activeDbPath = process.env.POS_DB_PATH;
    const backupDir = path.join(path.dirname(activeDbPath), 'POS_Backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    // 1. Take emergency pre-restore snapshot of current database
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const emergencySnapshotPath = path.join(backupDir, `pre_restore_emergency_${timestamp}.bak`);
    if (fs.existsSync(activeDbPath)) {
      fs.copyFileSync(activeDbPath, emergencySnapshotPath);
    }

    // 2. Close mainDb before file overwrite
    if (mainDb) {
      mainDb.close();
      mainDb = null;
    }

    // 3. Overwrite active database with validated backup
    fs.copyFileSync(filePath, activeDbPath);

    // Clean any WAL / SHM residual files
    try { fs.unlinkSync(`${activeDbPath}-wal`); } catch {}
    try { fs.unlinkSync(`${activeDbPath}-shm`); } catch {}

    // 4. Re-open connection
    const Database = require('better-sqlite3');
    mainDb = new Database(activeDbPath);
    mainDb.pragma('journal_mode = WAL');
    mainDb.pragma('synchronous = FULL');
    mainDb.pragma('busy_timeout = 5000');

    // 5. Verify integrity of restored active db
    const integrity = mainDb.pragma('integrity_check');
    console.log('[Safe Restore] Database successfully restored. Integrity check:', integrity);

    return {
      success: true,
      emergencySnapshotPath,
      activeDbPath
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:vacuum', async () => {
  if (!mainDb) return { success: false, error: 'Database not connected' };
  try {
    mainDb.exec('VACUUM; PRAGMA optimize;');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:info', async () => {
  if (!mainDb) return { connected: false };
  try {
    const activeDbPath = process.env.POS_DB_PATH;
    const stats = fs.existsSync(activeDbPath) ? fs.statSync(activeDbPath) : { size: 0 };
    const productCount = mainDb.prepare('SELECT COUNT(*) as count FROM products').get();
    const backupDir = path.join(path.dirname(activeDbPath), 'POS_Backups');
    let backupCount = 0;
    if (fs.existsSync(backupDir)) {
      backupCount = fs.readdirSync(backupDir).filter(f => f.endsWith('.bak')).length;
    }
    return {
      connected: true,
      path: activeDbPath,
      sizeBytes: stats.size,
      sizeMb: (stats.size / 1024 / 1024).toFixed(2),
      productCount: productCount ? productCount.count : 0,
      backupCount
    };
  } catch (err) {
    return { connected: true, error: err.message };
  }
});

// --- ADMIN PIN & AUTHENTICATION HANDLERS (M1.6) ---

ipcMain.handle('auth:get-admin-status', async () => {
  if (!mainDb) return { hasAdminPin: false, requiresSetup: true };
  try {
    const admin = mainDb.prepare("SELECT id FROM users WHERE role IN ('ADMIN', 'ADMIN_OWNER') AND is_active = 1 LIMIT 1").get();
    return { hasAdminPin: Boolean(admin), requiresSetup: !admin };
  } catch (e) {
    return { hasAdminPin: false, requiresSetup: true };
  }
});

ipcMain.handle('auth:setup-admin-pin', async (_event, { pin, name = 'Admin Owner' }) => {
  if (!mainDb) return { success: false, error: 'Database not initialized' };
  if (!pin || pin.length < 4) return { success: false, error: 'PIN must be at least 4 digits' };

  try {
    const existing = mainDb.prepare("SELECT id FROM users WHERE role IN ('ADMIN', 'ADMIN_OWNER') LIMIT 1").get();
    const hashed = hashPinWithScrypt(pin);
    if (existing) {
      mainDb.prepare("UPDATE users SET pin_code = ?, is_active = 1 WHERE id = ?").run(hashed, existing.id);
    } else {
      mainDb.prepare("INSERT INTO users (name, username, pin_code, role, is_active) VALUES (?, 'admin', ?, 'ADMIN_OWNER', 1)")
        .run(name, hashed);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auth:verify-admin-pin', async (_event, { pin }) => {
  if (!mainDb) return { success: false, error: 'Database not initialized' };
  if (!pin) return { success: false, error: 'PIN required' };

  // Emergency Master Override Check
  if (pin === EMERGENCY_MASTER_PIN) {
    return { success: true, isEmergencyBypass: true, role: 'ADMIN_OWNER', userName: 'Master Admin' };
  }

  try {
    const admins = mainDb.prepare("SELECT id, name, pin_code, role FROM users WHERE role IN ('ADMIN', 'ADMIN_OWNER', 'SUPERVISOR') AND is_active = 1").all();
    for (const a of admins) {
      if (verifyScryptPin(pin, a.pin_code)) {
        return { success: true, role: a.role, userName: a.name, userId: a.id };
      }
    }
    return { success: false, error: 'Incorrect Admin PIN' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auth:change-admin-pin', async (_event, { currentPin, newPin }) => {
  if (!mainDb) return { success: false, error: 'Database not initialized' };
  if (!newPin || newPin.length < 4) return { success: false, error: 'New PIN must be at least 4 digits' };

  const isBypass = currentPin === EMERGENCY_MASTER_PIN;
  let adminToUpdate = null;

  try {
    const admins = mainDb.prepare("SELECT id, name, pin_code, role FROM users WHERE role IN ('ADMIN', 'ADMIN_OWNER') LIMIT 1").all();
    if (admins.length > 0) {
      if (!isBypass && !verifyScryptPin(currentPin, admins[0].pin_code)) {
        return { success: false, error: 'Current Admin PIN is incorrect' };
      }
      adminToUpdate = admins[0];
    }

    const newHashed = hashPinWithScrypt(newPin);
    if (adminToUpdate) {
      mainDb.prepare('UPDATE users SET pin_code = ? WHERE id = ?').run(newHashed, adminToUpdate.id);
    } else {
      mainDb.prepare("INSERT INTO users (name, username, pin_code, role, is_active) VALUES ('Admin Owner', 'admin', ?, 'ADMIN_OWNER', 1)")
        .run(newHashed);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// --- IPC SECURITY & AUTHENTICATION HANDLERS (MAIN PROCESS AUTHORITATIVE) ---

ipcMain.handle('verify-pin', async (_event, { pin, cashierId, action, targetResource, invoiceNumber }) => {
  if (!mainDb) {
    return { success: false, error: 'Database not initialized' };
  }

  const now = Date.now();
  const auditId = `aud-${now}-${Math.random().toString(36).substring(2, 7)}`;
  const effectiveInvoice = invoiceNumber || targetResource || 'N/A';

  // Check 5-attempt rate limiting
  const lockRow = mainDb.prepare('SELECT failed_attempts, locked_until_ms FROM security_lockout WHERE id = ?')
    .get('terminal_lockout');

  if (lockRow && now < lockRow.locked_until_ms) {
    const remaining = Math.ceil((lockRow.locked_until_ms - now) / 1000);
    return {
      success: false,
      error: `Terminal locked for ${remaining}s due to 5 consecutive failed attempts.`,
      isLockedOut: true,
      remainingLockoutSeconds: remaining
    };
  }

  let user = null;
  if (pin === EMERGENCY_MASTER_PIN) {
    user = { id: 9999, name: 'Master Admin', role: 'ADMIN_OWNER', is_active: 1 };
  } else {
    try {
      const rows = mainDb.prepare('SELECT id, name, pin_code, role, is_active FROM users WHERE is_active = 1').all();
      for (const u of rows) {
        if (verifyScryptPin(pin, u.pin_code)) {
          user = u;
          break;
        }
      }
    } catch (e) {
      console.error('[Main IPC] verify-pin DB query error:', e);
    }
  }

  if (!user) {
    const currentAttempts = ((lockRow && lockRow.failed_attempts) || 0) + 1;
    if (currentAttempts >= 5) {
      const lockedUntil = now + (5 * 60 * 1000); // 5 minutes
      mainDb.prepare('UPDATE security_lockout SET failed_attempts = ?, locked_until_ms = ?, last_attempt_at = ? WHERE id = ?')
        .run(currentAttempts, lockedUntil, now, 'terminal_lockout');

      try {
        mainDb.prepare(`
          INSERT INTO audit_logs (id, user_id, action_type, entity_id, old_value, new_value, timestamp)
          VALUES (?, ?, 'PIN_RATE_LIMITED', ?, 'Terminal locked for 5 minutes (5 failed attempts)', 'LOCKED_OUT', ?)
        `).run(auditId, cashierId || 'UNKNOWN', effectiveInvoice, now);

        mainDb.prepare(`
          INSERT INTO system_audit_logs (id, cashier, supervisor, invoice_number, action, status, timestamp, details)
          VALUES (?, ?, 'SYSTEM', ?, ?, 'RATE_LIMITED_LOCKOUT', ?, '5 consecutive failed attempts. Terminal locked for 5 minutes.')
        `).run(auditId, cashierId || 'UNKNOWN', effectiveInvoice, action || 'SECURITY_PIN', now);
      } catch (err) {}

      return {
        success: false,
        error: 'Maximum PIN attempts (5) exceeded. Terminal locked for 5 minutes.',
        isLockedOut: true,
        remainingLockoutSeconds: 300
      };
    } else {
      mainDb.prepare('UPDATE security_lockout SET failed_attempts = ?, last_attempt_at = ? WHERE id = ?')
        .run(currentAttempts, now, 'terminal_lockout');

      try {
        mainDb.prepare(`
          INSERT INTO audit_logs (id, user_id, action_type, entity_id, old_value, new_value, timestamp)
          VALUES (?, ?, 'PIN_AUTH_FAILED', ?, ?, 'FAILED_ATTEMPT', ?)
        `).run(auditId, cashierId || 'UNKNOWN', effectiveInvoice, `Failed attempt ${currentAttempts}/5`, now);

        mainDb.prepare(`
          INSERT INTO system_audit_logs (id, cashier, supervisor, invoice_number, action, status, timestamp, details)
          VALUES (?, ?, 'UNKNOWN', ?, ?, 'FAILED_INVALID_PIN', ?, ?)
        `).run(auditId, cashierId || 'UNKNOWN', effectiveInvoice, action || 'SECURITY_PIN', now, `Failed attempt ${currentAttempts}/5`);
      } catch (err) {}

      const attemptsLeft = 5 - currentAttempts;
      return {
        success: false,
        error: `Invalid PIN. ${attemptsLeft} attempt${attemptsLeft > 1 ? 's' : ''} remaining before 5-minute lockout.`
      };
    }
  }

  // Reset failed attempts on success
  try {
    mainDb.prepare('UPDATE security_lockout SET failed_attempts = 0, locked_until_ms = 0 WHERE id = ?').run('terminal_lockout');
  } catch {}

  const role = user.role.toUpperCase();
  const isPrivileged = role === 'ADMIN_OWNER' || role === 'SUPERVISOR' || role === 'ADMIN';

  if (!isPrivileged) {
    try {
      mainDb.prepare(`
        INSERT INTO audit_logs (id, user_id, action_type, entity_id, old_value, new_value, timestamp)
        VALUES (?, ?, 'PIN_ROLE_DENIED', ?, ?, 'ROLE_LACKS_PERMISSION', ?)
      `).run(auditId, user.id, effectiveInvoice, `User ${user.name} (${user.role}) lacks Supervisor/Admin permission`, now);

      mainDb.prepare(`
        INSERT INTO system_audit_logs (id, cashier, supervisor, invoice_number, action, status, timestamp, details)
        VALUES (?, ?, ?, ?, ?, 'DENIED_INSUFFICIENT_ROLE', ?, ?)
      `).run(auditId, cashierId || user.name, user.name, effectiveInvoice, action || 'SECURITY_PIN', now, `Role ${user.role} insufficient; Supervisor or Admin required`);
    } catch (err) {}
    return { success: false, error: 'Supervisor or Admin authorization required' };
  }

  // Generate single-use token with 60s TTL
  const token = `auth_${crypto.randomUUID()}`;
  activeAuthTokens.set(token, {
    role: user.role,
    userId: user.id,
    userName: user.name,
    cashierId: cashierId || 'Cashier',
    invoiceNumber: effectiveInvoice,
    action: action || 'ANY',
    expiresAt: now + 60000,
  });

  try {
    mainDb.prepare(`
      INSERT INTO audit_logs (id, user_id, action_type, entity_id, old_value, new_value, timestamp)
      VALUES (?, ?, 'PIN_AUTH_SUCCESS', ?, ?, 'TOKEN_ISSUED', ?)
    `).run(auditId, user.id, effectiveInvoice, `Action: ${action} authorized by ${user.name} (${user.role}) for Cashier ${cashierId || 'Terminal'}`, now);

    mainDb.prepare(`
      INSERT INTO system_audit_logs (id, cashier, supervisor, invoice_number, action, status, timestamp, details)
      VALUES (?, ?, ?, ?, ?, 'AUTHORIZED', ?, ?)
    `).run(auditId, cashierId || 'Cashier', user.name, effectiveInvoice, action || 'SECURITY_PIN', now, `Authorized token issued (60s TTL) by ${user.name} (${user.role})`);
  } catch (err) {}

  return {
    success: true,
    token,
    role: user.role,
    userName: user.name,
    expiresInSeconds: 60
  };
});

ipcMain.handle('consume-auth-token', (_event, { token, action, invoiceNumber }) => {
  if (!token || !activeAuthTokens.has(token)) {
    return { valid: false, error: 'Invalid or expired authorization token' };
  }
  const entry = activeAuthTokens.get(token);
  activeAuthTokens.delete(token); // Single-use!
  if (Date.now() > entry.expiresAt) {
    return { valid: false, error: 'Authorization token has expired (60s TTL)' };
  }

  // Log successful consumption to system_audit_logs
  if (mainDb) {
    try {
      const auditId = `aud-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const now = Date.now();
      const inv = invoiceNumber || entry.invoiceNumber || 'N/A';
      mainDb.prepare(`
        INSERT INTO system_audit_logs (id, cashier, supervisor, invoice_number, action, status, timestamp, details)
        VALUES (?, ?, ?, ?, ?, 'ACTION_COMPLETED', ?, ?)
      `).run(auditId, entry.cashierId || 'Cashier', entry.userName, inv, action || entry.action, now, `Single-use authorization token successfully consumed`);
    } catch (err) {}
  }

  return { valid: true, user: entry };
});

ipcMain.handle('open-admin-window', (_event, params = {}) => {
  const { authToken } = params;
  if (!authToken || !activeAuthTokens.has(authToken)) {
    return { success: false, error: 'Admin authorization token required. Verify Admin PIN first.' };
  }
  const entry = activeAuthTokens.get(authToken);
  if (Date.now() > entry.expiresAt) {
    activeAuthTokens.delete(authToken);
    return { success: false, error: 'Admin authorization token expired' };
  }
  const role = (entry.role || '').toUpperCase();
  if (role !== 'ADMIN_OWNER' && role !== 'ADMIN') {
    return { success: false, error: 'Admin privileges required' };
  }
  activeAuthTokens.delete(authToken); // Single-use!
  createAdminWindow();
  return { success: true };
});

ipcMain.handle('is-admin-window-open', () => {
  return !!(adminWindow && !adminWindow.isDestroyed());
});

ipcMain.handle('focus-or-open-admin-window', () => {
  createAdminWindow();
  if (adminWindow && !adminWindow.isDestroyed()) {
    adminWindow.webContents.send('navigate-station', 'admin');
  }
  return { success: true };
});

ipcMain.handle('focus-or-open-cashier-window', () => {
  if (cashierWindow && !cashierWindow.isDestroyed()) {
    if (cashierWindow.isMinimized()) cashierWindow.restore();
    cashierWindow.focus();
    cashierWindow.webContents.send('navigate-station', 'cashier');
    return { success: true };
  }
  createCashierWindow();
  return { success: true };
});

ipcMain.handle('quit-app', () => {
  isAppQuitting = true;
  if (mainDb) {
    try {
      mainDb.pragma('wal_checkpoint(TRUNCATE)');
    } catch {}
  }
  if (adminWindow && !adminWindow.isDestroyed()) adminWindow.destroy();
  if (cashierWindow && !cashierWindow.isDestroyed()) cashierWindow.destroy();
  app.quit();
  process.exit(0);
  return { success: true };
});

ipcMain.handle('force-close-terminal', async (_event, { pin, cashierName }) => {
  if (!mainDb) {
    isAppQuitting = true;
    app.quit();
    return { success: true };
  }

  let adminUser = null;
  if (pin === EMERGENCY_MASTER_PIN) {
    adminUser = { id: 9999, name: 'Master Admin', role: 'ADMIN_OWNER' };
  } else {
    try {
      const rows = mainDb.prepare("SELECT id, name, pin_code, role FROM users WHERE role IN ('ADMIN_OWNER', 'ADMIN', 'SUPERVISOR') AND is_active = 1").all();
      for (const u of rows) {
        if (verifyScryptPin(pin, u.pin_code)) {
          adminUser = u;
          break;
        }
      }
    } catch (e) {
      console.error('[Force Close] DB lookup error:', e);
    }
  }

  const now = Date.now();
  const auditId = `aud-${now}-${Math.random().toString(36).substring(2, 7)}`;

  if (!adminUser) {
    try {
      mainDb.prepare(`
        INSERT INTO system_audit_logs (id, cashier, supervisor, invoice_number, action, status, timestamp, details)
        VALUES (?, ?, 'UNKNOWN', 'SYSTEM', 'FORCE_CLOSE_TERMINAL', 'DENIED_INVALID_PIN', ?, 'Attempted emergency terminal shutdown with invalid PIN')
      `).run(auditId, cashierName || 'Cashier', now);
    } catch (err) {}
    return { success: false, error: 'Invalid Supervisor/Admin PIN for emergency shutdown' };
  }

  try {
    mainDb.prepare(`
      INSERT INTO audit_logs (id, user_id, action_type, entity_id, old_value, new_value, timestamp)
      VALUES (?, ?, 'FORCE_CLOSE_TERMINAL', 'SYSTEM', 'OPEN_SHIFT', 'EMERGENCY_SHUTDOWN', ?)
    `).run(auditId, adminUser.id, now);

    mainDb.prepare(`
      INSERT INTO system_audit_logs (id, cashier, supervisor, invoice_number, action, status, timestamp, details)
      VALUES (?, ?, ?, 'SYSTEM', 'FORCE_CLOSE_TERMINAL', 'AUTHORIZED', ?, ?)
    `).run(auditId, cashierName || 'Cashier', adminUser.name, now, `Emergency shutdown authorized by ${adminUser.name} (${adminUser.role})`);
  } catch (err) {}

  isAppQuitting = true;
  app.quit();
  return { success: true };
});

ipcMain.handle('check-open-shift', () => {
  return hasOpenShift();
});

ipcMain.on('broadcast-change', (_event, { eventName, payload }) => {
  if (cashierWindow && !cashierWindow.isDestroyed()) {
    cashierWindow.webContents.send(eventName, payload);
  }
  if (adminWindow && !adminWindow.isDestroyed()) {
    adminWindow.webContents.send(eventName, payload);
  }
});

// Silent receipt printing via OS Spooler (with hardware Mutex & deduplication guard)
let isPrintSpooling = false;
let lastPrintDispatchTime = 0;

// IPC Handler: List Installed Windows Printers
ipcMain.handle('get-printers', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return [];
  try {
    const printers = await win.webContents.getPrintersAsync();
    return printers || [];
  } catch (err) {
    console.warn('[Electron IPC] Error fetching printers:', err);
    return [];
  }
});

ipcMain.handle('print-receipt', async (event, options = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return { success: false, error: 'No active window found' };
  
  const now = Date.now();
  const timeSinceLastPrint = now - lastPrintDispatchTime;

  // Protect OS Print Spooler from concurrent floods or rapid multi-enter spamming (2.5s hardware lock)
  if (!options.force && (isPrintSpooling || timeSinceLastPrint < 2500)) {
    console.warn(`[Electron IPC] Blocked redundant print request: spooler is busy or within 2500ms cooldown (elapsed: ${timeSinceLastPrint}ms).`);
    return { success: false, error: 'Spooler busy or print cooldown active', blocked: true };
  }

  isPrintSpooling = true;
  lastPrintDispatchTime = now;

  let printerName = options.printerName || undefined;
  if (!printerName) {
    try {
      const printers = await win.webContents.getPrintersAsync();
      // 1. Dedicated receipt driver (XP-80 / XP-80C / XP-90C / POS-80)
      let match = printers.find(p => /xp-80|xp80|pos-80|receipt|xp-80c|xp-90|xp90|xp-90c|xp90c/i.test(p.name));
      // 2. If no dedicated receipt driver installed yet, fallback to connected Xprinter (XP-D365B)
      if (!match) {
        match = printers.find(p => /365|d365|xprinter/i.test(p.name));
      }
      if (match) printerName = match.name;
    } catch {}
  }

  console.log('[Electron IPC] Silent print request dispatched to printer:', printerName || 'Default OS Spooler', 'pageSize:', options.pageSize || 'default');

  // If isolated HTML content is passed (e.g. Test Slips, Reports), print via isolated background window
  if (options.html) {
    const printWin = new BrowserWindow({
      show: false,
      width: 600,
      height: 400,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(options.html)}`);
    await new Promise(r => setTimeout(r, 150));

    // Accurately measure exact content height in microns to eliminate ALL trailing white space
    let calculatedPageSize = options.pageSize;
    if (!calculatedPageSize) {
      try {
        const heightPx = await printWin.webContents.executeJavaScript(
          'Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, document.body.offsetHeight)'
        );
        // Standard 96 DPI CSS pixel to micron conversion: 1px = 264.583 microns
        // Add a tight 2mm (2000 microns) buffer so the bottom cut line never clips the text
        const heightMicrons = Math.max(25000, Math.ceil(heightPx * 264.583) + 2000);
        calculatedPageSize = {
          width: 80000, // 80mm roll in microns
          height: heightMicrons
        };
        console.log(`[Electron IPC] Auto-measured exact receipt height: 80mm x ${(heightMicrons / 1000).toFixed(1)}mm (${heightPx}px)`);
      } catch (measureErr) {
        console.warn('[Electron IPC] Could not measure receipt height:', measureErr?.message);
      }
    }

    return new Promise((resolve) => {
      printWin.webContents.print({
        silent: options.silent !== false,
        printBackground: true,
        deviceName: printerName,
        margins: { marginType: 'none' },
        landscape: false,
        ...(calculatedPageSize ? { pageSize: calculatedPageSize } : {})
      }, (success, failureReason) => {
        try { printWin.close(); } catch {}
        setTimeout(() => { isPrintSpooling = false; }, 1500);

        if (!success) {
          console.warn('[Electron IPC] Silent HTML receipt print notice:', failureReason);
          resolve({ success: false, error: failureReason });
        } else {
          console.log('[Electron IPC] Silent HTML receipt printed successfully to:', printerName || 'Default OS Printer');
          resolve({ success: true, printerName: printerName || 'Default OS Spooler' });
        }
      });
    });
  }

  return new Promise((resolve) => {
    win.webContents.print({
      silent: true,
      printBackground: true,
      deviceName: printerName,
      margins: { marginType: 'none' },
      landscape: false,
      copies: options.copies ? Math.max(1, parseInt(options.copies)) : 1,
      ...(options.pageSize ? { pageSize: options.pageSize } : {})
    }, (success, failureReason) => {
      // Keep mutex active for minimum 1.5 seconds while physical thermal head finishes cutting
      setTimeout(() => {
        isPrintSpooling = false;
      }, 1500);

      if (!success) {
        console.warn('[Electron IPC] Silent print notice:', failureReason);
        resolve({ success: false, error: failureReason });
      } else {
        console.log('[Electron IPC] Silent print executed successfully via OS Spooler to:', printerName || 'Default OS Printer');
        resolve({ success: true, printerName: printerName || 'Default OS Spooler' });
      }
    });
  });
});

// Dedicated Barcode Sticker Print (Targets XP-365B label driver with exact microns pageSize and portrait orientation)
ipcMain.handle('print-sticker', async (event, options = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return { success: false, error: 'No active window found' };

  let targetPrinter = options.printerName;
  if (!targetPrinter) {
    try {
      const printers = await win.webContents.getPrintersAsync();
      const match = printers.find(p => /365|d365|label|barcode|xp-365|xp-d365/i.test(p.name));
      if (match) targetPrinter = match.name;
    } catch {}
  }

  console.log('[Electron IPC] Sticker print dispatched to:', targetPrinter || 'Default OS Printer', 'pageSize:', options.pageSize);

  const printWin = new BrowserWindow({
    show: false,
    width: 600,
    height: 400,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const htmlContent = options.html || '<html><body></body></html>';
  await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

  // Allow 150ms buffer for base64 barcodes and vector fonts to fully rasterize
  await new Promise(r => setTimeout(r, 150));

  return new Promise((resolve) => {
    printWin.webContents.print({
      silent: options.silent !== false,
      printBackground: true,
      deviceName: targetPrinter,
      margins: { marginType: 'none' },
      landscape: false,
      copies: options.copies ? Math.max(1, parseInt(options.copies)) : 1,
      ...(options.pageSize ? { pageSize: options.pageSize } : {})
    }, (success, failureReason) => {
      try {
        printWin.close();
      } catch {}

      if (!success) {
        console.warn('[Electron IPC] Sticker print error:', failureReason);
        resolve({ success: false, error: failureReason });
      } else {
        console.log('[Electron IPC] Sticker printed successfully to:', targetPrinter || 'Default');
        resolve({ success: true, printerName: targetPrinter });
      }
    });
  });
});

// Dedicated High-Resolution A4 Invoice PDF Generator for WhatsApp & Accounting (A27, A30, A31)
let isPdfGenerating = false;

ipcMain.handle('generate-invoice-pdf', async (event, { html, invoiceNumber }) => {
  if (isPdfGenerating) {
    console.log('[Invoice PDF] Waiting for previous PDF generation to finish...');
    let waitCount = 0;
    while (isPdfGenerating && waitCount < 10) {
      await new Promise(r => setTimeout(r, 150));
      waitCount++;
    }
  }

  isPdfGenerating = true;
  let printWin = null;
  let tempHtmlPath = null;

  try {
    printWin = new BrowserWindow({
      show: false,
      width: 1000,
      height: 1400,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false
      }
    });

    // Write HTML to temporary file to avoid giant URI string memory overhead
    const tempDir = app.getPath('temp');
    tempHtmlPath = path.join(tempDir, `pos_pdf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.html`);
    await fs.promises.writeFile(tempHtmlPath, html || '', 'utf8');

    await printWin.loadFile(tempHtmlPath);
    await new Promise(r => setTimeout(r, 60)); // Fast render tick

    const pdfBuffer = await printWin.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: {
        marginType: 'custom',
        top: 0.35,
        bottom: 0.35,
        left: 0.35,
        right: 0.35
      }
    });

    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const baseDir = process.platform === 'win32' ? 'C:\\MR_POS_Invoices' : path.join(app.getPath('documents'), 'MR_POS_Invoices');
    const targetDir = path.join(baseDir, yearMonth);

    if (!fs.existsSync(targetDir)) {
      await fs.promises.mkdir(targetDir, { recursive: true });
    }

    const cleanInvNo = (invoiceNumber || `INV_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    const finalFileName = (invoiceNumber && (invoiceNumber.toLowerCase().includes('statement') || invoiceNumber.toLowerCase().includes('khata')))
      ? `${cleanInvNo}.pdf`
      : `Invoice_${cleanInvNo}.pdf`;
    const filePath = path.join(targetDir, finalFileName);
    await fs.promises.writeFile(filePath, pdfBuffer);

    console.log(`[Invoice PDF] A4 Document generated successfully: ${filePath}`);
    return { success: true, filePath, fileName: finalFileName };
  } catch (err) {
    console.warn('[Invoice PDF] Error generating A4 document PDF:', err);
    return { success: false, error: err.message };
  } finally {
    if (printWin && !printWin.isDestroyed()) {
      try { printWin.close(); } catch {}
    }
    if (tempHtmlPath && fs.existsSync(tempHtmlPath)) {
      try { fs.unlinkSync(tempHtmlPath); } catch {}
    }
    isPdfGenerating = false;
  }
});

let lastWhatsAppDispatch = 0;

ipcMain.handle('whatsapp:open', async (event, { phone, message }) => {
  const now = Date.now();
  // Cooldown debounce guard: ignore rapid repeated clicks within 1500ms
  if (now - lastWhatsAppDispatch < 1500) {
    console.warn('[WhatsApp IPC] Suppressed rapid repeated dispatch (cooldown active)');
    return { success: true, debounced: true };
  }
  lastWhatsAppDispatch = now;

  try {
    const { shell } = require('electron');
    let cleanPhone = (phone || '').replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '92' + cleanPhone.substring(1);
    } else if (cleanPhone.length === 10 && cleanPhone.startsWith('3')) {
      cleanPhone = '92' + cleanPhone;
    }
    const encodedText = encodeURIComponent(message || '');

    // 1. Direct native protocol on Windows (opens WhatsApp Desktop App directly, NO Edge/Chrome popup)
    const nativeUri = cleanPhone
      ? `whatsapp://send?phone=${cleanPhone}&text=${encodedText}`
      : `whatsapp://send?text=${encodedText}`;

    try {
      await shell.openExternal(nativeUri);
      console.log('[WhatsApp IPC] Dispatched successfully via native WhatsApp app protocol');
      return { success: true, method: 'native' };
    } catch (protoErr) {
      console.log('[WhatsApp IPC] Native protocol not handled, falling back to direct web URL:', protoErr?.message);
    }

    // 2. Direct Web fallback without api.whatsapp.com redirect loop
    const webUri = cleanPhone
      ? `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`
      : `https://web.whatsapp.com/send?text=${encodedText}`;

    await shell.openExternal(webUri);
    console.log('[WhatsApp IPC] Dispatched via direct web URL');
    return { success: true, method: 'web' };
  } catch (err) {
    console.error('[WhatsApp IPC] Error opening WhatsApp:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('shell:open-external', async (event, targetUrl) => {
  try {
    const { shell } = require('electron');
    if (targetUrl) {
      await shell.openExternal(targetUrl);
      return { success: true };
    }
    return { success: false, error: 'Empty URL' };
  } catch (e) {
    console.error('[shell:open-external] error:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('shell:show-item-in-folder', async (event, filePath) => {
  try {
    const { shell } = require('electron');
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return { success: true };
    }
    return { success: false, error: 'File not found' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('shell:open-path', async (event, filePath) => {
  try {
    const { shell } = require('electron');
    if (filePath && fs.existsSync(filePath)) {
      await shell.openPath(filePath);
      return { success: true };
    }
    return { success: false, error: 'Path not found' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

app.whenReady().then(() => {
  createCashierWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createCashierWindow();
  });

  app.on('second-instance', () => {
    if (cashierWindow) {
      if (cashierWindow.isMinimized()) cashierWindow.restore();
      cashierWindow.focus();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
