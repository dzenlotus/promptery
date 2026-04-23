import type { ToolDefinition } from "./index.js";

export const list_prompts: ToolDefinition = {
  name: "list_prompts",
  description: "List all prompts available to attach to roles or tasks.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  handler: async (_args, { hub }) => hub.get("/api/prompts"),
};

export const get_prompt: ToolDefinition = {
  name: "get_prompt",
  description: "Get a prompt by id, including its body.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => hub.get(`/api/prompts/${args.id as string}`),
};

export const create_prompt: ToolDefinition = {
  name: "create_prompt",
  description: "Create a new reusable prompt.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string" },
      content: { type: "string" },
      color: { type: "string", description: "Optional hex color." },
    },
    required: ["name"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const body: Record<string, unknown> = { name: args.name as string };
    if (typeof args.content === "string") body.content = args.content;
    if (typeof args.color === "string") body.color = args.color;
    return hub.post("/api/prompts", body);
  },
};

export const update_prompt: ToolDefinition = {
  name: "update_prompt",
  description: "Update a prompt's name, content, or color.",
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
    return hub.patch(`/api/prompts/${args.id as string}`, body);
  },
};

export const delete_prompt: ToolDefinition = {
  name: "delete_prompt",
  description:
    "Delete a prompt. Detaches it from every role and task that referenced it.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) =>
    hub.delete(`/api/prompts/${args.id as string}`),
};
