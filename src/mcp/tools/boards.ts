import type { ToolDefinition } from "./index.js";

export const list_boards: ToolDefinition = {
  name: "list_boards",
  description: "List all kanban boards in Promptery (id, name, timestamps).",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  handler: async (_args, { hub }) => hub.get("/api/boards"),
};

export const get_board: ToolDefinition = {
  name: "get_board",
  description:
    "Get a board by id together with its columns (ordered left-to-right). Use list_boards first to discover ids.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Board id (nanoid)." },
    },
    required: ["id"],
    additionalProperties: false,
  },
  // Composes two HTTP calls — the REST API keeps board and columns on
  // separate endpoints (UI fetches them independently), but agents want one
  // cohesive response to plan moves against.
  handler: async (args, { hub }) => {
    const id = args.id as string;
    const [board, columns] = await Promise.all([
      hub.get<unknown>(`/api/boards/${id}`),
      hub.get<unknown>(`/api/boards/${id}/columns`),
    ]);
    return { ...(board as object), columns };
  },
};

export const create_board: ToolDefinition = {
  name: "create_board",
  description:
    "Create a new kanban board. A fresh board starts empty — add columns separately with create_column.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Board display name." },
    },
    required: ["name"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) =>
    hub.post("/api/boards", { name: args.name as string }),
};

export const update_board: ToolDefinition = {
  name: "update_board",
  description: "Rename a board.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
    },
    required: ["id", "name"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) =>
    hub.patch(`/api/boards/${args.id as string}`, { name: args.name as string }),
};

export const delete_board: ToolDefinition = {
  name: "delete_board",
  description:
    "Delete a board along with all its columns and tasks. This cannot be undone.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => hub.delete(`/api/boards/${args.id as string}`),
};
