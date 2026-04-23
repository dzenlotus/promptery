import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { qk } from "../lib/query.js";

export function usePrompts() {
  return useQuery({
    queryKey: qk.prompts,
    queryFn: () => api.prompts.list(),
  });
}
