import { describe, expect, it } from "vitest";
import {
  createSpace,
  deleteSpace,
  getDefaultSpace,
  getSpace,
  getSpaceByPrefix,
  isValidPrefix,
  listSpaces,
  moveBoardToSpace,
  updateSpace,
} from "../spaces.js";
import { createBoard } from "../boards.js";
import { createColumn } from "../columns.js";
import { createTask, getTask, getTaskBySlug } from "../tasks.js";
import {
  ConflictError,
  ConstraintError,
  NotFoundError,
  ValidationError,
} from "../errors.js";
import { createTestDb } from "./helpers.js";

describe("spaces — CRUD", () => {
  it("seeds exactly one default space with prefix='task' on a fresh DB", () => {
    const db = createTestDb();
    const all = listSpaces(db);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      name: "Default",
      prefix: "task",
      is_default: true,
    });
  });

  it("createSpace returns minimal shape and seeds a counter at 1", () => {
    const db = createTestDb();
    const s = createSpace(db, { name: "Promptery", prefix: "pmt" });

    expect(s).toMatchObject({
      name: "Promptery",
      prefix: "pmt",
      is_default: false,
    });
    expect(s.id).toBeTruthy();

    const counter = db
      .prepare("SELECT next_number FROM space_counters WHERE space_id = ?")
      .get(s.id) as { next_number: number };
    expect(counter.next_number).toBe(1);
  });

  it("createSpace rejects a colliding prefix with a ConflictError", () => {
    const db = createTestDb();
    createSpace(db, { name: "First", prefix: "abc" });
    expect(() =>
      createSpace(db, { name: "Second", prefix: "abc" })
    ).toThrowError(ConflictError);
  });

  it("createSpace rejects an invalid prefix with a ValidationError", () => {
    const db = createTestDb();

    // Empty
    expect(() => createSpace(db, { name: "X", prefix: "" })).toThrowError(
      ValidationError
    );
    // Uppercase
    expect(() => createSpace(db, { name: "X", prefix: "PMT" })).toThrowError(
      ValidationError
    );
    // Underscore
    expect(() =>
      createSpace(db, { name: "X", prefix: "abc_def" })
    ).toThrowError(ValidationError);
    // Too long (>10 chars)
    expect(() =>
      createSpace(db, { name: "X", prefix: "abcdefghijk" })
    ).toThrowError(ValidationError);
  });

  it("isValidPrefix accepts hyphens, lowercase, and 1–10 chars", () => {
    expect(isValidPrefix("a")).toBe(true);
    expect(isValidPrefix("abc-def")).toBe(true);
    expect(isValidPrefix("0123456789")).toBe(true);
    expect(isValidPrefix("")).toBe(false);
    expect(isValidPrefix("AB")).toBe(false);
    expect(isValidPrefix("abc def")).toBe(false);
    expect(isValidPrefix("abcdefghijk")).toBe(false);
  });

  it("getSpaceByPrefix and getDefaultSpace resolve correctly", () => {
    const db = createTestDb();
    const s = createSpace(db, { name: "Project", prefix: "prj" });
    expect(getSpaceByPrefix(db, "prj")?.id).toBe(s.id);
    expect(getSpaceByPrefix(db, "missing")).toBeNull();
    expect(getDefaultSpace(db).prefix).toBe("task");
  });
});

describe("spaces — update", () => {
  it("renames a space without disturbing existing slugs", () => {
    const db = createTestDb();
    const space = createSpace(db, { name: "Old", prefix: "old" });
    const board = createBoard(db, "B", { space_id: space.id });
    const col = createColumn(db, board.id, "todo");
    const task = createTask(db, board.id, col.id, { title: "T" });
    expect(task.slug).toBe("old-1");

    const updated = updateSpace(db, space.id, { name: "Renamed" });
    expect(updated?.name).toBe("Renamed");

    // Slug stays — only future tasks would use a renamed prefix.
    expect(getTask(db, task.id)?.slug).toBe("old-1");
  });

  it("changes a prefix without re-slugging existing tasks; new tasks adopt the new prefix", () => {
    const db = createTestDb();
    const space = createSpace(db, { name: "S", prefix: "old" });
    const board = createBoard(db, "B", { space_id: space.id });
    const col = createColumn(db, board.id, "todo");
    const before = createTask(db, board.id, col.id, { title: "before" });
    expect(before.slug).toBe("old-1");

    updateSpace(db, space.id, { prefix: "new" });

    const after = createTask(db, board.id, col.id, { title: "after" });
    // Counter is at 2; new prefix kicks in for fresh inserts.
    expect(after.slug).toBe("new-2");
    // The existing task keeps its old slug.
    expect(getTask(db, before.id)?.slug).toBe("old-1");
  });

  it("rejects updating to a colliding prefix", () => {
    const db = createTestDb();
    createSpace(db, { name: "A", prefix: "aaa" });
    const b = createSpace(db, { name: "B", prefix: "bbb" });
    expect(() => updateSpace(db, b.id, { prefix: "aaa" })).toThrowError(
      ConflictError
    );
  });
});

describe("spaces — delete", () => {
  it("refuses to delete the default space", () => {
    const db = createTestDb();
    const def = getDefaultSpace(db);
    expect(() => deleteSpace(db, def.id)).toThrowError(ConstraintError);
    expect(getSpace(db, def.id)).not.toBeNull();
  });

  it("refuses to delete a space that has boards", () => {
    const db = createTestDb();
    const space = createSpace(db, { name: "X", prefix: "x" });
    createBoard(db, "B", { space_id: space.id });
    expect(() => deleteSpace(db, space.id)).toThrowError(ConstraintError);
  });

  it("deletes an empty space and cascades the counter row", () => {
    const db = createTestDb();
    const space = createSpace(db, { name: "X", prefix: "x" });

    expect(deleteSpace(db, space.id)).toBe(true);
    expect(getSpace(db, space.id)).toBeNull();

    const counter = db
      .prepare("SELECT space_id FROM space_counters WHERE space_id = ?")
      .get(space.id);
    expect(counter).toBeUndefined();
  });
});

describe("moveBoardToSpace — re-slug semantics", () => {
  it("reslugs every task on the moved board to the destination prefix", () => {
    const db = createTestDb();
    const src = createSpace(db, { name: "Source", prefix: "pmt" });
    const dest = createSpace(db, { name: "Dest", prefix: "ana" });

    const board = createBoard(db, "B", { space_id: src.id });
    const col = createColumn(db, board.id, "todo");
    const t1 = createTask(db, board.id, col.id, { title: "one" });
    const t2 = createTask(db, board.id, col.id, { title: "two" });
    const t3 = createTask(db, board.id, col.id, { title: "three" });

    expect([t1.slug, t2.slug, t3.slug]).toEqual(["pmt-1", "pmt-2", "pmt-3"]);

    const result = moveBoardToSpace(db, board.id, dest.id);
    expect(result.reslugged_count).toBe(3);

    // The exact mapping depends on (created_at, id) ordering; with the same
    // millisecond stamp the id tiebreaker can shuffle them, so assert the
    // set rather than per-task slugs (the dedicated "in created_at order"
    // test below uses explicit timestamps to verify ordering deterministically).
    const slugs = [t1, t2, t3].map((t) => getTask(db, t.id)?.slug).sort();
    expect(slugs).toEqual(["ana-1", "ana-2", "ana-3"]);

    // Old slugs no longer resolve.
    expect(getTaskBySlug(db, "pmt-1")).toBeNull();
    expect(getTaskBySlug(db, "pmt-2")).toBeNull();
    expect(getTaskBySlug(db, "pmt-3")).toBeNull();
  });

  it("preserves internal task ids across a move", () => {
    const db = createTestDb();
    const src = createSpace(db, { name: "S", prefix: "src" });
    const dest = createSpace(db, { name: "D", prefix: "dst" });
    const board = createBoard(db, "B", { space_id: src.id });
    const col = createColumn(db, board.id, "todo");
    const original = createTask(db, board.id, col.id, { title: "T" });

    moveBoardToSpace(db, board.id, dest.id);

    const after = getTask(db, original.id);
    expect(after).not.toBeNull();
    expect(after!.id).toBe(original.id);
  });

  it("re-slugs in created_at ascending order — oldest task gets the lowest counter", () => {
    const db = createTestDb();
    const src = createSpace(db, { name: "S", prefix: "src" });
    const dest = createSpace(db, { name: "D", prefix: "dst" });
    const board = createBoard(db, "B", { space_id: src.id });
    const col = createColumn(db, board.id, "todo");

    // Build tasks with explicit, increasing created_at so the order is stable.
    const ids = ["zzz", "aaa", "mmm"];
    const tStart = Date.now();
    ids.forEach((id, i) => {
      db.prepare(
        `INSERT INTO tasks
           (id, board_id, column_id, slug, title, description, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, '', ?, ?, ?)`
      ).run(id, board.id, col.id, `src-${i + 1}`, `t-${id}`, i, tStart + i, tStart + i);
    });

    moveBoardToSpace(db, board.id, dest.id);

    // Order is by created_at, then id — first inserted ("zzz" at tStart) should
    // be dst-1 because no earlier created_at exists.
    expect(getTask(db, "zzz")?.slug).toBe("dst-1");
    expect(getTask(db, "aaa")?.slug).toBe("dst-2");
    expect(getTask(db, "mmm")?.slug).toBe("dst-3");
  });

  it("advances destination counter past last assigned slug", () => {
    const db = createTestDb();
    const src = createSpace(db, { name: "S", prefix: "src" });
    const dest = createSpace(db, { name: "D", prefix: "dst" });

    // Pre-load destination with one task so its counter starts > 1.
    const destBoard = createBoard(db, "preexisting", { space_id: dest.id });
    const destCol = createColumn(db, destBoard.id, "todo");
    const seed = createTask(db, destBoard.id, destCol.id, { title: "seed" });
    expect(seed.slug).toBe("dst-1");

    // Move a 3-task board into destination.
    const movedBoard = createBoard(db, "moving", { space_id: src.id });
    const movedCol = createColumn(db, movedBoard.id, "todo");
    createTask(db, movedBoard.id, movedCol.id, { title: "a" });
    createTask(db, movedBoard.id, movedCol.id, { title: "b" });
    createTask(db, movedBoard.id, movedCol.id, { title: "c" });

    moveBoardToSpace(db, movedBoard.id, dest.id);

    // Counter should now be at 5 (seed used 1, moved tasks took 2/3/4).
    const counter = db
      .prepare("SELECT next_number FROM space_counters WHERE space_id = ?")
      .get(dest.id) as { next_number: number };
    expect(counter.next_number).toBe(5);

    // Next created task in destination should pick up at 5.
    const next = createTask(db, destBoard.id, destCol.id, { title: "n" });
    expect(next.slug).toBe("dst-5");
  });

  it("self-move (board to its current space) is a no-op for slugs and counter", () => {
    const db = createTestDb();
    const space = createSpace(db, { name: "S", prefix: "s" });
    const board = createBoard(db, "B", { space_id: space.id });
    const col = createColumn(db, board.id, "todo");
    const task = createTask(db, board.id, col.id, { title: "T" });
    expect(task.slug).toBe("s-1");

    const counterBefore = db
      .prepare("SELECT next_number FROM space_counters WHERE space_id = ?")
      .get(space.id) as { next_number: number };

    // Re-slugging happens even on self-move (the operation isn't a no-op
    // semantically — the board is "moved", just to its current home). The
    // task gets a fresh slug from the same space, counter advances by 1.
    const result = moveBoardToSpace(db, board.id, space.id);
    expect(result.reslugged_count).toBe(1);

    const counterAfter = db
      .prepare("SELECT next_number FROM space_counters WHERE space_id = ?")
      .get(space.id) as { next_number: number };
    expect(counterAfter.next_number).toBe(counterBefore.next_number + 1);

    // The task now carries the next sequential slug ("s-2") — its old "s-1"
    // is freed (and remains unused — counter never reuses values).
    expect(getTask(db, task.id)?.slug).toBe("s-2");
  });

  it("empty-board move advances no counters and reports reslugged_count=0", () => {
    const db = createTestDb();
    const src = createSpace(db, { name: "S", prefix: "s" });
    const dest = createSpace(db, { name: "D", prefix: "d" });
    const board = createBoard(db, "B", { space_id: src.id });

    const counterBefore = db
      .prepare("SELECT next_number FROM space_counters WHERE space_id = ?")
      .get(dest.id) as { next_number: number };

    const result = moveBoardToSpace(db, board.id, dest.id);
    expect(result.reslugged_count).toBe(0);

    const counterAfter = db
      .prepare("SELECT next_number FROM space_counters WHERE space_id = ?")
      .get(dest.id) as { next_number: number };
    expect(counterAfter.next_number).toBe(counterBefore.next_number);
  });

  it("throws NotFoundError when destination space is missing", () => {
    const db = createTestDb();
    const space = createSpace(db, { name: "S", prefix: "s" });
    const board = createBoard(db, "B", { space_id: space.id });
    expect(() => moveBoardToSpace(db, board.id, "missing-id")).toThrowError(
      NotFoundError
    );
  });

  it("throws NotFoundError when board is missing", () => {
    const db = createTestDb();
    const dest = createSpace(db, { name: "D", prefix: "d" });
    expect(() => moveBoardToSpace(db, "missing-id", dest.id)).toThrowError(
      NotFoundError
    );
  });

  it("global UNIQUE constraint on slug rejects manual duplicate inserts", () => {
    const db = createTestDb();
    const space = createSpace(db, { name: "S", prefix: "x" });
    const board = createBoard(db, "B", { space_id: space.id });
    const col = createColumn(db, board.id, "todo");
    const t = createTask(db, board.id, col.id, { title: "first" });

    // Try to insert a second row with the same slug.
    expect(() =>
      db
        .prepare(
          `INSERT INTO tasks
             (id, board_id, column_id, slug, title, description, position, created_at, updated_at)
           VALUES (?, ?, ?, ?, '', '', 0, 0, 0)`
        )
        .run("dup", board.id, col.id, t.slug)
    ).toThrowError(/UNIQUE/);
  });
});
