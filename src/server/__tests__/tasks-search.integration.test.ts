import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createApp } from "../index.js";
import { _setDbForTesting } from "../../db/index.js";
import {
  createTestDb,
  type TestDb,
} from "../../db/__tests__/helpers/testDb.js";
import {
  seedWorkspace,
  type SeedWorkspaceResult,
} from "../../db/__tests__/helpers/factories.js";

/**
 * Integration suite for the new task-search HTTP surface.
 *
 * Uses Hono's `app.fetch(Request)` to hit the real route handlers without
 * binding a port — every test gets a fresh in-memory DB swapped into the
 * production singleton via `_setDbForTesting`. That gives per-test
 * isolation with zero socket overhead and zero shared state.
 */
describe("HTTP API — tasks search/list/get integration", () => {
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
    // app.fetch is typed as `Response | Promise<Response>` because Hono
    // supports synchronous handlers — await coerces both branches.
    return await app.fetch(new Request(`http://test${path}`));
  }

  describe("GET /api/tasks/search", () => {
    it("returns 200 with matching tasks for a non-empty query", async () => {
      seedWorkspace(testDb.db);
      const res = await get("/api/tasks/search?query=cmdk");
      expect(res.status).toBe(200);
      const body = (await res.json()) as unknown[];
      expect(body).toHaveLength(1);
    });

    /**
     * Regression for the routing bug we hit during 0.2.2 development:
     * `GET /api/tasks/search` got matched as `GET /api/tasks/:id` and
     * returned 404 "task not found". Hono should route by static-segment
     * specificity, but we also register `/search` first as belt-and-braces.
     * If either the order or the routing ever changes, this fails fast.
     */
    it("search route is matched BEFORE /api/tasks/:id (routing-order regression)", async () => {
      seedWorkspace(testDb.db);
      const res = await get("/api/tasks/search");
      expect(res.status).not.toBe(404);
      expect(res.status).toBe(200);

      // Belt-and-braces: shape alone proves which handler answered. /search
      // returns an array; /:id returns an object (task or {error}).
      const body = (await res.json()) as unknown;
      expect(Array.isArray(body)).toBe(true);
    });

    it("regression: /api/tasks/search?query=test returns 200, not 404", async () => {
      const res = await get("/api/tasks/search?query=test");
      expect(res.status).toBe(200);
      expect(Array.isArray(await res.json())).toBe(true);
    });

    it("empty query lists all tasks (capped by limit)", async () => {
      seedWorkspace(testDb.db);
      const res = await get("/api/tasks/search");
      expect(res.status).toBe(200);
      const body = (await res.json()) as unknown[];
      expect(body.length).toBe(6);
    });

    it("returns 400 for non-numeric limit", async () => {
      const res = await get("/api/tasks/search?limit=abc");
      expect(res.status).toBe(400);
    });

    it("returns 400 for limit > 500", async () => {
      const res = await get("/api/tasks/search?limit=99999");
      expect(res.status).toBe(400);
    });

    it("returns 400 for limit < 1", async () => {
      const res = await get("/api/tasks/search?limit=0");
      expect(res.status).toBe(400);
    });

    it("composes board_id + role_id filters on the query string", async () => {
      const seeded = seedWorkspace(testDb.db);
      const url = `/api/tasks/search?board_id=${seeded.boards[0]!.id}&role_id=${seeded.roles[0]!.id}`;
      const res = await get(url);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Array<{
        task: { role_id: string | null };
        board: { id: string };
      }>;
      expect(body.length).toBeGreaterThan(0);
      for (const h of body) {
        expect(h.board.id).toBe(seeded.boards[0]!.id);
        expect(h.task.role_id).toBe(seeded.roles[0]!.id);
      }
    });

    it("returns [] (not 404) when query has no matches", async () => {
      seedWorkspace(testDb.db);
      const res = await get("/api/tasks/search?query=zzzzznopezzzz");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });
  });

  describe("GET /api/tasks/:id/with-location", () => {
    it("returns task + column + board for a valid id", async () => {
      const seeded = seedWorkspace(testDb.db);
      const target = seeded.tasks[0]!;
      const res = await get(`/api/tasks/${target.id}/with-location`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        task: { id: string };
        column: { id: string };
        board: { id: string };
      };
      expect(body.task.id).toBe(target.id);
      expect(body.column.id).toBe(target.column_id);
      expect(body.board.id).toBe(seeded.boards[0]!.id);
    });

    it("returns 404 for a non-existent id", async () => {
      const res = await get("/api/tasks/nonexistent/with-location");
      expect(res.status).toBe(404);
    });

    it("does NOT include the heavy bundle (lite shape only)", async () => {
      const seeded = seedWorkspace(testDb.db);
      const res = await get(`/api/tasks/${seeded.tasks[0]!.id}/with-location`);
      const body = (await res.json()) as Record<string, unknown> & {
        task: Record<string, unknown>;
      };
      expect(body.task.prompts).toBeUndefined();
      expect(body.task.skills).toBeUndefined();
      expect(body.task.mcp_tools).toBeUndefined();
      expect(body.role).toBeUndefined();
    });
  });

  describe("Existing routes still work (no regressions)", () => {
    let seeded: SeedWorkspaceResult;

    beforeEach(() => {
      seeded = seedWorkspace(testDb.db);
    });

    it("GET /api/tasks/:id (heavy task fetch) still works", async () => {
      const res = await get(`/api/tasks/${seeded.tasks[0]!.id}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string; prompts: unknown };
      expect(body.id).toBe(seeded.tasks[0]!.id);
      // The heavy variant still hydrates relation arrays (empty here, but
      // the *shape* must match what callers expect).
      expect(body.prompts).toBeDefined();
    });

    it("GET /api/boards/:id/tasks?column_id=<id> (legacy list_tasks) still works", async () => {
      const url = `/api/boards/${seeded.boards[0]!.id}/tasks?column_id=${seeded.columns[0]!.id}`;
      const res = await get(url);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Array<{ column_id: string }>;
      expect(body.length).toBeGreaterThan(0);
      for (const t of body) {
        expect(t.column_id).toBe(seeded.columns[0]!.id);
      }
    });

    it("GET /api/tasks/:id/context still works", async () => {
      const res = await get(`/api/tasks/${seeded.tasks[0]!.id}/context`);
      expect(res.status).toBe(200);
    });

    it("GET /api/tasks/:id/bundle still returns XML", async () => {
      const res = await get(`/api/tasks/${seeded.tasks[0]!.id}/bundle`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/xml");
      const xml = await res.text();
      expect(xml.startsWith("<context>")).toBe(true);
    });
  });
});
