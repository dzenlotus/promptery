import type { ToolDefinition } from "./index.js";
import {
  confirmation,
  deleted,
  projectColumnList,
  projectPromptList,
} from "../projections.js";

export const list_columns: ToolDefinition = {
  name: "list_columns",
  description:
    "List the columns of a board in left-to-right position order. Returns navigation " +
    "metadata only (id, name, position, role_id) — call get_column_prompts for the " +
    "column's direct prompts.",
  inputSchema: {
    type: "object",
    properties: {
      board_id: { type: "string" },
    },
    required: ["board_id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) =>
    projectColumnList(
      await hub.get(`/api/boards/${args.board_id as string}/columns`)
    ),
};

export const create_column: ToolDefinition = {
  name: "create_column",
  description: "Append a new column to the right of the board.",
  inputSchema: {
    type: "object",
    properties: {
      board_id: { type: "string" },
      name: { type: "string" },
    },
    required: ["board_id", "name"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const created = (await hub.post(
      `/api/boards/${args.board_id as string}/columns`,
      { name: args.name as string }
    )) as { id: string; name: string; board_id: string; position: number };
    return confirmation(created.id, {
      name: created.name,
      board_id: created.board_id,
      position: created.position,
    });
  },
};

export const update_column: ToolDefinition = {
  name: "update_column",
  description: "Rename a column or change its horizontal position on the board.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string", description: "Optional new name." },
      position: {
        type: "number",
        description: "Optional 0-based column index.",
      },
    },
    required: ["id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const body: Record<string, unknown> = {};
    if (typeof args.name === "string") body.name = args.name;
    if (typeof args.position === "number") body.position = args.position;
    const updated = (await hub.patch(
      `/api/columns/${args.id as string}`,
      body
    )) as { id: string };
    return confirmation(updated.id);
  },
};

export const delete_column: ToolDefinition = {
  name: "delete_column",
  description:
    "Delete an empty column. Fails if the column still contains tasks — move or delete " +
    "them first.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const id = args.id as string;
    try {
      await hub.delete(`/api/columns/${id}`);
      return deleted(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // HubClient surfaces non-2xx as `METHOD path: <status> <statusText> <body>`.
      // Match on both the status and the machine-readable code so this stays
      // robust against body-format tweaks, then re-throw with guidance the
      // agent can act on.
      if (message.includes("409") || message.includes("ColumnNotEmpty")) {
        throw new Error(
          "Cannot delete this column because it contains tasks. " +
            "Use list_tasks to find them, then either move them to another column " +
            "(move_task) or delete them (delete_task) before removing the column."
        );
      }
      throw err;
    }
  },
};

export const set_column_role: ToolDefinition = {
  name: "set_column_role",
  description:
    "Assign or clear a role for a column. Tasks in this column inherit the column-level " +
    "role unless the task itself overrides it. Pass role_id=null to clear.",
  inputSchema: {
    type: "object",
    properties: {
      column_id: { type: "string" },
      role_id: {
        type: ["string", "null"],
        description: "Role id, or null to clear.",
      },
    },
    required: ["column_id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const columnId = args.column_id as string;
    const roleId = (args.role_id ?? null) as string | null;
    await hub.put(`/api/columns/${columnId}/role`, { role_id: roleId });
    return { column_id: columnId, role_id: roleId };
  },
};

export const set_column_prompts: ToolDefinition = {
  name: "set_column_prompts",
  description:
    "Replace the set of prompts attached directly to a column. These appear in each " +
    "task's resolved context with origin='column'.",
  inputSchema: {
    type: "object",
    properties: {
      column_id: { type: "string" },
      prompt_ids: { type: "array", items: { type: "string" } },
    },
    required: ["column_id", "prompt_ids"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const columnId = args.column_id as string;
    const promptIds = (args.prompt_ids ?? []) as string[];
    await hub.put(`/api/columns/${columnId}/prompts`, {
      prompt_ids: promptIds,
    });
    return { column_id: columnId, prompt_ids: promptIds };
  },
};

export const get_column_prompts: ToolDefinition = {
  name: "get_column_prompts",
  description:
    "List the prompts attached directly to a column (excluding any contributed by the " +
    "column-role). Returns minimal prompt metadata — call get_prompt for the full content.",
  inputSchema: {
    type: "object",
    properties: { column_id: { type: "string" } },
    required: ["column_id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) =>
    projectPromptList(
      await hub.get(`/api/columns/${args.column_id as string}/prompts`)
    ),
};
