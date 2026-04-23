import type { ToolDefinition } from "./index.js";

export const list_columns: ToolDefinition = {
  name: "list_columns",
  description: "List the columns of a board in left-to-right position order.",
  inputSchema: {
    type: "object",
    properties: {
      board_id: { type: "string" },
    },
    required: ["board_id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) =>
    hub.get(`/api/boards/${args.board_id as string}/columns`),
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
  handler: async (args, { hub }) =>
    hub.post(`/api/boards/${args.board_id as string}/columns`, {
      name: args.name as string,
    }),
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
    return hub.patch(`/api/columns/${args.id as string}`, body);
  },
};

export const delete_column: ToolDefinition = {
  name: "delete_column",
  description:
    "Delete an empty column. Fails if the column still contains tasks — move or delete them first.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    try {
      return await hub.delete(`/api/columns/${args.id as string}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // HubClient surfaces non-2xx as `METHOD path: <status> <statusText> <body>`,
      // so the 409 body text ends up inside the thrown message. Match on both
      // the status and the machine-readable code to stay robust against body
      // format tweaks, then re-throw with guidance the agent can act on.
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
    "Assign or clear a role for a column. Tasks in this column inherit the column-level role unless the task itself overrides it. Pass role_id=null to clear.",
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
  handler: async (args, { hub }) =>
    hub.put(`/api/columns/${args.column_id as string}/role`, {
      role_id: (args.role_id ?? null) as string | null,
    }),
};

export const set_column_prompts: ToolDefinition = {
  name: "set_column_prompts",
  description:
    "Replace the set of prompts attached directly to a column. These prompts appear in each task's resolved context with origin='column'.",
  inputSchema: {
    type: "object",
    properties: {
      column_id: { type: "string" },
      prompt_ids: { type: "array", items: { type: "string" } },
    },
    required: ["column_id", "prompt_ids"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) =>
    hub.put(`/api/columns/${args.column_id as string}/prompts`, {
      prompt_ids: (args.prompt_ids ?? []) as string[],
    }),
};

export const get_column_prompts: ToolDefinition = {
  name: "get_column_prompts",
  description:
    "List the prompts attached directly to a column (excluding any contributed by the column-role).",
  inputSchema: {
    type: "object",
    properties: { column_id: { type: "string" } },
    required: ["column_id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) =>
    hub.get(`/api/columns/${args.column_id as string}/prompts`),
};
