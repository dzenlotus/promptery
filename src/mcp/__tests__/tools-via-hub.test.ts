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

describe("tools registry", () => {
  it("exposes the expected core tools", () => {
    const names = new Set(allTools.map((t) => t.name));
    for (const required of [
      "list_boards",
      "get_board",
      "create_board",
      "update_board",
      "delete_board",
      "list_columns",
      "create_column",
      "update_column",
      "delete_column",
      "list_tasks",
      "get_task",
      "get_task_bundle",
      "create_task",
      "update_task",
      "move_task",
      "delete_task",
      "set_task_role",
      "add_task_prompt",
      "remove_task_prompt",
      "list_roles",
      "get_role",
      "create_role",
      "update_role",
      "delete_role",
      "set_role_prompts",
      "list_prompts",
      "get_prompt",
      "create_prompt",
      "update_prompt",
      "delete_prompt",
      "get_ui_info",
      "open_promptery_ui",
    ]) {
      expect(names.has(required), `missing tool: ${required}`).toBe(true);
    }
  });
});

describe("boards + columns via hub", () => {
  it("create_board returns a board, get_board returns it with columns", async () => {
    const board = await call<{ id: string; name: string }>("create_board", {
      name: "tools-hub-test",
    });
    expect(board.id).toBeTruthy();
    expect(board.name).toBe("tools-hub-test");

    const full = await call<{ id: string; columns: { id: string; name: string }[] }>(
      "get_board",
      { id: board.id }
    );
    expect(full.columns.map((c) => c.name)).toEqual(["todo", "in-progress", "qa", "done"]);
  });

  it("update_board renames it, delete_board removes it", async () => {
    const board = await call<{ id: string }>("create_board", { name: "to-rename" });
    const renamed = await call<{ name: string }>("update_board", {
      id: board.id,
      name: "renamed",
    });
    expect(renamed.name).toBe("renamed");
    await call("delete_board", { id: board.id });
  });
});

describe("tasks + role inheritance via hub", () => {
  it("create_task with role_id auto-inherits role prompts", async () => {
    const board = await call<{ id: string }>("create_board", { name: "task-role-flow" });
    const full = await call<{ columns: { id: string }[] }>("get_board", { id: board.id });

    const prompt = await call<{ id: string }>("create_prompt", {
      name: "p-hub-1",
      content: "helper",
    });
    const role = await call<{ id: string }>("create_role", { name: "r-hub-1" });
    await call("set_role_prompts", { role_id: role.id, prompt_ids: [prompt.id] });

    const task = await call<{
      id: string;
      role_id: string | null;
      prompts: { id: string; origin: string }[];
    }>("create_task", {
      board_id: board.id,
      column_id: full.columns[0]!.id,
      title: "my task",
      role_id: role.id,
    });

    expect(task.role_id).toBe(role.id);
    expect(
      task.prompts.some((p) => p.id === prompt.id && p.origin === `role:${role.id}`)
    ).toBe(true);
  });

  it("create_task with prompt_ids attaches direct prompts", async () => {
    const board = await call<{ id: string }>("create_board", { name: "direct-prompts" });
    const full = await call<{ columns: { id: string }[] }>("get_board", { id: board.id });
    const prompt = await call<{ id: string }>("create_prompt", { name: "p-hub-2" });

    const task = await call<{ prompts: { id: string; origin: string }[] }>("create_task", {
      board_id: board.id,
      column_id: full.columns[0]!.id,
      title: "with direct",
      prompt_ids: [prompt.id],
    });
    expect(task.prompts).toEqual([
      expect.objectContaining({ id: prompt.id, origin: "direct" }),
    ]);
  });
});

describe("get_task_bundle returns XML string", () => {
  it("builds a valid context XML for a task with role + direct prompt", async () => {
    const board = await call<{ id: string }>("create_board", { name: "bundle-board" });
    const full = await call<{ columns: { id: string }[] }>("get_board", { id: board.id });
    const rolePrompt = await call<{ id: string }>("create_prompt", {
      name: "role-p",
      content: "role guidance",
    });
    const directPrompt = await call<{ id: string }>("create_prompt", {
      name: "direct-p",
      content: "direct guidance",
    });
    const role = await call<{ id: string }>("create_role", {
      name: "bundle-role",
      content: "I am a helpful assistant",
    });
    await call("set_role_prompts", { role_id: role.id, prompt_ids: [rolePrompt.id] });

    const task = await call<{ id: string }>("create_task", {
      board_id: board.id,
      column_id: full.columns[0]!.id,
      title: "Shipping feature",
      description: "Build the thing",
      role_id: role.id,
      prompt_ids: [directPrompt.id],
    });

    const bundle = await call<string>("get_task_bundle", { id: task.id });
    expect(typeof bundle).toBe("string");
    expect(bundle.startsWith("<role")).toBe(true);
    expect(bundle).toContain("Shipping feature");
    expect(bundle).toContain("I am a helpful assistant");
    expect(bundle).toContain("role guidance");
    expect(bundle).toContain("direct guidance");
    expect(bundle).toContain("<direct_prompts>");
  });
});

describe("ui tools", () => {
  it("get_ui_info returns the hub URL and port", async () => {
    const info = await call<{ url: string; port: number }>("get_ui_info", {});
    expect(info.url).toBe(hub.baseUrl);
    expect(info.port).toBe(handle.port);
  });
});

describe("multi-client parity", () => {
  it("two independent HubClients see each other's writes", async () => {
    const a = new HubClient(hub.baseUrl);
    const b = new HubClient(hub.baseUrl);

    const board = (await a.post<{ id: string }>("/api/boards", { name: "multi" })) as {
      id: string;
    };
    const viaB = (await b.get<{ id: string; name: string }>(
      `/api/boards/${board.id}`
    )) as { id: string; name: string };
    expect(viaB.id).toBe(board.id);
    expect(viaB.name).toBe("multi");
  });
});
