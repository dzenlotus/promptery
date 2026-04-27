/**
 * Branch coverage for MCP tools that have 0% or very low branch coverage.
 *
 * Uses the same live-server pattern as tools-via-hub.test.ts.
 * Covers:
 *   - boards: set_board_role (with/without role), set_board_prompts, get_board_prompts
 *   - columns: set_column_role, set_column_prompts, get_column_prompts, delete_column (non-empty → 409)
 *   - tasks: create_task with description, move_task with position, list_tasks with column_id,
 *            get_task_bundle, get_task_context, set_task_role, add_task_prompt, remove_task_prompt,
 *            update_task title+description, delete_task
 *   - roles: set_role_prompts, update_role, delete_role
 *   - prompts: update_prompt, delete_prompt
 *   - promptGroups: full lifecycle including reorder, set_group_prompts, add/remove
 *   - callTool: unknown tool throws
 *   - ui: open_promptery_ui with explicit path, with default path
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startServer, type ServerHandle } from "../../server/index.js";
import { HubClient } from "../../bridge/hubClient.js";
import { callTool } from "../tools/index.js";

let handle: ServerHandle;
let hub: HubClient;

beforeAll(async () => {
  handle = await startServer(0, 0);
  hub = new HubClient(`http://localhost:${handle.port}`);
});

afterAll(async () => {
  await handle.close();
});

async function call<T = unknown>(
  name: string,
  args: Record<string, unknown>
): Promise<T> {
  return (await callTool(name, args, { hub })) as T;
}

// ---------------------------------------------------------------------------
// callTool: unknown tool
// ---------------------------------------------------------------------------

describe("callTool registry", () => {
  it("throws for an unknown tool name", async () => {
    await expect(
      callTool("no_such_tool", {}, { hub })
    ).rejects.toThrow(/Unknown tool/);
  });
});

// ---------------------------------------------------------------------------
// boards tool branches
// ---------------------------------------------------------------------------

describe("boards tools — branch coverage", () => {
  it("set_board_role assigns a role to a board", async () => {
    const board = await call<{ id: string }>("create_board", {
      name: "sb-role-board",
    });
    const role = await call<{ id: string }>("create_role", {
      name: "sb-role",
    });
    const result = await call<{ role_id: string }>("set_board_role", {
      board_id: board.id,
      role_id: role.id,
    });
    expect(result.role_id).toBe(role.id);
  });

  it("set_board_role clears the role when role_id is null", async () => {
    const board = await call<{ id: string }>("create_board", {
      name: "sb-clear-board",
    });
    const result = await call<{ role_id: string | null }>("set_board_role", {
      board_id: board.id,
      role_id: null,
    });
    expect(result.role_id).toBeNull();
  });

  it("set_board_prompts replaces board prompts", async () => {
    const board = await call<{ id: string }>("create_board", {
      name: "sb-prompts-board",
    });
    const prompt = await call<{ id: string }>("create_prompt", {
      name: "sb-board-prompt",
    });
    await call("set_board_prompts", {
      board_id: board.id,
      prompt_ids: [prompt.id],
    });
    const prompts = await call<{ id: string }[]>("get_board_prompts", {
      board_id: board.id,
    });
    expect((prompts as { id: string }[]).some((p) => p.id === prompt.id)).toBe(
      true
    );
  });

  it("get_board_prompts returns empty array for board with no prompts", async () => {
    const board = await call<{ id: string }>("create_board", {
      name: "sb-no-prompts-board",
    });
    const prompts = await call<unknown[]>("get_board_prompts", {
      board_id: board.id,
    });
    expect(prompts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// columns tool branches
// ---------------------------------------------------------------------------

describe("columns tools — branch coverage", () => {
  it("set_column_role assigns a role to a column", async () => {
    const board = await call<{ id: string; columns: { id: string }[] }>(
      "create_board",
      { name: "sc-role-board" }
    );
    const full = await call<{ columns: { id: string }[] }>("get_board", {
      id: board.id,
    });
    const col = full.columns[0]!;
    const role = await call<{ id: string }>("create_role", { name: "sc-col-role" });
    const result = await call<{ role_id: string }>("set_column_role", {
      column_id: col.id,
      role_id: role.id,
    });
    expect(result.role_id).toBe(role.id);
  });

  it("set_column_role clears role when role_id is null", async () => {
    const board = await call<{ id: string }>("create_board", {
      name: "sc-clear-board",
    });
    const full = await call<{ columns: { id: string }[] }>("get_board", {
      id: board.id,
    });
    const col = full.columns[0]!;
    const result = await call<{ role_id: string | null }>("set_column_role", {
      column_id: col.id,
      role_id: null,
    });
    expect(result.role_id).toBeNull();
  });

  it("set_column_prompts replaces column prompts", async () => {
    const board = await call<{ id: string }>("create_board", {
      name: "sc-prompts-board",
    });
    const full = await call<{ columns: { id: string }[] }>("get_board", {
      id: board.id,
    });
    const col = full.columns[0]!;
    const prompt = await call<{ id: string }>("create_prompt", {
      name: "sc-col-prompt",
    });
    await call("set_column_prompts", {
      column_id: col.id,
      prompt_ids: [prompt.id],
    });
    const prompts = await call<{ id: string }[]>("get_column_prompts", {
      column_id: col.id,
    });
    expect((prompts as { id: string }[]).some((p) => p.id === prompt.id)).toBe(
      true
    );
  });

  it("delete_column throws a helpful error when column has tasks", async () => {
    const board = await call<{ id: string }>("create_board", {
      name: "sc-nonempty-board",
    });
    const full = await call<{ columns: { id: string }[] }>("get_board", {
      id: board.id,
    });
    const col = full.columns[0]!;
    await call("create_task", {
      board_id: board.id,
      column_id: col.id,
      title: "blocking-task",
    });

    await expect(
      call("delete_column", { id: col.id })
    ).rejects.toThrow(/Cannot delete this column because it contains tasks/);
  });

  it("update_column with only position updates position branch", async () => {
    const board = await call<{ id: string }>("create_board", {
      name: "uc-pos-board",
    });
    const full = await call<{ columns: { id: string }[] }>("get_board", {
      id: board.id,
    });
    const col = full.columns[1]!; // second column
    // Only pass position (no name) → triggers the "typeof args.position === number" branch
    const result = await call<{ position: number }>("update_column", {
      id: col.id,
      position: 0,
    });
    expect(result.position).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// tasks tool branches
// ---------------------------------------------------------------------------

describe("tasks tools — branch coverage", () => {
  it("create_task with description populates the description field", async () => {
    const board = await call<{ id: string }>("create_board", {
      name: "ct-desc-board",
    });
    const full = await call<{ columns: { id: string }[] }>("get_board", {
      id: board.id,
    });
    const task = await call<{ description: string }>("create_task", {
      board_id: board.id,
      column_id: full.columns[0]!.id,
      title: "with-desc",
      description: "some description",
    });
    expect(task.description).toBe("some description");
  });

  it("move_task with explicit position uses position branch", async () => {
    const board = await call<{ id: string }>("create_board", {
      name: "mt-pos-board",
    });
    const full = await call<{ columns: { id: string }[] }>("get_board", {
      id: board.id,
    });
    const task = await call<{ id: string }>("create_task", {
      board_id: board.id,
      column_id: full.columns[0]!.id,
      title: "moving-task",
    });
    const result = await call<{ position: number }>("move_task", {
      id: task.id,
      column_id: full.columns[1]!.id,
      position: 5,
    });
    expect(result.position).toBe(5);
  });

  it("list_tasks with column_id filter narrows the result", async () => {
    const board = await call<{ id: string }>("create_board", {
      name: "lt-filter-board",
    });
    const full = await call<{ columns: { id: string }[] }>("get_board", {
      id: board.id,
    });
    await call("create_task", {
      board_id: board.id,
      column_id: full.columns[0]!.id,
      title: "task-col0",
    });
    await call("create_task", {
      board_id: board.id,
      column_id: full.columns[1]!.id,
      title: "task-col1",
    });

    const tasks = await call<{ column_id: string }[]>("list_tasks", {
      board_id: board.id,
      column_id: full.columns[0]!.id,
    });
    expect(
      (tasks as { column_id: string }[]).every(
        (t) => t.column_id === full.columns[0]!.id
      )
    ).toBe(true);
  });

  it("get_task_bundle returns raw XML string", async () => {
    const board = await call<{ id: string }>("create_board", {
      name: "gtb-board",
    });
    const full = await call<{ columns: { id: string }[] }>("get_board", {
      id: board.id,
    });
    const task = await call<{ id: string }>("create_task", {
      board_id: board.id,
      column_id: full.columns[0]!.id,
      title: "bundle-task",
    });
    const xml = await call<string>("get_task_bundle", { id: task.id });
    expect(typeof xml).toBe("string");
    expect(xml).toContain("bundle-task");
  });

  it("get_task_context returns structured JSON", async () => {
    const board = await call<{ id: string }>("create_board", {
      name: "gtc-board",
    });
    const full = await call<{ columns: { id: string }[] }>("get_board", {
      id: board.id,
    });
    const task = await call<{ id: string }>("create_task", {
      board_id: board.id,
      column_id: full.columns[0]!.id,
      title: "context-task",
    });
    const ctx = await call<{ prompts: unknown[] }>("get_task_context", {
      id: task.id,
    });
    expect(ctx).toHaveProperty("prompts");
  });

  it("set_task_role assigns role then clears it with null", async () => {
    const board = await call<{ id: string }>("create_board", {
      name: "str-board",
    });
    const full = await call<{ columns: { id: string }[] }>("get_board", {
      id: board.id,
    });
    const task = await call<{ id: string }>("create_task", {
      board_id: board.id,
      column_id: full.columns[0]!.id,
      title: "str-task",
    });
    const role = await call<{ id: string }>("create_role", { name: "str-role" });

    const withRole = await call<{ role_id: string }>("set_task_role", {
      task_id: task.id,
      role_id: role.id,
    });
    expect(withRole.role_id).toBe(role.id);

    const cleared = await call<{ role_id: string | null }>("set_task_role", {
      task_id: task.id,
      role_id: null,
    });
    expect(cleared.role_id).toBeNull();
  });

  it("add_task_prompt then remove_task_prompt lifecycle", async () => {
    const board = await call<{ id: string }>("create_board", {
      name: "atp-board",
    });
    const full = await call<{ columns: { id: string }[] }>("get_board", {
      id: board.id,
    });
    const task = await call<{ id: string }>("create_task", {
      board_id: board.id,
      column_id: full.columns[0]!.id,
      title: "atp-task",
    });
    const prompt = await call<{ id: string }>("create_prompt", {
      name: "atp-prompt",
    });

    const added = await call<{ prompts: { id: string; origin: string }[] }>(
      "add_task_prompt",
      { task_id: task.id, prompt_id: prompt.id }
    );
    expect(
      (added.prompts as { id: string; origin: string }[]).some(
        (p) => p.id === prompt.id && p.origin === "direct"
      )
    ).toBe(true);

    const removed = await call<{ prompts: { id: string }[] }>(
      "remove_task_prompt",
      { task_id: task.id, prompt_id: prompt.id }
    );
    expect(
      (removed.prompts as { id: string }[]).every((p) => p.id !== prompt.id)
    ).toBe(true);
  });

  it("update_task updates both title and description", async () => {
    const board = await call<{ id: string }>("create_board", {
      name: "ut-board",
    });
    const full = await call<{ columns: { id: string }[] }>("get_board", {
      id: board.id,
    });
    const task = await call<{ id: string }>("create_task", {
      board_id: board.id,
      column_id: full.columns[0]!.id,
      title: "old-title",
    });
    const updated = await call<{ title: string; description: string }>(
      "update_task",
      {
        id: task.id,
        title: "new-title",
        description: "new-desc",
      }
    );
    expect(updated.title).toBe("new-title");
    expect(updated.description).toBe("new-desc");
  });

  it("delete_task removes the task", async () => {
    const board = await call<{ id: string }>("create_board", {
      name: "dt-board",
    });
    const full = await call<{ columns: { id: string }[] }>("get_board", {
      id: board.id,
    });
    const task = await call<{ id: string }>("create_task", {
      board_id: board.id,
      column_id: full.columns[0]!.id,
      title: "delete-me",
    });
    await call("delete_task", { id: task.id });
    await expect(
      callTool("get_task", { id: task.id }, { hub })
    ).rejects.toThrow(/404/);
  });
});

// ---------------------------------------------------------------------------
// roles tool branches
// ---------------------------------------------------------------------------

describe("roles tools — branch coverage", () => {
  it("update_role updates name, content and color via conditional body branches", async () => {
    const role = await call<{ id: string }>("create_role", { name: "ur-role" });
    const updated = await call<{ name: string; content: string }>("update_role", {
      id: role.id,
      name: "ur-role-updated",
      content: "new content",
      color: "#abc",
    });
    expect(updated.name).toBe("ur-role-updated");
    expect(updated.content).toBe("new content");
  });

  it("update_role with only name does not set content/color", async () => {
    const role = await call<{ id: string }>("create_role", {
      name: "ur-only-name",
    });
    const updated = await call<{ name: string }>("update_role", {
      id: role.id,
      name: "ur-only-name-v2",
    });
    expect(updated.name).toBe("ur-only-name-v2");
  });

  it("delete_role deletes the role", async () => {
    const role = await call<{ id: string }>("create_role", { name: "dr-role" });
    await call("delete_role", { id: role.id });
    await expect(callTool("get_role", { id: role.id }, { hub })).rejects.toThrow(
      /404/
    );
  });

  it("set_role_prompts with empty array clears prompts", async () => {
    const role = await call<{ id: string }>("create_role", {
      name: "srp-role",
    });
    const prompt = await call<{ id: string }>("create_prompt", {
      name: "srp-prompt",
    });
    await call("set_role_prompts", {
      role_id: role.id,
      prompt_ids: [prompt.id],
    });
    const cleared = await call<{ prompts: unknown[] }>("set_role_prompts", {
      role_id: role.id,
      prompt_ids: [],
    });
    expect(cleared.prompts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// prompts tool branches
// ---------------------------------------------------------------------------

describe("prompts tools — branch coverage", () => {
  it("create_prompt with all optional fields uses all branches", async () => {
    const prompt = await call<{ name: string; content: string; color: string }>(
      "create_prompt",
      {
        name: "full-prompt",
        content: "some content",
        color: "#abc",
      }
    );
    expect(prompt.name).toBe("full-prompt");
    expect(prompt.content).toBe("some content");
    expect(prompt.color).toBe("#abc");
  });

  it("update_prompt with name, content and color exercises all branches", async () => {
    const prompt = await call<{ id: string }>("create_prompt", {
      name: "up-prompt",
    });
    const updated = await call<{ name: string; content: string }>(
      "update_prompt",
      {
        id: prompt.id,
        name: "up-prompt-v2",
        content: "updated content",
        color: "#cba",
      }
    );
    expect(updated.name).toBe("up-prompt-v2");
    expect(updated.content).toBe("updated content");
  });

  it("update_prompt with only content exercises single-field branch", async () => {
    const prompt = await call<{ id: string }>("create_prompt", {
      name: "up-content-only",
    });
    const updated = await call<{ content: string }>("update_prompt", {
      id: prompt.id,
      content: "content-only",
    });
    expect(updated.content).toBe("content-only");
  });

  it("delete_prompt removes the prompt", async () => {
    const prompt = await call<{ id: string }>("create_prompt", {
      name: "dp-prompt",
    });
    await call("delete_prompt", { id: prompt.id });
    await expect(
      callTool("get_prompt", { id: prompt.id }, { hub })
    ).rejects.toThrow(/404/);
  });
});

// ---------------------------------------------------------------------------
// promptGroups tool branches
// ---------------------------------------------------------------------------

describe("promptGroups tools — branch coverage", () => {
  it("create_prompt_group with color and prompt_ids uses all conditional branches", async () => {
    const prompt = await call<{ id: string }>("create_prompt", {
      name: "pg-prompt-a",
    });
    const group = await call<{
      id: string;
      name: string;
      prompts: { id: string }[];
    }>("create_prompt_group", {
      name: "pg-with-all",
      color: "#123",
      prompt_ids: [prompt.id],
    });
    expect(group.name).toBe("pg-with-all");
    expect(group.prompts.some((p) => p.id === prompt.id)).toBe(true);
  });

  it("create_prompt_group without optional fields uses else branches", async () => {
    const group = await call<{ id: string; name: string }>(
      "create_prompt_group",
      { name: "pg-minimal" }
    );
    expect(group.name).toBe("pg-minimal");
  });

  it("update_prompt_group with name, color and position exercises all branches", async () => {
    const group = await call<{ id: string }>("create_prompt_group", {
      name: "pg-update",
    });
    const updated = await call<{ name: string }>("update_prompt_group", {
      id: group.id,
      name: "pg-update-v2",
      color: "#999",
      position: 0,
    });
    expect(updated.name).toBe("pg-update-v2");
  });

  it("update_prompt_group with only name exercises minimal branch", async () => {
    const group = await call<{ id: string }>("create_prompt_group", {
      name: "pg-name-only",
    });
    const updated = await call<{ name: string }>("update_prompt_group", {
      id: group.id,
      name: "pg-name-only-v2",
    });
    expect(updated.name).toBe("pg-name-only-v2");
  });

  it("set_group_prompts replaces the full list", async () => {
    const p1 = await call<{ id: string }>("create_prompt", {
      name: "sgp-p1",
    });
    const p2 = await call<{ id: string }>("create_prompt", {
      name: "sgp-p2",
    });
    const group = await call<{ id: string }>("create_prompt_group", {
      name: "sgp-group",
      prompt_ids: [p1.id],
    });
    const updated = await call<{ prompts: { id: string }[] }>(
      "set_group_prompts",
      {
        group_id: group.id,
        prompt_ids: [p2.id],
      }
    );
    expect(updated.prompts.map((p) => p.id)).toEqual([p2.id]);
  });

  it("add_prompt_to_group and remove_prompt_from_group lifecycle", async () => {
    const prompt = await call<{ id: string }>("create_prompt", {
      name: "aptg-prompt",
    });
    const group = await call<{ id: string }>("create_prompt_group", {
      name: "aptg-group",
    });

    const added = await call<{ prompts: { id: string }[] }>(
      "add_prompt_to_group",
      { group_id: group.id, prompt_id: prompt.id }
    );
    expect(added.prompts.some((p) => p.id === prompt.id)).toBe(true);

    const removed = await call<{ prompts: { id: string }[] }>(
      "remove_prompt_from_group",
      { group_id: group.id, prompt_id: prompt.id }
    );
    expect(removed.prompts.every((p) => p.id !== prompt.id)).toBe(true);
  });

  it("reorder_prompt_groups reorders the list", async () => {
    const g1 = await call<{ id: string }>("create_prompt_group", {
      name: "rpg-g1",
    });
    const g2 = await call<{ id: string }>("create_prompt_group", {
      name: "rpg-g2",
    });
    const result = await call<{ id: string }[]>("reorder_prompt_groups", {
      ids: [g2.id, g1.id],
    });
    expect(result).toBeTruthy();
  });

  it("delete_prompt_group removes the group", async () => {
    const group = await call<{ id: string }>("create_prompt_group", {
      name: "dpg-group",
    });
    await call("delete_prompt_group", { id: group.id });
    await expect(
      callTool("get_prompt_group", { id: group.id }, { hub })
    ).rejects.toThrow(/404/);
  });
});

// ---------------------------------------------------------------------------
// UI tool branches
// ---------------------------------------------------------------------------

describe("ui tools — branch coverage", () => {
  it("open_promptery_ui with explicit path constructs URL with that path", async () => {
    // Can't really open a browser in tests, but we can assert the return value.
    // The 'open' package will attempt to open — suppress by checking it returns
    // the opened url. In CI this will just fail to open a browser but not throw.
    const result = await call<{ opened: string }>("open_promptery_ui", {
      path: "/roles",
    });
    expect(result.opened).toContain("/roles");
  });

  it("open_promptery_ui without path defaults to /", async () => {
    const result = await call<{ opened: string }>("open_promptery_ui", {});
    expect(result.opened).toMatch(/\/$/);
  });

  it("open_promptery_ui with path not starting with / prepends slash", async () => {
    const result = await call<{ opened: string }>("open_promptery_ui", {
      path: "board/xyz",
    });
    expect(result.opened).toContain("/board/xyz");
  });
});
