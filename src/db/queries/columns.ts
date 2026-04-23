import type { Database } from "better-sqlite3";
import { nanoid } from "nanoid";
import type { Prompt } from "./prompts.js";
import type { Role } from "./roles.js";
import { listColumnPrompts } from "./columnPrompts.js";
import { ColumnNotEmptyError } from "./errors.js";

export interface Column {
  id: string;
  board_id: string;
  name: string;
  position: number;
  role_id: string | null;
  created_at: number;
}

export interface ColumnWithRelations extends Column {
  role: Role | null;
  prompts: Prompt[];
}

export interface UpdateColumnInput {
  name?: string;
  position?: number;
}

export function listColumns(db: Database, boardId: string): Column[] {
  return db
    .prepare("SELECT * FROM columns WHERE board_id = ? ORDER BY position ASC")
    .all(boardId) as Column[];
}

export function getColumn(db: Database, id: string): Column | null {
  const row = db.prepare("SELECT * FROM columns WHERE id = ?").get(id) as Column | undefined;
  return row ?? null;
}

/**
 * Column + role + direct prompts. Parallels getBoardWithRelations; cheaper
 * than it looks because the role join is a single row lookup by id.
 */
export function getColumnWithRelations(
  db: Database,
  id: string
): ColumnWithRelations | null {
  const column = getColumn(db, id);
  if (!column) return null;
  const role = column.role_id
    ? ((db.prepare("SELECT * FROM roles WHERE id = ?").get(column.role_id) as Role | undefined) ??
      null)
    : null;
  return { ...column, role, prompts: listColumnPrompts(db, id) };
}

export function createColumn(db: Database, boardId: string, name: string): Column {
  const nextPos = db
    .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM columns WHERE board_id = ?")
    .get(boardId) as { next: number };
  const id = nanoid();
  const now = Date.now();
  db.prepare(
    "INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, boardId, name, nextPos.next, now);
  return {
    id,
    board_id: boardId,
    name,
    position: nextPos.next,
    role_id: null,
    created_at: now,
  };
}

export function updateColumn(
  db: Database,
  id: string,
  input: UpdateColumnInput
): Column | null {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (input.name !== undefined) {
    sets.push("name = ?");
    vals.push(input.name);
  }
  if (input.position !== undefined) {
    sets.push("position = ?");
    vals.push(input.position);
  }
  if (sets.length === 0) return getColumn(db, id);
  vals.push(id);
  const result = db
    .prepare(`UPDATE columns SET ${sets.join(", ")} WHERE id = ?`)
    .run(...(vals as [unknown, ...unknown[]]));
  if (result.changes === 0) return null;
  return getColumn(db, id);
}

/**
 * Assign or clear the column-level role. Unlike tasks.setTaskRole this does
 * NOT copy role primitives into a shadow table — column roles are resolved
 * on read (see resolveTaskContext), so a role switch is a single row write.
 */
export function setColumnRole(
  db: Database,
  id: string,
  roleId: string | null
): Column | null {
  const result = db
    .prepare("UPDATE columns SET role_id = ? WHERE id = ?")
    .run(roleId, id);
  if (result.changes === 0) return null;
  return getColumn(db, id);
}

export function deleteColumn(db: Database, id: string): boolean {
  // Refuse to delete a column that still owns tasks. The schema has no
  // FK cascade for tasks→columns, so a silent delete would orphan the rows
  // (and confuse the agent that created them). Force callers to empty the
  // column first so the destructive action is always explicit.
  const row = db
    .prepare("SELECT COUNT(*) AS cnt FROM tasks WHERE column_id = ?")
    .get(id) as { cnt: number };
  if (row.cnt > 0) {
    throw new ColumnNotEmptyError(
      `Cannot delete column: it contains ${row.cnt} task(s). Move or delete them first.`,
      row.cnt
    );
  }
  const result = db.prepare("DELETE FROM columns WHERE id = ?").run(id);
  return result.changes > 0;
}
