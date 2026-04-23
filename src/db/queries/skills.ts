import type { Database } from "better-sqlite3";
import { nanoid } from "nanoid";
import { ConflictError } from "./errors.js";

export interface Skill {
  id: string;
  name: string;
  content: string;
  color: string;
  created_at: number;
  updated_at: number;
}

export interface CreateSkillInput {
  name: string;
  content?: string;
  color?: string;
}

export interface UpdateSkillInput {
  name?: string;
  content?: string;
  color?: string;
}

export function listSkills(db: Database): Skill[] {
  return db.prepare("SELECT * FROM skills ORDER BY name ASC").all() as Skill[];
}

export function getSkill(db: Database, id: string): Skill | null {
  const row = db.prepare("SELECT * FROM skills WHERE id = ?").get(id) as Skill | undefined;
  return row ?? null;
}

export function getSkillByName(db: Database, name: string): Skill | null {
  const row = db.prepare("SELECT * FROM skills WHERE name = ?").get(name) as Skill | undefined;
  return row ?? null;
}

export function createSkill(db: Database, input: CreateSkillInput): Skill {
  if (getSkillByName(db, input.name)) {
    throw new ConflictError(`Skill name "${input.name}" is already taken`, {
      field: "name",
    });
  }
  const id = nanoid();
  const now = Date.now();
  const content = input.content ?? "";
  const color = input.color ?? "#888";
  db.prepare(
    "INSERT INTO skills (id, name, content, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, input.name, content, color, now, now);
  return { id, name: input.name, content, color, created_at: now, updated_at: now };
}

export function updateSkill(
  db: Database,
  id: string,
  input: UpdateSkillInput
): Skill | null {
  if (input.name !== undefined) {
    const clash = getSkillByName(db, input.name);
    if (clash && clash.id !== id) {
      throw new ConflictError(`Skill name "${input.name}" is already taken`, {
      field: "name",
    });
    }
  }
  const current = getSkill(db, id);
  if (!current) return null;

  const name = input.name ?? current.name;
  const content = input.content ?? current.content;
  const color = input.color ?? current.color;
  const now = Date.now();

  db.prepare(
    "UPDATE skills SET name = ?, content = ?, color = ?, updated_at = ? WHERE id = ?"
  ).run(name, content, color, now, id);

  return { id, name, content, color, created_at: current.created_at, updated_at: now };
}

export function deleteSkill(db: Database, id: string): boolean {
  const result = db.prepare("DELETE FROM skills WHERE id = ?").run(id);
  return result.changes > 0;
}
