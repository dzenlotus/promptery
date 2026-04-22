import { describe, it, expect } from "vitest";
import { createBoard } from "../boards.js";
import { createColumn } from "../columns.js";
import {
  addTagToTask,
  createTask,
  getTask,
} from "../tasks.js";
import {
  createTag,
  deleteTag,
  getTag,
  getTagByName,
  listTags,
  updateTag,
} from "../tags.js";
import { ConflictError } from "../errors.js";
import { createTestDb } from "./helpers.js";

describe("tags queries", () => {
  it("creates, lists, gets, updates, deletes", () => {
    const db = createTestDb();
    const tag = createTag(db, { name: "react-perf", description: "go fast", color: "#f00" });

    expect(tag.name).toBe("react-perf");
    expect(listTags(db)).toHaveLength(1);
    expect(getTag(db, tag.id)).not.toBeNull();
    expect(getTagByName(db, "react-perf")).not.toBeNull();

    const updated = updateTag(db, tag.id, { description: "even faster" });
    expect(updated?.description).toBe("even faster");

    expect(deleteTag(db, tag.id)).toBe(true);
    expect(getTag(db, tag.id)).toBeNull();
  });

  it("rejects duplicate names via ConflictError", () => {
    const db = createTestDb();
    createTag(db, { name: "x" });
    expect(() => createTag(db, { name: "x" })).toThrow(ConflictError);
  });

  it("update rejects rename to an existing name", () => {
    const db = createTestDb();
    createTag(db, { name: "a" });
    const b = createTag(db, { name: "b" });
    expect(() => updateTag(db, b.id, { name: "a" })).toThrow(ConflictError);
  });

  it("allows renaming a tag to its own name (no self-conflict)", () => {
    const db = createTestDb();
    const tag = createTag(db, { name: "same" });
    const updated = updateTag(db, tag.id, { name: "same", description: "x" });
    expect(updated?.description).toBe("x");
  });

  it("cascade: deleting a tag clears it from task_tags", () => {
    const db = createTestDb();
    const board = createBoard(db, "b");
    const col = createColumn(db, board.id, "todo");
    const task = createTask(db, board.id, col.id, { title: "t" });
    const tag = createTag(db, { name: "will-go" });
    addTagToTask(db, task.id, tag.id);

    expect(getTask(db, task.id)?.tags).toHaveLength(1);

    deleteTag(db, tag.id);

    expect(getTask(db, task.id)?.tags).toEqual([]);
  });
});
