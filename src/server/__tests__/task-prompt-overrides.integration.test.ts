import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createApp } from "../index.js";
import { _setDbForTesting } from "../../db/index.js";
import { createTestDb, type TestDb } from "../../db/__tests__/helpers/testDb.js";
import { makeBoard, makeColumn, makePrompt, makeTask } from "../../db/__tests__/helpers/factories.js";
import { setBoardPrompts } from "../../db/queries/boardPrompts.js";

/**
 * Integration coverage for the per-task prompt-override HTTP surface.
 *
 * Scenario: a board carries a prompt that flows down into the task via the
 * resolver. The task uses `PUT /prompt-overrides/:promptId { enabled: 0 }`
 * to suppress it locally; `DELETE` reverts. After each transition we hit
 * `/context` and `/bundle` to verify the resolver respected the override.
 */
describe("HTTP API — task prompt overrides integration", () => {
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

  async function fetchJson<T>(method: string, path: string, body?: unknown): Promise<{
    status: number;
    body: T;
  }> {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { "content-type": "application/json" };
      init.body = JSON.stringify(body);
    }
    const res = await app.fetch(new Request(`http://test${path}`, init));
    const status = res.status;
    const json = (await res.json()) as T;
    return { status, body: json };
  }

  function seed() {
    const board = makeBoard(testDb.db, { name: "B" });
    const col = makeColumn(testDb.db, { board_id: board.id, name: "C" });
    const task = makeTask(testDb.db, { column_id: col.id, title: "T" });
    const prompt = makePrompt(testDb.db, { name: "p" });
    setBoardPrompts(testDb.db, board.id, [prompt.id]);
    return { board, col, task, prompt };
  }

  it("PUT enabled=0 suppresses the prompt from /context", async () => {
    const { task, prompt } = seed();

    // Baseline — the board prompt is in the resolved list.
    const before = await fetchJson<{
      prompts: Array<{ id: string }>;
      disabled_prompts: string[];
    }>("GET", `/api/tasks/${task.id}/context`);
    expect(before.body.prompts.map((p) => p.id)).toContain(prompt.id);
    expect(before.body.disabled_prompts).toEqual([]);

    const put = await fetchJson(
      "PUT",
      `/api/tasks/${task.id}/prompt-overrides/${prompt.id}`,
      { enabled: 0 }
    );
    expect(put.status).toBe(200);

    const after = await fetchJson<{
      prompts: Array<{ id: string }>;
      disabled_prompts: string[];
    }>("GET", `/api/tasks/${task.id}/context`);
    expect(after.body.prompts.map((p) => p.id)).not.toContain(prompt.id);
    expect(after.body.disabled_prompts).toEqual([prompt.id]);
  });

  it("DELETE clears the override and the prompt reappears", async () => {
    const { task, prompt } = seed();
    await fetchJson(
      "PUT",
      `/api/tasks/${task.id}/prompt-overrides/${prompt.id}`,
      { enabled: 0 }
    );

    const del = await fetchJson(
      "DELETE",
      `/api/tasks/${task.id}/prompt-overrides/${prompt.id}`
    );
    expect(del.status).toBe(200);

    const ctx = await fetchJson<{
      prompts: Array<{ id: string }>;
      disabled_prompts: string[];
    }>("GET", `/api/tasks/${task.id}/context`);
    expect(ctx.body.prompts.map((p) => p.id)).toContain(prompt.id);
    expect(ctx.body.disabled_prompts).toEqual([]);
  });

  it("PUT returns 404 when the task is unknown", async () => {
    const { prompt } = seed();
    const res = await fetchJson(
      "PUT",
      `/api/tasks/no-such-task/prompt-overrides/${prompt.id}`,
      { enabled: 0 }
    );
    expect(res.status).toBe(404);
  });

  it("PUT returns 404 when the prompt is unknown", async () => {
    const { task } = seed();
    const res = await fetchJson(
      "PUT",
      `/api/tasks/${task.id}/prompt-overrides/no-such-prompt`,
      { enabled: 0 }
    );
    expect(res.status).toBe(404);
  });

  it("PUT rejects an enabled value that isn't 0 or 1", async () => {
    const { task, prompt } = seed();
    const res = await fetchJson(
      "PUT",
      `/api/tasks/${task.id}/prompt-overrides/${prompt.id}`,
      { enabled: 7 }
    );
    expect(res.status).toBe(400);
  });

  it("/bundle XML drops the disabled prompt", async () => {
    const { task, prompt } = seed();
    await fetchJson(
      "PUT",
      `/api/tasks/${task.id}/prompt-overrides/${prompt.id}`,
      { enabled: 0 }
    );

    const res = await app.fetch(
      new Request(`http://test/api/tasks/${task.id}/bundle`)
    );
    expect(res.status).toBe(200);
    const xml = await res.text();
    // The prompt's name comes from the factory ("p"); we reuse the actual
    // value rather than hard-coding.
    expect(xml).not.toContain(`name="${prompt.name}"`);
  });

  it("DELETE on a non-existent override is idempotent (200, not 404)", async () => {
    const { task, prompt } = seed();
    const res = await fetchJson(
      "DELETE",
      `/api/tasks/${task.id}/prompt-overrides/${prompt.id}`
    );
    expect(res.status).toBe(200);
  });
});
