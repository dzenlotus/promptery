import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import {
  addPromptToTag,
  createTag,
  deleteTag,
  getPromptTags,
  getTag,
  getTagByName,
  listPromptsWithTags,
  listTags,
  removePromptFromTag,
  setTagPrompts,
  updateTag,
} from "../tags.js";
import { createPrompt } from "../prompts.js";
import { ConflictError } from "../errors.js";
import { createTestDb } from "./helpers.js";

describe("tags — many-to-many", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    for (let i = 1; i <= 5; i++) {
      createPrompt(db, { name: `p${i}` });
    }
  });

  function promptIdByName(name: string): string {
    const row = db
      .prepare("SELECT id FROM prompts WHERE name = ?")
      .get(name) as { id: string } | undefined;
    if (!row) throw new Error(`prompt ${name} not found in test setup`);
    return row.id;
  }

  it("creates a tag pre-populated with prompts", () => {
    const t = createTag(db, {
      name: "core",
      prompt_ids: [
        promptIdByName("p1"),
        promptIdByName("p2"),
        promptIdByName("p3"),
      ],
    });
    expect(t.name).toBe("core");
    expect(t.prompts).toHaveLength(3);
    expect(t.prompt_count).toBe(3);
    expect(t.prompts.map((p) => p.name).sort()).toEqual(["p1", "p2", "p3"]);
  });

  it("rejects duplicate tag names case-insensitively", () => {
    createTag(db, { name: "Beta" });
    expect(() => createTag(db, { name: "beta" })).toThrow(ConflictError);
    expect(() => createTag(db, { name: "BETA" })).toThrow(ConflictError);
  });

  it("trims whitespace from the stored name", () => {
    const t = createTag(db, { name: "  trimmed  " });
    expect(t.name).toBe("trimmed");
  });

  it("a single prompt can carry multiple tags", () => {
    const p1 = promptIdByName("p1");
    const t1 = createTag(db, { name: "alpha", prompt_ids: [p1] });
    const t2 = createTag(db, { name: "bravo", prompt_ids: [p1] });
    const tags = getPromptTags(db, p1);
    expect(tags.map((t) => t.name).sort()).toEqual(["alpha", "bravo"]);
    expect(tags.map((t) => t.id).sort()).toEqual([t1.id, t2.id].sort());
  });

  it("deleting a tag leaves the prompts intact", () => {
    const t = createTag(db, {
      name: "bye",
      prompt_ids: [promptIdByName("p1"), promptIdByName("p2")],
    });
    expect(deleteTag(db, t.id)).toBe(true);

    const remainingPrompts = (
      db.prepare("SELECT COUNT(*) AS c FROM prompts").get() as { c: number }
    ).c;
    expect(remainingPrompts).toBe(5);
  });

  it("deleting a prompt removes it from every tag it carried", () => {
    const p1 = promptIdByName("p1");
    const t1 = createTag(db, {
      name: "a",
      prompt_ids: [p1, promptIdByName("p2")],
    });
    const t2 = createTag(db, { name: "b", prompt_ids: [p1] });

    db.prepare("DELETE FROM prompts WHERE id = ?").run(p1);

    expect(getTag(db, t1.id)?.prompts.map((p) => p.name)).toEqual(["p2"]);
    expect(getTag(db, t2.id)?.prompts).toEqual([]);
  });

  it("setTagPrompts replaces the full membership list", () => {
    const t = createTag(db, {
      name: "set",
      prompt_ids: [
        promptIdByName("p1"),
        promptIdByName("p2"),
        promptIdByName("p3"),
      ],
    });
    setTagPrompts(db, t.id, [promptIdByName("p3"), promptIdByName("p5")]);
    const updated = getTag(db, t.id)!;
    expect(updated.prompts.map((p) => p.name).sort()).toEqual(["p3", "p5"]);
  });

  it("addPromptToTag is idempotent", () => {
    const p1 = promptIdByName("p1");
    const p2 = promptIdByName("p2");
    const t = createTag(db, { name: "idem", prompt_ids: [p1] });

    const first = addPromptToTag(db, t.id, p1);
    expect(first).toEqual({ ok: true, added: false });
    const second = addPromptToTag(db, t.id, p2);
    expect(second).toEqual({ ok: true, added: true });

    const updated = getTag(db, t.id)!;
    expect(updated.prompts.map((p) => p.name).sort()).toEqual(["p1", "p2"]);
  });

  it("removePromptFromTag removes only the membership, not the prompt", () => {
    const p1 = promptIdByName("p1");
    const t = createTag(db, {
      name: "remove",
      prompt_ids: [p1, promptIdByName("p2")],
    });

    const result = removePromptFromTag(db, t.id, p1);
    expect(result).toEqual({ ok: true, removed: true });

    const updated = getTag(db, t.id)!;
    expect(updated.prompts.map((p) => p.name)).toEqual(["p2"]);
    expect(db.prepare("SELECT id FROM prompts WHERE id = ?").get(p1)).toBeTruthy();
  });

  it("listTags carries prompt_count per tag and is alpha-sorted", () => {
    createTag(db, {
      name: "Zeta",
      prompt_ids: [promptIdByName("p1"), promptIdByName("p2")],
    });
    createTag(db, { name: "alpha", prompt_ids: [promptIdByName("p3")] });
    createTag(db, { name: "M-tag" });

    const list = listTags(db);
    expect(list.map((t) => t.name)).toEqual(["alpha", "M-tag", "Zeta"]);
    const counts = Object.fromEntries(list.map((t) => [t.name, t.prompt_count]));
    expect(counts).toEqual({ alpha: 1, "M-tag": 0, Zeta: 2 });
  });

  it("updateTag patches the selected fields and bumps updated_at", async () => {
    const t = createTag(db, { name: "orig", color: "#111111" });
    // Force at least 1ms of separation so the new timestamp is observably newer.
    await new Promise((r) => setTimeout(r, 2));
    const updated = updateTag(db, t.id, { name: "renamed", color: null });
    expect(updated?.name).toBe("renamed");
    expect(updated?.color).toBeNull();
    expect(updated!.updated_at).toBeGreaterThan(t.updated_at);
  });

  it("updateTag rejects renaming into an existing name", () => {
    createTag(db, { name: "taken" });
    const t = createTag(db, { name: "free" });
    expect(() => updateTag(db, t.id, { name: "taken" })).toThrow(ConflictError);
  });

  it("updateTag allows a no-op case-only rename of the same tag", () => {
    const t = createTag(db, { name: "MixedCase" });
    const renamed = updateTag(db, t.id, { name: "mixedcase" });
    expect(renamed?.name).toBe("mixedcase");
  });

  it("getTagByName lookups are case-insensitive", () => {
    createTag(db, { name: "Hello" });
    expect(getTagByName(db, "hello")?.name).toBe("Hello");
    expect(getTagByName(db, "HELLO")?.name).toBe("Hello");
    expect(getTagByName(db, "missing")).toBeNull();
  });

  it("listPromptsWithTags returns one entry per prompt with grouped tags", () => {
    const p1 = promptIdByName("p1");
    const p2 = promptIdByName("p2");
    createTag(db, { name: "alpha", prompt_ids: [p1] });
    createTag(db, { name: "bravo", prompt_ids: [p1, p2] });

    const rows = listPromptsWithTags(db);
    const byPrompt = Object.fromEntries(
      rows.map((r) => [r.prompt_id, r.tags.map((t) => t.name).sort()])
    );

    // Every prompt is present, including ones with zero tags.
    expect(Object.keys(byPrompt).length).toBe(5);
    expect(byPrompt[p1]).toEqual(["alpha", "bravo"]);
    expect(byPrompt[p2]).toEqual(["bravo"]);
    expect(byPrompt[promptIdByName("p3")]).toEqual([]);
  });
});
