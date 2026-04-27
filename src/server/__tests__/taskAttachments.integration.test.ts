import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../index.js";
import { _setDbForTesting } from "../../db/index.js";
import { createTestDb, type TestDb } from "../../db/__tests__/helpers/testDb.js";
import {
  makeBoard,
  makeColumn,
  makeTask,
} from "../../db/__tests__/helpers/factories.js";
import { ATTACHMENT_MAX_BYTES } from "../../lib/attachmentStorage.js";
import { getAttachmentsDir } from "../../lib/paths.js";

const ORIGINAL_HOME = process.env.PROMPTERY_HOME_DIR;

/**
 * Integration suite for the per-task attachments HTTP surface. Mirrors the
 * pattern used by tasks-search.integration.test.ts — drive the real Hono
 * app via `app.fetch(Request)` against an in-memory DB, but additionally
 * pin PROMPTERY_HOME_DIR to a per-test tmp directory so file-system writes
 * land somewhere disposable.
 */
describe("HTTP API — task attachments integration", () => {
  let testDb: TestDb;
  let app: ReturnType<typeof createApp>["app"];
  let homeDir: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "promptery-attach-int-"));
    process.env.PROMPTERY_HOME_DIR = homeDir;
    testDb = createTestDb();
    _setDbForTesting(testDb.db);
    app = createApp().app;
  });

  afterEach(() => {
    _setDbForTesting(null);
    testDb.close();
    rmSync(homeDir, { recursive: true, force: true });
    if (ORIGINAL_HOME !== undefined) process.env.PROMPTERY_HOME_DIR = ORIGINAL_HOME;
  });

  function seedTask() {
    const board = makeBoard(testDb.db, { name: "AttachBoard" });
    const col = makeColumn(testDb.db, { board_id: board.id, name: "lane" });
    const task = makeTask(testDb.db, {
      column_id: col.id,
      number: 1,
      title: "needs files",
    });
    return { boardId: board.id, columnId: col.id, taskId: task.id };
  }

  async function fetchApp(path: string, init?: RequestInit): Promise<Response> {
    return await app.fetch(new Request(`http://test${path}`, init));
  }

  function multipartFor(filename: string, body: Buffer, mime = "image/png"): RequestInit {
    const fd = new FormData();
    const blob = new Blob([new Uint8Array(body)], { type: mime });
    fd.append("file", blob, filename);
    return { method: "POST", body: fd };
  }

  it("GET /attachments returns [] for a fresh task", async () => {
    const { taskId } = seedTask();
    const res = await fetchApp(`/api/tasks/${taskId}/attachments`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("POST /attachments uploads a file, lands on disk, returns metadata", async () => {
    const { taskId } = seedTask();
    const body = Buffer.from("PNG fake bytes");
    const res = await fetchApp(
      `/api/tasks/${taskId}/attachments`,
      multipartFor("hello.png", body)
    );
    expect(res.status).toBe(201);
    const row = (await res.json()) as {
      id: string;
      filename: string;
      mime_type: string;
      size_bytes: number;
      storage_path: string;
      task_id: string;
    };
    expect(row.task_id).toBe(taskId);
    expect(row.filename).toBe("hello.png");
    expect(row.mime_type).toBe("image/png");
    expect(row.size_bytes).toBe(body.byteLength);
    expect(row.storage_path).toMatch(new RegExp(`^${taskId}/`));

    // File is on disk in the home dir.
    const abs = join(getAttachmentsDir(), row.storage_path);
    expect(existsSync(abs)).toBe(true);
    expect(statSync(abs).size).toBe(body.byteLength);

    // Listing now returns the row.
    const list = (await (await fetchApp(`/api/tasks/${taskId}/attachments`)).json()) as unknown[];
    expect(list).toHaveLength(1);
  });

  it("POST without multipart returns 415", async () => {
    const { taskId } = seedTask();
    const res = await fetchApp(`/api/tasks/${taskId}/attachments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ignored: true }),
    });
    expect(res.status).toBe(415);
  });

  it("POST with file > 25 MiB returns 413 and writes nothing", async () => {
    const { taskId } = seedTask();
    const big = Buffer.alloc(ATTACHMENT_MAX_BYTES + 1, 0x61);
    const res = await fetchApp(
      `/api/tasks/${taskId}/attachments`,
      multipartFor("big.bin", big, "application/octet-stream")
    );
    expect(res.status).toBe(413);

    // No row written.
    const list = (await (await fetchApp(`/api/tasks/${taskId}/attachments`)).json()) as unknown[];
    expect(list).toEqual([]);
    // No file landed under the task dir.
    const dir = join(getAttachmentsDir(), taskId);
    if (existsSync(dir)) {
      // Directory may or may not exist depending on whether mkdir ran before
      // the size check; either way, nothing should remain inside it.
      expect(readdirSync(dir)).toEqual([]);
    }
  });

  it("POST to a missing task returns 404", async () => {
    const res = await fetchApp(
      "/api/tasks/no-such-task/attachments",
      multipartFor("a.png", Buffer.from("x"))
    );
    expect(res.status).toBe(404);
  });

  it("GET /download streams the file with the right content-type", async () => {
    const { taskId } = seedTask();
    const body = Buffer.from("the quick brown fox");
    const upload = await fetchApp(
      `/api/tasks/${taskId}/attachments`,
      multipartFor("note.txt", body, "text/plain")
    );
    const row = (await upload.json()) as { id: string };

    const dl = await fetchApp(
      `/api/tasks/${taskId}/attachments/${row.id}/download`
    );
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-type")).toBe("text/plain");
    const cd = dl.headers.get("content-disposition") ?? "";
    expect(cd).toMatch(/inline/);
    expect(cd).toMatch(/note\.txt/);
    expect(Buffer.from(await dl.arrayBuffer()).toString()).toBe(body.toString());
  });

  it("GET /download for missing attachment returns 404", async () => {
    const { taskId } = seedTask();
    const res = await fetchApp(
      `/api/tasks/${taskId}/attachments/nope/download`
    );
    expect(res.status).toBe(404);
  });

  it("DELETE removes the row and the file", async () => {
    const { taskId } = seedTask();
    const upload = await fetchApp(
      `/api/tasks/${taskId}/attachments`,
      multipartFor("kill.png", Buffer.from("kill"))
    );
    const row = (await upload.json()) as { id: string; storage_path: string };
    const abs = join(getAttachmentsDir(), row.storage_path);
    expect(existsSync(abs)).toBe(true);

    const del = await fetchApp(
      `/api/tasks/${taskId}/attachments/${row.id}`,
      { method: "DELETE" }
    );
    expect(del.status).toBe(200);
    expect(existsSync(abs)).toBe(false);

    const list = (await (await fetchApp(`/api/tasks/${taskId}/attachments`)).json()) as unknown[];
    expect(list).toEqual([]);
  });

  it("filename collisions land as -2, -3", async () => {
    const { taskId } = seedTask();
    await fetchApp(
      `/api/tasks/${taskId}/attachments`,
      multipartFor("dup.txt", Buffer.from("a"))
    );
    const second = await fetchApp(
      `/api/tasks/${taskId}/attachments`,
      multipartFor("dup.txt", Buffer.from("b"))
    );
    const row = (await second.json()) as { storage_path: string };
    expect(row.storage_path).toBe(`${taskId}/dup-2.txt`);
  });

  it("deleting a task wipes its attachments directory", async () => {
    const { taskId } = seedTask();
    await fetchApp(
      `/api/tasks/${taskId}/attachments`,
      multipartFor("a.txt", Buffer.from("a"))
    );
    await fetchApp(
      `/api/tasks/${taskId}/attachments`,
      multipartFor("b.txt", Buffer.from("b"))
    );
    const dir = join(getAttachmentsDir(), taskId);
    expect(existsSync(dir)).toBe(true);

    const del = await fetchApp(`/api/tasks/${taskId}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    expect(existsSync(dir)).toBe(false);
  });

  it("deleting a board sweeps every task's attachments directory", async () => {
    const { boardId, taskId } = seedTask();
    await fetchApp(
      `/api/tasks/${taskId}/attachments`,
      multipartFor("a.txt", Buffer.from("a"))
    );
    const dir = join(getAttachmentsDir(), taskId);
    expect(existsSync(dir)).toBe(true);

    const del = await fetchApp(`/api/boards/${boardId}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    expect(existsSync(dir)).toBe(false);
  });
});
