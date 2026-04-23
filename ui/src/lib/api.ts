import type {
  BackupInfo,
  Board,
  BoardWithRelations,
  Column,
  ColumnWithRelations,
  CreatePrimitiveInput,
  CreateTaskInput,
  ExportBundle,
  ExportOptions,
  ImportPreview,
  ImportResult,
  ImportStrategy,
  McpTool,
  Prompt,
  PromptGroup,
  PromptGroupWithPrompts,
  ResolvedTaskContext,
  Role,
  RoleWithRelations,
  Skill,
  Task,
  UpdatePrimitiveInput,
  UpdateTaskInput,
} from "./types.js";

export interface ApiIssue {
  field: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly field?: string;
  readonly issues?: ApiIssue[];

  constructor(
    message: string,
    opts: { status: number; field?: string; issues?: ApiIssue[] }
  ) {
    super(message);
    this.name = "ApiError";
    this.status = opts.status;
    this.field = opts.field;
    this.issues = opts.issues;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      field?: string;
      issues?: ApiIssue[];
    };
    const message = body.error ?? `Request failed: ${res.status}`;
    throw new ApiError(message, {
      status: res.status,
      field: body.field,
      issues: body.issues,
    });
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const json = (body: unknown) => JSON.stringify(body);

function primitiveResource<T>(base: string) {
  return {
    list: () => request<T[]>(base),
    get: (id: string) => request<T>(`${base}/${id}`),
    create: (data: CreatePrimitiveInput) =>
      request<T>(base, { method: "POST", body: json(data) }),
    update: (id: string, patch: UpdatePrimitiveInput) =>
      request<T>(`${base}/${id}`, { method: "PATCH", body: json(patch) }),
    delete: (id: string) => request<{ ok: true }>(`${base}/${id}`, { method: "DELETE" }),
  };
}

export const api = {
  boards: {
    list: () => request<Board[]>("/api/boards"),
    get: (id: string) => request<BoardWithRelations>(`/api/boards/${id}`),
    create: (name: string) => request<Board>("/api/boards", { method: "POST", body: json({ name }) }),
    update: (id: string, name: string) =>
      request<Board>(`/api/boards/${id}`, { method: "PATCH", body: json({ name }) }),
    delete: (id: string) => request<{ ok: true }>(`/api/boards/${id}`, { method: "DELETE" }),
    setRole: (id: string, roleId: string | null) =>
      request<Board>(`/api/boards/${id}/role`, {
        method: "PUT",
        body: json({ role_id: roleId }),
      }),
    getPrompts: (id: string) => request<Prompt[]>(`/api/boards/${id}/prompts`),
    setPrompts: (id: string, promptIds: string[]) =>
      request<Prompt[]>(`/api/boards/${id}/prompts`, {
        method: "PUT",
        body: json({ prompt_ids: promptIds }),
      }),
  },
  columns: {
    list: (boardId: string) => request<Column[]>(`/api/boards/${boardId}/columns`),
    get: (id: string) => request<ColumnWithRelations>(`/api/columns/${id}`),
    create: (boardId: string, name: string) =>
      request<Column>(`/api/boards/${boardId}/columns`, { method: "POST", body: json({ name }) }),
    update: (id: string, patch: { name?: string; position?: number }) =>
      request<Column>(`/api/columns/${id}`, { method: "PATCH", body: json(patch) }),
    delete: (id: string) => request<{ ok: true }>(`/api/columns/${id}`, { method: "DELETE" }),
    setRole: (id: string, roleId: string | null) =>
      request<Column>(`/api/columns/${id}/role`, {
        method: "PUT",
        body: json({ role_id: roleId }),
      }),
    getPrompts: (id: string) => request<Prompt[]>(`/api/columns/${id}/prompts`),
    setPrompts: (id: string, promptIds: string[]) =>
      request<Prompt[]>(`/api/columns/${id}/prompts`, {
        method: "PUT",
        body: json({ prompt_ids: promptIds }),
      }),
  },
  tasks: {
    list: (boardId: string) => request<Task[]>(`/api/boards/${boardId}/tasks`),
    get: (id: string) => request<Task>(`/api/tasks/${id}`),
    create: (boardId: string, data: CreateTaskInput) =>
      request<Task>(`/api/boards/${boardId}/tasks`, { method: "POST", body: json(data) }),
    update: (id: string, data: UpdateTaskInput) =>
      request<Task>(`/api/tasks/${id}`, { method: "PATCH", body: json(data) }),
    move: (id: string, columnId: string, position: number) =>
      request<Task>(`/api/tasks/${id}/move`, {
        method: "POST",
        body: json({ column_id: columnId, position }),
      }),
    delete: (id: string) => request<{ ok: true }>(`/api/tasks/${id}`, { method: "DELETE" }),
    setRole: (id: string, roleId: string | null) =>
      request<Task>(`/api/tasks/${id}/role`, {
        method: "PUT",
        body: json({ role_id: roleId }),
      }),
    addPrompt: (id: string, promptId: string) =>
      request<Task>(`/api/tasks/${id}/prompts`, {
        method: "POST",
        body: json({ prompt_id: promptId }),
      }),
    removePrompt: (id: string, promptId: string) =>
      request<Task>(`/api/tasks/${id}/prompts/${promptId}`, { method: "DELETE" }),
    addSkill: (id: string, skillId: string) =>
      request<Task>(`/api/tasks/${id}/skills`, {
        method: "POST",
        body: json({ skill_id: skillId }),
      }),
    removeSkill: (id: string, skillId: string) =>
      request<Task>(`/api/tasks/${id}/skills/${skillId}`, { method: "DELETE" }),
    addMcpTool: (id: string, toolId: string) =>
      request<Task>(`/api/tasks/${id}/mcp_tools`, {
        method: "POST",
        body: json({ mcp_tool_id: toolId }),
      }),
    removeMcpTool: (id: string, toolId: string) =>
      request<Task>(`/api/tasks/${id}/mcp_tools/${toolId}`, { method: "DELETE" }),
    context: (id: string) => request<ResolvedTaskContext>(`/api/tasks/${id}/context`),
  },
  prompts: primitiveResource<Prompt>("/api/prompts"),
  promptGroups: {
    list: () => request<PromptGroup[]>("/api/prompt-groups"),
    get: (id: string) =>
      request<PromptGroupWithPrompts>(`/api/prompt-groups/${id}`),
    create: (data: { name: string; color?: string | null; prompt_ids?: string[] }) =>
      request<PromptGroupWithPrompts>("/api/prompt-groups", {
        method: "POST",
        body: json(data),
      }),
    update: (id: string, patch: { name?: string; color?: string | null; position?: number }) =>
      request<PromptGroupWithPrompts>(`/api/prompt-groups/${id}`, {
        method: "PATCH",
        body: json(patch),
      }),
    delete: (id: string) =>
      request<{ ok: true }>(`/api/prompt-groups/${id}`, { method: "DELETE" }),
    setPrompts: (id: string, promptIds: string[]) =>
      request<PromptGroupWithPrompts>(`/api/prompt-groups/${id}/prompts`, {
        method: "PUT",
        body: json({ prompt_ids: promptIds }),
      }),
    addPrompt: (id: string, promptId: string) =>
      request<PromptGroupWithPrompts>(`/api/prompt-groups/${id}/prompts`, {
        method: "POST",
        body: json({ prompt_id: promptId }),
      }),
    removePrompt: (id: string, promptId: string) =>
      request<PromptGroupWithPrompts>(
        `/api/prompt-groups/${id}/prompts/${promptId}`,
        { method: "DELETE" }
      ),
    reorder: (ids: string[]) =>
      request<PromptGroup[]>("/api/prompt-groups/reorder", {
        method: "POST",
        body: json({ ids }),
      }),
  },
  skills: primitiveResource<Skill>("/api/skills"),
  mcp_tools: primitiveResource<McpTool>("/api/mcp_tools"),
  data: {
    exportBundle: (options: ExportOptions) =>
      request<ExportBundle>("/api/data/export", { method: "POST", body: json(options) }),
    importPreview: (bundle: unknown, strategy: ImportStrategy) =>
      request<ImportPreview>("/api/data/import/preview", {
        method: "POST",
        body: json({ bundle, strategy }),
      }),
    importApply: (bundle: unknown, strategy: ImportStrategy) =>
      request<ImportResult>("/api/data/import/apply", {
        method: "POST",
        body: json({ bundle, strategy }),
      }),
    listBackups: () => request<BackupInfo[]>("/api/data/backups"),
    createBackup: (name?: string) =>
      request<BackupInfo>("/api/data/backups", {
        method: "POST",
        body: json(name ? { name } : {}),
      }),
    restoreBackup: (filename: string) =>
      request<{ ok: true; restored: string; safetyBackup: string | null }>(
        `/api/data/backups/${encodeURIComponent(filename)}/restore`,
        { method: "POST" }
      ),
    deleteBackup: (filename: string) =>
      request<{ ok: true }>(
        `/api/data/backups/${encodeURIComponent(filename)}`,
        { method: "DELETE" }
      ),
  },
  settings: {
    list: (prefix?: string) =>
      request<{ key: string; value: unknown; updated_at: number }[]>(
        prefix ? `/api/settings?prefix=${encodeURIComponent(prefix)}` : "/api/settings"
      ),
    get: (key: string) =>
      request<{ key: string; value: unknown }>(`/api/settings/${encodeURIComponent(key)}`),
    set: (key: string, value: unknown) =>
      request<{ key: string; value: unknown; updated_at: number }>(
        `/api/settings/${encodeURIComponent(key)}`,
        { method: "PUT", body: json({ value }) }
      ),
    setBulk: (entries: Record<string, unknown>) =>
      request<{ key: string; value: unknown; updated_at: number }[]>(
        "/api/settings/bulk",
        { method: "POST", body: json({ entries }) }
      ),
    delete: (key: string) =>
      request<{ ok: true; deleted: boolean }>(
        `/api/settings/${encodeURIComponent(key)}`,
        { method: "DELETE" }
      ),
  },
  roles: {
    list: () => request<Role[]>("/api/roles"),
    get: (id: string) => request<RoleWithRelations>(`/api/roles/${id}`),
    create: (data: CreatePrimitiveInput) =>
      request<Role>("/api/roles", { method: "POST", body: json(data) }),
    update: (id: string, patch: UpdatePrimitiveInput) =>
      request<Role>(`/api/roles/${id}`, { method: "PATCH", body: json(patch) }),
    delete: (id: string) => request<{ ok: true }>(`/api/roles/${id}`, { method: "DELETE" }),
    tasksCount: (id: string) => request<{ count: number }>(`/api/roles/${id}/tasks-count`),
    setPrompts: (id: string, promptIds: string[]) =>
      request<RoleWithRelations>(`/api/roles/${id}/prompts`, {
        method: "PUT",
        body: json({ prompt_ids: promptIds }),
      }),
    setSkills: (id: string, skillIds: string[]) =>
      request<RoleWithRelations>(`/api/roles/${id}/skills`, {
        method: "PUT",
        body: json({ skill_ids: skillIds }),
      }),
    setMcpTools: (id: string, toolIds: string[]) =>
      request<RoleWithRelations>(`/api/roles/${id}/mcp_tools`, {
        method: "PUT",
        body: json({ mcp_tool_ids: toolIds }),
      }),
  },
};
