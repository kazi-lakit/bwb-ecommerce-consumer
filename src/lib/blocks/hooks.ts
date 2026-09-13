"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createEntityApi, runBatchList, type EntityListParams, type EntityRecord } from "./collections";

export function useEntityList(schemaName: string, params: EntityListParams, enabled = true) {
  return useQuery({
    queryKey: ["entity", schemaName, params],
    queryFn: () => createEntityApi(schemaName).list(params),
    placeholderData: (prev) => prev,
    enabled,
  });
}

export interface EntityListBatchRequest {
  /** Result key — read back via `.data?.[key]`, independent of the GraphQL alias used on the wire. */
  key: string;
  schemaName: string;
  params?: EntityListParams;
  /** Same meaning as `useEntityList`'s `enabled` — an idle request is dropped from the combined query entirely, not sent as an empty one. */
  enabled?: boolean;
}

/**
 * The batched form of `useEntityList` — combines every *independent* request in
 * `requests` (different schemas, or the same schema with different `where`) into ONE
 * GraphQL round trip instead of one per request, via `collections.ts`'s
 * `runBatchList`. Use this wherever a component currently calls `useEntityList`
 * several times side by side for data that doesn't depend on another call's result —
 * a page loading two or three unrelated lists on mount, a stock-check that reads both
 * `WarehouseInventory` and `ProductVariant`.
 *
 * Returns `.data` as `Record<key, ListResult>` — reads back exactly like N separate
 * `useEntityList().data` objects, just fetched together. A request with
 * `enabled: false` is left out of both the network call and (until re-enabled) the
 * returned record, the same way a disabled `useEntityList` never populates `.data`.
 */
export function useEntityListBatch(requests: EntityListBatchRequest[]) {
  const active = requests.filter((r) => r.enabled !== false);
  return useQuery({
    queryKey: ["entity-batch", active.map((r) => [r.key, r.schemaName, r.params])],
    queryFn: () => runBatchList(active.map(({ key, schemaName, params }) => ({ key, schemaName, params }))),
    placeholderData: (prev) => prev,
    enabled: active.length > 0,
  });
}

/**
 * Paged reads that accumulate, for "load more" lists.
 *
 * The alternative — numbered pages — doesn't work for the product listing, because its
 * facets, price range, sort and stock filter are all computed client-side (the Data Gateway
 * can't filter on embedded attribute arrays, can't sort on a confirmed input type, and can't
 * reach WarehouseInventory from a Product query). Numbered pages would mean facets describing
 * only the page you happen to be on, and a filter that hides most of page 2 while page 3 sits
 * unexamined. Accumulating keeps every client-side filter operating over one growing set, and
 * `loaded`/`totalCount` lets the UI say plainly how much of the catalog that set covers.
 */
export function useEntityInfiniteList(
  schemaName: string,
  params: Omit<EntityListParams, "pageNo"> & { pageSize: number },
  enabled = true
) {
  const query = useInfiniteQuery({
    queryKey: ["entity-infinite", schemaName, params],
    queryFn: ({ pageParam }) => createEntityApi(schemaName).list({ ...params, pageNo: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, page) => n + page.items.length, 0);
      return loaded < lastPage.totalCount ? allPages.length + 1 : undefined;
    },
    enabled,
  });

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return {
    items,
    totalCount: query.data?.pages[0]?.totalCount ?? 0,
    loaded: items.length,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
  };
}

export function useEntityItem(schemaName: string, itemId?: string) {
  return useQuery({
    queryKey: ["entity-item", schemaName, itemId],
    queryFn: () => createEntityApi(schemaName).get(itemId!),
    enabled: Boolean(itemId),
  });
}

export function useEntityMutations(schemaName: string) {
  const qc = useQueryClient();
  const api = createEntityApi(schemaName);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["entity", schemaName] });
    qc.invalidateQueries({ queryKey: ["entity-item", schemaName] });
  };

  return {
    create: useMutation({ mutationFn: (payload: Record<string, unknown>) => api.create(payload), onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ itemId, payload }: { itemId: string; payload: Record<string, unknown> }) => api.update(itemId, payload),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (record: EntityRecord) => api.remove((record.ItemId ?? record.itemId) as string), onSuccess: invalidate }),
  };
}
