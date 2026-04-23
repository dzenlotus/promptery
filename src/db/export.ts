import type { Database } from "better-sqlite3";

export const EXPORT_FORMAT_VERSION = "1.0";

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
    boards?: BoardRow[];
    columns?: ColumnRow[];
    tasks?: TaskRow[];
    task_prompts?: TaskLinkRow[];
    task_skills?: TaskLinkRow[];
    task_mcp_tools?: TaskLinkRow[];
    roles?: PrimitiveRow[];
    role_prompts?: RoleLinkRow[];
    role_skills?: RoleLinkRow[];
    role_mcp_tools?: RoleLinkRow[];
    prompts?: PrimitiveRow[];
    skills?: PrimitiveRow[];
    mcp_tools?: PrimitiveRow[];
    settings?: SettingRow[];
  };
}

export interface BoardRow {
  id: string;
  name: string;
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
  title: string;
  description: string | null;
  position: number;
  role_id: string | null;
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

export interface SettingRow {
  key: string;
  value: string;
  updated_at: number;
}

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

  if (includeBoards) {
    const filterIds = options.boardIds && options.boardIds.length > 0 ? options.boardIds : null;
    data.boards = (
      filterIds
        ? (db
            .prepare(
              `SELECT * FROM boards WHERE id IN (${filterIds.map(() => "?").join(",")}) ORDER BY created_at`
            )
            .all(...filterIds) as BoardRow[])
        : (db.prepare("SELECT * FROM boards ORDER BY created_at").all() as BoardRow[])
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
      data.tasks = db
        .prepare(
          `SELECT * FROM tasks WHERE board_id IN (${bPh}) ORDER BY board_id, position`
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
      } else {
        data.task_prompts = [];
        data.task_skills = [];
        data.task_mcp_tools = [];
      }
    }
  }

  if (includeRoles) {
    data.roles = db.prepare("SELECT * FROM roles ORDER BY name").all() as PrimitiveRow[];
    data.role_prompts = db.prepare("SELECT * FROM role_prompts").all() as RoleLinkRow[];
    data.role_skills = db.prepare("SELECT * FROM role_skills").all() as RoleLinkRow[];
    data.role_mcp_tools = db
      .prepare("SELECT * FROM role_mcp_tools")
      .all() as RoleLinkRow[];
  }

  if (includePrompts) {
    data.prompts = db.prepare("SELECT * FROM prompts ORDER BY name").all() as PrimitiveRow[];
    data.skills = db.prepare("SELECT * FROM skills ORDER BY name").all() as PrimitiveRow[];
    data.mcp_tools = db
      .prepare("SELECT * FROM mcp_tools ORDER BY name")
      .all() as PrimitiveRow[];
  }

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
