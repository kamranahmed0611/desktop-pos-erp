export type UnitType = 'piece' | 'kg' | 'g' | 'pack' | 'liter' | 'dozen';

export interface Category {
  id: string;
  name: string;
  is_taxable: boolean; // default false
  tax_rate_percent: number; // e.g. 18.0
}

export interface Product {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  category: string;
  cost_price: number;
  sale_price: number;
  tax_rate: number;
  stock_qty: number;
  unit_type: UnitType;
  is_weighable: boolean;
  min_stock_alert: number;
  is_active: number;
  updated_at: string;
  // Dual-Unit / Loose Commodity extensions
  is_loose?: boolean;
  base_unit?: string;             // e.g. "Tray", "Bag (50kg)", "Cane (16L)", "Kilogram", "Litre"
  sale_unit?: string;             // e.g. "Egg / Piece", "Kg", "Gram", "Litre", "mL"
  unit_conversion_ratio?: number; // e.g. 1 Tray = 30 Eggs (30); 1 Bag = 50 Kg (50); 1 Kg = 1000 Grams (1000)
  subunit_sale_price?: number;    // Retail price per sale subunit (e.g. Rs. 18 per egg)
  urdu_name?: string;
  whole_bags_stock?: number;
  bag_weight_kg?: number;
  is_archived?: number;
}

export interface ProductBarcode {
  id: number;
  product_id: string;
  barcode: string;
  notes?: string;
  packing_desc?: string;
  multiplier?: number;
  is_primary?: number;
  created_at?: string;
}

export interface CartItem {
  product: Product;
  qty: number;
  unit_price: number;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  is_custom_ad_hoc?: boolean;
  is_subunit_sale?: boolean;
  deduct_qty?: number;            // Exact quantity in base units to deduct from stock
  unit_label?: string;            // e.g. "Eggs", "Kg", "Grams", "Litres"
}

export type PaymentMode = 'cash' | 'card' | 'easypaisa' | 'jazzcash' | 'khata';

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  product_id: string;
  product_name: string;
  qty: number;
  unit_cost: number;
  unit_price: number;
  discount_amount: number;
  tax_amount: number;
  subtotal: number;
  unit_label?: string;
  is_subunit_sale?: boolean;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  customer_id?: string;
  customer_name?: string;
  customer_phone?: string;
  total_amount: number;
  tax_amount: number;
  discount_amount: number;
  paid_amount: number;
  change_due: number;
  round_off_amount: number;
  payment_mode: PaymentMode;
  cashier_id?: string;
  cashier_name?: string;
  shift_id?: string;
  is_retroactive?: boolean;
  inventory_deducted?: boolean;
  notes?: string;
  created_at: string;
  items?: InvoiceItem[];
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  nickname?: string;
  address?: string;
  credit_limit: number;
  current_balance: number; // positive = customer owes store (Udhaar)
  amanat_balance?: number; // Advance deposit wallet
  account_no?: string;
  created_at: string;
}

export interface CustomerTransaction {
  id: string;
  customer_id: string;
  invoice_id?: string;
  type: 'CREDIT_SALE' | 'PAYMENT' | 'OPENING_BALANCE' | 'SETTLEMENT_DISCOUNT' | 'ADJUSTMENT' | 'AMANAT_DEPOSIT' | 'AMANAT_DEDUCTION' | 'RETURN_CREDIT' | 'VOID_REVERSAL';
  amount: number;
  balance_after: number;
  notes?: string;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  company: string;
  phone: string;
  email?: string;
  address?: string;
  current_balance: number; // positive = payable to supplier, negative = advance/credit
  balance_type?: 'PAYABLE' | 'ADVANCE' | 'ADVANCE_PREPAID' | 'POST_DELIVERY_CREDIT';
  credit_limit?: number;
  payment_terms_days?: number;
  created_at: string;
}

export type SupplierPaymentChannel = 'CASH' | 'CASH_SAFE' | 'BANK_TRANSFER' | 'CHEQUE' | 'RAAST_ONLINE' | 'EASYPAISA' | 'JAZZCASH';

export type SupplierTxnType = 
  | 'PURCHASE_BILL'      // Banam / Maal Kharid (+)
  | 'PARCHI_DELIVERY'    // Katchi Parchi (+)
  | 'PAYMENT'            // Jama / Adaigi (-)
  | 'SETTLEMENT'         // Kasar / Chhoot (-)
  | 'RETURN_CLAIM'       // Wapsi / Khorak (-)
  | 'OPENING_BALANCE'    // Sabqa Baqaya (+ or -)
  | 'ADJUSTMENT_DEBIT'   // Khaata Durusti (+)
  | 'ADJUSTMENT_CREDIT'  // Khaata Durusti (-)
  | 'ADVANCE_DEPOSIT';   // Peshgi / Advance Deposit (-)

export interface SupplierTransaction {
  id: string;
  supplier_id: string;
  type: SupplierTxnType;
  debit_amount: number;         // Banam / Kharid (+)
  credit_amount: number;        // Jama / Adaigi (-)
  amount: number;               // Primary net amount
  settlement_discount?: number; // Kasar / Settlement amount
  balance_after: number;        // Running Baqaya
  payment_channel?: SupplierPaymentChannel;
  bank_name?: string;
  reference_no?: string;
  invoice_no?: string;          // Vendor invoice or Parchi #
  bill_type?: 'VERIFIED_BILL' | 'PARCHI';
  cheque_status?: 'CLEARED' | 'PENDING_CLEARANCE' | 'BOUNCED';
  cheque_date?: string;
  freight_amount?: number;
  tax_amount?: number;
  gross_amount?: number;
  deduct_from_drawer?: boolean | number;
  items_json?: string;
  notes?: string;
  created_at: string;
}

export interface CurrencyDenominations {
  notes_5000: number;
  notes_1000: number;
  notes_500: number;
  notes_100: number;
  notes_50: number;
  notes_20: number;
  notes_10: number;
  coins: number;
}

export interface Shift {
  id: string;
  cashier_id: string;
  cashier_name: string;
  opening_float: number;
  closing_cash_actual?: number;
  expected_cash: number;
  total_sales_cash: number;
  total_sales_card: number;
  total_sales_digital: number;
  total_sales_khata: number;
  total_returns_cash: number;
  total_petty_expenses: number;
  variance?: number;
  variance_reason?: string;
  status: 'OPEN' | 'CLOSED';
  opened_at: string;
  closed_at?: string;
}

export interface ReceiptFieldVisibility {
  show_store_name?: boolean;
  show_tagline?: boolean;
  show_address?: boolean;
  show_phone?: boolean;
  show_whatsapp?: boolean;
  show_ntn?: boolean;
  show_pos_reg_id?: boolean;
  show_cashier_name?: boolean;
  show_date_time?: boolean;
  show_invoice_number?: boolean;
  show_thank_you?: boolean;
  show_urdu_dua?: boolean;
  show_return_policy?: boolean;
  show_barcode_qr?: boolean;
  show_rounding?: boolean;
  show_developer_watermark?: boolean;
}

export interface StoreSettings {
  store_name: string;
  tagline: string;
  address: string;
  phone: string;
  whatsapp_number: string;
  ntn?: string;
  pos_reg_id?: string;
  easypaisa_number?: string;
  jazzcash_number?: string;
  currency_symbol: string;
  receipt_footer_urdu: string;
  receipt_footer_english: string;
  cash_rounding_nearest: number; // e.g. 5
  default_tax_rate?: number;
  admin_pin: string; // 4-digit PIN e.g. '8888'
  cashier_pin?: string; // 4-digit PIN e.g. '1234'
  pins_configured?: boolean;
  receipt_visibility?: ReceiptFieldVisibility;
  receipt_print_mode?: 'SILENT_AUTO_PRINT' | 'PROMPT_CONFIRMATION';
}
