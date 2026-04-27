import type { Database, Statement } from "better-sqlite3";
import { nanoid } from "nanoid";

type PreparedStatement = Statement<unknown[]>;
import {
  EXPORT_FORMAT_VERSION,
  type BoardRow,
  type ColumnRow,
  type ExportBundle,
  type PromptGroupMemberRow,
  type PromptGroupRow,
  type PromptRow,
  type PromptTagRow,
  type PrimitiveRow,
  type RoleLinkRow,
  type SettingRow,
  type SpaceCounterRow,
  type SpaceRow,
  type TagRow,
  type TaskLinkRow,
  type TaskPromptOverrideRow,
  type TaskRow,
} from "./export.js";

export type ConflictStrategy = "skip" | "rename";

export type Resolution = "skip" | "rename" | "new";

type PrimitiveKind = "prompts" | "skills" | "mcp_tools" | "roles";

export interface ImportPreview {
  format_ok: boolean;
  format_version?: string;
  counts: {
    spaces: { total: number; new: number; conflicts: number };
    boards: { total: number; new: number; conflicts: number };
    roles: { total: number; new: number; conflicts: number };
    prompts: { total: number; new: number; conflicts: number };
    skills: { total: number; new: number; conflicts: number };
    mcp_tools: { total: number; new: number; conflicts: number };
    prompt_groups: { total: number; new: number; conflicts: number };
    settings: { total: number };
  };
  conflicts: {
    spaces: Array<{ id: string; name: string; resolution: Resolution }>;
    boards: Array<{ id: string; name: string; resolution: Resolution }>;
    roles: Array<{ id: string; name: string; resolution: Resolution }>;
    prompts: Array<{ id: string; name: string; resolution: Resolution }>;
    skills: Array<{ id: string; name: string; resolution: Resolution }>;
    mcp_tools: Array<{ id: string; name: string; resolution: Resolution }>;
    prompt_groups: Array<{ id: string; name: string; resolution: Resolution }>;
  };
  errors: string[];
}

export interface ImportResult {
  counts: {
    spaces: { added: number; skipped: number; renamed: number };
    boards: { added: number; skipped: number; renamed: number };
    columns: { added: number };
    tasks: { added: number };
    roles: { added: number; skipped: number; renamed: number };
    prompts: { added: number; skipped: number; renamed: number };
    skills: { added: number; skipped: number; renamed: number };
    mcp_tools: { added: number; skipped: number; renamed: number };
    prompt_groups: { added: number; skipped: number; renamed: number };
    settings: { upserted: number };
  };
}

// ---------------------------------------------------------------------------
// Backwards-compat transformer — upgrades a 1.x bundle to the 2.x shape.
// Fills in defaults so the rest of the import logic sees a uniform bundle.
// ---------------------------------------------------------------------------

/** Accept any major version of the current series (e.g. "2.x"). */
const CURRENT_MAJOR = parseInt(EXPORT_FORMAT_VERSION.split(".")[0]!, 10);

/** Oldest major version we can still import via back-compat path. */
const MIN_COMPAT_MAJOR = 1;

function parseMajor(version: string | undefined): number {
  if (!version) return NaN;
  return parseInt(version.split(".")[0]!, 10);
}

function upgradeBundle(raw: Record<string, unknown>): ExportBundle {
  const version = raw.format_version as string | undefined;
  const major = parseMajor(version);

  if (major === CURRENT_MAJOR) {
    // Already current — no-op.
    return raw as unknown as ExportBundle;
  }

  if (major === 1) {
    // 1.x → 2.x: no spaces/slugs/groups in old bundles — fill in safe defaults.
    const data = (raw.data ?? {}) as Record<string, unknown>;
    return {
      ...(raw as Omit<ExportBundle, "format_version" | "data">),
      format_version: EXPORT_FORMAT_VERSION,
      data: {
        // Boards and tasks carry over as-is; slug will be re-minted on import.
        boards: (data.boards as BoardRow[] | undefined) ?? [],
        columns: (data.columns as ColumnRow[] | undefined) ?? [],
        tasks: (data.tasks as TaskRow[] | undefined) ?? [],
        task_prompts: (data.task_prompts as TaskLinkRow[] | undefined) ?? [],
        task_skills: (data.task_skills as TaskLinkRow[] | undefined) ?? [],
        task_mcp_tools: (data.task_mcp_tools as TaskLinkRow[] | undefined) ?? [],
        roles: (data.roles as PrimitiveRow[] | undefined) ?? [],
        role_prompts: (data.role_prompts as RoleLinkRow[] | undefined) ?? [],
        role_skills: (data.role_skills as RoleLinkRow[] | undefined) ?? [],
        role_mcp_tools: (data.role_mcp_tools as RoleLinkRow[] | undefined) ?? [],
        prompts: (data.prompts as PromptRow[] | undefined) ?? [],
        skills: (data.skills as PrimitiveRow[] | undefined) ?? [],
        mcp_tools: (data.mcp_tools as PrimitiveRow[] | undefined) ?? [],
        prompt_groups: [],
        prompt_group_members: [],
        // spaces omitted → no-op in importer
        settings: (data.settings as SettingRow[] | undefined),
      },
    } as ExportBundle;
  }

  // Unsupported — return as-is so the version-check error fires.
  return raw as unknown as ExportBundle;
}

function assertCompatVersion(bundle: ExportBundle): void {
  const major = parseMajor(bundle.format_version);
  if (isNaN(major) || major < MIN_COMPAT_MAJOR || major > CURRENT_MAJOR) {
    throw new Error(
      `Unsupported format_version: ${bundle.format_version ?? "unknown"} ` +
        `(supported: ${MIN_COMPAT_MAJOR}.x – ${CURRENT_MAJOR}.x)`
    );
  }
}

// ---------------------------------------------------------------------------
// Runtime feature detection
// ---------------------------------------------------------------------------

function tableExists(db: Database, name: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
  return !!row;
}

function columnExists(db: Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export function previewImport(
  db: Database,
  bundle: ExportBundle | null | undefined,
  strategy: ConflictStrategy
): ImportPreview {
  const preview: ImportPreview = {
    format_ok: false,
    format_version: bundle?.format_version,
    counts: {
      spaces: { total: 0, new: 0, conflicts: 0 },
      boards: { total: 0, new: 0, conflicts: 0 },
      roles: { total: 0, new: 0, conflicts: 0 },
      prompts: { total: 0, new: 0, conflicts: 0 },
      skills: { total: 0, new: 0, conflicts: 0 },
      mcp_tools: { total: 0, new: 0, conflicts: 0 },
      prompt_groups: { total: 0, new: 0, conflicts: 0 },
      settings: { total: 0 },
    },
    conflicts: {
      spaces: [],
      boards: [],
      roles: [],
      prompts: [],
      skills: [],
      mcp_tools: [],
      prompt_groups: [],
    },
    errors: [],
  };

  if (!bundle) {
    preview.errors.push("Bundle is empty");
    return preview;
  }

  const major = parseMajor(bundle.format_version);
  if (isNaN(major) || major < MIN_COMPAT_MAJOR || major > CURRENT_MAJOR) {
    preview.errors.push(
      `Unsupported format_version: ${bundle.format_version ?? "unknown"} ` +
        `(supported: ${MIN_COMPAT_MAJOR}.x – ${CURRENT_MAJOR}.x)`
    );
    return preview;
  }
  preview.format_ok = true;

  // Normalise to current shape before counting.
  const normalised = upgradeBundle(bundle as unknown as Record<string, unknown>);

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
        (preview.conflicts[conflictTarget] as Array<{ id: string; name: string; resolution: Resolution }>).push({
          id: r.id,
          name: r.name,
          resolution: strategy,
        });
      } else {
        bucket.new++;
      }
    }
  };

  fillPrimitive(normalised.data.prompts as PrimitiveRow[], existingPromptNames, "prompts", "prompts");
  fillPrimitive(normalised.data.skills, existingSkillNames, "skills", "skills");
  fillPrimitive(normalised.data.mcp_tools, existingMcpToolNames, "mcp_tools", "mcp_tools");
  fillPrimitive(normalised.data.roles, existingRoleNames, "roles", "roles");

  // Spaces
  if (normalised.data.spaces && tableExists(db, "spaces")) {
    const existingSpaceNames = nameSet(db, "spaces");
    for (const s of normalised.data.spaces) {
      preview.counts.spaces.total++;
      if (existingSpaceNames.has(s.name)) {
        preview.counts.spaces.conflicts++;
        preview.conflicts.spaces.push({ id: s.id, name: s.name, resolution: strategy });
      } else {
        preview.counts.spaces.new++;
      }
    }
  }

  // Boards
  for (const b of normalised.data.boards ?? []) {
    preview.counts.boards.total++;
    if (existingBoardIds.has(b.id)) {
      preview.counts.boards.conflicts++;
      preview.conflicts.boards.push({ id: b.id, name: b.name, resolution: strategy });
    } else {
      preview.counts.boards.new++;
    }
  }

  // Prompt groups
  if (normalised.data.prompt_groups) {
    const existingGroupNames = nameSet(db, "prompt_groups");
    for (const g of normalised.data.prompt_groups) {
      preview.counts.prompt_groups.total++;
      if (existingGroupNames.has(g.name)) {
        preview.counts.prompt_groups.conflicts++;
        preview.conflicts.prompt_groups.push({ id: g.id, name: g.name, resolution: strategy });
      } else {
        preview.counts.prompt_groups.new++;
      }
    }
  }

  preview.counts.settings.total = normalised.data.settings?.length ?? 0;

  return preview;
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

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
  if (!bundle) {
    throw new Error("Unsupported format_version: unknown (supported: 1.x – 2.x)");
  }

  const major = parseMajor(bundle.format_version);
  if (isNaN(major) || major < MIN_COMPAT_MAJOR || major > CURRENT_MAJOR) {
    throw new Error(
      `Unsupported format_version: ${bundle.format_version ?? "unknown"} ` +
        `(supported: ${MIN_COMPAT_MAJOR}.x – ${CURRENT_MAJOR}.x)`
    );
  }

  // Normalise old format before processing.
  const normalised = upgradeBundle(bundle as unknown as Record<string, unknown>);
  assertCompatVersion(normalised);

  const result: ImportResult = {
    counts: {
      spaces: { added: 0, skipped: 0, renamed: 0 },
      boards: { added: 0, skipped: 0, renamed: 0 },
      columns: { added: 0 },
      tasks: { added: 0 },
      roles: { added: 0, skipped: 0, renamed: 0 },
      prompts: { added: 0, skipped: 0, renamed: 0 },
      skills: { added: 0, skipped: 0, renamed: 0 },
      mcp_tools: { added: 0, skipped: 0, renamed: 0 },
      prompt_groups: { added: 0, skipped: 0, renamed: 0 },
      settings: { upserted: 0 },
    },
  };

  const tx = db.transaction(() => {
    // 1) Spaces (feature-flagged).
    const spaceIdMap = importSpaces(db, normalised, strategy, result);

    // 2) Primitives first — roles, tasks and role_* rely on the id maps below.
    const promptMap = importPrimitive(
      db,
      "prompts",
      normalised.data.prompts as PrimitiveRow[] | undefined,
      strategy,
      result.counts.prompts,
      (row, id) => insertPromptRow(db, row as PromptRow, id)
    );
    const skillMap = importPrimitive(
      db,
      "skills",
      normalised.data.skills,
      strategy,
      result.counts.skills
    );
    const mcpToolMap = importPrimitive(
      db,
      "mcp_tools",
      normalised.data.mcp_tools,
      strategy,
      result.counts.mcp_tools
    );
    const roleMap = importPrimitive(
      db,
      "roles",
      normalised.data.roles,
      strategy,
      result.counts.roles
    );

    // 3) Role link tables — drop rows whose endpoints were skipped.
    importRoleLinks(
      db,
      "role_prompts",
      "prompt_id",
      normalised.data.role_prompts,
      roleMap.idMap,
      promptMap.idMap
    );
    importRoleLinks(
      db,
      "role_skills",
      "skill_id",
      normalised.data.role_skills,
      roleMap.idMap,
      skillMap.idMap
    );
    importRoleLinks(
      db,
      "role_mcp_tools",
      "mcp_tool_id",
      normalised.data.role_mcp_tools,
      roleMap.idMap,
      mcpToolMap.idMap
    );

    // 4) Prompt groups + members.
    importPromptGroups(db, normalised, promptMap.idMap, strategy, result);

    // 5) Tags + prompt_tags (feature-flagged).
    importTags(db, normalised, promptMap.idMap);

    // 6) Boards + columns + tasks + task link tables.
    importBoards(
      db,
      normalised,
      strategy,
      spaceIdMap,
      roleMap.idMap,
      promptMap.idMap,
      skillMap.idMap,
      mcpToolMap.idMap,
      result
    );

    // 7) Settings — upsert wholesale; nothing here can conflict destructively.
    if (normalised.data.settings && normalised.data.settings.length > 0) {
      const upsert = db.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      );
      for (const s of normalised.data.settings as SettingRow[]) {
        upsert.run(s.key, s.value, s.updated_at);
        result.counts.settings.upserted++;
      }
    }
  });
  tx();

  return result;
}

// ---------------------------------------------------------------------------
// Insert helpers
// ---------------------------------------------------------------------------

/**
 * Insert a prompt row with optional new columns (short_description,
 * token_count) if those columns exist in the destination DB.
 */
function insertPromptRow(db: Database, row: PromptRow, effectiveId: string): void {
  const hasShortDesc = columnExists(db, "prompts", "short_description");
  const hasTokenCount = columnExists(db, "prompts", "token_count");

  if (hasShortDesc && hasTokenCount) {
    db.prepare(
      `INSERT INTO prompts (id, name, content, color, short_description, token_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      effectiveId,
      row.name,
      row.content ?? "",
      row.color ?? "#888",
      row.short_description ?? null,
      row.token_count ?? null,
      row.created_at ?? Date.now(),
      Date.now()
    );
  } else if (hasShortDesc) {
    db.prepare(
      `INSERT INTO prompts (id, name, content, color, short_description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      effectiveId,
      row.name,
      row.content ?? "",
      row.color ?? "#888",
      row.short_description ?? null,
      row.created_at ?? Date.now(),
      Date.now()
    );
  } else {
    db.prepare(
      `INSERT INTO prompts (id, name, content, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      effectiveId,
      row.name,
      row.content ?? "",
      row.color ?? "#888",
      row.created_at ?? Date.now(),
      Date.now()
    );
  }
}

// ---------------------------------------------------------------------------
// Spaces import
// ---------------------------------------------------------------------------

function importSpaces(
  db: Database,
  bundle: ExportBundle,
  strategy: ConflictStrategy,
  result: ImportResult
): Map<string, string> {
  const idMap = new Map<string, string>();
  const spaces = bundle.data.spaces;

  if (!spaces || spaces.length === 0) return idMap;
  if (!tableExists(db, "spaces")) return idMap;

  const existingNames = nameSet(db, "spaces");
  const existingByName = db.prepare("SELECT id, name FROM spaces").all() as {
    id: string;
    name: string;
  }[];
  const nameToId = new Map(existingByName.map((r) => [r.name, r.id]));

  // Detect available columns on spaces table for insert
  const spaceCols = db.prepare("PRAGMA table_info(spaces)").all() as { name: string }[];
  const hasSlugPrefix = spaceCols.some((c) => c.name === "prefix");

  // Track prefixes too — `prefix` is UNIQUE in the spaces schema, so a
  // bundle that carries `task` (the default-space prefix) will collide on
  // import. Mint a fresh prefix when needed.
  const existingPrefixes = new Set(
    (db.prepare("SELECT prefix FROM spaces").all() as { prefix: string }[]).map(
      (r) => r.prefix
    )
  );
  const mintPrefix = (desired: string): string => {
    let candidate = desired.replace(/[^a-z0-9-]/g, "").slice(0, 10) || "spc";
    if (!existingPrefixes.has(candidate)) return candidate;
    let n = 2;
    while (existingPrefixes.has(`${candidate}${n}`)) n++;
    return `${candidate}${n}`.slice(0, 10);
  };

  for (const space of spaces as SpaceRow[]) {
    if (existingNames.has(space.name)) {
      if (strategy === "skip") {
        const existingId = nameToId.get(space.name);
        if (existingId) idMap.set(space.id, existingId);
        result.counts.spaces.skipped++;
        continue;
      }
      const newName = findAvailableName(space.name, existingNames);
      const newId = nanoid();
      const newPrefix = mintPrefix(space.prefix ?? newName.toLowerCase());
      insertSpaceRow(db, { ...space, prefix: newPrefix }, newId, newName, hasSlugPrefix);
      existingNames.add(newName);
      existingPrefixes.add(newPrefix);
      nameToId.set(newName, newId);
      idMap.set(space.id, newId);
      result.counts.spaces.renamed++;
    } else {
      const newPrefix = mintPrefix(space.prefix ?? space.name.toLowerCase());
      insertSpaceRow(db, { ...space, prefix: newPrefix }, space.id, space.name, hasSlugPrefix);
      existingNames.add(space.name);
      existingPrefixes.add(newPrefix);
      nameToId.set(space.name, space.id);
      idMap.set(space.id, space.id);
      result.counts.spaces.added++;
    }
  }

  // Restore space_counters for imported spaces
  if (tableExists(db, "space_counters") && bundle.data.space_counters) {
    const upsert = db.prepare(
      `INSERT INTO space_counters (space_id, next_number) VALUES (?, ?)
       ON CONFLICT(space_id) DO UPDATE SET next_number = MAX(excluded.next_number, next_number)`
    );
    for (const sc of bundle.data.space_counters as SpaceCounterRow[]) {
      const effectiveSpaceId = idMap.get(sc.space_id);
      if (!effectiveSpaceId) continue;
      upsert.run(effectiveSpaceId, sc.next_number ?? 1);
    }
  }

  return idMap;
}

function insertSpaceRow(
  db: Database,
  space: SpaceRow,
  id: string,
  name: string,
  hasSlugPrefix: boolean
): void {
  if (hasSlugPrefix) {
    db.prepare(
      `INSERT INTO spaces (id, name, prefix, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
    ).run(id, name, space.prefix ?? name.toLowerCase().slice(0, 4), space.created_at ?? Date.now(), Date.now());
  } else {
    db.prepare(
      `INSERT INTO spaces (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`
    ).run(id, name, space.created_at ?? Date.now(), Date.now());
  }
}

// ---------------------------------------------------------------------------
// Prompt groups import
// ---------------------------------------------------------------------------

function importPromptGroups(
  db: Database,
  bundle: ExportBundle,
  promptIdMap: Map<string, string>,
  strategy: ConflictStrategy,
  result: ImportResult
): void {
  const groups = bundle.data.prompt_groups;
  const members = bundle.data.prompt_group_members;

  if (!groups || groups.length === 0) return;

  const existingNames = nameSet(db, "prompt_groups");
  const existingByName = db
    .prepare("SELECT id, name FROM prompt_groups")
    .all() as { id: string; name: string }[];
  const nameToId = new Map(existingByName.map((r) => [r.name, r.id]));

  const groupIdMap = new Map<string, string>();

  for (const group of groups as PromptGroupRow[]) {
    if (existingNames.has(group.name)) {
      if (strategy === "skip") {
        const existingId = nameToId.get(group.name);
        if (existingId) groupIdMap.set(group.id, existingId);
        result.counts.prompt_groups.skipped++;
        continue;
      }
      const newName = findAvailableName(group.name, existingNames);
      const newId = nanoid();
      db.prepare(
        `INSERT INTO prompt_groups (id, name, color, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(newId, newName, group.color ?? null, group.position ?? 0, group.created_at ?? Date.now(), Date.now());
      existingNames.add(newName);
      nameToId.set(newName, newId);
      groupIdMap.set(group.id, newId);
      result.counts.prompt_groups.renamed++;
    } else {
      db.prepare(
        `INSERT INTO prompt_groups (id, name, color, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(group.id, group.name, group.color ?? null, group.position ?? 0, group.created_at ?? Date.now(), Date.now());
      existingNames.add(group.name);
      nameToId.set(group.name, group.id);
      groupIdMap.set(group.id, group.id);
      result.counts.prompt_groups.added++;
    }
  }

  // Insert members, remapping both group and prompt ids.
  if (members && members.length > 0) {
    const insertMember = db.prepare(
      `INSERT OR IGNORE INTO prompt_group_members (group_id, prompt_id, position, added_at) VALUES (?, ?, ?, ?)`
    );
    for (const m of members as PromptGroupMemberRow[]) {
      const groupId = groupIdMap.get(m.group_id);
      const promptId = promptIdMap.get(m.prompt_id);
      if (!groupId || !promptId) continue;
      insertMember.run(groupId, promptId, m.position ?? 0, m.added_at ?? Date.now());
    }
  }
}

// ---------------------------------------------------------------------------
// Tags import (feature-flagged)
// ---------------------------------------------------------------------------

function importTags(
  db: Database,
  bundle: ExportBundle,
  promptIdMap: Map<string, string>
): void {
  if (!bundle.data.tags || bundle.data.tags.length === 0) return;
  if (!tableExists(db, "tags")) return;

  const tagCols = db.prepare("PRAGMA table_info(tags)").all() as { name: string }[];
  const colNames = tagCols.map((c) => c.name);

  // Build insert SQL from available columns
  const availCols = ["id", "name", "color", "created_at", "updated_at"].filter((c) =>
    colNames.includes(c)
  );

  const insertTag = db.prepare(
    `INSERT OR IGNORE INTO tags (${availCols.join(", ")}) VALUES (${availCols.map(() => "?").join(", ")})`
  );

  for (const tag of bundle.data.tags as TagRow[]) {
    const vals = availCols.map((c) => {
      if (c === "id") return tag.id;
      if (c === "name") return tag.name;
      if (c === "color") return tag.color ?? null;
      if (c === "created_at") return tag.created_at ?? Date.now();
      if (c === "updated_at") return tag.updated_at ?? Date.now();
      return null;
    });
    insertTag.run(...(vals as [unknown, ...unknown[]]));
  }

  if (!bundle.data.prompt_tags || bundle.data.prompt_tags.length === 0) return;
  if (!tableExists(db, "prompt_tags")) return;

  const insertPT = db.prepare(
    `INSERT OR IGNORE INTO prompt_tags (prompt_id, tag_id) VALUES (?, ?)`
  );
  for (const pt of bundle.data.prompt_tags as PromptTagRow[]) {
    const promptId = promptIdMap.get(pt.prompt_id) ?? pt.prompt_id;
    insertPT.run(promptId, pt.tag_id);
  }
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function importPrimitive(
  db: Database,
  table: PrimitiveKind,
  rows: PrimitiveRow[] | undefined,
  strategy: ConflictStrategy,
  counter: { added: number; skipped: number; renamed: number },
  customInsert?: (row: PrimitiveRow, id: string) => void
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

  const defaultInsert = db.prepare(
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
      if (customInsert) {
        customInsert({ ...row, name: newName }, newId);
      } else {
        defaultInsert.run(
          newId,
          newName,
          row.content ?? "",
          row.color ?? "#888",
          row.created_at ?? Date.now(),
          Date.now()
        );
      }
      existingNames.add(newName);
      nameToId.set(newName, newId);
      idMap.set(row.id, newId);
      resolution.set(row.id, "rename");
      counter.renamed++;
    } else {
      if (customInsert) {
        customInsert(row, row.id);
      } else {
        defaultInsert.run(
          row.id,
          row.name,
          row.content ?? "",
          row.color ?? "#888",
          row.created_at ?? Date.now(),
          Date.now()
        );
      }
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
  spaceIdMap: Map<string, string>,
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
  const taskPromptOverrides = bundle.data.task_prompt_overrides ?? [];

  const existingBoardIds = idSet(db, "boards");
  const boardHasSpaceId = columnExists(db, "boards", "space_id");
  const boardHasPosition = columnExists(db, "boards", "position");

  // Get the default space id for boards whose source space wasn't imported.
  const defaultSpaceId = boardHasSpaceId ? getDefaultSpaceId(db) : null;

  const insertBoard = buildInsertBoardStmt(db, boardHasSpaceId, boardHasPosition);
  const insertColumn = db.prepare(
    "INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)"
  );
  const insertTask = buildInsertTaskStmt(db);

  for (const b of boards as BoardRow[]) {
    // Resolve the effective space id for this board.
    const effectiveSpaceId = resolveSpaceId(b.space_id, spaceIdMap, defaultSpaceId);

    if (existingBoardIds.has(b.id)) {
      if (strategy === "skip") {
        result.counts.boards.skipped++;
        continue;
      }

      // Rename path: fresh board id, columns and tasks all get fresh ids too.
      const newBoardId = nanoid();
      runInsertBoard(insertBoard, newBoardId, `${b.name} (imported)`, b, effectiveSpaceId, boardHasSpaceId, boardHasPosition);
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
        taskPromptOverrides,
        columnIdMap,
        roleIdMap,
        promptIdMap,
        skillIdMap,
        mcpToolIdMap,
        insertTask,
        result,
        true,
        effectiveSpaceId
      );
      continue;
    }

    // Fresh board — original ids preserved for columns/tasks/task links.
    runInsertBoard(insertBoard, b.id, b.name, b, effectiveSpaceId, boardHasSpaceId, boardHasPosition);
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
      taskPromptOverrides,
      columnIdMap,
      roleIdMap,
      promptIdMap,
      skillIdMap,
      mcpToolIdMap,
      insertTask,
      result,
      false,
      effectiveSpaceId
    );
  }
}

function getDefaultSpaceId(db: Database): string | null {
  if (!tableExists(db, "spaces")) return null;
  const row = db.prepare("SELECT id FROM spaces ORDER BY created_at ASC LIMIT 1").get() as
    | { id: string }
    | undefined;
  return row?.id ?? null;
}

function resolveSpaceId(
  sourceSpaceId: string | null | undefined,
  spaceIdMap: Map<string, string>,
  defaultSpaceId: string | null
): string | null {
  if (!sourceSpaceId) return defaultSpaceId;
  return spaceIdMap.get(sourceSpaceId) ?? defaultSpaceId;
}

function buildInsertBoardStmt(
  db: Database,
  hasSpaceId: boolean,
  hasPosition: boolean
): PreparedStatement {
  const cols = ["id", "name"];
  const params = ["?", "?"];
  if (hasSpaceId) { cols.push("space_id"); params.push("?"); }
  if (hasPosition) { cols.push("position"); params.push("?"); }
  cols.push("created_at", "updated_at");
  params.push("?", "?");
  return db.prepare(`INSERT INTO boards (${cols.join(", ")}) VALUES (${params.join(", ")})`);
}

function runInsertBoard(
  stmt: PreparedStatement,
  id: string,
  name: string,
  b: BoardRow,
  effectiveSpaceId: string | null,
  hasSpaceId: boolean,
  hasPosition: boolean
): void {
  const vals: unknown[] = [id, name];
  if (hasSpaceId) vals.push(effectiveSpaceId);
  if (hasPosition) vals.push(b.position ?? 0);
  vals.push(b.created_at ?? Date.now(), Date.now());
  stmt.run(...(vals as [unknown, ...unknown[]]));
}

function buildInsertTaskStmt(db: Database): PreparedStatement {
  const hasSlug = columnExists(db, "tasks", "slug");
  // Post-0.3.0 schema replaced tasks.number with tasks.slug. Older bundles
  // may still carry .number — we drop it on import (slug supersedes).
  if (hasSlug) {
    return db.prepare(
      `INSERT INTO tasks (id, board_id, column_id, slug, title, description, position, role_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
  }
  return db.prepare(
    `INSERT INTO tasks (id, board_id, column_id, title, description, position, role_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
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
  taskPromptOverrides: TaskPromptOverrideRow[],
  columnIdMap: Map<string, string>,
  roleIdMap: Map<string, string>,
  promptIdMap: Map<string, string>,
  skillIdMap: Map<string, string>,
  mcpToolIdMap: Map<string, string>,
  insertTask: PreparedStatement,
  result: ImportResult,
  isRename: boolean,
  effectiveSpaceId: string | null
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

  const hasSlug = columnExists(db, "tasks", "slug");
  const hasTaskPromptOverrides = tableExists(db, "task_prompt_overrides");

  // For renamed boards we recount `number` from scratch so per-board numbering
  // stays dense; fresh boards can preserve imported values.
  let nextNumber = 1;

  const boardTasks = tasks.filter((t) => t.board_id === origBoardId);
  for (const t of boardTasks) {
    const newColId = columnIdMap.get(t.column_id);
    if (!newColId) continue;
    const newTaskId = isRename ? nanoid() : t.id;
    const mappedRoleId = t.role_id ? roleIdMap.get(t.role_id) ?? null : null;
    const number = isRename ? nextNumber++ : t.number;

    // Re-mint slug using space counter if slug column exists and space is known.
    const slug = hasSlug ? mintSlug(db, effectiveSpaceId, number) : undefined;

    if (hasSlug) {
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
    } else {
      insertTask.run(
        newTaskId,
        newBoardId,
        newColId,
        t.title,
        t.description ?? "",
        t.position ?? 0,
        mappedRoleId,
        t.created_at ?? Date.now(),
        Date.now()
      );
    }
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

    // task_prompt_overrides (feature-flagged)
    if (hasTaskPromptOverrides && taskPromptOverrides.length > 0) {
      const insertOverride = db.prepare(
        `INSERT OR IGNORE INTO task_prompt_overrides (task_id, prompt_id, override_content) VALUES (?, ?, ?)`
      );
      for (const ov of taskPromptOverrides) {
        if (ov.task_id !== t.id) continue;
        const promptId = promptIdMap.get(ov.prompt_id);
        if (!promptId) continue;
        insertOverride.run(newTaskId, promptId, ov.override_content ?? "");
      }
    }
  }
}

/**
 * Re-mint a slug for the destination space. Increments the space_counters
 * row if the table exists; otherwise returns null.
 */
function mintSlug(
  db: Database,
  spaceId: string | null,
  _taskNumber: number
): string | null {
  if (!spaceId || !tableExists(db, "space_counters")) return null;

  // Get prefix from spaces table.
  const space = tableExists(db, "spaces")
    ? (db.prepare("SELECT * FROM spaces WHERE id = ?").get(spaceId) as {
        prefix?: string;
        name?: string;
      } | undefined)
    : undefined;

  const prefix = space?.prefix ?? space?.name?.toLowerCase().slice(0, 4) ?? "t";

  // Atomically claim the next counter value.
  const row = db
    .prepare("SELECT next_number FROM space_counters WHERE space_id = ?")
    .get(spaceId) as { next_number: number } | undefined;

  const num = row?.next_number ?? 1;
  db.prepare(
    `INSERT INTO space_counters (space_id, next_number) VALUES (?, ?)
     ON CONFLICT(space_id) DO UPDATE SET next_number = next_number + 1`
  ).run(spaceId, num + 1);

  return `${prefix}-${num}`;
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

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function idSet(db: Database, table: "boards"): Set<string> {
  return new Set(
    (db.prepare(`SELECT id FROM ${table}`).all() as { id: string }[]).map((r) => r.id)
  );
}

function nameSet(db: Database, table: PrimitiveKind | "spaces" | "prompt_groups"): Set<string> {
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
