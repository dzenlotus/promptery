import type { ToolDefinition } from "./index.js";
import {
  confirmation,
  deleted,
  projectRoleDetail,
  projectRoleList,
} from "../projections.js";

export const list_roles: ToolDefinition = {
  name: "list_roles",
  description:
    "List all roles (id, name, color). Call get_role for the role's content + " +
    "attached prompt/skill/mcp_tool ids.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  handler: async (_args, { hub }) =>
    projectRoleList(await hub.get("/api/roles")),
};

export const get_role: ToolDefinition = {
  name: "get_role",
  description:
    "Get a role with its content + attached prompt/skill/mcp_tool ids. The role's " +
    "own content is returned (it's the role's identity) but the linked prompts/skills/" +
    "mcp_tools are returned as id arrays only — call get_prompt by id for full content.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) =>
    projectRoleDetail(await hub.get(`/api/roles/${args.id as string}`)),
};

export const create_role: ToolDefinition = {
  name: "create_role",
  description:
    "Create a new role. Roles define 'who I am' for a task and carry a reusable set of prompts.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string" },
      content: {
        type: "string",
        description: "Markdown description — becomes <role><description>…</description>.",
      },
      color: {
        type: "string",
        description: "Optional hex color (e.g. '#8ab').",
      },
    },
    required: ["name"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const body: Record<string, unknown> = { name: args.name as string };
    if (typeof args.content === "string") body.content = args.content;
    if (typeof args.color === "string") body.color = args.color;
    const created = (await hub.post("/api/roles", body)) as {
      id: string;
      name: string;
    };
    return confirmation(created.id, { name: created.name });
  },
};

export const update_role: ToolDefinition = {
  name: "update_role",
  description: "Update a role's name, description, or color.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      content: { type: "string" },
      color: { type: "string" },
    },
    required: ["id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const body: Record<string, unknown> = {};
    if (typeof args.name === "string") body.name = args.name;
    if (typeof args.content === "string") body.content = args.content;
    if (typeof args.color === "string") body.color = args.color;
    const updated = (await hub.patch(
      `/api/roles/${args.id as string}`,
      body
    )) as { id: string };
    return confirmation(updated.id);
  },
};

export const delete_role: ToolDefinition = {
  name: "delete_role",
  description:
    "Delete a role. Tasks that referenced it will have their role cleared and lose any " +
    "role-inherited prompts.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const id = args.id as string;
    await hub.delete(`/api/roles/${id}`);
    return deleted(id);
  },
};

export const set_role_prompts: ToolDefinition = {
  name: "set_role_prompts",
  description:
    "Replace the role's prompt set with the given ordered list of prompt ids. " +
    "Propagates to every task using this role.",
  inputSchema: {
    type: "object",
    properties: {
      role_id: { type: "string" },
      prompt_ids: { type: "array", items: { type: "string" } },
    },
    required: ["role_id", "prompt_ids"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const roleId = args.role_id as string;
    const promptIds = args.prompt_ids as string[];
    await hub.put(`/api/roles/${roleId}/prompts`, { prompt_ids: promptIds });
    return { role_id: roleId, prompt_ids: promptIds };
  },
};
