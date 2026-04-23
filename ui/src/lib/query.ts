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
  task: (taskId: string) => ["task", taskId] as const,
  columns: (boardId: string) => ["columns", boardId] as const,
  prompts: ["prompts"] as const,
  skills: ["skills"] as const,
  mcpTools: ["mcp_tools"] as const,
  roles: ["roles"] as const,
  role: (id: string) => ["role", id] as const,
};
