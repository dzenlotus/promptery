import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, type TestDb } from "./helpers/testDb.js";
import {
  makeBoard,
  makeColumn,
  makeTask,
  seedWorkspace,
} from "./helpers/factories.js";
import { searchTasks, getTaskWithLocation } from "../queries/tasks.js";

describe("searchTasks() — repository unit tests", () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  describe("FTS5 sync triggers", () => {
    it("inserts new task into tasks_fts on INSERT", () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      makeTask(testDb.db, { column_id: col.id, title: "Searchable title" });

      const ftsRows = testDb.db.prepare("SELECT * FROM tasks_fts").all();
      expect(ftsRows).toHaveLength(1);
    });

    it("updates tasks_fts on title UPDATE", () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, {
        column_id: col.id,
        title: "Original title",
      });

      // Sanity: the renamed term is not findable before the update
      expect(searchTasks(testDb.db, { query: "newtitle" })).toHaveLength(0);

      testDb.db
        .prepare("UPDATE tasks SET title = ? WHERE id = ?")
        .run("newtitle here", task.id);

      const after = searchTasks(testDb.db, { query: "newtitle" });
      expect(after).toHaveLength(1);
      expect(after[0]!.task.id).toBe(task.id);
    });

    it("updates tasks_fts on description UPDATE", () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, {
        column_id: col.id,
        title: "task",
        description: "old desc",
      });

      testDb.db
        .prepare("UPDATE tasks SET description = ? WHERE id = ?")
        .run("totally different content", task.id);

      const results = searchTasks(testDb.db, { query: "totally" });
      expect(results.map((r) => r.task.id)).toContain(task.id);
    });

    it("removes from tasks_fts on DELETE", () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, {
        column_id: col.id,
        title: "soonbedeleted",
      });

      expect(searchTasks(testDb.db, { query: "soonbedeleted" })).toHaveLength(1);

      testDb.db.prepare("DELETE FROM tasks WHERE id = ?").run(task.id);

      expect(searchTasks(testDb.db, { query: "soonbedeleted" })).toHaveLength(0);
    });

    it("handles batch INSERT correctly (no missed triggers)", () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });

      for (let i = 0; i < 50; i++) {
        makeTask(testDb.db, {
          column_id: col.id,
          number: i + 1,
          title: `task ${i}`,
          description: `description ${i}`,
        });
      }

      const ftsCount = testDb.db
        .prepare("SELECT COUNT(*) AS c FROM tasks_fts")
        .get() as { c: number };
      expect(ftsCount.c).toBe(50);
    });

    it("compound UPDATE (title + position) still fires the title trigger", () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, {
        column_id: col.id,
        title: "before",
        position: 0,
      });

      testDb.db
        .prepare("UPDATE tasks SET title = ?, position = ? WHERE id = ?")
        .run("after", 99, task.id);

      expect(searchTasks(testDb.db, { query: "before" })).toHaveLength(0);
      expect(searchTasks(testDb.db, { query: "after" }).map((h) => h.task.id))
        .toEqual([task.id]);
    });

    it("UPDATE that does not touch title/description does NOT touch the FTS row", () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, {
        column_id: col.id,
        title: "stable",
        description: "stable body",
        position: 0,
      });

      testDb.db
        .prepare("UPDATE tasks SET position = ? WHERE id = ?")
        .run(50, task.id);

      // Still findable, no error from a stale row.
      const hits = searchTasks(testDb.db, { query: "stable" });
      expect(hits.map((h) => h.task.id)).toEqual([task.id]);
    });
  });

  describe("search by query", () => {
    it("returns empty array for query with no matches", () => {
      seedWorkspace(testDb.db);
      const results = searchTasks(testDb.db, {
        query: "thiswordwillnotexistanywhere",
      });
      expect(results).toEqual([]);
    });

    it("returns tasks matching title", () => {
      seedWorkspace(testDb.db);
      const results = searchTasks(testDb.db, { query: "cmdk" });
      expect(results).toHaveLength(1);
      expect(results[0]!.task.title).toContain("cmdk");
    });

    it("returns tasks matching description", () => {
      seedWorkspace(testDb.db);
      const results = searchTasks(testDb.db, { query: "CommandItem" });
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("returns tasks matching either title or description", () => {
      seedWorkspace(testDb.db);
      // task #3 has both "Refactor resolver" in title and "Resolver in src/db..." in description.
      const results = searchTasks(testDb.db, { query: "resolver" });
      expect(results).toHaveLength(1);
    });

    it("is case-insensitive", () => {
      seedWorkspace(testDb.db);
      expect(searchTasks(testDb.db, { query: "cmdk" })).toHaveLength(1);
      expect(searchTasks(testDb.db, { query: "CMDK" })).toHaveLength(1);
      expect(searchTasks(testDb.db, { query: "CmDk" })).toHaveLength(1);
    });

    it("handles multi-word queries (AND semantics)", () => {
      seedWorkspace(testDb.db);
      const results = searchTasks(testDb.db, { query: "token counter" });
      expect(results).toHaveLength(1);
      expect(results[0]!.task.title).toBe("Add token counter to bundles");
    });

    it("returns empty for query that mixes a hit token with a miss token", () => {
      seedWorkspace(testDb.db);
      const results = searchTasks(testDb.db, { query: "cmdk marshmallow" });
      expect(results).toEqual([]);
    });
  });

  describe("special characters and Unicode", () => {
    it("handles hyphens without crashing", () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      makeTask(testDb.db, {
        column_id: col.id,
        title: "cmd-k crash on first key",
        description: "fix the cmd-k bug",
      });

      expect(() => searchTasks(testDb.db, { query: "cmd-k" })).not.toThrow();
    });

    it("handles double quotes", () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      makeTask(testDb.db, {
        column_id: col.id,
        title: 'an "exact phrase" task',
      });

      expect(() => searchTasks(testDb.db, { query: '"exact phrase"' })).not.toThrow();
      expect(() => searchTasks(testDb.db, { query: 'exact "" phrase' })).not.toThrow();
    });

    it("handles single quotes / apostrophes", () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      makeTask(testDb.db, {
        column_id: col.id,
        title: "don't break",
        description: "user's request",
      });

      expect(() => searchTasks(testDb.db, { query: "don't" })).not.toThrow();
    });

    it("handles Cyrillic / non-ASCII text", () => {
      seedWorkspace(testDb.db);
      const results = searchTasks(testDb.db, { query: "кириллицу" });
      expect(results).toHaveLength(1);
    });

    it("handles emoji in content without crashing", () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      makeTask(testDb.db, {
        column_id: col.id,
        title: "Task 🚀 with emoji",
        description: "✨ shiny ✨",
      });

      expect(() => searchTasks(testDb.db, { query: "emoji" })).not.toThrow();
      expect(searchTasks(testDb.db, { query: "emoji" })).toHaveLength(1);
    });

    it("handles SQL injection attempts safely (no errors, no data loss)", () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      makeTask(testDb.db, { column_id: col.id, title: "normal task" });

      expect(() =>
        searchTasks(testDb.db, { query: "'; DROP TABLE tasks; --" })
      ).not.toThrow();
      expect(() => searchTasks(testDb.db, { query: "1 OR 1=1" })).not.toThrow();
      expect(() =>
        searchTasks(testDb.db, { query: "UNION SELECT * FROM boards" })
      ).not.toThrow();

      const count = testDb.db.prepare("SELECT COUNT(*) AS c FROM tasks").get() as {
        c: number;
      };
      expect(count.c).toBe(1);
    });

    it('handles empty string query as "list all"', () => {
      seedWorkspace(testDb.db);
      const results = searchTasks(testDb.db, { query: "" });
      expect(results.length).toBe(6);
    });

    it('handles whitespace-only query as "list all"', () => {
      seedWorkspace(testDb.db);
      const results = searchTasks(testDb.db, { query: "   \t\n  " });
      expect(results.length).toBe(6);
    });

    it('handles undefined query as "list all"', () => {
      seedWorkspace(testDb.db);
      const results = searchTasks(testDb.db, {});
      expect(results.length).toBe(6);
    });
  });

  describe("filters", () => {
    it("filters by board_id", () => {
      const seeded = seedWorkspace(testDb.db);
      const results = searchTasks(testDb.db, { board_id: seeded.boards[1]!.id });
      expect(results.every((r) => r.board.id === seeded.boards[1]!.id)).toBe(true);
      expect(results.length).toBeLessThan(6);
    });

    it("filters by column_id", () => {
      const seeded = seedWorkspace(testDb.db);
      const results = searchTasks(testDb.db, { column_id: seeded.columns[0]!.id });
      expect(results.every((r) => r.column.id === seeded.columns[0]!.id)).toBe(true);
    });

    it("filters by role_id", () => {
      const seeded = seedWorkspace(testDb.db);
      const results = searchTasks(testDb.db, { role_id: seeded.roles[0]!.id });
      expect(results.every((r) => r.task.role_id === seeded.roles[0]!.id)).toBe(true);
    });

    it("combines query and filters (AND semantics)", () => {
      const seeded = seedWorkspace(testDb.db);
      const results = searchTasks(testDb.db, {
        query: "task",
        board_id: seeded.boards[0]!.id,
      });
      expect(results.every((r) => r.board.id === seeded.boards[0]!.id)).toBe(true);
    });

    it("non-existent board_id returns empty", () => {
      seedWorkspace(testDb.db);
      const results = searchTasks(testDb.db, { board_id: "nonexistent" });
      expect(results).toEqual([]);
    });
  });

  describe("limits", () => {
    it("respects default limit (20)", () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      for (let i = 0; i < 30; i++) {
        makeTask(testDb.db, { column_id: col.id, number: i + 1, title: `task ${i}` });
      }
      const results = searchTasks(testDb.db, {});
      expect(results.length).toBe(20);
    });

    it("respects custom limit", () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      for (let i = 0; i < 30; i++) {
        makeTask(testDb.db, { column_id: col.id, number: i + 1, title: `task ${i}` });
      }
      const results = searchTasks(testDb.db, { limit: 5 });
      expect(results.length).toBe(5);
    });

    it("caps at 500 max even if requested more", () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      for (let i = 0; i < 600; i++) {
        makeTask(testDb.db, { column_id: col.id, number: i + 1, title: `task ${i}` });
      }
      const results = searchTasks(testDb.db, { limit: 9999 });
      expect(results.length).toBeLessThanOrEqual(500);
    });
  });

  describe("result shape", () => {
    it("returns task with full task data", () => {
      seedWorkspace(testDb.db);
      const results = searchTasks(testDb.db, { query: "cmdk" });
      const r = results[0]!;
      expect(r.task.id).toBeDefined();
      expect(r.task.title).toBeDefined();
      expect(r.task.description).toBeDefined();
      expect(r.task.slug).toBeDefined();
      expect(r.task.position).toBeDefined();
      expect(r.task.created_at).toBeDefined();
      expect(r.task.updated_at).toBeDefined();
    });

    it("returns column with id, name, position", () => {
      seedWorkspace(testDb.db);
      const r = searchTasks(testDb.db, { query: "cmdk" })[0]!;
      expect(r.column.id).toBeDefined();
      expect(r.column.name).toBeDefined();
      expect(typeof r.column.position).toBe("number");
    });

    it("returns board with id and name", () => {
      seedWorkspace(testDb.db);
      const r = searchTasks(testDb.db, { query: "cmdk" })[0]!;
      expect(r.board.id).toBeDefined();
      expect(r.board.name).toBeDefined();
    });
  });

  describe("ordering", () => {
    it("orders by FTS rank when query is provided (title hit beats description-only hit)", () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      makeTask(testDb.db, {
        column_id: col.id,
        number: 1,
        title: "unrelated",
        description: "cmdk crash mentioned briefly",
      });
      makeTask(testDb.db, {
        column_id: col.id,
        number: 2,
        title: "cmdk crash on keystroke",
        description: "unrelated body",
      });

      const results = searchTasks(testDb.db, { query: "cmdk" });
      expect(results[0]!.task.title).toContain("cmdk crash on keystroke");
    });

    it("orders by created_at DESC when no query (newest first)", () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });

      // Force created_at directly so the ordering is deterministic — sleep
      // would couple the test to wall-clock granularity.
      const t1 = makeTask(testDb.db, {
        column_id: col.id,
        number: 1,
        title: "first",
        created_at: 1000,
      });
      const t2 = makeTask(testDb.db, {
        column_id: col.id,
        number: 2,
        title: "second",
        created_at: 2000,
      });

      const results = searchTasks(testDb.db, {});
      expect(results[0]!.task.id).toBe(t2.id);
      expect(results[1]!.task.id).toBe(t1.id);
    });
  });

  describe("getTaskWithLocation()", () => {
    it("returns the lite shape for an existing task", () => {
      const seeded = seedWorkspace(testDb.db);
      const target = seeded.tasks[0]!;
      const got = getTaskWithLocation(testDb.db, target.id);
      expect(got?.task.id).toBe(target.id);
      expect(got?.column.id).toBe(target.column_id);
      expect(got?.board.id).toBe(seeded.boards[0]!.id);
    });

    it("returns null for an unknown id", () => {
      seedWorkspace(testDb.db);
      expect(getTaskWithLocation(testDb.db, "nope")).toBeNull();
    });
  });
});
