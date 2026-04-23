import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import {
  addPromptToGroup,
  createPromptGroup,
  deletePromptGroup,
  getGroupsForPrompt,
  getPromptGroup,
  listPromptGroups,
  removePromptFromGroup,
  reorderPromptGroups,
  setGroupPrompts,
  updatePromptGroup,
} from "../promptGroups.js";
import { createPrompt } from "../prompts.js";
import { createTestDb } from "./helpers.js";

describe("prompt groups — many-to-many", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    for (let i = 1; i <= 5; i++) {
      createPrompt(db, { name: `p${i}` });
    }
  });

  function promptIdByName(name: string): string {
    const row = db.prepare("SELECT id FROM prompts WHERE name = ?").get(name) as
      | { id: string }
      | undefined;
    if (!row) throw new Error(`prompt ${name} not found in test setup`);
    return row.id;
  }

  it("creates a group pre-populated with prompts", () => {
    const g = createPromptGroup(db, {
      name: "Core",
      prompt_ids: [promptIdByName("p1"), promptIdByName("p2"), promptIdByName("p3")],
    });
    expect(g.name).toBe("Core");
    expect(g.prompts).toHaveLength(3);
    expect(g.prompt_count).toBe(3);
    expect(g.prompts.map((p) => p.name).sort()).toEqual(["p1", "p2", "p3"]);
  });

  it("a single prompt can live in multiple groups", () => {
    const p1 = promptIdByName("p1");
    const g1 = createPromptGroup(db, { name: "A", prompt_ids: [p1, promptIdByName("p2")] });
    const g2 = createPromptGroup(db, { name: "B", prompt_ids: [p1, promptIdByName("p3")] });
    const groups = getGroupsForPrompt(db, p1);
    expect(groups.map((g) => g.name).sort()).toEqual(["A", "B"]);
    expect(groups.map((g) => g.id).sort()).toEqual([g1.id, g2.id].sort());
  });

  it("deleting a group leaves the prompts intact", () => {
    const g = createPromptGroup(db, {
      name: "X",
      prompt_ids: [promptIdByName("p1"), promptIdByName("p2")],
    });
    expect(deletePromptGroup(db, g.id)).toBe(true);

    const remainingPrompts = (db.prepare("SELECT COUNT(*) AS c FROM prompts").get() as {
      c: number;
    }).c;
    expect(remainingPrompts).toBe(5);
  });

  it("deleting a prompt removes it from every group it belonged to", () => {
    const p1 = promptIdByName("p1");
    const g1 = createPromptGroup(db, { name: "A", prompt_ids: [p1, promptIdByName("p2")] });
    const g2 = createPromptGroup(db, { name: "B", prompt_ids: [p1] });

    db.prepare("DELETE FROM prompts WHERE id = ?").run(p1);

    expect(getPromptGroup(db, g1.id)?.prompts.map((p) => p.name)).toEqual(["p2"]);
    expect(getPromptGroup(db, g2.id)?.prompts).toEqual([]);
  });

  it("setGroupPrompts replaces the full membership list", () => {
    const g = createPromptGroup(db, {
      name: "Set",
      prompt_ids: [
        promptIdByName("p1"),
        promptIdByName("p2"),
        promptIdByName("p3"),
      ],
    });
    setGroupPrompts(db, g.id, [promptIdByName("p3"), promptIdByName("p5")]);
    const updated = getPromptGroup(db, g.id)!;
    expect(updated.prompts.map((p) => p.name).sort()).toEqual(["p3", "p5"]);
  });

  it("addPromptToGroup is idempotent", () => {
    const p1 = promptIdByName("p1");
    const p2 = promptIdByName("p2");
    const g = createPromptGroup(db, { name: "Idem", prompt_ids: [p1] });

    const first = addPromptToGroup(db, g.id, p1);
    expect(first).toEqual({ ok: true, added: false });
    const second = addPromptToGroup(db, g.id, p2);
    expect(second).toEqual({ ok: true, added: true });

    const updated = getPromptGroup(db, g.id)!;
    expect(updated.prompts.map((p) => p.name).sort()).toEqual(["p1", "p2"]);
  });

  it("removePromptFromGroup removes only the membership, not the prompt", () => {
    const p1 = promptIdByName("p1");
    const g = createPromptGroup(db, { name: "Remove", prompt_ids: [p1, promptIdByName("p2")] });

    const result = removePromptFromGroup(db, g.id, p1);
    expect(result).toEqual({ ok: true, removed: true });

    const updated = getPromptGroup(db, g.id)!;
    expect(updated.prompts.map((p) => p.name)).toEqual(["p2"]);
    expect(db.prepare("SELECT id FROM prompts WHERE id = ?").get(p1)).toBeTruthy();
  });

  it("listPromptGroups carries prompt_count per group", () => {
    createPromptGroup(db, {
      name: "A",
      prompt_ids: [promptIdByName("p1"), promptIdByName("p2")],
    });
    createPromptGroup(db, { name: "B", prompt_ids: [promptIdByName("p3")] });
    createPromptGroup(db, { name: "C" });

    const list = listPromptGroups(db);
    const counts = Object.fromEntries(list.map((g) => [g.name, g.prompt_count]));
    expect(counts).toEqual({ A: 2, B: 1, C: 0 });
  });

  it("listPromptGroups carries member_ids in position order", () => {
    const p1 = promptIdByName("p1");
    const p2 = promptIdByName("p2");
    const p3 = promptIdByName("p3");
    createPromptGroup(db, { name: "Ordered", prompt_ids: [p3, p1, p2] });
    createPromptGroup(db, { name: "Empty" });

    const list = listPromptGroups(db);
    const byName = Object.fromEntries(list.map((g) => [g.name, g.member_ids]));
    expect(byName.Ordered).toEqual([p3, p1, p2]);
    expect(byName.Empty).toEqual([]);
  });

  it("updatePromptGroup patches the selected fields", () => {
    const g = createPromptGroup(db, { name: "orig", color: "#111111" });
    const updated = updatePromptGroup(db, g.id, { name: "renamed", color: null });
    expect(updated?.name).toBe("renamed");
    expect(updated?.color).toBeNull();
  });

  it("reorderPromptGroups rewrites position values in one tx", () => {
    const a = createPromptGroup(db, { name: "A" });
    const b = createPromptGroup(db, { name: "B" });
    const c = createPromptGroup(db, { name: "C" });
    reorderPromptGroups(db, [c.id, a.id, b.id]);

    const list = listPromptGroups(db);
    expect(list.map((g) => g.name)).toEqual(["C", "A", "B"]);
    expect(list.map((g) => g.position)).toEqual([0, 1, 2]);
  });
});
