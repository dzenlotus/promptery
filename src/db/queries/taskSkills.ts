import type { Database } from "better-sqlite3";
import type { Skill } from "./skills.js";

export type TaskSkill = Skill & { origin: string };

export function listTaskSkills(db: Database, taskId: string): TaskSkill[] {
  return db
    .prepare(
      `SELECT s.*, ts.origin FROM skills s
       JOIN task_skills ts ON ts.skill_id = s.id
       WHERE ts.task_id = ?
       ORDER BY ts.position ASC`
    )
    .all(taskId) as TaskSkill[];
}

export function getTaskSkillOrigin(
  db: Database,
  taskId: string,
  skillId: string
): string | null {
  const row = db
    .prepare("SELECT origin FROM task_skills WHERE task_id = ? AND skill_id = ?")
    .get(taskId, skillId) as { origin: string } | undefined;
  return row?.origin ?? null;
}

export function addTaskSkill(
  db: Database,
  taskId: string,
  skillId: string,
  origin: string = "direct"
): void {
  db.prepare(
    `INSERT OR IGNORE INTO task_skills (task_id, skill_id, origin, position)
     VALUES (?, ?, ?, COALESCE((SELECT MAX(position) FROM task_skills WHERE task_id = ?), 0) + 1)`
  ).run(taskId, skillId, origin, taskId);
}

export function removeTaskSkill(db: Database, taskId: string, skillId: string): boolean {
  const result = db
    .prepare("DELETE FROM task_skills WHERE task_id = ? AND skill_id = ?")
    .run(taskId, skillId);
  return result.changes > 0;
}

export function removeTaskSkillsByOrigin(
  db: Database,
  taskId: string,
  origin: string
): void {
  db.prepare("DELETE FROM task_skills WHERE task_id = ? AND origin = ?").run(taskId, origin);
}
