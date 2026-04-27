import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../index.js";
import { _setDbForTesting } from "../../db/index.js";
import { createTestDb, type TestDb } from "../../db/__tests__/helpers/testDb.js";
import {
  makeBoard,
  makeColumn,
  makeTask,
} from "../../db/__tests__/helpers/factories.js";
import { bus } from "../events/bus.js";
import type { ServerEvent } from "../events/types.js";

/**
 * Integration suite for the agent-reports HTTP surface. Mirrors the pattern
 * in `tasks-search.integration.test.ts`: every test gets a fresh in-memory
 * DB swapped into the production singleton, then drives the route handlers
 * through Hono's `app.fetch` without binding a port.
 */
describe("HTTP API — agent reports integration", () => {
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

  function makeWorkspace() {
    const board = makeBoard(testDb.db, { name: "Reports Board" });
    const col = makeColumn(testDb.db, { board_id: board.id, name: "Backlog" });
    const task = makeTask(testDb.db, {
      column_id: col.id,
      number: 1,
      title: "Investigate auth bug",
    });
    return { board, col, task };
  }

  async function api(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {};
    let payload: BodyInit | undefined;
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    return await app.fetch(
      new Request(`http://test${path}`, { method, headers, body: payload })
    );
  }

  describe("POST /api/tasks/:taskId/reports", () => {
    it("creates a report and returns it", async () => {
      const { task } = makeWorkspace();
      const res = await api("POST", `/api/tasks/${task.id}/reports`, {
        kind: "investigation",
        title: "Root cause for the auth crash",
        content: "The JWT verifier swallows errors.",
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        id: string;
        task_id: string;
        kind: string;
        title: string;
      };
      expect(body.task_id).toBe(task.id);
      expect(body.kind).toBe("investigation");
    });

    it("publishes report.created on the bus", async () => {
      const { task } = makeWorkspace();
      const seen: ServerEvent[] = [];
      const off = bus.subscribe((e) => seen.push(e));
      try {
        const res = await api("POST", `/api/tasks/${task.id}/reports`, {
          kind: "memo",
          title: "Quick note",
          content: "...",
        });
        expect(res.status).toBe(201);
      } finally {
        off();
      }
      const created = seen.find((e) => e.type === "report.created");
      expect(created).toBeTruthy();
      if (created && created.type === "report.created") {
        expect(created.data.taskId).toBe(task.id);
        expect(created.data.report.title).toBe("Quick note");
      }
    });

    it("returns 404 for an unknown task", async () => {
      const res = await api("POST", `/api/tasks/does-not-exist/reports`, {
        kind: "memo",
        title: "x",
        content: "y",
      });
      expect(res.status).toBe(404);
    });

    it("rejects invalid kind", async () => {
      const { task } = makeWorkspace();
      const res = await api("POST", `/api/tasks/${task.id}/reports`, {
        kind: "not-a-kind",
        title: "x",
        content: "y",
      });
      expect(res.status).toBe(400);
    });

    it("rejects empty title", async () => {
      const { task } = makeWorkspace();
      const res = await api("POST", `/api/tasks/${task.id}/reports`, {
        kind: "memo",
        title: "",
        content: "y",
      });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/tasks/:taskId/reports", () => {
    it("lists reports for the task and supports kind filter", async () => {
      const { task } = makeWorkspace();
      await api("POST", `/api/tasks/${task.id}/reports`, {
        kind: "investigation",
        title: "first",
        content: "...",
      });
      await api("POST", `/api/tasks/${task.id}/reports`, {
        kind: "plan",
        title: "second",
        content: "...",
      });

      const all = await api("GET", `/api/tasks/${task.id}/reports`);
      expect(all.status).toBe(200);
      const allBody = (await all.json()) as { kind: string }[];
      expect(allBody).toHaveLength(2);

      const filtered = await api(
        "GET",
        `/api/tasks/${task.id}/reports?kind=investigation`
      );
      expect(filtered.status).toBe(200);
      const filteredBody = (await filtered.json()) as { kind: string }[];
      expect(filteredBody).toHaveLength(1);
      expect(filteredBody[0]!.kind).toBe("investigation");
    });

    it("rejects an invalid kind filter with 400", async () => {
      const { task } = makeWorkspace();
      const res = await api("GET", `/api/tasks/${task.id}/reports?kind=garbage`);
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/reports/:id", () => {
    it("returns the report by id", async () => {
      const { task } = makeWorkspace();
      const created = (await (
        await api("POST", `/api/tasks/${task.id}/reports`, {
          kind: "summary",
          title: "Summary one",
          content: "body",
        })
      ).json()) as { id: string };

      const res = await api("GET", `/api/reports/${created.id}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string; title: string };
      expect(body.id).toBe(created.id);
      expect(body.title).toBe("Summary one");
    });

    it("returns 404 for unknown id", async () => {
      const res = await api("GET", "/api/reports/missing");
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/reports/:id", () => {
    it("updates a report and publishes report.updated", async () => {
      const { task } = makeWorkspace();
      const created = (await (
        await api("POST", `/api/tasks/${task.id}/reports`, {
          kind: "memo",
          title: "Stale",
          content: "body",
        })
      ).json()) as { id: string };

      const seen: ServerEvent[] = [];
      const off = bus.subscribe((e) => seen.push(e));
      try {
        const res = await api("PATCH", `/api/reports/${created.id}`, {
          title: "Fresh",
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { title: string };
        expect(body.title).toBe("Fresh");
      } finally {
        off();
      }
      const updated = seen.find((e) => e.type === "report.updated");
      expect(updated).toBeTruthy();
    });

    it("returns 404 for unknown id", async () => {
      const res = await api("PATCH", "/api/reports/missing", { title: "x" });
      expect(res.status).toBe(404);
    });

    it("rejects empty patch body", async () => {
      const { task } = makeWorkspace();
      const created = (await (
        await api("POST", `/api/tasks/${task.id}/reports`, {
          kind: "memo",
          title: "T",
          content: "B",
        })
      ).json()) as { id: string };
      const res = await api("PATCH", `/api/reports/${created.id}`, {});
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/reports/:id", () => {
    it("deletes and publishes report.deleted", async () => {
      const { task } = makeWorkspace();
      const created = (await (
        await api("POST", `/api/tasks/${task.id}/reports`, {
          kind: "memo",
          title: "Bye",
          content: "body",
        })
      ).json()) as { id: string };

      const seen: ServerEvent[] = [];
      const off = bus.subscribe((e) => seen.push(e));
      try {
        const res = await api("DELETE", `/api/reports/${created.id}`);
        expect(res.status).toBe(200);
      } finally {
        off();
      }
      const deleted = seen.find((e) => e.type === "report.deleted");
      expect(deleted).toBeTruthy();

      const gone = await api("GET", `/api/reports/${created.id}`);
      expect(gone.status).toBe(404);
    });

    it("returns 404 for unknown id", async () => {
      const res = await api("DELETE", "/api/reports/missing");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/reports/search", () => {
    it("returns FTS hits joined with task context", async () => {
      const { task } = makeWorkspace();
      await api("POST", `/api/tasks/${task.id}/reports`, {
        kind: "investigation",
        title: "JWT verifier swallows errors",
        content: "Body of the report",
      });

      const res = await api("GET", "/api/reports/search?q=JWT");
      expect(res.status).toBe(200);
      const body = (await res.json()) as Array<{
        report: { title: string };
        task: { id: string; title: string };
      }>;
      expect(body).toHaveLength(1);
      expect(body[0]!.report.title).toBe("JWT verifier swallows errors");
      expect(body[0]!.task.id).toBe(task.id);
    });

    it("rejects empty query with 400", async () => {
      const res = await api("GET", "/api/reports/search?q=");
      expect(res.status).toBe(400);
    });

    it("respects the limit parameter", async () => {
      const { task } = makeWorkspace();
      for (let i = 0; i < 5; i++) {
        await api("POST", `/api/tasks/${task.id}/reports`, {
          kind: "memo",
          title: `report ${i}`,
          content: "needle",
        });
      }
      const res = await api("GET", "/api/reports/search?q=needle&limit=2");
      expect(res.status).toBe(200);
      const body = (await res.json()) as unknown[];
      expect(body).toHaveLength(2);
    });
  });

  describe("cascade on task delete", () => {
    it("removes the task's reports when the task is deleted", async () => {
      const { task } = makeWorkspace();
      const created = (await (
        await api("POST", `/api/tasks/${task.id}/reports`, {
          kind: "investigation",
          title: "doomed",
          content: "...",
        })
      ).json()) as { id: string };

      // Use the existing task DELETE route — confirms FK cascade fires
      // through the HTTP path, not just at the SQL level.
      const del = await api("DELETE", `/api/tasks/${task.id}`);
      expect(del.status).toBe(200);

      const gone = await api("GET", `/api/reports/${created.id}`);
      expect(gone.status).toBe(404);
    });
  });
});
