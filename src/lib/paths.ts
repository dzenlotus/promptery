import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

export function getHomeDir(): string {
  return process.env.PROMPTERY_HOME_DIR ?? join(homedir(), ".promptery");
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
