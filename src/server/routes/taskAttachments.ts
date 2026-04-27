import { Hono } from "hono";
import { getDb } from "../../db/index.js";
import * as q from "../../db/queries/index.js";
import {
  ATTACHMENT_MAX_BYTES,
  deleteAttachmentFile,
  guessMimeType,
  readAttachment,
  saveAttachment,
} from "../../lib/attachmentStorage.js";
import { bus } from "../events/bus.js";

/**
 * Routes for per-task attachments. Mounted as a child router under
 * `/api/tasks` from the parent `tasksRoute` so the path layout stays
 * consistent: GET/POST `/api/tasks/:taskId/attachments`,
 * GET `/api/tasks/:taskId/attachments/:attachmentId/download`,
 * DELETE `/api/tasks/:taskId/attachments/:attachmentId`.
 *
 * Limits: max upload 25 MiB (constant in attachmentStorage). Anything bigger
 * returns 413 with no row created. Non-multipart bodies return 415.
 */
export const taskAttachmentsRoute = new Hono();

taskAttachmentsRoute.get("/:taskId/attachments", (c) => {
  const taskId = c.req.param("taskId");
  if (!q.getTask(getDb(), taskId)) return c.json({ error: "task not found" }, 404);
  return c.json(q.listAttachmentsForTask(getDb(), taskId));
});

taskAttachmentsRoute.post("/:taskId/attachments", async (c) => {
  const taskId = c.req.param("taskId");
  const task = q.getTask(getDb(), taskId);
  if (!task) return c.json({ error: "task not found" }, 404);

  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return c.json(
      { error: "expected multipart/form-data with a 'file' field" },
      415
    );
  }

  // Hono's parseBody() resolves multipart segments into File objects (whose
  // `arrayBuffer()` materialises the upload in memory). Cap is enforced
  // post-parse — Hono itself does not police body size. The cap is small
  // enough (25 MiB) that the buffered read is acceptable.
  let parsed: Record<string, unknown>;
  try {
    parsed = await c.req.parseBody({ all: false });
  } catch (err) {
    return c.json(
      { error: "failed to parse multipart body", message: (err as Error).message },
      400
    );
  }

  const file = parsed.file;
  if (!(file instanceof File)) {
    return c.json({ error: "missing 'file' field in multipart payload" }, 400);
  }

  if (file.size > ATTACHMENT_MAX_BYTES) {
    return c.json(
      {
        error: "file too large",
        message: `Attachment exceeds the ${ATTACHMENT_MAX_BYTES} byte limit.`,
        max_bytes: ATTACHMENT_MAX_BYTES,
      },
      413
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Defense-in-depth: re-check post-buffer in case a client lied about
  // file.size in the headers. parseBody buffers the whole part already.
  if (buffer.byteLength > ATTACHMENT_MAX_BYTES) {
    return c.json(
      {
        error: "file too large",
        max_bytes: ATTACHMENT_MAX_BYTES,
      },
      413
    );
  }

  const filename =
    typeof file.name === "string" && file.name.length > 0 ? file.name : "upload";
  const mimeFromClient = typeof file.type === "string" && file.type.length > 0
    ? file.type
    : guessMimeType(filename);

  const saved = saveAttachment(taskId, filename, buffer, mimeFromClient);

  // Optional `uploaded_by` field — keeps a hint of who posted the file. We
  // accept it from a multipart text field only; agents do not (yet) upload.
  const uploadedBy = typeof parsed.uploaded_by === "string" ? parsed.uploaded_by : null;

  const row = q.createAttachment(getDb(), {
    task_id: taskId,
    filename,
    mime_type: saved.mimeType,
    size_bytes: saved.sizeBytes,
    storage_path: saved.storagePath,
    uploaded_by: uploadedBy,
  });

  bus.publish({
    type: "task.attachment_added",
    data: { boardId: task.board_id, taskId, attachment: row },
  });

  return c.json(row, 201);
});

taskAttachmentsRoute.get("/:taskId/attachments/:attachmentId/download", (c) => {
  const taskId = c.req.param("taskId");
  const attachmentId = c.req.param("attachmentId");
  const row = q.getAttachment(getDb(), attachmentId);
  if (!row || row.task_id !== taskId) {
    return c.json({ error: "attachment not found" }, 404);
  }

  let body: Buffer;
  try {
    body = readAttachment(row.storage_path);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return c.json({ error: "attachment file is missing on disk" }, 404);
    }
    throw err;
  }

  // Build an RFC 5987 Content-Disposition so non-ASCII filenames survive
  // the trip. The plain `filename=` clause keeps a printable fallback;
  // `filename*=UTF-8''<encoded>` is what modern browsers actually use.
  const safeAscii = row.filename.replace(/[^\x20-\x7E]+/g, "_");
  const disposition = `inline; filename="${safeAscii.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(
    row.filename
  )}`;

  // Buffer → fresh Uint8Array view: Hono's c.body() expects a Uint8Array
  // backed by a regular ArrayBuffer (not SharedArrayBuffer). The copy is
  // unavoidable but cheap — payloads are capped at 25 MiB.
  const ab = new ArrayBuffer(body.byteLength);
  new Uint8Array(ab).set(body);
  return c.body(new Uint8Array(ab), 200, {
    "Content-Type": row.mime_type || "application/octet-stream",
    "Content-Disposition": disposition,
    "Content-Length": String(body.byteLength),
  });
});

taskAttachmentsRoute.delete("/:taskId/attachments/:attachmentId", (c) => {
  const taskId = c.req.param("taskId");
  const attachmentId = c.req.param("attachmentId");
  const row = q.getAttachment(getDb(), attachmentId);
  if (!row || row.task_id !== taskId) {
    return c.json({ error: "attachment not found" }, 404);
  }

  q.deleteAttachment(getDb(), attachmentId);
  // Best-effort file delete — DB row is the source of truth. ENOENT is
  // already swallowed inside deleteAttachmentFile.
  try {
    deleteAttachmentFile(row.storage_path);
  } catch (err) {
    console.error(
      `[promptery] failed to delete attachment file for ${attachmentId}:`,
      err
    );
  }

  const task = q.getTask(getDb(), taskId);
  bus.publish({
    type: "task.attachment_deleted",
    data: {
      boardId: task?.board_id ?? row.task_id,
      taskId,
      attachmentId,
    },
  });

  return c.json({ ok: true });
});

export default taskAttachmentsRoute;
