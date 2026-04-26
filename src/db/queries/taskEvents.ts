import type { Database } from "better-sqlite3";
import { nanoid } from "nanoid";

/**
 * Activity log entry for a single task mutation. `details` is type-specific
 * — see `TaskEventType` for the conventions per type. We deserialize the
 * `details_json` column on read so callers always work with the shaped
 * object (or null when no extra data is needed for that event type).
 */
export interface TaskEvent {
  id: string;
  task_id: string;
  type: TaskEventType;
  actor: string | null;
  details: Record<string, unknown> | null;
  created_at: number;
}

/**
 * Closed enum of all mutation types the task timeline records. Keep in sync
 * with the call sites in `src/server/routes/tasks.ts`. UI uses these values
 * verbatim to pick icons and labels.
 */
export type TaskEventType =
  | "task.created"
  | "task.updated"
  | "task.moved"
  | "task.deleted"
  | "task.role_changed"
  | "task.prompt_added"
  | "task.prompt_removed"
  | "task.skill_added"
  | "task.skill_removed"
  | "task.mcp_tool_added"
  | "task.mcp_tool_removed";

export interface RecordTaskEventInput {
  task_id: string;
  type: TaskEventType;
  actor?: string | null;
  details?: Record<string, unknown> | null;
}

/**
 * Append a single event to the timeline. Synchronous and best-effort —
 * callers in route handlers invoke this *after* the underlying mutation
 * succeeds, so a failure here would surface as a 500 rather than silently
 * losing history. Returns the persisted row so the WS event can carry
 * the canonical shape clients then render.
 *
 * TODO: events grow unbounded; add a configurable retention setting later
 * (e.g. keep latest N per task, or trim by age) — see future ticket for
 * the "task activity log retention" follow-up.
 */
export function recordTaskEvent(db: Database, input: RecordTaskEventInput): TaskEvent {
  const id = nanoid();
  const created_at = Date.now();
  const detailsJson = input.details ? JSON.stringify(input.details) : null;
  db.prepare(
    "INSERT INTO task_events (id, task_id, type, actor, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, input.task_id, input.type, input.actor ?? null, detailsJson, created_at);
  return {
    id,
    task_id: input.task_id,
    type: input.type,
    actor: input.actor ?? null,
    details: input.details ?? null,
    created_at,
  };
}

interface TaskEventRow {
  id: string;
  task_id: string;
  type: string;
  actor: string | null;
  details_json: string | null;
  created_at: number;
}

function rowToEvent(row: TaskEventRow): TaskEvent {
  let details: Record<string, unknown> | null = null;
  if (row.details_json) {
    try {
      details = JSON.parse(row.details_json) as Record<string, unknown>;
    } catch {
      // Tolerate corrupt payloads — surface as null rather than crashing the
      // dialog on a single bad row. The DB invariant is "we always write
      // valid JSON or NULL", so this is purely defensive.
      details = null;
    }
  }
  return {
    id: row.id,
    task_id: row.task_id,
    type: row.type as TaskEventType,
    actor: row.actor,
    details,
    created_at: row.created_at,
  };
}

export const LIST_TASK_EVENTS_DEFAULT_LIMIT = 50;
export const LIST_TASK_EVENTS_MAX_LIMIT = 500;

/**
 * Newest-first listing of events for a single task. Defaults to 50 entries —
 * the dialog renders all of them at once today; larger pages can come later
 * if the timeline grows long enough to need pagination.
 */
export function listEventsForTask(
  db: Database,
  taskId: string,
  limit: number = LIST_TASK_EVENTS_DEFAULT_LIMIT
): TaskEvent[] {
  const clamped = Math.min(Math.max(1, limit), LIST_TASK_EVENTS_MAX_LIMIT);
  // Tiebreaker on `rowid` keeps insert order stable when two events land
  // in the same millisecond — sorting on `id` (a random nanoid) would put
  // events out of order whenever two rows share `created_at`.
  const rows = db
    .prepare(
      "SELECT id, task_id, type, actor, details_json, created_at FROM task_events WHERE task_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?"
    )
    .all(taskId, clamped) as TaskEventRow[];
  return rows.map(rowToEvent);
}
