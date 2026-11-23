# Point of Sale & ERP System — 100 Locked Specifications & Architecture Blueprint (Final Reconciled)

> **Status:** 100% APPROVED, FULLY RECONCILED & LOCKED  
> **Store Identity:** Point of Sale (Pakistani Retail Grocery & General Store)  
> **Deployment Target:** Standalone Counter PC (Intel Pentium G650 @ 2.80GHz, 10GB RAM, 256GB SSD, Windows 10 64-bit)  
> **Live Production Database:** `%APPDATA%\grocery-store-pos\grocery_master.db`  
> **Data Loss Guarantee:** 100% ZERO DATA LOSS — Automated pre-boot & shift-close `.bak` snapshots, strictly additive migrations, no dropping of tables or wiping of user directories.

---

## 1. Executive Summary & Core Directives

1. **Active Inventory Preservation**: The store owner is actively entering and saving inventory items in the existing release installed on their counter PC. Upgrades, installers, and code rebuilds must attach seamlessly to the existing `grocery_master.db` database without overwriting or deleting any existing record.
2. **Two-Window Electron Architecture**:
   - Independent dedicated windows for **Cashier POS Terminal** and **Admin Management / Reports**.
   - Windows open each other without replacing or converting the active window (so cashier billing is never disrupted).
   - Singleton window guard: Focuses existing instance rather than opening duplicate windows.
3. **Admin PIN & Hashed Security Timing**:
   - First-launch Admin PIN setup implemented in **Phase 1**, stored securely as salted scrypt hash.
   - Built-in secret emergency recovery bypass for Admin PIN reset via UI (never revealed on screen).
   - Live Admin PIN change capability in Settings.
   - Cashier profile manager and `Ctrl + L` lock/switch placed in **Phase 2**, providing PIN verification infrastructure for all subsequent phases.
4. **Ergonomic Keyboard-First POS**:
   - Double-tap `Esc` (within 500ms, no modal open) clears **only the active bill tab** with **zero confirmation popups**.
   - Global `Ctrl + Z` instantly restores the last cleared bill tab.
   - `Enter` on barcode input opens the Checkout / Payment modal.
   - `S` key exclusively toggles Split Payment mode.
   - `Tab` inside payment modal moves between input fields; in the cart, `Tab` cycles between Quantity and inline Price bargaining with **zero supervisor blocks**.
5. **Configurable Barcode Stickers (All Defaults = ON)**:
   - Barcode Graphic, Barcode Number, Product Name, Retail Price, and Store Name all default to ON, with toggles to turn off any field.
   - Supports both A4 sticky sheet grid (24, 30, 40 per page) and Single-Sticker PDF exports with copies counter.
6. **Pentium G650 Optimization (Windows 10 64-bit)**: Sub-10ms barcode processing, native `better-sqlite3` IPC, zero heavy animations, and lightweight memory footprint (<150MB).
7. **Exact Point of Sale Visual Identity**: Consistent with `pos-core` design tokens:
   - Primary Dark Slate: `#243338`
   - Secondary Teal Slate: `#5B7981`
   - Accent Warm Cream: `#E3D5C0`
   - Clean, high-contrast light table surfaces and zero emojis or decorative imagery.

---

## 2. Reconciled Requirements Matrix by Operational Domain

### Domain 1: Safe Upgrades & Data Preservation
- **Q1 [Pre-Boot Backup]**: On every application boot, the system copies the target database to `%APPDATA%\grocery-store-pos\POS_Backups\pre_upgrade_grocery_master_<YYYYMMDD_HHMMSS>.bak` before running any initialization code.
- **Q2 [Additive Migrations]**: Database schema changes are strictly additive. Migrations use `ALTER TABLE ... ADD COLUMN` inside safety checks. Tables are NEVER dropped, truncated, or recreated.
- **Q3 [Rolling Automated Backups]**: Daily rolling backups plus shift close backups preserved in `POS_Backups` on the 256GB SSD.
- **Q4 [Shift Close Backup]**: In addition to boot backups, an automated backup snapshot is written on every shift close (Z-Report).
- **Q5 [NSIS Installer Safety]**: The NSIS installer script is configured with `deleteAppDataOnUninstall = false` to prevent wiping user data in `%APPDATA%`.
- **Q6 [Boot Schema Introspection]**: On startup, a programmatic schema validator runs `PRAGMA table_info` across all core tables, verifying required columns exist before the React UI mounts.
- **Q7 [Multi-Candidate Path Resolver]**: Resolves the database path in strict priority:
  1. `%APPDATA%\grocery-store-pos\grocery_master.db`
  2. `%APPDATA%\Point of Sale & ERP System\grocery_master.db`
  3. `%APPDATA%\mr-super-store-pos\grocery_master.db`
  4. Local project root / resource directory fallback.
- **Q8 [Database & Backups Menu]**: Dedicated menu in Settings displaying active DB path, file size, item count, and 1-click Manual Backup, 1-click USB Export, Guided Safe Restore, and SQLite VACUUM optimization.
- **Q9 [Power Loss Resilience]**: SQLite configured with `PRAGMA journal_mode = WAL;` and `PRAGMA synchronous = FULL;` to prevent corruption during sudden Pakistani load-shedding and power cuts.
- **Q10 [Crash Recovery Prompt]**: Active cart draft auto-saved; on reboot after power loss, the terminal prompts: "Resume unfinished bill or Start new bill".

---

### Domain 2: POS Terminal Keyboard Ergonomics & Barcode Engine
- **Q11 [Global HID Wedge Listener]**: Global keystroke buffer (<30ms) with native audio chime; auto-focuses and adds scanned items to cart without mouse clicks.
- **Q12 [Double-Tap Esc Bill Clear & Global Ctrl+Z Undo]**: Pressing `Esc` twice within 500ms clears the active bill tab with zero confirmation popups. Global `Ctrl + Z` undoes the clear immediately. Single `Esc` on open modal closes only that modal and resets the timer.
- **Q13 [Enter to Checkout Trigger]**: Pressing `Enter` on an empty barcode input opens the Checkout / Payment modal.
- **Q14 [Key-Bound Payment Modal & S Split]**:
  - `S` = Exclusively toggles Split Payment mode.
  - `Tab` inside payment modal moves focus between input fields.
  - `1` = Cash, `2` = Card, `3` = Digital, `4` = Khata.
  - `Enter` = Confirm & Pay, `Esc` = Cancel & return to bill.
- **Q15 [Unrestricted Tab Price Bargaining]**: In cart table, `Tab` focuses Quantity and inline Unit Price fields; cashier can adjust prices immediately with **zero supervisor PIN friction**.
- **Q16 [Nearest Rs. 5 Cash Rounding]**: Cash bills automatically round to the nearest Rs. 5 (`(Math.round(Total / 5) * 5) - Total`), eliminating coin shortage friction.
- **Q17 [F1–F4 Parked Multi-Bills]**: Up to 4 concurrent parked bill tabs with item counter badges. Double-Esc clears only the selected tab.
- **Q18 [F7 Quick Price Check]**: `F7` opens an overlay to scan any item, displaying its name, price, and stock; `Esc` dismisses without affecting the active bill.
- **Q19 [F8 Unregistered Barcode Quick Add]**: Scanning an unlisted barcode triggers a Quick Add dialog pre-filled with the barcode; cashier inputs Name and Price, hits `Enter`, and it is immediately added to the cart and saved to inventory.
- **Q20 [Soft Negative-Stock Warning]**: Scanning an item with zero or negative stock displays an amber warning badge but does not halt checkout.

---

### Domain 3: Bulk Loose Goods & Produce Engine
- **Q21 [Dual-Ledger Bulk Inventory]**: Commodities (Sugar, Rice, Pulses, Flour) maintain dual tracking: `whole_bags_stock` (50kg Bori) and `loose_kg_stock`. Opening a bag deducts 1 whole bag and adds 50kg to loose stock.
- **Q22 [Dual Produce Terminal Input]**: Cashier sells loose goods by entering either:
  - Weight in Kilograms (e.g., `1.750` kg), OR
  - Rupee Value (e.g., `Rs. 200` of Sugar, auto-calculating `1.333` kg).
  - `Up`/`Down` arrow keys toggle between Weight and Rupee mode.
- **Q23 [Manual Scale Entry]**: Cashier reads counter scale display and types the weight manually (no COM port drivers required).
- **Q24 [Multi-Barcode Support per Product]**: A single inventory item can have multiple alternate barcodes linked (e.g., manufacturer packaging change or promo packs).
- **Q25 [2-Letter Terminal Quick Search]**: Typing 2 or more letters in terminal brings up instant matching products for unbarcoded goods.

---

### Domain 4: F6 Returns, Exchanges & Invoice Voids
- **Q26 [F6 Return & Void Terminal]**: Pressing `F6` opens the Returns & Voids modal.
- **Q27 [Mandatory Invoice Lookup]**: Customer receipt barcode scan or invoice number lookup required before accepting returns or voids.
- **Q28 [Disposition Selection]**:
  - `1` = Restock (sellable goods returned to shelf inventory)
  - `2` = Scrap / Wastage (damaged/expired goods written off to inventory loss)
- **Q29 [Dynamic Admin PIN Verification]**: Enforces owner's configured Admin PIN (salted scrypt) to authorize refunds or transaction voids.
- **Q30 [Refund Tender Routing & Reversal]**: Refunds routed as Cash from drawer or Credit to customer Khata. Voids restore full shelf stock and reverse drawer totals.
- **Q31 [Return Receipt Format]**: Thermal printer prints a Credit Note / Return Slip referencing original invoice number and returned line items.

---

### Domain 5: Cashier Shifts, Blind Reconciliation & Petty Expenses
- **Q32 [Strict Blind Shift Close]**: Expected cash in drawer is hidden from the cashier at shift end.
- **Q33 [Pakistani Currency Denomination Matrix]**: Arrow-driven counting: 5000 -> 1000 -> 500 -> 100 -> 50 -> 20 -> 10 -> coins.
- **Q34 [Zero-Tolerance Variance Log]**: `Variance = Counted Cash - Expected Cash`; prompt requires explanation note if discrepancy exists.
- **Q35 [Ctrl+D Petty Expense Tracker (Dukaan Kharch)]**:
  - Presets: `1` Chai/Food, `2` Fuel/Generator, `3` Cleaner/Maintenance, `4` Misc.
  - Displays today's shift expense history table with running total.
  - Editing or deleting an expense entry requires Admin PIN.
- **Q36 [Automatic 80mm Z-Report]**: Comprehensive shift summary receipt printing upon closing.

---

### Domain 6: Customer Khata, Amanat & Bahi Khata Ledger
- **Q37 [Rapid Khata Search]**: Accessed via `C` key in checkout modal.
- **Q38 [Dual Balance Tracking]**: Real-time tracking of `Udhaar Balance` (Customer owes store) and `Amanat Balance` (Advance deposit wallet).
- **Q39 [1-Click Amanat Auto-Deduct]**: If customer has an Amanat deposit, prompt 1-click auto-deduction against bill total.
- **Q40 [Credit Limit Soft Warning]**: Displays amber warning badge if customer exceeds credit limit, but allows cashier to proceed with confirmation.
- **Q41 [Wasooli & Kasar Field]**: When receiving customer payment (Wasooli), cashier records voluntary concession (`Kasar`).
- **Q42 [Khata Period Bill Re-Opening]**: Ability to open a customer's invoices for any selected date range directly into the terminal view for inspection/adjustment, with 1-click consolidated 80mm thermal statement print.

---

### Domain 7: Supplier Wholesale Ledger, Wapsi & Procurement
- **Q43 [Two Supplier Classes]**: `ADVANCE_PREPAID` vs `POST_DELIVERY_CREDIT` suppliers.
- **Q44 [Prepaid Wallet Drawdown]**: Advance balance auto-draws down on delivery with editable amount before settling.
- **Q45 [Advance Exhausted Alert]**: Prominent warning banner and negative balance notification if delivery exceeds prepaid advance.
- **Q46 [Pending Wapsi Offset Banner]**: Top banner on delivery bills: `Pending Wapsi Credit: Rs. X — [Apply Offset]`.
- **Q47 [Drawer Payout Checkbox]**: Supplier payments offer `[x] Deduct from Cash Drawer` option.
- **Q48 [Katchi Parchi vs Pakka Bill]**: Provisional draft delivery bills editable before finalizing into main stock ledger.

---

### Domain 8: Catalog, Rapid Product Entry & Emergency Billing
*(Remaining in-depth inventory entry questions will be asked at the start of Phase 8).*
- **Q49 [Rapid Keyboard-First Entry]**: Focus starts on Barcode (or `Enter` to auto-generate EAN-13) -> `Tab` Name -> `Tab` Category -> `Tab` Cost -> `Tab` Sale Price -> `Tab` Stock -> `Enter` to save and auto-refocus for the next item without touching the mouse.
- **Q50 [Bidirectional Pricing Calculator]**: Live sync: Cost + Margin % <-> Sale Price, displaying real-time Profit (Rs.) and Margin (%).
- **Q51 [Duplicate Barcode Guard]**: Alert pops up if scanned barcode already exists, offering 1-click jump to edit existing item.
- **Q52 [Separate Restock vs Edit Modals]**: Fast 'Restock' dialog (add units + update cost) separated from full metadata 'Edit Product' modal.
- **Q53 [Favorites & Unbarcoded Drawer]**: Quick-access drawer for frequently sold in-house generated barcode and unbarcoded products.
- **Q54 [Catalog Controls]**: Soft delete / archive for obsolete items, Category discount toggles, and Master Tax toggle (default OFF).
- **Q55 [Emergency Retroactive Billing]**: Terminal overlay modal requiring Admin PIN, supporting historical date/time attribution, `Deduct Inventory = OFF` default, and explicit toggle: `[Add to Today's Cash Drawer]` vs `[Past Settlement / Bypass Drawer]`.

---

### Domain 9: Financial Reports & Operational Audits
- **Q56 [Preset Date Filters]**: 1-click filters (Today, Yesterday, This Week, This Month, Last Month, Custom Range).
- **Q57 [Net Operational Profit]**: Calculates Gross Revenue - COGS - Recorded Petty Expenses = Net Operational Profit.
- **Q58 [Payment Audit Breakdown]**: Itemized breakdown across Cash, Card, Digital, Khata Credit, and Split payments.
- **Q59 [Top-Selling Item Table]**: Flat ranked table of all products sold during selected date range sorted by quantity and sales value.
- **Q60 [Dual Report Output]**: Instant 80mm thermal summary slip AND clean A4 printable view.

---

### Domain 10: Printing Standards & Configurable Stickers
- **Q61 [Crisp Pitch-Black Thermal CSS]**: Applies `-webkit-font-smoothing: none;`, bold monospace typography, and solid `#000000` text to permanently fix blurry/light thermal prints.
- **Q62 [Zero-Waste Auto-Cutter]**: Strips bottom margins to trigger printer auto-cut immediately following the last receipt line.
- **Q63 [Print Receipt Behavior Setting]**: Configurable in Settings: `[Silent Auto-Print on Tender]` vs `[Prompt: Enter to Print / Esc to Skip]`.
- **Q64 [Configurable Barcode Sticker PDF Generator (Defaults = ON)]**:
  - Barcode Graphic, Barcode Number, Product Name, Retail Price, and Store Name all default to ON, with toggles to turn off any field.
  - Multi-format: A4 sticky sheets (24, 30, 40 per page) AND Single-Sticker PDF exports with copies counter.
- **Q65 [Standard 80mm Paper]**: Strictly locked to 80mm POS thermal paper (48 columns).

---

### Domain 11: Security, Roles & Hardware Optimization
- **Q66 [Admin PIN in Phase 1]**: Stored as salted scrypt hash. Live Admin PIN modification in Settings. Secret emergency reset gate via UI.
- **Q67 [Cashier Switch & Manual Screen Lock]**: Cashier profiles with unique 4-digit PINs; manual lock via `Ctrl + L` or Header Lock icon (no automatic timer lockout).
- **Q68 [Two-Window Electron (Singleton)]**: Dedicated singleton windows for Cashier Terminal and Admin Management.
- **Q69 [100% True Offline Guarantee]**: All scripts, fonts, icons, styles, and SQLite engine bundled locally in Electron. Zero external network dependencies.
- **Q70 [Pentium G650 Optimization (Windows 10 64-bit)]**: Lightweight Electron IPC footprint, sub-10ms scan response, low RAM (<150MB), debounced searches, and zero heavy 3D animations.
