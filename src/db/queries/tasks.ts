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
  /**
   * Human-friendly identifier of the form `<space.prefix>-<n>` (e.g. `pmt-46`).
   * Slugs are minted at creation; they may CHANGE if the task's board is
   * moved to a different space (the slug is then re-derived from the new
   * space's prefix and counter). The internal `id` remains stable across
   * moves and is the right handle for any reference you need to persist.
   */
  slug: string;
  title: string;
  description: string;
  position: number;
  role_id: string | null;
  created_at: number;
  updated_at: number;
}

const SLUG_PATTERN = /^[a-z0-9-]{1,10}-\d+$/;

export function isSlugFormat(value: string): boolean {
  return SLUG_PATTERN.test(value);
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

/**
 * Create a task. The slug is minted server-side from the board's space
 * prefix and the per-space counter. Counter increment + task insert happen
 * inside one transaction so two concurrent inserts cannot collide on a slug.
 */
export function createTask(
  db: Database,
  boardId: string,
  columnId: string,
  input: CreateTaskInput
): Task {
  const id = nanoid();
  const now = Date.now();
  const description = input.description ?? "";

  let slug = "";
  let position = 0;

  const tx = db.transaction(() => {
    const spaceRow = db
      .prepare(
        `SELECT s.id AS space_id, s.prefix
           FROM boards b
           JOIN spaces s ON s.id = b.space_id
          WHERE b.id = ?`
      )
      .get(boardId) as { space_id: string; prefix: string } | undefined;
    if (!spaceRow) {
      throw new Error(`createTask: board ${boardId} not found`);
    }

    const counterRow = db
      .prepare(
        "SELECT next_number FROM space_counters WHERE space_id = ?"
      )
      .get(spaceRow.space_id) as { next_number: number } | undefined;
    const next = counterRow?.next_number ?? 1;
    slug = `${spaceRow.prefix}-${next}`;
    db.prepare(
      "UPDATE space_counters SET next_number = ? WHERE space_id = ?"
    ).run(next + 1, spaceRow.space_id);

    const posRow = db
      .prepare(
        "SELECT COALESCE(MAX(position), 0) + 1 AS next FROM tasks WHERE board_id = ? AND column_id = ?"
      )
      .get(boardId, columnId) as { next: number };
    position = posRow.next;

    db.prepare(
      `INSERT INTO tasks
         (id, board_id, column_id, slug, title, description, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, boardId, columnId, slug, input.title, description, position, now, now);
  });
  tx();

  return {
    id,
    board_id: boardId,
    column_id: columnId,
    slug,
    title: input.title,
    description,
    position,
    role_id: null,
    created_at: now,
    updated_at: now,
  };
}

export function getTaskBySlug(db: Database, slug: string): Task | null {
  const row = db.prepare("SELECT * FROM tasks WHERE slug = ?").get(slug) as
    | Task
    | undefined;
  return row ?? null;
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

/**
 * Move a task to any column — same board OR a different board. Updates the
 * denormalised `tasks.board_id` from the target column so per-board listings
 * stay consistent. Task-owned data (role_id, task_prompts/skills/mcp_tools)
 * is intentionally untouched: it travels with the task. Inherited context
 * (board/column-level prompts, board/column-level role) re-resolves at the
 * new location via the resolver.
 *
 * Returns null if the task does not exist. Does not validate column
 * existence — the caller is expected to have done that and surface a 404.
 */
export function moveTask(
  db: Database,
  id: string,
  targetColumnId: string,
  targetPosition?: number
): Task | null {
  const colRow = db
    .prepare("SELECT board_id FROM columns WHERE id = ?")
    .get(targetColumnId) as { board_id: string } | undefined;
  if (!colRow) return null;

  let position = targetPosition;
  if (position === undefined) {
    const row = db
      .prepare(
        "SELECT COALESCE(MAX(position), 0) + 1 AS next FROM tasks WHERE column_id = ?"
      )
      .get(targetColumnId) as { next: number };
    position = row.next;
  }

  const result = db
    .prepare(
      `UPDATE tasks
         SET column_id = ?, board_id = ?, position = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(targetColumnId, colRow.board_id, position, Date.now(), id);
  if (result.changes === 0) return null;
  return getRawTask(db, id);
}

export type ResolutionHandling = "keep" | "detach" | "copy_to_target_board";

export interface MoveWithResolutionInput {
  targetColumnId: string;
  targetPosition?: number;
  roleHandling: ResolutionHandling;
  promptHandling: ResolutionHandling;
}

/**
 * Cross-board move with explicit role/prompt resolution.
 *
 * Performs the move then applies the caller-chosen resolution strategy for
 * the task's own `role_id` and its direct-origin prompts:
 *
 *  keep                – no-op after move (default behaviour).
 *  detach              – clear `role_id` (and its inherited primitives) after
 *                        move, or remove all direct-origin prompts.
 *  copy_to_target_board – assign the task's role to the target board's
 *                         `role_id` field when the board has none yet; attach
 *                         the role's own prompts to `board_prompts` on the
 *                         target board. For prompt_handling: attach each
 *                         direct-origin prompt to the target board's
 *                         `board_prompts` (idempotent INSERT OR IGNORE).
 *
 * Returns null if the task or target column does not exist.
 */
export function moveTaskWithResolution(
  db: Database,
  taskId: string,
  input: MoveWithResolutionInput
): Task | null {
  const tx = db.transaction((): Task | null => {
    // Snapshot the task before the move so we have the original role_id and
    // prompt list regardless of what happens during the move.
    const before = getRawTask(db, taskId);
    if (!before) return null;

    const moved = moveTask(db, taskId, input.targetColumnId, input.targetPosition);
    if (!moved) return null;

    const targetBoardId = moved.board_id;

    // ---- role_handling -------------------------------------------------
    if (input.roleHandling === "detach" && moved.role_id) {
      // Clear the role and strip its inherited primitives.
      const origin = `role:${moved.role_id}`;
      db.prepare("DELETE FROM task_prompts WHERE task_id = ? AND origin = ?").run(
        taskId,
        origin
      );
      db.prepare("DELETE FROM task_skills WHERE task_id = ? AND origin = ?").run(
        taskId,
        origin
      );
      db.prepare("DELETE FROM task_mcp_tools WHERE task_id = ? AND origin = ?").run(
        taskId,
        origin
      );
      db.prepare("UPDATE tasks SET role_id = ?, updated_at = ? WHERE id = ?").run(
        null,
        Date.now(),
        taskId
      );
    } else if (input.roleHandling === "copy_to_target_board" && moved.role_id) {
      const roleId = moved.role_id;

      // Assign role to target board only when the board has no role yet.
      const targetBoard = db
        .prepare("SELECT role_id FROM boards WHERE id = ?")
        .get(targetBoardId) as { role_id: string | null } | undefined;
      if (targetBoard && targetBoard.role_id === null) {
        db.prepare("UPDATE boards SET role_id = ?, updated_at = ? WHERE id = ?").run(
          roleId,
          Date.now(),
          targetBoardId
        );
      }

      // Attach the role's prompts to the target board (idempotent).
      const rolePrompts = db
        .prepare("SELECT prompt_id, position FROM role_prompts WHERE role_id = ? ORDER BY position")
        .all(roleId) as { prompt_id: string; position: number }[];
      const insertBoardPrompt = db.prepare(
        `INSERT OR IGNORE INTO board_prompts (board_id, prompt_id, position)
         VALUES (?, ?, COALESCE((SELECT MAX(position) FROM board_prompts WHERE board_id = ?), 0) + ?)`
      );
      rolePrompts.forEach(({ prompt_id }, i) => {
        insertBoardPrompt.run(targetBoardId, prompt_id, targetBoardId, i + 1);
      });
    }

    // ---- prompt_handling -----------------------------------------------
    if (input.promptHandling === "detach") {
      db.prepare(
        "DELETE FROM task_prompts WHERE task_id = ? AND origin = 'direct'"
      ).run(taskId);
    } else if (input.promptHandling === "copy_to_target_board") {
      // Collect the direct prompts that existed before the move.
      const directPrompts = db
        .prepare(
          "SELECT prompt_id, position FROM task_prompts WHERE task_id = ? AND origin = 'direct' ORDER BY position"
        )
        .all(taskId) as { prompt_id: string; position: number }[];
      const insertBoardPrompt = db.prepare(
        `INSERT OR IGNORE INTO board_prompts (board_id, prompt_id, position)
         VALUES (?, ?, COALESCE((SELECT MAX(position) FROM board_prompts WHERE board_id = ?), 0) + ?)`
      );
      directPrompts.forEach(({ prompt_id }, i) => {
        insertBoardPrompt.run(targetBoardId, prompt_id, targetBoardId, i + 1);
      });
    }

    return getRawTask(db, taskId);
  });

  return tx();
}

export function deleteTask(db: Database, id: string): boolean {
  const result = db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
  return result.changes > 0;
}

export interface TaskWithLocation {
  task: Task;
  column: Pick<Column, "id" | "name" | "position">;
  board: Pick<Board, "id" | "name">;
  /**
   * How this hit was matched, when surfaced via `searchTasks`:
   *  - `exact` — the query was the task's slug verbatim. Always rank 0.
   *  - `fts`   — full-text match on title/description.
   * Absent on hits that come from non-search code paths (e.g.
   * `getTaskWithLocation`, the empty-query listing path).
   */
  match_type?: "exact" | "fts";
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
  "slug",
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
export const SEARCH_TASKS_DEFAULT_LIMIT = 20;
export const SEARCH_TASKS_MAX_LIMIT = 500;

export function searchTasks(db: Database, opts: SearchTasksOptions): TaskWithLocation[] {
  // Defense-in-depth: the HTTP layer rejects limits > MAX with 400, but the
  // repo also caps to keep direct callers (other server code, MCP bridges,
  // bundle CLI) from accidentally pulling unbounded result sets.
  const requested = opts.limit ?? SEARCH_TASKS_DEFAULT_LIMIT;
  const limit = Math.min(Math.max(1, requested), SEARCH_TASKS_MAX_LIMIT);
  const conditions: string[] = [];
  const params: unknown[] = [];
  const hasQuery = !!(opts.query && opts.query.trim().length > 0);

  // Slug shortcut: if the query *is* a slug, return that task as the top
  // result with `match_type: 'exact'`. The FTS pass below still runs (a
  // user typing `pmt-46` may want substring hits in descriptions too), and
  // dedupe at the end keeps the exact match while dropping the FTS row
  // that points at the same task.
  let exactSlugHit: TaskWithLocation | null = null;
  if (hasQuery) {
    const trimmed = opts.query!.trim();
    if (isSlugFormat(trimmed)) {
      const row = db
        .prepare(
          `SELECT t.id, t.board_id, t.column_id, t.slug, t.title, t.description,
                  t.position, t.role_id, t.created_at, t.updated_at,
                  c.id AS col_id, c.name AS col_name, c.position AS col_position,
                  b.id AS brd_id, b.name AS brd_name
             FROM tasks t
             JOIN columns c ON c.id = t.column_id
             JOIN boards b ON b.id = c.board_id
            WHERE t.slug = ?`
        )
        .get(trimmed) as JoinedRow | undefined;
      if (row) {
        // Apply the same scope filters that compose with FTS so an exact
        // slug hit doesn't escape a board/column/role narrowing.
        const passesFilters =
          (!opts.board_id || row.brd_id === opts.board_id) &&
          (!opts.column_id || row.col_id === opts.column_id) &&
          (!opts.role_id || row.role_id === opts.role_id);
        if (passesFilters) {
          exactSlugHit = {
            ...rowToTaskWithLocation(row),
            match_type: "exact",
          };
        }
      }
    }
  }

  let sql: string;
  if (hasQuery) {
    sql = `
      SELECT t.id, t.board_id, t.column_id, t.slug, t.title, t.description,
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
      SELECT t.id, t.board_id, t.column_id, t.slug, t.title, t.description,
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

  // FTS5 convention: bm25() returns negative scores where smaller (more
  // negative) means a better match, and column weights work *inversely* —
  // a lower weight makes hits in that column score MORE negative, i.e.
  // rank higher. Empirically verified against this build: with weights
  // [0.5, 5.0] for [title, description], a title-only hit consistently
  // outranks a description-only hit and a both-columns hit beats either.
  // Verified by `tasks-search.unit.test.ts > ordering`.
  sql += hasQuery
    ? " ORDER BY bm25(tasks_fts, 0.5, 5.0) LIMIT ?"
    : " ORDER BY t.created_at DESC LIMIT ?";
  params.push(limit);

  const rows = db.prepare(sql).all(...(params as [unknown, ...unknown[]])) as JoinedRow[];
  const ftsResults: TaskWithLocation[] = rows.map((r) => ({
    ...rowToTaskWithLocation(r),
    match_type: hasQuery ? ("fts" as const) : undefined,
  }));

  if (exactSlugHit) {
    // Drop any FTS row pointing at the same task — the exact match wins.
    const filtered = ftsResults.filter(
      (r) => r.task.id !== exactSlugHit!.task.id
    );
    // Cap the combined output at `limit` — the exact match counts toward it.
    return [exactSlugHit, ...filtered].slice(0, limit);
  }
  return ftsResults;
}

/**
 * Lite get_task variant: task + column + board without the role/prompts/skills
 * bundle. For the heavy version use getTask + buildContextBundle.
 */
export function getTaskWithLocation(db: Database, id: string): TaskWithLocation | null {
  const row = db
    .prepare(
      `SELECT t.id, t.board_id, t.column_id, t.slug, t.title, t.description,
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
