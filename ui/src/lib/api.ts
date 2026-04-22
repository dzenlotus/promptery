import type {
  Board,
  Column,
  CreateTagInput,
  CreateTaskInput,
  Tag,
  TagKind,
  Task,
  TaskFull,
  UpdateTagInput,
  UpdateTaskInput,
} from "./types.js";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body?.error ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const json = (body: unknown) => JSON.stringify(body);

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
    get: (id: string) => request<TaskFull>(`/api/tasks/${id}`),
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
    addTag: (taskId: string, tagId: string) =>
      request<{ ok: true }>(`/api/tasks/${taskId}/tags`, {
        method: "POST",
        body: json({ tag_id: tagId }),
      }),
    removeTag: (taskId: string, tagId: string) =>
      request<{ ok: true }>(`/api/tasks/${taskId}/tags/${tagId}`, { method: "DELETE" }),
  },
  tags: {
    list: (kind?: TagKind) => {
      const url = kind ? `/api/tags?kind=${encodeURIComponent(kind)}` : "/api/tags";
      return request<Tag[]>(url);
    },
    get: (id: string) => request<Tag>(`/api/tags/${id}`),
    create: (data: CreateTagInput) => request<Tag>("/api/tags", { method: "POST", body: json(data) }),
    update: (id: string, data: UpdateTagInput) =>
      request<Tag>(`/api/tags/${id}`, { method: "PATCH", body: json(data) }),
    delete: (id: string) => request<{ ok: true }>(`/api/tags/${id}`, { method: "DELETE" }),
  },
};
