import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startServer, type ServerHandle } from "../index.js";
import { _resetBridges } from "../bridgeRegistry.js";

let handle: ServerHandle;
let baseUrl: string;

beforeAll(async () => {
  handle = await startServer(0, 0);
  baseUrl = `http://localhost:${handle.port}`;
});

afterAll(async () => {
  await handle.close();
});

beforeEach(() => {
  _resetBridges();
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

describe("bridge registry API", () => {
  it("registers a bridge and returns it in the list", async () => {
    const res = await api("POST", "/api/bridges/register", {
      pid: 99,
      agent_hint: "test-agent",
    });
    expect(res.status).toBe(201);
    const bridge = (await res.json()) as { id: string; pid: number; agent_hint: string };
    expect(bridge.id).toBeTruthy();
    expect(bridge.pid).toBe(99);
    expect(bridge.agent_hint).toBe("test-agent");

    const list = (await (await api("GET", "/api/bridges")).json()) as unknown[];
    expect(list).toHaveLength(1);
  });

  it("heartbeat returns 200 for known bridge, 404 otherwise", async () => {
    const bridge = (await (
      await api("POST", "/api/bridges/register", { pid: 1 })
    ).json()) as { id: string };
    const beat = await api("POST", `/api/bridges/${bridge.id}/heartbeat`, {});
    expect(beat.status).toBe(200);

    const missing = await api("POST", `/api/bridges/unknown-id/heartbeat`, {});
    expect(missing.status).toBe(404);
  });

  it("unregister removes the bridge from the list", async () => {
    const bridge = (await (
      await api("POST", "/api/bridges/register", { pid: 2 })
    ).json()) as { id: string };
    await api("POST", `/api/bridges/${bridge.id}/unregister`, {});
    const list = (await (await api("GET", "/api/bridges")).json()) as unknown[];
    expect(list).toHaveLength(0);
  });

  it("supports multiple bridges simultaneously", async () => {
    await api("POST", "/api/bridges/register", { pid: 10, agent_hint: "a" });
    await api("POST", "/api/bridges/register", { pid: 11, agent_hint: "b" });
    const list = (await (await api("GET", "/api/bridges")).json()) as {
      agent_hint: string;
    }[];
    expect(list).toHaveLength(2);
    const hints = list.map((b) => b.agent_hint).sort();
    expect(hints).toEqual(["a", "b"]);
  });
});
