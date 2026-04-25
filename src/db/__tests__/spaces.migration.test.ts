import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runMigrations } from "../migrations.js";

/**
 * These tests reconstruct a *pre-009* DB shape — boards without `space_id`,
 * tasks with the legacy `number` column — and run the full migration ladder
 * against it. The goal is to verify that:
 *
 *  - the default space exists exactly once after migration,
 *  - existing boards land in the right space (Promptery boards detected by
 *    name; everything else in default),
 *  - existing tasks get sequential slugs in `created_at` order, scoped per
 *    space, with no global collisions,
 *  - the per-space counter ends at `last_used + 1`,
 *  - `tasks.number` is gone and `boards.space_id` is populated everywhere,
 *  - re-running migrations is a no-op (slug values unchanged).
 *
 * The schema we reconstruct here matches the live shape immediately AFTER
 * migration 008 (post-FTS) but BEFORE migration 009. That's the realistic
 * starting point for any user upgrading from 0.2.4 → 0.3.0.
 */

interface Pre009Options {
  /**
   * Each board has a name and an explicit created_at (used for slug-order
   * verification). Tasks inside a board carry created_at and a synthetic
   * `number`. The factory does not enforce any FK on roles/columns beyond
   * what the schema requires.
   */
  boards: Array<{
    id?: string;
    name: string;
    created_at: number;
    tasks?: Array<{
      id?: string;
      title?: string;
      number: number;
      created_at: number;
    }>;
  }>;
}

function createPre009Db(opts: Pre009Options): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");

  // Pre-009 schema — boards without space_id, tasks with `number`.
  // Includes everything migration 008 declared so we start from a realistic
  // 0.2.4 snapshot.
  db.exec(`
    CREATE TABLE boards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role_id TEXT REFERENCES roles(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE columns (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INTEGER NOT NULL,
      role_id TEXT REFERENCES roles(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL DEFAULT '',
      color TEXT DEFAULT '#888',
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
    CREATE TABLE skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL DEFAULT '',
      color TEXT DEFAULT '#888',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE mcp_tools (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL DEFAULT '',
      color TEXT DEFAULT '#888',
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
      role_id TEXT REFERENCES roles(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  let boardIdx = 0;
  for (const b of opts.boards) {
    boardIdx += 1;
    const boardId = b.id ?? `b${boardIdx}`;
    db.prepare(
      "INSERT INTO boards (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)"
    ).run(boardId, b.name, b.created_at, b.created_at);

    const colId = `c${boardIdx}`;
    db.prepare(
      "INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, 0, ?)"
    ).run(colId, boardId, "todo", b.created_at);

    let taskIdx = 0;
    for (const t of b.tasks ?? []) {
      taskIdx += 1;
      const tid = t.id ?? `t${boardIdx}-${taskIdx}`;
      db.prepare(
        `INSERT INTO tasks
           (id, board_id, column_id, number, title, description, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, '', ?, ?, ?)`
      ).run(
        tid,
        boardId,
        colId,
        t.number,
        t.title ?? `task-${tid}`,
        taskIdx,
        t.created_at,
        t.created_at
      );
    }
  }

  return db;
}

describe("migration 009 — fresh empty DB", () => {
  it("seeds exactly one default space and no tasks/boards", () => {
    const db = createPre009Db({ boards: [] });
    runMigrations(db);

    const spaces = db.prepare("SELECT * FROM spaces").all() as Array<{
      name: string;
      prefix: string;
      is_default: number;
    }>;
    expect(spaces).toHaveLength(1);
    expect(spaces[0]).toMatchObject({
      name: "Default",
      prefix: "task",
      is_default: 1,
    });

    const boards = db.prepare("SELECT * FROM boards").all();
    const tasks = db.prepare("SELECT * FROM tasks").all();
    expect(boards).toEqual([]);
    expect(tasks).toEqual([]);
  });
});

describe("migration 009 — DB with boards but no tasks", () => {
  it("links every existing board to the default space and leaves counters untouched", () => {
    const db = createPre009Db({
      boards: [
        { name: "Adhoc 1", created_at: 1 },
        { name: "Adhoc 2", created_at: 2 },
        { name: "Adhoc 3", created_at: 3 },
      ],
    });
    runMigrations(db);

    const defaultSpace = db
      .prepare("SELECT id FROM spaces WHERE is_default = 1")
      .get() as { id: string };

    const linked = db
      .prepare("SELECT space_id FROM boards")
      .all() as Array<{ space_id: string }>;
    expect(linked).toHaveLength(3);
    expect(new Set(linked.map((r) => r.space_id))).toEqual(
      new Set([defaultSpace.id])
    );

    const counter = db
      .prepare("SELECT next_number FROM space_counters WHERE space_id = ?")
      .get(defaultSpace.id) as { next_number: number };
    expect(counter.next_number).toBe(1);
  });
});

describe("migration 009 — DB with Promptery boards", () => {
  it("creates a Promptery space when boards starting with 'Promptery' exist", () => {
    const db = createPre009Db({
      boards: [
        { name: "Promptery", created_at: 1 },
        { name: "Promptery — Analytics", created_at: 2 },
        { name: "Adhoc", created_at: 3 },
      ],
    });
    runMigrations(db);

    const promptry = db
      .prepare("SELECT id, name FROM spaces WHERE prefix = 'pmt'")
      .get() as { id: string; name: string };
    expect(promptry).toBeTruthy();
    expect(promptry.name).toBe("Promptery");

    const defaultSpace = db
      .prepare("SELECT id FROM spaces WHERE is_default = 1")
      .get() as { id: string };

    const promptryBoards = db
      .prepare("SELECT name FROM boards WHERE space_id = ?")
      .all(promptry.id) as Array<{ name: string }>;
    expect(promptryBoards.map((b) => b.name).sort()).toEqual([
      "Promptery",
      "Promptery — Analytics",
    ]);

    const adhocBoards = db
      .prepare("SELECT name FROM boards WHERE space_id = ?")
      .all(defaultSpace.id) as Array<{ name: string }>;
    expect(adhocBoards.map((b) => b.name)).toEqual(["Adhoc"]);
  });

  it("backfills slugs in created_at order per space, with global uniqueness", () => {
    // Build the maintainer's exact backfill scenario in miniature: 4 boards
    // starting with "Promptery", 6 tasks across them in interleaved
    // created_at order. Verify slugs come out as pmt-1..pmt-6 in time order.
    const db = createPre009Db({
      boards: [
        {
          id: "b-active",
          name: "Promptery",
          created_at: 100,
          tasks: [
            { id: "task-a", number: 1, created_at: 10 },
            { id: "task-c", number: 2, created_at: 30 },
          ],
        },
        {
          id: "b-analytics",
          name: "Promptery — Analytics",
          created_at: 200,
          tasks: [
            { id: "task-b", number: 1, created_at: 20 },
            { id: "task-d", number: 2, created_at: 40 },
          ],
        },
        {
          id: "b-next",
          name: "Promptery — Next Release",
          created_at: 300,
          tasks: [{ id: "task-e", number: 1, created_at: 50 }],
        },
        {
          id: "b-done",
          name: "Promptery — Done",
          created_at: 400,
          tasks: [{ id: "task-f", number: 1, created_at: 60 }],
        },
      ],
    });
    runMigrations(db);

    const slugs = db
      .prepare("SELECT id, slug FROM tasks ORDER BY created_at")
      .all() as Array<{ id: string; slug: string }>;
    expect(slugs).toEqual([
      { id: "task-a", slug: "pmt-1" },
      { id: "task-b", slug: "pmt-2" },
      { id: "task-c", slug: "pmt-3" },
      { id: "task-d", slug: "pmt-4" },
      { id: "task-e", slug: "pmt-5" },
      { id: "task-f", slug: "pmt-6" },
    ]);

    // Counter is at last_used + 1.
    const promptry = db
      .prepare("SELECT id FROM spaces WHERE prefix = 'pmt'")
      .get() as { id: string };
    const counter = db
      .prepare("SELECT next_number FROM space_counters WHERE space_id = ?")
      .get(promptry.id) as { next_number: number };
    expect(counter.next_number).toBe(7);

    // Global slug uniqueness invariant.
    const dups = db
      .prepare(
        "SELECT slug, COUNT(*) AS c FROM tasks GROUP BY slug HAVING c > 1"
      )
      .all();
    expect(dups).toEqual([]);
  });
});

describe("migration 009 — schema invariants after backfill", () => {
  it("removes the tasks.number column and adds tasks.slug", () => {
    const db = createPre009Db({
      boards: [{ name: "Adhoc", created_at: 1, tasks: [] }],
    });
    runMigrations(db);

    const cols = db.prepare("PRAGMA table_info(tasks)").all() as Array<{
      name: string;
    }>;
    const colNames = cols.map((c) => c.name);
    expect(colNames).toContain("slug");
    expect(colNames).not.toContain("number");
  });

  it("populates boards.space_id for every existing board", () => {
    const db = createPre009Db({
      boards: [
        { name: "Promptery", created_at: 1 },
        { name: "Side Project", created_at: 2 },
      ],
    });
    runMigrations(db);

    const nullSpace = db
      .prepare("SELECT COUNT(*) AS c FROM boards WHERE space_id IS NULL")
      .get() as { c: number };
    expect(nullSpace.c).toBe(0);
  });
});

describe("migration 009 — idempotency", () => {
  it("re-running the migration is a no-op (slugs unchanged, counter unchanged)", () => {
    const db = createPre009Db({
      boards: [
        {
          name: "Promptery",
          created_at: 1,
          tasks: [
            { id: "t-a", number: 1, created_at: 10 },
            { id: "t-b", number: 2, created_at: 20 },
          ],
        },
      ],
    });
    runMigrations(db);

    const beforeSlugs = db
      .prepare("SELECT id, slug FROM tasks ORDER BY id")
      .all();
    const beforeCounter = db
      .prepare("SELECT space_id, next_number FROM space_counters")
      .all();

    // Force the migration runner to consider 009 again.
    db.prepare("DELETE FROM _migrations WHERE name = '009_spaces'").run();
    expect(() => runMigrations(db)).not.toThrow();

    const afterSlugs = db
      .prepare("SELECT id, slug FROM tasks ORDER BY id")
      .all();
    const afterCounter = db
      .prepare("SELECT space_id, next_number FROM space_counters")
      .all();
    expect(afterSlugs).toEqual(beforeSlugs);
    expect(afterCounter).toEqual(beforeCounter);
  });
});

describe("migration 009 — duplicate created_at edge case", () => {
  it("uses (created_at, id) for stable ordering when timestamps tie", () => {
    const db = createPre009Db({
      boards: [
        {
          name: "Tie",
          created_at: 1,
          tasks: [
            { id: "ccc", number: 1, created_at: 100 },
            { id: "aaa", number: 2, created_at: 100 },
            { id: "bbb", number: 3, created_at: 100 },
          ],
        },
      ],
    });
    runMigrations(db);

    // With identical timestamps the id tiebreaker decides the slug order.
    expect(
      (db.prepare("SELECT slug FROM tasks WHERE id = 'aaa'").get() as {
        slug: string;
      }).slug
    ).toBe("task-1");
    expect(
      (db.prepare("SELECT slug FROM tasks WHERE id = 'bbb'").get() as {
        slug: string;
      }).slug
    ).toBe("task-2");
    expect(
      (db.prepare("SELECT slug FROM tasks WHERE id = 'ccc'").get() as {
        slug: string;
      }).slug
    ).toBe("task-3");
  });
});
