import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createBoard } from "../boards.js";
import { createColumn } from "../columns.js";
import { listColumnPrompts, setColumnPrompts } from "../columnPrompts.js";
import { createPrompt } from "../prompts.js";
import { createTestDb } from "./helpers.js";

describe("column_prompts queries", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("listColumnPrompts returns empty for a fresh column", () => {
    const b = createBoard(db, "B");
    const c = createColumn(db, b.id, "C");
    expect(listColumnPrompts(db, c.id)).toEqual([]);
  });

  it("setColumnPrompts preserves order", () => {
    const b = createBoard(db, "B");
    const c = createColumn(db, b.id, "C");
    const p1 = createPrompt(db, { name: "a" });
    const p2 = createPrompt(db, { name: "b" });
    const out = setColumnPrompts(db, c.id, [p2.id, p1.id]);
    expect(out.map((p) => p.id)).toEqual([p2.id, p1.id]);
  });

  it("deleting the column cascades out of column_prompts", () => {
    const b = createBoard(db, "B");
    const c = createColumn(db, b.id, "C");
    const p = createPrompt(db, { name: "x" });
    setColumnPrompts(db, c.id, [p.id]);
    db.prepare("DELETE FROM columns WHERE id = ?").run(c.id);
    const count = (db
      .prepare("SELECT COUNT(*) AS c FROM column_prompts WHERE column_id = ?")
      .get(c.id) as { c: number }).c;
    expect(count).toBe(0);
  });
});
