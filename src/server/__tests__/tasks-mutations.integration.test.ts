import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createApp } from "../index.js";
import { _setDbForTesting } from "../../db/index.js";
import { createTestDb, type TestDb } from "../../db/__tests__/helpers/testDb.js";
import {
  makeBoard,
  makeColumn,
  makeTask,
  makeRole,
  makePrompt,
} from "../../db/__tests__/helpers/factories.js";
import * as q from "../../db/queries/index.js";

/**
 * Integration suite for task mutation routes.
 *
 * Covers: POST /api/boards/:boardId/tasks, PATCH /api/tasks/:id,
 * DELETE /api/tasks/:id, POST /api/tasks/:id/move, PUT /api/tasks/:id/role,
 * POST/DELETE /api/tasks/:id/prompts, POST/DELETE /api/tasks/:id/skills,
 * POST/DELETE /api/tasks/:id/mcp_tools.
 *
 * Each test gets a fresh in-memory DB via createTestDb() + _setDbForTesting,
 * matching the pattern in tasks-search.integration.test.ts.
 */
describe("HTTP API — task mutations integration", () => {
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

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

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

  async function put(path: string, body: unknown): Promise<Response> {
    return await app.fetch(
      new Request(`http://test${path}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  }

  function makeSkill(name = "Test Skill") {
    return q.createSkill(testDb.db, { name, content: "" });
  }

  function makeMcpTool(name = "Test MCP Tool") {
    return q.createMcpTool(testDb.db, { name, content: "" });
  }

  // ---------------------------------------------------------------------------
  // POST /api/boards/:boardId/tasks
  // ---------------------------------------------------------------------------

  describe("POST /api/boards/:boardId/tasks", () => {
    it("happy path — creates a task and returns 201 with full shape", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });

      const res = await post(`/api/boards/${board.id}/tasks`, {
        column_id: col.id,
        title: "New Task",
        description: "Some description",
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        id: string;
        board_id: string;
        column_id: string;
        title: string;
        description: string;
        prompts: unknown[];
        skills: unknown[];
        mcp_tools: unknown[];
      };
      expect(body.board_id).toBe(board.id);
      expect(body.column_id).toBe(col.id);
      expect(body.title).toBe("New Task");
      expect(body.description).toBe("Some description");
      expect(Array.isArray(body.prompts)).toBe(true);
      expect(Array.isArray(body.skills)).toBe(true);
      expect(Array.isArray(body.mcp_tools)).toBe(true);

      // Verify DB state
      const inDb = q.getTask(testDb.db, body.id);
      expect(inDb).not.toBeNull();
      expect(inDb!.title).toBe("New Task");
    });

    it("happy path — description defaults to empty string when omitted", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });

      const res = await post(`/api/boards/${board.id}/tasks`, {
        column_id: col.id,
        title: "No Desc Task",
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as { description: string };
      expect(body.description).toBe("");
    });

    it("returns 404 when board does not exist", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });

      const res = await post("/api/boards/nonexistent/tasks", {
        column_id: col.id,
        title: "Ghost Task",
      });

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/board not found/i);
    });

    it("returns 400 when column does not belong to the board", async () => {
      const board1 = makeBoard(testDb.db);
      const board2 = makeBoard(testDb.db);
      const colOnOtherBoard = makeColumn(testDb.db, { board_id: board2.id });

      const res = await post(`/api/boards/${board1.id}/tasks`, {
        column_id: colOnOtherBoard.id,
        title: "Wrong Column",
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/column does not belong/i);
    });

    it("returns 400 when column_id is missing (validator)", async () => {
      const board = makeBoard(testDb.db);

      const res = await post(`/api/boards/${board.id}/tasks`, {
        title: "No Column",
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 when title is missing (validator)", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });

      const res = await post(`/api/boards/${board.id}/tasks`, {
        column_id: col.id,
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 for empty title (validator — min(1))", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });

      const res = await post(`/api/boards/${board.id}/tasks`, {
        column_id: col.id,
        title: "",
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid JSON body", async () => {
      const board = makeBoard(testDb.db);

      const res = await app.fetch(
        new Request(`http://test/api/boards/${board.id}/tasks`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "not json{{{",
        })
      );

      expect(res.status).toBe(400);
    });

    it("returns 400 when column_id is nonexistent (column not found)", async () => {
      const board = makeBoard(testDb.db);

      const res = await post(`/api/boards/${board.id}/tasks`, {
        column_id: "nonexistent-column",
        title: "Task",
      });

      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/tasks/:id
  // ---------------------------------------------------------------------------

  describe("PATCH /api/tasks/:id", () => {
    it("happy path — updates title", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id, title: "Old Title" });

      const res = await patch(`/api/tasks/${task.id}`, { title: "New Title" });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { title: string };
      expect(body.title).toBe("New Title");

      // Verify DB
      expect(q.getTask(testDb.db, task.id)!.title).toBe("New Title");
    });

    it("happy path — updates description", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id });

      const res = await patch(`/api/tasks/${task.id}`, { description: "Updated desc" });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { description: string };
      expect(body.description).toBe("Updated desc");
    });

    it("happy path — updates position", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id, position: 0 });

      const res = await patch(`/api/tasks/${task.id}`, { position: 5 });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { position: number };
      expect(body.position).toBe(5);
    });

    it("happy path — updates column_id (same board)", async () => {
      const board = makeBoard(testDb.db);
      const col1 = makeColumn(testDb.db, { board_id: board.id, position: 0 });
      const col2 = makeColumn(testDb.db, { board_id: board.id, position: 1 });
      const task = makeTask(testDb.db, { column_id: col1.id });

      const res = await patch(`/api/tasks/${task.id}`, { column_id: col2.id });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { column_id: string };
      expect(body.column_id).toBe(col2.id);
    });

    it("returns 404 for non-existent task id", async () => {
      const res = await patch("/api/tasks/nonexistent", { title: "Ghost" });

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/task not found/i);
    });

    it("returns 400 when column_id references a column on a different board", async () => {
      const board1 = makeBoard(testDb.db);
      const col1 = makeColumn(testDb.db, { board_id: board1.id });
      const task = makeTask(testDb.db, { column_id: col1.id });
      const board2 = makeBoard(testDb.db);
      const col2 = makeColumn(testDb.db, { board_id: board2.id });

      const res = await patch(`/api/tasks/${task.id}`, { column_id: col2.id });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/column does not belong/i);
    });

    it("returns 400 when column_id references a nonexistent column", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id });

      const res = await patch(`/api/tasks/${task.id}`, { column_id: "does-not-exist" });

      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid position type (string)", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id });

      const res = await patch(`/api/tasks/${task.id}`, { position: "not-a-number" });

      expect(res.status).toBe(400);
    });

    it("accepts empty body (no-op update) and returns current task", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id, title: "Unchanged" });

      const res = await patch(`/api/tasks/${task.id}`, {});

      expect(res.status).toBe(200);
      const body = (await res.json()) as { title: string };
      expect(body.title).toBe("Unchanged");
    });

    it("returns full task shape (prompts, skills, mcp_tools arrays present)", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id });

      const res = await patch(`/api/tasks/${task.id}`, { title: "With Relations" });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        prompts: unknown[];
        skills: unknown[];
        mcp_tools: unknown[];
      };
      expect(Array.isArray(body.prompts)).toBe(true);
      expect(Array.isArray(body.skills)).toBe(true);
      expect(Array.isArray(body.mcp_tools)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/tasks/:id
  // ---------------------------------------------------------------------------

  describe("DELETE /api/tasks/:id", () => {
    it("happy path — deletes task and returns {ok: true}", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id });

      const res = await del(`/api/tasks/${task.id}`);

      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean };
      expect(body.ok).toBe(true);

      // Verify task is gone
      expect(q.getTask(testDb.db, task.id)).toBeNull();
    });

    it("returns 404 for a non-existent task id", async () => {
      const res = await del("/api/tasks/nonexistent");

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/task not found/i);
    });

    it("idempotency — deleting twice returns 404 on the second attempt", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id });

      const first = await del(`/api/tasks/${task.id}`);
      expect(first.status).toBe(200);

      const second = await del(`/api/tasks/${task.id}`);
      expect(second.status).toBe(404);
    });

    it("does not affect other tasks on the same board", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task1 = makeTask(testDb.db, { column_id: col.id, position: 0 });
      const task2 = makeTask(testDb.db, { column_id: col.id, position: 1 });

      await del(`/api/tasks/${task1.id}`);

      expect(q.getTask(testDb.db, task2.id)).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/tasks/:id/move
  // ---------------------------------------------------------------------------

  describe("POST /api/tasks/:id/move", () => {
    it("happy path — same-column reposition with explicit position", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id, position: 0 });

      const res = await post(`/api/tasks/${task.id}/move`, {
        column_id: col.id,
        position: 99,
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { position: number; column_id: string };
      expect(body.position).toBe(99);
      expect(body.column_id).toBe(col.id);
    });

    it("happy path — cross-column move within the same board", async () => {
      const board = makeBoard(testDb.db);
      const col1 = makeColumn(testDb.db, { board_id: board.id, position: 0 });
      const col2 = makeColumn(testDb.db, { board_id: board.id, position: 1 });
      const task = makeTask(testDb.db, { column_id: col1.id });

      const res = await post(`/api/tasks/${task.id}/move`, {
        column_id: col2.id,
        position: 0,
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { column_id: string };
      expect(body.column_id).toBe(col2.id);
    });

    it("happy path — position omitted results in append-to-end", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      makeTask(testDb.db, { column_id: col.id, position: 5 });
      const task = makeTask(testDb.db, { column_id: col.id, position: 6 });

      const board2 = makeBoard(testDb.db);
      const col2 = makeColumn(testDb.db, { board_id: board2.id });
      makeTask(testDb.db, { column_id: col2.id, position: 10 });

      const res = await post(`/api/tasks/${task.id}/move`, { column_id: col2.id });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { position: number };
      expect(body.position).toBeGreaterThan(10);
    });

    it("returns 404 for a non-existent task", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });

      const res = await post("/api/tasks/nonexistent/move", { column_id: col.id });

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/task not found/i);
    });

    it("returns 404 for a non-existent target column", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id });

      const res = await post(`/api/tasks/${task.id}/move`, { column_id: "nonexistent" });

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/column not found/i);
    });

    it("returns 400 when column_id is missing from body (validator)", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id });

      const res = await post(`/api/tasks/${task.id}/move`, {});

      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid position type (string)", async () => {
      const board = makeBoard(testDb.db);
      const col1 = makeColumn(testDb.db, { board_id: board.id });
      const col2 = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col1.id });

      const res = await post(`/api/tasks/${task.id}/move`, {
        column_id: col2.id,
        position: "not-a-number",
      });

      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // PUT /api/tasks/:id/role
  // ---------------------------------------------------------------------------

  describe("PUT /api/tasks/:id/role", () => {
    it("happy path — assigns a role to a task", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id });
      const role = makeRole(testDb.db);

      const res = await put(`/api/tasks/${task.id}/role`, { role_id: role.id });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { role_id: string };
      expect(body.role_id).toBe(role.id);

      expect(q.getTask(testDb.db, task.id)!.role_id).toBe(role.id);
    });

    it("happy path — clears the role (null)", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const role = makeRole(testDb.db);
      const task = makeTask(testDb.db, { column_id: col.id, role_id: role.id });

      const res = await put(`/api/tasks/${task.id}/role`, { role_id: null });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { role_id: string | null };
      expect(body.role_id).toBeNull();
    });

    it("returns 404 for non-existent task", async () => {
      const role = makeRole(testDb.db);

      const res = await put("/api/tasks/nonexistent/role", { role_id: role.id });

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/task not found/i);
    });

    it("returns 404 for non-existent role_id", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id });

      const res = await put(`/api/tasks/${task.id}/role`, { role_id: "nonexistent-role" });

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/role not found/i);
    });

    it("returns 400 for missing role_id field (validator)", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id });

      const res = await put(`/api/tasks/${task.id}/role`, {});

      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/tasks/:id/prompts
  // ---------------------------------------------------------------------------

  describe("POST /api/tasks/:id/prompts", () => {
    it("happy path — attaches a prompt and returns 201 with updated task", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id });
      const prompt = makePrompt(testDb.db);

      const res = await post(`/api/tasks/${task.id}/prompts`, { prompt_id: prompt.id });

      expect(res.status).toBe(201);
      const body = (await res.json()) as { prompts: Array<{ id: string }> };
      expect(body.prompts.some((p) => p.id === prompt.id)).toBe(true);
    });

    it("returns 404 for non-existent task", async () => {
      const prompt = makePrompt(testDb.db);

      const res = await post("/api/tasks/nonexistent/prompts", { prompt_id: prompt.id });

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/task not found/i);
    });

    it("returns 404 for non-existent prompt_id", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id });

      const res = await post(`/api/tasks/${task.id}/prompts`, { prompt_id: "nonexistent" });

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/prompt not found/i);
    });

    it("returns 400 for missing prompt_id (validator)", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id });

      const res = await post(`/api/tasks/${task.id}/prompts`, {});

      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/tasks/:id/prompts/:promptId
  // ---------------------------------------------------------------------------

  describe("DELETE /api/tasks/:id/prompts/:promptId", () => {
    it("happy path — removes a directly-attached prompt", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id });
      const prompt = makePrompt(testDb.db);
      q.addTaskPrompt(testDb.db, task.id, prompt.id, "direct");

      const res = await del(`/api/tasks/${task.id}/prompts/${prompt.id}`);

      expect(res.status).toBe(200);
      const body = (await res.json()) as { prompts: Array<{ id: string }> };
      expect(body.prompts.every((p) => p.id !== prompt.id)).toBe(true);
    });

    it("returns 404 for non-existent task", async () => {
      const prompt = makePrompt(testDb.db);

      const res = await del(`/api/tasks/nonexistent/prompts/${prompt.id}`);

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/task not found/i);
    });

    it("returns 404 when prompt was not attached to the task", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id });
      const prompt = makePrompt(testDb.db);

      const res = await del(`/api/tasks/${task.id}/prompts/${prompt.id}`);

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/prompt was not attached/i);
    });

    it("returns 403 when prompt is role-inherited (not direct)", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id });
      const prompt = makePrompt(testDb.db);
      // Attach as role-inherited
      q.addTaskPrompt(testDb.db, task.id, prompt.id, "role:some-role");

      const res = await del(`/api/tasks/${task.id}/prompts/${prompt.id}`);

      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/role-inherited/i);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/tasks/:id/skills
  // ---------------------------------------------------------------------------

  describe("POST /api/tasks/:id/skills", () => {
    it("happy path — attaches a skill and returns 201", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id });
      const skill = makeSkill();

      const res = await post(`/api/tasks/${task.id}/skills`, { skill_id: skill.id });

      expect(res.status).toBe(201);
      const body = (await res.json()) as { skills: Array<{ id: string }> };
      expect(body.skills.some((s) => s.id === skill.id)).toBe(true);
    });

    it("returns 404 for non-existent task", async () => {
      const skill = makeSkill("Skill For Ghost");

      const res = await post("/api/tasks/nonexistent/skills", { skill_id: skill.id });

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/task not found/i);
    });

    it("returns 404 for non-existent skill_id", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id });

      const res = await post(`/api/tasks/${task.id}/skills`, { skill_id: "nonexistent" });

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/skill not found/i);
    });

    it("returns 400 for missing skill_id (validator)", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id });

      const res = await post(`/api/tasks/${task.id}/skills`, {});

      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/tasks/:id/skills/:skillId
  // ---------------------------------------------------------------------------

  describe("DELETE /api/tasks/:id/skills/:skillId", () => {
    it("happy path — removes a directly-attached skill", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id });
      const skill = makeSkill("Removable Skill");
      q.addTaskSkill(testDb.db, task.id, skill.id, "direct");

      const res = await del(`/api/tasks/${task.id}/skills/${skill.id}`);

      expect(res.status).toBe(200);
      const body = (await res.json()) as { skills: Array<{ id: string }> };
      expect(body.skills.every((s) => s.id !== skill.id)).toBe(true);
    });

    it("returns 404 for non-existent task", async () => {
      const skill = makeSkill("Skill For 404 Test");

      const res = await del(`/api/tasks/nonexistent/skills/${skill.id}`);

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/task not found/i);
    });

    it("returns 404 when skill was not attached to the task", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id });
      const skill = makeSkill("Not Attached Skill");

      const res = await del(`/api/tasks/${task.id}/skills/${skill.id}`);

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/skill was not attached/i);
    });

    it("returns 403 when skill is role-inherited", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id });
      const skill = makeSkill("Role Skill");
      q.addTaskSkill(testDb.db, task.id, skill.id, "role:some-role");

      const res = await del(`/api/tasks/${task.id}/skills/${skill.id}`);

      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/role-inherited/i);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/tasks/:id/mcp_tools
  // ---------------------------------------------------------------------------

  describe("POST /api/tasks/:id/mcp_tools", () => {
    it("happy path — attaches an MCP tool and returns 201", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id });
      const mcpTool = makeMcpTool();

      const res = await post(`/api/tasks/${task.id}/mcp_tools`, { mcp_tool_id: mcpTool.id });

      expect(res.status).toBe(201);
      const body = (await res.json()) as { mcp_tools: Array<{ id: string }> };
      expect(body.mcp_tools.some((m) => m.id === mcpTool.id)).toBe(true);
    });

    it("returns 404 for non-existent task", async () => {
      const mcpTool = makeMcpTool("MCP For Ghost");

      const res = await post("/api/tasks/nonexistent/mcp_tools", { mcp_tool_id: mcpTool.id });

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/task not found/i);
    });

    it("returns 404 for non-existent mcp_tool_id", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id });

      const res = await post(`/api/tasks/${task.id}/mcp_tools`, { mcp_tool_id: "nonexistent" });

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/mcp tool not found/i);
    });

    it("returns 400 for missing mcp_tool_id (validator)", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id });

      const res = await post(`/api/tasks/${task.id}/mcp_tools`, {});

      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/tasks/:id/mcp_tools/:mcpToolId
  // ---------------------------------------------------------------------------

  describe("DELETE /api/tasks/:id/mcp_tools/:mcpToolId", () => {
    it("happy path — removes a directly-attached MCP tool", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id });
      const mcpTool = makeMcpTool("Removable MCP");
      q.addTaskMcpTool(testDb.db, task.id, mcpTool.id, "direct");

      const res = await del(`/api/tasks/${task.id}/mcp_tools/${mcpTool.id}`);

      expect(res.status).toBe(200);
      const body = (await res.json()) as { mcp_tools: Array<{ id: string }> };
      expect(body.mcp_tools.every((m) => m.id !== mcpTool.id)).toBe(true);
    });

    it("returns 404 for non-existent task", async () => {
      const mcpTool = makeMcpTool("MCP For 404");

      const res = await del(`/api/tasks/nonexistent/mcp_tools/${mcpTool.id}`);

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/task not found/i);
    });

    it("returns 404 when MCP tool was not attached to the task", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id });
      const mcpTool = makeMcpTool("Unattached MCP");

      const res = await del(`/api/tasks/${task.id}/mcp_tools/${mcpTool.id}`);

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/mcp tool was not attached/i);
    });

    it("returns 403 when MCP tool is role-inherited", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id });
      const mcpTool = makeMcpTool("Role MCP");
      q.addTaskMcpTool(testDb.db, task.id, mcpTool.id, "role:some-role");

      const res = await del(`/api/tasks/${task.id}/mcp_tools/${mcpTool.id}`);

      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/role-inherited/i);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/boards/:boardId/tasks — list tasks with optional column_id filter
  // ---------------------------------------------------------------------------

  describe("GET /api/boards/:boardId/tasks", () => {
    it("returns 404 when board does not exist", async () => {
      const res = await get("/api/boards/nonexistent/tasks");

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/board not found/i);
    });

    it("returns all tasks when no column_id filter is specified", async () => {
      const board = makeBoard(testDb.db);
      const col1 = makeColumn(testDb.db, { board_id: board.id, position: 0 });
      const col2 = makeColumn(testDb.db, { board_id: board.id, position: 1 });
      makeTask(testDb.db, { column_id: col1.id, position: 0 });
      makeTask(testDb.db, { column_id: col2.id, position: 0 });

      const res = await get(`/api/boards/${board.id}/tasks`);

      expect(res.status).toBe(200);
      const body = (await res.json()) as unknown[];
      expect(body).toHaveLength(2);
    });

    it("filters tasks by column_id query parameter", async () => {
      const board = makeBoard(testDb.db);
      const col1 = makeColumn(testDb.db, { board_id: board.id, position: 0 });
      const col2 = makeColumn(testDb.db, { board_id: board.id, position: 1 });
      makeTask(testDb.db, { column_id: col1.id, position: 0 });
      makeTask(testDb.db, { column_id: col2.id, position: 0 });

      const res = await get(`/api/boards/${board.id}/tasks?column_id=${col1.id}`);

      expect(res.status).toBe(200);
      const body = (await res.json()) as Array<{ column_id: string }>;
      expect(body).toHaveLength(1);
      expect(body[0]!.column_id).toBe(col1.id);
    });

    it("returns empty array for a board with no tasks", async () => {
      const board = makeBoard(testDb.db);

      const res = await get(`/api/boards/${board.id}/tasks`);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/tasks/:id — heavy task get
  // ---------------------------------------------------------------------------

  describe("GET /api/tasks/:id", () => {
    it("returns 404 for non-existent id", async () => {
      const res = await get("/api/tasks/nonexistent");

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/task not found/i);
    });

    it("task with a role attaches role field (attachRelations branch)", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const role = makeRole(testDb.db, { name: "Senior Engineer" });
      const task = makeTask(testDb.db, { column_id: col.id, role_id: role.id });

      const res = await get(`/api/tasks/${task.id}`);

      expect(res.status).toBe(200);
      const body = (await res.json()) as { role: { id: string; name: string } | null };
      expect(body.role).not.toBeNull();
      expect(body.role!.id).toBe(role.id);
      expect(body.role!.name).toBe("Senior Engineer");
    });

    it("task without a role returns role as null", async () => {
      const board = makeBoard(testDb.db);
      const col = makeColumn(testDb.db, { board_id: board.id });
      const task = makeTask(testDb.db, { column_id: col.id, role_id: null });

      const res = await get(`/api/tasks/${task.id}`);

      expect(res.status).toBe(200);
      const body = (await res.json()) as { role: unknown };
      expect(body.role).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/tasks/:id/context
  // ---------------------------------------------------------------------------

  describe("GET /api/tasks/:id/context", () => {
    it("returns 404 for non-existent task", async () => {
      const res = await get("/api/tasks/nonexistent/context");

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/task not found/i);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/tasks/:id/bundle
  // ---------------------------------------------------------------------------

  describe("GET /api/tasks/:id/bundle", () => {
    it("returns 404 for non-existent task", async () => {
      const res = await get("/api/tasks/nonexistent/bundle");

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/task not found/i);
    });
  });
});
