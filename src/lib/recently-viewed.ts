import { useCallback, useEffect, useState } from "react";

/**
 * The products this browser has looked at, most recent first.
 *
 * Per-browser and anonymous by design: it's stored in localStorage, never sent anywhere, and
 * needs no account. That's the right trade for a browsing convenience — it works for signed-out
 * visitors, who are most of them, and it means no view history accumulates server-side for
 * something this minor. The cost is that it doesn't follow you between devices; if that's ever
 * wanted it belongs on `CommerceCustomer`, as a deliberate decision about storing behavioural
 * data rather than a side effect of a UI nicety.
 */

const STORAGE_KEY = "recently-viewed";
/** Enough for a rail plus some churn; small enough to stay cheap to fetch in one query. */
const MAX_ENTRIES = 12;

function read(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    // Private mode, disabled storage, or something else wrote garbage to the key. A browsing
    // convenience is never worth breaking a page over.
    return [];
  }
}

function write(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // As above.
  }
}

/** Notifies hooks in other components of the same page — `storage` only fires across tabs. */
const listeners = new Set<(ids: string[]) => void>();

export function recordProductView(productId: string): void {
  if (!productId) return;
  const next = [productId, ...read().filter((id) => id !== productId)].slice(0, MAX_ENTRIES);
  write(next);
  for (const listener of listeners) listener(next);
}

export function useRecentlyViewed(excludeProductId?: string): string[] {
  const [ids, setIds] = useState<string[]>(() => read());

  useEffect(() => {
    const listener = (next: string[]) => setIds(next);
    listeners.add(listener);
    // Another tab's view should show up here too.
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setIds(read());
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return excludeProductId ? ids.filter((id) => id !== excludeProductId) : ids;
}

/**
 * A `where` that fetches exactly these products, in one query.
 *
 * Built as an `or` of `eq` clauses rather than `ItemId: { in: [...] }` — `or` is a shape this
 * app already relies on (the listing page's search), whereas whether the generated filter
 * input supports `in` on `ItemId` specifically isn't something to assume without a live schema
 * to check against.
 */
export function whereProductIds(ids: string[]): Record<string, unknown> | undefined {
  if (ids.length === 0) return undefined;
  return { or: ids.map((id) => ({ ItemId: { eq: id } })) };
}

/** Restores the most-recent-first order the query doesn't preserve. */
export function sortByViewOrder<T>(records: T[], ids: string[], idOf: (record: T) => string): T[] {
  const position = new Map(ids.map((id, i) => [id, i]));
  return [...records].sort((a, b) => (position.get(idOf(a)) ?? 999) - (position.get(idOf(b)) ?? 999));
}

/** Clears the history — for a "don't keep this" control, and used by the account page's reset. */
export function clearRecentlyViewed(): void {
  write([]);
  for (const listener of listeners) listener([]);
}
