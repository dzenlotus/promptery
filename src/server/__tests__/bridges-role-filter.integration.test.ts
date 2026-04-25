/**
 * Integration tests for bridge role-filter feature (#2).
 *
 * Verifies:
 *  - Bridge registration with role_id / role_ids is persisted and returned.
 *  - list_tasks?assigned_to_role=self with X-Bridge-Id header returns only
 *    tasks whose role_id is in the bridge's scope.
 *  - A bridge without role scope sees all tasks when using assigned_to_role=self.
 *  - Omitting assigned_to_role=self always returns all tasks regardless.
 */
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

async function api(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>
): Promise<Response> {
  const h: Record<string, string> = { ...(headers ?? {}) };
  let payload: string | undefined;
  if (body !== undefined) {
    h["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  return fetch(`${baseUrl}${path}`, { method, headers: h, body: payload });
}

describe("bridge registration with role scope", () => {
  it("stores role_id and returns it in the list", async () => {
    const res = await api("POST", "/api/bridges/register", {
      pid: 1,
      role_id: "role-planner",
    });
    expect(res.status).toBe(201);
    const bridge = (await res.json()) as { id: string; role_ids: string[] };
    expect(bridge.role_ids).toEqual(["role-planner"]);
  });

  it("stores role_ids list", async () => {
    const res = await api("POST", "/api/bridges/register", {
      pid: 2,
      role_ids: ["role-a", "role-b"],
    });
    const bridge = (await res.json()) as { id: string; role_ids: string[] };
    expect(bridge.role_ids).toHaveLength(2);
    expect(bridge.role_ids).toContain("role-a");
    expect(bridge.role_ids).toContain("role-b");
  });

  it("merges singular role_id with role_ids list", async () => {
    const res = await api("POST", "/api/bridges/register", {
      pid: 3,
      role_id: "role-extra",
      role_ids: ["role-x", "role-y"],
    });
    const bridge = (await res.json()) as { id: string; role_ids: string[] };
    expect(bridge.role_ids).toHaveLength(3);
    expect(bridge.role_ids).toContain("role-extra");
  });

  it("defaults to empty role_ids when none provided", async () => {
    const res = await api("POST", "/api/bridges/register", { pid: 4 });
    const bridge = (await res.json()) as { id: string; role_ids: string[] };
    expect(bridge.role_ids).toEqual([]);
  });
});

describe("list_tasks assigned_to_role=self filter", () => {
  let setupCounter = 0;
  async function setup() {
    const suffix = ++setupCounter;
    // Board + columns
    const board = (await (
      await api("POST", "/api/boards", { name: `filter-test-${suffix}` })
    ).json()) as { id: string };
    const columns = (await (
      await api("GET", `/api/boards/${board.id}/columns`)
    ).json()) as { id: string }[];
    const columnId = columns[0]!.id;

    // Two roles (unique names per setup call)
    const roleA = (await (
      await api("POST", "/api/roles", { name: `role-a-${suffix}` })
    ).json()) as { id: string };
    const roleB = (await (
      await api("POST", "/api/roles", { name: `role-b-${suffix}` })
    ).json()) as { id: string };

    // Three tasks: two with roles, one without
    const t1 = (await (
      await api("POST", `/api/boards/${board.id}/tasks`, { column_id: columnId, title: "task-a" })
    ).json()) as { id: string };
    await api("PUT", `/api/tasks/${t1.id}/role`, { role_id: roleA.id });

    const t2 = (await (
      await api("POST", `/api/boards/${board.id}/tasks`, { column_id: columnId, title: "task-b" })
    ).json()) as { id: string };
    await api("PUT", `/api/tasks/${t2.id}/role`, { role_id: roleB.id });

    const t3 = (await (
      await api("POST", `/api/boards/${board.id}/tasks`, { column_id: columnId, title: "task-no-role" })
    ).json()) as { id: string };

    return { board, columnId, roleA, roleB, t1, t2, t3 };
  }

  it("returns only role-scoped tasks when assigned_to_role=self matches role_id", async () => {
    const { board, roleA, t1, t2, t3 } = await setup();

    // Register a bridge scoped to roleA
    const bridge = (await (
      await api("POST", "/api/bridges/register", { pid: 10, role_id: roleA.id })
    ).json()) as { id: string };

    const res = await api(
      "GET",
      `/api/boards/${board.id}/tasks?assigned_to_role=self`,
      undefined,
      { "X-Bridge-Id": bridge.id }
    );
    expect(res.status).toBe(200);
    const tasks = (await res.json()) as { id: string }[];

    const ids = tasks.map((t) => t.id);
    expect(ids).toContain(t1.id);
    expect(ids).not.toContain(t2.id);
    expect(ids).not.toContain(t3.id);
  });

  it("returns all tasks when assigned_to_role=self but bridge has no role scope", async () => {
    const { board, t1, t2, t3 } = await setup();

    const bridge = (await (
      await api("POST", "/api/bridges/register", { pid: 11 })
    ).json()) as { id: string };

    const res = await api(
      "GET",
      `/api/boards/${board.id}/tasks?assigned_to_role=self`,
      undefined,
      { "X-Bridge-Id": bridge.id }
    );
    const tasks = (await res.json()) as { id: string }[];
    const ids = tasks.map((t) => t.id);
    expect(ids).toContain(t1.id);
    expect(ids).toContain(t2.id);
    expect(ids).toContain(t3.id);
  });

  it("returns all tasks when assigned_to_role=self but X-Bridge-Id is missing", async () => {
    const { board, t1, t2, t3 } = await setup();

    const res = await api("GET", `/api/boards/${board.id}/tasks?assigned_to_role=self`);
    const tasks = (await res.json()) as { id: string }[];
    const ids = tasks.map((t) => t.id);
    expect(ids).toContain(t1.id);
    expect(ids).toContain(t2.id);
    expect(ids).toContain(t3.id);
  });

  it("returns all tasks regardless of bridge role scope when assigned_to_role is omitted", async () => {
    const { board, roleA, t1, t2, t3 } = await setup();

    const bridge = (await (
      await api("POST", "/api/bridges/register", { pid: 12, role_id: roleA.id })
    ).json()) as { id: string };

    const res = await api("GET", `/api/boards/${board.id}/tasks`, undefined, {
      "X-Bridge-Id": bridge.id,
    });
    const tasks = (await res.json()) as { id: string }[];
    const ids = tasks.map((t) => t.id);
    expect(ids).toContain(t1.id);
    expect(ids).toContain(t2.id);
    expect(ids).toContain(t3.id);
  });

  it("filters correctly when bridge is scoped to multiple roles", async () => {
    const { board, roleA, roleB, t1, t2, t3 } = await setup();

    const bridge = (await (
      await api("POST", "/api/bridges/register", {
        pid: 13,
        role_ids: [roleA.id, roleB.id],
      })
    ).json()) as { id: string };

    const res = await api(
      "GET",
      `/api/boards/${board.id}/tasks?assigned_to_role=self`,
      undefined,
      { "X-Bridge-Id": bridge.id }
    );
    const tasks = (await res.json()) as { id: string }[];
    const ids = tasks.map((t) => t.id);
    expect(ids).toContain(t1.id);
    expect(ids).toContain(t2.id);
    expect(ids).not.toContain(t3.id);
  });
});
