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
import { setOverride } from "../../queries/taskPromptOverrides.js";
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

  it("sorts role prompts by position, not alphabetically", () => {
    // Attach 3 prompts to a role in positions [2, 0, 1].
    // Alphabetical order would be: alpha, bravo, charlie.
    // Position order should be: bravo (pos 0), charlie (pos 1), alpha (pos 2).
    const b = createBoard(db, "B");
    const col = firstColumnId(db, b.id);
    const t = createTask(db, b.id, col, { title: "T" });
    const r = createRole(db, { name: "R" });

    const pAlpha = createPrompt(db, { name: "alpha" });
    const pBravo = createPrompt(db, { name: "bravo" });
    const pCharlie = createPrompt(db, { name: "charlie" });

    // setRolePrompts uses array index as position, so:
    //   index 0 → bravo (position 0)
    //   index 1 → charlie (position 1)
    //   index 2 → alpha (position 2)
    setRolePrompts(db, r.id, [pBravo.id, pCharlie.id, pAlpha.id]);
    setTaskRole(db, t.id, r.id);

    const ctx = resolveTaskContext(db, t.id);
    const names = ctx!.prompts.map((p) => p.name);
    // Expected: position order [bravo, charlie, alpha], not alphabetical [alpha, bravo, charlie].
    expect(names).toEqual(["bravo", "charlie", "alpha"]);
  });
});

describe("resolveTaskContext — per-task prompt overrides", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("filters out a prompt with enabled=0 and surfaces it in disabled_prompts", () => {
    const b = createBoard(db, "B");
    const col = firstColumnId(db, b.id);
    const t = createTask(db, b.id, col, { title: "T" });
    const pBoard = createPrompt(db, { name: "board-p" });
    setBoardPrompts(db, b.id, [pBoard.id]);

    // Sanity: without an override the prompt is in the resolved list.
    let ctx = resolveTaskContext(db, t.id);
    expect(ctx?.prompts.map((p) => p.id)).toContain(pBoard.id);
    expect(ctx?.disabled_prompts).toEqual([]);

    setOverride(db, { taskId: t.id, promptId: pBoard.id, enabled: 0 });

    ctx = resolveTaskContext(db, t.id);
    expect(ctx?.prompts.map((p) => p.id)).not.toContain(pBoard.id);
    expect(ctx?.disabled_prompts).toEqual([pBoard.id]);
  });

  it("does not affect other tasks (per-task isolation)", () => {
    const b = createBoard(db, "B");
    const col = firstColumnId(db, b.id);
    const t1 = createTask(db, b.id, col, { title: "T1" });
    const t2 = createTask(db, b.id, col, { title: "T2" });
    const pBoard = createPrompt(db, { name: "board-p" });
    setBoardPrompts(db, b.id, [pBoard.id]);

    setOverride(db, { taskId: t1.id, promptId: pBoard.id, enabled: 0 });

    const ctx1 = resolveTaskContext(db, t1.id);
    const ctx2 = resolveTaskContext(db, t2.id);

    expect(ctx1?.prompts.map((p) => p.id)).not.toContain(pBoard.id);
    expect(ctx2?.prompts.map((p) => p.id)).toContain(pBoard.id);
  });

  it("treats enabled=1 as default (prompt remains visible)", () => {
    const b = createBoard(db, "B");
    const col = firstColumnId(db, b.id);
    const t = createTask(db, b.id, col, { title: "T" });
    const pBoard = createPrompt(db, { name: "board-p" });
    setBoardPrompts(db, b.id, [pBoard.id]);

    // enabled=1 is reserved; it must not flip the prompt off.
    setOverride(db, { taskId: t.id, promptId: pBoard.id, enabled: 1 });

    const ctx = resolveTaskContext(db, t.id);
    expect(ctx?.prompts.map((p) => p.id)).toContain(pBoard.id);
    expect(ctx?.disabled_prompts).toEqual([]);
  });

  it("silently ignores a stale override (prompt no longer inherited)", () => {
    const b = createBoard(db, "B");
    const col = firstColumnId(db, b.id);
    const t = createTask(db, b.id, col, { title: "T" });
    const pOrphan = createPrompt(db, { name: "orphan-p" });

    // Toggle off a prompt that isn't actually attached anywhere.
    setOverride(db, { taskId: t.id, promptId: pOrphan.id, enabled: 0 });

    const ctx = resolveTaskContext(db, t.id);
    // Effective prompts are empty (nothing was inherited to begin with),
    // but the disabled row is still surfaced for UI transparency.
    expect(ctx?.prompts).toEqual([]);
    expect(ctx?.disabled_prompts).toEqual([pOrphan.id]);
  });

  it("disables a role-inherited prompt without touching the role", () => {
    const b = createBoard(db, "B");
    const col = firstColumnId(db, b.id);
    const t = createTask(db, b.id, col, { title: "T" });
    const pRole = createPrompt(db, { name: "role-p" });
    const role = createRole(db, { name: "R" });
    setRolePrompts(db, role.id, [pRole.id]);
    setTaskRole(db, t.id, role.id);

    setOverride(db, { taskId: t.id, promptId: pRole.id, enabled: 0 });

    const ctx = resolveTaskContext(db, t.id);
    expect(ctx?.role?.id).toBe(role.id);
    expect(ctx?.prompts).toEqual([]);
    expect(ctx?.disabled_prompts).toEqual([pRole.id]);
  });

  it("populates token_count per prompt and total_token_count on the bundle", () => {
    const b = createBoard(db, "B");
    const col = firstColumnId(db, b.id);
    const t = createTask(db, b.id, col, { title: "T" });

    const p1 = createPrompt(db, { name: "p1", content: "Hello world" });
    const p2 = createPrompt(db, { name: "p2", content: "another prompt body" });
    addTaskPrompt(db, t.id, p1.id, "direct");
    setBoardPrompts(db, b.id, [p2.id]);

    const ctx = resolveTaskContext(db, t.id)!;
    // Per-prompt counts come from the cached column.
    for (const p of ctx.prompts) {
      expect(typeof p.token_count).toBe("number");
      expect(p.token_count).toBeGreaterThan(0);
    }
    // total_token_count must equal the sum of resolved prompt counts.
    const expectedTotal = ctx.prompts.reduce((s, p) => s + p.token_count, 0);
    expect(ctx.total_token_count).toBe(expectedTotal);
    expect(ctx.total_token_count).toBe(p1.token_count + p2.token_count);
  });
});
