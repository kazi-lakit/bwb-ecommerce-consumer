import { useMemo } from "react";
import { useEntityList } from "./hooks";

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
export function useVariantAvailability(variantIds: string[], maxRows: number = DEFAULT_MAX_ROWS) {
  const ids = useMemo(() => Array.from(new Set(variantIds.filter(Boolean))), [variantIds]);
  const query = useEntityList(
    "WarehouseInventory",
    { where: { VariantId: { in: ids } }, pageSize: maxRows },
    ids.length > 0
  );

  const byVariant = useMemo(() => {
    const map = new Map<string, VariantAvailability>();
    for (const row of query.data?.items ?? []) {
      const variantId = row.VariantId as string | undefined;
      if (!variantId) continue;
      const available = (row.AvailableToSell as number) ?? 0;
      const existing = map.get(variantId);
      map.set(variantId, { totalAvailable: (existing?.totalAvailable ?? 0) + available, isTracked: true });
    }
    return map;
  }, [query.data]);

  return { availability: byVariant, isLoading: query.isLoading };
}

/** Convenience for a single variant — same query machinery, one id in, one result out. */
export function useSingleVariantAvailability(variantId: string | undefined): VariantAvailability & { isLoading: boolean } {
  const { availability, isLoading } = useVariantAvailability(variantId ? [variantId] : []);
  const result = variantId ? availability.get(variantId) : undefined;
  return { totalAvailable: result?.totalAvailable ?? 0, isTracked: result?.isTracked ?? false, isLoading };
}
