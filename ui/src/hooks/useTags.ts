import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { qk } from "../lib/query.js";
import type { CreateTagInput, Tag, TagKind, UpdateTagInput } from "../lib/types.js";

export function useTags(kind?: TagKind) {
  return useQuery({
    queryKey: qk.tags(kind),
    queryFn: () => api.tags.list(kind),
  });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTagInput) => api.tags.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tags"] }),
  });
}

export function useUpdateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateTagInput }) =>
      api.tags.update(id, patch),
    onSuccess: (updated: Tag) => {
      qc.setQueryData<Tag[]>(["tags"], (old) =>
        old?.map((t) => (t.id === updated.id ? updated : t)) ?? []
      );
    },
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.tags.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tags"] }),
  });
}
