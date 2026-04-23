import type { HubClient } from "../../bridge/hubClient.js";
import * as boardsTools from "./boards.js";
import * as columnsTools from "./columns.js";
import * as tasksTools from "./tasks.js";
import * as rolesTools from "./roles.js";
import * as promptsTools from "./prompts.js";
import * as uiTools from "./ui.js";

export interface McpContext {
  hub: HubClient;
}

export interface ToolInputSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  handler: (args: Record<string, unknown>, ctx: McpContext) => Promise<unknown>;
}

function collectTools(mod: Record<string, unknown>): ToolDefinition[] {
  const tools: ToolDefinition[] = [];
  for (const value of Object.values(mod)) {
    if (
      value &&
      typeof value === "object" &&
      "name" in value &&
      "handler" in value &&
      "inputSchema" in value
    ) {
      tools.push(value as ToolDefinition);
    }
  }
  return tools;
}

export const allTools: ToolDefinition[] = [
  ...collectTools(boardsTools),
  ...collectTools(columnsTools),
  ...collectTools(tasksTools),
  ...collectTools(rolesTools),
  ...collectTools(promptsTools),
  ...collectTools(uiTools),
];

const toolMap = new Map(allTools.map((t) => [t.name, t]));

export async function callTool(
  name: string,
  args: Record<string, unknown>,
  ctx: McpContext
): Promise<unknown> {
  const tool = toolMap.get(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return await tool.handler(args, ctx);
}
