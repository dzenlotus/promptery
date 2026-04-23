import type { Database } from "better-sqlite3";
import type { Prompt } from "./prompts.js";

export type TaskPrompt = Prompt & { origin: string };

export function listTaskPrompts(db: Database, taskId: string): TaskPrompt[] {
  return db
    .prepare(
      `SELECT p.*, tp.origin FROM prompts p
       JOIN task_prompts tp ON tp.prompt_id = p.id
       WHERE tp.task_id = ?
       ORDER BY tp.position ASC`
    )
    .all(taskId) as TaskPrompt[];
}

export function getTaskPromptOrigin(
  db: Database,
  taskId: string,
  promptId: string
): string | null {
  const row = db
    .prepare("SELECT origin FROM task_prompts WHERE task_id = ? AND prompt_id = ?")
    .get(taskId, promptId) as { origin: string } | undefined;
  return row?.origin ?? null;
}

export function addTaskPrompt(
  db: Database,
  taskId: string,
  promptId: string,
  origin: string = "direct"
): void {
  db.prepare(
    `INSERT OR IGNORE INTO task_prompts (task_id, prompt_id, origin, position)
     VALUES (?, ?, ?, COALESCE((SELECT MAX(position) FROM task_prompts WHERE task_id = ?), 0) + 1)`
  ).run(taskId, promptId, origin, taskId);
}

export function removeTaskPrompt(db: Database, taskId: string, promptId: string): boolean {
  const result = db
    .prepare("DELETE FROM task_prompts WHERE task_id = ? AND prompt_id = ?")
    .run(taskId, promptId);
  return result.changes > 0;
}

/**
 * Bulk-clear all rows attached with a given origin (e.g. "role:abc123") so a
 * task's role-inherited links can be wiped before re-seeding from a new role.
 */
export function removeTaskPromptsByOrigin(
  db: Database,
  taskId: string,
  origin: string
): void {
  db.prepare("DELETE FROM task_prompts WHERE task_id = ? AND origin = ?").run(taskId, origin);
}
