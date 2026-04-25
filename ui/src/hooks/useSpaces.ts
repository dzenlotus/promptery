import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { qk } from "../lib/query.js";
import type { Space } from "../lib/types.js";

export function useSpaces() {
  return useQuery({ queryKey: qk.spaces, queryFn: api.spaces.list });
}

export function useSpace(id: string | null | undefined) {
  return useQuery({
    queryKey: id ? qk.space(id) : qk.space(""),
    queryFn: () => api.spaces.get(id as string),
    enabled: !!id,
  });
}

/** The default space, derived from the spaces list — guaranteed by migration 009. */
export function useDefaultSpace(): Space | undefined {
  const { data } = useSpaces();
  return data?.find((s) => s.is_default);
}

export function useCreateSpace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; prefix: string; description?: string }) =>
      api.spaces.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.spaces });
    },
  });
}

export function useUpdateSpace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: { name?: string; prefix?: string; description?: string | null };
    }) => api.spaces.update(id, patch),
    onSuccess: (updated: Space) => {
      qc.setQueryData<Space[]>(qk.spaces, (old) =>
        old?.map((s) => (s.id === updated.id ? updated : s)) ?? []
      );
      qc.invalidateQueries({ queryKey: qk.space(updated.id) });
    },
  });
}

export function useDeleteSpace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.spaces.delete(id),
    onSuccess: (_res, id) => {
      qc.setQueryData<Space[]>(qk.spaces, (old) => old?.filter((s) => s.id !== id) ?? []);
    },
  });
}

export function useMoveBoardToSpace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      boardId,
      spaceId,
      position,
    }: {
      boardId: string;
      spaceId: string;
      position?: number;
    }) => api.boards.moveToSpace(boardId, spaceId, position),
    onSuccess: (_res, { boardId }) => {
      // Boards list / per-board detail and tasks all need fresh slugs.
      qc.invalidateQueries({ queryKey: qk.boards });
      qc.invalidateQueries({ queryKey: qk.board(boardId) });
      qc.invalidateQueries({ queryKey: qk.tasks(boardId) });
      qc.invalidateQueries({ queryKey: qk.spaces });
    },
  });
}

export function useReorderSpaces() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.spaces.reorder(ids),
    onSuccess: (updated) => {
      qc.setQueryData(qk.spaces, updated);
    },
  });
}

export function useReorderBoards() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ spaceId, ids }: { spaceId: string; ids: string[] }) =>
      api.boards.reorder(spaceId, ids),
    onSuccess: () => {
      // The API returns only the affected space's boards; safest is to
      // invalidate the whole list so other-space rows stay correct.
      qc.invalidateQueries({ queryKey: qk.boards });
    },
  });
}
