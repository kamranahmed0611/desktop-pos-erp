/**
 * Barcode Print Generator for Loose & Custom-Created Items
 * Formats clean, high-density barcode labels for:
 * 1. 38mm x 25mm thermal sticker roll labels (standard grocery barcode stickers)
 * 2. 80mm continuous thermal paper slips (Epson TM-T88V, Xprinter, etc.)
 */

export interface BarcodePrintOptions {
  includePrice?: boolean;
  labelFormat?: '38x25mm' | '80mm';
}

export function printItemBarcodeSlip(
  item: { name: string; barcode: string; sale_price: number; unit_type: string },
  options: BarcodePrintOptions = {}
) {
  const { includePrice = true, labelFormat = '38x25mm' } = options;
  const isSticker = labelFormat === '38x25mm';

  const printWindow = window.open('', '_blank', 'width=400,height=350');
  if (!printWindow) return;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Barcode Label - ${item.name}</title>
        <style>
          @page { 
            size: ${isSticker ? '38mm 25mm' : '80mm auto'}; 
            margin: 0; 
          }
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
            width: ${isSticker ? '37mm' : '72mm'};
            max-height: ${isSticker ? '24mm' : 'none'};
            margin: 0 auto;
            padding: ${isSticker ? '1mm 1mm 0 1mm' : '4mm 2mm'};
            text-align: center;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }
          .store { 
            font-size: ${isSticker ? '7px' : '11px'}; 
            font-weight: 900; 
            letter-spacing: 0.5px;
            text-transform: uppercase; 
            line-height: 1;
          }
          .item-name { 
            font-size: ${isSticker ? '8px' : '12px'}; 
            font-weight: 800; 
            margin: ${isSticker ? '0.5mm 0' : '2mm 0'};
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 100%;
            line-height: 1.1;
          }
          .price { 
            font-size: ${isSticker ? '9px' : '15px'}; 
            font-weight: 900; 
            margin-bottom: ${isSticker ? '0.5mm' : '2mm'};
            line-height: 1;
          }
          .barcode-box {
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 100%;
          }
          .barcode-bars {
            height: ${isSticker ? '9mm' : '14mm'};
            width: ${isSticker ? '32mm' : '55mm'};
            background: repeating-linear-gradient(
              to right,
              #000 0px, #000 1.5px,
              #fff 1.5px, #fff 3px,
              #000 3px, #000 5px,
              #fff 5px, #fff 6.5px,
              #000 6.5px, #000 8.5px,
              #fff 8.5px, #fff 10px
            );
          }
          .barcode-text { 
            font-size: ${isSticker ? '7px' : '11px'}; 
            font-weight: 900; 
            font-family: monospace; 
            letter-spacing: ${isSticker ? '1px' : '2px'}; 
            margin-top: 0.5mm; 
            line-height: 1;
          }
        </style>
      </head>
      <body>
        <div class="store">POINT OF SALE</div>
        <div class="item-name">${item.name}</div>
        ${includePrice ? `<div class="price">Rs. ${Math.round(item.sale_price).toLocaleString()} / ${item.unit_type}</div>` : ''}
        <div class="barcode-box">
          <div class="barcode-bars"></div>
          <div class="barcode-text">${item.barcode}</div>
        </div>
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 600);
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}
