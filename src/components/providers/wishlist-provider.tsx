"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./auth-provider";
import {
  FAVOURITES_LIVE,
  addFavourite,
  favouritesToCreate,
  listFavourites,
  mergeFavourites,
  removeFavourite,
  type Favourite,
} from "@/lib/blocks/favourites";

interface WishlistContextValue {
  productIds: string[];
  has: (productId: string) => boolean;
  toggle: (productId: string) => void;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

const STORAGE_KEY = "ecommerce-consumer:wishlist";

function readLocal(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Wishlist: localStorage for everyone, additionally synced to a server `Favourite` record per
 * item when the customer is signed in and `VITE_FAVOURITE_SCHEMA_LIVE` is on.
 *
 * The same shape as the cart's sync, and for the same reason: localStorage stays the
 * persistence layer so a guest keeps a wishlist and a signed-in customer gets one instantly on
 * load, with the server copy making it follow them between devices. Off by default, so until
 * the schema is imported this behaves exactly as it did before.
 */
export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  const [productIds, setProductIds] = useState<string[]>(() => readLocal());
  /** ProductId → server row id, so un-favouriting can delete the right row. */
  const [remoteIds, setRemoteIds] = useState<Map<string, string>>(new Map());
  const syncedForUser = useRef<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(productIds));
    } catch {
      // storage unavailable — the wishlist just won't survive a reload
    }
  }, [productIds]);

  // Fetch and merge once per signed-in session, exactly like cart-provider.
  useEffect(() => {
    if (!FAVOURITES_LIVE) return;
    if (status !== "authenticated" || !user) {
      syncedForUser.current = null;
      setRemoteIds(new Map());
      return;
    }
    if (syncedForUser.current === user.itemId) return;
    syncedForUser.current = user.itemId;

    let cancelled = false;
    void (async () => {
      try {
        const remote = await listFavourites(user.itemId);
        if (cancelled) return;

        const local = readLocal();
        const index = new Map<string, string>();
        for (const row of remote) if (row.ProductId) index.set(row.ProductId, row.ItemId);

        // Push anything the guest saved before signing in. Additive only — see
        // favouritesToCreate on why nothing is ever removed by a merge.
        for (const productId of favouritesToCreate(local, remote)) {
          const itemId = await addFavourite(user.itemId, productId);
          if (itemId) index.set(productId, itemId);
        }

        if (cancelled) return;
        setRemoteIds(index);
        setProductIds(mergeFavourites(local, remote));
      } catch {
        // Offline or transient — keep the local wishlist and try again next session. A
        // failed sync must never look like an emptied wishlist.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, user]);

  const toggle = useCallback(
    (productId: string) => {
      const removing = productIds.includes(productId);
      // Local state moves first: the heart should respond to the click, not to the network.
      setProductIds((prev) => (removing ? prev.filter((id) => id !== productId) : [...prev, productId]));

      if (!FAVOURITES_LIVE || status !== "authenticated" || !user) return;

      if (removing) {
        const rowId = remoteIds.get(productId);
        if (!rowId) return;
        setRemoteIds((prev) => {
          const next = new Map(prev);
          next.delete(productId);
          return next;
        });
        void removeFavourite(rowId).catch(() => undefined);
      } else {
        void addFavourite(user.itemId, productId)
          .then((itemId) => {
            if (itemId) setRemoteIds((prev) => new Map(prev).set(productId, itemId));
          })
          .catch(() => undefined);
      }
    },
    [productIds, remoteIds, status, user]
  );

  const value = useMemo<WishlistContextValue>(
    () => ({ productIds, has: (productId) => productIds.includes(productId), toggle }),
    [productIds, toggle]
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used within a WishlistProvider");
  return ctx;
}

export type { Favourite };
