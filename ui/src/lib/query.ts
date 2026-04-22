import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

export const qk = {
  boards: ["boards"] as const,
  tasks: (boardId: string) => ["tasks", boardId] as const,
  columns: (boardId: string) => ["columns", boardId] as const,
  tags: (kind?: string) => (kind ? (["tags", kind] as const) : (["tags"] as const)),
};
