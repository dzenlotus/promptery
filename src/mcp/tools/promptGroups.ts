import type { ToolDefinition } from "./index.js";
import {
  confirmation,
  deleted,
  projectPromptGroupDetail,
  projectPromptGroupList,
} from "../projections.js";

export const list_prompt_groups: ToolDefinition = {
  name: "list_prompt_groups",
  description:
    "List all prompt groups (id, name, color, position, prompt_count). Groups are a " +
    "many-to-many organisational layer — each prompt can belong to multiple groups, " +
    "and a prompt is never duplicated by group membership.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  handler: async (_args, { hub }) =>
    projectPromptGroupList(await hub.get("/api/prompt-groups")),
};

export const get_prompt_group: ToolDefinition = {
  name: "get_prompt_group",
  description:
    "Fetch a prompt group with the ordered list of its member prompt_ids. Iterate " +
    "and call get_prompt to fetch a member's full body.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) =>
    projectPromptGroupDetail(
      await hub.get(`/api/prompt-groups/${args.id as string}`)
    ),
};

export const create_prompt_group: ToolDefinition = {
  name: "create_prompt_group",
  description:
    "Create a new prompt group. Optionally pre-populate with a list of prompt ids — " +
    "those prompts are not copied, just associated with the new group.",
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
    const created = (await hub.post("/api/prompt-groups", body)) as {
      id: string;
      name: string;
    };
    return confirmation(created.id, { name: created.name });
  },
};

export const update_prompt_group: ToolDefinition = {
  name: "update_prompt_group",
  description: "Rename a prompt group or change its colour or position.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      color: { type: ["string", "null"] },
      position: { type: "number" },
    },
    required: ["id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const body: Record<string, unknown> = {};
    if (typeof args.name === "string") body.name = args.name;
    if (args.color !== undefined) body.color = args.color;
    if (typeof args.position === "number") body.position = args.position;
    const updated = (await hub.patch(
      `/api/prompt-groups/${args.id as string}`,
      body
    )) as { id: string };
    return confirmation(updated.id);
  },
};

export const delete_prompt_group: ToolDefinition = {
  name: "delete_prompt_group",
  description:
    "Delete a prompt group. Member prompts are NOT deleted — only the group and its " +
    "membership rows. Use this to disband a group while keeping its prompts in the " +
    "global prompts list.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const id = args.id as string;
    await hub.delete(`/api/prompt-groups/${id}`);
    return deleted(id);
  },
};

export const set_group_prompts: ToolDefinition = {
  name: "set_group_prompts",
  description:
    "Replace the complete prompt list of a group. Prompts removed from the list are " +
    "detached from the group but remain in the global prompts list; prompts added " +
    "become new members.",
  inputSchema: {
    type: "object",
    properties: {
      group_id: { type: "string" },
      prompt_ids: { type: "array", items: { type: "string" } },
    },
    required: ["group_id", "prompt_ids"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const groupId = args.group_id as string;
    const promptIds = (args.prompt_ids ?? []) as string[];
    await hub.put(`/api/prompt-groups/${groupId}/prompts`, {
      prompt_ids: promptIds,
    });
    return { group_id: groupId, prompt_ids: promptIds };
  },
};

export const add_prompt_to_group: ToolDefinition = {
  name: "add_prompt_to_group",
  description:
    "Add a single prompt to a group. Idempotent — adding an already-present prompt " +
    "is a no-op.",
  inputSchema: {
    type: "object",
    properties: {
      group_id: { type: "string" },
      prompt_id: { type: "string" },
    },
    required: ["group_id", "prompt_id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const groupId = args.group_id as string;
    const promptId = args.prompt_id as string;
    await hub.post(`/api/prompt-groups/${groupId}/prompts`, {
      prompt_id: promptId,
    });
    return { group_id: groupId, prompt_id: promptId };
  },
};

export const remove_prompt_from_group: ToolDefinition = {
  name: "remove_prompt_from_group",
  description:
    "Remove a prompt from a group. Only the membership is removed; the prompt itself " +
    "stays available everywhere else.",
  inputSchema: {
    type: "object",
    properties: {
      group_id: { type: "string" },
      prompt_id: { type: "string" },
    },
    required: ["group_id", "prompt_id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const groupId = args.group_id as string;
    const promptId = args.prompt_id as string;
    await hub.delete(`/api/prompt-groups/${groupId}/prompts/${promptId}`);
    return { group_id: groupId, prompt_id: promptId, removed: true };
  },
};

export const reorder_prompt_groups: ToolDefinition = {
  name: "reorder_prompt_groups",
  description:
    "Reorder prompt groups — pass the complete list of group ids in the desired order.",
  inputSchema: {
    type: "object",
    properties: {
      ids: { type: "array", items: { type: "string" } },
    },
    required: ["ids"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const ids = args.ids as string[];
    await hub.post("/api/prompt-groups/reorder", { ids });
    return { ids };
  },
};
