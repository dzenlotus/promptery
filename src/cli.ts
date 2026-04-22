import { Command } from "commander";
import { readFileSync } from "node:fs";
import { getDb } from "./db/index.js";
import { startServer } from "./server/index.js";

function loadPackageVersion(): string {
  const pkgUrl = new URL("../package.json", import.meta.url);
  const pkg = JSON.parse(readFileSync(pkgUrl, "utf-8")) as { version: string };
  return pkg.version;
}

interface UiOptions {
  port?: number;
}

async function startUi(options: UiOptions): Promise<void> {
  getDb();
  const preferred = options.port ?? 4321;
  const handle = await startServer(preferred, 4399);
  const { port, uiMounted } = handle;
  console.log();
  console.log("  🪷 Promptery");
  console.log();
  if (uiMounted) {
    console.log(`  Web UI:  http://localhost:${port}`);
  } else {
    console.log(`  API:     http://localhost:${port}/api`);
    console.log(`  UI:      (not bundled — run \`cd ui && npm run dev\` for dev mode)`);
  }
  console.log(`  WS:      ws://localhost:${port}/ws`);
  console.log();
  console.log("  Press Ctrl+C to stop");
  console.log();

  const shutdown = async (signal: string) => {
    console.log(`\n  received ${signal}, shutting down...`);
    await handle.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

function startMcp(): void {
  getDb();
  console.log("MCP server will start here (placeholder)");
}

function installClaudeDesktop(): void {
  getDb();
  console.log("install-claude-desktop (placeholder)");
}

const program = new Command();

program
  .name("promptery")
  .description("Kanban-based context management for AI agents via MCP")
  .version(loadPackageVersion())
  .option("-p, --port <number>", "port for the UI server", (v) => Number.parseInt(v, 10))
  .action(async (opts: UiOptions) => {
    await startUi(opts);
  });

program
  .command("mcp")
  .description("Run as MCP server over stdio")
  .action(() => startMcp());

program
  .command("install-claude-desktop")
  .description("Register the MCP server in Claude Desktop config")
  .action(() => installClaudeDesktop());

program.parseAsync();
