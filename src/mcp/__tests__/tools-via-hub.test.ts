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
      "list_all_tasks",
      "search_tasks",
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
    // Bundle must be a well-formed XML document — single `<context>` root
    // wrapping role + task + inherited. Without the root, a strict XML
    // parser rejects the payload. See bug #15.
    expect(bundle.startsWith("<context>")).toBe(true);
    expect(bundle.trimEnd().endsWith("</context>")).toBe(true);
    expect(bundle).toContain("Shipping feature");
    expect(bundle).toContain("I am a helpful assistant");
    expect(bundle).toContain("role guidance");
    expect(bundle).toContain("direct guidance");
    expect(bundle).toContain("<direct_prompts>");
    // role guidance must appear exactly once — duplicate rendering between
    // <role><prompts> and <inherited> was the core of bug #15.
    const matches = bundle.match(/role guidance/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});

describe("ui tools", () => {
  it("get_ui_info returns the hub URL and port", async () => {
    const info = await call<{ url: string; port: number }>("get_ui_info", {});
    expect(info.url).toBe(hub.baseUrl);
    expect(info.port).toBe(handle.port);
  });
});

describe("search_tasks / list_all_tasks / get_task across multiple boards", () => {
  // Every task title and description in this block is namespaced with `MARK`
  // so assertions can be tightened against just-this-test fixtures even
  // though earlier blocks have already populated the shared in-memory DB.
  const MARK = "FTSLAB";

  type Hit = {
    task: {
      id: string;
      title: string;
      description: string;
      column_id: string;
      board_id: string;
      role_id: string | null;
    };
    column: { id: string; name: string; position: number };
    board: { id: string; name: string };
  };

  /**
   * Build a 3-board / 9-task fixture:
   *   Backend  (todo, in-progress, qa, done) — 4 tasks, two of them tagged "auth"
   *   Frontend (todo, ...)                    — 3 tasks, one tagged "auth", one with role
   *   Mobile   (todo, ...)                    — 2 tasks, no "auth"
   * That covers cross-board search, column filter, role filter, and the
   * "no-query lists everything" path.
   */
  async function buildFixture() {
    const ns = `${MARK}-${++fixtureSeq}`;
    const role = await call<{ id: string }>("create_role", { name: `${ns}-role` });

    async function addBoardWithTasks(
      name: string,
      tasks: Array<{
        title: string;
        description?: string;
        column: number;
        roleId?: string;
      }>
    ) {
      const board = await call<{ id: string }>("create_board", { name });
      const cols = (
        await call<{ columns: { id: string; name: string }[] }>("get_board", {
          id: board.id,
        })
      ).columns;
      const created: Array<{ id: string; columnId: string }> = [];
      for (const t of tasks) {
        const out = await call<{ id: string }>("create_task", {
          board_id: board.id,
          column_id: cols[t.column]!.id,
          title: t.title,
          ...(t.description !== undefined ? { description: t.description } : {}),
          ...(t.roleId ? { role_id: t.roleId } : {}),
        });
        created.push({ id: out.id, columnId: cols[t.column]!.id });
      }
      return { boardId: board.id, columns: cols, tasks: created };
    }

    const backend = await addBoardWithTasks(`${ns}-Backend`, [
      { title: `${ns} fix auth login bug`, column: 0 },
      { title: `${ns} migrate database`, column: 1 },
      { title: `${ns} review auth tokens`, description: "rotate them", column: 2 },
      { title: `${ns} ship release v3`, column: 3 },
    ]);
    const frontend = await addBoardWithTasks(`${ns}-Frontend`, [
      { title: `${ns} dark-mode polish`, column: 0 },
      { title: `${ns} auth screen redesign`, column: 1 },
      { title: `${ns} accessibility pass`, column: 0, roleId: role.id },
    ]);
    const mobile = await addBoardWithTasks(`${ns}-Mobile`, [
      { title: `${ns} push notifications`, column: 0 },
      { title: `${ns} offline cache`, column: 1 },
    ]);

    return { ns, roleId: role.id, backend, frontend, mobile };
  }

  // Filter to the rows this test actually created — the in-memory DB is
  // shared across describe blocks, so a global `MARK` prefix isn't enough.
  const onlyFixture = (hits: Hit[], ns: string): Hit[] =>
    hits.filter((h) => h.task.title.startsWith(ns));

  // Each it() needs its own fixture marker so unique-constrained names like
  // role.name don't collide on the shared in-memory DB. Bump a counter and
  // append it to the namespace passed into buildFixture().
  let fixtureSeq = 0;

  it("search_tasks: cross-board text query returns only matching tasks with location", async () => {
    const fx = await buildFixture();

    const hits = await call<Hit[]>("search_tasks", {
      query: `${fx.ns} auth`,
      limit: 50,
    });
    const mine = onlyFixture(hits, fx.ns);

    // Three of the nine fixture tasks contain the word "auth": two on Backend,
    // one on Frontend. Mobile must not appear.
    expect(mine).toHaveLength(3);

    const byBoard = new Map<string, Hit[]>();
    for (const h of mine) {
      const arr = byBoard.get(h.board.name) ?? [];
      arr.push(h);
      byBoard.set(h.board.name, arr);
    }
    expect(byBoard.get(`${fx.ns}-Backend`)).toHaveLength(2);
    expect(byBoard.get(`${fx.ns}-Frontend`)).toHaveLength(1);
    expect(byBoard.get(`${fx.ns}-Mobile`)).toBeUndefined();

    // Each hit must carry the location triple, not just the task.
    for (const h of mine) {
      expect(h.task.title.toLowerCase()).toContain("auth");
      expect(h.column.name).toBeTruthy();
      expect(h.board.name).toBeTruthy();
      expect(h.task.board_id).toBe(h.board.id);
      expect(h.task.column_id).toBe(h.column.id);
    }

    // Sanity check the fixture wired roles through, even if this test doesn't
    // filter by role_id directly.
    expect(fx.frontend.tasks).toHaveLength(3);
  });

  it("search_tasks: matches against description text, not just title", async () => {
    const fx = await buildFixture();

    // Only one fixture task has the word "rotate" — and it's in the
    // description, not the title. FTS5 must index both columns.
    const hits = await call<Hit[]>("search_tasks", {
      query: `${fx.ns} rotate`,
      limit: 50,
    });
    const mine = onlyFixture(hits, fx.ns);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.task.title).toContain("review auth tokens");
  });

  it("search_tasks: filters by board_id narrow to one board", async () => {
    const fx = await buildFixture();

    const hits = await call<Hit[]>("search_tasks", {
      query: `${fx.ns} auth`,
      board_id: fx.backend.boardId,
      limit: 50,
    });
    const mine = onlyFixture(hits, fx.ns);
    expect(mine.map((h) => h.board.id)).toEqual([
      fx.backend.boardId,
      fx.backend.boardId,
    ]);
    expect(new Set(mine.map((h) => h.task.id))).toEqual(
      new Set([fx.backend.tasks[0]!.id, fx.backend.tasks[2]!.id])
    );
  });

  it("search_tasks: filters by column_id narrow to one column", async () => {
    const fx = await buildFixture();

    // backend.columns[2] is "qa" — only the "review auth tokens" task lives there.
    const hits = await call<Hit[]>("search_tasks", {
      query: `${fx.ns} auth`,
      column_id: fx.backend.columns[2]!.id,
      limit: 50,
    });
    const mine = onlyFixture(hits, fx.ns);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.task.id).toBe(fx.backend.tasks[2]!.id);
    expect(mine[0]!.column.name).toBe("qa");
  });

  it("list_all_tasks: filters by role_id without requiring a query", async () => {
    const fx = await buildFixture();

    // Only the "accessibility pass" Frontend task carries the role.
    const hits = await call<Hit[]>("list_all_tasks", {
      role_id: fx.roleId,
      limit: 50,
    });
    const mine = onlyFixture(hits, fx.ns);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.task.id).toBe(fx.frontend.tasks[2]!.id);
    expect(mine[0]!.task.role_id).toBe(fx.roleId);
  });

  it("list_all_tasks: returns every fixture task across all boards in one call", async () => {
    const fx = await buildFixture();

    const hits = await call<Hit[]>("list_all_tasks", { limit: 500 });
    const mine = onlyFixture(hits, fx.ns);

    // 4 + 3 + 2 = 9 fixture tasks — one MCP call, no per-board walking.
    expect(mine).toHaveLength(9);

    const byBoardCount = new Map<string, number>();
    for (const h of mine) byBoardCount.set(h.board.name, (byBoardCount.get(h.board.name) ?? 0) + 1);
    expect(byBoardCount.get(`${fx.ns}-Backend`)).toBe(4);
    expect(byBoardCount.get(`${fx.ns}-Frontend`)).toBe(3);
    expect(byBoardCount.get(`${fx.ns}-Mobile`)).toBe(2);

    // Every fixture task must be present at least once.
    const ids = new Set(mine.map((h) => h.task.id));
    for (const t of [...fx.backend.tasks, ...fx.frontend.tasks, ...fx.mobile.tasks]) {
      expect(ids.has(t.id)).toBe(true);
    }
  });

  it("list_all_tasks: limit caps the response volume", async () => {
    await buildFixture();

    const hits = await call<Hit[]>("list_all_tasks", { limit: 5 });
    expect(hits.length).toBeLessThanOrEqual(5);
  });

  it("list_all_tasks: board_id filter scopes the listing", async () => {
    const fx = await buildFixture();

    const hits = await call<Hit[]>("list_all_tasks", {
      board_id: fx.mobile.boardId,
      limit: 50,
    });
    const mine = onlyFixture(hits, fx.ns);
    expect(mine).toHaveLength(2);
    for (const h of mine) {
      expect(h.board.id).toBe(fx.mobile.boardId);
      expect(h.board.name).toBe(`${fx.ns}-Mobile`);
    }
  });

  it("get_task: returns the lite task + column + board shape", async () => {
    const fx = await buildFixture();

    const target = fx.backend.tasks[2]!; // "review auth tokens"
    const got = await call<Hit & Record<string, unknown>>("get_task", { id: target.id });

    expect(got.task.id).toBe(target.id);
    expect(got.task.title).toBe(`${fx.ns} review auth tokens`);
    expect(got.task.description).toBe("rotate them");
    expect(got.column.id).toBe(target.columnId);
    expect(got.column.name).toBe("qa");
    expect(got.board.id).toBe(fx.backend.boardId);
    expect(got.board.name).toBe(`${fx.ns}-Backend`);

    // Lite variant: must not pull the heavy bundle keys (those are reserved
    // for get_task_bundle / get_task_context).
    expect((got as Record<string, unknown>).prompts).toBeUndefined();
    expect((got as Record<string, unknown>).skills).toBeUndefined();
    expect((got as Record<string, unknown>).mcp_tools).toBeUndefined();
  });

  it("search_tasks: empty result set returns [] without error", async () => {
    const fx = await buildFixture();

    const hits = await call<Hit[]>("search_tasks", {
      query: `${fx.ns}-token-that-matches-nothing-zzzz`,
    });
    expect(hits).toEqual([]);
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
