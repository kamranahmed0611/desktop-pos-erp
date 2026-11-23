import { create } from 'zustand';
import { CartItem, Customer, Product } from '../types';

export interface TabState {
  id: number;
  label: string;
  cart: CartItem[];
  customer: Customer | null;
  discountAmount: number;
  notes: string;
}

interface BillingStore {
  activeTab: number; // 0, 1, 2, 3 (F1 - F4)
  tabs: TabState[];
  prefixMultiplier: number | null; // e.g. 5 from "5*"

  setActiveTab: (tabIndex: number) => void;
  setPrefixMultiplier: (mult: number | null) => void;
  addItemToActiveTab: (
    product: Product, 
    customQty?: number, 
    customPrice?: number,
    deductQty?: number,
    unitLabel?: string,
    isSubunitSale?: boolean
  ) => void;
  updateItemQty: (index: number, newQty: number) => void;
  updateItemPrice: (index: number, newPrice: number) => void;
  removeItem: (index: number) => void;
  setDiscount: (discount: number) => void;
  setCustomer: (customer: Customer | null) => void;
  clearActiveCart: () => void;
  restoreTabsFromDraft: (savedTabs: TabState[]) => void;
}

const initialTabs: TabState[] = [
  { id: 0, label: 'Bill #1 [F1]', cart: [], customer: null, discountAmount: 0, notes: '' },
  { id: 1, label: 'Bill #2 [F2]', cart: [], customer: null, discountAmount: 0, notes: '' },
  { id: 2, label: 'Bill #3 [F3]', cart: [], customer: null, discountAmount: 0, notes: '' },
  { id: 3, label: 'Bill #4 [F4]', cart: [], customer: null, discountAmount: 0, notes: '' }
];

export const useBillingStore = create<BillingStore>((set) => ({
  activeTab: 0,
  tabs: initialTabs,
  prefixMultiplier: null,

  setActiveTab: (tabIndex) => set({ activeTab: tabIndex }),

  setPrefixMultiplier: (mult) => set({ prefixMultiplier: mult }),

  addItemToActiveTab: (product, customQty, customPrice, deductQty, unitLabel, isSubunitSale) => set((state) => {
    const currentTab = state.tabs[state.activeTab];
    const qtyToAdd = customQty !== undefined ? customQty : (state.prefixMultiplier || 1);

    // Auto-detect loose commodity retail subunit mode if not explicitly overridden
    const autoIsSubunit = isSubunitSale !== undefined 
      ? Boolean(isSubunitSale) 
      : Boolean(product.is_loose && product.subunit_sale_price && product.subunit_sale_price > 0);

    const unitPrice = customPrice !== undefined 
      ? customPrice 
      : (autoIsSubunit && product.subunit_sale_price ? product.subunit_sale_price : product.sale_price);

    const finalUnitLabel = unitLabel || (autoIsSubunit ? (product.sale_unit || 'unit') : (product.base_unit || product.unit_type));

    const effectiveDeductQty = deductQty !== undefined 
      ? deductQty 
      : (autoIsSubunit && product.unit_conversion_ratio && product.unit_conversion_ratio > 1
          ? Math.round((qtyToAdd / product.unit_conversion_ratio) * 1000) / 1000
          : qtyToAdd);

    // Match if same product AND same unit label
    const existingIdx = currentTab.cart.findIndex(
      it => it.product.id === product.id && (it.unit_label || '') === (finalUnitLabel || '')
    );
    let newCart: CartItem[];

    if (existingIdx > -1) {
      newCart = currentTab.cart.map((it, idx) => {
        if (idx === existingIdx) {
          const updatedQty = it.qty + qtyToAdd;
          const prevDeduct = it.deduct_qty !== undefined ? it.deduct_qty : it.qty;
          const updatedDeduct = prevDeduct + effectiveDeductQty;
          return {
            ...it,
            qty: updatedQty,
            deduct_qty: updatedDeduct,
            subtotal: updatedQty * it.unit_price
          };
        }
        return it;
      });
    } else {
      const newItem: CartItem = {
        product,
        qty: qtyToAdd,
        unit_price: unitPrice,
        subtotal: qtyToAdd * unitPrice,
        tax_amount: 0,
        discount_amount: 0,
        is_subunit_sale: Boolean(autoIsSubunit),
        deduct_qty: effectiveDeductQty,
        unit_label: finalUnitLabel
      };
      newCart = [newItem, ...currentTab.cart];
    }

    const updatedTabs = state.tabs.map((tab, idx) => {
      if (idx === state.activeTab) {
        return { ...tab, cart: newCart };
      }
      return tab;
    });

    return { tabs: updatedTabs, prefixMultiplier: null };
  }),

  updateItemQty: (index, newQty) => set((state) => {
    const currentTab = state.tabs[state.activeTab];
    if (newQty <= 0) {
      const newCart = currentTab.cart.filter((_, idx) => idx !== index);
      const updatedTabs = state.tabs.map((tab, idx) => idx === state.activeTab ? { ...tab, cart: newCart } : tab);
      return { tabs: updatedTabs };
    }

    const newCart = currentTab.cart.map((it, idx) => {
      if (idx === index) {
        const ratio = (it.deduct_qty && it.qty > 0) ? (it.deduct_qty / it.qty) : 1;
        return {
          ...it,
          qty: newQty,
          deduct_qty: newQty * ratio,
          subtotal: newQty * it.unit_price
        };
      }
      return it;
    });

    const updatedTabs = state.tabs.map((tab, idx) => idx === state.activeTab ? { ...tab, cart: newCart } : tab);
    return { tabs: updatedTabs };
  }),

  updateItemPrice: (index, newPrice) => set((state) => {
    const currentTab = state.tabs[state.activeTab];
    if (newPrice < 0) return { tabs: state.tabs };

    const newCart = currentTab.cart.map((it, idx) => {
      if (idx === index) {
        return {
          ...it,
          unit_price: newPrice,
          subtotal: it.qty * newPrice
        };
      }
      return it;
    });

    const updatedTabs = state.tabs.map((tab, idx) => idx === state.activeTab ? { ...tab, cart: newCart } : tab);
    return { tabs: updatedTabs };
  }),

  removeItem: (index) => set((state) => {
    const currentTab = state.tabs[state.activeTab];
    const newCart = currentTab.cart.filter((_, idx) => idx !== index);
    const updatedTabs = state.tabs.map((tab, idx) => idx === state.activeTab ? { ...tab, cart: newCart } : tab);
    return { tabs: updatedTabs };
  }),

  setDiscount: (discount) => set((state) => {
    const updatedTabs = state.tabs.map((tab, idx) => {
      if (idx === state.activeTab) {
        return { ...tab, discountAmount: Math.max(0, discount) };
      }
      return tab;
    });
    return { tabs: updatedTabs };
  }),

  setCustomer: (customer) => set((state) => {
    const updatedTabs = state.tabs.map((tab, idx) => {
      if (idx === state.activeTab) {
        return { ...tab, customer };
      }
      return tab;
    });
    return { tabs: updatedTabs };
  }),

  clearActiveCart: () => set((state) => {
    const updatedTabs = state.tabs.map((tab, idx) => {
      if (idx === state.activeTab) {
        return { ...tab, cart: [], customer: null, discountAmount: 0, notes: '' };
      }
      return tab;
    });
    return { tabs: updatedTabs, prefixMultiplier: null };
  }),

  restoreTabsFromDraft: (savedTabs) => set(() => ({
    tabs: savedTabs,
    prefixMultiplier: null
  }))
}));

// Auto-save active cart draft to localStorage for Crash Recovery (M11.5)
if (typeof window !== 'undefined') {
  useBillingStore.subscribe((state) => {
    try {
      const hasAnyItems = state.tabs.some(t => t.cart && t.cart.length > 0);
      if (hasAnyItems) {
        localStorage.setItem('pos_cart_draft', JSON.stringify({
          timestamp: Date.now(),
          tabs: state.tabs
        }));
      } else {
        localStorage.removeItem('pos_cart_draft');
      }
    } catch {}
  });
}

