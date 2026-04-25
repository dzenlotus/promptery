import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createApp } from "../index.js";
import { _setDbForTesting } from "../../db/index.js";
import { createTestDb, type TestDb } from "../../db/__tests__/helpers/testDb.js";
import { makeBoard, makeColumn, makeTask } from "../../db/__tests__/helpers/factories.js";

/**
 * HTTP integration coverage for the spaces feature. Walks through CRUD,
 * the prefix collision/validation envelope, the default-space
 * immutability guard, the has-boards guard, and the cross-space board
 * move with task re-slugging.
 */
describe("HTTP API — /api/spaces", () => {
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
  async function post(path: string, body: unknown): Promise<Response> {
    return await app.fetch(
      new Request(`http://test${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  }
  async function patch(path: string, body: unknown): Promise<Response> {
    return await app.fetch(
      new Request(`http://test${path}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  }
  async function del(path: string): Promise<Response> {
    return await app.fetch(new Request(`http://test${path}`, { method: "DELETE" }));
  }

  describe("GET /api/spaces", () => {
    it("lists the seeded default space on a fresh DB", async () => {
      const res = await get("/api/spaces");
      expect(res.status).toBe(200);
      const body = (await res.json()) as Array<{
        prefix: string;
        is_default: boolean;
      }>;
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({ prefix: "task", is_default: true });
    });
  });

  describe("POST /api/spaces", () => {
    it("creates a space with valid name + prefix and returns 201", async () => {
      const res = await post("/api/spaces", {
        name: "Promptery",
        prefix: "pmt",
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; prefix: string };
      expect(body.prefix).toBe("pmt");
      expect(body.id).toBeTruthy();
    });

    it("rejects a colliding prefix with 409", async () => {
      await post("/api/spaces", { name: "First", prefix: "abc" });
      const res = await post("/api/spaces", { name: "Second", prefix: "abc" });
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("PrefixCollision");
    });

    it("rejects an uppercase prefix at the validator with 400", async () => {
      const res = await post("/api/spaces", { name: "X", prefix: "PMT" });
      expect(res.status).toBe(400);
    });

    it("rejects a too-long prefix at the validator with 400", async () => {
      const res = await post("/api/spaces", {
        name: "X",
        prefix: "abcdefghijk",
      });
      expect(res.status).toBe(400);
    });

    it("rejects a missing name with 400", async () => {
      const res = await post("/api/spaces", { prefix: "x" });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/spaces/:id", () => {
    it("returns the space with a board_ids array", async () => {
      const create = await post("/api/spaces", {
        name: "Project",
        prefix: "prj",
      });
      const space = (await create.json()) as { id: string };

      // Create a board inside that space so board_ids is non-empty.
      await post("/api/boards", { name: "B", space_id: space.id });

      const res = await get(`/api/spaces/${space.id}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { board_ids: string[] };
      expect(body.board_ids).toHaveLength(1);
    });

    it("returns 404 for an unknown space", async () => {
      const res = await get("/api/spaces/nope");
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/spaces/:id", () => {
    it("renames a space without re-slugging existing tasks", async () => {
      // Set up: space, board in it, one task to lock its slug.
      const sp = (await (
        await post("/api/spaces", { name: "Old", prefix: "old" })
      ).json()) as { id: string };
      const board = makeBoard(testDb.db, { space_id: sp.id });
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, {
        column_id: col.id,
        slug: "old-1",
      });

      const res = await patch(`/api/spaces/${sp.id}`, { name: "Renamed" });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { name: string };
      expect(body.name).toBe("Renamed");

      // Slug stays — only future tasks would use a renamed prefix.
      const taskRow = testDb.db
        .prepare("SELECT slug FROM tasks WHERE id = ?")
        .get(task.id) as { slug: string };
      expect(taskRow.slug).toBe("old-1");
    });

    it("rejects updating to a colliding prefix with 409", async () => {
      const a = (await (
        await post("/api/spaces", { name: "A", prefix: "aaa" })
      ).json()) as { id: string };
      await post("/api/spaces", { name: "B", prefix: "bbb" });

      const res = await patch(`/api/spaces/${a.id}`, { prefix: "bbb" });
      expect(res.status).toBe(409);
    });

    it("returns 404 for a missing space", async () => {
      const res = await patch("/api/spaces/nope", { name: "X" });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/spaces/:id", () => {
    it("refuses to delete the default space with 409", async () => {
      const list = (await (await get("/api/spaces")).json()) as Array<{
        id: string;
        is_default: boolean;
      }>;
      const def = list.find((s) => s.is_default)!;
      const res = await del(`/api/spaces/${def.id}`);
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("DefaultSpaceImmutable");
    });

    it("refuses to delete a space that has boards with 409", async () => {
      const sp = (await (
        await post("/api/spaces", { name: "X", prefix: "x" })
      ).json()) as { id: string };
      await post("/api/boards", { name: "B", space_id: sp.id });

      const res = await del(`/api/spaces/${sp.id}`);
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("SpaceHasBoards");
    });

    it("deletes an empty space and cascades the counter row", async () => {
      const sp = (await (
        await post("/api/spaces", { name: "X", prefix: "x" })
      ).json()) as { id: string };

      const res = await del(`/api/spaces/${sp.id}`);
      expect(res.status).toBe(200);

      const row = testDb.db
        .prepare("SELECT space_id FROM space_counters WHERE space_id = ?")
        .get(sp.id);
      expect(row).toBeUndefined();
    });
  });
});

describe("HTTP API — POST /api/boards/:id/move-to-space", () => {
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

  it("re-slugs all tasks on the board and returns the count", async () => {
    const src = (await (
      await post("/api/spaces", { name: "Src", prefix: "src" })
    ).json()) as { id: string };
    const dest = (await (
      await post("/api/spaces", { name: "Dest", prefix: "dst" })
    ).json()) as { id: string };

    const board = makeBoard(testDb.db, { space_id: src.id });
    const col = makeColumn(testDb.db, { board_id: board.id });
    const t1 = makeTask(testDb.db, { column_id: col.id, slug: "src-1" });
    const t2 = makeTask(testDb.db, { column_id: col.id, slug: "src-2" });

    const res = await post(`/api/boards/${board.id}/move-to-space`, {
      space_id: dest.id,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { reslugged_count: number };
    expect(body.reslugged_count).toBe(2);

    // Both tasks now carry dst-* slugs; ids are unchanged.
    const after = testDb.db
      .prepare("SELECT id, slug FROM tasks WHERE id IN (?, ?)")
      .all(t1.id, t2.id) as Array<{ id: string; slug: string }>;
    expect(after.map((r) => r.slug).sort()).toEqual(["dst-1", "dst-2"]);
  });

  it("returns 404 for a missing destination space", async () => {
    const board = makeBoard(testDb.db);
    const res = await post(`/api/boards/${board.id}/move-to-space`, {
      space_id: "nope",
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 for a missing board", async () => {
    const sp = (await (
      await post("/api/spaces", { name: "X", prefix: "x" })
    ).json()) as { id: string };

    const res = await post("/api/boards/nope/move-to-space", {
      space_id: sp.id,
    });
    expect(res.status).toBe(404);
  });
});

describe("HTTP API — POST /api/boards (with optional space_id)", () => {
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

  it("defaults to the default space when space_id is omitted", async () => {
    const res = await post("/api/boards", { name: "B" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { space_id: string };
    const def = testDb.db
      .prepare("SELECT id FROM spaces WHERE is_default = 1")
      .get() as { id: string };
    expect(body.space_id).toBe(def.id);
  });

  it("uses the provided space_id when valid", async () => {
    const sp = (await (
      await post("/api/spaces", { name: "X", prefix: "x" })
    ).json()) as { id: string };

    const res = await post("/api/boards", { name: "B", space_id: sp.id });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { space_id: string };
    expect(body.space_id).toBe(sp.id);
  });

  it("returns 404 when space_id refers to a missing space", async () => {
    const res = await post("/api/boards", { name: "B", space_id: "nope" });
    expect(res.status).toBe(404);
  });
});
