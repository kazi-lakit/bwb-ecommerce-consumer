import { useMemo } from "react";
import { useEntityList, useEntityListBatch } from "./hooks";
import type { EntityRecord } from "./collections";

/**
 * Reads real stock levels from `WarehouseInventory` — a live Data Gateway schema today
 * (unlike Cart/Order/CommerceCustomer in `commerce.ts`, which are still a draft). No feature
 * flag needed here: this works right now, for any signed-in-or-not visitor, because
 * `WarehouseInventory.ReadAccessLevel` is (deliberately) Public — see the correction note in
 * `P0_POLICY_FIXES.md` explaining why that schema, alone among the non-catalog entities,
 * stays public.
 *
 * The Data Gateway has no server-side aggregation (`DATA_GATEWAY_STORAGE_FEATURES_AND_SECURITY.md`
 * item B6), so "total available across every warehouse" is summed client-side over a bounded
 * page — fine at today's catalog/warehouse scale, worth revisiting if either grows large.
 */

const DEFAULT_MAX_ROWS = 200;

export interface VariantAvailability {
  /** Sum of AvailableToSell across every warehouse carrying this variant. 0 if untracked/unknown. */
  totalAvailable: number;
  /** True once a real WarehouseInventory row for this variant has been seen — lets callers tell "0 in stock" apart from "not tracked yet". */
  isTracked: boolean;
}

/**
 * Looks up availability for a set of variant ids in one query. Returns a map keyed by
 * VariantId; a variant missing from the map hasn't loaded yet (see `isLoading`).
 *
 * `maxRows` bounds the one query this issues (rows = variants × warehouses carrying them) —
 * raise it for a page listing many variants/warehouses, at the cost of a larger single
 * request; there's no way to ask the gateway to aggregate server-side instead (see the
 * module doc comment above).
 */
/** Shared by `useVariantAvailability` and `useCartStock` so the aggregation logic (sum
 * `AvailableToSell` per variant across every warehouse row) lives in one place regardless
 * of whether the `WarehouseInventory` rows came from a standalone query or a batched one. */
function aggregateByVariant(rows: EntityRecord[]): Map<string, VariantAvailability> {
  const map = new Map<string, VariantAvailability>();
  for (const row of rows) {
    const variantId = row.VariantId as string | undefined;
    if (!variantId) continue;
    const available = (row.AvailableToSell as number) ?? 0;
    const existing = map.get(variantId);
    map.set(variantId, { totalAvailable: (existing?.totalAvailable ?? 0) + available, isTracked: true });
  }
  return map;
}

export function useVariantAvailability(variantIds: string[], maxRows: number = DEFAULT_MAX_ROWS) {
  const ids = useMemo(() => Array.from(new Set(variantIds.filter(Boolean))), [variantIds]);
  const query = useEntityList(
    "WarehouseInventory",
    { where: { VariantId: { in: ids } }, pageSize: maxRows },
    ids.length > 0
  );

  const byVariant = useMemo(() => aggregateByVariant(query.data?.items ?? []), [query.data]);

  return { availability: byVariant, isLoading: query.isLoading };
}

/** Convenience for a single variant — same query machinery, one id in, one result out. */
export function useSingleVariantAvailability(variantId: string | undefined): VariantAvailability & { isLoading: boolean } {
  const { availability, isLoading } = useVariantAvailability(variantId ? [variantId] : []);
  const result = variantId ? availability.get(variantId) : undefined;
  return { totalAvailable: result?.totalAvailable ?? 0, isTracked: result?.isTracked ?? false, isLoading };
}

export interface CartLineStock {
  /** Total sellable across every warehouse. */
  available: number;
  /** True when this line should be capped at `available` — tracked, and no backorder. */
  enforced: boolean;
  /** Max quantity this line may take, or null when nothing constrains it. */
  limit: number | null;
  /** Quantity already in the cart beyond what's available. 0 when fine. */
  shortfall: number;
}

interface StockCheckLine {
  key: string;
  productId: string;
  variantId?: string;
  quantity: number;
}

/**
 * Per-line stock state for a cart.
 *
 * The cart stores a price and a quantity, not a stock position — so a line added when six
 * were available is still a line of six long after someone else bought them. This re-reads
 * availability for everything in the cart so the quantity stepper can cap, and so checkout
 * can refuse before taking money.
 *
 * `IsInventoryTracked`/`AllowBackorder` live on the variant (falling back to the product, as
 * `ProductDetailPage` does), and a cart line carries neither — so variants are fetched by
 * their `ProductId`, which every cart line does carry. That over-fetches sibling variants of
 * the same product; it avoids assuming the generated `ProductVariantFilterInput` supports an
 * `ItemId: {in: [...]}` filter, which is not something to guess at without a live schema to
 * check against.
 */
export function useCartStock(items: StockCheckLine[]) {
  const variantIds = useMemo(
    () => Array.from(new Set(items.map((item) => item.variantId).filter((id): id is string => Boolean(id)))),
    [items]
  );
  const productIds = useMemo(
    () => Array.from(new Set(items.map((item) => item.productId).filter(Boolean))),
    [items]
  );

  // `WarehouseInventory` (by variant) and `ProductVariant` (by product) are independent of
  // each other — neither needs the other's result — so one round trip instead of two.
  // (Not routed through `useVariantAvailability` itself, since that hook is also used
  // standalone elsewhere and shouldn't always pull in a `ProductVariant` fetch alongside it.)
  const stockBatch = useEntityListBatch([
    { key: "inventory", schemaName: "WarehouseInventory", params: { where: { VariantId: { in: variantIds } }, pageSize: DEFAULT_MAX_ROWS }, enabled: variantIds.length > 0 },
    { key: "variants", schemaName: "ProductVariant", params: { where: { ProductId: { in: productIds } }, pageSize: DEFAULT_MAX_ROWS }, enabled: productIds.length > 0 },
  ]);
  const stockLoading = stockBatch.isLoading;
  const availability = useMemo(() => aggregateByVariant(stockBatch.data?.inventory?.items ?? []), [stockBatch.data]);
  const variants = { data: stockBatch.data?.variants, isLoading: stockBatch.isLoading };

  const flagsByVariant = useMemo(() => {
    const map = new Map<string, { tracked: boolean; backorder: boolean }>();
    for (const row of variants.data?.items ?? []) {
      const id = (row.ItemId ?? row.itemId) as string | undefined;
      if (!id) continue;
      map.set(id, {
        tracked: (row.IsInventoryTracked as boolean | undefined) ?? true,
        backorder: (row.AllowBackorder as boolean | undefined) ?? false,
      });
    }
    return map;
  }, [variants.data]);

  const byKey = useMemo(() => {
    const map = new Map<string, CartLineStock>();
    for (const item of items) {
      const stock = item.variantId ? availability.get(item.variantId) : undefined;
      const flags = item.variantId ? flagsByVariant.get(item.variantId) : undefined;
      // Same rule as the product page: untracked or backorderable means never block. An
      // unknown variant (no inventory row) is untracked, not out of stock.
      const enforced = Boolean(stock?.isTracked) && (flags?.tracked ?? true) && !(flags?.backorder ?? false);
      const available = stock?.totalAvailable ?? 0;
      map.set(item.key, {
        available,
        enforced,
        limit: enforced ? available : null,
        shortfall: enforced ? Math.max(0, item.quantity - available) : 0,
      });
    }
    return map;
  }, [items, availability, flagsByVariant]);

  const isLoading = stockLoading || variants.isLoading;

  return {
    byKey,
    isLoading,
    /** True when at least one line now wants more than exists. Never true while loading. */
    hasShortfall: !isLoading && Array.from(byKey.values()).some((line) => line.shortfall > 0),
  };
}
