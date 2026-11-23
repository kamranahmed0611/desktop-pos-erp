import React, { useState, useEffect, useRef } from 'react';
import { Supplier, SupplierPaymentChannel, SupplierTransaction } from '../../types';
import { 
  supplierService, 
  CreateSupplierInput, 
  PurchaseItemInput, 
  RecordPurchaseBillInput, 
  RecordPaymentInput,
  LedgerStatement 
} from '../../services/supplierService';
import { catalogService } from '../../services/catalogService';
import { hardwareService } from '../../services/hardwareService';
import { posAlert, posConfirm } from '../../store/uiStore';
import { 
  Truck, Plus, Search, DollarSign, FileText, 
  RotateCcw, X, Check, Building2, Phone, CreditCard,
  Printer, ArrowUpRight, ArrowDownLeft, AlertCircle, 
  Clock, ShieldAlert, Sparkles, Filter, Edit3, Tag, Layers, CheckCircle2, Trash2, Barcode
} from 'lucide-react';
import { StoreSettings } from '../../types';
import { AdminPinPromptModal } from '../common/AdminPinPromptModal';
import { QuickAddItemModal } from '../billing/QuickAddItemModal';

interface SupplierLedgerManagerProps {
  storeSettings?: StoreSettings;
}

export const SupplierLedgerManager: React.FC<SupplierLedgerManagerProps> = ({ storeSettings }) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Modals
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [isParchiReconcileOpen, setIsParchiReconcileOpen] = useState(false);
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);

  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierTransactions, setSupplierTransactions] = useState<SupplierTransaction[]>([]);
  const [reconcileTxn, setReconcileTxn] = useState<SupplierTransaction | null>(null);
  const [reconcileInvoiceNo, setReconcileInvoiceNo] = useState('');
  const [reconcileAmount, setReconcileAmount] = useState<number | ''>('');

  // Delete Supplier State
  const [isDeletePinOpen, setIsDeletePinOpen] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);

  // Add / Edit Supplier Form State
  const [addForm, setAddForm] = useState<CreateSupplierInput>({
    name: '',
    company: '',
    phone: '',
    email: '',
    address: '',
    opening_balance: 0,
    balance_type: 'PAYABLE',
    credit_limit: 100000,
    payment_terms_days: 7
  });

  // Purchase Bill State
  const [billMode, setBillMode] = useState<'QUICK' | 'ITEMIZED'>('QUICK');
  const [billType, setBillType] = useState<'VERIFIED_BILL' | 'PARCHI'>('VERIFIED_BILL');
  const [billInvoiceNo, setBillInvoiceNo] = useState('');
  const [quickGrossAmount, setQuickGrossAmount] = useState<number | ''>('');
  const [quickTaxAmount, setQuickTaxAmount] = useState<number | ''>(0);
  const [quickFreightAmount, setQuickFreightAmount] = useState<number | ''>(0);
  const [quickFreightDeducted, setQuickFreightDeducted] = useState(false);
  const [pendingWapsiAmount, setPendingWapsiAmount] = useState<number>(0);
  const [applyWapsiOffset, setApplyWapsiOffset] = useState<boolean>(false);
  const [advanceDrawdownAmount, setAdvanceDrawdownAmount] = useState<number | ''>('');
  const [billItems, setBillItems] = useState<PurchaseItemInput[]>([]);
  const [billNotes, setBillNotes] = useState('');

  // Barcode Scanning & Live Search in Stock Procurement
  const [procureScanQuery, setProcureScanQuery] = useState('');
  const [procureSuggestions, setProcureSuggestions] = useState<any[]>([]);
  const [procureSelectedIndex, setProcureSelectedIndex] = useState(-1);
  const [procureMultiplier, setProcureMultiplier] = useState<number | null>(null);
  const [isProcureQuickAddOpen, setIsProcureQuickAddOpen] = useState(false);
  const [pendingProcureBarcode, setPendingProcureBarcode] = useState('');
  const procureScanInputRef = useRef<HTMLInputElement>(null);

  // Payment Form State
  const [paymentAmount, setPaymentAmount] = useState<number | ''>('');
  const [settlementDiscount, setSettlementDiscount] = useState<number | ''>(0); // Kasar / Settlement
  const [paymentChannel, setPaymentChannel] = useState<SupplierPaymentChannel>('CASH');
  const [paymentRefNo, setPaymentRefNo] = useState('');
  const [paymentBankName, setPaymentBankName] = useState('Meezan Bank');
  const [paymentChequeDate, setPaymentChequeDate] = useState(new Date().toISOString().slice(0, 10));
  const [isChequePending, setIsChequePending] = useState(false);
  const [deductFromDrawer, setDeductFromDrawer] = useState(true);
  const [paymentNotes, setPaymentNotes] = useState('');

  // Return Claim State (Wapsi / Khorak)
  const [returnAmount, setReturnAmount] = useState<number | ''>('');
  const [returnReason, setReturnReason] = useState('Damaged / Broken Carton');
  const [returnItems, setReturnItems] = useState<{ product_id: string; return_qty: number; product_name?: string }[]>([]);

  // Adjustment State (Khaata Durusti)
  const [adjAmount, setAdjAmount] = useState<number | ''>('');
  const [adjDirection, setAdjDirection] = useState<'DEBIT' | 'CREDIT'>('CREDIT');
  const [adjReason, setAdjReason] = useState('');

  // Advance Deposit State (Peshgi)
  const [advAmount, setAdvAmount] = useState<number | ''>('');
  const [advChannel, setAdvChannel] = useState<SupplierPaymentChannel>('CASH');
  const [advRefNo, setAdvRefNo] = useState('');
  const [advNotes, setAdvNotes] = useState('');

  // Ledger Filter & Statement State
  const [ledgerPeriod, setLedgerPeriod] = useState<'ALL' | 'THIS_MONTH' | 'LAST_MONTH' | 'CUSTOM'>('ALL');
  const [filterStartDate, setFilterStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  );
  const [filterEndDate, setFilterEndDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [periodStatement, setPeriodStatement] = useState<LedgerStatement | null>(null);

  const printAreaRef = useRef<HTMLDivElement>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const supps = await supplierService.getSuppliers();
      const prods = await catalogService.getProducts();
      setSuppliers(supps);
      setAllProducts(prods);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    let unsubElectron: (() => void) | undefined;
    if ((window as any).electronAPI?.onBroadcast) {
      unsubElectron = (window as any).electronAPI.onBroadcast('db-change', () => loadData());
    }
    const handleDbChange = () => loadData();
    window.addEventListener('pos-db-change', handleDbChange);
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'pos_db_sync') loadData();
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      if (unsubElectron) unsubElectron();
      window.removeEventListener('pos-db-change', handleDbChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const searchProcureCatalog = async (q: string) => {
    setProcureScanQuery(q);
    let s = q.trim();
    if (s.includes('*')) {
      s = (s.split('*')[1] || '').trim();
    }
    if (s.length > 1) {
      const results = await catalogService.searchProducts(s, 6);
      setProcureSuggestions(results);
      setProcureSelectedIndex(-1);
    } else {
      setProcureSuggestions([]);
      setProcureSelectedIndex(-1);
    }
  };

  const handleAddProductToProcurement = (prod: any, multiplier: number = 1) => {
    const cost = Number(prod.cost_price || 0);
    const existingIdx = billItems.findIndex(it => it.product_id === prod.id);

    if (existingIdx >= 0) {
      const updated = [...billItems];
      const newBilled = (Number(updated[existingIdx].billed_qty) || 0) + multiplier;
      updated[existingIdx] = {
        ...updated[existingIdx],
        billed_qty: newBilled,
        line_total: newBilled * (Number(updated[existingIdx].unit_cost) || cost)
      };
      setBillItems(updated);
    } else {
      setBillItems(prev => [
        ...prev.filter(it => it.product_id),
        {
          product_id: prod.id,
          product_name: prod.name,
          billed_qty: multiplier,
          scheme_qty: 0,
          unit_cost: cost,
          line_total: multiplier * cost
        }
      ]);
    }

    setProcureScanQuery('');
    setProcureSuggestions([]);
    setProcureSelectedIndex(-1);
    setProcureMultiplier(null);
    hardwareService.playScanSuccess();
    setTimeout(() => procureScanInputRef.current?.focus(), 50);
  };

  const handleProcureScanSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const raw = procureScanQuery.trim();
    if (!raw) return;

    let multiplier = procureMultiplier || 1;
    let codeToSearch = raw;
    if (raw.includes('*')) {
      const parts = raw.split('*');
      const count = parseInt(parts[0], 10);
      if (!isNaN(count) && count > 0) {
        multiplier = count;
        codeToSearch = (parts[1] || '').trim();
      }
    }

    if (!codeToSearch) {
      setProcureMultiplier(multiplier);
      setProcureScanQuery('');
      setProcureSuggestions([]);
      return;
    }

    // 1. Exact match
    try {
      const exact = await catalogService.findByBarcodeOrSku(codeToSearch);
      if (exact) {
        handleAddProductToProcurement(exact, multiplier);
        return;
      }
    } catch {}

    // 2. Selected suggestion
    if (procureSuggestions.length > 0) {
      const selected = (procureSelectedIndex >= 0 && procureSelectedIndex < procureSuggestions.length)
        ? procureSuggestions[procureSelectedIndex]
        : procureSuggestions[0];
      handleAddProductToProcurement(selected, multiplier);
      return;
    }

    // 3. Fallback search
    try {
      const results = await catalogService.searchProducts(codeToSearch, 1);
      if (results && results.length > 0) {
        handleAddProductToProcurement(results[0], multiplier);
        return;
      }
    } catch {}

    // 4. Not found -> prompt Quick Add!
    hardwareService.playNoticeTone();
    const wantAdd = await posConfirm(
      'Product Not Found in Catalog',
      `Barcode or product "${codeToSearch}" is not in the store database.\n\nWould you like to quickly register this item with Quick Add now?`,
      { confirmText: 'Quick Add Product', cancelText: 'Cancel', alertType: 'warning' }
    );
    if (wantAdd) {
      setPendingProcureBarcode(codeToSearch);
      setIsProcureQuickAddOpen(true);
      setProcureScanQuery('');
      setProcureSuggestions([]);
    }
  };

  const handleDeleteSupplierClick = async (supp: Supplier) => {
    if (supp.current_balance !== 0) {
      const balanceStr = supp.current_balance > 0 
        ? `Rs. ${supp.current_balance.toLocaleString()} Payable` 
        : `Rs. ${Math.abs(supp.current_balance).toLocaleString()} Advance`;
      const proceed = await posConfirm(
        'Outstanding Supplier Balance Warning',
        `Supplier "${supp.company}" has an active balance of ${balanceStr}.\n\nDeleting will permanently remove this supplier and all its ledger history.\n\nDo you want to proceed with Admin PIN authorization?`,
        { confirmText: 'Proceed to PIN Verification', cancelText: 'Cancel', alertType: 'warning' }
      );
      if (!proceed) return;
    }
    setSupplierToDelete(supp);
    setIsDeletePinOpen(true);
  };

  const handleConfirmDeleteSupplier = async () => {
    if (!supplierToDelete) return;
    try {
      await supplierService.deleteSupplier(supplierToDelete.id);
      hardwareService.playScanSuccess();
      await posAlert('Supplier Deleted', `Supplier "${supplierToDelete.company}" has been successfully deleted.`, 'success');
      setSupplierToDelete(null);
      setIsDeletePinOpen(false);
      loadData();
      if ((window as any).electronAPI?.broadcastChange) {
        (window as any).electronAPI.broadcastChange('db-change', { type: 'supplier-delete' });
      }
      window.dispatchEvent(new CustomEvent('pos-db-change', { detail: { type: 'supplier-delete' } }));
      localStorage.setItem('pos_db_sync', Date.now().toString());
    } catch (err: any) {
      await posAlert('Delete Failed', `Error: ${err.message}`, 'error');
    }
  };

  // Quick Open Modal Handlers
  const handleOpenPurchase = async (supp: Supplier) => {
    setSelectedSupplier(supp);
    setBillMode('QUICK');
    setBillType('VERIFIED_BILL');
    setBillInvoiceNo(`INV-${Date.now().toString().slice(-6)}`);
    setQuickGrossAmount('');
    setQuickTaxAmount(0);
    setQuickFreightAmount(0);
    setQuickFreightDeducted(false);
    setBillItems([]);
    setBillNotes('');
    setApplyWapsiOffset(false);
    setProcureScanQuery('');
    setProcureSuggestions([]);
    setProcureMultiplier(null);

    try {
      const txns = await supplierService.getSupplierTransactions(supp.id);
      const wapsi = txns.filter(t => t.type === 'RETURN_CLAIM').reduce((acc, t) => acc + (t.amount || 0), 0);
      setPendingWapsiAmount(wapsi);
    } catch {
      setPendingWapsiAmount(0);
    }

    const availableAdvance = (supp.balance_type === 'ADVANCE_PREPAID' || supp.balance_type === 'ADVANCE' || supp.current_balance < 0)
      ? Math.abs(supp.current_balance)
      : 0;
    setAdvanceDrawdownAmount(availableAdvance > 0 ? availableAdvance : '');

    setIsPurchaseModalOpen(true);
    setTimeout(() => procureScanInputRef.current?.focus(), 60);
  };

  const handleOpenPay = (supp: Supplier) => {
    setSelectedSupplier(supp);
    setPaymentAmount(Math.max(0, supp.current_balance));
    setSettlementDiscount(0);
    setPaymentChannel('CASH');
    setPaymentRefNo('');
    setPaymentBankName('Meezan Bank');
    setPaymentChequeDate(new Date().toISOString().slice(0, 10));
    setIsChequePending(false);
    setDeductFromDrawer(true);
    setPaymentNotes('');
    setIsPayModalOpen(true);
  };

  const handleOpenReturn = (supp: Supplier) => {
    setSelectedSupplier(supp);
    setReturnAmount('');
    setReturnReason('Damaged / Expired Stock');
    setReturnItems([]);
    setIsReturnModalOpen(true);
  };

  const handleOpenLedger = async (supp: Supplier) => {
    setSelectedSupplier(supp);
    setLedgerPeriod('ALL');
    const txns = await supplierService.getSupplierTransactions(supp.id);
    setSupplierTransactions(txns);
    setIsLedgerModalOpen(true);
    loadPeriodStatement(supp.id, '2020-01-01', new Date().toISOString().slice(0, 10));
  };

  const loadPeriodStatement = async (suppId: string, start: string, end: string) => {
    try {
      const stmt = await supplierService.getLedgerStatement(suppId, start, end);
      setPeriodStatement(stmt);
    } catch (e) {
      console.warn('Error loading statement:', e);
    }
  };

  const handleOpenAdjustment = (supp: Supplier) => {
    setSelectedSupplier(supp);
    setAdjAmount('');
    setAdjDirection('CREDIT');
    setAdjReason('');
    setIsAdjustmentModalOpen(true);
  };

  const handleOpenAdvance = (supp: Supplier) => {
    setSelectedSupplier(supp);
    setAdvAmount('');
    setAdvChannel('CASH');
    setAdvRefNo('');
    setAdvNotes('');
    setIsAdvanceModalOpen(true);
  };

  const handleOpenReconcile = (txn: SupplierTransaction) => {
    setReconcileTxn(txn);
    setReconcileInvoiceNo(txn.invoice_no || '');
    setReconcileAmount(txn.debit_amount || txn.amount);
    setIsParchiReconcileOpen(true);
  };

  // Submit Handlers
  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.company.trim() || !addForm.phone.trim()) {
      await posAlert('Missing Information', 'Please enter supplier company name and phone number.', 'warning');
      return;
    }
    try {
      await supplierService.createSupplier(addForm);
      hardwareService.playScanSuccess();
      setIsAddSupplierOpen(false);
      setAddForm({
        name: '',
        company: '',
        phone: '',
        email: '',
        address: '',
        opening_balance: 0,
        balance_type: 'PAYABLE',
        credit_limit: 100000,
        payment_terms_days: 7
      });
      loadData();
      await posAlert('Supplier Added', 'New vendor khata created successfully.', 'success');
    } catch (err: any) {
      await posAlert('Creation Error', err.message, 'error');
    }
  };

  const handleConfirmPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier) return;

    let totalAmount = 0;
    if (billMode === 'QUICK') {
      const gross = Number(quickGrossAmount) || 0;
      const tax = Number(quickTaxAmount) || 0;
      const freight = Number(quickFreightAmount) || 0;
      // If freight deducted from bill: net = gross + tax - freight, else net = gross + tax
      totalAmount = quickFreightDeducted ? (gross + tax - freight) : (gross + tax);
      if (totalAmount <= 0) {
        await posAlert('Invalid Amount', 'Please enter a valid bill amount.', 'warning');
        return;
      }
    } else {
      totalAmount = billItems.reduce((sum, it) => sum + (Number(it.billed_qty) * Number(it.unit_cost)), 0);
      if (totalAmount <= 0) {
        await posAlert('Invalid Items', 'Please enter valid items with billed quantities and unit costs.', 'warning');
        return;
      }
    }

    const wapsiOffset = applyWapsiOffset ? Math.min(pendingWapsiAmount, totalAmount) : 0;

    try {
      await supplierService.recordPurchaseBill({
        supplier_id: selectedSupplier.id,
        invoice_no: billInvoiceNo,
        bill_type: billType,
        gross_amount: billMode === 'QUICK' ? (Number(quickGrossAmount) || totalAmount) : totalAmount,
        tax_amount: billMode === 'QUICK' ? Number(quickTaxAmount) : 0,
        freight_amount: billMode === 'QUICK' ? Number(quickFreightAmount) : 0,
        freight_deducted_from_bill: quickFreightDeducted,
        total_bill_amount: totalAmount,
        wapsi_offset_amount: wapsiOffset,
        advance_drawdown_amount: typeof advanceDrawdownAmount === 'number' ? advanceDrawdownAmount : undefined,
        is_quick_lump_sum: billMode === 'QUICK',
        items: billMode === 'ITEMIZED' ? billItems : undefined,
        notes: billNotes
      });
      hardwareService.playScanSuccess();
      setIsPurchaseModalOpen(false);
      loadData();
      await posAlert(
        billType === 'PARCHI' ? 'Parchi Logged' : 'Bill Recorded', 
        `Rs. ${totalAmount.toLocaleString()} added to ${selectedSupplier.company}'s khata.`, 
        'success'
      );
    } catch (err: any) {
      await posAlert('Purchase Bill Error', err.message, 'error');
    }
  };

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier) return;

    const amountPaid = Number(paymentAmount) || 0;
    const kasar = Number(settlementDiscount) || 0;
    const totalCredit = amountPaid + kasar;

    if (totalCredit <= 0) {
      await posAlert('Invalid Payment', 'Please enter payment amount or settlement discount.', 'warning');
      return;
    }

    try {
      await supplierService.recordPayment({
        supplier_id: selectedSupplier.id,
        amount: amountPaid,
        settlement_discount: kasar,
        channel: paymentChannel,
        bank_name: paymentBankName,
        ref_no: paymentRefNo,
        cheque_date: paymentChequeDate,
        cheque_status: isChequePending ? 'PENDING_CLEARANCE' : 'CLEARED',
        deduct_from_drawer: deductFromDrawer && (paymentChannel === 'CASH' || paymentChannel === 'CASH_SAFE'),
        notes: paymentNotes
      });
      hardwareService.playCheckoutChime();
      setIsPayModalOpen(false);
      loadData();
      await posAlert(
        'Payment Recorded', 
        `Paid Rs. ${amountPaid.toLocaleString()}${kasar > 0 ? ` + Settlement Rs. ${kasar.toLocaleString()}` : ''} cleared from ${selectedSupplier.company}'s balance.`, 
        'success'
      );
    } catch (err: any) {
      await posAlert('Payment Error', err.message, 'error');
    }
  };

  const handleConfirmReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier) return;
    const retAmt = Number(returnAmount) || 0;
    if (retAmt <= 0) {
      await posAlert('Invalid Amount', 'Please enter a valid return claim amount.', 'warning');
      return;
    }
    try {
      await supplierService.recordReturnClaim(
        selectedSupplier.id,
        retAmt,
        returnItems,
        `${returnReason}${paymentNotes ? ` - ${paymentNotes}` : ''}`
      );
      hardwareService.playScanSuccess();
      setIsReturnModalOpen(false);
      loadData();
      await posAlert('Return Claim Recorded', `Rs. ${retAmt.toLocaleString()} credited to ${selectedSupplier.company}'s khata.`, 'success');
    } catch (err: any) {
      await posAlert('Return Claim Error', err.message, 'error');
    }
  };

  const handleConfirmAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier) return;
    const amount = Number(adjAmount) || 0;
    if (amount <= 0 || !adjReason.trim()) {
      await posAlert('Missing Information', 'Please enter a valid adjustment amount and mandatory audit reason.', 'warning');
      return;
    }
    try {
      await supplierService.recordAdjustment(selectedSupplier.id, amount, adjDirection, adjReason);
      hardwareService.playScanSuccess();
      setIsAdjustmentModalOpen(false);
      loadData();
      if (isLedgerModalOpen) {
        handleOpenLedger(selectedSupplier);
      }
      await posAlert('Khaata Durusti Recorded', `Audit adjustment of Rs. ${amount.toLocaleString()} posted.`, 'success');
    } catch (err: any) {
      await posAlert('Adjustment Error', err.message, 'error');
    }
  };

  const handleConfirmAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier) return;
    const amount = Number(advAmount) || 0;
    if (amount <= 0) {
      await posAlert('Invalid Amount', 'Please enter advance amount.', 'warning');
      return;
    }
    try {
      await supplierService.recordAdvanceDeposit(selectedSupplier.id, amount, advChannel, advRefNo, advNotes);
      hardwareService.playCheckoutChime();
      setIsAdvanceModalOpen(false);
      loadData();
      await posAlert('Advance Deposit Logged', `Peshgi of Rs. ${amount.toLocaleString()} recorded.`, 'success');
    } catch (err: any) {
      await posAlert('Advance Error', err.message, 'error');
    }
  };

  const handleConfirmReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reconcileTxn) return;
    const amount = Number(reconcileAmount) || 0;
    if (amount <= 0 || !reconcileInvoiceNo.trim()) {
      await posAlert('Invalid Information', 'Please enter verified invoice # and amount.', 'warning');
      return;
    }
    try {
      await supplierService.reconcileParchiToBill(
        reconcileTxn.id,
        reconcileInvoiceNo,
        amount
      );
      hardwareService.playScanSuccess();
      setIsParchiReconcileOpen(false);
      loadData();
      if (selectedSupplier) {
        handleOpenLedger(selectedSupplier);
      }
      await posAlert('Parchi Reconciled', `Parchi #${reconcileTxn.invoice_no} converted to official bill #${reconcileInvoiceNo}.`, 'success');
    } catch (err: any) {
      await posAlert('Reconcile Error', err.message, 'error');
    }
  };

  const handleClearCheque = async (txnId: string) => {
    const ok = await posConfirm('Clear Cheque', 'Confirm that this cheque has cleared in your bank account? It will deduct from the supplier balance.');
    if (ok) {
      try {
        await supplierService.clearCheque(txnId);
        hardwareService.playCheckoutChime();
        loadData();
        if (selectedSupplier) {
          handleOpenLedger(selectedSupplier);
        }
        await posAlert('Cheque Cleared', 'Cheque marked as cleared and ledger updated.', 'success');
      } catch (err: any) {
        await posAlert('Error', err.message, 'error');
      }
    }
  };

  const syncSupplierChanges = (detailType: string) => {
    if ((window as any).electronAPI?.broadcastChange) {
      (window as any).electronAPI.broadcastChange('db-change', { type: detailType });
    }
    window.dispatchEvent(new CustomEvent('pos-db-change', { detail: { type: detailType } }));
    localStorage.setItem('pos_db_sync', Date.now().toString());
  };

  const handlePrintLedger = () => {
    if (!selectedSupplier) return;
    const txns = periodStatement?.transactions || supplierTransactions;
    const openingBal = periodStatement?.opening_balance ?? selectedSupplier.current_balance;
    const closingBal = periodStatement?.closing_balance ?? selectedSupplier.current_balance;
    const totalDebits = periodStatement?.total_debits ?? txns.reduce((s, t) => s + (t.debit_amount || 0), 0);
    const totalCredits = periodStatement?.total_credits ?? txns.reduce((s, t) => s + (t.credit_amount || 0), 0);
    const totalSettlement = periodStatement?.total_settlement ?? txns.reduce((s, t) => s + (t.settlement_discount || 0), 0);

    const printWin = window.open('', '_blank', 'width=850,height=900');
    if (!printWin) {
      window.print();
      return;
    }

    const rowsHtml = txns.map(t => `
      <tr>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e5e5e5; font-size: 11px;">${new Date(t.created_at).toLocaleDateString('en-PK')}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e5e5e5; font-size: 11px;">
          ${t.invoice_no ? '<strong>' + t.invoice_no + '</strong> • ' : ''}${t.notes || t.type}
        </td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e5e5e5; text-align: right; font-weight: bold; color: #b91c1c; font-size: 11px;">
          ${t.debit_amount > 0 ? 'Rs. ' + Number(t.debit_amount).toLocaleString() : '-'}
        </td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e5e5e5; text-align: right; font-weight: bold; color: #047857; font-size: 11px;">
          ${t.credit_amount > 0 ? 'Rs. ' + Number(t.credit_amount).toLocaleString() : '-'}
        </td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e5e5e5; text-align: right; color: #b45309; font-size: 11px;">
          ${(t.settlement_discount || 0) > 0 ? 'Rs. ' + Number(t.settlement_discount).toLocaleString() : '-'}
        </td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e5e5e5; text-align: right; font-weight: bold; font-size: 11px;">
          Rs. ${Number(t.balance_after || 0).toLocaleString()}
        </td>
      </tr>
    `).join('');

    const storeTitle = storeSettings?.store_name || 'POINT OF SALE';
    const storeAddr = storeSettings?.address || 'Shop # 1, Main Market, Pakistan';
    const storePhone = storeSettings?.phone || '';

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Supplier Statement - ${selectedSupplier.company}</title>
          <style>
            @page { margin: 12mm; size: A4 portrait; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1c1917; margin: 0; padding: 12px; font-size: 12px; line-height: 1.35; }
            .header { text-align: center; border-bottom: 2px solid #243338; padding-bottom: 8px; margin-bottom: 12px; }
            .header h1 { margin: 0; font-size: 20px; font-weight: 900; color: #243338; letter-spacing: 0.5px; }
            .header p { margin: 2px 0; font-size: 11px; color: #57534e; }
            .sub-title { font-size: 13px; font-weight: 800; text-transform: uppercase; margin-top: 6px; letter-spacing: 1px; color: #0f172a; }
            .meta-box { display: flex; justify-content: space-between; background: #f5f5f4; border: 1px solid #e7e5e4; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 11px; }
            .opening-banner { background: #fafaf9; border-left: 4px solid #5B7981; padding: 6px 10px; margin-bottom: 10px; font-weight: bold; display: flex; justify-content: space-between; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
            th { background: #243338; color: #ffffff; padding: 7px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
            .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 10px; margin-bottom: 25px; }
            .summary-card { background: #f5f5f4; border: 1px solid #e7e5e4; border-radius: 6px; padding: 6px 8px; text-align: center; }
            .summary-card span { display: block; font-size: 9px; text-transform: uppercase; color: #78716c; font-weight: bold; }
            .summary-card strong { display: block; font-size: 13px; font-family: monospace; font-weight: 900; margin-top: 2px; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; padding-top: 10px; font-size: 11px; }
            .sign-line { border-top: 1px solid #444; padding-top: 4px; text-align: center; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${storeTitle}</h1>
            <p>${storeAddr} • Ph: ${storePhone}</p>
            <div class="sub-title">SUPPLIER STATEMENT OF ACCOUNT / کھاتہ اسٹیٹمنٹ</div>
          </div>

          <div class="meta-box">
            <div>
              <strong>Distributor / Supplier:</strong> ${selectedSupplier.company} (${selectedSupplier.name})<br/>
              <strong>Contact:</strong> ${selectedSupplier.phone || 'N/A'} ${selectedSupplier.address ? ' • ' + selectedSupplier.address : ''}
            </div>
            <div style="text-align: right;">
              <strong>Statement Period:</strong> ${filterStartDate} to ${filterEndDate}<br/>
              <strong>Date Generated:</strong> ${new Date().toLocaleDateString('en-PK')}
            </div>
          </div>

          <div class="opening-banner">
            <span>SABQA BAQAYA (Opening Balance as of ${filterStartDate}):</span>
            <span style="color: ${openingBal > 0 ? '#b91c1c' : '#047857'}; font-size: 13px; font-family: monospace;">
              Rs. ${Number(openingBal).toLocaleString()} ${openingBal > 0 ? 'Payable (واجب الادا)' : 'Advance (پیشگی)'}
            </span>
          </div>

          <table>
            <thead>
              <tr>
                <th style="text-align: left; width: 15%;">Date</th>
                <th style="text-align: left; width: 35%;">Description & Invoice #</th>
                <th style="text-align: right; width: 13%;">Debit / Kharid (+)</th>
                <th style="text-align: right; width: 13%;">Credit / Paid (-)</th>
                <th style="text-align: right; width: 11%;">Settlement (کسر)</th>
                <th style="text-align: right; width: 13%;">Balance</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="6" style="padding: 16px; text-align: center; color: #888;">No transactions found in this period.</td></tr>'}
            </tbody>
          </table>

          <div class="summary-grid">
            <div class="summary-card">
              <span>Total Kharid (Debits)</span>
              <strong style="color: #b91c1c;">Rs. ${Number(totalDebits).toLocaleString()}</strong>
            </div>
            <div class="summary-card">
              <span>Total Paid (Credits)</span>
              <strong style="color: #047857;">Rs. ${Number(totalCredits).toLocaleString()}</strong>
            </div>
            <div class="summary-card">
              <span>Settlement (Kasar)</span>
              <strong style="color: #b45309;">Rs. ${Number(totalSettlement).toLocaleString()}</strong>
            </div>
            <div class="summary-card" style="background: #e2e8f0; border-color: #cbd5e1;">
              <span>Closing Baqaya</span>
              <strong style="color: ${closingBal > 0 ? '#b91c1c' : '#047857'};">
                Rs. ${Number(closingBal).toLocaleString()}
              </strong>
            </div>
          </div>

          <div class="signatures">
            <div class="sign-line">
              Store Owner / Manager Signature<br/>
              <span style="font-size: 9px; font-weight: normal; color: #666;">${storeTitle}</span>
            </div>
            <div class="sign-line">
              Supplier / Representative Signature<br/>
              <span style="font-size: 9px; font-weight: normal; color: #666;">${selectedSupplier.company}</span>
            </div>
          </div>
        </body>
      </html>
    `);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => {
      try {
        printWin.print();
      } catch {}
    }, 250);
  };

  const handlePrint80mmSupplierStatement = () => {
    if (!selectedSupplier) return;
    const txns = periodStatement?.transactions || supplierTransactions;
    const openingBal = periodStatement?.opening_balance ?? selectedSupplier.current_balance;
    const closingBal = periodStatement?.closing_balance ?? selectedSupplier.current_balance;
    const totalDebits = periodStatement?.total_debits ?? txns.reduce((s, t) => s + (t.debit_amount || 0), 0);
    const totalCredits = periodStatement?.total_credits ?? txns.reduce((s, t) => s + (t.credit_amount || 0), 0);
    const totalSettlement = periodStatement?.total_settlement ?? txns.reduce((s, t) => s + (t.settlement_discount || 0), 0);

    let slip = `========================================\n`;
    slip += `            ${(storeSettings?.store_name || 'POINT OF SALE').toUpperCase()}              \n`;
    slip += `   ${storeSettings?.address || 'Main Market, Pakistan'}  \n`;
    slip += `        SUPPLIER STATEMENT SLIP         \n`;
    slip += `========================================\n`;
    slip += `Distributor: ${selectedSupplier.company}\n`;
    slip += `Period: ${filterStartDate} to ${filterEndDate}\n`;
    slip += `Date: ${new Date().toLocaleDateString('en-PK')}\n`;
    slip += `----------------------------------------\n`;
    slip += `SABQA BAQAYA: Rs. ${Number(openingBal).toLocaleString()}\n`;
    slip += `----------------------------------------\n`;
    slip += `DATE   | REF/DESC        | AMOUNT       \n`;
    slip += `----------------------------------------\n`;
    txns.forEach(t => {
      const d = new Date(t.created_at);
      const dStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      const desc = (t.invoice_no || t.notes || t.type).slice(0, 16);
      const amt = t.debit_amount > 0 ? `+${t.debit_amount}` : `-${t.credit_amount}`;
      slip += `${dStr} | ${desc.padEnd(16)} | ${amt}\n`;
    });
    slip += `----------------------------------------\n`;
    slip += `TOTAL PURCHASES (+): Rs. ${Number(totalDebits).toLocaleString()}\n`;
    slip += `TOTAL PAYMENTS  (-): Rs. ${Number(totalCredits).toLocaleString()}\n`;
    if (totalSettlement > 0) {
      slip += `KASAR / DISCOUNT   : Rs. ${Number(totalSettlement).toLocaleString()}\n`;
    }
    slip += `========================================\n`;
    slip += `CLOSING BAQAYA: Rs. ${Number(closingBal).toLocaleString()} ${closingBal > 0 ? 'PAYABLE' : 'ADVANCE'}\n`;
    slip += `----------------------------------------\n`;
    slip += `Developed and maintained by Teddops\n`;
    slip += `+923297263098 • +923235930559\n`;
    slip += `========================================\n\n`;

    hardwareService.printDirectThermal(slip);
  };

  // Metrics
  const totalPayable = suppliers.reduce((sum, s) => sum + (s.current_balance > 0 ? s.current_balance : 0), 0);
  const totalAdvance = suppliers.reduce((sum, s) => sum + (s.current_balance < 0 ? Math.abs(s.current_balance) : 0), 0);

  const filteredSuppliers = suppliers.filter(s => {
    const q = searchQuery.toLowerCase().trim();
    return !q || 
      s.company.toLowerCase().includes(q) || 
      s.name.toLowerCase().includes(q) || 
      s.phone?.toLowerCase().includes(q);
  });

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5 font-sans">
      
      {/* HEADER BANNER WITH LOCAL BAHI-KHATA BRANDING */}
      <div className="bg-[#243338] text-white p-5 rounded-3xl shadow-lg border border-stone-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-[#5B7981] text-[#E3D5C0] rounded-md text-[10px] font-black uppercase tracking-wider">
              BAHI-KHATA SYSTEM • بہی کھاتہ
            </span>
            <span className="text-xs text-stone-300">Point of Sale • Wholesale &amp; Distributor Ledger</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black font-heading tracking-tight flex items-center gap-2.5 mt-1">
            <Truck className="w-6 h-6 text-[#E3D5C0]" /> SUPPLIER &amp; DISTRIBUTOR KHATA
          </h1>
          <p className="text-xs text-stone-300 mt-0.5">
            Running Balance (سابقہ و بقایا), Settlement/Kasar (کسر), Katchi Parchi vs Pakka Bill, &amp; Stock Procurement
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setIsAddSupplierOpen(true)}
            className="px-4 py-2.5 bg-[#5B7981] hover:bg-[#486269] text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 cursor-pointer transition-all active:scale-98"
          >
            <Plus className="w-4 h-4" /> Add Vendor / نیا سپلائر
          </button>
        </div>
      </div>

      {/* FINANCIAL SUMMARY TILES */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wide block">
              Total Outstanding Payable (کل واجب الادا)
            </span>
            <span className="text-2xl font-black font-mono text-red-600">
              Rs. {totalPayable.toLocaleString()}
            </span>
            <span className="text-[10px] text-stone-400 block mt-0.5">Money owed across all distributors</span>
          </div>
          <div className="p-3 bg-red-50 text-red-700 rounded-2xl">
            <ArrowUpRight className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wide block">
              Total Advance Credit (پیشگی ادائیگیاں)
            </span>
            <span className="text-2xl font-black font-mono text-emerald-600">
              Rs. {totalAdvance.toLocaleString()}
            </span>
            <span className="text-[10px] text-stone-400 block mt-0.5">Deposit held with suppliers</span>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-700 rounded-2xl">
            <ArrowDownLeft className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wide block">
              Active Suppliers / رجسٹرڈ سپلائر
            </span>
            <span className="text-2xl font-black font-mono text-stone-900">
              {suppliers.length}
            </span>
            <span className="text-[10px] text-stone-400 block mt-0.5">Nestle, Unilever, Rice, Sugar, Oil</span>
          </div>
          <div className="p-3 bg-stone-100 text-stone-700 rounded-2xl">
            <Building2 className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* SEARCH BAR */}
      <div className="relative">
        <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search supplier by company, contact person, or phone (e.g. Unilever, Nestle, 0300...)"
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-stone-300 focus:border-[#5B7981] rounded-2xl text-xs font-bold outline-hidden shadow-2xs"
        />
      </div>

      {/* SUPPLIER CARDS LIST */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSuppliers.length === 0 ? (
          <div className="col-span-full py-16 text-center text-stone-400 bg-white rounded-3xl border border-stone-200 space-y-2">
            <Truck className="w-10 h-10 mx-auto text-stone-300" />
            <p className="text-xs font-bold">No suppliers found matching your query.</p>
            <button
              onClick={() => setIsAddSupplierOpen(true)}
              className="text-xs text-[#5B7981] font-bold hover:underline"
            >
              + Add First Vendor
            </button>
          </div>
        ) : (
          filteredSuppliers.map((supp) => {
            const isPayable = supp.current_balance > 0;
            const isAdvance = supp.current_balance < 0;
            const isOverLimit = supp.credit_limit && supp.current_balance > supp.credit_limit;

            return (
              <div
                key={supp.id}
                className="bg-white border border-stone-200 hover:border-stone-400 rounded-3xl p-5 shadow-xs transition-all space-y-3.5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-black text-sm text-stone-900 leading-tight">
                        {supp.company}
                      </h3>
                      <span className="text-xs text-stone-500 font-bold block mt-0.5">
                        {supp.name} {supp.phone ? `• ${supp.phone}` : ''}
                      </span>
                    </div>

                    <span className={`px-2.5 py-1 rounded-xl text-xs font-black font-mono ${
                      isPayable ? 'bg-red-50 text-red-700 border border-red-200' :
                      isAdvance ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      'bg-stone-100 text-stone-700'
                    }`}>
                      {isPayable ? `Rs. ${supp.current_balance.toLocaleString()} Payable` :
                       isAdvance ? `Rs. ${Math.abs(supp.current_balance).toLocaleString()} Advance` :
                       'NIL Balance (0)'}
                    </span>
                  </div>

                  {supp.address && (
                    <p className="text-[11px] text-stone-400 truncate mt-1">
                      📍 {supp.address}
                    </p>
                  )}

                  <div className="flex items-center gap-2 pt-2 border-t border-stone-100 text-[10px] text-stone-500 font-mono">
                    <span>Credit Term: {supp.payment_terms_days || 7} Days</span>
                    {supp.credit_limit ? (
                      <span className={isOverLimit ? 'text-red-600 font-bold' : ''}>
                        • Limit: Rs. {supp.credit_limit.toLocaleString()}
                        {isOverLimit && ' ⚠️ Exceeded!'}
                      </span>
                    ) : null}
                  </div>
                </div>

                  {/* ACTION BUTTONS */}
                  <div className="pt-2 border-t border-stone-100 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleOpenPurchase(supp)}
                        className="px-2.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                        title="Enter New Purchase Bill or Parchi"
                      >
                        <Plus className="w-3.5 h-3.5 text-[#5B7981]" />
                        <span>+ New Bill (بل)</span>
                      </button>

                      <button
                        onClick={() => handleOpenPay(supp)}
                        className="px-2.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                        title="Make Payment with Settlement"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>Pay (ادائیگی)</span>
                      </button>

                      <button
                        onClick={() => handleOpenReturn(supp)}
                        className="px-2.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                        title="Log Damaged / Expired Return Claim"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Return (واپسی)</span>
                      </button>

                      <button
                        onClick={() => handleOpenLedger(supp)}
                        className="px-2.5 py-2 bg-[#243338] hover:bg-[#1a2529] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-xs"
                        title="View Full Bahi-Khata Ledger"
                      >
                        <FileText className="w-3.5 h-3.5 text-[#E3D5C0]" />
                        <span>Khata (کھاتہ)</span>
                      </button>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => handleDeleteSupplierClick(supp)}
                        className="p-1 text-stone-400 hover:text-red-600 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                        title="Delete Supplier Record [Admin PIN Protected]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Supplier</span>
                      </button>
                    </div>
                  </div>
              </div>
            );
          })
        )}
      </div>

      {/* ======================================================== */}
      {/* 1. ADD / EDIT SUPPLIER MODAL */}
      {/* ======================================================== */}
      {isAddSupplierOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 font-sans select-none">
          <div className="bg-white border border-stone-300 rounded-3xl max-w-lg w-full shadow-2xl p-4 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto font-sans">
            <div className="flex justify-between items-center border-b border-stone-200 pb-3">
              <div>
                <h3 className="font-black text-sm text-stone-900 uppercase tracking-wide">
                  REGISTER NEW VENDOR / سپلائر رجسٹریشن
                </h3>
                <span className="text-[11px] text-stone-500">Unilever, Nestle, Rice Mandi, Dairy Supply</span>
              </div>
              <button onClick={() => setIsAddSupplierOpen(false)} className="text-stone-400 hover:text-stone-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-700 font-bold mb-1">Company / Agency Name *</label>
                  <input
                    type="text"
                    value={addForm.company}
                    onChange={(e) => setAddForm({ ...addForm, company: e.target.value })}
                    placeholder="e.g. Nestle Pakistan Ltd"
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl font-bold outline-hidden focus:border-[#5B7981]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-stone-700 font-bold mb-1">Contact Person / Order Booker</label>
                  <input
                    type="text"
                    value={addForm.name}
                    onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                    placeholder="e.g. Aslam Khan (Sales Rep)"
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl outline-hidden focus:border-[#5B7981]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-700 font-bold mb-1">Phone / WhatsApp Number *</label>
                  <input
                    type="text"
                    value={addForm.phone}
                    onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                    placeholder="e.g. 0300-1234567"
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl font-mono outline-hidden focus:border-[#5B7981]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-stone-700 font-bold mb-1">Email (Optional)</label>
                  <input
                    type="email"
                    value={addForm.email}
                    onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                    placeholder="orders@distributor.com"
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-stone-700 font-bold mb-1">Warehouse / Depot Address</label>
                <input
                  type="text"
                  value={addForm.address}
                  onChange={(e) => setAddForm({ ...addForm, address: e.target.value })}
                  placeholder="e.g. I-9 Industrial Area, Islamabad"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl outline-hidden"
                />
              </div>

              {/* OPENING BALANCE & SABQA BAQAYA SETUP */}
              <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-2xl space-y-2.5">
                <span className="text-[11px] font-black uppercase text-stone-800 block">
                  Sabqa Baqaya / سابقہ بقایا (Initial Balance)
                </span>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-stone-500 font-bold mb-1">Balance Direction</label>
                    <select
                      value={addForm.balance_type}
                      onChange={(e) => setAddForm({ ...addForm, balance_type: e.target.value as any })}
                      className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-xl font-bold outline-hidden"
                    >
                      <option value="POST_DELIVERY_CREDIT">Post-Delivery Credit (Udhaar / پکا ادھار کھاتہ)</option>
                      <option value="ADVANCE_PREPAID">Prepaid Advance Wallet (Peshgi / پیشگی ادائیگیاں)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] text-stone-500 font-bold mb-1">Amount (Rs.)</label>
                    <input
                      type="number"
                      min="0"
                      value={addForm.opening_balance || ''}
                      onChange={(e) => setAddForm({ ...addForm, opening_balance: Number(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-xl font-mono font-bold outline-hidden"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-700 font-bold mb-1">Credit Limit (Rs.)</label>
                  <input
                    type="number"
                    min="0"
                    value={addForm.credit_limit || ''}
                    onChange={(e) => setAddForm({ ...addForm, credit_limit: Number(e.target.value) || 0 })}
                    placeholder="100000"
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl font-mono outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-stone-700 font-bold mb-1">Payment Term (Days)</label>
                  <input
                    type="number"
                    min="1"
                    value={addForm.payment_terms_days || ''}
                    onChange={(e) => setAddForm({ ...addForm, payment_terms_days: Number(e.target.value) || 7 })}
                    placeholder="7"
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl font-mono outline-hidden"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setIsAddSupplierOpen(false)}
                  className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#5B7981] hover:bg-[#486269] text-white rounded-xl font-black shadow-md cursor-pointer"
                >
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. NEW PROCUREMENT BILL / PARCHI MODAL (FLEXIBLE MODE) */}
      {/* ======================================================== */}
      {isPurchaseModalOpen && selectedSupplier && (
        <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white border border-stone-300 rounded-3xl max-w-2xl w-full shadow-2xl p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-stone-200 pb-3">
              <div>
                <h3 className="font-black text-sm text-stone-900 uppercase tracking-wide">
                  RECORD STOCK PROCUREMENT / خریداری و بل اندراج
                </h3>
                <span className="text-[11px] text-[#5B7981] font-bold">
                  {selectedSupplier.company} (Current Balance: Rs. {selectedSupplier.current_balance.toLocaleString()})
                </span>
              </div>
              <button onClick={() => setIsPurchaseModalOpen(false)} className="text-stone-400 hover:text-stone-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmPurchase} className="space-y-4 text-xs">
              
              {/* PENDING WAPSI CREDIT BANNER */}
              {pendingWapsiAmount > 0 && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-blue-700 shrink-0" />
                    <div>
                      <span className="font-bold text-blue-950 text-xs block">
                        Pending Wapsi Credit: Rs. {pendingWapsiAmount.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-blue-700">
                        {applyWapsiOffset 
                          ? 'Offset applied directly against this delivery bill.' 
                          : 'Click to apply this return credit against delivery payable.'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setApplyWapsiOffset(prev => !prev)}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer transition-all ${
                      applyWapsiOffset ? 'bg-blue-700 text-white shadow-xs' : 'bg-white hover:bg-blue-100 text-blue-800 border border-blue-300'
                    }`}
                  >
                    {applyWapsiOffset ? 'Wapsi Offset Applied' : '+ Apply Offset'}
                  </button>
                </div>
              )}

              {/* ADVANCE EXHAUSTED WARNING BANNER */}
              {(selectedSupplier.balance_type === 'ADVANCE_PREPAID' || selectedSupplier.balance_type === 'ADVANCE' || selectedSupplier.current_balance < 0) && (
                Math.abs(selectedSupplier.current_balance) < ((billMode === 'QUICK' ? (Number(quickGrossAmount) || 0) : billItems.reduce((acc, it) => acc + (it.line_total || 0), 0))) && (
                  <div className="p-3 bg-amber-50 border border-amber-300 rounded-2xl flex items-center gap-2.5 text-amber-900">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                    <div className="text-xs">
                      <span className="font-bold block">Advance Exhausted Warning</span>
                      <span className="text-[11px] text-amber-800">
                        Delivery bill exceeds available prepaid advance of Rs. {Math.abs(selectedSupplier.current_balance).toLocaleString()}. An outstanding payable debt will be created.
                      </span>
                    </div>
                  </div>
                )
              )}

              {/* BILL MODE & STATUS TOGGLES */}
              <div className="grid grid-cols-2 gap-3 p-1.5 bg-stone-100 rounded-2xl">
                <div>
                  <span className="text-[10px] font-bold text-stone-500 uppercase block mb-1">Entry Style:</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setBillMode('QUICK')}
                      className={`flex-1 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                        billMode === 'QUICK' ? 'bg-[#5B7981] text-white shadow-xs' : 'bg-white text-stone-700'
                      }`}
                    >
                      Quick Lump-Sum
                    </button>
                    <button
                      type="button"
                      onClick={() => setBillMode('ITEMIZED')}
                      className={`flex-1 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                        billMode === 'ITEMIZED' ? 'bg-[#5B7981] text-white shadow-xs' : 'bg-white text-stone-700'
                      }`}
                    >
                      Itemized Stock
                    </button>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-stone-500 uppercase block mb-1">Bill Type / حیثیت:</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setBillType('VERIFIED_BILL')}
                      className={`flex-1 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                        billType === 'VERIFIED_BILL' ? 'bg-emerald-700 text-white shadow-xs' : 'bg-white text-stone-700'
                      }`}
                    >
                      Verified Bill (پکا بل)
                    </button>
                    <button
                      type="button"
                      onClick={() => setBillType('PARCHI')}
                      className={`flex-1 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                        billType === 'PARCHI' ? 'bg-amber-600 text-white shadow-xs' : 'bg-white text-stone-700'
                      }`}
                    >
                      Parchi (کچی پرچی)
                    </button>
                  </div>
                </div>
              </div>

              {/* INVOICE NUMBER & DETAILS */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-700 font-bold mb-1">
                    {billType === 'PARCHI' ? 'Handwritten Parchi # / Slip Ref' : "Vendor's Invoice / Bill # *"}
                  </label>
                  <input
                    type="text"
                    value={billInvoiceNo}
                    onChange={(e) => setBillInvoiceNo(e.target.value)}
                    placeholder="e.g. UNI-98214"
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl font-mono font-bold outline-hidden focus:border-[#5B7981]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-stone-700 font-bold mb-1">Receiving Date</label>
                  <input
                    type="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl font-mono outline-hidden"
                  />
                </div>
              </div>

              {/* QUICK LUMP-SUM FORM */}
              {billMode === 'QUICK' ? (
                <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-1">
                      <label className="block text-stone-700 font-bold mb-1">Gross Bill Amount (Rs.) *</label>
                      <input
                        type="number"
                        min="1"
                        step="any"
                        value={quickGrossAmount}
                        onChange={(e) => setQuickGrossAmount(Number(e.target.value) || '')}
                        placeholder="e.g. 45000"
                        className="w-full px-3 py-2 bg-white border-2 border-[#5B7981] rounded-xl font-mono font-black text-stone-900 outline-hidden"
                        required
                        autoFocus
                      />
                    </div>

                    <div>
                      <label className="block text-stone-700 font-bold mb-1">Taxes / GST (Rs.)</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={quickTaxAmount}
                        onChange={(e) => setQuickTaxAmount(Number(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl font-mono outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="block text-stone-700 font-bold mb-1">Freight / Bilty (Rs.)</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={quickFreightAmount}
                        onChange={(e) => setQuickFreightAmount(Number(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl font-mono outline-hidden"
                      />
                    </div>
                  </div>

                  {Number(quickFreightAmount) > 0 && (
                    <label className="flex items-center gap-2 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={quickFreightDeducted}
                        onChange={(e) => setQuickFreightDeducted(e.target.checked)}
                        className="w-4 h-4 text-[#5B7981] rounded border-stone-300 focus:ring-0"
                      />
                      <span className="text-[11px] text-stone-700 font-bold">
                        Deduct freight (Rs. {quickFreightAmount}) from supplier payable bill
                      </span>
                    </label>
                  )}

                  {/* CALCULATION PREVIEW */}
                  <div className="p-3 bg-white border border-stone-200 rounded-xl flex items-center justify-between font-mono">
                    <span className="text-xs text-stone-600 font-bold">Net Payable Added to Khata:</span>
                    <span className="text-base font-black text-[#5B7981]">
                      Rs. {((Number(quickGrossAmount) || 0) + (Number(quickTaxAmount) || 0) - (quickFreightDeducted ? (Number(quickFreightAmount) || 0) : 0)).toLocaleString()}
                    </span>
                  </div>
                </div>
              ) : (
                /* ITEMIZED STOCK ENTRY WITH FAST BARCODE SCANNING & QUICK ADD */
                <div className="space-y-3">
                  <div className="p-3 bg-stone-100 rounded-2xl border border-stone-200 space-y-2">
                    <span className="text-[11px] font-bold text-stone-700 block uppercase tracking-wide">
                      Scan Barcode / Search Catalog to Add Items:
                    </span>
                    
                    {/* QUICK BARCODE SCANNER & LIVE CATALOG SEARCH */}
                    <div className="relative">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Barcode className="w-4 h-4 absolute left-3 top-2.5 text-stone-400" />
                          <input
                            ref={procureScanInputRef}
                            type="text"
                            value={procureScanQuery}
                            onChange={(e) => searchProcureCatalog(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                setProcureSelectedIndex(prev => Math.min(prev + 1, procureSuggestions.length - 1));
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                setProcureSelectedIndex(prev => Math.max(prev - 1, 0));
                              } else if (e.key === 'Enter') {
                                e.preventDefault();
                                handleProcureScanSubmit();
                              } else if (e.key === '*' || e.code === 'NumpadMultiply') {
                                e.preventDefault();
                                const val = procureScanQuery.trim();
                                const num = parseInt(val, 10);
                                if (!isNaN(num) && num > 0 && String(num) === val) {
                                  setProcureMultiplier(num);
                                  setProcureScanQuery('');
                                  setProcureSuggestions([]);
                                  hardwareService.playNoticeTone();
                                } else {
                                  const cycles = [null, 2, 5, 10, 12, 24, 50];
                                  const curIdx = cycles.indexOf(procureMultiplier || null);
                                  const next = cycles[(curIdx + 1) % cycles.length];
                                  setProcureMultiplier(next);
                                  hardwareService.playNoticeTone();
                                }
                              } else if ((e.ctrlKey && (e.key === 'r' || e.key === 'R')) || e.code === 'NumpadDivide') {
                                e.preventDefault();
                                setProcureMultiplier(null);
                                setProcureScanQuery('');
                                setProcureSuggestions([]);
                                hardwareService.playNoticeTone();
                              } else if (e.key === 'Escape') {
                                setProcureSuggestions([]);
                                setProcureSelectedIndex(-1);
                                if (procureMultiplier !== null) {
                                  setProcureMultiplier(null);
                                  hardwareService.playNoticeTone();
                                }
                              }
                            }}
                            placeholder="Scan barcode or type product name... (supports 10*barcode)"
                            className="w-full pl-9 pr-28 py-2 bg-white border-2 border-stone-300 rounded-xl font-bold text-xs outline-hidden focus:border-[#5B7981]"
                          />
                          {procureMultiplier && (
                            <button
                              type="button"
                              onClick={() => {
                                setProcureMultiplier(null);
                                procureScanInputRef.current?.focus();
                              }}
                              className="absolute right-2 top-1.5 px-2 py-0.5 bg-amber-500 hover:bg-amber-600 text-white rounded-md text-[10px] font-black font-mono cursor-pointer flex items-center gap-1 shadow-xs"
                              title="Reset multiplier [Ctrl+R / Numpad /]"
                            >
                              <span>{procureMultiplier}x</span>
                              <span className="text-[9px] bg-amber-700/60 px-1 py-0.2 rounded">[Ctrl+R]</span>
                            </button>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleProcureScanSubmit()}
                          className="px-3.5 py-2 bg-[#5B7981] hover:bg-[#486269] text-white rounded-xl text-xs font-bold cursor-pointer transition-all flex items-center gap-1 shadow-xs whitespace-nowrap"
                        >
                          <Plus className="w-3.5 h-3.5" /> Scan / Add
                        </button>
                      </div>

                      {/* AUTOCOMPLETE SUGGESTIONS DROPDOWN */}
                      {procureSuggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-stone-300 rounded-xl shadow-xl z-50 overflow-hidden divide-y divide-stone-100 max-h-56 overflow-y-auto">
                          {procureSuggestions.map((prod, idx) => (
                            <div
                              key={prod.id}
                              onClick={() => handleAddProductToProcurement(prod, procureMultiplier || 1)}
                              className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                                idx === procureSelectedIndex ? 'bg-stone-100 font-bold' : 'hover:bg-stone-50'
                              }`}
                            >
                              <div>
                                <div className="text-xs font-bold text-stone-900">{prod.name}</div>
                                <div className="text-[10px] text-stone-500 font-mono">
                                  Barcode: {prod.barcode || 'N/A'} • Unit: {prod.unit_type || 'piece'}
                                </div>
                              </div>
                              <div className="text-right font-mono">
                                <span className="text-xs font-bold text-stone-800">Cost: Rs. {Number(prod.cost_price || 0).toLocaleString()}</span>
                                <span className="text-[10px] text-stone-500 block">Retail: Rs. {Number(prod.sale_price || 0).toLocaleString()}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ITEM ROWS LIST */}
                  <div className="space-y-1.5 max-h-56 overflow-y-auto p-1">
                    {billItems.length === 0 ? (
                      <div className="p-6 text-center border-2 border-dashed border-stone-200 rounded-2xl text-stone-400">
                        Scan product barcodes above or type product name to add items to this delivery bill.
                      </div>
                    ) : (
                      billItems.map((item, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-stone-50 p-2.5 rounded-xl border border-stone-200">
                          <div className="col-span-5">
                            <span className="text-xs font-bold text-stone-900 block truncate" title={item.product_name}>
                              {item.product_name}
                            </span>
                            <span className="text-[10px] text-stone-500 font-mono">
                              Unit Cost: Rs. {Number(item.unit_cost || 0).toLocaleString()}
                            </span>
                          </div>

                          <div className="col-span-2">
                            <label className="text-[9px] font-bold text-stone-500 block text-center">Billed Qty</label>
                            <input
                              type="number"
                              min="1"
                              value={item.billed_qty}
                              onChange={(e) => {
                                const bQty = Number(e.target.value) || 0;
                                const updated = [...billItems];
                                updated[idx] = { ...updated[idx], billed_qty: bQty, line_total: bQty * (Number(updated[idx].unit_cost) || 0) };
                                setBillItems(updated);
                              }}
                              className="w-full px-2 py-1 bg-white border border-stone-300 rounded-lg text-xs font-mono font-bold text-center outline-hidden focus:border-[#5B7981]"
                              title="Billed quantity charged by distributor"
                            />
                          </div>

                          <div className="col-span-2">
                            <label className="text-[9px] font-bold text-emerald-700 block text-center">+Scheme</label>
                            <input
                              type="number"
                              min="0"
                              value={item.scheme_qty || ''}
                              onChange={(e) => {
                                const sQty = Number(e.target.value) || 0;
                                const updated = [...billItems];
                                updated[idx] = { ...updated[idx], scheme_qty: sQty };
                                setBillItems(updated);
                              }}
                              placeholder="0"
                              className="w-full px-2 py-1 bg-emerald-50 border border-emerald-300 rounded-lg text-xs font-mono font-bold text-center text-emerald-800 outline-hidden"
                              title="Free Scheme Quantity (e.g. 1 free on 12)"
                            />
                          </div>

                          <div className="col-span-2">
                            <label className="text-[9px] font-bold text-stone-500 block text-right">Cost (Rs.)</label>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={item.unit_cost}
                              onChange={(e) => {
                                const cost = Number(e.target.value) || 0;
                                const updated = [...billItems];
                                updated[idx] = { ...updated[idx], unit_cost: cost, line_total: (Number(updated[idx].billed_qty) || 0) * cost };
                                setBillItems(updated);
                              }}
                              className="w-full px-2 py-1 bg-white border border-stone-300 rounded-lg text-xs font-mono font-bold text-right outline-hidden focus:border-[#5B7981]"
                            />
                          </div>

                          <div className="col-span-1 text-center">
                            <button
                              type="button"
                              onClick={() => setBillItems(billItems.filter((_, i) => i !== idx))}
                              className="p-1 text-stone-400 hover:text-red-600 rounded cursor-pointer transition-colors"
                              title="Remove item row"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* SUMMARY OF ITEMS */}
                  <div className="p-3 bg-stone-100 rounded-xl flex justify-between items-center font-mono">
                    <span className="text-xs text-stone-600 font-bold">
                      {billItems.length} Products • Total Items Cost:
                    </span>
                    <span className="text-base font-black text-[#5B7981]">
                      Rs. {billItems.reduce((s, it) => s + (Number(it.billed_qty) * Number(it.unit_cost)), 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-stone-700 font-bold mb-1">Remarks / Note</label>
                <input
                  type="text"
                  value={billNotes}
                  onChange={(e) => setBillNotes(e.target.value)}
                  placeholder="e.g. Delivered by driver Rashid, 2 cartons delayed"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setIsPurchaseModalOpen(false)}
                  className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#5B7981] hover:bg-[#486269] text-white rounded-xl font-black shadow-md cursor-pointer"
                >
                  Save Bill to Khata
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. PAYMENT WITH SETTLEMENT (KASAR) ON ALL MODES MODAL */}
      {/* ======================================================== */}
      {isPayModalOpen && selectedSupplier && (
        <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 font-sans select-none">
          <div className="bg-white border border-stone-300 rounded-3xl max-w-lg w-full shadow-2xl p-4 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto font-sans">
            <div className="flex justify-between items-center border-b border-stone-200 pb-3">
              <div>
                <h3 className="font-black text-sm text-stone-900 uppercase tracking-wide">
                  RECORD VENDOR PAYMENT / ادائیگی و کسر
                </h3>
                <span className="text-[11px] text-[#5B7981] font-bold">
                  {selectedSupplier.company} (Payable: Rs. {selectedSupplier.current_balance.toLocaleString()})
                </span>
              </div>
              <button onClick={() => setIsPayModalOpen(false)} className="text-stone-400 hover:text-stone-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmPayment} className="space-y-4 text-xs">
              
              {/* PAYMENT AMOUNTS WITH EXPLICIT SETTLEMENT (KASAR) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-700 font-bold mb-1">
                    Amount Paid (ادائیگی رقم) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(Number(e.target.value) || '')}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-stone-50 border-2 border-emerald-500 rounded-xl font-mono font-black text-sm text-emerald-950 outline-hidden"
                    required
                    autoFocus
                  />
                  <span className="text-[10px] text-stone-500 block mt-0.5">Physical / Bank cash paid</span>
                </div>

                <div>
                  <label className="block text-stone-700 font-bold mb-1">
                    Settlement / Kasar (کسر / چھوٹ)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={settlementDiscount}
                    onChange={(e) => setSettlementDiscount(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-amber-50 border-2 border-amber-400 rounded-xl font-mono font-black text-sm text-amber-950 outline-hidden"
                  />
                  <span className="text-[10px] text-amber-700 block mt-0.5">Discount waived by vendor</span>
                </div>
              </div>

              {/* PAYMENT MODE SELECTOR */}
              <div>
                <label className="block text-stone-700 font-bold mb-1">Payment Method / طریقہ کار</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'CASH', label: 'Cash (نقد)' },
                    { id: 'BANK_TRANSFER', label: 'Bank Transfer' },
                    { id: 'CHEQUE', label: 'Cheque (چیک)' },
                    { id: 'RAAST_ONLINE', label: 'Raast Instant' },
                    { id: 'EASYPAISA', label: 'Easypaisa' },
                    { id: 'JAZZCASH', label: 'JazzCash' },
                  ].map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentChannel(m.id as any)}
                      className={`py-2 px-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer border ${
                        paymentChannel === m.id
                          ? 'bg-[#5B7981] text-white border-[#5B7981] shadow-xs'
                          : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* CHEQUE DETAILS IF CHEQUE */}
              {paymentChannel === 'CHEQUE' && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl space-y-2">
                  <span className="text-[11px] font-bold text-amber-900 block uppercase">
                    Cheque Information (چیک کی تفصیلات)
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={paymentRefNo}
                      onChange={(e) => setPaymentRefNo(e.target.value)}
                      placeholder="Cheque # (e.g. 004819)"
                      className="px-2.5 py-1.5 bg-white border border-stone-300 rounded-xl font-mono outline-hidden"
                      required
                    />
                    <input
                      type="date"
                      value={paymentChequeDate}
                      onChange={(e) => setPaymentChequeDate(e.target.value)}
                      className="px-2.5 py-1.5 bg-white border border-stone-300 rounded-xl font-mono outline-hidden"
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={isChequePending}
                      onChange={(e) => setIsChequePending(e.target.checked)}
                      className="w-4 h-4 text-[#5B7981] rounded border-stone-300 focus:ring-0"
                    />
                    <span className="text-[11px] text-amber-950 font-bold">
                      Hold as Post-Dated Cheque (PDC): Deduct from balance only upon clearance
                    </span>
                  </label>
                </div>
              )}

              {/* CASH DRAWER DEDUCTION TOGGLE */}
              {(paymentChannel === 'CASH' || paymentChannel === 'CASH_SAFE') && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={deductFromDrawer}
                      onChange={(e) => setDeductFromDrawer(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded border-stone-300 focus:ring-0"
                    />
                    <span className="text-[11px] text-emerald-950 font-bold">
                      [✓] Deduct Cash from Active Register Drawer (کاؤنٹر دراز سے رقم کم کریں)
                    </span>
                  </label>
                </div>
              )}

              {/* BANK & REFERENCE FIELDS */}
              {(paymentChannel === 'BANK_TRANSFER' || paymentChannel === 'RAAST_ONLINE') && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-stone-700 font-bold mb-1">Bank Name</label>
                    <input
                      type="text"
                      value={paymentBankName}
                      onChange={(e) => setPaymentBankName(e.target.value)}
                      placeholder="e.g. Meezan Bank, HBL"
                      className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl font-bold outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-stone-700 font-bold mb-1">Transaction Ref / Trx ID</label>
                    <input
                      type="text"
                      value={paymentRefNo}
                      onChange={(e) => setPaymentRefNo(e.target.value)}
                      placeholder="e.g. RAAST-849102"
                      className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl font-mono outline-hidden"
                    />
                  </div>
                </div>
              )}

              {/* LIVE MATHEMATICAL SETTLEMENT PREVIEW */}
              <div className="p-3.5 bg-stone-900 text-white rounded-2xl space-y-1 font-mono text-xs">
                <div className="flex justify-between text-stone-400">
                  <span>Sabqa Baqaya (Previous):</span>
                  <span>Rs. {selectedSupplier.current_balance.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-emerald-400">
                  <span>- Amount Paid + Settlement:</span>
                  <span>- Rs. {((Number(paymentAmount) || 0) + (Number(settlementDiscount) || 0)).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-[#E3D5C0] font-black text-sm pt-1 border-t border-stone-700">
                  <span>Aakhri Baqaya (Remaining):</span>
                  <span>
                    Rs. {Math.max(0, selectedSupplier.current_balance - ((Number(paymentAmount) || 0) + (Number(settlementDiscount) || 0))).toLocaleString()}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-stone-700 font-bold mb-1">Payment Note / رسید تفصیل</label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="e.g. Given cash to order booker Aslam"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setIsPayModalOpen(false)}
                  className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black shadow-md cursor-pointer"
                >
                  Confirm Payment &amp; Kasar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. RETURN / DAMAGED STOCK CLAIM (WAPSI / KHORAK) MODAL */}
      {/* ======================================================== */}
      {isReturnModalOpen && selectedSupplier && (
        <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 font-sans select-none">
          <div className="bg-white border border-stone-300 rounded-3xl max-w-md w-full shadow-2xl p-4 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto font-sans">
            <div className="flex justify-between items-center border-b border-stone-200 pb-3">
              <div>
                <h3 className="font-black text-sm text-stone-900 uppercase tracking-wide">
                  DAMAGED / EXPIRED STOCK RETURN (واپسی و خوراک)
                </h3>
                <span className="text-[11px] text-stone-500">{selectedSupplier.company}</span>
              </div>
              <button onClick={() => setIsReturnModalOpen(false)} className="text-stone-400 hover:text-stone-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmReturn} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-stone-700 font-bold mb-1">Return Claim Amount (Rs.) *</label>
                <input
                  type="number"
                  min="1"
                  value={returnAmount}
                  onChange={(e) => setReturnAmount(Number(e.target.value) || '')}
                  placeholder="e.g. 1850"
                  className="w-full px-3 py-2 bg-stone-50 border-2 border-amber-500 rounded-xl font-mono font-black text-sm outline-hidden"
                  required
                  autoFocus
                />
                <span className="text-[10px] text-stone-500 block mt-0.5">Amount credited back to store account</span>
              </div>

              <div>
                <label className="block text-stone-700 font-bold mb-1">Return Reason / وجہ</label>
                <select
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl font-bold outline-hidden"
                >
                  <option value="Damaged / Broken Carton (ٹوٹا پھوٹا کارٹن)">Damaged / Broken Carton</option>
                  <option value="Expired Stock / خوراک (تاریخ ختم)">Expired Stock / خوراک</option>
                  <option value="Leaked / Seal Broken (لیک یا خراب)">Leaked / Seal Broken</option>
                  <option value="Short Supply / مال کم نکلا">Short Supply (Difference on delivery)</option>
                  <option value="Customer Return / گاہک واپسی">Customer Return</option>
                </select>
              </div>

              <div>
                <label className="block text-stone-700 font-bold mb-1">Remarks / Slip Note</label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="e.g. Handed over 4 bottles to salesman"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setIsReturnModalOpen(false)}
                  className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black shadow-md cursor-pointer"
                >
                  Post Return Claim
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. KHATA DURUSTI (AUDIT CORRECTION / REVERSAL) MODAL */}
      {/* ======================================================== */}
      {isAdjustmentModalOpen && selectedSupplier && (
        <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 font-sans select-none">
          <div className="bg-white border border-stone-300 rounded-3xl max-w-md w-full shadow-2xl p-4 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto font-sans">
            <div className="flex justify-between items-center border-b border-stone-200 pb-3">
              <div>
                <h3 className="font-black text-sm text-stone-900 uppercase tracking-wide">
                  KHATA DURUSTI / کھاتہ درستگی (AUDIT REVERSAL)
                </h3>
                <span className="text-[11px] text-stone-500">Immutable audit-safe balance correction</span>
              </div>
              <button onClick={() => setIsAdjustmentModalOpen(false)} className="text-stone-400 hover:text-stone-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmAdjustment} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-stone-700 font-bold mb-1">Adjustment Direction</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjDirection('CREDIT')}
                    className={`py-2 rounded-xl font-bold text-center border cursor-pointer ${
                      adjDirection === 'CREDIT' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-stone-50 text-stone-700'
                    }`}
                  >
                    - Deduct (کم کریں)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjDirection('DEBIT')}
                    className={`py-2 rounded-xl font-bold text-center border cursor-pointer ${
                      adjDirection === 'DEBIT' ? 'bg-red-600 text-white border-red-600' : 'bg-stone-50 text-stone-700'
                    }`}
                  >
                    + Add (بڑھائیں)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-stone-700 font-bold mb-1">Adjustment Amount (Rs.) *</label>
                <input
                  type="number"
                  min="1"
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(Number(e.target.value) || '')}
                  placeholder="0"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl font-mono font-bold outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-stone-700 font-bold mb-1">Mandatory Audit Reason (درستگی کی وجہ) *</label>
                <input
                  type="text"
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="e.g. Correcting typo on bill #984 - entered 50k instead of 5k"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl outline-hidden font-bold"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setIsAdjustmentModalOpen(false)}
                  className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#5B7981] hover:bg-[#486269] text-white rounded-xl font-black shadow-md cursor-pointer"
                >
                  Apply Khaata Durusti
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 6. RECONCILE PARCHI TO BILL MODAL */}
      {/* ======================================================== */}
      {isParchiReconcileOpen && reconcileTxn && (
        <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 font-sans select-none">
          <div className="bg-white border border-stone-300 rounded-3xl max-w-md w-full shadow-2xl p-4 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto font-sans">
            <div className="flex justify-between items-center border-b border-stone-200 pb-3">
              <div>
                <h3 className="font-black text-sm text-stone-900 uppercase tracking-wide">
                  RECONCILE PARCHI TO BILL / پرچی سے پکا بل
                </h3>
                <span className="text-[11px] text-stone-500">Parchi Ref: #{reconcileTxn.invoice_no}</span>
              </div>
              <button onClick={() => setIsParchiReconcileOpen(false)} className="text-stone-400 hover:text-stone-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmReconcile} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-stone-700 font-bold mb-1">Official Computerized Invoice # *</label>
                <input
                  type="text"
                  value={reconcileInvoiceNo}
                  onChange={(e) => setReconcileInvoiceNo(e.target.value)}
                  placeholder="e.g. UNI-TAX-2026-991"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl font-mono font-bold outline-hidden"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-stone-700 font-bold mb-1">Final Verified Bill Amount (Rs.) *</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={reconcileAmount}
                  onChange={(e) => setReconcileAmount(Number(e.target.value) || '')}
                  className="w-full px-3 py-2 bg-stone-50 border-2 border-emerald-500 rounded-xl font-mono font-black text-sm outline-hidden"
                  required
                />
                <span className="text-[10px] text-stone-500 block mt-0.5">
                  Difference will automatically adjust in supplier balance.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setIsParchiReconcileOpen(false)}
                  className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black shadow-md cursor-pointer"
                >
                  Confirm Verification
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 7. DETAILED BAHI-KHATA LEDGER MODAL WITH STATEMENT &amp; PRINT */}
      {/* ======================================================== */}
      {isLedgerModalOpen && selectedSupplier && (
        <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 font-sans select-none">
          <div className="bg-white border border-stone-300 rounded-3xl max-w-4xl w-full shadow-2xl p-4 sm:p-6 space-y-3 sm:space-y-4 max-h-[94vh] flex flex-col font-sans overflow-hidden">
            
            {/* MODAL HEADER */}
            <div className="flex justify-between items-start border-b border-stone-200 pb-3 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-[#5B7981] text-[#E3D5C0] rounded text-[10px] font-black uppercase">
                    KHATA LEDGER STATEMENT • بہی کھاتہ
                  </span>
                  <span className="text-xs text-stone-500 font-mono">ID: {selectedSupplier.id}</span>
                </div>
                <h2 className="text-lg sm:text-xl font-black text-stone-900 mt-0.5">
                  {selectedSupplier.company}
                </h2>
                <span className="text-xs text-stone-600 font-bold block">
                  Contact: {selectedSupplier.name} • {selectedSupplier.phone || 'No phone'} • Terms: {selectedSupplier.payment_terms_days || 7} Days
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenAdjustment(selectedSupplier)}
                  className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-300 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1"
                  title="Post Khaata Durusti adjustment"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Durusti (درستگی)
                </button>

                <button
                  type="button"
                  onClick={handlePrint80mmSupplierStatement}
                  className="px-3 py-1.5 bg-stone-800 hover:bg-stone-900 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer shadow-xs"
                  title="Print 80mm thermal slip"
                >
                  <Printer className="w-3.5 h-3.5" /> 80mm Slip
                </button>

                <button
                  type="button"
                  onClick={handlePrintLedger}
                  className="px-3.5 py-1.5 bg-[#5B7981] hover:bg-[#486269] text-white rounded-xl text-xs font-black flex items-center gap-1 cursor-pointer shadow-xs"
                  title="Print A4 / PDF Full Ledger Statement"
                >
                  <Printer className="w-3.5 h-3.5" /> Print Statement [A4]
                </button>

                <button onClick={() => setIsLedgerModalOpen(false)} className="text-stone-400 hover:text-stone-700 cursor-pointer p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* PERIOD DATE FILTER CONTROLS */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-stone-100 rounded-2xl shrink-0 text-xs font-bold">
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-stone-500" />
                <span>Period Filter:</span>
                <button
                  onClick={() => {
                    setLedgerPeriod('ALL');
                    loadPeriodStatement(selectedSupplier.id, '2020-01-01', new Date().toISOString().slice(0, 10));
                  }}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    ledgerPeriod === 'ALL' ? 'bg-[#243338] text-white shadow-xs' : 'bg-white text-stone-700'
                  }`}
                >
                  All Time
                </button>
                <button
                  onClick={() => {
                    setLedgerPeriod('THIS_MONTH');
                    const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
                    const end = new Date().toISOString().slice(0, 10);
                    setFilterStartDate(start);
                    setFilterEndDate(end);
                    loadPeriodStatement(selectedSupplier.id, start, end);
                  }}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    ledgerPeriod === 'THIS_MONTH' ? 'bg-[#243338] text-white shadow-xs' : 'bg-white text-stone-700'
                  }`}
                >
                  This Month
                </button>
                <button
                  onClick={() => {
                    setLedgerPeriod('LAST_MONTH');
                    const now = new Date();
                    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
                    const end = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
                    setFilterStartDate(start);
                    setFilterEndDate(end);
                    loadPeriodStatement(selectedSupplier.id, start, end);
                  }}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    ledgerPeriod === 'LAST_MONTH' ? 'bg-[#243338] text-white shadow-xs' : 'bg-white text-stone-700'
                  }`}
                >
                  Last Month
                </button>
              </div>

              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <span>From:</span>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => {
                    setFilterStartDate(e.target.value);
                    setLedgerPeriod('CUSTOM');
                    loadPeriodStatement(selectedSupplier.id, e.target.value, filterEndDate);
                  }}
                  className="px-2 py-0.5 bg-white border border-stone-300 rounded-lg text-xs"
                />
                <span>To:</span>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => {
                    setFilterEndDate(e.target.value);
                    setLedgerPeriod('CUSTOM');
                    loadPeriodStatement(selectedSupplier.id, filterStartDate, e.target.value);
                  }}
                  className="px-2 py-0.5 bg-white border border-stone-300 rounded-lg text-xs"
                />
              </div>
            </div>

            {/* PRINTABLE STATEMENT VIEW CONTAINER */}
            <div ref={printAreaRef} className="flex-1 min-h-0 overflow-y-auto space-y-3 p-1">
              
              {/* PRINT HEADER (ONLY VISIBLE ON PRINT) */}
              <div className="hidden print:block text-center border-b pb-2 space-y-0.5">
                <h1 className="text-xl font-black">{storeSettings?.store_name || 'POINT OF SALE'}</h1>
                <p className="text-xs">{storeSettings?.address || 'Pakistan'} • Ph: {storeSettings?.phone || ''}</p>
                <h3 className="text-sm font-bold uppercase pt-1">SUPPLIER STATEMENT OF ACCOUNT</h3>
                <p className="text-xs">Distributor: {selectedSupplier.company} ({selectedSupplier.name}) • Period: {filterStartDate} to {filterEndDate}</p>
              </div>

              {/* SABQA BAQAYA (CARRIED FORWARD OPENING BALANCE) BANNER */}
              {periodStatement && (
                <div className="p-3 bg-stone-100 border border-stone-200 rounded-2xl flex items-center justify-between text-xs font-mono font-bold">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-stone-700 text-white rounded text-[10px]">
                      سابقہ بقایا
                    </span>
                    <span className="text-stone-800">SABQA BAQAYA (Opening Balance as of {filterStartDate}):</span>
                  </div>
                  <span className={`text-sm font-black ${periodStatement.opening_balance > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                    Rs. {periodStatement.opening_balance.toLocaleString()} {periodStatement.opening_balance > 0 ? 'Payable' : 'Advance'}
                  </span>
                </div>
              )}

              {/* TRADITIONAL BAHI-KHATA TABLE */}
              <div className="border border-stone-200 rounded-2xl overflow-hidden shadow-2xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-stone-100 text-stone-700 text-[11px] font-black uppercase tracking-wider border-b border-stone-200">
                      <th className="p-2.5">Date / وقت و تاریخ</th>
                      <th className="p-2.5">Description &amp; Ref / تفصیل و بل نمبر</th>
                      <th className="p-2.5 text-right text-red-700">Debit / Kharid (بنام / +)</th>
                      <th className="p-2.5 text-right text-emerald-700">Credit / Adaigi (جمع / -)</th>
                      <th className="p-2.5 text-right text-amber-800">Settlement (کسر)</th>
                      <th className="p-2.5 text-right">Balance / بقایا</th>
                      <th className="p-2.5 text-center print:hidden">Action</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-stone-100 font-mono text-xs">
                    {(periodStatement?.transactions || supplierTransactions).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-stone-400 font-sans">
                          No transactions found for this period.
                        </td>
                      </tr>
                    ) : (
                      (periodStatement?.transactions || supplierTransactions).map((txn) => {
                        const isDebit = txn.debit_amount > 0;
                        const isCredit = txn.credit_amount > 0;
                        const isParchi = txn.bill_type === 'PARCHI';
                        const isPendingCheque = txn.payment_channel === 'CHEQUE' && txn.cheque_status === 'PENDING_CLEARANCE';

                        return (
                          <tr key={txn.id} className="hover:bg-stone-50/80 transition-colors">
                            <td className="p-2.5 text-stone-600 text-[11px]">
                              {new Date(txn.created_at).toLocaleDateString('en-PK')}
                              <span className="block text-[10px] text-stone-400">
                                {new Date(txn.created_at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </td>

                            <td className="p-2.5 font-sans">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                  txn.type === 'PURCHASE_BILL' ? 'bg-blue-100 text-blue-800' :
                                  txn.type === 'PARCHI_DELIVERY' ? 'bg-amber-100 text-amber-800' :
                                  txn.type === 'PAYMENT' ? 'bg-emerald-100 text-emerald-800' :
                                  txn.type === 'RETURN_CLAIM' ? 'bg-purple-100 text-purple-800' :
                                  txn.type === 'ADVANCE_DEPOSIT' ? 'bg-teal-100 text-teal-800' :
                                  'bg-stone-100 text-stone-800'
                                }`}>
                                  {txn.type.replace('_', ' ')}
                                </span>

                                {isParchi && (
                                  <span className="px-1.5 py-0.2 bg-amber-500 text-white rounded text-[9px] font-black">
                                    کچی پرچی
                                  </span>
                                )}

                                {isPendingCheque && (
                                  <span className="px-1.5 py-0.2 bg-red-100 text-red-800 border border-red-300 rounded text-[9px] font-bold">
                                    Cheque Pending
                                  </span>
                                )}

                                {txn.invoice_no && (
                                  <span className="font-mono font-bold text-stone-900">
                                    #{txn.invoice_no}
                                  </span>
                                )}
                              </div>

                              <span className="text-[11px] text-stone-500 block mt-0.5">
                                {txn.notes || 'Transaction entry'}
                                {txn.payment_channel ? ` • Mode: ${txn.payment_channel}` : ''}
                                {txn.reference_no ? ` (Ref: ${txn.reference_no})` : ''}
                              </span>
                            </td>

                            {/* DEBIT / KHARD (+) */}
                            <td className="p-2.5 text-right font-bold text-red-700">
                              {txn.debit_amount > 0 ? `Rs. ${txn.debit_amount.toLocaleString()}` : '-'}
                            </td>

                            {/* CREDIT / ADAIGI (-) */}
                            <td className="p-2.5 text-right font-bold text-emerald-700">
                              {txn.credit_amount > 0 ? `Rs. ${txn.credit_amount.toLocaleString()}` : '-'}
                            </td>

                            {/* SETTLEMENT / KASAR */}
                            <td className="p-2.5 text-right font-bold text-amber-800">
                              {txn.settlement_discount && txn.settlement_discount > 0 ? `Rs. ${txn.settlement_discount.toLocaleString()}` : '-'}
                            </td>

                            {/* RUNNING BALANCE / BAQAYA */}
                            <td className={`p-2.5 text-right font-black ${
                              txn.balance_after > 0 ? 'text-red-700' : txn.balance_after < 0 ? 'text-emerald-700' : 'text-stone-700'
                            }`}>
                              Rs. {txn.balance_after.toLocaleString()}
                            </td>

                            {/* ROW ACTION (RECONCILE PARCHI OR CLEAR CHEQUE) */}
                            <td className="p-2.5 text-center print:hidden">
                              {isParchi && (
                                <button
                                  onClick={() => handleOpenReconcile(txn)}
                                  className="px-2 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded text-[10px] font-bold cursor-pointer font-sans"
                                  title="Reconcile to final verified bill"
                                >
                                  Verify Bill
                                </button>
                              )}
                              {isPendingCheque && (
                                <button
                                  onClick={() => handleClearCheque(txn.id)}
                                  className="px-2 py-0.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded text-[10px] font-bold cursor-pointer font-sans"
                                  title="Mark cheque as cleared in bank"
                                >
                                  Clear
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* PERIOD CLOSING SUMMARY */}
              {periodStatement && (
                <div className="p-4 bg-stone-900 text-white rounded-2xl grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
                  <div>
                    <span className="text-stone-400 text-[10px] uppercase block">Sabqa Baqaya:</span>
                    <span className="font-bold text-sm">Rs. {periodStatement.opening_balance.toLocaleString()}</span>
                  </div>

                  <div>
                    <span className="text-red-400 text-[10px] uppercase block">+ Purchases (خریداری):</span>
                    <span className="font-bold text-sm text-red-300">Rs. {periodStatement.total_debits.toLocaleString()}</span>
                  </div>

                  <div>
                    <span className="text-emerald-400 text-[10px] uppercase block">- Paid &amp; Kasar (ادائیگی):</span>
                    <span className="font-bold text-sm text-emerald-300">Rs. {periodStatement.total_credits.toLocaleString()}</span>
                  </div>

                  <div className="sm:border-l sm:border-stone-700 sm:pl-3">
                    <span className="text-[#E3D5C0] text-[10px] uppercase font-black block">Aakhri Baqaya (بقایا):</span>
                    <span className="font-black text-base text-[#E3D5C0]">Rs. {periodStatement.closing_balance.toLocaleString()}</span>
                  </div>
                </div>
              )}

              {/* PRINT SIGNATURE BLOCKS (ONLY VISIBLE ON PRINT) */}
              <div className="hidden print:grid grid-cols-2 gap-8 pt-12 text-center text-xs font-bold">
                <div className="border-t border-stone-800 pt-1">
                  <span>Store Manager / Owner Signature</span>
                  <span className="block text-[10px] font-normal text-stone-500">{storeSettings?.store_name || 'Point of Sale'}</span>
                </div>
                <div className="border-t border-stone-800 pt-1">
                  <span>Distributor / Sales Rep Signature</span>
                  <span className="block text-[10px] font-normal text-stone-500">{selectedSupplier.company}</span>
                </div>
              </div>

            </div>

            {/* MODAL FOOTER */}
            <div className="flex items-center justify-between pt-3 border-t border-stone-200 shrink-0">
              <span className="text-[11px] text-stone-500 font-mono">
                Running balance automatically recomputed upon every transaction.
              </span>
              <button
                onClick={() => setIsLedgerModalOpen(false)}
                className="px-5 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl text-xs font-bold cursor-pointer"
              >
                Close Khata
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ADMIN PIN VERIFICATION MODAL FOR SUPPLIER DELETION */}
      <AdminPinPromptModal
        isOpen={isDeletePinOpen}
        onClose={() => {
          setIsDeletePinOpen(false);
          setSupplierToDelete(null);
        }}
        onSuccess={handleConfirmDeleteSupplier}
        adminPin={localStorage.getItem('pos_admin_pin') || storeSettings?.admin_pin || '8888'}
      />

      {/* QUICK ADD PRODUCT MODAL IN PROCUREMENT */}
      {isProcureQuickAddOpen && (
        <QuickAddItemModal
          isOpen={isProcureQuickAddOpen}
          onClose={() => setIsProcureQuickAddOpen(false)}
          initialBarcode={pendingProcureBarcode}
          onProductCreated={(newProd) => {
            setAllProducts(prev => [newProd, ...prev]);
            handleAddProductToProcurement(newProd, procureMultiplier || 1);
            setIsProcureQuickAddOpen(false);
            if ((window as any).electronAPI?.broadcastChange) {
              (window as any).electronAPI.broadcastChange('db-change', { type: 'product-create' });
            }
            window.dispatchEvent(new CustomEvent('pos-db-change', { detail: { type: 'product-create' } }));
            localStorage.setItem('pos_db_sync', Date.now().toString());
          }}
        />
      )}

    </div>
  );
};
