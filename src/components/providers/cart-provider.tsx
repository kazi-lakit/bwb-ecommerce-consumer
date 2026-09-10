"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export interface CartLine {
  /** Stable key: VariantId when the product has variants, else ProductId. */
  key: string;
  productId: string;
  variantId?: string;
  slug: string;
  name: string;
  imageUrl?: string;
  unitPrice: number;
  currency: string;
  quantity: number;
}

interface CartContextValue {
  items: CartLine[];
  count: number;
  subtotal: number;
  add: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  updateQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "ecommerce-consumer:cart";

/**
 * Client-side cart — there is no Cart schema on the Data Gateway yet, so this persists
 * to localStorage only (per-browser, not per-customer). Swap the storage calls below for
 * `useEntityList("Cart", ...)` / `useEntityMutations("Cart")` once that schema exists;
 * `CartLine` is already shaped like the planned CartLine composite so the swap is additive.
 */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartLine[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CartLine[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // storage unavailable (private mode, quota) — cart just won't persist across reloads
    }
  }, [items]);

  const value = useMemo<CartContextValue>(() => {
    const add: CartContextValue["add"] = (line, quantity = 1) => {
      setItems((prev) => {
        const existing = prev.find((item) => item.key === line.key);
        if (existing) {
          return prev.map((item) => (item.key === line.key ? { ...item, quantity: item.quantity + quantity } : item));
        }
        return [...prev, { ...line, quantity }];
      });
    };
    const updateQuantity: CartContextValue["updateQuantity"] = (key, quantity) => {
      setItems((prev) =>
        quantity <= 0 ? prev.filter((item) => item.key !== key) : prev.map((item) => (item.key === key ? { ...item, quantity } : item))
      );
    };
    const remove: CartContextValue["remove"] = (key) => setItems((prev) => prev.filter((item) => item.key !== key));
    const clear = () => setItems([]);
    const count = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    return { items, count, subtotal, add, updateQuantity, remove, clear };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
