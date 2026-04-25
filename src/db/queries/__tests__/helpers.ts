import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runMigrations } from "../../migrations.js";

const here = dirname(fileURLToPath(import.meta.url));
const schemaSql = readFileSync(join(here, "..", "..", "schema.sql"), "utf-8");

export function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(schemaSql);
  // Migrations seed the default space — required so createBoard() / createTask()
  // can resolve `default_space_id` and mint slugs without per-test boilerplate.
  runMigrations(db);
  return db;
}
