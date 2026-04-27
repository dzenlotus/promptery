import { describe, it, expect } from "vitest";
import { createPrompt, getPrompt, listPrompts, updatePrompt } from "../prompts.js";
import { countTokens } from "../../../lib/tokenCount.js";
import { createTestDb } from "./helpers.js";

describe("prompts: token_count", () => {
  it("populates token_count on create using cl100k_base", () => {
    const db = createTestDb();
    const content = "Hello world, this is a test prompt with some words";
    const p = createPrompt(db, { name: "tok", content });

    expect(p.token_count).toBe(countTokens(content));
    expect(p.token_count).toBeGreaterThan(0);

    // Round-trips through the DB unchanged.
    const reloaded = getPrompt(db, p.id);
    expect(reloaded?.token_count).toBe(p.token_count);
  });

  it("defaults token_count to 0 for empty content", () => {
    const db = createTestDb();
    const p = createPrompt(db, { name: "empty" });
    expect(p.token_count).toBe(0);
  });

  it("recomputes token_count when content changes", () => {
    const db = createTestDb();
    const p = createPrompt(db, { name: "edit", content: "short" });
    const original = p.token_count;

    const longer = "this is a substantially longer prompt body than before";
    const updated = updatePrompt(db, p.id, { content: longer });

    expect(updated?.token_count).toBe(countTokens(longer));
    expect(updated?.token_count).toBeGreaterThan(original);
  });

  it("keeps token_count stable on rename / recolor (no content change)", () => {
    const db = createTestDb();
    const p = createPrompt(db, { name: "stable", content: "some content" });
    const original = p.token_count;

    const renamed = updatePrompt(db, p.id, { name: "renamed" });
    expect(renamed?.token_count).toBe(original);

    const recolored = updatePrompt(db, p.id, { color: "#abcdef" });
    expect(recolored?.token_count).toBe(original);
  });

  it("listPrompts returns token_count for every row", () => {
    const db = createTestDb();
    createPrompt(db, { name: "a", content: "alpha beta gamma" });
    createPrompt(db, { name: "b", content: "delta epsilon" });

    const rows = listPrompts(db);
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(typeof r.token_count).toBe("number");
      expect(r.token_count).toBeGreaterThan(0);
    }
  });
});
