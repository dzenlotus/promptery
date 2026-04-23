import { describe, expect, it } from "vitest";
import { breakdownAttachments } from "../attachmentChipLogic.js";
import type { Prompt, PromptGroup } from "../../../lib/types.js";

function prompt(id: string): Prompt {
  return {
    id,
    name: id,
    content: "",
    color: "#888",
    created_at: 0,
    updated_at: 0,
  };
}

function group(id: string, members: string[], name = id): PromptGroup {
  return {
    id,
    name,
    color: null,
    position: 0,
    created_at: 0,
    updated_at: 0,
    prompt_count: members.length,
    member_ids: members,
  };
}

describe("breakdownAttachments", () => {
  it("returns empty breakdown when nothing is attached", () => {
    const result = breakdownAttachments([], [], new Set());
    expect(result.fullyCoveredGroups).toEqual([]);
    expect(result.visiblePrompts).toEqual([]);
  });

  it("passes individual prompts through when no groups are known", () => {
    const result = breakdownAttachments([prompt("p1"), prompt("p2")], []);
    expect(result.fullyCoveredGroups).toEqual([]);
    expect(result.visiblePrompts.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("collapses a fully covered group into a single chip, hiding its members", () => {
    const result = breakdownAttachments(
      [prompt("p1"), prompt("p2"), prompt("p3")],
      [group("g1", ["p1", "p2"])]
    );
    expect(result.fullyCoveredGroups.map((g) => g.id)).toEqual(["g1"]);
    expect(result.visiblePrompts.map((p) => p.id)).toEqual(["p3"]);
  });

  it("ignores partially covered groups — members stay as individual chips", () => {
    const result = breakdownAttachments(
      [prompt("p1"), prompt("p2")],
      [group("g1", ["p1", "p2", "p3"])]
    );
    expect(result.fullyCoveredGroups).toEqual([]);
    expect(result.visiblePrompts.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("skips empty groups (zero members cannot be fully covered)", () => {
    const result = breakdownAttachments([prompt("p1")], [group("empty", [])]);
    expect(result.fullyCoveredGroups).toEqual([]);
    expect(result.visiblePrompts.map((p) => p.id)).toEqual(["p1"]);
  });

  it("drops prompts whose ids are in hiddenPromptIds (e.g. already provided by role)", () => {
    const result = breakdownAttachments(
      [prompt("p1"), prompt("p2"), prompt("p3")],
      [],
      new Set(["p1"])
    );
    expect(result.visiblePrompts.map((p) => p.id)).toEqual(["p2", "p3"]);
  });

  it("still detects a group even when one of its members is hidden by role", () => {
    // Group contains {p1, p2}. Direct has both. Role provides p1 too.
    // The group chip should still appear (user added the whole group);
    // hiding p1 individually would mislead.
    const result = breakdownAttachments(
      [prompt("p1"), prompt("p2")],
      [group("g1", ["p1", "p2"])],
      new Set(["p1"])
    );
    expect(result.fullyCoveredGroups.map((g) => g.id)).toEqual(["g1"]);
    // p2 is inside the group, so it's covered by the group chip, not shown
    // individually. p1 would be hidden anyway.
    expect(result.visiblePrompts).toEqual([]);
  });

  it("multiple groups can be fully covered side-by-side", () => {
    const result = breakdownAttachments(
      [prompt("a"), prompt("b"), prompt("c"), prompt("d")],
      [group("g1", ["a", "b"]), group("g2", ["c", "d"])]
    );
    expect(result.fullyCoveredGroups.map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(result.visiblePrompts).toEqual([]);
  });

  it("handles groups without member_ids (legacy payloads) as uncovered", () => {
    const legacy: PromptGroup = {
      id: "g1",
      name: "g1",
      color: null,
      position: 0,
      created_at: 0,
      updated_at: 0,
      prompt_count: 2,
      // Older hub builds don't populate this field.
      member_ids: undefined as unknown as string[],
    };
    const result = breakdownAttachments([prompt("p1"), prompt("p2")], [legacy]);
    expect(result.fullyCoveredGroups).toEqual([]);
    expect(result.visiblePrompts.map((p) => p.id)).toEqual(["p1", "p2"]);
  });
});
