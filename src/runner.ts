import { readFileSync } from "node:fs";
import { getDb } from "./db/index.js";
import { startServer, type ServerHandle } from "./server/index.js";
import {
  writeHubLock,
  clearHubLock,
  readHubLock,
  isHubAlive,
} from "./hub/discovery.js";

function loadVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf-8")
    ) as { version: string };
    return pkg.version;
  } catch {
    return "0.0.0";
  }
}

export interface RunHubOptions {
  preferredPort?: number;
  /** When true (used from CLI `hub` subcommand), prints user-facing banner. */
  banner?: boolean;
}

export interface HubHandle extends ServerHandle {
  shutdown: () => Promise<void>;
}

/**
 * Starts the hub (HTTP + WebSocket + API + UI) and registers it in the
 * filesystem lock so bridges can find it.
 *
 * If another live hub is already recorded, refuses to start a second one —
 * the caller is expected to connect to the existing hub instead.
 */
export async function runHub(options: RunHubOptions = {}): Promise<HubHandle> {
  const existing = await readHubLock();
  if (existing && (await isHubAlive(existing))) {
    throw new Error(
      `Hub is already running on port ${existing.port} (PID ${existing.pid}). ` +
        "Stop it first or connect to it directly."
    );
  }

  getDb();

  const preferred = options.preferredPort ?? 4321;
  const handle = await startServer(preferred, preferred + 100);

  await writeHubLock({
    pid: process.pid,
    port: handle.port,
    started_at: Date.now(),
    version: loadVersion(),
  });

  // stderr — hub may be launched with stdout=ignored, and we don't want any
  // risk of log lines tainting the bridge stdio stream in any future reuse.
  console.error(`[promptery-hub] ready on http://localhost:${handle.port}`);

  if (options.banner) {
    const { port, uiMounted } = handle;
    console.log();
    console.log("  🪷 Promptery hub");
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
  }

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    await clearHubLock();
    await handle.close();
  };

  const onSignal = (signal: string) => {
    console.error(`[promptery-hub] received ${signal}, shutting down`);
    void shutdown().finally(() => process.exit(0));
  };
  process.on("SIGINT", () => onSignal("SIGINT"));
  process.on("SIGTERM", () => onSignal("SIGTERM"));
  // Synchronous best-effort cleanup for hard exits — clearHubLock is async,
  // but fs.unlinkSync via a separate attempt keeps the lockfile tidy.
  process.on("exit", () => {
    void clearHubLock();
  });

  return { ...handle, shutdown };
}
