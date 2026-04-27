import type { Database } from "better-sqlite3";
import { nanoid } from "nanoid";
import { ConflictError } from "./errors.js";
import { countTokens } from "../../lib/tokenCount.js";

export interface Prompt {
  id: string;
  name: string;
  content: string;
  color: string;
  short_description: string | null;
  /** Cached cl100k_base token count for `content`. Re-computed on every
   *  create/update so the hot read path never touches the tokenizer. */
  token_count: number;
  created_at: number;
  updated_at: number;
}

export interface CreatePromptInput {
  name: string;
  content?: string;
  color?: string;
  short_description?: string | null;
}

export interface UpdatePromptInput {
  name?: string;
  content?: string;
  color?: string;
  short_description?: string | null;
}

interface PromptRow {
  id: string;
  name: string;
  content: string;
  color: string;
  short_description: string | null;
  token_count: number | null;
  created_at: number;
  updated_at: number;
}

function rowToPrompt(row: PromptRow): Prompt {
  return {
    id: row.id,
    name: row.name,
    content: row.content,
    color: row.color,
    short_description: row.short_description ?? null,
    token_count: row.token_count ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function listPrompts(db: Database): Prompt[] {
  const rows = db.prepare("SELECT * FROM prompts ORDER BY name ASC").all() as PromptRow[];
  return rows.map(rowToPrompt);
}

export function getPrompt(db: Database, id: string): Prompt | null {
  const row = db.prepare("SELECT * FROM prompts WHERE id = ?").get(id) as PromptRow | undefined;
  return row ? rowToPrompt(row) : null;
}

export function getPromptByName(db: Database, name: string): Prompt | null {
  const row = db.prepare("SELECT * FROM prompts WHERE name = ?").get(name) as
    | PromptRow
    | undefined;
  return row ? rowToPrompt(row) : null;
}

export function createPrompt(db: Database, input: CreatePromptInput): Prompt {
  if (getPromptByName(db, input.name)) {
    throw new ConflictError(`Prompt name "${input.name}" is already taken`, {
      field: "name",
    });
  }
  const id = nanoid();
  const now = Date.now();
  const content = input.content ?? "";
  const color = input.color ?? "#888";
  const short_description = input.short_description ?? null;
  const tokenCount = countTokens(content);
  db.prepare(
    "INSERT INTO prompts (id, name, content, color, short_description, token_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, input.name, content, color, short_description, tokenCount, now, now);
  return {
    id,
    name: input.name,
    content,
    color,
    short_description,
    token_count: tokenCount,
    created_at: now,
    updated_at: now,
  };
}

export function updatePrompt(
  db: Database,
  id: string,
  input: UpdatePromptInput
): Prompt | null {
  if (input.name !== undefined) {
    const clash = getPromptByName(db, input.name);
    if (clash && clash.id !== id) {
      throw new ConflictError(`Prompt name "${input.name}" is already taken`, {
        field: "name",
      });
    }
  }
  const current = getPrompt(db, id);
  if (!current) return null;

  const name = input.name ?? current.name;
  const content = input.content ?? current.content;
  const color = input.color ?? current.color;
  // `undefined` means "not in the patch" — keep current value.
  // `null` means "clear it". Empty string is treated as null (no description).
  const short_description =
    input.short_description === undefined
      ? current.short_description
      : (input.short_description?.trim() || null);
  // Recompute only when content actually changed — saves a tokenizer pass on
  // rename/recolor patches, which are the common path.
  const tokenCount =
    input.content !== undefined && input.content !== current.content
      ? countTokens(content)
      : current.token_count;
  const now = Date.now();

  db.prepare(
    "UPDATE prompts SET name = ?, content = ?, color = ?, short_description = ?, token_count = ?, updated_at = ? WHERE id = ?"
  ).run(name, content, color, short_description, tokenCount, now, id);

  return {
    id,
    name,
    content,
    color,
    short_description,
    token_count: tokenCount,
    created_at: current.created_at,
    updated_at: now,
  };
}

export function deletePrompt(db: Database, id: string): boolean {
  const result = db.prepare("DELETE FROM prompts WHERE id = ?").run(id);
  return result.changes > 0;
}
