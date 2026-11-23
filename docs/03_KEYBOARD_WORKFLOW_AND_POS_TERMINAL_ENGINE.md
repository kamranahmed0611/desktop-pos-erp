# Keyboard Workflow & POS Terminal Billing Engine (Final Reconciled)

> **Operational Standard:** 100% Mouse-Free Cash Counter Operation.  
> Every routine action—from scanning, quantity adjustments, price bargaining, parked bills, petty expenses, to checkout—is executed purely via rapid keyboard shortcuts.

---

## 1. Master Keyboard Shortcuts Reference

| Shortcut | Scope | Action / Function |
|---|---|---|
| `Esc` + `Esc` (Double within 500ms) | Terminal | **Instantly clear active bill tab with zero confirmation popups** (Does not affect other parked tabs) |
| `Ctrl + Z` | Global Terminal | **Global Undo Accidental Bill Clear**: Restores the last cleared bill tab immediately |
| `Enter` | Barcode Field | **Trigger Checkout / Payment Tender Modal** |
| `1` | Checkout Modal | Tender as **CASH** (with Nearest Rs. 5 rounding) |
| `2` | Checkout Modal | Tender as **CARD** (Credit/Debit POS Machine) |
| `3` | Checkout Modal | Tender as **DIGITAL WALLET** (JazzCash, Easypaisa, Raast) |
| `4` | Checkout Modal | Tender as **CUSTOMER KHATA** (Credit ledger entry) |
| `S` | Checkout Modal | **Toggle SPLIT PAYMENT Mode** (Bound exclusively to `S`) |
| `Tab` | Checkout Modal | Move focus between input fields (tendered cash, card amount, notes) |
| `Tab` | Cart Table | Focus active row's Quantity and inline Unit Price fields for instant bargaining |
| `Enter` | Checkout Modal | **Confirm & Finalize Payment** (Print receipt based on store setting) |
| `Esc` (Single) | Checkout / Modals | Close active modal dialog and return to current bill (Never triggers bill clear) |
| `F1` – `F4` | Global Terminal | Switch between 4 concurrent parked bill tabs with item counter badges |
| `F6` | Global Terminal | Open **Returns & Exchanges / Void** modal (Restock vs Scrap, Admin PIN required) |
| `F7` | Global Terminal | Instant Price & Stock Check modal (Dismiss with `Esc`) |
| `F8` | Global Terminal | Quick Add Product modal (Auto-triggered on unknown barcode) |
| `Ctrl + D` | Global Terminal | Open Petty Expense modal (Dukaan Kharch history & entry; Admin PIN to edit/delete) |
| `Ctrl + L` | Global Terminal | Lock Screen / Fast Cashier Switch (Numeric PIN pad or Header Lock Icon) |
| `F11` | Window | Toggle Fullscreen Kiosk Mode |
| `Up` / `Down` | Produce Entry | Toggle between Weight (Kg) and Rupee Amount (Rs.) |
| `Delete` / `Backspace` | Cart Table | Remove highlighted line item from the cart |
| `C` | Checkout Modal | Search Customer Khata by Name, Phone, or Account No |

---

## 2. Multi-Window Electron Architecture (Cashier vs Admin)

To ensure billing on the cash counter is never interrupted or closed:
1. **Dedicated Cashier Window**: Fullscreen POS Terminal running `UniversalBillingTerminal`.
2. **Dedicated Admin Window**: Backoffice, Inventory Management, Reports, Supplier Ledgers, and Settings.
3. **Cross-Navigation Without Replacement**:
   - Clicking 'Admin' from the POS header opens the Admin window in a new window; the Cashier POS window stays open with all active bills intact.
   - Clicking 'POS Terminal' from the Admin window switches focus to the Cashier POS window.
4. **Singleton Window Guard**:
   - Each window is unique. If an Admin window is already open, clicking 'Admin' brings the existing window to the front and restores focus instead of opening a duplicate instance.

---

## 3. Global HID Barcode Wedge Engine

Counter barcode scanners operate as USB HID Keyboard Wedge devices. The terminal captures barcode keystrokes globally regardless of which DOM element currently has focus.

```
[BARCODE SCANNER FIRED]
          │
          ▼
Global Window Keydown Listener
Buffer chars with inter-keystroke timer (<30ms)
Detect trailing 'Enter' key
          │
          ▼
   [AUDIO CHIME FIRED]
          │
          ▼
Query Database for Barcode:
SELECT * FROM products WHERE barcode = ? OR id IN 
  (SELECT product_id FROM product_barcodes WHERE barcode = ?)
          │
          ├─── Found ──► Add to active cart (Qty + 1)
          │             Auto-scroll table to newest item
          │
          └─── Not Found ──► Play Warning Tone
                             Trigger F8 Quick Add Modal
                             Pre-fill barcode field
                             Focus on 'Product Name'
```

---

## 4. Double-Tap Esc Ergonomics & Global Ctrl+Z Undo Protection

To prevent accidental data loss while allowing ultra-fast counter resets:
1. **500ms Timer**: Pressing `Esc` twice within 500ms clears the cart immediately without an annoying confirmation popup.
2. **Modal Isolation**:
   - If any modal is open (`F7` Price Check, `F8` Quick Add, Tender Modal, Returns, etc.), pressing `Esc` **closes only that modal**.
   - It is completely ignored by the double-Esc clear detector, and the 500ms timer resets immediately upon closing the modal.
3. **Active Tab Only**:
   - Double-Esc clears **only the active bill tab** (`F1`, `F2`, `F3`, or `F4`). Other parked bills remain untouched.
4. **Global Ctrl+Z Undo**:
   - When a bill is cleared, its line items are cached in memory.
   - Pressing `Ctrl + Z` globally restores the cleared items into the active bill tab immediately.

---

## 5. Shortcut Isolation: Tab vs S Key

To eliminate shortcut collisions:
- **Inside Payment Modal**:
  - `S` is bound exclusively to toggle Split Payment.
  - `Tab` moves focus sequentially through input fields (e.g., Tendered Cash -> Card Amount -> Notes).
- **In Active Cart Table**:
  - `Tab` cycles focus between the highlighted item's **Quantity** and inline **Unit Price** fields for instant bargaining with **zero supervisor blocks**.

---

## 6. F6 Returns, Exchanges & Invoice Voids Protocol

When a customer brings back an item or a bill needs cancellation:
1. Cashier presses `F6`.
2. Modal prompts for **Original Customer Invoice Number** (scanned from receipt barcode or typed).
3. System loads the original transaction line items.
4. Cashier selects item(s) being returned and chooses disposition:
   - **`1` = Restock**: Item is in sellable condition; stock quantity increments back into active shelf inventory.
   - **`2` = Scrap / Wastage**: Item is damaged, expired, or spoiled; logged to inventory scrap loss without increasing sellable stock.
5. Refund destination:
   - **Cash Refund**: Paid directly out of the active cash drawer.
   - **Khata Credit**: Credited to the customer's ledger balance.
6. **Admin PIN Check**: System prompts for the owner's configured Admin PIN (stored as salted scrypt hash) before finalizing the refund or void.
7. Thermal printer prints a Credit Note / Return Slip referencing the original invoice.

---

## 7. Cart Financial Precision & Nearest Rs. 5 Rounding Engine

Pakistani currency circulation has virtually phased out Rs. 1 and Rs. 2 coins; transactions are settled in multiples of Rs. 5 notes.

### Cash Rounding Mathematical Specification
```typescript
export interface CartCalculation {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  kasarAmount: number;
  roundingAmount: number;
  finalTotal: number;
}

export function computeCartTotals(
  items: Array<{ quantity: number; unitPrice: number }>,
  discountPercent: number = 0,
  taxPercent: number = 0,
  kasar: number = 0,
  isCashPayment: boolean = true,
  enableRounding: boolean = true
): CartCalculation {
  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const discountAmount = Math.round((subtotal * (discountPercent / 100)) * 100) / 100;
  const taxableAmount = subtotal - discountAmount;
  const taxAmount = Math.round((taxableAmount * (taxPercent / 100)) * 100) / 100;
  
  let unroundedTotal = taxableAmount + taxAmount - kasar;
  
  let roundingAmount = 0;
  let finalTotal = unroundedTotal;

  if (isCashPayment && enableRounding) {
    // Round to nearest Rs. 5
    // Examples: 433 -> 435 (+2); 432 -> 430 (-2); 437 -> 435 (-2); 438 -> 440 (+2)
    finalTotal = Math.round(unroundedTotal / 5) * 5;
    roundingAmount = Math.round((finalTotal - unroundedTotal) * 100) / 100;
  }

  return {
    subtotal,
    discountAmount,
    taxAmount,
    kasarAmount: kasar,
    roundingAmount,
    finalTotal
  };
}
```

---

## 8. Customer Khata: Amanat Auto-Deduct, Credit Limits & Period Bills

1. **Khata Lookup (`C` key in Checkout)**:
   - Displays customer name, phone, current `Udhaar Balance`, and `Amanat Balance` (advance deposit wallet).
2. **Amanat Auto-Deduct**:
   - If customer has an Amanat deposit, prompt: `Amanat Deposit Available: Rs. X — [Auto-Deduct from Total]`.
3. **Credit Limit Warning**:
   - If `Udhaar Balance + Bill Total > Credit Limit`, an amber badge warns the cashier: `Credit Limit Exceeded! Current: Rs. X, Limit: Rs. Y`. Cashier can confirm and proceed.
4. **Khata Period Bill Re-Opening**:
   - From the Customer Profile, cashier can select a date range (e.g., this week or this month) and click **Open Period Bills in Terminal**.
   - Bills load directly into the terminal interface for inspection or correction, with a 1-click consolidated 80mm statement thermal printout.

---

## 9. Blind Shift Reconciliation & Petty Expenses (Ctrl+D)

### Blind Shift Protocol
1. Cashier finishes shift and presses **Close Shift**.
2. **Expected Cash is completely hidden** on screen.
3. Cashier counts physical cash via Denominations Matrix:
   - Rs. 5000 -> Rs. 1000 -> Rs. 500 -> Rs. 100 -> Rs. 50 -> Rs. 20 -> Rs. 10 -> Coins
4. System calculates `Variance = Counted Cash - Expected Cash`.
5. If Variance != 0, cashier must enter an explanation note.
6. Automatic 80mm Z-Report prints immediately.
7. Database auto-saves a shift close backup `.bak` snapshot in `POS_Backups`.

### Petty Expense Drawer Logging (`Ctrl + D`)
1. Cashier hits `Ctrl + D`.
2. Presets: `1` Chai/Khana, `2` Fuel/Bijli, `3` Safai/Cleaner, `4` Misc.
3. Modal displays **Today's Expense History Table** with running total.
4. Cashier enters Amount and notes -> Press `Enter`.
5. Payout event is recorded immediately, deducting from shift expected cash.
6. **Editing or deleting an expense entry requires Admin PIN verification**.
