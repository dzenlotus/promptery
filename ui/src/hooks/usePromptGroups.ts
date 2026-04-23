import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { qk } from "../lib/query.js";

export function usePromptGroups() {
  return useQuery({
    queryKey: qk.promptGroups,
    queryFn: () => api.promptGroups.list(),
  });
}

export function usePromptGroup(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.promptGroup(id ?? ""),
    queryFn: () => api.promptGroups.get(id!),
    enabled: Boolean(id),
  });
}
