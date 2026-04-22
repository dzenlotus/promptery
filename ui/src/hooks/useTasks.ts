import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { qk } from "../lib/query.js";
import type { CreateTaskInput, Task, UpdateTaskInput } from "../lib/types.js";

export function useTasks(boardId: string | null | undefined) {
  return useQuery({
    queryKey: qk.tasks(boardId ?? ""),
    queryFn: () => api.tasks.list(boardId as string),
    enabled: Boolean(boardId),
  });
}

export function useCreateTask(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => api.tasks.create(boardId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tasks(boardId) }),
  });
}

export function useUpdateTask(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateTaskInput }) =>
      api.tasks.update(id, patch),
    onSuccess: (updated: Task) => {
      qc.setQueryData<Task[]>(qk.tasks(boardId), (old) =>
        old?.map((t) => (t.id === updated.id ? { ...t, ...updated, tags: t.tags } : t)) ?? []
      );
    },
  });
}

export function useDeleteTask(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.tasks.delete(id),
    onSuccess: (_res, id) => {
      qc.setQueryData<Task[]>(qk.tasks(boardId), (old) => old?.filter((t) => t.id !== id) ?? []);
    },
  });
}

export function useMoveTask(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      columnId,
      position,
    }: {
      id: string;
      columnId: string;
      position: number;
    }) => api.tasks.move(id, columnId, position),
    // Optimistic cache update happens in KanbanBoard before mutate(); we skip
    // onSuccess invalidation so the card doesn't flicker through a refetch.
    // The WS `task.moved` broadcast syncs other tabs; failures roll back here.
    onError: () => qc.invalidateQueries({ queryKey: qk.tasks(boardId) }),
  });
}
