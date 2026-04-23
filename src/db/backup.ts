import { promises as fs } from "node:fs";
import { basename, join } from "node:path";
import type { Database } from "better-sqlite3";
import { getDb } from "./index.js";
import { getBackupsDir, getDbPath } from "../lib/paths.js";

export type BackupReason = "manual" | "auto" | "pre-migration" | "pre-restore";

export interface BackupInfo {
  filename: string;
  fullPath: string;
  size_bytes: number;
  created_at: number;
  reason: BackupReason;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function ensureBackupsDir(): Promise<string> {
  const dir = getBackupsDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * Reject any filename that tries to escape the backups directory.
 * Accepts a bare filename only — no slashes, no traversal. Used on every
 * caller-supplied name before we resolve it back to an absolute path.
 */
function assertSafeFilename(filename: string): void {
  if (!filename || filename !== basename(filename) || filename.includes("..")) {
    throw new Error(`Invalid backup filename: ${filename}`);
  }
}

function inferReason(filename: string): BackupReason {
  if (filename.includes("-auto-")) return "auto";
  if (filename.includes("-pre-migration-")) return "pre-migration";
  if (filename.includes("-pre-restore-")) return "pre-restore";
  return "manual";
}

function composeFilename(customName: string | undefined, reason: BackupReason): string {
  const ts = formatTimestamp(new Date());
  if (customName) {
    const slug = customName.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
    return `${slug}-${ts}.sqlite`;
  }
  return `db-${reason}-${ts}.sqlite`;
}

/**
 * Atomic backup via SQLite's VACUUM INTO — safe on a live, in-use DB. Accepts
 * an optional explicit handle for callers that already manage one (tests,
 * CLI `backup`); defaults to the shared hub connection.
 */
export async function createBackup(
  customName?: string,
  reason: BackupReason = "manual",
  db?: Database
): Promise<BackupInfo> {
  const dir = await ensureBackupsDir();

  const filename = composeFilename(customName, reason);
  const fullPath = join(dir, filename);

  const handle = db ?? getDb();
  // Parameter binding with VACUUM INTO is supported by recent better-sqlite3;
  // the statement is not a regular SELECT so `.run` is the correct entrypoint.
  handle.prepare("VACUUM INTO ?").run(fullPath);

  const stat = await fs.stat(fullPath);
  return {
    filename,
    fullPath,
    size_bytes: stat.size,
    created_at: stat.mtimeMs,
    reason,
  };
}

export async function listBackups(): Promise<BackupInfo[]> {
  try {
    const dir = await ensureBackupsDir();
    const entries = await fs.readdir(dir);
    const infos: BackupInfo[] = [];
    for (const f of entries) {
      if (!f.endsWith(".sqlite")) continue;
      const fullPath = join(dir, f);
      const stat = await fs.stat(fullPath).catch(() => null);
      if (!stat || !stat.isFile()) continue;
      infos.push({
        filename: f,
        fullPath,
        size_bytes: stat.size,
        created_at: stat.mtimeMs,
        reason: inferReason(f),
      });
    }
    return infos.sort((a, b) => b.created_at - a.created_at);
  } catch {
    return [];
  }
}

/**
 * Copy `filename` (inside the backups dir) over the current DB file. The hub
 * must be stopped before calling — callers are responsible for that check.
 * Writes a "pre-restore" safety copy of the existing DB beforehand so a
 * mistake is never catastrophic.
 */
export async function restoreBackup(
  filename: string
): Promise<{ ok: true; restored: string; safetyBackup: string | null }> {
  assertSafeFilename(filename);
  const dir = await ensureBackupsDir();
  const source = join(dir, filename);

  await fs.access(source);

  const dbPath = getDbPath();
  let safetyBackup: string | null = null;
  const safetyName = `db-pre-restore-${formatTimestamp(new Date())}.sqlite`;
  const safetyPath = join(dir, safetyName);
  try {
    await fs.copyFile(dbPath, safetyPath);
    safetyBackup = safetyName;
  } catch {
    // First-run restore with no prior DB — skip silently, nothing to protect.
  }

  await fs.copyFile(source, dbPath);

  // WAL / SHM files from the previous DB would desynchronise with the
  // restored main file on next open, so clear them. Both are optional.
  await fs.unlink(`${dbPath}-wal`).catch(() => {});
  await fs.unlink(`${dbPath}-shm`).catch(() => {});

  return { ok: true, restored: filename, safetyBackup };
}

export async function deleteBackup(filename: string): Promise<{ ok: true }> {
  assertSafeFilename(filename);
  const dir = await ensureBackupsDir();
  await fs.unlink(join(dir, filename));
  return { ok: true };
}

export interface AutoBackupResult {
  created: BackupInfo | null;
  pruned: string[];
}

/**
 * Rolling auto-backup: creates one if the most recent auto-backup is older
 * than 24 hours (or there isn't one yet), then prunes any auto-backups older
 * than `keepDays`. Failures are logged and swallowed so hub startup never
 * blocks on backup trouble.
 */
export async function maybeAutoBackup(
  keepDays = 30,
  db?: Database
): Promise<AutoBackupResult> {
  const outcome: AutoBackupResult = { created: null, pruned: [] };
  try {
    const backups = await listBackups();
    const autos = backups.filter((b) => b.reason === "auto");
    const lastAuto = autos[0];

    const now = Date.now();
    if (!lastAuto || now - lastAuto.created_at > ONE_DAY_MS) {
      outcome.created = await createBackup(undefined, "auto", db);
    }

    const cutoff = now - keepDays * ONE_DAY_MS;
    for (const b of autos) {
      if (b.created_at < cutoff) {
        try {
          await deleteBackup(b.filename);
          outcome.pruned.push(b.filename);
        } catch {
          // Best-effort cleanup; a stubborn file can linger until next run.
        }
      }
    }
  } catch (err) {
    console.error("[promptery] auto-backup failed:", err);
  }
  return outcome;
}
