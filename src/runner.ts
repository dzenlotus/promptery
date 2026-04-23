import { getDb } from "./db/index.js";
import { maybeAutoBackup } from "./db/backup.js";
import { startServer, type ServerHandle } from "./server/index.js";
import {
  writeHubLock,
  clearHubLock,
  readHubLock,
  isHubAlive,
} from "./hub/discovery.js";
import { printStartupBanner } from "./server/banner.js";
import { getAppVersion } from "./lib/version.js";

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

  const db = getDb();

  // Rolling daily DB snapshot into ~/.promptery/backups, one at most per 24h,
  // with a 30-day retention window. Failures are logged and don't block start.
  const autoBackup = await maybeAutoBackup(30, db);
  if (autoBackup.created) {
    console.error(
      `[promptery-hub] auto-backup created: ${autoBackup.created.filename}`
    );
  }
  if (autoBackup.pruned.length > 0) {
    console.error(
      `[promptery-hub] pruned ${autoBackup.pruned.length} old auto-backup(s)`
    );
  }

  const preferred = options.preferredPort ?? 4321;
  const handle = await startServer(preferred, preferred + 100);

  await writeHubLock({
    pid: process.pid,
    port: handle.port,
    started_at: Date.now(),
    version: getAppVersion(),
  });

  // stderr — hub may be launched with stdout=ignored, and we don't want any
  // risk of log lines tainting the bridge stdio stream in any future reuse.
  console.error(`[promptery-hub] ready on http://localhost:${handle.port}`);

  if (options.banner) {
    const { port, uiMounted } = handle;
    if (process.stdout.isTTY) {
      // Foreground `start` / `hub`: show the styled banner. The URL points
      // at the UI if bundled, otherwise at the API root (dev workflow uses
      // `cd ui && npm run dev` against the API port).
      const url = uiMounted
        ? `http://localhost:${port}`
        : `http://localhost:${port}/api`;
      printStartupBanner(url, getAppVersion());
      if (!uiMounted) {
        console.log(
          `  (UI not bundled — run \`cd ui && npm run dev\` for dev mode)`
        );
        console.log();
      }
    }
    // Non-TTY (detached child from `ensureHubRunning`, piped logs, CI) already
    // got the single-line `[promptery-hub] ready on ...` message above —
    // no banner to avoid leaking ANSI escapes into captured output.
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
