import React, { useState, useEffect } from 'react';
import { Customer, CustomerTransaction, Invoice, StoreSettings } from '../../types';
import { khataService, CreateCustomerInput } from '../../services/khataService';
import { hardwareService } from '../../services/hardwareService';
import { invoicePdfService } from '../../services/invoicePdfService';
import { HighDensityReceiptCard } from '../emergency/HighDensityReceiptCard';
import { posAlert, posConfirm } from '../../store/uiStore';
import { 
  BookOpen, Plus, Search, DollarSign, Share2, 
  User, Phone, FileText, X, Check, ArrowDownLeft, 
  Download, AlertTriangle, ShieldAlert, Sparkles, Trash2,
  ChevronDown, ChevronUp, Printer, CheckCircle, RefreshCw
} from 'lucide-react';
import { AdminPinPromptModal } from '../common/AdminPinPromptModal';

interface CustomerKhataManagerProps {
  storeSettings: StoreSettings;
}

export const CustomerKhataManager: React.FC<CustomerKhataManagerProps> = ({ storeSettings }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [completedInvoice, setCompletedInvoice] = useState<Invoice | null>(null);
  const [shouldAutoPrintKhataReceipt, setShouldAutoPrintKhataReceipt] = useState(false);
  const [isGeneratingStatementWA, setIsGeneratingStatementWA] = useState(false);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
  const [isDeletePinOpen, setIsDeletePinOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerTransactions, setCustomerTransactions] = useState<CustomerTransaction[]>([]);
  const [ledgerSubTab, setLedgerSubTab] = useState<'UDHAAR' | 'AMANAT' | 'PERIOD_BILLS'>('UDHAAR');

  // Amanat Deposit/Withdrawal State
  const [amanatAmount, setAmanatAmount] = useState<number | ''>('');
  const [amanatNotes, setAmanatNotes] = useState('');

  // Period Bill Inspection State
  const [periodFromDate, setPeriodFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [periodToDate, setPeriodToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [periodInvoices, setPeriodInvoices] = useState<any[]>([]);
  const [isLoadingPeriod, setIsLoadingPeriod] = useState(false);
  const [expandedInvoices, setExpandedInvoices] = useState<Record<string, boolean>>({});
  const [editingItemState, setEditingItemState] = useState<Record<string, { qty: number; unit_price: number; product_name?: string }>>({});

  // Add Form
  const [addForm, setAddForm] = useState<CreateCustomerInput>({
    name: '',
    phone: '',
    nickname: '',
    address: '',
    credit_limit: 25000,
    opening_balance: 0,
    opening_balance_notes: ''
  });

  // Pay Form
  const [payAmount, setPayAmount] = useState<number | ''>('');
  const [settlementDiscount, setSettlementDiscount] = useState<number>(0);
  const [payNotes, setPayNotes] = useState('');

  const loadCustomers = async () => {
    setIsLoading(true);
    try {
      const list = await khataService.getCustomers();
      setCustomers(list);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();

    // Live Cross-Tab &amp; Cross-Window Database Synchronization
    const handleDbChange = () => {
      loadCustomers();
      if (selectedCustomer) {
        khataService.getCustomerById(selectedCustomer.id).then(c => {
          if (c) setSelectedCustomer(c);
        });
        khataService.getCustomerTransactions(selectedCustomer.id).then(setCustomerTransactions);
      }
    };

    let unsubElectron: (() => void) | undefined;
    if ((window as any).electronAPI?.onBroadcast) {
      unsubElectron = (window as any).electronAPI.onBroadcast('db-change', handleDbChange);
    }
    window.addEventListener('pos-db-change', handleDbChange);
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'pos_db_sync') handleDbChange();
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      if (unsubElectron) unsubElectron();
      window.removeEventListener('pos-db-change', handleDbChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, [selectedCustomer?.id]);

  const handleOpenPay = (cust: Customer) => {
    setSelectedCustomer(cust);
    setPayAmount(cust.current_balance);
    setSettlementDiscount(0);
    setPayNotes('Cash recovery at counter');
    setIsPayModalOpen(true);
  };

  const handleOpenLedger = async (cust: Customer) => {
    setSelectedCustomer(cust);
    setLedgerSubTab('UDHAAR');
    setAmanatAmount('');
    setAmanatNotes('');
    const txns = await khataService.getCustomerTransactions(cust.id);
    setCustomerTransactions(txns);
    setIsLedgerModalOpen(true);
    // Preload period bills with items
    try {
      const invs = await khataService.getCustomerInvoicesWithItems(cust.id, periodFromDate, periodToDate);
      setPeriodInvoices(invs);
    } catch {}
  };

  const handleLoadPeriodInvoices = async () => {
    if (!selectedCustomer) return;
    setIsLoadingPeriod(true);
    try {
      const invs = await khataService.getCustomerInvoicesWithItems(selectedCustomer.id, periodFromDate, periodToDate);
      setPeriodInvoices(invs);
    } catch (err: any) {
      await posAlert('Period Query Error', err.message, 'error');
    } finally {
      setIsLoadingPeriod(false);
    }
  };

  const handleReconcileAmanat = async () => {
    if (!selectedCustomer) return;
    try {
      const res = await khataService.reconcileAmanatWithDebt(selectedCustomer.id);
      if (res.offsetAmount > 0) {
        hardwareService.playScanSuccess();
        await posAlert(
          'Amanat Reconciled',
          `Successfully balanced Rs. ${res.offsetAmount.toLocaleString()} of Amanat deposit against Udhaar debt.\n\nRemaining Debt: Rs. ${res.newDebt.toLocaleString()}\nRemaining Amanat: Rs. ${res.newAmanat.toLocaleString()}`,
          'success'
        );
        const updated = await khataService.getCustomerById(selectedCustomer.id);
        if (updated) setSelectedCustomer(updated);
        const txns = await khataService.getCustomerTransactions(selectedCustomer.id);
        setCustomerTransactions(txns);
        loadCustomers();
        if ((window as any).electronAPI?.broadcastChange) {
          (window as any).electronAPI.broadcastChange('db-change', { type: 'khata-update', customerId: selectedCustomer.id });
        }
        window.dispatchEvent(new CustomEvent('pos-db-change', { detail: { type: 'khata-update' } }));
        localStorage.setItem('pos_db_sync', Date.now().toString());
      } else {
        await posAlert('Nothing to Reconcile', 'Customer has no active Udhaar debt or Amanat balance to offset.', 'info');
      }
    } catch (err: any) {
      await posAlert('Reconciliation Error', err.message, 'error');
    }
  };

  const handleAddAmanat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !amanatAmount || Number(amanatAmount) <= 0) {
      await posAlert('Invalid Amount', 'Please enter a valid deposit amount.', 'warning');
      return;
    }
    try {
      const res = await khataService.addAmanatDeposit(
        selectedCustomer.id,
        Number(amanatAmount),
        false, // Do NOT auto-offset debt! Keep Amanat separate and let user balance via button
        amanatNotes || 'Advance deposit at counter'
      );
      hardwareService.playScanSuccess();
      const updatedCust = await khataService.getCustomerById(selectedCustomer.id);
      if (updatedCust) setSelectedCustomer(updatedCust);
      const txns = await khataService.getCustomerTransactions(selectedCustomer.id);
      setCustomerTransactions(txns);
      setAmanatAmount('');
      setAmanatNotes('');
      loadCustomers();
      if ((window as any).electronAPI?.broadcastChange) {
        (window as any).electronAPI.broadcastChange('db-change', { type: 'khata-update', customerId: selectedCustomer.id });
      }
      window.dispatchEvent(new CustomEvent('pos-db-change', { detail: { type: 'khata-update' } }));
      localStorage.setItem('pos_db_sync', Date.now().toString());

      if (updatedCust && updatedCust.current_balance > 0) {
        await posAlert(
          'Amanat Deposited',
          `Successfully deposited Rs. ${Number(amanatAmount).toLocaleString()} into advance Amanat wallet.\n\nNote: Outstanding Udhaar debt is Rs. ${updatedCust.current_balance.toLocaleString()}. If you wish to balance this debt using Amanat, click the "Auto-Balance Amanat" button.`,
          'info'
        );
      } else {
        await posAlert('Amanat Deposited', `Successfully deposited Rs. ${Number(amanatAmount).toLocaleString()} into advance wallet.`, 'success');
      }
    } catch (err: any) {
      await posAlert('Deposit Error', err.message, 'error');
    }
  };

  const handleDeductAmanat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !amanatAmount || Number(amanatAmount) <= 0) {
      await posAlert('Invalid Amount', 'Please enter a valid refund amount.', 'warning');
      return;
    }
    try {
      await khataService.deductAmanat(selectedCustomer.id, Number(amanatAmount), amanatNotes || 'Manual refund / withdrawal');
      hardwareService.playScanSuccess();
      const updatedCust = await khataService.getCustomerById(selectedCustomer.id);
      if (updatedCust) setSelectedCustomer(updatedCust);
      const txns = await khataService.getCustomerTransactions(selectedCustomer.id);
      setCustomerTransactions(txns);
      setAmanatAmount('');
      setAmanatNotes('');
      loadCustomers();
      if ((window as any).electronAPI?.broadcastChange) {
        (window as any).electronAPI.broadcastChange('db-change', { type: 'khata-update', customerId: selectedCustomer.id });
      }
      window.dispatchEvent(new CustomEvent('pos-db-change', { detail: { type: 'khata-update' } }));
      localStorage.setItem('pos_db_sync', Date.now().toString());
      await posAlert('Amanat Refunded', `Successfully refunded Rs. ${Number(amanatAmount).toLocaleString()} from advance wallet.`, 'success');
    } catch (err: any) {
      await posAlert('Withdrawal Error', err.message, 'error');
    }
  };

  const handleSaveInvoiceItem = async (itemId: string, invoiceId: string, newQty: number, newPrice: number, newName?: string) => {
    try {
      await khataService.updateInvoiceItem(itemId, invoiceId, newQty, newPrice, newName);
      hardwareService.playScanSuccess();
      if (selectedCustomer) {
        const invs = await khataService.getCustomerInvoicesWithItems(selectedCustomer.id, periodFromDate, periodToDate);
        setPeriodInvoices(invs);
        const updatedCust = await khataService.getCustomerById(selectedCustomer.id);
        if (updatedCust) setSelectedCustomer(updatedCust);
      }
      loadCustomers();
      if ((window as any).electronAPI?.broadcastChange) {
        (window as any).electronAPI.broadcastChange('db-change', { type: 'invoice-item-update', itemId });
      }
      window.dispatchEvent(new CustomEvent('pos-db-change', { detail: { type: 'invoice-item-update', itemId } }));
      localStorage.setItem('pos_db_sync', Date.now().toString());
    } catch (e: any) {
      await posAlert('Update Error', e.message, 'error');
    }
  };

  const handleAddItemToInvoice = async (invoiceId: string) => {
    if (!selectedCustomer) return;
    try {
      await khataService.addInvoiceItem(invoiceId, 'Custom Item', 1, 100);
      hardwareService.playNoticeTone();
      const invs = await khataService.getCustomerInvoicesWithItems(selectedCustomer.id, periodFromDate, periodToDate);
      setPeriodInvoices(invs);
      const updatedCust = await khataService.getCustomerById(selectedCustomer.id);
      if (updatedCust) setSelectedCustomer(updatedCust);
      loadCustomers();
      if ((window as any).electronAPI?.broadcastChange) {
        (window as any).electronAPI.broadcastChange('db-change', { type: 'invoice-item-add', invoiceId });
      }
      window.dispatchEvent(new CustomEvent('pos-db-change', { detail: { type: 'invoice-item-add', invoiceId } }));
      localStorage.setItem('pos_db_sync', Date.now().toString());
    } catch (e: any) {
      await posAlert('Add Item Error', e.message, 'error');
    }
  };

  const handleDeleteInvoiceItem = async (itemId: string, invoiceId: string) => {
    try {
      await khataService.deleteInvoiceItem(itemId, invoiceId);
      hardwareService.playScanSuccess();
      if (selectedCustomer) {
        const invs = await khataService.getCustomerInvoicesWithItems(selectedCustomer.id, periodFromDate, periodToDate);
        setPeriodInvoices(invs);
        const updatedCust = await khataService.getCustomerById(selectedCustomer.id);
        if (updatedCust) setSelectedCustomer(updatedCust);
      }
      loadCustomers();
      if ((window as any).electronAPI?.broadcastChange) {
        (window as any).electronAPI.broadcastChange('db-change', { type: 'invoice-item-delete', itemId });
      }
      window.dispatchEvent(new CustomEvent('pos-db-change', { detail: { type: 'invoice-item-delete', itemId } }));
      localStorage.setItem('pos_db_sync', Date.now().toString());
    } catch (e: any) {
      await posAlert('Delete Error', e.message, 'error');
    }
  };

  const createConsolidatedInvoiceObject = (amountPaid: number, discount: number = 0): Invoice | null => {
    if (!selectedCustomer) return null;

    // Consolidate identical items bought across days into single rows (A22, A24)
    const groupedMap = new Map<string, {
      product_id: string;
      product_name: string;
      qty: number;
      unit_price: number;
      subtotal: number;
      unit_label?: string;
    }>();

    periodInvoices.forEach(inv => {
      (inv.items || []).forEach((it: any) => {
        const cleanName = (it.product_name || 'Grocery Item').replace(/^\d{2}\/\d{2}\s*-\s*/, '').trim();
        const key = it.product_id ? `${it.product_id}_${cleanName}` : cleanName;
        const qty = Number(it.qty || 1);
        const subtotal = Number(it.subtotal || (qty * (it.unit_price || 0)));
        const unit_price = Number(it.unit_price || (qty > 0 ? subtotal / qty : 0));

        const existing = groupedMap.get(key);
        if (existing) {
          existing.qty += qty;
          existing.subtotal += subtotal;
          if (unit_price > 0) existing.unit_price = unit_price;
        } else {
          groupedMap.set(key, {
            product_id: it.product_id || '',
            product_name: cleanName,
            qty,
            unit_price,
            subtotal,
            unit_label: it.unit_label || ''
          });
        }
      });
    });

    const allItems: any[] = Array.from(groupedMap.values()).map((it, idx) => ({
      id: `khata-item-${idx}`,
      product_id: it.product_id,
      product_name: it.product_name,
      qty: it.qty,
      unit_price: it.unit_price,
      subtotal: it.subtotal,
      unit_label: it.unit_label,
      is_taxable: false,
      tax_rate: 0
    }));

    return {
      id: `khata-consolidated-${Date.now()}`,
      invoice_number: `MRS-KHATA-${selectedCustomer.phone?.slice(-4) || '0000'}-${Date.now().toString().slice(-4)}`,
      total_amount: amountPaid,
      paid_amount: amountPaid,
      tax_amount: 0,
      round_off_amount: 0,
      discount_amount: discount,
      change_due: 0,
      payment_mode: 'khata',
      cashier_name: 'Store Manager',
      customer_id: selectedCustomer.id,
      customer_name: selectedCustomer.name,
      customer_phone: selectedCustomer.phone,
      created_at: new Date().toISOString(),
      items: allItems,
      notes: `STATEMENT DURATION: ${periodFromDate} TO ${periodToDate} (${periodInvoices.length} Bills Consolidated)`
    };
  };

  const handlePrintConsolidatedBill = async () => {
    if (!selectedCustomer) return;
    if (periodInvoices.length === 0) {
      await posAlert('No Bills Found', 'No historical invoices found in this period to consolidate.', 'warning');
      return;
    }
    const inv = createConsolidatedInvoiceObject(selectedCustomer.current_balance, 0);
    if (inv) {
      const wantPrint = await posConfirm(
        'Print 80mm Thermal Receipt?',
        `Do you want to send this ${periodInvoices.length}-bill consolidated receipt to the thermal printer now?\n\n• Select [Yes, Print] to print paper receipt immediately.\n• Select [View Only] to preview on screen without printing.`,
        {
          confirmText: 'Yes, Print [Y]',
          cancelText: 'View Only (No Print) [N]',
          alertType: 'info'
        }
      );
      setShouldAutoPrintKhataReceipt(wantPrint);
      setCompletedInvoice(inv);
      hardwareService.playNoticeTone();
    }
  };

  const handlePrint80mmStatement = async () => {
    // Consolidated single high-density receipt format with purchase date/month and prominent duration
    await handlePrintConsolidatedBill();
  };

  const handleSettleKhataWithConsolidatedBill = async () => {
    if (!selectedCustomer) return;
    const due = selectedCustomer.current_balance;
    if (due <= 0) {
      await posAlert('Khata Cleared', 'This customer has no outstanding Udhaar debt.', 'info');
      return;
    }

    const confirmed = await posConfirm(
      'Clear Khata &amp; Print Unified Bill',
      `Clear outstanding balance of Rs. ${due.toLocaleString()} for "${selectedCustomer.name}" and view/print the unified digital receipt across past bills?`,
      { confirmText: 'Clear Khata &amp; Print', cancelText: 'Cancel', alertType: 'info' }
    );
    if (!confirmed) return;

    try {
      await khataService.receivePayment(selectedCustomer.id, due, 0, 'Consolidated Period Settlement &amp; Balance Clearance');
      const inv = createConsolidatedInvoiceObject(due, 0);
      hardwareService.playCheckoutChime();

      const updatedCust = await khataService.getCustomerById(selectedCustomer.id);
      if (updatedCust) setSelectedCustomer(updatedCust);
      const txns = await khataService.getCustomerTransactions(selectedCustomer.id);
      setCustomerTransactions(txns);
      const invs = await khataService.getCustomerInvoicesWithItems(selectedCustomer.id, periodFromDate, periodToDate);
      setPeriodInvoices(invs);
      loadCustomers();

      if ((window as any).electronAPI?.broadcastChange) {
        (window as any).electronAPI.broadcastChange('db-change', { type: 'khata-settlement', customerId: selectedCustomer.id });
      }
      window.dispatchEvent(new CustomEvent('pos-db-change', { detail: { type: 'khata-settlement' } }));
      localStorage.setItem('pos_db_sync', Date.now().toString());

      if (inv) {
        const wantPrint = await posConfirm(
          'Print Settlement Receipt?',
          `Khata settlement completed successfully.\n\nDo you want to send this receipt to the 80mm thermal printer now?\n• Select [Yes, Print [Y]] to print paper receipt immediately.\n• Select [View Only [N]] to preview on screen without printing.`,
          {
            confirmText: 'Yes, Print [Y]',
            cancelText: 'View Only (No Print) [N]',
            alertType: 'info'
          }
        );
        setShouldAutoPrintKhataReceipt(wantPrint);
        setCompletedInvoice(inv);
      }
    } catch (err: any) {
      await posAlert('Settlement Failed', err.message, 'error');
    }
  };

  const handleDeleteClick = async (cust: Customer) => {
    if (cust.current_balance > 0) {
      const proceed = await posConfirm(
        'Outstanding Debt Warning',
        `Customer "${cust.name}" has an outstanding due balance of Rs. ${cust.current_balance.toLocaleString()}.\n\nDeleting will clear this Khata record while permanently preserving all past sales and tax reports.\n\nDo you want to proceed with Admin PIN authorization?`,
        { confirmText: 'Proceed to PIN Verification', cancelText: 'Cancel', alertType: 'warning' }
      );
      if (!proceed) return;
    }
    setCustomerToDelete(cust);
    setIsDeletePinOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!customerToDelete) return;
    try {
      await khataService.deleteCustomer(customerToDelete.id);
      hardwareService.playScanSuccess();
      await posAlert('Customer Khata Deleted', `Khata record for "${customerToDelete.name}" has been deleted. Past invoices have been safely detached and preserved.`, 'success');
      setCustomerToDelete(null);
      setIsDeletePinOpen(false);
      loadCustomers();
    } catch (err: any) {
      await posAlert('Delete Failed', `Error: ${err.message}`, 'error');
    }
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.name.trim() || !addForm.phone.trim()) {
      await posAlert('Missing Information', 'Please provide customer name and phone number.', 'warning');
      return;
    }
    try {
      await khataService.createCustomer(addForm);
      hardwareService.playScanSuccess();
      setIsAddModalOpen(false);
      setAddForm({
        name: '',
        phone: '',
        nickname: '',
        address: '',
        credit_limit: 25000,
        opening_balance: 0,
        opening_balance_notes: ''
      });
      loadCustomers();
    } catch (err: any) {
      await posAlert('Customer Creation Error', `Error creating customer: ${err.message}`, 'error');
    }
  };

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    const amount = Number(payAmount) || 0;
    const discount = Number(settlementDiscount) || 0;

    if (amount <= 0 && discount <= 0) {
      await posAlert('Invalid Amount', 'Please enter a valid payment amount or settlement discount.', 'warning');
      return;
    }

    try {
      await khataService.receivePayment(
        selectedCustomer.id,
        amount,
        discount,
        payNotes
      );
      hardwareService.playCheckoutChime();
      setIsPayModalOpen(false);
      loadCustomers();

      const updatedCust = await khataService.getCustomerById(selectedCustomer.id);
      if (updatedCust) {
        const sendWA = await posConfirm(
          'WhatsApp Confirmation',
          'Payment recorded successfully! Would you like to send a digital payment receipt to the customer via WhatsApp?',
          { confirmText: 'Send WhatsApp', cancelText: 'Done', alertType: 'info' }
        );
        if (sendWA) {
          const text = [
            `🧾 *${storeSettings.store_name} — PAYMENT RECEIPT*`,
            `━━━━━━━━━━━━━━━━━━━━━━━━`,
            `👤 *Customer:* ${updatedCust.name}`,
            `💵 *Amount Received:* Rs. ${amount.toLocaleString()}`,
            discount > 0 ? `🏷️ *Settlement Discount:* Rs. ${discount.toLocaleString()}` : '',
            `⭐ *Remaining Balance:* Rs. ${updatedCust.current_balance.toLocaleString()}`,
            `📅 *Date:* ${new Date().toLocaleDateString('en-PK')}`,
            `━━━━━━━━━━━━━━━━━━━━━━━━`,
            `🙏 *${storeSettings.receipt_footer_urdu}*`,
            `🛠️ *Developed and maintained by Teddops* (+923297263098 • +923235930559)`
          ].filter(Boolean).join('\n');
          hardwareService.openWhatsApp(updatedCust.phone, text);
        }
      }
    } catch (err: any) {
      await posAlert('Payment Error', `Error receiving payment: ${err.message}`, 'error');
    }
  };

  const handleExportCsv = () => {
    const headers = ['ID', 'Name', 'Phone', 'Nickname', 'Address', 'Credit Limit', 'Current Balance'];
    const rows = customers.map(c => [
      c.id,
      `"${c.name.replace(/"/g, '""')}"`,
      c.phone,
      `"${(c.nickname || '').replace(/"/g, '""')}"`,
      `"${(c.address || '').replace(/"/g, '""')}"`,
      c.credit_limit,
      c.current_balance
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MR_Super_Store_Khata_Ledger_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalOutstanding = customers.reduce((sum, c) => sum + (c.current_balance || 0), 0);

  const filteredCustomers = customers.filter(c => {
    const q = searchQuery.toLowerCase().trim();
    return !q || 
      c.name.toLowerCase().includes(q) || 
      c.phone.toLowerCase().includes(q) || 
      c.nickname?.toLowerCase().includes(q);
  });

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5 font-sans">
      
      {/* HEADER BANNER */}
      <div className="bg-[#243338] text-white p-5 rounded-3xl shadow-lg border border-stone-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black font-heading tracking-tight flex items-center gap-2.5">
            <BookOpen className="w-6 h-6 text-[#E3D5C0]" /> CUSTOMER KHATA (CREDIT LEDGER)
          </h1>
          <p className="text-xs sm:text-sm text-stone-300 mt-1">
            Mohalla credit accounts with sub-ledgers for Credit Balance (Udhaar) vs Advance Deposits (Amanat), 30-day debt aging alerts, and WhatsApp statements.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-stone-800/90 px-4 py-2 rounded-2xl border border-stone-700 text-right">
            <span className="text-[10px] text-stone-400 block font-mono">TOTAL RECOVERABLE KHATA</span>
            <span className="text-base font-black font-mono text-amber-400">
              PKR {totalOutstanding.toLocaleString()}
            </span>
          </div>

          <button
            onClick={handleExportCsv}
            className="px-3.5 py-2.5 bg-stone-800 hover:bg-stone-700 border border-stone-600 rounded-xl text-xs font-bold text-stone-200 flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Download className="w-4 h-4 text-emerald-400" /> Export CSV
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-5 py-2.5 bg-[#5B7981] hover:bg-[#486269] text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 cursor-pointer transition-all hover:scale-102"
          >
            <Plus className="w-4 h-4 stroke-[3]" /> New Khata Account
          </button>
        </div>
      </div>

      {/* SEARCH BAR */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by customer name, phone or nickname..."
            className="w-full pl-9 pr-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs outline-hidden focus:bg-white focus:border-[#5B7981]"
          />
        </div>
      </div>

      {/* CUSTOMERS LIST */}
      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-100 border-b border-stone-200 text-[10px] font-bold text-stone-600 uppercase tracking-wide">
              <tr>
                <th className="p-3.5">Customer Name &amp; Title</th>
                <th className="p-3.5">WhatsApp Phone</th>
                <th className="p-3.5">Mohalla / Address</th>
                <th className="p-3.5 text-right">Credit Limit</th>
                <th className="p-3.5 text-right">Balance Due</th>
                <th className="p-3.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-stone-400">
                    No customers found. Click "New Khata Account" to add the first record.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((cust) => {
                  const isLimitExceeded = cust.credit_limit > 0 && cust.current_balance > cust.credit_limit;
                  // Mock 30-day overdue alert for high balances
                  const isOverdue = cust.current_balance > 10000;

                  return (
                    <tr key={cust.id} className="hover:bg-stone-50/80 transition-colors">
                      <td className="p-3.5">
                        <span className="font-bold text-stone-900 block">{cust.name}</span>
                        {cust.nickname && (
                          <span className="text-[10px] text-stone-500 italic">"{cust.nickname}"</span>
                        )}
                        {isOverdue && (
                          <span className="inline-block px-2 py-0.2 mt-0.5 bg-red-100 text-red-800 text-[9px] font-bold rounded font-mono">
                            30+ DAYS OVERDUE
                          </span>
                        )}
                      </td>

                      <td className="p-3.5 font-mono text-stone-700">
                        {cust.phone}
                      </td>

                      <td className="p-3.5 text-stone-600 max-w-xs truncate">
                        {cust.address || '—'}
                      </td>

                      <td className="p-3.5 text-right font-mono text-stone-600">
                        Rs. {cust.credit_limit.toLocaleString()}
                      </td>

                      <td className="p-3.5 text-right font-mono">
                        <span className={`font-black text-sm block ${
                          cust.current_balance > 0 ? 'text-amber-700' : 'text-emerald-700'
                        }`}>
                          Rs. {cust.current_balance.toLocaleString()}
                        </span>
                        {isLimitExceeded && (
                          <span className="text-[9px] font-bold text-red-600 font-sans">
                            LIMIT BREACHED
                          </span>
                        )}
                      </td>

                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenPay(cust)}
                            disabled={cust.current_balance <= 0}
                            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-30 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors flex items-center gap-1"
                          >
                            <DollarSign className="w-3.5 h-3.5" /> Receive Pay
                          </button>

                          <button
                            onClick={() => handleOpenLedger(cust)}
                            className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-bold cursor-pointer transition-colors flex items-center gap-1"
                          >
                            <FileText className="w-3.5 h-3.5" /> Sub-Ledger
                          </button>

                          <button
                            onClick={() => handleDeleteClick(cust)}
                            className="p-1.5 hover:bg-red-50 text-stone-400 hover:text-red-600 rounded-xl cursor-pointer transition-colors"
                            title="Delete Khata Account [Admin PIN Protected]"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

      {/* SUB-LEDGER MODAL (UDHAAR VS AMANAT VS PERIOD BILLS) */}
      {isLedgerModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 font-sans select-none">
          <div className="bg-white border border-stone-300 rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl p-4 sm:p-6 space-y-4 font-sans overflow-hidden">
            <div className="flex justify-between items-center border-b border-stone-200 pb-3 shrink-0">
              <div>
                <h3 className="font-bold text-sm text-stone-900">CUSTOMER SUB-LEDGER &amp; AMANAT</h3>
                <p className="text-[11px] text-stone-500 font-mono">
                  {selectedCustomer.name} • {selectedCustomer.phone} {selectedCustomer.account_no ? `• Acct #${selectedCustomer.account_no}` : ''}
                </p>
              </div>
              <button onClick={() => setIsLedgerModalOpen(false)} className="text-stone-400 hover:text-stone-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
            {/* UNIFIED NET POSITION &amp; AMANAT AUTO-OFFSET BAR */}
            <div className="p-3 bg-stone-100 rounded-2xl border border-stone-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-[10px] uppercase font-bold text-stone-500 block font-mono">Udhaar Debt</span>
                  <span className="font-mono font-bold text-amber-700 text-sm">
                    Rs. {selectedCustomer.current_balance.toLocaleString()}
                  </span>
                </div>
                <div className="border-l border-stone-300 pl-4">
                  <span className="text-[10px] uppercase font-bold text-stone-500 block font-mono">Amanat Advance</span>
                  <span className="font-mono font-bold text-emerald-700 text-sm">
                    Rs. {(selectedCustomer.amanat_balance || 0).toLocaleString()}
                  </span>
                </div>
                <div className="border-l border-stone-300 pl-4">
                  <span className="text-[10px] uppercase font-bold text-stone-500 block font-mono">Net Status</span>
                  <span className={`font-mono font-bold text-sm ${
                    selectedCustomer.current_balance > (selectedCustomer.amanat_balance || 0)
                      ? 'text-amber-800'
                      : (selectedCustomer.amanat_balance || 0) > selectedCustomer.current_balance
                      ? 'text-emerald-800'
                      : 'text-stone-700'
                  }`}>
                    {selectedCustomer.current_balance > (selectedCustomer.amanat_balance || 0)
                      ? `Net Due: Rs. ${(selectedCustomer.current_balance - (selectedCustomer.amanat_balance || 0)).toLocaleString()}`
                      : (selectedCustomer.amanat_balance || 0) > selectedCustomer.current_balance
                      ? `Net Credit: Rs. ${((selectedCustomer.amanat_balance || 0) - selectedCustomer.current_balance).toLocaleString()}`
                      : 'Balanced (Rs. 0)'}
                  </span>
                </div>
              </div>

              {selectedCustomer.current_balance > 0 && (selectedCustomer.amanat_balance || 0) > 0 && (
                <button
                  type="button"
                  onClick={handleReconcileAmanat}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                  title="Deduct available Amanat to auto-balance Udhaar debt"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Auto-Balance Amanat (Rs. {Math.min(selectedCustomer.current_balance, selectedCustomer.amanat_balance || 0).toLocaleString()})</span>
                </button>
              )}
            </div>

            {/* SUB-TABS: UDHAAR VS AMANAT VS PERIOD BILLS */}
            <div className="grid grid-cols-3 gap-2 bg-stone-100 p-1 rounded-2xl border border-stone-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setLedgerSubTab('UDHAAR')}
                className={`py-2 rounded-xl transition-all cursor-pointer ${
                  ledgerSubTab === 'UDHAAR'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Credit Debt (Udhaar)
              </button>
              <button
                type="button"
                onClick={() => setLedgerSubTab('AMANAT')}
                className={`py-2 rounded-xl transition-all cursor-pointer ${
                  ledgerSubTab === 'AMANAT'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Advance Wallet (Amanat)
              </button>
              <button
                type="button"
                onClick={() => {
                  setLedgerSubTab('PERIOD_BILLS');
                  handleLoadPeriodInvoices();
                }}
                className={`py-2 rounded-xl transition-all cursor-pointer ${
                  ledgerSubTab === 'PERIOD_BILLS'
                    ? 'bg-[#5B7981] text-white shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Period Bills &amp; Print
              </button>
            </div>

            {ledgerSubTab === 'UDHAAR' ? (
              <div className="space-y-3">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex justify-between items-center text-xs font-mono">
                  <span className="text-amber-900 font-bold">Total Outstanding Udhaar Debt:</span>
                  <span className="text-base font-black text-amber-700">
                    Rs. {selectedCustomer.current_balance.toLocaleString()}
                  </span>
                </div>

                <div className="max-h-64 overflow-y-auto divide-y divide-stone-100">
                  {customerTransactions.filter(t => t.type !== 'AMANAT_DEPOSIT' && t.type !== 'AMANAT_DEDUCTION').length === 0 ? (
                    <div className="p-8 text-center text-stone-400 text-xs">No credit transactions recorded yet.</div>
                  ) : (
                    customerTransactions
                      .filter(t => t.type !== 'AMANAT_DEPOSIT' && t.type !== 'AMANAT_DEDUCTION')
                      .map(t => (
                        <div key={t.id} className="py-2.5 flex justify-between items-center text-xs">
                          <div>
                            <span className="font-bold text-stone-900 block">{t.type.replace('_', ' ')}</span>
                            <span className="text-[10px] text-stone-500 font-mono">
                              {new Date(t.created_at).toLocaleDateString('en-PK')} • {t.notes || 'Counter entry'}
                            </span>
                          </div>
                          <span className={`font-mono font-bold ${
                            t.type === 'CREDIT_SALE' ? 'text-amber-700' : 'text-emerald-700'
                          }`}>
                            {t.type === 'CREDIT_SALE' ? '+' : '-'}Rs. {t.amount.toLocaleString()}
                          </span>
                        </div>
                      ))
                  )}
                </div>
              </div>
            ) : ledgerSubTab === 'AMANAT' ? (
              <div className="space-y-3">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex justify-between items-center text-xs font-mono">
                  <div>
                    <span className="text-emerald-900 font-bold block">Available Amanat Deposit:</span>
                    <span className="text-[10px] text-emerald-700">Can be auto-deducted directly at checkout</span>
                  </div>
                  <span className="text-xl font-black text-emerald-700">
                    Rs. {(selectedCustomer.amanat_balance || 0).toLocaleString()}
                  </span>
                </div>

                {/* PROMINENT AUTO-BALANCE BANNER IF CUSTOMER HAS BOTH DEBT AND AMANAT */}
                {selectedCustomer.current_balance > 0 && (selectedCustomer.amanat_balance || 0) > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-300 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="font-bold text-amber-950 block">Outstanding Udhaar Debt: Rs. {selectedCustomer.current_balance.toLocaleString()}</span>
                      <span className="text-[10px] text-amber-800">You can balance Rs. {Math.min(selectedCustomer.current_balance, selectedCustomer.amanat_balance || 0).toLocaleString()} from Amanat to clear debt.</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleReconcileAmanat}
                      className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors shrink-0"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Balance Debt with Amanat</span>
                    </button>
                  </div>
                )}

                {/* AMANAT DEPOSIT / REFUND CONTROLS */}
                <div className="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
                  <span className="text-xs font-bold text-stone-700 block">Record Amanat Transaction</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="number"
                      min="1"
                      value={amanatAmount}
                      onChange={(e) => setAmanatAmount(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="Amount in Rs."
                      className="px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs font-mono font-bold outline-hidden focus:border-emerald-600"
                    />
                    <input
                      type="text"
                      value={amanatNotes}
                      onChange={(e) => setAmanatNotes(e.target.value)}
                      placeholder="Reason / Notes (optional)"
                      className="px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs outline-hidden focus:border-emerald-600"
                    />
                  </div>
                  <div className="flex gap-2 justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleDeductAmanat}
                      className="px-3 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl text-xs font-bold cursor-pointer"
                    >
                      Withdraw / Refund
                    </button>
                    <button
                      type="button"
                      onClick={handleAddAmanat}
                      className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold cursor-pointer shadow-xs"
                    >
                      + Deposit Amanat
                    </button>
                  </div>
                </div>

                {/* AMANAT TRANSACTION HISTORY */}
                <div className="max-h-48 overflow-y-auto divide-y divide-stone-100">
                  {customerTransactions.filter(t => t.type === 'AMANAT_DEPOSIT' || t.type === 'AMANAT_DEDUCTION').length === 0 ? (
                    <div className="p-6 text-center text-stone-400 text-xs">No advance security deposits recorded for this account.</div>
                  ) : (
                    customerTransactions
                      .filter(t => t.type === 'AMANAT_DEPOSIT' || t.type === 'AMANAT_DEDUCTION')
                      .map(t => (
                        <div key={t.id} className="py-2 flex justify-between items-center text-xs">
                          <div>
                            <span className="font-bold text-stone-900 block">{t.type.replace('_', ' ')}</span>
                            <span className="text-[10px] text-stone-500 font-mono">
                              {new Date(t.created_at).toLocaleDateString('en-PK')} • {t.notes || 'Advance deposit'}
                            </span>
                          </div>
                          <span className={`font-mono font-bold ${
                            t.type === 'AMANAT_DEPOSIT' ? 'text-emerald-700' : 'text-stone-700'
                          }`}>
                            {t.type === 'AMANAT_DEPOSIT' ? '+' : '-'}Rs. {t.amount.toLocaleString()}
                          </span>
                        </div>
                      ))
                  )}
                </div>
              </div>
            ) : (
              /* PERIOD BILLS INSPECTION &amp; 1-CLICK CONSOLIDATED BILL CLEARANCE (M6.6) */
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-stone-50 border border-stone-200 rounded-2xl">
                  <div className="flex items-center gap-2 text-xs">
                    <div>
                      <span className="block text-[10px] font-bold text-stone-500 uppercase">From</span>
                      <input
                        type="date"
                        value={periodFromDate}
                        onChange={(e) => setPeriodFromDate(e.target.value)}
                        className="px-2 py-1 bg-white border border-stone-300 rounded-lg text-xs font-mono"
                      />
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold text-stone-500 uppercase">To</span>
                      <input
                        type="date"
                        value={periodToDate}
                        onChange={(e) => setPeriodToDate(e.target.value)}
                        className="px-2 py-1 bg-white border border-stone-300 rounded-lg text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleLoadPeriodInvoices}
                      className="px-3 py-1.5 bg-[#5B7981] hover:bg-[#486269] text-white rounded-xl text-xs font-bold cursor-pointer"
                    >
                      {isLoadingPeriod ? 'Loading...' : 'Filter Bills'}
                    </button>
                    <button
                      type="button"
                      onClick={handlePrint80mmStatement}
                      className="px-3 py-1.5 bg-stone-800 hover:bg-stone-900 text-white rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1 shadow-xs"
                      title="Print 80mm ESC/POS Thermal Statement"
                    >
                      <Download className="w-3.5 h-3.5" /> 80mm Statement
                    </button>
                  </div>
                </div>

                {/* INVOICES ACCORDION WITH EDITABLE LINE ITEMS */}
                <div className="max-h-72 overflow-y-auto divide-y divide-stone-200 border border-stone-200 rounded-2xl">
                  {periodInvoices.length === 0 ? (
                    <div className="p-8 text-center text-stone-400 text-xs">
                      {isLoadingPeriod ? 'Fetching period invoices...' : 'No invoices found in this date range.'}
                    </div>
                  ) : (
                    periodInvoices.map(inv => {
                      const isExpanded = expandedInvoices[inv.id] !== false; // default expanded
                      return (
                        <div key={inv.id} className="bg-white">
                          <div
                            onClick={() => setExpandedInvoices(prev => ({ ...prev, [inv.id]: !isExpanded }))}
                            className="p-3 flex items-center justify-between hover:bg-stone-50 cursor-pointer text-xs select-none border-b border-stone-100"
                          >
                            <div className="flex items-center gap-2">
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
                              <span className="font-mono font-bold text-stone-900">
                                #{inv.invoice_number.slice(-8)}
                              </span>
                              <span className="text-[11px] text-stone-500 font-mono">
                                {new Date(inv.created_at).toLocaleDateString('en-PK')}
                              </span>
                              <span className="px-1.5 py-0.5 bg-stone-100 rounded text-[10px] font-mono uppercase text-stone-600">
                                {inv.payment_mode}
                              </span>
                              <span className="text-[11px] text-stone-400">
                                ({inv.items?.length || 0} items)
                              </span>
                            </div>

                            <div className="font-mono font-bold text-stone-900">
                              Rs. {Number(inv.total_amount || 0).toLocaleString()}
                            </div>
                          </div>

                          {/* EXPANDED LINE ITEMS TABLE */}
                          {isExpanded && (
                            <div className="p-2.5 bg-stone-50/70">
                              {inv.items && inv.items.length > 0 ? (
                                <table className="w-full text-left text-xs bg-white rounded-xl border border-stone-200 overflow-hidden shadow-2xs">
                                  <thead className="bg-stone-100 text-stone-600 text-[10px] uppercase font-bold">
                                  <tr>
                                    <th className="p-2">Item Name</th>
                                    <th className="p-2 w-20 text-center">Qty</th>
                                    <th className="p-2 w-24 text-right">Price</th>
                                    <th className="p-2 w-24 text-right">Total</th>
                                    <th className="p-2 w-16 text-center">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-stone-100 text-[11px]">
                                  {inv.items.map((it: any) => {
                                    const stateKey = `${inv.id}-${it.id}`;
                                    const editState = editingItemState[stateKey] || { qty: it.qty, unit_price: it.unit_price, product_name: it.product_name };
                                    const isDirty = editState.qty !== it.qty || editState.unit_price !== it.unit_price || (editState.product_name !== undefined && editState.product_name !== it.product_name);

                                    return (
                                      <tr key={it.id} className="hover:bg-amber-50/30">
                                        <td className="p-2">
                                          <input
                                            type="text"
                                            value={editState.product_name !== undefined ? editState.product_name : it.product_name}
                                            onChange={(e) => {
                                              const n = e.target.value;
                                              setEditingItemState(prev => ({
                                                ...prev,
                                                [stateKey]: { ...editState, product_name: n }
                                              }));
                                            }}
                                            className="w-full px-2 py-0.5 font-bold text-stone-800 bg-stone-50 border border-stone-300 rounded text-xs focus:bg-white focus:border-emerald-600 outline-hidden"
                                          />
                                        </td>
                                        <td className="p-2 text-center">
                                          <input
                                            type="number"
                                            min="0.001"
                                            step="any"
                                            value={editState.qty}
                                            onChange={(e) => {
                                              const q = parseFloat(e.target.value) || 0;
                                              setEditingItemState(prev => ({
                                                ...prev,
                                                [stateKey]: { ...editState, qty: q }
                                              }));
                                            }}
                                            className="w-16 px-1.5 py-0.5 text-center font-mono font-bold bg-stone-50 border border-stone-300 rounded text-xs focus:bg-white focus:border-emerald-600 outline-hidden"
                                          />
                                        </td>
                                        <td className="p-2 text-right">
                                          <input
                                            type="number"
                                            min="0"
                                            step="any"
                                            value={editState.unit_price}
                                            onChange={(e) => {
                                              const p = parseFloat(e.target.value) || 0;
                                              setEditingItemState(prev => ({
                                                ...prev,
                                                [stateKey]: { ...editState, unit_price: p }
                                              }));
                                            }}
                                            className="w-20 px-1.5 py-0.5 text-right font-mono font-bold bg-stone-50 border border-stone-300 rounded text-xs focus:bg-white focus:border-emerald-600 outline-hidden"
                                          />
                                        </td>
                                        <td className="p-2 text-right font-mono font-bold text-stone-900">
                                          Rs. {(editState.qty * editState.unit_price).toLocaleString()}
                                        </td>
                                        <td className="p-2 text-center">
                                          <div className="flex items-center justify-center gap-1">
                                            {isDirty && (
                                              <button
                                                type="button"
                                                onClick={() => handleSaveInvoiceItem(it.id, inv.id, editState.qty, editState.unit_price, editState.product_name)}
                                                className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded cursor-pointer"
                                                title="Save edited item name, quantity, price"
                                              >
                                                <Check className="w-3 h-3" />
                                              </button>
                                            )}
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteInvoiceItem(it.id, inv.id)}
                                              className="p-1 text-stone-400 hover:text-red-600 rounded cursor-pointer transition-colors"
                                              title="Remove item from bill"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                              ) : (
                                <div className="p-3 bg-white rounded-xl border border-dashed border-stone-300 text-center text-xs text-stone-500 font-mono">
                                  No items registered in this bill yet. Click below to add an item.
                                </div>
                              )}
                              <div className="p-2 bg-stone-50 border-t border-stone-200 flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => handleAddItemToInvoice(inv.id)}
                                  className="px-2.5 py-1 bg-white hover:bg-emerald-50 border border-stone-300 text-emerald-800 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                                >
                                  <Plus className="w-3.5 h-3.5 text-emerald-600" /> + Add Item to this Bill
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* BOTTOM ACTION BAR: 1-CLICK UNIFIED BILL &amp; KHATA CLEARANCE */}
                <div className="p-3 bg-stone-100 rounded-2xl border border-stone-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="font-bold text-stone-800 block">
                      {periodInvoices.length} Bills in Period • Gross Bills: Rs. {periodInvoices.reduce((s, i) => s + Number(i.total_amount || 0), 0).toLocaleString()}
                    </span>
                    <span className="text-[11px] text-stone-500 font-mono">
                      Current Outstanding Udhaar: <strong>Rs. {selectedCustomer.current_balance.toLocaleString()}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePrintConsolidatedBill}
                      className="px-3.5 py-2 bg-stone-800 hover:bg-stone-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                      title="Print consolidated unified 80mm thermal receipt with all item details"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print Consolidated Bill</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSettleKhataWithConsolidatedBill}
                      disabled={selectedCustomer.current_balance <= 0}
                      className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-sm"
                      title="Clear Khata balance to Rs. 0 and print unified receipt"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>Clear Khata &amp; Print</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            </div>

            <div className="pt-2 flex justify-between items-center border-t border-stone-200 shrink-0">
              <button
                onClick={async () => {
                  if (isGeneratingStatementWA) return;
                  setIsGeneratingStatementWA(true);
                  try {
                    hardwareService.playScanSuccess();
                    await invoicePdfService.generateAndShareKhataStatement(
                      selectedCustomer,
                      storeSettings,
                      customerTransactions,
                      periodInvoices
                    );
                  } catch (e: any) {
                    await posAlert('Error', `Failed to generate statement: ${e.message}`, 'error');
                  } finally {
                    setIsGeneratingStatementWA(false);
                  }
                }}
                disabled={isGeneratingStatementWA}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                title="Generate official A4 Khata Statement PDF and send via WhatsApp"
              >
                {isGeneratingStatementWA ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Opening WhatsApp...</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4" />
                    <span>WhatsApp Statement (A4 PDF)</span>
                  </>
                )}
              </button>

              <button
                onClick={() => setIsLedgerModalOpen(false)}
                className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECEIVE PAYMENT MODAL */}
      {isPayModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 font-sans select-none">
          <div className="bg-white border border-stone-300 rounded-3xl max-w-md w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-sans">
            <div className="bg-emerald-800 text-white px-6 py-4 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-sm tracking-wide">RECEIVE KHATA PAYMENT</h3>
                <p className="text-[11px] text-emerald-200 font-mono">{selectedCustomer.name}</p>
              </div>
              <button onClick={() => setIsPayModalOpen(false)} className="text-emerald-200 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmPayment} className="p-4 sm:p-6 space-y-4 flex-1 min-h-0 overflow-y-auto">
              <div className="p-3 bg-stone-100 rounded-2xl flex justify-between items-center text-xs">
                <span className="text-stone-600">Total Outstanding:</span>
                <span className="font-mono font-bold text-base text-stone-900">
                  Rs. {selectedCustomer.current_balance.toLocaleString()}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Payment Amount Received (Rs.)
                </label>
                <input
                  type="number"
                  min="1"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-lg font-mono font-black text-stone-900 focus:ring-2 focus:ring-emerald-600 outline-hidden text-right"
                  required
                  autoFocus
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-stone-700">Settlement Discount / Waiver (Rs.)</label>
                  <span className="text-[10px] text-stone-500">Authorized by Owner</span>
                </div>
                <input
                  type="number"
                  min="0"
                  value={settlementDiscount || ''}
                  onChange={(e) => setSettlementDiscount(Number(e.target.value) || 0)}
                  placeholder="0 (e.g. Rs. 480 waiver to close bill)"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-mono font-bold outline-hidden text-right text-emerald-700"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Notes / Receipt Reference</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs outline-hidden"
                />
              </div>

              {/* PROJECTED REMAINING BALANCE */}
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex justify-between items-center text-xs">
                <span className="font-bold text-emerald-900">New Balance After Payment:</span>
                <span className="font-mono font-black text-emerald-800">
                  Rs. {Math.max(0, selectedCustomer.current_balance - (Number(payAmount) || 0) - settlementDiscount).toLocaleString()}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setIsPayModalOpen(false)}
                  className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black shadow-md cursor-pointer"
                >
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD CUSTOMER MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 font-sans select-none">
          <div className="bg-white border border-stone-300 rounded-3xl max-w-md w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-sans">
            <div className="bg-[#243338] text-white px-6 py-4 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-sm tracking-wide">REGISTER NEW KHATA CUSTOMER</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-stone-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="p-4 sm:p-6 space-y-4 flex-1 min-h-0 overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Customer Full Name</label>
                <input
                  type="text"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  placeholder="e.g. Haji Muhammad Rafiq"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-[#5B7981] outline-hidden"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">WhatsApp Phone</label>
                  <input
                    type="tel"
                    value={addForm.phone}
                    onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                    placeholder="03005112233"
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-[#5B7981] outline-hidden"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Nickname / Title</label>
                  <input
                    type="text"
                    value={addForm.nickname}
                    onChange={(e) => setAddForm({ ...addForm, nickname: e.target.value })}
                    placeholder="e.g. Contractor"
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Address / Mohalla</label>
                <input
                  type="text"
                  value={addForm.address}
                  onChange={(e) => setAddForm({ ...addForm, address: e.target.value })}
                  placeholder="Street / House #"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Credit Limit (Rs.)</label>
                  <input
                    type="number"
                    min="0"
                    value={addForm.credit_limit}
                    onChange={(e) => setAddForm({ ...addForm, credit_limit: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-mono font-bold outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Opening Balance (Rs.)</label>
                  <input
                    type="number"
                    min="0"
                    value={addForm.opening_balance || ''}
                    onChange={(e) => setAddForm({ ...addForm, opening_balance: Number(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-amber-50/50 border border-amber-300 rounded-xl text-xs font-mono font-bold outline-hidden text-amber-900"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#5B7981] hover:bg-[#486269] text-white rounded-xl text-xs font-black shadow-md cursor-pointer"
                >
                  Register Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADMIN PIN VERIFICATION MODAL FOR CUSTOMER DELETION */}
      <AdminPinPromptModal
        isOpen={isDeletePinOpen}
        onClose={() => {
          setIsDeletePinOpen(false);
          setCustomerToDelete(null);
        }}
        onSuccess={handleConfirmDelete}
        adminPin={localStorage.getItem('pos_admin_pin') || storeSettings.admin_pin || '8888'}
      />

      {/* 1-CLICK CONSOLIDATED KHATA SETTLEMENT RECEIPT MODAL */}
      {completedInvoice && (
        <HighDensityReceiptCard
          invoice={completedInvoice}
          storeSettings={storeSettings}
          onClose={() => setCompletedInvoice(null)}
          shouldAutoPrint={shouldAutoPrintKhataReceipt}
        />
      )}

    </div>
  );
};
