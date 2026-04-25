import { describe, it, expect } from "vitest";
import { createTestDb } from "./helpers/testDb.js";
import { makeBoard, makeColumn, makeTask } from "./helpers/factories.js";
import { runFTSMigration } from "../migrations.js";

describe("FTS5 migration backfill", () => {
  it("backfills tasks_fts from existing tasks when migration runs", () => {
    // Step 1: snapshot the world as it looked on 0.2.1 — schema + migrations
    // up to 007, no FTS table yet.
    const { db, close } = createTestDb({ includeFTS: false });

    // Sanity: the FTS virtual table really does not exist yet.
    expect(() => db.prepare("SELECT * FROM tasks_fts").all()).toThrow();

    // Step 2: insert tasks the way users on 0.2.1 already had them.
    const board = makeBoard(db, { name: "Legacy" });
    const col = makeColumn(db, { board_id: board.id, name: "Pre-FTS" });
    const t1 = makeTask(db, {
      column_id: col.id,
      number: 1,
      title: "pre-existing task",
      description: "should be searchable after migration",
    });
    const t2 = makeTask(db, {
      column_id: col.id,
      number: 2,
      title: "another legacy item",
      description: "needle-in-haystack-token",
    });

    // Step 3: run the FTS migration in isolation.
    runFTSMigration(db);

    // Step 4: pre-existing rows are now indexed and findable.
    const allFts = db.prepare("SELECT task_id FROM tasks_fts").all() as {
      task_id: string;
    }[];
    expect(new Set(allFts.map((r) => r.task_id))).toEqual(new Set([t1.id, t2.id]));

    const titleHit = db
      .prepare("SELECT task_id FROM tasks_fts WHERE tasks_fts MATCH ?")
      .all('"pre-existing"') as { task_id: string }[];
    expect(titleHit.map((r) => r.task_id)).toEqual([t1.id]);

    const descHit = db
      .prepare("SELECT task_id FROM tasks_fts WHERE tasks_fts MATCH ?")
      .all('"needle-in-haystack-token"') as { task_id: string }[];
    expect(descHit.map((r) => r.task_id)).toEqual([t2.id]);

    close();
  });

  it("is idempotent — re-running the migration does not double-insert", () => {
    const { db, close } = createTestDb({ includeFTS: false });
    const board = makeBoard(db);
    const col = makeColumn(db, { board_id: board.id });
    makeTask(db, { column_id: col.id, number: 1, title: "duplicate guard" });

    runFTSMigration(db);
    // Second invocation — clear the bookkeeping row first so the migration
    // would re-run if the body weren't idempotent. The backfill uses
    // `WHERE id NOT IN (SELECT task_id FROM tasks_fts)` so it should still
    // be a no-op.
    db.exec("DELETE FROM _migrations WHERE name = '008_tasks_fts'");
    expect(() => runFTSMigration(db)).not.toThrow();

    const cnt = db
      .prepare("SELECT COUNT(*) AS c FROM tasks_fts WHERE title = 'duplicate guard'")
      .get() as { c: number };
    expect(cnt.c).toBe(1);

    close();
  });

  it("post-migration triggers fire on new INSERTs (sync resumes)", () => {
    const { db, close } = createTestDb({ includeFTS: false });
    runFTSMigration(db);

    const board = makeBoard(db);
    const col = makeColumn(db, { board_id: board.id });
    makeTask(db, { column_id: col.id, number: 1, title: "post-migration" });

    const hits = db
      .prepare("SELECT task_id FROM tasks_fts WHERE tasks_fts MATCH ?")
      .all('"post-migration"');
    expect(hits).toHaveLength(1);

    close();
  });
});
