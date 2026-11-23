import Database from 'better-sqlite3';
import { join } from 'path';

const dbPath = join(process.cwd(), 'grocery_master.db');
const db = new Database(dbPath);

console.log('Cleaning database at:', dbPath);

db.exec(`
  DELETE FROM invoice_items;
  DELETE FROM invoices;
  DELETE FROM customer_transactions;
  DELETE FROM customers;
  DELETE FROM supplier_transactions;
  DELETE FROM suppliers;
  DELETE FROM products WHERE id != 'ad-hoc-item';
  DELETE FROM shifts;
`);

try { db.exec('DELETE FROM void_bills;'); } catch {}
try { db.exec('DELETE FROM cash_drops;'); } catch {}
try { db.exec('DELETE FROM expenses;'); } catch {}

console.log('Database successfully cleaned! All dummy products, customers, suppliers, shifts, and invoices deleted.');
