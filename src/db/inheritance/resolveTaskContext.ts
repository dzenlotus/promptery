import type { Database } from "better-sqlite3";
import {
  ORIGIN_SPECIFICITY,
  type PromptOrigin,
  type ResolvedPrompt,
  type ResolvedPromptSource,
  type ResolvedRole,
  type ResolvedTaskContext,
} from "./types.js";

interface TaskJoinRow {
  id: string;
  board_id: string;
  column_id: string;
  role_id: string | null;
  column_role_id: string | null;
  column_name: string;
  board_role_id: string | null;
  board_name: string;
}

interface RoleRow {
  id: string;
  name: string;
  content: string;
  color: string | null;
}

interface PromptRow {
  id: string;
  name: string;
  content: string;
  color: string | null;
  short_description: string | null;
}

/**
 * Resolve the full effective context for a task.
 *
 * Two concerns live here:
 *  1. **Active role** — task.role > column.role > board.role. First set wins.
 *  2. **Prompt union** — collect from all six layers, deduplicate by
 *     prompt_id keeping the most-specific origin (see ORIGIN_SPECIFICITY).
 *
 * Role prompts are NOT duplicated across layers: if the same role is
 * assigned at two levels (e.g. task.role === column.role), we pull its
 * prompts once, tagged with the more specific origin.
 *
 * Returns null if no task matches the id.
 */
export function resolveTaskContext(
  db: Database,
  taskId: string
): ResolvedTaskContext | null {
  const task = db
    .prepare(
      `SELECT
         t.id, t.board_id, t.column_id, t.role_id,
         c.role_id AS column_role_id, c.name AS column_name,
         b.role_id AS board_role_id, b.name AS board_name
       FROM tasks t
       JOIN columns c ON c.id = t.column_id
       JOIN boards b ON b.id = t.board_id
       WHERE t.id = ?`
    )
    .get(taskId) as TaskJoinRow | undefined;

  if (!task) return null;

  const role = resolveActiveRole(db, task);
  const prompts = resolvePrompts(db, task, role);

  return { task_id: taskId, role, prompts };
}

function resolveActiveRole(db: Database, task: TaskJoinRow): ResolvedRole | null {
  const fetchRole = (id: string, source: "task" | "column" | "board"): ResolvedRole | null => {
    const row = db
      .prepare("SELECT id, name, content, color FROM roles WHERE id = ?")
      .get(id) as RoleRow | undefined;
    return row ? { ...row, source } : null;
  };

  if (task.role_id) return fetchRole(task.role_id, "task");
  if (task.column_role_id) return fetchRole(task.column_role_id, "column");
  if (task.board_role_id) return fetchRole(task.board_role_id, "board");
  return null;
}

function resolvePrompts(
  db: Database,
  task: TaskJoinRow,
  activeRole: ResolvedRole | null
): ResolvedPrompt[] {
  const collected: ResolvedPrompt[] = [];

  // 1. Direct on the task.
  const directPrompts = db
    .prepare(
      `SELECT p.id, p.name, p.content, p.color, p.short_description
       FROM task_prompts tp
       JOIN prompts p ON p.id = tp.prompt_id
       WHERE tp.task_id = ? AND tp.origin = 'direct'
       ORDER BY tp.position ASC, p.name ASC`
    )
    .all(task.id) as PromptRow[];
  for (const p of directPrompts) collected.push({ ...p, origin: "direct" });

  // 2. Active role's prompts (whichever layer it came from — source tells us).
  if (activeRole) {
    const rolePrompts = selectRolePrompts(db, activeRole.id);
    // If the active role came from the task, origin is "role". If it came
    // from a column or board, origin is still "role" (it's the effective
    // role), but source.type records which layer carries it so UI can show
    // e.g. "from column role".
    const sourceType: ResolvedPromptSource["type"] =
      activeRole.source === "task"
        ? "role"
        : activeRole.source === "column"
          ? "column-role"
          : "board-role";
    const origin: PromptOrigin = activeRole.source === "task" ? "role" : sourceType;
    for (const p of rolePrompts) {
      collected.push({
        ...p,
        origin,
        source: { type: sourceType, id: activeRole.id, name: activeRole.name },
      });
    }
  }

  // 3. Direct prompts on the column.
  const columnPrompts = db
    .prepare(
      `SELECT p.id, p.name, p.content, p.color, p.short_description
       FROM column_prompts cp
       JOIN prompts p ON p.id = cp.prompt_id
       WHERE cp.column_id = ?
       ORDER BY cp.position ASC, p.name ASC`
    )
    .all(task.column_id) as PromptRow[];
  for (const p of columnPrompts) {
    collected.push({
      ...p,
      origin: "column",
      source: { type: "column", id: task.column_id, name: task.column_name },
    });
  }

  // 4. Column's role prompts — only when it differs from the already-active role.
  if (
    task.column_role_id &&
    task.column_role_id !== activeRole?.id &&
    task.column_role_id !== task.role_id
  ) {
    const colRole = fetchRoleRow(db, task.column_role_id);
    if (colRole) {
      for (const p of selectRolePrompts(db, task.column_role_id)) {
        collected.push({
          ...p,
          origin: "column-role",
          source: { type: "column-role", id: colRole.id, name: colRole.name },
        });
      }
    }
  }

  // 5. Direct prompts on the board.
  const boardPrompts = db
    .prepare(
      `SELECT p.id, p.name, p.content, p.color, p.short_description
       FROM board_prompts bp
       JOIN prompts p ON p.id = bp.prompt_id
       WHERE bp.board_id = ?
       ORDER BY bp.position ASC, p.name ASC`
    )
    .all(task.board_id) as PromptRow[];
  for (const p of boardPrompts) {
    collected.push({
      ...p,
      origin: "board",
      source: { type: "board", id: task.board_id, name: task.board_name },
    });
  }

  // 6. Board's role prompts — only when it differs from both active role
  // and column role (otherwise we'd duplicate).
  if (
    task.board_role_id &&
    task.board_role_id !== activeRole?.id &&
    task.board_role_id !== task.column_role_id &&
    task.board_role_id !== task.role_id
  ) {
    const boardRole = fetchRoleRow(db, task.board_role_id);
    if (boardRole) {
      for (const p of selectRolePrompts(db, task.board_role_id)) {
        collected.push({
          ...p,
          origin: "board-role",
          source: { type: "board-role", id: boardRole.id, name: boardRole.name },
        });
      }
    }
  }

  // Dedup: keep the most-specific origin per prompt id.
  const byId = new Map<string, ResolvedPrompt>();
  for (const p of collected) {
    const existing = byId.get(p.id);
    if (!existing || ORIGIN_SPECIFICITY[p.origin] > ORIGIN_SPECIFICITY[existing.origin]) {
      byId.set(p.id, p);
    }
  }

  return Array.from(byId.values()).sort((a, b) => {
    const specDiff = ORIGIN_SPECIFICITY[b.origin] - ORIGIN_SPECIFICITY[a.origin];
    if (specDiff !== 0) return specDiff;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

function fetchRoleRow(db: Database, id: string): RoleRow | null {
  const row = db
    .prepare("SELECT id, name, content, color FROM roles WHERE id = ?")
    .get(id) as RoleRow | undefined;
  return row ?? null;
}

function selectRolePrompts(db: Database, roleId: string): PromptRow[] {
  return db
    .prepare(
      `SELECT p.id, p.name, p.content, p.color, p.short_description
       FROM role_prompts rp
       JOIN prompts p ON p.id = rp.prompt_id
       WHERE rp.role_id = ?
       ORDER BY rp.position ASC, p.name ASC`
    )
    .all(roleId) as PromptRow[];
}
