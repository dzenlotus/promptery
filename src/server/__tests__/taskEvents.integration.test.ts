import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { startServer, type ServerHandle } from "../index.js";

let handle: ServerHandle;
let baseUrl: string;
let wsUrl: string;

beforeAll(async () => {
  handle = await startServer(0, 0);
  baseUrl = `http://localhost:${handle.port}`;
  wsUrl = `ws://localhost:${handle.port}/ws`;
});

afterAll(async () => {
  await handle.close();
});

interface ApiOptions {
  actor?: string;
}

async function api(
  method: string,
  path: string,
  body?: unknown,
  opts: ApiOptions = {}
): Promise<Response> {
  const headers: Record<string, string> = {};
  let payload: string | undefined;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  if (opts.actor) headers["x-promptery-actor"] = opts.actor;
  return fetch(`${baseUrl}${path}`, { method, headers, body: payload });
}

interface MadeBoardCtx {
  boardId: string;
  columnAId: string;
  columnBId: string;
}

async function newBoardWithTwoColumns(): Promise<MadeBoardCtx> {
  const board = (await (
    await api("POST", "/api/boards", { name: "events-board" })
  ).json()) as { id: string };
  const cols = (await (await api("GET", `/api/boards/${board.id}/columns`)).json()) as {
    id: string;
  }[];
  // Boards seed with 4 default columns; pick the first two for moves.
  return {
    boardId: board.id,
    columnAId: cols[0]!.id,
    columnBId: cols[1]!.id,
  };
}

interface EventRow {
  id: string;
  task_id: string;
  type: string;
  actor: string | null;
  details: Record<string, unknown> | null;
  created_at: number;
}

async function listEvents(taskId: string, limit?: number): Promise<EventRow[]> {
  const qs = limit ? `?limit=${limit}` : "";
  const res = await api("GET", `/api/tasks/${taskId}/events${qs}`);
  expect(res.status).toBe(200);
  return (await res.json()) as EventRow[];
}

describe("task activity log", () => {
  it("records creation, role change, prompt add/remove and a move in reverse-chrono order", async () => {
    const ctx = await newBoardWithTwoColumns();
    const created = await api(
      "POST",
      `/api/boards/${ctx.boardId}/tasks`,
      { column_id: ctx.columnAId, title: "first" },
      { actor: "claude-desktop" }
    );
    const task = (await created.json()) as { id: string };

    const role = (await (
      await api("POST", "/api/roles", { name: "r-events" })
    ).json()) as { id: string };
    await api(
      "PUT",
      `/api/tasks/${task.id}/role`,
      { role_id: role.id },
      { actor: "claude-desktop" }
    );

    const prompt = (await (
      await api("POST", "/api/prompts", { name: "p-events" })
    ).json()) as { id: string };
    await api(
      "POST",
      `/api/tasks/${task.id}/prompts`,
      { prompt_id: prompt.id },
      { actor: "cursor" }
    );
    await api("DELETE", `/api/tasks/${task.id}/prompts/${prompt.id}`, undefined, {
      actor: "cursor",
    });

    await api(
      "POST",
      `/api/tasks/${task.id}/move`,
      { column_id: ctx.columnBId, position: 0 },
      { actor: "claude-desktop" }
    );

    const events = await listEvents(task.id);
    // Newest first — list contains 5 events: created, role_changed, prompt_added,
    // prompt_removed, moved (chronological), so reverse → moved first.
    expect(events.map((e) => e.type)).toEqual([
      "task.moved",
      "task.prompt_removed",
      "task.prompt_added",
      "task.role_changed",
      "task.created",
    ]);
    const moved = events[0]!;
    expect(moved.actor).toBe("claude-desktop");
    expect(moved.details).toMatchObject({
      old_column_id: ctx.columnAId,
      new_column_id: ctx.columnBId,
    });

    const promptAdded = events.find((e) => e.type === "task.prompt_added")!;
    expect(promptAdded.actor).toBe("cursor");
    expect(promptAdded.details).toMatchObject({ prompt_id: prompt.id, prompt_name: "p-events" });
  });

  it("PATCH update logs only when fields actually change and records the diff", async () => {
    const ctx = await newBoardWithTwoColumns();
    const created = await api("POST", `/api/boards/${ctx.boardId}/tasks`, {
      column_id: ctx.columnAId,
      title: "edit-me",
    });
    const task = (await created.json()) as { id: string };

    // No-op patch (same value) should NOT add an event row.
    await api("PATCH", `/api/tasks/${task.id}`, { title: "edit-me" });
    let events = await listEvents(task.id);
    expect(events.filter((e) => e.type === "task.updated")).toHaveLength(0);

    // Real change → one event.
    await api("PATCH", `/api/tasks/${task.id}`, {
      title: "renamed",
      description: "fresh body",
    });
    events = await listEvents(task.id);
    const upd = events.find((e) => e.type === "task.updated")!;
    expect(upd.actor).toBeNull(); // direct UI request — no actor header
    const changes = upd.details!.changes as Record<string, { from: unknown; to: unknown }>;
    expect(changes.title).toEqual({ from: "edit-me", to: "renamed" });
    expect(changes.description).toEqual({ from: "", to: "fresh body" });
  });

  it("limit query parameter clamps the response", async () => {
    const ctx = await newBoardWithTwoColumns();
    const created = await api("POST", `/api/boards/${ctx.boardId}/tasks`, {
      column_id: ctx.columnAId,
      title: "limit",
    });
    const task = (await created.json()) as { id: string };

    for (let i = 0; i < 5; i++) {
      await api("PATCH", `/api/tasks/${task.id}`, { title: `t-${i}` });
    }
    const limited = await listEvents(task.id, 2);
    expect(limited).toHaveLength(2);
  });

  it("returns 404 for a missing task", async () => {
    const res = await api("GET", "/api/tasks/does-not-exist/events");
    expect(res.status).toBe(404);
  });

  it("broadcasts task.event_recorded over WS with the canonical payload shape", async () => {
    const ctx = await newBoardWithTwoColumns();
    const created = await api("POST", `/api/boards/${ctx.boardId}/tasks`, {
      column_id: ctx.columnAId,
      title: "ws-watch",
    });
    const task = (await created.json()) as { id: string };

    const ws = new WebSocket(wsUrl);
    const messages: { type: string; data: unknown }[] = [];
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    ws.on("message", (raw) => {
      try {
        messages.push(JSON.parse(raw.toString()) as { type: string; data: unknown });
      } catch {
        // ignore
      }
    });

    await api("PATCH", `/api/tasks/${task.id}`, { title: "renamed-ws" }, { actor: "claude-desktop" });

    // Give the bus + ws a tick to fan out. 50ms is plenty in CI; we re-poll
    // just in case the host is slower.
    for (let i = 0; i < 20; i++) {
      if (messages.some((m) => m.type === "task.event_recorded")) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    ws.close();

    const recorded = messages.find((m) => m.type === "task.event_recorded");
    expect(recorded).toBeDefined();
    const payload = recorded!.data as {
      boardId: string;
      taskId: string;
      event: EventRow;
    };
    expect(payload.boardId).toBe(ctx.boardId);
    expect(payload.taskId).toBe(task.id);
    expect(payload.event.type).toBe("task.updated");
    expect(payload.event.actor).toBe("claude-desktop");
  });
});
