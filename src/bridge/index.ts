import { ensureHubRunning } from "../hub/lifecycle.js";
import { HubClient } from "./hubClient.js";
import { startMcpBridge } from "./mcpHandler.js";

export interface RunBridgeOptions {
  agentHint?: string | null;
}

/**
 * Bridge entrypoint used by the CLI. Keeps the MCP stdio stream clean —
 * every log line goes to stderr so an MCP host won't try to parse it as
 * JSON-RPC.
 */
export async function runBridge(options: RunBridgeOptions = {}): Promise<void> {
  const { url } = await ensureHubRunning();
  console.error(`[promptery-bridge] hub at ${url}`);

  const hub = new HubClient(url);
  await hub.register(options.agentHint ?? null);
  console.error("[promptery-bridge] registered with hub");

  let shuttingDown = false;
  const cleanup = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await hub.unregister();
    } catch {
      // ignore
    }
  };

  process.on("SIGINT", () => {
    void cleanup().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void cleanup().finally(() => process.exit(0));
  });

  try {
    await startMcpBridge(hub);
  } finally {
    await cleanup();
  }
}
