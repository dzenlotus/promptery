import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import {
  createBackup,
  deleteBackup,
  listBackups,
  maybeAutoBackup,
  restoreBackup,
} from "../backup.js";
import { getBackupsDir, getDbPath } from "../../lib/paths.js";

describe("backup module", () => {
  let originalHome: string | undefined;
  let tmpHome: string;
  let db: Database.Database;
  let dbPath: string;

  beforeEach(() => {
    originalHome = process.env.PROMPTERY_HOME_DIR;
    tmpHome = mkdtempSync(join(tmpdir(), "promptery-backup-test-"));
    process.env.PROMPTERY_HOME_DIR = tmpHome;

    // Seed a DB file at the configured path so VACUUM INTO has something to
    // snapshot and restoreBackup has something to overwrite.
    dbPath = getDbPath();
    db = new Database(dbPath);
    db.exec(
      "CREATE TABLE sample (k TEXT PRIMARY KEY, v TEXT NOT NULL); INSERT INTO sample VALUES ('hello','world');"
    );
  });

  afterEach(() => {
    db.close();
    if (originalHome === undefined) delete process.env.PROMPTERY_HOME_DIR;
    else process.env.PROMPTERY_HOME_DIR = originalHome;
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it("createBackup writes a file into the backups dir", async () => {
    const info = await createBackup(undefined, "manual", db);
    expect(info.filename).toMatch(/^db-manual-\d{8}-\d{6}\.sqlite$/);
    expect(info.fullPath.startsWith(getBackupsDir())).toBe(true);
    expect(info.size_bytes).toBeGreaterThan(0);
    expect(info.reason).toBe("manual");
  });

  it("createBackup honours customName", async () => {
    const info = await createBackup("my snapshot", "manual", db);
    expect(info.filename).toMatch(/^my-snapshot-\d{8}-\d{6}\.sqlite$/);
  });

  it("listBackups returns files sorted newest-first with inferred reasons", async () => {
    const a = await createBackup(undefined, "auto", db);
    // Force a different timestamp so the sort is unambiguous.
    await new Promise((r) => setTimeout(r, 20));
    const m = await createBackup(undefined, "manual", db);

    const list = await listBackups();
    expect(list.map((b) => b.filename)).toEqual([m.filename, a.filename]);
    expect(list[0]!.reason).toBe("manual");
    expect(list[1]!.reason).toBe("auto");
  });

  it("listBackups returns [] when dir is empty", async () => {
    expect(await listBackups()).toEqual([]);
  });

  it("deleteBackup removes the file", async () => {
    const info = await createBackup(undefined, "manual", db);
    expect((await listBackups()).find((b) => b.filename === info.filename)).toBeDefined();
    await deleteBackup(info.filename);
    expect((await listBackups()).find((b) => b.filename === info.filename)).toBeUndefined();
  });

  it("deleteBackup rejects path traversal attempts", async () => {
    await expect(deleteBackup("../escape.sqlite")).rejects.toThrow(/Invalid backup filename/);
    await expect(deleteBackup("a/b.sqlite")).rejects.toThrow(/Invalid backup filename/);
  });

  it("restoreBackup copies backup over the DB and writes a safety copy", async () => {
    const snapshot = await createBackup("v1", "manual", db);
    // Mutate the live DB so we can tell whether restore actually replaced it.
    db.prepare("UPDATE sample SET v = ? WHERE k = ?").run("mutated", "hello");
    db.close();

    const result = await restoreBackup(snapshot.filename);
    expect(result.restored).toBe(snapshot.filename);
    expect(result.safetyBackup).toMatch(/^db-pre-restore-/);

    const restored = new Database(dbPath);
    const row = restored.prepare("SELECT v FROM sample WHERE k = 'hello'").get() as { v: string };
    restored.close();
    expect(row.v).toBe("world");

    // Re-open for afterEach cleanup.
    db = new Database(dbPath);
  });

  it("restoreBackup errors cleanly on missing file", async () => {
    db.close();
    await expect(restoreBackup("does-not-exist.sqlite")).rejects.toThrow();
    db = new Database(dbPath);
  });

  it("maybeAutoBackup creates when no auto-backup exists, skips on rerun within 24h", async () => {
    const first = await maybeAutoBackup(30, db);
    expect(first.created?.reason).toBe("auto");

    const second = await maybeAutoBackup(30, db);
    expect(second.created).toBeNull();
  });

  it("maybeAutoBackup prunes entries older than keepDays", async () => {
    // Force the backups dir to exist before planting the backdated file.
    await listBackups();
    const oldFile = join(getBackupsDir(), "db-auto-19991231-235959.sqlite");
    writeFileSync(oldFile, "stale");
    const { utimesSync } = await import("node:fs");
    const oldTime = new Date("1999-12-31T23:59:59Z").getTime() / 1000;
    utimesSync(oldFile, oldTime, oldTime);

    const result = await maybeAutoBackup(30, db);
    expect(result.pruned).toContain("db-auto-19991231-235959.sqlite");
    expect((await listBackups()).find((b) => b.filename.includes("19991231"))).toBeUndefined();
  });
});
