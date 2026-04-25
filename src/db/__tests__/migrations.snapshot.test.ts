import Database from "better-sqlite3";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL = readFileSync(join(here, "..", "schema.sql"), "utf-8");

/**
 * Pre-migration snapshot: destructive migrations (currently 009 and 010)
 * write a `db-pre-<name>-<ts>.sqlite` snapshot to ~/.promptery/backups/
 * before applying the change. The snapshot is taken via `VACUUM INTO` so
 * a partial / failed migration leaves a recoverable copy behind.
 *
 * Test strategy:
 *   - Use `PROMPTERY_HOME_DIR` to point the backup dir at a tmp directory.
 *   - Use a real SQLite file (not :memory:) because the snapshot path
 *     skips in-memory DBs by design.
 *   - Build a "pre-009" schema directly so 009 is the next migration to
 *     run; verify the snapshot file exists, is non-empty, and opens as a
 *     valid SQLite DB carrying the pre-migration shape (with the legacy
 *     `tasks.number` column still in place).
 */
describe("migrations — pre-destructive snapshot", () => {
  let tmpHome: string;
  let originalHomeDir: string | undefined;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), "promptery-test-snap-"));
    originalHomeDir = process.env.PROMPTERY_HOME_DIR;
    process.env.PROMPTERY_HOME_DIR = tmpHome;
  });

  afterEach(() => {
    if (originalHomeDir === undefined) {
      delete process.env.PROMPTERY_HOME_DIR;
    } else {
      process.env.PROMPTERY_HOME_DIR = originalHomeDir;
    }
    rmSync(tmpHome, { recursive: true, force: true });
    vi.resetModules();
  });

  it("writes a non-empty SQLite snapshot named db-pre-009_spaces-* before applying 009", async () => {
    // Construct a pre-009 file-backed DB directly. Resolving the migrations
    // module dynamically so it picks up the patched PROMPTERY_HOME_DIR env.
    const { runMigrations } = await import("../migrations.js");

    const dbPath = join(tmpHome, "db.sqlite");
    const db = new Database(dbPath);
    db.pragma("foreign_keys = ON");
    // Minimal pre-009 schema — boards without space_id, tasks with `number`.
    db.exec(`
      CREATE TABLE boards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE columns (
        id TEXT PRIMARY KEY,
        board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        position INTEGER NOT NULL,
        role_id TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE roles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        content TEXT NOT NULL DEFAULT '',
        color TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        column_id TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
        number INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        position REAL NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    // Stuff in some shape so the snapshot is non-trivial.
    db.prepare(
      "INSERT INTO boards (id, name, created_at, updated_at) VALUES ('b1', 'x', 1, 1)"
    ).run();
    db.prepare(
      "INSERT INTO columns (id, board_id, name, position, created_at) VALUES ('c1', 'b1', 'todo', 0, 1)"
    ).run();
    db.prepare(
      "INSERT INTO tasks (id, board_id, column_id, number, title, position, created_at, updated_at) VALUES ('t1', 'b1', 'c1', 1, 'first', 0, 1, 1)"
    ).run();

    runMigrations(db);
    db.close();

    const backupsDir = join(tmpHome, "backups");
    expect(existsSync(backupsDir)).toBe(true);

    const files = readdirSync(backupsDir).filter((f) =>
      f.startsWith("db-pre-009_spaces-")
    );
    expect(files.length).toBeGreaterThan(0);

    const snapshot = join(backupsDir, files[0]!);
    const stat = statSync(snapshot);
    expect(stat.size).toBeGreaterThan(0);

    // The snapshot should be a fully-valid SQLite file carrying the
    // pre-migration shape (legacy `tasks.number`, no `tasks.slug`).
    const snap = new Database(snapshot, { readonly: true });
    const taskCols = snap.prepare("PRAGMA table_info(tasks)").all() as Array<{
      name: string;
    }>;
    const colNames = taskCols.map((c) => c.name);
    expect(colNames).toContain("number");
    expect(colNames).not.toContain("slug");
    snap.close();
  });

  it("does not write a snapshot for non-destructive migrations (e.g. 005)", async () => {
    const { runMigrations } = await import("../migrations.js");

    // Fresh file-backed DB initialised the same way getDb() does in
    // production: schema.sql first, then the migration ladder. Only the
    // 009/010 destructive migrations should write a snapshot.
    const dbPath = join(tmpHome, "db.sqlite");
    const db = new Database(dbPath);
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA_SQL);
    runMigrations(db);
    db.close();

    const backupsDir = join(tmpHome, "backups");
    const files = existsSync(backupsDir) ? readdirSync(backupsDir) : [];
    const has005Snap = files.some((f) =>
      f.startsWith("db-pre-005_settings-")
    );
    expect(has005Snap).toBe(false);
  });

  it("skips snapshot for in-memory DBs (tests path) without throwing", async () => {
    const { runMigrations } = await import("../migrations.js");
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA_SQL);
    expect(() => runMigrations(db)).not.toThrow();
    // No backups dir created for the in-memory path.
    const backupsDir = join(tmpHome, "backups");
    expect(existsSync(backupsDir)).toBe(false);
    db.close();
  });
});
