import type { ToolDefinition } from "./index.js";
import type { HubClient } from "../../bridge/hubClient.js";

interface TaskResponse {
  id: string;
  board_id: string;
  [k: string]: unknown;
}

export const list_tasks: ToolDefinition = {
  name: "list_tasks",
  description:
    "List tasks on a board. Optionally filter by column. Returns full task objects including role and attached prompts.",
  inputSchema: {
    type: "object",
    properties: {
      board_id: { type: "string" },
      column_id: {
        type: "string",
        description: "Optional — restrict to a single column.",
      },
    },
    required: ["board_id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const path =
      typeof args.column_id === "string"
        ? `/api/boards/${args.board_id as string}/tasks?column_id=${encodeURIComponent(args.column_id)}`
        : `/api/boards/${args.board_id as string}/tasks`;
    return hub.get(path);
  },
};

export const get_task: ToolDefinition = {
  name: "get_task",
  description: "Fetch a task by id with its role and attached primitives.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => hub.get(`/api/tasks/${args.id as string}`),
};

export const get_task_bundle: ToolDefinition = {
  name: "get_task_bundle",
  description:
    "Get the task's full agent-ready context as XML: role identity, role prompts, task description, and direct prompts — formatted so you can paste it straight into the agent system prompt. Call this when you start working on a task.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  // Returns a raw XML string, not JSON — the MCP handler ships it as-is.
  handler: async (args, { hub }) =>
    hub.getText(`/api/tasks/${args.id as string}/bundle`),
};

export const create_task: ToolDefinition = {
  name: "create_task",
  description:
    "Create a new task in a column. Optionally assign a role (inherits role's prompts) and attach additional prompts directly.",
  inputSchema: {
    type: "object",
    properties: {
      board_id: { type: "string" },
      column_id: { type: "string" },
      title: { type: "string" },
      description: { type: "string" },
      role_id: { type: "string", description: "Optional role to assign." },
      prompt_ids: {
        type: "array",
        items: { type: "string" },
        description: "Optional prompt ids to attach directly.",
      },
    },
    required: ["board_id", "column_id", "title"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const body: Record<string, unknown> = {
      column_id: args.column_id as string,
      title: args.title as string,
    };
    if (typeof args.description === "string") body.description = args.description;
    const created = await hub.post<TaskResponse>(
      `/api/boards/${args.board_id as string}/tasks`,
      body
    );

    if (typeof args.role_id === "string") {
      await hub.put(`/api/tasks/${created.id}/role`, { role_id: args.role_id });
    }
    if (Array.isArray(args.prompt_ids)) {
      for (const promptId of args.prompt_ids) {
        if (typeof promptId !== "string") continue;
        await hub.post(`/api/tasks/${created.id}/prompts`, { prompt_id: promptId });
      }
    }
    // Return the final task state after all attachments so callers don't have
    // to re-fetch.
    return hub.get(`/api/tasks/${created.id}`);
  },
};

export const update_task: ToolDefinition = {
  name: "update_task",
  description:
    "Update a task's title or description. To move between columns use move_task, to change role use set_task_role.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string" },
      title: { type: "string" },
      description: { type: "string" },
    },
    required: ["id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const body: Record<string, unknown> = {};
    if (typeof args.title === "string") body.title = args.title;
    if (typeof args.description === "string") body.description = args.description;
    return hub.patch(`/api/tasks/${args.id as string}`, body);
  },
};

export const move_task: ToolDefinition = {
  name: "move_task",
  description: "Move a task to another column and/or reorder it within a column.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string" },
      column_id: { type: "string" },
      position: {
        type: "number",
        description:
          "Relative position (float). Defaults to append-to-end when omitted.",
      },
    },
    required: ["id", "column_id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const position =
      typeof args.position === "number" ? args.position : Number.MAX_SAFE_INTEGER;
    return hub.post(`/api/tasks/${args.id as string}/move`, {
      column_id: args.column_id as string,
      position,
    });
  },
};

export const delete_task: ToolDefinition = {
  name: "delete_task",
  description: "Delete a task. This cannot be undone.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => hub.delete(`/api/tasks/${args.id as string}`),
};

export const set_task_role: ToolDefinition = {
  name: "set_task_role",
  description:
    "Assign or clear a task's role. When set, the role's prompts are inherited onto the task; when cleared (role_id=null), previously inherited prompts are removed.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
      role_id: {
        type: ["string", "null"],
        description: "Role id, or null to clear.",
      },
    },
    required: ["task_id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }: { hub: HubClient }) =>
    hub.put(`/api/tasks/${args.task_id as string}/role`, {
      role_id: (args.role_id ?? null) as string | null,
    }),
};

export const add_task_prompt: ToolDefinition = {
  name: "add_task_prompt",
  description:
    "Attach a prompt directly to a task (origin='direct'). Direct attachments live alongside role-inherited ones.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
      prompt_id: { type: "string" },
    },
    required: ["task_id", "prompt_id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) =>
    hub.post(`/api/tasks/${args.task_id as string}/prompts`, {
      prompt_id: args.prompt_id as string,
    }),
};

export const remove_task_prompt: ToolDefinition = {
  name: "remove_task_prompt",
  description:
    "Detach a direct prompt from a task. Role-inherited prompts cannot be removed this way — change the role instead.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
      prompt_id: { type: "string" },
    },
    required: ["task_id", "prompt_id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) =>
    hub.delete(
      `/api/tasks/${args.task_id as string}/prompts/${args.prompt_id as string}`
    ),
};
