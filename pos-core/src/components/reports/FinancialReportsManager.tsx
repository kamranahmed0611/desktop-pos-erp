import React, { useState, useEffect, useMemo } from 'react';
import { sqlDb } from '../../db/sqlite';
import { StoreSettings } from '../../types';
import { hardwareService } from '../../services/hardwareService';
import { posAlert } from '../../store/uiStore';
import { 
  BarChart3, Calendar, DollarSign, TrendingUp, TrendingDown, 
  Receipt, ShoppingBag, CreditCard, Banknote, Smartphone, 
  BookOpen, Printer, Download, RefreshCw, ArrowUpRight, 
  Layers, Package, Filter, Check, Clock, ChevronDown
} from 'lucide-react';

interface FinancialReportsManagerProps {
  storeSettings: StoreSettings;
}

export type DatePreset = 'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'custom';

interface PaymentModeStat {
  payment_mode: string;
  count: number;
  total_amount: number;
  paid_amount: number;
}

interface TopSellingItem {
  product_id: string;
  product_name: string;
  category: string;
  unit_type: string;
  total_qty: number;
  total_revenue: number;
  total_cost: number;
  gross_margin_rs: number;
  gross_margin_pct: number;
}

interface ExpenseSummary {
  category: string;
  total: number;
  count: number;
}

export const FinancialReportsManager: React.FC<FinancialReportsManagerProps> = ({ storeSettings }) => {
  const [selectedPreset, setSelectedPreset] = useState<DatePreset>('today');
  const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [isLoading, setIsLoading] = useState(false);

  // Financial aggregates
  const [grossSales, setGrossSales] = useState(0);
  const [totalDiscounts, setTotalDiscounts] = useState(0);
  const [totalTax, setTotalTax] = useState(0);
  const [invoiceCount, setInvoiceCount] = useState(0);
  const [totalCogs, setTotalCogs] = useState(0);
  const [totalUnitsSold, setTotalUnitsSold] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [expenseCount, setExpenseCount] = useState(0);
  const [returnCount, setReturnCount] = useState(0);
  const [returnAmount, setReturnAmount] = useState(0);

  // Breakdowns
  const [paymentBreakdown, setPaymentBreakdown] = useState<PaymentModeStat[]>([]);
  const [topItems, setTopItems] = useState<TopSellingItem[]>([]);
  const [expensesByCategory, setExpensesByCategory] = useState<ExpenseSummary[]>([]);
  
  // Search &amp; Sorting for Top Items
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'qty' | 'revenue' | 'margin'>('revenue');

  // Set date ranges according to presets
  const applyPreset = (preset: DatePreset) => {
    setSelectedPreset(preset);
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = y.toISOString().slice(0, 10);
      setStartDate(yStr);
      setEndDate(yStr);
    } else if (preset === 'week') {
      const d = new Date(now);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
      const monday = new Date(d.setDate(diff));
      setStartDate(monday.toISOString().slice(0, 10));
      setEndDate(todayStr);
    } else if (preset === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(firstDay.toISOString().slice(0, 10));
      setEndDate(todayStr);
    } else if (preset === 'last_month') {
      const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      setStartDate(firstDayLastMonth.toISOString().slice(0, 10));
      setEndDate(lastDayLastMonth.toISOString().slice(0, 10));
    }
  };

  const loadFinancialData = async () => {
    setIsLoading(true);
    try {
      const startDateTime = `${startDate} 00:00:00`;
      const endDateTime = `${endDate} 23:59:59`;

      // 1. Invoices sales aggregate (non-voided, non-return)
      const salesRes = await sqlDb.get<any>(`
        SELECT 
          COUNT(*) as invoice_count,
          COALESCE(SUM(total_amount), 0) as gross_sales,
          COALESCE(SUM(discount_amount), 0) as total_discounts,
          COALESCE(SUM(tax_amount), 0) as total_tax
        FROM invoices 
        WHERE datetime(created_at) >= datetime(?) 
          AND datetime(created_at) <= datetime(?)
          AND (notes IS NULL OR notes NOT LIKE '%[VOIDED%')
          AND (invoice_number NOT LIKE 'RET-%')
      `, [startDateTime, endDateTime]);

      setInvoiceCount(salesRes?.invoice_count || 0);
      setGrossSales(salesRes?.gross_sales || 0);
      setTotalDiscounts(salesRes?.total_discounts || 0);
      setTotalTax(salesRes?.total_tax || 0);

      // 2. Returns &amp; Refunds in period
      const returnRes = await sqlDb.get<any>(`
        SELECT 
          COUNT(*) as return_count,
          COALESCE(SUM(total_amount), 0) as return_amount
        FROM invoices
        WHERE datetime(created_at) >= datetime(?) 
          AND datetime(created_at) <= datetime(?)
          AND invoice_number LIKE 'RET-%'
      `, [startDateTime, endDateTime]);

      setReturnCount(returnRes?.return_count || 0);
      setReturnAmount(returnRes?.return_amount || 0);

      // 3. COGS &amp; Units Sold calculation (joining invoice_items and products)
      const cogsRes = await sqlDb.get<any>(`
        SELECT 
          COALESCE(SUM(ii.qty * COALESCE(NULLIF(ii.unit_cost, 0), p.cost_price, 0)), 0) as total_cogs,
          COALESCE(SUM(ii.qty), 0) as total_units_sold
        FROM invoice_items ii
        JOIN invoices inv ON ii.invoice_id = inv.id
        LEFT JOIN products p ON ii.product_id = p.id
        WHERE datetime(inv.created_at) >= datetime(?) 
          AND datetime(inv.created_at) <= datetime(?)
          AND (inv.notes IS NULL OR inv.notes NOT LIKE '%[VOIDED%')
          AND (inv.invoice_number NOT LIKE 'RET-%')
      `, [startDateTime, endDateTime]);

      setTotalCogs(cogsRes?.total_cogs || 0);
      setTotalUnitsSold(cogsRes?.total_units_sold || 0);

      // 4. Recorded Petty Expenses (Dukaan Kharch)
      try {
        const expRes = await sqlDb.get<any>(`
          SELECT 
            COUNT(*) as expense_count,
            COALESCE(SUM(amount), 0) as total_expenses
          FROM expenses
          WHERE datetime(created_at) >= datetime(?) 
            AND datetime(created_at) <= datetime(?)
        `, [startDateTime, endDateTime]);

        setTotalExpenses(expRes?.total_expenses || 0);
        setExpenseCount(expRes?.expense_count || 0);

        const expCatRows = await sqlDb.query<ExpenseSummary>(`
          SELECT 
            category,
            SUM(amount) as total,
            COUNT(*) as count
          FROM expenses
          WHERE datetime(created_at) >= datetime(?) 
            AND datetime(created_at) <= datetime(?)
          GROUP BY category
          ORDER BY total DESC
        `, [startDateTime, endDateTime]);

        setExpensesByCategory(expCatRows || []);
      } catch {
        setTotalExpenses(0);
        setExpenseCount(0);
        setExpensesByCategory([]);
      }

      // 5. Payment Mode Breakdown
      const payRows = await sqlDb.query<PaymentModeStat>(`
        SELECT 
          payment_mode,
          COUNT(*) as count,
          COALESCE(SUM(total_amount), 0) as total_amount,
          COALESCE(SUM(paid_amount), 0) as paid_amount
        FROM invoices
        WHERE datetime(created_at) >= datetime(?) 
          AND datetime(created_at) <= datetime(?)
          AND (notes IS NULL OR notes NOT LIKE '%[VOIDED%')
          AND (invoice_number NOT LIKE 'RET-%')
        GROUP BY payment_mode
      `, [startDateTime, endDateTime]);

      setPaymentBreakdown(payRows || []);

      // 6. Top Selling Items
      const itemRows = await sqlDb.query<TopSellingItem>(`
        SELECT 
          ii.product_id,
          ii.product_name,
          COALESCE(p.category, 'General') as category,
          COALESCE(p.unit_type, 'piece') as unit_type,
          SUM(ii.qty) as total_qty,
          SUM(ii.subtotal) as total_revenue,
          SUM(ii.qty * COALESCE(NULLIF(ii.unit_cost, 0), p.cost_price, 0)) as total_cost,
          (SUM(ii.subtotal) - SUM(ii.qty * COALESCE(NULLIF(ii.unit_cost, 0), p.cost_price, 0))) as gross_margin_rs,
          CASE 
            WHEN SUM(ii.subtotal) > 0 
            THEN ROUND(((SUM(ii.subtotal) - SUM(ii.qty * COALESCE(NULLIF(ii.unit_cost, 0), p.cost_price, 0))) / SUM(ii.subtotal)) * 100, 1)
            ELSE 0.0 
          END as gross_margin_pct
        FROM invoice_items ii
        JOIN invoices inv ON ii.invoice_id = inv.id
        LEFT JOIN products p ON ii.product_id = p.id
        WHERE datetime(inv.created_at) >= datetime(?) 
          AND datetime(inv.created_at) <= datetime(?)
          AND (inv.notes IS NULL OR inv.notes NOT LIKE '%[VOIDED%')
          AND (inv.invoice_number NOT LIKE 'RET-%')
        GROUP BY ii.product_id, ii.product_name
        ORDER BY total_revenue DESC
        LIMIT 100
      `, [startDateTime, endDateTime]);

      setTopItems(itemRows || []);

    } catch (err: any) {
      console.error('[FinancialReports] Load error:', err);
      await posAlert('Report Load Error', err.message || 'Failed to calculate financial report.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFinancialData();
  }, [startDate, endDate]);

  // Net Operational Profit = Gross Sales - COGS - Recorded Petty Expenses
  const grossProfit = Math.max(0, grossSales - totalCogs);
  const netOperationalProfit = grossSales - totalCogs - totalExpenses;
  const grossMarginPercent = grossSales > 0 ? ((grossProfit / grossSales) * 100).toFixed(1) : '0.0';
  const netMarginPercent = grossSales > 0 ? ((netOperationalProfit / grossSales) * 100).toFixed(1) : '0.0';
  const averageTicket = invoiceCount > 0 ? Math.round(grossSales / invoiceCount) : 0;

  // Filter &amp; sort top items
  const filteredTopItems = useMemo(() => {
    let list = [...topItems];
    if (itemSearchQuery.trim()) {
      const q = itemSearchQuery.toLowerCase();
      list = list.filter(it => it.product_name.toLowerCase().includes(q) || it.category.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      if (sortBy === 'qty') return b.total_qty - a.total_qty;
      if (sortBy === 'margin') return b.gross_margin_rs - a.gross_margin_rs;
      return b.total_revenue - a.total_revenue;
    });
    return list;
  }, [topItems, itemSearchQuery, sortBy]);

  // 80mm ESC/POS Thermal Print Summary Slip (M9.5)
  const handlePrintThermalSlip = async () => {
    try {
      const thermalText = `
========================================
         ${storeSettings.store_name}
      FINANCIAL &amp; PROFIT AUDIT
========================================
Period: ${startDate} to ${endDate}
Generated: ${new Date().toLocaleTimeString('en-PK')}
----------------------------------------
FINANCIAL PERFORMANCE:
Gross Sales:        PKR ${grossSales.toLocaleString()}
Cost of Goods:     -PKR ${Math.round(totalCogs).toLocaleString()}
----------------------------------------
GROSS PROFIT:       PKR ${Math.round(grossProfit).toLocaleString()} (${grossMarginPercent}%)
Dukaan Expenses:   -PKR ${Math.round(totalExpenses).toLocaleString()}
========================================
NET OPERATIONAL PROFIT:
PKR ${Math.round(netOperationalProfit).toLocaleString()} (${netMarginPercent}%)
========================================
TRANSACTION METRICS:
Total Bills:        ${invoiceCount}
Average Bill Value: PKR ${averageTicket.toLocaleString()}
Total Units Sold:   ${totalUnitsSold.toLocaleString()}
Exchange/Returns:   ${returnCount} (Rs. ${returnAmount.toLocaleString()})
----------------------------------------
PAYMENT CHANNELS AUDIT:
${paymentBreakdown.map(p => `${p.payment_mode.toUpperCase().padEnd(12)}: ${p.count.toString().padEnd(3)} bills  Rs. ${p.total_amount.toLocaleString()}`).join('\n')}
----------------------------------------
EXPENSE BREAKDOWN (Dukaan Kharch):
${expensesByCategory.length === 0 ? 'No petty expenses in period.' : expensesByCategory.map(e => `${e.category.padEnd(14)}: Rs. ${e.total.toLocaleString()} (${e.count})`).join('\n')}
----------------------------------------
TOP 5 PRODUCTS BY REVENUE:
${topItems.slice(0, 5).map((it, idx) => `${idx + 1}. ${it.product_name.slice(0, 20)}\n   ${it.total_qty} ${it.unit_type} -> Rs. ${it.total_revenue.toLocaleString()}`).join('\n')}
========================================
       Audited via POS &amp; ERP Core
========================================
`;
      await hardwareService.printDirectThermal(thermalText);
      await posAlert('Thermal Print Dispatched', 'Summary slip sent to 80mm thermal printer.', 'success');
    } catch (err: any) {
      await posAlert('Print Error', err.message, 'error');
    }
  };

  // Clean A4 Browser Print (M9.5)
  const handlePrintA4View = () => {
    window.print();
  };

  return (
    <div className="max-w-[1850px] w-full mx-auto p-4 sm:p-6 space-y-6 select-none font-sans">
      
      {/* 1. TOP HEADER &amp; DATE FILTERS BAR */}
      <div className="bg-[#243338] text-white p-5 rounded-3xl shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4 border border-stone-700">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-[#5B7981] text-[#E3D5C0] rounded-2xl shadow-sm">
            <BarChart3 className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-wide uppercase">Financial Profit Reports &amp; Audits</h1>
            <p className="text-xs text-[#E3D5C0] font-mono">
              Net Profit • Cost of Goods (COGS) • Petty Expenses • Payment Audit
            </p>
          </div>
        </div>

        {/* CONTROLS &amp; PRINT ACTION BUTTONS */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={loadFinancialData}
            disabled={isLoading}
            className="px-3 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all border border-stone-600"
            title="Refresh Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handlePrintThermalSlip}
            className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-[#E3D5C0] rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all border border-stone-600"
          >
            <Printer className="w-4 h-4 text-[#E3D5C0]" />
            <span>Thermal Slip [80mm]</span>
          </button>

          <button
            onClick={handlePrintA4View}
            className="px-4 py-2 bg-[#5B7981] hover:bg-[#4a6369] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md transition-all hover:scale-102"
          >
            <Download className="w-4 h-4" />
            <span>A4 Print View</span>
          </button>
        </div>
      </div>

      {/* 2. DATE PRESET SELECTOR &amp; CUSTOM RANGE */}
      <div className="bg-white p-4 rounded-2xl border border-stone-300 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto">
          {[
            { id: 'today', label: 'Today' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: 'week', label: 'This Week' },
            { id: 'month', label: 'This Month' },
            { id: 'last_month', label: 'Last Month' },
            { id: 'custom', label: 'Custom Range' }
          ].map(preset => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset.id as DatePreset)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                selectedPreset === preset.id
                  ? 'bg-[#5B7981] text-white shadow-sm'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* DATE PICKERS */}
        <div className="flex items-center gap-2 text-xs font-mono w-full md:w-auto justify-end">
          <div className="flex items-center gap-1.5 bg-stone-100 px-3 py-1.5 rounded-xl border border-stone-200">
            <Calendar className="w-3.5 h-3.5 text-stone-500" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setSelectedPreset('custom');
              }}
              className="bg-transparent border-none text-stone-800 font-bold focus:outline-hidden"
            />
          </div>
          <span className="text-stone-400 font-sans">to</span>
          <div className="flex items-center gap-1.5 bg-stone-100 px-3 py-1.5 rounded-xl border border-stone-200">
            <Calendar className="w-3.5 h-3.5 text-stone-500" />
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setSelectedPreset('custom');
              }}
              className="bg-transparent border-none text-stone-800 font-bold focus:outline-hidden"
            />
          </div>
        </div>
      </div>

      {/* 3. PRIMARY FINANCIAL KPI CARDS (M9.2 Formula) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* CARD 1: GROSS SALES */}
        <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-stone-500 text-xs font-bold uppercase mb-1">
              <span>Gross Sales (Revenue)</span>
              <Receipt className="w-4 h-4 text-stone-400" />
            </div>
            <div className="text-2xl font-black text-stone-900 tracking-tight">
              Rs. {grossSales.toLocaleString()}
            </div>
          </div>
          <div className="pt-3 border-t border-stone-100 mt-3 flex items-center justify-between text-[11px] text-stone-600 font-mono">
            <span>{invoiceCount} Total Bills</span>
            <span>Avg: Rs. {averageTicket.toLocaleString()}</span>
          </div>
        </div>

        {/* CARD 2: COST OF GOODS SOLD (COGS) */}
        <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-stone-500 text-xs font-bold uppercase mb-1">
              <span>Cost of Goods (COGS)</span>
              <Package className="w-4 h-4 text-stone-400" />
            </div>
            <div className="text-2xl font-black text-stone-700 tracking-tight">
              Rs. {Math.round(totalCogs).toLocaleString()}
            </div>
          </div>
          <div className="pt-3 border-t border-stone-100 mt-3 flex items-center justify-between text-[11px] text-stone-600 font-mono">
            <span>{totalUnitsSold.toLocaleString()} Units Sold</span>
            <span className="text-stone-500">Inventory Cost</span>
          </div>
        </div>

        {/* CARD 3: PETTY EXPENSES (DUKAAN KHARCH) */}
        <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-amber-700 text-xs font-bold uppercase mb-1">
              <span>Dukaan Kharch (Expenses)</span>
              <TrendingDown className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-black text-amber-900 tracking-tight">
              Rs. {Math.round(totalExpenses).toLocaleString()}
            </div>
          </div>
          <div className="pt-3 border-t border-stone-100 mt-3 flex items-center justify-between text-[11px] text-stone-600 font-mono">
            <span>{expenseCount} Recorded Vouchers</span>
            <span className="text-amber-700 font-bold">Shift Petty Cash</span>
          </div>
        </div>

        {/* CARD 4: NET OPERATIONAL PROFIT (M9.2 CORE HIGHLIGHT) */}
        <div className="bg-gradient-to-br from-[#243338] to-[#1c292d] text-white p-5 rounded-3xl shadow-md relative overflow-hidden flex flex-col justify-between border border-[#5B7981]/40">
          <div>
            <div className="flex items-center justify-between text-[#E3D5C0] text-xs font-bold uppercase mb-1">
              <span className="flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                Net Operational Profit
              </span>
              <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded text-[10px] font-mono font-bold">
                {netMarginPercent}% Net
              </span>
            </div>
            <div className="text-2xl font-black text-white tracking-tight">
              Rs. {Math.round(netOperationalProfit).toLocaleString()}
            </div>
          </div>
          <div className="pt-3 border-t border-stone-700/60 mt-3 flex items-center justify-between text-[11px] text-[#E3D5C0] font-mono">
            <span>Gross: Rs. {Math.round(grossProfit).toLocaleString()}</span>
            <span>Margin: {grossMarginPercent}%</span>
          </div>
        </div>

      </div>

      {/* 4. PAYMENT AUDIT BREAKDOWN &amp; EXPENSE CATEGORIES */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* PAYMENT CHANNELS AUDIT (M9.3) */}
        <div className="lg:col-span-7 bg-white p-5 rounded-3xl border border-stone-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-stone-200">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-[#5B7981]" />
              <h2 className="font-bold text-sm text-stone-900 uppercase">Payment Channels Audit Breakdown</h2>
            </div>
            <span className="text-xs text-stone-500 font-mono">Tender Reconciliation</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {paymentBreakdown.map(p => {
              const isCash = p.payment_mode === 'cash';
              const isCard = p.payment_mode === 'card';
              const isKhata = p.payment_mode === 'khata';
              const isDigital = p.payment_mode === 'easypaisa' || p.payment_mode === 'jazzcash';
              const pct = grossSales > 0 ? ((p.total_amount / grossSales) * 100).toFixed(1) : '0';

              return (
                <div key={p.payment_mode} className="p-3.5 bg-stone-50 border border-stone-200 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-white border border-stone-200 shadow-2xs">
                      {isCash && <Banknote className="w-4 h-4 text-emerald-600" />}
                      {isCard && <CreditCard className="w-4 h-4 text-blue-600" />}
                      {isKhata && <BookOpen className="w-4 h-4 text-amber-600" />}
                      {isDigital && <Smartphone className="w-4 h-4 text-purple-600" />}
                      {!isCash && !isCard && !isKhata && !isDigital && <DollarSign className="w-4 h-4 text-stone-600" />}
                    </div>
                    <div>
                      <span className="text-xs font-bold text-stone-800 uppercase block">{p.payment_mode}</span>
                      <span className="text-[10px] text-stone-500 font-mono">{p.count} Transactions ({pct}%)</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-sm text-stone-900 block">
                      Rs. {p.total_amount.toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}

            {paymentBreakdown.length === 0 && (
              <div className="col-span-2 text-center py-6 text-stone-400 text-xs">
                No payment transactions recorded in this date range.
              </div>
            )}
          </div>

          {/* RETURNS &amp; EXCHANGES SUMMARY ROW */}
          {returnCount > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-red-900 font-bold">
                <Receipt className="w-4 h-4 text-red-600" />
                <span>Customer Returns &amp; Refunds (Deducted)</span>
              </div>
              <div className="font-mono font-bold text-red-700">
                {returnCount} Returns • - Rs. {returnAmount.toLocaleString()}
              </div>
            </div>
          )}
        </div>

        {/* EXPENSE SUMMARY BY CATEGORY */}
        <div className="lg:col-span-5 bg-white p-5 rounded-3xl border border-stone-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-stone-200">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-amber-600" />
              <h2 className="font-bold text-sm text-stone-900 uppercase">Petty Expenses (Dukaan Kharch)</h2>
            </div>
            <span className="text-xs font-mono font-bold text-amber-700">Total: Rs. {totalExpenses.toLocaleString()}</span>
          </div>

          <div className="space-y-2">
            {expensesByCategory.map(exp => (
              <div key={exp.category} className="p-2.5 bg-stone-50 border border-stone-200 rounded-xl flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-stone-800 block">{exp.category}</span>
                  <span className="text-[10px] text-stone-500 font-mono">{exp.count} Vouchers</span>
                </div>
                <span className="font-mono font-bold text-stone-900">Rs. {exp.total.toLocaleString()}</span>
              </div>
            ))}

            {expensesByCategory.length === 0 && (
              <div className="text-center py-6 text-stone-400 text-xs">
                No petty expenses recorded in this date range.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 5. TOP SELLING PRODUCTS FLAT RANKED TABLE (M9.4) */}
      <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-3 border-b border-stone-200">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-[#5B7981]" />
            <h2 className="font-bold text-sm text-stone-900 uppercase">Top-Selling Products Performance</h2>
            <span className="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full font-mono font-bold">
              {filteredTopItems.length} Products
            </span>
          </div>

          {/* SEARCH &amp; SORT BUTTONS */}
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <input
                type="text"
                placeholder="Search products..."
                value={itemSearchQuery}
                onChange={(e) => setItemSearchQuery(e.target.value)}
                className="w-full px-3 py-1.5 pl-8 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-800"
              />
              <Filter className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2.5" />
            </div>

            <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl text-xs">
              <button
                onClick={() => setSortBy('revenue')}
                className={`px-2 py-1 rounded-lg font-bold cursor-pointer transition-all ${
                  sortBy === 'revenue' ? 'bg-[#5B7981] text-white shadow-2xs' : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Revenue
              </button>
              <button
                onClick={() => setSortBy('qty')}
                className={`px-2 py-1 rounded-lg font-bold cursor-pointer transition-all ${
                  sortBy === 'qty' ? 'bg-[#5B7981] text-white shadow-2xs' : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Quantity
              </button>
              <button
                onClick={() => setSortBy('margin')}
                className={`px-2 py-1 rounded-lg font-bold cursor-pointer transition-all ${
                  sortBy === 'margin' ? 'bg-[#5B7981] text-white shadow-2xs' : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Margin
              </button>
            </div>
          </div>
        </div>

        {/* FLAT RANKED TABLE */}
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-stone-50 text-stone-600 font-bold sticky top-0 z-10 border-b border-stone-200">
              <tr>
                <th className="py-2.5 px-3 w-12 text-center">#</th>
                <th className="py-2.5 px-3">Product Name</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3 text-right">Units Sold</th>
                <th className="py-2.5 px-3 text-right">Total Revenue</th>
                <th className="py-2.5 px-3 text-right">Estimated Cost</th>
                <th className="py-2.5 px-3 text-right">Gross Margin (Rs.)</th>
                <th className="py-2.5 px-3 text-right">Margin %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredTopItems.map((item, idx) => (
                <tr key={item.product_id} className="hover:bg-stone-50/80 transition-colors">
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-stone-400">
                    {idx + 1}
                  </td>
                  <td className="py-2.5 px-3 font-bold text-stone-900">
                    {item.product_name}
                  </td>
                  <td className="py-2.5 px-3 text-stone-500 font-medium">
                    {item.category}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-stone-800">
                    {item.total_qty.toLocaleString()} <span className="text-[10px] text-stone-500 font-normal">{item.unit_type}</span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-stone-900">
                    Rs. {item.total_revenue.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-stone-500">
                    Rs. {Math.round(item.total_cost).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                    + Rs. {Math.round(item.gross_margin_rs).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold">
                    <span className={`px-1.5 py-0.5 rounded text-[11px] ${
                      item.gross_margin_pct >= 20 ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-700'
                    }`}>
                      {item.gross_margin_pct}%
                    </span>
                  </td>
                </tr>
              ))}

              {filteredTopItems.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-stone-400">
                    No sold items found in this date range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* A4 PRINTABLE REPORT LAYOUT (VISIBLE ONLY DURING A4 WINDOW.PRINT) */}
      <div className="hidden print:block font-sans text-black p-8 bg-white" id="printable-a4-financial-report">
        <div className="text-center pb-4 border-b-2 border-black space-y-1">
          <h1 className="text-2xl font-black uppercase tracking-tight">{storeSettings.store_name}</h1>
          <p className="text-xs font-bold text-stone-700">{storeSettings.tagline}</p>
          <p className="text-xs text-stone-600">{storeSettings.address} • Ph: {storeSettings.phone}</p>
          <h2 className="text-sm font-black uppercase pt-2">Consolidated Financial &amp; Operational Audit Report</h2>
          <p className="text-xs font-mono">Reporting Period: {startDate} to {endDate} • Generated: {new Date().toLocaleString('en-PK')}</p>
        </div>

        {/* SUMMARY FINANCIAL GRID */}
        <div className="grid grid-cols-4 gap-4 py-4 border-b border-black text-xs">
          <div>
            <span className="font-bold text-stone-600 block uppercase">Gross Sales Revenue:</span>
            <span className="text-base font-black">PKR {grossSales.toLocaleString()}</span>
          </div>
          <div>
            <span className="font-bold text-stone-600 block uppercase">Cost of Goods Sold (COGS):</span>
            <span className="text-base font-black">PKR {Math.round(totalCogs).toLocaleString()}</span>
          </div>
          <div>
            <span className="font-bold text-stone-600 block uppercase">Dukaan Kharch (Expenses):</span>
            <span className="text-base font-black">PKR {Math.round(totalExpenses).toLocaleString()}</span>
          </div>
          <div>
            <span className="font-bold text-stone-600 block uppercase">Net Operational Profit:</span>
            <span className="text-base font-black underline">PKR {Math.round(netOperationalProfit).toLocaleString()} ({netMarginPercent}%)</span>
          </div>
        </div>

        {/* PAYMENT BREAKDOWN */}
        <div className="py-4 border-b border-black">
          <h3 className="font-black text-xs uppercase mb-2">Tender Reconciliation</h3>
          <div className="grid grid-cols-4 gap-2 text-xs">
            {paymentBreakdown.map(p => (
              <div key={p.payment_mode} className="p-2 border border-stone-400">
                <span className="font-bold uppercase block">{p.payment_mode}</span>
                <span className="font-mono">{p.count} bills • PKR {p.total_amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* TOP PRODUCTS LIST */}
        <div className="pt-4">
          <h3 className="font-black text-xs uppercase mb-2">Top Sold Inventory Items</h3>
          <table className="w-full text-left text-xs border border-black">
            <thead className="bg-stone-200 border-b border-black">
              <tr>
                <th className="p-1.5">Item Name</th>
                <th className="p-1.5">Category</th>
                <th className="p-1.5 text-right">Qty</th>
                <th className="p-1.5 text-right">Revenue (PKR)</th>
                <th className="p-1.5 text-right">COGS (PKR)</th>
                <th className="p-1.5 text-right">Gross Margin (PKR)</th>
              </tr>
            </thead>
            <tbody>
              {topItems.slice(0, 30).map(it => (
                <tr key={it.product_id} className="border-b border-stone-300">
                  <td className="p-1.5 font-bold">{it.product_name}</td>
                  <td className="p-1.5">{it.category}</td>
                  <td className="p-1.5 text-right font-mono">{it.total_qty} {it.unit_type}</td>
                  <td className="p-1.5 text-right font-mono">{it.total_revenue.toLocaleString()}</td>
                  <td className="p-1.5 text-right font-mono">{Math.round(it.total_cost).toLocaleString()}</td>
                  <td className="p-1.5 text-right font-mono font-bold">{Math.round(it.gross_margin_rs).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pt-8 text-center text-xs text-stone-500">
          Point of Sale &amp; ERP Core Engine • Report Generated for Auditor and Owner Records
        </div>
      </div>

    </div>
  );
};

