import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { runMigrations, type RunMigrationsOptions } from "../../migrations.js";

export interface TestDb {
  db: Database.Database;
  close: () => void;
}

/**
 * Build a fresh in-memory DB using the same two-step initialisation as
 * production (`schema.sql` + `runMigrations`), but without the production
 * `seedDefaults` step — tests start with zero rows so factory expectations
 * are deterministic. Pass `{ includeFTS: false }` to construct a pre-008
 * snapshot (used by the migration backfill test).
 */
export function createTestDb(opts: RunMigrationsOptions = {}): TestDb {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");

  const schemaSql = loadSchemaSql(opts.includeFTS ?? true);
  db.exec(schemaSql);
  runMigrations(db, opts);

  return {
    db,
    close: () => db.close(),
  };
}

let cachedFullSchema: string | null = null;

function loadSchemaSql(includeFTS: boolean): string {
  if (cachedFullSchema === null) {
    const schemaUrl = new URL("../../schema.sql", import.meta.url);
    cachedFullSchema = readFileSync(schemaUrl, "utf-8");
  }
  if (includeFTS) return cachedFullSchema;
  return stripFtsBlock(cachedFullSchema);
}

/**
 * Slice off the FTS5 virtual table + triggers so a "pre-008" DB doesn't
 * accidentally have them. Anchored on the literal comment header in
 * schema.sql so a nearby edit fails loudly rather than silently.
 */
function stripFtsBlock(sql: string): string {
  const marker = "-- Full-text search index for tasks.";
  const start = sql.indexOf(marker);
  if (start === -1) {
    throw new Error(
      "createTestDb({ includeFTS: false }): FTS marker not found in schema.sql — " +
        "did the comment header change?"
    );
  }
  return sql.slice(0, start);
}
