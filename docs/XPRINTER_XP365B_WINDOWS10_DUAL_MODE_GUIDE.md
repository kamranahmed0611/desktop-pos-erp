# Xprinter XP-365B / XP-D365B Windows 10 Dual-Mode Deployment Guide
**Author:** Teddops Software Engineering  
**Application:** Point of Sale & ERP System  
**Target OS:** Windows 10 (64-bit / 32-bit)  
**Supported Hardware:** Xprinter XP-365B, XP-D365B, XP-80, XP-80C, POS-80  

---

## 1. Overview & Architecture

The **Xprinter XP-365B** is a versatile hybrid thermal printer capable of two distinct operational modes:
1. **Barcode Sticker Mode:** Uses **TSPL** commands to print adhesive die-cut labels (e.g. 70×40mm) and detects gaps between stickers.
2. **Thermal Receipt Mode:** Uses continuous 80mm receipt rolls to print customer sales bills with dynamic height.

To allow the POS software to seamlessly switch between printing sales bills and product barcode stickers **without manual printer re-configuration**, Windows 10 is configured with **two logical printer drivers pointing to the same physical USB port**:

```
                       ┌─────────────────────────┐
                       │  Client Windows 10 PC   │
                       └────────────┬────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
       [ Driver 1: Stickers ]            [ Driver 2: Receipts ]
        "Xprinter XP-D365B"              "Xprinter Receipt 80mm"
       • Die-Cut Labels (70x40mm)        • Continuous Roll (80mm)
       • Labels with Gaps                • Media Type: Continuous
                    │                               │
                    └───────────────┬───────────────┘
                                    ▼
                          Shared Port: USB001
                                    │
                                    ▼
                      ┌───────────────────────────┐
                      │ Physical Xprinter XP-365B │
                      └───────────────────────────┘
```

---

## 2. Hardware Preparation & Sensor Calibration

### A. Paper Guide Adjustment
1. Open the printer cover using the green side release latches.
2. For **70×40mm Stickers:** Slide the orange paper guides inward until they hold the sticker roll snugly in the center. Ensure the paper feeds from underneath the roll.
3. For **80mm Continuous Receipts:** Slide the orange paper guides fully open to accommodate the full 80mm roll.

### B. Hardware Gap Auto-Calibration (Crucial Step)
Whenever you load a new sticker roll or switch between receipt paper and stickers, calibrate the optical gap sensor:
1. Ensure the sticker roll is loaded and the cover is closed.
2. Turn the printer power switch **OFF** (switch is on the right side).
3. Press and hold the **FEED** button on the front panel.
4. While holding **FEED**, turn the power switch **ON**.
5. Wait for the printer to beep twice and the LED to flash, then **immediately release the FEED button**.
6. The printer will feed 2–3 empty stickers forward and back to calculate the gap height automatically. When it stops aligned at the tear bar, calibration is complete.

---

## 3. Installing Driver 1: Barcode Stickers (`Xprinter XP-D365B`)

### Step 1: Run the Seagull Scientific Driver Setup
1. Download or run the Seagull Xprinter Driver executable (e.g., `Xprinter_7.4.3.exe` or `DriverWizard.exe`).
2. Accept the software license agreement and click **Next**.
3. Choose **Install printer drivers** and click **Next**.
4. Select connection type: **USB**.
5. Turn on the printer and connect the USB cable. Windows will detect the device on a virtual port (e.g., `USB001`).
6. In the printer model list, select: **`Xprinter XP-D365B`** (or `Xprinter XP-365B`).
7. Set the printer name to exactly: **`Xprinter XP-D365B`**.
8. Click **Finish** to complete installation.

### Step 2: Configure 70×40mm Sticker Preferences
1. Open Windows **Control Panel** $\rightarrow$ **Devices and Printers** (or press `Win + R`, type `control printers`, press Enter).
2. Right-click **`Xprinter XP-D365B`** and choose **Printing Preferences**.
3. Go to the **Page Setup** tab:
   - Under **Stock**, click **New...** (or edit the existing stock).
   - Name: `70x40mm` (or `USER`).
   - Type: `Die-Cut Labels`.
   - Width: **`2.76 in`** (or `70.0 mm`).
   - Height: **`1.57 in`** (or `40.0 mm`).
   - Exposed Liner Widths: Left: `0.08 in` (2mm), Right: `0.08 in` (2mm).
   - Click **OK**.
   - Orientation: Select **Portrait**.
4. Go to the **Stock** tab:
   - **Method:** `Direct Thermal`.
   - **Type:** `Labels With Gaps`.
   - **Gap Height:** `0.12 in` (3.0 mm).
   - **Post-Print Action:** `Tear Off`.
   - **Occurrence:** `After Every Page`.
5. Click **Apply** and then **OK**.

---

## 4. Installing Driver 2: Sales Receipts (`Xprinter Receipt 80mm`)

Now you will add a second driver instance connected to the **exact same USB port** to handle continuous 80mm receipt paper.

### Step 1: Add the Second Driver on the Same Port
1. In **Devices and Printers**, click **Add a printer** (top menu bar).
2. Click **"The printer that I want isn't listed"**.
3. Choose **"Add a local printer or network printer with manual settings"** and click **Next**.
4. In **"Use an existing port"**, select the **EXACT SAME PORT** used by Driver 1 (e.g., **`USB001 (Virtual printer port for USB)`**). Click **Next**.
5. In the Manufacturer list, select **Xprinter** (or Seagull):
   - Choose model: **`Xprinter XP-80C`**, **`Xprinter XP-80`**, or **`Xprinter XP-D365B`**.
   - Click **Next**.
6. When prompted "Which version of the driver do you want to use?", select **"Use the driver that is currently installed (recommended)"**. Click **Next**.
7. In the **Printer name** field, type EXACTLY:
   ```
   Xprinter Receipt 80mm
   ```
   *(Note: The POS software specifically searches for "Xprinter Receipt 80mm" or "XP-80")*.
8. Click **Next** $\rightarrow$ select **"Do not share this printer"** $\rightarrow$ click **Finish**.

### Step 2: Configure Continuous 80mm Receipt Preferences
1. Right-click your new **`Xprinter Receipt 80mm`** and choose **Printing Preferences**.
2. Go to the **Page Setup** tab:
   - Under **Stock**, choose **`80 x 297 mm`** (or `USER` set to 80mm width with continuous height).
   - Orientation: **Portrait**.
3. Go to the **Stock** tab:
   - **Method:** `Direct Thermal`.
   - **Type:** **`Continuous`** *(CRITICAL: Do NOT leave this as "Labels with Gaps", otherwise it will stop printing after 40mm!)*.
4. Go to the **Graphics** tab:
   - Dithering: **None** (ensures solid black lines without gray dotting).
5. Click **Apply** and **OK**.

---

## 5. POS Software Configuration (Point of Sale & ERP System)

Once both drivers are installed in Windows:

### A. Link Receipt Printer in Admin Control Panel
1. Launch **Point of Sale & ERP System**.
2. Click **Admin Settings** (or press `Ctrl + Shift + A`) and enter Admin PIN: `8888`.
3. Switch to the **Receipt Options** tab.
4. Under **RECEIPT THERMAL PRINTER**, open the dropdown:
   - Select **`Xprinter Receipt 80mm ★ (Detected Receipt Driver)`**.
5. Click the **Test Print** button:
   - A clean sample test slip will print silently to verify connectivity, centered alignment, and tear position.
6. Click **Save Bill Settings**.

### B. Barcode Sticker Printing Verification
1. Go to **Product Catalog** $\rightarrow$ click the **Sticker/Barcode icon** on any product.
2. In the modal:
   - Notice the printer dropdown auto-selects **`Xprinter XP-D365B`**.
   - Enter **Copies: 2**.
   - Click **Print 2 Stickers**.
3. Verify that **exactly 2 stickers** print and align cleanly with the tear blade.

---

## 6. Pro Troubleshooting Checklist for Client Deployments

| Symptom | Cause | Solution |
| :--- | :--- | :--- |
| **Printer shows "Offline" in Windows 10** | USB port changed because the cable was moved to a different USB slot. | Open Printer Properties $\rightarrow$ **Ports** tab $\rightarrow$ check the active `USB00x` port with the connected device. Plug back into the original USB port. |
| **Receipt stops printing after 40mm or feeds blank paper** | Driver 2 is still set to `Labels with Gaps` instead of `Continuous`. | Open `Xprinter Receipt 80mm` Preferences $\rightarrow$ **Stock** tab $\rightarrow$ change Type from *Labels with Gaps* to **`Continuous`**. |
| **Printer keeps feeding 4–5 blank stickers without stopping** | Optical gap sensor lost calibration. | Turn printer OFF $\rightarrow$ hold FEED $\rightarrow$ turn ON $\rightarrow$ release after double beep (Gap Auto-Calibration). |
| **Printing 2 copies outputs 4 stickers** | Using outdated software executable. | Ensure the client PC has **Point of Sale & ERP System v1.0.0 (Oct 25 build)** where the single-template multiplier bug is fixed. |
| **Receipt text is shifted to the left edge** | Windows driver printable margin offset. | Our latest build centers the 72mm block with 4mm equal side margins automatically. Ensure latest build is installed. |
| **Windows groups both printers under one icon** | Windows 10 "Printers & Scanners" merges printers on the same USB port. | Access them via legacy Control Panel: Press `Win + R`, run `control printers`. Both `Xprinter Receipt 80mm` and `Xprinter XP-D365B` will show separately. |

---

## 7. Fast 5-Minute Technician Checklist

- [ ] USB plugged into a direct rear motherboard USB port (not unpowered front hub).
- [ ] Gap auto-calibrated by holding FEED on boot.
- [ ] Driver 1 named `Xprinter XP-D365B` $\rightarrow$ Stock: `USER (70x40mm)` $\rightarrow$ Type: `Labels with Gaps`.
- [ ] Driver 2 named `Xprinter Receipt 80mm` $\rightarrow$ Same USB port $\rightarrow$ Stock: `80x297mm` $\rightarrow$ Type: `Continuous`.
- [ ] POS Admin Settings $\rightarrow$ `Receipt Options` $\rightarrow$ `Xprinter Receipt 80mm` selected $\rightarrow$ Test Print verified.
- [ ] Catalog $\rightarrow$ Barcode Stickers $\rightarrow$ 2-copy print verified.
