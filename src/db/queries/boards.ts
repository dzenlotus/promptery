import type { Database } from "better-sqlite3";
import { nanoid } from "nanoid";
import type { Prompt } from "./prompts.js";
import type { Role } from "./roles.js";
import { listBoardPrompts } from "./boardPrompts.js";
import { getDefaultSpace } from "./spaces.js";

export const DEFAULT_COLUMN_NAMES = ["todo", "in-progress", "qa", "done"] as const;

export interface Board {
  id: string;
  name: string;
  space_id: string;
  role_id: string | null;
  /**
   * Per-space ordinal that drives the sidebar order. Set when the board is
   * created (next available within the space) and updated when the user
   * drags a board between or within spaces. REAL so we can insert between
   * two adjacent rows with `(a + b) / 2` without renumbering.
   */
  position: number;
  created_at: number;
  updated_at: number;
}

export interface CreateBoardOptions {
  /** When omitted, the board lands in the default space. */
  space_id?: string;
}

export interface BoardWithRelations extends Board {
  /** Full role row when `role_id` is set, otherwise null. */
  role: Role | null;
  /** Prompts attached directly to the board (not the board-role's prompts). */
  prompts: Prompt[];
}

export function listBoards(db: Database): Board[] {
  return db
    .prepare(
      "SELECT * FROM boards ORDER BY space_id ASC, position ASC, created_at ASC"
    )
    .all() as Board[];
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

export function createBoard(
  db: Database,
  name: string,
  opts: CreateBoardOptions = {}
): Board {
  const now = Date.now();
  const id = nanoid();
  const spaceId = opts.space_id ?? getDefaultSpace(db).id;

  const insertBoard = db.prepare(
    `INSERT INTO boards (id, name, space_id, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertColumn = db.prepare(
    "INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)"
  );

  // Append-to-end within the destination space. REAL `position` so future
  // reorders can subdivide via `(prev + next) / 2`.
  const positionRow = db
    .prepare(
      "SELECT COALESCE(MAX(position), 0) + 1 AS next FROM boards WHERE space_id = ?"
    )
    .get(spaceId) as { next: number };

  const tx = db.transaction(() => {
    insertBoard.run(id, name, spaceId, positionRow.next, now, now);
    DEFAULT_COLUMN_NAMES.forEach((colName, idx) => {
      insertColumn.run(nanoid(), id, colName, idx, now);
    });
  });
  tx();

  return {
    id,
    name,
    space_id: spaceId,
    role_id: null,
    position: positionRow.next,
    created_at: now,
    updated_at: now,
  };
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

/**
 * Bulk reorder boards within a single space — writes new `position` values
 * in a single transaction. The caller passes the IDs in their desired
 * order; positions are renumbered 1..N. Boards from other spaces in the
 * list are silently ignored (their position is whatever the caller had).
 *
 * Re-numbering rather than `(a + b) / 2`-style subdivision keeps the
 * column from drifting toward floating-point exhaustion after many drags.
 * The trade-off — every reorder rewrites every position in the space — is
 * cheap at the scale this app operates at (tens of boards per space).
 */
export function reorderBoards(
  db: Database,
  spaceId: string,
  orderedIds: string[]
): Board[] {
  const tx = db.transaction(() => {
    const now = Date.now();
    const stmt = db.prepare(
      "UPDATE boards SET position = ?, updated_at = ? WHERE id = ? AND space_id = ?"
    );
    orderedIds.forEach((id, i) => stmt.run(i + 1, now, id, spaceId));
  });
  tx();
  return db
    .prepare(
      "SELECT * FROM boards WHERE space_id = ? ORDER BY position ASC, created_at ASC"
    )
    .all(spaceId) as Board[];
}
