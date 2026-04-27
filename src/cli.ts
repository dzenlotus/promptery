#!/usr/bin/env node

/**
 * Promptery — context orchestration for AI agents
 * Copyright © 2026 dzenlotus
 * Licensed under the Elastic License 2.0 (see LICENSE file)
 */

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
import { isManagedNode } from "./cli/installers/nodeResolver.js";
import { clearHubLock, isProcessAlive, readHubLock } from "./hub/discovery.js";
import {
  createBackup,
  deleteBackup,
  listBackups,
  restoreBackup,
} from "./db/backup.js";
import { runMigrationsSafe } from "./db/migrationRunner.js";
import { getDbPath, ensureHomeDir } from "./lib/paths.js";

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

/**
 * Shown after install commands only. Reminds version-manager users that the
 * absolute npx path we wrote will go stale if they `nvm use` a different
 * version — then their host will try to spawn a binary that no longer exists.
 */
function printManagedNodeWarning(): void {
  if (!isManagedNode()) return;
  console.log("");
  console.log("⚠ Detected Node version manager (nvm/fnm/volta/asdf).");
  console.log("  If you switch Node versions later, re-run this install command");
  console.log("  to update the path stored in config.");
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
  .command("start")
  .description(
    "Start Promptery hub in the foreground (UI + API + DB). Ctrl+C to stop."
  )
  .option("-p, --port <port>", "Preferred port", "4321")
  .action(async (opts: { port: string }) => {
    const port = Number.parseInt(opts.port, 10);
    if (Number.isNaN(port)) {
      console.error(`Invalid port: "${opts.port}"`);
      process.exit(1);
    }
    await runHub({ preferredPort: port, banner: true });
  });

program
  .command("stop")
  .description("Stop the Promptery hub process if running.")
  .action(async () => {
    const lock = await readHubLock();

    if (!lock) {
      console.log("Hub is not running.");
      return;
    }

    if (!isProcessAlive(lock.pid)) {
      console.log("Hub process is not running (stale lock file — cleaning up).");
      await clearHubLock();
      return;
    }

    console.log(`Stopping hub (PID ${lock.pid}, port ${lock.port})...`);

    try {
      process.kill(lock.pid, "SIGTERM");
    } catch (err) {
      console.error(
        `Failed to send SIGTERM: ${err instanceof Error ? err.message : String(err)}`
      );
      process.exit(1);
    }

    // Poll for up to ~4s so the hub has a chance to close the DB, flush the
    // WS, and unlink its own lockfile. 200ms × 20 is fine-grained enough to
    // feel snappy while still covering slower machines under load.
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (!isProcessAlive(lock.pid)) {
        console.log("✓ Hub stopped.");
        return;
      }
    }

    console.log("Hub did not stop gracefully, sending SIGKILL...");
    try {
      process.kill(lock.pid, "SIGKILL");
      await clearHubLock();
      console.log("✓ Hub force-killed.");
    } catch (err) {
      console.error(
        `Failed to force-kill: ${err instanceof Error ? err.message : String(err)}`
      );
      process.exit(1);
    }
  });

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
    printManagedNodeWarning();
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
    printManagedNodeWarning();
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
    printManagedNodeWarning();
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
    printManagedNodeWarning();
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
    printManagedNodeWarning();
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
    printManagedNodeWarning();
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
    printManagedNodeWarning();
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

// -------- backups --------

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

program
  .command("backup")
  .description("Create a manual backup of the Promptery database")
  .option("-n, --name <name>", "Custom name prefix for the backup file")
  .action(async (opts: { name?: string }) => {
    try {
      const backup = await createBackup(opts.name, "manual");
      console.log(`✓ Backup created: ${backup.filename}`);
      console.log(`  Location: ${backup.fullPath}`);
      console.log(`  Size:     ${formatBytes(backup.size_bytes)}`);
    } catch (err) {
      console.error(
        `✗ Backup failed: ${err instanceof Error ? err.message : String(err)}`
      );
      process.exit(1);
    }
  });

program
  .command("backups")
  .description("List all Promptery backups")
  .action(async () => {
    const backups = await listBackups();
    if (backups.length === 0) {
      console.log("No backups found.");
      return;
    }

    console.log(`Found ${backups.length} backup(s):\n`);
    for (const b of backups) {
      const date = new Date(b.created_at).toISOString().replace("T", " ").slice(0, 19);
      console.log(`  ${b.filename}`);
      console.log(`    ${date}  ${formatBytes(b.size_bytes)}  [${b.reason}]`);
    }
  });

program
  .command("restore")
  .description("Restore the database from a backup file (hub must be stopped)")
  .argument("<filename>", "Backup filename from `promptery backups`")
  .action(async (filename: string) => {
    const lock = await readHubLock();
    if (lock && isProcessAlive(lock.pid)) {
      console.error(
        "✗ Hub is currently running. Stop it first: promptery stop"
      );
      process.exit(1);
    }

    try {
      const result = await restoreBackup(filename);
      console.log(`✓ Database restored from: ${result.restored}`);
      if (result.safetyBackup) {
        console.log(`  Previous database saved as: ${result.safetyBackup}`);
      }
    } catch (err) {
      console.error(
        `✗ Restore failed: ${err instanceof Error ? err.message : String(err)}`
      );
      process.exit(1);
    }
  });

program
  .command("backup-delete")
  .description("Delete a single backup file")
  .argument("<filename>", "Backup filename from `promptery backups`")
  .action(async (filename: string) => {
    try {
      await deleteBackup(filename);
      console.log(`✓ Deleted: ${filename}`);
    } catch (err) {
      console.error(
        `✗ Delete failed: ${err instanceof Error ? err.message : String(err)}`
      );
      process.exit(1);
    }
  });

// -------- migrate --------

program
  .command("migrate")
  .description(
    "Run pending database migrations with automatic snapshot and rollback on failure."
  )
  .action(async () => {
    ensureHomeDir();
    const dbPath = getDbPath();

    // Import Database lazily so the CLI startup stays fast when no migration
    // is needed (the common case for bridges/agents).
    const Database = (await import("better-sqlite3")).default;
    const { readFileSync } = await import("node:fs");

    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    // Apply schema so the _migrations table exists even on a brand-new DB.
    const schemaUrl = new URL("./db/schema.sql", import.meta.url);
    db.exec(readFileSync(schemaUrl, "utf-8"));

    // Run the migration wizard with verbose callbacks.
    console.log("Running migration wizard...\n");

    const result = await runMigrationsSafe(db, dbPath, {
      onStep: (name) => console.log(`  → applying: ${name}`),
      onSnapshot: (snapshotPath) =>
        console.log(`  snapshot:   ${snapshotPath}`),
      onRollback: (reason) =>
        console.error(`\n  ROLLBACK triggered: ${reason}`),
    });

    db.close();

    console.log("");

    if (result.status === "rolled-back") {
      console.error(`✗ Migration failed — DB rolled back to snapshot.`);
      if (result.snapshot) console.error(`  Snapshot: ${result.snapshot}`);
      if (result.error) console.error(`  Error:    ${result.error}`);
      process.exit(1);
    }

    if (result.applied.length === 0) {
      console.log("✓ No pending migrations — DB is up to date.");
    } else {
      console.log(`✓ Applied ${result.applied.length} migration(s):`);
      for (const name of result.applied) {
        console.log(`    ${name}`);
      }
      if (result.snapshot) {
        console.log(`  Snapshot: ${result.snapshot}`);
      }
    }

    if (result.skipped.length > 0) {
      console.log(
        `  (${result.skipped.length} migration(s) already applied, skipped)`
      );
    }
  });

// -------- default action (MCP host calls without args) --------

program.action(async () => {
  await runBridge();
});

program.parseAsync(process.argv).catch((err) => {
  // Expected failures (port busy, bad config) get a clean one-liner — agents
  // and users don't need the JS stack. Unexpected errors still dump the stack
  // so we don't lose debug signal.
  const expected =
    err instanceof Error &&
    (/Port \d+ is already in use/.test(err.message) ||
      /Invalid PROMPTERY_PORT/.test(err.message) ||
      /Hub is already running/.test(err.message));
  if (expected) {
    console.error(`✗ ${(err as Error).message}`);
  } else {
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  }
  process.exit(1);
});
