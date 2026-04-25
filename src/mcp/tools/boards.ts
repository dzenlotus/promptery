import type { ToolDefinition } from "./index.js";
import {
  confirmation,
  deleted,
  projectBoardDetail,
  projectBoardList,
  projectPromptList,
} from "../projections.js";

export const list_boards: ToolDefinition = {
  name: "list_boards",
  description:
    "List all kanban boards (id, name, space_id). Boards group columns; tasks live " +
    "in columns. Each board belongs to exactly one space — the space's prefix governs " +
    "task slugs (e.g. boards in space `pmt` produce tasks like `pmt-46`).",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  handler: async (_args, { hub }) =>
    projectBoardList(await hub.get("/api/boards")),
};

export const get_board: ToolDefinition = {
  name: "get_board",
  description:
    "Get a board by id with its column ids ordered left-to-right. Use list_columns " +
    "for full column metadata, or list_tasks(board_id) to see what's on the board.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Board id (nanoid)." },
    },
    required: ["id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const id = args.id as string;
    const [board, columns] = await Promise.all([
      hub.get<unknown>(`/api/boards/${id}`),
      hub.get<unknown>(`/api/boards/${id}/columns`),
    ]);
    return projectBoardDetail(board, columns);
  },
};

export const create_board: ToolDefinition = {
  name: "create_board",
  description:
    "Create a new kanban board. When `space_id` is omitted the board lands in the " +
    "default space. A fresh board comes with the four standard columns " +
    "(todo, in-progress, qa, done).",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Board display name." },
      space_id: {
        type: "string",
        description: "Optional — defaults to the default space.",
      },
    },
    required: ["name"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const body: Record<string, unknown> = { name: args.name as string };
    if (typeof args.space_id === "string") body.space_id = args.space_id;
    const created = (await hub.post("/api/boards", body)) as {
      id: string;
      name: string;
      space_id: string;
    };
    return confirmation(created.id, {
      name: created.name,
      space_id: created.space_id,
    });
  },
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
  handler: async (args, { hub }) => {
    const updated = (await hub.patch(`/api/boards/${args.id as string}`, {
      name: args.name as string,
    })) as { id: string; name: string };
    return confirmation(updated.id, { name: updated.name });
  },
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
  handler: async (args, { hub }) => {
    const id = args.id as string;
    await hub.delete(`/api/boards/${id}`);
    return deleted(id);
  },
};

export const set_board_role: ToolDefinition = {
  name: "set_board_role",
  description:
    "Assign or clear the role attached to a board. Every task on this board inherits " +
    "the board-level role unless the task or its column overrides it. Pass role_id=null " +
    "to clear.",
  inputSchema: {
    type: "object",
    properties: {
      board_id: { type: "string" },
      role_id: {
        type: ["string", "null"],
        description: "Role id, or null to clear.",
      },
    },
    required: ["board_id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const boardId = args.board_id as string;
    const roleId = (args.role_id ?? null) as string | null;
    await hub.put(`/api/boards/${boardId}/role`, { role_id: roleId });
    return { board_id: boardId, role_id: roleId };
  },
};

export const set_board_prompts: ToolDefinition = {
  name: "set_board_prompts",
  description:
    "Replace the set of prompts attached directly to a board. These appear in every " +
    "task's resolved context (origin='board') alongside anything contributed by the " +
    "board-role, column, column-role, task-role, or the task itself.",
  inputSchema: {
    type: "object",
    properties: {
      board_id: { type: "string" },
      prompt_ids: { type: "array", items: { type: "string" } },
    },
    required: ["board_id", "prompt_ids"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const boardId = args.board_id as string;
    const promptIds = (args.prompt_ids ?? []) as string[];
    await hub.put(`/api/boards/${boardId}/prompts`, { prompt_ids: promptIds });
    return { board_id: boardId, prompt_ids: promptIds };
  },
};

export const get_board_prompts: ToolDefinition = {
  name: "get_board_prompts",
  description:
    "List the prompts attached directly to a board (excluding any contributed by " +
    "the board-role). Returns minimal prompt metadata (id, name, color) — call " +
    "get_prompt for the full content.",
  inputSchema: {
    type: "object",
    properties: { board_id: { type: "string" } },
    required: ["board_id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) =>
    projectPromptList(
      await hub.get(`/api/boards/${args.board_id as string}/prompts`)
    ),
};
