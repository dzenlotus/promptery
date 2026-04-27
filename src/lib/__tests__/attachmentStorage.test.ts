import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ATTACHMENT_MAX_BYTES,
  deleteAttachmentFile,
  deleteAttachmentsForTask,
  guessMimeType,
  readAttachment,
  saveAttachment,
} from "../attachmentStorage.js";
import { getAttachmentsDir } from "../paths.js";

const ORIGINAL_HOME = process.env.PROMPTERY_HOME_DIR;

describe("attachmentStorage", () => {
  let homeDir: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "promptery-attach-test-"));
    process.env.PROMPTERY_HOME_DIR = homeDir;
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
    if (ORIGINAL_HOME !== undefined) process.env.PROMPTERY_HOME_DIR = ORIGINAL_HOME;
  });

  it("guessMimeType returns image/png for png and octet-stream for unknown", () => {
    expect(guessMimeType("photo.PNG")).toBe("image/png");
    expect(guessMimeType("doc.pdf")).toBe("application/pdf");
    expect(guessMimeType("noext")).toBe("application/octet-stream");
    expect(guessMimeType("weird.xyz")).toBe("application/octet-stream");
  });

  it("saveAttachment writes the buffer atomically and returns metadata", () => {
    const body = Buffer.from("hello world");
    const out = saveAttachment("task-1", "hello.txt", body);

    expect(out.sizeBytes).toBe(body.byteLength);
    expect(out.mimeType).toBe("text/plain");
    expect(out.storagePath).toBe("task-1/hello.txt");

    const abs = join(getAttachmentsDir(), out.storagePath);
    expect(readFileSync(abs).toString()).toBe("hello world");
  });

  it("saveAttachment honours an explicit mime type override", () => {
    const out = saveAttachment("task-1", "weird.bin", Buffer.from("x"), "image/png");
    expect(out.mimeType).toBe("image/png");
  });

  it("collisions append -2, -3 before the extension", () => {
    const a = saveAttachment("task-1", "image.png", Buffer.from("a"));
    const b = saveAttachment("task-1", "image.png", Buffer.from("b"));
    const c = saveAttachment("task-1", "image.png", Buffer.from("c"));
    expect(a.storagePath).toBe("task-1/image.png");
    expect(b.storagePath).toBe("task-1/image-2.png");
    expect(c.storagePath).toBe("task-1/image-3.png");

    // Each one round-trips its body unchanged.
    expect(readFileSync(join(getAttachmentsDir(), a.storagePath)).toString()).toBe("a");
    expect(readFileSync(join(getAttachmentsDir(), b.storagePath)).toString()).toBe("b");
    expect(readFileSync(join(getAttachmentsDir(), c.storagePath)).toString()).toBe("c");
  });

  it("sanitises path components and dotfiles", () => {
    const out = saveAttachment("task-1", "../../etc/passwd", Buffer.from("x"));
    // The sanitised filename strips the leading dots but keeps the basename.
    expect(out.storagePath.startsWith("task-1/")).toBe(true);
    expect(out.storagePath).not.toContain("..");
    const abs = join(getAttachmentsDir(), out.storagePath);
    expect(abs.startsWith(getAttachmentsDir())).toBe(true);
  });

  it("readAttachment round-trips the saved bytes", () => {
    const body = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const out = saveAttachment("task-1", "pic.jpg", body);
    expect(readAttachment(out.storagePath)).toEqual(body);
  });

  it("deleteAttachmentFile removes the file and ENOENT is silently ignored", () => {
    const out = saveAttachment("task-1", "tmp.txt", Buffer.from("x"));
    const abs = join(getAttachmentsDir(), out.storagePath);
    expect(existsSync(abs)).toBe(true);
    deleteAttachmentFile(out.storagePath);
    expect(existsSync(abs)).toBe(false);
    // Second call is a no-op.
    expect(() => deleteAttachmentFile(out.storagePath)).not.toThrow();
  });

  it("deleteAttachmentsForTask removes the per-task directory", () => {
    saveAttachment("task-1", "a.txt", Buffer.from("a"));
    saveAttachment("task-1", "b.txt", Buffer.from("b"));
    const dir = join(getAttachmentsDir(), "task-1");
    expect(existsSync(dir)).toBe(true);
    deleteAttachmentsForTask("task-1");
    expect(existsSync(dir)).toBe(false);
  });

  it("deleteAttachmentsForTask is a no-op for a missing dir", () => {
    expect(() => deleteAttachmentsForTask("never-existed")).not.toThrow();
  });

  it("readAttachment / deleteAttachmentFile reject absolute paths", () => {
    const evilPath = "/etc/passwd";
    expect(() => readAttachment(evilPath)).toThrow();
    expect(() => deleteAttachmentFile(evilPath)).toThrow();
  });

  it("readAttachment / deleteAttachmentFile reject traversal paths", () => {
    expect(() => readAttachment("../../../../../etc/passwd")).toThrow(
      /escapes attachments root/
    );
  });

  it("ATTACHMENT_MAX_BYTES is 25 MiB", () => {
    expect(ATTACHMENT_MAX_BYTES).toBe(25 * 1024 * 1024);
  });

  it("does not leave a tmp file when the write succeeds", () => {
    saveAttachment("task-tmp", "a.txt", Buffer.from("ok"));
    const dir = join(getAttachmentsDir(), "task-tmp");
    const stray = readDirSafe(dir).filter((n) => n.startsWith(".tmp-"));
    expect(stray).toEqual([]);
  });

  it("writes pre-existing dirs without clobbering siblings", () => {
    saveAttachment("task-share", "a.txt", Buffer.from("alpha"));
    // Drop a sibling in the task dir before the second write to make sure
    // mkdir-recursive doesn't blow it away.
    const sibling = join(getAttachmentsDir(), "task-share", "marker.dat");
    writeFileSync(sibling, "keep");
    saveAttachment("task-share", "b.txt", Buffer.from("beta"));
    expect(readFileSync(sibling).toString()).toBe("keep");
  });
});

function readDirSafe(p: string): string[] {
  try {
    return readdirSync(p);
  } catch {
    return [];
  }
}
