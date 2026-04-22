import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { qk } from "../lib/query.js";
import type { Board } from "../lib/types.js";

export function useBoards() {
  return useQuery({ queryKey: qk.boards, queryFn: api.boards.list });
}

export function useCreateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.boards.create(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.boards }),
  });
}

export function useUpdateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.boards.update(id, name),
    onSuccess: (updated: Board) => {
      qc.setQueryData<Board[]>(qk.boards, (old) =>
        old?.map((b) => (b.id === updated.id ? updated : b)) ?? []
      );
    },
  });
}

export function useDeleteBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.boards.delete(id),
    onSuccess: (_res, id) => {
      qc.setQueryData<Board[]>(qk.boards, (old) => old?.filter((b) => b.id !== id) ?? []);
    },
  });
}
