# Hardware Integration, Thermal Receipt & Barcode Sticker Engine (Final Reconciled)

> **Critical Printing Directives (Owner Feedback):**  
> 1. Eliminate blurry/faded text: Thermal printer must produce solid, crisp, pure black prints without grayscale dithering.  
> 2. Zero wasted blank paper: Auto-cutter must trigger immediately when text ends.  
> 3. Configurable print trigger: Toggle between Silent Auto-Print and Enter to Print / Esc to Skip in Settings.  
> 4. Sticker generator defaults: Barcode Graphic, Barcode Number, Product Name, Retail Price, and Store Name all default to ON, with toggles to turn off any field. Supports both A4 sheets (24, 30, 40 per page) and Single-Sticker PDF exports.

---

## 1. 80mm Thermal Printer Configuration

The system is locked to **80mm (3-inch / 48-column)** thermal receipt printing.

### Crisp, Pure-Black Thermal CSS Specification
Blurry prints on thermal POS printers in Chromium/Electron are caused by grayscale subpixel anti-aliasing. The following CSS rules ensure crisp, pitch-black 1-bit thermal dot impact:

```css
@media print {
  @page {
    margin: 0;
    size: 80mm auto; /* Variable length, strictly 80mm width */
  }

  body.receipt-print {
    margin: 0 !important;
    padding: 0 !important;
    width: 72mm !important; /* Printable area within 80mm roll */
    background: #ffffff !important;
    color: #000000 !important;
    font-family: 'Courier New', Courier, monospace !important;
    font-size: 12px !important;
    font-weight: 700 !important; /* Crisp bold lines */
    line-height: 1.15 !important;
    -webkit-font-smoothing: none !important; /* Disables gray dithering */
    -moz-osx-font-smoothing: unset !important;
    text-rendering: geometricPrecision !important;
  }

  .receipt-table {
    width: 100% !important;
    border-collapse: collapse !important;
    color: #000000 !important;
  }

  .receipt-table th,
  .receipt-table td {
    padding: 1px 0 !important;
    font-size: 11px !important;
    color: #000000 !important;
  }

  .divider-dashed {
    border-top: 1px dashed #000000 !important;
    margin: 3px 0 !important;
  }

  .divider-double {
    border-top: 2px solid #000000 !important;
    margin: 3px 0 !important;
  }

  /* Zero Paper Waste: Remove bottom margin to trigger cutter immediately */
  .receipt-footer-end {
    margin-bottom: 2mm !important;
    padding-bottom: 0 !important;
  }
}
```

---

## 2. Receipt Print Behavior Setting

In **Store Settings**, the owner can configure the checkout printing workflow:

```typescript
export interface PrintSettings {
  mode: 'SILENT_AUTO_PRINT' | 'PROMPT_CONFIRMATION';
  paperWidth: '80mm';
  autoCut: boolean;
  storeName: string;
  storeSubtitle: string;
  address: string;
  phone1: string;
  phone2?: string;
  footerPolicy: string;
}
```
- **Option A: Silent Auto-Print on Tender**: As soon as payment is confirmed (`Enter` in checkout), the thermal printer silently prints the receipt and triggers auto-cut.
- **Option B: Prompt 'Enter to Print / Esc to Skip'**: Checkout finishes with a high-contrast prompt: `[Enter: Print Receipt]  [Esc: Skip / Next Customer]`, allowing cashiers to save paper when customers decline a receipt.

---

## 3. Standard 80mm Receipt Layout Anatomy

```
================================================
               Point of Sale
        General & Departmental Store
   Main Bazaar, Near Clock Tower, Store City
           Phone: 0300-1234567 / 0321-7654321
================================================
Inv #: INV-20261017-0042        Date: 17-Oct-2026
Cashier: Ahmed                  Time: 18:45:12
------------------------------------------------
ITEM                    QTY    RATE       TOTAL
------------------------------------------------
Olpers Milk 1L           2    290.00     580.00
Tapal Danedar 430g       1    680.00     680.00
Cheeni (Loose)        1.50 kg 140.00     210.00
National Salt 800g       2     60.00     120.00
------------------------------------------------
Subtotal:                              1,590.00
Discount:                                  0.00
Kasar:                                    10.00
Rounding (Cash):                          +0.00
------------------------------------------------
TOTAL PAYABLE:                       Rs. 1,580.00
------------------------------------------------
TENDER: CASH                         Rs. 2,000.00
CHANGE DUE:                            Rs. 420.00
================================================
Items Count: 4           Total Units: 6.50
------------------------------------------------
  تبدیلی صرف ۳ دن کے اندر رسید کے ساتھ ممکن ہے۔
   خریداری کا شکریہ - دوبارہ تشریف لائیے گا۔
================================================
[IMMEDIATE AUTO-CUT TRIGGER HERE - NO BLANK SPACE]
```

---

## 4. Specialized Receipt Slip Types

### Type A: Credit Note / Return Receipt
- Printed when processing a return via `F6`.
- References original invoice number (`Original Inv: INV-20261015-0019`).
- Displays returned items, disposition (`RESTOCKED` or `SCRAP/WASTAGE`), and refund method (`CASH REFUND` or `CREDITED TO KHATA`).

### Type B: Cashier Shift Close Z-Report
- Printed automatically on blind shift close.
- Header: Cashier Name, Shift Start Time, Shift End Time.
- Financial Audit Table:
  - Opening Float
  - Cash Sales
  - Card Sales
  - Digital / Mobile Wallet Sales
  - Khata Credit Sales
  - Petty Expenses (`Ctrl + D`) Itemized
  - Cash Drops / Payouts
  - Expected Cash in Drawer
  - Counted Physical Cash (Denominations matrix)
  - Net Variance (Surplus / Shortage)

### Type C: Customer Khata Statement Slip
- Compact 80mm slip printable directly from customer profile.
- Shows opening balance, recent debits (purchases), credits (payments received), Kasar granted, and closing balance.

---

## 5. Configurable Barcode Sticker PDF Generator

Allows the store owner to generate and print barcode sticker labels for in-house packaged goods with full configuration control.

### Configurable Sticker Elements (All Defaults = ON)
In the Sticker Generator modal, the user sees all essential fields enabled by default, with toggles to turn off any field:
- `[x] Barcode Graphic (EAN-13 / Code-128)` (Default: ON)
- `[x] Barcode Number (Human-readable)` (Default: ON)
- `[x] Product Name` (Default: ON)
- `[x] Retail Price (Rs. XXX)` (Default: ON)
- `[x] Store Name (Point of Sale)` (Default: ON)

### Multi-Format PDF Outputs
1. **A4 Sheet Grid (Sticky Paper)**:
   - 24 labels per sheet (3 columns x 8 rows, 70mm x 37mm)
   - 30 labels per sheet (3 columns x 10 rows, 70mm x 29.7mm)
   - 40 labels per sheet (4 columns x 10 rows, 52.5mm x 29.7mm)
2. **Single-Sticker PDF Pages**:
   - Generates individual pages formatted for dedicated single-label thermal barcode printers (e.g. 50mm x 25mm).
3. **Copies Counter**:
   - Cashier/Admin enters how many copies to print per product (e.g., "Print 25 stickers for Dal Chana").
