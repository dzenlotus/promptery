import { describe, it, expect } from "vitest";
import { createBoard } from "../boards.js";
import { createColumn } from "../columns.js";
import { createTask, deleteTask } from "../tasks.js";
import {
  LIST_TASK_EVENTS_DEFAULT_LIMIT,
  LIST_TASK_EVENTS_MAX_LIMIT,
  listEventsForTask,
  recordTaskEvent,
} from "../taskEvents.js";
import { createTestDb } from "./helpers.js";

function seedTask(db: ReturnType<typeof createTestDb>) {
  const board = createBoard(db, "B");
  const col = createColumn(db, board.id, "c1");
  const task = createTask(db, board.id, col.id, { title: "t" });
  return { board, col, task };
}

describe("taskEvents queries", () => {
  it("recordTaskEvent persists row and returns it shape-equal", () => {
    const db = createTestDb();
    const { task } = seedTask(db);

    const event = recordTaskEvent(db, {
      task_id: task.id,
      type: "task.created",
      actor: "claude-desktop",
      details: { column_id: "x" },
    });

    expect(event.task_id).toBe(task.id);
    expect(event.type).toBe("task.created");
    expect(event.actor).toBe("claude-desktop");
    expect(event.details).toEqual({ column_id: "x" });
    expect(event.id).toBeTruthy();
    expect(event.created_at).toBeGreaterThan(0);
  });

  it("listEventsForTask returns rows newest-first and parses details", () => {
    const db = createTestDb();
    const { task } = seedTask(db);
    // Force ordered timestamps so the assertion is deterministic regardless
    // of how fast the host can fire three statements in a single ms.
    db.prepare(
      "INSERT INTO task_events (id, task_id, type, actor, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("e1", task.id, "task.created", null, null, 1000);
    db.prepare(
      "INSERT INTO task_events (id, task_id, type, actor, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("e2", task.id, "task.updated", "ui", JSON.stringify({ changes: { title: { from: "a", to: "b" } } }), 2000);
    db.prepare(
      "INSERT INTO task_events (id, task_id, type, actor, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("e3", task.id, "task.moved", "claude-desktop", JSON.stringify({ old_column_id: "x" }), 3000);

    const events = listEventsForTask(db, task.id);
    expect(events.map((e) => e.id)).toEqual(["e3", "e2", "e1"]);
    expect(events[0]?.details).toEqual({ old_column_id: "x" });
    expect(events[1]?.details).toEqual({ changes: { title: { from: "a", to: "b" } } });
    expect(events[2]?.details).toBeNull();
  });

  it("listEventsForTask respects limit and clamps to MAX", () => {
    const db = createTestDb();
    const { task } = seedTask(db);
    for (let i = 0; i < 5; i++) {
      recordTaskEvent(db, { task_id: task.id, type: "task.created", actor: null });
    }
    expect(listEventsForTask(db, task.id, 2)).toHaveLength(2);
    // Defensive cap: a caller asking for an absurd limit gets MAX, not OOM.
    expect(listEventsForTask(db, task.id, LIST_TASK_EVENTS_MAX_LIMIT + 1).length).toBeLessThanOrEqual(
      LIST_TASK_EVENTS_MAX_LIMIT
    );
  });

  it("default limit applies when none is passed", () => {
    const db = createTestDb();
    const { task } = seedTask(db);
    for (let i = 0; i < LIST_TASK_EVENTS_DEFAULT_LIMIT + 5; i++) {
      recordTaskEvent(db, { task_id: task.id, type: "task.created", actor: null });
    }
    expect(listEventsForTask(db, task.id)).toHaveLength(LIST_TASK_EVENTS_DEFAULT_LIMIT);
  });

  it("cascades delete with the parent task", () => {
    const db = createTestDb();
    const { task } = seedTask(db);
    recordTaskEvent(db, { task_id: task.id, type: "task.created", actor: null });
    recordTaskEvent(db, { task_id: task.id, type: "task.updated", actor: null });
    expect(listEventsForTask(db, task.id)).toHaveLength(2);

    deleteTask(db, task.id);

    expect(listEventsForTask(db, task.id)).toEqual([]);
  });

  it("tolerates a corrupt details_json row by surfacing null", () => {
    const db = createTestDb();
    const { task } = seedTask(db);
    db.prepare(
      "INSERT INTO task_events (id, task_id, type, actor, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("bad", task.id, "task.updated", null, "{not json", Date.now());
    const events = listEventsForTask(db, task.id);
    expect(events).toHaveLength(1);
    expect(events[0]?.details).toBeNull();
  });
});
