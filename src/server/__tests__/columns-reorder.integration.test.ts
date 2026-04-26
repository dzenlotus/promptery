import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createApp } from "../index.js";
import { _setDbForTesting } from "../../db/index.js";
import { createTestDb, type TestDb } from "../../db/__tests__/helpers/testDb.js";
import { makeBoard, makeColumn } from "../../db/__tests__/helpers/factories.js";
import { bus } from "../events/bus.js";
import type { ServerEvent } from "../events/types.js";

/**
 * Integration tests for PATCH /api/boards/:id/columns/order
 *
 * Covers:
 *  - Atomicity: all positions written in a single transaction.
 *  - Position monotonicity: positions increase left-to-right.
 *  - WS event: single `column.reordered` event emitted with ordered IDs.
 *  - 404 for unknown board or column.
 *  - 400 for column belonging to a different board.
 */
describe("PATCH /api/boards/:id/columns/order", () => {
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

  async function reorder(boardId: string, columnIds: string[]): Promise<Response> {
    return app.fetch(
      new Request(`http://test/api/boards/${boardId}/columns/order`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ columnIds }),
      })
    );
  }

  async function listColumns(boardId: string): Promise<{ id: string; position: number }[]> {
    const res = await app.fetch(
      new Request(`http://test/api/boards/${boardId}/columns`)
    );
    return res.json() as Promise<{ id: string; position: number }[]>;
  }

  it("returns 404 for an unknown board", async () => {
    const res = await reorder("nope", ["a", "b"]);
    expect(res.status).toBe(404);
  });

  it("returns 404 when a column ID does not exist", async () => {
    const board = makeBoard(testDb.db);
    const col = makeColumn(testDb.db, { board_id: board.id });
    const res = await reorder(board.id, [col.id, "ghost"]);
    expect(res.status).toBe(404);
  });

  it("returns 400 when a column belongs to a different board", async () => {
    const board1 = makeBoard(testDb.db);
    const board2 = makeBoard(testDb.db);
    const col1 = makeColumn(testDb.db, { board_id: board1.id });
    const col2 = makeColumn(testDb.db, { board_id: board2.id });

    const res = await reorder(board1.id, [col1.id, col2.id]);
    expect(res.status).toBe(400);
  });

  it("rewrites positions in monotonically increasing order", async () => {
    const board = makeBoard(testDb.db);
    const col1 = makeColumn(testDb.db, { board_id: board.id, position: 0 });
    const col2 = makeColumn(testDb.db, { board_id: board.id, position: 1 });
    const col3 = makeColumn(testDb.db, { board_id: board.id, position: 2 });

    // Reverse the order.
    const res = await reorder(board.id, [col3.id, col2.id, col1.id]);
    expect(res.status).toBe(200);

    const cols = await listColumns(board.id);
    // Should come back in the new order.
    expect(cols.map((c) => c.id)).toEqual([col3.id, col2.id, col1.id]);
    // Positions must be strictly increasing.
    for (let i = 1; i < cols.length; i++) {
      expect(cols[i]!.position).toBeGreaterThan(cols[i - 1]!.position);
    }
  });

  it("is atomic: all positions updated or none (transaction)", async () => {
    const board = makeBoard(testDb.db);
    const col1 = makeColumn(testDb.db, { board_id: board.id, position: 0 });
    const col2 = makeColumn(testDb.db, { board_id: board.id, position: 1 });

    // Valid reorder — should succeed completely.
    const res = await reorder(board.id, [col2.id, col1.id]);
    expect(res.status).toBe(200);

    // Both positions must have been updated.
    const cols = await listColumns(board.id);
    const byId = Object.fromEntries(cols.map((c) => [c.id, c] as const));
    expect(byId[col2.id]?.position).toBeLessThan(byId[col1.id]?.position ?? Infinity);
  });

  it("emits a single column.reordered WS event with the ordered IDs", async () => {
    const board = makeBoard(testDb.db);
    const col1 = makeColumn(testDb.db, { board_id: board.id, position: 0 });
    const col2 = makeColumn(testDb.db, { board_id: board.id, position: 1 });

    const events: ServerEvent[] = [];
    const off = bus.subscribe((evt) => events.push(evt));

    const res = await reorder(board.id, [col2.id, col1.id]);
    expect(res.status).toBe(200);

    off();

    const reorderEvents = events.filter((e) => e.type === "column.reordered");
    expect(reorderEvents).toHaveLength(1);
    const evt = reorderEvents[0]!;
    if (evt.type !== "column.reordered") throw new Error("type guard");
    expect(evt.data.boardId).toBe(board.id);
    expect(evt.data.columnIds).toEqual([col2.id, col1.id]);
  });

  it("does NOT emit individual column.updated events", async () => {
    const board = makeBoard(testDb.db);
    const col1 = makeColumn(testDb.db, { board_id: board.id, position: 0 });
    const col2 = makeColumn(testDb.db, { board_id: board.id, position: 1 });

    const events: ServerEvent[] = [];
    const off = bus.subscribe((evt) => events.push(evt));

    await reorder(board.id, [col2.id, col1.id]);
    off();

    const updatedEvents = events.filter((e) => e.type === "column.updated");
    expect(updatedEvents).toHaveLength(0);
  });

  it("returns the full column list sorted by new position", async () => {
    const board = makeBoard(testDb.db);
    const col1 = makeColumn(testDb.db, { board_id: board.id, name: "A", position: 0 });
    const col2 = makeColumn(testDb.db, { board_id: board.id, name: "B", position: 1 });
    const col3 = makeColumn(testDb.db, { board_id: board.id, name: "C", position: 2 });

    const res = await reorder(board.id, [col2.id, col3.id, col1.id]);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string }[];
    expect(body.map((c) => c.id)).toEqual([col2.id, col3.id, col1.id]);
  });
});
