import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createApp } from "../index.js";
import { _setDbForTesting } from "../../db/index.js";
import { createTestDb, type TestDb } from "../../db/__tests__/helpers/testDb.js";
import { makeBoard, makeColumn, makeTask, makePrompt, makeRole } from "../../db/__tests__/helpers/factories.js";
import type { Database } from "better-sqlite3";

/**
 * Integration tests for POST /api/tasks/:id/move-with-resolution.
 * Covers each combination of role_handling and prompt_handling strategies.
 */
describe("POST /api/tasks/:id/move-with-resolution", () => {
  let testDb: TestDb;
  let db: Database;
  let app: ReturnType<typeof createApp>["app"];

  beforeEach(() => {
    testDb = createTestDb();
    db = testDb.db;
    _setDbForTesting(db);
    app = createApp().app;
  });

  afterEach(() => {
    _setDbForTesting(null);
    testDb.close();
  });

  async function moveWithResolution(
    taskId: string,
    body: Record<string, unknown>
  ): Promise<Response> {
    return app.fetch(
      new Request(`http://test/api/tasks/${taskId}/move-with-resolution`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  }

  function getTask(id: string) {
    return db
      .prepare("SELECT * FROM tasks WHERE id = ?")
      .get(id) as { role_id: string | null; board_id: string; column_id: string } | undefined;
  }

  function getTaskPrompts(taskId: string) {
    return db
      .prepare(
        "SELECT prompt_id, origin FROM task_prompts WHERE task_id = ? ORDER BY position"
      )
      .all(taskId) as { prompt_id: string; origin: string }[];
  }

  function getBoardPrompts(boardId: string) {
    return db
      .prepare("SELECT prompt_id FROM board_prompts WHERE board_id = ?")
      .all(boardId) as { prompt_id: string }[];
  }

  function getBoardRole(boardId: string) {
    return (
      db.prepare("SELECT role_id FROM boards WHERE id = ?").get(boardId) as {
        role_id: string | null;
      } | undefined
    )?.role_id ?? null;
  }

  // ---- Prerequisite: basic move works ------------------------------------

  it("returns 200 and moves the task cross-board with defaults (keep/keep)", async () => {
    const board1 = makeBoard(db);
    const col1 = makeColumn(db, { board_id: board1.id });
    const board2 = makeBoard(db);
    const col2 = makeColumn(db, { board_id: board2.id });
    const task = makeTask(db, { column_id: col1.id });

    const res = await moveWithResolution(task.id, { column_id: col2.id });
    expect(res.status).toBe(200);

    const moved = getTask(task.id)!;
    expect(moved.board_id).toBe(board2.id);
    expect(moved.column_id).toBe(col2.id);
  });

  it("returns 404 for unknown task", async () => {
    const board = makeBoard(db);
    const col = makeColumn(db, { board_id: board.id });
    const res = await moveWithResolution("nope", { column_id: col.id });
    expect(res.status).toBe(404);
  });

  it("returns 404 for unknown target column", async () => {
    const board = makeBoard(db);
    const col = makeColumn(db, { board_id: board.id });
    const task = makeTask(db, { column_id: col.id });
    const res = await moveWithResolution(task.id, { column_id: "nope" });
    expect(res.status).toBe(404);
  });

  // ---- role_handling: detach --------------------------------------------

  it("role_handling=detach clears role_id and strips role-origin primitives after move", async () => {
    const board1 = makeBoard(db);
    const col1 = makeColumn(db, { board_id: board1.id });
    const board2 = makeBoard(db);
    const col2 = makeColumn(db, { board_id: board2.id });

    const role = makeRole(db);
    const prompt = makePrompt(db);
    // Seed role's prompt into role_prompts and task_prompts with role origin.
    db.prepare("INSERT INTO role_prompts (role_id, prompt_id, position) VALUES (?, ?, 0)").run(
      role.id,
      prompt.id
    );
    const task = makeTask(db, { column_id: col1.id, role_id: role.id });
    db.prepare(
      "INSERT INTO task_prompts (task_id, prompt_id, origin, position) VALUES (?, ?, ?, 0)"
    ).run(task.id, prompt.id, `role:${role.id}`);

    const res = await moveWithResolution(task.id, {
      column_id: col2.id,
      role_handling: "detach",
    });
    expect(res.status).toBe(200);

    const moved = getTask(task.id)!;
    expect(moved.role_id).toBeNull();

    const prompts = getTaskPrompts(task.id);
    expect(prompts).toHaveLength(0);
  });

  it("role_handling=keep preserves role_id after cross-board move", async () => {
    const board1 = makeBoard(db);
    const col1 = makeColumn(db, { board_id: board1.id });
    const board2 = makeBoard(db);
    const col2 = makeColumn(db, { board_id: board2.id });

    const role = makeRole(db);
    const task = makeTask(db, { column_id: col1.id, role_id: role.id });

    const res = await moveWithResolution(task.id, {
      column_id: col2.id,
      role_handling: "keep",
    });
    expect(res.status).toBe(200);

    const moved = getTask(task.id)!;
    expect(moved.role_id).toBe(role.id);
  });

  // ---- role_handling: copy_to_target_board --------------------------------

  it("role_handling=copy_to_target_board sets board role when target board has none", async () => {
    const board1 = makeBoard(db);
    const col1 = makeColumn(db, { board_id: board1.id });
    const board2 = makeBoard(db); // role_id is null
    const col2 = makeColumn(db, { board_id: board2.id });

    const role = makeRole(db);
    const prompt = makePrompt(db);
    db.prepare("INSERT INTO role_prompts (role_id, prompt_id, position) VALUES (?, ?, 0)").run(
      role.id,
      prompt.id
    );
    const task = makeTask(db, { column_id: col1.id, role_id: role.id });

    const res = await moveWithResolution(task.id, {
      column_id: col2.id,
      role_handling: "copy_to_target_board",
    });
    expect(res.status).toBe(200);

    expect(getBoardRole(board2.id)).toBe(role.id);
    const boardPrompts = getBoardPrompts(board2.id);
    expect(boardPrompts.map((p) => p.prompt_id)).toContain(prompt.id);
  });

  it("role_handling=copy_to_target_board does NOT overwrite an existing board role", async () => {
    const board1 = makeBoard(db);
    const col1 = makeColumn(db, { board_id: board1.id });
    const existingRole = makeRole(db, { name: "existing" });
    const board2 = makeBoard(db, { role_id: existingRole.id }); // already has role
    const col2 = makeColumn(db, { board_id: board2.id });

    const newRole = makeRole(db, { name: "new" });
    const task = makeTask(db, { column_id: col1.id, role_id: newRole.id });

    const res = await moveWithResolution(task.id, {
      column_id: col2.id,
      role_handling: "copy_to_target_board",
    });
    expect(res.status).toBe(200);

    // Board role should remain unchanged.
    expect(getBoardRole(board2.id)).toBe(existingRole.id);
  });

  // ---- prompt_handling: detach ------------------------------------------

  it("prompt_handling=detach removes direct-origin prompts after move", async () => {
    const board1 = makeBoard(db);
    const col1 = makeColumn(db, { board_id: board1.id });
    const board2 = makeBoard(db);
    const col2 = makeColumn(db, { board_id: board2.id });

    const prompt = makePrompt(db);
    const task = makeTask(db, { column_id: col1.id });
    db.prepare(
      "INSERT INTO task_prompts (task_id, prompt_id, origin, position) VALUES (?, ?, 'direct', 0)"
    ).run(task.id, prompt.id);

    const res = await moveWithResolution(task.id, {
      column_id: col2.id,
      prompt_handling: "detach",
    });
    expect(res.status).toBe(200);

    const prompts = getTaskPrompts(task.id);
    expect(prompts).toHaveLength(0);
  });

  // ---- prompt_handling: copy_to_target_board ----------------------------

  it("prompt_handling=copy_to_target_board attaches direct prompts to target board", async () => {
    const board1 = makeBoard(db);
    const col1 = makeColumn(db, { board_id: board1.id });
    const board2 = makeBoard(db);
    const col2 = makeColumn(db, { board_id: board2.id });

    const prompt = makePrompt(db);
    const task = makeTask(db, { column_id: col1.id });
    db.prepare(
      "INSERT INTO task_prompts (task_id, prompt_id, origin, position) VALUES (?, ?, 'direct', 0)"
    ).run(task.id, prompt.id);

    const res = await moveWithResolution(task.id, {
      column_id: col2.id,
      prompt_handling: "copy_to_target_board",
    });
    expect(res.status).toBe(200);

    // Prompt should now appear in target board's board_prompts.
    const boardPrompts = getBoardPrompts(board2.id);
    expect(boardPrompts.map((p) => p.prompt_id)).toContain(prompt.id);

    // Task still retains the direct prompt.
    const taskPrompts = getTaskPrompts(task.id);
    expect(taskPrompts.some((p) => p.prompt_id === prompt.id && p.origin === "direct")).toBe(true);
  });

  // ---- combined: both resolution strategies active -----------------------

  it("detach/detach clears both role and direct prompts", async () => {
    const board1 = makeBoard(db);
    const col1 = makeColumn(db, { board_id: board1.id });
    const board2 = makeBoard(db);
    const col2 = makeColumn(db, { board_id: board2.id });

    const role = makeRole(db);
    const prompt = makePrompt(db);
    const task = makeTask(db, { column_id: col1.id, role_id: role.id });
    db.prepare(
      "INSERT INTO task_prompts (task_id, prompt_id, origin, position) VALUES (?, ?, 'direct', 0)"
    ).run(task.id, prompt.id);

    const res = await moveWithResolution(task.id, {
      column_id: col2.id,
      role_handling: "detach",
      prompt_handling: "detach",
    });
    expect(res.status).toBe(200);

    const moved = getTask(task.id)!;
    expect(moved.role_id).toBeNull();
    expect(getTaskPrompts(task.id)).toHaveLength(0);
  });

  it("copy_to_target_board/copy_to_target_board propagates both to target board", async () => {
    const board1 = makeBoard(db);
    const col1 = makeColumn(db, { board_id: board1.id });
    const board2 = makeBoard(db);
    const col2 = makeColumn(db, { board_id: board2.id });

    const role = makeRole(db);
    const rolePrompt = makePrompt(db, { name: "role-prompt" });
    const directPrompt = makePrompt(db, { name: "direct-prompt" });
    db.prepare("INSERT INTO role_prompts (role_id, prompt_id, position) VALUES (?, ?, 0)").run(
      role.id,
      rolePrompt.id
    );
    const task = makeTask(db, { column_id: col1.id, role_id: role.id });
    db.prepare(
      "INSERT INTO task_prompts (task_id, prompt_id, origin, position) VALUES (?, ?, 'direct', 0)"
    ).run(task.id, directPrompt.id);

    const res = await moveWithResolution(task.id, {
      column_id: col2.id,
      role_handling: "copy_to_target_board",
      prompt_handling: "copy_to_target_board",
    });
    expect(res.status).toBe(200);

    // Board should have both role's prompt and task's direct prompt.
    const boardPromptIds = getBoardPrompts(board2.id).map((p) => p.prompt_id);
    expect(boardPromptIds).toContain(rolePrompt.id);
    expect(boardPromptIds).toContain(directPrompt.id);

    // Board should have the role assigned.
    expect(getBoardRole(board2.id)).toBe(role.id);
  });

  // ---- position argument is forwarded -----------------------------------

  it("respects explicit position argument", async () => {
    const board1 = makeBoard(db);
    const col1 = makeColumn(db, { board_id: board1.id });
    const board2 = makeBoard(db);
    const col2 = makeColumn(db, { board_id: board2.id });
    const task = makeTask(db, { column_id: col1.id });

    const res = await moveWithResolution(task.id, { column_id: col2.id, position: 42 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { position: number };
    expect(body.position).toBe(42);
  });

  // ---- same-board moves still work --------------------------------------

  it("same-board column move with resolution strategies works (regression)", async () => {
    const board = makeBoard(db);
    const col1 = makeColumn(db, { board_id: board.id, position: 0 });
    const col2 = makeColumn(db, { board_id: board.id, position: 1 });
    const role = makeRole(db);
    const task = makeTask(db, { column_id: col1.id, role_id: role.id });

    const res = await moveWithResolution(task.id, {
      column_id: col2.id,
      role_handling: "keep",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { column_id: string; board_id: string };
    expect(body.column_id).toBe(col2.id);
    expect(body.board_id).toBe(board.id);
  });
});
