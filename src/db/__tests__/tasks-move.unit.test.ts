import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Task } from "../queries/tasks.js";
import { moveTask } from "../queries/tasks.js";
import { createTestDb, type TestDb } from "./helpers/testDb.js";
import {
  makeBoard,
  makeColumn,
  makePrompt,
  makeRole,
  makeTask,
} from "./helpers/factories.js";

/**
 * Cross-board move semantics — see CHANGELOG and the `move_task` MCP tool
 * description. Task-owned data (role_id, task_prompts) travels with the task;
 * inherited context (board/column-level) does not. The denormalised
 * `tasks.board_id` must be kept in sync with the target column's board so
 * per-board listings remain consistent.
 */
describe("moveTask across boards", () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it("moves task to a column on a different board and updates board_id", () => {
    const { db } = testDb;
    const board1 = makeBoard(db, { name: "Board 1" });
    const col1 = makeColumn(db, { board_id: board1.id });
    const task = makeTask(db, { column_id: col1.id, title: "movable" });

    const board2 = makeBoard(db, { name: "Board 2" });
    const col2 = makeColumn(db, { board_id: board2.id });

    const result = moveTask(db, task.id, col2.id);

    expect(result?.column_id).toBe(col2.id);
    expect(result?.board_id).toBe(board2.id);

    const reloaded = db.prepare("SELECT * FROM tasks WHERE id = ?").get(task.id) as Task;
    expect(reloaded.column_id).toBe(col2.id);
    expect(reloaded.board_id).toBe(board2.id);
  });

  it("keeps task-level role_id when moving across boards", () => {
    const { db } = testDb;
    const role = makeRole(db, { name: "backend" });
    const board1 = makeBoard(db);
    const col1 = makeColumn(db, { board_id: board1.id });
    const task = makeTask(db, { column_id: col1.id, role_id: role.id });

    const board2 = makeBoard(db);
    const col2 = makeColumn(db, { board_id: board2.id });

    moveTask(db, task.id, col2.id);

    const reloaded = db.prepare("SELECT * FROM tasks WHERE id = ?").get(task.id) as Task;
    expect(reloaded.role_id).toBe(role.id);
  });

  it("leaves NULL role_id alone when moving across boards", () => {
    const { db } = testDb;
    const board1 = makeBoard(db);
    const col1 = makeColumn(db, { board_id: board1.id });
    const task = makeTask(db, { column_id: col1.id, role_id: null });

    const board2 = makeBoard(db);
    const col2 = makeColumn(db, { board_id: board2.id });

    moveTask(db, task.id, col2.id);

    const reloaded = db.prepare("SELECT * FROM tasks WHERE id = ?").get(task.id) as Task;
    expect(reloaded.role_id).toBeNull();
  });

  it("keeps direct task_prompts when moving across boards", () => {
    const { db } = testDb;
    const board1 = makeBoard(db);
    const col1 = makeColumn(db, { board_id: board1.id });
    const task = makeTask(db, { column_id: col1.id });
    const prompt = makePrompt(db, { name: "test-prompt" });
    db.prepare(
      "INSERT INTO task_prompts (task_id, prompt_id, origin) VALUES (?, ?, 'direct')"
    ).run(task.id, prompt.id);

    const board2 = makeBoard(db);
    const col2 = makeColumn(db, { board_id: board2.id });

    moveTask(db, task.id, col2.id);

    const directPrompts = db
      .prepare("SELECT * FROM task_prompts WHERE task_id = ? AND origin = 'direct'")
      .all(task.id);
    expect(directPrompts).toHaveLength(1);
  });

  it("returns null for a non-existent target column", () => {
    const { db } = testDb;
    const board = makeBoard(db);
    const col = makeColumn(db, { board_id: board.id });
    const task = makeTask(db, { column_id: col.id });

    expect(moveTask(db, task.id, "does-not-exist")).toBeNull();
  });

  it("appends to end of target column when position is omitted", () => {
    const { db } = testDb;
    const board1 = makeBoard(db);
    const col1 = makeColumn(db, { board_id: board1.id });
    const task = makeTask(db, { column_id: col1.id });

    const board2 = makeBoard(db);
    const col2 = makeColumn(db, { board_id: board2.id });
    makeTask(db, { column_id: col2.id, position: 1000 });
    makeTask(db, { column_id: col2.id, position: 2000 });

    moveTask(db, task.id, col2.id);

    const reloaded = db.prepare("SELECT * FROM tasks WHERE id = ?").get(task.id) as Task;
    expect(reloaded.column_id).toBe(col2.id);
    expect(reloaded.position).toBeGreaterThan(2000);
  });

  it("uses provided position verbatim", () => {
    const { db } = testDb;
    const board1 = makeBoard(db);
    const col1 = makeColumn(db, { board_id: board1.id });
    const task = makeTask(db, { column_id: col1.id });

    const board2 = makeBoard(db);
    const col2 = makeColumn(db, { board_id: board2.id });

    moveTask(db, task.id, col2.id, 42.5);

    const reloaded = db.prepare("SELECT * FROM tasks WHERE id = ?").get(task.id) as Task;
    expect(reloaded.position).toBe(42.5);
  });
});

describe("moveTask within same board (regression)", () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it("still works for same-board moves", () => {
    const { db } = testDb;
    const board = makeBoard(db);
    const col1 = makeColumn(db, { board_id: board.id, position: 0 });
    const col2 = makeColumn(db, { board_id: board.id, position: 1 });
    const task = makeTask(db, { column_id: col1.id });

    moveTask(db, task.id, col2.id, 5);

    const reloaded = db.prepare("SELECT * FROM tasks WHERE id = ?").get(task.id) as Task;
    expect(reloaded.column_id).toBe(col2.id);
    expect(reloaded.board_id).toBe(board.id);
    expect(reloaded.position).toBe(5);
  });
});
