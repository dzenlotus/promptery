import { describe, expect, it } from "vitest";
import {
  isGroupFullyCovered,
  memberIds,
  toggleGroupSelection,
} from "../promptGroupToggle.js";
import type { PromptGroup } from "../../../lib/types.js";

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

describe("toggleGroupSelection", () => {
  it("adds every member of an unselected group, appending at the end", () => {
    const g = group("g1", ["a", "b", "c"]);
    const next = toggleGroupSelection(g, [], [g]);
    expect(next).toEqual(["a", "b", "c"]);
  });

  it("preserves existing order and only appends missing members", () => {
    // The user already has "z" and "b" selected; clicking the group should
    // leave them in place and append "a" and "c" in member order.
    const g = group("g1", ["a", "b", "c"]);
    const next = toggleGroupSelection(g, ["z", "b"], [g]);
    expect(next).toEqual(["z", "b", "a", "c"]);
  });

  it("does not duplicate ids when the group is partially selected", () => {
    const g = group("g1", ["a", "b"]);
    const next = toggleGroupSelection(g, ["a"], [g]);
    expect(next).toEqual(["a", "b"]);
    expect(new Set(next).size).toBe(next.length);
  });

  it("removes every member when the group is fully covered", () => {
    const g = group("g1", ["a", "b"]);
    const next = toggleGroupSelection(g, ["x", "a", "b", "y"], [g]);
    expect(next).toEqual(["x", "y"]);
  });

  it("keeps members shared with another fully-covered group when deselecting", () => {
    // Both groups are fully covered. Removing g1 must keep "b" because g2
    // still contains it — otherwise we'd silently tear down g2's coverage.
    const g1 = group("g1", ["a", "b"]);
    const g2 = group("g2", ["b", "c"]);
    const next = toggleGroupSelection(g1, ["a", "b", "c"], [g1, g2]);
    expect(next).toEqual(["b", "c"]);
  });

  it("ignores partially-covered other groups when computing shared members", () => {
    // g2 is only partially selected, so its membership doesn't protect "b"
    // from being removed when the user deselects g1.
    const g1 = group("g1", ["a", "b"]);
    const g2 = group("g2", ["b", "c"]);
    const next = toggleGroupSelection(g1, ["a", "b"], [g1, g2]);
    expect(next).toEqual([]);
  });

  it("treats empty groups as a no-op", () => {
    const g = group("g1", []);
    expect(toggleGroupSelection(g, ["x"], [g])).toEqual(["x"]);
  });

  it("handles groups with missing member_ids (legacy payloads) as a no-op", () => {
    const legacy = {
      ...group("g1", []),
      member_ids: undefined as unknown as string[],
    };
    expect(toggleGroupSelection(legacy, ["x"], [legacy])).toEqual(["x"]);
  });

  it("re-clicking an already-fully-selected group deselects all members", () => {
    // Direct round-trip: pick the group, then pick it again.
    const g = group("g1", ["a", "b", "c"]);
    const afterAdd = toggleGroupSelection(g, [], [g]);
    expect(afterAdd).toEqual(["a", "b", "c"]);
    const afterRemove = toggleGroupSelection(g, afterAdd, [g]);
    expect(afterRemove).toEqual([]);
  });
});

describe("isGroupFullyCovered", () => {
  it("returns true when every member is in the selected set", () => {
    const g = group("g1", ["a", "b"]);
    expect(isGroupFullyCovered(g, ["a", "b", "c"])).toBe(true);
  });

  it("returns false when any member is missing", () => {
    const g = group("g1", ["a", "b"]);
    expect(isGroupFullyCovered(g, ["a"])).toBe(false);
  });

  it("returns false for empty groups", () => {
    const g = group("g1", []);
    expect(isGroupFullyCovered(g, [])).toBe(false);
    expect(isGroupFullyCovered(g, ["a"])).toBe(false);
  });

  it("accepts both arrays and Set instances", () => {
    const g = group("g1", ["a", "b"]);
    expect(isGroupFullyCovered(g, new Set(["a", "b"]))).toBe(true);
    expect(isGroupFullyCovered(g, new Set(["a"]))).toBe(false);
  });
});

describe("memberIds", () => {
  it("returns the member array when present", () => {
    expect(memberIds(group("g1", ["a", "b"]))).toEqual(["a", "b"]);
  });

  it("returns an empty array for legacy payloads without member_ids", () => {
    const legacy = {
      ...group("g1", []),
      member_ids: undefined as unknown as string[],
    };
    expect(memberIds(legacy)).toEqual([]);
  });
});
