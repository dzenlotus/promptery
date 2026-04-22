import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { qk } from "../lib/query.js";

export function useColumns(boardId: string | null | undefined) {
  return useQuery({
    queryKey: qk.columns(boardId ?? ""),
    queryFn: () => api.columns.list(boardId as string),
    enabled: Boolean(boardId),
  });
}
