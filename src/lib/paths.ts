import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

export function getHomeDir(): string {
  return process.env.PROMPTERY_HOME_DIR ?? join(homedir(), ".promptery");
}

/**
 * True when the hub is running against a non-default data directory. Used to
 * surface a [DEV] indicator in the UI and banner so a second hub started for
 * development cannot be mistaken for the production one.
 */
export function isDevHome(): boolean {
  const override = process.env.PROMPTERY_HOME_DIR;
  return typeof override === "string" && override.trim().length > 0;
}

export function getDbPath(): string {
  return join(getHomeDir(), "db.sqlite");
}

export function getBackupsDir(): string {
  return join(getHomeDir(), "backups");
}

export function ensureHomeDir(): void {
  const dir = getHomeDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
