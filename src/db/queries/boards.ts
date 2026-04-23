import type { Database } from "better-sqlite3";
import { nanoid } from "nanoid";
import type { Prompt } from "./prompts.js";
import type { Role } from "./roles.js";
import { listBoardPrompts } from "./boardPrompts.js";

export const DEFAULT_COLUMN_NAMES = ["todo", "in-progress", "qa", "done"] as const;

export interface Board {
  id: string;
  name: string;
  role_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface BoardWithRelations extends Board {
  /** Full role row when `role_id` is set, otherwise null. */
  role: Role | null;
  /** Prompts attached directly to the board (not the board-role's prompts). */
  prompts: Prompt[];
}

export function listBoards(db: Database): Board[] {
  return db.prepare("SELECT * FROM boards ORDER BY created_at ASC").all() as Board[];
}

export function getBoard(db: Database, id: string): Board | null {
  const row = db.prepare("SELECT * FROM boards WHERE id = ?").get(id) as Board | undefined;
  return row ?? null;
}

/**
 * Board + role + direct prompts in one call. Used by routes that return a
 * board detail view; the plain `getBoard` stays for legacy callers and the
 * listing endpoint where the extra round-trip cost isn't worth the payload.
 */
export function getBoardWithRelations(
  db: Database,
  id: string
): BoardWithRelations | null {
  const board = getBoard(db, id);
  if (!board) return null;
  const role = board.role_id
    ? ((db.prepare("SELECT * FROM roles WHERE id = ?").get(board.role_id) as Role | undefined) ??
      null)
    : null;
  return { ...board, role, prompts: listBoardPrompts(db, id) };
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

  return { id, name, role_id: null, created_at: now, updated_at: now };
}

export function updateBoard(db: Database, id: string, name: string): Board | null {
  const now = Date.now();
  const result = db
    .prepare("UPDATE boards SET name = ?, updated_at = ? WHERE id = ?")
    .run(name, now, id);
  if (result.changes === 0) return null;
  return getBoard(db, id);
}

/** Assign or clear the board-level role. Returns the updated board. */
export function setBoardRole(
  db: Database,
  id: string,
  roleId: string | null
): Board | null {
  const now = Date.now();
  const result = db
    .prepare("UPDATE boards SET role_id = ?, updated_at = ? WHERE id = ?")
    .run(roleId, now, id);
  if (result.changes === 0) return null;
  return getBoard(db, id);
}

export function deleteBoard(db: Database, id: string): boolean {
  const result = db.prepare("DELETE FROM boards WHERE id = ?").run(id);
  return result.changes > 0;
}
