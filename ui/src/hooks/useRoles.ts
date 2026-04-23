import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { qk } from "../lib/query.js";

export function useRoles() {
  return useQuery({
    queryKey: qk.roles,
    queryFn: () => api.roles.list(),
  });
}

export function useRole(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.role(id ?? ""),
    queryFn: () => api.roles.get(id as string),
    enabled: Boolean(id),
  });
}
