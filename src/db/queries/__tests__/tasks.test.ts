import { describe, it, expect } from "vitest";
import { createBoard, deleteBoard } from "../boards.js";
import { createColumn, listColumns } from "../columns.js";
import {
  addTagToTask,
  createTask,
  deleteTask,
  getTask,
  listTasks,
  moveTask,
  removeTagFromTask,
  updateTask,
} from "../tasks.js";
import { createTag } from "../tags.js";
import { createTestDb } from "./helpers.js";

function seedBoardWithColumns(db: ReturnType<typeof createTestDb>) {
  const board = createBoard(db, "Test Board");
  const todo = createColumn(db, board.id, "todo");
  const doing = createColumn(db, board.id, "doing");
  return { board, todo, doing };
}

describe("tasks queries", () => {
  it("auto-increments number per board and position per column", () => {
    const db = createTestDb();
    const { board, todo } = seedBoardWithColumns(db);

    const first = createTask(db, board.id, todo.id, { title: "first" });
    const second = createTask(db, board.id, todo.id, { title: "second" });

    expect(first.number).toBe(1);
    expect(second.number).toBe(2);
    expect(second.position).toBeGreaterThan(first.position);
  });

  it("returns tasks with tags joined in one query", () => {
    const db = createTestDb();
    const { board, todo } = seedBoardWithColumns(db);

    const task = createTask(db, board.id, todo.id, { title: "with tag" });
    const tag = createTag(db, { name: "react-perf", description: "optimize", color: "#fff" });
    addTagToTask(db, task.id, tag.id);

    const list = listTasks(db, board.id);
    expect(list).toHaveLength(1);
    expect(list[0]?.tags).toEqual([
      { id: tag.id, name: "react-perf", color: "#fff", kind: "skill" },
    ]);

    const full = getTask(db, task.id);
    expect(full?.tags[0]).toMatchObject({ name: "react-perf", description: "optimize" });
  });

  it("listTasks returns empty tags array when none attached", () => {
    const db = createTestDb();
    const { board, todo } = seedBoardWithColumns(db);
    createTask(db, board.id, todo.id, { title: "no tags" });

    const list = listTasks(db, board.id);
    expect(list[0]?.tags).toEqual([]);
  });

  it("filters listTasks by column", () => {
    const db = createTestDb();
    const { board, todo, doing } = seedBoardWithColumns(db);
    createTask(db, board.id, todo.id, { title: "in todo" });
    createTask(db, board.id, doing.id, { title: "in doing" });

    expect(listTasks(db, board.id, todo.id)).toHaveLength(1);
    expect(listTasks(db, board.id, doing.id)).toHaveLength(1);
    expect(listTasks(db, board.id)).toHaveLength(2);
  });

  it("moves task between columns", () => {
    const db = createTestDb();
    const { board, todo, doing } = seedBoardWithColumns(db);
    const task = createTask(db, board.id, todo.id, { title: "to move" });

    const moved = moveTask(db, task.id, doing.id, 100.5);
    expect(moved?.column_id).toBe(doing.id);
    expect(moved?.position).toBe(100.5);
  });

  it("updateTask changes individual fields", () => {
    const db = createTestDb();
    const { board, todo } = seedBoardWithColumns(db);
    const task = createTask(db, board.id, todo.id, { title: "original" });

    const updated = updateTask(db, task.id, { title: "renamed", description: "body" });
    expect(updated?.title).toBe("renamed");
    expect(updated?.description).toBe("body");
  });

  it("addTagToTask is idempotent, removeTagFromTask removes the link", () => {
    const db = createTestDb();
    const { board, todo } = seedBoardWithColumns(db);
    const task = createTask(db, board.id, todo.id, { title: "t" });
    const tag = createTag(db, { name: "x" });

    expect(addTagToTask(db, task.id, tag.id)).toBe(true);
    expect(addTagToTask(db, task.id, tag.id)).toBe(false); // second time: no change
    expect(removeTagFromTask(db, task.id, tag.id)).toBe(true);
    expect(removeTagFromTask(db, task.id, tag.id)).toBe(false);
  });

  it("cascade delete: removing board wipes its columns and tasks", () => {
    const db = createTestDb();
    const { board, todo } = seedBoardWithColumns(db);
    const task = createTask(db, board.id, todo.id, { title: "x" });

    deleteBoard(db, board.id);

    expect(getTask(db, task.id)).toBeNull();
    expect(listColumns(db, board.id)).toEqual([]);
  });

  it("deleteTask removes the task and returns false when repeated", () => {
    const db = createTestDb();
    const { board, todo } = seedBoardWithColumns(db);
    const task = createTask(db, board.id, todo.id, { title: "x" });

    expect(deleteTask(db, task.id)).toBe(true);
    expect(deleteTask(db, task.id)).toBe(false);
  });
});
