/**
 * Branch-coverage tests for src/db/import.ts.
 *
 * Exercises the guards that were never hit by existing tests:
 *   - null / undefined bundle → error
 *   - wrong format_version → error
 *   - skip vs rename strategies for primitives and boards
 *   - empty primitive arrays (idMap stays empty)
 *   - role link rows with missing idMap entries (skipped)
 *   - task link rows with role-inherited origin (downgraded to "direct")
 *   - settings upsert path
 *   - boards with tasks that reference prompts/skills/mcp_tools
 *   - board id collision with "rename" strategy
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, type TestDb } from "./helpers/testDb.js";
import { previewImport, applyImport } from "../import.js";
import { buildExport, EXPORT_FORMAT_VERSION, type ExportBundle } from "../export.js";
import {
  makeBoard,
  makeColumn,
  makeTask,
  makePrompt,
  makeRole,
} from "./helpers/factories.js";

let testDb: TestDb;

beforeEach(() => {
  testDb = createTestDb();
});

afterEach(() => {
  testDb.close();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBundle(overrides: Partial<ExportBundle> = {}): ExportBundle {
  return {
    format_version: EXPORT_FORMAT_VERSION,
    exported_at: new Date().toISOString(),
    app_version: "0.0.0",
    options: {},
    data: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// previewImport — null / wrong-version guards
// ---------------------------------------------------------------------------

describe("previewImport — guard branches", () => {
  it("returns format_ok=false and an error for a null bundle", () => {
    const preview = previewImport(testDb.db, null, "skip");
    expect(preview.format_ok).toBe(false);
    expect(preview.errors).toContain("Bundle is empty");
  });

  it("returns format_ok=false and an error for undefined bundle", () => {
    const preview = previewImport(testDb.db, undefined, "skip");
    expect(preview.format_ok).toBe(false);
    expect(preview.errors).toContain("Bundle is empty");
  });

  it("returns format_ok=false for wrong format_version", () => {
    const bundle = makeBundle({ format_version: "99.99" });
    const preview = previewImport(testDb.db, bundle, "skip");
    expect(preview.format_ok).toBe(false);
    expect(preview.errors[0]).toContain("Unsupported format_version");
  });

  it("counts prompts correctly when no existing names conflict", () => {
    const bundle = makeBundle({
      data: {
        prompts: [
          {
            id: "p1",
            name: "brand-new-prompt",
            content: "body",
            color: "#abc",
            created_at: Date.now(),
            updated_at: Date.now(),
          },
        ],
      },
    });
    const preview = previewImport(testDb.db, bundle, "skip");
    expect(preview.format_ok).toBe(true);
    expect(preview.counts.prompts.total).toBe(1);
    expect(preview.counts.prompts.new).toBe(1);
    expect(preview.counts.prompts.conflicts).toBe(0);
  });

  it("counts a prompt as conflicting when its name already exists", () => {
    makePrompt(testDb.db, { name: "existing-p" });
    const bundle = makeBundle({
      data: {
        prompts: [
          {
            id: "p2",
            name: "existing-p",
            content: "dup",
            color: null,
            created_at: Date.now(),
            updated_at: Date.now(),
          },
        ],
      },
    });
    const preview = previewImport(testDb.db, bundle, "skip");
    expect(preview.counts.prompts.conflicts).toBe(1);
    expect(preview.conflicts.prompts[0]?.name).toBe("existing-p");
    expect(preview.conflicts.prompts[0]?.resolution).toBe("skip");
  });

  it("uses rename strategy in conflict resolution field", () => {
    makePrompt(testDb.db, { name: "existing-r" });
    const bundle = makeBundle({
      data: {
        prompts: [
          {
            id: "pr1",
            name: "existing-r",
            content: "",
            color: null,
            created_at: Date.now(),
            updated_at: Date.now(),
          },
        ],
      },
    });
    const preview = previewImport(testDb.db, bundle, "rename");
    expect(preview.conflicts.prompts[0]?.resolution).toBe("rename");
  });

  it("counts settings total", () => {
    const bundle = makeBundle({
      data: {
        settings: [
          { key: "k1", value: "v1", updated_at: Date.now() },
          { key: "k2", value: "v2", updated_at: Date.now() },
        ],
      },
    });
    const preview = previewImport(testDb.db, bundle, "skip");
    expect(preview.counts.settings.total).toBe(2);
  });

  it("counts board conflicts when same board id already exists", () => {
    const board = makeBoard(testDb.db);
    const bundle = makeBundle({
      data: {
        boards: [
          {
            id: board.id,
            name: board.name,
            created_at: Date.now(),
            updated_at: Date.now(),
          },
        ],
      },
    });
    const preview = previewImport(testDb.db, bundle, "skip");
    expect(preview.counts.boards.conflicts).toBe(1);
    expect(preview.counts.boards.new).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// applyImport — null / wrong-version throws
// ---------------------------------------------------------------------------

describe("applyImport — guard branches", () => {
  it("throws for null bundle", () => {
    expect(() => applyImport(testDb.db, null, "skip")).toThrow(/Unsupported format_version/);
  });

  it("throws for undefined bundle", () => {
    expect(() => applyImport(testDb.db, undefined, "skip")).toThrow(/Unsupported format_version/);
  });

  it("throws for wrong format_version", () => {
    const bundle = makeBundle({ format_version: "99.99" });
    expect(() => applyImport(testDb.db, bundle, "skip")).toThrow(/Unsupported format_version/);
  });
});

// ---------------------------------------------------------------------------
// applyImport — primitive import branches
// ---------------------------------------------------------------------------

describe("applyImport — primitives: skip strategy", () => {
  it("skips a prompt whose name already exists and points relations at the existing row", () => {
    const existing = makePrompt(testDb.db, { name: "dup-prompt-s" });
    const role = makeRole(testDb.db, { name: "role-for-dup" });

    const bundle = makeBundle({
      data: {
        roles: [
          {
            id: role.id,
            name: role.name,
            content: role.content,
            color: null,
            created_at: Date.now(),
            updated_at: Date.now(),
          },
        ],
        prompts: [
          {
            id: "imported-p-id",
            name: "dup-prompt-s",
            content: "dup body",
            color: null,
            created_at: Date.now(),
            updated_at: Date.now(),
          },
        ],
        role_prompts: [
          { role_id: role.id, prompt_id: "imported-p-id", position: 0 },
        ],
      },
    });
    const result = applyImport(testDb.db, bundle, "skip");
    expect(result.counts.prompts.skipped).toBe(1);
    expect(result.counts.prompts.added).toBe(0);

    // The role-prompt link should now point at the existing prompt
    const link = testDb.db
      .prepare("SELECT * FROM role_prompts WHERE role_id = ? AND prompt_id = ?")
      .get(role.id, existing.id);
    expect(link).toBeTruthy();
  });

  it("skips a board whose id already exists", () => {
    const board = makeBoard(testDb.db);
    const col = makeColumn(testDb.db, { board_id: board.id });

    const bundle = makeBundle({
      data: {
        boards: [
          {
            id: board.id,
            name: board.name,
            created_at: Date.now(),
            updated_at: Date.now(),
          },
        ],
        columns: [
          {
            id: col.id,
            board_id: board.id,
            name: col.name,
            position: col.position,
            created_at: Date.now(),
          },
        ],
      },
    });

    const result = applyImport(testDb.db, bundle, "skip");
    expect(result.counts.boards.skipped).toBe(1);
    expect(result.counts.boards.added).toBe(0);
    // Original column should not be duplicated
    const cols = testDb.db
      .prepare("SELECT * FROM columns WHERE board_id = ?")
      .all(board.id) as { id: string }[];
    expect(cols.length).toBe(1);
  });
});

describe("applyImport — primitives: rename strategy", () => {
  it("renames a prompt whose name already exists", () => {
    makePrompt(testDb.db, { name: "dup-rn" });

    const bundle = makeBundle({
      data: {
        prompts: [
          {
            id: "dup-rn-id",
            name: "dup-rn",
            content: "body",
            color: null,
            created_at: Date.now(),
            updated_at: Date.now(),
          },
        ],
      },
    });

    const result = applyImport(testDb.db, bundle, "rename");
    expect(result.counts.prompts.renamed).toBe(1);

    const names = (
      testDb.db.prepare("SELECT name FROM prompts ORDER BY name").all() as {
        name: string;
      }[]
    ).map((r) => r.name);
    // Both the original and the imported (renamed) should exist
    expect(names.filter((n) => n.startsWith("dup-rn")).length).toBe(2);
  });

  it("renames a board whose id already exists and re-numbers tasks", () => {
    const board = makeBoard(testDb.db);
    const col = makeColumn(testDb.db, { board_id: board.id });
    makeTask(testDb.db, { column_id: col.id, number: 1 });

    const bundle = makeBundle({
      data: {
        boards: [
          {
            id: board.id,
            name: board.name,
            created_at: Date.now(),
            updated_at: Date.now(),
          },
        ],
        columns: [
          {
            id: col.id,
            board_id: board.id,
            name: col.name,
            position: col.position,
            created_at: Date.now(),
          },
        ],
        tasks: [
          {
            id: "task-x",
            board_id: board.id,
            column_id: col.id,
            number: 1,
            title: "imported task",
            description: "",
            position: 0,
            role_id: null,
            created_at: Date.now(),
            updated_at: Date.now(),
          },
        ],
      },
    });

    const result = applyImport(testDb.db, bundle, "rename");
    expect(result.counts.boards.renamed).toBe(1);
    expect(result.counts.tasks.added).toBe(1);

    // The imported task should have a fresh id (not "task-x")
    const original = testDb.db
      .prepare("SELECT id FROM tasks WHERE id = ?")
      .get("task-x");
    expect(original).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// applyImport — settings upsert
// ---------------------------------------------------------------------------

describe("applyImport — settings upsert", () => {
  it("upserts settings from the bundle", () => {
    const bundle = makeBundle({
      data: {
        settings: [
          { key: "theme", value: "dark", updated_at: Date.now() },
          { key: "lang", value: "en", updated_at: Date.now() },
        ],
      },
    });

    const result = applyImport(testDb.db, bundle, "skip");
    expect(result.counts.settings.upserted).toBe(2);

    const theme = testDb.db
      .prepare("SELECT value FROM settings WHERE key = 'theme'")
      .get() as { value: string } | undefined;
    expect(theme?.value).toBe("dark");
  });

  it("does not upsert when settings array is empty", () => {
    const bundle = makeBundle({ data: { settings: [] } });
    const result = applyImport(testDb.db, bundle, "skip");
    expect(result.counts.settings.upserted).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// applyImport — role link edge cases
// ---------------------------------------------------------------------------

describe("applyImport — role link edge cases", () => {
  it("skips role_prompt links when role was not in the idMap", () => {
    const prompt = makePrompt(testDb.db, { name: "linked-p" });

    // Bundle has a role_prompt link but no role row → roleIdMap has no entry
    const bundle = makeBundle({
      data: {
        prompts: [
          {
            id: prompt.id,
            name: prompt.name,
            content: prompt.content,
            color: null,
            created_at: Date.now(),
            updated_at: Date.now(),
          },
        ],
        role_prompts: [
          { role_id: "ghost-role", prompt_id: prompt.id, position: 0 },
        ],
      },
    });

    const result = applyImport(testDb.db, bundle, "skip");
    expect(result.counts.prompts.skipped).toBe(1); // name already exists, skipped
    // No crash expected
  });

  it("imports skills and mcp_tools and their role links", () => {
    const role = makeRole(testDb.db, { name: "r-skills" });
    const bundle = makeBundle({
      data: {
        roles: [
          {
            id: role.id,
            name: role.name,
            content: "",
            color: null,
            created_at: Date.now(),
            updated_at: Date.now(),
          },
        ],
        skills: [
          {
            id: "sk1",
            name: "imported-skill",
            content: "",
            color: null,
            created_at: Date.now(),
            updated_at: Date.now(),
          },
        ],
        mcp_tools: [
          {
            id: "mt1",
            name: "imported-mcp",
            content: "",
            color: null,
            created_at: Date.now(),
            updated_at: Date.now(),
          },
        ],
        role_skills: [{ role_id: role.id, skill_id: "sk1", position: 0 }],
        role_mcp_tools: [{ role_id: role.id, mcp_tool_id: "mt1", position: 0 }],
      },
    });

    const result = applyImport(testDb.db, bundle, "skip");
    // roles was skipped (same name already exists), skills and mcp_tools added
    expect(result.counts.skills.added).toBe(1);
    expect(result.counts.mcp_tools.added).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// applyImport — task link with role-inherited origin
// ---------------------------------------------------------------------------

describe("applyImport — task link origin downgrade", () => {
  it("imports a task prompt link that had role-inherited origin as 'direct'", () => {
    const prompt = makePrompt(testDb.db, { name: "tp-orig" });
    const now = Date.now();

    const bundle = makeBundle({
      data: {
        boards: [
          {
            id: "brd-link",
            name: "Link Board",
            created_at: now,
            updated_at: now,
          },
        ],
        columns: [
          {
            id: "col-link",
            board_id: "brd-link",
            name: "col",
            position: 0,
            created_at: now,
          },
        ],
        tasks: [
          {
            id: "tsk-link",
            board_id: "brd-link",
            column_id: "col-link",
            number: 1,
            title: "task with role prompt",
            description: "",
            position: 0,
            role_id: null,
            created_at: now,
            updated_at: now,
          },
        ],
        prompts: [
          {
            id: prompt.id,
            name: prompt.name,
            content: prompt.content,
            color: null,
            created_at: now,
            updated_at: now,
          },
        ],
        task_prompts: [
          {
            task_id: "tsk-link",
            prompt_id: prompt.id,
            // role-inherited origin — should be downgraded to "direct"
            origin: "role:some-role-id",
            position: 0,
          },
        ],
      },
    });

    const result = applyImport(testDb.db, bundle, "skip");
    expect(result.counts.tasks.added).toBe(1);

    // The imported task_prompt link should have origin = "direct"
    const link = testDb.db
      .prepare("SELECT origin FROM task_prompts WHERE task_id = 'tsk-link'")
      .get() as { origin: string } | undefined;
    expect(link?.origin).toBe("direct");
  });
});

// ---------------------------------------------------------------------------
// Round-trip: export → import
// ---------------------------------------------------------------------------

describe("applyImport — round-trip via buildExport", () => {
  it("imports a bundle produced by buildExport with all data", () => {
    // Populate source DB
    const prompt = makePrompt(testDb.db, { name: "rt-prompt" });
    const role = makeRole(testDb.db, { name: "rt-role" });
    testDb.db
      .prepare("INSERT INTO role_prompts (role_id, prompt_id, position) VALUES (?, ?, ?)")
      .run(role.id, prompt.id, 0);
    const board = makeBoard(testDb.db, { name: "rt-board" });
    const col = makeColumn(testDb.db, { board_id: board.id });
    const task = makeTask(testDb.db, { column_id: col.id });
    testDb.db
      .prepare("INSERT INTO task_prompts (task_id, prompt_id, origin, position) VALUES (?, ?, ?, ?)")
      .run(task.id, prompt.id, "direct", 0);

    const bundle = buildExport(testDb.db, {}, "0.0.0");

    // Import into a fresh DB
    const destDb = createTestDb();
    const result = applyImport(destDb.db, bundle, "skip");
    expect(result.counts.boards.added).toBe(1);
    expect(result.counts.prompts.added).toBe(1);
    expect(result.counts.roles.added).toBe(1);
    expect(result.counts.tasks.added).toBe(1);
    destDb.close();
  });

  it("handles export with no boards (empty boards array)", () => {
    // Export from a DB that has prompts but no boards
    makePrompt(testDb.db, { name: "no-boards-p" });
    const bundle = buildExport(testDb.db, { includeBoards: true }, "0.0.0");

    const destDb = createTestDb();
    const result = applyImport(destDb.db, bundle, "skip");
    expect(result.counts.boards.added).toBe(0);
    expect(result.counts.prompts.added).toBe(1);
    destDb.close();
  });
});
