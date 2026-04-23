import type { Database } from "better-sqlite3";
import { nanoid } from "nanoid";

export interface PromptGroup {
  id: string;
  name: string;
  color: string | null;
  position: number;
  created_at: number;
  updated_at: number;
  prompt_count: number;
}

export interface PromptInGroup {
  id: string;
  name: string;
  content: string;
  color: string | null;
  /** Position of this prompt within THIS group (not the prompt's own order). */
  position: number;
}

export interface PromptGroupWithPrompts extends PromptGroup {
  prompts: PromptInGroup[];
}

export interface CreatePromptGroupInput {
  name: string;
  color?: string | null;
  prompt_ids?: string[];
}

export interface UpdatePromptGroupInput {
  name?: string;
  color?: string | null;
  position?: number;
}

interface GroupRow {
  id: string;
  name: string;
  color: string | null;
  position: number;
  created_at: number;
  updated_at: number;
  prompt_count: number;
}

export function listPromptGroups(db: Database): PromptGroup[] {
  return db
    .prepare(
      `SELECT pg.*,
         (SELECT COUNT(*) FROM prompt_group_members WHERE group_id = pg.id) AS prompt_count
       FROM prompt_groups pg
       ORDER BY pg.position ASC, pg.name ASC`
    )
    .all() as GroupRow[];
}

export function getPromptGroup(db: Database, id: string): PromptGroupWithPrompts | null {
  const group = db
    .prepare(
      `SELECT pg.*,
         (SELECT COUNT(*) FROM prompt_group_members WHERE group_id = pg.id) AS prompt_count
       FROM prompt_groups pg
       WHERE pg.id = ?`
    )
    .get(id) as GroupRow | undefined;
  if (!group) return null;

  const prompts = db
    .prepare(
      `SELECT p.id, p.name, p.content, p.color, pgm.position
       FROM prompt_group_members pgm
       JOIN prompts p ON p.id = pgm.prompt_id
       WHERE pgm.group_id = ?
       ORDER BY pgm.position ASC, p.name ASC`
    )
    .all(id) as PromptInGroup[];

  return { ...group, prompts };
}

export function createPromptGroup(
  db: Database,
  input: CreatePromptGroupInput
): PromptGroupWithPrompts {
  const id = nanoid();
  const now = Date.now();

  const tx = db.transaction(() => {
    const posRow = db
      .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM prompt_groups")
      .get() as { next: number };

    db.prepare(
      `INSERT INTO prompt_groups (id, name, color, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, input.name, input.color ?? null, posRow.next, now, now);

    if (input.prompt_ids && input.prompt_ids.length > 0) {
      const insert = db.prepare(
        `INSERT INTO prompt_group_members (group_id, prompt_id, position, added_at)
         VALUES (?, ?, ?, ?)`
      );
      input.prompt_ids.forEach((pid, i) => insert.run(id, pid, i, now));
    }
  });
  tx();

  return getPromptGroup(db, id)!;
}

export function updatePromptGroup(
  db: Database,
  id: string,
  input: UpdatePromptGroupInput
): PromptGroupWithPrompts | null {
  const existing = getPromptGroup(db, id);
  if (!existing) return null;

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (input.name !== undefined) {
    sets.push("name = ?");
    vals.push(input.name);
  }
  if (input.color !== undefined) {
    sets.push("color = ?");
    vals.push(input.color);
  }
  if (input.position !== undefined) {
    sets.push("position = ?");
    vals.push(input.position);
  }
  sets.push("updated_at = ?");
  vals.push(Date.now());
  vals.push(id);

  db.prepare(`UPDATE prompt_groups SET ${sets.join(", ")} WHERE id = ?`).run(
    ...(vals as [unknown, ...unknown[]])
  );
  return getPromptGroup(db, id);
}

export function deletePromptGroup(db: Database, id: string): boolean {
  const result = db.prepare("DELETE FROM prompt_groups WHERE id = ?").run(id);
  return result.changes > 0;
}

/**
 * Replace the full prompt set of a group in a single transaction. Missing
 * prompt ids surface as FK errors; callers pre-validate for cleaner HTTP
 * responses. Updates the group's `updated_at` timestamp so consumers can
 * invalidate on a single field change.
 */
export function setGroupPrompts(
  db: Database,
  groupId: string,
  promptIds: string[]
): PromptGroupWithPrompts | null {
  const existing = getPromptGroup(db, groupId);
  if (!existing) return null;

  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM prompt_group_members WHERE group_id = ?").run(groupId);
    if (promptIds.length > 0) {
      const insert = db.prepare(
        `INSERT INTO prompt_group_members (group_id, prompt_id, position, added_at)
         VALUES (?, ?, ?, ?)`
      );
      promptIds.forEach((pid, i) => insert.run(groupId, pid, i, now));
    }
    db.prepare("UPDATE prompt_groups SET updated_at = ? WHERE id = ?").run(now, groupId);
  });
  tx();

  return getPromptGroup(db, groupId);
}

/**
 * Add a single prompt to a group (drag-and-drop path). Idempotent via
 * INSERT OR IGNORE — re-adding an already-present prompt is a no-op that
 * does not reshuffle positions.
 */
export function addPromptToGroup(
  db: Database,
  groupId: string,
  promptId: string
): { ok: true; added: boolean } {
  const now = Date.now();
  const maxPos = db
    .prepare(
      "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM prompt_group_members WHERE group_id = ?"
    )
    .get(groupId) as { next: number };

  const result = db
    .prepare(
      `INSERT OR IGNORE INTO prompt_group_members (group_id, prompt_id, position, added_at)
       VALUES (?, ?, ?, ?)`
    )
    .run(groupId, promptId, maxPos.next, now);

  if (result.changes > 0) {
    db.prepare("UPDATE prompt_groups SET updated_at = ? WHERE id = ?").run(now, groupId);
  }
  return { ok: true, added: result.changes > 0 };
}

export function removePromptFromGroup(
  db: Database,
  groupId: string,
  promptId: string
): { ok: true; removed: boolean } {
  const result = db
    .prepare("DELETE FROM prompt_group_members WHERE group_id = ? AND prompt_id = ?")
    .run(groupId, promptId);
  if (result.changes > 0) {
    db.prepare("UPDATE prompt_groups SET updated_at = ? WHERE id = ?").run(
      Date.now(),
      groupId
    );
  }
  return { ok: true, removed: result.changes > 0 };
}

/** Bulk reorder — writes new `position` values in a single transaction. */
export function reorderPromptGroups(db: Database, orderedIds: string[]): PromptGroup[] {
  const tx = db.transaction(() => {
    const now = Date.now();
    const stmt = db.prepare(
      "UPDATE prompt_groups SET position = ?, updated_at = ? WHERE id = ?"
    );
    orderedIds.forEach((id, i) => stmt.run(i, now, id));
  });
  tx();
  return listPromptGroups(db);
}

/**
 * Groups a given prompt belongs to. Used by UI to render "this prompt is
 * in these groups" chips inside the prompt editor.
 */
export function getGroupsForPrompt(db: Database, promptId: string): PromptGroup[] {
  return db
    .prepare(
      `SELECT pg.*,
         (SELECT COUNT(*) FROM prompt_group_members WHERE group_id = pg.id) AS prompt_count
       FROM prompt_group_members pgm
       JOIN prompt_groups pg ON pg.id = pgm.group_id
       WHERE pgm.prompt_id = ?
       ORDER BY pg.position ASC, pg.name ASC`
    )
    .all(promptId) as GroupRow[];
}
