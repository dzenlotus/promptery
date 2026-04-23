import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import lockfile from "proper-lockfile";
import { findFreePort } from "../lib/port.js";
import { getHomeDir } from "../lib/paths.js";
import {
  readHubLock,
  clearHubLock,
  isHubAlive,
  isProcessAlive,
} from "./discovery.js";

function getStartLockPath(): string {
  return join(getHomeDir(), "hub-start.lock");
}

export interface HubEndpoint {
  port: number;
  url: string;
}

/**
 * Bridges call this at startup. Returns the URL of a live hub, launching one
 * if necessary.
 *
 *   1. Fast path — if an existing lockfile points at a responsive hub, use it.
 *   2. Otherwise grab a cross-process mutex (proper-lockfile) so parallel
 *      bridges don't each spawn their own hub.
 *   3. Re-check (another bridge may have won the race while we waited for
 *      the mutex), clean up stale lockfiles, then spawn a detached hub and
 *      poll `/health` until it's ready.
 */
export async function ensureHubRunning(): Promise<HubEndpoint> {
  const existing = await readHubLock();
  if (existing && (await isHubAlive(existing))) {
    return { port: existing.port, url: `http://127.0.0.1:${existing.port}` };
  }

  const startLockPath = getStartLockPath();
  await mkdir(dirname(startLockPath), { recursive: true });
  // proper-lockfile needs a real file to lock against — create an empty one
  // if missing. writeFile with 'a' won't truncate if it already exists.
  await writeFile(startLockPath, "", { flag: "a" });

  const release = await lockfile.lock(startLockPath, {
    retries: { retries: 30, minTimeout: 100, maxTimeout: 500 },
    stale: 15_000,
  });

  try {
    // Double-check after acquiring the mutex — a sibling bridge may have
    // finished starting the hub while we were waiting.
    const recheck = await readHubLock();
    if (recheck && (await isHubAlive(recheck))) {
      return { port: recheck.port, url: `http://127.0.0.1:${recheck.port}` };
    }
    if (recheck && !isProcessAlive(recheck.pid)) {
      await clearHubLock();
    }

    const port = await findFreePort(4321, 4399);
    const child = spawnDetachedHub(port);
    if (!child.pid) {
      throw new Error("Failed to spawn hub — child has no PID");
    }
    await waitForHubReady(port, child.pid, 15_000);

    return { port, url: `http://127.0.0.1:${port}` };
  } finally {
    await release();
  }
}

/**
 * Detaches the hub so it outlives this bridge process. `stdio: 'ignore'`
 * matters twice: (1) it frees us from holding pipes open, and (2) it prevents
 * the hub's logs from leaking into the bridge's stdout — which would corrupt
 * the MCP JSON-RPC stream.
 *
 * `process.execArgv` is propagated so the child inherits any loader flags
 * (e.g. tsx's `--import`/`--require`). Without this, running the bridge via
 * `tsx src/cli.ts server` in dev would spawn a bare-node child that can't
 * load the TypeScript CLI and dies instantly.
 */
function spawnDetachedHub(port: number): ChildProcess {
  const execPath = process.execPath;
  const cliPath = process.argv[1];
  if (!cliPath) {
    throw new Error("Cannot determine CLI path to spawn hub");
  }

  const child = spawn(
    execPath,
    [...process.execArgv, cliPath, "hub", "--port", String(port)],
    {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, PROMPTERY_HUB_AUTOSTARTED: "1" },
    }
  );
  child.unref();
  return child;
}

async function waitForHubReady(
  port: number,
  pid: number,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      throw new Error(`Hub process (PID ${pid}) died during startup`);
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(500),
      });
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(
    `Hub did not become ready within ${timeoutMs}ms on port ${port}`
  );
}
