import React, { useState, useEffect, useRef } from 'react';
import { Invoice, InvoiceItem, StoreSettings, Shift } from '../../types';
import { billingService } from '../../services/billingService';
import { invoicePdfService } from '../../services/invoicePdfService';
import { hardwareService } from '../../services/hardwareService';
import { HighDensityReceiptCard } from '../emergency/HighDensityReceiptCard';
import { 
  Search, Calendar, Printer, Share2, Eye, RefreshCw, 
  FileText, Download, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Clock, User, CheckCircle2, AlertCircle
} from 'lucide-react';
import { posAlert } from '../../store/uiStore';

interface BillHistoryManagerProps {
  storeSettings: StoreSettings;
  activeShift?: Shift | null;
}

export const BillHistoryManager: React.FC<BillHistoryManagerProps> = ({
  storeSettings,
  activeShift
}) => {
  const [invoices, setInvoices] = useState<(Invoice & { items: InvoiceItem[] })[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterAllShifts, setFilterAllShifts] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<(Invoice & { items: InvoiceItem[] }) | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const debounceTimerRef = useRef<any>(null);

  const fetchInvoices = async (targetPage = page) => {
    setIsLoading(true);
    try {
      const res = await billingService.searchInvoicesPaginated({
        search: search.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        shiftId: filterAllShifts ? undefined : activeShift?.id,
        allShifts: filterAllShifts,
        page: targetPage,
        limit: 25
      });
      setInvoices(res.invoices);
      setTotalCount(res.totalCount);
      setPage(res.page);
      setTotalPages(res.totalPages);
    } catch (err: any) {
      console.warn('Failed to load invoices history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices(1);
  }, [startDate, endDate, filterAllShifts]);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      fetchInvoices(1);
    }, 200);
  };

  // Quick Date Helpers
  const setQuickDate = (type: 'today' | 'yesterday' | '7days' | 'month' | 'all') => {
    const today = new Date();
    const formatDate = (d: Date) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    if (type === 'today') {
      const str = formatDate(today);
      setStartDate(str);
      setEndDate(str);
    } else if (type === 'yesterday') {
      const y = new Date(today);
      y.setDate(today.getDate() - 1);
      const str = formatDate(y);
      setStartDate(str);
      setEndDate(str);
    } else if (type === '7days') {
      const past = new Date(today);
      past.setDate(today.getDate() - 6);
      setStartDate(formatDate(past));
      setEndDate(formatDate(today));
    } else if (type === 'month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(formatDate(firstDay));
      setEndDate(formatDate(today));
    } else {
      setStartDate('');
      setEndDate('');
    }
  };

  // 1-Click Reprint
  const handleQuickReprint = async (inv: Invoice & { items: InvoiceItem[] }) => {
    hardwareService.playScanSuccess();
    try {
      await hardwareService.printReceipt({ isDuplicateReprint: true, force: true }, inv.id);
      await posAlert('Reprint Sent', `Bill #${inv.invoice_number} sent to thermal receipt printer.`, 'success');
    } catch (e: any) {
      setSelectedInvoice(inv);
    }
  };

  // 1-Click WhatsApp & A4 PDF (with Walk-in prompt)
  const handleWhatsAppShare = async (inv: Invoice & { items: InvoiceItem[] }) => {
    hardwareService.playScanSuccess();
    try {
      const res = await invoicePdfService.generateAndShare(inv, storeSettings);
      if (res?.filePath) {
        await posAlert(
          'Invoice PDF Ready',
          `Official A4 PDF generated successfully.\n\nFolder opened with file highlighted. You can drag and drop it into WhatsApp.`,
          'info'
        );
      }
    } catch (e: any) {
      await posAlert('Notice', `WhatsApp sharing: ${e.message}`, 'error');
    }
  };

  // Export Filtered View to CSV
  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      // Fetch up to 1,000 bills matching current search/filter
      const res = await billingService.searchInvoicesPaginated({
        search: search.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        allShifts: filterAllShifts,
        page: 1,
        limit: 1000
      });

      const headers = ['Invoice Number', 'Date', 'Time', 'Cashier', 'Customer Name', 'Customer Phone', 'Payment Mode', 'Items Count', 'Net Total (PKR)'];
      const rows = res.invoices.map((inv) => {
        const d = new Date(inv.created_at);
        return [
          inv.invoice_number,
          d.toLocaleDateString('en-PK'),
          d.toLocaleTimeString('en-PK'),
          `"${(inv.cashier_name || '').replace(/"/g, '""')}"`,
          `"${(inv.customer_name || 'Walk-in Customer').replace(/"/g, '""')}"`,
          inv.customer_phone || '',
          inv.payment_mode.toUpperCase(),
          (inv.items || []).length,
          inv.total_amount
        ].join(',');
      });

      const csvContent = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `MR_Super_Store_Invoices_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      console.warn('Failed to export invoices CSV:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex-1 h-screen flex flex-col bg-[#F7F5F0] overflow-hidden select-none font-sans">
      
      {/* TOP HEADER BAR */}
      <header className="px-6 py-4 bg-white border-b border-stone-200 flex items-center justify-between shadow-2xs shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#5B7981] text-[#E3D5C0] rounded-2xl shadow-xs">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-black text-stone-900 tracking-tight flex items-center gap-2">
              BILL HISTORY &amp; ARCHIVE
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold font-mono">
                {totalCount} Total Invoices
              </span>
            </h1>
            <p className="text-xs text-stone-500 font-medium">
              Universal past bill explorer — Search, reprint, and share any invoice from any shift till date
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchInvoices(page)}
            className="p-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl cursor-pointer transition-colors shadow-2xs"
            title="Refresh Invoices"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#5B7981]' : ''}`} />
          </button>

          <button
            onClick={handleExportCsv}
            disabled={isExporting || totalCount === 0}
            className="px-3.5 py-2 bg-stone-800 hover:bg-stone-900 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-xs transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-[#E3D5C0]" />
            <span>{isExporting ? 'Exporting...' : 'Export CSV'}</span>
          </button>
        </div>
      </header>

      {/* FILTER & SEARCH CONTROL STRIP */}
      <div className="p-4 bg-[#EAE6DD]/60 border-b border-stone-300 space-y-3 shrink-0">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          
          {/* SEARCH INPUT */}
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by Bill # (e.g. 0001), Customer Name, or Phone..."
              className="w-full pl-10 pr-4 py-2 bg-white rounded-xl border border-stone-300 text-xs font-medium text-stone-900 placeholder-stone-400 focus:outline-none focus:border-[#5B7981] focus:ring-1 focus:ring-[#5B7981] shadow-2xs"
            />
            {search && (
              <button
                onClick={() => {
                  setSearch('');
                  fetchInvoices(1);
                }}
                className="absolute right-3 top-2.5 text-xs text-stone-400 hover:text-stone-700"
              >
                ✕
              </button>
            )}
          </div>

          {/* DATE RANGE FILTER */}
          <div className="md:col-span-4 flex items-center gap-2">
            <div className="flex-1 flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-stone-300 shadow-2xs">
              <Calendar className="w-3.5 h-3.5 text-stone-500" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-xs text-stone-800 font-mono outline-none w-full bg-transparent cursor-pointer"
                title="Start Date"
              />
            </div>
            <span className="text-xs font-bold text-stone-500">to</span>
            <div className="flex-1 flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-stone-300 shadow-2xs">
              <Calendar className="w-3.5 h-3.5 text-stone-500" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="text-xs text-stone-800 font-mono outline-none w-full bg-transparent cursor-pointer"
                title="End Date"
              />
            </div>
          </div>

          {/* SHIFT TOGGLE */}
          <div className="md:col-span-3 flex items-center gap-1.5 bg-stone-200/80 p-1 rounded-xl">
            <button
              onClick={() => setFilterAllShifts(true)}
              className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                filterAllShifts ? 'bg-white text-stone-900 shadow-2xs' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              All Shifts
            </button>
            <button
              onClick={() => setFilterAllShifts(false)}
              className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                !filterAllShifts ? 'bg-white text-stone-900 shadow-2xs' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Current Shift
            </button>
          </div>
        </div>

        {/* QUICK DATE SHORTCUT PILLS */}
        <div className="flex items-center gap-2 pt-1 text-[11px] font-bold">
          <span className="text-stone-500 text-[10px] uppercase font-mono tracking-wider">Quick Range:</span>
          <button
            onClick={() => setQuickDate('today')}
            className="px-2.5 py-1 rounded-lg bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 cursor-pointer shadow-2xs"
          >
            Today
          </button>
          <button
            onClick={() => setQuickDate('yesterday')}
            className="px-2.5 py-1 rounded-lg bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 cursor-pointer shadow-2xs"
          >
            Yesterday
          </button>
          <button
            onClick={() => setQuickDate('7days')}
            className="px-2.5 py-1 rounded-lg bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 cursor-pointer shadow-2xs"
          >
            Last 7 Days
          </button>
          <button
            onClick={() => setQuickDate('month')}
            className="px-2.5 py-1 rounded-lg bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 cursor-pointer shadow-2xs"
          >
            This Month
          </button>
          <button
            onClick={() => setQuickDate('all')}
            className="px-2.5 py-1 rounded-lg bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 cursor-pointer shadow-2xs"
          >
            All Time
          </button>
        </div>
      </div>

      {/* TABLE CONTENT */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4">
        <div className="bg-white rounded-2xl border border-stone-300 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse font-sans">
            <thead>
              <tr className="bg-[#243338] text-white text-[11px] uppercase tracking-wider font-mono">
                <th className="py-3 px-4 font-bold">Bill #</th>
                <th className="py-3 px-4 font-bold">Date &amp; Time</th>
                <th className="py-3 px-4 font-bold">Cashier</th>
                <th className="py-3 px-4 font-bold">Customer</th>
                <th className="py-3 px-4 font-bold">Payment</th>
                <th className="py-3 px-4 font-bold text-center">Items</th>
                <th className="py-3 px-4 font-bold text-right">Net Total</th>
                <th className="py-3 px-4 font-bold text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 text-xs text-stone-800">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-stone-500 font-mono">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#5B7981] mb-2" />
                    Searching database invoices archive...
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-stone-500 font-medium">
                    <FileText className="w-10 h-10 text-stone-300 mx-auto mb-2" />
                    No past bills found matching current search &amp; date filters.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => {
                  const d = new Date(inv.created_at);
                  const dateStr = d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
                  const timeStr = d.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });

                  return (
                    <tr key={inv.id} className="hover:bg-amber-50/40 transition-colors">
                      {/* INVOICE NUMBER */}
                      <td className="py-3 px-4 font-mono font-bold text-stone-900">
                        <span className="px-2 py-0.5 rounded bg-stone-100 border border-stone-300">
                          #{inv.invoice_number}
                        </span>
                      </td>

                      {/* DATE & TIME */}
                      <td className="py-3 px-4 text-stone-600 font-mono text-[11px]">
                        <div>{dateStr}</div>
                        <div className="text-stone-400 text-[10px]">{timeStr}</div>
                      </td>

                      {/* CASHIER */}
                      <td className="py-3 px-4 font-medium text-stone-700">
                        {inv.cashier_name || 'Cashier'}
                      </td>

                      {/* CUSTOMER */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-stone-900 truncate max-w-[150px]">
                          {inv.customer_name || 'Walk-in Customer'}
                        </div>
                        {inv.customer_phone ? (
                          <div className="text-[10px] font-mono text-stone-500">{inv.customer_phone}</div>
                        ) : (
                          <div className="text-[10px] text-stone-400 italic">No phone</div>
                        )}
                      </td>

                      {/* PAYMENT MODE */}
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase ${
                          inv.payment_mode === 'cash' ? 'bg-emerald-100 text-emerald-800' :
                          inv.payment_mode === 'khata' ? 'bg-amber-100 text-amber-900' :
                          'bg-sky-100 text-sky-800'
                        }`}>
                          {inv.payment_mode}
                        </span>
                      </td>

                      {/* ITEMS */}
                      <td className="py-3 px-4 text-center font-mono font-semibold text-stone-700">
                        {(inv.items || []).length}
                      </td>

                      {/* NET TOTAL */}
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700 text-sm">
                        Rs. {Number(inv.total_amount).toLocaleString()}
                      </td>

                      {/* ACTIONS */}
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* 1. Thermal Reprint */}
                          <button
                            onClick={() => handleQuickReprint(inv)}
                            className="p-1.5 bg-stone-100 hover:bg-[#5B7981] text-stone-700 hover:text-white rounded-lg transition-colors cursor-pointer shadow-2xs"
                            title="Instant 80mm Thermal Reprint"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>

                          {/* 2. WhatsApp & PDF */}
                          <button
                            onClick={() => handleWhatsAppShare(inv)}
                            className="p-1.5 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white rounded-lg transition-colors cursor-pointer shadow-2xs"
                            title="Generate A4 PDF & Share to WhatsApp (prompts for phone if missing)"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>

                          {/* 3. View Full Receipt Modal */}
                          <button
                            onClick={() => setSelectedInvoice(inv)}
                            className="p-1.5 bg-stone-100 hover:bg-stone-800 text-stone-700 hover:text-white rounded-lg transition-colors cursor-pointer shadow-2xs"
                            title="Preview Digital Bill & Full Items Breakdown"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* PAGINATION FOOTER */}
      <footer className="px-6 py-3 bg-white border-t border-stone-200 flex items-center justify-between text-xs text-stone-600 shrink-0">
        <div>
          Showing <span className="font-bold text-stone-900">{(page - 1) * 25 + (invoices.length > 0 ? 1 : 0)}</span> to{' '}
          <span className="font-bold text-stone-900">{Math.min(page * 25, totalCount)}</span> of{' '}
          <span className="font-bold text-stone-900">{totalCount}</span> total invoices
        </div>

        <div className="flex items-center gap-1 font-mono">
          <button
            disabled={page <= 1}
            onClick={() => fetchInvoices(1)}
            className="p-1.5 rounded-lg border border-stone-300 hover:bg-stone-100 disabled:opacity-40 cursor-pointer"
            title="First Page"
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
          </button>
          <button
            disabled={page <= 1}
            onClick={() => fetchInvoices(page - 1)}
            className="p-1.5 rounded-lg border border-stone-300 hover:bg-stone-100 disabled:opacity-40 cursor-pointer"
            title="Previous Page"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <span className="px-3 py-1 bg-stone-100 rounded-lg text-xs font-bold text-stone-800">
            Page {page} of {Math.max(1, totalPages)}
          </span>

          <button
            disabled={page >= totalPages}
            onClick={() => fetchInvoices(page + 1)}
            className="p-1.5 rounded-lg border border-stone-300 hover:bg-stone-100 disabled:opacity-40 cursor-pointer"
            title="Next Page"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => fetchInvoices(totalPages)}
            className="p-1.5 rounded-lg border border-stone-300 hover:bg-stone-100 disabled:opacity-40 cursor-pointer"
            title="Last Page"
          >
            <ChevronsRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </footer>

      {/* FULL RECEIPT PREVIEW MODAL */}
      {selectedInvoice && (
        <HighDensityReceiptCard
          invoice={selectedInvoice}
          storeSettings={storeSettings}
          onClose={() => setSelectedInvoice(null)}
          isDuplicateReprint={true}
        />
      )}

    </div>
  );
};
