import type { Database } from "better-sqlite3";

export const EXPORT_FORMAT_VERSION = "2.0";

export interface ExportOptions {
  /** Default true. Includes boards, columns, tasks and task_* link rows. */
  includeBoards?: boolean;
  /** Default true. Includes roles and role_* link rows. */
  includeRoles?: boolean;
  /**
   * Default true. Includes prompts, skills and mcp_tools — the three primitive
   * tables the UI lumps together under the "Prompts" label.
   */
  includePrompts?: boolean;
  /** Default false — settings rarely make sense to move between machines. */
  includeSettings?: boolean;
  /** Narrow boards export to a specific subset; ignored when empty/undefined. */
  boardIds?: string[];
}

export interface ExportBundle {
  format_version: string;
  exported_at: string;
  app_version: string;
  options: ExportOptions;
  data: {
    spaces?: SpaceRow[];
    space_counters?: SpaceCounterRow[];
    boards?: BoardRow[];
    columns?: ColumnRow[];
    tasks?: TaskRow[];
    task_prompts?: TaskLinkRow[];
    task_skills?: TaskLinkRow[];
    task_mcp_tools?: TaskLinkRow[];
    task_prompt_overrides?: TaskPromptOverrideRow[];
    roles?: PrimitiveRow[];
    role_prompts?: RoleLinkRow[];
    role_skills?: RoleLinkRow[];
    role_mcp_tools?: RoleLinkRow[];
    prompts?: PromptRow[];
    skills?: PrimitiveRow[];
    mcp_tools?: PrimitiveRow[];
    prompt_groups?: PromptGroupRow[];
    prompt_group_members?: PromptGroupMemberRow[];
    tags?: TagRow[];
    prompt_tags?: PromptTagRow[];
    settings?: SettingRow[];
  };
}

export interface SpaceRow {
  id: string;
  name: string;
  prefix: string;
  created_at: number;
  updated_at: number;
}

export interface SpaceCounterRow {
  space_id: string;
  next_number: number;
}

export interface BoardRow {
  id: string;
  name: string;
  space_id?: string | null;
  position?: number | null;
  created_at: number;
  updated_at: number;
}

export interface ColumnRow {
  id: string;
  board_id: string;
  name: string;
  position: number;
  created_at: number;
}

export interface TaskRow {
  id: string;
  board_id: string;
  column_id: string;
  number: number;
  slug?: string | null;
  title: string;
  description: string | null;
  position: number;
  role_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface PromptRow {
  id: string;
  name: string;
  content: string;
  color: string | null;
  short_description?: string | null;
  token_count?: number | null;
  created_at: number;
  updated_at: number;
}

export interface PrimitiveRow {
  id: string;
  name: string;
  content: string;
  color: string | null;
  created_at: number;
  updated_at: number;
}

export interface RoleLinkRow {
  role_id: string;
  position: number;
  prompt_id?: string;
  skill_id?: string;
  mcp_tool_id?: string;
}

export interface TaskLinkRow {
  task_id: string;
  origin: string;
  position: number;
  prompt_id?: string;
  skill_id?: string;
  mcp_tool_id?: string;
}

export interface TaskPromptOverrideRow {
  task_id: string;
  prompt_id: string;
  override_content: string;
}

export interface PromptGroupRow {
  id: string;
  name: string;
  color: string | null;
  position: number;
  created_at: number;
  updated_at: number;
}

export interface PromptGroupMemberRow {
  group_id: string;
  prompt_id: string;
  position: number;
  added_at: number;
}

export interface TagRow {
  id: string;
  name: string;
  color: string | null;
  created_at: number;
  updated_at: number;
}

export interface PromptTagRow {
  prompt_id: string;
  tag_id: string;
}

export interface SettingRow {
  key: string;
  value: string;
  updated_at: number;
}

// ---------------------------------------------------------------------------
// Runtime feature detection helpers
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
// Export builder
// ---------------------------------------------------------------------------

export function buildExport(
  db: Database,
  options: ExportOptions,
  appVersion: string
): ExportBundle {
  const includeBoards = options.includeBoards !== false;
  const includeRoles = options.includeRoles !== false;
  const includePrompts = options.includePrompts !== false;
  const includeSettings = options.includeSettings === true;

  const data: ExportBundle["data"] = {};

  // -------------------------------------------------------------------------
  // Spaces (feature-flagged: table may not exist yet)
  // -------------------------------------------------------------------------
  if (tableExists(db, "spaces")) {
    data.spaces = db.prepare("SELECT * FROM spaces ORDER BY created_at").all() as SpaceRow[];
  }
  if (tableExists(db, "space_counters")) {
    data.space_counters = db
      .prepare("SELECT * FROM space_counters")
      .all() as SpaceCounterRow[];
  }

  // -------------------------------------------------------------------------
  // Boards + columns + tasks
  // -------------------------------------------------------------------------
  if (includeBoards) {
    const filterIds = options.boardIds && options.boardIds.length > 0 ? options.boardIds : null;

    // Select boards — include space_id and position if columns exist
    const boardHasSpaceId = columnExists(db, "boards", "space_id");
    const boardHasPosition = columnExists(db, "boards", "position");
    const boardCols = boardHasSpaceId || boardHasPosition
      ? `id, name${boardHasSpaceId ? ", space_id" : ""}${boardHasPosition ? ", position" : ""}, created_at, updated_at`
      : "id, name, created_at, updated_at";

    data.boards = (
      filterIds
        ? (db
            .prepare(
              `SELECT ${boardCols} FROM boards WHERE id IN (${filterIds.map(() => "?").join(",")}) ORDER BY created_at`
            )
            .all(...filterIds) as BoardRow[])
        : (db
            .prepare(`SELECT ${boardCols} FROM boards ORDER BY created_at`)
            .all() as BoardRow[])
    );

    const boardIds = data.boards.map((b) => b.id);
    if (boardIds.length === 0) {
      data.columns = [];
      data.tasks = [];
      data.task_prompts = [];
      data.task_skills = [];
      data.task_mcp_tools = [];
    } else {
      const bPh = boardIds.map(() => "?").join(",");
      data.columns = db
        .prepare(
          `SELECT * FROM columns WHERE board_id IN (${bPh}) ORDER BY board_id, position`
        )
        .all(...boardIds) as ColumnRow[];

      // Build task SELECT — include slug if column exists. tasks.number was
      // dropped in 0.3.0 in favour of tasks.slug; keep the legacy column in
      // the SELECT only when slug is absent (older DBs that haven't migrated).
      const taskHasSlug = columnExists(db, "tasks", "slug");
      const taskCols = taskHasSlug
        ? "id, board_id, column_id, slug, title, description, position, role_id, created_at, updated_at"
        : "id, board_id, column_id, number, title, description, position, role_id, created_at, updated_at";

      data.tasks = db
        .prepare(
          `SELECT ${taskCols} FROM tasks WHERE board_id IN (${bPh}) ORDER BY board_id, position`
        )
        .all(...boardIds) as TaskRow[];

      const taskIds = data.tasks.map((t) => t.id);
      if (taskIds.length > 0) {
        const tPh = taskIds.map(() => "?").join(",");
        data.task_prompts = db
          .prepare(`SELECT * FROM task_prompts WHERE task_id IN (${tPh})`)
          .all(...taskIds) as TaskLinkRow[];
        data.task_skills = db
          .prepare(`SELECT * FROM task_skills WHERE task_id IN (${tPh})`)
          .all(...taskIds) as TaskLinkRow[];
        data.task_mcp_tools = db
          .prepare(`SELECT * FROM task_mcp_tools WHERE task_id IN (${tPh})`)
          .all(...taskIds) as TaskLinkRow[];

        // task_prompt_overrides (feature-flagged)
        if (tableExists(db, "task_prompt_overrides")) {
          data.task_prompt_overrides = db
            .prepare(`SELECT * FROM task_prompt_overrides WHERE task_id IN (${tPh})`)
            .all(...taskIds) as TaskPromptOverrideRow[];
        }
      } else {
        data.task_prompts = [];
        data.task_skills = [];
        data.task_mcp_tools = [];
      }
    }
  }

  // -------------------------------------------------------------------------
  // Roles + role links
  // -------------------------------------------------------------------------
  if (includeRoles) {
    data.roles = db.prepare("SELECT * FROM roles ORDER BY name").all() as PrimitiveRow[];
    data.role_prompts = db.prepare("SELECT * FROM role_prompts").all() as RoleLinkRow[];
    data.role_skills = db.prepare("SELECT * FROM role_skills").all() as RoleLinkRow[];
    data.role_mcp_tools = db
      .prepare("SELECT * FROM role_mcp_tools")
      .all() as RoleLinkRow[];
  }

  // -------------------------------------------------------------------------
  // Prompts, skills, mcp_tools, prompt_groups
  // -------------------------------------------------------------------------
  if (includePrompts) {
    // Build prompts SELECT with optional new columns
    const promptHasShortDesc = columnExists(db, "prompts", "short_description");
    const promptHasTokenCount = columnExists(db, "prompts", "token_count");
    const promptCols = [
      "id", "name", "content", "color",
      promptHasShortDesc ? "short_description" : null,
      promptHasTokenCount ? "token_count" : null,
      "created_at", "updated_at",
    ].filter(Boolean).join(", ");

    data.prompts = db
      .prepare(`SELECT ${promptCols} FROM prompts ORDER BY name`)
      .all() as PromptRow[];

    data.skills = db.prepare("SELECT * FROM skills ORDER BY name").all() as PrimitiveRow[];
    data.mcp_tools = db
      .prepare("SELECT * FROM mcp_tools ORDER BY name")
      .all() as PrimitiveRow[];

    // prompt_groups and members (in base schema since 007)
    data.prompt_groups = db
      .prepare("SELECT * FROM prompt_groups ORDER BY position, name")
      .all() as PromptGroupRow[];
    data.prompt_group_members = db
      .prepare("SELECT * FROM prompt_group_members ORDER BY group_id, position")
      .all() as PromptGroupMemberRow[];

    // tags + prompt_tags (feature-flagged)
    if (tableExists(db, "tags")) {
      data.tags = db.prepare("SELECT * FROM tags ORDER BY name").all() as TagRow[];
    }
    if (tableExists(db, "prompt_tags")) {
      data.prompt_tags = db.prepare("SELECT * FROM prompt_tags").all() as PromptTagRow[];
    }
  }

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------
  if (includeSettings) {
    data.settings = db
      .prepare("SELECT key, value, updated_at FROM settings ORDER BY key")
      .all() as SettingRow[];
  }

  return {
    format_version: EXPORT_FORMAT_VERSION,
    exported_at: new Date().toISOString(),
    app_version: appVersion,
    options: {
      includeBoards,
      includeRoles,
      includePrompts,
      includeSettings,
      ...(options.boardIds && options.boardIds.length > 0
        ? { boardIds: [...options.boardIds] }
        : {}),
    },
    data,
  };
}
