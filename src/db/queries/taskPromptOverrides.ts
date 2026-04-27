import type { Database } from "better-sqlite3";

/**
 * Per-task switches on inherited prompts. The resolver applies these as a
 * post-collection filter step so a task can quietly suppress one prompt
 * without disturbing the role / column / board it lives on.
 *
 * `enabled = 0` means "drop this prompt from the effective context for THIS
 * task only". `enabled = 1` is reserved — today the resolver only consults
 * the explicit-disable case; absence of a row keeps default behaviour.
 *
 * Stale-override rule: a row whose prompt is no longer inherited has no
 * effect at resolve time. We do NOT auto-cleanup such rows because:
 *   - it's harmless (zero-cost lookup)
 *   - cleanup would race with bulk role edits and per-task UI toggling
 *   - the user might re-add the same prompt to the role later and expect
 *     their previous suppression to still apply.
 */

export interface TaskPromptOverrideRow {
  task_id: string;
  prompt_id: string;
  enabled: number;
  created_at: number;
}

/**
 * Map of prompt_id → enabled flag for a single task. The resolver checks
 * `overrides.get(p.id) !== 0` to filter, which means both "no row" and
 * `enabled === 1` keep the prompt in the list.
 */
export function listOverrides(db: Database, taskId: string): Map<string, number> {
  const rows = db
    .prepare(
      "SELECT prompt_id, enabled FROM task_prompt_overrides WHERE task_id = ?"
    )
    .all(taskId) as { prompt_id: string; enabled: number }[];
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.prompt_id, r.enabled);
  return out;
}

/**
 * Convenience: list just the prompt ids that are explicitly disabled. UI uses
 * this to render greyed-out chips and for the `disabled_prompts` field on
 * `get_task_context`.
 */
export function listDisabledPromptIds(db: Database, taskId: string): string[] {
  return (
    db
      .prepare(
        "SELECT prompt_id FROM task_prompt_overrides WHERE task_id = ? AND enabled = 0"
      )
      .all(taskId) as { prompt_id: string }[]
  ).map((r) => r.prompt_id);
}

export interface SetOverrideInput {
  taskId: string;
  promptId: string;
  enabled: 0 | 1;
}

/**
 * Upsert an override row. Re-toggling the same flag is idempotent (created_at
 * is left intact via INSERT OR REPLACE — the conflict path inserts a fresh
 * timestamp, which is the documented behaviour for "user re-confirmed this
 * override").
 */
export function setOverride(db: Database, input: SetOverrideInput): void {
  db.prepare(
    `INSERT INTO task_prompt_overrides (task_id, prompt_id, enabled, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(task_id, prompt_id) DO UPDATE SET enabled = excluded.enabled`
  ).run(input.taskId, input.promptId, input.enabled, Date.now());
}

/**
 * Drop the override row entirely — the prompt reverts to inheriting whatever
 * the upstream layers say. Returns true when a row was actually removed.
 */
export function deleteOverride(
  db: Database,
  taskId: string,
  promptId: string
): boolean {
  const result = db
    .prepare(
      "DELETE FROM task_prompt_overrides WHERE task_id = ? AND prompt_id = ?"
    )
    .run(taskId, promptId);
  return result.changes > 0;
}
