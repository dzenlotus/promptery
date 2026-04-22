import type { Database } from "better-sqlite3";
import { nanoid } from "nanoid";

export interface Task {
  id: string;
  board_id: string;
  column_id: string;
  number: number;
  title: string;
  description: string;
  position: number;
  created_at: number;
  updated_at: number;
}

export interface TaskTagLite {
  id: string;
  name: string;
  color: string;
  kind: "role" | "skill" | "prompt" | "mcp";
}

export interface TaskTagFull extends TaskTagLite {
  description: string;
}

export interface TaskWithTags extends Task {
  tags: TaskTagLite[];
}

export interface TaskWithTagsFull extends Task {
  tags: TaskTagFull[];
}

export interface CreateTaskInput {
  title: string;
  description?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  column_id?: string;
  position?: number;
}

type TaskRow = Task & { tags_json: string };

/**
 * json_group_array + FILTER handles the LEFT JOIN correctly — no tags means '[]' instead of [null].
 */
export function listTasks(db: Database, boardId: string, columnId?: string): TaskWithTags[] {
  const columnFilter = columnId ? "AND t.column_id = ?" : "";
  const params = columnId ? [boardId, columnId] : [boardId];
  const rows = db
    .prepare(
      `
      SELECT
        t.*,
        COALESCE(
          json_group_array(
            json_object('id', tags.id, 'name', tags.name, 'color', tags.color, 'kind', tags.kind)
          ) FILTER (WHERE tags.id IS NOT NULL),
          '[]'
        ) AS tags_json
      FROM tasks t
      LEFT JOIN task_tags tt ON tt.task_id = t.id
      LEFT JOIN tags ON tags.id = tt.tag_id
      WHERE t.board_id = ? ${columnFilter}
      GROUP BY t.id
      ORDER BY t.column_id, t.position ASC
    `
    )
    .all(...params) as TaskRow[];

  return rows.map((row) => {
    const { tags_json, ...task } = row;
    return { ...task, tags: JSON.parse(tags_json) as TaskTagLite[] };
  });
}

export function getTask(db: Database, id: string): TaskWithTagsFull | null {
  const row = db
    .prepare(
      `
      SELECT
        t.*,
        COALESCE(
          json_group_array(
            json_object('id', tags.id, 'name', tags.name, 'color', tags.color, 'kind', tags.kind, 'description', tags.description)
          ) FILTER (WHERE tags.id IS NOT NULL),
          '[]'
        ) AS tags_json
      FROM tasks t
      LEFT JOIN task_tags tt ON tt.task_id = t.id
      LEFT JOIN tags ON tags.id = tt.tag_id
      WHERE t.id = ?
      GROUP BY t.id
    `
    )
    .get(id) as TaskRow | undefined;

  if (!row) return null;
  const { tags_json, ...task } = row;
  return { ...task, tags: JSON.parse(tags_json) as TaskTagFull[] };
}

export function createTask(
  db: Database,
  boardId: string,
  columnId: string,
  input: CreateTaskInput
): Task {
  const numberRow = db
    .prepare("SELECT COALESCE(MAX(number), 0) + 1 AS next FROM tasks WHERE board_id = ?")
    .get(boardId) as { next: number };
  const posRow = db
    .prepare(
      "SELECT COALESCE(MAX(position), 0) + 1 AS next FROM tasks WHERE board_id = ? AND column_id = ?"
    )
    .get(boardId, columnId) as { next: number };

  const id = nanoid();
  const now = Date.now();
  const description = input.description ?? "";
  db.prepare(
    `INSERT INTO tasks
     (id, board_id, column_id, number, title, description, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, boardId, columnId, numberRow.next, input.title, description, posRow.next, now, now);

  return {
    id,
    board_id: boardId,
    column_id: columnId,
    number: numberRow.next,
    title: input.title,
    description,
    position: posRow.next,
    created_at: now,
    updated_at: now,
  };
}

function getRawTask(db: Database, id: string): Task | null {
  const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task | undefined;
  return row ?? null;
}

export function updateTask(db: Database, id: string, input: UpdateTaskInput): Task | null {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (input.title !== undefined) {
    sets.push("title = ?");
    vals.push(input.title);
  }
  if (input.description !== undefined) {
    sets.push("description = ?");
    vals.push(input.description);
  }
  if (input.column_id !== undefined) {
    sets.push("column_id = ?");
    vals.push(input.column_id);
  }
  if (input.position !== undefined) {
    sets.push("position = ?");
    vals.push(input.position);
  }
  if (sets.length === 0) return getRawTask(db, id);
  sets.push("updated_at = ?");
  vals.push(Date.now());
  vals.push(id);
  const result = db
    .prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`)
    .run(...(vals as [unknown, ...unknown[]]));
  if (result.changes === 0) return null;
  return getRawTask(db, id);
}

export function moveTask(
  db: Database,
  id: string,
  targetColumnId: string,
  targetPosition: number
): Task | null {
  return updateTask(db, id, { column_id: targetColumnId, position: targetPosition });
}

export function deleteTask(db: Database, id: string): boolean {
  const result = db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
  return result.changes > 0;
}

export function addTagToTask(db: Database, taskId: string, tagId: string): boolean {
  const result = db
    .prepare("INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)")
    .run(taskId, tagId);
  return result.changes > 0;
}

export function removeTagFromTask(db: Database, taskId: string, tagId: string): boolean {
  const result = db
    .prepare("DELETE FROM task_tags WHERE task_id = ? AND tag_id = ?")
    .run(taskId, tagId);
  return result.changes > 0;
}
