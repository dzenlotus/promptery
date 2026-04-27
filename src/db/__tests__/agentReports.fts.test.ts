import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { createTestDb } from "./helpers/testDb.js";
import { makeBoard, makeColumn, makeTask } from "./helpers/factories.js";
import { runAgentReportsMigration } from "../migrations.js";

/**
 * Build a DB that has every prior migration applied but NOT 017 — so we can
 * exercise the agent_reports backfill in isolation. We reuse `createTestDb`
 * for the prior schema, then drop the agent_reports + FTS bits and the
 * migration bookkeeping row so `runAgentReportsMigration` re-applies them.
 */
function makePre017Db(): { db: Database.Database; close: () => void } {
  const { db, close } = createTestDb();
  db.exec(
    "DROP TRIGGER IF EXISTS agent_reports_fts_insert; " +
      "DROP TRIGGER IF EXISTS agent_reports_fts_update; " +
      "DROP TRIGGER IF EXISTS agent_reports_fts_delete; " +
      "DROP TABLE IF EXISTS agent_reports_fts; " +
      "DROP TABLE IF EXISTS agent_reports; " +
      "DELETE FROM _migrations WHERE name = '017_agent_reports';"
  );
  return { db, close };
}

describe("agent_reports FTS5 — schema + triggers", () => {
  it("triggers keep agent_reports_fts in sync with agent_reports", () => {
    const { db, close } = createTestDb();
    const board = makeBoard(db);
    const col = makeColumn(db, { board_id: board.id });
    const task = makeTask(db, { column_id: col.id });

    const id = nanoid();
    const now = Date.now();
    db.prepare(
      `INSERT INTO agent_reports (id, task_id, kind, title, content, author, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, task.id, "investigation", "search-me-title", "search-me-content body", null, now, now);

    // Insert trigger fired.
    const after = db
      .prepare("SELECT report_id, title, content FROM agent_reports_fts WHERE report_id = ?")
      .get(id) as { report_id: string; title: string; content: string };
    expect(after.title).toBe("search-me-title");
    expect(after.content).toBe("search-me-content body");

    // Update trigger keeps the index aligned with new title/content.
    db.prepare(
      "UPDATE agent_reports SET title = ?, content = ?, updated_at = ? WHERE id = ?"
    ).run("renamed-title", "renamed-content", now + 1, id);
    const refreshed = db
      .prepare("SELECT title, content FROM agent_reports_fts WHERE report_id = ?")
      .get(id) as { title: string; content: string };
    expect(refreshed.title).toBe("renamed-title");
    expect(refreshed.content).toBe("renamed-content");

    // Delete trigger removes the FTS row alongside the source row.
    db.prepare("DELETE FROM agent_reports WHERE id = ?").run(id);
    const gone = db
      .prepare("SELECT COUNT(*) AS c FROM agent_reports_fts WHERE report_id = ?")
      .get(id) as { c: number };
    expect(gone.c).toBe(0);

    close();
  });

  it("cascades on task delete — reports and their FTS rows go away", () => {
    const { db, close } = createTestDb();
    const board = makeBoard(db);
    const col = makeColumn(db, { board_id: board.id });
    const task = makeTask(db, { column_id: col.id });

    const id = nanoid();
    const now = Date.now();
    db.prepare(
      `INSERT INTO agent_reports (id, task_id, kind, title, content, author, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, task.id, "memo", "doomed", "...", null, now, now);

    db.prepare("DELETE FROM tasks WHERE id = ?").run(task.id);

    const reports = db
      .prepare("SELECT COUNT(*) AS c FROM agent_reports")
      .get() as { c: number };
    const fts = db
      .prepare("SELECT COUNT(*) AS c FROM agent_reports_fts")
      .get() as { c: number };
    expect(reports.c).toBe(0);
    expect(fts.c).toBe(0);

    close();
  });
});

describe("agent_reports migration backfill", () => {
  it("backfills agent_reports_fts from existing agent_reports rows", () => {
    const { db, close } = makePre017Db();
    const board = makeBoard(db);
    const col = makeColumn(db, { board_id: board.id });
    const task = makeTask(db, { column_id: col.id });

    // Reconstruct the table without the FTS bits so we can pre-seed rows
    // that look like they pre-existed migration 017.
    db.exec(
      `CREATE TABLE agent_reports (
         id TEXT PRIMARY KEY,
         task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
         kind TEXT NOT NULL,
         title TEXT NOT NULL,
         content TEXT NOT NULL,
         author TEXT,
         created_at INTEGER NOT NULL,
         updated_at INTEGER NOT NULL
       )`
    );
    const now = Date.now();
    const r1 = nanoid();
    const r2 = nanoid();
    db.prepare(
      `INSERT INTO agent_reports (id, task_id, kind, title, content, author, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(r1, task.id, "investigation", "preexisting one", "before migration", null, now, now);
    db.prepare(
      `INSERT INTO agent_reports (id, task_id, kind, title, content, author, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(r2, task.id, "memo", "preexisting two", "needle-in-haystack-token", null, now, now);

    expect(() => db.prepare("SELECT * FROM agent_reports_fts").all()).toThrow();

    runAgentReportsMigration(db);

    const ftsRows = db
      .prepare("SELECT report_id FROM agent_reports_fts ORDER BY report_id")
      .all() as { report_id: string }[];
    expect(new Set(ftsRows.map((r) => r.report_id))).toEqual(new Set([r1, r2]));

    const titleHit = db
      .prepare(
        "SELECT report_id FROM agent_reports_fts WHERE agent_reports_fts MATCH ?"
      )
      .all('"preexisting"') as { report_id: string }[];
    expect(new Set(titleHit.map((r) => r.report_id))).toEqual(new Set([r1, r2]));

    const contentHit = db
      .prepare(
        "SELECT report_id FROM agent_reports_fts WHERE agent_reports_fts MATCH ?"
      )
      .all('"needle-in-haystack-token"') as { report_id: string }[];
    expect(contentHit.map((r) => r.report_id)).toEqual([r2]);

    close();
  });

  it("is idempotent — re-running does not double-insert", () => {
    const { db, close } = makePre017Db();
    const board = makeBoard(db);
    const col = makeColumn(db, { board_id: board.id });
    const task = makeTask(db, { column_id: col.id });

    runAgentReportsMigration(db);

    const id = nanoid();
    const now = Date.now();
    db.prepare(
      `INSERT INTO agent_reports (id, task_id, kind, title, content, author, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, task.id, "summary", "duplicate guard", "body", null, now, now);

    db.exec("DELETE FROM _migrations WHERE name = '017_agent_reports'");
    expect(() => runAgentReportsMigration(db)).not.toThrow();

    const cnt = db
      .prepare("SELECT COUNT(*) AS c FROM agent_reports_fts WHERE title = 'duplicate guard'")
      .get() as { c: number };
    expect(cnt.c).toBe(1);

    close();
  });
});
