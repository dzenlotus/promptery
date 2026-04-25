import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { EXPORT_FORMAT_VERSION, buildExport } from "../export.js";
import { applyImport, previewImport } from "../import.js";
import { createTestDb } from "../queries/__tests__/helpers.js";
import { createBoard } from "../queries/boards.js";
import { createColumn } from "../queries/columns.js";
import { createTask } from "../queries/tasks.js";
import { createRole, setRolePrompts } from "../queries/roles.js";
import { createPrompt } from "../queries/prompts.js";
import { createSkill } from "../queries/skills.js";
import { createMcpTool } from "../queries/mcpTools.js";

function countRows(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;
}

describe("export", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("yields a well-formed empty bundle", () => {
    const bundle = buildExport(db, {}, "0.2.0-alpha.2");
    expect(bundle.format_version).toBe(EXPORT_FORMAT_VERSION);
    expect(bundle.app_version).toBe("0.2.0-alpha.2");
    expect(bundle.data.boards).toEqual([]);
    expect(bundle.data.prompts).toEqual([]);
    expect(bundle.data.roles).toEqual([]);
    expect(bundle.data.settings).toBeUndefined();
  });

  it("includes link tables and primitives by default", () => {
    const board = createBoard(db, "Work");
    const cols = db
      .prepare("SELECT id FROM columns WHERE board_id = ? ORDER BY position")
      .all(board.id) as { id: string }[];
    createTask(db, board.id, cols[0]!.id, { title: "t1" });
    const prompt = createPrompt(db, { name: "P1", content: "c" });
    const role = createRole(db, { name: "R1" });
    setRolePrompts(db, role.id, [prompt.id]);
    createSkill(db, { name: "S1" });
    createMcpTool(db, { name: "M1" });

    const bundle = buildExport(db, {}, "v");
    expect(bundle.data.boards).toHaveLength(1);
    expect(bundle.data.columns).toHaveLength(4); // seeded defaults
    expect(bundle.data.tasks).toHaveLength(1);
    expect(bundle.data.prompts).toHaveLength(1);
    expect(bundle.data.skills).toHaveLength(1);
    expect(bundle.data.mcp_tools).toHaveLength(1);
    expect(bundle.data.roles).toHaveLength(1);
    expect(bundle.data.role_prompts).toHaveLength(1);
  });

  it("respects include flags", () => {
    createBoard(db, "B");
    const bundle = buildExport(
      db,
      { includeBoards: false, includeRoles: false, includePrompts: false },
      "v"
    );
    expect(bundle.data.boards).toBeUndefined();
    expect(bundle.data.prompts).toBeUndefined();
    expect(bundle.data.roles).toBeUndefined();
  });

  it("filters boards by boardIds", () => {
    const b1 = createBoard(db, "Keep");
    createBoard(db, "Drop");
    const bundle = buildExport(db, { boardIds: [b1.id] }, "v");
    expect(bundle.data.boards).toHaveLength(1);
    expect(bundle.data.boards?.[0]?.id).toBe(b1.id);
    // Columns should be only those of the kept board.
    for (const c of bundle.data.columns ?? []) {
      expect(c.board_id).toBe(b1.id);
    }
  });

  it("includeSettings defaults to false, opt-in only", () => {
    db.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)"
    ).run("k", '"v"', Date.now());

    expect(buildExport(db, {}, "v").data.settings).toBeUndefined();
    expect(buildExport(db, { includeSettings: true }, "v").data.settings).toHaveLength(1);
  });
});

describe("import — preview", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("rejects wrong format_version", () => {
    const preview = previewImport(
      db,
      { format_version: "99.0", data: {} } as never,
      "skip"
    );
    expect(preview.format_ok).toBe(false);
    expect(preview.errors.length).toBeGreaterThan(0);
  });

  it("counts new vs conflict for each primitive", () => {
    createPrompt(db, { name: "Existing" });
    const bundle = {
      format_version: EXPORT_FORMAT_VERSION,
      exported_at: "",
      app_version: "v",
      options: {},
      data: {
        prompts: [
          { id: "p1", name: "Existing", content: "", color: "#888", created_at: 1, updated_at: 1 },
          { id: "p2", name: "Fresh", content: "", color: "#888", created_at: 1, updated_at: 1 },
        ],
      },
    } as never;

    const preview = previewImport(db, bundle, "rename");
    expect(preview.format_ok).toBe(true);
    expect(preview.counts.prompts.total).toBe(2);
    expect(preview.counts.prompts.new).toBe(1);
    expect(preview.counts.prompts.conflicts).toBe(1);
    expect(preview.conflicts.prompts).toEqual([
      { id: "p1", name: "Existing", resolution: "rename" },
    ]);
  });
});

describe("import — apply", () => {
  let db: Database.Database;
  let target: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    target = createTestDb();
  });

  function sourceBundle(): ReturnType<typeof buildExport> {
    return buildExport(db, {}, "0.2.0-alpha.2");
  }

  it("round-trips data into an empty DB (skip strategy)", () => {
    const board = createBoard(db, "Work");
    const cols = db
      .prepare("SELECT id FROM columns WHERE board_id = ? ORDER BY position")
      .all(board.id) as { id: string }[];
    createTask(db, board.id, cols[0]!.id, { title: "Hello" });
    const prompt = createPrompt(db, { name: "P1", content: "body" });
    const role = createRole(db, { name: "R1" });
    setRolePrompts(db, role.id, [prompt.id]);

    const bundle = sourceBundle();
    const result = applyImport(target, bundle, "skip");

    expect(result.counts.boards.added).toBe(1);
    expect(result.counts.prompts.added).toBe(1);
    expect(result.counts.roles.added).toBe(1);

    expect(countRows(target, "boards")).toBe(1);
    expect(countRows(target, "columns")).toBe(4);
    expect(countRows(target, "tasks")).toBe(1);
    expect(countRows(target, "prompts")).toBe(1);
    expect(countRows(target, "roles")).toBe(1);
    expect(countRows(target, "role_prompts")).toBe(1);
  });

  it("skip strategy keeps the existing row and reuses its id for links", () => {
    const srcPrompt = createPrompt(db, { name: "Shared" });
    const srcRole = createRole(db, { name: "R" });
    setRolePrompts(db, srcRole.id, [srcPrompt.id]);
    const bundle = sourceBundle();

    // Target already has a prompt by the same name but a different id.
    const targetPrompt = createPrompt(target, { name: "Shared", content: "kept" });

    const result = applyImport(target, bundle, "skip");
    expect(result.counts.prompts.skipped).toBe(1);
    expect(result.counts.prompts.added).toBe(0);
    expect(result.counts.roles.added).toBe(1);

    // The link should reuse the target's existing prompt id, not the source one.
    const link = target
      .prepare("SELECT prompt_id FROM role_prompts")
      .all() as { prompt_id: string }[];
    expect(link).toHaveLength(1);
    expect(link[0]!.prompt_id).toBe(targetPrompt.id);
  });

  it("rename strategy keeps both with suffix", () => {
    createPrompt(db, { name: "Shared" });
    createPrompt(target, { name: "Shared" });
    const bundle = sourceBundle();

    const result = applyImport(target, bundle, "rename");
    expect(result.counts.prompts.renamed).toBe(1);

    const names = (target.prepare("SELECT name FROM prompts").all() as { name: string }[])
      .map((r) => r.name)
      .sort();
    expect(names).toEqual(["Shared", "Shared (imported)"]);
  });

  it("rename strategy applies 'imported 2' suffix when needed", () => {
    createPrompt(target, { name: "P" });
    createPrompt(target, { name: "P (imported)" });
    createPrompt(db, { name: "P" });
    const bundle = sourceBundle();

    applyImport(target, bundle, "rename");
    const names = (target.prepare("SELECT name FROM prompts").all() as { name: string }[])
      .map((r) => r.name)
      .sort();
    expect(names).toContain("P (imported 2)");
  });

  it("rename strategy forks a conflicting board with fresh ids", () => {
    const sourceBoard = createBoard(db, "Work");
    const cols = db
      .prepare("SELECT id FROM columns WHERE board_id = ? ORDER BY position")
      .all(sourceBoard.id) as { id: string }[];
    createTask(db, sourceBoard.id, cols[0]!.id, { title: "Task A" });

    // Copy board id into target with same primary key to provoke a conflict.
    // Boards now require space_id; the target's default space is fine here.
    const now = Date.now();
    const targetDefaultSpace = target
      .prepare("SELECT id FROM spaces WHERE is_default = 1")
      .get() as { id: string };
    target
      .prepare(
        "INSERT INTO boards (id, name, space_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(sourceBoard.id, "Existing", targetDefaultSpace.id, now, now);

    const bundle = sourceBundle();
    const result = applyImport(target, bundle, "rename");
    expect(result.counts.boards.renamed).toBe(1);

    const boards = target
      .prepare("SELECT id, name FROM boards ORDER BY name")
      .all() as { id: string; name: string }[];
    expect(boards).toHaveLength(2);
    expect(boards.map((b) => b.name)).toEqual(["Existing", "Work (imported)"]);
    // Two rows, two distinct ids — imported board has a fresh one.
    expect(new Set(boards.map((b) => b.id)).size).toBe(2);
  });

  it("throws on bad format_version", () => {
    expect(() =>
      applyImport(target, { format_version: "99.0", data: {} } as never, "skip")
    ).toThrow(/Unsupported format_version/);
  });

  it("is atomic — failed import rolls back", () => {
    createPrompt(db, { name: "OK" });
    const bundle = sourceBundle();
    // Force a row that would fail a NOT NULL / UNIQUE constraint mid-import:
    // inject a bogus prompt row with null name via the bundle.
    (bundle.data.prompts as { name: string | null }[]).push({
      id: "bad",
      name: null,
    } as never);

    const before = countRows(target, "prompts");
    expect(() => applyImport(target, bundle, "skip")).toThrow();
    expect(countRows(target, "prompts")).toBe(before);
  });

  it("upserts settings", () => {
    const bundle = {
      format_version: EXPORT_FORMAT_VERSION,
      exported_at: "",
      app_version: "v",
      options: {},
      data: {
        settings: [
          { key: "a", value: '"x"', updated_at: 1 },
          { key: "b", value: "42", updated_at: 1 },
        ],
      },
    } as never;
    const result = applyImport(target, bundle, "skip");
    expect(result.counts.settings.upserted).toBe(2);
    const rows = target.prepare("SELECT key, value FROM settings ORDER BY key").all();
    expect(rows).toEqual([
      { key: "a", value: '"x"' },
      { key: "b", value: "42" },
    ]);
  });
});
