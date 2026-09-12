"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createEntityApi, type EntityListParams, type EntityRecord } from "./collections";

export function useEntityList(schemaName: string, params: EntityListParams, enabled = true) {
  return useQuery({
    queryKey: ["entity", schemaName, params],
    queryFn: () => createEntityApi(schemaName).list(params),
    placeholderData: (prev) => prev,
    enabled,
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
