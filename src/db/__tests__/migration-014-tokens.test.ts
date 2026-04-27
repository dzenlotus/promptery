import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { runMigrations } from "../migrations.js";
import { countTokens } from "../../lib/tokenCount.js";

/**
 * Build a DB that's already past migration 008 but pre-014: schema declares
 * `prompts` without the token_count column, then we drop a couple of rows
 * with content into it. Running runMigrations() must add the column AND
 * backfill every row's token count from `content`.
 */
function createPre014Db(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  // Schema covers everything earlier migrations expect to find. The key
  // detail for this test is `prompts` *without* a token_count column —
  // matching the state of any DB created before migration 014.
  db.exec(`
    CREATE TABLE boards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE columns (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INTEGER NOT NULL,
      created_at INTEGER NOT NULL
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
    CREATE TABLE prompts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL DEFAULT '',
      color TEXT DEFAULT '#888',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return db;
}

describe("migration 014 — prompt token_count backfill", () => {
  it("adds the column and backfills cl100k_base counts on existing rows", () => {
    const db = createPre014Db();
    const now = Date.now();

    db.prepare(
      "INSERT INTO prompts (id, name, content, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("p1", "alpha", "Hello world from a legacy prompt", "#888", now, now);
    db.prepare(
      "INSERT INTO prompts (id, name, content, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("p2", "beta", "", "#888", now, now);
    db.prepare(
      "INSERT INTO prompts (id, name, content, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("p3", "gamma", "another prompt with different content", "#888", now, now);

    runMigrations(db);

    const cols = db.prepare("PRAGMA table_info(prompts)").all() as { name: string }[];
    expect(cols.some((c) => c.name === "token_count")).toBe(true);

    const rows = db
      .prepare("SELECT id, content, token_count FROM prompts ORDER BY id")
      .all() as { id: string; content: string; token_count: number | null }[];

    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.token_count).not.toBeNull();
      expect(r.token_count).toBe(countTokens(r.content));
    }
  });

  it("is idempotent — re-running runMigrations does not error or rewrite counts", () => {
    const db = createPre014Db();
    const now = Date.now();
    db.prepare(
      "INSERT INTO prompts (id, name, content, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("p1", "alpha", "Hello world", "#888", now, now);

    runMigrations(db);
    const first = db
      .prepare("SELECT token_count FROM prompts WHERE id = 'p1'")
      .get() as { token_count: number };

    expect(() => runMigrations(db)).not.toThrow();
    const second = db
      .prepare("SELECT token_count FROM prompts WHERE id = 'p1'")
      .get() as { token_count: number };

    expect(second.token_count).toBe(first.token_count);
  });
});
