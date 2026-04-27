import { describe, expect, it } from "vitest";
import { buildLayeredInheritance } from "../inheritancePreview.js";
import type { Prompt, Role, RoleWithRelations } from "../../../lib/types.js";

/** Test-scoped role factory — fills the required timestamps/content that
 *  most specs don't care about. Returns `RoleWithRelations` because the
 *  resolver expects the role payload with prompts when computing role
 *  inheritance. */
function role(id: string, name: string, prompts: Prompt[] = []): RoleWithRelations {
  return {
    id,
    name,
    content: "",
    color: "#888",
    created_at: 0,
    updated_at: 0,
    prompts,
    skills: [],
    mcp_tools: [],
  };
}

function plainRole(id: string, name: string): Role {
  return { id, name, content: "", color: "#888", created_at: 0, updated_at: 0 };
}

function prompt(id: string, name = id): Prompt {
  return {
    id,
    name,
    content: "",
    color: "#888",
    created_at: 0,
    updated_at: 0,
  };
}

describe("buildLayeredInheritance", () => {
  it("returns three layers (board / column / task) in that order", () => {
    const layers = buildLayeredInheritance({
      localRoleId: null,
      localDirectIds: [],
      column: { role: null, prompts: [] },
      board: { role: null, prompts: [] },
    });
    expect(layers.map((l) => l.layerId)).toEqual(["board", "column", "task"]);
  });

  it("marks differing weaker-layer roles as shadowed while the task role stays active", () => {
    const taskR = role("r-task", "Task role");
    const colR = plainRole("r-col", "Col role");
    const boardR = plainRole("r-board", "Board role");

    const layers = buildLayeredInheritance({
      localRoleId: "r-task",
      localDirectIds: [],
      taskRoleDetail: taskR,
      column: { role: colR, prompts: [], roleDetail: null },
      board: { role: boardR, prompts: [], roleDetail: null },
    });

    const byLayer = Object.fromEntries(layers.map((l) => [l.layerId, l]));
    expect(byLayer.task!.roleApplied).toBe(true);
    expect(byLayer.column!.roleApplied).toBe(false);
    expect(byLayer.board!.roleApplied).toBe(false);
  });

  it("same role id on multiple layers stays applied at every layer (nothing is actually overridden)", () => {
    // Task, column, and board all point at the same role → no override.
    const sharedRole = role("r-shared", "Engineer");
    const sharedPlain = plainRole("r-shared", "Engineer");

    const layers = buildLayeredInheritance({
      localRoleId: "r-shared",
      localDirectIds: [],
      taskRoleDetail: sharedRole,
      column: { role: sharedPlain, prompts: [], roleDetail: null },
      board: { role: sharedPlain, prompts: [], roleDetail: null },
    });

    for (const l of layers) {
      expect(l.roleApplied, `layer ${l.layerId}`).toBe(true);
    }
  });

  it("falls through to column when task has no role", () => {
    const colR = plainRole("r-col", "Col role");
    const boardR = plainRole("r-board", "Board role");

    const layers = buildLayeredInheritance({
      localRoleId: null,
      localDirectIds: [],
      column: { role: colR, prompts: [], roleDetail: null },
      board: { role: boardR, prompts: [], roleDetail: null },
    });

    expect(layers.find((l) => l.layerId === "column")!.roleApplied).toBe(true);
    expect(layers.find((l) => l.layerId === "board")!.roleApplied).toBe(false);
  });

  it("falls through to board when neither task nor column have a role", () => {
    const boardR = plainRole("r-board", "Board role");
    const layers = buildLayeredInheritance({
      localRoleId: null,
      localDirectIds: [],
      column: { role: null, prompts: [] },
      board: { role: boardR, prompts: [], roleDetail: null },
    });
    expect(layers.find((l) => l.layerId === "board")!.roleApplied).toBe(true);
  });

  it("prompts union across layers — a prompt appearing at every level reads as applied everywhere", () => {
    // Same prompt on board, column, and task — all three rows should be
    // green, since prompts union into the effective context rather than
    // shadow each other the way roles do.
    const layers = buildLayeredInheritance({
      localRoleId: null,
      localDirectIds: ["p1"],
      column: { role: null, prompts: [prompt("p1")] },
      board: { role: null, prompts: [prompt("p1")] },
    });

    for (const l of layers) {
      const entry = l.entries.find((e) => e.promptId === "p1");
      expect(entry?.applied, `layer ${l.layerId}`).toBe(true);
    }
  });

  it("prompt shared between board and column is applied at both", () => {
    const layers = buildLayeredInheritance({
      localRoleId: null,
      localDirectIds: [],
      column: { role: null, prompts: [prompt("p1")] },
      board: { role: null, prompts: [prompt("p1")] },
    });

    const colEntry = layers
      .find((l) => l.layerId === "column")!
      .entries.find((e) => e.promptId === "p1");
    const boardEntry = layers
      .find((l) => l.layerId === "board")!
      .entries.find((e) => e.promptId === "p1");

    expect(colEntry?.applied).toBe(true);
    expect(boardEntry?.applied).toBe(true);
  });

  it("dedupes direct vs role origin within a single layer — direct wins", () => {
    // Task has p1 as both direct and via its role. Expect a single entry
    // with origin = direct.
    const taskR = role("r-task", "Task role", [prompt("p1")]);
    const layers = buildLayeredInheritance({
      localRoleId: "r-task",
      localDirectIds: ["p1"],
      taskRoleDetail: taskR,
      column: { role: null, prompts: [] },
      board: { role: null, prompts: [] },
    });

    const taskEntries = layers.find((l) => l.layerId === "task")!.entries;
    const hits = taskEntries.filter((e) => e.promptId === "p1");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.origin).toBe("direct");
  });

  it("role-origin entries carry the role reference for tooltip display", () => {
    const taskR = role("r-task", "Engineer", [prompt("p1")]);
    const layers = buildLayeredInheritance({
      localRoleId: "r-task",
      localDirectIds: [],
      taskRoleDetail: taskR,
      column: { role: null, prompts: [] },
      board: { role: null, prompts: [] },
    });

    const entry = layers
      .find((l) => l.layerId === "task")!
      .entries.find((e) => e.promptId === "p1");
    expect(entry?.origin).toBe("role");
    expect(entry?.role?.name).toBe("Engineer");
  });

  it("live update: adding a direct prompt to local state appears in task layer", () => {
    const before = buildLayeredInheritance({
      localRoleId: null,
      localDirectIds: [],
      column: { role: null, prompts: [] },
      board: { role: null, prompts: [] },
    });
    expect(before.find((l) => l.layerId === "task")!.entries).toHaveLength(0);

    const after = buildLayeredInheritance({
      localRoleId: null,
      localDirectIds: ["p1"],
      column: { role: null, prompts: [] },
      board: { role: null, prompts: [] },
    });
    const taskEntries = after.find((l) => l.layerId === "task")!.entries;
    expect(taskEntries).toHaveLength(1);
    expect(taskEntries[0]!.promptId).toBe("p1");
    expect(taskEntries[0]!.applied).toBe(true);
  });

  it("empty input yields three layers with no content", () => {
    const layers = buildLayeredInheritance({
      localRoleId: null,
      localDirectIds: [],
      column: { role: null, prompts: [] },
      board: { role: null, prompts: [] },
    });
    for (const l of layers) {
      expect(l.entries).toEqual([]);
      expect(l.layerRole).toBeNull();
      expect(l.roleApplied).toBe(false);
    }
  });

  it("marks per-task disabled prompts with applied=false + disabledByOverride", () => {
    const p1 = prompt("p1");
    const p2 = prompt("p2");
    const layers = buildLayeredInheritance({
      localRoleId: null,
      localDirectIds: [],
      localDisabledIds: ["p1"],
      column: { role: null, prompts: [] },
      board: { role: null, prompts: [p1, p2] },
    });

    const boardEntries = layers.find((l) => l.layerId === "board")!.entries;
    const e1 = boardEntries.find((e) => e.promptId === "p1")!;
    const e2 = boardEntries.find((e) => e.promptId === "p2")!;

    expect(e1.applied).toBe(false);
    expect(e1.disabledByOverride).toBe(true);
    expect(e2.applied).toBe(true);
    expect(e2.disabledByOverride).toBe(false);
  });
});
