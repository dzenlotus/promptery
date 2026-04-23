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
  description: "Delete a column and every task inside it.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) =>
    hub.delete(`/api/columns/${args.id as string}`),
};
