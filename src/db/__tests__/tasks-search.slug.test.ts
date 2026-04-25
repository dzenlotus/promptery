import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/testDb.js";
import { makeBoard, makeColumn, makeTask } from "./helpers/factories.js";
import { searchTasks } from "../queries/tasks.js";

/**
 * `searchTasks("pmt-46")` should return the task carrying that slug as
 * the top result with `match_type: 'exact'`, regardless of where FTS
 * would otherwise rank it. The FTS pass still runs so substring hits in
 * other tasks' descriptions still surface — they just trail the exact
 * match.
 *
 * These tests live in their own file so the slug-search behaviour can be
 * extended without bloating the much larger FTS-only suite.
 */
describe("searchTasks() — slug exact match", () => {
  it("returns the slug-carrying task as the top result with match_type='exact'", () => {
    const { db, close } = createTestDb();
    const board = makeBoard(db, { name: "B" });
    const col = makeColumn(db, { board_id: board.id });
    const target = makeTask(db, {
      column_id: col.id,
      slug: "pmt-46",
      title: "actual target",
    });
    // A decoy task whose title literally contains the slug — FTS would
    // surface it, but the exact-match path should still rank `pmt-46`
    // above it.
    makeTask(db, {
      column_id: col.id,
      slug: "pmt-100",
      title: "mentions pmt-46 in title",
    });

    const results = searchTasks(db, { query: "pmt-46", limit: 50 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.match_type).toBe("exact");
    expect(results[0]!.task.id).toBe(target.id);
    expect(results[0]!.task.slug).toBe("pmt-46");

    close();
  });

  it("dedupes — the exact match wins, no duplicate FTS row for the same task", () => {
    const { db, close } = createTestDb();
    const board = makeBoard(db, { name: "B" });
    const col = makeColumn(db, { board_id: board.id });
    // The target's title contains its own slug, so FTS would also match
    // it — without dedupe we'd see two rows for the same task.
    const target = makeTask(db, {
      column_id: col.id,
      slug: "pmt-7",
      title: "fixing pmt-7 layout",
    });

    const results = searchTasks(db, { query: "pmt-7" });
    const matchingTarget = results.filter((r) => r.task.id === target.id);
    expect(matchingTarget).toHaveLength(1);
    expect(matchingTarget[0]!.match_type).toBe("exact");

    close();
  });

  it("non-slug queries get match_type='fts' on every result", () => {
    const { db, close } = createTestDb();
    const board = makeBoard(db, { name: "B" });
    const col = makeColumn(db, { board_id: board.id });
    makeTask(db, {
      column_id: col.id,
      slug: "task-1",
      title: "needle in title",
    });

    const results = searchTasks(db, { query: "needle" });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.match_type).toBe("fts");
    }

    close();
  });

  it("empty-query listings carry no match_type", () => {
    const { db, close } = createTestDb();
    const board = makeBoard(db, { name: "B" });
    const col = makeColumn(db, { board_id: board.id });
    makeTask(db, { column_id: col.id, slug: "task-1", title: "t" });

    const results = searchTasks(db, {});
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.match_type).toBeUndefined();
    }

    close();
  });

  it("a slug-shaped query that doesn't match any task falls through to FTS", () => {
    const { db, close } = createTestDb();
    const board = makeBoard(db, { name: "B" });
    const col = makeColumn(db, { board_id: board.id });
    // Task carries the literal `pmt-99` in its description — FTS should
    // surface it even though no task's slug equals `pmt-99`.
    makeTask(db, {
      column_id: col.id,
      slug: "task-1",
      title: "see ticket pmt-99 for context",
    });

    const results = searchTasks(db, { query: "pmt-99" });
    expect(results.length).toBeGreaterThan(0);
    // No exact-match wrapper, only fts hits.
    for (const r of results) {
      expect(r.match_type).toBe("fts");
    }

    close();
  });

  it("respects board_id filter — exact match outside the scoped board is suppressed", () => {
    const { db, close } = createTestDb();
    const boardA = makeBoard(db, { name: "A" });
    const colA = makeColumn(db, { board_id: boardA.id });
    const boardB = makeBoard(db, { name: "B" });
    const colB = makeColumn(db, { board_id: boardB.id });

    // The exact-slug task lives on boardA, but the search is scoped to boardB.
    makeTask(db, { column_id: colA.id, slug: "pmt-5", title: "on A" });
    makeTask(db, { column_id: colB.id, slug: "task-1", title: "pmt-5 referenced" });

    const results = searchTasks(db, {
      query: "pmt-5",
      board_id: boardB.id,
    });
    // Exact match is filtered out by scope; only FTS hits on boardB remain.
    for (const r of results) {
      expect(r.match_type).toBe("fts");
      expect(r.board.id).toBe(boardB.id);
    }

    close();
  });

  it("limit is applied to the combined exact + fts output", () => {
    const { db, close } = createTestDb();
    const board = makeBoard(db, { name: "B" });
    const col = makeColumn(db, { board_id: board.id });
    makeTask(db, {
      column_id: col.id,
      slug: "pmt-1",
      title: "pmt-1 first",
    });
    // Several FTS-matchable decoys.
    for (let i = 2; i <= 5; i += 1) {
      makeTask(db, {
        column_id: col.id,
        slug: `pmt-${i}`,
        title: `pmt-1 mentioned (${i})`,
      });
    }

    const results = searchTasks(db, { query: "pmt-1", limit: 2 });
    expect(results).toHaveLength(2);
    expect(results[0]!.match_type).toBe("exact");
    expect(results[0]!.task.slug).toBe("pmt-1");

    close();
  });
});
