/**
 * Migration wizard: automatic pre-migration snapshot, step-by-step migration
 * execution, post-migration integrity verification, and automatic rollback on
 * failure.
 *
 * Design decision: ALWAYS snapshot before running any pending migrations,
 * regardless of whether they are "destructive" in the historical sense. The
 * cost of a VACUUM INTO is small (milliseconds on a typical DB) compared to
 * the risk of losing data due to an unexpected error in any step. This is
 * simpler to reason about than per-migration destructiveness flags and is
 * consistent with the principle of least surprise.
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { Database } from "better-sqlite3";
import {
  runMigrations,
  type RunMigrationsOptions,
} from "./migrations.js";
import { getBackupsDir } from "../lib/paths.js";

/** Critical tables verified after each migration run. */
const CRITICAL_TABLES = ["boards", "tasks", "prompts", "roles"] as const;

export interface MigrationResult {
  /** Names of migrations that were applied in this run. */
  applied: string[];
  /** Names of migrations that were already recorded and skipped. */
  skipped: string[];
  /** Absolute path of the pre-migration snapshot, if one was created. */
  snapshot?: string;
  /** "ok" — all migrations applied and verified. "rolled-back" — failure, DB restored. */
  status: "ok" | "rolled-back";
  /** Human-readable error message when status is "rolled-back". */
  error?: string;
}

export interface MigrationRunnerOptions extends RunMigrationsOptions {
  /**
   * Called just before a migration step is applied.
   * @param name  Migration name (e.g. "004_refactor_tags_to_typed_entities")
   */
  onStep?: (name: string) => void;
  /**
   * Called after the snapshot has been written.
   * @param snapshotPath  Absolute path to the snapshot file.
   */
  onSnapshot?: (snapshotPath: string) => void;
  /**
   * Called when a rollback is triggered.
   * @param reason  Error message explaining why the rollback was triggered.
   */
  onRollback?: (reason: string) => void;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function ensureBackupsDir(): Promise<string> {
  const dir = getBackupsDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Enumerate migration names that have NOT yet been applied to `db`. Mirrors
 * the ladder in `runMigrations` — the names must stay in sync. The set of
 * pending names is used to decide whether a snapshot is needed and to populate
 * the `applied` / `skipped` fields of MigrationResult.
 */
function getMigrationLadder(includeFTS: boolean): string[] {
  const ladder = [
    "002_add_tag_kind",
    "004_refactor_tags_to_typed_entities",
    "005_settings",
    "006_inheritance",
    "007_prompt_groups",
  ];
  if (includeFTS) ladder.push("008_tasks_fts");
  return ladder;
}

function getAppliedMigrations(db: Database): Set<string> {
  try {
    const rows = db
      .prepare("SELECT name FROM _migrations")
      .all() as { name: string }[];
    return new Set(rows.map((r) => r.name));
  } catch {
    // _migrations table doesn't exist yet → nothing applied.
    return new Set();
  }
}

/**
 * Run `PRAGMA integrity_check` and verify it returns a single "ok" row.
 * Also confirms that each critical table is accessible (SELECT COUNT).
 * Returns null on success, or an error description string on failure.
 */
function verifyIntegrity(db: Database): string | null {
  try {
    const rows = db
      .prepare("PRAGMA integrity_check")
      .all() as { integrity_check: string }[];
    if (rows.length !== 1 || rows[0]?.integrity_check !== "ok") {
      const details = rows.map((r) => r.integrity_check).join("; ");
      return `integrity_check failed: ${details}`;
    }
  } catch (err) {
    return `integrity_check threw: ${err instanceof Error ? err.message : String(err)}`;
  }

  for (const table of CRITICAL_TABLES) {
    try {
      const tableExists = db
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
        )
        .get(table);
      if (!tableExists) continue; // table may not exist on very old schemas — skip
      db.prepare(`SELECT COUNT(*) FROM ${table}`).get();
    } catch (err) {
      return `post-migration count on '${table}' failed: ${
        err instanceof Error ? err.message : String(err)
      }`;
    }
  }

  return null;
}

/**
 * Restore the DB file at `dbPath` from `snapshotPath`. Clears WAL / SHM
 * artefacts so the next open is clean.
 */
async function restoreSnapshot(
  dbPath: string,
  snapshotPath: string
): Promise<void> {
  await fs.copyFile(snapshotPath, dbPath);
  await fs.unlink(`${dbPath}-wal`).catch(() => {});
  await fs.unlink(`${dbPath}-shm`).catch(() => {});
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run all pending migrations against `db` with:
 *   1. Detection of pending migrations (skips entirely if nothing to do).
 *   2. Automatic VACUUM INTO snapshot before applying any changes.
 *   3. `runMigrations` called with optional step hooks.
 *   4. PRAGMA integrity_check + critical-table row-count smoke test.
 *   5. Automatic rollback (file-copy restore) if any step throws or the
 *      integrity check fails.
 *
 * NOTE: `db` is an open connection. For rollback to be effective the caller
 * must close and reopen `db` after a rolled-back result, since the in-memory
 * connection reflects the failed state while the file has been restored.
 * The hub wires this correctly via `runMigrationsSafe` on a fresh connection
 * before handing it to the rest of the application.
 *
 * @param db       Open better-sqlite3 connection to the target database.
 * @param dbPath   Absolute path to the SQLite file on disk (needed for
 *                 snapshot and rollback; not needed for in-memory DBs).
 * @param opts     Optional hooks and RunMigrationsOptions.
 */
export async function runMigrationsSafe(
  db: Database,
  dbPath: string | null,
  opts: MigrationRunnerOptions = {}
): Promise<MigrationResult> {
  const { onStep, onSnapshot, onRollback, includeFTS = true } = opts;

  const ladder = getMigrationLadder(includeFTS);
  const applied = getAppliedMigrations(db);

  const pending = ladder.filter((n) => !applied.has(n));
  const skipped = ladder.filter((n) => applied.has(n));

  // Nothing to do — fast path, no snapshot needed.
  if (pending.length === 0) {
    return { applied: [], skipped, status: "ok" };
  }

  // --- 1. Snapshot --------------------------------------------------------
  let snapshotPath: string | undefined;

  if (dbPath !== null) {
    const dir = await ensureBackupsDir();
    const ts = formatTimestamp(new Date());
    const filename = `db-pre-migration-${ts}.sqlite`;
    snapshotPath = join(dir, filename);
    db.prepare("VACUUM INTO ?").run(snapshotPath);
    onSnapshot?.(snapshotPath);
    console.error(`[promptery] pre-migration snapshot: ${snapshotPath}`);
  }

  // --- 2. Apply migrations ------------------------------------------------
  const appliedNames: string[] = [];

  try {
    // Instrument runMigrations by wrapping each migration name.
    // We rely on the fact that runMigration logs when it applies a step —
    // but we also need our own tracking. The cleanest approach is to call
    // runMigrations (which is idempotent and tracks in _migrations) and then
    // determine what was applied by diffing the before/after set.
    const beforeNames = new Set(getAppliedMigrations(db));

    // Notify caller about each pending step before the batch runs.
    for (const name of pending) {
      onStep?.(name);
    }

    runMigrations(db, { includeFTS });

    const afterNames = getAppliedMigrations(db);
    for (const name of afterNames) {
      if (!beforeNames.has(name)) {
        appliedNames.push(name);
      }
    }

    // --- 3. Integrity check -----------------------------------------------
    const integrityError = verifyIntegrity(db);
    if (integrityError) {
      throw new Error(integrityError);
    }

    console.error(
      `[promptery] migrations complete — applied: ${appliedNames.join(", ") || "(none)"}`
    );

    return {
      applied: appliedNames,
      skipped,
      snapshot: snapshotPath,
      status: "ok",
    };
  } catch (rawErr) {
    const reason =
      rawErr instanceof Error ? rawErr.message : String(rawErr);
    const msg = `Migration failed: ${reason}`;

    console.error(`[promptery] ${msg}`);
    onRollback?.(msg);

    // --- 4. Rollback -------------------------------------------------------
    if (snapshotPath !== undefined && dbPath !== null) {
      try {
        await restoreSnapshot(dbPath, snapshotPath);
        console.error(
          `[promptery] rolled back DB from snapshot: ${snapshotPath}`
        );
      } catch (restoreErr) {
        const restoreMsg = `Rollback also failed: ${
          restoreErr instanceof Error ? restoreErr.message : String(restoreErr)
        }`;
        console.error(`[promptery] CRITICAL: ${restoreMsg}`);
        // Surface both errors so callers know the DB may be in a bad state.
        throw new Error(`${msg}. ${restoreMsg}`);
      }
    }

    return {
      applied: appliedNames,
      skipped,
      snapshot: snapshotPath,
      status: "rolled-back",
      error: msg,
    };
  }
}
