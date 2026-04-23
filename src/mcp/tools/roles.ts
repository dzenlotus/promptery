import type { ToolDefinition } from "./index.js";

export const list_roles: ToolDefinition = {
  name: "list_roles",
  description: "List all roles.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  handler: async (_args, { hub }) => hub.get("/api/roles"),
};

export const get_role: ToolDefinition = {
  name: "get_role",
  description:
    "Get a role by id together with its attached prompts (used to hydrate role descriptions in the agent).",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => hub.get(`/api/roles/${args.id as string}`),
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
    return hub.post("/api/roles", body);
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
    return hub.patch(`/api/roles/${args.id as string}`, body);
  },
};

export const delete_role: ToolDefinition = {
  name: "delete_role",
  description:
    "Delete a role. Tasks that referenced it will have their role cleared and lose any role-inherited prompts.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => hub.delete(`/api/roles/${args.id as string}`),
};

export const set_role_prompts: ToolDefinition = {
  name: "set_role_prompts",
  description:
    "Replace the role's prompt set with the given ordered list of prompt ids. Propagates to every task using this role.",
  inputSchema: {
    type: "object",
    properties: {
      role_id: { type: "string" },
      prompt_ids: { type: "array", items: { type: "string" } },
    },
    required: ["role_id", "prompt_ids"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) =>
    hub.put(`/api/roles/${args.role_id as string}/prompts`, {
      prompt_ids: args.prompt_ids as string[],
    }),
};
