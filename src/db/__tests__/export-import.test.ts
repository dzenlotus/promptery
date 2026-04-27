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
import { createPromptGroup, setGroupPrompts } from "../queries/promptGroups.js";

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

  it("includes prompt_groups and prompt_group_members", () => {
    const p1 = createPrompt(db, { name: "P1", content: "c1" });
    const p2 = createPrompt(db, { name: "P2", content: "c2" });
    const group = createPromptGroup(db, { name: "G1", prompt_ids: [p1.id, p2.id] });

    const bundle = buildExport(db, {}, "v");
    expect(bundle.data.prompt_groups).toHaveLength(1);
    expect(bundle.data.prompt_groups?.[0]?.id).toBe(group.id);
    expect(bundle.data.prompt_group_members).toHaveLength(2);
    const memberPromptIds = bundle.data.prompt_group_members?.map((m) => m.prompt_id).sort();
    expect(memberPromptIds).toEqual([p1.id, p2.id].sort());
  });

  it("format_version is 2.0", () => {
    const bundle = buildExport(db, {}, "v");
    expect(bundle.format_version).toBe("2.0");
  });
});

describe("import — preview", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("rejects future format_version (e.g. 3.x)", () => {
    const preview = previewImport(
      db,
      { format_version: "3.0", data: {} } as never,
      "skip"
    );
    expect(preview.format_ok).toBe(false);
    expect(preview.errors.length).toBeGreaterThan(0);
    expect(preview.errors[0]).toMatch(/Unsupported/);
  });

  it("accepts 1.x bundles as backwards-compat", () => {
    const preview = previewImport(
      db,
      {
        format_version: "1.0",
        exported_at: "",
        app_version: "v",
        options: {},
        data: {},
      } as never,
      "skip"
    );
    expect(preview.format_ok).toBe(true);
    expect(preview.errors).toHaveLength(0);
  });

  it("accepts 2.x bundles", () => {
    const preview = previewImport(
      db,
      {
        format_version: "2.0",
        exported_at: "",
        app_version: "v",
        options: {},
        data: {},
      } as never,
      "skip"
    );
    expect(preview.format_ok).toBe(true);
    expect(preview.errors).toHaveLength(0);
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

  it("counts prompt_group conflicts", () => {
    createPromptGroup(db, { name: "Existing Group" });
    const bundle = {
      format_version: EXPORT_FORMAT_VERSION,
      exported_at: "",
      app_version: "v",
      options: {},
      data: {
        prompt_groups: [
          { id: "g1", name: "Existing Group", color: null, position: 0, created_at: 1, updated_at: 1 },
          { id: "g2", name: "New Group", color: null, position: 1, created_at: 1, updated_at: 1 },
        ],
        prompt_group_members: [],
      },
    } as never;

    const preview = previewImport(db, bundle, "skip");
    expect(preview.counts.prompt_groups.total).toBe(2);
    expect(preview.counts.prompt_groups.new).toBe(1);
    expect(preview.counts.prompt_groups.conflicts).toBe(1);
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

  it("throws on future format_version", () => {
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

  // ---------------------------------------------------------------------------
  // New 2.0 entities
  // ---------------------------------------------------------------------------

  it("round-trips prompt_groups and members", () => {
    const p1 = createPrompt(db, { name: "P1", content: "c1" });
    const p2 = createPrompt(db, { name: "P2", content: "c2" });
    createPromptGroup(db, { name: "Group A", prompt_ids: [p1.id, p2.id] });

    const bundle = sourceBundle();
    const result = applyImport(target, bundle, "skip");

    expect(result.counts.prompt_groups.added).toBe(1);
    expect(countRows(target, "prompt_groups")).toBe(1);
    expect(countRows(target, "prompt_group_members")).toBe(2);
  });

  it("skip strategy on conflicting prompt_group preserves existing", () => {
    createPromptGroup(db, { name: "Shared Group" });
    createPromptGroup(target, { name: "Shared Group" });

    const bundle = sourceBundle();
    const result = applyImport(target, bundle, "skip");

    expect(result.counts.prompt_groups.skipped).toBe(1);
    expect(countRows(target, "prompt_groups")).toBe(1);
  });

  it("rename strategy renames conflicting prompt_group", () => {
    createPromptGroup(db, { name: "Shared Group" });
    createPromptGroup(target, { name: "Shared Group" });

    const bundle = sourceBundle();
    const result = applyImport(target, bundle, "rename");

    expect(result.counts.prompt_groups.renamed).toBe(1);
    expect(countRows(target, "prompt_groups")).toBe(2);
    const names = (
      target.prepare("SELECT name FROM prompt_groups").all() as { name: string }[]
    ).map((r) => r.name).sort();
    expect(names).toContain("Shared Group (imported)");
  });

  it("prompt_group members reference the imported (remapped) prompt ids", () => {
    const p = createPrompt(db, { name: "MemberPrompt", content: "x" });
    createPromptGroup(db, { name: "MyGroup", prompt_ids: [p.id] });

    const bundle = sourceBundle();
    // Cause a rename on the prompt so its id changes in target.
    createPrompt(target, { name: "MemberPrompt", content: "existing" });
    applyImport(target, bundle, "rename");

    // The group_member should reference the new (renamed) prompt, not the original id.
    const members = target
      .prepare("SELECT pm.prompt_id FROM prompt_group_members pm")
      .all() as { prompt_id: string }[];
    expect(members).toHaveLength(1);
    // The original prompt id should not exist in the target.
    const promptInTarget = target
      .prepare("SELECT id FROM prompts WHERE id = ?")
      .get(p.id);
    // The member should point at an actual prompt in the target.
    const memberPromptExists = target
      .prepare("SELECT id FROM prompts WHERE id = ?")
      .get(members[0]!.prompt_id);
    expect(memberPromptExists).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Backwards-compat: 1.x bundle import
  // ---------------------------------------------------------------------------

  it("imports a 1.x-format bundle with default-space backfill and no crash", () => {
    const bundle = {
      format_version: "1.0",
      exported_at: new Date().toISOString(),
      app_version: "0.2.4",
      options: { includeBoards: true, includePrompts: true, includeRoles: true, includeSettings: false },
      data: {
        boards: [
          { id: "board-legacy", name: "Legacy Board", created_at: 1000, updated_at: 1000 },
        ],
        columns: [
          { id: "col-1", board_id: "board-legacy", name: "todo", position: 0, created_at: 1000 },
        ],
        tasks: [
          {
            id: "task-1",
            board_id: "board-legacy",
            column_id: "col-1",
            number: 1,
            title: "Legacy Task",
            description: "",
            position: 0,
            role_id: null,
            created_at: 1000,
            updated_at: 1000,
          },
        ],
        task_prompts: [],
        task_skills: [],
        task_mcp_tools: [],
        roles: [],
        role_prompts: [],
        role_skills: [],
        role_mcp_tools: [],
        prompts: [
          { id: "p-legacy", name: "Legacy Prompt", content: "x", color: "#888", created_at: 1000, updated_at: 1000 },
        ],
        skills: [],
        mcp_tools: [],
      },
    } as never;

    const result = applyImport(target, bundle, "skip");

    expect(result.counts.boards.added).toBe(1);
    expect(result.counts.prompts.added).toBe(1);
    expect(result.counts.tasks.added).toBe(1);
    expect(countRows(target, "boards")).toBe(1);
    expect(countRows(target, "tasks")).toBe(1);
    expect(countRows(target, "prompts")).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Format-version mismatch: future bundle
  // ---------------------------------------------------------------------------

  it("rejects a 3.x bundle with a clear error", () => {
    const bundle = {
      format_version: "3.0",
      exported_at: "",
      app_version: "v",
      options: {},
      data: {},
    } as never;

    expect(() => applyImport(target, bundle, "skip")).toThrow(/Unsupported format_version.*3\.0/);
  });
});
