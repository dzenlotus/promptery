import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createBoard } from "../boards.js";
import { createColumn } from "../columns.js";
import { createTask } from "../tasks.js";
import {
  createReport,
  deleteReport,
  getReport,
  listReportsForTask,
  searchReports,
  updateReport,
} from "../agentReports.js";
import { createTestDb } from "./helpers.js";

interface SeedShape {
  db: Database.Database;
  taskA: string;
  taskB: string;
}

function seed(): SeedShape {
  const db = createTestDb();
  const board = createBoard(db, "Reports test board");
  const col = createColumn(db, board.id, "Backlog");
  const a = createTask(db, board.id, col.id, { title: "Task A" });
  const b = createTask(db, board.id, col.id, { title: "Task B" });
  return { db, taskA: a.id, taskB: b.id };
}

describe("agent reports — CRUD", () => {
  let s: SeedShape;
  beforeEach(() => {
    s = seed();
  });

  it("creates a report and reads it back", () => {
    const created = createReport(s.db, {
      task_id: s.taskA,
      kind: "investigation",
      title: "Auth crash root cause",
      content: "After the refactor, the JWT verifier swallows errors.",
      author: "claude-desktop",
    });
    expect(created.id).toMatch(/.+/);
    expect(created.task_id).toBe(s.taskA);
    expect(created.kind).toBe("investigation");

    const fetched = getReport(s.db, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.title).toBe("Auth crash root cause");
    expect(fetched?.author).toBe("claude-desktop");
    expect(fetched?.created_at).toBe(fetched?.updated_at);
  });

  it("listReportsForTask returns DESC by created_at and supports kind filter", async () => {
    // Stagger inserts so ORDER BY created_at DESC is deterministic. Date.now()
    // is ms-resolution so back-to-back synchronous inserts can share a
    // timestamp; a 2ms wait between writes guarantees strictly increasing
    // created_at values.
    const r1 = createReport(s.db, {
      task_id: s.taskA,
      kind: "investigation",
      title: "first",
      content: "c1",
    });
    await new Promise((r) => setTimeout(r, 2));
    const r2 = createReport(s.db, {
      task_id: s.taskA,
      kind: "plan",
      title: "second",
      content: "c2",
    });
    await new Promise((r) => setTimeout(r, 2));
    const r3 = createReport(s.db, {
      task_id: s.taskA,
      kind: "investigation",
      title: "third",
      content: "c3",
    });

    const all = listReportsForTask(s.db, s.taskA);
    expect(all.map((r) => r.id)).toEqual([r3.id, r2.id, r1.id]);

    const investigations = listReportsForTask(s.db, s.taskA, { kind: "investigation" });
    expect(investigations.map((r) => r.id)).toEqual([r3.id, r1.id]);

    expect(listReportsForTask(s.db, s.taskB)).toEqual([]);
  });

  it("updateReport bumps updated_at and only writes provided fields", async () => {
    const created = createReport(s.db, {
      task_id: s.taskA,
      kind: "memo",
      title: "Stale title",
      content: "Stale body",
    });

    // Force a clock tick before update so updated_at strictly grows.
    await new Promise((r) => setTimeout(r, 5));
    const updated = updateReport(s.db, created.id, { title: "Fresh title" });
    expect(updated).not.toBeNull();
    expect(updated?.title).toBe("Fresh title");
    expect(updated?.content).toBe("Stale body");
    expect(updated?.kind).toBe("memo");
    expect(updated!.updated_at).toBeGreaterThan(created.created_at);
  });

  it("updateReport returns null for unknown id", () => {
    expect(updateReport(s.db, "does-not-exist", { title: "x" })).toBeNull();
  });

  it("deleteReport removes the row", () => {
    const r = createReport(s.db, {
      task_id: s.taskA,
      kind: "summary",
      title: "Bye",
      content: "...",
    });
    expect(deleteReport(s.db, r.id)).toBe(true);
    expect(getReport(s.db, r.id)).toBeNull();
    // Idempotent — second delete reports false rather than throwing.
    expect(deleteReport(s.db, r.id)).toBe(false);
  });

  it("deleting the parent task cascades and removes its reports", () => {
    createReport(s.db, {
      task_id: s.taskA,
      kind: "investigation",
      title: "doomed",
      content: "...",
    });
    s.db.prepare("DELETE FROM tasks WHERE id = ?").run(s.taskA);
    const remaining = s.db
      .prepare("SELECT COUNT(*) AS c FROM agent_reports WHERE task_id = ?")
      .get(s.taskA) as { c: number };
    expect(remaining.c).toBe(0);
  });

  it("scopes reports per task — unrelated tasks are unaffected", () => {
    createReport(s.db, {
      task_id: s.taskA,
      kind: "memo",
      title: "A",
      content: "...",
    });
    createReport(s.db, {
      task_id: s.taskB,
      kind: "memo",
      title: "B",
      content: "...",
    });
    expect(listReportsForTask(s.db, s.taskA)).toHaveLength(1);
    expect(listReportsForTask(s.db, s.taskB)).toHaveLength(1);
  });
});

describe("agent reports — searchReports", () => {
  let s: SeedShape;
  beforeEach(() => {
    s = seed();
  });

  it("matches title tokens and joins task context", () => {
    const r = createReport(s.db, {
      task_id: s.taskA,
      kind: "investigation",
      title: "JWT verifier swallows errors",
      content: "Root cause for the auth crash.",
    });
    const hits = searchReports(s.db, "JWT");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.report.id).toBe(r.id);
    expect(hits[0]!.task.id).toBe(s.taskA);
    expect(hits[0]!.task.title).toBe("Task A");
  });

  it("matches content tokens", () => {
    const r = createReport(s.db, {
      task_id: s.taskB,
      kind: "analysis",
      title: "Plain title",
      content: "needle-in-haystack-token only lives here",
    });
    const hits = searchReports(s.db, "needle-in-haystack-token");
    expect(hits.map((h) => h.report.id)).toEqual([r.id]);
  });

  it("ranks title hits above content-only hits", () => {
    const titleHit = createReport(s.db, {
      task_id: s.taskA,
      kind: "investigation",
      title: "uniqueterm in title",
      content: "body without the term",
    });
    const contentHit = createReport(s.db, {
      task_id: s.taskB,
      kind: "investigation",
      title: "different headline",
      content: "the uniqueterm hides inside the body",
    });
    const hits = searchReports(s.db, "uniqueterm");
    // BM25 with weights (1.0, 5.0) = title weighted heavier; the title hit
    // should rank first.
    expect(hits.map((h) => h.report.id)).toEqual([titleHit.id, contentHit.id]);
  });

  it("returns empty for blank query and respects limit", () => {
    for (let i = 0; i < 5; i++) {
      createReport(s.db, {
        task_id: s.taskA,
        kind: "memo",
        title: `report ${i}`,
        content: "needle",
      });
    }
    expect(searchReports(s.db, "")).toEqual([]);
    expect(searchReports(s.db, "   ")).toEqual([]);
    expect(searchReports(s.db, "needle", 2)).toHaveLength(2);
  });

  it("survives FTS5-syntax-like inputs without throwing (escaped tokens)", () => {
    createReport(s.db, {
      task_id: s.taskA,
      kind: "memo",
      title: "regex* and quote\"  edge",
      content: "syntactic stress test",
    });
    // None of these should throw — escapeFtsQuery wraps tokens in quotes.
    expect(() => searchReports(s.db, 'regex*')).not.toThrow();
    expect(() => searchReports(s.db, 'quote" -minus +plus')).not.toThrow();
  });
});
