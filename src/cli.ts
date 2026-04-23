import { Command } from "commander";
import { readFileSync } from "node:fs";
import { runHub } from "./runner.js";
import { runBridge } from "./bridge/index.js";
import {
  ALL_CLIENTS,
  installClaudeDesktop,
  uninstallClaudeDesktop,
  installClaudeCode,
  uninstallClaudeCode,
  installCursor,
  uninstallCursor,
  installCodex,
  uninstallCodex,
  installQwen,
  uninstallQwen,
  installGigacode,
  uninstallGigacode,
} from "./cli/installers/clients.js";
import type { InstallResult } from "./cli/installers/jsonInstaller.js";
import type { CursorScope } from "./cli/installers/paths.js";

function loadPackageVersion(): string {
  const pkgUrl = new URL("../package.json", import.meta.url);
  const pkg = JSON.parse(readFileSync(pkgUrl, "utf-8")) as { version: string };
  return pkg.version;
}

function printInstallResult(result: InstallResult, nextSteps?: string[]): void {
  if (result.success) {
    console.log(`✓ ${result.message}`);
    console.log(`  Config: ${result.configPath}`);
    if (nextSteps && nextSteps.length > 0) {
      console.log("");
      console.log("Next steps:");
      for (const step of nextSteps) console.log(`  ${step}`);
    }
    return;
  }
  console.error(`✗ ${result.message}`);
  if (result.configPath) console.error(`  Config: ${result.configPath}`);
  process.exitCode = 1;
}

function printSimpleResult(result: InstallResult): void {
  if (result.success) {
    console.log(`✓ ${result.message}`);
  } else {
    console.error(`✗ ${result.message}`);
    process.exitCode = 1;
  }
}

const program = new Command();

program
  .name("promptery")
  .description("Context orchestration for AI agents (Kanban + MCP)")
  .version(loadPackageVersion());

// -------- hub / server --------

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
    "Start the MCP bridge over stdio. This is what AI agent clients should be configured to run."
  )
  .option("--agent <hint>", "agent hint (e.g. 'claude-desktop', 'cursor') for diagnostics")
  .action(async (opts: { agent?: string }) => {
    await runBridge({ agentHint: opts.agent });
  });

// -------- install commands --------

program
  .command("install")
  .description(
    "Auto-detect installed AI clients and install Promptery into each of them"
  )
  .action(async () => {
    console.log("Detecting installed AI clients...\n");

    const installed: { name: string; result: InstallResult }[] = [];
    for (const client of ALL_CLIENTS) {
      const status = await client.isInstalled();
      if (!status.configExists) {
        console.log(`  · ${client.name}: not detected`);
        continue;
      }
      console.log(`  → ${client.name}: detected`);
      const result = await client.install();
      installed.push({ name: client.name, result });
    }

    console.log("");

    if (installed.length === 0) {
      console.log("No AI clients detected. You can install into a specific client:");
      console.log("  promptery install-claude-desktop");
      console.log("  promptery install-claude-code");
      console.log("  promptery install-cursor");
      console.log("  promptery install-codex");
      console.log("  promptery install-qwen");
      console.log("  promptery install-gigacode");
      return;
    }

    console.log("Installation results:");
    for (const entry of installed) {
      const icon = entry.result.success ? "✓" : "✗";
      console.log(`  ${icon} ${entry.name}: ${entry.result.message}`);
      if (!entry.result.success) process.exitCode = 1;
    }

    console.log("");
    console.log("Restart your AI clients for the changes to take effect.");
  });

program
  .command("install-claude-desktop")
  .description("Install Promptery into Claude Desktop config")
  .action(async () => {
    const result = await installClaudeDesktop();
    printInstallResult(result, [
      "1. Quit Claude Desktop completely (Cmd+Q on macOS)",
      "2. Reopen Claude Desktop",
      '3. Ask Claude: "What MCP tools do you have available?"',
      "4. Claude should list Promptery tools",
    ]);
  });

program
  .command("install-claude-code")
  .description("Install Promptery into Claude Code config")
  .action(async () => {
    const result = await installClaudeCode();
    printInstallResult(result, [
      "1. Restart Claude Code",
      "2. If not working, run: claude mcp add promptery npx -y @dzenlotus/promptery server",
    ]);
  });

program
  .command("install-cursor")
  .description("Install Promptery into Cursor config")
  .option("--scope <scope>", '"global" or "project"', "global")
  .action(async (opts: { scope?: string }) => {
    const scope: CursorScope = opts.scope === "project" ? "project" : "global";
    const result = await installCursor(scope);
    printInstallResult(result, [
      "1. Restart Cursor",
      "2. Promptery MCP tools will be available in chat",
    ]);
  });

program
  .command("install-codex")
  .description("Install Promptery into Codex config (TOML)")
  .action(async () => {
    const result = await installCodex();
    printInstallResult(result, [
      "1. Restart Codex (close TUI and run codex again)",
      "2. In the new session, Promptery tools will be available",
      "Note: TOML comments may be lost during update — keep a backup if you have important ones.",
    ]);
  });

program
  .command("install-qwen")
  .description("Install Promptery into Qwen Code config")
  .action(async () => {
    const result = await installQwen();
    printInstallResult(result, [
      "1. Restart Qwen Code",
      "2. Run /mcp to verify Promptery is connected",
    ]);
  });

program
  .command("install-gigacode")
  .description("Install Promptery into GigaCode config")
  .action(async () => {
    const result = await installGigacode();
    printInstallResult(result, [
      "1. Restart GigaCode CLI",
      "2. Verify MCP is connected via built-in commands",
    ]);
  });

// -------- uninstall commands --------

program
  .command("uninstall-claude-desktop")
  .description("Remove Promptery from Claude Desktop")
  .action(async () => {
    printSimpleResult(await uninstallClaudeDesktop());
  });

program
  .command("uninstall-claude-code")
  .description("Remove Promptery from Claude Code")
  .action(async () => {
    printSimpleResult(await uninstallClaudeCode());
  });

program
  .command("uninstall-cursor")
  .description("Remove Promptery from Cursor")
  .option("--scope <scope>", '"global" or "project"', "global")
  .action(async (opts: { scope?: string }) => {
    const scope: CursorScope = opts.scope === "project" ? "project" : "global";
    printSimpleResult(await uninstallCursor(scope));
  });

program
  .command("uninstall-codex")
  .description("Remove Promptery from Codex")
  .action(async () => {
    printSimpleResult(await uninstallCodex());
  });

program
  .command("uninstall-qwen")
  .description("Remove Promptery from Qwen Code")
  .action(async () => {
    printSimpleResult(await uninstallQwen());
  });

program
  .command("uninstall-gigacode")
  .description("Remove Promptery from GigaCode")
  .action(async () => {
    printSimpleResult(await uninstallGigacode());
  });

program
  .command("uninstall-all")
  .description("Remove Promptery from all clients where it is currently installed")
  .action(async () => {
    console.log("Removing Promptery from all detected installations...\n");
    let touched = 0;
    for (const client of ALL_CLIENTS) {
      const status = await client.isInstalled();
      if (!status.installed) continue;
      touched++;
      const result = await client.uninstall();
      const icon = result.success ? "✓" : "✗";
      console.log(`  ${icon} ${client.name}: ${result.message}`);
      if (!result.success) process.exitCode = 1;
    }
    if (touched === 0) {
      console.log("Promptery was not installed in any detected client.");
    }
  });

// -------- status --------

program
  .command("status")
  .description("Show where Promptery is currently installed")
  .action(async () => {
    console.log("Promptery installation status:\n");
    const nameWidth = Math.max(...ALL_CLIENTS.map((c) => c.name.length)) + 2;
    for (const client of ALL_CLIENTS) {
      const status = await client.isInstalled();
      let icon: string;
      let suffix: string;
      if (!status.configExists) {
        icon = "○";
        suffix = "client not detected";
      } else if (status.installed) {
        icon = "✓";
        suffix = "installed";
      } else {
        icon = "·";
        suffix = "client detected, Promptery NOT installed";
      }
      console.log(`  ${icon} ${client.name.padEnd(nameWidth)} ${suffix}`);
      if (status.configExists) {
        console.log(`    ${status.configPath}`);
      }
    }
    console.log("");
    console.log("Legend: ✓ installed · detected but not installed ○ client not detected");
  });

// -------- default action (MCP host calls without args) --------

program.action(async () => {
  await runBridge();
});

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
