import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { HubClient } from "./hubClient.js";
import { allTools, callTool } from "../mcp/tools/index.js";

/**
 * Wires the MCP stdio server to the HubClient — every tool call round-trips
 * through the hub's HTTP API rather than touching the DB directly.
 *
 * Resolves when the stdio stream closes (agent disconnected) so the caller
 * can run cleanup before exiting.
 */
export async function startMcpBridge(hub: HubClient): Promise<void> {
  const server = new Server(
    { name: "promptery", version: "0.0.1" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: rawArgs } = req.params;
    try {
      const result = await callTool(name, rawArgs ?? {}, { hub });
      const text =
        typeof result === "string" ? result : JSON.stringify(result, null, 2);
      return { content: [{ type: "text", text }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Block until transport closes. The SDK doesn't emit this natively, but
  // stdin ending is a reliable proxy: an MCP host that disconnects drops
  // stdin, and our process should wind down when that happens.
  await new Promise<void>((resolve) => {
    process.stdin.on("end", () => resolve());
    process.stdin.on("close", () => resolve());
  });
}
