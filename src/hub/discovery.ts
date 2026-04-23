import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getHomeDir } from "../lib/paths.js";

export interface HubLockInfo {
  pid: number;
  port: number;
  started_at: number;
  version: string;
}

/**
 * Hub writes this file after binding to its port; bridges read it to find the
 * hub. Lives under the same ~/.promptery dir as the sqlite db so users can
 * inspect/clear one directory.
 */
export function getHubLockPath(): string {
  return join(getHomeDir(), "hub.lock");
}

export async function writeHubLock(info: HubLockInfo): Promise<void> {
  const path = getHubLockPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(info, null, 2));
}

export async function readHubLock(): Promise<HubLockInfo | null> {
  try {
    const content = await readFile(getHubLockPath(), "utf-8");
    return JSON.parse(content) as HubLockInfo;
  } catch {
    return null;
  }
}

export async function clearHubLock(): Promise<void> {
  try {
    await unlink(getHubLockPath());
  } catch {
    // already gone — fine
  }
}

/**
 * Hits GET /health on the recorded port. A crashed hub may leave a stale
 * lockfile behind, so we always confirm with a real request before trusting it.
 */
export async function isHubAlive(
  info: HubLockInfo,
  timeoutMs = 2000
): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${info.port}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * kill(pid, 0) is a POSIX-standard trick: signal 0 performs error checking
 * (EPERM / ESRCH) without actually delivering a signal. Works on Windows too —
 * Node maps process.kill there to a safe liveness probe.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
