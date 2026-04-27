import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { join, isAbsolute, resolve, sep } from "node:path";
import { nanoid } from "nanoid";
import { getAttachmentsDir } from "./paths.js";

/**
 * Maximum upload size accepted by the attachments routes. 25 MiB is enough
 * for typical screenshots and PDFs while small enough that we can buffer
 * the whole payload in memory without worrying about back-pressure on the
 * Hono request body parser. Not configurable in v1.
 */
export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

const ATTACHMENT_EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  csv: "text/csv",
  zip: "application/zip",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
};

/**
 * Best-effort mime type guess from a filename. Used when the client did not
 * supply one in the multipart payload (rare but possible for older browsers
 * or tools like `curl`). Falls back to application/octet-stream so the
 * download always sets a Content-Type header even for unknown extensions.
 */
export function guessMimeType(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return "application/octet-stream";
  const ext = filename.slice(dot + 1).toLowerCase();
  return ATTACHMENT_EXT_TO_MIME[ext] ?? "application/octet-stream";
}

/**
 * Sanitise a user-provided filename so it is safe to use on disk. Strips
 * directory components and any character that is not alphanumeric, dash,
 * dot, underscore, or space. Empty results are replaced with a random id —
 * the original filename is preserved verbatim in the DB row regardless.
 */
function sanitiseFilename(name: string): string {
  // Drop any path components — only the basename matters for storage.
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "";
  // Trim whitespace and reject leading dots ("." / "..") so we never write a
  // hidden or traversal-shaped file.
  const trimmed = base.replace(/^\.+/, "").trim();
  const cleaned = trimmed.replace(/[^A-Za-z0-9._\- ]+/g, "_");
  return cleaned.length > 0 ? cleaned : `file-${nanoid(8)}`;
}

function splitFilename(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return { stem: name, ext: "" };
  return { stem: name.slice(0, dot), ext: name.slice(dot) };
}

/**
 * Pick a filename inside `dir` that does not collide with an existing file.
 * On collision the loop appends `-2`, `-3`, ... before the extension so a
 * second `screenshot.png` becomes `screenshot-2.png`. Bounded loop — after
 * 1000 attempts it falls back to a nanoid suffix to guarantee termination
 * even under pathological races.
 */
function pickUniqueFilename(dir: string, desired: string): string {
  if (!existsSync(join(dir, desired))) return desired;
  const { stem, ext } = splitFilename(desired);
  for (let n = 2; n < 1000; n++) {
    const candidate = `${stem}-${n}${ext}`;
    if (!existsSync(join(dir, candidate))) return candidate;
  }
  return `${stem}-${nanoid(8)}${ext}`;
}

/**
 * Resolve a stored relative path back to an absolute on-disk location. The
 * relative path is anchored at the attachments root and must never escape
 * it — we re-resolve and require the absolute form to start with the root
 * directory to defend against `..` injection in stored paths (which we
 * already guard against on write but is worth checking on read too).
 */
function resolveStorageAbsolute(storagePath: string): string {
  if (isAbsolute(storagePath)) {
    throw new Error("storage_path must be relative to attachments root");
  }
  const root = getAttachmentsDir();
  const abs = resolve(root, storagePath);
  if (!abs.startsWith(root + sep) && abs !== root) {
    throw new Error("storage_path escapes attachments root");
  }
  return abs;
}

export interface SavedAttachment {
  storagePath: string; // relative to ~/.promptery/attachments/
  sizeBytes: number;
  mimeType: string;
  filename: string; // sanitised filename actually used on disk
}

/**
 * Write the buffer to disk under `<attachments-root>/<task-id>/<filename>`,
 * resolving collisions by appending `-2`, `-3`, ... before the extension.
 * Returns the metadata the caller needs to insert the DB row.
 *
 * The write is atomic: payload is streamed into a temp file with a `.tmp-`
 * prefix and then `rename()`d into place, so a crash partway through never
 * leaves a half-written file under the user-visible name. fsync via
 * `writeSync(fd, ..., 'flush')` is intentionally skipped — sqlite WAL is
 * the source of truth, and an attachment whose row never made it is just
 * dead-letter content the next cleanup job can sweep.
 */
export function saveAttachment(
  taskId: string,
  filename: string,
  body: Buffer,
  mimeType?: string
): SavedAttachment {
  const root = getAttachmentsDir();
  const taskDir = join(root, taskId);
  mkdirSync(taskDir, { recursive: true });

  const safe = sanitiseFilename(filename);
  const final = pickUniqueFilename(taskDir, safe);
  const finalAbs = join(taskDir, final);
  const tmpAbs = join(taskDir, `.tmp-${nanoid(8)}-${final}`);

  // Atomic write: open + write + close + rename. Errors propagate to the
  // caller; we make a best effort to clean up the tmp file so a transient
  // ENOSPC doesn't leave litter on disk.
  let fd: number | null = null;
  try {
    fd = openSync(tmpAbs, "w");
    writeSync(fd, body);
    closeSync(fd);
    fd = null;
    renameSync(tmpAbs, finalAbs);
  } catch (err) {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        /* swallow — original error is more useful */
      }
    }
    try {
      unlinkSync(tmpAbs);
    } catch {
      /* tmp file may not exist — fine */
    }
    throw err;
  }

  return {
    storagePath: `${taskId}/${final}`,
    sizeBytes: body.byteLength,
    mimeType: mimeType ?? guessMimeType(final),
    filename: safe,
  };
}

/**
 * Remove a stored attachment file. Best-effort — ENOENT is swallowed so
 * deleting a row whose file was already swept (or never written) does not
 * surface as a 500. Other errors propagate so genuine permission issues
 * remain visible.
 */
export function deleteAttachmentFile(storagePath: string): void {
  const abs = resolveStorageAbsolute(storagePath);
  try {
    unlinkSync(abs);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return;
    throw err;
  }
}

/**
 * Delete the entire attachments directory for a task. Used by the task
 * deletion flow after the SQL DELETE has stripped metadata. Best-effort —
 * a missing directory is fine; other failures are logged and swallowed
 * because we never want a delete-task to fail because the FS is wedged.
 */
export function deleteAttachmentsForTask(taskId: string): void {
  const root = getAttachmentsDir();
  const dir = join(root, taskId);
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    console.error(`[promptery] failed to clean attachments for task ${taskId}:`, err);
  }
}

/**
 * Read a previously stored attachment back into memory. Used by the
 * download route. Caller-side streaming is not yet plumbed — uploads cap
 * at ATTACHMENT_MAX_BYTES so a buffered read is bounded.
 */
export function readAttachment(storagePath: string): Buffer {
  const abs = resolveStorageAbsolute(storagePath);
  return readFileSync(abs);
}

