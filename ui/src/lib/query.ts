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
  spaces: ["spaces"] as const,
  space: (id: string) => ["space", id] as const,
  boards: ["boards"] as const,
  tasks: (boardId: string) => ["tasks", boardId] as const,
  task: (taskId: string) => ["task", taskId] as const,
  columns: (boardId: string) => ["columns", boardId] as const,
  prompts: ["prompts"] as const,
  skills: ["skills"] as const,
  mcpTools: ["mcp_tools"] as const,
  roles: ["roles"] as const,
  role: (id: string) => ["role", id] as const,
  setting: (key: string) => ["setting", key] as const,
  settings: ["settings"] as const,
  promptGroups: ["prompt-groups"] as const,
  promptGroup: (id: string) => ["prompt-group", id] as const,
  tags: ["tags"] as const,
  tag: (id: string) => ["tag", id] as const,
  /** Per-prompt tag map for sidebar chip rendering. */
  tagsByPrompt: ["tags-by-prompt"] as const,
  board: (id: string) => ["board", id] as const,
  column: (id: string) => ["column", id] as const,
  taskContext: (id: string) => ["task-context", id] as const,
  taskWithLocation: (idOrSlug: string) =>
    ["task-with-location", idOrSlug] as const,
  taskEvents: (id: string) => ["task-events", id] as const,
  taskAttachments: (taskId: string) => ["task-attachments", taskId] as const,
  meta: ["meta"] as const,
  backups: ["backups"] as const,
};
