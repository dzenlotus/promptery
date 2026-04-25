import type { Database } from "better-sqlite3";
import { nanoid } from "nanoid";
import type { Role } from "./roles.js";
import type { Board } from "./boards.js";
import type { Column } from "./columns.js";
import { listTaskPrompts, type TaskPrompt } from "./taskPrompts.js";
import { listTaskSkills, type TaskSkill } from "./taskSkills.js";
import { listTaskMcpTools, type TaskMcpTool } from "./taskMcpTools.js";

export interface Task {
  id: string;
  board_id: string;
  column_id: string;
  number: number;
  title: string;
  description: string;
  position: number;
  role_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface TaskWithRelations extends Task {
  role: Role | null;
  prompts: TaskPrompt[];
  skills: TaskSkill[];
  mcp_tools: TaskMcpTool[];
}

export interface CreateTaskInput {
  title: string;
  description?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  column_id?: string;
  position?: number;
}

function getRawTask(db: Database, id: string): Task | null {
  const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task | undefined;
  return row ?? null;
}

function attachRelations(db: Database, task: Task): TaskWithRelations {
  const role = task.role_id
    ? (db.prepare("SELECT * FROM roles WHERE id = ?").get(task.role_id) as Role | undefined) ??
      null
    : null;
  return {
    ...task,
    role,
    prompts: listTaskPrompts(db, task.id),
    skills: listTaskSkills(db, task.id),
    mcp_tools: listTaskMcpTools(db, task.id),
  };
}

export function listTasks(
  db: Database,
  boardId: string,
  columnId?: string
): TaskWithRelations[] {
  const rows = columnId
    ? (db
        .prepare(
          "SELECT * FROM tasks WHERE board_id = ? AND column_id = ? ORDER BY column_id, position ASC"
        )
        .all(boardId, columnId) as Task[])
    : (db
        .prepare("SELECT * FROM tasks WHERE board_id = ? ORDER BY column_id, position ASC")
        .all(boardId) as Task[]);
  return rows.map((t) => attachRelations(db, t));
}

export function getTask(db: Database, id: string): TaskWithRelations | null {
  const task = getRawTask(db, id);
  if (!task) return null;
  return attachRelations(db, task);
}

export function createTask(
  db: Database,
  boardId: string,
  columnId: string,
  input: CreateTaskInput
): Task {
  const numberRow = db
    .prepare("SELECT COALESCE(MAX(number), 0) + 1 AS next FROM tasks WHERE board_id = ?")
    .get(boardId) as { next: number };
  const posRow = db
    .prepare(
      "SELECT COALESCE(MAX(position), 0) + 1 AS next FROM tasks WHERE board_id = ? AND column_id = ?"
    )
    .get(boardId, columnId) as { next: number };

  const id = nanoid();
  const now = Date.now();
  const description = input.description ?? "";
  db.prepare(
    `INSERT INTO tasks
     (id, board_id, column_id, number, title, description, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, boardId, columnId, numberRow.next, input.title, description, posRow.next, now, now);

  return {
    id,
    board_id: boardId,
    column_id: columnId,
    number: numberRow.next,
    title: input.title,
    description,
    position: posRow.next,
    role_id: null,
    created_at: now,
    updated_at: now,
  };
}

export function updateTask(db: Database, id: string, input: UpdateTaskInput): Task | null {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (input.title !== undefined) {
    sets.push("title = ?");
    vals.push(input.title);
  }
  if (input.description !== undefined) {
    sets.push("description = ?");
    vals.push(input.description);
  }
  if (input.column_id !== undefined) {
    sets.push("column_id = ?");
    vals.push(input.column_id);
  }
  if (input.position !== undefined) {
    sets.push("position = ?");
    vals.push(input.position);
  }
  if (sets.length === 0) return getRawTask(db, id);
  sets.push("updated_at = ?");
  vals.push(Date.now());
  vals.push(id);
  const result = db
    .prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`)
    .run(...(vals as [unknown, ...unknown[]]));
  if (result.changes === 0) return null;
  return getRawTask(db, id);
}

export function moveTask(
  db: Database,
  id: string,
  targetColumnId: string,
  targetPosition: number
): Task | null {
  return updateTask(db, id, { column_id: targetColumnId, position: targetPosition });
}

export function deleteTask(db: Database, id: string): boolean {
  const result = db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
  return result.changes > 0;
}

export interface TaskWithLocation {
  task: Task;
  column: Pick<Column, "id" | "name" | "position">;
  board: Pick<Board, "id" | "name">;
}

export interface SearchTasksOptions {
  query?: string;
  board_id?: string;
  column_id?: string;
  role_id?: string;
  limit?: number;
}

interface JoinedRow extends Task {
  col_id: string;
  col_name: string;
  col_position: number;
  brd_id: string;
  brd_name: string;
}

const TASK_FIELDS = [
  "id",
  "board_id",
  "column_id",
  "number",
  "title",
  "description",
  "position",
  "role_id",
  "created_at",
  "updated_at",
] as const;

function rowToTaskWithLocation(row: JoinedRow): TaskWithLocation {
  const bag: Record<string, unknown> = {};
  for (const f of TASK_FIELDS) {
    bag[f] = row[f as keyof JoinedRow];
  }
  return {
    task: bag as unknown as Task,
    column: { id: row.col_id, name: row.col_name, position: row.col_position },
    board: { id: row.brd_id, name: row.brd_name },
  };
}

/**
 * FTS5 treats `"`, `*`, `:`, `-`, `.`, etc. as syntax. Wrapping each token in
 * double quotes (with embedded `"` doubled) sidesteps the grammar entirely
 * and matches the user's text as literal phrases — friendly for casual
 * searches like "auth bug" or names with dashes.
 */
function escapeFtsQuery(q: string): string {
  return q
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `"${token.replace(/"/g, '""')}"`)
    .join(" ");
}

/**
 * Cross-board task search with location context. With a non-empty `query`,
 * routes through tasks_fts and orders by FTS rank; without, falls back to
 * a plain join ordered by created_at DESC. Filters (`board_id`, `column_id`,
 * `role_id`) compose with either path.
 */
export function searchTasks(db: Database, opts: SearchTasksOptions): TaskWithLocation[] {
  const limit = opts.limit ?? 20;
  const conditions: string[] = [];
  const params: unknown[] = [];
  const hasQuery = !!(opts.query && opts.query.trim().length > 0);

  let sql: string;
  if (hasQuery) {
    sql = `
      SELECT t.id, t.board_id, t.column_id, t.number, t.title, t.description,
             t.position, t.role_id, t.created_at, t.updated_at,
             c.id AS col_id, c.name AS col_name, c.position AS col_position,
             b.id AS brd_id, b.name AS brd_name
      FROM tasks_fts fts
      JOIN tasks t ON t.id = fts.task_id
      JOIN columns c ON c.id = t.column_id
      JOIN boards b ON b.id = c.board_id
      WHERE tasks_fts MATCH ?
    `;
    params.push(escapeFtsQuery(opts.query!));
  } else {
    sql = `
      SELECT t.id, t.board_id, t.column_id, t.number, t.title, t.description,
             t.position, t.role_id, t.created_at, t.updated_at,
             c.id AS col_id, c.name AS col_name, c.position AS col_position,
             b.id AS brd_id, b.name AS brd_name
      FROM tasks t
      JOIN columns c ON c.id = t.column_id
      JOIN boards b ON b.id = c.board_id
      WHERE 1=1
    `;
  }

  if (opts.board_id) {
    conditions.push("b.id = ?");
    params.push(opts.board_id);
  }
  if (opts.column_id) {
    conditions.push("c.id = ?");
    params.push(opts.column_id);
  }
  if (opts.role_id) {
    conditions.push("t.role_id = ?");
    params.push(opts.role_id);
  }

  if (conditions.length > 0) {
    sql += " AND " + conditions.join(" AND ");
  }

  sql += hasQuery ? " ORDER BY rank LIMIT ?" : " ORDER BY t.created_at DESC LIMIT ?";
  params.push(limit);

  const rows = db.prepare(sql).all(...(params as [unknown, ...unknown[]])) as JoinedRow[];
  return rows.map(rowToTaskWithLocation);
}

/**
 * Lite get_task variant: task + column + board without the role/prompts/skills
 * bundle. For the heavy version use getTask + buildContextBundle.
 */
export function getTaskWithLocation(db: Database, id: string): TaskWithLocation | null {
  const row = db
    .prepare(
      `SELECT t.id, t.board_id, t.column_id, t.number, t.title, t.description,
              t.position, t.role_id, t.created_at, t.updated_at,
              c.id AS col_id, c.name AS col_name, c.position AS col_position,
              b.id AS brd_id, b.name AS brd_name
       FROM tasks t
       JOIN columns c ON c.id = t.column_id
       JOIN boards b ON b.id = c.board_id
       WHERE t.id = ?`
    )
    .get(id) as JoinedRow | undefined;
  return row ? rowToTaskWithLocation(row) : null;
}

/**
 * Assign or clear the task's role and reconcile its inherited primitives.
 *
 * Removes any previously inherited rows tagged `role:<old>` first, then
 * (if a new role is given) copies that role's prompts/skills/mcp_tools into
 * the task_* tables tagged `role:<new>`. Direct-attached primitives are
 * untouched. INSERT OR IGNORE so a primitive already attached directly
 * stays as-is rather than being shadowed by a role-origin duplicate.
 */
export function setTaskRole(db: Database, taskId: string, roleId: string | null): void {
  const tx = db.transaction(() => {
    const currentTask = db
      .prepare("SELECT role_id FROM tasks WHERE id = ?")
      .get(taskId) as { role_id: string | null } | undefined;

    if (currentTask?.role_id) {
      const oldOrigin = `role:${currentTask.role_id}`;
      db.prepare("DELETE FROM task_prompts WHERE task_id = ? AND origin = ?").run(
        taskId,
        oldOrigin
      );
      db.prepare("DELETE FROM task_skills WHERE task_id = ? AND origin = ?").run(
        taskId,
        oldOrigin
      );
      db.prepare("DELETE FROM task_mcp_tools WHERE task_id = ? AND origin = ?").run(
        taskId,
        oldOrigin
      );
    }

    db.prepare("UPDATE tasks SET role_id = ?, updated_at = ? WHERE id = ?").run(
      roleId,
      Date.now(),
      taskId
    );

    if (roleId) {
      const newOrigin = `role:${roleId}`;

      const rolePrompts = db
        .prepare("SELECT prompt_id FROM role_prompts WHERE role_id = ? ORDER BY position")
        .all(roleId) as { prompt_id: string }[];
      const insertPrompt = db.prepare(
        "INSERT OR IGNORE INTO task_prompts (task_id, prompt_id, origin, position) VALUES (?, ?, ?, ?)"
      );
      rolePrompts.forEach(({ prompt_id }, i) => insertPrompt.run(taskId, prompt_id, newOrigin, i));

      const roleSkills = db
        .prepare("SELECT skill_id FROM role_skills WHERE role_id = ? ORDER BY position")
        .all(roleId) as { skill_id: string }[];
      const insertSkill = db.prepare(
        "INSERT OR IGNORE INTO task_skills (task_id, skill_id, origin, position) VALUES (?, ?, ?, ?)"
      );
      roleSkills.forEach(({ skill_id }, i) => insertSkill.run(taskId, skill_id, newOrigin, i));

      const roleMcp = db
        .prepare("SELECT mcp_tool_id FROM role_mcp_tools WHERE role_id = ? ORDER BY position")
        .all(roleId) as { mcp_tool_id: string }[];
      const insertMcp = db.prepare(
        "INSERT OR IGNORE INTO task_mcp_tools (task_id, mcp_tool_id, origin, position) VALUES (?, ?, ?, ?)"
      );
      roleMcp.forEach(({ mcp_tool_id }, i) => insertMcp.run(taskId, mcp_tool_id, newOrigin, i));
    }
  });
  tx();
}
