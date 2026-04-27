import type { ToolDefinition } from "./index.js";
import {
  confirmation,
  deleted,
  projectTaskDetail,
  projectTaskList,
  projectTaskWithLocationList,
} from "../projections.js";

interface TaskResponse {
  id: string;
  slug: string;
  board_id: string;
  column_id: string;
  position: number;
  [k: string]: unknown;
}

export const list_tasks: ToolDefinition = {
  name: "list_tasks",
  description:
    "List tasks on a board with their slug + column position. Returns navigation " +
    "metadata only — no description, no role content, no prompts. Optionally " +
    "filter by column, or restrict to tasks assigned to this bridge's " +
    "registered role(s) via `assigned_to_role: 'self'`. Call get_task for the " +
    "location envelope or get_task_bundle for the full XML system prompt.",
  inputSchema: {
    type: "object",
    properties: {
      board_id: { type: "string" },
      column_id: {
        type: "string",
        description: "Optional — restrict to a single column.",
      },
      assigned_to_role: {
        type: "string",
        enum: ["self"],
        description:
          "Pass 'self' to return only tasks whose role_id matches the role(s) this bridge registered with. Requires the bridge to have been registered with role_id or role_ids. If no role scope was set, returns all tasks.",
      },
    },
    required: ["board_id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const params = new URLSearchParams();
    if (typeof args.column_id === "string") params.set("column_id", args.column_id);
    if (args.assigned_to_role === "self") params.set("assigned_to_role", "self");
    const qs = params.toString();
    const path = `/api/boards/${args.board_id as string}/tasks${qs ? `?${qs}` : ""}`;
    return projectTaskList(await hub.get(path));
  },
};

export const get_task: ToolDefinition = {
  name: "get_task",
  description:
    "Fetch a task by id with its column and board context, but WITHOUT the role/prompts " +
    "bundle. Use this when you need the location envelope; use get_task_bundle when you " +
    "need the full XML for a system prompt.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) =>
    projectTaskDetail(await hub.get(`/api/tasks/${args.id as string}/with-location`)),
};

function buildTaskSearchQuery(args: Record<string, unknown>): string {
  const params = new URLSearchParams();
  if (typeof args.query === "string" && args.query.length > 0) {
    params.set("query", args.query);
  }
  if (typeof args.board_id === "string") params.set("board_id", args.board_id);
  if (typeof args.column_id === "string") params.set("column_id", args.column_id);
  if (typeof args.role_id === "string") params.set("role_id", args.role_id);
  if (typeof args.limit === "number") params.set("limit", String(args.limit));
  const qs = params.toString();
  return qs.length > 0 ? `?${qs}` : "";
}

export const search_tasks: ToolDefinition = {
  name: "search_tasks",
  description:
    "Search tasks across all boards by text query (matches title and description via " +
    "SQLite FTS5). Returns minimal task metadata + column + board for each hit. Optional " +
    "filters narrow by board, column, or role. Empty query falls back to listing recent " +
    "tasks.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Text to match against title + description." },
      board_id: { type: "string" },
      column_id: { type: "string" },
      role_id: { type: "string" },
      limit: { type: "number", description: "Max results (default 20, max 500)." },
    },
    additionalProperties: false,
  },
  handler: async (args, { hub }) =>
    projectTaskWithLocationList(await hub.get(`/api/tasks/search${buildTaskSearchQuery(args)}`)),
};

export const list_all_tasks: ToolDefinition = {
  name: "list_all_tasks",
  description:
    "List every task across all boards with location context, in one call. Returns minimal " +
    "task metadata + column + board for each entry. Optional filters by board_id, column_id, " +
    "or role_id. Prefer this over list_boards + list_columns + list_tasks when you want a " +
    "global view.",
  inputSchema: {
    type: "object",
    properties: {
      board_id: { type: "string" },
      column_id: { type: "string" },
      role_id: { type: "string" },
      limit: { type: "number", description: "Max results (default 20, max 500)." },
    },
    additionalProperties: false,
  },
  handler: async (args, { hub }) =>
    projectTaskWithLocationList(await hub.get(`/api/tasks/search${buildTaskSearchQuery(args)}`)),
};

export const get_task_bundle: ToolDefinition = {
  name: "get_task_bundle",
  description:
    "Get the task's fully-resolved agent context as XML. Pass either the task slug " +
    "(e.g. `pmt-46`) or the internal id (CUID). The resolver pulls the active role " +
    "(task > column > board — first set wins) and the deduplicated union of prompts " +
    "from 6 origins (direct, role, column, column-role, board, board-role), formatted " +
    "for direct paste into the agent's system prompt. Slugs are mutable across board " +
    "moves; ids are stable — prefer ids for any reference you'll persist.",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description:
          "Task slug (e.g. `pmt-46`) or internal id (CUID). Slugs are detected by format.",
      },
    },
    required: ["id"],
    additionalProperties: false,
  },
  // Returns a raw XML string, not JSON — the MCP handler ships it as-is.
  // The HTTP route accepts both slug and id forms.
  handler: async (args, { hub }) =>
    hub.getText(`/api/tasks/${args.id as string}/bundle`),
};

export const get_task_context: ToolDefinition = {
  name: "get_task_context",
  description:
    "Get the resolved task context as structured JSON: active role (with source: " +
    "task|column|board) and the deduplicated prompt list with per-prompt origin. Use " +
    "this when you need programmatic access to origin metadata; use get_task_bundle " +
    "when you want pasteable XML.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) =>
    hub.get(`/api/tasks/${args.id as string}/context`),
};

export const create_task: ToolDefinition = {
  name: "create_task",
  description:
    "Create a new task in a column. The slug is server-generated from the board's " +
    "space prefix (e.g. `pmt-47`). Optionally assign a role (inherits role's prompts) " +
    "and attach additional prompts directly. Returns {id, slug, column_id, board_id, " +
    "position} — call get_task or get_task_bundle if you need the full picture.",
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
    return confirmation(created.id, {
      slug: created.slug,
      column_id: created.column_id,
      board_id: created.board_id,
      position: created.position,
    });
  },
};

export const update_task: ToolDefinition = {
  name: "update_task",
  description:
    "Update a task's title or description. To move between columns use move_task, " +
    "to change role use set_task_role.",
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
    const updated = (await hub.patch(
      `/api/tasks/${args.id as string}`,
      body
    )) as { id: string; updated_at: number };
    return confirmation(updated.id, { updated_at: updated.updated_at });
  },
};

export const move_task: ToolDefinition = {
  name: "move_task",
  description:
    "Move a task to another column. The target column may be on the same board OR " +
    "a different board (cross-board moves are supported). Task-owned data is preserved: " +
    "role_id (if explicitly set on the task) and direct prompts/skills/mcp_tools attached " +
    "via add_task_prompt etc. Inherited context — board-level and column-level " +
    "prompts/roles — is NOT carried; the task picks up the new location's context via " +
    "the resolver.",
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
    const body: { column_id: string; position?: number } = {
      column_id: args.column_id as string,
    };
    if (typeof args.position === "number") body.position = args.position;
    const moved = (await hub.post(
      `/api/tasks/${args.id as string}/move`,
      body
    )) as {
      id: string;
      column_id: string;
      board_id: string;
      position: number;
    };
    return confirmation(moved.id, {
      column_id: moved.column_id,
      board_id: moved.board_id,
      position: moved.position,
    });
  },
};

export const move_task_with_resolution: ToolDefinition = {
  name: "move_task_with_resolution",
  description:
    "Move a task to another column (same board or cross-board) with explicit control over what happens to its role and direct prompts after the move. Use this instead of move_task when the task carries a role or direct prompts and you want to choose how they resolve on the target board. role_handling and prompt_handling each accept: 'keep' (default — no change), 'detach' (clear after move), 'copy_to_target_board' (propagate role/prompts onto the target board).",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
      column_id: { type: "string", description: "Target column (may be on a different board)." },
      position: {
        type: "number",
        description: "Relative position (float). Defaults to append-to-end when omitted.",
      },
      role_handling: {
        type: "string",
        enum: ["keep", "detach", "copy_to_target_board"],
        description: "'keep' (default): task retains its role_id. 'detach': task role_id is cleared. 'copy_to_target_board': role is set on the target board (if it has none) and its prompts are attached to the target board.",
      },
      prompt_handling: {
        type: "string",
        enum: ["keep", "detach", "copy_to_target_board"],
        description: "'keep' (default): direct prompts stay on the task. 'detach': direct prompts are removed. 'copy_to_target_board': direct prompts are attached to the target board's board_prompts.",
      },
    },
    required: ["task_id", "column_id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const body: Record<string, unknown> = {
      column_id: args.column_id as string,
    };
    if (typeof args.position === "number") body.position = args.position;
    if (typeof args.role_handling === "string") body.role_handling = args.role_handling;
    if (typeof args.prompt_handling === "string") body.prompt_handling = args.prompt_handling;
    return hub.post(`/api/tasks/${args.task_id as string}/move-with-resolution`, body);
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
  handler: async (args, { hub }) => {
    const id = args.id as string;
    await hub.delete(`/api/tasks/${id}`);
    return deleted(id);
  },
};

export const set_task_role: ToolDefinition = {
  name: "set_task_role",
  description:
    "Assign or clear a task's role. When set, the role's prompts are inherited onto " +
    "the task; when cleared (role_id=null), previously inherited prompts are removed.",
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
  handler: async (args, { hub }) => {
    const taskId = args.task_id as string;
    const roleId = (args.role_id ?? null) as string | null;
    await hub.put(`/api/tasks/${taskId}/role`, { role_id: roleId });
    return { task_id: taskId, role_id: roleId };
  },
};

export const add_task_prompt: ToolDefinition = {
  name: "add_task_prompt",
  description:
    "Attach a prompt directly to a task (origin='direct'). Direct attachments live " +
    "alongside role-inherited ones.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
      prompt_id: { type: "string" },
    },
    required: ["task_id", "prompt_id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const taskId = args.task_id as string;
    const promptId = args.prompt_id as string;
    await hub.post(`/api/tasks/${taskId}/prompts`, { prompt_id: promptId });
    return { task_id: taskId, prompt_id: promptId, origin: "direct" };
  },
};

export const remove_task_prompt: ToolDefinition = {
  name: "remove_task_prompt",
  description:
    "Detach a direct prompt from a task. Role-inherited prompts cannot be removed " +
    "this way — change the role instead.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
      prompt_id: { type: "string" },
    },
    required: ["task_id", "prompt_id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const taskId = args.task_id as string;
    const promptId = args.prompt_id as string;
    await hub.delete(`/api/tasks/${taskId}/prompts/${promptId}`);
    return { task_id: taskId, prompt_id: promptId, removed: true };
  },
};
