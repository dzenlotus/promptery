import type { Database } from "better-sqlite3";
import { nanoid } from "nanoid";

export interface TaskAttachment {
  id: string;
  task_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  uploaded_at: number;
  uploaded_by: string | null;
}

export interface CreateAttachmentInput {
  task_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  uploaded_by?: string | null;
}

/**
 * Read attachments for a task in upload order (oldest first). Stable sort —
 * uploaded_at ties fall back to id so the list does not flicker between
 * reloads if two attachments shared a millisecond.
 */
export function listAttachmentsForTask(db: Database, taskId: string): TaskAttachment[] {
  return db
    .prepare(
      `SELECT id, task_id, filename, mime_type, size_bytes, storage_path,
              uploaded_at, uploaded_by
         FROM task_attachments
        WHERE task_id = ?
        ORDER BY uploaded_at ASC, id ASC`
    )
    .all(taskId) as TaskAttachment[];
}

export function getAttachment(db: Database, id: string): TaskAttachment | null {
  const row = db
    .prepare(
      `SELECT id, task_id, filename, mime_type, size_bytes, storage_path,
              uploaded_at, uploaded_by
         FROM task_attachments
        WHERE id = ?`
    )
    .get(id) as TaskAttachment | undefined;
  return row ?? null;
}

/**
 * Insert metadata only — the caller is responsible for writing the file at
 * the absolute path derived from `storage_path`. Returns the row that was
 * written so the route handler can ship it back to the client without a
 * second SELECT.
 */
export function createAttachment(
  db: Database,
  input: CreateAttachmentInput
): TaskAttachment {
  const id = nanoid();
  const uploaded_at = Date.now();
  const uploaded_by = input.uploaded_by ?? null;
  db.prepare(
    `INSERT INTO task_attachments
       (id, task_id, filename, mime_type, size_bytes, storage_path, uploaded_at, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.task_id,
    input.filename,
    input.mime_type,
    input.size_bytes,
    input.storage_path,
    uploaded_at,
    uploaded_by
  );
  return {
    id,
    task_id: input.task_id,
    filename: input.filename,
    mime_type: input.mime_type,
    size_bytes: input.size_bytes,
    storage_path: input.storage_path,
    uploaded_at,
    uploaded_by,
  };
}

/**
 * Remove a row from task_attachments. Caller is responsible for the on-disk
 * file (use `deleteAttachmentFile` from `lib/attachmentStorage`). Returns
 * true when a row was actually deleted so callers can short-circuit the
 * file delete on a stale id.
 */
export function deleteAttachment(db: Database, id: string): boolean {
  const result = db.prepare("DELETE FROM task_attachments WHERE id = ?").run(id);
  return result.changes > 0;
}
