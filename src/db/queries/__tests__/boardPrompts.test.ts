import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createBoard } from "../boards.js";
import { listBoardPrompts, setBoardPrompts } from "../boardPrompts.js";
import { createPrompt } from "../prompts.js";
import { createTestDb } from "./helpers.js";

describe("board_prompts queries", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("listBoardPrompts returns empty array for a fresh board", () => {
    const b = createBoard(db, "B");
    expect(listBoardPrompts(db, b.id)).toEqual([]);
  });

  it("setBoardPrompts writes rows in the given order and returns them", () => {
    const b = createBoard(db, "B");
    const p1 = createPrompt(db, { name: "one" });
    const p2 = createPrompt(db, { name: "two" });

    const out = setBoardPrompts(db, b.id, [p2.id, p1.id]);
    expect(out.map((p) => p.id)).toEqual([p2.id, p1.id]);
  });

  it("setBoardPrompts is idempotent — same input yields same list", () => {
    const b = createBoard(db, "B");
    const p1 = createPrompt(db, { name: "one" });
    const p2 = createPrompt(db, { name: "two" });

    setBoardPrompts(db, b.id, [p1.id, p2.id]);
    const second = setBoardPrompts(db, b.id, [p1.id, p2.id]);
    expect(second.map((p) => p.id)).toEqual([p1.id, p2.id]);
  });

  it("replacement drops old rows", () => {
    const b = createBoard(db, "B");
    const p1 = createPrompt(db, { name: "one" });
    const p2 = createPrompt(db, { name: "two" });

    setBoardPrompts(db, b.id, [p1.id, p2.id]);
    setBoardPrompts(db, b.id, [p2.id]);
    const out = listBoardPrompts(db, b.id);
    expect(out.map((p) => p.id)).toEqual([p2.id]);
  });

  it("deleting a prompt cascades out of board_prompts", () => {
    const b = createBoard(db, "B");
    const p = createPrompt(db, { name: "victim" });
    setBoardPrompts(db, b.id, [p.id]);
    db.prepare("DELETE FROM prompts WHERE id = ?").run(p.id);
    expect(listBoardPrompts(db, b.id)).toEqual([]);
  });

  it("deleting a board cascades out of board_prompts", () => {
    const b = createBoard(db, "B");
    const p = createPrompt(db, { name: "x" });
    setBoardPrompts(db, b.id, [p.id]);
    db.prepare("DELETE FROM boards WHERE id = ?").run(b.id);
    const count = (db
      .prepare("SELECT COUNT(*) AS c FROM board_prompts WHERE board_id = ?")
      .get(b.id) as { c: number }).c;
    expect(count).toBe(0);
  });
});
