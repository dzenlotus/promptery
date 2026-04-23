import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
