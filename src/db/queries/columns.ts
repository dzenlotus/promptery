import type { Database } from "better-sqlite3";
import { nanoid } from "nanoid";

export interface Column {
  id: string;
  board_id: string;
  name: string;
  position: number;
  created_at: number;
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

export function createColumn(db: Database, boardId: string, name: string): Column {
  const nextPos = db
    .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM columns WHERE board_id = ?")
    .get(boardId) as { next: number };
  const id = nanoid();
  const now = Date.now();
  db.prepare(
    "INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, boardId, name, nextPos.next, now);
  return { id, board_id: boardId, name, position: nextPos.next, created_at: now };
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

export function deleteColumn(db: Database, id: string): boolean {
  const result = db.prepare("DELETE FROM columns WHERE id = ?").run(id);
  return result.changes > 0;
}
