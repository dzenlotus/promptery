import { describe, it, expect } from "vitest";
import type { Task, ResolutionHandling } from "../../../lib/types.js";

/**
 * Pure-logic tests for the conflict-detection helpers used by BoardMoveDialog.
 * No DOM / React Query needed — these exercise the in-component derivations as
 * plain functions by extracting the same logic.
 */

/** Replicates the conflict check from BoardMoveDialog without importing the component. */
function detectConflicts(task: Pick<Task, "role_id" | "prompts">): {
  hasRole: boolean;
  hasDirectPrompts: boolean;
  hasConflicts: boolean;
  directPromptCount: number;
} {
  const hasRole = Boolean(task.role_id);
  const directPrompts = task.prompts.filter((p) => p.origin === "direct");
  const hasDirectPrompts = directPrompts.length > 0;
  return {
    hasRole,
    hasDirectPrompts,
    hasConflicts: hasRole || hasDirectPrompts,
    directPromptCount: directPrompts.length,
  };
}

/** Models the resolution decision the user would make in the dialog. */
function applyResolution(
  task: { role_id: string | null; directPromptIds: string[] },
  roleHandling: ResolutionHandling,
  promptHandling: ResolutionHandling
): {
  roleIdAfter: string | null;
  directPromptsRetained: string[];
} {
  const roleIdAfter = roleHandling === "detach" ? null : task.role_id;
  const directPromptsRetained =
    promptHandling === "detach" ? [] : task.directPromptIds;
  return { roleIdAfter, directPromptsRetained };
}

function makeTask(
  overrides: Partial<Pick<Task, "role_id" | "prompts">> = {}
): Pick<Task, "role_id" | "prompts"> {
  return {
    role_id: null,
    prompts: [],
    ...overrides,
  };
}

describe("BoardMoveDialog conflict detection", () => {
  it("no conflicts when task has no role and no direct prompts", () => {
    const result = detectConflicts(makeTask());
    expect(result.hasConflicts).toBe(false);
    expect(result.hasRole).toBe(false);
    expect(result.hasDirectPrompts).toBe(false);
  });

  it("detects role conflict", () => {
    const result = detectConflicts(makeTask({ role_id: "role-1" }));
    expect(result.hasConflicts).toBe(true);
    expect(result.hasRole).toBe(true);
    expect(result.hasDirectPrompts).toBe(false);
  });

  it("detects direct prompt conflict", () => {
    const result = detectConflicts(
      makeTask({
        prompts: [
          {
            id: "p1",
            name: "Prompt 1",
            content: "",
            color: "#888",
            created_at: 0,
            updated_at: 0,
            origin: "direct",
          },
        ],
      })
    );
    expect(result.hasConflicts).toBe(true);
    expect(result.hasRole).toBe(false);
    expect(result.hasDirectPrompts).toBe(true);
    expect(result.directPromptCount).toBe(1);
  });

  it("counts only direct-origin prompts, not role-inherited ones", () => {
    const result = detectConflicts(
      makeTask({
        prompts: [
          {
            id: "p1",
            name: "Prompt 1",
            content: "",
            color: "#888",
            created_at: 0,
            updated_at: 0,
            origin: "direct",
          },
          {
            id: "p2",
            name: "Prompt 2",
            content: "",
            color: "#888",
            created_at: 0,
            updated_at: 0,
            origin: "role:some-role",
          },
        ],
      })
    );
    expect(result.directPromptCount).toBe(1);
    expect(result.hasDirectPrompts).toBe(true);
  });

  it("both role and direct prompts detected together", () => {
    const result = detectConflicts(
      makeTask({
        role_id: "role-1",
        prompts: [
          {
            id: "p1",
            name: "Prompt 1",
            content: "",
            color: "#888",
            created_at: 0,
            updated_at: 0,
            origin: "direct",
          },
        ],
      })
    );
    expect(result.hasConflicts).toBe(true);
    expect(result.hasRole).toBe(true);
    expect(result.hasDirectPrompts).toBe(true);
  });
});

describe("BoardMoveDialog resolution outcomes", () => {
  const task = { role_id: "role-1", directPromptIds: ["p1", "p2"] };

  it("keep/keep — nothing changes", () => {
    const r = applyResolution(task, "keep", "keep");
    expect(r.roleIdAfter).toBe("role-1");
    expect(r.directPromptsRetained).toEqual(["p1", "p2"]);
  });

  it("detach/keep — role cleared, prompts retained", () => {
    const r = applyResolution(task, "detach", "keep");
    expect(r.roleIdAfter).toBeNull();
    expect(r.directPromptsRetained).toEqual(["p1", "p2"]);
  });

  it("keep/detach — role kept, prompts cleared", () => {
    const r = applyResolution(task, "keep", "detach");
    expect(r.roleIdAfter).toBe("role-1");
    expect(r.directPromptsRetained).toHaveLength(0);
  });

  it("detach/detach — both cleared", () => {
    const r = applyResolution(task, "detach", "detach");
    expect(r.roleIdAfter).toBeNull();
    expect(r.directPromptsRetained).toHaveLength(0);
  });

  it("copy_to_target_board — treated same as keep for the task's own fields", () => {
    const r = applyResolution(task, "copy_to_target_board", "copy_to_target_board");
    // copy_to_target_board is handled server-side; the task retains its fields.
    expect(r.roleIdAfter).toBe("role-1");
    expect(r.directPromptsRetained).toEqual(["p1", "p2"]);
  });
});
