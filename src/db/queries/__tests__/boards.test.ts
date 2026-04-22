import { describe, it, expect } from "vitest";
import {
  createBoard,
  deleteBoard,
  getBoard,
  listBoards,
  updateBoard,
} from "../boards.js";
import { createTestDb } from "./helpers.js";

describe("boards queries", () => {
  it("creates, lists, reads, updates, and deletes a board", () => {
    const db = createTestDb();

    expect(listBoards(db)).toEqual([]);

    const board = createBoard(db, "Work");
    expect(board.name).toBe("Work");
    expect(board.id).toBeTypeOf("string");
    expect(board.created_at).toBeGreaterThan(0);

    expect(listBoards(db)).toHaveLength(1);
    expect(getBoard(db, board.id)).toMatchObject({ name: "Work" });

    const renamed = updateBoard(db, board.id, "Personal");
    expect(renamed?.name).toBe("Personal");
    expect(renamed?.updated_at).toBeGreaterThanOrEqual(board.updated_at);

    expect(deleteBoard(db, board.id)).toBe(true);
    expect(getBoard(db, board.id)).toBeNull();
    expect(deleteBoard(db, board.id)).toBe(false);
  });

  it("returns null when updating a missing board", () => {
    const db = createTestDb();
    expect(updateBoard(db, "does-not-exist", "X")).toBeNull();
  });
});
