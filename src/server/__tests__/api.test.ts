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

  it("rejects invalid tag color and name", async () => {
    const badColor = await api("POST", "/api/tags", { name: "x", color: "red" });
    expect(badColor.status).toBe(400);

    const badName = await api("POST", "/api/tags", { name: "Bad Name!" });
    expect(badName.status).toBe(400);
  });

  it("returns 409 on duplicate tag name", async () => {
    const r1 = await api("POST", "/api/tags", { name: "dup-tag", kind: "skill" });
    expect(r1.status).toBe(201);
    const r2 = await api("POST", "/api/tags", { name: "dup-tag", kind: "skill" });
    expect(r2.status).toBe(409);
  });

  it("creates a tag and lists it", async () => {
    await api("POST", "/api/tags", {
      name: "react-perf",
      description: "Optimize React renders",
      color: "#ff6b6b",
      kind: "skill",
    });
    const list = await api("GET", "/api/tags");
    const tags = (await list.json()) as Array<{ name: string }>;
    expect(tags.some((t) => t.name === "react-perf")).toBe(true);
  });

  it("filters tags by kind", async () => {
    await api("POST", "/api/tags", { name: "staff-architect", kind: "role" });
    await api("POST", "/api/tags", { name: "ts-perf", kind: "skill" });
    await api("POST", "/api/tags", { name: "summarise", kind: "prompt" });

    const roles = (await (await api("GET", "/api/tags?kind=role")).json()) as Array<{
      name: string;
      kind: string;
    }>;
    expect(roles.every((t) => t.kind === "role")).toBe(true);
    expect(roles.some((t) => t.name === "staff-architect")).toBe(true);

    const prompts = (await (await api("GET", "/api/tags?kind=prompt")).json()) as Array<{
      name: string;
      kind: string;
    }>;
    expect(prompts.every((t) => t.kind === "prompt")).toBe(true);
  });

  it("rejects a tag created with an unknown kind", async () => {
    const res = await api("POST", "/api/tags", { name: "bogus", kind: "something" });
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
