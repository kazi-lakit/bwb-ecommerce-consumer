"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createEntityApi, type EntityListParams, type EntityRecord } from "./collections";

export function useEntityList(schemaName: string, params: EntityListParams, enabled = true) {
  return useQuery({
    queryKey: ["entity", schemaName, params],
    queryFn: () => createEntityApi(schemaName).list(params),
    placeholderData: (prev) => prev,
    enabled,
  });
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
