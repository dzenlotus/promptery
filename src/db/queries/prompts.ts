import type { Database } from "better-sqlite3";
import { nanoid } from "nanoid";
import { ConflictError } from "./errors.js";

export interface Prompt {
  id: string;
  name: string;
  content: string;
  color: string;
  created_at: number;
  updated_at: number;
}

export interface CreatePromptInput {
  name: string;
  content?: string;
  color?: string;
}

export interface UpdatePromptInput {
  name?: string;
  content?: string;
  color?: string;
}

export function listPrompts(db: Database): Prompt[] {
  return db.prepare("SELECT * FROM prompts ORDER BY name ASC").all() as Prompt[];
}

export function getPrompt(db: Database, id: string): Prompt | null {
  const row = db.prepare("SELECT * FROM prompts WHERE id = ?").get(id) as Prompt | undefined;
  return row ?? null;
}

export function getPromptByName(db: Database, name: string): Prompt | null {
  const row = db.prepare("SELECT * FROM prompts WHERE name = ?").get(name) as Prompt | undefined;
  return row ?? null;
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
  db.prepare(
    "INSERT INTO prompts (id, name, content, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, input.name, content, color, now, now);
  return { id, name: input.name, content, color, created_at: now, updated_at: now };
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
  const now = Date.now();

  db.prepare(
    "UPDATE prompts SET name = ?, content = ?, color = ?, updated_at = ? WHERE id = ?"
  ).run(name, content, color, now, id);

  return { id, name, content, color, created_at: current.created_at, updated_at: now };
}

export function deletePrompt(db: Database, id: string): boolean {
  const result = db.prepare("DELETE FROM prompts WHERE id = ?").run(id);
  return result.changes > 0;
}
