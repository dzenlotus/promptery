import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createApp } from "../index.js";
import { _setDbForTesting } from "../../db/index.js";
import { createTestDb, type TestDb } from "../../db/__tests__/helpers/testDb.js";
import { makeBoard, makeColumn, makeTask } from "../../db/__tests__/helpers/factories.js";

/**
 * HTTP integration coverage for cross-board `move_task`. Mirrors the unit
 * tests in `src/db/__tests__/tasks-move.unit.test.ts` but exercises the
 * Hono route + zod validator + bus publish path end-to-end.
 */
describe("HTTP API — POST /api/tasks/:id/move (cross-board)", () => {
  let testDb: TestDb;
  let app: ReturnType<typeof createApp>["app"];

  beforeEach(() => {
    testDb = createTestDb();
    _setDbForTesting(testDb.db);
    app = createApp().app;
  });

  afterEach(() => {
    _setDbForTesting(null);
    testDb.close();
  });

  async function move(taskId: string, body: unknown): Promise<Response> {
    return await app.fetch(
      new Request(`http://test/api/tasks/${taskId}/move`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  }

  it("accepts a target column on a different board", async () => {
    const board1 = makeBoard(testDb.db);
    const col1 = makeColumn(testDb.db, { board_id: board1.id });
    const task = makeTask(testDb.db, { column_id: col1.id });
    const board2 = makeBoard(testDb.db);
    const col2 = makeColumn(testDb.db, { board_id: board2.id });

    const res = await move(task.id, { column_id: col2.id });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { column_id: string; board_id: string };
    expect(body.column_id).toBe(col2.id);
    expect(body.board_id).toBe(board2.id);
  });

  it("works without an explicit position (append-to-end)", async () => {
    const board1 = makeBoard(testDb.db);
    const col1 = makeColumn(testDb.db, { board_id: board1.id });
    const task = makeTask(testDb.db, { column_id: col1.id });
    const board2 = makeBoard(testDb.db);
    const col2 = makeColumn(testDb.db, { board_id: board2.id });
    makeTask(testDb.db, { column_id: col2.id, position: 7 });

    const res = await move(task.id, { column_id: col2.id });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { position: number };
    expect(body.position).toBeGreaterThan(7);
  });

  it("returns 404 for a non-existent target column", async () => {
    const board = makeBoard(testDb.db);
    const col = makeColumn(testDb.db, { board_id: board.id });
    const task = makeTask(testDb.db, { column_id: col.id });

    const res = await move(task.id, { column_id: "nope" });
    expect(res.status).toBe(404);
  });

  it("returns 404 for a non-existent task", async () => {
    const board = makeBoard(testDb.db);
    const col = makeColumn(testDb.db, { board_id: board.id });

    const res = await move("nope", { column_id: col.id });
    expect(res.status).toBe(404);
  });

  it("same-board reorder still works (regression)", async () => {
    const board = makeBoard(testDb.db);
    const col1 = makeColumn(testDb.db, { board_id: board.id, position: 0 });
    const col2 = makeColumn(testDb.db, { board_id: board.id, position: 1 });
    const task = makeTask(testDb.db, { column_id: col1.id });

    const res = await move(task.id, { column_id: col2.id, position: 3 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { column_id: string; position: number };
    expect(body.column_id).toBe(col2.id);
    expect(body.position).toBe(3);
  });
});

/**
 * Guards the invariant `tasks.board_id === columns[tasks.column_id].board_id`
 * across the PATCH `/api/tasks/:id` path. `updateTask` at the queries layer
 * does NOT update `board_id` when `column_id` changes — the route is what
 * enforces the same-board restriction. These tests pin that restriction so a
 * future relaxation of the PATCH guard fails loudly instead of silently
 * leaving `tasks.board_id` stale (cross-board moves should go through
 * `move_task`, which atomically updates both).
 */
describe("HTTP API — PATCH /api/tasks/:id preserves board_id invariant", () => {
  let testDb: TestDb;
  let app: ReturnType<typeof createApp>["app"];

  beforeEach(() => {
    testDb = createTestDb();
    _setDbForTesting(testDb.db);
    app = createApp().app;
  });

  afterEach(() => {
    _setDbForTesting(null);
    testDb.close();
  });

  async function patch(taskId: string, body: unknown): Promise<Response> {
    return await app.fetch(
      new Request(`http://test/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  }

  it("same-board column_id change keeps tasks.board_id consistent with the new column", async () => {
    const board = makeBoard(testDb.db);
    const col1 = makeColumn(testDb.db, { board_id: board.id, position: 0 });
    const col2 = makeColumn(testDb.db, { board_id: board.id, position: 1 });
    const task = makeTask(testDb.db, { column_id: col1.id });

    const res = await patch(task.id, { column_id: col2.id });
    expect(res.status).toBe(200);

    const reloaded = testDb.db
      .prepare(
        `SELECT t.column_id AS task_column_id, t.board_id AS task_board_id,
                c.board_id AS column_board_id
           FROM tasks t JOIN columns c ON c.id = t.column_id
          WHERE t.id = ?`
      )
      .get(task.id) as {
      task_column_id: string;
      task_board_id: string;
      column_board_id: string;
    };
    expect(reloaded.task_column_id).toBe(col2.id);
    expect(reloaded.task_board_id).toBe(reloaded.column_board_id);
  });

  it("rejects cross-board column_id with 400 (use move_task for cross-board)", async () => {
    const board1 = makeBoard(testDb.db);
    const col1 = makeColumn(testDb.db, { board_id: board1.id });
    const task = makeTask(testDb.db, { column_id: col1.id });
    const board2 = makeBoard(testDb.db);
    const col2 = makeColumn(testDb.db, { board_id: board2.id });

    const res = await patch(task.id, { column_id: col2.id });
    expect(res.status).toBe(400);

    const reloaded = testDb.db
      .prepare("SELECT column_id, board_id FROM tasks WHERE id = ?")
      .get(task.id) as { column_id: string; board_id: string };
    expect(reloaded.column_id).toBe(col1.id);
    expect(reloaded.board_id).toBe(board1.id);
  });
});
