import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { runMigrations } from "../migrations.js";

/**
 * Reconstruct the pre-refactor schema (the historical state right after
 * migration 002) so we can verify migration 004 transforms it correctly.
 */
function createLegacyDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
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
    CREATE TABLE tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      color TEXT DEFAULT '#888',
      kind TEXT NOT NULL DEFAULT 'skill' CHECK (kind IN ('role', 'skill', 'prompt', 'mcp')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE task_tags (
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (task_id, tag_id)
    );
  `);
  return db;
}

describe("migration 004", () => {
  it("migrates legacy tags and task_tags into typed tables", () => {
    const db = createLegacyDb();
    const now = Date.now();

    db.prepare("INSERT INTO boards (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run(
      "b1",
      "B",
      now,
      now
    );
    db.prepare(
      "INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run("c1", "b1", "todo", 0, now);
    db.prepare(
      `INSERT INTO tasks
       (id, board_id, column_id, number, title, description, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("t1", "b1", "c1", 1, "task one", "", 1, now, now);

    db.prepare(
      "INSERT INTO tags (id, name, description, color, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("tg-prompt", "p-old", "old desc", "#aaa", "prompt", now, now);
    db.prepare(
      "INSERT INTO tags (id, name, description, color, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("tg-skill", "s-old", "", "#bbb", "skill", now, now);
    db.prepare(
      "INSERT INTO tags (id, name, description, color, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("tg-mcp", "m-old", "", "#ccc", "mcp", now, now);
    db.prepare(
      "INSERT INTO tags (id, name, description, color, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("tg-role", "r-old", "", "#ddd", "role", now, now);

    db.prepare("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)").run("t1", "tg-prompt");
    db.prepare("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)").run("t1", "tg-skill");
    db.prepare("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)").run("t1", "tg-mcp");
    db.prepare("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)").run("t1", "tg-role");

    runMigrations(db);

    // New tables exist with copied rows
    expect(db.prepare("SELECT name, content, color FROM prompts WHERE id = 'tg-prompt'").get()).toEqual({
      name: "p-old",
      content: "old desc",
      color: "#aaa",
    });
    expect(db.prepare("SELECT id FROM skills WHERE id = 'tg-skill'").get()).toBeDefined();
    expect(db.prepare("SELECT id FROM mcp_tools WHERE id = 'tg-mcp'").get()).toBeDefined();
    expect(db.prepare("SELECT id FROM roles WHERE id = 'tg-role'").get()).toBeDefined();

    // Task got role_id set and direct-origin link rows for the rest
    const task = db.prepare("SELECT role_id FROM tasks WHERE id = 't1'").get() as {
      role_id: string;
    };
    expect(task.role_id).toBe("tg-role");

    const tp = db
      .prepare("SELECT prompt_id, origin FROM task_prompts WHERE task_id = 't1'")
      .all();
    expect(tp).toEqual([{ prompt_id: "tg-prompt", origin: "direct" }]);
    const ts = db.prepare("SELECT skill_id, origin FROM task_skills WHERE task_id = 't1'").all();
    expect(ts).toEqual([{ skill_id: "tg-skill", origin: "direct" }]);
    const tm = db
      .prepare("SELECT mcp_tool_id, origin FROM task_mcp_tools WHERE task_id = 't1'")
      .all();
    expect(tm).toEqual([{ mcp_tool_id: "tg-mcp", origin: "direct" }]);

    // Old tables dropped
    const tagsTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tags'")
      .get();
    const taskTagsTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='task_tags'")
      .get();
    expect(tagsTable).toBeUndefined();
    expect(taskTagsTable).toBeUndefined();
  });

  it("is idempotent — second run is a no-op", () => {
    const db = createLegacyDb();
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();
  });

  it("works on a fresh DB with no legacy tags table", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
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
    `);
    expect(() => runMigrations(db)).not.toThrow();
    // The four typed tables should exist now.
    for (const t of ["prompts", "skills", "mcp_tools", "roles"]) {
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
        .get(t);
      expect(row).toBeDefined();
    }
  });
});
