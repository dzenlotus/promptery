import type { ToolDefinition } from "./index.js";
import {
  projectSpaceDetail,
  projectSpaceList,
  confirmation,
  deleted,
} from "../projections.js";

/**
 * Workspace organisation tools. A "space" is a container that groups
 * boards under shared settings. The first (and currently only) shared
 * setting is `prefix` — used to mint per-space task slugs like `pmt-46`.
 *
 * Slug semantics — important for agents:
 *
 *  - `slug` (e.g. "pmt-46") is a friendly handle minted at task creation.
 *    It MAY change: moving a board to a different space re-slugs every
 *    task on that board to match the new space's prefix and counter.
 *  - The internal `id` (CUID-like) is the stable identifier. It never
 *    changes once assigned. Use `id` for any reference you'll come back
 *    to later — e.g. when you store a task pointer in another task's
 *    description, link to a task from a chat log, or persist it to a
 *    file. Use `slug` for human-readable conversation only.
 */

export const list_spaces: ToolDefinition = {
  name: "list_spaces",
  description:
    "List all workspace spaces (id, name, prefix, is_default, position). " +
    "Spaces group boards — every board belongs to exactly one space, and " +
    "task slugs derive from the space's `prefix`.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  handler: async (_args, { hub }) =>
    projectSpaceList(await hub.get("/api/spaces")),
};

export const get_space: ToolDefinition = {
  name: "get_space",
  description:
    "Get a space by id with its full description and the list of board ids it contains.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string", description: "Space id." } },
    required: ["id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) =>
    projectSpaceDetail(await hub.get(`/api/spaces/${args.id as string}`)),
};

export const create_space: ToolDefinition = {
  name: "create_space",
  description:
    "Create a new workspace space. The `prefix` (1–10 lowercase letters/digits/hyphens) " +
    "becomes the slug prefix for tasks created on boards inside this space (e.g. " +
    "prefix='pmt' yields task slugs pmt-1, pmt-2, …). Prefix collisions return 409.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Display name." },
      prefix: {
        type: "string",
        description: "Slug prefix — must match /^[a-z0-9-]{1,10}$/.",
      },
      description: {
        type: "string",
        description: "Optional free-form description.",
      },
    },
    required: ["name", "prefix"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const body: Record<string, unknown> = {
      name: args.name as string,
      prefix: args.prefix as string,
    };
    if (typeof args.description === "string") body.description = args.description;
    const created = (await hub.post("/api/spaces", body)) as {
      id: string;
      prefix: string;
    };
    return confirmation(created.id, { prefix: created.prefix });
  },
};

export const update_space: ToolDefinition = {
  name: "update_space",
  description:
    "Rename a space, change its prefix, or update its description. Renaming the prefix " +
    "does NOT re-slug existing tasks — slugs are minted at task creation and only change " +
    "on `move_board_to_space`. New tasks created in this space after the rename will use " +
    "the new prefix.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      prefix: { type: "string" },
      description: { type: ["string", "null"] },
    },
    required: ["id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const body: Record<string, unknown> = {};
    if (typeof args.name === "string") body.name = args.name;
    if (typeof args.prefix === "string") body.prefix = args.prefix;
    if (args.description !== undefined) body.description = args.description;
    const updated = (await hub.patch(
      `/api/spaces/${args.id as string}`,
      body
    )) as { id: string };
    return confirmation(updated.id);
  },
};

export const delete_space: ToolDefinition = {
  name: "delete_space",
  description:
    "Delete a space. Refused (409) if the space still contains boards — move them " +
    "elsewhere first via `move_board_to_space`. The default space cannot be deleted.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const id = args.id as string;
    await hub.delete(`/api/spaces/${id}`);
    return deleted(id);
  },
};

export const move_board_to_space: ToolDefinition = {
  name: "move_board_to_space",
  description:
    "Move a board to a different space. Re-slugs every task on the board to the " +
    "destination space's prefix; the destination counter advances by the number of " +
    "tasks moved. The internal `id` of each task is preserved — anything held by id " +
    "keeps resolving across the move. Old slugs (e.g. `pmt-15`) cease to exist; the " +
    "tasks now carry destination-prefix slugs. Returns the count of tasks re-slugged.",
  inputSchema: {
    type: "object",
    properties: {
      board_id: { type: "string" },
      space_id: { type: "string" },
    },
    required: ["board_id", "space_id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const result = (await hub.post(
      `/api/boards/${args.board_id as string}/move-to-space`,
      { space_id: args.space_id as string }
    )) as { board_id: string; space_id: string; reslugged_count: number };
    return result;
  },
};
