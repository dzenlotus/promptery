import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createBoard } from "../boards.js";
import { createColumn } from "../columns.js";
import { createTask } from "../tasks.js";
import { createPrompt } from "../prompts.js";
import {
  deleteOverride,
  listDisabledPromptIds,
  listOverrides,
  setOverride,
} from "../taskPromptOverrides.js";
import { createTestDb } from "./helpers.js";

describe("task_prompt_overrides queries", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  function seedTaskWithPrompt() {
    const board = createBoard(db, "B");
    const col = createColumn(db, board.id, "C");
    const task = createTask(db, board.id, col.id, { title: "T" });
    const prompt = createPrompt(db, { name: "p" });
    return { task, prompt };
  }

  it("listOverrides returns an empty Map for a fresh task", () => {
    const { task } = seedTaskWithPrompt();
    expect(listOverrides(db, task.id).size).toBe(0);
    expect(listDisabledPromptIds(db, task.id)).toEqual([]);
  });

  it("setOverride inserts a row and listOverrides reflects it", () => {
    const { task, prompt } = seedTaskWithPrompt();
    setOverride(db, { taskId: task.id, promptId: prompt.id, enabled: 0 });

    const overrides = listOverrides(db, task.id);
    expect(overrides.get(prompt.id)).toBe(0);
    expect(listDisabledPromptIds(db, task.id)).toEqual([prompt.id]);
  });

  it("setOverride flips enabled in place (upsert)", () => {
    const { task, prompt } = seedTaskWithPrompt();
    setOverride(db, { taskId: task.id, promptId: prompt.id, enabled: 0 });
    setOverride(db, { taskId: task.id, promptId: prompt.id, enabled: 1 });

    expect(listOverrides(db, task.id).get(prompt.id)).toBe(1);
    // enabled=1 is reserved; not surfaced via the disabled-only helper.
    expect(listDisabledPromptIds(db, task.id)).toEqual([]);
  });

  it("deleteOverride removes the row and reports change", () => {
    const { task, prompt } = seedTaskWithPrompt();
    setOverride(db, { taskId: task.id, promptId: prompt.id, enabled: 0 });
    expect(deleteOverride(db, task.id, prompt.id)).toBe(true);
    expect(listOverrides(db, task.id).size).toBe(0);
    // Idempotent — deleting a missing row simply returns false.
    expect(deleteOverride(db, task.id, prompt.id)).toBe(false);
  });

  it("cascades when the parent task is deleted", () => {
    const { task, prompt } = seedTaskWithPrompt();
    setOverride(db, { taskId: task.id, promptId: prompt.id, enabled: 0 });
    db.prepare("DELETE FROM tasks WHERE id = ?").run(task.id);

    const remaining = (db
      .prepare("SELECT COUNT(*) AS c FROM task_prompt_overrides WHERE task_id = ?")
      .get(task.id) as { c: number }).c;
    expect(remaining).toBe(0);
  });

  it("cascades when the referenced prompt is deleted", () => {
    const { task, prompt } = seedTaskWithPrompt();
    setOverride(db, { taskId: task.id, promptId: prompt.id, enabled: 0 });
    db.prepare("DELETE FROM prompts WHERE id = ?").run(prompt.id);

    const remaining = (db
      .prepare(
        "SELECT COUNT(*) AS c FROM task_prompt_overrides WHERE prompt_id = ?"
      )
      .get(prompt.id) as { c: number }).c;
    expect(remaining).toBe(0);
  });

  it("isolates overrides per task", () => {
    const board = createBoard(db, "B");
    const col = createColumn(db, board.id, "C");
    const t1 = createTask(db, board.id, col.id, { title: "T1" });
    const t2 = createTask(db, board.id, col.id, { title: "T2" });
    const p = createPrompt(db, { name: "p" });

    setOverride(db, { taskId: t1.id, promptId: p.id, enabled: 0 });
    expect(listOverrides(db, t1.id).get(p.id)).toBe(0);
    expect(listOverrides(db, t2.id).size).toBe(0);
  });
});
