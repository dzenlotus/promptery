import type { Database } from "better-sqlite3";
import { nanoid } from "nanoid";
import { ConflictError } from "./errors.js";

export type TagKind = "role" | "skill" | "prompt" | "mcp";

export interface Tag {
  id: string;
  name: string;
  description: string;
  color: string;
  kind: TagKind;
  created_at: number;
  updated_at: number;
}

export interface CreateTagInput {
  name: string;
  description?: string;
  color?: string;
  kind?: TagKind;
}

export interface UpdateTagInput {
  name?: string;
  description?: string;
  color?: string;
  kind?: TagKind;
}

export function listTags(db: Database, kind?: TagKind): Tag[] {
  if (kind) {
    return db
      .prepare("SELECT * FROM tags WHERE kind = ? ORDER BY name ASC")
      .all(kind) as Tag[];
  }
  return db.prepare("SELECT * FROM tags ORDER BY name ASC").all() as Tag[];
}

export function getTag(db: Database, id: string): Tag | null {
  const row = db.prepare("SELECT * FROM tags WHERE id = ?").get(id) as Tag | undefined;
  return row ?? null;
}

export function getTagByName(db: Database, name: string): Tag | null {
  const row = db.prepare("SELECT * FROM tags WHERE name = ?").get(name) as Tag | undefined;
  return row ?? null;
}

export function createTag(db: Database, input: CreateTagInput): Tag {
  if (getTagByName(db, input.name)) {
    throw new ConflictError(`tag name "${input.name}" is already taken`);
  }
  const id = nanoid();
  const now = Date.now();
  const description = input.description ?? "";
  const color = input.color ?? "#888";
  const kind: TagKind = input.kind ?? "skill";
  db.prepare(
    "INSERT INTO tags (id, name, description, color, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, input.name, description, color, kind, now, now);
  return { id, name: input.name, description, color, kind, created_at: now, updated_at: now };
}

export function updateTag(db: Database, id: string, input: UpdateTagInput): Tag | null {
  if (input.name !== undefined) {
    const clash = getTagByName(db, input.name);
    if (clash && clash.id !== id) {
      throw new ConflictError(`tag name "${input.name}" is already taken`);
    }
  }
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (input.name !== undefined) {
    sets.push("name = ?");
    vals.push(input.name);
  }
  if (input.description !== undefined) {
    sets.push("description = ?");
    vals.push(input.description);
  }
  if (input.color !== undefined) {
    sets.push("color = ?");
    vals.push(input.color);
  }
  if (input.kind !== undefined) {
    sets.push("kind = ?");
    vals.push(input.kind);
  }
  if (sets.length === 0) return getTag(db, id);
  sets.push("updated_at = ?");
  vals.push(Date.now());
  vals.push(id);
  const result = db
    .prepare(`UPDATE tags SET ${sets.join(", ")} WHERE id = ?`)
    .run(...(vals as [unknown, ...unknown[]]));
  if (result.changes === 0) return null;
  return getTag(db, id);
}

export function deleteTag(db: Database, id: string): boolean {
  const result = db.prepare("DELETE FROM tags WHERE id = ?").run(id);
  return result.changes > 0;
}
