import type { ToolDefinition } from "./index.js";
import {
  confirmation,
  deleted,
  projectTagDetail,
  projectTagList,
} from "../projections.js";

export const list_tags: ToolDefinition = {
  name: "list_tags",
  description:
    "List all tags (id, name, color, prompt_count). Tags are a flat label layer for " +
    "prompts — many-to-many, globally unique by name. They do not participate in " +
    "inheritance and only attach to prompts (not roles, skills, mcp_tools, tasks).",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  handler: async (_args, { hub }) =>
    projectTagList(await hub.get("/api/tags")),
};

export const get_tag: ToolDefinition = {
  name: "get_tag",
  description:
    "Fetch a tag with the alphabetical list of its tagged prompt_ids. Iterate and call " +
    "get_prompt to fetch a prompt's full body.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) =>
    projectTagDetail(await hub.get(`/api/tags/${args.id as string}`)),
};

export const create_tag: ToolDefinition = {
  name: "create_tag",
  description:
    "Create a new tag. Tag names must be globally unique (case-insensitive). Optionally " +
    "pre-populate with a list of prompt ids — those prompts are not copied, just " +
    "associated with the new tag.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string" },
      color: {
        type: ["string", "null"],
        description: "Optional hex colour (#RGB or #RRGGBB).",
      },
      prompt_ids: { type: "array", items: { type: "string" } },
    },
    required: ["name"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const body: Record<string, unknown> = { name: args.name as string };
    if (args.color !== undefined) body.color = args.color;
    if (Array.isArray(args.prompt_ids)) body.prompt_ids = args.prompt_ids;
    const created = (await hub.post("/api/tags", body)) as {
      id: string;
      name: string;
    };
    return confirmation(created.id, { name: created.name });
  },
};

export const update_tag: ToolDefinition = {
  name: "update_tag",
  description: "Rename a tag or change its colour.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      color: { type: ["string", "null"] },
    },
    required: ["id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const body: Record<string, unknown> = {};
    if (typeof args.name === "string") body.name = args.name;
    if (args.color !== undefined) body.color = args.color;
    const updated = (await hub.patch(
      `/api/tags/${args.id as string}`,
      body
    )) as { id: string };
    return confirmation(updated.id);
  },
};

export const delete_tag: ToolDefinition = {
  name: "delete_tag",
  description:
    "Delete a tag. Tagged prompts are NOT deleted — only the tag and its membership " +
    "rows. Use this to remove a label while keeping its prompts in the global list.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const id = args.id as string;
    await hub.delete(`/api/tags/${id}`);
    return deleted(id);
  },
};

export const set_tag_prompts: ToolDefinition = {
  name: "set_tag_prompts",
  description:
    "Replace the complete prompt list of a tag. Prompts removed from the list lose " +
    "the tag but stay in the global prompts list; prompts added gain the tag.",
  inputSchema: {
    type: "object",
    properties: {
      tag_id: { type: "string" },
      prompt_ids: { type: "array", items: { type: "string" } },
    },
    required: ["tag_id", "prompt_ids"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const tagId = args.tag_id as string;
    const promptIds = (args.prompt_ids ?? []) as string[];
    await hub.put(`/api/tags/${tagId}/prompts`, {
      prompt_ids: promptIds,
    });
    return { tag_id: tagId, prompt_ids: promptIds };
  },
};

export const add_prompt_to_tag: ToolDefinition = {
  name: "add_prompt_to_tag",
  description:
    "Add a single prompt to a tag. Idempotent — tagging an already-tagged prompt is a " +
    "no-op.",
  inputSchema: {
    type: "object",
    properties: {
      tag_id: { type: "string" },
      prompt_id: { type: "string" },
    },
    required: ["tag_id", "prompt_id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const tagId = args.tag_id as string;
    const promptId = args.prompt_id as string;
    await hub.post(`/api/tags/${tagId}/prompts`, { prompt_id: promptId });
    return { tag_id: tagId, prompt_id: promptId };
  },
};

export const remove_prompt_from_tag: ToolDefinition = {
  name: "remove_prompt_from_tag",
  description:
    "Remove a tag from a prompt. Only the membership is removed; both the tag and the " +
    "prompt remain available everywhere else.",
  inputSchema: {
    type: "object",
    properties: {
      tag_id: { type: "string" },
      prompt_id: { type: "string" },
    },
    required: ["tag_id", "prompt_id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const tagId = args.tag_id as string;
    const promptId = args.prompt_id as string;
    await hub.delete(`/api/tags/${tagId}/prompts/${promptId}`);
    return { tag_id: tagId, prompt_id: promptId, removed: true };
  },
};
