import type {
  Board,
  Column,
  CreatePrimitiveInput,
  CreateTaskInput,
  McpTool,
  Prompt,
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
    get: (id: string) => request<Board>(`/api/boards/${id}`),
    create: (name: string) => request<Board>("/api/boards", { method: "POST", body: json({ name }) }),
    update: (id: string, name: string) =>
      request<Board>(`/api/boards/${id}`, { method: "PATCH", body: json({ name }) }),
    delete: (id: string) => request<{ ok: true }>(`/api/boards/${id}`, { method: "DELETE" }),
  },
  columns: {
    list: (boardId: string) => request<Column[]>(`/api/boards/${boardId}/columns`),
    create: (boardId: string, name: string) =>
      request<Column>(`/api/boards/${boardId}/columns`, { method: "POST", body: json({ name }) }),
    update: (id: string, patch: { name?: string; position?: number }) =>
      request<Column>(`/api/columns/${id}`, { method: "PATCH", body: json(patch) }),
    delete: (id: string) => request<{ ok: true }>(`/api/columns/${id}`, { method: "DELETE" }),
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
  },
  prompts: primitiveResource<Prompt>("/api/prompts"),
  skills: primitiveResource<Skill>("/api/skills"),
  mcp_tools: primitiveResource<McpTool>("/api/mcp_tools"),
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
