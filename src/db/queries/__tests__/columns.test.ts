import { describe, it, expect } from "vitest";
import { createBoard } from "../boards.js";
import {
  createColumn,
  deleteColumn,
  listColumns,
  updateColumn,
} from "../columns.js";
import { createTask } from "../tasks.js";
import { ColumnNotEmptyError } from "../errors.js";
import { createTestDb } from "./helpers.js";

describe("columns queries", () => {
  it("creates/renames/deletes an empty column", () => {
    const db = createTestDb();
    const board = createBoard(db, "Work");

    const col = createColumn(db, board.id, "Backlog");
    expect(col.name).toBe("Backlog");
    expect(col.board_id).toBe(board.id);

    const renamed = updateColumn(db, col.id, { name: "Icebox" });
    expect(renamed?.name).toBe("Icebox");

    expect(deleteColumn(db, col.id)).toBe(true);
    expect(listColumns(db, board.id).some((c) => c.id === col.id)).toBe(false);
  });

  it("refuses to delete a column that contains tasks", () => {
    const db = createTestDb();
    const board = createBoard(db, "Work");
    const [firstColumn] = listColumns(db, board.id);
    if (!firstColumn) throw new Error("expected default columns");

    createTask(db, board.id, firstColumn.id, { title: "In progress" });

    expect(() => deleteColumn(db, firstColumn.id)).toThrow(ColumnNotEmptyError);
    expect(() => deleteColumn(db, firstColumn.id)).toThrow(/contains 1 task/);

    // And the column is still there — the throw must not have partially applied.
    expect(listColumns(db, board.id).some((c) => c.id === firstColumn.id)).toBe(true);
  });

  it("carries the task count on the thrown error", () => {
    const db = createTestDb();
    const board = createBoard(db, "Work");
    const [firstColumn] = listColumns(db, board.id);
    if (!firstColumn) throw new Error("expected default columns");
    createTask(db, board.id, firstColumn.id, { title: "a" });
    createTask(db, board.id, firstColumn.id, { title: "b" });

    try {
      deleteColumn(db, firstColumn.id);
      expect.fail("deleteColumn should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ColumnNotEmptyError);
      expect((err as ColumnNotEmptyError).taskCount).toBe(2);
    }
  });
});
