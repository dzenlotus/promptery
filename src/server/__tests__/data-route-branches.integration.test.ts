/**
 * Branch-coverage tests for src/server/routes/data.ts.
 *
 * Exercises branches in /import/preview, /import/apply, and backup routes.
 * Backup tests avoid touching the real filesystem by relying on the route's
 * own error-handling branches (a missing backup file surfaces as a 400).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createApp } from "../index.js";
import { _setDbForTesting } from "../../db/index.js";
import { createTestDb, type TestDb } from "../../db/__tests__/helpers/testDb.js";
import {
  makeBoard,
  makeColumn,
  makeTask,
  makePrompt,
  makeRole,
} from "../../db/__tests__/helpers/factories.js";
import { buildExport, EXPORT_FORMAT_VERSION, type ExportBundle } from "../../db/export.js";

let testDb: TestDb;
let app: ReturnType<typeof createApp>["app"];

beforeEach(() => {
  testDb = createTestDb();
  _setDbForTesting(testDb.db);
  app = createApp().app;
});

afterEach(() => {
  _setDbForTesting(null);
  testDb.close();
});

async function req(
  method: string,
  path: string,
  body?: unknown
): Promise<Response> {
  const headers: Record<string, string> = {};
  let payload: string | undefined;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  return app.fetch(
    new Request(`http://test${path}`, { method, headers, body: payload })
  );
}

function makeValidBundle(): ExportBundle {
  return buildExport(testDb.db, {}, "0.0.0");
}

// ---------------------------------------------------------------------------
// POST /api/data/export
// ---------------------------------------------------------------------------

describe("POST /api/data/export", () => {
  it("exports with default options", async () => {
    makeBoard(testDb.db);
    const res = await req("POST", "/api/data/export", {});
    expect(res.status).toBe(200);
    const bundle = (await res.json()) as ExportBundle;
    expect(bundle.format_version).toBe(EXPORT_FORMAT_VERSION);
  });

  it("exports with includeSettings flag", async () => {
    const res = await req("POST", "/api/data/export", {
      includeSettings: true,
    });
    expect(res.status).toBe(200);
    const bundle = (await res.json()) as ExportBundle;
    expect(bundle.options.includeSettings).toBe(true);
  });

  it("exports with boardIds filter", async () => {
    const board = makeBoard(testDb.db);
    const res = await req("POST", "/api/data/export", {
      boardIds: [board.id],
    });
    expect(res.status).toBe(200);
    const bundle = (await res.json()) as ExportBundle;
    expect(bundle.data.boards?.length).toBe(1);
    expect(bundle.data.boards![0]!.id).toBe(board.id);
  });
});

// ---------------------------------------------------------------------------
// POST /api/data/import/preview
// ---------------------------------------------------------------------------

describe("POST /api/data/import/preview", () => {
  it("returns format_ok for a valid bundle", async () => {
    const bundle = makeValidBundle();
    const res = await req("POST", "/api/data/import/preview", {
      bundle,
      strategy: "skip",
    });
    expect(res.status).toBe(200);
    const preview = (await res.json()) as { format_ok: boolean };
    expect(preview.format_ok).toBe(true);
  });

  it("returns format_ok=false for null bundle", async () => {
    const res = await req("POST", "/api/data/import/preview", {
      bundle: null,
      strategy: "skip",
    });
    expect(res.status).toBe(200);
    const preview = (await res.json()) as {
      format_ok: boolean;
      errors: string[];
    };
    expect(preview.format_ok).toBe(false);
    expect(preview.errors.length).toBeGreaterThan(0);
  });

  it("uses default strategy when strategy is omitted", async () => {
    const bundle = makeValidBundle();
    const res = await req("POST", "/api/data/import/preview", { bundle });
    expect(res.status).toBe(200);
    const preview = (await res.json()) as { format_ok: boolean };
    expect(preview.format_ok).toBe(true);
  });

  it("returns conflict counts when a prompt name already exists", async () => {
    makePrompt(testDb.db, { name: "conflict-p" });
    const bundle = makeValidBundle(); // includes "conflict-p"

    // Build a second DB with the same prompt name to guarantee conflict
    const res = await req("POST", "/api/data/import/preview", {
      bundle,
      strategy: "rename",
    });
    expect(res.status).toBe(200);
    const preview = (await res.json()) as {
      counts: { prompts: { conflicts: number } };
    };
    // conflict-p was already in the DB and is in the bundle too
    expect(preview.counts.prompts.conflicts).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// POST /api/data/import/apply
// ---------------------------------------------------------------------------

describe("POST /api/data/import/apply", () => {
  it("applies a valid bundle and returns counts", async () => {
    // Populate source data
    const prompt = makePrompt(testDb.db, { name: "apply-p" });
    const role = makeRole(testDb.db, { name: "apply-r" });
    const board = makeBoard(testDb.db, { name: "apply-b" });
    const col = makeColumn(testDb.db, { board_id: board.id });
    makeTask(testDb.db, { column_id: col.id });

    const bundle = buildExport(testDb.db, {}, "0.0.0");

    // Reset DB to empty state — apply will recreate everything
    testDb.close();
    testDb = createTestDb();
    _setDbForTesting(testDb.db);
    app = createApp().app;

    const res = await req("POST", "/api/data/import/apply", {
      bundle,
      strategy: "skip",
    });
    expect(res.status).toBe(200);
    const result = (await res.json()) as {
      counts: { boards: { added: number }; prompts: { added: number } };
    };
    expect(result.counts.boards.added).toBe(1);
    expect(result.counts.prompts.added).toBe(1);

    // Suppress unused variable warnings
    void prompt;
    void role;
  });

  it("returns 400 when bundle has wrong format_version", async () => {
    const badBundle = {
      format_version: "99.99",
      exported_at: new Date().toISOString(),
      app_version: "0.0.0",
      options: {},
      data: {},
    };
    const res = await req("POST", "/api/data/import/apply", {
      bundle: badBundle,
      strategy: "skip",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Unsupported format_version");
  });

  it("returns 400 when bundle is null", async () => {
    const res = await req("POST", "/api/data/import/apply", {
      bundle: null,
      strategy: "skip",
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Backup routes (error branches — no real filesystem)
// ---------------------------------------------------------------------------

describe("backup routes — error branches", () => {
  it("GET /api/data/backups returns a list (possibly empty)", async () => {
    const res = await req("GET", "/api/data/backups");
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(Array.isArray(list)).toBe(true);
  });

  it("POST /api/data/backups/:filename/restore returns 400 for missing file", async () => {
    const res = await req(
      "POST",
      "/api/data/backups/nonexistent-file.db/restore"
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBeTruthy();
  });

  it("DELETE /api/data/backups/:filename returns 400 for missing file", async () => {
    const res = await req("DELETE", "/api/data/backups/nonexistent-file.db");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBeTruthy();
  });
});
