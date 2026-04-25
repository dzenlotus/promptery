import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createApp } from "../index.js";
import { _setDbForTesting } from "../../db/index.js";
import { createTestDb, type TestDb } from "../../db/__tests__/helpers/testDb.js";
import { makeBoard, makeSpace } from "../../db/__tests__/helpers/factories.js";

/**
 * HTTP integration coverage for the sidebar drag-and-drop endpoints:
 * POST /api/spaces/reorder, POST /api/boards/reorder, and the
 * `position` extension on POST /api/boards/:id/move-to-space.
 *
 * The repo-level tests in `db/queries/__tests__/spaces.test.ts` cover
 * the slug semantics of move-to-space; this file pins down the route
 * surface (validators, error envelopes, and the events that fire on
 * success).
 */
describe("HTTP API — POST /api/spaces/reorder", () => {
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

  async function post(path: string, body: unknown): Promise<Response> {
    return await app.fetch(
      new Request(`http://test${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  }

  it("renumbers `position` to match the supplied id order", async () => {
    const a = makeSpace(testDb.db, { name: "A", prefix: "aaa", position: 0 });
    const b = makeSpace(testDb.db, { name: "B", prefix: "bbb", position: 1 });
    const c = makeSpace(testDb.db, { name: "C", prefix: "ccc", position: 2 });

    const res = await post("/api/spaces/reorder", { ids: [c.id, a.id, b.id] });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ id: string; position: number }>;
    const byId = new Map(body.map((s) => [s.id, s.position]));
    expect(byId.get(c.id)).toBe(0);
    expect(byId.get(a.id)).toBe(1);
    expect(byId.get(b.id)).toBe(2);
  });

  it("rejects an empty ids array with 400", async () => {
    const res = await post("/api/spaces/reorder", { ids: [] });
    expect(res.status).toBe(400);
  });
});

describe("HTTP API — POST /api/boards/reorder", () => {
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

  async function post(path: string, body: unknown): Promise<Response> {
    return await app.fetch(
      new Request(`http://test${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  }

  it("renumbers `position` 1..N within the given space", async () => {
    const space = makeSpace(testDb.db, { name: "S", prefix: "s", position: 1 });
    const a = makeBoard(testDb.db, { name: "A", space_id: space.id });
    const b = makeBoard(testDb.db, { name: "B", space_id: space.id });
    const c = makeBoard(testDb.db, { name: "C", space_id: space.id });

    const res = await post("/api/boards/reorder", {
      space_id: space.id,
      ids: [c.id, a.id, b.id],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ id: string; position: number }>;
    const byId = new Map(body.map((r) => [r.id, r.position]));
    expect(byId.get(c.id)).toBe(1);
    expect(byId.get(a.id)).toBe(2);
    expect(byId.get(b.id)).toBe(3);
  });

  it("returns 404 when space_id refers to a missing space", async () => {
    const res = await post("/api/boards/reorder", {
      space_id: "nope",
      ids: ["x"],
    });
    expect(res.status).toBe(404);
  });

  it("ignores boards from other spaces silently", async () => {
    const sA = makeSpace(testDb.db, { name: "A", prefix: "saaa", position: 1 });
    const sB = makeSpace(testDb.db, { name: "B", prefix: "sbbb", position: 2 });
    const a1 = makeBoard(testDb.db, { name: "A1", space_id: sA.id });
    const b1 = makeBoard(testDb.db, { name: "B1", space_id: sB.id });

    // Reorder for sA but include a board belonging to sB; sB's position
    // should not be touched, sA's position is renumbered for the rows that
    // actually belong to it.
    const res = await post("/api/boards/reorder", {
      space_id: sA.id,
      ids: [b1.id, a1.id],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ id: string }>;
    // Response contains only sA's boards.
    expect(body.map((r) => r.id)).toEqual([a1.id]);
  });
});

describe("HTTP API — POST /api/boards/:id/move-to-space with position", () => {
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

  async function post(path: string, body: unknown): Promise<Response> {
    return await app.fetch(
      new Request(`http://test${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  }

  it("places the board at the requested position in the destination space", async () => {
    const src = makeSpace(testDb.db, { name: "Src", prefix: "src", position: 1 });
    const dst = makeSpace(testDb.db, { name: "Dst", prefix: "dst", position: 2 });
    // Pre-populate dst with two boards so the moved one can land between them.
    makeBoard(testDb.db, { name: "first", space_id: dst.id });
    makeBoard(testDb.db, { name: "second", space_id: dst.id });
    const moving = makeBoard(testDb.db, { name: "moving", space_id: src.id });

    const res = await post(`/api/boards/${moving.id}/move-to-space`, {
      space_id: dst.id,
      position: 1.5,
    });
    expect(res.status).toBe(200);

    const row = testDb.db
      .prepare("SELECT space_id, position FROM boards WHERE id = ?")
      .get(moving.id) as { space_id: string; position: number };
    expect(row.space_id).toBe(dst.id);
    expect(row.position).toBe(1.5);
  });

  it("appends to the end when position is omitted", async () => {
    const src = makeSpace(testDb.db, { name: "Src2", prefix: "src2", position: 1 });
    const dst = makeSpace(testDb.db, { name: "Dst2", prefix: "dst2", position: 2 });
    // Three pre-existing boards in dst at positions 1/2/3.
    makeBoard(testDb.db, { name: "p1", space_id: dst.id });
    makeBoard(testDb.db, { name: "p2", space_id: dst.id });
    makeBoard(testDb.db, { name: "p3", space_id: dst.id });
    // Set their positions explicitly via a quick repo call (the makeBoard
    // factory leaves position at 0).
    testDb.db
      .prepare("UPDATE boards SET position = ? WHERE space_id = ?")
      .run(3, dst.id);
    testDb.db
      .prepare(
        "UPDATE boards SET position = id_rank FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY name) AS id_rank FROM boards WHERE space_id = ?) AS t WHERE boards.id = t.id"
      )
      .run(dst.id);

    const moving = makeBoard(testDb.db, { name: "moving2", space_id: src.id });
    const res = await post(`/api/boards/${moving.id}/move-to-space`, {
      space_id: dst.id,
    });
    expect(res.status).toBe(200);

    const row = testDb.db
      .prepare("SELECT position FROM boards WHERE id = ?")
      .get(moving.id) as { position: number };
    // Append-to-end → max(position) + 1, which is 4 with the three pre-existing rows.
    expect(row.position).toBe(4);
  });
});
