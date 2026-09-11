"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./auth-provider";
import { COMMERCE_SCHEMAS_LIVE, createRemoteCart, getActiveCart, updateRemoteCart } from "@/lib/blocks/commerce";

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
const SYNC_DEBOUNCE_MS = 800;

/** Sums quantities for matching keys, keeping every line unique to either side. */
function mergeLines(local: CartLine[], remote: CartLine[]): CartLine[] {
  const merged = [...local];
  for (const remoteLine of remote) {
    const i = merged.findIndex((l) => l.key === remoteLine.key);
    if (i === -1) merged.push(remoteLine);
    else merged[i] = { ...merged[i], quantity: merged[i].quantity + remoteLine.quantity };
  }
  return merged;
}

/**
 * Client-side cart, persisted to localStorage (guest-friendly, per-browser, instant on
 * load) — additionally mirrored to a server-side `Cart` record when the customer is signed
 * in and `COMMERCE_SCHEMAS_LIVE` is on (see `lib/blocks/commerce.ts`). Guest carts are
 * untouched; a signed-in customer's cart is fetched once per session and merged with
 * whatever's already in localStorage (quantities summed on matching lines), then kept in
 * sync on every change after that. Inert (falls back to today's localStorage-only
 * behavior) until `COMMERCE_SCHEMAS_DRAFT.json` is imported and the flag is flipped.
 */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  const [items, setItems] = useState<CartLine[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CartLine[]) : [];
    } catch {
      return [];
    }
  });
  const remoteCartId = useRef<string | null>(null);
  const syncedForUser = useRef<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // storage unavailable (private mode, quota) — cart just won't persist across reloads
    }
  }, [items]);

  // One-time fetch-and-merge per signed-in user: pulls their existing server cart (if any),
  // combines it with whatever's already in localStorage, and remembers the server record's
  // id for the sync effect below. Resets when the user signs out, so a different customer
  // signing in on the same browser doesn't inherit the previous session's server-cart id.
  useEffect(() => {
    if (!COMMERCE_SCHEMAS_LIVE) return;
    if (status !== "authenticated" || !user) {
      remoteCartId.current = null;
      syncedForUser.current = null;
      return;
    }
    if (syncedForUser.current === user.itemId) return;
    syncedForUser.current = user.itemId;

    let cancelled = false;
    getActiveCart(user.itemId)
      .then((remote) => {
        if (cancelled || !remote) return;
        remoteCartId.current = remote.itemId;
        setItems((local) => mergeLines(local, remote.items));
      })
      .catch(() => {
        // Fetch failed (offline, transient error) — keep the local/guest cart as-is; the
        // save effect below will still create a fresh server cart on the next change.
      });
    return () => {
      cancelled = true;
    };
  }, [status, user]);

  // Debounced save: mirrors local `items` to the server cart once the user is known and the
  // one-time fetch-and-merge above has at least been attempted for them.
  useEffect(() => {
    if (!COMMERCE_SCHEMAS_LIVE) return;
    if (status !== "authenticated" || !user) return;
    if (syncedForUser.current !== user.itemId) return;

    const timer = setTimeout(() => {
      const currency = items[0]?.currency ?? "USD";
      const subTotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      const totals = { currency, subTotal, discountTotal: 0, total: subTotal };
      const save = remoteCartId.current
        ? updateRemoteCart(remoteCartId.current, items, totals)
        : createRemoteCart(user.itemId, items, totals).then((id) => {
            remoteCartId.current = id;
          });
      save.catch(() => {
        // Sync failure is silent by design — the cart still works locally; it just won't
        // be visible on another device until the next successful sync.
      });
    }, SYNC_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [items, status, user]);

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
