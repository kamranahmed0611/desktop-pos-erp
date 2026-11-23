import { sqlDb } from '../db/sqlite';
import { Category, Product, ProductBarcode, UnitType } from '../types';

export interface CreateProductInput {
  sku?: string;
  barcode?: string;
  name: string;
  urdu_name?: string;
  category: string;
  cost_price: number;
  sale_price: number;
  stock_qty: number;
  unit_type?: UnitType;
  is_weighable?: boolean;
  min_stock_alert?: number;
  is_loose?: boolean;
  base_unit?: string;
  sale_unit?: string;
  unit_conversion_ratio?: number;
  subunit_sale_price?: number;
  whole_bags_stock?: number;
  bag_weight_kg?: number;
}

export const catalogService = {
  async getProducts(): Promise<Product[]> {
    return sqlDb.query<Product>('SELECT * FROM products WHERE is_active = 1 ORDER BY name ASC');
  },

  async searchProducts(query: string, limit = 25): Promise<Product[]> {
    const q = query.trim();
    if (!q) return this.getProducts();

    try {
      return await sqlDb.query<Product>(`
        SELECT DISTINCT p.* FROM products p
        LEFT JOIN product_barcodes pb ON p.id = pb.product_id
        WHERE p.is_active = 1 AND (
          p.barcode = ? OR
          p.sku LIKE ? OR
          p.name LIKE ? OR
          p.category LIKE ? OR
          pb.barcode = ?
        )
        ORDER BY p.name ASC LIMIT ?
      `, [q, `%${q}%`, `%${q}%`, `%${q}%`, q, limit]);
    } catch {
      return sqlDb.query<Product>(`
        SELECT * FROM products
        WHERE is_active = 1 AND (
          barcode = ? OR
          sku LIKE ? OR
          name LIKE ? OR
          category LIKE ?
        )
        ORDER BY name ASC LIMIT ?
      `, [q, `%${q}%`, `%${q}%`, `%${q}%`, limit]);
    }
  },

  async findByBarcodeOrSku(code: string): Promise<Product | null> {
    const trimmed = code.trim();
    if (!trimmed) return null;

    // 1. Primary lookup in products table
    const direct = await sqlDb.get<Product>(`
      SELECT * FROM products
      WHERE is_active = 1 AND (barcode = ? OR sku = ?)
      LIMIT 1
    `, [trimmed, trimmed]);
    if (direct) return direct;

    // 2. Child lookup in product_barcodes table (Multi-Barcode Engine M3.1)
    try {
      const altMatch = await sqlDb.get<Product>(`
        SELECT p.* FROM products p
        JOIN product_barcodes pb ON p.id = pb.product_id
        WHERE p.is_active = 1 AND pb.barcode = ?
        LIMIT 1
      `, [trimmed]);
      if (altMatch) return altMatch;
    } catch {}

    return null;
  },

  async checkBarcodeExists(barcode: string, excludeId?: string): Promise<Product | null> {
    const b = barcode.trim();
    if (!b) return null;

    let prod = null;
    if (excludeId) {
      prod = await sqlDb.get<Product>('SELECT * FROM products WHERE barcode = ? AND id != ? LIMIT 1', [b, excludeId]);
    } else {
      prod = await sqlDb.get<Product>('SELECT * FROM products WHERE barcode = ? LIMIT 1', [b]);
    }
    if (prod) return prod;

    // Check product_barcodes child table
    try {
      if (excludeId) {
        prod = await sqlDb.get<Product>(`
          SELECT p.* FROM products p
          JOIN product_barcodes pb ON p.id = pb.product_id
          WHERE pb.barcode = ? AND p.id != ? LIMIT 1
        `, [b, excludeId]);
      } else {
        prod = await sqlDb.get<Product>(`
          SELECT p.* FROM products p
          JOIN product_barcodes pb ON p.id = pb.product_id
          WHERE pb.barcode = ? LIMIT 1
        `, [b]);
      }
    } catch {}

    return prod;
  },

  generateEan13Barcode(): string {
    // 8964 is GS1 country prefix for Pakistan retail
    const prefix = '8964';
    // 8 random numeric digits (4 + 8 = 12 base digits)
    const randomMiddle = Math.floor(10000000 + Math.random() * 90000000).toString();
    const raw12 = (prefix + randomMiddle).substring(0, 12);

    // Compute Luhn/EAN-13 check digit
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(raw12[i], 10);
      sum += i % 2 === 0 ? digit : digit * 3;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return `${raw12}${checkDigit}`;
  },

  async createProduct(input: CreateProductInput): Promise<Product> {
    const id = `prod-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const barcode = input.barcode?.trim() || this.generateEan13Barcode();
    const sku = input.sku?.trim() || `SKU-${Date.now().toString().slice(-6)}`;
    const unitType = input.unit_type || 'piece';
    const isWeighable = input.is_weighable ?? (unitType === 'kg');

    // Duplicate check
    const existing = await this.checkBarcodeExists(barcode);
    if (existing) {
      throw new Error(`Barcode "${barcode}" is already assigned to "${existing.name}".`);
    }

    const isLoose = input.is_loose ? 1 : 0;
    const baseUnit = input.base_unit || '';
    const saleUnit = input.sale_unit || '';
    const unitConversionRatio = input.unit_conversion_ratio || 1.0;
    const subunitSalePrice = input.subunit_sale_price || 0.0;

    await sqlDb.execute(`
      INSERT INTO products (
        id, sku, barcode, name, urdu_name, category, cost_price, sale_price, tax_rate, stock_qty,
        whole_bags_stock, bag_weight_kg, unit_type, is_weighable, is_loose, base_unit, sale_unit, 
        unit_conversion_ratio, subunit_sale_price, min_stock_alert, is_active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now', 'localtime'))
    `, [
      id,
      sku,
      barcode,
      input.name.trim(),
      input.urdu_name || '',
      input.category || 'General',
      input.cost_price || 0,
      input.sale_price || 0,
      input.stock_qty || 0,
      input.whole_bags_stock || 0.0,
      input.bag_weight_kg || 50.0,
      unitType,
      isWeighable ? 1 : 0,
      isLoose,
      baseUnit,
      saleUnit,
      unitConversionRatio,
      subunitSalePrice,
      input.min_stock_alert || 10
    ]);

    return (await sqlDb.get<Product>('SELECT * FROM products WHERE id = ?', [id]))!;
  },

  async updateProduct(id: string, updates: Partial<CreateProductInput>): Promise<void> {
    if (updates.barcode) {
      const collision = await this.checkBarcodeExists(updates.barcode, id);
      if (collision) {
        throw new Error(`Barcode "${updates.barcode}" already belongs to "${collision.name}".`);
      }
    }

    await sqlDb.execute(`
      UPDATE products SET
        name = COALESCE(?, name),
        urdu_name = COALESCE(?, urdu_name),
        barcode = COALESCE(?, barcode),
        sku = COALESCE(?, sku),
        category = COALESCE(?, category),
        cost_price = COALESCE(?, cost_price),
        sale_price = COALESCE(?, sale_price),
        stock_qty = COALESCE(?, stock_qty),
        whole_bags_stock = COALESCE(?, whole_bags_stock),
        bag_weight_kg = COALESCE(?, bag_weight_kg),
        unit_type = COALESCE(?, unit_type),
        is_weighable = CASE WHEN ? IS NOT NULL THEN ? ELSE is_weighable END,
        is_loose = CASE WHEN ? IS NOT NULL THEN ? ELSE is_loose END,
        base_unit = COALESCE(?, base_unit),
        sale_unit = COALESCE(?, sale_unit),
        unit_conversion_ratio = COALESCE(?, unit_conversion_ratio),
        subunit_sale_price = COALESCE(?, subunit_sale_price),
        min_stock_alert = COALESCE(?, min_stock_alert),
        updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `, [
      updates.name,
      updates.urdu_name,
      updates.barcode,
      updates.sku,
      updates.category,
      updates.cost_price,
      updates.sale_price,
      updates.stock_qty,
      updates.whole_bags_stock,
      updates.bag_weight_kg,
      updates.unit_type,
      updates.is_weighable !== undefined ? (updates.is_weighable ? 1 : 0) : null,
      updates.is_weighable !== undefined ? (updates.is_weighable ? 1 : 0) : null,
      updates.is_loose !== undefined ? (updates.is_loose ? 1 : 0) : null,
      updates.is_loose !== undefined ? (updates.is_loose ? 1 : 0) : null,
      updates.base_unit,
      updates.sale_unit,
      updates.unit_conversion_ratio,
      updates.subunit_sale_price,
      updates.min_stock_alert,
      id
    ]);
  },

  async deleteProduct(id: string): Promise<void> {
    await sqlDb.execute('UPDATE products SET is_active = 0, is_archived = 1 WHERE id = ?', [id]);
  },

  // --- MULTI-BARCODE CHILD ENGINE (M3.1) ---
  async getProductBarcodes(productId: string): Promise<ProductBarcode[]> {
    try {
      return await sqlDb.query<ProductBarcode>(
        'SELECT * FROM product_barcodes WHERE product_id = ? ORDER BY id ASC',
        [productId]
      );
    } catch {
      return [];
    }
  },

  async addProductBarcode(productId: string, barcode: string, notes = ''): Promise<void> {
    const trimmed = barcode.trim();
    if (!trimmed) throw new Error('Barcode cannot be empty');
    const existing = await this.checkBarcodeExists(trimmed);
    if (existing) {
      throw new Error(`Barcode "${trimmed}" is already assigned to "${existing.name}".`);
    }
    await sqlDb.execute(`
      INSERT INTO product_barcodes (product_id, barcode, notes, packing_desc, created_at)
      VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
    `, [productId, trimmed, notes, notes]);
  },

  async deleteProductBarcode(id: number): Promise<void> {
    await sqlDb.execute('DELETE FROM product_barcodes WHERE id = ?', [id]);
  },

  // --- DUAL INVENTORY BULK LEDGER (M3.3) ---
  // Opening a 50kg bag (Bori) deducts 1 whole bag and adds 50kg to loose stock
  async openWholeBag(productId: string): Promise<{ success: boolean; newBags: number; newStockKg: number }> {
    const prod = await sqlDb.get<Product>('SELECT * FROM products WHERE id = ?', [productId]);
    if (!prod) throw new Error('Product not found.');
    const wholeBags = Number(prod.whole_bags_stock || 0);
    if (wholeBags < 1) {
      throw new Error('No whole bags in stock to open.');
    }
    const bagWeight = Number(prod.bag_weight_kg || 50.0);
    const newBags = wholeBags - 1;
    const newStockKg = Number(prod.stock_qty || 0) + bagWeight;

    await sqlDb.execute(`
      UPDATE products SET
        whole_bags_stock = ?,
        stock_qty = ?,
        updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `, [newBags, newStockKg, productId]);

    return { success: true, newBags, newStockKg };
  },

  async getCategories(): Promise<Category[]> {
    const rows = await sqlDb.query<any>('SELECT * FROM categories ORDER BY name ASC');
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      is_taxable: Boolean(r.is_taxable),
      tax_rate_percent: r.tax_rate_percent || 18.0
    }));
  },

  async toggleCategoryTax(id: string, isTaxable: boolean, taxRatePercent = 18.0): Promise<void> {
    await sqlDb.execute(`
      UPDATE categories SET is_taxable = ?, tax_rate_percent = ? WHERE id = ?
    `, [isTaxable ? 1 : 0, taxRatePercent, id]);
  },

  /**
   * Blended Moving Average Cost Recomputation:
   * (Q_old * C_old + Q_new * C_new) / (Q_old + Q_new)
   */
  async recordStockReceiptWithMovingAverage(
    productId: string,
    receivedQty: number,
    supplierInvoiceUnitCost: number
  ): Promise<number> {
    let prod = await sqlDb.get<Product>('SELECT * FROM products WHERE id = ?', [productId]);
    if (!prod) {
      prod = await this.findByBarcodeOrSku(productId);
    }
    if (!prod) throw new Error(`Product not found for ID/code "${productId}".`);

    const oldQty = Math.max(0, prod.stock_qty);
    const oldCost = prod.cost_price;
    const totalQty = oldQty + receivedQty;

    let blendedCost = supplierInvoiceUnitCost;
    if (totalQty > 0) {
      blendedCost = ((oldQty * oldCost) + (receivedQty * supplierInvoiceUnitCost)) / totalQty;
    }

    await sqlDb.execute(`
      UPDATE products SET
        stock_qty = stock_qty + ?,
        cost_price = ?,
        updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `, [receivedQty, Math.round(blendedCost * 100) / 100, productId]);

    return blendedCost;
  }
};
