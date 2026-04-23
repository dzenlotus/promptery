import type { ToolDefinition } from "./index.js";
import open from "open";

export const get_ui_info: ToolDefinition = {
  name: "get_ui_info",
  description:
    "Get the Promptery web UI URL and port. Call this when you want to share the UI URL with the user.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  handler: async (_args, { hub }) => {
    const u = new URL(hub.baseUrl);
    return {
      url: hub.baseUrl,
      port: Number.parseInt(u.port || "80", 10),
    };
  },
};

export const open_promptery_ui: ToolDefinition = {
  name: "open_promptery_ui",
  description:
    "Open the Promptery web UI in the user's default browser. Call this when the user would benefit from visually seeing the kanban board — after creating multiple tasks, after major reorganization, or when explicitly asked to show the board.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Optional path like '/board/abc123' or '/roles'. Defaults to '/'.",
      },
    },
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const path = typeof args.path === "string" ? args.path : "/";
    const target = `${hub.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    await open(target);
    return { opened: target };
  },
};
