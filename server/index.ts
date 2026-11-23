import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { networkInterfaces } from 'os';
import { INIT_SCHEMA_SQL } from '../pos-core/src/db/schema.js';

// ES Module __dirname workaround for Node
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = 3001;

// 1. Detect dynamic IP for Mobile QR Pairing
const getLocalIp = () => {
  const nets = networkInterfaces();
  let fallbackIp = 'localhost';
  for (const name of Object.keys(nets)) {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('wsl') || lowerName.includes('vethernet') || lowerName.includes('virtual') || lowerName.includes('vmware')) {
      continue;
    }
    for (const net of nets[name]!) {
      if (net.family === 'IPv4' && !net.internal) {
        if (lowerName.includes('wi-fi') || lowerName.includes('local area connection')) {
          return net.address; // Prioritize actual Wi-Fi or Hotspot
        }
        fallbackIp = net.address;
      }
    }
  }
  return fallbackIp;
};

const LOCAL_IP = getLocalIp();

// 2. Setup SQLite Master Database (REAL SQLite, not shim)
const dbPath = join(__dirname, '../grocery_master.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL'); // Maximum performance for reads/writes

try {
  db.exec(INIT_SCHEMA_SQL);
  console.log('Database Schema Verified.');
} catch (err) {
  console.error('Error initializing database schema:', err);
}

// 3. Setup Express & Socket
const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' } // Allow phone access
});

// 4. API Endpoints
app.post('/api/sql/query', (req, res) => {
  const { sql, params = [] } = req.body;
  try {
    const rows = db.prepare(sql).all(...params);
    res.json({ success: true, rows });
  } catch (err: any) {
    console.error('[SQL Query Error]', err.message, sql);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sql/get', (req, res) => {
  const { sql, params = [] } = req.body;
  try {
    const row = db.prepare(sql).get(...params);
    res.json({ success: true, row: row || null });
  } catch (err: any) {
    console.error('[SQL Get Error]', err.message, sql);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sql/execute', (req, res) => {
  const { sql, params = [] } = req.body;
  try {
    const result = db.prepare(sql).run(...params);
    res.json({ success: true, changes: result.changes, lastInsertRowid: result.lastInsertRowid });
  } catch (err: any) {
    console.error('[SQL Execute Error]', err.message, sql);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sql/transaction', (req, res) => {
  const { statements = [] } = req.body;
  try {
    const txn = db.transaction(() => {
      const results = [];
      for (const stmt of statements) {
        const r = db.prepare(stmt.sql).run(...(stmt.params || []));
        results.push(r);
      }
      return results;
    });
    const results = txn();
    res.json({ success: true, results });
  } catch (err: any) {
    console.error('[SQL Transaction Error]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/network', (req, res) => {
  res.json({ ip: LOCAL_IP, port: PORT });
});

app.get('/api/inventory', (req, res) => {
  // Pagination will go here later
  const products = db.prepare('SELECT * FROM products ORDER BY name ASC').all();
  res.json(products);
});

app.post('/api/inventory/update', (req, res) => {
  const { id, sale_price, stock_qty } = req.body;
  try {
    const update = db.prepare('UPDATE products SET sale_price = ?, stock_qty = ? WHERE id = ?');
    update.run(sale_price, stock_qty, id);
    
    // Broadcast via socket to all clients (including Desktop POS)
    const updatedProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    io.emit('INVENTORY_UPDATED', updatedProduct);
    
    res.json({ success: true, product: updatedProduct });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/khata', (req, res) => {
  try {
    const customers = db.prepare('SELECT * FROM customers ORDER BY current_balance DESC, name ASC').all();
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/khata/pay', (req, res) => {
  const { customerId, amount, notes } = req.body;
  try {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) as any;
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    
    const newBalance = customer.current_balance - parseFloat(amount);
    
    const payTransaction = db.transaction(() => {
      db.prepare('UPDATE customers SET current_balance = ? WHERE id = ?').run(newBalance, customerId);
      db.prepare(`
        INSERT INTO customer_transactions (id, customer_id, invoice_id, type, amount, balance_after, notes, created_at)
        VALUES (?, ?, NULL, 'PAYMENT', ?, ?, ?, datetime('now', 'localtime'))
      `).run(`CTX-${Date.now()}`, customerId, parseFloat(amount), newBalance, notes || 'Mobile Payment');
    });
    
    payTransaction();
    
    // Broadcast to Desktop POS
    io.emit('KHATA_UPDATED', { customerId, newBalance, amount });
    
    res.json({ success: true, newBalance });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// 5. Real-Time Socket Connection
io.on('connection', (socket) => {
  console.log(`[Socket] Mobile Device Connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    console.log(`[Socket] Mobile Device Disconnected: ${socket.id}`);
  });
});

httpServer.listen(PORT, '127.0.0.1', () => {
  console.log(`\n============================================`);
  console.log(`🚀 MASTER LOCAL API RUNNING ON LOCALHOST`);
  console.log(`🌐 Local Access: http://127.0.0.1:${PORT}`);
  console.log(`============================================\n`);
});
