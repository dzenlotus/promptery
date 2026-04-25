import type { Database } from "better-sqlite3";
import { nanoid } from "nanoid";
import {
  ConflictError,
  ConstraintError,
  NotFoundError,
  ValidationError,
} from "./errors.js";

export interface Space {
  id: string;
  name: string;
  prefix: string;
  description: string | null;
  is_default: boolean;
  position: number;
  created_at: number;
  updated_at: number;
}

interface SpaceRow {
  id: string;
  name: string;
  prefix: string;
  description: string | null;
  is_default: number;
  position: number;
  created_at: number;
  updated_at: number;
}

function rowToSpace(row: SpaceRow): Space {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    description: row.description,
    is_default: row.is_default === 1,
    position: row.position,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const PREFIX_PATTERN = /^[a-z0-9-]{1,10}$/;

export function isValidPrefix(prefix: string): boolean {
  return PREFIX_PATTERN.test(prefix);
}

export function listSpaces(db: Database): Space[] {
  const rows = db
    .prepare("SELECT * FROM spaces ORDER BY position ASC, created_at ASC")
    .all() as SpaceRow[];
  return rows.map(rowToSpace);
}

export function getSpace(db: Database, id: string): Space | null {
  const row = db.prepare("SELECT * FROM spaces WHERE id = ?").get(id) as
    | SpaceRow
    | undefined;
  return row ? rowToSpace(row) : null;
}

export function getSpaceByPrefix(db: Database, prefix: string): Space | null {
  const row = db.prepare("SELECT * FROM spaces WHERE prefix = ?").get(prefix) as
    | SpaceRow
    | undefined;
  return row ? rowToSpace(row) : null;
}

/** The single row carrying `is_default = 1`. Migration 009 guarantees one. */
export function getDefaultSpace(db: Database): Space {
  const row = db
    .prepare("SELECT * FROM spaces WHERE is_default = 1")
    .get() as SpaceRow | undefined;
  if (!row) {
    throw new Error(
      "default space missing — migration 009 should have created it"
    );
  }
  return rowToSpace(row);
}

export interface CreateSpaceInput {
  name: string;
  prefix: string;
  description?: string;
}

export function createSpace(db: Database, input: CreateSpaceInput): Space {
  if (!isValidPrefix(input.prefix)) {
    throw new ValidationError(
      "InvalidPrefix",
      `prefix must match /^[a-z0-9-]{1,10}$/, got "${input.prefix}"`
    );
  }
  const existing = getSpaceByPrefix(db, input.prefix);
  if (existing) {
    throw new ConflictError(
      "PrefixCollision",
      `prefix "${input.prefix}" is already used by space "${existing.name}"`
    );
  }

  const now = Date.now();
  const id = nanoid();
  const positionRow = db
    .prepare("SELECT COALESCE(MAX(position), 0) + 1 AS next FROM spaces")
    .get() as { next: number };

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO spaces (id, name, prefix, description, is_default, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`
    ).run(
      id,
      input.name,
      input.prefix,
      input.description ?? null,
      positionRow.next,
      now,
      now
    );
    db.prepare(
      "INSERT INTO space_counters (space_id, next_number) VALUES (?, 1)"
    ).run(id);
  });
  tx();

  const created = getSpace(db, id);
  if (!created) {
    throw new Error("createSpace: row vanished immediately after insert");
  }
  return created;
}

export interface UpdateSpaceInput {
  name?: string;
  prefix?: string;
  description?: string | null;
}

/**
 * Renames or re-prefixes a space. **Renaming the prefix does NOT re-slug
 * existing tasks** — slugs are minted at task creation and only change on
 * `moveBoardToSpace`. The new prefix governs only future task creations.
 */
export function updateSpace(
  db: Database,
  id: string,
  input: UpdateSpaceInput
): Space | null {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (input.name !== undefined) {
    sets.push("name = ?");
    vals.push(input.name);
  }
  if (input.prefix !== undefined) {
    if (!isValidPrefix(input.prefix)) {
      throw new ValidationError(
        "InvalidPrefix",
        `prefix must match /^[a-z0-9-]{1,10}$/, got "${input.prefix}"`
      );
    }
    const collision = getSpaceByPrefix(db, input.prefix);
    if (collision && collision.id !== id) {
      throw new ConflictError(
        "PrefixCollision",
        `prefix "${input.prefix}" is already used by space "${collision.name}"`
      );
    }
    sets.push("prefix = ?");
    vals.push(input.prefix);
  }
  if (input.description !== undefined) {
    sets.push("description = ?");
    vals.push(input.description);
  }
  if (sets.length === 0) return getSpace(db, id);
  sets.push("updated_at = ?");
  vals.push(Date.now());
  vals.push(id);

  const result = db
    .prepare(`UPDATE spaces SET ${sets.join(", ")} WHERE id = ?`)
    .run(...(vals as [unknown, ...unknown[]]));
  if (result.changes === 0) return null;
  return getSpace(db, id);
}

/**
 * Delete a space. The default space cannot be deleted (system-managed).
 * Spaces with boards are refused — the user must move those boards to a
 * different space first; see `moveBoardToSpace`.
 */
export function deleteSpace(db: Database, id: string): boolean {
  const space = getSpace(db, id);
  if (!space) return false;
  if (space.is_default) {
    throw new ConstraintError(
      "DefaultSpaceImmutable",
      "the default space cannot be deleted"
    );
  }
  const boardCount = db
    .prepare("SELECT COUNT(*) AS c FROM boards WHERE space_id = ?")
    .get(id) as { c: number };
  if (boardCount.c > 0) {
    throw new ConstraintError(
      "SpaceHasBoards",
      `space has ${boardCount.c} board(s); move them to another space first`
    );
  }
  const result = db.prepare("DELETE FROM spaces WHERE id = ?").run(id);
  return result.changes > 0;
}

/**
 * Bulk reorder spaces — writes new `position` values in a single transaction.
 * The default space is included in the ordering so the user can place it
 * anywhere relative to custom spaces; `is_default` is a separate concern
 * from sidebar order. Position is renumbered 0..N (default space gets 0
 * if listed first, otherwise its actual ordinal) — re-numbering rather
 * than subdividing keeps the column from drifting toward float exhaustion.
 */
export function reorderSpaces(db: Database, orderedIds: string[]): Space[] {
  const tx = db.transaction(() => {
    const now = Date.now();
    const stmt = db.prepare(
      "UPDATE spaces SET position = ?, updated_at = ? WHERE id = ?"
    );
    orderedIds.forEach((id, i) => stmt.run(i, now, id));
  });
  tx();
  return listSpaces(db);
}

/**
 * Move a board to a different space and re-slug every task on it.
 *
 * Re-slugging is a deliberate consequence of moving a board: a task's slug
 * should reflect its current home. The destination space's counter advances
 * by the number of tasks moved; the internal `tasks.id` (CUID) does NOT
 * change, so any reference held by id is stable across the move.
 *
 * Returns the count of re-slugged tasks. Throws NotFoundError if either
 * the board or the space does not exist.
 */
export interface MoveBoardToSpaceResult {
  board_id: string;
  space_id: string;
  reslugged_count: number;
}

export interface MoveBoardToSpaceOptions {
  /**
   * Optional explicit position in the destination space. When omitted, the
   * board is appended to the end. Used by drag-and-drop to drop a board
   * between two existing rows; the caller computes the value via
   * `(prev + next) / 2` from the destination space's current ordering.
   */
  position?: number;
}

export function moveBoardToSpace(
  db: Database,
  boardId: string,
  destinationSpaceId: string,
  opts: MoveBoardToSpaceOptions = {}
): MoveBoardToSpaceResult {
  const space = getSpace(db, destinationSpaceId);
  if (!space) {
    throw new NotFoundError("space", destinationSpaceId);
  }
  const boardRow = db
    .prepare("SELECT id, space_id FROM boards WHERE id = ?")
    .get(boardId) as { id: string; space_id: string } | undefined;
  if (!boardRow) {
    throw new NotFoundError("board", boardId);
  }

  let resluggedCount = 0;
  const tx = db.transaction(() => {
    // Re-point the board first so any subsequent space-by-board lookup
    // sees the new home (no callers do this mid-transaction today, but
    // it keeps the invariant clean). When the caller passed an explicit
    // `position`, write that too — drag-and-drop uses this to drop a
    // board between two existing rows. With no `position`, append to the
    // end (max + 1) of the destination space.
    const targetPosition =
      opts.position !== undefined
        ? opts.position
        : ((
            db
              .prepare(
                "SELECT COALESCE(MAX(position), 0) + 1 AS next FROM boards WHERE space_id = ? AND id != ?"
              )
              .get(destinationSpaceId, boardId) as { next: number }
          ).next);
    db.prepare(
      "UPDATE boards SET space_id = ?, position = ? WHERE id = ?"
    ).run(destinationSpaceId, targetPosition, boardId);

    type TaskRow = { id: string; created_at: number };
    const tasks = db
      .prepare(
        "SELECT id, created_at FROM tasks WHERE board_id = ? ORDER BY created_at ASC, id ASC"
      )
      .all(boardId) as TaskRow[];

    if (tasks.length === 0) return;

    const counterRow = db
      .prepare("SELECT next_number FROM space_counters WHERE space_id = ?")
      .get(destinationSpaceId) as { next_number: number } | undefined;
    let next = counterRow?.next_number ?? 1;

    const updateSlug = db.prepare(
      "UPDATE tasks SET slug = ?, updated_at = ? WHERE id = ?"
    );
    const now = Date.now();
    for (const t of tasks) {
      const slug = `${space.prefix}-${next}`;
      next += 1;
      updateSlug.run(slug, now, t.id);
    }

    db.prepare(
      "UPDATE space_counters SET next_number = ? WHERE space_id = ?"
    ).run(next, destinationSpaceId);
    resluggedCount = tasks.length;
  });
  tx();

  return {
    board_id: boardId,
    space_id: destinationSpaceId,
    reslugged_count: resluggedCount,
  };
}
