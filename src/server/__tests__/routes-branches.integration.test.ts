/**
 * Integration tests targeting branch coverage for route handlers that have
 * only happy-path coverage or zero coverage.
 *
 * Covers: boards, columns, prompts, roles, skills, mcpTools, promptGroups,
 *         settings, tasks (sub-routes), bridges.
 *
 * Pattern: use app.fetch() directly with createTestDb() + _setDbForTesting.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createApp } from "../index.js";
import { _setDbForTesting } from "../../db/index.js";
import { createTestDb, type TestDb } from "../../db/__tests__/helpers/testDb.js";
import {
  makeBoard,
  makeColumn,
  makeTask,
  makePrompt,
  makeRole,
} from "../../db/__tests__/helpers/factories.js";

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

async function req(
  method: string,
  path: string,
  body?: unknown
): Promise<Response> {
  const headers: Record<string, string> = {};
  let payload: string | undefined;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  return app.fetch(
    new Request(`http://test${path}`, { method, headers, body: payload })
  );
}

// ---------------------------------------------------------------------------
// boards.ts branches
// ---------------------------------------------------------------------------

describe("boards route — branch coverage", () => {
  it("GET /api/boards/:id returns 404 for unknown board", async () => {
    const res = await req("GET", "/api/boards/nope");
    expect(res.status).toBe(404);
  });

  it("PATCH /api/boards/:id returns 400 when name is omitted", async () => {
    const board = makeBoard(testDb.db);
    const res = await req("PATCH", `/api/boards/${board.id}`, {});
    expect(res.status).toBe(400);
  });

  it("PATCH /api/boards/:id returns 404 for unknown board", async () => {
    const res = await req("PATCH", "/api/boards/nope", { name: "x" });
    expect(res.status).toBe(404);
  });

  it("DELETE /api/boards/:id returns 404 for unknown board", async () => {
    const res = await req("DELETE", "/api/boards/nope");
    expect(res.status).toBe(404);
  });

  it("PUT /api/boards/:id/role returns 404 when role does not exist", async () => {
    const board = makeBoard(testDb.db);
    const res = await req("PUT", `/api/boards/${board.id}/role`, {
      role_id: "nonexistent-role",
    });
    expect(res.status).toBe(404);
  });

  it("PUT /api/boards/:id/role returns 404 when board does not exist", async () => {
    const role = makeRole(testDb.db);
    const res = await req("PUT", "/api/boards/nope/role", {
      role_id: role.id,
    });
    expect(res.status).toBe(404);
  });

  it("PUT /api/boards/:id/role with null clears board role", async () => {
    const role = makeRole(testDb.db);
    const board = makeBoard(testDb.db, { role_id: role.id });
    const res = await req("PUT", `/api/boards/${board.id}/role`, { role_id: null });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { role_id: string | null };
    expect(body.role_id).toBeNull();
  });

  it("GET /api/boards/:id/prompts returns 404 for unknown board", async () => {
    const res = await req("GET", "/api/boards/nope/prompts");
    expect(res.status).toBe(404);
  });

  it("PUT /api/boards/:id/prompts returns 404 for unknown board", async () => {
    const res = await req("PUT", "/api/boards/nope/prompts", { prompt_ids: [] });
    expect(res.status).toBe(404);
  });

  it("PUT /api/boards/:id/prompts returns 400 when a prompt id does not exist", async () => {
    const board = makeBoard(testDb.db);
    const res = await req("PUT", `/api/boards/${board.id}/prompts`, {
      prompt_ids: ["ghost"],
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// columns.ts branches
// ---------------------------------------------------------------------------

describe("columns route — branch coverage", () => {
  it("GET /api/boards/:boardId/columns returns 404 for unknown board", async () => {
    const res = await req("GET", "/api/boards/nope/columns");
    expect(res.status).toBe(404);
  });

  it("POST /api/boards/:boardId/columns returns 404 for unknown board", async () => {
    const res = await req("POST", "/api/boards/nope/columns", { name: "col" });
    expect(res.status).toBe(404);
  });

  it("GET /api/columns/:id returns 404 for unknown column", async () => {
    const res = await req("GET", "/api/columns/nope");
    expect(res.status).toBe(404);
  });

  it("PATCH /api/columns/:id returns 404 for unknown column", async () => {
    const res = await req("PATCH", "/api/columns/nope", { name: "x" });
    expect(res.status).toBe(404);
  });

  it("DELETE /api/columns/:id returns 404 for unknown column", async () => {
    const res = await req("DELETE", "/api/columns/nope");
    expect(res.status).toBe(404);
  });

  it("DELETE /api/columns/:id returns 409 when column has tasks", async () => {
    const board = makeBoard(testDb.db);
    const col = makeColumn(testDb.db, { board_id: board.id });
    makeTask(testDb.db, { column_id: col.id });
    const res = await req("DELETE", `/api/columns/${col.id}`);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; taskCount: number };
    expect(body.error).toBe("ColumnNotEmpty");
    expect(body.taskCount).toBeGreaterThan(0);
  });

  it("PUT /api/columns/:id/role returns 404 for unknown column", async () => {
    const res = await req("PUT", "/api/columns/nope/role", { role_id: null });
    expect(res.status).toBe(404);
  });

  it("PUT /api/columns/:id/role returns 404 when role does not exist", async () => {
    const board = makeBoard(testDb.db);
    const col = makeColumn(testDb.db, { board_id: board.id });
    const res = await req("PUT", `/api/columns/${col.id}/role`, {
      role_id: "ghost-role",
    });
    expect(res.status).toBe(404);
  });

  it("PUT /api/columns/:id/role with null clears column role", async () => {
    const role = makeRole(testDb.db);
    const board = makeBoard(testDb.db);
    const col = makeColumn(testDb.db, { board_id: board.id, role_id: role.id });
    const res = await req("PUT", `/api/columns/${col.id}/role`, { role_id: null });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { role_id: string | null };
    expect(body.role_id).toBeNull();
  });

  it("GET /api/columns/:id/prompts returns 404 for unknown column", async () => {
    const res = await req("GET", "/api/columns/nope/prompts");
    expect(res.status).toBe(404);
  });

  it("PUT /api/columns/:id/prompts returns 404 for unknown column", async () => {
    const res = await req("PUT", "/api/columns/nope/prompts", { prompt_ids: [] });
    expect(res.status).toBe(404);
  });

  it("PUT /api/columns/:id/prompts returns 400 when a prompt id does not exist", async () => {
    const board = makeBoard(testDb.db);
    const col = makeColumn(testDb.db, { board_id: board.id });
    const res = await req("PUT", `/api/columns/${col.id}/prompts`, {
      prompt_ids: ["ghost"],
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// prompts.ts branches
// ---------------------------------------------------------------------------

describe("prompts route — branch coverage", () => {
  it("GET /api/prompts/:id returns 404 for unknown prompt", async () => {
    const res = await req("GET", "/api/prompts/nope");
    expect(res.status).toBe(404);
  });

  it("PATCH /api/prompts/:id returns 404 for unknown prompt", async () => {
    const res = await req("PATCH", "/api/prompts/nope", { name: "x" });
    expect(res.status).toBe(404);
  });

  it("DELETE /api/prompts/:id returns 404 for unknown prompt", async () => {
    const res = await req("DELETE", "/api/prompts/nope");
    expect(res.status).toBe(404);
  });

  it("POST /api/prompts returns 400 for invalid name", async () => {
    const res = await req("POST", "/api/prompts", { name: "Bad Name!" });
    expect(res.status).toBe(400);
  });

  it("POST /api/prompts creates a prompt successfully", async () => {
    const res = await req("POST", "/api/prompts", {
      name: "valid-name",
      content: "some content",
      color: "#abc",
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { name: string; content: string; color: string };
    expect(body.name).toBe("valid-name");
  });

  it("PATCH /api/prompts/:id updates name", async () => {
    const prompt = makePrompt(testDb.db, { name: "orig-name" });
    const res = await req("PATCH", `/api/prompts/${prompt.id}`, {
      name: "new-name",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string };
    expect(body.name).toBe("new-name");
  });
});

// ---------------------------------------------------------------------------
// roles.ts branches
// ---------------------------------------------------------------------------

describe("roles route — branch coverage", () => {
  it("GET /api/roles/:id returns 404 for unknown role", async () => {
    const res = await req("GET", "/api/roles/nope");
    expect(res.status).toBe(404);
  });

  it("PATCH /api/roles/:id returns 404 for unknown role", async () => {
    const res = await req("PATCH", "/api/roles/nope", { name: "x" });
    expect(res.status).toBe(404);
  });

  it("DELETE /api/roles/:id returns 404 for unknown role", async () => {
    const res = await req("DELETE", "/api/roles/nope");
    expect(res.status).toBe(404);
  });

  it("GET /api/roles/:id/tasks-count returns 404 for unknown role", async () => {
    const res = await req("GET", "/api/roles/nope/tasks-count");
    expect(res.status).toBe(404);
  });

  it("GET /api/roles/:id/tasks-count returns count", async () => {
    const role = makeRole(testDb.db);
    const board = makeBoard(testDb.db);
    const col = makeColumn(testDb.db, { board_id: board.id });
    makeTask(testDb.db, { column_id: col.id, role_id: role.id });
    const res = await req("GET", `/api/roles/${role.id}/tasks-count`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { count: number };
    expect(body.count).toBe(1);
  });

  it("PUT /api/roles/:id/prompts returns 404 for unknown role", async () => {
    const res = await req("PUT", "/api/roles/nope/prompts", { prompt_ids: [] });
    expect(res.status).toBe(404);
  });

  it("PUT /api/roles/:id/skills returns 404 for unknown role", async () => {
    const res = await req("PUT", "/api/roles/nope/skills", { skill_ids: [] });
    expect(res.status).toBe(404);
  });

  it("PUT /api/roles/:id/mcp_tools returns 404 for unknown role", async () => {
    const res = await req("PUT", "/api/roles/nope/mcp_tools", { mcp_tool_ids: [] });
    expect(res.status).toBe(404);
  });

  it("PUT /api/roles/:id/prompts sets prompts and returns role with relations", async () => {
    const role = makeRole(testDb.db);
    const prompt = makePrompt(testDb.db);
    const res = await req("PUT", `/api/roles/${role.id}/prompts`, {
      prompt_ids: [prompt.id],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { prompts: { id: string }[] };
    expect(body.prompts.some((p) => p.id === prompt.id)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// skills.ts branches
// ---------------------------------------------------------------------------

describe("skills route — branch coverage", () => {
  it("POST /api/skills creates a skill", async () => {
    const res = await req("POST", "/api/skills", { name: "my-skill" });
    expect(res.status).toBe(201);
  });

  it("GET /api/skills/:id returns 404 for unknown skill", async () => {
    const res = await req("GET", "/api/skills/nope");
    expect(res.status).toBe(404);
  });

  it("PATCH /api/skills/:id returns 404 for unknown skill", async () => {
    const res = await req("PATCH", "/api/skills/nope", { name: "x" });
    expect(res.status).toBe(404);
  });

  it("PATCH /api/skills/:id updates skill", async () => {
    const res1 = await req("POST", "/api/skills", { name: "skill-a" });
    const created = (await res1.json()) as { id: string };
    const res = await req("PATCH", `/api/skills/${created.id}`, { name: "skill-b" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string };
    expect(body.name).toBe("skill-b");
  });

  it("DELETE /api/skills/:id returns 404 for unknown skill", async () => {
    const res = await req("DELETE", "/api/skills/nope");
    expect(res.status).toBe(404);
  });

  it("DELETE /api/skills/:id deletes skill", async () => {
    const res1 = await req("POST", "/api/skills", { name: "skill-del" });
    const created = (await res1.json()) as { id: string };
    const res = await req("DELETE", `/api/skills/${created.id}`);
    expect(res.status).toBe(200);
  });

  it("POST /api/skills returns 400 for invalid name", async () => {
    const res = await req("POST", "/api/skills", { name: "Bad Name!" });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// mcpTools.ts branches
// ---------------------------------------------------------------------------

describe("mcpTools route — branch coverage", () => {
  it("POST /api/mcp_tools creates a tool", async () => {
    const res = await req("POST", "/api/mcp_tools", { name: "my-tool" });
    expect(res.status).toBe(201);
  });

  it("GET /api/mcp_tools/:id returns 404 for unknown tool", async () => {
    const res = await req("GET", "/api/mcp_tools/nope");
    expect(res.status).toBe(404);
  });

  it("PATCH /api/mcp_tools/:id returns 404 for unknown tool", async () => {
    const res = await req("PATCH", "/api/mcp_tools/nope", { name: "x" });
    expect(res.status).toBe(404);
  });

  it("PATCH /api/mcp_tools/:id updates tool", async () => {
    const res1 = await req("POST", "/api/mcp_tools", { name: "tool-a" });
    const created = (await res1.json()) as { id: string };
    const res = await req("PATCH", `/api/mcp_tools/${created.id}`, { name: "tool-b" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string };
    expect(body.name).toBe("tool-b");
  });

  it("DELETE /api/mcp_tools/:id returns 404 for unknown tool", async () => {
    const res = await req("DELETE", "/api/mcp_tools/nope");
    expect(res.status).toBe(404);
  });

  it("DELETE /api/mcp_tools/:id deletes tool", async () => {
    const res1 = await req("POST", "/api/mcp_tools", { name: "tool-del" });
    const created = (await res1.json()) as { id: string };
    const res = await req("DELETE", `/api/mcp_tools/${created.id}`);
    expect(res.status).toBe(200);
  });

  it("POST /api/mcp_tools returns 400 for invalid name", async () => {
    const res = await req("POST", "/api/mcp_tools", { name: "Bad Name!" });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// promptGroups.ts branches
// ---------------------------------------------------------------------------

describe("promptGroups route — branch coverage", () => {
  it("GET /api/prompt-groups/:id returns 404 for unknown group", async () => {
    const res = await req("GET", "/api/prompt-groups/nope");
    expect(res.status).toBe(404);
  });

  it("PATCH /api/prompt-groups/:id returns 404 for unknown group", async () => {
    const res = await req("PATCH", "/api/prompt-groups/nope", { name: "x" });
    expect(res.status).toBe(404);
  });

  it("DELETE /api/prompt-groups/:id returns 404 for unknown group", async () => {
    const res = await req("DELETE", "/api/prompt-groups/nope");
    expect(res.status).toBe(404);
  });

  it("POST /api/prompt-groups/reorder returns 400 when a group id does not exist", async () => {
    const res = await req("POST", "/api/prompt-groups/reorder", { ids: ["ghost"] });
    expect(res.status).toBe(400);
  });

  it("POST /api/prompt-groups creates group with prompt_ids", async () => {
    const prompt = makePrompt(testDb.db);
    const res = await req("POST", "/api/prompt-groups", {
      name: "my-group",
      prompt_ids: [prompt.id],
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { prompts: { id: string }[] };
    expect(body.prompts.some((p) => p.id === prompt.id)).toBe(true);
  });

  it("POST /api/prompt-groups returns 400 when a prompt_id does not exist", async () => {
    const res = await req("POST", "/api/prompt-groups", {
      name: "bad-group",
      prompt_ids: ["ghost"],
    });
    expect(res.status).toBe(400);
  });

  it("PUT /api/prompt-groups/:id/prompts returns 400 when a prompt id does not exist", async () => {
    const res1 = await req("POST", "/api/prompt-groups", { name: "grp-set" });
    const created = (await res1.json()) as { id: string };
    const res = await req("PUT", `/api/prompt-groups/${created.id}/prompts`, {
      prompt_ids: ["ghost"],
    });
    expect(res.status).toBe(400);
  });

  it("PUT /api/prompt-groups/:id/prompts returns 404 for unknown group", async () => {
    const res = await req("PUT", "/api/prompt-groups/nope/prompts", {
      prompt_ids: [],
    });
    expect(res.status).toBe(404);
  });

  it("POST /api/prompt-groups/:id/prompts returns 404 when group does not exist", async () => {
    const prompt = makePrompt(testDb.db);
    const res = await req("POST", "/api/prompt-groups/nope/prompts", {
      prompt_id: prompt.id,
    });
    expect(res.status).toBe(404);
  });

  it("POST /api/prompt-groups/:id/prompts returns 404 when prompt does not exist", async () => {
    const res1 = await req("POST", "/api/prompt-groups", { name: "grp-add" });
    const created = (await res1.json()) as { id: string };
    const res = await req("POST", `/api/prompt-groups/${created.id}/prompts`, {
      prompt_id: "ghost",
    });
    expect(res.status).toBe(404);
  });

  it("DELETE /api/prompt-groups/:id/prompts/:promptId returns 404 when group does not exist", async () => {
    const prompt = makePrompt(testDb.db);
    const res = await req(
      "DELETE",
      `/api/prompt-groups/nope/prompts/${prompt.id}`
    );
    expect(res.status).toBe(404);
  });

  it("full group lifecycle: create, add prompt, remove prompt, delete", async () => {
    const prompt = makePrompt(testDb.db);

    // Create
    const created = await req("POST", "/api/prompt-groups", { name: "life-grp" });
    expect(created.status).toBe(201);
    const group = (await created.json()) as { id: string };

    // Add prompt
    const added = await req("POST", `/api/prompt-groups/${group.id}/prompts`, {
      prompt_id: prompt.id,
    });
    expect(added.status).toBe(200);

    // Remove prompt
    const removed = await req(
      "DELETE",
      `/api/prompt-groups/${group.id}/prompts/${prompt.id}`
    );
    expect(removed.status).toBe(200);

    // Delete group
    const del = await req("DELETE", `/api/prompt-groups/${group.id}`);
    expect(del.status).toBe(200);
  });

  it("POST /api/prompt-groups/reorder reorders groups", async () => {
    const g1 = await req("POST", "/api/prompt-groups", { name: "reorder-a" });
    const g2 = await req("POST", "/api/prompt-groups", { name: "reorder-b" });
    const id1 = ((await g1.json()) as { id: string }).id;
    const id2 = ((await g2.json()) as { id: string }).id;

    const res = await req("POST", "/api/prompt-groups/reorder", {
      ids: [id2, id1],
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// settings.ts branches
// ---------------------------------------------------------------------------

describe("settings route — branch coverage", () => {
  it("GET /api/settings/:key returns 404 for unknown key", async () => {
    const res = await req("GET", "/api/settings/nonexistent-key");
    expect(res.status).toBe(404);
  });

  it("GET /api/settings with prefix filter", async () => {
    // Set a setting first, then query with its prefix
    await req("PUT", "/api/settings/ui.theme", { value: "dark" });
    const res = await req("GET", "/api/settings?prefix=ui.");
    expect(res.status).toBe(200);
    const list = (await res.json()) as { key: string }[];
    expect(list.some((s) => s.key === "ui.theme")).toBe(true);
  });

  it("PUT /api/settings/:key creates and retrieves setting", async () => {
    const res = await req("PUT", "/api/settings/test.key", { value: "hello" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { key: string; value: string };
    expect(body.key).toBe("test.key");
    expect(body.value).toBe("hello");
  });

  it("DELETE /api/settings/:key deletes setting", async () => {
    await req("PUT", "/api/settings/del.key", { value: "bye" });
    const res = await req("DELETE", "/api/settings/del.key");
    expect(res.status).toBe(200);
    const gone = await req("GET", "/api/settings/del.key");
    expect(gone.status).toBe(404);
  });

  it("POST /api/settings/bulk upserts multiple settings", async () => {
    const res = await req("POST", "/api/settings/bulk", {
      entries: { "bulk.a": "1", "bulk.b": "2" },
    });
    expect(res.status).toBe(200);
    const list = (await res.json()) as { key: string }[];
    expect(list.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// tasks.ts route branches
// ---------------------------------------------------------------------------

describe("tasks route — branch coverage", () => {
  it("GET /api/boards/:boardId/tasks returns 404 for unknown board", async () => {
    const res = await req("GET", "/api/boards/nope/tasks");
    expect(res.status).toBe(404);
  });

  it("POST /api/boards/:boardId/tasks returns 404 for unknown board", async () => {
    const res = await req("POST", "/api/boards/nope/tasks", {
      column_id: "x",
      title: "t",
    });
    expect(res.status).toBe(404);
  });

  it("POST /api/boards/:boardId/tasks returns 400 when column does not belong to board", async () => {
    const board1 = makeBoard(testDb.db);
    const board2 = makeBoard(testDb.db);
    const col2 = makeColumn(testDb.db, { board_id: board2.id });
    const res = await req("POST", `/api/boards/${board1.id}/tasks`, {
      column_id: col2.id,
      title: "wrong board task",
    });
    expect(res.status).toBe(400);
  });

  it("GET /api/tasks/:id returns 404 for unknown task", async () => {
    const res = await req("GET", "/api/tasks/nope");
    expect(res.status).toBe(404);
  });

  it("GET /api/tasks/:id/with-location returns 404 for unknown task", async () => {
    const res = await req("GET", "/api/tasks/nope/with-location");
    expect(res.status).toBe(404);
  });

  it("GET /api/tasks/:id/context returns 404 for unknown task", async () => {
    const res = await req("GET", "/api/tasks/nope/context");
    expect(res.status).toBe(404);
  });

  it("GET /api/tasks/:id/bundle returns 404 for unknown task", async () => {
    const res = await req("GET", "/api/tasks/nope/bundle");
    expect(res.status).toBe(404);
  });

  it("GET /api/tasks/search returns 400 for invalid query params", async () => {
    const res = await req("GET", "/api/tasks/search?limit=notanumber");
    expect(res.status).toBe(400);
  });

  it("PATCH /api/tasks/:id returns 404 for unknown task", async () => {
    const res = await req("PATCH", "/api/tasks/nope", { title: "x" });
    expect(res.status).toBe(404);
  });

  it("DELETE /api/tasks/:id returns 404 for unknown task", async () => {
    const res = await req("DELETE", "/api/tasks/nope");
    expect(res.status).toBe(404);
  });

  it("PUT /api/tasks/:id/role returns 404 when task does not exist", async () => {
    const res = await req("PUT", "/api/tasks/nope/role", { role_id: null });
    expect(res.status).toBe(404);
  });

  it("PUT /api/tasks/:id/role returns 404 when role does not exist", async () => {
    const board = makeBoard(testDb.db);
    const col = makeColumn(testDb.db, { board_id: board.id });
    const task = makeTask(testDb.db, { column_id: col.id });
    const res = await req("PUT", `/api/tasks/${task.id}/role`, {
      role_id: "ghost",
    });
    expect(res.status).toBe(404);
  });

  it("PUT /api/tasks/:id/role with null clears role", async () => {
    const role = makeRole(testDb.db);
    const board = makeBoard(testDb.db);
    const col = makeColumn(testDb.db, { board_id: board.id });
    const task = makeTask(testDb.db, { column_id: col.id, role_id: role.id });
    const res = await req("PUT", `/api/tasks/${task.id}/role`, { role_id: null });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { role_id: string | null };
    expect(body.role_id).toBeNull();
  });

  it("POST /api/tasks/:id/prompts returns 404 when task does not exist", async () => {
    const prompt = makePrompt(testDb.db);
    const res = await req("POST", "/api/tasks/nope/prompts", {
      prompt_id: prompt.id,
    });
    expect(res.status).toBe(404);
  });

  it("POST /api/tasks/:id/prompts returns 404 when prompt does not exist", async () => {
    const board = makeBoard(testDb.db);
    const col = makeColumn(testDb.db, { board_id: board.id });
    const task = makeTask(testDb.db, { column_id: col.id });
    const res = await req("POST", `/api/tasks/${task.id}/prompts`, {
      prompt_id: "ghost",
    });
    expect(res.status).toBe(404);
  });

  it("DELETE /api/tasks/:id/prompts/:promptId returns 404 when task does not exist", async () => {
    const res = await req("DELETE", "/api/tasks/nope/prompts/ghost");
    expect(res.status).toBe(404);
  });

  it("DELETE /api/tasks/:id/prompts/:promptId returns 404 when prompt not attached", async () => {
    const board = makeBoard(testDb.db);
    const col = makeColumn(testDb.db, { board_id: board.id });
    const task = makeTask(testDb.db, { column_id: col.id });
    const prompt = makePrompt(testDb.db);
    const res = await req(
      "DELETE",
      `/api/tasks/${task.id}/prompts/${prompt.id}`
    );
    expect(res.status).toBe(404);
  });

  it("DELETE /api/tasks/:id/prompts/:promptId returns 403 when prompt is role-inherited", async () => {
    const role = makeRole(testDb.db);
    const prompt = makePrompt(testDb.db);

    const board = makeBoard(testDb.db);
    const col = makeColumn(testDb.db, { board_id: board.id });
    const task = makeTask(testDb.db, { column_id: col.id, role_id: role.id });

    // Insert the task_prompt row with a role-origin directly so the 403 guard fires
    testDb.db
      .prepare(
        "INSERT INTO task_prompts (task_id, prompt_id, origin, position) VALUES (?, ?, ?, 0)"
      )
      .run(task.id, prompt.id, `role:${role.id}`);

    const res = await req(
      "DELETE",
      `/api/tasks/${task.id}/prompts/${prompt.id}`
    );
    expect(res.status).toBe(403);
  });

  it("POST /api/tasks/:id/skills returns 404 when task does not exist", async () => {
    const res = await req("POST", "/api/tasks/nope/skills", { skill_id: "x" });
    expect(res.status).toBe(404);
  });

  it("POST /api/tasks/:id/skills returns 404 when skill does not exist", async () => {
    const board = makeBoard(testDb.db);
    const col = makeColumn(testDb.db, { board_id: board.id });
    const task = makeTask(testDb.db, { column_id: col.id });
    const res = await req("POST", `/api/tasks/${task.id}/skills`, {
      skill_id: "ghost",
    });
    expect(res.status).toBe(404);
  });

  it("DELETE /api/tasks/:id/skills/:skillId returns 404 when task does not exist", async () => {
    const res = await req("DELETE", "/api/tasks/nope/skills/ghost");
    expect(res.status).toBe(404);
  });

  it("DELETE /api/tasks/:id/skills/:skillId returns 404 when skill not attached", async () => {
    const board = makeBoard(testDb.db);
    const col = makeColumn(testDb.db, { board_id: board.id });
    const task = makeTask(testDb.db, { column_id: col.id });
    const res1 = await req("POST", "/api/skills", { name: "sk-test" });
    const skill = (await res1.json()) as { id: string };
    const res = await req("DELETE", `/api/tasks/${task.id}/skills/${skill.id}`);
    expect(res.status).toBe(404);
  });

  it("DELETE /api/tasks/:id/skills/:skillId returns 403 when skill is role-inherited", async () => {
    const role = makeRole(testDb.db);
    const res1 = await req("POST", "/api/skills", { name: "sk-inh" });
    const skill = (await res1.json()) as { id: string };

    const board = makeBoard(testDb.db);
    const col = makeColumn(testDb.db, { board_id: board.id });
    const task = makeTask(testDb.db, { column_id: col.id, role_id: role.id });

    // Insert the task_skill row with a role-origin directly
    testDb.db
      .prepare(
        "INSERT INTO task_skills (task_id, skill_id, origin, position) VALUES (?, ?, ?, 0)"
      )
      .run(task.id, skill.id, `role:${role.id}`);

    const res = await req("DELETE", `/api/tasks/${task.id}/skills/${skill.id}`);
    expect(res.status).toBe(403);
  });

  it("POST /api/tasks/:id/mcp_tools returns 404 when task does not exist", async () => {
    const res = await req("POST", "/api/tasks/nope/mcp_tools", {
      mcp_tool_id: "x",
    });
    expect(res.status).toBe(404);
  });

  it("POST /api/tasks/:id/mcp_tools returns 404 when mcp_tool does not exist", async () => {
    const board = makeBoard(testDb.db);
    const col = makeColumn(testDb.db, { board_id: board.id });
    const task = makeTask(testDb.db, { column_id: col.id });
    const res = await req("POST", `/api/tasks/${task.id}/mcp_tools`, {
      mcp_tool_id: "ghost",
    });
    expect(res.status).toBe(404);
  });

  it("DELETE /api/tasks/:id/mcp_tools/:mcpToolId returns 404 when task does not exist", async () => {
    const res = await req("DELETE", "/api/tasks/nope/mcp_tools/ghost");
    expect(res.status).toBe(404);
  });

  it("DELETE /api/tasks/:id/mcp_tools/:mcpToolId returns 404 when tool not attached", async () => {
    const board = makeBoard(testDb.db);
    const col = makeColumn(testDb.db, { board_id: board.id });
    const task = makeTask(testDb.db, { column_id: col.id });
    const res1 = await req("POST", "/api/mcp_tools", { name: "mcp-tst" });
    const tool = (await res1.json()) as { id: string };
    const res = await req("DELETE", `/api/tasks/${task.id}/mcp_tools/${tool.id}`);
    expect(res.status).toBe(404);
  });

  it("DELETE /api/tasks/:id/mcp_tools/:mcpToolId returns 403 when tool is role-inherited", async () => {
    const role = makeRole(testDb.db);
    const res1 = await req("POST", "/api/mcp_tools", { name: "mcp-inh" });
    const tool = (await res1.json()) as { id: string };

    const board = makeBoard(testDb.db);
    const col = makeColumn(testDb.db, { board_id: board.id });
    const task = makeTask(testDb.db, { column_id: col.id, role_id: role.id });

    // Insert the task_mcp_tool row with a role-origin directly
    testDb.db
      .prepare(
        "INSERT INTO task_mcp_tools (task_id, mcp_tool_id, origin, position) VALUES (?, ?, ?, 0)"
      )
      .run(task.id, tool.id, `role:${role.id}`);

    const res = await req("DELETE", `/api/tasks/${task.id}/mcp_tools/${tool.id}`);
    expect(res.status).toBe(403);
  });

  it("GET /api/boards/:boardId/tasks with column_id filter returns only that column", async () => {
    const board = makeBoard(testDb.db);
    const col1 = makeColumn(testDb.db, { board_id: board.id, position: 0 });
    const col2 = makeColumn(testDb.db, { board_id: board.id, position: 1 });
    makeTask(testDb.db, { column_id: col1.id, title: "task-in-col1" });
    makeTask(testDb.db, { column_id: col2.id, title: "task-in-col2" });

    const res = await req(
      "GET",
      `/api/boards/${board.id}/tasks?column_id=${col1.id}`
    );
    expect(res.status).toBe(200);
    const tasks = (await res.json()) as { column_id: string }[];
    expect(tasks.every((t) => t.column_id === col1.id)).toBe(true);
  });

  it("task bundle GET returns XML for valid task", async () => {
    const board = makeBoard(testDb.db);
    const col = makeColumn(testDb.db, { board_id: board.id });
    const task = makeTask(testDb.db, { column_id: col.id, title: "my-task" });
    const res = await req("GET", `/api/tasks/${task.id}/bundle`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/xml");
    const text = await res.text();
    expect(text).toContain("my-task");
  });
});

// ---------------------------------------------------------------------------
// bridges.ts branches
// ---------------------------------------------------------------------------

describe("bridges route — branch coverage", () => {
  it("POST /api/bridges/:id/heartbeat returns 404 for unknown bridge", async () => {
    const res = await req("POST", "/api/bridges/nope/heartbeat", {});
    expect(res.status).toBe(404);
  });

  it("POST /api/bridges/register creates a bridge entry", async () => {
    const res = await req("POST", "/api/bridges/register", {
      pid: 1234,
      agent_hint: null,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBeTruthy();
  });

  it("full bridge lifecycle: register, heartbeat, unregister", async () => {
    const reg = await req("POST", "/api/bridges/register", {
      pid: 5678,
      agent_hint: "test-agent",
    });
    expect(reg.status).toBe(201);
    const bridge = (await reg.json()) as { id: string };

    const hb = await req("POST", `/api/bridges/${bridge.id}/heartbeat`, {});
    expect(hb.status).toBe(200);

    const unreg = await req("POST", `/api/bridges/${bridge.id}/unregister`, {});
    expect(unreg.status).toBe(200);
  });
});
