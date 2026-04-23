import { Command } from "commander";
import { readFileSync } from "node:fs";
import { runHub } from "./runner.js";
import { runBridge } from "./bridge/index.js";

function loadPackageVersion(): string {
  const pkgUrl = new URL("../package.json", import.meta.url);
  const pkg = JSON.parse(readFileSync(pkgUrl, "utf-8")) as { version: string };
  return pkg.version;
}

const program = new Command();

program
  .name("promptery")
  .description("Context orchestration for AI agents (Kanban + MCP)")
  .version(loadPackageVersion());

program
  .command("hub")
  .description(
    "Start the Promptery hub (UI + API + DB). Usually auto-started by bridge; run this explicitly for development or to pre-warm."
  )
  .option("-p, --port <number>", "preferred port (falls back to next free port)", (v) =>
    Number.parseInt(v, 10)
  )
  .action(async (opts: { port?: number }) => {
    await runHub({ preferredPort: opts.port, banner: true });
  });

program
  .command("server")
  .description(
    "Start the MCP bridge over stdio. This is what Claude Desktop / Cursor should be configured to run."
  )
  .option("--agent <hint>", "agent hint (e.g. 'claude-desktop', 'cursor') for diagnostics")
  .action(async (opts: { agent?: string }) => {
    await runBridge({ agentHint: opts.agent });
  });

// Default action — no subcommand. For MCP host configs that don't pass args.
// Also bridges auto-start a hub as needed, so this remains a sensible default.
program.action(async () => {
  await runBridge();
});

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
