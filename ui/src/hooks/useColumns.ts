import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "../lib/api.js";
import { qk } from "../lib/query.js";
import type { Column } from "../lib/types.js";

export function useColumns(boardId: string | null | undefined) {
  return useQuery({
    queryKey: qk.columns(boardId ?? ""),
    queryFn: () => api.columns.list(boardId as string),
    enabled: Boolean(boardId),
  });
}

export function useCreateColumn(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.columns.create(boardId, name),
    onSuccess: (created: Column) => {
      qc.setQueryData<Column[]>(qk.columns(boardId), (old) =>
        old ? [...old, created] : [created]
      );
    },
  });
}

export function useUpdateColumn(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.columns.update(id, { name }),
    onSuccess: (updated: Column) => {
      qc.setQueryData<Column[]>(qk.columns(boardId), (old) =>
        old?.map((c) => (c.id === updated.id ? updated : c)) ?? []
      );
    },
  });
}

export function useDeleteColumn(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.columns.delete(id),
    onSuccess: (_res, id) => {
      qc.setQueryData<Column[]>(qk.columns(boardId), (old) =>
        old?.filter((c) => c.id !== id) ?? []
      );
    },
  });
}

/**
 * Reorders columns for a board with optimistic cache update.
 *
 * On mutation start (`onMutate`): writes the new order into the cache
 * immediately so the UI reflects the drop without waiting for the server.
 * On error: rolls back to the previous order and shows a toast.
 * On success: the `column.reordered` WS event will confirm the new order;
 * no extra cache work needed here.
 */
export function useReorderColumns(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (columnIds: string[]) => api.columns.reorder(boardId, columnIds),
    onMutate: async (columnIds: string[]) => {
      await qc.cancelQueries({ queryKey: qk.columns(boardId) });
      const previous = qc.getQueryData<Column[]>(qk.columns(boardId));
      // Apply new order optimistically, preserving all column data.
      qc.setQueryData<Column[]>(qk.columns(boardId), (old) => {
        if (!old) return old;
        const byId = new Map(old.map((c) => [c.id, c]));
        return columnIds
          .map((id, i) => {
            const col = byId.get(id);
            return col ? { ...col, position: i + 1 } : null;
          })
          .filter((c): c is Column => c !== null);
      });
      return { previous };
    },
    onError: (_err, _columnIds, context) => {
      if (context?.previous) {
        qc.setQueryData(qk.columns(boardId), context.previous);
      }
      toast.error("Failed to reorder columns — order restored");
    },
  });
}
