import { useQuery } from "@tanstack/react-query";
import { api, type MetaInfo } from "../lib/api.js";
import { qk } from "../lib/query.js";

export function useMeta() {
  return useQuery<MetaInfo>({
    queryKey: qk.meta,
    queryFn: () => api.meta.get(),
    staleTime: Infinity,
  });
}
