import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createBoard } from "../boards.js";
import { createTask } from "../tasks.js";
import {
  createAttachment,
  deleteAttachment,
  getAttachment,
  listAttachmentsForTask,
} from "../taskAttachments.js";
import { createTestDb } from "./helpers.js";

function seedBoardAndTask(db: Database.Database) {
  const board = createBoard(db, "B");
  const colId = (
    db.prepare("SELECT id FROM columns WHERE board_id = ? LIMIT 1").get(board.id) as
      | { id: string }
      | undefined
  )?.id;
  if (!colId) throw new Error("test board has no columns");
  const task = createTask(db, board.id, colId, { title: "T" });
  return { boardId: board.id, taskId: task.id };
}

describe("task_attachments queries", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("listAttachmentsForTask returns [] for a fresh task", () => {
    const { taskId } = seedBoardAndTask(db);
    expect(listAttachmentsForTask(db, taskId)).toEqual([]);
  });

  it("createAttachment inserts a row that listAttachmentsForTask returns", () => {
    const { taskId } = seedBoardAndTask(db);
    const row = createAttachment(db, {
      task_id: taskId,
      filename: "screenshot.png",
      mime_type: "image/png",
      size_bytes: 1234,
      storage_path: `${taskId}/screenshot.png`,
    });
    expect(row.id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(row.task_id).toBe(taskId);
    expect(row.uploaded_by).toBeNull();
    const list = listAttachmentsForTask(db, taskId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      filename: "screenshot.png",
      mime_type: "image/png",
      size_bytes: 1234,
      storage_path: `${taskId}/screenshot.png`,
    });
  });

  it("uploaded_by is preserved when provided", () => {
    const { taskId } = seedBoardAndTask(db);
    const row = createAttachment(db, {
      task_id: taskId,
      filename: "f.txt",
      mime_type: "text/plain",
      size_bytes: 1,
      storage_path: `${taskId}/f.txt`,
      uploaded_by: "agent-hint:dev",
    });
    expect(row.uploaded_by).toBe("agent-hint:dev");
    expect(getAttachment(db, row.id)?.uploaded_by).toBe("agent-hint:dev");
  });

  it("listAttachmentsForTask returns rows in upload order (oldest first)", () => {
    const { taskId } = seedBoardAndTask(db);
    // Two rows created back-to-back can land in the same millisecond, in
    // which case the secondary sort (id) breaks the tie. Forcing distinct
    // uploaded_at timestamps via the underlying INSERT keeps the assertion
    // about the *primary* sort key meaningful.
    const a = createAttachment(db, {
      task_id: taskId,
      filename: "a.txt",
      mime_type: "text/plain",
      size_bytes: 1,
      storage_path: `${taskId}/a.txt`,
    });
    db.prepare("UPDATE task_attachments SET uploaded_at = ? WHERE id = ?").run(
      a.uploaded_at - 1000,
      a.id
    );
    const b = createAttachment(db, {
      task_id: taskId,
      filename: "b.txt",
      mime_type: "text/plain",
      size_bytes: 1,
      storage_path: `${taskId}/b.txt`,
    });
    const ids = listAttachmentsForTask(db, taskId).map((r) => r.id);
    expect(ids[0]).toBe(a.id);
    expect(ids[1]).toBe(b.id);
  });

  it("deleteAttachment removes the row and returns true once", () => {
    const { taskId } = seedBoardAndTask(db);
    const row = createAttachment(db, {
      task_id: taskId,
      filename: "x.txt",
      mime_type: "text/plain",
      size_bytes: 2,
      storage_path: `${taskId}/x.txt`,
    });
    expect(deleteAttachment(db, row.id)).toBe(true);
    expect(getAttachment(db, row.id)).toBeNull();
    expect(deleteAttachment(db, row.id)).toBe(false);
  });

  it("deleting a task cascades into task_attachments via FK", () => {
    const { taskId } = seedBoardAndTask(db);
    createAttachment(db, {
      task_id: taskId,
      filename: "x.txt",
      mime_type: "text/plain",
      size_bytes: 1,
      storage_path: `${taskId}/x.txt`,
    });
    db.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);
    const remaining = (
      db.prepare("SELECT COUNT(*) AS c FROM task_attachments").get() as { c: number }
    ).c;
    expect(remaining).toBe(0);
  });
});
