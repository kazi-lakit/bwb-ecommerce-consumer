"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

interface WishlistContextValue {
  productIds: string[];
  has: (productId: string) => boolean;
  toggle: (productId: string) => void;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

const STORAGE_KEY = "ecommerce-consumer:wishlist";

/**
 * Client-side wishlist — there is no Wishlist schema on the Data Gateway yet, so this
 * persists to localStorage only (per-browser, not per-customer). Swap for
 * `useEntityList("Wishlist", ...)` / `useEntityMutations("Wishlist")` once that schema exists.
 */
export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const [productIds, setProductIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(productIds));
    } catch {
      // storage unavailable — wishlist just won't persist across reloads
    }
  }, [productIds]);

  const value = useMemo<WishlistContextValue>(
    () => ({
      productIds,
      has: (productId) => productIds.includes(productId),
      toggle: (productId) =>
        setProductIds((prev) => (prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId])),
    }),
    [productIds]
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used within a WishlistProvider");
  return ctx;
}
