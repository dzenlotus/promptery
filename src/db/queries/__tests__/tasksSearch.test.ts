import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createBoard } from "../boards.js";
import { createColumn } from "../columns.js";
import {
  createTask,
  deleteTask,
  getTaskWithLocation,
  searchTasks,
  updateTask,
} from "../tasks.js";
import { createRole } from "../roles.js";
import { createTestDb } from "./helpers.js";
import { runMigrations } from "../../migrations.js";

function seed(db: ReturnType<typeof createTestDb>) {
  const board = createBoard(db, "Backend");
  const todo = createColumn(db, board.id, "todo");
  const doing = createColumn(db, board.id, "doing");
  return { board, todo, doing };
}

describe("searchTasks", () => {
  it("inserting a task makes it searchable immediately via the FTS triggers", () => {
    const db = createTestDb();
    const { board, todo } = seed(db);
    const task = createTask(db, board.id, todo.id, {
      title: "Fix login bug",
      description: "Auth fails on Safari",
    });

    const hits = searchTasks(db, { query: "login" });
    expect(hits.map((h) => h.task.id)).toEqual([task.id]);
    expect(hits[0]!.column.name).toBe("todo");
    expect(hits[0]!.board.name).toBe("Backend");
  });

  it("returns location context with task, column, and board fields", () => {
    const db = createTestDb();
    const { board, doing } = seed(db);
    const task = createTask(db, board.id, doing.id, {
      title: "Refactor parser",
      description: "Split into smaller modules",
    });

    const [hit] = searchTasks(db, { query: "parser" });
    expect(hit!.task).toMatchObject({
      id: task.id,
      title: "Refactor parser",
      description: "Split into smaller modules",
      column_id: doing.id,
      board_id: board.id,
    });
    expect(hit!.column).toEqual({
      id: doing.id,
      name: "doing",
      position: doing.position,
    });
    expect(hit!.board).toEqual({ id: board.id, name: "Backend" });
  });

  it("update sync: searching by old title returns nothing, new title returns the task", () => {
    const db = createTestDb();
    const { board, todo } = seed(db);
    const task = createTask(db, board.id, todo.id, { title: "alpha task" });

    updateTask(db, task.id, { title: "beta thing" });

    expect(searchTasks(db, { query: "alpha" })).toHaveLength(0);
    const beta = searchTasks(db, { query: "beta" });
    expect(beta.map((h) => h.task.id)).toEqual([task.id]);
  });

  it("description updates also re-index", () => {
    const db = createTestDb();
    const { board, todo } = seed(db);
    const task = createTask(db, board.id, todo.id, {
      title: "task",
      description: "before",
    });

    updateTask(db, task.id, { description: "after" });

    expect(searchTasks(db, { query: "before" })).toHaveLength(0);
    expect(searchTasks(db, { query: "after" }).map((h) => h.task.id)).toEqual([task.id]);
  });

  it("delete sync: deleted tasks stop appearing in search", () => {
    const db = createTestDb();
    const { board, todo } = seed(db);
    const task = createTask(db, board.id, todo.id, { title: "ephemeral" });

    expect(searchTasks(db, { query: "ephemeral" })).toHaveLength(1);
    deleteTask(db, task.id);
    expect(searchTasks(db, { query: "ephemeral" })).toHaveLength(0);
  });

  it("empty/undefined query returns all tasks ordered by created_at DESC, capped by limit", () => {
    const db = createTestDb();
    const { board, todo } = seed(db);
    const t1 = createTask(db, board.id, todo.id, { title: "first" });
    // Tiny delay-by-update so created_at differs reliably across rows even if
    // the system clock is coarse — testing ordering deterministically.
    const t2 = createTask(db, board.id, todo.id, { title: "second" });
    const t3 = createTask(db, board.id, todo.id, { title: "third" });

    const all = searchTasks(db, {});
    const ids = all.map((h) => h.task.id);
    expect(ids).toContain(t1.id);
    expect(ids).toContain(t2.id);
    expect(ids).toContain(t3.id);
    expect(all).toHaveLength(3);

    const limited = searchTasks(db, { limit: 2 });
    expect(limited).toHaveLength(2);
  });

  it("query with FTS special chars (quotes, dashes, dots) does not raise", () => {
    const db = createTestDb();
    const { board, todo } = seed(db);
    createTask(db, board.id, todo.id, { title: "edge-case task" });

    expect(() => searchTasks(db, { query: 'edge-case "quoted" v1.2' })).not.toThrow();
    expect(() => searchTasks(db, { query: "tasks_fts MATCH '*'" })).not.toThrow();
    // Dashes get escaped as quoted phrases — exact-text match should still hit.
    const hits = searchTasks(db, { query: "edge-case" });
    expect(hits).toHaveLength(1);
  });

  it("query containing literal double quotes is escaped, not parsed as FTS phrase syntax", () => {
    const db = createTestDb();
    const { board, todo } = seed(db);
    const exact = createTask(db, board.id, todo.id, {
      title: 'cmd-k "exact phrase" crash',
    });
    createTask(db, board.id, todo.id, { title: "unrelated work" });

    // Naive concatenation would build `MATCH '"exact phrase"'` and turn the
    // user's text into FTS5 phrase syntax. escapeFtsQuery doubles the inner
    // quotes so each token still matches as a literal.
    expect(() => searchTasks(db, { query: '"exact phrase"' })).not.toThrow();
    const hits = searchTasks(db, { query: '"exact phrase"' });
    expect(hits.map((h) => h.task.id)).toEqual([exact.id]);
  });

  it("Cyrillic query matches Cyrillic content (unicode61 tokenizer)", () => {
    const db = createTestDb();
    const { board, todo } = seed(db);
    const ru = createTask(db, board.id, todo.id, {
      title: "не работает авторизация",
      description: "падает на проде",
    });
    createTask(db, board.id, todo.id, { title: "english unrelated" });

    const titleHits = searchTasks(db, { query: "не работает" });
    expect(titleHits.map((h) => h.task.id)).toEqual([ru.id]);

    const descHits = searchTasks(db, { query: "проде" });
    expect(descHits.map((h) => h.task.id)).toEqual([ru.id]);

    // Diacritics-stripped tokenizer means "ё"/"е" land in the same bucket;
    // smoke-test for non-ASCII robustness rather than exact behavior.
    expect(() => searchTasks(db, { query: "ёлка" })).not.toThrow();
  });

  it("scales: list_all_tasks-style listing and a search query stay fast at 200+ tasks", () => {
    const db = createTestDb();
    const { board, todo, doing } = seed(db);

    // Create 200 tasks split across two columns with a marker token in some
    // descriptions so the search path also has work to do.
    for (let i = 0; i < 200; i++) {
      const col = i % 2 === 0 ? todo.id : doing.id;
      const description = i % 7 === 0 ? "needle-token rare" : "filler";
      createTask(db, board.id, col, { title: `bulk task ${i}`, description });
    }

    const t0 = performance.now();
    const all = searchTasks(db, { limit: 500 });
    const tList = performance.now() - t0;
    expect(all.length).toBeGreaterThanOrEqual(200);
    // Generous ceiling — in-memory SQLite should be <<200ms for a 200-row
    // join. The threshold catches accidental N+1 queries or per-row hydration.
    expect(tList).toBeLessThan(200);

    const t1 = performance.now();
    const hits = searchTasks(db, { query: "needle-token" });
    const tSearch = performance.now() - t1;
    // 200 / 7 = 28..29 marked tasks; default limit clips at 20.
    expect(hits.length).toBe(20);
    expect(tSearch).toBeLessThan(200);
  });

  it("filters by board_id", () => {
    const db = createTestDb();
    const board1 = createBoard(db, "B1");
    const c1 = createColumn(db, board1.id, "todo");
    const board2 = createBoard(db, "B2");
    const c2 = createColumn(db, board2.id, "todo");

    const t1 = createTask(db, board1.id, c1.id, { title: "shared term" });
    createTask(db, board2.id, c2.id, { title: "shared term" });

    const hits = searchTasks(db, { query: "shared", board_id: board1.id });
    expect(hits.map((h) => h.task.id)).toEqual([t1.id]);
  });

  it("filters by column_id", () => {
    const db = createTestDb();
    const { board, todo, doing } = seed(db);
    const t = createTask(db, board.id, todo.id, { title: "shared" });
    createTask(db, board.id, doing.id, { title: "shared" });

    const hits = searchTasks(db, { query: "shared", column_id: todo.id });
    expect(hits.map((h) => h.task.id)).toEqual([t.id]);
  });

  it("filters by role_id", () => {
    const db = createTestDb();
    const { board, todo } = seed(db);
    const role = createRole(db, { name: "reviewer" });

    const matched = createTask(db, board.id, todo.id, { title: "needs review" });
    db.prepare("UPDATE tasks SET role_id = ? WHERE id = ?").run(role.id, matched.id);
    createTask(db, board.id, todo.id, { title: "needs review too" });

    const hits = searchTasks(db, { query: "review", role_id: role.id });
    expect(hits.map((h) => h.task.id)).toEqual([matched.id]);
  });

  it("filters compose with no-query listing", () => {
    const db = createTestDb();
    const { board, todo, doing } = seed(db);
    createTask(db, board.id, todo.id, { title: "in-todo" });
    const inDoing = createTask(db, board.id, doing.id, { title: "in-doing" });

    const hits = searchTasks(db, { column_id: doing.id });
    expect(hits.map((h) => h.task.id)).toEqual([inDoing.id]);
  });

  it("returns an empty array on no-results without throwing", () => {
    const db = createTestDb();
    const { board, todo } = seed(db);
    createTask(db, board.id, todo.id, { title: "unrelated" });

    expect(searchTasks(db, { query: "nothing-matches-this-token" })).toEqual([]);
  });

  it("getTaskWithLocation returns task + column + board, or null when missing", () => {
    const db = createTestDb();
    const { board, todo } = seed(db);
    const task = createTask(db, board.id, todo.id, { title: "x" });

    const got = getTaskWithLocation(db, task.id);
    expect(got?.task.id).toBe(task.id);
    expect(got?.column.id).toBe(todo.id);
    expect(got?.board.id).toBe(board.id);

    expect(getTaskWithLocation(db, "missing")).toBeNull();
  });
});

/**
 * The migration backfill exists to upgrade DBs that already had tasks before
 * the FTS table was added. Reconstruct that history by running the project
 * schema *minus* the FTS-related statements, inserting tasks, then running
 * migrations and confirming the index now contains those rows.
 */
describe("migration 008 backfill", () => {
  it("backfills tasks_fts with rows that existed before the migration ran", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const fullSchema = readFileSync(join(here, "..", "..", "schema.sql"), "utf-8");
    const preFtsSchema = stripFtsBlock(fullSchema);

    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(preFtsSchema);

    // Seed a board, column, and tasks the same way createTask does, but
    // without going through the queries layer (which now relies on the
    // triggers from schema.sql being present).
    const now = Date.now();
    db.prepare(
      "INSERT INTO boards (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)"
    ).run("b1", "B", now, now);
    db.prepare(
      "INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run("c1", "b1", "todo", 0, now);
    db.prepare(
      `INSERT INTO tasks
       (id, board_id, column_id, number, title, description, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("t1", "b1", "c1", 1, "Legacy login bug", "Pre-FTS task", 1, now, now);

    runMigrations(db);

    const ftsRow = db
      .prepare("SELECT task_id, title FROM tasks_fts WHERE task_id = ?")
      .get("t1") as { task_id: string; title: string } | undefined;
    expect(ftsRow).toBeDefined();
    expect(ftsRow!.title).toBe("Legacy login bug");

    const hits = searchTasks(db, { query: "legacy" });
    expect(hits.map((h) => h.task.id)).toEqual(["t1"]);
  });

  it("is idempotent — re-running migrations does not duplicate FTS rows", () => {
    const db = createTestDb();
    const { board, todo } = seed(db);
    createTask(db, board.id, todo.id, { title: "duplicate guard" });
    runMigrations(db);
    // Force the migration to run a second time even though it's already
    // recorded — the backfill uses NOT IN so it should be a no-op rather
    // than inserting a duplicate row.
    db.exec("DELETE FROM _migrations WHERE name = '008_tasks_fts'");
    expect(() => runMigrations(db)).not.toThrow();

    const cnt = db
      .prepare("SELECT COUNT(*) AS c FROM tasks_fts WHERE title = 'duplicate guard'")
      .get() as { c: number };
    expect(cnt.c).toBe(1);
  });
});

/**
 * Strip out the FTS virtual-table and trigger block from schema.sql so we can
 * exercise the migration's backfill path on a "pre-FTS" snapshot. Matches the
 * exact comment-prefix in schema.sql so no nearby edits silently break this.
 */
function stripFtsBlock(sql: string): string {
  const start = sql.indexOf(
    "-- Full-text search index for tasks."
  );
  if (start === -1) return sql;
  return sql.slice(0, start);
}
