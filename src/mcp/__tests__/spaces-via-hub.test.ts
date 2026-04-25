import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startServer, type ServerHandle } from "../../server/index.js";
import { HubClient } from "../../bridge/hubClient.js";
import { callTool, allTools } from "../tools/index.js";

let handle: ServerHandle;
let hub: HubClient;

beforeAll(async () => {
  handle = await startServer(0, 0);
  hub = new HubClient(`http://localhost:${handle.port}`);
});

afterAll(async () => {
  await handle.close();
});

async function call<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  return (await callTool(name, args, { hub })) as T;
}

describe("MCP space tools — registry", () => {
  it("exposes the six space tools alongside the existing surface", () => {
    const names = new Set(allTools.map((t) => t.name));
    for (const required of [
      "list_spaces",
      "get_space",
      "create_space",
      "update_space",
      "delete_space",
      "move_board_to_space",
    ]) {
      expect(names.has(required), `missing tool: ${required}`).toBe(true);
    }
  });
});

describe("MCP space tools — CRUD", () => {
  it("list_spaces returns the seeded default space", async () => {
    const spaces = await call<
      Array<{ id: string; name: string; prefix: string; is_default: boolean }>
    >("list_spaces", {});
    const def = spaces.find((s) => s.is_default);
    expect(def).toBeTruthy();
    expect(def!.prefix).toBe("task");
  });

  it("create_space returns minimal {id, prefix} confirmation", async () => {
    const result = await call<Record<string, unknown>>("create_space", {
      name: "Hub Test",
      prefix: "ht",
    });
    expect(result.id).toBeTruthy();
    expect(result.prefix).toBe("ht");

    // Minimal shape: no `description`, no `position`, no `created_at` etc.
    expect(result.description).toBeUndefined();
    expect(result.position).toBeUndefined();
    expect(result.is_default).toBeUndefined();
  });

  it("create_space rejects a colliding prefix", async () => {
    await call("create_space", { name: "First", prefix: "col" });
    await expect(call("create_space", { name: "Second", prefix: "col" })).rejects.toThrow(
      /409|PrefixCollision/i
    );
  });

  it("create_space rejects an invalid prefix at the validator", async () => {
    await expect(call("create_space", { name: "X", prefix: "TOO_UPPER" })).rejects.toThrow(
      /400/
    );
  });

  it("get_space returns the detail shape with board_ids", async () => {
    const created = await call<{ id: string }>("create_space", {
      name: "Detail",
      prefix: "dt",
      description: "the description body",
    });
    const detail = await call<{
      id: string;
      name: string;
      prefix: string;
      description: string | null;
      board_ids: string[];
    }>("get_space", { id: created.id });

    expect(detail.id).toBe(created.id);
    expect(detail.name).toBe("Detail");
    expect(detail.prefix).toBe("dt");
    expect(detail.description).toBe("the description body");
    expect(detail.board_ids).toEqual([]);
  });

  it("update_space returns minimal {id} confirmation", async () => {
    const created = await call<{ id: string }>("create_space", {
      name: "Old",
      prefix: "upd",
    });
    const result = await call<Record<string, unknown>>("update_space", {
      id: created.id,
      name: "New",
    });
    expect(result.id).toBe(created.id);
    // Minimal: name change is confirmed by re-reading via get_space.
    expect(result.name).toBeUndefined();

    const after = await call<{ name: string }>("get_space", { id: created.id });
    expect(after.name).toBe("New");
  });

  it("delete_space returns {id, deleted: true}", async () => {
    const created = await call<{ id: string }>("create_space", {
      name: "ToDelete",
      prefix: "rm",
    });
    const result = await call<{ id: string; deleted: boolean }>("delete_space", {
      id: created.id,
    });
    expect(result).toEqual({ id: created.id, deleted: true });
  });

  it("delete_space refuses the default space", async () => {
    const list = await call<Array<{ id: string; is_default: boolean }>>(
      "list_spaces",
      {}
    );
    const def = list.find((s) => s.is_default)!;
    await expect(call("delete_space", { id: def.id })).rejects.toThrow(
      /409|DefaultSpaceImmutable/i
    );
  });
});

describe("MCP space tools — move_board_to_space + slug semantics", () => {
  it("re-slugs all tasks on the board and surfaces the count", async () => {
    const src = await call<{ id: string }>("create_space", {
      name: "MoveSrc",
      prefix: "msrc",
    });
    const dest = await call<{ id: string }>("create_space", {
      name: "MoveDst",
      prefix: "mdst",
    });

    const board = await call<{ id: string }>("create_board", {
      name: "Movable",
      space_id: src.id,
    });
    const cols = await call<Array<{ id: string }>>("list_columns", {
      board_id: board.id,
    });

    const t1 = await call<{ id: string; slug: string }>("create_task", {
      board_id: board.id,
      column_id: cols[0]!.id,
      title: "one",
    });
    const t2 = await call<{ id: string; slug: string }>("create_task", {
      board_id: board.id,
      column_id: cols[0]!.id,
      title: "two",
    });
    expect([t1.slug, t2.slug].sort()).toEqual(["msrc-1", "msrc-2"]);

    const result = await call<{
      board_id: string;
      space_id: string;
      reslugged_count: number;
    }>("move_board_to_space", { board_id: board.id, space_id: dest.id });

    expect(result.board_id).toBe(board.id);
    expect(result.space_id).toBe(dest.id);
    expect(result.reslugged_count).toBe(2);

    // The internal id resolves to the same task post-move; the slug is now
    // mdst-* even though the task was originally msrc-*.
    const after = await call<{ task: { slug: string } }>("get_task", {
      id: t1.id,
    });
    expect(after.task.slug).toMatch(/^mdst-\d+$/);
  });
});

describe("MCP get_task_bundle — slug-or-id input", () => {
  it("resolves by slug AND by id, returning identical bundles", async () => {
    const board = await call<{ id: string }>("create_board", {
      name: "slug-bundle",
    });
    const cols = await call<Array<{ id: string }>>("list_columns", {
      board_id: board.id,
    });

    const task = await call<{ id: string; slug: string }>("create_task", {
      board_id: board.id,
      column_id: cols[0]!.id,
      title: "by-slug-or-id",
      description: "body content",
    });

    const byId = await call<string>("get_task_bundle", { id: task.id });
    const bySlug = await call<string>("get_task_bundle", { id: task.slug });
    expect(byId).toBe(bySlug);
    // The slug shows up in the XML id attribute.
    expect(byId).toContain(`id="${task.slug}"`);
  });

  it("returns 404-style error when the slug does not exist", async () => {
    await expect(
      call("get_task_bundle", { id: "no-such-prefix-9999" })
    ).rejects.toThrow(/404|task not found/i);
  });
});

describe("MCP minimal-response contract — write tools", () => {
  // Each write tool must come back small. The 50–200 byte target in the spec
  // is for the JSON serialised form; we assert <= 256 bytes for slack.
  function bytes(value: unknown): number {
    return JSON.stringify(value ?? null).length;
  }

  it("create_board / update_board / delete_board are all minimal", async () => {
    const created = await call<Record<string, unknown>>("create_board", {
      name: "min-test",
    });
    expect(bytes(created)).toBeLessThanOrEqual(256);
    expect(created.id).toBeTruthy();
    expect(created.name).toBe("min-test");
    expect(created.role).toBeUndefined();
    expect(created.prompts).toBeUndefined();

    const renamed = await call<Record<string, unknown>>("update_board", {
      id: created.id,
      name: "renamed",
    });
    expect(bytes(renamed)).toBeLessThanOrEqual(256);
    expect(renamed.id).toBe(created.id);

    const deletedConfirm = await call<Record<string, unknown>>("delete_board", {
      id: created.id,
    });
    expect(bytes(deletedConfirm)).toBeLessThanOrEqual(256);
    expect(deletedConfirm.deleted).toBe(true);
  });

  it("create_task / update_task / move_task / delete_task are all minimal", async () => {
    const board = await call<{ id: string }>("create_board", {
      name: "task-min-test",
    });
    const cols = await call<Array<{ id: string }>>("list_columns", {
      board_id: board.id,
    });

    const created = await call<Record<string, unknown>>("create_task", {
      board_id: board.id,
      column_id: cols[0]!.id,
      title: "min",
    });
    expect(bytes(created)).toBeLessThanOrEqual(256);
    expect(created.id).toBeTruthy();
    expect(created.slug).toBeTruthy();
    expect(created.column_id).toBe(cols[0]!.id);
    // No fat fields.
    expect(created.description).toBeUndefined();
    expect(created.role).toBeUndefined();
    expect(created.prompts).toBeUndefined();

    const updated = await call<Record<string, unknown>>("update_task", {
      id: created.id,
      title: "renamed",
    });
    expect(bytes(updated)).toBeLessThanOrEqual(256);
    expect(updated.id).toBe(created.id);

    const moved = await call<Record<string, unknown>>("move_task", {
      id: created.id,
      column_id: cols[1]!.id,
    });
    expect(bytes(moved)).toBeLessThanOrEqual(256);
    expect(moved.column_id).toBe(cols[1]!.id);

    const deletedConfirm = await call<Record<string, unknown>>("delete_task", {
      id: created.id,
    });
    expect(bytes(deletedConfirm)).toBeLessThanOrEqual(256);
    expect(deletedConfirm.deleted).toBe(true);
  });

  it("set_task_role / add_task_prompt / remove_task_prompt are all minimal", async () => {
    const board = await call<{ id: string }>("create_board", { name: "role-min" });
    const cols = await call<Array<{ id: string }>>("list_columns", {
      board_id: board.id,
    });
    const role = await call<{ id: string }>("create_role", { name: "min-role" });
    const prompt = await call<{ id: string }>("create_prompt", { name: "min-p" });
    const task = await call<{ id: string }>("create_task", {
      board_id: board.id,
      column_id: cols[0]!.id,
      title: "T",
    });

    const setRole = await call<Record<string, unknown>>("set_task_role", {
      task_id: task.id,
      role_id: role.id,
    });
    expect(bytes(setRole)).toBeLessThanOrEqual(256);
    expect(setRole.task_id).toBe(task.id);
    expect(setRole.role_id).toBe(role.id);

    const added = await call<Record<string, unknown>>("add_task_prompt", {
      task_id: task.id,
      prompt_id: prompt.id,
    });
    expect(bytes(added)).toBeLessThanOrEqual(256);
    expect(added.origin).toBe("direct");

    const removed = await call<Record<string, unknown>>("remove_task_prompt", {
      task_id: task.id,
      prompt_id: prompt.id,
    });
    expect(bytes(removed)).toBeLessThanOrEqual(256);
    expect(removed.removed).toBe(true);
  });
});

describe("MCP minimal-response contract — read tools", () => {
  it("list_tasks omits description / role / prompts", async () => {
    const board = await call<{ id: string }>("create_board", { name: "read-min" });
    const cols = await call<Array<{ id: string }>>("list_columns", {
      board_id: board.id,
    });
    await call("create_task", {
      board_id: board.id,
      column_id: cols[0]!.id,
      title: "T",
      description: "should not appear in list",
    });

    const list = await call<Array<Record<string, unknown>>>("list_tasks", {
      board_id: board.id,
    });
    expect(list).toHaveLength(1);
    const t = list[0]!;
    expect(t.description).toBeUndefined();
    expect(t.role).toBeUndefined();
    expect(t.prompts).toBeUndefined();
    expect(t.id).toBeTruthy();
    expect(t.slug).toBeTruthy();
    expect(t.title).toBe("T");
  });

  it("list_prompts omits content; get_prompt keeps content", async () => {
    await call("create_prompt", {
      name: "min-list-test",
      content: "secret content body",
    });
    const list = await call<Array<Record<string, unknown>>>("list_prompts", {});
    for (const p of list) {
      expect(p.content).toBeUndefined();
    }

    const created = list.find((p) => p.name === "min-list-test")!;
    const detail = await call<Record<string, unknown>>("get_prompt", {
      id: created.id as string,
    });
    expect(detail.content).toBe("secret content body");
  });

  it("list_roles omits content; get_role keeps content but uses prompt_ids", async () => {
    const role = await call<{ id: string }>("create_role", {
      name: "min-role-test",
      content: "the role content body",
    });
    const prompt = await call<{ id: string }>("create_prompt", {
      name: "role-min-prompt",
      content: "should not appear",
    });
    await call("set_role_prompts", { role_id: role.id, prompt_ids: [prompt.id] });

    const list = await call<Array<Record<string, unknown>>>("list_roles", {});
    for (const r of list) {
      expect(r.content).toBeUndefined();
      expect(r.prompts).toBeUndefined();
    }

    const detail = await call<{
      id: string;
      content: string;
      prompt_ids: string[];
      prompts?: unknown;
    }>("get_role", { id: role.id });
    expect(detail.content).toBe("the role content body");
    expect(detail.prompt_ids).toEqual([prompt.id]);
    // Crucially: the embedded prompts array is dropped — only ids survive.
    expect(detail.prompts).toBeUndefined();
  });

  it("get_board returns column_ids only; list_columns has names", async () => {
    const board = await call<{ id: string }>("create_board", {
      name: "shape-board",
    });
    const detail = await call<Record<string, unknown>>("get_board", {
      id: board.id,
    });
    expect(detail.column_ids).toBeTruthy();
    expect(Array.isArray(detail.column_ids)).toBe(true);
    // No `columns` (full objects), no `prompts`, no `role` content.
    expect(detail.columns).toBeUndefined();
    expect(detail.prompts).toBeUndefined();
  });
});
