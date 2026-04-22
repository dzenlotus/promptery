import type { Database } from "better-sqlite3";
import { nanoid } from "nanoid";

export const DEFAULT_COLUMN_NAMES = ["todo", "in-progress", "qa", "done"] as const;

export interface Board {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
}

export function listBoards(db: Database): Board[] {
  return db.prepare("SELECT * FROM boards ORDER BY created_at ASC").all() as Board[];
}

export function getBoard(db: Database, id: string): Board | null {
  const row = db.prepare("SELECT * FROM boards WHERE id = ?").get(id) as Board | undefined;
  return row ?? null;
}

export function createBoard(db: Database, name: string): Board {
  const now = Date.now();
  const id = nanoid();

  const insertBoard = db.prepare(
    "INSERT INTO boards (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)"
  );
  const insertColumn = db.prepare(
    "INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)"
  );

  const tx = db.transaction(() => {
    insertBoard.run(id, name, now, now);
    DEFAULT_COLUMN_NAMES.forEach((colName, idx) => {
      insertColumn.run(nanoid(), id, colName, idx, now);
    });
  });
  tx();

  return { id, name, created_at: now, updated_at: now };
}

export function updateBoard(db: Database, id: string, name: string): Board | null {
  const now = Date.now();
  const result = db
    .prepare("UPDATE boards SET name = ?, updated_at = ? WHERE id = ?")
    .run(name, now, id);
  if (result.changes === 0) return null;
  return getBoard(db, id);
}

export function deleteBoard(db: Database, id: string): boolean {
  const result = db.prepare("DELETE FROM boards WHERE id = ?").run(id);
  return result.changes > 0;
}
