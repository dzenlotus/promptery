import { describe, it, expect } from "vitest";
import { createTestDb } from "./helpers/testDb.js";
import { makeBoard, makeColumn, makeTask } from "./helpers/factories.js";
import { searchTasks } from "../queries/tasks.js";

/**
 * Catches the case where future code changes accidentally turn the FTS path
 * into an N+1 (per-row hydration, missing index, full scan instead of MATCH).
 * The thresholds are generous against in-memory SQLite — real systems should
 * be well under them. If a test machine is under load, doubling these is
 * acceptable; degrading to seconds is not.
 */
describe("searchTasks() performance budget", () => {
  it("handles 1000 tasks in under 100ms", () => {
    const { db, close } = createTestDb();
    const board = makeBoard(db);
    const col = makeColumn(db, { board_id: board.id });

    for (let i = 0; i < 1000; i++) {
      makeTask(db, {
        column_id: col.id,
        number: i + 1,
        title: `task number ${i} ${i % 7 === 0 ? "special" : "normal"}`,
        description: `description body for task ${i}`,
      });
    }

    const start = performance.now();
    const results = searchTasks(db, { query: "special" });
    const elapsed = performance.now() - start;

    expect(results.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(100);

    close();
  });

  it("no-query listing of 1000 rows stays under 100ms", () => {
    const { db, close } = createTestDb();
    const board = makeBoard(db);
    const col = makeColumn(db, { board_id: board.id });

    for (let i = 0; i < 1000; i++) {
      makeTask(db, {
        column_id: col.id,
        number: i + 1,
        title: `bulk ${i}`,
        description: `body ${i}`,
      });
    }

    const start = performance.now();
    const results = searchTasks(db, { limit: 500 });
    const elapsed = performance.now() - start;

    expect(results).toHaveLength(500);
    expect(elapsed).toBeLessThan(100);

    close();
  });
});
