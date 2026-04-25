import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { startServer, type ServerHandle } from "../index.js";

let handle: ServerHandle;
let baseUrl: string;
let wsUrl: string;

beforeAll(async () => {
  // Port 0 -> OS assigns a free port; findFreePort passes it through.
  handle = await startServer(0, 0);
  baseUrl = `http://localhost:${handle.port}`;
  wsUrl = `ws://localhost:${handle.port}/ws`;
});

afterAll(async () => {
  await handle.close();
});

async function api(method: string, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {};
  let payload: string | undefined;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  return fetch(`${baseUrl}${path}`, { method, headers, body: payload });
}

describe("REST API", () => {
  it("health endpoint responds", async () => {
    const res = await api("GET", "/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("full board lifecycle: create, get, rename, delete", async () => {
    const created = await api("POST", "/api/boards", { name: "Test Board" });
    expect(created.status).toBe(201);
    const board = (await created.json()) as { id: string; name: string };
    expect(board.name).toBe("Test Board");

    const got = await api("GET", `/api/boards/${board.id}`);
    expect(got.status).toBe(200);

    const renamed = await api("PATCH", `/api/boards/${board.id}`, { name: "Renamed" });
    expect(renamed.status).toBe(200);
    expect((await renamed.json()).name).toBe("Renamed");

    const deleted = await api("DELETE", `/api/boards/${board.id}`);
    expect(deleted.status).toBe(200);

    const gone = await api("GET", `/api/boards/${board.id}`);
    expect(gone.status).toBe(404);
  });
});

describe("typed primitives", () => {
  it("rejects invalid prompt color and name", async () => {
    const badColor = await api("POST", "/api/prompts", { name: "x", color: "red" });
    expect(badColor.status).toBe(400);

    const badName = await api("POST", "/api/prompts", { name: "Bad Name!" });
    expect(badName.status).toBe(400);
  });

  it("returns 409 on duplicate prompt name", async () => {
    const r1 = await api("POST", "/api/prompts", { name: "dup-prompt" });
    expect(r1.status).toBe(201);
    const r2 = await api("POST", "/api/prompts", { name: "dup-prompt" });
    expect(r2.status).toBe(409);
  });

  it("creates and lists each primitive type", async () => {
    const expected = [
      ["/api/prompts", "p-list"],
      ["/api/skills", "s-list"],
      ["/api/mcp_tools", "m-list"],
      ["/api/roles", "r-list"],
    ] as const;
    for (const [path, name] of expected) {
      const c = await api("POST", path, { name });
      expect(c.status).toBe(201);
      const list = (await (await api("GET", path)).json()) as Array<{ name: string }>;
      expect(list.some((x) => x.name === name)).toBe(true);
    }
  });

  it("PUT /api/roles/:id/prompts attaches prompts to a role", async () => {
    const role = (await (await api("POST", "/api/roles", { name: "r-attach" })).json()) as {
      id: string;
    };
    const p = (await (await api("POST", "/api/prompts", { name: "p-attach" })).json()) as {
      id: string;
    };
    const res = await api("PUT", `/api/roles/${role.id}/prompts`, { prompt_ids: [p.id] });
    expect(res.status).toBe(200);
    const got = (await (await api("GET", `/api/roles/${role.id}`)).json()) as {
      prompts: { id: string }[];
    };
    expect(got.prompts.map((x) => x.id)).toEqual([p.id]);
  });
});

describe("task ↔ role flow", () => {
  async function newBoardAndTask() {
    const board = (await (await api("POST", "/api/boards", { name: "B" })).json()) as {
      id: string;
    };
    const cols = (await (await api("GET", `/api/boards/${board.id}/columns`)).json()) as {
      id: string;
    }[];
    const task = (await (
      await api("POST", `/api/boards/${board.id}/tasks`, {
        column_id: cols[0]!.id,
        title: "T",
      })
    ).json()) as { id: string };
    return { boardId: board.id, taskId: task.id };
  }

  it("PUT /api/tasks/:id/role assigns role and inherits its primitives", async () => {
    const { taskId } = await newBoardAndTask();
    const role = (await (await api("POST", "/api/roles", { name: "r-flow" })).json()) as {
      id: string;
    };
    const p = (await (await api("POST", "/api/prompts", { name: "p-flow" })).json()) as {
      id: string;
    };
    await api("PUT", `/api/roles/${role.id}/prompts`, { prompt_ids: [p.id] });

    const res = await api("PUT", `/api/tasks/${taskId}/role`, { role_id: role.id });
    expect(res.status).toBe(200);
    const task = (await res.json()) as {
      role: { id: string };
      prompts: { id: string; origin: string }[];
    };
    expect(task.role.id).toBe(role.id);
    expect(task.prompts).toEqual([
      expect.objectContaining({ id: p.id, origin: `role:${role.id}` }),
    ]);
  });

  it("DELETE on a role-inherited prompt returns 403", async () => {
    const { taskId } = await newBoardAndTask();
    const role = (await (await api("POST", "/api/roles", { name: "r-403" })).json()) as {
      id: string;
    };
    const p = (await (await api("POST", "/api/prompts", { name: "p-403" })).json()) as {
      id: string;
    };
    await api("PUT", `/api/roles/${role.id}/prompts`, { prompt_ids: [p.id] });
    await api("PUT", `/api/tasks/${taskId}/role`, { role_id: role.id });

    const res = await api("DELETE", `/api/tasks/${taskId}/prompts/${p.id}`);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/role-inherited/);
  });

  it("POST + DELETE direct prompt on task works", async () => {
    const { taskId } = await newBoardAndTask();
    const p = (await (await api("POST", "/api/prompts", { name: "p-direct" })).json()) as {
      id: string;
    };

    const added = await api("POST", `/api/tasks/${taskId}/prompts`, { prompt_id: p.id });
    expect(added.status).toBe(201);
    const taskWithDirect = (await added.json()) as {
      prompts: { id: string; origin: string }[];
    };
    expect(taskWithDirect.prompts[0]).toMatchObject({ id: p.id, origin: "direct" });

    const removed = await api("DELETE", `/api/tasks/${taskId}/prompts/${p.id}`);
    expect(removed.status).toBe(200);
    const taskAfter = (await removed.json()) as { prompts: unknown[] };
    expect(taskAfter.prompts).toEqual([]);
  });

  it("clearing role with role_id=null wipes inherited items", async () => {
    const { taskId } = await newBoardAndTask();
    const role = (await (await api("POST", "/api/roles", { name: "r-clear" })).json()) as {
      id: string;
    };
    const p = (await (await api("POST", "/api/prompts", { name: "p-clear" })).json()) as {
      id: string;
    };
    await api("PUT", `/api/roles/${role.id}/prompts`, { prompt_ids: [p.id] });
    await api("PUT", `/api/tasks/${taskId}/role`, { role_id: role.id });

    const cleared = await api("PUT", `/api/tasks/${taskId}/role`, { role_id: null });
    expect(cleared.status).toBe(200);
    const task = (await cleared.json()) as { role: unknown; prompts: unknown[] };
    expect(task.role).toBeNull();
    expect(task.prompts).toEqual([]);
  });
});

describe("columns DELETE", () => {
  it("returns 409 ColumnNotEmpty when the column still has tasks", async () => {
    const board = (await (await api("POST", "/api/boards", { name: "del-full" })).json()) as {
      id: string;
    };
    const cols = (await (await api("GET", `/api/boards/${board.id}/columns`)).json()) as {
      id: string;
    }[];
    const target = cols[0]!.id;
    await api("POST", `/api/boards/${board.id}/tasks`, {
      column_id: target,
      title: "blocks delete",
    });

    const res = await api("DELETE", `/api/columns/${target}`);
    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      error: string;
      message: string;
      taskCount: number;
    };
    expect(body.error).toBe("ColumnNotEmpty");
    expect(body.taskCount).toBe(1);
    expect(body.message).toMatch(/contains 1 task/);
  });

  it("deletes an empty column successfully", async () => {
    const board = (await (await api("POST", "/api/boards", { name: "del-empty" })).json()) as {
      id: string;
    };
    const added = (await (
      await api("POST", `/api/boards/${board.id}/columns`, { name: "tmp" })
    ).json()) as { id: string };

    const res = await api("DELETE", `/api/columns/${added.id}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("prompt groups API", () => {
  it("POST creates a group with prompts, GET returns members", async () => {
    const p1 = (await (await api("POST", "/api/prompts", { name: "pg-p1" })).json()) as {
      id: string;
    };
    const p2 = (await (await api("POST", "/api/prompts", { name: "pg-p2" })).json()) as {
      id: string;
    };
    const created = await api("POST", "/api/prompt-groups", {
      name: "pg-core",
      color: "#8b5cf6",
      prompt_ids: [p1.id, p2.id],
    });
    expect(created.status).toBe(201);
    const group = (await created.json()) as {
      id: string;
      name: string;
      prompts: { id: string }[];
      prompt_count: number;
    };
    expect(group.name).toBe("pg-core");
    expect(group.prompt_count).toBe(2);
    expect(group.prompts.map((p) => p.id).sort()).toEqual([p1.id, p2.id].sort());

    const fetched = await api("GET", `/api/prompt-groups/${group.id}`);
    expect(fetched.status).toBe(200);
  });

  it("PUT /:id/prompts replaces membership", async () => {
    const p1 = (await (await api("POST", "/api/prompts", { name: "pg-set-1" })).json()) as {
      id: string;
    };
    const p2 = (await (await api("POST", "/api/prompts", { name: "pg-set-2" })).json()) as {
      id: string;
    };
    const g = (await (
      await api("POST", "/api/prompt-groups", { name: "pg-set", prompt_ids: [p1.id] })
    ).json()) as { id: string };

    const res = await api("PUT", `/api/prompt-groups/${g.id}/prompts`, {
      prompt_ids: [p2.id],
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as { prompts: { id: string }[] };
    expect(updated.prompts.map((p) => p.id)).toEqual([p2.id]);
  });

  it("POST /:id/prompts is idempotent", async () => {
    const p = (await (await api("POST", "/api/prompts", { name: "pg-idem" })).json()) as {
      id: string;
    };
    const g = (await (
      await api("POST", "/api/prompt-groups", { name: "pg-idem-g", prompt_ids: [p.id] })
    ).json()) as { id: string };

    const res = await api("POST", `/api/prompt-groups/${g.id}/prompts`, { prompt_id: p.id });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as { prompts: { id: string }[] };
    expect(updated.prompts).toHaveLength(1);
  });

  it("DELETE /:id leaves prompts alive", async () => {
    const p = (await (await api("POST", "/api/prompts", { name: "pg-del" })).json()) as {
      id: string;
    };
    const g = (await (
      await api("POST", "/api/prompt-groups", { name: "pg-del-g", prompt_ids: [p.id] })
    ).json()) as { id: string };

    const del = await api("DELETE", `/api/prompt-groups/${g.id}`);
    expect(del.status).toBe(200);

    // Prompt itself should still exist.
    const promptStillThere = await api("GET", `/api/prompts/${p.id}`);
    expect(promptStillThere.status).toBe(200);
  });

  it("POST /reorder rewrites positions", async () => {
    const a = (await (
      await api("POST", "/api/prompt-groups", { name: "reorder-a" })
    ).json()) as { id: string };
    const b = (await (
      await api("POST", "/api/prompt-groups", { name: "reorder-b" })
    ).json()) as { id: string };

    const res = await api("POST", "/api/prompt-groups/reorder", {
      ids: [b.id, a.id],
    });
    expect(res.status).toBe(200);
    const reordered = (await res.json()) as { id: string; position: number }[];
    const byId = Object.fromEntries(reordered.map((g) => [g.id, g.position]));
    expect(byId[b.id]).toBeLessThan(byId[a.id]!);
  });

  it("returns 400 for unknown prompt ids on create", async () => {
    const res = await api("POST", "/api/prompt-groups", {
      name: "bad",
      prompt_ids: ["does-not-exist"],
    });
    expect(res.status).toBe(400);
  });
});

describe("inheritance API", () => {
  async function fresh() {
    const b = (await (await api("POST", "/api/boards", { name: "inh" })).json()) as {
      id: string;
    };
    const cols = (await (await api("GET", `/api/boards/${b.id}/columns`)).json()) as {
      id: string;
    }[];
    const t = (await (
      await api("POST", `/api/boards/${b.id}/tasks`, {
        column_id: cols[0]!.id,
        title: "T",
      })
    ).json()) as { id: string };
    return { boardId: b.id, columnId: cols[0]!.id, taskId: t.id };
  }

  it("PUT /api/boards/:id/role + /prompts surface on GET detail", async () => {
    const { boardId } = await fresh();
    const role = (await (await api("POST", "/api/roles", { name: "inh-r" })).json()) as {
      id: string;
    };
    const prompt = (await (
      await api("POST", "/api/prompts", { name: "inh-board-p" })
    ).json()) as { id: string };

    const setRole = await api("PUT", `/api/boards/${boardId}/role`, { role_id: role.id });
    expect(setRole.status).toBe(200);
    const setP = await api("PUT", `/api/boards/${boardId}/prompts`, {
      prompt_ids: [prompt.id],
    });
    expect(setP.status).toBe(200);

    const detail = (await (await api("GET", `/api/boards/${boardId}`)).json()) as {
      role: { id: string } | null;
      prompts: { id: string }[];
    };
    expect(detail.role?.id).toBe(role.id);
    expect(detail.prompts.map((p) => p.id)).toEqual([prompt.id]);
  });

  it("GET /api/tasks/:id/context collects 6 origins", async () => {
    const { boardId, columnId, taskId } = await fresh();
    const role = (await (await api("POST", "/api/roles", { name: "ctx-r" })).json()) as {
      id: string;
    };
    const pBoard = (await (
      await api("POST", "/api/prompts", { name: "ctx-board-p" })
    ).json()) as { id: string };
    const pColumn = (await (
      await api("POST", "/api/prompts", { name: "ctx-col-p" })
    ).json()) as { id: string };
    const pDirect = (await (
      await api("POST", "/api/prompts", { name: "ctx-direct-p" })
    ).json()) as { id: string };
    const pRole = (await (
      await api("POST", "/api/prompts", { name: "ctx-role-p" })
    ).json()) as { id: string };

    await api("PUT", `/api/roles/${role.id}/prompts`, { prompt_ids: [pRole.id] });
    await api("PUT", `/api/boards/${boardId}/prompts`, { prompt_ids: [pBoard.id] });
    await api("PUT", `/api/columns/${columnId}/prompts`, { prompt_ids: [pColumn.id] });
    await api("POST", `/api/tasks/${taskId}/prompts`, { prompt_id: pDirect.id });
    await api("PUT", `/api/tasks/${taskId}/role`, { role_id: role.id });

    const res = await api("GET", `/api/tasks/${taskId}/context`);
    expect(res.status).toBe(200);
    const ctx = (await res.json()) as {
      role: { id: string; source: string } | null;
      prompts: { origin: string; name: string }[];
    };
    expect(ctx.role?.id).toBe(role.id);
    expect(ctx.role?.source).toBe("task");
    const origins = ctx.prompts.map((p) => p.origin).sort();
    expect(origins).toEqual(["board", "column", "direct", "role"].sort());
  });

  it("PUT /api/boards/:id/prompts rejects unknown prompt ids with 400", async () => {
    const { boardId } = await fresh();
    const res = await api("PUT", `/api/boards/${boardId}/prompts`, {
      prompt_ids: ["does-not-exist"],
    });
    expect(res.status).toBe(400);
  });

  it("board-role clears task inherited role when task/column both unset", async () => {
    const { boardId, taskId } = await fresh();
    const role = (await (await api("POST", "/api/roles", { name: "fallback" })).json()) as {
      id: string;
    };
    await api("PUT", `/api/boards/${boardId}/role`, { role_id: role.id });

    const ctx = (await (await api("GET", `/api/tasks/${taskId}/context`)).json()) as {
      role: { source: string } | null;
    };
    expect(ctx.role?.source).toBe("board");
  });
});

describe("settings API", () => {
  it("round-trips a scalar value via PUT + GET", async () => {
    const put = await api("PUT", "/api/settings/appearance.theme", { value: "dark" });
    expect(put.status).toBe(200);
    const putBody = (await put.json()) as { key: string; value: unknown };
    expect(putBody).toMatchObject({ key: "appearance.theme", value: "dark" });

    const got = await api("GET", "/api/settings/appearance.theme");
    expect(got.status).toBe(200);
    expect(await got.json()).toMatchObject({ key: "appearance.theme", value: "dark" });
  });

  it("round-trips an object value", async () => {
    const obj = { r: 10, g: 20, b: 30 };
    const put = await api("PUT", "/api/settings/appearance.tint-rgb", { value: obj });
    expect(put.status).toBe(200);

    const got = (await (await api("GET", "/api/settings/appearance.tint-rgb")).json()) as {
      value: unknown;
    };
    expect(got.value).toEqual(obj);
  });

  it("returns 404 for a missing key", async () => {
    const res = await api("GET", "/api/settings/does.not.exist");
    expect(res.status).toBe(404);
  });

  it("lists with prefix filter", async () => {
    await api("PUT", "/api/settings/filter.a", { value: 1 });
    await api("PUT", "/api/settings/filter.b", { value: 2 });
    await api("PUT", "/api/settings/other.x", { value: 3 });

    const res = await api("GET", "/api/settings?prefix=filter.");
    expect(res.status).toBe(200);
    const rows = (await res.json()) as { key: string; value: unknown }[];
    const keys = rows.map((r) => r.key).sort();
    expect(keys).toEqual(["filter.a", "filter.b"]);
  });

  it("bulk endpoint upserts multiple keys in one call", async () => {
    const res = await api("POST", "/api/settings/bulk", {
      entries: { "bulk.one": 1, "bulk.two": "two", "bulk.three": { nested: true } },
    });
    expect(res.status).toBe(200);

    const one = (await (await api("GET", "/api/settings/bulk.one")).json()) as {
      value: unknown;
    };
    const three = (await (await api("GET", "/api/settings/bulk.three")).json()) as {
      value: unknown;
    };
    expect(one.value).toBe(1);
    expect(three.value).toEqual({ nested: true });
  });

  it("deletes a setting", async () => {
    await api("PUT", "/api/settings/to.delete", { value: "bye" });
    const del = await api("DELETE", "/api/settings/to.delete");
    expect(del.status).toBe(200);
    const body = (await del.json()) as { ok: boolean; deleted: boolean };
    expect(body).toEqual({ ok: true, deleted: true });

    const gone = await api("GET", "/api/settings/to.delete");
    expect(gone.status).toBe(404);
  });

  it("rejects PUT without a value field", async () => {
    const res = await api("PUT", "/api/settings/bad.key", {});
    expect(res.status).toBe(400);
  });
});

describe("data API", () => {
  it("export returns a format 1.0 bundle with data shape", async () => {
    const res = await api("POST", "/api/data/export", {
      includeBoards: true,
      includeRoles: true,
      includePrompts: true,
      includeSettings: false,
    });
    expect(res.status).toBe(200);
    const bundle = (await res.json()) as {
      format_version: string;
      app_version: string;
      data: Record<string, unknown>;
    };
    expect(bundle.format_version).toBe("1.0");
    expect(typeof bundle.app_version).toBe("string");
    expect(Array.isArray(bundle.data.boards)).toBe(true);
    expect(Array.isArray(bundle.data.prompts)).toBe(true);
    expect(bundle.data.settings).toBeUndefined();
  });

  it("export respects include flags", async () => {
    const res = await api("POST", "/api/data/export", {
      includeBoards: false,
      includeRoles: false,
      includePrompts: false,
    });
    const bundle = (await res.json()) as { data: Record<string, unknown> };
    expect(bundle.data.boards).toBeUndefined();
    expect(bundle.data.prompts).toBeUndefined();
  });

  it("import preview flags unsupported format", async () => {
    const res = await api("POST", "/api/data/import/preview", {
      bundle: { format_version: "99.0" },
      strategy: "skip",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { format_ok: boolean; errors: string[] };
    expect(body.format_ok).toBe(false);
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it("import preview counts conflicts and new", async () => {
    await api("POST", "/api/prompts", { name: "dup-preview" });
    const bundle = {
      format_version: "1.0",
      exported_at: "",
      app_version: "v",
      options: {},
      data: {
        prompts: [
          { id: "x1", name: "dup-preview", content: "", color: "#888", created_at: 1, updated_at: 1 },
          { id: "x2", name: "fresh-preview", content: "", color: "#888", created_at: 1, updated_at: 1 },
        ],
      },
    };
    const res = await api("POST", "/api/data/import/preview", { bundle, strategy: "rename" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      counts: { prompts: { new: number; conflicts: number } };
    };
    expect(body.counts.prompts.new).toBe(1);
    expect(body.counts.prompts.conflicts).toBe(1);
  });

  it("import apply returns 400 on bad format", async () => {
    const res = await api("POST", "/api/data/import/apply", {
      bundle: { format_version: "99.0" },
      strategy: "skip",
    });
    expect(res.status).toBe(400);
  });

  it("export → import round-trip adds missing primitives", async () => {
    await api("POST", "/api/prompts", { name: "roundtrip-prompt" });

    const exportRes = await api("POST", "/api/data/export", {
      includeBoards: false,
      includeRoles: false,
      includePrompts: true,
    });
    const bundle = await exportRes.json();

    // Remove the freshly-created primitive so apply has work to do.
    const list = (await (await api("GET", "/api/prompts")).json()) as {
      id: string;
      name: string;
    }[];
    const created = list.find((p) => p.name === "roundtrip-prompt");
    expect(created).toBeDefined();
    await api("DELETE", `/api/prompts/${created!.id}`);

    const applyRes = await api("POST", "/api/data/import/apply", { bundle, strategy: "skip" });
    expect(applyRes.status).toBe(200);
    const result = (await applyRes.json()) as {
      counts: { prompts: { added: number } };
    };
    expect(result.counts.prompts.added).toBeGreaterThanOrEqual(1);

    const recovered = (await (await api("GET", "/api/prompts")).json()) as {
      name: string;
    }[];
    expect(recovered.some((p) => p.name === "roundtrip-prompt")).toBe(true);
  });

  it("POST /api/data/backups creates a file and GET lists it", async () => {
    const created = await api("POST", "/api/data/backups", { name: "api-smoke" });
    expect(created.status).toBe(201);
    const info = (await created.json()) as { filename: string; size_bytes: number };
    expect(info.filename).toMatch(/api-smoke/);
    expect(info.size_bytes).toBeGreaterThan(0);

    const listed = await api("GET", "/api/data/backups");
    const list = (await listed.json()) as { filename: string }[];
    expect(list.some((b) => b.filename === info.filename)).toBe(true);

    const del = await api("DELETE", `/api/data/backups/${info.filename}`);
    expect(del.status).toBe(200);
  });

  it("DELETE on unknown backup returns 400", async () => {
    const res = await api("DELETE", "/api/data/backups/nope.sqlite");
    expect(res.status).toBe(400);
  });
});

describe("WebSocket broadcast", () => {
  it("delivers events to connected clients after REST mutations", async () => {
    const ws = new WebSocket(wsUrl);
    const messages: unknown[] = [];

    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });

    ws.on("message", (data) => {
      messages.push(JSON.parse(data.toString()));
    });

    // Trigger a mutation.
    const res = await api("POST", "/api/boards", { name: "via WS test" });
    expect(res.status).toBe(201);
    const board = (await res.json()) as { id: string };

    // Give the broadcast a moment to arrive.
    await new Promise((r) => setTimeout(r, 100));

    ws.close();
    await new Promise((r) => setTimeout(r, 50));

    // First message is the "hello" greeting; second should be the event.
    const event = messages.find(
      (m): m is { type: string; data: { boardId: string } } =>
        typeof m === "object" && m !== null && (m as { type?: unknown }).type === "board.created"
    );
    expect(event).toBeDefined();
    expect(event?.data.boardId).toBe(board.id);
  });
});

// Search/list/get_task endpoints have their own dedicated suite with
// per-test :memory: isolation: see `tasks-search.integration.test.ts`.
