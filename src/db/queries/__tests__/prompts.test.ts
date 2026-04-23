import { describe, it, expect } from "vitest";
import {
  createPrompt,
  deletePrompt,
  getPrompt,
  getPromptByName,
  listPrompts,
  updatePrompt,
} from "../prompts.js";
import { ConflictError } from "../errors.js";
import { createTestDb } from "./helpers.js";

describe("prompts queries", () => {
  it("creates, lists, gets, updates, deletes", () => {
    const db = createTestDb();
    const p = createPrompt(db, { name: "summarise", content: "do it", color: "#f00" });

    expect(p.name).toBe("summarise");
    expect(p.content).toBe("do it");
    expect(listPrompts(db)).toHaveLength(1);
    expect(getPrompt(db, p.id)).not.toBeNull();
    expect(getPromptByName(db, "summarise")).not.toBeNull();

    const updated = updatePrompt(db, p.id, { content: "do it better" });
    expect(updated?.content).toBe("do it better");

    expect(deletePrompt(db, p.id)).toBe(true);
    expect(getPrompt(db, p.id)).toBeNull();
  });

  it("defaults content to empty string and color to #888", () => {
    const db = createTestDb();
    const p = createPrompt(db, { name: "bare" });
    expect(p.content).toBe("");
    expect(p.color).toBe("#888");
  });

  it("rejects duplicate names via ConflictError", () => {
    const db = createTestDb();
    createPrompt(db, { name: "x" });
    expect(() => createPrompt(db, { name: "x" })).toThrow(ConflictError);
  });

  it("update rejects rename to an existing name but allows renaming to self", () => {
    const db = createTestDb();
    createPrompt(db, { name: "a" });
    const b = createPrompt(db, { name: "b" });
    expect(() => updatePrompt(db, b.id, { name: "a" })).toThrow(ConflictError);
    expect(updatePrompt(db, b.id, { name: "b", content: "y" })?.content).toBe("y");
  });
});
