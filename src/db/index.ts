import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { nanoid } from "nanoid";
import { ensureHomeDir, getDbPath } from "../lib/paths.js";
import { runMigrations } from "./migrations.js";

let dbInstance: Database.Database | null = null;

/**
 * Test seam: replace the singleton with an externally-managed DB (typically
 * an in-memory instance from `__tests__/helpers/testDb.ts`) so route handlers
 * picking up `getDb()` operate on that DB instead of the production file.
 * Pass `null` to clear the override. Production code never calls this.
 */
export function _setDbForTesting(db: Database.Database | null): void {
  dbInstance = db;
}

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  ensureHomeDir();
  const db = new Database(getDbPath());
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const schemaUrl = new URL("./schema.sql", import.meta.url);
  db.exec(readFileSync(schemaUrl, "utf-8"));
  runMigrations(db);

  seedDefaults(db);

  dbInstance = db;
  return db;
}

function seedDefaults(db: Database.Database): void {
  const row = db.prepare("SELECT COUNT(*) AS c FROM boards").get() as { c: number };
  if (row.c > 0) return;

  // Migration 009 has already created exactly one row marked is_default = 1.
  const defaultSpace = db
    .prepare("SELECT id FROM spaces WHERE is_default = 1")
    .get() as { id: string };

  const now = Date.now();
  const boardId = nanoid();

  const insertBoard = db.prepare(
    "INSERT INTO boards (id, name, space_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  );
  const insertColumn = db.prepare(
    "INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)"
  );

  const tx = db.transaction(() => {
    insertBoard.run(boardId, "My Board", defaultSpace.id, now, now);
    ["todo", "in-progress", "qa", "done"].forEach((name, idx) => {
      insertColumn.run(nanoid(), boardId, name, idx, now);
    });
  });
  tx();
}
