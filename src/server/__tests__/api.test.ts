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
