import type { Database } from "better-sqlite3";
import { nanoid } from "nanoid";
import { ConflictError } from "./errors.js";

/**
 * Tags are a flat, globally-unique label layer for prompts. Many-to-many:
 * a prompt has zero or more tags, a tag applies to zero or more prompts.
 *
 * Mirror of `promptGroups.ts` minus the `position` ordering column —
 * tags are an unordered set, sorted by name on read. Tags do not
 * participate in inheritance and only attach to prompts.
 */
export interface Tag {
  id: string;
  name: string;
  color: string | null;
  created_at: number;
  updated_at: number;
  prompt_count: number;
}

export interface PromptInTag {
  id: string;
  name: string;
  color: string | null;
}

export interface TagWithPrompts extends Tag {
  prompts: PromptInTag[];
}

export interface CreateTagInput {
  name: string;
  color?: string | null;
  prompt_ids?: string[];
}

export interface UpdateTagInput {
  name?: string;
  color?: string | null;
}

interface TagRow {
  id: string;
  name: string;
  color: string | null;
  created_at: number;
  updated_at: number;
  prompt_count: number;
}

const LIST_TAGS_SQL = `
  SELECT t.*,
    (SELECT COUNT(*) FROM prompt_tags WHERE tag_id = t.id) AS prompt_count
  FROM tags t
`;

function rowToTag(r: TagRow): Tag {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    created_at: r.created_at,
    updated_at: r.updated_at,
    prompt_count: r.prompt_count,
  };
}

export function listTags(db: Database): Tag[] {
  const rows = db
    .prepare(`${LIST_TAGS_SQL} ORDER BY t.name COLLATE NOCASE ASC`)
    .all() as TagRow[];
  return rows.map(rowToTag);
}

export function getTag(db: Database, id: string): TagWithPrompts | null {
  const row = db.prepare(`${LIST_TAGS_SQL} WHERE t.id = ?`).get(id) as
    | TagRow
    | undefined;
  if (!row) return null;

  const prompts = db
    .prepare(
      `SELECT p.id, p.name, p.color
       FROM prompt_tags pt
       JOIN prompts p ON p.id = pt.prompt_id
       WHERE pt.tag_id = ?
       ORDER BY p.name COLLATE NOCASE ASC`
    )
    .all(id) as PromptInTag[];

  return { ...rowToTag(row), prompts };
}

export function getTagByName(db: Database, name: string): Tag | null {
  const row = db
    .prepare(
      `${LIST_TAGS_SQL} WHERE t.name = ? COLLATE NOCASE`
    )
    .get(name) as TagRow | undefined;
  return row ? rowToTag(row) : null;
}

export function createTag(db: Database, input: CreateTagInput): TagWithPrompts {
  const trimmedName = input.name.trim();
  if (getTagByName(db, trimmedName)) {
    throw new ConflictError(`Tag name "${trimmedName}" is already taken`, {
      field: "name",
    });
  }
  const id = nanoid();
  const now = Date.now();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO tags (id, name, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, trimmedName, input.color ?? null, now, now);

    if (input.prompt_ids && input.prompt_ids.length > 0) {
      const insert = db.prepare(
        `INSERT INTO prompt_tags (prompt_id, tag_id, added_at)
         VALUES (?, ?, ?)`
      );
      for (const pid of input.prompt_ids) insert.run(pid, id, now);
    }
  });
  tx();

  return getTag(db, id)!;
}

export function updateTag(
  db: Database,
  id: string,
  input: UpdateTagInput
): TagWithPrompts | null {
  const existing = getTag(db, id);
  if (!existing) return null;

  // Name uniqueness check is case-insensitive to match getTagByName so a
  // patch of "Foo" -> "FOO" is treated as a no-op rename, not a conflict
  // against itself.
  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    const clash = getTagByName(db, trimmed);
    if (clash && clash.id !== id) {
      throw new ConflictError(`Tag name "${trimmed}" is already taken`, {
        field: "name",
      });
    }
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (input.name !== undefined) {
    sets.push("name = ?");
    vals.push(input.name.trim());
  }
  if (input.color !== undefined) {
    sets.push("color = ?");
    vals.push(input.color);
  }
  sets.push("updated_at = ?");
  vals.push(Date.now());
  vals.push(id);

  db.prepare(`UPDATE tags SET ${sets.join(", ")} WHERE id = ?`).run(
    ...(vals as [unknown, ...unknown[]])
  );
  return getTag(db, id);
}

export function deleteTag(db: Database, id: string): boolean {
  const result = db.prepare("DELETE FROM tags WHERE id = ?").run(id);
  return result.changes > 0;
}

/**
 * Replace the full prompt set of a tag in a single transaction. Missing
 * prompt ids surface as FK errors; callers pre-validate for cleaner HTTP
 * responses. Updates the tag's `updated_at` timestamp so consumers can
 * invalidate on a single field change.
 */
export function setTagPrompts(
  db: Database,
  tagId: string,
  promptIds: string[]
): TagWithPrompts | null {
  const existing = getTag(db, tagId);
  if (!existing) return null;

  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM prompt_tags WHERE tag_id = ?").run(tagId);
    if (promptIds.length > 0) {
      const insert = db.prepare(
        `INSERT INTO prompt_tags (prompt_id, tag_id, added_at)
         VALUES (?, ?, ?)`
      );
      for (const pid of promptIds) insert.run(pid, tagId, now);
    }
    db.prepare("UPDATE tags SET updated_at = ? WHERE id = ?").run(now, tagId);
  });
  tx();

  return getTag(db, tagId);
}

/**
 * Add a single prompt to a tag. Idempotent via INSERT OR IGNORE — re-adding
 * an already-tagged prompt is a no-op that does not bump `added_at`.
 */
export function addPromptToTag(
  db: Database,
  tagId: string,
  promptId: string
): { ok: true; added: boolean } {
  const now = Date.now();
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO prompt_tags (prompt_id, tag_id, added_at)
       VALUES (?, ?, ?)`
    )
    .run(promptId, tagId, now);

  if (result.changes > 0) {
    db.prepare("UPDATE tags SET updated_at = ? WHERE id = ?").run(now, tagId);
  }
  return { ok: true, added: result.changes > 0 };
}

export function removePromptFromTag(
  db: Database,
  tagId: string,
  promptId: string
): { ok: true; removed: boolean } {
  const result = db
    .prepare("DELETE FROM prompt_tags WHERE tag_id = ? AND prompt_id = ?")
    .run(tagId, promptId);
  if (result.changes > 0) {
    db.prepare("UPDATE tags SET updated_at = ? WHERE id = ?").run(
      Date.now(),
      tagId
    );
  }
  return { ok: true, removed: result.changes > 0 };
}

/**
 * Tags applied to a given prompt. Used by UI to render tag chips on the
 * prompt row and inside the prompt editor.
 */
export function getPromptTags(db: Database, promptId: string): Tag[] {
  const rows = db
    .prepare(
      `SELECT t.*,
         (SELECT COUNT(*) FROM prompt_tags WHERE tag_id = t.id) AS prompt_count
       FROM prompt_tags pt
       JOIN tags t ON t.id = pt.tag_id
       WHERE pt.prompt_id = ?
       ORDER BY t.name COLLATE NOCASE ASC`
    )
    .all(promptId) as TagRow[];
  return rows.map(rowToTag);
}

export interface PromptWithTags {
  prompt_id: string;
  tags: Tag[];
}

/**
 * One-shot fetch of every prompt's tag set. The single query returns one
 * row per (prompt, tag) pair; we group in JS so the UI can render tag chips
 * on every row of the prompts sidebar without N+1 fetches.
 */
export function listPromptsWithTags(db: Database): PromptWithTags[] {
  type Row = {
    prompt_id: string;
    tag_id: string | null;
    tag_name: string | null;
    tag_color: string | null;
    tag_created_at: number | null;
    tag_updated_at: number | null;
    tag_prompt_count: number | null;
  };
  const rows = db
    .prepare(
      `SELECT
         p.id AS prompt_id,
         t.id AS tag_id,
         t.name AS tag_name,
         t.color AS tag_color,
         t.created_at AS tag_created_at,
         t.updated_at AS tag_updated_at,
         (SELECT COUNT(*) FROM prompt_tags WHERE tag_id = t.id) AS tag_prompt_count
       FROM prompts p
       LEFT JOIN prompt_tags pt ON pt.prompt_id = p.id
       LEFT JOIN tags t ON t.id = pt.tag_id
       ORDER BY p.name COLLATE NOCASE ASC, t.name COLLATE NOCASE ASC`
    )
    .all() as Row[];

  const byPrompt = new Map<string, Tag[]>();
  for (const r of rows) {
    if (!byPrompt.has(r.prompt_id)) byPrompt.set(r.prompt_id, []);
    if (r.tag_id && r.tag_name && r.tag_created_at !== null && r.tag_updated_at !== null) {
      byPrompt.get(r.prompt_id)!.push({
        id: r.tag_id,
        name: r.tag_name,
        color: r.tag_color,
        created_at: r.tag_created_at,
        updated_at: r.tag_updated_at,
        prompt_count: r.tag_prompt_count ?? 0,
      });
    }
  }

  return Array.from(byPrompt.entries()).map(([prompt_id, tags]) => ({
    prompt_id,
    tags,
  }));
}
