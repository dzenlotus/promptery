import type { Database, Statement } from "better-sqlite3";
import { nanoid } from "nanoid";

type PreparedStatement = Statement<unknown[]>;
import {
  EXPORT_FORMAT_VERSION,
  type BoardRow,
  type ColumnRow,
  type ExportBundle,
  type PrimitiveRow,
  type RoleLinkRow,
  type SettingRow,
  type TaskLinkRow,
  type TaskRow,
} from "./export.js";

export type ConflictStrategy = "skip" | "rename";

export type Resolution = "skip" | "rename" | "new";

type PrimitiveKind = "prompts" | "skills" | "mcp_tools" | "roles";

export interface ImportPreview {
  format_ok: boolean;
  format_version?: string;
  counts: {
    boards: { total: number; new: number; conflicts: number };
    roles: { total: number; new: number; conflicts: number };
    prompts: { total: number; new: number; conflicts: number };
    skills: { total: number; new: number; conflicts: number };
    mcp_tools: { total: number; new: number; conflicts: number };
    settings: { total: number };
  };
  conflicts: {
    boards: Array<{ id: string; name: string; resolution: Resolution }>;
    roles: Array<{ id: string; name: string; resolution: Resolution }>;
    prompts: Array<{ id: string; name: string; resolution: Resolution }>;
    skills: Array<{ id: string; name: string; resolution: Resolution }>;
    mcp_tools: Array<{ id: string; name: string; resolution: Resolution }>;
  };
  errors: string[];
}

export interface ImportResult {
  counts: {
    boards: { added: number; skipped: number; renamed: number };
    columns: { added: number };
    tasks: { added: number };
    roles: { added: number; skipped: number; renamed: number };
    prompts: { added: number; skipped: number; renamed: number };
    skills: { added: number; skipped: number; renamed: number };
    mcp_tools: { added: number; skipped: number; renamed: number };
    settings: { upserted: number };
  };
}

export function previewImport(
  db: Database,
  bundle: ExportBundle | null | undefined,
  strategy: ConflictStrategy
): ImportPreview {
  const preview: ImportPreview = {
    format_ok: bundle?.format_version === EXPORT_FORMAT_VERSION,
    format_version: bundle?.format_version,
    counts: {
      boards: { total: 0, new: 0, conflicts: 0 },
      roles: { total: 0, new: 0, conflicts: 0 },
      prompts: { total: 0, new: 0, conflicts: 0 },
      skills: { total: 0, new: 0, conflicts: 0 },
      mcp_tools: { total: 0, new: 0, conflicts: 0 },
      settings: { total: 0 },
    },
    conflicts: { boards: [], roles: [], prompts: [], skills: [], mcp_tools: [] },
    errors: [],
  };

  if (!bundle) {
    preview.errors.push("Bundle is empty");
    return preview;
  }
  if (!preview.format_ok) {
    preview.errors.push(
      `Unsupported format_version: ${bundle.format_version ?? "unknown"} (expected ${EXPORT_FORMAT_VERSION})`
    );
    return preview;
  }

  const existingBoardIds = idSet(db, "boards");
  const existingPromptNames = nameSet(db, "prompts");
  const existingSkillNames = nameSet(db, "skills");
  const existingMcpToolNames = nameSet(db, "mcp_tools");
  const existingRoleNames = nameSet(db, "roles");

  const fillPrimitive = (
    rows: PrimitiveRow[] | undefined,
    existing: Set<string>,
    target: keyof ImportPreview["counts"],
    conflictTarget: keyof ImportPreview["conflicts"]
  ) => {
    for (const r of rows ?? []) {
      const bucket = preview.counts[target] as { total: number; new: number; conflicts: number };
      bucket.total++;
      if (existing.has(r.name)) {
        bucket.conflicts++;
        preview.conflicts[conflictTarget].push({
          id: r.id,
          name: r.name,
          resolution: strategy,
        });
      } else {
        bucket.new++;
      }
    }
  };

  fillPrimitive(bundle.data.prompts, existingPromptNames, "prompts", "prompts");
  fillPrimitive(bundle.data.skills, existingSkillNames, "skills", "skills");
  fillPrimitive(bundle.data.mcp_tools, existingMcpToolNames, "mcp_tools", "mcp_tools");
  fillPrimitive(bundle.data.roles, existingRoleNames, "roles", "roles");

  for (const b of bundle.data.boards ?? []) {
    preview.counts.boards.total++;
    if (existingBoardIds.has(b.id)) {
      preview.counts.boards.conflicts++;
      preview.conflicts.boards.push({ id: b.id, name: b.name, resolution: strategy });
    } else {
      preview.counts.boards.new++;
    }
  }

  preview.counts.settings.total = bundle.data.settings?.length ?? 0;

  return preview;
}

interface PrimitiveMap {
  /** imported id → effective id in DB (equal to imported when no collision; nanoid when renamed). */
  idMap: Map<string, string>;
  /** imported id → resolution outcome, for reporting and downstream decisions. */
  resolution: Map<string, Resolution>;
}

export function applyImport(
  db: Database,
  bundle: ExportBundle | null | undefined,
  strategy: ConflictStrategy
): ImportResult {
  if (!bundle || bundle.format_version !== EXPORT_FORMAT_VERSION) {
    throw new Error(
      `Unsupported format_version: ${bundle?.format_version ?? "unknown"} (expected ${EXPORT_FORMAT_VERSION})`
    );
  }

  const result: ImportResult = {
    counts: {
      boards: { added: 0, skipped: 0, renamed: 0 },
      columns: { added: 0 },
      tasks: { added: 0 },
      roles: { added: 0, skipped: 0, renamed: 0 },
      prompts: { added: 0, skipped: 0, renamed: 0 },
      skills: { added: 0, skipped: 0, renamed: 0 },
      mcp_tools: { added: 0, skipped: 0, renamed: 0 },
      settings: { upserted: 0 },
    },
  };

  const tx = db.transaction(() => {
    // 1) Primitives first — roles, tasks and role_* rely on the id maps below.
    const promptMap = importPrimitive(
      db,
      "prompts",
      bundle.data.prompts,
      strategy,
      result.counts.prompts
    );
    const skillMap = importPrimitive(
      db,
      "skills",
      bundle.data.skills,
      strategy,
      result.counts.skills
    );
    const mcpToolMap = importPrimitive(
      db,
      "mcp_tools",
      bundle.data.mcp_tools,
      strategy,
      result.counts.mcp_tools
    );
    const roleMap = importPrimitive(
      db,
      "roles",
      bundle.data.roles,
      strategy,
      result.counts.roles
    );

    // 2) Role link tables — drop rows whose endpoints were skipped.
    importRoleLinks(
      db,
      "role_prompts",
      "prompt_id",
      bundle.data.role_prompts,
      roleMap.idMap,
      promptMap.idMap
    );
    importRoleLinks(
      db,
      "role_skills",
      "skill_id",
      bundle.data.role_skills,
      roleMap.idMap,
      skillMap.idMap
    );
    importRoleLinks(
      db,
      "role_mcp_tools",
      "mcp_tool_id",
      bundle.data.role_mcp_tools,
      roleMap.idMap,
      mcpToolMap.idMap
    );

    // 3) Boards + columns + tasks + task link tables.
    importBoards(db, bundle, strategy, roleMap.idMap, promptMap.idMap, skillMap.idMap, mcpToolMap.idMap, result);

    // 4) Settings — upsert wholesale; nothing here can conflict destructively.
    if (bundle.data.settings && bundle.data.settings.length > 0) {
      const upsert = db.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      );
      for (const s of bundle.data.settings as SettingRow[]) {
        upsert.run(s.key, s.value, s.updated_at);
        result.counts.settings.upserted++;
      }
    }
  });
  tx();

  return result;
}

function importPrimitive(
  db: Database,
  table: PrimitiveKind,
  rows: PrimitiveRow[] | undefined,
  strategy: ConflictStrategy,
  counter: { added: number; skipped: number; renamed: number }
): PrimitiveMap {
  const idMap = new Map<string, string>();
  const resolution = new Map<string, Resolution>();

  if (!rows || rows.length === 0) return { idMap, resolution };

  const existingNames = nameSet(db, table);
  const existingByName = db.prepare(`SELECT id, name FROM ${table}`).all() as {
    id: string;
    name: string;
  }[];
  const nameToId = new Map(existingByName.map((r) => [r.name, r.id]));

  const insert = db.prepare(
    `INSERT INTO ${table} (id, name, content, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
  );

  for (const row of rows) {
    if (existingNames.has(row.name)) {
      if (strategy === "skip") {
        // Point follow-up links at the pre-existing row so relations survive.
        const existingId = nameToId.get(row.name);
        if (existingId) idMap.set(row.id, existingId);
        resolution.set(row.id, "skip");
        counter.skipped++;
        continue;
      }
      const newName = findAvailableName(row.name, existingNames);
      const newId = nanoid();
      insert.run(
        newId,
        newName,
        row.content ?? "",
        row.color ?? "#888",
        row.created_at ?? Date.now(),
        Date.now()
      );
      existingNames.add(newName);
      nameToId.set(newName, newId);
      idMap.set(row.id, newId);
      resolution.set(row.id, "rename");
      counter.renamed++;
    } else {
      insert.run(
        row.id,
        row.name,
        row.content ?? "",
        row.color ?? "#888",
        row.created_at ?? Date.now(),
        Date.now()
      );
      existingNames.add(row.name);
      nameToId.set(row.name, row.id);
      idMap.set(row.id, row.id);
      resolution.set(row.id, "new");
      counter.added++;
    }
  }

  return { idMap, resolution };
}

function importRoleLinks(
  db: Database,
  table: "role_prompts" | "role_skills" | "role_mcp_tools",
  targetCol: "prompt_id" | "skill_id" | "mcp_tool_id",
  rows: RoleLinkRow[] | undefined,
  roleIdMap: Map<string, string>,
  targetIdMap: Map<string, string>
): void {
  if (!rows || rows.length === 0) return;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO ${table} (role_id, ${targetCol}, position) VALUES (?, ?, ?)`
  );
  for (const link of rows) {
    const roleId = roleIdMap.get(link.role_id);
    const legacyTargetId =
      (targetCol === "prompt_id" && link.prompt_id) ||
      (targetCol === "skill_id" && link.skill_id) ||
      (targetCol === "mcp_tool_id" && link.mcp_tool_id) ||
      null;
    if (!roleId || !legacyTargetId) continue;
    const targetId = targetIdMap.get(legacyTargetId);
    if (!targetId) continue;
    insert.run(roleId, targetId, link.position ?? 0);
  }
}

function importBoards(
  db: Database,
  bundle: ExportBundle,
  strategy: ConflictStrategy,
  roleIdMap: Map<string, string>,
  promptIdMap: Map<string, string>,
  skillIdMap: Map<string, string>,
  mcpToolIdMap: Map<string, string>,
  result: ImportResult
): void {
  const boards = bundle.data.boards ?? [];
  if (boards.length === 0) return;

  const columns = bundle.data.columns ?? [];
  const tasks = bundle.data.tasks ?? [];
  const taskPrompts = bundle.data.task_prompts ?? [];
  const taskSkills = bundle.data.task_skills ?? [];
  const taskMcpTools = bundle.data.task_mcp_tools ?? [];

  const existingBoardIds = idSet(db, "boards");

  // Imported boards always land in the destination's default space — slugs
  // are minted from there too. Preserving the source `space_id` would risk
  // referencing a space that doesn't exist in this DB, and preserving slugs
  // could collide with locally-created tasks under the same prefix.
  const defaultSpace = db
    .prepare("SELECT id, prefix FROM spaces WHERE is_default = 1")
    .get() as { id: string; prefix: string };
  const slugCounterRow = db
    .prepare("SELECT next_number FROM space_counters WHERE space_id = ?")
    .get(defaultSpace.id) as { next_number: number };
  const slugCtx: SlugContext = {
    space_id: defaultSpace.id,
    prefix: defaultSpace.prefix,
    next: slugCounterRow.next_number,
  };

  const insertBoard = db.prepare(
    "INSERT INTO boards (id, name, space_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  );
  const insertColumn = db.prepare(
    "INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)"
  );
  const insertTask = db.prepare(
    `INSERT INTO tasks (id, board_id, column_id, slug, title, description, position, role_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const b of boards as BoardRow[]) {
    if (existingBoardIds.has(b.id)) {
      if (strategy === "skip") {
        result.counts.boards.skipped++;
        continue;
      }

      // Rename path: fresh board id, columns and tasks all get fresh ids too.
      const newBoardId = nanoid();
      insertBoard.run(
        newBoardId,
        `${b.name} (imported)`,
        defaultSpace.id,
        b.created_at ?? Date.now(),
        Date.now()
      );
      existingBoardIds.add(newBoardId);
      result.counts.boards.renamed++;

      const columnIdMap = new Map<string, string>();
      insertBoardColumns(db, b.id, newBoardId, columns, columnIdMap, insertColumn, result);
      insertBoardTasks(
        db,
        b.id,
        newBoardId,
        tasks,
        taskPrompts,
        taskSkills,
        taskMcpTools,
        columnIdMap,
        roleIdMap,
        promptIdMap,
        skillIdMap,
        mcpToolIdMap,
        insertTask,
        result,
        true,
        slugCtx
      );
      continue;
    }

    // Fresh board — original ids preserved for columns/tasks/task links.
    insertBoard.run(
      b.id,
      b.name,
      defaultSpace.id,
      b.created_at ?? Date.now(),
      Date.now()
    );
    existingBoardIds.add(b.id);
    result.counts.boards.added++;

    const columnIdMap = new Map<string, string>();
    insertBoardColumns(db, b.id, b.id, columns, columnIdMap, insertColumn, result);
    insertBoardTasks(
      db,
      b.id,
      b.id,
      tasks,
      taskPrompts,
      taskSkills,
      taskMcpTools,
      columnIdMap,
      roleIdMap,
      promptIdMap,
      skillIdMap,
      mcpToolIdMap,
      insertTask,
      result,
      false,
      slugCtx
    );
  }

  // Persist the advanced counter so the next locally-created task picks up
  // where the import left off.
  db.prepare(
    "UPDATE space_counters SET next_number = ? WHERE space_id = ?"
  ).run(slugCtx.next, slugCtx.space_id);
}

interface SlugContext {
  space_id: string;
  prefix: string;
  /** Mutated as each task consumes its slug — caller persists once at the end. */
  next: number;
}

function insertBoardColumns(
  _db: Database,
  origBoardId: string,
  newBoardId: string,
  columns: ColumnRow[],
  columnIdMap: Map<string, string>,
  insertColumn: PreparedStatement,
  result: ImportResult
): void {
  const boardColumns = columns.filter((c) => c.board_id === origBoardId);
  for (const col of boardColumns) {
    const newColId = newBoardId === origBoardId ? col.id : nanoid();
    insertColumn.run(newColId, newBoardId, col.name, col.position, col.created_at ?? Date.now());
    columnIdMap.set(col.id, newColId);
    result.counts.columns.added++;
  }
}

function insertBoardTasks(
  db: Database,
  origBoardId: string,
  newBoardId: string,
  tasks: TaskRow[],
  taskPrompts: TaskLinkRow[],
  taskSkills: TaskLinkRow[],
  taskMcpTools: TaskLinkRow[],
  columnIdMap: Map<string, string>,
  roleIdMap: Map<string, string>,
  promptIdMap: Map<string, string>,
  skillIdMap: Map<string, string>,
  mcpToolIdMap: Map<string, string>,
  insertTask: PreparedStatement,
  result: ImportResult,
  isRename: boolean,
  slugCtx: SlugContext
): void {
  const insertTaskPrompt = db.prepare(
    "INSERT OR IGNORE INTO task_prompts (task_id, prompt_id, origin, position) VALUES (?, ?, ?, ?)"
  );
  const insertTaskSkill = db.prepare(
    "INSERT OR IGNORE INTO task_skills (task_id, skill_id, origin, position) VALUES (?, ?, ?, ?)"
  );
  const insertTaskMcpTool = db.prepare(
    "INSERT OR IGNORE INTO task_mcp_tools (task_id, mcp_tool_id, origin, position) VALUES (?, ?, ?, ?)"
  );

  const boardTasks = tasks.filter((t) => t.board_id === origBoardId);
  for (const t of boardTasks) {
    const newColId = columnIdMap.get(t.column_id);
    if (!newColId) continue;
    const newTaskId = isRename ? nanoid() : t.id;
    const mappedRoleId = t.role_id ? roleIdMap.get(t.role_id) ?? null : null;
    const slug = `${slugCtx.prefix}-${slugCtx.next}`;
    slugCtx.next += 1;
    insertTask.run(
      newTaskId,
      newBoardId,
      newColId,
      slug,
      t.title,
      t.description ?? "",
      t.position ?? 0,
      mappedRoleId,
      t.created_at ?? Date.now(),
      Date.now()
    );
    result.counts.tasks.added++;

    insertTaskLinksFor(
      t.id,
      newTaskId,
      taskPrompts,
      "prompt_id",
      promptIdMap,
      insertTaskPrompt
    );
    insertTaskLinksFor(
      t.id,
      newTaskId,
      taskSkills,
      "skill_id",
      skillIdMap,
      insertTaskSkill
    );
    insertTaskLinksFor(
      t.id,
      newTaskId,
      taskMcpTools,
      "mcp_tool_id",
      mcpToolIdMap,
      insertTaskMcpTool
    );
  }
}

function insertTaskLinksFor(
  origTaskId: string,
  newTaskId: string,
  rows: TaskLinkRow[],
  targetCol: "prompt_id" | "skill_id" | "mcp_tool_id",
  targetIdMap: Map<string, string>,
  stmt: PreparedStatement
): void {
  for (const link of rows) {
    if (link.task_id !== origTaskId) continue;
    const legacyTargetId =
      (targetCol === "prompt_id" && link.prompt_id) ||
      (targetCol === "skill_id" && link.skill_id) ||
      (targetCol === "mcp_tool_id" && link.mcp_tool_id) ||
      null;
    if (!legacyTargetId) continue;
    const targetId = targetIdMap.get(legacyTargetId);
    if (!targetId) continue;
    // Role-inherited origins would need their role id remapped when roles
    // were renamed. Since we don't currently track a role-rename id pair,
    // downgrade those links to direct so they still point at the primitive.
    const origin = link.origin?.startsWith("role:") ? "direct" : link.origin ?? "direct";
    stmt.run(newTaskId, targetId, origin, link.position ?? 0);
  }
}

function idSet(db: Database, table: "boards"): Set<string> {
  return new Set(
    (db.prepare(`SELECT id FROM ${table}`).all() as { id: string }[]).map((r) => r.id)
  );
}

function nameSet(db: Database, table: PrimitiveKind): Set<string> {
  return new Set(
    (db.prepare(`SELECT name FROM ${table}`).all() as { name: string }[]).map((r) => r.name)
  );
}

function findAvailableName(base: string, existing: Set<string>): string {
  let candidate = `${base} (imported)`;
  let i = 2;
  while (existing.has(candidate)) {
    candidate = `${base} (imported ${i})`;
    i++;
  }
  return candidate;
}
