import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createBoard, setBoardRole } from "../../queries/boards.js";
import { createColumn, setColumnRole, listColumns } from "../../queries/columns.js";
import { createTask, setTaskRole } from "../../queries/tasks.js";
import { createRole, setRolePrompts } from "../../queries/roles.js";
import { createPrompt } from "../../queries/prompts.js";
import { addTaskPrompt } from "../../queries/taskPrompts.js";
import { setBoardPrompts } from "../../queries/boardPrompts.js";
import { setColumnPrompts } from "../../queries/columnPrompts.js";
import { createTestDb } from "../../queries/__tests__/helpers.js";
import { resolveTaskContext } from "../resolveTaskContext.js";

function firstColumnId(db: Database.Database, boardId: string): string {
  return listColumns(db, boardId)[0]!.id;
}

describe("resolveTaskContext — role priority", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("returns null role when none is set on task/column/board", () => {
    const b = createBoard(db, "B");
    const col = firstColumnId(db, b.id);
    const t = createTask(db, b.id, col, { title: "T" });
    const ctx = resolveTaskContext(db, t.id);
    expect(ctx?.role).toBeNull();
    expect(ctx?.prompts).toEqual([]);
  });

  it("prefers task.role over column.role and board.role", () => {
    const b = createBoard(db, "B");
    const col = firstColumnId(db, b.id);
    const t = createTask(db, b.id, col, { title: "T" });
    const rTask = createRole(db, { name: "R-task" });
    const rCol = createRole(db, { name: "R-col" });
    const rBoard = createRole(db, { name: "R-board" });

    setBoardRole(db, b.id, rBoard.id);
    setColumnRole(db, col, rCol.id);
    setTaskRole(db, t.id, rTask.id);

    const ctx = resolveTaskContext(db, t.id);
    expect(ctx?.role?.id).toBe(rTask.id);
    expect(ctx?.role?.source).toBe("task");
  });

  it("falls back to column.role when task has no role", () => {
    const b = createBoard(db, "B");
    const col = firstColumnId(db, b.id);
    const t = createTask(db, b.id, col, { title: "T" });
    const rCol = createRole(db, { name: "R-col" });
    const rBoard = createRole(db, { name: "R-board" });
    setBoardRole(db, b.id, rBoard.id);
    setColumnRole(db, col, rCol.id);

    const ctx = resolveTaskContext(db, t.id);
    expect(ctx?.role?.id).toBe(rCol.id);
    expect(ctx?.role?.source).toBe("column");
  });

  it("falls back to board.role when neither task nor column have one", () => {
    const b = createBoard(db, "B");
    const col = firstColumnId(db, b.id);
    const t = createTask(db, b.id, col, { title: "T" });
    const rBoard = createRole(db, { name: "R-board" });
    setBoardRole(db, b.id, rBoard.id);

    const ctx = resolveTaskContext(db, t.id);
    expect(ctx?.role?.id).toBe(rBoard.id);
    expect(ctx?.role?.source).toBe("board");
  });
});

describe("resolveTaskContext — prompt union", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("collects prompts from all six origins", () => {
    const b = createBoard(db, "B");
    const col = firstColumnId(db, b.id);
    const t = createTask(db, b.id, col, { title: "T" });

    const pDirect = createPrompt(db, { name: "direct-p" });
    const pTaskRole = createPrompt(db, { name: "task-role-p" });
    const pColumn = createPrompt(db, { name: "column-p" });
    const pColRole = createPrompt(db, { name: "col-role-p" });
    const pBoard = createPrompt(db, { name: "board-p" });
    const pBoardRole = createPrompt(db, { name: "board-role-p" });

    const rTask = createRole(db, { name: "R-task" });
    const rCol = createRole(db, { name: "R-col" });
    const rBoard = createRole(db, { name: "R-board" });
    setRolePrompts(db, rTask.id, [pTaskRole.id]);
    setRolePrompts(db, rCol.id, [pColRole.id]);
    setRolePrompts(db, rBoard.id, [pBoardRole.id]);

    addTaskPrompt(db, t.id, pDirect.id, "direct");
    setTaskRole(db, t.id, rTask.id);
    setColumnRole(db, col, rCol.id);
    setBoardRole(db, b.id, rBoard.id);
    setColumnPrompts(db, col, [pColumn.id]);
    setBoardPrompts(db, b.id, [pBoard.id]);

    const ctx = resolveTaskContext(db, t.id);
    const byOrigin = Object.fromEntries(ctx!.prompts.map((p) => [p.origin, p.name]));
    expect(byOrigin).toEqual({
      direct: "direct-p",
      role: "task-role-p",
      column: "column-p",
      "column-role": "col-role-p",
      board: "board-p",
      "board-role": "board-role-p",
    });
  });

  it("deduplicates, keeping the most-specific origin", () => {
    const b = createBoard(db, "B");
    const col = firstColumnId(db, b.id);
    const t = createTask(db, b.id, col, { title: "T" });
    const shared = createPrompt(db, { name: "shared" });

    // Shared prompt sits at both direct (task) and board levels → direct wins.
    addTaskPrompt(db, t.id, shared.id, "direct");
    setBoardPrompts(db, b.id, [shared.id]);

    const ctx = resolveTaskContext(db, t.id);
    expect(ctx?.prompts).toHaveLength(1);
    expect(ctx?.prompts[0]!.origin).toBe("direct");
  });

  it("does not double-count a role assigned at multiple layers", () => {
    const b = createBoard(db, "B");
    const col = firstColumnId(db, b.id);
    const t = createTask(db, b.id, col, { title: "T" });
    const p = createPrompt(db, { name: "role-p" });
    const r = createRole(db, { name: "R-shared" });
    setRolePrompts(db, r.id, [p.id]);

    // The same role is assigned at both the task and the column levels.
    setTaskRole(db, t.id, r.id);
    setColumnRole(db, col, r.id);

    const ctx = resolveTaskContext(db, t.id);
    expect(ctx?.prompts).toHaveLength(1);
    expect(ctx?.prompts[0]!.origin).toBe("role");
  });

  it("sorts the final list by specificity first, then name", () => {
    const b = createBoard(db, "B");
    const col = firstColumnId(db, b.id);
    const t = createTask(db, b.id, col, { title: "T" });
    const pBoardZ = createPrompt(db, { name: "z-board" });
    const pDirectA = createPrompt(db, { name: "a-direct" });
    const pColumnB = createPrompt(db, { name: "b-column" });

    addTaskPrompt(db, t.id, pDirectA.id, "direct");
    setColumnPrompts(db, col, [pColumnB.id]);
    setBoardPrompts(db, b.id, [pBoardZ.id]);

    const ctx = resolveTaskContext(db, t.id);
    const names = ctx!.prompts.map((p) => p.name);
    expect(names).toEqual(["a-direct", "b-column", "z-board"]);
  });

  it("includes source metadata for non-direct prompts", () => {
    const b = createBoard(db, "B");
    const col = firstColumnId(db, b.id);
    const t = createTask(db, b.id, col, { title: "T" });
    const p = createPrompt(db, { name: "x" });
    setBoardPrompts(db, b.id, [p.id]);

    const ctx = resolveTaskContext(db, t.id);
    expect(ctx?.prompts[0]!.source).toEqual({ type: "board", id: b.id, name: "B" });
  });

  it("returns null for an unknown task id", () => {
    expect(resolveTaskContext(db, "nope")).toBeNull();
  });
});
