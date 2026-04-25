import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createApp } from "../index.js";
import { _setDbForTesting } from "../../db/index.js";
import { createTestDb, type TestDb } from "../../db/__tests__/helpers/testDb.js";
import {
  makeBoard,
  makeColumn,
  makeTask,
} from "../../db/__tests__/helpers/factories.js";

/**
 * The `/t/<idOrSlug>` UI route resolves through GET /api/tasks/:idOrSlug/with-location.
 * Lock down both branches: slug input maps via getTaskBySlug, plain id input
 * still works, and a missing task returns a clean 404 either way.
 */
describe("HTTP API — GET /api/tasks/:idOrSlug/with-location", () => {
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

  async function get(path: string): Promise<Response> {
    return await app.fetch(new Request(`http://test${path}`));
  }

  it("resolves by internal id", async () => {
    const board = makeBoard(testDb.db);
    const col = makeColumn(testDb.db, { board_id: board.id });
    const task = makeTask(testDb.db, {
      column_id: col.id,
      slug: "task-1",
      title: "first",
    });

    const res = await get(`/api/tasks/${task.id}/with-location`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      task: { id: string; slug: string };
      board: { id: string };
    };
    expect(body.task.id).toBe(task.id);
    expect(body.task.slug).toBe("task-1");
    expect(body.board.id).toBe(board.id);
  });

  it("resolves by slug", async () => {
    const board = makeBoard(testDb.db);
    const col = makeColumn(testDb.db, { board_id: board.id });
    const task = makeTask(testDb.db, {
      column_id: col.id,
      slug: "pmt-7",
      title: "by slug",
    });

    const res = await get("/api/tasks/pmt-7/with-location");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { task: { id: string } };
    expect(body.task.id).toBe(task.id);
  });

  it("returns 404 for an unknown slug", async () => {
    const res = await get("/api/tasks/none-1/with-location");
    expect(res.status).toBe(404);
  });

  it("returns 404 for an unknown id (non-slug shape)", async () => {
    const res = await get("/api/tasks/no-such-task-id/with-location");
    expect(res.status).toBe(404);
  });
});
